# Warrior: Arms, Fury, Protection

This is the engine contract for level-60 warriors in WoW Forever: every ability, proc, aura and
talent the sim implements for Fury (dual wield), Arms (two-hander) and Protection (TPS), with
formulas, numbers and default rotations. Forever reworked the warrior far beyond tooltip
wording. **Bloodthirst** now scales at 35% of AP + 48 instead of 45% of AP. **Slam** has a 15 s
cooldown. **Flurry** tops out at 25% haste. **Battle Shout** is 40% weaker at every rank and no
talent restores it. The four Arms weapon specializations are merged into one 5-point talent,
**Weaponmaster**, and the racials that gave weapon skill now give crit, so every race starts
at 300 weapon skill. Dual Wield Specialization now also adds off-hand hit and doubles
off-hand rage. Fury gains Precision, Boundless Rage and Raging Blows. Enrage now triggers when
you are hit, not when you are crit. Shield Slam and Revenge do almost twice their Classic damage, and in the
client data Sunder Armor now carries a large flat threat effect of its own. Where Forever is
silent, this doc uses Classic Era (1.13–1.15) behaviour, mostly from Magey's tested wiki and
guybrush's WarriorSim at its pre-SoD revision.

Status: researched 2026-09-22 · Forever beta build 1.60.1.69913 vs Classic Era 1.15.9.69722 ·
ruleset tags: [F] Forever · [C] Classic Era · [?] unverified

**How values are tagged.** **[F]** means a Forever tooltip on foreverchanges.pro or a row
in the Forever client's DB2 tables at build 1.60.1.69913. **[client] (Table, build)** marks a
value read from the raw client files and checked in [client.md][client]; links marked `db` open
the same tables on wago.tools for browsing. **[C]** means Classic Era
behaviour. **[?]** means an assumption or an unverified value, and each one has a matching entry
in [Open questions](#9-open-questions) (Q-numbers). Source links are reference-style; the full
list is in [Sources](#10-sources).

Related docs, which this doc links instead of duplicating: attack tables, weapon skill and hit
caps are in [combat-tables.md](../mechanics/combat-tables.md). Armor, normalization, haste,
swing timers, GCD and procs are in [damage-and-timing.md](../mechanics/damage-and-timing.md).
Rage formulas are in [rage.md](../mechanics/rage.md), and threat values in
[threat.md](../mechanics/threat.md). Stats and the stat pipeline are in
[character-stats.md](../mechanics/character-stats.md). Raid buffs, debuffs and consumables are
in [buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md), the target model
in [encounter.md](../mechanics/encounter.md), and non-class Forever changes in
[forever-system-changes.md](../mechanics/forever-system-changes.md).

## Contents

1. [WoW Forever deviations](#1-wow-forever-deviations)
2. [Warrior mechanics](#2-warrior-mechanics)
3. [Abilities at level 60](#3-abilities-at-level-60)
4. [Talents](#4-talents)
5. [Spec models and rotations](#5-spec-models-and-rotations)
6. [Sensible defaults](#6-sensible-defaults)
7. [Implementation notes](#7-implementation-notes)
8. [Worked examples](#8-worked-examples)
9. [Open questions](#9-open-questions)
10. [Sources](#10-sources)

## What the sim needs

- **Stances.** Battle, Defensive and Berserker, with their modifiers, which abilities each
  allows, a 1 s swap cooldown that doesn't trigger the GCD, and the rage kept on a swap
  (Tactical Mastery 10, plus 3 per rank of Improved Tactical Mastery). See [§2.1](#21-stances).
- **Warrior rage sources and sinks** on top of [rage.md](../mechanics/rage.md): Unbridled
  Wrath, the off-hand multiplier from Dual Wield Specialization, Anger Management, Bloodrage,
  Berserker Rage, Shield Specialization, Master of Defense, Boundless Rage and cost reductions.
  See [§2.3](#23-rage-warrior-specific).
- **An on-next-swing queue** for Heroic Strike and Cleave, including the Classic rule that a
  queued swing lifts the dual-wield miss penalty from off-hand swings. See [§2.4](#24-heroic-strike-and-cleave-on-next-swing).
- **Crit handling.** The Impale crit multiplier on abilities, Flurry charges and the Deep
  Wounds bleed. See [§2.5](#25-crits-impale-flurry-deep-wounds).
- **Auras and procs.** Enrage (driven by damage the warrior takes), Death Wish, Recklessness,
  Weaponmaster, Bloodthrill, the Overpower and Revenge windows, and Windfury interplay. See
  [§2.6](#26-enrage-death-wish-recklessness) to [§2.8](#28-reactive-abilities-overpower-bloodthrill-revenge).
- **Abilities.** Every ability in [§3](#3-abilities-at-level-60), at the max Forever rank, with
  rage costs after talent reductions.
- **Talents as data-driven modifiers.** Rank values come from
  `src/data/talents/warrior.json`; see [§4](#4-talents).
- **One action priority list (APL) per spec**, with user-tunable toggles and thresholds, in
  [§5](#5-spec-models-and-rotations).
- **Inputs from the encounter model** ([encounter.md](../mechanics/encounter.md)):
  - target health % over time, for Execute;
  - target creature type (Giant, Dragonkin or other), for Spearing Strike;
  - number of targets, for Cleave, Whirlwind and Sweeping Strikes (not simulated yet,
    [§5.5](#55-multi-target-options-light));
  - incoming damage events: boss swings for tanks, and optional raid damage for DPS. These
    drive Enrage, Revenge, Shield Specialization, Master of Defense and Berserker Rage.

## 1. WoW Forever deviations

foreverchanges counts 37 changed warrior talents, 9 new ones, 8 removed and 16 changed spells
[cls]. This table lists every change that moves a DPS or TPS number. Talents that only change
utility are covered in [§4](#4-talents).

| Change | Classic Era [C] | WoW Forever [F] | What it means for the sim |
| --- | --- | --- | --- |
| Bloodthirst | 45% of AP, 30 rage, 6 s cooldown [cls] | **35% of AP + 48** (the talent's rank 1 is + 30). Also +10% movement speed for 10 s instead of the heal [sb] [client] (SpellEffect, 1.60.1.69913) | Weaker at high AP (−132 at 1800 AP). The AP above which Bloodthirst beats Execute rises to about 2220–2430 ([W11](#w11-bloodthirst-versus-execute-break-even)) |
| Slam | 1.5 s cast, **no cooldown**, rank 4 +87 | **15 s cooldown** on every rank; rank 5 is +87 and is trained at 54 [sb] [client] (SpellCooldowns, 1.60.1.69913) | No more Slam spam. Slam becomes a cooldown ability |
| Improved Slam | Fury tier 5, 5 ranks, −0.1 s cast per rank | **Arms** tier 6, 2 ranks, **−0.25 s cast time and GCD** per rank, and Slam "no longer interrupts your melee swing time" [tal] [db-eff] | At 2/2 Slam is a 1.0 s cast on a 1.0 s GCD that leaves swing timers alone |
| Flurry | +10/15/20/25/30% attack speed | **+5/10/15/20/25%** [tal] [client] (CurvePoint, 1.60.1.69913) | 5/5 is 25%, not 30% |
| Unbridled Wrath | 8% per rank (40%), +1 rage | **12% per rank (60%), +1 rage, or +2 with a two-hander** [tal] | Much more rage, especially for two-handers |
| Dual Wield Specialization | +5% off-hand damage per rank | +5% off-hand damage, **+20% off-hand rage and +2% off-hand hit** per rank [tal] [client] (CurvePoint, 1.60.1.69913) | At 5/5: off-hand rage ×2.0 and +10% off-hand hit |
| Enrage | +5% per rank melee damage for 12 s or 12 swings, after **being crit** | **30% chance when hit by any damaging attack**; +2% per rank Physical damage for 12 s, with no swing cap [tal] [client] (SpellAuraOptions, 1.60.1.69913) | Needs incoming damage events. At 5/5 it gives +10% |
| Death Wish | +20% physical damage, but −20% armor and resistances | +20% Physical damage, but **+5% damage taken** [tal] | DPS unchanged; the tank-side penalty is different |
| Improved Execute | −2 / −5 rage | −3 / −5 rage [tal] | Rank 1 is better |
| Improved Cleave | +40% per rank to Cleave's bonus damage | **−1 rage per rank** to Cleave's cost [tal] | Cleave stays at +50 damage |
| New in Fury | none | **Boundless Rage** (+10 max rage per rank), **Raging Blows** (Whirlwind also strikes with the off-hand; Cleave −2 rage), **Precision** (+1% hit per rank) [tal] | Max rage can reach 130 |
| Weapon specializations | Sword, Axe, Polearm and Mace Specialization, 5 points each | All four removed and merged into **Weaponmaster** (5 ranks): Axe or Polearm +1% crit per rank; Mace or Staff ignores 3% of armor per rank; Sword has a 1% chance per rank of an extra attack [tal] [db-trait] | One talent covers every weapon type. Maces get armor penetration instead of a stun |
| Two-Handed Weapon Specialization | 5 ranks, 5% | **3 ranks, 3%** [tal] | −2% for two-handers |
| Impale | Needs Deep Wounds | No prerequisite; same +10% per rank to the crit bonus [tal] | None |
| Improved Rend | 15/25/35% | 12/23/35% [tal] | Same at 3/3 |
| Tactical Mastery | Talent, keeps 5/10/15/20/25 rage | **Trained at level 14 and keeps 10 rage**; the talent is now **Improved Tactical Mastery**, +3 per rank, so 25 at 5/5 [sb] [tal] | Same at 5/5. Without the talent a warrior keeps 10 rage, not 0 |
| New in Arms | none | **Spearing Strike** (40% weapon damage, 120% against Giants, Dragonkin and mounted targets; 15 rage, 20 s cooldown, two-hander only), **Bloodthrill** (2% per rank chance that a melee attack on your Rend target enables Overpower for 6 s) [tal] | New Arms abilities and procs |
| Shield Slam | 342–358 + block value | **640–670 + block value** [sb] | About ×1.87 |
| Revenge (rank 6) | 81–99 | **138–168** [sb] | About ×1.7 |
| Improved Revenge | Stun chance | **+20% Revenge damage per rank** [tal] | +60% at 3/3 |
| Shield Block | 75% block for 5 s, 1 block | 75% block for **7 s, 2 blocks** [sb] | Improved Shield Block was removed; its effect is now baseline |
| Shield Specialization | 20% per rank chance of **1** rage on block | 20% per rank chance of **5** rage on block [tal] | Big tank rage source |
| New in Protection | none | **Master of Defense** (50% per rank chance of 5 rage on dodge or parry with a shield), **Focused Rage** (−1 rage per rank on offensive abilities), **Vanguard** (Charge usable in Defensive Stance) [tal] | Cheap abilities and lots of tank rage |
| Defiance | 5 ranks: +3% per rank threat in Defensive Stance | 3 ranks: **+5% per rank to all threat in Defensive Stance while a shield is equipped** [tal] | Same 1.15 at max rank, but it now needs a shield |
| Bastion | Was One-Handed Weapon Specialization: +2% per rank with one-handers | **+2% per rank to all damage while a shield is equipped** [tal] | Only affects Protection |
| Anticipation | +2 defense per rank | **+4 defense per rank** [tal] | +20 defense at 5/5 |
| Improved Bloodrage | +2 / +5 instant rage | **+25% / +50% to all Bloodrage rage** [tal] | 15 + 15 rage at 2/2 |
| Improved Thunder Clap | −1 / −2 / −4 rage, Arms tree | −2 / −4 / −6 rage, **Protection** tree [tal] | None |
| Battle Shout (rank 7) | +232 AP, 2 min | **+139 AP, 3 min** [sb] | −93 AP to the party. See [§1.1](#11-battle-shout-a-nerf-not-a-re-ranking) |
| Improved Battle Shout and Improved Demoralizing Shout | Fury talents | **Removed** [cls] | No way to raise shout values |
| Demoralizing Shout (rank 5) | −146 AP at 60, 30 s | **−204 AP at 60, 45 s** [sb] [client] (SpellEffect, SpellLevels, 1.60.1.69913) | Details belong in [buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md) |
| Thunder Clap | 4 s cooldown, 10% attack-speed slow, Battle Stance only | **6 s cooldown, 20% slow, Battle or Defensive Stance** [sb] [client] (SpellShapeshift, 1.60.1.69913) | Protection can use it without dancing |
| Sunder Armor | No threat effect in client data [client] (SpellEffect, 1.15.9.69722) (Classic threat of 261 is set server side [magey-thr]) | Client data adds a **THREAT effect of 1013 at rank 5** (405/608/810 at ranks 2–4, which is 2.25 × the armor removed) [F] [client] (SpellEffect, 1.60.1.69913); the in-game threat is [?] | Possibly a large TPS change. Flagged for [threat.md](../mechanics/threat.md); see Q1 |
| Victory Rush | Does not exist in Classic Era | New baseline spell: 1 damage, heals 10% of max health, 30 s cooldown, only within 20 s of killing a non-trivial enemy [sb] | Not used against bosses |
| Retaliation, Shield Wall, Last Stand, Taunt | 30 min, 30 min (75%, 10 s), 10 min, 10 s | 15 min, 15 min (60%, 12 s), **3 min**, 8 s [sb] [db-cd] | Not simulated |
| Concussion Blow | 15 rage | 10 rage [db-pow] | Not simulated |
| Racials | Human +5 sword/mace skill, Orc +5 axe skill, Blood Fury +25% base AP, Berserking 10–30% | Human +2% crit with a sword; Orc +1% crit with an axe; Dwarf +1% crit with a mace; **Blood Fury +10% AP**; **Berserking a flat +10%**; new Night Elf, Gnome, Tauren, Undead and Skyborne racials [rac] | No race has bonus weapon skill any more. See [§2.9](#29-racials-for-warriors) |

### 1.1 Battle Shout: a nerf, not a re-ranking

Every Forever rank of Battle Shout is 0.60× its Classic value: 9/15, 21/35, 33/55, 51/85, 78/130,
111/185 and 139/232 [sb]. Rank 7 is still the level-60 rank, spell 25289. Its client row is base
139 with 0.6 points per level [client] (SpellEffect, 1.60.1.69913), where Classic had 232 and 1
point per level [C-eff], so the whole spell was scaled by 0.6. This is a **flat nerf, not a
re-ranking**. Nothing restores the old value:

- Improved Battle Shout was removed from the Fury tree [cls].
- Booming Voice now only increases the radius. Its Classic duration bonus is gone from both
  the tooltip and the data [tal] [db-eff].

The duration went up from 2 to 3 minutes [sb]. Classic raids ran 5/5 Improved Battle Shout
for 290 AP, so a Forever party gets 151 AP less from its warrior. Demoralizing Shout went the
other way: ×1.40 at every rank (63/45 … 204/146 at level 60) and 45 s instead of 30 s [sb]
[client] (SpellEffect, SpellLevels, 1.60.1.69913; 1.15.9.69722).

### 1.2 What did not change

These are identical in the tooltip and the client data [sb] [db-eff] [C-eff]:

- Heroic Strike (rank 9, +157), Cleave (rank 5, +50), Mortal Strike (rank 4, +160),
  Whirlwind, Execute (rank 5, 600 + 15 per rage), Overpower (rank 4, +35), Hamstring (45),
  Rend (147 over 21 s) and Sunder Armor's armor reduction (−450 × 5)
- Bloodrage, Berserker Rage, Recklessness's cooldown, Death Wish's cost and cooldown, and
  Sweeping Strikes
- all stance requirements, except Thunder Clap [db-ss] [C-ss]

Anger Management's tooltip now states its +1 rage every 3 s in combat. The data is the
same as Classic, so this is not a change [tal] [db-eff] [C-eff].

## 2. Warrior mechanics

### 2.1 Stances

| Stance | Passive in Forever | Threat | Stance-only abilities [db-ss] |
| --- | --- | --- | --- |
| Battle | none | ×0.8 [F] [client] (SpellEffect, 1.60.1.69913) (spell 21156, −20%); [C] [magey-thr] | Overpower, Charge, Sweeping Strikes, Retaliation, Mocking Blow; shared with Defensive: Rend, Thunder Clap, Shield Bash; shared with Berserker: Execute, Hamstring |
| Defensive | Damage taken −10%, damage done −10%, all threat +30% [F] [sb]; threat [client] (SpellEffect, 1.60.1.69913) (spell 7376) | ×1.3, and ×1.15 more with Defiance 3/3 and a shield | Revenge, Shield Block, Shield Wall, Taunt, Disarm, Charge (with Vanguard); shared with Battle: Rend, Thunder Clap (new in Forever), Shield Bash |
| Berserker | +3% crit on all attacks, damage taken +10% [F] [sb] [client] (SpellEffect, 1.60.1.69913) (spell 7381) | ×0.8 [F] [client] (SpellEffect, 1.60.1.69913); [C] [magey-thr] | Whirlwind, Berserker Rage, Recklessness, Intercept, Pummel; shared with Battle: Execute, Hamstring |

Usable in **any stance**: Heroic Strike, Cleave, Bloodthirst, Mortal Strike, Slam, Sunder Armor,
Shield Slam, Spearing Strike, Victory Rush, Death Wish, Bloodrage, the shouts and Concussion Blow
[db-ss].

- **How the modifiers combine.** Damage-done and damage-taken modifiers multiply with other
  percentage auras. The Defensive Stance penalty uses the same aura type (79) as Death Wish,
  Bastion and Two-Handed Weapon Specialization, and the engine multiplies them
  [db-eff]; see [damage-and-timing.md](../mechanics/damage-and-timing.md).
- **The Berserker crit type changed.** Berserker Stance's +3% now uses the "all crit" aura (290)
  instead of Classic's weapon-crit aura (52) [F] [client] (SpellEffect, 1.60.1.69913); [C]
  [client] (SpellEffect, 1.15.9.69722). It is still crit from an aura, so the +3-level aura-crit
  suppression in [combat-tables.md](../mechanics/combat-tables.md) applies [magey-crit]. All crit
  raises spell crit too (magic procs), so `forever` adds +3% spell crit in Berserker Stance and
  `classicEra` doesn't (`stanceEffects(profile)`,
  [character-stats](../mechanics/character-stats.md#implementation-notes)).
- **An empty aura on Berserker Stance.** Its Forever passive adds an attack-power-percent
  aura (166) with value 0. It has no effect, but watch for it in later builds [F]
  [client] (SpellEffect, 1.60.1.69913).
- **Swapping stances.** A swap is off the GCD and has a 1.0 s cooldown shared by the three
  stances [F] [client] (SpellCooldowns, 1.60.1.69913) (category 47). The warrior keeps `rage =
  min(rage, 10 + 3 × Improved Tactical Mastery rank)` [F] [sb] [tal]; in Classic Era the formula
  was `min(rage, 5 × Tactical Mastery rank)` [C]. The rest of the rage is lost.
- **Stance-restricted abilities.** When an ability needs another stance, an APL may swap first
  ("stance dance"). The swap and its rage loss happen before the ability. The Classic
  mechanics are implemented the same way in WarriorSim [ws-spell]. How the sim swaps, dances
  and swaps back is in [§7](#7-implementation-notes) ("Stances", "Stance dancing").

### 2.2 Global cooldown and off-GCD actions

- **GCD length.** The GCD is 1.5 s for every warrior ability and is not reduced by haste [C];
  [damage-and-timing §3.5](../mechanics/damage-and-timing.md#35-global-cooldown) owns the rule
  and its source. The one exception is Slam:
  Improved Slam cuts Slam's own GCD by 0.25 s per rank, to 1.0 s at 2/2 [F] [tal] [db-eff].
- **On the GCD** (`StartRecoveryTime` 1500 in [db-cd]; category 133 in [db-cat]):
  - attacks: Bloodthirst, Mortal Strike, Whirlwind, Slam, Execute, Overpower, Hamstring, Rend,
    Sunder Armor, Revenge, Shield Slam, Thunder Clap, Spearing Strike, Victory Rush
  - shouts
  - cooldowns: Death Wish, Recklessness, **Berserker Rage**, Retaliation, Shield Wall
  - utility: Pummel, Shield Bash, Mocking Blow
  - racials: **Stoneform** (`StartRecoveryTime` 1500) [F] [client] (SpellCooldowns, 1.60.1.69913)
- **Off the GCD:**
  - Heroic Strike and Cleave (on-next-swing)
  - Bloodrage, Sweeping Strikes, Shield Block, Last Stand
  - stance swaps
  - racials: Blood Fury, Berserking, Elune's Light and Eureka! all have `StartRecoveryTime` 0
    [F] [client] (SpellCooldowns, 1.60.1.69913)
  - trinkets and consumables: Weakness Analyzer (1291101), the Mighty Rage Potion (17528) and
    Juju Flurry (16322) have no start recovery [F] [client] (SpellCooldowns, 1.60.1.69913)

### 2.3 Rage: warrior-specific

[rage.md](../mechanics/rage.md) owns the rage formulas: rage from damage dealt and taken,
white dodge and parry rage, refunds on failed abilities, the rage cap and out-of-combat decay.
This section adds the warrior's own sources and sinks.

| Source or modifier | Rule | Tag |
| --- | --- | --- |
| Max rage | 100 + 10 × Boundless Rage rank, so 130 at 3/3. Gnomes get +5% max rage from Expansive Mind; how the two combine is Q17 | [F] [tal] [rac] [client] (SpellEffect, CurvePoint, 1.60.1.69913) (aura 418, 100/200/300 tenths) |
| Unbridled Wrath | On every **white** melee hit that deals damage (hit, crit, glance or block; not miss, dodge or parry), a 12% per rank chance to gain 1 rage, or 2 with a two-hander. The Forever data's proc mask is "melee auto attack" only. The pre-SoD WarriorSim also lets Heroic Strike swings proc it (it has no Cleave). **Default: white swings, extra attacks and HS/Cleave swings.** See Q5 | [F] [tal] [client] (SpellAuraOptions, CurvePoint, 1.60.1.69913) (mask 0x4, curve 12–60, energize 12964 = 10 tenths); HS/Cleave [C] [ws-player] [?] |
| Dual Wield Specialization | Rage from off-hand auto attacks × (1 + 0.20 × rank), so ×2.0 at 5/5. Applied to the rage [rage.md](../mechanics/rage.md) computes for that off-hand swing, including dodge rage | [F] [tal] [client] (CurvePoint, 1.60.1.69913) |
| Anger Management | +1 rage every 3 s in combat, on a fixed 3 s tick from combat start | [F] [tal]; [C] |
| Bloodrage | +10 rage at once, then +1 per second for 10 s. Improved Bloodrage multiplies all of it by 1 + 0.25 × rank (15 + 15 at 2/2). 60 s cooldown, off the GCD, puts the warrior in combat, so it can be used before the pull | [F] [sb] [tal] [client] (SpellEffect, CurvePoint, 1.60.1.69913) (2687 = 100, 29131 = 10 per s; 25/50) |
| Berserker Rage | +5 / +10 rage on use with Improved Berserker Rage 1/2 or 2/2. Its extra rage from damage taken belongs to [rage.md](../mechanics/rage.md) | [F] [tal]; extra rage [C] [?] (Q20) |
| Shield Specialization | On a block, a 20% per rank chance to gain 5 rage (100% at 5/5). Blocks from Shield Block count | [F] [tal] [client] (SpellEffect, CurvePoint, 1.60.1.69913) (spell 1310318 = 50 tenths) |
| Master of Defense | On a dodge or parry with a shield equipped, a 50% per rank chance to gain 5 rage | [F] [tal] [client] (SpellEffect, CurvePoint, 1.60.1.69913) (spell 23602 = 50 tenths) |
| Charge (opener) | Charge rank 3 generates 15 rage, +3 per rank of Improved Charge. Out of combat only; Battle Stance, or Defensive with Vanguard. It is modelled only as an optional pre-pull rage grant | [F] [sb] [tal] |
| Stance swap | Keeps min(rage, 10 + 3 × Improved Tactical Mastery rank); see [§2.1](#21-stances) | [F] |
| Execute | Spends all remaining rage on a successful hit; see [§3.1](#31-damage-abilities) | [F]/[C] |
| Refunds | An ability that misses or is dodged or parried refunds 80% of its cost, **except Whirlwind, Cleave and Execute**, which refund nothing. A missed Execute costs only its base cost. [rage.md](../mechanics/rage.md) owns refunds; Cleave's exception comes from Magey's 1.13 video test (rage.md's [refund table](../mechanics/rage.md#rage-refunds-on-avoided-abilities)) | [C] ([rage.md](../mechanics/rage.md#rage-refunds-on-avoided-abilities); the pre-SoD WarriorSim for Whirlwind and Execute, [ws-spell]) |

**Cost reductions.** All are flat and stack additively:

- Improved Heroic Strike: −1 per rank.
- Improved Cleave: −1 per rank. Raging Blows: another −2 on Cleave.
- Improved Execute: −3 at 1/2, −5 at 2/2.
- Improved Sunder Armor: −1 per rank.
- Improved Thunder Clap: −2 per rank.
- **Focused Rage: −1 per rank** on every ability in its class mask [F] [client] (SpellEffect,
  1.60.1.69913):
  - attacks: Bloodthirst, Mortal Strike, Whirlwind, Slam, Heroic Strike, Cleave, Execute,
    Overpower, Revenge, Shield Slam, Spearing Strike, Rend, Hamstring, Thunder Clap, Sunder
    Armor
  - shouts: Demoralizing Shout, Challenging Shout, Intimidating Shout, Piercing Howl
  - utility and cooldowns: Pummel, Shield Bash, Intercept, Mocking Blow, Disarm, Concussion
    Blow, Death Wish, Sweeping Strikes
  - **not** reduced: Battle Shout, Shield Block, Berserker Rage, Bloodrage
- Gnome Eureka! cuts the next 3 damaging abilities' cost by 40%, rounded down to whole rage
  (Q18 [?]): Bloodthirst and Mortal Strike 30 → 18, Whirlwind 25 → 15, Execute's 15 → 9 [F]
  [rac] [db-eff]. The model is every class's ([§7](#7-implementation-notes), `src/sim/classes/eureka.ts`).

### 2.4 Heroic Strike and Cleave (on-next-swing)

1. **Queueing.** Queueing is off the GCD and free. The ability replaces the **next main-hand
   swing**. Rage is checked and spent **when the swing happens**; if there isn't enough, the
   swing is an ordinary white swing [C] [ws-player] [marrow].
2. **Damage.** The replaced swing uses the main-hand's non-normalized weapon damage
   (`weaponRoll + AP / 14 × weaponSpeed`) plus the bonus: +157 for Heroic Strike rank 9, +50
   for Cleave rank 5. Cleave hits the target and one more nearby enemy, each with the +50 [F]
   [sb] [client] (SpellEffect, 1.60.1.69913) (effect 17 = non-normalized weapon damage). The
   swing rolls on the **special attack table**, so it cannot glance; see
   [combat-tables.md](../mechanics/combat-tables.md) [C] [marrow-mech].
3. **Rage.** The replaced swing generates no damage rage [C] [marrow] [wh-fury]. It can still
   proc Unbridled Wrath under the default in [§2.3](#23-rage-warrior-specific).
4. **Off-hand swings while queued.** While Heroic Strike or Cleave is queued, off-hand white
   swings use the **single-wield** miss chance: the 19% dual-wield penalty does not apply.
   Blizzard lists this as intended Classic Era behaviour ("Not a bug") [C] [bnet-hsq]
   [wh-fury] [marrow]; the pre-SoD WarriorSim does the same [ws-player]. Dual Wield
   Specialization's off-hand hit still applies on top. For Forever, a third-party beta test
   found the rule still in place (5.19% vs 18.27% off-hand miss, 77 and 394 swings) [?]
   ([magey/forever-warrior#2][fw-2]; [combat-tables §5](../mechanics/combat-tables.md#5-dual-wield-and-on-next-swing-queues)).
   Another community Forever sim removed this behaviour in its own code [ew]; nothing supports
   that. Q6.
5. **Flurry.** In Forever, Heroic Strike and Cleave swings **do not consume Flurry charges**;
   only white swings do [F] [client] (SpellAuraOptions, 1.60.1.69913) (the Flurry buff's proc
   mask is auto attacks only). For Classic Era this is [?]: the pre-SoD WarriorSim consumes a
   charge on a Heroic Strike swing [ws-player], while its post-SoD code doesn't. Q7. Either way
   they can **proc** Flurry, Deep Wounds and on-hit effects like any yellow attack [C]
   [ws-player].
6. **Swing timer.** The replaced swing resets the main-hand swing timer like a normal swing
   [C] [ws-player].
7. **Extra attacks.** If an extra attack (Windfury, Weaponmaster's sword proc, Hand of
   Justice) fires while Heroic Strike is queued, the queued ability fires on that extra
   attack, rage permitting [C] [magey-wf].
8. **Unqueueing.** A player may cancel the queue before the swing. The APL exposes this as
   "unqueue below X rage" ([§5.1](#51-conventions-for-rotation-settings)).

### 2.5 Crits: Impale, Flurry, Deep Wounds

**Crit damage.** Melee crits deal 2.0× damage [C]. For **abilities** the multiplier is
`1 + 1.0 × (1 + 0.10 × Impale rank)`, which is 2.2 at 2/2 [F] [tal]; [C] [ws-player]. Impale's
class mask covers these abilities [client] (SpellEffect, 1.60.1.69913):

- Bloodthirst, Mortal Strike, Whirlwind, Slam, Heroic Strike, Cleave, Execute, Overpower
- Revenge, Shield Slam, Thunder Clap, Hamstring, **Rend**, Spearing Strike, **Sunder Armor**,
  Victory Rush, Intercept, Pummel, Shield Bash, Mocking Blow and Concussion Blow

Classic Era's Impale has exactly the same mask [C] [client] (SpellEffect, 1.15.9.69722). There
Rend's ticks can't crit and Sunder Armor deals no damage, so neither bit did anything.

Impale does **not** affect white swings, extra attacks or Deep Wounds. Deep Wounds can't crit in
either profile. Rend can't crit in `classicEra` [C]. In `forever` its ticks may crit through the
periodic-crit flag [?], and **a Rend tick crit takes Impale too: ×2.2 at 2/2** [?]. That's the
default because the mask covers Rend, the tooltip says "your abilities", and nothing in the
client limits Impale to direct damage. The mask is inherited unchanged from Classic Era, where
the Rend bit did nothing, so it shows no design intent either way (Q32;
[damage-and-timing §2.5, §4](../mechanics/damage-and-timing.md#4-dots-and-bleeds)). Sunder
Armor deals no damage, so Impale does nothing for it. Crit-damage bonuses from items, if any,
are covered in [damage-and-timing.md](../mechanics/damage-and-timing.md).

**Flurry** [F] [tal] [client] (SpellAuraOptions, CurvePoint, 1.60.1.69913):

- **Trigger.** Any melee crit (white or yellow, main or off hand, including Heroic Strike,
  Cleave and extra attacks) sets the Flurry buff to **3 charges** and a **15 s** duration
  [F] [client] (SpellMisc, SpellDuration, 1.60.1.69913) (spell 12966, duration 15 000 ms).
- **Effect.** While the buff is up, melee attack speed is multiplied by `1 + 0.05 × rank`, so
  ×1.25 at 5/5. It stacks multiplicatively with other haste; see
  [damage-and-timing.md](../mechanics/damage-and-timing.md).
- **Charges.** Each white swing (main hand, off hand or extra attack) consumes one charge.
  The swing that crits consumes a charge first (if the buff is up) and then refreshes it to 3
  [C] [ws-player]. When the charges run out, the buff drops.
- **The data disagrees with the tooltip.** The Forever buff row still has base 30, but the
  talent's rank curve (5/10/15/20/25) and the tooltip give 25 at 5/5. **Use 25** [F]
  [client] (SpellEffect, CurvePoint, 1.60.1.69913); the leftover base value is Q7.

**Deep Wounds** [F] [tal]; bleed spell and tick timing [F] [client] (SpellName, SpellEffect,
SpellMisc, 1.60.1.69913); other mechanics [C] (the pre-SoD WarriorSim's `DeepWounds` aura,
[ws-spell]):

- **Trigger.** Every crit (white or yellow, main or off hand) applies or refreshes a bleed on
  the target.
- **Damage.** The bleed does `0.20 × rank × MH_avg` over **12 s** in **4 ticks, one every 3
  s**, where `MH_avg = (MH_min + MH_max) / 2 + flat weapon damage + AP / 14 × MH_speed`. This
  uses the **main hand's real speed (not normalized)**, and uses the main hand even when the
  off hand crits [C].
- **Ticks.** Each tick deals a quarter of the total, **recomputed at tick time** with current
  AP and modifiers [C] (the pre-SoD commit's `DeepWounds.step` reads current AP and damage
  modifiers at every tick, [ws-spell]). This is the documented exception to the snapshot
  default in [damage-and-timing §4](../mechanics/damage-and-timing.md#4-dots-and-bleeds).
- **Refresh.** A refresh restarts the 12 s, with the next tick 3 s after the refresh. Old
  damage does not roll over. That rolling behaviour is WarriorSim's later SoD `DeepWounds`
  class, which we don't use [C] [ws-spell]. Whether Forever's bleed restarts its tick timer is
  [?] (Q21): a Fury warrior crits about every 1.6 s, so the default's 115 procs a fight give
  about 17 ticks; a refresh that kept the timer would give about 60, worth about 2% of Fury's
  DPS and 1.5% of Arms'. The results' assumptions say so.
- **Modifiers.** The bleed ignores armor. Physical damage-done modifiers apply (Death Wish,
  Enrage, Two-Handed Weapon Specialization, stance) [C] [ws-spell]. It cannot crit (its Forever
  bleed lacks the periodic-crit flag, [F] [client] (SpellMisc, 1.60.1.69913)) and doesn't proc
  on-hit effects.
- **Spell.** Forever's bleed is spell **412609** ("Deep Wound": aura 226 every 3,000 ms for
  12,000 ms, 4 ticks); the talent 12834 triggers it server-side, with no trigger in the data.
  Classic's bleed 12721 doesn't exist in the Forever client (no `SpellName`, `SpellEffect` or
  `SpellMisc` row, and not encrypted) [F] [client] (SpellName, SpellEffect, SpellMisc,
  1.60.1.69913).

### 2.6 Enrage, Death Wish, Recklessness

**Enrage** [F] [tal] [client] (SpellAuraOptions, SpellEffect, 1.60.1.69913):

- **Trigger.** Each time the warrior is hit by a **damaging** attack, there is a 30% chance to
  gain Enrage. That covers melee, ranged and spell damage. The proc mask is 0x222A8: taken
  melee auto attack, melee ability, ranged, ranged ability, and spell damage.
- **Effect.** +2% per rank Physical damage done for 12 s, refreshed by each new proc. There
  are no charges; Classic's cap of 12 swings is gone. That's +10% at 5/5, applied to white,
  yellow and bleed physical damage.
- **Inputs.** It needs incoming damage events from [encounter.md](../mechanics/encounter.md):
  - **Tanks:** the boss's landed swings (hit, crit, crushing, and blocked hits that still deal
    damage).
  - **DPS:** "raid damage events per minute", default 0. Which events count is Q8.

**Death Wish** [F] [sb] [tal] [db-eff] [db-cd]:

- 10 rage, 3 min cooldown, on the GCD, any stance.
- For 30 s: ×1.20 Physical damage done (white, yellow and bleeds), ×1.05 damage taken, and
  immunity to fear.

**Recklessness** [F] [sb] [db-eff] [db-cd]:

- 0 rage, 30 min cooldown, on the GCD, Berserker Stance only.
- For 15 s: +100% crit chance on all attacks, and +20% damage taken. Its crit is the all-crit
  aura (290), so spells crit more too; Classic Era's is aura 52, melee only, which `classicEra`
  uses (`recklessness(profile)`) [F] [client] (SpellEffect, 1.60.1.69913); [C] [client]
  (SpellEffect, 1.15.9.69722).
- White crits are still bounded by the attack table's crit cap; see
  [combat-tables.md](../mechanics/combat-tables.md). It is usable once per fight.
- In Classic, Recklessness, Retaliation and Shield Wall share a cooldown [wh-tank]. The Forever
  data gives Recklessness its own recovery time (1,800,000 ms, no category) [F]
  [client] (SpellCooldowns, SpellCategories, 1.60.1.69913), so they may be independent now. That
  doesn't matter to a DPS sim.

### 2.7 Weaponmaster, extra attacks and Windfury

Weaponmaster replaces Classic's Sword, Axe, Polearm and Mace Specialization with a single
5-rank Arms talent (tier 5, column 3) [F] [tal] [cls]. It applies by weapon type:

| Weapon | Effect per rank (5/5) | Model | Tag |
| --- | --- | --- | --- |
| **Sword** (1H or 2H) | 1% (5%) chance on a successful melee attack (white or yellow) made with the sword to gain **1 extra attack** | Proc mask 0x14 (auto attack + melee ability). There is a **200 ms internal cooldown** (`ProcCategoryRecovery` 200), so an extra attack can't chain-proc itself. Roll once per ability cast, even for multi-target abilities [?] (only WarriorSim's post-SoD code does this; Magey establishes it for Windfury only; Q9). The extra attack is an immediate main-hand white swing: it resets the main-hand swing timer, consumes a Flurry charge, and becomes the queued Heroic Strike if one is queued [C] [magey-wf] | [F] [client] (SpellAuraOptions, 1.60.1.69913) (spell 12281, proc chance 5, mask 0x14); [C] [client] (SpellAuraOptions, 1.15.9.69722) (the same 200 ms) |
| **Axe or polearm** | +1% (5%) crit chance | **+1% per rank on the attacks made with the axe or polearm, white and special, and not on spells**, as its own tooltip reads: "Increases your chance to get a critical strike with Axes and Polearms by $s1%." The client data is the same kind as the weapon racials' (all crit, aura 290, with an axe-and-polearm `SpellEquippedItems` mask), but their tooltips say "all spells and attacks" while this one names the weapons, and a tooltip beats a value derived from the tables (doctrine §2). With an axe and another weapon only the axe's hand gets it [?] (Q15). It is aura crit, so suppression against a +3-level target applies [magey-crit]. Classic Era's 12700 (Axe Specialization, "with Axes") was aura 52, crit for that weapon's attacks too [C] | [F] [client] (Spell, SpellEffect, SpellEquippedItems, 1.60.1.69913) (spell 12700); [C] [client] (Spell, SpellEffect, 1.15.9.69722) |
| **Mace or staff** | Attacks ignore 3% (15%) of the target's armor | Effective armor = armor after all flat reductions × (1 − 0.03 × rank). The order is an assumption [?] (Q9) | [F] [tal] [db-trait] |

- **What changed from Classic.** Sword, Axe and Polearm used the same numbers in Classic,
  but each cost its own 5 points. Mace Specialization used to be a stun proc, useless against
  bosses; in Forever maces and staves get armor penetration [F] [cls].
- **Weaponmaster isn't available to Fury.** Fury's popular 17/34 build can't reach Arms tier
  5.
- **Windfury** is a shaman buff; its numbers belong to
  [buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md). The rules that
  involve warriors [C] [magey-wf]:
  - It procs only from the main hand, and from Heroic Strike, Cleave, Slam, instant attacks
    and extra attacks.
  - It can't proc itself or twice in the same chain of extra attacks [C] ([magey-wf], 2019
    text).
  - **No 1.5 s internal cooldown** [?]. Magey's page adds one, but its source is a 2023
    statement about SoD's Wild Strikes, which is forbidden evidence. The Forever client does
    give Windfury Totem's proc (10612) a **100 ms** internal cooldown (`ProcCategoryRecovery`
    100) [F] [client] (SpellAuraOptions, 1.60.1.69913), far shorter than any swing timer;
    [damage-and-timing §5.4](../mechanics/damage-and-timing.md#54-extra-attacks-and-chaining)
    owns the rule (Q27).
  - A queued Heroic Strike fires on the Windfury extra attack.
  - A Weaponmaster extra attack can proc Windfury, and a Windfury extra attack can proc
    Weaponmaster, as long as Weaponmaster's 200 ms internal cooldown is ready.

### 2.8 Reactive abilities: Overpower, Bloodthrill, Revenge

- **Overpower window.** When the target **dodges** any of the warrior's attacks (white or
  yellow, either hand), Overpower becomes usable for **5 s**. Using it closes the window [C]
  [ws-spell]; [F] [client] (SpellMisc, SpellDuration, 1.60.1.69913) (spell 1282733 lasts 5000 ms).
  - Forever implements the window as a combo-point-like resource. Overpower has a second cost
    of 1 point of power type 4, and the dodge aura grants 1 point, stacking to 3 [F]
    [client] (SpellPower, SpellAuraOptions, 1.60.1.69913).
  - **Default: one window, refreshed by each new dodge.** Whether windows can be banked is
    Q10. The rule has no stance condition, so a dodge opens it in any stance: that's what the
    Overpower dance relies on.
  - **Using Overpower closes it**, whether it lands or misses: the sim spends the window when
    Overpower is used, as the client's second cost is paid on use [?] (Q10).
  - Overpower needs Battle Stance and has a 5 s cooldown.
- **Bloodthrill** [F] [tal] [client] (SpellAuraOptions, 1.60.1.69913):
  - **Trigger.** When your melee attack hits a target that has **your** Rend, there is a 2%
    per rank chance (10% at 5/5) to open the Overpower window for **6 s**, for 1 use.
  - **Which attacks count.** The data's proc mask is 4, main-hand and off-hand **auto
    attacks** only. The tooltip says "melee attacks". **Default: white swings only**, Q11,
    extra attacks included, since they are auto attacks (Windfury, Weaponmaster, Hand of Justice).
  - The window is the same one a dodge opens. If both are open, one Overpower uses it. A dodge
    while a Bloodthrill window is open doesn't shorten it: the window lasts until the later of
    the two ends [?] (Q11).
- **Revenge window.** After the warrior blocks, dodges or parries, Revenge is usable for
  **5 s** [?] (Q12): assumed like Overpower's, since no allowed source gives its length. It needs
  Defensive Stance and has a 5 s cooldown [F] [sb]. The length matters little: a 4 s window costs
  the default Protection warrior 0.05% of its TPS (−0.51, −0.77 to −0.24), and Max TPS 0.06%; a
  3 s one 0.15% and 0.06% (seed 12345, 20,000 fights).

### 2.9 Racials for warriors

No race gets weapon skill in Forever. Human Sword Specialization, Orc Axe Specialization and
the new Dwarf Mace Specialization grant crit instead. Human Mace Specialization is gone: the
Forever Human racials are Will to Survive, Perception, Sword Specialization and The Human
Spirit [F] [rac]. Every warrior therefore starts at 300 skill with
every weapon, and weapon skill only comes from items; the hit and glancing consequences are in
[combat-tables.md](../mechanics/combat-tables.md). Stat numbers belong to
[character-stats.md](../mechanics/character-stats.md). **Both rule profiles use these Forever
racials**: `classicEra` swaps in Classic Era's combat rules and spell values, not Classic Era's
racials ([architecture](../architecture.md#rules-and-stats)). The warrior-relevant effects:

| Race | Racial (Forever) | Sim model | Tag |
| --- | --- | --- | --- |
| Human | Sword Specialization: +2% crit with all attacks while a sword or two-handed sword is equipped (Classic: +5 sword and mace skill) | +2% aura crit on all attacks (and spells) while a sword is in either hand: with a mace and a sword, both hands' attacks get it [?] (Q15) | [F] [rac] [client] (SpellEffect, 1.60.1.69913) (spell 20597) |
| Orc | Axe Specialization: +1% crit while an axe is equipped. **Blood Fury: +10% AP** (and spell power) for 15 s, 2 min cooldown, off the GCD (Classic: +25% of base AP) | +1% aura crit on all attacks while an axe is in either hand [?] (Q15); AP ×1.10 | [F] [rac] [client] (SpellEffect, SpellDuration, SpellCooldowns, 1.60.1.69913) (20574, 20572) |
| Dwarf | Mace Specialization: +1% crit while a mace is equipped. Stoneform: −10% physical damage taken for 8 s, 3 min cooldown, **on the GCD** | +1% aura crit on all attacks while a mace is in either hand [?] (Q15) | [F] [rac] [client] (SpellEffect, SpellCooldowns, 1.60.1.69913) (1259719, 20594) |
| Night Elf | **Elune's Light: +10% crit for 15 s, 3 min cooldown**. Quickness: +1% dodge | 10% crit cooldown (all crit: spells too) | [F] [rac] [client] (SpellEffect, SpellDuration, 1.60.1.69913) (1259799) |
| Gnome | Expansive Mind: **+5% max rage**. **Eureka!: the next 3 damaging abilities cost 40% less rage and deal +10% damage**, 15 s, 2 min cooldown | See Q17 and Q18 | [F] [rac] [client] (SpellEffect, SpellDuration, 1.60.1.69913) (1259802, 1259813) |
| Troll | **Berserking: +10% attack speed for 10 s, 3 min cooldown** (Classic: 10–30%, scaling with missing health). Beast Slaying: +5% vs Beasts | ×1.10 haste | [F] [rac] [client] (SpellEffect, SpellDuration, SpellPower, 1.60.1.69913) (20554) |
| Tauren | Endurance: +5% health and **+1% hit** | +1% melee hit | [F] [rac] [client] (SpellEffect, 1.60.1.69913) (20550) |
| Undead | Touch of the Grave: 5% chance on attacks to drain health, up to 5% of max health | Healing only, not simulated [?] (Q16) | [F] [rac]; 1260189 exists [client] (SpellEffect, 1.60.1.69913) |
| Skyborne | Wind Blessed: **+1% haste**. Elemental Insight: +5% damage vs Elementals | ×1.01 haste; ×1.05 against Elementals | [F] [rac] [db-eff] (1259710) |

## 3. Abilities at level 60

All values are for the max rank a level-60 warrior has in Forever [sb]. "Cost" is the base cost;
[§2.3](#23-rage-warrior-specific) lists the talent reductions. `normalized` means weapon
damage with AP scaled at the normalized speed: 3.3 for two-handers, 2.4 for one-handers, 1.7
for daggers. `weapon` means the real speed. Both are defined in
[damage-and-timing.md](../mechanics/damage-and-timing.md).

### 3.1 Damage abilities

| Ability (rank, spell id) | Cost | Cooldown | GCD | Stance | Damage and effect | Tag |
| --- | --- | --- | --- | --- | --- | --- |
| Heroic Strike (9, 25286) | 15 | none | off (next swing) | any | MH `weapon` + 157 | [F] [sb] [client] (SpellEffect, 1.60.1.69913) |
| Cleave (5, 20569) | 20 | none | off (next swing) | any | MH `weapon` + 50 to the target and one more enemy | [F] [sb] [db-eff] |
| Bloodthirst (4, 23894) | 30 | 6 s | yes | any | **0.35 × AP + 48**, physical, not weapon-based. Also +10% movement speed for 10 s (ignore) | [F] [sb] [client] (SpellEffect, 1.60.1.69913). Classic: 0.45 × AP [C] |
| Mortal Strike (4, 21553) | 30 | 6 s | yes | any | MH `normalized` + 160. Also −50% healing on the target for 10 s | [F] [sb] [db-eff] |
| Whirlwind (1680) | 25 | 10 s | yes | Berserker | MH `normalized` to up to 4 targets within 8 yd. With Raging Blows it also strikes with the off hand; see below | [F] [sb] [db-eff] |
| Slam (5, 11605; Improved Slam version 1310200) | 15 | **15 s** | 1.5 s, −0.25 s per rank of Improved Slam | any | MH `weapon` + 87. **Cast 1.5 s**, −0.25 s per rank of Improved Slam. See the Slam notes below | [F] [sb] [client] (SpellCooldowns, SpellCastTimes, 1.60.1.69913) [tal] |
| Execute (5, 20662) | 15 | none | yes | Battle, Berserker | Only on targets at or below 20% health. **600 + 15 × (rage − cost)**; a successful hit spends all rage. The 15 per rage is client data, not a server script: the damage effect's `EffectChainAmplitude` 1.5, which the tooltip's `$*10;F1` shows as 15 (ranks 1–5: 3, 6, 9, 12, 15) | [F] [sb] [client] (SpellEffect, 1.60.1.69913); rage rules [C] [marrow] [ws-spell] |
| Overpower (4, 11585) | 5 | 5 s | yes | Battle | MH `normalized` + 35. Can't be dodged, parried or blocked. Improved Overpower adds +25% crit chance per rank. Needs the Overpower window ([§2.8](#28-reactive-abilities-overpower-bloodthrill-revenge)), which it closes | [F] [sb] [tal] [client] (SpellPower, SpellEffect, 1.60.1.69913) |
| Hamstring (3, 7373) | 10 | none | yes | Battle, Berserker | 45 physical damage (flat, rolls on the melee table) and a 50% snare. Used to fish for procs | [F] [sb] [db-eff] |
| Rend (7, 11574) | 10 | none | yes | Battle, Defensive | Bleed: 147 over 21 s, 21 per 3 s tick. Improved Rend multiplies it by 1 + 0.12 / 0.23 / 0.35. The application rolls miss, dodge and parry and can't crit; the ticks ignore armor and, in `forever`, may crit ([§2.5](#25-crits-impale-flurry-deep-wounds)). It enables Bloodthrill | [F] [sb] [tal] [db-eff] [client] (SpellEffect, SpellMisc, 1.60.1.69913) |
| Spearing Strike (1310222) | 15 | 20 s | yes | any, two-hander only | **0.40 × MH `normalized`**. Against **Giants, Dragonkin and mounted targets**, 1.20 × (+80%) | [F] [tal] [db-eff] (effect 121 + weapon-% effect 31 = 40) [?] (Q13) |
| Thunder Clap (6, 11581) | 20 | **6 s** | yes | Battle, **Defensive** | 103 damage to up to 4 targets. Rolls as a spell-type attack (defense type 1), so it can't be dodged or parried. Also a −20% attack-speed debuff for 30 s | [F] [sb] [client] (SpellCategories, 1.60.1.69913). Threat is in [threat.md](../mechanics/threat.md) |
| Revenge (6, 25288) | 5 | 5 s | yes | Defensive | **138–168** (153 ±10%) × (1 + 0.20 × Improved Revenge rank). Needs the Revenge window ([§2.8](#28-reactive-abilities-overpower-bloodthrill-revenge)) | [F] [sb] [db-eff] |
| Shield Slam (4, 23925) | 20 | 6 s | yes | any, shield | **640–670 + block value** (655 ±2.3%). Also a 50% chance to dispel one magic effect | [F] [sb] [db-eff]. Block value is in [character-stats.md](../mechanics/character-stats.md) |
| Victory Rush (402927) | 0 | 30 s | yes | any | 1 damage and heals 10% of max health. Only usable within 20 s of killing a non-trivial enemy. **Not used against bosses** | [F] [sb] (Q14) |

**Slam.**

- **Without Improved Slam**, the Classic behaviour applies. No white swings land during the
  cast, and when the cast completes the main-hand timer resets, and so does the off-hand's if
  there is one [C] ([marrow]: a mistimed Slam clips the next auto;
  [damage-and-timing §3.3](../mechanics/damage-and-timing.md#33-swing-reset-rules)).
- **With Improved Slam 1/2 or 2/2**, the cast and the Slam GCD shrink by 0.25 s per rank, and
  **swing timers are unaffected**: white swings keep landing during the cast, and nothing
  resets afterwards [F] [tal]. The Improved Slam versions of Slam (1310196–1310200) replace
  the action bar spells [client] (SpellName, 1.60.1.69913); see Q19.
- Other GCD abilities can't start during the cast.
- The docs don't say when Slam pays its cost, what else can happen during the cast, or how
  haste affects it. The engine's choices are in [§7](#7-implementation-notes) ("Slam's cast"),
  and the open parts are in Q3.

**Raging Blows (off-hand Whirlwind).** Each Whirlwind target is also hit by an off-hand strike.
Assumed damage: OH `normalized` × the off-hand damage multiplier `0.5 × (1 + 0.05 × Dual Wield
Specialization rank)`. The strike rolls its own attack table using off-hand hit (with Dual Wield
Specialization's OH hit) and can crit (Impale applies) and proc on-hit effects [?] (Q13).

**Execute details.**

- **Rage for the damage** is read when Execute is cast, after its cost is spent: the damage
  uses `rage − cost` [C] [marrow].
- **After a hit**, rage goes to 0 [C] [ws-player].
- **After a miss, dodge or parry**, only the cost is lost, with no refund [C] [ws-player].
- **No cap on the conversion.** With Boundless Rage 3/3 and a full 130-rage bar, the extra
  rage is 115 at cost 15 [F] [tal].

**Bloodthirst details.** The AP used is the warrior's full melee attack power after all
buffs. It is physical, so armor applies, and it uses the special attack table [F] [sb].

### 3.2 Buffs, debuffs and cooldowns

| Ability (rank, spell id) | Cost | Cooldown | GCD | Stance | Effect | Tag |
| --- | --- | --- | --- | --- | --- | --- |
| Battle Shout (7, 25289) | 10 | none | yes | any | +139 melee AP to the party (20 yd) for 3 min. `classicEra`: Classic Era's rank 7, +232 for 2 min (231 + 1, +1 per level from 60; `DurationIndex` 4), the same cost and GCD | [F] [sb] [client] (SpellEffect, 1.60.1.69913); `classicEra` [C] [client] (SpellEffect, SpellLevels, SpellMisc, SpellDuration, 1.15.9.69722) |
| Demoralizing Shout (5, 11556) | 10 | none | yes | any | −204 AP to enemies within 10 yd for 45 s: the level-60 tooltip, base −196 and −1.4 per level above 54 (levels 54–64, so `MaxLevel` doesn't cap it below 60), −204.4 shown as 204. Whether the debuff applies −204 in combat is an open question (Q22) | tooltip [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913); in combat [?] |
| Sunder Armor (5, 11597) | 15 | none | yes | any | −450 armor per stack, 5 stacks, 30 s. The client data also carries a THREAT effect of 1013 | [F] [sb] [client] (SpellEffect, 1.60.1.69913) (Q1) |
| Bloodrage (2687) | 0 (costs health) | 60 s | off | any | +10 rage, then +10 over 10 s | [F] [sb] [client] (SpellEffect, 1.60.1.69913) |
| Berserker Rage (18499) | 0 | 30 s | **yes** | Berserker | For 10 s, immune to fear and incapacitate, and extra rage from damage taken. Improved Berserker Rage: +5 / +10 rage | [F] [sb] [db-cd] [tal] |
| Death Wish (12328) | 10 | 3 min | yes | any | For 30 s: +20% Physical damage done, +5% damage taken, fear immunity | [F] [tal] [db-eff] |
| Recklessness (1719) | 0 | 30 min | yes | Berserker | For 15 s: +100% crit chance and +20% damage taken | [F] [sb] [db-eff] |
| Sweeping Strikes (12292) | 30 | 30 s | off | Battle | Next 5 melee attacks within 20 s also strike an additional nearby enemy | [F] [tal] [db-aura] |
| Shield Block (2565) | 10 | 5 s | off | Defensive, shield | +75% block chance for 7 s or 2 blocks, whichever comes first | [F] [sb] [db-aura] |

### 3.3 Not simulated

These are utility abilities, or abilities that don't work on raid bosses. They aren't in
any APL:

- Charge (except the optional opener rage, [§2.3](#23-rage-warrior-specific))
- Intercept, Pummel, Shield Bash, Taunt (8 s cooldown), Mocking Blow and Disarm
- Challenging Shout, Intimidating Shout and Piercing Howl
- Retaliation (15 min), Shield Wall (60% for 12 s, 15 min), Last Stand (3 min)
- Concussion Blow (10 rage, 45 s; bosses are immune to stuns) and Victory Rush

All values are from [sb] and [db-cd]. Skipping them follows the "model what moves the
result" rule in [doctrine §4](../doctrine.md#4-engine).

## 4. Talents

Forever uses the same 51-point, tier-gated grid as Classic (5 points per tier). Rank values
below are the Forever tooltips from [tal]. They match the client's trait rank curves value for
value [F] [client](../data/client.md#talentsjson) (TraitDefinitionEffectPoints, CurvePoint,
1.60.1.69913), except two effects the tooltips don't print as stored (Last Stand's hidden
effect and Improved Shield Wall's ms-to-minutes; neither is simulated). **The engine reads
ranks from `src/data/talents/warrior.json`**; the "Model" column says what each one does.
"Not simulated" talents have no effect on DPS or TPS. Tier·Col is 1-based.

### 4.1 Arms (17 talents)

| Tier·Col | Talent (ranks) | Forever tooltip at max rank (quote) | Per rank, and change from Classic | Model |
| --- | --- | --- | --- | --- |
| 1·1 | Improved Heroic Strike (3) | "Reduces the cost of your Heroic Strike ability by 3 Rage." | −1. Unchanged | Heroic Strike cost |
| 1·2 | Deflection (5) | "Increases your Parry chance by 5%." | +1% parry. Unchanged | Tank avoidance (feeds Revenge and Master of Defense) |
| 1·3 | Improved Rend (3) | "Increases the Bleed damage done by your Rend ability by 35%." | 12/23/35% (Classic 15/25/35%) | Rend damage ×(1 + x) |
| 2·1 | Improved Charge (2) | "Increases the Rage generated by your Charge ability by 6." | +3. Unchanged | Opener rage only |
| 2·2 | Improved Tactical Mastery (5) | "Tactical Mastery lets you retain up to an additional 15 Rage when you change stances." | +3 on top of the trained Tactical Mastery's 10. Classic's Tactical Mastery was +5 per rank from 0 | Stance-swap rage retention |
| 2·4 | Improved Overpower (2) | "Increases the critical strike chance of your Overpower ability by 50%." | +25%. Moved from tier 3 to tier 2 | Overpower crit chance |
| 3·2 | Anger Management (1), needs Improved Tactical Mastery 5/5 | "Generates 1 Rage every 3 sec while in combat, and reduces Rage loss while out of combat by 30%." | The same effect as Classic; the in-combat part is now in the tooltip | +1 rage every 3 s |
| 3·3 | Deep Wounds (3), needs Improved Rend 3/3 | "Your critical strikes cause your opponent to Bleed, dealing 60% of your melee weapon's average damage over 12 sec." | 20%. Unchanged | [§2.5](#25-crits-impale-flurry-deep-wounds) |
| 4·1 | **Spearing Strike (1), new** | "A brutal attack that deals 40% weapon damage. Deals an additional 80% weapon damage against Giants, Dragonkin, and mounted targets. Mounted targets are dismounted." 15 rage, 20 s cooldown, two-hander required | New | Ability, [§3.1](#31-damage-abilities) |
| 4·2 | Two-Handed Weapon Specialization (3) | "Increases the damage you deal with two-handed melee weapons by 3%." | 1%. **3 ranks, 3% (Classic 5 ranks, 5%)** | ×1.03 on all physical damage while a two-hander is equipped. WarriorSim applies the weapon modifier to every attack and to Deep Wounds [C] [ws-player] |
| 4·3 | Impale (2) | "Increases the critical strike damage bonus of your abilities by 20%." | 10%. No longer needs Deep Wounds | Ability crit multiplier 2.2 at 2/2 |
| 5·1 | **Bloodthrill (5), new** | "Your melee attacks against targets afflicted by your Rend have a 10% chance to activate your Overpower ability for 1 attack on your current target. Lasts 6 sec." | 2% | [§2.8](#28-reactive-abilities-overpower-bloodthrill-revenge) |
| 5·2 | Sweeping Strikes (1) | "Your next 5 melee attacks strike an additional nearby opponent." | Unchanged | Multi-target only |
| 5·3 | **Weaponmaster (5), new** | "Axe/Polearm: Increases your critical strike chance by 5%. Mace/Staff: Your attacks ignore 15% of your target's armor. Sword: Your successful melee attacks have a 5% chance to trigger an extra attack on the target." | 1% / 3% / 1% | Per weapon ([§2.7](#27-weaponmaster-extra-attacks-and-windfury)): the axe and polearm crit counts only for that weapon's attacks, not spells, as its spell's tooltip (12700, "…with Axes and Polearms") reads, unlike the weapon racials' "all spells and attacks" ([§2.9](#29-racials-for-warriors), Q15) |
| 6·1 | Improved Slam (2) | "Reduces the global cooldown and cast time of your Slam ability by 0.50 sec. In addition, Slam no longer interrupts your melee swing time." | −0.25 s. **Rewritten, moved from Fury to Arms** (Classic: −0.1 s cast per rank, 5 ranks) | [§3.1](#31-damage-abilities) Slam notes |
| 6·3 | Improved Hamstring (3) | "Gives your Hamstring ability a 15% chance to immobilize the target for 5 sec." | Unchanged | Not simulated |
| 7·2 | Mortal Strike (1), needs Sweeping Strikes | "A vicious strike that deals weapon damage plus 85 and wounds the target…" (rank 1) | Unchanged; rank 4 is +160 | Ability |

### 4.2 Fury (18 talents)

| Tier·Col | Talent (ranks) | Forever tooltip at max rank (quote) | Per rank, and change from Classic | Model |
| --- | --- | --- | --- | --- |
| 1·2 | Booming Voice (5) | "Increases the radius of your Battle Shout and Demoralizing Shout abilities by 50%." | The Classic duration bonus is gone from both tooltip and data [db-eff] | Not simulated |
| 1·3 | Cruelty (5) | "Improves your chance to get a critical strike with melee attacks by 5%." | +1%. Unchanged | +x% melee aura crit |
| 2·2 | Iron Will (5) | "Reduces the duration of Stun and Fear effects inflicted on you by 15%." | Moved from Protection; rewritten | Not simulated |
| 2·3 | Unbridled Wrath (5) | "Gives you a 60% chance to generate 1 additional Rage when you deal melee damage with a weapon. This effect is increased to 2 Rage for two-handed weapons." | 12% (Classic 8%). **+2 rage with a two-hander, new** | [§2.3](#23-rage-warrior-specific) |
| 3·1 | Improved Cleave (3) | "Reduces the Rage cost of your Cleave ability by 3." | −1 (Classic: +40% bonus damage per rank) | Cleave cost |
| 3·2 | Piercing Howl (1) | Daze nearby enemies (−50% movement for 6 s) | Unchanged | Not simulated |
| 3·3 | Blood Craze (3) | "Regenerates 3% of your total Health over 6 sec after being the victim of a critical strike, dealing damage with Bloodthirst, or suffering more than 20% of your maximum Health from a single attack." | Wider trigger | Not simulated (healing) |
| 3·4 | **Boundless Rage (3), new** | "Increases your maximum Rage by 30." | +10 | Max rage |
| 4·1 | Dual Wield Specialization (5) | "Increases your off-hand weapon damage by 25%, off-hand Rage generation by 100%, and chance to hit with off-hand attacks by 10%." | +5% damage, +20% rage, +2% hit. **The rage and hit parts are new** | Off-hand damage ×0.5 × (1 + 0.05r); off-hand rage ×(1 + 0.2r); +2r% hit on **off-hand attacks only**, which the tooltip specifies (Q4) |
| 4·2 | **Raging Blows (1), new** | "Causes your Whirlwind to also strike with your off-hand weapon, and reduces the Rage cost of your Cleave ability by 2." | New | [§3.1](#31-damage-abilities); Cleave −2 |
| 4·3 | Enrage (5) | "Gives you a 30% chance to deal 10% increased Physical damage for 12 sec after being the victim of any damaging attack." | +2%. **Rewritten** | [§2.6](#26-enrage-death-wish-recklessness) |
| 4·4 | Improved Execute (2) | "Reduces the Rage cost of your Execute ability by 5." | −3 at rank 1 (Classic −2), −5 at rank 2; moved from column 2 to column 4 | Execute cost |
| 5·1 | **Precision (3), new** | "Improves your chance to hit by 3%." | +1% | +x% melee hit (the data also adds spell hit) [db-eff] |
| 5·2 | Death Wish (1) | "When activated, increases your Physical damage done by 20% and makes you immune to Fear effects, but increases all damage you take by 5%. Lasts 30 sec." | The penalty is now +5% damage taken (Classic: −20% armor and resistances) | Ability, [§2.6](#26-enrage-death-wish-recklessness) |
| 5·4 | Improved Intercept (2) | Intercept cooldown −10 s | Unchanged | Not simulated |
| 6·1 | Improved Berserker Rage (2) | "Your Berserker Rage ability will instantly generate 10 Rage and has a 100% chance to remove all movement impairing effects when activated." | +5 rage; the snare removal is new | Berserker Rage +rage |
| 6·3 | Flurry (5), needs Enrage 5/5 | "Increases your melee attack speed by 25% for your next 3 swings after dealing a melee critical strike." | 5% (Classic 10% at rank 1, 30% at rank 5) | [§2.5](#25-crits-impale-flurry-deep-wounds) |
| 7·2 | Bloodthirst (1), needs Death Wish | "Instantly attack the target causing damage equal to 35% of your Attack Power plus 30 and increasing your movement speed by 10% for 10 sec." (rank 1; rank 4 is + 48) | **Rewritten** | Ability, [§3.1](#31-damage-abilities) |

### 4.3 Protection (18 talents)

| Tier·Col | Talent (ranks) | Forever tooltip at max rank (quote) | Per rank, and change from Classic | Model |
| --- | --- | --- | --- | --- |
| 1·2 | Shield Specialization (5) | "Increases your chance to Block attacks with your shield by 5% and grants you a 100% chance to generate 5 Rage when you Block." | +1% block, 20% chance. **5 rage per block (Classic 1)** | Block chance; rage on block |
| 1·3 | Anticipation (5) | "Increases your Defense Skill by 20." | +4 (Classic +2) | Defense skill (for [combat-tables.md](../mechanics/combat-tables.md)) |
| 2·1 | Improved Bloodrage (2) | "Increases all the Rage generated by your Bloodrage ability by 50%." | +25% (Classic: +2 / +5 instant) | Bloodrage ×1.5 |
| 2·3 | Toughness (5) | "Increases your Armor value from items by 10%." | +2%. Unchanged | Armor from items |
| 2·4 | Improved Thunder Clap (3) | "Reduces the Rage cost of your Thunder Clap ability by 6." | −2 (Classic −1/−2/−4); moved from Arms | Thunder Clap cost (the "Protection + Improved Thunder Clap" preset, not the default build) |
| 3·1 | Last Stand (1), needs Improved Bloodrage | "…temporarily grants you 30% of your maximum health for 20 sec…" 3 min cooldown (Classic 10 min) [db-cd] | Cooldown only | Not simulated |
| 3·2 | **Master of Defense (2), new**, needs Shield Specialization | "Grants you a 100% chance to generate 5 Rage when you Dodge or Parry while a shield is equipped." | 50% | Rage on dodge or parry |
| 3·3 | Improved Revenge (3) | "Increases damage dealt by your Revenge ability by 60%." | +20% (Classic: stun chance) | Revenge damage ×(1 + 0.2r), on its base and range (12797: aura 108, curve 20 / 40 / 60 [client]; W14) |
| 3·4 | Defiance (3) | "Increases all threat generated in Defensive stance by an additional 15% while a shield is equipped." | 5% (Classic 3% per rank, 5 ranks, no shield needed) | Threat ×(1 + 0.05r) with Defensive Stance and a shield |
| 4·1 | Improved Sunder Armor (3) | "Reduces the Rage cost of your Sunder Armor ability by 3." | −1. Unchanged | Sunder cost |
| 4·2 | Improved Disarm (3) | Disarm cooldown −20 s | Rewritten | Not simulated |
| 4·3 | **Vanguard (1), new** | "Your Charge ability is now usable while in Defensive Stance." | New | Opener rage for tanks: with it, Protection's pre-pull Charge is on by default and needs no stance swap ([§5.4](#54-protection-tps) row 0) |
| 5·1 | Improved Shield Wall (2) | Shield Wall cooldown −11 min | Rewritten | Not simulated |
| 5·2 | Concussion Blow (1) | "Stuns the target for 5 sec." 10 rage, 45 s | Cost 15 → 10 | Not simulated |
| 5·3 | Improved Shield Bash (2) | 100% chance to silence for 3 s | Unchanged | Not simulated |
| 5·4 | Bastion (5) | "Increases all damage you deal by 10% while a shield is equipped." | +2%. Replaces One-Handed Weapon Specialization; moved from tier 6 to tier 5 | ×(1 + 0.02r) with a shield (the data is a physical-school damage aura; all warrior damage is physical) [db-eff] |
| 6·3 | **Focused Rage (3), new** | "Reduces the Rage cost of your offensive abilities by 3." | −1 | The ability list is in [§2.3](#23-rage-warrior-specific) |
| 7·2 | Shield Slam (1), needs Concussion Blow | "…causing 421 to 439 damage, increased by your Block Value…" (rank 1; rank 4 is 640–670) | Damage ×1.87 | Ability ([§3.1](#31-damage-abilities), W15); without it, Protection's row 7 is never used |

### 4.4 Classic talents not in the Forever trees

These are gone [cls]:

- Sword, Mace, Axe and Polearm Specialization, now Weaponmaster
- Improved Taunt
- Improved Shield Block; two blocks are now baseline
- Improved Battle Shout and Improved Demoralizing Shout

Two more were replaced:

- Tactical Mastery became a trained spell (keeps 10 rage) plus Improved Tactical Mastery.
- One-Handed Weapon Specialization became Bastion.

## 5. Spec models and rotations

### 5.1 Conventions for rotation settings

- **The APL is a priority list.** At every decision point, the first usable entry whose
  conditions hold is used; see [architecture.md](../architecture.md). Entries marked "off the
  GCD" are checked as well as the GCD action.
- **Setting ids** are `warrior.<spec>.<ability>.<param>`. Every threshold is in **absolute
  rage points**. Defaults assume the spec's default talents, including a 130 rage cap for Fury.
- **GCD-safe** means that spending the next GCD won't delay a higher-priority ability: every
  higher-priority ability in the list still has at least one GCD of cooldown left.
  WarriorSim implements this idea as its `maincd` option [C] [ws-spell]. An ability the current
  stance refuses isn't coming up, so it doesn't count, unless a line dances for it and that dance
  could happen at the current rage ([§7](#7-implementation-notes) "Stance dancing", "GCD-safe and
  stances"). Arms measures "one GCD" as the line's own:
  1 s for Slam with Improved Slam 2/2 ([§5.3](#53-arms-two-hander)); Fury's lines all have 1.5 s.
- **Defaults can follow the setup.** A switch's default can depend on a talent or on another
  setting (Arms: Rend is on by default only with Bloodthrill; the base stance moves Rend,
  Overpower and Whirlwind). The first rule that matches wins, the Rotation tab shows the result,
  and a value you set yourself always wins ([§5.3](#53-arms-two-hander) notes).
- **A choice** picks one of a few named values (Arms: `arms.baseStance`, `battle` or
  `berserker`), shown as a segmented control ([ux.md](../ux.md#sections) "Rotation").
- **Stance-dance lines** swap to the stance their ability needs, use it, and swap back. Each
  swap keeps at most the Tactical Mastery cap ([§2.1](#21-stances)), so the line's `maxRage`
  (default: the cap, 25 with the default build) stops the swap in from wasting rage.
- **Reaction time and latency** are zero: the rotation acts at the very millisecond a GCD or
  cooldown ends, rage arrives or a window opens. [damage-and-timing §3.6](../mechanics/damage-and-timing.md#36-server-tick-and-spell-batching)
  owns that assumption [?]; there's no setting for it.
- **Execute phase** starts when target health is at or below 20%. The encounter model supplies
  the health curve.

### 5.2 Fury (dual wield)

Base stance: **Berserker**. Weapons: two one-handers. The default talents are the popular
17/34/0 build ([§6.1](#61-talent-builds)), so these values follow from it:

| Value | Default build | How it's derived |
| --- | --- | --- |
| Heroic Strike cost | 12 | 15 − 3 (Improved Heroic Strike 3/3) |
| Cleave cost | 15 | 20 − 3 (Improved Cleave 3/3) − 2 (Raging Blows) |
| Execute cost | 15 | No Improved Execute |
| Max rage | 130 | Boundless Rage 3/3 |
| Rage kept on a stance swap | 25 | Tactical Mastery 10 + Improved Tactical Mastery 5/5 |
| Flurry | 25% | 5/5 |
| Unbridled Wrath | 60% | 5/5 |
| Off-hand rage | ×2.0 | Dual Wield Specialization 5/5 |
| Off-hand hit | +10% | Dual Wield Specialization 5/5 |
| Enrage | +10% | 5/5 |
| Ability crit multiplier | 2.2 | Impale 2/2 |
| Precision | not taken | The popular build skips it; the 15/36 variant in [§6.1](#61-talent-builds) takes it |

It began as the Classic Era community priority [wh-fury] [marrow] [ws-spells], adjusted for
Forever. The defaults are now the best rotation found for the default setup
([D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23);
[Tuning the defaults](#tuning-the-defaults-m25b) below): the Overpower dance is on, Hamstring is
off, and Death Wish, Recklessness and the Mighty Rage Potion follow the execute phase.

| # | Action | Condition (defaults) | Setting ids (default) | On by default |
| --- | --- | --- | --- | --- |
| 0 | Pre-pull | Battle Shout at −3 s (with row 1 on); Bloodrage at −1 s. No Charge; the warrior walks in, as in [wh-fury] | `fury.prepull.battleShout` (on; needs `fury.battleShout.enabled`), `fury.prepull.bloodrage` (on), `fury.prepull.charge` (off; adds 15 rage, +3 per Improved Charge rank, and needs a swap to Berserker Stance that keeps only 25) | yes |
| 1 | Battle Shout | Buff missing, or at most `refreshBelowSec` left and it would run out before the fight ends; rage ≥ 10. It replaces the Buffs tab's Battle Shout; see the notes | `fury.battleShout.enabled` (on), `.refreshBelowSec` (3) | yes |
| 2 | Death Wish | On cooldown from the pull. If `alignToEnd` is on, the final use waits until 30 s are left, so it lasts until the fight ends, or until `beforeExecuteSec` before the execute phase starts, whichever comes first. Without an execute phase, or with Execute (row 7) off, only the 30 s | `fury.deathWish.enabled` (on), `.alignToEnd` (on), `.beforeExecuteSec` (3; dimmed with Execute off) | yes |
| 3 | Racial or trinket cooldowns | Use together with Death Wish, then on cooldown; see the notes. Blood Fury, Berserking, Elune's Light and Eureka! ([§2.9](#29-racials-for-warriors), §7), and the on-use trinkets the sim models: Weakness Analyzer, and Earthstrike (+280 attack power for 20 s, modelled with the shaman); Diamond Flask, now a heal, left the pool (Q30) | `fury.racial.enabled` (on), `fury.trinkets.enabled` (on), `fury.cooldowns.syncWithDeathWish` (on; `fury.racial.syncWithDeathWish` before M2.2c, carried over) | yes |
| 4 | Recklessness | Once: `beforeExecuteSec` before the execute phase starts, or when ≤ `lastSec` s are left, whichever comes first. Without an execute phase, or with Execute off, only the latter. It needs Berserker Stance | `fury.recklessness.enabled` (on), `.beforeExecuteSec` (1.5; dimmed with Execute off), `.lastSec` (16) | yes |
| 5 | Bloodrage (off the GCD) | On cooldown, if it won't push rage over the cap: rage ≤ max − 20 | `fury.bloodrage.enabled` (on), `.maxRage` (max − 20) | yes |
| 6 | **Execute phase** (target ≤ 20%): Bloodthirst | AP ≥ `btOverExecuteAp` and rage ≥ 30 | `fury.execute.bloodthirst` (on; new with the priority list, below, so the row has its own switch), `fury.execute.btOverExecuteAp`, default **2220**: [W11](#w11-bloodthirst-versus-execute-break-even) at the default build's Execute cost 15. The default doesn't follow the build: with Improved Execute 2/2 (cost 10) set 2434 | yes |
| 7 | Execute phase: Execute | Rage ≥ cost + `minExtraRage`. Uses Execute on every GCD; Heroic Strike keeps queueing unless `heroicStrikeInExecute` is off | `fury.execute.enabled` (on), `.minExtraRage` (0), `.whirlwindInExecute` (off), `.heroicStrikeInExecute` (on) | yes |
| 8 | Bloodthirst | Off cooldown; rage ≥ cost | `fury.bloodthirst.enabled` (on) | yes |
| 9 | Whirlwind | Off cooldown; rage ≥ 25 + `reserve`; Bloodthirst cooldown ≥ `btCdMinSec` | `fury.whirlwind.enabled` (on), `.reserve` (0), `.btCdMinSec` (0.5) | yes |
| 10 | Overpower (stance dance) | Window open; rage ≤ `maxRage`; Bloodthirst and Whirlwind are GCD-safe. Swap to Battle, Overpower, swap back; the swap keeps at most 25, so above that it loses the rest. See the notes | `fury.overpower.enabled` (on), `.maxRage` (40) | yes |
| 11 | Heroic Strike queue (off the GCD) | Rage ≥ `minRage`; with `unqueue` on, unqueue if rage falls below `unqueueBelow` before the swing. In both phases unless `heroicStrikeInExecute` (row 7) is off | `fury.heroicStrike.enabled` (on), `.minRage` (40), `.unqueue` (on), `.unqueueBelow` (20) | yes |
| 12 | Hamstring (filler to fish for procs) | Rage ≥ `minRage`; Bloodthirst and Whirlwind are GCD-safe; optionally only when Flurry is down | `fury.hamstring.enabled` (off), `.minRage` (60), `.onlyWhenFlurryDown` (off) | no |
| 13 | Berserker Rage | With Improved Berserker Rage: on cooldown, when GCD-safe and rage ≤ max − 10. Without it: not used (its only other effect is Q20's extra rage from damage taken) | `fury.berserkerRage.enabled` (on; the plan skips it without Improved Berserker Rage), `.maxRage` (max − 10) | with the talent |
| 14 | Sunder Armor | Keep `stacks` stacks up, when no one else in the raid applies them. **Not simulated** until Protection (M3) brings Sunder Armor; until then the Buffs tab's Sunder Armor debuff stands for the raid's | none yet (planned: `fury.sunder.enabled` (off), `.stacks` (5)) | no |
| 15 | Slam | Not used by dual wield: without Improved Slam it resets both swing timers. When on: Bloodthirst and Whirlwind are GCD-safe; outside the execute phase | `fury.slam.enabled` (off) | no |
| 16 | Mighty Rage Potion (consumable, off the GCD) | Once. With Execute (row 7) and an execute phase: in the phase at rage ≤ `maxRage`, or, if it hasn't been drunk by the phase's last 2 s, then at rage ≤ the build's cap minus 75 (55 with Boundless Rage 3/3); but when Recklessness (row 4) comes by its clock, the phase being too short for its `beforeExecuteSec`, with Recklessness at rage ≤ that cap minus 75. Without an execute phase, or with Execute off: in the last 20 s at rage ≤ that cap minus 75, once Recklessness has been used. Only when it's selected in Buffs; see the notes | `fury.ragePotion.enabled` (on), `.maxRage` (0, in the phase: once an Execute has emptied the bar) | with the consumable |
| 17 | Juju Flurry (consumable, off the GCD) | On cooldown from the pull. Only when it's selected in Buffs | `fury.jujuFlurry.enabled` (on) | with the consumable |

**The priority list** ([D31](../decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24)).
These rows are a list you reorder on the Rotation tab (`FURY_APL` in `src/sim/classes/warrior/fury.ts`);
the table's order is the default. Row 0 is pinned first. Row 3 is two rows, the racial and the
on-use trinkets, which share "Racial and trinkets with Death Wish". Row 6 has its own switch,
`fury.execute.bloodthirst`: off, Bloodthirst isn't used in the execute phase, so Whirlwind there
doesn't wait for it and the Overpower dance and Berserker Rage there are GCD-safe for Whirlwind
alone. It needs row 8's switch too: with Bloodthirst off it does nothing, and the tab dims it
("Not used: Bloodthirst is off."). Rows 16 and 17 are spec-wide settings above the list, and always come after it: they're
off the GCD. **A row's conditions are its own and don't change when it moves.** Whirlwind still
waits on Bloodthirst's cooldown, and rows 10, 12, 13 and 15 stay GCD-safe for Bloodthirst and
Whirlwind, wherever they sit; only which usable row comes first changes. So "GCD-safe" (§5.1)
names Bloodthirst and Whirlwind for Fury, whatever their place. In the default order the engine's
priority list is the same, entry for entry and fight for fight, as before the list (the golden
run, and 400 random settings' plans compared byte for byte in A1).

Notes:

- **Heroic Strike's thresholds** (row 11). It's queued from 40 rage and cancelled if rage falls
  below 20 before its swing, so a Bloodthirst or Whirlwind that spends the rage first isn't left
  short. Both measured best (below): from 42, Bloodthirst's 30 plus Heroic Strike's 12 and the
  default until M2.5b, is −0.21 DPS, and without the cancel −1.46. WarriorSim's Classic default
  was 40 in its 2021 revision [ws-spells] (30 in its post-SoD code). 40 over 42 rests on the
  unconfirmed rule that a queued Heroic Strike lifts the off hand's dual-wield miss penalty
  ([§2.4](#24-heroic-strike-and-cleave-on-next-swing), [?]): without it (a local build, the M2.5b
  review, seed 5201, 400,000 fights), 42 is level with 40, +0.02 (−0.07 to +0.12). Either way it's
  well within the 1% of [D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23).
- **Hamstring** (row 12). The Classic Era guide uses Hamstring "as a filler at excess rage when
  both Bloodthirst and Whirlwind are on cooldown". It can crit (Flurry) and proc Windfury and
  weapon effects [wh-fury]. It's off by default since M2.5b: the Overpower dance takes those
  global cooldowns, and Heroic Strike from 40 the rage, for more damage; from 60 it measured
  −0.22 DPS in the default setup and up to −0.4% in fights of 30–90 s (below).
- **Execute versus Bloodthirst.** The Classic rule is "Bloodthirst over Execute above 2000 AP"
  [wh-fury] [marrow]. The Forever Bloodthirst nerf moves the break-even up by 220–430 AP
  ([W11](#w11-bloodthirst-versus-execute-break-even)). The setting's default is a fixed 2220:
  rotation settings have one default per spec, not per build, so it can't follow Improved
  Execute; the setting's help says to use 2434 at cost 10.
- **What the execute phase changes** (with `fury.execute.enabled` on). Rows 6 and 7 apply only
  in the phase. Rows 8 and 12 (Bloodthirst without the AP condition, and Hamstring) apply only
  outside it, and so does row 9 unless `whirlwindInExecute` is on, and row 11 (the Heroic Strike
  queue) if `heroicStrikeInExecute` is off.
  Hamstring never takes Execute's GCDs. Execute is on every GCD at rage ≥ cost + `minExtraRage`,
  so Whirlwind in the phase gets a GCD only while Execute waits for extra rage. There,
  Whirlwind's Bloodthirst-cooldown condition applies only while row 6 uses Bloodthirst (AP ≥
  `btOverExecuteAp`); below it Bloodthirst is never pressed, and waiting on it would block
  Whirlwind for good. With the setting off, the phase changes nothing and rows 8–12 run to the
  end.
- **Rows 10 and 15 in the execute phase.** Slam (row 15) is a filler like Hamstring, so it
  applies only outside the phase. The Overpower dance (row 10) isn't among the rows the phase
  stops, so it applies in both, GCD-safe the way Berserker Rage is there (the row 13 note below):
  Bloodthirst counts only while row 6 uses it, Whirlwind only with `whirlwindInExecute`. It comes
  after Execute, so in the phase it gets a GCD only while Execute waits for rage. Both are engine
  choices; no source covers them.
- **The Overpower dance** (row 10), on by default since M2.5b: the biggest single gain the
  tuning found, +29.29 DPS (+4.1%). When a dodge has opened the window
  ([§2.8](#28-reactive-abilities-overpower-bloodthrill-revenge)) and the row's conditions hold,
  the warrior swaps to Battle Stance (keeping at most 25 rage), uses Overpower, and swaps back to
  Berserker Stance 1 s later, when the shared swap cooldown ends ([§2.1](#21-stances)). That swap
  keeps at most 25 again, so rage gained in that second above 25 is lost. For that second the
  warrior has Battle Stance's numbers: no +3% crit. Whirlwind, Recklessness and Berserker Rage
  need Berserker Stance, but the Overpower GCD outlasts the second. The default `maxRage` of 40
  lets it dance with up to 15 rage to lose on the swap in: an Overpower sooner (5 rage for 590
  damage on average in the golden run, and it can't be dodged) is worth more than that rage, and
  the global cooldowns it takes would otherwise go to Hamstring or nothing. 40 measured best of
  15–130; 25, which loses nothing on the swap, is −4.24 DPS (below). How the engine does it is in
  [§7](#7-implementation-notes) ("Stance dancing").
- **Heroic Strike in the execute phase** (`heroicStrikeInExecute`, on since M2.5b). The queue
  keeps running at its `minRage`, and its cancel below `unqueueBelow` applies there too, so a
  queued one gives way when an Execute empties the bar first. With it off, the phase stops the
  queue and a Heroic Strike already queued when the phase starts is cancelled: on paper its 12
  rage is worth 180 damage in the next Execute, more than the 157 it adds to a swing that also
  gives up that swing's white rage. Measured, keeping it is +1.34 DPS in the default setup and
  +0.5% to +0.8% in 30–60 s fights with a phase (below): the queue also lifts the off hand's
  dual-wield miss penalty ([§2.4](#24-heroic-strike-and-cleave-on-next-swing), [?]), and Heroic
  Strike takes only rage that piles up between Executes. An engine choice, measured; no source
  covers it.
- **The cooldowns apply in both phases.** Rows 2–5 and 13 keep running in the execute phase.
  By default the final Death Wish (row 2) comes 3 s before the phase and Recklessness (row 4)
  1.5 s before it, one global cooldown apart, so the phase opens with both up and Execute on
  the next global cooldown.
- **Death Wish's `alignToEnd`** (row 2). A use is the **final** one when no further use could
  start before the fight ends: `now + cooldown ≥ fight end`, i.e. at most 180 s left. The final
  use waits until at most its 30 s duration is left, so it lasts to the end, or, with Execute
  on and an execute phase, until `beforeExecuteSec` (3) before the phase starts, whichever comes
  first. Every other use goes on cooldown. The fight's drawn length is known to the sim, as the
  execute phase's start is ([encounter.md](../mechanics/encounter.md#implementation-notes)). So
  a default fight (180 s ± 10%, 20% phase) of 180 s or less gets one use, 3 s before the phase
  (39 s left at 180 s), where it lasts through the phase's first 27 s and Recklessness's 15. A
  300 s fight gets one at the pull and a final one 3 s before the phase, at 237 s. A phase that
  starts less than 33 s before the end (fights under about 165 s with a 20% phase) leaves the
  30 s first, as before M2.5b. With `alignToEnd` off, every use goes on cooldown. An engine
  choice, measured (below); no source covers it. 3 s measured best of 0–10 s in the default fight
  (2.5 s −0.30 DPS, 3.5 s −0.25), and of 1.5–6 s at 180 s with a 20% phase and at 300 s with 10%
  and 20% (seed 5106).
- **The rotation knows the fight's timing** (rows 2–4 and 16). Each fight's execute phase start
  and end are known exactly ([encounter.md](../mechanics/encounter.md#implementation-notes)), and
  the rotation times Death Wish, the racial, Recklessness and the potion to them. A player has to
  judge both, so the result lists it as an assumption. In the default setup, timing Death Wish
  and Recklessness to the phase is worth about 1.4% (below: −9.95 DPS without it). Using both
  1 s early or late costs 0.05% and 0.13%, and 3 s early or late 0.14% and 0.33% (the latter
  with Recklessness at the phase's start, its earliest setting; seed 5304, 200,000 paired
  fights each), so a player can come close. Without a phase, Recklessness's clock matters more
  when it's late: at 13 s left rather than 16 s, it's cut short by the fight's end, −0.79% at
  180 s and −4.25% at 30 s; 3 s early, level at 180 s and −0.15% at 30 s (seed 5304). An engine
  choice; no source covers it.
- **The racial with Death Wish** (row 3, `syncWithDeathWish`). The racial is used while Death
  Wish is up. It's also used whenever Death Wish's next use is at least the racial's cooldown
  away, because then it will be ready again by then and waiting would cost a use. "Next use"
  is Death Wish's remaining cooldown, or, while `alignToEnd` holds the final use, the time until
  30 s are left. In a 150 s fight, Blood Fury (2 min) goes at the pull and again with the
  aligned Death Wish at 120 s; in a 140 s fight it waits for Death Wish at 110 s. With no Death
  Wish in the rotation (no talent, or switched off) or the setting off, the racial is used on
  cooldown. The racials are off the GCD, so they're used in the same moment as Death Wish.
  That "next use" still counts from 30 s left when the final Death Wish comes earlier, 3 s before
  the execute phase (row 2): a racial used by that rule can then come back a few seconds into
  Death Wish rather than with it, but it gets a use more. Holding it for the earlier Death Wish
  measured worse for an Orc in every fight where it made a difference, up to −0.32% (120–400 s,
  10–30% phases, seeds 5204 and 5205), and never better. An engine choice, measured; no source
  covers it.
- **Bloodrage and Berserker Rage wait for room** (rows 5 and 13). Their `maxRage` is absolute
  ([§5.1](#51-conventions-for-rotation-settings)): 110 for Bloodrage (130 − 20) and 120 for
  Berserker Rage (130 − 10). Spending rage is a decision point, so either is used the moment a
  cast brings rage down to its threshold.
- **Berserker Rage in the execute phase** (row 13). It stays GCD-safe for the abilities the
  phase uses, as Whirlwind's wait does (row 9): Bloodthirst only while row 6 uses it (AP ≥
  `btOverExecuteAp`), and Whirlwind only with `whirlwindInExecute`. Execute has no cooldown, so
  it isn't part of the check. Berserker Rage comes after Execute, so it gets a GCD in the
  phase only while Execute waits for rage, which its 10 rage then shortens. Without Improved
  Berserker Rage it does nothing the sim models, so the plan leaves it out.
- **Your Battle Shout or the raid's** (rows 0 and 1). The Buffs tab's "Battle Shout" switch
  means someone in the party keeps it up. With `fury.battleShout.enabled` on (the default),
  the warrior keeps it up themselves: the plan leaves out the switch's static +139, and the
  shout is an aura in the fight, so it counts once whether the switch is on or off (it's the
  same spell, which doesn't stack). The Buffs tab shows the switch on and locked, and the
  character sheet counts the +139, since the shout is up for all but a moment of the fight.
  In `classicEra` the switch and the warrior's own shout are both Classic Era's +232, and the
  own shout lasts 2 min, so a 180 s fight refreshes it once (§3.2).
  With the setting off, the switch decides, and the rotation never shouts. Both places' help
  text says so. This is an engine choice; no source covers it.
- **When Battle Shout is refreshed** (row 1). It's shouted when it's missing, or when it has at
  most `refreshBelowSec` left and would run out before the fight ends; a shout that outlasts
  the fight isn't refreshed. The engine wakes the rotation when that window opens. With the
  pre-pull shout (177 s left at the pull) a default 180 s fight refreshes it at 174 s only if
  it lasts past 177 s. That late refresh costs a GCD and 10 rage in the execute phase for a few
  seconds of +139 AP, about 2.5 DPS on average in the golden run; the setting follows the
  Classic Era priority and the sim doesn't second-guess it. The shout's threat (60 per party
  member, [threat.md](../mechanics/threat.md)) isn't counted: the party isn't modelled.
- **The pre-pull** (row 0). Battle Shout at −3 s has 177 s left at the pull. **Its 10 rage
  came before the pull** (left over from trash, say), so it costs nothing in the fight: an
  engine choice. Bloodrage at −1 s: its 10 rage at once (15 with Improved Bloodrage 2/2) is
  there at the pull, its ticks come at 0, 1, … 9 s, and its 60 s cooldown runs from −1 s, so
  row 5 can use it again at 59 s. Charge (off): 15 rage, +3 per rank of Improved Charge, then
  the swap to Berserker Stance keeps at most 10 + 3 per rank of Improved Tactical Mastery
  ([§2.1](#21-stances)), 25 with the default build. So the rage at the pull is
  `min(Bloodrage's rage at once + Charge's, 25)`, and Bloodrage's tick at 0 comes after the
  swap. Pre-pull rage makes no threat, not even Charge's (75 at most). The pre-pull casts count
  in the breakdown's casts.
- **On-use trinkets** (row 3). A trinket the sim models is used with the same sync with Death
  Wish as the racial (the note above), with its own cooldown in place of the racial's; off the
  GCD, both are used in the same moment as Death Wish. The sim models two on-use trinkets:
  **Earthstrike** (+280 attack power for 20 s, modelled with the Enhancement shaman) and
  **Weakness Analyzer** (new in Forever): +5% crit (aura 290: attacks and spells) for 20 s or
  until you deal a non-periodic crit, 90 s cooldown [F] [client] (ItemEffect, SpellEffect,
  SpellAuraOptions, 1.60.1.69913); an older foreverchanges tooltip said 2 min (Q31). The sim
  ends it on the first crit you deal, white or special, including the crit it helped make.
  **Diamond Flask** left the pool: Forever made its use a heal, so it's off the pre-raid lists
  (Q30). Unsimulated on-use items are listed in the result's assumptions.
- **The Mighty Rage Potion** (row 16) is used once a fight; a long execute phase doesn't get a
  second potion, though its 2 min cooldown would allow one. Its rage is 450 plus a whole 0–300
  tenths drawn uniformly from the proc stream (the client's 600 with variance 0.5; Classic Era's
  449 + 1d301), an energize (5 threat per rage). It follows the execute phase, as Arms' does
  ([§5.3](#53-arms-two-hander) row 17). **In the phase**, with Execute on, it's drunk at rage ≤
  `maxRage`: the default 0 waits until an Execute has emptied the bar, usually the phase's first,
  so none of its 45–75 rage is lost at the cap and all of it goes into the phase. 55 (the 130
  cap minus 75), the default until M2.5b, which drank it at the phase's start, measured −0.99 DPS.
  If it hasn't been drunk by the phase's last 2 s, it's drunk then at up to the build's cap minus
  75 (55 with Boundless Rage 3/3, less with fewer ranks; a Gnome's Expansive Mind isn't counted).
  That last chance is +1.7% in 30 s fights with a 10% phase, up to +0.4% in 30–60 s fights
  otherwise, and nothing from 90 s up (below; measured before the next rule, which now takes
  most of those fights). Against none, 1.5 s and 2 s measured best at 30–90 s; 1 s gained about
  half as much, 4 s (Arms') lost up to 0.03% and 6–8 s up to 0.6% (seeds 5104 and 5105).
  **With a phase too short for Recklessness's timing**, it goes with Recklessness (since the M2.5b
  review). Recklessness comes by its clock, `lastSec` (16 s) before the end, when that's before
  `beforeExecuteSec` (1.5 s) before the phase: when the phase is shorter than 14.5 s, as in fights
  under about 72 s with a 20% phase or 145 s with a 10% one. Then the potion is drunk in the same
  moment, at up to the build's cap minus 75, as it is without a phase (below). The rotation tells
  by the phase: it's still more than `beforeExecuteSec` away when Recklessness is used ("the
  execute phase starts in more than x", [§7](#7-implementation-notes) "Time-left conditions").
  Drunk 6–7 s earlier, its Strength lasts through Recklessness and its rage goes into Heroic
  Strikes on every main-hand swing under Recklessness's crits, where a phase that short would
  leave it to a few Executes. It gains 5.2% in 30 s fights with a 10% phase, 3.5% with a 20% one,
  1.8–3.3% at 45 s, 0.8–2.3% at 60 s and 1.0% at 90 s with 10%, and 0.01–0.5% around the 14.5 s
  line (70–80 s with a 20% phase, 120–150 s with 10%). Elsewhere, the default fight included, it
  changes only a few same-millisecond ties at 20 s left, in a handful of fights per 100,000, well
  under 0.001 DPS (below). Drinking it with Recklessness whatever the phase lost from about 75 s
  with a 20% phase up: −0.75% at 180 s (the M2.5b review's probe).
  **Without an execute phase, or with Execute off**, no Execute will empty the bar, so it's drunk
  in the last 20 s at up to that same limit, as long as its +60 Strength lasts, where the phase
  would have been, and only once Recklessness (row 4) has been used: at its 16 s, in the same
  moment, so its rage and Strength join Recklessness's crits. That wait is +2.7% in 30 s fights
  without a phase, +1.6% at 60 s and +0.4% at 300 s. With Recklessness off, it's the last 20 s.
  Engine choices, measured; no source covers them.
- **Juju Flurry** (row 17) is used on cooldown from the pull: no source ties it to Death Wish,
  and it's off the GCD (no start recovery in the client). Each use is +3% attack speed for 20 s,
  multiplied with other haste from the next swing (W17).
- **On-use items not simulated:** those with no damage use (Counterattack Lodestone's disarm, for
  one). If equipped, the result lists them. EZ-Thro Dark Bomb and Greater Stoneshield Potion are
  used on cooldown from the pull, ahead of the spec's own lines, when they're selected
  ([buffs §3.5, §3.7](../mechanics/buffs-debuffs-consumables.md#37-engineering-and-explosives)); the
  bomb's first throw waits for the first main-hand swing, the rest go on cooldown wherever the swing
  timer is, and its 1 s throw restarts both swings and holds the GCD: Fury −1.9% and Arms −2.7% at
  Max consumables, an upper bound (−1.1% and −0.6% thrown only just after a swing), so it's in no
  preset.
- **2H Fury** (Fury talents with a two-hander) is supported by the engine but has no default
  preset. Unbridled Wrath's 2 rage per proc suits it, but Dual Wield Specialization and Raging
  Blows are wasted, and Improved Slam is out of reach in the Arms tree. Use it only if a guild
  member asks.

#### Tuning the defaults (M2.5b)

The defaults above are the best rotation found on 2026-09-23, per
[D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23), by the
method of Arms' tuning ([§5.3](#tuning-the-defaults-m25a)): paired fights on the real engine
(`scripts/tune/rotation.mjs --spec warrior-fury`), a search on search seeds, the winner frozen,
then confirmed on a seed no search used. The setup is the default Fury setup (Human, the 17/34/0
build, pre-raid BiS, the Standard raid buffs with the Mighty Rage Potion, 180 s ± 10%, 20%
execute, armor 3,731), the rotation settings aside. Against the defaults before M2.5b, the result
is **+42.88 DPS (+6.39%, 95% CI +42.73 to +43.03)**, 670.62 → 713.50, over 400,000 paired fights
on seed 5201 (`node scripts/tune/rotation.mjs --spec warrior-fury --fights 400000 --seed 5201
--against 2daa74e`).

- **The search.** A survey of every option one at a time (seeds 1 and 2, 100,000 fights a
  candidate), then coordinate descent: the best change adopted and every option re-swept on top
  of it (seeds 11–19, 100,000–200,000 fights), with 2-D grids where two settings share rage
  (Heroic Strike's threshold with its cancel's, and with Hamstring's). Arms' review found
  clock-fitted timings losing up to 8% in short fights, so Fury's timings follow the execute
  phase as Arms' do: Recklessness gets Arms' `beforeExecuteSec`, the potion Arms' rules in the
  phase and outside it, and the final Death Wish a `beforeExecuteSec` of its own, new here (seeds
  21–28). Before freezing, each change was checked at 30–300 s with 0%, 10% and 20% phases
  (seeds 5101–5110). That check set the potion's last chance at 2 s (Arms' 4 s lost up to 0.03%
  in short fights), made the potion wait for Recklessness without a phase, and moved
  Recklessness's clock from 15 s to 16 s.
- **Frozen, then confirmed** on seed 5201 (400,000 fights): the winner against the old defaults
  (above), and against itself with each change reverted in turn ("in the winner"). Every change
  that acts in the default setup still cleared the bar. No setting turns off the phase timings or
  the potion's new rules, so for those the line was removed in a local build of the engine,
  which then played the same fights as the winner; the M2.5b review reproduced the timings' numbers
  the same way (Recklessness's line removed −8.65, Death Wish's −4.60, both −9.95, the pair
  about 1.4%). "Alone" is the change alone against the old defaults on search
  seed 1 (100,000 fights). The changes interact: the Death Wish timing pays three times as much
  with Recklessness's beside it, and Heroic Strike from 40 pays only with the dance (alone it's
  level).

| Setting | Old → new | Alone, Δ DPS (95% CI) | In the winner, Δ DPS (95% CI) |
| --- | --- | --- | --- |
| `overpower.enabled` (the dance) | off → on | +25.12 (+24.84 to +25.41) | +29.29 (+29.15 to +29.44) |
| `recklessness.beforeExecuteSec` | new: 1.5 s before the phase (by the clock only, before) | +4.83 (+4.67 to +4.99) | +8.65 (+8.56 to +8.73) |
| `deathWish.beforeExecuteSec` | new: 3 s before the phase (with 30 s left only, before) | +1.49 (+1.36 to +1.61) | +4.60 (+4.54 to +4.66) |
| `overpower.maxRage` | 25 → 40 | the dance at 40: +28.45 (+28.16 to +28.74) | +4.24 (+4.11 to +4.37) |
| `heroicStrike.unqueue` | off → on (below 20) | +0.63 (+0.35 to +0.90) | +1.46 (+1.32 to +1.59) |
| `execute.heroicStrikeInExecute` | off → on | +0.39 (+0.30 to +0.48) | +1.34 (+1.29 to +1.38) |
| `whirlwind.btCdMinSec` | 1.5 → 0.5 s | +0.84 (+0.57 to +1.11) | +1.01 (+0.88 to +1.15) |
| `ragePotion.maxRage` | 55 → 0, in the phase, with Arms' rules (notes) | +0.52 (+0.41 to +0.64) | +0.99 (+0.94 to +1.05) |
| `hamstring.enabled` | on → off | +0.33 (+0.18 to +0.48) | +0.22 (+0.15 to +0.29) |
| `heroicStrike.minRage` | 42 → 40 | −0.16 (−0.40 to +0.09) | +0.21 (+0.10 to +0.31) |
| `recklessness.lastSec` | 15 → 16 s | +0.78 (+0.70 to +0.85), by the clock | 0: the phase comes first |
| The potion's last chance | new: the phase's last 2 s | 0 | 0: an Execute always empties the bar first |
| The potion without a phase | now after Recklessness | 0 | 0: the default fight has a phase |

- **Robustness** (seed 5202, which no search used, 200,000 paired fights each): the final
  defaults' Δ DPS, and Δ %, against the defaults before M2.5b (`--against 2daa74e`), by fight
  length and execute phase, with the review's potion rule (below). They win everywhere; no setup
  measured loses.

  | Fight | 0% | 10% | 20% |
  | --- | --- | --- | --- |
  | 30 s | +74.77 (+74.27 to +75.27), +8.52% | +87.47 (+87.00 to +87.94), +9.58% | +75.94 (+75.45 to +76.43), +7.92% |
  | 45 s | +59.07 (+58.66 to +59.48), +7.57% | +65.68 (+65.28 to +66.09), +8.02% | +55.33 (+54.91 to +55.75), +6.46% |
  | 60 s | +52.49 (+52.13 to +52.84), +7.16% | +53.91 (+53.55 to +54.26), +6.96% | +44.37 (+44.01 to +44.73), +5.49% |
  | 90 s | +45.63 (+45.35 to +45.92), +6.67% | +43.80 (+43.51 to +44.09), +6.06% | +53.20 (+52.90 to +53.50), +7.25% |
  | 180 s | +37.80 (+37.60 to +38.00), +5.98% | +39.82 (+39.62 to +40.02), +6.08% | +42.89 (+42.68 to +43.10), +6.40% |
  | 300 s | +35.41 (+35.26 to +35.56), +5.67% | +38.81 (+38.66 to +38.97), +6.01% | +40.34 (+40.17 to +40.50), +6.09% |

  Before that rule, the frozen winner's 30–90 s cells with a 10% phase and 30–60 s cells with a
  20% phase gained 4.1–5.0% (30 s and 10%: +37.49, +37.03 to +37.94, +4.10%); in the other cells
  it changes only a few same-millisecond ties (below).

  In the default fight (seed 5203, 200,000 fights): Orc (Blood Fury, its faction's gear) +43.10
  (+42.90 to +43.31), +6.49%; Troll (Berserking) +42.42 (+42.22 to +42.63), +6.38%; Night Elf
  (Elune's Light) +41.29 (+41.09 to +41.50), +6.23%; boss armor 3,009 +48.77 (+48.53 to +49.01),
  +6.40%. An Orc in a 300 s fight: +40.29 (+40.13 to +40.46), +6.15%.

  **Each change in each cell** (seed 5202, the winner against itself with that change reverted).
  The Overpower dance gains 27–30 DPS everywhere (2.9–4.3%), and at up to 40 rage 0.3–0.8% more
  than at 25; Hamstring off, 0.02–0.4%; Heroic Strike from 40, up to 0.14% or level. Heroic
  Strike in the execute phase gains 0.1–0.8% wherever there's a phase, the potion at 0 in it
  0.07–0.9%, and its last chance 1.7% at 30 s and 10%, 0.4% at 45 s and 10%, up to 0.2%
  elsewhere below 90 s, nothing from 90 s. Without a phase, the potion's wait for Recklessness
  gains 0.4% (300 s) to 2.7% (30 s). The phase timings gain where the phase comes first:
  Recklessness 0.6–1.5% at 90–300 s, Death Wish 0.3–0.9% at 180–300 s, and for an Orc or a
  Troll 0.7–1.0% (seed 5203). Three changes lose a little in short fights, the whole package still
  winning 5.5–9.6% there (4.1–8.5% before the review's potion rule): **Heroic Strike's cancel**
  costs 0.38% at 30 s without a phase and about 0.1% at 45 and 60 s without one (it gains
  0.1–0.3% everywhere else); **Whirlwind at 0.5 s** costs 0.07% and 0.05% at 30 s with a 10% and
  a 20% phase (it gains 0.1–0.5% elsewhere); and
  **Recklessness's 16 s** costs 0.03% at 30 s with a 10% phase (it gains up to 0.46% without a
  phase, and 0.16% at 30 s and 20%). These per-cell numbers are the frozen winner's, before the
  review's potion rule, which now times the potion in the short phases where its last chance
  paid most.
- **After the review: the potion with a Recklessness that comes by its clock** (row 16 notes).
  The M2.5b review found the potion in the phase clearly beaten, in phases too short for
  Recklessness's `beforeExecuteSec`, by drinking it with Recklessness as without a phase (+5.3% at
  30 s with a 10% phase). It's measured against the frozen winner (`--against e00241a`) on seed
  5301, which no search used, 200,000 paired fights each: +49.73 (+49.32 to +50.14), +5.23% at
  30 s with a 10% phase; +34.98 (+34.55 to +35.41), +3.50% with 20%; at 45 s +28.56 (+28.28 to
  +28.84), +3.33% and +15.86 (+15.57 to +16.15), +1.77%; at 60 s +18.54 (+18.33 to +18.75),
  +2.29% and +6.90 (+6.68 to +7.12), +0.82%; at 90 s with 10% +7.51 (+7.36 to +7.65), +0.99%.
  Around the 14.5 s line: 70, 75 and 80 s with a 20% phase +0.22%, +0.06%, +0.00% (+0.03, +0.01
  to +0.05), and 120, 135 and 150 s with 10% +0.51%, +0.17%, +0.01% (+0.07, +0.03 to +0.11);
  all clear the bar. Every other cell of the grid (no phase, 90 s with 20%, 180 and 300 s) and
  165 s with 10% differ only by a few same-millisecond ties, and so does the default setup: Δ 0.00
  over 400,000 fights on seed 5303, where 7 fights differ, most by one rage moving between two
  Executes (a mean of +0.00004 DPS). The potion line's
  wake-up at 20 s left can land in the same millisecond as a Bloodrage tick, and then the
  rotation walks first (the M2.5b verification's FV1). The golden run doesn't move.
- **Not adopted** (on top of the frozen winner, seed 5206, 200,000 fights, unless it says
  otherwise):
  - **Charge in** (`prepull.charge`): +2.79 (+2.58 to +3.00), and **your own Battle Shout off**:
    +1.96 (+1.91 to +2.01). As for Arms, they're the encounter's and the raid's calls, not the
    rotation's ([§5.3](#tuning-the-defaults-m25a)).
  - **Pooling rage for the execute phase**: no Heroic Strike in the 20 s before it, measured with
    a prototype, +0.80 (+0.64 to +0.96), +0.11% (seed 27, 100,000 fights; on seed 26, 15–25 s
    about the same, 30 s +0.07%, 35 s nothing and 40 s or more a loss). It needs a setting of its
    own, and in short fights 20 s before the phase is most of the fight, so it's left for later.
  - **Holding the racial for the earlier Death Wish** (the sync's "next use" counted to 3 s before
    the phase): never better for an Orc or a Troll, and up to −0.32% (notes).
  - **Recklessness by the clock** at 40 s left: +3.46 (+3.31 to +3.62) in the survey (seed 1), a
    fit to the default fight's phase; following the phase replaces it.
  - Neither better nor worse (seed 28): Heroic Strike from 36 or 38, its cancel below 18 or 22,
    Whirlwind at 0 or 0.3 s, Battle Shout's refresh at 2 or 4 s, Bloodrage up to 100.
    Worse: the dance up to 35 (−0.37) or 45 (−0.28), Heroic Strike from 42 (−0.21), the potion
    up to 5 (−0.10), Whirlwind at 0.7 or 1 s (−0.53, −0.65), Death Wish 2.5 or 3.5 s before
    (−0.30, −0.25), Recklessness 1 or 2 s before (−0.73, −0.14), Bloodthirst over Execute from
    2000 AP (−0.19; the default setup's AP stays under 2220 in the phase), Hamstring on (−0.12).
  - Turning a row off, or on, costs: Execute −43.17, Heroic Strike −30.84, Recklessness −30.29,
    the Overpower dance −29.29 (seed 5201), Death Wish −26.73, Bloodthirst −26.05, Whirlwind
    −23.07, the potion −16.87, Death Wish's alignment −7.08, Whirlwind in the execute phase
    −6.97, Bloodthirst in it at any AP −6.91, Bloodrage −6.74; Slam on −35.34.

### 5.3 Arms (two-hander)

Base stance: **Battle** (Rend, Overpower, Bloodthrill and Sweeping Strikes all need it).
Weapon: a slow two-hander. The default talents are the popular 37/14/0 build ([§6.1](#61-talent-builds)):

| Value | Default build | How it's derived |
| --- | --- | --- |
| Heroic Strike cost | 12 | 15 − 3 (Improved Heroic Strike 3/3) |
| Execute cost | 15 | No Improved Execute |
| Max rage | 130 | Boundless Rage 3/3 |
| Unbridled Wrath | 60%, 2 rage per proc | 5/5 with a two-hander |
| Two-Handed Weapon Specialization | ×1.03 | 3/3 |
| Ability crit multiplier | 2.2 | Impale 2/2 |
| Deep Wounds | 60% | 3/3 |
| Weaponmaster | 5/5 | |
| Improved Overpower | +50% crit | 2/2 |
| Bloodthrill | 10% | 5/5 |
| Slam | 1.0 s cast and GCD, no swing reset | Improved Slam 2/2 |
| Rage kept on a stance swap | 25 | |
| Not taken | Flurry, Death Wish | |

This priority is **derived for Forever**. Classic Era raid Arms leaned on Slam spam, which the
15 s Slam cooldown removes. The table is the list as built (`sim/classes/warrior/arms.ts`).
Rows 0, 1, 3–5, 13 and 16–18 share their code with Fury's (`sim/classes/warrior/shared.ts`), and
rows 1, 3, 5 and 18 their settings' wording too. The defaults are the best rotation found for the
default setup ([D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23);
[Tuning the defaults](#tuning-the-defaults-m25a) below), so where a shared row's default or
wording differs from Fury's, Arms passes its own: row 0's Charge, row 1's refresh, row 4's
clock (15 s, Fury's 16 s; its help is shared) and the switch's help, row 13's switch and threshold, row 16's switch, and row 17's last chance (4 s,
Fury's 2 s) and help. Both follow the execute phase the same way since M2.5b
([§5.2](#tuning-the-defaults-m25b)); Fury's final Death Wish does too, a setting Arms doesn't
have.

| # | Action | Condition (defaults) | Setting ids (default) | On by default |
| --- | --- | --- | --- | --- |
| – | Base stance | Battle Stance, or Berserker Stance; see the notes (Q24) | `arms.baseStance` (`battle`; a choice of `battle` or `berserker`) | Battle |
| 0 | Pre-pull | Battle Shout at −3 s (with row 1 on); Bloodrage at −1 s; optional Charge: 15 rage, +3 per Improved Charge rank, all kept in Battle Stance. Fighting in Berserker Stance, the swap after Charge keeps at most 10 + 3 per Improved Tactical Mastery rank | `arms.prepull.battleShout` (on; needs `arms.battleShout.enabled`), `.bloodrage` (on), `.charge` (off) | yes |
| 1 | Battle Shout | As Fury's row 1: missing, or at most `refreshBelowSec` left and it would run out before the fight ends; rage ≥ 10. It replaces the Buffs tab's Battle Shout | `arms.battleShout.enabled` (on), `.refreshBelowSec` (0: once it has run out) | yes |
| 2 | Rend | Your Rend is missing, or has at most `refreshBelowSec` of ticks left and would end before the fight does. Bloodthrill needs it. In Berserker Stance, a dance to Battle Stance at rage ≤ the swap's cap (25) | `arms.rend.enabled` (on with Bloodthrill in Battle Stance, off otherwise), `.refreshBelowSec` (3) | with Bloodthrill |
| 3 | Racial or trinket cooldowns | As Fury's row 3: with Death Wish (row 16) when it's used; otherwise at the pull and on cooldown | `arms.racial.enabled` (on), `arms.trinkets.enabled` (on), `arms.cooldowns.syncWithDeathWish` (on) | yes |
| 4 | Recklessness | Once: `beforeExecuteSec` before the execute phase starts, or when ≤ `lastSec` s are left, whichever comes first. Without an execute phase, or with Execute (row 7) off, only the latter. From Battle Stance it swaps to Berserker Stance (keeping at most 25 rage) and stays there for the rest of the fight | `arms.recklessness.enabled` (on), `.beforeExecuteSec` (1.5; dimmed with Execute off, and its help says it needs an execute phase), `.lastSec` (15: its duration; the help is Fury's); see the notes | yes |
| 5 | Bloodrage (off the GCD) | On cooldown if rage ≤ `maxRage` | `arms.bloodrage.enabled` (on), `.maxRage` (110: max − 20) | yes |
| 6 | **Execute phase** (target ≤ 20%): Slam | Off cooldown; rage ≥ Slam's 15 + Execute's 15 | `arms.execute.slamInExecute` (on) | yes |
| 7 | Execute phase: Execute | Rage ≥ cost. With `mortalStrikeInExecute`, Mortal Strike comes just before it | `arms.execute.enabled` (on), `.mortalStrikeInExecute` (on) | yes |
| 8 | Mortal Strike | Off cooldown; rage ≥ 30; outside the execute phase | `arms.mortalStrike.enabled` (on; needs the talent) | yes |
| 9 | Overpower | Window open (dodge or Bloodthrill); Mortal Strike is GCD-safe, or rage ≥ 35 (Mortal Strike's 30 + Overpower's 5). In both phases. In Berserker Stance, a dance to Battle Stance at rage ≤ 25 | `arms.overpower.enabled` (on in Battle Stance, off in Berserker) | Battle Stance |
| 10 | Slam | Off cooldown; rage ≥ 15 + `reserve`; Mortal Strike is GCD-safe over Slam's own GCD (1 s with Improved Slam 2/2); outside the execute phase | `arms.slam.enabled` (on), `.reserve` (5) | yes |
| 11 | Spearing Strike | Target is a Giant or Dragonkin: on cooldown. Otherwise: rage ≥ `minRageOtherTargets` and Mortal Strike is GCD-safe. Outside the execute phase | `arms.spearingStrike.enabled` (on; needs the talent and a two-hander), `.minRageOtherTargets` (35) | yes |
| 12 | Whirlwind | Mortal Strike is GCD-safe; outside the execute phase. From Battle Stance, a dance to Berserker Stance at rage ≤ `maxRage`; in Berserker Stance (the base stance, or after Recklessness's swap), no dance and no rage limit | `arms.whirlwind.enabled` (off in Battle Stance, on in Berserker), `.maxRage` (30) | Berserker Stance |
| 13 | Heroic Strike queue (off the GCD) | Off by default: its swing gives no rage ([§2.4](#24-heroic-strike-and-cleave-on-next-swing)), and Arms' rage does more elsewhere (notes). When it's on: rage ≥ `minRage` (125, near the 130 cap); optional unqueue; outside the execute phase | `arms.heroicStrike.enabled` (off), `.minRage` (125), `.unqueue` (off), `.unqueueBelow` (20) | no |
| 14 | Hamstring | Rage ≥ `minRage`; GCD-safe for Mortal Strike, Slam, Spearing Strike and Whirlwind (useful with Weaponmaster swords or Windfury); outside the execute phase | `arms.hamstring.enabled` (on), `.minRage` (40) | yes |
| 15 | Sweeping Strikes (off the GCD) | 2 or more targets: on cooldown. **Not simulated** until multi-target support ([§5.5](#55-multi-target-options-light)): the sim has one target | none yet | multi-target |
| 16 | Death Wish | Only with the talent: as Fury's row 2, including `alignToEnd`. Its line sits before row 3's, so the racial can wait for it | `arms.deathWish.enabled` (on with the talent), `.alignToEnd` (on) | with the talent |
| 17 | Mighty Rage Potion (off the GCD) | Once. With Execute (row 7) and an execute phase: in the phase at rage ≤ `maxRage`, or, if it hasn't been drunk by the phase's last 4 s, then at rage ≤ the build's cap minus 75 (55 with Boundless Rage 3/3). Without an execute phase, or with Execute off: in the last 20 s at rage ≤ that cap minus 75, after row 4's swap from Battle Stance. See the notes | `arms.ragePotion.enabled` (on), `.maxRage` (0, in the phase: once an Execute has emptied the bar) | with the consumable |
| 18 | Juju Flurry (off the GCD) | As Fury's row 17: on cooldown from the pull | `arms.jujuFlurry.enabled` (on) | with the consumable |

Notes:

- **Why Battle Stance.** The popular build invests in Bloodthrill 5/5 and Improved Overpower
  2/2, which pay off only in Battle Stance with Rend up. The alternative is a Berserker-base
  profile: +3% crit and Whirlwind without dancing, but Rend and Overpower need a dance. It is
  available by setting `arms.baseStance = berserker`, which turns on #12 and turns off #2 and
  #9 unless you turn them back on, and then they dance. **What the sim shows** (Q24, M2.3c, the
  default setup, 20,000 fights, ± 0.6): Battle Stance 630 DPS; Berserker Stance with its defaults
  604 (−4%); Berserker Stance dancing for Rend and Overpower 631, level with Battle Stance. With
  the tuned defaults (M2.5a, below), Berserker Stance dancing for Rend and Overpower measured
  −22.5 DPS (−3.5%, 95% CI ± 0.23, 200,000 paired fights). So Battle Stance stays the default.
- **Defaults that follow the setup.** Rend's default is on only with Bloodthrill, and the base
  stance moves the defaults of Rend, Overpower and Whirlwind as above. Each setting's
  `defaultWhen` says so (the first match wins), the Rotation tab shows the resulting value, and a
  value you set stays set ([§5.1](#51-conventions-for-rotation-settings)). Death Wish's default
  follows its talent the same way; without the talent it's never used, whatever the setting.
- **Execute phase.** Slam at 15 rage for about 728 damage
  ([W4](#w4-slam-with-the-same-two-hander)) beats a minimum Execute's 600 per GCD [marrow].
  Mortal Strike (30 rage, about 737) loses to an Execute at 30 rage (825) when that's all the
  rage there is. With rage to spare (the Mighty Rage Potion's, and what Heroic Strike no longer
  takes), its 30 rage does more as a Mortal Strike than as 15 damage a point of an Execute's
  extra rage ([W10](#w10-execute)), so it's on by default since M2.5a (+0.14%, below). Its line
  comes just before Execute, since below it Execute would take every GCD it could pay for.
- **What the execute phase changes** (with `arms.execute.enabled` on). Rows 6 and 7 apply only
  in the phase; rows 8 and 10–14 only outside it, and a Heroic Strike already queued is
  cancelled when the phase starts, as Fury's is. Rows 1–5, 9 and 16–18 apply in both phases.
  Overpower comes after Execute, so in the phase it gets a GCD only while Execute waits for rage,
  and at 5 rage it's worth it. Rend keeps running there too: with the default setup, leaving it
  out of the phase measured about +0.1% (0.7 DPS, near the ± 0.6 interval), so the row order
  stands. With the setting off, the phase changes nothing. These are engine choices; no
  source covers them.
- **Recklessness and the stance** (row 4). From Battle Stance the line dances to Berserker
  Stance and **stays**: that stance becomes the base stance for the rest of the fight, so the
  engine never swaps back ([§7](#7-implementation-notes) "Stance dancing"). Rend and Overpower
  then wait for good, and Whirlwind, if it's on, needs no dance and no rage limit (row 12). There's no rage guard:
  the swap keeps at most 25, and delaying Recklessness costs more of its 15 s than the rage is
  worth. **When.** It follows the execute phase, whose start each fight knows, as it knows its
  length ([encounter.md](../mechanics/encounter.md#implementation-notes)). By default it comes
  1.5 s before the phase starts, so its 15 s of crits land on the phase's first Executes, Slams
  and Mortal Strikes, with the rage the rotation pooled for them, and the potion (row 17)
  follows. It waits for the GCD, and for Rend's upkeep above it (row 2), so it comes 0.9 s before
  the phase on average; its swap loses 15.0 rage a fight. `lastSec` is the clock: Recklessness
  is used once that much is left, if that comes first. It does in a short fight: a 30 s fight's
  20% phase starts about 6 s before the end, and 15 s left is 7.5 s earlier than 1.5 s before
  it. Without an execute phase, or with Execute off (the phase then changes nothing), the clock
  is all there is. Its default is Recklessness's own 15 s, so nearly all of it counts even after a
  global cooldown in progress, and 15 s measured best at every length (below). The setting's help
  is Fury's too ([§5.2](#52-fury-dual-wield) row 4, 16 s). An engine choice, measured; no source
  covers it. Until the M2.5a review it was 39 s left, fitted to the default fight's phase, which
  cost 5–8% in fights of 30–60 s and 1.9% without a phase. The phase's start and the fight's end are known exactly
  ([§5.2](#52-fury-dual-wield) notes); using Recklessness 1–3 s early or late around the phase
  costs 0.02–0.28% in the default setup (seed 5304, 200,000 paired fights each), and the result
  lists the assumption.
- **The Mighty Rage Potion** (row 17) follows the execute phase too. **In the phase**, with
  Execute on, it's drunk at rage ≤ `maxRage`. The default 0 waits until an Execute has emptied
  the bar: 1.8 s into the phase on average, after Recklessness's swap (row 4). 55 (the 130 cap
  minus 75) measured −0.44% against it (seed 3031, below). A short phase can end before an
  Execute empties the bar: a 30 s fight's 10% phase lasts about 3 s, and 14% of those fights went
  without the potion. So if it hasn't been drunk by the phase's last 4 s, it's drunk then at up to
  the build's rage cap minus the potion's 75 at most, so none of its rage is lost: 55 with
  Boundless Rage 3/3's 130 cap, less with fewer ranks (100 + 10 a rank). A Gnome's Expansive Mind
  (+5%, Q17) isn't counted, which leaves a few more points of room. That last chance measured
  +3.7% in 30 s fights with a 10% phase, +1.4% at 45 s and 10%, +1.0% at 30 s and 20%, +0.05% to
  +0.5% in fights of 45–90 s otherwise, and nothing from 180 s up; 4 s was the best of 3–15 s, or
  level with it, at every length (below).
  **Without an execute phase, or with Execute off**, no Execute will empty the bar, so it's drunk
  in the last 20 s at up to that same limit, as Fury's is: as long as its +60 Strength lasts,
  where the phase would have been. From Battle Stance, Recklessness's swap to Berserker Stance keeps at most 25
  rage, so a potion drunk just before it would lose rage to it. With Recklessness in the rotation
  from Battle Stance, the potion waits until Recklessness has been used, and at its 15 s it
  follows the swap in the same moment: its 45–75 rage lands on top of the 25 the swap kept.
  There, any limit from 35 up and any window from 15 s up measured the same. With Recklessness
  off, or fighting in Berserker Stance (no swap), it's the last 20 s. (Fury's waits for
  Recklessness in Berserker Stance too, for its crits; [§5.2](#52-fury-dual-wield) notes.) Engine choices,
  measured; no source covers them. Until the M2.5a review, `maxRage` applied there too, so at the
  default 0 the potion was drunk in only 2–3.5% of those fights. On the defaults of that time
  without a phase, the potion at 55 measured +1.1% alone and Recklessness at 15 s +1.8% alone,
  +3.1% together (the review's probe, seed 12, 200,000 fights); both are now automatic.
  **In a phase too short for Recklessness's timing**, Fury drinks it with a Recklessness that
  comes by its clock ([§5.2](#52-fury-dual-wield) row 16, since the M2.5b review). Arms doesn't
  need that rule: measured with it against these defaults (seed 5302, 200,000 paired fights
  each), it gains only at 30 s with a 10% phase (+0.79%, a 3 s phase that the 4 s last chance
  already covers from its start), and loses wherever else it acts, by 0.55–1.84% at 30–90 s with a
  10% phase and 30–60 s with a 20% one (180 and 300 s, and 90 s with 20%, don't change). Before
  the phase, Arms' global cooldowns already have the rage they need, and with Heroic Strike off
  it has no off-GCD way to spend more: in a 45 s fight with a 20% phase, the potion's rage went to
  Spearing Strike and Hamstring (+6 DPS) and the phase lost Slams, Mortal Strikes and Executes
  (−23 DPS; seed 777, 20,000 fights). Fury's Heroic Strike queue spends it on every main-hand
  swing, under Recklessness's crits.
- **The Whirlwind dance** (row 12). Whirlwind costs 25 and the swap keeps 25, so the dance needs
  25–`maxRage` rage; 30 gives it a 5-rage window, where 25 would allow exactly 25. The limit is
  the dance's: after Recklessness's swap leaves the warrior in Berserker Stance, a second, plain
  line uses Whirlwind at any rage, as a Berserker base stance does. (Until September 2026 the line
  kept its ≤ 30 there, and Hamstring, from 40, waited on the Whirlwind it held back: with no execute
  phase, 606.8 → 616.6 DPS with Whirlwind on, seed 12345, 20,000 fights; the default, Whirlwind off,
  is unchanged.) Before that swap it counts in Hamstring's GCD-safe check (row 14) only at rage
  its dance could use (25–30): above `maxRage` it isn't coming up ([§7](#7-implementation-notes)
  "GCD-safe and stances"), so it no longer holds Hamstring back at its 40 rage or more.
- **GCD-safe for Mortal Strike** (rows 9–12) is checked over the line's own GCD: 1 s for Slam
  with Improved Slam 2/2, 1.5 s for the rest ([§5.1](#51-conventions-for-rotation-settings)).
  Hamstring (row 14) is GCD-safe for every ability above it with a cooldown. Rend and Overpower
  aren't in these masks: Rend has no cooldown, and Overpower waits for its window.
- **Dances from Berserker Stance** (rows 2 and 9) swap in only at rage ≤ the swap's cap, 25 with
  the default build, so the swap loses none ([§5.1](#51-conventions-for-rotation-settings)). The
  cap follows the build and the profile; it isn't a setting.
- **Spearing Strike** at 40% weapon damage is a weak filler, about 229 at 1800 AP
  ([W6](#w6-spearing-strike)). Against Giants, Dragonkin (Onyxia and most Blackwing Lair
  bosses) or mounted targets it does 120%, which puts it on par with Mortal Strike for half
  the rage. The rotation reads the creature type set under Fight
  ([encounter.md](../mechanics/encounter.md)); raid bosses aren't mounted, so there's no setting
  for that.
- **Rend's refresh** (row 2). Rend ticks every 3 s for 21 s. With the default `refreshBelowSec`
  of 3, its window opens at the 6th tick, which lands first, and the refresh restarts the ticks
  ([§7](#7-implementation-notes) "Rend is a bleed ability"), so the 7th is dropped. The wide
  window keeps Rend, and with it Bloodthrill's proc, up through a busy GCD. At 1.5 s the window
  opens 1.5 s before the 7th tick, which a GCD or Slam's cast often holds the refresh past; at 0 s
  (once Rend has run out) a Rend gets all 7 ticks (6.55 a cast against 5.74 at 3 s, counting the
  ones that miss) but leaves Bloodthrill's proc down until the next GCD. With the tuned defaults,
  1.5 s measured −0.32% and 2.5 s −0.12%, and 0 s −0.03%, its interval reaching zero (below).
  So Rend's worth is mostly Bloodthrill's uptime, not its 28-damage ticks.
- **Heroic Strike** (row 13) is off by default. Its swing replaces a white swing that would have
  given 15.75 rage with the default 3.5 s two-hander, and is reported to give none
  ([§2.4](#24-heroic-strike-and-cleave-on-next-swing); unmeasured [?]), so it costs its 12 rage
  plus that swing's. Since the default rests on that report, Arms' result lists the assumption
  even with Heroic Strike off.
  For about 157 more damage than the swing, that's the worst use of rage Arms has: Slam, Mortal
  Strike, Overpower and Hamstring all do more with it, and Execute turns what's left into 15
  damage a point. Against the tuned defaults, every threshold from 30 to 120 measured below off
  (seed 10, 200,000 fights), and at 125 or 130, a dump for rage that would otherwise hit the cap,
  it's within 0.03 DPS of off. If you turn it on, keep it that high: the old 45 is −3.0%.

#### Tuning the defaults (M2.5a)

The defaults above are the best rotation found on 2026-09-23, per
[D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23), in two
rounds. The first searched every option. Its review found Recklessness's timing and the potion's
rage limit fitted to the default fight's execute phase, at a cost of up to 8% in other fights,
so the second made both follow the phase and tuned them again (below). Against the defaults
before M2.5a, the result is **+37.02 DPS (+6.07%, 95% CI +36.87 to +37.18)**, 610.31 → 647.34,
over 400,000 paired fights on seed 3031, which no search used; against the first round's,
+1.44 (+0.22%, +1.37 to +1.51) on the same fights.

- **Method.** `scripts/tune/rotation.mjs` runs the real engine (bundled from `src/` with Vite)
  over worker threads. Every candidate plays the same fights as its baseline: the same config
  seed and fight indices, so the same fight lengths and random streams (common random numbers).
  Each fight gives a paired difference, and a candidate clears the bar when the 95% confidence
  interval of the mean difference lies entirely above zero. The setup is the default Arms setup
  (Human, the 37/14/0 build, pre-raid BiS, the Standard raid buffs, 180 s ± 10%, 20% execute,
  armor 3,731), the rotation settings aside. Each round goes in three steps, in this order:
  1. **Search** on its search seeds. Option by option, from coarse grids to finer ones around
     the best values, re-sweeping every option on top of each change adopted (coordinate
     descent), with 2-D grids where two fillers share rage (Spearing Strike and Hamstring).
  2. **Freeze** the winning combination: no change after this step.
  3. **Confirm** it on a seed no search used: against the old defaults, and against itself with
     each change reverted in turn. It's adopted only if each still clears the bar.

  Rerun it with, for example,
  `node scripts/tune/rotation.mjs --fights 400000 --seed 3031 heroicStrike.enabled=true`
  (a candidate against the defaults),
  `node scripts/tune/rotation.mjs --sweep spearingStrike.minRageOtherTargets=20:60:5` (a sweep),
  or `node scripts/tune/rotation.mjs --fights 400000 --seed 3031 --against a69198b` (the defaults
  against another commit's engine and defaults, here the last before M2.5a: how a change of
  semantics is compared with the rotation it replaces).
- **First round.** It searched on seed 1 (40,000 fights a candidate), then seeds 2–5 and 7
  (100,000–200,000) for the small effects and the early robustness checks, and confirmed on seed
  6 (400,000 fights): +35.6 DPS (+5.8%, 95% CI +35.5 to +35.8), 610.1 → 645.8, over the defaults
  before it. Every change still cleared the bar. Every option was searched: Charge is left out
  (below), and the Death Wish, trinket, Juju Flurry and racial settings do nothing for the
  default Human with no Death Wish, on-use trinket or Juju Flurry.
- **Adopted in the first round.** "Alone" is the change alone against the old defaults on search seed 1 (100,000
  fights); "in the winner" is the winner against a copy of it with that one change reverted to
  the old default, on the fresh seed 6 (400,000 fights). The changes interact: Hamstring only pays once
  Heroic Strike stops taking its rage, and Mortal Strike in the execute phase only with the new
  Recklessness and potion timings. So "in the winner" is the test that each one earns its place.

| Setting | Old → new | Alone, Δ DPS (95% CI) | In the winner, Δ DPS (95% CI) |
| --- | --- | --- | --- |
| `heroicStrike.enabled` | on → off | +18.99 (+18.71 to +19.28) | +19.50 (+19.35 to +19.65) |
| `hamstring.enabled`, `.minRage` | off, 60 → on, 40 | +0.69 (+0.49 to +0.89) | +5.85 (+5.71 to +5.99); 40 over 60: +0.90 (+0.75 to +1.04) |
| `recklessness.lastSec` | 15 → 39 (replaced in the second round) | +4.94 (+4.76 to +5.11) | +5.78 (+5.69 to +5.87); 39 over 40: +0.25 (+0.19 to +0.31) |
| `ragePotion.maxRage` | 55 → 0 (in the phase since the second round) | +1.41 (+1.27 to +1.54) | +3.11 (+3.04 to +3.18) |
| `rend.refreshBelowSec` | 1.5 → 3 | +2.42 (+2.14 to +2.71) | +2.08 (+1.93 to +2.23) |
| `execute.mortalStrikeInExecute` | off → on | −0.15 (−0.28 to −0.02) | +0.88 (+0.82 to +0.94) |
| `spearingStrike.minRageOtherTargets` | 50 → 35 | +3.62 (+3.34 to +3.91) | +0.81 (+0.66 to +0.95) |
| `battleShout.refreshBelowSec` | 3 → 0 | +0.68 (+0.62 to +0.74) | +0.72 (+0.69 to +0.75) |
| `slam.reserve` | 0 → 5 | −0.02 (−0.23 to +0.19) | +0.33 (+0.24 to +0.43) |

- **Not adopted in the first round** (each on top of the winner, on seed 8, 200,000 fights, which the search never
  used either; the old findings are measured alone against the old defaults on seed 1). Of the
  four old findings, Rend's refresh at 3 s is adopted (the table); the other three aren't:
  - **The Whirlwind dance**: alone +4.11 (+3.82 to +4.40), the old +0.8% finding, but on top of
    the winner −3.13 (−3.33 to −2.92), and −0.06 (−0.15 to +0.04) with the dance at `maxRage` 25.
    Heroic Strike's old rage now goes to Hamstring and Spearing Strike, which beat the dance's
    swap.
  - **Heroic Strike from 55** (the old +1.2% finding): alone +8.08 (+7.80 to +8.36), but off is
    +18.99. Turned on from 130, it's −0.03 (−0.06 to −0.01) against off here, and level on
    seed 10.
  - **Spearing Strike from 40** (the old +0.6% finding): alone +3.39 (+3.13 to +3.66). In the
    winner, 40 and 30 are level with 35 (−0.12 and −0.16, their intervals including zero): 35
    was the best of the 2-D grid with Hamstring (seed 4).
  - **Charge in** (`prepull.charge`): +3.44 (+3.21 to +3.67), but it's the encounter's call, not
    the rotation's. Charge works only out of combat ([§2.3](#23-rage-warrior-specific)), and a DPS
    warrior usually walks in after the tank's pull, as Fury's row 0 does
    ([§5.2](#52-fury-dual-wield), [wh-fury]). Turn it on for a fight you can open with it.
  - **Your own Battle Shout off** (`battleShout.enabled`): +1.76 (+1.73 to +1.79), but only
    because the Buffs tab's Battle Shout, another warrior's, then applies without costing this
    one a GCD or rage. That's the raid's composition, not the rotation.
  - **Berserker Stance** dancing for Rend and Overpower: −22.51 (−22.74 to −22.28).
  - Turning a row off costs: Overpower −64.78, Mortal Strike −60.42, Execute −49.55, Rend
    −29.54, Slam −25.38, Recklessness −25.08, the potion −16.62, Bloodrage −9.25, Spearing Strike
    −2.74.
  - Neither better nor worse: Hamstring from 35 or 45, Slam's reserve at 10, Bloodrage up to 90
    or 130, and Rend at 0 s. Worse: Recklessness at 38 s (−0.17), Rend at 2.5 s (−0.76), the
    potion up to 5 (−0.13), Battle Shout at 1 s (−0.27), no Slam in the execute phase (−5.50), no
    pre-pull Battle Shout (−1.82) or Bloodrage (−0.20).
- **The first round's robustness** (seed 9, 200,000 paired fights each, its winner against the
  defaults before it):
  - **Troll** (Berserking, its faction's gear): +35.90 (+35.68 to +36.12), +5.9%. Every change
    holds, except that Heroic Strike from 125 is level with off.
  - **5-minute fight** (300 s): +29.26 (+29.08 to +29.43), +4.9%. Every change holds except
    three: Hamstring from 60 beats 40 by +0.22 (+0.05 to +0.39), Mortal Strike in the execute
    phase is −0.14 (−0.22 to −0.06), and Battle Shout's refresh at 3 s is level with 0. And
    Recklessness was best at 60–65 s there, not 39 s: the phase starts 54–66 s before the end.
  - **Boss armor 3,009**: +40.73 (+40.48 to +40.98), +5.9%. Every change holds.
  - **No execute phase** (0%, seed 9, 100,000 fights): +8.26 (+7.97 to +8.54), +1.4% only: the
    potion at 0 was almost never drunk, and Recklessness at 39 s was worse than at 15 s.

  Its review found the same in fights of 30–90 s: the defaults before M2.5a were ahead by 5–8%
  at 30–60 s and level at 90 s, since 39 s left comes long before those fights' execute phases.
- **Second round: Recklessness and the potion follow the execute phase** (the M2.5a review).
  Recklessness gets `beforeExecuteSec`, and `lastSec` becomes the clock's fallback, whichever
  comes first (row 4). The potion's `maxRage` applies in the phase, with the last chance in the
  fight's last 4 s, and without a phase or Execute it's drunk as Fury's is, at up to 55 (row 17).
  The engine gained a condition for this, "the execute phase starts within x"
  ([§7](#7-implementation-notes) "Time-left conditions"). The search used seeds 101–108 (100,000
  fights a candidate, 200,000 for the close calls). A first check on seeds 2026 and 2027, before
  the potion's last chance, found the losses in 30 s fights that led to it, so those count as
  search seeds too:
  - **`beforeExecuteSec`**: 1.5 s. Against 3 s (seed 101): 0 s +0.52, 1 s +0.66, 1.5 s +0.77,
    2 s +0.56, 2.5 s +0.36, 4 s −0.68, 6 s −2.14. At 200,000 fights (seed 102), 1.5 s beat 1 s
    by 0.10 (+0.03 to +0.16) and 2 s by 0.28 (+0.22 to +0.34).
  - **`lastSec`**: 15 s, whichever comes first. With a 20% phase (seed 103), 15 s beat 14 and 16 s
    by 0.2–0.6% at 30–60 s, and the phase's timing alone (`lastSec` 1) by 4.0% at 30 s, 1.8% at
    45 s and 0.4% at 60 s; from 90 s up the phase comes first and it changes nothing. Without a
    phase (seed 104), 15 s beat 14 s by 0.17% and 20 s by 0.14%; 16–18 s were within 0.02%.
  - **The potion.** In the phase, `maxRage` 0 still beat 5 (−0.10), 10 (−0.24) and 30 (−2.33;
    seed 102). Without a phase, with Recklessness's swap, any limit from 35 and any window from
    15 s measured the same (seed 104), so it's Fury's 20 s and the cap minus 75. The last chance:
    3–15 s against none at 30–300 s and 10% and 20% phases (seed 107): 4 s was the best or level
    with it everywhere. Drinking it in the last 20 s whatever the phase, with Recklessness's swap,
    was better only in the shortest phases (+4.3% at 30 s and 10%, +0.8% at 45 s and 10%) and
    worse wherever else the phase starts in them (−0.3% to −1.7% at 45–180 s; seed 106).
  - **The rest, re-checked** on top (seed 105): nothing cleared the bar against the new defaults.
    Heroic Strike on from 100, 125 or 130: −0.34, −0.04, −0.04. Hamstring off −6.19, from 50 or
    60 −0.46 and −1.05 (35 and 45 level). Spearing Strike from 25, 45 or 50 −0.70, −0.53, −0.44
    (30 and 40 level). Slam's reserve at 0 or 10 level. Rend at 1.5, 2.5, 3.5 or 4 s −1.85,
    −0.82, −1.60, −1.30 (0 s level). Battle Shout at 1 or 3 s −0.28, −0.69. Mortal Strike out of
    the phase −1.09, no Slam in it −5.83. The Whirlwind dance −3.42 (−0.12 at `maxRage` 25).
    Bloodrage up to 90 or 130 level. Berserker Stance dancing for Rend and Overpower −23.38.
  - **Confirmation** (seed 3031, 400,000 fights, frozen first): +37.02 (+36.87 to +37.18) over
    the defaults before M2.5a, +1.44 (+1.37 to +1.51) over the first round's (`--against a69198b`
    and `--against b47953f`). Recklessness at 1, 2 or 3 s before the phase: −0.04 (−0.09 to
    +0.01), −0.24 (−0.28 to −0.20), −0.80 (−0.87 to −0.73); the potion up to 55 in the phase:
    −2.82 (−2.89 to −2.75). 1 s is level with 1.5 s here; 1.5 s cleared it on the search seed.
- **Robustness** (seed 3032, which no search used, 200,000 paired fights each): the final
  defaults' Δ DPS, and Δ %, against the defaults before M2.5a (`--against a69198b`), by fight
  length and execute phase.

  | Fight | 0% | 10% | 20% |
  | --- | --- | --- | --- |
  | 30 s | **−16.99 (−17.37 to −16.60), −2.43%** | +5.88 (+5.48 to +6.27), +0.78% | +17.84 (+17.42 to +18.27), +2.30% |
  | 45 s | +0.13 (−0.22 to +0.47), +0.02% | +19.51 (+19.14 to +19.88), +2.80% | +24.53 (+24.12 to +24.94), +3.43% |
  | 60 s | +5.66 (+5.34 to +5.97), +0.90% | +26.08 (+25.74 to +26.43), +3.90% | +26.19 (+25.82 to +26.55), +3.80% |
  | 90 s | +16.28 (+16.01 to +16.55), +2.67% | +29.54 (+29.25 to +29.84), +4.59% | +38.67 (+38.36 to +38.98), +6.00% |
  | 180 s | +26.78 (+26.57 to +26.98), +4.56% | +39.81 (+39.59 to +40.03), +6.60% | +37.10 (+36.88 to +37.33), +6.08% |
  | 300 s | +30.68 (+30.52 to +30.84), +5.29% | +36.36 (+36.19 to +36.53), +6.13% | +33.27 (+33.09 to +33.44), +5.54% |

  Against the first round's defaults (`--against b47953f`) they win everywhere: +0.22% at 180 s
  and 20%, +0.55% and +0.63% at 300 s with a phase, +1.85% at 300 s without one, +3.07% and
  +3.20% at 180 s without one and at 10%, and +5.9% to +12.5% at 30–90 s.

  **One loss remains: a 30 s fight with no execute phase**, 2.4% behind the defaults before
  M2.5a, and 45 s with none is level. Their Heroic Strike from 45 spends rage that a fight that
  short, with no Execute to pour it into, can't use otherwise; turning it back on alone is +2.7%
  there (seed 106). Without an execute phase, Heroic Strike on from 90 beat off at every length
  measured, +0.1% at 300 s to +2.2% at 30 s, but closing the 30 s gap takes it from 80 or less,
  which loses at 300 s (−0.05% from 80; seed 108). A default that follows the Fight tab's execute
  phase could take it; switches' defaults follow the talents and other settings, not the fight,
  so it's left for now.

  **30 s fights with a very short phase lose a little too** (the M2.5a verification, V1). At
  5–8%, a phase of 1.5–2.4 s, the defaults are behind those before M2.5a by 0.61%, 1.61%, 1.12%
  and 0.67% (5%: −4.38, −4.78 to −3.97; 6%: −12.07, −12.48 to −11.65; 7%: −8.35, −8.76 to −7.93;
  8%: −4.98, −5.39 to −4.56; seed 3032, 200,000 fights each), where 3–4% and 9% gain 0.07–0.54%.
  It's Mortal Strike in the phase: a phase that short has one or two GCDs, and Mortal Strike
  takes one from Execute. With it off, the same fights gain 0.27–0.70% over the old defaults. In
  the default setup it's worth +0.88 DPS (above), and 45 s fights with a 3–9% phase gain
  1.4–2.3% overall, so it stays on.

### 5.4 Protection (TPS)

Base stance: **Defensive**. Weapon: a one-hander and a shield. The default talents are 8/5/38:
the popular 5/5/36 build and the five points it left unspent ([§6.1](#61-talent-builds)):

| Ability | Cost in the default build | How it's derived |
| --- | --- | --- |
| Sunder Armor | 9 | 15 − 3 (Improved Sunder Armor 3/3) − 3 (Focused Rage) |
| Shield Slam | 17 | 20 − 3 |
| Revenge | 2 | 5 − 3 |
| Heroic Strike | 9 | 15 − 3 (Improved Heroic Strike 3/3) − 3 |
| Thunder Clap | 17 | 20 − 3 (no Improved Thunder Clap) |
| Demoralizing Shout | 7 | 10 − 3 |
| Shield Block | 10 | Focused Rage doesn't apply |

Other effects of the build:

- Shield Specialization 5/5: +5% block, and 5 rage per block
- Master of Defense 2/2: 5 rage per dodge or parry
- Defiance 3/3: threat ×1.495 overall (1.3 × 1.15)
- Bastion 5/5: +10% damage
- Improved Revenge 3/3: Revenge ×1.6
- Improved Bloodrage 2/2: 30 rage per use
- Anticipation 5/5: +20 defense
- Vanguard: Charge in Defensive Stance
- Toughness 1/5: +2% armor from items
- Deflection 5/5 (Arms): +5% parry
- Improved Heroic Strike 3/3 (Arms): Heroic Strike costs 3 less
- Cruelty 5/5 (Fury): +5% crit
- No Boundless Rage: the rage cap is 100, so the rage thresholds below are on that scale

This started from the Classic Era tank priority [wh-tank], adjusted for Forever's cheaper
abilities, the Thunder Clap change and Shield Block's two blocks. The table is the list as built
(`sim/classes/warrior/protection.ts`). Rows 0, 2, 3, 4, 9 and 12 share their code with Fury's and
Arms' (`sim/classes/warrior/shared.ts`). Every row applies in both phases: a tank doesn't change
its rotation in the execute phase, and only Execute (row 13) waits for it. The duties' timing
follows a fixed rule (below). The table's defaults are Defensive's, the best rotation found around
the rule for the default setup ([D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23);
[Tuning the defaults](#tuning-the-defaults-p1) below); the default rotation is
[Balanced](#balanced-t5), which changes five of them.

**The priority list** ([D31](../decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24);
`PROTECTION_APL`). The Rotation tab shows the rows in this order, and you can reorder them. Row 3
is two rows there, the racial and the trinkets. Only the pre-pull (row 0) is pinned, first. The
duties, Shield Block, Thunder Clap and Demoralizing Shout (rows 1, 5 and 6), are rows like the
rest ([D31](../decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24):
D26's duty timing keeps its own rule wherever the duty sits in the list): every preset puts them
before any threat ability on the global cooldown, and their refresh stays the duty rule's wherever
you move them; a moved duty makes the list Custom. The rule says when a duty wants the global
cooldown, not that it gets it: the filler takes the global cooldown first whenever rage is at its
threshold, so Thunder Clap (with `maintainOnly`), Demoralizing Shout or Battle Shout moved below it
is used only while rage is under that. The Rotation tab says so on the row, with the threshold (or
Sunder Armor's cost, if that's higher): "Below the Sunder Armor filler: used only while your rage is
under its 9." It says so whatever the threshold, even while the filler waits for Shield Slam: below
Defensive's and Max TPS's 9, Demoralizing Shout gets under one cast a fight in the default setup;
below Balanced's 60% of the bar, it gets every global cooldown with less rage than that. The consumables (row 4) are spec-wide, above
the list, and take their turn with the on-use trinkets (row 3), wherever that row sits, which in
the default order is where they always were: after rows 1–3, before Thunder Clap. A row keeps its
own conditions wherever it sits: the filler moved above Shield Slam still waits for it (with its
switch on), and Thunder Clap on cooldown (`maintainOnly` off) is tried just above the filler,
wherever that is. The presets share this order.

**Priority** (`warrior.protection.priority`, the list's preset picker), per
[D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)
and [D28](../decisions.md#d28-three-tank-rotations-defensive-balanced-and-max-tps-2026-09-24). The
picker lists the three and reads "Custom" once you change a row's setting or the order; picking one
puts the list's settings at that preset's defaults and keeps the consumables' settings:

- **Defensive** (`duties`, the default until T5, and still the value a setup that chose it stores)
  keeps the tank's duties up from the pull: Shield Block, for its survival, and Thunder Clap's slow
  and Demoralizing Shout, the raid's debuffs on the boss, by the duty rule below. The table's
  defaults are this choice's, tuned on TPS.
- **Balanced** (`balanced`, the default) keeps Shield Block, used when it's ready, and Sunder
  Armor's 5 stacks, refreshed by the duty rule (1.5 s left, one global cooldown); it drops Thunder
  Clap and Demoralizing Shout, uses the Sunder Armor filler only from 60% of the build's max rage
  (60 of the default build's 100; user decision), and queues Heroic Strike from 84% of it (84)
  ([Balanced](#balanced-t5) below).
  A setup saved with the old default and no Priority of its own gets Balanced, as with any changed
  default.
- **Max TPS** (`maxTps`) drops the duties and nothing else (rows 1, 5 and 6 are off by default),
  and is tuned on TPS alone ([Max TPS](#max-tps-p2) below). It keeps Shield Slam (row 7): dropping
  it wins on TPS only at Classic Era's threat value, which Forever's tooltip raised (D26's
  amendment; [Max TPS](#max-tps-p2)). The Buffs tab's Thunder Clap and Demoralizing
  Shout are the tank's own too, so no preset turns them on for a Protection warrior (the buffs
  doc's [§6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset)): with
  Max TPS the boss goes unslowed and at full attack power, unless you turn them on there because
  another warrior keeps them up (D26).

The choice moves only defaults, as Arms' stance does ([§5.1](#51-conventions-for-rotation-settings)):
a value you set yourself still wins.

| Setting | Defensive | Balanced | Max TPS |
| --- | --- | --- | --- |
| `shieldBlock.enabled` | on | on | off |
| `thunderClap.enabled` | on | off | off |
| `demoShout.enabled` | on | off | off |
| `sunder.refreshBelowSec` | 3 | 1.5 (the duty rule) | 3 |
| `sunderFiller.minRage` | 9 (its cost) | 60% of max rage: 60 | 9 |
| `heroicStrike.minRage` | 76 | 84% of max rage: 84 | 45 |

**The duty rule.** The duties' timing follows one fixed rule, and the search never tunes it
([D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)'s amendment):

- The duties come first in the priority, before any threat ability on the global cooldown: Shield
  Block (row 1, off the global cooldown), then Thunder Clap and Demoralizing Shout (rows 5 and 6).
- A duty that isn't a debuff on the boss is used when it's ready: Shield Block, from its 10 rage.
- A debuff, with or without a cooldown, is refreshed as soon as a missed cast could still be tried
  again before it falls off: from its own cooldown, or from one global cooldown if it has none. So Thunder Clap is refreshed with 6 s
  left, its cooldown, and Demoralizing Shout, which has no cooldown, with 1.5 s left.

The refresh times stay settings of their rows, whose help says what the rule is, so you can
change them; the search tunes only the threat abilities around the duties. Against the tuned
timing the rule replaced, it costs about 2.2% of TPS and 3.3% of DPS, and saves 2.9% of damage
taken
([Tuning the defaults](#tuning-the-defaults-p1)).

| # | Action | Condition (defaults) | Setting ids (default) | On by default |
| --- | --- | --- | --- | --- |
| 0 | Pre-pull | Battle Shout at −3 s (with row 9 on); optionally Bloodrage at −1 s; Charge: 15 rage, +3 per Improved Charge rank. With Vanguard it's used in Defensive Stance; without it, the swap back keeps at most 10 + 3 per Improved Tactical Mastery rank | `warrior.protection.prepull.battleShout` (on; needs `.battleShout.enabled`), `.bloodrage` (off: at the pull instead, row 2), `.charge` (on with Vanguard) | yes |
| 1 | Shield Block (off the GCD) | Off cooldown at rage ≥ `minRage`, in Defensive Stance with a shield: +75% block for 7 s or 2 blocks. Each block gives 5 rage (Shield Specialization) and opens Revenge | `warrior.protection.shieldBlock.enabled` (on; off with Max TPS), `.minRage` (10: its cost) | yes |
| 2 | Bloodrage (off the GCD) | On cooldown at rage ≤ `maxRage` | `warrior.protection.bloodrage.enabled` (on), `.maxRage` (70: the 100 cap minus its 30) | yes |
| 3 | Racial or trinket cooldowns (off the GCD) | On cooldown: there's no Death Wish to sync them with. Blood Fury, Berserking, Elune's Light and Eureka! (Gnome, §7); Weakness Analyzer | `warrior.protection.racial.enabled` (on), `.trinkets.enabled` (on) | yes |
| 4 | Mighty Rage Potion; Juju Flurry (off the GCD) | The potion once, the first time rage ≤ `maxRage`, so its 45–75 rage fits under the cap: early in the fight. Juju Flurry on cooldown. Each only when it's selected in Buffs | `warrior.protection.ragePotion.enabled` (on), `.maxRage` (25: the cap minus 75); `.jujuFlurry.enabled` (on) | with the consumable |
| 5 | Thunder Clap | First from the pull, before any threat ability on the global cooldown: its slow is missing from the boss, or (with `maintainOnly`) has at most `refreshBelowSec` left. Without `maintainOnly` it's also used on cooldown, just above the filler (row 11), when Shield Slam is GCD-safe. It replaces the Buffs tab's Thunder Clap | `warrior.protection.thunderClap.enabled` (on; off with Balanced and Max TPS), `.maintainOnly` (on), `.refreshBelowSec` (6: its cooldown, the duty rule) | yes |
| 6 | Demoralizing Shout | Next, before any threat ability on the global cooldown: missing from the boss, or at most `refreshBelowSec` left. It replaces the Buffs tab's Demoralizing Shout | `warrior.protection.demoShout.enabled` (on; off with Balanced and Max TPS), `.refreshBelowSec` (1.5: one global cooldown, the duty rule) | yes |
| 7 | Shield Slam | Off cooldown at rage ≥ `minRage`; the talent and a shield | `warrior.protection.shieldSlam.enabled` (on, with Max TPS too), `.minRage` (17: its cost) | yes |
| 8 | Revenge | Its window is open ([§2.8](#28-reactive-abilities-overpower-bloodthrill-revenge)) | `warrior.protection.revenge.enabled` (on) | yes |
| 9 | Battle Shout | As Fury's row 1: missing, or at most `refreshBelowSec` left and it would run out before the fight ends. It replaces the Buffs tab's Battle Shout | `warrior.protection.battleShout.enabled` (on), `.refreshBelowSec` (0: once it has run out) | yes |
| 10 | Sunder Armor | Fewer than 5 stacks on the boss, or at most `refreshBelowSec` left and they'd run out before the fight ends. It replaces the Buffs tab's Sunder Armor ×5 | `warrior.protection.sunder.enabled` (on), `.refreshBelowSec` (3; 1.5 with Balanced, the duty rule) | yes |
| 11 | Sunder Armor (filler) | Rage ≥ `minRage`; with `waitForShieldSlam`, Shield Slam GCD-safe (without Shield Slam the setting changes nothing, and the Rotation tab dims it). It fills every GCD the rows above leave | `warrior.protection.sunderFiller.enabled` (on), `.minRage` (9: its cost; with Balanced 60% of the max rage, 60 at the default build's 100), `.waitForShieldSlam` (off) | yes |
| 12 | Heroic Strike queue (off the GCD) | Rage ≥ `minRage`, or in the fight's last `anyRageLastSec` s whenever it can pay: rage left at the end is wasted; optional unqueue | `warrior.protection.heroicStrike.enabled` (on), `.minRage` (76; with Balanced 84% of the max rage, 84 at 100; 45 with Max TPS), `.anyRageLastSec` (12), `.unqueue` (off), `.unqueueBelow` (20) | yes |
| 13 | Execute | Execute phase only: a dance to Battle Stance and back, which loses Defensive Stance's threat. The swap keeps at most 10 rage, +3 per Improved Tactical Mastery rank, and that must pay Execute's cost (12), so the default build can never use it | `warrior.protection.execute.enabled` (off) | no |

Notes:

- **Your own debuffs on the boss** (rows 5, 6 and 10). They're auras of the fight, as Battle Shout
  is (row 9), and while a row is on the Buffs tab's version adds nothing, so each counts once. Each
  takes effect when it lands, so the fight starts with the boss at full armor, speed and attack
  power. Thunder Clap and Demoralizing Shout go up first: in the median fight they land at 0 s and
  1.5 s, with Shield Slam, Revenge and Sunder Armor's first stack after them (at 6 s), and they're
  each up about 99% of the fight (98.96% and 98.90%, seed 8101). Both roll the spell table, so
  either can miss and go up a GCD or a cooldown later; the duty rule refreshes each early enough to
  try again before it falls off. Sunder Armor's stacks take 450 armor each off your attacks;
  Thunder Clap's slow lengthens the boss's swings from its next one; Demoralizing Shout lowers its
  damage ([§7](#7-implementation-notes) "Debuffs on the boss"). Your Sunder Armor and the Buffs
  tab's Expose Armor don't stack in game: with Expose Armor selected, your Sunders remove no armor,
  and still make their threat [?]. In Classic Era a Sunder Armor may fail to apply over a stronger
  Expose Armor, and then makes none; if Forever does the same, a Protection warrior's TPS with
  Expose Armor falls by about 31% (Q35). The result lists this assumption while Expose Armor is on,
  and the Buffs tab's Sunder Armor row and the Rotation tab's Sunder Armor help say so. A stronger
  slow from the Buffs tab counts instead of your own. The results list the three with their uptimes.
- **Threat values** per ability, including the Forever Sunder question (Q1), live in
  [threat.md](../mechanics/threat.md#warrior). The engine uses the Forever client's 1013 for Sunder
  Armor and Classic Era's values for the rest [?]; under the `classicEra` profile, Sunder's too
  (261 [C]). The Classic reference numbers are Magey's 1.13.6
  measurements [magey-thr].
- **Why Sunder Armor fills every free GCD.** With its 1013 threat for 9 rage, it makes about as
  much threat per GCD as a Shield Slam at this gear (more before crits and armor), and about twice
  as much per rage ([W26](#w26-threat-per-global-cooldown-protection)), at Shield Slam's Classic
  Era threat [?]. Revenge is cheaper
  still, but waits for its window. So Shield Slam and Revenge keep their places for their damage
  and their cooldowns, Sunder Armor takes the rest, and Heroic Strike spends rage the GCDs can't.
- **Thunder Clap and Demoralizing Shout roll the spell table** (the client's `DefenseType` Magic):
  17% miss against a raid boss before spell hit (14% with the default gear's 3% hit rating), no
  dodge, parry or block, and a miss refunds 80% as a melee ability's does [?]. Thunder Clap crits at
  your special-attack crit chance for ×2 (Impale's class mask includes it) [?]
  ([§7](#7-implementation-notes) "Spell-table abilities").
- **Shield Block** on cooldown pushes crushing blows and crits off the boss's table for its two
  blocks ([combat-tables §8](../mechanics/combat-tables.md#8-boss--player-tanks)), and each block
  gives 5 rage and opens Revenge. With the default setup about 66% of the boss's swings are
  blocked, against the sheet's 11%, and 1.2% are crushing blows, against 15%; without Shield
  Block, 11% and 15% (seed 8107, 100,000 fights; an engine test pins it).
- **What Forever changes for tanks.** Shield Slam and Revenge do about 1.7–1.9× their Classic
  damage. Focused Rage makes Revenge cost 2 and Sunder 12 (9 with Improved Sunder Armor 3/3). Shield Specialization and Master
  of Defense add 5 rage per avoidance event [F]. But Forever's white-hit rage is normalized, and
  its damage-taken rage (`10 × the hit before armor, block and absorbs ÷ max health`, fitted to
  low-level beta logs [?]) is about a third of Classic's at 60, though blocks no longer cost any
  of it. So whether Forever tanks end up richer or poorer in rage is **unverified**: see
  [rage.md's reconciliation](../mechanics/rage.md#reconciliation-with-the-warrior-class-doc) and
  its damage-taken question ([rage OQ 1](../mechanics/rage.md#open-questions)).
- **Boss swing model.** The rage and Revenge procs depend on how often the boss attacks and
  what the attacks do. That model is in [encounter.md](../mechanics/encounter.md), including
  avoidance, crushing blows and blocks.
- **Execute** (row 13) is off: in Battle Stance you lose Defensive Stance's ×1.3 and Defiance's
  ×1.15, and without Improved Tactical Mastery a swap can't keep the 12 rage it costs
  ([§7](#7-implementation-notes) "Stance dancing").
- **The Mighty Rage Potion** (row 4) is drunk the first time rage is at most 25: early in the
  fight, once the pull's Charge and Bloodrage rage is spent. Its rage turns into threat at once;
  later, the cap would waste some of it.

#### Tuning the defaults (P1)

The defaults above are the best rotation found on 2026-09-23, per
[D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23), on TPS, the
tank's headline ([D18](../decisions.md#d18-tank-specs-report-tps-and-dps-as-equals-2026-09-22)
keeps DPS beside it), around the tank's duties and their fixed timing (the duty rule above, D26's
amendment): first on the popular 46-point build (P1), then on the 51-point build that replaced it
(P2's review), then again once Thunder Clap and Demoralizing Shout went first (P2's verification,
PV1), and once more under the duty rule (PW1). Against the starting defaults (the Classic Era
priority as built: P1's first commit, tagged `tune/protection-p1-start`), on the default build,
the result is **−10.82 TPS (−1.09%, 95% CI −10.96 to −10.68)**, 989.19 → 978.37, with DPS −9.75
(−9.82 to −9.68) and **2.91% less damage taken** (618.18 → 600.18 a second), over 400,000 paired
fights on seed 8101, which no search used. The starting defaults put the debuffs after Sunder
Armor's five stacks, where they first landed about 20 s into the fight. Keeping them up by the
duty rule costs more threat than the tuning found (below).

- **Method.** As Arms' ([§5.3](#tuning-the-defaults-m25a)): `scripts/tune/rotation.mjs --spec
  warrior-protection` runs the real engine with common random numbers; for a tank spec it compares
  TPS by default and prints each candidate's paired Δ DPS beside it. The setup is the default
  Protection setup (Human, the 8/5/38 build, pre-raid BiS with the Draconian Deflector, the
  Standard raid buffs, 180 s ± 10%, 20% execute, armor 3,731), the rotation aside. P1's search
  used seeds 1–13 and 4041–4046 (40,000–400,000 fights a candidate) on the 5/5/36 build, option by
  option with each adopted change in the base (coordinate descent), and checked fights of 30–300 s
  as it went; its winner made +14.83 TPS (+1.53%) there, on seed 5051. The re-tune checked each of
  those settings again on the new build, and searched the ones its cheaper Sunder Armor and Heroic
  Strike could move (seeds 7001–7004, 200,000 fights a candidate). With the debuffs first, every
  setting was checked again (seeds 8001–8006, 200,000–800,000 fights a candidate). Under the duty
  rule, every threat setting was searched again (seeds 9001–9003, 200,000–400,000 fights a
  candidate), and none moved. The winner was frozen and confirmed on seeds 8101 and 9104, which no
  search used: against the starting defaults (`--against tune/protection-p1-start`), against
  itself with each change reverted, and against its nearest neighbours. Per the user's ruling on
  D23, the defaults are the best for the default setup, 180 s, not at every length; the robustness
  table below shows the others.
- **What the search may change.** Not the duties' timing: the duty rule fixes it
  ([D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)'s
  amendment). The search tunes only the threat abilities around the duties: the filler, Heroic
  Strike, Shield Slam's threshold, the upkeep of Sunder Armor and Battle Shout, Bloodrage and the
  potion. A change that costs a larger share of DPS than it gains in TPS isn't adopted (D26, D18).
  Dropping the duties is [Max TPS](#max-tps-p2)'s search.

| Setting | Starting default → default | In the winner, Δ TPS (95% CI) | Δ DPS |
| --- | --- | --- | --- |
| `heroicStrike.anyRageLastSec` | none (0) → 12 s | +8.63 (+8.60 to +8.65) | +2.75 |
| `heroicStrike.minRage` | 45 → 76 | +3.49 (+3.38 to +3.59) | +2.82 |
| `sunderFiller.waitForShieldSlam` | on → off | +2.26 (+2.23 to +2.29) | −0.51 |
| `battleShout.refreshBelowSec` | 3 → 0 | +0.55 (+0.52 to +0.57) | −0.03 |
| `sunderFiller.minRage` | 10 → 9 | +0.42 (+0.41 to +0.44) | −0.06 |
| `prepull.bloodrage` | on → off | +0.34 (+0.31 to +0.36) | −0.01 |

"In the winner" is the winner against a copy with that change reverted, on seed 8101 (400,000
fights). P1 adopted all but the filler's threshold, with a 7 s dump and Heroic Strike from 65. The
re-tune moved two: the filler from 9 rage, Sunder Armor's cost with Improved Sunder Armor 3/3, and
the dump to 10 s. With the debuffs first, Heroic Strike moved again (PV5): from 76 rage and with
any rage in the fight's last 12 s, **+0.36 TPS (+0.31 to +0.41, +0.04%) and +0.31 DPS** over 65
and 10 s under the duty rule (seed 8101). The duty rule moved none (PW1). The changes interact:
the last-seconds dump lets Heroic Strike's threshold rise without leaving rage unspent when the
fight ends, which is what a high threshold cost in short fights.

- **The duty rule's cost.** The duties' timing isn't a setting the search moves (the duty rule
  above). Against the tuned timing it replaced, the defaults before PV1 (the debuffs after Sunder
  Armor's upkeep, each refreshed with 3 s left, and Heroic Strike from 65 with a 10 s dump), the
  defaults make **−22.47 TPS (−2.25%, 95% CI −22.61 to −22.33)**, 1,000.65 → 978.18, with DPS
  −10.23 (−3.28%) and **2.85% less damage taken** (617.89 → 600.28 a second), over 400,000 paired
  fights on seed 9102, which no search used. Most of it is the order: with the rule's refresh times
  and the winner's Heroic Strike, the debuffs after Sunder Armor's upkeep would be +15.99 TPS
  (+1.63%) and +10.01 DPS, for 2.52% more damage taken (seed 9102). Shield Slam and Revenge wait a GCD or two
  at the pull, and a boss that's slowed and weakened sooner gives less rage. The refresh times
  alone, against 3 s for both with the debuffs first (PV1's): −3.14 TPS (−0.32%, −3.27 to −3.01)
  and −1.41 DPS, for 0.26% less damage taken (seed 8101), with Thunder Clap up 98.96% of the fight
  where it was 97.64%, and Demoralizing Shout 98.90% where it was 99.01%.
- **Heroic Strike.** From 76, and with any rage in the fight's last 12 s. Without the dump, a high
  threshold lost in short fights (P1: 60–70 best at 180 s, −1.1% at 30 s against 45): the rage it
  pools isn't spent before the end. Under the duty rule, 72–80 with an 11–13 s dump were within
  0.22 TPS of each other, and 76 with 12 s was best or level with the best on each seed: 75 and 77
  with 12 s were level with it (−0.00 on seed 9002, −0.01 on 9003), 74 was −0.03 and −0.05, and 78
  −0.03 on both. On the fresh seed 9104, 74 and 78 are −0.02 (−0.05 to +0.00) and −0.04, and a dump
  of 11 or 13 s −0.07 and −0.03.
- **The filler doesn't wait for Shield Slam.** A GCD held for Shield Slam makes less threat than a
  Sunder Armor in it (W26), and Shield Slam's cooldown then runs from the next GCD. It's the
  closest call under D26's rule: +0.23% TPS for −0.17% DPS.
- **The filler from 9 rage**, Sunder Armor's cost: from 10, −0.43; from 11, −0.80 (seed 9001).
- **Bloodrage at the pull**, where its rage makes 5 threat a point, beat its use before the pull,
  whose rage comes out of combat and makes none ([threat.md](../mechanics/threat.md)).
- **Battle Shout's refresh** once it has run out is small, as it was for Arms.
- **Not adopted** (on search seeds, against the winner or its predecessor). Under the duty rule
  (PW1; seed 9001, 200,000 fights, unless named):
  - Shield Slam from 20, 25 or 30 rage: +0.06, +0.30, +0.55 TPS (+0.01% to +0.06%) at −0.39,
    −1.17, −1.93 DPS (−0.13% to −0.64%), a larger share of DPS, and resting on Shield Slam's
    untested threat value ([Max TPS](#max-tps-p2)). From 25 on the fresh seed 9104: +0.31 at −1.16.
  - Heroic Strike from 60–72 or 78–90: −0.05 to −3.05; from 74: level. Unqueued below 20, 30 or
    40: −0.07, −0.15, −0.25. The dump at 8–11 or 13–16 s: −0.92 to −0.02. The filler from 10, 11 or 12: −0.43,
    −0.80, −1.20; waiting for Shield Slam: −2.27.
  - The potion up to 15 rage: −0.44; up to 20–35: the same fights. Bloodrage up to 50 or 60:
    −0.74, −0.10; up to 80–100: level. Before the pull: −0.34.
  - Sunder Armor's refresh at 0, 1.5, 4.5 or 6 s: −0.25, −0.16, −0.16, −0.27. Battle Shout's at
    1.5 or 3 s: −0.24, −0.55.
  - Thunder Clap on cooldown for its threat as well (`maintainOnly` off): −100.76 (−10.30%).
    Revenge off: −9.51, at −42.19 DPS.

  The re-tune's, on the 8/5/38 build:
  - Heroic Strike from 60: +0.10 (+0.01%) at −0.22 DPS (seed 7002), a larger share of DPS; from 55
    or 70–80, worse (seed 7001).
  - The Mighty Rage Potion up to 15 rage: −0.50; up to 20 or 30: the same fights, since rage first
    falls that low at the same moment (seed 7002).
  - Bloodrage up to 60 or 80 rage: level. Sunder Armor's refresh at 1.5 or 6 s: −0.13, −0.17.
    Heroic Strike unqueued below 20: −0.13. The filler from 11: −0.48 (seed 7002).

  P1's, on the 5/5/36 build:
  - The potion up to 15 rage: +0.20 to +0.45 at 180 s, but −0.9% to −1.5% at 30 s and −0.3% at
    60 s (seeds 5–7, 12, 4045), where it's drunk late or not at all. Up to 20–50: level with 25; up
    to 5 or 0: worse (−0.9, −11.5; seed 2).
  - The filler from 13 rage or more: all worse (−0.04% at 13 to −1.26% at 40; seeds 1, 12).
  - Bloodrage up to 40 or 50 rage: −0.05 to −0.19; up to 60–100: level (seeds 2, 5, 6, 12).
  - Sunder Armor's refresh at 0, 1.5 or 6 s: level (seeds 3, 12). Its upkeep rows off, leaving the
    stacks to the filler: −16.86 (−1.73%, seed 3).
  - Heroic Strike unqueued below 20, 40 or 50 rage: level or worse (seeds 3, 12).
  - Revenge before Shield Slam: −1.22 (± 0.20), and the filler holding for Revenge as well as
    Shield Slam: −10.54 (± 0.44) (code probes, seed 11, 20,000 fights).
  - Your own Battle Shout off: +3.61, only because the Buffs tab's Battle Shout, another
    warrior's, then applies at no cost: the raid's composition, not the rotation (as for Arms).
  - No Charge in: −2.28; no pre-pull Battle Shout: −7.05 (seed 3).
- **What the duties cost in TPS** (seed 8109, 200,000 fights, against the defaults):

  | Change | Δ TPS (95% CI) | Δ DPS |
  | --- | --- | --- |
  | Thunder Clap off | +85.88 (+85.68 to +86.07), +8.78% | +15.51 |
  | Demoralizing Shout off | +32.55 (+32.36 to +32.75), +3.33% | +7.14 |
  | Shield Block off | +33.30 (+33.11 to +33.49), +3.40% | +3.71 |
  | All three off | +145.93 (+145.73 to +146.13), +14.92% | +25.52 |
  | Shield Slam off | +35.81 (+35.62 to +36.00), +3.66% | −76.22 (−25%) |
  | Thunder Clap refreshed with 3 s left | +5.41 (+5.23 to +5.59) | +0.28 |
  | Thunder Clap refreshed once it has run out (0 s) | +9.80 (+9.63 to +9.98) | +0.58 |
  | Demoralizing Shout refreshed with 3 s left | −2.07 (−2.24 to −1.91) | +3.54 |
  | Demoralizing Shout refreshed once it has run out | −0.69 (−0.86 to −0.53) | +1.57 |
  | Shield Block only from 30 rage | +2.05 (+1.99 to +2.11) | +0.72 |

  With the rotation's Thunder Clap or Demoralizing Shout off, nobody's is on the boss: the Buffs
  tab's are off by default for a Protection warrior (D26). So each row measures the whole effect,
  the global cooldowns and rage it takes and what it does to the boss. Thunder Clap off lets the
  boss swing faster, and its swings give more rage (Δ DPS +15.51). Demoralizing Shout's −204 attack
  power takes only about 29 off a 5,000 hit. Shield Block's blocks replace crushing blows and
  crits, whose bigger swings give more rage, for 10 rage a use. Shield Slam's GCD and 17 rage make
  more threat as Sunder Armor and Heroic Strike at Classic Era's +254 threat [?]
  ([W26](#w26-threat-per-global-cooldown-protection)). The duties stay on by default
  ([D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)):
  keeping the boss slowed and weakened and crushing blows off the table is the tank's job, and no
  preset lists a tank's duty, since the Buffs tab's versions assume the tank applies them
  ([§6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset)). The rows
  after Shield Slam are timings the duty rule rules out; some would clear D23's bar, but the rule
  fixes the duties' timing whatever it costs in threat. Shield Slam is its damage, which D18 weighs
  as much as its threat, and [Max TPS](#max-tps-p2) keeps it too.
- **Robustness** (seed 8103, 200,000 paired fights each): the defaults against the starting ones
  (`--against tune/protection-p1-start`), and the duty rule's refresh times alone, against 3 s for
  both.

  | Fight | Against the starting defaults, Δ TPS | Δ DPS | The rule's refresh times, Δ TPS | Δ DPS |
  | --- | --- | --- | --- | --- |
  | 30 s | −45.54 (−46.03 to −45.04), −4.34% | −25.12 | −5.83 (−5.99 to −5.66), −0.58% | +1.31 |
  | 60 s | −44.26 (−44.61 to −43.91), −4.34% | −18.24 | −7.24 (−7.50 to −6.98), −0.74% | −2.31 |
  | 90 s | −21.95 (−22.23 to −21.66), −2.18% | −13.65 | −3.00 (−3.23 to −2.76), −0.30% | −1.30 |
  | 180 s | −10.82 (−10.96 to −10.68), −1.09% (seed 8101) | −9.75 | −3.14 (−3.27 to −3.01), −0.32% (seed 8101) | −1.41 |
  | 300 s | −7.27 (−7.42 to −7.12), −0.74% | −8.72 | −3.96 (−4.11 to −3.82), −0.40% | −1.95 |

  The shorter the fight, the more the debuffs' GCDs at the pull cost against the starting
  defaults, which spent them on threat. With a 0%, 10% or 20% execute phase the fights are
  identical: every row applies in both phases, and Execute is off. An Orc (Blood Fury, the Horde's
  gear): −10.62 (−10.82 to −10.43), −1.08%. Boss armor 3,009: −13.32 (−13.54 to −13.10), −1.25%.
- **Same-millisecond ties.** When two things are due in the same millisecond, the event queue runs
  the one queued first, and that isn't a player's choice
  ([§5.1](#51-conventions-for-rotation-settings): no reaction time or latency). Sunder Armor's
  upkeep row's refresh wakes the rotation 27 s after a Sunder Armor, on the global cooldown's
  1.5 s grid, before a main-hand swing due in the same millisecond, so the ability goes out before
  the swing's rage arrives. Its refresh at 2,999, 3,001 or 2,500 ms instead of 3,000 is +0.38
  (+0.24 to +0.52), +0.04% (seed 12345, 40,000 fights). In Max TPS, Sunder Armor's upkeep rows off
  or off the grid: +0.65 (+0.48 to +0.83), +0.06%. So the order of same-millisecond events moves
  the defaults by up to about ±0.06%, which is why no refresh setting is adopted for it. Fixing it
  needs an engine-wide rule for such ties, which moves every golden: it's left for its own slice
  (P2's review, PL4).

#### Max TPS (P2)

The **Max TPS** priority is the best rotation found on 2026-09-23 on TPS alone, per
[D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)
(and its amendment) and [D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23),
on the 8/5/38 build. It drops the three duties and nothing else, and queues Heroic Strike from 45
rage. Against Defensive (then the default, "tank duties first") it makes **+151.86 TPS (+15.52%, 95% CI +151.72 to
+152.00)**, 978.23 → 1,130.09, and **27.11 more DPS (+9.0%, +27.03 to +27.18)**, over 400,000
paired fights on seed 8104, which no search used. What it costs is survival: the boss's swings
cost **40% more health a second** (600 → 839 damage taken a second, +39.70%; seed 8107, 100,000
fights), since 11% of them are blocked where 66% were, and 15% are crushing blows where 1.2% were. With
nobody's Thunder Clap or Demoralizing Shout on the boss, its faster, harder swings also give more
rage, and more rage is more Heroic Strikes: that's the DPS.

| Setting | Defensive → Max TPS | In the winner, Δ TPS (95% CI) | Δ DPS |
| --- | --- | --- | --- |
| `thunderClap.enabled` | on → off | +84.73 (+84.59 to +84.86) | +18.17 |
| `demoShout.enabled` | on → off | +33.41 (+33.27 to +33.54) | +6.15 |
| `shieldBlock.enabled` | on → off | +33.16 (+33.03 to +33.30) | +5.58 |
| `heroicStrike.minRage` | 76 → 45 | +5.81 (+5.74 to +5.88) | +1.58 |

"In the winner" is Max TPS against a copy with that change reverted, on seed 8104 (400,000
fights). Every other setting keeps the default's value: the search found none better. That
includes the last-seconds dump, 12 s in both (PV6, below).

- **Method.** As for the default ([Tuning the defaults](#tuning-the-defaults-p1)), with
  `scripts/tune/rotation.mjs --spec warrior-protection` on TPS, in the default setup, the rotation
  aside. The start was the default with the three duties off. The search went option by option
  (seeds 7011–7013, 200,000–400,000 fights a candidate), froze the winner and confirmed it on seed
  7104: against the default (`priority=maxTps`), and against itself with each change reverted
  (`--base priority=maxTps`). The verification's re-tune searched the dump and Heroic Strike again
  (seeds 8011 and 8012), and the numbers here are against the default under the duty rule (PW1),
  on seeds 8102 and 8104. P2's first search, on the 5/5/36 build with Shield Slam dropped and the
  Buffs tab's Thunder Clap and Demoralizing Shout on, had found Heroic Strike from 50. Max TPS drops
  Thunder Clap and Demoralizing Shout, so neither PV1's order nor the duty rule's refresh times
  change its rotation: the same fights, on seeds 777001 and 9103 (200,000 fights).
- **What it may change** (D26's amendment): the duties go; every other ability stays unless
  dropping it wins on TPS without resting on an untested threat value.
- **Heroic Strike from 45.** With no duties to pay for, there's more rage to spend: 43–48 were
  level and best at 180 s (seed 7012, 400,000 fights), 45 highest at +0.12 over 50; 51 and above
  worse. With the 12 s dump, 44–47 are level with 45 (seed 8012), and 50 is level too (−0.01, −0.07
  to +0.05, at +0.12 DPS; seed 8104), so none clears the bar over it.
- **The last-seconds dump at 12 s** (PV6), as the default's. Over 10 s it's +0.04 (+0.02 to +0.05)
  at −0.12 DPS on seed 8102, which no search used, and 11 s +0.03 (+0.02 to +0.04). On the search
  seeds 11 and 12 s were level with each other and better than 10 (seeds 8011, 8012); 13 s and
  longer were worse. P2's search kept 10 s because it was better at 30, 60 and 300 s (seed 7102),
  but Max TPS is tuned for the default setup, 180 s (the user's ruling on D23).
- **Shield Slam stays** (D26's amendment). Dropping it is +37.13 TPS (+3.29%, +37.00 to +37.26) at
  −80.99 DPS on seed 8104, but only at Classic Era's +254 threat [?]: Forever's tooltip raised its
  threat from "a high amount" to "a very high amount" ([threat.md](../mechanics/threat.md#warrior)).
  The break-even is about **+449**: at +449 keeping it is level (−0.25, −0.51 to +0.01; seed 8108,
  100,000 fights), and above it keeping it wins on TPS as well (Q34). Using it only from 45 rage
  (+9.10, +0.80%, at −19.74 DPS on seed 8104) rests on the same value: at +449 it's level too
  (+0.21, −0.06 to +0.48).
- **Not adopted** (on search seeds, against the winner or its predecessor): the filler from 10
  rage (−0.24); the potion up to 15 or 35 rage (−2.60, −0.49); Bloodrage before the pull (−0.29)
  or up to 60 rage (level); Sunder Armor's refresh at 0 or 6 s (−0.31, −0.37); Heroic Strike
  unqueued below 20 (−0.18) (seed 7011). P2's first search, on the 5/5/36 build: the filler from
  12–30 rage (−0.32 to −10.54), Shield Block from 30 or 50 rage (−26.03, −16.43), Thunder Clap on
  cooldown for its threat (−156.48), Revenge off (−5.68, and −33.07 DPS). Sunder Armor's upkeep
  rows off: +0.65, a same-millisecond tie ([Tuning the defaults](#tuning-the-defaults-p1)).
- **The Buffs tab's Thunder Clap and Demoralizing Shout** are in no preset, and a Protection
  warrior's own, so with Max TPS nobody keeps them up by default. Turned on there, as another
  warrior's, they count while the rotation's are off: then Max TPS makes +122.05 TPS (+12.48%) over
  the default, and 18% more damage taken (seed 8107, 100,000 fights). The default is the same
  either way: its own debuffs make the Buffs tab's add nothing.
- **Robustness** (seed 8106, 200,000 paired fights each):

  | Fight | Max TPS against the default, Δ TPS | Δ DPS | Heroic Strike from 50, in Max TPS |
  | --- | --- | --- | --- |
  | 30 s | +185.44 (+184.91 to +185.96), +18.49% | +39.72 | −3.15 (−3.32 to −2.98), −0.27% |
  | 60 s | +177.15 (+176.79 to +177.50), +18.17% | +35.32 | −1.05 (−1.19 to −0.91), −0.09% |
  | 90 s | +161.54 (+161.25 to +161.83), +16.39% | +30.51 | −0.17 (−0.29 to −0.06), −0.02% |
  | 180 s | +151.86 (+151.72 to +152.00), +15.52% (seed 8104) | +27.11 | −0.01 (−0.07 to +0.05), level (seed 8104) |
  | 300 s | +149.34 (+149.18 to +149.49), +15.30% | +25.98 | +0.03 (−0.03 to +0.10), level |

  Every row applies in both phases, so an execute phase changes nothing, as for the default (0%
  and 10% on seed 8106: +151.96 both).

  With T4's interim gear and T3R-2's Thorns (seed 20260924, 100,000 paired fights, which no search
  used), Max TPS against Defensive is **+157.36 TPS (+13.89%, +157.05 to +157.67)**, 1,133.05 →
  1,290.41, **+25.38 DPS (+6.99%)**, 362.96 → 388.34, and **41% more damage taken** (610.61 →
  862.34 a second). The Rotation tab's help quotes these.

#### Balanced (T5)

**Balanced** is the default rotation
([D28](../decisions.md#d28-three-tank-rotations-defensive-balanced-and-max-tps-2026-09-24)): how
most tanks play fights below progression difficulty. It keeps the tank's active mitigation and the
raid's armor debuff, and drops the debuffs that only lower the boss's damage:

- **Kept:** Shield Block (row 1), used when it's ready, from its 10 rage; and Sunder Armor's 5
  stacks (row 10), refreshed by the duty rule, from one global cooldown (1.5 s left), as it has no
  cooldown.
- **Dropped:** Thunder Clap and Demoralizing Shout (rows 5 and 6).
- **The Sunder Armor filler only above 60% rage** (row 11; user decision, 2026-09-24, amending
  D28's "not used as a filler"): its default is 60% of the build's max rage, as the plan has it
  ([§2.3](#23-rage-warrior-specific): 100 + Boundless Rage, × a Gnome's 1.05), to the nearest
  point: 60 of the default build's 100, 63 of a Gnome's 105, 78 of Boundless Rage 3/3's 130, 82 of
  a Gnome's 136.5 with it. The setting itself is in rage points, as every threshold is
  ([§5.1](#51-conventions-for-rotation-settings)): only Balanced's default is a share, and a value
  you set stays as you set it. The filler row's summary shows the points ("From 60 rage"), and the
  setting's help says the default is 60% of your max rage. It fires at or above the threshold, so at
  100 it plays exactly as the absolute 60 did (a unit test pins it, and the golden didn't move).
- **Heroic Strike's threshold scales the same way,** from 84% of the max rage: 84 of 100, 88 of a
  Gnome's 105, 109 of 130, 115 of 136.5. Scaling the filler alone costs a bigger bar TPS: with
  Boundless Rage 3/3 (`05-05050003-552101233301210031`, seed 31101, 60,000 paired fights), the
  filler from 78 with Heroic Strike still from 84 was **−6.17% TPS** against both scaled (Heroic
  Strike takes the rage before the filler can), while both scaled are level with the absolute 60
  and 84 (+0.09% TPS, 1,177.26 against 1,176.15; −2.02 DPS). A Gnome's 63 and 88 are level with 60
  and 84 too (−0.10% TPS, 1,230.30 against 1,231.56).
- **Tuned** on the balanced objective, ΔTPS% + ΔDPS% against Defensive
  ([D30](../decisions.md#d30-the-sim-finds-the-best-talents-gear-and-rotation-itself-defaults-are-its-results-2026-09-24)),
  a first pass ([D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)):
  Heroic Strike from 84. Everything else keeps Defensive's value.

Against Defensive, on seed 31101 (100,000 paired fights, which no search used), in the default
setup: **+107.92 TPS (+9.53%, 95% CI +107.61 to +108.24)**, 1,133.05 → 1,240.98; **+23.12 DPS
(+6.37%, +22.94 to +23.29)**, 363.06 → 386.18; and **21% more damage taken**, 610.59 → 739.10 a
second (+128.51, +128.36 to +128.67). On the balanced objective that's +15.90%. Max TPS, on the
same fights, is **+13.86% TPS** (1,290.09) and **+6.94% DPS** (388.25) for **41% more damage
taken** (862.24 a second, +251.65; [Max TPS](#max-tps-p2)).

- **Method** (D27's first pass). `scripts/tune/rotation.mjs --spec warrior-protection --base
  priority=duties` compares each candidate with Defensive on the same fights, and prints Defensive's
  own TPS, DPS and damage taken, so each Δ reads as a share. On seed 31001 (20,000 fights a
  candidate) it swept Heroic Strike's threshold (30–100) with the filler from 60, then a grid of
  the filler's threshold (50–70 by 5) against Heroic Strike's (80–88 by 2), then the other
  settings with room to move, against Balanced. The winner was confirmed on seed 31101 with the
  filler's 50 and 70 beside it.
- **Heroic Strike from 84.** With the filler waiting for 60 rage, Heroic Strike's queue decides how
  much rage reaches it: from 40 (the first pass without the filler) it spends the rage before the
  filler can, −11.39% TPS against Defensive; from 60 +0.96%, 70 +6.46%, 80 +9.11%. With the filler
  at 60, 82, 84 and 86 are level on the objective (+15.76%, +15.77%, +15.75%; 84: +9.46% TPS, +6.31%
  DPS), and 88 and up lose DPS faster than they gain TPS (100: +7.56% TPS, +3.68% DPS).
- **The filler's 60 is the user's number, not the search's.** Lower is better on the objective, and
  higher worse (seed 31001, Heroic Strike at its best for each): 50 +16.90%, 55 +16.39%, 60 +15.77%,
  65 +14.88%, 70 +13.64%. On the fresh seed, from 50 is **+0.72% TPS and +0.20% DPS against 60**
  (+10.25% and +6.57% against Defensive, +16.82% on the objective), and from 70 −2.09% TPS and
  −0.59% DPS. The filler from its cost, 9, as Defensive has it, makes +11.23% TPS and +6.93% DPS
  against Defensive (seed 31001, Heroic Strike from 76). Each rage the filler waits for is a global
  cooldown with nothing else to spend it on, since Protection has nothing else on the global
  cooldown; 1,013 threat for 9 rage is the best threat per rage it has
  ([W26](#w26-threat-per-global-cooldown-protection)). 60 stays the default, as decided; the
  numbers are here for the tuning milestone (D27).
- **Not moved** (seed 31001, against Balanced): the last-seconds dump off (+0.24% TPS, −0.59% DPS)
  or at 24 s (−1.56% TPS); cancelling Heroic Strike below 20 rage, Shield Slam from 30 and Shield
  Block from 30 (all level or worse); Bloodrage up to 50 or 90 (−0.13% and −0.01% TPS); the filler
  waiting for Shield Slam (−0.72% TPS, +0.29% DPS). Shield Slam off (+2.64% TPS, −25.1% DPS) fails
  D28's rule, a larger share of DPS lost than TPS gained. Battle Shout off (+0.28% TPS, +0.05% DPS)
  is within D27's resolution and would leave the raid's Battle Shout to the Buffs tab, so it stays.
- **What the rule fixes** (T5's first pass, before the filler, against Balanced): Sunder Armor
  refreshed with 3 s left, Defensive's tuned value, instead of the rule's 1.5 s was level on the
  objective (−1.35 TPS, +0.45 DPS); Sunder Armor's upkeep above Shield Slam, where a duty would
  sit, cost −9.05% on the objective, since its 5 stacks from the pull hold Shield Slam and Revenge
  back. The row stays where Defensive has it; the presets share one order.

### 5.5 Multi-target options (light)

**Not simulated yet**: the sim has one target. Until it has more, the Fight tab offers no number
of targets ([ux.md](../ux.md#sections) "Fight"), and a saved `extraTargets` changes nothing.
The plan, for when [encounter.md](../mechanics/encounter.md) sets 2 or more targets:

- Cleave replaces Heroic Strike (`<spec>.cleave.enabled`, on at 2+ targets; same `minRage`
  logic).
- Whirlwind and Raging Blows hit up to 4 targets.
- Sweeping Strikes goes on cooldown (Arms).
- Deep Wounds is tracked per target.
- Thunder Clap hits up to 4 targets.

Splitting threat across targets is out of scope ([doctrine §1](../doctrine.md#1-what-were-building)).

## 6. Sensible defaults

### 6.1 Talent builds

Per [doctrine §5](../doctrine.md#5-defaults), each spec's default is the build below. Each was
the most popular Forever build for its spec when chosen (2026-09-22) [tal], and the app offers
them as presets with the variants. All three decode and validate
([data/talents.md](../data/talents.md#build-codes-verified)).

| Spec | Build (points) | Code | Fit | Alternative preset |
| --- | --- | --- | --- | --- |
| Fury | 17/34/0 | `30305013002-050530035150010051-` | **Good.** Arms: Improved Heroic Strike 3, Improved Rend 3, Improved Tactical Mastery 5, Anger Management, Deep Wounds 3, Impale 2. Fury: Cruelty 5, Unbridled Wrath 5, Improved Cleave 3, Boundless Rage 3, Dual Wield Specialization 5, Raging Blows, Enrage 5, Death Wish, Flurry 5, Bloodthirst. **It skips Precision (+3% hit).** | **"Fury + Precision" 15/36/0: `30305013-050520035150310051-`**. Drop Impale 2 and one point of Improved Cleave (2/3 is enough for the tier gate) to take Precision 3/3. A rough estimate favours it with less than 9% hit from gear (Q23). Offer it as a preset and let the sim decide |
| Arms | 37/14/0 | `30305213132515201-05050103-` | **Good.** Every damage talent in Arms, plus Cruelty 5, Unbridled Wrath 5 (2 rage per proc with a two-hander), Piercing Howl and Boundless Rage 3 | none |
| Protection | 8/5/38 | `35-05-552101233301210531` | **Good for TPS.** The popular 5/5/36, with the five points it left unspent: Improved Heroic Strike 3 (Heroic Strike costs 9), Improved Sunder Armor's third point (Sunder Armor costs 9) and Toughness 1. Deflection 5 feeds Revenge and Master of Defense. | **"Protection + Improved Thunder Clap" 5/5/41: `05-05-552131233301210531`**. Improved Thunder Clap 3 (Thunder Clap costs 11) instead of Improved Heroic Strike 3. The sim favours the default (Q23, below) |

The variant codes and Protection's two were built by hand and pass `decodeTalentCode`,
`validateTalentBuild` (no violations) and a byte-exact round trip through `encodeTalentCode`
against `src/data/talents/warrior.json`. The Fury tier gates hold 15 points in tiers 1–3 before
Dual Wield Specialization, 26 before Precision, 30 before Flurry and 35 before Bloodthirst.

**Protection's 51 points.** The popular Protection build [tal] spends only 46 points, and so did
the "TPS" variant beside it, which traded three of Deflection's points for Improved Heroic Strike.
A raid tank spends all 51, so the default is the popular build plus the five: first the threat
talents it was missing, Improved Heroic Strike 3/3, the warrior tank's Arms pick since Classic, and
Improved Sunder Armor's third point, for the filler; then the last point in armor, Toughness 1/5,
since a raid tank's next choice is its survival. At 51 points Improved Heroic Strike no longer
costs Deflection, so the "TPS" variant is gone, and its preset is now the other way to spend
three points on a tank's own rotation: Improved Thunder Clap, for the duty it keeps up. The sim
settles Q23 for Protection: with the default rotation (seed 7105, 200,000 paired fights) the
Improved Thunder Clap build makes 5.63 less TPS (−0.56%, 95% CI −5.70 to −5.56) and 1.90 less DPS
than the default, and with Max TPS, which doesn't use Thunder Clap, 22.64 less (−2.01%). The old
46-point build makes 18.47 less (−1.85%). Those two codes stay decodable, since saved setups may
hold them (`scripts/scrape/stored-builds.json`). Builds aren't tuned by the sim (D23), so these
numbers settle only the preset's question.

**D30's survival floor** (user decisions, 2026-09-24): no default or search drops **Last Stand**,
**Improved Shield Wall 2/2** (the big cuts to defensive cooldowns) or **Deflection 5/5** (+5%
parry: an avoided hit costs a warrior rage, so a threat-first search would drop it, but tanks take
it). **Anticipation isn't in the floor** (user decision, after the paladin theorycrafter's build
measured +1.0% TPS with Anticipation 2/5): it's the **preferred filler**, where a build's points
left after its threat talents go before Toughness or other weaker talents. The default keeps
Anticipation 5/5. **Toughness is optional.** A unit test holds the floor (`defaults.test.ts`).

### 6.2 Race, weapons and consumables

| Spec | Alliance default | Horde default | Weapon default | Why |
| --- | --- | --- | --- | --- |
| Fury | **Human**, with a sword in either hand (+2% crit on all attacks, Q15) | **Orc**, with axes (+1% crit, Blood Fury +10% AP) | Slowest good one-hander in the main hand and a one-hander in the off hand, from [pre-bis items](../data/items.md) | Night Elf (Elune's Light), Troll (Berserking) and Tauren (+1% hit) are close alternatives. **Weapon skill racials no longer exist** ([§2.9](#29-racials-for-warriors)) |
| Arms | **Human**, with a two-handed sword (+2% crit and Weaponmaster extra attacks) | **Orc**, with a two-handed axe (+1% racial and +5% Weaponmaster crit) | Slowest good two-hander (3.5–3.8 s) | Maces and staves (15% armor ignored) are worth simulating (Q9) |
| Protection | **Human** (sword) | **Orc** (Blood Fury helps threat; the interim set's sword, Krol Blade, forgoes Axe Specialization, whose best axe, Frostbite, is only +0.14% TPS, [§6.3](#63-protection-gear-interim-measured-m56-t4)) | One-hander and shield. The shield is required for Defiance, Bastion, Shield Slam and Shield Block | Tauren (+1% hit, +5% health) and Dwarf (Stoneform) are defensive alternatives |

**Consumables tier.** The default is the "standard" preset from
[buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md), which owns the item
list and the stacking rules. **No world buffs**
([decision D8](../decisions.md#d8-world-buffs-are-excluded-2026-09-22)). The warrior-specific
parts:

- **Mighty Rage Potion.** Default: once, in the execute phase, or in the last 20 s without one.
  Both specs drink it in the phase once an Execute has emptied the bar, with a last chance at the
  phase's end (Fury's last 2 s, Arms' last 4 s); in a phase too short for Recklessness's timing,
  Fury drinks it with Recklessness instead. Without a phase, or with Execute off, both drink it in
  the last 20 s. Fury waits until Recklessness has been used, so its rage joins Recklessness's
  crits. Arms from Battle Stance waits for Recklessness's stance swap, which would cap its rage;
  Arms in Berserker Stance, with no swap, doesn't wait. Whether it should, for Recklessness's
  crits as Fury does, is unmeasured ([§5.2](#52-fury-dual-wield) #16,
  [§5.3](#53-arms-two-hander) #17). Classic Era players use it for the rage burst in Execute
  [marrow-cd].
- **Weapon oils and stones.** A sharpening stone or weightstone on each weapon's flat damage
  feeds the `weapon` and `normalized` formulas as flat weapon damage [C].
- **Tanks.** A defensive tier (armor and health consumables) matters to survival, not TPS.
  It's included in the preset for completeness only.

### 6.3 Protection gear: interim, measured (M5.6 T4)

The Protection pre-raid list (`scripts/scrape/pre-raid-bis.json`) is a survival list, which
[D29](../decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24)
rules out as a preset: its Stamina and defense add no threat (Stamina costs some, since rage from
hits divides by max health), and its Mark of the Chosen is an effect the sim doesn't model. Until
the optimizer's results replace every spec's gear
([D30](../decisions.md#d30-the-sim-finds-the-best-talents-gear-and-rotation-itself-defaults-are-its-results-2026-09-24),
M5.7 O4), the default Protection warrior wears an interim set, built the way the paladin's
([paladin.md "Protection defaults"](paladin.md#protection-defaults)) and the bear's
([druid.md §7.3a](druid.md#73a-interim-gear-m56-t3)) were, so the three tanks' presets are like
for like. It's set in `src/sim/defaults.ts` (`INTERIM_GEAR`) over the list's. The talents (§6.1)
and the rotation (§5.4) are unchanged: the rotation was tuned on the v1 gear, and O4 re-tunes it
with the talents and gear.

1. **The gear review's set** (2026-09-24: a paired, slot-by-slot search over the pool on TPS, plate
   and a shield, PvP rank 10 at most, no raid drops), with **Darksoul Shoulders** for its Abyssal
   Plate Epaulets, a random-enchantment base that lost its stats in the pool (GR11; the review
   measured −4 TPS against the Epaulets' partial stats).
2. **Adaptive Combat Assistant stays.** Its +20 expertise rating is worth its place only under
   [D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)'s
   hypothesis, but the best trinket without an unmeasured rating, Earthstrike, makes 44.1 TPS
   (3.9%) and 11.9 DPS less, where the bear's swap cost 0.04%. The rule was to swap only at little
   cost. With unmeasured ratings ignored, Earthstrike would make 7.4 more. Stalwart Watcher's
   Signet's +10 expertise stays for the same reason: the best ring without it, Painweaver Band,
   makes 17.1 TPS (1.5%) less. The two items' expertise is worth 77.3 TPS (6.9%) at the default
   (the "unmeasured ratings ignored" row below). Adaptive Combat Assistant's use (a 450 absorb and
   Nature damage) isn't simulated, and the results' assumptions say so.
3. **The tanks' effective-health floor** (D30, user decision, 2026-09-24): effective health, maximum
   health ÷ (1 − armor's damage reduction against the level-63 boss), is at least 90% of the v1
   preset's (the pre-raid list's, with the same talents and buffs): 13,218 of 14,686 for a Human.
   The review's set had 85.3% (12,534: health 5,209, armor 8,093). Three swaps, each the one that
   gained the most effective health per 1% of TPS it cost, bring it to 91.5%, for 0.73% of the TPS
   and 1.01% of the DPS. The candidates were the items the pre-raid lists rank: plate or no armor
   type, no unmodelled use effect, no armor-only item, no random-enchantment base or raid drop. At
   each step the 60 largest effective-health gains were screened at 4,000 fights, and the best 8
   re-run at 20,000 (seed 424242, paired against the step's set):

   | Step | Slot | Out | In | TPS | DPS | Effective health |
   | --- | --- | --- | --- | --- | --- | --- |
   | 1 | Ring | Band of Earthen Might | Don Julio's Band (19325) | −2.2 (−0.19%) | −0.8 | +313 |
   | 2 | Main hand | Dal'Rend's Sacred Charge | Krol Blade (2244) | −0.6 (−0.05%) | −0.2 | +120 |
   | 3 | Feet | Battlechaser's Greaves | Knight-Lieutenant's Plate Greaves (23287; Horde: Blood Guard's, 22858) | −5.5 (−0.49%) | −2.7 | +473 |

| Slot | Item | Slot | Item |
| --- | --- | --- | --- |
| Head | Lionheart Helm (12640) | Feet | Knight-Lieutenant's Plate Greaves (23287; Horde: Blood Guard's, 22858) |
| Neck | Pendant of Celerity (22340) | Rings | Don Julio's Band (19325), Stalwart Watcher's Signet (275971) |
| Shoulder | Darksoul Shoulders (19695) | Trinkets | Adaptive Combat Assistant (272437), Hand of Justice (11815) |
| Back | Earthweave Cloak (21187) | Main hand | Krol Blade (2244), a sword for Human's Sword Specialization; Horde wears it too (the best axe is +0.14% for an Orc) |
| Chest | Knight-Captain's Plate Hauberk (23300; Horde: Legionnaire's, 22872) | Shield | Dreadguard's Protector (18756) |
| Wrist | Vambraces of the Sadist (13400) | Ranged | Satyr's Bow (18323), the list's |
| Hands | Death Grips (18722) | | |
| Waist | Brigam Girdle (13142) | | |
| Legs | Knight-Captain's Plate Leggings (23301; Horde: Legionnaire's, 22873) | | |

At the defaults (seed 424242, 20,000 fights), against the v1 list's gear with the same talents,
buffs and rotation:

| Setup | TPS | DPS | Damage taken a second | Health | Armor | Effective health |
| --- | --- | --- | --- | --- | --- | --- |
| v1 gear (Human) | 978.7 | 301.4 | 600.1 | 6,029 | 8,264 | 14,686 |
| **Default** (Human, interim gear) | **1,124.2** | **357.0** | 610.7 | 5,559 | 8,159 | 13,440 (91.5%) |
| Default, unmeasured ratings ignored | 1,046.9 | 331.4 | 622.2 | 5,559 | 8,159 | 13,440 |
| v1 gear, Max TPS | 1,130.5 | 328.3 | 838.9 | 6,029 | 8,264 | 14,686 |
| Default, Max TPS | 1,279.2 | 380.9 | 862.6 | 5,559 | 8,159 | 13,440 |
| v1 gear (Orc) | 971.0 | 297.1 | 601.6 | 6,049 | 8,258 | 14,729 |
| Default (Orc) | 1,116.3 | 352.8 | 612.1 | 5,579 | 8,153 | 13,483 (91.5%) |

The gain is in every hit's threat: Sunder Armor 309 → 348 TPS, Shield Slam 185 → 212, Revenge
156 → 177, Heroic Strike 112 → 150, Windfury 53 → 79. The expertise lowers the boss's parries,
and more Strength, crit and hit do the rest. The warrior takes 1.8% more damage a second than in
the v1 gear. The default warrior is 1.39× the Protection paladin's TPS (810.8) and 1.04× the bear's
(1,081.9), within D29's benchmark. A unit test holds the floor (`defaults.test.ts`), for both
factions. The table is before a raid druid's Thorns joined every tank's Standard raid preset
(T3R-2, 2026-09-24): +9.6 TPS (+0.9%) and +6.3 DPS in the golden run (1,123.3 → 1,132.9 TPS),
and nothing else moves; the paladin gained the same Thorns and its fix round's talents (823.6 TPS,
seed 12345). The enchants stay the spec's
([buffs §6.4](../mechanics/buffs-debuffs-consumables.md#64-enchant-defaults-by-spec)).

## 7. Implementation notes

- **Where rank values come from.** Read talent ranks from `src/data/talents/warrior.json`.
  Encode per-rank numbers as `perRank × rank` with the constants in [§4](#4-talents). Two
  talents don't fit that form: Improved Execute (3, 5) and Improved Rend (12, 23, 35) are
  tables.
- **Damage order.** Compute in this order:
  1. base weapon roll or ability base
  2. flat bonuses (+157, +87, +160, +35, +50, block value, flat weapon damage)
  3. ability-percent modifiers: Improved Revenge, Improved Rend, the ×0.4 or ×1.2 on Spearing
     Strike, Eureka!
  4. multiplicative damage-done auras: Death Wish, Enrage, Two-Handed Weapon Specialization,
     Bastion, stances. The Defensive Stance −10% is itself one of these auras.
  5. crit multiplier
  6. armor, except for bleeds

  The general order and rounding are in
  [damage-and-timing.md](../mechanics/damage-and-timing.md); a conflict there wins.
- **On-next-swing queue.** Model Heroic Strike and Cleave as a flag on the main-hand swing
  event, and resolve cost and table at swing time ([§2.4](#24-heroic-strike-and-cleave-on-next-swing)).
  While the flag is set, the off-hand's attack table uses single-wield miss.
- **Talents on abilities** (`sim/classes/warrior/modifiers.ts`). The plan applies the cost
  reductions ([§2.3](#23-rage-warrior-specific)), Impale ([§2.5](#25-crits-impale-flurry-deep-wounds))
  and Raging Blows ([§3.1](#31-damage-abilities)) once, from the build's talent ranks, when it
  resolves the rotation's abilities; the engine sees only resolved costs and crit multipliers.
  Tests check each talent's list of abilities against its client class mask. Cleave's own
  reductions (Improved Cleave, Raging Blows) arrive with Cleave, so W21's Cleave costs aren't
  tested yet.
- **Unbridled Wrath on Heroic Strike swings** ([§2.3](#23-rage-warrior-specific) default, Q5)
  uses a "swing landed" trigger: a landed white swing, extra attack, or on-next-swing ability's
  swing.
- **The execute phase.** One event at `t_exec`
  ([encounter.md implementation notes](../mechanics/encounter.md#implementation-notes)) switches
  the engine to the phase's priority list. The engine sorts the lines into two lists up front,
  one per phase, from their execute-phase conditions and Execute's own restriction, so neither
  phase walks lines that can't apply. Only specs with a rotation get the event.
- **Cooldowns are `cast` abilities** (`sim/classes/warrior/abilities.ts`). Bloodrage, Death
  Wish, Recklessness, Berserker Rage and the racial cooldowns roll nothing. Each puts its buff
  on the warrior as an aura and grants its rage, at once and then on ticks: Bloodrage 10, then
  1 a second for 10 s, the first tick 1 s after the cast (W19). The rage is an energize, so it's
  capped at max rage and makes 5 threat per rage gained
  ([threat.md](../mechanics/threat.md#threat-from-healing-power-gains-and-buffs)), on the
  ability's own breakdown row. Costs, cooldowns, the GCD and stances work as for strikes, with
  the numbers from the client ([§3.2](#32-buffs-debuffs-and-cooldowns), §2.9), checked by the
  tests.
- **Battle Shout, on-use items and consumables are `cast` abilities too.** Battle Shout's
  aura is +139 attack power for 180 s (§1.1); `battleShout(profile)` gives `classicEra`
  Classic Era's +232 for 120 s, as the catalogue does for the Buffs switch (§3.2). An on-use item's use effect sits next to its
  other effects in `sim/effects/items.ts` (Weakness Analyzer), a consumable's on its Buffs entry
  (`sim/effects/buffs.ts`: the Mighty Rage Potion and Juju Flurry), each with its numbers from
  the client, checked by the tests; the rotation turns them into casts. A cast can draw a random
  extra on its rage at once (the potion's 0–300 tenths, from the proc stream) and have a limit of
  uses per fight, after which it's never ready again (the potion's one).
- **Auras a crit ends.** An aura can carry crit charges (Weakness Analyzer: one): every crit
  you deal, white or special, uses one after its procs, and the aura ends when they run out. A
  magic proc's crit (Fiery Weapon) is a non-periodic crit too, so it uses one
  ([combat-tables §9](../mechanics/combat-tables.md#9-spell-hit-and-crit-generic)).
- **Upkeep lines** (Battle Shout, row 1). Their condition, "the aura is down, or has at most
  `b` ms left and ends before the fight", is resolved like the time-left conditions: whenever
  the aura starts or ends, the engine moves the start of the line's window of times (to `b`
  before the aura's end, never if it outlasts the fight, or back when it's down) and schedules
  a wake-up at that time. A walk then rejects the line with one comparison, which matters
  because the line sits first in the list.
- **The pre-pull** (row 0) runs at the start of each fight, before any event: each cast at its
  negative time, without paying its cost, then Charge's rage and the stance swap's cap. Its
  aura ends early (its duration minus the lead), its cooldown runs from the cast, its ticks due
  before the pull are rage at the pull and the rest keep their phase.
- **Talented cooldown rage.** Improved Bloodrage multiplies each of Bloodrage's gains by
  `1 + 0.25 × rank`, and each gain is floored to a tenth, as talent-scaled energizes are
  ([rage.md](../mechanics/rage.md#rounding)). At 1/2 that gives 12.5 at
  once and 1.2 per tick (1.25 floored) [?] (Q29), and a result with Improved Bloodrage 1/2 and
  Bloodrage in the rotation lists it among its assumptions; 2/2 is exact (15 + 1.5). Improved
  Berserker Rage adds 5 rage per rank.
- **What the cooldowns' buffs do in the sim.** Death Wish is ×1.20 physical damage, like any
  damage-done aura (white, yellow and bleeds). Recklessness's +100% and Elune's Light's +10% are
  aura crit (aura 290, like Berserker Stance), which raises spell crit too for as long as they
  last (magic procs; Recklessness only in `forever`, above): the white table still truncates crit at its crit
  cap, specials at theirs, and melee spells' second roll takes it as is
  ([combat-tables §2.2, §3](../mechanics/combat-tables.md#3-special-yellow-attacks)). The +3-boss
  suppression takes `min(auraCrit, 1.8)`, which talents and stance already fill, so it doesn't
  change ([§4.4](../mechanics/combat-tables.md#44-crit-suppression)). Blood Fury's +10% attack
  power multiplies the stat block's AP multiplier. Berserking's +10% attack speed multiplies
  other haste from the next swing (W17). Their fear immunity and Bloodrage's health cost aren't
  simulated.
- **Damage taken by the cooldowns isn't simulated.** Death Wish (+5%) and Recklessness (+20%)
  raise damage taken, and no tank rotation uses them yet. The DPS stand-in's hits are sized
  before your mitigation ([encounter §4](../mechanics/encounter.md#4-targets-and-position)), so
  the sim applies neither these nor the stance's +10% to them. For rage that is the Forever
  default anyway: it reads the hit before damage-taken modifiers [?]
  ([rage.md](../mechanics/rage.md#forever-)).
- **Berserker Rage's extra rage from damage taken** uses rage.md's ×1.0 default [?] (Q20), so
  its aura would change nothing and isn't applied. The result flags this when damage is taken.
- **Eureka!** (Gnome, `src/sim/classes/eureka.ts`) goes with the other racials (row 3, aligned with
  Death Wish when that's on). Its aura has 3 charges; each use of an ability the client's masks cover
  (Bloodthirst, Mortal Strike, Whirlwind, Slam, Execute, Overpower, Heroic Strike, Hamstring, Shield
  Slam, Thunder Clap, Rend; not Sunder Armor, Revenge or Spearing Strike) spends one as it's paid,
  whether it lands or not, at 40% off its cost rounded down, and deals +10% (Rend's bleed +10%). The
  Q18 answers are [?]: rounded down, Execute's base cost only, a miss spends a charge (`eureka`).
  Worth +1.48% Fury, +1.46% Arms and +0.64% Protection TPS (Gnome, racial on vs off, the defaults, seed 12345, 20,000 fights).
- **Time-left conditions.** The fight's drawn length is known, so "time left ≤ x" and "≥ x"
  become a window of times per line for each fight: the engine compares the time with it,
  without evaluating a condition, and wakes the rotation at `fight end − x`, when a "≤ x"
  condition becomes true. The execute phase's start is known the same way
  ([encounter.md](../mechanics/encounter.md#implementation-notes)), so "the execute phase starts
  within x" (Arms Recklessness, [§5.3](#53-arms-two-hander) row 4) moves the window's start to
  `execute start − x`, with a wake-up then; in a fight without the phase it never holds. Its
  opposite, "the execute phase starts in more than x" (Fury's potion with a Recklessness that
  came by its clock, [§5.2](#52-fury-dual-wield) row 16), moves the window's end to just before
  `execute start − x`, with no wake-up, since it only becomes false; without the phase it always
  holds. Two lines for one ability give "whichever comes first"; conditions on one line all have
  to hold.
- **Execute's rage.** Rage is kept in tenths, and Execute converts everything left after its
  cost, tenths included: at 27.3 rage and cost 15 it deals `600 + 15 × 12.3 = 784.5` before
  modifiers. The 15 per rage is the client's `EffectChainAmplitude` 1.5 × 10 on 20662 [F]
  [client] (SpellEffect, 1.60.1.69913; `src/data/client/spells.json` keeps it). Whether the
  server converts only whole rage points is Q28 [?]; a result whose rotation uses Execute lists
  it among its assumptions. A blocked Execute has landed, so it spends the rage too.
- **Stances.** Each ability carries the stances it can be used in ([§3.1](#31-damage-abilities)
  "Stance", from the client's `ShapeshiftMask`), and the engine refuses it in any other. Each spec
  fights in its base stance ([§5](#5-spec-models-and-rotations); Arms in the one its
  `arms.baseStance` setting picks, [§5.3](#53-arms-two-hander)). The plan's static numbers (the
  damage, threat and damage-taken multipliers and the stat block's crit) are the base stance's, as
  they were before stances could change. Each stance carries what it changes relative to them: its
  own effects ([§2.1](#21-stances)) and the talents' stance-bound ones that hold in it (Defiance),
  as factors on damage (all schools), threat and damage taken, and crit and spell crit deltas.
  The base stance's factors are exactly 1 and its deltas 0, so a spec that never swaps gets the
  same results, bit for bit. A swap switches them: the crit deltas (Berserker Stance's +3% is aura
  crit, and spell crit too in `forever`) re-derive the stats, so crit suppression and the table
  caps apply as usual; the rest are multipliers. A bleed snapshots the stance it was applied in (Rend). Only boss swings use damage
  taken, for the health a hit costs; the DPS stand-in's hits ignore it (below). Forever's rage
  from damage taken reads the hit before it either way ([rage.md](../mechanics/rage.md#forever-)).
- **Stance swaps** are off the GCD and share a 1 s cooldown ([§2.1](#21-stances)). Each keeps at
  most the plan's cap: in `forever` 10 + 3 × Improved Tactical Mastery rank, in `classicEra` 5 ×
  the rank of the talent in the same place, Classic's Tactical Mastery
  ([rage.md](../mechanics/rage.md#stance-changes-and-tactical-mastery), W18). The rest is lost,
  with no threat and no refund, and it can cancel a queued Heroic Strike whose unqueue threshold
  it drops below. The pre-pull Charge's swap is at the pull, so the next swap can come 1 s in.
- **Stance dancing.** A priority-list line can name a stance to dance to. When the current
  stance refuses its ability, the line is usable only if the swap cooldown has ended and the rage
  the swap would keep still pays the ability's cost; then, if its other conditions hold, the
  engine swaps and uses the ability in the same moment. The line's `maxRage` is what keeps the
  swap in from wasting rage ([§5.1](#51-conventions-for-rotation-settings)): with the swap
  before the ability, `rage ≤ cap` loses nothing (`cap + cost` would lose up to the cost). At every
  decision point away from the base stance the engine first swaps back if the swap cooldown has
  ended, so the warrior is back 1 s after the swap in; that swap keeps at most the cap too, and
  nothing guards it. There's one swap per cooldown, so no second dance until it ends. Meanwhile,
  abilities the other stance refuses wait, and a line without a dance waits for a stance that
  allows its ability. The engine wakes the rotation when the swap cooldown ends. A dance line can
  also **stay** (Arms Recklessness, [§5.3](#53-arms-two-hander) row 4): once its ability is used,
  the stance it was used in becomes the base stance for the rest of the fight, so there's no swap
  back, and later dances return to it. Each fight starts in the plan's base stance again. These
  timings are engine choices; no source covers them.
- **GCD-safe and stances.** An ability the current stance refuses isn't coming up, so a GCD-safe
  condition skips it, unless one of its lines dances for it and that dance could happen at the
  current rage: the rage the swap keeps pays for it (`min(rage, cap) ≥ cost`), and rage is at most
  the highest `maxRage` of its dance lines (none: no limit). Then it counts as usual. Otherwise its
  dance waits for rage, and a GCD spent meanwhile delays nothing. So Arms' Whirlwind dance (at
  25–30 rage, [§5.3](#53-arms-two-hander) row 12) no longer holds Hamstring (row 14, at its rage
  threshold or more) back whenever Whirlwind is off cooldown. With both on and M2.3c's defaults
  (Hamstring from 60), Hamstring went from 0.01 casts a fight to 0.18 under this rule. An engine
  choice; no source covers it.
- **Slam's cast.** An ability can have a cast time (`castMs`: Slam's 1500 ms, 250 less per
  Improved Slam rank). The GCD starts with the cast, and no GCD ability starts before the cast
  completes: the engine holds the GCD until then. Off-GCD lines (the Heroic Strike queue,
  Bloodrage, racials, potions) still act during the cast [?]. Rage is checked when the cast
  starts, and Slam pays its cost, starts its 15 s cooldown and rolls when the cast completes; if
  it can't pay then, it fails, costing nothing and starting no cooldown [?]. Haste doesn't shorten
  the cast, as it doesn't shorten the GCD [?]
  ([damage-and-timing §3.5](../mechanics/damage-and-timing.md#35-global-cooldown)). All three
  are Q3, and a result whose rotation uses Slam lists them among its assumptions.
  - **Without Improved Slam** (`castStopsSwings`), the cast cancels both pending swings and both
    timers restart from full when it completes
    ([damage-and-timing §3.3](../mechanics/damage-and-timing.md#33-swing-reset-rules)). A queued
    Heroic Strike stays queued and replaces the first main-hand swing after the cast. An extra
    attack granted during the cast waits for it to complete and then swings at once; no warrior
    source can grant one then, since nothing else lands during the cast. A tank's parry during
    the cast hastens nothing, with no swing pending.
  - **With Improved Slam** the timers are untouched: white swings, a queued Heroic Strike and
    extra attacks land during the cast as usual. A Heroic Strike swing during the cast spends
    its rage first, so it can leave too little for Slam, which then fails.
- **Without a main-hand weapon** the engine refuses every ability that attacks with one: weapon
  strikes, melee spells (Bloodthirst), bleeds (Rend), Execute and the on-next-swing queue (Heroic
  Strike). It has no unarmed attacks, white or special (the result says so), and none of these may
  spend rage without an attack to land. Casts, which roll nothing (Bloodrage, Battle Shout, Death
  Wish, Recklessness, Shield Block, the racials, trinkets and potions), are still used. So are the
  attacks that need no weapon: Thunder Clap and Demoralizing Shout on the spell table, and Shield
  Slam, which needs a shield instead. They roll the main hand's special-attack table (Shield Slam)
  or crit (Thunder Clap) as if at your level's base weapon skill, 300, with no weapon's hit, crit or
  armor penetration, and the result lists them. An engine choice.
- **Spearing Strike's target.** The plan resolves its weapon share once, from the encounter's
  creature type: 1.20 against Giants and Dragonkin, 0.40 against anything else
  ([encounter §6](../mechanics/encounter.md#6-creature-type-biome-and-zone-forever)). There's no
  setting for mounted targets, since raid bosses aren't mounted. Without a two-hander the engine
  never uses it. The Arms rotation reads the same creature type for the line's conditions
  ([§5.3](#53-arms-two-hander) row 11), and a result that uses it lists its weapon share among
  its assumptions (Q13).
- **Rend is a bleed ability** (`bleed`). Its application rolls the special table once: a miss,
  dodge or parry refunds 80% of the cost
  ([rage.md](../mechanics/rage.md#rage-refunds-on-avoided-abilities)), and anything else (the
  hit, block or crit slice) lands the bleed. The application deals no damage and can't crit,
  but as a landed melee attack it fires on-hit procs (Windfury, Weaponmaster, weapon enchants)
  [?] (Q32). A landed application snapshots the physical damage multiplier and the main hand's
  special-attack crit chance, crit suppression included [?]
  ([damage-and-timing §4](../mechanics/damage-and-timing.md#4-dots-and-bleeds)), and ticks 7
  times, every 3 s. The ticks ignore armor, never miss, make threat at dmg × 1 and no rage. In
  `forever` each tick rolls crit at that chance and deals the ability's crit multiplier (×2.2
  with Impale 2/2, [§2.5](#25-crits-impale-flurry-deep-wounds)) [?]. A tick crit fires no crit
  procs and doesn't end Weakness Analyzer: neither Flurry's nor Deep Wounds' proc mask (0x15554,
  0x11154) has the bit for dealing periodic damage (0x40000) [F] [client] (SpellAuraOptions,
  1.60.1.69913), and the trinket ends on a "non-periodic critical effect". A refresh restarts
  the ticks and re-snapshots them; a tick due at the very moment of the refresh lands first, and
  the partial tick in progress is lost (WE-9). A result whose rotation uses Rend lists its tick
  crits (in `forever`) and its on-hit procs among its assumptions.
  - **"Your Rend is on the target"** is an aura with no stat mods, the ability's `aura`, up from
    the application to the last tick. The rotation reads it with the aura conditions it already
    has: "Rend missing or under x s left" ([§5.3](#53-arms-two-hander) row 2) is the upkeep
    condition Battle Shout's row uses, so it also skips a refresh while the running Rend lasts
    past the end of the fight; "Rend up" gates a line. Bloodthrill (§2.8) reads the same
    marker.
  - **Its breakdown row, "Rend",** counts applications in casts, misses, dodges and parries, and
    ticks in hits and crits.
- **Raging Blows' off-hand strike** has its own breakdown row, "Whirlwind (off hand)". It comes
  right after the main-hand strike, whether or not that one landed, costs nothing more and
  refunds nothing [?] (Q13).
- **Extra attacks.** Weaponmaster and Windfury schedule an immediate main-hand swing (0 ms
  delay) and reset the main-hand timer. The 200 ms Weaponmaster internal cooldown is an aura
  cooldown, and so is Windfury's 100 ms in `forever` (none in `classicEra`), the client's value
  [F] (§2.7, Q27). The chain rule is per root swing: a source that procced from a swing, or
  from any extra attack that followed it, can't proc again in that chain [?]
  ([damage-and-timing §5.4](../mechanics/damage-and-timing.md#54-extra-attacks-and-chaining)).
- **Reactive windows** are auras on the warrior; Overpower's lasts 5 s
  ([§2.8](#28-reactive-abilities-overpower-bloodthrill-revenge)). Procs open it: a "the target
  dodged" trigger on any of your attacks, white or special, either hand, and Bloodthrill's
  white-swing proc with its own 6 s. A refresh keeps the later end, so a dodge doesn't cut a
  Bloodthrill window short [?] (Q11). The ability's lines need the window (the engine puts that
  condition in front of each line's own), and using the ability ends it, before its roll, so a
  miss spends it too [?] (Q10). There's one window, not the client's 3 banked points [?] (Q10).
  The rotation adds the openers only when it uses Overpower. Protection's Revenge window reuses
  it: a block, dodge or parry of the boss's swings opens it for 5 s [?] (Q12), and Revenge ends it.
  With a 5 s cooldown as long as the window, ending it changes nothing: any window open before a
  Revenge has run out by the time Revenge is ready again.
- **Procs that need an aura.** A proc can name an aura that must be up for it to roll:
  Bloodthrill needs your Rend's marker on the target (above, "Rend is a bleed ability"). While the aura is down the
  proc isn't rolled, so it draws no random number; a plan without that aura (no Rend in the
  rotation) leaves the proc out.
- **Overpower's table.** It can't be dodged, parried or blocked, so its one roll is miss, crit,
  hit: the crit slice starts after the miss slice, and the table truncates it at 100
  ([combat-tables §3](../mechanics/combat-tables.md#3-special-yellow-attacks)). Its crit chance is
  the special crit plus Improved Overpower's 25% per rank (W5). A miss refunds 80%
  ([rage.md](../mechanics/rage.md#rage-refunds-on-avoided-abilities)); threat is 0.75 × damage [C]
  ([threat.md](../mechanics/threat.md#warrior)).
- **Debuffs on the boss** (Protection, [§5.4](#54-protection-tps) rows 5, 6 and 10). A strike or spell
  can put a debuff on the boss when it lands: its `aura`, like Rend's marker. The boss is the only
  target, so each is an aura of the fight, with mods of its own: armor removed per stack (Sunder
  Armor 450, up to 5 stacks, 30 s; each application adds a stack and restarts the duration), an
  attack-speed slow (Thunder Clap 20%) and attack power (Demoralizing Shout −204).
  - **Armor** removed re-derives your armor factors at once, after the Buffs tab's armor debuffs
    and before armor penetration ([damage-and-timing §1.2](../mechanics/damage-and-timing.md#12-armor-reduction-debuffs-and-penetration)).
  - **The slow** sets the boss's time between swings to its unslowed speed × (1 + slow) from its
    next swing: the swing under way isn't rescaled, as your own haste isn't [?]
    ([damage-and-timing §3.1, §3.2](../mechanics/damage-and-timing.md#32-attack-speed-debuffs-on-the-boss-tank-modeling)).
    The strongest slow counts, the Buffs tab's included.
  - **Attack power** changes each swing's damage by AP ÷ 14 × the unslowed swing speed, never
    below 0 ([encounter §5](../mechanics/encounter.md#5-boss-melee-tank-modeling), WE-4).
  - **The Buffs tab.** A row that keeps one up replaces the Buffs tab's same entry (the aura has
    the entry's id), so it counts once. When the Buffs tab fills the entry's exclusive group with
    another (Expose Armor for Sunder Armor), only one applies in game, and the Buffs tab's stays:
    the rotation's debuff changes nothing on the boss, and its threat still counts [?]. In Classic
    Era a Sunder Armor may fail to apply over a stronger Expose Armor, and then makes no threat
    (Q35); the result lists the assumption whenever it applies.
  - The results list the three with their uptimes, next to the cooldowns and buffs. These are
    engine choices; no source covers them.
- **Spell-table abilities** (Thunder Clap, Demoralizing Shout). The client's `DefenseType` Magic
  [F] [client] (SpellCategories, 1.60.1.69913) puts them on the spell table
  ([combat-tables §9](../mechanics/combat-tables.md#9-spell-hit-and-crit-generic)): one roll for
  spell miss, 17% against a level-63 boss less your spell hit (the gear's hit rating counts), and no
  dodge, parry or block. What lands rolls crit at the main hand's special-attack crit chance and
  deals the ability's crit multiplier: Thunder Clap is in Impale's class mask, a sign that its crits
  are an ability's [?]. A miss refunds 80% of the cost, as a melee ability's does [?]
  ([rage.md](../mechanics/rage.md#rage-refunds-on-avoided-abilities)). They fire no melee procs; a
  crit uses Weakness Analyzer's charge. Thunder Clap's 103 damage is physical, so armor and the
  physical modifiers (Defensive Stance, Bastion) apply. All of this is Q33, and the result says so.
  In the engine they're abilities of kind `spellTable`, not the paladin's `spell`, whose spells crit
  at spell crit and have no refund or debuff ([architecture.md › Spells](../architecture.md#the-event-loop)).
- **Abilities that deal no damage** (Sunder Armor, Demoralizing Shout) never crit: a Sunder Armor
  that lands in the crit slice is a hit, fires no crit procs and makes only its flat threat. It
  still lands as a melee attack, so it procs on-hit effects [?], as Rend's application does (Q32).
- **Shield Slam's and Revenge's damage** is flat, not weapon-based: a uniform roll over the
  tooltip's range (640–670 and 138–168: the client's `Variance`), Improved Revenge's +20% per rank
  on it, then Shield Slam's block value, ×1 (W14, W15). Both are melee spells: two rolls
  ([combat-tables §3](../mechanics/combat-tables.md#3-special-yellow-attacks)). Shield Slam and
  Shield Block need a shield: without one the engine never uses them, as it never uses Spearing
  Strike without a two-hander.
- **Enrage and incoming damage.** Enrage, Master of Defense and Shield Specialization consume
  incoming-damage events from the encounter model (Berserker Rage would too, with a known
  multiplier; Q20). With no events (the DPS default), those auras never trigger.
- **Skipped, with no measurable DPS or TPS effect.** Victory Rush, Blood Craze and other
  healing, Iron Will, Piercing Howl, Booming Voice, Improved Hamstring, crowd-control and
  utility abilities, Last Stand, Shield Wall, Retaliation, Taunt and Mocking Blow; also Deep
  Wounds' interaction with target bleed immunity (none in scope). Spell batching is ignored
  per [damage-and-timing.md](../mechanics/damage-and-timing.md). Execute still reads its rage
  at cast time.
- **Where the client data and the tooltips disagree, use the tooltip.** Flurry's buff row
  still has base 30; the tooltip and rank curve say 25. Dual Wield Specialization's hit aura
  has no off-hand restriction in the data; the tooltip limits it to the off hand. Each case is
  an open question.
- **Where tooltips can't tell us, use the client data.** Tooltips don't show GCD, stance or
  proc-mask facts, so this doc takes them from the DB2 tables and tags them [F] with a `db`
  link, or with [client] where the raw-client check covered the value.

## 8. Worked examples

Each example turns into a unit test. Unless stated otherwise the reference warrior is level 60
with **1800 AP after buffs**. Values are pre-armor and pre-miss, rounded to 2 decimals.
"Two-hander T" is a 3.8-speed weapon doing 105–157 damage (average 131). "One-hander O" is a
2.6-speed weapon doing 106–198 damage (average 152).

### W1: Bloodthirst at 1800 AP

`0.35 × 1800 + 48 = 678.00` [F]. A crit with Impale 2/2 deals `678 × 2.2 = 1491.60`; without
Impale, `1356.00`. At 2000 AP it deals `748.00`. For comparison, Classic's `0.45 × 1800 = 810`
[C].

### W2: Mortal Strike with two-hander T

The AP bonus uses the normalized speed 3.3: `1800 / 14 × 3.3 = 424.29`. Damage ranges from
`105 + 424.29 + 160 = 689.29` to `157 + 424.29 + 160 = 741.29`, with an **average of 715.29**.
With Two-Handed Weapon Specialization 3/3 (×1.03) the range is 709.96–763.52, average
**736.74**.

### W3: Whirlwind with two-hander T

The average is `131 + 424.29 = 555.29`, or 571.94 with ×1.03. The range is 529.29–581.29.

### W4: Slam with the same two-hander

Slam isn't normalized, so its AP bonus is `1800 / 14 × 3.8 = 488.57`. The average is
`131 + 488.57 + 87 = 706.57`, or **727.77** with ×1.03. With Improved Slam 2/2 the cast is
1000 ms, the GCD is 1000 ms and the swing timer isn't touched. Without it, the cast is 1500 ms
and the main-hand timer resets when it completes.

### W5: Overpower with the same two-hander

The average is `131 + 424.29 + 35 = 590.29`, or 607.99 with ×1.03. Its crit chance is the
sheet crit + 50% (Improved Overpower 2/2), before the table caps in
[combat-tables.md](../mechanics/combat-tables.md).

### W6: Spearing Strike

Against a normal target: `0.40 × 555.29 = 222.11`, or **228.78** with ×1.03. Against a
Dragonkin: `1.20 × 555.29 = 666.34`, or 686.33 with ×1.03 [F] [?] (Q13).

### W7: Heroic Strike with one-hander O in the main hand

The AP bonus uses the real speed: `1800 / 14 × 2.6 = 334.29`. A white swing averages
`152 + 334.29 = 486.29`. Heroic Strike averages `486.29 + 157 = 643.29`, ranging from 597.29
to 689.29. Cleave averages `486.29 + 50 = 536.29` on each of 2 targets.

### W8: Off-hand white swing with Dual Wield Specialization 5/5

With one-hander O in the off hand: `486.29 × 0.5 × (1 + 0.25) = 303.93`. Without the talent
(0/5): `243.14`.

### W9: Whirlwind with Raging Blows, dual-wielding one-hander O

The main-hand normalized AP bonus is `1800 / 14 × 2.4 = 308.57`, so the main-hand strike
averages `152 + 308.57 = 460.57`. The off-hand strike averages `460.57 × 0.625 = 287.86` [?]
(Q13).

### W10: Execute

- Improved Execute 2/2 (cost 10), cast at 50 rage: `600 + 15 × 40 = 1200`.
- The popular Fury build (no Improved Execute, cost 15) at 50 rage: `600 + 15 × 35 = 1125`.
- Boundless Rage 3/3 at a full 130 rage, cost 15: `600 + 15 × 115 = 2325`.
- After a hit, rage is 0.

### W11: Bloodthirst versus Execute break-even

Bloodthirst beats a 30-rage Execute when `0.35·AP + 48 > 600 + 15·(30 − cost)`:

- At cost 15: `AP > (825 − 48) / 0.35 = 2220.00`.
- At cost 10: `AP > 2434.29`.
- At cost 12 (Focused Rage builds): `AP > 2348.57`.

Classic's break-even was 2000 at cost 10 [marrow].

### W12: Deep Wounds 3/3

- **Two-hander T:** the total is `0.6 × (131 + 488.57) = 371.74`, so each of the 4 ticks is
  `92.94`, or **95.72** with Two-Handed Weapon Specialization ×1.03 [C] [ws-spell].
- **One-hander O in the main hand:** the total is `0.6 × 486.29 = 291.77`, and each tick is
  `72.94`. The result is the same when the off hand is the one that crits.

### W13: Rend with Improved Rend 3/3

`147 × 1.35 = 198.45` over 21 s, or 28.35 per tick for 7 ticks.

### W14: Revenge rank 6, Protection

With Improved Revenge 3/3, Bastion 5/5 and Defensive Stance, the multiplier is
`1.6 × 1.10 × 0.90 = 1.584`. The average is `153 × 1.584 = 242.35`, ranging from 218.59 to
266.11.

### W15: Shield Slam rank 4, Protection

With block value 150, Bastion 5/5 and Defensive Stance: `(655 + 150) × 0.99 = 796.95`,
ranging from 782.10 to 811.80. A crit does ×2.0; the Protection build has no Impale.

### W16: Threat multiplier

Defensive Stance with Defiance 3/3 and a shield: `1.3 × 1.15 = 1.495` [F]. Without a shield
Defiance doesn't apply, so the multiplier is 1.3. Battle and Berserker Stance are 0.8.

### W17: Flurry haste

One-hander O at 2.6 s swings every **2.080 s** with Flurry 5/5 (÷1.25); Classic's ÷1.30 gave
2.000 s. Adding Berserking ×1.10 gives `2.6 / (1.25 × 1.10) = 1.891 s`. Rounding to integer
milliseconds follows [damage-and-timing.md](../mechanics/damage-and-timing.md).

### W18: Rage on a stance swap

A warrior at 60 rage swaps stance. With Improved Tactical Mastery 5/5 they keep 25; at 0/5
they keep **10** (Classic 0/5 kept 0). At 18 rage they keep 18.

### W19: Bloodrage

With Improved Bloodrage 2/2, the warrior gains 15 rage at t = 0, then 1.5 rage per second
from t = 1 to t = 10 s, for 30 in total. Without the talent: 10, then 1 per second, for 20.

### W20: Rage-cost table, Protection default build

Sunder Armor 9, Shield Slam 17, Revenge 2, Heroic Strike 9, Thunder Clap 17, Demoralizing
Shout 7, Battle Shout 10, Shield Block 10, Death Wish (if talented) 7. With the Improved Thunder
Clap preset instead ([§6.1](#61-talent-builds)): Heroic Strike 12, Thunder Clap 11.

### W21: Rage-cost table, Fury default build

Heroic Strike 12, Cleave 15, Bloodthirst 30, Whirlwind 25, Execute 15, Hamstring 10,
Overpower 5, Battle Shout 10, Death Wish 10. The "Fury + Precision" variant has Improved
Cleave 2/3, so Cleave costs 16.

### W22: Unbridled Wrath expected rage

At 5/5, 100 landed white hits give an expected 60 rage with one-handers, or 120 with a
two-hander. Parries, dodges and misses give none.

### W23: Off-hand rage with Dual Wield Specialization 5/5

If [rage.md](../mechanics/rage.md) gives R rage for an off-hand hit, the warrior gains
`2.0 × R`. For example, R = 4.10 gives 8.20.

### W24: Off-hand white miss chance against a level-63 boss

The inputs are 300 weapon skill, 5% hit from gear, and no Precision. Using the rules in
[combat-tables.md](../mechanics/combat-tables.md): 8% base and +19% dual-wield penalty in both
profiles.

`classicEra` (the first 1% of +hit is suppressed at a skill gap over 10 [magey-at]):

- Dual Wield Specialization adds +10% off-hand hit, so the miss chance is
  `27 − (5 + 10 − 1) = 13.0%`.
- With Heroic Strike queued, the off-hand uses the single-wield miss chance:
  `max(0, 8 − 14) = 0%`.
- The main-hand white miss chance is `27 − 4 = 23.0%`.

`forever` (the default; no hit suppression): off-hand `27 − (5 + 10) = 12.0%`; queued
`max(0, 8 − 15) = 0%`; main hand `27 − 5 = 22.0%`.

### W25: Weaponmaster, mace

Forever values: take 3731 boss armor, reduced by 5 Sunders (2250), Faerie Fire (505) and
Curse of Recklessness (505 in Forever, no AP bonus; see
[buffs §4.1](../mechanics/buffs-debuffs-consumables.md#41-armor-reduction)), to 471.
Weaponmaster 5/5 with a mace brings it to `471 × 0.85 = 400.35` [?] (Q9).

### W26: Threat per global cooldown, Protection

The default build in Defensive Stance with Defiance 3/3 and a shield (×1.495, W16), average
hits, no crits, no armor, and the default setup's block value of 62 (the threat values are
[threat.md](../mechanics/threat.md#warrior)'s):

| Ability | Threat | Rage | Threat per rage |
| --- | --- | --- | --- |
| Sunder Armor | `1013 × 1.495 = 1514.44` | 9 | 168.27 |
| Shield Slam | `((655 + 62) × 0.99 + 254) × 1.495 = 1440.93` | 17 | 84.76 |
| Revenge | `(153 × 1.6 × 0.99 × 2.25 + 270) × 1.495 = 1218.86` | 2 | 609.43 |
| Thunder Clap | `103 × 0.99 × 2.5 × 1.495 = 381.11` | 17 | 22.42 |
| Demoralizing Shout | `43.2 × 1.495 = 64.58` | 7 | 9.23 |

## 9. Open questions

The beta may be level-capped: foreverchanges lists level-20 BiS [bis]. If so, some tests can
only use low ranks, and anything that needs level 40+ (Bloodthirst, Mortal Strike, Shield
Slam, deep talents) must wait until the cap is raised. To log tests, use `/combatlog` and read
the log file, or count hits by hand. Attack a mob 3 levels above the character to reproduce
boss conditions. For threat, use the threat macro from [magey-thr]:
`UnitDetailedThreatSituation`.

1. **Sunder Armor threat.** The Forever client data adds a THREAT effect (63): 1 at rank 1, 405 /
   608 / 810 / 1013 at ranks 2–5, which is 2.25 × the armor removed ([F] [client] (SpellEffect,
   1.60.1.69913)). Classic has none in the client, and its threat of 261 is set on the server
   [magey-thr]. Is Forever's Sunder threat now about 1013 at rank 5, and is that on top of the
   server value? **Test:** read the threat macro before and after a Sunder, at every rank
   available, in Battle Stance (×0.8). Rank 1 is especially interesting, since its data value is
   "1". Owner: [threat.md](../mechanics/threat.md).
2. **Bloodthirst.** Does it really deal 35% of AP + 48 at rank 4? The tooltip and data agree;
   the in-game check matters because this is Fury's core ability. **Test:** average
   non-critical Bloodthirst hits at two AP values (with and without Battle Shout) against a
   low-armor target.
3. **Slam without Improved Slam.** Is it still the Classic swing-reset behaviour? And with
   Improved Slam, does it truly never touch the timer? The engine also assumes that Slam pays
   its cost and starts its cooldown when the cast completes, failing if rage fell below its cost
   during the cast; that off-GCD actions (the Heroic Strike queue, Bloodrage, racials) work during
   the cast; and that haste doesn't shorten the cast ([§7](#7-implementation-notes)). **Test:**
   swing timestamps around Slam casts in the combat log; when the cooldown starts (cast start or
   end); with Improved Slam and little rage, whether a Heroic Strike swing during the cast makes
   Slam fail; the cast time with Berserking or Flurry up.
4. **Dual Wield Specialization.** Does the +2% per rank hit apply to the off hand only, and does
   the rage bonus multiply the off-hand's rage from dodges too? The data shows a general hit aura
   (54) with no hand restriction (the spell as a whole requires a one-handed weapon) [F] [client]
   (SpellEffect, SpellEquippedItems, 1.60.1.69913). **Test:** main-hand and off-hand miss counts
   separately over 500+ swings each, with and without the talent. Also record rage per off-hand
   hit.
5. **Unbridled Wrath.** Does it proc from Heroic Strike and Cleave swings and from extra
   attacks? The data's mask is "auto attack". The pre-SoD WarriorSim counts Heroic Strike
   swings [ws-player]. **Test:** rage gains logged while spamming Heroic Strike with a low-rage
   setup.
6. **Heroic Strike queue and off-hand miss.** Does a queued Heroic Strike still lift the
   dual-wield miss penalty from off-hand swings, as in Classic Era's "not a bug" [bnet-hsq]?
   A third-party beta test says yes (5.19% vs 18.27% off-hand miss over 77 and 394 swings,
   [fw-2]); another Forever sim assumes it doesn't [ew]. The sim keeps the Classic rule.
   **Test:** a guild repeat with ≥1,000 off-hand swings per state, Heroic Strike always queued
   versus never queued.
7. **Flurry.** Is it 25% (tooltip and rank curve) or 30% (the buff's base in the data)? And
   does a Heroic Strike or Cleave swing consume a Flurry charge (Forever data: no; the pre-SoD
   WarriorSim: yes, for Classic)? **Test:** swing interval with Flurry up versus down, and the
   number of hasted swings after a crit when Heroic Strike is queued.
8. **Enrage triggers.** Which events count as a "damaging attack": periodic damage, AoE,
   fully absorbed hits, blocked hits? Does a new proc refresh the duration? And how many such
   events does a DPS warrior see in a raid? **Test:** Enrage uptime while being hit by mobs;
   in raids later, from WarcraftLogs-style logs.
9. **Weaponmaster.** When a mace ignores armor, is the 15% applied before or after Sunder, Faerie
   Fire and Curse of Recklessness? For a sword, the client's 200 ms internal cooldown is [F]
   [client] (SpellAuraOptions, 1.60.1.69913); does the server honour it, and does a multi-target
   ability (Whirlwind, Cleave) roll the extra attack once per cast or once per target hit? (The
   axe and polearm crit with an axe and another weapon, which the sim gives to the axe's hand
   only, is Q15's.)
   **Test:** mace hit damage against a mob of known armor, with and without Sunder; sword procs
   per Cleave on two mobs.
10. **Overpower window.** The data has a combo-point-like counter that stacks to 3, on a 5,000 ms
    window [F] [client] (SpellPower, SpellAuraOptions, SpellDuration, 1.60.1.69913). Can several
    dodges bank several Overpowers in game? The sim keeps one window that each dodge refreshes,
    and a used Overpower spends it even when it misses ([§7](#7-implementation-notes) "Reactive
    windows"): does a missed Overpower give the point back?
11. **Bloodthrill.** Does it trigger only from white swings (data mask) or from all melee
    attacks (tooltip)? The sim takes white swings, extra attacks included. Does it need your own
    Rend? Does its 6 s window stack with a dodge window? The sim keeps one window, which a dodge
    refreshes but never shortens.
12. **Revenge window.** Is it 5 s after a block, dodge or parry? The sim assumes Overpower's
    5 s. The only source we found for a number (4 s) is Turtle WoW, which is forbidden. It's
    small: 4 s would cost the default 0.05% TPS ([§2.8](#28-reactive-abilities-overpower-bloodthrill-revenge)).
    **Test:** time from a dodge to Revenge greying out.
13. **Spearing Strike and Raging Blows.** Is Spearing Strike's 40% applied to normalized
    weapon damage including AP? Which Forever raid bosses are Giants or Dragonkin? For Raging
    Blows' off-hand Whirlwind strike: is it normalized, does the off-hand 50% penalty apply,
    and can it crit and proc?
14. **Victory Rush damage.** The tooltip says "1 damage", but the data has a dummy effect of 15
    [F] [client] (SpellEffect, 1.60.1.69913), perhaps 15% of AP (the server scripts what a dummy
    does). SoD's version (45% AP, 30% heal) is a forbidden source. Low priority: it isn't used on
    bosses.
15. **Weapon-conditional crit with dual wield: the racials and Weaponmaster's axe.** The racials
    and Weaponmaster's axe and polearm crit (12700) are the same kind of client data (all crit,
    aura 290, with a weapon-type `SpellEquippedItems` mask), but their tooltips differ, and the sim
    follows each tooltip (doctrine §2: tooltips beat derived values):
    - **The racials:** "+2% crit with all spells and attacks while you have a sword or two-handed
      sword equipped". One sword in either hand gives Human Sword Specialization's +2% to every
      attack, both hands', and to spells ([§2.9](#29-racials-for-warriors),
      [character-stats](../mechanics/character-stats.md#implementation-notes)); Orc Axe and Dwarf
      Mace Specialization likewise.
    - **Weaponmaster:** "Increases your chance to get a critical strike with Axes and Polearms".
      Only the attacks made with the axe or polearm get it, and spells don't
      ([§2.7](#27-weaponmaster-extra-attacks-and-windfury)).

    Is that so? Does a racial's crit apply only to the matching weapon's attacks, or need it in
    the main hand? Does Weaponmaster's reach the other hand, as the racials' does? The racials'
    answer moves the default Human Fury (a mace and a sword) by about 1.2%; Weaponmaster's only
    matters to a warrior with the talent dual wielding an axe and another type (polearms are
    two-handed). **Test:** a Human with a sword in the main hand only, then in the off hand only,
    with a mace in the other hand: read the sheet's crit, and if it's unclear, log crits per
    hand. An Arms warrior with Weaponmaster, an axe in the off hand and a sword in the main hand,
    the same way.
16. **Touch of the Grave (Undead).** Does it deal damage, or only heal? If it deals damage,
    it should be modelled.
17. **Max rage for Gnomes with Boundless Rage.** Is it (100 + 30) × 1.05 = 136.5, or
    100 × 1.05 + 30 = 135? How does the fraction round?
18. **Eureka!.** How does the 40% cost cut round? Execute costs 15, and 40% of it is 6. Does
    Eureka! reduce the extra rage Execute consumes? Does it spend a charge on a miss? The sim
    rounds down, cuts only the base cost and spends a charge on a miss (`eureka`) [?].
19. **Improved Slam's replacement spells.** The Improved Slam ranks replace the Slam spells
    (1310196–1310200, [F] [client] (SpellName, 1.60.1.69913)) and carry an extra attribute. Does
    anything else change: cooldown, rage?
20. **Berserker Rage's extra rage from damage taken.** The Classic formula is for
    [rage.md](../mechanics/rage.md) to settle. Does Forever change it? Forever's rage from damage
    taken is now `10 × the hit before mitigation ÷ max health` ([rage.md](../mechanics/rage.md#forever-)),
    and the multiplier stays ×1.0 [?]; a Forever sim's ×2 is its own guess. **Test:** equal hits
    with and without Berserker Rage ([rage.md open question 1](../mechanics/rage.md#open-questions)).
21. **Deep Wounds implementation.** ✅ The spell and flags are resolved from client data
    ([client.md][client]): the Classic bleed 12721 doesn't exist in the Forever client, and
    Forever's bleed is spell **412609** (4 ticks, one every 3 s, no periodic-crit flag), which
    the talent 12834 triggers server-side. Rend 11574 does carry the periodic-crit flag [F]
    [client] (SpellName, SpellEffect, SpellMisc, 1.60.1.69913). Still to check in game: whether
    the bleed recomputes on each tick (Classic: yes, [C]), its refresh behaviour, and whether
    Rend's ticks really crit in combat, as the `forever` profile assumes [?] ([damage-and-timing
    OQ 2](../mechanics/damage-and-timing.md#open-questions)). The refresh is the one that moves
    the result most: restarting the tick timer on every crit (§2.5) costs Fury about 2% of its
    DPS against a refresh that keeps it. The sim's rogue model assumes the other rule for Deadly
    Poison, whose new stack renews the duration without restarting the tick timer ([rogue
    Q8](rogue.md#10-open-questions)); the two can't both be the modern engine's one rule, so one
    of them is wrong for Forever. The guild test is [open-questions
    B79](../open-questions.md#b79-deep-wounds-refresh-restart-or-keep-the-tick-timer).
22. **Demoralizing Shout scaling.** The level-60 tooltip is **−204** [F]: the client data's −196
    plus −1.4 per level above 54, which its `SpellLevels` (54–64) don't cap below 60, is −204.4,
    shown as 204 [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913). The −196 this doc called
    the tooltip was the base value rendered without the per-level term (review finding L9).
    Whether the debuff applies −204 in combat is [?]. Owner: [buffs-debuffs-consumables OQ
    19](../mechanics/buffs-debuffs-consumables.md#open-questions) (Route C: read it at 60).
23. **Build variants.** "Fury + Precision" (15/36) versus the popular 17/34. Settle it with the
    sim once M2 exists. Protection's is settled: at 51 points its default takes both Improved
    Heroic Strike and Deflection 5, and the sim favours it over its Improved Thunder Clap preset
    ([§6.1](#61-talent-builds)).
24. **Arms base stance.** Battle, with Rend, Bloodthrill and Overpower, or Berserker, with
    +3% crit and Whirlwind? Settle this with the sim. **The sim's first answer** (M2.3c, the
    default setup, 20,000 fights): Battle Stance 630 DPS, Berserker Stance 604, and Berserker
    Stance dancing for Rend and Overpower 631. **With the tuned defaults** (M2.5a, D23): Berserker
    Stance dancing for Rend and Overpower is −22.5 DPS (−3.5%) against Battle Stance, over 200,000
    paired fights ([§5.3](#53-arms-two-hander) notes). Battle Stance stays the default; the answer
    depends on the unverified Bloodthrill and Overpower rules (Q10, Q11) and moves with gear.
25. **Rank availability.** Classic Era added Heroic Strike rank 9, Battle Shout rank 7 and
    Revenge rank 6 in its AQ patch. The Forever spellbook lists them all at level 60. Are they
    trainable at launch (November 4)?
26. **Recklessness, Retaliation and Shield Wall.** Do they still share a cooldown? The data
    suggests not: Recklessness has its own recovery and no category [F]
    [client] (SpellCooldowns, SpellCategories, 1.60.1.69913). This doesn't matter for DPS.
27. **Windfury internal cooldown.** The only source for 1.5 s is a 2023 statement about SoD's
    Wild Strikes, which is forbidden. The Forever client gives Windfury Totem's proc a 100 ms
    internal cooldown [F] [client] (SpellAuraOptions, 1.60.1.69913) (§2.7), which `forever`
    models; whether the server enforces it, or a longer one, is the question. Owner: [damage-and-timing OQ
    9](../mechanics/damage-and-timing.md#open-questions). **Test:** the minimum gap between
    Windfury procs over 500+ main-hand swings.
28. **Execute and fractional rage.** Forever's normalized white rage leaves fractions (a 2.6 s
    main hand gives 3.46 × 2.6 = 8.996 rage, which the pool shows as 8.9 or 9.0;
    [rage.md](../mechanics/rage.md#rounding)). Does Execute convert them (15 per rage, tenths
    included), or only whole rage points? The sim converts tenths
    ([§7](#7-implementation-notes)); the difference is at most 13.5 damage per Execute.
    **Test:** Executes at a known fractional rage, if the combat log or a rage display with
    decimals shows it.
29. **Improved Bloodrage 1/2.** Its +25% makes Bloodrage 12.5 rage at once and 1.25 per tick.
    Does the server keep the hundredths, round each tick, or round the curve value? The sim
    floors each gain to a tenth, as [rage.md](../mechanics/rage.md#rounding) does for
    talent-scaled energizes, so 1/2 gives 12.5 + 10 × 1.2 = 24.5 rather than 25
    ([§7](#7-implementation-notes)). White hits and hits taken keep their fractions in Forever
    beta logs, so this energize may too.
    2/2 (the only rank the presets use) is exact. **Test:** rage before and after each tick with
    1/2, in a combat log that shows tenths.

30. **Diamond Flask in Forever.** Classic Era's use (item effect 101630 → 363880, a scripted
    "Diamond Flask" spell; the buff spells 24427 and 363881, both "Diamond Flask", are +75
    Strength and 9 health every 5 s for 60 s; 6 min cooldown) [C] [client] (ItemEffect,
    SpellEffect, 1.15.9.69722) is gone. Forever's item effect casts 363881
    directly, now named "CHUG! CHUG! CHUG! CHUG!": a 5 s channel that heals 224 every second
    and has a dummy 20, described as "Restores $o1 Health over $d. This healing is strongest at
    first. If finished, gain $s2 Strength for $d." Its cooldown is still 6 min, now sharing 60 s
    with category 1153 (runes), and the item gained an equip dummy, spell 1318073 "Diamond
    Flask", with no description [F] [client] (ItemEffect, ItemXItemEffect, SpellName,
    SpellEffect, SpellMisc, 1.60.1.69913). The Forever client has no `ItemSparse` row for it, so
    its stats are Classic Era's (D6); since review finding L5 the app showed Forever's use line,
    "Restores 1120 Health over 5 sec. … If finished, gain 20 Strength for 5 sec."
    ([items.md](../data/items.md#effects-of-fallback-items)). A heal isn't a damage trinket, so
    the flask is off the Fury and Arms pre-raid lists, where it was the guides' rank 3, and with
    that out of the item pool, which it was in only for those lists
    ([items.md](../data/items.md#pre-raid-bis-lists)). What does the Forever flask do: 20
    Strength for 5 s after the channel, or something the equip dummy scripts? Until that's known
    the sim doesn't use it. **Test:** read the tooltip in game; use it and watch Strength on the
    sheet during and after the channel.
31. **Weakness Analyzer.** Its cooldown is 90 s in the client's item effect (plus 20 s shared
    by category 1141, "Burst Trinket") [F] [client] (ItemEffect, 1.60.1.69913); the tooltip
    foreverchanges showed before M1.5c-2 said 2 min, which may be a hotfix the raw client
    doesn't carry ([client.md][client] "Likely hotfix"). The sim uses 90 s, the value the app's
    item data shows. What ends it: the tooltip says a non-periodic crit you deal, and the spell
    has one proc charge on every kind of damage you do; the sim spends it on the first white or
    special crit, or a magic proc's crit, including the crit it helped make [?]. **Test:** its cooldown in game; whether
    the buff drops on the first crit, and on a crit by a proc.
32. **Rend's tick crits and Impale.** Impale's class mask covers Rend (and Sunder Armor), as
    Classic Era's does, where Rend's ticks can't crit [F] [client] (SpellEffect, 1.60.1.69913;
    1.15.9.69722). The sim assumes a Rend tick crit deals ×2.2 with Impale 2/2 (×2.0 without);
    that a tick's crit chance is the main hand's special-attack crit chance, suppression
    included, snapshotted at the application; and that a landed application procs on-hit effects
    ([§2.5](#25-crits-impale-flurry-deep-wounds), [§7](#7-implementation-notes)) [?]. **Test:**
    with Impale 0/2 and 2/2, log Rend's ticks against mobs three levels higher: crit ticks against
    normal ones (×2.0 or ×2.2), and the crit rate against the sheet's; with Windfury or a Crusader
    weapon, count procs right after Rend applications. Owner: [damage-and-timing
    OQ 2](../mechanics/damage-and-timing.md#open-questions) for whether ticks crit at all.
33. **Thunder Clap and Demoralizing Shout on the spell table.** The client gives both
    `DefenseType` Magic [F], so the sim rolls them against the spell table: 17% miss against a
    boss before spell hit, no dodge, parry or block; a miss refunds 80% of the cost; Thunder Clap
    crits at the special-attack crit chance for ×2 (×2.2 with Impale, whose class mask has it)
    ([§7](#7-implementation-notes) "Spell-table abilities") [?]. **Test:** against mobs three
    levels higher, with and without +hit, count Thunder Clap's and Demoralizing Shout's misses and
    the rage a missed one costs, and Thunder Clap's crits and their size against its hits.
34. **Shield Slam's threat.** The engine uses Classic Era's dmg + 254 [C] (Magey), but Forever's
    tooltip raised it from "a high amount of threat" to "a very high amount" [F], so the bonus may
    have risen ([threat.md](../mechanics/threat.md#warrior), OQ 1). It decides Max TPS's one
    close call ([§5.4](#max-tps-p2)): at +254 dropping Shield Slam gains 3.3% TPS, and from about
    +449 keeping it wins; the default keeps it either way, for its damage. **Test:** the threat
    macro before and after a Shield Slam at 60, against its damage in the combat log, as C6 in
    [open-questions](../open-questions.md#c6-warrior-threat-at-max-rank).

35. **Sunder Armor over Expose Armor.** They share one slot on the boss ([buffs §4.1](../mechanics/buffs-debuffs-consumables.md#41-armor-reduction)),
    and in Forever both remove 2,250 armor. With the Buffs tab's Expose Armor on, the engine lets
    your Sunders land, remove nothing and make their full 1013 threat [?]. In Classic Era a
    Sunder Armor may fail to apply over a stronger Expose Armor ("A more powerful spell is already
    active"), and a debuff that fails makes no threat. If Forever does that, the default
    Protection warrior with Expose Armor makes about 31% less TPS: 996.34 → 684.08 without any
    Sunder threat (seed 12345, 20,000 fights; the defaults after P2's verification). **Test:** with a rogue's 5-point Expose Armor on a
    mob, use Sunder Armor and watch for the error, the debuff, and the threat macro
    ([open-questions B28](../open-questions.md#b28-sunder-armor-vs-expose-armor)).

## 10. Sources

**Forever (tier 1):**

- **foreverchanges.pro.** Forever beta client 1.60.1.69913 diffed against Classic Era
  1.15.9.69722. Pages and their payloads were fetched once on 2026-09-22 and read locally;
  `robots.txt` was respected.
  - [cls]: <https://foreverchanges.pro/class/warrior>. Every warrior talent and spell change,
    with before and after text. [F]
  - [sb]: <https://foreverchanges.pro/spellbook/warrior>. The spellbook: every rank, with
    Forever and Classic tooltips, costs, cooldowns and trained levels. [F] and [C]
  - [tal]: <https://foreverchanges.pro/talents/warrior>. The talent calculator: rank texts for
    both clients, the grid, prerequisites and the `popular` builds. [F] and [C]
  - [rac]: <https://foreverchanges.pro/racials>. Racials in Forever versus Classic. [F]
  - [bis]: <https://foreverchanges.pro/bis/warrior>. Early beta BiS lists, level 20. [F]
  - [beta]: <https://foreverchanges.pro/beta>. Beta dates and builds. [F]
- **Forever client DB2 at build 1.60.1.69913.** The research agent first read 20 CSV tables
  from wago.tools' table pages once on 2026-09-22, which its `robots.txt` forbids
  ([decision D9](../decisions.md#d9-wagotools-is-cited-never-crawled-2026-09-22)). The project
  now reads the raw client files through the documented wago.tools API
  ([D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)), parsed by
  `scripts/scrape/client.mjs` into `src/data/client/`. Its claim check
  ([client.md][client]) confirmed every value this doc had marked for a browser check, except
  one correction: Stoneform is on the GCD (§2.2). Those values carry [client]; the `db` links
  below open the same tables on wago.tools for browsing. Raw files lack server hotfixes and
  scripts (dummy effects, proc rates; [hotfix caveat](../data/client.md#hotfix-caveat)). The
  IDs quoted in the text are `SpellID` values.
  - [db-eff]: <https://wago.tools/db2/SpellEffect?build=1.60.1.69913>. Base points, aura
    types, weapon-damage effects, class masks and threat effects. [F]
  - [db-aura]: <https://wago.tools/db2/SpellAuraOptions?build=1.60.1.69913>. Proc chance,
    charges, proc masks and proc internal cooldowns. [F]
  - [db-cd]: <https://wago.tools/db2/SpellCooldowns?build=1.60.1.69913>. Cooldowns and GCD
    (`StartRecoveryTime`). [F]
  - [db-pow]: <https://wago.tools/db2/SpellPower?build=1.60.1.69913>. Rage costs, and
    Overpower's second cost. [F]
  - [db-misc]: <https://wago.tools/db2/SpellMisc?build=1.60.1.69913>, with
    [SpellDuration](https://wago.tools/db2/SpellDuration?build=1.60.1.69913) and
    [SpellCastTimes](https://wago.tools/db2/SpellCastTimes?build=1.60.1.69913). Durations and
    cast times. [F]
  - [db-ss]: <https://wago.tools/db2/SpellShapeshift?build=1.60.1.69913>. Stance
    requirements. [F]
  - [db-cat]: <https://wago.tools/db2/SpellCategories?build=1.60.1.69913>. GCD category and
    defense type. [F]
  - [db-cls]: <https://wago.tools/db2/SpellClassOptions?build=1.60.1.69913>. Class masks,
    used to resolve which abilities Impale, Focused Rage and Eureka! affect. [F]
  - [db-trait]: <https://wago.tools/db2/TraitDefinitionEffectPoints?build=1.60.1.69913> with
    [CurvePoint](https://wago.tools/db2/CurvePoint?build=1.60.1.69913) and
    [TraitDefinition](https://wago.tools/db2/TraitDefinition?build=1.60.1.69913). Per-rank
    talent values; they match the tooltips. [F]
  - Also used: [SpellName](https://wago.tools/db2/SpellName?build=1.60.1.69913) and
    [SpellProcsPerMinute](https://wago.tools/db2/SpellProcsPerMinute?build=1.60.1.69913). No
    `SpellAuraOptions` row references a PPM row, so proc rates are server-side and keep their
    [C]/[?] tags. [F]
  - [client]: [client.md](../data/client.md#doc-claims-checked-against-the-raw-client), the
    raw-client claim check (Forever 1.60.1.69913, Classic Era 1.15.9.69722). [F] and [C]

**Classic Era client data (tier 3):** the same tables at build 1.15.9.69722, for comparison;
the claim check read the raw 1.15.9.69722 files for the "(Classic …)" halves. [C]

- [C-eff]: <https://wago.tools/db2/SpellEffect?build=1.15.9.69722>
- [C-aura]: <https://wago.tools/db2/SpellAuraOptions?build=1.15.9.69722>
- [C-ss]: <https://wago.tools/db2/SpellShapeshift?build=1.15.9.69722>
- Also compared: SpellCooldowns, SpellPower, SpellMisc and SpellClassOptions.

**Classic Era mechanics (tier 3):**

- **Magey's Classic warrior wiki**, tested on the 1.13 client (cloned 2026-09-22). [C]
  - [magey-at]: <https://github.com/magey/classic-warrior/wiki/Attack-table>. Hit, glancing,
    dodge, crit and dual-wield miss.
  - [magey-thr]: <https://github.com/magey/classic-warrior/wiki/Threat-Mechanics>. Stance
    multipliers and per-ability threat measured on 1.13.6.
  - [magey-wf]: <https://github.com/magey/classic-warrior/wiki/Windfury-Totem>. Extra-attack
    rules, and Heroic Strike with Windfury.
  - [magey-crit]: <https://github.com/magey/classic-warrior/wiki/Crit-aura-suppression>. The
    1.8% suppression of crit from auras.
- **guybrush's WarriorSim**, pinned to its **pre-SoD commit `180a3cc`** (2021-05-11), which
  doctrine §2 lets back a [C] value. Its later commits (from November 2023) add an SoD mode;
  values found only there are [?] and are marked where they occur. [C]
  - [ws-spell]:
    <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/spell.js>.
    Abilities, refund flags (Whirlwind and Execute none), Deep Wounds (per-tick, 4 ticks,
    3 s), Flurry charges, Execute, the fixed 1500 ms GCD. It has no Slam, Cleave or Rend.
  - [ws-player]:
    <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js>.
    Heroic Strike queue, off-hand miss while queued, proc rules, Unbridled Wrath on Heroic
    Strike, crit multiplier with Impale, refunds, the 5 s Overpower window, Flurry charges
    consumed by Heroic Strike swings.
  - [ws-spells]:
    <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/data/spells.js>.
    Default rotation thresholds (Heroic Strike 40 rage, `maincd`).
- [marrow]: Marrow's Compendium of Dragonslaying,
  <https://bookdown.org/marrowwar/marrow_compendium/abilities.html>. Also used:
  [marrow-mech](https://bookdown.org/marrowwar/marrow_compendium/mechanics.html) and
  [marrow-cd](https://bookdown.org/marrowwar/marrow_compendium/cds.html). Classic Fury
  mechanics, damage per rage, Execute and Bloodthirst, Slam, Heroic Strike queueing and
  cooldowns. Written for WoW Classic 2019–2020. [C]
- [wh-fury]:
  <https://www.wowhead.com/classic/guide/classic-wow-fury-warrior-rotation-dps-tips-29938>.
  A Classic Era Fury rotation guide (updated 2025-09-19). It lists world buffs, which we
  ignore. [C]
- [wh-tank]:
  <https://www.wowhead.com/classic/guide/classes/warrior/tank-rotation-cooldowns-abilities-pve>.
  A Classic Era warrior tank rotation. [C]
- [bnet-hsq]:
  <https://us.forums.blizzard.com/en/wow/t/off-hand-swings-with-hs-cleave-queued-dont-suffer-dw-miss-penalty/309417>.
  Blizzard classifies off-hand swings avoiding the dual-wield penalty while Heroic Strike is
  queued as "not a bug" (2019-10-03). [C]

**Third-party Forever measurement:**

- [fw-2]: <https://github.com/magey/forever-warrior/issues/2>. A level-20 beta test with a
  custom addon: 5.19% off-hand miss with Heroic Strike queued (77 swings) vs 18.27% without
  (394). [?] until the guild repeats it.

**Not authoritative:**

- [ew]: <https://github.com/ElliotWood/Forever/pull/108>. Another community Forever sim, a fork
  of `wowsims/classic`, whose parent codebase includes SoD. It is listed only because its
  Heroic Strike queue choice conflicts with Q6. Its note that Dual Wield Specialization's
  values are "the same at every rank" conflicts with the Forever rank curves. **Do not adopt
  its values.**

[cls]: https://foreverchanges.pro/class/warrior
[sb]: https://foreverchanges.pro/spellbook/warrior
[tal]: https://foreverchanges.pro/talents/warrior
[rac]: https://foreverchanges.pro/racials
[bis]: https://foreverchanges.pro/bis/warrior
[beta]: https://foreverchanges.pro/beta
[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[db-eff]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913
[db-aura]: https://wago.tools/db2/SpellAuraOptions?build=1.60.1.69913
[db-cd]: https://wago.tools/db2/SpellCooldowns?build=1.60.1.69913
[db-pow]: https://wago.tools/db2/SpellPower?build=1.60.1.69913
[db-misc]: https://wago.tools/db2/SpellMisc?build=1.60.1.69913
[db-ss]: https://wago.tools/db2/SpellShapeshift?build=1.60.1.69913
[db-cat]: https://wago.tools/db2/SpellCategories?build=1.60.1.69913
[db-cls]: https://wago.tools/db2/SpellClassOptions?build=1.60.1.69913
[db-trait]: https://wago.tools/db2/TraitDefinitionEffectPoints?build=1.60.1.69913
[C-eff]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722
[C-aura]: https://wago.tools/db2/SpellAuraOptions?build=1.15.9.69722
[C-ss]: https://wago.tools/db2/SpellShapeshift?build=1.15.9.69722
[magey-at]: https://github.com/magey/classic-warrior/wiki/Attack-table
[magey-thr]: https://github.com/magey/classic-warrior/wiki/Threat-Mechanics
[magey-wf]: https://github.com/magey/classic-warrior/wiki/Windfury-Totem
[magey-crit]: https://github.com/magey/classic-warrior/wiki/Crit-aura-suppression
[ws-spell]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/spell.js
[ws-player]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js
[ws-spells]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/data/spells.js
[fw-2]: https://github.com/magey/forever-warrior/issues/2
[marrow]: https://bookdown.org/marrowwar/marrow_compendium/abilities.html
[marrow-mech]: https://bookdown.org/marrowwar/marrow_compendium/mechanics.html
[marrow-cd]: https://bookdown.org/marrowwar/marrow_compendium/cds.html
[wh-fury]: https://www.wowhead.com/classic/guide/classic-wow-fury-warrior-rotation-dps-tips-29938
[wh-tank]: https://www.wowhead.com/classic/guide/classes/warrior/tank-rotation-cooldowns-abilities-pve
[bnet-hsq]: https://us.forums.blizzard.com/en/wow/t/off-hand-swings-with-hs-cleave-queued-dont-suffer-dw-miss-penalty/309417
[ew]: https://github.com/ElliotWood/Forever/pull/108
