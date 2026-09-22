# Forever Sim

A DPS / TPS simulator for **Warriors, Druids and Paladins in WoW Forever**, built for our
guild. Pick your spec, talents and gear, tune buffs and your rotation, and simulate. It works
on your phone as well as your desktop.

It runs entirely in your browser (no server) and is hosted on GitHub Pages:
**https://andersonjohnf.github.io/forever_sim/**

> **Status:** the foundation (data snapshot, mechanics research, tooling) is done. Next are
> the engine and the first complete spec, warrior DPS. See
> [docs/milestones.md](docs/milestones.md).

## What it will do

- Simulate a level 60 character against a level 63 raid boss and report **DPS** or **TPS**,
  with a per-ability breakdown.
- Let you pick **gear** (pre-raid Rares, required level 55–60), **enchants**, **raid buffs,
  debuffs and consumables**, **talents**, and **which abilities the rotation uses**. Every
  option has a sensible default. World buffs aren't included: they aren't available in
  Forever raids.
- Cover these specs:

  | Class | DPS | TPS |
  | --- | --- | --- |
  | Warrior | Arms, Fury | Protection |
  | Druid | Feral cat | Feral bear |
  | Paladin | Retribution | Protection |

## Where the numbers come from

1. WoW Forever beta data, via [foreverchanges.pro](https://foreverchanges.pro) (datamined
   from the beta client) and the guild's in-game testing.
2. Where Forever data doesn't exist yet, **Classic Era** values.
3. Never Season of Discovery, Season of Mastery, original Vanilla, TBC+ or Retail values.

Every mechanic is documented, with sources, in [docs/](docs/README.md). The full rules are in
[docs/doctrine.md](docs/doctrine.md).

## Development

Requires Node 22+.

```sh
npm install
npm run dev          # local dev server
npm run build        # type-check + production build to dist/
npm run lint         # oxlint
npm test             # vitest: unit and data-integrity tests
npm run test:e2e     # Playwright: headless Chromium against the production build
npm run snap         # screenshot + console/network check (add -- --dark --width 390 for phone/dark)
```

### Data

Game data is a snapshot of foreverchanges.pro, stored as JSON in `src/data/`. To refresh it
after a new beta build:

```sh
npm run scrape       # re-runs scripts/scrape/*.mjs (uses a local cache; add -- --refresh to bypass)
```

Then review `git diff src/data`. See [docs/data/README.md](docs/data/README.md).

### Deployment

Every push to `main` runs lint, tests and the build, then deploys to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup: **Settings → Pages → Source: GitHub
Actions**.

## Credits

<a href="https://wago.tools"><picture><source media="(prefers-color-scheme: dark)" srcset="public/attribution/wago-tools-white.svg"><img alt="wago.tools" src="public/attribution/wago-tools-dark.svg" height="32"></picture></a>

- Game data: [wago.tools](https://wago.tools), which serves the WoW Forever client's data
  tables, and [foreverchanges.pro](https://foreverchanges.pro), which compares them with
  Classic Era. The wago.tools logo is used per its [branding guidelines](https://wago.tools/branding).
- Classic Era mechanics research by the Classic theorycrafting community, credited in each
  doc's *Sources* section.

World of Warcraft is a trademark of Blizzard Entertainment. This project is not affiliated
with Blizzard.
