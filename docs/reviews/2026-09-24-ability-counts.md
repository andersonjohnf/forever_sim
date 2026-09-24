# Per-ability counts in the breakdown (2026-09-24)

The counts slice (`d2b3f3cd`, `8a7394b3`, `a04f4508`): each breakdown row's outcomes line starts
with its count a fight, named for what it counts (`AbilityResult.unit`), and ends on the Damage
metric with its average per landed hit. A fresh reviewer who wrote none of it did the combined
logic and UX review, with probes over all 23 default specs; the fix round below answers it.

Nothing high; PC-1 and PC-2 (medium, introduced) blocked the push.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| PC-1 | medium | introduced | An extra-attacks proc that gives two swings was counted twice: the row's `casts` rises once a swing (`doAction` queues `n`). Windfury Weapon showed 31.25 "procs a fight" for 15.63 fires, Ironfoe 8.87 for 4.51. `aggregate.test.ts` pinned the noun over the swing count. | fixed in `8cea3c26`: the engine counts each fire in a new breakdown column (`FIELD.procs`); `AbilityResult.procs` carries it on a `procs` row and the count reads it, while the crit and avoided shares stay over the extra swings. Counting fires, not the "extra attacks" noun, because the user asked for procs. (Hand of Justice and Windfury Totem read about the same either way, except where a queued Heroic Strike or Maul takes an extra swing's place: PV-1.) Now 15.63 and 4.51 shown for 15.63 and 4.51 fired (1,000 fights, seed 3). Tests check Windfury Weapon, Ironfoe, Hand of Justice and Windfury Totem against fires counted apart from the engine (a wrapped `doAction`); a warrior's swings fall short of 2 × fires because a queued Heroic Strike takes an extra swing's place on its own row |
| PC-2 | medium | introduced | Consecration and Arcane Missiles mixed units: "21.3 casts · 95 avg hit", the 95 being one tick or missile. | fixed in `8cea3c26`: one rule, structural rather than from the counts: a row an ability's ticks cast a spell onto (`SourcePlan.landing`, from its `tickSpell`) counts casts, and its average and shares are per landing, "95 avg tick", or "430 avg missile" for Arcane Missiles (`tickNoun`). ux.md's Breakdown says so. Unit tests for both, and a check that no other default row lands more than once a cast |
| PC-3 | low | introduced | Mind Flay read "applications": `rowUnit` gave a pressed row with a DoT `applications`, though a channel is cast. | fixed in `8cea3c26`: a pressed channel counts casts, "46.3 casts a fight · … · 11.0% avoided" |
| PC-4 | low | introduced | ux.md and the `types.ts` comment said a mana or rage row counts nothing, but Bloodrage, Enrage and the potions showed "casts a fight" on a tank's Threat view. | fixed in `8cea3c26`: the counts stay; a potion or rune (a catalogue consumable, `SourcePlan.consumable`) counts `uses` ("1.6 uses a fight · from 2,725 mana a fight"), Bloodrage and Enrage stay casts, and ux.md and the comment say which rows count none (a talent's mana or rage) |
| PC-5 | low | introduced | DoT and bleed lines got dense ("of applications avoided", "of procs avoided"). | fixed in `8cea3c26`: "avoided", the count having named its unit; ux.md says what the share is of and that these lines may wrap to three or four lines at 390 px. Checked on Shadow priest at 390 dark (Mind Flay: three lines and its uptime) |
| PC-6 | low | pre-existing | Deep Wounds' refresh restarts its tick timer: Fury's 115 procs give 17 ticks; keeping the phase would give about 60, +2.0% Fury DPS (+1.5% Arms). | kept as modelled ([C]/[?], warrior.md §2.5, damage-and-timing §4), and shown in `07c0d48b`: the `deepWounds` assumption says it and what it's worth (D29); warrior §2.5 and Q21 and rogue Q8 note that the two assume opposite rules; open-questions.md gets B79, the in-game test, among the first High entries |
| PC-7 | low | introduced (test) | "Every damage row has a count" covered five specs and the unit pinning eleven. | fixed in `8cea3c26`: both run over all 23 default specs (100 fights each, cached), with the attempts-equal-casts check per spec and the PC-1, PC-2, PC-3, PC-4 and PC-8 cases |
| PC-8 | low | pre-existing | Serpent Sting's misses didn't show: `avoidable` was set only for a magic DoT. | fixed in `8cea3c26`: a ranged DoT's application is avoidable too ("1.9% avoided"). `avoidable` is display only, so no golden moved |

Also seen: two unit tests (`hunter.test.ts`, `ranged-build.test.ts`) indexed the counters with a
literal 10 columns a row; they use `FIELD_COUNT` now. And results-states' "worker stops answering"
e2e test (from the infra slice) failed in four parallel runs of its file at a load average of
30–45, and passed alone, with one worker, and once the load fell. Its trace shows about 1 s of
real time between the worker's dispatch and `runFor(59_000)`, which the installed page clock
also counts, so the test has about 1 s of slack before the 60 s watchdog fires. Pre-existing and
load-dependent; left for the lead (a paused clock, `page.clock.pauseAt`, would remove it).

Checks after the fix round: lint, typecheck, `npm test` (the benchmarks re-run alone under the
machine's load), and the app, results-keyed, results-states, rogue, hunter, warlock,
tank-results, priest, balance, feral-bear and paladin-protection-rotation e2e specs (119
tests), all green. Screens
checked: Fury, Enhancement, Protection paladin (Damage and Threat) and Shadow priest, plus Arcane
and Beast Mastery, at 390 px dark and 1280 px light; no horizontal scroll.

Verdict: pending a verification pass by a fresh reviewer, scoped to `8cea3c26`..`07c0d48b`
(PC-1 changed the engine's counters).

## Verification pass (8cea3c26, 07c0d48b)

A fresh reviewer confirmed PC-1 to PC-8 fixed. Every default spec's DPS, TPS, counters, aura uptimes
and source, aura and spell numbering are byte-identical before and after (400 fights, seed 11); the
counter layout sizes from `FIELD_COUNT` everywhere; performance is within noise. **The gate passes:**
the fixes introduced nothing at medium or worse.

| id | sev | origin | finding | disposition |
| --- | --- | --- | --- | --- |
| PV-1 | low | introduced (PC-1) | A proc's fire whose swing becomes a queued Heroic Strike or Maul counts on the proc's row while its damage lands on the Heroic Strike's or Maul's (bear Windfury 23.9 procs beside 13.4 swings); the docs and the log's "read the same either way" didn't say so. | fixed by the lead: ux.md and the `procs` comment say it; the log's PC-1 row corrected |
| PV-2 | low | introduced (PC-6) | The `deepWounds` assumption quoted Fury's ~2% to Arms players too. | fixed by the lead: "Fury … about 2% more DPS and Arms about 1.5%" |
| PV-3 | low | the slice (missed by the first review) | On a tank's Threat view Consecration's shares had no unit, reading as shares of casts. | fixed by the lead: a row that lands more than once names its shares ("6.3% tick crit · 6.3% of ticks avoided"), on both metrics; test |
