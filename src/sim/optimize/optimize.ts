// The optimizer: finds the best talents and rotation settings for a setup (decision D30;
// docs/optimizer.md). The steps:
// 1. Screen the class's talents for this setup (./screen.ts), if talents are searched.
// 2. Build the candidates: every sensible talent build under the constraints (./talents.ts), each
//    with every rotation variant given, and the setup and the start themselves. Every candidate
//    must meet every constraint, talent, sheet and result alike.
// 3. Race them on common random numbers (./race.ts) within the budget, beside the baseline, the
//    setup as it is: the measuring stick every candidate is paired with, never an answer. If no
//    candidate meets the constraints, there's no answer, and the report says which ones block.
// 4. The answer is the race's leader, unless a tank's preferred filler (./prefer.ts, D30) prefers a
//    candidate level with it that has more Anticipation.
// 5. Optionally confirm the answer against the baseline on a fresh seed (D23).
// Everything runs through a FightRunner, so the same code runs on this thread, in the app's worker
// pool and in Node's worker threads, with the same result for the same inputs and seed.
import { type TalentData, type TalentRanksById, decodeTalentCode, talentsInCodeOrder } from '@/data/talents/types'
import { TALENT_DATA } from '../defaults'
import { buildPlan } from '../plan/build'
import type { Plan } from '../plan/types'
import { SPEC_META } from '../specs'
import type { Assumption, RotationValue, SimConfig, SpecId } from '../types'
import { type FightRunner, type PlanSource, planKey } from './fights'
import { type Constraint, constraintName, formatConstraint, limits, meetsSheet, type ResultConstraint, type SheetConstraint, sheetValues, type SheetValues } from './constraints'
import { PREFERRED_FILLER, SURVIVAL_FLOOR, TANK_TREE, TANK_TREE_POINTS } from './floor'
import { defaultObjective, type Interval, lower, type ObjectiveId } from './objective'
import { type FillerPreference, preferFiller } from './prefer'
import { race, type RaceProgress, type RaceResult } from './race'
import { screenTalents, type TalentScreen, type TalentVerdict } from './screen'
import { brokenConstraints, type TalentConstraints, talentSpace, type TalentSpace } from './talents'

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

/** The fewest first-round fights a candidate runs when a large space shrinks the first round (`fitBudget`). */
export const MIN_FIRST_ROUND = 20

/**
 * The budget and first round a race of this many candidates runs (docs/optimizer.md#budgets). The
 * first round is `firstRound`'s while it fits in 90% of the budget; past that it shrinks to fit, to no
 * fewer than MIN_FIRST_ROUND fights; past that the budget grows to cover that first round and as much
 * again. A search on a space too big for its budget still runs, and `notes` says what changed.
 */
export function fitBudget(budget: Budget, candidates: number): { fights: number; initialFights: number; notes: string[] } {
  const n = Math.max(1, candidates)
  const wanted = firstRound(budget, n)
  const fmt = (x: number) => x.toLocaleString('en-US')
  if (wanted * n <= 0.9 * budget.fights) return { fights: budget.fights, initialFights: wanted, notes: [] }
  if (budget.initialFights !== undefined && wanted * n <= budget.fights) return { fights: budget.fights, initialFights: wanted, notes: [] }
  const fit = Math.floor((0.9 * budget.fights) / n)
  if (fit >= MIN_FIRST_ROUND)
    return {
      fights: budget.fights,
      initialFights: fit,
      notes: [`${fmt(n)} candidates are many for a budget of ${fmt(budget.fights)} fights: the first round runs ${fmt(fit)} fights each instead of ${fmt(wanted)}, so it drops fewer, and the race may end on the budget. A larger budget sharpens it.`],
    }
  const fights = 2 * MIN_FIRST_ROUND * n
  return {
    fights,
    initialFights: MIN_FIRST_ROUND,
    notes: [
      `${fmt(n)} candidates don't fit a budget of ${fmt(budget.fights)} fights: the budget grew to ${fmt(fights)}, a first round of ${MIN_FIRST_ROUND} fights each and as much again. Narrow the search (keep or exclude talents, fewer rotation variants) or pick a larger budget.`,
    ],
  }
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
  /**
   * Hold every candidate to the talent constraints, but search no builds: each has the start's (a
   * rotation pass of a search in turns).
   */
  fixedBuild?: boolean
}

export interface OptimizeOptions {
  /** The setup. Its `run.seed` is the master seed every candidate's fights use. */
  config: SimConfig
  /** Default: the spec's (D30): DPS for DPS specs, balanced for tanks. */
  objective?: ObjectiveId
  /**
   * Search talents (a talent search), or keep the setup's. With it, every candidate is held to its
   * talent constraints (the survival floor, kept and excluded talents, the trees' minimums).
   */
  talents?: TalentSearch
  /**
   * Rotation settings to try, each on top of the start's; every build is tried with each, and with
   * the start's own rotation too (a variant never has to beat the start to be kept out).
   */
  rotations?: readonly Record<string, RotationValue>[]
  /**
   * Where the candidates start from: the talents they keep when talents aren't searched, and the
   * rotation settings every candidate has under its own (default: the setup's, no changes). The
   * start is a candidate too, held to the constraints like any other. The baseline stays the setup
   * itself, so `balanced` is always relative to it (D30).
   */
  start?: Candidate
  /** Rotation settings the talent screen also tries (default: `rotations`), so a talent only they use counts. */
  screenRotations?: readonly Record<string, RotationValue>[]
  /**
   * Limits every candidate must meet (./constraints.ts): sheet ones leave a candidate out before any
   * fights, result ones are judged in the race.
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

/** Candidates left out before the race: breaking a talent constraint, or missing a sheet one. */
export interface Excluded {
  talents: number
  sheet: number
}

export type OptimizeProgress =
  | { phase: 'screen'; done: number; total: number }
  | {
      phase: 'space'
      builds: number
      /** Candidates that race (the baseline not counted). */
      candidates: number
      excluded: Excluded
      /** The race's budget and first round, fitted to the candidates, and what fitting them changed. */
      budget: { fights: number; initialFights: number }
      notes: string[]
      setupFails: string[]
      screen?: TalentScreen
      space?: OptimizeReport['space']
    }
  | ({ phase: 'race' } & RaceProgress)

export interface OptimizeReport {
  spec: SpecId
  objective: ObjectiveId
  seed: number
  /** The race's budget and first round, after fitting them to the candidates (`fitBudget`). */
  budget: { fights: number; initialFights: number }
  /** What the search changed to run at all, in words: a smaller first round, a larger budget. */
  notes: string[]
  screen?: TalentScreen
  /**
   * The talent space (its builds counted, not listed), the floor it kept, and the talents that are
   * dimensions because a constraint reads what they change, by id.
   */
  space?: Omit<TalentSpace, 'builds'> & {
    builds: number
    floor: Record<string, number>
    constrained: string[]
    minPoints?: Readonly<Record<string, number>>
    /** The preferred filler's id (D30), when the spec has one the search neither keeps nor excludes. */
    preferred?: string
  }
  /**
   * Index 0 is the baseline, the setup as it is: the measuring stick every candidate is paired with,
   * never an answer. Then every candidate that raced, each one meeting every talent and sheet
   * constraint. The setup itself is among them, as a copy, when it meets them too.
   */
  candidates: Candidate[]
  excluded: Excluded
  /** The constraints the setup itself fails, in words ("Anticipation 0/5", "crit immune"): it can't be the answer. */
  setupFails: string[]
  constraints: Constraint[]
  /** The reference's sheet values (relative sheet constraints are shares of them), and each reported candidate's, by index. */
  reference: SheetValues
  sheets: Record<number, SheetValues>
  /**
   * The race. Its standings are the top ones, and the preferred candidate when it isn't among them.
   * Its leader is the best mean; the answer is `answer`.
   */
  race: RaceResult
  /** The answer, by index: the race's leader, or the candidate the preferred filler prefers to it. Null when no setup meets the constraints. */
  answer: number | null
  /** When the preferred filler's rule (./prefer.ts, D30) answered with another candidate than the leader: which, and why. */
  preferred?: FillerPreference & { talent: string }
  /** Why no setup meets the constraints, a line a blocking constraint; empty when there's an answer. */
  blocked: string[]
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

/** A tree id for a name or id. */
function treeId(data: TalentData, name: string): string {
  const t = data.trees.find((x) => x.id === name || x.name === name)
  if (!t) throw new Error(`No tree "${name}" in ${data.class}'s talents`)
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

/**
 * A talent search's constraints, by id: the survival floor (a tank's, unless `floor` is false) with
 * the kept talents on top, the excluded ones, and the trees' minimums: a tank's 31 in its tank tree
 * (D30), with the search's own minimums merged over it (a tree given replaces its default; 0 drops it).
 */
export function talentConstraintsOf(spec: SpecId, search: TalentSearch): { constraints: TalentConstraints; floor: Record<string, number> } {
  const meta = SPEC_META[spec]
  const data = TALENT_DATA[meta.classId]
  const floorByName = (search.floor ?? meta.role === 'tank') ? (SURVIVAL_FLOOR[spec] ?? {}) : {}
  const floor = Object.fromEntries(Object.entries(floorByName).map(([name, rank]) => [talentId(data, name), rank]))
  const keep = { ...floor, ...Object.fromEntries(Object.entries(search.keep ?? {}).map(([name, rank]) => [talentId(data, name), rank])) }
  const exclude = (search.exclude ?? []).map((name) => talentId(data, name))
  const tankTree = TANK_TREE[spec]
  const minPoints = {
    ...(tankTree ? { [tankTree]: TANK_TREE_POINTS } : {}),
    ...Object.fromEntries(Object.entries(search.minPoints ?? {}).map(([tree, points]) => [treeId(data, tree), points])),
  }
  return { floor, constraints: { keep, exclude, ...(Object.keys(minPoints).length ? { minPoints } : {}) } }
}

/** The setup as it is, as a candidate. */
export const setupCandidate = (config: SimConfig): Candidate => ({ talents: config.talents, rotation: {} })

/** Whether a candidate makes the setup itself (the same talents and whole rotation). */
export const isSetup = (config: SimConfig, candidate: Candidate): boolean => candidateKey(config, candidate) === candidateKey(config, setupCandidate(config))

export async function optimize(options: OptimizeOptions): Promise<OptimizeReport> {
  const began = now()
  const { config, runner, signal } = options
  const spec = config.spec
  const meta = SPEC_META[spec]
  const data = TALENT_DATA[meta.classId]
  const objective = options.objective ?? defaultObjective(meta.role)
  const seed = config.run.seed
  const start = options.start ?? setupCandidate(config)
  // The start's own rotation is always a variant: a variant has to beat it to win (O1-1).
  const rotations = [{}, ...(options.rotations ?? [])]

  const constraints = [...(options.constraints ?? [])]
  const search = options.talents
  const talentRules = search ? talentConstraintsOf(spec, search) : undefined
  // A tank's preferred filler (D30): first for leftover points, and the tie-break at the race's end.
  const fillerName = PREFERRED_FILLER[spec]
  const fillerId = fillerName ? talentId(data, fillerName) : undefined
  let screen: TalentScreen | undefined
  let space: OptimizeReport['space']
  let builds = [start.talents]
  if (search && talentRules && !search.fixedBuild) {
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
    const { keep = {}, exclude = [], minPoints } = talentRules.constraints
    const maxRank = new Map(talentsInCodeOrder(data).flat().map((t) => [t.id, t.maxRank]))
    const values = new Map(screen.verdicts.filter((v) => v.effect).map((v) => [v.id, v.effect!.mean / maxRank.get(v.id)!]))
    // A talent that changes what a constraint reads is searched, not a filler (./talents.ts).
    const reads = (v: TalentVerdict) =>
      constraints.some((c) => (c.on === 'sheet' ? v.sheetStats.includes(c.stat) : c.metric === 'taken' ? v.takenChanges : v.scoreChanges))
    const constrained = new Set(screen.verdicts.filter((v) => v.role !== 'objective' && !(v.id in keep) && reads(v)).map((v) => v.id))
    const preferred = fillerId !== undefined && !(fillerId in keep) && !exclude.includes(fillerId) ? fillerId : undefined
    const found = talentSpace({
      data,
      roles: screen.roles,
      values,
      constrained,
      keep,
      exclude,
      minPoints,
      ...(preferred ? { preferred: [preferred] } : {}),
      preferTree: search.preferTree ?? mainTree(data, start.talents),
      searchPartials: search.searchPartials,
      limit: search.limit,
    })
    builds = found.builds.map((b) => b.code)
    const { builds: list, ...rest } = found
    space = {
      ...rest,
      builds: list.length,
      floor: talentRules.floor,
      constrained: [...constrained],
      ...(minPoints ? { minPoints } : {}),
      ...(preferred ? { preferred } : {}),
    }
  }

  // The candidates: the setup itself (if it's valid and best, it wins like any candidate), the start
  // (where this search begins: a pass of a search in turns starts from the last one's winner), then
  // every build with every rotation variant. Each setup once.
  const pool: Candidate[] = []
  const seen = new Set<string>()
  const add = (candidate: Candidate) => {
    const key = candidateKey(config, candidate)
    if (seen.has(key)) return
    seen.add(key)
    pool.push(candidate)
  }
  add(setupCandidate(config))
  add(start)
  for (const talents of builds) for (const rotation of rotations) add({ talents, rotation: { ...start.rotation, ...rotation } })

  // Every candidate must meet every talent and sheet constraint; result constraints are judged in the race.
  const sheetOf = (c: Candidate) => sheetValues(buildPlan(applyCandidate(config, c)))
  const baseline = setupCandidate(config)
  const baselineSheet = sheetOf(baseline)
  const reference = options.reference ? sheetValues(buildPlan({ ...options.reference, run: { mode: 'fixed', iterations: 0, seed } })) : baselineSheet
  const sheetRules = constraints.filter((c): c is SheetConstraint => c.on === 'sheet')
  const talentFails = (c: Candidate) => (talentRules ? brokenConstraints(data, c.talents, talentRules.constraints) : [])
  const keepsTalents = pool.filter((c) => talentFails(c).length === 0)
  const sheets = sheetRules.length > 0 ? keepsTalents.map(sheetOf) : []
  const valid = keepsTalents.filter((_, i) => sheetRules.length === 0 || meetsSheet(sheets[i], reference, sheetRules))
  const excluded: Excluded = { talents: pool.length - keepsTalents.length, sheet: keepsTalents.length - valid.length }
  // The setup's own failures, so the report can say why it isn't among the candidates.
  const setupFails = [...talentFails(baseline), ...sheetRules.filter((c) => !meetsSheet(baselineSheet, reference, [c])).map(constraintName)]

  const candidates = [baseline, ...valid]
  const planned = fitBudget(options.budget, candidates.length)
  options.onProgress?.({
    phase: 'space',
    builds: builds.length,
    candidates: valid.length,
    excluded,
    budget: { fights: planned.fights, initialFights: planned.initialFights },
    notes: planned.notes,
    setupFails,
    ...(screen ? { screen } : {}),
    ...(space ? { space } : {}),
  })

  const sources: PlanSource[] = candidates.map((c) => ({ key: planKey(), plan: () => candidatePlan(config, c) }))
  // Build the baseline's plan now, so a setup that can't be simulated fails before any fights.
  sources[0].plan()
  const resultRules = constraints.filter((c): c is ResultConstraint => c.on === 'result')
  const raced = await race({
    sources,
    // The setup's copy is the baseline's own plan: it takes the baseline's samples (OV2-5).
    copies: candidates.flatMap((c, i) => (i > 0 && isSetup(config, c) ? [i] : [])),
    runner,
    objective,
    budget: planned.fights,
    initialFights: planned.initialFights,
    constraints: resultRules,
    // Every standing, for the preferred filler's rule; trimmed to `top` below.
    top: Infinity,
    signal,
    onProgress: (p) => options.onProgress?.({ phase: 'race', ...p }),
  })

  // The preferred filler (D30): a candidate level with the leader that has more of it answers instead.
  let preferred: OptimizeReport['preferred']
  if (raced.leader !== null && fillerId !== undefined) {
    const ranksOf = (c: number) => {
      try {
        return decodeTalentCode(data, candidates[c].talents)[fillerId] ?? 0
      } catch {
        return 0
      }
    }
    const [lead, ...others] = raced.standings
    const pick = preferFiller(
      { candidate: lead.candidate, ranks: ranksOf(lead.candidate), score: lead.mean.score },
      others.map((s) => ({ candidate: s.candidate, ranks: ranksOf(s.candidate), vsLeader: s.vsLeader!, eligible: s.feasible && s.droppedAs !== 'infeasible' })),
    )
    if (pick) preferred = { ...pick, talent: fillerName! }
  }
  const answer = preferred?.candidate ?? raced.leader
  const top = raced.standings.slice(0, options.top ?? 10)
  if (preferred && !top.some((s) => s.candidate === preferred.candidate)) top.push(raced.standings.find((s) => s.candidate === preferred.candidate)!)
  const result: RaceResult = { ...raced, standings: top }

  let blocked: string[] = []
  if (answer === null)
    blocked =
      valid.length === 0
        ? whyNoneBefore({ pool, talentFails, keepsTalents, sheets, reference, sheetRules, space, talentRules: talentRules?.constraints, data })
        : whyNoneInRace(resultRules, result, valid.length)
  return {
    spec,
    objective,
    seed,
    budget: { fights: planned.fights, initialFights: planned.initialFights },
    notes: planned.notes,
    ...(screen ? { screen } : {}),
    ...(space ? { space } : {}),
    candidates,
    excluded,
    setupFails,
    constraints,
    reference,
    // Every result shows its health, effective health and damage taken (D30).
    sheets: Object.fromEntries([0, ...result.standings.map((st) => st.candidate)].map((i) => [i, i === 0 ? baselineSheet : sheetOf(candidates[i])])),
    race: result,
    answer,
    ...(preferred ? { preferred } : {}),
    blocked,
    fights: (screen?.fights ?? 0) + result.spent,
    ms: now() - began,
  }
}

/** A number for a message: two decimals below 100, whole above. */
const show = (x: number) => (Math.abs(x) < 100 ? x.toFixed(2) : Math.round(x).toLocaleString('en-US'))

/**
 * The talent constraints in words, for a search whose space is empty: the survival floor, the kept
 * talents beyond it, the excluded ones and the trees' minimums.
 */
function describeTalentRules(data: TalentData, rules: TalentConstraints, floor: Record<string, number>): string {
  const name = (id: string) =>
    talentsInCodeOrder(data)
      .flat()
      .find((t) => t.id === id)?.name ?? id
  const ranked = (entries: [string, number][]) => entries.map(([id, rank]) => `${name(id)} ${rank}`).join(', ')
  const kept = Object.entries(rules.keep ?? {}).filter(([id, rank]) => floor[id] !== rank)
  const parts = [
    ...(Object.keys(floor).length ? [`the survival floor (${ranked(Object.entries(floor))})`] : []),
    ...(kept.length ? [`kept talents (${ranked(kept)})`] : []),
    ...(rules.exclude?.length ? [`excluded talents (${rules.exclude.map(name).join(', ')})`] : []),
    ...Object.entries(rules.minPoints ?? {})
      .filter(([, points]) => points > 0)
      .map(([tree, points]) => `at least ${points} points in ${data.trees.find((t) => t.id === tree)?.name ?? tree}`),
  ]
  return parts.join('; ')
}

/**
 * Why no candidate reached the race, a line a blocking constraint: the talent constraints together
 * when no legal build fits them all (the space is empty); the ones the start's build breaks when no
 * candidate keeps them otherwise (a search that keeps its build); else each sheet constraint no
 * candidate that keeps them meets, with the closest one's value; else the sheet constraints no
 * candidate meets together.
 */
export function whyNoneBefore(from: {
  pool: Candidate[]
  talentFails: (c: Candidate) => string[]
  keepsTalents: Candidate[]
  sheets: SheetValues[]
  reference: SheetValues
  sheetRules: SheetConstraint[]
  data: TalentData
  space?: OptimizeReport['space']
  talentRules?: TalentConstraints
}): string[] {
  const { pool, talentFails, keepsTalents, sheets, reference, sheetRules, space, talentRules } = from
  if (keepsTalents.length === 0) {
    // No legal build fits them all (OV2-3): the setup's and the start's failures aren't the reason.
    if (space && space.builds === 0 && talentRules)
      return [`talents: no legal ${from.data.rules.maxPoints}-point build fits the talent constraints together: ${describeTalentRules(from.data, talentRules, space.floor)}`]
    const fails = [...new Set(pool.flatMap(talentFails))]
    return [`talents: no candidate keeps the talent constraints (the survival floor, kept and excluded talents, the trees' minimums): ${fails.join(', ')}`]
  }
  const lines: string[] = []
  for (const c of sheetRules) {
    if (sheets.some((v) => meetsSheet(v, reference, [c]))) continue
    const { min, max } = limits(c, reference[c.stat])
    // The closest: the least over a maximum, or the most under a minimum.
    const closest = sheets.reduce((a, b) => (max < Infinity ? (b[c.stat] < a[c.stat] ? b : a) : b[c.stat] > a[c.stat] ? b : a))
    const name = constraintName(c)
    if (name === 'crit immune')
      lines.push(`crit immune: no candidate reaches the defense it needs on this gear; the closest has ${Math.round(closest.defense)} defense, leaving the boss ${show(closest.bossCritPct)}% crit`)
    else if (name === 'crush immune')
      lines.push(`crush immune: no candidate pushes crushing blows off the boss's table on this gear; the closest leaves them ${show(closest.bossCrushPct)}%`)
    else lines.push(`${name}: no candidate meets it; the closest has ${c.stat} ${show(closest[c.stat])} against a limit of ${show(max < Infinity ? max : min)}`)
  }
  if (lines.length === 0) lines.push(`no candidate meets ${sheetRules.map(constraintName).join(' and ')} together, though each alone is met`)
  return lines
}

/** Why the race ended with no leader: the result constraints its candidates were clearly outside, or the budget ran out first. */
export function whyNoneInRace(rules: ResultConstraint[], race: RaceResult, candidates: number): string[] {
  const lines = rules.flatMap((c, i) => (race.outside[i] > 0 ? [`${formatConstraint(c)}: ${race.outside[i].toLocaleString('en-US')} of ${candidates.toLocaleString('en-US')} candidates were clearly outside it in the race`] : []))
  if (race.status === 'budget') lines.push(`the budget ran out before any candidate's means met ${rules.map(formatConstraint).join(' and ')}`)
  return lines
}

export interface Confirmation {
  seed: number
  fights: number
  /** Winner − baseline on the fresh seed, 95%. */
  vsBaseline: { dps: Interval; tps: Interval; taken: Interval; score: Interval }
  /** D23's bar: the score's interval lies above zero. */
  clears: boolean
  /** The [?] assumptions the winner's gain can flow through (`assumptionChanges`). */
  assumptions: AssumptionChanges
}

/**
 * The [?] assumptions (sim/plan/assumptions.ts) the winner relies on and the baseline doesn't, the
 * other way round, and those both rely on. The plan lists an assumption only when the setup relies
 * on it, so one only the winner has is a place its gain can come from. The sim can't switch most of
 * them off to measure it, so this names them rather than measuring; D12's unmeasured ratings, the
 * one it can switch, the CLI's --confirm runs both ways.
 */
export interface AssumptionChanges {
  winnerOnly: Assumption[]
  baselineOnly: Assumption[]
  shared: Assumption[]
}

export function assumptionChanges(config: SimConfig, candidate: Candidate): AssumptionChanges {
  const of = (c: Candidate) => buildPlan(applyCandidate(config, c)).assumptions
  const base = of(setupCandidate(config))
  const winner = of(candidate)
  const ids = (list: Assumption[]) => new Set(list.map((a) => a.id))
  const baseIds = ids(base)
  const winnerIds = ids(winner)
  return {
    winnerOnly: winner.filter((a) => !baseIds.has(a.id)),
    baselineOnly: base.filter((a) => !winnerIds.has(a.id)),
    shared: winner.filter((a) => baseIds.has(a.id)),
  }
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
    { key: planKey(), plan: () => candidatePlan(config, setupCandidate(config), seed) },
    { key: planKey(), plan: () => candidatePlan(config, candidate, seed) },
  ]
  const result = await race({ sources, runner: options.runner, objective: options.objective, budget: 2 * fights, initialFights: fights, top: 2, mergeTies: false, signal: options.signal })
  const winner = result.standings.find((s) => s.candidate === 1)!
  return { seed, fights, vsBaseline: winner.vsBaseline, clears: lower(winner.vsBaseline.score) > 0, assumptions: assumptionChanges(config, candidate) }
}

/** A candidate's identity: its talents and its whole rotation, on top of the setup's. */
function candidateKey(config: SimConfig, c: Candidate): string {
  const rotation = { ...config.rotation, ...c.rotation }
  return `${c.talents}|${JSON.stringify(Object.keys(rotation).sort().map((k) => [k, rotation[k]]))}`
}

function sameRotation(a: Record<string, RotationValue>, b: Record<string, RotationValue>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}

/**
 * Talents and rotation in turns (docs/optimizer.md#talents-and-rotation-together): the talents with
 * the start's rotation, then the rotation variants with the winning talents, then the talents again
 * with the winning rotation, until a pass's winner is where it started, `passes` run out, or a pass
 * has no answer. Each pass spends the whole budget and holds every candidate to every constraint,
 * the talent ones included. The baseline is the setup itself throughout.
 */
export async function optimizeInTurns(options: OptimizeOptions & { passes?: number; onPass?: (report: OptimizeReport, pass: number) => void }): Promise<OptimizeReport[]> {
  if (!options.talents || !options.rotations?.length) throw new Error('Taking turns needs a talent search and rotation variants.')
  const reports: OptimizeReport[] = []
  let start: Candidate = options.start ?? setupCandidate(options.config)
  const passes = options.passes ?? 4
  for (let pass = 0; pass < passes; pass++) {
    const talents = pass % 2 === 0
    const report = await optimize({
      ...options,
      start,
      // A talent pass screens under the rotation variants too, so a talent only they use counts; a
      // rotation pass keeps the start's build, held to the same talent constraints.
      ...(talents ? { rotations: [], screenRotations: options.rotations } : { talents: { ...options.talents, fixedBuild: true } }),
    })
    reports.push(report)
    options.onPass?.(report, pass)
    if (report.answer === null) break
    const winner = report.candidates[report.answer]
    const moved = winner.talents !== start.talents || !sameRotation(winner.rotation, start.rotation)
    start = winner
    if (!moved && pass > 0) break
  }
  return reports
}
