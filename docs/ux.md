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
   are complete. Nothing is visibly "coming soon". To see and test one before it ships, a dev
   build, or a browser under automation (the e2e tests, `npm run snap`), offers it too when the
   URL names it: `?preview=warrior-protection` (`src/app/preview-specs.ts`). A visitor's browser
   ignores the parameter.

## Layout

| Width | Layout |
| --- | --- |
| **≥ 1024 px** | A header, then two columns. **Left:** the setup, as section tabs. **Right:** a sticky results panel with the Simulate button. |
| **640–1023 px** | One column of setup sections. A sticky bottom bar shows the latest result and the Simulate button; tapping the result opens the full results as a sheet. |
| **< 640 px** | A compact header. The section tabs are a horizontally scrollable segmented bar, sticky under the header. The sticky bottom bar works as above. Pickers open as full-height sheets. |

**Header:** the app mark, "Forever Sim" (the page's one `<h1>`, visually hidden on phones),
and the **spec switcher**, which shows the class icon and spec in the class color. Then
**Share** (copies a link to this setup) and an overflow menu with Setups…
([Setups](#setups)), About & data, Theme (system, light, dark) and Reset setup. Menu items are
44 px tall.

**About & data** opens a sheet that starts with what the app is, without naming specs ("A DPS
simulator for WoW Forever", and "A DPS and TPS simulator" once a tank spec ships), then the specs
it covers on their own line, one class at a time ("Covers Warriors: Fury and Arms · Druids:
Feral (Cat) · Paladins: Retribution"), which grows as specs ship (principle 8). The page's meta
and Open Graph descriptions in `index.html` carry the same description line and change only when
the first tank spec ships; an e2e test compares them.

**Section tabs** are 44 px tall. When they scroll sideways, a fade marks each edge with more
tabs past it (none at an end), and the chosen tab scrolls into view clear of the fades, as does
a tab that arrow keys move focus to. Arrow keys move between tabs and Enter or Space opens one
(manual activation), so focus coming back from a toast never switches the tab. Opening a tab
from further down the page scrolls up to the new section's top, just under the sticky tabs
(smoothly, unless reduced motion is asked for), so its header and any note under it (Classic
Era's) start in view rather than under the tabs.

**Setup sections**, in this order: **Character · Talents · Gear · Buffs · Rotation · Fight**.
Each opens with its title and a short intro. An action (Reset rotation, the gear menu) sits on the
title's right; on a phone the intro takes the full width under both, and from 640 px it sits
beside the action (`SectionHeader` in `src/features/section.tsx`).

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
    the same stats, and keeps the slot's enchant. A twin's class restriction counts only as
    whether this class can wear it, so a warrior's Sergeant Major's Plate Wristguards (warriors
    and paladins) swap for First Sergeant's Plate Bracers (warriors). The swap happens out of
    sight, on the Gear tab, so a notice names the new items. An item with no twin stays, and the
    notice says so.
  - Advanced: the rule profile (`Forever`, the default, or `Classic Era`) and the switch for
    unmeasured ratings
    ([D12](decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)).
    A switch's whole row, with its help, is its label, as in Buffs.
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
- **Talents.**
  - A preset menu with the documented builds (its class doc) of the specs the app offers, so it
    grows as specs ship (principle 8): no Protection builds until Protection does, and a druid
    sees the Feral cat's build but no bear build until the bear ships. The spec
    default is selected. Only the current spec's default is marked "(default)"; another spec's
    reads plainly ("Arms default"), so the menu never shows two defaults.
  - Interactive trees: three side by side on desktop, one tab per tree on mobile (a segmented
    control named "Talent tree", each tab as wide as its name and points need, with tight padding,
    so "Feral Combat 37" fits beside Balance and Restoration down to 360 px, and a warrior's three
    at 320 px). With a mouse, click to add a point and right-click to remove one; on a touch
    screen, a tap opens the talent's details with − and + buttons. On a focused talent, Enter adds a
    point and Backspace removes one (Delete and − work too); the hint above the trees and each
    talent's tooltip say so. Tier gates and prerequisites are enforced visibly: a locked talent's
    icon turns gray and its rank badge takes the muted text colour (AA), never opacity.
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
    The paste dialog puts focus in its field, and gives it back to **Paste code** however it
    closes. **Clear** disables itself, so it moves focus to the preset menu (now "Custom build")
    first.
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
  - A gear-set menu: "Pre-raid BiS" (the spec default, in the race's faction's PvP gear),
    "Empty", and later saved sets.
- **Buffs.**
  - Presets: Self only, Dungeon group, Standard raid (the default, named "Standard raid
    (default)", like the talent presets), Max consumables. Each shows what it brings in a line
    under its name, in the tile, not in a hover title.
  - Composition switches: which classes are in the raid. These drive which raid buffs are
    available; buffs never depend on faction.
  - Grouped switches for raid buffs, target debuffs and consumables. A buff nobody in the raid
    brings says so ("Needs a paladin in the raid") and is dimmed by colour, not opacity: its text
    takes the muted text colour (AA), its icon turns gray, and its switch is off and disabled. You
    count for a buff you cast on yourself: a druid's Gift of the Wild never needs another druid.
    One that does nothing for your spec is dimmed and locked off the same way, and says why: for a
    druid, a Dense Sharpening Stone or Weightstone ("Not used in Cat Form: your attacks there don't
    use your weapon's damage.").
  - Only what does something for your class is listed at all: mana and spell damage entries
    (Blessing of Wisdom, mana potions, spell damage elixirs) show for paladins only
    ([buffs doc](mechanics/buffs-debuffs-consumables.md#class-only-entries)). An entry your class
    can use but your spec can't (the weapon stones in a form) is listed, locked off, as above.
  - Under Classic Era rules, a note at the top says the buff, debuff and consumable values are
    Classic Era's, with a link to **Character → Advanced** that opens the rule profile with focus
    on it.
  - World buffs don't exist here ([D8](decisions.md#d8-world-buffs-are-excluded-2026-09-22)).
  - A buff the rotation keeps up itself (a warrior's own Battle Shout, a cat's own Faerie Fire)
    shows its switch on and locked, with a note saying the rotation keeps it up, so it's never
    counted twice. One the talents bring (a druid's Leader of the Pack) is on and locked the same
    way, and its note says the talents bring it.
  - Some of these are the spec's own: the raid's version is assumed to be yours (a cat's Faerie
    Fire, [druid §6.2](classes/druid.md#62-forever-cat-priority)). When the rotation drops one,
    its Buffs switch is off by default and unlocked, and its note says so: "You're not keeping it
    up (see Rotation); turn this on if another druid does." Turned on, it's another player's, and
    it stays on until you turn it off. Without that class in the raid it reads "Needs another
    druid in the raid". (A warrior's Battle Shout isn't one of these: the Buffs tab's is another
    warrior's, and stays on when the rotation drops yours.)
- **Rotation.** The spec's ability list. Each entry has an on/off switch, threshold inputs
  with units, one line of help, and the default marked. **Reset rotation** (in the section
  header, enabled once you've set anything) puts every setting back to its default. It disables
  itself, so it moves focus to the first setting, the next control after it.
  - The intro says what the defaults are, per spec: "tuned for the default setup" once a slice
    has tuned them ([D23](decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23);
    Arms since M2.5a, Fury since M2.5b, the Feral cat since B2, Retribution since C2), "the common
    priority" for a spec until then. The cat's also says there's no powershifting, and why
    ([druid §2.8](classes/druid.md#28-shapeshifting-furor-wolfshead-helm-powershifting-mana)),
    since a Classic Era feral would look for it.
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
    with Bloodthrill; Berserker Stance turns Whirlwind on and Rend and Overpower off). The tab
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
    that needs an execute phase (Execute, `needsExecutePhase`) can't apply while the Fight tab's
    execute phase is 0%, so it's dimmed then too, with every setting that needs it, and its help
    says it needs an execute phase under Fight. A dimmed setting is dimmed by colour, never
    opacity: its label and inputs take the muted text colour, which is AA, and a switch that's on
    shows a neutral gray track rather than the primary colour. It stays usable.
  - A setting the rest of the setup leaves unused is dimmed, with a note under it saying why, in
    the consumables' words: the racial cooldown for a race without one the sim uses ("Not used:
    Tauren has no racial cooldown that adds damage.", and the Gnome's Eureka!, which isn't
    simulated), and a cat's Rake or Rip while its "only when nothing else bleeds" meets a raid
    whose warriors keep the boss bleeding ("Not used in this raid: its warriors keep the boss
    bleeding. Turn off … to use it anyway."). Its switch stays usable, since it takes effect once
    the setup lets it, and the settings under it aren't dimmed with it: one may be the way to use
    it.
  - A consumable's row needs its Buffs switch. While that's off, its own switch shows off and
    locked, whatever it's set to, and the row says so ("Not used: turn on … in Buffs first"),
    with **Buffs** a link to that tab (a 44 px hit area, like a row's Reset). The link opens
    Buffs with focus on that consumable's switch, so Space turns it on. Turning it on in Buffs
    brings back its setting.
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
    set to 4,500 to 5,500 a swing before armor (Fight → Advanced). Debuffs on it (Buffs), such as
    Demoralizing Shout and Thunder Clap, lower its damage and slow its swings." The swings
    include parry-hastened ones; a fixed swing size reads "5,000". Its "(Fight → Advanced)", and
    the crushing line's, have non-breaking spaces around the arrow, so they never split at 390 px.
- **Breakdown:** a per-ability damage share bar, then casts, hit/crit/miss/dodge/glance
  percentages and average hit. White swings are "Main hand" and "Off hand"; a druid's, in a form
  with its own weapon, are "Auto attack".
  - A **bleed's** row counts its applications and its ticks apart, so its outcomes read
    "32.2% tick crit · 1.1% of applications avoided", with its uptime on the boss on a second
    line (Rend, a cat's Rip; Rake's bleed has a row of its own, "Rake (bleed)", right after its
    hit's row, whatever their damage). The tick crit shows only where ticks can crit (the Forever profile), and the
    avoidance only for an application that rolls (Rend). A bleed that does neither, such as
    Deep Wounds (a crit applies it, and its ticks can't crit), shows its ticks per fight.
  - Casts that deal no damage (Death Wish, Recklessness, Bloodrage, racials, the potion) stay
    out of the breakdown. They're under **Cooldowns and buffs**.
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
  one row per line with the numbers right-aligned: "At the pull 2,882", "Regenerated +2,314",
  "Restored +6,150", "Spent −10,964" and "Left at the end 382" (the default setup; never below 0). Restored is left
  out when nothing restores mana. A line under it says what the gains count: "Regenerated counts
  Spirit and mana per 5 s; restored, Sanctified Judgement's returns and mana potions and runes."
  It's what Consecration's and Exorcism's mana thresholds and the potion lines are weighed
  against; the potion's and rune's casts per fight are under Cooldowns and buffs.
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
  default. A proc the next ability spends (a cat's Clearcasting) is up only until then, so its
  uptime is tiny: the line under its name says how often it came, "6.3 a fight, each spent by
  your next ability".
- **Character sheet:** the final AP, crit, hit, haste, weapon skill and armor, the way the
  sim computed them.
  - A paladin's add its spell stats, each beside its melee or base counterpart: Spell damage
    (its Holy spell damage, since every paladin spell is Holy, Champion of the Light's share of
    Intellect included), Spell crit and Spell hit after Expertise; Intellect and Spirit after
    Stamina; Mana and Mana per 5 s after Health. Each label fits on one line at 390 px.
  - Defense, dodge, parry, block and block value join them for a tank, and for anyone with
    defense above 300 or block value. A tank's add **Crit reduction (boss's crits)** after
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
    differ a little, by chance and as cooldowns and procs change your stats in the fight."
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
  - A setup the engine refuses (a Skyborne warrior) is titled "This setup can't be simulated",
    and its message says what to change, so no retry advice follows it. Any other failure is
    titled "The simulation failed" and suggests trying again, then resetting the spec.
  - On a phone the bottom bar shows the failure itself: a warning icon, "Couldn't simulate"
    and the start of the reason, in AA colors. "Show results" stays enabled, with or without an
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
  Fury Warrior setup is back to its defaults".
- **Notices.** Toasts are plain notices, with no buttons. Each goes after 10 s, paused while
  you hover over it, touch it or reach it with Alt+T, and while the page is hidden. A swipe
  sends one away sooner. They sit at the bottom, just above the phone's sticky bar, so they
  never cover the header.
  - A change gets a notice only when it happens out of sight or needs saying: a shared link
    loaded, **Reset setup** (it changes every tab), a race change that swapped faction gear
    (on the Gear tab), and a setup saved, loaded, deleted or imported ([Setups](#setups)). A
    change you watch happen, like gear, a talent build or Reset rotation, gets none, but screen
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
  your Fury Warrior setup, and you're on Fury now."), and any parts that were out of date, as a
  shared link's does.
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
  (About, Setups, the phone's results, the phone's item picker, so the on-screen keyboard
  doesn't pop up over the list), or to its first field (the desktop item picker's search box).
  When it closes, however it closes, focus goes back to the control that opened it: the item
  picker gives it back to the slot's button after Escape, its close button or a pick. Radix does
  this only for its own Trigger, so one opened from state uses `useSheetFocus`
  (`src/app/sheet-focus.ts`).
- A control that opens a setup tab ("Open Gear" or "Open Rotation" in a result with no damage)
  takes focus into that tab, never leaving it on `<body>`: Gear's main hand, the weapon to add,
  or the tab's panel. From the phone's results sheet, this replaces handing focus back to
  "Show results".
- Toasts are read out as they come (a polite live region), and Alt+T reaches them from the
  keyboard; see Notices under [Persistence and sharing](#persistence-and-sharing).
- **A change with no notice is still announced** (WCAG 4.1.3), through a polite live region in
  the app shell (`announce()` in `src/app/announce.ts`): Equip pre-raid best in slot, Remove all
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
