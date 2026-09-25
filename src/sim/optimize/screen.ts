// Which talents the sim can measure, for one setup and goal (docs/optimizer.md#which-talents-matter,
// D30). Every talent is judged the same way, by what it measurably does, never by its name.
//
// A talent is taken off (rank 0) and put on (max rank) in a few contexts: the setup's own build,
// and a build with every talent at max (so a talent that only acts with another one, Improved
// Revenge with Revenge or Berserk with Primal Bite, shows up), each with the setup's rotation and any
// rotation variants the search tries. Then:
// 1. If the plan is the same with and without it in every context, it changes nothing: the engine
//    is a function of the plan alone. No fights are needed. (`none`)
// 2. Otherwise both plans run the same fights (common random numbers). If the numbers the goal's
//    score reads (`scoreReads`: each goal its own, DPS, TPS, both, or damage taken) are equal on every fight
//    in every context, it's `tie-break` when the goal's tie-break differs (damage taken, or TPS for
//    Defense) and `none` when not.
// 3. Otherwise it's `objective`, unless its paired change in score is below zero with 95%
//    confidence in every context where it acts: then it's `harmful` (more health means less rage
//    from each hit taken, so Heart of the Wild costs a bear threat).
// It also notes which of the sheet's numbers the talent changes (health, armor, effective health,
// …), from the plans alone: a constraint that reads one makes the talent a search dimension
// (./talents.ts). The contexts' builds aren't legal ones (the plan builder doesn't need them to
// be); they only decide whether the talent does anything.
import { decodeTalentCode, encodeTalentCode, type TalentData, talentsInCodeOrder } from '@/data/talents/types'
import { buildPlan } from '../plan/build'
import type { Plan } from '../plan/types'
import type { RotationValue, SimConfig } from '../types'
import { SHEET_STATS, type SheetStat, sheetValues, type SheetValues } from './constraints'
import { type FightRunner, type FightSamples, type PlanSource, planKey, SearchTooLargeError } from './fights'
import { type Goal, type Interval, meanInterval, pairedInterval, scoreReads, scorer, tieBreaker, upper } from './objective'
import type { TalentRole } from './talents'

export interface ScreenOptions {
  /** The setup: its build is the first context. */
  config: SimConfig
  data: TalentData
  runner: FightRunner
  /** The goal the score reads (`scoredGoal`). */
  goal: Goal
  /** Fights per plan (default 400). */
  fights?: number
  /** The most fights it may run (a search's hard ceiling, OGV-2): past it, it throws before any fight. */
  maxFights?: number
  /** Fights per job handed to the runner (default SCREEN_JOB_FIGHTS). */
  jobFights?: number
  /** Rotation settings to screen under besides the setup's own (a search's rotation variants). */
  rotations?: readonly Record<string, RotationValue>[]
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export interface TalentVerdict {
  id: string
  name: string
  role: TalentRole
  /**
   * Whether its plan changed in some context, whether a number the goal's score reads changed on
   * some fight, and whether the goal's tie-break did (damage taken; TPS for Defense).
   */
  planChanges: boolean
  scoreChanges: boolean
  tieChanges: boolean
  /** The sheet's numbers it changes in some context (health, armor, effective health, …). */
  sheetStats: SheetStat[]
  /** Its paired change in score, max rank against none, in the first context where it acts (95%). */
  effect?: Interval
  /**
   * Its paired change in the tie-break (higher is better: less damage taken, or more TPS for
   * Defense), max rank against none, in the first context where the tie-break changes (95%): the
   * order a `tie-break` talent takes spare points in (./talents.ts).
   */
  tieEffect?: Interval
}

export interface TalentScreen {
  verdicts: TalentVerdict[]
  roles: Map<string, TalentRole>
  /** Fights run. */
  fights: number
}

/**
 * Fights per job handed to the runner, as the race's (./race.ts): a plan's fights run as several
 * jobs, so no job outlasts the pool's awake-time watchdog on a slow phone, however many fights the
 * screen runs (OV4-3). A fight's numbers depend only on its plan and index, so the split changes
 * nothing.
 */
export const SCREEN_JOB_FIGHTS = 250

/** Each distinct plan once, however many talents share it, under its own plan key. */
class PlanSources {
  private readonly byText = new Map<string, PlanSource>()
  source(plan: Plan): string {
    const text = JSON.stringify(plan)
    if (!this.byText.has(text)) this.byText.set(text, { key: planKey(), plan: () => plan })
    return text
  }
  get(text: string): PlanSource {
    return this.byText.get(text)!
  }
}

export async function screenTalents(options: ScreenOptions): Promise<TalentScreen> {
  const { config, data, goal, signal } = options
  const reads = scoreReads(goal)
  const tie = tieBreaker(goal)
  const fights = options.fights ?? 400
  const talents = talentsInCodeOrder(data).flat()
  const own = decodeRanks(data, config.talents)
  const allMax = Object.fromEntries(talents.map((t) => [t.id, t.maxRank]))
  const rotations = [config.rotation, ...(options.rotations ?? []).map((r) => ({ ...config.rotation, ...r }))]
  const contexts = rotations.flatMap((rotation) => [own, allMax].map((ranks) => ({ ranks, rotation })))
  const plans = new PlanSources()
  const planFor = (ranks: Record<string, number>, rotation: Record<string, RotationValue>) => {
    const bundle = buildPlan({ ...config, talents: encodeTalentCode(data, ranks), rotation })
    return { text: plans.source(bundle.plan), sheet: sheetValues(bundle) }
  }

  // Each talent's plan pairs, off and on, per context, and the sheet stats that differ.
  const pairs = talents.map((t) =>
    contexts.map(({ ranks, rotation }) => {
      const off = planFor({ ...ranks, [t.id]: 0 }, rotation)
      const on = planFor({ ...ranks, [t.id]: t.maxRank }, rotation)
      return { off: off.text, on: on.text, sheet: changedStats(off.sheet, on.sheet) }
    }),
  )
  const differing = pairs.flat().filter((p) => p.off !== p.on)
  const texts = [...new Set(differing.flatMap((p) => [p.off, p.on]))]
  if (options.maxFights !== undefined && texts.length * fights > options.maxFights)
    throw new SearchTooLargeError(
      `The talent screen runs ${(texts.length * fights).toLocaleString('en-US')} fights, more than the cap of ${options.maxFights.toLocaleString('en-US')} a search: fewer screen fights a plan, or fewer rotation variants, fit it.`,
    )
  // Each plan's fights, in jobs of at most `jobFights`, into fixed positions of its samples.
  const jobFights = Math.max(1, Math.floor(options.jobFights ?? SCREEN_JOB_FIGHTS))
  const results = new Map<string, FightSamples>()
  const jobs: { text: string; from: number; count: number }[] = []
  for (const text of texts) {
    results.set(text, { dps: new Float64Array(fights), tps: new Float64Array(fights), taken: new Float64Array(fights) })
    for (let from = 0; from < fights; from += jobFights) jobs.push({ text, from, count: Math.min(jobFights, fights - from) })
  }
  // A few jobs in flight at a time (twice the runner's lanes, as the race keeps), each started only
  // if the search hasn't been cancelled, so a cancel stops the screen within a job or two a lane.
  await new Promise<void>((resolve, reject) => {
    let next = 0
    let done = 0
    let inFlight = 0
    let failed = false
    const fail = (error: unknown) => {
      if (failed) return
      failed = true
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    }
    const onAbort = () => fail(abortError())
    signal?.addEventListener('abort', onAbort, { once: true })
    const pump = () => {
      if (failed) return
      if (done === jobs.length) {
        signal?.removeEventListener('abort', onAbort)
        resolve()
        return
      }
      while (inFlight < Math.max(1, options.runner.lanes * 2) && next < jobs.length) {
        if (signal?.aborted) return fail(abortError())
        const job = jobs[next++]
        inFlight++
        options.runner.run(plans.get(job.text), job.from, job.count).then(
          (s) => {
            inFlight--
            if (failed) return
            const into = results.get(job.text)!
            into.dps.set(s.dps, job.from)
            into.tps.set(s.tps, job.from)
            into.taken.set(s.taken, job.from)
            done++
            options.onProgress?.(done, jobs.length)
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

  const verdicts: TalentVerdict[] = talents.map((t, ti) => {
    let planChanges = false
    let scoreChanges = false
    let tieChanges = false
    const effects: Interval[] = []
    let tieEffect: Interval | undefined
    const sheetStats = SHEET_STATS.filter((stat) => pairs[ti].some((p) => p.sheet.includes(stat)))
    for (const { off, on } of pairs[ti]) {
      if (off === on) continue
      planChanges = true
      const a = results.get(on)!
      const b = results.get(off)!
      let differs = false
      let tieDiffers = false
      for (let k = 0; k < fights && !(differs && tieDiffers); k++) {
        for (const m of reads) if (a[m][k] !== b[m][k]) differs = true
        if (tie(a.dps[k], a.tps[k], a.taken[k]) !== tie(b.dps[k], b.tps[k], b.taken[k])) tieDiffers = true
      }
      if (tieDiffers) {
        tieChanges = true
        tieEffect ??= pairedInterval(perFight(a, tie, fights), perFight(b, tie, fights), fights)
      }
      if (!differs) continue
      scoreChanges = true
      const score = scorer(goal, { dps: meanInterval(b.dps, fights).mean, tps: meanInterval(b.tps, fights).mean })
      effects.push(pairedInterval(perFight(a, score, fights), perFight(b, score, fights), fights))
    }
    const role: TalentRole = !scoreChanges
      ? tieChanges
        ? 'tie-break'
        : 'none'
      : effects.every((e) => upper(e) < 0)
        ? 'harmful'
        : 'objective'
    return {
      id: t.id,
      name: t.name,
      role,
      planChanges,
      scoreChanges,
      tieChanges,
      sheetStats,
      ...(effects.length ? { effect: effects[0] } : {}),
      ...(tieEffect ? { tieEffect } : {}),
    }
  })
  return { verdicts, roles: new Map(verdicts.map((v) => [v.id, v.role])), fights: texts.length * fights }
}

/** A score of each fight's DPS, TPS and damage taken. */
function perFight(s: FightSamples, score: (dps: number, tps: number, taken: number) => number, n: number): Float64Array {
  const out = new Float64Array(n)
  for (let k = 0; k < n; k++) out[k] = score(s.dps[k], s.tps[k], s.taken[k])
  return out
}

function abortError(): Error {
  return new DOMException('The optimizer was cancelled.', 'AbortError')
}

function changedStats(a: SheetValues, b: SheetValues): SheetStat[] {
  return SHEET_STATS.filter((stat) => a[stat] !== b[stat])
}

function decodeRanks(data: TalentData, code: string): Record<string, number> {
  // The setup's code is normalized already; a bad one screens against an empty build.
  try {
    return decodeTalentCode(data, code)
  } catch {
    return {}
  }
}
