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
| DM1 | medium | introduced (the text is older; this is the first default that shows it) | Improved Shadow Bolt's assumption said +20% Shadow damage taken; Demonology's default has 3/5, so the sim applies +12%. | fixed, `0b9d827`: the text is built from the plan's Shadow Vulnerability (+4% a rank); test at 3/5 and 5/5 |
| DM2 | low | introduced | The demon's spells take your Shadow Vulnerability, whose aura 270 is damage taken from you alone: +0.3 DPS (0.06%). | known gap: it needs a "from the caster only" aura flag that pet damage skips |
| DM3 | low | introduced | The swing placeholder is another creature's (the hunter's pet), which D24's emulator rule doesn't cover. | fixed, `b61a797`: §11.2 and Q14 cite D29 (the closest allowed analog) |
| DM4 | medium | introduced (against D29) | Inheritance was modelled as zero, though the client ships Warlock Pet Scaling (416189); Improved Imp's hidden #2 (Q19) likewise. | fixed, `b61a797`: D29 defaults, see below; +1.9% on the default |
| DM5 | low | introduced | "35% above the Classic Era approach (364.6)" mixed the first search's baseline and named the wrong comparison. | fixed, `b61a797`: §11.6 names both, +12% on Destruction's 447.6 and +35% on no demon (373.1), with the post-fix numbers |
| DM6 | low | introduced | Soul Fire's range said 486.03; the code's 487.03 is right. | fixed, `c26828c` |
| DM7 | low | introduced | demons.ts cited Q15 for the demon's mana regeneration; it's Q16. | fixed, `b61a797` |
| DM8 | low | introduced | The Buffs tab's armor debuffs don't say they reach only your demon's swings, and stay with no note with the Imp or no demon out. | known gap at first (the default Succubus swings); fixed, `16264de`, once DV2 made the Imp the default |
| DM9 | low | pre-existing | "Voidwalker" touches its button's borders at 390 px (Destruction too). | known gap: wrap the four choices 2 × 2 at phone width |
| DM10 | low | pre-existing | The Destruction and Affliction sacrifice help said "Your pet itself isn't simulated yet." | fixed, `c26828c`: "This spec fights with no demon out; to keep one, see Demonology.", and the demonicSacrifice and warlockNoPet assumptions lost their "until the pet core" wording too |
| DM11 | low | introduced | Demonic Knowledge's "up to" 100% of your level wasn't examined. | fixed, `b61a797`: Q18 covers it, up to about 6% |
| DM12 | low | introduced | No test that the demon's spells ignore your school auras, nor of `COND.healthAtMost` at 0 and 100, nor of pet damage against a caster-only debuff. | fixed, `b61a797`: the first two tests; the third waits for DM2's fix (known gap) |
| DM13 | info | n/a | The branch was behind main and conflicted on the milestones. | rebased onto `3749ad3` (since rewritten out of main), then onto `4be3cc8` with the Hunter (H2), and last onto `9d96152` (DV2-5); every sha in this log is the last rebase's |

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

A fresh reviewer checked the fix commits (`0b9d827`, `b61a797`, `c26828c`).
DM1–DM13 were confirmed fixed or dispositioned; it found DV1–DV8. The branch was then rebased onto
`4be3cc8` (main with the Hunter, D28–D30, the phone bar and the custom domain): the milestones kept
H1, H2, M5.6 and M5.7 with H3 added and ticked (M5.5 is complete), the spec lists keep the Hunter and
Demonology, `spells.json` was regenerated from the cache, and the results panel kept main's pet rows.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| DV1 | medium | introduced (ranged-and-pets.md §6's new wording) | §6 made the Hunter testers' report (10% of attack power, all crit) each class's D29 default, but the Hunter's cat still inherited nothing. | fixed, `aaeadca`: `apFromOwnerHigherAp` (10% of the higher of your attack power and ranged attack power, as §6 words the report) and `critFromOwnerCrit` (your higher sheet crit, melee or ranged) in `PetDef`/`PetPlan` and `recomputePet`; the cat takes both [?]; hunter.md §6, WE-H9 and its test, the `petInheritance` and `huntersMarkLands` texts. The report names no hit, so the cat takes none of yours (hunter.md OQ-H7: +1.7% if it did), a known gap |
| DV2 | medium | introduced (against D30) | D30 makes defaults the sim's best results; the Imp out with the Succubus sacrificed and Soul Fire (531.9) beats the Succubus default (502.0). | fixed, `21b6348`: that's the default; §11.6 says it rests on Q19 [?] (474.3 without it, below the Succubus's 501.3) and that O4 confirms it. Improved Sayaad's 3 points do nothing with the Imp: noted for O4's talent search (known gap), not re-tuned |
| DV3 | medium | introduced | The demon's inherited crit bypassed the 1.8% aura-crit suppression a player's aura crit takes. | fixed, `aaeadca`: the inherited crit joins `inputs.auraCrit` (it arrives through 416189's / 415429's #13, aura 52; combat-tables §4.4), the hunter's pet's too; §11.8 ex. 8 gains the Succubus's 9.33% on its swings |
| DV4 | low | introduced | `improvedImpCast` read as jargon. | fixed, `1b0fc9a`: "Improved Imp also carries an effect its tooltip doesn't show (−0.3/−0.7/−1 s); the sim reads it as time off Firebolt's 2 s cast, so it's 1 s. Untested." |
| DV5 | low | introduced | `demonInherits` put Demonic Knowledge apart from spell damage and named melee and spells for every demon. | fixed, `1b0fc9a`: built per demon, "on top of Demonic Knowledge's" beside the spell damage share, the melee share only for a swinging demon, the spell share only for one with a damage spell |
| DV6 | low | introduced | No test moved your spell crit mid-fight and checked the demon's crit. | fixed, `aaeadca`: a +10% spell crit aura toggled every 20 s; the demon's melee, spell and special-table crit follow it on and off |
| DV7 | low | introduced | The log's 461.9 for the Imp with the Succubus sacrificed without Q19 didn't match the reviewer's 462.17. | 462.17 is right: the 461.9 came from a probe run on an intermediate build (its default read 501.55, not the final 502.0). Taken as a plan patch restoring Firebolt's 2 s cast, 20,000 fights on seed 2701; §11.6 now uses 462.2, and 474.3 with Soul Fire |
| DV8 | low | introduced | `demonStats` named a swing and attack power for the Imp, which doesn't swing. | fixed, `1b0fc9a`: `demonStats` and `demonTable` are per demon too (mana only with a pool, the swing only for the Succubus and Felhunter, spells only for the Imp and Succubus); a test checks all three demons |

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
and DM8's fix the Buffs tab. Scope: `aaeadca`, `21b6348`, `1b0fc9a`, `16264de`. A fresh reviewer
confirmed DV1–DV8 fixed or dispositioned, every check green (the speed benchmarks pass rerun alone),
Beast Mastery's 547.7 and Demonology's 531.9 explained by cited mechanics, and the rebase's
resolutions. It found one medium and seven lows.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| DV2-1 | medium | introduced (DV1) | The cat inherited attack power and crit but no hit, though its aura (415429) has the hit slots and §11.2 gave the demon's identical slots hit beside crit by D29's rule: the report is silent on hit, not zero. +1.7% on Beast Mastery and Survival. | fixed, `7f89972`: the user's one inheritance rule for every pet (third round, below); the cat takes your higher hit, melee or ranged |
| DV2-2 | low | introduced (DV1) | The Hunter's Mark leak was "under 0.1%"; toggling the mark moves the pet's damage 0.22% of Beast Mastery's and 0.15% of Survival's. | fixed, `7f89972`: "about 0.2%" in hunter.md §6 and the milestones, re-measured under the new rule (0.22%, 0.15%) |
| DV2-3 | low | introduced (DV1, DV5) | `petInheritance` and `demonDetails` read as if the boss suppresses all the inherited crit; it's 1.8% of it. | fixed, `7f89972`: one `petInheritance` text for both classes, "…so against a raid boss its physical attacks lose 1.8% of that crit, as yours do"; `demonInherits` is gone |
| DV2-4 | low | introduced (DV2) | Only one point can leave Demonology's tiers (Demonic Pact needs 30, the build had 31); Improved Sayaad's 3rd point to Improved Shadow Bolt 4/5 measures 531.92 → 534.22. | fixed, `4e65b1f`, `8884289`, `11a5f1e`: D30 makes it the default, `-0325003221120001351-0450305003` (0/31/20), validated and stored (`stored-builds.json`); 534.22 re-measured; §11.6's table re-measured on it, the milestones and the golden (530.79 → 533.08) |
| DV2-5 | low | introduced (the rebase) | Every sha in this log was gone from the branch, and DM13's base was stale. | fixed: rebased once onto local `main` (`9d96152`, with the tank quick fixes; no conflicts), then every sha here refreshed to the final ones |
| DV2-6 | low | introduced (DV2) | The DM2 known gap described the Succubus's Lash of Pain though the default Imp's Firebolt takes none of it. | fixed, `4e65b1f`: "with the Succubus out", at +16% for Improved Shadow Bolt 4/5 |
| DV2-7 | low | pre-existing (OQ-8), now material | Beast Mastery keeps Classic Era's Battle Shout on the cat, though the testers' page says pets can't receive external buffs: 4.3% of its damage. | fixed, `7f89972`: hunter.md §6 and OQ-H7, the core's OQ-8 and the milestones give it, 24.6 DPS (4.4%) under the new rule; Beast Mastery still leads Marksmanship without it (532.6 against 501.0) |
| DV2-8 | low | pre-existing | `masterDemonologist` said "the Succubus's swings don't get it" with the Imp out, and the DM8 e2e didn't cover no demon. | fixed, `414d755`: built per demon (unit test for all four), and the e2e picks no demon and checks the lock and its reason |

## Third round: one inheritance rule for every pet

**User decision** (2026-09-24, under CLAUDE.md step 6): two review rounds in a row found
pet-inheritance problems in the per-class special cases (the demon's reading for a caster, then the
cat without hit), so they're replaced by one shared rule, stated once in
[ranged-and-pets.md §6.1](../mechanics/ranged-and-pets.md#61-what-a-pet-inherits-from-you): a pet
inherits **10% of your attack power** (the higher of melee and ranged), **10% of your spell damage in
its spell's school** (for a pet with a damage spell), **your crit** (the higher of your melee and
ranged crit on its swings and specials, your spell crit on its spells) and **your hit** (the same
split), all [?] from the Forever testers' report until the guild tests it. The aura-crit suppression
stays on its physical attacks only (combat-tables §4.4).

- **Engine** (`7f89972`): the seven per-class `PetDef`/`PetPlan` shares became one `PetPlan.inherit`,
  filled from `PET_INHERITANCE` in the pet core for every pet and read in `recomputePet`;
  `PET_INHERITS` and `DEMON_INHERITS` are gone. The cat now takes your hit (DV2-1); the Succubus's and
  Felhunter's swings take your melee crit and hit (9.65% and 2% in the default setup) instead of your
  spell crit and hit; the Imp is unchanged.
- **Docs**: §6.1 is the single place; hunter.md §6 and warlock.md §11.2 point to it. Worked examples
  as unit tests: the cat (WE-H9, now with its 2% miss) and the Succubus (§11.8 ex. 8: 7.25% on its
  swings against the boss, 6% miss).
- **Texts**: one `petInheritance` assumption, worded per pet by `petInheritanceDetail` (DV2-3).
- Then DV2-2 to DV2-8 above, and the rebase (DV2-5).

**DPS, 20,000 fights on seed 2701** (before: the second verification's head; after: this round,
rebased):

| Spec | Before | After |
| --- | --- | --- |
| Demonology default (the Imp) | 531.9 | **534.2** (+0.4%, DV2-4; the shared rule doesn't touch the Imp) |
| Demonology with the Succubus | 501.3 | 502.2 (499.5 from its swings' melee crit and hit, then +DV2-4's point) |
| Beast Mastery | 547.7 | **557.1** (+1.7%, the cat's hit) |
| Survival | 454.8 | **462.4** (+1.7%) |
| Marksmanship | 501.0 | 501.0 (Lone Wolf, no pet) |
| Destruction | 447.6 | 447.6 |
| Affliction | 402.0 | 402.0 |

Goldens (1,000 fights, seed 12345): Beast Mastery 548.62 → 557.81, Survival 454.87 → 462.47,
Demonology 530.79 → 533.08 (DV2-4); every other golden unchanged.

**Due:** a verification pass scoped to `7f89972` (engine logic: the shared rule) with `4e65b1f`,
`414d755`, `8884289` and `11a5f1e`.
