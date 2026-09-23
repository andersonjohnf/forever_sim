# Data snapshot

The app ships with a one-time snapshot of game data
([decision D1](../decisions.md#d1-snapshot-data-dont-fetch-it-at-runtime-2026-09-22)). Every
dataset is read from the WoW Forever and Classic Era client files through the
[wago.tools API](https://wago.tools/apis) (D16): the item pool, the talent trees, the class
spellbooks, the races and `src/data/client`. They replaced the
[foreverchanges.pro](https://foreverchanges.pro) snapshots
([D17](../decisions.md#d17-retire-foreverchangespro-as-a-data-source-2026-09-22), milestones
M1.5c–e); each dataset's page records the old-vs-new diff, and M1.5f retires the old scrapers.

## Datasets

| Path | Source page(s) | Scraper | Details |
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
- **Polite and allowed.** The foreverchanges scrapers follow `robots.txt` (no `/api/`,
  `/spell/`, `/search`, `/admin`), and the client scrapers call only wago.tools' documented API.
  Both run sequentially with delays, send a descriptive User-Agent, and cache raw responses
  (`.cache/scrape/`, `.cache/client/`, git-ignored).
- **Deterministic output.** Stable ordering and formatting, so a re-scrape diffs cleanly.
- **Keep both sides.** Where the site shows Forever and Classic values side by side, we store
  both. The engine uses Forever values; Classic ones are there for comparison and fallback.

## Refreshing

```sh
npm run scrape                # spells, talents, races and items from the client, using the cache
npm run scrape:client         # then the client datasets, whose interest set reads the ones above
npm run scrape:items -- --refresh   # one dataset, bypassing the cache
git diff --stat src/data      # review what the new beta build changed
```

After a refresh, update the build number in any doc whose values moved.
