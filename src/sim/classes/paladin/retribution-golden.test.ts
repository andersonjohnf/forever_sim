// The Retribution golden run (docs/doctrine.md#4-engine: fixed-seed goldens guard against
// regressions): the default setup, 1,000 fights on seed 12345, as the warriors' in
// engine/engine.test.ts, and its mana over the fight. Its own file and snapshot, apart from the
// warriors'. And a single-core benchmark, as the warriors' (engine.test.ts "benchmark").
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
  // - C2's review (RU3, RL4): Prayer of Spirit and Arcane Brilliance join a paladin's Standard raid
  //   (buffs doc §6.2), +40 Spirit and +31 Intellect: 2,882 → 3,392 mana, DPS 622.56, TPS 365.78.
  //   The snapshot records the mana ledger too.
  // - C2's review, re-tuned on that setup (RL1, D23; paladin.md "Tuning the defaults (C2)"):
  //   Consecration from 60% (was 65%) and rank 1 from 15% (was 20%), +0.26% over 400,000 fights;
  //   Exorcism back at 20%, which the default setup (no creature type) doesn't use. On this seed,
  //   DPS 624.07 and TPS 367.10.
  // - T2 (P6): Holy Strike's flat 81–105 after its 40%, as its tooltip reads [?] (OQ 6): DPS 624.07 →
  //   632.76, TPS 367.10 → 371.98.
  // - 1.60.1.70009 (the new beta build; paladin.md "Retribution defaults"): its data and trees
  //   (Improved Holy Strike and Crusade removed, their points refunded), then its values: Holy Strike
  //   50% of a normalized swing every 10 s, Sacred Arbiter +20%, Vengeance at most 3 stacks from
  //   non-periodic crits, Two-Handed Weapon Specialization 2 / 4 / 6%, Twist of Light −20% on the
  //   seals; the refunded points placed by measured DPS (52003-503-05215331001330321: Divine Intellect
  //   2, Holy Conduit 1) and, re-checked on that setup (D27), Consecration from 40% (was 60%) and
  //   rank 1 from 20% (was 15%). On this seed's 1,000 fights: DPS 632.76 → 613.51, TPS 371.98 →
  //   361.01.
  // - The paladin review's PR-2 (paladin.md "The 1.60.1.70009 re-check"): the refunded points and the
  //   thresholds searched together, 51003-503-05225331001330321 (Divine Intellect 1, Holy Conduit 2),
  //   Consecration from 20% and rank 1 from 10% (cheaper Consecrations, 282 and 67 mana). On this
  //   seed's 1,000 fights: DPS 613.51 → 624.30, TPS 361.01 → 364.67.
  // - D36, pre-Ahn'Qiraj ranks (W2): the raid's buffs at the trainers' ranks (Battle Shout r6 +115, Blessing of Might r6 +112, Strength of Earth r4 +42, Grace of Air r2 +77, Blessing of Wisdom r5 36 mp5); your own Might is rank 6's +112.
  //   624.30 → 610.58 DPS.
  it('keeps the default Retribution paladin’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('paladin-retribution'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
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
  // Spells, mana and the seals' procs cost more per fight than a warrior's swings: the reviewer
  // measured about 9,000 fights a second on one core, like Fury's. The same floor as the warriors'.
  it('runs at least 5,000 default Retribution paladin fights per second on one core', () => {
    const plan = buildPlan(defaultConfig('paladin-retribution')).plan
    const sim = new Sim(plan)
    runChunk(plan, 0, 500, sim) // warm up the JIT
    // The best of three 10,000-fight runs: the full suite's own parallel workers share the cores,
    // and the best run is the one they slowed least, which is the engine's speed.
    const fights = 10000
    let perSecond = 0
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      for (let k = 0; k < fights / CHUNK_SIZE; k++) runChunk(plan, k, CHUNK_SIZE, sim)
      perSecond = Math.max(perSecond, fights / ((performance.now() - start) / 1000))
    }
    console.log(`benchmark: ${Math.round(perSecond)} fights/s (default Retribution paladin, one core)`)
    // Shared CI runners are noisy; the real bar is checked locally.
    const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI
    expect(perSecond).toBeGreaterThanOrEqual(ci ? 1000 : 5000)
    // 30,500 fights at CI's 1,000 a second take about 30 s: past vitest's 5 s default, which would
    // fail a run the floor above passes (engine.test.ts "benchmark").
  }, 60_000)
})
