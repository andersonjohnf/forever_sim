# Protection Paladin, C3 (2026-09-24)

The third tank: Seal of Fury and its absorb, Holy Shield, Swift Judgement, Holy Strike,
Consecration, Exorcism, Hammer of Wrath, Devotion or Retribution Aura, Reckoning and Redoubt,
Improved Seal of Fury's mana, and the D26 Priority choice. Rebased onto Retribution and Warrior
Protection, then shipped. The default makes 423 TPS and 231 DPS in its golden run.

## Full reviews (new work, D20)

**Logic (QL1–QL12)** and **UX (QU1–QU14)**, at `2d41e76`. The mediums:

| # | Finding | Disposition |
| --- | --- | --- |
| QL1 | Consecration from 90% mana suited only the default fight. | re-tuned after the rebase: 40%, within 0.5% of the best in every grid cell; +6.4% TPS on a fresh seed |
| QL2 | Hammer of Wrath's 1 s cast let swings run (−1.9% TPS unlisted). | fixed: the cast stops swings and holds off-GCD lines; its own note |
| QU1 | A warrior's Slam note on paladin runs. | fixed: `slamCast` is warrior-only |
| QU2 | The boss's table ignored Holy Shield. | fixed: shown with Holy Shield up and its uptime |
| QU3 | The seal help hid Seal of Fury's absorb and mana. | fixed |
| QU4 | Under Max TPS, the Buffs tab's Devotion Aura didn't say it's another paladin's. | fixed: `ownBuffs` with the shared note |
| QU5 | Righteous Fury wasn't shown. | fixed: an "Always on" row and a 100% cooldown row |
| QU6 | No mana or spell stats on the sheet. | fixed by Retribution's shared rows |

Every low was fixed as well (QL3–QL10, QL12, QU7–QU14). QL11 removed Devotion Aura from other
tanks' presets; the lead reversed it: any paladin in a raid runs an aura, so it stays in the
warrior's and bear's presets, with the reason in buffs doc §6.2.

## Combined review of the fixes, the rebase and shipping (D27)

The rebase adopted one implementation of each shared mechanism (main's mana per ability row,
`requires`, `needsCreatureType`, `needsExecutePhase`, `ownBuffs`, the Priority design) and the
fixed duty rule (Devotion Aura first, before the pull). Shipping grouped the spec switcher by
class, fixed the damage-taken copy for non-warrior specs, and moved the "unoffered spec" tests to
the bear.

**The gate passes**, with no high or medium findings. Every other shipped spec is byte-identical to
main (Retribution's plan gains one false field). The re-tune reproduces (+25.52 TPS, +6.39%).

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| CF1 | low | From the second class on, the switcher's separator sits inside each labelled group. | known gap |
| CF2 | low | C3 unticked and no log. | fixed: this log |
| CF3 | low | Full-page phone snaps draw the sticky bar mid-page (the snap tool). | no change: a capture artefact |

Main after the fast-forward (`0b658df`): lint ✓ · typecheck ✓ · unit ✓ (1515) · e2e ✓ (283).

## Verdict

**Ready to push: yes.**
