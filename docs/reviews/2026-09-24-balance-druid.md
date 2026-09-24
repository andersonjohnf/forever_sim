# Balance Druid, K6 (2026-09-24)

Balance on the caster core, landed under D27's 90/10 mode: Moonkin Form, Starfire and Wrath,
Moonfire and Insect Swarm kept up (their ticks crit in Forever), Wrath woven for Forever's Eclipse,
Nature's Grace, Vengeance, Omen of Clarity on spells, and self-Innervate. First pass: 424 DPS
(golden 426.6). The druid's caster buffs are gated per spec: Balance gets them, the ferals don't.

## Combined review (D27)

The reviewer confirmed Eclipse in the Forever 1.60 talent tree (trait 134396, spell 408248, its
values from Forever's curve 108156 and its behaviour from the Forever tooltip, not from a later
expansion), the periodic-crit flags, Nature's Grace, Vengeance and Moonfury against the client, a
Starfire and a Moonfire tick by hand, determinism, mana, the data's regeneration, and every other
spec byte for byte (the casters drop the melee hit-table note, as intended).

**The gate passes**, with no high or medium findings.

| # | Finding | Disposition |
| --- | --- | --- |
| BD1 | Clearcasting's "each spent by your next ability" is wrong for Balance. | fixed: "each spent by the next ability it makes free", for every spec |
| BD2 | Innervate at 0% silently never casts it. | fixed: the minimum is 5%, a saved 0 is raised with a warning; test |
| BD3 | An unclear "it" in the filler's note. | fixed: names "Wrath for Eclipse"; test |
| BD4 | The druid's base spell crit placeholder has no Balance effect estimate (about ±0.1%). | known gap |
| BD5 | Self-Innervate is worth about +18%; a raid often gives it to a healer. | noted in the Rotation help |
| BD6 | Dead code: a talent-group exclusion that never fires. | known gap |

## Merge check (D25)

The rebase onto the Elemental Shaman and the Shadow Priest is additive (the mana and rage flags now
follow `meta.caster`, which covers the old list), the data regenerates byte-identically from the
cache, no other golden moved, and the three fixes are right for the cat, Elemental and Balance.
**Pass.**

Main after the fast-forward (`015d08a`): lint ✓ · typecheck ✓ · unit ✓ (2210) · e2e ✓ (354, and
the tank-results phone test that flakes on main too passed 5 of 5 on rerun).

## Verdict

**Ready to push: yes.**
