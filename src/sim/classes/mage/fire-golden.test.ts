// The Fire mage golden run (docs/doctrine.md#4-engine: fixed-seed goldens guard against
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

const SPEC = 'mage-fire'

describe('golden run (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - K2: the default Fire mage (mage.md "Fire priority", "First-pass defaults"): Troll,
  //   230225-23550000130133051-005, Combustion (its stacks from each Fire hit) and Berserking on
  //   cooldown, Scorch for Improved Scorch's 5 stacks, Pyroblast on Hot Streak, Fire Blast, Fireball,
  //   the mana gems and Evocation; the Standard raid's buffs.
  // - EI-1 (September 2026): Scorch refreshes Fire Vulnerability early enough to land before it runs
  //   out after a 4.5 s Pyroblast (COND 44); Fireball waits up to 0.3 s for Fire Blast; Pyroblast
  //   waits up to 0.3 s so it doesn't cut off its own DoT's tick (COND 45). 513.15 → 514.50 DPS;
  //   Scorches 13.9 → 12.6 a fight (the stacks no longer drop and rebuild), Fire Blasts 19.8 → 20.2.
  it('keeps the default Fire mage’s result unchanged', () => {
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
  // Spells, procs, Ignite and mana as the shaman's: the same floor as the shaman's and the warriors'.
  it('runs at least 5,000 default Fire mage fights per second on one core', () => {
    const plan = buildPlan(defaultConfig(SPEC)).plan
    const sim = new Sim(plan)
    runChunk(plan, 0, 500, sim) // warm up the JIT
    const fights = 10000
    const start = performance.now()
    for (let k = 0; k < fights / CHUNK_SIZE; k++) runChunk(plan, k, CHUNK_SIZE, sim)
    const perSecond = fights / ((performance.now() - start) / 1000)
    console.log(`benchmark: ${Math.round(perSecond)} fights/s (default Fire mage, one core)`)
    // Shared CI runners are noisy; the real bar is checked locally.
    const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI
    expect(perSecond).toBeGreaterThanOrEqual(ci ? 1000 : 5000)
    // 10,500 fights at CI's 1,000 a second take 10.5 s: past vitest's 5 s default (engine.test.ts "benchmark").
  }, 30_000)
})
