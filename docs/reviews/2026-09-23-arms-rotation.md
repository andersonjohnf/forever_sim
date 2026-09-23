# M2.5a: Arms' best rotation as the default (2026-09-23)

Decision D23: the default rotation is the best one found, adopted on a paired 95% interval above
zero and confirmed on a fresh seed. The work lives on commits `1908832`..`f1b54e8` on `main`: the
tuning tool (`scripts/tune/rotation.mjs`), the new Arms defaults, their review fixes, and the
Rotation tab's copy.

**Result:** against the defaults before M2.5a, +37.02 DPS (+6.07%, 95% CI +36.87 to +37.18) on
fresh seed 3031 with 400,000 paired fights. The verifier reproduced it on its own fresh seed
90417: +37.26 (+6.11%). The Arms golden is now 647.48 DPS. Fury and Protection are unchanged,
fight for fight.

## Full reviews (new work, D20)

A fresh logic reviewer re-ran the numbers, and a fresh UX reviewer checked the Arms and Fury
Rotation tabs at 390 and 1280 px, in light and dark.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| AL1 | high, blocking | introduced | **Recklessness at 39 s left was fitted to the 180 s fight,** and lost up to 8.3% in fights under 90 s. | fixed, `f6d82cf`: Recklessness fires 1.5 s before the execute phase, or in the last 15 s, whichever comes first |
| AL2 | medium | introduced | **The potion at 0 rage was almost never drunk without an execute phase,** or with Execute off. | fixed, `f6d82cf`: 0 rage in the phase, a last chance in its last 4 s, and a fallback without it (20 s, up to 55 rage) |
| AL3 | medium | introduced | **The intro "the best rotation we've found" showed on Fury too.** | fixed, `f1b54e8`: a per-spec intro |
| AL4 | low | introduced | **The potion note's figures were each gain on top of the other.** | fixed, `f6d82cf` |
| AL5 | low | introduced | **Stale text** in warrior.md §5.2, §6.2 and `arms.ts`. | fixed, `f6d82cf` |
| AL6 | low | introduced | **The tuning tool could run a stale bundle,** and concurrent runs clobbered each other. | fixed, `4fa7d0a` (hash-keyed bundles, checked flags, `--against`) |
| AL7 | low | introduced | **The order of search and confirmation wasn't stated.** | fixed, `f6d82cf` |
| AL8 | low | introduced | **Charge and your own Battle Shout clear the bar but aren't adopted,** and D23 had no carve-out for them. | waived: Charge needs you out of combat, and the shout's gain comes from the raid's composition (Buffs tab). A D23 sentence is deferred to the next docs commit |
| AU1 | medium | introduced | **The Arms defaults failed quietly without an execute phase.** | fixed, as AL2 |
| AU2 | low | introduced | **The Recklessness help cited "the default fight"** with no advice for other fights. | fixed, `f6d82cf`: the timing now follows the phase |
| AU3 | low | introduced | **Heroic Strike's help stated an unmeasured assumption as fact.** | fixed, `9758185`: "reported to give no rage (unmeasured)", with the assumption listed |
| AU4 | low | introduced | **The intro used "we" and applied to every spec.** | fixed, as AL3 |
| AU5–AU7 | low | introduced | **Help wording.** | fixed, `9758185` |
| AU8 | low | pre-existing | **Number fields' accessible descriptions lacked their help.** | fixed, `f1b54e8` |
| AU9 | low | pre-existing | **Reset buttons read "…up to to 0 rage".** | fixed, `f1b54e8`: "Reset {label}, default {value}" |
| AU10 | low | introduced | **Old setups that relied on the defaults move to the new ones silently.** | waived: by design under D23; values a user set are kept |

## Verification of the fixes

Gate passes. The verifier confirmed each finding fixed, and reproduced the confirmation and the
robustness grid.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| V1 | low | introduced (docs) | **30 s fights with a 5–7% execute phase also lose slightly** (−0.5 to −1.1%), from Mortal Strike in the phase, as well as the documented 30 s, 0% gap. | deferred to the next batch: document it beside the 30 s gap |
| V2 | low | introduced (docs) | **warrior.md cites the pre-rebase commit `852f522`.** | deferred to the next batch: cite `3ad8e02`, its rebased equivalent |
| V3 | low | introduced | **The potion fallback's 55 rage assumes Boundless Rage 3/3** (a 130 cap). | deferred to the next batch: derive it from the build's cap, or document the assumption |
| V4 | low | introduced (UX) | **"Recklessness before the execute phase" isn't dimmed,** and its help doesn't say it needs a phase. | deferred to the next batch |
| V5 | nit | introduced | **"The fight's last 4 s" should be "the phase's last 4 s".** | deferred to the next batch |
| V6 | nit | introduced (tool) | **The tuning tool's flag messages and `--against`'s help.** | deferred: developer tool only |
| V7 | note | introduced | **An explicit `lastSec` can only bring Recklessness earlier.** | no change: documented, and the first round's default was never pushed |

Main after the merge (`f1b54e8`, a clean rebase with no conflicts, D25): lint ✓ · typecheck ✓ ·
unit ✓ (1059) · e2e ✓ (228, 3 deferred to M3).

## Verdict

**Ready to push: yes.** The gate passed. V1–V5 are small and go into the next batch, which is
reviewed before its push.
