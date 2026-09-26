// The paladin's worked examples through the engine (docs/classes/paladin.md#worked-examples), and
// its seals, judgements, mana, threat and determinism. The examples' inputs are synthetic test
// inputs (test-helpers.ts `examplePlan`), not base stats. Example 12 (Holy Shield) needs the
// tank's Holy Shield row and example 17 (Twist of Light) seal twisting; they come with the
// Protection slice and C2.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { runChunk } from '../../engine/chunk'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { expectMean } from '../../engine/test-helpers'
import { buildPlan } from '../../plan/build'
import { type AbilityDef, ACTION, COND, type Plan, type RotationCondition, SCHOOL, TRIGGER } from '../../plan/types'
import {
  CONSECRATION,
  CONSECRATION_RANK1,
  EXORCISM_ABILITY,
  HAMMER_OF_WRATH_ABILITY,
  HOLY_STRIKE_ABILITY,
  JOTC_REFRESH,
  JUDGE_COMMAND,
  JUDGE_CRUSADER,
  JUDGE_FURY,
  JUDGE_RIGHTEOUSNESS,
  SEAL_OF_COMMAND,
  SEAL_OF_FURY,
  SEAL_OF_RIGHTEOUSNESS,
  SEAL_OF_THE_CRUSADER,
  manaCostOf,
  sealProcs,
} from './abilities'
import { EZ_THRO_DARK_BOMB_SPELL } from '../../effects/buffs'
import { withTalents, withSpellTalents } from './talents'
import { addPaladinAbility, addProcSpec, damagesOf, examplePlan, row } from './test-helpers'

const IMPROVED_SEALS = { 'Improved Seals': 3 }
const ranks = (r: Record<string, number>) => new Map(Object.entries(r))

const line = (plan: Plan, ability: number, conditions: RotationCondition[] = []) => plan.rotation.push({ ability, conditions, unqueueBelowTenths: 0 })
/** An ability used once, at the start of the fight, off the GCD. */
function once(plan: Plan, def: AbilityDef): number {
  const a = addPaladinAbility(plan, { ...def, cooldownMs: 1e9, gcdMs: 0, castMs: 0 })
  line(plan, a)
  return a
}
/**
 * A seal up from 1.5 s before the pull (and, with `keepUp`, recast 1.5 s before it ends, as the
 * core rotation does), and its procs for the plan's weapon (setup.ts paladinProcs).
 */
function withSeal(plan: Plan, seal: AbilityDef, talents: Record<string, number> = {}, keepUp = true): number {
  const a = addPaladinAbility(plan, seal)
  plan.prepull = { casts: [...plan.prepull.casts, { ability: a, atMs: -1500 }], chargeTenths: 0, keepTenths: -1 }
  if (keepUp) line(plan, a, [{ code: COND.abilityAuraRefresh, a, b: 1500 }])
  const w = plan.weapons[0]!
  for (const p of sealProcs({ speedSec: w.speedSec, twoHand: w.twoHand }, (s) => withSpellTalents(s, ranks(talents)))) {
    if (p.requiresAura === seal.id) addProcSpec(plan, p)
  }
  return a
}
const counter = (sim: Sim, plan: Plan, id: string, field: number) => sim.counters[row(plan, id) * FIELD_COUNT + field]
const sealProc = (plan: Plan) => plan.procs.find((p) => p.id === 'sealOfCommandProc')!

describe('worked example 1: Seal of Command procs 7 times a minute from base weapon speed', () => {
  it('has a 40.83% chance per landed white hit at 3.5 speed and a 1 s internal cooldown; haste doesn’t change it', () => {
    const plan = examplePlan()
    expect(sealProc(plan).chance[0]).toBeCloseTo(0.40833, 5)
    expect(sealProc(plan).icdMs).toBe(1000)
    // The plan builder's chance for the default weapon: 7 × its base speed / 60.
    const real = buildPlan(defaultConfig('paladin-retribution')).plan
    expect(sealProc(real).chance[0]).toBeCloseTo((7 * real.weapons[0]!.speedSec) / 60, 12)
  })

  it('procs from 40.83% of landed white hits, 10% haste or not', () => {
    for (const haste of [1, 1.1]) {
      const plan = examplePlan({ durationMs: 180000 })
      plan.stats.haste = haste
      const sim = new Sim(plan)
      for (let i = 0; i < 100; i++) sim.runFight(i)
      // Landed white hits: hits and glancing blows (no crits, dodges or blocks here).
      const whites = sim.counters[FIELD.hits] + sim.counters[FIELD.glances]
      const procs = counter(sim, plan, 'sealOfCommandProc', FIELD.casts)
      expect(Math.abs(procs / whites - 0.40833)).toBeLessThan(4 * Math.sqrt((0.40833 * 0.59167) / whites))
    }
  })
})

describe('worked example 2: Seal of Command’s proc damage', () => {
  it('is 0.70 × (weapon + AP × speed / 14 + 0.29 × SP): 370.3 to 440.3, 405.3 on average', () => {
    const procs = damagesOf(examplePlan(), 'sealOfCommandProc', 40)
    expect(Math.min(...procs)).toBeGreaterThanOrEqual(370.3 - 1e-9)
    expect(Math.max(...procs)).toBeLessThanOrEqual(440.3 + 1e-9)
    expectMean(procs, 405.3)
  })

  it('is ×1.15 with Improved Seals 3/3 (466.09), ×2 on a crit (932.18), and Two-Handed Weapon Specialization doesn’t touch it', () => {
    const fixed = { min: 250, max: 250, speedSec: 3.5 }
    expect(damagesOf(examplePlan({ weapon: fixed, talents: IMPROVED_SEALS }), 'sealOfCommandProc')[0]).toBeCloseTo(466.095, 9)
    const twoHander = examplePlan({ weapon: fixed, talents: { ...IMPROVED_SEALS, 'Two-Handed Weapon Specialization': 3 } })
    // 2 / 4 / 6% since 1.60.1.70009 (20111).
    expect(twoHander.physicalMult).toBeCloseTo(1.06, 12)
    expect(damagesOf(twoHander, 'sealOfCommandProc')[0]).toBeCloseTo(466.095, 9)
    const crits = examplePlan({ weapon: fixed, talents: IMPROVED_SEALS })
    crits.stats.crit = 100
    expect(damagesOf(crits, 'sealOfCommandProc')[0]).toBeCloseTo(932.19, 9)
  })
})

describe('worked examples 3 and 4: Judgement of Command and Judgement of Righteousness', () => {
  it('JoC: (339–373)/2 + 0.429 × SP, 220.9 on average and 254.04 with Improved Seals; it can’t miss', () => {
    const plan = examplePlan()
    plan.stats.hit = -100 // every special that can miss would
    const joc = damagesOf(plan, 'judgementOfCommand', 40)
    expect(Math.min(...joc)).toBeGreaterThanOrEqual(169.5 + 42.9 - 1e-6)
    expect(Math.max(...joc)).toBeLessThanOrEqual(186.5 + 42.9 + 1e-6)
    expectMean(joc, 220.9)
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(counter(sim, plan, 'judgementOfCommand', FIELD.misses)).toBe(0)
    expect(counter(sim, plan, 'judgementOfCommand', FIELD.casts)).toBeGreaterThan(5)
    expectMean(damagesOf(examplePlan({ talents: IMPROVED_SEALS }), 'judgementOfCommand', 40), 254.035)
  })

  it('JoR r8 at 60: (170–186) + 0.5 × SP, 228 on average and 262.2 with Improved Seals; it can miss', () => {
    const jorPlan = (talents: Record<string, number> = {}) => {
      const plan = examplePlan({ core: false, talents })
      const seal = withSeal(plan, SEAL_OF_RIGHTEOUSNESS, talents)
      line(plan, addPaladinAbility(plan, withTalents(JUDGE_RIGHTEOUSNESS, ranks(talents))), [{ code: COND.abilityAuraUp, a: seal, b: 0 }])
      return plan
    }
    const jor = damagesOf(jorPlan(), 'judgementOfRighteousness', 40)
    expect(Math.min(...jor)).toBeGreaterThanOrEqual(170 + 50 - 1e-6)
    expect(Math.max(...jor)).toBeLessThanOrEqual(186 + 50 + 1e-6)
    expectMean(jor, 228)
    expectMean(damagesOf(jorPlan(IMPROVED_SEALS), 'judgementOfRighteousness', 40), 262.2)
    const missing = jorPlan()
    missing.stats.hit = -100
    const sim = new Sim(missing)
    sim.runFight(0)
    expect(counter(sim, missing, 'judgementOfRighteousness', FIELD.misses)).toBe(counter(sim, missing, 'judgementOfRighteousness', FIELD.casts))
  })
})

describe('worked example 5: Holy Strike', () => {
  it('is 0.50 × normalized main hand + 81–105 + 0.429 × SP = 402.33 (its tooltip’s reading); with Sacred Arbiter 482.79, from 438.84 to 526.74; armor doesn’t touch it', () => {
    const fixed = examplePlan({ core: false, weapon: { min: 250, max: 250, speedSec: 3.5 } })
    once(fixed, HOLY_STRIKE_ABILITY)
    expectMean(damagesOf(fixed, 'holyStrike', 400), 402.329)
    const arbiter = (armor: number) => {
      const plan = examplePlan({ core: false, talents: { 'Sacred Arbiter': 1 } })
      plan.fight.targetArmor = armor
      once(plan, withTalents(HOLY_STRIKE_ABILITY, ranks({ 'Sacred Arbiter': 1 })))
      return damagesOf(plan, 'holyStrike', 400)
    }
    const hs = arbiter(0)
    expect(Math.min(...hs)).toBeGreaterThanOrEqual(438.84 - 0.01)
    expect(Math.max(...hs)).toBeLessThanOrEqual(526.74 + 0.01)
    expectMean(hs, 482.794)
    expect(arbiter(5000)).toEqual(hs)
  })
})

describe('worked example 6: Seal of Righteousness', () => {
  const sor = (twoHand: boolean, talents: Record<string, number> = {}) => {
    const plan = examplePlan({ core: false, talents, weapon: { min: 200, max: 300, speedSec: 3.5, twoHand } })
    withSeal(plan, SEAL_OF_RIGHTEOUSNESS, talents)
    return damagesOf(plan, 'sealOfRighteousnessProc')
  }
  it('deals 35 + 1.2 × 18.80 × 3.5 + 0.1 × SP = 123.96 on every landed swing with a two-hander, 142.55 with Improved Seals, 100.93 one-handed', () => {
    const twoHand = sor(true)
    expect(twoHand.length).toBe(Math.ceil(60000 / 3500))
    for (const d of twoHand) expect(d).toBeCloseTo(123.96, 9)
    expect(sor(true, IMPROVED_SEALS)[0]).toBeCloseTo(142.554, 9)
    expect(sor(false)[0]).toBeCloseTo(100.93, 9)
  })
})

describe('worked example 7: Consecration on one target', () => {
  it('rank 5 at SP 300: 67.5 a tick, 540 over 8 s; rank 1: 276', () => {
    for (const [def, tick, total] of [
      [CONSECRATION, 67.5, 540],
      [CONSECRATION_RANK1, 34.5, 276],
    ] as const) {
      const plan = examplePlan({ core: false, sp: 300, durationMs: 9000 })
      once(plan, def)
      const ticks = damagesOf(plan, def.id)
      expect(ticks.length).toBe(8)
      for (const d of ticks) expect(d).toBeCloseTo(tick, 9)
      expect(ticks.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 9)
    }
  })
})

describe('Consecration recast on its cooldown', () => {
  it('keeps all 8 ticks of each cast: the 8th lands at the recast, before the new ticks start', () => {
    const plan = examplePlan({ core: false, sp: 0, durationMs: 60000 })
    const a = addPaladinAbility(plan, CONSECRATION)
    line(plan, a)
    plan.mana = { ...plan.mana!, maxTenths: 1e9 }
    const sim = new Sim(plan)
    const casts: number[] = []
    const ticks: number[] = []
    sim.castTrace = (ab, t) => ab === a && casts.push(t)
    sim.trace = (source, _hand, t) => source === row(plan, 'consecration') && ticks.push(t)
    sim.runFight(0)
    // The real 8 s cooldown: casts at 0, 8, …, 56 s; a tick every second from 1 s to 59 s.
    expect(casts).toEqual([0, 8000, 16000, 24000, 32000, 40000, 48000, 56000])
    expect(ticks).toEqual(Array.from({ length: 59 }, (_, k) => 1000 * (k + 1)))
    for (const c of casts.slice(0, -1)) expect(ticks.filter((t) => t > c && t <= c + 8000).length, `cast at ${c}`).toBe(8)
    // Each tick rolled once: 7 whole casts and the last one's 3 before the fight ends.
    const r = row(plan, 'consecration') * FIELD_COUNT
    expect(sim.counters[r + FIELD.hits] + sim.counters[r + FIELD.crits] + sim.counters[r + FIELD.misses]).toBe(7 * 8 + 3)
  })
})

describe('worked example 8: the Retribution mana cycle', () => {
  // 1.60.1.70009 made Improved Holy Strike's cut baseline: Holy Strike every 10 s, 3 in 30 s.
  const RET = { Benediction: 5, 'Sanctified Judgement': 3, 'Improved Judgement': 2 }
  it('Judgement costs 81 and returns 126 (+45); Seal of Command 189 (147 with Twist of Light); Holy Strike 18: 74.25 mana over 30 s (32.25)', () => {
    const t = ranks(RET)
    const judge = withTalents(JUDGE_COMMAND, t)
    expect(manaCostOf(judge)).toBe(81)
    expect(judge.manaReturnTenths).toBe(1260)
    expect(judge.manaReturnChance).toBe(1)
    expect(judge.cooldownMs).toBe(8000)
    const seal = withTalents(SEAL_OF_COMMAND, t)
    expect(manaCostOf(seal)).toBe(189)
    const strike = withTalents(HOLY_STRIKE_ABILITY, t)
    expect(manaCostOf(strike)).toBe(18)
    expect(strike.cooldownMs).toBe(10000)
    const cycle = (sealCost: number) => sealCost + (30000 / strike.cooldownMs) * manaCostOf(strike) - 3.75 * (judge.manaReturnTenths! / 10 - manaCostOf(judge))
    expect(cycle(manaCostOf(seal))).toBeCloseTo(74.25, 9)
    // Twist of Light's −20% on the seal, added to Benediction's −10% [?]: 210 × 0.7 = 147.
    const twisted = withTalents(SEAL_OF_COMMAND, ranks({ ...RET, 'Twist of Light': 1 }))
    expect(manaCostOf(twisted)).toBe(147)
    expect(cycle(manaCostOf(twisted))).toBeCloseTo(32.25, 9)
  })

  it('in a fight: each landed Judgement of Command pays 81 and gets 126 back', () => {
    const plan = examplePlan({ talents: RET, durationMs: 25000 })
    plan.mana = { ...plan.mana!, regenTickTenths: 0, mp5TickTenths: 0 }
    // A 1000-mana sink at the pull, so the returns aren't capped at the maximum.
    const sink = addPaladinAbility(plan, { ...SEAL_OF_THE_CRUSADER, id: 'sink', aura: null, costTenths: 10000, gcdMs: 0, cooldownMs: 1e9 })
    plan.rotation.unshift({ ability: sink, conditions: [], unqueueBelowTenths: 0 })
    const sim = new Sim(plan)
    sim.runFight(0)
    // Judgements at 0, 8, 16 and 24 s; the seal went up before the pull (free) and needs no recast in 25 s.
    expect(counter(sim, plan, 'judgementOfCommand', FIELD.casts)).toBe(4)
    expect(sim.totalManaSpentTenths).toBe(10 * (1000 + 4 * 81))
    expect(sim.totalManaGainedTenths).toBe(10 * 4 * 126)
  })
})

describe('worked example 9: damage multipliers', () => {
  it('a white hit: 2HWS 3/3 × Vengeance 3/3 at 3 stacks = ×1.1554; a Seal of Command proc ×1.2535', () => {
    const talents = { 'Two-Handed Weapon Specialization': 3, Vengeance: 3, ...IMPROVED_SEALS }
    const plan = examplePlan({ talents, weapon: { min: 250, max: 250, speedSec: 3.5 } })
    plan.stats.crit = 100
    // A target below your level: no glancing blows, so every white hit crits (×2).
    plan.fight.targetLevel = 59
    const white = damagesOf(plan, 'mainHand')
    // By the fourth white hit, the crits before it (white hits, seal procs, judgements) have given
    // Vengeance's three stacks (1.60.1.70009; 2HWS 2 / 4 / 6%).
    expect(white[3]).toBeCloseTo((250 + 300) * 2 * 1.06 * 1.09, 9)
    expect(white[6]).toBeCloseTo(white[3], 9)
    expect(1.06 * 1.09).toBeCloseTo(1.1554, 9)
    const procs = damagesOf(plan, 'sealOfCommandProc')
    const base = 0.7 * (250 + 300) + 0.203 * 100
    expect(Math.max(...procs)).toBeCloseTo(base * 2 * 1.2535, 1)
  })
})

describe('worked example 10: Hammer of Wrath', () => {
  it('is 498 + 0.429 × SP on average (626.7 at SP 300), and instant with Instrument of Law 2/2 but still on a 1 s GCD', () => {
    const law = withTalents(HAMMER_OF_WRATH_ABILITY, ranks({ 'Instrument of Law': 2 }))
    expect(law.castMs).toBe(0)
    expect(law.gcdMs).toBe(1000)
    expect(withTalents(HAMMER_OF_WRATH_ABILITY, ranks({ 'Instrument of Law': 1 })).castMs).toBe(500)
    const plan = examplePlan({ core: false, sp: 300 })
    const how = addPaladinAbility(plan, { ...law, cooldownMs: 0 })
    line(plan, how)
    // Only in the execute phase (the last 20% of the fight).
    const sim = new Sim(plan)
    const times: number[] = []
    sim.castTrace = (a, t) => a === how && times.push(t)
    sim.runFight(0)
    expect(Math.min(...times)).toBeGreaterThanOrEqual(0.8 * 60000 - 1)
    expectMean(damagesOf(plan, 'hammerOfWrath', 100), 626.7)
  })
})

describe('Hammer of Wrath’s 1 s cast, without Instrument of Law [?] (paladin.md#other-abilities, OQ 22)', () => {
  it('stops auto attacks, which start again from a full swing when it ends, and holds the off-GCD Judgement until then', () => {
    const plan = examplePlan({ core: false, weapon: { min: 200, max: 300, speedSec: 2.5 }, durationMs: 20000 })
    plan.fight.executePct = 100 // the execute phase from the pull
    plan.mana = { ...plan.mana!, maxTenths: 1e9 }
    const how = addPaladinAbility(plan, HAMMER_OF_WRATH_ABILITY)
    expect(plan.abilities[how]).toMatchObject({ castMs: 1000, castStopsSwings: true, castHoldsOffGcd: true })
    line(plan, how)
    const seal = withSeal(plan, SEAL_OF_COMMAND)
    // A 7.5 s Judgement: ready in the middle of the second cast.
    const joc = addPaladinAbility(plan, { ...JUDGE_COMMAND, cooldownMs: 7500 })
    line(plan, joc, [{ code: COND.abilityAuraUp, a: seal, b: 0 }])
    const sim = new Sim(plan)
    const casts: number[] = []
    const judged: number[] = []
    const swings: number[] = []
    sim.castTrace = (a, t) => (a === how ? casts : a === joc ? judged : []).push(t)
    sim.trace = (source, hand, t) => hand === 0 && source === row(plan, 'mainHand') && swings.push(t)
    sim.runFight(0)
    // The cooldown starts when the 1 s cast ends: casts at 0, 7 and 14 s.
    expect(casts).toEqual([0, 7000, 14000])
    const during = (t: number) => casts.some((c) => t >= c && t < c + 1000)
    // No white swing during a cast, and the next a full 2.5 s after it ends: the swing due at the
    // pull waits for the first cast (1 + 2.5 s), the one due at 8.5 s for the second (8 + 2.5 s).
    expect(swings).toEqual([3500, 6000, 10500, 13000, 17500])
    expect(swings.filter(during)).toEqual([])
    // Judgement, off the GCD, waits for the cast too: ready at 7.5 s, in the middle of the second
    // cast, it's used as the cast ends at 8 s. (The one at the pull comes before the first cast,
    // whose execute phase starts at that very moment.)
    expect(judged).toEqual([0, 8000, 15500])
    expect(judged.filter((t) => t > 0 && during(t))).toEqual([])
  })
})

describe('worked example 11: Judgement of the Crusader’s bonus (the default coefficient rule)', () => {
  it('adds 161 × 0.429 = 69.07 to an Exorcism and 161 × 0.203 = 32.68 to a Seal of Command proc', () => {
    const fixed = { min: 250, max: 250, speedSec: 3.5 }
    const plan = (jotc: boolean) => {
      const p = examplePlan({ weapon: fixed, core: false })
      withSeal(p, SEAL_OF_COMMAND)
      if (jotc) once(p, JUDGE_CRUSADER)
      once(p, EXORCISM_ABILITY)
      return p
    }
    const exo = (jotc: boolean) => avg(damagesOf(plan(jotc), 'exorcism', 200))
    expect(exo(true) - exo(false)).toBeCloseTo(161 * 0.429, 0)
    const soc = (jotc: boolean) => damagesOf(plan(jotc), 'sealOfCommandProc')[0]
    expect(soc(true) - soc(false)).toBeCloseTo(161 * 0.203, 9)
  })

  it('lasts 40 s, always lands, is one per paladin with the other judgement debuffs, and your auto attacks refresh it', () => {
    const plan = examplePlan({ core: false, durationMs: 120000 })
    once(plan, JUDGE_CRUSADER)
    const aura = plan.auras.findIndex((a) => a.id === 'judgementOfTheCrusader')
    expect(plan.auras[aura]).toMatchObject({ durationMs: 40000, holyTaken: 161, group: 'judgementDebuff' })
    // Without its refresh, it's up for 40 s; with it, the whole fight.
    expect(upMs(plan, aura)).toBe(40000)
    addProcSpec(plan, JOTC_REFRESH)
    expect(upMs(plan, aura)).toBe(120000)
  })
})

describe('worked example 13: Seal of Fury and Judgement of Fury (Protection)', () => {
  it('at SP 300 with a 2.7 s one-hander: 35 + 0.85 × 16.91 × 2.7 + 30 = 103.81 Holy a landed swing, 166.10 threat with Righteous Fury; JoF 295 on average, 339.25 with Improved Seals', () => {
    const plan = examplePlan({ spec: 'paladin-protection', sp: 300, weapon: { min: 150, max: 150, speedSec: 2.7, twoHand: false } })
    expect(plan.holyThreatMult).toBeCloseTo(1.6, 12)
    const sim = new Sim(plan)
    sim.runFight(0)
    const procs = counter(sim, plan, 'sealOfFuryProc', FIELD.hits)
    expect(counter(sim, plan, 'sealOfFuryProc', FIELD.damage) / procs).toBeCloseTo(35 + 0.85 * 16.91 * 2.7 + 30, 9)
    expect(counter(sim, plan, 'sealOfFuryProc', FIELD.threat) / procs).toBeCloseTo((35 + 0.85 * 16.91 * 2.7 + 30) * 1.6, 9)
    expectMean(damagesOf(plan, 'judgementOfFury', 40), 160 + 135)
    const improved = examplePlan({ spec: 'paladin-protection', sp: 300, talents: IMPROVED_SEALS })
    expectMean(damagesOf(improved, 'judgementOfFury', 40), 339.25)
  })
})

describe('worked example 14: Holy Strike threat with Righteous Fury and Iron Creed 5/5', () => {
  it('is damage × 1.6 × 1.25', () => {
    const plan = examplePlan({ spec: 'paladin-protection', core: false, talents: { 'Iron Creed': 5 } })
    once(plan, withTalents(HOLY_STRIKE_ABILITY, ranks({ 'Iron Creed': 5 })))
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(counter(sim, plan, 'holyStrike', FIELD.threat) / counter(sim, plan, 'holyStrike', FIELD.damage)).toBeCloseTo(2, 12)
  })
})

describe('worked example 15: Shield Specialization', () => {
  it('restores 6% of maximum mana on a block, at most every 3 s', () => {
    const withShield = buildPlan({ ...defaultConfig('paladin-protection'), buffs: { raid: [], enabled: [] } }).plan
    const shieldSpec = withShield.procs.find((p) => p.id === 'shieldSpecialization')!
    expect(shieldSpec).toMatchObject({ icdMs: 3000, amount: 6, chance: [1, 1] })
    // Blocks at 0, 1, 2 and 3 s with 6000 mana: the ones at 0 and 3 s restore 360 each (at exactly
    // 3 s the ICD has ended), 720 in all.
    const s = withShield.stats
    withShield.mana = { ...withShield.mana!, maxTenths: 60000, regenTickTenths: 0, mp5TickTenths: 0 }
    s.dodge = -100
    s.parry = -100
    s.block = 100
    // Defense 190: the boss never misses (combat-tables §8).
    s.defense = -110
    s.defenseRating = 0
    withShield.fight.durationMs = 3500
    withShield.fight.variation = 0
    withShield.fight.bossSwing = { ...withShield.fight.bossSwing!, speedSec: 1, parryHaste: false, canCrush: false }
    withShield.abilities = []
    withShield.rotation = []
    withShield.prepull = { casts: [], chargeTenths: 0, keepTenths: -1 }
    // A 3000-mana sink at the pull, so the blocks' mana isn't capped.
    const sink = addPaladinAbility(withShield, { ...JUDGE_FURY, category: undefined, costTenths: 30000, cooldownMs: 1e9 })
    withShield.abilities[sink].kind = 'cast'
    line(withShield, sink)
    expect(new Sim(withShield).inspect().maxMana).toBe(6000)
    const sim = new Sim(withShield)
    const blocks: number[] = []
    sim.bossTrace = (t) => blocks.push(t)
    sim.runFight(0)
    expect(blocks).toEqual([0, 1000, 2000, 3000])
    expect(sim.totalManaGainedTenths).toBe(7200)
  })
})

describe('worked example 16: Seal of Command’s internal cooldown with Windfury', () => {
  it('a Windfury extra attack right after a proc can’t proc it again; the next white hit can', () => {
    const plan = examplePlan({ weapon: { min: 250, max: 250, speedSec: 3.5 }, durationMs: 3600 })
    sealProc(plan).chance = [1, 1]
    // Windfury on every hit: an extra attack at once, its own chain bit.
    plan.sources.push({ id: 'windfury', name: 'Windfury', icon: 'x' })
    plan.procs.push({ id: 'windfury', name: 'Windfury', trigger: 0, chance: [1, 1], hands: 1, icdMs: 100, action: 0, amount: 1, a: 0, b: 0, school: 0, source: plan.sources.length - 1, chainBit: 1 })
    plan.triggers[0].push(plan.procs.length - 1)
    const sim = new Sim(plan)
    sim.runFight(0)
    // White hits at 0 and 3.5 s, each with a Windfury attack: two procs, not four.
    expect(counter(sim, plan, 'windfury', FIELD.casts)).toBe(2)
    expect(counter(sim, plan, 'sealOfCommandProc', FIELD.casts)).toBe(2)
  })
})

describe('worked example 18: Judgement doesn’t consume the seal', () => {
  it('Seal of Command stays up through each Judgement, and the next white hit can proc it', () => {
    const plan = examplePlan({ durationMs: 25000 })
    const seal = plan.auras.findIndex((a) => a.id === 'sealOfCommand')
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(counter(sim, plan, 'judgementOfCommand', FIELD.casts)).toBe(Math.ceil(25000 / 10000))
    expect(sim.auraUpMs[seal]).toBe(25000)
    // The seal went up before the pull and needed no recast: its only cast is the pre-pull one.
    expect(counter(sim, plan, 'sealOfCommand', FIELD.casts)).toBe(1)
    expect(counter(sim, plan, 'sealOfCommandProc', FIELD.casts)).toBeGreaterThan(0)
  })
})

describe('worked example 19: Vengeance', () => {
  it('3/3: each crit adds a stack of +3% Physical and Holy damage for 30 s, up to 3 (1.60.1.70009)', () => {
    const plan = examplePlan({ core: false, talents: { Vengeance: 3 }, weapon: { min: 250, max: 250, speedSec: 3.5 } })
    plan.stats.crit = 100
    plan.fight.targetLevel = 59 // no glancing blows: every white hit crits
    const white = damagesOf(plan, 'mainHand')
    for (let k = 0; k < 7; k++) expect(white[k] / white[0]).toBeCloseTo(1 + 0.03 * Math.min(k, 3), 12)
    const aura = plan.auras.find((a) => a.id === 'vengeance')!
    expect(aura).toMatchObject({ durationMs: 30000, maxStacks: 3, damage: 3, holy: 3 })
  })

  it('drops 30 s after the last crit', () => {
    const plan = examplePlan({ core: false, talents: { Vengeance: 3 }, weapon: { min: 250, max: 250, speedSec: 3.5 }, durationMs: 60000 })
    // Crits only on the first swing (t = 0): the buff is up 30 s.
    plan.stats.crit = 100
    const aura = plan.auras.findIndex((a) => a.id === 'vengeance')
    plan.weapons[0] = { ...plan.weapons[0]!, speedSec: 100 }
    expect(upMs(plan, aura)).toBe(30000)
  })
})

describe('seals and judgements (paladin.md#seals, #judgement)', () => {
  it('one seal at a time: casting another ends it; the seals’ procs fire only while theirs is up', () => {
    const plan = examplePlan({ core: false, durationMs: 20000 })
    const soc = withSeal(plan, SEAL_OF_COMMAND, {}, false)
    const sor = addPaladinAbility(plan, SEAL_OF_RIGHTEOUSNESS)
    line(plan, sor, [{ code: COND.timeLeftAtMost, a: 10000, b: 0 }])
    for (const p of sealProcs({ speedSec: 3.5, twoHand: true })) if (p.requiresAura === SEAL_OF_RIGHTEOUSNESS.id) addProcSpec(plan, p)
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(sim.auraUpMs[plan.abilities[soc].aura]).toBe(10000)
    expect(sim.auraUpMs[plan.abilities[sor].aura]).toBe(10000)
    // Swings at 0, 3.5, 7 (Command) and 10.5, 14, 17.5 (Righteousness).
    expect(counter(sim, plan, 'sealOfRighteousnessProc', FIELD.casts)).toBe(3)
  })

  it('every seal’s judgement shares Judgement’s cooldown, and needs its seal', () => {
    const plan = examplePlan({ core: false, durationMs: 30000 })
    const soc = withSeal(plan, SEAL_OF_COMMAND)
    const joc = addPaladinAbility(plan, JUDGE_COMMAND)
    const jor = addPaladinAbility(plan, JUDGE_RIGHTEOUSNESS)
    line(plan, joc, [{ code: COND.abilityAuraUp, a: soc, b: 0 }])
    line(plan, jor)
    const sim = new Sim(plan)
    const uses: [number, number][] = []
    sim.castTrace = (a, t) => uses.push([a, t])
    sim.runFight(0)
    expect(uses.filter(([a]) => a === joc).map(([, t]) => t)).toEqual([0, 10000, 20000])
    expect(uses.filter(([a]) => a === jor)).toEqual([])
    // Without a seal up, a judgement line with the condition waits.
    const none = examplePlan({ core: false, durationMs: 30000 })
    const sealless = addPaladinAbility(none, SEAL_OF_COMMAND)
    line(none, addPaladinAbility(none, JUDGE_COMMAND), [{ code: COND.abilityAuraUp, a: sealless, b: 0 }])
    const s2 = new Sim(none)
    s2.runFight(0)
    expect(s2.counters[row(none, 'judgementOfCommand') * FIELD_COUNT + FIELD.casts]).toBe(0)
  })

  it('Seal of the Crusader: +325 AP [?], +40% attack speed and each swing ÷ 1.4 [?]', () => {
    expect(SEAL_OF_THE_CRUSADER.aura!.mods).toMatchObject({ ap: 325, haste: 40 })
    expect(1 + SEAL_OF_THE_CRUSADER.aura!.mods.damage! / 100).toBeCloseTo(1 / 1.4, 12)
  })
})

describe('which seal procs trigger procs (paladin.md#seals, OQ 22)', () => {
  /** Windfury Totem's proc as buffs.ts builds it: 20% on a landed main-hand attack, 100 ms ICD, its own chain. */
  function addWindfury(plan: Plan): void {
    plan.sources.push({ id: 'windfury', name: 'Windfury', icon: 'x' })
    plan.procs.push({ id: 'windfury', name: 'Windfury', trigger: TRIGGER.meleeLanded, chance: [0.2, 0.2], hands: 1, icdMs: 100, action: ACTION.extraAttacks, amount: 1, a: 0, b: 0, school: 0, source: plan.sources.length - 1, chainBit: 1 })
    plan.triggers[TRIGGER.meleeLanded].push(plan.procs.length - 1)
  }

  it('Seal of Righteousness’s and Seal of Fury’s procs don’t trigger Windfury: its procs per landed white swing are the same with and without them', () => {
    const fights = 30
    const rate = (seal: AbilityDef | null) => {
      const plan = examplePlan({ core: false, durationMs: 300000 })
      if (seal) withSeal(plan, seal)
      addWindfury(plan)
      const sim = new Sim(plan)
      for (let i = 0; i < fights; i++) sim.runFight(i)
      const main = row(plan, 'mainHand') * FIELD_COUNT
      const landed = sim.counters[main + FIELD.hits] + sim.counters[main + FIELD.glances] + sim.counters[main + FIELD.crits]
      if (seal) expect(counter(sim, plan, `${seal.id}Proc`, FIELD.casts)).toBeGreaterThan(landed)
      return { landed, windfury: counter(sim, plan, 'windfury', FIELD.casts) }
    }
    const none = rate(null)
    for (const seal of [SEAL_OF_RIGHTEOUSNESS, SEAL_OF_FURY]) {
      const { landed, windfury } = rate(seal)
      // The same 20% a swing (4 standard errors); a seal proc that triggered Windfury gave 36%.
      const p = none.windfury / none.landed
      expect(p).toBeCloseTo(0.2, 1)
      expect(Math.abs(windfury / landed - p), seal.id).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / landed) + 4 * Math.sqrt((p * (1 - p)) / none.landed))
    }
  })

  it('their crits give Vengeance, which can proc from procs (Attr3 0x4000000) [?], as a Seal of Command proc’s crit does', () => {
    const vengeanceUpMs = (seal: AbilityDef) => {
      const plan = examplePlan({ core: false, talents: { Vengeance: 3 }, durationMs: 30000 })
      withSeal(plan, seal)
      // White swings never crit; the seal's proc always does.
      plan.spells!.find((x) => x.source === row(plan, `${seal.id}Proc`))!.bonusCrit = 1000
      if (seal === SEAL_OF_COMMAND) sealProc(plan).chance = [1, 1]
      const sim = new Sim(plan)
      sim.runFight(0)
      expect(counter(sim, plan, `${seal.id}Proc`, FIELD.crits), seal.id).toBeGreaterThan(0)
      return sim.auraUpMs[plan.auras.findIndex((a) => a.id === 'vengeance')]
    }
    // PR-3: 20049's Can Proc From Procs lets the procs without NOT_A_PROC give stacks too.
    expect(vengeanceUpMs(SEAL_OF_RIGHTEOUSNESS)).toBe(30000)
    expect(vengeanceUpMs(SEAL_OF_FURY)).toBe(30000)
    expect(vengeanceUpMs(SEAL_OF_COMMAND)).toBe(30000)
  })

  it('Vengeance alone can proc from procs: the plan marks it, and nothing else of the default Retribution build', () => {
    const plan = buildPlan(defaultConfig('paladin-retribution')).plan
    expect(plan.procs.filter((p) => p.fromProcs).map((p) => p.id)).toEqual(['vengeance', 'vengeance'])
  })

  it('Consecration’s ticks, a periodic aura’s, give no Vengeance even when they crit [?]', () => {
    const plan = examplePlan({ core: false, talents: { Vengeance: 3 }, durationMs: 30000 })
    line(plan, addPaladinAbility(plan, CONSECRATION))
    plan.mana = { ...plan.mana!, maxTenths: 1e9 }
    // Every tick crits; white swings never do.
    plan.spells!.find((x) => x.source === row(plan, 'consecration'))!.bonusCrit = 1000
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(counter(sim, plan, 'consecration', FIELD.crits)).toBeGreaterThan(0)
    expect(sim.auraUpMs[plan.auras.findIndex((a) => a.id === 'vengeance')]).toBe(0)
  })

  it('an item’s spell gives no Vengeance even when it crits: PR-3’s procs from procs are the class’s own spells’ [?] (FL-4)', () => {
    const vengeanceUpMs = (addItemProc: (plan: Plan) => string) => {
      const plan = examplePlan({ core: false, talents: { Vengeance: 3 }, durationMs: 30000 })
      const id = addItemProc(plan)
      const sim = new Sim(plan)
      sim.runFight(0)
      expect(counter(sim, plan, id, FIELD.crits), id).toBeGreaterThan(0)
      return sim.auraUpMs[plan.auras.findIndex((a) => a.id === 'vengeance')]
    }
    // An item's damage proc (Fiery Weapon's 40 Fire, enchants.ts) on every landed swing; every one crits.
    const fieryWeapon = (plan: Plan) => {
      plan.sources.push({ id: 'fieryWeapon', name: 'Fiery Weapon', icon: 'spell_holy_greaterheal' })
      plan.procs.push({ id: 'fieryWeapon', name: 'Fiery Weapon', trigger: TRIGGER.meleeLanded, chance: [1, 1], hands: 3, icdMs: 0, action: ACTION.spellDamage, amount: 0, a: 40, b: 40, school: SCHOOL.fire, source: plan.sources.length - 1, chainBit: 0, requiresAura: -1 })
      plan.triggers[TRIGGER.meleeLanded].push(plan.procs.length - 1)
      plan.stats.spellCrit = 1000
      return 'fieryWeapon'
    }
    // An item's own spell (`itemSpell`, EZ-Thro Dark Bomb's), cast by a proc: as the item casts it
    // (triggering procs), and as a triggered spell that triggers none, the path the seals' procs take.
    const itemSpell = (triggersProcs: boolean) => (plan: Plan) => {
      addProcSpec(plan, {
        id: 'bombProc',
        name: 'Bomb proc',
        icon: EZ_THRO_DARK_BOMB_SPELL.icon,
        trigger: 'meleeLanded',
        from: 'any',
        chance: { pct: 100 },
        icdMs: 5000,
        action: { kind: 'spell', spell: { ...EZ_THRO_DARK_BOMB_SPELL, triggersProcs, alwaysHit: true, bonusCrit: 1000 } },
        docRef: 'docs/classes/paladin.md#conventions-used-below',
      })
      return EZ_THRO_DARK_BOMB_SPELL.id
    }
    expect(vengeanceUpMs(fieryWeapon)).toBe(0)
    expect(vengeanceUpMs(itemSpell(true))).toBe(0)
    expect(vengeanceUpMs(itemSpell(false))).toBe(0)
    // The same spell as your class's (no `itemSpell`), triggering nothing, does give it: Vengeance can proc from procs.
    const classSpell = (plan: Plan) => {
      itemSpell(false)(plan)
      plan.spells!.find((x) => x.source === row(plan, EZ_THRO_DARK_BOMB_SPELL.id))!.itemSpell = false
      return EZ_THRO_DARK_BOMB_SPELL.id
    }
    expect(vengeanceUpMs(classSpell)).toBeGreaterThan(0)
  })
})

describe('the default setups', () => {
  it('Retribution judges Seal of Command and Protection Seal of Fury with Righteous Fury; mana is tracked, rage isn’t', () => {
    const noBuffs = { raid: [], enabled: [] }
    const ret = buildPlan({ ...defaultConfig('paladin-retribution'), buffs: noBuffs }).plan
    // Abilities 0 and 1 are the seal and its judgement; Retribution's other rows follow (retribution.test.ts).
    expect(ret.abilities.slice(0, 2).map((a) => a.id)).toEqual(['sealOfCommand', 'judgementOfCommand'])
    expect(ret.mana).toBeTruthy()
    expect(ret.rage.maxTenths).toBe(0)
    expect(ret.holyThreatMult ?? 1).toBe(1)
    // Instrument of Law 2/2 without Righteous Fury: all threat × 0.8.
    expect(ret.threatMult).toBeCloseTo(0.8, 12)
    const prot = buildPlan({ ...defaultConfig('paladin-protection'), buffs: noBuffs }).plan
    // Abilities 0 and 1 are the seal and its judgement; Protection's other rows follow (protection.test.ts).
    expect(prot.abilities.slice(0, 2).map((a) => a.id)).toEqual(['sealOfFury', 'judgementOfFury'])
    expect(prot.holyThreatMult).toBeCloseTo(1.6, 12)
    // Improved Righteous Fury 3/3: −6% damage taken with Righteous Fury up.
    expect(prot.damageTakenMult).toBeCloseTo(0.94, 12)
  })

  it('list the [?] assumptions their seals, judgements and mana rely on', () => {
    const ids = (spec: 'paladin-retribution' | 'paladin-protection') => buildPlan(defaultConfig(spec)).assumptions.map((a) => a.id)
    expect(ids('paladin-retribution')).toEqual(
      expect.arrayContaining(['baseStatPlaceholders', 'manaRegen', 'sealOfCommandRate', 'sealOfCommandScaling', 'judgementOfCommand', 'meleeSpellProcs', 'sanctifiedJudgement', 'vindication']),
    )
    expect(ids('paladin-retribution')).not.toContain('foreverWhiteRage')
    expect(ids('paladin-protection')).toEqual(expect.arrayContaining(['sealOfFury', 'meleeSpellProcs', 'manaRegen']))
    expect(ids('paladin-protection')).not.toContain('damageTakenRage')
  })

  it('have no rage: no pool, and no rage from hits dealt or taken, even while tanking (rage.md#rage-from-damage-taken)', () => {
    for (const spec of ['paladin-retribution', 'paladin-protection'] as const) {
      const { plan, assumptions } = buildPlan(defaultConfig(spec))
      expect(plan.rage.maxTenths).toBe(0)
      expect(plan.rage.fromDamageTaken).toBe(false)
      const ids = assumptions.map((a) => a.id)
      const rageNotes = ['foreverWhiteRage', 'foreverOffHandRage', 'bearWhiteRage', 'damageTakenRage', 'damageTakenRageFlat', 'damageTakenRageHealthLost', 'abilityRefunds'] as const
      for (const id of rageNotes) expect(ids).not.toContain(id)
      const chunk = runChunk(plan, 0, 20)
      expect(chunk.rageGainedTenths).toBe(0)
      // Not even rage lost to a cap of 0: the white swings and the boss's hits never reach the pool.
      expect(chunk.rageWastedTenths).toBe(0)
      if (spec === 'paladin-protection') expect(chunk.damageTaken.mean).toBeGreaterThan(0)
    }
  })

  it('are deterministic: the same config and seed give the same result, another seed a different one', () => {
    for (const spec of ['paladin-retribution', 'paladin-protection'] as const) {
      const plan = buildPlan(defaultConfig(spec)).plan
      const a = runChunk(plan, 0, 50)
      const b = runChunk(plan, 0, 50)
      expect(Array.from(b.counters)).toEqual(Array.from(a.counters))
      expect(b.dps).toEqual(a.dps)
      const other = runChunk({ ...plan, seed: plan.seed + 1 }, 0, 50)
      expect(other.dps.mean).not.toBe(a.dps.mean)
    }
  })
})

/** How long aura `a` was up in fight 0. */
function upMs(plan: Plan, a: number): number {
  const sim = new Sim(plan)
  sim.runFight(0)
  return sim.auraUpMs[a]
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
