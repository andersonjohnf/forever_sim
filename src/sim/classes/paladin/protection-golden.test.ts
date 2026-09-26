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
  // - T2's fix round, the survival floor (D30, user): talents -0530513321301551-50215 (0/38/13), the
  //   best measured build that keeps Anticipation 5, Deflection 5, Improved Righteous Fury 3, Sacred
  //   Duty 2, Templar's Bulwark and Holy Shield: Anticipation 5 and Holy Conduit 1 for Toughness 4 and
  //   Improved Holy Strike 2 (paladin.md "Protection defaults"). TPS 818.32 → 821.34, DPS 442.58 →
  //   445.72, damage taken 897.9 → 902.7 a second (Toughness's armor goes; Anticipation's defense
  //   comes).
  // - T5/A2 (D28, D31): the rotation is a priority list, and its default is Balanced, which plays
  //   as Defensive (D26's "Tank duties first"): it keeps Holy Strike, whose Iron Creed is active
  //   mitigation (user decision in D28), and Hammer of the Righteous is a row, off, that takes its
  //   place when turned on (paladin.md "Priority: Defensive, Balanced or Max TPS"). Nothing moves:
  //   Balanced and Defensive give this snapshot's previous result exactly (both tests below), and
  //   200 random Defensive and Max TPS setups their previous plans (protection-apl.test.ts). On this
  //   seed's 1,000 fights: TPS 821.34, DPS 445.72, damage taken 902.7 a second. Max TPS, for the
  //   record: see paladin.md.
  // - The guild's lead theorycrafter's talents (user decision, 2026-09-24; paladin.md "Protection
  //   defaults"): 240003-0530213321301551-502, 9/35/7, for T2's fix-round build; D30's floor no longer
  //   holds Anticipation at 5/5. Improved Seals 3, Divine Strength 4 and Improved Holy Strike 2 for
  //   Anticipation's last three ranks, Holy Conduit and Conviction. On this seed's 1,000 fights, for
  //   Balanced and Defensive alike: TPS 821.34 → 830.39, DPS 445.72 → 447.21, damage taken 902.7 →
  //   917.4 a second (Max TPS: 855.29, 460.06, 969.9).
  // - 1.60.1.70009 (September 2026): Wizard Oil, in the Standard raid, is +24 spell damage (was 30):
  //   TPS 830.39 → 826.85, DPS 447.21 → 445.45 for Balanced and Defensive alike. The build's paladin
  //   changes (Righteous Fury, Holy Strike, Vengeance) are the paladin slice's, not taken here.
  // - 1.60.1.70009 (the new beta build; paladin.md, threat.md): its data and trees (Improved Holy
  //   Strike removed), then its values: Righteous Fury +60% Holy threat (was +90%), Holy Strike 50% of
  //   a normalized swing (was 40%) every 10 s (its talent's cut made baseline), Thorns and
  //   Retribution Aura scaling with their caster's spell power (0.08 [?]; a raid druid's 389 for
  //   Thorns), and the default talents 50003-0530213321301551-50201 (Improved Holy Strike's 2 points
  //   to Divine Strength 5 and Conviction 1, by measured Balanced value). On this seed's 1,000
  //   fights, Balanced and Defensive alike: TPS 830.39 → 747.85, DPS 447.21 → 466.13, damage taken
  //   917.4 → 917.2 a second. Righteous Fury's cut is most of it (paladin.md "Protection defaults").
  // - The 70009 integration (the casters' and the paladin slices merged): the two notes above
  //   together, Wizard Oil's +24 on the paladin slice's values. TPS 826.85 (oil alone) / 747.85
  //   (paladin alone) → 744.85, DPS 445.45 / 466.13 → 464.36, damage taken 917.2 a second, for
  //   Balanced and Defensive alike. With Wizard Oil back at 30, the paladin slice's snapshot
  //   reproduces exactly.
  // - The paladin review's PR-4 (buffs doc §1.2): a raid's Thorns on the tank is a Restoration
  //   druid's, 200 spell damage [?], not the Balance druid's 389, and unrounded (PR-9): 38 a landed
  //   swing, was 53. Only the Thorns row moves: TPS 744.85 → 738.69, DPS 464.36 → 458.32, for Balanced
  //   and Defensive alike. With Thorns set back to 53, this snapshot reproduces exactly.
  // - The paladin review's PR-1 (paladin.md "Protection defaults", "Priority"): the list's default order
  //   puts Exorcism, Hammer of Wrath and Consecration (ranks 5 and 1) above Holy Strike, and the
  //   refunded point Conviction 1 goes to Holy Conduit 1, searched together with the order and the
  //   thresholds (which held, 20% and 10%). On this seed's 1,000 fights, Balanced and Defensive alike:
  //   TPS 738.69 → 750.19, DPS 458.32 → 465.18, damage taken 917.2 → 918.7 a second; Consecration
  //   goes down more often and Holy Strike a little less.
  // - D36, pre-Ahn'Qiraj ranks (W2): the raid's buffs at the trainers' ranks (Battle Shout r6 +115, Blessing of Might r6 +112, Strength of Earth r4 +42, Grace of Air r2 +77, Blessing of Wisdom r5 36 mp5). Both goldens 750.19 → 744.35 TPS,
  //   465.18 → 459.85 DPS.
  // - The per-level term truncated, the datasets’ rendering by the same rule; how the client itself rounds it is [?] (B74) (docs/data/items.md#per-level-values):
  //   Judgement of Fury r7 adds trunc(7.38) = 7 (153.3–166.7), Judgement of Righteousness r8 trunc(8.2) = 8,
  //   Seal of the Crusader 325 AP. Both goldens 744.92 → 744.81 TPS.
  // - The Feral bear slice (2026-09-26, CL-4; buffs doc §1.2): a raid druid's Thorns takes a pre-raid
  //   Restoration druid's 313 spell damage, 22 + 0.08 × 313 = 47.04 a landed swing, was 38. Only the
  //   Thorns row moves: both goldens 744.81 → 748.52 TPS, 460.34 → 463.98 DPS. With Thorns set back to
  //   38, this snapshot reproduces exactly.
  // - The beta-log check (paladin.md#the-beta-log-check-2026-09-26), step 1: Seal of Fury's proc is a
  //   flat 35 + 0.1 × SP (its weapon-speed dummy zero), and its absorb comes off the next hit taken.
  //   Both goldens 744.81 → 716.32 TPS, 460.34 → 442.88 DPS, damage taken 918.7 → 900.2 a second.
  //   Step 3: Holy Strike's flat part and spell damage inside its 50%, as the beta logs show: TPS
  //   716.32 → 695.29, DPS 442.88 → 432.57.
  // - Merging the beta-log check with the bear slice's Thorns (2026-09-26): both at once, both goldens
  //   695.29 → 699.00 TPS, 432.57 → 436.21 DPS, damage taken 900.2 a second unchanged. With Thorns set
  //   back to 38, the beta-log check's snapshot reproduces exactly.
  // - The boss melee of 2026-09-26 (encounter.md §5): Golemagg's in a Classic Era log, 2,200–3,200
  //   before armor every 2.0 s, for the 4,500–5,500 stand-in. Both goldens' damage taken 900.25 →
  //   471.85 a second; TPS, DPS and mana unchanged, since a paladin's threat and mana don't come from
  //   the size of the hits it takes.
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

  // - T5/A2 (D28): Defensive, the default before Balanced, keeps the old default's result byte for
  //   byte; it's the same snapshot as the default's above, since Balanced plays as Defensive.
  it('keeps the Defensive Protection paladin’s result unchanged', () => {
    const d = defaultConfig('paladin-protection')
    const bundle = buildPlan({ ...d, rotation: { 'paladin.protection.priority': 'duties' }, run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
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
