// The per-chunk runner (decision D15: fixed-size chunks, merged in chunk order).
//
// A pure function of (plan, chunk index, fight count): fight i of chunk c is global fight
// c × CHUNK_SIZE + i and seeds its own random streams from that index, so a chunk's result is
// the same wherever it runs, a worker or the main thread, and whatever else ran before it.
import { addSample, emptyMoments, type Moments } from '../core/welford'
import type { Plan } from '../plan/types'
import { Sim } from './sim'

/** Fights per chunk. Also the granularity of the adaptive stopping rule. */
export const CHUNK_SIZE = 250

export interface ChunkResult {
  chunk: number
  fights: number
  dps: Moments
  tps: Moments
  /** Sum of simulated fight lengths, ms. */
  durationMs: number
  /** Per-source totals (sources × FIELD_COUNT). */
  counters: Float64Array
  /** Time each plan aura was up, ms, summed over the chunk's fights (Sim.auraUpMs). */
  auraUpMs: Float64Array
  /** Rage gained and lost to the cap, tenths (diagnostics). */
  rageGainedTenths: number
  rageWastedTenths: number
  /** Health lost per second to hits taken, one sample per fight (the tank results' damage taken). */
  damageTaken: Moments
  /** The boss's swings by outcome (Sim.bossOutcomes: miss, dodge, parry, block, crit, crush, hit). */
  bossOutcomes: Float64Array
}

export function runChunk(plan: Plan, chunk: number, fights: number, sim: Sim = new Sim(plan)): ChunkResult {
  sim.counters.fill(0)
  sim.auraUpMs.fill(0)
  sim.bossOutcomes.fill(0)
  sim.totalRageGainedTenths = 0
  sim.totalRageWastedTenths = 0
  sim.totalEnergyGainedTenths = 0
  sim.totalEnergyWastedTenths = 0
  sim.totalManaSpentTenths = 0
  sim.totalManaGainedTenths = 0
  const dps = emptyMoments()
  const tps = emptyMoments()
  const damageTaken = emptyMoments()
  let durationMs = 0
  const first = chunk * CHUNK_SIZE
  for (let i = 0; i < fights; i++) {
    sim.runFight(first + i)
    const seconds = sim.fightMs / 1000
    addSample(dps, sim.fightDamage / seconds)
    addSample(tps, sim.fightThreat / seconds)
    addSample(damageTaken, sim.fightDamageTaken / seconds)
    durationMs += sim.fightMs
  }
  return {
    chunk,
    fights,
    dps,
    tps,
    durationMs,
    counters: sim.counters.slice(),
    auraUpMs: sim.auraUpMs.slice(),
    rageGainedTenths: sim.totalRageGainedTenths,
    rageWastedTenths: sim.totalRageWastedTenths,
    damageTaken,
    bossOutcomes: sim.bossOutcomes.slice(),
  }
}
