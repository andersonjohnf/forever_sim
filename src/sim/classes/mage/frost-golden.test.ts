// The Frost mage golden run (docs/doctrine.md#4-engine: fixed-seed goldens guard against
// regressions): the default setup, 1,000 fights on seed 12345, as the Enhancement shaman's in
// shaman/enhancement-golden.test.ts, and its mana over the fight. Its own file and snapshot. And a
// single-core benchmark, as the shaman's, and determinism (D15).
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { toResult } from '../../run/aggregate'
import { drive } from '../../run/driver'
import { localExecutor } from '../../run/local'
import type { SimConfig } from '../../types'
import { racingExecutor, runFights } from './test-helpers'

const SPEC = 'mage-frost'

describe('golden run (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - K2: the default Frost mage (mage.md "Frost priority", "First-pass defaults"): Troll,
  //   230225200100301--055510033002000105, Presence of Mind and Berserking on cooldown, Frostbolt
  //   with Winter's Chill's stacks, the mana gems and Evocation; the Standard raid's buffs.
  // - The Destruction gear review (DG-2): the list's rank-1 Sageclaw gets its Horde twin, Mindfang, so a
  //   Troll wears it instead of Witchblade: 409.75 → 445.79 here; 410.9 → 447.3 over 20,000 fights on
  //   seed 2701 (+8.9%).
  // - The caster gear verification (GV-4): the head is re-ranked by the sim, so a Troll wears
  //   Spellweaver's Turban for Champion's Silk Cowl: 445.79 → 451.79 here; 447.3 → 453.0 over 20,000
  //   fights on seed 2701.
  // - D36, pre-Ahn'Qiraj ranks (W2): Frostbolt r10 (10181: 382.89–412.31, 260 mana) for r11 (457.24–492.76,
  //   290), and Blessing of Wisdom r5 (36 mp5). 451.79 → 414.14 DPS.
  // - The per-level term truncated, as the client renders it (docs/data/items.md#per-level-values):
  //   Frostbolt r10 adds trunc(11.6) = 11 (382.29–411.71). 414.14 → 413.82 DPS.
  it('keeps the default Frost mage’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig(SPEC), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
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

describe('determinism (D15)', () => {
  it('the same config and seed give the same result; another seed a different one', () => {
    const plan = buildPlan(defaultConfig(SPEC)).plan
    const a = runChunk(plan, 0, 100)
    const b = runChunk(buildPlan(structuredClone(defaultConfig(SPEC))).plan, 0, 100)
    expect(Array.from(b.counters)).toEqual(Array.from(a.counters))
    expect(b.dps).toEqual(a.dps)
    expect(runChunk({ ...plan, seed: plan.seed + 1 }, 0, 100).dps.mean).not.toBe(a.dps.mean)
  })

  it('gives bit-identical results on 1 and 3 workers, including a partial last chunk', async () => {
    const c: SimConfig = { ...defaultConfig(SPEC), run: { mode: 'fixed', iterations: 2 * CHUNK_SIZE + 100, seed: 42 } }
    const a = buildPlan(c).plan
    const b = buildPlan(structuredClone(c)).plan
    const one = await drive(a, localExecutor(a), { mode: 'fixed', iterations: c.run.iterations })
    const three = await drive(b, racingExecutor(b, 3), { mode: 'fixed', iterations: c.run.iterations })
    expect(one.fights).toBe(c.run.iterations)
    expect(three).toEqual(one)
  })
})

describe('benchmark', () => {
  // Spells, procs and mana as the shaman's: the same floor as the shaman's and the warriors'.
  it('runs at least 5,000 default Frost mage fights per second on one core', () => {
    const plan = buildPlan(defaultConfig(SPEC)).plan
    const sim = new Sim(plan)
    runChunk(plan, 0, 500, sim) // warm up the JIT
    const fights = 10000
    const start = performance.now()
    for (let k = 0; k < fights / CHUNK_SIZE; k++) runChunk(plan, k, CHUNK_SIZE, sim)
    const perSecond = fights / ((performance.now() - start) / 1000)
    console.log(`benchmark: ${Math.round(perSecond)} fights/s (default Frost mage, one core)`)
    // Shared CI runners are noisy; the real bar is checked locally.
    const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI
    expect(perSecond).toBeGreaterThanOrEqual(ci ? 1000 : 5000)
    // 10,500 fights at CI's 1,000 a second take 10.5 s: past vitest's 5 s default (engine.test.ts "benchmark").
  }, 30_000)
})
