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
to **[F]** when the guild measures it. Anecdotes and single-tester fits still can't set a default.
This covers the white-hit rage normalization and the damage-taken formula
([rage.md](mechanics/rage.md)).

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
  wins on TPS without resting on an untested threat value. Shield Slam stays: dropping it gains 3.3% TPS
  only at Classic Era's +254 threat [?], while Forever's tooltip raised its threat to "very high",
  and from about +449 keeping it wins on TPS as well.
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
  milestones' known gaps with their reasons, unless fixing one is a one-line change. A
  verification pass follows only when a fix changed engine logic; copy and doc fixes don't need
  one.
- **Shared engine first, then thin class slices.** A caster core (casts, channels, DoTs, spell
  power, spell hit, crit and resists) and a ranged core (Auto Shot, ranged weapons, pets) are
  built once; each class is then data, talents and a rotation.
- **A merge queue with at most about four agents at once.** A branch rebases once, just before
  its review, and merges as soon as it's green.
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
    by D26's duty rule but not used as a filler; it drops Thunder Clap and Demoralizing Shout
  - a bear keeps Faerie Fire and drops Demoralizing Roar
  - a paladin keeps Devotion Aura and Holy Shield

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

Status: decided, not built yet. The rotation slice (T5 in the milestones) comes after the tanks'
threat fixes.

### D29: Same threat words, same threat; presets geared for what they measure (2026-09-24)
User directive, after v1's tank numbers embarrassed the user in front of the guild: the
Paladin and bear presets came from survival guides, and every tank ability whose extra threat
had no known number was modelled with none. Both are now rules:
- **Equal threat wording across tanks.** A tooltip's threat wording means the same thing on
  every tank class. "A high amount of threat" on a bear's or a paladin's ability is the same
  bonus as on a warrior's ability that says it. When the ability has no tier 1–2 value, it takes
  the value of the known abilities with the same wording, scaled the way those values scale,
  as a `[?]` assumption shown in the results. A guild measurement replaces it.
- **Every value that affects the result has a default.** Leaving a known variable blank was
  meant as caution, but it models the effect as zero, and that made the sim far less accurate.
  Anything we know exists (from a tooltip, the client, a talent's text or how the game plays)
  gets a sensible default from the closest allowed analog or an estimate reasoned from allowed
  sources. It's flagged `[?]` and shown in the results' assumptions, never left out. Only an
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
- **The guild's benchmark for tanks** (user, 2026-09-24): at the default setup, a Protection
  paladin and a bear should reach about 800–900 TPS, and a warrior shouldn't lead either by
  more than about 50%. It's the officers' experience, not a measurement, so it doesn't set any
  constant by itself. It does count as evidence when a value is unknown: where an allowed
  source leaves a range, the default takes the reading that fits the benchmark. A tank that
  still misses the benchmark after that is an open plausibility finding, and its fix goes to
  the guild's in-game tests or to combat logs.

### D30: The sim finds the best talents, gear and rotation itself; defaults are its results (2026-09-24)
User decision, now the top priority. Talent builds, gear sets and rotations have a numerically
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
  as the floor, the ones nearly every tank takes, such as big cuts to defensive cooldowns.
- **A tank's gear keeps an effective-health floor** (user decision). Survival stats cost a tank
  threat in Forever (rage from hits taken divides by max health, and avoided hits give none), so
  an unconstrained search builds glass cannons. Effective health is max health ÷ (1 − armor's
  damage reduction against the boss's level), the physical damage it takes to kill you. A high
  health total in light armor doesn't meet it. By default a result keeps at least 90% of the
  effective health of the class's survival preset, and the player can change the share.
  Avoidance and block aren't in it: they lower average damage but don't survive a spike.
  Every result shows its health, effective health and damage taken.
- **What stays as it was.** The model: what the sim can't measure (damage taken, a talent's
  utility) is a constraint or a tie-break, never a guess. Every value that affects the result
  has a default (D29), and the optimizer is only as right as those values, so the tanks' threat
  fixes land first.

