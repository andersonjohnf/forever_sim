// The worker pool's optimizer runner (docs/optimizer.md#fights-and-runners) against stub workers:
// a plan goes to a worker only when its engine cache lacks it, which the pool knows by mirroring
// the cache, and a plan that fails to build leaves the bookkeeping as it was (O1-6, O1-7).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FromWorker, ToWorker } from '@/worker/protocol'
import { EngineCache, ENGINES_PER_LANE, type PlanSource } from '../optimize/fights'
import type { Plan } from '../plan/types'
import { WorkerPool } from './pool'

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
