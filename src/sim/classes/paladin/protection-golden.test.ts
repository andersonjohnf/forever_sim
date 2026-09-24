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
  // - T2 (M5.6, the threat review's P2): the buffs doc's §6.4 caster enchants reach the defaults,
  //   Arcanum of Focus on head and legs and the weapon's Spell Power: 40 → 86 spell damage. On this
  //   seed's 1,000 fights TPS 423.41 → 446.30 and DPS 230.97 → 242.25; nothing else moves.
  // - T2 (P3): the Standard raid's caster food and oil reach the catalogue and the Protection preset,
  //   Nightfin Soup (+22 spell damage) and Wizard Oil (+30): 86 → 138. TPS 446.30 → 472.18, DPS
  //   242.25 → 255.01.
  // - T2 (A1, A1b): another paladin's Judgement of the Crusader (+161 Holy damage taken) in the
  //   Standard raid, with a second paladin [?], and the Character → Advanced JotC rule now reaches
  //   Protection's spells (it didn't). TPS 472.18 → 552.32, DPS 255.01 → 294.51.
  // - T2 (P4): Seal of Fury's seal value, 0.85 × 16.91 × 1.5 = 21.56 on top of its 35 with the
  //   default axe [?] (Seal of Righteousness’s rule; OQ 10). TPS 552.32 → 579.57, DPS 294.51 → 308.57.
  // - T2 (P6/A3): Holy Strike's flat 81–105 after its 40%, as its tooltip reads [?] (OQ 6): TPS
  //   579.57 → 590.07, DPS 308.57 → 312.91.
  // - T2, interim defaults (D30; paladin.md "Protection defaults"): the gear review's threat set with
  //   the Flurry Axe and, for the effective-health floor, Deathbone Gauntlets; talents
  //   2-4530013321301551-50205 (Conviction 5 for Anticipation 5); Consecration from 20% with rank 1
  //   on (T2’s re-check). Hammer of the Righteous is in the rotation, off. TPS 590.07 → 817.61, DPS
  //   312.91 → 438.06, damage taken 682 → 899 a second.
  // - T2, the opener (user): a Protection paladin judges its own Judgement of the Crusader, Seal of
  //   the Crusader before the pull and judged at the pull, then Seal of Fury; the Buffs tab's (another
  //   paladin's) leaves the Standard raid. TPS 817.61 → 809.18, DPS 438.06 → 433.62 (the opener's
  //   judgement and 90 mana), damage taken 899 → 898.
  // - T3R-2 (buffs doc §1.2, §6.2): a raid druid's Thorns on the main tank is in every tank's raid
  //   preset, as Devotion Aura. TPS 809.18 → 818.32, DPS 433.62 → 442.58; damage taken unchanged.
  // - T2's fix round, the survival floor (D30, user): talents -0530513321301551-50215 (0/37/13), the
  //   best measured build that keeps Anticipation 5, Deflection 5, Improved Righteous Fury 3, Sacred
  //   Duty 2, Templar's Bulwark and Holy Shield: Anticipation 5 and Holy Conduit 1 for Toughness 4 and
  //   Improved Holy Strike 2 (paladin.md "Protection defaults"). TPS 818.32 → 821.34, DPS 442.58 →
  //   445.72, damage taken 897.9 → 902.7 a second (Toughness's armor goes; Anticipation's defense
  //   comes).
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
