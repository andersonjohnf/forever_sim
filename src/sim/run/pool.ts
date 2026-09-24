// A persistent pool of simulation workers (decision D15).
//
// `navigator.hardwareConcurrency − 1` workers (at least 1), created on the first run and kept
// warm. Each run sends its plan once per worker, then chunks; the driver merges results in chunk
// order, so which worker ran what never changes the numbers. Cancelling stops dispatching, and the
// workers still running its chunks are terminated (below); the driver keeps every worker busy, so
// that is normally the whole pool, replaced by the next run. A watchdog fails a worker
// that has work but stays silent for CHUNK_TIMEOUT_MS of awake time, so a hung chunk ends the run
// with an error instead of leaving it running forever, while a tab the phone or browser froze for
// a while resumes its run instead of failing it. A worker that crashes or hangs is terminated and
// replaced only when the next run starts, never at once: one whose script can't load (after a deploy,
// say) would otherwise fail and respawn forever, with no run asking for it (issue #1). A cancelled
// run's workers that are still busy with its chunks are terminated too, so a chunk that hung after
// the cancel can't fail the next run. Once fresh workers have failed to start in two runs in a row,
// the pool reports itself `unstartable` and runs go on the calling thread instead (`executorFor` in
// src/sim/index.ts).
import type { FromWorker, ToWorker } from '@/worker/protocol'
import type { ChunkResult } from '../engine/chunk'
import type { Plan } from '../plan/types'
import { abortError, type ChunkExecutor } from './driver'

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

/** What a run says when a worker that had started stopped (docs/ux.md#states "Error"). */
export const WORKER_CRASH_MESSAGE = 'The simulation stopped unexpectedly.'

/**
 * Runs in a row whose fresh workers failed to start before the pool gives up on workers and runs
 * go on the calling thread (docs/architecture.md#iterations-determinism-and-workers). One failure
 * can be a blip; two mean the worker's script is gone (the site updated since the page loaded),
 * and a slower run on the page beats a page that can't simulate until it's reloaded.
 */
export const START_FAILURES_BEFORE_FALLBACK = 2

interface Slot {
  worker: Worker
  planId: number
  busy: number
  /** Awake time since the worker last answered, counted while it has work. */
  silentMs: number
  /** Whether its script has loaded and run: it said it's ready, or answered. */
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
  planId: number
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
  /** Runs started, and runs in a row in which a fresh worker failed to start (see `unstartable`). */
  private runs = 0
  private startFailures = 0
  private lastStartFailureRun = 0

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
   * Whether workers have failed to start in START_FAILURES_BEFORE_FALLBACK runs in a row, with none
   * starting since: the caller should run on its own thread instead.
   */
  get unstartable(): boolean {
    return this.startFailures >= START_FAILURES_BEFORE_FALLBACK
  }

  /**
   * An executor that runs `plan` on the pool. Each run starts with a full pool: workers that failed
   * since the last run are replaced here, and only here.
   */
  executor(plan: Plan): ChunkExecutor {
    this.ensureWorkers()
    this.runs++
    const planId = this.nextPlan++
    return {
      lanes: this.slots.length,
      // The run was cancelled: a worker still busy with its chunks is terminated, so a chunk that
      // hangs can't fail the next run, and the next run replaces it.
      abandon: () => {
        const busy = new Set([...this.jobs.values()].filter((job) => job.planId === planId).map((job) => job.slot))
        for (const slot of busy) this.drop(slot, abortError())
      },
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
          this.jobs.set(jobId, { slot, planId, resolve, reject })
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
      slot.answered = true
      // Its script loaded and ran: workers start again, whatever failed before.
      if (message.type === 'ready') {
        this.startFailures = 0
        return
      }
      const job = this.jobs.get(message.jobId)
      if (!job) return
      this.jobs.delete(message.jobId)
      slot.busy--
      // An answer is progress: the next queued chunk gets a full timeout of its own.
      this.resetSilence(slot)
      this.stopHeartbeatIfIdle()
      if (message.type === 'result') job.resolve(message.result)
      else job.reject(new Error(message.message))
    }
    // An uncaught error in the worker, or its script failing to load or throwing as it loads (before
    // it said it's ready). Its own text is for developers ("Uncaught RangeError: …", or none), so the
    // run says what happened in words a player can act on.
    worker.onerror = (event) => {
      event.preventDefault()
      if (slot.answered) {
        this.fail(slot, new Error(WORKER_CRASH_MESSAGE))
        return
      }
      if (this.lastStartFailureRun !== this.runs) {
        this.lastStartFailureRun = this.runs
        this.startFailures++
      }
      this.fail(slot, new Error(WORKER_START_MESSAGE))
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
    if (this.drop(slot, error)) this.lastFailure = error
  }

  /** Terminates `slot`'s worker and rejects its jobs with `error`; false if it was already gone. */
  private drop(slot: Slot, error: Error): boolean {
    const i = this.slots.indexOf(slot)
    if (i < 0) return false
    this.slots.splice(i, 1)
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
    return true
  }
}
