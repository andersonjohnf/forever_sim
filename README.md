# Forever Sim

A DPS simulator for **Fury and Arms Warriors in WoW Forever**, built for our guild. Pick
your spec, talents and gear, tune buffs and your rotation, and simulate. It works on your phone
as well as your desktop.

It runs entirely in your browser (no server) and is hosted on GitHub Pages:
**https://andersonjohnf.github.io/forever_sim/**

> **Status:** the sim covers Fury and Arms Warriors. Warrior Protection (TPS), Feral Druid and
> Paladin follow, one milestone at a time: see [docs/milestones.md](docs/milestones.md).

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

1. WoW Forever beta data: the beta client's own data tables through the
   [wago.tools API](https://wago.tools/apis), and the guild's in-game testing.
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
npm run test:smoke   # the smoke suite each deploy runs: core unit files + e2e tagged @smoke
npm run test:full    # lint, typecheck, every unit and e2e test (before every push)
npm run snap         # screenshot + console/network check (add -- --dark --width 390 for phone/dark)
```

### Data

Game data is a snapshot stored as JSON in `src/data/`. All of it (spellbooks, talents, races,
items and the raw client tables) is read from the Forever beta client's files through the
wago.tools API, with Classic Era comparisons from the Classic Era client. To regenerate it, or
refresh it after a new beta build:

```sh
npm run scrape                               # every dataset, from the cached client files
npm run scrape -- --version=<build> --diff   # a new beta build, diffed against the committed data
```

Then review `git diff src/data` and the diff reports. See [docs/data/README.md](docs/data/README.md).

### Deployment

Every push to `main` runs lint, the smoke suite and the build, then deploys to GitHub Pages
(`.github/workflows/deploy.yml`). Beside it, the **Full regression** workflow runs every test on
the same platform (`.github/workflows/regression.yml`); run it by hand from the Actions tab too.
One-time setup: **Settings → Pages → Source: GitHub Actions**.

## Credits

<a href="https://wago.tools"><picture><source media="(prefers-color-scheme: dark)" srcset="public/attribution/wago-tools-white.svg"><img alt="wago.tools" src="public/attribution/wago-tools-dark.svg" height="32"></picture></a>

- Game data: [wago.tools](https://wago.tools), which serves the WoW Forever and Classic Era
  clients' data tables. The wago.tools logo is used per its
  [branding guidelines](https://wago.tools/branding). The tables are parsed with the
  community's [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) definitions.
- Classic Era mechanics research by the Classic theorycrafting community, credited in each
  doc's *Sources* section.

World of Warcraft is a trademark of Blizzard Entertainment. This project is not affiliated
with Blizzard.
