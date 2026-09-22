# Data snapshot

The app ships with a one-time snapshot of [foreverchanges.pro](https://foreverchanges.pro),
which datamines the WoW Forever beta client and diffs it against the Classic Era client. See
[decisions D1](../decisions.md#d1-snapshot-data-dont-fetch-it-at-runtime-2026-09-22) for why.

## Datasets

| Path | Source page(s) | Scraper | Details |
| --- | --- | --- | --- |
| `src/data/spells/{warrior,druid,paladin}.json` | `/spellbook/<class>` | `scripts/scrape/spells.mjs` | [spells.md](spells.md) |
| `src/data/talents/{warrior,druid,paladin}.json` | `/talents/<class>` | `scripts/scrape/talents.mjs` | [talents.md](talents.md) |
| `src/data/races/races.json` | `/racials` | `scripts/scrape/races.mjs` | [races.md](races.md) |
| `src/data/items/pre-bis.json` | `/items` (static `/items/<tab>.json` + `/item/<id>` pages): Rare with required level 55–60 or item level ≥ 58, plus the curated pre-raid BiS list `scripts/scrape/pre-raid-bis.json` | `scripts/scrape/items.mjs` | [items.md](items.md) |
| `src/data/client/{spells,talents,items,enchants,gametables}.json` | Raw Forever client files (DB2 tables and game tables) from the wago.tools API (`/api/casc/<fdid>?version=1.60.1.69913`, decision D16), parsed with WoWDBDefs; its `meta` envelope differs (`product`, `build`, `tables`, `wowDbDefs`) | `scripts/scrape/client.mjs` | [client.md](client.md) |

Each folder also has a `types.ts` with TypeScript interfaces that match the JSON exactly.

## The `meta` envelope

Every dataset starts with:

```jsonc
"meta": {
  "source": "https://foreverchanges.pro/…",   // page scraped
  "scrapedAt": "2026-09-22T…Z",               // when
  "foreverBuild": "1.60.1.69913",             // Forever beta client build the site read
  "classicBuild": "1.15.9.69722",             // Classic Era build it diffed against (null for races: Classic texts come from Wowhead)
  "scraper": "scripts/scrape/….mjs"
}
```

The app's landing page lists every dataset with its build and date.

## Rules

- **Generated, never hand-edited.** Fix a scraper and re-run it; put corrections in the
  engine's override layer with a reason and source ([doctrine §3](../doctrine.md#3-data)).
- **Polite and allowed.** Scrapers follow `robots.txt` (no `/api/`, `/spell/`, `/search`,
  `/admin`), run sequentially with delays, send a descriptive User-Agent, and cache raw
  responses under `.cache/scrape/` (git-ignored).
- **Deterministic output.** Stable ordering and formatting, so a re-scrape diffs cleanly.
- **Keep both sides.** Where the site shows Forever and Classic values side by side, we store
  both. The engine uses Forever values; Classic ones are there for comparison and fallback.

## Refreshing

```sh
npm run scrape                # everything, using the cache
npm run scrape:items -- --refresh   # one dataset, bypassing the cache
git diff --stat src/data      # review what the new beta build changed
```

After a refresh, update the build number in any doc whose values moved.
