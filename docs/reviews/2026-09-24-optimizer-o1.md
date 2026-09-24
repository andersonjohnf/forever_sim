# The optimizer's search core and talents, O1 (2026-09-24)

O1 is the Optimizer's engine and command line (D30, [optimizer.md](../optimizer.md)): racing
candidates on common random numbers, the talent screen and space, rotation settings as
candidates, sheet and result constraints with the effective-health floor, a fresh-seed
confirmation, and `npm run optimize`. It has no app screen yet (O3), so there was no UX review;
the logic review covered the engine, the CLI and the pool's runner. The same day, D30 changed on
main twice by user decision: crit- and crush-immune switches replaced a damage-taken cap, and
the tanks' survival floor gained Anticipation 5/5 and Deflection 5/5 (Toughness optional). The
fixes below take both in.

## Logic review (`9d2044e`, `2b14e01`, `8f689b1`)

The reviewer ran the four default searches on `quick`, the bear in turns, a rotation sweep
against main's tuner, and a winner's-curse probe on the race alone (its probes and logs are in
`.cache/probes/o1-review/`).

| id | sev | origin | finding | disposition |
| --- | --- | --- | --- | --- |
| O1-1 | high | introduced | A rotation search never raced the start's own rotation (`optimize.ts`: the variants replaced it). So `optimizeInTurns` and `--search both` could end worse than the talent pass: on the bear, `--turns --rotation "maul.minRage=90"` found +10.1 points in the talent pass, then the rotation pass raced only the baseline and the winner with Maul held for 90, and fell back to the baseline (`bear-turns.log`). | fixed, `cd29573`: every search races its start and the start's own rotation beside the variants, deduplicated; `--search both` tries every build with the setup's rotation too. Unit tests: the rotation pass's candidates, rotations × builds, and the repro in miniature (the final answer is never worse than any pass's winner on a fresh seed). They fail on the old code |
| O1-2 | medium | introduced | Winner's curse: the elimination bar was a plain 99% interval against the leader, the luckiest of thousands, so the true best was dropped in round 0 far more often than the doc's "at most a 0.5% chance" (`curse.probe.ts`: 4 in 20 at 3,000 near-equal candidates). | fixed, `185fa1f`: the bar is Student's t at a 0.5% upper tail ÷ the survivors compared with the leader (Bonferroni), with n − 1 degrees of freedom; the limit check uses t at 0.5% a side. [optimizer.md](../optimizer.md#racing) now states what's guaranteed: at most 0.5% a round under the normal model, at most r × 0.5% over r rounds. Probe and budget cost below |
| O1-3 | medium | introduced | The tank talent winners drop the avoidance talents (Anticipation, Deflection) for threat, since the model's avoided hits cost rage, mana and Reckoning procs; the survival floor didn't keep them. | fixed by the user's decision (D30 on main, `9d96152`): Anticipation 5/5 and Deflection 5/5 join the warrior's and paladin's floor, Toughness optional (`47ed6e0`, warrior.md §6.4, paladin.md "Protection survival floor"). `--keep` extends the floor for a search, and floor.ts says how to change a default. A baseline that breaks the floor races as a reference only, so the answer keeps it (`cd29573`). `--confirm` names the [?] assumptions only the winner, only the default, or both rely on |
| O1-4 | low | introduced | The budget ending's "the closest is X behind" always printed 0 (`Math.min` of positive gaps and 0). | fixed, `185fa1f` and `cd29573`: the race reports the closest unseparated survivor with its paired interval, and the CLI prints its build and gap |
| O1-5 | low | introduced | An objective talent whose screen mean is below zero, but not clearly (Feral Swiftness for a bear, −0.9), was forced into every build it fit by maximality. | fixed, `d64a18b`: it's never a raise nor given leftover points, so builds with and without it race |
| O1-6 | low | introduced | The pool and the CLI's thread runner updated the cache mirror and the busy count before building the plan: a plan that threw left the mirror claiming the worker had it. | fixed, `80d3c9a` (pool) and `cd29573` (CLI): the plan is built first |
| O1-7 | low | introduced | `WorkerPool.fightRunner` had no test. | fixed, `80d3c9a`: a vitest against stub workers with the real engine cache: a plan goes only to a worker that lacks it, the mirror matches through evictions, and a failed plan leaves the bookkeeping as it was. Real workers run it first in O3's e2e tests (known gaps) |
| O1-8 | low | introduced | A tank's talent search had no tree minimum unless given one, though D30's example and every run used 31 in the tank tree. | fixed, `cd29573`: 31 in the tank tree by default (`TANK_TREE`); `--min-tree <tree>=0` drops it |
| O1-9 | low | introduced | The screen started every run at once, so a cancel waited for all of them; the doc didn't say what budget a space needs; and a space too big for `quick` threw. | fixed, `f8db7b7` (the screen keeps twice the lanes in flight and checks cancel before each) and `cd29573` (`fitBudget`: a smaller first round down to 20 fights, then a larger budget, with a note; [optimizer.md](../optimizer.md#budgets) has the sizes each budget covers) |

**D30's update** (`cd29573`): crit immune (`bossCritPct<=0`) and crush immune (`bossCrushPct<=0`)
are sheet constraints read from the boss table the engine rolls and the Results show
(`sheet.bossTable`; with the rotation's block buff up, Holy Shield, when it keeps one, as the
Results' second table), off by default, with `--crit-immune` and `--crush-immune`. Every reported
result carries the boss's crit and crush chances beside health, effective health and damage taken.
A tank's defaults are the effective-health floor alone: a unit test pins that there's no
damage-taken cap.

## The numbers

**The winner's-curse probe** (the review's `curse.probe.ts`, unchanged; 3,000 candidates level at
1,000 DPS and one better by 1, 2 or 3 of a candidate's standard errors, 61 first-round fights, a
budget of three first rounds):

| Best ahead by | Dropped in round 0, before (99%) | After (corrected) |
| --- | --- | --- |
| 1 SE | 4 of 20 (21 of 100) | 0 of 20 (0 of 100) |
| 2 SE | 0 of 20 (3 of 100) | 0 of 20 (0 of 100) |
| 3 SE | 0 of 20 (0 of 100) | 0 of 20 (0 of 100) |

On that probe's tiny budget the corrected race more often ends on the budget with the best still
a survivor (it won 2 of 100 at 1 SE, against 16 before, but was never lost; at ten first rounds it
won 37 and 100 of 100 at 1 and 2 SE against 76 and 97). On the real searches the cost is small:
on `quick`, before the floor change, the warrior's race ran 496,831 fights against 485,912 (+2.2%)
and the paladin's 1,253,250 against 1,243,750 (+0.8%), with the same winners; the bear's (180
candidates, 1,000 fights each) was unchanged.

**The bear in turns** (`--turns --rotation "maul.minRage=90" --budget 400000`): the review's run
on the old default fell back to the baseline in the rotation pass. After the rebase the default is
that run's winner, so the repro starts from the old build (`--talents 050012-5523032120132210551-`):
the talent pass finds +14.19 points (+13.47 to +14.91), and the rotation pass keeps that build with
the setup's rotation at +14.13, ahead of the baseline and of Maul held for 90 (−1.60). It stops
there, since the pass kept its start.

**The default searches after the fixes** (`quick`, seed 1, `--confirm` on seed 2654435770, 40,000
fights each):

| Spec | Space | Result | Confirmed vs the default |
| --- | --- | --- | --- |
| Protection warrior | 3,544 builds | Toughness 1→0, Improved Thunder Clap 0→1 | +0.54 points (+0.51 to +0.58), clears with ratings either way |
| Protection paladin | 10,805 builds; the default races as a reference (Anticipation 0/5) | Anticipation 0→5, Toughness 4→0, Sanctified Judgement 3, Crusade 2, … | +5.30 (+5.22 to +5.39); the gain flows through `sanctifiedJudgement` [?], which only the winner relies on |
| Feral bear | 199 builds | Feral Swiftness 2→0 (+4% dodge), Feral Instinct 0→2 | +0.59 (+0.48 to +0.69), taking 30 more damage a second |

These aren't O4's defaults: that's `thorough` with the whole process.

## For the lead

- **The bear's floor (proposal, not added):** the bear's winner drops Feral Swiftness 2/2 (+4%
  dodge) for +0.59 points, the same trade the user ruled out for the warrior's and paladin's
  Anticipation and Deflection. It's the bear's avoidance talent; Natural Reaction (+5% dodge) the
  search keeps for its rage on a dodge. Thick Hide, the Toughness analog, is already in the floor.
  Adding Feral Swiftness 2/2 would match D30's rule for the other tanks.
- **A judgment call to check:** crush immunity for a tank with a kept-up block buff (the
  Protection paladin's Holy Shield) reads the table with it up, the Results' second table.

## Verification pass

Awaiting the verification pass, scoped to `185fa1f`..`cd29573` and the docs commits after them.
