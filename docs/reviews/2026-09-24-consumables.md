# Consumables: one stone or oil per weapon, one potion, rune and explosive (2026-09-24)

GitHub issues #13 and #14 (worked per D33) made the stones and wizard oils one exclusive group
(`0f482ae6`) and the potions, runes and explosives exclusive by their client cooldown category
(`9c581f17`). A fresh reviewer, who wrote neither, reviewed both commits for logic and UX; this log
records its findings and the fix round that answered them. The fixes changed engine logic (two
consumables now simulated), so they get a verification pass by a fresh reviewer (D25).

Probes: the reviewer's `results.probe.ts`, `pack.probe.ts` and `shots.mjs`; the fix round's
`.cache/probes/cf/` in its worktree (seed 12345, 2,000 fights, each spec's default setup with its
Max consumables).

## Findings

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| CR-1 | medium | introduced | Greater Stoneshield Potion (13455) was an `onUse` with no `use`: modelled as zero. Now that it shares the potion group, turning it on turns off the Mighty Rage or Major Mana Potion and adds nothing (D29). | fixed in `b7372e8c`: +2,000 armor (aura 22, misc 1) for 120 s from the client, drunk on the potion category's cooldown from the pull by every rotation (`classes/shared-consumables.ts`), through the defensive-aura path as bonus armor: the armor factor, DTPS and the boss's table; `forever` rage from damage taken reads the hit before armor, `classic` reads health lost; Forever's Dire Bear Form ×4.6 [?]. Stays in no preset: the rage potion makes threat, the armor doesn't (§6.3) |
| CR-2 | medium | pre-existing | EZ-Thro Dark Bomb (225–675 Fire every 60 s), in the Arms/Fury Max preset, was modelled as zero (D29). | fixed in `b7372e8c`: spell 1269334's 225–675 Fire, 1 s cast, no GCD, category 24's 60 s from the client; the spell table (spell hit, spell crit ×1.5), binary at the boss's average Fire resistance [?], its cast stopping swings as Lightning Bolt's does [?], a GCD as long as its cast (engine choice); every rotation throws it on cooldown; `explosiveThrow` lists the [?] rules. Measured, it costs every melee spec more than it deals (Fury 814.5 → 794.7 DPS, Arms 728.7 → 703.4), so it leaves the Arms/Fury Max preset (D29); a caster gains a little (Fire mage +0.8%), a known gap in the milestones |
| CR-3 | low | introduced | The load notice gave only a count: an old Prot Max link said "2 parts were out of date and are back to their defaults" when a stone and a potion had been turned off, and an Enhancement shaman's link warned about a stone its imbue locks off anyway. | fixed in `28507900`: the notice spells out normalizeConfig's own sentences (up to three; past that the first two and a count), and a rival locked off for the spec goes without a note; ux.md and the buffs doc follow |
| CR-4 | low | introduced | Buffs §6.3's Arms/Fury Max row offered "Sapper + Dense Dynamite if engineer", which the explosive group forbids; the one-per-category rationale ("a second would only take the first one's turns") ignored items with a longer cooldown of their own (the Sapper's 300 s, Thistle Tea's 300 s). | fixed in `b7372e8c`: the row has no explosive and says why; the rationale says such items would need an alternation model once simulated side by side, and the milestones list it |
| CR-5 | low | introduced | Copy: the potions' "One kind of potion, as potions share a cooldown"; every stone and oil said "(one stone or oil per weapon)" whatever the spec could pick, though a rogue's poisons take the weapon too. | fixed in `b904ed39`: "Potions share a cooldown, so one is on at a time"; the Buffs tab's note names what the spec can put on its weapons ("(one stone per weapon)", "(one stone or poison per weapon)", "(one stone or oil per weapon)", "(one oil at a time)"), none on a stone it can't use |
| CR-6 | low | pre-existing | The warlocks', Shadow priest's and Balance druid's Max consumables lacked Brilliant Wizard Oil, which the mages', Elemental's and the Protection paladin's have (D29). | fixed in `6f2c691b`: every caster's Max has it (Destruction 546.2 → 572.0, Shadow 586.8 → 607.2, Balance 538.1 → 565.2 DPS); §6.3 gains a Balance row, the class docs follow, and the milestones' T2R-6 gap narrows to Nightfin Soup |

## Numbers after the fix round

Max consumables, seed 12345, 2,000 fights; "+ Stoneshield" swaps the preset's potion for it.

| Setup | DPS | TPS | DTPS |
| --- | --- | --- | --- |
| Protection warrior, Max | 399.9 | 1,189.2 | 609.2 |
| Protection warrior, Max + Stoneshield | 395.2 | 1,175.7 | 530.8 (609.2 → 610.1 before: not simulated) |
| Feral bear, Max | 581.1 | 1,152.3 | 627.4 |
| Feral bear, Max + Stoneshield | 566.3 | 1,110.0 | 553.8 (627.3 before) |
| Protection paladin, Max + Stoneshield (for Major Mana) | 511.8 | 941.7 | 787.7 (903.9 before) |
| Fury, Max (no bomb) | 814.5 | 481.2 | — |
| Fury, Max + bomb | 794.7 | 469.4 | — |
| Arms, Max + bomb | 703.4 | 404.7 | — |
