# Elemental Shaman, K5 (2026-09-24)

Elemental on the caster core, landed under D27's 90/10 mode: Lightning Bolt (with rank 4 below 10%
mana: Forever's client gives it the full 0.714 coefficient), Chain Lightning on Clearcasting,
Flame Shock and Forever's Lava Burst, Lightning Overload, Elemental Focus, Mana Tide, and the
shaman's own totems. First pass: 336 DPS in the Standard raid; golden 338.0. It also unified the
Enhancement shaman's Lightning Bolt with the core (hasted, school-only gear, Totem of the Storm):
its default is unchanged, and Bolt at 3 stacks gains +0.24%.

## Combined review (D27)

The reviewer confirmed every post-Classic-looking row in the 1.60 client (Lava Burst 1238300,
Flame Shock's periodic-crit flag, Lightning Overload, Elemental Focus, Mana Tide), that rank 4's
coefficient carries no Classic Era penalty, a Lightning Bolt and a Lava Burst by hand,
determinism, Enhancement's correction, and the 14 other specs byte for byte.

**The gate passes**, with no high or medium findings.

| # | Finding | Disposition |
| --- | --- | --- |
| EL1 | The mages lose the melee notes `foreverHitTable` and `hasteNextSwing` (correct for casters), against a commit message's claim. | accepted: the change is right; noted here |
| EL2 | Mana Tide and Mana Spring share the water totem slot, unmodelled (under 0.3%). | known gap |
| EL3 | Totemic Focus should make Mana Tide cost 45, not 60. | known gap |
| EL4 | Two notes both say casting speed doesn't shorten the GCD. | known gap |
| EL5 | A comment's Chain Lightning range and a stale "Shamans: Enhancement" comment. | known gap |
| EL6 | Chain Lightning "never" clears by +0.47%. | the tuning milestone (M10) |
| EL7 | Totem of the Storm's card shows no stats, though the sim uses it. | known gap |
| EL8 | Benchmarks flake under heavy load (pre-existing). | no change |

## Merge check (D25)

The rebase onto the Warlock kept one `boostKeep` and main's warlock code; the data was regenerated
from the cache with zero requests; no golden moved; the warlocks now drop the melee notes too,
through the casters' shared flag. **Pass.**

Main after the fast-forward (`1f4d5f5`): lint ✓ · typecheck ✓ · unit ✓ (2104) · e2e ✓ (343).

## Verdict

**Ready to push: yes.**
