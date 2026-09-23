# Items dataset (pre-raid pool)

`src/data/items/pre-bis.json` is the pre-raid gear pool for the gear picker and the engine. It
holds every equippable **Rare** item with **required level 55–60 or item level 58+**, plus
every item on the curated **Classic Era pre-raid BiS lists** in
[`scripts/scrape/pre-raid-bis.json`](../../scripts/scrape/pre-raid-bis.json), whatever its
quality or level. Everything in it is read from the game clients' own files
([decision D17](../decisions.md#d17-retire-foreverchangespro-as-a-data-source-2026-09-22)):
the **WoW Forever beta client** first, and the **Classic Era client** for items the Forever
client has no row for, flagged ([D6](../decisions.md#d6-items-with-no-forever-data-use-classic-era-stats-flagged-2026-09-22-confirmed-by-the-guild)).
Interfaces are in [`src/data/items/types.ts`](../../src/data/items/types.ts); the generator is
[`scripts/scrape/items-client.mjs`](../../scripts/scrape/items-client.mjs).

| | |
| --- | --- |
| Source | the [wago.tools API](https://wago.tools/apis): raw client files by FileDataID, `https://wago.tools/api/casc/<fdid>?version=<build>` ([D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)) |
| Forever build | `wow_classic_beta` `1.60.1.69913` (created on wago.tools 2026-09-18) |
| Classic Era build | `wow_classic_era` `1.15.9.69722` (fallback rows and comparisons) |
| Definitions | WoWDBDefs commit [`2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e`](https://github.com/wowdev/WoWDBDefs/tree/2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e) |
| BiS lists | [`scripts/scrape/pre-raid-bis.json`](../../scripts/scrape/pre-raid-bis.json), hand-curated from Wowhead's 2019–2021 WoW Classic guides (see [Pre-raid BiS lists](#pre-raid-bis-lists)) |
| Scraped | 2026-09-23 01:16 UTC (`meta.scrapedAt`: the latest download time of the 41 Forever and 33 Classic Era files read) |
| Size | 1,630 items, 102 item sets; 1.9 MB JSON (1.2 MB minified, 106 KB gzipped) |

Until M1.5c-2 the pool came from foreverchanges.pro's item pages. What moved in the switch is
recorded, as history, in [From foreverchanges to the client](#from-foreverchanges-to-the-client).

## How the data was obtained

The generator reads both builds' tables through the same download layer as
[`client.md`](client.md#how-the-data-was-obtained) (`scripts/scrape/lib/wago.mjs`: documented
wago.tools endpoints only, one request at a time, everything cached under `.cache/client/`,
each file downloaded once per build). `meta.tables` lists every table read from each build
with its FileDataID. Three libraries do the work, all zero-dependency pure functions:

- [`lib/item-stats.mjs`](../../scripts/scrape/lib/item-stats.mjs) derives an item's stats,
  armor, weapon, effects and set from its `ItemSparse` + `Item` rows (the formulas and their
  evidence are in [client.md, "Items from the client"](client.md#items-from-the-client)).
- [`lib/spell-text.mjs`](../../scripts/scrape/lib/spell-text.mjs) renders spell descriptions
  for effect and set-bonus lines ([below](#effect-and-set-bonus-text)).
- [`lib/item-pool.mjs`](../../scripts/scrape/lib/item-pool.mjs) applies the filter and builds
  each record.

| Tables | Used for |
| --- | --- |
| `ItemSparse`, `Item` | the item row: name, quality, levels, slot, class and subclass, stats, binding, uniqueness, class and race masks, requirements, set, flavor text, sell price |
| `RandPropPoints`, `ItemArmor*`, `ArmorLocation`, `ItemDamage*` | Forever's stat budget, armor and weapon damage |
| `ItemEffect` (+ `ItemXItemEffect`), `SpellEffect`, `SpellName`, `SpellCooldowns`, `SpellCastingRequirements`, `SpellShapeshift` | use, equip and chance-on-hit spells; auras that are flat stats |
| `Spell`, `SpellMisc`, `SpellDuration`, `SpellAuraOptions`, `SpellRadius`, `SpellRange`, `SpellTargetRestrictions`, `SpellDescriptionVariables`, `SpellXDescriptionVariables` | effect and set-bonus text |
| `ItemSet`, `ItemSetSpell` | set pieces and bonuses |
| `ItemSubClass`, `Faction`, `SkillLine`, `ItemLimitCategory`, `ChrClasses`, `ChrRaces`, `CharBaseInfo` (Forever) | subclass names, reputation and skill names, Unique-Equipped groups, class and race names |
| `ItemModifiedAppearance`, `ItemAppearance` (Forever) and the build's file list | icon names |
| `gametables/shieldblockregular.txt` (Classic Era) | Classic Era's innate shield block value |

Faction, skill, subclass and limit names come from the Forever tables for both builds: the ids
are shared. Classic Era's own copies aren't needed and weren't fetched.

**Requests.** M1.5c-2 added **6 requests**, all HTTP 200: `ItemSubClass`, `Faction` and
`ItemLimitCategory` from the Forever build (wago.tools) and their three `.dbd` definitions
(GitHub). Every other table was already cached for `client.mjs` or M1.5c-1. A run from the
cache makes no requests.

**Icons.** `Item.IconFileDataID`, or for 37 new Forever items that leave it 0 the default icon
of the item's first appearance (`ItemModifiedAppearance` → `ItemAppearance.DefaultIconFileDataID`).
The build's own file list (`/api/files`) names the file, e.g. Lionheart Helm's 133138 →
`interface/icons/inv_helmet_36.blp` → `inv_helmet_36`. A space in a file name becomes `-`, as
the icon CDN spells it (`trade_archaeology_pendant-of-the-aqir`). Every pool item has an icon,
and 1,626 of the 1,628 items the two datasets share got the same icon name as before; the
other two are those two names with spaces.

## Filter

**Decisions (user, 2026-09-22; [D10](../decisions.md#d10-pre-raid-pool--rare-required-level-5560-or-item-level--58-2026-09-22), [D11](../decisions.md#d11-known-pre-raid-bis-items-are-always-in-the-pool-2026-09-22)):**
the pool is every Rare, equippable item with required level 55–60 **or** item level ≥ 58
(with any required level, including none), plus every item on the curated
[pre-raid BiS lists](#pre-raid-bis-lists) at any quality or level. The rule, as recorded in
`meta.filter.rule`:

```text
equippable AND ((quality in [3] AND (55 <= required level <= 60 OR item level >= 58 (any required level, including none)))
  OR listed in scripts/scrape/pre-raid-bis.json (any quality or level))
  AND (id < 25000 OR new in Forever: a Forever row and no Classic Era row)
```

An item's quality and levels are its Forever row's, or its Classic Era row's when Forever has
none. The constants at the top of the generator:

```js
const QUALITIES = [3];              // 2 Uncommon, 3 Rare, 4 Epic, 5 Legendary
const REQ_LEVEL = [55, 60];         // inclusive
const MIN_ITEM_LEVEL = 58;          // or item level >= this, whatever the required level; null = off
const MAX_CLASSIC_ITEM_ID = 25000;  // SoD guard, below
const EXCLUDED_ITEMS = new Map([...]);  // unobtainable items, id → reason
const JUNK_NAME = /\b(?:test|deprecated)\b|^monster\b|\bplaceholder\b|\[dnt\]|\(dnt\)/i;
const PRE_RAID_BIS_FILE = "scripts/scrape/pre-raid-bis.json";
const WATCH_ITEMS = new Map([...]);    // new items no client build carries yet, below
```

**Equippable** means item class Weapon (2) or Armor (4) with a paperdoll inventory type, and
none of cosmetic armor, "Miscellaneous" weapons or fishing poles. That keeps
cloth/leather/mail/plate, shields, cloaks, rings, necks, trinkets, held-in-off-hand items,
relics (librams, idols, totems), melee weapons, bows, guns, crossbows, thrown weapons and
wands. Shirts, tabards, ammo, quivers and bags are dropped.

**Developer rows.** The clients also carry test, deprecated and monster items that were never
loot. 44 equippable rows pass the level rule but match `JUNK_NAME` and are left out
("Deprecated Dragonstalker Tunic", 30 weapons named like "3800 Test 2h Axe 63 blue",
"Earthborn Kilt TEST", "Test Defense Ring +120", "Monster - Staff, Lord Valthalak", …).
foreverchanges listed none of them. The two Classic test weapons whose names don't give
them away, Bland Bow of Steadiness (20368) and Bland Dagger (24071), stay in
`EXCLUDED_ITEMS` with a reason ("This bow has no real variance"; both read "Damage set by
hand" in Forever). `meta.filter` records both.

### SoD guard: only Forever or original Classic Era items

The Classic Era client also ships Season of Discovery items, which must never enter the pool.
So an item is **eligible only if its id is below 25000** (an original Classic item; they end
around 24300) **or it is new in Forever** (a Forever `ItemSparse` row and no Classic Era row).
The guard drops 1,048 candidate rows, all of them SoD items: the 226xxx SoD Dungeon Set
remakes (Shadowcraft, Wildheart, Valor, Feralheart, Heroism, …), 202254 Bracers of
Redirection, 208196 Moa'kin Band, and a few SoD items the Forever client also carries (211940
Ecks'av's Tribal Guardian, 211941 Windwalker's Yari, 220606 Idol of the Dream). The highest
non-new id in the pool is 23319 (Lieutenant Commander's Silk Mantle); new items run
249385–281637. All 159 BiS-listed ids are original Classic ids (highest 23315).

Checked against the foreverchanges pool: the client rule gives exactly its 328 surviving
`new` items, and every other kept item has a Classic Era row and an id below 25000.

## Items with no Forever data (D6)

**746 items have no Forever `ItemSparse` row** and use their Classic Era row:
`foreverData: false`, `foreverSource: null`, `statsFrom: "classic"`, `tab: "missing"`. The UI
badges them ("Classic stats"), and the engine lists them with each result. They are:

- **650** Classic items the beta client has never had data for: Classic dungeon drops "not
  seen in the beta yet", Zul'Gurub and Ruins of Ahn'Qiraj loot, Silithus and Scourge-invasion
  rewards, PvP gear, quest rewards (Blackhand's Breadth, Mark of Fordring) and world drops.
  Most Classic pre-raid staples are here: the beta is level-capped, so nobody has looted them.
- **60** items players recorded in game (59 Dungeon Set 1 pieces and the Manual Crowd
  Pummeler), which foreverchanges showed as Forever items. The client holds no row for them.
- **34** items foreverchanges showed from **server hotfix rows**, which raw client files don't
  include ([client.md, "Hotfix caveat"](client.md#hotfix-caveat)). For 21 of them the Classic
  Era row reads exactly like the hotfix did; 13 lose Forever changes, mostly percentages
  restated as ratings (Stonegrip Gauntlets +10 defense rating → +10 defense, Boots of
  Avoidance 24 dodge rating → 2% dodge) and a few values (Belt of Valor, Dreadmist Belt,
  Smoking Heart of the Mountain).
- **2** items foreverchanges didn't list at all ([Added](#from-foreverchanges-to-the-client)).

They come back to Forever values on their own once a client build ships their rows.

### Items no client carries yet

**16 new Forever items have no row in either client** (hotfix-only), so they are **not in the
pool** (D17: flagged, never guessed). None is on a pre-raid BiS list. They are listed in
`WATCH_ITEMS` in the generator and in `meta.noClientRow`, and join the pool on their own when a
build ships their rows (the run then says to remove them from `WATCH_ITEMS`):

272491 Premier Chain Headguard, 271907 Expeditionary's Cape, 272063 Darkspear Raider's
Cloak, 272411 Arcanoweave Cloak, 272414 Howler's Furs, 272415 Stalwart Cloak, 284261
Magically Fortified Legguards, 271924 Rebels' Rugged Reaper, 272079 Darkspear Raider's
Reaper, 284257 Icesworn Decapitator, 271928 Clever Expeditionary's Spellblade, 271936
Guerilla's Jagged Mace, 272083 Darkspear Insurgent's Spellblade, 272091 Darkspear
Skirmisher's Bludgeon, 271932 Insurgent's Manifesto and 272087 Tome of the Darkspear
Prophecy.

## Counts

By tab: **new 328 · changed 346 · unchanged 210 · missing 746**. Stats come from Forever for
884 items and from Classic Era for 746. By quality: 1,605 Rare, 19 Epic and 6 Uncommon; the
Epic and Uncommon items all come from the BiS lists.

`tab` compares the two clients' rows: `new` has only a Forever row, `missing` only a Classic
Era row. With both, `changed` means a value a player or the sim sees differs (stats, weapon,
effect text, requirements, uniqueness, set bonuses, …). Forever restating a Classic equip
spell as a stat of the same value ("Increases damage and healing done by magical spells and
effects by up to 16" → "+16 Spell Power") is **not** a change, which is why 75 items
foreverchanges called changed are `unchanged` here.

| Why it's in the pool | Total | new | changed | unchanged | missing |
| --- | --: | --: | --: | --: | --: |
| Rule: required level 55–60 | 1,219 | 286 | 255 | 148 | 530 |
| Rule: item level ≥ 58, required level 53–54 | 168 | 28 | 16 | 4 | 120 |
| Rule: item level ≥ 58, required level 1–52 | 5 | 3 | 1 | 1 | 0 |
| Rule: item level ≥ 58, **no** required level (`reqLevel: 0`) | 188 | 11 | 64 | 57 | 56 |
| **BiS list only** (fails the rule) | **50** | 0 | 10 | 0 | 40 |

| Slot (`slot`) | Total | new | changed | unchanged | missing | BiS list only |
| --- | --: | --: | --: | --: | --: | --: |
| head | 119 | 30 | 40 | 4 | 45 | 4 |
| neck | 67 | 7 | 5 | 30 | 25 | 2 |
| shoulder | 137 | 31 | 44 | 9 | 53 | 4 |
| back | 55 | 6 | 7 | 8 | 34 | 1 |
| chest | 131 | 32 | 46 | 8 | 45 | 6 |
| wrist | 108 | 31 | 9 | 27 | 41 | 3 |
| hands | 150 | 38 | 39 | 16 | 57 | 0 |
| waist | 148 | 39 | 27 | 33 | 49 | 1 |
| legs | 149 | 31 | 46 | 13 | 59 | 2 |
| feet | 157 | 38 | 40 | 17 | 62 | 2 |
| finger | 82 | 18 | 10 | 11 | 43 | 4 |
| trinket | 62 | 5 | 14 | 5 | 38 | 7 |
| twoHand | 71 | 5 | 7 | 5 | 54 | 5 |
| mainHand | 35 | 1 | 3 | 2 | 29 | 5 |
| oneHand | 58 | 2 | 6 | 10 | 40 | 3 |
| offHand (weapon) | 3 | 0 | 0 | 0 | 3 | 0 |
| shield | 23 | 2 | 0 | 1 | 20 | 1 |
| heldInOffHand | 19 | 1 | 1 | 1 | 16 | 0 |
| ranged | 35 | 1 | 2 | 6 | 26 | 0 |
| thrown | 2 | 0 | 0 | 1 | 1 | 0 |
| relic | 19 | 10 | 0 | 3 | 6 | 0 |

| Armor type (`armorType`) | Total | new | changed | unchanged | missing |
| --- | --: | --: | --: | --: | --: |
| cloth (includes all 55 cloaks) | 370 | 76 | 97 | 52 | 145 |
| leather | 287 | 72 | 80 | 28 | 107 |
| mail | 252 | 71 | 60 | 30 | 91 |
| plate | 245 | 57 | 61 | 25 | 102 |

Other armor-class items: 82 rings, 67 necks, 62 trinkets, 23 shields, 19 held-in-off-hand,
7 idols, 6 librams, 6 totems.

| Weapon type (`weaponType`) | Total | Slots | new / changed / unchanged / missing |
| --- | --: | --- | --- |
| mace | 44 | 12 one-hand, 15 main hand, 17 two-hand | 1 / 4 / 3 / 36 |
| sword | 35 | 15 one-hand, 9 main hand, 1 off hand, 10 two-hand | 1 / 4 / 3 / 27 |
| dagger | 25 | 17 one-hand, 7 main hand, 1 off hand | 0 / 3 / 5 / 17 |
| axe | 23 | 11 one-hand, 2 main hand, 10 two-hand | 1 / 2 / 2 / 18 |
| staff | 20 | two-hand | 1 / 2 / 2 / 15 |
| polearm | 14 | two-hand | 3 / 1 / 1 / 9 |
| wand | 13 | ranged | 1 / 0 / 2 / 10 |
| bow | 11 | ranged | 0 / 0 / 3 / 8 |
| fist | 6 | 3 one-hand, 2 main hand, 1 off hand | 1 / 0 / 1 / 4 |
| gun | 6 | ranged | 0 / 1 / 0 / 5 |
| crossbow | 5 | ranged | 0 / 1 / 1 / 3 |
| thrown | 2 | thrown | 0 / 0 / 1 / 1 |

Of the 328 new items, 245 are the class-restricted **"Premier …"** set pieces (item level 60,
required level 55, BoP). The rest include reputation gear (Darkspear Raiders, Theramore
Expeditionary Force, The Watchers), the Undermine engineering trinkets (Adaptive Combat
Assistant, Weakness Analyzer, …), Watcher's Signets and new relics. 44 pool items need a
reputation (14 new, 29 changed, 1 unchanged), 5 a profession skill (Engineering), and 236 PvP
items a PvP rank.

## Schema summary

```text
ItemData
  meta   { source, scraper, product, foreverBuild, foreverBuildDate, classicProduct, classicBuild,
           tables { forever, classic }, wowDbDefs { repository, commit }, scrapedAt,
           filter { rule, qualities, reqLevel, minItemLevel, equippableOnly, maxClassicItemId,
                    excludedItemIds, excludedNamePattern, includeList },
           counts { items, byTab, sets, statsFrom }, noClientRow[{ id, name }],
           preRaidBis { file, specs, listedItems, inPool, addedByList, notInData[] },
           descriptionCoverage { rendered, generated, fallback, hidden, fallbackSpells[], hiddenSpells[] },
           ratingConversions }
  sets   { [setId]: { name, size, itemIds[], bonuses[{ pieces, text, parsed?, weaponSkill? }], bonusesFrom } }
  items[] sorted by slot (head … relic), then id

Item
  id, name, icon, quality, itemLevel, reqLevel (0 = none), tab, classicName
  foreverData, foreverSource ("client" | null), statsFrom ("forever" | "classic")
  slot, equipSlots[], itemClass, itemSubclass, armorType, weaponType
  binding ("BoP" | "BoE" | "BoU" | "Quest" | null), unique, uniqueEquipped { group, max }
  classes[] | null, races[] | null, requirements[{ kind, text, faction?, standing?, skill?, level? }]
  stats        Partial<Stats>
  weapon       { min, max, speed, dps, school, skill, extraDamage? } | null
  weaponSkill  { "Daggers": 5, … } | null
  procs[], useEffects[{ raw, cooldownSec? }], otherEquip[]     // rendered tooltip lines
  setId, source (always null), preRaidBis [{ spec, slot, rank }]
  sellPrice (copper), flavor, classic { stats, weapon, weaponSkill } | null
  classicShieldBlockValue?, notes[]
```

The browser build drops `classic`, `flavor`, `sellPrice`, `notes` and the bulky `meta` blocks
(`tables`, `descriptionCoverage`, `preRaidBis`, `noClientRow`); see `SLIMMERS` in
`vite.config.ts`.

| Field | From the client |
| --- | --- |
| `name`, `quality`, `itemLevel`, `reqLevel` | `ItemSparse.Display_lang`, `OverallQualityID`, `ItemLevel`, `RequiredLevel` |
| `slot`, `equipSlots` | `ItemSparse.InventoryType` (one-hand → main or off hand; shield and held in off hand → off hand; thrown and relic → ranged) |
| `itemClass`, `itemSubclass`, `armorType`, `weaponType` | `Item.ClassID`/`SubclassID`; the subclass's `ItemSubClass.DisplayName_lang`, or its `VerboseName_lang` where two subclasses share a display name ("One-Handed Swords" / "Two-Handed Swords") |
| `binding` | `ItemSparse.Bonding` (1 BoP, 2 BoE, 3 BoU, 4 Quest) |
| `unique`, `uniqueEquipped` | `MaxCount` 1 is Unique; `ItemLimitCategory` (flag 1: equipped) gives a named Unique-Equipped group and its limit; `Flags[0]` 0x80000 is Unique-Equipped with no group |
| `classes`, `races` | `AllowableClass` / `AllowableRace` against `ChrClasses` / the playable races (`CharBaseInfo`); null when every one is allowed. No pool item restricts races |
| `requirements` | `MinFactionID` + `MinReputation` (`Faction` name, Hated … Exalted), `RequiredSkill` + `RequiredSkillRank` (`SkillLine`), `RequiredAbility` (spell name), `RequiredPVPRank` (the client counts four dishonorable ranks first, so 14 is rank 10, Lieutenant Commander or Champion) |
| `stats`, `weapon`, `weaponSkill`, `setId` | the derivation, [client.md, "Items from the client"](client.md#items-from-the-client) |
| `procs`, `useEffects`, `otherEquip` | `ItemEffect` spells, text [below](#effect-and-set-bonus-text) |
| `icon` | [above](#how-the-data-was-obtained) |
| `sellPrice`, `flavor` | `SellPrice`, `Description_lang` |
| `classicName` | the Classic Era row's name when Forever renamed the item (none in this pool) |
| `source` | always null: the client's Encounter Journal tables ship empty ([client.md](client.md#phase-2-notes-what-this-client-ships)) |

## Stats, armor and block value

`stats` holds the item's stat columns plus every equip spell whose auras are all flat stats
([client.md, "Aura → stat"](client.md#aura--stat)). Equip spells that aren't (procs, class
tweaks, run speed, zone or form bonuses) stay effect lines.

**Armor is two fields.** `armor` is the base armor: Forever's formula for the item level,
quality and slot, or the Classic Era row's stored armor. `bonusArmor` is Forever's stat 50
plus any "+N Armor" equip spell. **Forever's tooltip adds stat 50 to its white armor line**,
and foreverchanges stored that sum as `armor`, so its dataset showed stat 50 as armor
changes: that is what most of the "armor changed" items were (Whitesoul Helm 509 → 629 is
509 armor + 120 bonus armor). 76 pool items carry bonus armor (74 of them Forever's stat 50).
The engine sums the two into total armor (`src/sim/stats/stat-block.ts`:
`itemArmor × (1 + Toughness %) + bonusArmor + 2 × Agility`), so Toughness applies to base
armor only. It has no bear-form armor multiplier yet; when it gets one, whether that
multiplies stat 50 is an open question ([client.md](client.md#what-m15c-2-needs-to-know)).

**Shield block value.** The Forever client has no innate shield block value (no
`ShieldBlockRegular` game table, no per-shield field); Classic Era's comes from that game
table. Putting Classic's into `stats.blockValue` would make the 20 fallback shields outrank
Forever ones for want of data, so it is kept apart as `classicShieldBlockValue` (only on
shields with `statsFrom: "classic"`). `stats.blockValue` holds block value from stat 48 and
equip spells only, as before. Whether Forever shields have a base block value is an open
question ([client.md](client.md#open-questions)).

## Effect and set-bonus text

Each effect line is the tooltip's prefix (`Use: `, `Equip: `, `Chance on hit: `) and the
spell's `Spell.Description_lang`, rendered by
[`lib/spell-text.mjs`](../../scripts/scrape/lib/spell-text.mjs). Set bonuses are rendered the
same way, without the "(N) Set: " prefix. The renderer resolves:

| Tokens | Value |
| --- | --- |
| `$s1`, `$S1`, `$m1`, `$M1` | effect points; a range ("90 to 110") when the effect has a spread (Forever `Variance`, rounded at both ends; Classic Era die sides) |
| `$o1`, `$t1`, `$d` | points × ticks over the duration; tick period; duration ("15 sec", "1 min") |
| `$a1`, `$h`, `$n`, `$u`, `$x1`, `$i`, `$r`, `$q1`, `$e1`, `$b1`, `$proccooldown` | radius, proc chance, charges, stacks, chain targets, max targets, range, misc value, amplitude, points per resource, proc cooldown in seconds |
| `$17669s1`, `$27499d` | the same, read from another spell |
| `$/1000;s1`, `$*2;s1` | a token divided or multiplied |
| `${$m1/-1000}`, `${$s1}.1` | arithmetic over signed tokens, with `$max`, `$min`, `$floor`, `$ceil`, `$abs`, `$round`, `$cond`, `$gt`, `$lt`; `.N` gives N decimals |
| `$<name>` | a `SpellDescriptionVariables` variable (`$PL` is 60) |
| `$ghis:her;`, `$lcharge:charges;` | the first form; plural by the last number |
| `$@spelldesc123`, `$@spellname123`, `$@auradesc123` | another spell's description or name |

Anything else (`$?s123[…][…]` player conditions, `$z`, unknown variables) counts as
unrendered, and the line falls back to a plain description: the spell's flat stats ("+28
Attack Power.") or its name. **Coverage in this snapshot** (`meta.descriptionCoverage`):

| | Lines |
| --- | --: |
| Rendered cleanly | 500 |
| Generated from the spell's auras (conditional stat bonus with an empty description) | 1 |
| Fallback (a variable couldn't be rendered) | **0** |
| Hidden (empty description, which the game doesn't show either) | 3 |

The one generated line is Rune of the Guard Captain's area-restricted spell 1287704: "Equip:
+28 Attack Power in certain areas." (its always-on +14 AP is now a stat; together they are the
tooltip's "tripled in Forest and Grassland areas"). The hidden spells are Seal of Ascension's
use and equip spells (16349, 16372) and Arcanite Dragonling's Forever equip dummy (1318325).

Checked against the foreverchanges tooltips for items whose stats come from the same client:
**190 of 201 effect lines read the same** (ignoring the cooldown suffix and final period), and
**261 of 261 set-bonus texts**. The 11 others are the parser fixes and bucket moves of the
diff below.

**Use cooldowns** (`cooldownSec`) are the item effect's own cooldown, else its category
cooldown (`ItemEffect`, else the spell's `SpellCooldowns`), and the line ends with the
tooltip's "(2 Min Cooldown)". Eight differ from the old tooltips: Nat Pagle's Broken Reel and
Draconic Infused Emblem 75 s (the tooltip rounded to "1 Min"), the Undermine trinkets 90 s
(foreverchanges showed 2 min, likely a hotfix), and Stormpike / Frostwolf Insignia Rank 6 (1 s)
and Hook of the Master Angler (5 s), whose short category cooldowns the old tooltips didn't
print.

Which bucket a line goes in follows the spell, not its wording: `procs` are "Chance on hit"
spells and equip spells with a proc aura (15 "when struck", 42, 43); `useEffects` are use
spells; `otherEquip` are the other equip spells, including conditional ones. The engine lists
items with procs or other equip effects it doesn't model with each result.

## Forever's ratings `[F]`, with open questions

The Forever client rewrites Classic's percentage bonuses as ratings. `meta.ratingConversions`
measures this on every item both clients have (any quality, original Classic ids): where the
Classic Era row has exactly one of the old stats and the Forever row has the rating instead,
it tallies rating ÷ old value.

| Rating | Replaces | Rating per unit | Samples (other ratios) |
| --- | --- | --: | --- |
| `critRating` | melee, ranged **and** spell crit | 14 per 1% | 355 |
| `hitRating` | melee **and** spell hit | 10 per 1% | 154 (7 ×1) |
| `dodgeRating` | dodge | 12 per 1% | 48 |
| `parryRating` | parry | 15 per 1% | 8 (21 ×1) |
| `blockRating` | shield block chance | 5 per 1% | 12 |
| `defenseRating` | Defense skill | 1 per point | 64 (1.33 ×1) |

These match the tooltip ratios foreverchanges showed. They are item-data ratios, not measured
combat values. Open questions:

- `[?]` Do these ratios hold in combat at level 60? Does 14 rating give exactly 1% crit
  against a level-63 boss? One crit rating covers melee and spell crit, and one hit rating
  covers melee and spell hit. Test on the beta.
- `[?]` Is 1 Defense Rating worth 1 Defense skill in game?
- `[?]` **Expertise Rating** is new. It replaced weapon skill on two low-level items at
  inconsistent ratios (Dwarven Tree Chopper "+6 Expertise Rating" for "Two-handed Axes +2",
  Servomechanic Sledgehammer "+10" for "+7"). In the pool it appears on the Adaptive Combat
  Assistant (+20) and two Stalwart Watcher's Signets (+10).
- `[?]` **Health Regeneration** replaced "Restores N health per 5 sec" at inconsistent ratios
  (1.2× to 4.5×), so its unit is unknown. It is kept as `healthRegen`, separate from `hp5`.
- **Spell power split:** "Spell Power" is damage and healing. Healing items now carry
  "+N Healing" plus "+N Spell Damage" at about a third of it (Whitesoul Helm: +35 Healing,
  +12 Spell Damage).

## How heavily Forever re-itemized the pool

Of the 556 pool items both clients have, 210 read the same and 346 changed. Of the 346:

- **106** only swap Classic percentages for ratings at the ratios above.
- **136** change values: armor on 70 (mostly stat-50 bonus armor on top of an unchanged base,
  and six reputation pieces and Emerald Circle with lower base armor), primary stats on 33,
  secondary stats on 58 (new +Spell Damage on healing gear, +Spell Power on caster pieces),
  weapon damage on 13. Whiteout and Crackling Staff drop from 55.6 to 41.3 DPS and
  Shivsprocket's Shiv, Simone's Cultivating Hammer and Verimonde's Last Resort from about 43
  to about 28 (caster weapons trade DPS for spell power); The Unstoppable Force goes from
  175–292 to 166–277 at the same DPS.
- **104** change only effects, set bonuses or requirements: set bonus values (Stormshroud's
  proc chances doubled, the PvP "(4) Set" defensive procs gained a chance and an internal
  cooldown), effect descriptions and PvP rank requirements.

Forever also adds 328 new items to the pool. Some mix stats in unusual ways: 16 new
plate/mail pieces and Stormcarver carry both Strength and Spell Power, which matters for
Retribution and Protection paladins.

## Pre-raid BiS lists

**Decision (user, 2026-09-22):** "If there are some pre-raid BIS that aren't in our filter
they should be included too." Any quality, any level. The lists live in
[`scripts/scrape/pre-raid-bis.json`](../../scripts/scrape/pre-raid-bis.json), hand-authored
generator input whose `$comment` header repeats the rules below. Every listed item joins the
pool (it must still be equippable and pass the SoD guard), and **every** pool item gets
`preRaidBis: [{ spec, slot, rank }]` (`[]` if unlisted). `meta.preRaidBis` carries each spec's
name and source. The run fails if a listed name differs from the client's name for that id.

### Sources `[C]`

"Pre-raid" here means gear from dungeons (Dire Maul, LBRS/UBRS, Stratholme, Scholomance, BRD
and the rest), crafting, quests, reputation, world drops and BoEs, and PvP ranks up to Rank
10. Raid drops (Molten Core, Onyxia, Zul'Gurub, AQ20, BWL and later) are left out. Doctrine §2
allows only Classic Era guides, so every list comes from **Wowhead's WoW Classic pre-raid BiS
guides as they stood in 2021, before Season of Mastery and TBC Classic**. The live pages on
the same topics (for example
[the current Warrior Tank guide](https://www.wowhead.com/classic/guide/warrior-tank-pre-raid-best-in-slot-bis-gear-wow-classic))
have been rewritten for **Season of Mastery**, so they aren't used, and the Wayback Machine
copies are cited instead. Wowhead's Season of Discovery guides weren't used either.

| Spec (`spec`) | Guide (as archived) | Snapshot | Guide rows used |
| --- | --- | --- | --- |
| `warrior-fury` | [Warrior DPS Pre-Raid BiS, WoW Classic Phase 6](https://web.archive.org/web/20210517121139/https://classic.wowhead.com/guides/wow-classic-fury-warrior-dps-pre-raid-best-in-slot-gear) | 2021-05-17 | armor, jewelry, Main Hand, Off-Hand, Ranged |
| `warrior-arms` | same guide | 2021-05-17 | armor, jewelry, Two-Hand, Ranged |
| `warrior-protection` | [Warrior Tank Pre-Raid BiS, Phase 6](https://web.archive.org/web/20210518024651/https://classic.wowhead.com/guides/wow-classic-warrior-tank-pre-raid-best-in-slot-gear) | 2021-05-18 | armor, jewelry, Main Hand, Shield, Ranged; the dual-wield Off-Hand row is left out |
| `druid-feral-cat` | [Feral Druid DPS Pre-Raid BiS, Phase 6](https://web.archive.org/web/20210518013648/https://classic.wowhead.com/guides/wow-classic-feral-druid-dps-pre-raid-best-in-slot-gear) | 2021-05-18 | all rows (Two-Hand, One-Hand, Off-Hand, Idol) |
| `druid-feral-bear` | [Druid Tank Pre-Raid BiS, Phase 6](https://web.archive.org/web/20210518140340/https://classic.wowhead.com/guides/wow-classic-feral-druid-tank-pre-raid-best-in-slot-gear) | 2021-05-18 | all rows |
| `paladin-retribution` | [Paladin DPS Pre-Raid BiS, Phase 6](https://web.archive.org/web/20210517000811/https://classic.wowhead.com/guides/wow-classic-paladin-dps-pre-raid-best-in-slot-gear) | 2021-05-17 | all rows (Two-Hand, Relic) |
| `paladin-protection` | [Paladin Tank Pre-Raid BiS, Phase 3](https://web.archive.org/web/20210505223134/https://classic.wowhead.com/guides/wow-classic-paladin-tank-pre-raid-best-in-slot-gear) | 2021-05-05 | all rows (Main Hand, Shield; the guide has no libram) |

**Selection.** Each guide row lists items best-first. The list keeps that order as `rank` (1 =
BiS, 2+ = alternatives), up to the top pick plus two alternatives per slot. Finger and
trinket keep four, since two are worn. The guides link Horde PvP items; each one's Alliance
counterpart is added at the same rank, as is the Frostwolf twin of Stormpike Insignia Rank 6.
Slot keys are the paperdoll slots plus `twoHand` and `relic`; tanks' shields are under
`offHand`.

### Coverage

159 distinct items are listed. **All 159 have a client row and are in the pool**
(`meta.preRaidBis.notInData` is empty). **50** are in the pool only because of the lists: 6
Uncommon, 25 Rare and 19 Epic (Lionheart Helm, Savage Gladiator Chain, Ironfoe, Blackblade of
Shahram, The Unstoppable Force, Don Julio's Band, Wolfshead Helm, Manual Crowd Pummeler, Rune
of the Guard Captain, …).

| Spec | Items | new | changed | unchanged | no Forever data | Rank-1 items without Forever data |
| --- | --: | --: | --: | --: | --: | --- |
| `warrior-fury` | 50 | 0 | 13 | 4 | 33 | 9 of 17: Mark of Fordring, Cape of the Black Baron, Savage Gladiator Chain, Battleborn Armbraces, Brigam Girdle, Hand of Justice, Ironfoe, Mirah's Song, Satyr's Bow |
| `warrior-arms` | 48 | 0 | 14 | 4 | 30 | 8 of 16: as Fury, with Blackblade of Shahram instead of Ironfoe and Mirah's Song |
| `warrior-protection` | 50 | 0 | 8 | 3 | 39 | 10 of 18: Medallion of Grand Marshal Morris, Stoneskin Gargoyle Cape, Bracers of Valor, Boneclenched Gauntlets, Brigam Girdle, Cloudkeeper Legplates, Hand of Justice, Mirah's Song, Draconian Deflector, Satyr's Bow |
| `druid-feral-cat` | 39 | 0 | 6 | 0 | 33 | 12 of 16, including Manual Crowd Pummeler and Widowmaker |
| `druid-feral-bear` | 50 | 0 | 15 | 3 | 32 | 14 of 17, including Breastplate of Bloodthirst, Smoking Heart of the Mountain and Warden Staff |
| `paladin-retribution` | 36 | 0 | 5 | 1 | 30 | 10 of 14 |
| `paladin-protection` | 46 | 0 | 9 | 1 | 36 | 13 of 14, including the whole Deathbone set, Naglering, Force of Will and Flurry Axe |

Across the 159 listed items: **0 new, 33 changed, 9 unchanged, 117 with no Forever data**
(103 never had any, 6 seen in game, 8 hotfix-only: Deepfury Bracers, Flurry Axe, Widowmaker,
Serathil, Stonegrip Gauntlets, Boots of Avoidance, Smoking Heart of the Mountain, Ardent
Custodian).

**Listed items that Forever changed** (Forever rows `[F]`): Wolfshead Helm's powershifting
bonus becomes "+5 Rage from Enrage and +20 Energy from Tiger's Fury"; Rune of the Guard
Captain's +20 AP and 1% hit become +14 AP (tripled in Forest and Grassland areas) and +7 Hit
Rating; Warbear Harness gains +18 Agility; The Unstoppable Force deals 166–277; Stormpike /
Frostwolf Insignia Rank 6 trade 2% dodge and 8 health per 5 sec for +24 Dodge Rating and +30
Health Regeneration; the PvP armor gains armor (stat 50); the other plate pieces only restate
crit, hit, dodge and defense as ratings. **Listed items that now show Classic Era values**
although foreverchanges recorded Forever changes for them: Manual Crowd Pummeler (Unique, 3
min cooldown in game), Bracers of Valor (+2 Defense Rating), the Lightforge pieces, Smoking
Heart of the Mountain (no armor, a 6 min use in Forever), Stonegrip Gauntlets, Boots of
Avoidance and Ardent Custodian. They return to Forever values once a client build ships
their rows.

### Forever caveat

These are **Classic Era** lists. Forever re-itemized many of these items and has no data at
all for most of the rest. It also added level-55+ dungeons (Blackmaw Hold, Shaper's Terrace)
and 328 new items in this pool that no Classic guide knows. **Forever's real pre-raid BiS will
differ.** Treat `rank` as a Classic starting point for default gear sets, not a Forever
ranking, and let the sim decide. (foreverchanges.pro's own BiS lists were level-20 lists when
checked on 2026-09-22, and D17 retires the site as a data source.)

## From foreverchanges to the client

*History: the one-time switch in M1.5c-2, kept as its record.* The last foreverchanges
dataset (`git show b94a076:src/data/items/pre-bis.json`) was compared with the first client
one, field by field. Since M1.5f, `npm run diff:items` compares a fresh generation with the
committed dataset instead ([Re-running](#re-running-and-widening-the-filter));
`npm run diff:items -- --against=b94a076` still lists the raw field changes of the switch,
without the classes below. Result of the switch:

**Removed: 16**, the [items no client carries yet](#items-no-client-carries-yet).

**Added: 2**, both Classic Era rows that foreverchanges didn't list and that pass the rule:
**1973 Orb of Deception** (trinket, item level 59, required level 54; the site showed a
Forever hotfix row that made it an unequippable "Binds when used" item, which the raw client
lacks) and **18320 Demonheart Spaulders** (leather shoulders, item level 58, required level
53; not on the site at all). See [Caveats](#caveats).

**Changed fields**, on the 1,628 items in both (every change has a class):

| Class | Items | Fields |
| --- | --: | --- |
| Drop sources gone (the Encounter Journal ships empty) | 465 | `source` |
| PvP rank requirement added (the old tooltips didn't print it) | 236 | `requirements` |
| **Armor split:** stat 50 moved from `armor` to `bonusArmor`; `armor + bonusArmor` is unchanged | 74 | `stats.armor`, `stats.bonusArmor` |
| **Seen-in-game items now on their Classic Era row** | 60 | `tab`, `foreverData`, `statsFrom`; stats on most: Spirit 18, Spell Power 16, Healing 12, Spell Damage 12, Strength 12, Intellect 10, Stamina 9, Hit Rating 8, Agility 7, Spell Penetration 5, Defense Rating 4, and one each of crit rating, block value, health regeneration; Manual Crowd Pummeler's Unique flag and cooldown |
| **Hotfix-only items now on their Classic Era row** | 34 | `tab`, `foreverData`, `statsFrom`; stats on 10: Stonegrip Gauntlets and Ardent Custodian defense rating → defense, Boots of Avoidance dodge rating → dodge, Belt of Valor (+6 defense rating, 12 → 8 Stamina), Dreadmist Belt, Magister's Belt, Wildheart Gloves and Belt, Lightforge Gauntlets, Smoking Heart of the Mountain (150 armor and Unique back, its Forever use gone) |
| `tab` changed → unchanged (a Classic equip spell restated as a Forever stat of the same value) | 75 | `tab` |
| Use cooldowns from the client | 8 | `useEffects[].cooldownSec` |
| **Old tooltip-parser errors fixed** | 3 | Rune of the Guard Captain +14 AP, Seal of the Dawn +81 AP vs Undead, Rune of the Dawn +48 spell damage vs Undead (each sat on a line with a second sentence, so the old parser kept it as text) |
| Effect bucket (proc aura 42 "Adds N Fire damage to your weapon attack") | 3 | Fiery Plate Gauntlets, Storm Gauntlets, Fiery Retributer: `otherEquip` → `procs` |
| Icon names with a space, now spelled with `-` | 2 | `icon` (Artifact Seeker's Pendant, Swarming Idol) |

The subclass names match the site's for all 1,628 items: display names, and verbose names
only where two subclasses share one. The Devilsaur Leggings' 48 ranged AP (the tooltip prints
"+46 Attack Power") didn't change: foreverchanges showed Forever's row, whose stat is plain
attack power; only its Classic Era row splits melee and ranged.

**Sets (20 changes).** The 7 sets whose bonuses foreverchanges took from Classic Era because
no piece had a Forever tooltip now take Forever's `ItemSetSpell` (The Gladiator, The
Postmaster, Cadaverous Garb, Necropile Raiment, Bloodmail Regalia, Deathbone Guardian,
Ironweave Battlesuit; the table is in
[client.md](client.md#comparison-with-the-snapshot-history)). The Gladiator gains its sixth piece
(277117), Champion's Pursuit loses Classic's Champion's Chain Headguard (16526), which the site
filed under it. Devilsaur Armor's 2-piece bonus grants spell hit as well as hit. Ten
Highlander's, Defiler's, Blood Tiger and Black Dragon Mail bonuses read `crit` instead of
`meleeCrit` (aura 52; the engine adds both to melee crit). All 102 sets now come from
Forever's tables.

**Engine goldens.** Of the default gear sets, only Protection Warrior's changed: its rank-1
wrists, Bracers of Valor (a seen-in-game item), lose +2 Defense Rating on their Classic Era
row, which moves the golden run's block, dodge and parry counts slightly
(`src/sim/engine/__snapshots__/engine.test.ts.snap`). Fury's and Arms' default items read the
same.

## Validation

The run exits non-zero, and writes nothing, if:

- the SoD guard would admit an item with a Classic Era row and an id ≥ 25000;
- a `pre-raid-bis.json` entry is malformed, or its name differs from the client's for that id;
- a weapon has no damage range, or a set has no `ItemSet` row in either client;
- a table fails to parse, or isn't in the build.

It warns when an item has no icon, a listed item isn't in the pool, or an `ItemSparse` row has
no `Item` row. It prints any unrendered description with the spell, its tokens and the items
using it. The integrity tests in `src/data/data.test.ts` check the counts, the filter, the SoD
guard, the pre-raid BiS lists, the `statsFrom`/`foreverData`/`tab` flags, the set bonuses,
the absence of drop sources and of leftover `$` variables, and that `meta.noClientRow` items
aren't in the pool.

`npm run diff:items` regenerates the pool and lists every item added or removed and every
changed field against the committed dataset, sorted into kinds (an item gaining or losing its
Forever row first), plus set changes and watched items that a build now ships. The M1.5c-1
field-by-field check of the derivation against the foreverchanges tooltips
(`npm run compare:items`) was retired in M1.5f; its result is kept in
[client.md](client.md#comparison-with-the-snapshot-history).

## Caveats

- **Raw client files, not the server.** The server may still disagree, and server hotfixes
  aren't in the files at all ([client.md, "Hotfix caveat"](client.md#hotfix-caveat)): 16 items
  are missing and 34 fall back to Classic Era for that reason, and the Undermine trinkets'
  cooldowns may be hotfixed. Guild measurements win (doctrine §2).
- **Orb of Deception** is in the pool as a Classic Era trinket with no stats and a transform
  use. In Forever it's a "Binds when used" item that isn't equippable (the hotfix row
  foreverchanges showed), so it will leave the pool when a client build ships that row.
- **Demonheart Spaulders** (18320) is a Classic Era row foreverchanges never listed. Whether it
  drops anywhere in Classic or Forever is unconfirmed `[?]`; it has no BiS listing and no
  effect on defaults.
- **PvP rank requirements** are shown as numbers (`Requires PvP rank 10`): the rank title
  depends on the faction, which these item rows don't encode.
- `armorType` for cloaks is `"cloth"` (their item subclass); any class can wear them.
- `binding` is null for Assassin's Throwing Axe (21135), whose row doesn't bind.
- The derivation's `[?]` formulas (caster-weapon DPS, some Forever stat types) and its open
  questions are in [client.md](client.md#open-questions).

## Re-running and widening the filter

```sh
npm run scrape:items                  # = node scripts/scrape/items-client.mjs (cached; latest beta build)
npm run scrape:items -- --version=<build>   # a specific Forever build
npm run scrape:items -- --refresh     # re-ask for the latest build and re-download
npm run diff:items                    # regenerate, then diff against the committed pool (.cache/client/<build>/items-diff.md)
npm run diff:items -- --against=<ref> # diff against another commit
npm run scrape:client                 # then refresh src/data/client, whose interest set reads this pool
git diff --stat src/data              # review what changed
```

A cached run is byte-for-byte reproducible: `scrapedAt` is the newest download time of the
files read, not the clock. The run prints the filter, counts by tab, slot and quality, the
exclusions, BiS coverage, the watched items still without a row, and description coverage.

To add epics or change the level rule, edit `QUALITIES` / `REQ_LEVEL` / `MIN_ITEM_LEVEL` and
run it. To change the BiS lists, edit `scripts/scrape/pre-raid-bis.json` by hand, keep a source
URL per spec, follow the selection rules above, and never take a list from a Season of
Discovery, Season of Mastery, TBC+ or private-server guide. A new stat type or aura shows up
as an item note or in `unknownStatTypes`: map it in `lib/item-stats.mjs` (`STAT_TYPE`,
`AURA_STAT`) and add any new key to `Stats` in `types.ts`.
