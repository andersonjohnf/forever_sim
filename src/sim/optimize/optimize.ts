// The optimizer: finds the best talents and rotation settings for a setup and a goal (decision
// D30; docs/optimizer.md). The player picks the goal: Defense, DPS, TPS or Balanced (./objective.ts).
// No talent is kept, dropped or ordered by its name (D30, user decision after O1's fifth review
// round): every talent is judged by what the screen measures it doing for the goal. The steps:
// 1. Screen the class's talents for this setup and goal (./screen.ts), if talents are searched.
// 2. Build the candidates: every sensible talent build under the constraints (./talents.ts), each
//    with every rotation variant given, and the setup and the start themselves. Every candidate
//    must meet every constraint, talent and sheet alike, before the race; the race takes no limits
//    on fight results (D30).
// 3. Race them on common random numbers (./race.ts) within the budget, beside the baseline, the
//    setup as it is: the measuring stick every candidate is paired with, never an answer. If no
//    candidate meets the constraints, there's no answer, and the report says which ones block.
// 4. The answer is the race's leader, the best by the goal.
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
import { type Constraint, constraintName, limits, meetsSheet, sheetValues, type SheetValues } from './constraints'
import { defaultGoal, type Goal, type Interval, lower, scoredGoal } from './objective'
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

/**
 * The first round's fights: 30% of the budget spread over the plans that run it (the candidates and
 * the baseline, as `fitBudget` counts them), between 50 and 1,000 each.
 */
export function firstRound(budget: Budget, plans: number): number {
  if (budget.initialFights !== undefined) return budget.initialFights
  return Math.max(50, Math.min(1000, Math.floor((0.3 * budget.fights) / Math.max(1, plans))))
}

/** The fewest first-round fights a candidate runs when a large space shrinks the first round (`fitBudget`). */
export const MIN_FIRST_ROUND = 20

/**
 * The budget and first round a race of this many plans runs, the baseline included, since it runs
 * every round too (docs/optimizer.md#budgets; the CLI's "candidates" count leaves it out). The
 * first round is `firstRound`'s while it fits in 90% of the budget; past that it shrinks to fit, to no
 * fewer than MIN_FIRST_ROUND fights; past that the budget grows to cover that first round and as much
 * again. A search on a space too big for its budget still runs, and `notes` says what changed.
 */
export function fitBudget(budget: Budget, plans: number): { fights: number; initialFights: number; notes: string[] } {
  const n = Math.max(1, plans)
  const wanted = firstRound(budget, n)
  const fmt = (x: number) => x.toLocaleString('en-US')
  if (wanted * n <= 0.9 * budget.fights) return { fights: budget.fights, initialFights: wanted, notes: [] }
  if (budget.initialFights !== undefined && wanted * n <= budget.fights) return { fights: budget.fights, initialFights: wanted, notes: [] }
  const fit = Math.floor((0.9 * budget.fights) / n)
  if (fit >= MIN_FIRST_ROUND)
    return {
      fights: budget.fights,
      initialFights: fit,
      notes: [`${fmt(n)} plans (the baseline included) are many for a budget of ${fmt(budget.fights)} fights: the first round runs ${fmt(fit)} fights each instead of ${fmt(wanted)}, so it drops fewer, and the race may end on the budget. A larger budget sharpens it.`],
    }
  const fights = 2 * MIN_FIRST_ROUND * n
  return {
    fights,
    initialFights: MIN_FIRST_ROUND,
    notes: [
      `${fmt(n)} plans (the baseline included) don't fit a budget of ${fmt(budget.fights)} fights: the budget grew to ${fmt(fights)}, a first round of ${MIN_FIRST_ROUND} fights each and as much again. Narrow the search (keep or exclude talents, fewer rotation variants) or pick a larger budget.`,
    ],
  }
}

/**
 * A tank's own tree, by id, where its talent search spends at least TANK_TREE_POINTS unless told
 * otherwise (D30: "a minimum in a tree, for example 31 points in Protection"): the tree whose
 * 31-point talent makes the spec a tank. It's a rule on a tree's points, not on any talent.
 */
export const TANK_TREE: Partial<Record<SpecId, string>> = {
  'warrior-protection': 'Protection',
  'druid-feral-bear': 'Feral Combat',
  'paladin-protection': 'Protection',
}
export const TANK_TREE_POINTS = 31

/** A talent search: the constraints, and how the space is built. */
export interface TalentSearch extends TalentConstraints {
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
  /** What to optimize for (D30, the player's pick). Default: the spec's, DPS for DPS specs, Balanced for tanks. */
  goal?: Goal
  /**
   * Search talents (a talent search), or keep the setup's. With it, every candidate is held to its
   * talent constraints (kept and excluded talents, the trees' minimums).
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
  /** Limits on the sheet every candidate must meet (./constraints.ts): one that misses any is left out before any fights. */
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
  /** The screen's jobs done and planned (each plan's fights run in jobs of at most SCREEN_JOB_FIGHTS). */
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
  /** The goal the player picked. */
  goal: Goal
  /** The goal the score read: the player's, but Balanced for a DPS spec is DPS (`scoredGoal`). */
  scoredGoal: Goal
  seed: number
  /** The race's budget and first round, after fitting them to the candidates (`fitBudget`). */
  budget: { fights: number; initialFights: number }
  /** What the search changed to run at all, in words: a smaller first round, a larger budget. */
  notes: string[]
  screen?: TalentScreen
  /**
   * The talent space (its builds counted, not listed), and the talents that are dimensions because a
   * constraint reads what they change, by id.
   */
  space?: Omit<TalentSpace, 'builds'> & {
    builds: number
    constrained: string[]
    /**
     * Talents a constraint reads that stayed fillers, by id, because the constraints can't bind
     * without them: every build of the space made without them as dimensions meets every sheet
     * constraint already (OG-1).
     */
    notBinding: string[]
    minPoints?: Readonly<Record<string, number>>
  }
  /**
   * Index 0 is the baseline, the setup as it is: the measuring stick every candidate is paired with,
   * never an answer. Then every candidate that raced, each one meeting every talent and sheet
   * constraint. The setup itself is among them, as a copy, when it meets them too.
   */
  candidates: Candidate[]
  excluded: Excluded
  /** The constraints the setup itself fails, in words ("Ferocity taken", "crit immune"): it can't be the answer. */
  setupFails: string[]
  constraints: Constraint[]
  /** The reference's sheet values (relative sheet constraints are shares of them), and each reported candidate's, by index. */
  reference: SheetValues
  sheets: Record<number, SheetValues>
  /** The race, with its top standings. Its leader, the best mean, is the answer: null when no setup meets the constraints. */
  race: RaceResult
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
 * A talent search's constraints, by id: the player's kept and excluded talents, and the trees'
 * minimums: a tank's 31 in its tank tree (D30), with the search's own minimums merged over it (a tree
 * given replaces its default; 0 drops it). No talent is kept or excluded by default (D30).
 */
export function talentConstraintsOf(spec: SpecId, search: TalentSearch): TalentConstraints {
  const meta = SPEC_META[spec]
  const data = TALENT_DATA[meta.classId]
  const keep = Object.fromEntries(Object.entries(search.keep ?? {}).map(([name, rank]) => [talentId(data, name), rank]))
  const exclude = (search.exclude ?? []).map((name) => talentId(data, name))
  const tankTree = TANK_TREE[spec]
  const minPoints = {
    ...(tankTree ? { [tankTree]: TANK_TREE_POINTS } : {}),
    ...Object.fromEntries(Object.entries(search.minPoints ?? {}).map(([tree, points]) => [treeId(data, tree), points])),
  }
  return { keep, exclude, ...(Object.keys(minPoints).length ? { minPoints } : {}) }
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
  const goal = options.goal ?? defaultGoal(meta.role)
  // What the score reads: Balanced for a DPS spec is DPS, and Defense is a tank's (it throws otherwise).
  const scored = scoredGoal(goal, meta.role)
  const seed = config.run.seed
  const start = options.start ?? setupCandidate(config)
  // The start's own rotation is always a variant: a variant has to beat it to win (O1-1).
  const rotations = [{}, ...(options.rotations ?? [])]

  const constraints = [...(options.constraints ?? [])]
  const search = options.talents
  const talentRules = search ? talentConstraintsOf(spec, search) : undefined
  // Each candidate's sheet once: the space's check of its constraints and the race's filter share them.
  const sheetCache = new Map<string, SheetValues>()
  const sheetOf = (c: Candidate) => {
    const key = candidateKey(config, c)
    let sheet = sheetCache.get(key)
    if (!sheet) sheetCache.set(key, (sheet = sheetValues(buildPlan(applyCandidate(config, c)))))
    return sheet
  }
  const baseline = setupCandidate(config)
  const baselineSheet = sheetOf(baseline)
  const reference = options.reference ? sheetValues(buildPlan({ ...options.reference, run: { mode: 'fixed', iterations: 0, seed } })) : baselineSheet
  const sheetRules = constraints
  let screen: TalentScreen | undefined
  let space: OptimizeReport['space']
  let builds = [start.talents]
  if (search && talentRules && !search.fixedBuild) {
    screen = await screenTalents({
      config: applyCandidate(config, start),
      data,
      runner,
      goal: scored,
      fights: search.screenFights,
      rotations: options.screenRotations ?? options.rotations,
      signal,
      onProgress: (done, total) => options.onProgress?.({ phase: 'screen', done, total }),
    })
    const { keep = {}, exclude = [], minPoints } = talentRules
    const maxRank = new Map(talentsInCodeOrder(data).flat().map((t) => [t.id, t.maxRank]))
    const values = new Map(screen.verdicts.filter((v) => v.effect).map((v) => [v.id, v.effect!.mean / maxRank.get(v.id)!]))
    const tieValues = new Map(screen.verdicts.filter((v) => v.tieEffect).map((v) => [v.id, v.tieEffect!.mean / maxRank.get(v.id)!]))
    // A talent that changes what a constraint reads is searched, not a filler (./talents.ts), but
    // only where the constraint could bind without it (OG-1): if every build of the space made
    // without these dimensions meets every sheet constraint, searching them only adds builds that
    // trade score for a limit already met. Those builds differ from the space's only in points the
    // score can't see (the fillers), or in fewer points on objective talents, so none scores better.
    const reads = (v: TalentVerdict) => constraints.some((c) => v.sheetStats.includes(c.stat))
    const readByConstraint = new Set(screen.verdicts.filter((v) => v.role !== 'objective' && !(v.id in keep) && reads(v)).map((v) => v.id))
    const spaceWith = (constrained: ReadonlySet<string>) =>
      talentSpace({
        data,
        roles: screen!.roles,
        values,
        tieValues,
        constrained,
        keep,
        exclude,
        minPoints,
        preferTree: search.preferTree ?? mainTree(data, start.talents),
        searchPartials: search.searchPartials,
        limit: search.limit,
      })
    let found = spaceWith(new Set())
    const binds =
      readByConstraint.size > 0 &&
      (found.builds.length === 0 ||
        found.builds.some((b) => rotations.some((r) => !meetsSheet(sheetOf({ talents: b.code, rotation: { ...start.rotation, ...r } }), reference, sheetRules))))
    if (binds) found = spaceWith(readByConstraint)
    builds = found.builds.map((b) => b.code)
    const { builds: list, ...rest } = found
    space = {
      ...rest,
      builds: list.length,
      constrained: binds ? [...readByConstraint] : [],
      notBinding: binds ? [] : [...readByConstraint],
      ...(minPoints ? { minPoints } : {}),
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

  // Every candidate must meet every talent and sheet constraint.
  const talentFails = (c: Candidate) => (talentRules ? brokenConstraints(data, c.talents, talentRules) : [])
  const keepsTalents = pool.filter((c) => talentFails(c).length === 0)
  const sheets = sheetRules.length > 0 ? keepsTalents.map(sheetOf) : []
  const valid = keepsTalents.filter((_, i) => sheetRules.length === 0 || meetsSheet(sheets[i], reference, sheetRules))
  const excluded: Excluded = { talents: pool.length - keepsTalents.length, sheet: keepsTalents.length - valid.length }
  // The setup's own failures, so the report can say why it isn't among the candidates.
  const setupFails = [...talentFails(baseline), ...sheetRules.filter((c) => !meetsSheet(baselineSheet, reference, [c])).map(constraintName)]

  const candidates = [baseline, ...valid]
  // The baseline runs every round too, so the budget is fitted to every plan (OV4-5).
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
  const raced = await race({
    sources,
    // The setup's copy is the baseline's own plan: it takes the baseline's samples (OV2-5).
    copies: candidates.flatMap((c, i) => (i > 0 && isSetup(config, c) ? [i] : [])),
    runner,
    goal: scored,
    budget: planned.fights,
    initialFights: planned.initialFights,
    top: options.top,
    signal,
    onProgress: (p) => options.onProgress?.({ phase: 'race', ...p }),
  })

  // With a candidate there's always a leader: only a constraint that leaves every one out blocks.
  const blocked =
    valid.length === 0 ? whyNoneBefore({ pool, talentFails, keepsTalents, sheets, reference, sheetRules, space, talentRules, data }) : []
  return {
    spec,
    goal,
    scoredGoal: scored,
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
    sheets: Object.fromEntries([0, ...raced.standings.map((st) => st.candidate)].map((i) => [i, i === 0 ? baselineSheet : sheetOf(candidates[i])])),
    race: raced,
    blocked,
    fights: (screen?.fights ?? 0) + raced.spent,
    ms: now() - began,
  }
}

/** A number for a message: two decimals below 100, whole above. */
const show = (x: number) => (Math.abs(x) < 100 ? x.toFixed(2) : Math.round(x).toLocaleString('en-US'))

/** The talent constraints in words, for a search whose space is empty: the kept talents, the excluded ones and the trees' minimums. */
function describeTalentRules(data: TalentData, rules: TalentConstraints): string {
  const name = (id: string) =>
    talentsInCodeOrder(data)
      .flat()
      .find((t) => t.id === id)?.name ?? id
  const ranked = (entries: [string, number][]) => entries.map(([id, rank]) => `${name(id)} ${rank}`).join(', ')
  const kept = Object.entries(rules.keep ?? {})
  const parts = [
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
  sheetRules: readonly Constraint[]
  data: TalentData
  space?: OptimizeReport['space']
  talentRules?: TalentConstraints
}): string[] {
  const { pool, talentFails, keepsTalents, sheets, reference, sheetRules, space, talentRules } = from
  if (keepsTalents.length === 0) {
    // No legal build fits them all (OV2-3): the setup's and the start's failures aren't the reason.
    if (space && space.builds === 0 && talentRules)
      return [`talents: no legal ${from.data.rules.maxPoints}-point build fits the talent constraints together: ${describeTalentRules(from.data, talentRules)}`]
    const fails = [...new Set(pool.flatMap(talentFails))]
    return [`talents: no candidate keeps the talent constraints (kept and excluded talents, the trees' minimums): ${fails.join(', ')}`]
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
  /** The goal the score reads (`OptimizeReport.scoredGoal`). */
  goal: Goal
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
  const result = await race({ sources, runner: options.runner, goal: options.goal, budget: 2 * fights, initialFights: fights, top: 2, mergeTies: false, signal: options.signal })
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
    if (report.race.leader === null) break
    const winner = report.candidates[report.race.leader]
    const moved = winner.talents !== start.talents || !sameRotation(winner.rotation, start.rotation)
    start = winner
    if (!moved && pass > 0) break
  }
  return reports
}
