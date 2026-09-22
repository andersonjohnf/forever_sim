# Items dataset (pre-raid pool)

`src/data/items/pre-bis.json` is the pre-raid gear pool for the gear picker: every
equippable **Rare** item that has **required level 55–60 or item level 58+**. Each item has
structured, sim-ready stats parsed from its tooltip, the raw tooltip lines, and its drop
source where the site knows one. Interfaces are in
[`src/data/items/types.ts`](../../src/data/items/types.ts); the scraper is
[`scripts/scrape/items.mjs`](../../scripts/scrape/items.mjs).

| | |
| --- | --- |
| List page | <https://foreverchanges.pro/items?quality=3> (the level rule below is applied by the scraper) |
| Data files | [`/items/new.json`](https://foreverchanges.pro/items/new.json), [`changed.json`](https://foreverchanges.pro/items/changed.json), [`same.json`](https://foreverchanges.pro/items/same.json), [`missing.json`](https://foreverchanges.pro/items/missing.json), plus one [`/item/<id>`](https://foreverchanges.pro/item/12618) page per kept item |
| Forever build | `1.60.1.69913` (beta client, build date 2026-09-18) |
| Classic build | `1.15.9.69722` (Classic Era client) |
| Scraped | 2026-09-22, 21:15 UTC (`meta.scrapedAt`) |
| Size | 1,594 items, 101 item sets; 3.1 MB JSON (2.0 MB minified, 190 KB gzipped) |

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
the run fails; only the 57 seen-in-game tooltips below are compared loosely.

Requests: 4 JSON files + 1,594 item pages, one at a time, ≥ 0.6 s apart, User-Agent
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

The rule, as recorded in `meta.filter.rule`:

```text
quality in [3] AND equippable AND (55 <= required level <= 60 OR item level >= 58 (any required level, including none))
```

The constants at the top of the script:

```js
const QUALITIES = [3];              // 2 Uncommon, 3 Rare, 4 Epic, 5 Legendary
const REQ_LEVEL = [55, 60];         // inclusive; the list page's req=55-60
const MIN_ITEM_LEVEL = 58;          // or item level >= this, whatever the required level; null = off
const MAX_CLASSIC_ITEM_ID = 25000;  // SoD guard, see below
const OUT_FILE = "src/data/items/pre-bis.json";
```

`meta.filter` stores `{ rule, qualities, reqLevel, minItemLevel, equippableOnly, maxClassicItemId }`.
The site encodes "no required level" as `r: 0`, and `reqLevel` keeps that 0. No Rare row has
item level ≥ 58 and a required level above 60.

Equippable means: item class Weapon (2) or Armor (4), a slot label we map, and none of
cosmetic armor, "Miscellaneous" weapons or fishing poles. That keeps cloth/leather/mail/plate,
shields, cloaks, rings, necks, trinkets, held-in-off-hand items, relics (librams, idols,
totems), melee weapons, bows, guns, crossbows, thrown weapons and wands. Shirts, tabards, ammo
and bags are dropped.

1,838 Rare rows match the level rule across the four tabs, and 1,594 are kept. The 244
dropped rows are two unobtainable test weapons (see Caveats) plus 124 recipes and books (40 class tomes, 34 Blacksmithing, 16 Enchanting, 16
Leatherworking, 14 Tailoring, …), 70 quest items, 16 junk, 5 mounts, bags, ammo, keys and
trade goods, and one cosmetic helm.

Still excluded: Rares with item level below 58 *and* required level below 55, such as
Blackstone Ring (ilvl 54, req 49), Mask of the Unforgiven and Deathdealer Breastplate (ilvl
57, req 52). Epic pre-raid pieces (Soulforge Breastplate and the other Dungeon Set 2 chests,
Brutality Blade, …) need `QUALITIES = [3, 4]`.

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
Mantle).

## "No Forever data yet" items (doctrine §2, [D6](../decisions.md))

The Forever beta client keeps a row for these Classic items but no stats; the server sends
stats when a player meets the item. All **619** are kept with `foreverData: false`,
`statsFrom: "classic"`, `tooltip.forever: null`, and every stat parsed from the Classic Era
tooltip (`tooltip.classic`). The site gives two reasons:

- **378 items**: "Not seen in the beta yet … Forever reviewed every dungeon's loot, so expect
  it to change." These are Classic dungeon drops, and all 378 have a `source`. Hand of Justice
  is one.
- **241 items**: "No Forever data yet: … our game has not received it from the server yet."
  These are mostly Zul'Gurub and Ruins of Ahn'Qiraj loot, Silithus (Abyssal) and
  Scourge-invasion rewards, PvP gear and quest rewards such as Blackhand's Breadth and Mark of
  Fordring. The site gives them no source.

Most Classic pre-raid staples are in this group. The beta is level-capped (the site's BiS
lists stop at level 20), so nobody has looted them yet. Show the flag in the UI wherever such
an item is equipped.

**Seen in game (`foreverSource: "seenInGame"`, 57 items).** These are the Dungeon Set 1
pieces (Valor, Lightforge, Wildheart, Beaststalker, The Elements, Shadowcraft, Magister's,
Devout, Dreadmist). The beta client holds no stats for them either, but players recorded
them in game, so the site lists them as changed. The item page shows that copy without
`Equip:` prefixes, sell price or order. For three robes (Magister's, Devout, Dreadmist) it
also has no armor line; the JSON's `89 Armor` is kept and a note says so. All other items
with Forever data are `foreverSource: "client"`.

## Counts

By tab: **new 344 · changed 478 · unchanged 153 · missing 619**. Stats come from Forever for
975 items and from Classic Era for 619.

| Required level | Total | new | changed | unchanged | missing |
| --- | --: | --: | --: | --: | --: |
| 55–60 (the list page's range) | 1,234 | 301 | 343 | 109 | 481 |
| 53–54 | 167 | 29 | 48 | 8 | 82 |
| 1–52 | 5 | 3 | 1 | 1 | 0 |
| **none** (`reqLevel: 0`) | **188** | 11 | 86 | 35 | 56 |

The item-level rule added **360 items**, **188 of them with no required level**. Of the 360,
222 have Forever stats, 138 use Classic ones, and 105 have a source. Typical additions:
Hand of Justice (req 53), 27 Dungeon Set 1 belts, gloves and boots (req 53–54), the
Dungeon Set 2 non-chest pieces (Soulforge, Deathmist, Darkmantle, Feralheart, …; no
requirement), both ranks of the Zul'Gurub class necks (Zandalarian Shadow Talisman, The Eye
of Zuldazar, …; no requirement), Mark of Fordring, Blackhand's Breadth, Omokk's Girth
Restrainer and Crown of Caer Darrow.

| Slot (`slot`) | Total | new | changed | unchanged | missing | added by ilvl rule |
| --- | --: | --: | --: | --: | --: | --: |
| head | 116 | 31 | 50 | 2 | 33 | 8 |
| neck | 65 | 7 | 19 | 17 | 22 | 32 |
| shoulder | 132 | 31 | 59 | 3 | 39 | 16 |
| back | 59 | 11 | 13 | 3 | 32 | 12 |
| chest | 125 | 32 | 59 | 4 | 30 | 10 |
| wrist | 105 | 31 | 11 | 26 | 37 | 16 |
| hands | 150 | 38 | 58 | 7 | 47 | 42 |
| waist | 147 | 39 | 42 | 27 | 39 | 41 |
| legs | 148 | 32 | 64 | 5 | 47 | 24 |
| feet | 155 | 38 | 57 | 11 | 49 | 36 |
| finger | 78 | 18 | 11 | 9 | 40 | 25 |
| trinket | 54 | 5 | 10 | 5 | 34 | 29 |
| twoHand | 69 | 8 | 9 | 6 | 46 | 21 |
| mainHand | 34 | 5 | 4 | 3 | 22 | 9 |
| oneHand | 55 | 2 | 7 | 10 | 36 | 9 |
| offHand (weapon) | 3 | 0 | 0 | 0 | 3 | 1 |
| shield | 22 | 2 | 0 | 2 | 18 | 9 |
| heldInOffHand | 21 | 3 | 1 | 2 | 15 | 9 |
| ranged | 35 | 1 | 4 | 7 | 23 | 11 |
| thrown | 2 | 0 | 0 | 1 | 1 | 0 |
| relic | 19 | 10 | 0 | 3 | 6 | 0 |

| Armor type (`armorType`) | Total | new | changed | unchanged | missing |
| --- | --: | --: | --: | --: | --: |
| cloth (includes all 59 cloaks) | 374 | 81 | 155 | 17 | 121 |
| leather | 279 | 72 | 101 | 21 | 85 |
| mail | 250 | 72 | 76 | 30 | 72 |
| plate | 234 | 58 | 81 | 20 | 75 |

Other armor-class items: 78 rings, 65 necks, 54 trinkets, 22 shields, 21 held-in-off-hand,
7 idols, 6 librams, 6 totems.

| Weapon type (`weaponType`) | Total | Slots | new / changed / unchanged / missing |
| --- | --: | --- | --- |
| mace | 40 | 12 one-hand, 13 main hand, 15 two-hand | 3 / 4 / 4 / 29 |
| sword | 32 | 14 one-hand, 8 main hand, 1 off hand, 9 two-hand | 1 / 5 / 4 / 22 |
| dagger | 26 | 16 one-hand, 9 main hand, 1 off hand | 2 / 3 / 5 / 16 |
| axe | 24 | 10 one-hand, 2 main hand, 12 two-hand | 4 / 3 / 2 / 15 |
| staff | 19 | two-hand | 1 / 4 / 1 / 13 |
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
           filter { rule, qualities, reqLevel, minItemLevel, equippableOnly, maxClassicItemId },
           counts { items, byTab, sets }, parseCoverage { lines, structured, verbatim, unparsed },
           ratingConversions }
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
  Classic (12). Each bonus keeps its text; `parsed` is present when the whole bonus is a stat
  (211 of 292 bonuses).

## Parsing

`parseTooltip` classifies every line of the stat-source tooltip (Forever, or Classic when
there is no Forever data):

| | Lines | Share |
| --- | --: | --: |
| Structured: turned into fields or stats | 14,791 | 95.8% |
| Verbatim: kept in `procs`, `useEffects`, `otherEquip` or a set bonus without stats | 651 | 4.2% |
| Unparsed (`unparsed[]`) | **0** | 0% |
| Total | 15,442 | |

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

- **`procs` (51):** "Chance on hit:" lines, plus Equip lines that fire on an event: "Chance
  …", "N% chance on melee hit …" (Hand of Justice), "When struck in combat …", "… every time
  you block", "… when you are the victim of a critical melee strike".
- **`useEffects` (32):** "Use:" lines, with `cooldownSec`.
- **`otherEquip` (107):** the rest. The most common are "Run speed increased slightly" (14),
  stealth detection (11), Ghost Wolf speed (8), Mana Shield absorb (6), Hamstring rage cost
  (6), anti-interrupt for Searing Pain / Mind Blast (6 each), Sprint duration (6) and
  Multi-Shot damage (4). The others are class-ability tweaks.

81 set bonuses stay text only (procs, cooldown and ability tweaks). A stray "(N Min
Cooldown)" on a few Classic Equip lines is ignored.

**No item in this pool has feral attack power.** The rule is tested, but at this quality
neither client has a Rare item with it; only epic and legendary weapons such as Hammer of
Bestial Fury and Atiesh have it.

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

Of the 1,250 Classic items in the pool, 153 read the same, 478 changed, and 619 have no
Forever data yet. Comparing each changed item's Forever stats with its Classic stats, with
percentages converted by the ratios above:

- **215** differ only in wording: ratings instead of percentages, "Spell Power" instead of
  "damage and healing", "Mana Regeneration" instead of "mana per 5 sec". The numbers are
  equivalent.
- **194** have real stat changes: armor on 70 (for example, Whitesoul Helm 509 → 629 and the
  Champion's/Lieutenant Commander's helms +40 to +80); primary stats on 70 (20 lost Spirit,
  often for Spell Power); secondary stats on 104 (new +Spell Damage on healing gear, +Spell
  Power on caster pieces); weapon damage ranges on 12. Whiteout and Crackling Staff drop from
  55.6 to 41.3 DPS, and Shivsprocket's Shiv, Simone's Cultivating Hammer and Verimonde's Last
  Resort from about 43 to about 28. The others move by at most 0.2 DPS.
- **71** changed other text only: set bonus wording and values (Stormshroud's proc chances
  doubled, the "(4) Set" defensive procs gained a chance and an internal cooldown), and
  effect descriptions.

Forever also adds 344 new items to the pool. Some mix stats in unusual ways: 16 new
plate/mail pieces and 2 two-handed axes (Stormcarver, Icesworn Decapitator) carry both
Strength and Spell Power, which matters for Retribution and Protection paladins.

## Sources

The item page's **Where it comes from** is structured (`section.it-from` > `h3` +
`li` > boss link / dungeon / chance). `source` has it verbatim as `SourceGroup[]`:

- 443 items have one: 386 "Dungeon drop, in Classic" and 57 "Dungeon drop" (the
  seen-in-game Dungeon Set 1 pieces), with 676 boss entries in all. Every chance is labelled
  "Drop chance in Classic". By dungeon: Scholomance 262 entries, Stratholme Service Gate 72,
  LBRS 67, UBRS 65, Stratholme Main Gate 65, Dire Maul North 46, Dire Maul West 41, BRD 31,
  Dire Maul East 27.
- **1,153 items have none (`source: null`).** That includes every new item, and every
  crafted, quest, reputation, vendor, PvP and world-drop item, including Blackhand's Breadth
  and Mark of Fordring. The site lists only dungeon boss drops. For crafting, quest and
  vendor sources, use the tooltip (`requirements` shows reputation standings) or record them
  by hand in the engine's override layer.
- The `/dungeons/<slug>` pages ("bosses and loot tables") show the same Classic boss loot.
  Forever's two new level-55+ dungeons, Blackmaw Hold (55–60) and Shaper's Terrace (58–60),
  show **0 drops** as of 2026-09-19, and Classic dungeons carry the banner "Nobody has seen
  these drops in the beta yet: the stats and chances are Classic's for now." Treat every
  drop chance as `[C]`.

## BiS lists: level 20 only, skipped

<https://foreverchanges.pro/bis/warrior>, [`/bis/druid`](https://foreverchanges.pro/bis/druid)
and [`/bis/paladin`](https://foreverchanges.pro/bis/paladin) (and the `/pve`, `/tank`
variants such as [`/bis/warrior/pve`](https://foreverchanges.pro/bis/warrior/pve)) are
"best in slot at level 20" lists for the level-capped beta, with PvP/PvE/Tank tabs. They
have no level-60 lists, so nothing was saved to `src/data/bis/`. Default gear sets will
have to be picked from this pool. Re-check when the beta's level cap rises.

## Validation

The run exits non-zero, and writes nothing, if:

- the SoD guard trips (a non-`new` item with id ≥ 25000);
- any JSON tooltip differs from the item page (seen-in-game tooltips are compared loosely);
- an unchanged item's Forever and Classic page tooltips differ;
- the tab files disagree on builds, or an id is in two tabs;
- a weapon has no damage line, a set has no name, or a stat key isn't in `STAT_KEYS`
  (which mirrors `Stats` in `types.ts`).

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
npm run scrape:items -- --refresh     # re-fetch the 4 JSON files and all 1,594 item pages (~20 min)
git diff --stat src/data/items        # review what changed
```

A cached run is byte-for-byte reproducible. `scrapedAt` is the newest `fetchedAt` in the
cache metadata, not the clock. The run prints the filter, counts by tab, slot, armor and
weapon type, parse coverage, any unparsed line shapes, the most common verbatim lines, and
the rating ratios.

To add epics or change the level rule, edit `QUALITIES` / `REQ_LEVEL` / `MIN_ITEM_LEVEL`
(and `OUT_FILE` if the new set should be a separate file), then run it. `meta.filter`
records the values used. Only item pages not yet cached are fetched. New tooltip wordings
show up in `unparsed[]` and in the run summary. Add a rule to `STAT_RULES` (stat bonuses) or
`LINE_RULES` (other lines), and add any new stat key to both `STAT_KEYS` and `Stats` in
`types.ts`.
