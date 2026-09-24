# The optimizer's search core and talents, O1 (2026-09-24)

O1 is the Optimizer's engine and command line (D30, [optimizer.md](../optimizer.md)): racing
candidates on common random numbers, the talent screen and space, rotation settings as
candidates, sheet and result constraints with the effective-health floor, a fresh-seed
confirmation, and `npm run optimize`. It has no app screen yet (O3), so there was no UX review;
the logic review covered the engine, the CLI and the pool's runner. The same day, D30 changed on
main twice by user decision: crit- and crush-immune switches replaced a damage-taken cap, and
the tanks' survival floor gained Anticipation 5/5 and Deflection 5/5 (Toughness optional). The
fixes below take both in.

## Logic review (`d5616cc`, `bd06fd5`, `efd6f1f`)

The reviewer ran the four default searches on `quick`, the bear in turns, a rotation sweep
against main's tuner, and a winner's-curse probe on the race alone (its probes and logs are in
`.cache/probes/o1-review/`).

| id | sev | origin | finding | disposition |
| --- | --- | --- | --- | --- |
| O1-1 | high | introduced | A rotation search never raced the start's own rotation (`optimize.ts`: the variants replaced it). So `optimizeInTurns` and `--search both` could end worse than the talent pass: on the bear, `--turns --rotation "maul.minRage=90"` found +10.1 points in the talent pass, then the rotation pass raced only the baseline and the winner with Maul held for 90, and fell back to the baseline (`bear-turns.log`). | fixed, `8ee7afa`: every search races its start and the start's own rotation beside the variants, deduplicated; `--search both` tries every build with the setup's rotation too. Unit tests: the rotation pass's candidates, rotations × builds, and the repro in miniature (the final answer is never worse than any pass's winner on a fresh seed). They fail on the old code |
| O1-2 | medium | introduced | Winner's curse: the elimination bar was a plain 99% interval against the leader, the luckiest of thousands, so the true best was dropped in round 0 far more often than the doc's "at most a 0.5% chance" (`curse.probe.ts`: 4 in 20 at 3,000 near-equal candidates). | fixed, `8cb09b3`: the bar is Student's t at a 0.5% upper tail ÷ the survivors compared with the leader (Bonferroni), with n − 1 degrees of freedom; the limit check uses t at 0.5% a side. [optimizer.md](../optimizer.md#racing) now states what's guaranteed: at most 0.5% a round under the normal model, at most r × 0.5% over r rounds. Probe and budget cost below |
| O1-3 | medium | introduced | The tank talent winners drop the avoidance talents (Anticipation, Deflection) for threat, since the model's avoided hits cost rage, mana and Reckoning procs; the survival floor didn't keep them. | fixed by the user's decision (D30 on main, `9d96152`): Anticipation 5/5 and Deflection 5/5 join the warrior's and paladin's floor, Toughness optional (`5db84d0`, warrior.md §6.4, paladin.md "Protection survival floor"). `--keep` extends the floor for a search, and floor.ts says how to change a default. A baseline that breaks the floor races as a reference only, so the answer keeps it (`8ee7afa`). `--confirm` names the [?] assumptions only the winner, only the default, or both rely on |
| O1-4 | low | introduced | The budget ending's "the closest is X behind" always printed 0 (`Math.min` of positive gaps and 0). | fixed, `8cb09b3` and `8ee7afa`: the race reports the closest unseparated survivor with its paired interval, and the CLI prints its build and gap |
| O1-5 | low | introduced | An objective talent whose screen mean is below zero, but not clearly (Feral Swiftness for a bear, −0.9), was forced into every build it fit by maximality. | fixed, `026da75`: it's never a raise nor given leftover points, so builds with and without it race |
| O1-6 | low | introduced | The pool and the CLI's thread runner updated the cache mirror and the busy count before building the plan: a plan that threw left the mirror claiming the worker had it. | fixed, `8f9f8bc` (pool) and `8ee7afa` (CLI): the plan is built first |
| O1-7 | low | introduced | `WorkerPool.fightRunner` had no test. | fixed, `8f9f8bc`: a vitest against stub workers with the real engine cache: a plan goes only to a worker that lacks it, the mirror matches through evictions, and a failed plan leaves the bookkeeping as it was. Real workers run it first in O3's e2e tests (known gaps) |
| O1-8 | low | introduced | A tank's talent search had no tree minimum unless given one, though D30's example and every run used 31 in the tank tree. | fixed, `8ee7afa`: 31 in the tank tree by default (`TANK_TREE`); `--min-tree <tree>=0` drops it |
| O1-9 | low | introduced | The screen started every run at once, so a cancel waited for all of them; the doc didn't say what budget a space needs; and a space too big for `quick` threw. | fixed, `1cfb924` (the screen keeps twice the lanes in flight and checks cancel before each) and `8ee7afa` (`fitBudget`: a smaller first round down to 20 fights, then a larger budget, with a note; [optimizer.md](../optimizer.md#budgets) has the sizes each budget covers) |

**D30's update** (`8ee7afa`): crit immune (`bossCritPct<=0`) and crush immune (`bossCrushPct<=0`)
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
| Protection paladin | 10,805 builds; the default races as a reference (Anticipation 0/5) | Anticipation 0→5, Toughness 4→0, Sanctified Judgement 3, Crusade 2, … | +5.30 (+5.22 to +5.39); only the winner relies on `sanctifiedJudgement` [?], so part of the gain may rest on it |
| Feral bear | 199 builds | Feral Swiftness 2→0 (+4% dodge), Feral Instinct 0→2 | +0.59 (+0.48 to +0.69), taking 30 more damage a second |

These aren't O4's defaults: that's `thorough` with the whole process.

## For the lead

Both points are settled in the verification pass below: the user added Feral Swiftness 2/2 to the
bear's floor (OV-8), and crit immunity now reads the table without Holy Shield (OV-4).

- **The bear's floor (proposal, not added):** the bear's winner drops Feral Swiftness 2/2 (+4%
  dodge) for +0.59 points, the same trade the user ruled out for the warrior's and paladin's
  Anticipation and Deflection. It's the bear's avoidance talent; Natural Reaction (+5% dodge) the
  search keeps for its rage on a dodge. Thick Hide, the Toughness analog, is already in the floor.
  Adding Feral Swiftness 2/2 would match D30's rule for the other tanks.
- **A judgment call to check:** crush immunity for a tank with a kept-up block buff (the
  Protection paladin's Holy Shield) reads the table with it up, the Results' second table.

## Verification pass

A fresh reviewer verified `8cb09b3`..`8ee7afa` and the docs commits after them (its probes are in
`.cache/probes/o1-verify/`). Its two new bugs were in how the setup and the baseline are handled,
the same area as O1-1 and O1-3 in the round before, so under step 6 the lead proposed a simpler
design and **the user chose it**: the setup is only ever a measuring stick. It races every round as
the baseline, every candidate is paired with it, but it's never an answer. Every answer meets every
constraint (talent, sheet and result), checked the same way for every candidate in every pass. The
setup can win only as a regular candidate, a copy that met them like any other. When nothing meets
them, there's no answer and the report names what blocks. OV-1 and OV-2 are resolved by that
design rather than by patching the special cases, which it removes (the race's reference-only
candidates and the index-0 and index-1 branches).

| id | sev | origin | finding | disposition |
| --- | --- | --- | --- | --- |
| OV-1 | medium | introduced (O1-1's fix) | In turns, a rotation pass ran with no talent constraints, so it could answer with the baseline, whose build breaks them: the bear with `--exclude Ferocity --rotation maul.minRage=90` ended on the default, which takes Ferocity (`turns.probe.ts`). | fixed by the simpler design, `7a0212f`: every pass holds every candidate to every constraint (a rotation pass keeps the start's build, `TalentSearch.fixedBuild`, and checks the talent constraints too), and the setup races only as a candidate that meets them. Unit test: the repro in turns; every pass's candidates keep Ferocity out, and the rotation pass leaves the setup out. The CLI repro on `quick` (`.cache/probes/o1-simple/bear-turns.log`): the talent pass answers `050022-052103202313221005-505`, the rotation pass keeps it, and both say the setup fails "Ferocity taken" |
| OV-2 | medium | introduced (D30's immunity update) | The baseline always raced whatever it failed, so when every candidate missed a sheet constraint it raced alone and "won": the paladin under `--crit-immune` answered with its default, 5.20% boss crit (`pal-crit.log`). | fixed by the simpler design, `7a0212f`: no candidate, no answer. The report's leader is null, `blocked` names each constraint no candidate meets, with the closest value, and the CLI prints "no setup meets these constraints". Unit test: the repro. The CLI (`.cache/probes/o1-simple/pal-crit.log`): "crit immune: no candidate reaches the defense it needs on this gear; the closest has 330 defense, leaving the boss 4.40% crit", with all 10,805 builds left out for it and the setup for Anticipation 0/5 |
| OV-3 | low | introduced (O1-2) | `tTail(0)` recursed forever (`t <= 0` called itself with −0), and every negative t went through that branch. | fixed, `0eed941`: 0.5 at zero, mirrored below it, NaN for NaN; tests |
| OV-4 | low | introduced (D30's immunity update) | Crit immunity read the table with Holy Shield up, so a paladin whose block pushed crits off only while it's up would count as crit immune. | fixed, `fdd5290`: crit reads the table with no block buff (`sheet.bossTable`), crush the one with it up (`immunityTables`); a test with a table whose Holy Shield pushed crits off |
| OV-5 | low | introduced (O1-4) | `unseparated` listed every survivor but the leader, including those the leader is clear of at 95% that the (higher) elimination bar kept; `closest` was set on a separated ending too. | fixed, `7a0212f`: `unseparated` is the survivors whose paired 95% lower bound behind the leader isn't above zero, `closest` only on a budget ending; a toy race that fails on the old rule |
| OV-6 | low | introduced (O1-8) | `--min-tree` replaced the tank's default 31 in its tank tree, so a minimum for another tree silently dropped it. | fixed, `7a0212f`: the search's minimums merge over the default (a tree given replaces its own, another tree's joins); the CLI marks the default; a test |
| OV-7 | low | introduced (docs) | The docs still gave the bear's 180 candidates (199 builds, 200 candidates on that day's space); "the gain flows through `sanctifiedJudgement`" said more than the check measures; the CLI's "builds × rotations … with the baseline and the start" line was hard to read. | fixed, `b29e3fc` and this log: optimizer.md has the spaces after this round (the bear's is 129 builds and 129 candidates now that Feral Swiftness is kept, and says it was 199 and 200 before), the paladin's line above is softened, and the CLI prints "candidates: N, each paired with the baseline" |
| OV-8 | low | introduced (O1-3's floor) | The bear's winner dropped Feral Swiftness 2/2 (+4% dodge) for +0.59 points, the trade the user ruled out for the other tanks' avoidance talents. | **user decision** (D30 on main, `8553d5b`), `3b04b99`: Feral Swiftness 2/2 joins `SURVIVAL_FLOOR` and druid.md §7.6 |

### The numbers after this round

The default searches (`quick`, seed 1, `--confirm` on seed 2654435770, 40,000 fights each; logs in
`.cache/probes/o1-simple/`):

| Spec | Space | Result | Confirmed vs the default |
| --- | --- | --- | --- |
| Protection warrior | 3,544 builds, 3,545 candidates (the setup's own build isn't in the space) | Toughness 1→0, Improved Thunder Clap 0→1, separated after 5 rounds (484,086 fights) | +0.54 (+0.51 to +0.58), clears with ratings either way |
| Protection paladin | 10,805 builds and candidates; the setup is left out (Anticipation 0/5) and is only the baseline | Anticipation 0→5, Toughness 4→0, Improved Holy Strike 2→0, Iron Creed 5→0, Sanctified Judgement 0→3, Sacred Arbiter 0→1, Crusade 0→2, separated after 9 rounds | +5.30 (+5.22 to +5.39), clears with ratings either way; only the winner relies on `sanctifiedJudgement` [?] |
| Feral bear | 129 builds and candidates (the setup's build is one), Feral Swiftness 2/2 kept | **the setup itself**, separated after round 0; the next best is −8.33 points (−9.14 to −7.51) | nothing to confirm: the setup leads as a candidate |

The warrior's and paladin's winners are the fix round's. The bear's changes with the floor: every
build keeping Feral Swiftness 2/2 is clearly below the default, so the default stands.

`npm run test:full` after the rebase onto main: lint and typecheck clean; 16 unit tests and one e2e
test (the tank results sheet's layout on a phone) failed only under a load average over 30 from
other agents (timeouts and the speed benchmarks), and pass run alone.

### For the next verification

Scope `0eed941`..`b29e3fc` (the log commit needs no pass). Worth checking:
- that no path still treats index 0 or the start specially: the race's standings never hold the
  baseline, a pass in turns holds the talent constraints, `--search both` checks every build ×
  rotation, and `confirm` pairs the winner with the setup;
- the no-answer status: `blocked`'s reasons for a talent constraint no build keeps, for sheet
  constraints met alone but not together, and for result constraints (every candidate clearly
  outside, or the budget ending with none whose means meet them); the CLI and the JSON report with
  a null leader and in turns;
- the setup as a candidate: its copy runs the same fights as the baseline (twice the work for one
  candidate), ties merge with a space build that makes the same plan, and `isSetup` in the CLI;
- `--search rotation` has no talent constraints (documented), while `--turns` does;
- the bear's new default search: the setup leads by 8 points in round 0, the space's structure
  (every build keeping Feral Swiftness and 31 in Feral), and whether that's plausible.

## Second verification (OV2)

A fresh reviewer's second pass over `0eed941`..`b29e3fc` (probes in the O1 worktree's
`.cache/probes/o1-verify2/`) confirmed OV-1 to OV-8 fixed and found nothing at medium or worse. Its
eight lows, all fixed after the branch was rebased onto `main` (D27, D28, D30's preferred filler and
D33):

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| OV2-1 | low | pre-existing (O1's race) | A result constraint was judged on the leader's mean alone: a leader truly over its limit could drop a feasible candidate as worse and end separated in round 0 (the probe's toy: limit 505 damage taken, the leader at 507, a feasible 1,050 DPS at 495, lost in 5 of 30 seeds). optimizer.md's limits understated it. | fixed, `f76aa2d`: until the leader's constrained metrics' 95% intervals lie inside every limit it drops no one as worse and the race can't end separated; `leaderInsideLimits` and the CLI's note when the budget ends first; the toy race is a unit test (30 seeds, the feasible one answers each time); "Limits of the method" rewritten |
| OV2-2 | low | pre-existing (CLI) | `--search rotation` silently ignored `--keep`, `--exclude`, `--min-tree` and `--no-floor`. | fixed, `f76aa2d`: the CLI refuses them (and `--partials`) with one line naming the flags and `--search both` or `--turns` |
| OV2-3 | low | introduced | With an empty talent space, `blocked` listed only the setup's failures ("Wild Growth 0/1"), not the real block. | fixed, `f76aa2d`: "no legal 51-point build fits the talent constraints together: the survival floor (…); kept talents (…); excluded talents (…); at least 31 points in Feral Combat"; a test (the bear keeping Moonkin Form) |
| OV2-4 | low | introduced | The result-constraint count left out candidates merged as ties ("156 of 157"). | fixed, `f76aa2d`: a candidate dropped as outside counts its ties in `outside`; a toy test |
| OV2-5 | low | introduced (perf) | The setup's copy ran the baseline's fights again (a third of a one-variant rotation search). | fixed, `f76aa2d`: the race's `copies` take the baseline's samples (the same plan on the same seed, so the pairing is exact) and cost no fights; the bear's default search runs 149,800 fights where it ran 150,800; a toy test |
| OV2-6 | low | pre-existing (CLI) | In `--turns`, `=== pass N ===` printed after that pass's space lines and rounds. | fixed, `f76aa2d`: it prints on the pass's first progress event (checked in `.cache/probes/o1-ov2/bear-turns.log`) |
| OV2-7 | low | introduced | With no leader, each standing's `vsLeader` was `{0, Infinity}`, written as `"halfWidth": null`. | fixed, `f76aa2d`: `vsLeader` is left out when there's no leader; a test |
| OV2-8 | low | introduced (tests) | Only the crit-immune line of `blocked` had a test. | fixed, `f76aa2d`: tests for the talent line (a kept build that takes an excluded talent), the "together" line (armor ≥ the most and ≤ the least), the optimize-level result-constraint line ("2 of 2"), and the budget line with a null leader |

**User decision (D30 on `main`, `15d2fd5`): Anticipation leaves the tanks' floor and becomes the
preferred filler.** `65799755`, with the CLI's wording in `73595b4`: Deflection 5/5 stays in the
warrior's and paladin's `SURVIVAL_FLOOR`; `PREFERRED_FILLER` names Anticipation. Leftover points go
to it after the objective talents' partial ranks and before Toughness or any other filler, even
when a constraint makes Toughness a dimension; and when the race ends, a candidate with more
Anticipation than the leader is the answer if it's within 0.5% of the leader's score or inside the
leader's paired 95% interval (`preferFiller`, `src/sim/optimize/prefer.ts`, unit-tested; D30's
unmeasured-rating item rule, turned to what the model can't see). The report has `answer` and
`preferred`; turns and `--confirm` use the answer. Docs: optimizer.md's new "The preferred filler",
warrior.md §6.4, paladin.md's floor and defaults, milestones.

### The numbers after this round

The default searches (`quick`, seed 1, `--confirm` on seed 2654435770, 40,000 fights each; logs in
`.cache/probes/o1-ov2/`):

| Spec | Space | Result | Confirmed vs the default | Before (OV) |
| --- | --- | --- | --- | --- |
| Protection warrior | 4,735 builds, 4,736 candidates (the default's build isn't in the space) | Improved Rend 0→3, Deep Wounds 0→3, Improved Thunder Clap 0→3 for Anticipation 5→0, Toughness 1→0, Master of Defense 2→0, Vanguard 1→0; separated after 3 rounds. No candidate with Anticipation is within 0.5% (the top ten all have none) | **+4.43** (+4.35 to +4.50), clears with ratings either way; boss crit 4.56% → 5.36% | +0.54 |
| Protection paladin | 8,918 builds and candidates (the default, which has Anticipation 5, is one) | `050003-0530213321301511-50205`: Divine Strength 0→5, Improved Seals 0→3, Anticipation 5→2, Iron Creed 5→1, Holy Conduit 1→0 (Anticipation takes the leftover points before Toughness); separated after round 0 | **+6.48** (+6.40 to +6.56), clears with ratings either way | +5.30 |
| Feral bear | 129 builds and candidates, unchanged (no preferred filler) | **the setup itself**, separated after round 0; the next best −8.33 | nothing to confirm | the setup itself |

The paladin's answer takes Anticipation 2/5, the shape of the theorycrafter's build D30 cites. The
warrior's drops Anticipation entirely: its five points buy Deep Wounds and Improved Rend in Arms,
worth about 4 points, far past the 0.5% tolerance, so the rule keeps the leader. That is D30 working
as decided, but it costs the warrior 0.8% more boss crits, and the lead may want the user to see it.

Checks: lint and typecheck clean; `npx vitest run src/sim/optimize` 65 passed. No UI changed, so no
e2e run or screenshots.

## Third verification (OV3) and step 6

A fresh reviewer's third pass (probes in the O1 worktree's `.cache/probes/o1-verify3/`) found two
mediums and five lows. Two rounds in a row had now found new problems in the same two mechanisms,
the end-of-race preferred-filler rule and result limits in the race, so under CLAUDE.md's step 6
they were **cut rather than patched a third time** (user decision, D30 "Simplified after O1's
third review round", `dcfc85e` on `main`). The branch was merged with `main` first (`daeb07f`: the
worker pool's new watchdog now also covers the optimizer's fight jobs, with a test).

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| OV3-1 | medium | introduced by `65799755` (older maximality rule) | Maximality puts Toughness ahead of Anticipation: a constraint-only Toughness counted as a raise, so builds with 5+ leftover points and Toughness 0 were dropped before those points reached Anticipation; with `--screen-fights 3000` the warrior space had no Anticipation build. | fixed: `3a250e5b` (only objective dimensions are raises) + `678c2bc3` (the preferred filler is always a dimension) |
| OV3-2 | medium | introduced | `preferFiller` judged candidates dropped in earlier rounds on their own few fights; c3823 (dropped at round 0, 2.27 ± 2.28 behind) would have been preferred. | cut with the rule (step 6, user decision): `12ff38e9` |
| OV3-3 | low | introduced | The tolerance was 0.5% of a ~204 balanced score (~1.02 points), twice D12's item rule. | cut with the rule: `12ff38e9` |
| OV3-4 | low (step-6 signal) | introduced by `f76aa2d7` (OV2-1) | A leader near a result limit switched off elimination: `taken<=104.5%` raced all 4,736 candidates to the budget. Second round of findings on result limits. | cut: result limits leave the race (step 6, user decision): `53648f99` |
| OV3-5 | low | introduced | The preferred candidate needed only its means inside the limits, the leader its 95% intervals. | cut with the rule and result limits: `12ff38e9`, `53648f99` |
| OV3-6 | low | pre-existing | CLI said "24 objective talents" for 24 dimensions. | fixed: `678c2bc3` ("24 dimensions (22 objective + Anticipation, Toughness)") |
| OV3-7 | low | mixed | CLI nits: "(pts) behind"; `--confirm`'s "the setup itself leads" by preference; `--search both` header alignment. | fixed: `12ff38e9`, `53648f99` |

These are the third verifier's own rows. An earlier version of this log inferred OV3-2 to OV3-5
from the lead's brief; the fourth verification's brief corrected them.

**What was cut, and why.**

- **The end-of-race preferred-filler rule** (`preferFiller`, `src/sim/optimize/prefer.ts` and its
  tests; the report's `answer` and `preferred`; the CLI's "preferred for Anticipation" line). It
  preferred a candidate with more Anticipation within 0.5% of the leader or inside its interval.
  Three rounds found problems in how it chose and whom it could see. Now the leader is the answer,
  and the preferred filler is only the talent space's fill order (spare points go to Anticipation
  before Toughness and the other fillers) plus, from OV3-1, a dimension, so the race compares
  builds with and without it. An answer that drops Anticipation when the gain is clear is
  acceptable (user decision: the warrior's Deep Wounds build).
- **Result limits in the race** (`--require` on `dps`, `tps` or `taken`; the infeasible drop, OV2-1's
  hold on a leader over a limit, `leaderInsideLimits`, `outside`, `feasible`, `whyNoneInRace`, the
  CLI's "clearly outside a limit" counts and "by its means alone" note). Judging a limit with
  intervals in the race broke in two rounds running, and D30 already rules out a damage-taken cap.
  The sheet constraints stay, exact and checked before the race: the survival floor, the
  effective-health floor, crit and crush immunity, and any `--require` on a sheet stat. A result
  metric in `--require` is refused with one line.

The code shrank: across `src/sim/optimize` and the CLI, tests included, this round removed 554
lines and added 216 (85 of them the OV3-1 fixes and their tests), 338 fewer; the docs, 103 removed
and 84 added.

### The numbers after this round

The default searches (`quick`, seed 1, `--confirm` on seed 2654435770, 40,000 fights each):

| Spec | Space | Result | Confirmed vs the default |
| --- | --- | --- | --- |
| Protection warrior | 4,735 builds from 24 dimensions (23 objective + Toughness), unchanged | Improved Rend 0→3, Deep Wounds 0→3, Improved Thunder Clap 0→3 for Anticipation 5→0, Toughness 1→0, Master of Defense 2→0, Vanguard 1→0; separated after 3 rounds | **+4.43** (+4.35 to +4.50), unchanged; +4.64 with ratings ignored |
| Protection paladin | 8,918 builds, unchanged | `050003-0530213321301511-50205`, unchanged; separated after round 0 | **+6.48** (+6.40 to +6.56), unchanged |
| Feral bear | 129 builds, unchanged | the setup itself | nothing to confirm |
| Protection warrior, `--screen-fights 3000` (Anticipation harmful) | 4,388 builds, 3,287 with Anticipation 5 (was 1,101, none with any) | the same build as the default search, separated after 3 rounds | +4.48 (+3.68 to +5.28) in the race |

The merge with `main` brought its committed-data test, which O1's survival-floor tables failed: they
cite four spells (Last Stand, Improved Shield Wall and two druid floor talents) that `spells.json`
carried without the docs source. `be85fd3` regenerates it from the cache (`npm run scrape:client`,
no requests); `scrape:check` matches.

Checks: lint and typecheck clean; `npx vitest run src/sim/optimize src/sim/run` 85 passed; `npm
test` 2,634 passed, with the two one-core benchmarks failing only under the machine's load (load
average 36) and passing when rerun alone. No UI changed, so no e2e run or screenshots.

## Fourth verification (OV4) and step 6 again

A fresh reviewer's fourth pass (probes in the O1 worktree's `.cache/probes/o1-verify4/`:
`twins.mjs`, `space.mjs`, `keeplist.mjs` and the logs) confirmed the OV3 cuts and found one medium
and four lows. The medium was the third round in a row on the preferred filler (OV2's
`preferFiller`, OV3-1's maximality, now its dimension), so under step 6 the rule was **narrowed to
what D30 requires, not patched** (user decision, without asking): D30 fills Anticipation before
Toughness, and nothing more.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| OV4-1 | medium | introduced by `678c2bc3` (the preferred filler as a dimension, OV3-1) | Toughness 5 beat Anticipation 5 when the threat talents were equal, against D30's fill order. Toughness is a dimension because the effective-health floor reads it, so the space held Toughness-5/Anticipation-0 twins of Anticipation-5/Toughness-0 builds; Toughness screens at zero and Anticipation below it, so the race preferred the Toughness twin. The repro (`--keep` every default talent but Anticipation and Toughness, `--exclude` the Arms and Fury talents the default lacks) answered `35-05-512501233301210531`: Anticipation 5→1, Toughness 1→5. | fixed (step 6), `e43e686d`: a dimension only a constraint made (neither objective nor the preferred filler: Toughness) takes core ranks only when the preferred filler is at max rank, or is kept or excluded (then there's none). Builds with both at 5/5 still cover the floor's need. The repro is a unit test (the space is the default alone, whatever the screen made of Anticipation; without the fix it holds the repro's twin), and the OV3-1 tests now expect no twin. The repro now answers the default, the setup itself, from a space of 1 build (was 2). D30's simplification paragraph records the rule in one sentence |
| OV4-2 | low | introduced by `12ff38e9` (the cut left two rows stale) | `docs/classes/warrior.md` §6.4 and `docs/classes/paladin.md`'s floor still described the cut tolerance rule ("preferred wherever it costs little"). | fixed, `c5901300`: "first in the fill order: leftover points go to it before Toughness", and a build whose points gain more elsewhere may still drop it (D30) |
| OV4-3 | low | pre-existing (O1's screen; the watchdog came with `daeb07f`) | The screen ran each plan's whole count as one pool job, with no upper bound on `--screen-fights`, so a long screen job could hit the pool's 60 s awake-time watchdog on a slow phone. | fixed, `01d0e262`: each plan's fights run in jobs of at most 250 (`SCREEN_JOB_FIGHTS`), as the race's do, into fixed positions of its samples. A test: a 3,000-fight screen hands the runner no job over 250, and a screen split into jobs of 7 gives the same verdicts as one run whole. The four demo screens' verdicts match the fourth verifier's exactly |
| OV4-4 | low | introduced by `53648f99` (the cut of result limits) | optimizer.md's "With no leader, the standings have no comparison with one" and `Standing.vsLeader`'s "left out when there's no leader" described nothing: a candidate has a standing only if it raced, and then the race has a leader. | fixed, `3df3293f`: `vsLeader` is required, and the doc's sentence is gone |
| OV4-5 | low | pre-existing | `fitBudget` was given `candidates.length`, which includes the baseline, so the CLI said "candidates: 4,736" and then "4,737 candidates are many". | fixed, `6df91603`: the note says "plans (the baseline included)", the right count since the baseline runs every round; the parameter, its doc comment and optimizer.md's Budgets say so; a test on the wording |

### The numbers after this round

The default searches (`quick`, seed 1, 8 threads, `--confirm` on seed 2654435770, 40,000 fights
each; logs in this worktree's `.cache/probes/ov4/`). The screens' verdicts are identical to the
fourth verifier's, so only the space changed:

| Spec | Space before → after | Result | Confirmed vs the default |
| --- | --- | --- | --- |
| Protection warrior | 4,735 → **3,690** builds (3,691 candidates), 24 dimensions (23 objective + Toughness) | the same build, `35300003-05-502031033300210531` (Improved Rend 0→3, Deep Wounds 0→3, Improved Thunder Clap 0→3 for Anticipation 5→0, Toughness 1→0, Master of Defense 2→0, Vanguard 1→0); separated after 3 rounds, +4.67 in the race | **+4.43** (+4.35 to +4.50), unchanged; +4.64 with ratings ignored |
| Protection warrior, `--screen-fights 3000` (Anticipation harmful) | 4,388 → **3,412** builds, 3,287 with Anticipation 5 (unchanged) | the same build; separated after 3 rounds, +4.75 in the race | (not run) |
| Protection paladin | 8,918 → **6,833** builds and candidates | the same build, `050003-0530213321301511-50205` (Anticipation 5→2 among its changes); separated after 5 rounds (was round 0), +6.54 in the race | **+6.48** (+6.40 to +6.56), unchanged |
| Feral bear | 129 builds, unchanged (no preferred filler) | the setup itself | nothing to confirm |
| The OV4-1 repro | 2 → **1** build | the setup itself (was `35-05-512501233301210531`) | nothing to confirm |

In every space, no build has Toughness above 0 with Anticipation below 5 (the verifier's
`twins.mjs` and `space.mjs`, run on this branch against its reports: 0 twins).

Checks: lint and typecheck clean; `npx vitest run src/sim/optimize src/sim/run` 87 passed; `npm
test` 2,632 passed and 6 skipped. No UI changed, so no e2e run or screenshots.

## User decision: goals, no talent rules

After the fifth verification (OV5; its probes in the O1 worktree's `.cache/probes/o1-verify5/`)
the user decided (D30's superseding paragraph): "The optimizer shouldn't have any X before Y rules
for specific talents. The optimizer should be told to optimize for defense, DPS, TPS, or a balanced
approach and run all the possible iterations of talents, or gear, or rotation, and find the best
outcome objectively." They also chose to remove the tanks' survival floor. `9a98bacc` does both.

- **Goals** ([optimizer.md](../optimizer.md#goals)): `defense` (the least damage taken a second,
  TPS breaking a tie; a tank's only), `dps`, `tps` (the least damage taken breaking a tie) and
  `balanced` (ΔTPS% + ΔDPS% against the default; DPS alone for a DPS spec). Every score is higher
  when better (Defense's is minus the damage taken), so the race, the elimination and separation
  bars and the confirmation need no sign of their own. The race merges what the goal can't tell
  apart and breaks ties by the goal's tie-break; the screen's `survival` role is now `tie-break`,
  with its measured tie-break effect. CLI `--goal`; the JSON carries `goal` and `scoredGoal`.
  Defaults: tanks Balanced, DPS specs DPS.
- **No talent rules:** `SURVIVAL_FLOOR`, `PREFERRED_FILLER` and `floor.ts` are gone, with the
  preferred filler's fill-order place, OV4-1's constraint-only narrowing (`constraintOnly` in
  `emit`) and `--no-floor`. Fillers take spare points by their measured tie-break. Maximality is the
  one pruning rule, and a measured one. The effective-health floor (on by default for a tank, as D30
  set it) and crit and crush immunity stay as sheet constraints; the tank tree's 31 points stays (a
  tree rule). The class docs' floor sections and `defaults.test.ts`'s floor check are gone.
- **Tests:** the preferred-filler, OV3-1 and OV4-1 tests are replaced by a fill order that follows
  the measured tie-break whatever the talent's name, and by OV5-1's repro (both the default and its
  Toughness-over-Anticipation twin race). New tests for each goal: the scores and tie-breaks, the
  defaults, Balanced for a DPS spec, Defense refused for one; toy races for Defense (the least
  damage taken leads, its score +50 for 50 less taken; ties merged on damage taken, TPS breaking
  them) and TPS; the warrior for Defense on the real engine (Toughness objective, Defiance a
  tie-break, the answer takes less damage, confirmed on a fresh seed); the bear for TPS.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| OV5-1 | medium | introduced by `e43e686d` (OV4-1's narrowing) | The narrowing lost feasible builds: a Toughness-over-Anticipation build the effective-health floor needed never raced. | resolved by the removal, `9a98bacc`: no rule ties Toughness's ranks to Anticipation's; the repro is a unit test (both builds race) |
| OV5-2 | low | pre-existing | `firstRound`'s parameter was named `candidates` though it's given plans, the baseline included. | fixed, `9a98bacc`: `plans`, with its doc comment, and optimizer.md's first-round text and worked examples say plans |
| OV5-3 | low | pre-existing | optimizer.md's Budgets table headed its first column "Candidates" for a count of plans. | fixed, `9a98bacc`: "Plans (the candidates and the baseline)", and the text under it says plans |
| OV5-4 | low | pre-existing | The CLI printed "1 builds", "1 survivors", "after 1 rounds". | fixed, `9a98bacc`: a `plural` helper for every count the CLI prints with a noun |

### The numbers after this change

`quick`, seed 1, 10 threads, `--confirm` on seed 2654435770 (40,000 fights each); logs and reports
in this worktree's `.cache/demos/`. The effective-health floor (90%) holds for each tank search.

| Spec | Goal | Space | Answer against the default | Confirmed |
| --- | --- | --- | --- | --- |
| Protection warrior | Balanced | 2,087 builds, 24 dimensions | Unbridled Wrath 5, Enrage 5, Booming Voice 5, Toughness 1→3 for Deflection, Anticipation, Last Stand, Improved Shield Wall, Improved Heroic Strike and Vanguard; separated after 8 rounds | **+10.49 points** (+10.37 to +10.60): TPS +44.7, DPS +26.6, taken +62.8 a second; +10.33 with ratings ignored |
| Protection warrior | TPS | 700 builds, 23 dimensions | no Shield Slam (screened harmful for TPS, −30.5), Deep Wounds 3, Improved Rend 3, Improved Tactical Mastery 5, Toughness 1→4, no Deflection, Anticipation or cooldowns; separated after 1 round | **+66.4 TPS** (+66.0 to +66.9), DPS −81.3; +63.5 with ratings ignored |
| Protection warrior | Defense | 222 builds, 17 dimensions | Toughness 1→5, Improved Thunder Clap 3, Improved Disarm 3, Improved Charge 2; keeps Deflection 5, Anticipation 5 and Shield Slam; drops Shield Specialization, Master of Defense, Focused Rage and Improved Shield Wall; separated after 2 rounds | **32.2 less damage taken a second** (−4.4%), TPS −265.4 |
| Protection warrior, `--require "ehp>=103%"` | Balanced | 2,087 builds, 304 left out | as Balanced but Toughness 5, Boundless Rage 3, Booming Voice 2, no Improved Bloodrage (EHP 13,910, 103.5%); separated after 11 rounds | **+9.67 points**, taken +48.8 |
| Protection paladin | Balanced | 23,841 builds, 31 dimensions | Divine Strength 5, Anticipation 2→5, Benediction 5, Conviction 5 for Improved Holy Strike, Improved Righteous Fury, Sacred Duty, Deflection and two Iron Creed ranks; separated after 7 rounds | **+7.65 points**: TPS +25.3, DPS +20.6, taken +114.7 |
| Protection paladin | Defense | 15,135 builds, 24 dimensions | Toughness 5, Anticipation 2→5, Divine Intellect 4, keeping Improved Righteous Fury, Deflection, Iron Creed and Holy Shield; no Reckoning, Improved Seals or 1HWS; the budget ended with 89 unseparated (the closest +0.25 ± 1.09) | **63.5 less damage taken a second** (−7%), TPS −111.3 |
| Feral bear | Balanced | 303 builds, 20 dimensions | Feral Instinct 3, Nature's Focus 5, Naturalist 5 for Heart of the Wild, Feral Swiftness and Natural Reaction; keeps Thick Hide; separated after 4 rounds | **+6.56 points**: TPS +28.9, DPS +21.7, taken +69.5 |
| Fury warrior | DPS | 288 builds, 20 dimensions (unchanged) | Precision 3, Improved Execute 2, Improved Overpower 2, Deflection 2, Booming Voice 2 for Deep Wounds, Impale, Improved Rend and Improved Cleave; separated after 1 round | **+27.4 DPS** (+3.9%) |

**For the reviewers:**
- **Plausibility of Defense.** The warrior's and paladin's Defense answers take what a pure-defense
  tank takes where the sim measures it: Toughness 5, Anticipation 5, Deflection 5 (and the
  paladin's Improved Righteous Fury and Holy Shield), and they give up threat for it (−21% and −13%
  TPS). They drop what the sim can't measure: Last Stand and Improved Shield Wall (cooldowns the
  rotation never presses) and Sacred Duty's cooldown part, as every goal does. A real pure-defense
  build keeps those; the sim is indifferent to them. The warrior's Defense answer also drops Shield
  Specialization (screened −0.04 ± 1.61 for Defense: its extra blocks barely move damage taken in
  the model) and takes Improved Thunder Clap (its attack-speed slow is modelled). Worth a look.
- **TPS without Shield Slam.** For TPS the screen calls the warrior's Shield Slam harmful (−30.5 TPS
  at max rank, in every context), so the TPS answer drops it; for Balanced it's the most valuable
  talent (+31.7 points, all of it DPS). That's the model's Shield Slam threat against the rage it
  takes from Heroic Strike and Revenge; a plausibility question for the warrior's threat model
  (threat.md, warrior.md §4.3), not for the optimizer.
- **Balanced drops survival talents.** With no floor, the tanks' Balanced answers drop Deflection,
  Anticipation (the warrior's), Improved Righteous Fury, Sacred Duty and the bear's Heart of the
  Wild and Feral Swiftness, for 8–11% more damage taken. That's the user's "objectively" by the
  Balanced goal; D29's "tanks talent for the balanced approach, never pure defense" is about
  defaults, which O4 sets.
- **The effective-health floor stays on by default for tanks.** D30 set it "on by default", and
  the superseding paragraph keeps sheet constraints "as options the player sets". Read here as
  unchanged (`--no-ehp-floor` drops it); if the user meant it off by default, it's one line in
  `defaultConstraints`.
- **OV5-2 and OV5-3** were given as one line in the brief ("rename `firstRound`'s `candidates` to
  `plans`, and the Budgets table heading"); they're split here that way.

Checks: lint and typecheck clean; `npx vitest run src/sim/optimize src/sim/run src/worker` 186
passed; `npm test` 2,859 passed, the one-core Fury benchmark failing only under the machine's load
(load average 23) and passing rerun alone; `scrape:check` matches. No UI changed, so no e2e run or
screenshots.
