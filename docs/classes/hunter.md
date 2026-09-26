# Hunter: Marksmanship, Beast Mastery and Survival

WoW Forever keeps the hunter's Auto Shot and reworks what it weaves in: **Aimed Shot** is every
hunter's, a **2.0 s cast** for weapon damage + 166 that **shares a 6 s cooldown with Multi-Shot**
(now a 0.5 s cast with no bonus damage); **Arcane Shot** deals a flat 217 Arcane; **Serpent Sting**'s
ticks can crit, for double damage as a shot's do. The talent trees are new around the old names: **Lone Wolf** (+20% damage without a
pet), **Careful Aim** (attack power from Intellect), **Sniper Shot** (a 4 s snipe) and **Mortal
Shots** in Marksmanship; **Deadly Aspects** (Quick Shots from Aspect of the Hawk), **Focused Fire**
and **Bestial Discipline** beside Bestial Wrath and Frenzy in Beast Mastery; and a Survival tree that
leans to melee, with Lightning Reflexes and Surefooted still there for a ranged hunter. Mana runs out:
the shots cost more than a hunter regenerates, which decides the defaults.

This doc is the engine contract for the hunter's three specs (slice H2, landed in the 90/10 mode of
[D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24) on the
ranged and pet core, [ranged-and-pets.md](../mechanics/ranged-and-pets.md)): the shots, talents, pet
and mana at level 60, with numbers and sources, the rotation and its settings, the defaults, worked
examples that run as unit tests, and the questions the beta has to answer. What the core owns (the
ranged table, Auto Shot's timer and clipping, ranged attack power, ammo, quivers, the pet's table and
power) isn't repeated here.

Status: researched 2026-09-24 · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 ·
ruleset tags: [F] Forever · [C] Classic Era · [?] unverified · engine: the three specs with
first-pass defaults ([§8](#8-rotation))

---

## What the sim needs

1. **Auto Shot** from the Gear tab's ranged weapon, with ammo and a quiver (the core's
   [§1–§4](../mechanics/ranged-and-pets.md#1-ranged-weapons-ammo-and-quivers)).
2. **Shots** on the ranged table: Aimed Shot and Multi-Shot on their shared cooldown, fitted between
   Auto Shots; Arcane Shot; Serpent Sting as a sting; Sniper Shot ([§3](#3-abilities)).
3. **Your own buffs and debuff**: Aspect of the Hawk and Trueshot Aura before the pull, Hunter's Mark
   on the boss, Rapid Fire and Quick Shots as ranged haste ([§3.6](#36-hunters-mark-r4-14325)–[§3.9](#39-aspect-of-the-hawk-r5-14321)).
4. **The pet**: a cat with Claw and Bite on Focus, Bestial Wrath and Frenzy, or none with Lone Wolf
   ([§6](#6-pets)).
5. **Mana**: `15 + Spirit / 5`, Bestial Discipline's share while casting, potions and runes ([§5](#5-mana)).

---

## 1. WoW Forever changes

From the Forever client against Classic Era's (1.60.1.69913 vs 1.15.9.69722), [F] [client] unless tagged:

- **Aimed Shot** (20904): a baseline spell (Classic Era: a Marksmanship talent), a 2.0 s cast (3.0 s),
  +166 (+600), sharing category 2's 6 s cooldown with Multi-Shot.
- **Multi-Shot**: one rank (2643, level 18, no bonus; Classic Era's r5 +150), a 0.5 s cast, 13.9% of
  base mana, the shared 6 s cooldown (its own 10 s).
- **Arcane Shot** r8 (14287): 217 Arcane and no spell damage coefficient (183 and 0.429).
- **Serpent Sting** r8 (13555), the trainer's top rank (r9, 25295, is an Ahn'Qiraj book, Guide: Serpent
  Sting IX, [D36](../decisions.md#d36-what-we-take-from-warriorsim-2026-09-25)): 415 over 15 s (Classic
  Era 490), and the periodic-crit flag (Attributes[8] 0x200).
- **Hunter's Mark** r4 (14325): +71 ranged attack power (110).
- **Rapid Fire** (3045): +40% melee attack speed too (aura 319).
- **Trueshot Aura**: ranged attack power only, a Marksmanship talent (1299346, +30) whose rank 5 at
  level 60 (20906) is +50; rank 4 is +75 ([OQ-H3](#oq-h3-trueshot-auras-ranks)).
- **Sniper Shot**, new: a Marksmanship talent, rank 3 (1310786) a 4.0 s cast for normalized weapon
  damage + 295, a 15 s cooldown.
- **Summon Hawk**, new: a Beast Mastery talent, a hawk that dive-bombs for 108 and fights for 18 s,
  sharing Arcane Shot's cooldown. Not simulated ([OQ-H5](#oq-h5-summon-hawk)).
- **Aspect of the Beast** (+110 melee attack power) and **Lacerate** are new melee tools; the sim's
  hunter doesn't melee.
- **Pets**: Claw, Bite and Focus unchanged; new pet abilities (Swipe, Pinch, Dismember, Savage Rend,
  Dust Cloud, …) and a reworked Furious Howl (the core's [deviations](../mechanics/ranged-and-pets.md#wow-forever-deviations)).
- **Not in Forever**: Steady Shot (Season of Discovery rune data only, the core's §5) and Kill Command
  (no row). **Heart of the Lion**, **Aspect of the Viper** and **Aspect of the Falcon** have
  `SkillLineAbility` rows for the hunter in the Forever client, but the Classic Era client has the
  same rows for its Season of Discovery runes, so they aren't evidence that Forever teaches them: the
  sim leaves them out ([OQ-H6](#oq-h6-season-of-discovery-rows)).
- **The talent trees** are new (§4); the client parks a retired Improved Serpent Sting and a copy of
  Lightning Reflexes outside the tree ([data/talents.md](../data/talents.md#retired-nodes)).
- **Races**: Forever adds Human and Skyborne hunters. Its racials have no weapon skill for bows or guns.

## 2. Conventions

- A cost in % of base mana uses the hunter's 1,720 [F] (PlayerExpectedStat), rounded down [?].
- Every hunter shot is on the 1.5 s GCD (`StartRecoveryTime` 1500) and needs a ranged weapon; Rapid
  Fire, Bestial Wrath and the racials are off it [F].
- Talent values are their rank curves' (TraitDefinitionEffectPoints) at the build's rank [F].
- The class code is `src/sim/classes/hunter/`; `data.test.ts` checks every row against the client.

## 3. Abilities

### 3.1 Aimed Shot (r6, 20904)
Normalized weapon damage (effect 121: the ranged weapon's roll + the ammo's DPS × its real speed +
ranged attack power ÷ 14 × 2.8) + 166, a 2.0 s cast that ranged haste shortens [?] (the core's §4),
310 mana, category 2's 6 s cooldown, crit ×2 [F] [client].

### 3.2 Multi-Shot (2643)
Normalized weapon damage, no bonus, a 0.5 s cast (hasted as Aimed Shot's [?]), 239 mana (13.9% of
1,720), the shared 6 s cooldown. It hits 3 targets; the sim fights one [F] [client].

### 3.3 Arcane Shot (r8, 14287)
217 Arcane, instant, 190 mana, its own 6 s cooldown (category 1173). A school shot: the ranged table's
miss and crit, the Arcane multipliers and the boss's average resist, no armor; crit ×2 as a shot's [?]:
in the public beta logs ([the logs and the method](#beta-logs)), 28 of 422 Arcane Shots from 77 hunters crit, each at 2.00–2.08 times the
shot's logged base (the base leaves out the target's damage-taken bonuses), none near a spell's ×1.5.
The same logs show low ranks hitting for more than their base points, an unmeasured term the sim leaves
out ([OQ-H9](#oq-h9-arcane-shot-and-serpent-sting-scaling)).

### 3.4 Serpent Sting (r8, 13555)
A pure DoT on the ranged table: the hit roll lands it, 5 ticks of 83 Nature every 3 s, no
coefficient, 230 mana [F] [client] (SpellEffect, SpellPower, SpellMisc, 1.60.1.70009). Rank 9 (25295,
111 a tick, 250 mana) is taught by an Ahn'Qiraj book (Guide: Serpent Sting IX, item 21306 → 25295 [F]
[client] (ItemSparse, ItemEffect, ItemXItemEffect, 1.60.1.70009)), and Ahn'Qiraj comes long after
launch ([D36](../decisions.md#d36-what-we-take-from-warriorsim-2026-09-25)). Its ticks can crit (the flag), at your spell crit as it lands [?], **×2 as
a shot's crit** [?]; a partial resist on average [?]. The ×2 is measured in the public beta logs
(build 1.60.1, 18–25 Sep 2026, levels up to 20; [the logs and the method](#beta-logs)): 527 Serpent
Sting ticks from 66 hunters include 27 crits, from 19 of the hunters. The 12 crits of ticks of 9 or
more (that didn't overkill) read 2.00–2.18 times the tick's logged base; smaller ticks (3–4) round
wider. A ×1.5 crit of a 16-damage tick is 24, where the
logs show 33. Until
2026-09-26 the sim used a spell's ×1.5; the ×2 adds 0.7% to Marksmanship's DPS, 0.2% to Beast
Mastery's and 0.4% to Survival's (the default seed, 10,000 fights). The logs can't tell spell crit from ranged crit at those
levels (the ticks crit 5.1%, Arcane Shot 6.6%), so the chance stays spell crit (OQ-H1). The ticks
also grow past their base points at low level ([OQ-H9](#oq-h9-arcane-shot-and-serpent-sting-scaling)).

### 3.5 Sniper Shot (r3, 1310786)
Normalized weapon damage + 295, a 4.0 s cast, 365 mana, its own 15 s cooldown [F]. Its cast always
holds back an Auto Shot.

### 3.6 Hunter's Mark (r4, 14325)
+71 ranged attack power for every attacker of the target (aura 127), 2 min, 60 mana, on the GCD [F].
The sim puts it on the boss at the pull and keeps it up; it always lands [?]; it raises your shots'
and Auto Shots' ranged attack power, not your pet's (a melee attacker).

### 3.7 Rapid Fire (3045)
+40% ranged attack speed (aura 140) for 15 s, 100 mana, a 5 min cooldown (category 55), off the GCD
[F]. Rapid Killing takes 1 min a rank off it.

### 3.8 Bestial Wrath (19574)
The pet deals +50% damage (aura 79) for 18 s; 12% of base mana (206), a 2 min cooldown, off the GCD [F].

### 3.9 Aspect of the Hawk (r5, 14321)
+90 ranged attack power (aura 124) until cancelled, cast before the pull [F] [client] (SpellEffect,
1.60.1.70009). Rank 7 (25296, +120) is an Ahn'Qiraj book (Guide: Aspect of the Hawk VII, item 21307 →
25296), so the sim doesn't use it ([D36](../decisions.md#d36-what-we-take-from-warriorsim-2026-09-25)).
The trainer's rank 6 (14322, level 58) gives only **+55** in the Forever client (Classic Era's is 110;
every other rank is Classic's: 20, 35, 50, 70, 90, 120), and its tooltip says 55 too [F] [client]
(SpellEffect, 1.60.1.69913, 69977 and 70009), so rank 5's +90 is the best a hunter has, and the one a
hunter casts: a hunter who reads the spellbook picks the higher rank (D29). Whether rank 6's +55 is
what the server applies is [OQ-H8](#oq-h8-aspect-of-the-hawk-rank-6) [?]. It carries Quick Shots
(6150: +30% ranged attack speed for 12 s, aura 140) as a proc on Auto Shots that land, at the chance
Deadly Aspects gives it (§4) [F].

## 4. Talents

The talents the sim uses, [F] [client] (their rank curves and SpellEffect rows); the others do nothing
on one boss for a hunter that shoots (traps, stings it doesn't use, pet survival, movement, the melee
talents: Savage Strikes, Predator's Edge, Counterattack, Expose Prey, Lacerating Strikes, Strider Kick).

| Talent (spell) | Rank curve | The sim |
| --- | --- | --- |
| Deadly Aspects (19552) | 2 … 10% | Quick Shots' chance on an Auto Shot that lands (Classic Era's Improved Aspect of the Hawk: 1% a rank) |
| Focused Fire (1223755) | 1, 2% | +r% to all your damage and your pet's while it's out (aura 4, a script: its text) [?] |
| Unleashed Fury (19616) | 3 … 15% | the pet's damage |
| Ferocity (19598) | 2 … 10% | the pet's crit |
| Bestial Discipline (19590) | 10, 20%; 25, 50% | the pet's Focus regeneration; your mana regeneration while casting |
| Frenzy (19621) | 20 … 100% | on the pet's crit, +30% pet attack speed for 8 s |
| Bestial Wrath (19574) | | §3.8 |
| Lethal Attacks (19426) | 1 … 5% | crit with every attack and spell (aura 290) |
| Improved Stings (1310661) | 6, 13, 20% | Serpent Sting's periodic damage |
| Efficiency (19416) | −3 … −15% | the mana of Aimed Shot, Multi-Shot, Arcane Shot and Serpent Sting (its class mask; not Sniper Shot or Hunter's Mark) |
| Careful Aim (1223984) | 20 … 100% | attack power and ranged attack power from Intellect (auras 580, 598) [?] |
| Rapid Killing (415405) | −1, −2 min | Rapid Fire's cooldown |
| Improved Arcane Shot (19454) | −0.3 … −1.5 s | Arcane Shot's cooldown |
| Lone Wolf (415370) | 20% | all your damage without a pet: a build with it fights without one |
| Trueshot Aura (1299346) | | +50 ranged attack power (rank 5), before the pull |
| Mortal Shots (19485) | 6 … 30% | the crit damage bonus of Auto Shot, Aimed Shot, Multi-Shot, Arcane Shot and Serpent Sting: ×2 → ×2.3 at 5/5, Serpent Sting's tick crits included (§3.4) [C] (Sniper Shot isn't in its mask) |
| Barrage (19461) | 3, 7, 10% | Aimed Shot's and Multi-Shot's damage |
| Ranged Weapon Specialization (19507) | 1 … 5% | the ranged weapon's damage: Auto Shot and the physical shots [?] |
| Sniper Shot (1310687) | | §3.5 |
| Improved Tracking (24293) | 1 … 5% | all damage against a boss of a type you can track |
| Surefooted (19290) | 1 … 3% | hit and spell hit |
| Lightning Reflexes (19168) | 2 … 10% | Agility (its text; aura 137's misc value names no one stat) |

## 5. Mana

The engine's mana model (docs/mechanics/spells.md §8): the pool from 1,720 base mana and 15 an
Intellect [F]; every 2 s, `15 + Spirit / 5` when you've spent none for 5 s [C], Bestial Discipline's
share of it inside the five-second rule, and mp5 always. The shots cost far more than that: the
default Marksmanship hunter spends about 10,000 mana in a 3-minute fight against about 3,600 in its
pool, 3,200 regenerated and 3,600 from two Major Mana Potions. So the first-pass defaults drop the
shots that cost the most for what they add (§8.2).

## 6. Pets

A **cat**, Happy, behind the boss [C] (the common Classic Era choice), unless the build has **Lone
Wolf**, whose +20% needs no pet out. Its numbers aren't in either client (the core's
[OQ-6](../mechanics/ranged-and-pets.md#oq-6-pet-stats-and-inheritance)): 45.8 damage a swing every
2.0 s, 252 attack power (2 × 136 Strength − 20) and 5% crit [?] (a Classic Era player's report), ×1.10
for a cat and ×1.25 for Happy [C]. Focus: 100 at most [F], 5 a second [?] (the core's OQ-5), +20%
with Bestial Discipline.

**What it inherits** [?] is every pet's rule, stated once in the core
([ranged-and-pets §6.1](../mechanics/ranged-and-pets.md#61-what-a-pet-inherits-from-you)): 10% of the
higher of your attack power and ranged attack power (your ranged, in every default), and your higher
crit and hit, melee or ranged, added to its own (WE-H9). Against a level-63 boss its attacks lose 1.8%
of that crit, as yours do. Your Hunter's Mark raises your ranged attack power in the sim, so the cat
inherits 7 of its 71; in game the mark is on the boss and may not reach the sheet the aura reads,
which is **about 0.2%** of the default's damage (0.22% on Beast Mastery, 0.15% on Survival). Against
inheriting nothing, the inheritance is +14.8% on Beast Mastery (485.3 → 557.1) and +9.9% on Survival
(420.9 → 462.4), 20,000 fights on seed 2701; the hit share is 1.7% of each. Marksmanship fights
without a pet.

**Battle Shout on the cat** is Classic Era's rule (the core's §8): it reaches pets in the party [C].
The same Forever testers' page says pets can no longer receive external buffs [?], and if Forever
blocks it, the cat loses its 139 attack power: **−24.6 DPS (−4.4%) on Beast Mastery** (557.1 → 532.6),
which still leads Marksmanship's 501.0 (OQ-H7, the core's OQ-8).

| Ability | Numbers | Tag |
| --- | --- | --- |
| Claw r8 (3009) | 43.0–59.0 Physical (51, variance 0.3137), 25 Focus, the pet's 1.5 s GCD | [F] [client] |
| Bite r8 (17261) | 81–99 (90 ± 10%), 35 Focus, 10 s cooldown | [F] [client] |

Its list: Bite on cooldown, then Claw while it has at least **60 Focus** (a setting), so Bite stays
affordable. Its rows name it in the results ("Auto attack · Cat").

## 7. Defaults

### 7.1 Talents

| Spec | Code | Points |
| --- | --- | --- |
| Marksmanship | `55-0053552511503051-` | 10/41/0: Deadly Aspects 5, Endurance Training 5; Lethal Attacks 5, Improved Stings 3, Efficiency 5, Careful Aim 5, Rapid Killing 2, Improved Arcane Shot 5, Lone Wolf 1, Trueshot Aura 1, Mortal Shots 5, Barrage 3, Ranged Weapon Specialization 5, Sniper Shot 1 |
| Marksmanship with a pet (a preset) | `5023-1053552501503051-` | 10/41/0: Deadly Aspects 5, Focused Fire 2, Improved Aspect of the Monkey 3; the same Marksmanship without Lone Wolf, with Hawk Eye 1 |
| Beast Mastery | `5023001505011251-00505505-` | 31/20/0: Deadly Aspects 5, Focused Fire 2, Improved Aspect of the Monkey 3, Bestial Swiftness 1, Unleashed Fury 5, Ferocity 5, Spirit Bond 1, Intimidation 1, Bestial Discipline 2, Frenzy 5, Bestial Wrath 1; Lethal Attacks 5, Efficiency 5, Careful Aim 5, Improved Arcane Shot 5 |
| Survival | `-00505515-55005003124000005` | 0/21/30: Lethal Attacks 5, Efficiency 5, Careful Aim 5, Rapid Killing 1, Improved Arcane Shot 5; Improved Tracking 5, Deflection 5, Survivalist 5, Surefooted 3, Deterrence 1, Survival Tactics 2, Predator's Edge 4, Lightning Reflexes 5 |

Classic Era's raid builds (0/31/20 Marksmanship, 21/30/0 Beast Mastery, 0/20/31 Survival) adapted to
Forever's trees: the damage talents first, the tier gates filled with the cheapest. The Marksmanship
default takes Lone Wolf: with a pet it came out the same in the quick search (§8.2) and relies on the
pet's unmeasured numbers.

### 7.2 Race
**Orc**, for Forever's Blood Fury: +10% attack power and ranged attack power for 15 s, every 2 min
[F] (20572, auras 166 and 167). Troll Berserking (+10% ranged attack speed for 10 s, every 3 min) and
Night Elf Elune's Light (+10% crit for 15 s) are simulated too; Forever's racials give no bow or gun skill.

### 7.3 Gear
Wowhead's Classic Hunter pre-raid list (D11; its Phase 6 table, archived 2021-05-16, the same for every
spec; `scripts/scrape/pre-raid-bis.json`): Dwarven Hand Cannon, Dal'Rend's pair, Devilsaur, Mongoose
Boots and the rest. The guide lists no ammo or quiver, so the defaults take the best non-epic ammo
with a Forever row for what the weapon fires: **Thorium Shells** or **Thorium Headed Arrows** (17.715
damage per second, crafted). The pool has more: Miniature Cannon Balls (20.901) and Doomshot (20.244),
rare and bind-on-pickup, with no Forever row (Classic Era data, D6), and Forever's new epic, bind-on-pickup
Swiftfeather Arrow and Swiftstrike Shot (24.617), whose source the client doesn't give. The quiver is
the 15% **Gnoll Skin Bandolier** or **Harpy Hide Quiver** (required level 55)
[F] ([items.md](../data/items.md#ammo-and-quivers)). Picking a ranged weapon that fires the other kind
swaps the ammo for the other kind's with the closest damage per second (its twin when there is one,
Swiftfeather Arrow ↔ Swiftstrike Shot; the default on a tie), and the quiver or pouch for the other
kind's with the same haste
(`matchSupplies`); a thrown weapon fires none and keeps both. The Gear tab dims ammo the weapon doesn't
fire, in its slot and in the picker, where it sorts last: "For bows and crossbows: your gun fires
bullets" ([ux.md](../ux.md), "Gear").

### 7.4 Enchants and consumables
The rogue's Agility column without weapon enchants (the melee weapons never swing): Agility arcanums,
cloak, bracers, gloves and boots, Greater Stats and Forever's +5 Agility necklace. No scope: the
catalogue has none yet. The Buffs tab gives a hunter the melee entries that reach its shots (Agility,
crit, armor debuffs) and locks off what doesn't (stones, Windfury Totem, melee attack power and
Strength), keeps Battle Shout for the pet, gives it the mana entries and Grace of Air as its group's
air totem, and Juju Might's +40 ranged attack power (16329, aura 124) [F]. The Major Frenzy Potion's +80
ranged attack power (aura 124) reaches its shots too: Max consumables gives it to the Marksmanship and
Survival hunters in place of the Major Mana Potion (+0.9% and +0.6% DPS), and leaves the Beast Mastery
hunter its mana potion (the Frenzy potion is −3.5% for it) ([buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset)).

### 7.5 Base values
None measured: attributes and base health 1,467 are D24 placeholders from the mangos emulator's 1.12
rows (Orc 58 / 122 / 92 / 62 / 73; the Human, a hunter only in Forever, the class row), ranged attack
power 2 × 60 − 10 = 110 and attack power 2 × 60 − 20 = 100 before the stats (the Classic formulas;
the core's [OQ-1](../mechanics/ranged-and-pets.md#oq-1-hunter-base-attack-power)), 0% base crit and
dodge and 3.6% base spell crit (RatingBuster's pre-SoD Classic Era table): each "[?] placeholder
(D24); origin: …, not evidence". The rates are [F]: 2 ranged attack power per Agility, 1 attack power
per Strength and per Agility (ChrClasses), 0.0189% crit per Agility, 0.0165% spell crit per
Intellect, 1,720 base mana (PlayerExpectedStat). A Skyborne hunter takes the class row, 55 / 125 / 90
/ 65 / 70, with neutral race offsets, as the other Skyborne classes do: Skyborne's offsets are
unknown, so it's a "[?] placeholder (D24); origin: the mangos class row, not evidence"
([D36](../decisions.md#d36-what-we-take-from-warriorsim-2026-09-25);
[character-stats OQ-1](../mechanics/character-stats.md#oq-1-paladin-druid-and-skyborne-base-attributes)).
5 Agility either way is about 0.5% of Marksmanship DPS.

## 8. Rotation

### 8.1 The common priority

Classic Era's hunter priority, as its community played it: Hunter's Mark at the pull; Auto Shot
throughout, with **Aimed Shot and Multi-Shot woven between Auto Shots** so neither delays one ("no
clipping"); **Arcane Shot** and **Serpent Sting** while mana allows; **Rapid Fire** with the racial and
trinkets on cooldown; a Beast Mastery hunter's **Bestial Wrath** on cooldown and its pet on Claw and
Bite; Trueshot Aura and Aspect of the Hawk before the pull. Forever's shared cooldown means one of
Aimed Shot and Multi-Shot each 6 s, not both.

The sim's list, top first (settings `hunter.<spec>.<ability>.<param>`):

| # | Line | Setting (default) |
| --- | --- | --- |
| 1 | Racial cooldown, on cooldown (off the GCD) | on |
| 2 | On-use trinkets | on |
| 3 | Rapid Fire on cooldown (off the GCD) | on |
| 4 | Bestial Wrath on cooldown, with the talent and a pet (off the GCD) | on |
| 5 | Major Mana Potion, Demonic Rune when their most fits | on, 2,250 and 1,500 missing |
| 6 | Hunter's Mark while it's off the boss | on |
| 7 | The shot on the shared cooldown: Aimed Shot, Multi-Shot or neither; with "Wait for Auto Shot", only when its cast ends before the next Auto Shot aims (`autoShotClear`) | §8.2 |
| 8 | Arcane Shot on cooldown | §8.2 |
| 9 | Serpent Sting while it's off the boss and at least 6 s of the fight is left | on |
| 10 | Sniper Shot on cooldown, with the talent | §8.2 |

The pet walks its own list (§6). Melee weaving (Raptor Strike, Mongoose Bite) isn't simulated: the
hunter stands at range. The Rotation tab shows these lines as a priority list you reorder (§8.3).

### 8.2 First-pass defaults

D27's quick search: 20,000 fights, seed 1, each spec's default setup, over the shot on the shared
cooldown (Aimed or Multi), waiting for Auto Shot, Arcane Shot, and Sniper Shot (Marksmanship). DPS:

| Spec | Before (Aimed, wait, Arcane, Sniper) | Chosen | Runner-up |
| --- | --- | --- | --- |
| Marksmanship | 458.6 | **501.2**: Aimed Shot, wait, no Arcane Shot, no Sniper Shot | 497.7: Multi-Shot, the same |
| Beast Mastery | 480.9 | **485.4**: Multi-Shot, wait, Arcane Shot | 482.2: Multi-Shot without waiting |
| Survival | 405.9 | **421.0**: Aimed Shot, not waiting, no Arcane Shot | 414.2: Aimed Shot, waiting |

Mana decides it: Arcane Shot and Sniper Shot cost more mana than the damage they add while the
hunter runs dry; Beast Mastery, whose pet did a fifth of its damage, keeps Arcane Shot and takes the
cheaper Multi-Shot. The Rotation tab says these are the common priority, not tuned. Since the search,
the pet inherits your attack power, crit and hit (§6): Beast Mastery's pet now does about a third of its
damage and Survival's about a quarter, and the optimizer (D30) retakes these choices.

### 8.3 The priority list

Since M5.65 A2 §8.1's lines are the Rotation tab's priority list
([D31](../decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24);
`HUNTER_APL` in `classes/hunter/rotation.ts`), one list per spec with the same rows, in this order,
each with its switch and its own settings (`hunter.<spec>.…`):

| Row (`id`) | Switch | Its settings | Its conditions, wherever it sits |
| --- | --- | --- | --- |
| Before the pull (`prepull`), pinned first | — | | Aspect of the Hawk, and Trueshot Aura with the talent: static, up all fight (§3.9, §9) |
| Racial cooldown (`racial`) | `racial.enabled` | | on cooldown, off the GCD: Blood Fury, Berserking or Elune's Light (§7.2) |
| On-use trinkets (`trinkets`) | `trinkets.enabled` | | on cooldown, off the GCD |
| Rapid Fire (`rapidFire`) | `rapidFire.enabled` | | on cooldown, off the GCD (§3.7) |
| Bestial Wrath (`bestialWrath`) | `bestialWrath.enabled` | | on cooldown, off the GCD, with the talent and a pet (§3.8) |
| Hunter's Mark (`huntersMark`) | `huntersMark.enabled` | | while it's off the boss (§3.6) |
| Aimed Shot or Multi-Shot (`sharedShot`) | — (its choice's Neither) | `sharedCooldown.shot`, `sharedCooldown.noClip` | on the shared cooldown; with "Wait for Auto Shot", only when its cast ends before the next Auto Shot aims (`autoShotClear`; §3.1, §3.2) |
| Arcane Shot (`arcaneShot`) | `arcaneShot.enabled` | | on cooldown (§3.3) |
| Serpent Sting (`serpentSting`) | `serpentSting.enabled` | `serpentSting.minTimeLeftSec` | while it's off the boss and at least that much of the fight is left (§3.4) |
| Sniper Shot (`sniperShot`) | `sniperShot.enabled` | | on cooldown, with the talent (§3.5) |

- **Pinned:** only the pre-pull. It casts nothing in the fight: Aspect of the Hawk and Trueshot Aura
  are static ranged attack power (§9), so it's there to show what's up from the pull. Its summary
  names Trueshot Aura only with the talent ("Aspect of the Hawk · Trueshot Aura").
- **The shared shot's summary** is the choice, with "between Auto Shots" while it waits for Auto
  Shot; at Neither it reads just "Neither", since there's no shot to wait. At Neither the row's
  "Wait for Auto Shot" is dimmed with the note "Not used: at Neither there's no shot to cast between
  Auto Shots" (docs/ux.md "Rotation"; `hunterUnusedSettings`).
- **Spec-wide, above the list:** the pet's Claw threshold (`pet.clawFocus`, §6), under Core
  abilities with Auto Shot and the pet, which the tab shows without a control; and the Major Mana
  Potion and Demonic Rune with their thresholds, under Consumables. The consumables are off the
  global cooldown and take their turn **just before the list's first row on it** (Hunter's Mark or
  a shot), wherever that row sits, even when it's off: in the default order that's after Bestial
  Wrath, where they were before the list (§8.1 row 5).
- **No named rotations:** the implicit Default preset only, the common priority (D27).
- **Equivalence:** in the default order each spec's plan is the one it had before the list, byte for
  byte: 200 random setups a spec (settings, talent builds with ranks taken off so Lone Wolf, Bestial
  Wrath, Sniper Shot and Trueshot Aura come and go, race, on-use trinkets, the mana consumables, the
  fight and the rules) are fingerprinted against the code before it (`hunter-apl.test.ts`).
- **What reordering does,** in each default setup (seed 60301, 20,000 paired fights): Rapid Fire
  anywhere changes nothing (it's off the GCD). Serpent Sting above the shared shot costs Survival
  1.2% (its Aimed Shot doesn't wait for Auto Shot, so the sting takes its place) and Beast Mastery
  0.1%, and changes nothing for Marksmanship; Arcane Shot above Multi-Shot costs Beast Mastery 0.3%.
  Hunter's Mark last, so the pull opens with a shot, gives Marksmanship +0.6% and Beast Mastery
  +0.1%, and costs Survival 0.1%: a lead for the optimizer (D30), not a change to the common priority.

## 9. Implementation notes

- **Ranged spec** (`SpecMeta.ranged`): Auto Shot from the ranged slot, no melee swings; the plan
  refuses a setup without a bow, gun, crossbow or thrown weapon (the core's blocker).
- **Shots** are `spell` rows whose `SpellDef.ranged` rolls the ranged table; Aimed Shot, Multi-Shot
  and Sniper Shot have `castRangedHasted`; Aimed Shot and Multi-Shot share a `category`.
- **Buffs you keep**: Aspect of the Hawk and Trueshot Aura are static ranged attack power (up all
  fight from before the pull); Hunter's Mark is an aura with `rap` on you that the rotation keeps up;
  Rapid Fire, Quick Shots and Berserking are `rangedHaste` auras; Blood Fury adds `rapPct`.
- **Engine additions** (optional, absent for every other spec): `rapPerInt` (Careful Aim) in the
  stat pipeline; the `ranged` effect's `critDamagePct` (Mortal Shots on Auto Shot); a character
  sheet's `ranged` block (ranged attack power, crit, hit, shot speed, weapon skill, ammo); the gear's
  **ammo** and **quiver** slots, a quiver's `rangedAttackSpeed` and the ammo's DPS when it fits the
  weapon (arrows for bows and crossbows, bullets for guns).
- **The pet** is `ClassRotation.pet` (`classes/hunter/pet.ts`); Frenzy is a `petCrit` proc, which
  rolls on the pet's stream (`STREAM.pet`), so it never moves your rolls.
- **Not simulated**: melee weaving, Summon Hawk, Scatter Shot, traps, Volley and Multi-Shot's extra
  targets, other pet families, the pet dying or its happiness changing.

## 10. Worked examples

Profile `forever`; numbers not sourced above are the example's.

**WE-H1: Aimed Shot's hit.** Bloodseeker (85–128, 3.3 s), Thorium Headed Arrows (17.715), 1,000 ranged
attack power, no talents, no armor: (85 + 128) / 2 + 17.715 × 3.3 + 1000 / 14 × 2.8 + 166 = 106.5 +
58.46 + 200 + 166 = **530.96**; Barrage 3/3 ×1.10 = **584.06**.

**WE-H2: Mortal Shots.** 5/5 raises a shot's crit ×2 to 1 + 1 × 1.30 = **×2.3**, Serpent Sting's
tick crit (×2, §3.4) included. A ×1.5 crit would go to 1 + 0.5 × 1.30 = ×1.65.

**WE-H3: Efficiency 5/5.** Aimed Shot 310 → ⌊263.5⌋ = **263**; Multi-Shot 239 → **203**; Arcane Shot 190
→ **161**; Serpent Sting r8 230 → **195**; Hunter's Mark (**60**) and Sniper Shot (**365**) stay.

**WE-H4: Improved Stings 3/3.** Serpent Sting r8's tick 83 × 1.20 = **99.6**, **498** over 15 s.

**WE-H5: ranged attack power.** A naked Orc hunter (122 Agility) with Aspect of the Hawk r5: 110 + 2 ×
122 + 90 = **444**; with Careful Aim 5/5 and 62 Intellect, **506**; Hunter's Mark, **577**.

**WE-H6: Quick Shots.** Deadly Aspects 5/5: **10%** of Auto Shots that land. With a 15% quiver and
Rapid Fire, a 3.3 s weapon shoots every 3300 / (1.15 × 1.40 × 1.30) = **1,577 ms** (the core's WE-4).

**WE-H7: the Beast Mastery cat.** Its damage multiplier: 1.10 × 1.25 × 1.15 (Unleashed Fury 5/5) ×
1.02 (Focused Fire 2/2) = **1.612875**; Focus 5 × 1.20 = **6 a second** with Bestial Discipline 2/2.

**WE-H9: what the Beast Mastery cat inherits** ([ranged-and-pets §6.1](../mechanics/ranged-and-pets.md#61-what-a-pet-inherits-from-you)).
The default Beast Mastery setup at the pull: 1,118 attack power, 1,468 ranged attack power, 22.96%
crit and 6% hit, melee and ranged alike; the cat's own 252 attack power + Battle Shout's 115 (rank 6,
D36) = 367, 5% + Ferocity's 10% crit, and no hit. Its attack power 367 + 0.1 × 1,468 = **513.8**; its
crit 15 + 22.96 = **37.96%**; against a level-63 boss its specials crit 37.96 − 0.6 (its skill of 300) −
1.8 (aura crit) = **35.56%**, and its swings and specials miss 8 − 6 = **2%**. With 1,000 more melee
attack power (2,118), the melee side is the higher: 367 + 211.8 = **578.8**.

**WE-H8: Rapid Fire with Rapid Killing 2/2**: 300 − 120 = **180 s**; Improved Arcane Shot 5/5: 6 − 1.5
= **4.5 s**.

## 11. Open questions

### OQ-H1: Serpent Sting's crits
The flag says its ticks crit, and the beta logs show them at ×2, a shot's multiplier (§3.4) [?]. Which
crit chance (spell or ranged) is still [?]: the sim uses spell crit, ×2 (×2.3 with Mortal Shots). Test:
a log of 200 ticks at a known spell and ranged crit, and whether Mortal Shots raises a tick's crit.

### OQ-H2: Careful Aim
Two new auras (580, 598, misc 3) and "Attack Power" in the text: whether both melee and ranged attack
power get Intellect is [?]. Test: the sheet's ranged attack power with and without the talent.

### OQ-H3: Trueshot Aura's ranks
Rank 4 (+75) is above rank 5 (+50), and the talent's rank 1 is +30. The sim uses the level-60 trainer
rank's +50 [F]. Test: the buff's tooltip in game.

### OQ-H4: Focused Fire and Ranged Weapon Specialization
Focused Fire's +2% is a server script (aura 4); Ranged Weapon Specialization's aura 79 may be all your
damage while you hold a ranged weapon rather than the weapon's. The sim reads their texts. Test: Arcane
Shot's damage with and without each.

### OQ-H5: Summon Hawk
Its hawk's attacks after the first dive are a creature's the client doesn't describe, so it isn't
simulated; it shares Arcane Shot's cooldown, which the defaults don't use for Marksmanship and Survival.

### OQ-H6: Season of Discovery rows
Heart of the Lion (409580: +10% stats), Aspect of the Viper and Aspect of the Falcon have hunter
`SkillLineAbility` rows in the Forever client, identical to the Classic Era client's Season of
Discovery rows. Does Forever teach them? Test: the trainer and spellbook in game.

### OQ-H7: the pet
Its base numbers, inheritance, Focus rate, table and buffs are the core's OQ-5 to OQ-8. With Lone Wolf
the Marksmanship default doesn't depend on them; Beast Mastery's pet is about a third of its damage,
Survival's about a quarter. Its inheritance is the core's one rule (§6.1): without it Beast Mastery loses 13%
and Survival 9%. Battle Shout on it is worth 24.6 DPS (4.4%) on Beast Mastery, and Forever testers
report pets can't receive external buffs (§6; the core's OQ-8). Test: the pet's sheet with and without
Battle Shout, and with two owner gear sets.

### OQ-H8: Aspect of the Hawk rank 6
Rank 6 (14322, level 58) is +55 ranged attack power in every Forever client read (1.60.1.69913 to
70009), under rank 5's +90 (Classic Era's rank 6 is 110). Ahn'Qiraj's rank 7 is out (D36), so the sim
casts rank 5 (+90) [?]; if the server applies 110 to rank 6, the hunter's aspect is 20 more ranged attack
power (about 1% of DPS). Test: rank 6's buff tooltip and the sheet's ranged attack power with rank 5
and rank 6.

### OQ-H9: Arcane Shot and Serpent Sting scaling
Neither Forever client spell carries a coefficient (Arcane Shot lost Classic Era's 0.429 spell damage;
Serpent Sting's 0.2 went too) [F], so the sim deals their flat damage: 217, and 83 a tick. The public
beta logs show more at low level: Arcane Shot rank 1 (20) hits for 26–38, rank 3 (39) for 56–75, and
Serpent Sting rank 1 (2 a tick) ticks for 3–6, over 422 shots and 527 ticks from dozens of hunters.
The extra grows with the log's attack-power field, most likely ranged attack power, but that field is
the melee one and not the sheet's, so no coefficient is measured and the sim adds none [?]. Test: at
two known sheet ranged attack powers (a buff, gear), log each's hits with no talents that change them;
the difference in damage over the difference in attack power is the coefficient.

## Sources

- [client] Forever beta client 1.60.1.69913 and Classic Era 1.15.9.69722 through the wago.tools API
  ([data/client.md](../data/client.md)): SpellEffect, SpellMisc, SpellCastTimes, SpellCooldowns,
  SpellCategories, SpellPower, SpellDuration, SkillLineAbility, TraitDefinitionEffectPoints,
  CurvePoint, ChrClasses, PlayerExpectedStat, ItemDamageAmmo, ItemSparse.
- The pre-raid list: Wowhead's [Classic Hunter pre-raid BiS guide](https://web.archive.org/web/20210516173218/https://classic.wowhead.com/guides/wow-classic-hunter-dps-pre-raid-best-in-slot-gear) (archived 2021-05-16).
- D24 placeholders: [mangos player_levelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql)
  and [player_classlevelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql);
  [RatingBuster at d11164c](https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua). Not evidence.
- The core's sources for the ranged table, Auto Shot, the pet and Focus ([ranged-and-pets.md](../mechanics/ranged-and-pets.md#sources)).
- <a id="beta-logs"></a>**Public beta combat logs** (build 1.60.1, 18–25 Sep 2026), third-party
  logs re-read on 2026-09-26 for §3.3, §3.4, OQ-H1 and OQ-H9 [?]
  ([D22](../decisions.md#d22-reproducible-log-analyses-can-set-server-side-forever-defaults-2026-09-23)):
  [tzcnt/forever-data @c7d1746][fd-logs]; the logs attached to
  [forever-bugs#81][fb-81] (`resistances.txt`, `Fireball Vuln Test.txt`) and
  [forever-bugs#54][fb-54]; those attached to [magey/forever-warrior#4][fw-4] and its
  [discussions][fw-disc] (the 23–25 Sep logs and discussion 13's Fishliver logs);
  [Marrow's labelled logs][marrow-logs] (the `tarch_uw*` set); and [1337LutZ's gist][lutz-gist].
  **Method:** each `SPELL_DAMAGE` (Arcane Shot) or `SPELL_PERIODIC_DAMAGE` (Serpent Sting) event a
  player's hunter logs with the crit flag, its amount with any resisted, absorbed or overkill part
  added back, over the base amount the advanced log records for that hit. The ranges quoted use
  hits of 9 or more whose crit didn't overkill, since smaller ones round too coarsely; the crit
  rates are crits over all the hunters' ticks or shots of that spell.
- [fh-changes] The forever-hunter wiki, [Forever Beta Changes](https://github.com/classic-hunter/forever-hunter/wiki/Forever-Beta-Changes):
  the testers' report of the pet's inheritance [?] (secondary).

[fd-logs]: https://github.com/tzcnt/forever-data/tree/c7d17462c50d1eb0103aa5e2aff52f77f33e3418/raw-logs
[fb-81]: https://github.com/ClassicWoWCommunity/forever-bugs/issues/81
[fb-54]: https://github.com/ClassicWoWCommunity/forever-bugs/issues/54
[fw-4]: https://github.com/magey/forever-warrior/issues/4
[fw-disc]: https://github.com/magey/forever-warrior/discussions
[marrow-logs]: https://github.com/ppach/marrow.github.io/tree/master/eternal/data/logs
[lutz-gist]: https://gist.github.com/077264a1aada001889e5ce0f47674623
