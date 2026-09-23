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
  "foreverBuildDate": "2026-09-18",
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
  a warm cache, `npm run scrape` rewrites every dataset byte for byte with no requests.
- **Keep both sides.** Where the Forever and Classic Era clients differ, we store both. The
  engine uses Forever values; Classic ones are there for comparison and fallback.
- **Storage contracts hold across builds.** Share links and saved setups store build codes
  and race ids. The talent and race scrapers refuse to write when a stored build code decodes
  to other ranks, or a race's id, name, faction or classes change, against the committed
  dataset ([talents.md](talents.md#build-codes-verified), [races.md](races.md#derivation)).

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
changes a stored build code or a race stops the run; once the app handles the change, re-run
that scraper alone with `--accept-code-changes` or `--accept-race-changes`.

Without `--version`, the scrapers use the cached answer to "latest `wow_classic_beta`
build". To take a newer one, delete `.cache/client/builds/wow_classic_beta_latest.json` and
its `.meta.json`, then run `npm run scrape -- --diff`: the first scraper asks wago.tools once,
the others reuse the answer, and only the new build's files are downloaded. (`--refresh`
re-downloads every file a scraper reads, cached or not.) After a refresh, review the diffs,
update the build number in any doc whose values moved, and re-check the doc claims
(`npm run scrape:client -- --claims`).

