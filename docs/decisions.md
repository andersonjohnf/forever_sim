# Decisions

A short log of choices that shape the project. Newest last. Add an entry when you make a
choice someone might later want to revisit.

### D1: Snapshot data, don't fetch it at runtime (2026-09-22)
The app ships with a JSON snapshot of foreverchanges.pro, scraped once by
`scripts/scrape/*.mjs`. With no server there's no proxy for CORS, the site's `robots.txt`
disallows its API, and a snapshot gives reproducible results tied to a known beta build.
Refreshing is a deliberate `npm run scrape`, followed by a diff review.

### D2: Ruleset hierarchy: Forever, then Classic Era, never SoD/SoM/Vanilla/TBC+/Retail (2026-09-22)
Set by the guild. Details and tagging rules are in [doctrine.md](doctrine.md#2-where-numbers-come-from-non-negotiable).

### D3: Stack (2026-09-22)
Vite + React + TypeScript + Tailwind v4 + shadcn/ui (Radix base, Nova preset), oxlint and
Vitest, all installed with npm. shadcn's current `cn` helper comes from the `cn` npm package
(published by shadcn; it replaces `clsx` + `tailwind-merge`). It is not a typo.

### D4: Engine is pure TS, deterministic, and runs in Web Workers (2026-09-22)
The engine is seeded and has no DOM access, so runs are reproducible and testable in Node.
Workers keep the UI responsive and use every core.

### D5: Scope (2026-09-22)
Warrior (Arms/Fury/Prot), Feral druid (cat/bear), and paladin (Ret/Prot), at level 60 vs a
level-63 boss. Pre-raid gear is Rare items with required level 55–60, per the guild's
request. Balance, healing, other classes and raid gear are deferred
([milestones](milestones.md)).

### D6: Items with no Forever data use Classic Era stats, flagged (2026-09-22; confirmed by the guild)
foreverchanges lists Classic items whose Forever client row is still empty. The row fills in
once the game server sends the item, and the beta is capped around level 20, so nobody has
seen these yet. We keep them because they're almost certainly in Forever: they're most of
the Classic dungeon pre-raid gear, including Hand of Justice and Blackhand's Breadth. They're
marked `foreverData: false` and badged in the UI as "Classic stats: Forever data pending".
Re-scraping after launch replaces them with real Forever stats. Season of Discovery items are
never included; the scraper enforces this by item id.

### D7: One warrior spec end-to-end before widening (2026-09-22)
Warrior DPS is the best-documented Classic spec. Shipping it first (M2) validates the
engine and UI against something the guild can sanity-check, before druid and paladin, where
Forever's changes are likely larger.

### D8: World buffs are excluded (2026-09-22)
Guild directive: world buffs are not available in WoW Forever raids. The sim has no
world-buff toggles or presets, and no default assumes them
([doctrine §1](doctrine.md#1-what-were-building)). Classic Era sims usually model world
buffs; that doesn't apply here. Revisit only if Forever changes this.

### D9: wago.tools is cited, never crawled (2026-09-22)
wago.tools' `robots.txt` is `Disallow: /` for all user agents. During M0 research, most of
the research agents downloaded DB2 tables from it before the correction reached them. That
was our mistake: the agents' instructions pointed them at wago.tools. The values stay
documented with their URLs, and each doc marks them for a person to confirm in a browser. From now on, no automated
access: scripts and agents cite wago.tools URLs, and people do the lookups
([doctrine §2](doctrine.md#2-where-numbers-come-from-non-negotiable)).

### D10: Pre-raid pool = Rare, required level 55–60 or item level ≥ 58 (2026-09-22)
The first filter (Rare, required level 55–60) missed staples with a lower or no level
requirement: Hand of Justice (53), Blackhand's Breadth, Mark of Fordring (none). The guild
widened it to also take every Rare with item level ≥ 58. Items with no required level are
included: Classic genuinely gave many quest rewards and boss drops no requirement, so it
isn't a data error.

### D11: Known pre-raid BiS items are always in the pool (2026-09-22)
Guild directive: pre-raid best-in-slot items belong in the pool even when the D10 rule
misses them. Examples are Epic pre-raid pieces (Lionheart Helm, Savage Gladiator Chain) and
low-item-level staples (Blackstone Ring, Mask of the Unforgiven). A hand-curated list,
`scripts/scrape/pre-raid-bis.json`, names them per spec and slot. It comes from Classic Era
pre-raid BiS guides (never SoD lists) and cites a source per spec. The item scraper includes
those items at any quality or level, and tags every listed item with `preRaidBis`, so the gear
picker can offer them as default sets. Forever re-itemized many items and added new dungeons,
so these lists are a Classic Era starting point. Replace them when Forever level-60 BiS data
exists. An item Forever changed so that it no longer suits a spec leaves that spec's list, with a
note. If the list was the only reason it was in the pool, it leaves the pool too. First case:
Diamond Flask, whose use is a 5 s heal in Forever (warrior Q30; 2026-09-23).

### D12: Unmeasured Forever ratings apply by hypothesis, with a switch (2026-09-22)
Forever gear carries Expertise Rating, Haste Rating and Armor Penetration, and nobody has
measured what they do in combat yet. Ignoring them would undervalue every item that has
them; guessing silently would hide the uncertainty. So the `forever` profile applies each
one by its documented hypothesis, tagged [?]:
- haste rating: 10 per 1% haste, multiplicative with other haste
  ([damage-and-timing](mechanics/damage-and-timing.md))
- expertise: reduces the boss's dodge and parry
  ([combat-tables](mechanics/combat-tables.md))
- armor penetration: flat armor removed
  ([damage-and-timing](mechanics/damage-and-timing.md))

A profile switch, `unmeasuredRatings: 'apply' | 'ignore'`, lets the guild see how much each
result depends on them. When the guild measures one, the hypothesis becomes data.

### D13: Cross-doc reconciliation rules (2026-09-22)
A consistency review of the M0 research found 18 cross-doc contradictions and 9
mis-tagged sources. They were resolved as follows:
- the doc that owns a topic sets the value, and other docs summarize and link to it
  ([docs/README.md](README.md))
- the new source rules in [doctrine §2](doctrine.md#2-where-numbers-come-from-non-negotiable)
  settle what counts as secondary, pre-SoD pinned commits, and tooltip vs derived values
- D12 settles the new ratings

Every changed value keeps its reasoning in its doc.

### D14: A finished product, UX-first, behind a review gate (2026-09-22)
Guild direction: this isn't a half-built stopgap. The bar is the best Forever sim the data
allows, with a clean, modern UX that works great on mobile and desktop. The app doesn't call
itself temporary, and it doesn't show internals like the scrape inventory; provenance goes
in an About sheet. The screen *is* the sim: spec, talents, gear, buffs, rotation, fight and
results ([ux.md](ux.md)). A spec appears only when its sim and UI are complete. Every push
passes an adversarial logic review and an adversarial UX review by an independent reviewer
first, with findings logged in `docs/reviews/` ([doctrine §6](doctrine.md#6-review-gate-before-every-push)).
Game icons come from Wowhead's CDN by icon name, lazy-loaded with a placeholder, so the app
works without them.

### D15: Engine architecture (2026-09-22)
Chosen with the guild after a benchmark. A stripped-down 180 s dual-wield fight ran about
136k fights/s per core with a textbook allocating event queue, and about 277k/s with a
no-allocation loop, both in V8. A real engine does 20–50× more per event, which still leaves
thousands of fights per second per core.
- **TypeScript in Web Workers.** WebAssembly stays an escape hatch for the hot loop if
  profiling ever demands it.
- **One general event-driven engine.** It has a pooled priority queue (no allocation in the
  hot loop), integer-millisecond time, generic auras and procs, and a priority-list rotation
  per spec. The config is resolved once into a flat, precomputed plan before the first fight.
  Each spec is data plus small ability modules, not its own loop.
- **Adaptive iteration count.** Runs continue until the 95% CI half-width is within ~0.25% of
  the mean, between 1,000 and 50,000 fights. Each result reports its precision, and Advanced
  allows a fixed count. Comparisons (stat weights, item A vs B) use common random numbers.
- **Exact determinism across devices.** Work is split into fixed-size chunks with seeds
  derived per chunk and merged in chunk order. The same setup and seed give identical
  results on any device and core count.

### D16: Use the wago.tools API, with attribution (2026-09-22)
Supersedes the blanket ban in D9. foreverchanges.pro reads the Forever client through
wago.tools, and wago.tools publishes an API for exactly this
([wago.tools/apis](https://wago.tools/apis)):
- build lists
- file lists
- file info
- raw client files by FileDataID (`/api/casc/{fdid}?version=1.60.1.69913`)

The guild chose to use it. Scripts may call **only those documented endpoints**, one request
at a time, cached under `.cache/`, with our User-Agent, and once per build. Everything else
on the site stays off-limits to automation under its `robots.txt`. That includes its pages
and the table pages' CSV export, which isn't part of the API.

The API serves raw DB2 files, so we parse them ourselves with the community's WoWDBDefs
definitions. Raw client files don't include server hotfixes, so values that might be
hotfixed are flagged.

wago.tools is credited with its official logo, unmodified per its
[branding guidelines](https://wago.tools/branding), in the app's footer, the About sheet and
the README.

### D17: Retire foreverchanges.pro as a data source (2026-09-22)
The guild prefers not to depend on foreverchanges.pro: it has no clear terms of use, while
wago.tools exists to power apps like this one (D16). Once the client-data pipeline lands,
every dataset is rebuilt from client files fetched through the wago.tools API: spells,
talents, races, items and item sources.
- Forever values come from `wow_classic_beta`.
- Classic Era comparisons, and fallback stats for items whose Forever row is empty, come from
  `wow_classic_era`.
- The JSON shapes stay the same, so the UI and engine don't change.

Then the foreverchanges scrapers are deleted, its attribution comes off the app and README,
and the doctrine's first tier becomes the Forever client files via wago.tools. Until then,
the app ships data scraped from foreverchanges, so its credit stays.

What we give up:
- the site's "popular builds" (our documented default builds stand on their own)
- a few values the site saw in game or received as server hotfixes, which raw client files
  lack; they're flagged rather than guessed
- item drop sources, if this client doesn't ship Encounter Journal tables

Research docs may keep citing foreverchanges pages as historical sources until each claim is
confirmed against client data.

**Confirmed for items (2026-09-22, M1.5c).** About 50 items exist in Forever only as server
hotfix rows, which raw client files lack. The 34 of them that exist in Classic Era use their
Classic Era rows and are flagged, as D6 describes. Their Forever changes are mostly Classic
percentages restated as ratings. The 16 new Forever items with no row in either client leave
the pool until a client build ships them. We don't freeze their old foreverchanges values:
the simpler dependency is worth that loss ([items.md](data/items.md)).

**Done (2026-09-23, M1.5f).** Every dataset is built from the client, the foreverchanges
scrapers are deleted, and the app credits wago.tools alone.

### D18: Tank specs report TPS and DPS as equals (2026-09-22)
Guild request: tank specs simulate both TPS and DPS. The engine already records damage and
threat in every fight; the results now treat both as first-class for tank specs:
- the headline shows TPS and DPS side by side, each with its ± 95% CI and its change from
  the previous run
- adaptive runs continue until **both** reach the precision target (D15), not just TPS
- the per-ability breakdown switches between threat and damage

DPS specs keep DPS as their one headline number.

### D19: Stat boosts model gear that doesn't exist yet (2026-09-23)
User request: see how a spec scales with better itemization than exists today, such as 20% better
gear, 50 more attack power or 10% more block value.
- **The boosts:** one percent for every stat from items, and per-stat bonuses for stats items can
  carry, each a raw amount or a percent of that stat from items. They only add: the percent runs
  from 0 to +100%, and bonuses are 0 or more, since the point is the next raid tier (user
  decision).
- **User input, not game values:** they're like choosing gear, so doctrine's sourcing rules
  don't apply to them. But a boosted result must say so plainly: in the headline and in the
  assumptions. Saved setups and share links carry the boosts.
- **Where they apply:** to stats from items and enchants, before talents', racials' and buffs'
  percentages, so a boosted point is worth what an item's point is. Forever ratings follow D12.
  The percent also scales weapon damage (minimum and maximum, at the same speed): better gear
  means better weapons too (user decision).
- **Off by default.** They never change a default or a golden.

Plan: [M7](milestones.md#m7-stat-boosts-gear-that-doesnt-exist-yet-), after the tank specs and
multi-target (user decision).

### D20: Review new work in full, verify the fixes (2026-09-23)
User decision, from the first release's review ([its log](reviews/2026-09-23-first-release.md)):
- **The full passes paid off.** The first three changed the numbers users see (Fury 684.2 →
  673.8 DPS, Arms 630.7 → 610.7) and caught a data-loss bug that an earlier fix had introduced.
- **Later rounds found less.** Each hunted afresh instead of checking its own fixes. They found
  mostly minor problems that were already there, in one small area, plus regressions from the
  previous round's fixes.

So:
- new work keeps the full adversarial logic and UX reviews
- fixes get one verification pass, scoped to the fix commits, that confirms them and hunts for
  regressions they introduced
- findings say whether the change introduced them, and a pre-existing low finding that breaks
  no promise the docs make may go to the known gaps
- an area that draws new findings two rounds running is simplified, not patched a third time

The procedure is in [CLAUDE.md](../CLAUDE.md#core-doctrine-adversarial-review-before-every-push)
steps 4–6, and [doctrine §6](doctrine.md#6-review-gate-before-every-push) summarises it.
