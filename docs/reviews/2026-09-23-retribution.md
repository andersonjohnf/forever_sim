# Retribution, C2 (2026-09-23)

The first paladin spec to ship: seals (Command, Righteousness, the Crusader's opener),
Judgement, Holy Strike, Consecration, Exorcism, Hammer of Wrath, mana potions and runes, on-use
trinkets and Juju Flurry, tuned under D23, with a mana ledger and spell stats in the results.
Built on the paladin foundation (C1), rebased onto main `c0e64c5` (Feral Cat):
`a1ece5c`..`34187a8`.

The tuned defaults beat the doc's first priority by **+7.99 DPS (+1.33%, 600.61 → 608.60, 95% CI
+7.86 to +8.11)** on a fresh seed. The review's new raid buffs (Prayer of Spirit, Arcane
Brilliance) raised mana, and the re-check adopted +1.63 DPS (+0.26%) in thresholds. The golden is
624.07 DPS. Warriors and the cat are byte-identical to main, apart from the intended changes below.

## Full reviews (new work, D20)

**Logic.** The reviewer recomputed Holy Strike, Judgement of Command, Consecration, the seal
procs and Hammer of Wrath by hand, balanced the mana ledger in every probe, ran the default and
Undead grids, and checked the long fights, where mana runs dry only in the execute phase.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| RL1 | medium | introduced | **Exorcism from 40% mana lost up to 2.6% against Undead** in cells the doc didn't report. | fixed, `84eb568`: back to 20%; an execute-phase rule also lost, and both grids are in paladin.md |
| RL2 | low | introduced | **The early potion relies on knowing the fight's end, unlisted.** | fixed, `84eb568`: `knownFightEnd` in paladin wording (up to 0.37%) |
| RL3 | low | introduced | **A test's Exorcism floor was stale.** | fixed, `d072353` |
| RL4 | low | introduced | **Test gaps and a COND pin that would break on merge.** | fixed: the pin at the rebase, mana in the golden, a benchmark, an over-maximum test |
| RL5 | low | introduced | **The ledger was gated on `plan.spells`, not the class.** | fixed, `10493cb` |
| RL6, RL7 | nit | introduced | **The prepull trace's pool; a buffs doc count.** | fixed, `10493cb`, `1938c1f` |

**UX.** The reviewer checked every Retribution tab and result at 390 and 1280, light and dark,
and scanned every screen for warrior or druid words (none).

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| RU1 | medium | introduced | **An untested engine switch (Judgement of the Crusader's bonus, 7.6% of DPS) sat second on the Rotation tab.** | fixed, `3658683`: under Character → Advanced, in plain words |
| RU2 | medium | introduced | **Juju Flurry and on-use trinkets were offered but never used.** | fixed, `d072353`: rotation rows; each gains in every grid cell where it acts (`bac7550`) |
| RU3 | medium | pre-existing (broke the buffs doc's promise) | **The Standard raid had no Intellect or Spirit buff.** | fixed, `1938c1f`: Prayer of Spirit and Arcane Brilliance for paladins, with the D23 re-check |
| RU4–RU12 | low | introduced | **Seal of the Crusader's row, the ledger's lines, mana units, Exorcism and Hammer of Wrath dimming, sheet pairs, "another paladin", the inactive choice, the rune's name, a no-weapon result.** | fixed, `10493cb`, `3658683`, `d072353`, `1938c1f`, `305ef41` |

## Verification of the fixes (D25)

**The gate passes.** Every finding is fixed; the RU3 re-check reproduces on a fresh seed (+1.59,
+0.26%), and Prayer of Spirit and Arcane Brilliance change no other class.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| RV1 | low | introduced | **Weakness Analyzer's paladin note said a Seal of Command proc doesn't end its charge;** it does. | fixed, `8063f64`, with a test |
| RV2 | low | introduced | **The trinket and Juju Flurry grids weren't recorded** (D23's rule for changes that don't act in the default setup). | fixed, `bac7550` |
| RV3 | low | introduced | **Max consumables left out Juju Flurry,** which the rotation now uses. | fixed, `8e8e181` |
| RV4 | low | introduced | **Without a main hand the fight-end assumption was dropped.** | fixed, `6ae25bc`, with a test |
| RV5 | low | introduced | **Hammer of Wrath's help lacked "Needs an execute phase under Fight."** | fixed, `97697c7` |
| RV6 | low | pre-existing | **With no weapon, judgements and Hammer of Wrath show 0.0% crit.** | known gap in the milestones |
| RV7 | nit | introduced | **Ungrouped numbers in Fury's help; ux.md's ledger example.** | fixed, `c2046f0` |

## Verification of the rebase onto Feral Cat (D25)

The rebase adopted main's shared mechanisms: number fields sized to their unit (a grouped value's
box now fits "1,500 mana"), `selfCast` for the paladin's own Blessing of Might (like the druid's
Mark of the Wild), "another" for any buff your own class brings, and main's single condition 17.
The lead added `16036e9`: Self only now brings your class's self-cast buffs, as "Your own buffs"
promises.

**The gate passes.** Warriors, the cat and the bear are byte-identical to main in every preset but
Self only, where a druid now has Mark of the Wild. RV1's and RV4's tests fail without their fixes.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| RM1 | low | introduced (`16036e9`) | **The §6.2 table's new "(your own)" cells weren't in its legend.** | fixed, `34187a8`, in the reviewer's words |
| RM2 | low | introduced (`16036e9`) | **A cat setup saved on the old Self only now reads "Custom selection."** Its numbers don't change. | waived: the preset's meaning changed on purpose, to what its description says |
| RM3 | low | pre-existing | **The load warning says "needs a paladin in the raid" where the Buffs tab says "another".** | known gap in the milestones |

Main after the fast-forward (`34187a8`): lint ✓ · typecheck ✓ · unit ✓ (1419) · e2e ✓ (265).

## Verdict

**Ready to push: yes.**
