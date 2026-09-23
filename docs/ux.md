# UX

How the app should look, feel and behave. The UI is built to this document and reviewed
against it before every push ([doctrine §6](doctrine.md#6-review-gate-before-every-push)).
When a design decision isn't covered here, make it, then add it here.

## Principles

1. **The sim is the product.** The first screen is a ready-to-run simulation for the last
   spec used (or a default). One tap on **Simulate** gives a meaningful result. There is no
   landing page, no marketing, and no talk about the app itself.
2. **Defaults first, depth on demand.** Every control starts at a sensible default
   ([doctrine §5](doctrine.md#5-defaults)). Advanced controls sit one level down, behind an
   "Advanced" disclosure; they're never removed.
3. **Explain the result.** A number alone isn't enough. Results show the stats that produced
   them, a per-ability breakdown, the uncertainty (± 95% CI), the rule profile used, and the
   unverified `[?]` assumptions that affect the current setup.
4. **Mobile and desktop are both first-class.** Every screen is designed and reviewed at
   **390 px** and **1280 px**. No horizontal page scroll. Touch targets are at least 44 px.
   Everything works with a keyboard.
5. **Calm, modern, consistent.** Use shadcn/ui components and one type scale. Surfaces are
   neutral; color is reserved for meaning: class, item quality, better or worse.
6. **Fast and never blocking.** Sims run in Web Workers with progress and a cancel button.
   Changing a setting never freezes the page. Results that no longer match the setup are
   marked stale.
7. **Provenance without noise.** Data sources, builds and tags live in an **About** sheet and
   in tooltips on flagged values, not on the main screen.
8. **Only finished specs ship.** A spec appears in the spec picker only when its sim and UI
   are complete. Nothing is visibly "coming soon".

## Layout

| Width | Layout |
| --- | --- |
| **≥ 1024 px** | A header, then two columns. **Left:** the setup, as section tabs. **Right:** a sticky results panel with the Simulate button. |
| **640–1023 px** | One column of setup sections. A sticky bottom bar shows the latest result and the Simulate button; tapping the result opens the full results as a sheet. |
| **< 640 px** | A compact header. The section tabs are a horizontally scrollable segmented bar, sticky under the header. The sticky bottom bar works as above. Pickers open as full-height sheets. |

**Header:** the app mark and the **spec switcher**, which shows the class icon and spec in
the class color. Then **Share** (copies a link to this setup) and an overflow menu with
About & data, Reset setup, and Theme (system, light, dark).

**Setup sections**, in this order: **Character · Talents · Gear · Buffs · Rotation · Fight**.

## Sections

- **Character.** Race: only races that can be the selected class in Forever, grouped by
  faction. Level is fixed at 60 and not shown. Advanced: the rule profile (`Forever`, the
  default, or `Classic Era`) and the switch for unmeasured ratings
  ([D12](decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)).
- **Talents.**
  - A preset menu with the site's popular builds and the documented presets; the spec
    default is selected.
  - Interactive trees: three side by side on desktop, one tab per tree on mobile. Tap to add
    a point, long-press or right-click to remove one. Tier gates and prerequisites are
    enforced visibly.
  - A points counter (x / 51) and **Import / Copy build code**.
- **Gear.**
  - Slots in paper-doll order. Each row shows the item icon, its name in its quality color,
    a one-line summary of its key stats, and an enchant chip. Empty slots have their own
    state.
  - Tapping a slot opens the **item picker**: a full-height sheet on mobile, a dialog on
    desktop. It has a search box (name, type or stat) and filter chips (**BiS for this spec**,
    usable by class), and sorts by name or item level (sim value, once stat weights exist).
    Each row's second line says what the item is and its levels, e.g. "Two-hand sword · Item
    level 63 · Requires level 58"; on a phone it wraps between those parts. The client data
    has no drop sources (its Encounter Journal is empty), so the picker shows none.
  - Badges: BiS rank, and **Classic stats** for items with no Forever data yet, with a
    tooltip explaining why.
  - A gear-set menu: "Pre-raid BiS" (the spec default), "Empty", and later saved sets.
- **Buffs.**
  - Presets: Self only, Dungeon group, Standard raid (the default), Max consumables.
  - Composition switches: which classes are in the raid. These drive which raid buffs are
    available; buffs never depend on faction.
  - Grouped switches for raid buffs, target debuffs and consumables.
  - World buffs don't exist here ([D8](decisions.md#d8-world-buffs-are-excluded-2026-09-22)).
- **Rotation.** The spec's ability list. Each entry has an on/off switch, threshold inputs
  with units, one line of help, and the default marked. **Reset to defaults** is always
  available.
- **Fight.**
  - Duration (default 180 s), boss armor preset, execute phase, number of targets, and
    whether you attack from the front (tanks) or behind (DPS).
  - Advanced: iterations and seed.

## Results

- **Headline:** DPS, or TPS for tank specs with DPS alongside, with ± 95% CI, plus the
  iterations and rule profile. After a re-run, show the change from the previous result
  (▲/▼ with color *and* sign).
- **Breakdown:** a per-ability damage (or threat) share bar, then casts, hit/crit/miss/dodge/
  glance percentages and average hit.
- **Character sheet:** the final AP, crit, hit, haste, weapon skill and armor, the way the
  sim computed them.
- **Assumptions:** the `[?]` items that affect this setup, each linking to its doc.
- **Later:** stat weights, and comparing items or talent builds.

## Visual language

- **Components:** shadcn/ui (Radix, Nova preset) and Lucide icons for UI controls.
- **Type:** Geist, one scale. Use tabular numbers for every stat and result.
- **Color:**
  - Neutral tokens for surfaces and text.
  - **Class colors** as accents only: Warrior `#C69B6D`, Druid `#FF7C0A`, Paladin `#F48CBA`.
  - **Item quality** colors: Uncommon `#1EFF00`, Rare `#0070DD`, Epic `#A335EE`, darkened as
    needed to meet AA contrast on light backgrounds.
  - Color never carries meaning alone; always pair it with a label, sign or icon.
- **Game icons:** WoW icons by icon name from Wowhead's CDN, lazy-loaded at a fixed size with
  a neutral placeholder on error. Nothing depends on them loading.
- **Motion:** short and purposeful (sheets, disclosure). Respect `prefers-reduced-motion`.

## States

Every view handles these states:
- **Default:** the first visit, with defaults applied.
- **Empty:** an empty gear slot, no talents spent, no results yet.
- **Long content:** long item names, many buffs, a narrow width.
- **Running:** progress, a cancel button, and the previous result still visible.
- **Stale:** the setup changed after the last run, so results are dimmed with a "Re-run" hint.
- **Error:** the worker failed or a shared link is invalid. Show a plain message and a way
  forward (retry, or reset to defaults).

## Persistence and sharing

- The setup is saved to `localStorage` automatically and restored on the next visit.
- **Share** copies a URL with the compressed setup in the hash (`#s=…`). Opening one loads it
  and shows a toast with **Undo**, which restores the previous setup.
- Setups are versioned, so an old link still loads, or explains why it can't.

## Accessibility

- WCAG 2.2 AA contrast in both themes.
- Visible focus on everything interactive, and labels on icon-only buttons.
- Logical tab order. Sheets and dialogs trap focus and close with Escape.
- Nothing is hover-only: every tooltip's content is reachable by tap or focus.

## UX review checklist

The adversarial UX reviewer works through this list for every changed screen. It uses
`npm run snap` at 390 px and 1280 px, in light and dark, and covers each state above.

1. Can a first-time user get a result without reading anything? Is the next action obvious?
2. Is every label, unit and piece of copy clear? No jargon without a tooltip, and no talk
   about the app itself.
3. Are the defaults visible and sensible, and can every one be reset?
4. Layout: no horizontal scroll, clipping or overlap, and long content handled at 390 px.
5. Touch targets are at least 44 px, and sticky bars don't hide content.
6. Contrast is AA in both themes, and color is never the only signal.
7. Keyboard: tab order, focus visibility, Escape closes, Enter activates.
8. States: empty, running, stale and error all look intentional.
9. Consistency: the same component for the same job, spacing on the scale, and tabular
   numbers.
10. Performance: no jank while typing, searching or dragging; the sim never blocks the UI.
