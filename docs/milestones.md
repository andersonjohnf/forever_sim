# Milestones

Status legend: ✅ done · 🚧 in progress · ⏳ next · 💤 later

The order favours getting **one class in front of the guild quickly** (warrior DPS, the
best-documented spec), then widening. Each milestone ends with a deploy to GitHub Pages.

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

## M1: Engine core ⏳

- **Rule profiles.** Research found several places where the Forever client and Classic Era
  disagree and neither is measured yet: attack-table constants, white-hit rage (normalized
  vs damage-based), rage from damage taken, and rating conversions. Each such rule is data
  in a profile (`forever`, the default, and `classicEra`), so a guild measurement changes
  a number, not code. The results panel shows which profile ran.
- **Ratings.** Forever gear uses combat ratings (crit, hit, haste, expertise, dodge, parry,
  block, defense). The stats pipeline converts them at level 60, and items without Forever
  data still use Classic percentages.
- Seeded RNG, event queue, integer-ms timeline
- Stats pipeline: race/class base + gear + enchants + buffs → derived stats
- Melee attack table (white one-roll, yellow as documented), weapon skill, glancing,
  crit, armor mitigation, dual-wield penalty, normalization
- Swing timers, haste, GCD, cooldowns, generic auras/procs (PPM and flat %), DoTs
- Resources: rage, energy, mana
- Threat accounting with modifiers
- Results: DPS/TPS mean, standard deviation, confidence interval, per-ability breakdown
  (casts, hits, crits, misses, dodges, parries, glances, blocks, damage, threat), aura uptimes
- Web Worker runner with progress, split across cores
- Unit tests from every worked example in `docs/mechanics/*`

**Exit:** a white-swings-only warrior matches a hand calculation within tolerance; the
mechanics docs' worked examples all pass as tests.

## M2: Warrior DPS + first usable UI ⏳

- Fury (dual-wield) and Arms (2H) rotations from [classes/warrior.md](classes/warrior.md)
- UI:
  - **Character**: race, spec, talents (popular builds, or paste a build code)
  - **Gear**: per-slot picker over `src/data/items/pre-bis.json` with search and enchants
  - **Buffs/debuffs/consumables**: toggles with presets
  - **Rotation**: ability toggles and thresholds, with sensible defaults
  - **Encounter**: fight length, boss armor, execute phase
- Results panel; the setup is saved to localStorage and shareable by URL
- Deploy, and collect the guild's first round of feedback

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
