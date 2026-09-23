# Data snapshot

The app ships with a one-time snapshot of game data
([decision D1](../decisions.md#d1-snapshot-data-dont-fetch-it-at-runtime-2026-09-22)). The
item pool, the talent trees and `src/data/client` are read from the WoW Forever and Classic Era
client files through the [wago.tools API](https://wago.tools/apis) (D16). Spells and races
still come from [foreverchanges.pro](https://foreverchanges.pro), which datamines the Forever
beta client and diffs it against Classic Era, until they move to the client files too
([D17](../decisions.md#d17-retire-foreverchangespro-as-a-data-source-2026-09-22), milestones
M1.5e–f).

## Datasets

| Path | Source page(s) | Scraper | Details |
| --- | --- | --- | --- |
| `src/data/spells/{warrior,druid,paladin}.json` | `/spellbook/<class>` | `scripts/scrape/spells.mjs` | [spells.md](spells.md) |
| `src/data/talents/{warrior,druid,paladin}.json` | Forever (`wow_classic_beta`) Trait tables and Classic Era (`wow_classic_era`) Talent tables from the wago.tools API: every talent of the three trees with its cell, arrow, per-rank Forever text and the Classic comparison; its `meta` envelope is the client one | `scripts/scrape/talents-client.mjs` | [talents.md](talents.md) |
| `src/data/races/races.json` | `/racials` | `scripts/scrape/races.mjs` | [races.md](races.md) |
| `src/data/items/pre-bis.json` | Forever (`wow_classic_beta`) and Classic Era (`wow_classic_era`) client tables from the wago.tools API: Rare with required level 55–60 or item level ≥ 58, plus the curated pre-raid BiS list `scripts/scrape/pre-raid-bis.json`; its `meta` envelope is the client one (`source`, `product`, `foreverBuild`, `classicBuild`, `tables`, `wowDbDefs`) | `scripts/scrape/items-client.mjs` | [items.md](items.md) |
| `src/data/client/{spells,talents,items,enchants,gametables}.json` | Raw Forever client files (DB2 tables and game tables) from the wago.tools API (`/api/casc/<fdid>?version=1.60.1.69913`, decision D16), parsed with WoWDBDefs; its `meta` envelope differs (`product`, `build`, `tables`, `wowDbDefs`) | `scripts/scrape/client.mjs` | [client.md](client.md) |

Each folder also has a `types.ts` with TypeScript interfaces that match the JSON exactly.

## The `meta` envelope

Every foreverchanges dataset starts with:

```jsonc
"meta": {
  "source": "https://foreverchanges.pro/…",   // page scraped
  "scrapedAt": "2026-09-22T…Z",               // when
  "foreverBuild": "1.60.1.69913",             // Forever beta client build the site read
  "classicBuild": "1.15.9.69722",             // Classic Era build it diffed against (null for races: Classic texts come from Wowhead)
  "scraper": "scripts/scrape/….mjs"
}
```

The client datasets (`src/data/client/*`, `src/data/items/pre-bis.json`,
`src/data/talents/*`) carry the source endpoint, product, build, the tables read with their
FileDataIDs, the WoWDBDefs commit and `scrapedAt` instead ([client.md](client.md)). The About
sheet lists every dataset with its build and date.

## Rules

- **Generated, never hand-edited.** Fix a scraper and re-run it; put corrections in the
  engine's override layer with a reason and source ([doctrine §3](../doctrine.md#3-data)).
- **Polite and allowed.** The foreverchanges scrapers follow `robots.txt` (no `/api/`,
  `/spell/`, `/search`, `/admin`), and the client scrapers call only wago.tools' documented API.
  Both run sequentially with delays, send a descriptive User-Agent, and cache raw responses
  (`.cache/scrape/`, `.cache/client/`, git-ignored).
- **Deterministic output.** Stable ordering and formatting, so a re-scrape diffs cleanly.
- **Keep both sides.** Where the site shows Forever and Classic values side by side, we store
  both. The engine uses Forever values; Classic ones are there for comparison and fallback.

## Refreshing

```sh
npm run scrape                # spells, races (foreverchanges), talents and items (client), using the cache
npm run scrape:client         # then the client datasets, whose interest set reads the ones above
npm run scrape:items -- --refresh   # one dataset, bypassing the cache
git diff --stat src/data      # review what the new beta build changed
```

After a refresh, update the build number in any doc whose values moved.
