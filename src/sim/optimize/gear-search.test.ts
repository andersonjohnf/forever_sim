// The gear search end to end on the real engine, on a tiny budget (docs/optimizer.md#gear).
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../defaults'
import type { GearSlot, SimConfig } from '../types'
import { EngineCache, type FightRunner, localFightRunner, runFights, SearchTooLargeError } from './fights'
import { defaultConstraints, meetsSheet, sheetValues } from './constraints'
import { buildPlan } from '../plan/build'
import { Sim } from '../engine/sim'
import { isTwoHand } from '../equip'
import { Rng } from '../core/rng'
import { ITEM_EFFECTS } from '../effects/items'
import { itemFieldValues, weighedItem, weighValues } from './gear'
import { gearContext, type Gear, groupGears, POOL, SEARCHED_SLOTS, slotPool } from './gear'
import { decodeTalentCode, talentsInCodeOrder } from '@/data/talents/types'
import { TALENT_DATA } from '../defaults'
import { finalSeed, type GearSearchOptions, gearPools, measureStatWeights, MIN_RANK_FIGHTS, optimizeGear, optimizeTogether, rankGear, rankingPlans, runPlans, survivalReference } from './gear-search'
import { applyCandidate, candidateKey, candidatePlan, gearKey, type OptimizeReport, setupCandidate } from './optimize'
import type { GearReport } from './gear-search'

const OPEN: GearSlot[] = ['head', 'neck', 'finger1', 'finger2']

/** Fury with the lowest-level item the pool has in each open slot: a deliberately bad set. */
function badFury(): SimConfig {
  const config: SimConfig = { ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 0, seed: 7 } }
  const ctx = gearContext(config)
  const gear: Gear = { ...config.gear }
  const worst = (slot: GearSlot, not?: number) =>
    slotPool(ctx, slot)
      .filter((i) => i.id !== not)
      .sort((a, b) => a.itemLevel - b.itemLevel || a.id - b.id)[0]
  for (const slot of OPEN) gear[slot] = { itemId: worst(slot, slot === 'finger2' ? gear.finger1!.itemId : undefined).id }
  return { ...config, gear }
}

const search = (config: SimConfig, extra: Partial<GearSearchOptions> = {}) =>
  optimizeGear({
    config,
    filters: { locked: SEARCHED_SLOTS.filter((s) => !OPEN.includes(s)) },
    budget: { fights: 24_000 },
    runner: localFightRunner(),
    restarts: false,
    passes: 2,
    perSlot: 3,
    enchantsPerItem: 1,
    weightFights: 40,
    measureFights: 20,
    ...extra,
  })

describe('talents, gear and rotation together', () => {
  it('passes each answer on, and stops when a cycle moves nothing', { timeout: 120_000 }, async () => {
    // Fury, every default talent kept but Deep Wounds and Impale, so the talent space is small.
    const config = badFury()
    const data = TALENT_DATA.warrior
    const ranks = decodeTalentCode(data, config.talents)
    const keep = Object.fromEntries(
      talentsInCodeOrder(data)
        .flat()
        .filter((t) => (ranks[t.id] ?? 0) > 0 && t.name !== 'Deep Wounds' && t.name !== 'Impale')
        .map((t) => [t.name, ranks[t.id]]),
    )
    const passes = await optimizeTogether({
      config,
      talents: { keep, screenFights: 10 },
      filters: { locked: SEARCHED_SLOTS.filter((s) => !OPEN.includes(s)) },
      gearOptions: { restarts: false, passes: 1, perSlot: 2, enchantsPerItem: 1, weightFights: 30, measureFights: 20 },
      budget: { fights: 6_000 },
      maxFights: 200_000,
      runner: localFightRunner(),
      cycles: 3,
    })
    expect(passes[0].kind).toBe('talents')
    expect(passes[1].kind).toBe('gear')
    // The gear pass searched gear with the talent pass's answer.
    expect(passes[1].answer!.talents).toBe(passes[0].answer!.talents)
    // A pass after the first starts where the last ended, so its answer keeps what that one found.
    const gear = passes[1].answer!.gear!
    if (passes[2]) expect(passes[2].answer!.gear).toEqual(gear)
    // Each pass starts where the last one ended (O2L-12: the alternation, not only its length).
    for (let i = 1; i < passes.length; i++) {
      const prev = passes[i - 1].answer!
      const r = passes[i].report
      if (passes[i].kind === 'gear') expect(gearKey((r as GearReport).starts[0].gear)).toBe(gearKey(prev.gear ?? config.gear))
      else expect(candidateKey(config, (r as OptimizeReport).candidates[(r as OptimizeReport).startIndex!])).toBe(candidateKey(config, prev))
      // A pass moved exactly when its answer differs from where it started.
      expect(passes[i].moved).toBe(candidateKey(config, passes[i].answer!) !== candidateKey(config, prev))
    }
    // It stops on the first whole cycle (talents and gear) with nothing moved, and never runs past one.
    const still = passes.map((p) => !p.moved)
    for (let i = 2; i < passes.length; i++) expect(still[i - 2] && still[i - 1]).toBe(false)
    // Here the gear pass moves and the next cycle doesn't: it stops after 4 of its 6 passes.
    expect(passes.map((p) => [p.kind, p.moved])).toEqual([
      ['talents', false],
      ['gear', true],
      ['talents', false],
      ['gear', false],
    ])
    expect(passes.reduce((n, p) => n + p.report.fights, 0)).toBeLessThanOrEqual(200_000)
  })
})

describe('the gear search', () => {
  it('improves a bad set, within its budget, the same for a seed', { timeout: 120_000 }, async () => {
    const config = badFury()
    const a = await search(config)
    expect(a.answer).not.toBeNull()
    const answer = a.answer!.gear!
    // Something open changed, and nothing locked did.
    expect(OPEN.some((s) => answer[s]?.itemId !== config.gear[s]?.itemId)).toBe(true)
    for (const slot of SEARCHED_SLOTS.filter((s) => !OPEN.includes(s))) expect(answer[slot]).toEqual(config.gear[slot])
    // Clearly better than the bad set it started from, paired on the same fights.
    const leader = a.final!.race.standings.find((s) => s.candidate === a.final!.race.leader)!
    expect(leader.vsBaseline.score.mean - leader.vsBaseline.score.halfWidth).toBeGreaterThan(0)
    // The new items are the better ones: each open slot's item level went up.
    for (const slot of OPEN) if (answer[slot]?.itemId !== config.gear[slot]?.itemId) expect(POOL.get(answer[slot]!.itemId)!.itemLevel).toBeGreaterThan(POOL.get(config.gear[slot]!.itemId)!.itemLevel)
    expect(a.fights).toBeLessThanOrEqual(24_000)
    // The final race runs on a seed of its own, out of the steps' sample (O2L-11).
    expect(a.final!.seed).toBe(finalSeed(config.run.seed))
    expect(a.final!.seed).not.toBe(config.run.seed)
    // Deterministic: the same inputs and seed give the same answer and the same fights.
    const b = await search(config)
    expect(gearKey(b.answer!.gear!)).toBe(gearKey(answer))
    expect(b.fights).toBe(a.fights)
    expect(b.starts[0].steps.map((s) => [s.group, s.changed, s.fights])).toEqual(a.starts[0].steps.map((s) => [s.group, s.changed, s.fights]))
  })
})

describe('a pair with one slot locked (O2L-2)', () => {
  it('is ranked through the other slot, and its step races', { timeout: 120_000 }, async () => {
    const config: SimConfig = { ...defaultConfig('warrior-protection'), run: { mode: 'fixed', iterations: 0, seed: 1 } }
    for (const lock of ['trinket1', 'finger1', 'trinket2'] as const) {
      const ctx = gearContext(config, { locked: [lock] })
      const pools = gearPools(ctx)
      const { rankings } = await rankGear({ config, candidate: setupCandidate(config), ctx, pools, goal: 'balanced', runner: localFightRunner(), weightFights: 20, measureFights: 10 })
      const list = lock.startsWith('finger') ? 'finger' : 'trinket'
      expect(rankings.items.get(list)?.size ?? 0).toBeGreaterThan(10)
      const gears = groupGears(ctx, list === 'finger' ? 'rings' : 'trinkets', config.gear, rankings, pools)
      expect(gears.length).toBeGreaterThanOrEqual(5)
      for (const g of gears) expect(g[lock]).toEqual(config.gear[lock])
    }
  })
})

describe('the hard ceiling (O2L-3)', () => {
  it('refuses a cap the first ranking can’t fit, and never passes one it can', { timeout: 120_000 }, async () => {
    const config: SimConfig = { ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 0, seed: 3 } }
    const filters = { locked: SEARCHED_SLOTS.filter((s) => !['head', 'neck', 'trinket1', 'trinket2'].includes(s)) }
    const ctx = gearContext(config, filters)
    const { weightPlans, measurePlans } = rankingPlans(ctx, gearPools(ctx))
    const least = (weightPlans + measurePlans) * MIN_RANK_FIGHTS
    const run = (budget: number, maxFights: number) => optimizeGear({ config, filters, budget: { fights: budget }, maxFights, runner: localFightRunner(), passes: 1, perSlot: 3, enchantsPerItem: 1 })
    // Below the first ranking's fewest fights: refused before any fight.
    await expect(run(1_000_000, least - 1)).rejects.toThrow(SearchTooLargeError)
    // A small budget under a small cap: the ranking scales down to its floor, grows the budget to fit, and the whole search stays under the cap.
    const cap = least + 4_000
    const small = await run(1_000, cap)
    expect(small.ranking.weightFights).toBe(MIN_RANK_FIGHTS)
    expect(small.ranking.measureFights).toBe(MIN_RANK_FIGHTS)
    expect(small.fights).toBeLessThanOrEqual(cap)
    expect(small.notes.join(' ')).toMatch(/grows to that/)
    // No note reports a negative number of fights.
    expect(small.notes.join(' ')).not.toMatch(/-\d/)
    // A budget that fits: the first ranking is the whole search's (at most 40% of it), and the setup's start still steps.
    const fits = await run(80_000, 200_000)
    expect(fits.ranking.fights).toBeLessThanOrEqual(0.4 * 80_000 * 0.85 + 1)
    expect(fits.starts[0].steps.length).toBeGreaterThan(0)
    expect(fits.fights).toBeLessThanOrEqual(80_000)
  })
})

describe('Balanced’s normaliser (O2L-9)', () => {
  it('is the setup’s means, in the weights and the swaps alike', { timeout: 120_000 }, async () => {
    const config: SimConfig = { ...defaultConfig('warrior-protection'), run: { mode: 'fixed', iterations: 0, seed: 5 } }
    const ctx = gearContext(config, { locked: SEARCHED_SLOTS.filter((s) => !['head', 'trinket1', 'trinket2'].includes(s)) })
    const runner = localFightRunner()
    // Ranked at other gear than the setup's: the normaliser is still the setup's.
    const gear: Gear = { ...config.gear, trinket1: { itemId: 21180 } }
    const ranked = await rankGear({ config, candidate: { ...setupCandidate(config), gear }, ctx, pools: gearPools(ctx), goal: 'balanced', runner, weightFights: 60, measureFights: 20 })
    const [setup] = await runPlans(runner, [() => candidatePlan(config, setupCandidate(config))], 60)
    const mean = (a: Float64Array) => a.reduce((t, x) => t + x, 0) / a.length
    expect(ranked.baseline).toEqual({ dps: mean(setup.dps), tps: mean(setup.tps) })
    // A weight is per point of Balanced's score: twice the normaliser, half the weight.
    const weigh = (baseline: { dps: number; tps: number }) =>
      measureStatWeights({ config, candidate: setupCandidate(config), deltas: { str: 10, sta: 10 }, goal: 'balanced', runner, fights: 60, baseline })
    const one = await weigh(ranked.baseline!)
    const two = await weigh({ dps: 2 * ranked.baseline!.dps, tps: 2 * ranked.baseline!.tps })
    expect(one.weights.str).toBeGreaterThan(0)
    expect(two.weights.str).toBeCloseTo(one.weights.str! / 2, 9)
    // A DPS ranking needs no normaliser, and measures none.
    const fury: SimConfig = { ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 0, seed: 5 } }
    const furyCtx = gearContext(fury, { locked: SEARCHED_SLOTS.filter((s) => s !== 'head') })
    expect((await rankGear({ config: fury, candidate: setupCandidate(fury), ctx: furyCtx, pools: gearPools(furyCtx), goal: 'dps', runner, weightFights: 20, measureFights: 10 })).baseline).toBeUndefined()
  })
})

/** A runner with several lanes whose jobs finish out of order, as a worker pool's do: real engines, a shuffled delay a job. */
function pooledRunner(lanes: number, seed: number): FightRunner {
  const engines = new EngineCache<Sim>(64)
  const order = new Rng()
  order.seed(seed, 0, 0)
  return {
    lanes,
    run(source, from, count) {
      let sim = engines.get(source.key)
      if (!sim) {
        sim = new Sim(source.plan())
        engines.set(source.key, sim)
      }
      const out = runFights(sim, from, count)
      return new Promise((resolve) => setTimeout(() => resolve(out), Math.floor(order.next() * 4)))
    },
  }
}

describe('the gear search on a worker pool (O2L-12)', () => {
  it('gives the same answer, steps and fights on any number of lanes, in any finishing order', { timeout: 180_000 }, async () => {
    const config = badFury()
    const one = await search(config)
    const pooled = await search(config, { runner: pooledRunner(4, 11) })
    expect(gearKey(pooled.answer!.gear!)).toBe(gearKey(one.answer!.gear!))
    expect(pooled.fights).toBe(one.fights)
    expect(pooled.starts.map((s) => s.steps.map((x) => [x.group, x.changed, x.fights, x.status]))).toEqual(one.starts.map((s) => s.steps.map((x) => [x.group, x.changed, x.fights, x.status])))
    expect(pooled.ranking.weights.weights).toEqual(one.ranking.weights.weights)
  })
})

describe('a tank’s gear search (O2L-12)', () => {
  it('keeps the effective-health floor against the survival preset, and a one-hander and a shield', { timeout: 180_000 }, async () => {
    const config: SimConfig = { ...defaultConfig('warrior-protection'), run: { mode: 'fixed', iterations: 0, seed: 9 } }
    const open: GearSlot[] = ['head', 'legs', 'mainHand', 'offHand']
    const constraints = defaultConstraints('tank')
    const r = await optimizeGear({
      config,
      constraints,
      filters: { locked: SEARCHED_SLOTS.filter((s) => !open.includes(s)) },
      budget: { fights: 40_000 },
      runner: localFightRunner(),
      restarts: false,
      passes: 1,
      perSlot: 3,
      enchantsPerItem: 1,
      weightFights: 40,
      measureFights: 20,
    })
    expect(r.goal).toBe('balanced')
    expect(r.answer).not.toBeNull()
    const answer = r.answer!.gear!
    // The shield stays: a one-hander in the main hand, a shield in the off hand, at every start's end too.
    for (const gear of [answer, ...r.starts.map((s) => s.end)]) {
      expect(isTwoHand(POOL.get(gear.mainHand!.itemId)!)).toBe(false)
      expect(POOL.get(gear.offHand!.itemId)!.slot).toBe('shield')
    }
    // The floor is 90% of the survival preset's effective health, not the setup's (D30), and the answer meets it.
    const reference = sheetValues(buildPlan({ ...config, gear: survivalReference(config).gear, run: { mode: 'fixed', iterations: 0, seed: 9 } }))
    expect(r.final!.reference.ehp).toBeCloseTo(reference.ehp, 6)
    const sheet = sheetValues(buildPlan(applyCandidate(config, r.answer!)))
    expect(meetsSheet(sheet, reference, constraints)).toBe(true)
    expect(sheet.ehp).toBeGreaterThanOrEqual(0.9 * reference.ehp)
    // Every step raced, and none raced a set below the floor: a floor above every candidate leaves the step nothing.
    expect(r.starts[0].steps.length).toBeGreaterThan(0)
    const strict = await optimizeGear({
      config,
      constraints: [{ stat: 'ehp', min: 10, relative: true }],
      filters: { locked: SEARCHED_SLOTS.filter((s) => s !== 'head') },
      budget: { fights: 20_000 },
      runner: localFightRunner(),
      restarts: false,
      passes: 1,
      perSlot: 3,
      weightFights: 20,
      measureFights: 10,
    })
    expect(strict.answer).toBeNull()
    expect(strict.starts[0].steps.every((s) => !s.changed)).toBe(true)
  })
})

describe('stat weights and rankings on a known case (O2L-12)', () => {
  it('prices Strength at twice attack power through Kings, sets aside what the engine never reads, and ranks by them', { timeout: 120_000 }, async () => {
    const config: SimConfig = { ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 0, seed: 2 } }
    const runner = localFightRunner()
    const w = await measureStatWeights({ config, candidate: setupCandidate(config), deltas: { ap: 30, str: 15, spellDamage: 20 }, goal: 'dps', runner, fights: 400 })
    // Spell damage: the pilot's two plans agree on every fight, so it weighs exactly 0 and runs no more.
    expect(w.live).toEqual(['ap', 'str'])
    expect(w.weights.spellDamage).toBe(0)
    expect(w.fights).toBe(6 * 50 + 4 * 350)
    // A point of Strength is 2 attack power, times the Strength multiplier (Kings), times attack power's own.
    const stats = candidatePlan(config, setupCandidate(config)).stats
    const expected = w.weights.ap! * stats.apPerStr * stats.strMult
    expect(w.intervals.str!.halfWidth).toBeLessThan(0.05 * w.weights.str!)
    expect(Math.abs(w.weights.str! - expected)).toBeLessThan(w.intervals.str!.halfWidth + w.intervals.ap!.halfWidth * stats.apPerStr * stats.strMult + 0.03 * expected)
    // The rankings: a flat-stat item is its stats at the weights exactly; Hand of Justice, a modelled effect, is measured and worth DPS.
    const ctx = gearContext(config, { locked: SEARCHED_SLOTS.filter((s) => !['neck', 'trinket1', 'trinket2'].includes(s)) })
    const pools = gearPools(ctx)
    const { rankings } = await rankGear({ config, candidate: setupCandidate(config), ctx, pools, goal: 'dps', runner, weightFights: 200, measureFights: 200 })
    const neck = pools.get('neck')!.find((i) => weighedItem(ctx, i))!
    expect(rankings.items.get('neck')!.get(neck.id)).toBeCloseTo(weighValues(itemFieldValues(ctx, neck), rankings.weights), 9)
    expect(ITEM_EFFECTS[11815]).toBeDefined()
    expect(rankings.items.get('trinket')!.get(11815)).toBeGreaterThan(0)
  })
})
