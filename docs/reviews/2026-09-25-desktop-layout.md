# Review: the wide desktop layout (D34, as amended), 2026-09-25

**Scope:** everything on `desktop-d34` that isn't on `main`. That covers:
- the wide layout from 1440 px;
- the user's three rounds of redesign, recorded in D34's amendments;
- the light theme's contrast;
- tooltips that follow the theme.

It ships together with the priority-list release (its own log, `2026-09-25-priority-lists.md`), the
rogue guild test (`2026-09-25-rogue-guild-test.md`) and Firebase Hosting (`2026-09-25-firebase-hosting.md`).

**The first build's reviews** (the DA, DB and DL series) were fixed. Then the user's review of the
preview replaced that design ("designed, not scaled", ux.md principle 4), so the reviews below are
of the design that ships.

**How the design settled:** the user looked at the preview several times, and each look changed it:
1. The panel stacked the sheet and Your setup, and a toolbar showed its items inline.
2. Rotation's settings moved into a column beside the list, and the panel's cards got less plain.
3. The panel was ordered sheet first, then Your setup with the result's headline, with nothing pinned.
4. Gear took the game's character-pane order.
5. The light theme got its contrast: a navy toolbar (light theme only) and white panels on a tinted page.

Each step is in D34 and ux.md.

## Full reviews

**The logic review (DL2), and UX reviews of the sections (DU1) and of the panel and Rotation (DU2).**

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| DL2-1 | medium | introduced | Gear overflowed 1440×900 beside a classic 17 px scrollbar (Feral Bear 907 px). | Fixed by construction: fixed-height slots. The paper-doll rework kept it; the hunter's last slot is at 835 px. |
| DL2-2 | medium | introduced | Classic Era's enchant note pushed Gear past the window. | Fixed: a link on the status line at wide. |
| DL2-3 | low | introduced | Focus dropped to the page when a layout switched under it (Advanced at 1440; Rotation at ~1850). | Fixed: Advanced keeps one element tree. Rotation restores focus by a stable key (V2-1), and its rows keep their elements across the switch (the flaky test's cause). |
| DL2-4 | low | introduced | Remove all gear emptied every slot in one click. | Fixed: a confirming menu, as Reset setup has. |
| DL2-5 / DU1-3 | low | introduced | The picker's "Equipped" badge changes the picker under 1440 too. | Accepted: recorded in D34 as the second change under 1440 px. |
| DL2-6 | low | introduced | The Fight and Character setup lines hid changed advanced settings. | Fixed: "· changed". |
| DU1-1 | medium | introduced | A long-named Bear head moved Gear past the window. | Fixed with DL2-1. |
| DU1-2 | medium | introduced | Fight scrolled with an empty left column. | Fixed: balanced columns. DPS specs fit at their defaults. |
| DU1-4 | low | introduced | Gear's status line wrapped. | Fixed: one line at wide. |
| DU1-5 | low | introduced | The enchant chip's focus ring crossed the stats line. | Fixed. |
| DU1-6 | low | introduced | The flags stayed icons where their words fit. | Fixed: they are measured per line. |
| DU1-7 | low | introduced | Prot Paladin's Character tab scrolled. | Fixed in part with balanced columns. What remains (about 971 px) is waived in ux.md with its reason. |
| DU1-8 | low | introduced | Buffs is two columns at 1440 and scrolls. | Waived in ux.md: three columns would be 17.7 rem. The raid chips now sit in even rows. |
| DU1-9 | low | pre-existing | Tab order passes the footer before the panel. | Known gap. The skip link reaches Simulate. |
| DU2-1 | high | introduced | A tank's Simulate was below the panel's edge on load at 1440×900. | Fixed: the tank sheet is compact, and the attack table's explanation is in a popover. Every spec's Simulate is in view (tested). |
| DU2-2 | medium | introduced | The sheet wasn't "always in view" at 1440×900. | User decision: the sheet on top, then Your setup with the headline, then the breakdown, and everything scrolls. |
| DU2-3 | medium | introduced | The setup lines didn't look clickable. | Fixed: a resting chevron. |
| DU2-4 | low | introduced | At 2560 values sat far from their labels. | Fixed: a fourth column. |
| DU2-5 | low | introduced | A hovered setup label was 4.35:1. | Fixed. |
| DU2-6 | low | introduced | An empty action band after a run. | Fixed: the headline sits in that row (user decision). |

## Verification passes

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| V2-1 | low | introduced | Rotation focus landed one control off inside a radio group across ~1850 px, so Enter changed a value the wrong way. | Fixed: found by name and role. e2e covers radios and steppers. |
| V2-2 | low | introduced | ux.md said DPS Fight fits 1440×900, but that holds only at its defaults. | Fixed: the wording. |
| V2-3 | low | introduced | The tank Fight tab and Prot Paladin's Character tab scroll with no waiver written. | Fixed: waivers in ux.md. |
| V4-1 | medium | pre-existing | The Gear fit test never equipped the longest names, so it was hollow. | Fixed: it equips the longest names and enchants and asserts each pick. The fit holds (835 px). |
| V4-2 | medium | pre-existing | Release history sometimes ignored Escape (4/12). | Fixed in the app: a still-closing dialog took the key. 0 failures in 420 runs. |
| V4-3 | low | introduced | The mirrored column's flags zig-zagged in Tab order. | Fixed. |
| V4-4 | low | introduced | The boss-table popover covered its table. | Fixed: it opens to the left. |
| V5-1 | medium | introduced | The release entry's rogue number counted only the poisons. | Fixed from the goldens: Combat +1%, Assassination +2%, Subtlety +0.7%. |
| V5-2 | low | introduced | The entry read as if Demonology's default gains 3.9%. | Fixed: the wording. |
| V5-3 | low | introduced | The entry said "your DPS" for tanks, and its time was a placeholder. | Fixed: "your result"; the time is set at the push. |
| V5-4 | low | introduced | A tank's DPS was as large as its TPS. | Fixed: a step smaller. |
| V5-5 | low | introduced | The dark header's hover fills after the navy change. | Fixed with the dark header's return (user decision). |
| V6-1 | low | introduced | ux.md's figures for a tank's Simulate position didn't reproduce (the panel sizes to its content). | Fixed: the promise stated without exact figures; the e2e checks every spec. |

The last quick check (V6: the card's clipped edge, the dark header's return, the entry's numbers)
found nothing medium or worse; the dark header is pixel-identical to its look before the navy change.

A flaky Rotation focus test (2/20 under load) turned out to be a real bug: a list row rebuilt its
controls when the window crossed ~1850 px, and focus fell to the page. It's fixed so the row keeps
its elements, and the test passes 40/40 and fails without the fix.

## Gate

- **Full suite:** green on the desktop branch (749 e2e) before the last small fixes. It runs again
  on `main` after the merge.
- **Under 1440 px:** pixel-identical to `main` apart from these changes:
  - the weapon skill number;
  - the picker's Equipped badge;
  - Advanced staying open after narrowing;
  - the light theme's colours (user decision). Layout and sizes don't change.
- **Medium or worse:** nothing the last fixes introduced is medium or worse, and every finding has a disposition.
