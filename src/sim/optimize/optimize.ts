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
import { type FightRunner, type PlanSource, planKey, SearchTooLargeError } from './fights'
import { type Constraint, constraintName, limits, meetsSheet, sheetValues, type SheetValues } from './constraints'
import { defaultGoal, type Goal, type Interval, lower, scoredGoal } from './objective'
import { race, type RaceProgress, type RaceResult } from './race'
import { screenTalents, type TalentScreen, type TalentVerdict } from './screen'
import { brokenConstraints, MAX_BUILDS, type TalentConstraints, talentSpace, type TalentSpace, talentSpaceSize } from './talents'

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

/** The fewest first-round fights a candidate runs while the budget covers them (`firstRound`). */
export const FIRST_ROUND_MIN = 50

/**
 * The first round's fights: 30% of the budget spread over the plans that run it (the candidates and
 * the baseline, as `fitBudget` counts them), between FIRST_ROUND_MIN and 1,000 each.
 */
export function firstRound(budget: Budget, plans: number): number {
  if (budget.initialFights !== undefined) return budget.initialFights
  return Math.max(FIRST_ROUND_MIN, Math.min(1000, Math.floor((0.3 * budget.fights) / Math.max(1, plans))))
}

/**
 * The most fights a search runs, the screen's and the race's together (D30's hard ceiling, user
 * decision: "there does need to be some reasonable limit to iterations"; OGV-2,
 * docs/optimizer.md#budgets): the `thorough` budget's. It's never raised automatically; a caller
 * raises it only by passing `maxFights` (the CLI's `--max-fights`).
 */
export const MAX_SEARCH_FIGHTS = BUDGETS.thorough.fights

/**
 * The fewest first-round fights a candidate runs when even max ranks don't fit the cap at
 * FIRST_ROUND_MIN (`fitBudget`); below it, the search refuses to run (`SearchTooLargeError`).
 */
export const MIN_FIRST_ROUND = 20

/** A race's budget and first round, fitted to its plans within the cap (`fitBudget`). */
export interface FittedBudget {
  fights: number
  initialFights: number
  /** What fitting changed, in words: a budget clamped to the cap, a larger budget, a smaller first round. */
  notes: string[]
  /** Whether every plan runs its first round (FIRST_ROUND_MIN at least) within the cap. When not, the caller narrows the space. */
  fits: boolean
}

const fmt = (x: number) => x.toLocaleString('en-US')

/**
 * The budget and first round a race of this many plans runs, the baseline included, since it runs
 * every round too (docs/optimizer.md#budgets; the CLI's "candidates" count leaves it out), never
 * past `cap` fights, what the search's hard ceiling leaves the race (D30, OGV-2). A budget over it
 * is cut to it. The first round is `firstRound`'s while it fits in 90% of the budget; past that the
 * budget grows, up to the cap, to a first round of FIRST_ROUND_MIN fights each and as much again.
 * A caller's first round (`initialFights`) past the cap shrinks to fit 90% of it, and still fits
 * while that's FIRST_ROUND_MIN or more (OGV2-1). Past the cap at FIRST_ROUND_MIN it doesn't fit
 * (`fits` false): the caller narrows the space, and as a last resort the first round shrinks to fit
 * 90% of the cap.
 */
export function fitBudget(budget: Budget, plans: number, cap = MAX_SEARCH_FIGHTS): FittedBudget {
  const n = Math.max(1, plans)
  const notes: string[] = []
  let fights = budget.fights
  if (fights > cap) {
    notes.push(`The budget of ${fmt(fights)} fights passes the ${fmt(cap)} the search's cap leaves the race, so the race runs at most ${fmt(cap)}.`)
    fights = cap
  }
  const wanted = firstRound({ ...budget, fights }, n)
  if (wanted * n <= 0.9 * fights) return { fights, initialFights: wanted, notes, fits: true }
  if (budget.initialFights !== undefined && wanted * n <= fights) return { fights, initialFights: wanted, notes, fits: true }
  // Here the first round is FIRST_ROUND_MIN, or the caller's (30% of the budget never passes 90% of it).
  if (wanted * n <= 0.9 * cap) {
    const grown = Math.min(cap, Math.max(fights, 2 * wanted * n))
    notes.push(
      `${fmt(n)} plans (the baseline included) need ${fmt(wanted * n)} fights for a first round of ${fmt(wanted)} each: the budget grew from ${fmt(fights)} to ${fmt(grown)} fights (the cap leaves the race ${fmt(cap)}).`,
    )
    return { fights: grown, initialFights: wanted, notes, fits: true }
  }
  const fit = Math.floor((0.9 * cap) / n)
  // The caller's first round passes the cap, but the usual one fits: it shrinks to fit (OGV2-1).
  if (budget.initialFights !== undefined && fit >= FIRST_ROUND_MIN) {
    notes.push(
      `A first round of ${fmt(wanted)} fights each over ${fmt(n)} plans (the baseline included) passes the ${fmt(cap)} fights the search's cap leaves the race: it runs ${fmt(fit)} each.`,
    )
    return { fights: cap, initialFights: fit, notes, fits: true }
  }
  notes.push(
    `${fmt(n)} plans (the baseline included) don't fit the ${fmt(cap)} fights the search's cap leaves the race at ${fmt(wanted)} fights each: the first round runs ${fmt(fit)} each, so it drops fewer, and the race may end on the budget. Narrowing the search (keep or exclude talents, fewer rotation variants) sharpens it.`,
  )
  return { fights: cap, initialFights: fit, notes, fits: false }
}

/**
 * How the talent space was narrowed to fit the hard ceiling (OGV-2), when it was: every rank of one
 * talent a build would make `builds` builds (at least that many when the count stopped at the
 * limit), past the enumeration's limit (`builds`) or more plans than the fight cap races at
 * FIRST_ROUND_MIN fights each (`fights`), so the search tried max ranks only.
 */
export interface Narrowed {
  to: 'max ranks'
  passes: 'builds' | 'fights'
  builds: number
  atLeast: boolean
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
  /**
   * Search every rank of one objective talent a build, not only 0 or max (default yes, OG-2; a
   * dimension only a constraint made is at 0 or max, OGV-1). A space that passes `limit` with them,
   * or the fight cap at FIRST_ROUND_MIN fights a plan, searches max ranks only, and the report says
   * so (`space.narrowed`, `notes`).
   */
  searchPartials?: boolean
  /** Most builds the space lists (default MAX_BUILDS, 200,000; OGV-2). */
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
  /**
   * The most fights the search runs, the screen's and the race's together (default
   * MAX_SEARCH_FIGHTS, the `thorough` budget's; D30's hard ceiling, OGV-2). The budget grows up to
   * it and never past it.
   */
  maxFights?: number
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
      /** The race's budget and first round, fitted to the candidates within the cap, and what fitting them changed. */
      budget: { fights: number; initialFights: number; cap: number }
      /** The most the search can still run, before the race starts: its fights, and roughly how long at the screen's pace. */
      estimate: Estimate
      notes: string[]
      setupFails: string[]
      screen?: TalentScreen
      space?: OptimizeReport['space']
    }
  | ({ phase: 'race' } & RaceProgress)

/**
 * What a search can still run once its space is known, before the race's first fight (OGV-2): the
 * screen's fights, run, and the race's budget, the most it can spend (a race usually stops sooner).
 * `seconds` is the race's budget at the pace the screen ran, when there was one.
 */
export interface Estimate {
  fights: number
  screenFights: number
  raceFights: number
  seconds?: number
}

export interface OptimizeReport {
  spec: SpecId
  /** The goal the player picked. */
  goal: Goal
  /** The goal the score read: the player's, but Balanced for a DPS spec is DPS (`scoredGoal`). */
  scoredGoal: Goal
  seed: number
  /** The race's budget and first round, after fitting them to the candidates within the cap (`fitBudget`), and the cap. */
  budget: { fights: number; initialFights: number; cap: number }
  /** What the race could run at most, told before it ran (`Estimate`). */
  estimate: Estimate
  /** What the search changed to run at all, in words: a space narrowed to max ranks, a larger budget, a smaller first round. */
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
    /** Whether every rank of one talent a build was searched (OG-2), or max ranks only. */
    searchPartials: boolean
    /** Why partial ranks weren't searched though they were asked for: the space passed a ceiling (OGV-2). */
    narrowed?: Narrowed
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
  /** A search in turns whose next pass no longer fit the cap ends on this report, saying so (OGV-2). */
  turnsStopped?: string
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
  const cap = options.maxFights ?? MAX_SEARCH_FIGHTS
  let screen: TalentScreen | undefined
  let screenMs = 0
  let space: OptimizeReport['space']
  let builds = [start.talents]
  /** What building the space changed, in words (a space narrowed to max ranks, OGV-2). */
  let spaceNotes: string[] = []
  if (search && talentRules && !search.fixedBuild) {
    const screenStarted = now()
    screen = await screenTalents({
      config: applyCandidate(config, start),
      data,
      runner,
      goal: scored,
      fights: search.screenFights,
      maxFights: cap,
      rotations: options.screenRotations ?? options.rotations,
      signal,
      onProgress: (done, total) => options.onProgress?.({ phase: 'screen', done, total }),
    })
    screenMs = now() - screenStarted
    const { keep = {}, exclude = [], minPoints } = talentRules
    const maxRank = new Map(talentsInCodeOrder(data).flat().map((t) => [t.id, t.maxRank]))
    const values = new Map(screen.verdicts.filter((v) => v.effect).map((v) => [v.id, v.effect!.mean / maxRank.get(v.id)!]))
    const tieValues = new Map(screen.verdicts.filter((v) => v.tieEffect).map((v) => [v.id, v.tieEffect!.mean / maxRank.get(v.id)!]))
    // A talent that changes what a constraint reads is searched, not a filler (./talents.ts), but
    // only where the constraint could bind without it (OG-1): if every build of the space made
    // without these dimensions meets every sheet constraint, searching them only adds builds that
    // trade score for a limit already met. Where talents' effects add up, those builds differ from
    // the space's only in points the score can't see (the fillers), or in fewer points on objective
    // talents, so none scores better.
    const reads = (v: TalentVerdict) => constraints.some((c) => v.sheetStats.includes(c.stat))
    const readByConstraint = new Set(screen.verdicts.filter((v) => v.role !== 'objective' && !(v.id in keep) && reads(v)).map((v) => v.id))
    const limit = search.limit ?? MAX_BUILDS
    const spaceOptions = (constrained: ReadonlySet<string>, searchPartials: boolean) => ({
      data,
      roles: screen!.roles,
      values,
      tieValues,
      constrained,
      keep,
      exclude,
      minPoints,
      preferTree: search.preferTree ?? mainTree(data, start.talents),
      searchPartials,
      limit,
    })
    // The hard ceiling (D30, OGV-2): the race gets what the screen left of the cap. A space is sized
    // before it's listed (`talentSpaceSize`), and one that passes the builds' limit, or has more
    // plans (before the sheet constraints leave any out) than the cap races at FIRST_ROUND_MIN
    // fights each, narrows to max ranks, and says so. Cut off in the middle, a space would drop
    // builds by where they fall in the enumeration; max ranks drop them by a rule the report states.
    // The rule is FIRST_ROUND_MIN fights a plan in 90% of what the cap leaves the race, whatever first
    // round the caller asked for (OGV2-1): a caller's larger one shrinks to fit in the final
    // `fitBudget`, and never narrows the space.
    const raceCap = cap - screen.fights
    const plans = (n: number) => n * rotations.length + 2
    const fitsCap = (n: number) => plans(n) * FIRST_ROUND_MIN <= 0.9 * raceCap
    const fitted = (constrained: ReadonlySet<string>) => {
      const notes: string[] = []
      let partials = search.searchPartials ?? true
      let narrowed: Narrowed | undefined
      if (partials) {
        const size = talentSpaceSize({ ...spaceOptions(constrained, true), stopAt: limit })
        const passes = size.stopped ? 'builds' : fitsCap(size.builds) ? undefined : 'fights'
        if (passes) {
          partials = false
          narrowed = { to: 'max ranks', passes, builds: size.builds, atLeast: size.stopped }
          const why =
            passes === 'builds'
              ? `makes more than ${fmt(limit)} builds, the most a search lists`
              : `makes ${fmt(size.builds)} builds, more than the cap of ${fmt(cap)} fights a search races at ${FIRST_ROUND_MIN} fights each`
          notes.push(
            `Narrowed to max ranks: every rank of one talent a build ${why}, so this search tries each talent at 0 or its max rank only (leftover points still go to partial ranks, by score per point). Keeping or excluding talents searches partial ranks too.`,
          )
        }
      }
      if (!partials) {
        const size = talentSpaceSize({ ...spaceOptions(constrained, false), stopAt: limit })
        if (size.stopped)
          throw new SearchTooLargeError(
            `The talent space makes more than ${fmt(limit)} builds even with max ranks only, the most a search lists (D30's hard ceiling): keep or exclude talents, or set a tree's minimum points, to narrow it.`,
          )
      }
      return { space: talentSpace(spaceOptions(constrained, partials)), partials, narrowed, notes }
    }
    let found = fitted(new Set())
    const binds =
      readByConstraint.size > 0 &&
      (found.space.builds.length === 0 ||
        found.space.builds.some((b) => rotations.some((r) => !meetsSheet(sheetOf({ talents: b.code, rotation: { ...start.rotation, ...r } }), reference, sheetRules))))
    if (binds) found = fitted(readByConstraint)
    spaceNotes = found.notes
    builds = found.space.builds.map((b) => b.code)
    const { builds: list, ...rest } = found.space
    space = {
      ...rest,
      builds: list.length,
      constrained: binds ? [...readByConstraint] : [],
      notBinding: binds ? [] : [...readByConstraint],
      searchPartials: found.partials,
      ...(found.narrowed ? { narrowed: found.narrowed } : {}),
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
  // The baseline runs every round too, so the budget is fitted to every plan (OV4-5), within what
  // the screen left of the cap (OGV-2). Past the cap, the first round shrinks to fit it, to no fewer
  // than MIN_FIRST_ROUND fights; below that the search doesn't run.
  const screenFights = screen?.fights ?? 0
  const planned = fitBudget(options.budget, candidates.length, cap - screenFights)
  if (!planned.fits && planned.initialFights < MIN_FIRST_ROUND)
    throw new SearchTooLargeError(
      `${fmt(candidates.length)} plans (the baseline included) don't fit the cap of ${fmt(cap)} fights a search${space && !space.searchPartials ? ', even with max ranks only' : ''}, at ${MIN_FIRST_ROUND} fights each: keep or exclude talents, or try fewer rotation variants, to narrow it.`,
    )
  const budget = { fights: planned.fights, initialFights: planned.initialFights, cap }
  const notes = [...spaceNotes, ...planned.notes]
  // Told before the race runs: at most its budget more, at the pace the screen ran.
  const estimate: Estimate = {
    fights: screenFights + planned.fights,
    screenFights,
    raceFights: planned.fights,
    ...(screen && screenMs > 0 && screen.fights > 0 ? { seconds: (planned.fights * screenMs) / screen.fights / 1000 } : {}),
  }
  options.onProgress?.({
    phase: 'space',
    builds: builds.length,
    candidates: valid.length,
    excluded,
    budget,
    estimate,
    notes,
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
    budget,
    estimate,
    notes,
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

/** The fewest fights each a confirmation runs (the CLI's `--confirm-fights` minimum); fewer left under the cap, and it doesn't run (OGV2-2). */
export const MIN_CONFIRM_FIGHTS = 100

/**
 * A confirmation's fights each, within the search's hard ceiling (OGV2-2,
 * docs/optimizer.md#budgets): the check counts under the cap like the screen and the race. Each of
 * its `checks` runs (the CLI runs two: the unmeasured ratings applied and ignored) races the winner
 * and the baseline, 2 × fights, so it gets what the search left (`left`), split among them, and no
 * more than was asked for. Null when fewer than MIN_CONFIRM_FIGHTS each fit.
 */
export function confirmFights(requested: number, left: number, checks = 1): { fights: number; clamped: boolean } | null {
  const fit = Math.floor(Math.max(0, left) / (2 * checks))
  if (fit >= requested) return { fights: requested, clamped: false }
  return fit >= MIN_CONFIRM_FIGHTS ? { fights: fit, clamped: true } : null
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
 * The share of what's left of the cap that each pass of a search in turns, but the last, holds back
 * for the passes after it (OGV2-4, docs/optimizer.md#budgets): one pass can't spend the whole cap and
 * leave the next nothing. A rotation pass is cheap, so a tenth is plenty for it.
 */
export const TURNS_RESERVE = 0.1

/**
 * Talents and rotation in turns (docs/optimizer.md#talents-and-rotation-together): the talents with
 * the start's rotation, then the rotation variants with the winning talents, then the talents again
 * with the winning rotation, until a pass's winner is where it started, `passes` run out, or a pass
 * has no answer. Each pass spends the whole budget and holds every candidate to every constraint,
 * the talent ones included. The baseline is the setup itself throughout. The hard ceiling holds for
 * the whole search (OGV-2): each pass gets what the passes before it left of the cap, less `reserve`
 * of it held back for the passes after it (all of it for the last pass; OGV2-4), and when a later
 * pass no longer fits, the turns end there and the last report's `turnsStopped` says so.
 */
export async function optimizeInTurns(
  options: OptimizeOptions & {
    passes?: number
    /** The share of what's left each pass but the last holds back for the passes after it (default TURNS_RESERVE). */
    reserve?: number
    onPass?: (report: OptimizeReport, pass: number) => void
  },
): Promise<OptimizeReport[]> {
  if (!options.talents || !options.rotations?.length) throw new Error('Taking turns needs a talent search and rotation variants.')
  const reports: OptimizeReport[] = []
  let start: Candidate = options.start ?? setupCandidate(options.config)
  const passes = options.passes ?? 4
  const cap = options.maxFights ?? MAX_SEARCH_FIGHTS
  const reserve = options.reserve ?? TURNS_RESERVE
  let spent = 0
  for (let pass = 0; pass < passes; pass++) {
    const talents = pass % 2 === 0
    const left = cap - spent
    // What this pass may run: what's left, less the share held back for the passes after it.
    const share = pass < passes - 1 ? Math.floor(left * (1 - reserve)) : left
    const stop = (why: string) => {
      reports[reports.length - 1].turnsStopped =
        `The cap of ${fmt(cap)} fights a search ended the turns after pass ${pass}, with ${fmt(left)} left${share < left ? ` (pass ${pass + 1} could run ${fmt(share)}, the rest held back for the passes after it)` : ''}: ${why}`
    }
    if (pass > 0 && share <= 0) {
      stop('none left for another pass.')
      break
    }
    let report: OptimizeReport
    try {
      report = await optimize({
        ...options,
        maxFights: share,
        start,
        // A talent pass screens under the rotation variants too, so a talent only they use counts; a
        // rotation pass keeps the start's build, held to the same talent constraints.
        ...(talents ? { rotations: [], screenRotations: options.rotations } : { talents: { ...options.talents, fixedBuild: true } }),
      })
    } catch (error) {
      // The first pass fails as a single search would; a later one ends the turns on the last answer.
      if (pass === 0 || !(error instanceof SearchTooLargeError)) throw error
      stop(error.message)
      break
    }
    spent += report.fights
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
