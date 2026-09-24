// The Feral bear against docs/classes/druid.md §4, §6.3 and §9: its ability rows against the
// Forever client (src/data/client), Clearcasting's class mask, the default build's talents on each
// row, the arithmetic of worked examples W14–W16, W18 and W19, the Rotation settings, and the
// priority list they give. The engine's side is src/sim/engine/bear.test.ts.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpells } from '@/data/client/types'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { buildPlan } from '../../plan/build'
import { unusedRotationSettings } from '../../index'
import { COND, SCHOOL } from '../../plan/types'
import { CLASSIC_ERA, FOREVER } from '../../rules/profiles'
import type { RotationOption, SimConfig } from '../../types'
import { talentRanksByName } from '../index'
import { maintainedBuffs, rotationOptions } from '../rotation'
import { NO_CONTEXT } from '../warrior/shared'
import { BEAR_IDS, BEAR_OPTIONS, bearMaintainedBuffs, bearRotation, PREPULL_ENRAGE_MS } from './bear'
import {
  BEAR_GCD_MS,
  DEMORALIZING_ROAR_THREAT,
  demoralizingRoar,
  ENRAGE_ITEM_ARMOR_PCT,
  enrage,
  FAERIE_FIRE_BEAR,
  FAERIE_FIRE_THREAT,
  LACERATE,
  LACERATE_MAX_STACKS,
  LACERATE_WEAPON_PCT_PER_STACK,
  MANGLE,
  MAUL,
  MAUL_THREAT_MULT,
  SWIPE,
  SWIPE_THREAT_MULT,
} from './bear-abilities'
import { BERSERK, FAERIE_FIRE_ARMOR } from './cat-abilities'
import { formBit } from './forms'
import { REND_AND_TEAR, withDruidTalents } from './modifiers'

const spells = (spellsJson as unknown as ClientSpells).spells
const spell = (id: number) => spells[String(id)]
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
const BEAR_CODE = defaultConfig('druid-feral-bear').talents
const TALENTS = talentRanksByName(TALENT_DATA.druid, BEAR_CODE)

/** A spell's class mask, and whether any of its bits is in a spell effect's affected mask. */
const mask = (id: number) => spell(id).classOptions!.spellClassMask as number[]
const covers = (affected: number[], id: number) => mask(id).some((word, i) => (word & affected[i]) !== 0)

describe('the bear’s abilities against the client (druid.md §4)', () => {
  it('Maul r7 (9881): 15 rage, +128 weapon damage, no GCD, Bear and Dire Bear only', () => {
    const s = spell(9881)
    expect(s.power![0]).toMatchObject({ manaCost: MAUL.costTenths, powerType: 1 })
    expect(effect(9881, 0)).toMatchObject({ effect: 58, effectBasePointsF: MAUL.flatDamage })
    expect(s.cooldowns?.startRecoveryTime).toBeUndefined()
    expect(s.shapeshift?.shapeshiftMask?.[0]).toBe(144)
    expect(MAUL).toMatchObject({ kind: 'onNextSwing', gcdMs: 0, weaponPercent: 1, forms: formBit('bear'), threatMult: 1.75 })
  })

  it('Swipe r5 (9908): 20 rage, 83 to up to 3 targets with no attack power, GCD 1500', () => {
    const s = spell(9908)
    expect(s.power![0]).toMatchObject({ manaCost: SWIPE.costTenths, powerType: 1 })
    expect(effect(9908, 0)).toMatchObject({ effect: 2, effectBasePointsF: SWIPE.flatDamage, effectChainTargets: 3 })
    expect(s.cooldowns?.startRecoveryTime).toBe(SWIPE.gcdMs)
    expect(SWIPE).toMatchObject({ kind: 'meleeSpell', weaponPercent: 0, apCoefficient: 0, refundShare: 0, threatMult: 1.75 })
  })

  it('Mangle (1238073, level 60): 20 rage, 100% weapon damage + 77, a 6 s cooldown, GCD 1500', () => {
    const s = spell(1238073)
    expect(s.power![0]).toMatchObject({ manaCost: MANGLE.costTenths, powerType: 1 })
    expect(effect(1238073, 0)).toMatchObject({ effect: 58, effectBasePointsF: MANGLE.flatDamage })
    expect(effect(1238073, 1)).toMatchObject({ effect: 31, effectBasePointsF: 100 * MANGLE.weaponPercent })
    expect(s.cooldowns).toMatchObject({ categoryRecoveryTime: MANGLE.cooldownMs, startRecoveryTime: MANGLE.gcdMs })
    expect(s.shapeshift?.shapeshiftMask?.[0]).toBe(144)
    expect(MANGLE).toMatchObject({ kind: 'weaponStrike', threatMult: 1, noCooldownWhile: 'berserk' })
  })

  it('Lacerate r3 (1235827): 15 rage, 15 per 3 s for 15 s a stack, 5 stacks, 10% weapon damage a stack, ticks that may crit', () => {
    const s = spell(1235827)
    expect(s.power![0]).toMatchObject({ manaCost: LACERATE.costTenths, powerType: 1 })
    expect(effect(1235827, 0)).toMatchObject({ effect: 6, effectAura: 3, effectAuraPeriod: LACERATE.dotTickMs, effectBasePointsF: LACERATE.dotTickDamage })
    expect(effect(1235827, 1)).toMatchObject({ effect: 3, effectBasePointsF: 100 * LACERATE_WEAPON_PCT_PER_STACK })
    expect(s.duration?.duration).toBe(LACERATE.dotTicks * LACERATE.dotTickMs)
    expect(s.duration?.duration).toBe(LACERATE.aura!.durationMs)
    expect(s.auraOptions?.cumulativeAura).toBe(LACERATE_MAX_STACKS)
    expect(LACERATE.aura!.maxStacks).toBe(LACERATE_MAX_STACKS)
    expect(s.categories?.mechanic).toBe(15) // a bleed
    // SpellMisc Attributes[8] 0x200: periodic effects can crit (druid.md §2.9).
    expect((s.misc?.attributes ?? [])[8] & 0x200).toBe(0x200)
    expect(LACERATE).toMatchObject({ periodicCanCrit: true, weaponPercent: 0, weaponPercentPerStack: 0.1, gcdMs: 1500 })
  })

  it('Demoralizing Roar r5 (9898): 10 rage, GCD 1500, 30 s; W18: −193 − 1.4 × 8 = −204.2 at 60 (Classic −138)', () => {
    const s = spell(9898)
    expect(s.power![0]).toMatchObject({ manaCost: demoralizingRoar(FOREVER).costTenths, powerType: 1 })
    expect(s.cooldowns?.startRecoveryTime).toBe(BEAR_GCD_MS)
    expect(s.duration?.duration).toBe(30000)
    const e = effect(9898, 0)
    expect(e).toMatchObject({ effectAura: 99, effectBasePointsF: -193, effectRealPointsPerLevel: -1.4 })
    expect(s.levels).toMatchObject({ spellLevel: 52, maxLevel: 62 })
    const atSixty = e.effectBasePointsF! + e.effectRealPointsPerLevel! * (60 - 52)
    expect(atSixty).toBeCloseTo(-204.2, 9)
    // The client shows −204; the sim uses the tooltip's whole number (Q32).
    expect(demoralizingRoar(FOREVER).aura!.mods.bossAp).toBe(-204)
    expect(demoralizingRoar(CLASSIC_ERA).aura!.mods.bossAp).toBe(-138)
    // `DefenseType` Magic: it rolls spell hit.
    expect(s.categories?.defenseType).toBe(1)
    expect(demoralizingRoar(FOREVER)).toMatchObject({ kind: 'cast', spellHit: true, threatBonus: DEMORALIZING_ROAR_THREAT, refundShare: 0.8 })
    // Physical (`SchoolMask` 1): no resistance.
    expect(s.misc?.schoolMask).toBe(1)
    expect(demoralizingRoar(FOREVER).spellSchool).toBeUndefined()
  })

  it('Faerie Fire r4 (9907) in bear: −505 armor for 40 s, GCD 1500, a spell; free with a 6 s cooldown from Dire Bear Form (Passive)', () => {
    const s = spell(9907)
    expect(effect(9907, 0)).toMatchObject({ effectAura: 22, effectBasePointsF: -FAERIE_FIRE_ARMOR })
    expect(s.duration?.duration).toBe(FAERIE_FIRE_BEAR.aura!.durationMs)
    expect(s.cooldowns?.startRecoveryTime).toBe(FAERIE_FIRE_BEAR.gcdMs)
    expect(s.categories?.defenseType).toBe(1)
    // Its shapeshift mask allows Bear and Dire Bear (144); 9635's −100% cost and +6000 ms cooldown
    // aren't in the committed dataset, only in the raw client (druid.md §4.5).
    expect((s.shapeshift?.shapeshiftMask ?? [0])[0] & 144).toBe(144)
    expect(FAERIE_FIRE_BEAR).toMatchObject({ kind: 'cast', costTenths: 0, cooldownMs: 6000, spellHit: true, threatBonus: FAERIE_FIRE_THREAT })
    // A Nature spell (`SchoolMask` 8), so the boss's resistance applies to it (combat-tables §9).
    expect(s.misc?.schoolMask).toBe(8)
    expect(FAERIE_FIRE_BEAR.spellSchool).toBe(SCHOOL.nature)
  })

  it('Berserk (417141): 15 s, 3 min, no GCD; its Mangle part is a −100% cooldown modifier on Mangle’s class mask', () => {
    const s = spell(417141)
    expect(s.cooldowns?.recoveryTime).toBe(BERSERK.cooldownMs)
    expect(s.duration?.duration).toBe(BERSERK.aura!.durationMs)
    expect(s.cooldowns?.startRecoveryTime).toBeUndefined()
    const cooldown = effect(417141, 1)
    expect(cooldown).toMatchObject({ effectAura: 108, effectBasePointsF: -100, effectMiscValue: [11, 0] })
    expect(covers(cooldown.effectSpellClassMask!, 1238073)).toBe(true)
    // Its crit part covers the cat's builders, not Maul, Swipe, Mangle or Lacerate (druid.md §4.6).
    const crit = effect(417141, 0).effectSpellClassMask!
    for (const id of [9881, 9908, 1238073, 1235827]) expect(covers(crit, id), String(id)).toBe(false)
    // The cat's row, usable in both forms (cat-abilities.ts).
    expect(BERSERK).toMatchObject({ gcdMs: 0, costTenths: 0, forms: formBit('cat', 'bear') })
  })

  it('Enrage (5229): 10 rage at once and 2 a second for 10 s, 1 min cooldown, no GCD; Wolfshead Helm +5', () => {
    const s = spell(5229)
    expect(effect(5229, 1)).toMatchObject({ effect: 30, effectBasePointsF: enrage(false).rageTenths })
    expect(effect(5229, 0)).toMatchObject({ effectAura: 24, effectAuraPeriod: enrage(false).rageTickMs, effectBasePointsF: enrage(false).rageTickTenths })
    expect(s.duration?.duration).toBe(enrage(false).rageTicks * enrage(false).rageTickMs)
    expect(s.cooldowns?.recoveryTime).toBe(enrage(false).cooldownMs)
    expect(s.cooldowns?.startRecoveryTime).toBeUndefined()
    expect(enrage(true).rageTenths - enrage(false).rageTenths).toBe(50)
    expect(enrage(false).aura!.mods.itemArmorPct).toBe(ENRAGE_ITEM_ARMOR_PCT)
  })

  it('Clearcasting (16870) pays for exactly the bear abilities its class mask covers: not Faerie Fire, which is free anyway', () => {
    const affected = effect(16870, 0).effectSpellClassMask!
    const rows = [
      [9881, MAUL],
      [9908, SWIPE],
      [1238073, MANGLE],
      [1235827, LACERATE],
      [9898, demoralizingRoar(FOREVER)],
    ] as const
    for (const [id, def] of rows) expect(Boolean(def.clearcastable), def.id).toBe(covers(affected, id))
    expect(rows.every(([, def]) => def.clearcastable)).toBe(true)
    expect(covers(affected, 9907)).toBe(false)
    expect(FAERIE_FIRE_BEAR.clearcastable).toBeUndefined()
  })
})

describe('the default bear build on each row (druid.md §5.1, W14–W16, W19)', () => {
  const resolved = (def: Parameters<typeof withDruidTalents>[0]) => withDruidTalents(def, TALENTS)

  it('Ferocity 5/5: Maul 10, Mangle 15, Swipe 15 rage; Lacerate stays 15 without Shredding Attacks', () => {
    expect(TALENTS.get('Ferocity')).toBe(5)
    expect(TALENTS.has('Shredding Attacks')).toBe(false)
    expect([MAUL, MANGLE, SWIPE, LACERATE].map((d) => resolved(d).costTenths)).toEqual([100, 150, 150, 150])
  })

  it('W14: Maul at 1200 AP is (351.286 + 128) × 1.10 = 527.214, and its threat × 1.75 × 1.3 = 1199.41', () => {
    const maul = resolved(MAUL)
    const wb = (109.6 + 164.4) / 2 + (1200 * 2.5) / 14
    expect(wb).toBeCloseTo(351.286, 3)
    const damage = (wb + maul.flatDamage) * maul.weaponPercent
    expect(damage).toBeCloseTo(527.214, 3)
    expect(damage * MAUL_THREAT_MULT * 1.3).toBeCloseTo(1199.41, 2)
    expect(maul.critMultiplier).toBeCloseTo(2.2, 12)
  })

  it('W15: Mangle at 1200 AP is 351.286 + 77 = 428.286 (no Savage Fury); threat × 1.3 = 556.77', () => {
    const mangle = resolved(MANGLE)
    const damage = ((109.6 + 164.4) / 2 + (1200 * 2.5) / 14 + mangle.flatDamage) * mangle.weaponPercent
    expect(damage).toBeCloseTo(428.286, 3)
    expect(damage * mangle.threatMult * 1.3).toBeCloseTo(556.77, 2)
    expect(mangle.critMultiplier).toBeCloseTo(2.2, 12)
  })

  it('W16: Swipe is 83 × 1.10 × 1.30 = 118.69 a target; threat × 1.75 × 1.3 = 270.02', () => {
    const swipe = resolved(SWIPE)
    expect(swipe.flatDamage).toBeCloseTo(118.69, 2)
    expect(swipe.flatDamage * SWIPE_THREAT_MULT * 1.3).toBeCloseTo(270.02, 2)
  })

  it('W19: Lacerate at 5 stacks ticks 15 × 5 = 75, 78.75 with Genesis 5/5; no Savage Fury on its hit', () => {
    expect(LACERATE.dotTickDamage * LACERATE_MAX_STACKS).toBe(75)
    const lacerate = resolved(LACERATE)
    expect(lacerate.dotTickDamage * LACERATE_MAX_STACKS).toBeCloseTo(78.75, 9)
    expect(lacerate.weaponPercentPerStack).toBe(0.1)
  })

  it('Rend and Tear 5/5: +10% on Maul, Swipe, Mangle and Lacerate against a bleeding target, as the druid’s talents resolve it', () => {
    const rotation = bearRotation({ [BEAR_IDS.swipeEnabled]: true }, TALENTS, () => -1, { profile: FOREVER })
    const pct = Object.fromEntries(rotation.abilities.map((a) => [a.id, a.bleedingTargetPct ?? 0]))
    for (const id of REND_AND_TEAR) if (id in pct) expect(pct[id], id).toBe(10)
    expect(pct.faerieFire ?? 0).toBe(0)
    expect(pct.demoralizingRoar ?? 0).toBe(0)
  })
})

describe('the bear’s Rotation settings (druid.md §6.3)', () => {
  const byId = new Map(BEAR_OPTIONS.map((o) => [o.id, o]))
  const option = (id: string) => byId.get(id)!
  const toggle = (id: string) => option(id) as Extract<RotationOption, { kind: 'toggle' }>

  it('are the spec’s rotation options, each id `druid.bear.<ability>.<param>` and unique', () => {
    expect(rotationOptions('druid-feral-bear')).toBe(BEAR_OPTIONS)
    expect(new Set(BEAR_OPTIONS.map((o) => o.id)).size).toBe(BEAR_OPTIONS.length)
    for (const o of BEAR_OPTIONS) expect(o.id).toMatch(/^druid\.bear\.[a-zA-Z]+\.[a-zA-Z]+$/)
  })

  it('keep the tank’s duties by default (D26): Demoralizing Roar and Faerie Fire kept up; Enrage in combat isn’t one, and is on (tuned)', () => {
    expect(toggle(BEAR_IDS.roarEnabled).default).toBe(true)
    expect(toggle(BEAR_IDS.ffEnabled).default).toBe(true)
    expect(toggle(BEAR_IDS.enrageInCombat).default).toBe(true)
    expect(toggle(BEAR_IDS.roarEnabled).maintainsBuff).toBe('demoralizingRoar')
    expect(toggle(BEAR_IDS.ffEnabled).maintainsBuff).toBe('faerieFire')
  })

  it('keep the Buffs tab’s Faerie Fire and Demoralizing Roar out while the bear keeps its own', () => {
    expect(maintainedBuffs('druid-feral-bear', {})).toEqual(['faerieFire', 'demoralizingRoar'])
    expect(bearMaintainedBuffs({ [BEAR_IDS.roarEnabled]: false })).toEqual(['faerieFire'])
    // The filler keeps Faerie Fire up too.
    expect(bearMaintainedBuffs({ [BEAR_IDS.ffEnabled]: false })).toEqual(['faerieFire', 'demoralizingRoar'])
    expect(bearMaintainedBuffs({ [BEAR_IDS.ffEnabled]: false, [BEAR_IDS.ffFiller]: false, [BEAR_IDS.roarEnabled]: false })).toEqual([])
  })

  it('rage thresholds are absolute rage, 0 to the 100 cap', () => {
    for (const o of BEAR_OPTIONS) if (o.kind === 'number' && o.unit === 'rage') expect([o.min, o.max], o.id).toEqual([0, 100])
  })
})

describe('the bear’s priority list (druid.md §6.3)', () => {
  const lines = (values: Record<string, boolean | number | string> = {}, context = {}) => {
    const r = bearRotation(values, TALENTS, () => -1, { ...NO_CONTEXT, profile: FOREVER, ...context })
    return { r, ids: r.rotation.map((e) => r.abilities[e.ability].id) }
  }

  it('with the defaults: Berserk and Maul off the GCD, then the duties, Mangle, Lacerate and the Faerie Fire filler; no Swipe', () => {
    const all = ['berserk', 'enrage', 'maul', 'demoralizingRoar', 'faerieFire', 'mangle', 'lacerate', 'lacerate', 'faerieFire']
    expect(lines().ids).toEqual(all)
    // A raid whose warriors keep the boss bleeding keeps Lacerate too (§6.3, BL1), unless it's set
    // to wait for no other bleeds.
    expect(lines({}, { othersBleed: true }).ids).toEqual(all)
    expect(lines({ [BEAR_IDS.lacerateAlone]: true }, { othersBleed: true }).ids).toEqual(['berserk', 'enrage', 'maul', 'demoralizingRoar', 'faerieFire', 'mangle', 'faerieFire'])
    expect(lines({ [BEAR_IDS.lacerateAlone]: true }).ids).toEqual(all)
    // A Demoralizing Shout in the Buffs tab takes the roar's group: no roar.
    expect(lines({}, { buffGroups: new Set(['ap-reduction']) }).ids).not.toContain('demoralizingRoar')
    // Swipe, when it's on, comes before the filler.
    expect(lines({ [BEAR_IDS.swipeEnabled]: true }).ids.slice(-2)).toEqual(['swipe', 'faerieFire'])
  })

  it('Enrage 1.5 s before the pull, and in combat on cooldown, up to the cap minus its 30 rage', () => {
    const { r } = lines()
    expect(r.prepull.casts).toEqual([{ ability: r.abilities.findIndex((a) => a.id === 'enrage'), atMs: PREPULL_ENRAGE_MS }])
    const line = r.rotation.find((e) => r.abilities[e.ability].id === 'enrage')!
    expect(line.conditions).toEqual([{ code: COND.maxRage, a: 700, b: 0 }])
    expect(lines({ [BEAR_IDS.enrageInCombat]: false }).ids).not.toContain('enrage')
    expect(lines({ [BEAR_IDS.enragePrepull]: false }).r.prepull.casts).toEqual([])
  })

  it('Wolfshead Helm adds 5 rage to Enrage at once', () => {
    const { r } = lines({}, { equipped: new Set([8345]) })
    expect(r.abilities.find((a) => a.id === 'enrage')!.rageTenths).toBe(150)
  })

  it('Lacerate while under 5 stacks, and at 5 once refreshBelowSec is left', () => {
    const { r } = lines({ [BEAR_IDS.lacerateEnabled]: true, [BEAR_IDS.lacerateRefresh]: 3 })
    const a = r.abilities.findIndex((x) => x.id === 'lacerate')
    const own = r.rotation.filter((e) => e.ability === a).map((e) => e.conditions)
    expect(own).toEqual([[{ code: COND.abilityAuraStacksBelow, a, b: 5 }], [{ code: COND.abilityAuraRefresh, a, b: 3000 }]])
  })

  it('each duty and ability is a setting: turned off, its line goes (a rotation without the duties is a matter of settings)', () => {
    const off = lines({
      [BEAR_IDS.roarEnabled]: false,
      [BEAR_IDS.ffEnabled]: false,
      [BEAR_IDS.ffFiller]: false,
      [BEAR_IDS.berserk]: false,
      [BEAR_IDS.maulEnabled]: false,
      [BEAR_IDS.mangleEnabled]: false,
      [BEAR_IDS.lacerateEnabled]: false,
      [BEAR_IDS.swipeEnabled]: false,
      [BEAR_IDS.enrageInCombat]: false,
    }).ids
    expect(off).toEqual([])
    // Without the talents, no Mangle and no Berserk.
    const bare = bearRotation({}, new Map(), () => -1, { ...NO_CONTEXT, profile: FOREVER })
    expect(bare.abilities.map((a) => a.id)).not.toContain('mangle')
    expect(bare.abilities.map((a) => a.id)).not.toContain('berserk')
  })

  it('the Night Elf’s Elune’s Light, and the potion and Juju Flurry only when selected in Buffs', () => {
    expect(lines({}, { race: 'alliance-night-elf' }).ids).toContain('elunesLight')
    expect(lines({}, { race: 'horde-tauren' }).ids).not.toContain('elunesLight')
    const plan = buildPlan(defaultConfig('druid-feral-bear')).plan
    expect(plan.abilities.map((a) => a.id)).toContain('mightyRagePotion')
    expect(plan.abilities.find((a) => a.id === 'mightyRagePotion')!.usesPerFight).toBe(1)
  })
})

describe('the default bear’s plan', () => {
  const plan = buildPlan(defaultConfig('druid-feral-bear')).plan
  const ability = (id: string) => plan.abilities.find((a) => a.id === id)!

  /** The default bear in a raid without warriors, so nothing else keeps the boss bleeding. */
  const withoutWarriors = (profile: 'forever' | 'classicEra' = 'forever') => {
    const d = defaultConfig('druid-feral-bear')
    return buildPlan({ ...d, buffs: { ...d.buffs, raid: d.buffs.raid.filter((c) => c !== 'warrior') }, rules: { profile, unmeasuredRatings: 'apply' } }).plan
  }

  it('keeps Lacerate while the raid’s warriors keep the boss bleeding; set to wait for no other bleeds, it leaves it out (§6.3, BL1)', () => {
    expect(plan.fight.othersBleed).toBe(true)
    expect(plan.abilities.map((a) => a.id)).toContain('lacerate')
    const alone = withoutWarriors()
    expect(alone.fight.othersBleed).toBe(false)
    expect(alone.abilities.map((a) => a.id)).toContain('lacerate')
    const d = defaultConfig('druid-feral-bear')
    const unused = (config: SimConfig) => unusedRotationSettings(config)[BEAR_IDS.lacerateEnabled]
    expect(unused(d)).toBeUndefined()
    const waits = { ...d, rotation: { [BEAR_IDS.lacerateAlone]: true } }
    expect(buildPlan(waits).plan.abilities.map((a) => a.id)).not.toContain('lacerate')
    // The Rotation tab says why, as it does for the cat's Rake and Rip.
    expect(unused(waits)).toBe('Not used in this raid: its warriors keep the boss bleeding. Turn off “Lacerate only when nothing else bleeds” to use it anyway.')
    const noWarriors = { ...waits, buffs: { ...d.buffs, raid: d.buffs.raid.filter((c) => c !== 'warrior') } }
    expect(buildPlan(noWarriors).plan.abilities.map((a) => a.id)).toContain('lacerate')
    expect(unused(noWarriors)).toBeUndefined()
  })

  it('Lacerate’s ticks get their own row, a bleed whose applications can’t be avoided and whose ticks may crit in Forever', () => {
    const alone = withoutWarriors()
    const row = alone.sources[alone.abilities.find((a) => a.id === 'lacerate')!.dotSource!]
    expect(row).toMatchObject({ id: 'lacerateBleed', name: 'Lacerate (bleed)', bleed: { ticksCanCrit: true, avoidable: false } })
    const classic = withoutWarriors('classicEra')
    const classicRow = classic.sources[classic.abilities.find((a) => a.id === 'lacerate')!.dotSource!]
    expect(classicRow.bleed?.ticksCanCrit).toBe(false)
  })

  it('Mangle’s cooldown stops under Berserk’s aura', () => {
    expect(plan.auras[ability('mangle').noCooldownAura!].id).toBe('berserk')
  })

  it('its Faerie Fire and Demoralizing Roar are debuffs on the boss, in place of the Buffs tab’s', () => {
    expect(plan.auras.find((a) => a.id === 'faerieFire')!.targetArmor).toBe(505)
    expect(plan.auras.find((a) => a.id === 'demoralizingRoar')!.bossAp).toBe(-204)
    // The Buffs tab's Faerie Fire is left out: the boss's static armor keeps Sunder Armor and Curse
    // of Recklessness only (3,731 − 2,250 − 505).
    expect(plan.fight.targetArmor).toBe(976)
    // Its preset takes the attack-power group with the bear's own roar, so no Demoralizing Shout.
    expect(defaultConfig('druid-feral-bear').buffs.enabled).toContain('demoralizingRoar')
    expect(defaultConfig('druid-feral-bear').buffs.enabled).not.toContain('demoralizingShout')
    expect(plan.fight.bossSwing!.minDamage).toBe(4500)
  })

  it('a Demoralizing Shout in the Buffs tab takes the roar’s place on the boss, so the roar isn’t used (BL3)', () => {
    const d = defaultConfig('druid-feral-bear')
    const buffs = { ...d.buffs, enabled: [...d.buffs.enabled.filter((id) => id !== 'demoralizingRoar'), 'demoralizingShout'] }
    const shout = buildPlan({ ...d, buffs }).plan
    expect(shout.abilities.map((a) => a.id)).not.toContain('demoralizingRoar')
    expect(shout.auras.map((a) => a.id)).not.toContain('demoralizingRoar')
    expect(shout.fight.bossSwing!.minDamage).toBeCloseTo(4500 - (204 / 14) * 2, 9)
    // The Rotation tab says why.
    const unused = (config: SimConfig) => unusedRotationSettings(config)[BEAR_IDS.roarEnabled]
    expect(unused(d)).toBeUndefined()
    expect(unused({ ...d, buffs })).toBe('Not used: the Demoralizing Shout in Buffs takes its place on the boss.')
    // Without a warrior in the raid, nobody brings the Shout: the roar is used again.
    const noWarrior = { raid: d.buffs.raid.filter((c) => c !== 'warrior'), enabled: buffs.enabled }
    expect(buildPlan({ ...d, buffs: noWarrior }).plan.abilities.map((a) => a.id)).toContain('demoralizingRoar')
    expect(unused({ ...d, buffs: noWarrior })).toBeUndefined()
  })
})
