// The rogue (docs/classes/rogue.md): its rows and poisons against the Forever client data, its
// talents against the client's curves, the worked examples (§9), what the engine does with Energy,
// combo points, poisons and dual wield, the Combat priority list, a golden run and determinism.
import { describe, expect, it } from 'vitest'
import itemsJson from '@/data/client/items.json'
import preBisJson from '@/data/items/pre-bis.json'
import type { ItemData } from '@/data/items/types'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpells, ClientTalents } from '@/data/client/types'
import { CRIT_MULTIPLIER } from '../../core/formulas'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { BUFFS_BY_ID } from '../../effects/buffs'
import { catalogueEffects } from '../../effects/types'
import { fitsSlot } from '../../equip'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { FIELD, Sim } from '../../engine/sim'
import { alwaysLandNoCrit, counter, damages, expectMean, setAttackPower, timeline } from '../../engine/test-helpers'
import { buildPlan } from '../../plan/build'
import { ACTION, type AbilityDef, COND, type Plan, TRIGGER_COUNT } from '../../plan/types'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import { FOREVER } from '../../rules/profiles'
import type { SimConfig } from '../../types'
import { talentRanksByName } from '../index'
import {
  ADRENALINE_RUSH,
  BACKSTAB,
  BASE_MAX_ENERGY_TENTHS,
  BLADE_FLURRY,
  COLD_BLOOD,
  ENERGY_PER_TICK_TENTHS,
  EVISCERATE,
  EXPOSE_ARMOR,
  EXPOSE_ARMOR_PER_CP,
  MUTILATE,
  ROGUE_GCD_MS,
  RUPTURE,
  SINISTER_STRIKE,
  SLICE_AND_DICE,
  SLICE_AND_DICE_HASTE,
  THISTLE_TEA,
  VENOM,
  VIGOR_TENTHS_PER_RANK,
} from './abilities'
import { assassinationMaintainedBuffs, assassinationRotation } from './assassination'
import { COMBAT_OPTIONS, combatMaintainedBuffs, combatRotation } from './combat'
import {
  IMPROVED_SLICE_AND_DICE_PER_RANK,
  PUNCTURING_WOUNDS_CP_PER_RANK,
  RELENTLESS_STRIKES_ENERGY_TENTHS,
  RELENTLESS_STRIKES_PER_CP,
  RUTHLESSNESS_PER_RANK,
  SEAL_FATE_PER_RANK,
  withRogueTalents,
} from './modifiers'
import { rogueEnergy } from './setup'
import { ROGUE_TALENT_EFFECTS } from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const preBis = (preBisJson as unknown as ItemData).items
const clientTalents = (talentsJson as unknown as ClientTalents).classes.rogue.talents
const consumables = (itemsJson as unknown as { consumables: Record<string, { effects: { spellId: number; coolDownMSec: number }[] }> }).consumables
const spell = (id: number) => spells[String(id)]
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
const energyCost = (id: number) => (spell(id).power ?? []).find((p) => p.powerType === 3)?.manaCost ?? 0
const curve = (name: string, index = 0) => clientTalents.find((t) => t.name === name)!.rankEffects.find((r) => r.effectIndex === index)!.values
const COMBAT = talentRanksByName(TALENT_DATA.rogue, defaultConfig('rogue-combat').talents)
const ASSASSINATION = talentRanksByName(TALENT_DATA.rogue, defaultConfig('rogue-assassination').talents)
const ranks = (entries: [string, number][]) => new Map(entries)

describe('rows against the Forever client (rogue.md §3)', () => {
  it('Sinister Strike, Backstab: costs, GCD, weapon shares and flat bonuses', () => {
    expect(SINISTER_STRIKE.costTenths).toBe(10 * energyCost(11294))
    expect(spell(11294).cooldowns?.startRecoveryTime).toBe(ROGUE_GCD_MS)
    expect(effect(11294, 0).effect).toBe(121) // NORMALIZED_WEAPON_DMG
    expect(SINISTER_STRIKE.normalized).toBe(true)
    expect(SINISTER_STRIKE.flatDamage).toBe(effect(11294, 0).effectBasePointsF)
    expect(effect(11294, 1).effect).toBe(30) // ENERGIZE combo points
    expect(BACKSTAB.costTenths).toBe(10 * energyCost(25300))
    expect(BACKSTAB.flatDamage).toBe(effect(25300, 0).effectBasePointsF)
    expect(BACKSTAB.weaponPercent).toBe(effect(25300, 1).effectBasePointsF! / 100)
    expect(BACKSTAB.behindOnly).toBe(true)
  })

  it('Eviscerate, Slice and Dice, Rupture, Expose Armor: costs, per-point values and times', () => {
    const evisc = effect(31016, 0)
    expect(EVISCERATE.costTenths).toBe(10 * energyCost(31016))
    expect(EVISCERATE.flatDamage).toBe(evisc.effectBasePointsF! * (1 - evisc.variance! / 2))
    expect(EVISCERATE.flatDamageRange).toBe(evisc.effectBasePointsF! * evisc.variance!)
    expect(EVISCERATE.damagePerComboPoint).toBe(evisc.effectPointsPerResource)
    expect(SLICE_AND_DICE.costTenths).toBe(10 * energyCost(6774))
    expect(effect(6774, 1).effectAura).toBe(319)
    expect(SLICE_AND_DICE_HASTE).toBe(effect(6774, 1).effectBasePointsF)
    expect(SLICE_AND_DICE.aura!.durationMs).toBe(spell(6774).duration!.duration)
    expect(SLICE_AND_DICE.auraMsPerComboPoint).toBe(spell(6774).duration!.durationPerResource)
    const rupture = effect(11275, 0)
    expect(RUPTURE.costTenths).toBe(10 * energyCost(11275))
    expect([RUPTURE.dotTickDamage, RUPTURE.dotTickPerComboPoint, RUPTURE.dotTickMs]).toEqual([rupture.effectBasePointsF, rupture.effectPointsPerResource, rupture.effectAuraPeriod])
    // 6 s + 2 s per point at a tick every 2 s: 3 ticks + 1 per point.
    expect(RUPTURE.dotTicks * RUPTURE.dotTickMs).toBe(spell(11275).duration!.duration)
    expect(RUPTURE.dotTicksPerComboPoint! * RUPTURE.dotTickMs).toBe(spell(11275).duration!.durationPerResource)
    expect(RUPTURE.periodicCanCrit).toBe(((spell(11275).misc!.attributes![8] ?? 0) & 0x200) !== 0)
    expect(EXPOSE_ARMOR.costTenths).toBe(10 * energyCost(11198))
    expect(-effect(11198, 0).effectPointsPerResource!).toBe(EXPOSE_ARMOR_PER_CP)
    expect(EXPOSE_ARMOR.aura!.durationMs).toBe(spell(11198).duration!.duration)
  })

  it('Blade Flurry, Adrenaline Rush, Cold Blood and Thistle Tea', () => {
    expect([BLADE_FLURRY.costTenths, BLADE_FLURRY.cooldownMs, BLADE_FLURRY.aura!.durationMs, BLADE_FLURRY.aura!.mods.haste]).toEqual([
      10 * energyCost(13877),
      spell(13877).cooldowns!.recoveryTime,
      spell(13877).duration!.duration,
      effect(13877, 0).effectBasePointsF,
    ])
    expect(BLADE_FLURRY.gcdMs).toBe(spell(13877).cooldowns!.startRecoveryTime)
    expect(effect(13750, 0).effectAura).toBe(110)
    expect([ADRENALINE_RUSH.cooldownMs, ADRENALINE_RUSH.aura!.durationMs, ADRENALINE_RUSH.aura!.mods.energyRegen, ADRENALINE_RUSH.gcdMs]).toEqual([
      spell(13750).cooldowns!.recoveryTime,
      spell(13750).duration!.duration,
      effect(13750, 0).effectBasePointsF,
      spell(13750).cooldowns!.startRecoveryTime,
    ])
    expect(COLD_BLOOD.cooldownMs).toBe(spell(14177).cooldowns!.recoveryTime)
    expect(COLD_BLOOD.gcdMs).toBe(spell(14177).cooldowns?.startRecoveryTime ?? 0)
    expect(effect(14177, 0).effectBasePointsF).toBe(100)
    // Thistle Tea: item 7676 → 9512, +100 Energy (power 3), the item's 5 min.
    expect(effect(9512, 0).effectMiscValue?.[0]).toBe(3)
    expect(THISTLE_TEA.rageTenths).toBe(10 * effect(9512, 0).effectBasePointsF!)
    const tea = consumables['7676'].effects[0]
    expect([tea.spellId, tea.coolDownMSec]).toEqual([9512, THISTLE_TEA.cooldownMs])
  })

  it('Mutilate and Venom: costs, strikes, points, the poisoned bonus and Venom’s times and mods', () => {
    // 1241584: energize 2 points, a strike per hand (1241586, 1241590), +20% against the poisoned.
    expect(MUTILATE.costTenths).toBe(10 * energyCost(1241584))
    expect(MUTILATE.comboPoints).toBe(effect(1241584, 0).effectBasePointsF)
    expect([effect(1241584, 1).effectTriggerSpell, effect(1241584, 2).effectTriggerSpell]).toEqual([1241586, 1241590])
    expect(MUTILATE.poisonedTargetPct).toBe(effect(1241584, 3).effectBasePointsF)
    for (const id of [1241586, 1241590]) {
      expect(effect(id, 0).effect).toBe(121) // NORMALIZED_WEAPON_DMG
      expect(MUTILATE.flatDamage).toBe(effect(id, 0).effectBasePointsF)
      expect(MUTILATE.weaponPercent).toBe(effect(id, 1).effectBasePointsF! / 100)
    }
    expect([MUTILATE.normalized, MUTILATE.offHand]).toEqual([true, true])
    expect(VENOM.costTenths).toBe(10 * energyCost(1310703))
    expect(VENOM.finisher).toBe(true)
    expect(VENOM.aura!.durationMs).toBe(spell(1310703).duration!.duration)
    expect(VENOM.auraMsPerComboPoint).toBe(spell(1310703).duration!.durationPerResource)
    // Aura 108 (percent modifier) 30 on the poisons' damage and their ticks; 107 (flat) 10 on their chance.
    expect([effect(1310703, 1).effectAura, effect(1310703, 2).effectAura, effect(1310703, 3).effectAura]).toEqual([108, 108, 107])
    expect(VENOM.aura!.mods.poisonDamage).toBe(effect(1310703, 1).effectBasePointsF)
    expect(VENOM.aura!.mods.poisonDamage).toBe(effect(1310703, 2).effectBasePointsF)
    expect(VENOM.aura!.mods.poisonChance).toBe(effect(1310703, 3).effectBasePointsF)
  })

  it('the poisons: Instant Poison VI’s 20% for 76–100, Deadly Poison V’s 30% for 23 a stack, 5 stacks, every 3 s for 12 s', () => {
    const instant = catalogueEffects(BUFFS_BY_ID.get('instantPoisonMainHand')!, FOREVER)[0]
    const deadly = catalogueEffects(BUFFS_BY_ID.get('deadlyPoisonOffHand')!, FOREVER)[0]
    if (instant.kind !== 'tempEnchant' || deadly.kind !== 'tempEnchant') throw new Error('poisons are temporary enchants')
    expect([instant.hand, deadly.hand]).toEqual(['main', 'off'])
    const ip = instant.proc!
    const dp = deadly.proc!
    expect(consumables['8928'].effects[0].spellId).toBe(11340)
    expect(consumables['20844'].effects[0].spellId).toBe(25351)
    expect('pct' in ip.chance && ip.chance.pct).toBe(spell(11340).auraOptions!.procChance)
    expect('pct' in dp.chance && dp.chance.pct).toBe(spell(25351).auraOptions!.procChance)
    const hit = effect(11337, 0)
    if (ip.action.kind !== 'spellDamage' || dp.action.kind !== 'stackingDot') throw new Error('poison actions')
    expect([ip.action.min, ip.action.max]).toEqual([Math.round(hit.effectBasePointsF! * (1 - hit.variance! / 2)), Math.round(hit.effectBasePointsF! * (1 + hit.variance! / 2))])
    const tick = effect(25349, 0)
    expect([dp.action.tick, dp.action.periodMs, dp.action.durationMs, dp.action.maxStacks]).toEqual([
      tick.effectBasePointsF,
      tick.effectAuraPeriod,
      spell(25349).duration!.duration,
      spell(25349).auraOptions!.cumulativeAura,
    ])
    expect(dp.action.periodicCanCrit).toBe(((spell(25349).misc!.attributes![8] ?? 0) & 0x200) !== 0)
    expect([ip.poison, dp.poison]).toEqual([true, true])
  })
})

describe('talents against the client’s curves (rogue.md §5)', () => {
  it('passives: Malice, Precision, Dual Wield Specialization, Hack and Slash, Weapon Expertise, Murder, the poisons’, Serrated Blades', () => {
    const at = (name: string, rank: number) => ROGUE_TALENT_EFFECTS[name](rank)
    expect(at('Malice', 5)).toEqual([
      { kind: 'stat', stat: 'crit', value: curve('Malice')[4] },
      { kind: 'stat', stat: 'spellCrit', value: curve('Malice')[4] },
    ])
    expect(at('Precision', 3)).toEqual([
      { kind: 'stat', stat: 'hit', value: curve('Precision', 0)[2] },
      { kind: 'stat', stat: 'spellHit', value: curve('Precision', 1)[2] },
    ])
    expect(at('Dual Wield Specialization', 5)).toEqual([{ kind: 'offHand', damagePct: curve('Dual Wield Specialization')[4] }])
    const hs = at('Hack and Slash', 5)
    expect(hs[0]).toEqual({ kind: 'weaponCrit', value: curve('Hack and Slash', 2)[4], weapons: ['dagger', 'fist'] })
    expect(hs[1]).toEqual({ kind: 'weaponArmorPenPct', pct: curve('Hack and Slash', 1)[4], weapons: ['mace'] })
    expect(hs[2].kind === 'proc' && hs[2].proc.chance).toEqual({ pct: curve('Hack and Slash', 0)[4] })
    expect(hs[2].kind === 'proc' && hs[2].proc.icdMs).toBe(spell(13960).auraOptions!.procCategoryRecovery)
    expect(at('Weapon Expertise', 2)).toEqual([{ kind: 'stat', stat: 'expertise', value: curve('Weapon Expertise')[1] }])
    expect(at('Murder', 2)[0]).toMatchObject({ kind: 'damage', pct: curve('Murder')[1] })
    expect(at('Vile Poisons', 5)).toEqual([{ kind: 'poisonDamage', pct: curve('Vile Poisons', 0)[4] }])
    expect(curve('Vile Poisons', 1)[4]).toBe(curve('Vile Poisons', 0)[4])
    expect(at('Improved Poisons', 5)).toEqual([{ kind: 'poisonChance', pct: curve('Improved Poisons', 0)[4] }])
    expect(at('Serrated Blades', 3)).toEqual([{ kind: 'weaponArmorPenPct', pct: curve('Serrated Blades', 0)[2] }])
    expect(rogueEnergy(ranks([['Vigor', 2]])).maxTenths).toBe(BASE_MAX_ENERGY_TENTHS + 10 * curve('Vigor')[1])
    expect(VIGOR_TENTHS_PER_RANK).toBe(10 * curve('Vigor')[0])
  })

  it('modifiers: costs, damage, Lethality, crit, combo points, Relentless Strikes, Ruthlessness, Improved Slice and Dice', () => {
    const t = ranks([
      ['Improved Sinister Strike', 2],
      ['Flawless Execution', 1],
      ['Improved Expose Armor', 2],
      ['Improved Eviscerate', 3],
      ['Aggression', 3],
      ['Opportunity', 2],
      ['Lethality', 5],
      ['Puncturing Wounds', 3],
      ['Seal Fate', 5],
      ['Relentless Strikes', 1],
      ['Ruthlessness', 3],
      ['Improved Slice and Dice', 3],
      ['Serrated Blades', 3],
    ])
    expect(withRogueTalents(SINISTER_STRIKE, t).costTenths).toBe(SINISTER_STRIKE.costTenths + 10 * curve('Improved Sinister Strike')[1])
    expect(withRogueTalents(EVISCERATE, t).costTenths).toBe(EVISCERATE.costTenths + 10 * effect(1310711, 0).effectBasePointsF!)
    expect(withRogueTalents(EXPOSE_ARMOR, t).costTenths).toBe(EXPOSE_ARMOR.costTenths + 10 * curve('Improved Expose Armor', 0)[1])
    expect(withRogueTalents(EXPOSE_ARMOR, t).comboPointsBackAtFive).toBe(curve('Improved Expose Armor', 1)[1])
    const evisc = withRogueTalents(EVISCERATE, t)
    expect(evisc.damagePerComboPoint).toBeCloseTo(170 * (1 + curve('Improved Eviscerate')[2] / 100) * (1 + curve('Aggression')[2] / 100), 9)
    expect(withRogueTalents(BACKSTAB, t).weaponPercent).toBeCloseTo(1.5 * 1.06 * (1 + curve('Opportunity', 0)[1] / 100), 12)
    expect(withRogueTalents(SINISTER_STRIKE, t).critMultiplier).toBeCloseTo(1 + (CRIT_MULTIPLIER.melee - 1) * (1 + curve('Lethality')[4] / 100), 12)
    expect(withRogueTalents(EVISCERATE, t).critMultiplier).toBe(CRIT_MULTIPLIER.melee)
    expect(withRogueTalents(BACKSTAB, t).bonusCrit).toBe(curve('Puncturing Wounds', 0)[2])
    expect(withRogueTalents(BACKSTAB, t).bonusComboPointChance).toBeCloseTo(curve('Puncturing Wounds', 1)[2] / 100, 12)
    expect(PUNCTURING_WOUNDS_CP_PER_RANK * 100).toBeCloseTo(curve('Puncturing Wounds', 1)[0], 12)
    expect(withRogueTalents(SINISTER_STRIKE, t).critComboPointChance).toBe(1)
    expect(SEAL_FATE_PER_RANK * 100).toBe(curve('Seal Fate')[0])
    expect(withRogueTalents(EVISCERATE, t).finisherEnergyChancePerCp).toBe(RELENTLESS_STRIKES_PER_CP)
    expect(RELENTLESS_STRIKES_PER_CP * 100).toBe(effect(14179, 0).effectPointsPerResource)
    expect(RELENTLESS_STRIKES_ENERGY_TENTHS).toBe(10 * effect(14181, 0).effectBasePointsF!)
    expect(withRogueTalents(SLICE_AND_DICE, t).finisherComboPointChance).toBeCloseTo(curve('Ruthlessness')[2] / 100, 12)
    expect(RUTHLESSNESS_PER_RANK * 100).toBe(curve('Ruthlessness')[0])
    expect(IMPROVED_SLICE_AND_DICE_PER_RANK).toBe(curve('Improved Slice and Dice')[0])
    expect(withRogueTalents(RUPTURE, t).dotTickDamage).toBeCloseTo(35 * (1 + curve('Serrated Blades', 1)[2] / 100), 9)
    // Cold Blood's crit only with the talent.
    expect(withRogueTalents(SINISTER_STRIKE, t).auraCrit).toBeUndefined()
    expect(withRogueTalents(SINISTER_STRIKE, ranks([['Cold Blood', 1]])).auraCrit).toEqual({ aura: 'coldBlood', pct: 100, consume: true })
  })

  it('Relentless Strikes and Ruthlessness act on every finisher 14179’s class mask names, Venom included (RG1)', () => {
    const mask = effect(14179, 0).effectSpellClassMask!
    const inMask = (id: number) => spell(id).classOptions!.spellClassMask!.some((word, i) => (word & mask[i]) !== 0)
    const t = ranks([
      ['Relentless Strikes', 1],
      ['Ruthlessness', 3],
    ])
    const rows: [AbilityDef, number][] = [
      [EVISCERATE, 31016],
      [SLICE_AND_DICE, 6774],
      [RUPTURE, 11275],
      [EXPOSE_ARMOR, 11198],
      [VENOM, 1310703],
      [SINISTER_STRIKE, 11294],
      [BACKSTAB, 25300],
      [MUTILATE, 1241584],
    ]
    for (const [def, id] of rows) {
      const resolved = withRogueTalents(def, t)
      expect([def.id, resolved.finisherEnergyChancePerCp ?? 0]).toEqual([def.id, inMask(id) ? RELENTLESS_STRIKES_PER_CP : 0])
      expect([def.id, resolved.finisherComboPointChance ?? 0]).toEqual([def.id, inMask(id) ? 3 * RUTHLESSNESS_PER_RANK : 0])
    }
    expect(inMask(1310703)).toBe(true)
    // Ruthlessness has no mask of its own ("finishing moves"); Venom's first four attribute words,
    // costs and categories are Slice and Dice's.
    expect(spell(14156).effects[0].effectSpellClassMask ?? [0, 0, 0, 0]).toEqual([0, 0, 0, 0])
    const finisherRows = (id: number) => [spell(id).misc!.attributes!.slice(0, 4), spell(id).power, spell(id).categories]
    expect(finisherRows(1310703)).toEqual(finisherRows(6774))
    // The Assassination build's Venom carries both.
    const on = { ...defaultConfig('rogue-assassination') }
    on.rotation = { ...on.rotation, 'rogue.assassination.venom.enabled': true }
    const venom = buildPlan(on).plan.abilities.find((a) => a.id === 'venom')!
    expect(venom.finisherEnergyChancePerCp).toBe(RELENTLESS_STRIKES_PER_CP)
    expect(venom.finisherComboPointChance).toBeGreaterThan(0)
  })
})

/** A plan with no procs and no armor: abilities and white swings only, for the worked examples. */
function quiet(config: SimConfig): Plan {
  const plan = buildPlan(config).plan
  plan.procs = []
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.fight.targetArmor = 0
  plan.damageMult = 1
  plan.physicalMult = 1
  return plan
}

/** The Combat rogue with only these settings on (every toggle off, then these). */
function combatWith(on: Record<string, boolean | number>): SimConfig {
  const base = defaultConfig('rogue-combat')
  const off = Object.fromEntries(COMBAT_OPTIONS.filter((o) => o.kind === 'toggle').map((o) => [o.id, false]))
  return { ...base, buffs: { ...base.buffs, enabled: [] }, rotation: { ...off, ...on } }
}
const row = (plan: Plan, id: string) => plan.sources.findIndex((s) => s.id === id)

describe('worked examples (rogue.md §9)', () => {
  it('R1: Sinister Strike, a 100–150 one-hander at 1,000 AP, 386.3 on average; ×2.2 on a crit', () => {
    const plan = quiet(combatWith({}))
    plan.weapons[0] = { ...plan.weapons[0]!, min: 100, max: 150, flatDamage: 0 }
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1000)
    expectMean(damages(plan, row(plan, 'sinisterStrike'), 20), (125 + (1000 / 14) * 2.4 + 68) * 1.06)
    expect(plan.abilities.find((a) => a.id === 'sinisterStrike')!.critMultiplier).toBeCloseTo(2.2, 12)
  })

  it('R2: Backstab with Aggression 3/3 and Opportunity 2/2, a 60–110 dagger at 1,000 AP: 623.4', () => {
    const bs = withRogueTalents(BACKSTAB, ranks([['Aggression', 3], ['Opportunity', 2]]))
    expect(bs.weaponPercent * (85 + (1000 / 14) * 1.7 + bs.flatDamage)).toBeCloseTo(623.39, 1)
  })

  it('R3: a 5-point Eviscerate at 1,000 AP, 1,340.7 to 1,478.1 (1,409.4 on average)', () => {
    const plan = quiet(combatWith({ 'rogue.combat.eviscerate.enabled': true }))
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1000)
    const hits = damages(plan, row(plan, 'eviscerate'), 20)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(1340.6)
    expect(Math.max(...hits)).toBeLessThanOrEqual(1478.1)
    expectMean(hits, 1.272 * (108 + 850 + 150))
  })

  it('R4: Slice and Dice with Improved Slice and Dice 3/3, 17.4 s at 2 points and 30.45 s at 5', () => {
    const snd = withRogueTalents(SLICE_AND_DICE, COMBAT)
    expect(snd.aura!.durationMs + 2 * snd.auraMsPerComboPoint!).toBe(17400)
    expect(snd.aura!.durationMs + 5 * snd.auraMsPerComboPoint!).toBe(30450)
  })

  it('R5: a 5-point Rupture at 1,000 AP, 8 ticks of 88.65: 709.2', () => {
    const plan = quiet(combatWith({ 'rogue.combat.rupture.enabled': true }))
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1000)
    const ticks = damages(plan, row(plan, 'rupture'), 5)
    for (const t of ticks) expect(t).toBeCloseTo(35 + 4.73 * 5 + 0.03 * 1000, 6)
    const { sim } = timeline(plan)
    const r = row(plan, 'rupture')
    // Every application but the fight's last runs its 8 ticks.
    expect(counter(sim, r, FIELD.hits)).toBeGreaterThanOrEqual(8 * (counter(sim, r, FIELD.casts) - 1))
    expect(counter(sim, r, FIELD.hits)).toBeLessThanOrEqual(8 * counter(sim, r, FIELD.casts))
  })

  it('R6: Relentless Strikes restores 25 Energy for certain at 5 points and 40% of the time at 2', () => {
    const evisc = withRogueTalents(EVISCERATE, COMBAT)
    expect(evisc.finisherEnergyChancePerCp! * 5).toBe(1)
    expect(evisc.finisherEnergyChancePerCp! * 2).toBeCloseTo(0.4, 12)
    expect(evisc.finisherEnergyTenths).toBe(250)
  })

  it('R7: Adrenaline Rush doubles the Energy of the 7 or 8 ticks in its 15 s', () => {
    const run = (ar: boolean) => {
      const plan = quiet(combatWith({ 'rogue.combat.adrenalineRush.enabled': ar }))
      // Only the Adrenaline Rush line; Energy from an empty bar with room for everything.
      plan.rotation = plan.rotation.filter((e) => plan.abilities[e.ability].id === 'adrenalineRush')
      plan.energy = { maxTenths: 100000, startTenths: 0, tickTenths: ENERGY_PER_TICK_TENTHS }
      plan.fight.durationMs = 30000
      plan.fight.variation = 0
      const sim = new Sim(plan)
      sim.runFight(3)
      return sim.totalEnergyGainedTenths
    }
    expect([7 * ENERGY_PER_TICK_TENTHS, 8 * ENERGY_PER_TICK_TENTHS]).toContain(run(true) - run(false))
  })

  it('R8: the off hand deals 62.5% with Dual Wield Specialization 5/5', () => {
    expect(buildPlan(defaultConfig('rogue-combat')).plan.weapons[1]!.handMult).toBeCloseTo(0.625, 12)
  })

  it('R9: Instant Poison with Improved Poisons 1/5 procs 22% of hits for 76–100; Vile Poisons 5/5 makes it 91.2–120', () => {
    const combat = buildPlan({ ...defaultConfig('rogue-combat'), buffs: { ...defaultConfig('rogue-combat').buffs, enabled: ['instantPoisonMainHand', 'instantPoisonOffHand'] } }).plan
    const instant = combat.procs.filter((p) => p.id === 'instantPoison')
    expect(instant.map((p) => [p.hands, p.chance[p.hands - 1], p.a, p.b])).toEqual([
      [1, 0.22, 76, 100],
      [2, 0.22, 76, 100],
    ])
    const assassin = buildPlan({ ...defaultConfig('rogue-assassination'), buffs: { ...defaultConfig('rogue-assassination').buffs, enabled: ['instantPoisonMainHand'] } }).plan
    const p = assassin.procs.find((x) => x.id === 'instantPoison')!
    expect(p.chance[0]).toBeCloseTo(0.3, 12)
    expect([p.a, p.b]).toEqual([76 * 1.2, 100 * 1.2])
  })

  it('R10: Deadly Poison at 5 stacks ticks 115 every 3 s, before resists', () => {
    const plan = quiet({ ...combatWith({}), buffs: { raid: [], enabled: ['deadlyPoisonMainHand'] } })
    const deadly = buildPlan({ ...combatWith({}), buffs: { raid: [], enabled: ['deadlyPoisonMainHand'] } }).plan.procs.find((p) => p.id === 'deadlyPoison')!
    // Every main-hand hit applies it, and nothing crits.
    plan.procs = [{ ...deadly, chance: [1, 1] }]
    plan.triggers = Array.from({ length: TRIGGER_COUNT }, (_, t) => (t === deadly.trigger ? [0] : []))
    alwaysLandNoCrit(plan)
    plan.stats.spellHit = 100
    plan.stats.spellCrit = -100
    const ticks = damages(plan, row(plan, 'deadlyPoison'), 3)
    const top = Math.max(...ticks)
    // 5 stacks × 23, less the boss's average partial resist (level 63: about 6%).
    expect(top).toBeGreaterThan(115 * 0.9)
    expect(top).toBeLessThan(115)
    for (const t of ticks) expect([1, 2, 3, 4, 5].some((k) => Math.abs(t - (k * top) / 5) < 1e-6)).toBe(true)
    expect(ticks.filter((t) => Math.abs(t - top) < 1e-6).length).toBeGreaterThan(ticks.length / 2)
  })
})

describe('the engine with a rogue (rogue.md §2, §4, §8)', () => {
  const plan = buildPlan(defaultConfig('rogue-combat')).plan

  it('has Energy, no rage, and swings both hands with the dual-wield penalty on white swings only', () => {
    expect(plan.energy).toEqual({ maxTenths: 1000, startTenths: 1000, tickTenths: 200 })
    expect(plan.rage.maxTenths).toBe(0)
    expect(plan.rage.fromDamageTaken).toBe(false)
    const view = new Sim(plan).inspect()
    const hit = buildPlan(defaultConfig('rogue-combat')).sheet.hitPct
    // combat-tables §1.1 (forever): 27% dual-wield white miss, 8% special, less hit.
    expect(view.whiteThresholds[1][0]).toBeCloseTo(27 - hit, 9)
    expect(view.specialThresholds[0]).toBeCloseTo(Math.max(0, 8 - hit), 9)
  })

  it('puts each poison on its own hand, and one Deadly Poison on the boss whichever hand applies it', () => {
    expect(plan.procs.filter((p) => p.poison).map((p) => [p.id, p.hands])).toEqual([
      ['deadlyPoison', 1],
      ['instantPoison', 2],
    ])
    expect(plan.procs.find((p) => p.id === 'deadlyPoison')!.action).toBe(ACTION.stackingDot)
    const both = buildPlan({ ...defaultConfig('rogue-combat'), buffs: { raid: [], enabled: ['deadlyPoisonMainHand', 'deadlyPoisonOffHand'] } })
    const sim = new Sim(both.plan)
    let most = 0
    sim.damageTrace = (s, d) => {
      if (s === row(both.plan, 'deadlyPoison')) most = Math.max(most, d)
    }
    for (let i = 0; i < 20; i++) sim.runFight(i)
    // At most 5 stacks' worth of one tick (spell crits ×1.5 aside): 115 × 1.5.
    expect(most).toBeLessThanOrEqual(115 * 1.5)
  })

  it('spends every combo point on a finisher, and builds them only from builders', () => {
    const { uses, sim } = timeline(plan)
    const id = (x: string) => plan.abilities.findIndex((a) => a.id === x)
    expect(uses[id('sinisterStrike')].length).toBeGreaterThan(30)
    expect(uses[id('eviscerate')].length).toBeGreaterThan(3)
    expect(uses[id('sliceAndDice')].length).toBeGreaterThan(3)
    expect(sim.resources().comboPoints).toBeLessThanOrEqual(5)
  })

  it('wields one-handed axes, and Hack and Slash’s extra attack comes from an axe’s hits (RG2)', () => {
    const axe = preBis.find((i) => i.name === 'Flurry Axe')!
    const dagger = preBis.find((i) => i.name === "Alcor's Sunrazor")!
    expect([fitsSlot('rogue', 'mainHand', axe), fitsSlot('rogue', 'offHand', axe)]).toEqual([true, true])
    const hackAndSlash = (mainHand: number) => {
      const base = defaultConfig('rogue-combat')
      const b = buildPlan({ ...base, gear: { ...base.gear, mainHand: { itemId: mainHand }, offHand: { itemId: dagger.id } } })
      return b.plan.procs.find((p) => p.id === 'hackAndSlash')
    }
    // Axe in the main hand, dagger in the off hand: the main hand's hits proc it, at 5% with 5/5.
    const proc = hackAndSlash(axe.id)!
    expect([proc.hands, proc.chance[0], proc.action]).toEqual([1, 0.05, ACTION.extraAttacks])
    expect(hackAndSlash(dagger.id)).toBeUndefined()
  })

  it('gives the same result for the same config and seed (decision D15)', () => {
    const run = () => {
      const sim = new Sim(plan)
      for (let i = 0; i < 30; i++) sim.runFight(i)
      return [Array.from(sim.counters), Array.from(sim.auraUpMs), sim.totalEnergyGainedTenths]
    }
    expect(run()).toEqual(run())
  })
})

describe('the Combat priority list (rogue.md §6.1)', () => {
  const context = { race: 'alliance-human', items: [], consumables: [THISTLE_TEA] }

  it('by default: Thistle Tea, Slice and Dice, Blade Flurry, Adrenaline Rush, Eviscerate, Sinister Strike', () => {
    const rot = combatRotation({}, COMBAT, context)
    expect(rot.rotation.map((e) => rot.abilities[e.ability].id)).toEqual(['thistleTea', 'sliceAndDice', 'bladeFlurry', 'adrenalineRush', 'eviscerate', 'sinisterStrike'])
    const snd = rot.rotation[1]
    expect(snd.conditions).toEqual([
      { code: COND.abilityAuraRefresh, a: 1, b: 500 },
      { code: COND.minComboPoints, a: 2, b: 0 },
    ])
    expect(rot.rotation[4].conditions).toEqual([{ code: COND.minComboPoints, a: 5, b: 0 }])
    expect(rot.rotation[0].conditions).toEqual([{ code: COND.maxEnergy, a: 100, b: 0 }])
    expect(rot.onUse).toEqual(['thistleTea'])
  })

  it('adds Expose Armor and Rupture when they’re on, and keeps Expose Armor itself then', () => {
    const rot = combatRotation({ 'rogue.combat.exposeArmor.enabled': true, 'rogue.combat.rupture.enabled': true }, COMBAT, context)
    expect(rot.rotation.map((e) => rot.abilities[e.ability].id)).toEqual(['thistleTea', 'sliceAndDice', 'bladeFlurry', 'adrenalineRush', 'exposeArmor', 'rupture', 'eviscerate', 'sinisterStrike'])
    expect(combatMaintainedBuffs({ 'rogue.combat.exposeArmor.enabled': true })).toEqual(['exposeArmor'])
    expect(combatMaintainedBuffs({})).toEqual([])
  })

  it('leaves out Blade Flurry and Adrenaline Rush without their talents', () => {
    const rot = combatRotation({}, ranks([['Malice', 5]]), context)
    expect(rot.rotation.map((e) => rot.abilities[e.ability].id)).toEqual(['thistleTea', 'sliceAndDice', 'eviscerate', 'sinisterStrike'])
  })
})

describe('the Assassination priority list (rogue.md §6.2)', () => {
  const context = { race: 'alliance-human', items: [], consumables: [THISTLE_TEA] }
  const ids = (rot: ReturnType<typeof assassinationRotation>) => rot.rotation.map((e) => rot.abilities[e.ability].id)

  it('by default: Thistle Tea, Slice and Dice, Cold Blood at 5 points, Eviscerate at 4, Mutilate', () => {
    const rot = assassinationRotation({}, ASSASSINATION, { ...context, weaponTypes: ['dagger', 'dagger'] })
    expect(ids(rot)).toEqual(['thistleTea', 'sliceAndDice', 'coldBlood', 'eviscerate', 'mutilate'])
    expect(rot.rotation[2].conditions).toEqual([
      { code: COND.minComboPoints, a: 5, b: 0 },
      { code: COND.minEnergy, a: 350, b: 0 },
    ])
    expect(rot.rotation[3].conditions).toEqual([{ code: COND.minComboPoints, a: 4, b: 0 }])
    expect(assassinationMaintainedBuffs({})).toEqual([])
  })

  it('keeps Venom up after Slice and Dice when it’s on, and builds with Sinister Strike without two daggers', () => {
    const on = assassinationRotation({ 'rogue.assassination.venom.enabled': true }, ASSASSINATION, { ...context, weaponTypes: ['dagger', 'dagger'] })
    expect(ids(on)).toEqual(['thistleTea', 'sliceAndDice', 'venom', 'coldBlood', 'eviscerate', 'mutilate'])
    expect(on.rotation[2].conditions).toEqual([
      { code: COND.abilityAuraRefresh, a: 2, b: 0 },
      { code: COND.minComboPoints, a: 3, b: 0 },
    ])
    for (const weaponTypes of [['sword', 'dagger'], ['dagger', 'sword'], ['dagger', null]] as const) {
      expect(ids(assassinationRotation({}, ASSASSINATION, { ...context, weaponTypes })).at(-1)).toBe('sinisterStrike')
    }
    // Without the talents: no Cold Blood, Venom or Mutilate.
    expect(ids(assassinationRotation({ 'rogue.assassination.venom.enabled': true }, ranks([['Malice', 5]]), context))).toEqual(['thistleTea', 'sliceAndDice', 'eviscerate', 'sinisterStrike'])
  })

  it('the default setup has two daggers, so it builds with Mutilate: both hands strike, 20% harder with Deadly Poison on the boss', () => {
    const config = defaultConfig('rogue-assassination')
    const perHit = (enabled: string[]) => {
      const bundle = buildPlan({ ...config, buffs: { ...config.buffs, enabled } })
      const sim = new Sim(bundle.plan)
      for (let i = 0; i < 300; i++) sim.runFight(i)
      const main = row(bundle.plan, 'mutilate')
      const off = row(bundle.plan, 'mutilateOffHand')
      expect(main).toBeGreaterThanOrEqual(0)
      expect(counter(sim, main, FIELD.casts)).toBe(counter(sim, off, FIELD.casts))
      return counter(sim, main, FIELD.damage) / (counter(sim, main, FIELD.hits) + counter(sim, main, FIELD.crits))
    }
    const withDeadly = perHit(config.buffs.enabled)
    const without = perHit(config.buffs.enabled.filter((b) => !b.startsWith('deadlyPoison')))
    // Deadly Poison is on the boss from its first application to the end: nearly all of the fight.
    expect(withDeadly / without).toBeGreaterThan(1.15)
    expect(withDeadly / without).toBeLessThan(1.21)
  })

  it('Venom raises the poisons’ damage by 30% and their chance by 10 points while it’s up', () => {
    const config = defaultConfig('rogue-assassination')
    const plan = buildPlan({ ...config, rotation: { 'rogue.assassination.venom.enabled': true } }).plan
    const aura = plan.auras.find((a) => a.id === 'venom')!
    expect([aura.poisonDamage, aura.poisonChance]).toEqual([30, 10])
    const agg = runFights(plan, 250)
    expect(agg.auraUpMs[plan.auras.indexOf(aura)] / agg.durationMs).toBeGreaterThan(0.7)
  })
})

function runFights(plan: Plan, fights: number): Aggregate {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

describe('golden run (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - R1: the default Combat rogue (rogue.md §6.1, §7): swords, Deadly Poison V on the main hand and
  //   Instant Poison VI on the off hand, Slice and Dice at 2 points, Eviscerate at 5, Blade Flurry and
  //   Adrenaline Rush on cooldown, Thistle Tea at 10 Energy; 580.3 DPS over 20,000 fights on seed 2701.
  // - R1: the default Assassination rogue (rogue.md §6.2, §7): daggers, the same poisons, Mutilate,
  //   Slice and Dice at 2 points, Cold Blood at 5, Eviscerate at 4, Venom off; 524.1 DPS over 20,000
  //   fights on seed 2701.
  it('keeps the default Assassination rogue’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('rogue-assassination'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const result = toResult(bundle, runFights(bundle.plan, 1000), 0)
    expect({
      dps: result.dps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses, a.dodges, a.glances]),
    }).toMatchSnapshot()
  })

  it('keeps the default Combat rogue’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('rogue-combat'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const result = toResult(bundle, runFights(bundle.plan, 1000), 0)
    expect({
      dps: result.dps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses, a.dodges, a.glances]),
    }).toMatchSnapshot()
  })
})
