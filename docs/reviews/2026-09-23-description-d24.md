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

## Quick check of `7174998`

A fresh reviewer found L1 only partly fixed, plus two medium findings the fix introduced.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| V1 | high, blocking | L1 not finished | **architecture.md, character-stats.md (the candidate rows, base health, the sources table) and open-questions A1 still forbade or blocked what D24 allows.** | partly fixed, `a64ad6d`: the sweep missed three passages (B1–B3 below), so this row's first claim was wrong |
| V2 | medium | introduced | **The About sheet said base values use Classic numbers,** but the engine doesn't have the placeholders yet. | fixed, `a64ad6d`: "are left out or use the value Classic Era is expected to have", true either way |
| V3 | medium | introduced | **The milestones' track table kept its old header,** which broke its columns. | fixed, `a64ad6d` |
| V4 | low | introduced | **Doctrine §2 didn't limit the exception to an emulator database** as D24 does. | fixed, `a64ad6d` |
| V5 | nit | pre-existing | **M0's first deploy was unticked.** | fixed, `a64ad6d` |
| V6 | nit | introduced | **"So far" was left in comments.** | fixed, `a64ad6d` |
| V7 | nit | introduced | **The e2e didn't check the switcher's role labels.** | fixed, `a64ad6d`: every role is DPS or Tank |
| V8 | nit | pre-existing | **Wording in reviewer.md and CLAUDE.md.** | fixed, `a64ad6d` |

Checks after the fixes: lint ✓ · typecheck ✓ · unit ✓ (1052) · e2e ✓ (225, 3 deferred to M3).

## Quick check of `a64ad6d`

A fresh reviewer found three passages still carrying the old rule. This is the third round in
the same area, so under CLAUDE.md step 6 the design is simplified: D24 is the one place the rule
lives, other passages point to it, and a search for the old rule's wording (listed in `e73e2b9`'s
message) comes back empty.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| B1 | high, blocking | V1 not finished | **open-questions' priority list: "blocks M4 and M5".** | fixed, `e73e2b9` |
| B2 | high, blocking | V1 not finished | **character-stats' implementation notes: "no fallback: never substitute the OQ-1 candidates".** | fixed, `e73e2b9` |
| B3 | high, blocking | V1 not finished | **`base-stats.ts`'s header cited the old rule.** | fixed, `e73e2b9` |
| N1 | nit | introduced | **Ragged line wrapping.** | fixed, `e73e2b9` |
| N2 | nit | pre-existing | **The About e2e read the menu without waiting for it.** | fixed, `e73e2b9` |
| N3 | nit | pre-existing | **The tank-core slice was also called A1.** | fixed, `e73e2b9` |

## Last quick check of `e73e2b9`

Gate passes. The search for the old rule's wording (`grep -rn -i -E "no fallback|never
substitute|no emulator placeholder|OQ-1 decision|blocks M4|blocks both|unblocks|forbidden-source
placeholder|not used as fixtures|wait for this measurement|can't compute base|refuse"` over
CLAUDE.md, README.md, docs, src, e2e, scripts and .claude/agents, excluding docs/reviews) finds
only text saying the old rule was replaced and unrelated refusals. B1–B3 read correctly.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| Q1 | nit | introduced | **Two new over-long lines** (character-stats.md:680, open-questions.md:96). | deferred to the next commit, reviewed with its batch: cosmetic |
| Q2 | nit | pre-existing | **The milestones' track table still names the slice "A1".** N3 fixed only the sentence. | deferred to the next commit, reviewed with its batch: the table defines the name, so it reads correctly |
| Q3 | nit | pre-existing | **`base-stats.ts:79`'s comment reads like the old rule.** | deferred to the next commit, reviewed with its batch; track C replaces that line |
| Q4 | nit | the log | **The log didn't list the search's terms.** | fixed: listed above |

## Verdict

**Ready to push: yes.** The gate passed at `e73e2b9`; the remaining four are nits, deferred with
reasons.
