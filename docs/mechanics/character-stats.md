# Character stats

This doc defines how the sim turns race, class, talents, gear, enchants, buffs and consumables
into the numbers that combat uses at level 60: base attributes, racials, stat conversions, druid
form modifiers, and the order and rounding of the derived-stat pipeline. The Forever beta client
(build `1.60.1.69913`) gives us race/class validity, the per-class crit-per-Agility and
spell-crit-per-Intellect slopes, base mana, and exact spell data for every racial and druid form.
It does **not** carry per-race base attributes, base health or base avoidance; those stay
server-side. Where Classic Era sources exist we use them (warrior base attributes, conversion
ratios). Paladin and druid base attributes and several base percentages are still open. The
Forever beta is capped around level 20, so the level-60 values have to come from naked
character sheets on live Classic Era characters (see [Open questions](#open-questions)). The racials changed heavily in Forever: the weapon-skill
racials became crit bonuses (Human Mace Specialization was dropped, and Dwarves gained one), Tauren
gained +1% hit, and there are new cooldowns and two new races. Forever items also state crit, hit,
dodge, parry, block and defense as **combat ratings** at fixed level-independent ratios, so the
pipeline converts ratings to percentages. It also accepts Classic percentage stats from items
that have no Forever data yet.

Status: researched 2026-09-22 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified ·
Forever build `1.60.1.69913`, Classic Era baseline `1.15.9.69722`

> **Client-data values.** Values tagged [F] [client] come from the raw Forever client files of
> build 1.60.1.69913 (and [C] [client] from the Classic Era 1.15.9.69722 baseline), read through
> the wago.tools API and parsed by `scripts/scrape/client.mjs`. That check confirmed every value
> this doc had marked for a browser check ([OQ-13](#oq-13-confirm-wagotools-values-in-a-browser))
> and corrected one claim: the client does ship the `basemp.txt` and `hppersta.txt` game tables
> ([below](#what-the-forever-client-ships-and-does-not)). Raw files lack server hotfixes and
> server scripts ([hotfix caveat][client-hotfix]).

---

## What the sim needs

- **Legal race × class pairs** for warrior, paladin and druid, with faction (sets the buff pool).
- **Level-60 base attributes** (Str, Agi, Sta, Int, Spi) per legal race × class, plus base health,
  base mana, base melee/spell crit, base dodge/parry/block, defense and weapon skill.
- **Racials** as stat effects, conditional auras (weapon type, creature type), cooldowns and procs.
- **Conversion ratios** at level 60: Str→AP and block value, Agi→crit/dodge/armor (and AP in Cat
  Form), Sta→HP, Int→mana and spell crit, Spirit→mana regen, defense→avoidance.
- **Rating conversions** for Forever items (crit, hit, dodge, parry, block, defense), and a
  policy for ratings whose combat effect is unmeasured: expertise, haste and armor penetration
  apply by hypothesis behind `unmeasuredRatings` ([D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22));
  health regeneration has no combat effect.
- **Druid form modifiers**: form AP, armor multipliers, form health, Heart of the Wild, Thick Hide,
  Predatory Strikes.
- **The pipeline**: flat adds → % attribute multipliers → rounding → conversions → derived-stat
  multipliers, and which numbers the character sheet shows versus what combat uses.

Topics owned elsewhere (one-line summaries, linked instead of duplicated):

- [combat-tables.md](combat-tables.md): attack table vs a level-63 boss: miss, dodge, parry,
  glancing, crit suppression, hit caps, weapon-skill effects, boss → player table.
- [damage-and-timing.md](damage-and-timing.md): armor mitigation, weapon damage, haste stacking,
  swing timers, GCD.
- [rage.md](rage.md): rage generation and maximum rage (Gnome +5%, Boundless Rage).
- [threat.md](threat.md): stance and form threat multipliers.
- [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md): buff values (Kings, Might, Mark of
  the Wild, Battle Shout…), consumables, enchants, presets.
- [forever-system-changes.md](forever-system-changes.md): non-class Forever changes.
- [../classes/warrior.md](../classes/warrior.md), [../classes/paladin.md](../classes/paladin.md),
  [../classes/druid.md](../classes/druid.md): talents, rotations, defaults. The druid doc owns form
  gameplay (powershifting, abilities); this doc owns the form **stat** modifiers.

Cross-doc consistency, checked 2026-09-22:

- [warrior.md](../classes/warrior.md) agrees: no race has bonus weapon skill in Forever, so every
  warrior is at 300 skill plus items. Human keeps only Sword Specialization (+2% crit), and Mace
  Specialization moved to Dwarves (+1% crit). Its earlier Human Mace Specialization wording was
  corrected on 2026-09-22.
- [druid.md](../classes/druid.md) matches the form data below (Cat 120 AP at 60, Dire Bear 180,
  tooltip artefacts). It tags the druid AP offset (−20) and base melee crit (0.9%) [?], as this
  doc does ([OQ-3](#oq-3-base-melee-and-spell-crit), [OQ-7](#oq-7-base-attack-power-formulas)):
  their only source, `wowsims/classic`, is a secondary sim with Season of Discovery lineage. It
  takes 2 AP per Strength and 20 Agility per 1% crit as [F] from this doc (reconciled
  2026-09-22).
- [paladin.md](../classes/paladin.md) uses base mana 1512, matching the [F] value below.

---

## Races

### Legal races for the sim's classes

The Forever client's `CharBaseInfo` table lists every valid race/class pair: 56 rows. The table
below is read from it, and it matches the community-reported class lists on foreverchanges.pro and
[`src/data/races/races.json`][races-json]. **[F]** [client] (CharBaseInfo, 1.60.1.69913; Classic
Era has 40 pairs), [racials page][fc-racials]. This doc owns the matrix; the site's racials
page marks its own list
community-reported because it was transcribed from BlizzCon footage, but the client table is the
primary source.

| Race | ChrRaces ID | Faction | Warrior | Paladin | Druid | Versus Classic Era |
| --- | --- | --- | --- | --- | --- | --- |
| Human | 1 | Alliance | ✓ | ✓ | — | unchanged |
| Dwarf | 3 | Alliance | ✓ | ✓ | — | unchanged |
| Night Elf | 4 | Alliance | ✓ | — | ✓ | unchanged |
| Gnome | 7 | Alliance | ✓ | — | — | unchanged |
| High Order Skyborne | 95 | Alliance | ✓ | — | ✓ | **new race** |
| Orc | 2 | Horde | ✓ | — | — | unchanged |
| Undead | 5 | Horde | ✓ | **✓ new** | — | Undead paladin is new |
| Tauren | 6 | Horde | ✓ | — | ✓ | unchanged |
| Troll | 8 | Horde | ✓ | — | — | unchanged |
| Windshaper Skyborne | 96 | Horde | ✓ | — | ✓ | **new race** |

- The Horde gets paladins (Undead only). That changes the Horde raid-buff pool: see
  [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md). **[F]**
- Skyborne names and IDs are from `ChrRaces` (ID 95 "High Order Skyborne", Alliance; 96
  "Windshaper Skyborne"). **[F]** [client] (ChrRaces, 1.60.1.69913)
- Shield use: `ChrClasses.ArmorTypeMask` lets warriors (127) and paladins (2303) use shields but not
  druids (2343). Druids therefore have no block. **[F]** [client] (ChrClasses, 1.60.1.69913)

### Racials that matter to the sim

Forever effects are the beta client's tooltips as read by foreverchanges.pro, cross-checked
against the spell's `SpellEffect` rows in the client files, which give the exact aura types and
values: **[F]** [client] (SpellEffect, SpellMisc, SpellDuration, SpellCooldowns, SpellPower,
1.60.1.69913). Durations come from `SpellMisc.DurationIndex` → `SpellDuration` (index 1 = 10 s,
index 8 = 15 s). Every effect has a spell ID so the engine can key its implementation on it.

**Sim handling** legend: *stat* = permanent stat; *cond* = active only with the named weapon or
target type equipped or present; *CD* = on-use cooldown the rotation can press; *proc*; *tank* = only
matters for tanking survival (not modelled for DPS/TPS unless noted); *ignore* = no DPS/TPS effect.

| Race | Racial (spell ID) | Forever effect | Classic Era effect | Sim handling | Tag · source |
| --- | --- | --- | --- | --- | --- |
| Human | Sword Specialization (20597) | +2% crit chance with all spells and attacks while a sword or two-handed sword is equipped (aura 290, value 2) | +5 Sword and Two-Handed Sword skill | cond: crit aura (counts as *aura crit*, see [combat-tables.md](combat-tables.md)) for all attacks and spells while a sword is in either hand; either hand is [?] ([warrior Q15](../classes/warrior.md#9-open-questions)) | [F] [racials][fc-racials], [client] (SpellEffect, 1.60.1.69913) |
| Human | The Human Spirit (20598) | Spirit +5% (aura 137, misc 4 = Spirit) | same | stat: ×1.05 Spirit | [F] [client] (SpellEffect, 1.60.1.69913) |
| Human | Mace Specialization | **removed** | +5 Mace skill | — | [F] [racials][fc-racials] |
| Human | Will to Survive (1259718), Perception | stun break; stealth detection | Perception only | ignore | [F] [racials][fc-racials] |
| Dwarf | Mace Specialization (1259719) | +1% crit chance with all spells and attacks while a mace or two-handed mace is equipped (aura 290, value 1) | did not exist (Dwarves had Gun Specialization) | cond: crit aura, as Human Sword Specialization (a mace in either hand) | [F] [client] (SpellEffect, 1.60.1.69913) |
| Dwarf | Stoneform (20594) | −10% physical damage taken for 8 s (aura 87, school Physical), removes and grants immunity to bleed, poison and disease; 3 min cooldown; **on the GCD** (1.5 s, unlike the damage racials) | +10% armor for 8 s, immunities; 3 min | tank CD (optional) | [F] [client] (SpellEffect, 1.60.1.69913) |
| Dwarf | Big Game Hunter (1259721) | +5% damage vs Beasts (aura 168, creature mask Beast) | did not exist | cond: target type | [F] [client] (SpellEffect, 1.60.1.69913) |
| Dwarf | Gun Specialization, Frost Resistance | **removed** | +1% gun crit; +10 Frost resistance | — | [F] [racials][fc-racials] |
| Night Elf | Quickness (20582) | +1% dodge (aura 49), +2% movement speed | +1% dodge | stat: +1% dodge | [F] [client] (SpellEffect, 1.60.1.69913) |
| Night Elf | Elune's Light (1259799) | +10% crit chance with all spells and attacks for 15 s (aura 290, value 10); 3 min cooldown | did not exist | CD | [F] [client] (SpellEffect, SpellMisc, 1.60.1.69913) |
| Night Elf | Shadowmeld | now usable in combat (drops aggro, 2 min cooldown when used in combat) | 10 s cooldown, out of combat | ignore (see [threat.md](threat.md)) | [F] [racials][fc-racials] |
| Night Elf | Nature Resistance | **removed** | +10 Nature resistance | — | [F] [racials][fc-racials] |
| Gnome | Expansive Mind, warrior version (1259802) | Warrior: maximum Rage +5% (aura 178, misc 1 = Rage) → 105 | Intellect +5% (all classes) | stat: see [rage.md](rage.md) | [F] [client] (SpellEffect, 1.60.1.69913) |
| Gnome | Eureka!, warrior version (1259813) | Next 3 damaging abilities cost 40% less Rage and deal 10% more damage; 15 s window; 2 min cooldown; no cost | did not exist | CD (charges) | [F] [client] (SpellEffect, SpellMisc, SpellPower, 1.60.1.69913) |
| Gnome | Arcane Resistance | **removed** | +10 Arcane resistance | — | [F] [racials][fc-racials] |
| Orc | Axe Specialization (20574) | +1% crit chance with all spells and abilities while an axe or two-handed axe is equipped (aura 290, value 1) | +5 Axe and Two-Handed Axe skill | cond: crit aura, as Human Sword Specialization (an axe in either hand) | [F] [client] (SpellEffect, 1.60.1.69913) |
| Orc | Blood Fury (20572) | +10% melee attack power (aura 166), +10% ranged attack power (167) and +10% spell power (317) for 15 s; 2 min cooldown | +25% *base* melee AP for 15 s (a scripted effect), −50% healing received for 25 s; 2 min | CD (AP multiplier; scope [?], see [OQ-9](#oq-9-blood-fury-scope)) | [F] [client] (SpellEffect, SpellMisc, 1.60.1.69913); Classic [C] [client] (SpellEffect, 1.15.9.69722: a dummy, 25) |
| Orc | Shatter Curse (1299026) | removes curses; −15% magic damage taken for 8 s; 3 min cooldown | did not exist | tank CD | [F] [racials][fc-racials] |
| Orc | Hardiness, Command | stun duration −20%; Command **removed** | stun resist; pet damage | ignore | [F] [racials][fc-racials] |
| Undead | Touch of the Grave (1260189, warrior/paladin/rogue version) | Spells and attacks have a 5% chance to drain health from the target, up to 5% of your maximum health | did not exist | proc; damage model [?] ([OQ-10](#oq-10-touch-of-the-grave)) | [F] text [racials][fc-racials]; [client] (SpellEffect, 1.60.1.69913: dummy aura, 5) |
| Undead | Will of the Forsaken, Cannibalize, Underwater Breathing; Shadow Resistance | utility; resistance **removed** | utility; +10 Shadow resistance | ignore | [F] [racials][fc-racials] |
| Tauren | Endurance (20550) | total health +5% (aura 133) **and +1% chance to hit** with melee and ranged attacks (aura 54) and spells (aura 55) | total health +5% | stat | [F] [client] (SpellEffect, 1.60.1.69913) |
| Tauren | War Stomp | unchanged: 2 s AoE stun | same | ignore | [F] [racials][fc-racials] |
| Tauren | Plainsrunning, Cultivation; Nature Resistance | movement, herb; resistance **removed** | — | ignore | [F] [racials][fc-racials] |
| Troll | Berserking (20554) | +10% melee attack speed (aura 319), +10% ranged attack speed (140) and +10% cast speed (65) for **10 s**; 3 min cooldown; **no resource cost** | +10% to +30% attack and cast speed depending on missing health, 10 s, 3 min; warriors pay 5 Rage | CD | [F] [client] (SpellEffect, SpellMisc, SpellPower, 1.60.1.69913) |
| Troll | Beast Slaying (20557) | +5% damage vs Beasts (aura 168) | same | cond: target type | [F] [client] (SpellEffect, 1.60.1.69913) |
| Troll | Regeneration, Rapid Regeneration; Bow and Throwing Specialization | health regen; Bow/Throwing **removed** | — | ignore | [F] [racials][fc-racials] |
| Skyborne (both) | Wind Blessed | +1% spell, melee and ranged haste (passive) | new race | stat (haste, see [damage-and-timing.md](damage-and-timing.md)) | [F] [racials][fc-racials] |
| Skyborne (both) | Elemental Insight | +5% damage vs Elementals | new race | cond: target type | [F] [racials][fc-racials] |
| Skyborne | Walk on Air; Read Ley Line (High Order) / Skysight (Windshaper) | glide; +100% health and mana regen / movement speed | new race | ignore | [F] [racials][fc-racials] |

Consequences for the rest of the sim:

- **No race has a weapon-skill bonus in Forever.** Every level-60 character has 300 skill with its
  weapon unless an item adds skill. The Classic "305 skill" racial advantage against +3 bosses is
  gone. **[F]** Weapon-skill mechanics live in [combat-tables.md](combat-tables.md).
- The weapon racials (Human sword, Orc axe, Dwarf mace) and Elune's Light use aura 290, which
  raises *all* crit including spell crit (the tooltips say "all spells and attacks"). A Human
  paladin with a sword gets +2% to Seal/Judgement/Consecration crits too. **[F]**
- **A weapon racial counts for every attack while its weapon is equipped in either hand.** The
  tooltip reads "while you have a sword or two-handed sword equipped", so a dual-wielding Human
  with a mace and a sword gets +2% on both hands' attacks, white and special, and on spells. The
  tooltip wins over a per-hand reading
  ([doctrine §2](../doctrine.md#2-where-numbers-come-from-non-negotiable)); whether the server
  agrees for mixed weapons is **[?]** ([warrior Q15](../classes/warrior.md#9-open-questions)).
  Weaponmaster's axe and polearm crit (12700) is the same kind of client data (all crit, aura
  290, with a weapon-type `SpellEquippedItems` mask), but its tooltip reads "with Axes and
  Polearms", so it counts only for that weapon's attacks and not for spells
  ([warrior §2.7](../classes/warrior.md#27-weaponmaster-extra-attacks-and-windfury)). The
  tooltips, not the tables, decide the split.
- **Both rule profiles use these Forever racials.** `classicEra` changes the combat rules and the
  spell values that differ between the clients, not the character: a Human still gets +2% crit
  with a sword rather than Classic Era's +5 sword skill, and a Night Elf still has Elune's Light
  ([architecture](../architecture.md#rules-and-stats)).
- Classic Era suppresses crit from auras by 1.8% against +3-level targets, and these racials are
  auras. Whether Forever keeps that suppression belongs to [combat-tables.md](combat-tables.md).
  **[C]** [Magey attack table][magey-at] The sim counts them in the aura-crit total that
  [combat-tables §4.4](combat-tables.md#44-crit-suppression) suppresses: `min(aura crit, 1.8%)`.
  A warrior's talents and stance already fill that 1.8%, so the racial adds its full value to the
  table; as the only aura crit (a naked Human with a sword,
  [Example 1](#example-1-naked-human-warrior) variant 1c) it's suppressed like any other.
- The wowsims Forever sim still implements the TBC racials (Human Spirit ×1.10, weapon skill as
  expertise, level-scaled Blood Fury) [wsf-racials]. Don't copy them.

---

## Base stats at level 60

### What the Forever client ships (and does not)

Checked against the raw client files of build `1.60.1.69913` ([client]; level-60 rows in
[`gametables.json`][client-gt]). The wowsims Forever team reached the same conclusion from its own
client extraction [wsf-base].

| Table | What it holds | Use |
| --- | --- | --- |
| `PlayerExpectedStat` (**new in 1.60**; absent from the 1.15.9.69722 file list [client]) | Per class and level: `BaseMana`, `CritPerAgility`, `SpellCritPerIntellect`, plus two unnamed columns (at level 60 these read 10 and 287 for every class) | Base mana and the Agi→crit and Int→spell-crit slopes **[F]** [client] (PlayerExpectedStat, 1.60.1.69913) |
| `ChrClasses` | `AttackPowerPerStrength`, `AttackPowerPerAgility`, `RangedAttackPowerPerAgility` (all 0 in the Classic 1.15.9 client, populated in Forever) | Str→AP ratios **[F]** [client] (ChrClasses, 1.60.1.69913); zeros **[C]** [client] (ChrClasses, 1.15.9.69722) |
| `CharBaseInfo` | race × class validity only | race table above **[F]** [client] (CharBaseInfo, 1.60.1.69913) |
| `RaceStat` (new in 1.60.1.69876) | 43 rows, one per race, single unnamed field, 0 everywhere | nothing usable [client] |
| `ChrRaces` | no stat columns | names, IDs, factions [client] |
| Game tables | the beta ships `combatratings.txt`, `armormitigationbylvl.txt`, **`basemp.txt`** (base mana by class: paladin 1,512, druid 1,244, warrior 0 at level 60, the same as `PlayerExpectedStat.BaseMana`) and **`hppersta.txt`** (10 HP per Stamina at level 60), but no base-crit, base-HP or regen tables | `combatratings.txt` holds the rating costs used by Forever items, identical at all 123 levels: see [Combat ratings](#combat-ratings-forever-items). `hppersta.txt` backs the 10 HP per Stamina in [Stamina](#stamina). **[F]** [client] ([`gametables.json`][client-gt], 1.60.1.69913); wowsims/forever's extraction agrees ([wsf-cr], [wsf-armor]) |

**Consequence:** per-race base attributes, base health and base dodge/parry/block/crit are
server-side. The sim takes them from Classic Era sources where they exist; the rest are
[open questions](#open-questions).

### Race offsets

Classic Era base attributes decompose into a **class row** plus a **race offset** that is the same
for every class. The offsets below come from the eight Classic level-60 warrior rows (the class
row cancels out). **[C]** for Str, Agi, Sta and Int ([WarriorSim `races.js` at pre-SoD commit
180a3cc][ws-races]); **[?]** for Spi, whose rows appear only in WarriorSim's post-SoD
`levelstats.js` ([ws-levelstats]; [OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)).

| Race | Str | Agi | Sta | Int | Spi | Attribute racial |
| --- | --- | --- | --- | --- | --- | --- |
| Human | 0 | 0 | 0 | 0 | 0 | Spirit ×1.05 (applied as a multiplier, not in the row) |
| Dwarf | +2 | −4 | +3 | −1 | −1 | — |
| Night Elf | −3 | +5 | −1 | 0 | 0 | — |
| Gnome | −5 | +3 | −1 | +3 | 0 | Forever: none (Classic had Int ×1.05) |
| Orc | +3 | −3 | +2 | −3 | +3 | — |
| Undead | −1 | −2 | +1 | −2 | +5 | — |
| Tauren | +5 | −5 | +2 | −5 | +2 | (health ×1.05, see Endurance) |
| Troll | +1 | +2 | +1 | −4 | +1 | — |
| Skyborne (both) | ? | ? | ? | ? | ? | new race: [?] ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)) |

The additive decomposition itself is an inference from the Classic data (**[C]**, inferred). Two
naked Classic Era sheets per class, from different races, confirm it
([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)).

### Warrior base attributes

Classic Era level-60 warrior rows from WarriorSim, a Classic Era ("1.12/Classic") warrior sim.
Str, Agi, Sta and Int are **[C]** from its pre-SoD commit ([`races.js` at 180a3cc][ws-races],
2021; Gnome Int there is the sheet value 35). Spirit is **[?]**: only the post-SoD
`levelstats.js` has it ([ws-levelstats]), so the Spi columns need the OQ-1 sheets. Spirit in
that data is the *sheet* value, which already includes The Human Spirit; the engine stores the
raw value (column **Spi raw**) and applies ×1.05 as a multiplier.

| Race | Str | Agi | Sta | Int | Spi raw | Sheet Spi |
| --- | --- | --- | --- | --- | --- | --- |
| Human | 120 | 80 | 110 | 30 | 45 | 47 |
| Dwarf | 122 | 76 | 113 | 29 | 44 | 44 |
| Night Elf | 117 | 85 | 109 | 30 | 45 | 45 |
| Gnome | 115 | 83 | 109 | 33 | 45 | 45 |
| Orc | 123 | 77 | 112 | 27 | 48 | 48 |
| Undead | 119 | 78 | 111 | 28 | 50 | 50 |
| Tauren | 125 | 75 | 112 | 25 | 47 | 47 |
| Troll | 121 | 82 | 111 | 26 | 46 | 46 |
| Skyborne (both) | ? | ? | ? | ? | ? | ? |

- Gnome Int: Classic sheets showed 35 (33 × 1.05, rounded). Forever removed the Int racial, so the
  Forever value is 33. **[C]** row + **[F]** racial change.
- Skyborne rows are unknown. **[?]** [OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)

### Paladin and druid base attributes

`base(race, class) = classRow(class) + raceOffset(race)`, with the race offsets above **[C]**.

**Paladin [C].** [ClassicSim][cs-druid], a Classic sim pinned to its last commit before Season of
Discovery (`f9cb48d`, 2021-03-21), gives every race × class level-60 sheet. Its class rows came in
[PR #103][cs-103] (2020-01-05), which cites a 2019 Classic community stat sheet. Doctrine §2
counts pre-SoD Classic sims as [C], the standard the warrior rows meet with WarriorSim `180a3cc`.
Its paladin rows match the [C] race offsets (Dwarf = Human + 2/−4/+3/−1/−1). The engine stores
Spirit raw, before The Human Spirit's ×1.05: 75 × 1.05 = 78.75, floored to the sheet's 78, which
also supports floor rounding ([OQ-6](#oq-6-rounding)). Undead is derived from the Human row with
the [C] Undead offset (Classic Era has no Undead paladin). The rows live in `PALADIN_ROWS` in
`src/sim/stats/base-stats.ts`. A naked Classic Era sheet would still confirm them
([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)): the one genuine naked sheet found, a
Human rogue in October 2019, differs from ClassicSim's rogue row in Stamina (80 against 75).

| Paladin | Str | Agi | Sta | Int | Spi raw | Sheet Spi | Tag · source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Human | 105 | 65 | 100 | 70 | 75 | 78 | [C] [ClassicSim][cs-druid] |
| Dwarf | 107 | 61 | 103 | 69 | 74 | 74 | [C] [ClassicSim][cs-druid] |
| Undead | 104 | 63 | 101 | 68 | 80 | 80 | [C] rule: the Human row + the Undead offset |

**Druid.** The druid class row is still **[?]** here: the engine has no values, and the druid
specs can't compute base attributes ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)).

| Class | Str | Agi | Sta | Int | Spi raw | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Human paladin (sheet Spi 78: 75 × 1.05, floored) | 105 | 65 | 100 | 70 | 75 | [C] [ClassicSim][cs-druid] (pre-SoD) |
| Dwarf paladin | 107 | 61 | 103 | 69 | 74 | [C] [ClassicSim][cs-druid] (pre-SoD) |
| Undead paladin | 104 | 63 | 101 | 68 | 80 | [C]: the Human row + the [C] Undead offset |
| Night Elf druid (sheet) | 62 | 65 | 69 | 100 | 110 | [?] placeholder (D24); origin: [mangos][mz-levelstats], not evidence ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)) |
| Tauren druid (sheet) | 70 | 55 | 72 | 95 | 112 | [?] placeholder (D24); origin: [mangos][mz-levelstats], not evidence ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)) |
| Druid class row (= Human-offset druid), used for Skyborne druids | 65 | 60 | 70 | 100 | 110 | [?] placeholder (D24): the Night Elf and Tauren rows minus their [C] offsets; Skyborne's own offsets are unknown ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)) |

**Druid rows: [?] placeholders ([D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23) rule 2).** No tier 1–3 source has them. The Night Elf and
Tauren rows are the 1.12 values of a vanilla server emulator's database ([mangos][mz-levelstats]),
which Classic Era is taken to have kept: they agree exactly with the [C] race offsets. That makes
them placeholders, not evidence. ClassicSim, a Classic Era sim, reproduces them at its last commit
before Season of Discovery ([f9cb48d][cs-druid]). That is corroboration, not evidence: its druid
rows came in [PR #103][cs-103] (2020-01-05) from a classicwow.live guide that is now offline,
whose method is unknown, and they equal the emulator's exactly. D24 (2026-09-23) replaced the
2026-09-22 rule "no forbidden-source placeholders", which kept the paladin and druid specs from
computing base attributes. The druid's other base values below are D24 placeholders too. The rows and those values are in the one table of placeholders
(`BASE_PLACEHOLDERS`, [below](#other-base-values-at-level-60)), and the results list the ones a
setup uses. OQ-1 gives the way to measure the rows on Classic Era.

**Paladin rows: [C].** ClassicSim, a Classic Era sim, gives the Human and Dwarf paladin sheets at
its last commit before Season of Discovery ([f9cb48d][cs-druid]); its rows came in
[PR #103][cs-103] (2020-01-05). They agree with the [C] race offsets (Dwarf = Human +
2/−4/+3/−1/−1). Undead is derived from the Human row with the [C] Undead offset (Classic Era has
no Undead paladin). The engine stores Spirit raw, before The Human Spirit's ×1.05: 75 × 1.05 =
78.75, floored to the sheet's 78, consistent with floor rounding ([OQ-6](#oq-6-rounding)). A naked
Classic Era sheet ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)) would confirm them.
The paladin's other unmeasured base values below are D24 placeholders, in `BASE_PLACEHOLDERS`.

### Other base values at level 60

Values in *italics* are **placeholders** the sim uses until they're measured
([D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)):
each is tagged "[?] placeholder (D24); origin: <link>, not evidence", listed in the open
questions and in the results' assumptions, and kept in one replaceable table
(`BASE_PLACEHOLDERS` in `src/sim/stats/base-stats.ts`). The druid's base attributes stand in
the same way, in the same table ([above](#paladin-and-druid-base-attributes)), and so do the
paladin's, so they don't block those specs. The results name every
placeholder a setup uses, on the character sheet and in the assumptions alike, except that only a
tank's list names the avoidance ones (base dodge, parry and block): they matter only when the
boss attacks you.

| Quantity | Warrior | Paladin | Druid | Tag · source |
| --- | --- | --- | --- | --- |
| Base health (before Stamina) | *1,689* | *1,381* | *1,483* | [?] placeholder (D24); origin: [emulator class table][mz-classlevelstats], copied by [wowsims/classic][wsc-base], not evidence ([OQ-2](#oq-2-base-health)) |
| Base mana (before Intellect) | 0 (uses Rage) | **1512** | **1244** | [F] [client] (PlayerExpectedStat, `basemp.txt`, 1.60.1.69913) |
| Base melee crit (before Agility) | **0%** | *0.7%* | *0.9%* | warrior [C] (the pre-SoD WarriorSim: base crit 0, [ws-player]; [Magey][magey-at]: a level-20 warrior's 4.49% spellbook crit equals Agi × 0.1282 exactly; [RatingBuster][rb-vanilla]); druid [?] placeholder (D24); origin: [RatingBuster][rb-vanilla], [wowsims/classic][wsc-base], not evidence; paladin [?] placeholder (D24); origin: the emulator via [wowsims/classic][wsc-base], not evidence; **sources conflict** ([OQ-3](#oq-3-base-melee-and-spell-crit)) |
| Base spell crit (before Intellect) | — | *3.5%* | *1.8%* | druid [?] placeholder (D24); origin: [RatingBuster][rb-vanilla], [wowsims/classic][wsc-base], not evidence; paladin [?] placeholder (D24); origin: [RatingBuster][rb-vanilla], [wowsims/classic][wsc-base], not evidence ([OQ-3](#oq-3-base-melee-and-spell-crit)) |
| Base dodge (before Agility and defense) | **0%** | *0.7%* | *0.9%* | warrior [C] ([RatingBuster][rb-vanilla]'s Classic Era table at its pre-SoD commit; WarriorSim; [Magey][magey-at]); paladin and druid [?] placeholders (D24); origin: [RatingBuster][rb-vanilla], [wowsims/classic][wsc-base], not evidence ([OQ-5](#oq-5-base-dodge-parry-and-block)) |
| Base parry | 5% | 5% | none (druids can't parry) | [?] ([a Blizzard Classic forum statement, 2020-01-21][bnet-base]: "Unlike Parry, Miss, and Block, Dodge does not start at a baseline of 5%") [OQ-5](#oq-5-base-dodge-parry-and-block) |
| Base block (shield equipped) | 5% | 5% | none (no shields) | [?] ([bnet-base]) [OQ-5](#oq-5-base-dodge-parry-and-block); shields [F] [client] (ChrClasses, 1.60.1.69913) |
| Defense skill | 300 (5 × level) | 300 | 300 | [C] [Magey][magey-at] (defense = 5 × level), [Blizzard forum][bnet-def] |
| Weapon skill | 300 (+items only) | 300 | 300 (feral forms: see [druid.md](../classes/druid.md)) | [C] 5 × level; [F] no racial skill |
| Base melee AP | 3 × 60 − 20 = **160** | 160 | *−20* (caster form) | warrior [C] (the pre-SoD WarriorSim gives every race `ap: 160` at 60, [ws-races]; the `3 × level − 20` formula itself appears only in its post-SoD code); druid [?] placeholder (D24); origin: [wowsims/classic][wsc-base], not evidence; paladin [?] [OQ-7](#oq-7-base-attack-power-formulas) |

---

## Stat conversions at level 60

### Strength

| Effect | Warrior | Paladin | Druid | Tag · source |
| --- | --- | --- | --- | --- |
| Melee AP per Str | 2 | 2 | 2 (every form) | [F] `ChrClasses.AttackPowerPerStrength` = 2 [client] (ChrClasses, 1.60.1.69913); [C] [Warcraft Tavern calculator][wt-basestats] |
| Block value per Str | 1 per 20 Str | 1 per 20 Str | — | [C] [calculator][wt-basestats] (Str/20 "to Block"); [F] Forever client UI `BLOCK_VALUE_PER_STRENGTH = 20` ([combat-tables §8](combat-tables.md#8-boss--player-tanks)). Rounding (`floor`) [?]: only WarriorSim's post-SoD code floors it ([OQ-6](#oq-6-rounding)) |

Block value = shield's block value + flat block value from items + `floor(Str / 20)`, then block
value % modifiers (Forever paladin Shield Specialization: +30% "damage absorbed by your shield"
**[F]** [changes][fc-changes]). **[C]** An emulator variant subtracts 1; it isn't adopted. **[?]**
[OQ-5](#oq-5-base-dodge-parry-and-block)

The shield's block value: the Forever client gives shields none of their own, only block value
from gear (stat 48 and equip auras), so a Forever shield adds 0 [?]. A shield with no Forever
data uses its Classic Era stats (D6), and with them its Classic Era block value
(`classicShieldBlockValue`, [items.md](../data/items.md#stats-armor-and-block-value)), flagged in
the results' assumptions [?].

### Agility

| Effect | Warrior | Paladin | Druid | Tag · source |
| --- | --- | --- | --- | --- |
| Melee crit per Agi | 0.0500% (**20.00 Agi = 1%**) | 0.0506% (**19.76 Agi = 1%**) | 0.0500% (**20.00 Agi = 1%**) | [F] `PlayerExpectedStat.CritPerAgility` 0.00050 / 0.000506 / 0.00050 per point [client] (PlayerExpectedStat, 1.60.1.69913); Classic agrees for warrior and druid (20) [C] [calculator][wt-basestats], [WarriorSim][ws-player] |
| Dodge per Agi | 20 Agi = 1% | 20 Agi = 1% | 20 Agi = 1% | [C] [calculator][wt-basestats], [tankadin guide][wt-tankadin] (0.05% dodge per Agi); not in Forever client |
| Armor per Agi | 2 | 2 | 2 | [C] [calculator][wt-basestats], [tankadin guide][wt-tankadin] |
| Melee AP per Agi | 0 | 0 | 0 in caster/bear forms; **1 in Cat Form** | [F] `AttackPowerPerAgility` = 0 [client] (ChrClasses, 1.60.1.69913); Cat Form tooltip "melee attack power by X **plus Agility**" [fc-sb-druid] |
| Ranged AP per Agi | 2 in Forever data (Classic: 1) | 0 | 0 | [F] [client] (ChrClasses, 1.60.1.69913); whether the server uses it is [?] and doesn't matter to the sim |

The Forever slopes match Classic Era's per-class values for 8 of 9 classes, for Agility and
Intellect alike (hunter 52.9 Agi, rogue 29.0, mage 59.5 Int, warlock 60.6…). The one outlier is
paladin Intellect (below).

### Stamina

`HP = baseHP + min(Sta, 20) + 10 × max(Sta − 20, 0) + flat HP`, then × health % modifiers
(Tauren Endurance ×1.05). 10 HP per Stamina: **[F]** [client] (`hppersta.txt` = 10 at level 60,
1.60.1.69913; [data][client-gt]); **[C]** [calculator][wt-basestats],
[tankadin guide][wt-tankadin]. The "first 20 Stamina give 1 HP each" term is **[F] client UI;
[?] on the server**: the Forever character sheet computes its Stamina tooltip as `min(STAMINA_BREAK, Sta) +
(Sta − STAMINA_BREAK) × UnitHPPerStamina`, with `STAMINA_BREAK = 20`
([PaperDollFrameConstants][ui-pdfconst], [PaperDollFrameStats][ui-stats]), a verbatim mirror of
the client's UI code (doctrine §2). Whether the server's maximum health follows it is unmeasured.
For Classic Era it is
**[?]**: the only source is the gear planner Sixty Upgrades [sixty], which has SoD and Forever
modes, and the Classic Era client's own sheet prints no formula
([Classic Era PaperDollFrame][ui-era-pdf]). The simpler calculator omits it. The sheet check is
[OQ-12](#oq-12-minor-items). Base HP is [?] [OQ-2](#oq-2-base-health).

### Intellect

- `Mana = baseMana + min(Int, 20) + 15 × max(Int − 20, 0)`. **[C]** 15 mana per Int
  [calculator][wt-basestats], [tankadin guide][wt-tankadin]; the Forever sheet uses
  `INTELLECT_BREAK = 20` and `MANA_PER_INTELLECT = 15` **[F] client UI; [?] on the server**
  ([ui-pdfconst]). The
  first-20 term is [?] for Classic Era (Sixty Upgrades only, [sixty]). Base mana **[F]** (table
  above).
- Spell crit per Int, Forever client: paladin **0.0167% (59.88 Int = 1%)**, druid
  **0.0167% (59.88 Int = 1%)**. **[F]** `PlayerExpectedStat.SpellCritPerIntellect` [client] (PlayerExpectedStat, 1.60.1.69913)
- **Confidence note (paladin):** RatingBuster's Classic Era logic, pinned before SoD
  ([`Vanilla_Logic.lua` @d11164c][rb-vanilla]), gives paladins the same 0.0167% per Int (59.9 Int
  per 1%) as the Forever client. Some Classic Era guides give roughly double that
  (29.5 Int per 1% [calculator][wt-basestats]; "~30 Intellect to 1 Crit" [mana guide][wt-mana];
  0.02% per Int [tankadin guide][wt-tankadin]). The client value matches Classic for every other
  class, so either Forever halved paladin Int→spell crit or the server doesn't use this table for
  paladins. It matters for Holy-school crits (Consecration, Exorcism, Holy Shield, Judgement).
  Engine default: the **[F]** client value. [OQ-4](#oq-4-paladin-intellect-to-spell-crit)
- Druid 59.88 matches Classic (60) **[C]**.

### Spirit and mana regeneration

Out of combat health regeneration isn't modelled; nothing in a DPS/TPS fight regenerates health
from Spirit. Mana regeneration matters for paladins (seals, judgements, Consecration) and druids
(powershifting).

- Spirit regen per 2-second tick, outside the five-second rule: paladin and druid
  `15 + Spirit / 5`. **[C]** [calculator][wt-basestats]. That's (7.5 + Spirit/10) mana per second.
- **Five-second rule:** after a spell that costs mana finishes, Spirit-based regen stops for 5 s. A
  free cast (Clearcasting) doesn't start the timer. **[C]** [mana guide][wt-mana]
- **Mp5** from gear and buffs always ticks, inside the five-second rule too:
  1 mp5 = 0.2 mana per second. **[C]** [mana guide][wt-mana]
- Talents that keep a fraction of Spirit regen while casting. Forever values **[F]**
  [changes][fc-changes]:

  | Talent | Class | Fraction |
  | --- | --- | --- |
  | Reflection 3/3 | druid | 50% (Classic 15%) |
  | Reverence 3/3 | paladin, new | 30% |
  | Innervate | druid | +400% regen, 100% continues while casting, 20 s (unchanged) |

  Forever tooltips word it as "Mana regeneration", not "Spirit-based"; treat them as Spirit regen
  only. **[?]**
- Warriors and bears use Rage: see [rage.md](rage.md).

### Defense skill

Each point of defense above 5 × level adds **0.04%** to the chance to be missed and to dodge,
parry and block, and removes 0.04% from the attacker's crit chance. Points below it do the
reverse. The sim's sheet computes the crit part as the defense's **crit reduction**,
`(Def − 300) × 0.04`: 5.60% at 440, where a raid boss can't crit you (the Forever tooltip's
"-5.60% Critical Strike chance", [combat-tables §8](combat-tables.md#8-boss--player-tanks)). For
a tank it also computes the boss's table against the sheet (miss, dodge, parry, block, crit,
crushing and hit, [Example 4](#example-4-a-naked-human-warriors-defensive-sheet)). **[C]**
[Blizzard forum, Oct 2019][bnet-def], [tankadin guide][wt-tankadin]. *Coming with the tank
results UI* ([slice T2](../milestones.md#parallel-tracks-the-tank-specs-first-and-every-remaining-spec-user-priority-2026-09-23)):
the results show the crit reduction and the boss's table then; today the character sheet in the
results shows defense, dodge, parry, block and block value. How the boss's
315 weapon skill interacts with player defense (crits, crushing blows) belongs to
[combat-tables.md](combat-tables.md). Forever changes the sources of defense, not the conversion:
Anticipation gives +20 defense at 5/5 for warriors and paladins (Classic +10). **[F]**
[changes][fc-changes]

### Combat ratings (Forever items)

Forever rewrites Classic's percentage bonuses on items as ratings. The items scrape measured the
ratio of Forever rating to Classic percentage across 4,271 changed items
([items.md, "Forever's ratings"](../data/items.md#forevers-ratings-f-with-open-questions)).
The client's `combatratings.txt` game table has the same costs, identical at all 123 levels
(**[F]** [client] (`combatratings.txt`, 1.60.1.69913); wowsims' extraction agrees, [wsf-cr]).

| Rating on a Forever item | Converts to | Cost | Replaces (Classic item text) | Tag |
| --- | --- | --- | --- | --- |
| Critical Strike Rating | melee, ranged **and** spell crit, all at once | **14 per 1%** | "critical strike by N%" and "critical strike with spells by N%" | [F] tooltip ratio (349 samples); [F] client game table Crit 14; in-combat [?] |
| Hit Rating | melee **and** spell hit, all at once | **10 per 1%** | "chance to hit by N%" and "chance to hit with spells by N%" | [F] tooltip ratio (152 samples); [F] client game table Hit 10; in-combat [?] |
| Dodge Rating | dodge | **12 per 1%** | "chance to dodge … by N%" | [F] (46 samples); [F] client game table Dodge 12; in-combat [?] |
| Parry Rating | parry | **15 per 1%** | "chance to parry … by N%" | [F] (7 samples); [F] client game table Parry 15; in-combat [?] |
| Block Rating | shield block chance | **5 per 1%** | "chance to block … by N%" | [F] (11 samples); [F] client game table Block 5; in-combat [?] |
| Defense Rating | defense skill | **1 per point** | "Increased Defense +N" | [F] (69 samples); [F] client game table Defense 1; in-combat [?] |

- One Forever crit rating raises melee and spell crit together. A Classic item's melee crit
  (or spell crit) raised only that one. Warriors and ferals don't care; for paladins every point
  of crit rating is also Holy spell crit. **[F]**
- "Mana Regeneration" on Forever items replaces "mana per 5 sec" with the same numbers. Treat it
  as mp5. **[F]** wording, **[?]** unit ([items.md](../data/items.md#how-heavily-forever-re-itemized-the-pool)).
- **Ratings whose combat effect is unmeasured:** Expertise Rating, Haste Rating, Armor
  Penetration and Health Regeneration are new on Forever items. The client's `combatratings.txt`
  lists Expertise 10, Haste 10 (melee, ranged and spell) and Armor Penetration 10 (**[F]**
  [client]), but not what a point does in combat. Expertise replaced weapon skill at
  inconsistent ratios on two items, and Health Regeneration replaced hp5 at inconsistent ratios.
  **Don't borrow TBC formulas.** Per
  [D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22),
  the `forever` profile applies three of them by hypothesis, each [?]:
  - **haste rating:** 10 per 1% haste, multiplicative with other haste
    ([damage-and-timing §3.1](damage-and-timing.md#31-haste));
  - **expertise:** 10 per 1%, subtracted from the boss's dodge and parry (hypothesis A,
    [combat-tables §7](combat-tables.md#7-expertise-forever));
  - **armor penetration:** flat armor removed from the target
    ([damage-and-timing §1.2](damage-and-timing.md#12-armor-reduction-debuffs-and-penetration)).

  A rules switch, `unmeasuredRatings: 'apply' | 'ignore'` (default `'apply'` in `forever`;
  `classicEra` has none of these stats), lets the guild see how much a result depends on them.
  Health Regeneration is parsed and displayed with no combat effect (out-of-combat regen isn't
  modelled). The UI shows a [?] warning whenever the selected gear has any of the four.
  [OQ-14](#oq-14-combat-ratings-in-play)

### Attack power formulas

| Class / form | Melee AP at level 60 | Tag |
| --- | --- | --- |
| Warrior | `160 + 2 × Str + flat AP` | [C] (the pre-SoD WarriorSim's level-60 `ap: 160`, [ws-races]); Str ratio [F] |
| Paladin | `160 + 2 × Str + flat AP` | Str ratio [F]; 160 term [?] [OQ-7](#oq-7-base-attack-power-formulas) |
| Druid, caster form | `2 × Str − 20 + flat AP` | Str ratio [F]; −20 term [?] [OQ-7](#oq-7-base-attack-power-formulas) |
| Druid, Cat Form | `2 × Str + Agi − 20 + 120 + PS + flat AP` | form AP [F] (below); Agi term [F] tooltip; −20 [?] |
| Druid, Bear Form | `2 × Str − 20 + 120 + PS + flat AP` | [F] (below) |
| Druid, Dire Bear Form | `2 × Str − 20 + 180 + PS + flat AP` | [F] (below) |

`PS` is Predatory Strikes: +150% of level = **+90 AP** at 3/3 in Cat, Bear and Dire Bear
(unchanged). **[F]** [changes][fc-changes]. `flat AP` covers items, enchants, Battle Shout, Blessing
of Might and consumables (values in [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md)).
AP multipliers (Blood Fury) apply last.

---

## Druid forms

Form AP and health scale by level from spell data:
`value = base + perLevel × (min(level, MaxLevel) − BaseLevel)`, where `MaxLevel = 0` means no cap.
The rows below give the level-60 results for Forever and Classic: **[F]** [client] (SpellEffect,
SpellLevels, 1.60.1.69913) and **[C]** [client] (the same tables, 1.15.9.69722). Attack speed and
damage variance come from `SpellShapeshiftForm` in both clients.

| Form (passive spell) | AP at 60 | Agi → AP | Armor | Max health | Attack speed | Threat |
| --- | --- | --- | --- | --- | --- | --- |
| Cat Form (3025) | **+120** · Forever `12 + 2/level from level 6`; Classic `40 + 2/level from level 20`; both give 120 at level 60 | +1 per Agi [F] | no item multiplier | — | 1.0 s, damage variance 0.4 [F] = [C] | −29% (aura 10, −29) → [threat.md](threat.md) |
| Bear Form (1178) | **+120** · `30 + 3/level`, levels 10–40 (capped at 40) | 0 | item armor +180% (aura 142) **and** a new Forever "bonus armor" +180% (aura 466) | **+560** · `20 + 18/level`, levels 10–40 | 2.5 s, 0.4 | [threat.md](threat.md) |
| Dire Bear Form (9635) | **+180** · `120 + 3/level` from level 40 (cap 70) | 0 | item armor +360% (aura 142) and bonus armor +360% (aura 466) | **+1240** · `600 + 32/level` from level 40 | 2.5 s, 0.4 | [threat.md](threat.md) |

- "Armor contribution from items increased by 180%" means **item armor × 2.8** in Bear Form and
  **× 4.6** in Dire Bear Form. **[C]** / **[F]** (aura 142, value 180 or 360, in both clients)
- **Forever adds a second armor aura (466) to both bear forms.** The Classic client doesn't have it.
  In the modern aura list, 466 multiplies "bonus armor", meaning armor that doesn't come from item
  base armor. If Forever applies the bear multiplier to bonus armor too (enchants, armor kits, Mark
  of the Wild, Thick Hide's new armor), bears gain a lot of armor. **[F]** data, meaning **[?]**
  [OQ-8](#oq-8-bear-armor-multipliers-and-thick-hide)
- The Forever Bear Form tooltip reads "health by 180". That's a tooltip reference pointing at the
  wrong (reordered) effect. The data gives +560 at level 60, the same as Classic. **[F]** data over
  tooltip [fc-sb-druid]
- Forever's Cat Form passive has an extra aura 598 (value 100, misc 1 = Agility), which is probably
  the "plus Agility" AP conversion moved into data. **[?]**

### Talents that change form stats

Values are Forever at max rank, from [changes][fc-changes]. Full talent treatment is in
[druid.md](../classes/druid.md).

| Talent | Forever (max rank) | Classic Era (max rank) |
| --- | --- | --- |
| Heart of the Wild 5/5 (now tier 1) | Int **+10%**; Stamina +20% in Bear/Dire Bear; Strength **+10%** in Cat | Int +20%, Sta +20% (bear), Str +20% (cat) |
| Thick Hide 3/3 (reworked) | In Bear, Cat, Dire Bear, Moonkin: **+3 armor per level (+180 at 60) + 2.00 armor per defense point above 5 × level**, "further increased by multipliers from those forms" | +10% armor from items |
| Predatory Strikes 3/3 | +150% of level = +90 AP in Cat, Bear, Dire Bear | same |
| Sharpened Claws 2/2 | +6% crit in Bear, Dire Bear, Cat | 3/3: +6% |
| Feral Swiftness 2/2 (renamed) | +30% Cat speed, **+4% dodge** (Forever tooltip drops "while in Cat Form": scope [?] [OQ-11](#oq-11-feral-swiftness-dodge-scope)) | +4% dodge in Cat Form |
| Natural Reaction 5/5 (new) | +5% dodge; 100% chance for +5 Rage on dodge | — |
| Nature's Majesty 2/2 (new, Balance) | +4% crit with spells and melee | — |

---

## Other stat-changing talents and spells

Quick reference for the pipeline, all **[F]** from [changes][fc-changes] and the Forever spellbooks
([warrior][fc-sb-warrior], [paladin][fc-sb-paladin]). Class docs own the choice of build.

| Source | Forever effect | Stage in the pipeline |
| --- | --- | --- |
| Blessing of Kings / Greater Blessing of Kings | +10% total stats, 1 h; **baseline, no talent needed** | attribute % multiplier |
| Divine Strength 5/5 (paladin) | +10% Str | attribute % multiplier |
| Divine Intellect 5/5 (paladin) | +10% Int | attribute % multiplier |
| Sacred Duty 2/2 (paladin, new) | +4% total Stamina | attribute % multiplier |
| Living Spirit 3/3 (druid, new) | +15% Spirit | attribute % multiplier |
| Toughness 5/5 (warrior, paladin) | +10% armor from items | item-armor multiplier (base item armor only, not Forever's stat-50 bonus armor [?], [OQ-15](#oq-15-toughness-and-bonus-armor)) |
| Cruelty 5/5 (warrior), Conviction 5/5 (paladin) | +5% melee crit | flat crit |
| Berserker Stance | +3% crit | flat crit |
| Weaponmaster 5/5 (warrior, new) | Axe/Polearm: +5% crit | aura crit on that weapon's attacks only, not spells ([warrior §2.7](../classes/warrior.md#27-weaponmaster-extra-attacks-and-windfury)) |
| Precision 3/3 (paladin, reworded to all hit); Precision 3/3 (warrior Fury, new) | +3% hit | flat hit |
| Anticipation 5/5 (warrior, paladin) | +20 defense (Classic +10) | defense |
| Deflection 5/5 (warrior, paladin) | +5% parry | flat parry |
| Shield Specialization 5/5 (warrior) | +5% block | flat block |
| Holy Power 5/5 (paladin) | +5% spell crit (Holy Shock +15%) | flat spell crit |

---

## Derived-stat pipeline

Compute these in order. Run the pipeline once for the static sheet and again whenever an aura
that changes an attribute, AP or a % modifier gains or loses a stack (Crusader's Holy Strength,
Blood Fury, Elune's Light, Kings, trinkets).

1. **Base attributes** `B[attr]` = race offset + class row (raw, before racial multipliers).
   Base mana, base health, base crits and avoidance come from the tables above.
2. **Flat attribute adds** `F[attr]` = gear + enchants + flat buffs (Mark or Gift of the Wild:
   **+16 all attributes** in Forever, was 12 **[F]** [changes][fc-changes]) + consumables +
   flat procs.
   - **Rating conversion (gear with Forever data)**, using the costs in
     [Combat ratings](#combat-ratings-forever-items), done once on the summed ratings and without
     rounding. **[F]** tooltip ratio; **[?]** in combat.
     - `critRating / 14` → melee, ranged and spell crit %
     - `hitRating / 10` → melee and spell hit %
     - `dodgeRating / 12`, `parryRating / 15` and `blockRating / 5` → those percentages
     - `defenseRating / 1` → defense skill
   - **Classic percentage stats (gear with no Forever data)** add directly, each to its own pool:
     melee crit and spell crit separately, hit, spell hit, dodge, parry, block and defense skill.
   - The pipeline has to accept both forms at once, because about 39% of the item pool still
     carries Classic percentages. Haste Rating (`/10` → haste %), Expertise Rating (`/10` →
     expertise %) and Armor Penetration (flat) are applied when `unmeasuredRatings = 'apply'`
     (D12, [?]); Health Regeneration is carried through with no combat effect.
3. **Attribute % multipliers:** `A[attr] = (B + F) × Π(1 + p_i)` over every % modifier on that
   attribute: Kings, The Human Spirit, Divine Strength, Divine Intellect, Heart of the Wild,
   Sacred Duty, Living Spirit.
   - The modifiers multiply each other, and they apply to base **and** flat bonuses, so Kings
     multiplies Mark of the Wild. **[C]** (the pre-SoD WarriorSim: buff `strmod` values
     multiply, and one multiplier applies to total Str, [ws-player]).
   - Rounding: take `floor` once, after all multipliers. **[?]** WarriorSim truncates. A Classic
     Gnome sheet (33 × 1.05 shown as 35) suggests rounding to nearest instead
     ([OQ-6](#oq-6-rounding)). The DPS effect is well under 0.1%.
4. **Conversions:**
   - `AP = classBaseAP + 2 × Str [+ Agi in Cat] + formAP + PS + flatAP`, then
     `AP = floor(AP × Π(1 + apPct))` (Blood Fury) **[?]** on the scope of the multiplier.
     Creature-type AP ("+X AP vs Undead") is added only against that target type.
   - `meleeCrit% = baseCrit + Agi × critPerAgi + critRating/14 + Σ flat crit` (Classic-form gear
     "+x% crit", talents, stance, racial weapon auras when that weapon is in either hand, Leader of
     the Pack, consumables).
     **Keep the aura-crit total separately**: [combat-tables.md](combat-tables.md) suppresses it
     against +3 bosses.
   - `hit% = hitRating/10 + Σ flat hit` (Classic-form gear, Precision, Tauren Endurance). Spell
     hit gets the same `hitRating/10` plus Classic spell-hit lines.
   - `spellCrit% = baseSpellCrit + Int × spellCritPerInt + critRating/14 + Σ flat spell crit`
     (including aura-290 racials).
   - `Def = 300 + defenseRating + Σ defense skill` (Classic-form gear, Anticipation), and
     `critReduction = (Def − 300) × 0.04` ([Defense skill](#defense-skill)).
   - `dodge% = baseDodge + Agi / 20 + dodgeRating/12 + Σ dodge% + (Def − 300) × 0.04`.
   - `parry% = 5 + parryRating/15 + Σ parry% + (Def − 300) × 0.04` for warrior and paladin, 0 for
     druid.
   - `block% = 5 + blockRating/5 + Σ block% + (Def − 300) × 0.04` with a shield equipped, else 0.
   - `blockValue = (shieldBV + flatBV + floor(Str / 20)) × Π(1 + bvPct)`.
   - `armor = itemArmor × (1 + Σ item-armor %) + bonusArmor + 2 × Agi`. Item-armor % covers
     Toughness and the bear +180% or +360%, added together; Classic additive stacking is
     assumed **[?]**. Bonus armor covers armor enchants and kits, Mark of the Wild (+385 armor in
     Forever **[F]**), Devotion Aura and Forever Thick Hide.
     - **What Toughness multiplies [?].** `itemArmor` is an item's base armor: for an item with
       Forever data, the armor its item level, quality and slot give, **without** Forever's
       stat-50 bonus armor, which goes to `bonusArmor` ([items.md](../data/items.md#stats-armor-and-block-value));
       for a Classic Era fallback item, its whole stored armor, including any extra armor that
       Forever would store as stat 50. So Toughness ("Increases your Armor value from items by
       10%") multiplies a Classic-fallback item's extra armor but not a Forever item's. The two
       cases are the data's, not a rule: whether the server's Toughness multiplies stat 50 is
       unknown ([OQ-15](#oq-15-toughness-and-bonus-armor)).
     Whether bear aura 466 also multiplies bonus armor is **[?]**
     ([OQ-8](#oq-8-bear-armor-multipliers-and-thick-hide)).
   - `maxHP = floor((baseHP + min(Sta, 20) + 10 × max(Sta − 20, 0) + formHP + flatHP) × Π(1 + hpPct))`
     (Tauren ×1.05). Flat-then-% order is **[?]**, following the modern aura model (flat health
     auras are "total value", % health auras are "total %").
   - `maxMana = baseMana + min(Int, 20) + 15 × max(Int − 20, 0) + flat mana`.
   - Maximum Rage, haste and weapon skill: [rage.md](rage.md) and
     [damage-and-timing.md](damage-and-timing.md). Weapon skill is 300 plus item skill; no race
     adds any in Forever **[F]**.
5. **Sheet vs combat.** The sim's stat panel should show what the in-game character sheet shows,
   so the guild can compare them. Combat then applies target-dependent adjustments from
   [combat-tables.md](combat-tables.md), which owns them and whose rules differ by profile.
   - *Crit*: the sheet shows `meleeCrit%` against an equal-level target. Against a level-63 boss,
     combat subtracts a weapon-skill part and `min(aura crit, 1.8%)`. The skill part is **0.6%**
     at 300 skill in `forever` (the default; [F] client UI, [?] in combat) and **3.0%** in
     `classicEra` ([C]
     [Magey][magey-at]); the 1.8% is [C] and unverified in Forever
     ([combat-tables §4.4](combat-tables.md#44-crit-suppression)).
   - *Hit*: the sheet shows gear and talent +hit only. Combat uses an 8% base miss against a +3
     boss. `classicEra` ignores the first 1% of +hit when the skill gap is over 10 [C];
     `forever` has no hit suppression ([F] tooltip; [?] in combat)
     ([combat-tables §4.3](combat-tables.md#43-hit-suppression)).
   - *Weapon skill*: the sheet shows "300 + bonus". For crit against mobs, skill above 5 × level
     is ignored.
   - *AP*: the sheet includes form AP and Predatory Strikes. It excludes creature-type AP and
     target debuffs.
   - *Spirit*: the sheet includes The Human Spirit.

---

## WoW Forever deviations

Stat-relevant changes versus Classic Era 1.15.9, all **[F]**:

1. **New race/class pairs:** Undead paladin (Horde paladins exist), and two Skyborne races (one per
   faction) that can be warriors or druids. [client] (CharBaseInfo), [fc-racials]
2. **Weapon-skill racials are gone.** Human Sword Specialization is now +2% crit with swords, Orc
   Axe Specialization +1% crit with axes, and Dwarves gain Mace Specialization (+1% crit with maces).
   Human Mace Specialization is removed. Nobody has 305 skill from race.
3. **Tauren Endurance adds +1% hit** (melee, ranged, spell) on top of +5% health.
4. **Blood Fury** is +10% AP, ranged AP and spell power for 15 s with no healing penalty. Classic
   gave +25% base melee AP.
5. **Berserking** is a flat +10% attack and cast speed for 10 s at no cost. Classic scaled 10–30%
   with missing health.
6. **New racial cooldowns:** Elune's Light (+10% crit, 15 s), Eureka! (warrior: 3 abilities at −40%
   Rage and +10% damage), Shatter Curse, Will to Survive, Rapid Regeneration. Stoneform is now −10%
   physical damage taken instead of +10% armor.
7. **New passives:** Touch of the Grave (Undead drain proc), Big Game Hunter (Dwarf, +5% vs Beasts),
   Wind Blessed (Skyborne, +1% haste), Elemental Insight (Skyborne, +5% vs Elementals).
8. **Gnome Expansive Mind:** +5% maximum Rage for warriors instead of +5% Intellect.
9. **All racial resistances are removed:** Frost (Dwarf), Nature (Night Elf, Tauren), Arcane
   (Gnome), Shadow (Undead).
10. **Blessing of Kings is baseline** (no talent) and lasts 1 hour.
11. **Heart of the Wild is halved** for Int and Cat Strength (10%); the Bear Stamina bonus stays
    at 20%.
12. **Thick Hide** is reworked into flat form armor that scales with level and defense. Bear and
    Dire Bear gain a second armor multiplier aura (466) whose effect is still unverified.
13. **New dodge and defense sources:** Natural Reaction (+5% dodge); Anticipation doubled to
    +20 defense. Feral Swiftness dodge may no longer be restricted to Cat Form.
14. **Precision** gives all hit for paladins (Classic: melee only), and warriors get a new Fury
    Precision (+3% hit). Paladins get Sacred Duty (+4% Stamina).
15. **Cat Form's passive AP is rebased** (12 + 2/level from level 6 instead of 40 + 2/level from
    level 20). It gives the same +120 AP at 60. Bear and Dire Bear AP and health at 60 are unchanged.
16. **The client carries crit slopes (`PlayerExpectedStat`, new table).** They match Classic
    everywhere except **paladin Int → spell crit (59.88 Int per 1% vs about 29.5 in Classic)**,
    which may be a real nerf ([OQ-4](#oq-4-paladin-intellect-to-spell-crit)).
17. **No Legacy perk affects combat stats.** The 21 known perks cover XP, professions, travel, food
    duration and buff duration. [fc-legacy]
18. **Items use combat ratings.** Costs are level-independent: crit 14, hit 10, dodge 12, parry 15
    and block 5 per 1%, and defense 1 per point. One crit rating covers melee, ranged and spell
    crit; one hit rating covers melee and spell hit. Expertise, Haste Rating, Armor Penetration
    and Health Regeneration are new, and their combat effects are unmeasured; the first three
    apply by hypothesis (D12).
    ([items.md](../data/items.md#forevers-ratings-f-with-open-questions), [client] game table
    `combatratings.txt`)

Checked, **no Forever change found**: HP per Stamina is 10 in the client's `hppersta.txt`, as in
Classic ([F] [client]). These values aren't in the client, so the Classic values stand until
measured: mana per Intellect, dodge and armor per Agility, block value per Strength, Spirit regen,
the five-second rule, and the defense conversion.

---

## Implementation notes

- **Stat block model:** for each attribute keep `base`, `flat` and a list of % modifiers, and
  derive everything through one pure `computeStats(input) → Stats` function. Keep aura-crit
  separate from Agility crit because combat tables treat them differently. The function must be
  deterministic and unit-tested from the [worked examples](#worked-examples).
- **Data:** base attributes live in a table keyed by (race, class) and built as `classRow + raceOffset`,
  so one measured naked sheet per class fills every race. Every [?] value in that table must be
  surfaced in the UI as an assumption (doctrine §4). An unmeasured row takes a
  [D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)
  placeholder if one qualifies (the druid rows), flagged the same way; a spec whose base row has
  neither (the paladin, for now) reports that instead of simulating. The placeholders live in one
  replaceable table (`BASE_PLACEHOLDERS`), which the results list among their assumptions
  ([Other base values](#other-base-values-at-level-60)); base health, unmeasured for every class,
  is one, and every druid base value is (its attribute rows, caster attack power, crit, spell crit,
  dodge and health). `CLASS_BASE` holds measured values only.
- **Racials:** implement by spell ID. Weapon-conditional crit (20597, 20574, 1259719) checks the
  subtypes of the weapons equipped in either hand (the effect's `weapons` condition); when one
  matches, it is flat aura crit (melee and spell) for the whole character, as the racials'
  tooltips read ("while you have a sword equipped"). A dual-wield warrior with a mace and a sword
  gets the +2% on both hands' attacks. Weaponmaster's axe and polearm crit (12700) is a per-weapon
  bonus instead (a `weaponCrit` effect: aura crit on that hand's attacks only, no spell crit), as
  its tooltip reads. Both readings are **[?]**
  ([warrior Q15](../classes/warrior.md#9-open-questions)), and a result with a matching weapon
  and a different one lists them among its assumptions. Creature-type
  racials (Beast Slaying, Big Game Hunter, Elemental Insight) multiply damage only when the target
  type matches: see [encounter.md](encounter.md).
- **Spell crit in the engine.** An all-crit aura (290) adds to melee and spell crit alike, as
  step 4 says, wherever it comes from: the weapon racials, Berserker Stance, Recklessness,
  Elune's Light, Weakness Analyzer, Leader of the Pack, Elixir of the Mongoose, Grilled Squid and
  the Flask of Natural Aggression's zone crit. Timed ones (Recklessness, Elune's Light, Weakness
  Analyzer) and the stance re-derive spell crit when they start and end. Where Classic Era's
  spell is aura 52 (melee and ranged crit only: Berserker Stance, Recklessness, Leader of the
  Pack, Mongoose), `classicEra` adds melee crit only; a test checks each of those rows' aura type
  in both clients. Weaponmaster's axe and polearm crit is the one aura-290 source whose tooltip
  names weapons, so it gives no spell crit (above). For warriors spell crit only decides magic
  procs' crits (Fiery Weapon, [combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic)),
  well under 0.1% of DPS.
- **Cooldown racials** (Blood Fury, Berserking, Elune's Light, Eureka!) are rotation options with
  sensible defaults in the class docs. They are off the GCD (`StartRecoveryTime` 0); Stoneform is
  on it (1,500 ms) **[F]** [client] (SpellCooldowns, 1.60.1.69913). Tank-only racials (Stoneform,
  Shatter Curse) default off.
- **Skipped** (under the 0.5% rule, doctrine §4): out-of-combat health regen, resistances,
  utility racials, and Human Spirit's effect on paladin regen (it is modelled but tiny).
- **Rounding:** floor attributes after multipliers and floor AP and HP. Keep percentages as
  floats. Tests should allow ±1 on attributes until [OQ-6](#oq-6-rounding) closes. Floor through
  a helper that adds a tiny epsilon (for example `Math.floor(x + 1e-9)`), so an exact product
  such as 1820 × 1.05 can't land on 1910.999… because of floating-point error.
- **Ratings:** the item model carries both forms, Forever ratings (`critRating`, `hitRating`, …;
  see [items.md](../data/items.md)) and Classic percentages. Put the rating costs in one constants
  table (the old stats tagged [F]; haste and expertise [F] as client values, [?] in combat) so a
  beta measurement can change them in one place. Haste, expertise and armor penetration follow
  their D12 hypotheses when
  `unmeasuredRatings = 'apply'` (the `forever` default) and are ignored when it is `'ignore'`;
  health regeneration has no combat effect. Show a UI warning whenever gear carries any of them,
  and don't approximate them with TBC rules.

---

## Worked examples

These become unit tests. Every number is level 60. Examples 2 and 3 need base values that are
still [?] ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes) to
[OQ-5](#oq-5-base-dodge-parry-and-block)). Instead they use a **synthetic fixture**: round numbers
labelled as such, which test the pipeline arithmetic only. The synthetic numbers must never be
read into the base-stats table. Everything else (slopes, base mana, form AP, racials, talents,
buffs) uses the real tagged values from this doc. Once OQ-1 closes, add a real-base variant of
each example next to the synthetic one.

### Example 1: naked Human warrior

Inputs: Human warrior, no gear, no weapon (Sword Specialization inactive), no talents, no buffs,
Battle Stance. Base attributes: Str 120, Agi 80, Sta 110, Int 30 **[C]** ([ws-races]); Spi raw 45
**[?]** ([ws-levelstats], post-SoD only).

| Stat | Computation | Result |
| --- | --- | --- |
| Strength | 120 | **120** |
| Agility | 80 | **80** |
| Stamina | 110 | **110** |
| Spirit | floor(45 × 1.05) | **47** |
| Attack power | 160 + 2 × 120 | **400** |
| Melee crit (sheet) | 0 + 80 × 0.05 | **4.00%** |
| Hit (sheet) | no sources | **0%** |
| Dodge | 0 + 80 / 20 | **4.00%** (base dodge 0 [C]) |
| Armor | 2 × 80 | **160** |
| Max HP | 1,689 (placeholder) + 20 + 90 × 10 | **2,609** (base health [?] [OQ-2](#oq-2-base-health)) |
| Weapon skill | no racial bonus in Forever | **300** |

Against a level-63 boss ([combat-tables.md](combat-tables.md) governs; no aura crit, so no 1.8%
suppression):
- `forever` (default): crit 4.00 − 0.60 = **3.40%**; miss 8%, hit cap 8%.
- `classicEra`: crit 4.00 − 3.00 = **1.00%**; miss 8%, hit cap 9% (the first 1% of +hit is
  ignored).

**Variant 1b: plus Blessing of Kings** (×1.10, [F]): Str floor(132.0) = **132**, Agi **88**,
Sta **121** → AP 160 + 264 = **424**, crit 88 × 0.05 = **4.40%**, armor **176**, HP
1,689 + 20 + 101 × 10 = **2,719**.

**Variant 1c: holding a one-handed sword, no Kings:** sheet crit 4.00 + 2.00 (Sword
Specialization, aura crit) = **6.00%**. Against a +3 boss: `forever` 6.00 − 0.60 − 1.80 =
**3.60%**; `classicEra` 6.00 − 3.00 − 1.80 = **1.20%**.

### Example 2: Tauren druid in Cat Form

Inputs: Tauren druid, no gear, Cat Form. Talents: Heart of the Wild 5/5 (Forever: Str +10% in Cat,
Int +10%), Predatory Strikes 3/3, Sharpened Claws 2/2.

**Synthetic fixture: tests pipeline arithmetic only, not real base stats.** Base Str 100, Agi 100,
Sta 100, Int 100, Spi 100; base health 1000; base melee crit 0%; base dodge 0%. The real values
are [?] ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes),
[OQ-2](#oq-2-base-health), [OQ-3](#oq-3-base-melee-and-spell-crit),
[OQ-5](#oq-5-base-dodge-parry-and-block)). Real values used: base mana 1244 [F], Cat Form +120 AP
[F], Predatory Strikes +90 [F], crit 0.05% per Agi [F], Tauren Endurance [F].

| Stat | Computation | Result |
| --- | --- | --- |
| Strength (Cat) | floor(100 × 1.10) | **110** |
| Agility | 100 | **100** |
| Intellect | floor(100 × 1.10) | **110** |
| Attack power | 2 × 110 − 20 + 100 + 120 (Cat Form) + 90 (Predatory Strikes) | **510** (−20 term [?] [OQ-7](#oq-7-base-attack-power-formulas)) |
| Melee crit (sheet) | 0 + 100 × 0.05 + 6 (Sharpened Claws) | **11.00%** |
| Hit (sheet) | Tauren Endurance | **1%** |
| Dodge | 0 + 100 / 20 | **5.00%** |
| Max mana | 1244 + 20 + 90 × 15 | **2614** (irrelevant in Cat except for powershifting) |
| Max HP | floor((1000 + 20 + 80 × 10) × 1.05) = floor(1911.0) | **1911** |
| Armor | 2 × 100 (no items; Cat has no item-armor multiplier) | **200** |
| Swing | Cat Form combat round time | **1.0 s** |

Classic comparison with the same fixture: Classic's Heart of the Wild (Str +20%) gives Str
floor(120.0) = 120 and AP **530**. Forever's halved talent costs 20 AP here.

### Example 3: geared Human Retribution paladin

Inputs (illustrative totals, not a real gear set):

- **Base: synthetic fixture, tests pipeline arithmetic only, not real base stats.** Human paladin
  with base Str 100, Agi 100, Sta 100, Int 100, Spi raw 100; base health 1000; base melee crit
  0%; base spell crit 0%; base dodge 0%. The real values are [?]
  ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes) to
  [OQ-5](#oq-5-base-dodge-parry-and-block)). Real values used: base mana 1512 [F], the paladin
  slopes [F], Sword Specialization [F], and the buffs and talents below.
- **Gear totals:** +120 Str, +40 Agi, +110 Sta, +60 Int, +60 AP, **+10 Hit Rating** and
  **+14 Critical Strike Rating** (Forever items), with a two-handed **sword** (so Sword
  Specialization applies).
- **Buffs:**
  - Mark of the Wild, rank 7, Forever: +16 attributes, +385 armor **[F]** [changes][fc-changes]
  - Blessing of Kings: +10% **[F]**
  - Blessing of Might, rank 7, Forever: +133 AP **[F]** [changes][fc-changes]
- **Talents:** Divine Strength 5/5 (+10% Str), Conviction 5/5 (+5% melee crit), Precision 3/3 (+3% hit).

| Stat | Computation | Result |
| --- | --- | --- |
| Strength | floor((100 + 120 + 16) × 1.10 × 1.10) = floor(285.56) | **285** |
| Agility | floor((100 + 40 + 16) × 1.10) = floor(171.6) | **171** |
| Stamina | floor((100 + 110 + 16) × 1.10) = floor(248.6) | **248** |
| Intellect | floor((100 + 60 + 16) × 1.10) = floor(193.6) | **193** |
| Spirit | floor((100 + 16) × 1.05 × 1.10) = floor(133.98) | **133** |
| Attack power | 160 + 2 × 285 + 60 + 133 | **923** (160 term [?] [OQ-7](#oq-7-base-attack-power-formulas)) |
| Melee crit (sheet) | 0 + 171 × 0.0506 + 14/14 (rating) + 5 (Conviction) + 2 (Sword Specialization) | **16.65%** (16.6526) |
| Aura crit (tracked separately) | 1 (gear) + 5 + 2 | **8%** (whether rating crit counts as aura crit for suppression belongs to [combat-tables.md](combat-tables.md)) |
| Hit (sheet) | 10/10 (rating) + 3 (Precision) | **4%** (spell hit also gets +1% from the rating) |
| Spell crit (sheet) | 0 + 193 × 0.0167 + 14/14 (the rating also covers spells) + 2 (Sword Specialization is aura 290) | **6.22%** (6.2231; Classic-slope alternative in [OQ-4](#oq-4-paladin-intellect-to-spell-crit)) |
| Max mana | 1512 + 20 + 173 × 15 | **4127** |
| Max HP | 1000 + 20 + 228 × 10 | **3300** |
| Dodge | 0 + 171 / 20 | **8.55%** |
| Armor | itemArmor + 385 (Mark of the Wild) + 2 × 171 | **itemArmor + 727** |

**Variant 3b: the same +1% crit from a Classic item with no Forever data** ("Improves your chance
to get a critical strike by 1%"). Melee crit is unchanged at **16.65%**. Spell crit drops to
**5.22%** (5.2231), because a Classic melee-crit line doesn't touch spell crit. The test should
feed both item forms through the same pipeline.

### Example 4: a naked Human warrior's defensive sheet

Inputs: Example 1's warrior in Defensive Stance, holding Arbiter's Blade (a one-handed sword:
+8 Stamina, +5 Intellect) and Sacred Protector (a Forever shield: +15 Stamina, +10 Intellect, no
block value in the client, [items.md](../data/items.md#stats-armor-and-block-value)). No talents
or buffs. Base health is D24's placeholder, and base parry and block are unmeasured [?]
([OQ-2](#oq-2-base-health), [OQ-5](#oq-5-base-dodge-parry-and-block)).

| Stat | Computation | Result |
| --- | --- | --- |
| Max HP | 1,689 + 20 + (133 − 20) × 10 | **2,839** |
| Defense | 5 × 60 | **300** |
| Dodge | 0 + 80 / 20 | **4.00%** |
| Parry | 5 (a weapon in hand) | **5.00%** |
| Block | 5 (a shield) | **5.00%** |
| Block value | 0 (the shield) + floor(120 / 20) | **6** |
| Crit reduction | (300 − 300) × 0.04 | **0.00%** |

Against a level-63 boss ([combat-tables §8](combat-tables.md#8-boss--player-tanks)): miss
**4.40**, dodge **3.40**, parry **4.40**, block **4.40**, crit **5.60**, crushing **15.00**, hit
**62.80**.

---

## Open questions

**How to measure.** There are two routes. Each question below says which one it needs.

- **Route A: Classic Era, level 60 (tier 3, allowed).** The Forever beta is capped around level
  20, so no level-60 Forever sheet exists yet. Guild members with level-60 characters on a live
  **Classic Era** realm (normal or Hardcore, **not** Season of Discovery) can take naked
  character-sheet screenshots. Results are tagged **[C]**, noted as "measured on Classic Era", with
  the realm, client build, date and character.
- **Route B: Forever beta at its level cap (tier 2).** Forever-specific behaviour (new auras,
  ratings, changed racials, the paladin Int slope) is tested on the beta at whatever level it
  allows. When the answer depends on level, repeat the same test on a Classic Era character of the
  same level and compare the two.
- **Later, Route C: Forever at level 60,** once the cap lifts. Take one naked sheet per class to
  confirm Forever didn't change the Route A values, plus the Skyborne sheets, which only Forever
  can provide.

**The standard naked sheet:**
- **Setup:** every item removed including weapons, bags don't matter; no buffs (right-click them
  off, and note any that can't be removed); talents reset or listed; caster form or Battle Stance;
  character sheet open.
- **Attributes:** hover Str, Agi, Sta, Int and Spi. The tooltip splits base from bonus.
- **Melee:** attack power, crit chance, hit, and weapon skill (unarmed, which should be 300).
- **Spell, for paladins and druids:** spell crit for Holy (paladin) and Nature (druid).
- **Defense:** armor, defense, dodge, parry, and block (block with a shield equipped).
- **Pools:** maximum health and maximum mana.
- **Details to post:** realm, client build, date, race, class and level.

### OQ-1: paladin, druid and Skyborne base attributes
The druid class row and all values for both Skyborne races are unknown; the paladin's are [C].
Under [D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23) (replacing the
2026-09-22 rule "no forbidden-source placeholders"), the rows below may stand in as flagged `[?]`
placeholders, so the paladin and druid specs no longer wait for this measurement. The druid's
are in use; the paladin's rows are [C] (below).

**Druids (2026-09-23).** Every druid base value in use is a [?] placeholder under D24, not
evidence. The Night Elf and Tauren rows are the [mangos][mz-levelstats] emulator's 1.12 rows
(D24 rule 2: they agree exactly with the [C] race offsets); ClassicSim's pre-SoD rows reproduce
them, which corroborates them but isn't evidence
([Paladin and druid base attributes](#paladin-and-druid-base-attributes)). The sim uses the
druid class row (those rows minus their offsets) for both Skyborne races. The druid's other base
values are D24 placeholders too, each with its origin (a copy of a private server's tables, so
not evidence) and its estimated effect:

| Value | Placeholder | Origin | Effect if wrong |
| --- | --- | --- | --- |
| Base attributes (Night Elf, Tauren; the class row for Skyborne) | the rows above | [mangos][mz-levelstats] | Each 5 points of Str or Agi in the class row: about ±0.5% of cat DPS, ±0.3–0.7% of bear TPS; Sta none today |
| Base health | 1,483 ([OQ-2](#oq-2-base-health)) | [emulator class table][mz-classlevelstats], copied by [wowsims/classic][wsc-base] | ±100: bear rage ∓1–1.5%, TPS about ±0.3–0.7%; none for cat |
| Base melee crit | 0.9% ([OQ-3](#oq-3-base-melee-and-spell-crit)) | [RatingBuster][rb-vanilla], [wowsims/classic][wsc-base] | Plausibly 0–1% (below): cat DPS −1.5% to +0.2% with the cat rotation (−0.8% to +0.1% while the sim swings white only). **Over D24's 1%: measure it first** |
| Base spell crit | 1.8% ([OQ-3](#oq-3-base-melee-and-spell-crit)) | the same | None for cat or bear |
| Base dodge | 0.9% ([OQ-5](#oq-5-base-dodge-parry-and-block)) | the same | Under ±0.3% of bear TPS |
| Caster-form attack power | −20 ([OQ-7](#oq-7-base-attack-power-formulas)) | [wowsims/classic][wsc-base] | About 0.7% of cat DPS |

The sheets below still settle them all.

**Paladins.** The attribute rows are [C] ([ClassicSim][cs-druid], pre-SoD;
[Paladin and druid base attributes](#paladin-and-druid-base-attributes)). The Human and Dwarf
paladin sheets below would still confirm them: ClassicSim's numbers equal the emulator table, and
the one genuine naked Classic Era sheet found (a Human rogue) differs from its rogue row by 5
Stamina. Effect: ±5 in one attribute moves Ret DPS about ±0.3% (Strength or Agility) and hardly
at all (Intellect, Spirit). The paladin's base health, melee and spell crit and dodge are D24
placeholders ([OQ-2](#oq-2-base-health), [OQ-3](#oq-3-base-melee-and-spell-crit),
[OQ-5](#oq-5-base-dodge-parry-and-block)).

**Resolution, Route A (Classic Era, level 60, the standard naked sheet), sheets needed:**

| Sheet | Why | Fields to read |
| --- | --- | --- |
| Human paladin | paladin class row | the five attributes (base part), health, mana (expect 1512 plus Int), melee AP, melee crit, Holy spell crit, dodge, parry, block with a shield, defense |
| Dwarf paladin | confirms the race-offset rule for paladins | the same fields |
| Night Elf druid | druid class row | the five attributes, health, mana (expect 1244 plus Int), caster-form AP, melee crit, Nature spell crit, dodge, defense. Then shift to Cat, Bear and Dire Bear and read AP, crit, armor and health in each |
| Tauren druid | confirms the race-offset rule for druids | the same fields (health includes Endurance's ×1.05) |
| Human or Night Elf warrior, and Orc or Tauren warrior | confirm the [C] WarriorSim rows and the offset rule on a live Era realm, and supply the [?] Spirit values (post-SoD source only) | the five attributes, health, AP, melee crit, dodge, parry, block with a shield, defense |
| Gnome warrior (optional) | settles rounding: Era still has +5% Int, 33 × 1.05 = 34.65 ([OQ-6](#oq-6-rounding)) | Intellect |

- **Undead paladin:** Classic Era doesn't have one. Derive it as the paladin class row plus the
  Undead offset [C], and confirm on Forever (Route C).
- **Skyborne warriors and druids:** Route C only.

*Found in a vanilla emulator database [mz-levelstats]. Under D24 these rows may stand in, tagged
"[?] placeholder (D24)", and so may test fixtures, until a sheet replaces them. The druid rows do;
the paladin rows equal ClassicSim's [C] rows, which the engine uses:*

| Race and class | Str | Agi | Sta | Int | Spi (sheet) |
| --- | --- | --- | --- | --- | --- |
| Human paladin | 105 | 65 | 100 | 70 | 78 |
| Dwarf paladin | 107 | 61 | 103 | 69 | 74 |
| Night Elf druid | 62 | 65 | 69 | 100 | 110 |
| Tauren druid | 70 | 55 | 72 | 95 | 112 |

These rows are internally consistent with the [C] race offsets, which is a useful cross-check on
the Route A screenshots once they arrive. ClassicSim's pre-SoD druid rows equal these exactly
(corroboration, not evidence: they came from a guide whose method is unknown).

### OQ-2: base health
The client has no base-HP game table (no `octbasehp*` file in build 1.60.1.69913, [client]), so
this stays a sheet measurement. It matters to tank rage too: Forever's rage from damage taken
divides by maximum health ([rage.md](rage.md#forever-)); left out, that rage came out about 39%
high for the default Protection warrior.
**In use as [D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)
placeholders:** warrior 1,689, paladin 1,381, druid 1,483, each "[?] placeholder (D24); origin:
the emulator's class table [mz-classlevelstats], not evidence". The only other sources,
wowsims/classic's `base_stats.go` [wsc-base] (and an old Classic-branded sim for the druid), copy
it. No Classic Era measurement exists, and the Classic Era 1.15.9 client has no base-health table
either. The sheets below replace them; the results list them among their assumptions.
**What it moves:** today, almost nothing. Nothing spends rage yet (Protection has no rotation),
so the bar sits full: off by ±100, base health moves the default Protection warrior's TPS by about
0.001% (20,000 fights on common seeds), and leaving it out altogether moved it 0.02%. Once a
rotation spends its rage, it matters more. Rage from damage taken is about 44% of that warrior's
rage (540 of 1,225 a fight). 100 more base health cuts it 1.6% (100 less adds 1.7%), so the rage
moves about 0.7%, and TPS moves that much times the share of its threat that comes from spending
rage: about 0.3–0.7% for a share between 40% and 100%. Left out, as the engine did before D24,
base health inflated that rage by 20–40%. DPS specs take no damage and don't notice it.
**Route A:** read maximum health from the OQ-1 sheets (divide the Tauren value by 1.05). Then
`baseHP = HP − 20 − 10 × (Sta − 20)`.

### OQ-3: base melee and spell crit
Warrior base melee crit is 0% **[C]**. Paladin and druid base melee and spell crit are unknown.
The engine uses **placeholders [?]** for the paladin's under [D24](../decisions.md), and lists them
among its assumptions:
- **Base melee crit 0.7%.** Origin: the emulator, via [wowsims/classic][wsc-base]; not evidence.
  **Sources conflict:** [RatingBuster][rb-vanilla] (pre-SoD, but its table copies the emulator's
  for most classes) gives 1.7%, and a second-hand report of a naked level-60 Human paladin showing
  about 3% crit ([Blizzard forums][bnet-base], 2020) implies about 0 (65 Agi × 0.0506 = 3.29%).
  The likely error is the distance from 0.7% to either end, −0.7 to +1.0 points, and it moves
  default Ret DPS by **−0.62% to +0.92%** (6,000 fights each way). That's within D24 rule 1's
  line of about 1%, so the placeholder stands; the Human paladin sheet (OQ-1) settles it.
- **Base spell crit 3.5%.** Origin: [RatingBuster][rb-vanilla] and [wowsims/classic][wsc-base];
  not evidence. It touches only the magic-class spells (Consecration, Exorcism): about 0.2–0.5% of
  Ret DPS against 0%.
**Route A:** from the OQ-1 sheets, base melee crit = shown − Agi × slope, and base spell crit =
shown − Int × slope. Use the Classic Era slopes here (20 Agi per 1%; about 29.5 Int per 1% for
paladins and 60 for druids). TBC-era table values (paladin 0.65% melee and 3.34% spell; druid
0.96% and 1.85%) come from a forbidden ruleset and are not adopted. The druid's 0.9% melee and
1.8% spell crit are in use as D24 placeholders ([OQ-1](#oq-1-paladin-druid-and-skyborne-base-attributes)),
not evidence.

**Measure the druid's base melee crit first.** Its likely error is over D24's 1%. The true value
could plausibly be anywhere from 0% (no class base crit, as Classic Era's warrior has none [C])
to about 1%. Crit is worth about 1.7% of cat DPS per point with the cat rotation, so that range
moves cat DPS by −1.5% to +0.2% (measured on today's white-swing model: −0.8% to +0.1%). One
naked Night Elf or Tauren druid sheet settles it: shown melee crit − Agi / 20.

### OQ-4: paladin Intellect to spell crit
The Forever client says 59.88 Int per 1% at level 60. [RatingBuster's][rb-vanilla] pre-SoD
Classic Era logic says 59.9 too, so the client agrees with it; the "about 29.5" in some Classic
guides traces back to 2005 addon text ([TheorycraftClassic][tcc-formulas], [?]). Effect: small,
since only magic-class spells (Consecration, Exorcism) use spell crit.
**Route B:** on the beta, a paladin notes the sheet's Holy spell crit, gains a known amount of Int
(an Int item or buff) and notes it again. The slope is Δcrit / ΔInt. Then repeat the exact test
on a Classic Era paladin of the **same level**. The two slopes are the same if Forever kept
Classic's paladin value; if the beta slope is about half, the nerf is real. The Forever client's
own paladin slope is in `PlayerExpectedStat`: 0.000417 per Int at level 20 (24.0 Int per 1%),
0.000313 at level 30 and 0.000167 at level 60 **[F]** [client] (PlayerExpectedStat,
1.60.1.69913). The client value is settled; whether the server uses it is the open part.

### OQ-5: base dodge, parry and block
Warrior base dodge is 0% **[C]** ([RatingBuster][rb-vanilla]). Base parry and block 5% for
warriors and paladins are [?] ([bnet-base]), and the paladin's 0.7% and the druid's 0.9% base dodge
are in use as D24 placeholders (origin: [RatingBuster][rb-vanilla] and [wowsims/classic][wsc-base]),
not evidence. A naked Human paladin reported about 3% dodge at 65 Agility, which implies about
0 ([bnet-base]). A point
of any of them moves a point of the boss's swings between that outcome and a hit
([combat-tables §8](combat-tables.md#8-boss--player-tanks)); base dodge moves a tank's TPS by
under ±0.3%.
**Route A:** read dodge, parry and block (warrior and paladin with a shield) from the OQ-1 sheets.
Base dodge = shown − Agi / 20; defense is 300, so there is no defense term. With a known shield,
check that block value = the shield's block value + floor(Str / 20) by hovering block.

### OQ-6: rounding
**Route A**, either shot:
- Gnome warrior, naked: Intellect reads **34** if the server truncates 33 × 1.05, and **35** if it
  rounds.
- Night Elf warrior, naked, with Blessing of Kings: Str 117 × 1.1 = 128.7 reads **128** or
  **129**, and AP reads **416** or **418**.

### OQ-7: base attack power formulas
**Route A:** read AP from the OQ-1 sheets for a paladin (expect 160 + 2 × Str) and a druid in
caster form (2 × Str − 20), Cat Form (2 × Str + Agi + 100, untalented), Bear Form (2 × Str + 100)
and Dire Bear Form (2 × Str + 160). Druids have Cat Form at 20, so **Route B** can also check
the caster and Cat formulas at the beta cap: Cat AP at level L should be
2 × Str + Agi − 20 + 12 + 2 × (L − 6). The druid's −20 is in use as a D24 placeholder, not
evidence.

### OQ-8: bear armor multipliers and Thick Hide
Forever adds aura 466 (bonus armor +180% or +360%) to the bear forms.
**Route B, in Bear Form (available at level 10):** note armor with and without Mark of the Wild
(bonus armor). Armor rises by the buff's armor alone if bonus armor isn't multiplied, and by
2.8 times it if it is. Repeat with Thick Hide trained against untrained: Forever's text predicts
+1 armor per level per rank, then the form multiplier on top. Dire Bear (level 40) waits for
Route C. **The sim meanwhile:** in `forever`, Dire Bear Form multiplies bonus armor by 4.6 as well
as item armor [?]; in `classicEra` only item armor. The +360% item-armor bonus is added to other
item-armor bonuses, as RatingBuster's Classic Era code adds it to Classic's Thick Hide ([C]
[rb-vanilla]).

### OQ-9: Blood Fury scope
**Route B:** an Orc warrior with Battle Shout active notes AP before and after Blood Fury. The
gain is 10% of total AP if the modern aura applies, or 10% of level-plus-Strength AP if Forever
kept Classic's "base AP" behaviour.

### OQ-10: Touch of the Grave
We don't know the drain amount (5% of whose health, and is "up to" a cap or a range), its school,
whether it can miss, crit or cause threat, or whether auto-attacks and abilities proc it equally.
**Route B:** combat log of an Undead warrior hitting mobs three levels above them for 5 minutes
(the beta has no target dummies); count the procs and read their amounts.

### OQ-11: Feral Swiftness dodge scope
**Route B, if the talent is reachable under the cap:** the sheet's dodge in Bear Form with
Feral Swiftness trained against untrained.

### OQ-12: minor items
These are all Route B unless marked.

- Whether the server uses `PlayerExpectedStat` at all. OQ-4 answers this for paladins.
- Warrior ranged AP per Agi: 2 in Forever data, 1 in Classic.
- What the two unnamed `PlayerExpectedStat` columns mean (the values, 10 and 287 at level 60 for
  every class, are [F] [client]).
- Whether the "first 20 Stamina and Intellect count as 1" rule holds on the server: the Forever
  sheet code uses it ([F] client UI; [?] on the server), and no genuine Classic Era source was
  found ([?] for `classicEra`). Read maximum HP and mana (the server's values) against Stamina
  and Intellect on a naked sheet, at two Stamina and Intellect totals, and compare with
  `min(20, x) + 10 or 15 × (x − 20)`.
- For the [damage-and-timing.md](damage-and-timing.md) owner: the beta ships an
  `armormitigationbylvl.txt` game table whose level-60 constant is 1059 ([F] [client]), far from
  Classic's 400 + 85 × level. It is probably an unused engine table, but check that armor
  mitigation matches the Classic formula on the beta.

### OQ-13: confirm wago.tools values in a browser
✅ **Resolved from client data** (2026-09-22, [client.md][client], rows D5, D10, D11 and D16):
every value below matches the raw 1.60.1.69913 client files, and the 1.15.9.69722 files for the
Classic halves. The same check corrected the game-table claim (the client ships `basemp.txt` and
`hppersta.txt`, [above](#what-the-forever-client-ships-and-does-not)) and found Stoneform on the
GCD. The in-game questions (OQ-4, OQ-12) stay open.

| Table | Values (confirmed) |
| --- | --- |
| [CharBaseInfo][w-cbi] | the race × class pairs in the races table; High Order Skyborne = race 95 and Windshaper = race 96 ([ChrRaces][w-chrraces]) |
| [PlayerExpectedStat][w-pes] | level 60: `BaseMana` 1512 (paladin) and 1244 (druid); `CritPerAgility` 0.0005, 0.000506, 0.0005; `SpellCritPerIntellect` 0.000167; the table is absent from 1.15.9 ([w-pes-c]) |
| [ChrClasses][w-chrclasses] | `AttackPowerPerStrength` 2 (warrior, paladin, druid); `AttackPowerPerAgility` 0; `ArmorTypeMask` 127, 2303, 2343; all zero in 1.15.9 ([w-chrclasses-c]) |
| SpellEffect | racials 20597, 20598, 20572, 20574, 1259719, 1259721, 20594, 20582, 1259799, 1259802, 1259813, 1260189, 20550, 20554, 20557; forms 3025, 1178, 9635 in both builds (cited in the tables above) |
| [SpellLevels][w-sl] | 3025 (Forever base level 6, Classic 20); 1178 (10–40); 9635 (40–70) |
| SpellMisc and [SpellDuration][w-dur] | durations for 20554 (10 s), 20572, 1259799 and 1259813 (15 s) |
| [SpellPower][w-power] | 20554 has no cost |
| [SpellShapeshiftForm][w-ssf] | combat round time 1000 ms (Cat) and 2500 ms (bears); damage variance 0.4 |

### OQ-14: combat ratings in play
**Route B** for the old ratings: their costs are the same at every level, so the beta cap doesn't
matter.

- **Sheet test:** equip a Forever item with a known rating and read the sheet.
  - N Critical Strike Rating should raise melee *and* spell crit by N/14 %.
  - N Hit Rating should raise the hit bonus by N/10 %.
  - N Defense Rating should raise defense skill by N.
  - Dodge, parry and block should rise by N/12, N/15 and N/5 %.
- Whether these hold against a level-63 boss belongs to [combat-tables.md](combat-tables.md).
- **The D12 hypotheses** (haste, expertise, armor penetration; [?]). The beta has no target
  dummies, so combat tests use mobs three levels above you. The only rating items usable under
  the cap, found in foreverchanges' item data (as cached by the scraper), are the Dwarven Tree
  Chopper (+6 Expertise Rating, item level 20, no level requirement in its Forever tooltip) and
  Leafre's Ring of Armor Piercing (+50 Armor Penetration, requires level 1; its source is
  unknown). Every haste-rating item requires level 60.
  - *Expertise Rating, Route B:* with the Dwarven Tree Chopper on and off, count dodges (from
    behind) and parries (from the front) against mobs three levels above you, and check whether
    the sheet shows an expertise value. Hypothesis A predicts −0.6 points, so this needs a large
    sample. *Route C:* repeat with the Adaptive Combat Assistant (+20, 2%; it requires level 60).
  - *Armor Penetration, Route B if the ring can be obtained:* compare average white-hit size
    against the same mob with and without it.
  - *Haste Rating, Route C:* compare the sheet's attack speed with and without a haste-rating
    item.
  - *Health Regeneration:* compare out-of-combat health ticks with and without the item.

### OQ-15: Toughness and bonus armor
**Route C** (items with stat-50 bonus armor are level-60 gear). Does Toughness ("Increases your
Armor value from items by 10%") multiply Forever's stat-50 bonus armor? The sim multiplies base
item armor only, so it doesn't [?]; a Classic Era fallback item's stored armor is multiplied
whole ([derived-stat pipeline](#derived-stat-pipeline), step 4).
- **Sheet test:** a warrior with Toughness 5/5 notes the sheet armor, then equips a Forever item
  with bonus armor (its tooltip's armor line minus the base armor for its item level, or a PvP
  piece; [items.md](../data/items.md#stats-armor-and-block-value) lists them). The sheet rises by
  `base × 1.10 + bonus` if Toughness skips bonus armor, by `(base + bonus) × 1.10` if not.
- Matters only for tanks' armor, so M3.

---

## Sources

| Source | Covers | Ruleset |
| --- | --- | --- |
| [foreverchanges.pro/racials][fc-racials] | Forever racials with Classic comparison, class availability, removed racials | Forever (client data) |
| [foreverchanges.pro/changes][fc-changes] | Forever talent and spell diffs (Heart of the Wild, Thick Hide, Anticipation, Precision, Kings, Mark of the Wild, forms…) | Forever vs Classic Era 1.15.9 |
| [foreverchanges.pro/spellbook/druid][fc-sb-druid], [/paladin][fc-sb-paladin], [/warrior][fc-sb-warrior] | Forever spell tooltips (Cat and Bear Form, Kings baseline, stances) | Forever |
| [foreverchanges.pro/legacy-perks][fc-legacy] | Legacy perks (none affect combat stats) | Forever |
| [foreverchanges.pro/beta][fc-beta] | Beta builds (1.60.1.69913 current) | Forever |
| Raw Forever client files, build 1.60.1.69913, read through the wago.tools API ([client.md][client]; game tables in [`gametables.json`][client-gt]). Browse the same tables on wago.tools: [PlayerExpectedStat][w-pes], [ChrClasses][w-chrclasses], [CharBaseInfo][w-cbi], [ChrRaces][w-chrraces], [RaceStat][w-racestat], [SkillLineAbility][w-sla], SpellEffect (per spell, linked in the tables), [SpellLevels][w-sl], [SpellMisc][w-misc-20572], [SpellDuration][w-dur], [SpellShapeshiftForm][w-ssf], [SpellPower][w-power] | Exact Forever client values | Forever (client) |
| Raw Classic Era client files, build 1.15.9.69722 ([client.md][client]). Browse on wago.tools: [ChrClasses][w-chrclasses-c], [PlayerExpectedStat (absent)][w-pes-c], SpellEffect for 3025, 1178, 9635, 20572 ([1][w-se-c-3025], [2][w-se-c-1178], [3][w-se-c-9635], [4][w-se-c-20572]), [SpellShapeshiftForm][w-ssf-c] | Classic Era client baseline | Classic Era |
| [`src/data/races/races.json`][races-json] | Project snapshot of the racials page | Forever |
| GuybrushGit/WarriorSim at pre-SoD commit `180a3cc` (2021-05-11): [races.js][ws-races], [player.js][ws-player] | Classic warrior level-60 Str, Agi, Sta, Int and base AP 160 per race; warrior base crit 0; multiplicative stat mods; truncation | Classic Era (pre-SoD) |
| timhul/ClassicSim at pre-SoD commit `f9cb48d` ([tree][cs-druid]; druid rows from [PR #103][cs-103], 2020-01-05) | Night Elf and Tauren druid level-60 sheet attributes, equal to the emulator's | Classic Era sim (pre-SoD): corroboration only, not evidence. The rows came from a classicwow.live guide, now offline, by an unknown method |
| WarriorSim post-SoD `levelstats.js` ([ws-levelstats], `ad5ac8b`) | Warrior Spirit per race; `3 × level − 20` | **Not a [C] source** (post-SoD); the Spirit values it alone supplies are [?] |
| Forever `Camelot/PaperDollFrameConstants.lua` ([ui-pdfconst]) and `PaperDollFrameStats.lua` ([ui-stats]) | `STAMINA_BREAK = 20`, `INTELLECT_BREAK = 20`, `MANA_PER_INTELLECT = 15`; how the sheet computes HP and mana bonuses | Forever client UI [F] (verbatim mirror): what the sheet computes; server behaviour [?] |
| Classic Era `Vanilla/PaperDollFrame.lua` ([ui-era-pdf], build 1.15.9.69722) | control: the Classic Era sheet prints no Stamina or Intellect formula | Classic Era client |
| [magey/classic-warrior wiki: Attack table][magey-at] | Classic Era crit, miss and skill mechanics; aura-crit suppression; level-20 crit datapoint | Classic Era (2019+ tests, Blizzard blue posts) |
| [Warcraft Tavern: Classic Base Stats Calculator][wt-basestats] | Classic conversions: 10 HP/Sta, 2 AP/Str, 20 Agi per 1% crit and dodge, 2 armor/Agi, 15 mana/Int, spell crit per Int by class, Spirit regen per tick | Classic Era |
| [Warcraft Tavern: Tankadin guide][wt-tankadin] | Classic paladin conversions, defense 0.04% per point | Classic Era |
| [Warcraft Tavern: Mana Management guide][wt-mana] | Five-second rule, mp5, paladin ~30 Int per 1% crit | Classic Era |
| [Sixty Upgrades][sixty] (gear planner; client bundle `assets/index-*.js`) | HP = min(20, Sta) + (Sta − 20) × 10 and mana = min(20, Int) + (Int − 20) × 15 | Secondary (the planner has SoD and Forever modes): [?] for Classic Era; the Forever client UI supplies the [F] evidence |
| [Blizzard forums: +dodge vs +defense (Oct 2019)][bnet-def] | Defense 0.04% per point to avoidance and crit reduction | Classic Era (community) |
| [wowsims/forever base_stats.go][wsf-base], [base_stats_auto_gen.go][wsf-autogen], [base_stats_parser.py][wsf-parser], [racials.go][wsf-racials], [ArmorMitigationByLvl.txt][wsf-armor], [CombatRatings.txt][wsf-cr] | Corroboration of what the Forever client does and doesn't ship and of its game tables, which the project now reads directly ([client-gt]). **Its attribute rows are TBC level-70 values and its racials are TBC: not used.** | Secondary [?]: a Forever sim, TBC-derived (partly forbidden) |
| [docs/data/items.md, "Forever's ratings"](../data/items.md#forevers-ratings-f-with-open-questions) | Measured tooltip ratio of rating to percentage across 4,271 changed items; new rating stats | Forever (project scrape of foreverchanges.pro) |
| [mangoszero player_levelstats.sql][mz-levelstats], [player_classlevelstats.sql][mz-classlevelstats] | Candidate values for the open questions; they may stand in as D24 placeholders (the druid attribute rows do), never as evidence; read also to test whether the other sources are independent | **Forbidden** (vanilla emulator), except as a [D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23) placeholder |
| [raethkcj/RatingBuster `Vanilla_Logic.lua` at pre-SoD commit `d11164c`][rb-vanilla] (2023-11-29) | Classic Era base melee crit and base dodge per class (warrior 0 and 0); Bear and Dire Bear item-armor bonuses added to Thick Hide's; druid and paladin base crit, spell crit and dodge; paladin 59.9 Int per 1% spell crit | Classic Era (pre-SoD addon): [C] for the warrior's values and the armor rule; its tables largely equal the emulator's, so not independent, and its druid and paladin base values are D24 placeholders, not evidence |
| [Blizzard forums, Classic General, topic 419469][bnet-base] (2020-01-21) | Base parry, miss and block start at 5%; dodge doesn't; a naked level-60 Human paladin showing about 3% dodge and crit (second-hand) | Classic Era (community statement) [?] |
| [wowsims/classic `base_stats.go`][wsc-base] | Base health per class (copies the emulator); druid base crit, spell crit, dodge and caster AP −20; paladin base melee crit | Secondary, SoD lineage [?]: the D24 placeholders' origin only, not evidence |
| [timhul/ClassicSim][cs-druid] at pre-SoD commit `f9cb48d` (2021-03-21); class rows from [PR #103][cs-103] (2020-01-05) | Paladin level-60 sheet attributes by race | Classic Era (pre-SoD) [C] |
| [JeffP07/TheorycraftClassic `formulasused.txt`][tcc-formulas] | Paladin 0% + Int/29.5 spell crit | [?]: 2005 addon text |

Fetch notes: foreverchanges.pro was read through its RSC payload, respecting its `robots.txt`.
About 50 wago.tools page lookups were made on 2026-09-22 before the project learned that its
`robots.txt` forbids them ([D9](../decisions.md#d9-wagotools-is-cited-never-crawled-2026-09-22)).
Those values were since checked against the raw client files fetched through the documented
wago.tools API ([D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22),
[OQ-13](#oq-13-confirm-wagotools-values-in-a-browser)); no wago.tools page is fetched. Wowhead
was not fetched, because its `robots.txt` disallows Anthropic agents.

[fc-racials]: https://foreverchanges.pro/racials
[fc-changes]: https://foreverchanges.pro/changes
[fc-sb-druid]: https://foreverchanges.pro/spellbook/druid
[cs-druid]: https://github.com/timhul/ClassicSim/tree/f9cb48dcf177575c383d03ec23554ce5ef5b50cc
[cs-103]: https://github.com/timhul/ClassicSim/pull/103
[fc-sb-paladin]: https://foreverchanges.pro/spellbook/paladin
[fc-sb-warrior]: https://foreverchanges.pro/spellbook/warrior
[fc-legacy]: https://foreverchanges.pro/legacy-perks
[fc-beta]: https://foreverchanges.pro/beta
[races-json]: ../../src/data/races/races.json
[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[client-gt]: ../data/client.md#gametablesjson
[client-hotfix]: ../data/client.md#hotfix-caveat
[w-pes]: https://wago.tools/db2/PlayerExpectedStat?build=1.60.1.69913&filter%5BLevel%5D=exact%3A60
[w-pes-c]: https://wago.tools/db2/PlayerExpectedStat?build=1.15.9.69722
[w-chrclasses]: https://wago.tools/db2/ChrClasses?build=1.60.1.69913
[w-chrclasses-c]: https://wago.tools/db2/ChrClasses?build=1.15.9.69722
[w-cbi]: https://wago.tools/db2/CharBaseInfo?build=1.60.1.69913
[w-chrraces]: https://wago.tools/db2/ChrRaces?build=1.60.1.69913
[w-racestat]: https://wago.tools/db2/RaceStat?build=1.60.1.69913
[w-sla]: https://wago.tools/db2/SkillLineAbility?build=1.60.1.69913
[w-sl]: https://wago.tools/db2/SpellLevels?build=1.60.1.69913&filter%5BSpellID%5D=exact%3A3025
[w-dur]: https://wago.tools/db2/SpellDuration?build=1.60.1.69913
[w-ssf]: https://wago.tools/db2/SpellShapeshiftForm?build=1.60.1.69913
[w-ssf-c]: https://wago.tools/db2/SpellShapeshiftForm?build=1.15.9.69722
[w-power]: https://wago.tools/db2/SpellPower?build=1.60.1.69913&filter%5BSpellID%5D=exact%3A20554
[w-misc-20572]: https://wago.tools/db2/SpellMisc?build=1.60.1.69913&filter%5BSpellID%5D=exact%3A20572
[w-se-c-3025]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=exact%3A3025
[w-se-c-1178]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=exact%3A1178
[w-se-c-9635]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=exact%3A9635
[w-se-c-20572]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=exact%3A20572
[ws-levelstats]: https://github.com/guybrushgit/WarriorSim/blob/ad5ac8b5dd76db3f0fa7c41de52c0b0b60a5a4d8/js/data/levelstats.js
[ws-races]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/data/races.js
[ws-player]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js
[ui-pdfconst]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameConstants.lua
[ui-stats]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua
[ui-era-pdf]: https://github.com/Gethe/wow-ui-source/blob/classic_era/Interface/AddOns/Blizzard_CharacterFrame/Vanilla/PaperDollFrame.lua
[magey-at]: https://github.com/magey/classic-warrior/wiki/Attack-table
[wt-basestats]: https://www.warcrafttavern.com/wow-classic/tools/basestats/
[wt-tankadin]: https://www.warcrafttavern.com/wow-classic/guides/tankadin-guide-playing-as-a-protection-paladin/
[wt-mana]: https://www.warcrafttavern.com/wow-classic/guides/mana-management-optimization/
[bnet-def]: https://us.forums.blizzard.com/en/wow/t/question-for-prot-warriors-dodge-vs-defense/334654
[sixty]: https://sixtyupgrades.com/
[wsf-base]: https://github.com/wowsims/forever/blob/master/sim/core/base_stats.go
[wsf-autogen]: https://github.com/wowsims/forever/blob/master/sim/core/base_stats_auto_gen.go
[wsf-parser]: https://github.com/wowsims/forever/blob/master/tools/base_stats_parser.py
[wsf-racials]: https://github.com/wowsims/forever/blob/master/sim/core/racials.go
[wsf-armor]: https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats-forever/ArmorMitigationByLvl.txt
[wsf-cr]: https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats-forever/CombatRatings.txt
[tcc-formulas]: https://github.com/JeffP07/TheorycraftClassic/blob/master/formulasused.txt
[mz-levelstats]: https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql
[mz-classlevelstats]: https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql
[rb-vanilla]: https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua
[bnet-base]: https://us.forums.blizzard.com/en/wow/t/paladin-base-crit-and-dodge-should-be-5-base-at-max-weapon-and-defense-skill/419469
[wsc-base]: https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go
