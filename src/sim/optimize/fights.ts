// Per-fight samples for the optimizer (docs/optimizer.md#fights-and-runners, decision D30).
//
// The run driver merges a chunk's fights into moments (sim/run/driver.ts), which is all a single
// run needs. A paired comparison needs each fight's own numbers: fight i of candidate a against
// fight i of candidate b, on the same seed and fight index (common random numbers). So the
// optimizer asks for one sample per fight, and a runner decides where the fights run: this
// thread (`localFightRunner`), the app's worker pool (`WorkerPool.fightRunner`) or Node's worker
// threads (scripts/tune/optimize.mjs). A fight's numbers depend only on its plan and index, so
// where it ran never changes them.
import { Sim } from '../engine/sim'
import type { Plan } from '../plan/types'

/** One value per fight, fights `from` … `from + count − 1`, in order. */
export interface FightSamples {
  /** Damage per second. */
  dps: Float64Array
  /** Threat per second. */
  tps: Float64Array
  /** Health lost per second to hits taken (the tank results' damage taken; encounter.md §5). */
  taken: Float64Array
}

/** Runs fights `from` … `from + count − 1` on `sim`: the global fight indices, so they're the same fights anywhere. */
export function runFights(sim: Sim, from: number, count: number): FightSamples {
  const dps = new Float64Array(count)
  const tps = new Float64Array(count)
  const taken = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    sim.runFight(from + i)
    const seconds = sim.fightMs / 1000
    dps[i] = sim.fightDamage / seconds
    tps[i] = sim.fightThreat / seconds
    taken[i] = sim.fightDamageTaken / seconds
  }
  return { dps, tps, taken }
}

let lastKey = 0

/**
 * A new plan key, unique in this thread for its lifetime: runners cache engines by key, so a runner
 * shared by several searches (the alternating passes, the confirmation) never mixes their plans up.
 */
export function planKey(): number {
  return ++lastKey
}

/**
 * A plan the optimizer runs, under a key from `planKey`. `plan` is called only
 * when a runner needs to build its engine, so thousands of candidates needn't hold their plans.
 */
export interface PlanSource {
  key: number
  plan: () => Plan
}

/** Where the fights run. */
export interface FightRunner {
  /** How many jobs can run at once (the optimizer keeps about twice this many in flight). */
  readonly lanes: number
  /** Runs fights `from` … `from + count − 1` of the source's plan. */
  run(source: PlanSource, from: number, count: number): Promise<FightSamples>
  /** Frees the runner's workers or engines. */
  close?(): void
}

/**
 * A small least-recently-used cache of engines by plan key. The runners keep one per lane, so a
 * candidate's later rounds reuse its engine; `touch` reports whether the key was already there,
 * which lets a caller mirror a worker's cache exactly (the same operations in the same order).
 */
export class EngineCache<T> {
  private readonly items = new Map<number, T>()
  readonly capacity: number
  constructor(capacity: number) {
    this.capacity = capacity
  }

  get(key: number): T | undefined {
    const value = this.items.get(key)
    if (value !== undefined) {
      this.items.delete(key)
      this.items.set(key, value)
    }
    return value
  }

  set(key: number, value: T): void {
    this.items.delete(key)
    this.items.set(key, value)
    while (this.items.size > this.capacity) this.items.delete(this.items.keys().next().value as number)
  }

  has(key: number): boolean {
    return this.items.has(key)
  }
}

/** Engines kept per lane: enough for a round's survivors to reuse theirs late in a search. */
export const ENGINES_PER_LANE = 48

/**
 * Runs the fights on this thread, one job at a time: for tests, and where there are no workers.
 * Each job yields to the event loop first, so a caller can cancel between jobs.
 */
export function localFightRunner(capacity = ENGINES_PER_LANE): FightRunner {
  const engines = new EngineCache<Sim>(capacity)
  let queue: Promise<unknown> = Promise.resolve()
  return {
    lanes: 1,
    run(source, from, count) {
      const job = queue
        .then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
        .then(() => {
          let sim = engines.get(source.key)
          if (!sim) {
            sim = new Sim(source.plan())
            engines.set(source.key, sim)
          }
          return runFights(sim, from, count)
        })
      queue = job.catch(() => undefined)
      return job
    },
  }
}
