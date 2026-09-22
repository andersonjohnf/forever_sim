# forever_sim

DPS/TPS simulator for level-60 Warriors, Feral Druids and Paladins in **WoW Forever**, used by
one guild during the beta until wowsims supports Forever. Keep it **simple-ish**. It's a
static Vite + React + TypeScript + shadcn/ui app on GitHub Pages with no server.

## Read before changing things

- `docs/doctrine.md`: scope, sourcing rules, engineering rules. **Binding.**
- `docs/milestones.md`: current milestone and what's next.
- `docs/architecture.md`: layout, data flow, engine design.
- `docs/mechanics/*.md` and `docs/classes/*.md`: the formulas the engine implements.

## Commands

```sh
npm run dev | build | preview
npm run lint          # oxlint
npm run typecheck     # tsc -b
npm test              # vitest run
npm run scrape        # re-scrape foreverchanges.pro → src/data (cached; -- --refresh to bypass)
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
- **UI** uses shadcn/ui: `npx shadcn@latest add <component>`. Avoid hand-editing
  `src/components/ui/*`. `cn` comes from the `cn` npm package (shadcn's official
  clsx + tailwind-merge replacement), not a typo.
- **GitHub Pages:** the Vite `base` is `/forever_sim/`. Use `import.meta.env.BASE_URL` for
  runtime asset URLs and hash routing if routing is ever needed.
- **Scrapers** respect robots.txt (never `/api/`, `/spell/`, `/search`, `/admin` on
  foreverchanges.pro), request sequentially with delays, and cache under `.cache/scrape/`.
  Zero npm dependencies.
- **Never fetch wago.tools automatically** (curl, WebFetch or scripts). Its robots.txt
  disallows everything. Cite its URLs and leave lookups to a person.
- Package manager: **npm**.
