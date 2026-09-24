# Tank rotation integration: the three tanks' priority lists and presets (2026-09-24)

M5.65 A2's tanks on the priority list (D31) with D28's Defensive, Balanced and Max TPS as the
list's presets, Balanced the default, reviewed together at `a4a041b7`: a logic review (TI) and a
UX review (TU), each by a fresh reviewer who wrote none of it. This log records both and the fix
round that answered them.

Probes: `.cache/probes/tank-int-review/` and screenshots `.cache/snaps/tank-int-ux/` in the
integration worktree; the fix round's screenshots are `.cache/snaps/ti-fix/` in its own (the three
tanks' Rotation tab, default and with the About popover open, at 390 px dark and 1280 px light).

The defaults after the fix round, on seed 31101 (100,000 fights): the warrior's Balanced 1,240.98
TPS (unchanged: TI-1 plays exactly as before at 100 max rage), the bear's 1,115.34, the paladin's
832.09.

## Logic review (TI)

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| TI-1 | medium | introduced | The user's rule is the Sunder Armor filler "above 60% rage", but Balanced's threshold was an absolute 60 (and Heroic Strike's 84), so a bigger bar (Boundless Rage, a Gnome's Expansive Mind) moved it against the cap: scaling the filler alone cost a Boundless 3/3 build 6.08% TPS. | fixed in `89e35756`: a `defaultWhen` entry can be a share of the build's max rage (`pctOfMaxRage`), resolved to whole points against the plan's max rage (`maxRageOf`); Balanced's filler is 60% and Heroic Strike 84%. At 100 it plays exactly as before (a unit test compares the lists; the golden didn't move). Boundless 3/3: 78 and 109, +0.09% TPS against the absolute 60/84 (level); a Gnome: 63 and 88, −0.10% (level); a Gnome with Boundless: 82 and 115. The Rotation tab resolves with the race, so it shows what the sim uses, and a Gnome at the defaults is still Balanced (unit and e2e tests). The threshold stays "at or above", so 100 plays unchanged; the help, warrior.md §5.4 and D28 say "60% of your max rage" |
| TI-2 | medium | pre-existing | The bear's default Balanced makes 1,115 TPS against the guild's 800–900 (D29), with Maul 59% of its threat, and nothing recorded it. | recorded in `eabc5bc3` as an open plausibility finding under the milestones' T6, with the threat by ability and the candidate causes to test in game (Maul's ×1.75, rage from damage dealt and taken, Dire Bear Form's ×1.3, Savage Fury on Maul's threat). The model is unchanged, as briefed |
| TI-3 | low | introduced | The warrior's lead isn't recorded: Balanced 1,241 against the paladin's 832 is +49.1%, at D29's ceiling, and Sunder Armor's 1,013 [F] is 33% of its threat. | fixed in `eabc5bc3`: D28's status says so, and that the next change to either tank checks against it |
| TI-4 | low | introduced | A duty moved below an always-ready filler is never cast (Thunder Clap or Demoralizing Shout under Defensive's Sunder filler), while ux.md said it "keeps the duty rule wherever you move them". | fixed in `9d6b3469`: the warrior's unused-settings notes say "Rarely used: the Sunder Armor filler above it takes the global cooldowns first. …" on Thunder Clap (with `maintainOnly`), Demoralizing Shout or Battle Shout below the filler while its threshold is at most Sunder Armor's cost or the row's own and it doesn't wait for Shield Slam (Demoralizing Shout there measured under one cast a fight); ux.md and warrior.md say the rule decides when a duty wants the global cooldown, not that it gets it. Unit and e2e tests |
| TI-5 | low | introduced | With Hammer of the Righteous above Holy Strike, Holy Strike was left out of the plan, so a Hammer that couldn't pay its 90 mana left the shared cooldown unused. | fixed in `51edf17b`: both rows are emitted and the shared cooldown decides; a mana-starved unit test casts Holy Strike and no Hammer. The 200-case snapshot is identical for every Hammer-off setup (all presets); only the 31 cases with Hammer on, Holy Strike on and a weapon for it moved, checked case by case. Hammer on now −1.06% TPS and +0.92% DPS against the default (was −1.20% and +0.84%); the help and paladin.md follow. Holy Strike's note under Hammer reads "Rarely used: … It's used when you can't pay Hammer's 90 mana." |
| TI-6 | low | introduced | Hammer's weapon note said "…so Holy Strike is used" with no main hand (neither is cast) and with Holy Strike off (the engine casts neither); its help had the same gap. | fixed in `51edf17b` (with TU-2): no main hand, "Not used: needs a one-handed axe, mace or sword in your main hand."; Holy Strike off, "… Turn Holy Strike on to use it instead."; the help says "Holy Strike is used if it's on". Unit tests |
| TI-7 | low | introduced | Stale text: the warrior's Priority comment said Balanced drops the Sunder filler; the paladin's options comment said Balanced "differs by a first-pass search"; paladin.md said "D28's Balanced rotation takes it" of Hammer, which Balanced declines; druid.md said Max TPS "plays as Balanced", against its Maul from 14. | fixed: the warrior's in `89e35756`, the paladin's two in `51edf17b`, druid.md in `9cfa2438` (with Max TPS's numbers against Balanced) |
| TI-8 | low | introduced | `scripts/tune` `order=` accepted unknown row ids silently, so a typo ran the default order under the candidate's name. | fixed in `3f79f6e9`: each id is checked against `rotationApl(spec).rows`, a repeat is refused, and so is an order for a spec without a list |
| TI-9 | low | introduced | The paladin's case generator iterated the live `PROTECTION_OPTIONS`, so a setting added later would change every case drawn after it. | fixed in `05d28380`: a frozen `PRE_LIST_OPTIONS`, as the warrior's; the snapshot is unchanged |
| TI-10 | info | — | Information only. | nothing to do |
| TI-11 | low | pre-existing | `rotation.mjs --against` said it runs "that commit's defaults" but takes this commit's `defaultConfig` for gear, talents, race and Buffs. | fixed in `3f79f6e9`: the doc and the baseline's label say the other commit's engine and rotation defaults run on this commit's setup (the same setup on both sides is what a semantics comparison wants; `talents=` gives another build) |
| TI-12 | info | — | Information only. | nothing to do |

## UX review (TU)

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| TU-1 | medium | introduced | The warrior's Balanced line and the bear's Max TPS line left out their damage-taken cost, which ux.md's "what it keeps and gives up" asks for. | fixed: the warrior's in `89e35756` ("… +10% TPS, +6% DPS, 21% more damage taken than Defensive.", 117 characters; TI-1 left the numbers unchanged), the bear's in `9cfa2438` (with TU-6). A unit test holds every duty-dropping preset's line to its damage-taken cost |
| TU-2 | low | introduced | The Hammer weapon note promised Holy Strike when Holy Strike is off. | fixed in `51edf17b` (TI-6) |
| TU-3 | low | introduced | The About popover sat flush against the window's edges. | fixed in `9cfa2438`: `collisionPadding={16}`; the bear's phone e2e checks 16 px left and bottom (`14dae8b4`); ux.md says so |
| TU-4 | low | introduced | "Custom: you've changed the list from every preset." reads oddly. | fixed in `9cfa2438`: "Custom: the list matches none of the presets. Pick one to start again from it.", in the code, ux.md and the e2e tests |
| TU-5 | low | introduced | The warrior's and bear's Max TPS help didn't name the Buffs tab's versions of the duties they drop, which ux.md promises. | fixed in `9cfa2438`: both do; a unit test holds every duty-dropping preset's help to it |
| TU-6 | low | introduced | The bear's Balanced and Max TPS lines gave no reason to choose: Max TPS was only compared with Defensive. | fixed in `9cfa2438`: "Balanced, but Mauls from 14 rage: +0.2% TPS, −0.2% DPS, the same damage taken (0.7% more than Defensive)." and the help compares with Balanced too (seed 31101, 100,000 fights: +0.16% TPS, −0.22% DPS) |
| TU-7 | low | introduced | Moving an off row makes the list Custom, though play is identical. | waived: documented behaviour (ux.md "Presets and Custom": the order is part of a preset). Ignoring off rows' positions would make a list read as a preset whose order it doesn't have, and turning such a row on would then silently move it; the stored order is what the user sees |
| TU-8 | low | introduced | The popover's focus opens on its container; Tab leaves it without closing, End scrolls the page. | waived: Radix's `onFocusOutside` doesn't fire when Tab leaves the document from the portalled popover's end, so Tab-to-close isn't the simple change the brief allows; Escape closes it and returns focus to the button (e2e-tested), and a pointer or tap outside closes it |
| TU-9 | low | introduced | "a first quick search" / "isn't tuned yet" is process jargon shown to players. | fixed in `9cfa2438` for the tanks: "Balanced, the default, hasn't been fully tuned yet." (the warrior), "Balanced, the default, and Max TPS haven't been fully tuned yet." (the bear), in the code, ux.md and e2e. The DPS specs' intros still say "with a first quick search"; outside this change, for the milestones' known gaps |
| TU-10 | low | introduced | The picker is far from the list on a phone (Consumables between them). | waived: ux.md's picker-first rule puts a tank's preset first on the tab, as its priority choice always was and as the Talents and Buffs tabs' presets are; the line under it says what the list does |

## Checks

Lint, typecheck and `npm test` (2,539 tests) green; the e2e specs feral-bear, paladin-protection,
paladin-protection-rotation, protection-rotation, rotation-tab, tank-results, priority-list,
share-links, setups and setup-defaults green (125 tests). The fix round's engine changes (TI-1's
scaling, TI-5's fallback) need the verification pass (CLAUDE.md step 5).
