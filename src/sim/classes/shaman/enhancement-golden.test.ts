// The Enhancement golden run (docs/doctrine.md#4-engine: fixed-seed goldens guard against
// regressions): the default setup, 1,000 fights on seed 12345, as the warriors' in
// engine/engine.test.ts and the paladin's in retribution-golden.test.ts, and its mana over the
// fight. Its own file and snapshot. And a single-core benchmark, as the paladin's.
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
  // - S1: the default Enhancement shaman (shaman.md "Enhancement priority", "First-pass defaults"):
  //   Orc, 050003-055030031005102251-05005, The Unstoppable Force with Windfury Weapon, Blood Fury,
  //   Rage of the Farseer and Earthstrike on cooldown, Stormstrike, Lightning Bolt at 5 Maelstrom
  //   Weapon stacks, Earth Shock from 10% mana, the Major Mana Potion at 2,250 missing; Flurry's
  //   500 ms charge rule carried into the plan (it was dropped before this snapshot). On this seed's
  //   1,000 fights, DPS 556.06 and TPS 394.92 (Blessing of Salvation’s −30%); 3,925 mana, 9,771 spent a fight.
  // - Caster racials (issue #10): the shaman's Blood Fury is the casters' (caster-racials.ts), its
  //   +10% spell power a live multiplier, so Earth Shock and Lightning Bolt get it too (the warrior's
  //   had attack power only): DPS 556.06 → 556.16, TPS 394.92 → 394.99 (20,000 fights: 555.84 →
  //   555.94, ± 0.63).
  // - D36, pre-Ahn'Qiraj ranks (W2): the raid's buffs at the trainers' ranks (Battle Shout r6 +115, Blessing of Might r6 +112, Strength of Earth r4 +42, Grace of Air r2 +77, Blessing of Wisdom r5 36 mp5), your own totems among them.
  //   556.16 → 539.17 DPS.
  // - The per-level term truncated, the datasets’ rendering by the same rule; how the client itself rounds it is [?] (B74) (docs/data/items.md#per-level-values):
  //   Lightning Bolt r10 + 4 (189.38–210.62). 539.17 → 539.12 DPS.
  // - Earth Shock's threat is 2 × its damage [?] (shaman.md open question 8; Classic Era's threat tools' value):
  //   TPS 383.20 → 423.53; DPS unchanged.
  it('keeps the default Enhancement shaman’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('shaman-enhancement'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const agg = runFights(bundle.plan, 1000)
    const result = toResult(bundle, agg, 0)
    expect({
      dps: result.dps,
      tps: result.tps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses, a.dodges, a.glances]),
      mana: result.mana,
    }).toMatchSnapshot()
  })
})

describe('benchmark', () => {
  // Procs, spells and mana as the paladin's: the same floor as the paladin's and the warriors'.
  it('runs at least 5,000 default Enhancement shaman fights per second on one core', () => {
    const plan = buildPlan(defaultConfig('shaman-enhancement')).plan
    const sim = new Sim(plan)
    runChunk(plan, 0, 500, sim) // warm up the JIT
    const fights = 10000
    const start = performance.now()
    for (let k = 0; k < fights / CHUNK_SIZE; k++) runChunk(plan, k, CHUNK_SIZE, sim)
    const perSecond = fights / ((performance.now() - start) / 1000)
    console.log(`benchmark: ${Math.round(perSecond)} fights/s (default Enhancement shaman, one core)`)
    // Shared CI runners are noisy; the real bar is checked locally.
    const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI
    expect(perSecond).toBeGreaterThanOrEqual(ci ? 1000 : 5000)
    // 10,500 fights at CI's 1,000 a second take 10.5 s: past vitest's 5 s default (engine.test.ts "benchmark").
  }, 30_000)
})
