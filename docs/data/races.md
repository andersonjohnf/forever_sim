# Races dataset

`src/data/races/races.json` holds the ten WoW Forever races: faction, the classes each can be
in Forever and in Classic Era, every racial with its Forever tooltip next to the Classic Era
one, and the Classic Era racials each race lost. Everything is read from the client files: the
Forever beta client's `ChrRaces`, `CharBaseInfo` and racial skill lines, compared with the same
tables of the Classic Era client
([decision D17](../decisions.md#d17-retire-foreverchangespro-as-a-data-source-2026-09-22)).
Interfaces and two small helpers (`racesForClass`, `racialEffectForClass`) are in
[`src/data/races/types.ts`](../../src/data/races/types.ts); the generator is
[`scripts/scrape/races-client.mjs`](../../scripts/scrape/races-client.mjs) with the helpers in
[`lib/race-data.mjs`](../../scripts/scrape/lib/race-data.mjs), the tooltip header formatting of
[`lib/spellbook.mjs`](../../scripts/scrape/lib/spellbook.mjs) and the text renderer
[`lib/spell-text.mjs`](../../scripts/scrape/lib/spell-text.mjs).

| | |
| --- | --- |
| Source | `https://wago.tools/api/casc/<fdid>?version=<build>` (raw client files, [D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)), parsed with [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) |
| Forever build | `wow_classic_beta` · `1.60.1.69913` (wago.tools lists it as created 2026-09-18) |
| Classic build | `wow_classic_era` · `1.15.9.69722` (`meta.classicBuild`, `null` in the foreverchanges dataset) |
| Generated | 2026-09-23 (`meta.scrapedAt` is the latest download among the files read: the Classic Era `ItemSubClass` table, fetched 02:51 UTC) |

## How the data was obtained

### Requests

Through the client-data download layer ([client.md § Requests](client.md#requests)): the
documented wago.tools API only, one request at a time, cached under `.cache/client/`, once per
build. The spellbooks and races together added **4 requests**, all HTTP 200, all Classic Era
tables the cache didn't have yet: `SkillLineAbility` (FileDataID 1266278), `SkillLine`
(1240935), `ChrRaces` (1305311) and `ItemSubClass` (1261604). Every `.dbd` definition was cached.
A later run makes no requests.

Both builds read the same tables: `ChrRaces`, `CharBaseInfo`, `ChrClasses`, `SkillLine`,
`SkillLineAbility`, the spellbook tables of [spells.md](spells.md#tables-read) (for cast time,
cooldown, range and cost) and the text renderer's. `meta.tables` lists them with their
FileDataIDs.

### Derivation

- **Races** are the `ChrRaces` rows with `CharBaseInfo` pairs: ten in Forever, eight in Classic
  Era. `ChrRaces.Alliance` gives the faction (0 Alliance, 1 Horde). A faction variant is named
  "`<variant> <base>`" with the base as its `ClientFileString` ("Windshaper Skyborne",
  "Skyborne"): it becomes "Skyborne (Windshaper)" with id `horde-skyborne-windshaper`. Other
  races keep their name ("Night Elf" → `alliance-night-elf`). **These ids are exactly the ones
  the app has always used** (the foreverchanges dataset's), and the generator refuses to write
  if the ids, a race's name or faction, or the classes of any race differ from the committed
  dataset (`git show HEAD:src/data/races/races.json`, or `--against=<ref>`): saved setups and
  share links store race ids. A build that really changes them needs
  `--accept-race-changes`, once the app handles the change. Races are ordered Horde first, then
  by `ChrRaces` id, which is the order the race picker has always shown.
- **Classes** come from `CharBaseInfo` (race/class pairs), in `ChrClasses` id order: 56 pairs in
  Forever, 40 in Classic Era. `addedInForever` and `removedInForever` are the difference;
  `newCombos` lists the new pairs of races that exist in Classic Era.
- **Icons.** The client ships no race icon (character creation draws races from atlas
  textures), so race icons follow Wowhead's `race_<ClientFileString>_male` names (decision D14),
  and the two Skyborne, which Wowhead has none for, keep the elf-head placeholders
  (`inv_misc_head_elf_02` and `_01`). Racial icons are the spells' own
  (`SpellMisc.SpellIconFileDataID`); every race and racial icon was checked on the icon CDN.
- **Racials** are the `SkillLineAbility` rows of a racial skill line ("Orc Racial",
  "Racial - Undead", "Skyborne Racial") whose race mask holds the race's `PlayableRaceBit`,
  minus spells hidden from the spellbook (`SPELL_ATTR0_DO_NOT_DISPLAY`: Night Elf "Quickness
  Passive" 21009, Classic "Shadowmeld Passive"), in `SkillLineAbility` order. Rows with the same
  name are one racial with a variant per class (`ClassMask`): Eureka! has five spells, Expansive
  Mind and Touch of the Grave three and two. When the variants' tooltips differ, `forever` lists
  them as "Warrior, Paladin, Rogue: …" lines (identical texts merged, in the order they first
  appear) and `foreverByClass` has each of the race's classes. A racial shared by both Skyborne
  is one racial in both lists (`races` names both).
- **Racial ids** are `racial-<race>-<name>` ("racial-night-elf-elune-s-light",
  "racial-windshaper-skyborne-skysight") or `racial-<base>-both-factions-<name>` when both
  faction variants share it. They are the ids the foreverchanges dataset used, which
  `src/data/client/spells.json` keys its resolved racial spells on.
- **Tooltips** are rendered like the spellbooks' ([spells.md](spells.md#rank-fields)), without
  player stats (no racial needs one). The tooltip header of an active racial (`tooltip`) has its
  cast time, cooldown, range and cost in the spellbook's wording.
- **Classic Era.** For each racial the generator looks up the race's Classic Era racial of the
  same name: `classic.status` is `verified` with its name, tooltip, header and `classicSpellId`
  (the Classic spell also in the Forever list when there is one: Berserking 20554, not the
  rage variant 26296), `not_listed` when the race didn't have it (`otherRaces` names the races
  that did: Mace Specialization was Human), or `absent` for the new races.
- **`changeKind`** is `added` (no Classic Era racial of that name), `moved` (another race had
  it), `modified` (the tooltip, ignoring case and whitespace, or the cast time or cooldown
  differs) or `unchanged`; `changeLabel` is the matching "New", "Changed" or "Unchanged".
- **`removedRacials`** are the race's Classic Era racials Forever doesn't have.

## Schema

```ts
interface RaceData {
  meta: { source; scraper; scrapedAt; product; foreverBuild; foreverBuildDate; classicProduct;
          classicBuild; tables: { forever; classic }; wowDbDefs };
  classOrder: ClassSlug[];                 // ChrClasses id order: warrior, paladin, hunter, rogue, priest, shaman, mage, warlock, druid
  simClassAvailability: Record<'warrior' | 'druid' | 'paladin', { forever: raceId[]; classic: raceId[] }>;
  newCombos: { raceId; race; faction; class }[];   // existing races' new class options
  races: Race[];                           // Horde first, then by ChrRaces id
}
interface Race {
  id; name; baseName; faction: 'Horde' | 'Alliance'; icon; chrRacesId; newInForever: boolean;
  classes: { forever; classic: ClassSlug[] | null; addedInForever; removedInForever };
  racials: Racial[];
  removedRacials: { name; classicSpellId; text }[];
}
interface Racial {
  id; name; icon;
  spellIds: number[];                      // Forever spells, one per class variant
  changeKind: 'added' | 'moved' | 'modified' | 'unchanged';
  changeLabel: 'New' | 'Changed' | 'Unchanged';
  passive: boolean; tooltip;               // tooltip: { castTime, cooldown?, range?, resourceCost? } for actives
  forever: string;                         // Forever tooltip, per-class lines joined by "\n"
  foreverByClass;                          // { warrior: "…", … } when the variants differ, else null
  classic: { status: 'verified' | 'not_listed' | 'absent'; name; text; tooltip; otherRaces: { race; text }[] };
  classicSpellId;                          // the race's Classic Era spell of that name (null when it had none)
  races;                                   // race ids sharing it (the Skyborne share three)
}
```

The browser build drops `newCombos`, `removedRacials`, the racials' `classic`, `tooltip`,
`spellIds` and `classicSpellId`, and `meta.tables` and `meta.wowDbDefs` (`vite.config.ts`
`SLIMMERS`): the Character tab shows each race's name, faction, icon and racial texts.

## Counts

10 races (5 Horde, 5 Alliance, including the two Skyborne), 37 racials (40 race/racial pairs:
Walk on Air, Wind Blessed and Elemental Insight are shared by both Skyborne) on 44 Forever
spells, 56 race/class pairs (Classic Era 40). By kind: 17 Changed, 6 Unchanged, 14 New (13
`added`, and Mace Specialization `moved` from Human to Dwarf). Eleven Classic Era racials are
gone.

## Race and class availability

"**new**" marks a combination unavailable in Classic Era.

| Race | Faction | Forever classes | New in Forever | Warrior | Druid | Paladin |
|---|---|---|---|---|---|---|
| Orc | Horde | warrior, hunter, rogue, shaman, mage, warlock | mage | yes | — | — |
| Undead | Horde | warrior, paladin, rogue, priest, mage, warlock | paladin | yes | — | **new** |
| Tauren | Horde | warrior, hunter, shaman, druid | — | yes | yes | — |
| Troll | Horde | warrior, hunter, rogue, priest, shaman, mage, warlock | warlock | yes | — | — |
| Skyborne (Windshaper) | Horde | warrior, hunter, rogue, shaman, druid | whole race | **new** | **new** | — |
| Human | Alliance | warrior, paladin, hunter, rogue, priest, mage, warlock | hunter | yes | — | yes |
| Dwarf | Alliance | warrior, paladin, hunter, rogue, priest, shaman | shaman | yes | — | yes |
| Night Elf | Alliance | warrior, hunter, rogue, priest, druid | — | yes | yes | — |
| Gnome | Alliance | warrior, rogue, priest, mage, warlock | priest | yes | — | — |
| Skyborne (High Order) | Alliance | warrior, hunter, rogue, mage, druid | whole race | **new** | **new** | — |

For the simulated classes (`simClassAvailability`):

| Class | Forever | Classic Era | Change |
| --- | --- | --- | --- |
| Warrior | all 10 races | 8 | + both Skyborne |
| Druid | Tauren, Skyborne (Windshaper), Night Elf, Skyborne (High Order) | Tauren, Night Elf | + both Skyborne |
| Paladin | Undead, Human, Dwarf | Human, Dwarf | + Undead: **Horde paladins** |

No Classic Era race/class combination is removed. Other new pairs: Orc mage, Troll warlock,
Human hunter, Dwarf shaman, Gnome priest. The client's `CharBaseInfo` confirms the 56 pairs the
foreverchanges dataset took from a community report (which noted another source listing 57),
Undead paladins included.

## What matters for the sim

Combat-relevant racials for warriors, feral druids and paladins (full texts below):

- **Human** (warrior, paladin): Sword Specialization is now +2% crit with swords (was +5
  skill); Human Mace Specialization is gone. New Will to Survive breaks stuns.
- **Dwarf** (warrior, paladin): gains Mace Specialization, +1% crit with maces. Stoneform now
  reduces physical damage taken by 10% for 8 s instead of adding 10% armor, a tank cooldown.
- **Orc** (warrior): Axe Specialization is +1% crit with axes (was +5 skill). Blood Fury is +10%
  attack power and spell power for 15 s, 2 min cooldown, with no healing penalty (was +25% base
  AP).
- **Troll** (warrior): Berserking is a flat +10% attack and casting speed, 3 min cooldown. Its
  tooltip reads the duration of spell 26635, which the Forever client doesn't ship, so the text
  gives none ([caveats](#caveats)); the spell itself lasts 10 s (`SpellDuration` 1). Classic:
  10 s, 10–30% by health.
- **Tauren** (warrior, druid): Endurance adds +1% hit to +5% health.
- **Night Elf** (warrior, druid): new Elune's Light, +10% crit for 15 s, 3 min cooldown;
  Quickness adds 2% movement speed to +1% dodge.
- **Gnome** (warrior): Expansive Mind is +5% maximum rage for warriors; new Eureka!: the next 3
  damaging abilities cost 40% less rage and deal 10% more damage, 2 min cooldown.
- **Undead** (warrior, paladin): new Touch of the Grave, 5% chance on hit to drain health (up to
  5% of max health) for warriors and paladins.
- **Skyborne** (warrior, druid): Wind Blessed +1% melee, ranged and spell haste; Elemental
  Insight +5% damage against Elementals.

## Racials by race

Tag and Forever tooltip as the dataset has them; active racials show their cast time and
cooldown in italics. "Removed" lists the race's Classic Era racials Forever doesn't have, with
their Classic spell ids.

### Orc (Horde)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| Blood Fury _(Instant, 2 min cooldown)_ | Changed | Increases Attack Power and Spell Power by 10% for 15 sec. | _Instant, 2 min cooldown._ Increases base melee attack power by 25% for 15 sec and reduces healing effects on you by 50% for 25 sec. |
| Hardiness | Changed | Duration of Stun effects on you reduced by 20%. | Chance to resist Stun effects increased by an additional 25%. |
| Axe Specialization | Changed | Increases your critical strike chance with all spells and abilities by 1% while you have an axe or a two-handed axe equipped. | Skill with Axes and Two-Handed Axes increased by 5. |
| Shatter Curse _(Instant, 3 min cooldown)_ | New | Instantly removes and grants immunity to all Curses and Banes, and reduces all Magical damage taken by 15% for 8 sec. | — (not an Orc racial in Classic Era) |

Removed: Command (20575).

### Undead (Horde)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| Underwater Breathing | Unchanged | Underwater breath lasts 300% longer than normal. | Underwater breath lasts 300% longer than normal. |
| Will of the Forsaken _(Instant, 2 min cooldown)_ | Changed | Instantly removes all Charm, Fear and Sleep effects. | _Instant, 2 min cooldown._ Provides immunity to Charm, Fear and Sleep while active. May also be used while already afflicted by Charm, Fear or Sleep. Lasts 5 sec. |
| Cannibalize _(Instant, 2 min cooldown)_ | Changed | When activated, regenerates 7% of total Health and 7% of total Mana every 2 sec for 10 sec. Only works on Humanoid or Undead corpses within 5 yds. Any movement, action, or damage taken while Cannibalizing will cancel the effect. | _Instant, 2 min cooldown._ When activated, regenerates 7% of total health every 2 sec for 10 sec. Only works on Humanoid or Undead corpses within 5 yds. Any movement, action, or damage taken while Cannibalizing will cancel the effect. |
| Touch of the Grave | New | Warrior, Paladin, Rogue: Your spells and attacks have a 5% chance to drain Health from the target, up to 5% of your maximum Health. / Priest, Mage, Warlock: Your spells and attacks have a 10% chance to drain Health from the target, up to 5% of your maximum Health. | — (not an Undead racial in Classic Era) |

Removed: Shadow Resistance (20579).

### Tauren (Horde)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| War Stomp _(0.5 sec cast, 2 min cooldown)_ | Unchanged | Stuns up to 5 enemies within 8 yds for 2 sec. | _0.5 sec cast, 2 min cooldown._ Stuns up to 5 enemies within 8 yds for 2 sec. |
| Endurance | Changed | Total Health increased by 5% and chance to hit increased by 1%. | Total Health increased by 5%. |
| Cultivation _(Instant)_ | Changed | Cultivate a nearby herb, growing a duplicate you can harvest without requiring Herbalism skill. Each herb may only be cultivated once. | Herbalism skill increased by 15. |
| Plainsrunning | New | Gain 1% increased movement speed every 5 sec spent moving, up to a maximum of 30% increase. Taking damage or standing still will reduce this effect. | — (not a Tauren racial in Classic Era) |

Removed: Nature Resistance (20551).

### Troll (Horde)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| Berserking _(Instant, 3 min cooldown)_ | Changed | Increases your spellcasting and attack speed by 10%. | _Instant, 3 min cooldown._ Increases your casting and attack speed by 10% to 30%. At full health the speed increase is 10% with a greater effect up to 30% if you are badly hurt when you activate Berserking. Lasts 10 sec. |
| Regeneration | Changed | Health regeneration rate increased by 10%. In addition, 10% of total Health regeneration will continue during combat. | Health regeneration rate increased by 10%. 10% of total Health regeneration may continue during combat. |
| Beast Slaying | Unchanged | Damage dealt versus Beasts increased by 5%. | Damage dealt versus Beasts increased by 5%. |
| Rapid Regeneration _(Channeled, 3 min cooldown)_ | New | Regenerate 50% of your maximum Health over 6 sec. Any movement, action, or damage taken will cancel the effect. | — (not a Troll racial in Classic Era) |

Removed: Throwing Specialization (20558), Bow Specialization (26290).

### Skyborne (Windshaper) (Horde)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| Walk on Air _(Instant, 2 min cooldown)_ | New | Glide downward through the air for 10 sec while controlling your direction of travel. | — (race new in Forever) |
| Elemental Insight | New | Damage dealt versus Elementals increased by 5%. | — (race new in Forever) |
| Wind Blessed | New | Increases your spellcasting, melee, and ranged Haste by 1%. | — (race new in Forever) |
| Skysight _(0.5 sec cast, 2 min cooldown)_ | New | Attempt to draw power from a convergence of elements and receive its blessing, increasing your movement and mounted movement speeds by 10%. Lasts 30 sec if no elemental convergence is nearby, and 15 min if one is found. | — (race new in Forever) |

### Human (Alliance)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| Perception _(Instant, 3 min cooldown)_ | Unchanged | Dramatically increases stealth detection for 20 sec. | _Instant, 3 min cooldown._ Dramatically increases stealth detection for 20 sec. |
| Sword Specialization | Changed | Increases your critical strike chance with all spells and attacks by 2% while you have a sword or two-handed sword equipped. | Skill with Swords and Two-Handed Swords increased by 5. |
| The Human Spirit | Unchanged | Spirit increased by 5%. | Spirit increased by 5%. |
| Will to Survive _(Instant, 3 min cooldown)_ | New | Instantly removes all Stun effects. | — (not a Human racial in Classic Era) |

Removed: Diplomacy (20599), Mace Specialization (20864).

### Dwarf (Alliance)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| Find Treasure _(Instant)_ | Unchanged | Allows the dwarf to sense nearby treasure, making it appear on the minimap. Lasts until cancelled. | _Instant._ Allows the dwarf to sense nearby treasure, making it appear on the minimap. Lasts until cancelled. |
| Stoneform _(Instant, 3 min cooldown)_ | Changed | Instantly removes and grants immunity to all Bleed, Poison, and Disease effects, and reduces all Physical damage taken by 10% for 8 sec. | _Instant, 3 min cooldown._ While active, grants immunity to Bleed, Poison, and Disease effects. In addition, Armor increased by 10%. Lasts 8 sec. |
| Mace Specialization | New | Increases your critical strike chance with all spells and attacks by 1% while you have a mace or two-handed mace equipped. | — (was Human: Skill with Maces and Two-Handed Maces increased by 5.) |
| Big Game Hunter | New | Damage dealt versus Beasts increased by 5%. | — (not a Dwarf racial in Classic Era) |

Removed: Frost Resistance (20596), Gun Specialization (20595).

### Night Elf (Alliance)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| Shadowmeld _(Instant, 10 sec cooldown)_ | Changed | Activate to slip into the shadows, reducing the chance for enemies to detect your presence. Lasts until cancelled or upon moving. Using this ability in combat discourages enemies from attacking you, but increases the cooldown to 2 min. | _Instant, 10 sec cooldown._ Activate to slip into the shadows, reducing the chance for enemies to detect your presence. Lasts until cancelled or upon moving. Night Elf Rogues and Druids with Shadowmeld are more difficult to detect while stealthed or prowling. |
| Quickness | Changed | Dodge chance increased by 1% and movement speed increased by 2%. Night Elf Rogues and Druids are harder to detect in Stealth as if they were 1 level higher. | Dodge chance increased by 1%. |
| Wisp Spirit | Changed | Transform into a wisp upon death, increasing movement speed by 75%. | Transform into a wisp upon death, increasing speed by 50%. |
| Elune's Light _(Instant, 3 min cooldown)_ | New | Increases your critical strike chance with all spells and attacks by 10% for 15 sec. | — (not a Night Elf racial in Classic Era) |

Removed: Nature Resistance (20583).

### Gnome (Alliance)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| Escape Artist _(Instant, 2 min cooldown)_ | Changed | Instantly escape the effects of any movement impairing effect and gain immunity to those effects for 3 sec. | _0.5 sec cast, 1 min cooldown._ Escape the effects of any immobilization or movement speed reduction effect. |
| Expansive Mind | Changed | Priest, Mage, Warlock: Maximum Mana increased by 5%. / Rogue: Maximum Energy increased by 5%. / Warrior: Maximum Rage increased by 5%. | Intelligence increased by 5%. |
| Engineering Specialization | Changed | Your gnomish ingenuity reduces the rate of engineering devices failing or backfiring when you use them by 20%. | Engineering skill increased by 15. |
| Eureka! _(Instant, 2 min cooldown)_ | New | Rogue: Your next 3 damaging abilities have their Energy cost reduced by 20% and deal 10% more damage. / Warlock, Mage: Your next 3 damaging abilities have their Mana cost reduced by 50% and deal 10% more damage. / Priest: Your next 3 damaging or healing abilities have their Mana cost reduced by 15% and deal 10% more damage or healing. / Warrior: Your next 3 damaging abilities have their Rage cost reduced by 40% and deal 10% more damage. | — (not a Gnome racial in Classic Era) |

Removed: Arcane Resistance (20592).

### Skyborne (High Order) (Alliance)

| Racial | Tag | Forever | Classic Era |
|---|---|---|---|
| Read Ley Line _(2 sec cast, 2 min cooldown)_ | New | Attempt to tap into the power of a nearby ley line, increasing your Health and Mana regeneration by 100%. Lasts 15 sec if no ley line is nearby, and 15 min if one is found. | — (race new in Forever) |
| Walk on Air _(Instant, 2 min cooldown)_ | New | Glide downward through the air for 10 sec while controlling your direction of travel. | — (race new in Forever) |
| Elemental Insight | New | Damage dealt versus Elementals increased by 5%. | — (race new in Forever) |
| Wind Blessed | New | Increases your spellcasting, melee, and ranged Haste by 1%. | — (race new in Forever) |

## Base stats

The client has no race base stats. Forever's `RaceStat` table has a row per `ChrRaces` id (43
rows, the ten playable races included) with a single unnamed column
(`Field_1_60_1_69876_002`) that is 0 on every row; `ChrRaces` has no stat modifiers in this
layout; and the Classic Era client ships no `RaceStat` at all. Level-60 base stats (Strength,
Agility, …) are server data, so the engine's `src/sim/stats/base-stats.ts` values stay as
documented in [character-stats](../mechanics/character-stats.md), and
[OQ-1](../mechanics/character-stats.md#oq-1-paladin-druid-and-skyborne-base-attributes) stays
open.

## From foreverchanges to the client

*History: the one-time switch in M1.5e, kept as its record.* The last foreverchanges dataset
(`git show ad46f63:src/data/races/races.json`) was compared with the client one. Since M1.5f,
`npm run diff:races` compares a fresh generation with the committed dataset instead
([Re-running](#re-running)). **The race ids, names, base names, factions,
icons, `newInForever` and every race's Forever and Classic class sets are identical, as are
`simClassAvailability` (every list, in order) and the set of new race/class pairs. All 37
racials keep their id, name, passive flag, Forever tooltip (character for character, per-class
texts included), `foreverByClass`, Classic status and name, `otherRaces`, `classicSpellId`,
`races` and tag.** The eleven removed racials are the ones the site reported. The differences:

| What | Old → new | Why |
| --- | --- | --- |
| Class lists (`classes.*`, 18 lists) and `classOrder` | the site's order (warrior, hunter, mage, …) → `ChrClasses` id order (warrior, paladin, hunter, …) | Same sets; the order is the client's. Nothing reads the order. |
| `newCombos` order | Alliance first → race order | Same six pairs. |
| Racial order, 10 races | the site's order → `SkillLineAbility` order | Same racials; Forever's new racials now come last in each list (the Character tab lists them in this order). |
| Racial icons, 20 racials (24 race/racial pairs) | e.g. Axe Specialization `inv_axe_06` → `inv_axe_02`, Elune's Light `spell_holy_elunesgrace` → `spell_nature_moonglow` | The spells' own icons. For the 6 of them both clients have, the Forever and Classic Era icons agree, so the site's came from elsewhere; the other 14 are new in Forever. |
| Cultivation `tooltip` | `1 hr cooldown` → no cooldown | The raw client has no cooldown for 20552 (`SpellCooldowns` 0, and its category 2578 has no recovery). The site's hour is likely a server hotfix ([client.md § Hotfix caveat](client.md#hotfix-caveat)). |
| `changeKind` of the 8 racials the site called `reported` | `reported` → `added` (7), `moved` (Mace Specialization) | Derived from the Classic Era client instead of the site's report status; the tags ("New") are unchanged. |
| Classic tooltips, 10 active racials | "Instant, 2 min cooldown. Increases base melee…" → "Increases base melee…" | The site prefixed Wowhead's tooltip header; the header is now `classic.tooltip`. The descriptions are otherwise identical. |
| `reportedRemovals` → `removedRacials` | secondary reports → the Classic Era client's racials | The same eleven names, now with their Classic spell ids and tooltips. |

**Dropped** (site-made, read by nothing): the `research` block, each race's
`classAvailabilityStatus`, `compatibilityConflicts` and `sources`, and each racial's
`displayKind`, `evidenceStatus`, `comparisonStatus`, `discoveredAt`, `notes` and `sources`.
**Added:** `chrRacesId`, each racial's `spellIds` and `classic.tooltip`, `removedRacials`, and
the client `meta` envelope with `classicBuild`.

## Caveats

- **Raw client files, no hotfixes** ([client.md § Hotfix caveat](client.md#hotfix-caveat)):
  Cultivation's cooldown above is the one visible gap.
- **Berserking's duration.** Forever's tooltip reads "by $s1% for $26635d", and spell 26635 is
  not in the Forever client (not even encrypted), so the generator leaves the "for …" clause
  out, as the site did; any other unresolved tooltip token fails the run. Berserking 20554
  itself has a 10 s duration.
- **Numbers are tooltip text.** The sim reads racial effects from its own effect layer
  (`src/sim/effects/racials.ts`), not from these texts; verify them in game (Blood Fury's AP
  basis, Berserking's duration).
- **The client decides availability.** An in-game check of Undead paladins is still worth
  doing, but the client's `CharBaseInfo` lists the pair.
- **Skyborne** have no Classic Era baseline (`classic.status: "absent"`) and placeholder race
  icons.

## Re-running

```sh
npm run scrape:races   # node scripts/scrape/races-client.mjs: races.json, from the cache
npm run diff:races     # regenerate, then diff against the committed file (.cache/client/<build>/races-diff.md)
npm run diff:races -- --version=<build>   # a new Forever beta build, diffed against the committed one
```

It prints the race, racial and pair counts, each simulated class's Forever and Classic Era
races, the new pairs, each race's racials with their change kind and removed racials, and any
tooltip clause it left out. It exits 1 without writing if the race ids, names, factions or class
lists differ from the committed dataset (`--against=<ref>` for another commit;
`--accept-race-changes` once the app handles a real change), or if a racial has an unrendered
tooltip or no icon. The diff pairs races by id and racials by id, then name, and lists every
changed field and text. After a new build: re-run `npm run scrape:client` (its racial
resolution reads this file), review `git diff src/data`, and update this page and any doc whose
values moved. `npm run scrape -- --version=<build> --diff` does all of this for every dataset.
