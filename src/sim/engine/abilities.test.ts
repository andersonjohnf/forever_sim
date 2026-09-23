// Abilities and the rotation in the engine: warrior worked examples W1, W3, W7, W9, W10 and W22
// (docs/classes/warrior.md §8), rotation sanity (never off cooldown, without rage or during the
// GCD), the Heroic Strike queue (replaces a white swing, no white rage, the off hand's dual-wield
// penalty lifted while queued, unqueueing), rage refunds (rage.md#rage-refunds-on-avoided-abilities),
// the execute phase (encounter.md §3, warrior.md §5.2 rows 6 and 7), stance limits (§3.1), the
// cooldowns (§5.2 rows 2–5 and 13: Bloodrage and W19, Death Wish's alignToEnd, Recklessness,
// Berserker Rage, racial cooldowns and their sync with Death Wish), Battle Shout's upkeep and the
// pre-pull (rows 0 and 1), the Mighty Rage Potion (row 16), Juju Flurry (row 17) and Weakness
// Analyzer (row 3).
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, encodeTalentCode } from '@/data/talents/types'
import { addSample, emptyMoments, stdev } from '../core/welford'
import { defaultConfig, TALENT_DATA } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, type Plan, STANCE, TRIGGER, TRIGGER_COUNT, type WeaponPlan } from '../plan/types'
import type { SimConfig } from '../types'
import { FIELD, FIELD_COUNT, SOURCE_MAIN_HAND, SOURCE_OFF_HAND, Sim } from './sim'

/** The pre-pull, Battle Shout, the cooldowns and consumables (warrior.md §5.2 rows 0–5, 13, 16 and 17) off. */
const NO_COOLDOWNS: SimConfig['rotation'] = {
  'warrior.fury.prepull.bloodrage': false,
  'warrior.fury.battleShout.enabled': false,
  'warrior.fury.deathWish.enabled': false,
  'warrior.fury.racial.enabled': false,
  'warrior.fury.recklessness.enabled': false,
  'warrior.fury.bloodrage.enabled': false,
  'warrior.fury.berserkerRage.enabled': false,
  'warrior.fury.trinkets.enabled': false,
  'warrior.fury.ragePotion.enabled': false,
  'warrior.fury.jujuFlurry.enabled': false,
}
const OFF: SimConfig['rotation'] = {
  ...NO_COOLDOWNS,
  'warrior.fury.bloodthirst.enabled': false,
  'warrior.fury.whirlwind.enabled': false,
  'warrior.fury.heroicStrike.enabled': false,
  'warrior.fury.hamstring.enabled': false,
  'warrior.fury.execute.enabled': false,
}
type Row = 'bloodthirst' | 'whirlwind' | 'heroicStrike' | 'hamstring' | 'execute' | 'deathWish' | 'racial' | 'recklessness' | 'bloodrage' | 'berserkerRage'
const only = (ability: Row, extra: SimConfig['rotation'] = {}) => ({
  ...OFF,
  [`warrior.fury.${ability}.enabled`]: true,
  ...extra,
})

/** The popular Fury build without Impale: "Fury + Precision" (warrior.md §6.1). */
const NO_IMPALE = '30305013-050520035150310051-'

/** The default Fury build with some talents set to other ranks, by name. */
function furyTalents(ranks: Record<string, number>): string {
  const data = TALENT_DATA.warrior
  const byId = decodeTalentCode(data, defaultConfig('warrior-fury').talents)
  const all = data.trees.flatMap((t) => t.talents)
  for (const [name, rank] of Object.entries(ranks)) byId[all.find((t) => t.name === name)!.id] = rank
  return encodeTalentCode(data, byId)
}

/**
 * A Fury plan with the default talents (so Bloodthirst, Impale 2/2, Improved Heroic Strike 3/3 and
 * Raging Blows are known) but no buffs, procs, periodic rage or armor, so every damage event is
 * the ability's own and its numbers are exact. Only casts apply auras then (Death Wish, …).
 */
function abilityPlan(rotation: SimConfig['rotation'], durationMs = 60000, talents?: string, race = 'alliance-human', patch: Partial<SimConfig> = {}): Plan {
  const d = defaultConfig('warrior-fury')
  const plan = buildPlan({
    ...d,
    race,
    talents: talents ?? d.talents,
    // Dark Iron Destroyer and Hedgecutter (axes, no racial skill for a Human).
    gear: { mainHand: { itemId: 17016 }, offHand: { itemId: 18498 } },
    buffs: { raid: d.buffs.raid, enabled: [] },
    rotation,
    fight: { ...d.fight, durationVariationPct: 0 },
    ...patch,
  }).plan
  plan.procs = []
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
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
        // The pre-pull's casts cost nothing in the fight (warrior.md §5.2 row 0).
        if (t >= 0) expect(rage).toBeGreaterThanOrEqual(ability.costTenths)
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
    // rage.md: rage came only from the landed white swings (Forever normalized). Their fractions of a
    // tenth carry (rage.md#rounding), so the whole tenths gained add up to the floor of their sum.
    const r = plan.profile.rage
    const tenths = (w: WeaponPlan, offBase: number) => r.normalizedOneHand * w.speedSec * offBase * w.rageMult * 10
    const fromWhite = white[0].length * tenths(plan.weapons[0]!, 1) + white[1].length * tenths(plan.weapons[1]!, r.offHandBase)
    expect(sim.totalRageGainedTenths + sim.totalRageWastedTenths).toBe(Math.floor(fromWhite + 1e-9))
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

  it('§7 "Execute’s rage": it converts the tenths too: 27.3 rage at cost 15 deals 600 + 15 × 12.3 = 784.5 [?] (Q28)', () => {
    const plan = executePlan([{ periodMs: 16000, tenths: 273, source: -1 }])
    expect(plan.abilities[abilityIndex(plan, 'execute')].costTenths).toBe(150)
    const { casts, hits } = run(plan)
    expect(casts).toEqual([[16000, 273]])
    expect(hits).toHaveLength(1)
    expect(hits[0]).toBeCloseTo(784.5, 9)
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
  /** The M2.2a lines only: the cooldowns (rows 2–5, 13) apply in both phases and are tested below. */
  function fights(rotation: SimConfig['rotation'] = {}) {
    const plan = buildPlan({ ...defaultConfig('warrior-fury'), rotation: { ...NO_COOLDOWNS, ...rotation }, run: { mode: 'fixed', iterations: 100, seed: 5 } }).plan
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

/** Every cast per fight, as [ability id, time, rage before paying], with the fight's end and execute start. */
function castsPerFight(plan: Plan, fights: number) {
  const sim = new Sim(plan)
  const out: { end: number; executeAt: number; casts: [string, number, number][] }[] = []
  let casts: [string, number, number][] = []
  sim.castTrace = (a, t, rage) => casts.push([plan.abilities[a].id, t, rage])
  for (let i = 0; i < fights; i++) {
    casts = []
    sim.runFight(i)
    out.push({ end: sim.fightMs, executeAt: sim.executeAtMs, casts })
  }
  return out
}
const timesOf = (casts: [string, number, number][], id: string) => casts.filter(([c]) => c === id).map(([, t]) => t)

describe('Bloodrage (warrior.md §2.3, §5.2 row 5, W19)', () => {
  /** Bloodrage alone and no other rage: what one fight of `durationMs` gains. */
  function bloodrage(durationMs: number, rank: number, maxTenths?: number) {
    const plan = abilityPlan(only('bloodrage'), durationMs, furyTalents({ 'Improved Bloodrage': rank }))
    for (const w of plan.weapons) w!.rageMult = 0
    if (maxTenths !== undefined) plan.rage.maxTenths = maxTenths
    const sim = new Sim(plan)
    sim.runFight(0)
    const row = source(plan, 'bloodrage') * FIELD_COUNT
    return { gained: sim.totalRageGainedTenths, wasted: sim.totalRageWastedTenths, threat: sim.counters[row + FIELD.threat], casts: sim.counters[row + FIELD.casts] }
  }

  it('W19: Improved Bloodrage 2/2 gives 15 rage at 0 s, then 1.5 a second from 1 s to 10 s: 30 in all', () => {
    // A fight of L ms runs events at t < L, so a tick due at L doesn't happen.
    expect([1, 1000, 1001, 5001, 10001, 60000].map((L) => bloodrage(L, 2).gained)).toEqual([150, 150, 165, 225, 300, 300])
    // On cooldown: again at 60 s.
    expect(bloodrage(60001, 2)).toMatchObject({ gained: 450, casts: 2 })
  })

  it('W19: without the talent it gives 10, then 1 a second: 20 in all', () => {
    expect([1, 1001, 10001].map((L) => bloodrage(L, 0).gained)).toEqual([100, 110, 200])
  })

  it('is an energize: capped at max rage, with 5 threat per rage actually gained (threat.md)', () => {
    // A 20-rage cap: 15, 16.5, 18, 19.5, then half of the next tick; the rest is lost.
    const capped = bloodrage(10001, 2, 200)
    expect(capped).toMatchObject({ gained: 200, wasted: 100 })
    expect(capped.threat).toBeCloseTo(100, 9)
    expect(bloodrage(10001, 2).threat).toBeCloseTo(150, 9)
  })

  it('waits for rage ≤ maxRage, and is checked again whenever something spends rage', () => {
    const times = (extra: SimConfig['rotation'], whiteRage: boolean) => {
      const plan = abilityPlan(only('bloodrage', extra), 180000)
      if (!whiteRage) for (const w of plan.weapons) w!.rageMult = 0
      return timesOf(castsPerFight(plan, 1)[0].casts, 'bloodrage')
    }
    expect(times({}, false)).toEqual([0, 60000, 120000])
    // maxRage 0: after the pull, white rage keeps it waiting for good.
    expect(times({ 'warrior.fury.bloodrage.maxRage': 0 }, true)).toEqual([0])

    // The default Fury warrior with a low maxRage (30): every Bloodrage at ≤ 30 rage, either as it
    // comes off cooldown or right after a cast that spent rage at the same moment (only spending
    // lowers rage).
    const config = { ...defaultConfig('warrior-fury'), rotation: { 'warrior.fury.bloodrage.maxRage': 30 } }
    const plan = buildPlan(config).plan
    let late = 0
    for (const { casts } of castsPerFight(plan, 40)) {
      let ready = 0
      casts.forEach(([id, t, rage], i) => {
        if (id !== 'bloodrage') return
        expect(rage).toBeLessThanOrEqual(300)
        // The pre-pull one (warrior.md §5.2 row 0) starts the cooldown at −1 s.
        if (t < 0) {
          ready = t + 60000
          return
        }
        expect(t).toBeGreaterThanOrEqual(ready)
        if (t > ready) {
          late++
          expect(casts[i - 1][1], `Bloodrage at ${t}`).toBe(t)
        }
        ready = t + 60000
      })
    }
    expect(late).toBeGreaterThan(0)
  })
})

describe('Death Wish (warrior.md §2.6, §5.2 row 2 and notes)', () => {
  const dwTimes = (durationMs: number, extra: SimConfig['rotation'] = {}) =>
    timesOf(castsPerFight(abilityPlan(only('deathWish', extra), durationMs), 1)[0].casts, 'deathWish')

  it('alignToEnd, a short fight: one use, held until 30 s are left', () => {
    expect(dwTimes(100000)).toEqual([70000])
    expect(dwTimes(180000)).toEqual([150000])
  })

  it('alignToEnd, a long fight: a use on cooldown from the pull, then the final use aligned to the end', () => {
    const [first, final, ...rest] = dwTimes(300000)
    expect(first).toBeLessThan(5000) // as soon as there's 10 rage
    expect(final).toBe(270000)
    expect(rest).toEqual([])
    // 400 s: the second use isn't the final one (220 s would be left), the third is.
    const three = dwTimes(400000)
    expect(three).toHaveLength(3)
    expect(three[1]).toBe(three[0] + 180000)
    expect(three[2]).toBe(370000)
  })

  it('without alignToEnd, every use goes on cooldown', () => {
    const [first, second] = dwTimes(300000, { 'warrior.fury.deathWish.alignToEnd': false })
    expect(first).toBeLessThan(5000)
    expect(second).toBe(first + 180000)
  })

  it('multiplies physical damage by 1.2 for 30 s', () => {
    const plan = abilityPlan(only('deathWish'), 100000)
    alwaysLandNoCrit(plan)
    plan.weapons[0] = { ...plan.weapons[0]!, min: 150, max: 150, glanceLow: 1, glanceHigh: 1 }
    const sim = new Sim(plan)
    let at = 0
    const hits: [number, number][] = []
    sim.trace = (_s, _hand, t) => {
      at = t
    }
    sim.damageTrace = (s, damage) => {
      if (s === SOURCE_MAIN_HAND) hits.push([at, damage])
    }
    sim.runFight(0)
    const before = hits.filter(([t]) => t < 70000).map(([, d]) => d)
    const during = hits.filter(([t]) => t > 70000).map(([, d]) => d)
    expect(before.length).toBeGreaterThan(10)
    expect(during.length).toBeGreaterThan(5)
    for (const d of before) expect(d).toBeCloseTo(before[0], 9)
    for (const d of during) expect(d).toBeCloseTo(before[0] * 1.2, 9)
  })
})

describe('Recklessness (warrior.md §2.6, §5.2 row 4)', () => {
  it('is used exactly once a fight, once lastSec seconds are left, as soon as the GCD allows', () => {
    const plan = buildPlan({ ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 100, seed: 8 } }).plan
    for (const { end, casts } of castsPerFight(plan, 60)) {
      const times = timesOf(casts, 'recklessness')
      expect(times).toHaveLength(1)
      const [t] = times
      expect(t).toBeGreaterThanOrEqual(end - 15000)
      // It waits for a GCD already running, and for Battle Shout's refresh (row 1) and Death Wish
      // (row 2) if they're due as well.
      const first = [...timesOf(casts, 'battleShout'), ...timesOf(casts, 'deathWish')].filter((x) => x >= end - 15000 && x < t)
      expect(t - (end - 15000)).toBeLessThanOrEqual(1500 * (1 + first.length))
    }
    const early = abilityPlan(only('recklessness', { 'warrior.fury.recklessness.lastSec': 40 }), 100000)
    expect(timesOf(castsPerFight(early, 1)[0].casts, 'recklessness')).toEqual([60000])
  })

  it('+100% crit: white crits fill the table up to its crit cap; Bloodthirst’s second roll always crits', () => {
    // A 15 s fight, so Recklessness at the pull covers all of it.
    const plan = abilityPlan({ ...only('bloodthirst'), 'warrior.fury.recklessness.enabled': true }, 15000)
    const sim = new Sim(plan)
    for (let i = 0; i < 20; i++) sim.runFight(i)
    const c = sim.counters
    for (const row of [SOURCE_MAIN_HAND, SOURCE_OFF_HAND]) {
      expect(c[row * FIELD_COUNT + FIELD.hits], 'ordinary white hits').toBe(0)
      expect(c[row * FIELD_COUNT + FIELD.crits]).toBeGreaterThan(0)
      // Misses, dodges and glancing blows keep their share (combat-tables §2.2).
      expect(c[row * FIELD_COUNT + FIELD.glances]).toBeGreaterThan(0)
      expect(c[row * FIELD_COUNT + FIELD.misses]).toBeGreaterThan(0)
    }
    const bt = source(plan, 'bloodthirst')
    expect(c[bt * FIELD_COUNT + FIELD.crits]).toBeGreaterThan(0)
    expect(c[bt * FIELD_COUNT + FIELD.crits]).toBe(landed(sim, bt))
  })

  it('needs Berserker Stance, as Berserker Rage does', () => {
    const used = (stance: number) => {
      const rotation = { ...OFF, 'warrior.fury.deathWish.enabled': true, 'warrior.fury.recklessness.enabled': true, 'warrior.fury.berserkerRage.enabled': true }
      const plan = abilityPlan(rotation, 60000, furyTalents({ 'Improved Berserker Rage': 2 }))
      plan.stance = stance
      return [...new Set(castsPerFight(plan, 3).flatMap((f) => f.casts.map(([id]) => id)))].sort()
    }
    expect(used(STANCE.berserker)).toEqual(['berserkerRage', 'deathWish', 'recklessness'])
    expect(used(STANCE.battle)).toEqual(['deathWish'])
    expect(used(STANCE.defensive)).toEqual(['deathWish'])
  })
})

describe('Berserker Rage (warrior.md §2.3, §5.2 row 13)', () => {
  it('needs Improved Berserker Rage; then it’s used on cooldown at ≤ 120 rage while Bloodthirst and Whirlwind can wait', () => {
    expect(buildPlan(defaultConfig('warrior-fury')).plan.abilities.map((a) => a.id)).not.toContain('berserkerRage')
    const config = { ...defaultConfig('warrior-fury'), talents: furyTalents({ 'Improved Berserker Rage': 2 }), run: { mode: 'fixed' as const, iterations: 100, seed: 9 } }
    const plan = buildPlan(config).plan
    expect(plan.abilities.find((a) => a.id === 'berserkerRage')!.rageTenths).toBe(100)
    const cd = (id: string) => plan.abilities.find((a) => a.id === id)!.cooldownMs
    let uses = 0
    for (const { executeAt, casts } of castsPerFight(plan, 40)) {
      const readyAt: Record<string, number> = { bloodthirst: 0, whirlwind: 0 }
      let last = -Infinity
      for (const [id, t, rage] of casts) {
        if (id === 'berserkerRage') {
          uses++
          expect(rage).toBeLessThanOrEqual(1200)
          expect(t - last).toBeGreaterThanOrEqual(30000)
          last = t
          if (t < executeAt) {
            expect(readyAt.bloodthirst - t).toBeGreaterThanOrEqual(1500)
            expect(readyAt.whirlwind - t).toBeGreaterThanOrEqual(1500)
          }
        }
        if (id in readyAt) readyAt[id] = t + cd(id)
      }
    }
    expect(uses).toBeGreaterThan(40)
  })
})

describe('racial cooldowns (warrior.md §2.9, §5.2 row 3 and notes)', () => {
  const orc = (durationMs: number, extra: SimConfig['rotation'] = {}) =>
    abilityPlan({ ...OFF, 'warrior.fury.deathWish.enabled': true, 'warrior.fury.racial.enabled': true, ...extra }, durationMs, undefined, 'horde-orc')
  const times = (plan: Plan) => {
    const { casts } = castsPerFight(plan, 1)[0]
    return { dw: timesOf(casts, 'deathWish'), racial: timesOf(casts, 'bloodFury') }
  }

  it('synced with Death Wish: used with it, unless waiting for it would cost a use', () => {
    // 150 s: Death Wish's only use is held to 120 s, a full Blood Fury cooldown away: one now, one with it.
    expect(times(orc(150000))).toEqual({ dw: [120000], racial: [0, 120000] })
    // 140 s: one used now would still be cooling down at 110 s, so it waits for Death Wish.
    expect(times(orc(140000))).toEqual({ dw: [110000], racial: [110000] })
    // 400 s: every use comes with a Death Wish.
    const long = times(orc(400000))
    expect(long.dw).toHaveLength(3)
    expect(long.racial).toEqual(long.dw)
  })

  it('on cooldown without the sync, or without Death Wish', () => {
    expect(times(orc(150000, { 'warrior.fury.cooldowns.syncWithDeathWish': false })).racial).toEqual([0, 120000])
    expect(times(orc(300000, { 'warrior.fury.cooldowns.syncWithDeathWish': false })).racial).toEqual([0, 120000, 240000])
    expect(times(orc(300000, { 'warrior.fury.deathWish.enabled': false })).racial).toEqual([0, 120000, 240000])
  })

  it('Blood Fury: +10% attack power for 15 s (Bloodthirst deals 0.35 × AP + 48, W1)', () => {
    const plan = abilityPlan({ ...only('bloodthirst'), 'warrior.fury.racial.enabled': true }, 60000, undefined, 'horde-orc')
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 2000)
    const sim = new Sim(plan)
    let at = 0
    const hits: [number, number][] = []
    sim.castTrace = (_a, t) => {
      at = t
    }
    sim.damageTrace = (s, damage) => {
      if (s === source(plan, 'bloodthirst')) hits.push([at, damage])
    }
    for (let i = 0; i < 10; i++) sim.runFight(i)
    const during = hits.filter(([t]) => t < 15000)
    const after = hits.filter(([t]) => t > 15000)
    expect(during.length).toBeGreaterThan(0)
    for (const [, d] of during) expect(d).toBeCloseTo(0.35 * 2200 + 48, 9)
    for (const [, d] of after) expect(d).toBeCloseTo(0.35 * 2000 + 48, 9)
  })

  it('Berserking: +10% attack speed for 10 s, from the next swing (W17’s ×1.10)', () => {
    const plan = abilityPlan({ ...OFF, 'warrior.fury.racial.enabled': true }, 15000, undefined, 'horde-troll')
    plan.weapons = [{ ...plan.weapons[0]!, ...O }, null]
    expect(new Sim(plan).inspect().swingMs[0]).toBe(2600)
    const sim = new Sim(plan)
    const swings: number[] = []
    sim.trace = (s, _hand, t) => {
      if (s === SOURCE_MAIN_HAND) swings.push(t)
    }
    sim.runFight(0)
    // round(2600 / 1.1) = 2364 while it lasts; the swing at 9456 is the last one it speeds up.
    expect(swings).toEqual([0, 2364, 4728, 7092, 9456, 11820, 14420])
  })
})

describe('Battle Shout (warrior.md §5.2 rows 0 and 1, §1.1)', () => {
  const shout = (extra: SimConfig['rotation'] = {}): SimConfig['rotation'] => ({
    ...OFF,
    'warrior.fury.battleShout.enabled': true,
    'warrior.fury.prepull.battleShout': true,
    ...extra,
  })
  const shoutTimes = (durationMs: number, extra?: SimConfig['rotation']) => timesOf(castsPerFight(abilityPlan(shout(extra), durationMs), 1)[0].casts, 'battleShout')

  it('is shouted 3 s before the pull, and again with 3 s left only if the fight outlasts it', () => {
    // 177 s left at the pull, so the refresh comes at 174 s; each refresh lasts 180 s more.
    expect(shoutTimes(200000)).toEqual([-3000, 174000])
    expect(shoutTimes(400000)).toEqual([-3000, 174000, 351000])
    // It would run out 1 ms before the end: refreshed. At or after the end: not.
    expect(shoutTimes(177001)).toEqual([-3000, 174000])
    expect(shoutTimes(177000)).toEqual([-3000])
    expect(shoutTimes(176000)).toEqual([-3000])
    expect(shoutTimes(200000, { 'warrior.fury.battleShout.refreshBelowSec': 10 })).toEqual([-3000, 167000])
  })

  it('costs nothing before the pull; without the pre-pull it’s the first thing used once there are 10 rage', () => {
    const plan = abilityPlan(shout(), 10000)
    for (const w of plan.weapons) w!.rageMult = 0
    const [{ casts }] = castsPerFight(plan, 1)
    expect(casts).toEqual([['battleShout', -3000, 0]])
    const late = castsPerFight(abilityPlan(shout({ 'warrior.fury.prepull.battleShout': false, 'warrior.fury.bloodthirst.enabled': true }), 30000), 1)[0].casts
    expect(late[0][0]).toBe('battleShout')
    expect(late[0][1]).toBeGreaterThanOrEqual(0)
    expect(late[0][2]).toBeGreaterThanOrEqual(100)
  })

  it('adds 139 attack power while it’s up: Bloodthirst deals 0.35 × (2000 + 139) + 48 (W1)', () => {
    // 170 s: the pre-pull shout lasts the whole fight.
    const plan = abilityPlan(shout({ 'warrior.fury.bloodthirst.enabled': true }), 170000)
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 2000)
    const hits = damages(plan, source(plan, 'bloodthirst'), 3)
    expect(hits.length).toBeGreaterThan(50)
    for (const d of hits) expect(d).toBeCloseTo(0.35 * 2139 + 48, 9)
  })

  it('counts once: with the upkeep on, the Buffs switch changes nothing; with it off, the switch adds its static 139', () => {
    const d = defaultConfig('warrior-fury')
    const run = { mode: 'fixed' as const, iterations: 100, seed: 31 }
    const withBuff: SimConfig = { ...d, buffs: { raid: d.buffs.raid, enabled: ['battleShout'] }, run }
    const without: SimConfig = { ...d, buffs: { raid: d.buffs.raid, enabled: [] }, run }
    const off = { 'warrior.fury.battleShout.enabled': false }
    const damage = (c: SimConfig) => {
      const sim = new Sim(buildPlan(c).plan)
      for (let i = 0; i < 20; i++) sim.runFight(i)
      return Array.from(sim.counters)
    }
    expect(buildPlan(withBuff).plan.stats.ap).toBe(buildPlan(without).plan.stats.ap)
    expect(damage(withBuff)).toEqual(damage(without))
    expect(buildPlan({ ...withBuff, rotation: off }).plan.stats.ap - buildPlan({ ...without, rotation: off }).plan.stats.ap).toBe(139)
    expect(buildPlan({ ...withBuff, rotation: off }).plan.abilities.map((a) => a.id)).not.toContain('battleShout')
    // The sheet shows the shout the rotation keeps up, as it shows the Buffs switch's.
    expect(buildPlan(without).sheet.attackPower).toBe(buildPlan({ ...withBuff, rotation: off }).sheet.attackPower)
    expect(buildPlan(without).sheet.attackPower - buildPlan({ ...without, rotation: off }).sheet.attackPower).toBe(139)
  })
})

describe('the pre-pull (warrior.md §5.2 row 0)', () => {
  it('Bloodrage at −1 s: its 10 rage is there at the pull, its ticks come at 0–9 s, and it’s ready again at 59 s', () => {
    const plan = abilityPlan(only('bloodrage', { 'warrior.fury.prepull.bloodrage': true }), 70000)
    for (const w of plan.weapons) w!.rageMult = 0
    expect(timesOf(castsPerFight(plan, 1)[0].casts, 'bloodrage')).toEqual([-1000, 59000])

    const prepullOnly = (L: number) => {
      const p = abilityPlan({ ...OFF, 'warrior.fury.prepull.bloodrage': true }, L)
      for (const w of p.weapons) w!.rageMult = 0
      const sim = new Sim(p)
      sim.runFight(0)
      const row = source(p, 'bloodrage') * FIELD_COUNT
      return { gained: sim.totalRageGainedTenths, casts: sim.counters[row + FIELD.casts], threat: sim.counters[row + FIELD.threat] }
    }
    // A fight of L ms runs events at t < L: the tick at 0 is in every fight.
    expect([1, 1000, 1001, 9001, 20000].map((L) => prepullOnly(L).gained)).toEqual([110, 110, 120, 200, 200])
    // It counts as a cast; only the ticks in the fight make threat (5 per rage), not the rage before the pull.
    expect(prepullOnly(20000)).toMatchObject({ casts: 1, threat: 50 })
  })

  it('Charge: 15 rage, +3 per Improved Charge rank; the swap to Berserker Stance keeps at most 10 + 3 per Improved Tactical Mastery rank', () => {
    const atPull = (ranks: Record<string, number>, bloodrage = false) => {
      const rotation = only('deathWish', { 'warrior.fury.deathWish.alignToEnd': false, 'warrior.fury.prepull.charge': true, 'warrior.fury.prepull.bloodrage': bloodrage })
      const plan = abilityPlan(rotation, 10000, furyTalents(ranks))
      for (const w of plan.weapons) w!.rageMult = 0
      const dw = castsPerFight(plan, 1)[0].casts.find(([id]) => id === 'deathWish')!
      expect(dw[1]).toBe(0)
      return dw[2]
    }
    // The default build: no Improved Charge, Improved Tactical Mastery 5/5 (keeps 25).
    expect(atPull({})).toBe(150)
    expect(atPull({ 'Improved Charge': 2 })).toBe(210)
    expect(atPull({ 'Improved Charge': 2, 'Improved Tactical Mastery': 0 })).toBe(100)
    expect(atPull({ 'Improved Tactical Mastery': 1 })).toBe(130)
    // With Bloodrage at −1 s: 10 + 21 = 31, the swap keeps 25, then Bloodrage's tick at 0 adds 1.
    expect(atPull({ 'Improved Charge': 2 }, true)).toBe(260)
    // Off by default.
    expect(buildPlan(defaultConfig('warrior-fury')).plan.prepull.chargeTenths).toBe(0)
  })
})

describe('Mighty Rage Potion (warrior.md §5.2 row 16, buffs doc §3.5)', () => {
  const potionPlan = (durationMs: number, extra: SimConfig['rotation'] = {}, fight: Partial<SimConfig['fight']> = {}) => {
    const d = defaultConfig('warrior-fury')
    return abilityPlan({ ...OFF, 'warrior.fury.ragePotion.enabled': true, ...extra }, durationMs, undefined, 'alliance-human', {
      buffs: { raid: d.buffs.raid, enabled: ['mightyRagePotion'] },
      fight: { ...d.fight, durationVariationPct: 0, ...fight },
    })
  }
  const ids = (plan: Plan) => plan.abilities.map((a) => a.id)

  it('needs the potion selected in Buffs, and its switch on', () => {
    expect(ids(potionPlan(60000))).toContain('mightyRagePotion')
    expect(ids(abilityPlan({ ...OFF, 'warrior.fury.ragePotion.enabled': true }))).not.toContain('mightyRagePotion')
    expect(ids(potionPlan(60000, { 'warrior.fury.ragePotion.enabled': false }))).not.toContain('mightyRagePotion')
  })

  it('is drunk once a fight, from the start of the execute phase, at rage ≤ 55', () => {
    // A 150 s execute phase, longer than the potion's 2 min cooldown; Execute keeps rage low.
    const plan = potionPlan(300000, { 'warrior.fury.execute.enabled': true }, { executePct: 50 })
    let atStart = 0
    for (const { executeAt, casts } of castsPerFight(plan, 20)) {
      const potions = casts.filter(([id]) => id === 'mightyRagePotion')
      expect(potions).toHaveLength(1)
      const [[, t, rage]] = potions
      expect(t).toBeGreaterThanOrEqual(executeAt)
      expect(rage).toBeLessThanOrEqual(550)
      // Rage is capped when the phase starts: the first Execute spends it, and the potion follows
      // at once, unless that Execute missed (it keeps the rage then) and it waits for the next.
      if (t === executeAt) atStart++
      else expect(casts.some(([id, when]) => id === 'execute' && when === t)).toBe(true)
    }
    expect(atStart).toBeGreaterThan(10)
    // It waits for rage ≤ maxRage: at 0, never while white rage keeps flowing.
    const waits = potionPlan(60000, { 'warrior.fury.ragePotion.maxRage': 0 })
    expect(castsPerFight(waits, 5).flatMap((f) => timesOf(f.casts, 'mightyRagePotion'))).toEqual([])
  })

  it('gives 45–75 rage, a whole number of tenths drawn from the proc stream, and +60 Strength for 20 s', () => {
    const plan = potionPlan(60000)
    for (const w of plan.weapons) w!.rageMult = 0
    const sim = new Sim(plan)
    const gains: number[] = []
    for (let i = 0; i < 400; i++) {
      const before = sim.totalRageGainedTenths
      sim.runFight(i)
      gains.push(sim.totalRageGainedTenths - before)
    }
    for (const g of gains) {
      expect(Number.isInteger(g)).toBe(true)
      expect(g).toBeGreaterThanOrEqual(450)
      expect(g).toBeLessThanOrEqual(750)
    }
    expect(Math.min(...gains)).toBeLessThan(470)
    expect(Math.max(...gains)).toBeGreaterThan(730)
    expectMean(gains, 600)
    expect(plan.auras.find((a) => a.id === 'mightyRage')).toMatchObject({ str: 60, durationMs: 20000 })

    // +60 Strength is +120 attack power: Bloodthirst deals 0.35 × (2000 + 120) + 48 once it's drunk.
    // (maxRage 130: white rage alone keeps the bar above 55 here.)
    const bt = potionPlan(60000, { 'warrior.fury.bloodthirst.enabled': true, 'warrior.fury.ragePotion.maxRage': 130 })
    alwaysLandNoCrit(bt)
    setAttackPower(bt, 2000)
    const btSim = new Sim(bt)
    let at = 0
    let potionAt = Infinity
    const hits: [number, number][] = []
    btSim.castTrace = (a, t) => {
      at = t
      if (bt.abilities[a].id === 'mightyRagePotion') potionAt = t
    }
    btSim.damageTrace = (row, damage) => {
      if (row === source(bt, 'bloodthirst')) hits.push([at, damage])
    }
    btSim.runFight(0)
    expect(potionAt).toBe(btSim.executeAtMs)
    expect(hits.some(([t]) => t > potionAt)).toBe(true)
    for (const [t, d] of hits) expect(d).toBeCloseTo(0.35 * (t > potionAt ? 2120 : 2000) + 48, 9)
  })

  it('without an execute phase, is drunk in the last 20 s', () => {
    const plan = potionPlan(60000, {}, { executePct: 0 })
    for (const w of plan.weapons) w!.rageMult = 0
    expect(timesOf(castsPerFight(plan, 1)[0].casts, 'mightyRagePotion')).toEqual([40000])
  })
})

describe('Juju Flurry (warrior.md §5.2 row 17, buffs doc §3.3)', () => {
  const jujuPlan = (enabled: string[]) => {
    const d = defaultConfig('warrior-fury')
    return abilityPlan({ ...OFF, 'warrior.fury.jujuFlurry.enabled': true }, 130000, undefined, 'alliance-human', { buffs: { raid: d.buffs.raid, enabled } })
  }

  it('is used on cooldown from the pull when selected in Buffs', () => {
    expect(timesOf(castsPerFight(jujuPlan(['jujuFlurry']), 1)[0].casts, 'jujuFlurry')).toEqual([0, 60000, 120000])
    expect(jujuPlan([]).abilities.map((a) => a.id)).not.toContain('jujuFlurry')
  })

  it('+3% attack speed for 20 s, from the next swing: round(2600 / 1.03) = 2524', () => {
    const plan = jujuPlan(['jujuFlurry'])
    plan.weapons = [{ ...plan.weapons[0]!, ...O }, null]
    const sim = new Sim(plan)
    const swings: number[] = []
    sim.trace = (row, _hand, t) => {
      if (row === SOURCE_MAIN_HAND) swings.push(t)
    }
    sim.runFight(0)
    // The swing at 20192 was scheduled while it was up; the next one is back to 2.6 s.
    expect(swings.slice(0, 10)).toEqual([0, 2524, 5048, 7572, 10096, 12620, 15144, 17668, 20192, 22792])
  })
})

describe('Weakness Analyzer (warrior.md §5.2 row 3, §7)', () => {
  const analyzerPlan = (rotation: SimConfig['rotation'], durationMs = 60000) =>
    abilityPlan({ ...OFF, 'warrior.fury.trinkets.enabled': true, ...rotation }, durationMs, undefined, 'alliance-human', {
      gear: { mainHand: { itemId: 17016 }, offHand: { itemId: 18498 }, trinket1: { itemId: 272438 } },
    })

  it('+5% crit until the next crit, white or special', () => {
    /** Crits per fight over 200 fights, with a level-60 target and 0% crit of our own: every crit comes from the trinket. */
    const critsPerFight = (trinkets: boolean) => {
      const plan = analyzerPlan({ 'warrior.fury.bloodthirst.enabled': true, 'warrior.fury.trinkets.enabled': trinkets })
      plan.fight.targetLevel = 60
      plan.stats.crit -= new Sim(plan).inspect().crit[0]
      expect(new Sim(plan).inspect().crit[0]).toBeCloseTo(0, 9)
      const sim = new Sim(plan)
      const rows = [SOURCE_MAIN_HAND, SOURCE_OFF_HAND, source(plan, 'bloodthirst')]
      const out: number[] = []
      for (let i = 0; i < 200; i++) {
        const before = rows.reduce((n, r) => n + sim.counters[r * FIELD_COUNT + FIELD.crits], 0)
        sim.runFight(i)
        out.push(rows.reduce((n, r) => n + sim.counters[r * FIELD_COUNT + FIELD.crits], 0) - before)
      }
      return out
    }
    expect(critsPerFight(false).every((n) => n === 0)).toBe(true)
    // One use in 60 s (90 s cooldown): at most one crit a fight. About 20 attacks in its 20 s at 5%:
    // one lands in about 1 − 0.95^20 ≈ 64% of fights.
    const crits = critsPerFight(true)
    expect(crits.every((n) => n <= 1)).toBe(true)
    const lucky = crits.reduce((a, b) => a + b, 0)
    expect(lucky).toBeGreaterThan(100)
    expect(lucky).toBeLessThan(180)
  })

  it('is used on cooldown without Death Wish (90 s), and not with the trinket switch off', () => {
    expect(timesOf(castsPerFight(analyzerPlan({}, 200000), 1)[0].casts, 'weaknessAnalyzer')).toEqual([0, 90000, 180000])
    expect(analyzerPlan({ 'warrior.fury.trinkets.enabled': false }).abilities.map((a) => a.id)).not.toContain('weaknessAnalyzer')
  })

  it('synced with Death Wish, as the racial is', () => {
    // 150 s: Death Wish held to 120 s; the trinket goes at the pull (ready again by then) and with it.
    const plan = analyzerPlan({ 'warrior.fury.deathWish.enabled': true }, 150000)
    const [{ casts }] = castsPerFight(plan, 1)
    expect(timesOf(casts, 'deathWish')).toEqual([120000])
    expect(timesOf(casts, 'weaknessAnalyzer')).toEqual([0, 120000])
  })
})

describe('Fury rows 9 and 12 settings in the engine (warrior.md §5.2)', () => {
  it('row 9: Whirlwind waits for its 25 rage plus `reserve`', () => {
    const rageAtWhirlwind = (reserve: number) => {
      const d = defaultConfig('warrior-fury')
      const plan = buildPlan({ ...d, rotation: { 'warrior.fury.whirlwind.reserve': reserve }, run: { ...d.run, seed: 9 } }).plan
      return castsPerFight(plan, 40).flatMap(({ casts }) => casts.filter(([id]) => id === 'whirlwind').map(([, , rage]) => rage))
    }
    const plain = rageAtWhirlwind(0)
    const reserved = rageAtWhirlwind(30)
    expect(Math.min(...plain)).toBeGreaterThanOrEqual(250)
    expect(plain.some((r) => r < 550)).toBe(true)
    expect(reserved.length).toBeGreaterThan(40)
    expect(Math.min(...reserved)).toBeGreaterThanOrEqual(550)
  })

  it('row 12: with `onlyWhenFlurryDown`, Hamstring waits while Flurry is up', () => {
    /** Hamstring alone at any rage, with Flurry the only proc; every white swing that can crit does (or none). */
    const run = (flurryDown: boolean, crits: boolean) => {
      const d = defaultConfig('warrior-fury')
      const plan = buildPlan({
        ...d,
        rotation: { ...OFF, 'warrior.fury.hamstring.enabled': true, 'warrior.fury.hamstring.minRage': 0, 'warrior.fury.hamstring.onlyWhenFlurryDown': flurryDown },
        buffs: { raid: d.buffs.raid, enabled: [] },
        fight: { ...d.fight, durationVariationPct: 0, executePct: 0 },
      }).plan
      plan.procs = plan.procs.filter((p) => p.id === 'flurry')
      plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
      plan.procs.forEach((p, i) => plan.triggers[p.trigger].push(i))
      plan.stats.hit = 100
      plan.fight.bossCanDodge = false
      plan.stats.crit = crits ? 100 : -100
      const flurry = plan.auras.findIndex((a) => a.id === 'flurry')
      const sim = new Sim(plan)
      let hamstrings = 0
      sim.castTrace = (a) => {
        if (plan.abilities[a].id === 'hamstring') hamstrings++
      }
      for (let i = 0; i < 10; i++) sim.runFight(i)
      return { hamstrings: hamstrings / 10, flurryUptime: sim.auraUpMs[flurry] / (10 * sim.fightMs), damage: Array.from(sim.counters) }
    }
    // With Flurry up nearly all fight, Hamstring waits for the few moments it's down.
    const up = run(true, true)
    const always = run(false, true)
    expect(up.flurryUptime).toBeGreaterThan(0.9)
    expect(always.hamstrings).toBeGreaterThan(50)
    expect(up.hamstrings).toBeLessThan(always.hamstrings / 5)
    // With no crits Flurry never comes up, and the setting changes nothing.
    const down = run(true, false)
    expect(down.flurryUptime).toBe(0)
    expect(down.hamstrings).toBeGreaterThan(50)
    expect(down).toEqual(run(false, false))
  })
})

describe('without a main-hand weapon (warrior.md §7)', () => {
  it('uses no ability that attacks, so it spends no rage on one; casts are still used', () => {
    const d = defaultConfig('warrior-fury')
    for (const gear of [{ ...d.gear, mainHand: undefined, offHand: undefined }, { ...d.gear, mainHand: undefined }]) {
      const { plan, assumptions } = buildPlan({ ...d, gear, run: { ...d.run, seed: 5 } })
      expect(assumptions.map((a) => a.id)).toContain('noWeapon')
      // The rotation still has its attacks, which the engine refuses.
      expect(plan.abilities.map((a) => a.id)).toEqual(expect.arrayContaining(['bloodthirst', 'whirlwind', 'heroicStrike', 'hamstring', 'execute']))
      const used = new Set<string>()
      let damage = 0
      const sim = new Sim(plan)
      sim.castTrace = (a) => used.add(plan.abilities[a].id)
      for (let i = 0; i < 20; i++) {
        sim.runFight(i)
        damage += sim.fightDamage
      }
      expect(damage).toBe(0)
      for (const id of used) expect(plan.abilities.find((a) => a.id === id)!.kind, id).toBe('cast')
      expect([...used]).toEqual(expect.arrayContaining(['battleShout', 'bloodrage', 'deathWish', 'recklessness']))
    }
  })

  it('Arms: no Rend, Execute or Heroic Strike either', () => {
    const d = defaultConfig('warrior-arms')
    const plan = buildPlan({ ...d, gear: { ...d.gear, mainHand: undefined }, run: { ...d.run, seed: 5 } }).plan
    expect(plan.abilities.map((a) => a.id)).toEqual(expect.arrayContaining(['rend', 'overpower', 'slam', 'mortalStrike', 'execute', 'heroicStrike']))
    const used = new Set<string>()
    const sim = new Sim(plan)
    sim.castTrace = (a) => used.add(plan.abilities[a].kind)
    for (let i = 0; i < 20; i++) sim.runFight(i)
    expect([...used]).toEqual(['cast'])
  })
})

describe('determinism with every cooldown and consumable in play (decision D15)', () => {
  it('gives the same result for the same config and seed', () => {
    const d = defaultConfig('warrior-fury')
    const config: SimConfig = {
      ...d,
      race: 'horde-orc',
      talents: furyTalents({ 'Improved Berserker Rage': 2, 'Improved Bloodrage': 2 }),
      gear: { ...d.gear, trinket2: { itemId: 272438 } },
      buffs: { ...d.buffs, enabled: [...d.buffs.enabled, 'jujuFlurry'] },
      rotation: { 'warrior.fury.prepull.charge': true },
      run: { mode: 'fixed', iterations: 300, seed: 77 },
    }
    const run = (c: SimConfig) => {
      const sim = new Sim(buildPlan(c).plan)
      const damage: number[] = []
      for (let i = 0; i < 300; i++) {
        sim.runFight(i)
        damage.push(sim.fightDamage)
      }
      return { damage, counters: Array.from(sim.counters) }
    }
    const a = run(config)
    expect(run(structuredClone(config))).toEqual(a)
    const plan = buildPlan(config).plan
    for (const id of ['battleShout', 'deathWish', 'bloodFury', 'weaknessAnalyzer', 'recklessness', 'bloodrage', 'berserkerRage', 'mightyRagePotion', 'jujuFlurry']) {
      expect(a.counters[source(plan, id) * FIELD_COUNT + FIELD.casts], id).toBeGreaterThan(0)
    }
  })
})
