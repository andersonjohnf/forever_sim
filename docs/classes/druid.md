# Druid: Feral cat (DPS) and Feral bear (TPS)

WoW Forever rebuilds the feral tree rather than tuning it. Shred falls from 225% to 155% weapon
damage and Claw rises to 110%. Tiger's Fury becomes a free, off-GCD +15% physical-damage cooldown,
and the new King of the Jungle makes it grant up to 60 Energy. Furor now **keeps** your Energy
across a shift instead of setting it to 40, and Wolfshead Helm moved its 20 Energy onto Tiger's
Fury, so **powershifting no longer gains anything**. Omen of Clarity is trained by every druid.
Blood Frenzy's combo-point-on-crit effect moved into Primal Fury. Natural Weapons, Feral Aggression
and Faerie Fire (Feral) are gone. The Forever tree adds Mangle (bear only), Berserk, Predatory
Instincts, Rend and Tear, Natural Reaction and Lacerate, and a feral can pick up +4% hit, +4% crit,
+5% bleed damage and +5% all damage from the Balance and Restoration trees. Several diffs on
foreverchanges are tooltip artefacts: Rip, Cat Form AP and Bear Form health. This doc sorts the
real changes from those artefacts using the client DB2 tables, and specifies every formula,
rotation setting and default the engine needs for cat DPS and bear TPS at level 60.

Status: researched 2026-09-22 · foundation in the engine 2026-09-23 (forms, Energy, combo points,
Clearcasting, shapeshifts, talents and defaults) · the cat's abilities and tuned rotation
2026-09-23 ([§3](#3-feral-cat-sim-model), [§6.2](#62-forever-cat-priority)) · the bear's abilities
and rotation in the engine 2026-09-23 ([§4](#4-feral-bear-sim-model), [§6.3](#63-forever-bear-priority-tps))
· ruleset tags: [F] Forever · [C] Classic Era · [?] unverified

Forever client build `1.60.1.69913`, Classic Era client build `1.15.9.69722`. Source links use
short labels, which are resolved under [Sources](#sources).

> **Client data.** Values tagged **[F] [client] (Table, 1.60.1.69913)** come from the raw Forever
> client files, read through the wago.tools API and parsed by `scripts/scrape/client.mjs`. The
> claims check in [client.md][client] confirmed every value this doc had marked for a browser
> check ([Q27](#10-open-questions)), and the other values cited to the DB2 labels (`se-f`, `sp-f`,
> `scd-f`, …) match `src/data/client/spells.json` and `talents.json`. Raw files lack server
> hotfixes and server scripts: what a dummy effect does (Tiger's Fury's, King of the Jungle's
> hidden 5/10/15) and proc rates (PPM) stay server-side ([hotfix caveat][client-hotfix]).

---

## Contents

1. [What the sim needs](#what-the-sim-needs)
2. [WoW Forever changes that matter to a feral sim](#1-wow-forever-changes-that-matter-to-a-feral-sim)
3. [Shared feral mechanics](#2-shared-feral-mechanics)
4. [Feral cat: sim model](#3-feral-cat-sim-model)
5. [Feral bear: sim model](#4-feral-bear-sim-model)
6. [Talents](#5-talents)
7. [Rotation and priority](#6-rotation-and-priority)
8. [Sensible defaults](#7-sensible-defaults)
9. [Implementation notes](#8-implementation-notes)
10. [Worked examples](#9-worked-examples)
11. [Open questions](#10-open-questions)
12. [Appendix: Balance in Forever](#appendix-balance-in-forever)
13. [Sources](#sources)

---

## What the sim needs

**Both specs**

- Form-based auto attack: a **fixed form "weapon"** with the equipped weapon's damage and speed
  ignored. Cat swings every 1.0 s and bear every 2.5 s (§2.1). Only the weapon's stats, feral
  attack power and procs apply.
- Form attack power: `2×Str − 20 + (Agi in cat) + form bonus + Predatory Strikes + AP from gear and buffs + feral AP` (§2.2).
- Talent auras: flat crit, % crit damage on abilities, % damage on abilities and on bleeding targets, % periodic damage, and cost reductions (§5).
- Omen of Clarity procs from melee hits, with a PPM, an internal cooldown and a free next ability (§2.7).
- A per-target bleed flag, own bleeds or other players' (e.g. Deep Wounds), for Rend and Tear (§5).
- Leader of the Pack as a party buff owned by the druid; the buffs doc lists it too.

**Cat**

- Energy: 10/s delivered in ~2 s ticks on a player-global timer, capped at 100 [?] (§2.4). Builders
  refund 80% on a miss, dodge or parry [?].
- Combo points 0–5, with Primal Fury adding an extra point on a builder crit (§2.5).
- A 1.0 s cat GCD for abilities and 1.5 s for shapeshifts (§2.6).
- Abilities: Shred, Claw, Rake (hit plus bleed), Rip (bleed: snapshot by default; its ticks may
  crit in the `forever` profile [?]), Ferocious Bite (converts
  extra Energy), Tiger's Fury (off-GCD, Energy plus a damage buff), Berserk, and Faerie Fire in
  form (free, 6 s CD). Details in §3.
- Positional flag: behind the target or not (Shred needs behind; Claw is the fallback).
- Shapeshifting is optional and off by default. If enabled, use the Forever Furor re-entry rule
  and the mana model (§2.8).

**Bear**

- Rage: see [rage.md](../mechanics/rage.md). This doc covers the druid-specific sources: Enrage,
  Furor, Primal Fury, Natural Reaction and Wolfshead.
- Maul on next swing, Mangle (6 s CD), Lacerate (5-stack bleed), Swipe (3 targets),
  Demoralizing Roar, Faerie Fire (free, 6 s CD), and Berserk (Mangle hits 3 targets with no
  cooldown). Details in §4.
- Threat: bear form ×1.3, and **no Feral Instinct threat in Forever**. Per-ability multipliers
  are in §4.8; [threat.md](../mechanics/threat.md) owns the shared rules.

---

## 1. WoW Forever changes that matter to a feral sim

Everything below was checked against the Forever and Classic client DB2 rows (`SpellEffect`,
`SpellPower`, `SpellCooldowns`, `SpellShapeshift`, `TraitDefinitionEffectPoints` …) as well as the
foreverchanges tooltips; [client] marks the rows confirmed against the raw client files.
"Tooltip artefact" means the diff shown on foreverchanges does not change the value at level 60.

### 1.1 Spells

| Spell (max rank at 60) | Forever | Classic Era | Sim impact | Tag, source |
| --- | --- | --- | --- | --- |
| **Shred** r5 (9830) | 155% weapon + flat 80 (bonus added before the %) | 225% weapon + 80 | ~−31% Shred. Tooltip still says "plus 180", a stale hard-coded string (§3.1) | [F] [client] (SpellEffect, 1.60.1.69913) [fc-book]; [C] [client] (SpellEffect, 1.15.9.69722) |
| **Claw** r5 (9850) | **110%** weapon + 115 | 100% weapon + 115 | +10% Claw | [F] [client] (SpellEffect, 1.60.1.69913); [C] [client] (SpellEffect, 1.15.9.69722) |
| **Rake** r4 (9904) | 61 + 34 per 3 s × 3 | 58 + 32 per 3 s × 3 | Small buff | [F] [client] (SpellEffect, 1.60.1.69913); [C] [se-c] |
| **Rip** r6 (9896) | 6 × (15 + 25.5×CP): **855 at 5 CP** | 6 × (17 + 28×CP): **942 at 5 CP** | **~9% nerf.** foreverchanges' "243 instead of 45" compares a Forever total with a Classic per-tick value, because the Classic tooltip uses `$<ticks>` = 6 and `$<mult>` = 1 (`SpellDescriptionVariables` 865) | [F] [client] (SpellEffect, 1.60.1.69913); [C] [client] (SpellEffect, SpellDescriptionVariables, 1.15.9.69722) |
| **Ferocious Bite** r5 (31018) | 52–112 + 147×CP, +2.7 per extra Energy | Same | Unchanged, but Feral Aggression (+15% [?]) is gone | [F] [client] (SpellEffect, 1.60.1.69913) [fc-book]; [C] [se-c] [fc-book] (rank 5 Classic tooltip: 787–847 at 5 CP, 2.7 per Energy) |
| **Tiger's Fury** (5217, only rank) | **+15% physical damage** for 6 s, **free**, **30 s CD**, no GCD, cat only | r4: +40 damage per hit for 6 s, 30 Energy, 1 s CD | Now a real cooldown. With King of the Jungle it is the main Energy source | [F] [client] (SpellEffect, SpellCooldowns, 1.60.1.69913) [fc-book]; [C] [se-c] [scd-c] [fc-book] (9846: +40 flat damage, 30 Energy, 1000 ms) |
| **Faerie Fire** r4 (9907) | −505 armor for 40 s. Castable in cat and bear; **in form it costs nothing, has a 6 s CD and a 1.0 s GCD in cat** (cat passive 3025: −100% cost, +6 s CD, −0.5 s GCD) | Caster only. The feral version was a talent | Replaces Faerie Fire (Feral) for every druid | [F] [client] (SpellEffect 3025, 1.60.1.69913); 1178, 9635 [se-f] [ss-f] |
| **Cat Form** AP | 12 + 2/level from level 6 = **120 at 60**, plus 100% of Agility (aura 598) | 40 + 2/level from level 20 = **120 at 60**, plus Agility | **Tooltip artefact**: identical at 60 | [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913); [C] [se-c] [fc-book] ("40 plus Agility" is the level-20 value of the 3025 aura; base level 20: [client], SpellLevels, 1.15.9.69722) |
| **Bear Form** "health 180 instead of 20" | Forever tooltip reads `$1178s2`, which is now the armor effect. Real health bonus is still effect 2: 20 + 18/level | 20 + 18/level | **Tooltip artefact** (and irrelevant at 60 in Dire Bear) | [F] [se-f] |
| **Dire Bear Form** | +360% item armor, +600+32/lvl HP, +120+3/lvl AP (180 at 60) | Same | Unchanged | [F]/[C] [se-f] [se-c] |
| **Maul** r7 (9881) | +128 on next swing, 15 Rage | Same | Unchanged | [F]/[C] [se-f] |
| **Swipe** r5 (9908) | 83 to 3 targets, 20 Rage, 1.5 s GCD, no AP scaling | Same | Unchanged, but Feral Instinct now adds +30% damage | [F]/[C] [se-f] |
| **Demoralizing Roar** r5 (9898) | **−204 AP at 60**, the level-60 tooltip: base −193 and −1.4/level from 52, which `MaxLevel` 62 doesn't cap below 60, so −204.2, shown as 204. The −193 foreverchanges shows is the base, rendered without the per-level term. Whether the debuff applies −204 in combat is Q32 | −138 at 60 (base −130, −1/level from 52) | ~+48% stronger | tooltip [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913); base [fc-book]; in combat [?]; [C] [client] (SpellEffect, SpellLevels, 1.15.9.69722) [se-c] |
| **Growl** | 8 s CD | 10 s CD | Not simmed | [F] [scd-f] |
| **Enrage** | **10 Rage instantly** + 20 over 10 s, 1 min CD, no GCD | 20 over 10 s | Pre-pull Rage | [F] [client] (SpellEffect, 1.60.1.69913) [fc-class] |
| **Cower** r3 (9892) | Threat −1200 − 1/level: **−1208 at 60** | −600 − 1/level: −608 | Doubled, DB2-only | [F] [client] (SpellEffect, 1.60.1.69913); [C] [se-c] |
| **Frenzied Regeneration** | 1 rank: up to 10 Rage/s → 1% max HP per Rage, 10 s, 3 min CD | 3 ranks, 10 HP per Rage | Not simmed | [F] [fc-class] |
| **Omen of Clarity** (16864) | **Trained at 20, passive**, procs from spells and attacks, 10 s proc cooldown in DB2 | Tier-3 Balance talent, 10 min self-buff, melee only | Every feral has it (§2.7) | [F] [client] (SpellAuraOptions, 1.60.1.69913) [spell-f]; [C] [sao-c] [wiki-ooc] |
| **Lacerate** (new, r3 at 58: 1235827) | 15 Rage, 1.5 s GCD, bleed 15 per 3 s for 15 s, stacks to 5, "plus 10% weapon damage per existing application", "high threat" | n/a | New bear threat tool (§4.3) | [F] [client] (SpellEffect, SpellAuraOptions, 1.60.1.69913) [fc-book] |
| **Mangle** (talent 407995; ranks 1238069/70/73) | **Bear/Dire Bear only** (shapeshift mask 144; wowsims/forever reads the same, [wsf-mangle]). 100% weapon + 26/38/59/**77** (levels 25/36/48/60), 20 Rage, **6 s CD**, 1.5 s GCD | Not in Classic (Classic's 407995 is SoD data) | New bear ability (§4.2) | [F] [client] (SpellEffect, SpellPower, SpellCooldowns, SpellShapeshift, 1.60.1.69913) |
| **Berserk** (talent 417141) | 15 s, 3 min CD, no GCD: +100% crit chance to Claw/Rake/Shred/Ravage/Pounce, and Mangle loses its CD and hits up to 3 targets | n/a | Cat burst and bear AoE (§3.7, §4.6) | [F] [client] (SpellEffect, SpellCooldowns, 1.60.1.69913) |
| **Wolfshead Helm** (item 8345) | +5 Rage from Enrage, **+20 Energy from Tiger's Fury** | +20 Energy on shifting to cat, +5 Rage on shifting to bear | Powershift bonus removed | [F] [fc-wolf] [se-f]; [C] [fc-wolf] |

### 1.2 Talents (feral-relevant)

| Talent | Forever (max rank) | Classic Era (max rank) | Tag, source |
| --- | --- | --- | --- |
| Heart of the Wild (tier 1 now) | Int +10%, bear Stamina +20%, **cat Strength +10%** | Int +20%, bear Stamina +20%, cat Strength +20% | [F] [fc-tal] [trait-f] |
| Sharpened Claws | 2 ranks: +6% crit in forms | 3 ranks: +6% | [F] [fc-tal] |
| Savage Fury | 2 ranks: **+10%** Claw, Rake (incl. its bleed), **Shred**, Maul, Swipe | +20% Claw, Rake, Maul, Swipe | [F] [client] (SpellEffect class masks, CurvePoint, 1.60.1.69913) |
| Shredding Attacks (was Improved Shred) | 3 ranks: Shred −18 Energy (→ 42), Lacerate −3 Rage | 2 ranks: Shred −12 | [F] [fc-tal] |
| Ferocity | Maul, **Mangle**, Swipe −5 Rage; Claw, Rake −5 Energy | Same, without Mangle | [F] [fc-tal] |
| Predatory Strikes | +150% of level as AP in forms (+90 at 60) | Same | [F]/[C] [fc-tal] |
| Primal Fury | 100%: +5 Rage on a bear crit **and +1 CP on a non-periodic crit by a cat CP builder** | Rage part only (the CP part was Blood Frenzy) | [F] [fc-tal] |
| Feral Instinct | 3 ranks: **Swipe +30% damage**, stealth. **No threat bonus** | 5 ranks: +15% bear threat | [F] [fc-tal]; no threat aura: [client] (SpellEffect, 1.60.1.69913) |
| Thick Hide | 3 ranks: +3 base armor per level, +2.00 per defense point above 5×level, in forms | 5 ranks: +10% item armor | [F] [fc-tal] |
| Leader of the Pack | +3% crit, **all crit** (aura 290), exclusive with Moonkin aura | +3% melee and ranged crit | [F] [client] (SpellEffect, 1.60.1.69913); [C] [se-c] |
| Furor | 100% chance of 10 Rage on shifting to bear. **Cat: regain 100% of the Energy you had when last in cat + 10 Energy/s spent out of forms, max 100** | 100% chance of 40 Energy (cat) or 10 Rage (bear) | [F] [fc-tal]; curves [client] (CurvePoint, 1.60.1.69913) |
| Natural Shapeshifter (moved to Resto) | −30% shapeshift mana | Same | [F] [fc-tal] |
| **Naturalist** (was Improved Healing Touch) | **+5% all damage** (aura 79, all schools) | Healing Touch only | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| **New:** Predatory Instincts | +20% crit **damage bonus** on melee abilities (specials only) | n/a | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| **New:** King of the Jungle | Tiger's Fury grants **60 Energy** (20/40/60) | n/a | [F] [client] (CurvePoint, 1.60.1.69913) |
| **New:** Rend and Tear | +10% damage by melee abilities on **bleeding** targets | n/a | [F] [fc-tal] |
| **New:** Berserk | see §1.1 | n/a | [F] |
| **New:** Mangle | see §1.1 | n/a | [F] |
| **New:** Natural Reaction | +5% dodge; 100% chance of +5 Rage on dodge | n/a | [F] [fc-tal]; curves and 417053 = 50 tenths [client] (CurvePoint, SpellEffect, 1.60.1.69913) |
| **New (Balance):** Genesis | **+5% periodic damage**, incl. Rip, Rake bleed and Lacerate (class masks match) | n/a | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| **New (Balance):** Nature's Majesty | **+4% crit, spells and melee** (aura 290) | n/a | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| Nature's Reach | **+4% melee hit** (aura 54) and +4% spell hit, +20% Balance range | Range only | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| **Removed:** Blood Frenzy, Feral Aggression, Natural Weapons, Faerie Fire (Feral), Improved Enrage, Omen of Clarity (now trained) | Not in the Forever trees | Feral Aggression: FB +15%, Demo Roar +40%; Natural Weapons: +10% physical damage. These Classic values are informational only (secondary source [ws-fb] [ws-talents]) | [F] [fc-class]; Classic values [?] |

---

## 2. Shared feral mechanics

### 2.1 Form attacks: swing timer and damage

- **Swing time** comes from `SpellShapeshiftForm.CombatRoundTime`. **Cat 1000 ms; Bear and Dire
  Bear 2500 ms.** Both have `DamageVariance` 0.40, and both are identical in Forever and Classic.
  [F] [client] (SpellShapeshiftForm, 1.60.1.69913) · [C] [ssf-c]
- The equipped weapon's **damage and speed are ignored in form**. Its stats (Str, Agi, AP, crit,
  hit, "+X Attack Power in Cat, Bear, and Dire Bear forms") still apply. foreverchanges says so
  for Forever ("A weapon's own damage does nothing while you are in a form") [F] [fc-bis]. The
  swing speeds above are form data, not weapon data [F] [client] (SpellShapeshiftForm, 1.60.1.69913); [C] [ssf-c]; wowsims/classic
  swaps the MH for a form weapon too (secondary, [ws-forms]).
- **Form weapon at level 60** [?]:
  - Cat: 43.84–65.76 damage, speed 1.0 (average 54.8 DPS)
  - Dire Bear: 109.6–164.4, speed 2.5 (54.8 × 2.5 = 137 average)
  - The only source for the 54.8 DPS base is wowsims/classic [ws-forms], a secondary source (see
    Sources). It hard-codes the cat numbers; the bear numbers are commented-out code. The *shape*
    is corroborated by client data: both are exactly ±20% of the average, which is what
    `DamageVariance` 0.40 in `SpellShapeshiftForm` means (min = 0.8×avg, max = 1.2×avg) [F]
    [client] (SpellShapeshiftForm, 1.60.1.69913); [C] [ssf-c]. The base value must be measured (Q5).
- **Damage of a white swing, or of the "weapon damage" W used by abilities:**
  `W = uniform(formMin, formMax) + AP × speed / 14`, i.e. `AP/14` in cat and `AP×2.5/14` in bear.
  Instant abilities use the same speed as the swing: there is **no normalization** in Classic
  [?] (secondary [ws-shred]; the rule belongs to
  [damage-and-timing.md](../mechanics/damage-and-timing.md), and for cat it makes no difference
  because the form speed is already 1.0).
- Haste (Manual Crowd Pummeler, Skyborne Wind Blessed, the Forever T1 2-piece) shortens the form
  swing timer [?] (the MCP on-use is "+50% attack speed" [F] [fc-mcp]; that it hastes form swings
  is supported only by secondary sources [ws-presets] [ws-apl]) (Q28).
- Procs that use PPM take the **form's** swing speed (cat 1.0, bear 2.5) as the weapon speed [?]
  (secondary [ws-talents]; Q28). PPM values themselves are server-side: no `SpellAuraOptions` row
  in the client references a PPM row ([client]).

**In the engine** (`src/sim/classes/druid/forms.ts`, `formWeapon`). In Cat and Dire Bear Form the
main hand is the form's weapon above, whatever is equipped, and with no weapon equipped too:
- The item's **flat weapon damage** (a sharpening stone, Superior Striking) is weapon damage, so
  it's left out in form [?] (Q25). Its hit and crit bonuses, and every stat, still count.
- Its attacks use the level's base **weapon skill**, 300: items' weapon skill doesn't apply in
  form [?] (Q28).
- They count as **one-handed** for Forever's normalized rage: 3.46 × 2.5 = 8.65 rage per landed
  bear swing [?] ([rage.md](../mechanics/rage.md#bear-druid-rage)).
- A shapeshift re-resolves each PPM proc's chance from the new form's speed (§2.8).

### 2.2 Attack power in forms

Coordinate with [character-stats.md](../mechanics/character-stats.md), which owns base stats and
racials. The druid-specific terms at level 60:

```
AP_cat  = 2×Str − 20 + 1×Agi + 120 (Cat Form) + 90 (Predatory Strikes 3/3) + AP_gear/buffs + AP_feral
AP_bear = 2×Str − 20         + 180 (Dire Bear) + 90 (Predatory Strikes 3/3) + AP_gear/buffs + AP_feral
```

| Term | Value | Tag, source |
| --- | --- | --- |
| Druid AP per Str, base offset | 2 AP per Str, −20 | 2 AP per Str [F] (client `ChrClasses.AttackPowerPerStrength`, [character-stats § Strength](../mechanics/character-stats.md#strength), which owns it); −20 offset [?] placeholder ([D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)); origin: [ws-base], not evidence ([character-stats OQ-7](../mechanics/character-stats.md#oq-7-base-attack-power-formulas); about 0.7% of cat DPS) |
| Agility → AP | 1 per Agi, **cat only** (Forever makes it data: aura 598, 100% of Agility) | [F] [client] (SpellEffect 3025 effect 5, 1.60.1.69913); [C] [fc-book] (Classic Cat Form tooltip "…by 40 plus Agility") |
| Cat Form | 2 × level = 120 | [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913); [C] [se-c] |
| Dire Bear Form | 120 + 3×(level − 40) = 180 | [F]/[C] [se-f] [se-c] |
| Predatory Strikes 1/2/3 | 0.5/1.0/1.5 × level = 30/60/90 | [F] [trait-f] [fc-tal]; [C] [fc-tal] (Classic text "…by 150% of your level") |
| "Attack Power in Cat, Bear, and Dire Bear forms" on items | Added 1:1, only in those forms. No talent multiplies it | [?] (the item text reads as flat AP; secondary [ws-forms]) (Q28) |
| Heart of the Wild (cat) | Strength ×1.10 at 5/5 (Forever), applied to total Strength before the conversion | [F] [fc-tal]; [?] on stacking order with Blessing of Kings |
| Agility → crit | 20 Agi per 1% melee crit (0.05%/Agi); base melee crit 0.9% | 20 Agi per 1% [F] (client `PlayerExpectedStat.CritPerAgility`, [character-stats § Agility](../mechanics/character-stats.md#agility), which owns it); base crit 0.9% [?] placeholder (D24); origin: [rb-vanilla] and [ws-base], not evidence ([character-stats OQ-3](../mechanics/character-stats.md#oq-3-base-melee-and-spell-crit): plausibly 0–1%, up to about 1.5% of cat DPS, so it's the first to measure) |

There are no druid AP% multipliers in Forever: Protector of the Pack and similar talents don't
exist.

**In the engine**, each form has its own stat block: the shared one (gear, buffs, racials, the
talents that hold in every form) plus the form's own effects and the talents bound to it (Cat
Form's 120 AP and 1 AP per Agility, Dire Bear Form's 180 AP, armor and health, Heart of the Wild's
Strength or Stamina, Sharpened Claws, Predatory Strikes, Leader of the Pack). An item's or set
bonus's "Attack Power in Cat, Bear, and Dire Bear forms" (the item stat `feralAttackPower`) goes
into the cat and bear blocks only, as flat AP. The plan's sheet
and static numbers are the spec's form: Cat Form for the cat, Dire Bear Form for the bear. A
shapeshift swaps in another form's block (§2.8).

### 2.3 Crit, hit and damage modifiers from druid sources (level 60)

| Source | Effect | Applies to | Tag |
| --- | --- | --- | --- |
| Sharpened Claws 2/2 | +6% crit | All attacks in cat or bear | [F] [fc-tal] |
| Leader of the Pack | +3% crit (all crit) to the party, self included | Party-wide | [F] [client] (SpellEffect, 1.60.1.69913) |
| Nature's Majesty 2/2 | +4% crit (spells and melee) | Always | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| Nature's Reach 2/2 | +4% melee hit, +4% spell hit | Always | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| Predatory Instincts 2/2 | Crit damage bonus ×1.2, so specials crit for **2.2×** instead of 2.0×. **White hits excluded** | Claw, Rake, Shred, Ravage, Pounce, Rip/FB, Maul, Swipe, Mangle, Lacerate (DB2 class masks) | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913); interpretation [?] |
| Savage Fury 2/2 | ×1.10 damage | Claw, Rake (hit and bleed), Shred, Maul, Swipe. **Not** Mangle, Rip, FB, Lacerate | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| Feral Instinct 3/3 | ×1.30 damage | Swipe | [F] [client] (SpellEffect, 1.60.1.69913) |
| Genesis 5/5 | ×1.05 periodic damage | Rip, Rake bleed, Lacerate bleed | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| Rend and Tear 5/5 | ×1.10 | "Melee abilities" vs a **bleeding** target | [F] [fc-tal]; scope [?] (Q9) |
| Naturalist 5/5 | ×1.05 all damage | Everything | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| Tiger's Fury | ×1.15 physical damage for 6 s | White, specials, bleeds (physical school) | [F] [client] (SpellEffect, 1.60.1.69913) |
| Berserk | +100% crit chance | Claw, Rake, Shred, Ravage, Pounce | [F] [client] (SpellEffect, 1.60.1.69913) |

**Stacking.** Modifiers from different sources multiply. Two `SPELLMOD` percentages on the same
spell (e.g. Savage Fury and Genesis on the Rake bleed, or Savage Fury and Feral Instinct on Swipe)
also multiply, because the modern engine multiplies percentage spell mods. [?] (engine behaviour,
not verified in game; the difference from additive is under 0.5% for the combinations here).

### 2.4 Energy (cat)

| Rule | Value | Tag, source |
| --- | --- | --- |
| Regeneration | **20 Energy per tick, ticks 2 s apart** (10 Energy/s) | [C] [wh-rot] (its powershift cycle table shows +20 Energy at t = 1 s and t = 3 s) |
| Tick refinement | wowsims/classic models **20.2 Energy every 2020 ms** (same 10/s). Default to 20 per 2000 ms until measured | [?] (secondary [ws-energy]) (Q6) |
| First tick | Random phase in [0, 2000) ms relative to the start of the fight | [?] (secondary [ws-energy]) |
| Tick cadence across shifts | The tick timer is player-global and **does not reset** when shifting: in the Classic cycle the first tick comes 1 s after the powershift, not 2 s, so the shift didn't restart the timer | [C] [wh-rot] |
| Cap | 100. Energy above 100 is lost | [?] (standard value, not found in a Classic Era text or client table at hand; secondary [ws-energy]) (Q29) |
| Start of fight | 100 Energy (the player comes in full) | [?] (standard assumption; [encounter.md](../mechanics/encounter.md) may override) |
| Miss, dodge or parry refund | **Builders (Shred, Claw, Rake) refund 80%** of their cost. **Finishers (Rip, FB) refund 0 and keep their combo points** | [?] (secondary [ws-shred] [ws-rip] [ws-fb]) (Q29) |
| Haste | Does **not** change Energy regeneration | [?] (Q6) |
| Tiger's Fury + King of the Jungle 3/3 | +60 Energy instantly (+20 more with Wolfshead Helm) | [F] [client] (CurvePoint, 1.60.1.69913) [fc-wolf] |
| Entering Cat Form without Furor | Energy set to **0** | [C] [wh-rot] (inferred: in Classic a powershift *sets* Energy to Furor 40 + Wolfshead 20 = 60 whatever you had, e.g. 4 → 60, so with neither it sets 0); secondary [ws-forms] |
| Entering Cat Form with Furor, Forever | See §2.8 | [F] |

**In the engine**, Energy is kept in tenths, like rage. One player-global **power tick** every
2 s, from a random phase in [0, 2 s) at the pull, brings both Energy and mana (§2.8) [?]: whether
the two share a timer is unmeasured (Q34). It runs in every form and isn't reset by a
shapeshift; entering cat then sets Energy by Furor's rule (§2.8). Energy from a spell (Tiger's
Fury) is an energize: 5 threat per Energy [?]
([threat.md](../mechanics/threat.md#threat-from-healing-power-gains-and-buffs)). An ability that
misses, is dodged or is parried refunds its share of what it paid: 80% for a builder, nothing for
a finisher, and nothing when Clearcasting paid (§2.7).

### 2.5 Combo points

- 0 to 5, awarded by builders on a hit: Shred, Claw, Rake, Ravage and Pounce give 1 each. Forever
  awards them through an energize effect on the spell (`Effect 30`, power type 4) instead of
  Classic's effect 328; the result is the same. [F] [se-f]
- **Primal Fury 2/2:** a **non-periodic crit** from a cat CP builder adds **+1 more** (so a crit
  Shred gives 2). With Berserk active every landed builder crits, so every landed builder gives
  2 CP. [F] [fc-tal] [se-f]
- Finishers (Rip, Ferocious Bite) consume **all** points on a hit [C] (Classic tooltips scale
  with "combo points" [fc-book]). They **keep** them on a miss or dodge [?] (secondary [ws-fb]
  [ws-rip]; Q29).
- Forever gives Rip and FB a `SpellPower` row that costs combo points (1 plus up to 4 optional),
  like the modern client. Whether points now live on the player rather than the target is Q18.
  It doesn't matter for single-target sims. [F] [sp-f]
- **In the engine**, a finisher is usable only with a combo point. Its damage (per point, and
  attack power per point up to a cap: Rip's 4, §3.4) reads the points, then a landed hit spends
  them all; a bleed finisher snapshots them with its ticks (§2.9). A builder's extra point on a
  crit rolls Primal Fury's chance (100% at 2/2). Points persist through a shapeshift.

### 2.6 Global cooldowns

| Action | GCD | Tag, source |
| --- | --- | --- |
| Cat abilities (Shred, Claw, Rake, Rip, FB, Cower) | **1.0 s** (`StartRecoveryTime` 1000) | [F] [client] (SpellCooldowns, 1.60.1.69913); [C] [scd-c]; the Classic cycle table (Shred at t = 1.5, GCD ends at t = 2.5) agrees [wh-rot] |
| Faerie Fire in Cat Form | 1.0 s (1.5 − 0.5 from the cat passive) | [F] [client] (SpellEffect 3025, 1.60.1.69913) |
| Faerie Fire in bear / caster | 1.5 s | [F] [scd-f] |
| Shapeshift (Cat, Bear, Dire Bear) | 1.5 s | [F]/[C] [scd-f] |
| Bear abilities (Swipe, Demo Roar, Mangle, Lacerate, Frenzied Regeneration) | 1.5 s | [F] [scd-f] |
| Maul (on next swing), Tiger's Fury, Berserk, Enrage | **None** (no `StartRecoveryTime`) | [F] [scd-f] |

The GCD is **not** shortened by haste [C] (Forever unverified;
[damage-and-timing §3.5](../mechanics/damage-and-timing.md#35-global-cooldown) owns this rule and
its source).

### 2.7 Omen of Clarity and Clearcasting

| Rule | Value | Tag, source |
| --- | --- | --- |
| Availability | Forever: trained at 20, passive, every druid has it. Classic: Balance talent and a 10 min self-buff | [F] [fc-class] [sm-f] |
| Proc rate | **2 PPM**: chance per landed melee hit (white or special) = 2 × speed / 60, i.e. **3.33% in cat, 8.33% in bear** | [?] (secondary only [ws-talents]; Q4) |
| Internal cooldown | **10 s**, from `SpellAuraOptions.ProcCategoryRecovery` = 10000 on 16864 in **both** clients | [F] [client] (SpellAuraOptions, 1.60.1.69913); [C] [sao-c] |
| Triggers in Forever | Tooltip: "Your spells and attacks". The client proc-type mask is unchanged from Classic (81940), so which spells can proc it is decided server-side. Model: melee white and special hits; spells [?] (irrelevant in form except Faerie Fire) | [F] [spell-f] [sao-f] |
| Clearcasting | Next damage or healing spell or offensive ability costs 0; 1 charge; 15 s | [F] [se-f] (16870, duration index 8 = 15 s); [C] [wiki-ooc] |
| Not consumed by | Abilities that cost nothing, e.g. Faerie Fire in form and Tiger's Fury (Forever tooltip) | [F] [spell-f] |
| Ferocious Bite under Clearcasting | Costs 0 and still converts **all** current Energy into extra damage | [?] (secondary [ws-fb]; Q20). That Bite always empties the Energy bar is [C] [wh-rot] ("Bite consumes the entirety of your Energy pool") |
| Moonkin Form | +100% proc chance (not relevant to ferals) | [F] [fc-tal] |

Confidence: **low** for the rate, **medium** for the ICD. The PPM isn't in client data (no
`SpellAuraOptions` row references a PPM row, so proc rates are server-side, [client]), and the
only value found is wowsims/classic's 2 PPM, a secondary source, hence [?]. Pre-1.12 wiki text says
"about 6% per hit, no ICD"; that is forbidden and was not adopted. Both clients carry the 10 s ICD
field. Measure both on the beta (Q4).

**In the engine**, Clearcasting is the plan's free-cast aura: while it's up, the next ability that
can use it and has a cost costs nothing, and uses it up. An ability that costs nothing (Faerie
Fire in form, Tiger's Fury) leaves it up. A shapeshift, a spell with a mana cost, doesn't use it:
16870's class mask leaves out Cat Form's and Dire Bear Form's bits [F] [client] (SpellEffect,
SpellClassOptions, 1.60.1.69913).

### 2.8 Shapeshifting, Furor, Wolfshead Helm, powershifting, mana

**Classic Era powershifting.** Shifting out of and back into cat costs 55% of base mana
([C] [fc-book] Classic Cat Form cost) and a 1.5 s GCD ([C] [scd-c]). It **sets** Energy to 40
(Furor 5/5) + 20 (Wolfshead) = 60, whatever you had. The Era rotation is built around it (shift
when more than 20 Energy short of the next action, about once per 4 s cycle), fuelled by Major
Mana Potions, Demonic/Dark Runes and Innervate. [C] [wh-rot] (secondary: [ws-forms] [ws-rot])

**Forever.**

- Furor (cat part), rank r (1–5): on entering cat,
  `E = min(20·r, (0.2·r)·E_left + (2·r)·t_out)`, where `E_left` is the Energy you had when you
  last left cat and `t_out` is the seconds spent in **no** animal form (caster, travel …). At 5/5:
  `E = min(100, E_left + 10·t_out)`. [F] [fc-tal]; curves on 17056 [client] (CurvePoint,
  1.60.1.69913); rounding [?]
- Wolfshead Helm gives nothing on shift. [F] [fc-wolf]
- Without Furor, entering cat sets Energy to 0. [C] [wh-rot] (inferred, see §2.4); secondary
  [ws-forms]

**Consequence:** a Forever powershift (cat → caster → cat) returns the Energy you left with, plus
the 10/s you would have regenerated anyway, **and** costs a 1.5 s GCD plus mana. It never gains
Energy, so **the default cat rotation never powershifts** [F, inference from the two tooltips]. If
the guild finds a reason to shift (e.g. Innervate, decurse, Rebirth), Furor 5/5 makes the trip
Energy-neutral.

**Mana model** (only needed if shifting is enabled):

- Cat Form / Dire Bear Form cost `55% × BaseMana(60) × (1 − 0.10 × Natural Shapeshifter rank)`.
  [F] [sp-f] (`PowerCostPct` 55) [trait-f] (Natural Shapeshifter −10/−20/−30%)
- BaseMana, Int → mana (15 per Int above 20), spirit regen and mp5 are owned by
  [character-stats.md](../mechanics/character-stats.md#spirit-and-mana-regeneration): druid
  spirit regen is `15 + Spirit/5` per 2 s tick outside the five-second rule [C] (Classic Era
  calculator, cited there; wowsims/classic agrees, [ws-mana]), and any mana-costing cast (a
  shapeshift included) restarts the five-second rule [C].
- Mana potions and runes belong to
  [buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md).

**In the engine** (`shapeshift` in `src/sim/classes/druid/abilities.ts`; the `shift` ability kind):
- A shapeshift is an ability with a mana cost and a 1.5 s GCD. Shifting into the form the druid
  is already in is a powershift: cancel the form and shift again at once, so `t_out` = 0.
- Its mana is `floor(0.55 × 1244 × (1 − 0.1 × Natural Shapeshifter rank))`: 684, or 478 at 3/3.
  The rounding is [?].
- **Entering cat** sets Energy by Furor's rule above, rounded down to a tenth of a point [?].
  Before the druid has left cat in a fight, `E_left` is the full bar it pulled with [?] (Q13).
  `t_out` counts only time in caster form since leaving cat: a bear is in an animal form.
- **Entering bear** sets rage to 0, then Furor gives 10 rage at 20% per rank
  ([rage.md](../mechanics/rage.md#bear-druid-rage)). That rage is an energize: 5 threat per rage,
  on the shapeshift's row.
- Wolfshead Helm adds nothing on a shift in Forever.
- The form's stat block, main hand and threat multiplier swap in (§2.2). The swing in progress
  keeps its time and the next uses the new speed; the power tick keeps its phase [?] (Q34).
  The boss's swings meet the new form's armor and dodge, since the boss's table and the armor
  against it follow the stats
  ([combat-tables §8](../mechanics/combat-tables.md#8-boss--player-tanks)). Maximum health, which
  rage from damage taken divides by, stays that of the form the fight started in; only a bear
  tanks, and a bear never leaves bear in any rotation. A rotation that shifts into bear to take
  hits (a cat bearweaving) must divide by the current form's health first: a Tauren cat's 3,835
  would give about 47% more rage than its bear's 5,631.
- **Mana**: the pool is base mana plus Intellect. Every power tick gives spirit regeneration,
  `15 + Spirit / 5` per 2 s, unless mana was spent in the last 5 s. That's the engine's one mana
  model, the paladin's too ([character-stats.md](../mechanics/character-stats.md#spirit-and-mana-regeneration)),
  but the druid's plan doesn't set its mp5 or a share of spirit regeneration inside the rule yet
  (no pre-raid feral item has mp5, and no feral build takes Reflection).

### 2.9 Snapshotting

- **Bleeds snapshot** attack power and the caster's damage multipliers (Tiger's Fury, Naturalist,
  Genesis …) **when applied**, in both profiles. Target-side modifiers (e.g. a debuff that
  raises physical damage taken) apply per tick. [?] (the default in
  [damage-and-timing §4](../mechanics/damage-and-timing.md#4-dots-and-bleeds); secondary
  [ws-rip] [ws-rake], which snapshot at application. A Forever report of per-tick reads covers
  only the warrior's Rend and is not adopted. Q21)
- Bleeds ignore armor. [C] [wh-rot] ("bleed damage is not discounted by armor")
- **Can a bleed tick crit? It depends on the rules profile**
  ([damage-and-timing §4](../mechanics/damage-and-timing.md#4-dots-and-bleeds)):
  - `classicEra`: no [C] [wh-rot] ("[Bite] can crit" is contrasted with Rip).
  - `forever`: Rake, Rip, Pounce and Lacerate ticks can crit [?]. The client sets the
    periodic-crit flag (`SpellMisc` Attributes[8] 0x200) on all four [F] [client] (SpellMisc,
    1.60.1.69913); whether the server honours it is Q21. A tick crit deals 2.0×, or 2.2× with
    Predatory Instincts 2/2, whose class mask includes Rip [?].
- Refreshing a bleed recomputes the snapshot. [?] (secondary [ws-rip]; Q21)

---

## 3. Feral cat: sim model

Definitions: `W` = the cat weapon roll + AP/14 (§2.1); "SF" = Savage Fury multiplier (1.10 at 2/2).
All abilities are yellow melee attacks, and
[combat-tables §3](../mechanics/combat-tables.md#3-special-yellow-attacks) owns how they roll [C]:
abilities that deal weapon damage (Shred, Claw, Ravage, Maul, Mangle) make **one** roll, which
from behind is miss, dodge, crit, hit (no parry, no block, no glancing). Rake's initial hit,
Ferocious Bite and Swipe have no weapon-damage effect, so by analogy with the warrior's
Bloodthirst they roll twice: miss and dodge first, then crit on a landed hit [?] (Q33).

### 3.1 Shred (r5, 9830)

| Field | Value | Tag |
| --- | --- | --- |
| Cost | 60 Energy − 6/rank Shredding Attacks → **42** at 3/3 | [F] [sp-f] [trait-f] |
| Requirement | Behind the target; cat | [F] [spell-f] |
| Damage | `1.55 × (W + 80) × SF × (other multipliers)` | [F] [client] (SpellEffect, 1.60.1.69913); order of flat and % [C] (Q1) |
| Crit | 2.2× with Predatory Instincts 2/2 | [F] |
| CP | +1 (+1 more on a crit with Primal Fury) | [F] |

**The flat bonus is added before the percentage**, as in Classic. The Classic Era client's own
Shred tooltip says "225% damage plus 180" at rank 5, and 180 = 80 (the flat `WEAPON_DAMAGE`
effect) × 2.25. The same holds at every rank: 24 × 2.25 = 54, 32 × 2.25 = 72, 44 × 2.25 = 99,
64 × 2.25 = 144. [C] [fc-book] [se-c] (wowsims/classic computes it the same way, secondary
[ws-shred].) The Forever tooltip still says "155% damage plus 180". That string is hard-coded, not
a variable, so it tells us nothing. (wowsims/forever reads the same 155% from the Forever client,
[wsf-shred].) Under the Classic rule the Forever flat part is 124; if Forever
adds the flat after the percentage it is 80. Test in Q1.

### 3.2 Claw (r5, 9850)

`1.10 × (W + 115) × SF`, 45 − 5 (Ferocity 5/5) = **40 Energy**, +1 CP. Used only when not behind
the target. [F] [client] (SpellEffect, 1.60.1.69913); Ferocity [trait-f]

### 3.3 Rake (r4, 9904)

- Initial hit: **61** × SF (no AP scaling), can crit (2.2×), +1 CP.
- Bleed: **34 per 3 s × 3 ticks** (9 s) × SF × Genesis. It ignores armor and has no AP
  scaling, and the ticks can't miss once applied. Its ticks can't crit in `classicEra` [C]; in
  `forever` they can [?] (§2.9).
- Cost 40 − 5 = **35 Energy**.
- [F] [client] (SpellEffect, SpellDuration, 1.60.1.69913: 61, then 34 every 3,000 ms for 9,000 ms).
  No AP scaling: [C] [fc-book] (the
  Classic and Forever Rake tooltips give fixed numbers and, unlike Rip and Bite, don't say
  "increased by your Attack Power"); secondary [ws-rake]

### 3.4 Rip (r6, 9896)

- `tick = 15 + 25.5 × CP + 0.01 × min(CP, 4) × AP`, **6 ticks, one every 2 s** (12 s), ×
  Genesis × TF (snapshot).
  - Base values: [F] [client] (SpellEffect, SpellDuration, 1.60.1.69913: `EffectBasePointsF` 15,
    `EffectPointsPerResource` 25.5, period 2000 ms, 12,000 ms).
  - AP term: [?] (6% of AP per CP over the whole Rip, capped at 4 CP, so 24% of AP at 4–5 CP).
    The only source is secondary [ws-rip]. The Classic and Forever tooltips confirm only that
    "damage increases … by your Attack Power" [fc-book], and the scaling isn't in client data
    (Q3).
- Cost **30 Energy** plus all combo points. No armor, no Savage Fury. Ticks can't crit in
  `classicEra` [C]; in `forever` they can [?] (§2.9), for 2.2× with Predatory Instincts 2/2.

### 3.5 Ferocious Bite (r5, 31018)

- `dmg = uniform(52, 112) + 147 × CP + 0.03 × CP × AP + 2.7 × (Energy − 35)`, then × multipliers
  (Naturalist, TF, Rend and Tear [?]). Physical, so armor applies. It can crit (2.2× with
  Predatory Instincts), and consumes all Energy.
  - Base, per-CP and 2.7/Energy: [F] [client] (SpellEffect, 1.60.1.69913: base 82 ± 30 via
    `Variance` 0.7317, PPR 147, dummy 270 → 2.7).
  - AP term (3% per CP): [?] (secondary [ws-fb]; the tooltips confirm only that "damage is
    increased by your Attack Power" [fc-book]; Q3).
  - "Consumes all Energy": [C] [wh-rot] ("Bite consumes the entirety of your Energy pool").
- Cost 35 Energy (no Ferocity reduction). No Feral Aggression in Forever.
- Rank availability: rank 5 is listed at level 60 [F] [fc-book]. If it turns out to be a book
  (in Classic Era it's a book: [wh-rot] "once you acquire" it; that it arrives with AQ is
  secondary [ws-fb]), the fallback rank 4 (22829) is
  `uniform(45, 95) + 128×CP + 2.5/Energy` [F] [se-f] (Q17).

### 3.6 Tiger's Fury (5217)

- **+15% physical damage done for 6 s**, free, **30 s cooldown**, no GCD, cat only. [F] [client]
  (SpellEffect, SpellCooldowns, 1.60.1.69913) [spell-f]
- King of the Jungle 1/2/3: instantly **+20/40/60 Energy**. [F] [client] (CurvePoint,
  1.60.1.69913; curve on 417046 effect 0)
- Wolfshead Helm: +20 Energy more. [F] [fc-wolf]
- King of the Jungle also has a hidden second value, 5/10/15 per rank (effect 1, dummy), that no
  tooltip mentions: the value is [F] [client] (CurvePoint, 1.60.1.69913), but what the dummy does
  is server-side [?]. Model nothing for it until measured (Q7).
- Forever T1 feral 5-piece: TF cooldown −3 s (`1301247`). [F] [se-f] (set bonuses belong to the
  items doc)

### 3.7 Berserk (417141, cat use)

15 s, 3 min cooldown, no GCD, usable in cat or bear. **+100% crit chance** on Claw, Rake, Shred,
Ravage and Pounce (class mask 0x39000), so every landed builder crits and, with Primal Fury 2/2,
awards 2 CP. It also clears and grants immunity to fear. [F] [client] (SpellEffect, SpellCooldowns,
1.60.1.69913)

### 3.8 Faerie Fire in cat (9907 r4)

−505 armor for 40 s. **Free in form, 6 s cooldown, 1.0 s GCD in cat.** It's a spell (Nature),
and the hit table is owned by [combat-tables.md](../mechanics/combat-tables.md). If this druid
maintains it, the sim applies the raid debuff from this source and doesn't double-count a
"Faerie Fire" debuff toggle. [F] [client] (SpellEffect 3025 effects 2–4, 1.60.1.69913) [ss-f]

**In the engine:** a `cast` that rolls spell hit ([combat-tables §9](../mechanics/combat-tables.md#9-spell-hit-and-crit-generic)):
17% against a level-63 boss, less your spell hit (Nature's Reach's 4% among it; 9% for the
default cat). A miss applies nothing, and the 6 s cooldown runs either way. Its aura takes 505 off
the boss's armor while it's up. With the rotation's Faerie Fire on (the default), the Buffs tab's
Faerie Fire adds nothing more, as a warrior's own Battle Shout replaces the Buffs one; with it off,
the Buffs tab's is off by default too, the raid's being assumed yours (§6.2). Its threat (108 [?],
Q15) isn't counted. The bear's Faerie Fire also rolls the boss's Nature resistance (§4.5); the
cat's doesn't yet, so the shipped cat's numbers stay as they were until a change of its own (the
boss would resist about 6% of the ones that land).

### 3.9 Not used in the default cat rotation

- **Ravage** (r4 9867): `3.50 × (W + 98)`, must be prowling and behind. [F] [se-f]
- **Pounce** (r3 9827): stun plus bleed, prowling only. PvE openers are skipped. [C] [wh-rot]
- **Cower** (r3): −1208 threat, 20 Energy, 10 s CD. Threat is owned by [threat.md](../mechanics/threat.md).
  [F] [client] (SpellEffect, 1.60.1.69913)

### 3.10 Auto attack

Cat white swing: `uniform(43.84, 65.76) + AP/14` [?] (form base damage, Q5) every **1.0 s / (1 + haste)** [F] [client] (SpellShapeshiftForm, 1.60.1.69913) (haste: Q28). It can glance
(see [combat-tables.md](../mechanics/combat-tables.md)) and crits for 2.0× (Predatory Instincts
doesn't apply). Physical, so armor applies, and Tiger's Fury and Naturalist apply. The results'
breakdown names its row "Auto attack", since the swings are the form's, not the weapon's.

### 3.11 Cat threat

Cat Form's threat modifier is **×0.71** (−29%). [F] [client] (SpellEffect 3025 effect 1: −29,
1.60.1.69913); [C] [ltc2]

### 3.12 In the engine

`src/sim/classes/druid/cat-abilities.ts` holds the rows above with the client's numbers, which
`cat.test.ts` checks against `src/data/client`; the build's talents apply through
`withDruidTalents` ([§8](#8-implementation-notes)).

- **Shred, Claw:** one-roll weapon strikes (`W` is the form weapon, §2.1). Shred is from behind
  only: with the Fight tab's position at the front it's never used, and Claw builds instead.
- **Rake:** its hit is a two-roll attack like Ferocious Bite (Q33 [?]). A landed hit also starts
  its bleed: 3 ticks with their own breakdown row ("Rake (bleed)"), a marker on the boss for
  Rend and Tear and the rotation, and the crit chance it landed with (Berserk's included [?]).
- **Rip:** a bleed finisher. The ticks snapshot the combo points, attack power, Tiger's Fury and
  crit chance when it lands (§2.9), and crit in `forever` only.
- **Ferocious Bite:** 52 + a uniform 0–60, + 147 per combo point, + 3% of attack power per point
  [?], + 2.7 per Energy left after its 35. A landed Bite spends every point and all the Energy;
  an avoided one keeps both, less its cost.
- **Tiger's Fury:** a free cast off the GCD. Its Energy is an energize: 60 at King of the Jungle
  3/3, 80 with Wolfshead Helm, capped at 100, with 5 threat per Energy gained [?].
- **Berserk:** a free cast off the GCD. While its 15 s aura is up, Shred, Claw and Rake get +100%
  crit, so each landed builder crits and, with Primal Fury 2/2, gives 2 combo points (Q8 [?]).
- **Rend and Tear:** +10% on the direct damage of Shred, Claw, Rake and Ferocious Bite while the
  boss bleeds: from the druid's Rip or Rake, or all fight when the Buffs tab's raid has warriors,
  whose Deep Wounds count (Q9 [?]). Not on auto attacks or ticks.
- **The Manual Crowd Pummeler:** its use is a cast off the GCD, +50% attack speed for 30 s, a 180 s
  cooldown and 3 charges a fight [F] [client] (ItemEffect, 1.60.1.69913). That the haste speeds
  the form's swings is Q28 [?].
- The results list the cat's `[?]` in use ([§8](#8-implementation-notes)).

---

## 4. Feral bear: sim model

`W_b` = dire bear weapon roll + AP × 2.5 / 14 (§2.1). Rage generation and spending are owned by
[rage.md](../mechanics/rage.md); threat constants by [threat.md](../mechanics/threat.md). Below
are only the druid-specific numbers.

**In the engine** (`src/sim/classes/druid/bear-abilities.ts`, checked against the client in
`bear.test.ts`) each ability below is a row with the talents of §5 applied by `withDruidTalents`,
and Rend and Tear (+2% a rank on the direct damage of Maul, Swipe, Mangle and Lacerate against a
bleeding target, §5.1) by the bear's rotation builder. A bear attack that's missed, dodged or
parried refunds 80% of its rage, Swipe nothing (§4.4) [?]
([rage.md](../mechanics/rage.md#rage-refunds-on-avoided-abilities)).
The sim has one target, so Swipe's and Berserk's Mangle's extra targets add nothing.
Clearcasting pays for Maul, Swipe, Mangle, Lacerate and Demoralizing Roar: 16870's class mask
covers all five and leaves out Faerie Fire, which is free in form anyway [F] [client]
(SpellEffect, SpellClassOptions, 1.60.1.69913).

### 4.1 Maul (r7, 9881)

On next swing: replaces the white swing with a yellow attack for `(W_b + 128) × SF`. It can't
glance, and crits for 2.2× with Predatory Instincts. Cost 15 − 5 (Ferocity) = **10 Rage**, spent
when the swing lands. No GCD. [F] [se-f] [sp-f]

Threat ×1.75 before the form modifier [?] (LibThreatClassic2 only, [ltc2]; see
[threat.md](../mechanics/threat.md#druid-bear); Q15).

**In the engine** it's an on-next-swing row (the warrior's Heroic Strike queue, §8 "Maul"): queued
off the GCD, paid when its swing lands, one roll on the special table. The swing it replaces gives
no rage, where a landed white swing would give 8.65 [?]
([rage.md](../mechanics/rage.md#yellow-damage-and-on-next-swing-attacks)).

### 4.2 Mangle (bear only; 1238073 at level 60)

- `1.00 × (W_b + 77)`. Savage Fury does **not** apply (the mask excludes it); crits for 2.2×.
- 20 − 5 = **15 Rage**, **6 s cooldown**, 1.5 s GCD.
- Requires Bear or Dire Bear (shapeshift mask 0x90). The Forever wiki page also lists the talent
  as "Mangle (Bear)" [wiki-forever].
- Rank ladder: 26 (talent rank, level 25), 38 (36), 59 (48), 77 (60). Assume the trainer teaches
  ranks 2–4 (Q17).
- [F] [client] (SpellEffect, SpellCooldowns, SpellPower, SpellShapeshift, 1.60.1.69913)
- Threat multiplier unknown; assume ×1.0 before the form modifier (Q15).
- **In the engine**: one roll on the special table (it deals weapon damage, like Shred).

### 4.3 Lacerate (r3, 1235827)

- 15 − 3 (Shredding Attacks 3/3, if taken) Rage, 1.5 s GCD, bleed.
- Bleed: **15 per 3 s × 5 ticks (15 s) per stack, up to 5 stacks** (75 per tick at 5 stacks), ×
  Genesis. The tooltip adds "plus 10% weapon damage per existing application of Lacerate on the
  target" (effect 1, dummy 10).
- **Assumption [?]:** each application also deals an immediate physical hit of
  `0.10 × W_b × (stacks already on the target)`, can crit, and refreshes the bleed's duration. A
  separate spell, 414647, carries a 20% weapon-damage effect whose role is unknown.
- "Causes a high amount of threat": the value is unknown (Q15, Q16).
- In `forever` its ticks may crit [?] (§2.9).
- [F] [client] (SpellEffect, SpellDuration, SpellAuraOptions, 1.60.1.69913: period 3000 ms,
  15,000 ms, `CumulativeAura` 5)
- **In the engine** it's an attack that also bleeds, with a stacking bleed [?] (Q16):
  - One roll on the special table (it deals weapon damage). The hit reads the stacks already on
    the boss: with none, the first application deals no direct damage and can't crit, so it's
    counted as a hit. Rend and Tear applies to the hit; Savage Fury doesn't.
  - A landed application adds a stack (at most 5), and restarts the bleed for every stack, as a
    reapplied Rend does ([damage-and-timing WE-9](../mechanics/damage-and-timing.md#4-dots-and-bleeds)):
    the tick under way is lost, and all the ticks snapshot the application's damage multipliers
    and crit chance (§2.9). A tick due at that very moment lands first.
  - The bleed ends with its fifth tick, 15 s after the last application, and its stacks with it:
    an application at that moment starts again from one stack.
  - Its ticks count on a row of their own, "Lacerate (bleed)", whose casts are the landed
    applications. Hit and ticks make one threat per damage (Q15).

### 4.4 Swipe (r5, 9908)

83 × SF × Feral Instinct (×1.10 × ×1.30) to up to **3** targets. No AP scaling
(`BonusCoefficientFromAP` 0), 20 − 5 = **15 Rage**, 1.5 s GCD. [F] [se-f] [sp-f]

Threat ×1.75 [?] (LibThreatClassic2 only, [ltc2]; Q15).

**In the engine** it rolls twice, miss/dodge/parry and then crit, like Bloodthirst, since it
deals no weapon damage [?] (Q33). Like the warrior's area attacks, Whirlwind and Cleave, it
refunds nothing when it's avoided [?] ([rage.md](../mechanics/rage.md#rage-refunds-on-avoided-abilities)).
One target: 118.69 a Swipe with the default build (W16).

### 4.5 Other bear abilities

| Ability | Numbers | Tag |
| --- | --- | --- |
| Demoralizing Roar r5 | −204 melee AP on nearby enemies at 60 (the level-60 tooltip; in combat, Q32), 30 s, 10 Rage, 1.5 s GCD. Threat 39 per target | [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913) [fc-book] [se-f]; in combat [?] (Q32); threat [?] [ltc2] |
| Faerie Fire (bear) | −505 armor, free, 6 s CD, 1.5 s GCD. Threat 108 | [F] [client] (SpellEffect 9635 #4, #5, 1.60.1.69913: Dire Bear Form (Passive), −100% cost and +6000 ms cooldown on its class mask) [se-f]; threat [?] [ltc2] |
| Growl | Taunt, 8 s CD. Not simmed | [F] [scd-f] |
| Enrage | +10 Rage now, +2 Rage/s for 10 s, 1 min CD, no GCD. −27% (bear) / −16% (dire bear) base armor for 10 s; +5 Rage with Wolfshead | [F] [client] (SpellEffect, 1.60.1.69913) [fc-wolf]; the armor part is a dummy effect (server-side), so only the tooltip gives it |
| Frenzied Regeneration | Not simmed (TPS only) | [F] |
| Bash | Not simmed | |

**In the engine:**

- **Faerie Fire and Demoralizing Roar** are on the spell table, as a warrior's Thunder Clap and
  Demoralizing Shout are (`kind: 'spellTable'`, [warrior.md §7](warrior.md#7-implementation-notes)
  "Spell-table abilities"): they roll spell hit
  ([combat-tables §9](../mechanics/combat-tables.md#9-spell-hit-and-crit-generic); `DefenseType`
  Magic [F]), and deal no damage, so they never crit. Faerie Fire is a binary Nature spell (`SchoolMask` 8 [F]), so the boss's
  resistance also resists it whole: one roll against `miss + (1 − miss) × 6%` at +3 levels
  (resistance 24 [?]), about 16% for the default bear's 11% spell miss. The roar is Physical
  (`SchoolMask` 1 [F]), with no resistance. A landed one puts its debuff on the boss (Faerie Fire's armor, the roar's attack
  power: AP ÷ 14 × the boss's unslowed swing speed off each swing, as the Buffs tab's AP debuffs,
  [encounter §5](../mechanics/encounter.md#5-boss-melee-tank-modeling)) and makes its threat × the
  form's. A miss applies nothing and makes no threat; a missed roar refunds 80% of its 10 rage, as
  a missed melee ability does [?]. Each aura is named after its Buffs entry, which the bear's
  upkeep replaces (the Buffs tab's Faerie Fire and Demoralizing Roar add nothing more while it's
  on). A Demoralizing Shout in the Buffs tab, another warrior's, fills the same attack-power group
  (buffs doc, `ap-reduction`): then it's the one on the boss, and the rotation doesn't cast the roar
  (§6.3 row 5). The Buffs tab shows the roar off, saying the Shout is on the boss instead, and its
  Rotation setting says it isn't used.
  `forever`'s roar is the tooltip's −204, `classicEra`'s −138 (W18).
- **Enrage** is a cast off the GCD: its rage at once and its ticks are energizes, 5 threat a rage
  ([threat.md](../mechanics/threat.md#threat-from-healing-power-gains-and-buffs)); Wolfshead Helm
  adds 5 at once. Before the pull (§6.3), its rage then is there at the pull and makes no threat.
  Its armor loss is read as −16% of **item** armor, added to Dire Bear Form's +360% like the other
  item-armor bonuses (§4.7): the default bear's 1,614 item armor loses 258 of its 8,772 armor
  (Buffs aside) [?] (Q35). The other reading, −16% of the whole form armor, would take about 1,400.

### 4.6 Berserk (bear use)

For 15 s, Mangle has **no cooldown** and hits **up to 3 targets**. 3 min cooldown. The crit part
doesn't affect bear abilities (its mask holds only cat builders). [F] [client] (SpellEffect,
1.60.1.69913)

**In the engine** the no-cooldown part is 417141 #1's −100% cooldown modifier on Mangle's class
mask: a Mangle used while Berserk is up starts no cooldown, and a cooldown already running when
it starts keeps running [?] (Q36). So under Berserk Mangle can take every GCD the rage pays for.
One target: the extra targets add nothing.

### 4.7 Bear armor (low priority: TPS doesn't need it)

- Dire Bear: item armor × (1 + 3.60) [F]/[C] [se-f]. Forever adds a second aura (466, "bonus
  armor %", +360%) next to Classic's aura 142 on the same passive, so it may also multiply bonus
  armor [?].
- Thick Hide 3/3: +3 × level base armor, +2.00 × (defense − 5×level), "further increased by form
  multipliers" [F] [fc-tal].
- A passive 1306459 ("additional base Armor equal to 100% of your Defense skill", with a −600
  flat effect) exists in the Forever client, but no talent or spell grants it [?].
- Model armor only if [rage.md](../mechanics/rage.md) needs damage taken. For rage it doesn't:
  Forever's rage from damage taken reads the hit before armor, `10 × D_pre ÷ max health`
  ([rage.md](../mechanics/rage.md#forever-), [?]; 33 logged hits on likely bears fit it), so bear
  armor matters for survival only. Maximum health does move bear rage.
- **In the engine**, Dire Bear Form's +360% is added to the other item-armor bonuses, as
  RatingBuster's Classic Era code does with Classic's Thick Hide ([C] [rb-vanilla];
  character-stats.md OQ-8). In `forever` its second aura also
  multiplies bonus armor by 4.6 [?] (OQ-8, Q19); `classicEra`'s Dire Bear Form has only the item
  armor aura. Thick Hide's armor isn't modelled (§8). Armor matters to the `classic` damage-taken
  rage model and to survival, not to `forever`'s rage.

### 4.8 Bear threat and druid rage numbers (summary for the shared docs)

| Item | Value | Tag |
| --- | --- | --- |
| Bear/Dire Bear threat modifier | **×1.3** (Bear Form Passive2 21178: +30%). **Feral Instinct adds nothing in Forever**, where Classic 5/5 made it ×1.45 | [F] [client] (SpellEffect, 1.60.1.69913) [fc-tal]; [C] [ltc2] |
| Maul, Swipe | ×1.75 damage-to-threat | [?] [ltc2] (LibThreatClassic2 only; Q15) |
| Faerie Fire | 108 threat (rank 4) | [?] [ltc2] |
| Demoralizing Roar | 39 threat per target (rank 5) | [?] [ltc2] |
| Cower | −1208 (Forever) vs −608 (Classic) at 60 | [F] [client] (SpellEffect, 1.60.1.69913) |
| Mangle, Lacerate | unknown (Lacerate "high threat") | [?] Q15 |
| Enrage | +10 Rage immediately, 20 over 10 s | [F] [client] (SpellEffect, 1.60.1.69913) |
| Furor 5/5 | +10 Rage on shifting into bear (100%) | [F] [client] (SpellEffect 17057, 1.60.1.69913) |
| Primal Fury 2/2 | +5 Rage on any crit in bear (100%) | [F] [client] (SpellEffect 16959, 1.60.1.69913) |
| Natural Reaction 5/5 | +5% dodge; +5 Rage on each dodge (100%) | [F] [fc-tal]; [client] (SpellEffect 417053, 1.60.1.69913) |
| Wolfshead Helm | +5 Rage from Enrage | [F] [fc-wolf] |
| Rage in the other forms | White hits and hits taken give rage only in bear, whose power is rage; an energize adds rage in whatever form it fires in (Furor's and Primal Fury's fire only in bear) ([§8](#8-implementation-notes) "Rage from hits") | [?] (the engine's model; [rage.md](../mechanics/rage.md#bear-druid-rage)) |

---

## 5. Talents

Build codes follow [docs/data/talents.md](../data/talents.md#build-codes-verified). Forever
tooltips are quoted from [fc-tal]; per-rank values come from
`TraitDefinitionEffectPoints` curves [trait-f], which match the raw client files ([client]).
Only talents that touch damage, threat or resources are listed. Movement, stun and stealth
talents are skipped.

### 5.1 Feral Combat

| Talent (tier·col, 1-based) | Ranks: Forever tooltip (max rank) | Sim model | Tag |
| --- | --- | --- | --- |
| Ferocity (1·2) | 5: "Reduces the cost of your Maul, Mangle, Swipe, Claw, and Rake abilities by 5 Rage or Energy." | −1/rank cost | [F] |
| Heart of the Wild (1·3) | 5: "Increases your Intellect by 10%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 20% and while in Cat Form your Strength is increased by 10%." | Cat: Str ×(1 + 0.02·r); bear: Sta ×(1 + 0.04·r); Int ×(1 + 0.02·r) | [F] |
| Feral Swiftness (2·1) | 2: "…movement speed while in Cat Form by 30%, and increases your chance to Dodge by 4%." | +2%/rank dodge (TPS: none) | [F] |
| Feral Instinct (2·2) | 3: "Increases damage done by your Swipe ability by 30% …" | Swipe ×(1 + 0.10·r). **No threat** | [F] |
| Thick Hide (2·4) | 3: see §4.7 | Armor only | [F] |
| Savage Fury (3·2) | 2: "Increases the damage caused by your Claw, Rake, Shred, Maul, and Swipe abilities by 10%." | ×(1 + 0.05·r) on those abilities and on Rake's bleed | [F] |
| Feral Charge (3·3) | 1: bear charge plus cat leap | Not simmed | [F] |
| Sharpened Claws (3·4) | 2: "…critical strike chance while in Bear Form, Dire Bear Form, or Cat Form by 6%." | +3%/rank crit in forms | [F] |
| Shredding Attacks (4·1) | 3: "Reduces the Energy cost of your Shred ability by 18 and reduces the Rage cost of your Lacerate ability by 3." | −6 Energy / −1 Rage per rank | [F] |
| Mangle (4·2, needs Savage Fury 2/2) | 1: "Mangle the target for 100% normal damage plus 26." | Teaches bear Mangle (§4.2) | [F] |
| Predatory Strikes (4·3) | 3: "…melee Attack Power in Cat Form, Bear Form, and Dire Bear Form by 150% of your level." | +0.5·level·r AP in forms | [F]/[C] |
| Primal Fury (4·4, needs Sharpened Claws 2/2) | 2: "…100% chance to gain an additional 5 Rage any time you get a critical strike while in Bear Form or Dire Bear Form. In addition, your non-periodic critical strikes from Cat Form abilities that generate Combo Points have a 100% chance to add an additional Combo Point." | 50%·r chance: +5 Rage per bear crit (white or yellow); +1 CP per builder crit | [F] |
| Predatory Instincts (5·1) | 2: "Increases the critical strike damage bonus of your melee abilities by 20%." | Special crits ×(2 + 0.1·r) … see note below | [F]; [?] interpretation |
| Leader of the Pack (5·2) | 1: "…increases the critical strike chance of all party members within 45 yards by 3%, exclusive with Moonkin Aura." | +3% crit, party | [F] |
| King of the Jungle (5·4) | 3: "Tiger's Fury now instantly grants you 60 Energy." | +20·r Energy on TF | [F] |
| Natural Reaction (6·1) | 5: "Increases your dodge chance by 5%, and gives you a 100% chance to gain 5 Rage each time you dodge." | Bear TPS via [rage.md](../mechanics/rage.md) | [F] |
| Rend and Tear (6·3, needs Predatory Strikes 3/3) | 5: "Increases damage done by your melee abilities on Bleeding targets by 10%." | ×(1 + 0.02·r) on **abilities** (not white) when the target has **any** bleed; excludes periodic ticks | [F]; scope [?] Q9 |
| Berserk (7·2, needs Leader of the Pack) | 1: see §3.7 and §4.6 | | [F] |

**Predatory Instincts.** "Critical strike damage bonus … by 20%" is a percentage modifier on the
crit bonus (`SPELLMOD_CRIT_DAMAGE_BONUS`), so the +100% bonus becomes +120%: a **2.2×** crit. The
mask covers every cat and bear special but not auto attacks. [F] [client] (SpellEffect,
1.60.1.69913); [?] until measured
(Q10). If the game instead adds the 20% to the whole 2.0× multiplier (2.4×), the difference shows
up at once in the Q10 test.

### 5.2 Balance and Restoration talents a feral takes

| Talent | Forever tooltip (max rank) | Sim model | Tag |
| --- | --- | --- | --- |
| Genesis (Balance 1·3) | 5: "Increases the periodic damage and healing done by your spells and abilities by 5%." | Rip, Rake bleed, Lacerate ×(1 + 0.01·r) | [F] (class masks: [client], SpellEffect, 1.60.1.69913) |
| Nature's Majesty (Balance 2·3) | 2: "Increases your critical strike chance with spells and melee attacks by 4%." | +2%·r crit | [F] |
| Nature's Reach (Balance 2·4) | 2: "…range of your offensive Balance spells by 20% and improves your chance to hit by 4%." | **+2%·r melee hit** and spell hit | [F] (auras 54 and 55: [client], SpellEffect, 1.60.1.69913) |
| Furor (Resto 1·3) | 5: see §2.8 | Rage on bear shift; Energy kept on cat shift | [F] |
| Naturalist (Resto 2·1) | 5: "Reduces the cast time of your Healing Touch spell by 0.5 sec and increases all damage you deal by 5%." | ×(1 + 0.01·r) all damage | [F] |
| Natural Shapeshifter (Resto 2·3) | 3: "Reduces the mana cost of all shapeshifting by 30%." | Mana only | [F] |

**Nature's Splendor needs Nature's Majesty.** The client makes Nature's Splendor (Balance 3·3)
require Nature's Majesty (Balance 2·3) through a `TraitEdge` of type 3, "required for
availability" [F] [client] (TraitEdge, 1.60.1.69913). The scraped foreverchanges tree shows no
arrow there ([talents.md](../data/talents.md)). Build validation should enforce the client's
rule. No default here is affected: neither feral build takes Nature's Splendor, and the site's
popular Balance and Restoration builds take both talents.

---

## 6. Rotation and priority

### 6.1 Classic Era community reference (not what Forever should run)

**Cat.** The Classic Era raid rotation is built on powershifting. The wowhead Classic guide by
NerdEgghead (druid-Discord moderator, patch 1.15.8) [wh-rot] gives this decision tree, checked in
order whenever a GCD ends or an Energy tick arrives:

1. ≥ 63 Energy or Clearcasting → Shred.
2. First Shred of the cycle landed and < 12 s left on Faerie Fire → refresh Faerie Fire (Feral).
3. ≥ 4 CP and ≥ 35 Energy → Ferocious Bite (biting at 4 CP sims higher than waiting for 5, because
   crits overflow combo points).
4. ≥ 48 Energy → Shred.
5. More than 20 Energy short of the next action → powershift.
6. Otherwise wait for the tick.

Rip, Rake and Claw (except when forced to the front) are not used. Tiger's Fury is only a pre-pull
button. [C] [wh-rot]. (wowsims/classic's APL does the same: Shred, Bite, powershift, no Rip
[ws-apl]; secondary.)

**Bear.** The commonly described practice is Maul on every swing, Swipe only with spare rage, and
Faerie Fire (Feral) as a free filler [?]. The only detailed write-up found (wowhead's tank rotation
page) is labelled *Season of Mastery*, so it is **not** cited as a source, and the bear thresholds
below are [?] (Q31). The underlying numbers are Maul ×1.75 (LibThreatClassic2 only, [?],
[ltc2]) and Swipe's flat damage ([F] client data).

### 6.2 Forever cat priority

Why Forever differs from the Era rotation:

- There's no powershifting (§2.8).
- Tiger's Fury is a +15%, 30 s, +60 Energy cooldown.
- Shred is cheaper (42) but weaker per Energy.
- Berserk exists.
- Rend and Tear rewards keeping the target bleeding.

The Shred/Bite core of the Era tree carries over. The list below was first a **Forever
derivation** [?]; the sim then tuned its thresholds ("Tuning the defaults" below). It's evaluated
at every decision point: GCD ready, Energy tick, Clearcasting gained, a cooldown ready, a debuff
or bleed expiring, a fight-time threshold. Each line is used when its ability is usable (off
cooldown, the Energy and combo points for it, the GCD free if it needs it) and its conditions
hold.

**Off-GCD (checked first, may fire alongside a GCD action):**

1. **Berserk** on cooldown, with the talent.
2. The racial cooldown (Night Elf: Elune's Light, §7.2) and on-use items (the Manual Crowd
   Pummeler, Weakness Analyzer) on cooldown. All have 3 min cooldowns, so they line up with
   Berserk from the pull.
3. **Tiger's Fury** at `Energy ≤ 100 − its Energy + tigersFury.maxEnergyLost` (its Energy: 60 at
   King of the Jungle 3/3, 80 with Wolfshead Helm; W8).
4. The Mighty Rage Potion once, with Berserk (at the pull without it), and Juju Flurry on
   cooldown, when they're selected in Buffs.

**On the GCD:**

5. **Faerie Fire** when it's off the boss; and with at most `faerieFire.refreshBelowSec` left while
   Energy is below the builder's cost, so the GCD comes out of waiting time.
6. With **Clearcasting** up, the builder (**Shred**, or **Claw** where Shred can't be used): it's free.
7. **Rip** at ≥ `rip.minComboPoints`, when it's off the boss (or has at most
   `rip.refreshBelowSec` left), with at least `rip.minFightLeftSec` of the fight left. Not at all
   with `rip.onlyWithoutOtherBleeds` while others keep the boss bleeding.
8. At ≥ `ferociousBite.minComboPoints`: **Ferocious Bite** at any Energy in the last
   `ferociousBite.anyEnergyLastSec` of the fight; otherwise the builder first while Energy ≥
   `ferociousBite.shredFirstFrom` (Bite converts surplus Energy at only 2.7 a point), then
   **Ferocious Bite** (with `ferociousBite.onlyWhileRipUp`, only while Rip is up or too little of
   the fight is left for one).
9. **Rake** when it's off the boss, with at least its 9 s of the fight left; with
   `rake.onlyWithoutBleeds`, only while nothing else bleeds the boss (no Rip of yours, no
   warriors in the raid).
10. The builder: **Shred** from behind, **Claw** from the front (or with Shred off).
11. Otherwise wait for the next event.

No powershifting: in Forever it gains nothing (§2.8), so the rotation offers none, and the
Rotation tab's intro says so. Cower and the Prowl openers aren't simulated (§3.9). No line reads
the execute phase, so the Fight tab leaves it out for a druid (a control that changes nothing
isn't shown, [ux.md](../ux.md) "Fight").

**Settings** (the Rotation tab; ids `druid.cat.<ability>.<param>`), with the tuned defaults:

| Setting | Default | Meaning |
| --- | --- | --- |
| `berserk.enabled` | **on** | Berserk on cooldown (needs the talent) |
| `racial.enabled` | **on** | Elune's Light on cooldown (Night Elf) |
| `onUseItems.enabled` | **on** | The Manual Crowd Pummeler, Weakness Analyzer and Earthstrike on cooldown, if worn |
| `tigersFury.enabled`, `tigersFury.maxEnergyLost` | **on**, **20** | Tiger's Fury once at most this much of its Energy would be lost at the cap. The doc's `tfMaxEnergy` = 100 − its Energy is the 0 of this setting; tuning prefers 20 (below) |
| `faerieFire.enabled`, `faerieFire.refreshBelowSec` | **on**, **12 s** ([C] [wh-rot] refresh window) | Keep your own Faerie Fire up (the Buffs tab's then adds nothing). The raid's Faerie Fire is assumed to be yours, so with this off the Buffs tab's is off by default too; turn it on there if another druid keeps it up (below) |
| `shred.enabled` | **on** | Shred builds, from behind (the Fight tab's position) |
| `claw.enabled` | **on** | Claw builds where Shred can't: from the front, or with Shred off |
| `rip.enabled`, `rip.minComboPoints`, `rip.minFightLeftSec`, `rip.refreshBelowSec` | **on**, **5**, **8 s**, **0 s** | Rip policy. The doc's 10 s is `ripMinRemaining`; tuning prefers 8 |
| `rip.onlyWithoutOtherBleeds` | **off** | The doc's `ripOnlyIfNoOtherBleed`. Off in both profiles: in the sim Rip beats Bite even with a raid bleed, including in `classicEra`, where Rip's ticks can't crit. Turning it on in the default raid loses 55.72 DPS (−9.8%) in `forever` and 24.03 (−4.3%) in `classicEra` (W12, Q26) |
| `ferociousBite.enabled`, `ferociousBite.minComboPoints` | **on**, **5** | Bite threshold. The Era's 4 (Primal Fury's overflow) is the doc's first default; tuning prefers 5 |
| `ferociousBite.shredFirstFrom` | **35** | Energy at or above which to Shred before biting. 35 to 42 mean the same (Shred costs 42): Bite only when there isn't Energy for a Shred. The doc's first default was 67 (42 + 35 − 10) |
| `ferociousBite.anyEnergyLastSec` | **4 s** | In the last this many seconds, Bite at the combo points without a Shred first: the Energy has no time left to become Shreds. 0 is never. Tuning's (below) |
| `ferociousBite.onlyWhileRipUp` | **off** | Hold combo points for Rip while it's down. With both thresholds at 5 it changes nothing |
| `rake.enabled`, `rake.onlyWithoutBleeds` | **off**, **on** | Low damage per Energy ([C] [wh-rot]); try it only when nothing else bleeds |
| `ragePotion.enabled`, `jujuFlurry.enabled` | **on**, **on** | Only when selected in Buffs (the Max consumables preset has the potion) |

**Your Faerie Fire or another druid's.** The Standard raid's Faerie Fire is assumed to be the
cat's own, the way [D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)'s
amendment treats a tank's duties: no preset adds the Buffs tab's for the cat
(`SpecMeta.ownBuffs`). With `faerieFire.enabled` on, the Buffs tab shows it on and locked, since
you keep it up yourself. With it off, the Buffs tab's is off by default and unlocked, and its help
says to turn it on if another druid keeps it up. What you set there stays set. In the default
setup, turning your Faerie Fire off loses **32.97 DPS (−5.80%), 95% CI −33.19 to −32.75** (seed 1,
40,000 paired fights), and 32.92 (−33.02 to −32.82) on a fresh seed (20260923, 200,000 fights).
With another druid's Faerie Fire on in Buffs instead, it gains +2.40 (+2.17 to +2.62, seed 1),
since the cat spends no GCDs on it and it's up from the pull. That gain is the raid's composition,
not the rotation, so under D23 it doesn't change the default, as
[warrior.md §5.3](warrior.md#53-arms-two-hander) records for Arms' own Battle Shout.

**Others' bleeds.** The doc's `targetBleedingFromOthers` isn't a setting: the plan reads it from
the Buffs tab's raid. With warriors in it (the default raid), the boss bleeds from their Deep
Wounds all fight [?], which feeds Rend and Tear and the two "only when nothing else bleeds"
settings. A raid without warriors turns it off.

**Tuning the defaults** (decision D23; `scripts/tune/rotation.mjs --spec druid-feral-cat`, the
engine of this commit). The search started from the priority above with the doc's first defaults
(Bite at 4, Shred first from 67 Energy, Rip with 10 s left, Tiger's Fury without losing Energy),
on the default setup (Tauren, pre-raid BiS, the Standard raid preset, a 180 s ± 10% fight, 3,731
armor, execute 20%). Coordinate descent over every setting, 40,000 paired fights per candidate on
seed 1, adopting a value only when its 95% interval was above zero:

| Step | Change | Δ DPS (95% CI), seed 1 |
| --- | --- | --- |
| 1 | `ferociousBite.minComboPoints` 4 → 5 | +16.93 (+16.68 to +17.18) |
| 2 | `ferociousBite.shredFirstFrom` 67 → 35 | +2.54 (+2.35 to +2.73) |
| 3 | `rip.minFightLeftSec` 10 → 8 | +0.31 (+0.29 to +0.34) |
| 4 | `tigersFury.maxEnergyLost` 0 → 20 | +0.94 (+0.73 to +1.15) |
| 5 | `ferociousBite.anyEnergyLastSec` 0 → 4 (a setting the review added, CL7) | +0.83 (+0.80 to +0.87) |

A second pass changed nothing. Step 5 swept 1 to 12 s: every window gains, 4 s the most (3 s
+0.77, 5 s +0.57, 6 s +0.40, 12 s +0.26); against it, the other settings' neighbours all lose or
don't clear (Bite at 4 −4.64, Rip with 7 or 9 s −0.11 and −0.07, Tiger's Fury losing 15 or 25
−0.12 and −0.03, Faerie Fire again with 14 s −0.06). No other setting cleared the bar. Against the tuned set on seed 1
(40,000 fights; every interval below zero): Rip at 4 −0.52, Rip again with 1 s left −0.91, Faerie
Fire only once it has run out −0.40, Rake kept up whatever bleeds −19.12 (with the default raid,
"only when nothing else bleeds" gives it no line), and without Berserk −18.43, the on-use items
−23.16, Rip −56.22, Tiger's Fury −78.35 or Ferocious Bite −0.65. Bite does little in the tuned
rotation: at 5 combo points the cat Shreds whenever it can afford one, so it bites only at 35–41
Energy with Rip up.

**Confirmation on a fresh seed** (20260923, never used by the search), 400,000 paired fights: the
tuned defaults against the doc's first ones, **+20.39 DPS (+3.73%, 547.05 → 567.44), 95% CI
+20.31 to +20.47**. Each change alone, reverted from the tuned set on that seed, loses: Bite at 4
−4.43 (−4.49 to −4.38), Shred first from 67 −3.38 (−3.44 to −3.31), Rip with 10 s −0.28 (−0.29 to
−0.27), Tiger's Fury without loss −0.95 (−1.02 to −0.89).

**Robustness** (the fresh seed, 200,000 paired fights each): the tuned defaults gain +20.14
(+3.25%) at 60 s, +20.44 (+3.74%) at 180 s and +20.52 (+3.78%) at 300 s, each 95% CI above
+19.9. The execute phase changes nothing for a cat (no line reads it): 0% and 20% give identical
fights. Reverting each change still loses at 60 s and 300 s (Rip with 10 s: −0.66 and −0.12; Tiger's
Fury without loss: −3.59 and −0.62; all intervals below zero).

**Step 5's confirmation** (the review's end-of-fight Bite, CL7): on the fresh seed, 400,000 paired
fights, `ferociousBite.anyEnergyLastSec` 4 against 0 gains **+0.82 DPS (+0.15%), 95% CI +0.81 to
+0.84** (3 s +0.76, 5 s +0.57). It holds at 60 s (+2.81, +0.44%), 300 s (+0.65), without an
execute phase (+0.83) and from the front (+1.97), each over 200,000 fights with its interval above
zero. It gains most in short fights, where the last seconds are a larger share.

Why they win: Energy, not the GCD, limits a cat, and a Bite turns spare Energy into 2.7 damage a
point where a Shred makes about 11. So the tuned cat Shreds whenever it can afford to and bites at
exactly 35–41 Energy, at 5 combo points, with Rip kept up in between; and a Tiger's Fury a little
early is worth more than its lost Energy, since its cooldown starts sooner.

### 6.3 Forever bear priority (TPS)

This is derived for Forever [?]. Mangle and Lacerate have no Classic analogue, and their threat
multipliers are unknown (Q15).

**A tank's duties come first** ([D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)).
The bear's duties are its two raid debuffs on the boss: **Demoralizing Roar**, the attack-power
debuff (the raid's, which the bear keeps itself: no preset gives it a warrior's Demoralizing
Shout), and **Faerie Fire**, the armor debuff. Both are the bear's own, so no preset adds the
Buffs tab's ([buffs doc §6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset)).
Enrage in combat isn't a duty: its armor loss costs 0.14% more damage taken for 3.8% more TPS
(below), so the search decides it. Each duty is a setting, so the Max TPS priority (below) drops
the roar by moving its default.

**Priority** (`druid.bear.priority`, a choice at the top of the Rotation tab), per
[D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23),
as Protection's ([warrior.md §5.4](warrior.md#54-protection-tps)):

- **Tank duties first** (`duties`, the default) keeps both duties up from the pull, by the duty
  rule below. The table's defaults are this choice's.
- **Max TPS** (`maxTps`) drops the roar (row 5 is off by default) and refreshes Lacerate from
  4.5 s left, from a first-pass search on TPS alone ([Max TPS](#max-tps-b4) below). It keeps
  Faerie Fire: for a bear its armor is threat, since it makes every attack hit harder, and
  dropping its upkeep costs 1% of TPS. The Buffs tab's Demoralizing Roar is the bear's own, so no
  preset turns it on: with Max TPS the boss is at full attack power unless you turn it on there
  because another druid keeps it up.

The choice moves only defaults, as Protection's does: a value you set yourself still wins.

**The duty rule.** The duties' timing follows one fixed rule, and the search never tunes it
([D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)'s
amendment):

- The duties come first in the priority, before any threat ability on the global cooldown: the
  roar and Faerie Fire are rows 5 and 6, the first lines on the global cooldown. Only off-GCD rows
  (Berserk, Enrage, the Maul queue) come before them.
- A duty that isn't a debuff on the boss is used when it's ready. The bear has none: both of its
  duties are debuffs.
- A debuff, with or without a cooldown, is refreshed as soon as a missed cast could still be tried
  again before it falls off: from its own cooldown, or from one global cooldown if it has none. So
  Faerie Fire is refreshed with 6 s left, its cooldown, and Demoralizing Roar, which has none, with
  1.5 s left.

The refresh times stay settings, whose help says what the rule is, so you can change them; D23's
search tuned only the threat abilities around the duties, on TPS with DPS beside it
([Tuning the defaults](#tuning-the-defaults-b3) below). Against the tuned timing it replaced (both
refreshed with 3 s left) the rule costs nothing: it makes 0.25% more TPS and DPS, for the same
damage taken, since the roar goes out a little less often (below).

**In the engine** (`src/sim/classes/druid/bear.ts`), whenever the bear can act (a GCD ends, rage
arrives, a cooldown or debuff runs out):

**Off-GCD:**

1. **Berserk** on cooldown, with the talent (one target: Mangle without a cooldown for 15 s).
2. **Enrage** 1.5 s before the pull (`enrage.prepull`), and in combat on cooldown
   (`enrage.inCombat`), at rage ≤ `enrage.maxRage`.
3. **Elune's Light** (Night Elf) and on-use items the sim models on cooldown; the **Mighty Rage
   Potion** once, the first time rage ≤ `ragePotion.maxRage`, and **Juju Flurry** on cooldown,
   when they're selected in Buffs.
4. **Maul** queued on the next swing at rage ≥ `maul.minRage`. Classic practice is to Maul every
   swing ([?], §6.1, Q31). §6.3 first proposed an automatic threshold (Maul's cost, plus Mangle's
   when Mangle comes off cooldown within the swing); the sim takes a number, which the search
   tunes.

**On the GCD:**

5. **Demoralizing Roar** (duty) when it's off the boss or has ≤ `demoRoar.refreshBelowSec` left
   (1.5 s by the duty rule), unless it lasts to the end of the fight. Not while a Demoralizing
   Shout in the Buffs tab (another warrior's) fills the same attack-power group: only one applies,
   so the roar would change nothing on the boss (§4.5). The Rotation tab says why it's not used,
   and the Buffs tab shows the roar off, the Shout being on the boss instead.
6. **Faerie Fire** (duty) the same, with `faerieFire.refreshBelowSec` (6 s by the duty rule).
7. **Mangle** whenever it's ready, with the talent.
8. **Lacerate** while it has fewer than 5 stacks, or at 5 with ≤ `lacerate.refreshBelowSec` of its
   bleed left. With `lacerate.onlyWithoutOtherBleeds` (off by default), only while nothing else
   keeps the boss bleeding (a raid without warriors, whose Deep Wounds Rend and Tear counts, §5.1);
   the Rotation tab then says why it's not used.
9. **Swipe** at rage ≥ `swipe.minRage` (the Classic "spare rage" rule), when it's on. §6.3's target
   count (`swipeMinTargets`) is left out: the sim has one target.
10. **Faerie Fire** as a filler whenever it's ready (`faerieFire.filler`): free, 108 threat.

| Setting (`druid.bear.…`) | Default | Notes |
| --- | --- | --- |
| `berserk.enabled` | **on** | Needs the talent |
| `enrage.prepull` | **on** | 12 rage at the pull; 16% less item armor for its first 8.5 s |
| `enrage.inCombat`, `enrage.maxRage` | **on**, 70 | Tuned (below). Its armor loss ([F] [se-f] tooltip: −27%/−16% base armor) costs 0.14% more damage taken; 70 is the cap minus its 30 rage |
| `racial.enabled`, `onUseItems.enabled` | **on**, **on** | Elune's Light (Night Elf); Weakness Analyzer and Earthstrike, the on-use trinkets the sim models |
| `faerieFire.enabled`, `faerieFire.refreshBelowSec` | **on** (duty; on with Max TPS too), 6 s | Free in form, 6 s CD; the refresh is its cooldown, by the duty rule. The Buffs tab's Faerie Fire adds nothing more while it's on, and is off by default when it's off (the bear's own, in no preset) |
| `priority` | **Tank duties first** | Or Max TPS ([below](#max-tps-b4)), which moves the defaults marked "Max TPS" |
| `demoRoar.enabled`, `demoRoar.refreshBelowSec` | **on** (duty; off with Max TPS), 1.5 s | 10 rage; the refresh is one global cooldown, by the duty rule. The Buffs tab's Demoralizing Roar adds nothing more, and is off by default when it's off; a Demoralizing Shout there takes its place, so the roar isn't used (§4.5). No preset has a warrior's Shout for the bear |
| `maul.enabled`, `maul.minRage` | **on**, 20 | Tuned (below): from 20, rage stays for Mangle and Lacerate |
| `mangle.enabled` | **on** | Needs the talent |
| `lacerate.enabled`, `lacerate.onlyWithoutOtherBleeds`, `lacerate.refreshBelowSec` | **on**, **off**, 6 s (4.5 s with Max TPS) | Kept with the raid's warriors: leaving it out rests on its untested threat (below); refresh tuned |
| `swipe.enabled`, `swipe.minRage` | **off**, 60 | Tuned (below); 60 is the [?] rule of thumb, see §6.1, Q31 |
| `faerieFire.filler` | **on** | Keeps Faerie Fire up too |
| `ragePotion.enabled`, `ragePotion.maxRage` | **on**, 25 | The cap minus 75; needs the potion selected in Buffs |
| `jujuFlurry.enabled` | **on** | Needs it selected in Buffs (not in the bear's presets) |

#### Tuning the defaults (B3)

The defaults above are the best rotation found on 2026-09-24, per
[D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23), on TPS, the
tank's headline, around the duties and their fixed timing (the duty rule above,
[D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)'s
amendment); [D18](../decisions.md#d18-tank-specs-report-tps-and-dps-as-equals-2026-09-22) keeps
DPS beside it. Over 400,000 paired fights on seed 12104, which no search used:

| Against | TPS | Δ TPS (95% CI) | DPS | Δ DPS (95% CI) | Δ damage taken (95% CI) |
| --- | --- | --- | --- | --- | --- |
| The first priority as built (`8d7bbad`) | 649.23 → 685.75 | +36.52 (+36.36 to +36.68), +5.62% | 337.28 → 359.04 | +21.76 (+21.68 to +21.84), +6.45% | +0.75 (+0.72 to +0.78), +0.13% |
| The first round's tuned defaults (`eaf7034`) | 675.29 → 685.75 | +10.46 (+10.30 to +10.62), +1.55% | 326.18 → 359.04 | +32.86 (+32.79 to +32.94), +10.08% | +8.22 (+8.19 to +8.25), +1.45% |
| The second round's, with tuned duty timing (`dacd315`) | 684.02 → 685.75 | +1.72 (+1.57 to +1.88), +0.25% | 358.14 → 359.04 | +0.90 (+0.83 to +0.98), +0.25% | −0.01 (−0.04 to +0.02), −0.00% |

Each baseline runs on its own engine and settings in today's setup (so with Faerie Fire's
resistance, §4.5, and no Thunder Clap). The three are the rebased `11e9fbf`, `9377c50` and
`92ae3d0` (rebased onto Warrior Protection's main), which give the same fights. Damage taken is the health the boss's swings cost a second
(574–575 for the defaults). Against the first round it's 1.45% higher: the first round left
Lacerate out, and Lacerate's attacks give the boss more to parry, each parry hastening its next
swing ([encounter §5](../mechanics/encounter.md#5-boss-melee-tank-modeling)). Without parry haste
Lacerate changes nothing there (538.84 and 538.82 a second, 20,000 fights); with it, leaving
Lacerate out takes 1.28% off (575.32 → 567.98, seed 12107).

- **Method.** As Arms' ([warrior.md §5.3](warrior.md#tuning-the-defaults-m25a)):
  `scripts/tune/rotation.mjs --spec druid-feral-bear` runs the real engine with common random
  numbers and compares TPS, with each candidate's Δ DPS and Δ damage taken beside it from the same
  fights. The setup is the default bear (Tauren, the 8/43/0 build, pre-raid BiS with Warden
  Staff, the Standard raid buffs, 180 s ± 10%, armor 3,731), the rotation aside. Its raid has no
  Thunder Clap or Demoralizing Shout, a warrior tank's duties
  ([buffs doc §6.1](../mechanics/buffs-debuffs-consumables.md#61-composition-flags-not-factions)).
  A raid without warriors is `--raid=-warrior`: it drops the buffs only a warrior brings
  (Battle Shout, Sunder Armor), as the Buffs tab's class button does. The execute phase changes
  nothing: the bear reads nothing from it (0% and 20% give the same fights).
- **Three rounds.** The first (seeds 1–9, confirmed on 3131 and 3132) left Lacerate out while the
  raid's warriors keep the boss bleeding, and kept Enrage out of combat as a duty. The review
  (BL1, BL2) undid both: dropping Lacerate rests on its untested threat, and Enrage in combat
  isn't a duty. The second round searched from there on seeds 11–18 (40,000–100,000 fights a
  candidate), option by option with each adopted change in the base (coordinate descent), and was
  confirmed on seed 7474, with the robustness grid on seed 7475. The third set the duties' timing
  by the duty rule (PW4) and searched the threat abilities again around it, on seeds 12001–12004
  (100,000–400,000 fights a candidate), confirmed on seed 12101 (400,000): nothing moved (below).
- **What the search may change.** Only the threat abilities: Maul, Mangle, Lacerate, Swipe,
  Enrage and the Faerie Fire filler. The duties' timing is the rule's. A change that costs a larger
  share of DPS than it gains in TPS isn't adopted, nor is dropping an ability whose gain rests on
  an untested threat value.

| Setting | Old → new | In the winner, Δ TPS (95% CI) | Δ DPS |
| --- | --- | --- | --- |
| `enrage.inCombat` | off → on | +25.58 (+25.45 to +25.71), +3.88% | +8.07, +2.30% |
| `maul.minRage` | 10 → 20 | +4.61 (+4.45 to +4.77), +0.68% | +7.28, +2.07% |
| `lacerate.refreshBelowSec` | 3 → 6 s (first round) | +6.39 (+6.24 to +6.54), +0.94% | +4.64, +1.31% |
| `swipe.enabled` | on → off (first round) | +1.30 (+1.23 to +1.37), +0.19% | +0.40, +0.11% |
| `lacerate.onlyWithoutOtherBleeds` | on → off (the review) | −5.55 (−5.71 to −5.39), −0.80% | +26.30, +7.93% |

"In the winner" is the second round's winner against a copy with that change reverted, on seed
7474 (400,000 fights); the % is of the reverted copy. The third round kept every one of them.

- **The third round** (the duty rule). Against the defaults, on the fresh seed 12101 (400,000
  fights), no threat setting's neighbour clears D23's bar on TPS:

  | Change | Δ TPS (95% CI) | Δ DPS |
  | --- | --- | --- |
  | `maul.minRage` 18 | −0.17 (−0.29 to −0.04), −0.02% | −0.91, −0.25% |
  | `maul.minRage` 22 | −0.16 (−0.29 to −0.03), −0.02% | +0.82, +0.23% |
  | `lacerate.refreshBelowSec` 5.5 | −0.58 (−0.72 to −0.44), −0.08% | −2.18, −0.61% |
  | `lacerate.refreshBelowSec` 7 | +0.05 (−0.10 to +0.19), +0.01% | −0.54, −0.15% |
  | Swipe from 80 rage | −0.08 (−0.10 to −0.05), −0.01% | −0.02 |
  | `enrage.inCombat` off | −25.77 (−25.89 to −25.64), −3.76% | −8.17, −2.28% |
  | `enrage.prepull` off | −0.11 (−0.20 to −0.01), −0.02% | −0.13, −0.04% |
  | Lacerate off | +5.15 (+4.99 to +5.31), +0.75% | −26.31, −7.33% |

  The search seeds found the same (seed 12001, 100,000 fights: Maul from 10 to 40 in steps of 2,
  20 best with 18 and 22 level; seed 12002: Lacerate's refresh from 3 to 9 s, 6 s best with 6.5
  and 7 level, 7.5 s and later −1.0% or worse; seed 12003: Enrage's limit level from 50 up, Swipe
  from 40 to 90 rage −1.29% to −0.01%, Mangle off −5.16%, the filler off −1.78%; seed 12004,
  400,000 fights, the closest again). Lacerate off gains TPS only for 7.3% of the DPS, and rests on
  its untested threat (below), so it isn't adopted.
- **Enrage in combat** makes 3.8% more TPS and 2.3% more DPS for 0.14% more damage taken
  (575.32 → 574.50 a second without it, −0.82, −0.87 to −0.77; seed 12107, 100,000 fights): it's
  up 18% of the fight, and its armor loss is 16% of item armor (§4.5). Its limit,
  `enrage.maxRage`, is level from 40 up, since the bar is rarely that full (10: −0.21%, 0: −3.7%;
  seed 12). In a 30 s fight it never fires: the pre-pull Enrage's 1 min cooldown outlasts it.
- **Maul from 20** leaves rage for Mangle's and Lacerate's global cooldowns. It's the default
  fight's best, not every fight's (seed 18, 100,000 fights, against 10): −2.07% at 30 s, −0.70% at
  60 s, −0.08% at 90 s, +0.68% at 180 s and +0.75% at 300 s. Its DPS gains from 60 s on
  (+1.2–2.3%). While Lacerate builds its stacks, their rage makes little threat, so in short
  fights Maul does more with it; the setting's help says so.
- **Lacerate kept** (the review, BL1). With the Standard raid's warriors on the boss, their Deep
  Wounds already turn on Rend and Tear [?] (Q9), so Lacerate adds only its own damage and threat,
  and costs 1.28% more damage taken (its parries, above). As modelled, one threat per damage (Q15),
  leaving it out would gain 0.75% TPS for 7.3% of the DPS, which the DPS rule doesn't adopt. Its
  tooltip's "high threat" makes a bonus likely, and a small one turns the TPS round too [?]:
  leaving it out wins only if Lacerate adds less than about **+40 threat per landed application,
  or ×1.1** on its hit and ticks (seed 7476, 40,000 fights, on the second round's defaults; +50
  gains 0.20% by keeping it, +100 1.23%, +150 2.26%; ×1.2 0.91%). With the first round's Maul from
  10 the break-even was about **+200, or ×1.6** (seed 4242, 20,000 fights). Both are D24 effect
  estimates in Q15. In short fights Lacerate costs more as modelled, since its first applications
  deal little: 5.2% of TPS at 30 s and 3.9% at 60 s against leaving it out (seed 18, 100,000
  fights), and at 30 s 0.8% of DPS too.
- **Lacerate's refresh at 6 s** acts in the default setup: at 6 s left the refresh comes right
  after a tick, with a GCD's slack before the bleed runs out. On the second round's robustness
  grid (seed 7475, 200,000 fights, 6 s against 3 s), with the raid's warriors: level at 30 s (the
  stacks never need a refresh), −0.12% at 60 s, +0.93% at 180 s and +0.88% at 300 s; without
  warriors (`--raid=-warrior`): level, −0.11%, +1.06% and +1.03%.
- **No Swipe.** On one target it's 118.69 damage for 15 rage and a GCD, and Maul does more with
  the rage (above).
- **Not adopted** in the second round (on search seeds, against the winner or its predecessor):
  the potion up to 0 rage (−3.3%; 10–50 is the same as 25: it's drunk at the pull); Berserk off
  (−0.92%), Mangle off (−4.95%), the Faerie Fire filler off (−1.95%).
- **The duty rule's cost** against the tuned timing it replaced (both debuffs refreshed from 3 s
  left, `dacd315`; seed 12104, above): nothing. It makes +0.25% TPS and +0.25% DPS for the same
  damage taken. From 1.5 s left the roar goes out 7.45 times a fight rather than 7.80, and its
  uptime is 99.68% rather than 99.86%, since a roar that misses is cast again as it falls off;
  Faerie Fire's refresh at 6 s changes nothing, since the filler keeps it fresh (98.40% either way;
  seed 12103, 40,000 fights). By fight length (seed 12105, 200,000 fights): level at 30 s, +0.21%
  TPS at 60 s, +0.26% at 180 s and +0.23% at 300 s.
- **Robustness** (seed 12105, which no search used, 200,000 paired fights each): the defaults
  against the first two baselines by fight length. They lose in short fights: Lacerate as
  modelled (above) and Maul from 20 (−2.07% at 30 s, −0.70% at 60 s) cost more there than
  in-combat Enrage gains (nothing at 30 s, +0.60% at 60 s).

  | Fight | Δ TPS vs `8d7bbad` | Δ DPS vs `8d7bbad` | Δ TPS vs `eaf7034` | Δ DPS vs `eaf7034` |
  | --- | --- | --- | --- | --- |
  | 30 s | −18.23 (−18.53 to −17.94), −2.29% | −1.34, −0.32% | −50.83 (−51.23 to −50.43), −6.13% | −5.54, −1.32% |
  | 60 s | −1.02 (−1.34 to −0.70), −0.15% | +6.39, +1.75% | −30.79 (−31.14 to −30.43), −4.20% | +11.39, +3.16% |
  | 180 s | +36.55 (+36.33 to +36.78), +5.63% | +21.76, +6.45% | +10.45 (+10.23 to +10.68), +1.55% | +32.84, +10.07% |
  | 300 s | +39.36 (+39.18 to +39.54), +6.21% | +24.02, +7.27% | +11.29 (+11.11 to +11.47), +1.70% | +34.48, +10.77% |

- **What the duties cost** (seed 12106, 100,000 fights, against the defaults). A duty the bear
  drops leaves the boss without it: the Buffs tab's copy is off by default, the bear's own (BU3).

  | Change | Δ TPS (95% CI) | Δ DPS | Δ damage taken |
  | --- | --- | --- | --- |
  | Demoralizing Roar off | +24.56 (+24.23 to +24.89), +3.58% | +11.57, +3.22% | +3.23, +0.56% |
  | Demoralizing Roar refreshed once it has run out (0 s) | +0.77 (+0.47 to +1.07), +0.11% | +0.40 | −0.01 |
  | Demoralizing Roar refreshed from 3 s left (the tuned timing) | −1.83 (−2.14 to −1.53), −0.27% | −0.93 | +0.01 |
  | Faerie Fire refreshed from 3 s left | −0.00 (−0.06 to +0.06) | +0.00 | +0.01 |
  | Faerie Fire's upkeep off, the filler on | −5.78 (−6.10 to −5.45), −0.84% | −1.70 | −0.03 |
  | No Faerie Fire at all | −61.56 (−61.87 to −61.24), −8.98% | −22.32, −6.22% | +0.19 |

  The roar's −204 attack power takes 0.56% off the damage the boss's swings do, for 3.6% of the
  TPS its rage and global cooldowns would make. Faerie Fire is threat for a bear (108 a free
  GCD), so a search on TPS alone keeps it; its upkeep line puts it up from the pull.

#### Max TPS (B4)

The **Max TPS** priority is a first pass on TPS alone, per
[D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)
and [D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)
(one quick search, about 20,000 fights on one seed; the tuning milestone brings it up to D23). It
drops Demoralizing Roar, keeps Faerie Fire, and refreshes Lacerate from 4.5 s left. Against the
default (tank duties first), over 100,000 paired fights on seed 13010:

| | Tank duties first | Max TPS | Δ (95% CI) |
| --- | --- | --- | --- |
| TPS | 685.75 | 711.63 | +25.88 (+25.55 to +26.21), +3.77% |
| DPS | 359.03 | 368.67 | +9.64 (+9.48 to +9.80), +2.69% |
| Damage taken a second | 575 | 578 | +2.60 (+2.54 to +2.67), +0.45% |

What it costs is the roar's −204 attack power on the boss, which is small for a bear: its swings
cost 0.45% more health a second. With no roar to pay for, its 10 rage and a global cooldown every
30 s go to Maul, Mangle and Lacerate: that's the TPS and the DPS.

| Setting | Tank duties first → Max TPS | In the winner, Δ TPS (95% CI) | Δ DPS |
| --- | --- | --- | --- |
| `demoRoar.enabled` | on → off | +28.09 (+27.76 to +28.42) | +12.72 |
| `lacerate.refreshBelowSec` | 6 → 4.5 s | +1.22 (+0.92 to +1.51) | −2.01 |

"In the winner" is Max TPS against a copy with that change reverted, on seed 13010 (100,000
fights). Every other setting keeps the default's value.

- **Method.** `scripts/tune/rotation.mjs --spec druid-feral-bear --base demoRoar.enabled=false`,
  in the default setup ([Tuning the defaults](#tuning-the-defaults-b3)), on TPS, 20,000 fights on
  seed 13002 a candidate: Maul's threshold from 10 to 40 in steps of 2, Lacerate's refresh from 3
  to 9 s, Swipe from 30 to 90 rage, and each of Faerie Fire's upkeep, its filler, its refresh (3
  and 10 s), Enrage (in combat, its limit, before the pull), Mangle and Lacerate. Lacerate's
  refresh from 3.5 to 5 s was checked on seed 13003 too.
- **Faerie Fire stays** (D26: Max TPS drops a duty for threat, and this one makes threat). Its
  −505 armor makes every attack hit harder, and it's 108 threat for a free global cooldown.
  Dropping its upkeep line leaves only the filler to put it up, later in the fight and after each
  lapse: −7.42 TPS (−1.04%, −7.75 to −7.09) and −2.47 DPS (−0.67%). With the filler off too, no
  Faerie Fire at all: −66.86 TPS (−9.40%) and −24.28 DPS (−6.59%), of which the armor is most
  (seed 13010, 100,000 fights, against Max TPS).
- **Lacerate from 4.5 s left.** With the roar's global cooldowns free, a later refresh costs fewer
  of the bleed's ticks: +0.14% to +0.18% TPS from 4 to 5 s on both seeds, at 0.6–0.8% of the DPS,
  which Max TPS doesn't weigh. 6 s stays the default's (the DPS rule, above).
- **Maul from 20** stays: 18 and 22 are level, 24 and up and 12 and down worse (−0.10% to
  −1.04%). **Swipe** stays off (from 90 rage level, below it −0.04% to −3.96%), as does everything
  else: Faerie Fire's refresh at 3 or 10 s and Enrage's limit at 50 are level; Enrage in combat
  off −3.54%, Lacerate off −1.25%, Mangle off −7.71%, the filler off −1.84%.
- **The Buffs tab's Demoralizing Roar** is the bear's own and in no preset, so with Max TPS nobody
  keeps it up by default; turned on there, another druid's counts from the pull. Faerie Fire's
  switch there stays the bear's own, kept up by its rotation.

---

## 7. Sensible defaults

### 7.1 Talents

| Spec | Default build | Source |
| --- | --- | --- |
| **Cat** | **9/37/5 `050022-5520002123032213051-05`**: Genesis 5, Nature's Majesty 2, Nature's Reach 2 / Ferocity 5, HotW 5, Feral Swiftness 2, Savage Fury 2, Feral Charge 1, Sharpened Claws 2, Shredding Attacks 3, Predatory Strikes 3, Primal Fury 2, Predatory Instincts 2, LotP 1, King of the Jungle 3, Rend and Tear 5, Berserk 1 / Furor 5 | The most popular Forever Feral build when chosen, 2026-09-22 [fc-tal]; decode verified in [talents.md](../data/talents.md#build-codes-verified) |
| **Bear** | **8/43/0 `050012-5523032120132210551-`**: Genesis 5, Nature's Majesty 1, Nature's Reach 2 / Ferocity 5, HotW 5, Feral Swiftness 2, Feral Instinct 3, Thick Hide 3, Savage Fury 2, Feral Charge 1, Sharpened Claws 2, Mangle 1, Predatory Strikes 3, Primal Fury 2, Predatory Instincts 2, LotP 1, Natural Reaction 5, Rend and Tear 5, Berserk 1 | [?] **Proposed here**: the site has no bear build. It follows the tier gates and arrows (Mangle ← Savage Fury, Primal Fury ← Sharpened Claws, Rend and Tear ← Predatory Strikes, Berserk ← LotP) |

The 5 Restoration points in the cat build (Furor) have ~0 sim value, because cat never shifts by
default. The site's players take them anyway. Moving them to Naturalist isn't possible (it needs
5 points above it), and 4/37/10 (Furor 5 + Naturalist 5) loses Nature's Majesty and Nature's
Reach. The sim keeps this build as the default preset.

### 7.2 Race

| Faction | Default | Why | Tag |
| --- | --- | --- | --- |
| Horde | **Tauren** | Endurance: +5% health **and +1% melee and spell hit** in Forever; higher Strength | [F] [fc-race]; [client] (SpellEffect 20550, 1.60.1.69913) |
| Alliance | **Night Elf** | Elune's Light: **+10% crit for 15 s, 3 min cooldown** (model as an on-use, used with Berserk); +1% dodge | [F] [fc-race]; [client] (SpellEffect, SpellDuration, SpellCooldowns 1259799, 1.60.1.69913) |
| Either | Skyborne (+1% haste): not default | Needs a paid pack; +1% haste is weaker than the above | [F] [fc-race] |

The sim default is **Tauren**. Racial base stats come from
[character-stats.md](../mechanics/character-stats.md).

### 7.3 Weapon

**Manual Crowd Pummeler** (item 9449: +16 Str, +5 Agi, on-use +50% attack speed for 30 s) exists
unchanged in Forever (now Unique) [F] [fc-mcp]. That it is *the* feral weapon comes only from a
secondary source: it is the main hand in every wowsims/classic feral preset from P2 pre-BiS to P3
BiS [?] [ws-presets] (Q28).

It is required level 29, so it falls **outside** the guild's "Rare, required level 55–60"
pre-raid pool ([decisions.md D5](../decisions.md)). Recommendation:

- Offer MCP as an explicit exception in the gear picker, for cat and bear, pending Q28. Its use
  is +50% attack speed for 30 s (13494, aura 319), with a **180 s cooldown and 3 charges** in the
  Forever item effect [F] [client] (SpellEffect, ItemEffect, 1.60.1.69913; Q24). wowsims/classic
  gives it a 30 s cooldown and no charge limit (secondary [ws-apl]); the client settles it.
- Otherwise the default is the best Rare 55–60 two-hander by Str/Agi/feral AP, chosen by the
  items doc owner. Weapon DPS is irrelevant.

The sim's default is the pre-raid list's top two-hander even where the list also ranks one-handers
(D11): Manual Crowd Pummeler for the cat, Warden Staff for the bear, each with Enchant 2H Weapon -
Major Agility (+25). The other enchants are the feral column of
[buffs-debuffs-consumables §6.4](../mechanics/buffs-debuffs-consumables.md#64-enchant-defaults-by-spec):
Agility wherever it's offered, Greater Stats on the chest, and Threat on the bear's gloves. The
cat presses MCP's use on cooldown from the pull (§6.2 row 2): at 0 s and 180 s in a fight long
enough, 3 times at most. That its haste speeds the form's swings is Q28 [?], listed in the
results. The bear's rotation will press it too.

### 7.4 Rotation settings

As in the default column of §6.2 (cat) and §6.3 (bear). The cat's are the best rotation a paired
search found for the default setup (decision D23, §6.2 "Tuning the defaults"): Bite and Rip at 5
combo points, a Shred first whenever there's the Energy for one except in the last 4 s, Rip only
with 8 s of the fight left, and Tiger's Fury once at most 20 of its Energy would be lost.

### 7.5 Consumables tier ("standard raid night", no world buffs)

The consumable presets, their Forever names and values, and their availability are owned by
[buffs-debuffs-consumables §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset).
The feral rows, as that doc defines them (Forever names; the default is the Standard raid
preset):

| Preset | Cat | Bear (TPS) |
| --- | --- | --- |
| Pre-raid dungeon group | Flank au Poivre (+20 Agi) | Smoked Desert Dumplings (+20 Str) |
| **Standard raid (default)** | Elixir of the Mongoose; Elixir of Greater Strength (Classic: Elixir of Giants); Flank au Poivre | Elixir of Greater Defense; Elixir of Fortitude (+200 health); Mongoose; Greater Strength; Smoked Desert Dumplings; Mighty Rage Potion (druids can use it in Forever) |
| Max-consumables raid (adds / replaces) | Juju Power (replaces Greater Strength); Juju Might; Ground Scorpok Assay; Mighty Rage Potion (for its +60 Str) | Flask of the Titans; Juju Power; Juju Might; R.O.I.D.S.; Rumsey Rum Black Label; Greater Stoneshield Potion |

The sim's presets follow these rows. Flank au Poivre is in the buff catalogue for them: +20
Agility from Nutritious Food 1248399, whose Well Fed 1248420 is Agility [F] [client] (SpellEffect,
ItemEffect, 1.60.1.69913). A druid with Leader of the Pack provides its own, so the Buffs tab's
Leader of the Pack adds nothing more (several don't stack): the tab shows it on and locked, and
says the talents bring it.

Grilled Squid, which Classic ferals ate for Agility, is **+1% crit** in Forever; the buffs doc's
Agility food is Flank au Poivre. A feral-specific reason to differ from these rows would go into
the buffs doc as a per-spec entry.

- **No mana consumables and no Flask of Distilled Wisdom by default.** Classic ferals needed
  them only to powershift [C] [wh-rot] (secondary: [ws-presets]).
- No world buffs: Songflower, Zandalar, Rallying Cry, Warchief's Blessing, DM tribute and DMF are
  excluded ([doctrine §1](../doctrine.md#1-what-were-building)).
- Weapon stones and oils: a Dense Sharpening Stone or Weightstone only adds weapon damage, which
  a form's attacks don't use (§2.1), so the Buffs tab locks it off for a druid, saying so, and the
  plan leaves it out. An Elemental Sharpening Stone's +2% crit still applies. Whether stones and
  oils do anything in form in game is Q25.

---

## 8. Implementation notes

- **Reading DB2 values** (as parsed into `src/data/client/*.json`,
  [client.md](../data/client.md#spellsjson)). Classic 1.15 rows use `EffectBasePoints + EffectDieSides` (a die of 1
  adds 1: Shred's 79 + 1 = 80). Forever 1.60 rows use `EffectBasePointsF` directly, with a
  symmetric `Variance` for ranges: FB 82 ± 82×0.7317/2 = 52–112. `EffectRealPointsPerLevel`
  scales from `SpellLevels.BaseLevel` to `min(level, MaxLevel)`. Per-rank talent values come from
  `TraitDefinitionEffectPoints` → `CurvePoint`, not the talent spell's base points (e.g. King of
  the Jungle's spell row says 60, and the curve says 20/40/60).
- **Form swap.** When in cat or bear, replace the main-hand weapon with the form weapon (§2.1).
  Keep the item's stats and procs, and use the form speed for PPM.
- **Rage from hits** (one rule for white hits and hits taken). They give rage only in a form whose
  power is rage: Dire Bear Form (`FormPlan.rage`), never in cat or caster form [?]
  ([rage.md](../mechanics/rage.md#bear-druid-rage)). A warrior always gains it. The plan's switch
  for hits taken, `plan.rage.fromDamageTaken`, is on for a warrior and for a druid whose fight can
  be in Bear Form (the bear, or a cat whose rotation can shift into bear), and off otherwise, so
  the results list the damage-taken rage assumptions only then. The engine gives a hit taken rage
  only when the switch is on and the druid is in bear. A hit that costs health fires the
  damage-taken procs in any form, and an energize adds rage in whatever form it fires in. Furor's
  rage and Primal Fury's fire only in bear, so outside it that's Natural Reaction and a Mighty Rage
  Potion.
- **Events for the cat APL:** GCD end, Energy tick, Clearcasting gained, a cooldown ready (Tiger's
  Fury, Berserk, Faerie Fire), a bleed or debuff expiring, and fight-time thresholds.
  Reaction/latency modelling follows [damage-and-timing.md](../mechanics/damage-and-timing.md).
- **Faerie Fire ownership.** If `maintainFaerieFire` is on, the FF armor debuff comes from the
  druid's casts (uptime modelled). Otherwise it comes from the raid-debuff toggle. Never both.
- **Bleed state per target:** own Rip, Rake and Lacerate stacks, plus the encounter flag
  `targetBleedingFromOthers`. Rend and Tear and the Rip condition read the union.
- **Maul** is a queued next-swing replacement. Rage is checked and spent when the swing lands, and
  if Rage is short the swing stays white. Swing and rage interplay is in
  [rage.md](../mechanics/rage.md).
- **Skipped effects (< 0.5% or out of scope):** Ravage/Pounce openers, Feral Charge,
  Bash/Growl/Frenzied Regeneration, Cower, movement, stealth, and Thick Hide armor (Forever's
  rage from damage taken reads the hit before armor, so armor doesn't change it).
- **Uncertainty surfacing:** the UI should flag, when they're active, the [?] assumptions that
  move DPS most:
  - flat-before-% on Shred/Claw (Q1)
  - Rip/FB AP scaling (Q3)
  - OoC rate (Q4)
  - form base damage (Q5)
  - Energy tick refinement (Q6), Energy cap and refunds (Q29)
  - Rend and Tear scope (Q9)
  - Predatory Instincts value (Q10)
  - bleed snapshotting, and bleed crits in `forever` (Q21)
  - form haste, PPM speed and feral AP on items (Q28)

  The results list the ones in use today: the form weapon (Q5, Q25, Q28), Omen of Clarity's rate
  (Q4), the D24 base-value placeholders (with every class's; base dodge for the bear only, since
  avoidance matters only when the boss attacks you), Energy's tick and refunds (Q6, Q29) once an ability pays
  Energy, shapeshifts' timers (Q34) once a rotation shifts, bear white rage and the bonus-armor
  aura (OQ-8). With the cat's abilities: Shred's and Claw's flat bonus (Q1), Rip's and Bite's
  attack power (Q3), the bleeds' snapshots and tick crits (Q21), the two rolls of Rake and Bite
  (Q33), Predatory Instincts' 2.2× (Q10), Rend and Tear's scope and others' bleeds (Q9), Berserk's
  crits and Primal Fury (Q8), attack speed in form (Q28), and why the cat never powershifts
  (§2.8, an inference from the tooltips). The form weapon's and Omen of Clarity's lines give only
  the form's own figures: a cat's 1.0 s swing and 3.33% of landed hits. The bear's rotation adds
  its threat values (Q15), Lacerate's stacks and hit (Q16), Swipe's two rolls (Q33), Maul's swing
  and the bear's refunds, Demoralizing Roar in combat (Q32) with Faerie Fire's resist, Berserk's
  running cooldown (Q36) and Enrage's armor (Q35), with Rend and Tear (Q9), Predatory Instincts
  (Q10) and attack speed in form (Q28) under the cat's ids, each only when the setup uses it. The
  bear's texts follow the setup (`BEAR_TEXT` in `plan/assumptions.ts`): they name only the
  abilities in use, the roar's attack power is the profile's (204 in `forever`, 138 [C] in
  `classicEra`), Maul's swing gives 8.65 rage in `forever` and rage from its damage in
  `classicEra`, and Rend and Tear says whether the boss bleeds (the raid's warriors, your Lacerate,
  or neither).

**What the engine provides** (`src/sim/classes/druid/`, and plan/types.ts `AbilityPlan`). A cat or
bear ability is a row with these fields, and its talents come from `withDruidTalents`
(`modifiers.ts`: Ferocity, Shredding Attacks, Savage Fury, Feral Instinct, Genesis, Predatory
Instincts, Primal Fury's combo point):
- `resource: 'energy' | 'rage' | 'mana'`: the pool its cost comes from, its refund goes back to,
  a `cast`'s gain goes to (Tiger's Fury's Energy), and `damagePerExtraRage` converts (Ferocious
  Bite's 2.7 per extra Energy, which also spends the pool on a landed hit).
- `forms`: the forms it can be used in (`formBit('cat')`).
- `comboPoints`, `critComboPointChance`, `finisher`, `damagePerComboPoint`,
  `apCoefficientPerComboPoint`, `comboPointApCap`, and for a bleed finisher
  `dotTickPerComboPoint` and `dotApCoefficientPerComboPoint` (§2.5, §3.4, §3.5).
- `clearcastable`: Clearcasting pays for it (§2.7).
- `kind: 'shift'` with `shiftTo` (§2.8).
- Rotation conditions `minEnergy`, `maxEnergy` and `minComboPoints`, next to the rage ones, and
  `abilityAuraDown` (an ability's aura, or its bleed, is off: Rake waits while Rip bleeds).

The cat added, generically (plan/types.ts `AbilityPlan`, §3.12):
- `flatDamageRange`: a uniform extra on a non-weapon ability's flat damage (Ferocious Bite's
  52–112, §3.5).
- `auraCrit`: crit from an aura for this ability only, its bleed's snapshot included (Berserk's
  +100% on the builders, §3.7).
- `bleedingTargetPct`: Rend and Tear's multiplier on direct damage while the target bleeds, from
  the druid's own bleeds or `Plan.fight.othersBleed`, which the plan sets from the raid's warriors
  (§5.1, Q9).
- `dotTicks` on an attack: a hit plus a bleed in one ability, the bleed on its own row
  (`dotSource`; Rake, §3.3).
- `behindOnly`: never used from the front (Shred, §3.1).
- `spellHit` on a cast, and `targetArmor` on an aura: a debuff the druid keeps on the boss, which
  can miss (Faerie Fire, §3.8).
- `charges` on an on-use item: uses a fight (the Manual Crowd Pummeler, §7.3).

What Warrior Protection added serves these rows too: an aura's `bossAp`, the attack power a debuff
takes off the boss (Demoralizing Roar's, §4.5; [warrior.md §7](warrior.md#7-implementation-notes)
"Debuffs on the boss"); and `kind: 'spellTable'`, the spell table (warrior.md §7 "Spell-table
abilities"), whose miss refunds a druid row's share of what it paid, as above (§2.4). A row with no
damage of its own never crits (warrior.md §7), except a combo-point row: a finisher's damage is per
point, and a builder's crit awards Primal Fury's point (§2.5). Warrior Protection's condition
"its stacks below n" (code 20) serves Lacerate as it does Sunder Armor.

The bear's rotation added, on top of those (plan/types.ts `AbilityPlan`, `AuraPlan`; each field
optional, so no other row changes):
- a school on a spell-table row (`spellSchool`), whose resistance it rolls with its hit: the bear's
  Faerie Fire, a binary Nature spell (§4.5), where the cat's, a `cast`, rolls only its spell hit
  (§3.8);
- a stacking bleed (a marker aura with more than one stack) and a hit that grows with the stacks
  (`weaponPercentPerStack`; Lacerate, §4.3);
- a cooldown an aura suspends (`noCooldownAura`; Berserk's Mangle, §4.6), and an item-armor aura
  (`itemArmorPct`; Enrage, §4.5).

Swipe's extra targets (§4.4) aren't simulated: the sim has one target.

---

## 9. Worked examples

Common setup: level 60, target level 63, no multipliers unless stated, averages of uniform rolls,
no rounding (the engine rounds per [damage-and-timing.md](../mechanics/damage-and-timing.md)).
Each example states which tags it depends on. **Every example that uses the form weapon `W` or
`W_b` (2–4, 12–15) inherits the [?] form base damage (43.84–65.76 cat, 109.6–164.4 bear; Q5).**
If Q5 changes those numbers, recompute the examples; the formulas stay.

Unit tests: W1, W2, W9, W10, W13 and W17, and the talent arithmetic of W3, W5 and W6
(`src/sim/classes/druid/druid.test.ts`, `src/sim/engine/druid.test.ts`); W3–W8 and W11 with the
cat's abilities in the engine, and W8's Energy against the client (`src/sim/engine/cat.test.ts`,
`src/sim/classes/druid/cat.test.ts`); the bear's W14, W15, W16, W18 and W19
(`src/sim/classes/druid/bear.test.ts`, with W14–W16 and W19 also in the engine,
`src/sim/engine/bear.test.ts`). W12 compares W6 and W7 by hand.

1. **Cat AP.** Str 200 (after HotW), Agi 300, +310 AP from gear and buffs, Predatory Strikes 3/3:
   `2×200 − 20 + 300 + 120 + 90 + 310 = 1200`. [F] form terms; [?] `2×Str − 20` (character-stats.md)
2. **Cat white swing at 1200 AP.** 43.84 + 85.714 = **129.554** to 65.76 + 85.714 = **151.474**;
   average **140.514**; a crit is **281.029** (2.0×, no Predatory Instincts on white). [?] (form
   base damage, Q5)
3. **Shred at 1200 AP, no talents.** `1.55 × (W + 80)`: min **324.809**, max **358.785**, average
   **341.797**. With Savage Fury 2/2, average **375.977**; a crit with Predatory Instincts 2/2 is
   375.977 × 2.2 = **827.149**. Comparisons:
   - Classic Shred at the same AP: 2.25 × 220.514 = **496.157**.
   - The flat-after-% alternative (Q1): 1.55 × 140.514 + 80 = **297.797**.
4. **Claw at 1200 AP.** `1.10 × (140.514 + 115)` = **281.066** (min 269.010, max 293.122); with
   Savage Fury 2/2, **309.172**. Classic Claw: 255.514.
5. **Rake with Savage Fury 2/2 and Genesis 5/5.** Initial 61 × 1.10 = **67.10**; bleed tick 34 ×
   1.10 × 1.05 = **39.27**; bleed total **117.81** (non-crit ticks, the same in both profiles;
   `forever` tick crits are §2.9).
6. **Rip at 1200 AP (Forever base [F], AP term [?]; non-crit ticks, snapshot at application,
   both profiles).**

   | CP | Per tick | Total | With Genesis 5/5 | Classic total (comparison) |
   | --- | --- | --- | --- | --- |
   | 1 | 52.5 | 315 | 330.75 | 342 |
   | 3 | 127.5 | 765 | 803.25 | 822 |
   | 5 | 190.5 | **1143** | **1200.15** | 1230 |

   Applied under Tiger's Fury (snapshot), 5 CP with Genesis gives **1380.17**.
7. **Ferocious Bite at 1200 AP.**
   - 5 CP with exactly 35 Energy: **967 to 1027**, average **997** (= 52–112 + 735 + 180).
   - 5 CP with 60 Energy (25 extra): **1034.5 to 1094.5**.
   - 4 CP with 35 Energy: average **814**.
8. **Tiger's Fury Energy.** King of the Jungle 3/3 with Wolfshead Helm, pressed at 30 Energy:
   30 + 60 + 20 = 110, capped at **100** (10 wasted). `tfMaxEnergy` for this setup is 100 − 80 =
   **20**; without Wolfshead it is **40**.
9. **Forever Furor re-entry.** Left cat at 37 Energy, 1.5 s in caster form:
   - Furor 5/5: min(100, 37 + 15) = **52**.
   - Furor 2/5: min(40, 0.4 × 37 + 4 × 1.5) = **20.8** (rounding [?]).
   - No Furor: **0**.
10. **Omen of Clarity chance per landed hit.** Cat 2 × 1.0 / 60 = **3.33%**; bear 2 × 2.5 / 60 =
    **8.33%**. No proc within 10 s of the last one. [?] PPM, [F] ICD.
11. **Energy per 30 s** (TF on cooldown, King of the Jungle 3/3, no Wolfshead, before
    Clearcasting): 300 regenerated + 60 = **360** (380 with Wolfshead). That is ≈ **8.6 Shreds**
    at 42 Energy.
12. **Rip vs Bite per 5-CP finisher** (1200 AP, 35% crit, Predatory Instincts 2/2, target already
    bleeding from Deep Wounds so Rend and Tear applies to Bite, 6% armor mitigation, both landed).
    The profiles differ on whether Rip's ticks can crit (§2.9):
    - Bite (both profiles): 997 × (1 + 0.35 × 1.2) × 1.10 × 0.94 = **1463.88**.
    - `classicEra` Rip: **1200.15** (Genesis; no crit, no armor, no Rend and Tear under the
      default scope). Bite wins this comparison by ~22%.
    - `forever` Rip, ticks critting at the same 35% for 2.2×: 1200.15 × (1 + 0.35 × 1.2) =
      **1704.21**. Rip wins by ~16% (by ~11% if Predatory Instincts doesn't reach the ticks:
      1200.15 × 1.35 = 1620.20).
    - **The whole rotation disagrees in `classicEra`.** One finisher's damage leaves out what each
      costs and when the rotation can use it: Rip spends 30 Energy and goes out as soon as it's off
      the boss, where Bite spends all the Energy there is. In the engine, with the default setup
      and its raid's bleed, `rip.onlyWithoutOtherBleeds` (Bite instead of Rip) loses in both
      profiles: `classicEra` **−24.03 DPS (−4.27%), 95% CI −24.26 to −23.80**, and `forever`
      −55.72 (−9.81%), on seed 1 (40,000 paired fights); on a fresh seed (20260923, 200,000
      fights) −23.98 (−24.08 to −23.88) and −55.58 (−55.68 to −55.47). Biting at 4 as well
      doesn't rescue it: −21.25 in `classicEra`. So the setting defaults off in both profiles
      (§6.2).
    - [?] (depends on Q3, Q9, Q10, Q21)
13. **Dire bear white swing at 1200 AP.** 109.6 + 214.286 = **323.886** to 164.4 + 214.286 =
    **378.686**; average **351.286**.
14. **Maul at 1200 AP.** (351.286 + 128) × 1.10 = **527.214**. Threat × 1.75 × 1.3 =
    **1199.41**. [F] damage, [?] threat (LibThreatClassic2 only)
15. **Mangle at 1200 AP.** 351.286 + 77 = **428.286** (no Savage Fury). Threat with an assumed
    ×1.0 ability multiplier: × 1.3 = **556.77**. [?] threat
16. **Swipe.** 83 × 1.10 × 1.30 = **118.69** per target; threat × 1.75 [?] × 1.3 = **270.02**
    per target.
17. **Bear AP.** Str 250, +150 AP from gear and buffs, Predatory Strikes 3/3:
    `2 × 250 − 20 + 180 + 90 + 150` = **900**.
18. **Demoralizing Roar r5 at 60.** Forever −(193 + 1.4 × 8) = −204.2, shown as **−204 AP**
    (the level-60 tooltip [F]); Classic −(130 + 8) = **−138** [C]. The per-level term runs from
    `SpellLevel` 52, capped at `MaxLevel` 62 [client] (SpellEffect, SpellLevels, 1.60.1.69913;
    1.15.9.69722). Whether combat applies it is [?] (Q32).
19. **Lacerate at 5 stacks** (bleed only): 15 × 5 = **75 per 3 s** (25 DPS); with Genesis 5/5,
    **78.75** per tick. [F] bleed, [?] stack model

---

## 10. Open questions

Each question lists what's known and how the guild can check it on the Forever beta. The beta
opened on 2026-09-17 and ends on 2026-10-21 ([fc-beta]); some tests work at low level with low
ranks.

| # | Question | What we have | How to verify in game |
| --- | --- | --- | --- |
| Q1 | Is the flat bonus of Shred and Claw added **before** the weapon % (`1.55×(W+80)`) or after (`1.55×W + 80`)? | Classic: before [C] [fc-book] [se-c] (tooltip arithmetic, §3.1; secondary [ws-shred]). Forever tooltips say "X% normal damage plus Y" and Shred's "plus 180" is stale | At ~22+, Shred rank 1 (155% + 24) from behind on a mob three levels above you (the beta has no target dummies). Record the character-sheet cat damage range, then 30+ non-crit Shreds: before-% gives `1.55×min + 37.2 … 1.55×max + 37.2`, after gives `… + 24` |
| Q2 | Shred tooltip "plus 180" at rank 5 | Hard-coded string in the Forever description [F] [spell-f] | Resolved by Q1 |
| Q3 | Rip and Ferocious Bite AP scaling in Forever | Not in DB2 (server-side). Rip 1% AP per CP per tick (max 4) and Bite 3% AP per CP come only from a secondary source [?] [ws-rip] [ws-fb]. Forever Rip gained a dummy effect (index 1) | Two sets of 5-CP Rips/Bites at two AP levels (e.g. ±200 AP from gear/buffs); fit the slope |
| Q4 | Omen of Clarity rate and ICD in Forever | ICD 10 s in the client [F] [client]; 2 PPM only from a secondary source [?] [ws-talents] (no client row references a PPM row, so the rate is server-side) | Count Clearcasting procs over ≥ 30 min of cat auto-attack + Shred on mobs; check the minimum gap between procs |
| Q5 | Form base damage (cat 43.84–65.76, bear 109.6–164.4 at 60) | Secondary source only [?] [ws-forms]; the ±20% shape matches `DamageVariance` 0.4 [F]/[C] | At level 60 (or the highest available level), note the character-sheet damage in cat form and subtract AP/14 |
| Q6 | Energy tick (2.0 vs 2.02 s; 20 vs 20.2) and whether haste speeds Energy | 20 per 2 s [C] [wh-rot]; 2.02 s / 20.2 only from a secondary source [?] [ws-energy] | Log Energy over time with an addon; with and without MCP/haste |
| Q7 | King of the Jungle hidden value (5/10/15 per rank, dummy effect 1); does TF persist out of cat? | Curve [F] [client] (CurvePoint, 1.60.1.69913); what the dummy does is server-side | Compare TF damage bonus and duration with 0 vs 3 points |
| Q8 | Berserk: do crits it forces trigger Primal Fury? | Expected yes [?] | Shred under Berserk and count CP |
| Q9 | Rend and Tear scope: which bleeds count (others' Deep Wounds?), and does it affect white hits and periodic ticks? | Tooltip only (1223246 is a dummy aura). The sim counts any bleed, the druid's or others' (a raid with warriors), on abilities' direct damage only [?] | Shred damage on a mob with and without a warrior's Rend on it; white-hit averages; Rip ticks |
| Q10 | Predatory Instincts: crit = 2.2×? | `SPELLMOD_CRIT_DAMAGE_BONUS` +20% [F] | Ratio of crit to non-crit Shred on a mob three levels above you |
| Q11 | Genesis applies to Rip, Rake, Lacerate | Class masks match [F] [client] | Rip ticks with 0 vs 5 Genesis |
| Q12 | Savage Fury on Rake's bleed (10%) | Mask on the periodic mod [F] | Rake ticks with 0 vs 2 points |
| Q13 | Furor re-entry formula and rounding; Energy on entering cat without Furor | Tooltip [F]; 0 without Furor [C] [wh-rot] (inferred) | Shift at known Energy, time the caster phase |
| Q14 | Wolfshead +20 on Tiger's Fury stacks with King of the Jungle | Tooltip [F] | Press TF at 0 Energy with the helm |
| Q15 | Threat: Maul/Swipe ×1.75, FF 108, Demo Roar 39 (Classic and Forever)? Mangle, Lacerate ("high threat") | [?] for all: Maul, Swipe, FF and Demo Roar come only from LibThreatClassic2 [ltc2] ([threat.md OQ 4](../mechanics/threat.md#open-questions)). Lacerate's bonus, left at none, is a D24 effect estimate: each +50 threat per landed application adds about 1% to the default bear's TPS (+100: +2.1%, ×1.2: +1.8%). Leaving Lacerate out while warriors keep the boss bleeding wins on TPS only below about +40 (×1.1) with the default Maul from 20, and +200 (×1.6) with Maul from 10 (§6.3), so the default keeps it | Threat-meter addon (ThreatClassic2-style) or `UnitDetailedThreatSituation` with a two-player test |
| Q16 | Lacerate: per-stack bleed and the "10% weapon damage per existing application" hit; does an application restart the ticks (the tick under way lost) or keep their timer? | Tooltip [F]; the SoD precedent is forbidden. The engine hits for 10% × the stacks already there and restarts the ticks, as a reapplied Rend does (§4.3) [?] | Apply 1→5 stacks on a mob; log hits and ticks, and the time from the fifth application to the next tick |
| Q17 | Ranks available from the trainer: Mangle ranks 2–4, Ferocious Bite rank 5 (Classic: an AQ book) | [F] spellbook lists ranks | Trainer window at 36/48/56/60 |
| Q18 | Combo points on the player or on the target | Forever uses modern CP costs [F] | Build CP, swap target, check |
| Q19 | Bear armor: does the new aura 466 (+360% "bonus armor") also scale non-item armor? Is passive 1306459 live? | [F] data only | Character-sheet armor in and out of Dire Bear with an armor buff |
| Q20 | Ferocious Bite under Clearcasting: all Energy converted? | Secondary only [?] [ws-fb]; that Bite empties the bar normally is [C] [wh-rot] | Bite with a proc at high Energy |
| Q21 | Bleeds: do they snapshot TF, AP and multipliers (both profiles), and in Forever can their ticks crit, at what multiplier (does Predatory Instincts reach Rip ticks)? | Snapshot: secondary only [?] [ws-rip]. Tick crits: the Forever tooltip says periodic effects can crit [F text]; the client sets the per-spell flag on Rake, Rip, Pounce and Lacerate [F] [client] (SpellMisc, 1.60.1.69913); whether the server honours it is [?] ([damage-and-timing OQ 2](../mechanics/damage-and-timing.md#open-questions)) | Rip under TF, compare ticks after TF ends; count crits among ≥ 200 Rip and Rake ticks and their size |
| Q22 | Nature's Reach +4% applies to melee | Aura 54 [F] | Miss rate vs mobs three levels above you with 0 vs 2 points (large sample) |
| Q23 | HotW Str ×1.10 before or after Blessing of Kings | [?] | Character-sheet Str in cat with and without Kings |
| Q24 | MCP charges and cooldown in Forever. **✅ Resolved from client data:** 3 charges and a 180 s cooldown in the Forever item effect | [F] [client] (ItemEffect 98990, 1.60.1.69913); foreverchanges' tooltip lists no charges [fc-mcp]; wowsims/classic's APL uses it only in the first 90 s [?] [ws-apl] | Nothing left; a guild check of the tooltip would confirm it |
| Q25 | Crusader, weapon stones and oils in form | Buffs doc. The sim: a stone's weapon damage does nothing in form (the Buffs tab locks it off, §7.5), an Elemental stone's crit does | Combat log in cat form |
| Q26 | Rip vs Bite as default finisher. **✅ Answered by the sim:** Rip, in both profiles | With the default raid's bleed, Bite in Rip's place loses 9.8% in `forever` and 4.3% in `classicEra`, where Example 12's single finisher favoured Bite (§6.2, W12). The inputs are still [?] (Q3, Q9, Q10, Q21) | Nothing to test for this question; re-run the comparison (`scripts/tune/rotation.mjs --spec druid-feral-cat [--profile classicEra] rip.onlyWithoutOtherBleeds=true`) when Q3, Q9, Q10 or Q21 is answered |
| Q27 | Confirm the wago.tools DB2 readings (scripted before the robots.txt ruling). **✅ Resolved from client data** ([client.md](../data/client.md#doc-claims-checked-against-the-raw-client)) | Every priority row matched the raw 1.60.1.69913 and 1.15.9.69722 files (claims D6, D10, D14–D17, C27): Rip 9896 and SDV 865, Shred, Claw, Rake, Ferocious Bite, Mangle, Lacerate, Cat Form (Passive) 3025, Bear Form Passive2 21178, Tiger's Fury, King of the Jungle, Berserk, Omen of Clarity's ICD, Demoralizing Roar's row, Cower, the Balance/Resto talent auras, form swing timers, the cat GCD, Endurance and Elune's Light. The remaining label-cited values match `src/data/client/*.json` | Nothing left in a browser. On a new build, re-run `npm run scrape:client -- --claims` |
| Q28 | Form attacks and items (secondary source only): does haste (MCP, Wind Blessed, T1 2-piece) speed form swings; do PPM procs use the form speed (1.0 / 2.5); is "+X Attack Power in Cat, Bear, and Dire Bear forms" added 1:1; is there no normalization; is MCP the right default weapon? | [?] (secondary [ws-forms] [ws-talents] [ws-presets] [ws-apl] [ws-shred]) | Swing timer with MCP active (addon or combat log); Crusader proc count in cat vs caster; character-sheet AP with and without a feral-AP item |
| Q29 | Energy cap 100; builders refund 80% on miss/dodge/parry; finishers refund nothing and keep combo points | [?] (standard values; secondary [ws-energy] [ws-shred] [ws-rip] [ws-fb]) | Energy bar maximum; log Energy before and after a dodged Shred and a dodged Bite, and CP after a missed finisher |
| Q30 | Druid base terms: the −20 AP offset and 0.9% base melee crit | [?] placeholders in use ([D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)); origin: [ws-base] and [rb-vanilla], which copy a private server's tables, not evidence. The AP offset is about 0.7% of cat DPS; the crit's plausible range, 0–1%, moves cat DPS by up to about 1.5%, over D24's 1%, so it's measured first. The conversions themselves (2 AP per Str, 20 Agi per 1% crit [F]; spirit regen 15 + Spirit/5 per 2 s [C]) come from [character-stats.md](../mechanics/character-stats.md) | Owned by character-stats ([OQ-3](../mechanics/character-stats.md#oq-3-base-melee-and-spell-crit), [OQ-7](../mechanics/character-stats.md#oq-7-base-attack-power-formulas)): check character-sheet AP and crit at two Str/Agi levels |
| Q31 | Bear rotation thresholds: Maul every swing, Swipe with ≥ 60 spare Rage, Enrage pre-pull only | [?] (the only Classic write-up is Season of Mastery-labelled, not usable). The sim's search (§6.3 "Tuning the defaults"): Maul from 20 rage (10 in fights under a minute), no Swipe on one target, Enrage in combat on cooldown, and Lacerate kept with a 6 s refresh | Sim sensitivity plus guild tank feedback; threat-meter test once Q15 is answered |
| Q32 | Demoralizing Roar at 60: does the debuff apply the level-60 tooltip's −204 in combat? | Tooltip −204 [F] [client]: −193 − 1.4/level with `SpellLevels` 52–62, so `MaxLevel` doesn't cap it below 60 (the −193 read before was the unscaled base). In combat [?] | Owned by [buffs-debuffs-consumables OQ 19](../mechanics/buffs-debuffs-consumables.md#open-questions): read the debuff on a target at 60 |
| Q33 | Cat and bear special-attack rolls: weapon-damage abilities one roll; Rake's initial hit, Ferocious Bite and Swipe two rolls? | The split is Classic Era [C] for warrior abilities ([combat-tables §3](../mechanics/combat-tables.md#3-special-yellow-attacks)); mapping the druid's non-weapon specials onto it is [?] | Owned by [combat-tables OQ 6](../mechanics/combat-tables.md#open-questions): crit rate per attempt vs per landed hit for Shred and Ferocious Bite from the front vs mobs three levels above you |
| Q34 | Shapeshifting and the timers: does a shapeshift reset or keep the swing timer, and do Energy and mana regenerate on one shared 2 s tick? Does entering cat before ever leaving it in a fight keep a full bar under Furor? | The engine keeps the swing in progress and one power tick for both, running through shifts, and counts a full bar as the Energy last left in cat [?] (§2.4, §2.8) | Log swings and Energy and mana ticks with an addon around a powershift (Cat Form → Cat Form) and a cat → bear → cat shift |
| Q35 | Enrage's armor loss: 16% of which armor, and how does it combine with Dire Bear Form's +360%? | Tooltip only [F]: the client's effect is a dummy. The engine takes 16% of item armor, added to the +360% (§4.5) [?]. The other reading, 16% of the whole form armor, loses about five times as much. It moves damage taken only, not rage (`forever`) or threat | Character-sheet armor in Dire Bear Form before and during Enrage, with and without an armor buff |
| Q36 | Berserk and a Mangle already on cooldown: does it reset the cooldown, or only stop new ones? | 417141 #1 is a −100% cooldown modifier on Mangle [F] [client]; the engine lets a running cooldown run (§4.6) [?] | Mangle, then Berserk 1 s later; see whether Mangle is ready at once |

---

## Appendix: Balance in Forever

Out of scope for now, listed so the guild can judge whether to add it. All [F] [fc-class]
[fc-tal] [se-f].

- **Spells are much weaker at base** (level 60 max ranks): Wrath r8 58–64 (Classic 236–264,
  coefficient unchanged at 0.571), Starfire r7 350–412 (496–584), Moonfire r10 124–146 + 240 over
  12 s (189–221 + 384), Insect Swarm r5 186 over 12 s (324). Hurricane has no cooldown and 132
  per second. Wrath costs 120 mana (180).
- **New talents:**
  - Genesis: +5% periodic.
  - Nature's Majesty: +4% crit.
  - Nature's Splendor: longer Moonfire, Rejuvenation, Regrowth and Insect Swarm. The client
    requires Nature's Majesty for it (§5.2).
  - Eclipse: Wrath shortens the next 2 Starfires by 0.17/0.33/0.5 s, storing up to 4 charges for
    15 s.
- **Reworked talents:**
  - Improved Wrath also takes −50% mana.
  - Moonglow: −25% mana on damaging spells.
  - Improved Moonfire: +10% damage and crit.
  - Nature's Reach: +4% hit.
  - Vengeance: now all Arcane and Nature crits.
  - Moonfury: all Arcane and Nature damage +10%.
  - Nature's Grace: +10% cast speed and GCD reduction for 3 s after a non-periodic crit.
  - Insect Swarm moved into Balance.
- **Moonkin Form:** 3% crit (all crit) to the party, exclusive with LotP; +100% Omen of Clarity
  chance; can cast any non-healing spell.
- **Restoration talents a caster might take:** Naturalist (+5% all damage) and Reflection (17/33/50%).
- The popular Balance build is 41/5/0 `5532220115501351-05-` [fc-tal].

---

## Sources

The DB2 rows (`se-f` … `sdv-c`) are the client tables behind [client]: the raw files of builds
1.60.1.69913 and 1.15.9.69722, read through the wago.tools API (decision D16) and confirmed there
(Q27). The wago.tools page links below are for browsing by hand only; scripts never fetch its
pages. foreverchanges.pro reads the same client tables and may be fetched politely (it disallows
only `/api/`, `/spell/`, `/search`, `/admin`).

**Secondary sources: `ws-*` rows (wowsims/classic) and `wsf-*` rows (wowsims/forever).**

- **wowsims/classic** describes itself on GitHub as "World of Warcraft Classic Season of Discovery
  simulations". Its `sim/druid` folder has no rune files, but the repo still contains SoD rune
  code elsewhere (code search finds SavageRoar, Lacerate and WildStrikes). Treat it as a
  secondary source, not a clean Classic Era one: any value supported **only** by wowsims/classic
  is tagged [?] and listed under Open questions (Q3–Q6, Q20, Q21, Q24, Q28–Q30). Where this doc
  keeps [C], it cites a Classic Era source ([wh-rot], [fc-book], the Classic client tables) and
  wowsims/classic only as corroboration.
- **wowsims/forever** (<https://github.com/wowsims/forever>, "World of Warcraft Forever
  simulations", created 2026-09-19, active). At the time of writing its druid code is a TBC port
  with "To be implemented" stubs. It may be cited as [?] corroboration of Forever facts it reads
  from the Forever client (e.g. Mangle's shapeshift mask, Shred's 155%). **Its TBC-derived values
  (TBC Rip, Mangle, Lacerate, Omen of Clarity, Predatory Instincts code kept "for the port") are
  never adopted.**

| Label | URL | Covers | Ruleset |
| --- | --- | --- | --- |
| fc-class | <https://foreverchanges.pro/class/druid> | Every druid talent and spell change with Forever/Classic texts | Forever vs Classic Era |
| fc-book | <https://foreverchanges.pro/spellbook/druid> | Per-rank Forever and Classic tooltips, costs, levels (RSC payload) | Forever vs Classic Era |
| fc-tal | <https://foreverchanges.pro/talents/druid> | Per-rank talent texts, tree layout, `popular` builds | Forever (TraitNode) vs Classic Era |
| fc-race | <https://foreverchanges.pro/racials> | Forever racials (Tauren Endurance hit, Elune's Light, Skyborne) | Forever |
| fc-mcp | <https://foreverchanges.pro/item/9449> | Manual Crowd Pummeler in Forever | Forever |
| fc-wolf | <https://foreverchanges.pro/item/8345> | Wolfshead Helm, Forever vs Classic tooltip | Forever vs Classic Era |
| fc-bis | <https://foreverchanges.pro/bis/druid> | "Weapon damage does nothing in form" note (level-20 BiS) | Forever |
| fc-beta | <https://foreverchanges.pro/beta> | Beta dates and builds | Forever |
| client | [client.md § Doc claims](../data/client.md#doc-claims-checked-against-the-raw-client) | Raw client files parsed into `src/data/client/*.json`; the claims check that confirmed this doc's DB2 values | Forever (1.60.1.69913) and Classic Era (1.15.9.69722) client |
| se-f | <https://wago.tools/db2/SpellEffect?build=1.60.1.69913> | Effect values, auras, class masks for every spell cited | Forever client |
| se-c | <https://wago.tools/db2/SpellEffect?build=1.15.9.69722> | Same for Classic | Classic Era client |
| sp-f | <https://wago.tools/db2/SpellPower?build=1.60.1.69913> | Costs (Energy/Rage/mana %, CP cost rows) | Forever client |
| scd-f / scd-c | <https://wago.tools/db2/SpellCooldowns?build=1.60.1.69913> / <https://wago.tools/db2/SpellCooldowns?build=1.15.9.69722> | GCDs (`StartRecoveryTime`), cooldowns | Forever / Classic Era |
| sao-f / sao-c | <https://wago.tools/db2/SpellAuraOptions?build=1.60.1.69913> / <https://wago.tools/db2/SpellAuraOptions?build=1.15.9.69722> | Omen of Clarity proc mask and 10 s `ProcCategoryRecovery` | Forever / Classic Era |
| ssf-f / ssf-c | <https://wago.tools/db2/SpellShapeshiftForm?build=1.60.1.69913> / <https://wago.tools/db2/SpellShapeshiftForm?build=1.15.9.69722> | Form swing times (1000/2500 ms), `DamageVariance` 0.4 | Forever / Classic Era |
| ss-f | <https://wago.tools/db2/SpellShapeshift?build=1.60.1.69913> | Form requirements (Mangle bear-only, FF castable in forms) | Forever client |
| sl-f | <https://wago.tools/db2/SpellLevels?build=1.60.1.69913> | Base/max levels for per-level scaling | Forever client |
| sm-f | <https://wago.tools/db2/SpellMisc?build=1.60.1.69913> | Durations, passive flags | Forever client |
| spell-f | <https://wago.tools/db2/Spell?build=1.60.1.69913> | Raw tooltip templates (e.g. hard-coded "plus 180") | Forever client |
| trait-f | <https://wago.tools/db2/TraitDefinitionEffectPoints?build=1.60.1.69913> (with TraitNode, TraitNodeEntry, TraitDefinition, CurvePoint) | Per-rank talent values | Forever client |
| sdv-c | <https://wago.tools/db2/SpellDescriptionVariables?build=1.15.9.69722> | Classic Rip `$ticks=6`, `$mult=1.0` | Classic Era client |
| ws-forms | <https://github.com/wowsims/classic/blob/master/sim/druid/forms.go> | Cat form weapon 43.84–65.76 at 1.0 s, 2×level AP, Agi→AP, 0.71 threat, powershift energy | Secondary [?] (see note above) |
| ws-rip | <https://github.com/wowsims/classic/blob/master/sim/druid/rip.go> | Rip ticks and AP scaling, snapshot | Secondary [?] (see note above) |
| ws-fb | <https://github.com/wowsims/classic/blob/master/sim/druid/ferocious_bite.go> | Bite formula, 3%/CP AP, all-Energy conversion | Secondary [?] (see note above) |
| ws-shred | <https://github.com/wowsims/classic/blob/master/sim/druid/shred.go> | `(W + flat) × %` ordering, 1 s GCD, 80% refund | Secondary [?] (see note above) |
| ws-rake | <https://github.com/wowsims/classic/blob/master/sim/druid/rake.go> | Rake without AP scaling | Secondary [?] (see note above) |
| ws-tf | <https://github.com/wowsims/classic/blob/master/sim/druid/tigers_fury.go> | Classic Tiger's Fury | Secondary [?] (see note above) |
| ws-talents | <https://github.com/wowsims/classic/blob/master/sim/druid/talents.go> | OoC 2 PPM + 10 s ICD, 15 s Clearcasting | Secondary [?] (see note above) |
| ws-energy | <https://github.com/wowsims/classic/blob/master/sim/core/energy.go> | Energy 20.2 per 2020 ms, cap, random first tick | Secondary [?] (see note above) |
| ws-mana | <https://github.com/wowsims/classic/blob/master/sim/core/mana.go> | Spirit regen 15 + Spi/5 per 2 s | Secondary [?] (see note above) |
| ws-base | <https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go> | Druid AP per Str, −20, crit per Agi | Secondary [?] (see note above) |
| ws-rot | <https://github.com/wowsims/classic/blob/master/sim/druid/feral/rotation.go> | Era powershift rotation logic | Secondary [?] (see note above) |
| ws-presets | <https://github.com/wowsims/classic/blob/master/ui/feral_druid/presets.ts> | Era default talents, consumables, MCP in gear sets | Secondary [?] (see note above) |
| ws-apl | <https://github.com/wowsims/classic/blob/master/ui/feral_druid/apls/feral.apl.json> | Era cat APL (Shred/Bite/powershift, no Rip) | Secondary [?] (see note above) |
| rb-vanilla | <https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua> | Bear +180% and Dire Bear +360% item armor, added to Thick Hide's; druid base crit 0.9%, spell crit 1.8%, dodge 0.9% | Classic Era addon at its last commit before Season of Discovery: [C] for the armor rule; its base values copy a private server's tables, so they are D24 placeholders, not evidence |
| ltc2 | <https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Druid.lua> | Bear ×1.3 (+3%/rank Feral Instinct), cat ×0.71, Maul/Swipe ×1.75, FF 108, Demo Roar 39, Cower 600 | Classic (1.13, 2019–20 addon library) |
| wsf-repo | <https://github.com/wowsims/forever> | Forever sim in progress (druid mostly TBC-port stubs) | Secondary [?] for Forever facts only; TBC values never adopted |
| wsf-mangle | <https://github.com/wowsims/forever/blob/master/sim/druid/mangle.go> | Comment: Forever ships one Mangle (407995, 1238069/70/73), shapeshift mask 144 = Bear/Dire Bear | Secondary [?] corroboration of [F] client data |
| wsf-shred | <https://github.com/wowsims/forever/blob/master/sim/druid/shred.go> | Comment: every Forever Shred rank has `WEAPON_PERCENT_DAMAGE` 155 | Secondary [?] corroboration of [F] client data |
| wh-rot | <https://www.wowhead.com/classic/guide/classes/druid/feral/dps-rotation-cooldowns-abilities-pve> | Era cat decision tree (63/48/35 Energy, 4 CP Bite), no Rip/Rake, MCP, mana consumables | Classic Era (NerdEgghead, patch 1.15.8). The site also hosts SoD guides; only this Era page is used |
| wiki-ooc | <https://warcraft.wiki.gg/wiki/Omen_of_Clarity> | Classic Clearcasting 15 s (Classic section only; retail/pre-1.12 history not used) | Classic Era section |
| wiki-forever | <https://warcraft.wiki.gg/wiki/Druid_abilities_(Forever)> | Forever trainer levels, "Mangle (Bear)" naming | Forever |

Not used (forbidden ruleset, recorded only as leads): wowhead's Classic *tank* rotation page is
labelled Season of Mastery; the vanilla-wiki "6% Omen of Clarity, no ICD" claim describes pre-1.12
behaviour; SoD Lacerate/Mangle/Berserk/King of the Jungle data sits in the same 1.15.9 client under
the same spell ids and was ignored except where Forever reuses the id with Forever values.

<!-- Reference-link definitions: the short labels used throughout the doc render as links. -->
[fc-class]: https://foreverchanges.pro/class/druid
[fc-book]: https://foreverchanges.pro/spellbook/druid
[fc-tal]: https://foreverchanges.pro/talents/druid
[fc-race]: https://foreverchanges.pro/racials
[fc-mcp]: https://foreverchanges.pro/item/9449
[fc-wolf]: https://foreverchanges.pro/item/8345
[fc-bis]: https://foreverchanges.pro/bis/druid
[fc-beta]: https://foreverchanges.pro/beta
[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[client-hotfix]: ../data/client.md#hotfix-caveat
[se-f]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913
[se-c]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722
[sp-f]: https://wago.tools/db2/SpellPower?build=1.60.1.69913
[scd-f]: https://wago.tools/db2/SpellCooldowns?build=1.60.1.69913
[scd-c]: https://wago.tools/db2/SpellCooldowns?build=1.15.9.69722
[sao-f]: https://wago.tools/db2/SpellAuraOptions?build=1.60.1.69913
[sao-c]: https://wago.tools/db2/SpellAuraOptions?build=1.15.9.69722
[ssf-f]: https://wago.tools/db2/SpellShapeshiftForm?build=1.60.1.69913
[ssf-c]: https://wago.tools/db2/SpellShapeshiftForm?build=1.15.9.69722
[ss-f]: https://wago.tools/db2/SpellShapeshift?build=1.60.1.69913
[sl-f]: https://wago.tools/db2/SpellLevels?build=1.60.1.69913
[sm-f]: https://wago.tools/db2/SpellMisc?build=1.60.1.69913
[spell-f]: https://wago.tools/db2/Spell?build=1.60.1.69913
[trait-f]: https://wago.tools/db2/TraitDefinitionEffectPoints?build=1.60.1.69913
[sdv-c]: https://wago.tools/db2/SpellDescriptionVariables?build=1.15.9.69722
[ws-forms]: https://github.com/wowsims/classic/blob/master/sim/druid/forms.go
[ws-rip]: https://github.com/wowsims/classic/blob/master/sim/druid/rip.go
[ws-fb]: https://github.com/wowsims/classic/blob/master/sim/druid/ferocious_bite.go
[ws-shred]: https://github.com/wowsims/classic/blob/master/sim/druid/shred.go
[ws-rake]: https://github.com/wowsims/classic/blob/master/sim/druid/rake.go
[ws-tf]: https://github.com/wowsims/classic/blob/master/sim/druid/tigers_fury.go
[ws-talents]: https://github.com/wowsims/classic/blob/master/sim/druid/talents.go
[ws-energy]: https://github.com/wowsims/classic/blob/master/sim/core/energy.go
[ws-mana]: https://github.com/wowsims/classic/blob/master/sim/core/mana.go
[ws-base]: https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go
[ws-rot]: https://github.com/wowsims/classic/blob/master/sim/druid/feral/rotation.go
[ws-presets]: https://github.com/wowsims/classic/blob/master/ui/feral_druid/presets.ts
[ws-apl]: https://github.com/wowsims/classic/blob/master/ui/feral_druid/apls/feral.apl.json
[rb-vanilla]: https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua
[ltc2]: https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Druid.lua
[wh-rot]: https://www.wowhead.com/classic/guide/classes/druid/feral/dps-rotation-cooldowns-abilities-pve
[wiki-ooc]: https://warcraft.wiki.gg/wiki/Omen_of_Clarity
[wiki-forever]: https://warcraft.wiki.gg/wiki/Druid_abilities_(Forever)
[wsf-repo]: https://github.com/wowsims/forever
[wsf-mangle]: https://github.com/wowsims/forever/blob/master/sim/druid/mangle.go
[wsf-shred]: https://github.com/wowsims/forever/blob/master/sim/druid/shred.go
