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
  //   Devotion Aura and Seal of Fury before the pull, the seal again with 2 s left, Holy Shield
  //   whenever its buff is gone, Judgement of Fury with Swift Judgement right after it once a
  //   minute, Holy Strike, Consecration from 90% mana and Hammer of Wrath in the execute phase;
  //   Reckoning, Redoubt, and Improved Seal of Fury's mana from Seal of Fury's absorb. The raid
  //   preset has no Thunder Clap or Demoralizing Shout for a paladin tank (D26). 369.04 TPS and
  //   209.98 DPS over 400,000 fights on seed 7331; on this seed's 1,000 fights, TPS 367.97 and
  //   DPS 209.61.
  // - C3's fix round: Hammer of Wrath's 1 s cast stops auto attacks and holds Judgement (QL2),
  //   and Iron Creed's −10% damage taken after each landed Holy Strike (QL10). The defaults held
  //   under D23's re-check (paladin.md "Tuning the defaults"). 362.21 TPS and 204.93 DPS over
  //   400,000 fights on seed 7331; on this seed's 1,000 fights, TPS 360.57, DPS 204.25 and damage
  //   taken 681.7 a second (Iron Creed: 4.3% less).
  // - Then its results: Righteous Fury is a cast before the pull, so the results list its buff
  //   (QU5), and Swift Judgement's cast shows no uptime, since the next Judgement uses its buff at
  //   once (QU10). Nothing else moves.
  // - After the rebase onto main's Retribution (C2): a paladin's Standard raid now brings Prayer of
  //   Spirit, Arcane Brilliance, Blessing of Wisdom and Mana Spring Totem, Elixir of Holy Power and
  //   the Major Mana Potion (buffs doc §6.2, §6.3): 2,717 → 3,227 mana, +40 spell damage. With the
  //   old buffs every number is the same (the engine didn't move). On this seed's 1,000 fights, TPS
  //   395.79, DPS 220.73 and damage taken 680.6 a second. The snapshot records the mana ledger too.
  // - QU13: the rotation drinks the Major Mana Potion the Standard raid brings, on Retribution's
  //   lines and defaults for now (1,500 early, 2,250 after; consumables.ts): 0.41 a fight here,
  //   TPS 398.23 (its mana makes threat too) and DPS 220.95.
  // - D26's fixed duty rule: the duty first, so Devotion Aura goes up 4.5 s before the pull and
  //   Righteous Fury at 3 s (they were the other way round). Casts before the pull are free and
  //   roll nothing, so only the cooldowns' order moves: Devotion Aura before Righteous Fury.
  // - D23 re-run on the new raid buffs and the potion, the threat abilities only (paladin.md
  //   "Tuning the defaults (C3)"): Consecration from 40% (was 90%) and the seal again with 2.5 s
  //   left (was 2 s). +25.54 TPS (+6.40%, 399.26 → 424.80, 95% CI +25.48 to +25.60) and +9.99
  //   DPS (+4.51%) over 400,000 paired fights on seed 4481, which no search used. On this seed's
  //   1,000 fights: Consecration 8,422 → 14,703 casts, the potion 0.41 → 1.90 a fight; TPS 398.23
  //   → 423.41, DPS 220.95 → 230.97, damage taken 680.5 → 682.1 a second.
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
      mana: result.mana,
    }).toMatchSnapshot()
  })
})
