// A persistent pool of simulation workers (decision D15).
//
// `navigator.hardwareConcurrency − 1` workers (at least 1), created on the first run and kept
// warm. Each run sends its plan once per worker, then chunks; the driver merges results in chunk
// order, so which worker ran what never changes the numbers. Cancelling stops dispatching; the
// few chunks already running finish in the background and are ignored. A watchdog fails a worker
// that has work but stays silent for CHUNK_TIMEOUT_MS, so a hung chunk ends the run with an error
// instead of leaving it running forever.
import type { FromWorker, ToWorker } from '@/worker/protocol'
import type { ChunkResult } from '../engine/chunk'
import type { Plan } from '../plan/types'
import type { ChunkExecutor } from './driver'

/**
 * How long a worker with work may go without answering before it counts as hung
 * (docs/architecture.md#iterations-determinism-and-workers). A chunk of the slowest spec at the
 * longest fight (900 s, ±25%) takes about 0.3 s on a desktop, so this leaves a slow phone a
 * hundredfold margin while a hang still ends within a minute. It only fails the run; it never
 * changes a result.
 */
export const CHUNK_TIMEOUT_MS = 60_000

interface Slot {
  worker: Worker
  planId: number
  busy: number
  /** Armed while the worker has work: its time to answer. */
  watchdog?: ReturnType<typeof setTimeout>
}

interface Job {
  slot: Slot
  resolve: (result: ChunkResult) => void
  reject: (error: Error) => void
}

export class WorkerPool {
  private readonly slots: Slot[] = []
  private readonly jobs = new Map<number, Job>()
  private nextJob = 1
  private nextPlan = 1
  readonly size: number
  private readonly chunkTimeoutMs: number

  constructor(size: number, { chunkTimeoutMs = CHUNK_TIMEOUT_MS }: { chunkTimeoutMs?: number } = {}) {
    this.size = size
    this.chunkTimeoutMs = chunkTimeoutMs
  }

  /** Whether this environment can run module workers. */
  static supported(): boolean {
    return typeof Worker !== 'undefined' && typeof navigator !== 'undefined'
  }

  static defaultSize(): number {
    const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2
    return Math.max(1, cores - 1)
  }

  /** An executor that runs `plan` on the pool. */
  executor(plan: Plan): ChunkExecutor {
    this.ensureWorkers()
    const planId = this.nextPlan++
    return {
      lanes: this.slots.length,
      run: (chunk, fights) =>
        new Promise<ChunkResult>((resolve, reject) => {
          const slot = this.slots.reduce((a, b) => (b.busy < a.busy ? b : a))
          if (slot.planId !== planId) {
            this.post(slot, { type: 'plan', planId, plan })
            slot.planId = planId
          }
          const jobId = this.nextJob++
          if (slot.busy++ === 0) this.arm(slot)
          this.jobs.set(jobId, { slot, resolve, reject })
          this.post(slot, { type: 'chunk', jobId, planId, chunk, fights })
        }),
    }
  }

  private post(slot: Slot, message: ToWorker) {
    slot.worker.postMessage(message)
  }

  private ensureWorkers() {
    while (this.slots.length < this.size) this.slots.push(this.spawn())
  }

  private spawn(): Slot {
    const worker = new Worker(new URL('../../worker/sim.worker.ts', import.meta.url), { type: 'module' })
    const slot: Slot = { worker, planId: 0, busy: 0 }
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data
      const job = this.jobs.get(message.jobId)
      if (!job) return
      this.jobs.delete(message.jobId)
      slot.busy--
      // An answer is progress: the next queued chunk gets a full timeout of its own.
      if (slot.busy > 0) this.arm(slot)
      else clearTimeout(slot.watchdog)
      if (message.type === 'result') job.resolve(message.result)
      else job.reject(new Error(message.message))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      this.fail(slot, new Error(event.message || 'A simulation worker stopped unexpectedly.'))
    }
    return slot
  }

  /** Starts (or restarts) `slot`'s time to answer. */
  private arm(slot: Slot) {
    clearTimeout(slot.watchdog)
    slot.watchdog = setTimeout(() => {
      const seconds = Math.round(this.chunkTimeoutMs / 1000)
      this.fail(slot, new Error(`A simulation worker stopped responding (no answer in ${seconds} s), so the run was stopped.`))
    }, this.chunkTimeoutMs)
  }

  /** A worker crashed or hung: fail its jobs and replace it. */
  private fail(slot: Slot, error: Error) {
    clearTimeout(slot.watchdog)
    for (const [id, job] of this.jobs) {
      if (job.slot !== slot) continue
      this.jobs.delete(id)
      job.reject(error)
    }
    slot.worker.terminate()
    const i = this.slots.indexOf(slot)
    if (i >= 0) this.slots.splice(i, 1, this.spawn())
  }
}
