# Spells dataset

`src/data/spells/{warrior,druid,paladin}.json` hold every spell each class learns in WoW
Forever, rank by rank, next to the same rank in Classic Era. Everything is read from the client
files: the spellbook from the Forever beta client's **`SkillLineAbility`** table and its active
talents, the comparison from the same tables of the Classic Era client
([decision D17](../decisions.md#d17-retire-foreverchangespro-as-a-data-source-2026-09-22)).
Interfaces are in [`src/data/spells/types.ts`](../../src/data/spells/types.ts); the generator is
[`scripts/scrape/spells-client.mjs`](../../scripts/scrape/spells-client.mjs) with the book
reader [`lib/spellbook.mjs`](../../scripts/scrape/lib/spellbook.mjs), the talent reader
[`lib/talent-tree.mjs`](../../scripts/scrape/lib/talent-tree.mjs) and the text renderer
[`lib/spell-text.mjs`](../../scripts/scrape/lib/spell-text.mjs).

| | |
| --- | --- |
| Source | `https://wago.tools/api/casc/<fdid>?version=<build>` (raw client files, [D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)), parsed with [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) |
| Forever build | `wow_classic_beta` · `1.60.1.69913` (wago.tools lists it as created 2026-09-18) |
| Classic build | `wow_classic_era` · `1.15.9.69722` |
| Generated | 2026-09-23 (`meta.scrapedAt` is the latest download among the files read: the Classic Era `ItemSubClass` table, fetched 02:51 UTC) |

The app reads only each file's `meta` (the About sheet's build and date). The engine keeps its
own ability constants; `npm run scrape:client` reads every Forever rank's spell id from these
files for its interest set ([client.md](client.md#spellsjson)).

## How the data was obtained

### Requests

Through the client-data download layer ([client.md § Requests](client.md#requests)): the
documented wago.tools API only, one request at a time, cached under `.cache/client/`, once per
build. The spellbooks and races together added **4 requests**, all HTTP 200, all Classic Era
tables the cache didn't have yet: `SkillLineAbility` (FileDataID 1266278), `SkillLine`
(1240935), `ChrRaces` (1305311) and `ItemSubClass` (1261604). Every `.dbd` definition was cached.
A later run makes no requests.

### Tables read

| Build | Tables |
| --- | --- |
| Forever 1.60.1.69913 | `SkillLineAbility`, `SkillLine`, `SpellLevels`, `SpellMisc`, `SpellPower`, `SpellCooldowns`, `SpellCastTimes`, `SpellRange`, `SpellShapeshift`, `SpellShapeshiftForm`, `SpellEquippedItems`, `ItemSubClass`, `ChrClasses`, `SpellClassOptions`, `ChrRaces`, `CharBaseInfo`, the Trait tables of [talents.md](talents.md#requests) and the text renderer's `Spell`, `SpellName`, `SpellEffect`, `SpellDuration`, `SpellAuraOptions`, `SpellRadius`, `SpellTargetRestrictions`, `SpellDescriptionVariables`, `SpellXDescriptionVariables` |
| Classic Era 1.15.9.69722 | the same spellbook and text tables, `Talent` and `TalentTab` |

`meta.tables` lists every table with its FileDataID, per build.

### The book

A class's spellbook is built the same way from each client:

1. **Candidate rows.** `SkillLineAbility` rows of a class-skill line (`SkillLine.CategoryID` 7:
   Arms, Feral Combat, Holy, Mounts, …) whose `ClassMask` has the class. A row with no class
   mask counts only in the class's talent-tree lines and for a spell of the class's family
   (`SpellClassOptions.SpellClassSet`): that keeps Innervate, Omen of Clarity and Holy Light
   rank 5, and leaves out the Mounts line's mounts of every class and family-less proc effects
   (Classic Era Sweeping Strikes 12723). The Season of Discovery engraving lines ("Engraving",
   "Runes") hold rune slots, not spells, and are skipped.
2. **Left out**, with the reason recorded in `.cache/client/<build>/spells-left-out.json`: rows
   the game grants through another spell (`AcquireMethod` 3: rune abilities, Execute's damage
   spell, Judgement effects), spells without a `SpellName` (encrypted or absent; the book's
   `meta.noClientData` lists them, [below](#trainer-rows-with-no-client-data)), spells hidden
   from the spellbook (`SPELL_ATTR0_DO_NOT_DISPLAY`: stance passives, talent effects), spells
   with no training level (`SpellLevels`), spells with no tooltip, and in Classic Era the
   Season of Discovery spells (below).
3. **Components.** A spell whose numbers another candidate's tooltip reads is part of that
   spell (Aquatic Form (Passive) 5421, read by Aquatic Form's "$5421s1").
4. **Ranks.** Rows are grouped by name. A spell with numbered ranks ("Rank N" in
   `Spell.NameSubtext_lang`) keeps only those (an unnumbered row under its name is a component,
   such as Holy Light's heal 19968 in Classic Era). When two spells share a rank number the book
   keeps the first: Seal of Righteousness Rank 1 is 20154, learned automatically at level 1, and
   21084, the trainer's copy that supersedes it with the same seal values, is left out.
5. **Talents.** Each active talent (not `SPELL_ATTR0_PASSIVE`) of the class's tree is a
   spellbook spell (the Forever Trait tree, [talents.md](talents.md#derivation); the Classic Era
   `Talent` table): its spell joins the rows of the same name or becomes a spell of its own.
   `isTalent` marks them; `grantedByTalent` marks those whose every rank comes with the talent
   point, whose `level` is null. Passive talents are only kept aside for the comparison (a
   Classic Era passive talent can be a trained spell's counterpart: Tactical Mastery).
6. **Tabs** are the talent trees' skill lines in tree order, then the class's other lines
   (Paladin: Mounts), with the skill line's icon. Spells are sorted by tab, first trained level
   (talent-only spells last) and name. A spell's id is `<class>-<name slug>`.
7. **Races.** `races` names the races that can learn a spell, from the rows' race masks against
   the races that can be the class (`CharBaseInfo`); null means all of them. Only Summon Charger
   is limited (Dwarf and Human: no Undead paladin charger in this build).

### Classic Era baseline

The Classic Era 1.15 client ships Season of Discovery's spells in the same tables. No original
Classic class spell has an id of 400,000 or more, so the Classic book stops below it (doctrine:
never Season of Discovery values): that leaves out Meathook, Commanding Shout, Valor of Azeroth,
Avenging Wrath, Divine Steed, the Classic copy of Revive and the rest. Forever reuses some of
those ids for its own spells (Victory Rush 402927, Lacerate 414644, Revive 437138), which are
Forever data. One more Classic Era row passes every rule but no trainer teaches it: cut content
22570 "Mangle", a Feral finishing move at level 6 with the placeholder icon
`ability_druid_mangle.tga` (the Forever client dropped the row). The generator lists it in
`CLASSIC_CUT_CONTENT`.

### Ranks

Forever and Classic Era rows pair by rank number (Forever's Slam rank 1, 1240193 at level 20,
against Classic's rank 1, 1464 at 30). An unnumbered Forever row pairs with the Classic row of the
same spell id (Frenzied Regeneration 22842 with Classic's rank 1); a spell with one unnumbered
Forever row and no such Classic row pairs with the highest Classic rank (Tactical Mastery 1310185
with the Classic talent's rank 5, 12679). Classic ranks left over stand alone with
`forever: null` (Tiger's Fury ranks 2 to 4, Frenzied Regeneration ranks 2 and 3); Forever ranks
without a Classic one have `classic: null`. `differences` lists what differs when both sides
exist: level, cost, cast time, cooldown, range, school, form, required item, and the tooltip
("A instead of B" per changed number, "Same numbers, reworded" or "Tooltip rewritten").

### Status

| `status` | Meaning |
| --- | --- |
| `talent` | a Forever talent's spell |
| `new` | no Classic Era spell or talent of that name |
| `baseline` | a talent in Classic Era, trained now |
| `earlier` | first trained at a lower level than in Classic Era |
| `changed` | a rank differs in any compared field or exists on one side only |
| `same` | every rank pairs up with no difference |

`counts.changed` is every status except `same`, `new` and `talent`; `differentFromClassic` is
new + changed. These definitions come from foreverchanges.pro, the former source, and every
spell of the three books kept the status the site gave it when the client rebuild replaced it.

### Rank fields

| Field | From | Printed as |
| --- | --- | --- |
| `level` | `SpellLevels.BaseLevel`, else `SpellLevel` | null on talent-only spells |
| `rankLabel` | `Spell.NameSubtext_lang` | "Rank 5", "Shapeshift", "Passive", "Summon" |
| `cost` | first `SpellPower` row | "15 Rage" (rage in tenths), "150 Mana", "55% of base mana", "20% of base health" (Bloodrage's power type is health) |
| `castTime` | `SpellMisc.CastingTimeIndex` → `SpellCastTimes`, `SPELL_ATTR1_CHANNELED` | "Instant", "1.5 sec cast", "Channeled" (seconds null) |
| `cooldown` | the larger of `SpellCooldowns.RecoveryTime` and `CategoryRecoveryTime` | "6 sec cooldown", "2 min cooldown", "1 hr cooldown" |
| `range` | `SpellMisc.RangeIndex` → `SpellRange` | "Melee range" (flag 1), "30 yd range", "8-25 yd range" with `minYards`; null for self |
| `school` | `SpellMisc.SchoolMask` | "physical", "holy", "nature", … |
| `icon` | `SpellMisc.SpellIconFileDataID` named by the build's file list | "ability_warrior_sunder" |
| `forms` | `SpellShapeshift.ShapeshiftMask` → `SpellShapeshiftForm` names | ["Battle Stance", "Defensive Stance"]; null when none |
| `requires` | `SpellEquippedItems` | "Melee Weapon", "Shields", "Two-Handed Melee Weapon" |
| `text` | `Spell.Description_lang`, rendered | see below |

Tooltips are rendered at level 60: an effect's per-level points count from its
`SpellLevels.SpellLevel` up to 60 or its `MaxLevel`, truncated to a whole number
([items.md § Per-level values](items.md#per-level-values); review finding L9). Demoralizing
Shout rank 5 reads 204, not its base 196; Cat Form 120 (its passive's 12 + 2 per level from 6),
which is Classic Era's 120 too, so Cat Form is now `same`; Dire Bear Form 180 attack power and
1240 health; Battle Shout's lower ranks and the druid's and paladin's damage and healing ranks
read their level-60 values on both sides. They are rendered with `$?` conditions taken as unmet
(a reader with no auras or talents), the client's line layout kept (a blank line is "\n\n", a
single line break "\n" after a line that ends, as in Rip's per-combo-point lines and Tiger's
Fury's "Requires Cat Form" line; a break inside a sentence is a space), `${…}` without a `.N`
precision shown as a whole number as the game does
(Rip's 44.4 is 44), `$f1` read as the effect's chain amplitude (Execute's "$*10;F1" rage
factor), a duration of −1 shown as "until cancelled", description variables written as
conditions evaluated (Classic Era Rip's `$ticks`), and `$AP` taken as 0 (Victory Rush reads
"causing 1 damage", as the site had it). A Forever rank whose tooltip doesn't render fails the
run, with two exceptions the client files can't resolve, listed in the book's
`meta.unresolvedTokens` (`{ spellId, token, why }`, sorted by spell id):

- `$z`, the player's home location, which only the game knows: the text reads "your home
  location" (Astral Recall, 556).
- A token that reads a spell the build doesn't have renders as nothing, and doesn't fail the
  run. Windfury Totem rank 3's "within $10611a1 yards" (10614) reads the radius of 10611, the Classic
  enchant spell Forever removed ([buffs doc › Windfury Totem](../mechanics/buffs-debuffs-consumables.md#windfury-totem)),
  and ranks 1 and 2 do the same with their own enchant spells (8512 reads 8514, 10613 reads 10607).

Only the shaman's book has any so far; any other unrendered Forever token still fails the run.

## Schema summary

```text
SpellBook
  meta      { source, scraper, scrapedAt, product, foreverBuild, foreverBuildDate,
              classicProduct, classicBuild, tables { forever, classic }, wowDbDefs,
              noClientData[{ spellId, skillLine, acquireMethod, supersedes, encrypted,
                             classic { name, rank, talentRank } | null }],
              unresolvedTokens[{ spellId, token, why }] }
  class     "warrior" | "druid" | "paladin" | "shaman"
  counts    { total, new, changed, notInForever, differentFromClassic }
  tabs[]    { name, slug, icon, spellCount }
  spells[]  Spell
  missing[] MissingSpell: Classic Era spellbook spells with no Forever counterpart

Spell
  id, name, tab, icon, level, status, races, maxRank, isTalent, grantedByTalent
  classic   { tab, wasTalent } | null      // the Classic Era spell of that name
  ranks[]   { rank, forever, classic, differences[{ field, text }] }

SpellRank (forever / classic side)
  spellId, rankLabel, level, text, cost, castTime, cooldown, range, school, icon, forms, requires
  cost      { raw, amount, resource: rage|energy|mana|health, percentOfBase? } | null
  castTime  { raw, seconds, channeled }
  cooldown  { raw, seconds } | null
  range     { raw, yards, melee, minYards? } | null

MissingSpell { name, tab, icon, level, rank, wasTalent, classic: SpellRank & { name } }
```

The app reads only `meta`, and the browser build drops its `tables`, `wowDbDefs` and
`noClientData` (`vite.config.ts` `SLIMMERS`). `foreverBuildDate` is the build's creation date in
wago.tools' build list, whichever build a machine has cached as "latest".

## Counts

| Class | Spells | Tabs | same | changed | baseline | earlier | new | talent | Not in Forever |
| --- | --: | --- | --: | --: | --: | --: | --: | --: | --: |
| Warrior | 42 | Arms 14 · Fury 16 · Protection 12 | 17 | 13 | 1 | 1 | 1 | 9 | 0 |
| Druid | 60 | Balance 15 · Feral Combat 30 · Restoration 15 | 18 | 30 | 2 | 0 | 2 | 8 | 1 |
| Paladin | 56 | Holy 23 · Protection 23 · Retribution 8 · Mounts 2 | 13 | 29 | 2 | 0 | 3 | 9 | 3 |

493 Forever ranks (117, 206, 170). `classic` is null on 40 rank pairs (new spells, new top
ranks: Warrior Slam rank 5, Paladin Holy Shock rank 4; talent spells new in Forever; the second
Summon Warhorse) and `forever` on 5 (Druid Tiger's Fury ranks 2 to 4, Frenzied Regeneration ranks
2 and 3). Talent spells (`isTalent`): Warrior 9 (6 `grantedByTalent`), Druid 8 (6), Paladin 9
(5), exactly the active talents of each tree.

`missing`: Druid *Faerie Fire (Feral)* (a Classic talent). Paladin *Blessing of Sanctuary* (a
Classic talent), *Greater Blessing of Sanctuary* and *Sanctity Aura* (a Classic Retribution
talent; the Forever client has its spell 20218 but no talent or trainer row teaches it).

### Forever-only spells

- **Warrior:** Victory Rush (new, level 20); Spearing Strike (new Arms talent). Tactical Mastery
  is trained at level 14 (10 rage kept; a talent in Classic). Slam has a new rank 1 at level 20,
  so every rank comes earlier.
- **Druid:** Lacerate (new, level 42, 3 ranks) and Revive (new, 5 ranks). Mangle, Berserk and
  Wild Growth are talent spells new in Forever (Wild Growth's ranks 2 and 3 are trained at 50 and
  60). Nature's Grasp and Omen of Clarity are trained.
- **Paladin:** Holy Strike (new, 8 ranks), Seal of Fury (new, 7 ranks) and Hammer of the
  Righteous (new, level 40). Light's Vigil, Voice of Truth, Swift Judgement and Templar's
  Bulwark are Forever talent spells. Consecration and Blessing of Kings are trained.

### Trainer rows with no client data

`SkillLineAbility` has 58 rows of the three classes, taught by a trainer or learned
automatically, whose spell the Forever client has **no data for at all**: no `SpellName`,
`Spell` or `SpellEffect` row, none of them encrypted. The book can't show them, so they used to
be dropped with the other left-out rows (review finding L34). Each book now lists them in
`meta.noClientData`, with the row's skill line, acquire method, the rank it supersedes and the
Classic Era spell of that id. 31 are ranks of Classic Era talents that Forever's Trait trees
replaced (Dual Wield Specialization 2–5, Anticipation 2–5, Holy Power 2–5, …), leftovers of the
old tables. The other **27 look like spells a trainer teaches** `[?]`:

| Class | Spell ids | Classic Era spell of that id |
| --- | --- | --- |
| Druid | 6793, 9845, 9846 (a rank chain from Tiger's Fury 5217) | Tiger's Fury ranks 2–4 |
| Druid | 17390, 17391, 17392 | Faerie Fire (Feral) ranks 2–4 |
| Druid | 22895, 22896 (a chain from Frenzied Regeneration 22842) | Frenzied Regeneration ranks 2–3 |
| Druid | 22571 → 1238074 → 1238075 → 1238077 | Mangle rank 1 (22571); the rest none |
| Druid | 1263849 → 1263850; 22839; 414854 (learned automatically) | none; Barkskin Effect (DND); none |
| Paladin | 407669 | Avenger's Shield (a Season of Discovery spell in Classic Era) |
| Paladin | 25781, 25899 | Righteous Fury, Greater Blessing of Sanctuary rank 1 |
| Paladin | 26017, 26018 | Vindication ranks 2–3 (the debuff) |
| Paladin | 1239550, 1239551, 1239552, 1239553, 1263893, 1263894 | none |

Warriors have none (their four are Dual Wield Specialization ranks). Like the 16 items no client
carries ([items.md](items.md#items-no-client-carries-yet)), these may exist only as server
hotfix rows, which the raw files don't include ([client.md § Hotfix
caveat](client.md#hotfix-caveat)); or they may be rows Forever abandoned. Flagged, never
guessed (D17): the books don't show them, and the generator prints them each run. Whether a
trainer teaches them is [open questions B75](../open-questions.md#b75-trainer-spells-the-client-has-no-data-for).

### Stances and forms

`forms` shows where Forever changed where a spell can be used: Thunder Clap is usable in
Defensive Stance too; Faerie Fire in Cat, Bear and Dire Bear Form too; Feral Charge in Cat Form
too; Tiger's Fury, Barkskin, Nature's Grasp and Omen of Clarity need no form; Insect Swarm is
usable in Moonkin Form; and Mark of the Wild, Gift of the Wild, Rebirth, Innervate and the
cures in Moonkin Form as well as the (unused) Tree Form.

## From foreverchanges to the client

*History: the one-time switch in M1.5e, kept as its record.* The last foreverchanges dataset
(`git show ad46f63:src/data/spells/<class>.json`) was compared with the client one, spell by
spell and rank by rank; the conventions below were how that diff told the site's text
conventions apart from real changes. Since M1.5f, `npm run diff:spells` compares a fresh
generation with the committed dataset instead ([Re-running](#re-running)). **The same 158 spells
in the same tabs, with the same status for every spell, the same tabs and counts (but Paladin
`notInForever`, below), the same first training level (but one) and the same `isTalent`,
`grantedByTalent` and `races`; every Forever rank but one (22845, below) keeps its spell id and
level, and every cost, cast time, cooldown and range the site had, on either side, is unchanged
but for the Bloodrage and minimum-range corrections below.** Every difference falls into one of
these kinds:

| Kind | Where | Old → new | Why |
| --- | --- | --- | --- |
| Tooltip requirement line | 152 rank texts | "…threat.\n\nRequires Melee Weapon" → "…threat." | The site appended the tooltip's requirement line to the text; it is now `requires` (or `forms`: "Requires Bear Form, Dire Bear Form"). |
| Plural after 1 | 50 rank texts (druid) | "Awards 1 combo points", "The next 1 melee attacks that strike" → "1 combo point", "1 melee attack that strikes" | The renderer follows the number (`$l…;`); the site always printed the plural. |
| One-hour durations | 36 rank texts | "for 1 hr" → "for 1 hour" | The renderer's duration wording, shared with the talent and item datasets. |
| Decimals | 16 rank texts (Seal of Righteousness) | "1.2 to 4.3 Holy damage" → "1.24 to 4.32" | The renderer keeps two decimals of a `$/N;s1` scaling; the site one. |
| Classic Era Rip | 6 Classic rank texts | "1 point : 45 damage … 5 points: 157" → "270 … 942" | Classic Rip multiplies by the description variables `$ticks` (6) and `$mult` (1.0); the site didn't evaluate them and printed per-tick values, which the old dataset's caveat suspected. |
| `rankLabel` | 820 ranks | null → "Rank 5", "Shapeshift" | Now always the client's subtext; the site set it only for some. |
| Bloodrage cost | 2 ranks | "20% of base mana" (mana) → "20% of base health" (health) | The client's power type is health (−2); the site's label was wrong, as its caveat suspected. |
| Minimum range | Charge, Intercept (both sides), Feral Charge | "25 yd range" → "8-25 yd range" (`minYards` 8) | `SpellRange.RangeMin`; the site printed only the maximum. |
| Talent spells' Classic side | Sweeping Strikes, Piercing Howl, Death Wish, Last Stand, Concussion Blow, Moonkin Form, Feral Charge, Swiftmend, Nature's Swiftness, Divine Favor, Repentance | text only → spell id, cost, cast time, cooldown, range | The Classic Era talent's own spell, read like any rank. |
| Classic-only ranks | Tiger's Fury ranks 2–4, Frenzied Regeneration ranks 2–3 | not listed → pairs with `forever: null` | The site mentioned them only in its prose. |
| Frenzied Regeneration | Druid | first row 22845 (no text, no level), spell `level` null → 36 | 22845 is the heal the ability triggers: no tooltip and no training level, so it isn't a spellbook rank. |
| Second Summon Warhorse | Paladin, 1279399 | paired with Classic 13819 → `classic: null` | 1279399 (every race) has no Classic spell; 13819 (Human, Dwarf) pairs with itself. |
| Classic talent levels | Omen of Clarity, Blessing of Kings | Classic `level` 20 → null | Both were talent-only spells in Classic Era, and talent-only ranks carry no training level. |
| Mangle | Druid | rank null → 1 | The client names Forever's 407995 "Rank 1". |
| `maxRank` of talent-only spells | 16 spells | 1 → null | `maxRank` is the highest numbered rank; the site used the talent's point count. |
| Spell ids | 15 talent spells | "calc-warrior-arms-spearing-strike" → "warrior-spearing-strike" | One id scheme for every spell; nothing stores spell ids. |

Rank-text kinds combine where a text has two (a requirement line and a one-hour duration, for
example). The only text differences that aren't a convention are the six Classic Rip ranks.

**Dropped** (site-made, read by nothing): each spell's `url`, `badge`, `summary`, `reasons`,
`changelog`, `sources` and `featuredRank`, and `meta.changesSource`. **Added:** each rank's
`school`, `icon`, `forms` and `requires`, each spell's `classic` (tab, was a talent), and the
client `meta` envelope. **Changed:** `missing` adds Sanctity Aura, which the site left out.

## Caveats

- **Beta data.** Client build 1.60.1.69913. Re-run and diff after each beta build.
- **Raw client files, no hotfixes** ([client.md § Hotfix caveat](client.md#hotfix-caveat)).
  The foreverchanges dataset, which saw hotfixes, agreed with every cost, cast time, cooldown
  and range, so no spellbook hotfix showed in this build. A later build's hotfixes can't be
  checked that way any more.
- **Tooltip numbers are tooltips.** `differences` compare rendered tooltips. Values the server
  scripts (dummy effects) or scales with stats (Victory Rush's "1 damage": attack power taken as
  0) aren't in them; the engine keeps its own constants.
- **Race masks.** Summon Charger's rows exclude Undead, the new Horde paladins; whether they get
  a charger in game is open.
- `[?]` **Trainer rows with no client data** (Tiger's Fury ranks 2–4, Avenger's Shield, the
  1238074 chain, …; [above](#trainer-rows-with-no-client-data)): possibly hotfix-only, or
  abandoned rows ([open questions B75](../open-questions.md#b75-trainer-spells-the-client-has-no-data-for)).
- `[?]` **Per-level values.** The tooltips count per-level points from `SpellLevel` and truncate
  them, which gives the level-60 tooltip's 204 for Demoralizing Shout; where `BaseLevel` differs
  (Vindication's aura 440667) the client's own rule is unconfirmed
  ([open questions B74](../open-questions.md#b74-per-level-tooltip-values)).
- **Classic Era rules are data rules.** The Season of Discovery id limit and the cut-content
  exclusion keep SoD spells and never-trained rows out of the Classic baseline; a spell that
  slipped through would show up as a Classic-only spell in `missing` or as an odd Classic rank.
- **The priest's tokens.** Power Word: Shield's "$w1" is its absorb's points, read as `$s1`;
  Mind Soothe's "$v" is the spell's highest target level (`SpellTargetRestrictions.MaxTargetLevel`);
  Prayer of Mending's "$bh" is the reader's bonus healing, 0 as Victory Rush's attack power is, and
  "$bc" its first effect's bonus coefficient. Contingency Plan (Forever, five ranks) reads a second
  effect of its shield and its heal ("$1277463s2", "$1277456o2") that neither has, so those two
  phrases are left out while the client lacks them: "they will gain a shield and begin healing over
  15 sec" (`MISSING_EFFECT_PHRASES` in `lib/spell-text.mjs`).
- Size: about 0.98 MB of JSON across the three files, most of it tooltip text on both sides.

## Re-running

```sh
npm run scrape:spells   # node scripts/scrape/spells-client.mjs: the three files, from the cache
npm run diff:spells     # regenerate, then diff against the committed files (.cache/client/<build>/spells-diff.md)
npm run diff:spells -- --version=<build>   # a new Forever beta build, diffed against the committed one
```

It prints, per class, the tab and status counts, the Classic Era spells not in Forever, any
Classic tokens it couldn't render and how many rows each rule left out (the rows are in
`.cache/client/<build>/spells-left-out.json`), and exits 1 without writing if a check fails: a
Forever rank without a rendered tooltip, an icon without a name, an active talent missing from
the book, duplicate ids, or tab counts that don't add up. The diff pairs spells by name and
ranks by Forever spell id (then Classic spell id, then rank number), and lists every changed
spell field, rank field and tooltip (whitespace, numbers or wording); `--against=<ref>` diffs
against another commit. After a new build: re-run `npm run scrape:client` (its interest set
reads these files), review `git diff src/data`, and update this page and any doc whose values
moved. `npm run scrape -- --version=<build> --diff` does all of this for every dataset.
