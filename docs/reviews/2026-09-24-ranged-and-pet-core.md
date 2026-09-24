# Ranged and pet core, H1 (2026-09-24)

The engine the Hunter and the Demonology Warlock build on, shipping no spec itself: a ranged
weapon slot and Auto Shot on its own timer (with its wind-up and clipping by casts), shots on the
ranged table, ranged attack power, quiver and ammo haste, and pets as a second attacker with their
own stats, swing timer, specials and Focus, owner auras reaching them through `pet*` mods, and pet
rows in the results. Documented in `docs/mechanics/ranged-and-pets.md`, from the Forever client
(Aimed Shot's 2.0 s cast, Multi-Shot's 0.5 s, their shared 6 s cooldown; quiver aura 557; the
ammo table; Steady Shot absent) and Classic Era.

## Combined review (D27)

The reviewer checked the client rows, recomputed four worked examples by hand, probed the
engine's traps (a cast inside the wind-up, a starved pet, a pet with no weapon), confirmed the
four wago.tools requests followed the documented-API rules, and every shipped spec byte for byte.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| HF1 | medium | Gear "+Attack Power" (melee and ranged in Forever) never reached ranged attack power. | fixed, `1e4fe41`, with a test |
| HF2 | medium | A pet's buff (Furious Howl) rolled against the boss and could miss. | fixed, `1e4fe41`: a `buff` kind that doesn't roll; tests |
| — | low | Pet procs rolled on your stream; ranged PPM used the empty main hand's speed; no blocker for a missing ranged weapon; a ranged item's weapon damage went to melee; two client tables weren't reproducible by the scraper; an odd field name. | fixed, `1e4fe41`, `614b9d0` |

## Verification of the fixes and the rebase onto the Balance druid (D25)

The lead rebased the branch onto the Balance druid, keeping both sides' fields and joining the
two changes to a proc's chance (Balance's per-kind branches, H1's ranged PPM speed) in `a3b468f`.

**The gate passes.** Each fix's test fails with that fix undone; the scraper reproduces the data
with 0 requests; nothing of Balance's was lost; all 19 shipped specs are byte-identical to main.
Two lows: no test yet covers pet procs gated by chance rolling on the pet's stream (handed to the
Hunter, the first spec with such procs), and `1e4fe41` doesn't compile on its own (waived: the tip
does, and only bisecting would meet it).

Main after the fast-forward (`a3b468f`): lint ✓ · typecheck ✓ · unit ✓ (2276) · e2e ✓ (355).

## Verdict

**Ready to push: yes.**
