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
exists.
