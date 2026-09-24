# The optimizer

The sim finds the best talents (and rotation settings) for a setup itself, rather than assuming
them, as Raidbots' Top Gear does for gear
([D30](decisions.md#d30-the-sim-finds-the-best-talents-gear-and-rotation-itself-defaults-are-its-results-2026-09-24)).
This doc owns its method: how candidates are compared, what it maximizes, which constraints it
keeps, how the talent space is built, and how a spec's defaults come from its results.

**Status (O1, 2026-09-24):** the search core, the talent space, rotation settings as candidates,
constraints with effective health and crit and crush immunity, and the command line
(`npm run optimize`), with the review's and both verifications' fixes
([review log](reviews/2026-09-24-optimizer-o1.md)); the setup is only ever the baseline, never an
answer (user decision); Anticipation is the warrior's and paladin's preferred filler, first in the
fill order, rather than a floor talent (user decision, D30); the leader is the answer, and the race
takes no result limits (step 6 of the review, D30). Gear is O2, the
app's Optimize flow O3, and defaults set from the results O4 ([milestones](milestones.md)). The
code is `src/sim/optimize/` (pure TypeScript, seeded, no DOM) and
[`scripts/tune/optimize.mjs`](../scripts/tune/optimize.mjs).

## Contents

1. [The steps](#the-steps)
2. [Fights and runners](#fights-and-runners)
3. [The objective](#the-objective)
4. [The statistics](#the-statistics)
5. [Racing](#racing)
6. [Constraints](#constraints)
7. [Which talents matter](#which-talents-matter)
8. [The talent space](#the-talent-space)
9. [Talents and rotation together](#talents-and-rotation-together)
10. [Budgets](#budgets)
11. [Confirmation](#confirmation)
12. [Defaults from the results](#defaults-from-the-results)
13. [Reading the results](#reading-the-results)
14. [Limits of the method](#limits-of-the-method)
15. [Worked examples](#worked-examples)

## The steps

`optimize()` (`src/sim/optimize/optimize.ts`) takes a setup, what to search, the constraints and a
budget:

1. **Screen** the class's talents for this setup: which ones the sim can measure
   ([below](#which-talents-matter)). Only when talents are searched.
2. **Build the candidates:** every sensible talent build under the constraints
   ([below](#the-talent-space)), each with the start's own rotation and with every rotation
   variant given, and beside them the setup itself and the **start**, where the search begins (a
   pass of a search [in turns](#talents-and-rotation-together) starts from the last pass's
   winner). Two candidates that make the same setup race once.
3. **Hold every candidate to every constraint**, the same way for each: the talent constraints (a
   tank's survival floor, kept and excluded talents, the trees' minimums), checked on its build;
   and the sheet constraints (effective health, crit and crush immunity), checked on its character
   sheet before any fight. A candidate that breaks one is left out. The race takes no limits on
   fight results ([constraints](#constraints)).
4. **Race** the candidates on common random numbers until the leader is clear of the rest at 95%
   or the budget runs out ([below](#racing)), beside the **baseline**. The budget and the first
   round are fitted to the number of candidates first ([budgets](#budgets)).
5. **Answer** with the race's leader (`race.leader`), the best mean. A warrior's or paladin's
   **preferred filler**, Anticipation, is only where the talent space puts leftover points
   ([below](#the-preferred-filler)); nothing prefers it once the race has run.
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
constraints at all (the space is empty), it says so and lists them together: the survival floor,
the kept and excluded talents and the trees' minimums ("no legal 51-point build fits the talent
constraints together: the survival floor (Heart of the Wild 5, Thick Hide 3, Feral Swiftness 2);
kept talents (Moonkin Form 1); at least 31 points in Feral Combat"). The baseline still runs its
first round, so the report has its numbers.

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
| `localFightRunner` | this thread, a job at a time | tests; where there are no workers |
| `WorkerPool.fightRunner` | the app's worker pool (`sim/run/pool.ts`, the worker's `fights` message) | the app (O3) |
| `threadRunner` | Node worker threads | `scripts/tune/optimize.mjs` |

Each lane keeps a few engines by plan key, least recently used out (`EngineCache`, 48 a lane), so
a candidate's later rounds reuse its engine. The pool and the CLI mirror each worker's cache (the
same operations in the same order), so a plan (about 17 KB) is sent only to a worker that lacks
it. A plan costs about 0.3 ms to build and an engine about 0.5 ms, so thousands of candidates are
cheap to set up.

## The objective

| Metric | Maximizes | Default for |
| --- | --- | --- |
| `dps` | DPS | DPS specs (D30) |
| `tps` | TPS | (on request) |
| `balanced` | 100 × (TPS ÷ TPS₀ + DPS ÷ DPS₀) | tanks (D30) |

`balanced` is D30's "TPS and DPS as equals: the sum of each one's change relative to the spec's
current default", with TPS₀ and DPS₀ the baseline's means. The baseline scores about 200, and a
difference of 1 is one percentage point: +3% TPS and −1% DPS is +2 points. TPS₀ and DPS₀ are the
baseline's means over the fights run so far, the same for every candidate in a round, and taken as
constants in the intervals. It's D28's Balanced aim too.

## The statistics

Each candidate's fights are paired with the baseline's and with the leader's, fight by fight. For
two candidates _a_ and _b_ over _n_ shared fights, the difference is the mean of _aᵢ − bᵢ_ and its
interval ± _z_ × the standard deviation of the differences ÷ √_n_ (`pairedInterval`). Every
interval reported is 95% (_z_ = 1.96). Measured on the bear, its default against the build that
won its search, 4,000 fights: the balanced score's per-fight standard deviation is 14.6 points
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
2. **First round only:** candidates with the same DPS and TPS on every fight are one candidate.
   The one with the least damage taken represents them (D30: what the sim can't value in the
   score is a tie-break), then the earlier one; the others are listed as its ties.
3. The **leader** is the survivor with the best mean score (the least damage taken breaks an
   exact tie, then the earlier candidate). Every survivor met every constraint before the race, so
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
the Wild ([below](#which-talents-matter)).

A talent that changes what a constraint reads is searched, whatever it does to the score
([the talent space](#the-talent-space)): with the effective-health floor, a talent that adds armor
or health and isn't in the floor is a search dimension, not a filler that only gets leftover
points; under crit immunity, so is one that adds defense. A bear's Thick Hide armor is modelled
(BR6, [druid.md §4.7](classes/druid.md#47-bear-armor-low-priority-tps-doesnt-need-it)), so it's in
the bear's effective health.

## Which talents matter

`screenTalents` (`src/sim/optimize/screen.ts`) takes each talent off (rank 0) and on (max rank)
in a few contexts: the setup's own build, and a build with every talent at max, so a talent that
acts only with another one shows up (Improved Revenge with Revenge, Berserk with Mangle); each with
the setup's rotation and every rotation variant the search tries. Then:

1. If the plan is the same with and without it in every context, it changes nothing: the engine is
   a function of the plan alone. No fights are needed. It's **none**.
2. Otherwise the two plans run the same 400 fights. If DPS and TPS are equal on every fight in
   every context, it's **survival** when damage taken differs (Toughness: armor from items lowers
   damage taken, but Forever's rage from a hit reads it before armor) and **none** when not.
3. If DPS or TPS differs, it's **objective**, unless its paired change in score is below zero with
   95% confidence in every context where it acts: then it's **harmful**. The bear's Heart of the
   Wild is: its 20% Stamina costs rage from every hit.

The screen also notes which of the sheet's numbers each talent changes (health, armor, effective
health, the boss's crit and crush chances, …), from the plans alone, for the constraints. Its runs
go to the runner a few at a time (twice its lanes, as the race keeps), each only if the search
hasn't been cancelled, so a cancel stops it within a run or two a lane.

The contexts' builds aren't legal (the plan builder doesn't need them to be). The screen's
effect, the change in score with the talent at max rank, divided by its ranks, is its **score per
point**, which orders where leftover points go (below).

## The talent space

`talentSpace` (`src/sim/optimize/talents.ts`) builds every *sensible* build under the constraints,
not every legal one, which would be astronomically many:

- **Objective talents are the search.** Each is at 0 or its max rank in a build's **core**. One
  whose screened effect is below zero, though not clearly enough to be harmful (Feral Swiftness
  for a bear), is never forced by the maximality rule below nor given leftover points: builds with
  and without it both race.
- **So is a talent a constraint reads.** One that changes a sheet number a constraint reads
  (Toughness's armor, Sacred Duty's health, under the effective-health floor) is a dimension too, whatever its role, so builds with and without it
  both race. A harmful one (Heart of the Wild, when the floor doesn't keep it) is searched but
  never forced by the maximality rule below, nor given leftover points.
- **Leftover points go to partial ranks, the preferred filler, then fillers.** Points the core
  leaves go first to partial ranks of objective talents, where the sim measures them, the most
  score per point first; then to a warrior's or paladin's **preferred filler**, Anticipation
  ([below](#the-preferred-filler)), whatever the screen made of it; then to partial ranks of the
  dimensions only a constraint made (Toughness under the effective-health floor); and then to
  **fillers**, the talents that can't change the score: survival ones first (a tie-break on damage
  taken), then the rest; the spec's own tree first, then the shallower tier, then code order. So a
  partial rank goes where the leftover points do the most, and D30's "points a build has left after
  its threat talents go to Anticipation before Toughness or other weaker talents" holds. `--partials`
  (`searchPartials`) searches partial ranks instead, one per build, a far larger space.
- **Tier gates and arrows** (5 points a tier in the lower tiers of the same tree; an arrow's
  prerequisite at max rank, [talents.md](data/talents.md#tier-gates)) are met with fillers where
  the core doesn't meet them, the least needed. A prerequisite that isn't objective comes with its
  talent (Concussion Blow with Shield Slam).
- **Constraints:** a tree's minimum points (`--min-tree Protection=31`), talents kept at a rank
  (`--keep`) and excluded (`--exclude`). A tank's search spends **at least 31 points in its tank
  tree** unless told otherwise (D30; `TANK_TREE`, `src/sim/optimize/floor.ts`): Protection for
  the warrior and paladin, Feral Combat for the bear. `--min-tree` merges with it: a minimum for
  the tank tree replaces its 31 (`--min-tree Protection=0` drops it), and one for another tree
  joins it. A tank's
  **survival floor** is kept in every build (`SURVIVAL_FLOOR`, the same file), from its class doc:
  [warrior §6.4](classes/warrior.md#64-survival-floor),
  [druid §7.6](classes/druid.md#76-survival-floor),
  [paladin](classes/paladin.md#protection-survival-floor). It holds the defensive cooldowns and,
  by user decision (D30), the avoidance talents: a warrior's and a paladin's **Deflection 5/5**,
  and a bear's **Feral Swiftness 2/2**: the model says avoided hits cost a tank rage, mana and
  Reckoning procs, so a threat-first search drops them, but tanks take them. **Anticipation is not
  in the floor** (user decision, D30): it's the warrior's and paladin's **preferred filler**
  ([below](#the-preferred-filler)). Toughness is optional: the search decides its ranks (under the
  effective-health floor it's a dimension). `--no-floor` drops the floor; `--keep` extends it for
  one search (kept talents join it in every build: `--keep Anticipation` holds it at 5/5); a
  spec's default floor changes in `SURVIVAL_FLOOR` and its class doc together. Harmful talents are
  never taken unless kept, searched for a constraint, or the preferred filler.
- **Maximal builds only.** If another objective talent fits at max rank in the points a core
  leaves (they'd otherwise go to partial ranks and fillers), the build that takes it scores at
  least as well, since no objective talent lowers the score, so only that one is kept. Only an
  objective dimension is a raise: one only a constraint made (Toughness under the effective-health
  floor) has no screened value, so a build without it may score better, and a core that leaves
  room for it keeps its points for the fill order (Anticipation first) instead of being dropped
  (OV3-1). The check is one talent at a time: a build that could only do better by swapping one
  talent for another stays, and the race decides.
- **One tree at a time.** Tier gates and arrows never cross trees; only the 51-point total does.
  So each tree's cores are enumerated alone, each with the least points it can be legal in and the
  fewest extra points any one more objective talent would cost, and cores are combined across trees
  by points. A combination is kept when its leftover points are fewer than every tree's cheapest
  raise.

Every build is checked with the app's own `validateTalentBuild`, encoded with `encodeTalentCode`,
and must decode back to the same ranks.

### The preferred filler

**Anticipation is a warrior's and a paladin's preferred filler** (user decision, D30, after the
guild's lead theorycrafter's Protection paladin build, `240003-0530213321301551-502`, took
Anticipation 2/5 and measured +1.0% TPS over the floor-bound default; `PREFERRED_FILLER` in
`src/sim/optimize/floor.ts`). It left the survival floor, so a build may take fewer than 5 ranks,
but tanks take it, and the sim sees only half of what it does: its avoided hits cost threat in the
model (no rage from a dodged hit, no Reckoning charge or Shield Specialization mana), and what
they're worth, the damage a tank doesn't take, isn't in the score. So it's preferred **in the
fill order**, and only there: a build's leftover points go to it after the objective talents'
partial ranks and before Toughness or any other filler ([above](#the-talent-space)), whatever the
screen made of it (`preferred` in `talentSpace`). Where the screen makes it an objective talent,
builds with and without it race as for any other; and a build with room for 5 more points and no
Toughness keeps them for Anticipation rather than being dropped for want of Toughness (OV3-1).

**The race's leader is the answer**, whatever its Anticipation. An end-of-race rule that preferred a
candidate level with the leader that had more Anticipation (within 0.5% of its score or inside its
paired interval) was cut at step 6 of O1's review, after two rounds in a row found new problems in
it (D30, "Simplified after O1's third review round"). An answer that drops Anticipation entirely
when the gain is clear is acceptable (user decision: the warrior's Deep Wounds build, +4.4 points).
`--exclude Anticipation` searches without it, and `--keep Anticipation` holds it at 5/5 as the
floor used to. The bear has no preferred filler: its avoidance, Feral Swiftness, is in its floor.

The spaces at the default setups (tanks with 31 points in their tree, their survival floor, the
preferred filler, and the effective-health floor, which makes Toughness a dimension), from the
screens of 2026-09-24 with D30's preferred filler (the
defaults of that day's T3 and T4 gear; the kept talents aren't dimensions; Anticipation is one of
the warrior's and paladin's objective ones). The candidates are the builds and the setup itself
when it keeps the constraints (the warrior's default isn't among its space's builds; the bear's
and the paladin's are), and each race runs the baseline beside them:

| Spec | Dimensions | Builds | Candidates | Legal tree cores | Dominated |
| --- | --- | --- | --- | --- | --- |
| `warrior-protection` | 23 objective + Toughness | 4,735 | 4,736 | 3,184 | 6,758 |
| `druid-feral-bear` | 17 objective | 129 | 129 | 1,314 | 1,080 |
| `paladin-protection` | 27 objective + Toughness | 8,918 | 8,918 | 2,752 | 3,585 |
| `warrior-fury` (no constraints) | 20 objective | 288 | | 1,636 | 1,507 |

So on `quick` the warrior's space runs 94 fights each in the first round, the paladin's 50 and the
bear's and Fury's 1,000. With Anticipation 5/5 in the floor (before D30's preferred filler) the
warrior's space was 3,544 builds and the paladin's 10,805; before Feral Swiftness joined the bear's
floor, its space was 199 builds (200 candidates with the setup). Enumerating takes about a second.
Before the tree-by-tree combination and the leftover-point rule, the Protection warrior's space was
17,644 builds and took eight minutes to list; the paladin's passed 50,000.

## Talents and rotation together

A rotation setting is a candidate too: `--sweep id=a:b:step` and `--rotation "a=1,b=2"` take
rotation.mjs's `id=value` form (`scripts/tune/lib.mjs`), each variant on top of the setup's.

- **Together** (`--search both`): every build with every variant, one race. The screen tries each
  variant too, so a talent that only a variant uses counts.
- **In turns** (`--turns`, `optimizeInTurns`): the talents with the setup's rotation, then the
  variants with the winning build, then the talents again with the winning variant, until a pass
  keeps its start or has no answer. Each pass spends the whole budget. Every pass races its start,
  the last pass's winner, beside the new candidates, so a rotation pass whose variants are all
  worse keeps the talent pass's winner; the answer never gets worse from one pass to the next, up
  to the race's own error. Every pass holds every candidate to every constraint, the talent ones
  included: a rotation pass keeps the start's build, but the setup itself races in it only if it
  keeps them (the verification's repro: with Ferocity excluded, the rotation pass once fell back to
  the default, which takes it). The baseline stays the setup itself, so `balanced` is always
  relative to it.
- **Rotation only** (`--search rotation`): the variants with the setup's talents. No talent is
  searched, so there are no talent constraints; sheet constraints still hold. The CLI
  refuses the talent flags with it (`--keep`, `--exclude`, `--min-tree`, `--no-floor`,
  `--partials`) rather than drop them: search talents too (`--search both` or `--turns`) to use
  them.

In turns, the CLI prints each pass's header (`=== pass 2: rotation ===`) before its space and
rounds.

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

The first round runs 30% of the budget over the candidates, between 50 and 1,000 fights each
(`firstRound`): 20,000 candidates get 90 each on `standard`, the bear's 129 get 1,000.
`fitBudget` fits a space too big for its budget rather than failing, and the CLI prints a note
saying what it changed:

| Candidates | What the first round does | `quick` | `standard` | `thorough` |
| --- | --- | --- | --- | --- |
| up to 30% of the budget ÷ 1,000 | 1,000 fights each | ≤ 450 | ≤ 1,800 | ≤ 7,200 |
| up to 30% ÷ 50 | 30% of the budget, 50 to 1,000 each | ≤ 9,000 | ≤ 36,000 | ≤ 144,000 |
| up to 90% ÷ 50 | 50 each, up to 90% of the budget | ≤ 27,000 | ≤ 108,000 | ≤ 432,000 |
| up to 90% ÷ 20 | 90% of the budget, fewer than 50 each (down to 20): it drops fewer, and the race may end on the budget | ≤ 67,500 | ≤ 270,000 | ≤ 1,080,000 |
| more | 20 each, and the budget grows to twice that first round | | | |

So `quick` suits a space of up to about 9,000 candidates, `standard` 36,000 and `thorough`
144,000; past three times that, pick the next budget or narrow the search (keep or exclude
talents, fewer rotation variants). The tanks' default spaces are in [the talent space](#the-talent-space). A race usually stops long
before its budget: most candidates are clearly worse after the first round. The speeds are this
machine's under load (80,000 a second on 12–15 threads is about 6,000 fights a second a thread;
the engine does 6,000–10,000 per core by spec).

## Confirmation

A search that compares thousands of candidates at 95% turns up false wins, so the winner is run
again against the baseline on a **fresh master seed**, one the search never used (D23), with
40,000 fights each by default (`confirm`, the CLI's `--confirm`). It's adopted only if its
interval is still above zero. The CLI runs the check twice, with D12's unmeasured ratings applied
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

1. Run the search at the default setup with the spec's default constraints: a tank with 31 points
   in its tree, its survival floor and the effective-health floor; a DPS spec with none. Use the
   `thorough` budget. When the setup itself leads, as a candidate, the default stands.
2. A result that ends on the budget isn't a winner yet: run again with more budget, or, when the
   survivors are within the noise of each other, take the leader and say so.
3. Confirm the leader on a fresh seed with `--confirm`. It replaces the default only if it clears
   D23's bar there and doesn't depend on an unmeasured rating.
4. Record the change, the numbers and the command in the spec's class doc, update the default
   build (`src/sim/defaults.ts`), and re-snapshot the goldens with the explanation.

## Reading the results

The CLI prints the screen, the space, each round, a table of standings and the result, and writes
a JSON report under `.cache/optimize/`. A standing has:

- the build and its changes from the default ("Shredding Attacks 0→3"), or "the setup itself"
  for the copy of the setup that raced as a candidate
- mean TPS, DPS, damage taken per second, health, effective health, and the boss's crit and crush
  chances against it
- its paired change from the baseline in score, TPS, DPS and damage taken, each with its 95%
  interval, over the fights it ran
- its fights, and its state: the leader, a survivor, or dropped in round _r_ as clearly worse,
  with the candidates tied with it

Candidates dropped early ran fewer fights, so their intervals are wider; the table lists the
leader, then the survivors, then the dropped by how long they lasted. The baseline isn't a row:
its numbers are the line under the table. The CLI also says what the setup itself fails (it's then
only the baseline), how many candidates each kind of constraint left out, and, when there's no
answer, "no setup meets these constraints" with `blocked`'s reasons. The line after the result
compares the leader, the answer, with the default. With no leader, the standings have no
comparison with one (`vsLeader` is left out of the JSON).

## Limits of the method

- **Maximality assumes no raised talent lowers the score.** The screen calls a talent harmful
  only when its interval is below zero everywhere it acts; one whose screened mean is below zero
  but whose interval reaches it (Feral Swiftness for a bear) isn't raised by maximality, so builds
  with and without it race. One whose mean is just above zero, though its true effect is
  negative, is still raised when it fits.
- **Maximality counts only objective talents.** A dimension only a constraint made (Toughness
  under the effective-health floor) is never forced: the build without it keeps its points for
  the fill order, Anticipation first (OV3-1), and the build with it races too.
- **The screen's sign and score per point come from a few contexts**, 400 fights each. A talent
  that helps only in a build far from both contexts can be misjudged; `--screen-fights` raises the
  fights.
- **Exact ties are judged on the first round's fights.** Two candidates that differ only on rare
  fights would be merged; with 50 or more three-minute fights that's an effect far below anything
  the race could separate.
- **Maximality is one talent at a time** (above): swaps are left to the race.

## Worked examples

These are unit tests (`src/sim/optimize/*.test.ts`).

- **Effective health.** 10,000 armor against a level-63 boss: K = 400 + 85 × 63 = 5,755, so armor
  stops 10,000 ÷ 15,755 = 63.47% of a hit, and 8,000 health is 8,000 ÷ 0.36528 = 21,901 effective
  health.
- **The balanced score.** +38.3 TPS on 687.4 (+5.57%) and +16.3 DPS on 359.9 (+4.53%) is +10.1
  points.
- **The first round.** `quick` (1,500,000 fights) over 7,000 candidates: 30% of the budget is
  450,000, 64 fights each. Over 10 candidates it's capped at 1,000.
- **Capstones.** With only Mortal Strike, Bloodthirst and Shield Slam objective, every build has
  exactly one of them: two need 62 points, and a build with none has the points for one.
- **A toy race.** Twenty candidates at 1,000–1,019 DPS and one at 1,030, with noise they share
  each fight: the race finds the 1,030 one and separates it at 95%, the same with 1 lane or 7 and
  whatever order the jobs finish in.
- **The winner's curse.** A thousand candidates level at 1,000 DPS and one at 1,000.1, over a
  first round of 50 fights: in 20 races an uncorrected 99% bar drops the true best in the first
  round at least once; the corrected bar, z = 4.92 (Student's t at 0.5% ÷ 999, 49 degrees of
  freedom), never does.
- **Fitting the budget.** `quick` (1,500,000) over 50,000 candidates: 50 fights each would be
  2,500,000, so the first round runs 27 each (90% of the budget, rounded down); over 100,000, even
  20 each doesn't fit, so the budget grows to 4,000,000.
- **In turns.** From the bear's 8/43/0 (`--talents 050012-5523032120132210551-`), the talent pass
  finds a build 14.2 points ahead; holding Maul for 90 rage costs it 1.6 points, so the rotation
  pass keeps the talent pass's winner with the setup's rotation (it fell back to the baseline
  before the review's fix).
- **Every pass holds the constraints.** The bear in turns with Ferocity excluded and Maul held for
  90 rage: no pass answers with the default, which takes Ferocity (`optimize.test.ts`, OV-1).
- **No setup.** The Protection paladin under crit immunity on its default gear: the builds with
  Anticipation 5/5 reach 330 defense at best (the boss's crit 4.40%), so no candidate races and the
  report says crit immunity blocks it (OV-2).
- **The setup wins as a candidate.** The bear with one rotation variant, Maul held for 90 rage:
  its own rotation leads, as the copy of the setup, 0 ± 0 against the baseline it's identical to,
  and it runs no fights of its own (OV2-5).
- **The preferred filler.** Shield Slam's 31 points in Protection leave 20, and Anticipation takes
  5 of them before Toughness, whether the screen calls it harmful, survival or no effect. A
  Protection build kept whole at 34 points with 5 to 9 left over: the build without Toughness keeps
  them, Anticipation 5 and the rest to Toughness, beside the build with Toughness 5, whether the
  screen calls Anticipation objective, no effect or harmful (OV3-1; `talents.test.ts`).
- **No result limits.** The best DPS takes 20% more damage than the rest: it leads all the same,
  and `taken<=102%` is refused as a fight result (`race.test.ts`, `optimize.test.ts`).
- **Nothing fits the talent constraints.** The bear keeping Moonkin Form: no legal 51-point build
  holds it, the floor and 31 points in Feral Combat together, and the report lists all three
  (OV2-3).
