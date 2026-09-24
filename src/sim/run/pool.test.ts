// The worker pool's watchdog (docs/architecture.md#iterations-determinism-and-workers): a worker
// that has work and stays silent for a minute of awake time fails its jobs and is replaced; one
// that answers never times out, and time the page was frozen or hidden doesn't count.
//
// And the pool's optimizer runner (docs/optimizer.md#fights-and-runners) against stub workers:
// a plan goes to a worker only when its engine cache lacks it, which the pool knows by mirroring
// the cache, and a plan that fails to build leaves the bookkeeping as it was (O1-6, O1-7).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FromWorker, ToWorker } from '@/worker/protocol'
import type { ChunkResult } from '../engine/chunk'
import { EngineCache, ENGINES_PER_LANE, type PlanSource } from '../optimize/fights'
import type { Plan } from '../plan/types'
import { abortError } from './driver'
import { CHUNK_TIMEOUT_MS, START_FAILURES_BEFORE_FALLBACK, WORKER_CRASH_MESSAGE, WORKER_HANG_MESSAGE, WORKER_START_MESSAGE, WorkerPool } from './pool'

/** A stand-in Worker: records what it's sent; a test answers its chunks by hand. */
class FakeWorker {
  static all: FakeWorker[] = []
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly received: ToWorker[] = []
  terminated = false
  /** Workers made while this is set fail as they start, as one whose script won't load does. */
  static failOnStart = false
  constructor() {
    FakeWorker.all.push(this)
    if (FakeWorker.failOnStart) setTimeout(() => this.crash(), 0)
  }
  /** The worker's error event: an uncaught error in it, or its script failing to load (no message). */
  crash(message = '') {
    if (this.terminated) return
    this.onerror?.({ message, preventDefault() {} } as ErrorEvent)
  }
  /** Its script loaded and ran, as the real worker says once it has. */
  ready() {
    this.onmessage?.({ data: { type: 'ready' } } as MessageEvent<FromWorker>)
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
    FakeWorker.failOnStart = false
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
    // The next run replaces it, and the replacement runs its chunk.
    const next = pool.executor(plan).run(0, 250)
    expect(FakeWorker.all).toHaveLength(2)
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

  it('replaces a failed worker at the next run, not at once', async () => {
    const pool = new WorkerPool(1, { chunkTimeoutMs: 1000, now })
    const outcome = settle(pool.executor(plan).run(0, 250))
    await vi.advanceTimersByTimeAsync(1000)
    expect(await outcome).toBe(WORKER_HANG_MESSAGE)
    expect(FakeWorker.all).toHaveLength(1)
    const next = pool.executor(plan).run(0, 250)
    expect(FakeWorker.all).toHaveLength(2)
    FakeWorker.all[1].answer()
    await expect(next).resolves.toMatchObject({ chunk: 0 })
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

  it('covers the optimizer’s fight jobs too', async () => {
    const pool = new WorkerPool(1, { chunkTimeoutMs: 1000, now })
    const outcome = settle(pool.fightRunner().run({ key: 1, plan: () => plan }, 0, 5))
    expect(FakeWorker.all[0].received[0]).toMatchObject({ type: 'fights', key: 1 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await outcome).toBe(WORKER_HANG_MESSAGE)
    expect(FakeWorker.all[0].terminated).toBe(true)
  })
})

/** A stub worker with the real worker's engine cache: it fails a job whose plan it doesn't have. */
class StubWorker {
  static all: StubWorker[] = []
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly engines = new EngineCache<true>(ENGINES_PER_LANE)
  readonly received: Extract<ToWorker, { type: 'fights' }>[] = []
  constructor() {
    StubWorker.all.push(this)
  }
  postMessage(message: ToWorker) {
    if (message.type !== 'fights') return
    this.received.push(message)
    let reply: FromWorker
    if (this.engines.get(message.key)) reply = { type: 'samples', jobId: message.jobId, samples: samples(message.from, message.count) }
    else if (message.plan) {
      this.engines.set(message.key, true)
      reply = { type: 'samples', jobId: message.jobId, samples: samples(message.from, message.count) }
    } else reply = { type: 'error', jobId: message.jobId, message: `no plan ${message.key}` }
    setTimeout(() => this.onmessage?.({ data: reply } as MessageEvent<FromWorker>), 0)
  }
  terminate() {}
}

const samples = (from: number, count: number) => {
  const dps = Float64Array.from({ length: count }, (_, i) => from + i)
  return { dps, tps: dps.slice(), taken: dps.slice() }
}

describe('WorkerPool.fightRunner', () => {
  const real = globalThis.Worker
  beforeEach(() => {
    StubWorker.all = []
    globalThis.Worker = StubWorker as unknown as typeof Worker
  })
  afterEach(() => {
    globalThis.Worker = real
  })

  it('sends a plan once per worker that lacks it, and its mirror matches the worker’s cache', async () => {
    const pool = new WorkerPool(2)
    const runner = pool.fightRunner()
    expect(runner.lanes).toBe(2)
    let built = 0
    // More plans than a worker keeps, so engines are evicted and have to be sent again.
    const sources: PlanSource[] = Array.from({ length: ENGINES_PER_LANE + 20 }, (_, key) => ({
      key: 1000 + key,
      plan: () => {
        built++
        return {} as Plan
      },
    }))
    for (let round = 0; round < 3; round++) {
      // Two jobs in flight at a time, as a race keeps a few: they spread over both workers.
      for (const s of sources) {
        const results = await Promise.all([runner.run(s, round * 10, 5), runner.run(s, round * 10 + 5, 5)])
        // Every job came back with its own fights: none failed for want of a plan.
        expect(results.map((r) => r.dps[0])).toEqual([round * 10, round * 10 + 5])
      }
      // One job at a time: each goes to a worker that has its engine.
      for (const s of sources.slice(0, 10)) expect((await runner.run(s, 100, 5)).dps[0]).toBe(100)
    }
    const received = StubWorker.all.flatMap((w) => w.received)
    // A plan went with a job exactly when the worker lacked it, and it was built only then.
    expect(received.filter((m) => m.plan).length).toBe(built)
    expect(built).toBeLessThan(received.length)
    for (const worker of StubWorker.all) {
      const sent = new Set<number>()
      for (const m of worker.received) {
        if (!m.plan) expect(sent.has(m.key)).toBe(true)
        sent.add(m.key)
      }
    }
  })

  it('a plan that fails to build fails its job, with nothing sent and the mirror unchanged (O1-6)', async () => {
    const pool = new WorkerPool(1)
    const runner = pool.fightRunner()
    const bad: PlanSource = {
      key: 7,
      plan: () => {
        throw new Error('no such setup')
      },
    }
    await expect(runner.run(bad, 0, 5)).rejects.toThrow(/no such setup/)
    expect(StubWorker.all[0].received).toHaveLength(0)
    // The same key with a plan that builds now: the plan is sent, since the worker never got it.
    const good: PlanSource = { key: 7, plan: () => ({}) as Plan }
    const result = await runner.run(good, 0, 5)
    expect(result.dps).toHaveLength(5)
    expect(StubWorker.all[0].received[0].plan).toBeDefined()
    // And the worker isn't counted busy for the failed job: two jobs go to the one worker in turn.
    await Promise.all([runner.run(good, 5, 5), runner.run(good, 10, 5)])
    expect(StubWorker.all[0].received.filter((m) => m.plan)).toHaveLength(1)
  })
})

// A worker that fails as it starts (a script that won't load, say after a deploy) was replaced at once,
// and its replacement failed the same way, forever, with no run asking for it (issue #1). A failed
// worker is now replaced only when the next run starts, so a failing pool costs one worker a run.
describe('WorkerPool failures', () => {
  beforeEach(() => {
    FakeWorker.all = []
    FakeWorker.failOnStart = false
    vi.useFakeTimers()
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('never respawns a worker that fails as it starts on its own; the run fails with a clear message', async () => {
    FakeWorker.failOnStart = true
    const pool = new WorkerPool(2, { now })
    const executor = pool.executor(plan)
    const outcomes = [settle(executor.run(0, 250)), settle(executor.run(1, 250))]
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await Promise.all(outcomes)).toEqual([WORKER_START_MESSAGE, WORKER_START_MESSAGE])
    expect(FakeWorker.all).toHaveLength(2)
    expect(FakeWorker.all.every((w) => w.terminated)).toBe(true)
  })

  it('lets the next run recover once workers start again', async () => {
    FakeWorker.failOnStart = true
    const pool = new WorkerPool(1, { now })
    const failed = settle(pool.executor(plan).run(0, 250))
    await vi.advanceTimersByTimeAsync(10)
    expect(await failed).toBe(WORKER_START_MESSAGE)

    // Still failing: the next run tries one fresh worker, and fails as clearly.
    const again = settle(pool.executor(plan).run(0, 250))
    await vi.advanceTimersByTimeAsync(10)
    expect(await again).toBe(WORKER_START_MESSAGE)
    expect(FakeWorker.all).toHaveLength(2)

    FakeWorker.failOnStart = false
    const executor = pool.executor(plan)
    const next = executor.run(0, 250)
    expect(FakeWorker.all).toHaveLength(3)
    // The fresh worker gets the plan before its chunk.
    expect(FakeWorker.all[2].received.map((m) => m.type)).toEqual(['plan', 'chunk'])
    FakeWorker.all[2].answer()
    await expect(next).resolves.toMatchObject({ chunk: 0 })
  })

  it('says a worker that started, then failed before answering (building its plan, say), stopped unexpectedly', async () => {
    // A runtime error, not a script that couldn't load: reloading wouldn't help (AR-1).
    const pool = new WorkerPool(1, { now })
    const outcome = settle(pool.executor(plan).run(0, 250))
    FakeWorker.all[0].ready()
    FakeWorker.all[0].crash('Uncaught TypeError: engine bug')
    expect(await outcome).toBe(WORKER_CRASH_MESSAGE)
    expect(pool.unstartable).toBe(false)
  })

  it('says a worker that crashed after answering stopped unexpectedly, and fails only its own chunks', async () => {
    const pool = new WorkerPool(2, { now })
    const executor = pool.executor(plan)
    const first = executor.run(0, 250)
    FakeWorker.all[0].answer()
    await first
    const a = settle(executor.run(1, 250))
    const b = executor.run(2, 250)
    const crashed = FakeWorker.all.find((w) => w.received.some((m) => m.type === 'chunk' && m.chunk === 1))!
    const other = FakeWorker.all.find((w) => w !== crashed)!
    crashed.crash('Uncaught RangeError: out of memory')
    expect(await a).toBe(WORKER_CRASH_MESSAGE)
    other.answer()
    await expect(b).resolves.toMatchObject({ chunk: 2 })
    expect(FakeWorker.all).toHaveLength(2)
  })

  it('refuses a chunk when every worker has failed during a run', async () => {
    FakeWorker.failOnStart = true
    const pool = new WorkerPool(1, { now })
    const executor = pool.executor(plan)
    const first = settle(executor.run(0, 250))
    await vi.advanceTimersByTimeAsync(10)
    expect(await first).toBe(WORKER_START_MESSAGE)
    // The same run asking for more finds no worker, and isn't left waiting.
    expect(await settle(executor.run(1, 250))).toBe(WORKER_START_MESSAGE)
    expect(FakeWorker.all).toHaveLength(1)
  })
})

// Once fresh workers have failed to start in two runs in a row, the pool says so, and the caller
// runs on its own thread instead (AR-10, executorFor in src/sim/index.ts).
describe('WorkerPool that can’t start workers', () => {
  beforeEach(() => {
    FakeWorker.all = []
    FakeWorker.failOnStart = false
    vi.useFakeTimers()
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const failedRun = async (pool: WorkerPool) => {
    const executor = pool.executor(plan)
    const outcomes = [settle(executor.run(0, 250)), settle(executor.run(1, 250))]
    await vi.advanceTimersByTimeAsync(10)
    return Promise.all(outcomes)
  }

  it('is unstartable after two runs in a row whose workers failed to start, however many workers failed', async () => {
    expect(START_FAILURES_BEFORE_FALLBACK).toBe(2)
    FakeWorker.failOnStart = true
    const pool = new WorkerPool(3, { now })
    expect(await failedRun(pool)).toEqual([WORKER_START_MESSAGE, WORKER_START_MESSAGE])
    // Three workers failed, but in one run: a blip, perhaps.
    expect(pool.unstartable).toBe(false)
    await failedRun(pool)
    expect(pool.unstartable).toBe(true)
  })

  it('starts counting again once a worker starts', async () => {
    FakeWorker.failOnStart = true
    const pool = new WorkerPool(1, { now })
    await failedRun(pool)
    FakeWorker.failOnStart = false
    const executor = pool.executor(plan)
    const ok = executor.run(0, 250)
    FakeWorker.all.at(-1)!.ready()
    FakeWorker.all.at(-1)!.answer()
    await ok
    FakeWorker.failOnStart = true
    // The started worker is still there, so make it fail too, as a hang would drop it.
    FakeWorker.all.at(-1)!.crash()
    await failedRun(pool)
    expect(pool.unstartable).toBe(false)
  })

  it('doesn’t count a hang or a crash as a failure to start', async () => {
    const pool = new WorkerPool(1, { chunkTimeoutMs: 1000, now })
    for (let run = 0; run < 3; run++) {
      const outcome = settle(pool.executor(plan).run(0, 250))
      await vi.advanceTimersByTimeAsync(1000)
      expect(await outcome).toBe(WORKER_HANG_MESSAGE)
    }
    expect(pool.unstartable).toBe(false)
  })
})

// A cancelled run's chunks are abandoned: a worker still busy with one is terminated, so a chunk that
// hangs can't fail the next run with the hang message (AR-6). Spec switches cancel runs, so this is
// common.
describe('WorkerPool cancel', () => {
  beforeEach(() => {
    FakeWorker.all = []
    FakeWorker.failOnStart = false
    vi.useFakeTimers()
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('terminates the workers busy with an abandoned run, and the next run gets fresh ones that aren’t blamed', async () => {
    const pool = new WorkerPool(2, { now, chunkTimeoutMs: 5_000 })
    const first = pool.executor(plan)
    const abandoned = [settle(first.run(0, 250)), settle(first.run(1, 250))]
    first.abandon?.()
    expect(FakeWorker.all.map((w) => w.terminated)).toEqual([true, true])
    expect(await Promise.all(abandoned)).toEqual([abortError().message, abortError().message])

    const second = pool.executor(plan)
    expect(FakeWorker.all).toHaveLength(4)
    const next = second.run(0, 250)
    await vi.advanceTimersByTimeAsync(4_000)
    const fresh = FakeWorker.all.find((w) => !w.terminated && w.received.some((m) => m.type === 'chunk'))!
    fresh.answer()
    await expect(next).resolves.toMatchObject({ chunk: 0 })
  })

  it('keeps an idle worker warm, and never counts an abandoned worker as failing to start', async () => {
    const pool = new WorkerPool(2, { now })
    const first = pool.executor(plan)
    const done = first.run(0, 250)
    const worker = FakeWorker.all.find((w) => w.received.some((m) => m.type === 'chunk'))!
    worker.answer()
    await done
    first.abandon?.()
    expect(FakeWorker.all.some((w) => w.terminated)).toBe(false)
    for (let run = 0; run < 3; run++) {
      const executor = pool.executor(plan)
      void settle(executor.run(0, 250))
      executor.abandon?.()
    }
    expect(pool.unstartable).toBe(false)
  })
})
