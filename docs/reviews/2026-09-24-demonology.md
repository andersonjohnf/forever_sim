# Demonology Warlock, H3 (2026-09-24)

Demonology on the ranged and pet core, landed under D27's 90/10 mode: a demon kept out beside a
sacrificed one with Forever's Demonic Pact, its passives on you (Soul Link, Master Demonologist,
Demonic Knowledge), Demonic Energies feeding its mana from Life Tap, and Decimation's Soul Fire. The
default keeps the Succubus out with the Imp sacrificed: 492.8 DPS at review, 502.0 after the fixes
(20,000 fights on seed 2701).

## Combined review (D27)

The reviewer checked the demons' spells and the talents' curves against the 1.60 client (Firebolt,
Lash of Pain, Soul Fire, Soul Link, Master Demonologist, Demonic Knowledge, Demonic Pact, Decimation,
Demonic Energies), decoded the default build, took the default's ×1.206 over no demon apart (no
double counting: the demon reads none of your school auras), checked a swing, a Lash of Pain and a
Firebolt by hand, determinism for each demon, mana, and every screen at 390 and 1280 px, light and
dark. Nothing was blocking; two mediums.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| DM1 | medium | introduced (the text is older; this is the first default that shows it) | Improved Shadow Bolt's assumption said +20% Shadow damage taken; Demonology's default has 3/5, so the sim applies +12%. | fixed, `d9be08a`: the text is built from the plan's Shadow Vulnerability (+4% a rank); test at 3/5 and 5/5 |
| DM2 | low | introduced | The demon's spells take your Shadow Vulnerability, whose aura 270 is damage taken from you alone: +0.3 DPS (0.06%). | known gap: it needs a "from the caster only" aura flag that pet damage skips |
| DM3 | low | introduced | The swing placeholder is another creature's (the hunter's pet), which D24's emulator rule doesn't cover. | fixed, `8f8bc01`: §11.2 and Q14 cite D29 (the closest allowed analog) |
| DM4 | medium | introduced (against D29) | Inheritance was modelled as zero, though the client ships Warlock Pet Scaling (416189); Improved Imp's hidden #2 (Q19) likewise. | fixed, `8f8bc01`: D29 defaults, see below; +1.9% on the default |
| DM5 | low | introduced | "35% above the Classic Era approach (364.6)" mixed the first search's baseline and named the wrong comparison. | fixed, `8f8bc01`: §11.6 names both, +12% on Destruction's 447.6 and +35% on no demon (373.1), with the post-fix numbers |
| DM6 | low | introduced | Soul Fire's range said 486.03; the code's 487.03 is right. | fixed, `32f18af` |
| DM7 | low | introduced | demons.ts cited Q15 for the demon's mana regeneration; it's Q16. | fixed, `8f8bc01` |
| DM8 | low | introduced | The Buffs tab's armor debuffs don't say they reach only your demon's swings, and stay with no note with the Imp or no demon out. | known gap: `SpecMeta.petMelee` is per spec, and the note needs the setup's demon; the default Succubus swings |
| DM9 | low | pre-existing | "Voidwalker" touches its button's borders at 390 px (Destruction too). | known gap: wrap the four choices 2 × 2 at phone width |
| DM10 | low | pre-existing | The Destruction and Affliction sacrifice help said "Your pet itself isn't simulated yet." | fixed, `32f18af`: "This spec fights with no demon out; to keep one, see Demonology.", and the demonicSacrifice and warlockNoPet assumptions lost their "until the pet core" wording too |
| DM11 | low | introduced | Demonic Knowledge's "up to" 100% of your level wasn't examined. | fixed, `8f8bc01`: Q18 covers it, up to about 6% |
| DM12 | low | introduced | No test that the demon's spells ignore your school auras, nor of `COND.healthAtMost` at 0 and 100, nor of pet damage against a caster-only debuff. | fixed, `8f8bc01`: the first two tests; the third waits for DM2's fix (known gap) |
| DM13 | info | n/a | The branch was behind main and conflicted on the milestones. | rebased once onto `3749ad3`; the H1 tick kept |

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
is the lead's call to confirm.

## Verification pass

Due: DM4 changes engine logic. Scope: `d9be08a`, `8f8bc01`, `32f18af`.
