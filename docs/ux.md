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

**Header:** the app mark, "Forever Sim" (the page's one `<h1>`, visually hidden on phones),
and the **spec switcher**, which shows the class icon and spec in the class color. Then
**Share** (copies a link to this setup) and an overflow menu with About & data, Reset setup,
and Theme (system, light, dark). Menu items are 44 px tall.

**About & data** opens a sheet that starts with what the sim covers, worded from the specs it
offers ("A DPS simulator for Fury and Arms Warriors in WoW Forever"), so it grows as specs ship
(principle 8). The page's meta and Open Graph descriptions in `index.html` say the same and are
updated with each spec; an e2e test compares them.

**Section tabs** are 44 px tall. When they scroll sideways, a fade marks each edge with more
tabs past it (none at an end), and the chosen tab scrolls into view. Arrow keys move between
tabs and Enter or Space opens one (manual activation), so focus coming back from a toast never
switches the tab.

**Setup sections**, in this order: **Character · Talents · Gear · Buffs · Rotation · Fight**.

## Sections

- **Character.**
  - Race: only races that can be the selected class in Forever, grouped by faction (Alliance,
    then Horde) in one radio group. Arrow keys move between races and pick them, and the
    selected race is the group's only tab stop. Level is fixed at 60 and not shown.
  - A race the sim can't simulate yet (a Skyborne warrior: its level-60 base stats aren't
    known, [character-stats OQ-1](mechanics/character-stats.md#oq-1-paladin-druid-and-skyborne-base-attributes))
    stays in the list with a dashed border and the reason in its tile, which is also its
    description for screen readers: "Can't be simulated yet: its base stats at level 60 aren't
    known." It can still be picked, to see its racials, and a run then says why it can't go
    (see [States](#states)). It isn't hidden: a Skyborne player should see why, not wonder where
    their race went.
  - A race on the other side swaps the faction-bound gear (PvP, battleground and reputation
    rewards, [items.md](data/items.md#equipping-rules)) for the new faction's twin, which has
    the same stats, and keeps the slot's enchant. A toast with **Undo** names the new items.
    An item with no twin stays, and the toast says so.
  - Advanced: the rule profile (`Forever`, the default, or `Classic Era`) and the switch for
    unmeasured ratings
    ([D12](decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)).
    A switch's whole row, with its help, is its label, as in Buffs.
- **Talents.**
  - A preset menu with each spec's documented builds (its class doc); the spec default is
    selected.
  - Interactive trees: three side by side on desktop, one tab per tree on mobile. With a
    mouse, click to add a point and right-click to remove one; on a touch screen, a tap opens
    the talent's details with − and + buttons. On a focused talent, Enter adds a point and
    Backspace removes one (Delete and − work too); the hint above the trees and each talent's
    tooltip say so. Tier gates and prerequisites are enforced visibly.
  - A points counter (x / 51) and **Import / Copy build code**. A pasted code that doesn't
    work gets a plain reason: "That isn't a talent code", with an example code for the class;
    a code for another class; more than 51 points; or the talent a tier gate or arrow blocks.
- **Gear.**
  - Slots in paper-doll order. Each row shows the item icon, its name in its quality color,
    a one-line summary of its key stats, and an enchant chip. Empty slots have their own
    state. The columns are `minmax(0, 1fr)`, so a long name or enchant truncates rather than
    widening the page, down to 320 px.
  - Choosing a slot opens the **item picker**: a full-height sheet on mobile, a dialog on
    desktop. It has a search box (name, type or stat) with a clear button, filter chips
    (**Best in slot** for this spec, or **All items** the class can use), and a sort menu: BiS
    rank (the default where the slot has BiS items), item level or name (sim value, once stat
    weights exist). Each row's second line says what the item is and its levels, e.g.
    "Two-hand sword · Item level 63 · Requires level 58"; on a phone it wraps between those
    parts. The client data has no drop sources (its Encounter Journal is empty), so the picker
    shows none.
  - The picker offers only what the character can wear together
    ([items.md, "Equipping rules"](data/items.md#equipping-rules)):
    - It leaves out the other faction's PvP and battleground items, except the one equipped.
    - A unique item worn in the other slot of a pair moves over when picked. Its second line
      says so: "Unique: moves from ring 2".
    - An item that would break a Unique-Equipped group is dimmed and can't be picked. A line
      at full contrast says why, e.g. "Unique-Equipped (Undermine Trinkets): you're wearing
      Weakness Analyzer in trinket 2." It stays focusable, so the reason is read out.
  - Badges, on slot rows and picker rows alike:
    - the BiS rank;
    - **Classic stats** for items with no Forever data yet;
    - **Effect not simulated** for items with an equip, chance-on-hit or use effect the sim
      leaves out (Blackblade of Shahram's summon), the same items the result's assumptions
      list.

    The two flags open a popover on tap, click or Enter that explains them and, for effects,
    quotes each one. They sit over the row's button, never inside it, with 44 px hit areas. The
    row's button covers the row: its name is the slot and item ("Main hand: Blackblade of
    Shahram"), and its description carries what the row shows: stats, BiS rank and flags.
  - A gear-set menu: "Pre-raid BiS" (the spec default, in the race's faction's PvP gear),
    "Empty", and later saved sets.
- **Buffs.**
  - Presets: Self only, Dungeon group, Standard raid (the default), Max consumables. Each
    shows what it brings in a line under its name, in the tile, not in a hover title.
  - Composition switches: which classes are in the raid. These drive which raid buffs are
    available; buffs never depend on faction.
  - Grouped switches for raid buffs, target debuffs and consumables.
  - World buffs don't exist here ([D8](decisions.md#d8-world-buffs-are-excluded-2026-09-22)).
  - A buff the rotation keeps up itself (a warrior's own Battle Shout) shows its switch on and
    locked, with a note saying the rotation keeps it up, so it's never counted twice.
- **Rotation.** The spec's ability list. Each entry has an on/off switch, threshold inputs
  with units, one line of help, and the default marked. **Reset rotation** (in the section
  header, enabled once you've set anything) puts every setting back to its default, with an
  Undo toast like the other bulk changes. Undo restores that spec's settings only.
  - The settings sit under headings, the way the Buffs tab groups its switches: **Before the
    pull**, **Cooldowns and buffs**, **Core abilities**, **Fillers**, **Execute phase** and
    **Consumables**, in that order. Under each heading the settings keep the spec's priority
    order (warrior.md §5.2, §5.3). The spec gives each setting its heading
    (`RotationOption.group`). The few settings that shape the rest (Arms' stance) have no
    heading and come first.
  - A setting that depends on another under the same heading sits under it, indented on a
    rule (Heroic Strike's rage threshold under Heroic Strike, "Save the last Death Wish for
    the end" under Death Wish). A dependent switch works the same way as a dependent number
    (`RotationOption.dependsOn`, on any kind of setting). One whose parent is under another
    heading stays with its own heading, and its help names the parent ("Needs Battle Shout
    on").
  - **Advanced** (principle 2): switches and choices are always in view, and each heading's
    number settings (rage and timing thresholds) wait behind an **Advanced** button on the
    heading's right. Opening it shows them in place, under the switch each one tunes, so a
    label like "Shout again with" keeps its context. A heading opens by itself when one of its
    hidden settings differs from its default, and its button counts them ("1 changed") even
    while closed. It opens afresh on each visit to the tab.
  - A switch's whole row is its label, so a tap anywhere on it flips the switch (44 px or
    more, as on the Buffs tab). A switch sits beside its label at every width. Number inputs
    and choices go under the label on a phone.
  - A choice between a few named values (Arms: the stance it fights in) is a segmented control
    (a toggle group, like the Fight tab's position), full width on a phone, labelled by its row.
  - A setting's default can follow the talents or another setting (Arms: Rend is on by default
    with Bloodthrill; Berserker Stance turns Whirlwind on and Rend and Overpower off). The tab
    shows the value the sim will use, the help says what it follows, and a value you set stays
    set until you reset it.
  - **Changed settings are marked.** A setting that differs from its default for this setup
    gets a line under its help: a dot, its default ("Default: 42 rage", "Default: on") and a
    **Reset** for that row alone, which moves focus back to the row's control. A value you set
    that equals the default isn't marked. Screen readers hear "Changed. Default: …" as the
    switch's description.
  - A setting that depends on a switch is dimmed while that switch is off, or can't apply
    itself (a potion's threshold while the potion isn't selected in Buffs), down the tree.
  - A consumable's row needs its Buffs switch. While that's off, its own switch shows off and
    locked, whatever it's set to, and the row says so ("Not used: turn on … in Buffs first"),
    with **Buffs** a link to that tab. Turning it on in Buffs brings back its setting.
- **Fight.**
  - The header names the boss's level ("A level 63 raid boss"), following Boss level.
  - Duration (default 180 s), boss armor preset, execute phase, and whether you attack from the
    front (tanks) or behind (DPS).
  - The duration slider's track and thumb are 44 px targets. Its thumb is named "Fight length"
    and says its value in words ("3 minutes"). The execute phase's help names the class's
    execute ability (Execute for warriors), and its whole row is the switch's label.
  - No number of targets yet: the sim has one target, so the control waits for multi-target
    support ([warrior §5.5](classes/warrior.md#55-multi-target-options-light)). A control that
    changes nothing isn't shown. Saved setups keep the value (`extraTargets`), unused.
  - Advanced: iterations and seed, then the fight's details. Every field is labelled, the
    Creature type and Zone menus included, and a stepper's buttons name their field
    ("Decrease Boss level").

## Results

- **Headline:** DPS with its ± 95% CI. After a re-run, show the change from the previous result
  (▲/▼ with color *and* sign). Under it, one line says what was run: "2,750 fights of 180 s ·
  Forever rules · ran in 0.1 s". The length is the one set in Fight, not the average of the
  varied fights; the run time is labelled.
- **On desktop the panel never runs past the viewport.** The headline card with Simulate stays
  put, and everything under it scrolls inside the panel, with a fade and a chevron at an edge
  that has more. While it overflows, that area takes keyboard focus so arrow keys scroll it. On a
  phone the results sheet scrolls as a whole.
- **A result with no damage** says why and what to do next: with no main-hand weapon, "Add a
  weapon in Gear", with a button that opens the tab (and closes the sheet on a phone). The
  button is left out beside the desktop panel when that tab is already open.
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
  **casts per fight** (pre-pull casts included), all in tabular numbers. The casts column's
  visible header is just "Casts" (its full name is for screen readers), and a caption above the
  table says what both columns count, so names like "Holy Strength (main hand)" keep one line
  at 390 px. A dash, read out as "none", marks a value that doesn't apply: a cast with no buff
  (Bloodrage) has no uptime, and a proc buff has no casts. A weapon proc on both hands names its
  hand: "Holy Strength (main hand)". A buff that only triggers when you're hit (Enrage) shows a
  dash, not 0.0%, when a DPS run took no damage, with "Needs damage taken (Fight → Advanced)"
  under its name; the Fight tab's "Damage you take" help names Enrage too, and stays 0 by
  default.
- **Character sheet:** the final AP, crit, hit, haste, weapon skill and armor, the way the
  sim computed them.
- **Assumptions:** the `[?]` items that affect this setup, each a full-width row linking to its
  doc section on GitHub (a new tab, so the result stays open), with the doc's name under the
  text. The sim can't measure how much each one moves a result yet, so they're grouped by what
  you can do about them, under small headings: **Your gear and consumables**, **Your race and
  stats**, **_Class_ mechanics**, then **Combat rules**. Inside a group, the ones likely to
  matter most come first (a judgment kept in `src/features/results/assumption-groups.ts`).
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
    As text on light surfaces they're darkened in OKLCH, keeping the hue, to meet AA:
    Warrior `#92642D`, Druid `#C54600`, Paladin `#AB4B79` (the `--class-*` tokens in
    `src/index.css`, used through `CLASS_TEXT` in `src/app/specs.ts`). Dark mode uses the class
    colors themselves.
  - **Status text** uses tokens, never raw palette classes: `text-positive` (emerald: better,
    a partly ranked talent), `text-negative` (red: worse) and `text-notice` (amber: a maxed
    talent, a warning). Light mode takes Tailwind's -700 shades and dark mode the -400 shades,
    so each is AA at small sizes. The one exception is the stale results' "Setup changed"
    badge: a solid amber chip with amber-900 text (a translucent chip with amber-300 in dark
    mode), 8:1 or more, because it's the smallest text there and the phone bar behind it is
    translucent.
  - **Item quality** colors: Uncommon `#1EFF00`, Rare `#0070DD`, Epic `#A335EE`, darkened as
    needed to meet AA contrast on light backgrounds.
  - Color never carries meaning alone; always pair it with a label, sign or icon.
- **Controls** meet 3:1 against what's behind them (WCAG 1.4.11), in both themes. An unchecked
  switch's track uses its own token, `--switch-off`, rather than the input border color.
- **Stale results** (and a kept result during a re-run) are dimmed by color, not opacity: their
  text turns to the muted text color, and bars and icons fade to gray (`data-dimmed` in
  `src/features/results/results-panel.tsx`). Muted text at 60% opacity would fall to about
  2.3:1, below AA. The "Setup changed" badge sits outside the dimmed parts, so it's never
  dimmed.
- **Game icons:** WoW icons by icon name from Wowhead's CDN, lazy-loaded at a fixed size with
  a neutral placeholder on error. Nothing depends on them loading.
- **Motion:** short and purposeful (sheets, disclosure). Respect `prefers-reduced-motion`.

## States

Every view handles these states:
- **Default:** the first visit, with defaults applied.
- **Empty:** an empty gear slot, no talents spent, no results yet.
- **Long content:** long item names, many buffs, a narrow width.
- **Running:** progress, a cancel button, and the previous result still visible.
  - The results panel and sheet show "Simulating… 45%" and a progress bar above the kept
    result, which is dimmed. The phone's bottom bar keeps the dimmed value with a small "45%"
    beside its label and a thin progress line along its top edge.
  - A polite live region, mounted once at every width, says "Simulating…" when a run starts
    and then "Done: 682.5 DPS" or "Simulation cancelled."
- **Stale:** the setup changed after the last run, so results are dimmed with a "Re-run" hint.
  - The whole result dims, the breakdown and details included, not just the headline. Dimmed
    text turns to the muted text color, which still meets AA; bars and icons fade to gray. The
    "Setup changed" badge beside the headline isn't dimmed.
  - A result for another spec is set aside rather than shown: after switching from Fury to
    Arms the panel is empty, ready to simulate Arms, and switching back to Fury brings Fury's
    result back. A number under the Arms header that belongs to Fury is too easy to misread,
    especially in the phone bar, which has no room for a label; the ▲/▼ change never compares
    specs anyway.
- **Error:** the worker failed or a shared link is invalid. Show a plain message and a way
  forward (retry, or reset to defaults).
  - A setup the engine refuses (a Skyborne warrior) is titled "This setup can't be simulated",
    and its message says what to change, so no retry advice follows it. Any other failure is
    titled "The simulation failed" and suggests trying again, then resetting the spec.
  - On a phone the bottom bar shows the failure itself: a warning icon, "Couldn't simulate"
    and the start of the reason, in AA colors. "Show results" stays enabled, with or without an
    earlier result, and opens the sheet with the full message. The live region reads it out
    too (on desktop the panel's alert does).

## Persistence and sharing

- The setup is saved to `localStorage` automatically and restored on the next visit.
- **Share** copies a URL with the compressed setup in the hash (`#s=…`). The clipboard write
  starts within the tap itself, with the link as a promise (`ClipboardItem`), because Safari
  refuses one that follows an await. A toast says the link was copied, or that the browser
  refused and how to allow it.
- Opening a link loads it, whether it opens a new tab or is pasted into a tab that already has
  the app open (only the hash changes). A toast says so, and which spec it switched you to, with
  **Undo**. Undo restores the whole previous setup, including your own saved setup for the
  link's spec, so undoing a link for your other spec gives that spec's setup back.
- **Toasts** sit at the bottom, just above the phone's sticky bar, so they never cover the
  header. A toast with Undo stays up 10 s, paused while it's hovered, touched or focused
  (`undoToast` in `src/app/undo-toast.ts`). Its buttons are 44 px tall.
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
- When a sheet or dialog opens, focus moves into it: to its title when the content is long
  (About, the phone's results), or to its first field (a search box). When it closes, focus
  goes back to the control that opened it. Radix does this only for its own Trigger, so one
  opened from state uses `useSheetFocus` (`src/app/sheet-focus.ts`).
- The page has one `<h1>`, "Forever Sim"; sections, sheets and groups use lower levels.
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
