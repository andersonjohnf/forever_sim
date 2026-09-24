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
// The race takes no limits on fight results (D30, simplified at step 6 of O1's review): every
// constraint is the sheet's, checked before the race (./constraints.ts), so every candidate may lead.
//
// A candidate that is the baseline's own plan (`copies`: the setup racing as a candidate) runs no
// fights of its own: it takes the baseline's samples, fight for fight, which are the ones its fights
// would have been (the same plan on the same seed), and it costs the budget nothing.
//
// Nothing depends on how the fights were split up or which finished first: each job's samples go
// to fixed positions, and every decision is made at a round's end over whole arrays. The same
// candidates, seed and budget give the same race.
import type { FightRunner, FightSamples, PlanSource } from './fights'
import { type BaselineMeans, eliminationZ as bonferroniZ, type Goal, type Interval, lower, meanInterval, pairedInterval, type Score, scoreReads, scorer, tieBreaker } from './objective'
import { Z95 } from '../core/welford'

export interface RaceOptions {
  /**
   * The baseline, then the candidates. The baseline is the measuring stick (the setup as it is, what
   * `balanced` is relative to): it runs every round but is never a candidate.
   */
  sources: readonly PlanSource[]
  /**
   * Candidates whose plan is the baseline's (the setup as a candidate): they take the baseline's
   * samples instead of running the same fights again.
   */
  copies?: readonly number[]
  runner: FightRunner
  /** The goal a score reads (`scoredGoal`): higher scores are better for every goal, `defense`'s included. */
  goal: Goal
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
  /** Merge candidates the goal can't tell apart on every first-round fight (`scoreReads`; default yes). */
  mergeTies?: boolean
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

/** How a race ended: the leader cleared D23's bar against every survivor, the budget ran out first, or no candidate raced. */
export type RaceStatus = 'separated' | 'budget' | 'none'

export interface Standing {
  /** Index into `sources` (never 0, the baseline). */
  candidate: number
  /** Fights it ran (its intervals are over these, paired with the baseline's first as many). */
  fights: number
  mean: { dps: number; tps: number; taken: number; score: number }
  /** Candidate − baseline, fight by fight, with 95% intervals; `score` in the goal's units (`defense`'s is minus damage taken). */
  vsBaseline: { dps: Interval; tps: Interval; taken: Interval; score: Interval }
  /** Leader − candidate in score, 95%, over the candidate's fights (zero for the leader). */
  vsLeader: Interval
  state: 'leader' | 'survivor' | 'dropped'
  /** The round it was dropped in, as clearly worse than the leader. */
  droppedInRound?: number
  /** Candidates with the same numbers as this one on every fight of the first round (those the goal reads), merged into it. */
  ties: number[]
}

export interface RoundLog {
  round: number
  fightsPerCandidate: number
  /** Sources that ran fights this round (the baseline included; a copy of it takes its samples instead). */
  ran: number
  dropped: number
  merged: number
  /** The round's leader: the survivor with the best mean score. */
  leader: number
  /** The elimination bar's z this round (Bonferroni-corrected Student's t, unless fixed). */
  eliminationZ: number
}

export interface RaceResult {
  status: RaceStatus
  /** The answer: the survivor with the best mean score. Null only when no candidate raced. */
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

type Metric = ReturnType<typeof scoreReads>[number]

/** The same `metrics` (those the goal reads) on each of the first n fights. */
function sameFights(a: Samples, b: Samples, n: number, metrics: readonly Metric[]): boolean {
  for (const m of metrics) for (let k = 0; k < n; k++) if (a[m][k] !== b[m][k]) return false
  return true
}

/** A cheap digest of the first n fights' `metrics`, to find exact ties without comparing every pair. */
function digest(s: Samples, n: number, metrics: readonly Metric[]): string {
  return metrics
    .map((m, j) => {
      let h = 0
      for (let k = 0; k < n; k++) h = (h * (31 + 6 * j) + s[m][k] * 1e6) % 2147483647
      return h
    })
    .join(':')
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

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
  const copies = new Set((options.copies ?? []).filter((c) => c > 0 && c < count))
  // Survivors, in candidate order; the baseline (0) runs every round but is never one.
  let survivors = sources.map((_, i) => i).slice(1)
  const droppedIn = new Map<number, number>()
  const ties = new Map<number, number[]>()
  const rounds: RoundLog[] = []
  let spent = 0
  let n = 0
  let status: RaceStatus = 'budget'
  let leader: number | null = null

  const baselineMeans = (m: number): BaselineMeans => ({ dps: meanInterval(samples[0].dps, m).mean, tps: meanInterval(samples[0].tps, m).mean })
  const scoresOf = (c: number, score: Score, m: number) => {
    const s = samples[c]
    const out = new Float64Array(m)
    for (let k = 0; k < m; k++) out[k] = score(s.dps[k], s.tps[k], s.taken[k])
    return out
  }
  const takenMean = (c: number, m: number) => meanInterval(samples[c].taken, m).mean
  // What breaks a tie in score, higher is better: less damage taken, or for `defense` more TPS (D30).
  const tie = tieBreaker(options.goal)
  const tieMean = (c: number, m: number) => meanInterval(scoresOf(c, tie, m), m).mean
  const reads = scoreReads(options.goal)

  for (let round = 0; ; round++) {
    if (signal?.aborted) throw abortError()
    const running = [0, ...survivors]
    // A copy of the baseline takes its samples: only the others run fights.
    const runs = running.filter((c) => !copies.has(c))
    let target = round === 0 ? Math.floor(options.initialFights) : Math.ceil(n * growth)
    const remaining = options.budget - spent
    if (runs.length * (target - n) > remaining) {
      // Only what the budget has left, the same for every runner; the first round must fit whole.
      target = round === 0 ? n : n + Math.floor(remaining / runs.length)
      if (target - n < 2) break
    }

    // --- Run the round: fights n … target − 1 for every running candidate ---
    const jobs: { c: number; from: number; count: number }[] = []
    for (const c of runs) {
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
    for (const c of running) {
      if (!copies.has(c)) continue
      const base = samples[0]
      samples[c].reserve(target)
      samples[c].put(n, { dps: base.dps.subarray(n, target), tps: base.tps.subarray(n, target), taken: base.taken.subarray(n, target) })
    }
    n = target
    for (const c of running) samples[c].n = n

    // --- Merge exact ties (first round only): the same numbers the goal reads on every fight ---
    let merged = 0
    if (round === 0 && options.mergeTies !== false) {
      const groups = new Map<string, number[]>()
      for (const c of survivors) {
        const key = digest(samples[c], n, reads)
        const group = groups.get(key)
        if (group) group.push(c)
        else groups.set(key, [c])
      }
      const keep = new Set<number>()
      for (const group of groups.values()) {
        // Split a digest group into classes of truly identical candidates.
        const classes: number[][] = []
        for (const c of group) {
          const home = classes.find((cls) => sameFights(samples[cls[0]], samples[c], n, reads))
          if (home) home.push(c)
          else classes.push([c])
        }
        for (const cls of classes) {
          // D30: the goal's tie-break decides (the least damage taken; for defense the most TPS), then the earlier candidate.
          const best = cls.reduce((a, b) => (tieMean(b, n) > tieMean(a, n) ? b : a))
          keep.add(best)
          const others = cls.filter((c) => c !== best)
          if (others.length > 0) ties.set(best, others)
          merged += others.length
        }
      }
      survivors = survivors.filter((c) => keep.has(c))
    }

    // --- Leader, drops, and the stopping bar ---
    const score = scorer(options.goal, baselineMeans(n))
    const scores = new Map(survivors.map((c) => [c, scoresOf(c, score, n)]))
    const mean = (c: number) => {
      const s = scores.get(c)!
      let sum = 0
      for (let k = 0; k < n; k++) sum += s[k]
      return sum / n
    }
    const means = new Map(survivors.map((c) => [c, mean(c)]))
    if (survivors.length === 0) {
      status = 'none'
      break
    }
    const lead = survivors.reduce((a, b) => {
      const d = means.get(b)! - means.get(a)!
      if (d !== 0) return d > 0 ? b : a
      return tieMean(b, n) > tieMean(a, n) ? b : a
    })
    leader = lead
    // The winner's curse: the leader is the best of many noisy means, so each comparison's bar is
    // corrected for how many there are (docs/optimizer.md#racing).
    const z = options.eliminationZ ?? bonferroniZ(survivors.length - 1, n)
    let dropped = 0
    let separated = true
    const leadScores = scores.get(lead)!
    for (const c of survivors) {
      if (c === lead) continue
      if (lower(pairedInterval(leadScores, scores.get(c)!, n, z)) > 0) {
        droppedIn.set(c, round)
        dropped++
      } else if (!(lower(pairedInterval(leadScores, scores.get(c)!, n, Z95)) > 0)) separated = false
    }
    survivors = survivors.filter((c) => !droppedIn.has(c))
    rounds.push({ round, fightsPerCandidate: n, ran: runs.length, dropped, merged, leader: lead, eliminationZ: z })
    if (separated) {
      status = 'separated'
      break
    }
  }

  if (n === 0) throw new Error(`The budget (${options.budget} fights) doesn't cover a first round of ${options.initialFights} fights for ${count} candidates.`)

  // --- Standings, over each candidate's own fights, in the final baseline's units ---
  const base = baselineMeans(n)
  const score = scorer(options.goal, base)
  // A candidate has a standing only if it raced, and then the race has a leader.
  const lead = leader === null ? null : scoresOf(leader, score, n)
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
      vsLeader: c === leader || lead === null ? { mean: 0, halfWidth: 0 } : pairedInterval(lead, s, m),
      state: c === leader ? 'leader' : droppedIn.has(c) ? 'dropped' : 'survivor',
      ...(droppedIn.has(c) ? { droppedInRound: droppedIn.get(c) } : {}),
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
    ms: now() - start,
  }
}
