# Engine issue fixes: GitHub #2, #3, #4, #9, #10 (2026-09-24)

Range: `94cf0bfa..356b507b` (the issue fixes: Gnome Expansive Mind for every class, Arms's
Whirlwind after Recklessness, Inner Focus's crit, one caster Berserking and Blood Fury, the shared
engine paths and Wind Blessed's casting speed), and the fix round `356b507b..2a2b7c5e`.
Reviewers: a fresh reviewer who wrote none of it, a combined logic and UX review (D27); the fix
round by its own agent, for a verification pass by a fresh reviewer (EI-1 and EI-2 changed engine
logic). Probes: `.cache/probes/engine-issues-review/` in the reviewed worktree; the fix round's
`.cache/probes/ei/` in its own.
Checks (fix round): lint ✓ · typecheck ✓ · unit ✓ (the benchmarks and timeouts that failed at a
load average of 43 pass alone) · e2e ✓ (mage, priest, rogue, warlock, demonology, shaman,
elemental, protection-rotation, rotation-tab and priority-list specs: 92 passed)

## Findings

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| EI-1 | medium | introduced (exposed by Wind Blessed's casting speed; the ties are older) | Fire mage DPS drops as soon as casting speed rises above 1.000, so a Skyborne's new Wind Blessed casting speed was a loss (515.60 → 512.99). | fixed in `be8c1411`. Three ties on an unhasted mage's 1.5 s grid, not one: Fire Blast's cooldown ending the very ms a cast did (a hair faster, a 3 s Fireball started first: 21.1 → 19.0 Fire Blasts a fight), the next Pyroblast landing with its own DoT's tick (faster, it cut the tick off), and a Scorch after a 4.5 s Pyroblast landing as Fire Vulnerability ran out, which at ×1.00 dropped it (the reviewer's trace had the drop at ×1.00, not with haste). Fireball waits up to 0.3 s for Fire Blast, Pyroblast up to 0.3 s for its DoT's tick (COND 45 `dotTickWait`), and Scorch goes first when the Pyroblast or Fireball below, then a Scorch, wouldn't land in time (COND 44 `auraEndsBeforeCasts`) [?] (`mageFireWait`). Human, unlimited mana, 4,000 fights: ×1.00 / ×1.002 / ×1.01 / ×1.02 = 558.3 / 552.5 / 555.8 / 559.7 before, 561.3 / 560.3 / 562.6 / 565.4 after. Wind Blessed now +0.4 Fire DPS (+1.5 with unlimited mana). Fire golden 513.15 → 514.50. mage.md "Fire priority" rows 9, 10, 12 and the race rows re-measured (Orc 521.13, Human 520.65, Undead 517.96, Troll 516.26; seed 12345, 20,000 fights). Tests: `mage.test.ts` "the Fire priority at any casting speed" (Fire Blast's wait, Pyroblast's wait, no Fire Vulnerability drop at ×1.00 / ×1.002 / ×1.01, ×1.01 and ×1.02 DPS at least ×1.00's within its CI), each failing on the old rotation |
| EI-2 | medium | pre-existing | Gnome Eureka! was modelled as zero for every class that has it (D29): the mage, warlock, priest and rogue, and the warrior too (only an assumption said so). | fixed in `2a2b7c5e`: each class's variant from the client [F] (cost −40% / −20% / −50% / −50% / −15%, damage and periodic +10%, 3 charges, 15 s, 2 min), the abilities each modifies from its spell masks (a data test recomputes them), an engine charge aura (`Plan.eureka`) whose marked abilities pay the cut cost, rounded down, spend a charge as they're paid and deal +10% [?] (`eureka`); every Gnome class presses it with its other racials. Gains: Fury +1.48%, Arms +1.46%, Protection +0.64% TPS, Combat +0.75%, Assassination +1.75%, Subtlety +0.87%, Fire +1.98%, Frost +0.84%, Arcane +0.32%, Affliction +2.19%, Demonology +0.95%, Destruction +1.36%, Shadow +1.11%. No golden moves (no default is a Gnome); Fury's plan snapshot moves only Gnome cases. Tests: `classes/eureka.test.ts`, `build.test.ts`, `index.test.ts` |
| EI-3 | low | pre-existing | The `cooldownRacial` assumption was the warrior's ("its 40% cost cut") for every Gnome class. | fixed in `2a2b7c5e` with EI-2: `cooldownRacial` can no longer be true and is gone; the new `eureka` assumption names the class's own cut ("40% rage", "20% Energy", "50% mana", "15% mana") |
| EI-4 | low | introduced | The Gnome rogue's Energy cap wasn't a whole number: 115.5 with Vigor 2/2, 110.3 with 1/2. | fixed in `d8eb5c5c`: floor(total × 1.05), 105 / 110 / 115 [?]; rogue.md §2.1 and the `gnomeEnergy` assumption say so |
| EI-5 | low | introduced | Test gaps: the Gnome rogue's cap in a fight; the plain Whirlwind line never firing before Recklessness or in Battle Stance; Enhancement Troll's Berserking. | fixed: the rogue's cap in an engine test (`d8eb5c5c`); Arms's Whirlwinds before Recklessness each with its dance, from rage ≤ 30, none in Battle Stance; an Enhancement Troll's caster Berserking in its plan and pressed on cooldown in a fight (`c06dd893`) |

## Left for the verification pass

- EI-1: the 1 DPS left at ×1.002 (560.3 against 561.3) is within its runs' ±0.8. Evocation's 8 s
  channel can still let Fire Vulnerability run out: that isn't casting speed, and a mana-bound Fire
  mage Evocates about once a fight.
- EI-2's rules are [?]: a charge on a miss, the cut rounded down, Execute's base cost only, a
  charge spent by a Clearcasting or Inner Focus free cast. The Rotation tab's racial help texts
  now name Eureka!; no screenshot was taken of them.

## Verdict

Ready for the verification pass: yes.

## Verification pass (EV)

Range: `356b507b..84d7e048` (the fix round), by a fresh reviewer who wrote none of it. Probes:
`.cache/probes/ei-verify/` in the verified worktree; the fixes' `.cache/probes/ev/` in their own.
Checks (fixes): lint ✓ · typecheck ✓ · unit ✓ (the Fury benchmark, and two tests that timed out,
at a load average of about 30 pass alone) · e2e: see the fixes' report.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| EV-1 | medium | introduced (EI-2) | Mutilate's Eureka! damage was modelled as zero, and rogue.md called that the client's: the rogue's damage mask `[68290334, 2318]` overlaps the strike spells' `[0, 2]` (1241586 and 1241590, 1310705 and 1310706); only the cast spell (1241584) is outside it. | fixed in `84b8063a`: Mutilate lists its cast (1241584) for the cost and a strike (1241586) as its damage spell, as Arcane Missiles does, with the cost and damage bits [F] [client]; rogue.md §7.2 says so. Gnome Assassination's gain +10.70 DPS, +2.04% (was +1.75%; racial on vs off, seed 12345, 20,000 fights; the verifier had +10.71). Tests: `eureka.test.ts` (the masks test reads the damage spell for the damage bit; a Gnome Assassination rogue's next 3 Mutilates cost 48 Energy and both hands deal ×1.1) |
| EV-2 | low | introduced (EI-2) | Soul Fire (17924) is in the warlock's masks and wasn't listed; the data test couldn't catch an omission. | fixed in `84b8063a`: `soulFire` with the cost and damage bits; warlock.md §7.2 (Demonology +0.94%, was +0.95%). A new data test builds every Eureka! class's plans with every switch on and each choice at each of its values, and fails on any ability whose same-named class spell overlaps a mask but isn't listed, or that no client spell is named for (it failed on Soul Fire before the fix). A typecheck fix to it followed in `d429409f` |
| EV-3 | low | introduced (EI-1) | The default Fire mage's throughput fell about 23% (9,600–10,200 fights a second to 7,400–7,900), in the walk's new COND 44 and 45 and `castMsNow`, not extra events. | fixed in `75042de2`. Profiled: the cost was `conditionsHold` itself, whose `case COND.x` labels V8 tests one by one (in Vitest through the module runner's import bindings), reached about 120 more times a fight by the two new Scorch lines. The labels are now COND's numbers, each with its name after it (`engine/cond-cases.test.ts` checks the pairs), and COND 44 first compares against the casts' base times, which bound them while casting speed is at least ×1. COND 45 runs only once Pyroblast's Hot Streak condition holds (about 53 times a fight against 536 for all lines), so it's unchanged. Byte-identical: every spec's default, Gnome and Troll, at ×1, ×1.0005 and ×1.01, 300 fights each, match the engine before, and no golden moves. Medians, the engines alternating in one process: bundled in Node 20,621 → 22,092 (23,839 before EI-1); in Vitest 8,368 → 17,686 (10,556 before EI-1). The default Fury warrior: +6% in Vitest, unchanged bundled. architecture.md's hot-loop notes record it |
| EV-4 | low | introduced (EI-1; the grid is older) | A small tie-break still favours exactly ×1.000: 1–1.7 DPS (≤0.3%) at 600 s. | known gap, `14a7f5f7` (milestones): not idle (the waits a hair above ×1.000 total 61 ms a fight), and COND 44's tie rule is right (counting a Scorch that lands as Fire Vulnerability ends as in time costs ×1.000 3.5 DPS); ×1.000 casts about one more spell a fight (+0.9 Scorch, +0.26 Fire Blast). 570.55 ±0.46 at ×1.000, 569.28 ±0.44 at ×1.0005, 569.69 ±0.44 at ×1.002 (Human, unlimited mana, 600 s, 4,000 fights). The rest wasn't pinned down in the time given |
| EV-5 | low | introduced (EI-2) | The Eureka! copy overstated the damage bonus for Arcane Missiles, whose missiles are outside the mage's damage mask. | fixed in `d0fc07b5`: the mage's racial help says "your next 3 spells cost 50% less, and all but Arcane Missiles deal 10% more"; the `eureka` assumption says "those its damage masks cover deal 10% more, their DoTs too" |
| EV-6 | info | introduced (EI-1) | mage.md said 0.3 s "is where waiting stops paying" and that 0.15–0.5 s measure the same. | fixed in `b0ce7b56`: "near where waiting stops paying, across common casting speeds", with the measurements (Human, unlimited mana, seed 12345, 4,000 fights, waits 0 / 0.15 / 0.3 / 0.45 / 0.6 s): ×1.01 556.1 then 564.0 for each; ×1.05 573.3 / 573.8 / 576.1 / 575.6 / 575.2; ×1.10 592.3 / 592.3 / 591.9 / 590.5 / 590.3 |

EV-1 changed engine data (which abilities Eureka! modifies) and EV-3 the engine's hot loop, so both
go to a fresh check of their commits.
