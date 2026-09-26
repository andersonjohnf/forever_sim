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
| Source | `https://wago.tools/api/casc/<fdid>?version=1.60.1.70009` (raw client files by FileDataID) |
| Product · build | `wow_classic_beta` · `1.60.1.70009` (wago.tools lists it as created 2026-09-24 22:02:03); until 2026-09-24, `1.60.1.69913` (created 2026-09-18), which the docs' `[client]` citations name ([Re-running](#re-running)) |
| Classic Era baseline | `wow_classic_era` · `1.15.9.69722` (read only for the doc-claim comparisons below) |
| Definitions | WoWDBDefs commit [`2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e`](https://github.com/wowdev/WoWDBDefs/tree/2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e) (2026-09-22) |
| Scraped | 2026-09-22 (`meta.scrapedAt`, the latest download time of the files a dataset reads) |

| File | Size | What |
| --- | --: | --- |
| `spells.json` | 1.5 MB | 1,475 merged spell records (the interest set below), plus racials, radii and spell categories |
| `talents.json` | 145 KB | every Forever talent of the classes in scope, mapped to its Trait node, spell and per-rank values |
| `items.json` | 1.2 MB | ItemEffect rows and ItemSparse/Item fields for the 1,629 pre-raid items, plus 85 consumables |
| `enchants.json` | 56 KB | the 79 SpellItemEnchantment rows the buffs doc names, with the spells and items that apply them |
| `gametables.json` | 4 KB | level-60 rows of combat ratings, base mana, HP per Stamina, armor mitigation, PlayerExpectedStat |

Every file starts with the usual `meta` envelope: `source`, `product`, `build`,
`buildCreatedAt`, `tables` (table or game-table file → FileDataID), `wowDbDefs` (repository and
commit), `scrapedAt` and `scraper`. `buildCreatedAt`, like the other datasets'
`foreverBuildDate`, comes from wago.tools' build list (`/api/builds`, cached per build), so it
is the same whichever build a machine has cached as "latest" (review finding L35).

## How the data was obtained

### Requests

Only the documented API endpoints are called, and the fetch layer
([`lib/http.mjs`](../../scripts/scrape/lib/http.mjs)) refuses every other wago.tools path
(its pages, `/db2/…` and the CSV export stay off-limits under its `robots.txt`):

| Endpoint | Used for |
| --- | --- |
| `GET https://wago.tools/api/builds/wow_classic_beta/latest` | confirm the build (`1.60.1.70009`) |
| `GET https://wago.tools/api/builds` | the build list (every product), for the requested build's creation date; cached per build |
| `GET https://wago.tools/api/files?version=<build>&format=json` | the build's file list: FileDataIDs of the game tables, whether a DB2 ships in the build, icon file names |
| `GET https://wago.tools/api/casc/<fdid>?version=<build>` | each raw DB2 and game-table file, once |
| `GET https://api.github.com/repos/wowdev/WoWDBDefs/commits/master` | the WoWDBDefs commit to pin (cached, so later runs reuse it) |
| `GET https://raw.githubusercontent.com/wowdev/WoWDBDefs/<sha>/manifest.json` | table name → DB2 FileDataID |
| `GET https://raw.githubusercontent.com/wowdev/WoWDBDefs/<sha>/definitions/<Table>.dbd` | column names and types |

Requests go one at a time, at least 1.1 s apart, with the User-Agent
`forever_sim-client-data/0.1 (+https://github.com/andersonjohnf/forever_sim)`. Every response
is cached under `.cache/client/` (git-ignored) and is never downloaded again unless
`--refresh` is passed. `.cache/client/requests.jsonl` logs every network request.

The fetch layer also follows redirects itself, at most five, and checks every hop against the
same rules (https, the allowed hosts and wago.tools paths), so a redirect can't carry a request
anywhere else; each hop is a request like any other, spaced 1.1 s from the last and logged. A
build version names cache directories and goes into request URLs, so the
scrapers refuse one that isn't four dot-separated numbers (`1.60.1.69913`), whether it came
from `--version` or from wago.tools' answer; a WoWDBDefs commit must be a full 40-digit SHA;
and no cache key may leave `.cache/client/`.

**Request count for this snapshot: 175, all HTTP 200.**

| Host | Requests |
| --- | --: |
| wago.tools: builds (1 repeated after a cache-key change), file lists for both builds | 2 + 2 |
| wago.tools: `/api/casc`, Forever build (67 DB2 files, 7 game tables) | 74 |
| wago.tools: `/api/casc`, Classic Era build (28 DB2 files, for the claim checks and phase 2) | 28 |
| GitHub: commit lookup, manifest, 67 `.dbd` files | 69 |

[Items from the client](#items-from-the-client) (M1.5c-1) added **42 more requests**, all HTTP
200: 30 to wago.tools (12 DB2 files for Forever, 17 DB2 files and one game table for Classic
Era) and 12 `.dbd` files from GitHub. They are listed in [Tables used](#tables-used).
Writing `pre-bis.json` (M1.5c-2) added **6 more**, all HTTP 200: `ItemSubClass`, `Faction` and
`ItemLimitCategory` from the Forever build and their three `.dbd` files
([items.md](items.md#how-the-data-was-obtained)). Rebuilding the talent trees (M1.5d) added
**2 more**, both HTTP 200: the Classic Era `Talent` and `TalentTab` tables (their `.dbd` files
were cached; [talents.md](talents.md#requests)). Rebuilding the spellbooks and races (M1.5e)
added **4 more**, all HTTP 200: the Classic Era `SkillLineAbility`, `SkillLine`, `ChrRaces` and
`ItemSubClass` tables (their `.dbd` files were cached; [spells.md](spells.md#requests)). The
first-release fixes (F2) added **1 more**, HTTP 200: wago.tools' build list, `/api/builds`
(541 KB), for build dates that don't depend on the cached "latest" build. Every table they read
(`SpellLevels`, `SpellEquippedItems` in both builds) was cached. The ranged and pet core (H1) added
**6 more**, all HTTP 200: `ItemDamageAmmo` and `CreatureFamily` from Forever 1.60.1.69977 and Classic
Era 1.15.9.69722, and their two `.dbd` files; its review added **1 more**, `ItemDamageAmmo` from
1.60.1.69913 ([Tables the docs cite](#tables-the-docs-cite)). The 1.60.1.70009 regeneration
(2026-09-24) added **79 more**, all HTTP 200 and all to wago.tools: the latest-build lookup, the
build list, the build's file list and 76 raw files from `/api/casc` for 1.60.1.70009 (one of them
for `--claims`); WoWDBDefs was not re-pinned, so none went to GitHub ([Re-running](#re-running)).

A later run from the cache makes no requests. A fresh build costs 44 wago.tools requests for
the datasets (38 DB2 files, 4 game tables, the build lookup and the file list), about 30 more
with `--claims` if the Classic Era baseline isn't cached yet, and about 40 GitHub requests only
when WoWDBDefs is re-pinned.

### Cache layout

```text
.cache/client/
  builds/<product>_latest.json         /api/builds/<product>/latest
  <build>/api/builds.json              /api/builds (the build list, for the build's date; once per build)
  <build>/api/files.json               the build's file list (108 MB for 1.60.1.69913)
  <build>/casc/<fdid>.bin (+ .meta.json)  raw files as served
  <build>/tables/<Table>.ndjson        every parsed table in full: line 1 = parse metadata
                                       (layout hash, sections, storage, warnings), then one row per line
  <build>/gametables/<name>.json       parsed game tables
  <build>/claims.md                    the doc-claim report (--claims)
  <build>/<dataset>-diff.md (+ .json)  committed vs fresh dataset, for items, talents, spells and
                                       races (npm run diff:<dataset>, or npm run scrape -- --diff)
  <build>/talents-changes.md           the talent dataset's Forever-vs-Classic tables, for talents.md
  <build>/spells-left-out.json         every SkillLineAbility row the spellbooks leave out, with the rule
  github/wowdbdefs/<sha>/…             manifest.json and definitions/*.dbd
  requests.jsonl
```

Caches from before M1.5f may also hold `<build>/items-compare.md` and the
`*-foreverchanges-snapshot*` copies of the retired datasets; nothing reads them any more
(the datasets themselves stay in git history: items `b94a076`, talents `403142e`, spells and
races `ad46f63`).

The download layer ([`lib/wago.mjs`](../../scripts/scrape/lib/wago.mjs)) is generic over product
and build, and every table it touches is kept whole in `tables/`, not just the extracted subset.
Both builds' tables are already cached: 82 DB2 files for 1.60.1.69913 and 51 for 1.15.9.69722
(plus its `shieldblockregular.txt` game table).

### Tables the docs cite

A mechanics doc can cite a client table that no dataset writes yet. The scraper reads each one at the
builds the doc cites it from (`DOC_TABLES` in [`client.mjs`](../../scripts/scrape/client.mjs)),
whatever `--version` says, so a run keeps the doc's sources in the cache and fails if one stops
parsing. From a warm cache that costs no requests.

| Table | Builds | Cited by |
| --- | --- | --- |
| `ItemDamageAmmo` | 1.60.1.69977, 1.15.9.69722 | [ranged-and-pets.md §1](../mechanics/ranged-and-pets.md#1-ranged-weapons-ammo-and-quivers): ammo damage per second by item level and quality |
| `CreatureFamily` | 1.60.1.69977, 1.15.9.69722 | [ranged-and-pets.md §6](../mechanics/ranged-and-pets.md#6-pets-stats-and-white-swings), [WoW Forever deviations](../mechanics/ranged-and-pets.md#wow-forever-deviations): the pet families (Forever's new Fox) |

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
pages, which is presumably how foreverchanges.pro (our source until D17) showed rows the raw
file lacks. Anything a hotfix changed or added is missing or stale here, and the documented
API has no hotfix endpoint. Evidence in this build:

- **50 items that foreverchanges showed as Forever client data have no `ItemSparse` row** in the
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
  Long Bow, 13146 Shell Launcher Shotgun. Since M1.5c-2, the 34 of them with a Classic Era
  row use it in `src/data/items/pre-bis.json` (flagged `foreverData: false`), and the 16 new
  items with no row in either client are left out of the pool until a build ships them
  ([items.md](items.md#items-no-client-carries-yet)). The 60 "seen in game" items and the 650
  "missing" ones have no Forever row either and use Classic Era rows too.
- **No sign of spell hotfixes in the compared fields:** every cooldown (170), cost (435), cast
  time (487) and range (343) of every Forever spellbook rank matched the foreverchanges dataset,
  and all 156 talents sit in the same cell with the same max rank. The spellbooks rebuilt from
  the client in M1.5e confirm it ([spells.md](spells.md#from-foreverchanges-to-the-client)).
- **One racial:** foreverchanges showed the Tauren's Cultivation (20552) with a 1 hr cooldown;
  the raw client has none (`SpellCooldowns` 0, its category 2578 has no recovery), so a hotfix
  likely sets it ([races.md](races.md#from-foreverchanges-to-the-client)).

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
| Demoralizing Shout 11556 / Roar 9898 | −196 / −193 with −1.4 per level up to level 64 / 62 | the level-60 tooltip shows the scaled −204 / −204 (−204.4 / −204.2); whether the server applies the per-level term in combat is open ([buffs OQ 19](../mechanics/buffs-debuffs-consumables.md#open-questions)) |
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
               duration     { duration, maxDuration, durationPerResource } (SpellDuration, ms; the last per combo point: the rogue's finishers)
               range        { rangeMin[2], rangeMax[2], flags } (SpellRange, yards)
               effects[]    { effectIndex, effect, effectAura, effectBasePointsF, variance,
                              effectRealPointsPerLevel, effectPointsPerResource,
                              effectBonusCoefficient (SP), bonusCoefficientFromAp (AP),
                              effectTriggerSpell, effectMiscValue[2], effectRadiusIndex[2],
                              effectAmplitude, effectAuraPeriod, effectChainTargets,
                              effectChainAmplitude (only when not 1), effectMechanic,
                              effectSpellClassMask[4], implicitTarget[2] }
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
  are always present. Only `DifficultyID` 0 rows are used. The one exception is
  `effectChainAmplitude`, whose client default is 1: it's written only when it isn't 1, so an
  absent one is 1 and a 0 is written (Ferocious Bite's).
- **Execute's rage factor is client data.** `EffectChainAmplitude` of Execute's damage effect is
  0.3, 0.6, 0.9, 1.2 and 1.5 at ranks 1–5 (5308, 20658, 20660, 20661, 20662), and its tooltip's
  `$*10;F1` makes that 3 … 15 damage per extra point of rage `[F]` (review finding L33;
  [warrior.md §3.1](../classes/warrior.md#31-damage-abilities)). Until F2 the column was
  dropped as "chain spells only".
- **Trimmed columns.** Left out because they were zero for every extracted spell (the scraper
  warns if one of them gains a value): `SpellEffect` `Coefficient`, `ResourceCoefficient`,
  `EffectAttributes`; `SpellMisc` `LaunchDelay`; `SpellPower` `ManaCostPerLevel`,
  `ManaPerSecond`, `PowerCostMaxPct`, `PowerPctPerSecond`, `OptionalCostPct`,
  `RequiredAuraSpellID`; `SpellLevels` `MaxPassiveAuraLevel`; `SpellCooldowns` `AuraSpellID`;
  `SpellCategories` `ChargeCategory`; `SpellClassOptions` `ModalNextSpell`;
  `SpellTargetRestrictions` `Width`; the four `…AuraType` columns of `SpellAuraRestrictions`. (`SpellDuration`
  `DurationPerResource` is written since the rogue: Slice and Dice's and Rupture's time per combo
  point.) Left out as irrelevant to the engine: visual scripts,
  content tuning, `PvpMultiplier`, `GroupSizeBasePointsCoefficient`, `EffectPos_facing`,
  `EffectItemType` and `StanceBarOrder`. Lookup indexes (`castingTimeIndex`, `durationIndex`, `rangeIndex`) are
  replaced by the rows they point at; radius and category rows are the top-level maps.
- **AP coefficients:** `bonusCoefficientFromAp` is 0 for every extracted spell. Forever puts
  attack-power scaling in dummy effects (Bloodthirst: `SCHOOL_DAMAGE` 48 plus `DUMMY` 35 = 35%
  of AP) or leaves it to the server. `effectBonusCoefficient` (spell power) is 1 on most
  physical effects, which appears to be a client default rather than a rule.
- **PPM:** `SpellProcsPerMinute` has rows 454–463 (1–10 PPM) and 479 (2.3), all with Flags 1
  (meaning unverified), and `SpellProcsPerMinuteMod` is empty. No `SpellAuraOptions` row
  references a PPM id, so every `ppm` in the file is absent: proc rates are server-side.

**Interest set: 1,475 spells** (1,362 before the trigger closure), every one in the client:

| Source | Spells | What |
| --- | --: | --- |
| `spellbook` | 493 | every Forever rank in `src/data/spells/{warrior,druid,paladin}.json` |
| `talent` | 156 | each talent's TraitDefinition spell |
| `racial` | 44 | the racials of `src/data/races/races.json`, resolved through `SkillLineAbility` race masks and names, per-class variants included (e.g. Eureka!: 1259813 for warriors) |
| `item` | 407 | ItemEffect spells the Forever client links to the pre-raid items, and every spell the pool names: its effect lines' and set bonuses' `spellId` and its `statSpellIds` (fallback items' Classic Era effects read Forever spells that Forever doesn't link to them) |
| `consumable` | 78 | ItemEffect spells of the consumables in the buffs doc, and the doc's own `→` spell ids |
| `enchant` | 125 | enchanting spells, the spells each enchant casts (combat, equip, use), doc proc spells |
| `buffsDoc` | 47 | buff and debuff spell ids in the buffs doc's §1 and §4 tables |
| `docs` | 285 | spell ids cited in `docs/classes`, `docs/mechanics` and `docs/open-questions.md`, either with a marker ("spell 12966", "[F 20128]", "proc 25713", "DB2 21184", "(3025, 1178, 9635)", backticks) or with the client's name earlier on the same line; Classic "(C: …)" ids are skipped |
| `trigger` | 130 | reached through another extracted spell's `effectTriggerSpell`, transitively |

A spell can have several sources, so the column sums to more than 1,475. The docs source was
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

- **All 156 talents mapped by name**, 0 unmapped, 0 by position, 0 mismatches. Since M1.5d the
  talent trees in `src/data/talents` are themselves built from these tables
  ([talents.md](talents.md)), so this mapping now checks the two readers against each other:
  same cells, max ranks and arrows. The mapper still reads the talent ids from
  `src/data/talents/<class>.json`, so re-run `npm run scrape:client` after `npm run
  scrape:talents` changes them.
- **Nature's Splendor needs Nature's Majesty** (druid Balance): a `TraitEdge` of type 3,
  "required for availability". The foreverchanges tree had no arrow there; the client talent
  trees have it ([talents.md](talents.md#prerequisite-arrows)). Type-2 edges are the ordinary
  arrows and type-0 edges are visual only.
- The client also ships an older druid tree (1083) on a different grid, with no tier conditions
  and a different Feral Charge spell. The mapper picks 1089, which matches every name and cell,
  and so does the talent generator (by spell family, currency and tier conditions).
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

- Counts: 1,629 items; all have an `Item` row; **884 have an `ItemSparse` row**, exactly the
  pool items with `foreverData: true` (the others use their Classic Era row, see
  [items.md](items.md#items-with-no-forever-data-d6)); 236 have item effects. All 85
  consumables have item effects.
- `statPercentEditor` holds stat **budget allocations**, not amounts (Lionheart Helm: Strength
  4000, crit rating 6222, hit rating 4444). The game derives the amounts from the item-level
  budget, and so does `pre-bis.json` since M1.5c-2. Weapon min/max damage isn't stored per item in this
  layout either; `itemDelay` and `damageType` are the facts the tooltips don't give.
  [Items from the client](#items-from-the-client) has the formulas that turn both into amounts.
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
Checked against build `1.60.1.70009` (Forever) and `1.15.9.69722` (Classic Era) raw client files: 129 claims, 124 match, 5 partly, 0 differ.

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
| D3 | Blood Frenzy (Primal Fury until 1.60.1.70009) 16959 = 50 | matches | ENERGIZE 50 |
| D3 | Natural Reaction 417053 = 50 | matches | ENERGIZE 50 |
| D3 | Heroic Strike 25286 +157 | matches | WEAPON_DAMAGE_NOSCHOOL (17) 157 |
| D4 | Sunder Armor THREAT effect by rank: 34 / 75 / 117 / 158 / 206 (11597), with no attack power coefficient; Classic has none | matches | 7386/7405/8380/11596/11597: 34/75/117/158/206, bonus coefficient 0/0/0/0/0, from AP 0/0/0/0/0; armor -90/-180/-270/-360/-450; Classic THREAT effects: 0 |
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
| D7 | Holy Strike 10333 effect 121 (+93) then 31 (50% since 1.60.1.70009), 0.429 | matches | e0 121 93 (variance 0.25, +3.2/level), e1 31 50%, SP 0.429 |
| D7 | Consecration 1280349 12 + 27 at 0.095 | matches | 12 + 27 (SP 0.095) |
| D7 | Vengeance 20050 3 stacks (5 until 1.60.1.70009), 30 s | matches | 3 stacks, 30000 ms, +3% per stack (curve 1/2/3) |
| D7 | Two-Handed 20111 / One-Handed 20196 Weapon Specialization: Physical only | matches | aura 79 school mask 1/1 (1 = Physical) |
| D7 | Improved Seals 20224 spell masks | matches | aura 108 (3%, curve 5/10/15), mask 33555456,536873472,64,0 |
| D8 | Boundless Rage 1310236 aura 418 = 100/200/300 | matches | aura 418, curve 100/200/300 |
| D8 | Improved Bloodrage 25/50 | matches | 25/50 |
| D8 | Shield Specialization 20…100 | matches | block 1/2/3/4/5; rage chance 20/40/60/80/100 |
| D8 | Master of Defense 50/100 | matches | 50/100 |
| D8 | Improved Tactical Mastery 12295 = 3/6/9/12/15; Tactical Mastery 1310185 dummy 10 | matches | 3/6/9/12/15; 1310185 DUMMY aura 10 |
| D8 | Furor 20…100 | matches | 20/40/60/80/100 and 20/40/60/80/100 |
| D8 | Natural Reaction 417051 | matches | spell 417051, curves 1/2/3/4/5 · 20/40/60/80/100 |
| D9 | Slam 18 s cooldown on every rank; Improved Slam's effect 2 cuts it by 1500 / 3000 ms | matches | 1240193/1464/8820/11604/11605: 18/18/18/18/18 s (category 2412), cast 1500 ms; Improved Slam effect 2 aura 107 misc 11, curve -1500/-3000 |
| D9 | Stance swap 1.0 s shared, off the GCD | matches | category:recovery:GCD 47:1000:0, 47:1000:0, 47:1000:0 |
| D9 | Racial StartRecoveryTime 0 | **partly** | Blood Fury 0, Berserking 0, Elune's Light 0, Eureka! 0, Stoneform 1500 (ms) |
| D9 | Thunder Clap defense type 1, usable in Defensive Stance | matches | defense type 1; stance mask 0x30000 (Battle + Defensive) |
| D9 | Overpower window 1282733 = 5,000 ms, not stacking; second cost power type 4 | matches | window 5000 ms, no stacks; Overpower 11585 costs type 1 50 + type 4 1 |
| D9 | Bloodthrill proc mask 0x14, main hand only (Attributes[3] 0x400), aura 42 into 1282733; Enrage proc mask 0x222A8 | matches | Bloodthrill 0x14, Attributes[3] 0x400, aura 42 → 1282733; Enrage 0x222A8 (30%) |
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
| D10 | Racial 1259813 15 s | matches | "Eureka!": aura 108 -10, aura 108 10, aura 108 10, aura 4 1; 15000 ms; cooldown 120 s |
| D10 | Racial 1260189 exists | matches | "Touch of the Grave": aura 4 5 |
| D10 | Racial 20550 +5% HP; +1% hit via auras 54 and 55 | matches | "Endurance": aura 133 5, aura 54 1, aura 55 1 |
| D10 | Racial 20554 10 s, no cost | matches | "Berserking": aura 319 10, aura 140 10, aura 65 10; 10000 ms; cooldown 180 s |
| D10 | Racial 20557 exists | matches | "Beast Slaying": aura 168 5 |
| D11 | CharBaseInfo: 56 race/class pairs including Undead paladin; High Order Skyborne = race 95, Windshaper = 96 | matches | 56 pairs (Classic Era 40); Undead paladin present; 95 = High Order Skyborne, 96 = Windshaper Skyborne |
| D12 | Forever: 10612 is a party proc-trigger aura (42; a dummy, 4, until 1.60.1.70009), 20% proc into 10610 (+246 AP, 1 extra attack); 10611 absent | matches | 10612 AREA_AURA_PARTY aura 42, points 10610 (= the proc spell id), proc 20% on mask 0x14 with ProcCategoryRecovery 100 ms; 10610 +246 AP and EXTRA_ATTACKS 1, 2 charges, 1000 ms; 10611 absent |
| D12 | Classic: 10612 pulses 10611 every 5 s → enchant 564 (10 s) | **partly** | 10612 periodic trigger 10611 every 5000 ms; 10611 ENCHANT_HELD_ITEM 564; the Classic SpellItemEnchantment layout has no Duration column (Forever's row for 564 says 10 s) |
| D13 | Cooldown categories: elixirs 79, potions 4, runes 1153, explosives 24, Blasted Lands 103 (3,600 s) | matches | 8410: 103 (3600 s); 10646: 24 (60 s); 12662: 1153 (120 s); 13442: 4 (120 s); 13452: 79 (3 s) |
| D13 | Frenzy potions: attack power and ranged attack power (auras 99 and 124) of 40 / 56 / 80 (1.60.1.70009; aura 13 before), no category on the items | **partly** | aura 99/124 = 40/40, 56/56, 80/80 matches. But while the item effects carry no category (0/0/0), the potion spells 1251937/1251938/1251940 are in SpellCategories category 4/120000, 4/120000, 4/120000 (category/recovery ms): the potion category with its 2-minute shared cooldown |
| D13 | All-crit aura (290) on Leader of the Pack 24932 and Mongoose 17538 | matches | 24932 aura 290 = 3; 17538 aura 290 = 2 |
| D13 | Hyjal flasks = dummy + zero-valued aura | matches | 1293741: dummy 4 + aura 290=0; 1293740: dummy 5 + aura 54=0, aura 55=0; 1293742: dummy 5 + aura 240=0; 1293743: dummy 5 + aura 342=0, aura 65=0 (1293743 is the Swiftness flask's spell but is named "Flask of Natural Accuracy") |
| D14 | PERIODIC_CAN_CRIT (Attributes[8] 0x200) set on Rend 11574, Rake 9904, Rip 9896, Pounce bleed 9826, Lacerate 1235827 | matches | 11574 0x1200, 9904 0x1200, 9896 0x1200, 9826 0x1200, 1235827 0x1200 |
| D14 | Not set on Deep Wounds and Consecration 20924 / 1280349 | matches | 412609 0x0, 20924 0x0, 1280349 0x1000 |
| D14 | Forever's Deep Wounds bleed is 412609 (4 ticks, 3 s) | matches | "Deep Wound" aura 226 every 3000 ms for 12000 ms = 4 ticks; talent 12834 triggers it server-side (no trigger in data) |
| D15 | Battle 21156 −20, Berserker 7381 −20, Defensive 7376 +30 | matches | -20 / -20 / 30 |
| D15 | Bear Passive2 21178 +30; Cat 3025 −29 | matches | 30 / -29 |
| D15 | Defiance 12792 curve 5/10/15 | matches | 5/10/15 |
| D15 | Righteous Fury 25780 = 60 (90 until 1.60.1.70009; Classic 59+1), school mask 2 | matches | Forever 60 on school mask 2 (×1.6); Classic 59+1 |
| D15 | Improved Righteous Fury 20468 −2/−4/−6 (curve 82954) | matches | curve 82954: -2/-4/-6 |
| D15 | Instrument of Law 1311085 10/20 | matches | 10/20 (effect 1); effect 0 -500/-1000 |
| D15 | Iron Creed 1311034 aura 108, modifier 2, 5…25 | matches | aura 108, modifier 2, curve 5/10/15/20/25 |
| D15 | Salvation 1038 / 25895 −30 | matches | -30 / -30 |
| D15 | Feral Instinct 16947 (Classic: aura 107 on mask 0x2000000) | matches | Classic aura 107 mask 0x2000000; Forever 16947 is aura 107 (misc 3) on mask 0x4000 and aura 108 on 0,1048576,0,0 |
| D16 | Primal Bite (Mangle until 1.60.1.70009) 407995 / 1238069 / 1238070 / 1238073 = 26/38/59/77, 20 rage, 6 s, shapeshift mask 144 | matches | 26/38/59/77 + 100% weapon; 200 (tenths) rage; 6000 ms; mask 144 |
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
| D18 | Holy Strike and HotR category 2404 (10 s since 1.60.1.70009 / 6 s); Holy Strike SpellMisc school 2 | matches | 10333 2404 10000 ms school 2; 407632 2404 6000 ms |
| D18 | Holy Shield 20928 4 charges, 0.08 | matches | 4 charges, block +20%, 221 damage at 0.08 |
| D18 | SoF 20418 35 at 0.1; JoF 20414 0.45 | matches | 20418 35 at 0.1; 20414 153 (variance 0.087591, +3.69/level) at 0.45 |
| D18 | SotC 20308 +2.4/level | matches | aura 99 306 + 2.4/level (levels 52–60) |
| D18 | JoF scripted value 1607 + 42.3/level, coefficient 0.18 | matches | 20414 effect 2 DUMMY 1607 + 42.3/level at 0.18 (the SoF aura 20423 carries 1607 + 42/level) |
| D19 | The item → buff spell ids in buffs §3 (and §4 item procs) | matches | 60 of 60 match.  |
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
   (a question for Forever's combat logs).
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

`npm run scrape` regenerates every dataset in order, this one last
([README § Refreshing](README.md#refreshing)). This scraper on its own:

```sh
npm run scrape:client                             # latest wow_classic_beta build, from the cache
npm run scrape:client -- --version=<build>        # a specific build (e.g. the next beta build)
npm run scrape:client -- --refresh                # re-ask for the latest build and re-download
npm run scrape:client -- --claims                 # also re-check the doc claims (Classic Era 1.15.9.69722)
npm run scrape:client -- --dbdefs=<sha>           # pin a WoWDBDefs commit (its full SHA)
npm run scrape:client -- --check                  # compare with src/data/client, from the cache, writing nothing (README § Checking)
git diff --stat src/data/client
```

The scraper reads `src/data/{spells,talents,races,items}/*.json`, the buffs doc and the class,
mechanics and open-questions docs to build the interest set, so it runs after the four dataset
scrapers, and again after any edit to a doc it reads ([What the docs decide](#what-the-docs-decide)).
For a new build: pass `--version=` (or
run `npm run scrape -- --version=<build>`), and pin a fresh WoWDBDefs commit (delete
`.cache/client/github/wowdbdefs_head.json`, or pass `--dbdefs=`) if the new build's layouts
aren't in the cached definitions; the run fails loudly on an unknown layout. Then review the
diff, re-run `--claims`, and update any doc whose value moved. It exits non-zero if a table
fails to parse, a spellbook or talent spell is missing from the client, or level-60 crit
rating isn't 14.

The M1.5f run (2026-09-22, same build, 0 requests) changed only `spells.json`, catching up
with M1.5e and the docs: Frenzied Regeneration's heal 22845 left the interest set (M1.5e's
spellbooks no longer count it as a rank, and nothing else cites it), each race's `racials`
took the client's `SkillLineAbility` order, and the Diamond Flask ids warrior.md Q30 now cites
joined as `docs` sources (24427 and 363880 added; 363881 and 1318073 gained the source).

The 2026-09-24 run (same build, 0 requests) caught up with the tank fixes' doc edits, which
hadn't regenerated the data. Before it, a regeneration from the cache would have **dropped**
Wizard Oil's and Brilliant Wizard Oil's enchants (2627, 2628; `enchants.json` 79 → 77) and their
equip spells 25111 and 25113: T2 rewrote their ID cells as full chains ("20750 → 25121 → enchant
2627 → 25111"), and the parser read only the first two steps. It now reads the whole chain
([What the docs decide](#what-the-docs-decide)), so `enchants.json` is unchanged. The run gave
`items.json`'s Nightfin Soup and the two oils their doc spells (1249513, 25121, 25122), and added
the citations committed since the last run as `docs` sources: 18194 and 25742 new to
`spells.json`; 15438, 25121, 25122, 1249513 and 1249520 gained the source. The engine doesn't
read `src/data/client` (its numbers are written out in `src/sim` and checked against it by tests),
and no test reads these records from it, so no test or golden moved.

The 1.60.1.70009 run (2026-09-24, the build wago.tools listed as created 22:02:03 that day; 79
requests, [Requests](#requests)) took the new beta build with `npm run scrape --
--version=1.60.1.70009 --diff`, then the races, items and client scrapers on their own. **The
talent trees stay at 1.60.1.69913:** the talent scraper refuses the new build, and rightly. It
moves build-code positions (paladin Holy loses Improved Holy Strike and Retribution loses
Crusade, shifting every later position; Feral Combat's Mangle and Primal Fury become Primal Bite
and Blood Frenzy; Elemental swaps Elemental Fury and Elemental Alacrity), and four stored codes
no longer decode (the Retribution and Protection paladin defaults and the Holy build: Unyielding
Faith is now 2 ranks; the Elemental default: Elemental Alacrity is now 3). Taking it needs the
app to migrate stored codes and new defaults first, then `--accept-code-changes`
([README § Refreshing](README.md#refreshing)). So this commit mixes builds: spellbooks, races,
items and `src/data/client` at 1.60.1.70009, talents at 1.60.1.69913, and `talents.json` here
maps the old trees onto the new client (Improved Holy Strike and Crusade unmapped; Mangle and
Primal Fury matched by position). The claim check (`--claims`) now reads 115 match, 4 partly,
10 differ; the differences are the values this build changed: Sunder Armor's threat effect
(1013 → 206 at rank 5), Holy Strike (10 s, 50% weapon at rank 8), Vengeance (3 stacks), Slam
(18 s), Overpower's window stacks, Bloodthrill's proc mask, Windfury Totem's aura, the Frenzy
potions (now attack power) and Righteous Fury (+60%). The engine's constants still carry the
1.60.1.69913 values, so the tests that check them against this data fail until each is adopted.
The warrior's four are adopted (Sunder Armor 206 at rank 5, Slam 18 s and Improved Slam's −1.5 s a
rank, the unstacked Overpower window, Bloodthrill's 0x14 main-hand mask at 4% a rank:
[warrior.md §1](../classes/warrior.md#1-wow-forever-deviations),
[threat.md](../mechanics/threat.md#warrior)), and `lib/claims.mjs`'s D4 and D9 checks now expect
1.60.1.70009's values, checked against the committed `spells.json` and `talents.json`. The report
above was regenerated on 1.60.1.70009 on 2026-09-25 with 0 requests: this scraper with
`--version=1.60.1.70009 --claims`, run with its fetcher held offline, since `--claims` can't be
combined with `--check`. It reads 124 match, 5 partly, 0 differ, and the `src/data/client` it
wrote alongside is byte-identical to the committed files.

The talent trees then took 1.60.1.70009 (2026-09-24, 0 requests: `npm run scrape:talents --
--version=1.60.1.70009 --accept-code-changes`, then this scraper), once the app read codes from both
trees ([talents.md § Tree versions](talents.md#tree-versions)): 1.60.1.69913's code order stays,
frozen, in `src/data/talents/frozen.json`, a setup's `version` says which trees its code is on, and
a version-1 code is mapped onto the new trees by talent name, its points in a removed talent
refunded. The refused scrape's list held: Improved Holy Strike (Holy) and Crusade (Retribution)
removed, Mangle and Primal Fury renamed Primal Bite and Blood Frenzy in their cells, Elemental Fury
and Elemental Alacrity trading places. Two of its readings were off: Unyielding Faith was already 2
ranks and Elemental Alacrity already 3 (the old codes read as illegal only because every later
position had shifted), and no warrior talent moved: Bastion and Focused Rage keep their cells. The
defaults moved with the trees (the Retribution and Protection paladin and Elemental defaults;
[paladin.md](../classes/paladin.md#retribution-defaults), [shaman.md](../classes/shaman.md#elemental-defaults)).
So `talents.json` now maps every talent of the new trees, all 466 by name (none by position), and
every dataset here is one build again. `spells.json` gained no spell and lost none (Improved Holy Strike's
and Crusade's spells stay, as paladin.md cites them): 7 racial spells whose doc citations had
landed since the last run took their `docs` source.

Adopted since, for the mage, shaman, Balance druid, races and consumables (each doc names
1.60.1.70009 where its value moved): Ignite's ticks no longer take the boss's damage taken again
(412545 gains `Attributes[6]` 0x20000000 and `Attributes[10]` 0x2) and Hot Streak's 400625 lasts
20 s ([mage](../classes/mage.md#ignite)); Rage of the Farseer drops its casting speed (aura 65),
Lightning Bolt r4 is 56 base points, and every rank of Windfury, Grace of Air and Flametongue
Totem, and Tranquil Air, share a new `Attributes[11]` 0x400 (11 spells), the no-stacking rule the
notes give ([shaman](../classes/shaman.md#totems));
Windfury Totem's 10612 is a proc-trigger aura (42), as D12 now reads; Wrath is about 50% stronger
on every rank ([druid §11.2](../classes/druid.md#112-spells)); Eureka! cuts 10% for every class
([character-stats](../mechanics/character-stats.md#racials-that-matter-to-the-sim)); Wizard Oil is
+24 and the Frenzy potions give attack power (auras 99 and 124), as D13 now reads
([buffs §3](../mechanics/buffs-debuffs-consumables.md#35-potions-and-runes)); Dark Sacrifice's
tooltip adds your Spirit ([priest](../classes/priest.md#72-race-and-weapons)). Of the spells
`spells.json` holds, 66 (77 effect rows) lost `EffectBonusCoefficient` 1, nearly all item and
consumable spells (Mighty Rage 17528, the Nutritious Food spells, Hand of Justice 15600,
Earthstrike 25891 and others), and one gained it: Twist of Light 1310735, whose effect became an
aura 108 (the client as a whole: 875 spells, 1,043 rows). Every one is an aura or a non-damage
effect, where the coefficient does nothing, so no simulated value moves. The docs' new citations
since (the lower air-totem ranks and Flametongue Totem's auras, and Deep Wound's tick 412613,
[warrior Q36](../classes/warrior.md#9-open-questions)) add 9 spells to `spells.json`.

### What the docs decide

Part of the interest set comes from the docs rather than from the other datasets, so **a doc
edit can change `src/data/client`**:

| Doc | What it adds | Parser |
| --- | --- | --- |
| [buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md) §3 | each consumable's item (its `items.json` record and item effects), the buff spell and the enchant its ID cell names, and that enchant's spells | `parseBuffsDoc` |
| the same, §5 (and §3's enchants) | the `enchants.json` rows, and the enchanting and proc spells | `parseBuffsDoc` |
| the same, §1 and §4 | the buff and debuff spells (`buffsDoc` source) | `parseBuffsDoc` |
| the same, §4's `item N → S` cells (Annihilator, Rivenspike, Nightfall) | the weapon's `items.json` consumable record (item effects, doc name and section) and its proc spell `S` (`consumable` source), checked against the item's effects like a §3 item's spell | `parseBuffsDoc` |
| `docs/classes/*.md`, `docs/mechanics/*.md`, `docs/open-questions.md` | every spell id cited with a marker or after its client name (`docs` source) | `docSpellMentions` |

A spell id cited only by its name drops out when the client renames the spell: in 1.60.1.70009,
Mangle's rename to Primal Bite dropped three of its four ranks until druid.md listed them with a
marker. So the client scraper **warns on every spell the docs cited in the `spells.json` it
replaces (or checks against) that the new generation no longer extracts**, with the previous
build and the reason: the client's new name for it, "it isn't in this build's client", or "no doc
cites it by name or marker any more" (`droppedDocCitations`; the druid review's DR2-3). It's a
warning, not a failure: a citation the docs dropped on purpose is fine. On 1.60.1.70009 it names
one spell, Adaptation 1253389, which left the client; the docs cite it as 1.60.1.69913's, and
nothing the sim models reads it.

Both parsers are in [`lib/docrefs.mjs`](../../scripts/scrape/lib/docrefs.mjs). A §3 ID cell is a
chain: the item ids, then optionally the item's spell, spells it triggers, `enchant N` and the
enchant's own spells (`18262 → enchant 2506`, `20750 → 25121 → enchant 2627 → 25111`,
`13810 → 18124 → 18125`); `enchant` is read in any case. The client checks each link, and a
link it contradicts is a `docMismatches` entry on the item's `items.json` record: the item's
spell must be one of its item effects, each later spell before the enchant must be reached from
it through `EffectTriggerSpell` (so `20749 → 25122 → 25113 → enchant 2628` is reported: 25113 is
the enchant's spell, not one 25122 triggers), the enchant must be one the item's spells apply,
and the enchant's spells must be on its enchant row. A row's catalogue key (`` (`wizardOil`) ``)
isn't part of its name. A cell the parser can't read fails the run instead of dropping its ids:
no item id, an empty step, two enchants, an `enchant` step that isn't `enchant N`, an ASCII
`->`, an items step that isn't a `/` list of ids (`13931 (x2)`), or a spell step whose count is
neither one nor the items' (`1 / 2 / 3 → 10 / 20`). So does a §4 cell with an item or an arrow
that isn't `item N → S` (`Item` is read in any case), and a §1, §3, §4 or §5 table with no
ID column (`ID`, `IDs`, `IDs (spell / enchant)` or `Item → enchant`), apart from §1.3's camp
buffs and a rules table (§3.7's `Rule | Value | Tag`), which have no ids by design.

So a commit that edits one of these docs regenerates the data in the same commit
(`npm run scrape:client`, zero requests from a warm cache). `npm run test:full` checks it
([README § Checking the committed data](README.md#checking-the-committed-data)): `npm test`
compares what the docs decide with the committed files without the cache, and, where the cache
holds the committed build, `npm run scrape:check` regenerates every dataset and compares byte for
byte.

## Phase 2 notes: what this client ships

For rebuilding `src/data/{spells,talents,races,items}` from client files (D17). **All four are
done:** items (M1.5c-2, [items.md](items.md)), talents (M1.5d, [talents.md](talents.md)),
spellbooks and races (M1.5e, [spells.md](spells.md), [races.md](races.md)). M1.5f retired the
foreverchanges scrapers.

| Need | In 1.60.1.69913? |
| --- | --- |
| Encounter Journal (`JournalInstance`, `JournalEncounter`, `JournalEncounterItem`) | the files ship but are **empty (0 records)**: no drop sources from the client, so every item's `source` is null |
| Talent layout and prerequisites | yes: `TraitNode` (`PosX`/`PosY`), `TraitEdge` (types 2 and 3 gate), `TraitNodeGroupXTraitNode` + `TraitNodeGroupXTraitCond` + `TraitCond` (`SpentAmountRequired` per tier: the lower tiers for tiers 2–6, the whole tree for tier 7), `TraitCurrency` 3820 (51 points). Used by `src/data/talents` since M1.5d, with the Classic Era `Talent`/`TalentTab` rows for the comparison ([talents.md](talents.md)) |
| Race/class combinations | yes: `CharBaseInfo`, 56 pairs (Classic Era: 40). Used by `races.json` since M1.5e, with `ChrRaces` for names and factions and the racial skill lines of `SkillLineAbility` for racials ([races.md](races.md)) |
| Race base stats | **no**: Forever's `RaceStat` has one unnamed column that is 0 for every race, `ChrRaces` has no stat modifiers, and Classic Era ships no `RaceStat`. Level-60 base stats are server data ([races.md § Base stats](races.md#base-stats)) |
| Trainer vs talent vs automatic | `SkillLineAbility.AcquireMethod`: 0 trainer (6,958 rows), 2 learned automatically (420, e.g. Heroic Strike r1, Battle Stance), 3 granted by another spell (383, e.g. the Flurry buff, Last Stand's effect), 1 (63 rows, not examined). Talents themselves come from the Trait tables, not SkillLineAbility. Used by the spellbooks since M1.5e ([spells.md § The book](spells.md#the-book)); the Classic Era client's `AcquireMethod` is looser (Season of Discovery runes and Judgement effects are 0 there) |
| Items | yes: `ItemSparse` 19,171 rows, `Item` 31,675, `ItemSet` 532 (+ `ItemSetSpell` 1,462), `ItemEffect` 12,571 + `ItemXItemEffect` 12,565 (Classic Era links through `ItemEffect.ParentItemID` instead), `ItemDisplayInfo` 42,047. Stats, armor and damage are derived as in [Items from the client](#items-from-the-client); names of subclasses, factions, skills and Unique-Equipped groups come from `ItemSubClass`, `Faction`, `SkillLine` and `ItemLimitCategory`. Used by `pre-bis.json` since M1.5c-2 |
| Item and spell icons | `Item.IconFileDataID` directly (also `ItemModifiedAppearance` → `ItemAppearance.DefaultIconFileDataID`), `SpellMisc.SpellIconFileDataID`. **Names:** the build's own file list (`/api/files`, already fetched) maps them, e.g. 132363 → `interface/icons/ability_warrior_sunder.blp`, so wow-listfile isn't needed. The item pool uses this for every icon (37 new items have `IconFileDataID` 0 and take their appearance's icon; a space in a name is written `-`) |
| Spell text | `Spell.Description_lang` / `AuraDescription_lang` with `$s1`-style variables; `SpellDescriptionVariables` via `SpellXDescriptionVariables`. [`lib/spell-text.mjs`](../../scripts/scrape/lib/spell-text.mjs) renders them; every item effect and set bonus of the pool renders ([items.md](items.md#effect-and-set-bonus-text)), and so does every spellbook rank and racial, with the options of [spells.md § Rank fields](spells.md#rank-fields) (line layout, whole-number `${…}`, `$f1`, "until cancelled", conditional description variables, `$AP` as 0) |
| Classic Era baseline | `wow_classic_era` 1.15.9.69722 through the same endpoint; 45 of its tables are cached. `ItemXItemEffect` and `PlayerExpectedStat` don't exist there, and several layouts differ (`SpellEffect`, `SpellCategories`, `SpellItemEnchantment` has no `Duration`), which the reader and `createSpellIndex(…, { lenient: true })` handle |

## Items from the client

`src/data/items/pre-bis.json` is built from client files (D17). M1.5c-1 built the derivation
below and checked it against the last foreverchanges dataset; M1.5c-2 writes `pre-bis.json`
from it ([items.md](items.md) documents the dataset, its filter and, as history, the diff from
the foreverchanges one).

- [`scripts/scrape/lib/item-stats.mjs`](../../scripts/scrape/lib/item-stats.mjs) holds the
  derivation. These are pure functions with no dependencies: `deriveItem(ctx, id)` turns an
  `ItemSparse` + `Item` row into `Stats` amounts, the `Weapon` block, the innate shield block
  value, effect records and the set id. `deriveSet(ctx, id)` gives a set's pieces and bonuses.
- [`scripts/scrape/items-client.mjs`](../../scripts/scrape/items-client.mjs) writes the pool
  (`npm run scrape:items`) and diffs it against the committed one (`npm run diff:items`).
  `--fixtures` regenerates the real rows the unit tests use
  ([`lib/__fixtures__/item-stats.json`](../../scripts/scrape/lib/__fixtures__/item-stats.json),
  tests in [`lib/item-stats.test.mjs`](../../scripts/scrape/lib/item-stats.test.mjs)).
- The M1.5c-1 check, `npm run compare:items`, derived every item of the foreverchanges
  dataset from both clients and compared each field with the site's tooltip values. It only
  made sense against that dataset, so M1.5f retired it; its result is kept below as
  [history](#comparison-with-the-snapshot-history).

### Tables used

| Table | Forever 1.60.1.69913 | Classic Era 1.15.9.69722 | Used for |
| --- | --- | --- | --- |
| `ItemSparse`, `Item` | cached | **fetched** | the item row; class and subclass |
| `ItemEffect` (+ `ItemXItemEffect` in Forever) | cached | cached (links through `ParentItemID`) | use, equip and chance-on-hit spells |
| `ItemSet`, `ItemSetSpell` | cached | **fetched** | set pieces and bonus spells |
| `RandPropPoints` | **fetched** | **fetched** (all 300 rows are zeros) | the stat budget |
| `ItemArmorQuality`, `ItemArmorTotal`, `ArmorLocation`, `ItemArmorShield` | **fetched** | **fetched** | armor |
| `ItemDamageOneHand`, `…OneHandCaster`, `…TwoHand`, `…TwoHandCaster`, `…Ranged`, `…Thrown`, `…Wand` | **fetched** | **fetched** | weapon DPS |
| `SpellEffect`, `SpellName`, `SpellCooldowns`, `SpellShapeshift` | cached | cached | equip-spell auras, names, cooldowns, form conditions |
| `SpellCastingRequirements` | cached | **fetched** | area-restricted equip spells |
| `gametables/shieldblockregular.txt` | not shipped | **fetched** | innate shield block value |

The armor and damage tables of the two builds are identical row for row. The Forever
`CombatRatingsMultByIlvl` and `StaminaMultByIlvl` game tables are 1.0 for every column below
item level 341, so they don't enter the formulas. `ItemSparse.QualityModifier` is set on 427
Forever rows (91 in the pool) but changes no amount. No pool row sets `ItemSquishEraID`, an
item-level curve, `ContentTuningID` or a socket.

### Two layouts

| | Forever (`wow_classic_beta`) | Classic Era (`wow_classic_era`) |
| --- | --- | --- |
| Stat amounts | `StatPercentEditor[i]` = allocation in 1/10000 of the budget, of stat type `StatModifier_bonusStat[i]` | `StatModifier_bonusAmount[i]` = the amount (only primary stats in the pool) |
| Secondary stats (ratings, AP, spell power, resistances, …) | more stat types, including Forever's own 83+ | equip spells (`ItemEffect` trigger 1) |
| Armor, resistances | computed (below); resistances are stat types 51–56 and 124 | `Resistances[0]` armor, `[2..6]` fire, nature, frost, shadow, arcane |
| Weapon damage | computed from `ItemDamage*` | `MinDamage[0]`/`MaxDamage[0]`; `[1]` is extra damage, its school in `Item.DamageType[1]` (`ItemSparse.DamageType` holds only the first) |

### Stat budget

`[F]` confirmed on every Forever pool row (2,927 stat values on 884 items, none off):

```text
budget = RandPropPoints[ItemLevel].<EpicF | SuperiorF | GoodF>[slot group]
amount = floor(StatPercentEditor × budget / 10000 + 0.5)
```

- **Quality column:** Epic (4) and above use `EpicF`, Rare (3) `SuperiorF`, Uncommon (2) and
  below `GoodF`. The integer columns equal the float ones in this build.
- **Slot group:** 0 head, chest, robe, legs, two-hand; 1 shoulder, waist, feet, hands, trinket;
  2 neck, wrist, finger, shield, back, held in off hand; 3 one-hand, main hand, off hand;
  4 ranged (bows), thrown, ranged-right (guns, crossbows, wands), relic. Bows being in group 4,
  not 0, was the one correction the data forced (Gorewood Bow: +9 Stamina = 8182 × 11).
- **Rounding:** half up (`floor(x + 0.5)`), as in the retail client. No pool value lands
  exactly on .5, so this build can't tell half-up from banker's rounding.

Worked example, Lionheart Helm (12640): item level 61, Epic, head, so the budget is
`RandPropPoints[61].EpicF[0]` = 45. Strength 4000 → 18.0 → **18**, crit rating 6222 → 27.999 →
**28**, hit rating 4444 → 19.998 → **20**. That matches the Forever tooltip (and 2% crit × 14,
2% hit × 10).

`StatModifier_bonusStat` → `Stats` key. Types up to 56 are the retail `ItemModType` enum. The
83+ types are Forever's own:

| Type | Key | Evidence |
| --- | --- | --- |
| 3, 4, 5, 6, 7 | agility, strength, intellect, spirit, stamina | `[F]` pool |
| 12, 13, 15 | defenseRating, dodgeRating, blockRating | `[F]` pool |
| 14, 36, 44 | parryRating, hasteRating, armorPenetration | `[?]` not in the pool (retail enum) |
| 31, 32, 37 | hitRating, critRating, expertiseRating | `[F]` pool |
| 38, 39 | attackPower, rangedAttackPower | `[F]` pool |
| 41, 42, 45 | healing, spellDamage, spellPower | `[F]` pool |
| 43, 46 | mp5, healthRegen | `[F]` pool |
| 47, 48 | spellPenetration, blockValue | `[?]` not in the pool; Classic Era rows of the same items agree |
| 50 | bonusArmor; **the Forever tooltip adds it to the white armor line** | `[F]` 74 pool items |
| 51, 52, 54, 55, 56 | fire, frost, shadow, nature, arcane resistance (53 holy isn't a `Stats` key) | `[F]` pool |
| 85, 87, 88, 89 | fire, frost, shadow, arcane spell damage | `[F]` pool |
| 124 | all five resistances, one stat (the tooltip words it with `ITEM_MOD_SPELL_RESISTANCE_ALL_SCHOOLS`, "Increases spell resistance by %s."; docs/ux.md "Item tooltips") | `[F]` pool |
| 128, 136 | attackPowerVsUndead, spellDamageVsUndead | `[F]` pool |
| 83 | weaponDamage | `[?]` Might of Cenarius: Classic Era aura 13 (physical) +4, Forever 4 |
| 84, 86, 127, 131, 135 | holy and nature spell damage; AP vs demons, AP vs beasts; spell damage vs demons | `[?]` from the Classic Era row of the same item |
| 90, 91, 96 | weapon skill: two-handed axes, two-handed maces, daggers | `[?]` from the Classic Era row of the same item |
| 92, 98, 103, 112–121, 132 | other weapon, profession and spell-penetration skills, AP vs a creature type | unknown; not mapped, and `deriveItem` reports them in `unknownStatTypes` |

### Armor

`[F]` confirmed on all 884 Forever pool rows:

```text
cloth–plate: armor = floor(ItemArmorQuality[ilvl].Qualitymod[quality]
                           × ItemArmorTotal[ilvl].<Cloth|Leather|Mail|Plate>
                           × ArmorLocation[inventoryType].<Cloth|Leather|Chain|Plate>modifier + 0.5)
             (robes use the chest row; cloaks are cloth with location 16)
shields:     armor = floor(ItemArmorShield[ilvl].Quality[quality] + 0.5)
tooltip armor = armor + stat 50 (bonus armor)
```

Lionheart Helm: 1.2 × 3619.31 × 0.13 = 564.6 → **565**. Burrow Barricade (274418, Rare
shield, item level 58): `ItemArmorShield[58].Quality[3]` = 1,994, plus stat 50 at 43160 × 19 /
10000 = 82, gives the tooltip's **2,076**. 74 pool items carry stat 50. **Stat-50 bonus armor
explains most of the "armor changes"** foreverchanges showed, because its tooltips add it to
the white armor line: Whitesoul Helm's 509 → 629 is 509 base armor plus 120 bonus armor. On 63
of the 70 changed items whose armor moved, the base armor is still Classic's and Forever added
bonus armor. The other 7 have lower base armor: six Timbermaw and Argent Dawn reputation pieces
(for example Gloves of the Dawn 417 → 398), and Emerald Circle, which lost its armor.
`deriveItem` keeps the two apart, and so does the dataset (`stats.armor`, `stats.bonusArmor`;
[items.md](items.md#stats-armor-and-block-value)), so the engine can tell them apart: Toughness
multiplies base armor only.

### Weapon damage

`[F]` confirmed on all 51 Forever pool weapons:

```text
dps     = ItemDamage<table>[ilvl].Quality[quality]
          table: TwoHand (inventory type 17), OneHand (13, 21, 22), Ranged (bows, guns, crossbows),
                 Thrown, Wand; the Caster tables (ItemFlags2 0x200) equal the others in this build
average = dps × ItemDelay / 1000
min     = floor(average × (1 − DmgVariance / 2))
max     = floor(average × (1 + DmgVariance / 2) + 0.5)
tooltip dps = round((min + max) / 2 / speed, 1)
```

Arcanite Reaper (12784; Forever makes it Rare, item level 63): 53.945 × 3.8 = 204.99; min
floor(153.74) = **153**, max floor(256.74) = **256**, 53.8 DPS. Classic Era stores the damage
instead; its tooltip DPS includes the extra damage (Warblade of Caer Darrow 142–214 + 1–22 Frost =
57.4).

**Caster weapons `[?]`.** A Forever weapon with `Flags[4]` bit 0x100 plus 0x200 (spell power)
or 0x400 (healing) gives up DPS for spell power worth 2 × the group-0 budget of its quality at
its item level, whatever its slot. For example, Whiteout Staff and Shivsprocket's Shiv (both
item level 65, Rare, `SuperiorF[0]` = 37) show **+74 Spell Power**, and Elderwild Construction
Hammer (60, 34) shows +68. Applied to an Epic, the rule gives Mindfang, Sageclaw and Ironbark Staff
(item level 65, Epic) **+94**, the number every caster's default main hand now rests on
([warlock.md §7.3](../classes/warlock.md#73-gear)). No Epic was among the weapons it was fitted on,
so that +94 is `[?]` until a tooltip confirms it (open question below). Healing weapons get 3.75 × and 1.25 × that group-0 budget as
healing and spell damage (Simone's Cultivating Hammer: +139 Healing, +46 Spell Damage). The
DPS falls by **0.195 per point** of that spell power (2 × budget). That constant is a fit, not a
known formula: scanning 0.190–0.200, only 0.19494–0.19505 reproduces all seven pool weapons'
min and max. Crackling Staff has spell power in its own stats (+25). It takes the same DPS cut
but doesn't get the extra 74, so the derivation adds the caster spell power only to weapons
whose stats have no spell power, healing or spell damage. That rule rests on a single item.

### Block value

- **Forever:** block value is stat type 48 (12 items in the whole client, none in the pool:
  The Immovable Object, Clobrok's Block Rock, Sawyer Family Seal, …). **The client has no innate
  shield block value.** It doesn't ship `gametables/shieldblockregular.txt`, and no shield row
  carries a block field. Whether the server gives shields a base block value is an open
  question (below).
- **Classic Era:** equip spells give block chance (aura 51) and block value (aura 564; 158 in
  older clients). The innate value comes from `ShieldBlockRegular[ilvl].<quality>`, for example
  Barrier Shield (item level 62, Rare) 39. The foreverchanges tooltips printed neither innate
  value. `deriveItem` returns it as `shieldBlockValue`, separate from `stats.blockValue`, and
  the dataset keeps it as `classicShieldBlockValue` on the 20 shields that fall back to Classic
  Era, out of `stats.blockValue` so they don't outrank Forever shields for want of data.

### Aura → stat

Equip spells (`ItemEffect` trigger 1) whose every aura is in this table become stats. Other
equip spells stay effect records. `AURA_STAT` in `item-stats.mjs` is the single copy of this
table. Points are `EffectBasePointsF` (Forever) or `EffectBasePoints + 1` when
`EffectDieSides ≥ 1` (Classic Era).

| Aura | Name | Misc value | Stat |
| --: | --- | --- | --- |
| 13 | MOD_DAMAGE_DONE | school mask: 126 all magic, one school bit, 1 physical | spellDamage, `<school>SpellDamage`, weaponDamage |
| 135 | MOD_HEALING_DONE | | healing (13 + 135 of equal size → spellPower) |
| 22 | MOD_RESISTANCE | school mask: 1 armor, 4 fire, 8 nature, 16 frost, 32 shadow, 64 arcane | bonusArmor, resistances |
| 29 | MOD_STAT | 0–4 stat, −1 all | strength, agility, stamina, intellect, spirit |
| 30 | MOD_SKILL | 95 Defense, weapon skill lines (43 Swords, 44 Axes, 54 Maces, 173 Daggers, …) | defense, `weaponSkill` |
| 47, 49, 51 | MOD_PARRY / DODGE / BLOCK_PERCENT | | parry, dodge, block |
| 52 | MOD_WEAPON_CRIT_PERCENT | | crit (the tooltip's "with melee attacks" wording is `meleeCrit` in the snapshot; the engine adds both to melee crit) |
| 290 | MOD_CRIT_PCT (all crit: attacks and spells) | | crit and spellCrit, as the engine counts a +1% crit enchant (The Gladiator 5-piece, 1314795) |
| 54, 55 | MOD_HIT_CHANCE, MOD_SPELL_HIT_CHANCE | | hit, spellHit |
| 57, 71, 552 | spell crit (552 is Classic Era 1.15's number) | 126 for 71 and 552 | spellCrit |
| 99, 124 | MOD_ATTACK_POWER, MOD_RANGED_ATTACK_POWER | | attackPower (the melee value); ranged beyond it → rangedAttackPower |
| 102, 131 | MOD_MELEE / RANGED_ATTACK_POWER_VERSUS | creature-type mask: 1 beast, 2 dragonkin, 4 demon, 8 elemental, 16 giant, 32 undead, 64 humanoid, 256 mechanical | `attackPowerVs<Type>` (the ranged twin is dropped) |
| 180 | MOD_FLAT_SPELL_DAMAGE_VERSUS | creature-type mask | `spellDamageVs<Type>` |
| 123 | MOD_TARGET_RESISTANCE | school mask | spellPenetration (negated) |
| 85 | MOD_POWER_REGEN | 0 mana | mp5 |
| 84, 161 | MOD_REGEN, MOD_HEALTH_REGEN_IN_COMBAT | | hp5 ("Restores N health per 5 sec") |
| 158, 564, 274 | shield block value (564 is Classic Era 1.15's number, 274 Forever's: Barrier Shield's 22912 "Increases the block value of your shield by 18") | | blockValue |
| 189 | MOD_RATING | combat-rating mask | ratings: 224 (melee, ranged and spell hit) → hitRating, 1792 (crit) → critRating (Necropile Raiment and Bloodmail Regalia set bonuses) |

Not stats, listed in `NOT_STAT_AURAS` with the reason: 4 (dummy), 10 (threat %), 15, 42, 43
(procs), 17 (stealth detection), 23 (periodic trigger), 31, 58, 129 (movement and swim speed),
77, 117, 232, 255 (mechanic immunity, resistance, duration, damage taken), 107, 108, 112 (class
ability tweaks), 120 (untrackable), 154 (stealth level), 168 (damage % against a creature type)
and 593 (chance to be dodged or parried: Deathbone Guardian's 5-piece). Every aura on an equip
spell or set bonus of the pool is in one of the two tables; a new one makes the item generator
warn and `scripts/scrape/lib/item-pool.test.mjs` fail (review finding L8).

An equip spell with aura 15 (damage shield, "when struck"), 42 or 43 (proc
triggers) is a **proc**. One with a `SpellCastingRequirements.RequiredAreasID`, a
`SpellShapeshift.ShapeshiftMask` or a weapon `SpellEquippedItems` row (item class 2: "hit with
ranged weapons") is a **conditional** effect, which carries its would-be stats.
For example, Rune of the Guard Captain's "tripled in Forest and Grassland areas" is spell
1287704 (+28 AP, area group 9161), next to the always-on +14 AP of spell 1318000. Anything
else, such as class-ability tweaks (auras 107/108), run speed, stealth detection or dummies, is
an **equip** effect record. Every effect record keeps
`{ trigger, kind, spellId, name, cooldownMs, categoryCooldownMs, categoryId, charges }`. Use
effects show the item's cooldown, else the category's: Stormpike Insignia is 0 ms with a
120 s category cooldown, and its tooltip reads 2 min.

**Sets:** `ItemSparse.ItemSet` → `ItemSet` (name, up to 17 `ItemID`s) and `ItemSetSpell`
(`SpellID`, `Threshold` = pieces, `ChrSpecID`). A bonus whose spell is all stat auras gets
`stats`; the rest keep their spell and unmapped auras.

### Comparison with the snapshot (history)

*History: the M1.5c-1 check, kept as its record. The command was retired in M1.5f.*
`npm run compare:items` ran on 2026-09-22 against `pre-bis.json` as foreverchanges gave it
that day (`git show b94a076:src/data/items/pre-bis.json`). Rates count only items that have a
row in the compared build.

| Compared | Fields | Match | Engine-read fields | Match |
| --- | --: | --: | --: | --: |
| Forever-stat items (884 with a Forever row) vs the Forever row | 8,328 | 99.9% | 3,974 | 3,973 |
| Unchanged hotfix-only items (21) vs the Classic Era row | 223 | 100% | 104 | 104 |
| `statsFrom: "classic"` items (650) vs the Classic Era row | 6,150 | 99.8% | 2,801 | 2,800 |
| Changed items' `classic` block (494) vs the Classic Era row | 2,704 | 99.96% | 2,334 | 2,334 |
| Sets with Forever bonuses (89) vs Forever `ItemSetSpell` | 267 | 95.9% | 89 | 78 |
| Sets with Classic bonuses (13) vs Classic Era `ItemSetSpell` | 39 | 100% | 13 | 13 |

Per field, the Forever comparison matches **100%** on every primary stat, armor (714 items),
crit, hit, defense, dodge, block and expertise rating, spell power, healing, spell damage,
resistances, mp5 and health regeneration. It also matches every weapon's min, max, speed, DPS,
school and skill (51), every set id (884) and every use-effect count. `attackPower` matches
87/88. The full per-field table is in the report.

Every mismatch has a class:

| Class | Count (engine-read) | What and examples |
| --- | --: | --- |
| No client row | 110 (110) | Forever-stat items with no Forever `ItemSparse` row: the 50 hotfix-only items of the [hotfix caveat](#hotfix-caveat) and the 60 seen-in-game items. See [Coverage](#coverage) |
| Old tooltip or parser error | 9 (3) | the snapshot is wrong or incomplete and the client is right. Rune of the Guard Captain's +14 AP, Seal of the Dawn's +81 AP vs Undead and Rune of the Dawn's +48 spell damage vs Undead sit on lines with a second sentence, so the old parser kept them as text. Devilsaur Leggings gives 48 ranged AP, but the tooltip prints "+46 Attack Power". Devilsaur Armor's set bonus grants spell hit as well as hit. Nat Pagle's Broken Reel and Draconic Infused Emblem have a 75 s cooldown, but the tooltip prints "1 Min" |
| Equivalent | 10 (10) | set bonuses with aura 52, which the tooltip words "with melee attacks" (`meleeCrit`) and the derivation calls `crit`; the engine adds both to melee crit (Blood Tiger Harness, the Highlander's and Defiler's sets, Black Dragon Mail) |
| Effect bucket | 9 (0) | the same effect sorted differently: "Adds 4 Fire damage to your weapon attack" is a proc aura (42) that the snapshot files under other equip effects (Fiery Plate Gauntlets, Storm Gauntlets, Fiery Retributer). Arcanite Dragonling has a hidden Forever equip dummy (1318325). Seal of Ascension's tooltip lacks its use and equip lines |
| Likely hotfix | 3 (0) | the Undermine trinkets (Adaptive Combat Assistant, Weakness Analyzer, Serenity Field): the raw `ItemEffect` says a 90 s cooldown (15 s shared category 1141), the tooltip 2 min |
| Client layout | 2 (0) | Warblade of Caer Darrow's and Iceblade Hacker's extra damage was compared without a school, because `ItemSparse` stores one `DamageType`. Fixed in M1.5c-2: the school is `Item.DamageType[1]` (Frost), and both now match |
| Formula gap, rounding | 0 | none left. The iterations fixed the bow slot group, extra damage in DPS, AP pairs of unequal size, area-restricted spells, category cooldowns, caster weapons and thorns (aura 15, now a proc as in the snapshot) |

**Stale Classic set bonuses (7, engine-read).** Thirteen sets get their bonuses from Classic Era
in the snapshot, because no piece has a Forever tooltip. Seven of them have **different bonuses
in Forever's own `ItemSetSpell`**:

| Set | Classic Era (snapshot) | Forever client |
| --- | --- | --- |
| 124 Deathbone Guardian | 2: +3 defense · 3: +50 armor · 4: +15 all resistances · 5: +1% parry | 2: +3 defense · 3: spell · 4: +5 all resistances · 5: spell |
| 1 The Gladiator | 2: +20 armor · 3: +2 defense · 4: +10 AP · 5: +1% crit | 2: spell · 3: +20 AP · 4: spell · 5: spell (and a sixth piece, 277117) |
| 123 Bloodmail Regalia | 2: +3 defense · 3: +10 AP · 4: +15 all res · 5: +1% parry | 2: +10 AP · 3: spell · 4: +5 all res · 5: +21 crit rating |
| 121 Cadaverous Garb | 2: +3 defense · 3: +10 AP · 4: +15 all res · 5: +2% hit | 3: +10 AP · 3: spell · 4: +5 all res · 5: +2% hit and spell hit |
| 122 Necropile Raiment | 2: +3 defense · 3: +5 Int · 4: +15 all res · 5: +23 SP | 2: +5 hit rating · 3: spell · 4: +5 all res · 5: +23 SP |
| 81 The Postmaster | 2: +50 armor · 3: +10 fire/arcane res · 4: +12 SP · 5: +10 Int, spell | 2: spell · 3: +23 SP · 4: spell · 5: +1% hit and spell hit |
| 520 Ironweave Battlesuit | 4: spell · 8: +200 armor | 2: +200 armor · 3: +5 spell pen · 4: spell · 5: +23 SP · 6: spell |

### Coverage

*History: how the M1.5c-1 foreverchanges pool mapped onto the client, which decided what
M1.5c-2 does with items that have no Forever row.*

| | Items |
| --- | --: |
| Pool (foreverchanges, M1.5c-1) | 1,644 |
| Forever `ItemSparse` row | 884 |
| **No Forever row, Classic Era row present** (would fall back to Classic stats, flagged, per D6/D17) | **744** |
| **No row in either client** (would leave the pool) | **16** |

M1.5c-2 applied this: the client pool had 1,630 items, the 1,644 less those 16, plus two
Classic Era rows foreverchanges never listed; 746 fell back to Classic Era
([items.md](items.md#from-foreverchanges-to-the-client)). Since Diamond Flask left the pre-raid
lists ([warrior Q30](../classes/warrior.md#9-open-questions)) it's 1,629 and 745.

The 744 Classic fallbacks are the 650 "missing" items and the 60 seen-in-game items (both
described in [items.md](items.md)), plus 34 of the 50 hotfix-only items:

- **21 unchanged** (13113 Feathermoon Headdress, 13002 Lady Alizabeth's Pendant, 13120 Deepfury
  Bracers, 871 Flurry Axe, 4091 Widowmaker, 13015 Serathil, …). Their Classic Era rows
  reproduce the snapshot exactly (223 of 223 fields), so the fallback loses nothing.
- **13 changed:** 13007 Mageflame Cloak, 13072 Stonegrip Gauntlets, 16717 Wildheart Gloves,
  16724 Lightforge Gauntlets, 16685 Magister's Belt, 16702 Dreadmist Belt, 16716 Wildheart
  Belt, 16736 Belt of Valor, 13101 Wolfrunner Shoes, 14549 Boots of Avoidance, 11811 Smoking
  Heart of the Mountain, 868 Ardent Custodian and 13146 Shell Launcher Shotgun. **A fallback
  would lose their Forever changes.** Most are percentages reworded as ratings (Stonegrip
  Gauntlets +10 defense → +10 defense rating, Boots of Avoidance 2% dodge → 24 dodge rating).
  Some change values: Belt of Valor +8 → +12 Stamina and +6 defense rating, Dreadmist Belt, and
  Smoking Heart of the Mountain with no armor line in Forever.

The 16 with no row anywhere are all new Forever items, hotfix-only: 272491 Premier Chain
Headguard, 271907 Expeditionary's Cape, 272063 Darkspear Raider's Cloak, 272411 Arcanoweave
Cloak, 272414 Howler's Furs, 272415 Stalwart Cloak, 284261 Magically Fortified Legguards,
271924 Rebels' Rugged Reaper, 272079 Darkspear Raider's Reaper, 284257 Icesworn Decapitator,
271928 Clever Expeditionary's Spellblade, 271936 Guerilla's Jagged Mace, 272083 Darkspear
Insurgent's Spellblade, 272091 Darkspear Skirmisher's Bludgeon, 271932 Insurgent's Manifesto
and 272087 Tome of the Darkspear Prophecy.

**Pre-raid BiS lists** ([`pre-raid-bis.json`](../../scripts/scrape/pre-raid-bis.json), 158
items): **none lacks a row in both clients**. 116 have no Forever row: 102 "missing", 6 seen in
game, 4 unchanged hotfix-only (Deepfury Bracers, Flurry Axe, Widowmaker, Serathil) and 4 changed
hotfix-only (Stonegrip Gauntlets, Boots of Avoidance, Smoking Heart of the Mountain, Ardent
Custodian).

### Open questions

- `[?]` **Shield block value in Forever.** The client ships no `ShieldBlockRegular` table and no
  per-shield block value. Does the server give shields an innate block value, and how much?
  In-game test: the character sheet's block value with and without a shield equipped.
- `[?]` **Caster-weapon DPS.** The 0.195-DPS-per-spell-power cut and "no extra spell power when
  the stats carry some" are fits to 7 and 1 items. A caster weapon's tooltip at another item
  level or quality would confirm them.
- `[?]` **Epic caster weapons' spell power.** The rule was fitted on Rare weapons; on an Epic it gives
  Mindfang, Sageclaw and Ironbark Staff +94 spell power (Classic Era: +30), which is most of the
  casters' pre-raid main-hand value (Mindfang alone is +41 to +55 DPS for a warlock,
  [warlock.md §7.3](../classes/warlock.md#73-gear)). In-game test: Mindfang's or Sageclaw's tooltip in
  game (its spell power line), or Ironbark Staff's.
- `[?]` **Hotfix-only rows.** 50 pool items (and all 16 no-row-anywhere items) exist only as
  server hotfixes, and the Undermine trinkets' cooldowns look hotfixed. The raw client files
  can't show these; wago.tools' documented API has no hotfix endpoint.
- `[?]` **Stat types** 92, 98, 103, 112–121 and 132 are unmapped (no pool item uses them). 83,
  84, 86, 90, 91, 96, 127, 131 and 135 are inferred from Classic Era rows.
- `[?]` **Round half.** No pool value lands on .5, so half-up and banker's rounding can't be
  told apart yet.

### What M1.5c-2 needed to know, and what it did

1. **Armor split:** Forever tooltips add stat-50 bonus armor to the white armor line. The
   dataset keeps `armor` and `bonusArmor` apart, and the engine sums both (Toughness multiplies
   `armor` only). Whether a bear-form armor multiplier applies to stat 50 stays open; the
   engine has no bear form yet.
2. **Hotfix-only items:** the 34 with a Classic Era row fall back to it, flagged (the 13
   changed ones lose their Forever changes); the 16 new items with no row leave the pool and are
   listed in `meta.noClientRow` (D17).
3. **Sets:** bonuses come from Forever's `ItemSetSpell` even when every piece falls back to
   Classic stats; all 102 pool sets now do.
4. **Shield block value:** the Classic innate value is kept as `classicShieldBlockValue`, out
   of `stats.blockValue`, pending the open question.
5. **Effects** are rendered from `Spell.Description_lang` by `lib/spell-text.mjs`: 500 of 504
   lines render cleanly, one is generated from its auras and three are empty in game too
   ([items.md](items.md#effect-and-set-bonus-text)).
6. `rangedAttackPower` is only extra ranged AP. Aura 52 is `crit`; no item or set bonus in the
   dataset carries `meleeCrit` any more (the engine adds both keys to melee crit anyway).

## Attribution

- **[wago.tools](https://wago.tools)** serves the raw client files and build lists this dataset
  is read from. It is credited with its official logo, per its
  [branding guidelines](https://wago.tools/branding), in the app's footer, the About sheet and
  the README (decision D16).
- **[WoWDBDefs](https://github.com/wowdev/WoWDBDefs)** and its contributors provide the table
  definitions (commit `2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e`) and the manifest of DB2
  FileDataIDs.
- The DB2 format description is the community's [wowdev.wiki](https://wowdev.wiki/DB2).
