# Review: what we take from WarriorSim (2026-09-25)

Scope: milestone M5.665 ([D36](../decisions.md#d36-what-we-take-from-warriorsim-2026-09-25)),
everything since the last push (53d7c1a0) except the item tooltips (their own log) and Power
Infusion (its own section below):

- **W1** (merge 84a2612e): Deep Wounds rolls; Unbridled Wrath from auto attacks only; Rend's ticks
  add 0.02 × AP; Windfury's attack-power buff keeps its second charge.
- **W2** (merge 7bcf4c69, snapshots regenerated on the merged engine, D25): the ranks trainers
  teach before Ahn'Qiraj, for every class and the buff catalogue.
- **W3** (merge 7b54ef72): Skyborne warriors and hunters on a class-row placeholder (D24).
- **W5** (merge 958b4e22): Gift of Arthas as a boss debuff.
- **W4** (merge ac3c4527): the warrior defaults re-tuned.
- The fix commits named below.

Reviews: a logic and a UX review of W1–W3 at 7bcf4c69; a logic and a UX review of W5; a logic and a
UX review of W4; a verification pass over the W1–W3 and W5 fixes; a verification pass over the W4
fixes. Every reviewer was fresh.

## Logic review, W1–W3

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| DL-1 | low | introduced | threat.md's Revenge row still said "+270" for the engine; the code uses rank 5's +243. | Fixed, eb29aacd and 82def2b4. |
| DL-2 | low | introduced | Unbridled Wrath cited 12319 (Flurry) for its proc mask; it's 12322. | Fixed, 94014377. |
| DL-3 | low | introduced | The ranks below 60 added their per-level term untruncated (Frostbolt r10 +11.6), against items.md's rule. | Fixed, 347be8c4: `atLevel60` truncates; it also brought older paladin, priest, shaman and warlock values in line with their tooltips (moves under 0.2%). |
| DL-4 | low | introduced | The Deep Wounds assumption said "rolls" under Classic Era rules too. | Fixed, 3bc94dfb: gated on `combat.deepWoundsRolls`. |
| DL-5 | low | introduced | Windfury Totem's summary described the old behaviour. | Fixed, bf47c2cf, then reworded in 05451801 (G5U-7). |
| DL-6 | low | introduced (scope) | D36's Gift of Arthas wasn't built in W2. | Built as its own slice, W5. |
| DL-7 | info | introduced, explained | Fury and Arms sit 21–27% over the next DPS spec and 40–48% over Combat rogue (D29). | Not a bug: W1's pool matches D36 and §2.5 point by point. The gap is the rolling Deep Wounds (about 14% of warrior damage; WarriorSim's own fixture has 12.1%) and the execute phase, and is written up in warrior.md §5.2. It rests on [?] B79, whose web evidence (a BlizzCon stream, the client's SoD spells, a beta log) all points to rolling; recorded in b977ca6a. The user accepted shipping on the current data. |

## UX review, W1–W3

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| DU-1 | medium | introduced | Every result moves but there was no release entry, and Coming soon promised what main already had. | Fixed at the push: the release entry, and the roadmap entries leave Coming soon. |
| DU-2 | low | introduced | "Sharper warrior numbers" covers a change to every class. | Fixed at the push: the release entry groups by spec. |
| DU-3 | low | introduced | Coming soon's Deep Wounds line claimed more certainty than the `[?]` has. | Fixed at the push (the entry leaves Coming soon; the release wording is careful). |
| DU-4 | low | introduced | The Deep Wounds assumption was long, jargon-heavy and named SoD. | Fixed, 9f3ae4a1; its cost figure re-measured in e16e4144 (V36-2). |
| DU-5 | low | introduced | Unbridled Wrath's and Windfury's assumptions used internals and repeated "untested". | Fixed, 9f3ae4a1. |
| DU-6 | low | pre-existing, now seen by every Skyborne warrior and hunter | "the class row" in player text. | Fixed, 9f3ae4a1. |
| DU-7 | low | introduced | The poison assumption said the guild measured rank IV. | Fixed, 9f3ae4a1. |
| DU-8 | low | introduced | Nothing told players about the pre-AQ ranks. | Fixed, 663ec251: the `preAqRanks` assumption. |
| DU-9 | low | pre-existing | A refused setup read "This run didn't finish", with no way to Gear. | Fixed, fa8e9072: the right words and an Open Gear button to the Ranged slot. |
| DU-10 | low | pre-existing | "No ranged weapon" wrapped in the wide sheet. | Fixed, fa8e9072: "None". |
| DU-11 | low | introduced | Windfury Totem's summary. | Same as DL-5. |
| DU-12 | low | introduced | W1 and W2 unticked in milestones. | Fixed, 88990935. |

## W5 (Gift of Arthas)

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| G5L-1 / G5U-2 | low | introduced | Demonology with the Imp or no demon listed the +8 in the results while the Buffs tab said "Not used". | Fixed, f0a3c1a7: one shared `buffUnusedReason` rule for the tab and the plan; DPS bit-identical. |
| G5L-2 / G5U-1 | low | introduced | "A crit doubles it", and "yours and your pet's" for specs with no pet. | Fixed, f0a3c1a7. |
| G5L-3 | low | introduced | Four hit paths only checked for going up. | Fixed, 1c8cbba5: exact values. |
| G5U-3 to G5U-6 | low | introduced | The Demonology note, the summary, the heading ("Physical damage taken"), and ux.md's Buffs text. | Fixed, f0a3c1a7. |
| G5U-7 | low | introduced | Windfury Totem's summary was hard to parse. | Fixed, 05451801. |

## Verification pass over the W1–W3 and W5 fixes

Every finding fixed; nothing the fixes introduced at medium or worse. Checks: lint, typecheck, 3,705
unit tests, 192 e2e tests in 16 specs.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| V36-1 | low | introduced by 347be8c4 | The truncation rule was tagged [F]; how the client rounds is [?] (B74). | Fixed, 69cb0403. |
| V36-2 | low | introduced by 9f3ae4a1 with W4 | The Deep Wounds assumption's "13%" predates the re-tune. | Fixed, e16e4144: about 14%. |

## W4 (the re-tune)

Logic review: every headline delta reproduced on fresh seeds; the new builds are legal; Protection
keeps its survival talents (D29), with its effective-health floor held.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| W4L-1 | medium | pre-existing (D36) | The D29 outlier. | As DL-7. |
| W4L-2 | low | introduced (Fury), pre-existing (Arms) | A Rend could be cast with under 3 s of fight left. | Fixed, a372611b, for both. |
| W4L-3 | low | introduced | "Fury + Precision" was never the best build. | Fixed, d7ae0c2f: replaced by the popular 17/34/0 (better in short fights). |
| W4L-4 | low | pre-existing, flipped by W4 | Bloodthirst over Execute was one static default. | Fixed, 860045f6: from the Improved Execute table, by talents. |
| W4L-5 | low | introduced | A stale comment. | Fixed, a372611b. |
| W4L-6 | low | introduced | The Rend dance had no engine test. | Fixed, a372611b: `rend.test.ts`. |
| W4L-7 | low | introduced | The new defaults' worked values weren't pinned; tests titled "default build" pinned the old codes. | Fixed, fa5ef13f. |
| W4U-1 / W4U-4 | medium / low | introduced | Fury's Rend step didn't say why, and promised full uptime. | Fixed, a372611b. |
| W4U-2 | medium | introduced | "Fury + Precision" named an addition the default already had. | Fixed, d7ae0c2f. |
| W4U-3 | medium | introduced | No one-click way back to the popular builds. | Fixed, d7ae0c2f: 17/34/0, 37/14/0 and the earlier Protection default as presets. |
| W4U-5, W4U-6 | low | introduced | The Sunder help's wording; "more" and "less" hard-coded. | Fixed, 61cedcdf. |
| W4U-7 | low | introduced | The Rend row's summary was the longest. | Fixed, a372611b. |
| W4U-8 | low | pre-existing | Max TPS's help contradicted its numbers. | Fixed, 61cedcdf. |
| W4U-9 | low | pre-existing | Presets showed no point split. | Fixed, d7ae0c2f. |

## Verification pass over the W4 fixes

See the addendum below.
