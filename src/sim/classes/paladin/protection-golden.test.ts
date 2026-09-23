// The Protection paladin golden run (docs/doctrine.md#4-engine: fixed-seed goldens guard against
// regressions): the default setup, 1,000 fights on seed 12345, as the warriors' in
// engine/engine.test.ts. Its own file and snapshot, apart from the warriors' and Retribution's.
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
  // - C3: the default Protection paladin (paladin.md "Protection: model and rotation"), added with
  //   its rotation and its tuned defaults (paladin.md "Tuning the defaults (C3)"), on C1's engine:
  //   Seal of Fury before the pull and again with 2 s left, Holy Shield whenever its buff is gone,
  //   Judgement of Fury with Swift Judgement right after it once a minute, Holy Strike,
  //   Consecration from 95% mana and Hammer of Wrath in the execute phase; Reckoning, Redoubt, and
  //   Improved Seal of Fury's mana from Seal of Fury's absorb. 338.74 TPS and 196.95 DPS over
  //   400,000 fights on seed 7331; on this seed's 1,000 fights, TPS 337.89 and DPS 196.70.
  it('keeps the default Protection paladin’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('paladin-protection'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const agg = runFights(bundle.plan, 1000)
    const result = toResult(bundle, agg, 0)
    expect({
      dps: result.dps,
      tps: result.tps,
      dtps: result.tank!.dtps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.threat, a.casts, a.hits, a.crits, a.misses, a.dodges, a.parries, a.blocks]),
      cooldowns: result.cooldowns.map((c) => [c.id, c.uptimePct, c.castsPerFight]),
    }).toMatchSnapshot()
  })
})
