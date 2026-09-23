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

## Verdict

Ready to push: not yet. CI1 was medium, so `2ba6d03` awaits a quick fresh check (D20).
