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
  - number of targets, for Cleave, Whirlwind and Sweeping Strikes;
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
| Demoralizing Shout (rank 5) | −140 AP, 30 s | **−196 AP, 45 s** [sb] | Details belong in [buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md) |
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
other way: ×1.40 at every rank (49/35 … 196/140) and 45 s instead of 30 s [sb].

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
  suppression in [combat-tables.md](../mechanics/combat-tables.md) applies [magey-crit].
- **An empty aura on Berserker Stance.** Its Forever passive adds an attack-power-percent
  aura (166) with value 0. It has no effect, but watch for it in later builds [F]
  [client] (SpellEffect, 1.60.1.69913).
- **Swapping stances.** A swap is off the GCD and has a 1.0 s cooldown shared by the three
  stances [F] [client] (SpellCooldowns, 1.60.1.69913) (category 47). The warrior keeps `rage =
  min(rage, 10 + 3 × Improved Tactical Mastery rank)` [F] [sb] [tal]; in Classic Era the formula
  was `min(rage, 5 × Tactical Mastery rank)` [C]. The rest of the rage is lost.
- **Stance-restricted abilities.** When an ability needs another stance, an APL may swap first
  ("stance dance"). The swap and its rage loss happen before the ability. The Classic
  mechanics are implemented the same way in WarriorSim [ws-spell].

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
  - trinkets

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
- Gnome Eureka! cuts the next 3 damaging abilities' cost by 40%. How it rounds is Q18 [F]
  [rac] [db-eff].

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
class mask covers these attacks [client] (SpellEffect, 1.60.1.69913):

- Bloodthirst, Mortal Strike, Whirlwind, Slam, Heroic Strike, Cleave, Execute, Overpower
- Revenge, Shield Slam, Thunder Clap, Hamstring, Spearing Strike, Victory Rush, Intercept,
  Pummel, Shield Bash, Mocking Blow and Concussion Blow

Impale does **not** affect white swings, extra attacks, Deep Wounds or Rend. Deep Wounds can't
crit in either profile. Rend can't crit in `classicEra` [C]; in `forever` its ticks may crit
through the periodic-crit flag [?] (a 2.0× tick crit, since Rend isn't in Impale's class mask;
[damage-and-timing §4](../mechanics/damage-and-timing.md#4-dots-and-bleeds)). Crit-damage
bonuses from items, if any, are covered in [damage-and-timing.md](../mechanics/damage-and-timing.md).

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
  class, which we don't use [C] [ws-spell].
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
- For 15 s: +100% crit chance on all attacks, and +20% damage taken.
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
| **Axe or polearm** | +1% (5%) crit chance | Applies to attacks made with that weapon. It is aura crit (aura 290), so suppression against a +3-level target applies [magey-crit] | [F] [client] (SpellEffect, 1.60.1.69913) (spell 12700) |
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
    Q10.
  - Overpower needs Battle Stance and has a 5 s cooldown.
- **Bloodthrill** [F] [tal] [client] (SpellAuraOptions, 1.60.1.69913):
  - **Trigger.** When your melee attack hits a target that has **your** Rend, there is a 2%
    per rank chance (10% at 5/5) to open the Overpower window for **6 s**, for 1 use.
  - **Which attacks count.** The data's proc mask is 4, main-hand and off-hand **auto
    attacks** only. The tooltip says "melee attacks". **Default: white swings only**, Q11.
  - The window is the same one a dodge opens. If both are open, one Overpower uses it.
- **Revenge window.** After the warrior blocks, dodges or parries, Revenge is usable for
  **5 s** [?] (Q12). It needs Defensive Stance and has a 5 s cooldown [F] [sb].

### 2.9 Racials for warriors

No race gets weapon skill in Forever. Human Sword Specialization, Orc Axe Specialization and
the new Dwarf Mace Specialization grant crit instead. Human Mace Specialization is gone: the
Forever Human racials are Will to Survive, Perception, Sword Specialization and The Human
Spirit [F] [rac]. Every warrior therefore starts at 300 skill with
every weapon, and weapon skill only comes from items; the hit and glancing consequences are in
[combat-tables.md](../mechanics/combat-tables.md). Stat numbers belong to
[character-stats.md](../mechanics/character-stats.md). The warrior-relevant effects:

| Race | Racial (Forever) | Sim model | Tag |
| --- | --- | --- | --- |
| Human | Sword Specialization: +2% crit with all attacks while a sword or two-handed sword is equipped (Classic: +5 sword and mace skill) | +2% aura crit. For dual wield, "equipped" is read as "either hand" [?] (Q15) | [F] [rac] [client] (SpellEffect, 1.60.1.69913) (spell 20597) |
| Orc | Axe Specialization: +1% crit while an axe is equipped. **Blood Fury: +10% AP** (and spell power) for 15 s, 2 min cooldown, off the GCD (Classic: +25% of base AP) | +1% aura crit; AP ×1.10 | [F] [rac] [client] (SpellEffect, SpellDuration, SpellCooldowns, 1.60.1.69913) (20574, 20572) |
| Dwarf | Mace Specialization: +1% crit while a mace is equipped. Stoneform: −10% physical damage taken for 8 s, 3 min cooldown, **on the GCD** | +1% aura crit | [F] [rac] [client] (SpellEffect, SpellCooldowns, 1.60.1.69913) (1259719, 20594) |
| Night Elf | **Elune's Light: +10% crit for 15 s, 3 min cooldown**. Quickness: +1% dodge | 10% crit cooldown | [F] [rac] [client] (SpellEffect, SpellDuration, 1.60.1.69913) (1259799) |
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
| Execute (5, 20662) | 15 | none | yes | Battle, Berserker | Only on targets at or below 20% health. **600 + 15 × (rage − cost)**; a successful hit spends all rage | [F] [sb]; rage rules [C] [marrow] [ws-spell] |
| Overpower (4, 11585) | 5 | 5 s | yes | Battle | MH `normalized` + 35. Can't be dodged, parried or blocked. Improved Overpower adds +25% crit chance per rank | [F] [sb] [tal] |
| Hamstring (3, 7373) | 10 | none | yes | Battle, Berserker | 45 physical damage (flat, rolls on the melee table) and a 50% snare. Used to fish for procs | [F] [sb] [db-eff] |
| Rend (7, 11574) | 10 | none | yes | Battle, Defensive | Bleed: 147 over 21 s, 21 per 3 s tick. Improved Rend multiplies it by 1 + 0.12 / 0.23 / 0.35. It enables Bloodthrill | [F] [sb] [tal] [db-eff] |
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
| Battle Shout (7, 25289) | 10 | none | yes | any | +139 melee AP to the party (20 yd) for 3 min | [F] [sb] [client] (SpellEffect, 1.60.1.69913) |
| Demoralizing Shout (5, 11556) | 10 | none | yes | any | −196 AP to enemies within 10 yd for 45 s. The tooltip value is used (tooltip beats derived, doctrine §2); the client data's −1.4 per level above 54 (levels 54–64, so `MaxLevel` doesn't cap it below 60) would give −204.4 at 60; whether the server applies it is an open question (Q22) | [F] [sb]; client values [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913); derived −204.4 in game [?] |
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
| 5·3 | **Weaponmaster (5), new** | "Axe/Polearm: Increases your critical strike chance by 5%. Mace/Staff: Your attacks ignore 15% of your target's armor. Sword: Your successful melee attacks have a 5% chance to trigger an extra attack on the target." | 1% / 3% / 1% | [§2.7](#27-weaponmaster-extra-attacks-and-windfury) |
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
| 2·4 | Improved Thunder Clap (3) | "Reduces the Rage cost of your Thunder Clap ability by 6." | −2 (Classic −1/−2/−4); moved from Arms | Thunder Clap cost |
| 3·1 | Last Stand (1), needs Improved Bloodrage | "…temporarily grants you 30% of your maximum health for 20 sec…" 3 min cooldown (Classic 10 min) [db-cd] | Cooldown only | Not simulated |
| 3·2 | **Master of Defense (2), new**, needs Shield Specialization | "Grants you a 100% chance to generate 5 Rage when you Dodge or Parry while a shield is equipped." | 50% | Rage on dodge or parry |
| 3·3 | Improved Revenge (3) | "Increases damage dealt by your Revenge ability by 60%." | +20% (Classic: stun chance) | Revenge damage ×(1 + 0.2r) |
| 3·4 | Defiance (3) | "Increases all threat generated in Defensive stance by an additional 15% while a shield is equipped." | 5% (Classic 3% per rank, 5 ranks, no shield needed) | Threat ×(1 + 0.05r) with Defensive Stance and a shield |
| 4·1 | Improved Sunder Armor (3) | "Reduces the Rage cost of your Sunder Armor ability by 3." | −1. Unchanged | Sunder cost |
| 4·2 | Improved Disarm (3) | Disarm cooldown −20 s | Rewritten | Not simulated |
| 4·3 | **Vanguard (1), new** | "Your Charge ability is now usable while in Defensive Stance." | New | Opener rage for tanks |
| 5·1 | Improved Shield Wall (2) | Shield Wall cooldown −11 min | Rewritten | Not simulated |
| 5·2 | Concussion Blow (1) | "Stuns the target for 5 sec." 10 rage, 45 s | Cost 15 → 10 | Not simulated |
| 5·3 | Improved Shield Bash (2) | 100% chance to silence for 3 s | Unchanged | Not simulated |
| 5·4 | Bastion (5) | "Increases all damage you deal by 10% while a shield is equipped." | +2%. Replaces One-Handed Weapon Specialization; moved from tier 6 to tier 5 | ×(1 + 0.02r) with a shield (the data is a physical-school damage aura; all warrior damage is physical) [db-eff] |
| 6·3 | **Focused Rage (3), new** | "Reduces the Rage cost of your offensive abilities by 3." | −1 | The ability list is in [§2.3](#23-rage-warrior-specific) |
| 7·2 | Shield Slam (1), needs Concussion Blow | "…causing 421 to 439 damage, increased by your Block Value…" (rank 1; rank 4 is 640–670) | Damage ×1.87 | Ability |

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
  WarriorSim implements this idea as its `maincd` option [C] [ws-spell].
- **Reaction time and latency** are global settings in
  [damage-and-timing.md](../mechanics/damage-and-timing.md).
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

This is the Classic Era community priority [wh-fury] [marrow] [ws-spells], adjusted for
Forever:

| # | Action | Condition (defaults) | Setting ids (default) | On by default |
| --- | --- | --- | --- | --- |
| 0 | Pre-pull | Battle Shout at −3 s; Bloodrage at −1 s. No Charge; the warrior walks in, as in [wh-fury] | `fury.prepull.battleShout` (on), `fury.prepull.bloodrage` (on), `fury.prepull.charge` (off; adds 15 rage and needs a swap to Berserker Stance that keeps only 25) | yes |
| 1 | Battle Shout | Buff missing or under 3 s left; rage ≥ 10 | `fury.battleShout.enabled` (on), `.refreshBelowSec` (3) | yes |
| 2 | Death Wish | On cooldown from the pull. If `alignToEnd` is on, delay the final use so that it lasts until the fight ends | `fury.deathWish.enabled` (on), `.alignToEnd` (on) | yes |
| 3 | Racial or trinket cooldowns | Use together with Death Wish, then on cooldown | `fury.racial.enabled` (on), `.syncWithDeathWish` (on) | yes |
| 4 | Recklessness | Once, when the fight has ≤ `lastSec` seconds left. It needs Berserker Stance | `fury.recklessness.enabled` (on), `.lastSec` (15) | yes |
| 5 | Bloodrage (off the GCD) | On cooldown, if it won't push rage over the cap: rage ≤ max − 20 | `fury.bloodrage.enabled` (on), `.maxRage` (max − 20) | yes |
| 6 | **Execute phase** (target ≤ 20%): Bloodthirst | AP ≥ `btOverExecuteAp` and rage ≥ 30 | `fury.execute.btOverExecuteAp`, default from [W11](#w11-bloodthirst-versus-execute-break-even): 2220 at Execute cost 15, 2434 at cost 10 | yes |
| 7 | Execute phase: Execute | Rage ≥ cost + `minExtraRage`. Stops Heroic Strike queueing and uses Execute on every GCD | `fury.execute.enabled` (on), `.minExtraRage` (0), `.whirlwindInExecute` (off), `.heroicStrikeInExecute` (off) | yes |
| 8 | Bloodthirst | Off cooldown; rage ≥ cost | `fury.bloodthirst.enabled` (on) | yes |
| 9 | Whirlwind | Off cooldown; rage ≥ 25 + `reserve`; Bloodthirst cooldown ≥ `btCdMinSec` | `fury.whirlwind.enabled` (on), `.reserve` (0), `.btCdMinSec` (1.5) | yes |
| 10 | Overpower (stance dance) | Window open; rage ≤ `maxRage`, since the swap keeps only 25; Bloodthirst and Whirlwind are GCD-safe. Swap to Battle, Overpower, swap back | `fury.overpower.enabled` (off), `.maxRage` (25) | no |
| 11 | Heroic Strike queue (off the GCD) | Rage ≥ `minRage`; unqueue if rage falls below `unqueueBelow` before the swing | `fury.heroicStrike.enabled` (on), `.minRage` (42), `.unqueueBelow` (off; 20 if enabled) | yes |
| 12 | Hamstring (filler to fish for procs) | Rage ≥ `minRage`; Bloodthirst and Whirlwind are GCD-safe; optionally only when Flurry is down | `fury.hamstring.enabled` (on), `.minRage` (60), `.onlyWhenFlurryDown` (off) | yes |
| 13 | Berserker Rage | With Improved Berserker Rage: on cooldown, when GCD-safe and rage ≤ max − 10. Without it: only when the warrior takes damage (off) | `fury.berserkerRage.enabled` (on only if Improved Berserker Rage is talented) | depends |
| 14 | Sunder Armor | Keep `stacks` stacks up, when no one else in the raid applies them | `fury.sunder.enabled` (off), `.stacks` (5) | no |
| 15 | Slam | Not used by dual wield: without Improved Slam it resets both swing timers | `fury.slam.enabled` (off) | no |
| 16 | Mighty Rage Potion (consumable) | Once, at the start of the execute phase, if rage ≤ max − 75 | `fury.ragePotion.enabled` (follows the consumables tier), `.when` (`executeStart`) | with consumables |

Notes:

- **Why these thresholds.** The Heroic Strike default of 42 is Bloodthirst's 30 plus Heroic
  Strike's 12, so a landed Heroic Strike never leaves too little rage for Bloodthirst.
  WarriorSim's Classic default was 40 in its 2021 revision [ws-spells] (30 in its post-SoD
  code). Forever's extra off-hand rage and Unbridled Wrath make Fury richer in rage, so the
  extra margin is cheap. The sim itself should tune this.
- **Hamstring.** The Classic Era guide uses Hamstring "as a filler at excess rage when both
  Bloodthirst and Whirlwind are on cooldown". It can crit (Flurry) and proc Windfury and
  weapon effects [wh-fury].
- **Execute versus Bloodthirst.** The Classic rule is "Bloodthirst over Execute above 2000 AP"
  [wh-fury] [marrow]. The Forever Bloodthirst nerf moves the break-even up by 220–430 AP
  ([W11](#w11-bloodthirst-versus-execute-break-even)).
- **2H Fury** (Fury talents with a two-hander) is supported by the engine but has no default
  preset. Unbridled Wrath's 2 rage per proc suits it, but Dual Wield Specialization and Raging
  Blows are wasted, and Improved Slam is out of reach in the Arms tree. Use it only if a guild
  member asks.

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
15 s Slam cooldown removes.

| # | Action | Condition (defaults) | Setting ids (default) | On by default |
| --- | --- | --- | --- | --- |
| 0 | Pre-pull | Battle Shout at −3 s; Bloodrage at −1 s; optional Charge (Battle Stance, 15 + 6 rage) | `arms.prepull.battleShout` (on), `.bloodrage` (on), `.charge` (off) | yes |
| 1 | Battle Shout | Buff missing or under 3 s left | `arms.battleShout.enabled` (on) | yes |
| 2 | Rend | Your Rend is missing or under 1.5 s left on the target. Needed for Bloodthrill | `arms.rend.enabled` (on if Bloodthrill is talented), `.refreshBelowSec` (1.5) | yes |
| 3 | Racial or trinket cooldowns | At the pull and on cooldown | `arms.racial.enabled` (on) | yes |
| 4 | Recklessness | Once, when ≤ `lastSec` s are left. Swaps to Berserker Stance (keeps 25 rage) and stays there for the rest of the fight | `arms.recklessness.enabled` (on), `.lastSec` (15) | yes |
| 5 | Bloodrage (off the GCD) | On cooldown if rage ≤ max − 20 | `arms.bloodrage.enabled` (on) | yes |
| 6 | **Execute phase:** Slam | Off cooldown; rage ≥ 15 + Execute cost | `arms.execute.slamInExecute` (on) | yes |
| 7 | Execute phase: Execute | Rage ≥ cost | `arms.execute.enabled` (on), `.mortalStrikeInExecute` (off) | yes |
| 8 | Mortal Strike | Off cooldown; rage ≥ 30 | `arms.mortalStrike.enabled` (on) | yes |
| 9 | Overpower | Window open (dodge or Bloodthrill); Mortal Strike is GCD-safe or rage ≥ 35 | `arms.overpower.enabled` (on) | yes |
| 10 | Slam | Off cooldown; rage ≥ 15 + `reserve`; Mortal Strike is GCD-safe | `arms.slam.enabled` (on), `.reserve` (0) | yes |
| 11 | Spearing Strike | Target is a Giant, Dragonkin or mounted: on cooldown. Otherwise: rage ≥ `minRageOtherTargets` and Mortal Strike is GCD-safe | `arms.spearingStrike.enabled` (on), `.minRageOtherTargets` (50) | yes |
| 12 | Whirlwind (stance dance) | Swap to Berserker, Whirlwind, swap back; rage ≤ `maxRage` | `arms.whirlwind.enabled` (off), `.maxRage` (30) | no |
| 13 | Heroic Strike queue (off the GCD) | Rage ≥ `minRage` (45 ≈ Mortal Strike's 30 + Heroic Strike's 12, plus a little slack); optional unqueue | `arms.heroicStrike.enabled` (on), `.minRage` (45), `.unqueueBelow` (off) | yes |
| 14 | Hamstring | Rage ≥ 60 and GCD-safe (useful with Weaponmaster swords or Windfury) | `arms.hamstring.enabled` (off), `.minRage` (60) | no |
| 15 | Sweeping Strikes (off the GCD) | 2 or more targets: on cooldown | `arms.sweepingStrikes.enabled` (on for multi-target only) | multi-target |
| 16 | Death Wish | Only if the talent build includes it | `arms.deathWish.enabled` (follows talents) | n/a |

Notes:

- **Why Battle Stance.** The popular build invests in Bloodthrill 5/5 and Improved Overpower
  2/2, which pay off only in Battle Stance with Rend up. The alternative is a Berserker-base
  profile: +3% crit and Whirlwind without dancing, but Rend and Overpower need a dance. It is
  available by setting `arms.baseStance = berserker`, which turns on #12 and turns off #2 and
  #9 unless their dance options are enabled. Which is better is for the sim to show (Q24).
- **Execute phase.** Slam at 15 rage for about 728 damage
  ([W4](#w4-slam-with-the-same-two-hander)) beats a minimum Execute's 600 per GCD [marrow].
  Mortal Strike (30 rage, about 737) loses to Execute at 30 rage (825), so it's off by
  default.
- **Spearing Strike** at 40% weapon damage is a weak filler, about 229 at 1800 AP
  ([W6](#w6-spearing-strike)). Against Giants, Dragonkin (Onyxia and most Blackwing Lair
  bosses) or mounted targets it does 120%, which puts it on par with Mortal Strike for half
  the rage. Creature types are in [encounter.md](../mechanics/encounter.md).

### 5.4 Protection (TPS)

Base stance: **Defensive**. Weapon: a one-hander and a shield. The default talents are the
popular 5/5/36 build ([§6.1](#61-talent-builds)):

| Ability | Cost in the default build | How it's derived |
| --- | --- | --- |
| Sunder Armor | 10 | 15 − 2 (Improved Sunder Armor 2/3) − 3 (Focused Rage) |
| Shield Slam | 17 | 20 − 3 |
| Revenge | 2 | 5 − 3 |
| Heroic Strike | 12 | 15 − 3 |
| Thunder Clap | 17 | 20 − 3 |
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
- Deflection 5/5 (Arms): +5% parry
- Cruelty 5/5 (Fury): +5% crit

This is the Classic Era tank priority [wh-tank], adjusted for Forever's cheaper abilities, the
Thunder Clap change and Shield Block's two blocks:

| # | Action | Condition (defaults) | Setting ids (default) | On by default |
| --- | --- | --- | --- | --- |
| 0 | Pre-pull | Bloodrage at −1 s; optional Charge in Defensive Stance with Vanguard (15 rage) | `prot.prepull.bloodrage` (on), `.charge` (on if Vanguard is talented) | yes |
| 1 | Shield Block (off the GCD) | Off cooldown; rage ≥ 10; the boss is attacking the warrior. Each block refunds 5 rage (Shield Specialization) and opens Revenge | `prot.shieldBlock.enabled` (on) | yes |
| 2 | Bloodrage (off the GCD) | On cooldown if rage ≤ max − 30 | `prot.bloodrage.enabled` (on) | yes |
| 3 | Shield Slam | Off cooldown | `prot.shieldSlam.enabled` (on) | yes |
| 4 | Revenge | Window open | `prot.revenge.enabled` (on) | yes |
| 5 | Battle Shout | Buff missing or under 3 s left | `prot.battleShout.enabled` (on; turn off if a DPS warrior shouts) | yes |
| 6 | Sunder Armor | Stacks below 5, or refresh under 3 s | `prot.sunder.enabled` (on) | yes |
| 7 | Thunder Clap | The −20% attack-speed debuff is missing or under 3 s left | `prot.thunderClap.enabled` (on), `.maintainOnly` (on) | yes |
| 8 | Demoralizing Shout | Debuff missing or under 3 s left | `prot.demoShout.enabled` (on) | yes |
| 9 | Sunder Armor (filler) | GCD-safe, as the threat filler (Classic practice) | `prot.sunderFiller.enabled` (on) | yes |
| 10 | Heroic Strike queue (off the GCD) | Rage ≥ `minRage` | `prot.heroicStrike.enabled` (on), `.minRage` (45) | yes |
| 11 | Execute | Target ≤ 20%. Swaps to Battle Stance and loses Defensive threat | `prot.execute.enabled` (off) | no |

Notes:

- **Threat values** per ability, including the Forever Sunder question (Q1), live in
  [threat.md](../mechanics/threat.md). The Classic reference numbers are Magey's 1.13.6
  measurements [magey-thr].
- **What Forever changes for tanks.** Shield Slam and Revenge do about 1.7–1.9× their Classic
  damage. Focused Rage makes Revenge cost 2 and Sunder 10. Shield Specialization and Master
  of Defense add 5 rage per avoidance event [F]. But Forever's white-hit rage is normalized and
  its damage-taken rage looks lower than Classic's, so whether Forever tanks end up richer or
  poorer in rage is **unverified**: see
  [rage.md's reconciliation](../mechanics/rage.md#reconciliation-with-the-warrior-class-doc) and
  its damage-taken question ([rage OQ 1](../mechanics/rage.md#open-questions)). The sim will
  show how much Heroic Strike dumping carries of the TPS.
- **Boss swing model.** The rage and Revenge procs depend on how often the boss attacks and
  what the attacks do. That model is in [encounter.md](../mechanics/encounter.md), including
  avoidance, crushing blows and blocks.

### 5.5 Multi-target options (light)

When [encounter.md](../mechanics/encounter.md) sets 2 or more targets:

- Cleave replaces Heroic Strike (`<spec>.cleave.enabled`, on at 2+ targets; same `minRage`
  logic).
- Whirlwind and Raging Blows hit up to 4 targets.
- Sweeping Strikes goes on cooldown (Arms).
- Deep Wounds is tracked per target.
- Thunder Clap hits up to 4 targets.

Splitting threat across targets is out of scope ([doctrine §1](../doctrine.md#1-what-were-building)).

## 6. Sensible defaults

### 6.1 Talent builds

Per [doctrine §5](../doctrine.md#5-defaults), the default is the site's most popular Forever
build for each spec [tal]. All three decode and validate
([data/talents.md](../data/talents.md#build-codes-verified)).

| Spec | Build (points) | Code | Fit | Alternative preset |
| --- | --- | --- | --- | --- |
| Fury | 17/34/0 | `30305013002-050530035150010051-` | **Good.** Arms: Improved Heroic Strike 3, Improved Rend 3, Improved Tactical Mastery 5, Anger Management, Deep Wounds 3, Impale 2. Fury: Cruelty 5, Unbridled Wrath 5, Improved Cleave 3, Boundless Rage 3, Dual Wield Specialization 5, Raging Blows, Enrage 5, Death Wish, Flurry 5, Bloodthirst. **It skips Precision (+3% hit).** | **"Fury + Precision" 15/36/0: `30305013-050520035150310051-`**. Drop Impale 2 and one point of Improved Cleave (2/3 is enough for the tier gate) to take Precision 3/3. A rough estimate favours it with less than 9% hit from gear (Q23). Offer it as a preset and let the sim decide |
| Arms | 37/14/0 | `30305213132515201-05050103-` | **Good.** Every damage talent in Arms, plus Cruelty 5, Unbridled Wrath 5 (2 rage per proc with a two-hander), Piercing Howl and Boundless Rage 3 | none |
| Protection | 5/5/36 | `05-05-552001233201210531` | **Good for TPS.** Deflection 5 feeds Revenge and Master of Defense. Only Improved Sunder Armor is at 2/3. | "TPS" variant `32-05-552001233201210531`: Improved Heroic Strike 3 (Heroic Strike costs 9) and Deflection 2, instead of Deflection 5 (Q23) |

Both variant codes were built by hand and pass `decodeTalentCode`, `validateTalentBuild`
(no violations) and a byte-exact round trip through `encodeTalentCode` against
`src/data/talents/warrior.json`. The Fury tier gates hold 15 points in tiers 1–3 before Dual
Wield Specialization, 26 before Precision, 30 before Flurry and 35 before Bloodthirst.

### 6.2 Race, weapons and consumables

| Spec | Alliance default | Horde default | Weapon default | Why |
| --- | --- | --- | --- | --- |
| Fury | **Human**, with a sword in either hand (+2% crit) | **Orc**, with axes (+1% crit, Blood Fury +10% AP) | Slowest good one-hander in the main hand and a one-hander in the off hand, from [pre-bis items](../data/items.md) | Night Elf (Elune's Light), Troll (Berserking) and Tauren (+1% hit) are close alternatives. **Weapon skill racials no longer exist** ([§2.9](#29-racials-for-warriors)) |
| Arms | **Human**, with a two-handed sword (+2% crit and Weaponmaster extra attacks) | **Orc**, with a two-handed axe (+1% racial and +5% Weaponmaster crit) | Slowest good two-hander (3.5–3.8 s) | Maces and staves (15% armor ignored) are worth simulating (Q9) |
| Protection | **Human** (sword) | **Orc** (axe; Blood Fury helps threat) | One-hander and shield. The shield is required for Defiance, Bastion, Shield Slam and Shield Block | Tauren (+1% hit, +5% health) and Dwarf (Stoneform) are defensive alternatives |

**Consumables tier.** The default is the "standard" preset from
[buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md), which owns the item
list and the stacking rules. **No world buffs**
([decision D8](../decisions.md#d8-world-buffs-are-excluded-2026-09-22)). The warrior-specific
parts:

- **Mighty Rage Potion.** Default: once, at the start of the execute phase
  ([§5.2](#52-fury-dual-wield) #16). Classic Era players use it for the rage burst in Execute
  [marrow-cd].
- **Weapon oils and stones.** A sharpening stone or weightstone on each weapon's flat damage
  feeds the `weapon` and `normalized` formulas as flat weapon damage [C].
- **Tanks.** A defensive tier (armor and health consumables) matters to survival, not TPS.
  It's included in the preset for completeness only.

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
- **Extra attacks.** Weaponmaster and Windfury schedule an immediate main-hand swing (0 ms
  delay) and reset the main-hand timer. The 200 ms Weaponmaster internal cooldown is an aura
  cooldown. Windfury has no internal cooldown in the sim [?] (§2.7, Q27); its chain rule (it
  can't proc from its own extra attack) is enforced per chain.
- **Reactive windows** (Overpower, Revenge, Bloodthrill) are auras on the warrior, with
  duration and charges. Stance-dance entries check `rage ≤ tacticalMasteryCap +
  ability cost` so the dance doesn't waste rage.
- **Enrage and incoming damage.** Enrage, Master of Defense, Shield Specialization and
  Berserker Rage consume incoming-damage events from the encounter model. With no events
  (the DPS default), those auras never trigger.
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

Sunder Armor 10, Shield Slam 17, Revenge 2, Heroic Strike 12, Thunder Clap 17, Demoralizing
Shout 7, Battle Shout 10, Shield Block 10, Death Wish (if talented) 7.

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
   Improved Slam, does it truly never touch the timer? **Test:** swing timestamps around Slam
   casts in the combat log.
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
   ability (Whirlwind, Cleave) roll the extra attack once per cast or once per target hit? For an
   axe, does the crit apply only to attacks with the axe when dual wielding mixed types?
   **Test:** mace hit damage against a mob of known armor, with and without Sunder; sword procs
   per Cleave on two mobs.
10. **Overpower window.** The data has a combo-point-like counter that stacks to 3, on a 5,000 ms
    window [F] [client] (SpellPower, SpellAuraOptions, SpellDuration, 1.60.1.69913). Can several
    dodges bank several Overpowers in game?
11. **Bloodthrill.** Does it trigger only from white swings (data mask) or from all melee
    attacks (tooltip)? Does it need your own Rend? Does its 6 s window stack with a dodge
    window?
12. **Revenge window.** Is it 5 s after a block, dodge or parry? The only source we found for
    a number (4 s) is Turtle WoW, which is forbidden. **Test:** time from a dodge to Revenge
    greying out.
13. **Spearing Strike and Raging Blows.** Is Spearing Strike's 40% applied to normalized
    weapon damage including AP? Which Forever raid bosses are Giants or Dragonkin? For Raging
    Blows' off-hand Whirlwind strike: is it normalized, does the off-hand 50% penalty apply,
    and can it crit and proc?
14. **Victory Rush damage.** The tooltip says "1 damage", but the data has a dummy effect of 15
    [F] [client] (SpellEffect, 1.60.1.69913), perhaps 15% of AP (the server scripts what a dummy
    does). SoD's version (45% AP, 30% heal) is a forbidden source. Low priority: it isn't used on
    bosses.
15. **Human Sword Specialization with dual wield.** Is one sword in either hand enough, or
    must it be in the main hand?
16. **Touch of the Grave (Undead).** Does it deal damage, or only heal? If it deals damage,
    it should be modelled.
17. **Max rage for Gnomes with Boundless Rage.** Is it (100 + 30) × 1.05 = 136.5, or
    100 × 1.05 + 30 = 135? How does the fraction round?
18. **Eureka!.** How does the 40% cost cut round? Execute costs 15, and 40% of it is 6. Does
    Eureka! reduce the extra rage Execute consumes? Does it spend a charge on a miss?
19. **Improved Slam's replacement spells.** The Improved Slam ranks replace the Slam spells
    (1310196–1310200, [F] [client] (SpellName, 1.60.1.69913)) and carry an extra attribute. Does
    anything else change: cooldown, rage?
20. **Berserker Rage's extra rage from damage taken.** The Classic formula is for
    [rage.md](../mechanics/rage.md) to settle. Does Forever change it?
21. **Deep Wounds implementation.** ✅ The spell and flags are resolved from client data
    ([client.md][client]): the Classic bleed 12721 doesn't exist in the Forever client, and
    Forever's bleed is spell **412609** (4 ticks, one every 3 s, no periodic-crit flag), which
    the talent 12834 triggers server-side. Rend 11574 does carry the periodic-crit flag [F]
    [client] (SpellName, SpellEffect, SpellMisc, 1.60.1.69913). Still to check in game: whether
    the bleed recomputes on each tick (Classic: yes, [C]), its refresh behaviour, and whether
    Rend's ticks really crit in combat, as the `forever` profile assumes [?] ([damage-and-timing
    OQ 2](../mechanics/damage-and-timing.md#open-questions)).
22. **Demoralizing Shout scaling.** The sim uses the tooltip's −196 [F]; the client data's −1.4
    per level above 54 would give −204.4 at 60, and its `SpellLevels` (54–64) don't cap the term
    below 60 [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913). Whether the server applies it
    is [?]. Owner: [buffs-debuffs-consumables OQ
    19](../mechanics/buffs-debuffs-consumables.md#open-questions) (Route C: read it at 60).
23. **Build variants.** "Fury + Precision" (15/36) versus the popular 17/34, and the
    Protection "TPS" variant. Settle these with the sim once M2 and M3 exist.
24. **Arms base stance.** Battle, with Rend, Bloodthrill and Overpower, or Berserker, with
    +3% crit and Whirlwind? Settle this with the sim.
25. **Rank availability.** Classic Era added Heroic Strike rank 9, Battle Shout rank 7 and
    Revenge rank 6 in its AQ patch. The Forever spellbook lists them all at level 60. Are they
    trainable at launch (November 4)?
26. **Recklessness, Retaliation and Shield Wall.** Do they still share a cooldown? The data
    suggests not: Recklessness has its own recovery and no category [F]
    [client] (SpellCooldowns, SpellCategories, 1.60.1.69913). This doesn't matter for DPS.
27. **Windfury internal cooldown.** The only source for 1.5 s is a 2023 statement about SoD's
    Wild Strikes, which is forbidden. The Forever client gives Windfury Totem's proc a 100 ms
    internal cooldown [F] [client] (SpellAuraOptions, 1.60.1.69913) (§2.7); whether the server
    enforces a longer one is the question. Owner: [damage-and-timing OQ
    9](../mechanics/damage-and-timing.md#open-questions). **Test:** the minimum gap between
    Windfury procs over 500+ main-hand swings.

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
