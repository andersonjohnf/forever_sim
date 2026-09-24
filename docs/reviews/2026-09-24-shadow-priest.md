# Shadow Priest, K4 (2026-09-24)

Shadow on the caster core, landed under D27's 90/10 mode: Shadowform (a fixed row), Shadow Word:
Pain, Devouring Plague (every priest in Forever), Mind Blast with Inner Focus, Mind Flay's three
ticks as a DoT channel, Shadow Weaving as the boss debuff through `schoolTaken`, Starshards for a
Night Elf, and mana (potion, rune, Dark Sacrifice). First pass: 523 DPS. It also fixed a
caster-core bug: a DoT channel ending on its last tick delivered that tick twice.

## Combined review (D27)

The reviewer confirmed every priest row against the 1.60 client, the core fix (the mage's
spell-firing channels are unaffected; 227 variants byte-identical), a Mind Blast, a Mind Flay tick
and a Shadow Word: Pain tick by hand, mana over 300 s, and the UX at 390 and 1280.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| SP1 | medium | Main moved (the Warlock) with about 41 conflicting files; both branches added Elixir of Shadow Power. | fixed at the rebase: one elixir for warlocks and priests; data regenerated from the cache |
| SP2 | low | Casters listed melee-swing notes. | fixed on main by the casters' shared flag |
| — | low | Starshards took Mental Agility's discount its client mask doesn't give; `freeCrit` not cleared on the `cast` path; priest.md's "little left" mana wording. | fixed at the rebase |
| — | low | Melee-only consumables listed for casters (Mongoose and others), pre-existing from the mage. | known gap: in Forever their crit counts for spells too |

## Merge check (D25)

The rebase kept main's warlock and elemental code, regenerated the data byte-identically, and
fixed a caster bug from the warlock slice: a caster's weapon racial lost its spell crit, so a
Dwarf priest with a mace lost 1% (`c33ca28`, with a test). No other golden moved. **Pass.**

Main after the fast-forward (`91e6834`): lint ✓ · typecheck ✓ · unit ✓ (2174) · e2e ✓ (349).

## Verdict

**Ready to push: yes.**
