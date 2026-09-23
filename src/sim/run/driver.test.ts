// The adaptive stopping rule for tank specs (decision D18): a tank run pins down both TPS and DPS
// before it stops, and stays bit-identical for any number of lanes.
import { describe, expect, it } from 'vitest'
import { Rng } from '../core/rng'
import { addSample, ci95, emptyMoments, Z95 } from '../core/welford'
import { defaultConfig } from '../defaults'
import { CHUNK_SIZE, type ChunkResult, runChunk } from '../engine/chunk'
import { FIELD_COUNT, Sim } from '../engine/sim'
import { buildPlan } from '../plan/build'
import type { Plan } from '../plan/types'
import type { SimConfig, SimProgress } from '../types'
import { type Aggregate, emptyAggregate, mergeChunk } from './aggregate'
import { ADAPTIVE, type ChunkExecutor, drive, headlineMetrics, type Metric, preciseEnough, projectedFights } from './driver'
import { localExecutor } from './local'

const planFor = (spec: SimConfig['spec'], seed = 1) =>
  buildPlan({ ...defaultConfig(spec), run: { mode: 'adaptive', iterations: 3000, seed } }).plan

const withinTarget = (agg: Aggregate, k: Metric) => ci95(agg[k]) <= ADAPTIVE.targetRelativeCi * agg[k].mean

/**
 * Chunks of synthetic fights with a chosen spread per metric: each fight's TPS and DPS are uniform
 * around their means with the given coefficient of variation, seeded by the global fight index,
 * so a chunk is the same wherever and whenever it runs. Chunks finish out of order across lanes.
 */
function syntheticExecutor(plan: Plan, lanes: number, spread: Record<Metric, number>): ChunkExecutor {
  const rng = new Rng()
  const sample = (mean: number, cv: number) => mean * (1 + cv * Math.sqrt(3) * (2 * rng.next() - 1))
  return {
    lanes,
    run: (chunk, fights) =>
      new Promise<ChunkResult>((resolve) => {
        const dps = emptyMoments()
        const tps = emptyMoments()
        for (let i = 0; i < fights; i++) {
          rng.seed(plan.seed, chunk * CHUNK_SIZE + i, 0)
          addSample(tps, sample(300, spread.tps))
          addSample(dps, sample(150, spread.dps))
        }
        const result: ChunkResult = {
          chunk,
          fights,
          dps,
          tps,
          durationMs: fights * 180_000,
          counters: new Float64Array(plan.sources.length * FIELD_COUNT),
          auraUpMs: new Float64Array(plan.auras.length),
          auraApplications: new Float64Array(plan.auras.length),
          rageGainedTenths: 0,
          rageWastedTenths: 0,
          damageTaken: emptyMoments(),
          bossOutcomes: new Float64Array(7),
        }
        setTimeout(() => resolve(result), lanes > 1 ? (chunk * 7919) % 13 : 0)
      }),
  }
}

/** A fake pool of real chunks: `lanes` at once, later chunks tending to finish first. */
function racingExecutor(plan: Plan, lanes: number): ChunkExecutor {
  const sims = Array.from({ length: lanes }, () => new Sim(plan))
  let n = 0
  return {
    lanes,
    run: (chunk, fights) =>
      new Promise<ChunkResult>((resolve) => {
        const result = runChunk(plan, chunk, fights, sims[n++ % lanes])
        setTimeout(() => resolve(result), (chunk * 7919) % 13)
      }),
  }
}

/** Merges chunks in order until `stop` holds at a chunk boundary (from the minimum on). */
async function mergeUntil(executor: ChunkExecutor, plan: Plan, stop: (agg: Aggregate) => boolean): Promise<Aggregate> {
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; agg.fights < ADAPTIVE.maxFights; k++) {
    agg = mergeChunk(agg, await executor.run(k, CHUNK_SIZE))
    if (agg.fights >= ADAPTIVE.minFights && stop(agg)) break
  }
  return agg
}

describe('adaptive stopping for tank specs (decision D18)', () => {
  const tank = planFor('warrior-protection')
  const dps = planFor('warrior-fury')
  // TPS alone would settle at the 1,000-fight minimum; DPS needs about (1.96 × 0.12 / 0.0025)² ≈ 8,850.
  const dpsNoisier = { tps: 0.02, dps: 0.12 }

  it('pins down TPS and DPS for tanks, and only DPS for DPS specs', () => {
    expect(headlineMetrics(tank)).toEqual(['tps', 'dps'])
    expect(headlineMetrics(dps)).toEqual(['dps'])
    expect(headlineMetrics({ headline: 'tps', role: 'dps' })).toEqual(['tps', 'dps'])
    expect(headlineMetrics({ headline: 'dps', role: 'tank' })).toEqual(['tps', 'dps'])
  })

  it('keeps a tank run going until DPS is within target too, not just TPS', async () => {
    const tpsOnly = await mergeUntil(syntheticExecutor(tank, 1, dpsNoisier), tank, (a) => withinTarget(a, 'tps'))
    const both = await mergeUntil(syntheticExecutor(tank, 1, dpsNoisier), tank, (a) => withinTarget(a, 'tps') && withinTarget(a, 'dps'))
    expect(tpsOnly.fights).toBe(ADAPTIVE.minFights)
    expect(both.fights).toBeGreaterThan(5000)

    const agg = await drive(tank, syntheticExecutor(tank, 1, dpsNoisier), { mode: 'adaptive', iterations: 0 })
    expect(agg).toEqual(both)
    // One chunk earlier, TPS was long within the target but DPS wasn't yet.
    const before = await mergeUntil(syntheticExecutor(tank, 1, dpsNoisier), tank, (a) => a.fights >= both.fights - CHUNK_SIZE)
    expect(withinTarget(before, 'tps')).toBe(true)
    expect(withinTarget(before, 'dps')).toBe(false)
  })

  it('also waits for TPS when it is the noisier one', async () => {
    const tpsNoisier = { tps: 0.12, dps: 0.02 }
    const agg = await drive(tank, syntheticExecutor(tank, 1, tpsNoisier), { mode: 'adaptive', iterations: 0 })
    expect(agg.fights).toBeGreaterThan(5000)
    expect(withinTarget(agg, 'tps') && withinTarget(agg, 'dps')).toBe(true)
  })

  it('leaves DPS specs on DPS alone, however noisy their threat', async () => {
    const tpsNoisier = { tps: 0.12, dps: 0.02 }
    const agg = await drive(dps, syntheticExecutor(dps, 1, tpsNoisier), { mode: 'adaptive', iterations: 0 })
    expect(agg.fights).toBe(ADAPTIVE.minFights)
    expect(withinTarget(agg, 'tps')).toBe(false)
  })

  it('checks every metric it is given, within the fight bounds', () => {
    const agg = emptyAggregate(0)
    agg.fights = 2000
    agg.tps = { n: 2000, mean: 300, m2: 0 }
    agg.dps = { n: 2000, mean: 150, m2: 1999 * 150 ** 2 } // stdev = mean: far from the target
    expect(preciseEnough(agg, ['tps'])).toBe(true)
    expect(preciseEnough(agg, ['tps', 'dps'])).toBe(false)
    expect(preciseEnough({ ...agg, fights: ADAPTIVE.maxFights }, ['tps', 'dps'])).toBe(true)
    expect(preciseEnough({ ...agg, fights: ADAPTIVE.minFights - CHUNK_SIZE, dps: agg.tps }, ['tps', 'dps'])).toBe(false)
    // No damage at all (a shield and no weapon) never holds a tank run back.
    expect(preciseEnough({ ...agg, dps: { n: 2000, mean: 0, m2: 0 } }, ['tps', 'dps'])).toBe(true)
  })

  it('projects progress from whichever metric needs more fights', () => {
    const agg = emptyAggregate(0)
    agg.fights = 2000
    agg.tps = { n: 2000, mean: 300, m2: 0 }
    // DPS half-width 1.9 × the target: it needs 1.9² = 3.61 × the fights (7,220), in whole chunks.
    const sd = (1.9 * ADAPTIVE.targetRelativeCi * 150 * Math.sqrt(2000)) / Z95
    agg.dps = { n: 2000, mean: 150, m2: 1999 * sd ** 2 }
    expect(projectedFights(agg, ['tps'])).toBe(2000)
    expect(projectedFights(agg, ['dps'])).toBe(7250)
    expect(projectedFights(agg, ['tps', 'dps'])).toBe(7250)
    expect(projectedFights({ ...agg, fights: 40000 }, ['tps', 'dps'])).toBe(ADAPTIVE.maxFights)
  })

  it('reports progress towards the fights both metrics need, never moving backwards', async () => {
    const reports: SimProgress[] = []
    const agg = await drive(tank, syntheticExecutor(tank, 3, dpsNoisier), {
      mode: 'adaptive',
      iterations: 0,
      onProgress: (p) => reports.push(p),
    })
    const ratios = reports.map((p) => p.completedIterations / p.totalIterations)
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1])
    expect(reports.at(-1)).toEqual({ completedIterations: agg.fights, totalIterations: agg.fights })
    // Once the estimate has settled, it projects the DPS need, well past the 1,000 TPS would take.
    expect(reports[7].totalIterations).toBeGreaterThan(5000)
  })
})

describe('determinism for tank runs (decisions D15, D18)', () => {
  it('gives bit-identical synthetic tank runs for 1, 2, 3 and 8 lanes', async () => {
    const plan = planFor('warrior-protection')
    const spread = { tps: 0.02, dps: 0.12 }
    const one = await drive(plan, syntheticExecutor(plan, 1, spread), { mode: 'adaptive', iterations: 0 })
    for (const lanes of [2, 3, 8]) {
      const many = await drive(plan, syntheticExecutor(plan, lanes, spread), { mode: 'adaptive', iterations: 0 })
      expect(many).toEqual(one)
    }
  })

  it('gives the default Protection warrior the same adaptive result for any lane count and the same seed', async () => {
    const plan = planFor('warrior-protection', 4242)
    const one = await drive(plan, localExecutor(plan), { mode: 'adaptive', iterations: 0 })
    const three = await drive(plan, racingExecutor(plan, 3), { mode: 'adaptive', iterations: 0 })
    const fresh = planFor('warrior-protection', 4242)
    const again = await drive(fresh, racingExecutor(fresh, 5), { mode: 'adaptive', iterations: 0 })
    expect(three.fights).toBe(one.fights)
    expect(three.tps).toEqual(one.tps)
    expect(three.dps).toEqual(one.dps)
    expect(Array.from(three.counters)).toEqual(Array.from(one.counters))
    expect(again).toEqual(three)
    expect(withinTarget(one, 'tps') && withinTarget(one, 'dps')).toBe(true)
    expect(one.fights % CHUNK_SIZE).toBe(0)
  })
})
