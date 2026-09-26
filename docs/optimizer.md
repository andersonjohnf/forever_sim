# The optimizer

The sim finds the best talents, gear and rotation settings for a setup itself, rather than assuming
them, as Raidbots' Top Gear does for gear
([D30](decisions.md#d30-the-sim-finds-the-best-talents-gear-and-rotation-itself-defaults-are-its-results-2026-09-24)).
The player tells it what to optimize for, [Defense, DPS, TPS or Balanced](#goals), and it takes
the best by that goal, measured. This doc owns its method: how candidates are compared, what each
goal scores, which constraints it keeps, how the talent space and the gear search are built, and
how a spec's defaults come from its results.

**Status (O1, 2026-09-24):** the search core, the talent space, rotation settings as candidates,
the four goals, constraints with effective health and crit and crush immunity, and the command
line (`npm run optimize`), with the review's and the verifications' fixes
([review log](reviews/2026-09-24-optimizer-o1.md)); the setup is only ever the baseline, never an
answer (user decision); the leader is the answer, and the race takes no result limits (step 6 of
the review, D30); a search has a hard ceiling on fights and builds, and past it narrows to max
ranks and says so (D30, user decision; [budgets](#budgets)). **No talent-specific rules** (user decision after the fifth review round, D30):
there's no survival floor and no preferred filler, and no talent is kept, dropped or ordered by its
name; every talent is judged by what the screen measures it doing for the goal. The app's Optimize
flow is O3, and defaults set from the results O4 ([milestones](milestones.md)). The code is
`src/sim/optimize/` (pure TypeScript, seeded, no DOM) and
[`scripts/tune/optimize.mjs`](../scripts/tune/optimize.mjs).

**Status (O2, 2026-09-25):** [the gear search](#gear), D30's build plan of 2026-09-25: each slot's
candidates from the pool under the player's filters (item level, sources, faction, locked slots),
ranked by the setup's own stat weights or a measured swap; enchants with their slot, Unique rules,
a two-hander against a main and an off hand, a shield tank's shield, set pieces swapped in together;
coordinate ascent with O1's race, restarts from the default preset and a greedy set, and a final
race; and [talents, gear and rotation in turns](#talents-gear-and-rotation-together) until stable
(`--search gear`, `--search all`). Not yet reviewed.

**Data build.** O1 was built and reviewed on 1.60.1.69913's data and talent trees, then merged onto
1.60.1.70009's: the paladin's Improved Holy Strike and Crusade gone, the shaman's Elemental swap,
the Feral renames (Mangle is Primal Bite, Primal Fury Blood Frenzy), Shield Slam's "very high"
threat, and the new default talents ([talents.md](data/talents.md#tree-versions)). The spaces and
answers below are 70009's; a figure marked **(69913)** is the earlier build's, kept as the record of
the review round that measured it.

## Contents

1. [The steps](#the-steps)
2. [Fights and runners](#fights-and-runners)
3. [Goals](#goals)
4. [The statistics](#the-statistics)
5. [Racing](#racing)
6. [Constraints](#constraints)
7. [Which talents matter](#which-talents-matter)
8. [The talent space](#the-talent-space)
9. [Talents and rotation together](#talents-and-rotation-together)
10. [Gear](#gear)
11. [Talents, gear and rotation together](#talents-gear-and-rotation-together)
12. [Budgets](#budgets)
13. [Confirmation](#confirmation)
14. [Defaults from the results](#defaults-from-the-results)
15. [Reading the results](#reading-the-results)
16. [Limits of the method](#limits-of-the-method)
17. [Worked examples](#worked-examples)

## The steps

`optimize()` (`src/sim/optimize/optimize.ts`) takes a setup, a [goal](#goals), what to search,
the constraints and a budget:

1. **Screen** the class's talents for this setup and goal: which ones the sim can measure
   ([below](#which-talents-matter)). Only when talents are searched.
2. **Build the candidates:** every sensible talent build under the constraints
   ([below](#the-talent-space)), each with the start's own rotation and with every rotation
   variant given, and beside them the setup itself and the **start**, where the search begins (a
   pass of a search [in turns](#talents-and-rotation-together) starts from the last pass's
   winner). Two candidates that make the same setup race once.
3. **Hold every candidate to every constraint**, the same way for each: the talent constraints
   (kept and excluded talents, the trees' minimums), checked on its build;
   and the sheet constraints (effective health, crit and crush immunity), checked on its character
   sheet before any fight. A candidate that breaks one is left out. The race takes no limits on
   fight results ([constraints](#constraints)).
4. **Race** the candidates on common random numbers until the leader is clear of the rest at 95%
   or the budget runs out ([below](#racing)), beside the **baseline**. The budget and the first
   round are fitted to the number of candidates first, within the search's hard ceiling on fights
   and builds, and the fights and time it can take are told before the race starts
   ([budgets](#budgets)).
5. **Answer** with the race's leader (`race.leader`), the best mean by the goal.
6. **Confirm** the answer against the baseline on a fresh seed (D23; the CLI's `--confirm`).

**The baseline is only a measuring stick** (user decision). It's the setup as it is (the spec's
current default, unless the caller changed it): it runs every round, so every candidate's change is
paired with it fight for fight, and `balanced` is measured against it, but
it's never an answer. The setup can still win, as a regular candidate: a copy of it races like any
other when it meets every constraint, and leads if it's the best. That copy is the baseline's own
plan on the same seed, so it takes the baseline's fights rather than running them again
([racing](#racing)). When it breaks one (a search that excludes a talent the default takes, or
keeps one it lacks), it's only the baseline, and the CLI says which it breaks.

**No setup meets these constraints.** If every candidate breaks a constraint, there's no answer:
the report's leader is null and `blocked` names what blocks, a line a constraint. A sheet constraint no candidate reaches gives the
closest one's value ("crit immune: no candidate reaches the defense it needs on this gear; the
closest has 330 defense, leaving the boss 4.40% crit", the paladin's default gear); sheet
constraints each met but never together say so. When no legal build fits the talent
constraints at all (the space is empty), it says so and lists them together: the kept and
excluded talents and the trees' minimums ("no legal 51-point build fits the talent constraints
together: kept talents (Moonkin Form 1); at least 31 points in Feral Combat"). The baseline still
runs its first round, so the report has its numbers.

The same inputs and seed give the same result, on any number of threads.

## Fights and runners

A single run merges its fights into means as it goes (`sim/run/driver.ts`). A comparison needs
each fight's own numbers, so the optimizer asks for one sample per fight: DPS, TPS and damage
taken per second (`FightSamples`, `runFights`). Fight _i_ seeds its random streams from the
master seed and _i_ alone ([architecture](architecture.md#iterations-determinism-and-workers)),
so fight _i_ of one candidate and fight _i_ of another share their fight length and their random
streams. That's **common random numbers**: the spread the two share cancels in their difference.
Less of it is shared than one might hope, since two builds soon act differently and then draw
their rolls in a different order, but it still pays ([the statistics](#the-statistics)).

A `FightRunner` runs a candidate's fights _from_ … _from + count − 1_ wherever it likes:

| Runner | Where | Used by |
| --- | --- | --- |
| `localFightRunner` | this thread, a job at a time | tests; the app where there are no workers, or they failed to start in two runs or searches in a row (`optimizerRunner`, OG-6) |
| `WorkerPool.fightRunner` | the app's worker pool (`sim/run/pool.ts`, the worker's `fights` message) | the app (O3), through `optimizerRunner` (`src/sim/index.ts`) |
| `threadRunner` | Node worker threads | `scripts/tune/optimize.mjs` |

Each lane keeps a few engines by plan key, least recently used out (`EngineCache`, 48 a lane), so
a candidate's later rounds reuse its engine. The pool and the CLI mirror each worker's cache (the
same operations in the same order), so a plan (about 17 KB) is sent only to a worker that lacks
it. A plan costs about 0.3 ms to build and an engine about 0.5 ms, so thousands of candidates are
cheap to set up. A search shares the pool with the app's runs: a run's cancel terminates the
workers busy with its chunks, and a search's jobs on them are sent again elsewhere rather than
failed (OG-5; [architecture](architecture.md#iterations-determinism-and-workers)).

## Goals

The player picks what to optimize for (D30, user decision after O1's fifth review round:
"optimize for defense, DPS, TPS, or a balanced approach ... and find the best outcome
objectively"). Every goal's score is **higher when better** (`scorer`, `src/sim/optimize/objective.ts`),
so the race's leader, its drops, its separation and the confirmation's bar read the same way for
each; Defense's score is minus the damage taken, so a positive change is less damage taken.

| Goal | Scores | Ties broken by | Default for |
| --- | --- | --- | --- |
| `defense` | − damage taken per second (the least) | the most TPS | (on request; tanks only) |
| `dps` | DPS | the least damage taken | DPS specs (D30) |
| `tps` | TPS | the least damage taken | (on request) |
| `balanced` | 100 × (TPS ÷ TPS₀ + DPS ÷ DPS₀) | the least damage taken | tanks (D30) |

- **Defense** minimizes the damage taken per second the sim measures: the health lost to the
  boss's hits, after armor, avoidance, block and every modelled cut, averaged over the fight (the
  tank results' damage taken, [encounter.md §5](mechanics/encounter.md)). TPS breaks a tie. It's a
  tank's goal: the boss attacks only a tank, so a DPS spec takes no damage, and the optimizer
  refuses it for one (`scoredGoal`). What the sim can't measure isn't in it: a defensive cooldown
  the rotation never presses (Last Stand, Shield Wall) changes nothing measured, so Defense is
  indifferent to it, as every goal is.
- **DPS** and **TPS** maximize that metric; the least damage taken breaks a tie.
- **Balanced** is D30's "TPS and DPS as equals: the sum of each one's change relative to the spec's
  current default", with TPS₀ and DPS₀ the baseline's means. The baseline scores about 200, and a
  difference of 1 is one percentage point: +3% TPS and −1% DPS is +2 points. TPS₀ and DPS₀ are the
  baseline's means over the fights run so far, the same for every candidate in a round, and taken
  as constants in the intervals. It's D28's Balanced aim too. **For a DPS spec, Balanced is DPS
  alone** (`scoredGoal`): its threat is its damage times a fixed factor, so weighing both would
  count DPS twice. The report keeps the goal the player picked (`goal`) beside the one it scored
  (`scoredGoal`).

**Defaults:** a tank's goal is Balanced, a DPS spec's DPS (`defaultGoal`). The CLI's `--goal`
picks another. The goal decides what the screen measures too
([below](#which-talents-matter)): a talent that changes only damage taken is a tie-break for
Balanced, and objective for Defense.

## The statistics

Each candidate's fights are paired with the baseline's and with the leader's, fight by fight. For
two candidates _a_ and _b_ over _n_ shared fights, the difference is the mean of _aᵢ − bᵢ_ and its
interval ± _z_ × the standard deviation of the differences ÷ √_n_ (`pairedInterval`). Every
interval reported is 95% (_z_ = 1.96). Measured on the bear, its default against the build that
won its search, 4,000 fights (69913): the balanced score's per-fight standard deviation is 14.6 points
for each on its own and 14.1 for their paired difference, so the paired interval is ±0.44 points
where two independent runs would give ±0.64. Pairing needs about half the fights, and it makes the
candidates' differences the same fights' differences, which a race's round-by-round decisions
rely on.

## Racing

`race()` (`src/sim/optimize/race.ts`) runs in rounds:

1. Every survivor runs the same fights up to the round's count: the first round's (see
   [budgets](#budgets)), then twice as many each round. The baseline runs every round beside
   them, so every candidate's change from it is paired on the same fights; it's never a survivor,
   and never leads, drops another or is dropped. The setup's copy (`copies`: the baseline's own
   plan, racing as a candidate) runs no fights: it takes the baseline's, which are the fights it
   would have run, so it costs the budget nothing and stays paired with every candidate.
2. **First round only:** candidates the goal can't tell apart on any fight are one candidate: the
   same numbers its score reads on every fight (`scoreReads`: DPS for DPS, TPS for TPS, both for
   Balanced, damage taken for Defense). The one
   with the best tie-break represents them (D30: what the score leaves out is a tie-break; the
   least damage taken, or for Defense the most TPS), then the earlier one; the others are listed as
   its ties.
3. The **leader** is the survivor with the best mean score (the goal's tie-break breaks an exact
   tie, then the earlier candidate). Every survivor met every constraint before the race, so
   any may lead: the race takes no limits on fight results. With no candidate at all, the race
   ends with no answer (`none`).
4. A survivor whose paired interval against the leader lies wholly below zero at the
   **elimination bar** is dropped. The leader is the best of many noisy means, so it's usually one
   that got lucky (the **winner's curse**): with thousands of survivors, the luckiest is several
   standard errors up, and an ordinary 99% bar would knock the true best out far more often than
   1% of the time (the review's probe: 3,000 candidates level and the best one standard error
   ahead, over a first round of 61 fights: it dropped the best 21 times in 100). So the bar
   is corrected for how many there are: z is Student's t quantile at an upper tail of
   0.5% ÷ _k_, with _k_ the survivors compared with the leader that round (Bonferroni) and _n_ − 1
   degrees of freedom for _n_ fights (`eliminationZ`, `src/sim/optimize/objective.ts`). With one
   survivor against the leader and many fights it's the plain 99% bar, 2.576; 7,311 survivors over
   61 fights give 5.37.

   **What that guarantees:** in any one round, the chance that the true best (the candidate with
   the highest true mean) is dropped is at most 0.5%, however many survivors there are, if each
   paired difference's mean is normal with the spread its fights show. That's the union bound: the
   true best is dropped only if some survivor beats it by the bar, and each of the _k_ has at most a
   0.5% ÷ _k_ chance, since none truly beats it. Over a race of _r_ rounds the chance is at most
   _r_ × 0.5% (the races so far run 1 to 7 rounds). The model is an approximation: a fight's score
   difference isn't exactly normal, and Student's t covers only the spread being estimated from a
   few fights. What the race doesn't guarantee is that the leader is the true best when it ends on
   the budget; that's what the separation bar, the unseparated survivors and
   [confirmation](#confirmation) are for.
5. The race ends **separated** when the leader's paired 95% interval against every survivor lies
   above zero, D23's bar, or **budget** when the next round no longer fits: the last round then
   runs as many fights as the budget has left, the same for every survivor. A budget ending names
   the survivors the leader isn't clear of at 95% (`unseparated`: a survivor the elimination bar
   kept but the leader is clear of isn't one), and the closest of them with its paired interval
   behind the leader (`closest`).

Everything is decided at a round's end over whole arrays, and each job's samples go to fixed
positions, so neither the number of lanes nor the order jobs finish in changes anything.

## Constraints

What the sim can't value in the score is a constraint or a tie-break, never a guess (D30). A
constraint is a limit on a number, absolute or a share of a **reference** setup's (the baseline's
unless the caller names another). The CLI writes them `name>=value` or `name<=value`, with `%` for
a share (`src/sim/optimize/constraints.ts`).

Every constraint reads the **character sheet**: `ehp`, `health`, `armor`, `stamina`, `defense`,
`dodgePct`, `parryPct`, `blockPct`, `blockValue`, `critReductionPct`, `hitPct`, `critPct`,
`attackPower`, `bossCritPct` and `bossCrushPct` (below). Sheet values are exact and need no
fights, so a candidate that misses one is left out before the race.

**No limits on fight results** (D30; simplified at step 6 of O1's review). A limit on DPS, TPS or
damage taken per second would have to be judged with its interval in the race, and two review
rounds in a row found new problems in doing so (a leader over a limit by its mean alone dropping a
feasible candidate, then the counts of what was outside). D30 already rules out a damage-taken cap,
so they were cut: `parseConstraint` refuses `dps`, `tps` and `taken` with a line that says so.

**Effective health** (D30, user decision) is max health ÷ (1 − armor's damage reduction against
the boss's level): the physical damage it takes to kill you. It uses the plan's armor and the
engine's own `armorReduction` ([damage-and-timing §1](mechanics/damage-and-timing.md#1-armor)).
Avoidance and block aren't in it: they lower average damage but don't survive a spike. A tank's
search keeps **at least 90% of the reference's effective health** by default (`EHP_FLOOR`,
`defaultConstraints`); the CLI's `--no-ehp-floor` drops it and `--require "ehp>=95%"` changes it.
A talent search's reference is the baseline, the spec's default gear and build; a gear search (O2)
passes the class's survival preset, the v1 tank gear.

**Crit and crush immunity** (D30, user decision; both **off by default**) replace the damage-taken
cap decided earlier the same day: a share of a pure-survival set's damage taken measures against a
set no tank wears, so a tank's defaults have **no damage-taken cap** (`defaultConstraints` is the
effective-health floor alone). What matters beyond effective health is whether the boss can crit
or crush you, read from the same boss table the engine rolls and the Results show
([combat-tables §8](mechanics/combat-tables.md#8-boss--player-tanks): `sheet.bossTable`, from
`bossOutcomeShares`):

- **Crit immune** (`--crit-immune`, `CRIT_IMMUNE`, `bossCritPct<=0`): the boss's crit chance
  against you is 0, `5% + (315 − defense) × 0.04%` at or below zero: **440 defense**. It reads
  the table with no block buff up: only defense pushes crits off, and an immunity that held only
  while Holy Shield is up wouldn't be one.
- **Crush immune** (`--crush-immune`, `CRUSH_IMMUNE`, `bossCrushPct<=0`): your miss, dodge,
  parry and block (each less 0.6% for the boss's 315 skill) fill the table before its crushing
  blows: 102.4% on the sheet at 440 defense. A bear can't reach it without block. A tank whose
  rotation keeps a block buff up (a Protection paladin's Holy Shield) is judged on the table with
  it up, the Results' second table ([ux.md](ux.md#results)), since that's what most of the
  fight's swings roll on (`immunityTables`); it's the paladin's classic way to be uncrushable.

Shares under 1e-9 points (the table's rounding at 100%) count as none. Every reported result shows
its health, effective health, damage taken, and the boss's crit and crush chances.

Why it matters: survival costs a tank threat in Forever. Rage from a hit taken divides by max
health, and an avoided hit gives none ([rage.md](mechanics/rage.md#rage-from-damage-taken)), so
TPS alone would build a glass cannon. The talent screen finds exactly that for the bear's Heart of
the Wild ([below](#which-talents-matter)). A player who wants survival first picks the
[Defense goal](#goals); the sheet constraints keep a floor under the others.

A talent that changes what a constraint reads is searched, whatever it does to the score
([the talent space](#the-talent-space)), **where the constraint could bind without it** (OG-1):
with the effective-health floor, a talent that adds armor or health is then a search dimension,
not a filler that only gets leftover points; under crit immunity, so is one that adds defense.
That reads the character sheet, never the talent's name. The check is exact where talents'
effects add up (maximality's own assumption, [below](#the-talent-space)), not a guess: the space is
built first with those talents as fillers, and if every build in it (with every rotation variant)
meets every sheet constraint, they stay fillers, since searching them would only add builds that
give up objective points or tie-break for a limit already met (the report's
`space.notBinding`; the CLI lists them as "not searched for the constraints"). Otherwise they're dimensions
(`space.constrained`). The Protection paladin's default floor never binds in a talent search, so
Toughness and Sacred Duty stay fillers; searching them had made its space 23,841 builds for the
same leader as 1,254 (69913). A bear's Thick Hide armor is modelled (BR6,
[druid.md §4.7](classes/druid.md#47-bear-armor-low-priority-tps-doesnt-need-it)), so it's in the
bear's effective health.

## Which talents matter

`screenTalents` (`src/sim/optimize/screen.ts`) judges every talent the same way, by what it
measurably does for the goal, never by its name. It takes each talent off (rank 0) and on (max
rank) in a few contexts: the setup's own build, and a build with every talent at max, so a talent that
acts only with another one shows up (Improved Revenge with Revenge, Berserk with Primal Bite); each with
the setup's rotation and every rotation variant the search tries. Then:

1. If the plan is the same with and without it in every context, it changes nothing: the engine is
   a function of the plan alone. No fights are needed. It's **none**.
2. Otherwise the two plans run the same 400 fights. If the numbers the goal's score reads (DPS for
   DPS, TPS for TPS, both for Balanced, damage taken for Defense; each goal only its own, OG-4) are
   equal on every fight in every context, it's **tie-break** when the goal's tie-break differs and
   **none** when not. So for a Retribution paladin's DPS, Iron Creed, which only adds Holy Strike's
   threat, is **none**. For Balanced, Toughness is a tie-break
   talent (armor from items lowers damage taken, but Forever's rage from a hit reads it before
   armor); for Defense it's objective, and Defiance, which changes threat but not damage taken, is
   a tie-break talent.
3. Otherwise it's **objective**, unless its paired change in score is below zero with 95%
   confidence in every context where it acts: then it's **harmful**. For Balanced the bear's Heart
   of the Wild is: its 20% Stamina costs rage from every hit.

The screen also notes which of the sheet's numbers each talent changes (health, armor, effective
health, the boss's crit and crush chances, …), from the plans alone, for the constraints. Each
plan's fights go to the runner in jobs of at most 250, as the race's do (`SCREEN_JOB_FIGHTS`), so no
job outlasts the pool's awake-time watchdog on a slow phone however large `--screen-fights` is
(OV4-3); a fight's numbers depend only on its plan and index, so the split changes nothing. A few
jobs are in flight at a time (twice its lanes, as the race keeps), each started only if the search
hasn't been cancelled, so a cancel stops it within a job or two a lane.

The contexts' builds aren't legal (the plan builder doesn't need them to be). The screen's
effect, the change in score with the talent at max rank, divided by its ranks, is its **score per
point**, which orders where leftover points go among the objective talents (below). Its
tie-break effect (`tieEffect`: less damage taken, or more TPS for Defense, at max rank), divided
by its ranks, orders the rest.

## The talent space

`talentSpace` (`src/sim/optimize/talents.ts`) builds every *sensible* build under the constraints,
not every legal one, which would be astronomically many: every legal build that could win, with all
51 points spent, where builds the goal can't tell apart count once. **Every talent is treated
alike** (D30, user decision after O1's fifth review round): what the screen measured it doing for
the goal decides its part, never its name. There's no survival floor, no preferred filler and no
talent kept by default.

- **Objective talents are the search.** Each is at 0 or its max rank in a build's **core**, and
  **one talent a build may be at any rank** (`searchPartials`, the default; OG-2). A talent's ranks
  needn't add up to its max rank's effect: the warrior's Boundless Rage screened −0.18 points at
  3/3 for Balanced, so leftover points never went to it, yet Booming Voice 3 and Boundless Rage 2
  beat the max-rank search's leader (Booming Voice 5) by +0.42 ± 0.13 points, paired (69913). On
  70009 it screens −0.69, and the answer is Booming Voice 4 with Boundless Rage 1. Searching
  every rank of one talent is what keeps "every legal build that could win" true without trusting
  the screen's per-point value; the alternative, screening each rank and searching the ranks of a
  talent whose effect isn't flat, would rest on 400 fights telling a small curve from noise. One
  whose screened effect is below zero, though not clearly enough to be harmful (the warrior's
  Anticipation for Balanced; the bear's Feral Swiftness (69913), harmful on 70009), is never forced by the maximality rule below nor given leftover points: builds with
  and without it, and with each of its ranks, race. The CLI's `--no-partials` searches max ranks
  only. Only objective talents' ranks are searched (OGV-1): a dimension only a constraint made has
  no screened value to search its ranks by (below). A space whose partial ranks pass the search's
  ceiling, 200,000 builds or more plans than the fight cap races at 50 fights each, **narrows to max
  ranks**, and the report says so ([budgets](#budgets)).
- **So is a talent a constraint reads, where the constraint could bind.** One that changes a sheet
  number a constraint reads (Toughness's armor, Sacred Duty's health, under the effective-health
  floor) is a dimension too, whatever its role, so builds with and without it both race, unless
  every build made without it as a dimension meets the constraints already
  ([constraints](#constraints), OG-1). It has no screened value, so it's never forced by the
  maximality rule, and it's at **0 or its max rank** in a build's core, never a searched partial
  rank (OGV-1): searching its ranks multiplied the space for ranks the screen can't order, and a
  space that large fell back to max ranks everywhere, dropping the objective talents' partial ranks
  with them. The warrior under `ehp>=103%` is the case: 52,506 builds with Toughness's ranks
  searched, too many for `quick` then, so its max ranks raced and missed Booming Voice 3 with
  Boundless Rage 2, +0.36 ± 0.10 points over the leader it found, paired (69913); with Toughness at
  0 or 5 it's 46,814 builds, and that build races. 70009's screen makes the same 46,814, and its
  answer has partial ranks too (Booming Voice 4, Boundless Rage 1, Toughness 5). The fill can still give it leftover points, by its
  tie-break (below). A harmful one (Heart of the Wild, for Balanced) is searched but never given
  leftover points.
- **Leftover points go to partial ranks, then by the tie-break.** Points the core leaves go first
  to partial ranks of objective talents, where the sim measures them, the most score per point
  first; then to the talents that can't change the score (tie-break and no-effect talents, and
  the partial ranks of a dimension only a constraint made), in the order of their measured
  tie-break (`byTieBreak`): those that help it first, the most a point first; then those with no
  effect; then those that hurt it. Then the spec's own tree, the shallower tier, and code order.
  So for Balanced, a talent that lowers damage taken takes spare points before one that does
  nothing, and for Defense one that adds threat does. With a searched partial rank, the fill still
  gives leftover points to the other objective talents' partial ranks, so a build can hold two.
- **Tier gates and arrows** (5 points a tier in the lower tiers of the same tree; an arrow's
  prerequisite at max rank, [talents.md](data/talents.md#tier-gates)) are met with fillers where
  the core doesn't meet them, the least needed. A prerequisite that isn't objective comes with its
  talent (Concussion Blow with Shield Slam).
- **Constraints:** a tree's minimum points (`--min-tree Protection=31`), talents kept at a rank
  (`--keep`) and excluded (`--exclude`); none by default but the tank tree's minimum. A tank's
  search spends **at least 31 points in its tank tree** unless told otherwise (D30; `TANK_TREE`,
  `src/sim/optimize/optimize.ts`): Protection for the warrior and paladin, Feral Combat for the
  bear. It's a rule on a tree's points, not on any talent. `--min-tree` merges with it: a minimum
  for the tank tree replaces its 31 (`--min-tree Protection=0` drops it), and one for another tree
  joins it.

**What the space leaves out, and why** (OG-9). Three rules narrow it, each stated here:

- **Harmful talents are never taken**, not as a dimension, not for leftover points, not even to
  fill a tier gate, unless kept or searched for a constraint. The screen found each one lowering the
  score with 95% confidence in every context where it acts, so a build that takes it scores below
  the same build with those points elsewhere.
- **The tank tree's 31 points** are a default constraint (above), not a finding: a tank's search
  never tries a build with fewer, unless told to with `--min-tree`.
- **Maximal builds only**, a pruning rule that's objective. A point in a filler is, to the goal, a
  spare point: it can't change the score. So if another objective talent that the screen didn't
  measure below zero fits at max rank in the points the fill would give to fillers, the build that
  takes it scores at least as well, and only that one is kept. **Only the fillers' points count**
  (OG-3): the fill gives leftover points to objective talents' partial ranks first, and a cheap
  raise of a weak talent in their place could cost more than it gains. The review's toy: with 4
  points outside Protection, Deflection at 1 a point and 5 ranks, Improved Rend at 0.01 a point and
  3, the raise of Improved Rend (3 points) had shadowed Deflection 4; now it dominates only where
  it fits in filler points, and Deflection 4 races. A dimension only a constraint made has no
  screened value, so it's never a raise, and a core that leaves room for it keeps its points for
  the fill order instead of being dropped. The check is one talent at a time: a build that could
  only do better by swapping one talent for another stays, and the race decides.

**One tree at a time.** Tier gates and arrows never cross trees; only the 51-point total does. So
each tree's cores are enumerated alone, each with the least points it can be legal in and the
fewest extra points any one more objective talent would cost, and cores are combined across trees
by points. A combination is kept when the points its fill gives to fillers are fewer than every
tree's cheapest raise. A fill that gives more than a talent's ranks less one to objective talents
takes some talent to max rank, and the core with that talent at max, filled, gives a build at least
as good (the same build, unless a tier gate made the fill skip a talent and come back to it), so
only combinations within that many points of the cheapest raise are tried.

Every build is checked with the app's own `validateTalentBuild`, encoded with `encodeTalentCode`,
and must decode back to the same ranks.

**Sized before it's listed** (OGV-5). `talentSpaceSize` runs the same enumeration and counts the
builds, keyed by their ranks, without encoding, validating or listing them, and stops counting past
a limit. It's exact, and about a third of the listing's time (the warrior's `ehp>=103%` space:
46,814 builds counted in 0.5 s, listed in 1 s; the paladin's `ehp>=100%` space with partial ranks,
554,943 builds (69913), would take seven seconds to list, and its count stops at 200,000 in two). The
search counts a space before listing it, so a space past the ceiling narrows without being built.

**What changed with the talent rules' removal** (D30's superseding paragraph). Until then a tank's
search kept a **survival floor** in every build (the defensive cooldowns, Deflection 5/5, the bear's
Heart of the Wild, Thick Hide and Feral Swiftness), and a warrior's or paladin's leftover points
went to a **preferred filler**, Anticipation, before Toughness; after the fourth verification a
dimension only the effective-health floor made (Toughness) took ranks only beside a full
Anticipation (OV4-1). That narrowing left out feasible builds with Toughness and less Anticipation
(OV5-1). All three are gone: those talents race like any other, and a player who wants survival
first picks the Defense goal or sets a sheet constraint.

The spaces at the default setups (tanks with 31 points in their tree and the effective-health
floor), by goal, from the screens on 1.60.1.70009 (`quick`, seed 1; the kept talents aren't
dimensions, and there are none by default). The floor binds in none of these talent searches
(OG-1), so no talent is a dimension for it: the talents it reads (Toughness, Sacred Duty, Heart of
the Wild, Thick Hide) stay fillers, or objective ones where the goal measures them (Toughness for
Defense). The goal changes the space: for Defense a talent that only adds threat is a filler, and
one the screen measures hurting the goal is never taken (for Defense the paladin's Reckoning and
Instrument of Law; for Balanced the bear's Heart of the Wild and Feral Swiftness). "Builds" is the
default space, every rank of one objective talent a build (OG-2); "max ranks" is `--no-partials`'s,
and what a space past the ceiling races ([budgets](#budgets)).

| Spec | Goal | Dimensions | Builds | Max ranks | Legal tree cores | Dominated |
| --- | --- | --- | --- | --- | --- | --- |
| `warrior-protection` | Balanced | 23 objective | 3,985 | 465 | 18,384 | 20,615 |
| `warrior-protection` | TPS | 23 objective | 3,950 | 462 | 18,384 | 20,615 |
| `warrior-protection` | Defense | 17 objective (Toughness among them) | 2,326 | 222 | 3,720 | 3,740 |
| `paladin-protection` | Balanced | 28 objective | 14,758 | 945 | 43,328 | 43,397 |
| `paladin-protection` | Defense | 20 objective | 1,553 | 193 | 6,870 | 7,166 |
| `druid-feral-bear` | Balanced | 17 objective | 237 | 28 | 12,414 | 12,275 |
| `warrior-fury` (no constraints) | DPS | 20 objective | 3,310 | 369 | 19,146 | 19,111 |

So on `quick` the warrior's Balanced space runs 112 fights each in the first round, its TPS 113 and
its Defense 193, the paladin's Balanced 50 (its 14,760 plans fit 50 each in 90% of the budget;
`standard` suits it better) and its Defense 289, the bear's 1,000 and Fury's 135. None grows the
budget.

**What 70009 moved** (against the 69913 table below). The warrior's and Fury's trees didn't change,
and neither did their Balanced, Defense and DPS spaces. The warrior's **TPS** space took Shield Slam
back: on 69913 the screen measured it lowering TPS (−30.5 at max rank, harmful; OG-8), and with
70009's "very high" Shield Slam threat (dmg + 475 [?],
[threat.md](mechanics/threat.md#threat-wording-table)) it's the warrior's most valuable TPS talent
(+175.3), so it's a dimension again (22 → 23 objective) and the space grows. The **paladin** lost
Improved Holy Strike (29 → 28 objective for Balanced). Its Defense screen finds 20 talents
objective (23 on 69913), eight threat talents tie-break only, and Reckoning and Instrument of Law
harmful, so its Defense space is 1,553 builds where 69913's was 135,311. The **bear's** Feral
Swiftness now screens harmful for Balanced (−1.03, beside Heart of the Wild's −3.21), where on 69913
it was below zero but not clearly: 18 → 17 objective and 502 → 237 builds.

On 1.60.1.69913's trees, after the goals review's fixes (69913):

| Spec | Goal | Dimensions | Builds | Max ranks | Legal tree cores | Dominated |
| --- | --- | --- | --- | --- | --- | --- |
| `warrior-protection` | Balanced | 23 objective | 3,985 | 465 | 18,384 | 20,615 |
| `warrior-protection` | TPS | 22 objective | 918 | 119 | 9,808 | 10,040 |
| `warrior-protection` | Defense | 17 objective (Toughness among them) | 2,326 | 222 | 3,720 | 3,740 |
| `paladin-protection` | Balanced | 29 objective | 26,762 | 1,779 | 45,568 | 44,362 |
| `paladin-protection` | Defense | 23 objective | 135,311 | 9,006 | 15,952 | 28,278 |
| `druid-feral-bear` | Balanced | 18 objective | 502 | 56 | 26,022 | 25,738 |
| `warrior-fury` (no constraints) | DPS | 20 objective | 3,310 | 369 | 19,146 | 19,111 |

There the paladin's Balanced space ran 50 fights each (26,764 plans) and the bear's 892, and the
paladin's Defense space raced its partial ranks on every budget: 50 fights each over 135,313 plans
is 6.8 million, so `quick`'s and `standard`'s budgets grew to 13.5 million, under the cap; before
the hard ceiling (OGV-2) they raced its 9,006 max-rank builds.

Where a constraint binds, the talents it reads are dimensions, at 0 or max (OGV-1):

| Spec | Goal and constraint | Dimensions | Builds | Max ranks | What races |
| --- | --- | --- | --- | --- | --- |
| `warrior-protection` | Balanced, `ehp>=103%` | 23 objective + Toughness | 46,814 (52,506 with Toughness's ranks searched, 69913); 3,970 left out by the floor | 3,945 | every rank; `quick`'s budget grows to 4.3 million |
| `paladin-protection` | Balanced, `ehp>=100%` | 28 objective + Toughness, Sacred Duty | past 200,000, where the count stops (554,943 on 69913's trees) | 12,358 (31,755, 69913); 945 left out by the floor | max ranks, narrowed: past 200,000 builds |

Before the goals
review (OG-1, OG-2, OG-3) the floor made the talents it reads dimensions and only max ranks were
searched (69913): the warrior's Balanced space was 2,087 builds, its TPS 700, the paladin's Balanced 23,841,
its Defense 15,135, the bear's 303 and Fury's 288. With the survival floor and the preferred filler
(before D30's superseding paragraph) the warrior's space was 3,690 builds, the paladin's 6,833 and
the bear's 129: the floor kept Deflection, the cooldowns and the bear's Heart of the Wild, Thick
Hide and Feral Swiftness out of the search, and without it more builds are legal and different.

Enumerating takes about a second (two for the paladin's Defense space with partial ranks), and
sizing a space first about a third of that ([below](#the-talent-space)). Before the tree-by-tree combination and the leftover-point rule,
the Protection warrior's space was 17,644 builds and took eight minutes to list; the paladin's
passed 50,000.

## Talents and rotation together

A rotation setting is a candidate too: `--sweep id=a:b:step` and `--rotation "a=1,b=2"` take
rotation.mjs's `id=value` form (`scripts/tune/lib.mjs`), each variant on top of the setup's.

- **Together** (`--search both`): every build with every variant, one race. The screen tries each
  variant too, so a talent that only a variant uses counts.
- **In turns** (`--turns`, `optimizeInTurns`): the talents with the setup's rotation, then the
  variants with the winning build, then the talents again with the winning variant, until a pass
  keeps its start or has no answer. Each pass spends the whole budget, within what the passes before
  it left of the search's cap, less a tenth of that held back for the passes after it (the last pass
  may run all of it; [budgets](#budgets), OGV2-4). Every pass races its start,
  the last pass's winner, beside the new candidates, so a rotation pass whose variants are all
  worse keeps the talent pass's winner; the answer never gets worse from one pass to the next, up
  to the race's own error. Every pass holds every candidate to every constraint, the talent ones
  included: a rotation pass keeps the start's build, but the setup itself races in it only if it
  keeps them (the verification's repro: with Ferocity excluded, the rotation pass once fell back to
  the default, which takes it). The baseline stays the setup itself, so `balanced` is always
  relative to it.
- **Rotation only** (`--search rotation`): the variants with the setup's talents. No talent is
  searched, so there are no talent constraints; sheet constraints still hold. The CLI
  refuses the talent flags with it (`--keep`, `--exclude`, `--min-tree`, `--no-partials`) rather
  than drop them: search talents too (`--search both` or `--turns`) to use them.

In turns, the CLI prints each pass's header (`=== pass 2: rotation ===`) before its space and
rounds.

## Gear

`optimizeGear` (`src/sim/optimize/gear-search.ts`, with the candidates and rules in
`src/sim/optimize/gear.ts`) searches the paper doll by **coordinate ascent**: one slot, or a pair of
slots, at a time, each step's gear sets raced with O1's paired race beside the current gear, the
leader kept, until a pass over the paper doll changes nothing. It doesn't claim the global best
(D30's build plan): restarts and the fresh-seed check guard it. A candidate carries its whole gear
(`Candidate.gear`), so a gear set races, meets the sheet constraints and confirms exactly as a
talent build does: every step is an `optimize()` call whose start is the current gear and whose
other candidates are the step's gear sets (`gears`); the baseline stays the setup as it is.

### Candidates and filters

A slot's candidates are the pool's items (`src/data/items/pre-bis.json`; D11 decides what's in it)
in [the default pool](#the-default-pool) (pre-raid gear and the launch raids) that the character can
wear there (`slotPool`):

- **The class:** `fitsSlot` (src/sim/equip.ts): armor types, weapon types by hands, dual wield for an
  off-hand weapon, a relic in the ranged slot for the classes that have one.
- **The faction:** the race's (`fitsFaction`); the CLI's `--faction` picks the class's default race of
  that faction.
- **The item level range** (`--ilvl 58-66`, `60-`, `-63`), inclusive. The CLI takes `--ilvl -63` as
  written (O2L-10: node's argument parser reads a dash-led value as an option, so the CLI joins it to
  its flag first); `--ilvl=-63` works too.
- **Sources** (`--sources`), from what the client says, since its Encounter Journal ships empty
  ([items.md](data/items.md)): `pvp` (a PvP rank requirement, a battleground's reputation, or an Alterac
  Valley or Warsong Gulch reward's name), `reputation` (another faction's standing), `profession` (a
  profession skill: Engineering's goggles) and `other` (drops, quests and crafts together). A result
  names each new piece's content and source when it isn't a plain pre-raid drop, quest or craft
  (`describeSource`: "[launch raid: Onyxia]", "[Forever-new; reputation (The Watchers, Honored)]",
  "[PvP rank 10]", "[later raid: Zul'Gurub, opted in]").
- **Locked slots** (`--lock head,trinket1`) stay as they are, in every start.
- **A shield tank keeps a one-hander and a shield** (`SHIELD_SPECS`, D30's build plan: "shields for
  tanks"): the Protection warrior's Shield Slam and Shield Block and the Protection paladin's Holy
  Shield need one. A bear has none to keep.
- A hunter's ammo and quiver aren't searched: they follow the ranged weapon (`matchSupplies`, the
  Gear tab's rule).

#### The default pool

**The default is pre-raid gear and the launch raids** (user decision, 2026-09-25, D30; O2L-1). O2 first
searched the whole pool, D10's every Rare of item level 58 and up, which also holds Zul'Gurub's and
Ahn'Qiraj's Rares and later patches' items; they made most of Fury's +6% (the O2 review). The launch
raids are Onyxia's Lair, the Barrow Deeps and Hyjal Summit ([encounter.md §7](mechanics/encounter.md#7-forever-raids-at-launch)),
and Ahn'Qiraj comes long after launch (D36). So by default a slot takes (`contentOf`,
`src/sim/optimize/content.ts`):

- **every item on a pre-raid list** (D11's lists), whatever its item level: Earthstrike (66) is on one;
- **every item new in Forever** (no Classic Era row): a new dungeon's, reputation's or profession's item,
  or a launch raid's; the client can't tell them apart, and both are in the launch game (Adaptive
  Combat Assistant, the Watcher's Signets);
- **the launch raids' loot, where it can be identified:** Onyxia's, by its Classic Era ids `[C]` (her
  drops, the Tier 2 helms, the Head of Onyxia quest's rewards; `ONYXIA_ITEMS`);
- **dungeon, PvP, reputation, crafted and other non-raid items up to item level 63**
  (`PRE_RAID_MAX_ITEM_LEVEL`).

**The later raids are off unless the player opts in** (`GearFilters.laterRaids`, the CLI's
`--include-later-raids`, O3's checkbox): Zul'Gurub, Ahn'Qiraj, Molten Core, Blackwing Lair, Naxxramas
and later patches' Rares. The client has no drop sources, so they're found by what the data says:

- **any item above item level 63 on no pre-raid list** that isn't new in Forever (Fury of the Forgotten
  Swarm, 71; Slime Kickers, 73; Sacrificial Gauntlets, 68);
- **known raid items below that line**, by id `[C]` (`LATER_RAID_ITEMS`): Zul'Gurub's Zandalar class
  necks at item level 60 (Zandalarian Shadow Talisman, Strength of Mugamba and the rest);
- **known raid sets' pieces** (`LATER_RAID_SETS`): Zul'Gurub's ring sets (Zanzil's Concentration,
  Overlord's Resolution, Prayer of the Primal, Major Mojo Infusion).

On 1.60.1.70009 the pool's 1,711 searchable items (its ammo and quivers aside) split **1,116 pre-raid,
328 Forever-new, 0 launch raid and 267 later** (248 above the line, 19 Zul'Gurub's by id or set); a
Fury warrior's slots take 966 of them by default and 1,152 opted in.

**Its `[?]` edges:**

- **None of the launch raids' loot is in the pool yet.** Onyxia drops Epics, and D10's pool takes Rares
  and the lists' items, which leave raid drops out; the Barrow Deeps' and Hyjal's items can't be told
  from other Forever-new items, and any Epic among them is outside the pool too. So today the default is
  pre-raid gear in practice. Searching Onyxia's Epics would widen the pool (D10 and D11, the Gear tab's
  picker too), a decision of its own.
- **The item-level line sweeps in non-raid items above 63** that no list names: 59 PvP rank 7–10
  pieces, the Dungeon Set 2 pieces, and Ahn'Qiraj-era reputation and crafted gear (Band of Cenarius,
  the Sylvan and Ironvine sets), labelled "later content (item level N, on no pre-raid list)", not a
  raid's. The user's rule puts them there.
- **A Forever-new item from a later phase** would count as the launch game's: the client doesn't say.
- **A raid item at item level 63 or below** that isn't curated stays in the default. The two Hakkari
  cloaks (item level 59) are curated as Zul'Gurub's by their name and ids `[?]`.
- **A worn item stays a candidate** whatever its content (a step always races the current item), so a
  setup or a preset that wears later content keeps it in reach: Darksoul Shoulders and Soulforge Belt
  (65, on no list) in the tank presets. Its label then says so ("from the gear the search started
  from").

Enchants are the catalogue's (buffs doc §5) that fit the item (the Gear tab's `enchantFits`: a
weapon's, a two-hander's, a shield's). **The Zandalar and Scourge shoulder enchants and Zul'Gurub's
Presence of Might (head and legs) are left out by default** (`UNCONFIRMED_ENCHANTS`; Presence of Might
since O2L-5): the default presets leave them off until the guild confirms that content is in Forever
(buffs doc §5.3's "ZG availability [?]", §6.4), so the optimizer's defaults must too; `--enchants all`
searches them. **The +15 Superior Strength and Superior Agility gloves are searched** (`OPTION_ENCHANTS`):
buffs doc §6.4 calls them options, not defaults, so a result may take them, and O4 doesn't make them a
default ([defaults from the results](#defaults-from-the-results)).

### Stat weights

A step can't race the whole pool (a warrior's head slot has 66 items, its main hand 171), so each
slot keeps its **top 6 by value** (`--per-slot`, D30's 5 to 8) plus the current item. An item's value
is what it's worth against the slot empty, in the goal's score:

- **Flat stats are priced by the setup's own stat weights** (`measureStatWeights`): each stat block
  field's score per point, measured as a central difference, the plan with the field raised by Δ
  against the plan with it lowered by Δ, paired fight by fight (1,000 fights each, `WEIGHT_FIGHTS`).
  Δ is the median of what the slots' items and enchants give (a warrior's Strength 11, its hit rating
  8). A cap between the two plans shows as the average slope across it. The item stats map to the
  fields as the plan builder's do (`ITEM_STAT` and `addGearStat` in src/sim/plan/build.ts): "+x Attack
  Power" is melee and ranged attack power both, a shield's Classic Era block value is block value, and
  stats the builder ignores (resistances, healing) are worth nothing. The field is raised in the
  plan's stat block, which the engine derives its numbers from, and each druid form's; and what the
  plan builder derives once, before the fight (armor against the boss, the max health rage from hits
  divides by, the mana pool), by the change the same derivation makes (`perturbPlan`). Only for
  ranking: every candidate the race runs is its own plan, built from its gear. Each field's plans run
  a pilot of 50 fights first (`WEIGHT_PILOT`); a field whose two plans give the same numbers on every
  one (spell damage for a warrior: the engine never reads it) weighs 0 and runs no more. Balanced
  scores relative to the setup as it is, as the race does (D30), so a Balanced ranking scores the
  weights and the swaps alike against the setup's own means, measured once a search in the first
  ranking (O2L-9); the other goals need no normaliser.
- **What the weights can't price is measured by a swap** (`rankGear`): weapons (their damage and
  speed), relics (their effect on an ability), items whose equip or use effect the engine models
  (`ITEM_EFFECTS`: Hand of Justice, Earthstrike), and items with a weapon skill or a stat the plan
  applies outside the stat block (a weapon's "+x damage"). Each is the gear with the slot empty
  against the gear with the item in it, 300 fights each (`MEASURE_FIGHTS`): a ring or trinket with
  both of the pair's slots empty, in the first (the pair is one list, `finger` or `trinket`; with one
  slot locked, it's measured in the other, beside the locked item: O2L-2); a two-hander, or a one-hander in the main hand, with no weapons; an
  off hand beside the current one-hander (the best measured one when the main hand holds a
  two-hander). So a two-hander's value and a main and an off hand's sum are comparable. A base the
  sim can't run (a hunter with no ranged weapon) is replaced by the current gear, the same for the
  whole list.
- **Enchants** are valued the same way: a flat-stat enchant by the weights, any other (Crusader,
  Arcanum of Rapidity's haste, the threat gloves) by a swap on the slot's current item, unenchanted
  against enchanted. One that doesn't fit the current item can't be measured there, and is tried on
  every item it fits.

**Hit caps: re-weighted every pass.** The weights are measured again at the current gear at the
start of every pass (D30's build plan: stat weights change past the cap), so once the ascent reaches
the hit cap, hit is worth less and the next pass ranks by that. The swaps, which cost the most, are
measured once a search, in **the first ranking**, at the setup's gear, and kept (a weapon's value
moves little with the rest of the gear, and the race decides among the top 6 anyway). The first
ranking's weights, with the most fights, are the ones the CLI prints, each with its 95% interval
(`GearReport.ranking`; O2L-8): at 1,000 fights Fury's hit weighs 7.4 ± 1.7, at 8,000 8.6 ± 0.6.

### A step's gear sets

The groups, in paper-doll order: head, neck, shoulder, back, chest, wrist, hands, waist, legs, feet,
**rings**, **trinkets**, **weapons**, ranged, **sets** (`GEAR_GROUPS`; `groupGears`):

- **A single slot:** its top items and the current one, each with its **top 2 enchants** by value
  (`enchantsPerItem`) and every one that fits but couldn't be measured, and the current item with its
  current enchant too. So an item and its enchant race together (D30's build plan: "enchants searched
  with their slot").
- **Rings and trinkets:** every pair of the top items and the current two, each pair once: a pair is
  one gear set in either order (`gearKey`), and an item already worn keeps its slot, so the current
  pair never races swapped (O2L-7; two on-use trinkets keep the order the player gave them). With one
  slot locked, the other races alone, and an item that would break a Unique rule with the locked one
  (its own copy) takes no place in the top list (O2L-2).
- **The weapons:** the top two-handers, each with its top enchants and the off hand empty, against
  every pair of the top main hands and off hands, each with its best enchant, and the current pair
  with each hand's top enchants. A dual wielder's off hands are one-handed weapons (and held-in-off-hand
  items); a shield class's are shields.
- **Sets:** for each set whose bonus the plan applies (flat stats or a weapon skill; a bonus it can't
  apply is worth nothing to the sim), its best pieces not yet worn in as many slots as each bonus
  needs, swapped in together, so the bonus can show where one piece alone would lose its race. Each
  piece goes in its slot, or for a ring, trinket or one-hander the pair's slot whose item is worth
  less. The 12 with the most estimated gain race (`SET_CANDIDATES`): each changed slot's values, and
  the bonuses' flat stats priced by the weights (Dal'Rend's Arms: +50 attack power for the pair).

**The rules** every gear set keeps (`gearProblems`), checked on the slots that change, so a setup that
already breaks one elsewhere can still be searched: the item fits its slot for the class and faction;
no **Unique or Unique-Equipped** rule is broken (`uniqueConflicts`: two Don Julio's Bands, or two of
the Watcher's Signets, which share a group of one); a **two-hander leaves the off hand empty**; a shield
tank keeps a one-hander and a shield; each enchant fits its item. Locked slots never change.

### The ascent, restarts and the answer

1. **Rank** the slots at the current gear (above).
2. **Step through the groups**: each group's gear sets race beside the current gear (and the setup
   itself, as every O1 race has it). Every candidate meets every sheet constraint first
   ([constraints](#constraints)); a step where none does keeps the current gear. What the step takes
   (`chooseStep`):
   - **D30's unmeasured-rating rule** (O2L-6). When the leader's new pieces carry one of D12's
     unmeasured ratings (expertise, haste or armor penetration; `UNMEASURED_STATS`) and the setup
     applies them, the best gear set whose new pieces carry none, the current gear included, is taken
     instead if it's within 0.5% of the leader (`UNMEASURED_MARGIN`; for Balanced, half a point, 0.5%
     of TPS or DPS) or inside the paired 95% interval. So Adaptive Combat Assistant (expertise rating
     20, nothing else) wins a trinket step only when every trinket without a rating is clearly behind
     it, as it was for the warrior's preset (−3.9%).
   - **A move needs a clear win** (O2L-4). That choice replaces the current gear only when it clears
     it at a paired 95% (the race compares every standing with the current gear, `vsReference`, over
     the fights both ran). Otherwise the gear stays and the step counts as unchanged, and the step's
     `note` says why. Before, a step moved to its leader whatever the race said: in Fury's quick search,
     14 of the setup's start's 17 moves came from races that hadn't separated, and its neck flipped
     between two Marks of Fordring every pass, so the start never settled.
3. **Pass again** until a pass changes nothing (**stable**), or after 4 passes (`GEAR_PASSES`,
   `--gear-passes`).

**Restarts** (D30's build plan): the ascent runs from the setup's gear, then from the **default
preset** for the race (`defaultGear`: the spec's measured interim set where it has one, else its
pre-raid list's) and from a **greedy set** (`greedyGear`: each slot's best by the setup's first
ranking, the best two rings and trinkets that go together, and the better of the best two-hander and
the best main and off hand), each when it differs from the ones before. Coordinate ascent stops at
the first set no single step improves; a start elsewhere can end at a better one. `--no-restarts`
runs only the first.

**The answer** is the leader of a final race among where the starts ended, with the setup, on a seed
of its own (`finalSeed`, the search's seed XOR 0x85ebca6b; O2L-11): the ends were chosen on the steps'
fights, so racing them again on those carried the selection's luck into the answer's interval (Fury's
+49.7 on the search's seed, +48.3 on a fresh one). `--confirm` then checks it on another fresh seed
([confirmation](#confirmation)). A tank's
effective-health floor is a share of its class's **survival preset**, the v1 tank gear (the pre-raid
list's, `preRaidListGear`; D30), not of the setup's gear (`survivalReference`).

**The budget** (`--budget`) is the whole gear search's fights: the rankings, every step and the final
race, within the hard ceiling ([budgets](#budgets)). The final race keeps 15% (`FINAL_SHARE`). The
first ranking serves every start, so it's budgeted from the whole of the rest (O2L-3); the setup's
start gets a third of what it leaves, and each restart an even share of what's left after the starts
before it. A step gets its start's remaining fights divided by the groups left in the pass plus one
more pass; a step whose gear sets can't run a first round of 20 fights each in what it gets ends its
start there, and the report says so. A ranking takes at most 40% of what it has (`RANK_SHARE`): past
that, its fights shrink, to 50 a plan at least (`MIN_RANK_FIGHTS`, or the caller's fewer; the CLI
takes no fewer than 50), and a note says so. A later ranking re-measures the weights only, and its
cost is priced from the last ranking's live fields, the ones the pilot didn't set aside (O2L-8), so a
pass's weights keep their fights rather than shrinking for fields that never run.

**The ceiling holds for the gear search too** (O2L-3). Before any fight, the first ranking's fewest
fights (every plan at 50) must fit the cap, or the search doesn't run (`SearchTooLargeError`, which
says to lock slots, narrow the pool or raise the cap). A budget below that minimum grows to it and
leaves the steps nothing, and says so; a later ranking that no longer fits what its start has left
ends the start. So the rankings, the steps and the final race together never pass the cap (on Fury,
a budget and cap of 10,000 used to spend 17,650 on the first ranking alone).

## Talents, gear and rotation together

`optimizeTogether` (the CLI's `--search all`) alternates: **a talent pass** with the start's gear and
rotation (O1's search, its screen under the rotation variants too), **a gear pass** with the winning
build ([gear](#gear)), and **a rotation pass** with both when there are variants (`--sweep`,
`--rotation`), then again, until a whole cycle moves nothing, a pass has no answer, or 3 cycles have
run (`--cycles`). Each pass starts from the last pass's answer and races it, so the answer never gets
worse from one pass to the next, up to the race's error. Every pass holds every candidate to every
constraint; a tank's effective-health floor is a share of its survival preset throughout, the gear
pass's reference, so the passes agree on it. The hard ceiling holds for the whole search: each pass
but the last gets what the passes before it left of the cap less a tenth held back (`TURNS_RESERVE`,
as a search in turns); a pass that no longer fits ends the cycles on the last answer.

## Budgets

A budget is the race's fights, all candidates' together, the baseline's included. The screen's
fights come on top (20,000–27,000 for the four specs in the table above). The setup's copy costs
nothing: it takes the baseline's fights ([racing](#racing)), where it used to run the same ones
again (a third of a rotation search with one variant).

| Budget | Fights | 15 threads, ~80,000 fights a second | A browser's 8 workers, ~40,000 |
| --- | --- | --- | --- |
| `quick` | 1,500,000 | at most ~20 s | ~40 s |
| `standard` | 6,000,000 | at most ~75 s | ~2.5 min |
| `thorough` | 24,000,000 | at most ~5 min | ~10 min |

**The hard ceiling** (D30, user decision: "there does need to be some reasonable limit to
iterations, we don't want to fire off a 10 billion iteration sim"; OGV-2). A search never runs
more than **24,000,000 fights**, the screen's and the race's together, over every pass of a search
in turns (`MAX_SEARCH_FIGHTS`, `thorough`'s budget), and never lists more than **200,000 builds**
(`MAX_BUILDS`). Nothing raises the cap on its own: a caller raises it only by asking
(`maxFights`, the CLI's `--max-fights`). A budget over it is cut to it. **The confirmation counts
under it too** (OGV2-2; [below](#confirmation)): the CLI's check is two runs of the winner and the
baseline, 4 × `--confirm-fights` (160,000 with the defaults), and it gets what the search left of
the cap, and no more than asked for (`confirmFights`). A search that left less runs fewer fights
each and says so ("the check runs 25,000 each rather than the 40,000 asked for"); one that left
fewer than 100 each (`MIN_CONFIRM_FIGHTS`) doesn't confirm, and says to raise `--max-fights`. The
search is the same with the check or without it: the check takes only what's left.

The first round runs 30% of the budget over the plans that run it, between 50 and 1,000 fights
each (`firstRound`): 20,000 plans get 90 each on `standard`, 129 get 1,000. `fitBudget` fits the
budget to the plans within what the cap leaves the race (the cap less the screen's fights, and less
the passes before it in turns), and the CLI prints a note saying what it changed. Both count plans,
the baseline included, since the baseline runs every round too; the note says so, beside the CLI's
count of candidates, which leaves it out (OV4-5, OV5-2):

| Plans (the candidates and the baseline) | What the first round does | `quick` | `standard` | `thorough` |
| --- | --- | --- | --- | --- |
| up to 30% of the budget ÷ 1,000 | 1,000 fights each | ≤ 450 | ≤ 1,800 | ≤ 7,200 |
| up to 30% ÷ 50 | 30% of the budget, 50 to 1,000 each | ≤ 9,000 | ≤ 36,000 | ≤ 144,000 |
| up to 90% ÷ 50 | 50 each, up to 90% of the budget | ≤ 27,000 | ≤ 108,000 | ≤ 432,000 |
| up to 90% of the cap ÷ 50 | 50 each; **the budget grows** to twice that first round, up to the cap | ≤ 432,000 | ≤ 432,000 | |
| more | **the space narrows**, below | | | |

**Up to the cap, the budget grows** so every plan runs 50 fights in its first round
(`FIRST_ROUND_MIN`): a race on fewer drops almost nothing and ends on its budget, and a space raced
blind is worse than a narrower one raced properly. **Beyond the cap, the space narrows** rather
than the fights: a talent space whose partial ranks pass 200,000 builds, or make more plans than the
cap races at 50 fights each (before the sheet constraints leave any out), is searched with **max
ranks only**. The dimensions a constraint made are at max ranks already (OGV-1, [the talent
space](#the-talent-space)), so this is the one narrowing left: max ranks everywhere. The space is
sized before it's listed (`talentSpaceSize`), so one past the ceiling is never built. The report
says so plainly: `space.narrowed` (why, and how many builds the partial ranks made), a note that
starts "Narrowed to max ranks", and the CLI's line "NARROWED to max ranks"; the JSON has all three.
If even max ranks are past the ceiling, a last resort: past 200,000 builds, or with fewer than 20
fights a plan (`MIN_FIRST_ROUND`) in 90% of the cap, the search doesn't run
(`SearchTooLargeError`) and says how to narrow it (keep or exclude talents, a tree's minimum, fewer
rotation variants); between 20 and 50 a plan, the first round shrinks to fit the cap, and the note
says it drops fewer and may end on the budget. The narrowing reads 50 fights a plan whatever first
round the caller asks for (`initialFights`, the CLI's `--first`; OGV2-1): a larger one that passes
90% of what the cap leaves the race shrinks to fit it, and a note says so ("A first round of 2,000
fights each over 1,034 plans (the baseline included) passes the 997,920 fights the search's cap
leaves the race: it runs 868 each", the bear with a 40-fight screen; 69913's bear made 504 plans
with the default screen and ran 1,748 each), rather than narrowing a space that fits at 50. A talent screen with more fights than the cap is
refused before its first fight. **In turns** (OGV2-4), each pass but the last runs at most 90% of what
the passes before it left of the cap, holding back a tenth (`TURNS_RESERVE`) for the passes after it,
so one pass can't spend the whole cap and leave the next nothing: a talent pass whose race ends on its
budget used to spend all of it, and the rotation pass, which costs little, never ran. A pass's
`budget.cap` is what it could run. A pass that no longer fits what it's given ends the turns on the
last answer, and the last report's `turnsStopped` says so.

**A gear search's budget** is its own: `--budget` is every fight of the gear search (the rankings,
the steps and the final race), clamped to the cap ([gear](#gear)). On 1.60.1.70009, Fury's first
ranking is 104,600 fights, most of them the 300-fight swaps of its weapons and effect items (the
pilot sets 25 of its 33 stat fields aside), and a later one about 18,500, its weights alone; a step
races 5 to 60 gear sets, 1,000 to 15,000 fights on `quick`. Fury's `quick` search ran two starts (4
passes, then 2 to stable) and the final race in 890,917 fights, 18 s on 8 threads.

So `quick` suits a space of up to about 9,000 plans, `standard` 36,000 and `thorough` 144,000; a
larger one costs more than its budget (to 100 fights a plan) up to the cap, and past about 432,000
plans it narrows. The tanks' default spaces are in [the talent space](#the-talent-space): each fits
`quick` without growing it (the largest, the paladin's Balanced, at 50 fights a plan); the
warrior's Balanced space under `ehp>=103%`, 46,814 builds, grows `quick`'s budget to 4.3 million;
the paladin's Balanced space under `ehp>=100%`, where Toughness and Sacred Duty are dimensions,
passes 200,000 builds with partial ranks and narrows to its 12,358 max-rank builds on every budget.
(69913: the paladin's Defense space, 135,311 builds with partial ranks, grew `quick`'s and
`standard`'s budgets to 13.5 million, and its `ehp>=100%` space made 554,943 builds and narrowed to
31,755.) A race usually stops long before its budget: most candidates are clearly worse after
the first round. The speeds are this machine's under load (80,000 a second on 12–15 threads is about
6,000 fights a second a thread; the engine does 6,000–10,000 per core by spec).

**The estimate before it runs** (OGV-2). The CLI prints the ceiling before anything runs, with a
rough time at 6,000 fights a second a thread for 180-second fights, scaled by the fight's length
(OGV2-3: a 900-second fight is 1,200 a second a thread). Once the space is known, before the race's first
fight, the search reports `estimate` (in the `space` progress and the report): the screen's fights,
run, and the race's budget, the most it can spend, with the time that budget takes at the pace the
screen ran. The app's Optimize flow (O3) shows both before the player starts and before the race.

**Run it off the main thread** (a note for O3, OGV-5). The fights run in the worker pool, but the
search's own work runs where `optimize()` is called: sizing and listing the space (up to a few
seconds for the largest), building a plan and a sheet for every candidate (about 0.3 ms each, 15
seconds for 46,814 builds) and the race's bookkeeping. On a phone that would freeze the page, so O3
calls `optimize()` inside a worker (a dedicated one that hands the fights to the pool, or the pool's
own), not on the page's thread.

## Confirmation

A search that compares thousands of candidates at 95% turns up false wins, so the winner is run
again against the baseline on a **fresh master seed**, one the search never used (D23), with
40,000 fights each by default (`confirm`, the CLI's `--confirm`), within what the search left of
its hard ceiling ([budgets](#budgets), OGV2-2). It's adopted only if its interval is still above
zero. The CLI runs the check twice, with D12's unmeasured ratings applied
and ignored, and says when the winner clears under one and not the other: then it rests on an
untested rating.

It also names the **[?] assumptions** the winner's gain can flow through (`assumptionChanges`):
the plan lists an assumption only when the setup relies on it
([sim/plan/assumptions.ts](../src/sim/plan/assumptions.ts)), so the check lists those only the
winner relies on (a place its gain can come from), those only the default relies on, and those
both rely on. The sim can't switch most of them off to measure how much of the gain rests on
each, so it names them; D12's ratings are the one it can switch.

## Defaults from the results

D30 makes a spec's defaults the optimizer's results under its default constraints, confirmed on a
fresh seed. This is O4's process, after the tanks' threat fixes (M5.6):

1. Run the search at the default setup with the spec's default goal and constraints: a tank's
   Balanced, with 31 points in its tree and the effective-health floor; a DPS spec's DPS, with
   none. Use the `thorough` budget. When the setup itself leads, as a candidate, the default
   stands.
2. A result that ends on the budget isn't a winner yet: run again with more budget, or, when the
   survivors are within the noise of each other, take the leader and say so.
3. Confirm the leader on a fresh seed with `--confirm`. It replaces the default only if it clears
   D23's bar there and doesn't depend on an unmeasured rating.
4. Record the change, the numbers and the command in the spec's class doc, update the default
   build (`src/sim/defaults.ts`), and re-snapshot the goldens with the explanation.
5. **An option isn't a default** (O2L-5). Where an answer's enchant is one buffs doc §6.4 calls an
   option, not a default (`OPTION_ENCHANTS`: the +15 Superior Strength and Superior Agility gloves),
   O4 sets §6.4's default for that slot instead (Greater Strength or Greater Agility, +10) and records
   the answer's enchant as an option in the class doc. The same goes for any enchant left out by
   default (`UNCONFIRMED_ENCHANTS`), which a default search never picks.

**The answers on 1.60.1.70009 so far** (`quick`, seed 1, the default goals and constraints; not
O4's `thorough`, confirmed runs, so no default has changed). Each is against the spec's 70009
default, paired over the leader's fights:

| Spec | Goal | Default | Answer | Against the default | The race |
| --- | --- | --- | --- | --- | --- |
| Protection warrior | Balanced | `35-05-552101233301210531` | `-45050001005-502300233300010531`: Booming Voice 4, Boundless Rage 1, Unbridled Wrath 5, Enrage 5, Toughness 1→3; no Improved Heroic Strike, Deflection, Anticipation, Last Stand, Vanguard or Improved Shield Wall | **+11.61 points** (+11.39 to +11.82): TPS +47.0, DPS +27.1, taken +62.8 a second | separated after 8 rounds; 69913's answer (Booming Voice 3, Boundless Rage 2) is second, +11.45 |
| Protection paladin | Balanced | `50003-0530213321301551-5021` | `50003-0530311301301541-05205`: Benediction 5, Conviction 5, Anticipation 2→3; Improved Righteous Fury 3→1, Iron Creed 5→4; no Sacred Duty, Deflection or Holy Conduit | **+6.49 points** (+6.45 to +6.54): TPS +21.9, DPS +16.7, taken +94.6 | the budget ended with 2 unseparated; the closest, 69913's answer (`…0530410301301541-05205`), is 0.00 (−0.03 to +0.04) behind: the same TPS and DPS, 14 more damage taken a second |
| Feral bear | Balanced | `050022-5520032023132210551-` | `050022-5003032023132210051-504`, as on 69913: Feral Instinct 3, Nature's Focus 5, Naturalist 4; no Heart of the Wild, Feral Swiftness or Natural Reaction | **+7.57 points** (+7.07 to +8.07): TPS +38.0, DPS +23.2, taken +68.4 | separated after 2 rounds |
| Fury warrior | DPS | `30305013002-050530035150010051-` | `3200521-250500035152310051-`, as on 69913: Precision 3, Improved Execute 2, Improved Overpower 2, Deflection 2, Booming Voice 2; no Deep Wounds, Impale, Improved Rend or Improved Cleave | **+27.2 DPS** (+25.3 to +29.2, +3.8%) | separated after 5 rounds |
| Protection warrior | TPS | as above | the Balanced answer, `-45050001005-502300233300010531` | **+46.9 TPS** (+46.5 to +47.3), DPS +27.0 | separated after 10 rounds; 69913's TPS answer dropped Shield Slam (above) |
| Protection warrior | Defense | as above | `3501-05-052531033331110501`, as on 69913 | **32.1 less damage taken a second**, TPS −163.1 | the budget ended with 2 unseparated (0.01 apart) |
| Protection warrior | Balanced, `ehp>=103%` | as above | `-45050001005-500500233300010531` (the Balanced answer with Toughness 5 for Improved Bloodrage) | **+10.63 points** (+10.55 to +10.71), taken +48.6 | separated after 12 rounds |
| Protection paladin | Balanced, `ehp>=100%` | as above | `50003-2530010321301541-05205`, narrowed to max ranks: Toughness 2, no Anticipation or Improved Righteous Fury, Sacred Duty kept | **+6.56 points** (+5.99 to +7.13), taken +116.9 | separated after 5 rounds |
| Protection paladin | Defense | as above | `55000003-5530513300001051-51`: Toughness 5, Anticipation 5, Divine Intellect 5, Reverence 3; no Improved Seals, Reckoning, 1HWS or Swift Judgement | **64.1 less damage taken a second**, TPS −86.1 | the budget ended with 104 unseparated (Defense's top is flat) |

The logs and reports are in `.cache/demos/70009/` of the merge's worktree.

**Gear on 1.60.1.70009 so far** (O2, `--search gear`, `quick`, seed 1, not O4's `thorough`, so no
default has changed). Fury, from its default set: the greedy start's end led the final race by
**+49.7 DPS** (+46.1 to +53.3) and **confirmed at +48.3 DPS** (+47.5 to +49.1, +6.0%) on a fresh
seed at 20,000 fights each, with the unmeasured ratings applied or ignored alike. Its changes: Arcanum
of Rapidity on the head and legs, Fury of the Forgotten Swarm, Truestrike Shoulders, Earthweave
Cloak, Forest Stalker's Bracers, Sacrificial Gauntlets with Superior Strength, Belt of Preserved
Heads, Sentinel's Chain Leggings (a Warsong Gulch reward), Slime Kickers, Band of Earthen Might,
Earthstrike with Hand of Justice, and Bloodseeker; the weapons stayed. The setup’s own start ended
at +29.5, **20.1 DPS behind it** (16.5 to 23.8), after 4 passes without settling (Adaptive Combat
Assistant in place of Hand of Justice, Mark of Fordring kept): the restart is what found the better
set. The report is
`.cache/optimize/o2-fury-quick.json` of the O2 worktree.

## Reading the results

**A gear search** prints each start's rankings and steps as they finish ("hands: 14 candidates,
CHANGED"), then each start's end as changes from the setup ("Hands: Devilsaur Gauntlets (+Greater
Strength) → Sacrificial Gauntlets (+Superior Strength)", with a new piece's source in brackets), the
notes, the fights it ran, the setup's stat weights, and the final race's standings, whose changes list
the talents, the rotation and the gear that differ from the setup (`describeGearChange`). The JSON
report adds each start's steps, passes and weights, and the winner's gear.


The CLI prints the goal and the ceiling, the screen, the space (and, plainly, when the ceiling
narrowed it), the estimate before the race, each round, a table of standings and the result, and
writes a JSON report under `.cache/optimize/` (its `setup.goal` the player's pick, `scoredGoal` what
the score read, `setup.maxFights` the cap, and each pass's `budget`, `estimate`, `notes` and
`space.narrowed`). A standing has:

- the build and its changes from the default ("Shredding Attacks 0→3"), or "the setup itself"
  for the copy of the setup that raced as a candidate
- mean TPS, DPS, damage taken per second, health, effective health, and the boss's crit and crush
  chances against it
- its paired change from the baseline in score (in the goal's units: points for Balanced, DPS or
  TPS, and for Defense the damage taken a second saved), TPS, DPS and damage taken, each with its
  95% interval, over the fights it ran
- its fights, and its state: the leader, a survivor, or dropped in round _r_ as clearly worse,
  with the candidates tied with it

Candidates dropped early ran fewer fights, so their intervals are wider; the table lists the
leader, then the survivors, then the dropped by how long they lasted. The baseline isn't a row:
its numbers are the line under the table. The CLI also says what the setup itself fails (it's then
only the baseline), how many candidates each kind of constraint left out, and, when there's no
answer, "no setup meets these constraints" with `blocked`'s reasons. The line after the result
compares the leader, the answer, with the default.

## Limits of the method

- **Maximality assumes no raised talent lowers the score.** The screen calls a talent harmful
  only when its interval is below zero everywhere it acts; one whose screened mean is below zero
  but whose interval reaches it (the warrior's Anticipation for Balanced) isn't raised by maximality, so builds
  with and without it race. One whose mean is just above zero, though its true effect is
  negative, is still raised when it fits.
- **Maximality counts only objective talents.** A dimension only a constraint made (Toughness
  under the effective-health floor, for Balanced) is never forced: the builds with and without it
  both race.
- **Defense measures only what the sim models.** A cooldown the rotation never presses, or a
  talent whose effect the engine doesn't model, changes no measured damage taken, so Defense is
  indifferent to it: the goal is the least damage taken the sim measures, not every survival
  talent a tank might take.
- **The screen's sign and score per point come from a few contexts**, 400 fights each. A talent
  that helps only in a build far from both contexts can be misjudged; `--screen-fights` raises the
  fights.
- **Exact ties are judged on the first round's fights.** Two candidates that differ only on rare
  fights would be merged; with 50 or more three-minute fights that's an effect far below anything
  the race could separate.
- **Maximality is one talent at a time** (above): swaps are left to the race.
- **One searched partial rank a build.** Every rank of one talent is searched, and leftover points
  go to the others' partial ranks by their screened score per point, so a build can hold two
  partial ranks. What isn't tried is two talents each at a partial rank the fill wouldn't give,
  such as two talents whose max ranks both screen below zero, each at 1 of 3. Searching every pair
  would multiply the space by the ranks of every other talent.
- **Harmful talents' partial ranks aren't tried.** A talent the screen finds lowering the score at
  max rank in every context is never taken, so a rank of it that alone would help is missed.
- **With max ranks only, a partial rank comes from the fill alone** (`--no-partials`, or a space
  the ceiling narrowed). The fill places leftover points a point at a time, greedily, in its order,
  and never spends points to open a tier gate for a partial rank: a partial rank behind a gate the
  core doesn't open isn't tried. Searching every rank (the default, where the space fits the
  ceiling) tries it.
- **A dimension only a constraint made takes a partial rank only from the fill** (OGV-1): its
  searched ranks are 0 and max, so a build that needs, say, Toughness 3 to meet a floor gets it
  only where the fill's leftover points land there.

- **Coordinate ascent is local.** A pass changes one group at a time; a better set that needs two
  groups to change at once, and that no step's leader leads to, is found only by a restart or a set
  step. The restarts and the final race guard against it; they don't rule it out.
- **The top 6 by value decide what races.** An item ranked 7th by the weights or its swap never races
  in that pass. The weights are linear and the swaps are 300 fights, so two items within a few points
  of each other can swap places; the race decides among the ones that make it. `--per-slot 8` widens
  it.
- **Stat weights come from a perturbed plan.** The field and what the builder derives from it once
  (armor, max health, the mana pool) move; anything else the builder computes from the stats before
  the fight (a proc's size read from the sheet) doesn't. Only the ranking reads the weights.
- **Swaps are measured once a search**, at the setup's gear: a weapon's value past the hit cap is its
  value at the setup's hit. The weights are measured again every pass.
- **Set bonuses the plan doesn't apply are worth nothing** (not flat stats or a weapon skill: most
  PvP sets' 4-piece procs); the set step leaves those sets out, and the race gives them nothing.
- **Sources are what the client says.** Drops, quests and crafts are one group (`other`); a rare drop
  can't be told from a common one. Random-enchantment items ("of the Bear") are in the pool as their
  bases, as the Gear tab lists them.
- **Ammo and quivers aren't searched**: they follow the ranged weapon.

## Worked examples

- **The pool a slot takes** (`gear.test.ts`). A mage's chest holds only cloth; a rogue's main hand no
  two-hander and its off hand no shield; a Balance druid's off hand only held-in-off-hand items and its
  ranged slot only idols. A Human's feet include Knight-Lieutenant's Plate Greaves and an Orc's don't,
  and no slot holds the other faction's items. With `--ilvl 60-63` every item is 60 to 63; with
  `--sources pvp` every one is PvP. A Protection warrior's main hands are one-handers and its off hands
  shields, in every weapons step.
- **The rules.** Two Don Julio's Bands, or the Ferocious and Stalwart Watcher's Signets, break a Unique
  rule, and the rings step never pairs them; a two-hander with an off hand breaks the two-hander's
  rule; a locked head has no step, a locked main hand stays in every weapons set, and the greedy set
  keeps a locked head and trinket.
- **Enchants with their slot.** Fury's hands step tries an item with more than one enchant, among them
  Superior Strength, and the threat and Minor Haste gloves, which the weights can't price; its shoulders
  never take the Zandalar or Scourge enchants unless every enchant is searched; a shield's enchants go
  on shields only.
- **A set raced together.** Fury's sets step swaps in Dal'Rend's Sacred Charge and Tribal Guardian
  together, and its estimate counts the pair's +50 attack power (25 points at 0.5 a point).
- **A stat weight's plan.** A Protection warrior's plan with 10 more Stamina has more than 100 more
  max health for its rage from hits, and the same armor; with 100 more item armor, 100 more armor.
- **The search end to end** (`gear-search.test.ts`). Fury with the lowest-level item the pool has in
  its head, neck and rings, the other slots locked, on 24,000 fights: the answer changes an open slot
  for a higher-level item, clears the bad set at 95%, spends no more than its budget, and is the same,
  step for step, on a second run with the same seed.
- **The hands' rules on the hands alone.** A Protection warrior set up with a two-hander breaks the
  shield rule, and its head is still searched: the rule is checked only when a hand changes.
- **Talents, gear and rotation together** (`gear-search.test.ts`). Fury with every default talent kept
  but Deep Wounds and Impale, and the bad set's open slots: the talent pass comes first, the gear pass
  searches with its answer's build, a later pass keeps what the one before found, and the cycles stop
  within the cap.

These are unit tests (`src/sim/optimize/*.test.ts`).

- **Effective health.** 10,000 armor against a level-63 boss: K = 400 + 85 × 63 = 5,755, so armor
  stops 10,000 ÷ 15,755 = 63.47% of a hit, and 8,000 health is 8,000 ÷ 0.36528 = 21,901 effective
  health.
- **The balanced score.** +38.3 TPS on 687.4 (+5.57%) and +16.3 DPS on 359.9 (+4.53%) is +10.1
  points (`race.test.ts`).
- **The goals.** Four candidates at 1,000–1,050 DPS: under DPS the one at 1,050 leads; under
  Defense the one taking 450 a second leads, though it has the least DPS, its score +50 against
  the baseline's 500; candidates with the same damage taken on every fight are one for Defense,
  and the most TPS represents them; a tank's default goal is Balanced and a DPS spec's DPS,
  Balanced for a DPS spec scores DPS, and Defense is refused for one (`race.test.ts`). The
  Protection warrior for Defense: Toughness is objective (for Balanced a tie-break), Defiance a
  tie-break, and the answer takes less damage than the default, confirmed on a fresh seed
  (`optimize.test.ts`).
- **The first round.** `quick` (1,500,000 fights) over 7,000 plans: 30% of the budget is
  450,000, 64 fights each. Over 10 plans it's capped at 1,000.
- **Capstones.** With only Mortal Strike, Bloodthirst and Shield Slam objective, every build has
  exactly one of them: two need 62 points, and a build with none has the points for one.
- **Partial ranks searched** (OG-2). Cruelty, Booming Voice and Boundless Rage objective, Boundless
  Rage's screen at −0.06 a point, 36 points in Protection: with max ranks only, Boundless Rage is at
  0 or 3 in every build; by default it's at 0, 1, 2 or 3 (`talents.test.ts`).
- **A cheap raise doesn't shadow a partial rank** (OG-3). 47 points in Protection leave 4:
  Deflection (1 a point, 5 ranks) at 4 races, where Improved Rend's 3-point raise (0.01 a point)
  used to drop it; with 46 in Protection, Deflection 5 fits and the builds are Deflection 5 and
  Deflection 2 with Improved Rend 3 (`talents.test.ts`).
- **A constraint that can't bind** (OG-1). The bear with a floor at half its effective health: no
  build falls below it, so Heart of the Wild and Thick Hide stay fillers and the space is the one
  with no constraint; at the whole of it they're dimensions again (`optimize.test.ts`).
- **A toy race.** Twenty candidates at 1,000–1,019 DPS and one at 1,030, with noise they share
  each fight: the race finds the 1,030 one and separates it at 95%, the same with 1 lane or 7 and
  whatever order the jobs finish in.
- **The winner's curse.** A thousand candidates level at 1,000 DPS and one at 1,000.1, over a
  first round of 50 fights: in 20 races an uncorrected 99% bar drops the true best in the first
  round at least once; the corrected bar, z = 4.92 (Student's t at 0.5% ÷ 999, 49 degrees of
  freedom), never does.
- **Fitting the budget.** `quick` (1,500,000) over 50,000 plans: 50 fights each would be
  2,500,000, so the budget grows to 5,000,000, a first round of 50 each and as much again; over
  300,000 it grows to the cap, 24,000,000; over 500,000, 50 each is 25,000,000, past 90% of the cap,
  so it doesn't fit: the search narrows the space, and as a last resort runs 43 fights each
  (`optimize.test.ts`).
- **The ceiling narrows the space** (OGV-2). The bear with a cap that races its max-rank space at
  50 fights a plan and not its partial ranks: it races max ranks, `space.narrowed` says the cap on
  fights did it, and the search runs no more than the cap; a builds' limit just over the max-rank
  space does the same for builds. A cap below the screen's fights is refused before any fight, and
  in turns a pass that doesn't fit ends the turns, saying so (`optimize.test.ts`).
- **A large first round doesn't narrow** (OGV2-1). The bear on `quick` with a first round of 2,000
  fights, a cap of 1,000,000 and a 40-fight screen: its plans (1,034 in the CLI) at 2,000 each pass 90% of what
  the cap leaves the race, but at 50 each they fit, so every rank races and the first round shrinks
  to fit the cap (`optimize.test.ts`). With the default 400-fight screen, 70009's bear makes only 238
  plans, which fit at 2,000 each (69913's made 504, which didn't).
- **A constraint's dimension at 0 or max** (OGV-1). The warrior under `ehp>=103%`, with 70009's
  screen: 46,814 builds (3,945 with max ranks only), among them 70009's answer, Booming Voice 4
  with Boundless Rage 1, and 69913's, Booming Voice 3 with Boundless Rage 2, which max ranks miss
  (`talents.test.ts`).
- **The confirmation within the cap** (OGV2-2). With 40,000 fights asked for, a search that left
  100,000 of its cap runs the CLI's two checks at 25,000 each; one that left fewer than 400 doesn't
  confirm (`optimize.test.ts`).
- **In turns, a tenth held back** (OGV2-4). The bear in turns with a cap of 30,000 fights and a
  budget far past it: the talent pass runs at most 27,000 and ends on that budget, and the rotation
  pass runs on what's left; with nothing held back the talent pass spends all 30,000 and the turns
  stop there (`optimize.test.ts`).
- **In turns.** From the bear's 8/43/0 (`--talents 050012-5523032120132210551-`), the talent pass
  finds a build 14.2 points ahead; holding Maul for 90 rage costs it 1.6 points (69913), so the rotation
  pass keeps the talent pass's winner with the setup's rotation (it fell back to the baseline
  before the review's fix).
- **Every pass holds the constraints.** The bear in turns with Ferocity excluded and Maul held for
  90 rage: no pass answers with the default, which takes Ferocity (`optimize.test.ts`, OV-1).
- **No setup.** The Protection paladin under crit immunity on its default gear: no build reaches
  440 defense (the closest leaves the boss a crit chance above zero), so no candidate races and the
  report says crit immunity blocks it (OV-2).
- **The setup wins as a candidate.** The bear with one rotation variant, Maul held for 90 rage:
  its own rotation leads, as the copy of the setup, 0 ± 0 against the baseline it's identical to,
  and it runs no fights of its own (OV2-5).
- **The fill order by tie-break.** Shield Slam's 31 points in Protection leave 20; with
  Anticipation's tie-break at 0.5 a point, Toughness's at 0.2 and Deflection's at −0.3, Anticipation
  and Toughness take 5 each, the no-effect talents the rest, and Deflection none. With the values
  swapped, Toughness comes first: no talent is preferred by name (`talents.test.ts`).
- **The builds the narrowing lost.** The default Protection warrior with every talent kept but
  Anticipation and Toughness: both the default (Anticipation 5, Toughness 1) and its twin
  (Anticipation 0, Toughness 5) race, where OV4-1's rule left only the default (OV5-1;
  `talents.test.ts`).
- **No result limits.** The best DPS takes 20% more damage than the rest: it leads all the same,
  and `taken<=102%` is refused as a fight result (`race.test.ts`, `optimize.test.ts`).
- **Nothing fits the talent constraints.** The bear keeping Moonkin Form: no legal 51-point build
  holds it and 31 points in Feral Combat together, and the report lists both (OV2-3).
