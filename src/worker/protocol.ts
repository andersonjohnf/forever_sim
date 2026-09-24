// Messages between the main thread and simulation workers (docs/architecture.md#engine-design-m1).
import type { ChunkResult } from '@/sim/engine/chunk'
import type { Plan } from '@/sim/plan/types'

export type ToWorker =
  /** Sets the plan the next chunks run; the worker builds its engine once per plan. */
  | { type: 'plan'; planId: number; plan: Plan }
  | { type: 'chunk'; jobId: number; planId: number; chunk: number; fights: number }

export type FromWorker =
  /** Sent once its script has loaded and run, so a later failure isn't taken for one to start. */
  | { type: 'ready' }
  | { type: 'result'; jobId: number; result: ChunkResult }
  | { type: 'error'; jobId: number; message: string }
