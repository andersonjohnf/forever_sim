# Client-data dataset

`src/data/client/*.json` hold the numbers the engine needs, read straight from the WoW Forever
beta client's own files: spell effects and timings, talent ranks, item effects, enchants and
game tables. The raw files come from the [wago.tools API](https://wago.tools/apis)
([decision D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)) and are
parsed with the community's [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) definitions.
Interfaces are in [`src/data/client/types.ts`](../../src/data/client/types.ts); the scraper is
[`scripts/scrape/client.mjs`](../../scripts/scrape/client.mjs) with its readers in
[`scripts/scrape/lib/`](../../scripts/scrape/lib/).

| | |
| --- | --- |
| Source | `https://wago.tools/api/casc/<fdid>?version=1.60.1.69913` (raw client files by FileDataID) |
| Product · build | `wow_classic_beta` · `1.60.1.69913` (wago.tools lists it as created 2026-09-18 03:02:04) |
| Classic Era baseline | `wow_classic_era` · `1.15.9.69722` (read only for the doc-claim comparisons below) |
| Definitions | WoWDBDefs commit [`2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e`](https://github.com/wowdev/WoWDBDefs/tree/2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e) (2026-09-22) |
| Scraped | 2026-09-22 (`meta.scrapedAt`, the latest download time of the files a dataset reads) |

| File | Size | What |
| --- | --: | --- |
| `spells.json` | 1.2 MB | 1,222 merged spell records (the interest set below), plus racials, radii and spell categories |
| `talents.json` | 145 KB | every Forever talent of the three classes, mapped to its Trait node, spell and per-rank values |
| `items.json` | 1.2 MB | ItemEffect rows and ItemSparse/Item fields for the 1,644 pre-raid items, plus 85 consumables |
| `enchants.json` | 56 KB | the 79 SpellItemEnchantment rows the buffs doc names, with the spells and items that apply them |
| `gametables.json` | 4 KB | level-60 rows of combat ratings, base mana, HP per Stamina, armor mitigation, PlayerExpectedStat |

Every file starts with the usual `meta` envelope: `source`, `product`, `build`,
`buildCreatedAt`, `tables` (table or game-table file → FileDataID), `wowDbDefs` (repository and
commit), `scrapedAt` and `scraper`.

## How the data was obtained

### Requests

Only the documented API endpoints are called, and the fetch layer
([`lib/http.mjs`](../../scripts/scrape/lib/http.mjs)) refuses every other wago.tools path
(its pages, `/db2/…` and the CSV export stay off-limits under its `robots.txt`):

| Endpoint | Used for |
| --- | --- |
| `GET https://wago.tools/api/builds/wow_classic_beta/latest` | confirm the build (`1.60.1.69913`) |
| `GET https://wago.tools/api/files?version=<build>&format=json` | the build's file list: FileDataIDs of the game tables, whether a DB2 ships in the build, icon file names |
| `GET https://wago.tools/api/casc/<fdid>?version=<build>` | each raw DB2 and game-table file, once |
| `GET https://api.github.com/repos/wowdev/WoWDBDefs/commits/master` | the WoWDBDefs commit to pin (cached, so later runs reuse it) |
| `GET https://raw.githubusercontent.com/wowdev/WoWDBDefs/<sha>/manifest.json` | table name → DB2 FileDataID |
| `GET https://raw.githubusercontent.com/wowdev/WoWDBDefs/<sha>/definitions/<Table>.dbd` | column names and types |

Requests go one at a time, at least 1.1 s apart, with the User-Agent
`forever_sim-client-data/0.1 (+https://github.com/andersonjohnf/forever_sim)`. Every response
is cached under `.cache/client/` (git-ignored) and is never downloaded again unless
`--refresh` is passed. `.cache/client/requests.jsonl` logs every network request.

**Request count for this snapshot: 175, all HTTP 200.**

| Host | Requests |
| --- | --: |
| wago.tools: builds (1 repeated after a cache-key change), file lists for both builds | 2 + 2 |
| wago.tools: `/api/casc`, Forever build (67 DB2 files, 7 game tables) | 74 |
| wago.tools: `/api/casc`, Classic Era build (28 DB2 files, for the claim checks and phase 2) | 28 |
| GitHub: commit lookup, manifest, 67 `.dbd` files | 69 |

A later run from the cache makes no requests. A fresh build costs 44 wago.tools requests for
the datasets (38 DB2 files, 4 game tables, the build lookup and the file list), about 30 more
with `--claims` if the Classic Era baseline isn't cached yet, and about 40 GitHub requests only
when WoWDBDefs is re-pinned.

### Cache layout

```text
.cache/client/
  builds/<product>_latest.json         /api/builds/<product>/latest
  <build>/api/files.json               the build's file list (108 MB for 1.60.1.69913)
  <build>/casc/<fdid>.bin (+ .meta.json)  raw files as served
  <build>/tables/<Table>.ndjson        every parsed table in full: line 1 = parse metadata
                                       (layout hash, sections, storage, warnings), then one row per line
  <build>/gametables/<name>.json       parsed game tables
  <build>/claims.md                    the doc-claim report (--claims)
  github/wowdbdefs/<sha>/…             manifest.json and definitions/*.dbd
  requests.jsonl
```

The download layer ([`lib/wago.mjs`](../../scripts/scrape/lib/wago.mjs)) is generic over product
and build, and every table it touches is kept whole in `tables/`, not just the extracted subset.
Both builds' tables are already cached: 67 for 1.60.1.69913 and 28 for 1.15.9.69722.

## Parser coverage

[`lib/db2.mjs`](../../scripts/scrape/lib/db2.mjs) is a zero-dependency reader written from the
[wowdev.wiki DB2 page](https://wowdev.wiki/DB2). No code was copied from wow.export or any
other reader. It reads **WDC3, WDC4 and WDC5**; every file in both builds is WDC5 (schema
strings `WOWSTATIC_1_60_1_69800` and `WOWSTATIC_1_15_9_68185`).

| Feature | Coverage | Seen in 1.60.1.69913 |
| --- | --- | --- |
| Header (WDC5 adds version + 128-byte schema string), section headers, field structure, field storage info | yes | every file |
| Storage: none, bitpacked, common data, pallet, pallet array, signed bitpacked | all six | 258 / 38 / 58 / 126 / 27 / 122 columns |
| Pallet and common values narrowed to the column width (a `u8` in a pallet word `0x2BF65` is 101) | yes | e.g. `SpellAuraOptions.ProcChance` |
| String blocks (offsets relative to the field, all sections' blocks addressed as one) | yes | every table with strings |
| Sparse tables (offset map, inline C strings, offset-map id list) | yes | `Spell`, `ItemSparse` |
| ID lists, inline ids | yes | every file |
| Copy tables (duplicate rows under new ids) | yes | 13 tables (`SpellName` alone has 14,420 copies) |
| Relationship maps (non-inline foreign keys such as `SpellEffect.SpellID`) | yes | 26 tables |
| Encrypted sections (`tact_key_hash ≠ 0`); WDC4+ per-section encrypted-id lists | read; zero-filled sections are skipped and reported | 24 tables, below |

Column names come from the `.dbd` block whose `LAYOUT` list has the file's layout hash and whose
`BUILD` list covers the build ([`lib/dbd.mjs`](../../scripts/scrape/lib/dbd.mjs)); all 95 files
matched on both. The reader cross-checks its offsets (pallet and common block sizes, the first
section's start after the encrypted-id lists) and warns on any mismatch; there were none.
Game tables ([`lib/gametable.mjs`](../../scripts/scrape/lib/gametable.mjs)) are tab-separated
text with a header row.

**Older layouts.** Classic Era 1.15.9 stores effect values in the integer `EffectBasePoints`
with the old convention (minimum = `EffectBasePoints + 1` when `EffectDieSides ≥ 1`, maximum =
`EffectBasePoints + EffectDieSides`). Forever's layout drops both columns: `EffectBasePointsF`
is the value, and spread is `Variance`. So **this client has no die-sides column**; the spell
extractor keeps `EffectBasePoints`/`EffectDieSides` when a layout has them, and
`effectPoints()` in [`lib/spells.mjs`](../../scripts/scrape/lib/spells.mjs) reads either.

**Encrypted sections.** 4,432 records in 24 tables sit in sections encrypted with seven TACT
keys the client doesn't ship. wago.tools serves them zero-filled, so they are skipped and
their record ids are recorded. None of them is a spell, item or enchant the datasets need
(`spells.json` `notInClient` is empty). They are most likely content the server will unlock
later.

| TACT key hash | Records | Tables |
| --- | --: | --- |
| `0DA4670DB36FB2A9` | 2,272 | Spell, SpellMisc, SpellEffect, SpellAuraOptions, SpellCooldowns, SpellCategories, SpellPower, SpellLevels, … |
| `D2C028CB7AC14D0B` | 1,243 | the same spell tables |
| `DA0E7785727A0A65` | 722 | spell tables, Item, ItemSparse, ItemEffect, ItemXItemEffect, ItemModifiedAppearance |
| `057DC814574BD5B6` | 171 | spell tables, ItemEffect, SkillLineAbility, SpellItemEnchantment |
| `D731877A6452D7E6` | 14 | spell tables, Item, ItemSparse, ItemEffect, SkillLineAbility |
| `5699DB626E0CD467`, `DEFE949FF04343D4` | 5 + 5 | Item, ItemSparse, ItemAppearance, ItemDisplayInfo, ItemModifiedAppearance |

Nothing else is left unparsed.

## Hotfix caveat

Raw client files **don't include server hotfixes**. The server sends hotfixed and added rows
to the client at login (the client's DBCache), and wago.tools collects hotfixes for its table
pages, which is presumably how foreverchanges.pro shows rows the raw file lacks. Anything a
hotfix changed or added is missing or stale here. Evidence in this build:

- **50 items that foreverchanges shows as Forever client data have no `ItemSparse` row** in the
  raw 1.60.1.69913 file, and none of them is in an encrypted section. They are most likely
  hotfix rows: 13113 Feathermoon Headdress, 272491 Premier Chain Headguard, 13002 Lady
  Alizabeth's Pendant, 13007 Mageflame Cloak, 271907 Expeditionary's Cape, 272063 Darkspear
  Raider's Cloak, 272411 Arcanoweave Cloak, 272414 Howler's Furs, 272415 Stalwart Cloak,
  13123 Dreamwalker Armor, 13120 Deepfury Bracers, 13135 Lordly Armguards, 13072 Stonegrip
  Gauntlets, 16717 Wildheart Gloves, 16724 Lightforge Gauntlets, 16685 Magister's Belt, 16702
  Dreadmist Belt, 16716 Wildheart Belt, 16736 Belt of Valor, 9402 Earthborn Kilt, 284261
  Magically Fortified Legguards, 13070 Sapphiron's Scale Boots, 13101 Wolfrunner Shoes, 14549
  Boots of Avoidance, 13096 Band of the Hierophant, 11811 Smoking Heart of the Mountain, 13000
  Staff of Hale Magefire, 13047 Twig of the World Tree, 13053 Doombringer, 13060 The Needler,
  271924 Rebels' Rugged Reaper, 272079 Darkspear Raider's Reaper, 284257 Icesworn
  Decapitator, 868 Ardent Custodian, 6622 Sword of Zeal, 13028 Bludstone Hammer, 271928 Clever
  Expeditionary's Spellblade, 271936 Guerilla's Jagged Mace, 272083 Darkspear Insurgent's
  Spellblade, 272091 Darkspear Skirmisher's Bludgeon, 871 Flurry Axe, 4091 Widowmaker, 13015
  Serathil, 13083 Garrett Family Crest, 4696 Lapidis Tankard of Tidesippe, 271932 Insurgent's
  Manifesto, 272087 Tome of the Darkspear Prophecy, 13004 Torch of Austen, 13023 Eaglehorn
  Long Bow, 13146 Shell Launcher Shotgun. Their `items.json` records have `itemSparse: null`;
  the tooltips in `src/data/items/pre-bis.json` stay the source for their stats. (The 60
  "seen in game" items and the 650 "missing" ones have no row either, as
  [items.md](items.md) already says.)
- **No sign of spell hotfixes in the compared fields:** every cooldown (170), cost (435), cast
  time (487) and range (343) of every Forever spellbook rank matches foreverchanges exactly,
  and all 156 talents sit in the same cell with the same max rank.

Values that might differ in game, because the client's numbers are placeholders the server
overrides, or disagree with the tooltip a hotfix may already have fixed:

| Value | Raw client | Why it may differ |
| --- | --- | --- |
| Proc rates of weapon enchants and items | no `SpellAuraOptions` row references a PPM id; Crusader's equip aura 458112 (and Grand Crusader's 1231126) says `ProcChance` 100 on melee hits, and the other weapon enchants cast their proc spell with no rate at all | PPM and many proc chances are server-side |
| Enchant 2618 (2H Weapon – Lesser Agility) | equip spell 19989 grants +9 Agi | tooltip and enchant name say +15 |
| Enchant 925 (Bracer – Lesser Deflection, Necklace – Deflection) | spell 13930 grants +2 defense | tooltip says +5 |
| Consecrated Sharpening Stone (28893) | 99 AP vs Undead | tooltip says 100 |
| Frenzy potions (1251937/8/40) | aura 13, flat physical damage done | tooltip says Attack Power |
| Trueshot Aura r5 (20906) | 50, below rank 4's 75 | possible data bug |
| Demoralizing Shout 11556 / Roar 9898 | −196 / −193 with −1.4 per level up to level 64 / 62 | −204.4 / −204.2 at 60 if the server applies it; the tooltip says −196 / −193 |
| Hyjal flasks (1293740–1293743) | a dummy with the value plus a zero-valued hit/crit/haste aura | the zone bonus is filled in server-side |
| World buffs 22888, 15366, 16609 | dummy auras only | effects are server-side (and excluded anyway, D8) |
| Dummy-effect talents and abilities (Flurry talent aura 4 = 1, Tiger's Fury aura 4 = 15, King of the Jungle's hidden 5/10/15, …) | the dummy's points | the server scripts what a dummy does |
| Deep Wounds 12721 | absent (no SpellName, SpellEffect or SpellMisc row, not encrypted) | the talent 12834 casts the Forever bleed 412609 server-side |

## Datasets

### `spells.json`

```text
meta
counts         { spells, seeds, bySource, notInClient, encryptedSpellNameRecords }
notInClient    [{ id, sources, encrypted }]        ids an input names that the client lacks (empty)
excludedWorldBuffs  { id: name }                   left out on purpose (D8): 15366, 22888
racials        { raceId: { chrRacesId, playableRaceBit, racials: [{ id, name, classicSpellId,
                 spells: [{ spellId, classMask, skillLine, acquireMethod }] }] } }
radii          { SpellRadius id: { radius, radiusMin, radiusMax, radiusPerLevel } }
spellCategories { SpellCategory id: { name, flags, maxCharges, chargeRecoveryTime, typeMask } }
spells         { id: ClientSpell }
ClientSpell    id, name, nameSubtext ("Rank 5"), sources[]
               misc         { attributes[17], schoolMask, speed, minDuration, spellIconFileDataId }
               castTime     { base, minimum }                  (SpellCastTimes, ms)
               duration     { duration, maxDuration }          (SpellDuration, ms)
               range        { rangeMin[2], rangeMax[2], flags } (SpellRange, yards)
               effects[]    { effectIndex, effect, effectAura, effectBasePointsF, variance,
                              effectRealPointsPerLevel, effectPointsPerResource,
                              effectBonusCoefficient (SP), bonusCoefficientFromAp (AP),
                              effectTriggerSpell, effectMiscValue[2], effectRadiusIndex[2],
                              effectAmplitude, effectAuraPeriod, effectChainTargets,
                              effectMechanic, effectSpellClassMask[4], implicitTarget[2] }
               auraOptions  { procChance, procCharges, procTypeMask[2], procCategoryRecovery (ICD),
                              cumulativeAura (max stacks), spellProcsPerMinuteId, ppm { baseProcRate, flags, mods[] } }
               cooldowns    { recoveryTime, categoryRecoveryTime, startRecoveryTime (GCD) }
               categories   { category, startRecoveryCategory, defenseType, dispelType, mechanic,
                              preventionType, diminishType }
               power[]      { powerType, manaCost, powerCostPct, optionalCost }
               levels       { baseLevel, spellLevel, maxLevel }
               shapeshift   { shapeshiftMask[2], shapeshiftExclude[2] }
               classOptions { spellClassSet, spellClassMask[4] }
               equippedItems { equippedItemClass, equippedItemSubclass, equippedItemInvTypes }
               targetRestrictions { maxTargets, maxTargetLevel, targetCreatureType, targets, coneDegrees }
               auraRestrictions { casterAuraState, targetAuraState, exclude…, …AuraSpell }
```

- **Names** are the WoWDBDefs columns in camelCase (`RecoveryTime` → `recoveryTime`,
  `…ID` → `…Id`, `Name_lang` → `name`). Units are the client's: ms, yards, rage in tenths
  (`manaCost` 300 = 30 rage), percentages as whole numbers, bit masks as signed 32-bit ints.
- **Zero values are omitted** to keep the file small (it was 3.6 MB with them): an absent
  number is 0, an absent array is all zeros, an absent object means the spell has no row in
  that table. `id`, `name`, `effects`, `sources` and each effect's `effectIndex` and `effect`
  are always present. Only `DifficultyID` 0 rows are used.
- **Trimmed columns.** Left out because they were zero for every extracted spell (the scraper
  warns if one of them gains a value): `SpellEffect` `Coefficient`, `ResourceCoefficient`,
  `EffectAttributes`; `SpellMisc` `LaunchDelay`; `SpellPower` `ManaCostPerLevel`,
  `ManaPerSecond`, `PowerCostMaxPct`, `PowerPctPerSecond`, `OptionalCostPct`,
  `RequiredAuraSpellID`; `SpellLevels` `MaxPassiveAuraLevel`; `SpellCooldowns` `AuraSpellID`;
  `SpellCategories` `ChargeCategory`; `SpellClassOptions` `ModalNextSpell`;
  `SpellTargetRestrictions` `Width`; the four `…AuraType` columns of `SpellAuraRestrictions`;
  `SpellDuration` `DurationPerResource`. Left out as irrelevant to the engine: visual scripts,
  content tuning, `PvpMultiplier`, `GroupSizeBasePointsCoefficient`, `EffectPos_facing`,
  `EffectItemType`, `StanceBarOrder`, and `EffectChainAmplitude` (1 everywhere except six
  chain-spell effects). Lookup indexes (`castingTimeIndex`, `durationIndex`, `rangeIndex`) are
  replaced by the rows they point at; radius and category rows are the top-level maps.
- **AP coefficients:** `bonusCoefficientFromAp` is 0 for every extracted spell. Forever puts
  attack-power scaling in dummy effects (Bloodthirst: `SCHOOL_DAMAGE` 48 plus `DUMMY` 35 = 35%
  of AP) or leaves it to the server. `effectBonusCoefficient` (spell power) is 1 on most
  physical effects, which appears to be a client default rather than a rule.
- **PPM:** `SpellProcsPerMinute` has rows 454–463 (1–10 PPM) and 479 (2.3), all with Flags 1
  (meaning unverified), and `SpellProcsPerMinuteMod` is empty. No `SpellAuraOptions` row
  references a PPM id, so every `ppm` in the file is absent: proc rates are server-side.

**Interest set: 1,222 spells** (1,134 before the trigger closure), every one in the client:

| Source | Spells | What |
| --- | --: | --- |
| `spellbook` | 494 | every Forever rank in `src/data/spells/{warrior,druid,paladin}.json` |
| `talent` | 156 | each talent's TraitDefinition spell |
| `racial` | 44 | the racials of `src/data/races/races.json`, resolved through `SkillLineAbility` race masks and names, per-class variants included (e.g. Eureka!: 1259813 for warriors) |
| `item` | 181 | ItemEffect spells of the pre-raid items |
| `consumable` | 79 | ItemEffect spells of the consumables in the buffs doc, and the doc's own `→` spell ids |
| `enchant` | 125 | enchanting spells, the spells each enchant casts (combat, equip, use), doc proc spells |
| `buffsDoc` | 47 | buff and debuff spell ids in the buffs doc's §1 and §4 tables |
| `docs` | 256 | spell ids cited in `docs/classes`, `docs/mechanics` and `docs/open-questions.md`, either with a marker ("spell 12966", "[F 20128]", "proc 25713", "DB2 21184", "(3025, 1178, 9635)", backticks) or with the client's name earlier on the same line; Classic "(C: …)" ids are skipped |
| `trigger` | 104 | reached through another extracted spell's `effectTriggerSpell`, transitively |

A spell can have several sources, so the column sums to more than 1,222. The docs source was
added beyond the brief because the engine needs proc and passive spells that no spellbook lists:
the Flurry buff 12966, the stance passives 21156/7376/7381, the Overpower window 1282733,
Consecration's tick spells, Weaponmaster's procs, the Forever Deep Wounds bleed 412609 and the
T1 set bonuses. World-buff spells are never extracted (D8).

### `talents.json`

```text
meta, counts { talents, mapped, byName, byPosition, unmapped }, unmapped[]
classes.<class> { traitTreeId, tabs [{ tree, index, posX [left, right] }], talents [ClientTalent] }
ClientTalent  id (talents/<class>.json id), name, clientName, tree, tier, col, maxRank, matchedBy
              traitNodeId, traitNodeEntryId, traitDefinitionId
              spellId, visibleSpellId, overridesSpellId
              rankSpellIds[maxRank]
              rankEffects [{ effectIndex, operationType, curveId, values[maxRank] }]
              client { tier, col, prerequisiteNodeIds[], prerequisiteTalentIds[] }
              mismatches[]
```

Forever keeps talents in the **Trait tables**, one `TraitTree` per class (warrior 1117, druid
1089, paladin 1100). The legacy `Talent`/`TalentTab` tables still ship but hold the Classic Era
trees. A talent with N ranks is **one spell for every rank**, whose effect values come per rank
from `TraitDefinitionEffectPoints` → `CurvePoint`: Flurry 12319 is 5/10/15/20/25, Dual Wield
Specialization 5–25 / 20–100 / 2–10 on its three effects. So `rankSpellIds` repeats the spell
id and **`rankEffects` holds the numbers**. A tree's three tabs are its three `PosX` clusters;
tier = (`PosY` − top) / 600, column = (`PosX` − tab left) / 600.

- **All 156 talents mapped by name**, 0 unmapped, 0 by position. Every one sits in the same tier
  and column with the same max rank as the scraped tree.
- **One prerequisite difference:** the client makes Nature's Splendor (druid Balance) require
  Nature's Majesty (a `TraitEdge` of type 3, "required for availability"); the scraped tree has
  no arrow there. Type-2 edges are the ordinary arrows and type-0 edges are visual only.
- The client also ships an older druid tree (1083) on a different grid, with no tier conditions
  and a different Feral Charge spell. The mapper picks 1089, which matches every scraped name
  and cell.
- 112 of the 121 talents with curves show exactly those numbers in their Forever tooltips.
  The other nine have hidden effects the tooltip doesn't print (King of the Jungle's 5/10/15,
  Feral Instinct, Redoubt, Holy Power, Illumination, Last Stand, Eclipse) or convert ms to
  minutes (Improved Shield Wall, Guardian's Favor).

### `items.json`

```text
meta, counts
items.<id>        { id, item, itemSparse, effects[] }                 every item of items/pre-bis.json
consumables.<id>  { …same, doc { name, section, spellIds, enchantIds }, appliesEnchantIds, docMismatches }
item        { classId, subclassId, inventoryType, material, sheatheType, iconFileDataId }
itemSparse  { display, itemLevel, requiredLevel, overallQualityId, inventoryType, bonding,
              itemDelay (weapon speed, ms), damageType, dmgVariance, itemRange, sheatheType,
              material, itemSet, allowableClass, allowableRace[2], requiredSkill,
              requiredSkillRank, maxCount, statModifierBonusStat[10], statPercentEditor[10], flags[5] } | null
effects[]   { id, legacySlotIndex, triggerType (0 use, 1 equip, 2 chance on hit), spellId,
              charges, coolDownMSec, categoryCoolDownMSec, spellCategoryId,
              chrSpecializationId, playerConditionId }
```

- Counts: 1,644 items; all have an `Item` row; **884 have an `ItemSparse` row**, i.e. every
  item foreverchanges reads from the client except the 50 hotfix rows above; 236 have item
  effects. All 85 consumables have item effects.
- `statPercentEditor` holds stat **budget allocations**, not amounts (Lionheart Helm: Strength
  4000, crit rating 6222, hit rating 4444). The scraped tooltips carry the amounts, which the
  client derives from the item-level budget. Weapon min/max damage isn't stored per item in this
  layout either; `itemDelay` and `damageType` are the facts the tooltips don't give.
- Consumables list the shared cooldown category of every on-use item: elixirs and flasks 79
  (3 s), potions 4 (120 s), runes 1153 (120 s), explosives 24 (60 s, Sapper also 300 s own),
  Blasted Lands 103 (3,600 s), Juju and Firewater own 60 s.

### `enchants.json`

```text
meta, counts { docEnchants, inClient, notInClient }, notInClient[], docMismatches[]
enchants.<id> { id, name, duration (s), charges, effect[3], effectPointsMin[3], effectArg[3],
                effectScalingPoints[3], scalingClass, flags, requiredSkillId, requiredSkillRank,
                minLevel, maxLevel, itemLevel, itemLevelMin, itemLevelMax,
                spellIds[], appliedBySpellIds[], appliedByItemIds[], doc [{ name, section }] }
```

All 79 enchants the buffs doc names are in the client. Every doc spell → enchant, item →
enchant and enchant → proc mapping matches (`docMismatches` is empty). Enchant effect types:
1 combat spell (proc), 3 equip spell, 5 stat, 7 use spell.

### `gametables.json`

| Table | Level 60 |
| --- | --- |
| `gametables/combatratings.txt` (rating per 1%) | crit 14 (melee, ranged, spell), hit 10, dodge 12, parry 15, block 5, defense 1 per point, haste 10, expertise 10, armor penetration 10; **the same at all 123 levels** |
| `gametables/basemp.txt` | paladin 1,512, druid 1,244, warrior 0 |
| `gametables/hppersta.txt` | 10 HP per Stamina |
| `gametables/armormitigationbylvl.txt` | 1,059 (61: 1,079, 62: 1,099, 63: 1,120; 120: 7,765): the retail table the damage doc doesn't adopt |
| `PlayerExpectedStat` (DB2) | warrior / paladin / druid crit per Agility 0.0005 / 0.000506 / 0.0005; spell crit per Intellect 0.000167 (paladin, druid); base mana as basemp.txt; two unnamed columns 10 and 287 |

The client has no chance-to-crit, base-crit, base-HP or regen game tables, so there is no
separate crit or dodge table; `PlayerExpectedStat` is the per-level crit slope.

## Doc claims checked against the raw client

Every value the docs read from wago.tools pages and marked for a person to confirm in a browser
(the Route D table in [open-questions.md](../open-questions.md#route-d-wagotools-lookups-in-a-browser),
rows D1–D23, and the ‡ values in the buffs doc, which Route D consolidates), plus C27 and the
game-table values the docs knew only through wowsims' extraction. The report is regenerated by
`npm run scrape:client -- --claims` from [`lib/claims.mjs`](../../scripts/scrape/lib/claims.mjs),
which reads the Forever tables and, for the "(Classic …)" halves, the Classic Era build.
**Nothing in the docs was edited**; the lead updates them from this list.

<!-- claims:start -->
Checked against build `1.60.1.69913` (Forever) and `1.15.9.69722` (Classic Era) raw client files: 129 claims, 123 match, 6 partly, 0 differ.

| Row | Doc claim | Result | Raw client value |
| --- | --- | --- | --- |
| D1 | SpellProcsPerMinute 454–463 = 1–10 PPM in both builds; 479 = 2.3 in Forever only | matches | Forever 11 rows (479:2.3); Classic 10 rows; every row has Flags 1 |
| D1 | No SpellAuraOptions row references a PPM id (Forever) | matches | 0 Forever rows (0 in Classic Era); SpellProcsPerMinuteMod is empty in both |
| D2 | Bloodthirst 23894 = 0.35 × AP + 48 | matches | SCHOOL_DAMAGE 48, DUMMY 35 (% of AP); Classic 23894 SCHOOL_DAMAGE 45 |
| D2 | Flurry buff 12966: base 30, 15,000 ms; talent curve 5–25 | matches | buff aura 319 = 30, 15000 ms, 3 charges, proc mask 0x4; talent 12319 curve 5/10/15/20/25 |
| D2 | Dual Wield Specialization curves 5–25 / 20–100 / 2–10 and a hit aura (54) with no hand restriction | matches | curves 5/10/15/20/25 · 20/40/60/80/100 · 2/4/6/8/10; effect 2 is aura 54 with no per-effect restriction (the spell as a whole requires a one-handed weapon, SpellEquippedItems subclass mask 41105) |
| D2 | Unbridled Wrath curve 12–60; energize 12964 = 10 tenths; proc mask auto attack only | matches | curve 12/24/36/48/60; 12964 ENERGIZE 10 (power 1); proc mask 0x4 (melee auto attack) |
| D2 | Weaponmaster sword 12281 ProcCategoryRecovery 200 (both builds); axe 12700 aura 290 | matches | 12281 ICD 200 ms (Classic 200), proc chance 5, mask 0x14, triggers 1257049; 12700 aura 290 (Classic 52) |
| D3 | Bloodrage 2687 = 100, and 29131 = 10 per 1,000 ms for 10 s | matches | 2687 ENERGIZE 100; 29131 aura 24 10 every 1000 ms for 10000 ms |
| D3 | Charge 11578 = 150 | matches | ENERGIZE 150 |
| D3 | Mighty Rage Potion 17528 = 600, variance 0.5, 20 s | matches | ENERGIZE 600, variance 0.5, 20000 ms (+60 Str); Classic 450 min |
| D3 | Shield Specialization 1310318 = 50 (Classic 23602 = 10) | matches | Forever 50; Classic 23602 10 |
| D3 | Master of Defense → 23602 = 50 | matches | 23602 "Master of Defense" ENERGIZE 50 |
| D3 | Enrage 5229 = 100 + 20/s | matches | ENERGIZE 100; periodic 20 per 1000 ms |
| D3 | Furor 17057 = 100 | matches | ENERGIZE 100 |
| D3 | Primal Fury 16959 = 50 | matches | ENERGIZE 50 |
| D3 | Natural Reaction 417053 = 50 | matches | ENERGIZE 50 |
| D3 | Heroic Strike 25286 +157 | matches | WEAPON_DAMAGE_NOSCHOOL (17) 157 |
| D4 | Sunder Armor THREAT effect by rank: 1 / 405 / 608 / 810 / 1013 (11597); Classic has none | matches | 7386/7405/8380/11596/11597: 1/405/608/810/1013; armor -90/-180/-270/-360/-450; Classic THREAT effects: 0 |
| D5 | PlayerExpectedStat level 60 BaseMana 1512 (paladin), 1244 (druid) | matches | paladin 1512, druid 1244; basemp.txt 1512 / 1244 |
| D5 | CritPerAgility 0.0005 / 0.000506 / 0.0005 (warrior / paladin / druid); SpellCritPerIntellect 0.000167 | matches | 0.0005 / 0.000506 / 0.0005; spell crit per Int paladin 0.000167, druid 0.000167 |
| D5 | Two unnamed PlayerExpectedStat columns read 10 and 287 at level 60 | matches | warrior, paladin, druid: 10/287, 10/287, 10/287 (same for every class) |
| D5 | PlayerExpectedStat is absent from 1.15.9 | matches | not in the 1.15.9.69722 file list |
| D5 | ChrClasses AttackPowerPerStrength 2, AttackPowerPerAgility 0, ArmorTypeMask 127 / 2303 / 2343; all zero in 1.15.9 | matches | warrior, paladin, druid (AP/Str, AP/Agi, armor mask): 2/0/127, 2/0/2303, 2/0/2343; Classic 0/0/0, 0/0/0, 0/0/0 |
| D6 | Shred 9830 flat 80 / 155% | matches | WEAPON_DAMAGE 80, WEAPON_PERCENT_DAMAGE 155 (Classic 225%) |
| D6 | Claw 9850 115 / 110% | matches | 115 / 110% (Classic has no percent effect) |
| D6 | Rake 9904 61 / 34 per 3 s | matches | 61 + 34 every 3000 ms for 9000 ms |
| D6 | Rip 9896 15 + 25.5 per CP (Classic 16+1 / 28); 1.15.9 SpellDescriptionVariables 865 $ticks=6, $mult=1.0 | matches | Forever 15 + 25.5/CP every 2000 ms; Classic 16+1 / 28; SDV 865 "$ticks=$?s436895[${8}][${6}]; $mult=$?s436895[${1.5}][${1.0}]" (6 ticks and ×1.0 unless SoD rune 436895 is known) |
| D6 | Ferocious Bite 31018 base 82, variance 0.7317, 147 per CP, dummy 270 | matches | 82, variance 0.73170733, 147/CP, DUMMY 270 |
| D6 | Tiger's Fury 5217 15%, 30,000 ms, no GCD | matches | aura 4 = 15, recovery 30000 ms, GCD 0, lasts 6000 ms |
| D7 | SoC proc 20424 70% weapon, 0.29 | matches | WEAPON_PERCENT_DAMAGE 70, SP 0.29 |
| D7 | JoC 20966 0.429; JoR 20286 0.5; SoR proc 25713 0.1 | matches | SP coefficients 0.429/0.5/0.1 |
| D7 | Holy Strike 10333 effect 121 (+93) then 31 (40%), 0.429 | matches | e0 121 93 (variance 0.25, +3.2/level), e1 31 40%, SP 0.429 |
| D7 | Consecration 1280349 12 + 27 at 0.095 | matches | 12 + 27 (SP 0.095) |
| D7 | Vengeance 20050 5 stacks, 30 s | matches | 5 stacks, 30000 ms, +3% per stack (curve 1/2/3) |
| D7 | Two-Handed 20111 / One-Handed 20196 Weapon Specialization: Physical only | matches | aura 79 school mask 1/1 (1 = Physical) |
| D7 | Improved Seals 20224 spell masks | matches | aura 108 (3%, curve 5/10/15), mask 33555456,536873472,64,0 |
| D8 | Boundless Rage 1310236 aura 418 = 100/200/300 | matches | aura 418, curve 100/200/300 |
| D8 | Improved Bloodrage 25/50 | matches | 25/50 |
| D8 | Shield Specialization 20…100 | matches | block 1/2/3/4/5; rage chance 20/40/60/80/100 |
| D8 | Master of Defense 50/100 | matches | 50/100 |
| D8 | Improved Tactical Mastery 12295 = 3/6/9/12/15; Tactical Mastery 1310185 dummy 10 | matches | 3/6/9/12/15; 1310185 DUMMY aura 10 |
| D8 | Furor 20…100 | matches | 20/40/60/80/100 and 20/40/60/80/100 |
| D8 | Natural Reaction 417051 | matches | spell 417051, curves 1/2/3/4/5 · 20/40/60/80/100 |
| D9 | Slam 15 s cooldown on every rank | matches | 1240193/1464/8820/11604/11605: 15/15/15/15/15 s (category 2412), cast 1500 ms |
| D9 | Stance swap 1.0 s shared, off the GCD | matches | category:recovery:GCD 47:1000:0, 47:1000:0, 47:1000:0 |
| D9 | Racial StartRecoveryTime 0 | **partly** | Blood Fury 0, Berserking 0, Elune's Light 0, Eureka! 0, Stoneform 1500 (ms) |
| D9 | Thunder Clap defense type 1, usable in Defensive Stance | matches | defense type 1; stance mask 0x30000 (Battle + Defensive) |
| D9 | Overpower window 1282733 = 5,000 ms; second cost power type 4, stacking to 3 | matches | window 5000 ms, 3 stacks; Overpower 11585 costs type 1 50 + type 4 1 |
| D9 | Bloodthrill proc mask 4; Enrage proc mask 0x222A8 | matches | Bloodthrill 0x4; Enrage 0x222A8 (30%) |
| D9 | Berserker Stance aura 290 (Classic 52) plus an empty aura 166 | matches | Forever 7381 auras 290=3, 87=10, 10=-20, 166=0; Classic 52=3, 87=10, 10=-20 |
| D9 | Recklessness has its own recovery | matches | recovery 1800000 ms, category 0 |
| D9 | Improved Slam spells 1310196–1310200 | matches | 1310196 Slam Rank 1, 1310197 Slam Rank 2, 1310198 Slam Rank 3, 1310199 Slam Rank 4, 1310200 Slam Rank 5 |
| D9 | Battle Shout 25289 base 139 + 0.6/level | matches | aura 99 139 + 0.6/level (levels 60–61, so 139 at 60) |
| D9 | Weapon-damage effect types: 121 for Mortal Strike, Overpower, Whirlwind, Spearing Strike; 17 for Heroic Strike, Cleave, Slam | matches | normalized 121/121/121/121; non-normalized 17/17/17 |
| D9 | Focused Rage and Impale class masks | matches | Focused Rage aura 107 (cost -30) mask 1852722926,1057316,1,0; Impale aura 108 mask -295678738,33088,1,268436480 |
| D9 | Deep Wounds 12721 has no name | matches | no SpellName row, and no SpellEffect/SpellMisc rows either (not encrypted: the id is absent); the Forever bleed is 412609 |
| D9 | Victory Rush dummy 15 | matches | 402927 DUMMY 15 |
| D10 | Racial 20597 +2% crit, aura 290 | matches | "Sword Specialization": aura 290 2 |
| D10 | Racial 20598 exists | matches | "The Human Spirit": aura 137 5 |
| D10 | Racial 20572 +10% AP, RAP, SP; 15 s | matches | "Blood Fury": aura 166 10, aura 167 10, aura 317 10; 15000 ms; cooldown 120 s |
| D10 | Racial 20574 exists | matches | "Axe Specialization": aura 290 1 |
| D10 | Racial 1259719 exists | matches | "Mace Specialization": aura 290 1 |
| D10 | Racial 1259721 exists | matches | "Big Game Hunter": aura 168 5 |
| D10 | Racial 20594 exists | matches | "Stoneform": aura 87 -10, effect 38 99, effect 38 99, effect 108 99, aura 41 0, aura 41 0, aura 77 0; 8000 ms; cooldown 180 s |
| D10 | Racial 20582 exists | matches | "Quickness": aura 49 1, aura 31 2 |
| D10 | Racial 1259799 +10%, 15 s | matches | "Elune's Light": aura 290 10; 15000 ms; cooldown 180 s |
| D10 | Racial 1259802 exists | matches | "Expansive Mind": aura 178 5 |
| D10 | Racial 1259813 15 s | matches | "Eureka!": aura 108 -40, aura 108 10, aura 108 10, aura 4 1; 15000 ms; cooldown 120 s |
| D10 | Racial 1260189 exists | matches | "Touch of the Grave": aura 4 5 |
| D10 | Racial 20550 +5% HP; +1% hit via auras 54 and 55 | matches | "Endurance": aura 133 5, aura 54 1, aura 55 1 |
| D10 | Racial 20554 10 s, no cost | matches | "Berserking": aura 319 10, aura 140 10, aura 65 10; 10000 ms; cooldown 180 s |
| D10 | Racial 20557 exists | matches | "Beast Slaying": aura 168 5 |
| D11 | CharBaseInfo: 56 race/class pairs including Undead paladin; High Order Skyborne = race 95, Windshaper = 96 | matches | 56 pairs (Classic Era 40); Undead paladin present; 95 = High Order Skyborne, 96 = Windshaper Skyborne |
| D12 | Forever: 10612 is a party dummy aura, 20% proc into 10610 (+246 AP, 1 extra attack); 10611 absent | matches | 10612 AREA_AURA_PARTY aura 4, points 10610 (= the proc spell id), proc 20% on mask 0x14 with ProcCategoryRecovery 100 ms; 10610 +246 AP and EXTRA_ATTACKS 1, 2 charges, 1000 ms; 10611 absent |
| D12 | Classic: 10612 pulses 10611 every 5 s → enchant 564 (10 s) | **partly** | 10612 periodic trigger 10611 every 5000 ms; 10611 ENCHANT_HELD_ITEM 564; the Classic SpellItemEnchantment layout has no Duration column (Forever's row for 564 says 10 s) |
| D13 | Cooldown categories: elixirs 79, potions 4, runes 1153, explosives 24, Blasted Lands 103 (3,600 s) | matches | 8410: 103 (3600 s); 10646: 24 (60 s); 12662: 1153 (120 s); 13442: 4 (120 s); 13452: 79 (3 s) |
| D13 | Frenzy potions: aura 13 (school mask 1), no cooldown category | **partly** | aura 13 = 20/1, 28/1, 40/1 (points/school mask) matches. But while the item effects carry no category (0/0/0), the potion spells 1251937/1251938/1251940 are in SpellCategories category 4/120000, 4/120000, 4/120000 (category/recovery ms): the potion category with its 2-minute shared cooldown |
| D13 | All-crit aura (290) on Leader of the Pack 24932 and Mongoose 17538 | matches | 24932 aura 290 = 3; 17538 aura 290 = 2 |
| D13 | Hyjal flasks = dummy + zero-valued aura | matches | 1293741: dummy 4 + aura 290=0; 1293740: dummy 5 + aura 54=0, aura 55=0; 1293742: dummy 5 + aura 240=0; 1293743: dummy 5 + aura 342=0, aura 65=0 (1293743 is the Swiftness flask's spell but is named "Flask of Natural Accuracy") |
| D14 | PERIODIC_CAN_CRIT (Attributes[8] 0x200) set on Rend 11574, Rake 9904, Rip 9896, Pounce bleed 9826, Lacerate 1235827 | matches | 11574 0x1200, 9904 0x1200, 9896 0x1200, 9826 0x1200, 1235827 0x1200 |
| D14 | Not set on Deep Wounds and Consecration 20924 / 1280349 | matches | 412609 0x0, 20924 0x0, 1280349 0x1000 |
| D14 | Forever's Deep Wounds bleed is 412609 (4 ticks, 3 s) | matches | "Deep Wound" aura 226 every 3000 ms for 12000 ms = 4 ticks; talent 12834 triggers it server-side (no trigger in data) |
| D15 | Battle 21156 −20, Berserker 7381 −20, Defensive 7376 +30 | matches | -20 / -20 / 30 |
| D15 | Bear Passive2 21178 +30; Cat 3025 −29 | matches | 30 / -29 |
| D15 | Defiance 12792 curve 5/10/15 | matches | 5/10/15 |
| D15 | Righteous Fury 25780 = 90 (Classic 59+1), school mask 2 | matches | Forever 90 on school mask 2 (×1.9); Classic 59+1 |
| D15 | Improved Righteous Fury 20468 −2/−4/−6 (curve 82954) | matches | curve 82954: -2/-4/-6 |
| D15 | Instrument of Law 1311085 10/20 | matches | 10/20 (effect 1); effect 0 -500/-1000 |
| D15 | Iron Creed 1311034 aura 108, modifier 2, 5…25 | matches | aura 108, modifier 2, curve 5/10/15/20/25 |
| D15 | Salvation 1038 / 25895 −30 | matches | -30 / -30 |
| D15 | Feral Instinct 16947 (Classic: aura 107 on mask 0x2000000) | matches | Classic aura 107 mask 0x2000000; Forever 16947 is aura 107 (misc 3) on mask 0x4000 and aura 108 on 0,1048576,0,0 |
| D16 | Mangle 407995 / 1238069 / 1238070 / 1238073 = 26/38/59/77, 20 rage, 6 s, shapeshift mask 144 | matches | 26/38/59/77 + 100% weapon; 200 (tenths) rage; 6000 ms; mask 144 |
| D16 | Lacerate 1235827 15 per 3 s, 5 stacks | matches | 15 per 3000 ms, 5 stacks, 15000 ms |
| D16 | Cat 3025: AP 12 + 2/level from 6; Faerie Fire cost −100%, CD +6,000, GCD −500; aura 598 = 100 on Agility | matches | AP 12 + 2/level from 6; modifiers (aura/op=value) 108/14=-100, 107/11=6000, 107/21=-500; aura 598 = 100 on stat 1 |
| D16 | Forms 1/5/8 = 1,000/2,500/2,500 ms, variance 0.4; cat StartRecoveryTime 1,000 | matches | 1000/0.4, 2500/0.4, 2500/0.4 (swing ms/variance); Shred GCD 1000 ms |
| D16 | Berserk 417141 masks, 180,000 ms | matches | recovery 180000 ms, 15000 ms; aura 107/7=100, aura 108/11=-100, aura 107/17=3, aura 77/5=0 |
| D16 | Omen of Clarity 16864 ProcCategoryRecovery 10,000 | matches | 10000 ms |
| D16 | Cower 9892 −1200 − 1/level | matches | THREAT -1200 -1/level (levels 52–62) |
| D16 | SpellLevels 3025 base 6 (Classic 20), 1178 10–40, 9635 40–70 | matches | 3025 6 (Classic 20); 1178 10–40; 9635 40–70 |
| D17 | Genesis, Savage Fury, Predatory Instincts, Nature's Reach (auras 54/55), Nature's Majesty, Naturalist (aura 79): values and class masks | matches | Genesis 1/2/3/4/5 · 1/2/3/4/5; Savage Fury 5/10 · 5/10 (mask 38912); Predatory Instincts 10/20; Nature's Reach auras 54/55 2/4; Nature's Majesty aura 290 2/4; Naturalist aura 79 1/2/3/4/5 |
| D17 | King of the Jungle 20/40/60 plus a hidden 5/10/15 | matches | 20/40/60 and 5/10/15 (the tooltip shows only the first) |
| D18 | Judgements are melee class with No Active Defense; debuff judgements (JotC 20303) Always Hit and 40 s; JoC 20966/20968 | **partly** | 20966 def 2 NAD AH; 20286 def 2 NAD; 20414 def 2 NAD; 20968 def 2 NAD; 20303 def 2 NAD AH; 20355 def 2 NAD AH; 20346 def 2 NAD AH (def 2 = melee, NAD = Attr0 0x200000, AH = Attr3 0x40000); debuff judgements last 40000 ms. JoC's damage spell 20966 also carries Always Hit, so unlike JoR and JoF it can't miss |
| D18 | SoR and SoF proc attributes (25713, 20418) | matches | 25713 def 2 NAD AH; 20418 def 2 NAD AH |
| D18 | SoC 1 s ICD (20920); seal proc masks 0x4 (damage) vs 0x14 (utility) | matches | SoC ICD 1000 ms; SoC/SoR/SoF 0x4/0x4/0x4; SoW/SoL/SoJ 0x14/0x14/0x14 |
| D18 | Holy Strike and HotR category 2404 (12 s / 6 s); Holy Strike SpellMisc school 2 | matches | 10333 2404 12000 ms school 2; 407632 2404 6000 ms |
| D18 | Holy Shield 20928 4 charges, 0.08 | matches | 4 charges, block +20%, 221 damage at 0.08 |
| D18 | SoF 20418 35 at 0.1; JoF 20414 0.45 | matches | 20418 35 at 0.1; 20414 153 (variance 0.087591, +3.69/level) at 0.45 |
| D18 | SotC 20308 +2.4/level | matches | aura 99 306 + 2.4/level (levels 52–60) |
| D18 | JoF scripted value 1607 + 42.3/level, coefficient 0.18 | matches | 20414 effect 2 DUMMY 1607 + 42.3/level at 0.18 (the SoF aura 20423 carries 1607 + 42/level) |
| D19 | The item → buff spell ids in buffs §3 (and §4 item procs) | **partly** | 48 of 49 match. Blessed Sunfruit 13810: the item casts 18124, which triggers 18125 (the doc's buff id, reached through the trigger) |
| D19 | Distilled Firewater → 17038; Smoked Desert Dumplings → 1248401 (the Well Fed family) | matches | 246948 → 17038 ("Winterfall Firewater"); 20452 → 1248401 ("Nutritious Food", which grants Well Fed 1248422 after 10000 ms) |
| D20 | Enchant 2618 → spell 19989 (+9 Agi); enchant 925 → spell 13930 (+2 defense) | matches | 2618 "Agility +15" → 19989 (+9); 925 "Defense +5" → 13930 (+2 skill 95) |
| D20 | Rivenspike 17315 −100 per stack | matches | -100 × 3 stacks |
| D20 | Consecrated Sharpening Stone reads 99 (28893) | matches | 28893 "Undead Slayer 99" aura 102=99, aura 131=99 |
| D20 | Gift of Arthas 11374 +8 | matches | aura 14 +8 (school mask 1) |
| D20 | Blood Pact 11767 = 49 + 0.5/level | matches | 49 + 0.5/level (levels 50–60) |
| D20 | Trueshot Aura r5 = 50 | matches | 20906 aura 124 = 50 |
| D21 | 22888, 15366, 16609 are dummy auras in Forever | matches | 22888: 5 × aura 4; 15366: 2 × aura 4; 16609: 3 × aura 4 (Classic: real auras 552/99/52/124; 52/29/57; 34/138/85) |
| D22 | Gloves – Threat 2613 → 25063 (+2); Cloak – Subtlety 2621 → 25070 (−2) | matches | 2613 → 25063 (2); 2621 → 25070 (-2) |
| D22 | Fetish of the Sand Reaver 26400 −70, 20 s, CD 180 s; Eye of Diminution 28862 −35, 20 s, CD 120 s | matches | 26400 -70, 20000 ms, item 21647 CD 180000 ms; 28862 -35, 20000 ms, item 23001 CD 120000 ms |
| D22 | Increase/Decrease Threat All 01–04 linked to items 278540, 279493, 278929, 278299, 14576, 13959, 18308 | matches | 278540 → Increase Threat All 01; 279493 → Increase Threat All 02; 278929 → Decrease Threat All 02; 278299 → Decrease Threat All 04; 14576 → Decrease Threat All 01; 13959 → Decrease Threat All 01; 18308 → Decrease Threat All 04 (none of these items has an ItemSparse row in this build) |
| D22 | Enhanced Sunder Armor 23561 | matches | aura 108 +15% on mask 16384 (Sunder Armor's) |
| D23 | Taunt 355 and Growl 6795: effect 114 + aura 11, 3 s | matches | 355 114+11 3000 ms; 6795 114+11 3000 ms |
| D23 | Mocking Blow 20560 aura 11, 6 s; Challenging Shout 1161 and Roar 5209 6 s | matches | 20560 6000 ms; 1161 6000 ms; 5209 6000 ms |
| C27 | Demoralizing Shout 11556 / Roar 9898: −1.4 per level from 54 / 52 would give about −204.4 / −204.2 at 60 if MaxLevel doesn't cap it | matches | 11556 -196 -1.4/level, SpellLevels 54–64 → -204.4 at 60; 9898 -193 -1.4/level, 52–62 → -204.2 at 60. MaxLevel doesn't cap the term below 60; whether the server applies it is still a Route C question |
| GT | CombatRatings: 14 crit, 10 hit, 12 dodge, 15 parry, 5 block, defense 1:1, haste 10, expertise 10, armor penetration 10 per 1%, the same at every level (known only via wowsims) | matches | Crit - Melee 14, Hit - Melee 10, Dodge 12, Parry 15, Block 5, Defense Skill 1, Haste - Melee 10, Expertise 10, Armor Penetration 10; identical for levels 1–123 |
| GT | ArmorMitigationByLvl: 1,059 at level 60, 7,765 at 120, runs to 123 (a retail leftover) | matches | 60: 1059, 63: 1120, 120: 7765; 123 levels |
| GT | The beta ships CombatRatings and ArmorMitigationByLvl but no base-crit, base-HP or regen tables | **partly** | true for crit and regen (no chancetomeleecrit*, chancetospellcrit*, regen* or octbasehp* files in the build's file list); but it also ships basemp.txt (base mana, the same values as PlayerExpectedStat.BaseMana) and hppersta.txt (10 HP per Stamina at 60) |
| GT | RaceStat: one row per race, a single unnamed field, 0 everywhere | matches | 43 rows (ChrRacesID + Field_1_60_1_69876_002), all 0 |
<!-- claims:end -->

### Other findings for the docs

Things the raw files show that no doc claims yet:

1. **Windfury Totem has a 100 ms internal cooldown in Forever.** Windfury Totem Passive 10612
   has `ProcCategoryRecovery` 100. The damage doc models no ICD because its only source was
   SoD-era ([damage-and-timing §5.4](../mechanics/damage-and-timing.md)). 100 ms is far shorter
   than any swing timer; whether it matters depends on how the server chains extra attacks
   (a question for the guild's logs).
2. **Frenzy potions share the potion cooldown** (D13): their spells are in category 4 with a
   120 s category recovery, although the item effects carry no category.
3. **Judgement of Command can't miss** (D18): its damage spell 20966 carries Always Hit (Attr3
   0x40000). paladin.md's hit-table row says damage judgements roll melee miss; that holds for
   JoR 20286 and JoF 20414 only.
4. **Nature's Splendor requires Nature's Majesty** (TraitEdge type 3); the scraped tree shows
   no prerequisite.
5. **Deep Wounds 12721 is absent from the client**, not merely unnamed: the Forever bleed
   412609 (aura 226 every 3,000 ms for 12,000 ms) is what the talent uses.
6. The Flask of Natural Swiftness's spell 1293743 is named "Flask of Natural Accuracy" in
   `SpellName` (its auras are haste, 342 and 65).
7. The 50 hotfix-only items above.

## Re-running

```sh
npm run scrape:client                             # latest wow_classic_beta build, from the cache
npm run scrape:client -- --version=<build>        # a specific build (e.g. the next beta build)
npm run scrape:client -- --refresh                # re-ask for the latest build and re-download
npm run scrape:client -- --claims                 # also re-check the doc claims (Classic Era 1.15.9.69722)
npm run scrape:client -- --dbdefs=<sha>           # pin a WoWDBDefs commit
git diff --stat src/data/client
```

The scraper reads `src/data/{spells,talents,races,items}/*.json` and the buffs doc to build the
interest set, so run it after `npm run scrape`. For a new build: run it with `--version=` (or
`--refresh` to take the latest), and pin a fresh WoWDBDefs commit (delete
`.cache/client/github/wowdbdefs_head.json`, or pass `--dbdefs=`) if the new build's layouts
aren't in the cached definitions; the run fails loudly on an unknown layout. Then review the
diff, re-run `--claims`, and update any doc whose value moved. It exits non-zero if a table
fails to parse, a spellbook or talent spell is missing from the client, or level-60 crit
rating isn't 14.

## Phase 2 notes: what this client ships

For rebuilding `src/data/{spells,talents,races,items}` from client files (D17):

| Need | In 1.60.1.69913? |
| --- | --- |
| Encounter Journal (`JournalInstance`, `JournalEncounter`, `JournalEncounterItem`) | the files ship but are **empty (0 records)**: no drop sources from the client |
| Talent layout and prerequisites | yes: `TraitNode` (`PosX`/`PosY`), `TraitEdge` (types 2 and 3 gate), `TraitNodeGroup` + `TraitNodeGroupXTraitCond` + `TraitCond` (`SpentAmountRequired` per tier), `TraitCurrency` 3820 (51 points) |
| Race/class combinations | yes: `CharBaseInfo`, 56 pairs (Classic Era: 40) |
| Trainer vs talent vs automatic | `SkillLineAbility.AcquireMethod`: 0 trainer (6,958 rows), 2 learned automatically (420, e.g. Heroic Strike r1, Battle Stance), 3 granted by another spell (383, e.g. the Flurry buff, Last Stand's effect), 1 (63 rows, not examined). Talents themselves come from the Trait tables, not SkillLineAbility |
| Items | yes: `ItemSparse` 19,171 rows, `Item` 31,675, `ItemSet` 532 (+ `ItemSetSpell` 1,462), `ItemEffect` 12,571 + `ItemXItemEffect` 12,565 (Classic Era links through `ItemEffect.ParentItemID` instead), `ItemDisplayInfo` 42,047 |
| Item and spell icons | `Item.IconFileDataID` directly (also `ItemModifiedAppearance` → `ItemAppearance.DefaultIconFileDataID`), `SpellMisc.SpellIconFileDataID`. **Names:** the build's own file list (`/api/files`, already fetched) maps them, e.g. 132363 → `interface/icons/ability_warrior_sunder.blp`, so wow-listfile isn't needed |
| Spell text | `Spell.Description_lang` / `AuraDescription_lang` with `$s1`-style variables; `SpellDescriptionVariables` via `SpellXDescriptionVariables` |
| Classic Era baseline | `wow_classic_era` 1.15.9.69722 through the same endpoint; 30 of its tables are cached. `ItemXItemEffect` and `PlayerExpectedStat` don't exist there, and several layouts differ (`SpellEffect`, `SpellCategories`, `SpellItemEnchantment` has no `Duration`), which the reader and `createSpellIndex(…, { lenient: true })` handle |

## Attribution

- **[wago.tools](https://wago.tools)** serves the raw client files and build lists this dataset
  is read from. It is credited with its official logo, per its
  [branding guidelines](https://wago.tools/branding), in the app's footer, the About sheet and
  the README (decision D16).
- **[WoWDBDefs](https://github.com/wowdev/WoWDBDefs)** and its contributors provide the table
  definitions (commit `2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e`) and the manifest of DB2
  FileDataIDs.
- The DB2 format description is the community's [wowdev.wiki](https://wowdev.wiki/DB2).
