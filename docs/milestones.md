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

## M1.5: Client data, one source 🚧

Slices ([CLAUDE.md](../CLAUDE.md#working-with-agents-small-slices-fresh-contexts)):
- [x] **M1.5a Pipeline:** raw DB2 and game-table files for `wow_classic_beta` 1.60.1.69913 and
      `wow_classic_era` 1.15.9.69722 through the wago.tools API (D16), parsed with WoWDBDefs,
      into `src/data/client/`. 123 of 129 doc claims confirmed, none contradicted
      ([data/client.md](data/client.md)).
- [ ] **M1.5b Doc sync:** apply the client-confirmed values to the docs, resolve the Route D
      entries in open-questions.md, and fix the 6 partial matches
- [ ] **M1.5c Items from client:** rebuild `src/data/items/pre-bis.json` from ItemSparse, Item,
      ItemSet and ItemEffect, with Classic Era rows for items whose Forever row is empty.
      Same JSON shape; drop sources go away (the Encounter Journal ships empty).
- [ ] **M1.5d Talents from client:** layout, prerequisite arrows (including the client-only
      Nature's Splendor arrow), ranks and rendered rank texts. Popular builds become our own
      documented presets.
- [ ] **M1.5e Spells and races from client:** class spellbooks via SkillLineAbility, and
      races and racials via ChrRaces and CharBaseInfo, with Classic comparisons from the Era
      build
- [ ] **M1.5f Retire foreverchanges (D17):** delete its scrapers and attribution, and make
      tier 1 of the doctrine the client files via wago.tools

## M2: Warrior DPS with the production UX 🚧

The production UX shell is built ([ux.md](ux.md)): spec switcher, Character, Talents, Gear
with enchants, Buffs, Rotation, Fight, results, persistence and share links. The engine
work is in slices:
- [ ] **M2.1 Ability framework + core Fury:**
  - GCD and cooldown events, and the ability kinds (one-roll strike, two-roll melee spell,
    on-next-swing)
  - rage costs and refunds, and the priority-list rotation with option plumbing
  - Bloodthirst, Whirlwind, Heroic Strike and Hamstring, with numbers from
    `src/data/client/spells.json` and doc fallback
  - tests W1, W3, W7, W24, and rotation sanity checks
- [ ] **M2.2 Complete Fury:**
  - Execute and the execute phase
  - Bloodrage, Berserker Rage, Death Wish, Recklessness and Battle Shout upkeep
  - racial cooldowns, Mighty Rage Potion and on-use trinkets
  - the Fury talents (Flurry, Unbridled Wrath, Enrage, Dual Wield Specialization, Impale,
    Precision, Boundless Rage, cost reductions)
  - all Fury rotation options, and a golden snapshot. Then warrior-fury becomes
    **available**.
- [ ] **M2.3 Arms:**
  - Mortal Strike, Overpower (dodge trigger, stance dancing, Tactical Mastery), Slam
    (Forever rules), Rend with Bloodthrill, Spearing Strike and Sweeping Strikes
  - Deep Wounds (412609) and Weaponmaster
  - the Arms rotation options. Then warrior-arms becomes **available**.
- [ ] **M2.4 Results and review:** results UX with real data, an e2e simulate test, the
      adversarial logic and UX review, and the first deploy

## M3: Warrior Protection (TPS) 💤

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

## Later

- Raid gear (Epic quality): widen the scraper filter
- Multi-target sims
- Balance druid, if Forever makes it a real raid spec
- Other classes, only if wowsims still hasn't arrived
