// Merging chunk results and turning them into a SimResult (docs/architecture.md#engine-design-m1).
import { ci95, combine, emptyMoments, type Moments, stdev } from '../core/welford'
import type { ChunkResult } from '../engine/chunk'
import { BOSS_OUTCOME, BOSS_OUTCOME_COUNT, FIELD, FIELD_COUNT } from '../engine/sim'
import type { Plan, PlanBundle } from '../plan/types'
import type { AbilityResult, BossOutcomes, CooldownResult, SimResult, Summary, TankResult } from '../types'

export interface Aggregate {
  fights: number
  dps: Moments
  tps: Moments
  durationMs: number
  counters: Float64Array
  /** Time each plan aura was up, ms, over every fight merged. */
  auraUpMs: Float64Array
  rageGainedTenths: number
  rageWastedTenths: number
  /** Health lost per second to hits taken, per fight (the tank results' damage taken). */
  damageTaken: Moments
  /** The boss's swings by outcome, over every fight merged (Sim.bossOutcomes). */
  bossOutcomes: Float64Array
}

export const emptyAggregate = (sources: number, auras = 0): Aggregate => ({
  fights: 0,
  dps: emptyMoments(),
  tps: emptyMoments(),
  durationMs: 0,
  counters: new Float64Array(sources * FIELD_COUNT),
  auraUpMs: new Float64Array(auras),
  rageGainedTenths: 0,
  rageWastedTenths: 0,
  damageTaken: emptyMoments(),
  bossOutcomes: new Float64Array(BOSS_OUTCOME_COUNT),
})

/** Adds a chunk to the aggregate. Callers merge in chunk order, so the result is deterministic. */
export function mergeChunk(agg: Aggregate, chunk: ChunkResult): Aggregate {
  const counters = agg.counters
  for (let i = 0; i < counters.length; i++) counters[i] += chunk.counters[i]
  const auraUpMs = agg.auraUpMs
  for (let i = 0; i < auraUpMs.length; i++) auraUpMs[i] += chunk.auraUpMs[i]
  const bossOutcomes = agg.bossOutcomes
  for (let i = 0; i < bossOutcomes.length; i++) bossOutcomes[i] += chunk.bossOutcomes[i]
  return {
    fights: agg.fights + chunk.fights,
    dps: combine(agg.dps, chunk.dps),
    tps: combine(agg.tps, chunk.tps),
    durationMs: agg.durationMs + chunk.durationMs,
    counters,
    auraUpMs,
    rageGainedTenths: agg.rageGainedTenths + chunk.rageGainedTenths,
    rageWastedTenths: agg.rageWastedTenths + chunk.rageWastedTenths,
    damageTaken: combine(agg.damageTaken, chunk.damageTaken),
    bossOutcomes,
  }
}

const summary = (m: Moments): Summary => ({ mean: m.mean, stdev: stdev(m), ci95: ci95(m) })

/** Share of all simulated fight time that plan aura `a` was up, 0–100. */
const uptimePct = (agg: Aggregate, a: number) => (agg.durationMs > 0 ? (100 * agg.auraUpMs[a]) / agg.durationMs : 0)

/**
 * The results' "Cooldowns and buffs" (docs/ux.md#results): every cast the rotation can press, with
 * its casts per fight and its buff's uptime, in the rotation's order; then every other aura on the
 * player (procs such as Flurry, Enrage and Holy Strength, and reactive windows such as
 * Overpower's), with its uptime. A bleed's marker is on the target, so its uptime goes on the
 * bleed's breakdown row instead.
 */
export function cooldownResults(plan: Plan, agg: Aggregate): CooldownResult[] {
  const c = agg.counters
  const rows: CooldownResult[] = []
  const shown = new Set<number>()
  for (const ability of plan.abilities) {
    // An attack that also bleeds (Rake) has its bleed's marker too (druid.md §3.3).
    if ((ability.kind === 'bleed' || ability.dotSource !== undefined) && ability.aura >= 0) shown.add(ability.aura)
    // A druid's shapeshift is listed like a cast: its casts per fight, no buff (druid.md §2.8).
    if (ability.kind !== 'cast' && ability.kind !== 'shift') continue
    if (ability.aura >= 0) shown.add(ability.aura)
    rows.push({
      id: ability.id,
      name: ability.name,
      icon: ability.icon,
      uptimePct: ability.aura >= 0 ? uptimePct(agg, ability.aura) : null,
      castsPerFight: agg.fights > 0 ? c[ability.source * FIELD_COUNT + FIELD.casts] / agg.fights : 0,
    })
  }
  plan.auras.forEach((aura, i) => {
    if (shown.has(i)) return
    rows.push({ id: aura.id, name: aura.name, icon: aura.icon, uptimePct: uptimePct(agg, i), castsPerFight: null })
  })
  return rows
}

/**
 * What a tank reads from the fight (docs/mechanics/encounter.md#5-boss-melee-tank-modeling): damage
 * taken per second with its CI, the boss's swings per fight, and the share of them each outcome
 * took (combat-tables §8). Null when the boss attacks no one (DPS specs).
 */
export function tankResult(plan: Plan, agg: Aggregate): TankResult | null {
  if (!plan.fight.bossSwing) return null
  const o = agg.bossOutcomes
  let swings = 0
  for (let i = 0; i < o.length; i++) swings += o[i]
  const share = (k: keyof BossOutcomes) => (swings > 0 ? (100 * o[BOSS_OUTCOME[k]]) / swings : 0)
  return {
    dtps: summary(agg.damageTaken),
    bossSwingsPerFight: agg.fights > 0 ? swings / agg.fights : 0,
    outcomes: {
      miss: share('miss'),
      dodge: share('dodge'),
      parry: share('parry'),
      block: share('block'),
      crit: share('crit'),
      crush: share('crush'),
      hit: share('hit'),
    },
  }
}

export function toResult(bundle: PlanBundle, agg: Aggregate, elapsedMs: number): SimResult {
  const { plan } = bundle
  const c = agg.counters
  const abilities: AbilityResult[] = []
  plan.sources.forEach((source, i) => {
    const row = i * FIELD_COUNT
    const damage = c[row + FIELD.damage]
    const threat = c[row + FIELD.threat]
    // Rows that do nothing for the headline stay out of the breakdown.
    if (damage <= 0 && (plan.headline === 'dps' || threat <= 0)) return
    const result: AbilityResult = {
      id: source.id,
      name: source.name,
      icon: source.icon,
      damage,
      threat,
      casts: c[row + FIELD.casts],
      hits: c[row + FIELD.hits],
      crits: c[row + FIELD.crits],
      misses: c[row + FIELD.misses],
      dodges: c[row + FIELD.dodges],
      parries: c[row + FIELD.parries],
      glances: c[row + FIELD.glances],
      blocks: c[row + FIELD.blocks],
    }
    if (source.bleed) {
      // Rend's marker aura is up from an application until its last tick; Rake's is on its bleed's row.
      const marker = plan.abilities.find((a) => a.aura >= 0 && (a.kind === 'bleed' ? a.source === i : a.dotSource === i))
      result.bleed = { ...source.bleed, uptimePct: marker ? uptimePct(agg, marker.aura) : null }
    }
    abilities.push(result)
  })
  const tank = tankResult(plan, agg)
  return {
    spec: plan.spec,
    profile: plan.profile.id,
    iterations: agg.fights,
    durationSec: agg.fights > 0 ? agg.durationMs / agg.fights / 1000 : plan.fight.durationMs / 1000,
    dps: summary(agg.dps),
    tps: summary(agg.tps),
    abilities,
    cooldowns: cooldownResults(plan, agg),
    ...(tank ? { tank } : {}),
    sheet: bundle.sheet,
    assumptions: bundle.assumptions,
    elapsedMs,
  }
}
