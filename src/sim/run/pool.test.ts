// The worker pool's watchdog (docs/architecture.md#iterations-determinism-and-workers): a worker
// that has work and stays silent for a minute of awake time fails its jobs and is replaced; one
// that answers never times out, and time the page was frozen or hidden doesn't count.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FromWorker, ToWorker } from '@/worker/protocol'
import type { ChunkResult } from '../engine/chunk'
import type { Plan } from '../plan/types'
import { CHUNK_TIMEOUT_MS, WORKER_HANG_MESSAGE, WorkerPool } from './pool'

/** A stand-in Worker: records what it's sent; a test answers its chunks by hand. */
class FakeWorker {
  static all: FakeWorker[] = []
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly received: ToWorker[] = []
  terminated = false
  constructor() {
    FakeWorker.all.push(this)
  }
  postMessage(message: ToWorker) {
    this.received.push(message)
  }
  terminate() {
    this.terminated = true
  }
  /** Answers the oldest chunk not yet answered. */
  answer() {
    const chunk = this.received.find((m): m is Extract<ToWorker, { type: 'chunk' }> => m.type === 'chunk' && !this.answered.has(m.jobId))!
    this.answered.add(chunk.jobId)
    const result = { chunk: chunk.chunk, fights: chunk.fights } as unknown as ChunkResult
    this.onmessage?.({ data: { type: 'result', jobId: chunk.jobId, result } } as MessageEvent<FromWorker>)
  }
  private readonly answered = new Set<number>()
}

const plan = {} as Plan
/** The faked Date is the pool's clock, so a test can jump it the way a frozen page's clock jumps. */
const now = () => Date.now()
/** A frozen page: the clock moves on but no timer fires. */
const freeze = (ms: number) => vi.setSystemTime(Date.now() + ms)
const settle = <T>(p: Promise<T>) =>
  p.then(
    () => 'resolved',
    (e: Error) => e.message,
  )

describe('WorkerPool watchdog', () => {
  beforeEach(() => {
    FakeWorker.all = []
    vi.useFakeTimers()
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fails a silent worker’s chunks after the timeout, with a clear error, and replaces it', async () => {
    const pool = new WorkerPool(1, { now })
    const run = pool.executor(plan).run(0, 250)
    const outcome = settle(run)
    await vi.advanceTimersByTimeAsync(CHUNK_TIMEOUT_MS - 1)
    expect(FakeWorker.all[0].terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await outcome).toBe(WORKER_HANG_MESSAGE)
    expect(FakeWorker.all[0].terminated).toBe(true)
    expect(FakeWorker.all).toHaveLength(2)
    // The replacement runs the next chunk.
    const next = pool.executor(plan).run(0, 250)
    FakeWorker.all[1].answer()
    await expect(next).resolves.toMatchObject({ chunk: 0 })
  })

  it('gives each queued chunk a full timeout from the previous answer, and disarms when idle', async () => {
    const pool = new WorkerPool(1, { chunkTimeoutMs: 1000, now })
    const executor = pool.executor(plan)
    const first = executor.run(0, 250)
    const second = executor.run(1, 250)
    const worker = FakeWorker.all[0]
    await vi.advanceTimersByTimeAsync(900)
    worker.answer()
    await expect(first).resolves.toMatchObject({ chunk: 0 })
    await vi.advanceTimersByTimeAsync(900)
    worker.answer()
    await expect(second).resolves.toMatchObject({ chunk: 1 })
    // Idle: no work, so no timeout however long it waits.
    await vi.advanceTimersByTimeAsync(10 * CHUNK_TIMEOUT_MS)
    expect(worker.terminated).toBe(false)
    expect(FakeWorker.all).toHaveLength(1)
  })

  it('fails only the hung worker; another worker’s chunks still finish', async () => {
    const pool = new WorkerPool(2, { chunkTimeoutMs: 1000, now })
    const executor = pool.executor(plan)
    const a = executor.run(0, 250)
    const b = executor.run(1, 250)
    const aOutcome = a.catch((e: Error) => e)
    FakeWorker.all[1].answer()
    await expect(b).resolves.toMatchObject({ chunk: 1 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await aOutcome).toBeInstanceOf(Error)
    expect(FakeWorker.all[0].terminated).toBe(true)
    expect(FakeWorker.all[1].terminated).toBe(false)
  })

  // A frozen page's overdue timers all fire on waking, which fake timers can't reproduce: this pins the
  // counting (a 65 s gap between beats counts at most 2 s); the review's SIGSTOP probe covers the rest
  // (docs/reviews/2026-09-24-infra.md, OR-1).
  it('counts a 65 s gap between beats as at most 2 s of silence', async () => {
    const pool = new WorkerPool(1, { now })
    const outcome = settle(pool.executor(plan).run(0, 250))
    await vi.advanceTimersByTimeAsync(30_000)
    freeze(65_000)
    // The first beat after waking counts at most 2 s of the gap.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(FakeWorker.all[0].terminated).toBe(false)
    FakeWorker.all[0].answer()
    expect(await outcome).toBe('resolved')
  })

  it('still fails a worker after 60 s of awake silence, around a suspension', async () => {
    const pool = new WorkerPool(1, { now })
    const outcome = settle(pool.executor(plan).run(0, 250))
    await vi.advanceTimersByTimeAsync(30_000)
    freeze(65_000)
    await vi.advanceTimersByTimeAsync(1_000) // 30 s + the capped 2 s
    await vi.advanceTimersByTimeAsync(CHUNK_TIMEOUT_MS - 32_000 - 1_000)
    expect(FakeWorker.all[0].terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(FakeWorker.all[0].terminated).toBe(true)
    expect(await outcome).toBe(WORKER_HANG_MESSAGE)
  })

  it('doesn’t count time the page was hidden', async () => {
    let hidden = true
    const pool = new WorkerPool(1, { now, hidden: () => hidden })
    const outcome = settle(pool.executor(plan).run(0, 250))
    await vi.advanceTimersByTimeAsync(3 * CHUNK_TIMEOUT_MS)
    expect(FakeWorker.all[0].terminated).toBe(false)
    hidden = false
    await vi.advanceTimersByTimeAsync(CHUNK_TIMEOUT_MS - 1_000)
    expect(FakeWorker.all[0].terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await outcome).toBe(WORKER_HANG_MESSAGE)
  })

  it('gives a chunk queued between beats its full timeout', async () => {
    const pool = new WorkerPool(1, { chunkTimeoutMs: 5_000, now })
    const executor = pool.executor(plan)
    const first = executor.run(0, 250)
    const second = settle(executor.run(1, 250))
    const worker = FakeWorker.all[0]
    await vi.advanceTimersByTimeAsync(500)
    worker.answer() // the second chunk's 5 s start here, half a beat before the next beat
    await expect(first).resolves.toMatchObject({ chunk: 0 })
    await vi.advanceTimersByTimeAsync(4_999)
    expect(worker.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(501)
    expect(await second).toBe(WORKER_HANG_MESSAGE)
  })
})
