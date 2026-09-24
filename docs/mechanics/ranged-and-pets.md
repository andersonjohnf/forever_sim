# Ranged and pets: the ranged and pet core

How a level-60 player's ranged weapon and pet fight a level-63 raid boss: the ranged attack table,
ranged attack power, Auto Shot's timer and how casts hold it back, ranged haste from quivers and
auras, shots with the ranged weapon, and a pet as a second attacker with its own stats, swings,
abilities and power. It's the shared engine for the Hunter's three specs and the Demonology
Warlock's demons (slice H1 of [M5.5](../milestones.md#m55-every-other-dps-spec-d27-), the last shared
core under [D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)).
The class docs own each class's shots, pets, talents and rotation; this doc owns the rules they
share. It extends [combat-tables §3](combat-tables.md#3-special-yellow-attacks) (the `Ranged` defense
type) and [damage-and-timing §2–§3](damage-and-timing.md#2-weapon-damage) (weapon damage, swing
timers), and doesn't repeat them.

The Forever client keeps Classic Era's ranged data where the sim can read it (Auto Shot, quiver haste,
ammo damage, Focus), and changes the hunter around it: Aimed Shot is a 2.0 s cast, Multi-Shot a
0.5 s cast that shares its 6 s cooldown, the hunter's attack power rates are in its class table, pets
have new and reworked abilities, and the demons' spells deal about half their Classic Era damage
([WoW Forever deviations](#wow-forever-deviations)). Neither client holds Auto Shot's wind-up, the
pets' base stats or how much of your stats a pet inherits: those are server-side, so they're [?]
until the guild measures them ([Open questions](#open-questions)).

Status: researched 2026-09-24 · Forever client builds 1.60.1.69977 (1.60.1.69913 where that build has
the table) · Classic Era 1.15.9.69722 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified ·
engine: the ranged and pet core (slice H1, [Implementation notes](#implementation-notes)); the Hunter
(H2, [hunter.md](../classes/hunter.md)) uses it, and the Demonology Warlock comes next

---

## What the sim needs

- A **ranged weapon** with its own timer beside any melee swings: Auto Shot fires every hasted
  weapon speed ([§4](#4-auto-shot-the-timer-the-wind-up-and-clipping)).
- The **ranged table**: the special-attack miss, no dodge, parry or glancing, a block from the
  front, then a crit roll with melee's +3 suppression ([§2](#2-the-ranged-attack-table)).
- **Ranged attack power** and ranged weapon damage with ammo and a scope
  ([§3](#3-ranged-attack-power-and-damage)); ranged haste from a quiver and auras, multiplied.
- **Shots**: ranged abilities on the ranged table, some with cast times that hold Auto Shot's
  wind-up back ([§5](#5-shots)).
- A **pet**: its own stats, attack table, white swings, abilities on its own power, owner buffs
  that reach it, and its damage counted in your DPS on rows that name it
  ([§6](#6-pets-stats-and-white-swings)–[§10](#10-pet-damage-in-the-results)).

---

## 1. Ranged weapons, ammo and quivers

| Rule | Value | Tag |
| --- | --- | --- |
| Weapons Auto Shot fires | bows, guns and crossbows (Auto Shot 75's `SpellEquippedItems`: weapon subclass mask 262156); thrown weapons have their own Throw, which the sim treats as Auto Shot | [F] [client] (SpellEquippedItems, 1.60.1.69977); thrown [?] |
| Ammo | arrows for bows and crossbows, bullets for guns. The client stores ammo damage per second in `ItemDamageAmmo[item level].Quality[q]`, the same table in both builds; Forever's `ItemSparse` has no damage fields | [F] [client] (ItemDamageAmmo, ItemSparse, 1.60.1.69977); [C] (1.15.9.69722) |
| Quivers and ammo pouches | ranged attack speed from their equip spell's aura **557** (no spell in either build uses aura 141): Quickdraw Quiver and Thick Leather Ammo Pouch 13%, Harpy Hide Quiver, Gnoll Skin Bandolier and Ancient Sinew Wrapped Lamina 15%, Ribbly's Quiver and Bandolier 14% (no Forever row); a quiver holds arrows, an ammo pouch bullets | [F] [client] (ItemXItemEffect, SpellEffect, 1.60.1.69977); [C] |
| The item pool | 11 bows, 7 guns, 5 crossbows and 2 thrown weapons, from the D10 rule; since H2, 12 kinds of ammo and 7 quivers and ammo pouches in their own `ammo` and `quiver` slots ([items.md](../data/items.md#ammo-and-quivers)), and the hunter's pre-raid list | [F] (`src/data/items/pre-bis.json`) |

Endgame and pre-raid ammo, damage per second from the table, min–max as the client rounds it
([items.md](../data/items.md)):

| Ammo | Item level, quality | DPS (table) → min–max | Forever row |
| --- | --- | --- | --- |
| Thorium Headed Arrow 18042, Thorium Shells 15997 | 57, uncommon | 17.715 → 17–18 | yes, unchanged |
| Ice Threaded Arrow 19316, Ice Threaded Bullet 19317 | 54, uncommon | 16.788 → 16–17 | yes, unchanged |
| Jagged Arrow 11285, Accurate Slugs 11284 | 45, common | 13.028 → 13 | yes, unchanged |
| Rockshard Pellets 11630, Doomshot 12654, Miniature Cannon Balls 13377 | 52–61, rare | 18.03, 20.244, 20.901 | **none** (D6 fallback) |
| Swiftfeather Arrow 274387, Swiftstrike Shot 274388 | 65, epic, BoP, level 60 | 24.617 → 12–37 and 24–25 | **new in Forever** |

All [F] [client] (ItemDamageAmmo, ItemSparse, 1.60.1.69977) and [C] (1.15.9.69722). Which ammo a
level-60 raider uses is the class slice's default, and whether the server reads the table's DPS or
the rounded min–max ((17 + 18) / 2 = 17.5) is [?] ([OQ-3](#oq-3-ammo-damage)).

**Proficiency.** A level-60 hunter uses bows, guns, crossbows and thrown weapons, mail from level 40,
and axes, swords, daggers, fist weapons, polearms and staves [C]. `PROFICIENCY` (`sim/equip.ts`) is
keyed by `ClassId`; the hunter's row (H2, [hunter.md](../classes/hunter.md#72-race)) also fills the
ammo and quiver slots.

## 2. The ranged attack table

| Rule | Value | Tag |
| --- | --- | --- |
| Order | roll 1: **miss**, then **block** (from the front), else it lands; roll 2: **crit** on anything that landed | [?] [combat-tables §3](combat-tables.md#3-special-yellow-attacks) "Ranged"; a Classic Era hunter wiki asserts two rolls ([wys-table]) |
| Dodge, parry | **none**: creatures dodge and parry melee attacks only. About 1,150 white Auto Shots on +3 mobs on the 1.13 beta logged no dodge or parry (~75 dodges were due if they could) | [F] tooltips `CR_DODGE_BASE_STAT_TOOLTIP`, `CR_PARRY_BASE_STAT_TOOLTIP` ([gs][gs-forever]); [C] ([wys-table]) |
| Glancing | **never**: only white melee swings glance | [C] ([combat-tables §2.3](combat-tables.md#23-glancing-blows)) |
| Miss vs +3 at 300 skill | the special-attack miss: **8%**; `classicEra` ignores the first 1% of hit while defense − skill > 10, so its cap is 9% | [F] tooltip; [C] ([bnet-hit], applied to ranged by [wys-table]: 10.43% ±2.59 at 300 skill, n = 566, and 6.01% ±1.97 at 305, n = 582) |
| Block | from the front only, the boss's 5%, a blocked shot deals full damage (mob block value 0) | [F] tooltip `STAT_BLOCK_VALUE_FLAT_TOOLTIP`; rate [?] ([combat-tables §2.4](combat-tables.md#24-attacking-from-behind-vs-the-front)) |
| Crit | the sheet's crit plus the ranged weapon's own (a scope, a ranged-only talent), less the +3 suppression: the skill part and up to 1.8% of aura crit, as melee's | [C] ([magey-crit]: 8,075 Auto Shots on +3, 5.02% suppressed at 300 skill, 3% + ~1.8%) |
| Crit damage | **×2**; talents raise it per their class doc | [F] `STAT_CRIT_BONUS` ([gs][gs-forever]); [C] |
| Hit and crit stats | Forever's one hit and one crit rating serve melee, ranged and spells ([combat-tables §6](combat-tables.md#6-hit-caps)) | [F] as displayed; in combat [?] |

The weapon skill is 5 × level plus the item bonuses of its type (Bows, Guns, Crossbows, Thrown); no
Forever racial adds any ([combat-tables §4.1](combat-tables.md#41-effects-per-point)).

## 3. Ranged attack power and damage

| Rule | Value | Tag |
| --- | --- | --- |
| Ranged attack power | `floor((base + rate × Agility + flat) × Π(1 + %))`, its own stat beside melee's. The Forever client's `ChrClasses` gives the hunter **2 ranged attack power per Agility**, and 1 melee attack power per Strength and per Agility (warrior 2 / 0 / 2, rogue 1 / 1 / 2); Classic Era's client leaves the fields 0 | [F] [client] (ChrClasses, 1.60.1.69977); the base is [?] ([OQ-1](#oq-1-hunter-base-attack-power)) |
| Hunter crit per Agility | **0.000189** per point, 52.9 Agility per 1% | [F] [client] (PlayerExpectedStat, 1.60.1.69977) |
| Gear | "+x Attack Power" (Forever's `ItemSparse` stat 38, and the set bonuses' and "against <type>" lines when the boss is that type) adds to melee and ranged attack power both; "+x Ranged Attack Power" (stat 39, or a Classic Era item's surplus over its melee line) to ranged only. A ranged weapon's own "+x damage" adds to its shots, never a melee weapon's | [F] ([items dataset](../data/items.md)) |
| Auto Shot damage | `weapon roll + ammo DPS × weapon speed + scope + RAP / 14 × weapon speed`, at the weapon's real speed | [?] ([wys-formulas]; Classic Era community, 2019–20) |
| Normalized shots | a shot whose client effect is "normalized weapon damage" (effect 121: Aimed Shot, Multi-Shot) takes `RAP / 14 × 2.8`; the ammo still adds its DPS × the real speed | 121 [F] [client] (SpellEffect); 2.8 [?] ([wys-formulas]) |
| Multipliers | the ranged damage multiplier (a ranged-weapon talent), your physical multipliers, the boss's armor at your level | [C] ([damage-and-timing §2.6](damage-and-timing.md#26-order-of-operations-physical-direct-hit)) |
| Rage | ranged attacks give none | [?] (no rage user shoots in the sim) |
| Threat | damage × your threat multiplier, like a white swing | [C] ([threat.md](threat.md)) |

## 4. Auto Shot: the timer, the wind-up and clipping

| Rule | Value | Tag |
| --- | --- | --- |
| The spell | Auto Shot (75): auto-repeat, the ranged slot, `DefenseType` ranged, effect 58 (weapon damage), **cast time 0**, no cooldown and no GCD, 8–35 yards; unchanged in Forever | [F] [client] (Spell, SpellMisc, SpellCastTimes, SpellCategories, SpellEffect, 1.60.1.69977); [C] |
| Cycle | one Auto Shot every **weapon speed ÷ ranged haste**. Its last part is a **0.5 s wind-up** that needs you standing still and not casting; the rest is the reload, during which you may move and use instants | [C] (Blizzard's "Not a Bug" list [nab]; [retry]; YaHT at a Classic commit, [yaht]); the client holds no wind-up (cast time 0), so it's server-side [?] |
| Is the wind-up hasted? | the sim keeps it at 0.5 s (`windupHasted` false): a Classic Era swing-timer addon does; two later sims divide it by haste. The whole cycle is the same either way; only the window a cast can clip differs | [?] ([OQ-4](#oq-4-auto-shot-and-casts)) |
| Casts and channels | the reload runs on through a cast and is **not reset**, but the wind-up can't run while you cast: if the reload ends mid-cast, the wind-up starts when the cast ends. That delay is **clipping**. A cast that ends before the reload does delays nothing | [C] consensus ([retry]; [yaht]; [nab]) · [?] in Forever: testers report Auto Shot firing through Aimed Shot and Multi-Shot ([fbugs] #76, #43) |
| Instants | don't touch the timer | [?] ([retry]) |
| Ranged haste | multiplies: a quiver or ammo pouch (§1), Rapid Fire +40% (15 s, 5 min, off the GCD), Quick Shots +30% (12 s), Berserking's ranged part; the static "attack speed" effects that cover melee and ranged (haste rating, Minor Haste, Skyborne) too; melee-only auras (Flurry, Slice and Dice) don't. A change applies from the next shot | Rapid Fire 40% [F] [client] (SpellEffect aura 140, 1.60.1.69977) and [C] ([wh-rapid]); Quick Shots [C] ([wh-quick]); multiplying [?] |
| The first shot | at the pull, like a melee swing | [?] (an engine choice) |
| The retry timer | a wind-up that can't start (you moved) retries every 0.5 s. The sim's hunter never moves, so it's not modelled | [C] ([nab]) |
| Latency | 0 ms, as everywhere in the sim | [?] ([damage-and-timing §3.6](damage-and-timing.md#36-server-tick-and-spell-batching)) |

**Forever's Aimed Shot is a 2.0 s cast** (Classic Era: 3.0 s in its tooltip, measured 3.5 s with a
hidden 0.5 s, and shortened by quiver haste: 3,496 ms with none, 3,158 with 10%, 3,049 with 13%
[C] ([aimed-35]), against a Blizzard note that it isn't [?]). The sim shortens a shot's cast by
ranged haste when its row says so (`castRangedHasted`) [?]. **Multi-Shot** is a 0.5 s cast in Forever
[F]; Classic Era's is "Instant" with a hidden ~0.5 s [C] ([multi-cast]).

## 5. Shots

A shot is a ranged ability on the ranged table (§2), `DefenseType` 3 [F] [client] (SpellCategories,
1.60.1.69977): Aimed Shot, Multi-Shot, Arcane Shot, the stings, Volley. What each one deals is the
hunter's class doc; the core resolves three kinds:

- **Weapon shots** (Aimed Shot, Multi-Shot, Forever's Sniper Shot): the ranged weapon's damage (§3),
  normalized or not, plus the shot's bonus, physical, against armor.
- **School shots** (Arcane Shot): the shot's damage in its school, on the ranged table, with the
  school's multipliers and the boss's average resist, no armor [?].
- **Stings** (Serpent Sting): a pure DoT; the hit roll (§2 roll 1) lands it, and it rolls no crit.

Shots are on the 1.5 s GCD, not hasted, and Auto Shot is off it [F] [client] (SpellCooldowns
`StartRecoveryTime` 1500, 1.60.1.69977). A shot fires the ranged procs (§9), not the melee or spell
ones.

**Steady Shot isn't in the game.** The Forever client has it only as Season of Discovery rune data
(437123, "Engrave Belt – Steady Shot" 410109), with no `SkillLineAbility` row for any class in either
build [F] [client] (SpellName, SkillLineAbility, 1.60.1.69977); it came in patch 2.0.3, after Classic
[C] ([wiki-steady]). The sim has none.

## 6. Pets: stats and white swings

A pet is a second attacker in your fight: its own stats, table, swing timer, abilities, power and
random stream. Its class doc gives its numbers; the rules here are shared.

| Rule | Value | Tag |
| --- | --- | --- |
| Inheritance | **Classic Era: none.** Pets took a share of their owner's stats from patch 2.0.1 on ([wiki-201], for the date only). **Forever** ships "Hunter Pet Scaling" (415429) and "Warlock Pet Scaling" (416189) auras with every amount 0 in the client, and new aura types (max health, melee haste, dodge): the amounts are server-side. Forever testers report 10% of the hunter's higher attack power and all of its crit ([fh-changes]) | [C] by inference ([bnet-petdps]; players' reports); Forever's auras [F] [client] (SpellEffect, 1.60.1.69977); their amounts [?] ([OQ-6](#oq-6-pet-stats-and-inheritance)) |
| Base stats at 60 | not in either client. A Classic Era player reported a level-60 hunter pet's base damage as 22.9 DPS and its attack power as 252 (2 × 136 Strength − 20) | [?] ([bnet-petdps]; [OQ-6](#oq-6-pet-stats-and-inheritance)) |
| Attack speed | most hunter pets 2.0 s; faster ones deal proportionally less a hit | [C] ([petopia-speed]); Forever reports pets aren't normalized [?] ([fbugs] #31) |
| Family and happiness | a family's damage modifier (cat ×1.10) and Happy ×1.25, Content ×1, Unhappy ×0.75, all in the pet's damage multiplier; loyalty changes only training points | cat and happiness [C] ([wt-pets]); loyalty [C] ([petopia-train]); other families [?] |
| Its table | the player formulas of combat-tables §2–§4 at the pet's level and skill (5 × its level): miss, dodge, parry and block from the front, glancing (40% vs +3) for a pet whose white swings glance, crit less the +3 suppression, as a player's | [?] no Classic Era measurement ([OQ-7](#oq-7-the-pets-attack-table)) |
| Position | behind the boss by default (no parry or block); a class can put it in front | [?] |
| White damage | `(roll + its AP / 14 × its speed) × its damage multiplier × armor at its level`, crit ×2 | [?] ([wys-formulas]) |
| Its haste | its own attack speed, and your auras' pet haste (Frenzy: +30% for 8 s) | Frenzy [F] [client] (SpellEffect, 1.60.1.69977) |

## 7. Pet abilities and power

| Rule | Value | Tag |
| --- | --- | --- |
| Focus | a hunter pet's power: maximum **100**, `RegenCombat` **10** in both clients. The unit is unclear: Classic Era players measured about 5 a second (26 every ~5.2 s); Forever testers report a steady 10 a second | [F] [client] (PowerType 3, 1.60.1.69977); [C] same row; the rate [?] ([OQ-5](#oq-5-focus-regeneration)) |
| Demons' mana | an Imp's or Succubus's own pool and regeneration, from its class doc | [?] |
| Claw (max rank 3009) | 25 Focus, no cooldown, 1.5 s GCD, 43–59 Physical (Forever 51 ±31%), melee table | [F] [client] (SpellEffect, SpellPower, 1.60.1.69977); [C] ([wh-claw]) |
| Bite (17261) | 35 Focus, 10 s cooldown, 81–99 (Forever 90 ±20%) | [F] [client]; [C] ([wh-bite]) |
| Its GCD | its own, per ability (1.5 s for the hunter pet's) | [F] [client] (SpellCooldowns) |
| A pet spell | the spell table at the pet's level and spell hit, the school's average resist, a crit ×1.5; a cast time holds only the pet (the Imp's Firebolt: 2 s) | Firebolt [F] [client] (SpellCastTimes); the rest [?] |
| A buff ability | one with no target (Furious Howl's party buff): no roll, no damage and no `petLanded`; it puts its aura up (`kind: 'buff'`) | the sim's |
| Its choices | the pet walks its own priority list whenever it could act: an ability off cooldown, affordable, its GCD free, the line's conditions true (keep Focus for Bite: §11) | the sim's |

## 8. How owner buffs reach the pet

- **Raid buffs.** Battle Shout reaches pets in the party [C] ([nab]). Which other buffs do (blessings,
  Mark of the Wild, Leader of the Pack, totems, consumables) is [?], and Forever testers report that
  pets can't be buffed at all and scrolls don't work on them [?] ([fbugs] #27, #41). The core applies a
  Buffs-tab entry to the pet only if it's on its list (`PET_BUFFS`: Battle Shout), with its stats,
  attack speed and damage; a class slice adds what its doc sources ([OQ-8](#oq-8-buffs-on-pets)).
- **Debuffs on the boss** reach the pet as they reach you: the boss's armor after the Buffs tab's
  and your own armor debuffs, and its damage taken by school [C] (they're on the target).
- **Your auras and procs.** An aura can carry pet mods: attack power, crit, attack speed and damage
  (Bestial Wrath's +50%, Frenzy's +30% speed, a howl that buffs you both). A proc on your attacks can
  put one up, or give the pet power ([§9](#9-procs)).
- **Your stats.** A pet with shares of your attack power, ranged attack power or spell damage (§6)
  reads them whenever they change.

## 9. Procs

| Trigger (code) | When | Tag |
| --- | --- | --- |
| `rangedLanded` (22) | an Auto Shot or a shot landed (a hit, crit or block) | the sim's |
| `autoShotLanded` (23) | an Auto Shot landed: Improved Aspect of the Hawk's Quick Shots, 5% at 5/5 ("normal ranged attacks") | [C] ([wh-quick]) |
| `rangedCrit` (24) | a ranged crit, Auto Shot or a shot | the sim's |
| `petLanded` (25) | the pet's attack landed, white or special | the sim's |
| `petCrit` (26) | the pet's attack crit: Frenzy, Ferocious Inspiration | the sim's |

The action `petPower` (22) gives the pet power. Ranged attacks fire no melee procs (Hand of Justice,
a weapon enchant's) [?]. A PPM proc on a ranged trigger takes its chance from the ranged weapon's
speed ([damage-and-timing §5.1](damage-and-timing.md#51-ppm-formula)); the pet's triggers roll their
chances on the pet's random stream ([Implementation notes](#implementation-notes)).

## 10. Pet damage in the results

A pet's damage counts toward your DPS, on breakdown rows labelled with the pet's name ("Auto attack ·
Cat", "Claw · Cat"), and makes none of your threat (a pet's threat is its own). Its crits and misses
show on its rows as yours do. [?] (the convention of Classic Era sims and logs)

## 11. Rotation conditions

| Condition (code) | Holds when | Why |
| --- | --- | --- |
| `autoShotClear` (62) | ability `a`, started now, ends `b` ms or more before the next Auto Shot's wind-up begins; an instant always | a cast shot that clips no Auto Shot |
| `autoShotWithin` (63) | the last Auto Shot fired at most `a` ms ago | a shot right after an Auto Shot |
| `petPowerAtLeast` (64) | the pet's power ≥ `a` tenths | a pet line keeping Focus for Bite |
| `petPowerAtMost` (65) | the pet's power ≤ `a` tenths | spend before Focus caps |

An Auto Shot is a decision point for a rotation with 62 or 63. The pet's lines read 64, 65 and your
auras up or down (`auraUp`, `auraDown`).

## 12. What a class slice uses

The API the Hunter (H2) and Demonology (warlock) slices build on:

- **The ranged weapon**: set `SpecMeta.ranged` on the spec. `buildPlan` then makes `Plan.ranged` from
  the Gear tab's ranged slot with `rangedPlan` (`sim/plan/ranged.ts`), its skill, and the setup's
  `ranged` effects, and swings no melee weapon (its stats still count). Auto Shot gets its own row.
  An empty ranged slot, or one with a wand, is a blocker ("Add a ranged weapon…"), not 0 DPS.
  `AUTO_SHOT` holds the wind-up, clipping, normalization and crit rules; `windupHasted` and
  `castsHoldAutoShot` switch the two [?] models.
- **Effects** (`Effect`): the stats `rap` and `rapPerAgi`, `mult` `rap`, and
  `{ kind: 'ranged', hit, crit, damagePct, hastePct, flatDamage, ammoDps }`: a scope, a ranged
  talent, the ammo's DPS and a quiver's haste. Items' and set bonuses' "+x Attack Power" reaches `ap`
  and `rap`, their `rangedAttackPower` `rap` only (§3). The class's
  base ranged attack power goes in its stat block (`baseRap`, `rapPerAgi`).
- **Shots**: a `spell` ability whose `SpellDef` has `ranged: true` and `defense: 'ranged'`:
  `weaponPercent`, `normalized`, `min`–`max` (the shot's bonus), `critMultiplier`; a pure DoT for a
  sting. The row's `castMs` with `castRangedHasted` for Aimed Shot, and `category` for Aimed Shot and
  Multi-Shot's shared cooldown ([spells.md §12](spells.md#12-what-a-class-slice-uses) for the rest).
- **Auras** (`AuraSpec.mods`): `rap`, `rapPct`, `rangedHaste`; and the pet's `petAp`, `petCrit`,
  `petHaste`, `petDamage`.
- **Procs** (`ProcSpec`): the triggers of §9 and the action `{ kind: 'petPower', amount }`.
- **The pet**: return a `PetDef` (`sim/plan/pet.ts`) as `ClassRotation.pet`: its base stats (as stat
  block fields), melee, damage multiplier (family, happiness, talents), shares of your stats,
  whether it glances and where it stands, its power, its abilities (`melee`, `spell`, or `buff` for
  one with no target, each with an optional aura), and its priority list. `petPlan` derives its stats, adds the buffs that reach it
  (`PET_BUFFS`), and gives it rows that name it.
- **Conditions**: §11.

---

## WoW Forever deviations

From the Forever client against Classic Era's (1.60.1.69977 vs 1.15.9.69722), [F] [client] unless
tagged:

- **Aimed Shot**: a 2.0 s cast (3.0 s), +166 at its top rank (600), a baseline spell rather than a
  talent, sharing a 6 s cooldown with Multi-Shot (category 2).
- **Multi-Shot**: one rank, a 0.5 s cast (instant), no bonus damage (150), 13.9% of base mana, the
  shared 6 s cooldown (its own 10 s).
- **Arcane Shot**: 217 Arcane with no coefficient (183, coefficient 0.429), its own 6 s category
  (1173) shared with Summon Hawk.
- **Volley**: no cooldown (60 s), an area trigger dealing 112 / 91 / 70 Arcane a tick by rank.
- **Sniper Shot**, new: a 4.0 s cast, 15 s cooldown, weapon damage + 160 / 225 / 295.
- **Trueshot Aura**: ranged attack power only, five ranks (30 / 40 / 50 / 75 / 50; the last looks like
  a data slip); Hunter's Mark 71 (110); Rapid Fire also +40% melee speed.
- **Stats**: the class table's attack power rates (hunter 2 ranged per Agility, 1 melee per Strength
  and per Agility); Classic Era's are unpopulated.
- **Ammo**: damage only from `ItemDamageAmmo` (no min–max in `ItemSparse`); new epic ammo (274387,
  274388) and Matriarch Quiver (274926, 13%); Ribbly's, Doomshot, Rockshard Pellets and Miniature
  Cannon Balls have no Forever row.
- **Pets**: scaling auras with new aura types (amounts server-side); new abilities (Swipe, Pinch,
  Dismember, Savage Rend, Dust Cloud, Trickster's Dance, …); Furious Howl +136 melee attack power to
  the party for 60 s (45–57 on the next attack); Lightning Breath 86–98 with no level scaling; a Fox
  family. A reworked Beast Mastery tree (Unleashed Fury 3–15%, Ferocity 2–10%, Focused Fire, Lone
  Wolf) is the hunter's doc's.
- **Demons**: Firebolt 44 ±11% (83–94), Lash of Pain 50 (100), Demonic Sacrifice's schools swapped.
- **Unchanged**: Auto Shot's data, the quivers' haste, Focus's row, Claw and Bite.
- **Reported, not in the client** [?] ([fh-changes], [fbugs]): Auto Shot fires through casts; every
  shot restarts the retry timer (+0.1–0.4 s); a melee swing resets the ranged timer; pets inherit 10%
  of the hunter's attack power and all its crit, and can't be buffed; Human and Orc weapon racials
  give no ranged crit. Open questions, not the `forever` default (doctrine §2).

## Implementation notes

The engine (`sim/engine/sim.ts`) adds these as optional parts: a plan without `ranged`, a pet, a
ranged spell or the new conditions never enters them, so every shipped spec's result is unchanged
bit for bit (probed: every shipped spec in both profiles, identical `SimResult`s).

- **Auto Shot** is its own event. After a shot at `t` the reload ends at `t + cycle − wind-up`, and
  the next shot fires at `max(reload end, held until) + wind-up`, where a cast or channel sets "held
  until" to its end. The cycle is read at each shot, so haste applies from the next one. The pull's
  shot is queued before the rotation's first walk.
- **The ranged table** is the special table's miss at the ranged weapon's skill and hit, no dodge or
  parry, a block from the front, and its crit as a separate roll, rebuilt with the stats. Auto Shot
  and shots use the table and damage streams, as your other attacks do.
- **The pet** has its own swing event, walk, power tick (from a random phase) and cast end, and its
  own random stream (`STREAM.pet`), which also rolls the chances of procs on its triggers (`petLanded`,
  `petCrit`), so adding one changes none of your rolls. (A proc on them whose action rolls a table of its
  own, a damage proc, would roll it on your streams; no pet proc the docs name does.) Its numbers are rebuilt
  when your stats change (its shares, your armor debuffs) and when an aura with pet mods changes. It
  walks after you at each decision point; what it does can make one for you. Its damage adds to the
  fight's damage, not its threat.
- **Not modelled** (each under 0.5% or out of the sim's scope): the retry timer, movement, the pet's
  threat and positioning, its happiness changing in a fight, a pet that dies.

## Worked examples

Profile `forever` unless named; every input not sourced above is an example's number.

**WE-1: an Auto Shot.** Bloodseeker (85–128, 3.3 s), Thorium Headed Arrows at 17.5 DPS, 1,000 ranged
attack power, no armor or multipliers. Average hit = (85 + 128) / 2 + 17.5 × 3.3 + 1000 / 14 × 3.3 =
106.5 + 57.75 + 235.71 = **399.96**; a crit ×2 = **799.93**.

**WE-2: the ranged table vs +3 at 300 skill, from behind.** With no hit, 20% sheet crit of which 15% is
from auras: miss **8%** in both profiles; no dodge, parry or glancing; crit `forever` 20 − 0.6 − 1.8 =
**17.6%**, `classicEra` 20 − 3.0 − 1.8 = **15.2%**. With 3% hit: miss `forever` **5%**,
`classicEra` **6%** (its first 1% ignored).

**WE-3: clipping.** Bloodseeker (3.3 s) and Harpy Hide Quiver (15%): the cycle is 3300 / 1.15 =
**2,870 ms**, a 2,370 ms reload and the 500 ms wind-up. Forever's 2.0 s Aimed Shot, hasted by the
quiver, is 2000 / 1.15 = **1,739 ms**. Cast right after a shot at 0, it ends at 1,739, before the
reload does: the next shot still fires at **2,870**. Cast at 1,000 it ends at 2,739, and the shot
fires at 2,739 + 500 = **3,239**, 369 ms late. So `autoShotClear` allows it only in the first
**631 ms** after a shot (2,370 − 1,739).

**WE-4: ranged haste stacks.** Bloodseeker with Harpy Hide Quiver and Rapid Fire: 3300 / (1.15 ×
1.40) = **2,050 ms**; with Quick Shots too, / 1.30 = **1,577 ms**.

**WE-5: a pet's white hit.** A pet swinging 42–64 at 2.0 s with 252 attack power, Happy (×1.25) and a
cat (×1.10), no armor: average hit = ((42 + 64) / 2 + 252 / 14 × 2) × 1.375 = (53 + 36) × 1.375 =
**122.375**; a crit ×2 = **244.75**; with a +50% pet damage aura up (Bestial Wrath), **183.5625**.

## Open questions

### OQ-1: hunter base attack power
The client gives the rates (2 ranged attack power per Agility) but not the base. Only vanilla wikis
(forbidden) give `RAP = 2 × level + 2 × Agility − 10` and `AP = 2 × level + Str + Agi − 20`. A D24
placeholder can stand in if the hunter's slice finds it in an emulator's class table kept unchanged
in Classic Era; otherwise read the beta's sheet at two Agility values. Effect: a base of 110 is about
3–4% of a hunter's ranged damage.

### OQ-2: two rolls or one
The sim rolls a ranged attack's crit apart from its miss and block (combat-tables §3's `Ranged`); a
Classic Era wiki asserts it with too few crits to show it. One roll would lower crits by the miss and
block share (~8% of them). Test: log 2,000 Auto Shots from the front at a known crit.

### OQ-3: ammo damage
Forever's ammo has DPS only in `ItemDamageAmmo` (17.715 for Thorium Headed Arrows), which rounds to
17–18 (a mean of 17.5). Which the server adds, and whether ammo adds its DPS × the real speed on a
normalized shot, is [?]. Test: Auto Shot damage with and without arrows, same bow.

### OQ-4: Auto Shot and casts
Is the 0.5 s wind-up hasted, and does a cast hold it back in Forever? Classic Era's model holds it
(`castsHoldAutoShot`); Forever testers report shots firing through Aimed Shot and Multi-Shot. Test: a
combat log of Aimed Shot cast at several points of the cycle, with and without a quiver. A setting
can switch it once a class slice exposes it.

### OQ-5: Focus regeneration
`RegenCombat` 10 in both clients, but Classic Era measurements give ~5 a second and Forever testers
10 a second. Test: Focus over 30 s of Claw spam.

### OQ-6: pet stats and inheritance
The pets' base stats (the 252 attack power, 22.9 base DPS), the demons', and what Forever's scaling
auras inherit are server-side. Test: the pet's character sheet (attack power, crit) on the beta with
two owner gear sets.

### OQ-7: the pet's attack table
Whether pets glance, and their miss, dodge and crit against +3, have no Classic Era measurement. The
sim uses the player formulas at the pet's level and skill. Test: 2,000 pet swings from behind on a +3
target.

### OQ-8: buffs on pets
Only Battle Shout is sourced to reach pets in Classic Era; Forever reports say pets can't be buffed.
Test: a pet's sheet with Blessing of Might, Mark of the Wild and Battle Shout.

## Sources

- [client] Forever beta client 1.60.1.69977 (1.60.1.69913 where only that build has the table) and
  Classic Era 1.15.9.69722, read through the wago.tools API ([data/client.md](../data/client.md)):
  Spell, SpellMisc, SpellEffect, SpellCastTimes, SpellCooldowns, SpellCategories, SpellEquippedItems,
  SpellPower, SkillLineAbility, ChrClasses, PlayerExpectedStat, PowerType, ItemSparse, Item,
  ItemXItemEffect, ItemDamageAmmo and CreatureFamily (the last two fetched for this doc: 4 wago.tools
  requests and 2 `.dbd` files; the scraper reads them at these builds, [data/client.md](../data/client.md#tables-the-docs-cite)).
- Classic Era hunter research on the 1.13 beta and after: [ranged attack table][wys-table], [attack
  formulas][wys-formulas] (a community wiki, 2019–21); [crit suppression][magey-crit] (Magey et al.).
- Blizzard's Classic forums: [hit tables][bnet-hit], ["Not a Bug" list][nab]; players' tests: [the
  retry timer][retry], [Aimed Shot's 3.5 s][aimed-35], [Multi-Shot's cast][multi-cast], [pet
  damage][bnet-petdps].
- [YaHT][yaht], a hunter swing-timer addon, at a commit for the Classic client (2020-04-24).
- Pets: [Petopia Classic][petopia-speed] ([training][petopia-train]); [Warcraft Tavern][wt-pets].
- wowhead Classic spell pages: [Rapid Fire][wh-rapid], [Quick Shots][wh-quick], [Claw][wh-claw],
  [Bite][wh-bite] (only the base spells; its talent pages mix in Season of Discovery).
- Forever, secondary [?]: [forever-hunter wiki][fh-changes] ([stat mechanics][fh-stats]),
  [forever-bugs][fbugs].
- Dates only: [Patch 2.0.1][wiki-201], [Steady Shot][wiki-steady] (warcraft.wiki.gg).
- Not used: wowsims/classic (Season of Discovery code since before any Classic hunter code it had),
  watchyoursixx/HunterSim (TBC), 1.12 private-server addons (forbidden).

[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[gs-forever]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[wys-table]: https://github.com/watchyoursixx/classic-hunter/wiki/Ranged-Attack-Table
[wys-formulas]: https://github.com/watchyoursixx/classic-hunter/wiki/Attack-Formulas-for-Hunter
[magey-crit]: https://github.com/magey/classic-warrior/wiki/Crit-aura-suppression
[bnet-hit]: https://us.forums.blizzard.com/en/wow/t/bug-hit-tables/185675/12
[nab]: https://eu.forums.blizzard.com/en/wow/t/wow-classic-not-a-bug-list/50941
[retry]: https://us.forums.blizzard.com/en/wow/t/classic-hunter-the-retry-timer/542470
[aimed-35]: https://us.forums.blizzard.com/en/wow/t/aimed-shot-has-an-actual-cast-time-of-35-seconds-and-is-affected-by-quiver-haste/405858
[multi-cast]: https://us.forums.blizzard.com/en/wow/t/hunter-multi-shot-cast-time/316227
[bnet-petdps]: https://us.forums.blizzard.com/en/wow/t/hunter-pet-dps-massively-bugged/621800
[yaht]: https://github.com/Aviana/YaHT/blob/307bbd5/YaHT.lua
[petopia-speed]: https://www.wow-petopia.com/classic/attackspeed.php
[petopia-train]: https://www.wow-petopia.com/classic/training.php
[wt-pets]: https://www.warcrafttavern.com/wow-classic/guides/hunter-pets/
[wh-rapid]: https://www.wowhead.com/classic/spell=3045
[wh-quick]: https://www.wowhead.com/classic/spell=6150
[wh-claw]: https://www.wowhead.com/classic/spell=3009
[wh-bite]: https://www.wowhead.com/classic/spell=17261
[fh-changes]: https://github.com/classic-hunter/forever-hunter/wiki/Forever-Beta-Changes
[fh-stats]: https://github.com/classic-hunter/forever-hunter/wiki/Stat-Mechanics
[fbugs]: https://github.com/ClassicWoWCommunity/forever-bugs
[wiki-201]: https://warcraft.wiki.gg/wiki/Patch_2.0.1
[wiki-steady]: https://warcraft.wiki.gg/wiki/Steady_Shot
