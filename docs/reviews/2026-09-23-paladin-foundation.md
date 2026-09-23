# Paladin foundation, C1 (2026-09-23)

The paladin class foundation, with no paladin spec offered yet: spells with the Holy school,
seals and Judgement, Consecration, Hammer of Wrath, Righteous Fury, the paladin's talents, and
mana with mp5 and Reverence. Also `SpellDef.triggersProcs` from the client's NOT_A_PROC bit, a
second crit roll for melee-class spells without weapon damage, and D24 placeholders for the
paladin's base values. Rebased onto main `f3d8b19` (the tank core, tank results and druid
foundation), which unified its mana with the druid's: `2157aea`..`7d9f39a`.

Fury, Arms, Protection, cat and bear are byte-identical to main (6 seeds, with and without
taking hits, and a druid shifting until out of mana). No screen changes: the paladin specs stay
hidden, so the UX gate has nothing to inspect.

## Full review (new work, D20)

A fresh logic reviewer probed the proc rules against the client's spell attributes, the
Consecration tick timeline, the crit table for judgements, and the base-value effects, and
trial-merged the branch against main and the other tracks.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| PC1 | high | introduced | **Seal of Righteousness's and Seal of Fury's procs set off Windfury and other on-hit procs,** though the client leaves NOT_A_PROC off them: +10.8% Protection TPS. | fixed, `dc00e27`: `triggersProcs` from Attr3 0x200, with data and engine tests |
| PC2 | medium | introduced | **Consecration lost its 8th tick when recast on cooldown** (−12.5% of its damage). | fixed, `db3bc16`: a tick due at the recast lands first, tested over 60 s |
| PC3 | low | introduced | **Judgements without weapon damage used the one-roll table,** against combat-tables §3. | fixed, `4222fb3`: a second crit roll, tested |
| PC4 | low | introduced | **The base-crit text stated a spread,** not D24's likely error. | fixed, `7dc8321`: −0.62% to +0.92% of Retribution DPS |
| PC5 | low | introduced | **Hammer of Wrath's 1 s cast let swings and Judgement run.** | fixed, `bd70cac`: tagged [?] and pinned |
| PC6 | low | introduced | **Worked example 15 and its test disagreed.** | fixed, `eeef65c` |
| PC7 | low | introduced | **D24 links had no anchor.** | fixed at the rebase (`30bfc44`) |
| PC8 | low | introduced | **ClassicSim's paladin rows were [C],** though they equal the emulator's. | fixed, `28cf0af`: D24 placeholders, origin mangos |
| PC9 | low | introduced | **`minMana`'s comment claimed 13–15 for the druid.** | fixed at the rebase: `minMana` is 18, pinned (`34bf4b2`) |

## Verification of the fixes and the rebase (D25)

The rebase moved the paladin onto B1's mana API: one power tick with mp5 and the
five-second rule's share, shared formulas in `core/formulas.ts`, and mana totals reset per chunk.
It also added a rage gate, since a paladin's swings counted all their rage as wasted against a
cap of 0. Placeholders moved into `BASE_PLACEHOLDERS`.

**The gate passes.** Paladin output is byte-identical to the pre-rebase branch, including
starved mana, mp5 and Reverence. Every PC fix is intact, and removing one fails its test. The
rage gate's test fails without it. TA8 holds: Retribution lists no avoidance placeholders, and
Protection lists all three.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| CV1 | low | introduced (merge) | **`classSetup`'s `simulated: false` branch is now unreachable,** and so are two blocker messages in `build.ts`. | waived: harmless, and it guards a future class; it goes when the last class's setup lands |
| CV2 | low | introduced (merge) | **A Human paladin's placeholder text prints Spi 75,** the raw row, where the sheet shows 78 after The Human Spirit. | waived: the text lists base attributes, before racial multipliers, as character-stats' "raw" columns do; revisit with Retribution's UX review if it reads wrong on screen |
| CV3 | low | pre-existing | **No test pins how `paladinManaPlan` feeds mp5 and Reverence into the plan.** | known gap in the milestones; the engine side is tested |

Main after the fast-forward (`7d9f39a`): lint ✓ · typecheck ✓ · unit ✓ (1267; two client-table tests timed out under load and passed on rerun) · e2e ✓ (237).

## Verdict

**Ready to push: yes.**
