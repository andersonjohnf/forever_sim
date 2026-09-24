// A persistent pool of simulation workers (decision D15).
//
// `navigator.hardwareConcurrency − 1` workers (at least 1), created on the first run and kept
// warm. Each run sends its plan once per worker, then chunks; the driver merges results in chunk
// order, so which worker ran what never changes the numbers. Cancelling stops dispatching; the
// few chunks already running finish in the background and are ignored. A watchdog fails a worker
// that has work but stays silent for CHUNK_TIMEOUT_MS of awake time, so a hung chunk ends the run
// with an error instead of leaving it running forever, while a tab the phone or browser froze for
// a while resumes its run instead of failing it. A worker that crashes or hangs is terminated and
// replaced only when the next run starts, never at once: one whose script can't load (after a deploy,
// say) would otherwise fail and respawn forever, with no run asking for it (issue #1).
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

/**
 * The watchdog counts silence in heartbeats of this length while the pool has work, and no tick
 * adds more than HEARTBEAT_MAX_GAP_MS. A frozen page (a phone's suspended tab, a laptop's Energy
 * Saver) fires no timers, so its first tick after waking sees a long gap; capping the gap means
 * only time the page was awake counts toward the timeout
 * (docs/architecture.md#iterations-determinism-and-workers).
 */
export const HEARTBEAT_MS = 1_000
export const HEARTBEAT_MAX_GAP_MS = 2_000

/** What a run says when a worker hung (docs/ux.md#states "Error"). */
export const WORKER_HANG_MESSAGE = 'The simulation stopped responding for a minute, so it was stopped. Run it again.'

/**
 * What a run says when a worker failed before it ever answered: its script didn't load or run, most
 * likely because the site was updated since the page loaded, so a reload is the way forward
 * (docs/ux.md#states "Error").
 */
export const WORKER_START_MESSAGE = 'The simulation couldn’t start. Reload the page, then run it again.'

/** What a run says when a worker that had been answering stopped (docs/ux.md#states "Error"). */
export const WORKER_CRASH_MESSAGE = 'A simulation worker stopped unexpectedly.'

interface Slot {
  worker: Worker
  planId: number
  busy: number
  /** Awake time since the worker last answered, counted while it has work. */
  silentMs: number
  /** Whether it has ever answered, so its script loaded and ran. */
  answered: boolean
}

interface PoolOptions {
  chunkTimeoutMs?: number
  /** A monotonic clock in ms (tests pass the faked Date). */
  now?: () => number
  /** Whether the page is hidden; hidden time doesn't count toward the timeout. */
  hidden?: () => boolean
}

const monotonic = () => (typeof performance !== 'undefined' ? performance.now() : 0)
const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

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
  private readonly now: () => number
  private readonly hidden: () => boolean
  /** Runs while any worker has work. */
  private heartbeat?: ReturnType<typeof setInterval>
  private lastBeat = 0
  /** Why the last worker failed: a chunk asked of a pool with none left fails the same way. */
  private lastFailure: Error | null = null

  constructor(size: number, { chunkTimeoutMs = CHUNK_TIMEOUT_MS, now = monotonic, hidden = pageHidden }: PoolOptions = {}) {
    this.size = size
    this.chunkTimeoutMs = chunkTimeoutMs
    this.now = now
    this.hidden = hidden
  }

  /** Whether this environment can run module workers. */
  static supported(): boolean {
    return typeof Worker !== 'undefined' && typeof navigator !== 'undefined'
  }

  static defaultSize(): number {
    const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2
    return Math.max(1, cores - 1)
  }

  /**
   * An executor that runs `plan` on the pool. Each run starts with a full pool: workers that failed
   * since the last run are replaced here, and only here.
   */
  executor(plan: Plan): ChunkExecutor {
    this.ensureWorkers()
    const planId = this.nextPlan++
    return {
      lanes: this.slots.length,
      run: (chunk, fights) =>
        new Promise<ChunkResult>((resolve, reject) => {
          // Every worker failed during this run: the driver has already failed it, so don't wait.
          if (this.slots.length === 0) {
            reject(this.lastFailure ?? new Error(WORKER_CRASH_MESSAGE))
            return
          }
          const slot = this.slots.reduce((a, b) => (b.busy < a.busy ? b : a))
          if (slot.planId !== planId) {
            this.post(slot, { type: 'plan', planId, plan })
            slot.planId = planId
          }
          const jobId = this.nextJob++
          this.startHeartbeat()
          if (slot.busy++ === 0) this.resetSilence(slot)
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
    const slot: Slot = { worker, planId: 0, busy: 0, silentMs: 0, answered: false }
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data
      const job = this.jobs.get(message.jobId)
      slot.answered = true
      if (!job) return
      this.jobs.delete(message.jobId)
      slot.busy--
      // An answer is progress: the next queued chunk gets a full timeout of its own.
      this.resetSilence(slot)
      this.stopHeartbeatIfIdle()
      if (message.type === 'result') job.resolve(message.result)
      else job.reject(new Error(message.message))
    }
    // An uncaught error in the worker, or its script failing to load. Its own text is for developers
    // ("Uncaught RangeError: …", or none), so the run says what happened in words a player can act on.
    worker.onerror = (event) => {
      event.preventDefault()
      this.fail(slot, new Error(slot.answered ? WORKER_CRASH_MESSAGE : WORKER_START_MESSAGE))
    }
    return slot
  }

  private startHeartbeat() {
    if (this.heartbeat !== undefined) return
    this.lastBeat = this.now()
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS)
  }

  /**
   * Starts `slot`'s silence now. Between beats that's a head start of minus the time since the
   * last beat, which the next beat adds back, so every chunk gets the full timeout.
   */
  private resetSilence(slot: Slot) {
    slot.silentMs = -Math.min(Math.max(0, this.now() - this.lastBeat), HEARTBEAT_MAX_GAP_MS)
  }

  private stopHeartbeatIfIdle() {
    if (this.heartbeat === undefined || this.slots.some((slot) => slot.busy > 0)) return
    clearInterval(this.heartbeat)
    this.heartbeat = undefined
  }

  /** Adds the awake time since the last beat to each busy worker's silence; fails any past the timeout. */
  private beat() {
    const now = this.now()
    const gap = Math.min(Math.max(0, now - this.lastBeat), HEARTBEAT_MAX_GAP_MS)
    this.lastBeat = now
    if (this.hidden()) return
    for (const slot of [...this.slots]) {
      if (slot.busy === 0) continue
      slot.silentMs += gap
      if (slot.silentMs >= this.chunkTimeoutMs) this.fail(slot, new Error(WORKER_HANG_MESSAGE))
    }
  }

  /**
   * A worker crashed or hung: fail its jobs and drop it. The next run replaces it (`executor`), so a
   * worker that fails as it starts costs one worker a run instead of respawning in a loop.
   */
  private fail(slot: Slot, error: Error) {
    const i = this.slots.indexOf(slot)
    if (i < 0) return
    this.slots.splice(i, 1)
    this.lastFailure = error
    slot.busy = 0
    slot.worker.onmessage = null
    slot.worker.onerror = null
    slot.worker.terminate()
    for (const [id, job] of this.jobs) {
      if (job.slot !== slot) continue
      this.jobs.delete(id)
      job.reject(error)
    }
    this.stopHeartbeatIfIdle()
  }
}
