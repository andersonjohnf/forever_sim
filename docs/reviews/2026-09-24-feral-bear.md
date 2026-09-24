# Feral Bear, B3 and B4 (2026-09-24)

The bear tank: Maul, Mangle, Lacerate, Swipe, Demoralizing Roar and Faerie Fire on the spell
table, Berserk, Enrage, bear armor and rage from hits; its duties first by D26's fixed rule; a Max
TPS priority (B4); shipped. Every spec in the original scope is now offered.

## Full reviews of B3 (D20)

**Logic (BL1–BL9)** and **UX (BU1–BU16)**. The high and mediums:

| # | Finding | Disposition |
| --- | --- | --- |
| BL1 (high) | The default dropped Lacerate on an untested threat value. | fixed: Lacerate kept (D26's amendment); it breaks even at about +40 threat and dropping it costs 7.9% of DPS |
| BL2 | "No Enrage in combat" wasn't a measured duty. | fixed: the search decides it; Enrage in combat is on |
| BU1–BU5 | The roar row on warrior specs, roar and Shout exclusivity, a dropped duty's Buffs copy, Lacerate idle in the default raid, Lacerate's bleed uptime in the wrong table. | fixed: named rivals, `ownBuffs`, "Not used" notes, the bleed row's uptime and stacks |

Every low was fixed too (BL3–BL9, BU6–BU16), and the cat's CV1 (Clearcasting's procs line) and
Warrior Protection's PW4 (the roar as a duty).

## Reconciliation and the duty rule

The rebases folded the bear's engine pieces into main's single versions (boss debuffs, the spell
table, bleeds, `talentBuffs`, condition 20) and applied the fixed duty rule: the roar and Faerie
Fire first, refreshed from 1.5 s and 6 s. That gains +0.25% TPS against tuned timing; a new search
of the threat abilities moved nothing.

## Combined review of the fixes, the rebases and B4 (D27)

B4 adds Max TPS, which drops the roar and keeps Faerie Fire, whose threat is its own: +3.77% TPS
and +2.69% DPS for 0.45% more damage taken. Shipping moved the "unoffered spec" tests to made-up
ids and a mocked `isVisibleSpec`, since every known spec now ships.

Every other shipped spec is identical to main in its numbers. Threat per ability, the resists,
Lacerate's stacks, W14 and W19 check out; Max TPS reproduces (+3.72%).

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| BF1 | medium | Under Max TPS with the Buffs tab's roar on, the Rotation tab claimed a Shout was on the boss. | fixed, with a test: the note shows only while the rotation's roar is on |
| — | low | Warrior Protection's threat note says "stance or form"; its Demoralizing Shout row now shows only "% missed"; Max TPS results name "your" roar when it's off; the bear's swings table lists 0% parry and block; the intro says "tuned" for a first pass; Enrage's 0.16% vs 0.14%; the setup-store paths for a known-but-hidden spec lost coverage. | known gaps (D27) |
| — | low | D26's body said Max TPS "drops those duties". | fixed in D26's amendment: it drops each duty whose upkeep costs TPS |

Main after the fast-forward (`02e81b3`): lint ✓ · typecheck ✓ · unit ✓ (1583) · e2e ✓ (299).

## Verdict

**Ready to push: yes.**
