// The run driver: adaptive iteration count with exact determinism (decision D15).
//
// Chunks are dispatched in index order to any number of lanes (workers) and may finish in any
// order, but they are merged strictly in index order, and the stopping rule is checked at every
// chunk boundary of that ordered prefix. So the fights that count, and the merged numbers, are
// identical whether one lane ran everything or many lanes raced; extra chunks dispatched ahead of
// the stopping point are discarded.
import { ci95, type Moments } from '../core/welford'
import { CHUNK_SIZE, type ChunkResult } from '../engine/chunk'
import type { Plan } from '../plan/types'
import type { SimProgress } from '../types'
import { type Aggregate, emptyAggregate, mergeChunk } from './aggregate'

/** Adaptive precision target and bounds (decision D15, docs/architecture.md#iterations-determinism-and-workers). */
export const ADAPTIVE = {
  /** Stop when the 95% CI half-width of every headline metric is at most this share of its mean. */
  targetRelativeCi: 0.0025,
  minFights: 1000,
  maxFights: 50000,
} as const

export type Metric = 'dps' | 'tps'

/**
 * The headline metrics an adaptive run must pin down: DPS for DPS specs, and both TPS and DPS
 * for tanks, which report the two as equals (decision D18).
 */
export function headlineMetrics(plan: Pick<Plan, 'headline' | 'role'>): readonly Metric[] {
  return plan.headline === 'tps' || plan.role === 'tank' ? ['tps', 'dps'] : [plan.headline]
}

export interface ChunkExecutor {
  /** How many chunks can run at once. */
  readonly lanes: number
  run(chunk: number, fights: number): Promise<ChunkResult>
  /**
   * The run was cancelled with chunks still running: the executor may stop them (the pool
   * terminates their workers, so one that hangs can't fail the next run).
   */
  abandon?(): void
}

export interface DriveOptions {
  mode: 'adaptive' | 'fixed'
  /** Fights in fixed mode. */
  iterations: number
  onProgress?: (progress: SimProgress) => void
  signal?: AbortSignal
}

export function abortError(): DOMException {
  return new DOMException('The simulation was cancelled.', 'AbortError')
}

/** The largest 95% CI half-width the precision target allows for these moments. */
const allowedHalfWidth = (m: Moments) => ADAPTIVE.targetRelativeCi * Math.abs(m.mean)

/**
 * Whether the ordered prefix in `agg` is precise enough to stop (adaptive mode): every metric in
 * `metrics` must meet the target (decision D18), within the fight bounds.
 */
export function preciseEnough(agg: Aggregate, metrics: readonly Metric[]): boolean {
  if (agg.fights < ADAPTIVE.minFights) return false
  if (agg.fights >= ADAPTIVE.maxFights) return true
  return metrics.every((k) => ci95(agg[k]) <= allowedHalfWidth(agg[k]))
}

/**
 * Projected total fights for the progress bar (adaptive): n × (half-width / target)², for
 * whichever metric needs the most fights.
 */
export function projectedFights(agg: Aggregate, metrics: readonly Metric[]): number {
  let projected: number = ADAPTIVE.minFights
  for (const k of metrics) {
    const target = allowedHalfWidth(agg[k])
    if (target > 0 && agg.fights > 1) projected = Math.max(projected, Math.ceil(agg.fights * (ci95(agg[k]) / target) ** 2))
  }
  const clamped = Math.min(ADAPTIVE.maxFights, Math.max(projected, agg.fights))
  return Math.ceil(clamped / CHUNK_SIZE) * CHUNK_SIZE
}

export function drive(plan: Plan, executor: ChunkExecutor, options: DriveOptions): Promise<Aggregate> {
  const fixed = options.mode === 'fixed'
  const totalFights = fixed ? Math.max(1, Math.floor(options.iterations)) : ADAPTIVE.maxFights
  const totalChunks = Math.ceil(totalFights / CHUNK_SIZE)
  const fightsIn = (k: number) => Math.min(CHUNK_SIZE, totalFights - k * CHUNK_SIZE)
  const maxInFlight = Math.max(1, executor.lanes * 2)
  const { signal, onProgress } = options
  const metrics = headlineMetrics(plan)

  return new Promise<Aggregate>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    let agg = emptyAggregate(plan.sources.length, plan.auras.length)
    const pending = new Map<number, ChunkResult>()
    let nextToRun = 0
    let nextToMerge = 0
    let inFlight = 0
    let settled = false
    // Reported progress never moves backwards when the projected total grows.
    let shownRatio = 0

    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      if (error !== undefined) reject(error)
      else resolve(agg)
    }
    const onAbort = () => {
      finish(abortError())
      if (inFlight > 0) executor.abandon?.()
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const mergeReady = () => {
      while (pending.has(nextToMerge)) {
        agg = mergeChunk(agg, pending.get(nextToMerge)!)
        pending.delete(nextToMerge)
        nextToMerge++
        const done = fixed ? nextToMerge === totalChunks : preciseEnough(agg, metrics) || nextToMerge === totalChunks
        let total = done ? agg.fights : fixed ? totalFights : projectedFights(agg, metrics)
        if (!done && agg.fights / total < shownRatio) total = Math.ceil(agg.fights / shownRatio)
        shownRatio = agg.fights / total
        onProgress?.({ completedIterations: agg.fights, totalIterations: total })
        if (done) {
          finish()
          return
        }
      }
    }

    const pump = () => {
      while (!settled && inFlight < maxInFlight && nextToRun < totalChunks) {
        const k = nextToRun++
        inFlight++
        executor.run(k, fightsIn(k)).then(
          (result) => {
            inFlight--
            if (settled) return
            pending.set(k, result)
            mergeReady()
            pump()
          },
          (error) => {
            inFlight--
            finish(error instanceof Error ? error : new Error(String(error)))
          },
        )
      }
    }
    pump()
  })
}
