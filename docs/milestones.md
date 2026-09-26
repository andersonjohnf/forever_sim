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

## M2: Warrior DPS with the production UX ✅

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
    targets wait for multi-target support ([M6](#m6-multi-target-)).
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
  - Sweeping Strikes waits for multi-target support ([M6](#m6-multi-target-)); Deep Wounds and
    Weaponmaster are already simulated.
- [x] **M2.4 Results and review**, in slices:
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
  - [x] **M2.4e Number fields** (RV1, RV7): the field shows the plain number while you edit
        it and its separators once you leave, and half steps snap evenly.
  - [x] **M2.4f Remove Undo**
        ([D21](decisions.md#d21-no-undo-setups-are-saved-loaded-exported-and-imported-2026-09-23)):
        changes happen without an Undo toast. Toasts become plain notices that go after
        10 s, and the waiting toasts go, with the code that made room for them (RV2–RV6).
  - [x] **M2.4g Setups** (D21):
    - [x] Save a named copy of the current setup, and Load, rename or delete one; announce
          bulk changes that have no notice (part 1)
    - [x] Export a setup code for the current setup, or a `.json` file of every saved setup
          plus the current one; import a code or share link as the current setup, or a file
          into the list (part 2)
  - [x] **M2.4h Rage from damage taken:** make `10 × damage before armor, block and absorb ÷
        maximum health` the Forever default, from about 2,000 logged beta hits (research
        2026-09-23, [rage.md](mechanics/rage.md#rage-from-damage-taken)). Blocks and absorbs
        don't reduce it, and hits from several attackers each count.
  - [x] **M2.4i Review of e–h:** the full logic and UX reviews for new work, then a
        verification pass (D20).
  - [x] **M2.4j First deploy:** pushed, and the Pages deploy and Full regression are green.

## Session handoff (2026-09-23)

State: `main` is green (lint, typecheck, 1,050 unit, 225 e2e with 3 deferred to M3), pushed and
deployed. Fury and Arms are available.

**The first release is live** at https://andersonjohnf.github.io/forever_sim/. Its review log
is [reviews/2026-09-23-first-release.md](reviews/2026-09-23-first-release.md), and pushes now
happen at every stable state (D25).
- **First pass:** 38 logic and 34 UX findings.
- **Second pass** (a review of the fixes): 10 logic and 17 UX findings.
- **Third pass:** 6 logic and 12 UX findings.
- All of those are fixed.
- **Final verification:** nothing blocking. Of its 7 polish findings, 3 are fixed and 4 are
  deferred with reasons (listed under known gaps below).
- **Review of the post-verification commits:** 9 findings (PV1–PV9), one blocking (PV1: the
  sheets got no toast clearance). All fixed.
- **Review of the PV fixes:** 10 findings (QV1–QV10), one blocking (QV1: selects listed their
  options under a waiting toast). 9 fixed, 1 waived (QV8, extra room).
- **Review of the QV fixes:** 8 findings (RV1–RV8), one blocking (RV1: editing a grouped
  number field's display misread it). Number fields get a simpler design (M2.4e), and Undo
  goes (D21), which retires the toast findings.
- **Full review of M2.4e–h** (new work): 13 logic and 15 UX findings, one blocking (UX1: Save
  overwrote a same-named save across specs). All fixed, except UX2's safety net (waived, D21)
  and UX15 (deferred). Its verification found 12 more (VF1 blocking: the Delete confirm's
  contrast), all fixed, and the quick check of those fixes passed, waiving 3 nits (QC1–QC3).

Golden runs (then): Fury 668.6 DPS, Arms 611.9 DPS, Protection 217.0 TPS. Each golden's history
comment in `engine.test.ts` has today's.

**Next:** the parallel tracks below (tank core, druid, paladin, Warrior Protection).

**Rotation defaults** follow D23: the best one found becomes the default (M2.5).

## M2.5: Best rotations as defaults ✅

Per [D23](decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23), each
spec's default rotation is the best one we've found.
- [x] **M2.5a Arms:** re-measure the tuning findings on the current engine and adopt what beats
      the default:
  - Heroic Strike from 55 rage
  - the Whirlwind dance
  - Spearing Strike from 40 rage
  - Rend refresh at 3 s

  Also search the other Arms options. The findings are in the known gaps and warrior.md §5.3.
- [x] **M2.5b Fury:** search Fury's rotation options the same way (warrior.md §5.2). Adopted:
      +6.4% (670.6 → 713.5 DPS), plus a potion rule for short execute phases
      Ahead at every fight length and execute phase measured. The Overpower dance is on (up to 40
      rage), Hamstring off, Heroic Strike from 40 with its cancel and in the execute phase, and
      Death Wish, Recklessness and the potion follow the phase
      ([warrior.md §5.2](classes/warrior.md#tuning-the-defaults-m25b)).
- Each slice records its method and numbers in warrior.md, re-snapshots the goldens, and goes
  through the review gate.
- The Rotation tab's intro says what each spec's defaults are: "tuned for the default setup"
  once a slice has tuned them (Arms since M2.5a, Fury since M2.5b), "the common priority" until
  then (`rotationDefaultsNote` in `src/sim/classes/rotation.ts`).

## Parallel tracks: the tank specs first, and every remaining spec (user priority, 2026-09-23)

The goal is every DPS and tank spec. The tracks run at the same time, each in its own worktree
with its own review gate, and the lead merges them one at a time (D25). Tracks B and C start
without waiting for A; only the Bear and Paladin Protection slices need the tank-core slice.

| Track | Slices | Milestone | Depends on |
| --- | --- | --- | --- |
| A. Tank core | Tank core (T1): the boss attacking the player, mitigation, tank stats; tank results UI (T2) | M3 (its first bullets) | – |
| B. Druid | B1: druid foundation (forms, energy, combo points, rage, mana); B2: Cat; then Bear | M4 | Bear needs T1 |
| C. Paladin | C1: paladin foundation (spells, mana, seals, Judgement, Righteous Fury); C2: Retribution; then Protection | M5 | Protection needs T1 |
| Warrior Protection | its abilities, rotation and defaults | M3 | T1 |
| Fury tuning | search Fury's rotation options under D23, as M2.5a did for Arms | M2.5b | the M2.5a fixes, which change shared warrior options |

Unknown base values don't gate any of it
([D24](decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)): they ship as flagged
placeholders, and M9 replaces them.

## M3: Warrior Protection (TPS) ✅

- [x] **T1 tank core and T2 tank results:** the boss's swings on the player (avoidance, block,
      crushing blows, rage from damage taken), mitigation, TPS and damage taken in the results
      ([T1](reviews/2026-09-23-tank-core.md), [T2](reviews/2026-09-23-tank-results.md))
- [x] **P1 and P2 Warrior Protection:** its abilities and rotation, tuned on TPS with the tank's
      duties kept (D26), a selectable Max TPS priority, a 51-point default build, and shipped:
      the app is "A DPS and TPS simulator"
      ([review](reviews/2026-09-23-warrior-protection.md)). The share-link tank tests run
      without `?preview`.
- Shields' block value, which the item data lacks and M7's stat boosts need too, still comes
  from a flagged Classic Era fallback shield.

## M4: Feral Druid ✅

- [x] **B1 druid foundation:** forms, Energy, combo points, mana and the power tick, shifting and
      Furor, Omen of Clarity, form weapons and attack power, bear armor, talents
      ([review](reviews/2026-09-23-druid-foundation.md)). No druid spec is offered yet.
- [x] **B2 Cat DPS:** its rotation (bleeds, finishers, Faerie Fire; no powershifting in Forever),
      +3.7% over the doc's first priority under D23, and shipped
      ([review](reviews/2026-09-23-feral-cat.md))
- [x] **B3 Bear TPS:** Maul, Swipe, Mangle, Lacerate, its duties first by default (D26), tuned
- [x] **B4 Bear:** the Max TPS rotation (D26), and shipped
      ([review](reviews/2026-09-24-feral-bear.md))

## M5: Paladin ✅

- [x] **C1 paladin foundation:** spells and the Holy school, seals, Judgement, Consecration,
      Righteous Fury, talents, and mana on the druid's model
      ([review](reviews/2026-09-23-paladin-foundation.md)). No paladin spec is offered yet.
- [x] **C2 Retribution DPS:** its rotation, mana potions and runes, trinkets and Juju Flurry,
      +1.3% over the doc's first priority under D23, a mana ledger, and shipped
      ([review](reviews/2026-09-23-retribution.md))
- [x] **C3 Protection TPS:** Holy Shield, Reckoning, Redoubt, Consecration; duties first by
      default and a Max TPS priority (D26), tuned, and shipped
      ([review](reviews/2026-09-24-paladin-protection.md))

## M5.5: Every other DPS spec (D27) ✅

Every DPS spec in the game, before multi-target, landed in the 90/10 mode of
[D27](decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24):
first-pass defaults within about ±5%, one combined review, shared engine cores before class
slices. Melee and physical first (user decision, 2026-09-24). Each class slice: a class doc
(Forever changes from the client, the Classic Era priority, open questions), its scraped data,
talents and default build, abilities, rotation, defaults, e2e, shipped.
- [x] **R1 Rogue:** Combat, Assassination, Subtlety. Energy and combo points reuse the cat's;
      poisons, Slice and Dice, Blade Flurry, Adrenaline Rush, dual wield
      ([review](reviews/2026-09-24-rogue.md))
- [x] **S1 Enhancement Shaman:** Stormstrike (Forever: self only), Windfury Weapon, shocks,
      totems as its own buffs, mana ([review](reviews/2026-09-24-enhancement-shaman.md))
- [x] **K1 Caster core:** casts and channels, DoTs, spell power and coefficients, spell hit,
      crit and partial resists, the caster debuffs (Curse of the Elements, Shadow Weaving,
      Scorch, Winter's Chill), mana with the five-second rule
      ([review](reviews/2026-09-24-caster-core.md))
- [x] **K2 Mage:** Fire, Frost, Arcane ([review](reviews/2026-09-24-mage.md))
- [x] **K3 Warlock:** Destruction, Affliction (Demonology with the pet core, H3 below)
      ([warlock.md](classes/warlock.md)) ([review](reviews/2026-09-24-warlock.md))
- [x] **K4 Shadow Priest** ([review](reviews/2026-09-24-shadow-priest.md))
- [x] **K5 Elemental Shaman** ([review](reviews/2026-09-24-elemental-shaman.md))
- [x] **K6 Balance Druid:** Moonkin Form ([review](reviews/2026-09-24-balance-druid.md))
- [x] **H1 Ranged and pet core:** Auto Shot and ranged weapons, ammo, and pets with their own
      attacks ([ranged-and-pets.md](mechanics/ranged-and-pets.md)) ([review](reviews/2026-09-24-ranged-and-pet-core.md))
- [x] **H2 Hunter:** Beast Mastery, Marksmanship, Survival, on the ranged and pet core with
      first-pass defaults ([hunter.md](classes/hunter.md)) ([review](reviews/2026-09-24-hunter.md))
- [x] **H3 Demonology Warlock:** a demon kept out beside a sacrificed one (Demonic Pact), on the pet
      core ([warlock.md §11](classes/warlock.md#11-demonology)) ([review](reviews/2026-09-24-demonology.md))

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

- [x] **A1 APL core and the Rotation tab:** rotation rows as data with their own options, a stored
      order, the plan compiler following it, pinned rows, D28's rotations as named presets and
      "Custom"; the drag-and-drop list with keyboard and button moves, per-row switches, the
      selected row's options (side panel on desktop, sheet on phones); Fury as the pilot spec.
      Fury's plans are byte-identical at the default order (its golden run, and 400 random
      settings compared against the engine before the list); presets are built but only A2's
      tanks declare named ones
- [x] **A2 Every other spec on the list:** the tanks after M5.6's fixes merge, then the rest in
      batches; each spec's toggles become rows and row options, with its goldens unchanged at the
      default order
      - [x] The three tanks (Protection warrior, Feral bear, Protection paladin): their rows in
            their class docs' order, only the pre-pull and opener pinned, D26's duties movable with
            their timing rule, D28's rotations as one preset mechanism (the `default` preset named
            and placed by the spec, the Priority set only by the picker, which sits at the top of
            the tab with a short line and every preset's numbers in its info). Defensive's and Max
            TPS's plans byte-identical to before the list for 200 random setups each, and a
            Defensive golden per tank equal to its old default's
            ([architecture.md](architecture.md), "Rotation as a priority list")
      - [x] The rest, one slice a class in parallel (user priority, 2026-09-25: "getting the true
            APL on all specs is priority"), each with a 200-setup plan snapshot taken before the
            move and byte-identical plans at the default order: Arms; Retribution; Feral cat and
            Balance; Enhancement and Elemental; the three rogues; the three hunters; the three
            mages; the three warlocks (then issue #17's Incinerate filler and Searing Pain with
            Demonic Brand); Shadow

## M5.66: The wide desktop layout (D34) ✅

From 1440 px the app becomes a power-user workspace; nothing under 1440 changes
([D34](decisions.md#d34-a-power-user-desktop-layout-at-wide-widths-2026-09-25); the audit's proposal
in `.cache/probes/desktop-audit/proposal.md`). Each slice keeps the phone and 1024–1439 layouts
pixel-identical (before and after snaps at 390, 1024 and 1280), adds its own e2e at 1440 (and 1920
where it changes) and updates only its own ux.md subsection.
- [x] **S0:** opening Assumptions on desktop no longer adds blank page (the audit's bug)
- [x] **S1 Shell:** the wide grid to 2560 px, the results pane growing smoothly, the `setup` and
      `results` containers, the skip link, and the toolbar's items inline
- [x] **The right panel** (amended twice by the user): the character sheet, then Your setup with
      Simulate and the result's headline, then the breakdown in one column; nothing pinned
- [x] **Gear** in the game's character-pane order, every slot in view at 1440×900, the picker a modal
- [x] **Buffs, Character and Fight** in balanced columns with everything shown; **Rotation**'s
      settings in a column beside the list; **Talents** at normal size with a detail panel
- [x] **Ctrl/Cmd+Enter runs Simulate**; focus kept through every change of layout
- [x] **The light theme's contrast** (user decision): a navy toolbar, white panels on a tinted page,
      tooltips that follow the theme

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

A WoW-style tooltip for every item, built from the Forever client's own data (user decision,
2026-09-25: its own milestone, shipping in the update after the priority lists and the wide
layout, ahead of the optimizer). It shows the item as the game does: name in its quality colour,
slot and type, armor, weapon damage and speed, stats, equip and use effects, set and its bonuses, and
the item level, plus the enchant on it. On desktop it opens on hover and on keyboard
focus; on a phone, where nothing hovers (docs/ux.md), a tap on the item's info control or a long
press opens it, and it closes on a tap outside or Escape.
- [x] **T1 Tooltip content:** a pure function from an item (and its enchant) to the tooltip's lines,
      with tests against the client data, and the tooltip component
- [x] **T2 Where it shows:** the gear slots and the item picker, at every width (the character sheet shows no items)

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
- [ ] **O2 Gear:** per-slot candidates from the pool (item level range, sources, faction, class,
      locked slots), enchants, unique-equipped, two-hand vs dual wield, set bonuses, hit caps;
      coordinate ascent with restarts; talents, gear and rotation alternated until stable
      (D30's build plan, 2026-09-25: each slot's top 5 to 8 by the setup's stat weights plus the
      current item, pairs raced together, restarts from the default preset and a greedy set,
      enchants searched with their slot)
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
