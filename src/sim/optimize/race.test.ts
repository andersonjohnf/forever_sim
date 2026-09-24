// The racing on a toy objective with a known best (docs/optimizer.md#racing): fake fights whose
// DPS is the candidate's true mean, plus noise every candidate shares on a fight (common random
// numbers), plus a little of its own.
import { describe, expect, it } from 'vitest'
import { Rng } from '../core/rng'
import type { Plan } from '../plan/types'
import type { FightRunner, FightSamples, PlanSource } from './fights'
import { eliminationZ, normalQuantile, pairedInterval, tQuantile, tTail, Z99 } from './objective'
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
function toyRunner(toys: Toy[], lanes = 3, shuffleSeed = 1, delays = true): FightRunner & { fights: number } {
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
      return delays ? new Promise((resolve) => setTimeout(() => resolve(out), delay)) : Promise.resolve(out)
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
    // The closest survivor, and how far behind (O1-4): the other twin, about level with the leader.
    expect(result.closest!.candidate).toBe(result.unseparated[0])
    expect(Math.abs(result.closest!.vsLeader.mean)).toBeLessThan(result.closest!.vsLeader.halfWidth)
  })

  it('counts as unseparated only the survivors the leader isn’t clear of at 95%, and names a closest only on a budget ending (OV-5)', async () => {
    // Twins, and a third well behind that an elimination bar too high to drop anyone keeps in the race: the budget
    // ends it with the third a survivor the leader is clear of, so only the other twin is unseparated.
    const toys: Toy[] = [{ dps: 1000 }, { dps: 1020 }, { dps: 1020 }, { dps: 1005 }]
    const result = await race(options(toys, { budget: 20_000, eliminationZ: 1e6 }))
    expect(result.status).toBe('budget')
    const third = result.standings.find((st) => st.candidate === 3)!
    expect(third.state).toBe('survivor')
    expect(third.vsLeader.mean - third.vsLeader.halfWidth).toBeGreaterThan(0)
    const twin = result.leader === 1 ? 2 : 1
    expect(result.unseparated).toEqual([twin])
    expect(result.closest!.candidate).toBe(twin)
    // A separated race has neither.
    const clear = await race(options(field))
    expect(clear.status).toBe('separated')
    expect(clear.unseparated).toEqual([])
    expect(clear.closest).toBeUndefined()
  })

  it('corrects the elimination bar for the number of survivors, so the true best survives the first round (O1-2)', async () => {
    // The winner's curse: 1,000 candidates level at 1,000 and one ahead by 0.1, a small share of a
    // candidate's own standard error over the first round's 50 fights (1.4). The leader is the
    // luckiest of the 1,000, about 3 standard errors up, so an uncorrected 99% bar knocks the true
    // best out in the first round about one time in six, where it should be 0.5%; the
    // corrected bar doesn't.
    const count = 1000
    let fixedDrops = 0
    let correctedDrops = 0
    for (let rep = 0; rep < 20; rep++) {
      const toys: Toy[] = Array.from({ length: count }, () => ({ dps: 1000 }))
      const best = 1 + ((rep * 379) % (count - 1))
      toys[best] = { dps: 1000.1 }
      const run = (extra: Partial<RaceOptions>) =>
        race({ ...options(toys), runner: toyRunner(toys, 4, rep, false), initialFights: 50, budget: count * 50, jobFights: 50, top: count, ...extra })
      const dropped = (r: Awaited<ReturnType<typeof race>>) => r.standings.find((st) => st.candidate === best)!.droppedInRound === 0
      if (dropped(await run({ eliminationZ: Z99 }))) fixedDrops++
      const corrected = await run({})
      if (dropped(corrected)) correctedDrops++
      // The bar is Student's t at 0.5% ÷ the survivors compared with the leader: the 999 candidates
      // (the baseline is none) less the leader.
      expect(corrected.rounds[0].eliminationZ).toBeCloseTo(eliminationZ(count - 2, 50), 12)
    }
    expect(fixedDrops).toBeGreaterThan(0)
    expect(correctedDrops).toBe(0)
  }, 60_000)

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
    expect(result.baseline.fights).toBe(Math.max(...result.standings.map((s) => s.fights)))
    expect(result.standings.some((s) => s.candidate === 0)).toBe(false)
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
    expect(result.outside).toEqual([1])
  })

  it('has no leader when every candidate is clearly outside a result constraint', async () => {
    const toys: Toy[] = [{ dps: 1000 }, { dps: 1050, taken: 600 }, { dps: 1030, taken: 620 }]
    const result = await race(options(toys, { constraints: [{ on: 'result', metric: 'taken', max: 1.05, relative: true }] }))
    expect(result.status).toBe('none')
    expect(result.leader).toBeNull()
    expect(result.outside).toEqual([2])
    expect(result.standings.every((st) => st.state === 'dropped' && st.droppedAs === 'infeasible')).toBe(true)
    expect(result.unseparated).toEqual([])
  })

  it('the baseline is only the measuring stick: it runs every round but never leads, drops another or stands', async () => {
    // The baseline is the best here, but it's never an answer.
    const toys: Toy[] = [{ dps: 1050 }, { dps: 1000 }, { dps: 1030 }, { dps: 1010 }]
    const result = await race(options(toys))
    expect(result.leader).toBe(2)
    expect(result.status).toBe('separated')
    expect(result.standings.map((st) => st.candidate)).not.toContain(0)
    expect(result.baseline.fights).toBe(Math.max(...result.standings.map((st) => st.fights)))
    // The leader's change from it is below zero: it's still what every candidate is measured against.
    expect(result.standings[0].vsBaseline.dps.mean).toBeLessThan(0)
    // With the baseline alone there's no candidate and no answer; its first round still runs.
    const alone = await race(options(toys.slice(0, 1)))
    expect(alone).toMatchObject({ status: 'none', leader: null, standings: [], spent: 100 })
    expect(alone.baseline.fights).toBe(100)
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

describe('quantiles', () => {
  it('the normal’s and Student’s t’s match their tables', () => {
    expect(normalQuantile(0.025)).toBeCloseTo(1.959963984540054, 9)
    expect(normalQuantile(0.005)).toBeCloseTo(Z99, 9)
    expect(normalQuantile(1e-8)).toBeCloseTo(5.612001244174789, 7)
    expect(normalQuantile(0.975)).toBeCloseTo(-1.959963984540054, 9)
    // Student's t, from its tables: ν = 1, 10, 49, 60.
    expect(tQuantile(0.025, 1)).toBeCloseTo(12.7062047, 5)
    expect(tQuantile(0.025, 10)).toBeCloseTo(2.2281389, 6)
    expect(tQuantile(0.005, 49)).toBeCloseTo(2.6799519, 6)
    expect(tQuantile(0.0005, 60)).toBeCloseTo(3.4602004, 6)
    expect(tTail(2.2281388519649385, 10)).toBeCloseTo(0.025, 10)
    // At zero and below it, by symmetry (OV-3: zero once recursed forever).
    expect(tTail(0, 10)).toBe(0.5)
    expect(tTail(-0, 10)).toBe(0.5)
    expect(tTail(-2.2281388519649385, 10)).toBeCloseTo(0.975, 10)
    expect(tTail(-3, 5) + tTail(3, 5)).toBeCloseTo(1, 12)
    expect(tTail(Number.NaN, 5)).toBeNaN()
    // Many degrees of freedom: the normal's.
    expect(tQuantile(0.005, 1e7)).toBeCloseTo(Z99, 9)
  })

  it('the elimination bar is the uncorrected 99% one for one comparison, and grows with the survivors', () => {
    expect(eliminationZ(1, 1e7)).toBeCloseTo(Z99, 9)
    expect(eliminationZ(0, 1e7)).toBeCloseTo(Z99, 9)
    expect(eliminationZ(1, 50)).toBeCloseTo(tQuantile(0.005, 49), 12)
    expect(eliminationZ(7311, 61)).toBeCloseTo(tQuantile(0.005 / 7311, 60), 12)
    expect(eliminationZ(7311, 61)).toBeGreaterThan(5)
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
