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

A profile switch, `unmeasuredRatings: 'apply' | 'ignore'`, shows how much each
result depends on them. When an in-game test measures one, the hypothesis becomes data.

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
  no promise the docs make may go to the [known gaps](known-gaps.md)
- an area that draws new findings two rounds running is simplified, not patched a third time

The procedure is in [CLAUDE.md](../CLAUDE.md#core-doctrine-adversarial-review-before-every-push)
steps 4–6, and [doctrine §6](doctrine.md#6-review-gate-before-every-push) summarises it.

### D21: No Undo; setups are saved, loaded, exported and imported (2026-09-23)
User decision. People tweak their setup constantly, so an Undo for each change isn't the safety
net they need. Its waiting toasts also drew findings three review rounds running (D20). Instead:
- **Save** keeps a named copy of the current setup, its spec included. **Load** picks one from
  a list, with rename and delete. Saves stay in the browser, like the automatic save.
- **Export** copies a setup code for the current setup (the share link's payload), or downloads
  a `.json` file with every saved setup plus the current one.
- **Import** takes a code or a share link, which becomes the current setup, or a file, whose
  setups join the list (its current setup too, as a saved one) without replacing yours.
- **Nothing prompts** before a Load, an Import, a shared link or Reset setup replaces the
  setup. A shared link usually opens in a new tab, which keeps the old setup on screen; the
  automatic save, which the tabs share, becomes the link's setup.
- **Toasts are plain notices** that go after 10 s.

This replaces the Undo parts of [ux.md](ux.md#persistence-and-sharing).

### D22: Reproducible log analyses can set server-side Forever defaults (2026-09-23)
User decision, from the first release's logic review (LX3). Doctrine §2 let the `forever` profile
contradict Classic Era only with client data. Rules the server computes, such as rage from
white hits and from damage taken, can never be client data, so that rule would have forced
Classic Era's rage formulas, which about 2,000 logged Forever hits contradict.

Now a server-side rule can also take its Forever default from a **reproducible analysis of
public beta combat logs**:
- the raw logs are public, so anyone can re-run the analysis
- the method is documented in the owning doc
- the result holds across many independent characters, not one tester

The value stays **[?]**, keeps an open question saying how to confirm it at level 60, and moves
to **[F]** when an in-game test (tier 2) confirms it. Anecdotes and single-tester fits still can't
set a default. Where no allowed source has a value, the default follows
[doctrine §2's fallback order](doctrine.md#2-where-numbers-come-from-non-negotiable)
([D37](#d37-only-sourced-values-2026-09-26)). This covers the white-hit rage normalization and the
damage-taken formula ([rage.md](mechanics/rage.md)).

### D23: The default rotation is the best one we've found (2026-09-23)
User directive. Each spec's default rotation is the best-performing one we can come up with that
a real player can execute. When tuning finds a better one, it becomes the default without asking
first.

A better rotation has to show it with enough fights to be sure. Run it against the current default
on the same seeds (common random numbers). The 95% confidence interval of the per-fight
difference in DPS (TPS for tank specs) has to lie above zero. A search that tries many options
turns up false wins at 95%, so the winner is run again on a fresh master seed, one the search
never used, and adopted only if its interval is still above zero. The owning class doc records
the change, the numbers and the method, and the goldens are re-snapshotted with the explanation.

A change that doesn't act in the default setup can't clear that bar there: it differs by zero,
or only by same-millisecond ties. An example is a rule for fights without an execute phase. It's
adopted when, on a fresh seed, its interval lies above zero in each cell of the robustness grid
where it acts, and its point estimate loses no more than 0.1% of DPS (TPS for tank specs) in any
other cell. The grid is 30, 45, 60, 90, 180 and 300 s fights, each with a 0, 10 and 20% execute
phase. Added 2026-09-23, from the Fury tuning review (FL2, FV2).

**Which setup** (user decision, 2026-09-23): the default is the best rotation for the default
setup, a 3-minute fight with a 20% execute phase. It needn't also hold at other fight lengths.
The class doc records how the defaults do from 30 s to 5 min, and a setting's help says when
another value suits shorter fights better, so a user with a different fight can change it.

Talent builds and gear stay "what a typical raider runs"
([doctrine §5](doctrine.md#5-defaults)). This decision is about rotations: choices that belong to the
encounter or the raid aren't rotation defaults even when they clear the bar. Charge needs you out
of combat, where a DPS warrior usually walks in after the tank's pull, and your own Battle Shout's
gain depends on the raid's composition (the Buffs tab).

### D24: Small assumptions don't gate features (2026-09-23)
**Amended by [D37](#d37-only-sourced-values-2026-09-26):** rule 1's Classic-based default follows
[doctrine §2's fallback order](doctrine.md#2-where-numbers-come-from-non-negotiable);
rule 2's stand-in is that order's one exception.

User directive: build with sensible defaults, track them, and fix them once every spec is built.
It replaces the 2026-09-22 rule "no forbidden-source placeholders" in character-stats.md. Two
rules:
1. **A default whose likely error moves the default setup's DPS or TPS by about 1% or less ships
   as it is.** "Likely error" means how far the true value could plausibly be from the default,
   not the value's whole effect. When no tier 1–3 source has it, the default is a sensible
   Classic-based value.
2. **A 1.12 value that Classic Era kept unchanged, found only in a forbidden source (an emulator
   database), may stand in whatever its size,** when no tier 1–3 source has it and it agrees
   with the [C] values around it (for example the race offsets). Class base attributes and base
   health are the cases so far. Leaving such a value out is usually worse: without base health,
   Forever's rage from damage taken came out about 39% high. The value is Classic Era's, recorded
   only by an emulator, so the rule that no original-Vanilla behaviour is used still holds.

Either way:
- Tag the value `[?]` and give it the link "[?] placeholder (D24); origin: <link>, not evidence".
- List it in the owning doc's open questions with its estimated effect on results, and show it in
  the results' assumptions.
- M9 (validation) replaces every placeholder once every spec is built.

A *rule* that moves results by more than about 1% (a formula, not a missing number) still needs
tier 1–3 evidence or a D22 log analysis before it becomes a default.

### D25: Push at every stable state (2026-09-23)
User directive: features land as soon as they're ready. As soon as the review gate has passed for
everything since the last push, `main` is pushed, without asking. After each push, the deploy and
the Full regression run are watched through to green, and anything they catch is fixed. A
parallel track's work is reviewed in its worktree, and the lead's merge onto `main` counts as a
change too. After each merge, `npm run test:full` runs on `main`. A merge that resolved conflicts
or re-snapshotted goldens gets a verification pass scoped to the merge before the push.

### D26: A tank's default keeps its duties; Max TPS is a selectable rotation (2026-09-23)
**Amended by [D28](#d28-three-tank-rotations-defensive-balanced-and-max-tps-2026-09-24):** this
default is now named Defensive, and Balanced is the default.

User decision, from Warrior Protection's tuning. On threat alone, the tuner would drop Shield
Block, Thunder Clap and Demoralizing Shout (+9% TPS together), and Shield Slam (+2% TPS but
−28% DPS). A real tank keeps them up, for its own survival and for the raid's debuffs. So:
- **The default keeps the duties.** Each tank spec's default rotation keeps its survival and raid
  duties: Shield Block, Thunder Clap's slow and Demoralizing Shout for a warrior, and their druid
  and paladin equivalents. Within that, D23's search maximizes TPS. DPS counts too, per D18, so
  Shield Slam stays.
- **Max TPS is selectable.** Each tank spec also offers a **Max TPS** rotation in the Rotation
  tab. It drops those duties, and D23's search tunes it on TPS alone. Its help says what it drops
  and why the default keeps it.

**How it applies** (added 2026-09-23, from Warrior Protection's review and its verifications, PL1,
PL2, PL6, PV1–PV4 and PW1–PW3, and the bear's, BL1, BL2 and BL9):
- **The duties** are named in each tank's class doc: for a warrior, Shield Block, Thunder Clap and
  Demoralizing Shout. **Their timing follows one fixed rule and is never tuned** (user decision,
  after two review rounds found new problems in tuned duty timing): the duties come first in the
  priority, before any threat ability on the global cooldown; a duty that isn't a debuff on the
  boss is used when it's ready (Shield Block); and a debuff, with or without a cooldown, is
  refreshed as soon as a missed cast could still be tried again before it falls off, that is, from
  its own cooldown (Thunder Clap from 6 s), or from one global cooldown if it has none. The
  search tunes only the threat abilities around them. For a warrior this costs about 2.2% of TPS
  and 3.3% of DPS against tuned timing, and saves 2.9% of damage taken.
- **In the default's search,** a change that costs a larger share of DPS than it gains in TPS
  isn't adopted (D18). Nor is dropping an ability whose gain rests on an untested threat value:
  the bear keeps Lacerate, whose TPS rests on its untested "high threat" bonus (it breaks even at
  about +40) and whose DPS dropping it would cost 7.9%.
- **A duty is survival or a raid debuff whose measured effect is worth its cost.** Skipping Enrage
  in combat saves a bear 0.16% of its damage taken for 3.8% of its TPS, so it isn't a duty; the
  search decides it.
- **Max TPS may drop only the duties, and drops each one whose upkeep costs TPS;** a duty that
  makes threat itself stays (the bear's Faerie Fire). Other abilities stay unless dropping them
  wins on TPS without resting on an untested threat value. Shield Slam stayed: before build
  1.60.1.70009, dropping it gained 3.3% TPS only at Classic Era's +254 threat [?], while Forever's
  tooltip raised its threat to "very high", and from about +449 keeping it won on TPS as well.
  Since that build's lower Sunder Armor, dropping it costs Max TPS 12.85% of its TPS even at +254
  (957.77 → 834.72, seed 31101, 6,000 fights), so the untested value no longer decides it
  ([warrior.md Q34](classes/warrior.md#9-open-questions)).
- **The Buffs tab's versions of the duties** assume the tank applies them, so no preset lists a
  tank's duty (buffs doc §6.2). When Max TPS drops a duty, the Buffs tab's version is off by
  default too. You can turn it on there if another player keeps it up. For the same reason, a
  tank's preset leaves out another tank class's duties: a bear's or a paladin's raid has no
  warrior tank's Thunder Clap unless you add it.


### D27: Land every DPS spec first, in a 90/10 mode; tune later (2026-09-24)
User decision. Before multi-target (M6), the sim adds every other DPS spec in the game, and it
lands them fast rather than perfect: a result within about ±5% ships, and a later tuning
milestone brings every spec up to D23. The analysis behind it: the time went into the loop
around each spec (review, fix, verify, rebase, re-verify), restarted by full D23 tuning after
every change, by fixing every low finding, and by parallel tracks building the same engine
pieces separately. So, for new specs until the tuning milestone:
- **First-pass defaults.** The rotation starts from the Classic Era community priority adapted
  to Forever's changes, with one quick search of its two or three biggest settings (about
  20,000 fights, one seed). No robustness grids, fresh-seed confirmations or re-tunes after
  fixes. The Rotation tab says the defaults are "the common priority" until the spec is tuned.
  D23 still governs specs already tuned, and the tuning milestone.
- **One combined review** per slice, logic and UX by one fresh reviewer, replacing the separate
  logic and UX reviews of D20. High and medium findings are fixed; low findings go to the
  [known gaps](known-gaps.md) with their reasons, unless fixing one is a one-line change. A
  verification pass follows only when a fix changed engine logic; copy and doc fixes don't need
  one.
- **Shared engine first, then thin class slices.** A caster core (casts, channels, DoTs, spell
  power, spell hit, crit and resists) and a ranged core (Auto Shot, ranged weapons, pets) are
  built once; each class is then data, talents and a rotation. A class slice delivers its class
  doc (Forever's changes from the client, the Classic Era priority, open questions), its scraped
  data, talents and default build, abilities, rotation, defaults and e2e tests, and ships the spec.
- **A merge queue.** A branch rebases once, just before its review, and merges as soon as it's
  green. **Agents run in parallel on disjoint files, at most 10 at once** (user decision,
  2026-09-25, replacing 8, which replaced "about four"), and new ones wait while the machine is saturated, that is,
  while tests fail from load rather than from the change.
- **Unchanged:** the sourcing rules (doctrine §2), no world buffs, determinism, green checks
  (`npm run test:full`) before every push, D24's placeholders, and D25's push at every stable
  state.
- **Order** (user decision): melee and physical first (Rogue, Enhancement Shaman), then the
  caster core with Mage, Warlock, Shadow Priest, Elemental Shaman and Balance Druid, then the
  ranged core with Hunter.

### D28: Three tank rotations, Defensive, Balanced and Max TPS (2026-09-24)
User decision, after the officers' review of v1. It amends D26: a tank's default is now
Balanced. Each tank spec's Priority choice offers three rotations:
- **Defensive** is D26's default, "Tank duties first", renamed. Its duties and their fixed
  timing rule are unchanged, and so are D26's rules for its search (the DPS-share rule, and
  not dropping an ability on an untested threat value).
- **Balanced is the default** (user decision). It's how most tanks play fights below
  progression difficulty that can still kill a careless tank. It keeps the tank's active
  mitigation and the raid's armor debuff, drops the debuffs that only lower the boss's damage,
  and tunes the rest for DPS:
  - a warrior uses Shield Block when it's ready and keeps Sunder Armor at 5 stacks, refreshed
    by D26's duty rule, and uses it as a filler only above 60% rage (user decision, 2026-09-24,
    replacing "not used as a filler"): 60% of the warrior's max rage, which race and talents set
    (60 of the default 100, 78 with Boundless Rage 3/3), with Heroic Strike's threshold scaled the
    same way (84%); it drops Thunder Clap and Demoralizing Shout
  - a bear keeps Faerie Fire and drops Demoralizing Roar
  - a paladin keeps Devotion Aura and Holy Shield, and Holy Strike too, whose Iron Creed cuts
    damage taken by 10% (user decision: that's active mitigation Balanced keeps), so a paladin's
    Balanced plays like Defensive

  The kept upkeep follows D26's fixed timing rule. The search tunes the other abilities on DPS.
  A change that costs a larger share of TPS than it gains in DPS isn't adopted, which is D18's
  rule turned around. Until the tuning milestone, Balanced's defaults are first-pass (D27).
- **Max TPS** is unchanged (D26).

What Balanced keeps is settled per class, since the classes differ: a bear has no active
mitigation, and a paladin has no armor debuff but a survival aura. A paladin's Balanced keeps
the same upkeep as Defensive, so the two differ only in what the search tunes: DPS for
Balanced, TPS for Defensive.

A saved setup or shared link that chose a rotation still loads it under its new name. One that
kept the old default gets Balanced, like any other changed default. Settings you changed by
hand stay as you set them: choosing Balanced moves only the defaults of the abilities it drops,
as Max TPS does.

Status: built for all three tanks (T5, with their priority lists in M5.65 A2), first-pass (D27):
the warrior's Balanced against Defensive +9.5% TPS, +6.4% DPS and 21% more damage taken
([warrior.md §5.4](classes/warrior.md#balanced-t5)); the bear's +3.1%, +2.8% and 0.7%, and its Max
TPS, tuned on TPS alone, Mauls from 14 ([druid.md §6.3](classes/druid.md#balanced-t5)); the
paladin's plays as Defensive ([paladin.md](classes/paladin.md#priority-defensive-balanced-or-max-tps)).
The warrior leads: its Balanced makes 1,241 TPS against the paladin's 832 and the bear's 1,115
(seed 31101, 100,000 fights), **+49.1%** over the paladin, at the officers' ceiling then (a feel
since withdrawn, D29), and Sunder Armor's 1,013 threat [F] is 33% of the warrior's threat. The next change that
moves either tank checks against this. Build 1.60.1.70009 did: Sunder Armor fell to 206 plus 0.05 ×
AP [?], and Shield Slam's "very high" took the wording table's +475 [?], so the warrior's Balanced
makes 993 TPS, +19% over the paladin's 832 and 11% under the bear's 1,115 (the same seed, before
their own 1.60.1.70009 slices); Balanced is +7.2% TPS over Defensive, and Max TPS keeps Shield Block
by D26's rule, since its blocks now make more threat than its rage would elsewhere
([warrior.md §5.4](classes/warrior.md#build-160170009-protection)). With every 1.60.1.70009 slice
merged (the paladin review's PR-7, 2026-09-24; seed 31101, 100,000 fights), Balanced makes **1,001.6
TPS for the warrior, 1,126.6 for the bear and 752.6 for the paladin**: the warrior 33.1% over the
paladin and 11.1% under the bear. D29 sets no numeric target, so these gaps are observations for
in-game tests ([milestones T6](milestones.md#m56-tanks-reviewed-against-the-guild-d28-d29-)), not
failures.

### D29: Same threat words, same threat; presets geared for what they measure (2026-09-24)
**Amended by [D37](#d37-only-sourced-values-2026-09-26):** the same-wording bonus is used as is,
never rescaled; a default follows
[doctrine §2's fallback order](doctrine.md#2-where-numbers-come-from-non-negotiable); an
undescribed client dummy effect models as zero; and a gap goes to the open questions (there are no organized guild tests).

User directive, after v1's tank numbers embarrassed the user in front of the guild: the
Paladin and bear presets came from survival guides, and every tank ability whose extra threat
had no known number was modelled with none. Both are now rules:
- **Equal threat wording across tanks.** A tooltip's threat wording means the same thing on
  every tank class. "A high amount of threat" on a bear's or a paladin's ability is the same
  bonus as on a warrior's ability that says it. When the ability has no tier 1–2 value, it takes
  the value of the known abilities with the same wording, scaled the way those values scale (superseded by the header's amendment),
  as a `[?]` assumption shown in the results. A guild measurement replaces it.
- **Every value that affects the result has a default.** Leaving a known variable blank was
  meant as caution, but it models the effect as zero, and that made the sim far less accurate.
  Anything we know exists (from a tooltip, the client, a talent's text or how the game plays)
  gets a sensible default from the closest allowed analog or an estimate reasoned from allowed
  sources (superseded by the header's amendment). It's flagged `[?]` and shown in the results' assumptions, never left out. Only an
  allowed source that gives no effect at all makes it zero. The forbidden sources still can't
  supply the number; that rule decides where a default comes from, never whether there is one.
- **Talent builds and gear suit how the spec is played.** A tank talents for the balanced
  approach (threat and damage, with the mitigation that matters, like D28's Balanced rotation),
  never for pure defense.
- **Presets are real pre-raid BiS, geared for what the spec measures.** A spec's gear preset is
  the set its players would actually wear, built for its own
  headline metric: TPS for tanks, DPS otherwise. It uses the stats that the spec's damage and
  threat actually scale with, measured by the sim's stat weights: a Protection paladin's Holy
  threat scales with spell power, so its preset leans to spell damage. A pre-raid guide supplies
  candidates, not the answer, and its survival picks (resistances, defense, stamina) don't make
  a preset. The three tanks' presets are like for like: the same phase and item level range,
  all built for threat.
- **No item in a preset has lost its stats.** An item whose only stat is armor is a data bug
  until shown otherwise, and a data-integrity test fails on it.
- **Plausibility is part of the logic review.** A headline far from the other specs, or from
  what the class's players expect, is a finding in itself: a tank below most DPS specs' threat,
  or one tank at twice another. "Every formula matches its doc" doesn't close that finding; a
  cited mechanic that explains the gap does, or a fix.
- **No numeric benchmark for tanks** (user decision, 2026-09-24, withdrawing the earlier one). The
  officers' "paladin and bear about 800–900 TPS, warrior no more than about 50% ahead" was a feel,
  not a measurement, and no longer applies: the model's numbers land where the cited mechanics put
  them. Unknown values still take reasoned defaults from allowed sources (superseded by the header's amendment), and the sanity checks
  above still apply; a gap no cited mechanic explains is an open question for in-game tests or
  combat logs, not a reason to move a value.

### D30: The sim finds the best talents, gear and rotation itself; defaults are its results (2026-09-24)
**Amended 2026-09-26 (user decision):** multi-target ([M6](milestones.md#m6-multi-target-)) now
comes first; the optimizer's remaining steps, O3 (in the app) and O4 (defaults from its results),
follow it. The optimizer is no longer the top priority.

User decision, then the top priority. The feature is called **the Optimizer** (user's name for it;
not "Top Gear", which is Raidbots'). Talent builds, gear sets and rotations have a numerically
best answer for a given setup, so the sim searches for it rather than assuming one, as Raidbots'
Top Gear and the retail optimizers do:
- **An optimizer in the engine and the app.** It runs tens of thousands of fights over
  candidate talent builds, gear sets (with enchants) and rotation settings. It uses the same
  paired, same-seed comparisons as the rotation tuner (D23), and races candidates so that weak
  ones stop early. Its constraints are the player's:
  - talents it must keep, or a minimum in a tree (for example 31 points in Protection)
  - an item level range, item sources and slots to leave as they are
  - how long to search
- **Defaults are the optimizer's results** under each spec's default constraints, confirmed on a
  fresh seed (D23). They replace the guide-picked gear (D11 still decides what's in the pool),
  the "most popular build" talent defaults and D27's first-pass rotations.
- **What it maximizes.** A DPS spec maximizes DPS. A tank maximizes TPS and DPS as equals (D18):
  the sum of each one's change relative to the spec's current default. That's the Balanced
  rotation's aim too (D28). A tank's search never drops the survival talents its class doc lists
  as the floor, the ones nearly every tank takes, such as big cuts to defensive cooldowns. The
  avoidance talents are in the floor too (user decision): **Deflection 5/5** for a warrior and a
  paladin, and **Feral Swiftness 2/2** for a bear. **Anticipation is not in the floor** but is the
  **preferred filler**: points a build has left after its threat talents go to Anticipation before
  Toughness or other weaker talents (user decision, after the guild's lead theorycrafter's
  Protection paladin build, 240003-0530213321301551-502, took Anticipation 2/5 and measured +1.0%
  TPS over the floor-bound default). Toughness is optional. The model says avoided hits cost a tank rage, mana and
  Reckoning procs, so a threat-first search drops them, but tanks take them.
- **A tank's gear keeps an effective-health floor** (user decision). Survival stats cost a tank
  threat in Forever (rage from hits taken divides by max health, and avoided hits give none), so
  an unconstrained search builds glass cannons. Effective health is max health ÷ (1 − armor's
  damage reduction against the boss's level), the physical damage it takes to kill you. A high
  health total in light armor doesn't meet it. By default a result keeps at least 90% of the
  effective health of the class's survival preset, and the player can change the share.
  Avoidance and block aren't in it: they lower average damage but don't survive a spike.
  Every result shows its health, effective health and damage taken.
- **No damage-taken cap; immunity switches instead** (user decision, replacing a +10% cap decided
  the same day). A percentage over a pure-survival gear set measures against a set no tank wears,
  since tanks have never geared purely for defense. What matters beyond effective health is
  whether the boss can crit or crush you, so the Optimizer's tank constraints are:
  - the effective-health floor above (on by default)
  - **crit immune:** the boss's crit chance against you is 0 (off by default)
  - **crush immune:** your miss, dodge, parry and block chances push crushing blows off the
    boss's table (off by default; a bear can't reach it without block)

  All are settings in the Optimizer screen (O3), and every result shows its boss crit and crush
  chances beside its health, effective health and damage taken.
- **Items whose value rests on an unmeasured rating** (expertise and haste under D12): a preset
  takes the best item under the default rules, where D12 applies, since dropping them would model
  a stat the client lists as zero (D29). But if an item with no unmeasured rating is within
  0.5% of TPS (or DPS), or inside the paired 95% interval, that item is taken instead. The bear's
  Earthstrike (−0.04%) passes; the warrior's Adaptive Combat Assistant (−3.9%) and Stalwart
  Watcher's Signet (−1.5%) stay. The Optimizer applies the same rule, and every result says when
  its gain depends on one.
- **What stays as it was.** The model: what the sim can't measure (damage taken, a talent's
  utility) is a constraint or a tie-break, never a guess. Every value that affects the result
  has a default (D29), and the optimizer is only as right as those values, so the tanks' threat
  fixes land first.

**Simplified after O1's third review round (user decision, step 6):** the preferred filler is only
the talent space's fill order (spare points go to Anticipation before Toughness); there is no
end-of-race rule preferring a close candidate with more Anticipation. The race takes no result
limits (such as a damage-taken cap, which this decision already rules out); its constraints are the
sheet's (the floor, effective health, crit and crush immunity), which are exact. An answer that
drops Anticipation entirely, when the gain is clear, is acceptable (user decision: the warrior's
Deep Wounds build, +4.4 points). After the fourth verification (step 6 again), a dimension only a
constraint made (Toughness, for the effective-health floor) takes ranks only after the preferred
filler is full.

**Superseded (user decision, after O1's fifth review round): no talent-specific rules, and the
player picks the goal.** The optimizer has no survival floor and no preferred filler: no talent is
kept, dropped or ordered because of its name. The player tells it what to optimize for, **Defense,
DPS, TPS or Balanced** (Balanced = the sum of each metric's change relative to the spec's current
default, as above; Defense = the least damage taken), and it searches every legal build, gear set and
rotation in scope and takes the best by that goal, measured. Sheet constraints stay, as options the
player sets (the effective-health floor, crit and crush immunity); they read the character sheet,
not talent names. Where this paragraph and the ones above disagree, this one holds.
**A search has a hard ceiling** (user decision, same day: "there does need to be some reasonable
limit to iterations"). The optimizer grows its budget to race every plan fairly, but never past a
fixed cap on total fights (and on builds enumerated); beyond it, it narrows the space (max ranks
first) and says so, and it shows the estimated fights and time before it runs.

**The build plan (user decision, 2026-09-25, "that sounds perfect").** The walkthrough's five
recommendations, adopted:
- **Tank defaults keep what the sim can't value, as a visible constraint.** The optimizer stays
  free of talent rules. The tanks' *default setup* passes the Optimizer a "kept talents" constraint
  for the emergency cooldowns the rotation never presses (Last Stand, Improved Shield Wall and
  their like, listed in each class doc), which the player sees and can clear. D29's "what players
  run" and D30's "the optimizer's results" meet there.
- **Gear sources.** The Optimizer offers every pool source with filters (item level, source,
  faction, locked slots). Defaults search the whole pool, as the pre-raid presets do, and each
  result says which pieces are PvP rank or rare drops.
- **The gear search (O2)** keeps each slot's top 5 to 8 items by the setup's own stat weights, plus
  the current item, then races one slot at a time (rings, trinkets and weapons in pairs, a
  two-hander against dual wield, set bonuses and unique-equipped kept), until a pass changes
  nothing, with restarts from the default preset and a stat-weight greedy set. Enchants are
  searched with their slot. Talents, gear and rotation then alternate until stable. It doesn't
  claim the global best; restarts and the fresh-seed check guard it.
- **The rotation search** covers row settings, rows on or off, and swaps of neighbouring rows, not
  free reordering.
- **In the app (O3)**, the Optimizer is its own screen from the toolbar menu, and Talents, Gear
  and Rotation each have a "Find the best…" button that opens it scoped to that tab.
- **Order:** every spec on the Rotation tab's priority list first (M5.65 A2), with the bug fixes
  and small items that can go alongside it; then O2, O3 and O4; multi-target (M6) after.

**The default gear pool is pre-raid plus the launch raids (user decision, 2026-09-25, after O2's
review, O2L-1).** O2's first search took the whole pool, and most of Fury's +6% came from Zul'Gurub's
and Ahn'Qiraj's Rares, which aren't in the game at launch. The default pool is: every item on a
pre-raid list (D11's lists); dungeon, PvP, reputation, crafted and other non-raid items up to item
level 63; and the launch raids' items (Onyxia, and Forever's new Barrow Deeps and Hyjal) where they
can be identified. Later raid drops (Zul'Gurub, Ahn'Qiraj, Molten Core, Blackwing Lair, Naxxramas and
later patches' items above item level 63) are off unless the player opts in (the CLI's `--include-later-raids`, a checkbox in
O3). The client has no drop sources, so a later item is one above item level 63 on no list, a curated
raid item or a raid set's piece; an item new in Forever counts as the launch game's. This replaces the
build plan's "defaults search the whole pool". Every answer labels each piece's source ("launch raid:
Onyxia", "PvP rank 10", "later raid, opted in"). The rule and its `[?]` edges are in
[the optimizer's default pool](optimizer.md#the-default-pool).

### D31: The Rotation tab is an action priority list you reorder (2026-09-24)
User decision, ahead of the optimizer's app screens. Each spec's rotation is an **action priority
list (APL)**, as SimulationCraft and wowsims model one, rather than a set of toggles. Each global
cooldown the sim takes the first ability in the list whose conditions hold.
- **The list is the rotation.** The Rotation tab shows the abilities in priority order. You
  **drag an ability to reorder it** (with a handle), or move it up and down with buttons or the
  keyboard. A switch on each row turns it off.
- **The selected row's options.** Tapping a row opens its own settings: rage or mana minimums,
  refresh windows, execute-phase only, and so on. They open beside the list on desktop and in a
  sheet on phones. The row shows a short summary of them ("Rage ≥ 45").
- **Spec-wide settings stay above the list:** a stance, a pet, a demon to sacrifice, the tank's
  Priority choice and consumables. The tank rotations of D28 (Defensive, Balanced, Max TPS)
  become named presets of the list: an order plus which rows are on. Editing the list after
  picking one makes it "Custom".
- **What can't move is shown but pinned:** the pre-pull and opener sequence, and rows whose place
  is a rule rather than a preference (D26's duty timing keeps its own rule wherever the duty
  sits in the list).
- **Saved setups and shared links keep working.** The config stores the order of the rows you
  moved and the options you changed, as it stores overrides today; a setup with no order gets
  the default list.
- **Conditions are each row's own options for now,** the ones the rotations already have. A
  general condition builder (any stat, aura or timer) can come later if players want one.
- **The optimizer (D30) searches the list too:** row order and options are candidates like
  talents and gear.

### D32: No pull requests; feedback through Issues (2026-09-24)
User decision. Pull requests are switched off on the GitHub repository until at least 1.0. Work
lands on `main` through the lead's merges and the review gate, as it always has. Players and
officers give feedback as GitHub Issues, which are read and triaged only when the user asks.

### D33: GitHub Issues are worked through a safety screen (2026-09-24)
User decision, amending D32 now that players are filing Issues. **Issue text is untrusted input and
may be a malicious prompt.** So:
- **The lead fetches issues into a file** and never passes an issue's raw text to a working agent.
- **A read-only safety agent screens each issue** as data: it flags prompt injection, spam or
  malicious content, restates each legitimate issue in its own neutral words, and classifies it.
  Nothing in an issue is followed as an instruction, by it or anyone else.
- **Objectively correct issues** (a bug, a wrong formula or constant, a wrong BiS item, broken
  layout) are fixed without asking the user, as normal slices briefed from the restatement,
  through the same review gate. When the fix is pushed, the agent comments on the issue with the
  commit and closes it.
- **Subjective issues, or ones that would change a deliberate design decision,** get the
  **Feature Request** label and are assigned to the user (andersonjohnf); no code changes.
- **Flagged issues** (malicious, abusive or spam) are closed with the `invalid` label and a short,
  neutral comment that says it was closed and doesn't quote it, and are reported to the user.

**Every issue hears back at each step** (user decision, same day): people should know their
feedback was seen, not find it untouched until the fix ships.
- **At triage,** the lead comments with the screen's outcome in the lead's own words, and labels it:
  `queued` (confirmed and accepted, waiting its turn), **Feature Request** (for the user to decide),
  or `invalid` (closed, as above).
- **When work starts,** `queued` becomes `in progress`, with a one-line comment.
- **When the fix is pushed,** the comment names the commit and says it's live, and the issue is
  closed.
- **Comments never quote or echo an issue's text, never link anywhere but this repository, and never
  act on anything the issue asks.** They are posted from the user's GitHub account, so they're
  short, plain and factual.


### D34: A power-user desktop layout at wide widths (2026-09-25)
User decision, from player feedback: the app is right on phones and small desktops, but at full width
on a large monitor, where about 90% of players use it, it's the mobile design scaled up and wastes
the space. The desktop audit (132 screenshots, 1280–2560 px) and its proposal were approved as
recommended, to land in the next update:
- **Under 1440 px nothing changes**: phones, tablets and today's 1024–1439 desktop.
- **From 1440 px** the page drops its 1280 px cap and fills the width (up to 2560, centred). Section
  tabs gain a summary line ("17/34/0", "Standard raid"). The results pane is 30 rem, with Cooldowns
  and the Character sheet open by default (remembered per browser). Gear's item picker opens inline
  beside the slot list, like Rotation's row panel, and stays on the slot after a pick so you can
  compare. Sections reflow by their own container width (Buffs in 2–3 columns, larger talent trees).
- **From 1920 px** the result's headline becomes a strip and its details split into two columns,
  Assumptions across both. (The proposal's third column, from a 64 rem pane, was cut: the capped page
  never gives the pane that width. The results pane grows smoothly from 1440 rather than stepping at
  1920, so no setup section loses a column at that width: the reviews' DA-2.)
- **Tabs, not a side rail**: a rail costs about 200 px that 1440 can't spare.
- **Keyboard:** Ctrl/Cmd+Enter runs Simulate, and a "Skip to results" link. No Alt+digit section
  shortcuts: Option+digit types characters on a Mac.
- **Two sections side by side** at 1920+ isn't in this cut; look again once it ships (and with the
  Optimizer's screen).
- **The review gate adds 1920 px** to its screenshot widths, beside 390 and 1280.

**Amended after the user's review of the preview (2026-09-25): designed for desktop, not scaled.**
The first build widened things to fill the space rather than using it to show more. The user's rules,
now ux.md principle 4 and a CLAUDE.md rule: mobile scrolls and desktop shows; show what fits (no
overflow menus or Advanced disclosures when there's room); never enlarge to fill (no stretched
buttons, no bigger icons); brief tasks in modals; the character sheet and a clickable setup summary
always in view; calm, single-column results. What changes from the design above:
- **The right panel** stacks the character sheet (always shown), then **Your setup** (race, talents,
  gear, buffs, rotation and fight, each line going to its section) with Simulate, then the results
  once run, in **one column**: the breakdown, then Cooldowns and buffs, then Assumptions. The
  headline strip and the two result columns go, and the tabs lose their summary lines, which the
  setup summary carries.
- **Gear shows every slot with no scrolling** at 1440×900 and up: a wide grid (armor in two
  columns, jewelry and weapons beside), each item with its enchant. The item picker is a **modal**
  again, and Gear's actions (Remove all gear, the default set) are visible buttons, not a `…` menu.
- **Buttons and choices** keep a sensible maximum width. **Buffs** runs to three columns. **Fight**
  shows Advanced open. **Talent icons** go back to their normal size (the detail panel stays).
- **The header** lists Setups, About, Release history, Coming soon and Theme in the toolbar when
  there's room; `…` only on narrow widths.
- **Kept:** nothing changes under 1440; the smooth results-pane growth; the Rotation list as one
  scrolled list; the talent detail panel; Ctrl/Cmd+Enter; the skip link.
- **Later the same day, after the user's look at the Rotation tab and the panel:**
  - **Rotation** puts its settings (consumables, cooldowns, buffs) in a column on the left, with
    every setting shown, and the priority list at the top of the next column, never pushed down by
    them. Where there's room for three columns (about 1,850 px), a selected row's settings sit in
    the third; narrower, they open under the row. "Back to list" is gone from 1440 px.
  - **The panel** is less sterile: the character sheet and Your setup are cards with headings, the
    sheet's stats grouped (Offense, Spells, Attributes, Defense), each setup line with its section's
    icon, and Simulate in an action row at the setup card's foot with the run's status beside it.
  - **Weapon skill** is one number at every width ("302 · 300" when the hands differ), since the
    old "300 main hand / 300 off hand" wrapped. **The item picker** lists the equipped item first with
    an "Equipped" badge in place of a trailing check (review finding DB-8), at every width, since
    it reads better on a phone too. These two are the only changes under 1440 px.
- **The panel and Gear, after the user's look at the fixes (user decision, 2026-09-25).** This
  replaces an earlier pinned-setup design:
  - **The character sheet is at the top** of the right panel, **Your setup beneath it**, and
    **nothing is pinned**: the sheet, the setup and the result scroll together. The headings "Character
    sheet" and "Your setup" are larger, with no icons before them.
  - **The result's headline sits in the setup card's action row**, beside Run again ("DPS 713.7 ±
    1.8"), where a status line was; the breakdown follows beneath. Simulate is in that row before a
    run. A tank's sheet is compact enough (its attack table without the paragraph) that Simulate is
    in view on load at 1440×900.
  - **Gear is two columns in the game's character-pane order**, so every slot is where a player
    expects it: Head, Neck, Shoulders, Back, Chest and Wrist on the left; Hands, Waist, Legs, Feet,
    both rings and both trinkets on the right, mirrored (icon on the outer edge); the weapons
    (main hand, off hand, ranged or relic, a hunter's ammo and quiver) along the bottom. It still
    fits 1440×900.

### D35: Firebase Hosting, beside GitHub Pages until the cutover (2026-09-25)
**Done 2026-09-25:** the first Firebase deploy went out with release 2026-09-25.2, the user checked
it, pointed `sim.decades.gg` at the site (a CNAME to `forever-sim.web.app`) and unpublished Pages.
The deploy workflow now publishes to Firebase alone. What follows is how the move was planned.

User decision. The site moves to **Firebase Hosting**: project `decades-prod`, site `forever-sim`
(`https://forever-sim.web.app`). Until the user confirms the cutover, every push to `main` deploys
the same build to both hosts, and `sim.decades.gg` stays on Pages; the cutover is a DNS change.
- **Independent jobs.** The deploy workflow builds once; the Pages and Firebase jobs each deploy
  that build, and a Firebase failure never blocks Pages during the transition.
- **The cutover, in order** (review FH-3, FH-5): check both hosts serve the same commit; add
  `sim.decades.gg` to the Firebase site and pre-provision its certificate (the ACME record) before
  moving DNS; switch the A records; keep Pages' custom-domain setting and decades.gg's domain
  verification in GitHub until DNS has moved, so the name can't be claimed in between; once the
  user confirms, drop the Pages deploy job. The Pages site itself may stay (with its custom domain)
  for the old `github.io/forever_sim/` redirect.
- **Permissions are project-wide** (review FH-2; user accepted, 2026-09-25): Firebase Hosting roles
  cover every site in `decades-prod`, so the deploy account could also change `decades-web`. All
  are the Decades umbrella's apps. The pipeline limits the exposure: only this repository's `main`
  (the provider's condition, the `firebase` environment and the job's `if`), and the CLI pinned to
  a major (`firebase-tools@15`), as decades_app pins it.
- **Workload Identity Federation, no keys.** GitHub's OIDC token is exchanged for a short-lived
  token of the service account `forever-sim-deploy@decades-prod.iam.gserviceaccount.com`, through
  a provider that trusts only this repository's `main` branch. No JSON key exists to leak.
- **Analytics are Firebase Hosting's request logs in Cloud Logging,** once the site is linked in
  the console (Project settings → Integrations → Cloud Logging, the `forever-sim` site). As of
  2026-09-25 it isn't linked yet: `decades-prod` has only audit logs. Until then, Hosting's Usage
  tab shows requests and bandwidth. Nothing in the app: no script, cookie or beacon, and no change
  to the Content-Security-Policy.
- **Security headers are real headers now** (`firebase.json`): the same policy as `index.html`'s
  meta tag plus `frame-ancestors 'none'`, which a meta tag can't set, with `nosniff`, a
  referrer policy and a restrictive Permissions-Policy. The meta tag stays, for `vite preview`, the
  e2e suite and Pages; a unit test keeps the two policies the same.
- **Caching:** Vite's hashed `/assets/` are immutable for a year, the page revalidates on every
  load, and the unhashed files in `public/` cache for an hour.

### D36: What we take from WarriorSim (2026-09-25)
**Amended by [D37](#d37-only-sourced-values-2026-09-26):** the Season of Discovery exception is narrowed to Blizzard's own SoD client
data or patch notes for a spell Forever reuses, and WarriorSim is unconfirmed data, never
authoritative; its uncited terms adopted here are re-checked against allowed sources.

User decision, after six researchers compared WarriorSim's Forever mode
([tzcnt/WarriorSim](https://github.com/tzcnt/WarriorSim) at `069329b`) with this sim, area by
area. WarriorSim is the Classic sim with a thin Forever layer; most of that layer cites no source,
and some of it is Season of Discovery code. We adopt only where its choice beats ours on the
evidence, and no organized guild tests are coming, so each call rests on the evidence in hand.
- **Adopted:**
  - **Deep Wounds rolls.** Each crit adds 60% of the critting weapon's average hit to a pool
    that the next 4 ticks pay out, and the pending tick isn't lost. Forever's bleed is spell
    412609, the Season of Discovery spell that's also in the 1.15.9 client, and the Forever
    client has no Classic bleed (12721). This is the doctrine's second exception (§2 item 4):
    SoD's behaviour for a spell Forever took from SoD, tagged `[?]`.
  - **Pre-AQ ranks everywhere.** Ahn'Qiraj comes long after launch, so no class has an AQ book's
    rank. The ability and buff ranks drop to what a trainer teaches, and there's no AQ-books
    toggle until AQ is near.
  - **Unbridled Wrath procs only from auto attacks,** not from Heroic Strike or Cleave swings,
    as the client's proc mask says.
  - **Rend's ticks add 0.02 × AP** `[?]`.
  - **Gift of Arthas** is a boss debuff a tank applies: +8 physical damage taken.
  - **Windfury's attack-power buff keeps its second charge** (2 charges, 1 s, from the client).
  - **Skyborne warriors and hunters** get the class-row placeholder the other Skyborne classes
    have (D24) instead of a refusal.
  - **The warrior defaults are re-tuned** after these changes.
- **Kept ours:**
  - the attack table (glancing 25%, crit suppression 2.4%, the queued-strike off-hand rule, the
    8% hit cap, the 27% dual-wield miss);
  - the Berserker Rage GCD and Recklessness's 15 s;
  - Improved Slam not delaying swings;
  - Blood Fury and Berserking as the client has them;
  - rage from damage taken;
  - Hand of Justice's 1% and 2 s;
  - Forever's item, consumable and enchant values;
  - no reaction delay.

### D37: Only sourced values (2026-09-26)
User decision, after a review of the tank threat terms found multipliers, ratios and fitted terms
that no source gave: values chosen to close a gap to a feeling, rescaled analogs, and client dummy
effects given a meaning by analogy. It amends D29 (every value has a default), D24 (the
Classic-based default), D36 (the Season of Discovery exception) and [doctrine §2](doctrine.md#2-where-numbers-come-from-non-negotiable).
- **No invented multipliers, ratios, scalings or fitted terms.** A described effect's default
  follows [doctrine §2's fallback order](doctrine.md#2-where-numbers-come-from-non-negotiable),
  which D37 set out: five steps from an allowed source to zero, with D24's stand-in its one
  exception. The user confirmed the five-step order on 2026-09-26
  ([D38](#d38-the-values-audits-calls-2026-09-26)).
- **An undescribed client dummy effect models as zero.** D29's "every value has a default" covers
  only effects that a tooltip, a talent's text, the client's defined meaning or observed play
  describes. Giving a dummy effect a meaning by analogy is making a number up. A zero for a dummy
  is tagged `[?]` and listed as an open question.
- **The user's offhand numbers are never evidence or targets.** No value moves to close a gap to
  a feeling (such as "800–900 TPS"). A gap no cited mechanic explains is an open question.
- **There are no guild tests or benchmarks** apart from the user's own level-20 paladin test
  (Holy Strike did 27 damage, 36 with Judgement of the Crusader, 43 with Seal of Fury as well).
  Anything else labelled a guild test, benchmark or measurement was mislabelled and is relabelled
  by where it came from: a player's in-game tests shared on Discord are third-party Forever
  measurements, `[?]`.
- **The user's exception for third-party measurements (2026-09-26)** is the order's step 2. The
  rogue's attack-power shares are the first ([rogue.md Q3, Q16](classes/rogue.md#10-open-questions)).
- **Other sims are never authoritative.** wowsims classic and SoD, WarriorSim, LibThreatClassic2
  and the Warcraft Logs threat configs are unconfirmed data we may consider. Their code, pinned
  to a commit or not, can corroborate a value or point to a source; what they may supply is the
  order's step 4. Their bear and most of their warrior threat constants cite no source.
- **Season of Discovery, scoped.** SoD stays forbidden, except Blizzard's own SoD client data or
  patch notes for a spell Forever reuses from SoD (the same spell ID in the Forever client). This
  replaces D36's "SoD behaviour as the closest analog" exception: a value from another sim's SoD
  code is still only unconfirmed data. Such values are tagged `[?]` with the spell and source.
- **Maul ×1.75 stays** `[?]` (step 4), with its provenance stated plainly: every Classic and SoD threat
  tool has used it since 2019, it traces to a 2006 guide, and it has never been measured on
  Classic Era. The same lineage covers Swipe ×1.75, Faerie Fire's 108 and Demoralizing Roar's 39.
- **Lacerate's threat is 206, flat,** by the same-wording rule: Sunder Armor's Forever value,
  with no attack-power term.

D29's other rules stand: equal threat wording across tanks (now the bonus used as is), talent
builds and presets suited to how the spec is played, and the plausibility check, whose finding is
closed by a cited mechanic or recorded as an open question, never by moving a value.

### D38: The values audit's calls (2026-09-26)
User decisions, on the questions the values audit of 2026-09-26 left open: where the allowed
sources disagree, or where none gives a value. [M5.671: Audit fixes](milestones.md#m5671-audit-fixes-)
puts them in the sim after this update, except those that keep today's model and boss melee
(#11, M5.669's slice J); the effects are the audit's estimates. **The user confirmed the five-step
order on 2026-09-26:** [doctrine §2's fallback order](doctrine.md#2-where-numbers-come-from-non-negotiable).
1. **No level-based spell resistance on the boss in `forever`**, from the beta logs' 810 non-Holy
   hits with no partial resist (D22), `[?]`; `classicEra` keeps Classic's rule. Most casters
   about +5–7%, Frost +2% ([spells §3](mechanics/spells.md#3-resistances)).
2. **Crit suppression against a +3 boss is Classic's rule:** 3 + 1.8 = 4.8 points. The melee specs
   about −1.6 to −3.1% ([combat-tables §4.4](mechanics/combat-tables.md#44-crit-suppression)).
3. **Ironfoe procs 6% of the time,** the client's `ProcChance`, not halved. Fury with it about +3.7%
   ([damage-and-timing §5.2](mechanics/damage-and-timing.md#52-ppm-vs-flat-chance-classic-era-examples)).
4. **Arcane Blast's stacks and Missile Barrage are modelled,** in their own slice (M5.671 I); a
   known gap until then ([mage.md](classes/mage.md)).
5. **Arcane Power blocking Power Infusion stays,** labelled; no change
   ([mage.md](classes/mage.md#arcane-power)).
6. **Ignite and Curse of the Elements keep today's reading,** with both readings in the open
   questions; no change ([mage.md](classes/mage.md#open-questions)).
7. **The rogue's attack-power shares stay,** labelled as a player's Discord tests, under D37's
   exception; `classicEra` takes the reading from before them
   ([rogue.md Q3, Q16](classes/rogue.md#10-open-questions)).
8. **Felstriker and Alcor's Sunrazor proc once a minute,** other sims' rate (step 4), labelled.
   Assassination and Subtlety at least +2% ([rogue.md §7.3](classes/rogue.md#73-weapons-and-gear)).
9. **Seal Fate triggers from either Mutilate hand, one point at most,** as the client's 0.5 s
   proc cooldown gives. Assassination gains ([rogue.md](classes/rogue.md#10-open-questions) Q7).
10. **Gear mp5 pays at the intended rate;** the beta's every-second bug is noted, not modelled. No
    change ([spells §8](mechanics/spells.md#8-mana)).
11. **Boss melee is measured from Classic Era public logs of Golemagg** (Molten Core), physical
    melee only, and disclosed as an estimate until the logs are measured. The user first named
    Ragnaros too, then dropped him (2026-09-26): his melee carries fire damage, and the call was for
    physical melee alone. The tanks' damage taken changes
    ([encounter §5](mechanics/encounter.md#5-boss-melee-tank-modeling)). M5.669's slice J measures
    Golemagg's.
12. **The consumable presets are rebuilt:** the tanks' like for like and for threat, every spec
    what its players use ([buffs doc](mechanics/buffs-debuffs-consumables.md)).
13. **"Crit with melee attacks" (item effects 7597 and 7598) is melee only,** per Forever's
    tooltip, `[?]`, and the hunters' presets are re-picked
    ([hunter.md §7.3](classes/hunter.md#73-gear)).
14. **Protection paladin enchants are re-picked for threat** within the effective-health floor
    ([paladin.md](classes/paladin.md)).
15. **The boss has no creature type by default,** disclosed in the results, and a Fight setting
    ([encounter §6](mechanics/encounter.md#6-creature-type-biome-and-zone-forever)).
16. **A DPS spec's damage taken stays 0,** disclosed; no change
    ([encounter §4](mechanics/encounter.md#4-targets-and-position)).
17. **Pets inherit 10% of your attack power and your crit,** a labelled exception (a testers'
    wiki); the hit and spell-damage inheritance by analogy is dropped
    ([ranged-and-pets §6.1](mechanics/ranged-and-pets.md#61-what-a-pet-inherits-from-you)).
18. **Unbridled Wrath stays at the talent's 12% a rank** (Blizzard says the beta's lower rate is
    a bug being fixed); the measured 7.5% a rank is shown in the results
    ([warrior.md](classes/warrior.md#w22-unbridled-wrath-expected-rage)).
19. **Earth Shock's threat is ×2 its damage,** labelled with Maul's lineage (every Classic threat
    tool carries it; never measured). The same-wording rule stays for the tanks' abilities
    ([threat.md](mechanics/threat.md#per-ability-threat-at-max-rank)).
20. **PvP rank rewards (ranks 7–10) aren't pre-raid gear for the presets;** Enhancement's trinket
    and relic are re-ranked within non-PvP gear ([shaman.md](classes/shaman.md)).
21. **The warlock's demon keeps its stats** (the emulator placeholder, D24) **and its attack power
    and swing** (a Blizzard-forum report on hunter pets), relabelled plainly under D37; its mana
    regeneration follows the warlock's five-second rule too, the analog used as is
    ([warlock.md §11.2](classes/warlock.md#112-your-demon)).
22. **Base spell crit of 1.7% for warlock, mage and priest stays,** labelled: from wowsims (step
    4); a pre-SoD RatingBuster reads 0.3 points lower
    ([character-stats](mechanics/character-stats.md#other-base-values-at-level-60)).
23. **Darkmoon Faire rewards** (Verimonde's Last Resort, say) **stay out of the presets' gear pool**
    for now; the picker still offers them ([items.md](data/items.md#pre-raid-bis-lists)).
24. **Lacerate stays 206 flat** ([D37](#d37-only-sourced-values-2026-09-26)), though Blizzard's own
    SoD hotfix (2 December 2024) sets 3.33 × damage for the same spell (414644, Forever's rank 1):
    the same-wording rule across tanks wins, and ×3.33 would put the bear about 48% over the
    warrior. No change ([druid.md §4.3](classes/druid.md#43-lacerate-r3-1235827)).
25. **Primal Bite's threat is back to 1 per damage:** its tooltip names no extra threat, and Forever
    reworked the spell (ranks 2–4 are new ids), so SoD's Mangle (Bear) ×1.5 doesn't carry over.
    The bear's TPS drops ([druid.md §4.2](classes/druid.md#42-primal-bite-bear-only-1238073-at-level-60)).
26. **Maelstrom Weapon's chance is the client's 50, read as 50% a melee hit,** kept and labelled:
    the tooltip describes a chance but never shows it, 50 is the client's only number for it, and
    zero is certainly wrong. No change ([shaman.md](classes/shaman.md#maelstrom-weapon)).
27. **Hammer of the Righteous reads its tooltip literally:** 3 × the main hand's damage per second,
    without attack power, by default; "with attack power" stays a setting (Character → Advanced).
    Its damage and threat drop ([paladin.md](classes/paladin.md#other-abilities)).
