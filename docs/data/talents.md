# Talents dataset

`src/data/talents/{warrior,druid,paladin}.json` hold the three WoW Forever talent trees of each
class, talent by talent: grid cell, max rank, prerequisite arrow, icon, the Forever tooltip text
of every rank, and the Classic Era talent it came from with that talent's rank texts. Everything
is read from the client files: the Forever tree from the **Trait tables** of the Forever beta
client, the comparison from the **Talent tables** of the Classic Era client
([decision D17](../decisions.md#d17-retire-foreverchangespro-as-a-data-source-2026-09-22)).
Interfaces and the build-code helpers are in
[`src/data/talents/types.ts`](../../src/data/talents/types.ts); the generator is
[`scripts/scrape/talents-client.mjs`](../../scripts/scrape/talents-client.mjs) with the tree
reader [`lib/talent-tree.mjs`](../../scripts/scrape/lib/talent-tree.mjs) and the text renderer
[`lib/spell-text.mjs`](../../scripts/scrape/lib/spell-text.mjs).

| | |
| --- | --- |
| Source | `https://wago.tools/api/casc/<fdid>?version=<build>` (raw client files, [D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)), parsed with [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) |
| Forever build | `wow_classic_beta` · `1.60.1.70009` (wago.tools lists it as created 2026-09-24). It moved build-code positions, so `1.60.1.69913`'s code order (created 2026-09-18) is kept, frozen, for the codes written on it ([Tree versions](#tree-versions)) |
| Classic build | `wow_classic_era` · `1.15.9.69722` |
| Generated | 2026-09-24 (`meta.scrapedAt` is the latest download among the files read, 22:47 UTC) |

## How the data was obtained

### Requests

Everything goes through the client-data download layer
([client.md § Requests](client.md#requests)): the documented wago.tools API only, one request
at a time, cached under `.cache/client/`, once per build. The Forever tables were already cached
by `npm run scrape:client`; this dataset added **2 requests**, both HTTP 200: the Classic Era
`Talent` (FileDataID 1369062) and `TalentTab` (2178102) tables. Their `.dbd` definitions were
already cached. A later run makes no requests.

| Build | Tables read |
| --- | --- |
| Forever 1.60.1.70009 | `TraitTree`, `TraitNode`, `TraitNodeEntry`, `TraitNodeXTraitNodeEntry`, `TraitDefinition`, `TraitDefinitionEffectPoints`, `CurvePoint`, `TraitEdge`, `TraitNodeGroupXTraitNode`, `TraitNodeGroupXTraitCond`, `TraitNodeXTraitCond`, `TraitCond`, `TraitCurrency`, `TraitTreeXTraitCurrency`, `TalentTab`, `ChrClasses`, `SpellClassOptions`, `SpellPower`, `SpellCooldowns`, `SpellCastTimes`, `SpellEquippedItems`, `ItemSubClass`, and the text renderer's `Spell`, `SpellName`, `SpellEffect`, `SpellMisc`, `SpellDuration`, `SpellAuraOptions`, `SpellRadius`, `SpellRange`, `SpellTargetRestrictions`, `SpellDescriptionVariables`, `SpellXDescriptionVariables`, `SpellLevels` |
| Classic Era 1.15.9.69722 | `Talent`, `TalentTab`, `ChrClasses` and the text renderer's tables |
| Forever 1.60.1.69913 | the Trait tables above and `SpellName`, for its frozen code order only ([Tree versions](#tree-versions)) |

Each file's `meta.tables` lists every table with its FileDataID, per build.

### Derivation

1. **The class tree.** Forever keeps talents in the Trait tables, one `TraitTree` per class.
   The generator takes the tree that spends a currency, has tier conditions, and whose node
   spells are mostly of the class's spell family (`SpellClassOptions.SpellClassSet` 4 warrior,
   7 druid, 10 paladin): **1117** warrior, **1089** druid, **1100** paladin. Exactly one tree
   must qualify. The client also ships an older druid tree (1083, no conditions or currency),
   which this rule skips.
2. **Trees and cells.** A class's three trees are the three `PosX` clusters of its nodes, left to
   right, named and iconed by the class's `TalentTab` rows in `OrderIndex` order (the legacy
   table still ships in Forever): tier = (`PosY` − top) / 600, column = (`PosX` − the cluster's
   left edge) / 600, 0-based. Each cluster must span exactly four columns. Two paladin
   Protection nodes (Improved Seal of Fury, Swift Judgement) sit 10 units right of the grid and
   are rounded to the first column, where the foreverchanges calculator had them too.
3. **Talents.** A node's `TraitNodeEntry` gives the max rank and its `TraitDefinition` the spell;
   the name is `OverrideName_lang` or the spell's name, the icon `OverrideIcon` or the spell's
   `SpellMisc.SpellIconFileDataID`, named through the build's own file list (as the item pool
   does). No node has two entries (no choice nodes).
4. **Arrows.** `TraitEdge` rows into a node of type **2** ("sufficient for availability", the
   usual arrow) or **3** ("required for availability") become `prerequisite`, at the
   prerequisite's **max rank**; type-0 edges are visual only. See
   [Prerequisite arrows](#prerequisite-arrows).
5. **Points and tier gates.** The trees spend `TraitCurrency` **3820**, whose `SourcedMax` is
   **51** (`rules.maxPoints`). Each node's groups carry a `TraitCond` "spend N points in this
   group of nodes"; every gate asks for 5 × tier points (`rules.pointsPerTier` = 5). See
   [Tier gates](#tier-gates).
6. **Ranks.** A talent with N ranks is **one spell** whose effect values come per rank from
   `TraitDefinitionEffectPoints` → `CurvePoint` (all 640 rows use operation 0, "set"). The rank
   text is that spell's `Description_lang` rendered with each rank's curve values in place of
   the effects' base points ([client.md § `talents.json`](client.md#talentsjson)).
7. **Text.** [`lib/spell-text.mjs`](../../scripts/scrape/lib/spell-text.mjs) renders the
   descriptions. For talents it takes `$?` player conditions as **unmet** (a reader with no
   auras or talents: Feral Charge and Berserk print "Requires Bear Form, Dire Bear Form" rather
   than the shapeshifted variant), keeps a blank line as one `\n` paragraph break (the UI shows
   it), keeps a line break after a line that ends as one `\n` too (Feral Charge's "Requires Bear
   Form, Dire Bear Form" line, not "… Dire Bear Form Charge an enemy"; a break inside a sentence,
   as in Weaponmaster, is a space), shows a `${…}` without a `.N` precision as a whole number
   (as the spellbook does), reads effect points at level 60 ([items.md § Per-level
   values](items.md#per-level-values)), and includes `$@spelltooltip` texts. Every rank of every
   talent renders completely. In F2 (review findings L9 and L37) the line-break rule changed
   Feral Charge's and Berserk's texts, and the level-60 values four: Vindication's reduction is
   67 / 133 / 200 (it read 2 / 4 / 6, its aura's base),
   Improved Seal of Fury restores 60 mana (it read 0), Wild Growth heals 336 (280), Light's
   Vigil 325 to 343 (315 to 333).
8. **Tooltip header and passive flag.** `passive` is `SPELL_ATTR0_PASSIVE`. Active talents get
   `tooltip`: cost (`SpellPower`: rage in tenths, mana, or "% of base mana"), range
   (`SpellRange`, "Melee range" for the melee range), cast time (`SpellCastTimes`), cooldown
   (`SpellCooldowns`) and weapon or shield requirements (`SpellEquippedItems`).
9. **Classic comparison.** The Classic Era `Talent` rows of the class's `TalentTab`s give each
   Classic talent's tree, tier, column, rank spells (`SpellRank[]`) and prerequisite
   (`PrereqTalent[0]`, `PrereqRank[0]` + 1). A Forever talent is matched to the Classic talent
   whose rank spells include its spell, else to one with the same name; no Classic talent may
   match twice. `ranks.classic` renders the Classic rank spells, `classicSpellId` is rank 1,
   `previousName` the Classic name when it differs, and `classic.matchStatus` is `same_name` or
   `same_spell`. **`changeKind`** is `added` (no Classic talent), `unchanged` (same name, max
   rank, prerequisite and rank texts, ignoring case and whitespace, in the same tree and cell),
   `moved` (only the tree or cell differs) or `modified`.
10. **Ids** are `<class>-<tree>-<name>` slugs (`warrior-arms-mortal-strike`,
    `druid-balance-natures-splendor`). They are opaque: build codes, share links and saved
    setups store codes, not ids, and the engine keys on names.

The generator fails (and writes nothing) on a problem: no or several class trees, a cluster
that isn't four columns wide, two talents in one cell, an arrow from outside the tree or one
pointing up, a gate that isn't "5 × tier points", a curve operation other than "set", a text
token it can't render, an icon it can't name, a Classic talent matched twice, a build-code
position that changes, or a stored build code that decodes differently (see [Build
codes](#build-codes-verified)).

**The old scraper (history).** Until M1.5d the dataset came from the foreverchanges.pro
talent calculator. Its scraper, `scripts/scrape/talents.mjs`, decoded the page's Next.js RSC
payload; M1.5f deleted it with the other foreverchanges scrapers (it stays in git history, e.g.
`git show b5972d8:scripts/scrape/talents.mjs`).

## Schema

```ts
interface TalentData {
  meta: {
    source; scrapedAt; scraper;                 // "https://wago.tools/api/casc", …
    product; foreverBuild; foreverBuildDate;    // "wow_classic_beta", "1.60.1.69913", "2026-09-18"
    classicProduct; classicBuild;               // "wow_classic_era", "1.15.9.69722"
    traitTreeId; traitCurrencyId;               // 1117 / 1089 / 1100, 3820
    tables: { forever; classic };               // table → FileDataID
    wowDbDefs: { repository; commit };
  };
  class: 'warrior' | 'druid' | 'paladin';
  rules: { maxPoints: 51; pointsPerTier: 5; maxTier: 6; maxCol: 3 };
  codeFormat: string;            // prose version of "Build codes" below
  trees: { id; name; icon; index; clientTreeId; talents: Talent[] }[];   // index 0..2 = code segment
}
```

| `Talent` field | Meaning |
| --- | --- |
| `id` | `<class>-<tree>-<name>`, e.g. `warrior-arms-mortal-strike`. Opaque. |
| `name`, `icon` | Forever name; Blizzard icon file name. Names are unique within a class. |
| `tree` | Tree id (`"Arms"`, `"Feral Combat"`, …), the Forever `TalentTab` name. |
| `tier`, `col` | **0-based** cell (tier 0 = top row, col 0..3). Tables in this doc use 1-based tiers. |
| `order` | Position of the talent's digit in its tree's build-code segment (tier, then column). |
| `maxRank` | `TraitNodeEntry.MaxRanks`. |
| `prerequisite` | `{ talentId, rank }` for an arrow into this talent; `rank` is always the prerequisite's max rank. |
| `inForeverTree` | Always `true`: the Trait tree holds only Forever talents. Kept for the build-code helpers. |
| `changeKind` | `added`, `modified`, `moved` or `unchanged`, from the Classic comparison (step 9). |
| `passive`, `tooltip` | Passive flag; for active talents the tooltip header (`resourceCost`, `range`, `castTime`, `cooldown`, `requirements`). |
| `previousName` | Classic name when it differs (Bastion ← One-Handed Weapon Specialization). |
| `spellId` | The Forever talent spell (one for every rank). |
| `classicSpellId` | Rank-1 Classic Era spell, or null. |
| `ranks.forever` / `ranks.classic` | Tooltip text per rank, index 0 = rank 1. `classic` is null for new talents. Paragraph breaks are `\n`. |
| `classic` | Matched Classic talent: `name`, `tree`, 0-based `tier` and `col`, `maxRank`, `matchStatus`, Classic `prerequisite` name. Null for new talents. |

Talents are listed per tree in `order`. The browser build drops `classic`, `ranks.classic`,
`tooltip`, `classicSpellId`, `previousName`, `changeKind` and `meta.tables`/`wowDbDefs`
(`vite.config.ts`); the JSON in `src/data` stays complete.

## Counts

| Class | Trees (talents) | New | Changed | Moved only | Same as Classic | Arrows | Active |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Warrior | Arms 17, Fury 18, Protection 18 = 53 | 9 | 36 | 1 | 7 | 8 | 9 |
| Druid | Balance 16, Feral Combat 19, Restoration 16 = 51 | 13 | 34 | 2 | 2 | 9 | 8 |
| Paladin | Holy 18, Protection 16, Retribution 18 = 52 | 20 | 25 | 4 | 3 | 7 | 9 |

Client tree ids (`clientTreeId`, the `TalentTab` ids): warrior 161/164/163, druid 283/281/282,
paladin 382/383/381.

## Build codes (verified)

A build code is a Wowhead-style string with **three `-`-separated segments, one per tree in
`trees` order**. A segment has one decimal digit per talent, its rank (0..`maxRank`), with
talents **sorted by tier, then column** (the talent's `order`). Trailing zeros in a segment are
trimmed; empty segments are kept, so a canonical code always has two dashes:
`30305213132515201-05050103-`. They are the codes the foreverchanges.pro calculator used
(`?b=<code>`), and the client trees keep every cell, so codes written then still mean what
they meant.

`decodeTalentCode(data, code)` returns `{ [talentId]: rank }`; `encodeTalentCode(data, ranks)`
is its inverse; `validateTalentBuild(data, ranks)` lists rule violations (unknown talent, rank
range, >51 points, 5·tier gate, prerequisite at max rank).

**Compatibility.** Share links and saved setups store codes, including codes no file in the
repo knows, so **every position** of a code must keep its meaning, not only the positions the
stored codes use (review finding L10). On every run the generator compares each tree's talents
in code order, talent name and `maxRank` at every position, with the committed dataset (`git
show HEAD:src/data/talents/<class>.json`, or `--against=<ref>`; `lib/build-codes.mjs`
`codePositionChanges`). A talent that moves, is renamed, changes its max rank or is removed
fails the run; one appended at the end of a tree only warns, as old codes still decode the
same. It also decodes every stored code, the one list in
[`scripts/scrape/stored-builds.json`](../../scripts/scrape/stored-builds.json) with the ranks by
name each had when it was written, and fails when one decodes to other ranks or becomes illegal.
A build that really moves talents needs the app and the stored codes updated first, then a run
with `--accept-code-changes`, and the old build's order frozen ([Tree versions](#tree-versions)). **The guard fails closed** (review finding L36): when `git show`
fails (git missing, or no such file at `--against`), the run says why and refuses to write
unless `--skip-committed-check` is passed. `src/data/data.test.ts` pins the same two contracts:
each stored code's ranks by name (read from `stored-builds.json`) and the full code order of
every tree, talent and max rank, position by position.

| Class | Code | Build | Points | Same ranks | Legal |
| --- | --- | --- | --- | --- | --- |
| Warrior | `30305013002-050530035150010051-` | Fury default ([warrior.md §6.1](../classes/warrior.md#61-talent-builds)) | 17/34/0 | yes | yes |
| Warrior | `30305013-050520035150310051-` | Fury + Precision (§6.1) | 15/36/0 | yes | yes |
| Warrior | `30305213132515201-05050103-` | Arms default (§6.1) | 37/14/0 | yes | yes |
| Warrior | `35-05-552101233301210531` | Protection default (§6.1) | 8/5/38 | yes | yes |
| Warrior | `05-05-552131233301210531` | Protection + Improved Thunder Clap (§6.1) | 5/5/41 | yes | yes |
| Warrior | `05-05-552001233201210531` | The former Protection default, kept for saved setups (§6.1) | 5/5/36 | yes | yes |
| Warrior | `32-05-552001233201210531` | The former Protection "TPS" preset, kept for saved setups (§6.1) | 5/5/36 | yes | yes |
| Druid | `050022-5520002123032213051-05` | Feral cat default ([druid.md §7.1](../classes/druid.md#71-talents)) | 9/37/5 | renamed¹ | yes |
| Druid | `050022-5520032023132210551-` | Feral bear default, interim (§7.1) | 9/42/0 | renamed¹ | yes |
| Druid | `050012-5523032120132210551-` | The former Feral bear default, kept for saved setups (§7.1) | 8/43/0 | renamed¹ | yes |
| Druid | `5532220115501351-05-` | Balance (druid.md) | 41/5/0 | yes | yes |
| Druid | `05302001-05-5050035103113251` | Restoration (the old site's popular build) | 11/5/35 | yes | yes |
| Paladin | `51003-503-05225331001330321` | Retribution default on 1.60.1.70009's trees, its refunded points placed by measured DPS with Consecration's thresholds ([paladin.md](../classes/paladin.md#retribution-defaults)) | 10/8/33 | new | yes |
| Paladin | `52003-503-05215331001330321` | The 1.60.1.70009 slice's Retribution default (Divine Intellect 2, Holy Conduit 1), kept for saved setups | 10/8/33 | new | yes |
| Paladin | `50003-0530213321301551-5021` | Protection default, the guild's lead theorycrafter's build on 1.60.1.70009's trees, its refunded points placed by measured Balanced value with the row order and thresholds (Holy Conduit 1; [paladin.md](../classes/paladin.md#protection-defaults)) | 8/35/8 | new | yes |
| Paladin | `50003-0530213321301551-50201` | The 1.60.1.70009 slice's Protection default (Conviction 1), kept for saved setups | 8/35/8 | new | yes |
| Paladin | `50003-503-05205331001330321` | The talent migration's interim Retribution default, 3 points unspent, kept for saved setups | 8/8/32 | new | yes |
| Paladin | `50003-0530313321301551-502` | The talent migration's interim Protection default (Anticipation 3), kept for saved setups | 8/36/7 | new | yes |
| Paladin | `-0530513321301551-50215` | The former Protection default (T2's fix round), kept for saved setups | 0/38/13 | yes | yes |
| Paladin | `2-4530513321301551-502` | Protection, the popular build (v1's default) on 1.60.1.70009's trees: Divine Strength 2 where it had Improved Holy Strike 2 | 2/42/7 | new² | yes |
| Paladin | `05320213225131051-5032-05` | Holy (paladin.md) on 1.60.1.70009's trees | 36/10/5 | new | yes |

¹ The same digits, with Mangle and Primal Fury under their 1.60.1.70009 names, Primal Bite and
Blood Frenzy. ² The same digits as the 1.60.1.69913 code, another build: a setup's version says
which trees its code is on ([Tree versions](#tree-versions)). "new" rows are codes written on
1.60.1.70009's trees; the 1.60.1.69913 codes they replace, and `2-4530013321301551-50205`, are
kept in `stored-builds.json`'s `legacy` section, frozen.

The two Balance and Restoration builds take Nature's Splendor with Nature's Majesty at 2/2, so
the client-only arrow into Nature's Splendor ([below](#prerequisite-arrows)) doesn't break them.

Worked decodes, one per class (each entry is `order` Talent rank/max):

**Warrior, Arms 37/14/0: `30305213132515201-05050103-`**

- `30305213132515201` → Arms: 0 Improved Heroic Strike 3/3, 2 Improved Rend 3/3,
  4 Improved Tactical Mastery 5/5, 5 Improved Overpower 2/2, 6 Anger Management 1/1,
  7 Deep Wounds 3/3, 8 Spearing Strike 1/1, 9 Two-Handed Weapon Specialization 3/3,
  10 Impale 2/2, 11 Bloodthrill 5/5, 12 Sweeping Strikes 1/1, 13 Weaponmaster 5/5,
  14 Improved Slam 2/2, 16 Mortal Strike 1/1 (digits at 1, 3 and 15 are 0: Deflection,
  Improved Charge, Improved Hamstring).
- `05050103` → Fury: 1 Cruelty 5/5, 3 Unbridled Wrath 5/5, 5 Piercing Howl 1/1,
  7 Boundless Rage 3/3.
- empty → Protection: no points.

**Druid, Feral Combat 9/37/5: `050022-5520002123032213051-05`**

- `050022` → Balance: 1 Genesis 5/5, 4 Nature's Majesty 2/2, 5 Nature's Reach 2/2.
- `5520002123032213051` → Feral Combat: 0 Ferocity 5/5, 1 Heart of the Wild 5/5,
  2 Feral Swiftness 2/2, 6 Savage Fury 2/2, 7 Feral Charge 1/1, 8 Sharpened Claws 2/2,
  9 Shredding Attacks 3/3, 11 Predatory Strikes 3/3, 12 Blood Frenzy 2/2 (Primal Fury until 1.60.1.70009),
  13 Predatory Instincts 2/2, 14 Leader of the Pack 1/1, 15 King of the Jungle 3/3,
  17 Rend and Tear 5/5, 18 Berserk 1/1.
- `05` → Restoration: 1 Furor 5/5.

**Paladin, Retribution 10/8/33: `51003-503-05225331001330321`**

- `51003` → Holy: 0 Divine Strength 5/5, 1 Divine Intellect 1/5, 4 Improved Seals 3/3.
- `503` → Protection: 0 Toughness 5/5, 2 Precision 3/3.
- `05225331001330321` → Retribution: 1 Benediction 5/5, 2 Improved Judgement 2/2,
  3 Holy Conduit 2/2, 4 Conviction 5/5, 5 Vindication 3/3, 6 Sanctified Judgement 3/3,
  7 Seal of Command 1/1, 10 Sacred Arbiter 1/1, 11 Two-Handed Weapon Specialization 3/3,
  12 Vengeance 3/3, 14 Champion of the Light 3/3, 15 Instrument of Law 2/2, 16 Twist of Light 1/1.

The talent migration left it `50003-503-05205331001330321` (8/8/32) with 3 points unspent; the
paladin's 1.60.1.70009 slice placed them in Divine Intellect 2 and Holy Conduit 1 by measured DPS
(`52003-503-05215331001330321`), and the paladin review's joint search with Consecration's
thresholds in Divine Intellect 1 and Holy Conduit 2.

On 1.60.1.69913's trees the Retribution default was `250003-503-052052310012330321` (10/8/33):
Improved Holy Strike 2/2 at Holy 0 and Crusade 2/2 at Retribution 11 as well, Vindication 2/3,
and every later position one further on.

## Tree versions

A new client build can move a talent, rename it, change its max rank or remove it, and then a code
written on the old trees means another build, or none, on the new ones. The app keeps reading such
codes: **each older build whose codes a setup may hold keeps its code order, frozen**, a code
written on it decodes against that order, and loading maps it onto today's trees by talent name.

- **The frozen orders** are [`src/data/talents/frozen.json`](../../src/data/talents/frozen.json):
  per build, class and tree, the talents in code order as
  `[name, maxRank, spellId, tier, col, prerequisite]` (the prerequisite's name, needed at its max
  rank, or null). The talent scraper writes it on every run from each frozen build's own Trait
  tables (`FROZEN_TALENT_BUILDS` in [`lib/wago.mjs`](../../scripts/scrape/lib/wago.mjs):
  `1.60.1.69913`), whatever build it generates, so `npm run scrape:check` regenerates it byte for
  byte and needs that build in the cache.
- **The frozen codes.** [`stored-builds.json`](../../scripts/scrape/stored-builds.json)'s
  `legacy[<build>]` keeps, frozen, every code the repo stored when the trees were that build's,
  with its ranks by name then. The scraper checks each against the build's frozen order and fails
  if one decodes to other ranks; `src/data/data.test.ts` pins the same, and 1.60.1.69913's order
  position by position.
- **A setup's `version` says which trees its code is on** (`CONFIG_VERSION` and
  `TALENT_TREES_OF_VERSION` in [`src/sim/config/talent-trees.ts`](../../src/sim/config/talent-trees.ts)).
  Version 1, or none, is 1.60.1.69913's; version 2 is today's, 1.60.1.70009's. The app writes
  version 2, in share links, setup codes, saved setups and the automatic save alike, and the code
  itself stays a plain build code, so it still pastes into any talent calculator. A version-2 code
  reads as today's; a newer version is refused as a newer app's, as before. A build code pasted
  into the Talents tab has no version: it's read on today's trees, and only a code that isn't a
  legal build there but is on 1.60.1.69913's trees is read on those and loaded as a version-1 code
  is (below; `readBuildCode` in [`src/features/talents/logic.ts`](../../src/features/talents/logic.ts),
  `readOnOlderTrees`). A code legal on both keeps today's reading. The paste then says so: "Pasted a
  code from the game’s older talent trees", with what it lost, or "Every talent kept its points on
  today’s trees."
- **A code the sim itself shipped reads as its successor** (`TALENT_SUCCESSORS` in
  [`src/sim/config/talent-successors.ts`](../../src/sim/config/talent-successors.ts), review TM2-1),
  before any mapping by name. Mapping by name is right for a player's own build, but it crippled the
  sim's own: the old Retribution default kept 8/8/19, 16 points refunded (−26% DPS). So each code in
  `stored-builds.json`'s `legacy`, exactly, maps to its current version: a spec's **default**, read
  from today's defaults (so a later default change carries through); a class **preset** by name,
  likewise (the popular Protection build, the same digits today); the **same digits** on today's
  trees, for a former default no preset keeps (T2's interim Protection default); or its **mapping
  by name**, which already keeps every point (Holy). The code is looked up in canonical form on its
  own trees (`canonicalFrozenCode`: decoded there, each tree's trailing zeros trimmed, always three
  segments), so `2500030-5030-052052310012330321` is the Retribution default too (review TMV-1).
  The load says so in one line: "Your talents were the Retribution default on the game’s old
  trees; they’re now today’s default." ("…the Protection popular build…; they’re now its version
  for today’s trees."); a notice that already names the spec doesn't name its default again ("Your
  Retribution Paladin talents were the default on the game’s old trees; they’re now today’s default."), and a paste
  speaks of the code ("That code was the Retribution default on the game’s old trees; it’s now
  today’s default.", review TMV-2). Nothing is said when the successor is what the name mapping
  gives (Elemental, and every class whose trees didn't change).
  A unit test checks every `legacy` code has a successor, each names a default of its own class,
  a preset the class still has, or a legal build, and none loses a point.
- **Loading maps any other version-1 code by talent name** (`normalizeConfig` in
  [`src/sim/config/normalize.ts`](../../src/sim/config/normalize.ts), `migrateTalentCode`). The code
  must be a legal build on its own trees (`frozenBuildProblems`: the same rules as
  `validateTalentBuild`); one that isn't is replaced by the default build, as an illegal code always
  was. Each talent keeps its ranks under its name on today's trees, a renamed one under its new
  name (`RENAMED_TALENTS`: 1.60.1.70009 renamed Feral Combat's **Mangle** to **Primal Bite** and
  **Primal Fury** to **Blood Frenzy**, each in its own cell with its own spell, 407995 and 16958).
  Points with no place on today's trees are **refunded**, never moved to another talent: a talent
  the game removed (**Improved Holy Strike**, Holy, and **Crusade**, Retribution, in 1.60.1.70009),
  ranks past a talent's new max, and then, until the build is legal, a talent whose row no longer
  has the points above it or whose arrow's talent lost its points (and the talents that needed
  those in turn). 1.60.1.70009 also swapped Elemental Fury (now tier 6, after Call of Thunder) and
  Elemental Alacrity (now tier 3, before Call of Thunder), so an Elemental build without Elemental
  Alacrity loses Call of Thunder, then Elemental Fury.
- **The load says what was refunded**, in one sentence that names the talents the game changed as
  the cause (`refundNotice`, review TM2-5): "The game’s new talent trees refunded 16 talent points:
  Improved Holy Strike and Crusade left the game, and 5 talents below them lost the points their rows
  need. Spend them again in Talents." (a paste, already in Talents: "Spend them again."). A lowered
  max rank reads "Unyielding Faith now has 2 ranks"; up to three talents that lost their arrow or
  row are named, a lost arrow with the talent it now needs ("Call of Thunder now needs Elemental
  Alacrity, and Elemental Fury and Lightning Overload lost the points their rows need", review
  TMV-5), more are counted; a talent is named once however many specs or causes it's in. A share link, a setup code
  or a saved setup says it in its notice with its other changes
  ([ux.md](../ux.md#persistence-and-sharing)); the automatic save, which is otherwise silent about
  its repairs, says it in the defaults notice, every spec's refunds in the one sentence ("…refunded
  15 of your Retribution Paladin and 2 of your Protection Paladin talent points: …"), unless the
  build follows the default (it then takes today's default, which loses nothing). A mapping that
  loses nothing says nothing.
- **Following the defaults** compares a save from before `following` with the frozen defaults
  (`src/app/legacy-defaults.ts`, ee171d2a's codes, and `FORMER_TALENTS`), which are on
  1.60.1.69913's trees: `legacyFollowing` reads the code as the save wrote it
  (`writtenV1Talents`), before loading maps it, so a save that held a default then takes today's.

**What 1.60.1.70009 did to the stored codes** (every `legacy` code maps to a legal build;
`src/sim/config/talent-trees.test.ts`). "By name" is what mapping by name would give, and what a
player's build of the same shape gets; the sim's own codes load as their successor
(`src/sim/config/talent-successors.test.ts`):

| Code on 1.60.1.69913's trees | By name | Refunded by name | Loads as (successor) |
| --- | --- | --- | --- |
| `250003-503-052052310012330321`, the Retribution default | `50003-503-05205231001` | Improved Holy Strike 2, Crusade 2; then Two-Handed Weapon Specialization 3 and Vengeance 3 (their row needs 20 points above it; Crusade held 2 of them), Champion of the Light 3, Instrument of Law 2 and Twist of Light 1 in turn: 16 points | today's Retribution default |
| `240003-0530213321301551-502`, the Protection default (the guild's lead theorycrafter's) | `4-0530213321301551-502` | Improved Holy Strike 2; then Improved Seals 3 (its row needs 5 points above it, and Divine Strength holds 4) | today's Protection default |
| `2-4530513321301551-502`, the popular Protection build | `-4530513321301551-502` | Improved Holy Strike 2 | today's "Protection popular build" preset (`2-4530513321301551-502`: Divine Strength 2) |
| `2-4530013321301551-50205`, T2's interim Protection default | `-4530013321301551-50205` | Improved Holy Strike 2 | the same digits (Divine Strength 2) |
| `005320213225131051-5032-05`, Holy | `05320213225131051-5032-05` | none | by name |
| `5504301500103031-04-053250000001`, the Elemental default | `5504301300103051-04-053250000001` | none | today's Elemental default (the same code) |
| every Feral code | the same code | none (Primal Bite and Blood Frenzy) | its default or preset, or the same digits |
| every other class's code | the same code | none | its default or preset, or the same digits |

The defaults themselves are rebuilt on the new trees with the same talents by name (the class
docs' default rows), and the paladin's refunded points are then placed by measurement (Retribution's
3 in Divine Intellect 2 and Holy Conduit 1, Protection's 2 in Divine Strength 5 and Conviction 1):
a setup that follows the defaults, or that held one of these defaults before saves said what
follows, takes the new default, as the successor table gives any other setup holding one.

## Prerequisite arrows

From `TraitEdge` (types 2 and 3). The prerequisite must be at **max rank**. All arrows point
down except Holy Shock → Divine Precision, which is **horizontal** (both tier 5), so code that
assumes a prerequisite sits in a lower tier is wrong.

| Class | Arrows (prerequisite → talent) |
| --- | --- |
| Warrior | Improved Tactical Mastery → Anger Management; Improved Rend → Deep Wounds; Sweeping Strikes → Mortal Strike; Enrage → Flurry; Death Wish → Bloodthirst; Improved Bloodrage → Last Stand; Shield Specialization → Master of Defense; Concussion Blow → Shield Slam |
| Druid | **Nature's Majesty → Nature's Splendor** (type 3); Improved Moonfire → Vengeance; Savage Fury → Primal Bite; Sharpened Claws → Blood Frenzy; Predatory Strikes → Rend and Tear; Leader of the Pack → Berserk; Naturalist → Nature's Swiftness; Improved Rejuvenation → Improved Regrowth; Living Spirit → Wild Growth |
| Paladin | Reverence → Illumination; Holy Shock → Divine Precision; Holy Shock → Light's Vigil; Redoubt → Shield Specialization; Improved Seal of Fury → Swift Judgement; Templar's Bulwark → Holy Shield; Sanctified Judgement → Vengeance |

**Nature's Splendor needs Nature's Majesty 2/2.** It is the only type-3 edge in the three trees,
and the foreverchanges calculator didn't show it, so the old dataset had no arrow there. The
client also has a type-0 (visual) edge back from Nature's Splendor to Nature's Majesty. The
talent calculator now locks Nature's Splendor until Nature's Majesty is at 2/2
([`src/features/talents/logic.test.ts`](../../src/features/talents/logic.test.ts)). [F]
[client](client.md#talentsjson) (TraitEdge, 1.60.1.69913)

## Tier gates

Every gate is a `TraitCond` on the talent's node group: "spend `SpentAmountRequired` points of
currency 3820 in the nodes of group G". In all three classes:

- **Tiers 2–6** ask for 5, 10, 15, 20 and 25 points, and G is exactly the nodes of the **lower
  tiers of the same tree**: the Classic rule, which `validateTalentBuild` implements.
- **Tier 7** (Mortal Strike, Bloodthirst, Shield Slam; Moonkin Form, Berserk, Wild Growth;
  Light's Vigil, Holy Shield, Twist of Light) asks for 30 points in **the whole tree**, the
  tier-7 talent included. Read literally, a build with 29 points in tiers 1–6 plus the tier-7
  talent would satisfy it once taken; the Classic rule needs 30 in tiers 1–6. Buying the
  talent needs 30 points already spent under both rules, so they differ only if the game lets
  you refund a point above tier 7 afterwards. **The sim keeps the stricter Classic rule** (a
  finished build needs 30 points in tiers 1–6) until an in-game test shows what the refund
  check does. Only a build with exactly 29 points in tiers 1–6 plus the tier-7 talent is
  affected.
- Druid Balance tier 3 (Improved Entangling Roots, Nature's Splendor) also carries an empty
  `TraitCond` (50974: no currency, no amount); it is ignored.

### Retired nodes

The priest's tree (Trait tree 1114) keeps an old copy of Holy Specialization: node 105865, parked
32 rows below the tree (`PosY` 21300) under the Shadow tab's columns, with no gate of its own; node
110855 teaches the same talent (spell 14889) at Holy's tier 1. The reader leaves out a node more than
11 rows below its tree's top whose talent another node of the tree teaches, and drops it from the
tier gates' counts too (its only group is Prayer of Mending's whole-tree gate). A far node that
copies nothing is a problem, and the run stops.

The hunter's tree (Trait tree 1091) parks two (1.60.1.69913): a copy of Lightning Reflexes (node
104982) 154 columns right of the tree, a copy of node 110859, left out the same way (a node more than
11 empty columns right of every other node is parked too); and Improved Serpent Sting (node 105003,
spell 19464) 62 rows below Marksmanship, which copies nothing: Forever replaced it with Improved Stings
(node 110870) at tier 2. A parked node that copies nothing is left out only when `RETIRED_REPLACED`
(`lib/talent-tree.mjs`) names it with its replacement; any other stops the run.

The hunter's tree also has a backward arrow: Bestial Wrath → Intimidation (edge 124700) beside
Intimidation → Bestial Wrath (124701, Classic Era's), a cycle no build could fill. An arrow into a
talent from a lower tier whose reverse arrow exists is dropped with a note; Intimidation keeps its
other arrow, from Bestial Swiftness.

## From foreverchanges to the client

*History: the one-time switch in M1.5d, kept as its record.* The last foreverchanges dataset
(`git show 403142e:src/data/talents/<class>.json`) was compared with the client one, talent by
talent. Since M1.5f, `npm run diff:talents` compares a fresh generation with the committed
dataset instead ([Re-running](#re-running)). **All 156 talents pair up by
tree and name, with the same cell, `order`, max rank, icon, tooltip header, passive flag,
change kind, Classic match (name, max rank, tier, status, prerequisite) and Classic rank-1 spell;
the tree names, icons and ids and the rules are the same.** The differences:

| Class | Talent | Field | Old → new | Why |
| --- | --- | --- | --- | --- |
| Druid | Nature's Splendor | `prerequisite` | none → Nature's Majesty 2 | The client's type-3 `TraitEdge`; the site didn't draw it ([above](#prerequisite-arrows)). |
| Paladin | Vindication | `ranks.forever` | "reduce the target's Attack Power by -2" (-4, -6) → "by 2" (4, 6) | The client value is negative; game tooltips print `$s1` as its absolute value, as the renderer does. |
| Warrior | Weaponmaster | `ranks.forever` | line breaks and hard wraps → one paragraph per weapon type | Whitespace only: blank lines become one `\n`, single line breaks a space. |
| Druid | Moonkin Form, Feral Charge, Berserk | `ranks.forever` (Moonkin Form also `ranks.classic`) | line breaks → paragraphs | Whitespace only, as above. |
| Paladin | Seal of Command | `ranks.forever`, `ranks.classic` | line breaks → paragraphs | Whitespace only, as above. |

Every other rank text is identical character for character: 432 of the 444 Forever texts and
372 of the 374 Classic ones. The site read the same client tables, which is why they agree.

**Dropped** (site-made, read by nothing): `summary`, `changes`, `evidenceStatus`,
`comparisonStatus`, `discoveredAt`, `sources` and `ranks.foreverEstimated` per talent, and the
site's `popularBuilds` (three per class). The talent presets are now the class docs' documented
builds (`src/sim/defaults.ts`). **Added:** `spellId`, `classic.tree` and `classic.col`, and the
client `meta` envelope. **Changed:** talent ids (`calc-warrior-arms-mortal-strike` →
`warrior-arms-mortal-strike`; ids are opaque and never stored), and `changeKind` is derived from
the client comparison instead of copied (same values for all 156 talents).

## Changes at a glance

The client dataset's own comparison with Classic Era, generated by `npm run diff:talents`
(`.cache/client/1.60.1.70009/talents-changes.md`). Tier·Col is 1-based to match the game UI.
"What changed" is computed from the two clients' rows: a move, a new rank count, a new or lost
arrow, and for the rank texts the highest rank whose text differs: its changed numbers
("Rank 5: 25 instead of 30"), "Same numbers, reworded", or "Effect rewritten" when the number of
values differs too. New-talent rows show the max-rank Forever text. The full texts of every rank
are in the JSON.

### Warrior

Arms 17, Fury 18, Protection 18 (53 talents): 9 new, 36 changed, 1 moved only, 7 same as Classic.

**New in Forever**

| Tree | Tier·Col | Talent | Ranks | Effect at max rank |
|---|---|---|---|---|
| Arms | 4·1 | Spearing Strike | 1 | A brutal attack that deals 40% weapon damage. Deals an additional 80% weapon damage against Giants, Dragonkin, and mounted targets. Mounted targets are dismoun… |
| Arms | 5·1 | Bloodthrill | 5 | Your Main Hand melee attacks against enemies afflicted by your Rend have a 20% chance to allow the use of your Overpower ability on the target. Lasts 6 sec. |
| Arms | 5·3 | Weaponmaster | 5 | Gives your melee weapon attacks a benefit depending on the weapon. Axe/Polearm: Increases your critical strike chance by 5%. Mace/Staff: Your attacks ignore 15… |
| Fury | 3·4 | Boundless Rage | 3 | Increases your maximum Rage by 30. |
| Fury | 4·2 | Raging Blows | 1 | Causes your Whirlwind to also strike with your off-hand weapon, and reduces the Rage cost of your Cleave ability by 2. |
| Fury | 5·1 | Precision | 3 | Improves your chance to hit by 3%. |
| Protection | 3·2 | Master of Defense (needs Shield Specialization) | 2 | Grants you a 100% chance to generate 5 Rage when you Dodge or Parry while a shield is equipped. |
| Protection | 4·3 | Vanguard | 1 | Your Charge ability is now usable while in Defensive Stance. |
| Protection | 6·3 | Focused Rage | 3 | Reduces the Rage cost of your offensive abilities by 3. |

**Changed or moved** (from the client comparison; tiers and columns are 1-based)

| Tree | Tier·Col | Talent | What changed |
|---|---|---|---|
| Arms | 1·1 | Improved Heroic Strike | Same numbers, reworded. |
| Arms | 1·3 | Improved Rend | Rank 2: 23 instead of 25. |
| Arms | 2·1 | Improved Charge | Same numbers, reworded. |
| Arms | 2·2 | Improved Tactical Mastery | Renamed from Tactical Mastery. Rank 5: 15 instead of 25, reworded. |
| Arms | 2·4 | Improved Overpower | Moved from tier 3 to tier 2. |
| Arms | 3·2 | Anger Management | Effect rewritten. |
| Arms | 3·3 | Deep Wounds | Same numbers, reworded. |
| Arms | 4·2 | Two-Handed Weapon Specialization | 3 ranks (Classic: 5). Effect changed. |
| Arms | 4·3 | Impale | No longer requires Deep Wounds. Same numbers, reworded. |
| Arms | 6·1 | Improved Slam | 2 ranks (Classic: 5). Moved from Fury (5·1). Effect changed. |
| Fury | 1·2 | Booming Voice | Same numbers, reworded. |
| Fury | 1·3 | Cruelty | Same numbers, reworded. |
| Fury | 2·2 | Iron Will | Moved from Protection (2·4). Same numbers, reworded. |
| Fury | 2·3 | Unbridled Wrath | Effect rewritten. |
| Fury | 3·1 | Improved Cleave | Rank 3: 3 instead of 120, reworded. |
| Fury | 3·2 | Piercing Howl | Same numbers, reworded. |
| Fury | 3·3 | Blood Craze | Effect rewritten. |
| Fury | 4·1 | Dual Wield Specialization | Effect rewritten. |
| Fury | 4·3 | Enrage | Rank 5: 30 instead of 25, 10 instead of 12, reworded. |
| Fury | 4·4 | Improved Execute | Moved from column 2 to column 4. Rank 1: 3 instead of 2. |
| Fury | 5·2 | Death Wish | 5 instead of 20, reworded. |
| Fury | 6·1 | Improved Berserker Rage | Effect rewritten. |
| Fury | 6·3 | Flurry | Rank 5: 25 instead of 30, reworded. |
| Fury | 7·2 | Bloodthirst | 35 instead of 45, 30 instead of 5, 10 instead of 8, reworded. |
| Protection | 1·2 | Shield Specialization | Rank 5: 5 instead of 1, reworded. |
| Protection | 1·3 | Anticipation | Rank 5: 20 instead of 10. |
| Protection | 2·1 | Improved Bloodrage | Rank 2: 50 instead of 5, reworded. |
| Protection | 2·4 | Improved Thunder Clap | Moved from Arms (2·4). Rank 3: 6 instead of 4, reworded. |
| Protection | 3·1 | Last Stand | Same numbers, reworded. |
| Protection | 3·3 | Improved Revenge | Effect rewritten. |
| Protection | 3·4 | Defiance | 3 ranks (Classic: 5). Effect changed. |
| Protection | 4·1 | Improved Sunder Armor | Same numbers, reworded. |
| Protection | 4·2 | Improved Disarm | Rank 3: 20 instead of 3, reworded. |
| Protection | 5·1 | Improved Shield Wall | Rank 2: 11.0 instead of 5, reworded. |
| Protection | 5·2 | Concussion Blow | Same numbers, reworded. |
| Protection | 5·4 | Bastion | Renamed from One-Handed Weapon Specialization. Moved from tier 6 to tier 5. Same numbers, reworded. |
| Protection | 7·2 | Shield Slam | 421 instead of 225, 439 instead of 235, reworded. |

**Same as Classic:** Deflection, Sweeping Strikes, Improved Hamstring, Mortal Strike, Improved Intercept, Toughness, Improved Shield Bash.

### Druid

Balance 16, Feral Combat 19, Restoration 16 (51 talents): 13 new, 34 changed, 2 moved only, 2 same as Classic.

**New in Forever**

| Tree | Tier·Col | Talent | Ranks | Effect at max rank |
|---|---|---|---|---|
| Balance | 1·3 | Genesis | 5 | Increases the periodic damage and healing done by your spells and abilities by 5%. |
| Balance | 2·3 | Nature's Majesty | 2 | Increases your critical strike chance with spells and melee attacks by 4%. |
| Balance | 3·3 | Nature's Splendor (needs Nature's Majesty) | 1 | Increases the duration of your Moonfire and Rejuvenation spells by 3 sec, your Regrowth spell by 6 sec, and your Insect Swarm spell by 2 sec. |
| Balance | 5·3 | Eclipse | 3 | Your Wrath spell reduces the cast time of your next 2 Starfire spells by 0.50 sec. Stores up to 4 charges. Lasts 15 sec. |
| Feral Combat | 4·2 | Primal Bite (needs Savage Fury) | 1 | Bite the target for 100% normal damage plus 26. |
| Feral Combat | 5·1 | Predatory Instincts | 2 | Increases the critical strike damage bonus of your melee abilities by 20%. |
| Feral Combat | 5·4 | King of the Jungle | 3 | Tiger's Fury now instantly grants you 60 Energy. |
| Feral Combat | 6·1 | Natural Reaction | 5 | Increases your dodge chance by 5%, and gives you a 100% chance to gain 5 Rage each time you dodge. |
| Feral Combat | 6·3 | Rend and Tear (needs Predatory Strikes) | 5 | Increases damage done by your melee abilities on Bleeding targets by 10%. |
| Feral Combat | 7·2 | Berserk (needs Leader of the Pack) | 1 | Requires Cat Form, Bear Form, Dire Bear Form Causes your Primal Bite ability to strike up to 3 targets, removes its cooldown, and increases the critical strike… |
| Restoration | 3·4 | Gift of the Earthmother | 1 | Reduces the global cooldown by 0.5 seconds on your Rejuvenation, Swiftmend, and Wild Growth spells. |
| Restoration | 5·2 | Living Spirit | 3 | Increases your Spirit by 15%. |
| Restoration | 7·2 | Wild Growth (needs Living Spirit) | 1 | Heals the target and their party for 336 over 7 sec. Party members must be within 43.5 yards of target. The amount healed is applied quickly at first, and slow… |

**Changed or moved** (from the client comparison; tiers and columns are 1-based)

| Tree | Tier·Col | Talent | What changed |
|---|---|---|---|
| Balance | 1·2 | Improved Wrath | Moved from column 1 to column 2. Effect rewritten. |
| Balance | 2·1 | Moonglow | Moved from tier 5 to tier 2. Rank 3: 25 instead of 9, reworded. |
| Balance | 2·2 | Improved Moonfire | 2 ranks (Classic: 5). |
| Balance | 2·4 | Nature's Reach | Moved from tier 3 to tier 2. Effect rewritten. |
| Balance | 3·1 | Improved Entangling Roots | Moved from tier 2 to tier 3. Effect rewritten. |
| Balance | 4·1 | Insect Swarm | Moved from Restoration (3·3). 48 instead of 66, reworded. |
| Balance | 4·2 | Vengeance | Same numbers, reworded. |
| Balance | 4·3 | Improved Starfire | Same numbers, reworded. |
| Balance | 5·1 | Overgrowth | Renamed from Improved Nature's Grasp. 2 ranks (Classic: 4). Moved from tier 1 to tier 5. No longer requires Nature's Grasp. Effect changed. |
| Balance | 5·2 | Nature's Grace | Effect rewritten. |
| Balance | 6·2 | Moonfury | No longer requires Nature's Grace. Same numbers, reworded. |
| Balance | 7·2 | Moonkin Form | Effect rewritten. |
| Feral Combat | 1·2 | Ferocity | Same numbers, reworded. |
| Feral Combat | 1·3 | Heart of the Wild | Moved from tier 6 to tier 1. No longer requires Predatory Strikes. Rank 5: 10 instead of 20, 10 instead of 20, reworded. |
| Feral Combat | 2·1 | Feral Swiftness | Renamed from Feline Swiftness. Moved from tier 3 to tier 2. Same numbers, reworded. |
| Feral Combat | 2·2 | Feral Instinct | 3 ranks (Classic: 5). Moved from column 1 to column 2. Effect changed. |
| Feral Combat | 2·3 | Brutal Impact | Moved from column 2 to column 3. Effect rewritten. |
| Feral Combat | 2·4 | Thick Hide | 3 ranks (Classic: 5). Moved from column 3 to column 4. Effect changed. |
| Feral Combat | 3·2 | Savage Fury | Moved from tier 5 to tier 3. Rank 2: 10 instead of 20, reworded. |
| Feral Combat | 3·3 | Feral Charge | Moved from column 2 to column 3. Same numbers, reworded. |
| Feral Combat | 3·4 | Sharpened Claws | 2 ranks (Classic: 3). Moved from column 3 to column 4. Effect changed. |
| Feral Combat | 4·1 | Shredding Attacks | Renamed from Improved Shred. 3 ranks (Classic: 2). Effect changed. |
| Feral Combat | 4·3 | Predatory Strikes | Moved from column 2 to column 3. Same numbers, reworded. |
| Feral Combat | 4·4 | Blood Frenzy | Renamed from Primal Fury. Effect rewritten. |
| Feral Combat | 5·2 | Leader of the Pack | Moved from tier 7 to tier 5. Same numbers, reworded. |
| Restoration | 1·2 | Nature's Focus | Moved from tier 2 to tier 1. Same numbers, reworded. |
| Restoration | 1·3 | Furor | Effect rewritten. |
| Restoration | 2·1 | Naturalist | Renamed from Improved Healing Touch. Effect rewritten. |
| Restoration | 2·2 | Subtlety | 3 ranks (Classic: 5). Moved from tier 3 to tier 2. Effect changed. |
| Restoration | 2·3 | Natural Shapeshifter | Moved from Balance (2·4). |
| Restoration | 3·2 | Reflection | Rank 3: 50 instead of 15. |
| Restoration | 3·3 | Gift of Nature | Moved from tier 5 to tier 3. No longer requires Insect Swarm. Same numbers, reworded. |
| Restoration | 4·3 | Improved Rejuvenation | Moved from column 4 to column 3. |
| Restoration | 4·4 | Swiftmend | Moved from tier 7 to tier 4. No longer requires Tranquil Spirit. Effect rewritten. |
| Restoration | 5·4 | Improved Tranquility | Effect rewritten. |
| Restoration | 6·3 | Improved Regrowth | Requires Improved Rejuvenation. |

**Same as Classic:** Tranquil Spirit, Nature's Swiftness.

### Paladin

Holy 17, Protection 16, Retribution 17 (50 talents): 18 new, 24 changed, 4 moved only, 4 same as Classic.

**New in Forever**

| Tree | Tier·Col | Talent | Ranks | Effect at max rank |
|---|---|---|---|---|
| Holy | 3·1 | Voice of Truth | 1 | Grants you immunity to Silence and Interrupt effects. Lasts 6 sec. |
| Holy | 3·2 | Reverence | 3 | Allows 30% of your Mana regeneration to continue while casting. |
| Holy | 3·3 | Purifying Power | 2 | Reduces the mana cost of your Cleanse and Purify spells by 20% and reduces the cooldown of your Exorcism and Holy Wrath spells by 33%. |
| Holy | 4·1 | Infusion of Light | 2 | Your Holy Shock and Flash of Light critical hits reduce the cast time of your next Holy Light cast within 15 sec by 1.0 sec. |
| Holy | 5·1 | Divine Precision (needs Holy Shock) | 3 | Improves your chance to hit with Holy spells by 18%. |
| Holy | 5·3 | Consecrated Ground | 2 | Gives your Holy spells 10% increased damage against the first 4 enemies that enter your Consecration. |
| Holy | 7·2 | Light's Vigil (needs Holy Shock) | 1 | Applies Light's Vigil to the target for 30 sec. Your next Holy Shock cast on them triggers no cooldown and causes enemy targets to suffer 175 to 189 Holy damag… |
| Protection | 3·1 | Improved Seal of Fury | 1 | When Seal of Fury's shield is fully absorbed, restore 60 Mana, increased by 15% per level the attacker is above you, up to 45%. |
| Protection | 3·4 | Sacred Duty | 2 | Increases your total Stamina by 4% and reduces the cooldown of your Divine Shield, Divine Protection, and Templar's Bulwark spells by 60 sec. |
| Protection | 4·1 | Swift Judgement (needs Improved Seal of Fury) | 1 | Finishes the remaining cooldown on your Judgement ability and reduces the Mana cost of your next Judgement by 100%. |
| Protection | 5·2 | Templar's Bulwark | 1 | When activated, this ability grants you an absorb shield equal to 100% of your maximum health for 8 sec. Applies Forbearance for 1 min. Cannot be cast while Fo… |
| Protection | 6·3 | Iron Creed | 5 | Increases the threat generated by your Holy Strike ability 25%. While Righteous Fury is active, Holy Strike also reduces your damage taken by 10% for 6 sec. |
| Retribution | 2·2 | Holy Conduit | 2 | Reduces the mana cost of your Consecration, Holy Wrath, Exorcism, and Hammer of Wrath spells by 40%. |
| Retribution | 3·2 | Sanctified Judgement | 3 | Gives your Judgement ability a 100% chance to return 60% of the Mana cost of the judged seal. |
| Retribution | 4·3 | Sacred Arbiter | 1 | Increases the damage of your Holy Strike ability by 20% and causes it to refresh all Judgement effects on the target. |
| Retribution | 6·2 | Champion of the Light | 3 | Increases your spell damage and healing by up to 100% of your Intellect. |
| Retribution | 6·3 | Instrument of Law | 2 | Reduces the cast time of your Hammer of Wrath by 1.0 sec, and reduces all threat you generate by 20% while Righteous Fury is not active. |
| Retribution | 7·2 | Twist of Light | 1 | Reduces the Mana cost of your Seal spells by 20%, and when you replace your Seal of Command, Seal of Righteousness, Seal of Fury, or Seal of Justice with a dif… |

**Changed or moved** (from the client comparison; tiers and columns are 1-based)

| Tree | Tier·Col | Talent | What changed |
|---|---|---|---|
| Holy | 2·1 | Healing Light | Moved from tier 3 to tier 2. Same numbers, reworded. |
| Holy | 2·2 | Spiritual Focus | 2 ranks (Classic: 5). Effect changed. |
| Holy | 2·3 | Improved Seals | Renamed from Improved Seal of Righteousness. 3 ranks (Classic: 5). Effect changed. |
| Holy | 2·4 | Unyielding Faith | Moved from tier 3 to tier 2. Rank 2: 30 instead of 10, reworded. |
| Holy | 4·2 | Illumination | Requires Reverence. Effect rewritten. |
| Holy | 4·3 | Divine Favor | Moved from tier 5 to tier 4. No longer requires Illumination. |
| Holy | 5·2 | Holy Shock | Moved from tier 7 to tier 5. No longer requires Divine Favor. 129 instead of 204, 139 instead of 220, 110 instead of 204, 118 instead of 220. |
| Holy | 6·3 | Holy Power | Effect rewritten. |
| Protection | 1·2 | Toughness | Moved from tier 2 to tier 1. |
| Protection | 1·3 | Redoubt | Effect rewritten. |
| Protection | 2·1 | Precision | Same numbers, reworded. |
| Protection | 2·2 | Guardian's Favor | Rank 2: 2 instead of 120, reworded. |
| Protection | 2·4 | Anticipation | Moved from tier 3 to tier 2. Rank 5: 20 instead of 10. |
| Protection | 3·2 | Improved Righteous Fury | Rank 3: 6 instead of 50, reworded. |
| Protection | 3·3 | Shield Specialization | Effect rewritten. |
| Protection | 4·2 | One-Handed Weapon Specialization | 3 ranks (Classic: 5). Moved from tier 6 to tier 4. |
| Protection | 4·3 | Improved Hammer of Justice | Moved from column 2 to column 3. |
| Protection | 5·3 | Reckoning | Effect rewritten. |
| Protection | 7·2 | Holy Shield | Requires Templar's Bulwark (Classic: Blessing of Sanctuary). 20 instead of 30, 110 instead of 65. |
| Retribution | 1·2 | Deflection | Moved from tier 2 to tier 1. |
| Retribution | 1·3 | Benediction | Rank 5: 10 instead of 15, reworded. |
| Retribution | 2·1 | Improved Judgement | Same numbers, reworded. |
| Retribution | 2·3 | Conviction | Moved from tier 3 to tier 2. Same numbers, reworded. |
| Retribution | 3·1 | Vindication | Effect rewritten. |
| Retribution | 3·4 | Pursuit of Justice | Rank 2: 15 instead of 8, reworded. |
| Retribution | 4·1 | Eye for an Eye | Rank 2: 10 instead of 30, reworded. |
| Retribution | 5·2 | Vengeance | 3 ranks (Classic: 5). Moved from tier 6 to tier 5. Requires Sanctified Judgement (Classic: Conviction). Effect changed. |
| Retribution | 5·3 | Repentance | Moved from tier 7 to tier 5. |

**Same as Classic:** Divine Strength, Divine Intellect, Seal of Command, Two-Handed Weapon Specialization.

### Classic talents not in the Forever trees

Classic Era talents of the class with no Forever talent matched to them (by spell or name):

| Class | Talents |
| --- | --- |
| Warrior | Axe Specialization, Mace Specialization, Sword Specialization, Polearm Specialization (Arms); Improved Demoralizing Shout, Improved Battle Shout (Fury); Improved Shield Block, Improved Taunt (Protection) |
| Druid | Nature's Grasp, Natural Weapons, Improved Thorns, Omen of Clarity (Balance); Feral Aggression, Blood Frenzy, Faerie Fire (Feral) (Feral Combat); Improved Mark of the Wild, Improved Enrage (Restoration) |
| Paladin | Consecration, Improved Lay on Hands, Improved Blessing of Wisdom, Lasting Judgement (Holy); Improved Devotion Aura, Blessing of Kings, Improved Concentration Aura, Blessing of Sanctuary (Protection); Improved Blessing of Might, Improved Seal of the Crusader, Improved Retribution Aura, Sanctity Aura (Retribution) |

## Caveats

- **Beta data.** Client build 1.60.1.70009, eleven days into the beta. Blizzard will keep tuning
  before the 2026-11-04 launch; re-run and diff.
- **Raw client files, no hotfixes.** Server hotfixes aren't in the raw files
  ([client.md § Hotfix caveat](client.md#hotfix-caveat)). The foreverchanges dataset, which
  saw hotfixes, agreed with every cell, rank, text and every arrow but one, so no talent hotfix
  showed in this build. A later build's hotfixes can't be checked that way any more.
- **Tooltip text is raw client data.** Some values look unresolved or mis-scaled, e.g. Improved
  Shield Wall "by 11.0 min", Wild Growth "within 43.5 yards". Per-level values are read at level
  60 by a documented rule whose base level is `[?]` where `SpellLevel` and `BaseLevel` differ
  (Vindication: 200 at 3/3 by `SpellLevel`, 204 by `BaseLevel`; [open questions
  B74](../open-questions.md#b74-per-level-tooltip-values)). Talents with dummy effects print numbers the server scripts (King of the Jungle,
  Feral Instinct, Eclipse; [client.md](client.md#talentsjson)). Check suspicious numbers in
  game before the engine relies on them, and put corrections in the override layer.
- **`$?` conditions are taken as unmet.** Feral Charge and Berserk show their "Requires … Form"
  line; in game it is white while shapeshifted (and Berserk's white variant is misspelled
  "Reuires" in the client).
- **"What changed" is mechanical.** "Same numbers, reworded" and "Effect rewritten" compare
  strings, not mechanics; read `ranks.forever` and `ranks.classic`.
- **Talent names collide across classes** (Precision is Fury and paladin Protection; Deflection,
  Toughness, Anticipation, Vengeance, Shield Specialization and Two-Handed Weapon
  Specialization exist in two classes), but never within a class, which the engine relies on.
- **Level cap and points.** `rules.maxPoints` is 51 at level 60 (`TraitCurrency` 3820).

## Re-running

```sh
npm run scrape:talents   # node scripts/scrape/talents-client.mjs: the three files, from the cache
npm run diff:talents     # regenerate, diff against the committed files, and the "changes at a glance" tables
npm run diff:talents -- --version=<build>   # a new Forever beta build, diffed against the committed one
```

It prints, per class, the Trait tree, counts, arrows, the Classic talents left out, notes (gates
that count the whole tree, off-grid nodes, conditions taken as unmet), each stored build
code's check and the number of code positions per tree, and exits 1 without writing if a check
fails (`--accept-code-changes` lets a position or a stored code change meaning, once the app
and `stored-builds.json` handle it; `--skip-committed-check` writes without a committed dataset
to compare with). The
diff (`.cache/client/<build>/talents-diff.md`) pairs talents by tree and name, then by cell,
and lists every changed field, rank text and stored code. After a new build: re-run
`npm run scrape:client` too (its `talents.json` maps these ids), review `git diff src/data`,
paste the new "changes at a glance" tables here, and update any doc whose values moved.
`npm run scrape -- --version=<build> --diff` does all of this for every dataset.
