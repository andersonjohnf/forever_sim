# The phone bar's Details button, and the custom domain (2026-09-24)

The guild's officers missed the results sheet on phones: the bar's only sign of it was a small
chevron next to "Run again", so they took the headline for the whole result. The bar's button is now
named "Show results and details" and carries a labelled **Details** pill. The same batch records
decisions D28 (three tank rotations) and D29 (every value has a default; presets geared for what
they measure) in the docs.

## Combined review (`0cafaa0`, `f44d4e9`)

The reviewer walked every bar state (empty, first run, result, re-run with its %, stale, ▲/▼ after
a changed setup, failed) for Fury, Warrior Protection and Paladin Protection at 320–1023 px, light
and dark, measuring the headline's edge against the pill's, and checked keyboard, screen reader
and label-in-name.

| id | sev | origin | finding | disposition |
| --- | --- | --- | --- | --- |
| DR1 | high | introduced | A tank's ▲/▼ changes slid under the pill at 320–414 px. | fixed, `6862991` (then replaced by the simpler design below) |
| DR2 | medium | introduced | The pill's outline was `--border`, about 1.25:1. | fixed: `--input`, 3.64:1 light, 3.5:1 dark |
| DR3 | low | introduced | A DPS bar grew taller in more states. | fixed by the simpler design |
| DR4 | low | introduced | ux.md still said 375 px. | fixed |
| DR5 | low | introduced | D28 wasn't tracked or pointed to from D26. | fixed: D26 points to D28; milestones M5.6 T5 |
| DR6 | low | introduced | D28 was unclear per class and on hand-set settings. | fixed: D28 settles both |
| DR7 | low | introduced | The name contains "Details" but doesn't start with it. | waived: it passes WCAG 2.5.3, and renaming again would churn every test and snap command for no user-visible gain |
| DR8 | low | introduced | The focus ring touched the pill. | fixed: `pr-1` |
| DR9 | low | pre-existing | A tank's bar grows 16 px with a badge row. | known gap |
| DR10 | info | introduced | Snap's exact `--click "Show results"` no longer matches; two test titles used the old name. | fixed: docs and titles |

## Verification pass (`6862991`, with the Hunter's on main `1750dbb`)

| id | sev | origin | finding | disposition |
| --- | --- | --- | --- | --- |
| VF1 | medium | introduced by the fixes | At 360–365 px the failed bar's "Couldn't simulate" ran under the pill. | fixed by the simpler design: the bar says "Failed" |
| VF2 | medium | pre-existing | At 429–449 px (the iPhone Plus and Pro Max widths) a changed setup's ± and change wrapped and the bar grew; `max-[429px]` also missed 429 px by one. | fixed by the simpler design |
| VF7 | low | pre-existing | A DPS spec's "Setup changed" badge wraps at 360 px; nothing overlaps. | known gap |

The Hunter's VF3–VF6 are in [2026-09-24-hunter.md](2026-09-24-hunter.md).

**Two rounds in a row found new layout problems in the bar, so step 6 applied:** the lead proposed
a simpler design and the user chose it. The bar's headline is now only the value and the change's
arrow, at every width, beside the Details pill; the ± and the amount are in the sheet, the Simulate
button has no icon in the bar, and a failed run reads "Failed". One rule instead of breakpoints
(`8b1cb5d`). The lead re-ran both reviewers' probes on it: no overlap in any state at 320–1023 px,
text ranges clear of the pill in the failed state, and a constant 65 px bar at every even width from
320 to 520 px. The phone-bar e2e specs pass (54).

## The custom domain (`43fbfd6`, pushed ahead of this gate)

The user pointed GitHub Pages at `sim.decades.gg`. The domain serves the site at `/`, so the
`/forever_sim/` base left the live page blank (its scripts 404), and the old github.io URL redirects
there. At the user's request the one-line base change was pushed as a hotfix from the deployed
commit, after `npm run test:full` (only the load-dependent speed benchmarks failed; 355 e2e and the
smoke suite passed) and before its review. The live site was then checked in a browser: it loads,
simulates, logs no errors, and the old URL lands on it. Its review runs with the next push's gate.
