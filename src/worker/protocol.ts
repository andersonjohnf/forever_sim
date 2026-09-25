// Messages between the main thread and simulation workers (docs/architecture.md#engine-design-m1).
import type { ChunkResult } from '@/sim/engine/chunk'
import type { FightSamples } from '@/sim/optimize/fights'
import type { Plan } from '@/sim/plan/types'

export type ToWorker =
  /** Sets the plan the next chunks run; the worker builds its engine once per plan. */
  | { type: 'plan'; planId: number; plan: Plan }
  | { type: 'chunk'; jobId: number; planId: number; chunk: number; fights: number }
  /**
   * The optimizer's per-fight samples (docs/optimizer.md#fights-and-runners): fights `from` …
   * `from + count − 1` of the plan under `key`. The plan comes along only when the worker's engine
   * cache doesn't have it, which the pool knows by mirroring the cache.
   */
  | { type: 'fights'; jobId: number; key: number; plan?: Plan; from: number; count: number }

export type FromWorker =
  /** Sent once its script has loaded and run, so a later failure isn't taken for one to start. */
  | { type: 'ready' }
  | { type: 'result'; jobId: number; result: ChunkResult }
  | { type: 'samples'; jobId: number; samples: FightSamples }
  | { type: 'error'; jobId: number; message: string }
