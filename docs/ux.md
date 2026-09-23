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
  - A preset menu with each spec's documented builds (its class doc); the spec default is
    selected.
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
  - The picker offers only what the character can wear together
    ([items.md, "Equipping rules"](data/items.md#equipping-rules)):
    - It leaves out the other faction's PvP and battleground items, except the one equipped.
    - A unique item worn in the other slot of a pair moves over when picked. Its second line
      says so: "Unique: moves from ring 2".
    - An item that would break a Unique-Equipped group is dimmed and can't be picked. A line
      at full contrast says why, e.g. "Unique-Equipped (Undermine Trinkets): you're wearing
      Weakness Analyzer in trinket 2." It stays focusable, so the reason is read out.
  - Badges: BiS rank, and **Classic stats** for items with no Forever data yet, with a
    tooltip explaining why.
  - A gear-set menu: "Pre-raid BiS" (the spec default, in the race's faction's PvP gear),
    "Empty", and later saved sets.
- **Buffs.**
  - Presets: Self only, Dungeon group, Standard raid (the default), Max consumables.
  - Composition switches: which classes are in the raid. These drive which raid buffs are
    available; buffs never depend on faction.
  - Grouped switches for raid buffs, target debuffs and consumables.
  - World buffs don't exist here ([D8](decisions.md#d8-world-buffs-are-excluded-2026-09-22)).
  - A buff the rotation keeps up itself (a warrior's own Battle Shout) shows its switch on and
    locked, with a note saying the rotation keeps it up, so it's never counted twice.
- **Rotation.** The spec's ability list. Each entry has an on/off switch, threshold inputs
  with units, one line of help, and the default marked. **Reset to defaults** is always
  available.
  - The settings sit under headings, the way the Buffs tab groups its switches: **Before the
    pull**, **Cooldowns and buffs**, **Core abilities**, **Fillers**, **Execute phase** and
    **Consumables**, in that order. Under each heading the settings keep the spec's priority
    order (warrior.md §5.2, §5.3). The spec gives each setting its heading
    (`RotationOption.group`). The few settings that shape the rest (Arms' stance) have no
    heading and come first.
  - A setting that depends on another under the same heading sits under it, indented on a
    rule (Heroic Strike's rage threshold under Heroic Strike). One whose parent is under
    another heading stays with its own heading, and its help names the parent ("Needs Battle
    Shout on").
  - A switch sits beside its label at every width. Number inputs and choices go under the
    label on a phone.
  - A choice between a few named values (Arms: the stance it fights in) is a segmented control
    (a toggle group, like the Fight tab's position), full width on a phone, labelled by its row.
  - A setting's default can follow the talents or another setting (Arms: Rend is on by default
    with Bloodthrill; Berserker Stance turns Whirlwind on and Rend and Overpower off). The tab
    shows the value the sim will use, the help says what it follows, and a value you set stays
    set until **Reset to defaults**.
  - A setting that depends on a switch is dimmed while that switch is off.
  - A consumable's row needs its Buffs switch. While that's off, the row says so
    ("Not used: turn on … in Buffs first").
- **Fight.**
  - Duration (default 180 s), boss armor preset, execute phase, and whether you attack from the
    front (tanks) or behind (DPS).
  - No number of targets yet: the sim has one target, so the control waits for multi-target
    support ([warrior §5.5](classes/warrior.md#55-multi-target-options-light)). A control that
    changes nothing isn't shown. Saved setups keep the value (`extraTargets`), unused.
  - Advanced: iterations and seed.

## Results

- **Headline:** DPS with its ± 95% CI, plus the iterations and rule profile. After a re-run,
  show the change from the previous result (▲/▼ with color *and* sign).
  - **Tank specs** headline TPS and DPS as equals
    ([D18](decisions.md#d18-tank-specs-report-tps-and-dps-as-equals-2026-09-22)): side by side
    in the results panel, TPS first, each with its own ± CI and its own change from the
    previous run. The phone's bottom bar stacks them in two rows next to the Simulate button;
    below 375 px wide it leaves out the ± values, which the results sheet still shows.
- **Breakdown:** a per-ability damage share bar, then casts, hit/crit/miss/dodge/glance
  percentages and average hit.
  - A **bleed's** row counts its applications and its ticks apart, so its outcomes read
    "32.2% tick crit · 1.1% of applications avoided", with its uptime on the boss on a second
    line (Rend). The tick crit shows only where ticks can crit (the Forever profile), and the
    avoidance only for an application that rolls (Rend). A bleed that does neither, such as
    Deep Wounds (a crit applies it, and its ticks can't crit), shows its ticks per fight.
  - Casts that deal no damage (Death Wish, Recklessness, Bloodrage, racials, the potion) stay
    out of the breakdown. They're under **Cooldowns and buffs**.
  - **Tank specs** get a **Threat / Damage** switch above it. Threat is the default, and the
    choice is remembered for the browser session. The heading, the order, the share bars and
    the per-second values follow the chosen metric. Abilities that add nothing to it are left
    out: a talent that only gives rage makes threat but no damage.
- **Cooldowns and buffs:** a collapsed section, like the character sheet. It's a table with
  one row per cast the rotation can press (Battle Shout if you keep it up, Death Wish,
  Recklessness, Bloodrage, racials, on-use trinkets, consumables), in the rotation's order, and
  then one per other buff on you (Holy Strength, Flurry, Enrage, the Overpower window). Each row
  has an icon, the name, the **uptime** (the share of fight time the buff was up) and the
  **casts per fight** (pre-pull casts included), all in tabular numbers. A dash, read out as
  "none", marks a value that doesn't apply: a cast with no buff (Bloodrage) has no uptime, and a
  proc buff has no casts. A weapon proc on both hands names its hand: "Holy Strength (main
  hand)".
- **Character sheet:** the final AP, crit, hit, haste, weapon skill and armor, the way the
  sim computed them.
- **Assumptions:** the `[?]` items that affect this setup, each linking to its doc.
- **Later:** stat weights, and comparing items or talent builds.

## Visual language

- **Components:** shadcn/ui (Radix, Nova preset) and Lucide icons for UI controls.
- **Segmented choices** (single-select toggle groups: Arms' stance, the Fight tab's armor,
  position and precision, the Buffs presets, the rule profile, the talent tree switcher on a
  phone, the item picker's filter, a tank's Threat / Damage switch): the selected option is
  filled with the primary color and its text in the primary foreground (`CHOICE_ITEM` in
  `src/lib/choice.ts`), so it reads at a glance in both themes. Secondary text inside an option
  (the armor presets' "Most raid bosses") switches to match (`CHOICE_HINT`).
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
- A link to a spec the app doesn't offer yet shows an error toast and leaves the current setup
  alone. A saved setup for such a spec is kept for later, and the default spec opens.
- A link that's corrupt, or over a size cap, shows the broken-link error toast and leaves the
  current setup alone. The caps are 8 K characters in the hash and 16 KB of setup once
  inflated. The largest real setup is about 4.4 KB, or 1.7 K characters. The link leaves the
  URL before it's decoded, so a reload never tries a bad one again.

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
