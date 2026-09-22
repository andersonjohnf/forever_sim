# Review logs

Every push is preceded by an adversarial **logic** review and an adversarial **UX** review of
all changes since the last push ([doctrine §6](../doctrine.md#6-review-gate-before-every-push)).
Each review gets one file here, named `<YYYY-MM-DD>-<topic>.md` and committed before the push.

## Template

```markdown
# <topic> (<YYYY-MM-DD>)

Range: <last pushed commit>..<head commit>
Reviewers: logic: <who>; UX: <who>. Neither wrote the change.
Checks: lint ✓ · typecheck ✓ · unit ✓ · e2e ✓
Screens reviewed: <list>, at 390 px and 1280 px, light and dark

## Logic findings
| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| L1 | high / medium / low | … | fixed in <sha> / waived: <reason> |

## UX findings
| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| U1 | … | … | … |

## Verdict
Ready to push: yes/no
```
