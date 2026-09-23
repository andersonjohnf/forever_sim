# The app's description, D24, the agent definitions and the push rule (2026-09-23)

Range: `e2a57ed`..`93cdb96` (4 commits):
- `9e7ba9d`: D24 and the track plan
- `13a7e06`: the builder and reviewer agents
- `48e2bad`: the app's description
- `93cdb96`: pushing at every stable state

A fresh reviewer covered the logic (docs, config) and the UX (the About sheet at 390 and 1280 px,
light and dark). The fix commit is `7174998`.

**Confirmed:**
- the About sheet's layout and contrast, and its screen-reader reading order
- the old spec-naming copy is gone everywhere
- the e2e keeps `index.html` in step
- the agent frontmatter is valid
- D24 agrees with D22
- the 39% base-health figure checks out
- lint ✓ · typecheck ✓ · shell-a11y ✓ (20)

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| L1 | high, blocking | introduced (`9e7ba9d`) | **CLAUDE.md's sourcing rule and character-stats.md's 2026-09-22 decision still forbade what D24 allows,** and the About copy promised no Vanilla values. | fixed, `7174998` |
| L2 | medium | introduced | **D24's bound was unclear:** "±1%" of what, values against rules, and the doctrine's copy looser than D24; the placeholder had no tag format. | fixed, `7174998`: two explicit rules, a tag format, and the doctrine copies the conditions |
| L3 | medium | introduced | **The lead's merges of parallel tracks fell outside the gate.** | fixed, `7174998`: `test:full` after each merge, and a verification pass for a merge that resolved conflicts or re-snapshotted goldens (D25, CLAUDE.md) |
| L4 | low | introduced, plus older text | **The milestones still waited for the user to push.** | fixed, `7174998` |
| L5 | low | introduced | **The track plan's heading and mapping were unclear.** | fixed, `7174998` |
| L6 | low | introduced | **The push cadence was only in CLAUDE.md.** | fixed, `7174998`: D25 |
| A1 | low | introduced | **The builder didn't set `isolation: worktree`,** and the reviewer skipped step 1. | fixed, `7174998` |
| U1 | low | introduced | **`index.html`'s comment said to update the description with each spec.** | fixed, `7174998` |
| U2 | low | introduced | **No test pinned the tank wording.** | fixed, `7174998`: the e2e reads the switcher's roles, and `src/app/specs.test.ts` covers the sentences |
| U3 | low | introduced | **"Specs so far" read as unfinished.** | fixed, `7174998`: "Covers Warriors: Fury and Arms." |
| U4 | low | pre-existing | **The nested "and" list gets ambiguous as specs ship.** | fixed, `7174998`: one class at a time, joined by "·" |
| U5 | nit | introduced | **The specs line sat 2 px under the description.** | fixed, `7174998` |
| U6 | low | introduced and older | **The README says "DPS and TPS"** before a tank ships, and the GitHub repo's description says "simple". | waived for the README: it describes the project's full scope, which the tracks are building now. The repo description is the user's call |
| U7 | nit | pre-existing | **No `og:url`.** | fixed, `7174998` |
| U8 | low | pre-existing | **About's game-data builds come from `warrior.json` only.** | deferred: listed in the known gaps |

Checks after the fixes: lint ✓ · typecheck ✓ · unit ✓ (1052) · e2e ✓ (225, 3 deferred to M3).

## Verdict

Ready to push: not yet. L1 was blocking, so `7174998` gets a quick fresh check (D20).
