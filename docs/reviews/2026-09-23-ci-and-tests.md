# CI fix, the test split and D23 (2026-09-23)

Range: `decd4c8` (the first push, whose deploy failed) .. the head this review ends at.
- `7efa2b9`: the fix for the failed deploy.
- `2ef977e`: the user-requested smoke and full suites.
- `293d8df`: D23, the rotation-defaults decision.

Reviewer: a fresh agent, briefed to break it.
- **Logic:** it reproduced the runner's failure on x64 Node 22 under Rosetta, and with a
  small arm64 stack, and confirmed the fix passes there.
- **UX:** no user-facing code changed, so no UX review applies. The two e2e specs only gained
  `@smoke` tags.

**Confirmed:**
- `JSON.parse` doesn't recurse, and `withinDepth` stops at 10 levels.
- The full unit suite passes on x64 Node 22 at 250 KB of stack.
- The smoke config runs exactly its 7 files, and `--grep @smoke` exactly the 8 tagged tests.
- `deploy.yml` can't deploy after a failure.
- Both workflows pass actionlint and action-validator.
- The docs agree with the scripts.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| CI1 | medium | introduced (the split's design) | **Nothing runs the full suite automatically on the deploy's platform:** the failing test wasn't a smoke file, and a Mac can't reproduce it. | fixed, `2ba6d03`: Full regression also runs on every push to main, beside the deploy |
| CI2 | low | pre-existing | **Local Node (26) and CI Node (22) differ.** | fixed, `2ba6d03`: `.nvmrc` pins 22, read by both workflows |
| CI3 | low | introduced | **The smoke suite never opens Talents, Rotation, Buffs or Fight.** | fixed, `2ba6d03`: a smoke test opens every section tab |
| CI4 | low | introduced | **A renamed smoke file drops out silently.** | fixed, `2ba6d03`: the config throws on a missing file |
| CI5 | low | introduced | **The regression artifact names a report CI never writes.** | fixed, `2ba6d03` |
| CI6 | nit | introduced | **The cause was misattributed to Linux;** it's x64 Node 22's recursive `JSON.stringify`. | fixed, `2ba6d03` (the test comment) |
| CI7 | nit | introduced | **The README didn't describe the two suites.** | fixed, `2ba6d03` |
| CI8 | low | introduced | **D23's bar was ambiguous,** and a search at 95% per candidate finds false wins. | fixed, `2ba6d03`: the paired difference's 95% interval above zero, and the winner confirmed on a fresh master seed |
| CI9 | nit | introduced | **Doctrine §5's lead-in contradicted the rotation bullet.** | fixed, `2ba6d03` |

Checks after the fixes: lint ✓ · typecheck ✓ · unit ✓ (1050) · e2e ✓ (225, 3 deferred to M3) ·
smoke ✓ (219 unit, 9 e2e).

## Quick check of `2ba6d03`

A fresh reviewer checked the fix commit only (D20).

**Confirmed:**
- CI1–CI9 are fixed. The regression workflow can't block or cancel the deploy (no `needs`, no
  shared concurrency group).
- The smoke guard throws on a renamed file, and exactly 7 files run otherwise.
- The every-section test fails on a console error.
- `--grep @smoke` selects 9 tests.
- Both workflows pass actionlint and action-validator.
- lint ✓ · typecheck ✓ · unit ✓ (1050) · e2e ✓ (225, 3 deferred to M3) · smoke ✓ (219 unit,
  9 e2e).

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| N1 | low | introduced (`2ba6d03`) | **A comment in `deploy.yml` and two lines in architecture.md still say the full suite runs only by hand,** and the smoke list there leaves out the every-section test. | fixed, FIXHASH: comment and doc lines only |
| N2 | nit | introduced | **Doctrine §5's lead-in said "the best one a real player can execute"** where D23 says the best one "we've found", and a line in D23 wasn't wrapped. | fixed, FIXHASH |

## Verdict

**Ready to push: yes.** The quick check passed. N1 and N2 are comment and wording fixes that change
no code, workflow step or test.
