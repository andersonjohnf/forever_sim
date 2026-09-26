// The gear search (O2; docs/optimizer.md#gear, decision D30's build plan of 2026-09-25): coordinate
// ascent over the paper doll, one slot (or a pair of slots) at a time, racing each step's candidates
// with O1's paired same-seed race (./optimize.ts), until a pass changes nothing; restarts from the
// default preset and from a greedy set; and a final race among where the restarts ended. Each pass
// ranks the slots' items first, by the setup's own stat weights (re-measured every pass, since hit
// past its cap is worth less) or, for what weights can't price (weapons, relics, modelled effects),
// by a measured swap. `optimizeTogether` alternates talents, gear and rotation until stable.
//
// Pure TypeScript, seeded: every fight runs through a FightRunner, so the same inputs and seed give
// the same answer on any number of threads.
import { PLAYER_LEVEL } from '../core/attack-table'
import type { Item } from '@/data/items/types'
import { defaultGear, preRaidListGear } from '../defaults'
import { ENCHANTS } from '../effects/enchants'
import type { FlatStat } from '../effects/types'
import { isTwoHand } from '../equip'
import type { Plan } from '../plan/types'
import { PROFILES } from '../rules/profiles'
import { SPEC_META } from '../specs'
import { deriveStats, type StatBlock } from '../stats/stat-block'
import type { GearSlot, SimConfig } from '../types'
import type { Constraint } from './constraints'
import { type FightRunner, type FightSamples, type PlanSource, planKey, SearchTooLargeError } from './fights'
import {
  enchantFieldValues,
  enchantsFor,
  GEAR_GROUPS,
  type Gear,
  type GearContext,
  gearContext,
  type GearFilters,
  type GearGroup,
  gearProblems,
  greedyGear,
  groupGears,
  GROUP_SLOTS,
  type GroupOptions,
  itemFieldValues,
  PAIR_OF,
  pairRankSlot,
  POOL,
  type RankList,
  rankList,
  type Rankings,
  SEARCHED_SLOTS,
  slotPool,
  type StatWeights,
  UNCONFIRMED_ENCHANTS,
  weighedEnchant,
  weighedItem,
  weighValues,
} from './gear'
import { defaultGoal, type Goal, type Interval, pairedInterval, scoredGoal, scorer } from './objective'
import {
  type Budget,
  type Candidate,
  candidateKey,
  candidatePlan,
  gearKey,
  MAX_SEARCH_FIGHTS,
  MIN_FIRST_ROUND,
  optimize,
  type OptimizeOptions,
  type OptimizeReport,
  setupCandidate,
  TURNS_RESERVE,
} from './optimize'

/** Fights each plan runs when stat weights are measured (a field's plus and minus plans). */
export const WEIGHT_FIGHTS = 1000
/** Fights each plan runs when an item or enchant is measured by a swap. */
export const MEASURE_FIGHTS = 300
/** The most passes over the paper doll a start runs, if one keeps changing something. */
export const GEAR_PASSES = 4
/** The share of a gear search's budget kept for the final race among the restarts' ends. */
export const FINAL_SHARE = 0.15
/** The fewest fights a measured plan runs when the budget scales the rankings down (fewer only when the caller asks for fewer). */
export const MIN_RANK_FIGHTS = 50
/** The most of what it has that a ranking spends before its fights scale down. */
export const RANK_SHARE = 0.4

// --- Running plans ---------------------------------------------------------------------------

/** Plans under their own keys, so a runner builds each engine once however many calls run it. */
export const planSources = (plans: readonly (() => Plan)[]): PlanSource[] => plans.map((plan) => ({ key: planKey(), plan }))

/**
 * Runs fights `from` … `from + count − 1` of every source, in jobs of at most 250, a few in flight a
 * lane, and returns each source's samples in order (index 0 is fight `from`). A fight's numbers
 * depend only on its plan and index, so how the jobs split or finish changes nothing.
 */
export async function runPlans(runner: FightRunner, plans: readonly PlanSource[] | readonly (() => Plan)[], count: number, signal?: AbortSignal, from = 0): Promise<FightSamples[]> {
  const sources: PlanSource[] = plans.map((p) => (typeof p === 'function' ? { key: planKey(), plan: p } : p))
  const out = sources.map(() => ({ dps: new Float64Array(count), tps: new Float64Array(count), taken: new Float64Array(count) }))
  const jobs: { i: number; from: number; count: number }[] = []
  for (let i = 0; i < sources.length; i++) for (let at = 0; at < count; at += 250) jobs.push({ i, from: at, count: Math.min(250, count - at) })
  let next = 0
  const lane = async () => {
    while (next < jobs.length) {
      if (signal?.aborted) throw new DOMException('The search was cancelled.', 'AbortError')
      const job = jobs[next++]
      const s = await runner.run(sources[job.i], from + job.from, job.count)
      out[job.i].dps.set(s.dps, job.from)
      out[job.i].tps.set(s.tps, job.from)
      out[job.i].taken.set(s.taken, job.from)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, runner.lanes * 2) }, lane))
  return out
}

const mean = (a: Float64Array) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)

// --- Stat weights ----------------------------------------------------------------------------

/**
 * A plan with a stat block field raised by `delta` (docs/optimizer.md#stat-weights): in the plan's
 * stat block, which the engine derives its numbers from, and in each druid form's; and the numbers
 * the plan builder derives once, before the fight (armor against the boss, the max health rage from
 * hits divides by, the mana pool), by the change the same derivation makes. Only for stat weights,
 * never an answer: every candidate the race runs is its own plan, built from its gear.
 */
export function perturbPlan(plan: Plan, field: FlatStat, delta: number, config: SimConfig): Plan {
  const out = structuredClone(plan)
  const options = { profile: PROFILES[config.rules.profile], applyUnmeasured: config.rules.unmeasuredRatings === 'apply', level: PLAYER_LEVEL }
  const before = deriveStats(out.stats, options)
  const blocks = new Set<StatBlock>([out.stats, ...(out.forms ?? []).map((f) => f.stats)])
  for (const block of blocks) (block as unknown as Record<string, number>)[field] += delta
  const after = deriveStats(out.stats, options)
  out.armor += after.armor - before.armor
  out.rage.maxHealth += after.health - before.health
  if (out.mana) out.mana.maxTenths += Math.round(10 * (after.mana - before.mana))
  return out
}

export interface WeightsMeasured {
  weights: StatWeights
  /** The fields that ran past the pilot: the engine reads them (the rest weigh 0). */
  live: FlatStat[]
  /** Each weight's 95% interval, score per point. */
  intervals: Partial<Record<FlatStat, Interval>>
  /** The change each field was measured with, up and down. */
  deltas: Partial<Record<FlatStat, number>>
  fights: number
}

/** Fights every field's plans run before a field the engine never reads is set aside (`measureStatWeights`). */
export const WEIGHT_PILOT = 50

/**
 * The setup's stat weights (docs/optimizer.md#stat-weights): each field's score per point, measured
 * as a central difference, the plan with the field raised by Δ against the plan with it lowered by
 * Δ, paired fight by fight, so a cap (hit past its cap) between them shows as the average slope
 * across it. Every field's two plans run a pilot of WEIGHT_PILOT fights first; a field whose two
 * plans give the same numbers on every one of them (spell damage for a warrior: the engine never
 * reads it) weighs 0 and runs no more.
 */
export async function measureStatWeights(options: {
  config: SimConfig
  candidate: Candidate
  deltas: Partial<Record<FlatStat, number>>
  goal: Goal
  runner: FightRunner
  fights: number
  signal?: AbortSignal
}): Promise<WeightsMeasured> {
  const { config, candidate, fights } = options
  const fields = (Object.keys(options.deltas) as FlatStat[]).sort()
  if (fields.length === 0) return { weights: {}, live: [], intervals: {}, deltas: {}, fights: 0 }
  const base = candidatePlan(config, candidate)
  const sources = planSources(fields.flatMap((field) => [1, -1].map((sign) => () => perturbPlan(base, field, sign * options.deltas[field]!, config))))
  const pilot = Math.min(fights, WEIGHT_PILOT)
  const first = await runPlans(options.runner, sources, pilot, options.signal)
  const same = (a: FightSamples, b: FightSamples) => a.dps.every((x, k) => x === b.dps[k] && a.tps[k] === b.tps[k] && a.taken[k] === b.taken[k])
  const live = fields.filter((_, i) => !same(first[2 * i], first[2 * i + 1]))
  const liveSources = live.flatMap((field) => {
    const i = fields.indexOf(field)
    return [sources[2 * i], sources[2 * i + 1]]
  })
  const rest = fights > pilot ? await runPlans(options.runner, liveSources, fights - pilot, options.signal, pilot) : []
  const joined = (i: number): FightSamples => {
    const j = live.indexOf(fields[Math.floor(i / 2)])
    const tail = j >= 0 && rest.length ? rest[2 * j + (i % 2)] : null
    if (!tail) return first[i]
    const cat = (a: Float64Array, b: Float64Array) => {
      const out = new Float64Array(a.length + b.length)
      out.set(a)
      out.set(b, a.length)
      return out
    }
    return { dps: cat(first[i].dps, tail.dps), tps: cat(first[i].tps, tail.tps), taken: cat(first[i].taken, tail.taken) }
  }
  const means = { dps: mean(first[0].dps), tps: mean(first[0].tps) }
  const score = scorer(options.goal, means)
  const weights: StatWeights = {}
  const intervals: WeightsMeasured['intervals'] = {}
  fields.forEach((field, i) => {
    if (!live.includes(field)) {
      weights[field] = 0
      intervals[field] = { mean: 0, halfWidth: 0 }
      return
    }
    const [up, down] = [joined(2 * i), joined(2 * i + 1)]
    const per = (s: FightSamples) => Float64Array.from({ length: fights }, (_, k) => score(s.dps[k], s.tps[k], s.taken[k]) / (2 * options.deltas[field]!))
    const interval = pairedInterval(per(up), per(down), fights)
    weights[field] = interval.mean
    intervals[field] = interval
  })
  return { weights, live, intervals, deltas: options.deltas, fights: sources.length * pilot + liveSources.length * Math.max(0, fights - pilot) }
}

/** The change each weighed field is measured with: the median of what the slots' items and enchants give, at least 1. */
export function weightDeltas(ctx: GearContext, pools: ReadonlyMap<GearSlot, readonly Item[]>): Partial<Record<FlatStat, number>> {
  const seen = new Map<FlatStat, number[]>()
  const note = (values: Map<FlatStat, number>) => {
    for (const [field, value] of values) if (value > 0) seen.set(field, [...(seen.get(field) ?? []), value])
  }
  const items = new Set([...pools.values()].flat())
  for (const item of items) if (weighedItem(ctx, item)) note(itemFieldValues(ctx, item))
  for (const enchant of ENCHANTS) if (weighedEnchant(enchant, ctx.profile) && enchant.slots.some((s) => pools.has(s))) note(enchantFieldValues(ctx, enchant))
  const out: Partial<Record<FlatStat, number>> = {}
  for (const [field, values] of seen) {
    values.sort((a, b) => a - b)
    out[field] = Math.max(1, values[Math.floor(values.length / 2)])
  }
  return out
}

// --- Rankings ---------------------------------------------------------------------------------

/** A measured swap: the gear set it runs, where its value goes, and the gear it's measured against. */
interface Swap {
  gear: Gear
  base: number
  into: { list: RankList; id: number } | { enchant: string }
}

/**
 * Prices every slot's items and enchants at the current gear (docs/optimizer.md#gear): the stat
 * weights for what's all flat stats, and a measured swap for the rest, each against the slot empty:
 * - a single slot's item: the gear with the slot empty, and with the item in it;
 * - a ring or trinket: the gear with both of the pair's slots empty, and with the item in the first;
 * - a two-hander or a one-hander in the main hand: the gear with no weapons, and with it alone;
 * - an off hand: the main hand's current one-hander (or the best measured one) alone, and with it;
 * - an enchant the weights can't price: the slot's current item unenchanted, and with it (none when
 *   it doesn't fit that item: a step then tries it on every item it fits).
 * A base that can't be simulated (a hunter with no ranged weapon) is replaced by the current gear,
 * so that list's values are against the current item instead: the same for all of them.
 */
export async function rankGear(options: {
  config: SimConfig
  candidate: Candidate
  ctx: GearContext
  pools: ReadonlyMap<GearSlot, readonly Item[]>
  goal: Goal
  runner: FightRunner
  weightFights: number
  measureFights: number
  /**
   * The values a ranking earlier in the start measured by a swap, kept rather than measured again:
   * a later pass re-measures only the stat weights (hit past its cap), since swaps cost the most.
   */
  reuse?: Rankings
  signal?: AbortSignal
}): Promise<{ rankings: Rankings; weights: WeightsMeasured; fights: number }> {
  const { config, candidate, ctx, pools, goal, runner, reuse } = options
  const gear: Gear = candidate.gear ?? config.gear
  const weights = await measureStatWeights({ config, candidate, deltas: weightDeltas(ctx, pools), goal, runner, fights: options.weightFights, signal: options.signal })
  const items = new Map<RankList, Map<number, number>>()
  const set = (list: RankList, id: number, value: number) => {
    if (!items.has(list)) items.set(list, new Map())
    items.get(list)!.set(id, value)
  }
  const enchants = new Map<string, number | null>()
  const excluded = new Set(ctx.filters.excludedEnchants ?? UNCONFIRMED_ENCHANTS)
  const searched = ENCHANTS.filter((e) => !excluded.has(e.id))
  for (const enchant of searched) if (weighedEnchant(enchant, ctx.profile)) enchants.set(enchant.id, weighValues(enchantFieldValues(ctx, enchant), weights.weights))

  // The swaps: bases first, then the gear sets measured against them.
  const bases: Gear[] = []
  const baseIndex = (g: Gear) => {
    const key = gearKey(g)
    const i = bases.findIndex((b) => gearKey(b) === key)
    if (i >= 0) return i
    bases.push(g)
    return bases.length - 1
  }
  const without = (g: Gear, ...slots: GearSlot[]) => {
    const next = { ...g }
    for (const s of slots) delete next[s]
    return next
  }
  const swaps: Swap[] = []
  const measure = (list: RankList, slotGear: Gear, into: GearSlot, item: Item) => {
    const kept = reuse?.items.get(list)?.get(item.id)
    if (kept !== undefined) set(list, item.id, kept)
    else swaps.push({ gear: { ...slotGear, [into]: { itemId: item.id } }, base: baseIndex(slotGear), into: { list, id: item.id } })
  }
  const locked = new Set(ctx.filters.locked ?? [])
  const currentMain = gear.mainHand ? POOL.get(gear.mainHand.itemId) : undefined
  for (const slot of SEARCHED_SLOTS) {
    if (locked.has(slot) || slot === 'offHand') continue
    // A ring or trinket pair is ranked once, through its first unlocked slot (O2L-2), against that
    // slot empty and the other as it is when it's locked, both empty when it isn't.
    const pair = PAIR_OF[slot]
    if (pair && pairRankSlot(slot, locked) !== slot) continue
    for (const item of pools.get(slot) ?? []) {
      const list = rankList(slot, item)
      if (weighedItem(ctx, item)) {
        set(list, item.id, weighValues(itemFieldValues(ctx, item), weights.weights))
        continue
      }
      const context = pair ? without(gear, ...pair.filter((s) => !locked.has(s))) : slot === 'mainHand' ? without(gear, 'mainHand', 'offHand') : without(gear, slot)
      measure(list, context, slot, item)
    }
  }
  // Enchants the weights can't price, on the slot's current item.
  for (const enchant of searched) {
    if (enchants.has(enchant.id)) continue
    if (reuse?.enchants.has(enchant.id)) {
      enchants.set(enchant.id, reuse.enchants.get(enchant.id)!)
      continue
    }
    const slot = enchant.slots.find((s) => gear[s] && !locked.has(s) && enchantsFor(s, POOL.get(gear[s]!.itemId)!).some((e) => e.id === enchant.id))
    if (!slot) {
      enchants.set(enchant.id, null)
      continue
    }
    const bare = { ...gear, [slot]: { itemId: gear[slot]!.itemId } }
    swaps.push({ gear: { ...gear, [slot]: { itemId: gear[slot]!.itemId, enchantId: enchant.id } }, base: baseIndex(bare), into: { enchant: enchant.id } })
  }
  let fights = weights.fights
  const run = async (list: Swap[]) => {
    if (list.length === 0) return
    const used = [...new Set(list.map((s) => s.base))]
    const plans = [...used.map((b) => bases[b]), ...list.map((s) => s.gear)].map((g) => () => candidatePlan(config, { ...candidate, gear: g }))
    // A base that can't be simulated is measured against the current gear instead.
    const runnable = plans.map((plan) => {
      try {
        plan()
        return plan
      } catch {
        return () => candidatePlan(config, candidate)
      }
    })
    const samples = await runPlans(runner, runnable, options.measureFights, options.signal)
    fights += runnable.length * options.measureFights
    const means = { dps: mean(samples[0].dps), tps: mean(samples[0].tps) }
    const score = scorer(goal, means)
    const total = (s: FightSamples) => {
      let t = 0
      for (let k = 0; k < options.measureFights; k++) t += score(s.dps[k], s.tps[k], s.taken[k])
      return t / options.measureFights
    }
    const baseScore = new Map(used.map((b, i) => [b, total(samples[i])]))
    list.forEach((swap, i) => {
      const value = total(samples[used.length + i]) - baseScore.get(swap.base)!
      if ('enchant' in swap.into) enchants.set(swap.into.enchant, value)
      else set(swap.into.list, swap.into.id, value)
    })
  }
  await run(swaps)

  // The off hands: beside the current one-hander, or the best measured one when the main hand holds none.
  if (!locked.has('offHand')) {
    const offPool = pools.get('offHand') ?? []
    const main = currentMain && !isTwoHand(currentMain) ? currentMain : bestOf(items.get('mainHand'))
    const context = main ? { ...without(gear, 'offHand'), mainHand: { itemId: main.id } } : without(gear, 'offHand')
    const offSwaps: Swap[] = []
    for (const item of offPool) {
      const kept = reuse?.items.get('offHand')?.get(item.id)
      if (weighedItem(ctx, item)) set('offHand', item.id, weighValues(itemFieldValues(ctx, item), weights.weights))
      else if (kept !== undefined) set('offHand', item.id, kept)
      else offSwaps.push({ gear: { ...context, offHand: { itemId: item.id } }, base: baseIndex(context), into: { list: 'offHand', id: item.id } })
    }
    await run(offSwaps)
  }
  return { rankings: { items, enchants, weights: weights.weights }, weights, fights }
}

const bestOf = (values: Map<number, number> | undefined) => {
  if (!values) return undefined
  let best: [number, number] | undefined
  for (const [id, v] of values) if (!best || v > best[1] || (v === best[1] && id < best[0])) best = [id, v]
  return best ? POOL.get(best[0]) : undefined
}

/** How many plans a ranking runs at most (its cost is these times their fights; the stat weights' pilot sets many aside): for the budget, before it runs. */
export function rankingPlans(ctx: GearContext, pools: ReadonlyMap<GearSlot, readonly Item[]>): { weightPlans: number; measurePlans: number } {
  const weightPlans = 2 * Object.keys(weightDeltas(ctx, pools)).length
  const locked = new Set(ctx.filters.locked ?? [])
  let measurePlans = 0
  for (const slot of SEARCHED_SLOTS) {
    if (locked.has(slot) || (PAIR_OF[slot] && pairRankSlot(slot, locked) !== slot)) continue
    const measured = (pools.get(slot) ?? []).filter((i) => !weighedItem(ctx, i)).length
    if (measured > 0) measurePlans += measured + 1
  }
  measurePlans += ENCHANTS.filter((e) => !weighedEnchant(e, ctx.profile)).length + 4
  return { weightPlans, measurePlans }
}

// --- The ascent ------------------------------------------------------------------------------

export interface GearSearchOptions extends GroupOptions {
  config: SimConfig
  goal?: Goal
  /** The talents and rotation the gear is searched with, and the gear the first start begins from (default: the setup). */
  start?: Candidate
  filters?: GearFilters
  constraints?: readonly Constraint[]
  /** What relative sheet constraints are shares of (default: a tank's survival preset, else the baseline; D30). */
  reference?: SimConfig
  /** Fights for the whole gear search: the rankings, every step's race and the final race. */
  budget: Budget
  /** The hard ceiling (default MAX_SEARCH_FIGHTS); the budget never passes it. */
  maxFights?: number
  runner: FightRunner
  /** Restart from the default preset and from a greedy set too (default yes). */
  restarts?: boolean
  /** Most passes a start runs (default GEAR_PASSES). */
  passes?: number
  weightFights?: number
  measureFights?: number
  top?: number
  signal?: AbortSignal
  onProgress?: (progress: GearProgress) => void
}

export type StartName = 'setup' | 'default' | 'greedy'

export type GearProgress =
  | { phase: 'rank'; start: StartName; pass: number; fights: number; spent: number; budget: number }
  | { phase: 'step'; start: StartName; pass: number; group: GearGroup; candidates: number; changed: boolean; fights: number; spent: number; budget: number }
  | { phase: 'final'; ends: number; spent: number; budget: number }

export interface GearStep {
  pass: number
  group: GearGroup
  /** Gear sets raced beside the current one (left out for a sheet constraint included). */
  candidates: number
  changed: boolean
  fights: number
  /** The step's race ended separated, on its budget, or with no candidate meeting the constraints. */
  status: 'separated' | 'budget' | 'none'
}

export interface GearStart {
  name: StartName
  gear: Gear
  /** Where the ascent ended. */
  end: Gear
  passes: number
  /** A pass changed nothing (false: the passes or the budget ran out first). */
  stable: boolean
  steps: GearStep[]
  /** The last pass's stat weights. */
  weights?: WeightsMeasured
  /** The start's fights: its rankings and steps (the setup's start's first ranking is the search's, `GearReport.ranking`). */
  fights: number
}

export interface GearReport {
  spec: SimConfig['spec']
  goal: Goal
  scoredGoal: Goal
  seed: number
  filters: GearFilters
  starts: GearStart[]
  /**
   * The first ranking, at the setup's gear: its stat weights with their intervals, the most fights any
   * ranking runs, and its fights. Its swaps serve every start, so it's budgeted from the whole search (O2L-3).
   */
  ranking: { weights: WeightsMeasured; fights: number; weightFights: number; measureFights: number }
  /** The race among the starts' ends (and the setup), whose leader is the answer. */
  final: OptimizeReport | null
  /** The answer: the final race's leader, the setup's talents and rotation with the gear it found. Null when no gear set meets the constraints. */
  answer: Candidate | null
  budget: { fights: number; cap: number }
  notes: string[]
  fights: number
  ms: number
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)
const fmt = (x: number) => x.toLocaleString('en-US')

/** A tank's survival preset, what the effective-health floor is a share of in a gear search (D30): the pre-raid list's gear, the setup's talents and buffs. */
export function survivalReference(config: SimConfig): SimConfig {
  return { ...config, gear: preRaidListGear(config.spec, config.race) }
}

/** The slots' pools under the filters, the current items aside. */
export function gearPools(ctx: GearContext): Map<GearSlot, readonly Item[]> {
  const pools = new Map<GearSlot, readonly Item[]>()
  for (const slot of SEARCHED_SLOTS) pools.set(slot, slotPool(ctx, slot))
  return pools
}

/**
 * The gear search (docs/optimizer.md#gear): from each start (the setup's gear; then the default
 * preset's and a greedy set by the first ranking, when they differ), passes over the groups in
 * paper-doll order, each group's gear sets raced beside the current one, the leader kept, until a
 * pass changes nothing. Then the starts' ends race, with the setup, and the leader is the answer.
 */
export async function optimizeGear(options: GearSearchOptions): Promise<GearReport> {
  const began = now()
  const { config, runner, signal } = options
  const meta = SPEC_META[config.spec]
  const goal = options.goal ?? defaultGoal(meta.role)
  const scored = scoredGoal(goal, meta.role)
  const filters = options.filters ?? {}
  const ctx = gearContext(config, filters)
  const pools = gearPools(ctx)
  const cap = options.maxFights ?? MAX_SEARCH_FIGHTS
  const notes: string[] = []
  const reference = options.reference ?? (meta.role === 'tank' ? survivalReference(config) : undefined)
  const constraints = options.constraints ?? []
  const base = options.start ?? setupCandidate(config)
  const passes = options.passes ?? GEAR_PASSES
  let spent = 0

  // The rankings' fights (O2L-3, O2L-8). A ranking runs every stat field's two plans through the pilot,
  // the fields the engine reads (the last ranking's live ones) the rest of the way, and, the first
  // time, every measured swap. It spends at most RANK_SHARE of what it has; past that its fights
  // scale down, to MIN_RANK_FIGHTS a plan at least (or the caller's fewer).
  const wf0 = options.weightFights ?? WEIGHT_FIGHTS
  const mf0 = options.measureFights ?? MEASURE_FIGHTS
  const { weightPlans, measurePlans } = rankingPlans(ctx, pools)
  const rankCost = (wf: number, mf: number, livePlans: number, swaps: boolean) =>
    weightPlans * Math.min(wf, WEIGHT_PILOT) + livePlans * Math.max(0, wf - WEIGHT_PILOT) + (swaps ? measurePlans * mf : 0)
  const least = (x: number) => Math.min(x, MIN_RANK_FIGHTS)
  const minRankCost = (livePlans: number, swaps: boolean) => rankCost(least(wf0), least(mf0), livePlans, swaps)
  const rankFights = (budget: number, livePlans: number, swaps: boolean) => {
    const full = rankCost(wf0, mf0, livePlans, swaps)
    if (full <= RANK_SHARE * budget) return { wf: wf0, mf: mf0, scaled: false }
    const lo = minRankCost(livePlans, swaps)
    const share = full > lo ? Math.max(0, Math.min(1, (RANK_SHARE * budget - lo) / (full - lo))) : 0
    return { wf: least(wf0) + Math.floor(share * (wf0 - least(wf0))), mf: least(mf0) + Math.floor(share * (mf0 - least(mf0))), scaled: true }
  }

  // The hard ceiling (D30, O2L-3): the first ranking's fewest fights must fit the cap, before any run.
  const firstMin = minRankCost(weightPlans, true)
  if (firstMin > cap)
    throw new SearchTooLargeError(
      `The gear search's first ranking needs at least ${fmt(firstMin)} fights (${fmt(weightPlans)} stat-weight plans and ${fmt(measurePlans)} measured swaps at ${MIN_RANK_FIGHTS} each), more than the cap of ${fmt(cap)}: lock slots, narrow the item level or the sources, or raise the cap.`,
    )
  let total = Math.min(options.budget.fights, cap)
  if (options.budget.fights > cap) notes.push(`The budget of ${fmt(options.budget.fights)} fights passes the cap of ${fmt(cap)}: the gear search runs at most ${fmt(cap)}.`)
  if (firstMin > total) {
    notes.push(`The budget of ${fmt(total)} fights doesn't cover the first ranking's ${fmt(firstMin)}: it grows to that, within the cap, and leaves the steps nothing.`)
    total = firstMin
  }
  const ascentBudget = Math.floor(total * (1 - FINAL_SHARE))

  // The first ranking, at the setup's gear: its swaps are measured once a search and serve every start
  // (every later ranking re-measures only the stat weights), so it's budgeted from the whole search,
  // not from the setup's start's share (O2L-3).
  const setupGear = base.gear ?? config.gear
  const firstFights = rankFights(ascentBudget, weightPlans, true)
  if (firstFights.scaled)
    notes.push(`The budget scales the first ranking down to ${fmt(firstFights.wf)} fights a stat weight's plan and ${fmt(firstFights.mf)} a measured swap.`)
  const first = await rankGear({ config, candidate: { ...base, gear: setupGear }, ctx, pools, goal: scored, runner, weightFights: firstFights.wf, measureFights: firstFights.mf, signal })
  spent += first.fights
  options.onProgress?.({ phase: 'rank', start: 'setup', pass: 1, fights: first.fights, spent, budget: total })
  const measured = first.rankings

  const ascend = async (name: StartName, startGear: Gear, budget: number, ranked?: Awaited<ReturnType<typeof rankGear>>): Promise<GearStart> => {
    let gear = startGear
    let used = 0
    const steps: GearStep[] = []
    let weights: WeightsMeasured | undefined = ranked?.weights
    let stable = false
    let pass = 0
    const out = (): GearStart => ({ name, gear: startGear, end: gear, passes: Math.min(pass, passes), stable, steps, ...(weights ? { weights } : {}), fights: used })
    const groups = GEAR_GROUPS.filter((g) => g === 'sets' || GROUP_SLOTS[g].some((s) => !(filters.locked ?? []).includes(s)))
    for (pass = 1; pass <= passes; pass++) {
      let rankings: Rankings
      if (pass === 1 && ranked) rankings = ranked.rankings
      else {
        // A later ranking re-measures the stat weights only, priced from the last one's live fields (O2L-8).
        const livePlans = 2 * (weights?.live.length ?? Object.keys(measured.weights).length)
        const needs = minRankCost(livePlans, false)
        if (needs > budget - used) {
          notes.push(`${name}: the budget ran out at pass ${pass}'s ranking: it needs ${fmt(needs)} fights, and the start has ${fmt(Math.max(0, budget - used))} left.`)
          return out()
        }
        const fights = rankFights(budget - used, livePlans, false)
        const again = await rankGear({ config, candidate: { ...base, gear }, ctx, pools, goal: scored, runner, weightFights: fights.wf, measureFights: fights.mf, reuse: measured, signal })
        rankings = again.rankings
        weights = again.weights
        used += again.fights
        spent += again.fights
        options.onProgress?.({ phase: 'rank', start: name, pass, fights: again.fights, spent, budget: total })
      }
      let changed = false
      for (let g = 0; g < groups.length; g++) {
        const group = groups[g]
        const gears = groupGears(ctx, group, gear, rankings, pools, options)
        if (gears.length === 0) continue
        // Each step gets its share of what the start has left: this pass's remaining groups and one more pass.
        const stepBudget = Math.max(0, Math.floor((budget - used) / (groups.length - g + groups.length)))
        // Too few for the step's gear sets, the current one and the baseline to run a first round: the start ends here.
        if ((gears.length + 2) * MIN_FIRST_ROUND > 0.9 * stepBudget) {
          notes.push(`${name}: the budget ran out at pass ${pass}, ${group}: its ${fmt(gears.length)} gear sets need more than the ${fmt(stepBudget)} fights left for the step.`)
          return out()
        }
        let report: OptimizeReport
        try {
          report = await optimize({
            config,
            goal,
            start: { ...base, gear },
            gears,
            constraints,
            ...(reference ? { reference } : {}),
            budget: { fights: stepBudget },
            maxFights: stepBudget,
            runner,
            top: 3,
            signal,
          })
        } catch (error) {
          if (!(error instanceof SearchTooLargeError)) throw error
          notes.push(`${name}: the budget ran out at pass ${pass}, ${group} (${error.message})`)
          return out()
        }
        used += report.fights
        spent += report.fights
        const leader = report.race.leader === null ? null : report.candidates[report.race.leader]
        const next = leader ? (leader.gear ?? config.gear) : gear
        const moved = gearKey(next) !== gearKey(gear)
        if (moved) {
          gear = next
          changed = true
        }
        steps.push({ pass, group, candidates: report.candidates.length - 1, changed: moved, fights: report.fights, status: report.race.status })
        options.onProgress?.({ phase: 'step', start: name, pass, group, candidates: gears.length, changed: moved, fights: report.fights, spent, budget: total })
      }
      if (!changed) {
        stable = true
        break
      }
    }
    return out()
  }

  const starts: GearStart[] = []
  const restarts = options.restarts ?? true
  const afterRanking = Math.max(0, ascentBudget - first.fights)
  // The setup's start: a third of what the first ranking left the ascents, or all of it without restarts.
  starts.push(await ascend('setup', setupGear, restarts ? Math.floor(afterRanking / 3) : afterRanking, first))
  if (restarts) {
    const presetGear = preRaidDefault(config)
    const greedy = greedyGear(ctx, setupGear, measured, pools)
    const tried = new Set([gearKey(setupGear)])
    const next: [StartName, Gear][] = []
    if (!tried.has(gearKey(presetGear)) && gearProblems(ctx, presetGear).length === 0) {
      next.push(['default', presetGear])
      tried.add(gearKey(presetGear))
    }
    if (!tried.has(gearKey(greedy))) next.push(['greedy', greedy])
    for (let i = 0; i < next.length; i++) {
      const [name, g] = next[i]
      const left = ascentBudget - spent
      if (left <= 0) {
        notes.push(`${name}: no budget left for this restart.`)
        break
      }
      starts.push(await ascend(name, g, Math.floor(left / (next.length - i))))
    }
  }

  // The final race: every start's end, beside the setup.
  const ends = [...new Map(starts.map((s) => [gearKey(s.end), s.end])).values()]
  options.onProgress?.({ phase: 'final', ends: ends.length, spent, budget: total })
  const finalBudget = Math.max(0, total - spent)
  let final: OptimizeReport | null = null
  try {
    final = await optimize({
      config,
      goal,
      start: { ...base, gear: ends[0] },
      gears: ends.slice(1),
      constraints,
      ...(reference ? { reference } : {}),
      budget: { fights: finalBudget },
      maxFights: Math.max(0, cap - spent),
      runner,
      top: options.top,
      signal,
    })
    spent += final.fights
  } catch (error) {
    if (!(error instanceof SearchTooLargeError)) throw error
    notes.push(`The final race didn't fit what was left of the budget (${error.message}); the setup's start's end is the answer, unraced.`)
  }
  const answer = final ? (final.race.leader === null ? null : final.candidates[final.race.leader]) : { ...base, gear: starts[0].end }
  return {
    spec: config.spec,
    goal,
    scoredGoal: scored,
    seed: config.run.seed,
    filters,
    starts,
    ranking: { weights: first.weights, fights: first.fights, weightFights: firstFights.wf, measureFights: firstFights.mf },
    final,
    answer,
    budget: { fights: total, cap },
    notes,
    fights: spent,
    ms: now() - began,
  }
}

/** The spec's default preset for the setup's race (its interim set where it has one): the restart D30's build plan names. */
const preRaidDefault = (config: SimConfig): Gear => defaultGear(config.spec, config.race)

// --- Talents, gear and rotation together -----------------------------------------------------

export type PassKind = 'talents' | 'gear' | 'rotation'

export interface TogetherPass {
  kind: PassKind
  /** A talent or rotation pass's report, or a gear pass's. */
  report: OptimizeReport | GearReport
  /** Where the pass ended: the start of the next. */
  answer: Candidate | null
  moved: boolean
}

/**
 * Talents, gear and rotation in turns until stable (docs/optimizer.md#talents-gear-and-rotation-together):
 * a talent pass with the start's gear and rotation, a gear pass with the winning build, a rotation
 * pass (when there are variants) with both, and again, until a whole cycle moves nothing, `cycles`
 * run out, or a pass has no answer. Every pass holds every candidate to every constraint, a tank's
 * effective-health floor against its survival preset throughout. Each pass but the last gets what
 * the passes before it left of the cap, less a tenth held back (as a search in turns, OGV2-4).
 */
export async function optimizeTogether(
  options: OptimizeOptions & {
    filters?: GearFilters
    gearOptions?: Partial<Pick<GearSearchOptions, 'restarts' | 'passes' | 'perSlot' | 'enchantsPerItem' | 'weightFights' | 'measureFights'>>
    /** Most cycles of talents, gear and rotation (default 3). */
    cycles?: number
    onPass?: (pass: TogetherPass, index: number) => void
    onGearProgress?: (progress: GearProgress) => void
  },
): Promise<TogetherPass[]> {
  const { config } = options
  const meta = SPEC_META[config.spec]
  const cap = options.maxFights ?? MAX_SEARCH_FIGHTS
  const reference = options.reference ?? (meta.role === 'tank' ? survivalReference(config) : undefined)
  const kinds: PassKind[] = ['talents', 'gear', ...(options.rotations?.length ? (['rotation'] as const) : [])]
  const cycles = options.cycles ?? 3
  const out: TogetherPass[] = []
  let start: Candidate = options.start ?? setupCandidate(config)
  let spent = 0
  let still = 0
  const total = cycles * kinds.length
  for (let i = 0; i < total; i++) {
    const kind = kinds[i % kinds.length]
    const left = cap - spent
    const share = i < total - 1 ? Math.floor(left * (1 - TURNS_RESERVE)) : left
    if (share <= 0) break
    let report: OptimizeReport | GearReport
    let answer: Candidate | null
    try {
      if (kind === 'gear') {
        report = await optimizeGear({
          ...(options.gearOptions ?? {}),
          config,
          goal: options.goal,
          start,
          filters: options.filters,
          constraints: options.constraints,
          ...(reference ? { reference } : {}),
          budget: options.budget,
          maxFights: share,
          runner: options.runner,
          top: options.top,
          signal: options.signal,
          onProgress: options.onGearProgress,
        })
        answer = report.answer
      } else {
        report = await optimize({
          ...options,
          ...(reference ? { reference } : {}),
          start,
          maxFights: share,
          ...(kind === 'talents' ? { rotations: [], screenRotations: options.rotations } : { talents: { ...(options.talents ?? {}), fixedBuild: true } }),
        })
        answer = report.race.leader === null ? null : report.candidates[report.race.leader]
      }
    } catch (error) {
      if (i === 0 || !(error instanceof SearchTooLargeError)) throw error
      break
    }
    spent += report.fights
    const moved = answer !== null && candidateKey(config, answer) !== candidateKey(config, start)
    const pass = { kind, report, answer, moved }
    out.push(pass)
    options.onPass?.(pass, i)
    if (answer === null) break
    start = answer
    still = moved ? 0 : still + 1
    // A whole cycle with nothing moved: stable.
    if (still >= kinds.length) break
  }
  return out
}
