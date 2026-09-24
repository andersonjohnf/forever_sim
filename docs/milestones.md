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
until each slice logs its own review. The guild's benchmark (D29): a paladin and a bear at about
800–900 TPS, a warrior no more than about 50% ahead.
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

## M5.65: The Rotation tab as a priority list (D31) 🚧 before the optimizer's app screens

- [x] **A1 APL core and the Rotation tab:** rotation rows as data with their own options, a stored
      order, the plan compiler following it, pinned rows, D28's rotations as named presets and
      "Custom"; the drag-and-drop list with keyboard and button moves, per-row switches, the
      selected row's options (side panel on desktop, sheet on phones); Fury as the pilot spec.
      Fury's plans are byte-identical at the default order (its golden run, and 400 random
      settings compared against the engine before the list); presets are built but only A2's
      tanks declare named ones
- [ ] **A2 Every other spec on the list:** the tanks after M5.6's fixes merge, then the rest in
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

## M5.7: The optimizer (D30) 🚧 top priority

The sim finds the best talents, gear and rotation for a setup, within constraints the player
sets. Each spec's defaults are then its results.
- [ ] **O1 Search core and talents:** a pure-TS search in `src/sim/optimize/` (paired same-seed
      racing over candidates in the worker pool, with confidence intervals), the talent build
      enumerator (tree rules, required talents, the minimum points in a tree, the class's
      survival floor), rotation settings as candidates, the objective per role, and a CLI
      (`npm run optimize`)
- [ ] **O2 Gear:** per-slot candidates from the pool (item level range, sources, faction, class,
      locked slots), enchants, unique-equipped, two-hand vs dual wield, set bonuses, hit caps;
      coordinate ascent with restarts; talents, gear and rotation alternated until stable
- [ ] **O3 In the app (after M5.65):** the Optimizer, named so in the app (user decision), a flow (what to search, constraints, a search budget, progress
      and cancel, the top results with their TPS and DPS and one-tap apply) at 390 and 1280 px
- [ ] **O4 Defaults from the optimizer:** every spec's talents, gear and rotation, confirmed on a
      fresh seed, tanks after M5.6's threat fixes

## M6: Multi-target 💤

The engine fights one target today. The design is
[encounter.md §4](mechanics/encounter.md#4-targets-and-position): extra targets are identical
copies of the boss. It comes after the tank specs (user decision, 2026-09-23).
- **Engine and config:**
  - `extraTargets` (0–4) and `extraTargetUptimePct` in the config contract (a
    [known gap](#known-gaps-and-follow-ups))
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
  ([known gaps](#known-gaps-and-follow-ups)).
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
robustness grid in the class doc), and its low findings in the known gaps are worked through.

## Known gaps and follow-ups

Found while building. Each should go to the owning doc or `open-questions.md` when its
slice is worked:
- **The warrior's interim gear** (T4 review): Adaptive Combat Assistant's use (a 450 absorb every
  90 s, 90–110 Nature damage when it breaks) isn't simulated, about +1.7 TPS (0.15%) and −5 damage
  taken a second (T4R-3); the greedy EHP search never revisits a swap, so Dal'Rend's Sacred Charge
  could return for +1.3 TPS at 90.5% EHP (T4R-2, waived: it keeps an EHP margin, and O4 replaces
  the set); gear cards show "+20 Expertise" with no percentage and no D12 flag, though the results'
  assumptions list it (T4R-8).
- **The pet's ranged hit and crit share has no test** (Demonology verification DV3-1): every
  default setup has no ranged hit or crit bonus, so a test with a ranged plan's bonuses would pin it.
- **Pre-push check lows** (PV-1..PV-3, tank quick-fix log): README's "report" → "reports"; the release
  stamp's second line opens on its separator at 390 px; a test that every `INTERIM_GEAR` id is
  wearable by its class.
- **A DPS spec's "Setup changed" badge wraps to two lines** in the phone bar at 360 px (phone
  bar verification VF7, pre-existing). The bar stays 65 px and nothing overlaps.
- **The Protection paladin's threat review lows** (T2; the review in `.cache/probes/tank-review-paladin`),
  each under 2% of TPS, kept as they are until a guild test or the optimizer settles them:
  - **P9:** Holy Shield's 20% more threat multiplies Righteous Fury's (×2.28, not ×2.1) and its
    damage never misses: both [?] lean high, about −1.9% and −3.4% the other way (guild test T6,
    paladin.md OQ 16).
  - **P10:** Consecration's ticks miss at the spell rate (14% against a boss); never missing would be
    +1.8% (guild test T7, OQ 18).
  - **P11:** the talent variants: T2's fix round compared about 45 builds within the survival floor
    (paladin.md "The interim talents"), Sanctified Judgement, Vindication, Benediction and Holy
    Conduit among them, but not Improved Seals, which needs five Holy points first; the optimizer
    (O1) searches them all.
  - **P12:** mana-gain threat (Shield Specialization, Improved Seal of Fury, the potion) skips the
    Threat gloves' 1.02 (sim.ts's mana threat); about 0.1%.
  - **A6:** Undead's Touch of the Grave (5% of maximum health as Shadow damage a proc, [?]) isn't
    simulated for any Undead spec, the paladin, rogue, mage, warlock and priest alike: about +1.7%
    of a Protection paladin's TPS as Undead; the default race is Human.
  - **A7:** Eye for an Eye (Holy damage × Righteous Fury [?]) isn't simulated; no default build
    takes it.
  - **A10 (survival only):** Seal of Fury's absorb isn't taken off the hit it absorbs (~20 damage,
    about −5 damage taken a second), Force of Will's 51-damage cut (~5% [?]) isn't simulated, and
    Templar's Bulwark and Divine Protection aren't used.
  - **A11:** mana-gain threat doesn't take the global multiplier [?] (+0.1%).
- **Interim Protection paladin gear** (T2; T2R-2's fix): the Lamellar PvP pieces are Alliance's with
  no Horde twin, so a Horde paladin wears the Horde picks measured for those slots (the Premier
  Scaled pieces, Champion's Vindication, and Plate of the Shaman King), 794.0 TPS against Alliance's
  823.6 (−3.6%, all of it the gear), both within the floor (91.9% and 90.4% of v1's). Premier Scaled Gauntlets would give Horde
  813.0, but the slot lists can't hand one faction a different glove while B76 holds; the Optimizer
  (O2) takes it. The
  threat set leaves the boss 4.4% crit chance (defense 330, v1's 433) and about a third more damage
  taken than v1's preset (905 a second against 681 in C3's setup), within the user's effective-health
  floor. The optimizer (O2) replaces the set; D30's survival constraint for it is the class doc's
  floor, and its crit-immune switch the crit.
- **Caster food and oil across the caster presets** (T2 review T2R-6, pre-existing, low): Nightfin
  Soup and Brilliant Wizard Oil are in Elemental's Standard raid and the mages' Max consumables, and
  Nightfin Soup and Wizard Oil in the Protection paladin's Standard raid, but in no warlock, Shadow
  Priest or Balance preset ([buffs §6.3](mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset)).
  Each is a Buffs switch those specs can turn on; aligning the presets waits for the consumables' own
  review (or the optimizer's), since it moves every caster golden.
- **Hammer of the Righteous's extra targets** (its effect 1, 120 to 3 chain targets, and the other 3
  targets' weapon damage) wait for M6, as does Consecration's 12 to every enemy.
- **Crit from auras and the paladin (GR9, not a bug):** against a +3 boss the first 1.8% of crit from
  auras is suppressed (combat-tables §4.4), and v1's Protection paladin had none, so its first +2%
  crit from gear or buffs gave +0.2%. The interim build's Conviction (+5%) is past it.
- **A tank's phone bar grows 16 px** (65 to 81) while the "Setup changed" or "…%" badge row
  shows (details review DR9, pre-existing). It pushes nothing out of view; the badge could sit
  on the TPS row instead.
- **Encounter settings the contract lacks:** `biome`, `extraTargetUptimePct` and
  `bossExtraDtps` ([encounter.md](mechanics/encounter.md#encounter-settings)).
- **Engine choices where the docs are silent (made in M1):**
  - Incoming damage for DPS players arrives as one hit every 2 s.
  - The boss first swings at t = 0.
  - Elemental Sharpening Stones stack: +2% crit to all melee attacks per stone [?]
    ([buffs §3.6](mechanics/buffs-debuffs-consumables.md#36-weapon-enhancements-temporary)).
- **Data gaps:**
  - Forever shields have no block value in the client; a Classic Era fallback shield's block
    value counts, flagged (`classicShieldBlockValue`).
  - Base health (warrior 1,689, paladin 1,381, druid 1,483) and base parry and block (5%) are
    D24 placeholders; warrior base dodge is 0 [C]. OQ-5 still needs a TPS estimate for the
    parry and block placeholders.
- **The buffs doc says Hyjal flasks are "added automatically"** but not which flask.
- **Bundle size:** 1.78 MB (300 KB gzipped) after M1.5c, mostly item data. Consider
  lazy-loading talents per class, and slimming item fields the app doesn't read.
- **Fury's `btOverExecuteAp` default is a fixed 2220** (W11 at Execute cost 15). Rotation
  options have one default per spec, not per build, so an Improved Execute build has to set
  2434 itself. A per-build default needs an API in `sim/index.ts` and the Rotation UI.
- **Cleave isn't built yet,** so W21's Cleave costs (Improved Cleave, Raging Blows) are
  untested.
- **Subtlety rogue (R1, first pass under D27):** Preparation isn't simulated (one more
  Premeditation in a fight of 2 min or more), there's no Stealth opener (Ambush or Premeditation
  before the pull), and with Backstab chosen as the builder from the front or without a main-hand
  dagger, the Rotation tab doesn't say that Hemorrhage builds instead
  ([rogue.md §5.3, §6.3](classes/rogue.md#63-subtlety-shipped)).
- ~~Snap can't capture a finished run~~: `--click Simulate` now waits for the result, and
  `--click "Show results and details"` opens the phone's results sheet.
- **Arms tuning findings:** re-measured and adopted in M2.5a. The Arms defaults are now the best
  rotation found ([warrior.md §5.3](classes/warrior.md#tuning-the-defaults-m25a)): +37.0 DPS
  (+6.1%, 610.3 → 647.3) over the old ones. Of the old findings, Rend's 3 s refresh is adopted;
  Heroic Strike from 55, the Whirlwind dance and Spearing Strike from 40 lost to better changes.
  Recklessness and the Mighty Rage Potion follow the execute phase, so the defaults hold at every
  fight length and execute phase measured, but one: **still open,** in a 30 s fight with no
  execute phase the old defaults are 2.4% ahead, from their Heroic Strike. Without a phase,
  Heroic Strike from 90 beats off at every length (+0.1% to +2.2%); taking it needs a switch's
  default to follow the Fight tab's execute phase. 30 s fights with a 5–8% phase trail them by
  0.6–1.6% too, from Mortal Strike in a phase of one or two GCDs (M2.5a's V1).
- **Fury tuning, small losses and a lead left open** (M2.5b, warrior.md §5.2). Heroic Strike's
  cancel costs 0.1–0.4% in 30–60 s fights without an execute phase, and Whirlwind at 0.5 s and
  Recklessness's 16 s clock under 0.1% in 30 s fights with a 10–20% phase; the whole package
  still wins by 5.5–9.6% there. Pooling rage for the phase (no Heroic Strike in the 20 s before it)
  measured +0.11% in the default setup; it needs a setting of its own and short-fight checks, so
  it's left for later.
- **The Rotation tab's section headings wrap at 390** beside "Advanced · N changed" when several
  thresholds are changed; readable, nothing clipped (FU12 in
  [Fury's review](reviews/2026-09-23-fury-rotation.md)).
- **Fury's Recklessness clock at 17 s** beat 16 s without an execute phase on one seed (+0.09% at
  180 s, +0.38% at 30 s); it needs D23's full process before it's adopted.
- **Arms in Berserker Stance doesn't wait for Recklessness before its potion;** the wait is
  unmeasured for it (warrior.md §6.2, FL4).
- **Gnome Eureka! isn't simulated** (warrior Q18); the result says so.
- **Retribution against Undead or Demons in long fights:** the re-tuned defaults trail the first
  round's by 0.14–0.63% at 180 s with a 20% phase and at 300 s with 10–20%, where Exorcism from 40%
  was ahead; 40% loses everywhere else, and a reserve tied to the execute phase lost too
  ([paladin.md](classes/paladin.md#tuning-the-defaults-c2)). A threshold that follows the fight's
  length needs D23's full process.
- **The paladin's mana plan** (`paladinManaPlan`) has no test pinning how mp5 and Reverence
  feed the plan; the engine side is tested (CV3 in
  [the paladin foundation's review](reviews/2026-09-23-paladin-foundation.md)).
- **The Shadow Priest's gaps** (K4, [priest.md](classes/priest.md#9-open-questions)):
  - **The caster enchants aren't in its defaults** (Arcanum of Focus, the +30 Spell Power weapon),
    though the catalogue has them, and Brilliant Mana Oil isn't in the catalogue: the priest's
    enchants are Greater Stats and Minor Haste only (priest.md §7.4). Brilliant Wizard Oil is in the
    catalogue since T2, in no priest preset (the buffs doc's §6.3 gives it none). A few percent of DPS.
  - **Shadowfiend** waits for the pet core (H1): its mana is left out (priest.md §5).
  - **Item effects the sim doesn't model on the priest's list:** Briarwood Reed's zone-bound spell
    power and Eye of the Beast's on-use +7% spell hit (priest.md §7.5).
- **The ranged and pet core's gaps** (H1, [ranged-and-pets.md](mechanics/ranged-and-pets.md#open-questions)):
  H2 closed them (ammo and quivers in the pool and their Gear slots, the `hunter` class, the ranged
  sheet, the pets' labelled rows).
- **The hunter's first-pass gaps** (H2, [hunter.md](classes/hunter.md#11-open-questions)):
  - **No scope** in the enchant catalogue (Sniper Scope's +7 damage, Biznicks 247x128 Accurascope's
    +3% hit).
  - **Melee weaving and Summon Hawk** aren't simulated, and the pet is a cat only (no Wolf's Furious
    Howl or other families); Multi-Shot's extra targets wait for M6.
  - **The Survival tree leans to melee in Forever** (Mongoose Bite, Lacerate, Predator's Edge,
    Strider Kick): the sim's Survival hunter shoots, with only its ranged talents. The result's
    `hunterNoMelee` note names only Raptor Strike, not these (HN6; the doc and this list say so).
  - **The Rotation tab's fixed rows don't follow the talents:** Trueshot Aura reads "With the
    talent" and Pet "Cat, or none with Lone Wolf" on every build (HN3; the runs are right, only
    the rows' wording is static).
  - **Rapid Recuperation and Resourcefulness aren't simulated or named in hunter.md §4** (HN4):
    Forever's mana-while-casting talents. A permanent 50% share leaves the 180 s defaults unchanged;
    they matter in long fights.
  - **Survival's default spends 5 points in Improved Arcane Shot** with Arcane Shot off (HN5):
    Improved Stings 3, Rapid Killing 2, Improved Arcane Shot 1 sims 2.0% higher, within D27's ±5%;
    D23's tuning picks the build.
  - **"Wait for Auto Shot" isn't dimmed** while Shared cooldown is "Neither" (HN8), and **Battle
    Shout stays on, unmarked, for a Lone Wolf hunter** with no pet to reach (HN10): both do nothing
    then, and cost nothing; marking Battle Shout needs the talents in `buffUnusedReason`.
  - **The ranged sheet shows no spell crit** (HN12), which Serpent Sting's ticks use [?]
    (hunter.md OQ-H1).
  - **Blackhand's Breadth's use and Dwarven Hand Cannon's chance on hit** aren't simulated (HN13,
    about 0.6% of DPS); both are flagged in the assumptions, as other items' effects are.
  - **The pet's inherited attack power counts Hunter's Mark** (H3's second verification, DV2-2),
    which in game is on the boss and may not reach the sheet the scaling aura reads: about 0.2% of
    Beast Mastery's and Survival's damage (hunter.md §6).
  - **Battle Shout reaches the cat** (DV2-7), Classic Era's rule, though Forever testers report pets
    can't receive external buffs: 4.4% of Beast Mastery's damage (hunter.md §6, the core's OQ-8).
- **The Demonology warlock's first-pass gaps** (H3, [warlock.md §11.7](classes/warlock.md#117-open-questions);
  [its review](reviews/2026-09-24-demonology.md)):
  - **The demon's spells take your Shadow Vulnerability** (DM2), whose aura 270 is damage taken from
    you alone: with the Succubus out, Lash of Pain gets +16% (Improved Shadow Bolt 4/5) for about a
    quarter of the fight, about +0.4 DPS (under 0.1%); the default Imp's Firebolt is Fire and takes
    none of it. It needs an aura flag for "from the caster only" that pet damage skips, with its test
    (DM12's last).
  - **"Voidwalker" touches its button's borders at 390 px** in the Demonic Sacrifice choice (DM9,
    pre-existing, Destruction too): wrap the four choices 2 × 2 at phone width, or pad the button.
  - **The default Imp build rests on Q19** [?] (DV2, D30): it's the sim's best found build, 6% ahead
    of the Succubus only through Improved Imp's hidden effect read as Firebolt's cast time. The
    optimizer (O4) confirms it on a fresh seed, and the guild's Firebolt test settles Q19. Demonic Pact
    leaves one point free in its tree, which went from Improved Sayaad to Improved Shadow Bolt 4/5
    (DV2-4, +0.4%); Improved Sayaad's other 2 points still do nothing with the Imp, for O4's talent
    search.
- **The caster core's gaps** (K1, [spells.md](mechanics/spells.md#open-questions)):
  - **The paladin doesn't get Curse of the Elements** though the buffs doc's presets list it for
    them (§6.2): K1 left every shipped result unchanged, as its brief required. It's +10% on every
    Holy hit, so a few percent of Retribution's DPS where a raid has a second warlock; the entry
    is ready (`curseOfTheElements`), and giving it to the paladin is one line and a golden update.
  - **Nightfall's Spell Vulnerability isn't a Buffs entry:** its proc rate is server-side, and a
    static entry needs an uptime (spells.md OQ-S10).
  - **The mana and spell damage entries go to classes, not specs:** the caster core's own entries
    and the melee's go by spec (`forSpecs`, `SpecMeta.caster`), and Arcane Brilliance, Blessing
    of Wisdom, the mana potions and the spell damage elixirs by class (`forClasses`). K6 gave them
    to every caster spec too (`forCasterSpecs`), so the Balance druid has them and its Feral specs
    don't ([druid §11.6](classes/druid.md#116-defaults)).
  - **The Enhancement shaman is on the core** since K5: its Lightning Bolt is hasted and its
    Nature-, Frost- and Fire-only spell damage lines count; its default result and golden didn't
    move ([shaman.md](classes/shaman.md#enhancement-on-the-core)).
- **The Elemental shaman's first-pass gaps** (K5, [shaman.md](classes/shaman.md#elemental-open-questions)):
  - **Caster enchants** (Spell Power on the weapon, Arcanum of Focus) are in the catalogue but not
    its defaults, and Zandalar Signet of Mojo waits on Zandalar: about 50 spell damage, roughly +5%
    for an Elemental shaman; the mages have the same gap ([mage.md](classes/mage.md)) (E9). Nightfin
    Soup and Brilliant Wizard Oil are in its Standard raid since T2.
  - **Eye of the Beast's use** (+7% spell hit for 20 s) needs a spell-hit aura mod (E7).
  - **Alliance gear**: the pre-raid list's honor mail and weapons are Horde's, and the Alliance's
    honor chain has no spell power, so a Dwarf is 15% behind (E8).
- **A run on one spec shows its progress over another spec's result:** start a Fury run, switch to
  Arms, and Arms's result dims with Fury's "Simulating…" (CV2 in
  [the cat's review](reviews/2026-09-23-feral-cat.md)). Show progress only for the run's own spec.
- **A paladin with no main hand:** its judgements and Hammer of Wrath show 0.0% crit, since the
  special-attack table is built only for a held weapon (RV6 in
  [Retribution's review](reviews/2026-09-23-retribution.md)).
- **The load warning for a buff nobody provides** says "needs a paladin in the raid" to a
  paladin, where the Buffs tab says "another" (RM3).
- **Switching a tank's priority keeps a value you set,** so Max TPS can silently keep a duty you
  turned on under Tank duties first; only its "Changed" mark shows it (PU11 in
  [Warrior Protection's review](reviews/2026-09-23-warrior-protection.md)).
- **Without a main hand, notes about swings that never happen still show** (`foreverWhiteRage`,
  the off hand's notes for Fury; PW6).
- **Two flat-damage-range fields:** `flatDamageRange` (0 to a range, Ferocious Bite) and
  Protection's `flatSpread` (± around the client's base) do similar jobs; merging them waits for a
  slice that can re-snapshot both.
- **The spec switcher's separators** sit inside each labelled class group from the second class
  on, so a screen reader reads them as part of that group (CF1).
- **The bear's review lows** ([its log](reviews/2026-09-24-feral-bear.md)): per-class wording of
  the white-threat note ("stance or form"); Max TPS results naming "your" roar when it's off; the
  bear's swings table listing 0% parry and block; Enrage's damage-taken figure (0.16% vs 0.14%);
  setup-store tests for a known but hidden spec.
- **The bear threat review's lows** (M5.6, `.cache/probes/tank-review-bear/report.md`; the guild's
  tests decide them, so the model keeps its Forever reading until then):
  - **BR7, rage from hits divides by the bear's maximum health.** Rage from hits taken is 46% of the
    bear's rage, and Forever's rule (`10 × damage before mitigation ÷ max health`,
    [rage.md](mechanics/rage.md#forever-)) divides by health that Dire Bear Form's +1,240 and Heart
    of the Wild raise, so a bear gets less rage a hit than a warrior of the same gear; the evidence
    for bears is 33 low-level hits [?]. ±20% rage moves TPS about ±10%. Guild test G3: 30+ hits at
    two maximum-health levels, fit rage = k × damage ÷ max health.
  - **BR8, the bear's white rage uses the one-handed rate** (8.65 a landed swing; the two-handed
    11.25 would be +0.8% to +2.4% TPS) [?] ([rage.md](mechanics/rage.md#bear-druid-rage)). Guild
    test G4: 30+ auto attacks in Dire Bear Form.
  - **BR9, spell 414647** (20% weapon damage, server-triggered) may be Lacerate's hit; the model
    follows the tooltip's 10% a stack already there (druid.md Q16). Guild test G5.
- **The shaman's review lows** ([its log](reviews/2026-09-24-enhancement-shaman.md)): Rockbiter
  with Windfury Totem (+3.6%, untried by the first pass); the imbue help's +653 AP against 783.6
  with Elemental Weapons; derived Dwarf and Skyborne base rows; the inferred 16361 link;
  source-tag drift when the client data is regenerated from the cache.
- **The Elemental's review lows** ([its log](reviews/2026-09-24-elemental-shaman.md)): Mana Tide and
  Mana Spring share the water totem slot; Totemic Focus should make Mana Tide cost 45; two notes
  repeat that casting speed doesn't shorten the GCD; a stale comment range; Totem of the Storm's
  card shows no stats.
- **Caster enchants in the casters' defaults:** the catalogue has weapon Spell Power, Arcanum of
  Focus, Nightfin Soup and the wizard oils (T2), but only the warlock's and the Protection paladin's
  enchant defaults use the enchants, and only the Elemental shaman's and the Protection paladin's
  Standard raids the food and oil (buffs doc §6.3, §6.4). The mages, the priest and the Elemental
  shaman lack the enchants, roughly +5% each; the optimizer (O2) will pick them.
- **A flaky e2e test:** `tank-results.spec.ts`'s "the results sheet has damage taken and the boss's
  table, inside the screen" (phone) fails about 1 run in 15, on main as well; it passes on rerun.
  Find the timing it depends on.
- **Bearweaving:** rage from damage taken divides by the maximum health of the form the fight
  started in, which only holds while no rotation shifts into bear to take hits. A cat that did
  would gain about 47% too much; divide by the current form's health first
  ([druid.md §2.8](classes/druid.md#28-shapeshifting-furor-wolfshead-helm-powershifting-mana),
  BV3 in [the druid foundation's review](reviews/2026-09-23-druid-foundation.md)).
- **Multi-target isn't simulated** until [M6](#m6-multi-target-). The Fight tab's Enemies
  control is hidden until then; `extraTargets` stays in the config
  ([encounter.md §4](mechanics/encounter.md)).
- **About's "Game data" rows** show the spellbook and talent builds from `warrior.json` only;
  list the build per dataset once another class's data is re-scraped.
- **Items:** 18320 Demonheart Spaulders may not be obtainable; PvP rank requirements show as
  numbers (the rank title depends on faction); whether a bear-form armor multiplier applies
  to stat-50 bonus armor is open (M4). Fallback shields carry `classicShieldBlockValue`,
  and Forever shields have no innate block value in the client (M3).
- **Pushes** happen at every stable state (D25); the deploy and Full regression runs are watched
  to green after each.
- **Deferred from the first-release review** (FV5, FV6, FV7 in
  [its log](reviews/2026-09-23-first-release.md#final-verification-of-the-third-pass-fixes)):
  - The character sheet shows only the main hand's crit, so Weaponmaster on an off-hand axe
    doesn't show there, though the sim applies it.
  - `Field`'s help text has no id, so it isn't in any control's `aria-describedby`.
  - Bad input in a number field gives no feedback: "abc" reverts and 99999 clamps silently
    (UX15).
  - A setup's name field takes more than 60 characters and says so only at Save; a live count
    would be clearer (QC1).
  - Each arrow key press between the sticky section tabs scrolls the page up by about 360 px
    (390) or 420 px (1280), because the tabs lie inside the top scroll padding. Peeking at a tab
    without choosing it loses your place.

## Later

- Raid gear (Epic quality): widen the scraper filter
- Other classes, only if wowsims still hasn't arrived
