# Warrior Protection, P1 and P2 (2026-09-23)

The first tank to ship. P1: Protection's abilities (Shield Slam, Revenge, Sunder Armor, Shield
Block, Thunder Clap and Demoralizing Shout on the spell table, Heroic Strike, Execute), the
engine support they need, and defaults tuned on TPS. P2: the D26 **Priority** choice, "Tank
duties first" (the default) or "Max TPS", and shipping: the app becomes "A DPS and TPS simulator".
Rebased onto main `cae36b7` (Feral Cat, Retribution): `9503f21`..`28d70d1`.

The default (8/5/38, all 51 points) makes 978.8 TPS and 302.4 DPS in the golden run. Max TPS drops
the three duties for about 16% more TPS and 40% more damage taken. Every other spec is
byte-identical to main, apart from the intended notes below.

## Full reviews of P1 and P2 (new work, D20)

**Logic.** The reviewer recomputed threat per landed hit by hand (Shield Slam 1,587.9, Revenge
1,328.8, Sunder Armor 1,544.7), reproduced P1's and P2's tuning exactly, and probed 0 damage taken,
boss levels, no shield, a two-hander and 30–600 s fights.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| PL1 | medium | introduced | **Max TPS kept the Buffs tab's Thunder Clap and Demoralizing Shout, credited to another warrior,** hiding what dropping the duties costs. | fixed, `28600fe`, reconciled onto main's `SpecMeta.ownBuffs`: they're the tank's own, off in every preset, and off by default when Max TPS drops them |
| PL2 | medium | introduced (D26 reading) | **Max TPS dropped Shield Slam** on an untested threat value. | fixed, `b32c487`, `63a991f`: Max TPS keeps it; its break-even (+449 threat) is in the open questions; D26's amendment |
| PL3 | medium | introduced | **Expose Armor with the rotation's Sunders was unflagged** (about 31% of TPS at stake). | fixed, `3507e52`: an assumption, the Buffs row, the Rotation help and Q35 |
| PL4 | low | introduced | **A same-millisecond ordering quirk** (±0.16%). | waived: an engine-wide change that would move every golden; recorded in §5.4 |
| PL5 | low | introduced | **Heroic Strike from 45 beat 50 in Max TPS.** | fixed, `b45094f` |
| PL6 | low | introduced | **D26's wording left gaps** (Shield Slam, the DPS rule, the duties, the Buffs tab). | fixed: D26's "How it applies" amendment |
| PL7 | low | introduced | **Without a main hand, Thunder Clap, Demoralizing Shout and Shield Slam were never used.** | fixed, `f80f755` |
| PL8 | low | introduced | **The docs cited a commit the rebase would drop.** | fixed: warrior.md cites the tag `tune/protection-p1-start`, created on `9503f21` |
| PL9 | low | introduced | **The Revenge window's "as in Classic Era" had no source.** | fixed, `de3677d` |
| PL10 | low | introduced | **No test of Shield Block pushing crushing blows off the table.** | fixed, `e8591ea` |
| PL11 | low | pre-existing | **The milestones were stale.** | fixed in this log's commit |

**UX.** The reviewer checked every Protection tab and result at 320–1280 px, light and dark,
and the app-wide copy.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| PU1 | medium | introduced | **The Priority help gave Max TPS's cost in DPS only,** not damage taken, nor when to pick it. | fixed, `573819f` |
| PU2 | medium | introduced | **Both Protection presets spent 46 of 51 points.** | fixed, `51482bb`, `b45094f`: 8/5/38, re-tuned; old codes still decode |
| PU3 | medium | introduced | **Sunder Armor and Expose Armor both showed on,** with nothing saying your Sunders then only make threat. | fixed, `3507e52` |
| PU4, PU7 | low | introduced | **Rows that can't apply stayed live** (no shield, no talent); Shield Slam's help contradicted §5.4. | fixed, `45aa2c8` |
| PU5, PU6 | low | introduced | **Damage-taken copy; boss debuffs showed no casts.** | fixed, `7f5cbf9` |
| PU8 | low | introduced | **Execute's help was hard to parse.** | fixed, `573819f` |
| PU9 | low | introduced | **Arms' Overpower assumption was reworded clumsily; the spell-table one lacked a verb.** | fixed, `2540abb` |
| PU10 | low | introduced | **"Protection (TPS)" wasn't tied to Max TPS.** | fixed, `51482bb`: "Protection + Improved Thunder Clap" |
| PU11 | low | pre-existing | **Switching the priority keeps a value you set,** so Max TPS can silently keep a duty. | known gap in the milestones |

## First verification of the fixes (D25)

Every P1 and P2 finding was fixed, and every other spec was byte-identical to main.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| PV1 | medium | pre-existing (P1's row order) | **Thunder Clap and Demoralizing Shout first landed at 22–27 s,** behind Sunder Armor's stacks: 85% uptime. | fixed, `d8c8f6f`: the duties first from the pull |
| PV2, PV4 | low | introduced (the amendment) | **The amendment's Shield Slam numbers and two phrases.** | fixed in the amendment |
| PV3 | low | introduced | **The bear's and paladin's presets had a warrior tank's Thunder Clap and Demoralizing Shout,** against the amendment. | fixed, `c3f5be1` |
| PV5, PV6 | low | introduced | **Better Heroic Strike and dump settings existed.** | fixed, `d8c8f6f` |
| PV7 | low | introduced | **The no-main-hand notes contradicted each other.** | fixed, `ab0460d` |

## Second verification (D25), and a simpler rule (CLAUDE.md step 6)

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| PW1 | medium | introduced | **Thunder Clap refreshed at 3 s couldn't retry a miss** before the slow fell off (97.6% uptime). | fixed, `28d70d1`, by a simpler design: see below |
| PW2 | low | pre-existing | **The cited tag didn't exist.** | fixed: `tune/protection-p1-start` created on `9503f21` and pushed |
| PW3 | low | introduced | **Two phrases in the amendment.** | fixed in the amendment and §5.4 |
| PW4 | low | introduced (PV3) | **The bear's `maintainDemoRoar` note assumed a warrior's Shout.** | handed to the bear's slice, which makes Demoralizing Roar a duty |
| PW5 | low | pre-existing | **Retribution's no-main-hand note had to survive the rebase.** | fixed in the rebase: `noWeaponSpells` kept |
| PW6 | low | pre-existing | **Without a main hand, notes about swings that never happen still show.** | known gap in the milestones |

Two rounds in a row found new problems in tuned duty timing (PV1, PW1), so per step 6 the lead
proposed a simpler design and **the user chose it**: duty timing follows one fixed rule and is
never tuned. The duties come first; a duty with a cooldown is used when it's ready; a debuff is
refreshed from its own cooldown, or from one global cooldown if it has none (Thunder Clap from
6 s, Demoralizing Shout from 1.5 s). Only the threat abilities are searched. Against tuned timing
it costs 2.25% of TPS and 3.3% of DPS, and saves 2.85% of damage taken (seed 9102); Thunder Clap is
up 99.0%. D26's amendment records the rule for every tank.

## Final verification of the rebase and the rule (D25)

**The gate passes.** Fury, Arms, the cat and Retribution are byte-identical to main (Fury's and
Arms' no-main-hand note now reads in PV7's words); the bear and Protection paladin previews change
only through PV3's presets. A cast trace shows the rule applied: Thunder Clap at 0 s and
Demoralizing Shout at 1.5 s, refreshed with 6.00 s and 1.50 s left and never earlier, and Shield
Block every 5 s. On a fresh seed the rule costs 2.24% of TPS and 3.30% of DPS and saves 2.84% of
damage taken; Max TPS is +15.5% TPS and +39.7% damage taken; the threat-only search moves nothing.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| PX1 | low | introduced | **"A duty that has a cooldown is used when it's ready" also covered Thunder Clap,** which the next clause refreshes. | fixed, `6e21302` and the amendment: a duty that isn't a debuff is used when ready; a debuff, with or without a cooldown, is refreshed |
| PX2 | low | introduced | **§5.4 left out the rule's 3.3% of DPS.** | fixed, `6e21302` |
| PX3 | low | introduced | **Two lines weren't re-wrapped.** | fixed, `6e21302` and the amendment |

A quick fresh check of `6e21302` and the amendment's wording passed.

Main after the fast-forward (`6e21302`): lint ✓ · typecheck ✓ · unit ✓ (1471) · e2e ✓ (272).

## Verdict

**Ready to push: yes.**
