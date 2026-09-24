// The worker pool's watchdog (docs/architecture.md#iterations-determinism-and-workers): a worker
// that has work and stays silent fails its jobs and is replaced; one that answers never times out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FromWorker, ToWorker } from '@/worker/protocol'
import type { ChunkResult } from '../engine/chunk'
import type { Plan } from '../plan/types'
import { CHUNK_TIMEOUT_MS, WorkerPool } from './pool'

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
    const pool = new WorkerPool(1)
    const run = pool.executor(plan).run(0, 250)
    const outcome = run.then(
      () => 'resolved',
      (e: Error) => e.message,
    )
    await vi.advanceTimersByTimeAsync(CHUNK_TIMEOUT_MS - 1)
    expect(FakeWorker.all[0].terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await outcome).toBe('A simulation worker stopped responding (no answer in 60 s), so the run was stopped.')
    expect(FakeWorker.all[0].terminated).toBe(true)
    expect(FakeWorker.all).toHaveLength(2)
    // The replacement runs the next chunk.
    const next = pool.executor(plan).run(0, 250)
    FakeWorker.all[1].answer()
    await expect(next).resolves.toMatchObject({ chunk: 0 })
  })

  it('gives each queued chunk a full timeout from the previous answer, and disarms when idle', async () => {
    const pool = new WorkerPool(1, { chunkTimeoutMs: 1000 })
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
    const pool = new WorkerPool(2, { chunkTimeoutMs: 1000 })
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
})
