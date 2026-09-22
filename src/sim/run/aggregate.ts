// Merging chunk results and turning them into a SimResult (docs/architecture.md#engine-design-m1).
import { ci95, combine, emptyMoments, type Moments, stdev } from '../core/welford'
import type { ChunkResult } from '../engine/chunk'
import { FIELD, FIELD_COUNT } from '../engine/sim'
import type { PlanBundle } from '../plan/types'
import type { AbilityResult, SimResult, Summary } from '../types'

export interface Aggregate {
  fights: number
  dps: Moments
  tps: Moments
  durationMs: number
  counters: Float64Array
  rageGainedTenths: number
  rageWastedTenths: number
}

export const emptyAggregate = (sources: number): Aggregate => ({
  fights: 0,
  dps: emptyMoments(),
  tps: emptyMoments(),
  durationMs: 0,
  counters: new Float64Array(sources * FIELD_COUNT),
  rageGainedTenths: 0,
  rageWastedTenths: 0,
})

/** Adds a chunk to the aggregate. Callers merge in chunk order, so the result is deterministic. */
export function mergeChunk(agg: Aggregate, chunk: ChunkResult): Aggregate {
  const counters = agg.counters
  for (let i = 0; i < counters.length; i++) counters[i] += chunk.counters[i]
  return {
    fights: agg.fights + chunk.fights,
    dps: combine(agg.dps, chunk.dps),
    tps: combine(agg.tps, chunk.tps),
    durationMs: agg.durationMs + chunk.durationMs,
    counters,
    rageGainedTenths: agg.rageGainedTenths + chunk.rageGainedTenths,
    rageWastedTenths: agg.rageWastedTenths + chunk.rageWastedTenths,
  }
}

const summary = (m: Moments): Summary => ({ mean: m.mean, stdev: stdev(m), ci95: ci95(m) })

export function toResult(bundle: PlanBundle, agg: Aggregate, elapsedMs: number): SimResult {
  const { plan } = bundle
  const c = agg.counters
  const abilities: AbilityResult[] = []
  plan.sources.forEach((source, i) => {
    const row = i * FIELD_COUNT
    const damage = c[row + FIELD.damage]
    const threat = c[row + FIELD.threat]
    // Rows that do nothing for the headline stay out of the breakdown.
    if (damage <= 0 && (plan.headline === 'dps' || threat <= 0)) return
    abilities.push({
      id: source.id,
      name: source.name,
      icon: source.icon,
      damage,
      threat,
      casts: c[row + FIELD.casts],
      hits: c[row + FIELD.hits],
      crits: c[row + FIELD.crits],
      misses: c[row + FIELD.misses],
      dodges: c[row + FIELD.dodges],
      parries: c[row + FIELD.parries],
      glances: c[row + FIELD.glances],
      blocks: c[row + FIELD.blocks],
    })
  })
  return {
    spec: plan.spec,
    profile: plan.profile.id,
    iterations: agg.fights,
    durationSec: agg.fights > 0 ? agg.durationMs / agg.fights / 1000 : plan.fight.durationMs / 1000,
    dps: summary(agg.dps),
    tps: summary(agg.tps),
    abilities,
    sheet: bundle.sheet,
    assumptions: bundle.assumptions,
    elapsedMs,
  }
}
