// Abilities and the rotation in the engine: warrior worked examples W1, W3 and W7 (docs/classes/
// warrior.md §8), rotation sanity (never off cooldown, without rage or during the GCD), the
// Heroic Strike queue (replaces a white swing, no white rage, the off hand's dual-wield penalty
// lifted while queued, unqueueing) and rage refunds (rage.md#rage-refunds-on-avoided-abilities).
import { describe, expect, it } from 'vitest'
import { addSample, emptyMoments, stdev } from '../core/welford'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { type Plan, TRIGGER_COUNT, type WeaponPlan } from '../plan/types'
import type { SimConfig } from '../types'
import { FIELD, FIELD_COUNT, SOURCE_MAIN_HAND, SOURCE_OFF_HAND, Sim } from './sim'

const OFF: SimConfig['rotation'] = {
  'warrior.fury.bloodthirst.enabled': false,
  'warrior.fury.whirlwind.enabled': false,
  'warrior.fury.heroicStrike.enabled': false,
  'warrior.fury.hamstring.enabled': false,
}
const only = (ability: 'bloodthirst' | 'whirlwind' | 'heroicStrike' | 'hamstring', extra: SimConfig['rotation'] = {}) => ({
  ...OFF,
  [`warrior.fury.${ability}.enabled`]: true,
  ...extra,
})

/**
 * A Fury plan with the default talents (so Bloodthirst is known) but no buffs, procs, auras,
 * periodic rage or armor, so every damage event is the ability's own and its numbers are exact.
 */
function abilityPlan(rotation: SimConfig['rotation'], durationMs = 60000): Plan {
  const d = defaultConfig('warrior-fury')
  const plan = buildPlan({
    ...d,
    race: 'alliance-human',
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
  it('W1: Bloodthirst deals 0.35 × AP + 48 = 678, 1356 on a crit (no Impale); 748 at 2000 AP', () => {
    const plan = abilityPlan(only('bloodthirst'))
    plan.stats.hit = 100
    plan.fight.bossCanDodge = false
    setAttackPower(plan, 1800)
    const hits = damages(plan, source(plan, 'bloodthirst'), 20)
    expect(hits.length).toBeGreaterThan(100)
    const normal = hits.filter((d) => d < 1000)
    const crits = hits.filter((d) => d >= 1000)
    expect(normal.length).toBeGreaterThan(0)
    expect(crits.length).toBeGreaterThan(0)
    for (const d of normal) expect(d).toBeCloseTo(678, 9)
    for (const d of crits) expect(d).toBeCloseTo(1356, 9)

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
