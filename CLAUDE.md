# forever_sim

DPS/TPS simulator for level-60 Warriors, Feral Druids and Paladins in **WoW Forever**. It's a
static Vite + React + TypeScript + shadcn/ui app on GitHub Pages with no server.

**The bar:** the best Forever sim we can build with the data we have, with a clean, modern UX
that works great on mobile and desktop. wowsims may ship Forever support one day; that is
never a reason for half measures. The app doesn't describe itself as temporary.

## Core doctrine: adversarial review before every push

**Nothing is pushed until every change since the last push has passed an adversarial logic
review *and* an adversarial UX review.** Commit freely; push only through this gate.

1. **Green checks:** `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e`.
2. **Adversarial logic review.** An independent reviewer (a fresh subagent that didn't write
   the change) is briefed to *break* it, not approve it. It checks the diff against
   `docs/doctrine.md` and the owning mechanics/class docs:
   - formulas and constants match their cited doc section, and tags follow the doctrine
   - edge cases: hit cap, 0% and 100% crit, empty slots, 2H vs dual wield, execute
     boundaries, zero resources
   - determinism: same config + seed → same result
   - statistical sanity: iterations and confidence interval
   - performance, data integrity, and test gaps
3. **Adversarial UX review.** An independent reviewer inspects `npm run snap` screenshots of
   every changed screen at **390 px and 1280 px, light and dark**. It covers the default,
   empty, long-content, running and error states, and tries to find:
   - confusing copy or flows, and unclear defaults
   - unreachable controls, horizontal scroll or broken layout
   - touch targets under 44 px, poor contrast, missing focus or keyboard access
   - inconsistency with `docs/ux.md`
4. **Every finding is fixed, or waived with a written reason.** Log the findings and their
   dispositions in `docs/reviews/<YYYY-MM-DD>-<topic>.md` and commit the log before pushing.
   The author never signs off on their own change.

## Git workflow

- **Commit as each task or slice completes,** in logical commits with descriptive messages
  (what and why), on `main`.
- **Push only when the user asks** (usually at the end of a session, or to verify a deploy),
  and only after the review gate above has passed for everything since the last push.
  Pushing `main` deploys to GitHub Pages.

## Working with agents: small slices, fresh contexts

Large work is split into **slices** listed under each milestone in `docs/milestones.md`.
- **A slice is one reviewable deliverable with its own tests.** Size it to finish well
  within half an agent's context window: a few hundred thousand tokens, not a whole
  milestone. If it can't be described in about ten bullets, split it.
- **One fresh agent per slice.** Never resume a finished agent for a new slice: resuming
  carries its whole transcript. Resume only for small fixes to the same slice while its
  context is still small. Hand off through committed code and a short written brief.
- **Brief narrowly.** Point the agent to the exact doc sections and files it needs, not
  whole docs. List the files it owns and the ones it must not touch.
- **Stop at a clean checkpoint.** If a slice grows, the agent stops at a green,
  committable state and reports what's left, rather than pushing on.
- **The lead verifies and commits each slice** (lint, typecheck, unit and e2e tests) before
  starting work that builds on it. Independent slices with disjoint files may run in
  parallel.

## Read before changing things

- `docs/doctrine.md`: scope, sourcing rules, engineering rules. **Binding.**
- `docs/ux.md`: UX principles, layout, states and the UX review checklist. **Binding for UI.**
- `docs/milestones.md`: current milestone and what's next.
- `docs/architecture.md`: layout, data flow, engine design.
- `docs/mechanics/*.md` and `docs/classes/*.md`: the formulas the engine implements.

## Commands

```sh
npm run dev | build | preview
npm run lint          # oxlint
npm run typecheck     # tsc -b
npm test              # vitest run (unit + data-integrity tests in src/)
npm run test:e2e      # Playwright, headless Chromium, against the production build under /forever_sim/
npm run snap          # build, open a page headless, print console errors + failed requests, screenshot
                      #   -- --dark --width 390 --click Talents --out .cache/snaps/x.png
                      #   (--click Simulate waits for the result; on phones add --click "Show results")
npm run scrape        # re-scrape foreverchanges.pro → src/data (cached; -- --refresh to bypass)
npm run scrape:client # Forever client tables via the wago.tools API → src/data/client (cached; -- --version=<build>)
```

## Rules

- **Sourcing (non-negotiable):** use WoW Forever values first (foreverchanges.pro; wago.tools
  DB2 for builds 1.60.x; guild in-game tests), otherwise Classic Era (clients 1.13–1.15).
  **Never** use Season of Discovery, Season of Mastery, original Vanilla (2004–06 or
  private-server emulators), TBC+ or Retail values. Tag documented values `[F]`/`[C]`/`[?]`
  with a source link. If only a forbidden source has a value, add it to *Open questions*;
  don't use it.
- **No world buffs.** They aren't available in WoW Forever raids: no toggles, presets or
  defaults for them (doctrine §1, decision D8).
- **Docs and code stay in sync.** Mechanic constants in `src/sim` cite their doc section
  (e.g. `// docs/mechanics/rage.md#…`). Change both in the same commit. Worked examples in
  the docs become unit tests.
- **`src/data/**/*.json` is generated** by `scripts/scrape/*.mjs`. Never hand-edit it. Fix
  the scraper and re-run it, or add a documented override in the engine.
- **Engine (`src/sim`) is pure TypeScript.** No React/DOM, no `Math.random()`/`Date.now()`;
  use the seeded RNG so runs are reproducible. Time is integer milliseconds.
- **Verify UI changes in a real browser before calling them done:** run `npm run test:e2e`,
  then `npm run snap` (light, desktop) and `npm run snap -- --dark --width 390` (dark, phone),
  and look at the screenshots in `.cache/snaps/`. Add an e2e test for each new user-facing
  flow. Import `test` from `e2e/fixtures.ts`, which fails any test that logs a console error,
  throws, or gets an HTTP error. Navigate with relative paths (`page.goto('./')`) so the
  base path is kept.
- **UI** uses shadcn/ui: `npx shadcn@latest add <component>`. Avoid hand-editing
  `src/components/ui/*`. `cn` comes from the `cn` npm package (shadcn's official
  clsx + tailwind-merge replacement), not a typo.
- **GitHub Pages:** the Vite `base` is `/forever_sim/`. Use `import.meta.env.BASE_URL` for
  runtime asset URLs and hash routing if routing is ever needed.
- **Scrapers** respect robots.txt (never `/api/`, `/spell/`, `/search`, `/admin` on
  foreverchanges.pro), request sequentially with delays, and cache under `.cache/scrape/`.
  Zero npm dependencies.
- **wago.tools: documented API only** ([wago.tools/apis](https://wago.tools/apis): `/api/builds…`,
  `/api/files`, `/api/info/{fdid}`, `/api/casc/{fdid}`). Requests go one at a time, are cached
  and identified, once per build. Never automate its HTML pages or the table pages' CSV export
  (robots.txt). Keep its logo attribution, per its branding guidelines, wherever its data is
  used (decision D16).
- Package manager: **npm**.
