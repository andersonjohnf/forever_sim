# Review: the optimizer's gear search, O2 (2026-09-25)

Scope: milestone M5.7's slice O2 (9afbd91a, bbf67e52, 1050cd5e), its fix round after merging main
(0388189f, 46120aa4, cdd7b1a0, 257534e2, a3fbd6f0, 6833243d, 9a5e5ad9, 0bc81e0a, 703e09d4) and the
lead's 7a65c00f. Merged as c5c4d064. The CLI only, so no UX review.

- **Logic review:** a fresh reviewer, on 1050cd5e.
- **Verification pass:** a fresh reviewer, scoped to the fix commits.

## Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| O2L-1 | high | introduced | The default pool admitted Zul'Gurub, Ahn'Qiraj and later-patch Rares unlabelled; they made most of Fury's +6%. | User decision (D30, 2026-09-25): pre-raid plus the launch raids by default, later raids on opt-in, every piece labelled. Fixed, 0388189f. Fury's default-pool gain is +2.9%, +5.5% with later raids. |
| O2L-2 | medium | introduced | Locking one slot of a ring or trinket pair froze the other. | Fixed, 46120aa4. |
| O2L-3 | medium | introduced | The hard ceiling could be exceeded by the rankings' floor. | Fixed, cdd7b1a0. |
| O2L-4 | medium | introduced | Steps moved on unseparated races, so starts never settled. | Fixed, 257534e2: a move must clear the current gear at a paired 95%. |
| O2L-5 | medium | introduced | Presence of Might (Zul'Gurub) was searched; §6.4's option enchants would become defaults. | Fixed, a3fbd6f0: unconfirmed; an O4 rule for options. |
| O2L-6 | medium | introduced | D30's unmeasured-rating rule wasn't applied to gear. | Fixed, 257534e2 (see O2V-1). |
| O2L-7 | low | introduced | A worn pair raced again swapped between its slots. | Fixed, 46120aa4. |
| O2L-8 | low | introduced | Weight noise and a cost estimate that starved later passes. | Fixed, cdd7b1a0. |
| O2L-9 | low | introduced | Balanced's normaliser differed between ranking and racing. | Fixed, 6833243d. |
| O2L-10 | low | introduced | `--ilvl -63` was rejected. | Fixed, 9a5e5ad9. |
| O2L-11 | low | introduced | The final race reused the steps' fights. | Fixed, 6833243d: `finalSeed`. |
| O2L-12 | low | introduced | Test gaps (tanks, caps, locks, weights, the worker pool). | Fixed, 0bc81e0a. |

## Verification pass

Every finding fixed; nothing the fixes introduced at medium or worse. The reviewer reproduced the
restated Fury example exactly on a different thread count.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| O2V-1 | low | introduced by 257534e2 | The rating rule checks only an answer's new pieces, not a rated piece the start already wears. No answer changes today. | Recorded as O4's rule 6 (optimizer.md "Defaults from the results"), 7a65c00f. |
| O2V-2 | low | introduced by 0388189f | The later-content line is item level, not patch, in both directions (Silithus rewards stay in; Alterac Valley's reputation weapons at 65 fall out). | Wording fixed in D30 and optimizer.md, with both cases among the `[?]` edges, 7a65c00f. The answers match the pre-raid lists. |

The gate passes for O2.
