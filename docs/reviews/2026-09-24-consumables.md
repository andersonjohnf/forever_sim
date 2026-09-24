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

## Verification pass

A fresh reviewer checked the fix round (`b7372e8c`, `28507900`, `b904ed39`, `6f2c691b`): CR-1 to
CR-6 are fixed, and nothing it introduced is medium or worse. Its probes are in
`.cache/probes/cons-verify/` in its worktree. Its eight findings are low, and a second fix round
answers them; CV-4, CV-5 and CV-6 change engine logic, so those commits get a quick fresh check.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| CV-1 | low | introduced (Elixir of Greater Defense's pre-existing) | Greater Stoneshield silently cost a DPS spec its potion (Fire mage 513.1 → 446.0 DPS): armor-only entries didn't get the tank-only note (`onBossMeleeOnly`) | fixed in `f1ce124c`: an entry whose effects are only armor (a bonus or item armor stat, or an on-use whose only effect is an armor aura) is `bossMelee`, so Devotion Aura, Elixir of Greater Defense and Greater Stoneshield say "Only the tank takes the boss's swings, so it changes nothing for you." to a DPS spec; ux.md and buffs §3.5 follow; index.test.ts and the buffs-for-your-class e2e |
| CV-2 | low | introduced | The bomb's copy told casters and hunters "its 1 s throw stops your swings", in the Buffs summary and the `explosiveThrow` assumption | fixed in `8b428754`: `buffSummaryFor` and `throwHolds` word it per spec ("stops your melee swings", "holds your next cast", "holds your Auto Shot"), and the assumption says when the spec throws it (`explosiveThrowDetail`); index.test.ts, consumables.test.ts, buffs-one-of-a-kind e2e |
| CV-3 | low | introduced | No open question for the bomb's new [?] rules | fixed in `a075c08c`: buffs doc open question 21 (binary resist, the cast stopping swings, its threat, no class talents, and whether a druid can throw it in a form), with a beta check at a dummy with a swing-timer addon, logging resists and crits |
| CV-4 | low | introduced | §3.7's "Talents and buffs" row didn't match the engine: Fire Power didn't apply, Critical Mass and Elemental Precision did, and bomb crits fed Ignite and used Combustion's charges, though in the client those talents are class-mask spell modifiers and 1269334 has no `SpellClassOptions` | fixed in `486da77a`: `SpellDef.itemSpell` [?]: none of your school's hit, crit or damage, no per-spell or free-cast crit, no spell procs, only the crit charges any crit ends; your spell hit and crit, all-damage multiplier and the boss's damage taken apply. §3.7 says so (the school auras it also drops, Power Infusion and a sacrificed Imp, are at most 0.25% of DPS). A Fire mage's gain from the bomb: +0.82% → +0.63%. consumables.test.ts |
| CV-5 | low | introduced | The first throw at t=0 cancelled the opening swing, and later throws ignored the swing timer, overstating the melee cost | fixed in `d045ad3a`: condition 35, `mainSwingWithin`; a spec that swings throws within 200 ms after a main-hand swing [?], so the first throw follows the first swing. Fury 814.5 → 805.8 DPS with it (−1.07%; −1.18% on seed 424242 at 5,000 fights), Arms 728.7 → 724.6 (−0.56%; −0.59%): still a loss beyond the ±1.4 DPS intervals, so it stays out of their Max preset (D29). §6.3 gives the numbers in place of "costs every melee spec more than it deals"; consumables.test.ts |
| CV-6 | low | introduced | The bomb's cast held only the GCD; off-GCD abilities could go during the throw | fixed in `b563b018`: `castHoldsOffGcd` on the bomb, as Hammer of Wrath has; §3.7's row; consumables.test.ts (nothing used during a throw, and the potion is without the hold) |
| CV-7 | low | introduced | §6.3's last sentence said casters come out slightly ahead; the bomb's 15 yd range keeps it out of the casters' and hunters' Max | known gap, no code: §6.3 rewritten in `d045ad3a` (casters mixed, hunters gain, the range), and the milestones' "Consumables left for later" in `13fa9460`, re-measured after CV-4 |
| CV-8 | low | pre-existing | `normalizeBuffs` picked a rival by effect size, ignoring whether the spec could use it (a hunter's Dumplings kept over Grilled Squid) | fixed in `f1a89f14` (a small change): a usable rival beats one `buffUnusedReason` locks off, before effects are compared; buffs doc "Exclusivity groups"; normalize.test.ts |

Also fixed on the way: the Classic Era values table still listed the bomb and Greater Stoneshield
as "not simulated" (`d045ad3a`).

Found, not ours: on `main` since the consumables and data-drift merges, three tests in
`scripts/scrape/committed-data.test.mjs` fail. §3.7's rules table (Rule | Value | Tag) has no ID
column, which the buffs-doc parser reports as a problem (`NO_ID_TABLES` in
`scripts/scrape/lib/docrefs.mjs` would take it), and the bomb row's "260817 → 1269334" isn't in the
committed `src/data/client` (items.json has no spell for 260817, spells.json doesn't carry 1269334
as a docs spell): the data needs regenerating from the cache.

### Numbers after the second fix round

Max consumables with and without the bomb, seed 12345, 2,000 fights (`.cache/probes/cv/` in the
fix round's worktree).

| Setup | Max | Max + bomb | Change |
| --- | --- | --- | --- |
| Fury | 814.5 | 805.8 | −1.07% |
| Arms | 728.7 | 724.6 | −0.56% |
| Feral cat | 637.3 | 639.1 | +0.28% |
| Retribution | 760.8 | 762.6 | +0.24% |
| Enhancement | 646.6 | 645.9 | −0.11% |
| Fire mage | 623.8 | 627.7 | +0.63% |
| Demonology | 642.7 | 639.8 | −0.45% |
| Marksmanship | 550.2 | 555.1 | +0.89% |
| Protection warrior (TPS) | 1,189.2 | 1,179.8 | −0.79% |
| Feral bear (TPS) | 1,152.3 | 1,150.9 | −0.12% |
| Protection paladin (TPS) | 948.2 | 948.2 | 0.00% |
