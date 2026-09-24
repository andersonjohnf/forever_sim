# The optimizer

The sim finds the best talents (and rotation settings) for a setup itself, rather than assuming
them, as Raidbots' Top Gear does for gear
([D30](decisions.md#d30-the-sim-finds-the-best-talents-gear-and-rotation-itself-defaults-are-its-results-2026-09-24)).
This doc owns its method: how candidates are compared, what it maximizes, which constraints it
keeps, how the talent space is built, and how a spec's defaults come from its results.

**Status (O1, 2026-09-24):** the search core, the talent space, rotation settings as candidates,
constraints with effective health, and the command line (`npm run optimize`). Gear is O2, the
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
   ([below](#the-talent-space)), each with every rotation variant given. Candidate 0, the
   **baseline**, is the setup itself: the spec's current default, unless the caller changed it.
   A candidate that misses a sheet constraint (effective health, say) is left out here, before any
   fight.
3. **Race** the candidates on common random numbers until the leader is clear of the rest at 95%
   or the budget runs out ([below](#racing)).
4. **Confirm** the winner against the baseline on a fresh seed (D23; the CLI's `--confirm`).

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
   [budgets](#budgets)), then twice as many each round. The baseline runs every round, survivor or
   not, so every candidate's change from it is paired on the same fights.
2. **First round only:** candidates with the same DPS and TPS on every fight are one candidate.
   The one with the least damage taken represents them (D30: what the sim can't value in the
   score is a tie-break), then the earlier one; the others are listed as its ties.
3. **Constraints on results** drop a survivor whose 99% interval of a constrained metric lies
   wholly outside its limit ([constraints](#constraints)).
4. The **leader** is the survivor with the best mean score whose means meet every limit.
5. A survivor whose paired interval against the leader lies wholly below zero at **99%** is
   dropped. The stricter bar protects the true best: it's compared with the leader once a round,
   and at 99% a round has at most a 0.5% chance of dropping it by bad luck.
6. The race ends **separated** when the leader's paired 95% interval against every survivor lies
   above zero, D23's bar, or **budget** when the next round no longer fits: the last round then
   runs as many fights as the budget has left, the same for every survivor. A budget ending names
   the survivors the leader isn't clear of and how close they are.

Everything is decided at a round's end over whole arrays, and each job's samples go to fixed
positions, so neither the number of lanes nor the order jobs finish in changes anything.

## Constraints

What the sim can't value in the score is a constraint or a tie-break, never a guess (D30). A
constraint is a limit on a number, absolute or a share of a **reference** setup's (the baseline's
unless the caller names another). The CLI writes them `name>=value` or `name<=value`, with `%` for
a share (`src/sim/optimize/constraints.ts`).

- **Sheet constraints** read the character sheet: `ehp`, `health`, `armor`, `stamina`, `defense`,
  `dodgePct`, `parryPct`, `blockPct`, `blockValue`, `critReductionPct`, `hitPct`, `critPct`,
  `attackPower`. They need no fights, so a candidate that misses one is left out before the race.
- **Result constraints** read a fight metric: `dps`, `tps` or `taken` (damage taken per second).
  They're judged with their intervals in the race (step 3 above).

**Effective health** (D30, user decision) is max health ÷ (1 − armor's damage reduction against
the boss's level): the physical damage it takes to kill you. It uses the plan's armor and the
engine's own `armorReduction` ([damage-and-timing §1](mechanics/damage-and-timing.md#1-armor)).
Avoidance and block aren't in it: they lower average damage but don't survive a spike. A tank's
search keeps **at least 90% of the reference's effective health** by default (`EHP_FLOOR`,
`defaultConstraints`); the CLI's `--no-ehp-floor` drops it and `--require "ehp>=95%"` changes it.
A talent search's reference is the baseline, the spec's default gear and build; a gear search (O2)
passes the class's survival preset, the v1 tank gear. Every reported result shows its health,
effective health and damage taken.

Why it matters: survival costs a tank threat in Forever. Rage from a hit taken divides by max
health, and an avoided hit gives none ([rage.md](mechanics/rage.md#rage-from-damage-taken)), so
TPS alone would build a glass cannon. The talent screen finds exactly that for the bear's Heart of
the Wild ([below](#which-talents-matter)).

A talent that changes what a constraint reads is searched, whatever it does to the score
([the talent space](#the-talent-space)): with the effective-health floor, Toughness is a search
dimension, not a filler that only gets leftover points. A gap: a bear's Thick Hide armor isn't
modelled ([druid.md §4.7](classes/druid.md#47-bear-armor-low-priority-tps-doesnt-need-it)), so it
isn't in the bear's effective health.

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
health, …), from the plans alone, for the constraints.

The contexts' builds aren't legal (the plan builder doesn't need them to be). The screen's
effect, the change in score with the talent at max rank, divided by its ranks, is its **score per
point**, which orders where leftover points go (below).

## The talent space

`talentSpace` (`src/sim/optimize/talents.ts`) builds every *sensible* build under the constraints,
not every legal one, which would be astronomically many:

- **Objective talents are the search.** Each is at 0 or its max rank in a build's **core**.
- **So is a talent a constraint reads.** One that changes damage taken, under a limit on damage
  taken, or a sheet number a sheet constraint reads (Toughness's armor, Sacred Duty's health, under
  the effective-health floor) is a dimension too, whatever its role, so builds with and without it
  both race. A harmful one (Heart of the Wild, when the floor doesn't keep it) is searched but
  never forced by the maximality rule below, nor given leftover points.
- **Leftover points go to partial ranks, then fillers.** Points the core leaves go first to
  partial ranks of objective talents, where the sim measures them, the most score per point first,
  and then to **fillers**, the talents that can't change the score: survival ones first (a
  tie-break on damage taken), then the rest; the spec's own tree first, then the shallower tier,
  then code order. So a partial rank goes where the leftover points do the most. `--partials`
  (`searchPartials`) searches partial ranks instead, one per build, a far larger space.
- **Tier gates and arrows** (5 points a tier in the lower tiers of the same tree; an arrow's
  prerequisite at max rank, [talents.md](data/talents.md#tier-gates)) are met with fillers where
  the core doesn't meet them, the least needed. A prerequisite that isn't objective comes with its
  talent (Concussion Blow with Shield Slam).
- **Constraints:** a tree's minimum points (`--min-tree Protection=31`), talents kept at a rank
  (`--keep`) and excluded (`--exclude`). A tank's **survival floor** is kept in every build
  (`SURVIVAL_FLOOR`, `src/sim/optimize/floor.ts`), from its class doc:
  [warrior §6.4](classes/warrior.md#64-survival-floor),
  [druid §7.6](classes/druid.md#76-survival-floor),
  [paladin](classes/paladin.md#protection-survival-floor). `--no-floor` drops it. Harmful talents
  are never taken unless kept or searched for a constraint.
- **Maximal builds only.** If another objective talent fits at max rank in the points a core
  leaves (they'd otherwise go to partial ranks and fillers), the build that takes it scores at
  least as well, since no objective talent lowers the score, so only that one is kept. The check
  is one talent at a time: a build that could only do better by swapping one talent for another
  stays, and the race decides.
- **One tree at a time.** Tier gates and arrows never cross trees; only the 51-point total does.
  So each tree's cores are enumerated alone, each with the least points it can be legal in and the
  fewest extra points any one more objective talent would cost, and cores are combined across trees
  by points. A combination is kept when its leftover points are fewer than every tree's cheapest
  raise.

Every build is checked with the app's own `validateTalentBuild`, encoded with `encodeTalentCode`,
and must decode back to the same ranks.

The spaces at the default setups (tanks with 31 points in their tree, their survival floor and
the effective-health floor, which makes Toughness a dimension), from the screen of 2026-09-24:

| Spec | Dimensions | Builds | Legal tree cores | Dominated |
| --- | --- | --- | --- | --- |
| `warrior-protection` | 24 objective + Toughness | 7,311 | 3,248 | 6,655 |
| `druid-feral-bear` | 17 objective | 180 | 2,602 | 2,271 |
| `paladin-protection` | 29 objective + Toughness | 24,312 | 4,352 | 6,131 |
| `warrior-fury` (no constraints) | 20 objective | 288 | 1,636 | 1,507 |

Without the effective-health floor (Toughness a filler) the warrior's space is 1,886 builds and
the paladin's 7,026. Enumerating takes about a second. Before the tree-by-tree combination and the
leftover-point rule, the Protection warrior's space was 17,644 builds and took eight minutes to
list; the paladin's passed 50,000.

## Talents and rotation together

A rotation setting is a candidate too: `--sweep id=a:b:step` and `--rotation "a=1,b=2"` take
rotation.mjs's `id=value` form (`scripts/tune/lib.mjs`), each variant on top of the setup's.

- **Together** (`--search both`): every build with every variant, one race. The screen tries each
  variant too, so a talent that only a variant uses counts.
- **In turns** (`--turns`, `optimizeInTurns`): the talents with the setup's rotation, then the
  variants with the winning build, then the talents again with the winning variant, until a pass
  keeps its start. Each pass spends the whole budget. The baseline stays the setup itself, so
  `balanced` is always relative to it.
- **Rotation only** (`--search rotation`): the variants with the setup's talents.

## Budgets

A budget is the race's fights, all candidates' together, the baseline's included. The screen's
fights come on top (20,000–27,000 for the four specs in the table above).

| Budget | Fights | 15 threads, ~80,000 fights a second | A browser's 8 workers, ~40,000 |
| --- | --- | --- | --- |
| `quick` | 1,500,000 | at most ~20 s | ~40 s |
| `standard` | 6,000,000 | at most ~75 s | ~2.5 min |
| `thorough` | 24,000,000 | at most ~5 min | ~10 min |

The first round runs 30% of the budget over the candidates, between 50 and 1,000 fights each
(`firstRound`): the paladin's 24,313 candidates get 74 each on `standard`, the bear's 181 get
1,000. A race usually stops long
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

## Defaults from the results

D30 makes a spec's defaults the optimizer's results under its default constraints, confirmed on a
fresh seed. This is O4's process, after the tanks' threat fixes (M5.6):

1. Run the search at the default setup with the spec's default constraints: a tank with 31 points
   in its tree, its survival floor and the effective-health floor; a DPS spec with none. Use the
   `thorough` budget.
2. A result that ends on the budget isn't a winner yet: run again with more budget, or, when the
   survivors are within the noise of each other, take the leader and say so.
3. Confirm the leader on a fresh seed with `--confirm`. It replaces the default only if it clears
   D23's bar there and doesn't depend on an unmeasured rating.
4. Record the change, the numbers and the command in the spec's class doc, update the default
   build (`src/sim/defaults.ts`), and re-snapshot the goldens with the explanation.

## Reading the results

The CLI prints the screen, the space, each round, a table of standings and the result, and writes
a JSON report under `.cache/optimize/`. A standing has:

- the build and its changes from the default ("Shredding Attacks 0→3")
- mean TPS, DPS, damage taken per second, health and effective health
- its paired change from the baseline in score, TPS, DPS and damage taken, each with its 95%
  interval, over the fights it ran
- its fights, and its state: the leader, a survivor, or dropped in round _r_ (as clearly worse, or
  as outside a result constraint), with the candidates tied with it

Candidates dropped early ran fewer fights, so their intervals are wider; the table lists the
leader, then the survivors, then the dropped by how long they lasted.

## Limits of the method

- **Maximality assumes no objective talent lowers the score.** The screen calls a talent harmful
  only when its interval is below zero everywhere it acts; one whose effect is near zero and
  uncertain (Feral Swiftness for a bear) is treated as helpful and taken when it fits.
- **Maximality ignores result constraints.** Under a limit on damage taken, taking one more
  objective talent can push a build over the limit (Death Wish raises damage taken), yet the build
  without it is dropped as dominated. The builds that keep the constrained talents instead are
  still in the space.
- **The screen's sign and score per point come from a few contexts**, 400 fights each. A talent
  that helps only in a build far from both contexts can be misjudged; `--screen-fights` raises the
  fights.
- **Exact ties are judged on the first round's fights.** Two candidates that differ only on rare
  fights would be merged; with 50 or more three-minute fights that's an effect far below anything
  the race could separate.
- **Maximality is one talent at a time** (above): swaps are left to the race.
- **A result constraint is judged by its mean** when choosing the leader; a leader near its limit
  may be over it on another seed.

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
