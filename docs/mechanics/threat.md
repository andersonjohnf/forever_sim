# Threat

How much threat each action generates and which modifiers apply. Warrior, bear and Protection
paladin TPS are first-class outputs. DPS threat is covered only as context for the UI. The Classic
Era rule is `threat = (damage × ability multiplier + flat bonus) × global multipliers`, measured
on the 1.13 client. WoW Forever keeps that shape but changes several key numbers:

- **Sunder Armor** now carries a client-side threat effect of **1013** at rank 5. In Classic it
  was 261, set server-side.
- **Defiance** is +5% per rank, needs a shield, and has 3 ranks (+15% at 3/3).
- **Bears** lose Feral Instinct's threat, so they stay at a flat ×1.3.
- **Righteous Fury** is +90% baseline. Improved Righteous Fury now reduces damage taken instead.
- **Thunder Clap** is usable in Defensive Stance.
- **Tranquil Air Totem** and **Blessing of Sanctuary** are gone.

Every other per-ability value is still server-side and unverified in Forever. The engine uses the
Classic Era numbers and flags them. A new ability whose tooltip names its threat ("a high amount
of threat") takes the value of the known abilities with the same words, by the
[wording table](#threat-wording-table) (D29): Lacerate's +261.

Status: researched 2026-09-22 · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified

**Client-data values.** Values cited as `[client] (Table, build)` come from the raw Forever
client files (build 1.60.1.69913; Classic Era 1.15.9.69722 for the Classic halves), read through
the wago.tools API and parsed by `scripts/scrape/client.mjs`. The claim check in
[client.md][client] confirmed every value this doc had marked for a browser check, including
Sunder Armor's threat effect of 1013, with no corrections. Only the client value is [F]: what
the server does with it (Sunder's in-game total, a scripted dummy) stays [?]. Raw files lack
server hotfixes and scripts ([hotfix caveat](../data/client.md#hotfix-caveat)). Where a
foreverchanges.pro tooltip gives the same fact, the tooltip is the primary citation.

---

## What the sim needs

- **Threat events** with a target list, a school, a base amount, an ability multiplier, a flat
  bonus and a flag for splitting across enemies. For each target:
  `threat = (amount × abilityMult + bonus) × Π globalMultipliers(school)`
  ([base rule](#base-rule-and-how-modifiers-stack)).
- **Global multipliers** are the product of every active threat aura whose school mask covers
  the event's school. Defensive Stance 1.3, Defiance, Bear Form 1.3, Battle and Berserker Stance
  0.8, Cat Form 0.71, Righteous Fury (Holy only), Salvation 0.7, threat enchants and items, and so
  on ([modifiers](#stance-and-form-modifiers), [global](#global-threat-modifiers)).
- **Per-ability values** come from the tables in [per-ability threat](#per-ability-threat-at-max-rank).
  Sunder uses the Forever client value in `forever` and Classic Era's 261 in `classicEra`.
  Everything else uses Classic Era values flagged `[?]` for Forever.
- **Non-damage threat** ([healing, power gains and buffs](#threat-from-healing-power-gains-and-buffs)):
  - healing: 0.5 per point of effective healing, split across enemies [C];
  - power gains: 5 per rage [C], and 5 per energy and 0.5 per mana [?], split, with no
    multipliers;
  - buffs: a fixed amount per recipient, split;
  - debuffs: to each debuffed target only.
- **Taunts**: raise your threat to match the highest on the target, and force its attacks for
  the stated duration ([taunts](#taunts-and-forced-attacks)).
- **Aggro thresholds** (110% melee, 130% ranged) are shown as UI context only
  ([thresholds](#aggro-thresholds)).
- **Output**: TPS on the primary target, plus per-ability threat breakdown.
  - Per-target TPS in multi-target mode is optional. [warrior.md §5.5](../classes/warrior.md#55-multi-target-options-light)
    treats splitting threat across targets as out of scope.
  - In the default single-boss encounter, every "split across enemies" rule below divides by 1.
  - The split rules are documented so that single-target results stay correct if the
    encounter adds enemies.

---

## Base rule and how modifiers stack

```
threat_to_target = (damage × abilityMult + abilityBonus) × Π_i (1 + m_i)
```

- **1 damage = 1 threat** before modifiers. Damage is what was actually dealt: after armor,
  resistances and partial blocks. Overkill is assumed to count, which only matters on the killing
  blow. [C] [Magey › Threat Mechanics](https://github.com/magey/classic-warrior/wiki/Threat-Mechanics)
- **Ability multiplier and flat bonus** are per ability ([tables](#per-ability-threat-at-max-rank)).
  Talents or set bonuses that raise one ability's threat multiply that ability's threat before
  the global multipliers. Examples are Iron Creed (+5% per rank to Holy Strike) and Enhanced
  Sunder Armor (T1 8-piece, +15% Sunder). In DB2 these are percent spell modifiers on "threat"
  (aura 108, modifier 2). [F] [client] (SpellEffect, 1.60.1.69913): 1311034, 23561.
- **Global multipliers are multiplicative**, one factor per active threat aura (aura 10, filtered
  by school mask). For example, Defensive Stance with 5/5 Defiance gives 1.3 × 1.15 = 1.495.
  [C] [Magey](https://github.com/magey/classic-warrior/wiki/Threat-Mechanics) states this, and
  [LTC2](https://github.com/dfherr/LibThreatClassic2/blob/master/ThreatClassModuleCore.lua) uses a
  product of buff, stance and enchant factors. Confidence: medium. Magey's published tests cover
  stances alone, not Defiance, so we found no direct test that the two multiply rather than add.
- **Exception (a flat bonus on the same aura).** Classic Feral Instinct did not add its own
  threat aura. It added +3 per rank to Bear Form (Passive2)'s +30%, so bear threat was 1.30 +
  0.15 = 1.45, **additive**. [C] [client] (SpellEffect, SpellClassOptions, 1.15.9.69722): spell
  16947 is aura 107 on class mask 0x2000000 = spell 21178. This no longer applies in Forever (see
  below).
- **Holy-only multipliers** (Righteous Fury) apply only to Holy-school events. An event's school
  is the spell's school: Holy Strike is all Holy even though it is a weapon strike (SpellMisc
  school 2, [F] [client] (SpellMisc, 1.60.1.69913)).

---

## Stance and form modifiers

| Modifier | Value | Scope | Tag | Source |
| --- | --- | --- | --- | --- |
| Battle Stance | ×0.8 | all | [F][C] | [client] (SpellEffect, 1.60.1.69913): 21156 aura 10 = −20; Magey stance tests (0.78–0.82) |
| Berserker Stance | ×0.8 | all | [F][C] | [client] (SpellEffect, 1.60.1.69913): 7381 aura 10 = −20 |
| Defensive Stance | ×1.3 | all | [F][C] | [client] (SpellEffect, 1.60.1.69913): 7376 aura 10 = +30. Forever tooltip "Increases all threat generated by 30%" ([class/warrior](https://foreverchanges.pro/class/warrior)). Magey tests: 1.28–1.31. |
| Defiance, Classic (5 ranks) | ×(1 + 0.03 × rank) in Defensive Stance: ×1.15 at 5/5 | all | [C] | Classic tooltip; DB2 12303…12792 |
| **Defiance, Forever (3 ranks)** | ×(1 + 0.05 × rank) **in Defensive Stance with a shield equipped**: ×1.15 at 3/3 | all | [F] | Tooltip; [client] (SpellEffect, CurvePoint, 1.60.1.69913): 12792 aura 10, curve 5/10/15 |
| Bear / Dire Bear Form | ×1.3 | all | [F][C] | [client] (SpellEffect, 1.60.1.69913): 21178 "Bear Form (Passive2)" aura 10 = +30 (the same in Classic) |
| Feral Instinct, Classic (5 ranks) | +0.03 per rank **added** to the bear ×1.3, so ×1.45 at 5/5 | all | [C] | Classic tooltip; DB2 structure (above); [LTC2 Druid.lua](https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Druid.lua) (`1.3 + 0.03 × rank`) |
| **Feral Instinct, Forever** | **No threat effect.** It is now +10% Swipe damage per rank plus stealth. | — | [F] | [class/druid](https://foreverchanges.pro/class/druid); [client] (SpellEffect, 1.60.1.69913): 16947 is now aura 107 (misc 3) on mask 0x4000 and aura 108, modifying Prowl and Swipe |
| Cat Form | ×0.71 | all | [F][C] | [client] (SpellEffect, 1.60.1.69913): 3025 aura 10 = −29 |
| Righteous Fury | see [below](#paladin-righteous-fury) | Holy | [F] | — |
| No stance or form (paladin, caster druid) | ×1.0 | — | [F][C] | — |

Resulting tank multipliers:

| Tank | Classic Era (max talents) | Forever (max talents) |
| --- | --- | --- |
| Warrior, Defensive Stance | 1.3 × 1.15 = **1.495** (any weapon) | 1.3 × 1.15 = **1.495** with a shield; **1.3** without one |
| Bear | 1.3 + 0.15 = **1.45** | **1.3** |
| Paladin, physical damage | 1.0 | 1.0 |
| Paladin, Holy damage | 1.6 × 1.5 (Improved RF) → **1.9** | **1.9** baseline |

---

## Paladin: Righteous Fury

| Rule | Classic Era | Forever | Tag | Source |
| --- | --- | --- | --- | --- |
| Righteous Fury (spell 25780, 30 min) | Holy threat +60% (×1.6) | **Holy threat +90% (×1.9)** | [F][C] | [client] (SpellEffect, 1.60.1.69913) and [client] (SpellEffect, 1.15.9.69722): 25780 aura 10, school mask 2: 59+1 (C) vs 90 (F); [spellbook](https://foreverchanges.pro/spellbook/paladin) |
| Improved Righteous Fury (3 ranks) | +16 / +33 / +50% of RF's bonus: ×1.696 / ×1.798 / **×1.9** | **Threat part removed.** Now 2 / 4 / 6% less damage taken while RF is active. | [F][C] | 20468: Classic spell mod on RF; Forever flat −2/−4/−6 on RF's damage-taken effect (curve 82954) [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| Instrument of Law (Ret, 2 ranks, new) | — | −10% / −20% **all** threat while RF is **not** active | [F] | [client] (SpellEffect, CurvePoint, 1.60.1.69913): 1311085 aura 10, curve 10/20; [class/paladin](https://foreverchanges.pro/class/paladin) |
| Iron Creed (Prot, 5 ranks, new) | — | Holy Strike threat +5% per rank (+25% at 5/5). With RF active, Holy Strike also gives 2–10% less damage taken for 6 s. | [F] | [client] (SpellEffect, CurvePoint, 1.60.1.69913): 1311034 aura 108, modifier 2 on Holy Strike's class mask, curve 5…25 |

**What RF amplifies:** every **Holy-school** threat event from the paladin. That covers:

- Seal procs and Judgements: Seal of Righteousness, Seal of Command, Seal of Fury, Judgement of
  Righteousness, Judgement of Fury;
- Holy Shield damage, Consecration, Retribution Aura;
- Forever's Holy Strike and Hammer of the Righteous (both Holy school in DB2; Holy Strike
  [client] (SpellMisc, 1.60.1.69913));
- Exorcism, Holy Wrath, Hammer of Wrath, Holy Shock.

It does **not** amplify physical white hits, Reckoning's extra attacks, or rage/mana gain threat.
[LTC2 Paladin.lua](https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Paladin.lua)
applies RF by school to Holy damage, **Holy heals** and **blessing casts** too. That follows from
a school-filtered threat aura (the DB2 school mask is [F]), but no Classic test confirms it for
heals and buffs, and LTC2 alone is not a [C] source: RF on heals and buffs is [?].

---

## Global threat modifiers

| Modifier | Value | Tag | Source / notes |
| --- | --- | --- | --- |
| Blessing of Salvation / Greater Blessing of Salvation | ×0.7 (all) | [F][C] | [client] (SpellEffect, 1.60.1.69913): 1038 / 25895 aura 10 = −30. Forever duration 1 h ([spellbook](https://foreverchanges.pro/spellbook/paladin)). |
| **Tranquil Air Totem** | Classic ×0.8 (party within 20 yd) | [C]; **[F] removed** | DB2 25909 = −20 still exists, but the totem is listed "In a Classic Shaman's spellbook, not in Forever" ([spellbook/shaman](https://foreverchanges.pro/spellbook/shaman)) |
| Enchant Gloves – Threat | ×1.02 | [F][C] | [client] (SpellItemEnchantment, SpellEffect, 1.60.1.69913): enchant 2613 → spell 25063 (+2) |
| Enchant Cloak – Subtlety | ×0.98 | [F][C] | [client] (SpellItemEnchantment, SpellEffect, 1.60.1.69913): enchant 2621 → spell 25070 (−2) |
| Fetish of the Sand Reaver (use: Arcane Shroud) | ×0.3 for 20 s, 3 min CD | [F][C] | [client] (SpellEffect, ItemEffect, 1.60.1.69913): 26400 aura 10 = −70, duration 20 s; item 21647 CD 180 s. LTC2 adds level scaling above 60 (not relevant). |
| The Eye of Diminution (use) | ×0.65 for 20 s, 2 min CD | [F][C] | [client] (SpellEffect, ItemEffect, 1.60.1.69913): 28862 = −35, 20 s; item 23001 CD 120 s. (Spell 1219503, −70%, belongs to a different item, 236302, and is not used here.) |
| **Forever threat equip effects (new)** | ±1% to ±4% | [F] (item data pending) | New spells "Increase Threat All 01–04" (+1…+4) and "Decrease Threat All 01–04" (−1…−4), linked by `ItemXItemEffect` [client] (ItemEffect, ItemXItemEffect, 1.60.1.69913). None of the linked items has an `ItemSparse` row in the raw client, so their stats presumably arrive as hotfixes ([hotfix caveat](../data/client.md#hotfix-caveat)). One confirmed: *Treacherous Treads* (273842), "Equip: Increases all threat generated by 1%" ([item page](https://foreverchanges.pro/item/273842)). Other links: 278540 (+1), 279493 (+2), 278929 (−2), 278299 (−4), and reworked dungeon items 14576 and 13959 (−1) and 18308 (−4), whose Forever tooltips aren't published yet. Item data belongs to [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) and the item dataset. The engine only needs a generic `threatPct` equip stat. |
| Enhanced Sunder Armor (Classic T1 "Might" 8-piece) | Sunder threat ×1.15 (ability-specific) | [C] | DB2 23561 exists in both builds; in Forever it is aura 108, +15% on Sunder Armor's class mask [client] (SpellEffect, 1.60.1.69913). Forever's T1 set bonuses were redesigned (see the items doc), so assume it is absent in Forever. |
| Fungal Bloom (Loatheb) and other encounter auras | ×0 and similar | [F][C] | Out of scope; see [encounter.md](encounter.md) |

---

## Threat wording table

**The same threat wording means the same threat on every tank**
([D29](../decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24),
[doctrine §2](../doctrine.md#2-where-numbers-come-from-non-negotiable)). A tooltip phrase maps to
the values of the known abilities that carry it, and an ability with that phrase and no tier 1–2
value of its own takes the value those abilities' scaling gives it, tagged `[?]` and shown in the
results' assumptions until a guild measurement replaces it. The Forever client carries a threat
value (effect 63) only for Sunder Armor and Cower, so every other row is server-side.

| Tooltip phrase | Known values | How they scale | Applied by the wording (`[?]`) |
| --- | --- | --- | --- |
| "causes a high amount of threat" (a special on the GCD) | Sunder Armor r5 (level 58): **261** [C] (Magey), Forever's client **1013** [F] (effect 63). Revenge r5 (54): 2.25 × dmg + **243**, r6 (60): 2.25 × dmg + **270** [C]. Shield Slam r4 (60): dmg + **254** [C], when Classic's tooltip said "high" | The flat bonus is **4.5 × the spell's level**: 261 = 4.5 × 58, 243 = 4.5 × 54, 270 = 4.5 × 60 (Shield Slam 4.23 × 60). Forever's Sunder is 2.25 × the armor it removes (180/270/360/450 → 405/608/810/1013), a Forever-only client value that no other ability with the words has | **Lacerate** r1/r2/r3 (levels 42/50/58): **189/225/261** per landed application, on top of 1 per damage ([druid bear](#druid-bear), druid.md Q15). Rank 3 is Sunder r5's analog: level 58, 15 rage, a 5-stack debuff. Classic's 4.5 × level, not Forever's 1013, since only Sunder has the Forever value |
| "causes a high amount of threat" (on the next swing) | Heroic Strike r9: dmg + **173**, r8: dmg + **145** [C] (Magey) | About 1.05–1.10 × the rank's bonus damage (157 → 173, 138 → 145) | None: no bear or paladin on-next-swing ability says it (Maul has no threat words) |
| "a very high amount of threat" | Shield Slam r4 in Forever [F] text; no value | Above "high" by the words; unmeasured | Shield Slam keeps Classic's 254 [?] ([warrior](#warrior), OQ 1) |
| "a moderate amount of threat" | Mocking Blow r5; no value (LTC2's 250 is commented out, "NEED MORE INFO") | — | The sim doesn't use Mocking Blow |
| "lowering your threat by a small / medium / large amount" (Cower) | −480 / −780 / −1200, and −1 per level [F] (effect 63; Classic Era −600 at r3) | By rank and level | The sim doesn't use Cower |
| "Damage caused by X causes N% additional threat" | Holy Shield: ×1.2 on its damage [F] [C] | A multiplier on that spell's damage threat | — |
| "Increases the threat generated by your X by N%" | Iron Creed: +5% a rank on Holy Strike [F]; Righteous Fury: +90% on Holy [F] | A multiplier on that ability's (or school's) threat | — |
| "Increases (reduces) all threat generated by N%" | Defensive Stance +30%, Bear Form +30%, Defiance +5% a rank, Cat Form −29%, Salvation −30%, Instrument of Law −10% a rank [F] | A global multiplier ([stances and forms](#stance-and-form-modifiers), [global](#global-threat-modifiers)) | — |
| "taunts" / "forces the target to attack you" | Taunt and Growl 3 s, Judgement of Fury 4 s, Mocking Blow and the challenging shouts 6 s [F] | Top threat for a taunt ([taunts](#taunts-and-forced-attacks)) | — |
| No threat words | Maul and Swipe ×1.75, Faerie Fire 108, Demoralizing Roar 39 (LTC2 [?]); Thunder Clap ×2.5, Shield Bash 1.5 × dmg + 156, Hamstring 1.25 × dmg + 135, Demoralizing Shout 43.2 [C] | Each ability's own value; one per damage where none is known | Primal Bite, Holy Strike, Hammer of the Righteous, Seal of Fury, Judgement of Fury, Consecration, Hammer of Wrath and damage shields (Thorns, Retribution Aura): dmg × 1, × Righteous Fury on Holy |

No paladin tooltip says "high", "very high" or "moderate" threat. A Classic Era ability that had the
words but no measured value stays a question here, never a zero: its row names the analog and the
scaling its default uses.

---

## Per-ability threat at max rank

All values are **before** global multipliers. "dmg" is the damage dealt by that event.

- Classic values from Magey are fitted from 1.13.6.37497 threat-API tests. Each fits
  `(mult × dmg + bonus) × stance` to within ±0.01 over 7–16 data points
  ([Magey table](https://github.com/magey/classic-warrior/wiki/Threat-Mechanics),
  [raw spreadsheet](https://docs.google.com/spreadsheets/d/1VLmhdNX_hZcud8Q0n2I1fPv7y8g8BHYhH_cmIkmd_-s)).
  Where LTC2's older code disagrees, **Magey's measured value wins**.
- **Values only LibThreatClassic2 supplies are [?]**, not [C]. LTC2 is a 1.13 addon "partly
  inherited from the TBC ThreatLib", so it is mixed-lineage (doctrine §2). A Classic Era
  corroboration was looked for on 2026-09-22: Warcraft Tavern's
  [Classic threat reference table](https://www.warcrafttavern.com/wow-classic/guides/threat-guide-reference-table/)
  and an Icy Veins summary list the same numbers, but uncited and digit for digit, so they look
  like the same lineage and aren't counted as independent. The engine still uses these values as
  defaults.
- **Forever:** only Sunder Armor's threat is in the client. For every other value, Forever threat
  is server-side and untested. The engine uses the Classic value, and `[?]` in the Forever column
  means "Classic value assumed".

### Warrior

| Ability (rank, spell id) | Classic Era threat | Forever | Notes and sources |
| --- | --- | --- | --- |
| **Sunder Armor** (r5, 11597) | **261** flat per application, even at 5 stacks [C] (Magey) | **1013** flat. The client value is [F]; the in-game total is [?]. | Forever DB2 adds an explicit threat effect (effect 63) by rank: r1 **1**, r2 405, r3 608, r4 810, r5 1013. That is **2.25 × the armor removed** (180/270/360/450), as [warrior.md §1 and Q1](../classes/warrior.md#9-open-questions) notes. The Classic client has no such effect. Sources: [client] (SpellEffect, 1.60.1.69913) and [client] (SpellEffect, 1.15.9.69722); also read by [ElliotWood/Forever](https://github.com/ElliotWood/Forever/blob/master/docs/beta-pass/warrior.md). **Default: 1013 replaces Classic's server-side 261.** warrior.md Q1 asks whether it is instead added on top (1274). Rank 1 = 1 looks like a bug; 2.25 × 90 would be ~203. Players report low-rank Sunder "generating 10 threat instead of 100" ([forum](https://us.forums.blizzard.com/en/wow/t/warrior-rage-normalization-auto-attack-crits-dont-generate-extra-rage/2355684)). **Engine:** the profile's value × the global multipliers per landed application (a hit or a block): 1013 in `forever`, Classic Era's 261 in `classicEra` (`sunderArmor(profile)`; worked examples T1 and T2); none for a miss, dodge or parry. It deals no damage and can't crit ([warrior.md §7](../classes/warrior.md#7-implementation-notes)). |
| Heroic Strike (r9, 25286; +157 dmg) | dmg + **173** [C] (Magey). r8 (11567): dmg + 145. | [?] | Tooltip unchanged ("high amount of threat"). LTC2 uses 175. **Engine:** dmg + 173. |
| Revenge (r6, 25288) | **2.25 × dmg + 270** [C] (Magey). r5: 2.25 × dmg + 243. | [?] | Forever damage rose from 81–99 to **138–168** [F], so with the Classic formula Revenge threat rises a lot. LTC2's older code uses a flat 355, which the measurements supersede. **Engine:** 2.25 × dmg + 270. |
| Shield Slam (r4, 23925) | dmg + **254** [C] (Magey) | [?] | Forever damage 640–670 + block value [F] (Classic 342–358). The tooltip changed from "a high amount of threat" to "**a very high** amount of threat", so the bonus may have risen. **Engine:** dmg + 254. |
| Shield Bash (r3, 1672) | **1.5 × dmg + 156** [C] (Magey) | [?] | Unchanged spell |
| Cleave (r5, 20569) | dmg + **100** per target hit, not split [C] (Magey) | [?] | Hits 2 targets |
| Battle Shout (r7, 25289) | **60** per party member (and pet) buffed, split across enemies in combat [C] (Magey tests: r2 ≈ 12, r6 52, r7 60; not capped at 5) | [?] | Forever: 139 AP, 3 min [F]. **Engine:** not counted: the party isn't modelled ([warrior.md §7](../classes/warrior.md#7-implementation-notes)). A Protection warrior shouts about once a fight (under 0.5% of its threat) |
| Demoralizing Shout (r5, 11556) | **43.2** per enemy debuffed [C] (Magey sheet). Improved Demoralizing Shout doesn't change it. | [?] | Forever: −204 AP at 60, 45 s [F]. **Engine:** 43.2 when it lands on the boss (it rolls the spell table, [warrior.md §7](../classes/warrior.md#7-implementation-notes)) |
| Thunder Clap (r6, 11581) | **2.5 × dmg** per target, no flat bonus [C] (Magey, 16 points) | [?] | Forever: **usable in Defensive Stance**, 6 s CD, 20% attack-speed slow, 14 rage with 3/3 Improved TC [F]. LTC2's flat 130 is superseded. **Engine:** 2.5 × dmg, on the boss alone until multi-target |
| Hamstring (r3, 7373) | **1.25 × dmg + 135** [C] (Magey) | [?] | — |
| Overpower (r4) | **0.75 × dmg** [C] (Magey) | [?] | DPS context |
| Disarm (676) | **99** [C] (Magey). LTC2 uses 104. | [?] | — |
| Mocking Blow (r5, 20560) | dmg + ? — **unknown** [?] | [?] | Forces the target to attack you for 6 s (aura 11) [F]. LTC2 has 250 commented out as "NEED MORE INFO". Default: dmg × 1, no bonus. |
| Execute (r5, 20662) | dmg × 1.25? — **unverified** [?] | [?] | Only in [LTC2 Warrior.lua](https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Warrior.lua) code. Default: ×1.25. **Engine:** ×1.25 |
| Taunt (355) | [see taunts](#taunts-and-forced-attacks) | 8 s CD [F] | — |
| Challenging Shout (1161) | Forces enemies within 10 yd to attack you for 6 s; no threat change | [F] | — |
| White hits, Mortal Strike, Bloodthirst, Whirlwind, Slam, Rend, Deep Wounds, Intercept, Pummel | dmg × 1 [C] | [?] | No special handling in LTC2 or Magey |
| Victory Rush, Spearing Strike (new) | — | dmg × 1 [?] | New in Forever, no data |
| Bloodrage, Berserker Rage, Unbridled Wrath, Shield Specialization, Master of Defense, rage potion | [power-gain threat](#threat-from-healing-power-gains-and-buffs) | same | — |
| Stance change | 0 | 0 | — |

### Druid (bear)

| Ability (rank, spell id) | Classic Era threat | Forever | Notes and sources |
| --- | --- | --- | --- |
| Maul (r7, 9881; +128 dmg) | **1.75 × dmg** [?] (LTC2 only) | [?] | [LTC2 Druid.lua](https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Druid.lua). Icy Veins' Classic spell summary ([Icy Veins](https://www.icy-veins.com/wow-classic/feral-druid-tank-pve-spell-summary)) and Warcraft Tavern's Classic threat table repeat "1.75x" without a source. Spell unchanged [F]. |
| Swipe (r5, 9908; 83 dmg, 3 targets) | **1.75 × dmg** per target [?] (LTC2 only) | [?] | Forever: Feral Instinct is +10% / +20% / +30% Swipe damage [F]. Savage Fury is +10% at 2/2. |
| Demoralizing Roar (r5, 9898) | **39** per enemy [?] (LTC2 only) | [?] | Forever: −204 AP at 60 [F] |
| Faerie Fire (r4, 9907) | **108** [?] (LTC2 only; same value for Faerie Fire (Feral) r4) | [?] | **Forever: Faerie Fire (Feral) is removed.** Plain Faerie Fire r4 can now be cast in Cat, Bear and Dire Bear Form [F] ([spellbook/druid](https://foreverchanges.pro/spellbook/druid)). The caster tooltip shows 115 mana. [druid.md](../classes/druid.md) models it in form as free with a 6 s CD; that doc owns cost and cooldown. The cat sim counts no threat for it ([druid §3.8](../classes/druid.md#38-faerie-fire-in-cat-9907-r4)): the 108 is [?] and a cat's TPS isn't its headline. |
| Growl (6795) | [see taunts](#taunts-and-forced-attacks) | 8 s CD [F] | — |
| Challenging Roar (5209) | Forced attacks for 6 s | [F] unchanged | — |
| **Primal Bite** (Forever talent; 407995 / 1238069 / 1238070 / 1238073; Mangle (Bear) until 1.60.1.70009) | — | **unknown** [?]. Default: dmg × 1. | 20 rage, 6 s CD, 100% weapon damage + 77 at level 60 [F]. Hits 3 targets under Berserk. Build 1.60.1.70009 renamed it (its debuff, which the client never carried, was removed) and kept every value; its tooltip still names no threat. |
| **Lacerate** (Forever, r3 1235827, trained 42/50/58) | — | **dmg × 1 + 261** per landed application [?] (r1 189, r2 225); ticks dmg × 1 | 15 rage; bleeds 75 over 15 s, stacks to 5 [F]. The tooltip says "Causes a high amount of threat", with no threat effect in the client, so the bonus is the [wording table](#threat-wording-table)'s: 4.5 × the rank's level, Classic Era Sunder Armor r5's 261 at the same level 58. **Engine:** 261 × the global multipliers on each landed application (a hit or a block), the first one too, which deals no damage; none for a miss, dodge or parry. **The only numbers we found are Season of Discovery values. They are not adopted.** A guild test (druid.md G1) replaces the default. |
| Cower (r3, 9892; cat) | −600 − 1 per level (−608 at 60) [C] | **−1200 − 1 per level (−1208 at 60)** [F] | Effect 63 with a per-level term (levels 52–62) [client] (SpellEffect, SpellLevels, 1.60.1.69913). DPS context; details in [druid.md §3](../classes/druid.md). |
| White hits | dmg × 1 [C] | dmg × 1 [?] | × form multiplier |

### Paladin

| Ability (spell id) | Classic Era threat | Forever | Notes and sources |
| --- | --- | --- | --- |
| Holy Shield (r3, 20928) | Holy dmg × **1.2** per block, then × RF [C] | Same rule [F tooltip] | "Damage caused by Holy Shield causes 20% additional threat" appears in both clients. Forever r3 deals **221** per block with a 0.08 coefficient and +20% block chance (Classic: 130, 0.05, +30%) [F] [client] (SpellEffect, SpellAuraOptions, 1.60.1.69913). The client keeps 4 charges, but the r2 and r3 Forever tooltips drop "4 charges", which is for [classes/paladin.md](../classes/paladin.md) to resolve. LTC2: ×1.2. |
| Seal of Righteousness (r8, 20293) procs; Judgement of Righteousness | Holy dmg × RF [C] | [F] unchanged spell | — |
| Consecration (r5, 20924) | Holy dmg × RF [C] | [F] rule | Forever: 96 over 8 s to everyone in it, plus an extra 216 over 8 s to the first 4 enemies [F] |
| **Seal of Fury** (Forever, r7 20423) | — | Holy dmg (+35 per melee hit, plus its seal value 0.85 × 16.91 × weapon speed with a one-hander [?]) × RF | New tanking seal [F]. It also grants an absorb shield with a shield equipped (no threat). The seal value's reading: [paladin.md](../classes/paladin.md#seal-of-fury-sof-new-the-protection-seal) |
| **Judgement of Fury** (20414) | — | 146–160 Holy (153.7–167.1 at level 60, + 0.45 × SP) × RF, and **taunts the target for 4 s** [F] | [paladin.md](../classes/paladin.md#threat-paladin-specific) models the taunt like Taunt: it raises you to top threat, and does nothing if you are already there. We use that as the default, but the mechanism is untested [?]. The client carries a scripted value (a dummy effect of 1607 + 42.3 per level, coefficient 0.18, [F] [client] (SpellEffect, 1.60.1.69913)). Judgement of Righteousness has the identical structure in the Classic Era client, and deals only its own damage there (170–186 + 0.5 × SP) [C]: the allowed analog gives the dummy no effect, so the sim gives it none, no damage and no threat ([paladin.md](../classes/paladin.md#seal-of-fury-sof-new-the-protection-seal); guild test T5 in its open questions). |
| **Holy Strike** (Forever, r8 10333; 40% weapon + 81–105) | — | dmg × RF × (1 + 0.05 × Iron Creed rank) | The whole strike is Holy school (SpellMisc 2) [F]. Its third effect (77, a script) is Sacred Arbiter's judgement refresh, the same effect Judgement 20271 carries, not a threat bonus: its tooltip has no threat wording, so no bonus (D29) [?] (guild test T4 in [paladin.md](../classes/paladin.md#open-questions)) |
| **Hammer of the Righteous** (Forever, 407632) | — | Holy dmg (3 × main-hand weapon DPS, attack power counted [?]) to up to 4 targets × RF | Holy school [F]. No threat wording in its tooltip, so no bonus (D29). The sim hits one target ([paladin.md](../classes/paladin.md#other-abilities)) |
| Retribution Aura (r5) | 20 Holy per attacker hit × RF [C] | 30 × RF [F] damage | — |
| Blessings (cast) | ≈ **spell level** per recipient, split across enemies, × RF: Might r7 / Wisdom r6 / Light r3 = 60, Kings 20, Salvation 26, Greater blessings 60 per recipient [?] (LTC2 only) | [?] | Matches the warrior shout pattern (Battle Shout = spell level). Out-of-combat buffing produces none. |
| Blessing of Sanctuary | Holy damage when the target blocks, × RF [C] | **Removed** [F] | Not in the Forever talent tree, spellbook or SpellName table |
| Reckoning | Extra white attacks, physical × 1 [C] | Also procs on blocks (8% per rank, 40% at 5/5) [F] | — |
| Healing (Holy Light, Flash of Light, Lay on Hands, Light's Vigil) | 0.5 × effective heal [C] (Magey), **halved again for paladins** (0.25) [?] (LTC2 only) × RF? [?] | [?] | Self-healing threat is small for a tank. See [healing](#threat-from-healing-power-gains-and-buffs). |
| Exorcism, Holy Wrath, Hammer of Wrath | Holy dmg × RF | [F] rule | — |

---

## Threat from healing, power gains and buffs

| Source | Threat | Split | Multipliers | Tag | Source |
| --- | --- | --- | --- | --- | --- |
| Healing | 0.5 per point of **effective** healing (overheal excluded) | Evenly across every enemy the healer is in combat with | Global multipliers apply (stance, Salvation, RF for Holy heals) | [C] | [Magey](https://github.com/magey/classic-warrior/wiki/Threat-Mechanics) (0.5 per point; used in its aggro-threshold tests), LTC2 `parseHeal` |
| Paladin heals | Additional ×0.5 (0.25 per point) | same | same | [?] | LTC2 Paladin.lua `healMod` only |
| Rage gained from a spell effect (Bloodrage, Unbridled Wrath, Shield Specialization, Master of Defense, Improved Berserker Rage, potion, Charge, Furor, Enrage, Blood Frenzy, Natural Reaction) | **5 per rage** actually gained (capped at the pool maximum) | Evenly across enemies in combat | **None**: not affected by stance. Assumed unaffected by all other multipliers. | [C] | Magey (1 rage → 3.6–6.4 in Battle Stance and 4.6–5.5 in Defensive Stance, so no stance factor), LTC2 `parseGain`, [Magey issue #22](https://github.com/magey/classic-warrior/issues/22) |
| Energy gained from a spell effect | 5 per energy | same | none | [?] | LTC2 only; Magey confirms that energy gains cause split threat with no stance factor, but gives no value |
| Mana gained from a spell effect (Forever paladin Shield Specialization: 6% of max mana on a block, at most every 3 s; Sanctified Judgement; potions) | 0.5 per mana | same | none | [?] | LTC2 only (Warcraft Tavern's table repeats it, uncited); Magey confirms mana gains cause split threat, with no value |
| Regeneration (mp5, Spirit, Blessing of Wisdom ticks), rage from dealing or taking damage, Anger Management | 0 | — | — | [C]; Anger Management [?] | Magey: "does not include hp5 or mp5 effects". Anger Management is a regen aura (aura 85), so assumed 0. |
| Buffs (Battle Shout, blessings) | Per recipient, per ability (see tables) | Evenly across enemies in combat | Global multipliers apply | [C] rule; blessing values [?] | Magey Battle Shout tests (2 mobs → halved; 6 targets → 6×) |
| Debuffs (Sunder, Demoralizing Shout, Faerie Fire, Thunder Clap's slow) | Per ability, to each debuffed enemy only | No split | Global multipliers apply | [C] | Magey |
| Damage | To the damaged enemy only | No split. Area abilities apply to each target separately. | Global multipliers apply | [C] | Magey |

"Enemies in combat" means every enemy with the player on its threat list. In the default single
boss encounter that is 1. Multi-target settings are in [encounter.md](encounter.md).

---

## Taunts and forced attacks

| Ability | Effect | Tag | Source |
| --- | --- | --- | --- |
| Taunt (warrior), Growl (bear) | If the target isn't already attacking you: set your threat equal to the highest threat on its list, and force it to attack you for **3 s**. Can be resisted (spell hit roll). **8 s CD** in Forever (Classic 10 s). | [F][C] | [client] (SpellEffect, SpellDuration, 1.60.1.69913): 355 / 6795 effect 114 (attack me) + aura 11 (taunt), duration 3 s [F]; behaviour per [LTC2 `Taunt`](https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Warrior.lua) [C] |
| Mocking Blow | Forced attack for 6 s. **No** threat matching. Only its own (unknown) threat. | [F][C] | [client] (SpellEffect, SpellDuration, 1.60.1.69913): 20560 aura 11 only, 6 s |
| Challenging Shout / Challenging Roar | Forced attack for 6 s on all enemies in range. No threat change. | [F][C] | [client] (SpellEffect, SpellDuration, 1.60.1.69913): 1161 / 5209, 6 s |
| Judgement of Fury (Forever) | "Taunts the target to attack you for 4 sec". Whether it matches threat is unknown. | [F] text, [?] mechanism | [spellbook/paladin](https://foreverchanges.pro/spellbook/paladin) |

For a single-target TPS sim, taunts matter only if the user adds a tank swap. Default: not used.

---

## Aggro thresholds

| Rule | Value | Tag | Source |
| --- | --- | --- | --- |
| Taking aggro from the current target while in melee range | > **110%** of the current target's threat | [C] | [Magey › Aggro Thresholds](https://github.com/magey/classic-warrior/wiki/Threat-Mechanics) (tests: 0.96–1.16 melee) |
| Taking aggro at range | > **130%** | [C] | Magey (1.12–1.45 ranged) |
| Forever | No change found | [?] | — |

The UI can show "DPS may do up to 1.1× (melee) or 1.3× (ranged) of the tank's threat". Divide
by the DPS player's own multiplier (for example 0.71 for a rogue) to turn that into a damage
budget. The engine does not simulate losing aggro.

**DPS context multipliers**: Battle and Berserker Stance ×0.8, rogue ×0.71 (DB2 21184 "Rogue
Passive" −29), Cat Form ×0.71, Salvation ×0.7, Forever Instrument of Law ×0.9 / ×0.8 (Ret
without RF), and Forever Subtlety (druid) −10% per rank to Nature and Arcane. Other classes'
threat talents are out of scope.

---

## WoW Forever deviations

| Topic | Classic Era | Forever | Tag / source |
| --- | --- | --- | --- |
| Sunder Armor threat (r5) | 261 (server) | **1013** (client effect 63); r1 = 1 (bug?) | [F] [client] (SpellEffect, 1.60.1.69913); in-game total [?] |
| Defiance | +3% per rank, 5 ranks, Defensive Stance | +5% per rank, **3 ranks**, Defensive Stance **with a shield** | [F] |
| Defensive Stance | ×1.3 | ×1.3 (now stated in the tooltip) | [F]: no change |
| Bear Form | ×1.3 (+ Feral Instinct → ×1.45) | ×1.3; Feral Instinct is Swipe damage | [F] |
| Righteous Fury | +60% Holy; Improved RF up to +90% | **+90% baseline**; Improved RF gives damage reduction | [F] |
| New paladin threat talents | — | Iron Creed (Holy Strike +25%), Instrument of Law (−20% without RF) | [F] |
| Thunder Clap | Battle Stance only, 10% slow, 4 s CD | **Usable in Defensive Stance**, 20% slow, 6 s CD | [F] |
| Revenge / Shield Slam damage | 81–99 / 342–358 | 138–168 / 640–670 (threat grows with damage) | [F] damage; threat formula [?] |
| Shield Slam tooltip | "a high amount of threat" | "a **very high** amount of threat" | [F] text; value [?] |
| Tranquil Air Totem | ×0.8 | **Not in Forever** | [F] |
| Blessing of Sanctuary | Talent; Holy damage on block | **Removed** | [F] |
| Faerie Fire (Feral) | Talent, usable in forms | **Removed**; plain Faerie Fire usable in forms (mana cost) | [F] |
| Lacerate, Primal Bite (Mangle (Bear) until 1.60.1.70009) | — | New. Lacerate's "high amount of threat": +261 by the [wording table](#threat-wording-table); Primal Bite unknown (dmg × 1) | [F] spells, [?] threat |
| Seal of Fury / Judgement of Fury, Holy Strike, Hammer of the Righteous | — | New Holy-school tanking tools (JoF taunts) | [F] |
| Taunt / Growl | 10 s CD | 8 s CD | [F] |
| Cower | −600 | −1200 | [F] |
| Threat equip effects | Gloves/cloak enchants, a few use-items | Adds ±1–4% threat equip effects on items | [F] |
| Salvation, threat enchants, Fetish of the Sand Reaver, Eye of Diminution, Battle/Berserker Stance, Cat Form, rogue | — | No Forever change found (Salvation now lasts 1 h) | [F] |
| Healing / power-gain threat, aggro thresholds, all other per-ability values | — | No Forever data | [?] |

### Reconciliation with the warrior class doc

Checked against [docs/classes/warrior.md](../classes/warrior.md) on 2026-09-22.

**Agreements:**

- Stance multipliers: 0.8 / 1.3 / 0.8.
- Defiance: +5% per rank, needs a shield, 1.495 at 3/3 (W16). warrior.md tags W16's
  multiplicative 1.495 as [F]. This doc agrees with the value, but keeps the
  "multiplicative, not additive" part as [C] with an open test (Q3), because the DB2 shows two
  separate +30% and +15% auras, not their product.
- Sunder Armor's client threat effect: 1, 405, 608, 810, 1013 (2.25 × armor removed).
- Thunder Clap usable in Defensive Stance.
- Using Magey's 1.13.6 measurements as the Classic reference.

**Differences:**

| Topic | warrior.md | This doc | Resolution |
| --- | --- | --- | --- |
| Sunder threat default | Q1: open whether 1013 replaces or adds to the server's 261 (tagged [?]) | Default: 1013 replaces 261. Client value [F], in-game total [?]. | Compatible. This doc picks a default; warrior.md Q1 remains the test. |
| Splitting threat across targets | Out of scope (§5.5) | Split rules documented; in single-target mode they divide by 1 | Compatible. Per-target TPS output is optional. |

---

## Implementation notes

**Event model**

```ts
// docs/mechanics/threat.md#base-rule-and-how-modifiers-stack
interface ThreatEvent {
  source: Actor;
  targets: Enemy[];           // damage/debuff: the hit targets; split kinds: all enemies in combat
  school: SchoolMask;         // spell school (Holy Strike = Holy)
  amount: number;             // damage dealt, effective heal, power gained, or 0
  kind: 'damage' | 'debuff' | 'buff' | 'heal' | 'powerGain' | 'taunt';
  abilityMult: number;        // e.g. 1.75 Maul, 2.5 Thunder Clap, 1.2 Holy Shield, 0.5 heal
  abilityBonus: number;       // e.g. 1013 Sunder (Forever), 173 Heroic Strike
  abilityPct: number;         // ability-specific threat talent (Iron Creed +0.25), default 0
}

function applyThreat(e: ThreatEvent) {
  const perUnit = e.kind === 'powerGain'
    ? e.amount * (e.source.powerType === 'mana' ? 0.5 : 5)                  // no multipliers [C]
    : (e.amount * e.abilityMult + e.abilityBonus) * (1 + e.abilityPct)
        * globalMultiplier(e.source, e.school);
  const split = e.kind === 'heal' || e.kind === 'powerGain' || e.kind === 'buff';
  const share = split ? perUnit / enemiesInCombat(e.source).length : perUnit;
  for (const t of split ? enemiesInCombat(e.source) : e.targets) t.threat.add(e.source, share);
}

function globalMultiplier(a: Actor, school: SchoolMask): number {
  let m = 1;
  for (const aura of a.threatAuras) if (aura.schoolMask & school) m *= 1 + aura.pct / 100;
  return m;   // e.g. Defensive Stance 1.3 × Defiance 1.15 (with a shield) × Righteous Fury 1.9 (Holy only)
}
```

- A **buff** event's `perUnit` is per recipient. Multiply by the number of recipients before
  splitting (Battle Shout on 5 players and 2 mobs gives each mob 5 × 60 × mult / 2).
- **Order of events:** apply threat in the same event that applies the damage, heal or gain. Rage
  or mana gained, and its threat, come after the damage that caused them (see
  [rage.md › Implementation notes](rage.md#implementation-notes)).
- **Defiance (Forever)** needs Defensive Stance **and** an equipped shield. Check both each time
  the multiplier is recomputed (stance change, weapon swap).
- **Righteous Fury** is a Holy-only aura, so put it in `threatAuras` with `schoolMask = Holy`.
  Instrument of Law's −20% is active only when RF is not. The engine keeps RF up or down for a
  whole fight (Protection up, Retribution down), so both are static multipliers: a Holy-only one
  and a global one ([paladin.md › How the engine does it](../classes/paladin.md#how-the-engine-does-it)).
- **Misses, dodges and parries** do no damage and produce no damage threat. A flat bonus on an
  avoided ability is also lost: LTC2 reverses the bonus on a miss. [C] That matches Magey's method
  of measuring landed casts only.
- **Crit damage** counts in full, and glancing blows count their reduced damage.
- **Damage over time** (Deep Wounds, Rend, Lacerate, Consecration) produces threat on each tick,
  using the multipliers active at tick time.
- **Skipped under the 0.5% rule:** overkill on the final hit, threat decay mechanics (none in
  Classic), Salvation on the tank (a user error, not modelled), and spell-hit resists on taunts.

---

## Worked examples

Each of these becomes a unit test. T1 and T2 run in the engine under each profile
(`src/sim/engine/protection.test.ts`).

| # | Input | Expected threat |
| --- | --- | --- |
| T1 | Forever warrior: Defensive Stance, 3/3 Defiance, shield; Sunder r5 | 1013 × 1.3 × 1.15 = **1514.435** |
| T2 | Classic warrior (`classicEra`): Defensive Stance, 5/5 Defiance; Sunder r5 | 261 × 1.495 = **390.195** |
| T3 | Forever warrior as T1 but **two-handed** (no shield) | Multiplier 1.3; Sunder = **1316.9** |
| T4 | Warrior ×1.495; Heroic Strike r9 hits for 500 | (500 + 173) × 1.495 = **1006.135** |
| T5 | Warrior ×1.495; Revenge hits for 150 (Classic formula) | (2.25 × 150 + 270) × 1.495 = **908.2125** |
| T6 | Warrior ×1.495; Thunder Clap hits 4 targets for 90 each | **336.375** per target, 1345.5 total |
| T7 | Warrior ×1.495; Shield Bash hits for 45 | (1.5 × 45 + 156) × 1.495 = **334.1325** |
| T8 | Forever bear (×1.3); Maul hits for 400 (Maul ×1.75 [?]) | 400 × 1.75 × 1.3 = **910** |
| T9 | Classic bear, 5/5 Feral Instinct (×1.45); Maul for 400 (Maul ×1.75 [?]) | **1015** |
| T9b | Forever bear (×1.3); Lacerate r3 hits for 154.566 (+261 [?], the wording table) | (154.566 + 261) × 1.3 = **540.235**; a first application (no damage) **339.3** |
| T10 | Forever paladin with RF; Holy Shield proc for 221 | 221 × 1.2 × 1.9 = **503.88** |
| T11 | Classic paladin with RF, 0/3 and 3/3 Improved RF; Holy Shield proc for 130 | **249.6** / **296.4** |
| T12 | Forever paladin with RF, 5/5 Iron Creed; Holy Strike hits for 250 | 250 × 1.25 × 1.9 = **593.75** |
| T13 | Forever paladin; white hit for 300 (physical) with RF active | **300** (RF doesn't apply) |
| T14 | Rogue (×0.71) with Salvation (×0.7); a 1000-damage hit | **497** |
| T15 | Warrior gains 10 rage (Bloodrage) while 2 enemies are in combat, Defensive Stance | 50 total, **25 per enemy** (no stance multiplier) |
| T16 | Warrior at 98/100 rage gains 5 (Shield Specialization) | Gain 2 → **10** threat (split) |
| T17 | 1000 effective healing, 2 enemies, healer ×1.0 | **250 per enemy** |
| T18 | Battle Shout r7 buffs 5 players; 3 enemies; ×1.495 | 60 × 5 × 1.495 / 3 = **149.5 per enemy** |
| T19 | Demoralizing Shout r5 on 3 enemies; ×1.495 | **64.584 per enemy** |
| T20 | Warrior with Enchant Gloves Threat and Enchant Cloak Subtlety, Defensive Stance, no Defiance; 100 damage | 100 × 1.3 × 1.02 × 0.98 = **129.948** |
| T21 | Aggro check: tank threat 10,000 | Melee DPS pulls above **11,000**; ranged above **13,000** |

---

## Open questions

Each item says what to measure on the Forever beta. Use Magey's method: auto-attack off, cast one
ability on a mob, and read threat before and after with
`/run local _,_,_,_,t=UnitDetailedThreatSituation("player","target") print(t)`. Then fit
`t = (mult × dmg + bonus) × stanceMult` across several different damage rolls. Calibrate the
threat-value scale with a plain white hit in a known stance.

1. **Warrior ability threat in Forever.** Sunder went from 261 (server) to 1013 (client), so
   Blizzard retuned at least one server-side value. Re-measure Heroic Strike, Revenge, Shield Slam
   (the tooltip now says "very high"), Thunder Clap (now used in Defensive Stance), Cleave, Shield
   Bash, Battle Shout, Demoralizing Shout and Mocking Blow at 60. Shield Slam's matters most for
   Protection's Max TPS: above about +449 it keeps Shield Slam on TPS alone, below it dropping it
   would win ([warrior.md §5.4](../classes/warrior.md#max-tps-p2), Q34).
2. **Sunder in play** (same as [warrior.md Q1](../classes/warrior.md#9-open-questions)). Is
   rank 5 about 1013 × stance, as the default assumes? Or is 1013 added on top of the server's
   261? Rank 1's data value is 1: is that a bug? Test in Battle Stance (×0.8) at every rank
   available.
3. **Defiance with Defensive Stance**: ×1.495 (multiplicative) or ×1.45 (additive)? Compare a
   plain white hit in Defensive Stance with 0/3 and 3/3 Defiance. Also confirm it gives nothing
   without a shield.
4. **Bear** [?]: Maul and Swipe multipliers (1.75), Demoralizing Roar (39) and Faerie Fire (108)
   come from LTC2 code only, in Classic Era as well as Forever; no independent Classic Era
   measurement was found. **Lacerate**'s bonus is the wording table's +261 (4.5 × level 58) and
   **Primal Bite**'s (Mangle (Bear) until 1.60.1.70009) threat is assumed dmg × 1; neither is measured. The only numbers found are
   Season of Discovery values and are **not adopted**. Test: a first Lacerate on a fresh mob
   (threat ÷ 1.3 = the bonus), then applications at 1–4 stacks (÷ 1.3 − the hit = the same bonus)
   ([druid.md](../classes/druid.md#10-open-questions) G1).
5. **Righteous Fury scope and paladin non-damage threat** [?]: does RF amplify Holy heals and
   blessing casts? Is paladin healing threat halved? What does each blessing cast generate (LTC2's
   spell-level values)? All three are LTC2-only.
6. **Judgement of Fury's taunt**: does it match threat like Taunt? What is the scripted value
   1607 + 42.3 per level (bonus threat or absorb)? The value itself is confirmed from client data
   ([client] (SpellEffect, 1.60.1.69913)); what the server does with it is the question. Is there
   a flat bonus on Hammer of the Righteous?
7. **Power-gain threat in Forever**: still 5 per rage (Magey, Classic) and 0.5 per mana and 5 per
   energy (LTC2 only [?]), with no multipliers? This matters much more now, because Shield
   Specialization and Master of Defense give 5 rage (25 threat) per proc. Does Anger Management
   generate threat? And does Forever's new rage from damage taken arrive as an energize, which
   would make threat? The default says no, as in Classic Era ([rage.md open question 1](rage.md#open-questions)).
8. **Execute** (×1.25?) and **Mocking Blow** bonus: Classic Era values unverified.
9. **Aggro thresholds** (110% / 130%) in Forever.
10. **Forever threat items**: confirm the tooltips of items linked to the ±1–4% threat spells.
    The spell links are confirmed from client data ([client] (ItemXItemEffect, 1.60.1.69913));
    the items have no `ItemSparse` row in the raw client, so their tooltips need the game or
    foreverchanges.

---

## Sources

| Source | Covers | Ruleset |
| --- | --- | --- |
| [foreverchanges.pro › class/warrior](https://foreverchanges.pro/class/warrior), [class/druid](https://foreverchanges.pro/class/druid), [class/paladin](https://foreverchanges.pro/class/paladin), [spellbook/warrior](https://foreverchanges.pro/spellbook/warrior), [spellbook/druid](https://foreverchanges.pro/spellbook/druid), [spellbook/paladin](https://foreverchanges.pro/spellbook/paladin), [spellbook/shaman](https://foreverchanges.pro/spellbook/shaman), [talents/*](https://foreverchanges.pro/talents/warrior), [changes](https://foreverchanges.pro/changes), [item/273842](https://foreverchanges.pro/item/273842) | Forever tooltips (Defensive Stance +30%, Defiance, RF +90%, Holy Shield +20%, Iron Creed, Instrument of Law, Tranquil Air removed, Faerie Fire (Feral) and Sanctuary removed) | Forever + Classic Era client data |
| wago.tools DB2 for 1.60.1.69913 and 1.15.9.69722: [SpellEffect](https://wago.tools/db2/SpellEffect?build=1.60.1.69913), [SpellName](https://wago.tools/db2/SpellName?build=1.60.1.69913), [SpellMisc](https://wago.tools/db2/SpellMisc?build=1.60.1.69913), [SpellDuration](https://wago.tools/db2/SpellDuration?build=1.60.1.69913), [SpellClassOptions](https://wago.tools/db2/SpellClassOptions?build=1.15.9.69722), [TraitDefinitionEffectPoints](https://wago.tools/db2/TraitDefinitionEffectPoints?build=1.60.1.69913), [CurvePoint](https://wago.tools/db2/CurvePoint?build=1.60.1.69913), [SpellItemEnchantment](https://wago.tools/db2/SpellItemEnchantment?build=1.60.1.69913), [ItemEffect](https://wago.tools/db2/ItemEffect?build=1.60.1.69913), [ItemXItemEffect](https://wago.tools/db2/ItemXItemEffect?build=1.60.1.69913) | Threat auras (aura 10) and their values, the Sunder effect-63 threat, spell schools, durations, per-rank talent curves, threat enchants and items | Forever + Classic Era client data. Browse links; the values are checked against the raw client files in [client.md][client] (read through the wago.tools API, [D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)). |
| [docs/classes/warrior.md](../classes/warrior.md) §1, §2.1, §5.4, W16, Q1 | Warrior stance and threat assumptions and the Sunder question, reconciled above | Project doc |
| [magey/classic-warrior wiki › Threat Mechanics](https://github.com/magey/classic-warrior/wiki/Threat-Mechanics) and [test spreadsheet](https://docs.google.com/spreadsheets/d/1VLmhdNX_hZcud8Q0n2I1fPv7y8g8BHYhH_cmIkmd_-s) | Measured warrior threat values (1.13.6.37497), stance multipliers, 110/130% thresholds, healing 0.5, buff/power-gain rules | Classic Era |
| [magey/classic-warrior issue #22](https://github.com/magey/classic-warrior/issues/22) | Rage-gain threat is not affected by stance (1.13.2) | Classic Era |
| [dfherr/LibThreatClassic2](https://github.com/dfherr/LibThreatClassic2) ([Warrior](https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Warrior.lua), [Druid](https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Druid.lua), [Paladin](https://github.com/dfherr/LibThreatClassic2/blob/master/ClassModules/Classic/Paladin.lua), [core](https://github.com/dfherr/LibThreatClassic2/blob/master/ThreatClassModuleCore.lua)) | Classic threat-meter code: Maul/Swipe 1.75, Demoralizing Roar, Faerie Fire, RF by school, Holy Shield 1.2, blessings, taunt logic, heal/power-gain threat and splitting, global buff multipliers. Values marked "NEED MORE INFO" are not trusted. | Mixed lineage (1.13 addon, partly inherited from the TBC ThreatLib): values only it supplies are [?]; used where Magey is silent |
| [Warcraft Tavern: WoW Classic threat reference table](https://www.warcrafttavern.com/wow-classic/guides/threat-guide-reference-table/) | Maul/Swipe ×1.75, Demoralizing Roar 39, Faerie Fire 108, paladin heals ×0.5, mana 0.5, Execute ×1.25: the LTC2 numbers, with no sources or date | Classic (uncited; not counted as independent corroboration) |
| [Icy Veins › Classic Feral Tank Spell Summary](https://www.icy-veins.com/wow-classic/feral-druid-tank-pve-spell-summary) | "Maul has a 1.75x threat modifier" (read via a search summary; the page blocks direct fetches) | Classic (uncited; not counted as independent corroboration) |
| [ElliotWood/Forever › docs/beta-pass/warrior.md](https://github.com/ElliotWood/Forever/blob/master/docs/beta-pass/warrior.md) | An independent reading of Forever's Sunder threat effect (1013) | Forever (third-party) |
| [Blizzard forums: Forever beta rage thread](https://us.forums.blizzard.com/en/wow/t/warrior-rage-normalization-auto-attack-crits-dont-generate-extra-rage/2355684) | Player report that low-rank Sunder is bugged (≈10× too low) | Forever beta (community) |

[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
