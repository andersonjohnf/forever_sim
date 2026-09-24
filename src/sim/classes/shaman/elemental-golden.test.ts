// The Elemental golden run (docs/doctrine.md#4-engine: fixed-seed goldens guard against
// regressions): the default setup, 1,000 fights on seed 12345, as the Enhancement shaman's in
// enhancement-golden.test.ts, and its mana over the fight. Its own file and snapshot. And a
// single-core benchmark.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import type { Plan } from '../../plan/types'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'

function runFights(plan: Plan, fights: number): Aggregate {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

describe('golden run (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - K5: the default Elemental shaman (shaman.md "Elemental priority", "Elemental first-pass
  //   defaults"): Orc, 5504301500103031-04-053250000001, Mindfang and the Scepter of Interminable
  //   Focus, Totem of the Storm; Blood Fury on cooldown, Mana Tide at 3,000 missing, the Major Mana
  //   Potion at 2,250, Flame Shock kept up, Lava Burst, Chain Lightning with Clearcasting, Lightning
  //   Bolt rank 10 from 10% mana and rank 4 below. On this seed's 1,000 fights, DPS 338.00 and TPS
  //   242.32 (Blessing of Salvation’s −30%); 4,735 mana, 13,994 spent a fight.
  // - T2 (M5.6): the caster food and oil reach the catalogue, and the Standard raid brings the buffs
  //   doc's §6.3 Elemental consumables, Nightfin Soup (+22 spell damage) and Brilliant Wizard Oil
  //   (+36 and +1% spell crit, on Mindfang): DPS 338.00 → 370.34, TPS 242.32 → 264.19.
  it('keeps the default Elemental shaman’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('shaman-elemental'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const agg = runFights(bundle.plan, 1000)
    const result = toResult(bundle, agg, 0)
    expect({
      dps: result.dps,
      tps: result.tps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses]),
      mana: result.mana,
    }).toMatchSnapshot()
  })
})

describe('benchmark', () => {
  // Spells, DoTs and mana: the same floor as the Enhancement shaman's.
  it('runs at least 5,000 default Elemental shaman fights per second on one core', () => {
    const plan = buildPlan(defaultConfig('shaman-elemental')).plan
    const sim = new Sim(plan)
    runChunk(plan, 0, 500, sim) // warm up the JIT
    const fights = 10000
    const start = performance.now()
    for (let k = 0; k < fights / CHUNK_SIZE; k++) runChunk(plan, k, CHUNK_SIZE, sim)
    const perSecond = fights / ((performance.now() - start) / 1000)
    console.log(`benchmark: ${Math.round(perSecond)} fights/s (default Elemental shaman, one core)`)
    // Shared CI runners are noisy; the real bar is checked locally.
    const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI
    expect(perSecond).toBeGreaterThanOrEqual(ci ? 1000 : 5000)
  }, 30_000)
})
