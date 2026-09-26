# Review: item tooltips (2026-09-25)

Scope: milestone M5.67, slices T1 (the tooltip's lines and component) and T2 (on every gear slot
and item picker row), rebased once onto main before review (9e44022c); the fix round on
`tooltip-content` (66ad778c, 2d404d37, be83c79f, e1a13550) and `tooltip-behaviour` (29ae0b29,
b9511031), merged as 1f46069b; the lead's VT-1 fix a1810814 and 2b3af85f. Merged to main as
6c1b591b.

- **Logic review** and **UX review:** two fresh reviewers, on 9e44022c.
- **Verification pass:** a fresh reviewer, scoped to the fix commits, on 1f46069b.
- **Quick check:** a fresh reviewer, on a1810814 (VT-1).

## Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| TL-1 | medium | introduced | Stat-spell Equip lines were rebuilt from templates: 147 of 537 differed from the client's words, some changing the meaning ("…with melee attacks" dropped from 51 items' crit). | Fixed, 66ad778c and 2d404d37: the scraper keeps each stat spell's rendered line (`statEquip`); 535 of 537 match, the other 2 differ by a double space the renderer prints single. Browser data +9.4 KB gzipped. |
| TL-2 | medium | introduced | Forever stat-column lines used a retired source's wording ("Critical Strike Rating"), not the client's `ITEM_MOD_*` strings. | Fixed, 2d404d37: the client's strings; the long versus short in-game form is `[?]` in ux.md. |
| TL-3 | medium | introduced | Champion's Chain Headguard showed a set it isn't in (`item.setId` without the set's piece list). | Fixed, 2d404d37: `setOf(item)`, with a test. |
| TL-4 | low | introduced | Under Classic Era rules, item lines didn't match what that profile simulates (Hand of Justice, Ironfoe). | Fixed, 2d404d37: lines are always Forever's, with a grey note on the items whose effect depends on the profile. |
| TL-5 | low | introduced | An active set bonus read "(N) Set:". | Fixed, 2d404d37: "Set: …" when reached, per `ITEM_SET_BONUS`. |
| TL-6 | low | introduced | Classic Era enchants showed the catalogue summary beside client names. | Fixed, be83c79f: the Classic Era client's rows. |
| TL-7 | low | introduced | A locked off-hand counted toward worn set pieces. | Fixed, e1a13550 and 29ae0b29, in the gear section and the picker. |
| TL-8 | low | introduced | Test gaps (stat matching by number, no TL-1/3/4 cases, `anchorBox` zero-size parts). | Fixed, 2d404d37 and b9511031. |
| TL-9 | low | pre-existing data, surfaced | Scraper-generated lines ("in certain areas") and "Requires PvP rank N" read as game text. | Fixed, 2d404d37: generated lines hidden; the client's rank titles. |

## UX review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| TU-1 | medium | introduced | A pinned tooltip taller than its room couldn't scroll inside the picker (the modal's scroll lock). | Fixed, b9511031: portalled into the dialog; e2e. |
| TU-2 | medium | introduced | A hover tooltip above or below the item was cut off with nothing to reveal the rest. | Fixed, b9511031: overlaps beside the item when neither fits; `tooltipSide` takes the panel's height. |
| TU-3 | medium | introduced | A pinned tooltip rode over the sticky chrome when its list scrolled. | Fixed, b9511031: closes when its item scrolls out; collision padding for the chrome. |
| TU-4 | low | introduced | On touch at 1440+, the pinned tooltip covered its own info control. | Fixed, b9511031: a tap on the panel closes it. |
| TU-5 | low | introduced | The card's info control wrapped the stats line at 390. | Fixed, b9511031: on the name line. |
| TU-6 | low | introduced | Switching tooltips on a phone took two taps. | Fixed, b9511031. |
| TU-7 | low | introduced | Escape took two presses to close the picker with the mouse resting on it. | Fixed, b9511031. |
| TU-8 | low | introduced | The tooltip was the item's description after focus, about 20 lines at each stop. | Fixed, b9511031: the info control carries it; decision in ux.md. |
| TU-9 | low | introduced | "Requires PvP rank N". | Same as TL-9. |
| TU-10 | low | introduced | No e2e for the tall, pinned and scrolling cases. | Fixed, b9511031. |

## Verification pass

Every finding fixed; nothing the fixes introduced. Checks: lint, typecheck, 3,746 unit tests,
`scrape:check`, 89 e2e tests.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| VT-1 | low | pre-existing (9e44022c), breaks ux.md's promise | In the picker, a hover tooltip caught the pointer: Radix's modal layer sets an inline `pointer-events: auto`. | Fixed, a1810814: the style prop sets `none` unless pinned; the 1024 e2e reads the computed value. |
| VT-2 | low | pre-existing | Two tooltips open after closing the picker with Escape while the mouse rests on another slot. | Known gap (milestones). |
| VT-3 | low | pre-existing | The phone sheet wouldn't drag while a tooltip was pinned. | Known gap; the quick check couldn't reproduce it, and the wording says so (2b3af85f). |
| VT-4 | low | pre-existing | The card's info control shortens the name by 32 px. | Known gap. |

## Quick check of VT-1

VT-1 fixed: the tooltip stays open over the row and a click through it picks; pinned tooltips
still take the pointer and scroll; no flicker on Gear. One finding, VQ-1 (low, the VT-3 gap's
wording didn't reproduce), fixed in 2b3af85f. The check noted that a pinned panel gets
`pointer-events: auto` by inheriting from the dialog it's portalled into, which holds for both of
today's uses.

The gate passes for the item tooltips.

## After the merge: the picker's focus with a notice up

The full suite on main (ea00c298) failed notices.spec: tabbing through the picker with a notice up,
focus landed on the dialog. Root cause: Radix Presence removed a faded panel inside the next Tab's
blur, and since TU-1 portals it into the dialog, the dialog's focus trap caught the removal. Fixed in
934e37b9: the tooltip removes its own panel at its fade's end, never during a focus move; be40cc97
fixes results-keyed's `/^Riphook/` (the phone's info control matched too).

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| VF-1 | medium, latent | pre-existing | A close with no fade still removed the panel inside the focus move. | Fixed, 45801ecd: only Escape's instant close removes at once; otherwise the next frame. |
| VF-2 | low | pre-existing, breaks ux.md | The tooltip zoomed and slid under reduced motion. | Fixed, 45801ecd: only the fade. |
| VF-3 | low | pre-existing | An Escape during the 100 ms fade is spent on the closing tooltip. | Known gap. |
| VV-1 | low | pre-existing, breaks ux.md | Every shadcn dialog, sheet, popover, menu and select zoomed or slid under reduced motion. | Fixed, baf4c4bc: one rule in src/index.css keeps only the fade; the drawer snaps. e2e/reduced-motion.spec.ts. |
| VV-2 | low | pre-existing | A closing panel's layer takes Escape for up to a frame. | Same as VF-3. |

## Quick checks of VV-1 and its fix

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| QC-1 | medium | introduced by baf4c4bc | Under reduced motion the phone drawer still slid: vaul opens and closes with keyframes, which the transition duration didn't touch, yet ux.md said it snaps. | Fixed, 961a0711: `animation-duration: 1ms` too; the phone test checks it. Its quick check confirmed it (no visible slide, every close ends, drag still dismisses; motion allowed unchanged). |
| QC-2 | low | pre-existing | The picker hover test read the tooltip's box before placement (flaky under load). | Fixed, 961a0711: it polls. |
| QC-3 | low | introduced by 961a0711 | The outer CSS comment still described the drawer's motion as a transition. | Fixed in the release commit (comment only). |
| QC-4 | low | pre-existing | The phone item picker closes without its exit slide (it unmounts at once). | Known gap: no doc promises it. |

The PV fixes (Power Infusion's copy) were confirmed by the first quick check. The gate passes.
