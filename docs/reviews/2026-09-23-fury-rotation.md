# Fury's best rotation, M2.5b (2026-09-23)

Fury's default rotation becomes the best one found (D23), as M2.5a did for Arms: the Overpower
dance on, Heroic Strike from 40 with its cancel below 20 and kept in the execute phase,
Whirlwind at 0.5 s, Death Wish and Recklessness timed to the execute phase, the potion at 0 rage
in the phase, and Hamstring off. Also Arms' follow-ups from M2.5a's verification (V1–V5).
Rebased onto main `030d045` (the paladin foundation): `0c4f105`..`4866dad`.

On a seed the search never used, 400,000 paired fights: **+42.88 DPS (+6.39%, 670.62 → 713.50,
95% CI +42.73 to +43.03)**. The Fury golden goes 668.63 → 716.09. Arms, Protection, the druid and
the paladin are unchanged.

## Full reviews (new work, D20)

**Logic.** The reviewer reproduced the confirmation exactly, and again on a fresh seed (+42.86).
Each adopted change still clears the bar inside the package, the robustness grid reproduces cell
for cell, and Arms is bit-identical.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| FL1 | medium | introduced | **With an execute phase shorter than about 15 s, the potion in the phase lost up to 5.3% to drinking it with Recklessness.** | fixed, `b078add`: the potion goes with a Recklessness that came by its clock (`COND.executeNotWithin`, 29). Fresh seed: +0.8% to +5.2% in every cell where it acts |
| FL2 | low | introduced | **Three changes that don't act in the default setup were adopted on robustness checks,** which D23 didn't cover. | fixed: D23 gains a paragraph for such changes (a fresh seed in each cell where they act, no loss over 0.1% elsewhere) |
| FL3 | low | introduced | **The "in the winner" numbers came from builds not on the branch.** | fixed, `269bab6`: §5.2 says how they were measured, and the 60 s figure is 1.6% |
| FL4 | low | introduced | **§6.2 said Arms in Berserker Stance waits for Recklessness to drink the potion;** it doesn't. | fixed, `bff205e`; the wait for Arms is unmeasured, listed in §6.2 |
| FL5 | low | pre-existing | **The rotation's exact knowledge of the phase start and fight end wasn't listed.** | fixed, `e5a5e5c`: the `knownFightTimings` assumption, with measured costs of misjudging it |
| FL6 | low | introduced | **Test gaps:** Death Wish's phase line, Hamstring's conditions, and Bloodrage after a swap. | fixed, `8d9935d` |
| FL7 | info | introduced | **Recklessness's help overstated the 16 s reason.** | fixed, `de50d8c` (with FU3) |
| FL8 | info | introduced | **Heroic Strike from 40 rests on the unconfirmed off-hand queue rule.** | fixed, `269bab6`: noted in §5.2, within D24's 1% |
| FL9 | info | introduced | **An old setup keeps its values but still moves (+1.4%).** | no change needed |

**UX.** The reviewer checked Fury's and Arms' Rotation tabs at 390 and 1280, light and dark, and
old saved setups.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| FU1 | medium | introduced | **"Mighty Rage Potion up to" stayed undimmed with Execute off.** | fixed, `7b9d22c` |
| FU2 | low | introduced | **The Buffs potion line said "at the start of the execute phase".** | fixed, `7b9d22c` |
| FU3 | low | introduced | **Fury's and Arms' help for "Recklessness in the last" contradicted each other.** | fixed, `de50d8c`: one shared text |
| FU4 | low | introduced | **Fury's Death Wish label no longer matched.** | fixed, `7b9d22c` |
| FU5 | low | introduced | **The Overpower help's "15" was unexplained.** | fixed, `7b9d22c` |
| FU6–FU9 | low | introduced | **Hamstring, Heroic Strike in the phase, potion and cancel help copy.** | fixed, `7b9d22c` |
| FU10 | low | pre-existing (breaks ux.md's dimming promise) | **Settings that need an execute phase stayed undimmed at 0% under Fight.** | fixed, `7b9d22c`: `needsExecutePhase` |
| FU11 | low | introduced | **ux.md's example hint used a default that no longer exists (42 rage).** | fixed, `7b9d22c` |
| FU12 | low | pre-existing | **"Cooldowns and buffs" wraps beside "Advanced · 3 changed" at 390.** | known gap: readable, nothing clipped |

## Verification of the fixes and the rebase (D25)

**The gate passes.** Every finding is fixed. FL1 reproduces on fresh seeds 6611 and 6618, with
all seven acting cells clearing the bar and no losses elsewhere. `executeNotWithin` resolves
correctly at its boundary. Arms, Protection and the druid are fight-for-fight identical to main.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| FV1 | low | introduced (FL1) | **§5.2 said FL1 changes nothing in the default fight,** but its 20 s wake-up reorders a few same-millisecond ties. | fixed, `4866dad`: 7 of 400,000 fights on seed 5303, a mean of +0.00004 DPS, as the rebase's check counted them |
| FV2 | low | introduced (D23 text) | **The amendment's wording was loose.** | fixed: the grid's lengths, "point estimate", and "each cell where it acts" |
| FV3 | nit | introduced | **The golden's history didn't name FL1.** | fixed, `4866dad` |

The lead rebased the branch onto the paladin foundation: the COND table kept main's `minMana` 18
and its reservations, with `executeNotWithin` at 29; the commit that had moved it from 17 became
empty and was dropped. A fresh reviewer checked the resolution (Fury, Arms and Protection
identical to the pre-rebase branch; cat, bear and paladins identical to main) and the FV fixes:
**pass**, with two lows. The first corrected FV1's count, 3 fights to 7 (fixed in `4866dad`).
The second is that `47729ca`'s message still says 17 while the commit pins 29 (waived: history only;
this log records it).

Rebased branch: lint ✓ · typecheck ✓ · unit ✓ (1284; the benchmark missed its floor once at load
average 42, 4,943 fights/s, and passed on rerun) · e2e ✓ (239).

## Verdict

**Ready to push: yes.**
