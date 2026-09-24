# Tank quick fixes: the Protection paladin (T2) and the bear (T3) (2026-09-24)

M5.6's quick fixes for the two tanks the guild found low (D28, D29): T2 gave the Protection paladin
its own Judgement of the Crusader opener, the caster enchants, food and oil, Seal of Fury's seal
value, Holy Strike's flat damage, Hammer of the Righteous, and an interim threat set and build; T3
gave the bear Lacerate's threat, Idol of Brutality, Thorns and Thick Hide, and its interim threat
set and build. Both sets keep D30's effective-health floor. Each had a full logic and UX review,
at `cc88b891`; this log records both and the fix round that answered them.

Reviewers: T2 and T3 each by a fresh reviewer who wrote neither change; the fix round by its own
agent, for a verification pass by a fresh reviewer (D25). Probes: `.cache/probes/t2-review/`,
`.cache/probes/t3-review/`, and the fix round's `.cache/probes/fix/` in its worktree.

## T2 review (the Protection paladin)

Blocking: T2R-1 and T2R-2 (medium, introduced). Confirmed: the headline (810.83 TPS, 434.19 DPS,
898.6 damage taken a second), each source's share by hand, Judgement of the Crusader counted once,
the opener, Retribution moving only by Holy Strike's damage, the seal value, the interim build
(+3.2% against the popular one), Alliance's effective health (90.6%), the edge cases, and the
screens at 390 and 1280 px, light and dark.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| T2R-1 | medium | introduced | Seal of Fury's proc 20418 and Seal of Righteousness's 25713 carry identical client data (base 35, coefficient 0.1; Classic Era's 25713 had 0, and rank 1's proc went 0 → 4), but the sim added Seal of Fury's seal value to its 35 and left Seal of Righteousness's 35 out, so the Seal help's "does better only with a two-hander" and paladin.md's "loses 10%" rested on it. | fixed in `303f6a79`: both procs read the same way, the 35 plus the seal value [?], guild test T1 on both seals; worked example 6 (123.96 two-handed), open questions 4 and 10, B20 and B67, the help and paladin.md's figures follow; the known gap goes. No golden moves: neither default casts Seal of Righteousness. Seal of Righteousness now loses 5.0% of TPS with the default axe (11.2% before), 4.4% with a 2.8 s one-hander, and wins by 3.1% only with a two-hander (no shield, 587 TPS); Retribution's Seal of Righteousness in Seal of Command's place −4.9% DPS (−8.2% before) |
| T2R-2 | medium | introduced | A Horde (Undead) paladin can't wear the Alliance Lamellar pieces (23272/73/75/77) and fell back to the pre-raid list's survival picks: 89.0% of v1's effective health, under the floor, and 729.2 TPS (−10%). | fixed in `45d17a3b`: Horde picks in those slots (no Horde Lamellar twin exists), chosen by measured threat within the floor; the floor's unit test covers all three paladin races (see [the paladin's numbers](#the-paladins-defaults-after-the-fix-round)) |
| T2R-3 | low | introduced | Stale copy: the Holy Shield help's "about a quarter of your threat" (now 13%); paladin.md's "Holy Shield is still the first GCD at the pull" (the opener makes it Seal of Fury, then Holy Shield at 1.5 s, worked example 25); paladin.md's threat shares and open question 16's "28%" were C3's, undated. | fixed: the help says "about a seventh" (`303f6a79`); paladin.md's shares, the "not duties" figures, the pull's first global cooldown and open question 16 are measured again after the fix round and dated (`fdf81f14`, `c5db3beb`) |
| T2R-4 | low | introduced | The Protection JotC-rule help (Character → Advanced) left out Hammer of the Righteous, which gets the full +161 under "All of it" and none by coefficient. | fixed in `fdf81f14` |
| T2R-5 | low | introduced | The talent preset "Protection (popular build)" broke the plain naming beside "Protection default" (TU10, docs/ux.md "Talents"). | fixed in `c5db3beb`: "Protection popular build"; both paladin e2e tests follow |
| T2R-6 | low | pre-existing | Nightfin Soup and the wizard oils are in Elemental's and the mages' presets but no warlock, Shadow Priest or Balance preset; buffs §6.3 differs across casters. | known gap (`fdf81f14`): each is a Buffs switch those specs can turn on; aligning the presets moves every caster golden, so it waits for the consumables' own review or the optimizer's. It breaks no promise: §6.3 lists those presets as they are |
| T2R-7 | low | pre-existing | paladin.md said Hammer of the Righteous's target field is 3 in Forever; the client has 4 on effect 0, 3 on effect 1 and 4 on effect 2, and the tooltip says "up to 3 additional". | fixed in `fdf81f14` |

## T3 review (the bear)

Nothing blocking; three mediums. Confirmed: Lacerate's +261 (4.5 × spell level, every landed
application, never its ticks), W20, Sunder by profile, the idol's mask (W21), Thick Hide (W22),
Thorns (22 × 0.94 a landed swing, no crit, the tank's multipliers), the floor at 90.3% for all four
bear races, the faction twins, the paladin's Alliance defaults unchanged, Max TPS (+3.1%),
determinism, and the screens at 390 and 1280 px.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| T3R-1 | medium | introduced | Plausibility (D29): the bear's 1,081.9 TPS is 20% above the guild's 800–900 and 10.5% above the warrior's 978.7, almost all from gear: the warrior still wore its v1 list. On the gear review's threat set the warrior makes 1,132.5 (at 85.3% of its v1 effective health); like for like, bear ≈ warrior. | fixed on its own branch, M5.6 T4 (`935f11b6`, `afe0bc5f`, reviewed there): the warrior's interim threat set at the same 90% floor, 1,123.32 TPS in its golden run (1,132.88 with this round's Thorns) |
| T3R-2 | medium | introduced | Thorns was only in the bear's raid preset (`buffs.ts` `presets.raid: ['druid-feral-bear']`, asserted by `index.test.ts`), though a raid druid puts it on the main tank: a known effect left at zero (D29), tilting the bear against the others by about 1%. | fixed in `f4b6cb0d`: every tank's raid and max presets, as Devotion Aura (with a druid in the raid); dungeon and Self only keep it for the bear. Goldens: warrior 1,123.32 → 1,132.88 TPS (+9.56), paladin 809.18 → 818.32 (+9.14, on T2's talents) |
| T3R-3 | medium | introduced (rebase) | milestones.md had two M5.6 sections. | fixed on main in `d1395bab` |
| T3R-4 | low | introduced | The paladin's Thorns figure (+7.3, +1.7%) was pre-T2; +9.1 (+1.1%) now. | fixed on main in `d1395bab` |
| T3R-5 | low | introduced | druid.md's table said Lacerate out costs 15% and 16%; measured 12.3% and 13.8%. | fixed on main in `d1395bab` |
| T3R-6 | low | introduced | The bear's On-use help didn't name the Manual Crowd Pummeler. | fixed on main in `d1395bab` |
| T3R-7 | low | introduced | The Gear tab said the bear "Starts as … pre-raid best in slot", but its default is the measured threat set (the paladin's too since T2). | fixed in `af3ff53c`: the three tanks' Gear tab says "Starts as the Protection Paladin threat set: pre-raid items measured for threat, keeping an effective-health floor", and its menu "Equip the threat set"; DPS specs unchanged; docs/ux.md "Gear" and an e2e. The copy doesn't call the set temporary, since the app never describes itself so (CLAUDE.md) |
| T3R-8 | low | introduced (merge) | Stray blank lines in defaults.ts. | fixed on main in `d1395bab` |
| T3R-9 | low | pre-existing (T2's known gap) | The Horde (Undead) paladin missed the floor (0.889, 729.5 TPS against 811.2). | fixed with T2R-2 |

## The fix round's other change: the paladin's talents under D30's floor

The user settled D30's survival floor during the round: Anticipation 5/5 and Deflection 5/5 for a
warrior and a paladin, Feral Swiftness 2/2 for a bear, with each class's cuts to defensive
cooldowns (the paladin's Sacred Duty 2, Templar's Bulwark and Holy Shield, and Improved Righteous
Fury 3), and Toughness optional. T2's build had traded Anticipation for Conviction, so the round
compared about 45 builds that keep the floor (paired, same-seed runs, 40,000 fights on seed 777,
the balanced objective Δ TPS % + Δ DPS %; paladin.md "The interim talents") and adopted
`-0530513321301551-50215` (0/38/13): +0.51% TPS and +0.94% DPS against T2's build on a fresh seed
(100,000 fights), for 6.1 more damage taken a second (`c5db3beb`). The warrior's default
(Anticipation 5, Deflection 5, Toughness 1) and the bear's (Feral Swiftness 2) already meet it.

## The paladin's defaults after the fix round

20,000 fights on seed 12345 (`.cache/probes/fix/base-after.txt`):

| Race | TPS | DPS | Damage taken a second | Effective health (share of v1's) |
| --- | --- | --- | --- | --- |
| Human (default) | 823.6 | 446.8 | 904.8 | 12,543 (90.4%) |
| Dwarf | 822.5 | 446.3 | 908.0 | 12,606 (90.5%) |
| Undead (Horde) | 787.2 | 429.0 | 909.7 | 12,577 (90.6%) |

Before the round: Human 810.8 TPS and 434.2 DPS at 90.6%, Undead 729.4 and 390.3 at 88.9%. Against
the other tanks on the same seed: the warrior 1,133.3 TPS (1.38× the paladin), the bear 1,081.7.
Retribution is unchanged (631.7 DPS): its default casts Seal of Command. In the golden runs: the
paladin 809.18 → 821.34 TPS (Thorns +9.14, the talents +3.02), the warrior 1,123.32 → 1,132.88.

Also found in the round: with the new build, Hammer of the Righteous in Holy Strike's place loses
0.39% of TPS but gains 1.24% of DPS, for 4.3% more damage taken. D23's TPS-first rule keeps Holy
Strike; D28's Balanced rotation, which the paladin doesn't have yet, would weigh it again
(paladin.md, T2's re-check). `scripts/tune/rotation.mjs` doesn't validate a `talents=` build, so a
52-point typo ran without complaint (it was caught and dropped by hand).

Checks at `45d17a3b`: lint ✓ · typecheck ✓ · unit ✓ (2,456) · e2e ✓ (373). Screens: the
paladin's Gear tab at 1280 px light and 390 px dark with its menu open.

## Verdict

Awaiting the verification pass (D25), scoped to the fix commits.
