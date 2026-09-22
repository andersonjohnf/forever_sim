# Items dataset (pre-raid pool)

`src/data/items/pre-bis.json` is the pre-raid gear pool for the gear picker. It holds every
equippable **Rare** item that has **required level 55–60 or item level 58+**, plus every item
on the curated **Classic Era pre-raid BiS lists** in
[`scripts/scrape/pre-raid-bis.json`](../../scripts/scrape/pre-raid-bis.json), whatever its
quality or level. Each item has structured, sim-ready stats parsed from its tooltip, the raw
tooltip lines, its drop source where the site knows one, and its place on those BiS lists. Interfaces are in
[`src/data/items/types.ts`](../../src/data/items/types.ts); the scraper is
[`scripts/scrape/items.mjs`](../../scripts/scrape/items.mjs).

| | |
| --- | --- |
| List page | <https://foreverchanges.pro/items?quality=3> (the level rule below is applied by the scraper) |
| BiS lists | [`scripts/scrape/pre-raid-bis.json`](../../scripts/scrape/pre-raid-bis.json), hand-curated from Wowhead's 2019–2021 WoW Classic guides (see [Pre-raid BiS lists](#pre-raid-bis-lists)) |
| Data files | [`/items/new.json`](https://foreverchanges.pro/items/new.json), [`changed.json`](https://foreverchanges.pro/items/changed.json), [`same.json`](https://foreverchanges.pro/items/same.json), [`missing.json`](https://foreverchanges.pro/items/missing.json), plus one [`/item/<id>`](https://foreverchanges.pro/item/12618) page per kept item |
| Forever build | `1.60.1.69913` (beta client, build date 2026-09-18) |
| Classic build | `1.15.9.69722` (Classic Era client) |
| Scraped | 2026-09-22, 21:37 UTC (`meta.scrapedAt`) |
| Size | 1,644 items, 102 item sets; 3.3 MB JSON (2.1 MB minified, 200 KB gzipped) |

## How the data was obtained

The `/items` page is rendered in the browser. Its component (chunk `3nxzx7lll09xi.js`) fetches
one static JSON file per tab, `` `/items/${locale === "en" ? "" : locale + "/"}${tab}.json` ``,
with these tab keys:

| Tab key | Site label | Our `tab` | Rows | Tooltip lines in the file |
| --- | --- | --- | --: | --- |
| `new` | New in Forever | `new` | 5,335 | `x` = Forever tooltip (7 rows are `t: "rebuilt"`, with `y` = the old Classic row) |
| `changed` | Changed | `changed` | 4,271 | `x` = Forever, `y` = Classic |
| `same` | Unchanged | `unchanged` | 9,813 | **none**. The tooltips are only on each `/item/<id>` page |
| `missing` | No Forever data yet | `missing` | 2,039 | `x` = the **Classic Era** tooltip (the Forever row is empty) |

`/items/unchanged.json` does not exist (404); the key is `same`. Every file carries
`{forever_build, classic_build, forever_build_date, shard: 200, sub, items}`. `sub` decodes
subclass ids (`sub[classId][subclassId]`). `shard` isn't used by the page. Compact item keys:
`i` id, `n` name, `q` quality, `l` item level, `r` required level (0 = none), `s` slot
label, `c` class id, `u` subclass id, `t` tab, `k` icon, `x`/`y` tooltip lines, `p` weapon
speed, `d` weapon DPS, `o` class restriction, `e` item-set id, `m` name in Classic, `z` old id
of a rebuilt item, `g` "row removed". Two-column tooltip lines are joined with a tab
(`"Two-Hand\tAxe"`, `"155 - 233 Damage\tSpeed 3.60"`).

For every kept item the scraper also fetches `/item/<id>` (allowed by robots.txt; listed in
<https://foreverchanges.pro/item/sitemap.xml>). The page is server-rendered and shows the
Classic Era and Forever tooltips side by side, plus a **Where it comes from** section. A
small built-in HTML parser reads both tooltips (`div.it-tip` > `div.it-line`; two `<span>`s
in one line become `"a\tb"`, matching the JSON) and the source list. Unchanged items take their
tooltips from the page. For every other item the page tooltips must equal the JSON lines, or
the run fails; only the 60 seen-in-game tooltips below are compared loosely.

Requests: 4 JSON files + 1,644 item pages, one at a time, ≥ 0.6 s apart, User-Agent
`forever_sim-scraper/0.1 (+https://github.com/andersonjohnf/forever_sim; one-time data
snapshot)`, cached in `.cache/scrape/items/` (git-ignored) with a `.meta.json` per file. The
script refuses `/api/`, `/spell/`, `/search` and `/admin` paths.

## Filter

**Decision (user, 2026-09-22):** the pool is every Rare, equippable item with required
level 55–60 **or** item level ≥ 58, including items with no required level. It keeps
Classic Era items that have no Forever data yet, using their Classic stats, flagged
`foreverData: false` / `statsFrom: "classic"`; the UI badges them. The list page alone
(`?quality=3&req=55-60`, 1,235 items) missed pre-raid staples, which require a lower level
or none at all.

**Decision (user, 2026-09-22):** "If there are some pre-raid BIS that aren't in our filter
they should be included too." Any quality, any level. Every item on the curated
[pre-raid BiS lists](#pre-raid-bis-lists) joins the pool. It must still be equippable and
still passes the SoD guard.

The rule, as recorded in `meta.filter.rule`:

```text
equippable AND ((quality in [3] AND (55 <= required level <= 60 OR item level >= 58 (any required level, including none))) OR listed in scripts/scrape/pre-raid-bis.json (any quality or level))
```

The constants at the top of the script:

```js
const QUALITIES = [3];              // 2 Uncommon, 3 Rare, 4 Epic, 5 Legendary
const REQ_LEVEL = [55, 60];         // inclusive; the list page's req=55-60
const MIN_ITEM_LEVEL = 58;          // or item level >= this, whatever the required level; null = off
const MAX_CLASSIC_ITEM_ID = 25000;  // SoD guard, see below
const EXCLUDED_ITEMS = new Map([...]);                     // unobtainable items, id → reason
const PRE_RAID_BIS_FILE = "scripts/scrape/pre-raid-bis.json"; // curated include list; null = off
const OUT_FILE = "src/data/items/pre-bis.json";
```

`meta.filter` stores `{ rule, qualities, reqLevel, minItemLevel, equippableOnly,
maxClassicItemId, excludedItemIds, includeList }`. The site encodes "no required level" as
`r: 0`, and `reqLevel` keeps that 0. No Rare row has item level ≥ 58 and a required level
above 60.

Equippable means: item class Weapon (2) or Armor (4), a slot label we map, and none of
cosmetic armor, "Miscellaneous" weapons or fishing poles. That keeps cloth/leather/mail/plate,
shields, cloaks, rings, necks, trinkets, held-in-off-hand items, relics (librams, idols,
totems), melee weapons, bows, guns, crossbows, thrown weapons and wands. Shirts, tabards, ammo
and bags are dropped.

1,888 rows match the level rule or the BiS lists across the four tabs, and **1,644** are
kept: 1,594 by the quality/level rule and **50 only because a BiS list names them**. The 244
dropped rows are two unobtainable test weapons (see Caveats) plus 124 recipes and books (40
class tomes, 34 Blacksmithing, 16 Enchanting, 16 Leatherworking, 14 Tailoring, …), 70 quest
items, 16 junk, 5 mounts, bags, ammo, keys and trade goods, and one cosmetic helm.

Still excluded: items on no BiS list that fail the rule. That means Rares below item level 58
that require less than level 55, and every Epic that isn't listed (Soulforge Breastplate and
the other Dungeon Set 2 chests, Brutality Blade, …). The lists already bring in Blackstone
Ring, Mask of the Unforgiven and Deathdealer Breastplate, which the rule misses.

### SoD guard: only Forever or original Classic Era items

The pool must hold only items that exist in Forever's data or are original Classic Era items,
**never Season of Discovery items**. The tabs make this checkable:

- **`new`** items exist only in the Forever client. In this pool their ids run
  **249385–284261**.
- **`changed`, `unchanged` and `missing`** rows come from the Classic Era client, which also
  ships later additions such as Season of Discovery items. The `same` tab holds 52 rows with
  ids from 122270 to 191666, most of them 19xxxx (for example 191312 Failsafe Phylactery,
  191481 Tabard of Mastery, "Book of Deathstones" recipes). None is a Rare equippable, so
  none would pass the filter today. Original Classic item ids end around 24300.

So the scraper asserts that **every kept item outside the `new` tab has an id below
`MAX_CLASSIC_ITEM_ID` = 25000**. If one doesn't, it prints the offending ids and exits
non-zero before writing anything. Tested by lowering the bound to 20000: it listed 398
items and exited 1. The highest non-new id in the pool is 23319 (Lieutenant Commander's Silk
Mantle). The guard applies to BiS-listed items too. All 159 listed ids are original Classic
ids (highest 23315), and none is in the `new` tab.

## "No Forever data yet" items (doctrine §2, [D6](../decisions.md))

The Forever beta client keeps a row for these Classic items but no stats; the server sends
stats when a player meets the item. All **650** are kept with `foreverData: false`,
`statsFrom: "classic"`, `tooltip.forever: null`, and every stat parsed from the Classic Era
tooltip (`tooltip.classic`). The site gives two reasons:

- **397 items**: "Not seen in the beta yet … Forever reviewed every dungeon's loot, so expect
  it to change." These are Classic dungeon drops, and all 397 have a `source`. Hand of Justice
  is one.
- **253 items**: "No Forever data yet: … our game has not received it from the server yet."
  These are mostly Zul'Gurub and Ruins of Ahn'Qiraj loot, Silithus (Abyssal) and
  Scourge-invasion rewards, PvP gear, quest rewards such as Blackhand's Breadth and Mark of
  Fordring, and world drops such as Cloudkeeper Legplates. The site gives them no source.

Most Classic pre-raid staples are in this group. The beta is level-capped (the site's BiS
lists stop at level 20), so nobody has looted them yet. Show the flag in the UI wherever such
an item is equipped.

**Seen in game (`foreverSource: "seenInGame"`, 60 items).** These are 59 Dungeon Set 1
pieces (Valor, Lightforge, Wildheart, Beaststalker, The Elements, Shadowcraft, Magister's,
Devout, Dreadmist) and the Manual Crowd Pummeler. The beta client holds no stats for them either, but players recorded
them in game, so the site lists them as changed. The item page shows that copy without
`Equip:` prefixes, sell price, Use cooldowns or order. For three robes (Magister's, Devout, Dreadmist) it
also has no armor line; the JSON's `89 Armor` is kept and a note says so. All other items
with Forever data are `foreverSource: "client"`.

## Counts

By tab: **new 344 · changed 494 · unchanged 156 · missing 650**. Stats come from Forever for
994 items and from Classic Era for 650. By quality: 1,619 Rare, 19 Epic and 6 Uncommon. The
Epic and Uncommon items all come from the BiS lists.

| Why it's in the pool | Total | new | changed | unchanged | missing |
| --- | --: | --: | --: | --: | --: |
| Rule: required level 55–60 (the list page's range) | 1,234 | 301 | 343 | 109 | 481 |
| Rule: item level ≥ 58, required level 53–54 | 167 | 29 | 48 | 8 | 82 |
| Rule: item level ≥ 58, required level 1–52 | 5 | 3 | 1 | 1 | 0 |
| Rule: item level ≥ 58, **no** required level (`reqLevel: 0`) | **188** | 11 | 86 | 35 | 56 |
| **BiS list only** (fails the rule) | **50** | 0 | 16 | 3 | 31 |

The item-level rule adds **360 items**, **188 of them with no required level**. Of the 360,
222 have Forever stats, 138 use Classic ones, and 105 have a source. Typical additions:
Hand of Justice (req 53), 27 Dungeon Set 1 belts, gloves and boots (req 53–54), the
Dungeon Set 2 non-chest pieces (Soulforge, Deathmist, Darkmantle, Feralheart, …; no
requirement), both ranks of the Zul'Gurub class necks (Zandalarian Shadow Talisman, The Eye
of Zuldazar, …; no requirement), Mark of Fordring, Blackhand's Breadth, Omokk's Girth
Restrainer and Crown of Caer Darrow. The 50 BiS-only items are listed under
[Pre-raid BiS lists](#pre-raid-bis-lists).

| Slot (`slot`) | Total | new | changed | unchanged | missing | added by ilvl rule | BiS list only |
| --- | --: | --: | --: | --: | --: | --: | --: |
| head | 120 | 31 | 52 | 2 | 35 | 8 | 4 |
| neck | 67 | 7 | 19 | 17 | 24 | 32 | 2 |
| shoulder | 136 | 31 | 59 | 3 | 43 | 16 | 4 |
| back | 60 | 11 | 13 | 3 | 33 | 12 | 1 |
| chest | 131 | 32 | 60 | 4 | 35 | 10 | 6 |
| wrist | 108 | 31 | 13 | 27 | 37 | 16 | 3 |
| hands | 150 | 38 | 58 | 7 | 47 | 42 | 0 |
| waist | 148 | 39 | 42 | 27 | 40 | 41 | 1 |
| legs | 150 | 32 | 64 | 5 | 49 | 24 | 2 |
| feet | 157 | 38 | 58 | 11 | 50 | 36 | 2 |
| finger | 82 | 18 | 13 | 9 | 42 | 25 | 4 |
| trinket | 61 | 5 | 15 | 5 | 36 | 29 | 7 |
| twoHand | 74 | 8 | 11 | 6 | 49 | 21 | 5 |
| mainHand | 39 | 5 | 5 | 3 | 26 | 9 | 5 |
| oneHand | 58 | 2 | 7 | 12 | 37 | 9 | 3 |
| offHand (weapon) | 3 | 0 | 0 | 0 | 3 | 1 | 0 |
| shield | 23 | 2 | 0 | 2 | 19 | 9 | 1 |
| heldInOffHand | 21 | 3 | 1 | 2 | 15 | 9 | 0 |
| ranged | 35 | 1 | 4 | 7 | 23 | 11 | 0 |
| thrown | 2 | 0 | 0 | 1 | 1 | 0 | 0 |
| relic | 19 | 10 | 0 | 3 | 6 | 0 | 0 |

| Armor type (`armorType`) | Total | new | changed | unchanged | missing |
| --- | --: | --: | --: | --: | --: |
| cloth (includes all 60 cloaks) | 375 | 81 | 155 | 17 | 122 |
| leather | 287 | 72 | 103 | 22 | 90 |
| mail | 252 | 72 | 76 | 30 | 74 |
| plate | 246 | 58 | 85 | 20 | 83 |

Other armor-class items: 82 rings, 67 necks, 61 trinkets, 23 shields, 21 held-in-off-hand,
7 idols, 6 librams, 6 totems.

| Weapon type (`weaponType`) | Total | Slots | new / changed / unchanged / missing |
| --- | --: | --- | --- |
| mace | 46 | 12 one-hand, 17 main hand, 17 two-hand | 3 / 7 / 4 / 32 |
| sword | 35 | 15 one-hand, 9 main hand, 1 off hand, 10 two-hand | 1 / 5 / 4 / 25 |
| dagger | 27 | 17 one-hand, 9 main hand, 1 off hand | 2 / 3 / 6 / 16 |
| axe | 26 | 11 one-hand, 2 main hand, 13 two-hand | 4 / 3 / 3 / 16 |
| staff | 20 | two-hand | 1 / 4 / 1 / 14 |
| polearm | 14 | two-hand | 3 / 1 / 2 / 8 |
| wand | 13 | ranged | 1 / 1 / 2 / 9 |
| bow | 11 | ranged | 0 / 0 / 4 / 7 |
| fist | 6 | 3 one-hand, 2 main hand, 1 off hand | 1 / 0 / 1 / 4 |
| gun | 6 | ranged | 0 / 2 / 0 / 4 |
| crossbow | 5 | ranged | 0 / 1 / 1 / 3 |
| thrown | 2 | thrown | 0 / 0 / 1 / 1 |

Of the 344 new items, 246 are the class-restricted **"Premier …"** set pieces (item level 60,
required level 55, BoP; the site gives no source). The rest include reputation gear
(Darkspear Raiders, Theramore Expeditionary Force, The Watchers: 24 new items need a
reputation, 54 across the pool), the Undermine engineering trinkets (Adaptive Combat
Assistant, Weakness Analyzer, …), Watcher's Signets and new relics.

## Schema summary

```text
ItemData
  meta   { source, dataFiles[], scrapedAt, foreverBuild, classicBuild, foreverBuildDate, scraper,
           filter { rule, qualities, reqLevel, minItemLevel, equippableOnly, maxClassicItemId,
                    excludedItemIds, includeList },
           counts { items, byTab, sets },
           preRaidBis { file, specs { [spec]: { name, source { title, url, archivedUrl, snapshot }, note? } },
                        listedItems, inPool, addedByList, notInData[] },
           parseCoverage { lines, structured, verbatim, unparsed }, ratingConversions }
  sets   { [setId]: { name, size, itemIds[], bonuses[{ pieces, text, parsed?, weaponSkill? }], bonusesFrom } }
  items[] sorted by slot (head … relic), then id

Item
  id, name, icon, quality, itemLevel, reqLevel (0 = none), tab, rebuiltFromId, classicName
  foreverData, foreverSource ("client" | "seenInGame" | null), statsFrom ("forever" | "classic")
  slot, equipSlots[], itemClass, itemSubclass, armorType, weaponType
  binding ("BoP" | "BoE" | …), unique, uniqueEquipped { group, max }, classes[], requirements[]
  stats        Partial<Stats>, flat numbers (see below)
  weapon       { min, max, speed, dps, school, skill, extraDamage? } | null
  weaponSkill  { "Daggers": 5, … } | null
  procs[], useEffects[{ raw, cooldownSec? }], otherEquip[]     // verbatim lines
  setId, source (SourceGroup[] | null), sellPrice (copper), flavor
  preRaidBis   [{ spec, slot, rank }]                   // [] when on no list
  classic      { stats, weapon, weaponSkill } | null    // Classic values of changed items
  notes[], unparsed[], tooltip { forever, classic }     // raw lines
```

- **`slot`** is the tooltip's slot, normalized: `twoHand`, `mainHand`, `oneHand`, `offHand`
  (off-hand weapon), `shield`, `heldInOffHand`, `ranged`, `thrown`, `relic`, and the armor
  slots. **`equipSlots`** is where it can be worn: one-hand → `["mainHand", "offHand"]`,
  shield/held-in-off-hand → `["offHand"]`, thrown/relic → `["ranged"]` (relics use the ranged
  slot in Classic). `finger` and `trinket` each stand for two paperdoll slots.
- **`weapon.skill`** is the weapon skill the weapon uses (`"Swords"`, `"Two-Handed Axes"`, …),
  so `weaponSkill` bonuses can be matched to it.
- **`classic`** is set for changed items only. For unchanged items `tooltip.classic` equals
  `tooltip.forever`; for new items it is null.
- **Sets:** `itemIds` lists every id the site files under the set id, in any tab, quality or
  level. `bonuses` come from a Forever tooltip if any kept piece has one (89 sets), else
  Classic (13). Each bonus keeps its text; `parsed` is present when the whole bonus is a stat
  (215 of 296 bonuses).

## Parsing

`parseTooltip` classifies every line of the stat-source tooltip (Forever, or Classic when
there is no Forever data):

| | Lines | Share |
| --- | --: | --: |
| Structured: turned into fields or stats | 15,166 | 95.8% |
| Verbatim: kept in `procs`, `useEffects`, `otherEquip` or a set bonus without stats | 671 | 4.2% |
| Unparsed (`unparsed[]`) | **0** | 0% |
| Total | 15,837 | |

Structured lines: binding, Unique / Unique-Equipped, slot + type, weapon damage + speed, DPS,
extra elemental damage (`+1 - 5 Frost Damage`), armor, primary stats, resistances,
`Classes:`, `Races:`, required level, reputation/skill requirements, sell price, flavor text,
set name `(0/N)`, set bonuses that are stats, and `Equip:` lines matching a stat rule.

Stat rules cover both wordings:

| Stat key | Classic Era wording | Forever wording |
| --- | --- | --- |
| `crit`, `meleeCrit`, `spellCrit` | Improves your chance to get a critical strike [with melee attacks / with spells] by N% | `critRating`: +N Critical Strike Rating |
| `hit`, `spellHit` | Improves your chance to hit [with spells] by N% | `hitRating`: +N Hit Rating |
| `dodge`, `parry`, `block` | Increases your chance to dodge / parry an attack / block attacks with a shield by N% | `dodgeRating`, `parryRating`, `blockRating` |
| `defense` | Increased Defense +N | `defenseRating`: +N Defense Rating |
| `blockValue` | Increases the block value of your shield by N | +N Block Value |
| `attackPower`, `rangedAttackPower` | +N Attack Power / +N ranged Attack Power | same, without the period |
| `feralAttackPower` | +N Attack Power in Cat, Bear, and Dire Bear forms only | same |
| `attackPowerVs<Type>` | +N Attack Power when fighting Undead | +N Attack Power Vs Undead |
| `spellPower` (damage + healing) | Increases damage and healing done by magical spells and effects by up to N | +N Spell Power |
| `healing` / `spellDamage` | Increases healing done by spells and effects by up to N; "healing by up to N and damage by up to M" | +N Healing / +N Spell Damage |
| `<school>SpellDamage`, `spellDamageVs<Type>` | Increases damage done by Shadow spells … / to Undead by magical spells … | +N Shadow Spell Damage / +N Spell Damage Vs Undead |
| `mp5` | Restores N mana per 5 sec | +N Mana Regeneration |
| `hp5` / `healthRegen` | Restores N health per 5 sec | +N Health Regeneration (separate key, see below) |
| `spellPenetration` | Decreases the magical resistances of your spell targets by N | +N Spell Penetration |
| resistances | +N Fire Resistance; +N All Resistances (split into the five schools) | +N Spell Resistance (= all five) |
| `weaponSkill` | Increased Swords +7 | +N Daggers Skill |
| `expertiseRating`, `hasteRating`, `armorPenetration`, `weaponDamage`, `bonusArmor` | – | +N Expertise Rating, … |

Equip lines that aren't flat stats are kept verbatim:

- **`procs` (58):** "Chance on hit:" lines, plus Equip lines that fire on an event: "Chance
  …", "N% chance on melee hit …" (Hand of Justice), "When struck in combat …", "… every time
  you block", "… when you are the victim of a critical melee strike".
- **`useEffects` (39):** "Use:" lines, with `cooldownSec`.
- **`otherEquip` (109):** the rest. The most common are "Run speed increased slightly" (14),
  stealth detection (11), Ghost Wolf speed (8), Mana Shield absorb (6), Hamstring rage cost
  (6), anti-interrupt for Searing Pain / Mind Blast (6 each), Sprint duration (6) and
  Multi-Shot damage (4). The others are class-ability tweaks, including Wolfshead Helm's (see
  [Pre-raid BiS lists](#pre-raid-bis-lists)).

81 set bonuses stay text only (procs, cooldown and ability tweaks). A stray "(N Min
Cooldown)" on a few Classic Equip lines is ignored.

**No item in this pool has feral attack power.** The rule is tested, but no Rare item in
either client has it, and none of the curated BiS lists names one. Only raid epics and
legendaries such as Hammer of Bestial Fury and Atiesh have it.

## Forever's ratings `[F]`, with open questions

The Forever client rewrites Classic's percentage bonuses as ratings. `meta.ratingConversions`
measures this: for changed items (all 4,271, any quality) whose Classic tooltip has exactly
one of the old stats and whose Forever tooltip has the rating instead, it tallies rating ÷
old value.

| Rating | Replaces | Rating per unit | Samples (other ratios) |
| --- | --- | --: | --- |
| `critRating` | melee, ranged **and** spell crit | 14 per 1% | 349 |
| `hitRating` | melee **and** spell hit | 10 per 1% | 152 (7 ×1) |
| `dodgeRating` | dodge | 12 per 1% | 46 |
| `parryRating` | parry | 15 per 1% | 7 (21 ×1) |
| `blockRating` | shield block chance | 5 per 1% | 11 |
| `defenseRating` | Defense skill | 1 per point | 69 (1.25 ×1) |

These are tooltip ratios, not measured combat values. Open questions:

- `[?]` Do these ratios hold in combat at level 60? Does 14 rating give exactly 1% crit
  against a level-63 boss? One crit rating stat covers melee and spell crit, and one hit
  rating stat covers melee and spell hit. Test on the beta.
- `[?]` Is 1 Defense Rating worth 1 Defense skill in game? The tooltips map 1:1.
- `[?]` **Expertise Rating** is new. It replaced weapon skill on two low-level items at
  inconsistent ratios: Dwarven Tree Chopper "+6 Expertise Rating" for "Increased Two-handed
  Axes +2", and Servomechanic Sledgehammer "+10" for "Two-handed Maces +7". What it does in
  combat is unknown. In the pool it appears on the Adaptive Combat Assistant trinket (+20)
  and two Stalwart Watcher's Signets (+10).
- `[?]` **Health Regeneration** replaced "Restores N health per 5 sec" at inconsistent ratios
  (1.2× to 4.5×), so its unit is unknown. It is kept as `healthRegen`, separate from `hp5`.
- **Spell power split:** "Spell Power" is damage and healing. Healing items now read
  "+N Healing" plus "+N Spell Damage" at about a third of it (Whitesoul Helm: +35 Healing,
  +12 Spell Damage).

## How heavily Forever re-itemized the pool

Of the 1,300 Classic items in the pool, 156 read the same, 494 changed, and 650 have no
Forever data yet. Comparing each changed item's Forever stats with its Classic stats, with
percentages converted by the ratios above:

- **220** differ only in wording: ratings instead of percentages, "Spell Power" instead of
  "damage and healing", "Mana Regeneration" instead of "mana per 5 sec". The numbers are
  equivalent.
- **202** have real stat changes: armor on 71 (for example, Whitesoul Helm 509 → 629 and the
  Champion's/Lieutenant Commander's helms +40 to +80); primary stats on 72 (21 lost Spirit,
  often for Spell Power); secondary stats on 108 (new +Spell Damage on healing gear, +Spell
  Power on caster pieces); weapon damage ranges on 13. Whiteout and Crackling Staff drop from
  55.6 to 41.3 DPS, and Shivsprocket's Shiv, Simone's Cultivating Hammer and Verimonde's Last
  Resort from about 43 to about 28. The Unstoppable Force's range drops from 175–292 to
  166–277 at the same DPS. The others move by at most 0.2 DPS.
- **72** changed other text only: set bonus wording and values (Stormshroud's proc chances
  doubled, the "(4) Set" defensive procs gained a chance and an internal cooldown), and
  effect descriptions.

Forever also adds 344 new items to the pool. Some mix stats in unusual ways: 16 new
plate/mail pieces and 2 two-handed axes (Stormcarver, Icesworn Decapitator) carry both
Strength and Spell Power, which matters for Retribution and Protection paladins.

## Sources

The item page's **Where it comes from** is structured (`section.it-from` > `h3` +
`li` > boss link / dungeon / chance). `source` has it verbatim as `SourceGroup[]`:

- 465 items have one: 405 "Dungeon drop, in Classic" and 60 "Dungeon drop" (the
  seen-in-game items), with 702 boss entries in all. Every chance is labelled "Drop chance in
  Classic". By dungeon: Scholomance 264 entries, Stratholme Service Gate 72, LBRS 68, UBRS
  67, Stratholme Main Gate 67, Dire Maul North 47, BRD 45, Dire Maul West 41, Dire Maul East
  27, Sunken Temple 2, Maraudon 1, Gnomeregan 1.
- **1,179 items have none (`source: null`).** That includes every new item, and every
  crafted, quest, reputation, vendor, PvP and world-drop item, including Blackhand's Breadth
  and Mark of Fordring. The site lists only dungeon boss drops. For crafting, quest and
  vendor sources, use the tooltip (`requirements` shows reputation standings) or record them
  by hand in the engine's override layer.
- The `/dungeons/<slug>` pages ("bosses and loot tables") show the same Classic boss loot.
  Forever's two new level-55+ dungeons, Blackmaw Hold (55–60) and Shaper's Terrace (58–60),
  show **0 drops** as of 2026-09-19, and Classic dungeons carry the banner "Nobody has seen
  these drops in the beta yet: the stats and chances are Classic's for now." Treat every
  drop chance as `[C]`.

## Pre-raid BiS lists

**Decision (user, 2026-09-22):** "If there are some pre-raid BIS that aren't in our filter
they should be included too." Any quality, any level. The lists live in
[`scripts/scrape/pre-raid-bis.json`](../../scripts/scrape/pre-raid-bis.json). That file is
hand-authored scraper input, and its `$comment` header repeats the rules below. The scraper
adds every listed item to the pool (it must still be equippable and pass the SoD guard) and
annotates **every** pool item with `preRaidBis: [{ spec, slot, rank }]` (`[]` if unlisted).
`meta.preRaidBis` carries each spec's name and source.

### Sources `[C]`

"Pre-raid" here means gear from dungeons (Dire Maul, LBRS/UBRS, Stratholme, Scholomance, BRD
and the rest), crafting, quests, reputation, world drops and BoEs, and PvP ranks up to Rank
10. Raid drops (Molten Core, Onyxia, Zul'Gurub, AQ20, BWL and later) are left out. Doctrine §2
allows only Classic Era guides, so every list comes from **Wowhead's WoW Classic pre-raid BiS
guides as they stood in 2021, before Season of Mastery and TBC Classic**. The live pages on
the same topics (for example
[the current Warrior Tank guide](https://www.wowhead.com/classic/guide/warrior-tank-pre-raid-best-in-slot-bis-gear-wow-classic))
have been rewritten for **Season of Mastery**: they open "…Pre-Raid Best in Slot Gear list for
Protection Warrior Tank in WoW Classic Season of Mastery". So they aren't used, and the
Wayback Machine copies are cited instead. Wowhead's Season of Discovery guides (under
`/classic/guide/season-of-discovery/…`) weren't used either.

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
trinket keep four, since two are worn. With one guide per spec there were no disagreements
to merge. The guides link Horde PvP items; each one's Alliance counterpart (Knight-Captain's /
Lieutenant Commander's / Knight-Lieutenant's …) is added at the same rank, as is the
Frostwolf twin of Stormpike Insignia Rank 6. Slot keys are the paperdoll slots plus
`twoHand` and `relic`; tanks' shields are under `offHand`.

### Coverage

159 distinct items are listed. **All 159 are in the site's data and in the pool**:
`meta.preRaidBis.notInData` is empty, and no listed row carries the "row removed" flag.
**50** of them are in the pool only because of the lists: 6 Uncommon, 25 Rare and 19 Epic.
Examples are Lionheart Helm, Savage Gladiator Chain, Ironfoe, Blackblade of Shahram, The
Unstoppable Force, Don Julio's Band, Cloudkeeper Legplates, Breastplate of Bloodthirst,
Warden Staff and Myrmidon's Signet (Epic); Wolfshead Helm (ilvl 45), Manual Crowd Pummeler
(ilvl 34), Widowmaker, Blackstone Ring, Mask of the Unforgiven and Diamond Flask (Rare); and
Rune of the Guard Captain, Mark of the Chosen and Wyrmhide Spaulders (Uncommon).

| Spec | Items | Items per slot | new | changed | unchanged | no Forever data | Rank-1 items without Forever data |
| --- | --: | --- | --: | --: | --: | --: | --- |
| `warrior-fury` | 50 | head 4, neck 3, shoulder 4, back 3, chest 4, wrist 3, hands 4, waist 2, legs 4, feet 4, finger 4, trinket 4, mainHand 2, offHand 3, ranged 2 | 0 | 13 | 4 | 33 | 9 of 17: Mark of Fordring, Cape of the Black Baron, Savage Gladiator Chain, Battleborn Armbraces, Brigam Girdle, Hand of Justice, Ironfoe, Mirah's Song, Satyr's Bow |
| `warrior-arms` | 48 | as Fury, with twoHand 3 instead of mainHand/offHand | 0 | 14 | 4 | 30 | 8 of 16: as Fury, with Blackblade of Shahram instead of Ironfoe and Mirah's Song |
| `warrior-protection` | 50 | head 3, neck 2, shoulder 4, back 3, chest 4, wrist 3, hands 3, waist 3, legs 4, feet 4, finger 4, trinket 4, mainHand 3, offHand 3, ranged 3 | 0 | 11 | 4 | 35 | 9 of 18: Medallion of Grand Marshal Morris, Stoneskin Gargoyle Cape, Boneclenched Gauntlets, Brigam Girdle, Cloudkeeper Legplates, Hand of Justice, Mirah's Song, Draconian Deflector, Satyr's Bow |
| `druid-feral-cat` | 39 | head 3, neck 3, shoulder 2, back 3, chest 3, wrist 3, hands 1, waist 2, legs 1, feet 2, finger 4, trinket 4, twoHand 3, mainHand 3, offHand 1, relic 1 | 0 | 8 | 2 | 29 | 10 of 16: Mark of Fordring, Truestrike Shoulders, Cape of the Black Baron, Cadaverous Armor, Blackmist Armguards, Cloudrunner Girdle, Swiftwalker Boots, Counterattack Lodestone, Tome of Knowledge, Idol of Brutality |
| `druid-feral-bear` | 50 | head 4, neck 2, shoulder 4, back 4, chest 3, wrist 4, hands 4, waist 2, legs 4, feet 3, finger 4, trinket 4, twoHand 3, mainHand 3, offHand 1, relic 1 | 0 | 19 | 3 | 28 | 13 of 17, including Breastplate of Bloodthirst, Warstrife Leggings, Warden Staff, Tome of Knowledge and Idol of Brutality |
| `paladin-retribution` | 36 | head 3, neck 3, shoulder 2, back 3, chest 3, wrist 3, hands 2, waist 2, legs 2, feet 3, finger 4, trinket 2, twoHand 3, relic 1 | 0 | 6 | 0 | 30 | 10 of 14: Mark of Fordring, Truestrike Shoulders, Cape of the Black Baron, Savage Gladiator Chain, Battleborn Armbraces, Brigam Girdle, Bloodmail Boots, Hand of Justice, Blackblade of Shahram, Libram of Hope |
| `paladin-protection` | 46 | head 3, neck 3, shoulder 3, back 4, chest 3, wrist 3, hands 3, waist 3, legs 3, feet 3, finger 4, trinket 5, mainHand 3, offHand 3 | 0 | 14 | 2 | 30 | 12 of 14, including the whole Deathbone set, Naglering, Force of Will and Draconian Deflector |

Across the 159 listed items: **0 new, 44 changed, 12 unchanged, 103 with no Forever data**.
Of those 103, 79 are "not seen in the beta yet" dungeon drops and 24 have no Forever data at
all (quest rewards, world drops, PvP). Six are seen-in-game Forever copies: five Dungeon Set 1
pieces and the Manual Crowd Pummeler.

**Listed items that Forever changed**, beyond rating wording (tooltips `[F]`):

- **Wolfshead Helm:** its Classic effect, "+20 energy on shifting to Cat, +5 rage on shifting
  to Bear" (the powershifting bonus), is replaced by "+5 Rage from Enrage and +20 Energy from
  Tiger's Fury".
- **Manual Crowd Pummeler** (seen in game): now **Unique**, and its Use (+50% attack speed
  for 30 sec) shows a 3-minute cooldown.
- **Rune of the Guard Captain:** +20 Attack Power and 1% hit become "+14 Attack Power (tripled
  in Forest and Grassland areas)" and +7 Hit Rating.
- **Smoking Heart of the Mountain:** loses its 150 armor and Unique flag, and gains "Use:
  Increases armor by 520 for 20 sec (6 Min Cooldown)".
- **Warbear Harness:** gains +18 Agility.
- **The Unstoppable Force:** 175–292 becomes 166–277 damage, at about the same DPS (61.5).
- **Stormpike / Frostwolf Insignia Rank 6:** 2% dodge and 8 health per 5 sec become +24
  Dodge Rating and +30 Health Regeneration.
- **Blood Guard's / Knight-Lieutenant's Dragonhide Grips:** the Forever tooltip no longer
  shows the Champion's / Lieutenant Commander's Refuge set lines.
- **Lightforge Bracers and Lightforge Belt** (seen in game): stats reshuffled (Spirit swapped
  for Intellect, or for Spell Power and Hit Rating).
- The PvP armor gains armor (Champion's Dragonhide pieces +40 to +60, Sergeant's Cape 45 →
  115). Lionheart Helm, Devilsaur, Don Julio's Band, Enchanted Thorium and the other plate
  pieces only change wording: crit, hit, dodge and defense become ratings.

### Forever caveat

These are **Classic Era** lists. Forever re-itemized many of these items (ratings, stat
and effect changes above) and has no data at all for most of the rest. It also added
level-55+ dungeons (Blackmaw Hold, Shaper's Terrace) with no recorded drops yet, and 344 new
items in this pool that no Classic guide knows. **Forever's real pre-raid BiS will differ.**
Treat `rank` as a Classic starting point for default gear sets, not a Forever ranking, and
let the sim decide.

foreverchanges.pro's own BiS lists ([`/bis/warrior`](https://foreverchanges.pro/bis/warrior),
[`/bis/druid`](https://foreverchanges.pro/bis/druid),
[`/bis/paladin`](https://foreverchanges.pro/bis/paladin), and `/pve`, `/tank` variants) are
"best in slot at level 20" lists for the level-capped beta (checked 2026-09-22), so nothing
was taken from them. **Revisit them on every re-scrape.** Once they cover level 60 they are a
tier-1 source and should replace or extend this file.

## Validation

The run exits non-zero, and writes nothing, if:

- the SoD guard trips (a non-`new` item with id ≥ 25000);
- any JSON tooltip differs from the item page (seen-in-game tooltips are compared loosely);
- an unchanged item's Forever and Classic page tooltips differ;
- the tab files disagree on builds, or an id is in two tabs;
- a weapon has no damage line, a set has no name, or a stat key isn't in `STAT_KEYS`
  (which mirrors `Stats` in `types.ts`);
- a `pre-raid-bis.json` entry is malformed, or its name differs from the site's name for that
  id.

A listed item that is in none of the four tab files (so neither client has it) is reported as
a warning and recorded in `meta.preRaidBis.notInData`. It does not fail the run; there are
none today. A listed item that isn't equippable or is in `EXCLUDED_ITEMS` is reported and left
out.

It warns if the tooltip's required level, slot, class or weapon speed/DPS disagree with the
JSON row. None did. The one warning in this snapshot: set 361 "Champion's Pursuit" is 6
pieces in the tooltip, but the site files 7 ids under it (the six new "Premier Chain" pieces
plus Classic's Champion's Chain Headguard 16526).

Spot checks against the item pages, all matching:

| Item | Tab | Checked |
| --- | --- | --- |
| [Hand of Justice](https://foreverchanges.pro/item/11815) (req 53, added by the ilvl rule) | missing | ilvl 58, `reqLevel: 53`; Classic stats `attackPower: 20`; "2% chance on melee hit to gain 1 extra attack" in `procs`; Unique, BoP; source Emperor Dagran Thaurissan, BRD, 16% |
| [Blackhand's Breadth](https://foreverchanges.pro/item/13965) (no required level) | missing | ilvl 63, `reqLevel: 0`; Classic `crit: 2`; BoP; `source: null`; `foreverData: false` |
| [Mark of Fordring](https://foreverchanges.pro/item/15411) (no required level) | missing | ilvl 63, `reqLevel: 0`, neck; Classic `crit: 1`, `attackPower: 26`; `source: null` |
| [Enchanted Thorium Breastplate](https://foreverchanges.pro/item/12618) (plate chest) | changed | 657 armor, +26 Sta, +12 Str; Forever `defenseRating: 9` vs Classic `defense: 9`; BoE |
| [Dark Iron Reaver](https://foreverchanges.pro/item/17015) (1H sword) | changed | 71–134, 2.40, 42.7 DPS, `skill: "Swords"`; slot is One-Hand in Forever (Main Hand in Classic) |
| [Sword of Zeal](https://foreverchanges.pro/item/6622) (1H sword) | unchanged | tooltip from the page; 81–151, 2.80; proc kept verbatim |
| [Adaptive Combat Assistant](https://foreverchanges.pro/item/272437) (trinket with Use) | new | Unique-Equipped: Undermine Trinkets (1); +20 Expertise Rating; Use with `cooldownSec: 120` |
| [Ring of Fury](https://foreverchanges.pro/item/21477) (ring with hit) | changed | Forever `hitRating: 10` vs Classic `hit: 1`; +30 AP, +9 Sta; Unique |
| [Whitesoul Helm](https://foreverchanges.pro/item/12633) (stats changed) | changed | armor 509 → 629; +35 Healing plus new +12 Spell Damage |
| [Force of Will](https://foreverchanges.pro/item/11810) (no Forever data) | missing | Classic stats, `defense: 7`; source General Angerforge, BRD, 5.59% |
| [Iceblade Hacker](https://foreverchanges.pro/item/13952) (extra damage) | missing | 57–106 + 1–5 Frost `extraDamage`; source Ras Frostwhisper, Scholomance, 15% |
| [Magister's Robes](https://foreverchanges.pro/item/16688) (seen in game) | changed | set 181 with Forever bonuses; source "Dungeon drop", General Drakkisath 9.74% |
| [Wolfshead Helm](https://foreverchanges.pro/item/8345) (BiS list only, ilvl 45) | changed | +10 Spirit, 109 armor, Druid only; new Enrage/Tiger's Fury effect in `otherEquip`; `preRaidBis` feral cat head rank 1 |
| [Manual Crowd Pummeler](https://foreverchanges.pro/item/9449) (BiS list only, ilvl 34) | changed, seen in game | 46–70, 2.00, +16 Str, +5 Agi; Unique; Use `cooldownSec: 180`; source Crowd Pummeler 9-60, Gnomeregan, 33%; cat twoHand rank 1, bear rank 3 |
| [Savage Gladiator Chain](https://foreverchanges.pro/item/11726) (Epic, BiS list only) | missing | Classic stats `crit: 2`, 14 Agi, 13 Str, 13 Sta; set "The Gladiator" (5); source Gorosh the Dervish, BRD, 14%; chest rank 1 for Fury, Arms and Retribution, rank 2 for Protection Warrior |

Feral attack power could not be spot-checked: no item in the pool has it (see Parsing).

## Caveats

- **Tooltips, not server data.** The site computes Forever stat amounts, armor and weapon
  damage "from its item level budgets the way the game computes them". The server may still
  disagree. Guild measurements win (doctrine §2).
- **Excluded test items.** Bland Dagger (24071) and Bland Bow of Steadiness (20368) pass the
  filter but are Classic client test weapons ("This bow has no real variance"; both read
  "Damage set by hand" in Forever) and aren't obtainable. The scraper drops them through
  `EXCLUDED_ITEMS`, where every entry needs a reason, and records them in
  `meta.filter.excludedItemIds`. Add to that list rather than hiding items in the UI.
- `armorType` for cloaks is `"cloth"` (their item subclass); any class can wear them.
- `binding` is null for Assassin's Throwing Axe (21135), whose tooltip has no binding line.
- Set bonuses on Classic-only sets (12) may change once Forever data arrives, like the item
  stats.

## Re-running and widening the filter

```sh
npm run scrape:items                  # = node scripts/scrape/items.mjs (uses the cache)
npm run scrape:items -- --refresh     # re-fetch the 4 JSON files and all 1,644 item pages (~20 min)
git diff --stat src/data/items        # review what changed
```

A cached run is byte-for-byte reproducible. `scrapedAt` is the newest `fetchedAt` in the
cache metadata, not the clock. The run prints the filter, counts by tab, slot, armor and
weapon type, parse coverage, any unparsed line shapes, the most common verbatim lines, the
rating ratios, and per-spec BiS-list coverage by tab.

To add epics or change the level rule, edit `QUALITIES` / `REQ_LEVEL` / `MIN_ITEM_LEVEL`
(and `OUT_FILE` if the new set should be a separate file), then run it. To change the BiS
lists, edit `scripts/scrape/pre-raid-bis.json` by hand. Keep a source URL per spec, follow
the selection rules above, and never take a list from a Season of Discovery, Season of
Mastery, TBC+ or private-server guide. `meta.filter`
records the values used. Only item pages not yet cached are fetched. New tooltip wordings
show up in `unparsed[]` and in the run summary. Add a rule to `STAT_RULES` (stat bonuses) or
`LINE_RULES` (other lines), and add any new stat key to both `STAT_KEYS` and `Stats` in
`types.ts`.
