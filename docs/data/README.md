# Data snapshot

The app ships with a one-time snapshot of game data
([decision D1](../decisions.md#d1-snapshot-data-dont-fetch-it-at-runtime-2026-09-22)). Every
dataset is read from the WoW Forever and Classic Era client files through the
[wago.tools API](https://wago.tools/apis) (D16) and parsed with
[WoWDBDefs](https://github.com/wowdev/WoWDBDefs): the item pool, the talent trees, the class
spellbooks, the races and `src/data/client`. No other source feeds them.

**History.** Until milestones M1.5c–e the item, talent, spell and race datasets were scraped
from [foreverchanges.pro](https://foreverchanges.pro).
[D17](../decisions.md#d17-retire-foreverchangespro-as-a-data-source-2026-09-22) retired the
site as a data source; M1.5f deleted its scrapers. Each dataset's page keeps the one-time
comparison of the last foreverchanges dataset with the client one, labelled as history.

## Datasets

| Path | Source | Scraper | Details |
| --- | --- | --- | --- |
| `src/data/spells/{warrior,druid,paladin}.json` | Forever (`wow_classic_beta`) and Classic Era (`wow_classic_era`) `SkillLineAbility` and spell tables plus each client's talents from the wago.tools API: every spell a class learns, rank by rank, with the Classic comparison; its `meta` envelope is the client one | `scripts/scrape/spells-client.mjs` | [spells.md](spells.md) |
| `src/data/talents/{warrior,druid,paladin}.json` | Forever (`wow_classic_beta`) Trait tables and Classic Era (`wow_classic_era`) Talent tables from the wago.tools API: every talent of the three trees with its cell, arrow, per-rank Forever text and the Classic comparison; its `meta` envelope is the client one | `scripts/scrape/talents-client.mjs` | [talents.md](talents.md) |
| `src/data/races/races.json` | Forever and Classic Era `ChrRaces`, `CharBaseInfo` and racial `SkillLineAbility` rows from the wago.tools API: the ten races, their classes and racials with the Classic comparison; its `meta` envelope is the client one | `scripts/scrape/races-client.mjs` | [races.md](races.md) |
| `src/data/items/pre-bis.json` | Forever (`wow_classic_beta`) and Classic Era (`wow_classic_era`) client tables from the wago.tools API: Rare with required level 55–60 or item level ≥ 58, plus the curated pre-raid BiS list `scripts/scrape/pre-raid-bis.json`; its `meta` envelope is the client one (`source`, `product`, `foreverBuild`, `classicBuild`, `tables`, `wowDbDefs`) | `scripts/scrape/items-client.mjs` | [items.md](items.md) |
| `src/data/client/{spells,talents,items,enchants,gametables}.json` | Raw Forever client files (DB2 tables and game tables) from the wago.tools API (`/api/casc/<fdid>?version=1.60.1.69913`, decision D16), parsed with WoWDBDefs; its `meta` envelope differs (`product`, `build`, `tables`, `wowDbDefs`) | `scripts/scrape/client.mjs` | [client.md](client.md) |

Each folder also has a `types.ts` with TypeScript interfaces that match the JSON exactly.

## The `meta` envelope

The item, talent, spell and race datasets start with:

```jsonc
"meta": {
  "source": "https://wago.tools/api/casc",     // raw client files by FileDataID
  "scraper": "scripts/scrape/…-client.mjs",
  "scrapedAt": "2026-09-23T…Z",               // latest download among the files read
  "product": "wow_classic_beta",
  "foreverBuild": "1.60.1.69913",             // Forever beta client build
  "foreverBuildDate": "2026-09-18",           // the build's date in wago.tools' build list
  "classicProduct": "wow_classic_era",
  "classicBuild": "1.15.9.69722",             // Classic Era build compared against
  "tables": { "forever": { … }, "classic": { … } },   // table → FileDataID
  "wowDbDefs": { "repository": "…", "commit": "…" }
}
```

`src/data/client/*` carry `product`, `build`, `tables` and `wowDbDefs` instead
([client.md](client.md)). The About sheet lists every dataset with its build and date.

## Rules

- **Generated, never hand-edited.** Fix a scraper and re-run it; put corrections in the
  engine's override layer with a reason and source ([doctrine §3](../doctrine.md#3-data)).
- **Polite and allowed.** The scrapers call only wago.tools' documented API and GitHub for
  WoWDBDefs, one request at a time and at least 1.1 s apart, with a descriptive User-Agent.
  Every response is cached under `.cache/client/` (git-ignored) and never downloaded again
  unless `--refresh` is passed ([client.md § Requests](client.md#requests)).
- **Deterministic output.** Stable ordering and formatting, so a re-scrape diffs cleanly. From
  a warm cache, `npm run scrape` rewrites every dataset byte for byte with no requests, on any
  machine: text is sorted by `compareText` (`lib/json.mjs`: case-insensitive, then by code
  unit), never by `localeCompare` or `Intl.Collator`, which follow the machine's locale, and a
  build's date comes from wago.tools' build list for that build, not from whichever build the
  cache holds as "latest" (review finding L35; `scripts/scrape/lib/json.test.mjs` sorts under a
  Swedish and a Turkish locale). The committed data is always that regeneration: a change that
  moves it (a scraper, its curated inputs, or a doc the client scraper reads) commits the
  regenerated files with it, and `npm run test:full` checks it ([Checking the committed data](#checking-the-committed-data)).
- **Keep both sides.** Where the Forever and Classic Era clients differ, we store both. The
  engine uses Forever values; Classic ones are there for comparison and fallback.
- **Storage contracts hold across builds.** Share links and saved setups store build codes
  and race ids. The talent and race scrapers refuse to write when a build-code position (a
  tree's talent and max rank, position by position) changes, a stored build code
  ([`scripts/scrape/stored-builds.json`](../../scripts/scrape/stored-builds.json)) decodes to
  other ranks, or a race's id, name, faction or classes change, against the committed dataset
  ([talents.md](talents.md#build-codes-verified), [races.md](races.md#derivation)). They fail
  closed: without a committed dataset to compare with, they write only with
  `--skip-committed-check`.

## Refreshing

`npm run scrape` (`scripts/scrape/all.mjs`) runs the scrapers in this order and stops at the
first that fails:

1. `spells-client.mjs`, `talents-client.mjs`, `races-client.mjs`, `items-client.mjs`: the
   four datasets. Each reads only client tables (items also reads the hand-curated
   `scripts/scrape/pre-raid-bis.json`), so their order among themselves doesn't matter.
2. `client.mjs`: `src/data/client`. It comes last because its interest set is built from the
   four datasets above and the docs ([client.md § Re-running](client.md#re-running)).

```sh
npm run scrape                                # every dataset, from the cache (0 requests)
npm run scrape -- --version=<build> --diff    # a new beta build, each dataset diffed against the committed one
npm run scrape -- --diff --against=<git ref>  # diff against another commit instead of HEAD
npm run scrape:talents                        # one dataset (also scrape:spells, :races, :items, :client)
npm run diff:talents                          # one dataset, regenerated and diffed (also diff:spells, :races, :items)
git diff --stat src/data                      # review what changed
```

`--version` and `--dbdefs` reach every scraper. `--diff` makes each of the four dataset
scrapers compare its fresh output with the committed one (`git show HEAD:<file>`, or the ref
`--against` names) and write `.cache/client/<build>/<dataset>-diff.md` (+ `.json`); the talent
diff also writes `talents-changes.md`, the tables of
[talents.md § Changes at a glance](talents.md#changes-at-a-glance). A new build that
changes a build-code position, a stored build code or a race stops the run; once the app
handles the change, re-run that scraper alone with `--accept-code-changes` or
`--accept-race-changes`. Where git can't show the committed dataset (a fresh clone without
history, a new dataset), run those two scrapers alone with `--skip-committed-check`.

Without `--version`, the scrapers use the cached answer to "latest `wow_classic_beta`
build". To take a newer one, delete `.cache/client/builds/wow_classic_beta_latest.json` and
its `.meta.json`, then run `npm run scrape -- --diff`: the first scraper asks wago.tools once,
the others reuse the answer, and only the new build's files are downloaded. (`--refresh`
re-downloads every file a scraper reads, cached or not.) After a refresh, review the diffs,
update the build number in any doc whose values moved, and re-check the doc claims
(`npm run scrape:client -- --claims`).


## Checking the committed data

The client scraper takes part of what it extracts from the docs (the buffs doc's tables and the
spell ids the class and mechanics docs cite; [client.md § What the docs decide](client.md#what-the-docs-decide)),
so a commit that edits a doc can leave `src/data` stale without touching it. Two guards catch
that, both part of `npm run test:full`:

- **Everywhere, CI included:** [`scripts/scrape/committed-data.test.mjs`](../../scripts/scrape/committed-data.test.mjs),
  in `npm test`, checks that what the current docs decide agrees with `src/data/client`: the
  buffs doc's consumables (with the doc's names and ids), its enchants and its buff spells, and
  every doc citation of a spell the data already carries. Every ID cell of the buffs doc must
  also parse.
- **Where the raw client files are cached** (`.cache/client`, from `npm run scrape`):
  `npm run scrape:check` regenerates every dataset and compares it byte for byte with
  `src/data`. `test:full` runs it as its own step after the unit tests, with `--if-cached`, which
  skips it (exit 0, with a line saying so) when the cache has no directory for the build the
  committed data records, as in CI. It isn't a unit test because it runs the generators for
  about 15 s, which would compete with the unit tests' timing checks for the CPU.

  It passes `--check` to each scraper, which reads the cache alone (its fetcher is offline: a
  file the cache lacks fails the run instead of being downloaded) and writes nothing to
  `src/data` or the cache (not even the parsed-table copies the cache keeps). Each scraper
  regenerates the build and WoWDBDefs commit its committed dataset records (its `meta`), not the
  cache's "latest", so refreshing the cache for a new build doesn't fail the check of the data
  committed for the old one; `--version=` or `--dbdefs=` choose another. The four dataset steps
  leave their fresh generation in a temporary directory (`--fresh=`), and the client step reads
  its inputs from there, so it checks what a full regeneration would write even when an earlier
  dataset is stale. It runs every step and names each file that differs. `--check` can't be
  combined with `--refresh`, `--diff`, `--fixtures` or `--claims`.

```sh
npm run scrape:check                          # every dataset, from the cache: exits 1 if one is stale
npm run scrape:check -- --if-cached           # the same, or skip when the committed build isn't cached (test:full)
npm run scrape:client -- --check              # one scraper (each takes --check; the client one reads the committed datasets)
```

When either fails, regenerate (`npm run scrape`) and commit the data with the change that moved
it. A citation of a spell the data doesn't carry yet is seen only by the second guard, since
recognising it needs the client's spell names.
