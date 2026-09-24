# Demonology Warlock, H3 (2026-09-24)

Demonology on the ranged and pet core, landed under D27's 90/10 mode: a demon kept out beside a
sacrificed one with Forever's Demonic Pact, its passives on you (Soul Link, Master Demonologist,
Demonic Knowledge), Demonic Energies feeding its mana from Life Tap, and Decimation's Soul Fire. The
default kept the Succubus out with the Imp sacrificed: 492.8 DPS at review, 502.0 after the fixes
(20,000 fights on seed 2701). The verification pass made the Imp build the default (531.9, DV2).

## Combined review (D27)

The reviewer checked the demons' spells and the talents' curves against the 1.60 client (Firebolt,
Lash of Pain, Soul Fire, Soul Link, Master Demonologist, Demonic Knowledge, Demonic Pact, Decimation,
Demonic Energies), decoded the default build, took the default's ×1.206 over no demon apart (no
double counting: the demon reads none of your school auras), checked a swing, a Lash of Pain and a
Firebolt by hand, determinism for each demon, mana, and every screen at 390 and 1280 px, light and
dark. Nothing was blocking; two mediums.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| DM1 | medium | introduced (the text is older; this is the first default that shows it) | Improved Shadow Bolt's assumption said +20% Shadow damage taken; Demonology's default has 3/5, so the sim applies +12%. | fixed, `4f89c7c`: the text is built from the plan's Shadow Vulnerability (+4% a rank); test at 3/5 and 5/5 |
| DM2 | low | introduced | The demon's spells take your Shadow Vulnerability, whose aura 270 is damage taken from you alone: +0.3 DPS (0.06%). | known gap: it needs a "from the caster only" aura flag that pet damage skips |
| DM3 | low | introduced | The swing placeholder is another creature's (the hunter's pet), which D24's emulator rule doesn't cover. | fixed, `e33f474`: §11.2 and Q14 cite D29 (the closest allowed analog) |
| DM4 | medium | introduced (against D29) | Inheritance was modelled as zero, though the client ships Warlock Pet Scaling (416189); Improved Imp's hidden #2 (Q19) likewise. | fixed, `e33f474`: D29 defaults, see below; +1.9% on the default |
| DM5 | low | introduced | "35% above the Classic Era approach (364.6)" mixed the first search's baseline and named the wrong comparison. | fixed, `e33f474`: §11.6 names both, +12% on Destruction's 447.6 and +35% on no demon (373.1), with the post-fix numbers |
| DM6 | low | introduced | Soul Fire's range said 486.03; the code's 487.03 is right. | fixed, `763a5e7` |
| DM7 | low | introduced | demons.ts cited Q15 for the demon's mana regeneration; it's Q16. | fixed, `e33f474` |
| DM8 | low | introduced | The Buffs tab's armor debuffs don't say they reach only your demon's swings, and stay with no note with the Imp or no demon out. | known gap at first (the default Succubus swings); fixed, `92d6e74`, once DV2 made the Imp the default |
| DM9 | low | pre-existing | "Voidwalker" touches its button's borders at 390 px (Destruction too). | known gap: wrap the four choices 2 × 2 at phone width |
| DM10 | low | pre-existing | The Destruction and Affliction sacrifice help said "Your pet itself isn't simulated yet." | fixed, `763a5e7`: "This spec fights with no demon out; to keep one, see Demonology.", and the demonicSacrifice and warlockNoPet assumptions lost their "until the pet core" wording too |
| DM11 | low | introduced | Demonic Knowledge's "up to" 100% of your level wasn't examined. | fixed, `e33f474`: Q18 covers it, up to about 6% |
| DM12 | low | introduced | No test that the demon's spells ignore your school auras, nor of `COND.healthAtMost` at 0 and 100, nor of pet damage against a caster-only debuff. | fixed, `e33f474`: the first two tests; the third waits for DM2's fix (known gap) |
| DM13 | info | n/a | The branch was behind main and conflicted on the milestones. | rebased onto `3749ad3`, then (main rewritten onto a hotfix) onto `4be3cc8` with the Hunter (H2); shas here are the second rebase's |

### DM4: the defaults

- **Inheritance** (warlock.md §11.2, Q15). The client's 416189 has slots for attack power (99),
  spell damage (13), melee and spell hit (54, 55) and crit (52, 57), every amount 0. The only allowed
  analog is the hunter's pet, reported by Forever testers to inherit 10% of the hunter's attack power
  and all of its crit. Read for a caster: 10% of your attack power and of your spell damage in the
  spell's school, and your spell crit and spell hit as the demon's crit and hit, melee and spells
  alike, with none of its own (the 5% placeholder is gone). In the default that's +13.8 attack power,
  +48.6 spell damage on Lash of Pain, 11.73% crit and 13% spell miss. Engine: two optional `PetPlan`
  shares (`critFromOwnerSpellCrit`, `hitFromOwnerSpellHit`), read in `recomputePet` with your stats.
  Intellect and mana regeneration aren't modelled: they only fill the demon's mana, which Demonic
  Energies keeps full.
- **Improved Imp's #2** (Q19, −300/−700/−1000, a dummy): taken as Firebolt's cast time in ms, as the
  client's tooltips read every dummy like it (Infusion of Light, Infusion of Souls, Field Medicine),
  so 2 s becomes 1 s at 3/3. Only the Imp is affected.
- Both are [?] assumptions in the results (`demonInherits`, `improvedImpCast`).

| 20,000 fights, seed 2701 | Before | After |
| --- | --- | --- |
| **Default: Succubus out, Imp sacrificed** | 492.8 | **502.0** (+1.9%) |
| Imp out, Succubus sacrificed / with Soul Fire | 440.3 / — | 519.8 / 531.9 |
| Felhunter out | 447.9 | 453.3 |
| No demon | 373.1 | 373.1 |

Golden (1,000 fights, seed 12345): 491.39 → 500.64 (+1.9%). No other golden moved.

**The Imp build now leads by 6%**, just over D27's ±5%, but only through Q19's reading: without it,
the Imp with the Succubus sacrificed deals 461.9, below the Succubus. The default stays on the
Succubus, which that reading doesn't touch, until the guild's test settles Q19 (warlock.md §11.6). This
is the lead's call to confirm. (Superseded by DV2: under D30 the default is the best found build, the Imp.)

## Verification pass

A fresh reviewer checked the fix commits (`4f89c7c`, `e33f474`, `763a5e7`, before the second rebase).
DM1–DM13 were confirmed fixed or dispositioned; it found DV1–DV8. The branch was then rebased onto
`4be3cc8` (main with the Hunter, D28–D30, the phone bar and the custom domain): the milestones kept
H1, H2, M5.6 and M5.7 with H3 added and ticked (M5.5 is complete), the spec lists keep the Hunter and
Demonology, `spells.json` was regenerated from the cache, and the results panel kept main's pet rows.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| DV1 | medium | introduced (ranged-and-pets.md §6's new wording) | §6 made the Hunter testers' report (10% of attack power, all crit) each class's D29 default, but the Hunter's cat still inherited nothing. | fixed, `82653cf`: `apFromOwnerHigherAp` (10% of the higher of your attack power and ranged attack power, as §6 words the report) and `critFromOwnerCrit` (your higher sheet crit, melee or ranged) in `PetDef`/`PetPlan` and `recomputePet`; the cat takes both [?]; hunter.md §6, WE-H9 and its test, the `petInheritance` and `huntersMarkLands` texts. The report names no hit, so the cat takes none of yours (hunter.md OQ-H7: +1.7% if it did), a known gap |
| DV2 | medium | introduced (against D30) | D30 makes defaults the sim's best results; the Imp out with the Succubus sacrificed and Soul Fire (531.9) beats the Succubus default (502.0). | fixed, `d0c8a00`: that's the default; §11.6 says it rests on Q19 [?] (474.3 without it, below the Succubus's 501.3) and that O4 confirms it. Improved Sayaad's 3 points do nothing with the Imp: noted for O4's talent search (known gap), not re-tuned |
| DV3 | medium | introduced | The demon's inherited crit bypassed the 1.8% aura-crit suppression a player's aura crit takes. | fixed, `82653cf`: the inherited crit joins `inputs.auraCrit` (it arrives through 416189's / 415429's #13, aura 52; combat-tables §4.4), the hunter's pet's too; §11.8 ex. 8 gains the Succubus's 9.33% on its swings |
| DV4 | low | introduced | `improvedImpCast` read as jargon. | fixed, `6f30e2e`: "Improved Imp also carries an effect its tooltip doesn't show (−0.3/−0.7/−1 s); the sim reads it as time off Firebolt's 2 s cast, so it's 1 s. Untested." |
| DV5 | low | introduced | `demonInherits` put Demonic Knowledge apart from spell damage and named melee and spells for every demon. | fixed, `6f30e2e`: built per demon, "on top of Demonic Knowledge's" beside the spell damage share, the melee share only for a swinging demon, the spell share only for one with a damage spell |
| DV6 | low | introduced | No test moved your spell crit mid-fight and checked the demon's crit. | fixed, `82653cf`: a +10% spell crit aura toggled every 20 s; the demon's melee, spell and special-table crit follow it on and off |
| DV7 | low | introduced | The log's 461.9 for the Imp with the Succubus sacrificed without Q19 didn't match the reviewer's 462.17. | 462.17 is right: the 461.9 came from a probe run on an intermediate build (its default read 501.55, not the final 502.0). Taken as a plan patch restoring Firebolt's 2 s cast, 20,000 fights on seed 2701; §11.6 now uses 462.2, and 474.3 with Soul Fire |
| DV8 | low | introduced | `demonStats` named a swing and attack power for the Imp, which doesn't swing. | fixed, `6f30e2e`: `demonStats` and `demonTable` are per demon too (mana only with a pool, the swing only for the Succubus and Felhunter, spells only for the Imp and Succubus); a test checks all three demons |

**DPS, 20,000 fights on seed 2701:**

| Spec | Before | After |
| --- | --- | --- |
| Demonology default | 502.0 (Succubus) | **531.9** (Imp, Soul Fire; DV2) |
| Demonology with the Succubus | 502.0 | 501.3 (DV3) |
| Marksmanship | 501.0 | 501.0 (Lone Wolf, no pet) |
| Beast Mastery | 485.3 | **547.7** (+12.9%, DV1 and DV3) |
| Survival | 420.9 | **454.8** (+8.1%) |

Goldens (1,000 fights, seed 12345): Beast Mastery 485.61 → 548.62, Survival 420.95 → 454.87,
Demonology 500.64 → 499.89 (DV3) → 530.79 (DV2).

## Second verification pass

Due: DV1 and DV3 change engine logic (the pet's shares and its table's aura crit), DV2 the default,
and DM8's fix the Buffs tab. Scope: `82653cf`, `d0c8a00`, `6f30e2e`, `92d6e74`.
