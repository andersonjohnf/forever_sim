// The Shadow Priest's golden run (docs/doctrine.md#4-engine: fixed-seed goldens guard against
// regressions): the default setup, 1,000 fights on seed 12345, as the shaman's and the paladin's, with
// its mana over the fight; determinism (the same config and seed give the same result, however the
// fights are split into chunks); and a single-core benchmark. Its own file and snapshot.
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

describe('golden run (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - K4: the default Shadow Priest (priest.md §6, §7): Troll, 025300031303--500320501201312051,
  //   Shadowform, the Shadow pre-raid list with Greater Stats and Minor Haste, Standard raid
  //   (Greater Arcane Elixir, Elixir of Shadow Power, Major Mana Potion); Berserking, Shadow Word:
  //   Pain, Devouring Plague, Inner Focus before Mind Blast, Mind Flay's 3 ticks. On this seed's
  //   1,000 fights, DPS 523.04.
  it('keeps the default Shadow Priest’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('priest-shadow'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const agg = runFights(bundle.plan, 1000)
    const result = toResult(bundle, agg, 0)
    expect({
      dps: result.dps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses]),
      cooldowns: result.cooldowns.map((c) => [c.id, c.castsPerFight, c.uptimePct]),
      mana: result.mana,
    }).toMatchSnapshot()
  })
})

describe('determinism', () => {
  it('gives the same result for the same config and seed, from a fresh engine or a reused one, chunk by chunk or out of order', () => {
    const plan = buildPlan({ ...defaultConfig('priest-shadow'), run: { mode: 'fixed', iterations: 750, seed: 7 } }).plan
    const a = runFights(plan, 750)
    const b = runFights(plan, 750)
    expect(b).toEqual(a)
    // Chunks run in reverse on one reused engine, then merged in index order: the same.
    const sim = new Sim(plan)
    const chunks = [2, 1, 0].map((k) => [k, runChunk(plan, k, CHUNK_SIZE, sim)] as const).sort((x, y) => x[0] - y[0])
    let c = emptyAggregate(plan.sources.length, plan.auras.length)
    for (const [, chunk] of chunks) c = mergeChunk(c, chunk)
    expect(c).toEqual(a)
    // Another seed changes it.
    const other = buildPlan({ ...defaultConfig('priest-shadow'), run: { mode: 'fixed', iterations: 750, seed: 8 } }).plan
    expect(runFights(other, 750).counters).not.toEqual(a.counters)
  })
})

describe('benchmark', () => {
  it('runs at least 3,000 default Shadow Priest fights per second on one core', () => {
    const plan = buildPlan(defaultConfig('priest-shadow')).plan
    const sim = new Sim(plan)
    runChunk(plan, 0, 500, sim) // warm up the JIT
    const fights = 10000
    const start = performance.now()
    for (let k = 0; k < fights / CHUNK_SIZE; k++) runChunk(plan, k, CHUNK_SIZE, sim)
    const perSecond = fights / ((performance.now() - start) / 1000)
    console.log(`benchmark: ${Math.round(perSecond)} fights/s (default Shadow Priest, one core)`)
    // Shared CI runners are noisy; the real bar is checked locally.
    const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI
    expect(perSecond).toBeGreaterThanOrEqual(ci ? 600 : 3000)
  }, 30_000)
})
