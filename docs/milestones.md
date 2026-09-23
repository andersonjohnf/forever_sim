# Milestones

Status legend: ✅ done · 🚧 in progress · ⏳ next · 💤 later

The order favours getting **one complete spec in front of the guild quickly** (warrior DPS, the
best-documented spec), then widening. A spec ships only when its sim and UI are complete
([D14](decisions.md#d14-a-finished-product-ux-first-behind-a-review-gate-2026-09-22)). Every
push passes the adversarial review gate ([doctrine §6](doctrine.md#6-review-gate-before-every-push)).

## M0: Foundation 🚧

- [x] Vite + React + TypeScript + Tailwind v4 + shadcn/ui scaffold, oxlint, Vitest
- [x] GitHub Pages workflow (`.github/workflows/deploy.yml`, base path `/forever_sim/`)
- [x] Doctrine, architecture, decisions, glossary
- [x] Data snapshot from foreverchanges.pro: spells, talents, races, pre-raid items
      (item pool widened per [D10](decisions.md#d10-pre-raid-pool--rare-required-level-5560-or-item-level--58-2026-09-22))
- [x] Mechanics research: combat tables, damage & timing, encounter, rage, threat, stats,
      buffs/consumables/enchants, Forever system changes
- [x] Class research: warrior, druid, paladin
- [ ] Consolidated open-questions list for the guild to test on the beta
- [x] Data-integrity tests (counts, schema, no unresolved references, legal default builds)
- [x] Pages source set to GitHub Actions
- [ ] First deploy (placeholder page live)

**Exit:** build, lint and tests pass; every dataset validated; every research doc has
sources, worked examples, and open questions.

## M1: Engine core ✅

Built as D15 describes: rule profiles, stats pipeline with Forever ratings, attack tables,
rage, threat and TPS, auras and procs, a deterministic chunked worker pool with adaptive
stopping, and normalizeConfig. An auto-attack-only warrior matches the hand calculation
within 0.03%. Default Fury runs at about 18k fights/s per core.

## M1.5: Client data, one source ✅

Slices ([CLAUDE.md](../CLAUDE.md#working-with-agents-small-slices-fresh-contexts)):
- [x] **M1.5a Pipeline:** raw DB2 and game-table files for `wow_classic_beta` 1.60.1.69913 and
      `wow_classic_era` 1.15.9.69722 through the wago.tools API (D16), parsed with WoWDBDefs,
      into `src/data/client/`. 123 of 129 doc claims confirmed, none contradicted
      ([data/client.md](data/client.md)).
- [x] **M1.5b Doc sync:** apply the client-confirmed values to the docs, resolve the Route D
      entries in open-questions.md, and fix the 6 partial matches
- [x] **M1.5c Items from client**, in two slices:
  - [x] **c-1 Stats derivation:** turn `ItemSparse` budget allocations, the damage and armor
        tables, equip spells and item sets into stats, for both builds, and validate every item
        field by field against the current snapshot. All engine-read fields match except two
        old tooltip-parser errors (`npm run compare:items`,
        [client.md](data/client.md#items-from-the-client)).
        16 new Forever items exist only as server hotfixes, so they leave the pool (D17).
        None is on a pre-raid BiS list.
  - [x] **c-2 Switch over:** rebuild `src/data/items/pre-bis.json` from the client (same JSON
        shape), with Classic Era rows for items whose Forever row is empty (D6, D17). Tooltip
        text comes from spell descriptions, and drop sources go away, since the Encounter
        Journal ships empty. Now 1,629 items; the picker shows type and levels instead of
        sources ([items.md](data/items.md)).
- [x] **M1.5d Talents from client:** layout, prerequisite arrows (including the client-only
      Nature's Splendor arrow), ranks and rendered rank texts. Popular builds become our own
      documented presets.
- [x] **M1.5e Spells and races from client:** class spellbooks via SkillLineAbility, and
      races and racials via ChrRaces and CharBaseInfo, with Classic comparisons from the Era
      build
- [x] **M1.5f Retire foreverchanges (D17):** delete its scrapers and attribution, and make
      tier 1 of the doctrine the client files via wago.tools. `npm run scrape` rebuilds every
      dataset from the client; `-- --version=<build> --diff` diffs a new build against the
      committed data.

## M2: Warrior DPS with the production UX 🚧

The production UX shell is built ([ux.md](ux.md)): spec switcher, Character, Talents, Gear
with enchants, Buffs, Rotation, Fight, results, persistence and share links. The engine
work is in slices:
- [x] **M2.1 Ability framework + core Fury:**
  - GCD and cooldown events, and the ability kinds (one-roll strike, two-roll melee spell,
    on-next-swing)
  - rage costs and refunds, and the priority-list rotation with option plumbing
  - Bloodthirst, Whirlwind, Heroic Strike and Hamstring, with numbers from
    `src/data/client/spells.json` and doc fallback
  - tests W1, W3, W7, W24, and rotation sanity checks
- [x] **M2.2 Complete Fury**, in three slices (M2.1's handoff list, split):
  - [x] **M2.2a Talents on abilities and the execute phase:** cost reductions and Impale,
        Unbridled Wrath on Heroic Strike swings (Q5), the execute-phase event, Execute (§5.2
        rows 6–7), Raging Blows, and stance gating
  - [x] **M2.2b Cooldowns:** self-buff and energize ability kinds, and time-left conditions
        with a wake-up event; Bloodrage, Berserker Rage, Death Wish (`alignToEnd`),
        Recklessness (`lastSec`), and the racial cooldowns (§5.2 rows 2–5 and 13)
  - [x] **M2.2c Upkeep, pre-pull and consumables:** Battle Shout upkeep, the pre-pull actions,
        Mighty Rage Potion, on-use trinkets (§5.2 rows 0, 1 and 16); re-snapshot the goldens,
        then warrior-fury becomes **available**
  - Later: §5.2 rows 10 (Overpower dance) and 15 (Slam) come with M2.3, which builds those
    abilities and stance swaps. Row 14 (Sunder Armor) comes with M3. Whirlwind extra
    targets wait for multi-target support ([Later](#later)).
- [x] **M2.3 Arms**, in three slices:
  - [x] **M2.3a Arms abilities:** Mortal Strike, Slam (cast time; swing timers reset without
        Improved Slam, untouched with it), Spearing Strike (creature types), and Rend (a bleed,
        with Improved Rend and Forever's tick crits). Fix the docs on Impale's class mask,
        which includes Rend and Sunder Armor (W2, W4, W6, W13).
  - [x] **M2.3b Stances and reactive windows:** stance swaps (1 s cooldown, rage kept per
        Tactical Mastery, stance effects swapped), the Overpower window from dodges and
        Bloodthrill, Improved Overpower, stance-dance lines, and GCD-safe that respects
        stances. Then Fury's Overpower dance and Slam options (§5.2 rows 10 and 15)
        (W5, W18).
  - [x] **M2.3c Arms rotation:** §5.3's priority list and options, including the Berserker
        base-stance alternative (Q24), the Whirlwind dance, and Recklessness swapping to
        Berserker Stance for the rest of the fight. Re-snapshot the goldens, then
        warrior-arms becomes **available**.
  - Sweeping Strikes waits for multi-target support ([Later](#later)); Deep Wounds and
    Weaponmaster are already simulated.
- [ ] **M2.4 Results and review**, in slices:
  - [x] **M2.4a Results and rotation polish:**
    - show cooldown casts and aura uptimes in the results
    - split Rend's application avoidance from its ticks
    - group the Rotation tab (Fury 27 rows, Arms about 42)
    - make the choice control's selected state clearer
    - the Buffs tab reads maintained buffs through `rotationValues`
  - [x] **M2.4b Adversarial logic review:** fresh reviewers, briefed to break the engine and
        the data pipeline, check everything since the first commit against doctrine and the
        owning docs. Every finding is fixed or waived, logged in `docs/reviews/`.
  - [x] **M2.4c Adversarial UX review:** a fresh reviewer works through the ux.md checklist
        on every screen at 390 and 1280 px, light and dark. Findings logged and resolved.
  - [ ] **M2.4d First deploy:** push when the user asks, and check the Pages deploy.

## Session handoff (2026-09-23)

State: `main` is green (lint, typecheck, 585 unit, 26 e2e with 3 deferred to M3). Nothing is
pushed. Fury and Arms are available. M2.4a is done; the review gate is in progress, logged in
[reviews/2026-09-23-first-release.md](reviews/2026-09-23-first-release.md): 38 logic and 32 UX
findings.

**In flight** (one agent per slice, each in a `.claude/worktrees/` worktree, uncommitted until
the lead verifies):
- Logic fixes:
  - F1a engine and effects
  - F1b warrior and rotations
  - F1c config and gear
  - F2 data pipeline
  - F3 Classic Era profile values
- UX fixes:
  - UX-A results and run states
  - UX-C app shell and accessibility

**Merge plan:**
- Verify and commit each slice on its branch, then cherry-pick onto `main` one at a time.
- Resolve the golden snapshot once all logic slices are in: re-run it and explain every
  change in the commit.
- F2 reported edits for files it doesn't own (`profiles.ts` Demoralizing Shout, the
  `abilities.ts` Execute comment); the lead applies them.
- Then dispatch UX-B1 (Rotation) and UX-B2 (setup screens), which touch files F1b and F1c own.

**Then:**
- Re-review what changed since the review (a short logic and UX pass on the fixes).
- Update each finding's disposition with its commit and set the verdict.
- Push only when the user asks.
- Open decision for the user: whether Arms defaults should follow the tuning findings
  (Heroic Strike 55, Whirlwind dance, Spearing Strike 40, Rend refresh 3 s).

## M3: Warrior Protection (TPS) 💤

- Enable the three `test.fixme` tests in `e2e/tank-results.spec.ts` once Protection ships
  (they load Protection from a share link, which is refused while it isn't offered)

- Boss auto-attacks on the player: avoidance, block, crushing blows, rage from damage taken
- Tank rotation (Shield Slam, Revenge, Sunder, Heroic Strike dumping)
- TPS output (plus damage taken as context)

## M4: Feral Druid 💤

- Cat DPS: energy ticks, combo points, powershifting and mana, Omen of Clarity
- Bear TPS: Maul, Swipe, rage, bear avoidance

## M5: Paladin 💤

- Retribution DPS: seals, judgements, mana model
- Protection TPS: Righteous Fury, Holy Shield, Reckoning, Consecration

## M6: Analysis tools 💤

- Stat weights (EP) with common random numbers
- Item A vs item B comparison and talent comparison
- DPS distribution chart; timeline and combat log for debugging

## M7: Validation 💤

- Compare against guild beta logs and target-dummy tests
- Resolve open questions, promote `[C]`/`[?]` values to `[F]` as they're verified

## Known gaps and follow-ups

Found while building. Each should go to the owning doc or `open-questions.md` when its
slice is worked:
- **Encounter settings the contract lacks:** `biome`, `extraTargetUptimePct` and
  `bossExtraDtps` ([encounter.md](mechanics/encounter.md#encounter-settings)).
- **Engine choices where the docs are silent (made in M1):**
  - Incoming damage for DPS players arrives as one hit every 2 s.
  - The boss first swings at t = 0.
  - Elemental Sharpening Stones stack: +2% crit to all melee attacks per stone [?]
    ([buffs §3.6](mechanics/buffs-debuffs-consumables.md#36-weapon-enhancements-temporary)).
- **Data gaps:** the items have no shield block value (block value counts Strength only).
  Warrior base health and dodge are unknown and left off the sheet. Skyborne, paladin and
  druid base stats are unknown, so those sims refuse with a plain message (character-stats
  OQ-1: needs Classic Era naked character sheets).
- **The buffs doc says Hyjal flasks are "added automatically"** but not which flask.
- **Bundle size:** 1.78 MB (300 KB gzipped) after M1.5c, mostly item data. Consider
  lazy-loading talents per class, and slimming item fields the app doesn't read.
- **Fury's `btOverExecuteAp` default is a fixed 2220** (W11 at Execute cost 15). Rotation
  options have one default per spec, not per build, so an Improved Execute build has to set
  2434 itself. A per-build default needs an API in `sim/index.ts` and the Rotation UI.
- **Cleave isn't built yet,** so W21's Cleave costs (Improved Cleave, Raging Blows) are
  untested.
- ~~Snap can't capture a finished run~~: `--click Simulate` now waits for the result, and
  `--click "Show results"` opens the phone's results sheet.
- **Arms tuning findings** (20,000 fights, default setup, 630 DPS): Heroic Strike from 55 rage
  gives 638 (+1.2%), the Whirlwind dance 635, and Spearing Strike from 40 rage 634. The
  documented defaults stay for now; see warrior.md §5.3's notes.
- **Gnome Eureka! isn't simulated** (warrior Q18); the result says so.
- **Multi-target isn't simulated.** The Fight tab's Enemies control is hidden until it is;
  `extraTargets` stays in the config ([encounter.md §4](mechanics/encounter.md)).
- **Items:** 18320 Demonheart Spaulders may not be obtainable; PvP rank requirements show as
  numbers (the rank title depends on faction); whether a bear-form armor multiplier applies
  to stat-50 bonus armor is open (M4). Fallback shields carry `classicShieldBlockValue`,
  and Forever shields have no innate block value in the client (M3).
- **Pushes:** nothing has been pushed yet; `origin/main` is still the first commit. The first
  push happens at M2.4, after the full review gate.

## Later

- Raid gear (Epic quality): widen the scraper filter
- Multi-target sims
- Balance druid, if Forever makes it a real raid spec
- Other classes, only if wowsims still hasn't arrived
