# Spells dataset

`src/data/spells/{warrior,druid,paladin}.json` hold every spell each class trains in WoW
Forever, rank by rank, next to the same rank in Classic Era. Interfaces are in
[`src/data/spells/types.ts`](../../src/data/spells/types.ts); the scraper is
[`scripts/scrape/spells.mjs`](../../scripts/scrape/spells.mjs).

| | |
| --- | --- |
| Source pages | <https://foreverchanges.pro/spellbook/warrior>, [`/druid`](https://foreverchanges.pro/spellbook/druid), [`/paladin`](https://foreverchanges.pro/spellbook/paladin); sources from <https://foreverchanges.pro/class/warrior>, [`/druid`](https://foreverchanges.pro/class/druid), [`/paladin`](https://foreverchanges.pro/class/paladin) |
| Forever build | `1.60.1.69913` (beta client) |
| Classic build | `1.15.9.69722` (Classic Era client) |
| Scraped | 2026-09-22, 20:35 UTC (`meta.scrapedAt`) |

## How the data was obtained

foreverchanges.pro is a server-rendered Next.js (App Router) site. For each class the scraper
fetches two pages and reads three things from them:

1. **Spellbook payload** (`/spellbook/<class>`). The React Server Components stream sits in the
   HTML as `<script>self.__next_f.push([1,"…"])</script>` chunks. The scraper JSON-decodes and
   concatenates the chunks, splits the stream into `<hex id>:<payload>` rows (`T` rows are
   length-prefixed in UTF-8 bytes, so it splits by length, not by line) and finds the client
   component whose props hold `book: { tabs[].spells[], missing[] }`. RSC dedupes repeated
   objects into reference strings such as `"$1e:props:book:tabs:0:spells:4:ranks:5:forever"`,
   and the scraper resolves them back into values. `"$undefined"` becomes an absent key.
2. **Visible list** (same page). The list badge (`Changed`, `Was a talent`, …) and one-line
   summary are computed by the client component, so they aren't in the props. The scraper
   reads them from the server-rendered HTML rows and joins them to the payload by position,
   checking that names and tabs match.
3. **Changes page** (`/class/<class>`, "Every talent and spell change, with sources"). Its
   `entries` prop has one entry per spell or talent, with evidence links. Each spell is matched
   to an entry through the spellbook's `changeIds` map, then by identical id,
   `spellbook-<id>`, or name + tree. Every spell in all three classes matched one. The
   entry supplies `changelog` and `sources`.

Only those six URLs are fetched. robots.txt disallows `/api/`, `/spell/`, `/search` and
`/admin`, and the scraper never requests them. Requests go one at a time, 1.5 s apart, with
User-Agent `forever_sim-scraper/0.1 (+https://github.com/andersonjohnf/forever_sim; one-time
data snapshot)`. Raw HTML is cached in `.cache/scrape/spells/` (git-ignored), and a
`.meta.json` beside each file records the fetch time.

### Validation (the scraper exits non-zero if any check fails)

- The page's own counts must equal the payload's: hero stats (New / Changed / Not in
  Forever), the tab menu (All tabs, each tab, Not in Forever) and the "Show" filter (All
  spells / Different from Classic / New in Forever).
- Every visible list row joins to a payload spell with the same name and tab.
- **Reference-resolution check:** the page also carries a collapsed plain-text list ("N
  entries, as text") that prints each spell's featured-rank Forever tooltip and, when it
  changed, the Classic tooltip. The resolved payload must reproduce both strings for every
  spell, and the missing spells must follow in order.
- No string starting with `$` may remain anywhere in the output. That covers `$ref`,
  `$undefined`, `$L…`, `$D…` and the rest.
- Payload fields the scraper doesn't know fail the run, so new site fields can't be dropped
  without anyone noticing.

## Schema summary

```text
SpellBook
  meta      { source, changesSource, scrapedAt, foreverBuild, classicBuild, scraper }
  class     "warrior" | "druid" | "paladin"
  counts    { total, new, changed, notInForever, differentFromClassic }   // as shown on the page
  tabs[]    { name, slug, icon, spellCount }
  spells[]  Spell, in site order (grouped by tab, mostly by training level)
  missing[] MissingSpell: Classic spells with no Forever counterpart

Spell
  id, name, tab, icon, url                  // id = site slug; url = spellbook deep link (#s=<id>)
  level                                     // first trained level; null if talent-granted
  status                                    // verbatim: same | changed | new | baseline | earlier | talent
  badge, summary                            // visible list badge + one-line summary, verbatim
  reasons[]                                 // verbatim strings
  races                                     // null = all races of the class
  maxRank, featuredRank                     // site max_rank / rank (null when unranked)
  isTalent, grantedByTalent                 // site talent / talent_only
  changelog?  { id, kind, changeKind, summary, evidenceStatus, discoveredAt, url }
  sources?[]  { url, title?, type? }        // from /class/<class>
  ranks[]     { rank, forever, classic, differences[{ field, text }] }

SpellRank (forever / classic side)
  spellId, rankLabel, level, text
  cost      { raw, amount, resource: rage|energy|mana|health, percentOfBase? } | null
  castTime  { raw, seconds, channeled } | null     // "Instant" → 0, "Channeled" → null + channeled
  cooldown  { raw, seconds } | null                // "6 sec cooldown" → 6, "15 min" → 900, "1 hr" → 3600
  range     { raw, yards, melee, minYards? } | null // "Melee range" → yards null, melee true
```

Status → badge mapping in this snapshot: `same` → *Same as Classic*, `changed` → *Changed*,
`new` → *New*, `baseline` → *Was a talent*, `earlier` → *Earlier*, `talent` → *Talent*. The
page's **Changed** count is every status except `same`, `new` and `talent`. **Different from
Classic** is New + Changed.

Every `raw` string in this snapshot parsed. Costs are `N Rage|Energy|Mana` or `N% of base
mana`, casts are `Instant`, `N sec cast` or `Channeled`, cooldowns are `N sec|min|hr
cooldown`, and ranges are `Melee range` or `N yd range`. A string the parsers don't recognise
keeps `raw` with null numbers, and the scraper lists it at the end of its run.

## Counts

| Class | Spells | Tabs | same | changed | baseline | earlier | new | talent | Not in Forever |
| --- | --: | --- | --: | --: | --: | --: | --: | --: | --: |
| Warrior | 42 | Arms 14 · Fury 16 · Protection 12 | 17 | 13 | 1 | 1 | 1 | 9 | 0 |
| Druid | 60 | Balance 15 · Feral Combat 30 · Restoration 15 | 17 | 31 | 2 | 0 | 2 | 8 | 1 |
| Paladin | 56 | Holy 23 · Protection 23 · Retribution 8 · Mounts 2 | 13 | 29 | 2 | 0 | 3 | 9 | 2 |

Page headline numbers, all matched: Warrior 1 New / 15 Changed / 0 Not in Forever / 16
Different; Druid 2 / 33 / 1 / 35; Paladin 3 / 31 / 2 / 34.

Talent spells (`isTalent`): Warrior 9 (6 `grantedByTalent`), Druid 8 (6), Paladin 9 (5).

`missing`: Druid *Faerie Fire (Feral)* (a talent in Classic). Paladin *Blessing of
Sanctuary* (a talent in Classic) and *Greater Blessing of Sanctuary*.

### Forever-only spells in this snapshot

- **Warrior:** Victory Rush (new, level 20); Spearing Strike (new Arms talent, 20 s
  cooldown, 40% weapon damage). Tactical Mastery is now trained at level 14 (10 rage kept).
- **Druid:** Lacerate (new, level 42, 3 ranks) and Revive (new). Mangle and Berserk are talent
  spells, and Wild Growth's first rank comes from a Forever talent. Nature's Grasp and Omen of
  Clarity are now trained.
- **Paladin:** Holy Strike (new, 8 ranks), Seal of Fury (new, 7 ranks) and Hammer of the
  Righteous (new, level 40). Light's Vigil, Voice of Truth, Swift Judgement and Templar's
  Bulwark are Forever talent spells. Consecration and Blessing of Kings are now trained.

## Caveats

- **Ranks that exist on one side only.** `classic` is null on 40 rank pairs: new spells, new
  top ranks (Warrior Slam r5, Paladin Holy Shock r4, Druid Frenzied Regeneration's new rank
  1) and talent spells that are new in Forever. `forever` is **never** null. The site doesn't
  list Classic ranks that Forever removed as pairs; it only mentions them in `reasons`/`summary`
  (Druid Tiger's Fury "Ranks 2 to 4 gone", Frenzied Regeneration "Ranks 2 to 3 gone").
- **Classic side of talent-granted spells.** For spells that came from a talent in both games
  (Sweeping Strikes, Death Wish, Swiftmend, …), `classic` has only `text` (the Classic talent
  tooltip). `spellId`, `level` and all parsed fields are null there.
- **Unranked spells.** `maxRank`, `featuredRank` and `ranks[].rank` are null for spells without
  numbered ranks (stances, forms, talent spells). Two spells have two unnumbered rows: Paladin
  *Summon Warhorse* (two Forever spell ids, 13819 and 1279399) and Druid *Frenzied
  Regeneration*. Frenzied Regeneration's first row (Forever spell 22845) has null `text` and
  `level`, and the spell's own `level` is null too.
- **`rankLabel`** is set only where the site gives a label: non-numeric ones ("Shapeshift",
  "Passive", "Summon") and a few Classic ranks ("Rank 1", "Rank 5").
- **Channeled casts** have `seconds: null`. The channel duration is only in the tooltip text.
- **Melee range** has `yards: null`. The client string gives no number.
- **Percentage costs** ("55% of base mana") have `amount: null`. Use `percentOfBase` with
  the class's base mana. Forms, cleanses, several blessings, Judgement and Hammer of the
  Righteous cost this way.
- **Warrior Bloodrage** reads "20% of base mana" on both sides, so it parses as
  `resource: "mana"`. Warriors have no mana, and in Classic Bloodrage costs health, so the
  site's label is probably wrong `[?]`. The engine should override it rather than trust the
  field.
- **`summary`** is the site's one-line summary, cut to the first difference.
  `changelog.summary` from the changes page is the full list.
- **Tooltip numbers are tooltips.** `differences` and the texts compare client tooltip strings.
  Some large numeric diffs may be tooltip-template artefacts rather than balance changes.
  For example, Classic Rip rank 6 reads "157 damage over 12 sec" at 5 CP, which looks like
  a per-tick value (×6 ticks = 942) against Forever's 855 total. Verify on
  [wago.tools](https://wago.tools) DB2 or in game before building on such a number `[?]`.
- **Source links.** `sources[].type` is `client_data` (Forever: wago.tools DB2 tables for
  build 1.60.1.69913) or `classic_client_data` (links to `wowhead.com/classic/spell=…`). The
  Classic values themselves come from the Classic Era client via the site. Doctrine §2 warns
  that wowhead's Classic pages mix in Season of Discovery data, so treat those links as
  pointers, not as a tier-3 source in their own right.
- Some `reasons` mention "Season of Discovery had a spell by this name". That note is the
  site's. None of the data comes from SoD.
- Size: about 0.96 MB of JSON across the three files, most of it tooltip text repeated on
  the Forever and Classic sides.

## Re-running

```sh
npm run scrape:spells                 # = node scripts/scrape/spells.mjs (uses the cache)
npm run scrape:spells -- --refresh    # re-fetch the six pages
git diff --stat src/data/spells       # review what changed
```

A cached run is byte-for-byte reproducible. A `--refresh` run only changes `meta.scrapedAt`
unless the site's data changed. When the beta build changes, `meta.foreverBuild` moves too.
The run prints one line per class and ends with a list of any strings it couldn't parse.
If the site's markup or payload shape changes, it fails loudly with the failing check
instead of writing partial data.
