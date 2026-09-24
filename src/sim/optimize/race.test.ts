// The racing on a toy objective with a known best (docs/optimizer.md#racing): fake fights whose
// DPS is the candidate's true mean, plus noise every candidate shares on a fight (common random
// numbers), plus a little of its own.
import { describe, expect, it } from 'vitest'
import { Rng } from '../core/rng'
import type { Plan } from '../plan/types'
import type { FightRunner, FightSamples, PlanSource } from './fights'
import { pairedInterval } from './objective'
import { race, type RaceOptions } from './race'

/** A candidate's fight: its mean, the fight's shared swing, its own noise; TPS and damage taken likewise. */
interface Toy {
  dps: number
  tps?: number
  taken?: number
  /** Its own noise's size (the shared noise is 60). */
  own?: number
}

const rng = (seed: number, fight: number, stream: number) => {
  const r = new Rng()
  r.seed(seed, fight, stream)
  return r
}
/** A standard normal draw (Box–Muller). */
const normal = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r.next())) * Math.cos(2 * Math.PI * r.next())
const shared = (fight: number) => normal(rng(0x5eed, fight, 1)) * 60

/** A runner over toy candidates (the source key indexes `toys`), finishing jobs in a shuffled order. */
function toyRunner(toys: Toy[], lanes = 3, shuffleSeed = 1): FightRunner & { fights: number } {
  const order = rng(shuffleSeed, 9, 9)
  const runner = {
    lanes,
    fights: 0,
    run(source: PlanSource, from: number, count: number): Promise<FightSamples> {
      const toy = toys[source.key]
      const out: FightSamples = { dps: new Float64Array(count), tps: new Float64Array(count), taken: new Float64Array(count) }
      for (let i = 0; i < count; i++) {
        const fight = from + i
        const own = rng(source.key + 1, fight, 3)
        const s = shared(fight)
        out.dps[i] = toy.dps + s + normal(own) * (toy.own ?? 10)
        out.tps[i] = (toy.tps ?? toy.dps) + s + normal(own) * (toy.own ?? 10)
        out.taken[i] = (toy.taken ?? 500) + normal(own) * 20
      }
      runner.fights += count
      // Finish out of order, so the race can't depend on which job came back first.
      const delay = Math.floor(order.next() * 3)
      return new Promise((resolve) => setTimeout(() => resolve(out), delay))
    },
  }
  return runner
}

const sources = (n: number): PlanSource[] => Array.from({ length: n }, (_, key) => ({ key, plan: () => ({}) as Plan }))

const options = (toys: Toy[], extra: Partial<RaceOptions> = {}): RaceOptions => ({
  sources: sources(toys.length),
  runner: toyRunner(toys),
  objective: 'dps',
  budget: 400_000,
  initialFights: 100,
  jobFights: 50,
  ...extra,
})

describe('race', () => {
  // Twenty candidates, 1,000 to 1,019 DPS but the best at 1,030: the best is 1% ahead of the next.
  const field: Toy[] = Array.from({ length: 20 }, (_, i) => ({ dps: 1000 + i }))
  field[7] = { dps: 1030 }

  it('finds the known best and separates it at 95%', async () => {
    const result = await race(options(field))
    expect(result.leader).toBe(7)
    expect(result.status).toBe('separated')
    expect(result.standings[0].candidate).toBe(7)
    // Its paired change from the baseline (1,000) is about +30.
    const vs = result.standings[0].vsBaseline.dps
    expect(vs.mean).toBeGreaterThan(30 - 3 * vs.halfWidth)
    expect(vs.mean).toBeLessThan(30 + 3 * vs.halfWidth)
    // The shared noise cancels in pairs: the paired interval is far narrower than the mean's own.
    expect(vs.halfWidth).toBeLessThan(5)
  })

  it('is deterministic: the same result whatever the lanes and the order jobs finish in', async () => {
    const a = await race(options(field, { runner: toyRunner(field, 1, 1) }))
    const b = await race(options(field, { runner: toyRunner(field, 7, 99) }))
    expect(b).toEqual({ ...a, ms: b.ms })
  })

  it('drops the clearly worse early and spends most fights on the close ones', async () => {
    const result = await race(options(field))
    expect(result.rounds[0].dropped).toBeGreaterThan(10)
    const late = result.standings.filter((s) => s.state === 'dropped' && s.droppedInRound! > 0)
    for (const s of late) expect(s.mean.dps).toBeGreaterThan(1010)
  })

  it('reports "budget" when two candidates can not be told apart', async () => {
    const twins: Toy[] = [{ dps: 1000 }, { dps: 1020 }, { dps: 1020 }]
    const result = await race(options(twins, { budget: 60_000 }))
    expect(result.status).toBe('budget')
    expect(result.unseparated).toHaveLength(1)
    expect([1, 2]).toContain(result.leader)
    expect(result.spent).toBeLessThanOrEqual(60_000)
  })

  it('merges exact ties, and damage taken breaks them (D30)', async () => {
    // Candidates 2 and 3 fight identically to 1 but for damage taken (their own noise has no DPS part).
    const runner = toyRunner([{ dps: 1000 }, { dps: 1010, own: 0 }, { dps: 1010, own: 0 }, { dps: 1010, own: 0 }])
    const tieRunner: FightRunner = {
      lanes: 2,
      run: async (source, from, count) => {
        const s = await runner.run({ ...source, key: Math.min(source.key, 1) }, from, count)
        const taken = s.taken.map((x) => x + [0, 30, -30, 0][source.key])
        return { ...s, taken }
      },
    }
    const result = await race({ ...options([]), sources: sources(4), runner: tieRunner })
    expect(result.leader).toBe(2)
    expect(result.standings[0].ties.sort()).toEqual([1, 3])
    expect(result.status).toBe('separated')
  })

  it('keeps the baseline running and pairs every standing with its fights', async () => {
    const result = await race(options(field))
    const base = result.standings.find((s) => s.candidate === 0)
    expect(result.baseline.fights).toBe(Math.max(...result.standings.map((s) => s.fights)))
    if (base) expect(base.vsBaseline.dps.mean).toBe(0)
  })

  it('drops a candidate clearly outside a result constraint, and only a feasible one leads', async () => {
    // The best DPS takes 20% more damage; a limit of 105% of the baseline's damage taken rules it out.
    const toys: Toy[] = [{ dps: 1000 }, { dps: 1050, taken: 600 }, { dps: 1030 }, { dps: 1010 }]
    const result = await race(options(toys, { constraints: [{ on: 'result', metric: 'taken', max: 1.05, relative: true }] }))
    expect(result.leader).toBe(2)
    const out = result.standings.find((s) => s.candidate === 1)!
    expect(out.droppedAs).toBe('infeasible')
    expect(out.feasible).toBe(false)
    expect(result.rounds[0].infeasible).toBe(1)
  })

  it('rejects a budget that does not cover the first round', async () => {
    await expect(race(options(field, { budget: 1000 }))).rejects.toThrow(/doesn't cover a first round/)
  })

  it('stops when the signal aborts', async () => {
    const controller = new AbortController()
    const run = race(options(field, { signal: controller.signal, onProgress: (p) => p.jobsDone > 3 && controller.abort() }))
    await expect(run).rejects.toThrow(/cancelled/)
  })
})

describe('pairedInterval', () => {
  it('is the mean and 1.96 standard errors of the differences', () => {
    const a = [3, 5, 7, 9]
    const b = [1, 2, 3, 4]
    // Differences 2, 3, 4, 5: mean 3.5, sd √(5/3).
    const i = pairedInterval(a, b, 4)
    expect(i.mean).toBeCloseTo(3.5, 12)
    expect(i.halfWidth).toBeCloseTo((1.959963984540054 * Math.sqrt(5 / 3)) / 2, 12)
  })
})
