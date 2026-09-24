# Caster core, K1 (2026-09-24)

The engine every caster DPS spec builds on, shipping no spec itself: spell hit against +3 levels,
spell crit, binary and partial resists by school, spell power and coefficients, casts with
casting speed, channels (spell-firing or DoT), spell DoTs with Forever's periodic-crit flag,
school multipliers and the boss's school vulnerability, mana hooks (`spiritRegen`,
`castingRegen`), triggers `spellLanded` and `spellTick`, condition `auraUp`, the caster sheet, and
the caster buffs and debuffs as class-only catalogue entries. Documented in
`docs/mechanics/spells.md`, with the Forever changes found in the client (DoTs can crit; top-rank
nukes have lower base damage; Improved Scorch, Winter's Chill and Shadow Weaving are the caster's
own; Curse of the Elements covers every magic school; Curse of Shadow is gone).

It was rebased onto the Enhancement Shaman and the Rogue, folding their overlapping pieces into
one implementation each (cast-time cuts, the regen share, Mental Quickness, the poisons' resist),
with every shipped spec byte-identical to main.

## Combined review (D27)

The reviewer recomputed six worked examples by hand, checked the client tables of both builds,
and probed the 8 then-shipped specs for identity.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| KF1 | medium | Shadow Weaving was documented as the priest's own buff; the client puts it on the boss (aura 270), as Improved Scorch. | fixed, `01efe0a`: a boss debuff counting only the caster's damage, via `schoolTaken`; test |
| KF2 | medium | A channel's own aura was never applied, though §8 promised it for Evocation. | fixed, `f87aefb`: up while the channel runs, down when it's cut; tests |
| — | low | Nested procs shared their school and source (L2). | fixed, `f87aefb`, with a test |
| — | low | Missile-by-missile `spellLanded` (L1), the `rageTicks`/`dotTicks` naming (L3), binary resists and `cannotCrit` on ticks (L6). | documented in spells.md |
| — | low | Winter's Chill's scope (L4); the sheet's lowest-school "Spell damage" (L5). | handed to the Mage slice; known gap |

## Verification of the fixes and the rebases (D25)

**The gate passes.** Each fix's test fails with the fix broken. The Rogue's poisons read their
school through the core with no number moving; the rogue specs and three others are byte-identical
to main. Two lows: the buffs doc still called Shadow Weaving a self-buff, and the channel aura's
removal is a guard. Both fixed in `d136526`.

Main after the fast-forward (`d136526`): lint ✓ · typecheck ✓ · unit ✓ (1853) · e2e ✓ (320).

## Verdict

**Ready to push: yes.**
