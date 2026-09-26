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
- [x] First deploy (done at M2.4j: the first release is live)

**Exit:** build, lint and tests pass; every dataset validated; every research doc has
sources, worked examples, and open questions.

## M1: Engine core ✅

The engine core D15 describes (rule profiles, stats with Forever ratings, attack tables, rage, threat, auras and procs, a deterministic worker pool), reviewed with the [first release](reviews/2026-09-23-first-release.md).

## M1.5: Client data, one source ✅

Every dataset scraped from the Forever client through wago.tools, with foreverchanges.pro retired (D16, D17), reviewed with the [first release](reviews/2026-09-23-first-release.md).

## M2: Warrior DPS with the production UX ✅

Fury and Arms on the production UX shell, the first release: [first release](reviews/2026-09-23-first-release.md), [CI and tests](reviews/2026-09-23-ci-and-tests.md).

## M2.5: Best rotations as defaults ✅

Arms' and Fury's defaults are the best rotations found (D23): [Arms](reviews/2026-09-23-arms-rotation.md), [Fury](reviews/2026-09-23-fury-rotation.md).

## M3: Warrior Protection (TPS) ✅

The tank core (the boss's swings, mitigation, TPS and damage taken) and Warrior Protection: [tank core](reviews/2026-09-23-tank-core.md), [tank results](reviews/2026-09-23-tank-results.md), [Warrior Protection](reviews/2026-09-23-warrior-protection.md).

## M4: Feral Druid ✅

The druid foundation, Cat DPS and Bear TPS: [foundation](reviews/2026-09-23-druid-foundation.md), [Cat](reviews/2026-09-23-feral-cat.md), [Bear](reviews/2026-09-24-feral-bear.md).

## M5: Paladin ✅

The paladin foundation, Retribution DPS and Protection TPS: [foundation](reviews/2026-09-23-paladin-foundation.md), [Retribution](reviews/2026-09-23-retribution.md), [Protection](reviews/2026-09-24-paladin-protection.md).

## M5.5: Every other DPS spec (D27) ✅

Every other DPS spec in D27's 90/10 mode, on shared caster and ranged-and-pet cores: [rogue](reviews/2026-09-24-rogue.md), [Enhancement](reviews/2026-09-24-enhancement-shaman.md), [caster core](reviews/2026-09-24-caster-core.md), [mage](reviews/2026-09-24-mage.md), [warlock](reviews/2026-09-24-warlock.md), [Shadow priest](reviews/2026-09-24-shadow-priest.md), [Elemental](reviews/2026-09-24-elemental-shaman.md), [Balance](reviews/2026-09-24-balance-druid.md), [ranged and pet core](reviews/2026-09-24-ranged-and-pet-core.md), [hunter](reviews/2026-09-24-hunter.md), [Demonology](reviews/2026-09-24-demonology.md).

## M5.6: Tanks, reviewed against the guild (D28, D29) 🚧

The officers' review of v1 found the Protection paladin and the bear far behind the warrior:
survival presets, known effects modelled as zero, and tank abilities treated differently for the
same threat wording. The adversarial reviews (2026-09-24) are in `.cache/probes/tank-review-*`
until each slice logs its own review. There's no numeric target for a tank (D29, user decision,
2026-09-24, withdrawing the officers' earlier feel for one): results land where the cited mechanics
put them, and a gap no mechanic explains is an observation for the guild's tests (T6).
- [ ] **T1 Shared:** threat.md's wording table (D29); Classic Era Sunder back to 261; the
      armor-only data-integrity test and the random-suffix bases it finds; like-for-like tank
      presets built for threat (the gear review)
- [x] **T2 Protection paladin:** its documented enchants and consumables
      (Nightfin Soup, Wizard Oil), its own Judgement of the Crusader (the opener) and the JotC
      rule, Seal of Fury's seal value, Holy Strike's tooltip damage, Hammer of the Righteous,
      Naglering's thorns; interim measured gear, talents and Consecration (810.8 TPS, 434.2 DPS),
      which the optimizer's results replace (O4)
- [x] **T3 Bear:** Lacerate's threat bonus, Idol of Brutality, Thorns on the tank, Thick Hide's
      armor; its talents and gear then come from the optimizer (O4). A quick fix ahead of the
      optimizer: the four fixes, threat.md's wording table, Classic
      Era Sunder at 261 (T1's), and interim 9/42/0 talents and threat gear with an effective-health
      floor ([druid.md §7.1, §7.3a](classes/druid.md#73a-interim-gear-m56-t3))
- [ ] **T4 Warrior:** its talent build and preset come from the optimizer (O4). The interim
      re-gear is done as a quick fix: the gear review's threat set with an effective-health floor,
      like the paladin's and the bear's (1,124.2 TPS, 357.0 DPS;
      [warrior.md §6.3](classes/warrior.md#63-protection-gear-interim-measured-m56-t4)); its talents
      still come from the optimizer
- [x] **T5 Balanced rotation (D28)** for all three tanks, the new default; Defensive and Max TPS
      stay selectable. First pass (D27), against Defensive in the default setup:
      - Warrior ([warrior.md §5.4 "Balanced"](classes/warrior.md#balanced-t5)): Shield Block and
        Sunder Armor's 5 stacks kept, no Thunder Clap or Demoralizing Shout, the Sunder filler only
        from 60 rage (user decision), Heroic Strike from 84: +9.5% TPS, +6.4% DPS, +21% damage taken
      - Bear ([druid.md §6.3 "Balanced"](classes/druid.md#balanced-t5)): the roar dropped, Faerie
        Fire kept: +3.1% TPS, +2.8% DPS, +0.7% damage taken. Max TPS, tuned on TPS alone, now
        Mauls from 14 ([Max TPS](classes/druid.md#max-tps-b4)): +3.3% TPS, +2.6% DPS
      - Paladin ([paladin.md](classes/paladin.md#priority-defensive-balanced-or-max-tps)): plays as
        Defensive, Holy Strike kept for Iron Creed (user decision); Hammer of the Righteous a row,
        off, above Holy Strike
- [ ] **T6 The guild's in-game threat tests,** written up for the officers: Sunder, Lacerate,
      Seal of Fury, Holy Strike, Hammer of the Righteous, Holy Shield, rage from hits taken
      - **The three tanks on build 1.60.1.70009 (the paladin review's PR-7, 2026-09-24),** with
        every 1.60.1.70009 slice merged, a raid Restoration druid's Thorns (PR-4) and the paladin's
        re-searched order and talents (PR-1): Balanced on seed 31101 (100,000 fights), **the
        warrior 1,001.6 TPS** (391.6 DPS), **the bear 1,126.6** (553.1) and **the paladin 752.6**
        (466.6; 746 at the integration, before PR-1 and PR-4). Recorded as observations, not
        failures (D29 has no numeric target): the bear is 12.5% above the warrior and 49.7% above the
        paladin, and the warrior 33.1% above the paladin. The paladin's gap is mostly 1.60.1.70009's
        Righteous Fury, +60% Holy threat where it was +90% (client and dev notes [F]); the bear's
        lead is mostly Maul (below). The model stays as it is: the tests below are what could
        explain or close either gap.
      - **Observation (TI-2, the tank integration review, 2026-09-24): the bear leads.** The default
        bear (Balanced) made **1,115 TPS** on seed 31101 (100,000 fights; 547 DPS); on the same run
        the warrior's Balanced made 1,241 and the paladin's 832 (D28; the review log's 1,240.98,
        1,115.34 and 832.09). On build
        1.60.1.70009 the warrior's Balanced fell to 993 TPS with Sunder Armor's threat, so the
        bear, still 1,116 before its own 1.60.1.70009 pass (829 for the paladin; seed 31101,
        20,000 fights), is now 12% above the warrior too: the druid slice re-measured it and kept
        it open (the 70009 warrior review's WR-9, 2026-09-24). Its
        threat by ability (seed 31101, 10,000 fights, share of threat, TPS, casts a fight): Maul
        **58.8%, 657, 73.6**; Lacerate 14.2%, 159, 53.2, and its bleed 3.5%, 39; Mangle 14.1%, 158,
        37.9; Windfury Attack 3.2%, 36; the auto attack 2.2%, 24; Faerie Fire 1.3%, 15, 21.9;
        Thorns 0.9%, 10; the rest (Primal Fury, Enrage, Hand of Justice, Natural Reaction, the
        Mighty Rage Potion) under 1% each. Maul alone is more than half, so the candidates are
        what sets Maul's threat and how often the bear can pay for it.
      - **Build 1.60.1.70009 (2026-09-24): 1,119 TPS** (1,126.6 with every slice merged, above). On seed 31101 (100,000 fights)
        the default bear makes **1,119.09 TPS** (547.44 DPS, unchanged), up 0.34% from 1,115.34.
        By ability (10,000 fights, share, TPS, casts a fight): Maul **58.6%, 657, 73.6**; Lacerate
        14.5%, 163, 53.2, and its bleed 3.5%, 39; Primal Bite (Mangle before) 14.1%, 158, 37.9;
        Windfury Attack 3.2%, 36; the auto attack 2.2%, 24; Faerie Fire 1.3%, 15; Thorns 0.9%, 10;
        Blood Frenzy (Primal Fury before) 0.8%, 9; the rest under 0.5% each. Nothing in the build
        explains or narrows the gap: Mangle's rename to Primal Bite and Primal Fury's to Blood
        Frenzy change names and icons only (the same numbers before and after); Lacerate's "high
        amount of threat" now follows Forever's new Sunder Armor (206 + 0.05 × AP for Classic
        Era's 261, [druid.md §4.3](classes/druid.md#43-lacerate-r3-1235827)), which adds the 0.3%;
        and Maul, more than half the threat, is untouched. Thorns now scales with the caster's
        spell power (the paladin slice makes that shared change; it isn't in these numbers, where
        Thorns at its base 22 is 0.9% of the threat). To test in game, in this order:
        - **Maul's threat modifier,** ×1.75 [?] from LibThreatClassic2 only (druid.md §4.8, Q15):
          threat on the boss from one Maul against its damage, with no other threat source
        - **Rage from damage dealt and taken,** both `forever` [?] models (rage.md): the rage bar
          after a measured stretch of white swings, and after a measured stretch of hits taken
        - **The Dire Bear Form threat multiplier,** ×1.3 [F] from Bear Form Passive2 (21178), and
          whether anything else in Forever stacks on it (druid.md §4.8)
        - **Savage Fury's** ×1.10 on Maul (druid.md §2.3, [F]): whether it reaches Maul's threat as
          well as its damage
        - **Rage logs:** two bears' logs of 23–24 Sep suggest more rage for it (rage from hits taken
          rises with the mob's level; one auto at the two-hander's rate), not adopted until the logs
          listed in [rage.md](mechanics/rage.md#bear-logs-of-23-and-24-sep-) settle it
      - **Observation (the paladin's 1.60.1.70009 slice, 2026-09-24): the Protection paladin trails.**
        1.60.1.70009 cut Righteous Fury from +90% to Classic Era's +60% Holy threat (client and dev
        notes [F]), and the sim doesn't invent threat to make up for it (D29). The default paladin
        (Balanced) made **749.2 TPS** on seed 31101 (100,000 fights; 466.8 DPS), against 828.9 on
        1.60.1.70009's data with the old values; with the paladin review's order and Holy Conduit 1
        (PR-1) and a raid Restoration druid's Thorns (PR-4), **752.6** (above). Its threat by
        ability now (seed 31101, 100,000 fights, 752.6 TPS; share, TPS, casts a fight): Seal of
        Fury's procs **19.0%, 143, 117.7**; Consecration 16.9%, 127, 21.3 (rank 1 0.1%); Judgement
        of Fury 14.6%, 110, 25.2; Holy Shield's block damage 12.3%, 93, 32.4 blocks; the auto attack
        9.9%, 75, and Windfury, Reckoning and the Flurry Axe's extra swings 5.3%, 40; Holy Strike
        9.7%, 73, 17.4; Hammer of Wrath 4.8%, 36; Thorns 2.1%, 16; the mana Shield Specialization,
        Improved Seal of Fury and the potion give 5.2%, 39. Holy damage is about 77% of it, all ×
        Righteous Fury, so its multiplier moves the headline most. To test in game, in this order
        (paladin.md open questions):
        - **Righteous Fury's multiplier** (25780): threat on the boss from one Holy hit (a Judgement of
          Fury while you already have top threat) ÷ its damage: 1.6 as the client says, or more
        - **Seal of Fury's per-swing damage** (T1, OQ 10): 35 flat, or 35 plus the seal value the sim
          adds [?]: its procs are the biggest share
        - **Judgement of Fury's scripted dummy** (T5, OQ 28): no threat of its own in the sim; as flat
          threat it would be about +454 TPS
        - **Holy Shield's 20%** (T6, OQ 16): multiplied with Righteous Fury (×1.92, the sim's) or added
          (×1.8), and whether its damage can miss or crit
        - **Holy Strike's formula** (T2, OQ 6): 50% of the weapon plus 81–105, or 50% of both, and its
          third effect's threat (T4, OQ 27)
        - **Thorns' and Retribution Aura's spell damage coefficient** (OQ 29): 0.08 [?]; Lightning
          Shield's 0.267 would make Thorns about 15 TPS more for the paladin

## M5.65: The Rotation tab as a priority list (D31) ✅

Every spec's Rotation tab is a priority list you reorder, with D28's tank rotations as presets: [A1](reviews/2026-09-24-rotation-apl.md), [A2](reviews/2026-09-25-priority-lists.md).

## M5.66: The wide desktop layout (D34) ✅

From 1440 px the app is a power-user workspace: [review](reviews/2026-09-25-desktop-layout.md).

## M5.665: What we take from WarriorSim (D36) 🚧 next update

The changes the user adopted after comparing WarriorSim's Forever mode with ours
([D36](decisions.md#d36-what-we-take-from-warriorsim-2026-09-25); the six comparisons were
research only). They ship as soon as the gate passes, ahead of the tooltips.
- [x] **W1 Warrior and engine:** Deep Wounds rolls; Unbridled Wrath only from auto attacks;
      Rend's ticks add 0.02 × AP; Windfury's attack-power buff keeps its second charge
- [x] **W2 Pre-AQ ranks:** every class's abilities and the buff catalogue drop the AQ books' ranks
- [x] **W5 Gift of Arthas** joins the boss debuffs (Max consumables), +8 on each direct physical hit
- [x] **W3 Skyborne warriors and hunters:** the class-row placeholder (D24) in place of the refusal
- [ ] **W4 Re-tune:** the warrior defaults after W1–W2, with every spec's headline checked (D29)

## M5.67: Item tooltips ✅

A WoW-style tooltip for every item in the gear slots and the item picker, from the client's data ([ux.md](ux.md#item-tooltips)): [review](reviews/2026-09-25-item-tooltips.md).

## M5.7: The optimizer (D30) 🚧 top priority

The sim finds the best talents, gear and rotation for a setup, within constraints the player
sets. Each spec's defaults are then its results.
- [x] **O1 Search core and talents:** a pure-TS search in `src/sim/optimize/` (paired same-seed
      racing over candidates in the worker pool, with confidence intervals), the talent build
      enumerator (tree rules, kept and excluded talents, the minimum points in a tree), rotation
      settings as candidates, and a CLI (`npm run optimize`). Also constraints on the sheet, with
      effective health and a tank's 90% floor (D30), a fresh-seed confirmation, and the pool's
      `fightRunner` for O3 ([optimizer.md](optimizer.md)). After its review
      ([log](reviews/2026-09-24-optimizer-o1.md)): every search races its start, the elimination
      bar corrects for the winner's curse, crit and crush immunity (off by default, no
      damage-taken cap), a tank's 31 points in its tree by default, and budgets that fit a large
      space. After its verifications: the setup is only ever the baseline, never an answer; every
      candidate meets every constraint, or the search says which block (user decision, simpler
      design); empty spaces and blocked searches say why, and the setup's copy costs no fights;
      the leader is the answer, and the race takes no result limits (step 6, D30). After its
      fifth round (user decision, D30): **the player picks the goal**, Defense, DPS, TPS or
      Balanced (`--goal`; tanks Balanced, DPS specs DPS by default), and **no talent-specific
      rules**: the survival floor and the preferred filler are gone, and every talent is judged
      by what the screen measures it doing for the goal. After the goals review's verification (user
      decision, D30): **a hard ceiling** on a search's fights (thorough's 24 million) and builds
      (200,000); the budget grows to it, the space narrows to max ranks past it and says so, and the
      estimate is told before the search runs
- [x] **O2 Gear:** per-slot candidates from the pool (item level range, sources, faction, class,
      locked slots), enchants, unique-equipped, two-hand vs dual wield, set bonuses, hit caps;
      coordinate ascent with restarts; talents, gear and rotation alternated until stable
      (D30's build plan, 2026-09-25: each slot's top 5 to 8 by the setup's stat weights plus the
      current item, pairs raced together, restarts from the default preset and a greedy set,
      enchants searched with their slot). Built ([optimizer.md](optimizer.md#gear)): each slot's
      top 6 by the setup's stat weights (re-measured every pass, for hit caps) or a measured swap
      (weapons, relics, modelled effects), with their top 2 enchants; rings, trinkets and weapons
      (a two-hander against a main and an off hand) in pairs; a shield tank's shield; set pieces
      swapped in together; the Zandalar and Scourge shoulder enchants left out by default; a tank's
      effective-health floor against its survival preset; `--search gear` and `--search all`
      (talents, gear and rotation in turns). Reviewed; the fix round (O2L-1 to O2L-12): the default
      pool is pre-raid gear and the launch raids, the later raids opt-in (`--include-later-raids`; user
      decision, D30 2026-09-25), every piece labelled with its source; a step moves only when it
      clears the current gear at 95% and applies D30's unmeasured-rating rule; a locked ring or trinket
      ranks through the other slot; pairs race unordered; the rankings keep the hard ceiling and the
      first ranking is the whole search's; Presence of Might left out; Balanced ranks against the
      setup; the final race on its own seed. Fury `quick`: +24.1 DPS (+2.9%) in the default pool, +46.4
      (+5.5%) with the later raids. Awaiting the fix round's verification
- [ ] **O3 In the app (after M5.65):** the Optimizer, named so in the app (user decision), a flow (what to search, constraints, a search budget, progress
      and cancel, the top results with their TPS and DPS and one-tap apply) at 390 and 1280 px.
      It shows the hard ceiling's estimate (fights and time) before the search and again before the
      race, and says when the space was narrowed (D30; [budgets](optimizer.md#budgets)). It calls
      `optimize()` in a worker, not on the page's thread: sizing and listing a space and building
      every candidate's plan and sheet take seconds (OGV-5). Two bounds the CLI doesn't need (OGV2-5):
      - **A time ceiling a device, from a measured pace:** the fights a second this device runs (a
        short calibration run, or the screen's pace) sets how many fights a search may take in the
        time the player picked; the fight cap (`MAX_SEARCH_FIGHTS`) stays the outer limit.
      - **A memory bound:** the race keeps about 24 bytes a fight a candidate (DPS, TPS and damage
        taken, 8 bytes each), about 576 MB at the 24,000,000-fight cap, enough to run a phone's
        browser out of memory. Cap the fights by the memory the device can spare too, or free a
        dropped candidate's samples.
      - Its confirmation counts under the cap, as the CLI's does (`confirmFights`, OGV2-2).
- [ ] **O4 Defaults from the optimizer:** every spec's talents, gear and rotation, confirmed on a
      fresh seed, tanks after M5.6's threat fixes

## M6: Multi-target 💤

The engine fights one target today. The design is
[encounter.md §4](mechanics/encounter.md#4-targets-and-position): extra targets are identical
copies of the boss. It comes after the tank specs (user decision, 2026-09-23).
- **Engine and config:**
  - `extraTargets` (0–4) and `extraTargetUptimePct` in the config contract (a
    [known gap](known-gaps.md))
  - each target keeps its own debuffs, bleeds, Deep Wounds and threat
  - no extra targets leaves every golden unchanged
- **Warrior** ([§5.5](classes/warrior.md#55-multi-target-options-light)):
  - Cleave in place of Heroic Strike at 2+ targets
  - Whirlwind, Raging Blows and Thunder Clap hit up to 4 targets
  - Sweeping Strikes (Arms)
- **Druid and paladin:** Swipe for bears, and Consecration, with Forever's extra damage to the
  first 4 enemies ([threat.md](mechanics/threat.md))
- **UI:** the Fight tab shows its Enemies control. Results sum damage and threat across
  targets, with a per-target split.
- **Rage from several attackers:** additive in the 18 Sep beta logs. If a test on a later
  build shows a cap, add a setting for how hits combine (additive, a cooldown, or a
  per-second cap) ([rage.md](mechanics/rage.md#rage-from-damage-taken)).

## M7: Stat boosts: gear that doesn't exist yet 💤

How a spec might scale with the next raid tier's itemization (user request, 2026-09-23;
[D19](decisions.md#d19-stat-boosts-model-gear-that-doesnt-exist-yet-2026-09-23)). For example:
20% better gear, 50 more attack power, or 10% more block value. Off by default. Run once
without it and once with it: the headline's change from the previous run is the scaling.
It comes after the tank specs and multi-target (user decision, 2026-09-23), so every spec's
stats are simulated by then, the tanks' included.
- [ ] **M7a Engine and config:**
  - `statBoost` in the config: `itemPct` (one percent for every stat from items) and `add`
    (per-stat bonuses, each a raw amount or a percent of that stat from items)
  - the stats: every one items carry, the tanks' included (block value, block chance,
    defense, dodge and parry)
  - applied to the stats from items and enchants, before talents', racials' and buffs'
    percentages, so a boosted point is worth what an item's point is; documented in a new
    section of [character-stats.md](mechanics/character-stats.md)
  - the percent also scales weapon damage (minimum and maximum, at the same speed), as better
    gear would (user decision, 2026-09-23)
  - not applied to base stats, buffs, consumables, proc and on-use effects, or set bonuses
  - Forever ratings follow D12's switch, as they do from items
  - validated and bounded in `normalize`; saved setups and share links carry it
  - tests:
    - no boost leaves every golden unchanged
    - a boost scales item stats only, in the documented order
    - same config and seed give the same result
    - boosted share links round-trip
- [ ] **M7b UI:**
  - one slider for all item stats, plus a per-stat list. Each row shows the stat from items,
    the bonus, and the total
  - lives under an Advanced disclosure (Gear or Character; decide against ux.md). Its
    "Default: none · Reset" shows when it's on
  - the character sheet shows boosted values
  - the results say a boost is on (headline badge, and an entry in the assumptions)
  - ux.md section, and e2e tests for the flow at 390 and 1280 px
- **Only adds** (user decision, 2026-09-23): the percent runs from 0 to +100%, and per-stat
  bonuses are 0 or more. The point is the next raid tier, not worse gear.
- **Needs from M3:** shields' block value, which the item data lacks
  ([known gaps](known-gaps.md)).
- M8's stat weights can build on the per-stat bonuses.

## M8: Analysis tools 💤

- Stat weights (EP) with common random numbers
- Item A vs item B comparison and talent comparison
- DPS distribution chart; timeline and combat log for debugging

## M9: Validation 💤

- Replace every D24 placeholder with a measured value. The base attributes, base health and base
  avoidance come from naked level-60 Classic Era sheets: character-stats.md OQ-1, OQ-2 and OQ-5.

- Compare against guild beta logs and target-dummy tests
- Resolve open questions, promote `[C]`/`[?]` values to `[F]` as they're verified

## M10: Tuning every spec 💤

After the other milestones (user decision, 2026-09-24): every spec landed under D27's first-pass
defaults is tuned to D23's full standard (paired 95% CIs, a fresh-seed confirmation, the
robustness grid in the class doc), and its low findings in the [known gaps](known-gaps.md) are
worked through.

## Known gaps and follow-ups

In [known-gaps.md](known-gaps.md).

## Later

- Raid gear (Epic quality): widen the scraper filter
- Other classes, only if wowsims still hasn't arrived
