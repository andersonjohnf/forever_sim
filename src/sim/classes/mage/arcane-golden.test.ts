// The Arcane mage golden run (docs/doctrine.md#4-engine: fixed-seed goldens guard against
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

const SPEC = 'mage-arcane'

describe('golden run (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - K2: the default Arcane mage (mage.md "Arcane priority", "First-pass defaults"): Troll,
  //   050225003100301531-2355001010003-, Arcane Power, Presence of Mind (an instant Pyroblast) and
  //   Berserking on cooldown, Arcane Missiles, the mana gems and Evocation; the Standard raid's buffs.
  // - Engine merge check EM-6: the list's rank-1 main hand gains its Horde twin, Mindfang, so the
  //   default Troll wears it in place of Witchblade (about +8%).
  // - 1.60.1.70009 (September 2026): Ignite's ticks no longer take Curse of the Elements again (the
  //   crit carries it). 402.71 → 402.62 DPS: Ignite, fed by Presence of Mind's Pyroblasts, −9.1%.
  // - The 70009 casters merge (September 2026): both changes above together, re-taken on the merge.
  //   Mindfang (EM-6) with Ignite's single Curse of the Elements (70009): 435.43 → 435.33 DPS,
  //   Ignite 195,274 → 177,522 damage (−9.1%), as each side measured alone.
  // - The Destruction gear review (DG-2): Mindfang, Sageclaw's Horde twin, replaces Witchblade for a
  //   Troll: 402.71 → 435.43 here; 402.2 → 434.8 over 20,000 fights on seed 2701 (+8.1%). This is the
  //   same change as EM-6 above, not a second one: main's engine merge check added Mindfang by hand
  //   (EM-6) and the gear slice's derived twins gave it again (DG-2), so the snapshot moved once.
  // - The caster gear verification (GV-4): the head is re-ranked by the sim, so a Troll wears
  //   Spellweaver's Turban for Champion's Silk Cowl: 435.43 → 440.93 here; 434.8 → 440.5 over 20,000
  //   fights on seed 2701.
  // - The 70009 integration (the casters' and the caster gear slices merged): Ignite's single Curse of
  //   the Elements with the Turban (GV-4); both sides already had Mindfang. 435.33 (casters alone) /
  //   440.93 (gear alone) → 440.84 DPS. Checked both ways: with either side's code reverted, the
  //   other side's snapshot reproduces exactly.
  // - D36, pre-Ahn'Qiraj ranks (W2): Arcane Missiles r7 (10212: 595 mana, missiles of 174.6) for r8 (655,
  //   209), Frostbolt r10 and Fireball r11, and Blessing of Wisdom r5 (36 mp5). 440.84 → 399.64 DPS.
  // - The per-level term truncated, the datasets’ rendering by the same rule; how the client itself rounds it is [?] (B74) (docs/data/items.md#per-level-values): each
  //   Arcane Missile 174 (171 + trunc(3.6)). 399.64 → 398.88 DPS.
  // - Epic caster weapons take their Classic Era item's spell power (docs/data/client.md#weapon-damage):
  //   Mindfang +30, not the Rare rule's extrapolated +94. 398.88 → 374.47 DPS.
  // - EL-2: a Horde caster wears Whiteout Staff (+74 spell power, Frostwolf Clan Revered), which the sim
  //   ranks above Mindfang and the off hand (docs/data/items.md#pre-raid-bis-lists): 374.47 → 377.45 DPS.
  it('keeps the default Arcane mage’s result unchanged', () => {
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
  // Spells, channels, procs and mana as the shaman's: the same floor as the shaman's and the warriors'.
  it('runs at least 5,000 default Arcane mage fights per second on one core', () => {
    const plan = buildPlan(defaultConfig(SPEC)).plan
    const sim = new Sim(plan)
    runChunk(plan, 0, 500, sim) // warm up the JIT
    const fights = 10000
    const start = performance.now()
    for (let k = 0; k < fights / CHUNK_SIZE; k++) runChunk(plan, k, CHUNK_SIZE, sim)
    const perSecond = fights / ((performance.now() - start) / 1000)
    console.log(`benchmark: ${Math.round(perSecond)} fights/s (default Arcane mage, one core)`)
    // Shared CI runners are noisy; the real bar is checked locally.
    const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI
    expect(perSecond).toBeGreaterThanOrEqual(ci ? 1000 : 5000)
    // 10,500 fights at CI's 1,000 a second take 10.5 s: past vitest's 5 s default (engine.test.ts "benchmark").
  }, 30_000)
})
