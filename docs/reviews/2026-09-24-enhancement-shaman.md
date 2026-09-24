# Enhancement Shaman, S1 (2026-09-24)

The first spec landed under D27's 90/10 mode: Stormstrike (Forever: your own next spell +20%),
Windfury Weapon (20%, 1.5 s internal cooldown, 2 attacks at +333 AP, and it turns off your own
Windfury Totem), Earth and Frost Shock, Lightning Bolt at 5 Maelstrom stacks, Flurry, mana, and
its totems as its own buffs. First-pass defaults: the Classic Era priority adapted to Forever,
with a quick search; 556 DPS in the golden run. Rebased onto main `502bf93`.

## Combined review (D27)

The reviewer checked the Forever values against the client tables (Stormstrike, Earth Shock,
Lightning Bolt, Windfury Weapon, Flurry, Maelstrom Weapon and the talents), recomputed a white hit,
a Stormstrike, a Windfury attack and an Earth Shock by hand, and confirmed determinism, the 7
other goldens, and the UX at 390 and 1280, light and dark.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| SF1 | medium | The Dungeon group left out the shaman's own totems that Self only brought (−10.2%). | fixed, `98b3e6b`, with a test |
| SF2 | medium | Earthstrike's shared on-use now works for every spec that wears it (+1.4–2.6%), but their help said only Weakness Analyzer was simulated. | fixed, `98b3e6b`: the help and class docs name it |
| — | low | Rockbiter with Windfury Totem sims +3.6% (untested pairing); the imbue help's +653 vs 783.6 with Elemental Weapons; the Dwarf and Skyborne base rows are derived; the "16361" link is inferred; the cache regeneration's source-tag drift (pre-existing). | known gaps (D27) |

Neither fix touches the engine, so no verification pass (D27).

Main after the fast-forward (`98b3e6b`): lint ✓ · typecheck ✓ · unit ✓ (1683) · e2e ✓ (305).

## Verdict

**Ready to push: yes.**
