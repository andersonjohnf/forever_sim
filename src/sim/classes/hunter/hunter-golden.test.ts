// The hunters' golden runs (docs/doctrine.md#4-engine: fixed-seed goldens guard against regressions):
// each spec's default setup, 1,000 fights on seed 12345, with its mana; determinism (the same config
// and seed give the same result, however the fights are split into chunks); and a single-core
// benchmark. Their own file and snapshot.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import type { Plan } from '../../plan/types'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'

function runFights(plan: Plan, fights: number, sim = new Sim(plan)): Aggregate {
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

const SPECS = ['hunter-marksmanship', 'hunter-beast-mastery', 'hunter-survival'] as const

describe('golden runs (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - H2: the default hunters (hunter.md §7, §8): Orc, the Hunter pre-raid list with Thorium Shells
  //   and the Gnoll Skin Bandolier, the Agility enchants, Standard raid; Marksmanship 10/41/0 with
  //   Lone Wolf (Aimed Shot waiting for Auto Shot, Serpent Sting), Beast Mastery 31/20/0 with its cat
  //   (Multi-Shot, Arcane Shot, Bestial Wrath), Survival 0/21/30 with its cat (Aimed Shot not
  //   waiting). On this seed's 1,000 fights: DPS in the snapshot.
  for (const spec of SPECS) {
    it(`keeps the default ${spec}’s result unchanged`, () => {
      const bundle = buildPlan({ ...defaultConfig(spec), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
      expect(bundle.blockers).toEqual([])
      const agg = runFights(bundle.plan, 1000)
      const result = toResult(bundle, agg, 0)
      expect({
        dps: result.dps,
        durationSec: result.durationSec,
        abilities: result.abilities.map((a) => [a.id, a.pet ?? null, a.damage, a.casts, a.hits, a.crits, a.misses]),
        cooldowns: result.cooldowns.map((c) => [c.id, c.castsPerFight, c.uptimePct]),
        mana: result.mana,
      }).toMatchSnapshot()
    })
  }
})

describe('determinism', () => {
  it('gives the same result for the same config and seed, from a fresh engine or a reused one, chunk by chunk or out of order', () => {
    for (const spec of SPECS) {
      const plan = buildPlan({ ...defaultConfig(spec), run: { mode: 'fixed', iterations: 750, seed: 7 } }).plan
      const a = runFights(plan, 750)
      const b = runFights(plan, 750)
      expect(b, spec).toEqual(a)
      // Chunks run in reverse on one reused engine, then merged in index order: the same.
      const sim = new Sim(plan)
      const chunks = [2, 1, 0].map((k) => [k, runChunk(plan, k, CHUNK_SIZE, sim)] as const).sort((x, y) => x[0] - y[0])
      let c = emptyAggregate(plan.sources.length, plan.auras.length)
      for (const [, chunk] of chunks) c = mergeChunk(c, chunk)
      expect(c, spec).toEqual(a)
      // Another seed changes it.
      const other = buildPlan({ ...defaultConfig(spec), run: { mode: 'fixed', iterations: 750, seed: 8 } }).plan
      expect(runFights(other, 750).counters, spec).not.toEqual(a.counters)
    }
  })
})

describe('benchmark', () => {
  it('runs at least 3,000 default Beast Mastery fights per second on one core (its pet included)', () => {
    const plan = buildPlan(defaultConfig('hunter-beast-mastery')).plan
    const sim = new Sim(plan)
    runChunk(plan, 0, 500, sim) // warm up the JIT
    const fights = 10000
    const start = performance.now()
    for (let k = 0; k < fights / CHUNK_SIZE; k++) runChunk(plan, k, CHUNK_SIZE, sim)
    const perSecond = fights / ((performance.now() - start) / 1000)
    console.log(`benchmark: ${Math.round(perSecond)} fights/s (default Beast Mastery hunter, one core)`)
    // Shared CI runners are noisy; the real bar is checked locally.
    const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI
    expect(perSecond).toBeGreaterThanOrEqual(ci ? 600 : 3000)
  }, 30_000)
})
