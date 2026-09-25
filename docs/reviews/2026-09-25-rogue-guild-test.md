# Review: the rogue guild test (2026-09-25)

Scope: 72e0b6db (Eviscerate gains 4% of attack power per combo point, Rupture's 1–3% a tick
confirmed) and daa4aab2 (Instant Poison 0.5% of attack power a hit, Deadly Poison 0.1125% a stack
each tick), from a guild tester's in-game measurements [F]; the fix commits 8d1b2f44, 86707e02,
55bd72f5 and this log's fix commit.

- **Logic review:** a fresh reviewer, against rogue.md §3.4, §3.5, §5 and the doctrine.
- **Verification pass:** a fresh reviewer, scoped to the fix commits.
- **UX:** the only screen change is one new row in the results' Assumptions list and its text. The
  merged release's full UX review (D34, with every changed screen) covers it.

## Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| RG-1 | medium | introduced | The old finisher assumption was removed with nothing in its place. The finisher talents (Improved Eviscerate, Aggression, Serrated Blades) multiplying the tested shares is still unverified, so it must show in the assumptions (D29). | Fixed, 8d1b2f44: `rogueFinisherTalents`, shown when the plan uses a finisher one of the taken talents raises. |
| RG-2 | medium | introduced | The tester didn't say which talents they had. 3% × 1.20 × 1.06 = 3.82% rounds to the reported 4%, so the sim may count the talents twice. | Open question, rogue.md Q3, sent to the user to ask the tester. The values stay, and the assumption shows the doubt. The review's sizes were corrected by V-1. |
| RG-3 | low | introduced | No test that Deadly Poison reads attack power at each tick, or that Venom and crits multiply the share; one check for the removed assumption's id could never fail. | Fixed, 86707e02: three engine tests; the vacuous check dropped. |
| RG-4 | low | introduced | The poison summaries in the buff list say "a share of attack power" without the numbers. | Waived: the catalogue test's wording rule has no exemption list, and the numbers show in the assumptions row. |
| RG-5 | low | pre-existing | The Classic Era profile's rogue finishers use Forever's shares, as rogue abilities don't change with the profile. | Known gap, 55bd72f5. |

## Verification pass

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| V-1 | medium | introduced (8d1b2f44) | Q3's sizes were wrong. Paired same-seed runs of 20,000 fights give Combat 0.51%, Assassination 0.69% (its default has no Aggression) and Subtlety 1.26% (about 43% of Rupture is its attack-power part, raised 30% by Serrated Blades), not 0.5/0.9/0.1%. Q3's test also skipped Rupture. The commit message's numbers stand as written. | Fixed: Q3 gives 0.5/0.7/1.3%, notes Improved Eviscerate alone is 3.6%, and adds a Rupture test without Serrated Blades. |
| V-2 | low | introduced | Q3 said the assumption shows whenever a talent is taken; the code also needs the finisher in the plan. | Fixed: Q3's wording matches the code. |
| V-3 | low | introduced | No e2e checks the assumption renders, and an e2e comment was stale. | Fixed: `e2e/rogue.spec.ts` checks the row and the comment says why. |
| V-4 | low | introduced | The text led with talents a Subtlety player doesn't have, linked to §3.4 only, and said "a point". | Fixed: it leads with the test, says "per combo point", and links to Q3. |
| V-5 | info | introduced | The Instant Poison crit test alone would pass without the share. R9b catches that. | No change: R9b covers it. |

The V fixes are text, a doc and one e2e assertion, with no engine change. Checks: lint, typecheck,
439 unit tests (rogue, plan, results, app) and the 15 rogue e2e tests pass. The gate passes for
the rogue work: nothing the fixes introduced at medium or worse, every finding dispositioned.
