// The optimizer's public API (docs/optimizer.md, decision D30): what the CLI
// (scripts/tune/optimize.mjs) and the app's Optimize flow use.
export { ENGINES_PER_LANE, EngineCache, type FightRunner, type FightSamples, localFightRunner, type PlanSource, planKey, runFights } from './fights'
export {
  type Bound,
  type Constraint,
  CRIT_IMMUNE,
  CRUSH_IMMUNE,
  defaultConstraints,
  EHP_FLOOR,
  effectiveHealth,
  formatConstraint,
  immunityTable,
  limits,
  meetsSheet,
  parseConstraint,
  RESULT_METRICS,
  type ResultConstraint,
  type ResultMetric,
  SHEET_STATS,
  type SheetConstraint,
  type SheetStat,
  sheetValues,
  type SheetValues,
} from './constraints'
export { SURVIVAL_FLOOR, TANK_TREE, TANK_TREE_POINTS } from './floor'
export {
  defaultObjective,
  ELIMINATION_TAIL,
  eliminationZ,
  type Interval,
  lower,
  meanInterval,
  normalQuantile,
  type ObjectiveId,
  OBJECTIVES,
  pairedInterval,
  scorer,
  tQuantile,
  tTail,
  upper,
  Z99,
} from './objective'
export {
  applyCandidate,
  type AssumptionChanges,
  assumptionChanges,
  BUDGETS,
  type Budget,
  type BudgetId,
  type Candidate,
  candidatePlan,
  confirm,
  type Confirmation,
  firstRound,
  fitBudget,
  MIN_FIRST_ROUND,
  optimize,
  optimizeInTurns,
  type OptimizeOptions,
  type OptimizeProgress,
  type OptimizeReport,
  type TalentSearch,
} from './optimize'
export { race, type RaceOptions, type RaceProgress, type RaceResult, type RaceStatus, type RoundLog, type Standing } from './race'
export { screenTalents, type TalentScreen, type TalentVerdict } from './screen'
export { type TalentBuild, type TalentConstraints, type TalentRole, talentSpace, type TalentSpace } from './talents'
export { describeBuildChange } from './describe'
