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

Each disposition says which slice owns the fix, then the commit once it lands.

## Logic findings

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| L1 | high | **Hand of Justice** is modelled as a flat 2% per hit with no internal cooldown. The Forever client (15600) has `ProcChance 3` scaled to 1% for non-Dwarves and a 2 s `ProcCategoryRecovery`; Classic Era has 2% with the same 2 s. HoJ is in every warrior default. | fix, F1a |
| L2 | high | **Windfury has no 100 ms internal cooldown in `forever`**, which damage-and-timing §5.4 (the owning doc) says is modelled (10612 `ProcCategoryRecovery 100`). With 0 ms reactions, instants at the swing's millisecond re-proc it. Arms is 1.4% too high, Fury 0.5%. warrior.md §7 and Q27 and the assumption text say the opposite. | fix, F1a |
| L3 | medium | **Weapon racials (Human sword, Orc axe, Dwarf mace)** apply per hand. The Forever tooltip reads "+2% crit with all spells and attacks … while you have a sword … equipped", and warrior.md §2.9 and §6.2 say "either hand"; character-stats.md says per hand. Default Human Fury (mace + sword) is 1.4% low. **Decision:** the tooltip wins (doctrine §2): all attacks while any matching weapon is equipped, still [?] (Q15). Fix character-stats.md. | fix, F1b |
| L4 | medium | The Fight tab's **Enemies** setting is read nowhere: multi-target isn't simulated, and the control silently does nothing. | fix, F1b: hide the control until multi-target lands |
| L5 | medium | **Items that fall back to Classic Era take their effect spells from Classic** even when the Forever client ships the same spell changed. 201 of 584 fallback effect spells differ, e.g. Seal of the Dawn, Mark of the Chosen (Prot default), Doombringer, Diamond Flask. | fix, F2: resolve spells from Forever when it has them (tier 1) |
| L6 | medium | **Elemental Sharpening Stone** is limited to bladed weapons, but the client's `SpellEquippedItems` (mask 42483) allows axes, maces, polearms, swords, staves, fist weapons and daggers. Fury's mace main hand loses +2% crit in the Max preset. | fix, F1a |
| L7 | medium | **Unique-equipped groups aren't enforced** (e.g. two Undermine trinkets, two Watcher's Signets), and a unique weapon can be equipped in both hands. `normalizeConfig` accepts them silently. | fix, F1c |
| L8 | medium | **Set bonuses using aura 290 (all crit) or 274 (block value) are dropped silently** (e.g. The Gladiator 5-piece), and unparsed active bonuses aren't reported as unmodelled. | fix, F2 (mapping) and F1c (reporting) |
| L9 | medium | **The spell-text renderer ignores `EffectRealPointsPerLevel`**, so rendered texts show base values (Vindication, Cat and Dire Bear Form, Demoralizing Shout). Demoralizing Shout's −196 "tooltip value" is itself an unscaled render; the level-60 tooltip is −204. | fix, F2 (renderer, and Q22's value with the buffs doc) |
| L10 | medium | **The build-code guard only protects the 12 codes stored in the repo.** A reorder or `maxRank` change at a position no stored code uses would silently break users' share links. | fix, F2: guard every position → (name, max rank) |
| L11 | medium | **The `classicEra` profile uses Forever buff, consumable and enchant values** (Battle Shout 139 vs 232, Blessing of Might, Mark of the Wild, Fortitude, totems, glove enchants), while the UI says Classic Era uses Classic numbers wherever they differ. | fix, F3: per-profile values from the Era client |
| L12 | low | A **Deep Wounds refresh at the same millisecond as its tick** loses that tick. Rend has the tie-break; Deep Wounds doesn't, and Mortal Strike's 6 s cooldown hits it every time (Arms −0.2%). | fix, F1a |
| L13 | low | **Magic procs never crit**, while combat-tables §9 says landed spells roll crit at ×1.5. No doc records the skip. | fix, F1a (follow the doc, tagged [?]) |
| L14 | low | **Negative armor is clamped at −K/2 (×2.0 damage)** without a doc, and custom boss armor reaches it. The doc's formula diverges there. | fix, F1a (document the floor, surface it) |
| L15 | low | **Shield Specialization's block rage** comes before the damage-taken rage; rage.md says after. It matters at the rage cap for tanks. | fix, F1a |
| L16 | low | **Sibling extra-attack branches** let one source proc twice from one root swing (`classicEra` especially). | fix, F1a |
| L17 | low | **Reaction time is undefined**: warrior.md and damage-and-timing point at each other, and the engine uses 0 ms. | fix, F1a (document 0 ms, surface it) |
| L18 | low | **Engine test tautologies** (W22, T15/T16, WE-2, WE-4/5) and gaps: damage-taken rage models, Classic Era dodge/parry rage, boss parry haste, R13, R14, the Windfury internal cooldown. | fix, F1a |
| L19 | low | `recomputeStats` allocates a few objects per call (about 17 per fight), against architecture.md's "no allocation per event". | fix, F1a if cheap, otherwise waive with the measured cost |
| L20 | low | **Arms at 0% execute** drinks the Mighty Rage Potion 5 s before the Recklessness swap that caps rage at 25, losing about 12 rage. | fix, F1b |
| L21 | low | The default **Rend refresh at 1.5 s** always drops the 7th tick (6.21 ticks per Rend). The doc doesn't say so. | fix, F1b (document it, add it to the tuning notes) |
| L22 | low | **GCD-safe** counts a dance ability as "coming up" even when its dance can't pay at the current rage, which blocks Hamstring behind the Whirlwind dance. | fix, F1b |
| L23 | low | Two [?] choices aren't surfaced: **Execute converts rage tenths** (Q28) and **Improved Bloodrage 1/2 rounding** (Q29). | fix, F1b |
| L24 | low | **With no weapon**, non-weapon specials (Bloodthirst, Execute, Rend) still fire and spend rage. | fix, F1b: refuse melee abilities without a main-hand weapon |
| L25 | low | warrior.md §5.2 row 11 lists the wrong unqueue ids, and row 14 (Sunder Armor) isn't marked "not simulated". | fix, F1b |
| L26 | low | **Warrior test gaps:** W12, the §7 Execute example, and engine tests for Arms rows 14 and 16 and Fury rows 9 (`reserve`) and 12 (`onlyWhenFlurryDown`). | fix, F1b |
| L27 | low | **Elemental Sharpening Stone stacking**: milestones says it doesn't stack, and the code adds +2% per stone. | fix, F1a (decide from client data, tag [?], align) |
| L28 | low | `normalizeConfig` keeps the **first** member of an exclusive group, but the buffs doc says the largest. Blessings can't be limited per paladin, because composition is class presence only. | first part: fix, F1c. Second: **waived**, because composition switches are presence by design (ux.md) and a typical 40-player raid has enough paladins for every blessing. |
| L29 | low | **Share-link decoding has no size cap**: an 87 KB hash inflates to 64 MB, and a crash repeats on reload because the hash is cleared after decoding. | fix, F1c |
| L30 | low | **Alliance defaults wear Horde PvP twins** (rank ties broken by item id). | fix, F1c: break ties by the race's faction |
| L31 | low | **Set counting trusts the item's own `setId`** (16526 carries Classic set 361, and Forever's 361 lists other items). | fix, F1c |
| L32 | low | **Toughness** multiplies Classic-fallback armor that has bonus armor baked in, but not Forever's stat-50 bonus armor. The choice is untagged. | fix, F1a (document and tag) |
| L33 | low | **Execute's rage factor** is in the client (`EffectChainAmplitude`, 0.3 … 1.5 by rank) but dropped from `spells.json`, and the docs call it server-side. | fix, F2 |
| L34 | low | **Trainer rows for spells with no client data are dropped silently** (Tiger's Fury ranks, Avenger's Shield). They may be hotfix-only. | fix, F2 (list them as an open question) |
| L35 | low | **Generator output depends on the machine's locale** (`localeCompare`) and on the cached "latest" build (build dates). | fix, F2 |
| L36 | low | **The talent and race storage guards fail open** when `git show` fails. | fix, F2: fail closed |
| L37 | low | **Talent texts merge a client line break into the sentence** (Feral Charge). | fix, F2 |
| L38 | low | **Data test gaps:** fallback items' spells vs Forever's, the aura → stat coverage, unique groups, set membership, catalogue values vs client data, stone weapon masks, per-level rendering, the full build-code order, a schema test, and generator locale independence. | fix, F2 and F1c |

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
| U1 | high | **On phones a failed run is invisible.** With no earlier result, the bar stays "DPS —" and "Show results" is disabled, so the error can't be reached. With an earlier result, the error is only inside the sheet. | fix, UX-A |
| U2 | high | **The two Skyborne races can be picked but always fail** at Simulate. The message ends "Try again, or reset…", which can never work. | fix, UX-B2: mark the tiles as not yet simulatable; drop the generic retry ending from validation errors |
| U3 | high | **Desktop: the sticky results panel (about 1,200 px) is taller than the viewport**, so its lower half is only seen at the bottom of the page. | fix, UX-A |
| U4 | high | **Undo after a shared link for your other spec** (or just switching spec) overwrites your saved setup for that spec. | fix, UX-C |
| U5 | high | **Keyboard users can't remove talent points** (right-click only). | fix, UX-B2 |
| U6 | high | **Some Fight controls have no accessible name:** the length slider (and its value text), and the Creature type and Zone selects. | fix, UX-B2 |
| U7 | high | **Contrast fails AA.** The class-colour "Warrior" label is 2.53:1; the talent rank badges (amber/emerald-600) and the positive change colour fall short; the stale "Setup changed" badge is 2.37:1; the off-state switch track is 1.26–1.34:1 (controls need 3:1). | fix, UX-C (tokens and shared components; call sites with their slices) |
| U8 | high | **The About sheet and the page meta description** promise druids, paladins and TPS, which don't ship. | fix, UX-C |
| U9 | medium | **The "Classic stats" explanation can't be reached on a phone:** the badge sits inside the slot button, and the slot's aria-label hides its stats. | fix, UX-B2 |
| U10 | medium | **A re-run shows no progress:** the old number stays at full strength, with no progress bar or live status. | fix, UX-A |
| U11 | medium | **Stale results dim only the headline.** After a spec switch, the other spec's rows stay visible. | fix, UX-A |
| U12 | medium | **Enrage shows 0.0% uptime by default** ("Damage you take" is 0), with no explanation. | fix, UX-A: explain it in the row and the field's help; the default stays 0 per warrior.md §2.6 and Q8 |
| U13 | medium | **Three settings don't follow the switch they depend on** ("Save the last Death Wish", "Racial and trinkets with Death Wish", "Hamstring only without Flurry"). | fix, UX-B1 |
| U14 | medium | **The Rotation tab doesn't mark defaults**, and "Defaults" has no Undo. | fix, UX-B1 |
| U15 | medium | **The Rotation tab is very long** (Fury 38 settings, Arms 37), with thresholds beside the core switches. | fix, UX-B1: thresholds behind an Advanced disclosure per group |
| U16 | medium | **The Gear tab scrolls sideways at 320 px** (enchant text sets the column width). | fix, UX-B2 |
| U17 | medium | **Touch targets under 44 px:** selects (32), toast Undo (24), section tabs (40), menu items (38–40), picker chips (36), clear search (32), slider thumb (12), Classic stats badge (20), and setting rows outside Buffs. | fix, UX-B2 (setup screens) and UX-C (tabs, menus, toasts) |
| U18 | medium | **A share link pasted into an open tab does nothing** (the hash is read only on load). | fix, UX-C |
| U19 | medium | **Paste-a-build-code errors are developer messages.** | fix, UX-B2 |
| U20 | medium | **Assumptions don't link to their docs**, the list is long (22/23), and gear with unsimulated effects isn't flagged on its row. | fix, UX-A (links, order); UX-B2 (gear-row badge) |
| U21 | medium | **The Enemies control promises an effect that isn't simulated.** | fix, F1b (L4) |
| U22 | medium | **Focus isn't moved into or back from sheets** (results sheet, About). | fix, UX-C |
| U23 | low | **Copy details:** "Tap a slot" on desktop; Hammer of Wrath in warrior help; a fixed "level 63" header; "fights of 179 s"; the unlabelled run time; the "Defaults" label; the Juju switch showing on while unused. | fix, UX-B1/UX-B2/UX-A by screen |
| U24 | low | **Race picker:** not grouped by faction as ux.md says; Skyborne names cut off at 390; no arrow-key movement. | fix, UX-B2 |
| U25 | low | **"Holy Strength (main hand)" wraps** because "Casts per fight" makes a wide column. | fix, UX-A |
| U26 | low | **The phone tab-bar fade doesn't track scroll position.** | fix, UX-C |
| U27 | low | **The item picker has no sort control** (ux.md), and Buffs preset descriptions are hover-only `title` text. | fix, UX-B2 |
| U28 | low | **Undo toasts last only 4 s** and cover the phone header. | fix, UX-C |
| U29 | low | **Steppers are named only "Decrease/Increase"**, and the page has no `<h1>`. | fix, UX-B2 (steppers), UX-C (h1) |
| U30 | low | **The no-gear result gives no next step.** | fix, UX-A |
| U31 | low | **First load: 1.8 MB JS (311 kB gzipped).** | **waived** for the first release. 311 kB gzipped loads in about a second on a phone connection, and the sim then runs offline in workers. Lazy-loading per class stays in Known gaps. |
| U32 | low | **Share may fail on iOS Safari** (a clipboard write after an await); not verified. | fix, UX-C: `ClipboardItem` with a promise, or `navigator.share` on phones |

## Verdict

Ready to push: not yet. The logic and UX fixes are open.
