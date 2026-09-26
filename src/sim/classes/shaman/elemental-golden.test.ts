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
  // - Caster racials (issue #10): Blood Fury is the casters' (caster-racials.ts), the warlock's live
  //   +10% spell damage multiplier while it's up, no longer a flat 10% of the sheet's Nature spell
  //   damage fixed at the pull: DPS 370.34 → 370.30, TPS 264.19 → 264.16 (20,000 fights: 368.76 →
  //   368.72, ± 0.23, so no measurable change).
  // - 1.60.1.70009 (September 2026): Lightning Bolt rank 4's base points 50 → 56 (55.22–62.78 at
  //   60): DPS 370.30 → 371.73, TPS 264.16 → 265.11; rank 4's damage +1.4%, its Lightning Overload
  //   copies with it. Lava Burst rank 3 and Rage of the Farseer (not in the build) are unchanged.
  // - the Destruction gear verification (DV2-4, on 1.60.1.70009, whose data left these defaults' results unchanged): Wrath of Cenarius's and Draconic
  //   Infused Emblem's procs are modelled, and the list's rings, trinkets and off hand are re-ranked by
  //   the sim (Spirit of Aquementas lost its Forever row): Wrath of Cenarius and Elemental Focus Band,
  //   Draconic Infused Emblem and Royal Seal of Eldre'Thalas, Therazane's Touch. DPS 370.30 → 401.07,
  //   TPS 264.16 → 284.89; 381.7 → 401.1 over 20,000 fights on seed 2701 for the re-rank alone.
  // - The caster gear verification (GV-6): Sash of the Windreaver is event-only (an Elemental Invasion
  //   boss's), so Ban'thok Sash is the belt: DPS 401.07 → 401.81, TPS 284.89 → 285.36 here; 401.1 →
  //   400.9 over 20,000 fights on seed 2701 (within the interval).
  // - The 70009 integration (the casters' and the caster gear slices merged): Lightning Bolt r4 at 56
  //   with the re-ranked list (DV2-4, GV-6). DPS 371.73 (casters alone) / 401.81 (gear alone) →
  //   403.17, TPS 265.11 / 285.36 → 286.27. Checked both ways: with either side's code reverted, the
  //   other side's snapshot reproduces exactly.
  // - D36, pre-Ahn'Qiraj ranks (W2): Blessing of Wisdom r5 (36 mp5) and the own totems' trainer ranks (Strength
  //   of Earth r4, Grace of Air r2). 403.17 → 401.62 DPS.
  // - The per-level term truncated, as the client renders it (docs/data/items.md#per-level-values):
  //   Lightning Bolt r10 + 4, Chain Lightning r4 + 3 (189.38–210.62, 119.17–132.83). 401.62 → 401.41 DPS.
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
