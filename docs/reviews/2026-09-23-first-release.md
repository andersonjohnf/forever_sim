# First release: Fury and Arms (2026-09-23)

Range: `a577ec2` (first commit, the only one pushed) .. the head this review ends at.
Reviewers:
- **Logic:** three fresh agents, each briefed to break its area, none of which wrote the
  code:
  - engine core and combat mechanics
  - warrior class, abilities and rotations
  - data pipeline, config and defaults
- **UX:** a fresh agent (see below).

Checks at review start (`f53558b`): lint ✓ · typecheck ✓ · unit ✓ (567) · e2e ✓ (23, 3
deferred to M3).

Fix slices:
- **F1a** engine and effects
- **F1b** warrior and rotations
- **F1c** config and gear integrity
- **F2** data pipeline
- **F3** Classic Era profile values

Each disposition names the slice that fixed it; the slice's commit is in "Fix commits" below.

## Logic findings

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| L1 | high | **Hand of Justice** is modelled as a flat 2% per hit with no internal cooldown. The Forever client (15600) has `ProcChance 3` scaled to 1% for non-Dwarves and a 2 s `ProcCategoryRecovery`; Classic Era has 2% with the same 2 s. HoJ is in every warrior default. | fixed, F1a |
| L2 | high | **Windfury has no 100 ms internal cooldown in `forever`**, which damage-and-timing §5.4 (the owning doc) says is modelled (10612 `ProcCategoryRecovery 100`). With 0 ms reactions, instants at the swing's millisecond re-proc it. Arms is 1.4% too high, Fury 0.5%. warrior.md §7 and Q27 and the assumption text say the opposite. | fixed, F1a |
| L3 | medium | **Weapon racials (Human sword, Orc axe, Dwarf mace)** apply per hand. The Forever tooltip reads "+2% crit with all spells and attacks … while you have a sword … equipped", and warrior.md §2.9 and §6.2 say "either hand"; character-stats.md says per hand. Default Human Fury (mace + sword) is 1.4% low. **Decision:** the tooltip wins (doctrine §2): all attacks while any matching weapon is equipped, still [?] (Q15). Fix character-stats.md. | fixed, F1b |
| L4 | medium | The Fight tab's **Enemies** setting is read nowhere: multi-target isn't simulated, and the control silently does nothing. | fixed, F1b: hide the control until multi-target lands |
| L5 | medium | **Items that fall back to Classic Era take their effect spells from Classic** even when the Forever client ships the same spell changed. 201 of 584 fallback effect spells differ, e.g. Seal of the Dawn, Mark of the Chosen (Prot default), Doombringer, Diamond Flask. | fixed, F2: resolve spells from Forever when it has them (tier 1) |
| L6 | medium | **Elemental Sharpening Stone** is limited to bladed weapons, but the client's `SpellEquippedItems` (mask 42483) allows axes, maces, polearms, swords, staves, fist weapons and daggers. Fury's mace main hand loses +2% crit in the Max preset. | fixed, F1a |
| L7 | medium | **Unique-equipped groups aren't enforced** (e.g. two Undermine trinkets, two Watcher's Signets), and a unique weapon can be equipped in both hands. `normalizeConfig` accepts them silently. | fixed, F1c |
| L8 | medium | **Set bonuses using aura 290 (all crit) or 274 (block value) are dropped silently** (e.g. The Gladiator 5-piece), and unparsed active bonuses aren't reported as unmodelled. | fixed, F2 (mapping) and F1c (reporting) |
| L9 | medium | **The spell-text renderer ignores `EffectRealPointsPerLevel`**, so rendered texts show base values (Vindication, Cat and Dire Bear Form, Demoralizing Shout). Demoralizing Shout's −196 "tooltip value" is itself an unscaled render; the level-60 tooltip is −204. | fixed, F2 (renderer, and Q22's value with the buffs doc) |
| L10 | medium | **The build-code guard only protects the 12 codes stored in the repo.** A reorder or `maxRank` change at a position no stored code uses would silently break users' share links. | fixed, F2: guard every position → (name, max rank) |
| L11 | medium | **The `classicEra` profile uses Forever buff, consumable and enchant values** (Battle Shout 139 vs 232, Blessing of Might, Mark of the Wild, Fortitude, totems, glove enchants), while the UI says Classic Era uses Classic numbers wherever they differ. | fixed, F3: per-profile values from the Era client |
| L12 | low | A **Deep Wounds refresh at the same millisecond as its tick** loses that tick. Rend has the tie-break; Deep Wounds doesn't, and Mortal Strike's 6 s cooldown hits it every time (Arms −0.2%). | fixed, F1a |
| L13 | low | **Magic procs never crit**, while combat-tables §9 says landed spells roll crit at ×1.5. No doc records the skip. | fixed, F1a (follow the doc, tagged [?]) |
| L14 | low | **Negative armor is clamped at −K/2 (×2.0 damage)** without a doc, and custom boss armor reaches it. The doc's formula diverges there. | fixed, F1a (document the floor, surface it) |
| L15 | low | **Shield Specialization's block rage** comes before the damage-taken rage; rage.md says after. It matters at the rage cap for tanks. | fixed, F1a |
| L16 | low | **Sibling extra-attack branches** let one source proc twice from one root swing (`classicEra` especially). | fixed, F1a |
| L17 | low | **Reaction time is undefined**: warrior.md and damage-and-timing point at each other, and the engine uses 0 ms. | fixed, F1a (document 0 ms, surface it) |
| L18 | low | **Engine test tautologies** (W22, T15/T16, WE-2, WE-4/5) and gaps: damage-taken rage models, Classic Era dodge/parry rage, boss parry haste, R13, R14, the Windfury internal cooldown. | fixed, F1a |
| L19 | low | `recomputeStats` allocates a few objects per call (about 17 per fight), against architecture.md's "no allocation per event". | fixed, F1a if cheap, otherwise waive with the measured cost |
| L20 | low | **Arms at 0% execute** drinks the Mighty Rage Potion 5 s before the Recklessness swap that caps rage at 25, losing about 12 rage. | fixed, F1b |
| L21 | low | The default **Rend refresh at 1.5 s** always drops the 7th tick (6.21 ticks per Rend). The doc doesn't say so. | fixed, F1b (document it, add it to the tuning notes) |
| L22 | low | **GCD-safe** counts a dance ability as "coming up" even when its dance can't pay at the current rage, which blocks Hamstring behind the Whirlwind dance. | fixed, F1b |
| L23 | low | Two [?] choices aren't surfaced: **Execute converts rage tenths** (Q28) and **Improved Bloodrage 1/2 rounding** (Q29). | fixed, F1b |
| L24 | low | **With no weapon**, non-weapon specials (Bloodthirst, Execute, Rend) still fire and spend rage. | fixed, F1b: refuse melee abilities without a main-hand weapon |
| L25 | low | warrior.md §5.2 row 11 lists the wrong unqueue ids, and row 14 (Sunder Armor) isn't marked "not simulated". | fixed, F1b |
| L26 | low | **Warrior test gaps:** W12, the §7 Execute example, and engine tests for Arms rows 14 and 16 and Fury rows 9 (`reserve`) and 12 (`onlyWhenFlurryDown`). | fixed, F1b |
| L27 | low | **Elemental Sharpening Stone stacking**: milestones says it doesn't stack, and the code adds +2% per stone. | fixed, F1a (decide from client data, tag [?], align) |
| L28 | low | `normalizeConfig` keeps the **first** member of an exclusive group, but the buffs doc says the largest. Blessings can't be limited per paladin, because composition is class presence only. | first part: fixed, F1c. Second: **waived**, because composition switches are presence by design (ux.md) and a typical 40-player raid has enough paladins for every blessing. |
| L29 | low | **Share-link decoding has no size cap**: an 87 KB hash inflates to 64 MB, and a crash repeats on reload because the hash is cleared after decoding. | fixed, F1c |
| L30 | low | **Alliance defaults wear Horde PvP twins** (rank ties broken by item id). | fixed, F1c: break ties by the race's faction |
| L31 | low | **Set counting trusts the item's own `setId`** (16526 carries Classic set 361, and Forever's 361 lists other items). | fixed, F1c |
| L32 | low | **Toughness** multiplies Classic-fallback armor that has bonus armor baked in, but not Forever's stat-50 bonus armor. The choice is untagged. | fixed, F1a (document and tag) |
| L33 | low | **Execute's rage factor** is in the client (`EffectChainAmplitude`, 0.3 … 1.5 by rank) but dropped from `spells.json`, and the docs call it server-side. | fixed, F2 |
| L34 | low | **Trainer rows for spells with no client data are dropped silently** (Tiger's Fury ranks, Avenger's Shield). They may be hotfix-only. | fixed, F2 (list them as an open question) |
| L35 | low | **Generator output depends on the machine's locale** (`localeCompare`) and on the cached "latest" build (build dates). | fixed, F2 |
| L36 | low | **The talent and race storage guards fail open** when `git show` fails. | fixed, F2: fail closed |
| L37 | low | **Talent texts merge a client line break into the sentence** (Feral Charge). | fixed, F2 |
| L38 | low | **Data test gaps:** fallback items' spells vs Forever's, the aura → stat coverage, unique groups, set membership, catalogue values vs client data, stone weapon masks, per-level rendering, the full build-code order, a schema test, and generator locale independence. | fixed, F2 and F1c |

Checked and found sound, across the three reviews:
- the attack tables in both profiles, and the boss → player table
- the damage order, armor, normalization, off hand, bleeds, haste and swing rules
- rage and threat rules, the stats pipeline, D12, the queue and RNG streams, per-fight resets
- an invariant fuzz, the driver and D18, and the CI statistics
- every warrior ability and talent number against the client data, every Fury and Arms
  rotation row, the cooldown logic, Overpower and stance dances, the worked examples W1–W11,
  W13 and W16–W25, and a 600-config fuzz
- generator determinism (0 requests, byte-identical data)
- no world buffs, the SoD guard
- raid buff, debuff, consumable and enchant values against the Forever client
- the presets and defaults
- `normalizeConfig` under hostile input

## Fix commits

All on `main`, cherry-picked in this order. Conflicts were resolved by combining both sides.
Golden changes are explained in `src/sim/engine/engine.test.ts`'s history comment.

| Slice | Commit | Findings |
| --- | --- | --- |
| F1c config and gear integrity | `e7a9c88` | L7, L8 (reporting), L28, L29, L30, L31, L38 (part) |
| F1b warrior and rotations | `f8cec97` | L3, L4, L20–L26, U21 |
| F3 Classic Era values | `b324763` | L11 |
| F1a engine and effects | `377bc9d` | L1, L2, L6, L12–L19, L27, L32 |
| UX-B1 Rotation tab | `fb43946` | U13, U14, U15, U17 (Rotation), U23 (Rotation) |
| UX-A results and run states | `161fbda`, `56a45d4` | U1, U2 (copy), U3, U7 (results), U10, U11, U12, U20 (results), U23 (results), U25, U30 |
| UX-C app shell | `91ae0e0` | U4, U7 (tokens), U8, U17 (shell), U18, U22, U26, U28, U29 (h1), U32 |
| F2 data pipeline | `1333834` | L5, L8 (mapping), L9, L10, L33–L38 |
| UX-B2 setup screens | `e287574` | U2 (tiles), U5, U6, U9, U16, U17 (setup), U19, U20 (gear), U23 (setup), U24, U27, U29 (steppers) |
| Reconciliation | `75f8e9e` | two bugs the merged slices exposed: tabs re-selected after Undo, and faded gear rows that couldn't be tapped |
| Cleanup | `537e040` | U33, U34; L9's Demoralizing Shout value in the engine; the Classic Era Battle Shout and UI summaries (L11 follow-ups); open-question renumbering |

Golden runs, before the review → after all fixes: Fury 684.2 → 675.2 DPS, Arms 630.7 → 610.7 DPS,
Protection 219.1 → 217.0 TPS. The changes come from matching the Forever client:
- Hand of Justice procs at 1%, with a 2 s internal cooldown
- Windfury has its 100 ms internal cooldown
- Blackhand's Breadth is +1% crit
- the weapon racials apply to every attack (for Fury, this partly offsets the others)

## UX findings

Reviewer: a fresh agent, working at `be7bb9c` with Playwright probes. It checked widths 320, 360, 390, 768, 1024
and 1280, both themes, both specs, and the default, empty, running, stale and error states.
No probe logged a console error, page error or failed request.

UX fix slices:
- **UX-A** results and run states
- **UX-B1** Rotation tab
- **UX-B2** setup screens: Character, Talents, Gear, Fight, Buffs
- **UX-C** app shell, persistence, contrast and focus

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| U1 | high | **On phones a failed run is invisible.** With no earlier result, the bar stays "DPS —" and "Show results" is disabled, so the error can't be reached. With an earlier result, the error is only inside the sheet. | fixed, UX-A |
| U2 | high | **The two Skyborne races can be picked but always fail** at Simulate. The message ends "Try again, or reset…", which can never work. | fixed, UX-B2: mark the tiles as not yet simulatable; drop the generic retry ending from validation errors |
| U3 | high | **Desktop: the sticky results panel (about 1,200 px) is taller than the viewport**, so its lower half is only seen at the bottom of the page. | fixed, UX-A |
| U4 | high | **Undo after a shared link for your other spec** (or just switching spec) overwrites your saved setup for that spec. | fixed, UX-C |
| U5 | high | **Keyboard users can't remove talent points** (right-click only). | fixed, UX-B2 |
| U6 | high | **Some Fight controls have no accessible name:** the length slider (and its value text), and the Creature type and Zone selects. | fixed, UX-B2 |
| U7 | high | **Contrast fails AA.** The class-colour "Warrior" label is 2.53:1; the talent rank badges (amber/emerald-600) and the positive change colour fall short; the stale "Setup changed" badge is 2.37:1; the off-state switch track is 1.26–1.34:1 (controls need 3:1). | fixed, UX-C (tokens and shared components; call sites with their slices) |
| U8 | high | **The About sheet and the page meta description** promise druids, paladins and TPS, which don't ship. | fixed, UX-C |
| U9 | medium | **The "Classic stats" explanation can't be reached on a phone:** the badge sits inside the slot button, and the slot's aria-label hides its stats. | fixed, UX-B2 |
| U10 | medium | **A re-run shows no progress:** the old number stays at full strength, with no progress bar or live status. | fixed, UX-A |
| U11 | medium | **Stale results dim only the headline.** After a spec switch, the other spec's rows stay visible. | fixed, UX-A |
| U12 | medium | **Enrage shows 0.0% uptime by default** ("Damage you take" is 0), with no explanation. | fixed, UX-A: explain it in the row and the field's help; the default stays 0 per warrior.md §2.6 and Q8 |
| U13 | medium | **Three settings don't follow the switch they depend on** ("Save the last Death Wish", "Racial and trinkets with Death Wish", "Hamstring only without Flurry"). | fixed, UX-B1 |
| U14 | medium | **The Rotation tab doesn't mark defaults**, and "Defaults" has no Undo. | fixed, UX-B1 |
| U15 | medium | **The Rotation tab is very long** (Fury 38 settings, Arms 37), with thresholds beside the core switches. | fixed, UX-B1: thresholds behind an Advanced disclosure per group |
| U16 | medium | **The Gear tab scrolls sideways at 320 px** (enchant text sets the column width). | fixed, UX-B2 |
| U17 | medium | **Touch targets under 44 px:** selects (32), toast Undo (24), section tabs (40), menu items (38–40), picker chips (36), clear search (32), slider thumb (12), Classic stats badge (20), and setting rows outside Buffs. | fixed, UX-B2 (setup screens) and UX-C (tabs, menus, toasts) |
| U18 | medium | **A share link pasted into an open tab does nothing** (the hash is read only on load). | fixed, UX-C |
| U19 | medium | **Paste-a-build-code errors are developer messages.** | fixed, UX-B2 |
| U20 | medium | **Assumptions don't link to their docs**, the list is long (22/23), and gear with unsimulated effects isn't flagged on its row. | fixed, UX-A (links, order); UX-B2 (gear-row badge) |
| U21 | medium | **The Enemies control promises an effect that isn't simulated.** | fixed, F1b (L4) |
| U22 | medium | **Focus isn't moved into or back from sheets** (results sheet, About). | fixed, UX-C |
| U23 | low | **Copy details:** "Tap a slot" on desktop; Hammer of Wrath in warrior help; a fixed "level 63" header; "fights of 179 s"; the unlabelled run time; the "Defaults" label; the Juju switch showing on while unused. | fixed, UX-B1/UX-B2/UX-A by screen |
| U24 | low | **Race picker:** not grouped by faction as ux.md says; Skyborne names cut off at 390; no arrow-key movement. | fixed, UX-B2 |
| U25 | low | **"Holy Strength (main hand)" wraps** because "Casts per fight" makes a wide column. | fixed, UX-A |
| U26 | low | **The phone tab-bar fade doesn't track scroll position.** | fixed, UX-C |
| U27 | low | **The item picker has no sort control** (ux.md), and Buffs preset descriptions are hover-only `title` text. | fixed, UX-B2 |
| U28 | low | **Undo toasts last only 4 s** and cover the phone header. | fixed, UX-C |
| U29 | low | **Steppers are named only "Decrease/Increase"**, and the page has no `<h1>`. | fixed, UX-B2 (steppers), UX-C (h1) |
| U30 | low | **The no-gear result gives no next step.** | fixed, UX-A |
| U31 | low | **First load: 1.8 MB JS (311 kB gzipped).** | **waived** for the first release. 311 kB gzipped loads in about a second on a phone connection, and the sim then runs offline in workers. Lazy-loading per class stays in Known gaps. |
| U32 | low | **Share may fail on iOS Safari** (a clipboard write after an await); not verified. | fixed, UX-C: `ClipboardItem` with a promise, or `navigator.share` on phones |
| U33 | medium | **The app-wide focus ring** (shadcn's `ring-ring/50`) is 1.54:1 on the light page and 1.87:1 on the dark one, below the 3:1 that WCAG 1.4.11 asks of a focus indicator. Found by the UX-C fixer. | fixed, cleanup slice: a token-level `--ring` that clears 3:1 at the ring's opacity in both themes |
| U34 | medium | **At 390 px, keyboard focus could land on switches hidden behind the fixed Simulate bar** (WCAG 2.2 2.4.11, focus not obscured). Found by the cleanup fixer. | fixed, cleanup: scroll padding for the sticky header and bar, with an e2e test |

## Second pass: review of the fixes

Two fresh reviewers checked `f53558b..9c399db` (logic) and `be7bb9c..9c399db` (UX).

**Confirmed:**
- every merge resolution kept both sides
- determinism holds
- each golden change is explained and reproduced
- the data regenerates byte-identically with 0 requests
- the open-question counts are right
- U1–U33 are fixed, apart from the items below

Fix slices:
- **R-logic** engine and data
- **R-UX-a** app shell, results, gear picker and focus
- **R-UX-b** setup screens

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| RL1 | high | **Ironfoe (the default Fury main hand) still runs Classic Era's 0.8 PPM main-hand-only proc.** The Forever client rewrote it to an equip aura (1301046): `ProcChance` 6 with "×$s2 against Orcs" (`$s2` = 2), a 100 ms internal cooldown, and white and yellow melee from either hand, the same model as Hand of Justice (L1). About +2.5% for default Fury. | fixed, R-logic |
| RL2 | low | **F2's fallback rule keeps Mark of Tyranny's +1% dodge** although Forever re-pointed that ItemEffect (99949) to a Use spell. | fixed, R-logic: a re-pointed ItemEffect id counts as replaced |
| RL3 | low | **`classicEra` uses Forever's racials,** and the profile help doesn't say so. It is also wrong about abilities since the warrior's own Battle Shout became per profile. | fixed, R-logic (architecture.md) and R-UX-b (help copy): racials stay Forever's, stated plainly |
| RL4 | low | **The "keep the largest" exclusive-group rule reads Forever effects under `classicEra`** (latent; no pair differs today). | fixed, R-logic |
| RL5 | low | **All-crit (aura 290) buffs don't raise spell crit** (Recklessness, Elune's Light, Weakness Analyzer, Leader of the Pack, Mongoose in `forever`), so magic procs under-crit. | fixed, R-logic |
| RL6 | low | **Weaponmaster's axe and polearm crit (per hand) and the weapon racials (all attacks) read identical client data two ways.** | fixed, R-logic: one documented rule, or Q15/B49 extended |
| RL7 | low | **Warsong Gulch rewards aren't faction-restricted.** | fixed, R-logic |
| RL8 | low | **The rank-5 plate bracers never swap on a race change** (the twin key compares class lists). | fixed, R-UX-b |
| RL9 | low | **The catalogue test compares absolute values**, so a flipped sign passes. | fixed, R-logic |
| RL10 | low | **Stale lines in damage-and-timing:** Blackhand's Breadth is "+2%, no proc", and Ironfoe is 0.8 PPM. | fixed, R-logic |
| RU1 | high | **An Undo toast over an open sheet can't be tapped:** the tap falls through to the sheet, and the focus trap blocks the keyboard. | fixed, R-UX-a |
| RU2 | high | **The item picker doesn't move focus in (drawer), drops focus to `<body>` on Escape (dialog), and does the same after picking.** | fixed, R-UX-a |
| RU3 | high | **U34 is only half fixed:** `scroll-padding-top` clears the header but not the sticky tab bar, so Shift+Tab hides focus under it. | fixed, R-UX-a |
| RU4 | medium | **A failed run's error outlives the fix and follows you to the other spec.** | fixed, R-UX-a: key the error to its spec and config like results |
| RU5 | medium | **Dimmed dependent Rotation rows, unavailable Buffs rows and locked talent badges use `opacity-60`**, putting help text at 2.3:1. | fixed, R-UX-b: dim by colour |
| RU6 | medium | **Focus falls to `<body>` after:** the talent code dialog, Clear, Reset rotation, a stepper at its limit, the talent "−" at 0, the Rotation "Buffs" link, and Open Gear. | fixed, R-UX-a (Open Gear), R-UX-b (the rest) |
| RU7 | medium | **Targets under 44 px:** the Rotation "Buffs" link (29×16), phone Share (42), the footer link (32), and the About links (20). | fixed, R-UX-a (Share, footer, About), R-UX-b (Buffs link) |
| RU8 | medium | **Undo toasts are hard to reach by keyboard** (26–60 Tabs; Alt+T isn't shown). | fixed, R-UX-a |
| RU9 | medium | **The talent popover gives no reason when "−" is disabled**, and a right-click is silent. | fixed, R-UX-b |
| RU10 | medium | **Enchant picker:** invalid listbox semantics (axe critical), no arrow keys, unnamed popovers, and a popover rather than a sheet on phones. | fixed, R-UX-b |
| RU11 | low | **Two Fight fields' accessible names don't include their visible labels** (WCAG 2.5.3). | fixed, R-UX-b |
| RU12 | low | **Phone sheets (item picker, results) have no close button.** | fixed, R-UX-a |
| RU13 | low | **Arrow-key focus on section tabs isn't scrolled clear of the edge fade.** | fixed, R-UX-a |
| RU14 | low | **Defaults aren't marked on Buffs (Standard raid), Fight or Character.** | fixed, R-UX-b |
| RU15 | low | **Nothing on Buffs or Gear says Classic Era values are on.** | fixed, R-UX-b |
| RU16 | low | **Talent presets offer Protection builds** the app doesn't ship. | fixed, R-UX-b |
| RU17 | low | **The phone talent tree switcher is unnamed** (R-UX-b), and the desktop re-run shows "Setup changed" beside the progress for the run applying it (R-UX-a). | fixed, R-UX-b / R-UX-a |

Second-pass fix commits, cherry-picked onto `main`:

| Slice | Commit | Findings |
| --- | --- | --- |
| R-UX-a | `b6fb012` | RU1, RU2, RU3, RU4, RU6 (Open Gear), RU7 (shell), RU8, RU12, RU13, RU17 (desktop) |
| R-UX-b | `f31c69a`, `fa08bf0` | RU5, RU6, RU7 (Rotation), RU9, RU10, RU11, RU14, RU15, RU16, RU17 (phone), RL3 (copy), RL8 |
| R-logic | `2aca6bf`, plus the Ironfoe assumption follow-up | RL1–RL7, RL9, RL10 |

Golden runs after the second pass: Fury 692.7 DPS (Ironfoe's Forever proc: 3% from either hand,
[?] C37), Arms 610.7, Protection 217.0 TPS.

## Third pass: review of the second-pass fixes

Two fresh reviewers checked `d3f5e84..78afa5d`.

**Confirmed:**
- the Fury golden reproduces exactly
- Ironfoe's client values are read correctly
- RL2, RL4, RL5, RL8 and RL9 are sound
- the data regenerates byte-identically
- RU1–RU17 are fixed, and axe finds no violations on any tab

Fix slices:
- **T-logic**
- **T-UX**

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| TL1 | medium | **Ironfoe from either hand** goes against the one client signal that bears on hands. `ProcTypeMask[1]` 0x20 appears only on 8 Forever-new item procs, two of whose texts say "with this weapon". Ironfoe's aura is otherwise a clone of Hand of Justice's. Tier 1 is ambiguous, so doctrine §2 falls back to Classic Era (the weapon's own hits). Worth about 2.7% of Fury DPS. | fixed, T-logic: own hand, with Forever's 3% and 100 ms internal cooldown; list all 8 spells in C37 |
| TL2 | medium | **RL6's unified rule overrides Weaponmaster's own tooltip** ("…with Axes and Polearms"). Tooltips beat derived values (doctrine §2). | fixed, T-logic: Weaponmaster per hand with no spell crit; racials stay "all attacks" |
| TL3 | low | **The rule-profile help says** "racials, talents, other abilities and gear stay Forever's", but Recklessness, Berserker Stance, Hand of Justice and Ironfoe also switch. | fixed, T-UX (copy) |
| TL4 | low | **Test gap:** the Classic Era aura-52 rows aren't asserted by aura type. | fixed, T-logic |
| TL5 | low | **Dead per-weapon crit plumbing** (`critBonus`). | fixed, T-logic (reused by TL2) |
| TL6 | low | **The Warsong Gulch name prefixes are broad** (latent; nothing in the pool). | fixed, T-logic: a test that every prefix match in the pool has a twin |
| TU1 | high | **A persistent Undo reverts everything changed since it was raised** (`replace(previous)`) and can switch spec back: data loss. | fixed, T-UX: one Undo at a time; a later setup change dismisses it |
| TU2 | medium | **Persistent keyboard toasts pile up and cover focused controls** (WCAG 2.4.11). | fixed, T-UX: one persistent toast; scroll padding for it |
| TU3 | medium | **On a phone, Enter in the paste dialog counts as keyboard use**: an "Option+T" hint and a toast that never times out. | fixed, T-UX |
| TU4 | medium | **On a phone, a stepper at its limit focuses the text input** and opens the on-screen keyboard. | fixed, T-UX |
| TU5 | low | **The enchant chip's accessible name omits its visible text** (WCAG 2.5.3). | fixed, T-UX |
| TU6 | low | **The enchant listbox's active option** is only `bg-muted` (1.09–1.18:1). | fixed, T-UX |
| TU7 | low | **The "Default: … Reset" hit area overlaps the control above by 6 px.** | fixed, T-UX |
| TU8 | low | **The fixed-fights field has no visible label**, and its numbers have no separators. | fixed, T-UX |
| TU9 | low | **The Ironfoe assumption copy doesn't parse.** | fixed, T-logic (assumption text) |
| TU10 | low | **Two "(default)" presets in one menu.** | fixed, T-UX |
| TU11 | low | **The Classic Era note can land under the sticky tabs** after a tab switch. | fixed, T-UX |
| TU12 | low | **Undo that removes the enchant sheet's item drops focus to `<body>`.** | fixed, T-UX |

Third-pass fix commits: T-logic `3951257` (TL1, TL2, TL4, TL5, TL6, TU9); T-UX `43f371f` (TU1–TU8,
TU10–TU12, TL3).

Golden runs after the third pass:
- Fury 673.8 DPS. Ironfoe procs on its own hits at 3% with a 100 ms internal cooldown; "either
  hand" is [?] C37.
- Arms 610.7 DPS.
- Protection 217.0 TPS.

Versus the start of the review, Fury 684.2 → 673.8, Arms 630.7 → 610.7, Protection 219.1 → 217.0.
Each change is explained in `src/sim/engine/engine.test.ts`.

## Final verification of the third-pass fixes

A fresh verifier checked `3951257` and `43f371f` and found nothing blocking: no wrong numbers,
data loss, crashes, accessibility blockers or regressions.

**Confirmed:**
- lint ✓ · typecheck ✓ · unit ✓ (934) · e2e ✓ (154, 3 deferred to M3)
- the Fury golden reproduces exactly (673.8 DPS, 409.0 TPS). Ironfoe from either hand would
  give 692.7 (+2.8%; 691.3 against 673.2 over 40,000 fights)
- Arms 610.7 DPS and Protection 217.0 TPS are unchanged
- Weaponmaster adds exactly +5% crit to the axe's hand only, with no spell crit, while the
  weapon racials still apply to every attack. Checked for Orc, Human and Troll under both
  rule profiles
- a waiting Undo survives everything that isn't a change (tab switches, a number field
  focused without an edit, a run, a resize) and goes on a real change. Undo on a shared link
  restores the previous spec and gear
- the toast listeners are released when a toast is replaced, dismissed or times out
- axe finds no violations on any tab at 390 and 1280 px, light and dark, with or without a
  toast up

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| FV1 | low | **The page's last control can't scroll clear of a waiting toast.** On a phone the footer's wago.tools link stays 41 of its 44 px under a toast that waits for Dismiss, because the page can't scroll further, so ux.md's "A toast never hides the focused control" isn't quite true. | fixed, `4a1cad3`: main's bottom padding grows to the toast's clearance. The new e2e test also found the same fault on desktop (60 px) and fails without the change at both widths |
| FV2 | low | **iPad with a hardware keyboard:** Enter after typing in the talent paste dialog gives a 10 s toast with no Option+T hint, because touch is detected by `(pointer: coarse)` alone. | deferred: a hardware keyboard on a touch screen is rare, and the toast's Undo still works for 10 s by touch and by Option+T. The fix is per-event input modality, a small design change of its own. Listed in the milestones' known gaps |
| FV3 | low | **Integer fields ignore locale separators:** "5.000" in Number of fights gives 100 (read as 5, raised to the minimum), and "5 000" is ignored. Predates these commits. | fixed with PV2, `3a898bb`: whole-number fields read "." or "," between groups of three digits, and spaces, as thousands separators ("deferred" at first; PV2 showed decimal fields had the worse form of it) |
| FV4 | low | **The Ironfoe assumption doesn't say that "its own hits" is itself unconfirmed,** a reading worth about 2.7% of Fury DPS. | fixed, `d8d76c3`: the text says both the chance and the hand reading are unmeasured ([?] C37) |
| FV5 | low | **The character sheet shows only the main hand's crit,** so Weaponmaster's +5% on an off-hand axe doesn't appear there. | deferred, documented: the sim applies it. A per-hand crit line belongs with the sheet's off-hand stats. Listed in the known gaps |
| FV6 | low | **The help under "Number of fights" isn't announced with the field** (not in `aria-describedby`). Seed and the other fields have the same older pattern. | deferred: `Field` never gives its help an id, so this is an app-wide pattern rather than one field, and it predates the review. The help is visible and is read in order right after the control. Listed in the known gaps |
| FV7 | low | **Arrowing between the section tabs scrolls the page up** when scrolled down, because the sticky tabs lie inside the page's top scroll padding. Predates these commits. PV9 corrected the description: each press scrolls about 360 px (390) or 420 px (1280), so arrowing to a tab and back leaves you 724 or 844 px from where you were. | deferred: choosing a tab starts its section at its top anyway, so only a peek without choosing loses your place. A fix has to keep focus clear of the sticky header for every other control. Listed in the known gaps |

**Post-verification commits:** FV4's copy (`d8d76c3`) and FV1's fix (`4a1cad3`) are changes
after the last review, so a fresh reviewer checks both before the push (below).

## Review of the post-verification commits

A fresh reviewer checked `d8d76c3`, `4a1cad3` and the dispositions above (`9264d80`).

**Confirmed:**
- lint ✓ · typecheck ✓ · unit ✓ (934) · e2e ✓ (156, 3 deferred to M3)
- the new e2e test fails on `4a1cad3^` at both widths (40.9 and 59.9 px) and passed 10/10 on
  `4a1cad3`
- with no toast up, the bottom spacing, scroll height and footer gap match the pre-fix build
  on all 6 tabs at 390 and 1280 px
- with a waiting toast up, every tab stop on all 6 tabs at 390, 768, 1024 and 1280 px is clear
  of it, apart from tab panels taller than the screen
- the padding and `--toast-clearance` go back after Dismiss, Escape, Undo and a timeout
- the Ironfoe copy matches C37, the rule profile and the effect
- FV2's, FV3's, FV5's and FV6's factual claims hold

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| PV1 | medium, blocking | **The sheets get no toast clearance.** At 390 px with a waiting toast up, Tab can land on a control the toast hides entirely: the results sheet's "Character sheet" button, and About's "What still needs testing in game" link. It's WCAG 2.4.11 and contradicts ux.md. The pre-fix build does the same. | fixed, `37a9643`: the results sheet, About, the item picker's list and the enchant drawer's list get bottom scroll padding from the toast clearance (`scroll-pb-toast`) and room at their end (`pb-toast-*`). The enchant drawer was worse: options up to 180 px under the toast, and the list couldn't scroll them clear. New e2e tests fail without it (70–83 px covered) |
| PV2 | medium | **Decimal fields read a decimal comma as a thousands separator:** Arms "Rend again with" turns "1,5" into 15. On a comma-decimal phone, whose decimal keypad has only ",", no fraction can be typed. FV3 covered integer fields only. | fixed, `3a898bb`: `src/lib/parse-number.ts`. A fractional field reads a lone comma as the decimal point, and whole-number fields read locale thousands separators (FV3 too) |
| PV3 | low | **The handoff said the gate was complete** while this review was open, and the FV2 known gap dropped "after typing in a text field". | fixed, `ffe271f`: the handoff defers to this log's verdict, and the FV2 gap keeps its condition |
| PV4 | low | **The Ironfoe copy doesn't say which way** the other reading moves DPS, or that 2.7% is for the default setup. | fixed, `ffe271f`: "if hits from the other hand proc it too, the default Fury warrior does about 2.7% more DPS" |
| PV5 | low | **Every toast grows the page's padding**, so when a 10 s toast times out with the page scrolled to its end, the content drops 35 px (390) or 54 px (1280) unprompted. | fixed, `37a9643`: only a toast that waits for Dismiss grows the padding (`--toast-wait-clearance`, that toast's own reach), so a 10 s toast coming or going moves nothing. New e2e tests fail without it |
| PV6 | low, pre-existing | **Undo hands focus back off-screen** when it lengthens the page, because Sonner restores focus with `preventScroll`. | fixed, `7f5a8a6`: when focus leaves the toasts, the element that gets it is scrolled into view (`block: 'nearest'`) on the next frame. New e2e tests fail without it |
| PV7 | low | **Focus isn't cleared again when the toast stack settles:** when Share's toast times out in front of a waiting toast, the waiting one grows to full size over 17 of the focused link's 44 px. | fixed, `7f5a8a6`: when the toasts reach higher, keyboard focus they now cover scrolls clear of them; never after a tap or click, and focus never moves. New e2e tests fail without it (24 px covered) |
| PV8 | low | **Stale comments and one loose sentence** about `--toast-clearance` and the "last control". | fixed, `37a9643` and `7f5a8a6`: the comments in App.tsx, toaster.tsx and index.css, and ux.md's toast bullets |
| PV9 | low | **FV7's description is off:** each arrow press scrolls the page about 360 px (390) or 420 px (1280), not "to the top", so peeking at a tab loses your place. | fixed, `ffe271f`: FV7's row and the known gap |

Checks after the PV fixes (`7f5a8a6`): lint ✓ · typecheck ✓ · unit ✓ (939) · e2e ✓ (169, 3
deferred to M3).

## Verdict

Ready to push: not yet. The PV fixes (`3a898bb`, `ffe271f`, `37a9643`, `7f5a8a6`) await their
independent review.
