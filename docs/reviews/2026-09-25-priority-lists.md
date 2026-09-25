# Priority lists for every spec, issue #17 and Coming soon (2026-09-25)

The review gate for everything since the last push (c1022c57):
- **M5.65 A2:** every remaining spec's Rotation tab moved onto the priority list (19 specs, 9 class slices in parallel).
- **Issue #17:** the warlock filler choice, and Searing Pain with Demonic Brand simulated.
- **The Coming soon sheet.**
- **Small items:** row summaries that follow a choice, the keyboard pick-up fix, singular units, and the Touch of the Grave trigger tests.
- **Docs:** D30's build plan and the 10-agent width.

Each class move was guarded by a fingerprint of 200 random setups' plans, taken before the move and matched byte for byte after it. Four fresh reviewers went over the whole change at 22af6e85:
- logic A (melee and hybrid specs, the shared rotation code);
- logic B (hunters, mages, warlocks, #17);
- UX A (the melee and hybrid Rotation tabs);
- UX B (the hunter, mage and warlock Rotation tabs, and Coming soon).

Six builders fixed the findings on disjoint files, and a fresh reviewer verified the fix round.

## Findings and dispositions

| id | sev | origin | finding | disposition |
|---|---|---|---|---|
| LA-1 | medium | introduced | The paladins' lower-Consecration "Not used" note ignored rank 5's cost (Ret at 0/0 still casts rank 1 15.8 times a fight) | Fixed: `consecration-rows.ts`, the note only where it can never cast, proved by a threshold sweep; paladin.md. Trade-off accepted by the verifier: Ret at 20/20 casts 0 in practice without a note (a missing note, never a wrong one) |
| LA-2 | medium | introduced | A row moved below Mind Flay or Lightning Bolt never fires, silently | Fixed, then simplified at step 6 (VA-2) |
| LA-3 | low | introduced | Inner Focus below Mind Blast is never cast, silently | Fixed; its note corrected in QV-1 |
| LA-4 | low | introduced | Shadow's pre-pull row reads "Shadowform" without the talent | Fixed (`requires`) |
| LA-5 | low | introduced | Fingerprints cover the default order only | Accepted (below) |
| LB-1 | low | introduced | A demon's Shadow damage takes your own Shadow Vulnerability (+0.4% on a Brand build) | Waived to known gaps: no default has a Shadow-damage demon out; the fix changes the plan format and every warlock fingerprint |
| LB-2 | low | introduced | Searing Pain's help said "6 attacks" at every rank; the Brand assumption named absent multipliers | Fixed |
| LB-3 | low | decision | Demonology's default doesn't take Demonic Brand (+12.4%) | Deferred (below) |
| LB-4 | low | introduced | Warlock fingerprints never cover Incinerate on Affliction/Demonology, Brand or on-use items | Fixed: a second, fixed case set with its own snapshot |
| LB-5 | low | introduced | The filler's display with Incinerate chosen but not talented | Fixed (the note); the icon waived (UB-3) |
| LB-6 | low | introduced | A stale comment in rotation.ts | Fixed |
| UA-1 | medium | introduced | One-setting headings (Enhancement, Shadow) | Fixed: the imbue unheaded, Power Infusion a list row |
| UA-2 | medium | introduced | Elemental's Chain Lightning without Elemental Focus read "None", undimmed | Fixed: the note, and dimmed |
| UA-3 | low | introduced | The Consecration note's copy was vague | Fixed: it names the numbers; ux.md |
| UA-4 | low | introduced | Arms' trinkets row had no summary by default | Fixed, and the Racial row the same way |
| UA-5 | low | introduced | Switchless rows that do nothing weren't dimmed | Fixed (`aplRowIdle`) |
| UA-6 | low | introduced (Ret), pre-existing (Prot) | The paladins' trinkets were a setting, not a row | Fixed; led to VA-1 |
| UB-1 | medium | introduced | Coming soon listed this release's own work as next | Fixed at release: its lines moved into the release entry |
| UB-2 | low | pre-existing | Marksmanship's "Wait for Auto Shot" undimmed at Neither | Fixed |
| UB-3 | low | introduced | The warlock Filler row's icon is fixed | Waived to known gaps (the note says which spell is cast) |
| UB-4, UB-5 | low | introduced | Searing Pain's duplicate help; a 60-word Brand assumption | Fixed |
| UB-6 | low | introduced | Screen readers read "Stat boosts , Planned" | Fixed, Release history too |
| UB-7 | low | introduced | Hard-to-read Coming soon and Mana gems copy | Fixed |
| UB-8 | low | introduced (docs) | ux.md's "nothing is coming soon", the sheets list, fixed rows under a heading | Fixed |
| UB-9 | low | pre-existing | Demonic Sacrifice's buttons overflowed at 360 px and below | Fixed: choices wrap; a new e2e checks 13 specs at 320–1024 (it also caught a clipped hunter label at 1024) |
| UB-10 | low | pre-existing | Arrow presses during a move's animation are dropped (dnd-kit) | Waived to known gaps |

**LB-3 (low, decision).** Demonology's default talents keep the 3 points the doc says add no DPS, while Demonic Brand, now simulated from the client's formula, measures +12.4%. Taking it would widen Demonology's lead over Destruction from about 13% to about 27%. Both numbers rest on Q19's [?] 1 s Firebolt.
- **Deferred:** a spec's default talents come from the Optimizer's results, confirmed on a fresh seed (D30, O4, the build plan the user agreed on 2026-09-25), with Q19 and Q21 settled by the guild's tests.
- The release notes say the Demonic Brand gain rests on untested values.

**LA-5 (low, accepted).** The fingerprints cover only the default order. The reviewer's reorder fuzz (11 specs, 5 setting sets, 13 orders each) found no throw, no hang, and results that repeat exactly; reordered rows keep their own conditions. The fingerprints' job was to guard the move, which they did.

## Verification pass

A fresh reviewer verified the fix round at d4f62cf5: `test:full` green (3,328 unit, 572 e2e), no golden or
fingerprint moved (only the new warlock fixed set added), every finding above confirmed. It found:

| id | sev | origin | finding | disposition |
|---|---|---|---|---|
| VA-1 | medium | introduced (UA-6) | Protection Paladin's "Cooldowns and buffs" heading held only the fixed Righteous Fury row | Fixed: the fixed row and heading dropped (the pinned row names Righteous Fury); `index.test.ts` now counts only what shows above the list, and fails on the old setup |
| VA-2 | low | introduced (LA-2) | The below-filler notes claimed rows fire "while you haven't the mana", which is false | **Simplified (step 6: the second round in this area).** One rule on every spec: "Below <filler>: cast only when <filler> can't be.", dimmed, no mana claim; ux.md once, the class docs link it |
| VA-3 | low | introduced | Chain Lightning below the filler read "Not used" but wasn't dimmed | Fixed with VA-2 |

A quick fresh check of those commits passed them, but found one more:

| id | sev | origin | finding | disposition |
|---|---|---|---|---|
| QV-1 | low | introduced (VA-2) | Inner Focus below Mind Blast got the below-filler note, but it's never cast there (it waits for Mind Blast, which goes first; 0 casts at 60, 180 and 600 s) | Fixed (5f92de83): its own "Not used" note. The quick check of that commit found priest.md still quoting the old note; fixed in a28d6579, which restates the checked code path |

The lead also fixed:
- **Opening Assumptions on desktop added about 2,800 px of blank page** (found by the desktop audit). A new e2e test fails without the fix.
- **Benchmarks:** the Fury, Arms and Ret benchmarks take the best of three runs, since the full suite's own load failed them.
- **The one-at-a-time notice e2e:** it pauses the page clock. It passed 100 of 100 under load.

**Gate:** passed. `test:full` is green at 5f92de83 (every unit test, `scrape:check`, 572 e2e), and every finding has a disposition.

**Release:** held by the user's decision, to ship with the wide desktop layout (D34) in one update.
