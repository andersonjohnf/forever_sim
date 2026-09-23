# Druid foundation, B1 (2026-09-23)

The druid class foundation, with no druid spec offered yet: forms (caster, cat, bear), Energy and
its ticks, combo points, mana and the power tick, shapeshifting and Furor, Omen of Clarity,
form weapons and attack power, bear armor, the druid's talents, and the Flank au Poivre food
(every class). Rebased onto main `eb7cedc` (the tank core and tank results), then merged:
`3b08113`..`7de2b1a`.

Fury, Arms and Protection are byte-identical to main: results, sheets, assumptions and blockers
over 66 setups, and rage gained and wasted per chunk.

## Full review (new work, D20)

A fresh logic reviewer recomputed the worked examples W1–W3, W5, W6, W9, W10, W13 and W17 by
hand, probed the edge cases (mana-starved powershifts, Clearcasting through a shift, a
reused Sim after a fight ending in bear), compared 72 warrior setups byte for byte, and timed the
engine against its base. The only screen that changes is the Buffs tab's new food row, since the
druid specs stay hidden. The same reviewer checked it at 390 and 1280 px, light and dark, and
found nothing.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| DB1 | medium | introduced (merge) | **The druid's conditions used 13–15, which main's `executeWithin` took,** so a merge keeping 13 would make Energy thresholds execute windows. | fixed at the merge: `minEnergy` 14, `maxEnergy` 15, `minComboPoints` 16, tested (`671c58e`, `8a6955d`) |
| DB2 | medium | introduced | **The Night Elf and Tauren attribute rows were tagged [C] from ClassicSim,** whose source is a dead guide matching the mangos emulator. | fixed, `6282e86`, `ac868b9`: D24 placeholders, origin mangos; ClassicSim only corroborates |
| DB3 | low | introduced | **The base-crit effect figure stated the value's whole effect,** not its likely error under D24 rule 1. | fixed, `6282e86`: 0–1% plausible, −1.5% to +0.2% of cat DPS, named first to measure in OQ-3 |
| DB4 | low | introduced (latent) | **A refund reaching the rage cap kept the carried fraction.** | fixed, `472c8b7`, with a test |
| DB5 | low | introduced | **The druid's base values were grouped with class mechanics,** and the Energy text called [?] rules Classic Era values. | fixed, `6d77144` |
| DB6 | low | introduced | **Missing tests:** a shift refused for mana, Clearcasting and the tick through shifts, a reused Sim, and Flank au Poivre's Agility. | fixed, `c45f05c` |
| DB7 | low | introduced | **The Energy totals counted every form's Energy and weren't reset per chunk.** | fixed, `e3bfe53` |
| DB8 | low | pre-existing | **Items' feral attack power was dropped silently.** | fixed, `160bf58`: form-bound AP, tested |

## Verification of the fixes and the merge (D25)

The merge resolved conflicts in six files (`base-stats.ts`, `character-stats.md`,
`open-questions.md`, `types.ts`, `build.ts`, `sim.ts`) and added follow-ups: one rule for rage
from hits (`f4bab78`), Natural Reaction on dodges only (`49d0476`), the druid's placeholders in
`BASE_PLACEHOLDERS` (`c90ab7f`, `b796f44`), and the new form's armor after a shift (`526b942`).

**The gate passes.** The reviewer redid the merge with `git merge-tree` and found no hand edits
outside the conflict hunks. Nothing of main's or B1's was lost, and every DB fix is present.
Warriors are byte-identical to main, and the druid's output is bit-identical to B1 before the
merge. A bear's hits taken cost exactly the bear-armor factor, and a cat gains no rage from them.
Base dodge shows for the bear only, so the tank core's VT2 (a null base dodge listed as left out)
doesn't arise for the druid.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| BV1 | low | introduced | **druid.md §2.8 said forms carry damage-taken modifiers;** they don't. | fixed, `fa9938a` |
| BV2 | low | introduced | **The energize list implied Furor and Primal Fury add rage outside bear.** | fixed, `fa9938a` |
| BV3 | low | introduced (latent) | **Rage from damage taken divides by the starting form's health,** so a cat that shifts into bear to tank would gain about 47% too much. | waived: no rotation shifts into bear. §2.8 says a bearweaving rotation must divide by the current form's health first (`fa9938a`), and the milestones' known gaps list it |
| BV4 | low | introduced | **Nothing guarded `minComboPoints` or distinct condition codes.** | fixed, `8a6955d`: every code table is checked for distinct codes |

A fresh reviewer checked `fa9938a` and `8a6955d` against the engine (CLAUDE.md step 5), and
found one more:

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| BV5 | low | introduced (the BV2 fix missed it) | **The comment on `FormPlan.rage` still listed Furor and Primal Fury as adding rage in any form.** | fixed, `7de2b1a`; a second quick check passed |

Worktree before the fast-forward: lint ✓ · typecheck ✓ · unit ✓ (1192, 56 files) · e2e ✓ (237).

## Verdict

**Ready to push: yes.**
