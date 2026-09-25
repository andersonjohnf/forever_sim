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
   **390 px**, **1280 px** and **1920 px** (the wide layout, D34). No horizontal page scroll. Touch targets are at least 44 px.
   Everything works with a keyboard.
5. **Calm, modern, consistent.** Use shadcn/ui components and one type scale. Surfaces are
   neutral; color is reserved for meaning: class, item quality, better or worse. The brand makes
   two exceptions ([Brand](#brand)): the Decades gold, on the brand's own marks alone, and the dark
   theme's surfaces, which lean slightly toward the guild's ink navy at the stock lightness.
6. **Fast and never blocking.** Sims run in Web Workers with progress and a cancel button.
   Changing a setting never freezes the page. Results that no longer match the setup are
   marked stale.
7. **Provenance without noise.** Data sources, builds and tags live in an **About** sheet and
   in tooltips on flagged values, not on the main screen.
8. **Only finished specs ship.** A spec appears in the spec picker only when its sim and UI
   are complete. No spec or feature shows in the app as coming soon (no greyed-out entry, no
   placeholder tab or button); what's planned is listed only in the menu's
   [Coming soon](#coming-soon) sheet. To see and test one before it ships, a dev
   build, or a browser under automation (the e2e tests, `npm run snap`), offers it too when the
   URL names it: `?preview=<spec id>` (`src/app/preview-specs.ts`). A visitor's browser
   ignores the parameter.

## Layout

| Width | Layout |
| --- | --- |
| **≥ 1920 px** | As wide, and the results pane is 38% of the page, between 46 and 68 rem (`3xl:`, a breakpoint of its own in `src/index.css`). The page stops growing at 2560 px and sits centred. |
| **1440–1919 px** | The wide layout ([D34](decisions.md#d34-a-power-user-desktop-layout-at-wide-widths-2026-09-25)): the page drops its 1280 px cap and fills the window, with 24 px gutters (`wide:`). The header spans the same width. The setup takes the rest and the results pane is 30 rem, 32 px from it. |
| **1024–1439 px** | A header, then two columns, capped at 1280 px. **Left:** the setup, as section tabs. **Right:** a sticky results panel, 22 rem, with the Simulate button. |
| **640–1023 px** | One column of setup sections. A sticky bottom bar shows the latest result, a labelled **Details** button and the Simulate button; tapping the result or Details opens the full results as a sheet. A bare chevron isn't enough: people missed it and took the headline for the whole result. The bar's headline is only the value and the change's arrow, at every width; the ± and the change's amount are in the sheet. Below 360 px only the Details button's outline and chevron fit. The button's outline takes `--input`, like any outline button, and the Simulate button has no icon in the bar. |
| **< 640 px** | A compact header. The section tabs are a horizontally scrollable segmented bar, sticky under the header. The sticky bottom bar works as above. Pickers open as full-height sheets. |

**From 1024 px, where the results sit beside the setup,** the first thing in the page is a **Skip to
results** link, hidden until it has keyboard focus (then a 44 px button at the top left, over the
header). It moves focus to the results pane, so the next Tab reaches Simulate; the pane takes focus
only then. It moves focus in script, not by its `#results` hash, which share links own.

**At every desktop width the results pane never runs past the viewport:** it's sticky, and its
details scroll inside it, with a fade at each edge that has more past it ([Results](#results)).

**Container queries, not breakpoints, lay out what's inside the panes.** From 1440 px the setup
pane is the container `setup` and the results pane the container `results` (Tailwind's
`@container/setup` and `@container/results`), so a section styles itself by the width it
actually has (`@min-[56rem]/setup:…`). Below 1440 px neither is a container, so those queries
match nothing and the layouts under 1440 px stay as they are. Only the shell (`src/App.tsx`, the
header, the section tabs) uses the `wide:` and `3xl:` breakpoints; `useIsWide()` in
`src/hooks/use-media-query.ts` is its script's twin.

**Header:** the Decades lockup ([Brand](#brand)): the guild's crest, "Forever Sim" (the page's one
`<h1>`) and "Decades" under it, one link to the guild's site; on phones only the crest shows,
the name visually hidden. Then the **spec switcher**, which shows the class icon and spec in the class color. It's the
one part of the row that gives way: below 360 px the row's edge and gaps tighten so every shipped
spec's name fits whole at 320 px ("Marksmanship", "Beast Mastery"), and a longer name would
truncate rather than scroll the page sideways (an e2e test walks every spec at 320 px). Its menu lists
the specs under their class's heading, each class a group named by it, so a screen reader tells a
warrior's Protection from a paladin's too. Then
**Share** (copies a link to this setup) and an overflow menu with Setups…
([Setups](#setups)), About & data, Release history ([What's new](#whats-new)), Coming soon
([Coming soon](#coming-soon)), Theme (system, light, dark) and Reset setup. Menu items are 44 px tall.

**About & data** opens a sheet that starts with what the app is, without naming specs ("A DPS
and TPS simulator for World of Warcraft: Forever", since Protection, the first tank spec, shipped; "A DPS
simulator" while only DPS specs did), then the specs it covers on their own line, one class at a
time ("Covers Warriors: Fury, Arms and Protection · Druids: Feral (Cat) · Paladins:
Retribution and Protection"), which grows as specs ship (principle 8). The page's meta and Open
Graph descriptions in `index.html` carry the same description line, so they changed once, when
the first tank spec shipped; an e2e test compares them. Right under the description line, above
the specs, the **release stamp** says when this release went out, in the viewer's own time zone,
and its build: "Updated 8:05 PM EDT · Sep 24, 2026 · build 1a2b3c4". Players check it to see
whether a fix they heard about is live, and quote the build when they report something. Under it,
a 44 px link-style button, **What changed in each release**, opens Release history in About's place
([What's new](#whats-new)); closing it gives focus back to the menu's button, as About would. The sheet
ends with **Made by Decades** ([Brand](#brand)) and the line that neither Forever Sim nor Decades
is affiliated with or endorsed by Blizzard Entertainment. Every link in the sheet opens in a new
tab, so the sheet stays open, with `rel="noopener"` and "(opens in a new tab)" for screen readers.

### What's new

Players hear what changed from the app itself, in the words of the Discord posts (CLAUDE.md,
"Release updates"): each release's changes grouped by who notices, from `src/app/releases.ts`
([architecture, "Release notes"](architecture.md#release-notes)).
- **What's new** opens by itself on a returning visitor's first load of a newer release, and lists
  every release since the one they saw last, newest first, not only the newest. It's shown once:
  the newest release's id is stored as it opens (`forever-sim:last-seen-release`), so a reload, or
  closing it any way, doesn't bring it back.
  - A first visit shows nothing: the whole history isn't dumped on anyone. A browser with no id but
    an automatic save or named setups was here before What's New shipped, so it gets the newest
    release alone, as if it had seen the one before. The check comes before the load saves anything,
    so a first visit from a share link is still a first visit.
  - An id the list doesn't know shows nothing. It's replaced by the newest only if it's older, or
    isn't a release id at all; one from a newer release (a tab that already had it, then a rollback)
    is kept, so that release isn't shown twice.
  - Without storage it shows nothing, and the app works as usual.
  - From 640 px it's a dialog (up to 32 rem wide and 85% of the window's height, its list
    scrolling); below, a bottom sheet up to 85% of the screen's height. Its title, "What's new", and
    "Since your last visit, newest first." head it, with a 44 px Close in the corner. Its footer ends
    it: **Got it** closes it, and **All releases**, a secondary button, opens Release history in its
    place, as About's release stamp does. Both are 44 px tall; on a phone they're full width, Got it
    first. While a toast is up, the footer's bottom padding grows by the toasts' reach, so neither
    button sits under one.
  - Focus goes to its title, stays inside, and Escape closes it. Nothing opened it, so on closing
    focus goes back where it was when the page loaded. After All releases, Release history takes
    focus, and gives it to the header's menu button when it closes, as it does opened from About.
  - The load's own notices (a shared link loaded, newer defaults, parts out of date) wait until it
    has closed, and Release history too if All releases opened it. Over it they'd cover its buttons
    and time out unread, and a screen reader couldn't hear them, since the dialog hides the page. The
    link's setup is loaded under it meanwhile. A link pasted in while it's open says so at once, as
    toasts do over any dialog ([Notices](#persistence-and-sharing)).
- **Release history**, in the header's menu after About & data (and from About's release stamp or
  What's New's All releases), is a side sheet like About, full width on a phone, with focus on its
  title and back to the menu's button when it closes. "What each release changed, newest first, in
  your time zone." Then every release, the newest labelled **Latest** beside its time.
- Each release, in both, is headed by its time in the viewer's own zone, as the release stamp
  reads ("2:46 PM EDT · Sep 24, 2026"), then its groups: a small uppercase label in the muted text
  colour ("Tanks", "DPS specs", "Your setup") over a bulleted list. Releases are divided by a rule.

### Coming soon

Players see what's planned from the app too, in the same player voice as the release notes: every
agreed milestone, in the order it's coming, from `src/app/roadmap.ts`
([architecture, "Release notes"](architecture.md#release-notes)).
- **Coming soon**, in the header's menu right after Release history, is Release history's pair: the
  same side sheet (`src/app/notes-sheet.tsx`), full width on a phone, with a 44 px Close in the
  corner, focus on its title, and back to the menu's button when it closes.
- "Coming soon", then "What's planned, in the order it's coming. Plans can change." Then each
  entry: its name as the heading, with when it's coming beside it as a small label. **Next update**
  stands out as Release history's **Latest** does; **Planned** and **Later** are outlined in the
  muted text colour. Under it, its plans as a bulleted list. Entries are divided by a rule.

**Footer:** "Game data from" the wago.tools logo (decision D16, its logo exactly as its branding
guidelines supply it), then "An app by" the Decades mark ([Brand](#brand)): side by side on a wide
screen, one under the other on a phone.

**Section tabs** are 44 px tall. When they scroll sideways, a fade marks each edge with more
tabs past it (none at an end), and the chosen tab scrolls into view clear of the fades, as does
a tab that arrow keys move focus to. Arrow keys move between tabs and Enter or Space opens one
(manual activation), so focus coming back from a toast never switches the tab. Opening a tab
from further down the page scrolls up to the new section's top, just under the sticky tabs
(smoothly, unless reduced motion is asked for), so its header and any note under it (Classic
Era's) start in view rather than under the tabs. From 1440 px a tab can carry a **summary line**
under its label, in muted 12 px text, and the tabs grow to 56 px; the tab's accessible name stays
its label and the summary is its description (`src/app/section-tabs.tsx`).

**Section tab summaries** (from 1440 px, decision D34): under each tab's name, a muted 12 px
line says what its section holds, so the whole setup reads at a glance. The name stays the tab's
label; the line is its description. Each line uses the rule its own tab uses to say the same
thing (`src/app/section-summary.ts`), so it never disagrees with the tab, and stays within 24
characters, about what fits under a tab at 1440 px:
- **Character:** the race, and the rules when they aren't Forever's: "Human", "Orc · Classic
  Era". A Skyborne race drops its faction variant only when the rules would push it past the
  width: "Skyborne · Classic Era".
- **Talents:** the points in each tree, in tree order: "17/34/0".
- **Gear:** "Pre-raid best in slot" (a tank's "Threat set") while every slot holds the default
  set, by the Gear tab's own comparison; "No gear" with every slot empty (after Remove all gear);
  otherwise "1 slot changed", "3 slots changed".
- **Buffs:** the preset the Buffs tab's picker shows ("Standard raid"), or "Custom".
- **Rotation:** the preset the Rotation tab's picker shows ("Default", "Balanced"), or "Custom".
- **Fight:** the length as the Fight tab shows it ("3:00"), and the boss's level only when it
  isn't a raid boss's 63: "3:00 · level 62".

**Setup sections**, in this order: **Character · Talents · Gear · Buffs · Rotation · Fight**.
Each opens with its title and a short intro. An action (Reset rotation, the gear menu) sits on the
title's right; on a phone the intro takes the full width under both, and from 640 px it sits
beside the action (`SectionHeader` in `src/features/section.tsx`).

## Sections

- **Character.**
  - Race: only races that can be the selected class in Forever, grouped by faction (Alliance,
    then Horde) in one radio group. Arrow keys move between races and pick them, and the
    selected race is the group's only tab stop. Level is fixed at 60 and not shown.
  - A race the sim can't simulate yet (a Skyborne warrior or hunter: its level-60 base stats aren't
    known, [character-stats OQ-1](mechanics/character-stats.md#oq-1-paladin-druid-and-skyborne-base-attributes))
    stays in the list with a dashed border and the reason in its tile, which is also its
    description for screen readers: "Can't be simulated yet: its base stats at level 60 aren't
    known." It can still be picked, to see its racials, and a run then says why it can't go
    (see [States](#states)). It isn't hidden: a Skyborne player should see why, not wonder where
    their race went.
  - A race on the other side swaps the faction-bound gear (PvP, battleground and reputation
    rewards, [items.md](data/items.md#equipping-rules)) for the new faction's twin, which has
    the same stats, and keeps the slot's enchant. Where the other side's piece has the same stats
    in another set or none (the Alliance's Rank 7 to 10 silk and satin, and the Horde's leather, have
    no set bonus), it
    swaps too, and the notice says how: "…, with the same stats but in another set", "…, with the
    same stats but no set bonus", or, going back to a piece in a set, "…, with the same stats, now
    with a set bonus" ([items.md "Faction twins"](data/items.md#faction-twins)). A twin's class restriction counts only as
    whether this class can wear it, so a warrior's Sergeant Major's Plate Wristguards (warriors
    and paladins) swap for First Sergeant's Plate Bracers (warriors). The swap happens out of
    sight, on the Gear tab, so a notice names the new items. An item with no twin stays, and the
    notice says so. A slot still holding the spec's default takes the new race's default instead
    ([architecture, "Following the defaults"](architecture.md#following-the-defaults)), so an
    untouched set stays the default set: a Horde paladin gets the Horde threat set's own pieces,
    and the notice says where they're from ("Swapped 4 items for Horde gear": "Premier Scaled
    Shoulders, …, from the Horde threat set.").
  - Advanced: the rule profile (`Forever`, the default, or `Classic Era`) and the switch for
    unmeasured ratings
    ([D12](decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)).
    A switch's whole row, with its help, is its label, as in Buffs. Switches for untested
    mechanics live here, not on the Rotation tab, since they aren't rotation choices: a paladin's
    also has **Judgement of the Crusader's bonus** (A share, the default, or All of it;
    [paladin.md open question 5](classes/paladin.md#open-questions)), a segmented control whose
    help says in plain words what each means. It's dimmed, with "Not used: Judgement of the
    Crusader is off in Rotation.", while the rotation doesn't judge the Crusader.
  - The rule profile's help says what Classic Era changes and what it doesn't
    ([architecture, "Rules and stats"](architecture.md#rules-and-stats)), naming every
    exception: Classic's combat rules; its raid buff, debuff, consumable and enchant values; the
    warrior's own Battle Shout, Recklessness and Berserker Stance; and the Hand of Justice and
    Ironfoe procs. Racials, talents, other abilities and the rest of the gear stay Forever's.
  - **Changed settings are marked,** as on the Rotation tab: the race and each Advanced setting,
    when it differs from the spec's default, gets a line under it with its default ("Default:
    Human", "Default: Forever") and a **Reset** that moves focus back to its control. Advanced
    opens by itself while a setting in it differs from its default, and its button counts them
    ("Advanced, 1 changed"), so Classic Era rules are never out of sight.
  - **Wide layout** ([D34](decisions.md#d34-a-power-user-desktop-layout-at-wide-widths-2026-09-25)):
    from a setup pane of 53 rem (a 1,440 px window: 55 rem, or 54 beside a scrollbar that takes room),
    the races sit on the left, three to a row, and the chosen race's racials beside them on the right,
    so a pick and what it brings are in view together. Advanced spans the pane below both. Narrower,
    the racials come under the races, as at every width under 1440 px.
- **Talents.**
  - A preset menu with the documented builds (its class doc) of the specs the app offers, so it
    grows as specs ship (principle 8): a druid sees the Feral cat's build and the bear's, and a
    paladin sees Retribution's and Protection's. The spec
    default is selected. Only the current spec's default is marked "(default)"; another spec's
    reads plainly ("Arms default"), so the menu never shows two defaults.
  - While the build is the spec's default, a quiet line under the buttons says so, as Gear's does
    for its set: a check and "Using the default build." in muted text. It's gone once a point
    changes, and it's what follows newer defaults
    ([Persistence and sharing](#persistence-and-sharing)).
  - Interactive trees: three side by side on desktop, one tab per tree on mobile (a segmented
    control named "Talent tree", each tab as wide as its name and points need, with tight padding,
    so "Feral Combat 37" fits beside Balance and Restoration down to 360 px, and a warrior's three
    at 320 px). With a mouse, click to add a point and right-click to remove one; on a touch
    screen, a tap opens the talent's details with − and + buttons. On a focused talent, Enter adds a
    point and Backspace removes one (Delete and − work too); the hint above the trees and each
    talent's tooltip say so. Tier gates and prerequisites are enforced visibly: a locked talent's
    icon turns gray and its rank badge takes the muted text colour (AA), never opacity.
  - **At wide widths** (from 1440 px, by the setup pane's own width, D34): from a 64 rem pane (a
    window of about 1,660 px, 1,680 beside a classic scrollbar) the talent icons grow from 44 to 52 px
    and each tree's card stops at 26 rem, the three centred. From an 80 rem pane (about 2,040 px, or
    2,060 beside a scrollbar; not at 1920, whose pane is 75 rem) a **talent detail panel**, 22 rem,
    sits beside the trees, which keep their 52 px icons, sticky as the Rotation
    panel is: the talent under the pointer, or else the focused one, or else the last one shown, with
    its tree and tier, rank, the current and next rank's text, why a point can't move, and what it
    **needs**: the tree's points above its tier and its arrow's talent, each met or not with the
    count ("30 points in Fury, 30 of 30"; a first-tier talent needs nothing). Until you point at
    one it says to. While it shows, pointing at a talent doesn't also open its tooltip, which would
    repeat the panel over the neighbouring talents; focusing one still does. It isn't a live region,
    and the popovers and every click and key stay as they are
    (`src/features/talents/talent-detail-panel.tsx`).
  - **A point that can't move says why.** A talent that can't take a point says what it needs
    ("Requires 5 points in Fury."). One whose point can't come back names what depends on it:
    the talent its arrow leads to ("Can't remove a point: Bloodthirst needs 1 point in Death
    Wish."), or the talents in the first deeper tier whose gate would break ("Unbridled Wrath
    needs 5 points in Fury above it."). The reasons show in the tooltip and the popover, where
    the reason describes the disabled −. A click, right-click or key that's refused shows the
    reason as a toast, one at a time.
  - In the popover, a button that disables itself (− at 0, + at the top rank) hands focus to the
    other one, so focus never falls to the page.
  - A points counter (x / 51) and **Import / Copy build code**. A pasted code that doesn't
    work gets a plain reason: "That isn't a talent code", with an example code for the class;
    a code for another class; more than 51 points; or the talent a tier gate or arrow blocks.
    A code that isn't a build on today's trees but is on the game's older ones is read there and
    mapped onto today's, as an old setup is, and a notice says so: "Pasted a code from the game’s
    older talent trees", with the points it lost ("… Spend them again.": you're in Talents
    already), the build the sim shipped it succeeds ("That code was the Retribution default on the
    game’s old trees; it’s now today’s default.", trailing zeros or not), or "Every talent kept its
    points on today’s trees." ([talents.md § Tree versions](data/talents.md#tree-versions)).
    A code that's a build on both keeps today's reading.
    The paste dialog puts focus in its field, and gives it back to **Paste code** however it
    closes. **Clear** disables itself, so it moves focus to the preset menu (now "Custom build")
    first.
- **Gear.**
  - The tab says what the gear starts as: a DPS spec's pre-raid best in slot ("Starts as Fury Warrior
    pre-raid best in slot"), or for a tank, whose default is the sim's measured threat set rather
    than a guide's list (D29, D30), "Starts as the Protection Paladin threat set: pre-raid items
    measured for threat, keeping an effective-health floor".
  - Under it, a bordered row puts the default set back in one tap: a 44 px **Equip pre-raid best in
    slot** button, or **Equip the threat set** for a tank, beside a line on how the gear compares.
    While any slot's item or enchant differs from the default for the spec and race, the line
    names them and says what the button replaces, since it replaces them all at once and there's
    no undo ([D21](decisions.md#d21-no-undo-setups-are-saved-loaded-exported-and-imported-2026-09-23)):
    "3 slots differ from the threat set: Head, Legs and Main hand. Equipping it replaces all 3."
    ("… replaces that slot." for one, "… replaces both." for two; an empty slot, as after Remove all
    gear, is filled rather than replaced: "… fills all 17.", or for a mix "… fills 2 empty slots and
    replaces the other 3."; a slot the default leaves empty but the player filled, such as an Arms
    warrior's off hand beside a one-hander, is cleared, by name: "… replaces 1 slot and clears Off
    hand.", "… fills 15 empty slots, replaces 1 and clears Ammo and Quiver.", or "… clears Off
    hand." alone). A no-break space joins each count to the word before it, so a wrapped line never
    splits a count from that word ("all 17", "the other 3"). The line follows a dot in the primary colour
    (the changed-setting marker of Character and Rotation); the row takes a muted fill and the
    button is the primary one. Once the gear matches, it's quiet: a check and "Wearing the threat set." in muted text,
    and no button, since there's nothing to equip. Equipping from the keyboard moves focus to that
    line as the button goes. The line is the button's description for screen readers. Below 640 px
    the button takes the row's full width under the line. The button used to hide in the options menu;
    it's the tab's main action, and on a returning visit the likeliest one, so it's in view, and the
    menu (**Gear options**) keeps only **Remove all gear**, which empties every slot with no undo
    ([D21](decisions.md#d21-no-undo-setups-are-saved-loaded-exported-and-imported-2026-09-23)),
    so it stays a deliberate step away.
  - Slots in paper-doll order. Each row shows the item icon, its name in its quality color,
    a one-line summary of its key stats, and an enchant chip. An item with no stats, whose worth is
    its effect (Draconic Infused Emblem, Earthstrike, a totem or idol), shows its effects in the
    tooltip's own words there instead (`statsLine` in `src/features/gear/item-flags.ts`), on slot
    and picker rows alike, so a proc trinket's BiS rank has its reason beside it; "No stats" is
    left for an item with neither. Empty slots have their own
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
  - **From 1440 px** (the wide layout, [D34](decisions.md#d34-a-power-user-desktop-layout-at-wide-widths-2026-09-25)),
    once the setup pane is 53 rem or more (it's 55 at 1440 px, about 54 where a scrollbar takes
    room), the slots become **one compact list**, and the picker opens **inline** in a panel beside
    it rather than in a dialog, as the Rotation tab's row settings do:
    - Each slot is one row of 56 px or more in one bordered list per group: the icon, the item in
      its quality colour with its BiS rank, then the slot and its stats on the next line (up to two
      lines), the flags beside them (under them when they'd squeeze them), and the enchant chip in
      its own cell at the row's end. The slot's button and the chip are 44 px targets or more; their
      focus rings sit inside the row. An empty slot shows its faded icon, name and "Empty".
    - The panel is the dialog's body exactly (the search, filters, sort, rows, rules and messages
      above, one component for the dialog, the phone's sheet and the panel) under **Back to list**,
      the title ("Choose chest") and its description. It stays in view as the list scrolls: it sits
      1 rem under the sticky tabs and reaches down to 1 rem above the window's bottom, its items
      scrolling inside it with a fade on each edge that has more past it (as the Rotation panel).
      Until a slot is chosen it says "Choose a slot to see the items you can equip there."
    - The chosen slot has a bar in the primary colour on its leading edge and is the list's current
      one (`aria-current`). Choosing a slot moves focus to the panel's heading. **Picking an item
      equips it and the panel stays on the slot**, so you can compare the candidates and then move
      on; focus stays on the item, and screen readers hear "Equipped Knight-Captain's Plate
      Hauberk." (**Leave this slot empty** goes with the item, so focus moves to the heading.)
      **Back to list**, or Escape anywhere in the panel, returns focus to the slot's row; the panel
      keeps its slot. A select's or a flag's own Escape closes just that.
    - Keys: with focus anywhere in a slot's row (its button, a flag, the enchant chip), **Up** and
      **Down** move to the slot above or below, across the groups and past an off hand a two-hander
      locks; **Enter** opens the slot in the panel. **/** in the panel, outside the search box,
      focuses the search.
    - The panel is 24 rem, and 30 rem from a 68 rem pane (1920 px). From an 84 rem pane (about
      2,270 px) the slots take two columns beside it: Armor, then Jewelry and Weapons.
    - The enchant picker stays a popover, and the default set's row and **Gear options** are as
      above. A slot chosen in one layout doesn't carry into the other, so narrowing the window past
      1440 px never pops the dialog up.
  - The picker offers only what the character can wear together
    ([items.md, "Equipping rules"](data/items.md#equipping-rules)):
    - It leaves out the other faction's PvP and battleground items, except the one equipped.
    - A unique item worn in the other slot of a pair moves over when picked. Its second line
      says so: "Unique: moves from ring 2".
    - An item that would break a Unique-Equipped group is dimmed and can't be picked. A line
      at full contrast says why, e.g. "Unique-Equipped (Undermine Trinkets): you're wearing
      Weakness Analyzer in trinket 2." It stays focusable, so the reason is read out.
    - A hunter's ammo that the ranged weapon doesn't fire is dimmed and listed after the ammo it
      does, with the reason at full contrast: "For bows and crossbows: your gun fires bullets".
      It can still be picked (it adds nothing), and its slot row shows the same line. Picking a
      ranged weapon that fires the other kind swaps the ammo, and the quiver or pouch, to match
      ([hunter.md §7.3](classes/hunter.md#73-gear)); screen readers hear what was swapped in.
  - Badges, on slot rows and picker rows alike:
    - the BiS rank;
    - **Classic stats** for items with no Forever data yet;
    - **Effect not simulated** for items with an equip, chance-on-hit or use effect the sim
      leaves out (Blackblade of Shahram's summon), the same items the result's assumptions
      list. An effect that names only another spec's abilities isn't one: Idol of Brutality's
      Maul and Swipe, a bear's, aren't flagged for a cat.

    The two flags open a popover on tap, click or Enter that explains them and, for effects,
    quotes each one; the popover is named by its heading ("Classic stats"). They sit over the
    row's button, never inside it, with 44 px hit areas. The row's button covers the row: its
    name is the slot and item ("Main hand: Blackblade of Shahram"), and its description carries
    what the row shows: stats, BiS rank and flags.
  - A row's enchant chip ("Greater Strength · +10 Strength", or "Add an enchant") opens the
    **enchant picker**: a popover named for the slot ("Hands enchant") on wider screens, and
    below 640 px a full-height sheet with a 44 px Close, like the item picker. The chip's
    accessible name starts with its visible text (WCAG 2.5.3): "Greater Strength · +10
    Strength, Hands enchant", "Add an enchant, Shoulders". The enchants that fit are one
    listbox, "No enchant" first, each a 44 px option with its summary. Focus goes to the list
    with the current enchant active; arrow keys, Home and End move, Enter or Space picks, and so
    does a tap. The active option has a muted fill and a bar on its left in the focus ring's
    colour, which is what meets 3:1 (the fill alone is about 1.1:1). The current enchant is the
    selected option, with a check. Focus goes back to the chip when it closes, or to the slot's
    button if the chip has gone meanwhile (a share link pasted into the tab took the item away).
    Under Classic Era rules it says its values are Classic Era's, as Buffs does.
- **Buffs.**
  - Presets: Self only, Dungeon group, Standard raid (the default, named "Standard raid
    (default)", like the talent presets), Max consumables. Each shows what it brings in a line
    under its name, in the tile, not in a hover title.
  - Composition switches: which classes are in the raid. These drive which raid buffs are
    available; buffs never depend on faction.
  - Grouped switches for raid buffs, target debuffs and consumables. A buff nobody in the raid
    brings says so ("Needs a paladin in the raid"; for a paladin, "Needs another paladin in the
    raid", since you're one) and is dimmed by colour, not opacity: its text takes the muted text
    colour (AA), its icon turns gray, and its switch is off and disabled. You count for a buff you
    cast on yourself: a druid's Gift of the Wild never needs another druid, nor a paladin's
    Blessing of Might another paladin. Its switch is an ordinary one, yours to turn off.
    One that does nothing for your spec is dimmed and locked off the same way, and says why: for a
    druid, a Dense Sharpening Stone or Weightstone ("Not used in Cat Form: your attacks there don't
    use your weapon's damage."). One that a Rotation setting leaves doing nothing says so the same
    way, naming the setting: Windfury Totem beside an Enhancement shaman's Windfury Weapon, and the
    boss's armor debuffs for a Demonology warlock with the Imp or no demon out ("Not used: only your
    demon's swings meet the boss's armor, and your Imp (see Rotation) doesn't swing.").
  - Only what does something for your class and spec is listed at all: mana and spell damage
    entries (Blessing of Wisdom, mana potions, spell damage elixirs) show for the classes that
    spend mana (the paladin, the shaman, the mage), and what changes only attacks (attack power,
    Strength and Agility, weapon stones, Windfury Totem, the boss's armor) never shows for a caster,
    nor the casters' own (Moonkin Aura, Curse of the Elements, Power Infusion) for anyone else
    ([buffs doc](mechanics/buffs-debuffs-consumables.md#class-only-entries)). An entry your class
    can use but your spec can't in a form (the weapon stones in Cat Form) is listed, locked off,
    as above. The Boss damage debuffs below are listed for every DPS spec, casters too.
  - The **Boss damage** debuffs act on the boss's swings, which only a tank takes, and so does an
    entry that only adds armor (Devotion Aura, Elixir of Greater Defense, Greater Stoneshield
    Potion), since only those swings meet it. For a DPS spec each says so after its summary ("Only
    the tank takes the boss's swings, so it changes nothing for you."), and its switch stays usable.
    Turning Greater Stoneshield on still turns your other potion off, as its summary says ("Potions
    share a cooldown, so one is on at a time"), so a DPS spec reads both before trading its potion
    for nothing. The two attack-power debuffs, of which only one
    applies, name each other: "−204 boss attack power (instead of Demoralizing Shout)" for
    Demoralizing Roar, and the other way round.
  - Entries of which only one can be on turn each other off when one is switched on: one flask,
    one stone or oil (a weapon takes one temporary enchant), one potion (potions share a cooldown).
    The stones' and oils' summaries end with what the spec can put on its weapons: "(one stone per
    weapon)" for a warrior, "(one stone or poison per weapon)" for a rogue, "(one stone or oil per
    weapon)" for a Retribution paladin, "(one oil at a time)" for a caster; one the spec can't use
    says why instead (`src/features/buffs/weapon-note.ts`). The potions' end "Potions share a
    cooldown, so one is on at a time". The air totems' (Windfury and Grace of Air) end "One air
    totem at a time (even from different shamans)", and the two Thorns' (a raid druid's and a bear's
    own) "Doesn't stack with the other Thorns", but only while the tab lists the rival and the spec
    can use it: a warrior's Thorns, with no own Thorns beside it, and an Enhancement shaman's totems
    while its Windfury Weapon locks Windfury off, have none (`src/features/buffs/rival-note.ts`). So
    the switch that turns off isn't a surprise
    ([buffs doc](mechanics/buffs-debuffs-consumables.md#exclusivity-groups)).
  - EZ-Thro Dark Bomb's summary ends with what its 1 s throw costs your spec, in its own terms: "its
    1 s throw stops your melee swings" for a spec that swings, "holds your next cast" for a caster,
    "holds your Auto Shot" for a hunter (`buffSummaryFor`;
    [buffs §3.7](mechanics/buffs-debuffs-consumables.md#37-engineering-and-explosives)). The results'
    assumption about it says the same, and when the spec throws it.
  - Under Classic Era rules, a note at the top says the buff, debuff and consumable values are
    Classic Era's, with a link to **Character → Advanced** that opens the rule profile with focus
    on it.
  - World buffs don't exist here ([D8](decisions.md#d8-world-buffs-are-excluded-2026-09-22)).
  - A buff the rotation keeps up itself (a warrior's own Battle Shout, a cat's own Faerie Fire)
    shows its switch on and locked, with a note saying the rotation keeps it up, so it's never
    counted twice. One the talents bring (a druid's Leader of the Pack) is on and locked the same
    way, and its note says the talents bring it. If another entry of its group is on, of which
    only one applies (Expose Armor over a Protection warrior's Sunder Armor), it stays on and
    locked, and its note says so instead: "Expose Armor takes its place on the boss, since only
    one applies; yours still makes its threat (untested)." The result lists the same assumption.
    If your rotation doesn't cast it then (a bear's roar under a Demoralizing Shout, whose
    Rotation setting says it isn't used), it shows off and locked, and says which is on the boss:
    "… Your raid's Demoralizing Shout is on the boss instead, so you don't cast it (see
    Rotation)."
  - Some of these are the spec's own: the raid's version is assumed to be yours (a cat's Faerie
    Fire, [druid §6.2](classes/druid.md#62-forever-cat-priority); a tank's duties under
    [D26](decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23):
    a Protection warrior's Thunder Clap and Demoralizing Shout, a Protection paladin's Devotion
    Aura, and a bear's Faerie Fire and Demoralizing Roar, [druid §6.3](classes/druid.md#63-forever-bear-priority-tps)),
    so no preset turns them on. When the rotation drops one (a Protection warrior's Balanced and
    Max TPS drop both of its own, a bear's its roar, a paladin's Max TPS its Devotion Aura), its Buffs switch is off by default and
    unlocked, and its note says so: "You're not keeping it up (see Rotation); turn this on if
    another druid does" (or warrior, or paladin). Turned on, it's another
    player's, and it stays on until you turn it off. Without that class in the raid it reads
    "Needs another druid in the raid". (A warrior's Battle Shout isn't one of these: the Buffs
    tab's is another warrior's, and stays on when the rotation drops yours.)
  - Another tank class's duty that no preset gives you (a warrior tank's Thunder Clap and
    Demoralizing Shout, for a bear or a paladin tank) says whose it is: "Boss attacks 20% slower. A
    warrior tank's duty, so presets leave it out; turn this on if one keeps it up."
  - A preset matches on what you choose: a buff your rotation keeps up shows on whatever the
    preset says, so it counts on neither side, and turning another paladin's Devotion Aura on
    under Max TPS, then going back to Defensive, leaves the preset as it was.
  - **Wide layout** ([D34](decisions.md#d34-a-power-user-desktop-layout-at-wide-widths-2026-09-25)):
    each category's groups flow into columns by the setup pane's width, 2 from 53 rem (every width
    from 1,440 px, whose pane is 54 to 55 rem) and 3 from 84 rem (a window of about 2,140 px, 2,160
    beside a classic scrollbar), with CSS columns, so they
    read top to bottom, then on to the next column, and no group splits between two. Each group is its
    own narrower card with its switches at its end, not across the pane from their names. The category
    headings, the presets and "In your raid" stay full width above them. Narrower, the groups are one
    column, as at every width under 1440 px.
- **Rotation.** The spec's ability list. Each entry has an on/off switch, threshold inputs
  with units, one line of help, and the default marked. **Reset rotation** (in the section
  header, enabled once you've set anything or moved a row) puts every setting and the order
  back to their defaults. It disables itself, so it moves focus to the first setting, the next
  control after it (the list's first row when nothing is above the list).
  - **A priority list** ([D31](decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24)).
    Every spec is on the list (Fury first, then the three tanks, then the rest in M5.65 A2), and each
    shows its rotation as the abilities in the order the sim tries them. Its spec-wide settings (a
    stance, a pet, the consumables) sit under their headings above the list, as below. From a
    53 rem setup pane (every width from 1440 px, whose pane is 55 rem, 54 beside a classic scrollbar;
    D34) each of their cards flows its rows into two columns, as the Buffs tab's groups do,
    reading across, with a rule between them; a last row alone on its line takes both, and a
    dependent setting stays under its parent, in its cell. Under
    **Priority list** (a heading, with one line: each global cooldown the sim uses the first
    ability whose conditions hold) come the preset picker and **Reset order**, then the list.
  - **A tank's presets** ([D28](decisions.md#d28-three-tank-rotations-defensive-balanced-and-max-tps-2026-09-24)).
    A spec with named rotations (a tank's **Defensive**, **Balanced** and **Max TPS**) has its
    picker at the top of the tab instead, under a **Preset** heading, first as a tank's priority
    choice always was, as the Talents and Buffs tabs' presets are. Its menu lists them in that
    order and marks the default, "Balanced (default)", as the talent and Buffs presets do; there's
    no separate "Default". Beside it, an **About the presets** button (the info icon, 44 px) opens
    a popover that lists all three with their full help: what each keeps and drops, what it
    measures against Defensive in the default setup (TPS, DPS and damage taken; a bear's and a
    warrior's Max TPS against Balanced too, whose rows they share: a bear's differs by one setting,
    a warrior's by two thresholds), when to pick it, and the Buffs
    tab's versions of the duties it drops. The popover keeps 16 px from the window's edges. Under
    the picker, **one short line** on the one picked: what it keeps and gives up, three lines at
    most at 390 px (a test holds each to 125 characters), with a number or two, its damage-taken
    cost among them; at Custom, "Custom: the list matches none of the presets. Pick one to start
    again from it." The picker's trigger takes that line as its description.
    A tank's Priority choice has no control of its own: the picker sets it (`AplDefinition.presets`,
    architecture.md). Under Priority list there's then only **Reset order**, which hands focus to
    the list's first row, and **Reset rotation** hands focus to the picker.
    - **Each row** is an ordered list item: a drag handle, the ability's icon, its name, a
      short summary of its settings ("From 40 rage · cancel below 20 rage", or "Off"), and
      its switch. The handle, the row's button and the switch are each 44 px. A row that's off,
      or can't apply (no execute phase, a talent the build lacks, a race without a racial), or a
      row without a switch that does nothing (its first setting at None, Never or Neither, a
      summary of "None", or a note in its place: Balance's Filler, "Not used: Wrath for Eclipse
      is on."), is dimmed by colour and its icon turns gray. A row that's on but can't do anything shows why
      in place of the summary, in full: its note ("Not used: needs the Improved Berserker Rage
      talent."), "Not used: needs an execute phase (Fight tab)." without one, or "Not used:
      Bloodthirst is off." when a switch it depends on is off. Neither is ever cut short: a
      long one wraps. A row that stops in the execute phase says so ("On cooldown · not in the
      execute phase"), and a filler that waits for the core abilities says that too ("while
      Bloodthirst and Whirlwind cool down"). A part a choice rules out is left out: a hunter's
      shared shot at Neither reads "Neither", not "Neither · between Auto Shots", and a part
      about a talent shows only with it (Trueshot Aura before the pull). A
      row with a changed setting has a dot after its name, and a screen reader hears "Changed."
      in its description.
    - **Selecting a row** (its icon, name and summary are one button) opens its settings: its
      name and place ("Position 13 of 16"), **Move up** and **Move down**, then its switch and
      its own settings, rendered like the tab's other settings (help, notes, the default and a
      Reset when changed, a dependent setting under its parent). There's no Advanced there: the
      row's settings are already one level down. From 1024 px they sit in a panel beside the
      list, which stays in view as you scroll, and the selected row has a bar in the primary
      colour on its leading edge. Until you select one the panel says to. Selecting a row moves
      focus to the panel's heading, as the sheet's title takes it; **Back to list** above it, or
      Escape anywhere in the panel, returns focus to the row. The panel reaches down to 1rem
      above the window's bottom; settings taller than that scroll inside it, with a fade on
      each edge that has more past it. Its switch is named "Use Battle Shout", so it isn't a
      second switch with the row's name. Below 1024 px they
      open in a bottom sheet, titled with the ability and its place, and closing it returns
      focus to the row. **From 1440 px** (D34) the panel grows with the setup pane: 24 rem from a
      53 rem pane (a 1440 px window's is 55 rem, 54 with a scrollbar) and 28 rem from 64 rem (a
      window of about 1,660 px, 1,680 beside a classic scrollbar), so a threshold's help isn't
      wrapped to three lines beside half-empty rows. There the ability's name
      shows once, in the heading with its place: the switch's line is its help, at the label's size
      and colour, and screen readers still hear "Use Battle Shout".
    - **Moving a row.** Drag its handle, or focus the handle and press Space, move with the Up
      and Down arrow keys, and press Space again (Escape cancels); a screen reader hears where
      it is at each step ("Whirlwind is over position 10 of 16"). Move up and Move down in its
      settings move it one place and say where it went; one that reaches the end disables
      itself and hands focus to the other. The handle's name says its place ("Move Whirlwind,
      position 11").
    - **Pinned rows** (the pre-pull and opener, first) show a lock where the handle would be, have
      no Move up or down, and no row can be dragged past them. The settings of a pinned row say
      "Fixed at position 1 of 16". **D26's duties are movable rows**, like any other
      ([D31](decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24):
      the duty timing keeps its own rule wherever the duty sits): a warrior's Shield Block, Thunder
      Clap and Demoralizing Shout, a bear's Demoralizing Roar and Faerie Fire. Every tank preset
      puts them first on the global cooldown, and their refresh stays the duty rule's wherever you
      move them, since it's the row's own condition; a moved duty makes the list Custom. The rule
      decides when a duty wants the global cooldown, not that it gets it: a row above it takes it
      first. A warrior's Thunder Clap, Demoralizing Shout or Battle Shout below the Sunder Armor
      filler says so, by the rule below. Thunder Clap on cooldown (its "only to keep the slow up"
      off) is tried just above the filler wherever its row is, so it has no note.
    - **Rows below the filler.** A spec's filler takes every global cooldown it can, so a row on
      the global cooldown placed below it (on, with its talent) is cast only when the filler can't
      be. Every spec says so with one rule, in place of the row's summary and on its setting, and
      dims the row, since in practice it's almost never cast: "Below <filler>: cast only when
      <filler> can't be." ("Below Mind Flay: cast only when Mind Flay can't be.";
      `belowRowNote`). It names no reason (mana, rage) and no threshold, so it's true whatever
      stops the filler: Shadow's Mind Flay, Elemental's Lightning Bolt, Balance's Filler (or Wrath
      for Eclipse while it's the higher), the Protection warrior's Sunder Armor filler. A row
      without a switch shows it and is dimmed too, whatever its summary would say instead (Chain
      Lightning below Lightning Bolt). Rows off the global cooldown (the racial, trinkets,
      consumables) are pressed wherever they sit, so they have no note. Shadow's Inner Focus below
      Mind Blast, which goes first the moment it's ready, says the same of Mind Blast. (CLAUDE.md
      step 6's simplification, after the reviews' LA-2, VA-2 and VA-3 found the per-spec wordings
      wrong twice.)
    - **Presets and Custom.** The picker lists the spec's rotations: "Default" for a spec without
      named ones (Fury), or a tank's three (above). A tank's preset sets its Priority choice, which
      moves defaults; picking any preset sets it (Balanced back to its default). Once you move a row or change one
      of the list's settings away from every preset it reads "Custom". Picking a preset sets
      its order and its values for the list's settings and puts the rest of the list's settings
      at their defaults. The spec-wide settings you set stay. **Reset order** (enabled while
      the order isn't the default) puts the rows back in the default order and nothing else,
      and moves focus to the picker (a tank's, at the top: the list's first row).
    - **Rows that share a cooldown.** With both on, the higher one is used whenever it can be, and
      the lower only when the higher can't be paid for; the lower says so in place of its summary,
      dimmed: a Protection paladin's Holy Strike under Hammer of the Righteous, which is off by
      default just above it ("Rarely used: Hammer of the Righteous, above it, takes its place (they
      share a cooldown). It's used when you can't pay Hammer's 90 mana."), or Hammer of the
      Righteous moved below Holy Strike, which costs less and so always takes it ("Not used: Holy
      Strike, above it, takes its place (they share a cooldown). Move it above Holy Strike to use it
      instead."). Hammer of the Righteous says when the main hand can't use it, and what happens
      instead: "Not used: needs a one-handed axe, mace or sword in your main hand, so Holy Strike is
      used.", or with Holy Strike off "… main hand. Turn Holy Strike on to use it instead.", and
      with no main hand, where Holy Strike can't be used either, just "… in your main hand.". With
      no main hand, Holy Strike (on) says so too, with Hammer on or off: "Not used: needs a weapon
      in your main hand." A paladin's two Consecration rows, rank 5 and rank 1, say "Not used"
      under the lower only when it's never cast whatever the gear and talents
      ([paladin.md](classes/paladin.md#the-priority-list-a2)), and name both thresholds and what
      to change: "Not used: Consecration, above it, takes their shared cooldown from 20% mana, and
      this starts from 30%. Set this below 20%, or move it above Consecration." With the higher
      row from 0%, it takes the cooldown "whenever you can pay for it"; then rank 1 is told to
      "Set this lower", and rank 5, which costs more, only to move above rank 1.
    - A row's conditions are its own and move with it. Moving Heroic Strike above Bloodthirst
      lets it queue before Bloodthirst spends the rage, still from its 40 rage; moving
      Hamstring above Bloodthirst changes nothing, since it still waits while Bloodthirst and
      Whirlwind cool down, as its summary says.
  - The intro says what the defaults are, per spec: "tuned for the default setup" once a slice
    has tuned them ([D23](decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23);
    Arms since M2.5a, Fury since M2.5b, the Feral cat since B2), "the
    common priority" for a spec until then. Retribution's, tuned in C2 and searched again only as a
    first pass on 1.60.1.70009 (D27), says so: "The defaults were tuned on an earlier game build and
    had a quick search on this one." The cat's also says there's no powershifting, and why
    ([druid §2.8](classes/druid.md#28-shapeshifting-furor-wolfshead-helm-powershifting-mana)),
    since a Classic Era feral would look for it. A tank's says which of its presets are tuned and
    which aren't yet, in players' words rather than the process's (D27): "Defensive and Max TPS were
    tuned on an earlier game build and had a quick check on this one; Balanced, the default, hasn't
    been fully tuned yet." (the warrior, whose presets had a first-pass check on 1.60.1.70009);
    "Defensive is tuned for the default setup; Balanced, the default, and Max TPS haven't been fully
    tuned yet." (the bear); "Defensive and Max TPS were tuned on an earlier game build and had a
    quick search on this one; Balanced, the default, plays as Defensive." (the paladin, whose list,
    talents and thresholds had a first-pass search on 1.60.1.70009, the paladin review's PR-6).
  - The settings sit under headings, the way the Buffs tab groups its switches: **Before the
    pull**, **Cooldowns and buffs**, **Core abilities**, **Fillers**, **Execute phase** and
    **Consumables**, in that order. Under each heading the settings keep the spec's priority
    order (warrior.md §5.2–§5.4). The spec gives each setting its heading
    (`RotationOption.group`). The few settings that shape the rest (Arms' stance, a tank's
    priority, a Destruction or Affliction warlock's Demonic Sacrifice, Enhancement's weapon imbue)
    have no heading and come first. A heading holds at least two settings, and a
    fixed row (`rotationFixed`, below) counts as one, since it shows under the heading: each
    hunter's **Core abilities** holds Auto Shot and Pet, both fixed, and the pet's Claw threshold. A spec
    with only one for a phase files it under another heading, its help naming the phase
    (Protection's Execute, under Core abilities; the bear's "Enrage before the pull", under
    Cooldowns and buffs).
  - **A tank's priority** ([D26](decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)):
    before the priority list, a choice at the top, **Tank duties first** (the default) or **Max
    TPS**. On the priority list (D28, D31; all three tanks since A2) it's the preset picker at the
    top instead ("A tank's presets", above): **Defensive** (Tank duties first, renamed),
    **Balanced** (the default) and **Max TPS**, whose help in the picker's info says the same things
    with each one's measured numbers. Its help names the
    duties Max TPS drops (Shield Block, Thunder Clap and Demoralizing Shout for a warrior; Devotion
    Aura, for Retribution Aura, for a paladin; the roar for a bear, which keeps Faerie Fire because
    its armor makes the bear's threat), why the default keeps them (you take less damage), what Max
    TPS gains and costs in the default setup, when to pick it, and that the Buffs tab's versions
    (Thunder Clap and Demoralizing Shout; Devotion Aura; the roar) stay off unless you turn them on
    there for another player's (Buffs, above). Choosing it moves only
    defaults, like Arms' stance below: the dropped switches show off and unmarked, each one's
    help says "Off by default with Max TPS", and a value you set yourself stays set.
  - A setting that depends on another under the same heading sits under it, indented on a
    rule (Heroic Strike's rage threshold under Heroic Strike, "Save the last Death Wish for
    the end" under Death Wish). A dependent switch works the same way as a dependent number
    (`RotationOption.dependsOn`, on any kind of setting). One whose parent is under another
    heading stays with its own heading, and its help names the parent ("Needs Battle Shout
    on"). A number setting can need a second switch under another heading as well
    (`alsoDependsOn`: "Recklessness before the execute phase" and "Mighty Rage Potion up to" need
    Execute); it's dimmed while either is off, and its help names the second.
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
    with Bloodthrill; Berserker Stance turns Whirlwind on and Rend and Overpower off; Protection's
    Max TPS turns three switches off and moves Heroic Strike's threshold). The tab
    shows the value the sim will use, the help says what it follows, and a value you set stays
    set until you reset it.
  - **Changed settings are marked.** A setting that differs from its default for this setup
    gets a line under its help: a dot, its default ("Default: 40 rage", "Default: on") and a
    **Reset** for that row alone, which moves focus back to the row's control. A value you set
    that equals the default isn't marked. Screen readers hear the setting's help, then
    "Changed. Default: …", as its switch's or input's description, and the Reset is named
    "Reset {setting}, default {value}" ("Reset Slam, default off").
  - A small text link (a row's Reset, the "Buffs" link below) has a 44 px hit area around its
    line, lopsided so it never covers the control above: 10 px above the line and 18 px below
    (`LINK_HIT_AREA` in `src/features/changed-hint.tsx`). Whatever holds one leaves that much
    room around it, so a row with a Reset is a little taller.
  - A setting that depends on a switch is dimmed while that switch is off, or can't apply
    itself (a potion's threshold while the potion isn't selected in Buffs), down the tree. A switch
    that needs an execute phase (Execute, Hammer of Wrath, `needsExecutePhase`) can't apply while
    the Fight tab's execute phase is 0%, so it's dimmed then too, with every setting that needs it,
    and its help says it needs an execute phase under Fight. One that needs a creature type
    (Exorcism, `needsCreatureType`: Undead or Demon) is dimmed with its settings against anything
    else, with "Not used: set Creature type to Undead or Demon in **Fight**": the link opens
    Fight's Advanced with focus on the creature type. A dependent choice's selected option takes
    the same neutral gray while it can't apply. A dimmed setting is dimmed by colour, never
    opacity: its label and inputs take the muted text colour, which is AA, and a switch that's on
    shows a neutral gray track rather than the primary colour. It stays usable.
  - A setting the rest of the setup leaves unused is dimmed, with a note under it saying why, in
    the consumables' words: the racial cooldown for a race without one the sim uses ("Not used:
    Tauren has no racial cooldown that adds damage."; every Gnome class has its Eureka!), a cat's Rake or Rip or a bear's Lacerate while its "only when nothing else bleeds"
    meets a raid whose warriors keep the boss bleeding ("Not used in this raid: its warriors keep
    the boss bleeding. Turn off … to use it anyway."), and a bear's Demoralizing Roar while a
    Demoralizing Shout in Buffs takes its place ("Not used: the Demoralizing Shout in Buffs is on
    the boss instead, so you don't cast the roar."). Its switch stays usable, since it takes effect
    once the setup lets it, and the settings under it aren't dimmed with it: one may be the way to
    use it.
  - Numbers carry their unit in the field and in the hint: "60% mana" for a share of maximum
    mana, "1,500 mana" (thousands grouped) for mana missing. The field is as wide as its unit
    needs, and at least as wide as one without a unit; a grouped value's box has room for its
    comma, so "1,500" never runs under its edge.
  - A consumable's row needs its Buffs switch. While that's off, its own switch shows off and
    locked, whatever it's set to, and the row says so ("Not used: turn on … in Buffs first"),
    with **Buffs** a link to that tab (a 44 px hit area, like a row's Reset). The link opens
    Buffs with focus on that consumable's switch, so Space turns it on. Turning it on in Buffs
    brings back its setting.
  - A switch that needs a talent or a shield works the same way (`RotationOption.requires`:
    Protection's Shield Block needs a shield, Shield Slam the Shield Slam talent and a shield; a
    Protection paladin's Holy Shield its talent and a shield, Swift Judgement its talent).
    Without it the switch shows off and locked, and the row says what's missing, with a link to
    where it's fixed: "Not used: needs the Shield Slam talent (Talents) and a shield (Gear)." The
    Gear link opens Gear with focus on the off hand (the main hand while a two-hander locks it),
    the Talents link on the talent trees. The settings that need it are dimmed with it, including
    one under another switch that needs it too (`alsoDependsOn` on a switch: "Sunder Armor filler
    waits for Shield Slam" while Shield Slam is off or can't be used).
  - Something the spec always does, with nothing to choose, is a row with no control, first under
    its heading: its name, one line of help, and what it is where the switch would be (a hunter's
    "Auto Shot", "Always on"; `SpecDefinition.rotationFixed`). A fixed row that a pinned list row
    already names isn't repeated above the list: a Protection paladin's Righteous Fury is in its
    **Before the pull** row.
  - A threshold's unit says what it's a share of: "% mana" for a paladin's mana thresholds.
- **Fight.**
  - The header names the boss's level ("A level 63 raid boss"), following Boss level.
  - Duration (default 180 s), boss armor preset, execute phase, and whether you attack from the
    front (tanks) or behind (DPS). The position's help follows the chosen side: in front, a DPS
    spec reads that the boss can parry and block its attacks, and a cat that Claw builds instead
    of Shred.
  - The execute phase shows only for a class with an execute ability (Execute, Hammer of Wrath).
    A druid's rotations don't read it, so its Fight tab leaves out both the switch and, in
    Advanced, where the phase starts: a control that changes nothing isn't shown. A setup keeps
    the value, unused.
  - The duration slider's track and thumb are 44 px targets. Its thumb is named "Fight length"
    and says its value in words ("3 minutes"). The execute phase's help names the class's
    execute ability (Execute for warriors, Hammer of Wrath for paladins), and its whole row is
    the switch's label.
  - **Changed settings are marked,** as on the Rotation tab: each one that differs from the
    spec's default gets a line under it with its default ("Default: 3:00", "Default: 63") and a
    **Reset** that moves focus back to its control; a screen reader hears "Changed. Default: …"
    as the control's description. Advanced opens by itself while a setting in it differs from
    its default, and its button counts them ("Advanced, 2 changed").
  - No number of targets yet: the sim has one target, so the control waits for multi-target
    support ([warrior §5.5](classes/warrior.md#55-multi-target-options-light)). A control that
    changes nothing isn't shown. Saved setups keep the value (`extraTargets`), unused.
  - **Wide layout** ([D34](decisions.md#d34-a-power-user-desktop-layout-at-wide-widths-2026-09-25)):
    from a setup pane of 53 rem (a 1,440 px window: 55 rem, or 54 beside a scrollbar that takes room),
    two columns: the length, boss armor, position and execute phase on the left, and Advanced on the
    right, still a disclosure (principle 2), so opening it pushes nothing down. Narrower, Advanced
    comes under them, as at every width under 1440 px.
  - Advanced: precision and seed, then the fight's details. Every field is labelled, the
    Creature type and Zone menus included, and its accessible name contains its visible label
    ("Execute phase starts at", "Damage you take"; WCAG 2.5.3). A stepper's buttons name their
    field ("Decrease Boss level"). A stepper that reaches its limit disables itself, so, if it
    held focus, it hands focus to the other stepper, the way back. Never to the text field,
    which on a phone would open the on-screen keyboard.
  - **Damage you take** (DPS specs; 0 by default) says what the number is and what it does:
    "What the boss deals you per second, before your armor. Each hit gives rage and can trigger
    Enrage. At 0 you're never hit." It's before armor because Forever's rage from a hit reads the
    hit before mitigation ([rage.md](mechanics/rage.md#forever-)). A class with nothing that
    reacts to being hit has no such field: a cat gains no rage in Cat Form, and none of its
    talents, items or buffs fires on a hit, so its Fight tab leaves the field out, as it does the
    execute phase. A Retribution paladin has no rage either, and no talent, item or buff that
    fires on a hit, so its Fight tab leaves the field out too. A setup keeps the value, unused.
  - The creature type's help says what it decides: "Some racials and items only work against
    certain types.", and for Retribution "Exorcism can only be cast on Undead and Demons."
  - Precision is Adaptive or Fixed. **Fixed** shows its own field under it, "Number of fights",
    with its own help and default. Counts are written with thousands separators, in a field as
    in its "Default: 3,000" (boss armor, damage per swing); a seed is an identifier and has none.
    While you edit a field it shows the plain number ("3000"), with the selection or caret kept,
    so an edit never meets its separators; they come back when you leave it. A click or tap
    puts the caret where it lands in the number you see, "5|,000" giving "5|000": the field
    swaps once the browser has placed it, not before.
    A number field reads what's typed in the typist's own style (`src/lib/parse-number.ts`):
    "5.000" and "5 000" are 5,000, and "1,5" is 1.5, as a comma-decimal phone's keypad types it.
    Only a sign, digits and separators count: "1e3", "0x10" and "Infinity" aren't numbers, so the
    field goes back to its value.
    It then snaps the value to its step, with no float noise (1.4, never 1.4000000000000001).

## Results

- **Headline:** DPS with its ± 95% CI. After a re-run, show the change from the previous result
  (▲/▼ with color *and* sign). A screen reader hears it in words, with whether it's better, since
  the color says that on screen: "up 12.3 from the last run, better" (`Delta` in
  `src/features/results/delta.tsx`). Under it, one line says what was run: "2,750 fights of 180 s ·
  Forever rules · ran in 0.1 s". The length is the one set in Fight, not the average of the
  varied fights; the run time is labelled. The Simulate button names its shortcut, Ctrl+Enter or
  ⌘+Enter, in `aria-keyshortcuts` and in its tooltip ("Simulate (Ctrl+Enter or ⌘+Enter)", or "Run
  again (…)" after a run).
- **On desktop the panel never runs past the viewport.** The headline card with Simulate stays
  put, and everything under it scrolls inside the panel, with a fade and a chevron at an edge
  that has more. While it overflows, that area takes keyboard focus so arrow keys scroll it. On a
  phone the results sheet scrolls as a whole.
- **The wide layout** ([D34](decisions.md#d34-a-power-user-desktop-layout-at-wide-widths-2026-09-25)),
  by container queries on the `results` pane ([Layout](#layout)), so nothing changes under 1440 px:
  - **From 1440 px** (a 30 rem pane) **Cooldowns and buffs** and the **Character sheet** are open
    by default. A reader who closes one keeps it closed, and one reopened stays open: each browser
    remembers them (`forever-sim:results-closed` in `localStorage`, a list of the closed ones; a
    value it can't read counts as none closed). **Assumptions** stays collapsed: it's long and read
    rarely. The wider pane keeps each breakdown row's first outcome line on one line.
  - **From 1920 px** (a pane of 40 rem or more) the headline card is a **strip**: the values with
    their ± and change, then the run's summary, then Simulate, on one row, with any message
    (ready, setup changed, no damage, an error) under them across the card. A tank's TPS and DPS
    sit side by side in it as usual.
  - The details sit in **two columns**: on the left what the result is made of (Damage taken, the
    breakdown, How the boss's swings landed, Mana per fight), on the right what explains it
    (Cooldowns and buffs, and the Character sheet with the Boss's attack table). With nothing on
    the left (no weapon, so no breakdown), the right takes both. **Assumptions** spans both
    columns under them, collapsed. In two columns at 1920 a long outcome line may wrap again, as
    in the 22 rem panel; at 2560 each fits one line.
  - The DOM keeps the order this section gives, so a screen reader hears the same sequence at
    every width: the columns are wrappers that are `display: contents` below 1920.
  - The pane still never runs past the viewport, and scrolls inside with its fades.
- **A result with no damage** says why and what to do next: with no main-hand weapon, "Add a
  weapon in Gear", with a button that opens the tab (and closes the sheet on a phone). The
  button is left out beside the desktop panel when that tab is already open.
  - **Tank specs** headline TPS and DPS as equals
    ([D18](decisions.md#d18-tank-specs-report-tps-and-dps-as-equals-2026-09-22)): side by side
    in the results panel, TPS first, each with its own ± CI and its own change from the
    previous run. The phone's bottom bar stacks them in two rows next to the Details and Simulate
    buttons, showing only the values and the changes' arrows; the results sheet shows the ±
    values and the amounts. A DPS spec's bar does the same.
- **Damage taken** (tank specs, [encounter §5](mechanics/encounter.md#5-boss-melee-tank-modeling)):
  the first section under the headline card, above the breakdown, since it has no headline of
  its own (`src/features/results/tank-results.tsx`). It stays short, so the breakdown is still near
  the top. It shows for a tank whatever the result, "No main-hand weapon" included, since the boss
  hits you either way.
  - Its heading is "Damage taken per second", and under it the value with its ± 95% CI and its
    change from the previous run, as in the headline but smaller. Less is better here, so a drop
    is green (▼ −12.3) and a rise red (▲ +12.3); the arrow and sign still say which way it went,
    and a screen reader hears "down 12.3 from the last run, better".
  - A line says what it counts and what drove it: "The health the boss's melee swings cost you,
    after avoidance, armor, block and other reductions. It swung 80.5 times a fight on average,
    set to 4,500 to 5,500 a swing before armor (Fight → Advanced). Debuffs on it, such as
    Demoralizing Shout and Thunder Clap, lower its damage and slow its swings, whether yours
    (Rotation) or the raid's (Buffs)." For another tank, whose rotation never uses a warrior
    tank's debuffs, its last sentence reads "Debuffs on it, such as a warrior tank's Demoralizing
    Shout and Thunder Clap (Buffs), lower its damage and slow its swings." A tank whose own
    attack-power debuff is another gives that one as its example: the bear's reads "Debuffs on it,
    such as your Demoralizing Roar (Rotation) and a warrior tank's Thunder Clap (Buffs), lower its
    damage and slow its swings." The swings
    include parry-hastened ones; a fixed swing size reads "5,000". Its "(Fight → Advanced)", and
    the crushing line's, have non-breaking spaces around the arrow, so they never split at 390 px.
- **Breakdown:** a per-ability damage share bar, then a line of its outcomes: "31.2 casts a
  fight · 24.1% crit · 3.0% avoided · 1,204 avg hit". White swings are "Main hand" and "Off
  hand"; a druid's, in a form with its own weapon, are "Auto attack".
  - **The count comes first,** a fight, named for what it counts (`AbilityResult.unit`, from
    `rowUnit` in `src/sim/run/aggregate.ts`): **swings** for white swings (Main hand, Off hand, a
    form's or a pet's Auto attack), **shots** for Auto Shot, **procs** for what an item, talent,
    weapon or seal fires (Hand of Justice, Windfury, Seal of Command, Thorns, Deep Wounds, Deadly
    Poison, Ignite), **applications** for a bleed or DoT the rotation puts on the boss (Rend,
    Corruption, "Rake (bleed)", "Fireball (DoT)"), **ticks** for a periodic effect whose casts
    nothing counts, **uses** for a consumable (a potion, a rune, a bomb), and **casts** for the rest: a channel you press
    (Mind Flay, Arcane Missiles), whatever its ticks do, and a rage cast a tank's Threat view shows
    (Bloodrage, Enrage) included. Swings, shots, casts and procs count attempts, misses included.
    An extra-attacks proc counts the times it fired, so Windfury Weapon's and Ironfoe's two swings
    are one proc; its crit and avoided shares are over the swings. A fire whose swing becomes a
    queued Heroic Strike or Maul still counts, but that swing's damage lands on the Heroic
    Strike's or Maul's row. A row with a count of its own (Holy Shield's blocks, Reckoning's extra attacks) shows that one instead, and a talent's row
    of mana or rage (Shield Specialization, Blood Frenzy) shows none: one count a row.
  - **The average ends the line,** on the Damage metric only: the row's damage over its landed
    hits (hits, crits, glances and blocks; misses left out), "1,204 avg hit", or "412 avg tick"
    for a bleed's, a DoT's or a periodic effect's row. A cast whose every cast lands several times
    on its own row counts its casts, but its average and shares are per landing, named for what
    lands: "21.3 casts a fight · 9.1% tick crit · 11.0% of ticks avoided · 95 avg tick"
    (Consecration's ticks), "missile crit · of missiles avoided · 430 avg missile" (Arcane
    Missiles). A row with no damage or no landed hits has
    none. A screen reader hears it in words: "1,204 damage a hit on average". Each part stays
    whole, so the line wraps only between parts; at 390 px a DoT's or bleed's line may take three
    or four lines, its uptime included.
  - A **bleed's** row counts its applications and its ticks apart, so its outcomes read
    "9.0 applications a fight · 32.2% tick crit · 1.1% avoided · 40 avg tick", the avoided share
    being of what the count counts (its applications, a proc's procs, a channel's casts),
    with its uptime on the boss on a second
    line (Rend, a cat's Rip; Rake's bleed has a row of its own, "Rake (bleed)", right after its
    hit's row, whatever their damage). The tick crit shows only where ticks can crit (the Forever profile), and the
    avoidance only for an application that rolls (Rend, Corruption, Serpent Sting, Deadly
    Poison's procs, Mind Flay's casts). A bleed that does neither, such as Deep Wounds (a crit
    applies it, and its ticks can't crit), shows only its count and its average tick. A bleed
    that stacks adds its average stacks to the uptime line ("89.4% uptime on the boss, 4.6
    stacks on average": the bear's "Lacerate (bleed)"), and its marker stays out of Cooldowns
    and buffs.
  - A **spell on the boss** that deals no damage, so can't crit (the bear's Faerie Fire and
    Demoralizing Roar, a warrior's Demoralizing Shout), shows only the share of its casts that
    missed ("20.1 casts a fight · 16.4% missed"), resists included.
  - A **pet's rows** name it after the ability, in the muted color: "Auto attack · Succubus",
    "Firebolt · Imp" ([ranged-and-pets §10](mechanics/ranged-and-pets.md#10-pet-damage-in-the-results)).
  - Casts that deal no damage (Death Wish, Recklessness, Bloodrage, racials, the potion) stay
    out of the breakdown's Damage view. They're under **Cooldowns and buffs**. On a tank's Threat
    view, one whose rage or mana makes threat has a row: "3.5 casts a fight" (Bloodrage), "1.5
    uses a fight · from 2,628 mana a fight" (a paladin's Major Mana Potion).
  - A row that can neither crit nor be avoided (Holy Shield's damage, Retribution Aura's) shows
    no crit or avoided shares. A row that counts something of its own shows it a fight, in place
    of its unit's count: "35.6 blocks a fight" (Holy Shield's damage), "14.8 extra attacks a
    fight" (Reckoning). A row whose threat
    is the mana it gave you says how much: "from 4,397 mana a fight" (Improved Seal of Fury,
    Shield Specialization).
  - **Tank specs** get a **Threat / Damage** switch above it. Threat is the default, and the
    choice is remembered for the browser session. The heading, the order, the share bars and
    the per-second values follow the chosen metric. Abilities that add nothing to it are left
    out: a talent that only gives rage makes threat but no damage.
- **How the boss's swings landed** (tank specs): the section after the breakdown. The seven
  outcomes of its one roll (miss, dodge, parry, block, crit, crushing, normal hit;
  [combat-tables §8](mechanics/combat-tables.md#8-boss--player-tanks)) as shares of its swings in
  the fights run, each with a share bar like the breakdown's. They sit in two columns filled
  downwards, so what spares you (miss, dodge, parry, block) is on the left and what lands in full
  (crit, crushing, normal hit) on the right, and a screen reader hears them in the roll's order.
  Its heading names the list, so the list has no name of its own to read twice.
- **Mana per fight** (paladins): the section after the breakdown, a ledger of the average fight,
  one row per line with the numbers right-aligned: "At the pull 3,392", "Regenerated +2,364",
  one line for each thing that restored mana ("Sanctified Judgement +…", "Major Mana Potion +…",
  "Demonic Rune +…", each only when it restored some), "Spent −…", then, under a rule, "Left at
  the end" (never below 0). A line under it says what "Regenerated" counts: "Spirit and mana per
  5 s." It's what Consecration's and Exorcism's mana thresholds and the potion lines are weighed
  against; the potion's and rune's casts per fight are under Cooldowns and buffs.
- **Cooldowns and buffs:** a collapsed section, like the character sheet (open by default from
  1440 px, above). It's a table with
  one row per cast the rotation can press (Battle Shout if you keep it up, Death Wish,
  Recklessness, Bloodrage, racials, on-use trinkets, consumables), in the rotation's order, and
  then one per other buff on you (Holy Strength, Flurry, Enrage, the Overpower window) and per
  debuff you keep on the boss (a Protection warrior's Sunder Armor, Thunder Clap and Demoralizing
  Shout). A debuff's casts are the casts of the attack that puts it there, misses included. Each row
  has an icon, the name, the **uptime** (the share of fight time the buff was up) and the
  **casts per fight** (pre-pull casts included), all in tabular numbers. The casts column's
  visible header is just "Casts" (its full name is for screen readers), and a caption above the
  table says what both columns count, so names like "Holy Strength (main hand)" keep one line
  at 390 px. A dash, read out as "none", marks a value that doesn't apply: a cast with no buff
  (Bloodrage) has no uptime, nor one whose buff the next ability uses at once (Swift Judgement's
  free Judgement), and a proc buff has no casts. A weapon proc on both hands names its
  hand: "Holy Strength (main hand)". A buff that only triggers when you're hit (Enrage) shows a
  dash, not 0.0%, when a DPS run took no damage, with "Needs damage taken (Fight → Advanced)"
  under its name; the Fight tab's "Damage you take" help names Enrage too, and stays 0 by
  default. A proc the next ability spends (a cat's or a bear's Clearcasting) is up only until
  then, so its uptime is tiny: the line under its name says how often it came, "6.3 a fight, each
  spent by the next ability it makes free" (a Balance druid's waits for a Starfire, Moonfire or
  Insect Swarm, and a Wrath leaves it up). Without an ability that can spend it (a bear whose rotation keeps
  only Faerie Fire), it's up until it runs out, and that line is left out. A cast before the pull whose buff is gone by the pull (Seal of the Crusader,
  judged at the pull) shows a dash for its uptime, with "Before the pull, for its judgement" under
  its name.
- **Character sheet:** the final AP, crit, hit, haste, weapon skill and armor, the way the
  sim computed them.
  - A paladin's add its spell stats, in two columns of counterparts, row by row: Attack power |
    Spell damage (its Holy spell damage, since every paladin spell is Holy, Champion of the
    Light's share of Intellect included), Crit | Spell crit, Hit | Spell hit, Weapon skill |
    Expertise, Strength | Agility, Stamina | Intellect, Health | Mana, Spirit | Mana per 5 s, then
    Haste | Armor. Each label fits on one line at 390 px.
  - A caster's (a spec the caster core marks, [spells §12](mechanics/spells.md#12-what-a-class-slice-uses);
    the mage's since K2) are its spell stats first: Spell damage (all schools), then each school
    whose own lines add to it ("Shadow damage"); Spell crit, then each school whose talents add to
    it ("Fire crit" with Critical Mass); Spell hit, then each school the same way ("Fire hit",
    "Frost hit" with Elemental Precision); Casting speed, Spell penetration when it has any,
    Intellect, Spirit, Mana, Mana per 5 s, Stamina, Health, then Armor. A spell's own crit
    (Incineration on Scorch and Fire Blast) and a buff's in the fight (Combustion) aren't in them.
    Its footnotes name no melee value its spells don't read: no base attack power left out, no
    base melee crit placeholder. The caster slices check them at 390 px as they ship.
  - Defense, dodge, parry, block and block value join them for a tank, and for anyone with
    defense above 300 or block value; a class that can't parry or block (a druid) leaves those
    rows out. A tank's sheet adds **Crit reduction (boss's crits)** after
    Defense, on a row of its own, since your own Crit is a few rows above: how much defense lowers
    the boss's crit chance, 0.04% a point above 300 ("5.6%" at 440, where a raid boss can't crit
    you; a minus sign below 300, where it raises it;
    [character-stats](mechanics/character-stats.md#defense-skill)).
  - **Boss's attack table** (tanks): its chances on each swing at you as the fight starts, from
    the stats above, in the same two columns as the swings that landed. Its last row is "Normal
    hit", apart from the sheet's Hit, your own chance to hit. The line under its heading explains
    why its numbers aren't the sheet's: "Its 315 weapon skill takes 0.6 points off your dodge,
    parry and block." (0.04 a point of the boss's skill above 300, naming only the avoidance you
    have: a bear's reads "your dodge"; none for a level 60 boss), and "The swings that landed can
    differ, by chance and as cooldowns and procs change your stats in the fight." A tank whose
    rotation keeps a block buff up most of the fight (a Protection paladin's Holy Shield) sees the
    table with it up, as it is most of the time, and the line says so with the buff's uptime:
    "Its chances on each swing at you with Holy Shield up, from the stats above and its 20.0% more
    block. Your rotation kept it up 95.9% of the fight." The crushing line reads that table.
  - A line under the table says whether the boss can crush you. With crushing blows on the
    table, how many more points of avoidance would push them off, which is the crushing and hit
    slices together, since crushing blows come before hits: "Another 55.4 points of miss, dodge,
    parry or block would push crushing blows off the table." It names miss and the avoidance you
    have, and never says "0.0". With none left, "You're uncrushable: there's no room left on its
    table for crushing blows." A boss that can't crush says why instead, before anything else:
    "Crushing blows are off for this fight (Fight → Advanced)." or "A level 62 boss can't land
    crushing blows.", even for a tank with no room left for hits (`crushingState` in
    `src/features/results/tank-logic.ts`).
  - Lines at the end name the base values that aren't known yet, in two kinds: those left out
    of the numbers ("Not known for Forever yet, so left out: base attributes."), and the
    Classic-based placeholders in them until they're measured
    ([D24](decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23): "Classic-based
    values until they're measured: base health, base parry, base block."). Base dodge, parry and
    block are a tank's only, named only when the sheet shows those rows. The assumptions give
    each one's value.
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
- **Type:** Geist, one scale. Use tabular numbers for every stat and result. The brand's
  lettering alone takes the guild's Josefin Sans ([Brand](#brand)).
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
- **Controls** meet 3:1 against what's behind them (WCAG 1.4.11), in both themes. Text fields,
  selects, segmented choices and outline buttons draw their edge with `--input`: a mid gray in
  light mode (3.6:1 on the page and cards, 3.3:1 on muted rows) and white at 38% in dark mode
  (3.5:1 and 3.4:1), whose fields fill with 30% of it. An outline button takes it whatever its
  slot, so one that opens a menu ("Gear options") does too. So does an outline badge that's the
  face of a button (the gear flags, which open a popover); a badge that only labels keeps the
  fainter edge. An unchecked switch's track uses its own token, `--switch-off`, rather than the
  input border color. Cards and dividers keep the fainter `--border`: they separate content and
  aren't controls.
- **The destructive button** (Delete, once a save's row asks) is red text on a tint of it. Inside
  it the red is darker in light mode (red-800) and lighter in dark mode (red-300) than the theme's,
  so its text is AA at rest and on hover: 6.9:1 and 5.7:1 in light, 6.2:1 and 4.8:1 in dark. Its
  focus ring is the app's.
- **The focus ring** meets 3:1 too. The shadcn components draw it at half strength
  (`ring-ring/50`), so the `--ring` token is near-black in light mode and light gray in dark
  mode, which puts the composited ring at about 3.7:1 or more on the page, on cards and
  dialogs, and on muted rows in both themes.
- **Stale results** (and a kept result during a re-run) are dimmed by color, not opacity: their
  text turns to the muted text color, and bars and icons fade to gray (`data-dimmed` in
  `src/features/results/results-panel.tsx`). Muted text at 60% opacity would fall to about
  2.3:1, below AA. The "Setup changed" badge sits outside the dimmed parts, so it's never
  dimmed.
- **Game icons:** WoW icons by icon name from Wowhead's CDN, lazy-loaded at a fixed size with
  a neutral placeholder on error. Nothing depends on them loading.
- **Motion:** short and purposeful (sheets, disclosure). Respect `prefers-reduced-motion`.

## Brand

Forever Sim is made by **Decades**, a gaming community since 2005, whose site is
[decades.gg](https://decades.gg). The branding is light: it signs the app, and never competes with
the sim (principle 1).

- **Where it appears,** and nowhere else:
  - **The header's lockup:** the crest, "Forever Sim" and "Decades" under it, in the guild's
    lettering (Josefin Sans, uppercase, spaced, 12 px) in the muted text colour, not gold, so it
    never reads as a class colour beside the spec switcher. The whole lockup is one link, 44 px
    tall, that shows the focus ring as a ghost button does, and lights up on hover as one does too,
    "Decades" taking the text colour (`Lockup` in `src/app/header.tsx`). The hover is only where a
    pointer can hover, so a tap on a phone leaves no highlight. "Forever Sim" comes before the link
    in the DOM, so a screen reader hears the page's name and then the link; the crest still shows
    first. On a phone it's the crest alone, 44 px square, before the spec switcher.
  - **The header's bottom edge,** a gold hairline.
  - **About's last section, "Made by Decades":** under a gold hairline, its heading in the guild's
    lettering in gold, the guild's full logo, one line of the guild's own positioning ("a gaming
    community since 2005. Community first: we invest in our players."), and **Visit decades.gg**.
  - **The footer's credit,** "An app by" and the Decades mark, beside wago.tools' credit and
    paired with it: the same muted 12 px lead-in, then a 44 px link holding a 24 px mark, as tall
    as wago.tools' logo (`DecadesCredit` in `src/app/decades-credit.tsx`). The guild's full logo
    stacks its wordmark under the crest and can't be read at 24 px, so the mark is the crest with
    "Decades" beside it in the guild's lettering (14 px, the text colour), as the header has it.
  - **The dark theme's surfaces** lean toward the guild's ink navy (hue 285, a little chroma) at the
    stock lightness, so every contrast measured on them holds (within 0.03:1).
  - Not the favicon: the sim keeps its own mark there, since the crest's detail is lost at 16 px.
- **Links** to the guild's site open in a new tab, with `rel="noopener"`, and say so to screen
  readers ("opens in a new tab"). The header's is named "Decades: decades.gg, opens in a new tab",
  which holds its visible word (WCAG 2.5.3), and its tooltip repeats that name for sighted users
  with a mouse (the same text, so screen readers don't hear it twice). The footer's is named
  "Decades (opens in a new tab)"; its uppercase lettering is hidden from screen readers, so they
  don't spell it out. Both footer credits, wago.tools' and the guild's, open in a new tab, so a
  result on screen isn't lost.
- **Assets:** the crest is the guild's own path data, unchanged (`src/components/decades-crest.tsx`):
  its blades take the text colour and its hourglass `--brand-gold`, so one drawing serves both
  themes. The full logo is two files in `public/brand/`: the guild's own, white and gold, for dark
  surfaces, and the same drawing in ink (#070710) and the light theme's gold for light ones. Only
  the one for the theme shows.
- **Colour tokens** (`src/index.css`). Gold is for the brand's marks alone: never a control, a
  value or body text.

  | Token | Light | Dark | Use and limit |
  | --- | --- | --- | --- |
  | `--brand-gold` | `oklch(0.62 0.1 85)` (#a28137): 3.7:1 on the page, 3.4:1 on muted rows | #c4a75e: 8.5:1 on the page, 7.7:1 on cards | The crest's hourglass: a graphic, 3:1. The hairlines draw it at 40–50%: dividers, which need no contrast, like `--border`. |
  | `--brand-gold-text` | `oklch(0.53 0.09 80)` (#876527): 5.3:1 on the page and sheets, 4.9:1 on muted rows | #c4a75e: 8.5:1 and 7.7:1 | Brand lettering, AA 4.5:1. |

  The guild's own gold, #c4a75e, is 2.3:1 on white, so light surfaces never take it, as text or as
  a graphic. The lockup's "Decades" is muted text (4.7:1 light, 7.7:1 dark), and on hover the text
  colour on the hover fill (18:1 light, 17:1 dark). The footer's lead-in is muted text too (4.7:1,
  7.7:1) and its "Decades" the text colour (20:1, 19:1).
- **What the brand may say** follows the guild's own rules (its site's content guide): the game is
  World of Warcraft: Forever, never renamed. About's first mention of it gives the full name (its
  description line, which the page's meta description shares); after that, "WoW Forever" is the
  accepted short form, in the app and the docs alike. Neither the app nor the guild claims any
  Blizzard affiliation, so About says neither is affiliated with or endorsed by Blizzard Entertainment; and
  nothing states the guild's raid nights, raid sizes or rules, or any guild fact beyond its
  founding in 2005 and its positioning.

## States

Every view handles these states:
- **Default:** the first visit, with defaults applied.
- **Empty:** an empty gear slot, no talents spent, no results yet.
- **Long content:** long item names, many buffs, a narrow width.
- **Running:** progress, a cancel button, and the previous result still visible.
  - The results panel and sheet show "Simulating… 45%" and a progress bar above the kept
    result, which is dimmed. The phone's bottom bar keeps the dimmed value with a small "45%"
    beside its label and a thin progress line along its top edge.
  - A run for the current setup is about to replace a stale result, so the "Setup changed"
    badge waits: it isn't shown beside "Simulating…". A change made during the run isn't in
    it, so the badge comes back.
  - A polite live region, mounted once at every width, says "Simulating…" when a run starts
    and then "Done: 682.5 DPS" or "Simulation cancelled."
  - Switching spec cancels a run in progress, as Cancel does, however the spec changed (the
    switcher, a shared link, a saved setup): there's never a run going on out of sight, so no
    progress or number from one spec's run shows, or is announced, under another. The live region
    says "Simulation cancelled." The spec switched to shows its own last result, or is ready to
    simulate, in the panel, the sheet and the phone's bar alike, and switching back shows the
    cancelled spec as Cancel would have left it: its last completed result, or ready to simulate.
- **Stale:** the setup changed after the last run, so results are dimmed with a "Re-run" hint.
  - The whole result dims, the breakdown and details included, not just the headline. Dimmed
    text turns to the muted text color, which still meets AA; bars and icons fade to gray. The
    "Setup changed" badge beside the headline isn't dimmed.
  - A result for another spec is set aside rather than shown: after switching from Fury to
    Arms the panel is empty, ready to simulate Arms, and switching back to Fury brings Fury's
    result back, even after you've run Arms: each spec keeps its latest result, and its ▲/▼
    change, for as long as the page is open. A number under the Arms header that belongs to Fury is too easy to misread,
    especially in the phone bar, which has no room for a label; the ▲/▼ change never compares
    specs anyway.
- **Error:** the worker failed or a shared link is invalid. Show a plain message and a way
  forward (retry, or reset to defaults).
  - A setup the engine refuses (a Skyborne warrior or hunter) is titled "This setup can't be simulated",
    and its message says what to change, so no retry advice follows it. Any other failure is
    titled "The simulation failed" and suggests trying again, then resetting the spec, except a
    run that stopped answering for a minute: "The simulation stopped responding for a minute, so
    it was stopped. Run it again." says all there is to say, since no setup causes a hang. Nor does
    a run whose workers couldn't start (most likely the site updated since the page loaded): "The
    simulation couldn't start. Reload the page, then run it again." A "Reload page" button (44 px)
    under it does that, in the panel and the phone's sheet; the phone's bar says "Failed" as for
    any failure. A run whose worker stopped after it had started says "The simulation stopped
    unexpectedly.", with the retry advice. The next Simulate replaces any worker that failed. If
    the workers fail to start in two runs in a row, later runs go on the page itself instead,
    slower but with a result, until a reload.
  - On a phone the bottom bar shows the failure itself: a warning icon, "Failed" and the
    start of the reason, in AA colors. "Show results and details" stays enabled, with or without an
    earlier result, and opens the sheet with the full message. The live region reads it out
    too (on desktop the panel's alert does).
  - A failure belongs to the setup that failed, as a result does. It shows, in the panel,
    the sheet and the phone's bar alike, only while the setup is still that one: fixing it
    (another race) clears the message, leaving the last result if there is one, marked
    stale. A spec switch sets it aside, and switching back to the same setup brings it back.

## Persistence and sharing

- The setup is saved to `localStorage` automatically and restored on the next visit. If the
  browser's storage for the site is full, a change still applies for as long as the page is open,
  and a notice says once that your changes aren't being kept (until a save works again), rather
  than every change failing (`autoSaveStorage` in `src/app/setup-store.ts`). It says what makes
  room as the Setups sheet does: deleting saved setups, or with none shown, that the storage is
  full of something else and clearing the site's data makes room.
- **A stored save is read carefully,** like a shared link: anything in it that this version doesn't
  save falls back to the default instead of breaking the page. A tab that no longer exists opens
  Gear; a setup stored under a spec the sim doesn't know, or under another spec's name, is dropped,
  so that spec opens on its defaults; a last-used spec it doesn't know opens the default spec, on
  your own stored setup for it; a save that isn't a setup at all, or isn't JSON, opens the
  defaults; and a save from another version of the app is read the same way (`merge` in
  `src/app/setup-store.ts`). Nothing is announced: there's nothing you can do about it.
- **What you never changed follows the defaults.** A gear slot or talent build that still holds
  the spec's default when the setup is saved takes the newer default on the next visit; what you
  changed stays yours ([architecture, "Following the defaults"](architecture.md#following-the-defaults)).
  A visit that moved anything says so once, naming the spec, the current one first: "Updated to
  the new default gear and talents for Protection Paladin", "Gear and talents you changed yourself
  are kept." (two specs are both named; more read "Protection Warrior and 2 other specs"). The next
  visit says nothing, even when the save couldn't be written and the visit makes the same move
  again. A share link the page opens with leaves its own spec out of the notice, since the link's
  setup replaces that spec's; with nothing else moved, there's no notice. A default item that can't
  go in beside one of your own (a Unique rule, or a two-hander with your off hand) leaves its slot as
  it was, still following the default, and the next visit tries again. Share links, codes and
  saved setups are loaded exactly as they are; after that, anything in them that is the default
  follows it.
- **A talent build from the game's older talent trees** (a setup saved or shared before
  1.60.1.70009) loads mapped onto today's trees, talent by talent
  ([talents.md § Tree versions](data/talents.md#tree-versions)). Points that have no place there
  are refunded, and the load says so in one sentence that names the talents the game changed as
  the cause, and what to do: "The game’s new talent trees refunded 16 talent points: Improved Holy
  Strike and Crusade left the game, and 5 talents below them lost the points their rows need. Spend
  them again in Talents." A build the sim itself shipped (a default or a preset) isn't mapped: it
  loads as today's version of it, and says so in one line: "Your talents were the Retribution
  default on the game’s old trees; they’re now today’s default." A link, a code or a Load says it
  among its changes, below. A visit says it in the defaults notice, naming the spec ("… 16 of your
  Retribution Paladin talent points: …", every spec's refunds in the one sentence; "Your
  Retribution Paladin talents were the default on the game’s old trees; they’re now today’s
  default."), by spec, the current spec first, after what moved, or on its own under "Talent points refunded for
  Retribution Paladin" (or "Talents moved onto the game’s new trees for …" when a shipped build is
  among them). When a shipped build replaced one you had picked yourself, the notice's opening
  reads "Gear you changed yourself is kept." rather than claiming your talents were. A build that
  follows the default takes today's instead and loses nothing. A build that keeps every point says
  nothing.
- **Share** copies a URL with the compressed setup in the hash (`#s=…`). The clipboard write
  starts within the tap itself, with the link as a promise (`ClipboardItem`), because Safari
  refuses one that follows an await. A notice says the link was copied, or that the browser
  refused and how to allow it.
- Opening a link loads it, whether it opens a new tab or is pasted into a tab that already has
  the app open (only the hash changes). It replaces your setup for the link's spec without
  asking ([D21](decisions.md#d21-no-undo-setups-are-saved-loaded-exported-and-imported-2026-09-23)),
  so its notice says whose setup it replaced, and which spec it switched you to: "Loaded a shared
  setup. It replaced your Arms Warrior setup, and you're on Arms now." A link for another spec
  keeps your setup for the spec you were on, as switching spec does. A code's import and a Load
  say the same (`replacedDescription` in `src/app/load-notice.ts`), and **Reset setup** says "Your
  Fury Warrior setup is back to its defaults". When loading had to change something, the notice
  then says what, in the repair's own words: "Rotation settings that don't apply to this spec were
  reset.", "Greater Stoneshield Potion shares a cooldown with Mighty Rage Potion, so it was turned
  off." Up to three changes are spelled out; past that, the first two and "3 other parts changed
  too." An entry turned off that was locked off for the spec anyway (an Enhancement shaman's second
  stone) did nothing, so it isn't mentioned.
- **Notices.** Toasts are plain notices, with no buttons. Each goes after 10 s, paused while
  you hover over it, touch it or reach it with Alt+T, and while the page is hidden. A notice that
  says more (a load's changes, a talent build's refunds, a race change's set bonus) stays long
  enough to read at a slow reader's pace: 4 s, then a second for every 3 words, up to 30 s
  (`noticeDuration` in `src/app/load-notice.ts`): a load's (a shared link, a setup loaded or
  imported, a visit's) and a race change's that swapped faction gear. The longest, a visit's that moved parts of several specs and read
  several specs' builds from the older trees, reaches that 30 s cap; hovering over it, touching it or reaching it with
  Alt+T pauses it there too, so a reader who needs longer keeps it. A swipe sends one away sooner. They sit at the bottom, just above the phone's sticky bar, so they
  never cover the header.
  - **The load's own notices come one at a time.** The page's share link's and the visit's (newer
    defaults, a build from the older trees) can both come as the page opens. The second waits until
    the first has gone, then gets its own whole time in front (`src/app/held-toasts.ts`). Stacked,
    the one behind would run out its time unread, and a phone can't hover to spread the stack.
    They wait for What's New too ([What's new](#whats-new)). A link pasted in later says so at once.
  - A change gets a notice only when it happens out of sight or needs saying: a shared link
    loaded, **Reset setup** (it changes every tab), a race change that swapped faction gear
    (on the Gear tab), a visit that moved untouched gear or talents to newer defaults, a
    setup saved, loaded, deleted or imported ([Setups](#setups)), and a pasted build code from the
    game's older talent trees ([Talents](#sections)), which isn't the build the trees show at a
    glance. A change you watch happen, like gear, a talent build or Reset rotation, gets none, but screen
    readers still hear it ([Accessibility](#accessibility)). Setups' **Copy setup code** and
    **Download all setups** say what they did in a line under their buttons instead, since a
    notice would sit over the end of the sheet, where Import is.
  - A newer notice of the same kind replaces the last, rather than stacking.
- **A toast never hides the focused control** (WCAG 2.4.11), on the page, in a sheet under it
  (the results sheet, About, the item and enchant pickers) or in a select's list, with one
  exception below. `src/app/toaster.tsx` measures how far up the toasts reach, and
  `src/index.css` explains how each scroller uses it.
  - While toasts are up, the bottom scroll padding clears them, as the page's does the phone's
    bar (`--toast-clearance`), so focus moving on under a toast scrolls clear of it, even while
    the toast is still sliding in.
  - A toast that comes up over keyboard focus scrolls it clear. Focus stays where it is.
    Nothing scrolls after a tap or click, or when the mouse over the toasts spreads them out.
  - The bottom padding doesn't grow for a toast, so nothing moves when one goes. The exception:
    the last control at the very end of the page or of a sheet can't scroll any higher, so it
    can stay partly or wholly under a notice until the notice goes. On a phone that's the
    footer's link, and the end of the Setups sheet (Import's field and **Add setups from a
    file…**) after a notice the sheet raised: a save's, a delete's or a file's import. Copy and
    Download raise none. A swipe sends the notice away.
  - A select's list (`src/components/select-content.tsx`) always drops from its trigger, and
    flips above it or gets shorter and scrolls, so no option is ever under a toast. It doesn't
    move when a toast goes while it's open.
- **Alt+T** (Option+T on a Mac), sonner's shortcut, moves focus to the toasts, and Tab moves
  through them. Leaving them hands focus back to where it was.
- **A toast stays solid over an open sheet or dialog** (the results sheet, the item picker,
  About): a tap on it lands on the toast, not on what's under it, and neither a tap nor a swipe
  closes the sheet. (`src/app/toast-layer.ts` explains how.)
- A link's setup is the `s` parameter of its fragment, whatever else is there: chat apps append
  tracking parameters to a link they pass on, in the query (`?utm_source=…#s=…`) or after the code
  (`#s=…&fbclid=…`, `#s=…?utm_source=…`), and those links load as they are. `&` or `?` ends the
  code, and the code itself is read as it is, so a damaged one is still refused. The whole fragment
  leaves the URL when it's read; the query stays (`fragmentCode` in `src/app/share.ts`). Import's
  field reads a pasted link the same way.
- Setups are versioned, so an old link still loads, or explains why it can't.
- A link to a spec the app doesn't offer yet shows an error toast and leaves the current setup
  alone. A saved setup for such a spec is kept for later, and the default spec opens.
- A link that's corrupt, or over a size cap, shows the broken-link error toast and leaves the
  current setup alone. The caps are 8 K characters in the hash and 16 KB of setup once
  inflated. The largest real setup is about 4.4 KB, or 1.7 K characters. The link leaves the
  URL before it's decoded, so a reload never tries a bad one again.
- A link whose setup the app can't load is refused before it's normalized (normalizing would
  make anything a default setup, and replace yours with it), with an error toast whose title says
  why and whose description that your setup is unchanged (`setupProblem` in
  `src/app/setup-code.ts`):
  - JSON that isn't a setup (`null`, a number, a list, an empty object, a version that isn't a
    number, or nesting deeper than any setup): "That share link is broken", "It doesn't hold a
    setup, so your own setup is unchanged."
  - A version after 1: "That link is from a newer version of Forever Sim", "Reload this page to
    update it, then open the link again."
  - A spec that isn't one of the sim's: "That link is for a spec this sim doesn't know".
  A setup with no version is read as version 1, as a saved one is.

### Setups

**Setups…** in the header's overflow menu opens a sheet of named copies of setups
([D21](decisions.md#d21-no-undo-setups-are-saved-loaded-exported-and-imported-2026-09-23)). It
follows About: a side sheet (full width on a phone), focus on its title when it opens, and back
to the menu's button when it closes. Saving and the list come first, then **Export** and
**Import**, each under a rule with a heading and a line on what it does.
- **Names.** Save and Rename keep the same rules (`src/app/saved-setups.ts`). A name is required,
  trimmed, with each run of spaces as one, in Unicode's composed form (NFC, so an "é" typed either
  way is one name), and at most 60 characters. Characters are counted as a reader counts them
  (graphemes, through `Intl.Segmenter`), so an emoji is one, a skin tone or a family joined with
  ZWJs included, and a name is never cut inside one; a browser without `Intl.Segmenter` counts code
  points. A name also stays within 960 UTF-16 units, the fields' `maxLength`: room for 60 of the
  longest emoji, while a letter under hundreds of accents can't fill storage. Names compare without
  case, the same in every locale. A name that breaks the rules gets its reason under the field,
  which describes the field.
- **Save** keeps a copy of the current setup, its spec included, under a name. The field starts on
  the spec and the day ("Fury Warrior · 23 Sep"), counting on ("… (2)") so the default never
  saves over anything, and the default is selected, so typing replaces it; after a save from the
  field, the next default is selected too.
  - While the typed name is one a save has, a line under the field says which save, before
    anything is replaced: "Saves over “Raid night” · Arms Warrior · 22 Sep, 20:15". It's a polite
    live region, and it describes the field. **Save** reads **Replace**, and replacing keeps the
    save's place in the list, takes the name as typed, and says "Replaced “Raid night”". Otherwise
    the notice says "Saved “Raid night”". The button is as wide as "Replace" either way, so the
    field doesn't narrow as you type.
- **The list**, newest first, except just after a file's import (below): each save's name (up to
  two lines, then an ellipsis), its spec's icon and name in the class colour, and when it was
  saved ("23 Sep, 14:05", or "19 Aug 2025" from another year). On a phone a row's **Load**,
  **Rename** and **Delete** sit under its name, with their words; on wider screens they sit on its
  right, Rename and Delete as icons. Each is 44 px, and its accessible name adds the save's ("Load
  Raid night"). A line above the list says "Loading one switches to its spec and replaces your
  setup for that spec."
- **Load** replaces the current setup, switching to its spec if needed, with no prompt. Your
  setup for the spec you were on is kept, as switching spec does. The sheet closes, and a notice
  says "Loaded “Raid night”", whose setup it replaced and the spec it switched to ("It replaced
  your Fury Warrior setup, and you're on Fury now."), and what loading it changed, as a shared
  link's does.
- **Rename** edits the name in place. Enter or Rename keeps it; Escape or Cancel doesn't, and
  leaves the sheet open. Focus goes back to the row's Rename. A name another save has is
  refused, so a rename never replaces a save. Below 640 px the field takes the row's width, with
  Rename and Cancel under it.
- **Delete** asks first, in the row, not in a dialog: the name becomes "Delete “Raid night”?",
  and the actions **Delete** and **Keep**, a group the question names. Focus goes to Keep, which
  on wider screens sits where the row's Delete was, so a second press, a double click or a held
  Enter keeps the save. Keep or Escape puts the row back, with focus on its Delete, and leaves
  the sheet open. Delete removes the save, with a notice, and focus moves to the next row's
  Delete, or the previous row's at the end of the list, or the list's heading once it's empty
  (not the name field, which would open a phone's keyboard). One row asks, or renames, at a time.
- **Export:**
  - **Copy setup code** copies the current setup as a code: a share link's part after `#s=`. It
    writes to the clipboard as Share does, within the tap.
  - **Download all setups** saves `forever-sim-setups-2026-09-23.json`, which holds
    `{ app: "forever-sim", version: 1, exportedAt, current, setups }`: the current setup, and every
    save as it's stored, shown or not, those that couldn't be read included (after the rest).
  - Each says what it did in a line under the buttons, a polite live region, not in a notice
    (which would sit over Import, at the end of the sheet): "Copied the setup code. Import it in
    any browser to get this exact setup.", or that the browser refused the clipboard and how to
    allow it, in the error colour; "Downloaded forever-sim-setups-2026-09-23.json. It holds the
    current setup and 3 saved setups.", or the current setup only because the saves couldn't be
    read. Saves the list doesn't show (for a spec the sim doesn't offer, from a newer version, or
    unreadable) are counted apart, so the numbers agree with the list: "… and 8 saved setups (2
    not shown here).", or "(not shown here)" when none is. Saying the same again is a new line, so
    it's read out again.
- **Import:** its line says "A code or a share link switches to its spec and replaces your setup
  for that spec. A file from Download all setups adds its setups to your saved ones."
  - **Setup code or share link** takes a code, or anything with `#s=…`: a share link, with other
    hash parameters or words around it. Whitespace doesn't count, so a wrapped code still works.
  - **Import** (or Enter) makes it the current setup, with no prompt, as Load does: it switches
    spec if needed, and your setup for the spec you were on is kept. The sheet closes, and a notice
    says "Imported a setup", whose setup it replaced, the spec it switched to and any parts that
    were out of date.
  - A code that can't be used gets its reason under the field, which describes the field, and
    focus goes back to it, with no notice (`src/app/setup-code.ts`): nothing pasted; not a code or
    a link (a bare word shorter than any setup code, too: "hello" isn't a damaged code); a talent
    build code or a talent calculator's link ("That's a talent build code. Paste it in the Talents
    tab instead."); damaged or cut short; over a share link's size caps; not a setup; from a newer
    version ("Reload this page to update it, then try again", as for a file); for a spec the sim
    doesn't know; or for one it doesn't cover yet. A code is checked before it's normalized, as a
    link is ([above](#persistence-and-sharing)), so nothing replaces your setup with defaults.
  - **Add setups from a file…** takes a setups file. Its setups join the list, and none of yours is
    replaced. Each keeps its name, date and setup; a name that's taken gets a number ("Raid night
    (2)"). One that's saved already isn't added again, so a second import of a file adds nothing: a
    save with the same setup and the same name (without the number an import gave it) or the same
    id. The file's current setup is added too, as "Imported · 23 Sep", unless a save has it
    already; a file with none (no `current`, or `null`) adds its saves alone. A notice says
    "Imported 3 setups" (or "Nothing new to import"), and how many were saved already, couldn't be
    read, or are kept but not shown. The sheet stays open, with focus on the list's heading, so the
    list is in view. Until the sheet closes, the rows it added come first, whatever their dates,
    marked **New**, and a line under the heading says so: "The 3 setups you just imported come
    first, marked New." It describes the heading, so it's read out with it.
  - A file that can't be used gets its reason under the button, which it describes, with no
    notice: not a Forever Sim setups file; from a newer version; damaged (one that names the app
    but doesn't parse, such as a download cut short, is damaged, not someone else's); empty; too
    large (over 5 MB, about all a browser keeps for a site, or 1,000 setups); or none of its setups
    could be read. A setup that can't be read is left out and counted in the notice: over a share
    link's 16 KB cap, nested deeper than any setup (10 levels), or with an id over 64 characters.
    A name is cut to 3,840 UTF-16 units (between characters) before it's tidied. Anything else that
    goes wrong reading a file says it's damaged.
- **Storage.** Saves stay in this browser, under their own versioned key
  (`forever-sim:saved-setups`, `src/app/saved-setups.ts`), apart from the automatic save. The
  sheet reads them afresh each time it opens, and shows another tab's changes as they happen.
  Each save is normalized as it's read, like a shared link, so an old save still loads.
- **States:**
  - Empty: "No saved setups yet", and a sentence on what a save is.
  - A save that can't be read is kept exactly as it's stored, after the others, through every
    change, in case a later version can read it; a notice says how many, and that they're kept
    but can't be shown. A copy (a save that repeats another's id) goes when that save is deleted.
    A save for a spec the app doesn't offer, or from a newer version of the app, is kept but not
    shown (principle 8).
  - Storage the browser blocks: the list says so, and Save (or a file's import) raises a notice
    saying how to allow it. Saves that a newer version of the app wrote, in another tab: the list
    says to reload, and they're left alone until you do.
  - Storage that can't be read at all: the list says so ("Your saved setups couldn't be read")
    and says plainly that saving a setup, or adding setups from a file, replaces what's there with
    a new list.
  - Storage that's full: the notice fits the case. With saves to delete, it asks you to delete
    one you don't need; with none, it says the storage is full of something else, and that
    clearing the site's data makes room but resets your setup too. A file's import that doesn't
    fit says so, and suggests a file with fewer setups when there's nothing to delete.

## Accessibility

- WCAG 2.2 AA contrast in both themes.
- Visible focus on everything interactive, and labels on icon-only buttons. A focused control
  is never hidden behind the sticky header, the sticky section tabs, the phone's sim bar or a
  toast, going forwards or backwards: the page's scroll padding keeps it clear of them with
  0.5rem to spare, from their measured heights (WCAG 2.4.11). A toast has one exception, at the
  very end of the page or a sheet ([Persistence and sharing](#persistence-and-sharing)).
- Logical tab order. Sheets and dialogs trap focus and close with Escape. Phone sheets (the
  results, the item picker) also have a 44 px close button in the header's corner, as the
  About sheet and the desktop dialogs do.
- When a sheet or dialog opens, focus moves into it: to its title when the content is long
  (About, Setups, Release history, Coming soon, What's new, the phone's results, the phone's item picker, so the on-screen keyboard
  doesn't pop up over the list), or to its first field (the desktop item picker's search box).
  When it closes, however it closes, focus goes back to the control that opened it: the item
  picker gives it back to the slot's button after Escape, its close button or a pick. Radix does
  this only for its own Trigger, so one opened from state uses `useSheetFocus`
  (`src/app/sheet-focus.ts`).
- A control that opens a setup tab ("Open Gear" or "Open Rotation" in a result with no damage)
  takes focus into that tab, never leaving it on `<body>`: Gear's main hand, the weapon to add,
  or the tab's panel. From the phone's results sheet, this replaces handing focus back to
  "Show results and details".
- Toasts are read out as they come (a polite live region), and Alt+T reaches them from the
  keyboard; see Notices under [Persistence and sharing](#persistence-and-sharing).
- **Ctrl+Enter, or ⌘+Enter on a Mac, runs Simulate** from anywhere on the page at every width,
  as the button does (decision D34, `src/app/shortcuts.ts`). It's heard before the focused control
  and taken when it runs, so a control that also acts on Enter doesn't: a focused select (the
  Rotation preset) stays closed and a drag handle doesn't pick its row up. In a text or number field
  the field commits what you typed first and keeps focus, so the run takes the new value. It does nothing
  while a run is under way, or while a sheet, dialog or popover with a form of its own (the item
  picker, Setups, a pasted build code, the enchant picker) or an open menu or list has the key;
  a sheet without one, such as the phone's results, leaves it on. It always takes a modifier, so
  typing never triggers it (WCAG 2.1.4).
- **A change with no notice is still announced** (WCAG 4.1.3), through a polite live region in
  the app shell (`announce()` in `src/app/announce.ts`): Equip pre-raid best in slot (or the threat set), Remove all
  gear, a talent preset, a pasted build and Clear (with the points in each tree), Reset rotation,
  and renaming a save. Radix hides the page from screen readers while a sheet is open, but leaves
  live regions alone, so it's heard from a sheet too.
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
