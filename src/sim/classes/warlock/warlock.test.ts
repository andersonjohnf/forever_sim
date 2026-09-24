// The warlock (docs/classes/warlock.md): its rows against the Forever client, its talents against
// their curves, the doc's worked examples (§10), the engine's warlock pieces (Conflagrate and Immolate,
// Incinerate's boost, Shadow Trance, Life Tap, Demonic Sacrifice, its own Curse of the Elements), both
// priority lists, a golden run per spec and determinism.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpells, ClientTalents } from '@/data/client/types'
import { spiritRegenTickTenths } from '../../core/formulas'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { COND, type Plan, SCHOOL } from '../../plan/types'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import type { SimConfig } from '../../types'
import { talentRanksByName } from '../index'
import {
  BANE_OF_AGONY,
  BANE_OF_DOOM,
  CONFLAGRATE,
  CORRUPTION,
  CURSE_OF_THE_ELEMENTS,
  demonicSacrifice,
  IMMOLATE,
  INCINERATE,
  LIFE_TAP_BASE,
  lifeTap,
  SHADOW_BOLT,
  SHADOWBURN,
  SIPHON_LIFE,
} from './abilities'
import { AFFLICTION_IDS } from './affliction'
import { DESTRUCTION_IDS } from './destruction'
import { CURVE, spellWithTalents, withTalents } from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const clientTalents = (talentsJson as unknown as ClientTalents).classes.warlock.talents
const spell = (id: number) => spells[String(id)]
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
const manaCost = (id: number) => (spell(id).power ?? [])[0]?.manaCost ?? 0
const curve = (name: string, index = 0) => clientTalents.find((t) => t.name === name)!.rankEffects.find((r) => r.effectIndex === index)!.values
const DESTRUCTION = talentRanksByName(TALENT_DATA.warlock, defaultConfig('warlock-destruction').talents)
const AFFLICTION = talentRanksByName(TALENT_DATA.warlock, defaultConfig('warlock-affliction').talents)
const periodicCrit = (id: number) => ((spell(id).misc!.attributes![8] ?? 0) & 0x200) !== 0

describe('rows against the Forever client (warlock.md §3)', () => {
  it('the direct spells: base points and variance, coefficients, costs, casts and cooldowns', () => {
    const rows: [typeof SHADOW_BOLT, number, number][] = [
      [SHADOW_BOLT, 25307, 0],
      [CONFLAGRATE, 18932, 0],
      [INCINERATE, 1293813, 0],
      [SHADOWBURN, 18871, 1],
    ]
    for (const [def, id, index] of rows) {
      const e = effect(id, index)
      const s = def.spellDef!
      const grow = def === SHADOWBURN ? 1.8 * 4 : 0
      expect(s.min, def.id).toBeCloseTo(e.effectBasePointsF! * (1 - (e.variance ?? 0) / 2) + grow, 9)
      expect(s.max, def.id).toBeCloseTo(e.effectBasePointsF! * (1 + (e.variance ?? 0) / 2) + grow, 9)
      expect(s.spCoefficient, def.id).toBe(e.effectBonusCoefficient)
      expect(def.costTenths, def.id).toBe(10 * manaCost(id))
      expect(def.castMs, def.id).toBe(spell(id).castTime?.base ?? 0)
      expect(def.cooldownMs, def.id).toBe(spell(id).cooldowns?.categoryRecoveryTime ?? spell(id).cooldowns?.recoveryTime ?? 0)
      expect(def.gcdMs, def.id).toBe(spell(id).cooldowns!.startRecoveryTime)
    }
    // Incinerate's +25% on your Immolate (#1, a dummy) keeps Immolate up.
    expect(INCINERATE.spellDef!.boost).toEqual({ aura: 'immolate', pct: effect(1293813, 1).effectBasePointsF, keep: true })
    // Conflagrate needs your Immolate (targetAuraSpell 1282590, the hidden Immolate aura) and consumes it.
    expect(spell(18932).auraRestrictions?.targetAuraSpell).toBe(1282590)
    expect(CONFLAGRATE.needsAuraId).toBe('immolate')
  })

  it('Immolate: its hit and ticks, the periodic-crit flag', () => {
    const s = IMMOLATE.spellDef!
    expect([s.min, s.spCoefficient]).toEqual([effect(25309, 1).effectBasePointsF, effect(25309, 1).effectBonusCoefficient])
    expect([s.dotTickDamage, s.dotSpCoefficient, s.dotTickMs]).toEqual([effect(25309, 0).effectBasePointsF, effect(25309, 0).effectBonusCoefficient, effect(25309, 0).effectAuraPeriod])
    expect(s.dotTicks! * s.dotTickMs!).toBe(spell(25309).duration!.duration)
    expect(s.dotCanCrit).toBe(periodicCrit(25309))
    expect([IMMOLATE.costTenths, IMMOLATE.castMs]).toEqual([10 * manaCost(25309), spell(25309).castTime!.base])
    expect(IMMOLATE.aura!.durationMs).toBe(spell(25309).duration!.duration)
  })

  it('the DoTs: ticks, periods, coefficients, costs and flags', () => {
    for (const [def, id] of [
      [CORRUPTION, 25311],
      [BANE_OF_AGONY, 11713],
      [BANE_OF_DOOM, 603],
      [SIPHON_LIFE, 18881],
    ] as const) {
      const s = def.spellDef!
      const e = effect(id, 0)
      expect([s.dotTickDamage, s.dotSpCoefficient, s.dotTickMs], def.id).toEqual([e.effectBasePointsF, e.effectBonusCoefficient, e.effectAuraPeriod])
      expect(s.dotTicks! * s.dotTickMs!, def.id).toBe(spell(id).duration!.duration)
      expect(s.dotCanCrit ?? false, def.id).toBe(periodicCrit(id))
      expect(def.costTenths, def.id).toBe(10 * manaCost(id))
      expect(def.castMs, def.id).toBe(spell(id).castTime?.base ?? 0)
      expect(def.aura!.durationMs, def.id).toBe(spell(id).duration!.duration)
    }
    expect(BANE_OF_DOOM.cooldownMs).toBe(spell(603).cooldowns!.recoveryTime)
    // Siphon Life's ticks never crit; the others' can.
    expect(periodicCrit(18881)).toBe(false)
  })

  it('Curse of the Elements, Life Tap and Demonic Sacrifice', () => {
    expect(effect(1311680, 1)).toMatchObject({ effectAura: 87, effectBasePointsF: CURSE_OF_THE_ELEMENTS.aura!.mods.schoolTaken, effectMiscValue: [126, 0] })
    expect(CURSE_OF_THE_ELEMENTS.aura!.durationMs).toBe(spell(1311680).duration!.duration)
    expect(CURSE_OF_THE_ELEMENTS.costTenths).toBe(10 * manaCost(1311680))
    expect(LIFE_TAP_BASE).toBe(effect(11689, 0).effectBasePointsF! + effect(11689, 0).effectRealPointsPerLevel! * (60 - spell(11689).levels!.baseLevel!))
    // The Imp's Burning Shadow is Shadow (aura 79, mask 32), the Succubus's Touch of Fire Fire (mask 4), 2 h.
    expect(effect(18789, 0)).toMatchObject({ effectAura: 79, effectMiscValue: [32, 0] })
    expect(effect(18791, 0)).toMatchObject({ effectAura: 79, effectMiscValue: [4, 0] })
    expect(demonicSacrifice('imp', 1000).aura!.mods.schoolDamage).toBe(effect(18789, 0).effectBasePointsF)
    expect(demonicSacrifice('imp', 1000).aura!.durationMs).toBe(spell(18789).duration!.duration)
    expect(effect(18792, 0).effectBasePointsF).toBe(2)
  })
})

describe('talents against their curves (warlock.md §4)', () => {
  it('reads each per-rank value the client carries', () => {
    expect(CURVE.improvedLifeTap).toEqual(curve('Improved Life Tap'))
    expect(CURVE.suppression).toEqual(curve('Suppression', 1))
    expect(CURVE.improvedCorruption).toEqual(curve('Improved Corruption', 1))
    expect(CURVE.improvedCorruptionCast.map((x) => -x)).toEqual(curve('Improved Corruption', 0))
    expect(CURVE.malediction).toEqual(curve('Malediction'))
    expect(CURVE.improvedBaneOfAgony).toEqual(curve('Improved Bane of Agony'))
    expect(CURVE.pandemic).toEqual(curve('Pandemic'))
    expect(CURVE.malevolence).toEqual(curve('Malevolence'))
    expect(CURVE.nightfall).toEqual(curve('Nightfall'))
    expect(CURVE.shadowMastery).toEqual(curve('Shadow Mastery'))
    expect(CURVE.demonicEmbrace).toEqual(curve('Demonic Embrace'))
    expect(CURVE.felVitality).toEqual(curve('Fel Vitality', 1))
    expect(CURVE.improvedShadowBolt).toEqual(curve('Improved Shadow Bolt'))
    expect(CURVE.baneCast.map((x) => -x)).toEqual(curve('Bane'))
    expect(CURVE.cataclysm.map((x) => -x)).toEqual(curve('Cataclysm'))
    expect(CURVE.aftermath).toEqual(curve('Aftermath', 1))
    expect(CURVE.ruin).toEqual(curve('Ruin'))
    expect(CURVE.agonizingFlames).toEqual(curve('Agonizing Flames', 1))
    expect(CURVE.fireAndBrimstone).toEqual(curve('Fire and Brimstone', 1))
    expect(CURVE.shadowAndFlame).toEqual(curve('Shadow and Flame', 2))
    expect(CURVE.shadowAndFlameKeep).toEqual(curve('Shadow and Flame', 1))
  })
})

describe('worked examples (warlock.md §10)', () => {
  it('1. Shadow Bolt: 253.29–282.71, and 654.71 on average with 500 Shadow spell damage', () => {
    const s = SHADOW_BOLT.spellDef!
    expect(s.min).toBeCloseTo(253.2863, 3)
    expect(s.max).toBeCloseTo(282.7137, 3)
    expect(((s.min + s.max) / 2 + s.spCoefficient * 500) * 0.94).toBeCloseTo(654.71, 2)
  })

  it('2. Immolate with Aftermath 5 and Agonizing Flames 3: its hit ×1.65, its ticks ×1.1', () => {
    const s = spellWithTalents(IMMOLATE.spellDef!, DESTRUCTION)
    expect(s.damageMult).toBeCloseTo(1.65, 12)
    expect(s.dotDamageMult).toBeCloseTo(1.1, 12)
    expect((158 + 0.2 * 400) * s.damageMult).toBeCloseTo(392.7, 9)
    expect((55 + 0.13 * 400) * s.dotDamageMult!).toBeCloseTo(117.7, 9)
  })

  it('3. costs with Cataclysm 3/3, rounded down', () => {
    const cost = (d: typeof SHADOW_BOLT) => withTalents(d, DESTRUCTION).costTenths / 10
    expect([cost(SHADOW_BOLT), cost(IMMOLATE), cost(CONFLAGRATE), cost(INCINERATE), cost(SHADOWBURN)]).toEqual([342, 342, 229, 292, 328])
  })

  it('4. casts with Bane 5/5 and Improved Corruption 5/5', () => {
    expect([withTalents(SHADOW_BOLT, AFFLICTION).castMs, withTalents(IMMOLATE, DESTRUCTION).castMs, withTalents(INCINERATE, DESTRUCTION).castMs]).toEqual([2500, 1500, 2000])
    expect(withTalents(CORRUPTION, AFFLICTION).castMs).toBe(0)
  })

  it('5. Ruin and Pandemic make a crit ×2.0; Fire and Brimstone +25% Conflagrate crit', () => {
    expect(spellWithTalents(INCINERATE.spellDef!, DESTRUCTION).critMultiplier).toBe(2)
    expect(spellWithTalents(CORRUPTION.spellDef!, AFFLICTION).critMultiplier).toBe(2)
    expect(spellWithTalents(CONFLAGRATE.spellDef!, DESTRUCTION).bonusCrit).toBe(25)
    expect(spellWithTalents(CORRUPTION.spellDef!, AFFLICTION).bonusCrit).toBe(5)
  })

  it('6. Life Tap: (424 + 220) × 1.2 = 772.8 mana', () => {
    expect(lifeTap(220, 2).manaTenths).toBe(7728)
    expect(lifeTap(220, 2).noThreat).toBe(true)
  })

  it('7. Corruption in the Affliction build: ×1.10 × 1.05 × 1.05 a tick', () => {
    expect(spellWithTalents(CORRUPTION.spellDef!, AFFLICTION).dotDamageMult).toBeCloseTo(1.21275, 12)
  })

  it('8. Bane of Doom: 3342 with 400 Shadow spell damage, 3684.56 with Malediction and Shadow Mastery', () => {
    const s = spellWithTalents(BANE_OF_DOOM.spellDef!, AFFLICTION)
    expect(1742 + s.dotSpCoefficient! * 400).toBe(3342)
    expect((1742 + s.dotSpCoefficient! * 400) * s.dotDamageMult!).toBeCloseTo(3684.555, 3)
  })

  it('9. Fel Energy: 2% of 6,518 mana every 4 s', () => {
    expect(demonicSacrifice('voidwalker', 6518)).toMatchObject({ rageTickTenths: 1303, rageTickMs: 4000, resource: 'mana', noThreat: true })
  })

  it('10. Spirit regeneration: 8 + 220 / 4 = 63 a tick', () => {
    expect(spiritRegenTickTenths(220, 'warlock')).toBe(630)
  })
})

function runFights(plan: Plan, fights: number): Aggregate {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}
const fixed = (spec: SimConfig['spec'], rotation: SimConfig['rotation'] = {}, extra: Partial<SimConfig> = {}): SimConfig => {
  const d = defaultConfig(spec)
  return { ...d, ...extra, rotation: { ...d.rotation, ...rotation }, run: { mode: 'fixed', iterations: 500, seed: 4242 } }
}
const row = (plan: Plan, id: string) => plan.sources.findIndex((s) => s.id === id)
const perFight = (plan: Plan, agg: Aggregate, id: string, field: keyof typeof FIELD) => agg.counters[row(plan, id) * FIELD_COUNT + FIELD[field]] / agg.fights

describe('the engine’s warlock pieces (warlock.md §8)', () => {
  it('a caster swings no weapon, and its plan has warlock mana: 8 + Spirit / 4', () => {
    const { plan, sheet } = buildPlan(fixed('warlock-destruction'))
    expect(plan.weapons).toEqual([null, null])
    expect(plan.mana!.regenTickTenths).toBe(spiritRegenTickTenths(sheet.spirit, 'warlock'))
    expect(plan.mana!.maxTenths).toBe(10 * sheet.mana!)
    expect(sheet.spell?.caster).toBeDefined()
  })

  it('Conflagrate needs Immolate: first on its lines, and never used without Immolate in the rotation', () => {
    const { plan } = buildPlan(fixed('warlock-destruction'))
    const conflag = plan.abilities.findIndex((a) => a.id === 'conflagrate')
    expect(plan.abilities[conflag].needsAura).toBe(plan.auras.findIndex((a) => a.id === 'immolate'))
    const without = { ...plan, rotation: plan.rotation.filter((e) => plan.abilities[e.ability].id !== 'immolate') }
    const agg = runFights(without, 200)
    expect(perFight(without, agg, 'conflagrate', 'casts')).toBe(0)
    expect(perFight(plan, runFights(plan, 200), 'conflagrate', 'casts')).toBeGreaterThan(10)
  })

  it('Conflagrate consumes Immolate unless Shadow and Flame keeps it: 5/5 keeps it every time', () => {
    const { plan } = buildPlan(fixed('warlock-destruction'))
    const conflag = plan.abilities.find((a) => a.id === 'conflagrate')!
    expect(conflag.consumesDot).toBe(plan.spells!.findIndex((s) => plan.sources[s.source].id === 'immolate'))
    expect(conflag.consumeChance).toBe(0)
    const consuming: Plan = { ...plan, abilities: plan.abilities.map((a) => (a.id === 'conflagrate' ? { ...a, consumeChance: 1 } : a)) }
    const kept = perFight(plan, runFights(plan, 300), 'immolate', 'casts')
    const eaten = perFight(consuming, runFights(consuming, 300), 'immolate', 'casts')
    // Each landed Conflagrate forces a new Immolate: about one per 10 s instead of one per 15 s.
    expect(eaten).toBeGreaterThan(kept * 1.3)
  })

  it('Incinerate deals 25% more to a target with your Immolate, which it leaves up', () => {
    const { plan } = buildPlan(fixed('warlock-destruction', { [DESTRUCTION_IDS.shadowburn]: false }))
    const inc = plan.spells!.find((s) => plan.sources[s.source].id === 'incinerate')!
    expect([plan.auras[inc.boostAura!].id, inc.boostPct, inc.boostKeep]).toEqual(['immolate', 25, true])
    const noImmolate: Plan = { ...plan, rotation: plan.rotation.filter((e) => plan.abilities[e.ability].id !== 'immolate') }
    const avg = (p: Plan) => {
      const agg = runFights(p, 300)
      return perFight(p, agg, 'incinerate', 'damage') / (perFight(p, agg, 'incinerate', 'hits') + perFight(p, agg, 'incinerate', 'crits'))
    }
    expect(avg(plan) / avg(noImmolate)).toBeGreaterThan(1.15)
  })

  it('Shadow Trance: Nightfall’s proc on Corruption’s ticks makes the next Shadow Bolt instant', () => {
    const { plan } = buildPlan(fixed('warlock-affliction'))
    const trance = plan.auras.findIndex((a) => a.id === 'shadowTrance')
    const bolt = plan.abilities.find((a) => a.id === 'shadowBolt')!
    expect([bolt.stackAura, bolt.stackCastPct, bolt.stackCostPct]).toEqual([trance, 100, 0])
    const nightfall = plan.procs.find((p) => p.id === 'nightfall')!
    expect([nightfall.chance[0], plan.sources[nightfall.fromSource!].id]).toEqual([0.04, 'corruption'])
    // The instant Shadow Bolt's line comes before the DoTs' fillers, on Shadow Trance.
    expect(plan.rotation.some((e) => plan.abilities[e.ability].id === 'shadowBolt' && e.conditions.some((c) => c.code === COND.auraUp && c.a === trance))).toBe(true)
    const agg = runFights(plan, 300)
    expect(agg.auraApplications[trance] / agg.fights).toBeGreaterThan(1)
  })

  it('Life Tap restores mana with no threat, and Demonic Sacrifice is up all fight', () => {
    const bundle = buildPlan(fixed('warlock-destruction'))
    const agg = runFights(bundle.plan, 200)
    expect(perFight(bundle.plan, agg, 'lifeTap', 'threat')).toBe(0)
    expect(agg.manaBySource[row(bundle.plan, 'lifeTap')]).toBeGreaterThan(0)
    const result = toResult(bundle, agg, 0)
    expect(result.cooldowns.find((c) => c.id === 'demonicSacrifice')!.uptimePct).toBeCloseTo(100, 6)
    expect(result.mana!.restored.map((r) => r.id)).toContain('lifeTap')
  })

  it('its own Curse of the Elements replaces the Buffs tab’s, and is up nearly all fight', () => {
    const d = defaultConfig('warlock-affliction')
    const buffs = { ...d.buffs, enabled: [...d.buffs.enabled, 'curseOfTheElements'] }
    const on = buildPlan(fixed('warlock-affliction', {}, { buffs }))
    expect(on.plan.schools?.taken[SCHOOL.shadow] ?? 1).toBe(1)
    expect(on.plan.auras.find((a) => a.id === 'curseOfTheElements')).toMatchObject({ schoolTaken: 10 })
    const off = buildPlan(fixed('warlock-affliction', { [AFFLICTION_IDS.curse]: false }, { buffs }))
    expect(off.plan.schools!.taken[SCHOOL.shadow]).toBeCloseTo(1.1, 12)
    expect(off.plan.abilities.some((a) => a.id === 'curseOfTheElements')).toBe(false)
  })

  it('Bane of Doom: cast only while 61 s are left, then Bane of Agony', () => {
    const { plan } = buildPlan(fixed('warlock-affliction'))
    const doom = plan.rotation.find((e) => plan.abilities[e.ability].id === 'baneOfDoom')!
    expect(doom.conditions).toContainEqual({ code: COND.timeLeftAtLeast, a: 61000, b: 0 })
    const agony = plan.rotation.find((e) => plan.abilities[e.ability].id === 'baneOfAgony')!
    expect(agony.conditions).toContainEqual({ code: COND.timeLeftAtMost, a: 61000, b: 0 })
  })

  it('Destruction casts its Bane and Corruption too: Doom then Agony by default, or Agony, or none', () => {
    const ids = (p: Plan) => p.rotation.map((e) => p.abilities[e.ability].id)
    const { plan } = buildPlan(fixed('warlock-destruction'))
    // After Shadowburn, before the filler (warlock.md §6.1).
    expect(ids(plan).slice(ids(plan).indexOf('shadowburn'), ids(plan).indexOf('incinerate'))).toEqual(['shadowburn', 'corruption', 'baneOfDoom', 'baneOfAgony', 'lifeTap'])
    const agg = runFights(plan, 200)
    for (const id of ['corruption', 'baneOfDoom', 'baneOfAgony']) expect(perFight(plan, agg, id, 'damage'), id).toBeGreaterThan(0)
    expect(perFight(plan, agg, 'baneOfDoom', 'casts')).toBeGreaterThanOrEqual(1)

    const agony = buildPlan(fixed('warlock-destruction', { [DESTRUCTION_IDS.bane]: 'agony', [DESTRUCTION_IDS.corruption]: false })).plan
    expect(ids(agony).filter((id) => id.startsWith('bane') || id === 'corruption')).toEqual(['baneOfAgony'])
    expect(perFight(agony, runFights(agony, 200), 'baneOfAgony', 'casts')).toBeGreaterThan(5)

    const none = buildPlan(fixed('warlock-destruction', { [DESTRUCTION_IDS.bane]: 'none', [DESTRUCTION_IDS.corruption]: false })).plan
    expect(none.abilities.filter((a) => a.id.startsWith('bane') || a.id === 'corruption')).toEqual([])
  })
})

describe('Destruction’s sim-ranked gear (warlock.md §7.3)', () => {
  // Paired runs (same seed, same fights) of the default Destruction setup with one item swapped.
  const dpsWith = (gear: Partial<SimConfig['gear']>) => {
    const d = fixed('warlock-destruction')
    const bundle = buildPlan({ ...d, gear: { ...d.gear, ...gear } })
    return toResult(bundle, runFights(bundle.plan, 300), 0).dps.mean
  }

  it('keeps Therazane’s Touch (+31 to every school) over Tome of Fiery Arcana (+40 Fire)', () => {
    // The default Fire build still casts Shadowburn, Corruption and Bane of Doom, so +1 Fire is worth
    // about 70% of +1 to every school: the Tome ranks second (about −1.6 DPS).
    expect(defaultConfig('warlock-destruction').gear.offHand?.itemId).toBe(19315)
    const tome = dpsWith({ offHand: { itemId: 19311 } })
    const base = dpsWith({})
    expect(base).toBeGreaterThan(tome)
    expect(base - tome).toBeLessThan(5)
  })

  it('beats the guide’s shared Shadow list it replaced', () => {
    // The old default: Deathmist Mask and Wraps, Star of Mystaria, Amplifying Cloak, Robe of the Void,
    // Sublime Wristguards, Skyshroud Leggings, Maleki's Footwraps, Skul's Ghastly Touch, the two Blackrock
    // Depths rings, Eye of the Beast and Blade of the New Moon (447.6 DPS on seed 2701, §6.3).
    const old = dpsWith({
      head: { itemId: 22074, enchantId: 'arcanumFocus' },
      neck: { itemId: 12103 },
      back: { itemId: 18350 },
      chest: { itemId: 14153, enchantId: 'chestGreaterStats' },
      wrist: { itemId: 18497 },
      hands: { itemId: 22077, enchantId: 'gloveMinorHaste' },
      legs: { itemId: 13170, enchantId: 'arcanumFocus' },
      feet: { itemId: 18735 },
      ranged: { itemId: 13396 },
      finger1: { itemId: 12543 },
      finger2: { itemId: 12545 },
      trinket2: { itemId: 13968 },
      mainHand: { itemId: 18372, enchantId: 'weaponSpellPower' },
    })
    expect(dpsWith({}) / old).toBeGreaterThan(1.25)
  })
})

describe('golden runs (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - K3: the default Destruction warlock (warlock.md §6.1, §7): Fire, the Succubus sacrificed,
  //   Immolate, Conflagrate, Shadowburn and Incinerate, Life Tap at 5%; 397.8 DPS over 20,000 fights on
  //   seed 2701 (§6.3).
  // - K3: the default Affliction warlock (§6.2, §7): the Imp, Corruption, Bane of Doom then Agony,
  //   Siphon Life, Shadow Bolt with Shadow Trance, Life Tap at 10%; 402.0 DPS on the same.
  // - WL1 (K3 review): Destruction casts Corruption and its Bane too, Bane of Doom then Agony for the last
  //   minute, after Shadowburn (§6.1); 447.6 DPS over 20,000 fights on seed 2701, up from 398.1 (§6.3).
  // - Issue #16: Destruction wears its own sim-ranked Fire list (§7.3) instead of the guide's Shadow
  //   list shared by every warlock: Mindfang, the Bloodvine Garb, the Dreadweave cowl, Rockfury Bracers
  //   and eight more swaps; 586.0 DPS over 20,000 fights on seed 2701, up from 447.6. Affliction's is
  //   unchanged.
  for (const spec of ['warlock-destruction', 'warlock-affliction'] as const) {
    it(`keeps the default ${spec}’s result unchanged`, () => {
      const bundle = buildPlan({ ...defaultConfig(spec), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
      const result = toResult(bundle, runFights(bundle.plan, 1000), 0)
      expect({
        dps: result.dps,
        abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses]),
        cooldowns: result.cooldowns.map((c) => [c.id, c.castsPerFight, c.uptimePct]),
        mana: result.mana,
      }).toMatchSnapshot()
    })
  }

  it('is deterministic: the same config and seed give the same result', () => {
    for (const spec of ['warlock-destruction', 'warlock-affliction'] as const) {
      const run = () => {
        const bundle = buildPlan({ ...defaultConfig(spec), run: { mode: 'fixed', iterations: 500, seed: 777 } })
        return JSON.stringify(toResult(bundle, runFights(bundle.plan, 500), 0).abilities)
      }
      expect(run()).toBe(run())
    }
  })
})
