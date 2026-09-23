// The Retribution golden run (docs/doctrine.md#4-engine: fixed-seed goldens guard against
// regressions): the default setup, 1,000 fights on seed 12345, as the warriors' in
// engine/engine.test.ts. Its own file and snapshot, apart from the warriors'.
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
  // - C2: the default Retribution paladin (paladin.md "Retribution: model and rotation"), added
  //   with its rotation and its tuned defaults (paladin.md "Tuning the defaults (C2)"), on C1's
  //   engine with its review fixes PC1–PC8: Seal of the Crusader before the pull and judged at the
  //   pull, Seal of Command and its judgement, Hammer of Wrath in the execute phase, Holy Strike,
  //   Consecration from 65% mana (rank 1 from 20%), and the Major Mana Potion once you're missing
  //   1,500 while another would still be ready (2,250 after that): 608.6 DPS over 400,000 fights.
  //   On this seed's 1,000 fights, DPS 609.76 and TPS 358.60.
  it('keeps the default Retribution paladin’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('paladin-retribution'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const agg = runFights(bundle.plan, 1000)
    const result = toResult(bundle, agg, 0)
    expect({
      dps: result.dps,
      tps: result.tps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses, a.dodges, a.glances]),
    }).toMatchSnapshot()
  })
})
