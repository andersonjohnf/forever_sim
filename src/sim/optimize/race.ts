// Racing on common random numbers (docs/optimizer.md#racing, decisions D23 and D30).
//
// Every candidate runs the same fights: the same master seed and the same fight indices 0, 1, 2, …
// So fight k of one candidate and fight k of another share their fight length and random streams,
// and the spread they share cancels in their difference (about half the fights an unpaired
// comparison needs, for two bear builds; docs/optimizer.md#the-statistics). Candidates race in rounds. Each round, every
// survivor runs the same fights up to the round's count (the first round's, then twice as many),
// and the leader is the survivor with the best mean score. A survivor whose paired interval
// against the leader lies wholly below zero at the elimination bar is dropped: Student's t at a 0.5%
// upper tail, Bonferroni-corrected for the number of survivors, so the true best is dropped by bad
// luck at most 0.5% a round however many it's compared with (the leader is the best of many noisy
// means, and would otherwise knock the true best out far more often). The race ends when the leader's
// paired 95% interval against every survivor lies above zero, D23's bar ("separated"), or when
// the next round no longer fits in the budget ("budget").
//
// The first source is the **baseline**, the measuring stick: it runs every round, so every
// candidate's change from it is paired on the same fights, but it's never a candidate. It never
// leads, drops another or is dropped. A setup that's also an answer races as a candidate of its own.
//
// Result constraints (./constraints.ts) act each round too: a survivor whose interval of a
// constrained metric (Student's t, 0.5% a side) lies wholly outside its limit is dropped as
// infeasible, and only a survivor whose mean meets every limit can lead. While none does, there's no
// leader and no one is dropped as worse; if every candidate is dropped, the race ends with none
// ("none").
//
// Nothing depends on how the fights were split up or which finished first: each job's samples go
// to fixed positions, and every decision is made at a round's end over whole arrays. The same
// candidates, seed and budget give the same race.
import { limits, type ResultConstraint } from './constraints'
import type { FightRunner, FightSamples, PlanSource } from './fights'
import {
  type BaselineMeans,
  ELIMINATION_TAIL,
  eliminationZ as bonferroniZ,
  type Interval,
  lower,
  meanInterval,
  type ObjectiveId,
  pairedInterval,
  scorer,
  tQuantile,
  upper,
} from './objective'
import { Z95 } from '../core/welford'

export interface RaceOptions {
  /**
   * The baseline, then the candidates. The baseline is the measuring stick (the setup as it is, what
   * `balanced` and relative limits are relative to): it runs every round but is never a candidate.
   */
  sources: readonly PlanSource[]
  runner: FightRunner
  objective: ObjectiveId
  /** The most fights the race may run, all candidates' and the baseline's together. */
  budget: number
  /** Fights each candidate runs in the first round (at least 2). */
  initialFights: number
  /** Each later round runs the survivors to this many times the fights (default 2). */
  growth?: number
  /** Fights per job handed to the runner (default 250). */
  jobFights?: number
  /**
   * A fixed z for the elimination bar, instead of the default: Student's t at a 0.5% upper tail,
   * Bonferroni-corrected for the survivors compared with the leader (`eliminationZ` in ./objective.ts).
   */
  eliminationZ?: number
  /** Standings to report (default 10). */
  top?: number
  /** Merge candidates with the same DPS and TPS on every first-round fight (default yes). */
  mergeTies?: boolean
  /** Limits on the candidates' fight metrics (./constraints.ts), relative ones to the baseline's mean. */
  constraints?: readonly ResultConstraint[]
  signal?: AbortSignal
  onProgress?: (progress: RaceProgress) => void
}

export interface RaceProgress {
  round: number
  /** Fights each survivor has run once this round ends. */
  fightsPerCandidate: number
  survivors: number
  /** Fights run so far, and the budget. */
  spent: number
  budget: number
  /** Jobs done and planned this round. */
  jobsDone: number
  jobs: number
}

/**
 * How a race ended: the leader cleared D23's bar against every survivor, the budget ran out first,
 * or no candidate was left (none raced, or every one was clearly outside a result constraint).
 */
export type RaceStatus = 'separated' | 'budget' | 'none'

export interface Standing {
  /** Index into `sources` (never 0, the baseline). */
  candidate: number
  /** Fights it ran (its intervals are over these, paired with the baseline's first as many). */
  fights: number
  mean: { dps: number; tps: number; taken: number; score: number }
  /** Candidate − baseline, fight by fight, with 95% intervals; `score` in the objective's units. */
  vsBaseline: { dps: Interval; tps: Interval; taken: Interval; score: Interval }
  /** Leader − candidate in score, 95%, over the candidate's fights (zero for the leader). */
  vsLeader: Interval
  state: 'leader' | 'survivor' | 'dropped'
  /** The round it was dropped in, and why: clearly worse than the leader, or clearly outside a result constraint. */
  droppedInRound?: number
  droppedAs?: 'worse' | 'infeasible'
  /** Whether its means meet every result constraint (always, with none). */
  feasible: boolean
  /** Candidates with the same DPS and TPS as this one on every fight of the first round, merged into it. */
  ties: number[]
}

export interface RoundLog {
  round: number
  fightsPerCandidate: number
  /** Sources that ran this round (the baseline included). */
  ran: number
  dropped: number
  /** Of those dropped, the ones clearly outside a result constraint. */
  infeasible: number
  merged: number
  /** The round's leader, or null while no survivor's means meet every result constraint. */
  leader: number | null
  /** The elimination bar's z this round (Bonferroni-corrected Student's t, unless fixed). */
  eliminationZ: number
}

export interface RaceResult {
  status: RaceStatus
  /**
   * The answer: the survivor with the best mean score whose means meet every result constraint. Null
   * when there's none: no candidate raced, every one was clearly outside a limit, or the budget ran
   * out with none whose means met them all.
   */
  leader: number | null
  /** Fights run, all candidates together. */
  spent: number
  /** The baseline's mean TPS and DPS over all its fights (what `balanced` scores relative to). */
  baseline: BaselineMeans & { taken: number; fights: number }
  rounds: RoundLog[]
  /** The candidates (not the baseline): the leader first, the survivors, then the dropped by the round they lasted to; best mean first within each. */
  standings: Standing[]
  /** Survivors the leader isn't clear of: leader − it's paired 95% interval isn't above zero. Empty with no leader. */
  unseparated: number[]
  /** When the budget ended the race: the unseparated survivor nearest the leader, and leader − it in score (95%). */
  closest?: { candidate: number; vsLeader: Interval }
  /** Per result constraint, in order: the candidates dropped as clearly outside it (one outside two counts in both). */
  outside: number[]
  ms: number
}

/** A candidate's samples, grown a round at a time. */
class Samples {
  n = 0
  dps = new Float64Array(0)
  tps = new Float64Array(0)
  taken = new Float64Array(0)

  reserve(n: number) {
    if (n <= this.dps.length) return
    const grow = (a: Float64Array) => {
      const b = new Float64Array(n)
      b.set(a.subarray(0, this.n))
      return b
    }
    this.dps = grow(this.dps)
    this.tps = grow(this.tps)
    this.taken = grow(this.taken)
  }

  put(at: number, s: FightSamples) {
    this.dps.set(s.dps, at)
    this.tps.set(s.tps, at)
    this.taken.set(s.taken, at)
  }
}

function abortError(): Error {
  return new DOMException('The optimizer was cancelled.', 'AbortError')
}

/** Same DPS and TPS on each of the first n fights. */
function sameFights(a: Samples, b: Samples, n: number): boolean {
  for (let k = 0; k < n; k++) if (a.dps[k] !== b.dps[k] || a.tps[k] !== b.tps[k]) return false
  return true
}

/** A cheap digest of the first n fights' DPS and TPS, to find exact ties without comparing every pair. */
function digest(s: Samples, n: number): string {
  let h1 = 0
  let h2 = 0
  for (let k = 0; k < n; k++) {
    h1 = (h1 * 31 + s.dps[k] * 1e6) % 2147483647
    h2 = (h2 * 37 + s.tps[k] * 1e6) % 2147483647
  }
  return `${h1}:${h2}`
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

type Limits = { metric: 'dps' | 'tps' | 'taken'; min: number; max: number }[]

/** Whether the candidate's means over its first n fights meet every limit. */
function meets(s: Samples, n: number, bounds: Limits): boolean {
  return bounds.every((b) => {
    const m = meanInterval(s[b.metric], n).mean
    return m >= b.min && m <= b.max
  })
}

/** The limits (by index) whose metric's interval lies wholly outside them. */
function outsideOf(s: Samples, n: number, bounds: Limits, z: number): number[] {
  return bounds.flatMap((b, i) => {
    const m = meanInterval(s[b.metric], n, z)
    return lower(m) > b.max || upper(m) < b.min ? [i] : []
  })
}

export async function race(options: RaceOptions): Promise<RaceResult> {
  const start = now()
  const { sources, runner, signal } = options
  const growth = options.growth ?? 2
  const jobFights = Math.max(1, Math.floor(options.jobFights ?? 250))
  const count = sources.length
  if (count === 0) throw new Error('A race needs its baseline.')
  if (!(options.initialFights >= 2)) throw new Error('The first round needs at least two fights a candidate.')
  if (!(growth > 1)) throw new Error('Each round must run more fights than the last.')

  const samples = sources.map(() => new Samples())
  // Survivors, in candidate order; the baseline (0) runs every round but is never one.
  let survivors = sources.map((_, i) => i).slice(1)
  const droppedIn = new Map<number, number>()
  const droppedAs = new Map<number, 'worse' | 'infeasible'>()
  const constraints = options.constraints ?? []
  const ties = new Map<number, number[]>()
  const rounds: RoundLog[] = []
  let spent = 0
  let n = 0
  let status: RaceStatus = 'budget'
  let leader: number | null = null
  const outside = constraints.map(() => 0)

  const baselineMeans = (m: number): BaselineMeans => ({ dps: meanInterval(samples[0].dps, m).mean, tps: meanInterval(samples[0].tps, m).mean })
  const scoresOf = (c: number, score: (dps: number, tps: number) => number, m: number) => {
    const s = samples[c]
    const out = new Float64Array(m)
    for (let k = 0; k < m; k++) out[k] = score(s.dps[k], s.tps[k])
    return out
  }
  const takenMean = (c: number, m: number) => meanInterval(samples[c].taken, m).mean
  /** Each result constraint's absolute limits, relative ones against the baseline's first m fights. */
  const resolveBounds = (m: number) =>
    constraints.map((c) => ({ metric: c.metric, ...limits(c, c.relative ? meanInterval(samples[0][c.metric], m).mean : 0) }))

  for (let round = 0; ; round++) {
    if (signal?.aborted) throw abortError()
    const running = [0, ...survivors]
    let target = round === 0 ? Math.floor(options.initialFights) : Math.ceil(n * growth)
    const remaining = options.budget - spent
    if (running.length * (target - n) > remaining) {
      // Only what the budget has left, the same for every runner; the first round must fit whole.
      target = round === 0 ? n : n + Math.floor(remaining / running.length)
      if (target - n < 2) break
    }

    // --- Run the round: fights n … target − 1 for every running candidate ---
    const jobs: { c: number; from: number; count: number }[] = []
    for (const c of running) {
      samples[c].reserve(target)
      for (let from = n; from < target; from += jobFights) jobs.push({ c, from, count: Math.min(jobFights, target - from) })
    }
    let next = 0
    let done = 0
    const report = () =>
      options.onProgress?.({ round, fightsPerCandidate: target, survivors: survivors.length, spent, budget: options.budget, jobsDone: done, jobs: jobs.length })
    report()
    await new Promise<void>((resolve, reject) => {
      let inFlight = 0
      let failed = false
      const onAbort = () => fail(abortError())
      const fail = (error: unknown) => {
        if (failed) return
        failed = true
        signal?.removeEventListener('abort', onAbort)
        reject(error)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      const pump = () => {
        if (failed) return
        if (done === jobs.length) {
          signal?.removeEventListener('abort', onAbort)
          resolve()
          return
        }
        while (inFlight < Math.max(1, runner.lanes * 2) && next < jobs.length) {
          const job = jobs[next++]
          inFlight++
          runner.run(sources[job.c], job.from, job.count).then(
            (result) => {
              inFlight--
              if (failed) return
              samples[job.c].put(job.from, result)
              spent += job.count
              done++
              report()
              pump()
            },
            (error) => {
              inFlight--
              fail(error)
            },
          )
        }
      }
      pump()
    })
    n = target
    for (const c of running) samples[c].n = n

    // --- Merge exact ties (first round only): the same DPS and TPS on every fight ---
    let merged = 0
    if (round === 0 && options.mergeTies !== false) {
      const groups = new Map<string, number[]>()
      for (const c of survivors) {
        const key = digest(samples[c], n)
        const group = groups.get(key)
        if (group) group.push(c)
        else groups.set(key, [c])
      }
      const keep = new Set<number>()
      for (const group of groups.values()) {
        // Split a digest group into classes of truly identical candidates.
        const classes: number[][] = []
        for (const c of group) {
          const home = classes.find((cls) => sameFights(samples[cls[0]], samples[c], n))
          if (home) home.push(c)
          else classes.push([c])
        }
        for (const cls of classes) {
          // D30: damage taken breaks a tie; then the earlier candidate.
          const best = cls.reduce((a, b) => (takenMean(b, n) < takenMean(a, n) ? b : a))
          keep.add(best)
          const others = cls.filter((c) => c !== best)
          if (others.length > 0) ties.set(best, others)
          merged += others.length
        }
      }
      survivors = survivors.filter((c) => keep.has(c))
    }

    // --- Result constraints: drop the clearly infeasible; only a feasible mean can lead ---
    const bounds = resolveBounds(n)
    let infeasible = 0
    if (bounds.length > 0) {
      // Each survivor against a fixed limit: the true best is dropped by bad luck at most 0.5% a round a limit.
      const limitZ = options.eliminationZ ?? tQuantile(ELIMINATION_TAIL, n - 1)
      for (const c of survivors) {
        const out = outsideOf(samples[c], n, bounds, limitZ)
        if (out.length === 0) continue
        for (const i of out) outside[i]++
        droppedIn.set(c, round)
        droppedAs.set(c, 'infeasible')
        infeasible++
      }
      survivors = survivors.filter((c) => !droppedIn.has(c))
    }

    // --- Leader, drops, and the stopping bar ---
    const score = scorer(options.objective, baselineMeans(n))
    const scores = new Map(survivors.map((c) => [c, scoresOf(c, score, n)]))
    const mean = (c: number) => {
      const s = scores.get(c)!
      let sum = 0
      for (let k = 0; k < n; k++) sum += s[k]
      return sum / n
    }
    const means = new Map(survivors.map((c) => [c, mean(c)]))
    const feasible = survivors.filter((c) => meets(samples[c], n, bounds))
    leader = feasible.length === 0 ? null : feasible.reduce((a, b) => {
      const d = means.get(b)! - means.get(a)!
      if (d !== 0) return d > 0 ? b : a
      return takenMean(b, n) < takenMean(a, n) ? b : a
    })
    // The winner's curse: the leader is the best of many noisy means, so each comparison's bar is
    // corrected for how many there are (docs/optimizer.md#racing).
    const z = options.eliminationZ ?? bonferroniZ(survivors.length - 1, n)
    let dropped = infeasible
    let separated = leader !== null
    if (leader !== null) {
      const lead = scores.get(leader)!
      for (const c of survivors) {
        if (c === leader) continue
        if (lower(pairedInterval(lead, scores.get(c)!, n, z)) > 0) {
          droppedIn.set(c, round)
          droppedAs.set(c, 'worse')
          dropped++
        } else if (!(lower(pairedInterval(lead, scores.get(c)!, n, Z95)) > 0)) separated = false
      }
    }
    survivors = survivors.filter((c) => !droppedIn.has(c))
    rounds.push({ round, fightsPerCandidate: n, ran: running.length, dropped, infeasible, merged, leader, eliminationZ: z })
    if (survivors.length === 0) {
      status = 'none'
      break
    }
    if (separated) {
      status = 'separated'
      break
    }
  }

  if (n === 0) throw new Error(`The budget (${options.budget} fights) doesn't cover a first round of ${options.initialFights} fights for ${count} candidates.`)

  // --- Standings, over each candidate's own fights, in the final baseline's units ---
  const base = baselineMeans(n)
  const score = scorer(options.objective, base)
  const lead = leader === null ? null : scoresOf(leader, score, n)
  const finalBounds = resolveBounds(n)
  const standing = (c: number): Standing => {
    const m = samples[c].n
    const s = scoresOf(c, score, m)
    const b = scoresOf(0, score, m)
    const x = samples[c]
    const o = samples[0]
    return {
      candidate: c,
      fights: m,
      mean: { dps: meanInterval(x.dps, m).mean, tps: meanInterval(x.tps, m).mean, taken: meanInterval(x.taken, m).mean, score: meanInterval(s, m).mean },
      vsBaseline: { dps: pairedInterval(x.dps, o.dps, m), tps: pairedInterval(x.tps, o.tps, m), taken: pairedInterval(x.taken, o.taken, m), score: pairedInterval(s, b, m) },
      vsLeader: c === leader ? { mean: 0, halfWidth: 0 } : lead === null ? { mean: 0, halfWidth: Infinity } : pairedInterval(lead, s, m),
      state: c === leader ? 'leader' : droppedIn.has(c) ? 'dropped' : 'survivor',
      ...(droppedIn.has(c) ? { droppedInRound: droppedIn.get(c), droppedAs: droppedAs.get(c) } : {}),
      feasible: meets(x, m, finalBounds),
      ties: ties.get(c) ?? [],
    }
  }
  const ranked = [...droppedIn.keys(), ...survivors].map(standing)
  // The survivors the leader isn't clear of at 95% (every survivor ran all n fights), and the closest
  // of them when the budget ended the race.
  const behind = (c: number) => pairedInterval(lead!, scoresOf(c, score, n), n)
  const unseparated = lead === null ? [] : survivors.filter((c) => c !== leader && !(lower(behind(c)) > 0))
  const closest =
    status !== 'budget'
      ? undefined
      : unseparated
          .map((c) => ({ candidate: c, vsLeader: behind(c) }))
          .reduce<{ candidate: number; vsLeader: Interval } | undefined>((a, b) => (a === undefined || b.vsLeader.mean < a.vsLeader.mean ? b : a), undefined)
  const lasted = (s: Standing) => (s.state === 'dropped' ? s.droppedInRound! : Infinity)
  const order = (s: Standing) => (s.state === 'leader' ? 0 : 1)
  ranked.sort((a, b) => order(a) - order(b) || lasted(b) - lasted(a) || b.mean.score - a.mean.score || a.candidate - b.candidate)
  return {
    status,
    leader,
    spent,
    baseline: { ...base, taken: takenMean(0, n), fights: n },
    rounds,
    standings: ranked.slice(0, options.top ?? 10),
    unseparated,
    ...(closest ? { closest } : {}),
    outside,
    ms: now() - start,
  }
}
