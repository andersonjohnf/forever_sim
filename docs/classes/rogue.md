# Rogue: Combat, Assassination, Subtlety

WoW Forever reworks the rogue's trees more than its spells. The spells barely move: Sinister
Strike, Eviscerate, Slice and Dice, Blade Flurry and Adrenaline Rush read as in Classic Era, while
**Rupture** loses about 40% of its base damage and **Expose Armor** grows to −2,250 armor, the same
as five Sunder Armors. The talents are where Forever differs. **Mutilate** and **Venom** join
Assassination. **Hack and Slash** replaces the four weapon specializations: axes and swords get an
extra attack, daggers and fists crit, and maces ignore armor. **Weapon Expertise** now lowers the
boss's dodge and parry. **Precision** gives only 3% hit, and **Dual Wield Specialization** half its
Classic off-hand damage. Subtlety gains **Quietus**, **Cutthroat** and **Thousand Cuts**, and
Hemorrhage now feeds Rupture. **Poisons** hit about a third less hard: Instant Poison VI deals
76–100 (Classic Era 112–148), and Deadly Poison V ticks for 23 (34). This doc reads every value from
the Forever client, compares it with Classic Era's, and gives the three specs' first-pass rotations
and defaults under [D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24).

Status: researched and built 2026-09-24 (slice R1) · Combat, Assassination and Subtlety shipped
([§6](#6-rotation-and-priority)) · ruleset tags: [F] Forever ·
[C] Classic Era · [?] unverified

Forever client build `1.60.1.69913`, Classic Era client build `1.15.9.69722`. Source links use
short labels, resolved under [Sources](#sources).

> **Client data.** Values tagged **[F] [client] (Table, 1.60.1.69913)** come from the raw Forever
> client files, read through the wago.tools API by `scripts/scrape/*.mjs`, and are in
> `src/data/spells/rogue.json`, `src/data/talents/rogue.json` and `src/data/client/*.json`;
> `src/sim/classes/rogue/rogue.test.ts` checks the engine's rows against them. Raw files lack server
> scripts: attack-power scaling, what a dummy effect does and proc rates stay server-side.

---

## Contents

1. [What the sim needs](#what-the-sim-needs)
2. [WoW Forever changes](#1-wow-forever-changes)
3. [Rogue mechanics](#2-rogue-mechanics)
4. [Abilities](#3-abilities)
5. [Poisons](#4-poisons)
6. [Talents](#5-talents)
7. [Rotation and priority](#6-rotation-and-priority)
8. [Sensible defaults](#7-sensible-defaults)
9. [Implementation notes](#8-implementation-notes)
10. [Worked examples](#9-worked-examples)
11. [Open questions](#10-open-questions)
12. [Sources](#sources)

---

## What the sim needs

- **Energy**: 20 every 2 s on the player-global power tick, capped at 100 (+10 with Vigor 2/2),
  doubled by Adrenaline Rush ([§2.1](#21-energy)).
- **Combo points** 0–5: builders award them, finishers spend them; Seal Fate, Ruthlessness,
  Relentless Strikes, Puncturing Wounds and Improved Expose Armor act around them
  ([§2.2](#22-combo-points)).
- **Dual wield**: both hands swing, the off hand at 50% × (1 + Dual Wield Specialization), with
  the dual-wield miss penalty on white swings ([§2.4](#24-dual-wield-and-white-hits)).
- **Abilities**: Sinister Strike, Backstab (from behind), Hemorrhage, Mutilate, Ghostly Strike,
  Eviscerate, Slice and Dice (haste), Rupture, Expose Armor, Blade Flurry, Adrenaline Rush, Cold
  Blood, Premeditation, and Ambush in Cutthroat's window ([§3](#3-abilities)).
- **Poisons**: Instant and Deadly Poison as temporary weapon enchants on one hand each, with a
  proc chance per landed hit of that weapon; Deadly Poison stacks on the boss ([§4](#4-poisons)).
- **Thistle Tea**: 100 Energy, every 5 min ([§7.5](#75-enchants-and-consumables)).

---

## 1. WoW Forever changes

Every row below compares the Forever and Classic Era client tables; the spellbook's diff
(`src/data/spells/rogue.json`) and the talent tree's (`src/data/talents/rogue.json`) list them all.

### 1.1 Spells (level 60)

| Spell | Forever | Classic Era | Sim impact | Tag, source |
| --- | --- | --- | --- | --- |
| Sinister Strike r8 (spell 11294) | Normalized weapon + 68, 45 Energy, 1 CP | Same | None | [F] [client] (SpellEffect, SpellPower, 1.60.1.69913) |
| Backstab r9 (spell 25300) | Rows unchanged: normalized weapon + 150, ×150%. The tooltip now reads "plus 150" | Tooltip "plus 225" (150 × 1.5) | The flat's place is Q2 | [F] [client] (SpellEffect); [C] tooltip [client] (Spell, 1.15.9.69722) |
| Eviscerate r9 (spell 31016) | 108 ± 54 + 170 per CP (904–1012 at 5), 35 Energy | Same | None | [F] [client] (SpellEffect, 1.60.1.69913) |
| Slice and Dice r2 (spell 6774) | +30% melee attack speed (aura 319), 6 s + 3 s per CP, 25 Energy | Same speed (aura 138), same time | None | [F] [client] (SpellEffect, SpellDuration, 1.60.1.69913) |
| **Rupture** r6 (spell 11275) | **35 + 4.73 per CP per tick**, 6 s + 2 s per CP: **469 at 5 CP** | 60 + 8 per CP: 800 at 5 | **−41%** base damage | [F] [client] (SpellEffect, SpellDuration, 1.60.1.69913); [C] [client] (SpellEffect, 1.15.9.69722) |
| **Expose Armor** r5 (spell 11198) | **−450 armor per CP, −2,250 at 5**, 30 s | −340 per CP, −1,700 at 5 | Equals 5 Sunder Armors | [F] [client] (SpellEffect, 1.60.1.69913) |
| Blade Flurry (spell 13877) | +20% melee attack speed, 15 s, 2 min, 25 Energy | Same | None (second target: M6) | [F] [client] |
| Adrenaline Rush (spell 13750) | +100% Energy regeneration, 15 s, 5 min, on the GCD | Same | None | [F] [client] |
| Cold Blood (spell 14177) | +100% crit on the next SS, BS, Ambush, Eviscerate **or Mutilate** | Without Mutilate | None | [F] [client] (SpellEffect class mask) |
| **Hemorrhage** (spell 16511) | **100% weapon damage (145% with a dagger)**, and **+15% Rupture damage taken** from you for 15 s; 35 Energy, 1 CP | +3 physical damage taken for 30 charges | A builder that feeds Rupture | [F] [client] (SpellEffect, 1.60.1.69913) |
| **Ghostly Strike** (spell 14278) | **125% weapon damage, 180% with a main-hand dagger**, +15% dodge, 20 s cooldown | 125% | Better with daggers | [F] [client] |
| **Mutilate** r4 (spell 1241584) | New: both weapons, 75% × (normalized weapon + 67) each, 60 Energy, 2 CP, +20% against a poisoned target | — | New Assassination builder | [F] [client] (SpellEffect 1241584, 1241586, 1241590) |
| **Premeditation** (spell 14183) | 2 CP, 2 min, **no Stealth needed**, 20 s to use them | Stealth only, 10 s | Usable in combat | [F] [client] |
| **Venom** (spell 1310703) | New finisher: poisons +30% damage and +10% apply chance, 6 s + 3 s per CP | — | Assassination's poison buff | [F] [client] |
| Poisons (Poisons skill) | A profession-like skill line (category 9) | A class skill line (7) | None; the book lists no Poisons tab | [F] [client] (SkillLine, 1.60.1.69913) |

### 1.2 Talents

| Talent (max rank) | Forever | Classic Era | Tag, source |
| --- | --- | --- | --- |
| Malice (5) | +5% crit **with all attacks and poisons** (aura 290) | +5% crit | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| Murder (2) | **+4%** all damage vs Humanoids and **Giants** | +2% vs Humanoids, Giants, Beasts, Dragonkin | [F] |
| Improved Expose Armor (2) | **−10 Energy, and 2 CP back** after a 5-point Expose Armor | +50% armor | [F] |
| Lethality (5) | **+20%** crit damage bonus on SS, Gouge, BS, **Mutilate**, GS, Hemorrhage | +30% | [F] |
| Improved Poisons (5) | +10 points of apply chance, **and a 50% chance to keep a charge** | +10 points | [F] |
| Vigor (2) | +10 maximum Energy (2 ranks) | +10 (1 rank) | [F] |
| Improved Eviscerate (3) | **+20%** Eviscerate damage, **in Combat** | +15%, Assassination | [F] |
| **Puncturing Wounds** (3, new) | Backstab +30% crit, Mutilate +15% crit, Backstab 45% chance of +1 CP | — | [F] |
| Precision (3) | **+3% hit** (and +3% spell hit) | +5% melee hit | [F] |
| **Flawless Execution** (1, new) | Eviscerate −10 Energy | — | [F] |
| Dual Wield Specialization (5) | **+25%** off-hand damage | +50% | [F] |
| **Hack and Slash** (5, was Sword Specialization) | Axe/sword 5% extra attack; dagger/fist +5% crit; mace ignores 15% armor | Sword 5% extra attack | [F] |
| Weapon Expertise (2) | **−2% chance to be dodged or parried** (aura 240, expertise) | +5 weapon skill | [F] |
| Aggression (3) | +6% SS, **Backstab** and Eviscerate | SS and Eviscerate | [F] |
| Opportunity (2) | **+10%** Backstab, Garrote, Ambush, **Mutilate** | +20% from behind | [F] |
| Serrated Blades (3) | Ignore **9%** of armor; Rupture +30% | Flat armor by level | [F] |
| **Quietus** (5, new) | SS, GS, Hemorrhage +10% below 35% health | — | [F] |
| **Cutthroat** (5, new) | Backstab 15% chance: the next Ambush within 10 s needs no Stealth | — | [F] |
| **Thousand Cuts** (1, new) | Each Rupture tick: next Hemorrhage or Backstab −3 Energy, stacking to 5 | — | [F] |
| **Removed** | Improved Backstab, Dagger, Mace and Fist Weapon Specialization, Sleight of Hand, Improved Sap, Deadliness | | [F] talents diff |

### 1.3 Poisons

Instant Poison VI hits for **76–100** (spell 11337: 88 with `Variance` 0.2769; Classic Era 112–148)
and Deadly Poison V ticks for **23** (spell 25349; Classic Era 34), both about a third weaker; their
proc chances (20% and 30%) and 5 stacks are unchanged, their charges grow (175 and 180), and
Deadly Poison's ticks now carry the periodic-crit flag [F] [client] (SpellEffect, SpellItemEnchantment,
SpellMisc, 1.60.1.69913). See [§4](#4-poisons).

---

## 2. Rogue mechanics

### 2.1 Energy

| Rule | Value | Tag, source |
| --- | --- | --- |
| Regeneration | 20 Energy per tick, every 2 s, on the player-global power tick with a random phase | [C] as the cat's ([druid.md §2.4](druid.md#24-energy-cat)) |
| Cap | 100, +5 per rank of Vigor | [?] cap (the cat's Q29); Vigor [F] (aura 35, curve 5/10) |
| At the pull | Full | [?] |
| Adrenaline Rush | Each tick doubled (+100% regeneration, aura 110) | [F] [client] (SpellEffect, 1.60.1.69913) |
| Refunds | An avoided builder gets 80% back; a finisher nothing, and keeps its points | [?] (the cat's Q29) |
| Thistle Tea | +100 at once (spell 9512), no GCD, 5 min | [F] [client] (ItemEffect, SpellEffect, 1.60.1.69913) |

### 2.2 Combo points

- 0 to 5. A builder awards its points when it lands (Mutilate 2, the rest 1; Forever's energize,
  power 4). A finisher needs one, spends them all when it lands (or, for Slice and Dice and Venom,
  when cast: they don't roll), and keeps them when it misses [F] [client]; the keeping is [?].
- **Seal Fate** 5/5: a builder's non-periodic crit adds one more [F].
- **Ruthlessness** 3/3: a finisher that lands has a 60% chance to add a point afterwards [F].
- **Relentless Strikes**: a finisher restores 25 Energy with a 20% chance per point spent
  (100% at 5) [F] [client] (14179 `EffectPointsPerResource` 20; 14181 25).
- Both act on Eviscerate, Slice and Dice, Rupture, Expose Armor, Kidney Shot and **Venom**: 14179's
  class mask `[4063232, 0, 67108864, 0]` names all six, Venom (1310703) by its `[0, 0, 67108864, 0]`
  [F] [client] (SpellEffect, SpellClassOptions, 1.60.1.69913). Ruthlessness (14156) has no mask, only
  "finishing moves" and a proc on melee and harmful abilities; Venom's Spell rows, costs and
  categories match Slice and Dice's, so it counts for both [?].
- **Puncturing Wounds** 3/3: a landed Backstab has a 45% chance of one more point [F].
- **Improved Expose Armor** 2/2: a 5-point Expose Armor gives 2 back [F].
- **Premeditation**: +2 points, a cast, no Stealth in Forever [F].

### 2.3 Global cooldowns

Every rogue ability has a 1.0 s GCD (`StartRecoveryTime` 1000), Blade Flurry and Adrenaline Rush
included; Cold Blood and Thistle Tea have none [F] [client] (SpellCooldowns, 1.60.1.69913). Haste
doesn't shorten it [C] ([damage-and-timing §3.5](../mechanics/damage-and-timing.md#35-global-cooldown)).

### 2.4 Dual wield and white hits

As the Fury warrior ([warrior.md §2](warrior.md#2-warrior-mechanics)): both hands swing on their own
timers, the off hand from half its swing; white swings take the dual-wield miss penalty (27% total
against a raid boss in `forever`, [combat-tables §5](../mechanics/combat-tables.md#5-dual-wield-and-on-next-swing-queues));
specials don't. The off hand deals 50% × (1 + 5% per rank of Dual Wield Specialization): **62.5%**
at 5/5 [F]. Normalized abilities use 2.4 for one-handers and 1.7 for daggers
([damage-and-timing §2.2](../mechanics/damage-and-timing.md#22-normalization-for-instant-attacks)).
Slice and Dice, Blade Flurry and other haste multiply [C].

---

## 3. Abilities

`W` is a weapon roll + flat weapon damage + AP ÷ 14 × speed (normalized for the abilities that say
so). Specials roll [combat-tables §3](../mechanics/combat-tables.md#3-special-yellow-attacks)'s
table: weapon-damage ones once, the others (Eviscerate, Expose Armor) twice [?] (Q4).

### 3.1 Sinister Strike (r8, 11294)

`(W_norm + 68) × Aggression`, 45 Energy − Improved Sinister Strike 5 = **40**, 1 CP; crit ×2.2 with
Lethality 5/5 [F] [client] (SpellEffect, SpellPower, 1.60.1.69913).

### 3.2 Backstab (r9, 25300)

`1.5 × (W_norm + 150) × Aggression × Opportunity`, 60 Energy, 1 CP, from behind, dagger in the main
hand. The flat inside the percentage adds 225, as Classic Era's tooltip reads [C]; Forever's
tooltip reads 150 (Q2). Forever's Mutilate tooltip multiplies its flat by its percentage
(`${$m1*$m2/100}`), which supports the Classic rule. Puncturing Wounds: +30% crit, 45% of an extra point.

### 3.3 Slice and Dice (r2, 6774)

+30% melee attack speed for **(6 + 3 × CP) s × 1.45** with Improved Slice and Dice 3/3: 17.4 s at 2
points, 30.45 s at 5 [F] [client] (SpellEffect, SpellDuration `DurationPerResource` 3000). The
Classic Era guide's opener names both durations [wh-rot].

### 3.4 Eviscerate (r9, 31016)

`uniform(54, 162) + 170 × CP + 0.03 × CP × AP`, × Improved Eviscerate 1.20 × Aggression 1.06;
35 − Flawless Execution 10 = **25 Energy** [F] [client]. The attack-power term is [?]: the tooltip
says only "increased by Attack Power", the client carries no coefficient (`BonusCoefficientFromAP`
0), and 3% per point is what Classic Era sims use (Q3).

### 3.5 Rupture (r6, 11275)

A bleed of **3 + CP ticks** every 2 s, each `35 + 4.73 × CP + 0.01 × min(CP, 3) × AP`, × Serrated
Blades (+10% per rank) [F] [client] (SpellEffect, SpellDuration `DurationPerResource` 2000); the AP
term is [?] (Q3): Classic Era sims' 4/10/18/21/24% of AP over the whole bleed. It ignores armor and
snapshots at application; its ticks crit in `forever` ([damage-and-timing §4](../mechanics/damage-and-timing.md#4-dots-and-bleeds)).

### 3.6 Expose Armor (r5, 11198)

−450 armor per point for 30 s, 25 Energy (15 with Improved Expose Armor 2/2) [F]. The rotation
uses it at 5 points only (−2,250), when it's on. It shares Sunder Armor's slot
([buffs doc §4.1](../mechanics/buffs-debuffs-consumables.md#41-armor-reduction)): with the Buffs
tab's Sunder Armor on, yours does nothing.

### 3.7 Blade Flurry (13877) and Adrenaline Rush (13750)

Blade Flurry: +20% melee attack speed for 15 s, 2 min, 25 Energy; its extra target waits for
multi-target ([M6](../milestones.md#m6-multi-target-)). Adrenaline Rush: +100% Energy regeneration
for 15 s, 5 min. Both are on the 1 s GCD in Forever [F] [client].

### 3.8 Cold Blood (14177)

+100% crit on the next Sinister Strike, Backstab, Ambush, Eviscerate or Mutilate, 3 min, off the
GCD [F]. The strike uses it up when it lands; one that misses keeps it [?] (Q6).

### 3.9 Hemorrhage (16511) and Ghostly Strike (14278)

Hemorrhage: 100% of `W_norm` (145% with a dagger), 35 Energy, 1 CP, and your Rupture deals 15% more
to the target for 15 s. Ghostly Strike: 125% of `W` (not normalized; 180% with a main-hand dagger),
40 Energy, 20 s, 1 CP [F] [client] (SpellEffect, 1.60.1.69913). Lethality and Quietus apply to both.
The daggers' shares are dummy effects, so the server applies them: the sim gives Hemorrhage its 145%
with a dagger in the main hand [?] (Q12). Hemorrhage's debuff (aura 271 on Rupture's class mask) is
read at each Rupture tick while it's on the boss, not snapshotted with the Rupture [?] (Q12).
Ghostly Strike's +15% dodge for 7 s only helps a rogue the boss attacks, so it isn't simulated.

### 3.10 Premeditation (14183)

+2 CP, 2 min, off the GCD, no Stealth needed in Forever [F]. Used at 3 points or fewer, so its
20 s to use them never runs out.

### 3.11 Mutilate (r4, 1241584)

Two strikes, one per hand: `0.75 × (W_norm + 67)` each (1241586, 1241590), 60 Energy, 2 CP, +20%
against a target with your lasting poison on it (Deadly Poison) [F] [client]. It needs daggers.
The sim rolls each hand on its own table, the off hand's strike at the off-hand multiplier (§2.4),
and only the main hand's crit rolls Seal Fate [?] (Q7).

### 3.12 Not simulated

Ambush from Stealth (an opener before the pull), Garrote and Cheap Shot (stealth), Kidney Shot and Gouge (bosses are
immune or it breaks), Riposte (the boss faces the tank), Kick, Feint, Evasion, Sprint, Vanish,
Preparation, Redirect, Distract.

### 3.13 Ambush (r6, 11269)

`2.5 × (W_norm + 116)` (the tooltip's "250% weapon damage plus 290"), 60 Energy, 1 CP, from behind
with a dagger in the main hand [F] [client]. It needs Stealth, so the sim uses it only in Cutthroat's
window (§5.3); Initiative 3/3 adds a point for certain and Improved Ambush 3/3 45% crit.

---

## 4. Poisons

Each poison is a temporary weapon enchant on one weapon, one per weapon, in place of a sharpening
stone ([buffs doc §3.6](../mechanics/buffs-debuffs-consumables.md#36-weapon-enhancements-temporary)).
Each landed hit of that weapon, white or special, rolls its chance [C] [wh-poisons]. A poison rolls
spell hit (Precision's spell hit counts), is partly resisted like a spell, and crits at spell
crit ×1.5 [?] (Q5): Malice's Forever tooltip names poisons, so they can crit.

### 4.1 Instant Poison VI

Item 8928 → spell 11340 → enchant 625: 20% per hit of spell 11337, 88 Nature with `Variance`
0.2769, **76–100** as whole numbers [F] [client] (SpellEffect, SpellItemEnchantment, 1.60.1.69913);
Classic Era 112–148 [C].

### 4.2 Deadly Poison V

Item 20844 → spell 25351 → enchant 2630: 30% per hit of spell 25349, a stack of 23 Nature every 3 s
for 12 s, up to 5 stacks (`CumulativeAura` 5) [F] [client]; Classic Era 34 a tick [C]. Each
application rolls spell hit, adds a stack and renews the 12 s; the ticks keep their own timer [?]
(Q8), and in `forever` may crit (SpellMisc Attributes[8] 0x200, set in Forever and not in Classic
Era).

### 4.3 Poison talents

- **Improved Poisons** 5/5: +10 points of apply chance (Instant 30%, Deadly 40%) [F].
- **Vile Poisons** 5/5: +20% poison damage [F].
- **Venom** (finisher): +30% poison damage and +10 points of apply chance for (6 + 3 × CP) s [F].
  Its first effect, a dummy on the target, is taken to add nothing [?] (Q11).
- **Malice**: +5% crit, poisons included [F].

### 4.4 Which poison where

Classic Era rogues put Instant Poison on both weapons, or on the off hand only beside Windfury
Totem, which took the main hand's temporary-enchant slot [C] [wh-rot] [wh-poisons]. In Forever,
Windfury Totem is a party aura ([buffs doc](../mechanics/buffs-debuffs-consumables.md#windfury-totem)),
so the main hand keeps its poison [?]. With Forever's numbers, Deadly Poison on the main hand and
Instant Poison on the off hand measured best for the default Combat rogue: +17.5 DPS (±0.4) over
Instant on both, and Deadly on both +13.6 (one stack on the boss, fed faster, caps sooner) (seed
2702, 20,000 paired fights). That pair is every rogue preset's default.

---

## 5. Talents

Per-rank values are the client's curves (`src/data/client/talents.json`), checked by
`rogue.test.ts`. Different talents' percentages on one ability multiply [?], as the druid's.

### 5.1 Assassination

Malice (+1% crit per rank, all attacks and poisons), Ruthlessness (20% per rank), Murder (+2% per
rank vs Humanoids and Giants), Improved Slice and Dice (+15% time per rank), Relentless Strikes,
Improved Expose Armor, Lethality (+4% crit bonus per rank: ×2.2 at 5/5 [?], as the warrior's Impale),
Vile Poisons, Cold Blood, Improved Poisons, Vigor, Mutilate, Seal Fate (20% per rank), Venom. Not
simulated: Improved Gouge, Remorseless Attacks, Improved Kidney Shot.

### 5.2 Combat

Improved Eviscerate (7/13/20%), Improved Sinister Strike (−3/−5), Puncturing Wounds, Precision,
Flawless Execution, Dual Wield Specialization, Blade Flurry, Hack and Slash, Weapon Expertise,
Aggression (+2% per rank), Adrenaline Rush. Hack and Slash's axe and sword extra attack is a
main-hand swing from a hit of that weapon, 1% per rank with a 200 ms internal cooldown
(`ProcCategoryRecovery` 200), like the warrior's sword Weaponmaster [F]; its dagger and fist crit
counts for that weapon's attacks only [?] (Q9). Lightning Reflexes and Deflection add dodge and
parry. Not simulated: Endurance, Riposte, Improved Sprint, Improved Kick.

### 5.3 Subtlety

Opportunity (+5% per rank), Improved Ambush (+15% crit per rank), Initiative (33 / 67 / 100% of a
second point on Ambush), Ghostly Strike, Premeditation, Serrated Blades (3% armor ignored per rank,
after the flat debuffs [?], and +10% Rupture per rank), Hemorrhage [F].

- **Quietus** 5/5: Sinister Strike, Ghostly Strike and Hemorrhage deal +2% per rank against a target
  below 35% health [F] (1310728: a dummy of 10 and 35, the curve 2/4/6/8/10). The sim starts it at
  t = floor(L × 0.65), the execute phase's rule for a boss whose health falls evenly
  ([encounter §3](../mechanics/encounter.md)), and multiplies it with the other bonuses [?] (Q13).
- **Cutthroat** 5/5: a landed Backstab has a 3% chance per rank to let the next Ambush within 10 s
  skip Stealth [F] (462708, a dummy; the curve 3/6/9/12/15). The sim opens a 10 s window that Ambush
  needs and closes; crits and blocks count as landed [?] (Q14). Its second curve (5/10/15/15/15) has no
  client effect to go with it and isn't simulated.
- **Thousand Cuts**: each Rupture tick adds a stack (1310723: `CumulativeAura` 5, 10 s), and the next
  Backstab or Hemorrhage costs 3 Energy less per stack and uses them all up [F]. Its 1.9 s
  `ProcCategoryRecovery` never binds on Rupture's 2 s ticks. The sim uses the stacks up when the
  ability is used, even if it misses [?] (Q15).

Not simulated: Preparation (it would give one more Premeditation in a fight of 2 min or more; the
build takes it for Thousand Cuts), Camouflage, Master of Deception, Setup, Elusiveness, Dirty Tricks,
Improved Distract, Heightened Senses, Dirty Deeds.

---

## 6. Rotation and priority

The defaults are the Classic Era community priority adapted to Forever, with one quick search of
its two or three biggest settings (20,000 paired fights on one seed), per D27; the Rotation tab
says they're "the common priority". The tuning milestone (M10) tunes them to D23's standard.

### 6.1 Combat (shipped)

The Classic Era Combat Swords priority [wh-rot]: "2 Combo Points Slice and Dice … Adrenaline Rush
and any damage related racials/trinkets … Sinister Strike to full Combo Points … 5 Combo Points
Slice and Dice … Keep up Slice and Dice at all times … Use Eviscerate whenever you have extra Combo
Points … If you are Energy starved, consider Thistle Tea."

| # | Action | Condition (defaults) | Setting ids (default) |
| --- | --- | --- | --- |
| 1 | Racial, on-use trinkets (off the GCD) | On cooldown | `rogue.combat.racial.enabled` (on), `.onUseItems.enabled` (on) |
| 2 | Thistle Tea (off the GCD) | Energy ≤ 10, when selected in Buffs | `rogue.combat.thistleTea.enabled` (on), `.maxEnergy` (10) |
| 3 | Juju Flurry (off the GCD) | On cooldown, when selected in Buffs | `rogue.combat.jujuFlurry.enabled` (on) |
| 4 | Slice and Dice | Down, or ≤ 0.5 s left; at ≥ 2 CP | `rogue.combat.sliceAndDice.enabled` (on), `.minComboPoints` (2), `.refreshBelowSec` (0.5) |
| 5 | Blade Flurry | On cooldown | `rogue.combat.bladeFlurry.enabled` (on) |
| 6 | Adrenaline Rush | On cooldown | `rogue.combat.adrenalineRush.enabled` (on) |
| 7 | Expose Armor | Down, at 5 CP | `rogue.combat.exposeArmor.enabled` (off) |
| 8 | Rupture | Down, at ≥ 5 CP, ≥ 10 s of the fight left | `rogue.combat.rupture.enabled` (off), `.minComboPoints` (5), `.minFightLeftSec` (10) |
| 9 | Eviscerate | At ≥ 5 CP | `rogue.combat.eviscerate.enabled` (on), `.minComboPoints` (5) |
| 10 | Sinister Strike | Affordable | always |

**First-pass search** (the default setup, seed 2701, 20,000 paired fights; 580.3 DPS):
- Slice and Dice at 2 points (the guide's opener) against 1: +0.23 (−0.22 to +0.67); against 3,
  −1.54. Eviscerate at 5 against 4: +0.52.
- Renewing Slice and Dice at 0.5 s left: level with 0 (−0.09) and 1 s (−0.23); 1.5 s −0.76.
- Thistle Tea at ≤ 10 Energy: level with 5 (+0.17); 15 −0.81, 20 −3.89, and 0, which the bar
  seldom reaches, −7.55.
- Before that search, with Instant Poison on both weapons, the same settings gained +3.2 DPS over
  the first draft (1 point, 2 s, 10).

### 6.2 Assassination (shipped)

The Classic Era Seal Fate Daggers priority [wh-rot] (Slice and Dice at 2, then 5 points; Cold
Blood before a 5-point Eviscerate; Thistle Tea), adapted to Forever: **Mutilate** is the builder
(it needs a dagger in each hand and gains 20% against the Deadly-poisoned boss; without daggers,
Sinister Strike builds), and **Venom** is a setting for the poisons, off by default (below).

| # | Action | Condition (defaults) | Setting ids (default) |
| --- | --- | --- | --- |
| 1 | Racial, on-use trinkets, Thistle Tea, Juju Flurry (off the GCD) | As Combat's 1–3 | `rogue.assassination.racial.enabled` (on), `.onUseItems.enabled` (on), `.thistleTea.enabled` (on), `.thistleTea.maxEnergy` (10), `.jujuFlurry.enabled` (on) |
| 2 | Slice and Dice | Down, or ≤ 0.5 s left; at ≥ 2 CP | `rogue.assassination.sliceAndDice.enabled` (on), `.minComboPoints` (2), `.refreshBelowSec` (0.5) |
| 3 | Venom | Down, or ≤ its setting left; at ≥ 3 CP | `rogue.assassination.venom.enabled` (**off**), `.minComboPoints` (3), `.refreshBelowSec` (0) |
| 4 | Expose Armor | Down, at 5 CP | `rogue.assassination.exposeArmor.enabled` (off) |
| 5 | Cold Blood (off the GCD) | At 5 CP with Eviscerate's Energy | `rogue.assassination.coldBlood.enabled` (on) |
| 6 | Eviscerate | At ≥ 4 CP | `rogue.assassination.eviscerate.enabled` (on), `.minComboPoints` (4) |
| 7 | Mutilate, or Sinister Strike without two daggers | Affordable | `rogue.assassination.mutilate.enabled` (on) |

**First-pass search** (the default setup, seed 2701, 20,000 paired fights; 524.1 DPS):
- Venom costs the combo points Eviscerate would spend: on at 3 points it's −25.9 (−26.2 to −25.5;
  −4.9%), at 5 −22.7 (−4.3%), at 1 −29.5 (−5.6%), with Relentless Strikes' Energy and
  Ruthlessness's point on each Venom (§2.2). It adds about 25 DPS of poison damage (the poisons go
  from 67 to 92 DPS at 78% uptime) and takes about 51 from Eviscerate. So it's off by default. The
  default build still takes it, so it's there to turn on; the tuning milestone may move that point,
  and Q11 asks whether its dummy effect adds more.
- Eviscerate at 4 against 5: +6.78 (+6.44 to +7.13); 3 is −5.9 against 4. Mutilate's 2 points (3
  with Seal Fate) make 5 from 4 an overflow.
- Slice and Dice at 2 points: level with 1 (−0.08); 3 −1.99. Renewing at 0.5 s: level with 0 and
  1 s; 2 s −0.73. Thistle Tea at 10: level with 5 (+0.44) and 20.
- Mutilate is worth +53.7 over Sinister Strike, Cold Blood +5.3.

### 6.3 Subtlety (shipped)

The Classic Era Hemorrhage priority [wh-rot], adapted to Forever's Subtlety: Rupture kept up
(Serrated Blades, Hemorrhage's debuff, Thousand Cuts), Eviscerate with the points left over, Slice
and Dice, Premeditation, and a builder: **Hemorrhage** by default, or Backstab from behind with a
main-hand dagger, with Cutthroat's Ambush and Hemorrhage kept up for its debuff. Hemorrhage builds
from the front and without a dagger either way. Only one builder is in the list, so a cheaper one
never spends the Energy Backstab waits for.

| # | Action | Condition (defaults) | Setting ids (default) |
| --- | --- | --- | --- |
| 1 | Racial, on-use trinkets, Thistle Tea, Juju Flurry (off the GCD) | As Combat's 1–3 | `rogue.subtlety.racial.enabled` (on), `.onUseItems.enabled` (on), `.thistleTea.enabled` (on), `.thistleTea.maxEnergy` (10), `.jujuFlurry.enabled` (on) |
| 2 | Premeditation (off the GCD) | On cooldown, at ≤ 3 CP | `rogue.subtlety.premeditation.enabled` (on) |
| 3 | Slice and Dice | Down, or ≤ 0.5 s left; at ≥ 2 CP | `rogue.subtlety.sliceAndDice.enabled` (on), `.minComboPoints` (2), `.refreshBelowSec` (0.5) |
| 4 | Expose Armor | Down, at 5 CP | `rogue.subtlety.exposeArmor.enabled` (off) |
| 5 | Rupture | Down, at ≥ 3 CP, ≥ 10 s of the fight left | `rogue.subtlety.rupture.enabled` (on), `.minComboPoints` (**3**), `.minFightLeftSec` (10) |
| 6 | Eviscerate | At ≥ 5 CP | `rogue.subtlety.eviscerate.enabled` (on), `.minComboPoints` (5) |
| 7 | Hemorrhage (Backstab builder only) | Rupture up, Hemorrhage's debuff down | `rogue.subtlety.hemorrhage.enabled` (on) |
| 8 | Ambush (Backstab builder only) | Cutthroat's window open | `rogue.subtlety.ambush.enabled` (on) |
| 9 | Ghostly Strike | On cooldown | `rogue.subtlety.ghostlyStrike.enabled` (**off**) |
| 10 | The builder | Affordable | `rogue.subtlety.builder` (**hemorrhage**; or backstab) |

With Hemorrhage building, rows 7 and 8 do nothing, and the Rotation tab says so.

**First-pass search** (the default setup, seed 2703, 20,000 paired fights; 504.7 DPS):
- Hemorrhage as the builder against Backstab: +25.2 (+24.8 to +25.5); Backstab without Ambush is
  another −13.7. At 35 Energy to Backstab's 60, Hemorrhage builds the points Rupture and Eviscerate
  spend much faster, and keeps its debuff up.
- Rupture at 3 points against 5: +3.9; at 4 +2.6 below 3's, at 2 −0.5, at 1 −1.6. Rupture off: −31.8.
  Eviscerate at 4: −2.6.
- Ghostly Strike off: +1.1 (+0.8 to +1.4): its Energy does as much in Hemorrhage, so it's off by
  default. Premeditation off: −5.7.
- Slice and Dice at 1 point: level (+0.2); at 3 −0.6, at 4 −2.4. Renewing it at 0.5 s: level with
  0 and 1 s. Thistle Tea at 20: −1.0.

---

## 7. Sensible defaults

### 7.1 Talents

| Spec | Build | Code | Why |
| --- | --- | --- | --- |
| Combat swords | 18/33/0 | `005303105001-32502300001515231-` | The Classic Era Combat Swords shape in Forever's tree: Malice, Ruthlessness, Improved Slice and Dice, Relentless Strikes, Lethality, Improved Poisons 1; Improved Eviscerate, Improved Sinister Strike, Precision, Flawless Execution, Dual Wield Specialization, Blade Flurry, Hack and Slash, Weapon Expertise, Aggression, Adrenaline Rush. Lightning Reflexes 5 and Deflection 2 fill Combat's tiers 1–3, which have nothing more for swords |
| Assassination daggers | 38/11/2 | `00531310551521051-302303-002` | Seal Fate, Cold Blood, Vile and Improved Poisons, Mutilate, Venom; Puncturing Wounds and Precision; Opportunity |
| Subtlety daggers | 15/0/36 | `005303103--0322003311213211551` | Hemorrhage, Serrated Blades, Premeditation, Ghostly Strike, Quietus, Cutthroat, Thousand Cuts; the Assassination core to Lethality 3 |

### 7.2 Race

**Human**: +2% crit with a sword (Forever's racial, [warrior.md §2.9](warrior.md#29-racials-for-warriors))
and no racial cooldown. Orcs (Blood Fury), Trolls (Berserking) and Night Elves (Elune's Light) press
theirs on cooldown.

### 7.3 Weapons and gear

The Classic Era rogue pre-raid list (Wowhead, Phase 5, 2021-05-18 archive [wh-bis]), top pick
plus two alternatives per slot, four for rings and trinkets, no PvP rank above 10 (D10, D11;
`scripts/scrape/pre-raid-bis.json`). Combat: Dal'Rend's Sacred Charge and Dal'Rend's Tribal
Guardian (swords). Assassination and Subtlety: Felstriker or Heartseeker in the main hand, Alcor's
Sunrazor or Distracting Dagger in the off hand. Armor: Darkmantle (Dungeon Set 2) where the guide
ranks it first; many of these items have no Forever client row yet and use their Classic Era stats
(D6).

### 7.4 Rotation settings

§6's tables.

### 7.5 Enchants and consumables

Enchants: Agility everywhere (head and legs Lesser Arcanum of Voracity, cloak, bracers, gloves,
boots, necklace), chest Greater Stats, Crusader on both weapons
([buffs doc §6.4](../mechanics/buffs-debuffs-consumables.md#64-enchant-defaults-by-spec)).
Standard raid consumables: Deadly Poison V (main hand), Instant Poison VI (off hand), Thistle Tea,
Elixir of the Mongoose, Flank au Poivre; Max adds Juju Might, Juju Power, Ground Scorpok Assay and
Juju Flurry. Thistle Tea is Forever's item 7676 (usable by rogues and druids), +100 Energy, 5 min.

### 7.6 Base values

Every rogue base value is a [D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)
placeholder except the client's slopes:

| Value | Rogue | Tag · source |
| --- | --- | --- |
| Attributes (Human) | Str 80, Agi 130, Sta 75, Int 35, Spi 50 (raw), other races by the [C] offsets | [?] placeholder (D24); origin: [mz-levelstats], not evidence. A naked Classic Era Human rogue sheet (October 2019) read 80 Stamina |
| Base health | 1,523 | [?] placeholder (D24); origin: [mz-classlevelstats], not evidence |
| Base attack power | 100 (2 × 60 − 20) | [?] placeholder (D24); origin: [wsc-base], not evidence |
| AP per Strength, per Agility | 1 and 1 | [F] [client] (ChrClasses, 1.60.1.69913) |
| Crit per Agility | 0.0345% (29 Agi per 1%) | [F] [client] (PlayerExpectedStat, 1.60.1.69913) |
| Base melee crit, spell crit, dodge | 0%, 0%, 0% | [?] placeholder (D24); origin: [rb-vanilla], [wsc-base], not evidence |
| Spell crit per Intellect, mana | none | [F] [client] (PlayerExpectedStat: 0 and 0) |

---

## 8. Implementation notes

`src/sim/classes/rogue/` holds the rows (`abilities.ts`), the passive talents as effects
(`talents.ts`), the talents that modify abilities (`modifiers.ts`, `withRogueTalents`), Energy and
the assumptions (`setup.ts`), the shared lines and settings (`shared.ts`), and the three lists
(`combat.ts`, `assassination.ts`, `subtlety.ts`). The rotation's context carries both weapons'
types, so Mutilate is used only with two daggers. The engine gained, additively (every other spec
byte-identical):

- An aura's `energyRegen` (Adrenaline Rush multiplies each power tick's Energy).
- `auraMsPerComboPoint` and `dotTicksPerComboPoint`: a `cast` finisher's buff (Slice and Dice) and a
  `bleed` finisher's ticks (Rupture) grow with the points; a `cast` now moves combo points too.
- `finisherEnergyChancePerCp`/`finisherEnergyTenths` (Relentless Strikes), `finisherComboPointChance`
  (Ruthlessness), `comboPointsBackAtFive` (Improved Expose Armor), `bonusComboPointChance`
  (Puncturing Wounds).
- `auraCrit.consume`: Cold Blood is used up by the strike that lands.
- `poisonedTargetPct`: Mutilate's bonus while a lasting poison is on the boss.
- Poisons: a `tempEnchant` with a `hand` and a `proc`; `poisonChance` and `poisonDamage` effects
  (Improved Poisons, Vile Poisons) and aura mods (Venom); the `stackingDot` proc action (Deadly
  Poison): one stack count on the boss per poison, whichever weapon applies it.
- COND 30 `maxComboPoints`; ACTION 8 `stackingDot` (after main's `manaFlat` 7).

Subtlety (`subtlety.ts`) added four more, each absent-is-zero:

- An aura's `bleedDamage`: your bleeds' ticks deal that much more while it's up, read at each tick
  (Hemorrhage's +15% Rupture).
- `lowHealthPct` and `lowHealthBelowPct`: a bonus on an ability's direct damage from the moment the
  target falls below that health, by the execute phase's rule (Quietus, 35%).
- `tickAura` on a bleed, and `costAura` with `costPerStackTenths` on an ability: each tick adds a
  stack, and the ability costs that much less per stack and takes the aura down (Thousand Cuts).
- `opensAura` with `opensAuraChance`: a landed hit puts an aura up at that chance (Cutthroat's
  window, which Ambush needs as a `window`).

Ghostly Strike's and Hemorrhage's dagger shares come from the rotation context's weapon types;
Premeditation is a `cast` with combo points and COND 30 `maxComboPoints`.

---

## 9. Worked examples

Each is a unit test in `src/sim/classes/rogue/rogue.test.ts`.

- **R1 Sinister Strike.** A 100–150 one-hander at 1,000 AP: `(125 + 1000/14 × 2.4 + 68) × 1.06` =
  **386.3** on average before armor; ×2.2 on a crit with Lethality 5/5.
- **R2 Backstab.** A 60–110 dagger at 1,000 AP: `1.5 × (85 + 1000/14 × 1.7 + 150) × 1.06 × 1.10`
  = **623.4** (Aggression 3/3, Opportunity 2/2).
- **R3 Eviscerate.** 5 points at 1,000 AP: `(54…162 + 850 + 150) × 1.20 × 1.06` = **1,340.6 –
  1,478.0**.
- **R4 Slice and Dice.** Improved Slice and Dice 3/3: **17.4 s** at 2 points, **30.45 s** at 5.
- **R5 Rupture.** 5 points at 1,000 AP: 8 ticks of `35 + 4.73 × 5 + 0.01 × 3 × 1000` = 88.65, **709.2**.
- **R6 Relentless Strikes.** 25 Energy for certain at 5 points; 40% at 2.
- **R7 Adrenaline Rush.** 40 Energy a tick: 300 in its 15 s (7 or 8 ticks).
- **R8 Off hand.** Dual Wield Specialization 5/5: 50% × 1.25 = **62.5%** of a hit.
- **R9 Instant Poison.** Improved Poisons 1/5 and Vile Poisons 0: 22% per hit, 76–100 Nature.
- **R10 Deadly Poison.** 5 stacks: 115 every 3 s, 38.3 a second before resists.
- **R11 Hemorrhage.** The R2 dagger at 1,000 AP: `(85 + 1000/14 × 1.7) × 1.45` = **299.3**; with
  Quietus 5/5 below 35% health, **329.3**.
- **R12 Ambush.** The same dagger with Opportunity 2/2: `2.5 × (85 + 1000/14 × 1.7 + 116) × 1.10` =
  **886.7**, and 2 combo points with Initiative 3/3.
- **R13 Thousand Cuts.** At 3 stacks Backstab costs **51** Energy; at 5, Hemorrhage costs **20**.

R11–R13 are in `subtlety.test.ts`.

---

## 10. Open questions

- **Q1 Energy.** The cap, a full bar at the pull, the tick's phase and the 80% refund are the cat's
  [?] (druid.md Q6, Q29). Test: a rogue's Energy bar on the beta, a missed Sinister Strike's cost.
- **Q2 Backstab's flat bonus.** 225 (inside the 150%, the Classic Era rule, Mutilate's Forever
  tooltip) or 150 (Forever's Backstab tooltip)? About 3% of a Backstab. Test: the average of 50
  non-crit Backstabs with a known dagger and AP.
- **Q3 Finishers' attack power.** Eviscerate's 3% per point and Rupture's 1% per point per tick (3
  points at most) are Classic Era sims' values ([wsc-base]'s lineage); the client carries none.
  About 10% of an Eviscerate at 1,000 AP. Test: 5-point Eviscerates at two AP levels.
- **Q4 Two rolls.** Eviscerate and Expose Armor roll to hit and then crit, as the warrior's melee
  spells; untested for rogues.
- **Q5 Poison hit and crit.** Spell hit (with Precision's), partial resists and spell crit ×1.5
  (Malice's tooltip). Test: 200 Instant Poison procs, their misses and crits.
- **Q6 Cold Blood.** Used up only when the strike lands?
- **Q7 Mutilate.** One roll for both strikes or one each; Seal Fate from either hand's crit.
- **Q8 Deadly Poison's timer.** A new stack renews the duration without restarting the tick timer
  (the modern engine's rule), and its ticks crit in Forever (the client flag).
- **Q9 Hack and Slash.** Whether a dagger or fist in one hand gives its crit to the other's attacks.
- **Q10 Base values.** §7.6's placeholders (OQ-1 in character-stats); the rogue's crit per point is
  about 1.7% of Combat DPS, so a 0–1% base crit error is over D24's 1%: measure it first (a naked
  sheet: crit − Agi × 0.0345).
- **Q11 Venom's dummy.** Venom's effect 0 is a dummy (effect 3) on the enemy target, with a bonus
  coefficient of 1; the tooltip names only the poisons' +30% and +10%. If it does damage or more,
  Venom may be worth keeping up (§6.2). Test: a 5-point Venom on a dummy, the combat log.
- **Q12 Hemorrhage.** Does its +15% count on Rupture ticks while the debuff is up (the sim), or only
  on a Rupture applied under it? Does its 145% need the dagger in the main hand? Test: Rupture ticks
  before and after a Hemorrhage; a Hemorrhage with a dagger only in the off hand.
- **Q13 Quietus.** Does it multiply with Lethality's and the other damage bonuses, and does it start
  at exactly 35%? Test: Hemorrhages on a dummy at 36% and 34%.
- **Q14 Cutthroat.** Does a Backstab crit (or a blocked one) roll it, and can the window stack or
  refresh? Test: 200 Backstabs, the Ambushes allowed.
- **Q15 Thousand Cuts.** Does a missed Backstab or Hemorrhage use up the stacks? Test: the Energy a
  dodged Hemorrhage costs with stacks up.

---

## Sources

| Label | URL | Covers | Ruleset |
| --- | --- | --- | --- |
| client | `src/data/client/*.json`, `src/data/spells/rogue.json`, `src/data/talents/rogue.json` | Every [F] value: builds 1.60.1.69913 and 1.15.9.69722 via the wago.tools API | Forever and Classic Era |
| wh-rot | <https://web.archive.org/web/20210518013556/https://classic.wowhead.com/guides/rogue-dps-rotation-abilities-classic-wow> | Classic Era Combat Swords and Seal Fate Daggers priorities, Thistle Tea, poisons with Windfury Totem | Classic Era (Phase 6, 2021) |
| wh-bis | <https://web.archive.org/web/20210518052722/https://classic.wowhead.com/guides/wow-classic-rogue-dps-pre-raid-best-in-slot-gear> | Pre-raid BiS lists | Classic Era (Phase 5, 2021) |
| wh-poisons | <https://web.archive.org/web/20210517222425/https://classic.wowhead.com/guides/wow-classic-best-rogue-poisons> | Poisons, one per weapon, procs from hits | Classic Era |
| mz-levelstats | <https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql> | Rogue attribute rows (D24 placeholder origin only) | **Forbidden** except as D24 placeholders |
| mz-classlevelstats | <https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql> | Rogue base health 1,523 (D24 placeholder origin only) | **Forbidden** except as D24 placeholders |
| rb-vanilla | <https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua> | Rogue base crit, spell crit and dodge 0 | Classic Era addon (pre-SoD); copies an emulator |
| wsc-base | <https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go> | Rogue AP 2 × level − 20, health 1,523 | Secondary, SoD lineage |
