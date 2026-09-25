// Where workers fail to start in two runs in a row (the site updated since the page loaded, most
// likely), runs go on the calling thread instead: a slower run beats none until a reload (AR-10,
// executorFor in ./index.ts, docs/architecture.md#iterations-determinism-and-workers). Its own file,
// so the module's worker pool starts empty.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, optimizerRunner, simulate, WORKER_START_MESSAGE, type SimConfig } from './index'
import { buildPlan } from './plan/build'

/** A worker whose script never loads: it fails as it starts. */
class UnstartableWorker {
  static made = 0
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  constructor() {
    UnstartableWorker.made++
    setTimeout(() => this.onerror?.({ preventDefault() {} } as Event), 0)
  }
  postMessage() {}
  terminate() {
    this.onerror = null
  }
}

const quick = (): SimConfig => ({ ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 250, seed: 1 } })

describe('a pool whose workers never start', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', UnstartableWorker)
    vi.stubGlobal('navigator', { hardwareConcurrency: 3 })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('fails two runs saying to reload, then runs on this thread', async () => {
    await expect(simulate(quick())).rejects.toThrow(WORKER_START_MESSAGE)
    await expect(simulate(quick())).rejects.toThrow(WORKER_START_MESSAGE)
    const made = UnstartableWorker.made
    expect(made).toBeGreaterThan(0)
    const result = await simulate(quick())
    expect(result.iterations).toBe(250)
    expect(result.dps.mean).toBeGreaterThan(0)
    // No more workers were asked for.
    expect(UnstartableWorker.made).toBe(made)
    // An optimizer search runs its fights on this thread too (OG-6).
    const runner = optimizerRunner()
    expect(runner.lanes).toBe(1)
    const samples = await runner.run({ key: 1, plan: () => buildPlan(quick()).plan }, 0, 3)
    expect(samples.dps).toHaveLength(3)
    expect(samples.dps[0]).toBeGreaterThan(0)
    expect(UnstartableWorker.made).toBe(made)
  })
})
