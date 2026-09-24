# Rotation as a priority list, A1 (2026-09-24)

M5.65's first slice (D31): the Rotation tab's action priority list, Fury first. The APL core
(`sim/classes/apl.ts`: rows, order, presets, the compiler), Fury's rotation as sixteen rows with
the pre-pull pinned, the list UI (drag handle, keyboard moves, Move up and Move down, a row's
settings beside the list from 1024 px or in a sheet below), the order in saved setups and share
links, and the default order byte-identical to the rotation before the list.

Range: `9d96152..9a91191` (A1 `1c73f8c`..`5334863`, rebased onto main after the tank fixes; fixes
`e81c982`..`9a91191`)
Reviewers: one fresh reviewer, logic and UX together; neither wrote the change. The fixes get a
verification pass (step 5), since A1-1 and A1-6 change logic.
Checks after the fixes: lint ✓ · typecheck ✓ · unit ✓ (2432; the Retribution speed benchmark
fails under the machine's load, 30, and passes alone) · e2e ✓ (382)
Screens reviewed: default, Bloodthirst off, no execute phase, the fillers on, a row selected
(Heroic Strike, the tallest settings), the panel scrolled to its end, and after Escape; at 390,
1024 and 1280 px, light and dark, and the panel at 1024×600 and 1024×768
(`.cache/snaps/a1-review/`, the fixes' in `.cache/snaps/a1-fix/`)

## Findings

Every finding was introduced by A1.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| A1-1 | medium | With the Bloodthirst row off, "Bloodthirst in the execute phase" showed on and undimmed ("From 2,220 AP"), but the engine never uses it without Bloodthirst (`btExec = execute && useBt && …`). | fixed, `a5b50c1`: it also depends on Bloodthirst (`alsoDependsOn`), which now counts when a setting asks whether its parent applies, so the row and its threshold dim; the row says "Not used: Bloodthirst is off." (`RowState.blockedBy`, `aplRowNote`); its help names Bloodthirst. The engine is unchanged, so old setups load as before. Unit test on the rows; e2e |
| A1-2 | medium | On desktop, selecting a row left focus on the row, and the panel came after the whole list in the DOM (43 Tabs away). | fixed, `03f16aa`: focus moves to the panel's heading (`tabIndex=-1`), as the phone sheet's title takes it; **Back to list** above the heading, and Escape anywhere in the panel, return focus to the row, which stays selected. Keyboard-only e2e |
| A1-3 | medium | The panel's `max-h-[calc(100svh-var(--sticky-top)-12rem)]` hid settings in an unmarked inner scroll and left about 180 px empty below it. | fixed, `03f16aa`: it reaches down to 1rem above the window's bottom, and a fade marks each edge with more settings past it (`data-fade`, as the tabs' fade); scroll padding keeps focus clear of the fades. Checked at 1024×600, 1024×768, 1280×800 and 1440×900 (e2e and screenshots). The trade the 12rem made: a panel as tall as the window scrolls away with the list once the page is scrolled past the list's end (the footer in view), as any sticky column does; focus on its heading or Back to list scrolls them back into view |
| A1-4 | low | Rows that stop in the execute phase didn't say so (Bloodthirst, Hamstring, Slam). | fixed, `a5b50c1`: "On cooldown · not in the execute phase", while Execute applies (a summary part can need another row's switch, `alsoOn`); Hamstring and Slam likewise |
| A1-5 | low | ux.md's reorder example (Whirlwind above Bloodthirst) changes nothing, since Whirlwind waits on Bloodthirst; the fillers didn't say they wait for the core abilities. | fixed, `03f16aa` and `a5b50c1`: the example is Heroic Strike above Bloodthirst (it queues before Bloodthirst spends the rage), with Hamstring as one that changes nothing; Overpower, Hamstring and Slam say "while Bloodthirst and Whirlwind cool down" while both are on, which is their GCD-safe condition; Whirlwind's "Bloodthirst 0.5 s away" shows only while Bloodthirst is on |
| A1-6 | low | Normalizing a partial order anchored a missing row on its default predecessor only: a hand-written `["whirlwind", "bloodthirst"]` put Overpower and the rest between the two, leaving Bloodthirst last. | fixed, `e81c982`: after the predecessor, the missing row steps past the rows right after it that come before it by default, so it lands between its default neighbours where they're together; architecture.md says how, and that stored orders are always complete. Unit tests |
| A1-7 | low | Rows off for want of an execute phase showed nothing (Bloodthirst in the execute phase) or their summary ("Execute phase"), unlike the other "Not used" notes; notes were clamped at two lines and cut at 1024 px. | fixed, `a5b50c1` and `03f16aa`: "Not used: needs an execute phase (Fight tab)."; notes and summaries are never clamped (the fillers' run to four lines at 1024 px) |
| A1-8 | low | Desktop had two switches named "Battle Shout" (the row's, and the panel's). | fixed, `03f16aa`: the panel's is "Use Battle Shout" (the visible label stays in the name) |
| A1-9 | low | Test gaps: the units check covered five rows; the dependent-settings test didn't assert "Racial and trinkets with Death Wish" starts undimmed; the random default-order equivalence check was a probe only. | fixed, `03f16aa` and `185ad93`: the units check opens every row and asserts the eleven with numbers; the undimmed start is asserted; 200 seeded random setups (settings, talents, race, items, consumables, phase, rules) are a unit test with a snapshot of each plan's fingerprint, matched against main's pre-list `fury.ts` when written (under 1 s) |

## Verdict

Ready to push: after the verification pass of `e81c982..9a91191`.

## Verification pass

**Gate passes.** All nine findings are confirmed fixed. A comparison of the tab's rows over 66,000
random setups across all 22 specs changed only Fury's Bloodthirst-over-Execute setting (now dimmed
with Bloodthirst off, as the engine uses it); the 200 fingerprints match main's pre-list `fury.ts`.

| id | sev | origin | finding | disposition |
| --- | --- | --- | --- | --- |
| AV-1 | low | introduced by the fix | Berserker Rage's row didn't say "while Bloodthirst and Whirlwind cool down", though the engine keeps it GCD-safe like Overpower. | fixed: its summary says so |
| AV-2 | low | introduced by the fix | Slam's summary parts ran in the opposite order to Hamstring's. | fixed: "Not in the execute phase · while Bloodthirst and Whirlwind cool down" |
| AV-3 | low | introduced by the fix | Escape in a panel number field saves what was typed (the field saves on blur). | waived: it matches the phone sheet, where closing with Escape saves the same way |
| AV-4 | low | introduced by the fix | With Whirlwind off, the fillers drop the "while … cool down" part, though they still wait for Bloodthirst. | accepted: the shorter summary says nothing wrong |

