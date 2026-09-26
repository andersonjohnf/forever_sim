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
| Forever build | `wow_classic_beta` `1.60.1.70009` (created on wago.tools 2026-09-24); 1.60.1.69913 until 2026-09-24 ([client.md § Re-running](client.md#re-running)) |
| Classic Era build | `wow_classic_era` `1.15.9.69722` (fallback rows and comparisons) |
| Definitions | WoWDBDefs commit [`2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e`](https://github.com/wowdev/WoWDBDefs/tree/2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e) |
| BiS lists | [`scripts/scrape/pre-raid-bis.json`](../../scripts/scrape/pre-raid-bis.json), hand-curated from Wowhead's 2019–2021 WoW Classic guides (see [Pre-raid BiS lists](#pre-raid-bis-lists)) |
| Scraped | 2026-09-23 01:16 UTC (`meta.scrapedAt`: the latest download time of the 43 Forever and 35 Classic Era files read) |
| Size | 1,629 items, 102 item sets; 2.1 MB JSON (1.4 MB minified, 101 KB gzipped) |

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
| `ItemEffect` (+ `ItemXItemEffect`), `SpellEffect`, `SpellName`, `SpellCooldowns`, `SpellCastingRequirements`, `SpellShapeshift`, `SpellEquippedItems` | use, equip and chance-on-hit spells; auras that are flat stats; area, form and weapon conditions |
| `Spell`, `SpellMisc`, `SpellDuration`, `SpellAuraOptions`, `SpellRadius`, `SpellRange`, `SpellTargetRestrictions`, `SpellDescriptionVariables`, `SpellXDescriptionVariables`, `SpellLevels` | effect and set-bonus text |
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
  OR (ammo or quiver AND quality in [1, 2, 3, 4] AND 40 <= required level <= 60)
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
const SUPPLIES = { qualities: [1, 2, 3, 4], reqLevel: [40, 60] };  // ammo and quivers, below
```

**Equippable** means item class Weapon (2) or Armor (4) with a paperdoll inventory type, and
none of cosmetic armor, "Miscellaneous" weapons or fishing poles. That keeps
cloth/leather/mail/plate, shields, cloaks, rings, necks, trinkets, held-in-off-hand items,
relics (librams, idols, totems), melee weapons, bows, guns, crossbows, thrown weapons and
wands, and the [ranged supplies](#ammo-and-quivers): arrows, bullets, quivers and ammo pouches.
Shirts, tabards and other bags are dropped.

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
249385–281637. All 158 BiS-listed ids are original Classic ids (highest 23315).

Checked against the foreverchanges pool: the client rule gives exactly its 328 surviving
`new` items, and every other kept item has a Classic Era row and an id below 25000.

## Items with no Forever data (D6)

**745 items have no Forever `ItemSparse` row** and use their Classic Era row:
`foreverData: false`, `foreverSource: null`, `statsFrom: "classic"`, `tab: "missing"`. The UI
badges them ("Classic stats"), and the engine lists them with each result. They are:

- **649** Classic items the beta client has never had data for: Classic dungeon drops "not
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

### Effects of fallback items

A fallback item has no Forever `ItemSparse` row, but the Forever client still has its `Item`
row, the item effects it links to it (`ItemXItemEffect` → `ItemEffect`) and the spells behind
them. Those are tier-1 data ([doctrine §2](../doctrine.md#2-where-numbers-come-from-non-negotiable)),
so a fallback item keeps `statsFrom: "classic"` and `foreverData: false` for its stats, armor,
weapon and set, and takes its effects from Forever wherever Forever has them
(`createFallbackContext` in `lib/item-stats.mjs`, review finding L5) `[F]`:

1. **Every spell the Forever client has is read from Forever's tables**: its auras (the stats
   an equip spell gives), cooldown, conditions, name and tooltip text. All 623 spells the 500
   fallback items with effects use are in the Forever client, so none is read from Classic Era
   (`meta.fallbackEffects`).
2. **When Forever links item effects to the item, they are its effects** (108 items): Forever's
   redesigns, such as Ironfoe's proc becoming an equip spell and Blackhand's Breadth's new use
   (1318944), and Forever's own equip stat spells (Blackhand's Breadth's +1% crit, 1318954). Otherwise (392 items) the Classic Era row's item effects stay, with their
   spells read from Forever.
3. **A Classic Era equip spell whose every aura is a stat stays, unless Forever's effects give
   one of its stats.** Forever moved most such bonuses into `ItemSparse` stats, which the client
   doesn't carry for these items, so dropping them would lose the stat: Hand of Justice keeps
   its +20 Attack Power (9331), which Forever doesn't link. Where Forever's effects give the same
   stat, Forever's value replaces Classic Era's (Blackhand's Breadth: +1% crit, not +2%).
4. **A Classic Era item effect whose `ItemEffect` row Forever links to the item with another
   spell is replaced**, whatever that spell gives (review finding RL2). The row is the same
   item effect, re-pointed: Mark of Tyranny's 99949 was the +1% dodge (13669) in Classic Era and
   is a Use (1287842, +620 maximum health for 15 s) in Forever, so the dodge goes.
5. An equip spell restricted to a weapon type (`SpellEquippedItems`, item class 2) is a
   conditional effect, not a flat stat: Forever's "Improves your chance to hit with ranged
   weapons" (1294769, 1301127) is bows, guns and crossbows only.

Each fallback item's `notes` say which applies ("Stats from Classic Era (no Forever ItemSparse
row); effects are the Forever client's item effects; spells … read from the Forever client"),
and every effect line and set bonus names its spell (`spellId`). Whether Forever's mix of
`ItemSparse` stats and effects matches this reading is an open question ([Caveats](#caveats)).

**Before and after** (the dataset of `be7bb9c` against the one review fix F2 generated; RL2
later took one more stat away, Mark of Tyranny's dodge, below). 13 items' stats moved:

| Item | Before (Classic Era spells) | After | Why |
| --- | --- | --- | --- |
| Blackhand's Breadth (13965) | +2% crit (7598) | **+1% crit** (1318954), and a use: "Marks your target, increasing your Critical Strike chance against them by 5% for 20 sec" (5 min) | Forever's item effects. It is in the Fury and Arms default gear |
| Seal of the Dawn (13209) | +81 Attack Power against Undead | **+78** | 23930 read from Forever |
| Rune of the Dawn (19812) | +48 spell damage against Undead | **+46** | 24198 read from Forever |
| Counterattack Lodestone (18537) | +22 Attack Power, +1% parry | +30 Attack Power, +30 against Mechanical, +1% parry, and a use (Magnetize) | Forever's +30 replaces the +22 (9332); the parry spell stays |
| Eye of the Beast (13968) | +2% spell crit | +1% spell crit, and a use (+7% spell hit for 20 sec) | Forever's item effects |
| Briarwood Reed (12930) | +29 spell power | +15 spell power (doubled in Marsh and Swamp areas) | Forever's item effects |
| Royal Seal of Eldre'Thalas (18467, 18471) | +23 spell power | +18 spell power, +18 spell damage against Demons | Forever's item effects |
| Fervent Helm, Fluctuating Cloak, Foresight Girdle, Ring of Demonic Potency, Milli's Shield | 7 / 4 / 5 / 6 / 4 health per 5 sec | 27 / 15 / 18 / 21 / 15 | the regeneration spells read from Forever (aura 161) |

87 items' effect lines changed. The ones a melee sim cares about:

| Item | Before | After |
| --- | --- | --- |
| Hand of Justice (11815) | Equip: 2% chance on melee hit to gain 1 extra attack. | Equip: 1% chance on Melee hit to gain 1 extra attack. Attacks against Dwarves are 3 times as likely to activate this effect. |
| Ironfoe (11684) | Chance on hit: Grants 2 extra attacks on your next swing. | Equip: Attacks have a chance to grant 2 extra attacks on your next swing. Attacks against Orcs are 2 times as likely to activate this effect. |
| Diamond Flask (20130) | Use: Restores 9 health every 5 sec and increases your Strength by 75. Lasts 1 min. (6 Min Cooldown) | Use: Restores 1120 Health over 5 sec. This healing is strongest at first. If finished, gain 20 Strength for 5 sec. (6 Min Cooldown). Since then it has left the pool, as a heal is no longer a damage trinket ([warrior Q30](../classes/warrior.md#9-open-questions)) |
| Mark of the Chosen (17774) | …increasing all stats by 25 for 1 min. | …increasing all stats by **21** for 1 min, with a 120 s internal cooldown (`ProcCategoryRecovery`, not in the text) |
| Bashguuder (13204), Rivenspike (13286) | …lowering it by 200. Can be applied up to 3 times. | …lowering it by **100**… |
| Blackhand Doomsaw (12583) | Wounds the target for 324 to 540 damage. | Delivers a fatal wound for 373 to 523 Physical damage. Deals 50% increased damage to targets below 25% health. |
| Savage Gladiator Chain (11726) | (none) | Equip: Reduces the hit chance of Fear effects against you by 4%. (its +2% crit stays: Forever gives no crit spell) |
| Ebon Hilt of Marduk (14576) | Chance on hit: …210 damage over 3 sec. | Chance on hit: …84 damage over 9 sec. Equip: Decreases all threat generated by 1%. |
| Heart of Wyrmthalak (22321) | …120 to 180 Fire damage. | Melee and Ranged attacks have a chance to deal 112 to 168 Fire damage. Deals 3 times as much damage to Orcs. |
| Mark of Tyranny (13966) | (none; +1% dodge) | Use: Increases maximum health by 620 for 15 sec. (5 min). F2 kept the +1% dodge; since RL2 it goes (rule 4: Forever re-pointed the item effect that gave it) |

Doombringer (13053) reads the same: Forever links it the same Shadow Bolt (18211, 125 to 275),
now read from Forever. The other changes are chance-on-hit numbers and durations of Classic
dungeon weapons (Gravestone War Axe, Demonfork, Skullforge Reaver, …), new Forever uses and
equips on trinkets and neck pieces (Eidolon Talisman, Smoking Heart of the Mountain, Vigilance
Charm, Mindtap Talisman, Flame Walkers, …) and class relics. `npm run diff:items -- --against=be7bb9c`
lists them all.

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

### Ammo and quivers

The hunter's ranged supplies (slice H2, [docs/classes/hunter.md](../classes/hunter.md#73-gear)) join
the pool by their own rule: every **Projectile** (item class 6: Arrow, subclass 2; Bullet, 3;
InventoryType 24) and every **Quiver** (class 11: Quiver, 2; Ammo Pouch, 3; InventoryType 18, a bag)
of quality Common to Epic with required level 40–60, under the same SoD guard, junk-name rule and D6
fallback as the rest. They go in their own gear slots, `ammo` and `quiver` (a hunter's only).

- **An arrow's or bullet's damage** is `ammo: { dps, projectile }`: its damage per second from
  `ItemDamageAmmo[item level].Quality[quality]` (both clients ship the table; Forever's `ItemSparse`
  has no damage fields), rounded to 0.001, and whether it's an arrow (bows and crossbows fire it) or a
  bullet (guns). Only ammo has the field.
- **A quiver's or ammo pouch's haste** is the stat `rangedAttackSpeed`, the % of its equip spell's
  aura 557 (13–15%). Its spell names a ranged weapon (`SpellEquippedItems`), which would make it a
  conditional equip effect; since aura 557 only ever speeds up a ranged weapon, a spell whose every
  aura is 557 counts as a flat stat.

19 items: 12 kinds of ammo (Thorium Headed Arrow and Thorium Shells, 17.715; Ice Threaded Arrow and
Bullet; Jagged Arrow, Accurate Slugs and Mithril Gyro-Shot; Doomshot, Rockshard Pellets and Miniature
Cannon Balls, which Forever has no row for; Forever's new epic Swiftfeather Arrow and Swiftstrike
Shot, 24.617) and 7 quivers and pouches (Quickdraw Quiver and Thick Leather Ammo Pouch 13%, Harpy Hide
Quiver, Gnoll Skin Bandolier and Ancient Sinew Wrapped Lamina 15%, Ribbly's Quiver and Bandolier 14%,
no Forever row). The Classic Era client's Season of Discovery ones (Sanguine, Soulfrost, Scarlet,
Searing, Dream Imbued) fail the SoD guard.

## Counts

By tab: **new 328 · changed 346 · unchanged 210 · missing 745**. Stats come from Forever for
884 items and from Classic Era for 745. By quality: 1,604 Rare, 19 Epic and 6 Uncommon; the
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
| **BiS list only** (fails the rule) | **49** | 0 | 10 | 0 | 39 |

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
| trinket | 61 | 5 | 14 | 5 | 37 | 6 |
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

Other armor-class items: 82 rings, 67 necks, 61 trinkets, 23 shields, 19 held-in-off-hand,
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
           ratingConversions, fallbackEffects { items, effectsFromForever, spells, spellsFromForever } }
  sets   { [setId]: { name, size, itemIds[], bonuses[{ pieces, spellId, text, parsed?, weaponSkill? }], bonusesFrom } }
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
  statSpellIds[]                                               // equip spells whose auras are in stats
  statEquip[{ raw, spellId, stats, weaponSkill? }]             // their rendered tooltip lines
  procs[{ raw, spellId, generated? }], useEffects[{ raw, spellId, cooldownSec?, generated? }],
  otherEquip[{ raw, spellId, generated? }]                     // rendered tooltip lines
  setId, source (always null), preRaidBis [{ spec, slot, rank }]
  sellPrice (copper), flavor, classic { stats, weapon, weaponSkill } | null
  classicShieldBlockValue?, notes[]
```

The browser build drops `classic`, `flavor`, `sellPrice`, `notes`, `statSpellIds` (not `statEquip`) and the bulky
`meta` blocks (`tables`, `descriptionCoverage`, `preRaidBis`, `noClientRow`, `fallbackEffects`);
see `SLIMMERS` in `vite.config.ts`. `src/data/client/spells.json` extracts every spell the pool
names (`statSpellIds`, the effect lines' and set bonuses' `spellId`), so the Forever values
behind any line can be read there.

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
| `procs`, `useEffects`, `otherEquip` | `ItemEffect` spells, text [below](#effect-and-set-bonus-text); fallback items' come from Forever where it has them ([above](#effects-of-fallback-items)) |
| `statSpellIds` | the equip spells whose auras are part of `stats` ([below](#stats-armor-and-block-value)) |
| `statEquip` | each of those spells' rendered description as an Equip line, with what it adds to `stats` and `weaponSkill` ([below](#stat-spell-text)) |
| `icon` | [above](#how-the-data-was-obtained) |
| `sellPrice`, `flavor` | `SellPrice`, `Description_lang` |
| `classicName` | the Classic Era row's name when Forever renamed the item (none in this pool) |
| `source` | always null: the client's Encounter Journal tables ship empty ([client.md](client.md#phase-2-notes-what-this-client-ships)) |

## Stats, armor and block value

`stats` holds the item's stat columns plus every equip spell whose auras are all flat stats
([client.md, "Aura → stat"](client.md#aura--stat)); `statSpellIds` names those spells. Equip
spells that aren't (procs, class tweaks, run speed, zone, form or weapon-type bonuses) stay
effect lines. Every aura on the pool's equip spells and set bonuses is either a stat or listed
as not one (`NOT_STAT_AURAS`); the generator warns about any other, and
`scripts/scrape/lib/item-pool.test.mjs` fails. Since review finding L8, all crit (aura 290, The
Gladiator's 5-piece: `crit` and `spellCrit`) and Forever's shield block value (aura 274) are
stats.

**Armor is two fields.** `armor` is the base armor: Forever's formula for the item level,
quality and slot, or the Classic Era row's stored armor. `bonusArmor` is Forever's stat 50
plus any "+N Armor" equip spell. **Forever's tooltip adds stat 50 to its white armor line**,
and foreverchanges stored that sum as `armor`, so its dataset showed stat 50 as armor
changes: that is what most of the "armor changed" items were (Whitesoul Helm 509 → 629 is
509 armor + 120 bonus armor). 76 pool items carry bonus armor (74 of them Forever's stat 50).
The engine sums the two into total armor (`src/sim/stats/stat-block.ts`:
`itemArmor × (1 + Toughness %) + bonusArmor + 2 × Agility`), so Toughness applies to base
armor only. It has no bear-form armor multiplier yet; when it gets one, whether that
multiplies stat 50 is an open question ([client.md](client.md#what-m15c-2-needed-to-know-and-what-it-did)).

**Shield block value.** The Forever client has no innate shield block value (no
`ShieldBlockRegular` game table, no per-shield field); Classic Era's comes from that game
table. Putting Classic's into `stats.blockValue` would make the 20 fallback shields outrank
Forever ones for want of data, so it is kept apart as `classicShieldBlockValue` (only on
shields with `statsFrom: "classic"`). `stats.blockValue` holds block value from stat 48 and
equip spells only, as before. Whether Forever shields have a base block value is an open
question ([client.md](client.md#open-questions)). The engine adds a fallback shield's
`classicShieldBlockValue` to its block value, as it uses the rest of its Classic Era stats (D6),
and a tank's results flag it; a Forever shield adds none
([character-stats](../mechanics/character-stats.md#strength)).

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
| Rendered cleanly | 534 |
| Generated from the spell's auras (conditional stat bonus with an empty description) | 2 |
| Fallback (a variable couldn't be rendered) | **0** |
| Hidden (empty description, which the game doesn't show either) | 8 |

The two generated lines are Rune of the Guard Captain's area-restricted spell 1287704: "Equip:
+28 Attack Power in certain areas." (its always-on +14 AP is a stat; together they are the
tooltip's "tripled in Forest and Grassland areas") and Briarwood Reed's Marsh and Swamp
doubling (1318327, "+15 Spell Power in certain areas."). They carry `generated: true`: the game
shows nothing for them, so the item tooltip leaves them out (docs/ux.md "Item tooltips"), while
the gear's stats summary keeps them. The hidden spells are Seal of
Ascension's use and equip spells (16349, 16372) and Forever equip dummies (Arcanite
Dragonling 1318325, Cannonball Runner 1300668, Blackhand's Breadth 1318945, Eye of the Beast
1318846 and Barov Peasant Caller 1298508).

<a id="per-level-values"></a>**Per-level values** (review finding L9). Effect points are read at
level 60: an effect with `EffectRealPointsPerLevel` adds that much per level from its spell's
`SpellLevels.SpellLevel` up to 60, or up to its `MaxLevel` when that is set and lower, never
below 0 levels (`scalingLevels` in `lib/spell-text.mjs`). The term is truncated toward zero to a
whole number and added after a spread (which stays the base points'). The same rule renders
the spellbooks, talents and racials:

| Spell | Base | Per level | `SpellLevels` | At 60 |
| --- | --: | --: | --- | --: |
| Demoralizing Shout rank 5 (11556) | −196 | −1.4 | 54–64 | **−204** (−204.4), the level-60 tooltip `[F]` |
| Cat Form (Passive) 3025 (Cat Form's AP) | 12 | +2 | 6, no cap | **120** (Classic Era's 40 + scaling gives 120 too, so Cat Form is now "same") |
| Dire Bear Form (Passive) 9635 (health; AP) | 600; 120 | +32; +3 | 40–70 | **1240**; **180** |
| Bear Form (Passive) 1178 (health; AP) | 20; 30 | +18; +3 | 10–40 | 560; 120 (capped at 40) |
| Vindication's aura 440667 (the talent's AP reduction) | 6 | −3.5 | 1–60 (`BaseLevel` 0) | −200 (so 67 / 133 / 200 at 1–3/3) |
| Judgement of Command 20467 | 97 ± 4 | +5.6 | 20–28 | 137–145 (Classic Era's die roll gives the same) |

`SpellLevel`, not `BaseLevel`: the Forever client zeroes `BaseLevel` on 743 of its 1,559
per-level spells and keeps the level in `SpellLevel` (Classic Era: 19 of 1,428 differ). How
the client itself counts and rounds the term is `[?]`
([open questions](../open-questions.md#b74-per-level-tooltip-values)): Vindication's reduction
would be 204 at 3/3 counting from `BaseLevel` 0.

**Line breaks** (review finding L37). Effect lines and set bonuses are one line. The
spellbooks and racials (`lines`) and the talents (`paragraphs`) keep a client line break only
after a line that ends: sentence punctuation (`.`, `!`, `?`, `:`) or a colour reset (`|r`) after
a coloured header such as Feral Charge's "Requires Bear Form, Dire Bear Form". Anywhere else a
line break wraps a sentence and becomes a space (Weaponmaster's "Increases your⏎critical strike
chance"). No effect line or set bonus in the pool has such a header.

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
items with procs or other equip effects it doesn't model with each result, and active set
bonuses without `parsed` stats or a `weaponSkill` ([Equipping rules](#equipping-rules)).

### Stat-spell text

`statEquip` holds each stat spell's own Equip line (review finding TL-1): the spell's rendered
description, as above, from the client the spell is read from (Forever wherever it has it,
fallback items included), in the order the item lists its effects. Each entry also carries the
`stats` and `weaponSkill` the spell adds to the item's, so the item tooltip shows the client's
line for them and words only what's left: the stat columns, armor and resistances. The client's
line keeps what a stat can't say: "Improves your chance to get a critical strike with melee
attacks by 1.0%." (melee only, one decimal), "+48 Attack Power against Beasts.", "+30 Attack
Power, doubled against Mechanical units." (one line for two stats), "+14 Attack Power. This effect
is tripled in Forest and Grassland areas.", and Royal Seal of Eldre'Thalas's "+200 Armor." as an
Equip line, not white armor. A spell whose description is empty or can't be fully rendered has
no entry, and its stats keep the tooltip's wording; all 537 of the pool's stat spells render. The
browser build keeps `statEquip` (about 83 KB of JSON, 9 KB gzipped).

### Modelled item effects

The engine models an item's use, proc or other equip effect only through its override layer,
`ITEM_EFFECTS` in [`src/sim/effects/items.ts`](../../src/sim/effects/items.ts), where each entry cites
the client spells its numbers come from; every other such effect is listed with each result as not
simulated, and counts as zero in a sim-ranked list ([Pre-raid BiS lists](#pre-raid-bis-lists)). The
casters' (DV2-4, 1.60.1.70009 `[F]`):

| Item | Effect | Client |
| --- | --- | --- |
| Wrath of Cenarius (21190) | 5% a landed harmful spell: +132 spell damage for 10 s, no internal cooldown | 25906 → 25907 |
| Draconic Infused Emblem (22268) | 100% a landed harmful spell: +35 spell damage (+70 against Dragonkin) for 10 s, no internal cooldown; Forever made Classic Era's 75 s use this proc. The client's 100% against the tooltip's "Chance on harmful spellcast" is `[?]`: as read, it's up from the first landed spell (below) | 1318931 → 1318930 |

**Draconic Infused Emblem's chance** `[?]` (GV-5). The sim reads the client's 100%. Both readings:

- *For 100%:* the proc row is Forever's own, written when Forever turned Classic Era's use into this
  proc, and it says 100% with no cooldown, where Wrath of Cenarius's proc row, read the same way, says
  5%; the client is the first source (doctrine §2). And +35 always up is a modest trinket beside
  Forever's others: Royal Seal of Eldre'Thalas and Briarwood Reed rank near it on flat stats.
- *Against:* the tooltip says "Chance on harmful spellcast", the wording the client uses for procs
  below 100%, and a 10 s buff that procs on every spell would more simply be a flat equip bonus.
  Classic Era's use (27675: +100 spell damage for 15 s, 75 s cooldown) averaged +20.

What it's worth: at 100% it leads the trinkets of every list that ranks it, +9.7 (Elemental) to +11.9
(Destruction) DPS over the next-ranked trinket, and Balance's +16.1 over Eye of the Beast, whose use
counts as zero. It **breaks even near a 12% chance** for Destruction, the Fire mage and Elemental and
near 17% for Affliction and Demonology (paired against the next trinket, 20,000 fights on seed 2701,
1.60.1.70009), so it stays in each default's pair of trinkets at any chance above about a fifth. The results' assumptions
show it (`draconicEmblemChance`), and a guild test (its buff's uptime on a target dummy) is a known gap.

Eye of the Beast's use (+7% spell hit for 20 s, 5 min) isn't modelled: the aura model has no spell-hit
buff yet (known gap E7, [shaman.md](../classes/shaman.md)).

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
10. Raid drops (Molten Core, Onyxia, Zul'Gurub, AQ20, BWL and later) are left out, but tradeable
crafted items made from raid materials (Bloodvine's Zandalar patterns and Zul'Gurub's Bloodvine,
Flarecore's Molten Core materials) count as pre-raid: a crafter can make and sell them. Event-only
items aren't pre-raid sources: loot from a boss that appears only during a world event or an invasion,
such as the Scourge Invasion's (Chains of the Lich and Staff of Balzaphon, from Balzaphon in
Stratholme, who appears only during the invasion) and the Elemental Invasion bosses' (Sash of the
Windreaver from The Windreaver, Hardened Stone Band from Avalanchion; GV-6). **Every list leaves them
out, as it leaves out a raid drop**, the guide lists included, and the entries below move up (the
Fire mage's guide ranked Staff of Balzaphon second among its two-handers, Elemental's guide the sash
first among its belts, and the Protection paladin's guide the band third among its rings; each note
says it's out).
Doctrine §2
allows only Classic Era guides, so every list comes from **Wowhead's WoW Classic pre-raid BiS
guides as they stood in 2021, before Season of Mastery and TBC Classic**, with one exception:
Wowhead's Classic mage guide has no Fire list, so `mage-fire` comes from **Icy Veins' Classic mage
pre-raid guide**, archived in February 2021 (also before Season of Mastery). The live pages on
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
| `druid-balance` | [Balance Druid BiS Gear Guide, WoW Classic 1.13](https://web.archive.org/web/20210516224841/https://classic.wowhead.com/guides/balance-druid-dps-gear-bis-classic-wow), its "Pre-Raid Best in Slot Gear for Balance Druids - Phase 6" section: Wowhead had no stand-alone Classic Balance pre-raid guide before Season of Mastery | 2021-05-16 | all rows (Main Hand, Off-Hand, Two-Hand; no idol) |
| `paladin-retribution` | [Paladin DPS Pre-Raid BiS, Phase 6](https://web.archive.org/web/20210517000811/https://classic.wowhead.com/guides/wow-classic-paladin-dps-pre-raid-best-in-slot-gear) | 2021-05-17 | all rows (Two-Hand, Relic) |
| `paladin-protection` | [Paladin Tank Pre-Raid BiS, Phase 3](https://web.archive.org/web/20210505223134/https://classic.wowhead.com/guides/wow-classic-paladin-tank-pre-raid-best-in-slot-gear) | 2021-05-05 | all rows (Main Hand, Shield; the guide has no libram) |
| `shaman-enhancement` | [Enhancement Shaman Pre-Raid BiS, Phase 6](https://web.archive.org/web/20210515151721/https://classic.wowhead.com/guides/wow-classic-enhancement-shaman-dps-pre-raid-best-in-slot-gear) | 2021-05-15 | armor, jewelry, One-Handed (as the main hand), Two-Hand, Totem; the guide lists no shield |
| `rogue-combat` | [Rogue Pre-Raid BiS, Phase 5](https://web.archive.org/web/20210518052722/https://classic.wowhead.com/guides/wow-classic-rogue-dps-pre-raid-best-in-slot-gear) | 2021-05-18 | armor, jewelry, Main Hand (Swords), Off-Hand, Ranged |
| `rogue-assassination`, `rogue-subtlety` | same guide | 2021-05-18 | armor, jewelry, Main Hand (Daggers), the Off-Hand row's daggers, Ranged |
| `mage-fire` | [Icy Veins: Mage DPS Pre-Raid Gear](https://web.archive.org/web/20210215101245/https://www.icy-veins.com/wow-classic/mage-dps-pre-raid-gear) (for Fire mages heading into AQ40) | 2021-02-15 | all rows (Main Hand, Off-Hand, Two-Hand, Wand) |
| `mage-frost` | [Mage Pre-Raid BiS, WoW Classic 1.13](https://web.archive.org/web/20210515152513/https://classic.wowhead.com/guides/wow-classic-mage-dps-pre-raid-best-in-slot-gear) (one list, a Frost list by its picks) | 2021-05-15 | all rows |
| `mage-arcane` | same guide as `mage-frost`: Classic Era had no Arcane list | 2021-05-15 | all rows |
| `hunter-marksmanship`, `hunter-beast-mastery`, `hunter-survival` | [Hunter Pre-Raid BiS, WoW Classic Phase 6](https://web.archive.org/web/20210516173218/https://classic.wowhead.com/guides/wow-classic-hunter-dps-pre-raid-best-in-slot-gear) (one list for every hunter) | 2021-05-16 | all rows: One-Hand as the main hand with Dal'Rend's Tribal Guardian its only off hand, Two-Hand, Ranged; its rank-4 PvP pieces fall below the kept picks, and it lists no ammo or quiver ([hunter.md](../classes/hunter.md#73-gear)) |

**Selection.** Each guide row lists items best-first. The list keeps that order as `rank` (1 =
BiS, 2+ = alternatives), up to the top pick plus two alternatives per slot. Finger and
trinket keep four, since two are worn. A list names one side's PvP or reputation item, and its
[faction twin](#faction-twins), which the scraper reads from the client, takes the same rank.
Slot keys are the paperdoll slots plus `twoHand` and `relic`; tanks' shields are under
`offHand`. **Random-suffix items** are listed by their base id, and the pool has only the base
row's stats. One whose base row has none of the stats the spec's list is for (a caster's spell
stats, a melee spec's attack stats) is left out on every list, as a raid drop is, and the entries
below it move up (the mage and Balance lists' notes name them).

**Left out for Forever.** An item Forever redesigned out of the spec's role is taken off the
list, and the spec's `note` says why; the other entries keep the guide's rank. So far that's
**Diamond Flask** (20130), the Fury and Arms guides' rank-3 trinket: Forever made its use a 5 s
heal ([warrior Q30](../classes/warrior.md#9-open-questions)). No other list has it and the
filter doesn't keep it, so it's out of the pool; the lists' trinket ranks run 1, 2 and 4. The
default gear is unchanged, since it wears ranks 1 and 2.

**Sim-ranked lists.** Where no allowed guide fits a spec's default build in Forever, the sim ranks
the list itself, as the [Forever caveat](#forever-caveat) and
[D29](../decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24)
ask ("guides supply candidates"): a build the guide never considered, or items Forever re-itemized past
the guide's picks. The candidates are the pool's pre-raid items for the spec's stats (no raid drops, no
event-only items, no Forever-new items until their sources are known, PvP Rank 10 or lower), a
slot-by-slot paired search picks rank 1, and paired runs in that set rank the rest, close calls on a
direct paired run. Within the 95% interval, a guide's pick keeps its place. The spec keeps its guide as
`source`, since the guide's picks are among the candidates, and its `note` says how the list was
ranked. So far that's the three warlocks ([warlock.md §7.3](../classes/warlock.md#73-gear)): Wowhead's
one warlock list is a Shadow list written for Classic Era's items, Destruction's and Demonology's
defaults are Fire builds, and Forever gave the Arathi Basin daggers +94 spell power `[?]`. Frost, Arcane
and Shadow keep their guide lists with that dagger added at rank 1 (DG-2); ranking them too is a known
gap. **Item effects the sim doesn't model count as zero** in a sim-ranked list (an unmodelled use or
proc adds nothing to a paired run), so each such effect on a candidate is listed in the
[milestones' known gaps](../milestones.md) and the list's note names it; the modelled ones are
[below](#modelled-item-effects).

**Kept items.** When a list change leaves an item on no list, and the level rule wouldn't keep it, the
file's `kept` section keeps it in the pool with no rank (`meta.preRaidBis.kept`), so saved setups and
share links that wear it keep it. So far that's the five items only Wowhead's warlock list had (Deathmist
Mask, Felcloth Robe and Pants, Band of the Unicorn, Inventor's Focal Sword), and the two Elemental
Invasion items the lists left out (Sash of the Windreaver, Hardened Stone Band; GV-6). **No item leaves
the pool without a reason** (DV2-5): the scraper compares its pool with the committed one
(`itemsLeavingPool` in [`lib/item-pool.mjs`](../../scripts/scrape/lib/item-pool.mjs), GV-11) and fails
when an id would go, unless it's kept or named in `REMOVED_ITEMS` (`items-client.mjs`) with why it may go.

### Faction twins

A PvP, battleground or reputation reward comes in one copy per faction. **Two items are faction twins
when their client rows match on everything but their names, their price and what binds them to a side**
(the step-6 simplification of the 2026-09-24 Destruction gear review, DV2-1, which replaced hand-written
twin entries that had missed one). The scraper (`twinKey` and `findTwins` in
[`lib/item-pool.mjs`](../../scripts/scrape/lib/item-pool.mjs)) compares every equippable row of the
build the item's stats come from:

- **May differ:** the id; the names (`Display_lang`); the price (`SellPrice`, `BuyPrice`, and
  `PriceRandomValue`, the vendor price's random part, in which Forever's "Premier" PvP pairs and its
  Theramore and Darkspear rewards differ: GV-2); what binds the item to
  a side or class: the reputation it needs (`MinFactionID`, `MinReputation`), `AllowableRace`,
  `AllowableClass`, and the Horde-only and Alliance-only flags (`Flags[1]` bits 0x1 and 0x2); and its
  `ItemSet`, whose bonuses are compared instead.
- **Must match:** every other `ItemSparse` column, the stats as (stat, allocation, amount) triples in any
  order (Songstone of Ironforge lists Spirit first, Eye of Orgrimmar Intellect), the `Item` class and
  subclass, each item effect's spell, trigger, cooldowns and charges (a use matches by its cooldowns and
  charges alone: the Alterac Valley insignias' uses return you to each side's base), and the set's bonuses
  (pieces and spell).
- Two matching rows are twins when their names or their side bindings differ. So twins include
  **class twins**, one side's pieces for different classes (Lieutenant Commander's Plate Helm for the
  warrior and Lamellar Headguard for the paladin; the Dreadweave, Satin and Silk shoulders) and **quest
  twins**, a quest's reward choices (Vision of Voodress for the shaman, Enchanted South Seas Kelp for the
  druid), as well as the faction twins (GV-10). The app picks among them by faction and class.

**Two tiers** (the step-6 narrowing of the caster gear verification, GV-1: the third round in a row
with twin problems). The client-exact rule above missed pieces a race change had swapped before it:
the Alliance's Rank 7 to 10 silk and satin and the Horde's leather have the other faction's rows but
no item set, and the Arathi Basin mail's sets give other bonuses, so 138 swaps were lost (every
Rank 7 to 10 leather, satin and silk piece, and the Highlander's and Defiler's mail). So each tier
gets the match its job needs:

- **The lists' ranks** use the exact twins, `twins`: a twin takes a list's rank only when its set
  bonuses match too, since a piece without its set isn't worth the same.
- **A race change** uses `statTwins`: the same key with the set's bonuses left out (`twinKey(…, { sets:
  false })`), so every twin and the other faction's pieces with the same stats and effects in another
  set or none. `raceChangeTwin` (`src/features/character/faction-gear.ts`) takes, among the stat
  twins, the one whose set name ends the same way, so a set's pieces move to one set on the other
  side; then the exact twin, the name that ends the same way, and the lower id. It says when the set
  bonus differs (the piece isn't an exact twin); the notice names those pieces and says how: "…, with
  the same stats but no set bonus", "…, now with a set bonus" or "…, but in another set". The set
  comes first because an exact twin can sit in another set: The Defiler's Fortitude's greaves have
  one in The Highlander's Determination (Highlander's Chain Greaves), while its pauldrons and girdle only have stat twins in The Highlander's Fortitude,
  so taking the exact twin split the set and lost its 3-piece bonus on the way back (GC-1). Every
  piece now comes back to itself on a round trip. This is the match the app made before the step-6
  change, now read from the client: over the pool it gives the same piece for 772 of the old match's
  774 (item, class) swaps (768 before GC-1, when Defiler's Mail Greaves took Highlander's Chain
  Greaves for 4 classes). The two it drops are the hunters' Rank 10 chain helms, one of them a
  Classic Era fallback row: a Forever row never matches a Classic Era one (a known gap).

Each pool item carries its twins in the pool as `twins` and its stat twins as `statTwins` (item ids). **A listed item's twins join the pool
and take its list entries**, the same spec, slot and rank, unless the twin is on that list itself or the
spec's class can't wear it; `meta.preRaidBis.twinsListed` counts them. So each list names one side's item.
Which twin is the other faction's is the app's call: `factionTwin`
(`src/features/character/faction-gear.ts`) picks, among an item's twins, the one bound to the other
faction ([Equipping rules](#equipping-rules)) that the class can wear, preferring the name that ends the
same way (Highlander's Chain Greaves → Defiler's Chain Greaves, not Defiler's Mail Greaves); the tanks'
interim picks (`INTERIM_GEAR`) use the same twins, and a race change its stat twins (above).

**What it found** (1.60.1.70009): 433 pool items have a twin, in 207 groups (213 in 99 before GV-2
freed `PriceRandomValue`; the rest are Forever's "Premier" PvP pairs, which suit both factions, and
its Theramore and Darkspear rewards, Seal of the Expedition and Darkspear Warding Pendant, Theramore
Signet and Insurgent's Band). 506 have a stat twin, in 239 groups. It found twins the hand-written
lists missed, The Defilers' Ironbark Staff (20220) for the League of Arathor's (20069), the Deathguard's
Cloak and Cloak of the Honor Guard (Enhancement's and the hunters' cloaks), and the hunters' Knight-Lieutenant's Chain Greaves for Blood Guard's Chain Greaves; and it found
pairs the lists called twins that the client says aren't:

- the Alliance's Rank 7 to 10 silk (Lieutenant Commander's Silk Cowl and Mantle, Knight-Captain's Silk
  Legguards, Knight-Lieutenant's Silk Handwraps and Walkers): the Horde pieces' stats, but no item set in
  Forever's rows, so they miss the Champion's Arcanum bonuses. The mage lists name them on their own,
  **ranked by paired runs in a Human's default set** (GV-4, [mage.md](../classes/mage.md#races-and-gear)):
  without the set, Knight-Lieutenant's Silk Handwraps fall behind Inferno Gloves and Sandworm Skin
  Gloves on the Fire list. They're each other's stat twins, so a race change still swaps them.
- Highlander's Mail Pauldrons and Mail Greaves: the Defilers' stats, but a 3-piece bonus of spell crit
  where the Defilers' is melee crit. Enhancement names the pauldrons on their own; they're stat twins.
- Knight-Lieutenant's Chain Greaves, which Enhancement listed as Blood Guard's Mail Greaves' twin, is the
  hunter's, with other stats: a shaman can't wear it, so it left that list.

Tests: `faction-gear.test.ts` checks that every one-faction item on a list has its other faction's twin
at the same rank, when the client has one, that twins and stat twins pair both ways with the same slot,
stats and effects, that every twin is a stat twin, and the race changes GV-1 found lost (a Combat
rogue's Champion's Leather Helm and Blood Guard's Leather Grips going Alliance, a Shadow Priest's
Knight-Lieutenant's Satin Handwraps going Horde, an Enhancement shaman's Defiler's Mail Pauldrons going
Dwarf); `lib/item-pool.test.mjs` checks the key's rules (a price's random part may differ; set bonuses
count for twins and not for stat twins).

### Coverage

The counts below were taken before the shaman, rogue and mage lists joined.

158 distinct items are listed. **All 158 have a client row and are in the pool**
(`meta.preRaidBis.notInData` is empty). **49** are in the pool only because of the lists: 6
Uncommon, 24 Rare and 19 Epic (Lionheart Helm, Savage Gladiator Chain, Ironfoe, Blackblade of
Shahram, The Unstoppable Force, Don Julio's Band, Wolfshead Helm, Manual Crowd Pummeler, Rune
of the Guard Captain, …).

| Spec | Items | new | changed | unchanged | no Forever data | Rank-1 items without Forever data |
| --- | --: | --: | --: | --: | --: | --- |
| `warrior-fury` | 49 | 0 | 13 | 4 | 32 | 9 of 17: Mark of Fordring, Cape of the Black Baron, Savage Gladiator Chain, Battleborn Armbraces, Brigam Girdle, Hand of Justice, Ironfoe, Mirah's Song, Satyr's Bow |
| `warrior-arms` | 47 | 0 | 14 | 4 | 29 | 8 of 16: as Fury, with Blackblade of Shahram instead of Ironfoe and Mirah's Song |
| `warrior-protection` | 50 | 0 | 8 | 3 | 39 | 10 of 18: Medallion of Grand Marshal Morris, Stoneskin Gargoyle Cape, Bracers of Valor, Boneclenched Gauntlets, Brigam Girdle, Cloudkeeper Legplates, Hand of Justice, Mirah's Song, Draconian Deflector, Satyr's Bow |
| `druid-feral-cat` | 39 | 0 | 6 | 0 | 33 | 12 of 16, including Manual Crowd Pummeler and Widowmaker |
| `druid-feral-bear` | 50 | 0 | 15 | 3 | 32 | 14 of 17, including Breastplate of Bloodthirst, Smoking Heart of the Mountain and Warden Staff |
| `paladin-retribution` | 36 | 0 | 5 | 1 | 30 | 10 of 14 |
| `paladin-protection` | 46 | 0 | 9 | 1 | 36 | 13 of 14, including the whole Deathbone set, Naglering, Force of Will and Flurry Axe |

Across the 158 listed items: **0 new, 33 changed, 9 unchanged, 116 with no Forever data**
(102 never had any, 6 seen in game, 8 hotfix-only: Deepfury Bracers, Flurry Axe, Widowmaker,
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

It warns when an item has no icon, a listed item isn't in the pool, an `ItemSparse` row has
no `Item` row, or an equip spell or set bonus carries an aura that is neither a stat nor listed
as not one. It prints any unrendered description with the spell, its tokens and the items
using it. The integrity tests in `src/data/data.test.ts` check the counts, the filter, the SoD
guard, the pre-raid BiS lists, the `statsFrom`/`foreverData`/`tab` flags, the set bonuses,
the absence of drop sources and of leftover `$` variables, and that `meta.noClientRow` items
aren't in the pool; `src/data/schema.test.ts` checks every record's keys against `types.ts`.
`scripts/scrape/lib/item-pool.test.mjs` checks the pool against the Forever client's spells
(every equip and set-bonus aura classified; fallback items' spells and values Forever's), and
`item-stats.test.mjs` the fallback rule on real client rows (Seal of the Dawn, Hand of Justice,
Blackhand's Breadth, Diamond Flask, Barrier Shield).

`npm run diff:items` regenerates the pool and lists every item added or removed and every
changed field against the committed dataset, sorted into kinds (an item gaining or losing its
Forever row first), plus set changes and watched items that a build now ships. The M1.5c-1
field-by-field check of the derivation against the foreverchanges tooltips
(`npm run compare:items`) was retired in M1.5f; its result is kept in
[client.md](client.md#comparison-with-the-snapshot-history).

## Equipping rules

How the engine judges a set of gear as a whole (`src/sim/equip.ts`). `normalizeConfig`, the
default gear and the item picker all follow these rules.

**Unique and Unique-Equipped** `[F]` (`ItemSparse.MaxCount`, `ItemLimitCategory`; see the
schema table above). An item Unique-Equipped in a named group counts toward the group's limit
across every slot, copies included. This snapshot has four groups, each with a limit of 1:
Undermine Trinkets, Watcher's Signet, Trinket of the Dawn and Talisman of Battle. Any other
`unique` item, including one Unique-Equipped with no group, is limited in copies, to
`uniqueEquipped.max` or else 1. So one Annihilator fits across both hands, and one Don
Julio's Band across both rings.
- `normalizeConfig` keeps the first item in paper-doll order and removes a later one that
  breaks a rule, with a warning.
- The defaults skip to the next-ranked item.
- The picker moves another copy of the same item from its other slot. It shows an item that
  would break a group dimmed, with the reason ([ux.md](../ux.md#sections)).

**Set pieces.** A piece counts toward a set only when the set's `itemIds` list it. A Classic
Era row can carry a set id that Forever reuses for another set. Champion's Chain Headguard
(16526) carries Classic's set 361, which in Forever is Champion's Pursuit, a set of other
items. Each result lists any active set bonus that isn't flat stats or a weapon skill as not
simulated.

**Faction.** The client rows don't encode faction for PvP and battleground gear. The twins'
`AllowableRace` is −1 in both clients, so `races` is null across the pool (see
[Caveats](#caveats)). The engine gives an item to one faction by the first of these that
applies:
1. `races`, when every race listed is on one side. No item has one yet.
2. The two rank-3 cloaks, because rank 3's title is "Sergeant" on both sides: Sergeant's Cape
   (16342) is Horde's and Sergeant's Cloak (18461) Alliance's `[C]` (the pre-raid lists' notes,
   [Selection](#sources-c)).
3. A reputation that the client's Faction table files under Alliance (891) or Horde (892) as
   `ParentFactionID` `[F]` (Faction, 1.60.1.69913):
   - Alliance: The League of Arathor, Stormpike Guard, Silverwing Sentinels, Theramore
     Expeditionary Force.
   - Horde: The Defilers, Frostwolf Clan, Warsong Outriders, Darkspear Raiders.
4. A PvP rank requirement, by that rank's title at the start of the name `[C]` (the Classic Era
   honor ranks, 1–14). For example, rank 7 is Knight-Lieutenant (Alliance) or Blood Guard
   (Horde), and rank 10 is Lieutenant Commander or Champion. Every PvP-rank item in the pool
   (ranks 3, 4, 5, 7, 8 and 10) matches exactly one title of its rank, except the shared rank 3.
5. "Stormpike " (Alliance) or "Frostwolf " (Horde) at the start of the name `[C]`. These are
   the Alterac Valley rewards, which the client lists with no reputation requirement.
6. The Warsong Gulch rewards' names, which the client also lists with no requirement `[C]`
   (review finding RL7): the Silverwing Sentinels' quartermaster sells Sentinel's, Protector's,
   Lorekeeper's, Caretaker's and Outrunner's items (Alliance), the Warsong Outriders' sells
   twins of the same stats as Legionnaire's, Outrider's, Scout's, Advisor's and Battle Healer's
   (Horde) ([Warsong Gulch items](https://warcraft.wiki.gg/wiki/Warsong_Gulch#Warsong_Gulch_items)).
   The pool has eight pairs, such as Sentinel's and Scout's Medallion or Protector's and
   Legionnaire's Band. The rule reads Classic Era items only: Forever's new Sentinel's Libram
   (272434) is one of a set of new relics, has no Horde twin and different item flags, so it
   suits both factions `[?]` ([B76](../open-questions.md#b76-faction-of-forevers-new-pvp-and-battleground-items)).
   "Legionnaire's" is also the Horde rank-8 title, so rule 4 and this one agree.

Anything else suits both factions. That places all 236 PvP-rank items in the pool (120
Alliance, 116 Horde) and 74 reputation and battleground items. It leaves Forever's "Premier"
PvP pieces to both factions, since their rows carry no requirement to go by `[?]`
([B76](../open-questions.md#b76-faction-of-forevers-new-pvp-and-battleground-items)).
- The default gear takes the race's own twin: an Alliance warrior wears Lieutenant
  Commander's Plate Shoulders where a Horde one wears Champion's.
- The picker leaves out the other faction's items, except the one equipped.
- `normalizeConfig` leaves them alone.
- A race change on the Character tab that crosses factions swaps each item the new race can't
  wear for its [faction twin](#faction-twins), read from the client (the closest name when several
  match), or else its stat twin, the other faction's piece with the same stats in another set,
  keeping the slot's enchant. An item with neither, or whose
  match would break a Unique rule, stays. A notice names the items swapped, those whose set bonus
  differs and those kept (`src/features/character/faction-gear.ts`, [ux.md](../ux.md#sections) "Character").

## Caveats

- **Raw client files, not the server.** The server may still disagree, and server hotfixes
  aren't in the files at all ([client.md, "Hotfix caveat"](client.md#hotfix-caveat)): 16 items
  are missing and 34 fall back to Classic Era for that reason, and the Undermine trinkets'
  cooldowns may be hotfixed. Guild measurements win (doctrine §2).
- `[?]` **Fallback items mix two clients.** Their stats are Classic Era's and their effects the
  Forever client's ([above](#effects-of-fallback-items)). Where Forever moved a bonus from an
  equip spell into its `ItemSparse` row the bonus is kept from Classic Era, and where it
  added an effect of another kind next to a bonus both are kept (Savage Gladiator Chain: +2%
  crit next to Forever's fear resistance; Warblade of Caer Darrow and Iceblade Hacker: Classic
  Era's extra Frost damage on the weapon next to Forever's equip spell that deals it). A Classic
  Era item effect whose row Forever re-pointed to another spell goes (Mark of Tyranny's +1%
  dodge, now Forever's health use). Either can be off until a build ships the items' rows
  ([open questions C35](../open-questions.md#c35-fallback-items-with-forever-effects)).
- **Orb of Deception** is in the pool as a Classic Era trinket with no stats and a transform
  use. In Forever it's a "Binds when used" item that isn't equippable (the hotfix row
  foreverchanges showed), so it will leave the pool when a client build ships that row.
- **Demonheart Spaulders** (18320) is a Classic Era row foreverchanges never listed. Whether it
  drops anywhere in Classic or Forever is unconfirmed `[?]`; it has no BiS listing and no
  effect on defaults.
- **PvP rank requirements** are shown as numbers (`Requires PvP rank 10`): the rank title
  depends on the faction, which these item rows don't encode.
- `[?]` **Faction of Forever's new PvP and battleground items.** The Premier pieces and
  Sentinel's Libram carry no requirement, so both factions can equip them in the sim
  ([Equipping rules](#equipping-rules),
  [B76](../open-questions.md#b76-faction-of-forevers-new-pvp-and-battleground-items)).
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
as an item note or in `unknownStatTypes`, and a new aura on an equip spell or set bonus as a
warning: map it in `lib/item-stats.mjs` (`STAT_TYPE`, `AURA_STAT`, or `NOT_STAT_AURAS` with the
reason it isn't a stat) and add any new key to `Stats` in `types.ts`.
