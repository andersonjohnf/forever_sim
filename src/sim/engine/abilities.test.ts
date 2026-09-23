// Abilities and the rotation in the engine: warrior worked examples W1, W3, W7, W9, W10 and W22
// (docs/classes/warrior.md §8), rotation sanity (never off cooldown, without rage or during the
// GCD), the Heroic Strike queue (replaces a white swing, no white rage, the off hand's dual-wield
// penalty lifted while queued, unqueueing), rage refunds (rage.md#rage-refunds-on-avoided-abilities),
// the execute phase (encounter.md §3, warrior.md §5.2 rows 6 and 7) and stance limits (§3.1).
import { describe, expect, it } from 'vitest'
import { addSample, emptyMoments, stdev } from '../core/welford'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, type Plan, STANCE, TRIGGER, TRIGGER_COUNT, type WeaponPlan } from '../plan/types'
import type { SimConfig } from '../types'
import { FIELD, FIELD_COUNT, SOURCE_MAIN_HAND, SOURCE_OFF_HAND, Sim } from './sim'

const OFF: SimConfig['rotation'] = {
  'warrior.fury.bloodthirst.enabled': false,
  'warrior.fury.whirlwind.enabled': false,
  'warrior.fury.heroicStrike.enabled': false,
  'warrior.fury.hamstring.enabled': false,
  'warrior.fury.execute.enabled': false,
}
const only = (ability: 'bloodthirst' | 'whirlwind' | 'heroicStrike' | 'hamstring' | 'execute', extra: SimConfig['rotation'] = {}) => ({
  ...OFF,
  [`warrior.fury.${ability}.enabled`]: true,
  ...extra,
})

/** The popular Fury build without Impale: "Fury + Precision" (warrior.md §6.1). */
const NO_IMPALE = '30305013-050520035150310051-'

/**
 * A Fury plan with the default talents (so Bloodthirst, Impale 2/2, Improved Heroic Strike 3/3 and
 * Raging Blows are known) but no buffs, procs, auras, periodic rage or armor, so every damage
 * event is the ability's own and its numbers are exact.
 */
function abilityPlan(rotation: SimConfig['rotation'], durationMs = 60000, talents?: string): Plan {
  const d = defaultConfig('warrior-fury')
  const plan = buildPlan({
    ...d,
    race: 'alliance-human',
    talents: talents ?? d.talents,
    // Dark Iron Destroyer and Hedgecutter (axes, no racial skill for a Human).
    gear: { mainHand: { itemId: 17016 }, offHand: { itemId: 18498 } },
    buffs: { raid: d.buffs.raid, enabled: [] },
    rotation,
    fight: { ...d.fight, durationVariationPct: 0 },
  }).plan
  plan.procs = []
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.auras = []
  plan.periodicRage = []
  plan.fight.targetArmor = 0
  plan.fight.durationMs = durationMs
  plan.damageMult = 1
  plan.physicalMult = 1
  return plan
}

/** Every attack lands (100% hit, no dodge) and never crits. */
function alwaysLandNoCrit(plan: Plan): void {
  plan.stats.hit = 100
  plan.stats.crit = -100
  plan.fight.bossCanDodge = false
}

function setAttackPower(plan: Plan, ap: number): void {
  plan.stats.ap += ap - new Sim(plan).inspect().attackPower
  expect(new Sim(plan).inspect().attackPower).toBeCloseTo(ap, 9)
}

const source = (plan: Plan, id: string) => plan.abilities.find((a) => a.id === id)!.source
const abilityIndex = (plan: Plan, id: string) => plan.abilities.findIndex((a) => a.id === id)

/** Damage events of one breakdown row over `fights` fights. */
function damages(plan: Plan, row: number, fights: number): number[] {
  const sim = new Sim(plan)
  const out: number[] = []
  sim.damageTrace = (s, damage) => {
    if (s === row) out.push(damage)
  }
  for (let i = 0; i < fights; i++) sim.runFight(i)
  return out
}

/** The sample mean is within 4 standard errors of `expected`. */
function expectMean(xs: number[], expected: number) {
  const m = emptyMoments()
  for (const x of xs) addSample(m, x)
  const se = stdev(m) / Math.sqrt(m.n)
  expect(Math.abs(m.mean - expected), `mean ${m.mean} vs ${expected} (SE ${se})`).toBeLessThanOrEqual(4 * se)
}

/** "Two-hander T" and "one-hander O" of warrior.md §8. */
const T: Partial<WeaponPlan> = { min: 105, max: 157, speedSec: 3.8, twoHand: true, normalizedSpeed: 3.3 }
const O: Partial<WeaponPlan> = { min: 106, max: 198, speedSec: 2.6, twoHand: false, normalizedSpeed: 2.4 }

describe('warrior worked examples in the engine (1800 AP, pre-armor)', () => {
  it('W1: Bloodthirst deals 0.35 × AP + 48 = 678; a crit 1491.60 with Impale 2/2, 1356 without; 748 at 2000 AP', () => {
    const crits = (talents?: string) => {
      const plan = abilityPlan(only('bloodthirst'), 60000, talents)
      plan.stats.hit = 100
      plan.fight.bossCanDodge = false
      setAttackPower(plan, 1800)
      const hits = damages(plan, source(plan, 'bloodthirst'), 20)
      expect(hits.length).toBeGreaterThan(100)
      const normal = hits.filter((d) => d < 1000)
      expect(normal.length).toBeGreaterThan(0)
      for (const d of normal) expect(d).toBeCloseTo(678, 9)
      return hits.filter((d) => d >= 1000)
    }
    const impale = crits()
    expect(impale.length).toBeGreaterThan(0)
    for (const d of impale) expect(d).toBeCloseTo(1491.6, 9)
    const plain = crits(NO_IMPALE)
    expect(plain.length).toBeGreaterThan(0)
    for (const d of plain) expect(d).toBeCloseTo(1356, 9)

    const plan = abilityPlan(only('bloodthirst'))
    setAttackPower(plan, 2000)
    alwaysLandNoCrit(plan)
    for (const d of damages(plan, source(plan, 'bloodthirst'), 2)) expect(d).toBeCloseTo(748, 9)
  })

  it('W3: Whirlwind with two-hander T is normalized to 3.3: 529.29–581.29, average 555.29', () => {
    const plan = abilityPlan(only('whirlwind'), 180000)
    plan.weapons = [{ ...plan.weapons[0]!, ...T }, null]
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1800)
    const hits = damages(plan, source(plan, 'whirlwind'), 150)
    expect(hits.length).toBeGreaterThan(2000)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(105 + (1800 / 14) * 3.3 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(157 + (1800 / 14) * 3.3 + 1e-9)
    expectMean(hits, 555.2857142857143)
    // A fixed 131-damage weapon gives exactly the average.
    plan.weapons[0] = { ...plan.weapons[0]!, min: 131, max: 131 }
    for (const d of damages(plan, source(plan, 'whirlwind'), 2)) expect(d).toBeCloseTo(555.2857142857143, 9)
  })

  it('W7: Heroic Strike with one-hander O uses the real speed: 597.29–689.29, average 643.29, never glancing', () => {
    const plan = abilityPlan(only('heroicStrike'), 180000)
    plan.weapons = [{ ...plan.weapons[0]!, ...O }, null]
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1800)
    const hits = damages(plan, source(plan, 'heroicStrike'), 150)
    expect(hits.length).toBeGreaterThan(1000)
    // A glancing blow (×0.65–0.85 at 300 skill) would fall below the minimum.
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(106 + (1800 / 14) * 2.6 + 157 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(198 + (1800 / 14) * 2.6 + 157 + 1e-9)
    expectMean(hits, 643.2857142857143)
  })

  it('W7: a white swing with one-hander O averages 486.29 (no glancing here, to compare)', () => {
    const plan = abilityPlan(OFF, 180000)
    plan.weapons = [{ ...plan.weapons[0]!, ...O, glanceLow: 1, glanceHigh: 1 }, null]
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1800)
    expectMean(damages(plan, SOURCE_MAIN_HAND, 100), 486.2857142857143)
  })
})

describe('rotation sanity (default Fury warrior)', () => {
  const plan = buildPlan({ ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 100, seed: 3 } }).plan
  const bt = abilityIndex(plan, 'bloodthirst')
  const ww = abilityIndex(plan, 'whirlwind')
  const hs = abilityIndex(plan, 'heroicStrike')
  const ham = abilityIndex(plan, 'hamstring')
  const sim = new Sim(plan)
  const casts: [number, number, number][] = []
  sim.castTrace = (a, t, rage) => casts.push([a, t, rage])
  const perFight: [number, number, number][][] = []
  for (let i = 0; i < 40; i++) {
    casts.length = 0
    sim.runFight(i)
    perFight.push([...casts])
  }

  it('uses every ability', () => {
    const used = new Set(perFight.flat().map(([a]) => a))
    expect([bt, ww, hs, ham].every((a) => used.has(a))).toBe(true)
  })

  it('never uses an ability without the rage for it, off cooldown, or during the GCD', () => {
    for (const fight of perFight) {
      const last = new Map<number, number>()
      let lastGcd = -Infinity
      for (const [a, t, rage] of fight) {
        const ability = plan.abilities[a]
        expect(rage).toBeGreaterThanOrEqual(ability.costTenths)
        if (ability.cooldownMs > 0 && last.has(a)) expect(t - last.get(a)!).toBeGreaterThanOrEqual(ability.cooldownMs)
        if (ability.gcdMs > 0) {
          expect(t - lastGcd).toBeGreaterThanOrEqual(1500)
          lastGcd = t
        }
        last.set(a, t)
      }
    }
  })

  it('follows the §5.2 conditions: Whirlwind waits on Bloodthirst, Hamstring is GCD-safe and above 60 rage', () => {
    for (const fight of perFight) {
      const readyAt = new Map<number, number>([
        [bt, 0],
        [ww, 0],
      ])
      for (const [a, t, rage] of fight) {
        if (a === ww) {
          expect(rage).toBeGreaterThanOrEqual(250)
          expect(readyAt.get(bt)! - t).toBeGreaterThanOrEqual(1500)
        }
        if (a === ham) {
          expect(rage).toBeGreaterThanOrEqual(600)
          expect(readyAt.get(bt)! - t).toBeGreaterThanOrEqual(1500)
          expect(readyAt.get(ww)! - t).toBeGreaterThanOrEqual(1500)
        }
        if (a === bt || a === ww) readyAt.set(a, t + plan.abilities[a].cooldownMs)
      }
    }
  })
})

describe('Heroic Strike queue (warrior.md §2.4)', () => {
  it('replaces main-hand swings on the swing timer, and the replaced swing gains no rage', () => {
    const plan = abilityPlan(only('heroicStrike', { 'warrior.fury.heroicStrike.minRage': 15 }))
    alwaysLandNoCrit(plan)
    const sim = new Sim(plan)
    const white: number[][] = [[], []]
    const strikes: number[] = []
    sim.trace = (s, hand, t) => {
      if (s === SOURCE_MAIN_HAND || s === SOURCE_OFF_HAND) white[hand].push(t)
    }
    sim.castTrace = (_a, t) => strikes.push(t)
    sim.runFight(0)
    const swing = sim.inspect().swingMs[0]
    // Main-hand swings at 0, 2400, 4800, … < 60 s: each is either white or Heroic Strike, once.
    const expected = Array.from({ length: Math.ceil(60000 / swing) }, (_, k) => k * swing)
    expect([...white[0], ...strikes].sort((a, b) => a - b)).toEqual(expected)
    expect(strikes.length).toBeGreaterThan(5)
    // rage.md: rage came only from the landed white swings (Forever normalized, floored to tenths).
    const r = plan.profile.rage
    const tenths = (w: WeaponPlan, offBase: number) => Math.floor(r.normalizedOneHand * w.speedSec * offBase * w.rageMult * 10 + 1e-9)
    const fromWhite = white[0].length * tenths(plan.weapons[0]!, 1) + white[1].length * tenths(plan.weapons[1]!, r.offHandBase)
    expect(sim.totalRageGainedTenths + sim.totalRageWastedTenths).toBe(fromWhite)
  })

  it('lifts the off hand’s dual-wield miss penalty while queued (combat-tables §5, W24)', () => {
    const missRate = (rotation: SimConfig['rotation']) => {
      const plan = abilityPlan(rotation)
      plan.stats.hit = 0
      plan.stats.hitRating = 0
      plan.weapons[1]!.hitBonus = 0
      // Rage always full, so Heroic Strike is queued again right after every main-hand swing.
      plan.periodicRage = [{ periodMs: 100, tenths: 1000, source: -1 }]
      const sim = new Sim(plan)
      const state = sim.inspect()
      for (let i = 0; i < 200; i++) sim.runFight(i)
      const row = SOURCE_OFF_HAND * FIELD_COUNT
      return { rate: sim.counters[row + FIELD.misses] / sim.counters[row + FIELD.casts], queued: state.offHandQueuedThresholds[0], white: state.whiteThresholds[1][0] }
    }
    const queued = missRate(only('heroicStrike', { 'warrior.fury.heroicStrike.minRage': 15 }))
    const unqueued = missRate(OFF)
    expect(queued.white - queued.queued).toBeCloseTo(19, 9)
    expect(Math.abs(queued.rate * 100 - queued.queued)).toBeLessThan(1)
    expect(Math.abs(unqueued.rate * 100 - unqueued.white)).toBeLessThan(1)
  })

  it('unqueues when rage drops below the threshold before the swing', () => {
    const minRageAtStrike = (unqueue: boolean) => {
      const plan = abilityPlan({
        ...only('heroicStrike', {
          'warrior.fury.heroicStrike.unqueue': unqueue,
          'warrior.fury.heroicStrike.unqueueBelow': 40,
        }),
        'warrior.fury.bloodthirst.enabled': true,
      })
      const hs = abilityIndex(plan, 'heroicStrike')
      const sim = new Sim(plan)
      let min = Infinity
      sim.castTrace = (a, _t, rage) => {
        if (a === hs) min = Math.min(min, rage)
      }
      for (let i = 0; i < 50; i++) sim.runFight(i)
      return min
    }
    expect(minRageAtStrike(true)).toBeGreaterThanOrEqual(400)
    expect(minRageAtStrike(false)).toBeLessThan(400)
  })
})

describe('rage refunds (rage.md#rage-refunds-on-avoided-abilities)', () => {
  /** Rage at each cast when the boss dodges everything and 30 rage arrives every 10 s. */
  function rageAtCasts(ability: 'bloodthirst' | 'whirlwind'): number[] {
    const plan = abilityPlan(only(ability))
    plan.stats.hit = 100
    plan.stats.expertise = -1000 // dodge far past 100%: every attack is dodged
    plan.periodicRage = [{ periodMs: 10000, tenths: 300, source: -1 }]
    const sim = new Sim(plan)
    const rage: number[] = []
    sim.castTrace = (_a, _t, r) => rage.push(r)
    sim.runFight(0)
    expect(sim.inspect().specialThresholds[1]).toBe(100)
    return rage.slice(0, 4)
  }

  it('a dodged Bloodthirst refunds 80% of its 30 rage, so each cast nets −6 rage', () => {
    // 10 s: 30 → 24 left; 20 s: +30 = 54 → 48; 26 s (cooldown): 48 → 42; 32 s: 42 + 30 = 72.
    expect(rageAtCasts('bloodthirst')).toEqual([300, 540, 480, 720])
  })

  it('a dodged Whirlwind refunds nothing: each cast nets −25 rage', () => {
    // Every 10 s: 30 → 5, then +30 = 35 → 10, then 40 → 15, …
    expect(rageAtCasts('whirlwind')).toEqual([300, 350, 400, 450])
  })
})

/** Landed attacks of a breakdown row: hits, crits, glances and blocks. */
const landed = (sim: Sim, row: number) =>
  [FIELD.hits, FIELD.crits, FIELD.glances, FIELD.blocks].reduce((n, f) => n + sim.counters[row * FIELD_COUNT + f], 0)

describe('Raging Blows: Whirlwind also strikes with the off hand (warrior.md §3.1, W9) [?]', () => {
  /** Whirlwind alone, one-hander O in both hands (fixed at its 152 average), 1800 AP. */
  function wwPlan(): Plan {
    const plan = abilityPlan(only('whirlwind'), 180000)
    const fixed = { ...O, min: 152, max: 152 }
    plan.weapons = [
      { ...plan.weapons[0]!, ...fixed },
      { ...plan.weapons[1]!, ...fixed },
    ]
    setAttackPower(plan, 1800)
    return plan
  }
  const ww = (plan: Plan) => plan.abilities.find((a) => a.id === 'whirlwind')!
  const mainStrike = 152 + (1800 / 14) * 2.4

  it('W9: the main-hand strike deals 460.57, the off-hand strike 460.57 × 0.625 = 287.86, in its own row', () => {
    const plan = wwPlan()
    alwaysLandNoCrit(plan)
    const { source: mainRow, offHandSource: offRow } = ww(plan)
    expect(plan.sources[offRow]).toMatchObject({ id: 'whirlwindOffHand', name: 'Whirlwind (off hand)' })
    expect(plan.weapons[1]!.handMult).toBe(0.625) // Dual Wield Specialization 5/5
    const main = damages(plan, mainRow, 3)
    const off = damages(plan, offRow, 3)
    expect(main.length).toBeGreaterThan(20)
    expect(off.length).toBe(main.length)
    for (const d of main) expect(d).toBeCloseTo(mainStrike, 9)
    for (const d of off) expect(d).toBeCloseTo(mainStrike * 0.625, 9)
  })

  it('crits with Impale (×2.2) like the main-hand strike', () => {
    const plan = wwPlan()
    alwaysLandNoCrit(plan)
    plan.stats.crit = 200
    const off = damages(plan, ww(plan).offHandSource, 2)
    expect(off.length).toBeGreaterThan(0)
    for (const d of off) expect(d).toBeCloseTo(mainStrike * 0.625 * 2.2, 9)
  })

  it('rolls its own table with Dual Wield Specialization’s off-hand hit: 8% main-hand misses, none off hand', () => {
    const plan = wwPlan()
    plan.fight.bossCanDodge = false
    const sim = new Sim(plan)
    const state = sim.inspect()
    expect(state.specialThresholds[0]).toBe(8)
    expect(state.offHandSpecialThresholds[0]).toBe(0)
    for (let i = 0; i < 100; i++) sim.runFight(i)
    const { source: mainRow, offHandSource: offRow } = ww(plan)
    const c = sim.counters
    expect(c[offRow * FIELD_COUNT + FIELD.casts]).toBe(c[mainRow * FIELD_COUNT + FIELD.casts])
    expect(c[offRow * FIELD_COUNT + FIELD.misses]).toBe(0)
    expect(Math.abs(c[mainRow * FIELD_COUNT + FIELD.misses] / c[mainRow * FIELD_COUNT + FIELD.casts] - 0.08)).toBeLessThan(0.01)
  })

  it('procs the off hand’s on-hit effects', () => {
    const plan = wwPlan()
    alwaysLandNoCrit(plan)
    // An off-hand-only proc on landed melee attacks, counted by its casts.
    plan.sources.push({ id: 'test', name: 'Test', icon: 'x' })
    const row = plan.sources.length - 1
    plan.procs = [
      { id: 'test', name: 'Test', trigger: TRIGGER.meleeLanded, chance: [1, 1], hands: 2, icdMs: 0, action: ACTION.spellDamage, amount: 0, a: 1, b: 1, school: 0, source: row, chainBit: 0 },
    ]
    plan.triggers = Array.from({ length: TRIGGER_COUNT }, (_, t) => (t === TRIGGER.meleeLanded ? [0] : []))
    const sim = new Sim(plan)
    for (let i = 0; i < 20; i++) sim.runFight(i)
    const strikes = landed(sim, ww(plan).offHandSource)
    expect(strikes).toBeGreaterThan(100)
    expect(sim.counters[row * FIELD_COUNT + FIELD.casts]).toBe(landed(sim, SOURCE_OFF_HAND) + strikes)
  })

  it('needs an off hand: none with a two-hander', () => {
    const d = defaultConfig('warrior-fury')
    const plan = buildPlan({ ...d, gear: { ...d.gear, mainHand: { itemId: 12784 }, offHand: undefined } }).plan
    expect(ww(plan).offHandSource).toBe(-1)
    expect(plan.sources.some((s) => s.id === 'whirlwindOffHand')).toBe(false)
  })
})

describe('Execute (warrior.md §3.1 "Execute details", W10)', () => {
  /**
   * Execute alone in a 20 s fight whose execute phase starts at 16 s. White swings give no rage,
   * so rage comes only from `grants`, and every attack lands without crits.
   */
  function executePlan(grants: Plan['periodicRage']): Plan {
    const plan = abilityPlan(only('execute'), 20000)
    alwaysLandNoCrit(plan)
    for (const w of plan.weapons) w!.rageMult = 0
    plan.periodicRage = grants
    return plan
  }
  function run(plan: Plan) {
    const sim = new Sim(plan)
    const casts: [number, number][] = []
    const hits: number[] = []
    const row = source(plan, 'execute')
    sim.castTrace = (_a, t, rage) => casts.push([t, rage])
    sim.damageTrace = (s, damage) => {
      if (s === row) hits.push(damage)
    }
    sim.runFight(0)
    expect(sim.executeAtMs).toBe(16000)
    return { casts, hits }
  }

  it('W10: the damage reads the rage left after the cost: 1125 at 50 rage (cost 15), 1200 at cost 10', () => {
    // 50 rage arrives at 16 s, just after the phase starts.
    const at50 = (cost: number) => {
      const plan = executePlan([{ periodMs: 16000, tenths: 500, source: -1 }])
      plan.abilities[abilityIndex(plan, 'execute')].costTenths = cost // Improved Execute 2/2: 10
      return run(plan)
    }
    const popular = at50(150)
    expect(popular.casts).toEqual([[16000, 500]])
    expect(popular.hits).toHaveLength(1)
    expect(popular.hits[0]).toBeCloseTo(1125, 9)
    expect(at50(100).hits[0]).toBeCloseTo(1200, 9)
  })

  it('W10: a full 130-rage bar at cost 15 deals 2325, and each landed Execute leaves 0 rage', () => {
    // 10 rage a second: the bar is full when the phase starts. After each hit rage restarts from
    // 0, so the next Execute waits for 20 rage (at 17.5 s, then 19 s) and deals 600 + 15 × 5.
    const { casts, hits } = run(executePlan([{ periodMs: 1000, tenths: 100, source: -1 }]))
    expect(casts).toEqual([
      [16000, 1300],
      [17500, 200],
      [19000, 200],
    ])
    expect(hits.map((d) => Math.round(d * 1e6) / 1e6)).toEqual([2325, 675, 675])
  })

  it('a dodged Execute loses only its cost, with no refund, and keeps the rest', () => {
    const grants = [{ periodMs: 1000, tenths: 50, source: -1 }]
    // Landed: 75 rage at 16 s is all spent; the next cast waits for 15 rage at 18 s.
    expect(run(executePlan(grants)).casts).toEqual([
      [16000, 750],
      [18000, 150],
    ])
    // Dodged: 75 → 60, +5 +5 → 70 at 17.5 s → 55, +5 +5 → 65… each cast costs exactly 15.
    const dodged = executePlan(grants)
    dodged.fight.bossCanDodge = true
    dodged.stats.expertise = -1000
    const { casts, hits } = run(dodged)
    expect(casts).toEqual([
      [16000, 750],
      [17500, 700],
      [19000, 600],
    ])
    expect(hits).toEqual([])
  })
})

describe('the execute phase (encounter.md §3, warrior.md §5.2 rows 6 and 7)', () => {
  function fights(rotation: SimConfig['rotation'] = {}) {
    const plan = buildPlan({ ...defaultConfig('warrior-fury'), rotation, run: { mode: 'fixed', iterations: 100, seed: 5 } }).plan
    const sim = new Sim(plan)
    const out: { executeAt: number; end: number; casts: [string, number][] }[] = []
    let casts: [string, number][] = []
    sim.castTrace = (a, t) => casts.push([plan.abilities[a].id, t])
    for (let i = 0; i < 40; i++) {
      casts = []
      sim.runFight(i)
      out.push({ executeAt: sim.executeAtMs, end: sim.fightMs, casts })
    }
    return { plan, out }
  }

  it('starts at floor(L × 0.8) of each drawn fight length (WE-1)', () => {
    for (const { executeAt, end } of fights().out) expect(executeAt).toBe(Math.floor((end * 80) / 100))
  })

  it('uses Execute only in the phase, and only Execute there while AP is below btOverExecuteAp', () => {
    const { plan, out } = fights()
    expect(new Sim(plan).inspect().attackPower).toBeLessThan(2220)
    for (const { executeAt, casts } of out) {
      expect(casts.some(([id]) => id === 'execute')).toBe(true)
      for (const [id, t] of casts) {
        if (id === 'execute') expect(t).toBeGreaterThanOrEqual(executeAt)
        // Bloodthirst, Whirlwind, Hamstring and Heroic Strike swings (a queued one is cancelled) stop.
        else expect(t, `${id} at ${t}`).toBeLessThan(executeAt)
      }
    }
  })

  it('keeps Bloodthirst in the phase at or above btOverExecuteAp', () => {
    const { out } = fights({ 'warrior.fury.execute.btOverExecuteAp': 0 })
    // Rarely: a landed Execute spends all the rage, so Bloodthirst needs 30 to arrive within a GCD.
    const inPhase = out.flatMap(({ executeAt, casts }) => casts.filter(([id, t]) => id === 'bloodthirst' && t >= executeAt))
    expect(inPhase.length).toBeGreaterThan(10)
  })

  it('keeps Heroic Strike and Whirlwind in the phase when their toggles say so', () => {
    const { out } = fights({ 'warrior.fury.execute.heroicStrikeInExecute': true, 'warrior.fury.execute.whirlwindInExecute': true, 'warrior.fury.execute.minExtraRage': 30 })
    const inPhase = new Set(out.flatMap(({ executeAt, casts }) => casts.filter(([, t]) => t >= executeAt).map(([id]) => id)))
    expect([...inPhase].sort()).toEqual(['execute', 'heroicStrike', 'whirlwind'])
  })

  it('has no execute phase at 0%', () => {
    const d = defaultConfig('warrior-fury')
    const plan = buildPlan({ ...d, fight: { ...d.fight, executePct: 0 } }).plan
    const sim = new Sim(plan)
    let executes = 0
    sim.castTrace = (a) => {
      if (plan.abilities[a].id === 'execute') executes++
    }
    for (let i = 0; i < 20; i++) sim.runFight(i)
    expect(executes).toBe(0)
    expect(sim.executeAtMs).toBe(sim.fightMs)
  })
})

describe('stances (warrior.md §3.1 "Stance")', () => {
  it('refuses an ability outside its stances', () => {
    const used = (ability: 'bloodthirst' | 'whirlwind' | 'hamstring' | 'execute', stance: number) => {
      const plan = abilityPlan(only(ability))
      plan.stance = stance
      const sim = new Sim(plan)
      let casts = 0
      sim.castTrace = () => casts++
      for (let i = 0; i < 5; i++) sim.runFight(i)
      return casts > 0
    }
    const { battle, defensive, berserker } = STANCE
    expect([battle, defensive, berserker].map((s) => used('bloodthirst', s))).toEqual([true, true, true])
    expect([battle, defensive, berserker].map((s) => used('whirlwind', s))).toEqual([false, false, true])
    expect([battle, defensive, berserker].map((s) => used('hamstring', s))).toEqual([true, false, true])
    expect([battle, defensive, berserker].map((s) => used('execute', s))).toEqual([true, false, true])
  })
})

describe('Unbridled Wrath (warrior.md §2.3, W22)', () => {
  /** Unbridled Wrath rage and landed swings over 100 fights, with only its proc and no rage cap. */
  function measure(config: SimConfig, heroicStrike: boolean) {
    const plan = buildPlan({ ...config, buffs: { raid: config.buffs.raid, enabled: [] } }).plan
    plan.procs = plan.procs.filter((p) => p.id === 'unbridledWrath')
    plan.triggers = Array.from({ length: TRIGGER_COUNT }, (_, t) => (t === TRIGGER.swingLanded ? plan.procs.map((_p, i) => i) : []))
    plan.periodicRage = []
    plan.rage.maxTenths = 1e9
    const sim = new Sim(plan)
    for (let i = 0; i < 100; i++) sim.runFight(i)
    const uw = plan.procs[0].source
    const rage = sim.counters[uw * FIELD_COUNT + FIELD.threat] / 0.5 / 10 // 5 threat per rage (threat.md)
    const hs = heroicStrike ? landed(sim, source(plan, 'heroicStrike')) : 0
    return { rage, white: landed(sim, SOURCE_MAIN_HAND) + landed(sim, SOURCE_OFF_HAND), hs }
  }
  /** 60% of `swings` procs of `amount` rage, within 4 standard errors (each swing is a Bernoulli(0.6) proc). */
  const expectRate = (rage: number, swings: number, amount: number) => {
    const expected = 0.6 * amount * swings
    const se = amount * Math.sqrt(swings * 0.6 * 0.4)
    expect(Math.abs(rage - expected), `${rage} vs ${expected} (SE ${se})`).toBeLessThanOrEqual(4 * se)
  }

  it('5/5 with one-handers: 60 rage per 100 landed white swings', () => {
    const { rage, white } = measure({ ...defaultConfig('warrior-fury'), rotation: OFF }, false)
    expect(white).toBeGreaterThan(10000)
    expectRate(rage, white, 1)
  })

  it('5/5 with a two-hander: 120 rage per 100 landed swings (Arms default)', () => {
    const { rage, white } = measure(defaultConfig('warrior-arms'), false)
    expect(white).toBeGreaterThan(4000)
    expectRate(rage, white, 2)
  })

  it('also procs from Heroic Strike swings, the §2.3 default [?] (Q5)', () => {
    const { rage, white, hs } = measure({ ...defaultConfig('warrior-fury'), rotation: only('heroicStrike') }, true)
    expect(hs).toBeGreaterThan(white / 4)
    expectRate(rage, white + hs, 1)
  })
})
