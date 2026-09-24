// A persistent pool of simulation workers (decision D15).
//
// `navigator.hardwareConcurrency − 1` workers (at least 1), created on the first run and kept
// warm. Each run sends its plan once per worker, then chunks; the driver merges results in chunk
// order, so which worker ran what never changes the numbers. Cancelling stops dispatching; the
// few chunks already running finish in the background and are ignored.
import type { FromWorker, ToWorker } from '@/worker/protocol'
import type { ChunkResult } from '../engine/chunk'
import { EngineCache, ENGINES_PER_LANE, type FightRunner, type FightSamples } from '../optimize/fights'
import type { Plan } from '../plan/types'
import type { ChunkExecutor } from './driver'

interface Slot {
  worker: Worker
  planId: number
  busy: number
  /** A mirror of the worker's optimizer engine cache: the same operations in the same order. */
  engines: EngineCache<true>
}

interface Job {
  slot: Slot
  resolve: (result: never) => void
  reject: (error: Error) => void
}

export class WorkerPool {
  private readonly slots: Slot[] = []
  private readonly jobs = new Map<number, Job>()
  private nextJob = 1
  private nextPlan = 1
  readonly size: number

  constructor(size: number) {
    this.size = size
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
          slot.busy++
          this.jobs.set(jobId, { slot, resolve: resolve as (result: never) => void, reject })
          this.post(slot, { type: 'chunk', jobId, planId, chunk, fights })
        }),
    }
  }

  /**
   * The optimizer's runner on the pool (docs/optimizer.md#fights-and-runners): a job goes to the
   * least busy worker, one that has the plan's engine if there's a tie, and the plan is sent only
   * to a worker whose cache lacks it. Samples don't depend on where they ran.
   */
  fightRunner(): FightRunner {
    this.ensureWorkers()
    return {
      lanes: this.slots.length,
      run: (source, from, count) =>
        new Promise<FightSamples>((resolve, reject) => {
          const least = Math.min(...this.slots.map((s) => s.busy))
          const slot = this.slots.find((s) => s.busy === least && s.engines.has(source.key)) ?? this.slots.find((s) => s.busy === least)!
          const known = slot.engines.has(source.key)
          // Build the plan before any bookkeeping: if it throws, the job fails with the mirror and
          // the worker's load as they were.
          let plan: Plan | undefined
          try {
            if (!known) plan = source.plan()
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)))
            return
          }
          if (known) slot.engines.get(source.key)
          else slot.engines.set(source.key, true)
          const jobId = this.nextJob++
          slot.busy++
          this.jobs.set(jobId, { slot, resolve: resolve as (result: never) => void, reject })
          this.post(slot, { type: 'fights', jobId, key: source.key, ...(plan ? { plan } : {}), from, count })
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
    const slot: Slot = { worker, planId: 0, busy: 0, engines: new EngineCache<true>(ENGINES_PER_LANE) }
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data
      const job = this.jobs.get(message.jobId)
      if (!job) return
      this.jobs.delete(message.jobId)
      slot.busy--
      if (message.type === 'result') job.resolve(message.result as never)
      else if (message.type === 'samples') job.resolve(message.samples as never)
      else job.reject(new Error(message.message))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      this.fail(slot, new Error(event.message || 'A simulation worker stopped unexpectedly.'))
    }
    return slot
  }

  /** A worker crashed: fail its jobs and replace it. */
  private fail(slot: Slot, error: Error) {
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
