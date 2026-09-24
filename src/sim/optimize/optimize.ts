// The optimizer: finds the best talents and rotation settings for a setup (decision D30;
// docs/optimizer.md). The steps:
// 1. Screen the class's talents for this setup (./screen.ts), if talents are searched.
// 2. Build the candidates: every sensible talent build under the constraints (./talents.ts), each
//    with every rotation variant given, beside the baseline, the setup as it is.
// 3. Race them on common random numbers (./race.ts) within the budget.
// 4. Optionally confirm the winner against the baseline on a fresh seed (D23).
// Everything runs through a FightRunner, so the same code runs on this thread, in the app's worker
// pool and in Node's worker threads, with the same result for the same inputs and seed.
import { type TalentData, type TalentRanksById, decodeTalentCode, talentsInCodeOrder } from '@/data/talents/types'
import { TALENT_DATA } from '../defaults'
import { buildPlan } from '../plan/build'
import type { Plan } from '../plan/types'
import { SPEC_META } from '../specs'
import type { RotationValue, SimConfig, SpecId } from '../types'
import { type FightRunner, type PlanSource, planKey } from './fights'
import { type Constraint, meetsSheet, type ResultConstraint, sheetValues, type SheetValues } from './constraints'
import { SURVIVAL_FLOOR } from './floor'
import { defaultObjective, type Interval, lower, type ObjectiveId } from './objective'
import { race, type RaceProgress, type RaceResult } from './race'
import { screenTalents, type TalentScreen, type TalentVerdict } from './screen'
import { type TalentConstraints, talentSpace, type TalentSpace } from './talents'

/** A candidate: the base setup with these talents and these rotation settings on top of its own. */
export interface Candidate {
  talents: string
  rotation: Record<string, RotationValue>
}

/** The base setup with a candidate's changes, fixed at the seed (a race's fights are counted, not adaptive). */
export function applyCandidate(config: SimConfig, candidate: Candidate, seed = config.run.seed): SimConfig {
  return { ...config, talents: candidate.talents, rotation: { ...config.rotation, ...candidate.rotation }, run: { mode: 'fixed', iterations: 0, seed } }
}

/** A candidate's plan, or an error if the setup can't be simulated. */
export function candidatePlan(config: SimConfig, candidate: Candidate, seed?: number): Plan {
  const bundle = buildPlan(applyCandidate(config, candidate, seed))
  if (bundle.blockers.length > 0) throw new Error(bundle.blockers[0])
  return bundle.plan
}

/** How many fights a search may spend (docs/optimizer.md#budgets). */
export interface Budget {
  /** All candidates' fights together, the baseline's included. */
  fights: number
  /** Fights each candidate runs in the first round; by default a share of the budget (`firstRound`). */
  initialFights?: number
}

export type BudgetId = 'quick' | 'standard' | 'thorough'

/**
 * The search budgets (docs/optimizer.md#budgets). At about 100,000 fights a second (15 threads) or
 * 50,000 (a browser's 8 workers), quick is some 15–30 seconds, standard one to two minutes and
 * thorough four to eight.
 */
export const BUDGETS: Record<BudgetId, Budget> = {
  quick: { fights: 1_500_000 },
  standard: { fights: 6_000_000 },
  thorough: { fights: 24_000_000 },
}

/** The first round's fights: 30% of the budget spread over the candidates, between 50 and 1,000. */
export function firstRound(budget: Budget, candidates: number): number {
  if (budget.initialFights !== undefined) return budget.initialFights
  return Math.max(50, Math.min(1000, Math.floor((0.3 * budget.fights) / Math.max(1, candidates))))
}

/** A talent search: the constraints, and how the space is built. */
export interface TalentSearch extends TalentConstraints {
  /** Keep the spec's survival floor (./floor.ts; default: yes, for a tank). */
  floor?: boolean
  /** The tree whose fillers come first (default: the one the setup's build spends most in). */
  preferTree?: string
  /** Fights per plan in the screen (default 400). */
  screenFights?: number
  searchPartials?: boolean
  /** Most builds (default 200,000). */
  limit?: number
}

export interface OptimizeOptions {
  /** The setup. Its `run.seed` is the master seed every candidate's fights use. */
  config: SimConfig
  /** Default: the spec's (D30): DPS for DPS specs, balanced for tanks. */
  objective?: ObjectiveId
  /** Search talents (a talent search), or keep the setup's. */
  talents?: TalentSearch
  /** Rotation settings to try, each on top of the start's; every build is tried with each. None: the start's rotation. */
  rotations?: readonly Record<string, RotationValue>[]
  /**
   * Where the candidates start from: the talents they keep when talents aren't searched, and the
   * rotation settings every candidate has under its own (default: the setup's, no changes). The
   * baseline stays the setup itself, so `balanced` is always relative to it (D30).
   */
  start?: Candidate
  /** Rotation settings the talent screen also tries (default: `rotations`), so a talent only they use counts. */
  screenRotations?: readonly Record<string, RotationValue>[]
  /**
   * Limits every candidate must meet (./constraints.ts): sheet ones leave a candidate out before any
   * fights, result ones are judged in the race. The baseline races whatever it meets.
   */
  constraints?: readonly Constraint[]
  /**
   * The setup relative sheet constraints are measured against (default: the baseline). A tank's gear
   * search passes its class's survival preset, for the effective-health floor (D30).
   */
  reference?: SimConfig
  budget: Budget
  runner: FightRunner
  /** Standings to report (default 10). */
  top?: number
  signal?: AbortSignal
  onProgress?: (progress: OptimizeProgress) => void
}

export type OptimizeProgress =
  | { phase: 'screen'; done: number; total: number }
  | { phase: 'space'; builds: number; candidates: number; excluded: number; screen?: TalentScreen; space?: OptimizeReport['space'] }
  | ({ phase: 'race' } & RaceProgress)

export interface OptimizeReport {
  spec: SpecId
  objective: ObjectiveId
  seed: number
  screen?: TalentScreen
  /**
   * The talent space (its builds counted, not listed), the floor it kept, and the talents that are
   * dimensions because a constraint reads what they change, by id.
   */
  space?: Omit<TalentSpace, 'builds'> & { builds: number; floor: Record<string, number>; constrained: string[] }
  /** Every candidate that raced, index 0 the baseline. */
  candidates: Candidate[]
  /** Candidates left out for missing a sheet constraint. */
  excluded: number
  constraints: Constraint[]
  /** The reference's sheet values (relative sheet constraints are shares of them), and each reported candidate's, by index. */
  reference: SheetValues
  sheets: Record<number, SheetValues>
  race: RaceResult
  /** Fights run: the screen's and the race's. */
  fights: number
  ms: number
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

/** A talent id for a name in the class's trees. */
function talentId(data: TalentData, name: string): string {
  const t = talentsInCodeOrder(data)
    .flat()
    .find((x) => x.name === name || x.id === name)
  if (!t) throw new Error(`No talent "${name}" in ${data.class}'s trees`)
  return t.id
}

/** The tree the build spends most in, by id. */
function mainTree(data: TalentData, code: string): string {
  let ranks: TalentRanksById = {}
  try {
    ranks = decodeTalentCode(data, code)
  } catch {
    /* an unreadable build has no main tree: the first one */
  }
  const points = data.trees.map((tree) => tree.talents.reduce((n, t) => n + (ranks[t.id] ?? 0), 0))
  return data.trees[points.indexOf(Math.max(...points))].id
}

export async function optimize(options: OptimizeOptions): Promise<OptimizeReport> {
  const began = now()
  const { config, runner, signal } = options
  const spec = config.spec
  const meta = SPEC_META[spec]
  const data = TALENT_DATA[meta.classId]
  const objective = options.objective ?? defaultObjective(meta.role)
  const seed = config.run.seed
  const start = options.start ?? { talents: config.talents, rotation: {} }
  const rotations = options.rotations && options.rotations.length > 0 ? options.rotations : [{}]

  const constraints = [...(options.constraints ?? [])]
  let screen: TalentScreen | undefined
  let space: OptimizeReport['space']
  let builds = [start.talents]
  if (options.talents) {
    const search = options.talents
    screen = await screenTalents({
      config: applyCandidate(config, start),
      data,
      runner,
      objective,
      fights: search.screenFights,
      rotations: options.screenRotations ?? options.rotations,
      signal,
      onProgress: (done, total) => options.onProgress?.({ phase: 'screen', done, total }),
    })
    const floorByName = (search.floor ?? meta.role === 'tank') ? (SURVIVAL_FLOOR[spec] ?? {}) : {}
    const floor = Object.fromEntries(Object.entries(floorByName).map(([name, rank]) => [talentId(data, name), rank]))
    const keep = { ...floor, ...Object.fromEntries(Object.entries(search.keep ?? {}).map(([name, rank]) => [talentId(data, name), rank])) }
    const exclude = (search.exclude ?? []).map((name) => talentId(data, name))
    const maxRank = new Map(talentsInCodeOrder(data).flat().map((t) => [t.id, t.maxRank]))
    const values = new Map(screen.verdicts.filter((v) => v.effect).map((v) => [v.id, v.effect!.mean / maxRank.get(v.id)!]))
    // A talent that changes what a constraint reads is searched, not a filler (./talents.ts).
    const reads = (v: TalentVerdict) =>
      constraints.some((c) => (c.on === 'sheet' ? v.sheetStats.includes(c.stat) : c.metric === 'taken' ? v.takenChanges : v.scoreChanges))
    const constrained = new Set(screen.verdicts.filter((v) => v.role !== 'objective' && !(v.id in keep) && reads(v)).map((v) => v.id))
    const found = talentSpace({
      data,
      roles: screen.roles,
      values,
      constrained,
      keep,
      exclude,
      minPoints: search.minPoints,
      preferTree: search.preferTree ?? mainTree(data, start.talents),
      searchPartials: search.searchPartials,
      limit: search.limit,
    })
    builds = found.builds.map((b) => b.code)
    const { builds: list, ...rest } = found
    space = { ...rest, builds: list.length, floor, constrained: [...constrained] }
  }

  const candidates: Candidate[] = [{ talents: config.talents, rotation: {} }]
  const same = (a: Candidate, b: Candidate) => a.talents === b.talents && sameRotation({ ...config.rotation, ...a.rotation }, { ...config.rotation, ...b.rotation })
  for (const talents of builds)
    for (const rotation of rotations) {
      const candidate = { talents, rotation: { ...start.rotation, ...rotation } }
      // The baseline already is the setup itself.
      if (!same(candidate, candidates[0])) candidates.push(candidate)
    }
  // Sheet constraints: a candidate that misses one doesn't race (the baseline always does).
  const sheetOf = (c: Candidate) => sheetValues(buildPlan(applyCandidate(config, c)))
  const reference = options.reference ? sheetValues(buildPlan({ ...options.reference, run: { mode: 'fixed', iterations: 0, seed } })) : sheetOf(candidates[0])
  let excluded = 0
  if (constraints.some((c) => c.on === 'sheet')) {
    const kept = candidates.filter((c, i) => i === 0 || meetsSheet(sheetOf(c), reference, constraints))
    excluded = candidates.length - kept.length
    candidates.splice(0, candidates.length, ...kept)
  }
  options.onProgress?.({ phase: 'space', builds: builds.length, candidates: candidates.length, excluded, ...(screen ? { screen } : {}), ...(space ? { space } : {}) })

  const sources: PlanSource[] = candidates.map((c) => ({ key: planKey(), plan: () => candidatePlan(config, c) }))
  // Build the baseline's plan now, so a setup that can't be simulated fails before any fights.
  sources[0].plan()
  const result = await race({
    sources,
    runner,
    objective,
    budget: options.budget.fights,
    initialFights: firstRound(options.budget, candidates.length),
    constraints: constraints.filter((c): c is ResultConstraint => c.on === 'result'),
    top: options.top,
    signal,
    onProgress: (p) => options.onProgress?.({ phase: 'race', ...p }),
  })
  return {
    spec,
    objective,
    seed,
    ...(screen ? { screen } : {}),
    ...(space ? { space } : {}),
    candidates,
    excluded,
    constraints,
    reference,
    // Every result shows its health, effective health and damage taken (D30).
    sheets: Object.fromEntries([0, ...result.standings.map((st) => st.candidate)].map((i) => [i, sheetOf(candidates[i])])),
    race: result,
    fights: (screen?.fights ?? 0) + result.spent,
    ms: now() - began,
  }
}

export interface Confirmation {
  seed: number
  fights: number
  /** Winner − baseline on the fresh seed, 95%. */
  vsBaseline: { dps: Interval; tps: Interval; taken: Interval; score: Interval }
  /** D23's bar: the score's interval lies above zero. */
  clears: boolean
}

/**
 * D23's check: the winner against the baseline on a fresh master seed, one the search never used,
 * paired fight by fight. The winner is adopted only if its interval is still above zero.
 */
export async function confirm(options: {
  config: SimConfig
  candidate: Candidate
  objective: ObjectiveId
  seed: number
  fights: number
  runner: FightRunner
  signal?: AbortSignal
}): Promise<Confirmation> {
  const { config, candidate, seed, fights } = options
  const sources: PlanSource[] = [
    { key: planKey(), plan: () => candidatePlan(config, { talents: config.talents, rotation: {} }, seed) },
    { key: planKey(), plan: () => candidatePlan(config, candidate, seed) },
  ]
  const result = await race({ sources, runner: options.runner, objective: options.objective, budget: 2 * fights, initialFights: fights, top: 2, mergeTies: false, signal: options.signal })
  const winner = result.standings.find((s) => s.candidate === 1)!
  return { seed, fights, vsBaseline: winner.vsBaseline, clears: lower(winner.vsBaseline.score) > 0 }
}

function sameRotation(a: Record<string, RotationValue>, b: Record<string, RotationValue>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}

/**
 * Talents and rotation in turns (docs/optimizer.md#talents-and-rotation-together): the talents with
 * the start's rotation, then the rotation variants with the winning talents, then the talents again
 * with the winning rotation, until a pass's winner is where it started, or `passes` run out. Each
 * pass spends the whole budget. The baseline is the setup itself throughout.
 */
export async function optimizeInTurns(options: OptimizeOptions & { passes?: number; onPass?: (report: OptimizeReport, pass: number) => void }): Promise<OptimizeReport[]> {
  if (!options.talents || !options.rotations?.length) throw new Error('Taking turns needs a talent search and rotation variants.')
  const reports: OptimizeReport[] = []
  let start: Candidate = options.start ?? { talents: options.config.talents, rotation: {} }
  const passes = options.passes ?? 4
  for (let pass = 0; pass < passes; pass++) {
    const talents = pass % 2 === 0
    const report = await optimize({
      ...options,
      start,
      ...(talents ? { rotations: [], talents: options.talents } : { talents: undefined }),
      // A talent pass screens under the rotation variants too, so a talent only they use counts.
      ...(talents ? { screenRotations: options.rotations } : {}),
    })
    reports.push(report)
    options.onPass?.(report, pass)
    const winner = report.candidates[report.race.leader]
    const moved = winner.talents !== start.talents || !sameRotation(winner.rotation, start.rotation)
    start = winner
    if (!moved && pass > 0) break
  }
  return reports
}
