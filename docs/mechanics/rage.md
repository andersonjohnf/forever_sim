# Rage

How warriors and bear-form druids gain and spend rage: from white hits, from damage taken, from
talents, cooldowns and consumables, and what stance changes and shapeshifts cost. The Classic Era
baseline is well understood (a damage-based formula with conversion constant 230.6 at level 60).
**WoW Forever replaces it.** Forever beta combat logs show a landed white hit giving a fixed amount
of rage set by weapon speed (about 3.5 × speed with a one-hander and 4.5 × speed with a
two-hander). Crits give no extra rage. Misses, dodges and parries give none, and rage from damage
taken is well below Classic. The beta tracker confirms the normalization is intentional. Forever
also adds 5-rage procs on blocks, dodges and parries, and makes Tactical Mastery baseline. Both
models are documented below. The Forever model is the engine default. It still counts as
unverified (`[?]`) until it has been measured at level 60.

Status: researched 2026-09-22 · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified

**About the wago.tools values.** Values tagged [F] and cited to wago.tools DB2 tables were read
from CSVs downloaded once on 2026-09-22, before we noticed that wago.tools' `robots.txt`
disallows automated access. That download should not have happened
([decision D9](../decisions.md#d9-wagotools-is-cited-never-crawled-2026-09-22)).

- The values stay, but **a person should confirm each one in a browser** before treating it as
  settled.
- Never fetch wago.tools from scripts or agents.
- Where a foreverchanges.pro tooltip gives the same number, the tooltip is the primary citation.

---

## What the sim needs

- A rage pool per character, stored in **tenths** (integers), with a cap of 100 rage
  ([rage-pool](#rage-pool-cap-and-decay)). Boundless Rage raises the cap by 10, 20 or 30.
- **Rage from white hits.** There are two models behind a ruleset switch
  ([rage-from-damage-dealt](#rage-from-damage-dealt)):
  - `forever` (default, `[?]`): per landed white hit, `k × baseWeaponSpeed`, with `k = 3.5`
    for a one-hander and `4.5` for a two-hander. Crits and glancing blows change nothing. Misses,
    dodges and parries give 0.
  - `classic` `[C]`: `7.5 × damage / 230.6`. A white attack that is dodged or parried gives 75%
    of what it would have hit for. A miss gives 0.
- **On-next-swing attacks** (Heroic Strike, Cleave, Maul) replace the white swing. The swing
  itself generates no rage, in both models ([yellow-attacks](#yellow-damage-and-on-next-swing-attacks)).
- **Rage from damage taken**, also switchable ([rage-from-damage-taken](#rage-from-damage-taken)):
  - `forever` (default, `[?]`): `1.5 × damageTaken / 230.6`.
  - `classic` `[C]`: `2.5 × damageTaken / 230.6`.
  - `forever-hp` (`[?]` alternative): `10 × damage / maxHealth`.

  In every model, avoided or fully absorbed attacks give 0.
- **Refunds.** A special ability that misses or is dodged or parried refunds 80% of its cost.
  Whirlwind and Cleave never refund. A failed Execute loses its base cost and keeps the extra
  rage ([refunds](#rage-refunds-on-avoided-abilities)).
- **Flat and proc sources** ([sources](#warrior-rage-sources-and-sinks)): Bloodrage, Berserker
  Rage (+ Improved), Anger Management, Unbridled Wrath, Shield Specialization, Master of Defense,
  Charge, Mighty Rage Potion. For bears ([bear](#bear-druid-rage)): Furor, Enrage, Primal Fury,
  Natural Reaction.
- **Stance changes**: rage becomes `min(rage, retain)`. In Forever, `retain = 10 + 3 × Improved
  Tactical Mastery rank` ([stances](#stance-changes-and-tactical-mastery)).
- **Bear shift**: rage is set to 0, then Furor may add 10.
- Every rage gain from a spell effect (energize) also produces threat. See
  [threat.md › Threat from power gains](threat.md#threat-from-healing-power-gains-and-buffs).
  Rage from white hits and from damage taken produces none.
- The expected-value tank model in [tank-model](#rage-model-for-a-tank-being-hit-by-a-boss) is
  there to sanity-check the simulation. The engine itself rolls every event.

---

## Rage pool, cap and decay

| Rule | Value | Tag | Source |
| --- | --- | --- | --- |
| Rage cap | 100 | [C] | [LTC2 core](https://github.com/dfherr/LibThreatClassic2/blob/master/ThreatClassModuleCore.lua), Classic sims ([WarriorSim `addRage`](https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js)) |
| Boundless Rage (Fury talent, 3 ranks) | +10 / +20 / +30 maximum rage | [F] | [foreverchanges › warrior](https://foreverchanges.pro/class/warrior), DB2 spell 1310236, aura 418, curve 100/200/300 tenths ([CurvePoint](https://wago.tools/db2/CurvePoint?build=1.60.1.69913)) |
| Gnome, Expansive Mind (racial) | +5% maximum rage. How it combines with Boundless Rage, and how it rounds, is open. | [F] text; combination [?] | [warrior.md §2.3 and Q17](../classes/warrior.md#23-rage-warrior-specific), [racials](https://foreverchanges.pro/racials) |
| Internal unit | Tenths of rage. DB2 stores every rage amount ×10 (Bloodrage energize = 100 → 10 rage), and Forever combat logs report rage in tenths. | [F] | [SpellEffect 2687](https://wago.tools/db2/SpellEffect?build=1.60.1.69913), [ElliotWood/Forever#252](https://github.com/ElliotWood/Forever/issues/252) |
| In-combat decay | None | [C] | Classic sims apply no decay in combat |
| Out-of-combat decay | Not modelled: the sim only runs in-combat fights. Forever's Anger Management tooltip adds "reduces Rage loss while out of combat by 30%". | [F] tooltip | [foreverchanges › warrior](https://foreverchanges.pro/class/warrior) |
| Starting rage | 0, unless the user sets pre-pull rage (Charge, Bloodrage before the pull, a potion) | — | Encounter setting; see [encounter.md](encounter.md) |

Gains above the cap are lost. Threat from a power gain counts only the rage actually gained
([threat.md](threat.md#threat-from-healing-power-gains-and-buffs)).

---

## Rage from damage dealt

### Classic Era formula [C]

For a white hit that lands (normal hit, crit, glancing blow, or a hit the mob blocks):

```
c(L)  = 0.0091107836 × L² + 3.225598133 × L + 4.2652911      // rage conversion value
rage  = 7.5 × damage / c(L)                                   // damage actually dealt, after armor
c(60) = 230.6   →   rage = damage / 30.747 at level 60
```

| Level | c(L) |
| --- | --- |
| 58 | 222.0 |
| 59 | 226.3 |
| 60 | 230.6 |

- **Derivation.** Kalgan's 2006 blue post gave the pre-expansion rule as
  `damage / c × 7.5` and fixed `c(60) = 230.6`. It was quoted to Classic players in 2019 in
  [this Classic forum thread](https://us.forums.blizzard.com/en/wow/t/does-armor-effect-rage-generation/319913).
  Classic Era sims built and checked against 1.13 logs encode exactly this:
  [WarriorSim `addRage`, 2021 revision](https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js)
  and [Aurana's Classic Fury sim `Rage`](https://github.com/wow-aurana/bigdick/blob/master/util.js),
  which uses the quadratic above. Confidence: high.
- **Crits** give rage in proportion to their damage, so double at ×2 crit damage. **Glancing
  blows** give rage in proportion to their reduced damage. [C] (same sources)
- **Dodged and parried white attacks** still give rage: 75% of the damage the swing would have
  dealt. [C] Aurana's sim cites Vilius on Fight Club (`weapon.js`: "dodges give 75% rage"), and
  WarriorSim uses `avgdmg / 230.6 × 7.5 × 0.75`. A Classic player also posted video of a warrior
  gaining rage from two dodges while taking no damage, in the
  [2019 forum thread](https://us.forums.blizzard.com/en/wow/t/does-armor-effect-rage-generation/319913).
  Confidence: medium. The sources don't agree on whether "would have dealt" means before or after
  armor. We use after armor, matching Aurana.
- **Misses** give 0. [C]

Beware: several guides print `(D/C) × 15`, which is the TBC cap term. For example,
[Sam's Compendium of Dragonslaying](https://bookdown.org/SamCiero/scod/abilities-and-rotation.html)
does this, as do Classic forum posts that give `15d/4c + fs/2`. That is the TBC formula, and it is
**not** Classic Era. Do not use it.

### Forever: normalized rage per swing [?]

Forever beta combat logs show that **a landed white hit gives a fixed amount of rage set by weapon
speed, whatever it hits for**:

```
rage_per_landed_white_hit = k × baseWeaponSpeed          // seconds, unhasted (assumption)
k = 3.5  one-handed main hand      (measured 3.45–3.5)
k = 4.5  two-handed
crit / glancing / blocked-by-mob: same as a normal hit
miss, dodge, parry: 0
attack fully absorbed by a shield: 0
```

| Evidence | What it shows | Source |
| --- | --- | --- |
| Beta combat logs, 17–18 Sep 2026, levels ~10–15: 63 clean pairs of auto attacks, 9 warriors, with no abilities used and no damage taken between them | 2.1 s 1H: 7.2–7.3 rage. 2.5 s 1H: 8.6–8.7 rage. 3.2 / 3.3 / 3.5 s 2H: 14.4 / 14.9 / 15.7 rage. Hits of 15–64 damage, crits included, made no difference. | [ElliotWood/Forever#252](https://github.com/ElliotWood/Forever/issues/252) |
| Beta tracker bug "Rage Generation Not Increased on Critical Hit" | Closed by the tracker maintainer as **"Not A Bug. This was done intentionally."** | [forever-bugs#47](https://github.com/ClassicWoWCommunity/forever-bugs/issues/47) |
| Beta forum thread (80 posts) | "1hrs around 7–9 rage every 2–3 s, 2hrs 14–17 every 3–4 s". On critters: 103-damage hit → 13 rage, 195-damage crit → 13 rage. Heroic Strike's swing "generates zero rage". | [Blizzard forums, Forever beta](https://us.forums.blizzard.com/en/wow/t/warrior-rage-normalization-auto-attack-crits-dont-generate-extra-rage/2355684) |
| A second Forever sim's measurements | 1H 3.46 per second of weapon speed, 2H 4.5 per second (levels 8–10). Crits no bonus, glancing no penalty, misses and dodges 0. | [tzcnt/WarriorSim RAGE_GAIN.md](https://github.com/tzcnt/WarriorSim/blob/master/data/forever/RAGE_GAIN.md) |
| Forever talent text consistent with a per-hit, weapon-type model | Dual Wield Specialization: "off-hand Rage generation by 20%" per rank (+100% at 5/5). Unbridled Wrath: 2 rage per proc with two-handers. | [F] [foreverchanges › warrior](https://foreverchanges.pro/class/warrior) |

**Tagged `[?]`, not `[F]`.** The measurements come from third parties, not guild tests. They
were all taken at levels 8–15, and nobody has shown that the same rule holds at 60. The rule is
server-side, so the client tables can't confirm it.

**Unknowns** (each has a default and is listed under [Open questions](#open-questions)):

| Unknown | Default | Why |
| --- | --- | --- |
| Off-hand rage | This doc defines the off-hand **base**: `0.5 × 3.5 × OH speed`. Dual Wield Specialization then multiplies the result by `1 + 0.2 × rank` (×2.0 at 5/5). That multiplier is owned by [warrior.md §2.3](../classes/warrior.md#23-rage-warrior-specific) and example W23, so 5/5 gives the full 3.5 × speed. | A 50% off-hand base is what makes "+100% off-hand rage at 5/5" a sensible talent. [tzcnt](https://github.com/tzcnt/WarriorSim/blob/master/js/classes/player.js) does the same. The ElliotWood sim instead gives the full rate plus the talent. |
| Hasted or base speed | Base (unhasted) weapon speed | With the hasted interval, haste would be rage-neutral per second. Both Forever sims use base speed. |
| Level scaling | None: the same `k` at every level | Nothing points to scaling, but it is untested. |
| Extra attacks (Windfury, Sword procs, Reckoning) | Give rage like a normal landed hit | Same as Classic. Untested. |
| Bear form | `3.5 × 2.5 s` = 8.75 per landed bear auto | Unmeasured. Players report "these rage changes also affect bears". The ElliotWood sim uses the 1H factor on the bear's 2.5 s attack. |

### Outcome summary for a white swing

| Outcome of your white swing | Classic Era [C] | Forever [?] |
| --- | --- | --- |
| Hit | `7.5 × dmg / c` | `k × speed` |
| Crit | `7.5 × critDmg / c` (≈ ×2) | `k × speed` (no bonus) |
| Glancing | `7.5 × glancedDmg / c` | `k × speed` (no penalty) |
| Blocked by the mob (bosses can't block from behind) | `7.5 × (dmg − blocked) / c` | `k × speed` |
| Dodged or parried | `0.75 × 7.5 × wouldBeDmg / c` | 0 |
| Miss | 0 | 0 |
| Fully absorbed | 0 [C, community] | 0 ([forever-bugs#78](https://github.com/ClassicWoWCommunity/forever-bugs/issues/78)) [?] |

Attack-table probabilities, glancing, and a mob blocking your attacks are covered in
[combat-tables.md](combat-tables.md).

### Yellow damage and on-next-swing attacks

- **Yellow (special-attack) damage generates no rage.** This covers Bloodthirst, Mortal Strike,
  Shield Slam, Revenge, Sunder, Thunder Clap, Swipe, Mangle, Lacerate ticks, Deep Wounds, Rend
  and procs. [C]: Classic sims add rage only for white swings (WarriorSim `addRage`: a `spell`
  path gives refunds only). The Forever measurements above use white swings only.
- **Heroic Strike, Cleave and Maul replace the next main-hand white swing**. That swing becomes a
  yellow attack, **so it generates no rage**. HS's real cost is therefore 15 plus the rage the
  swing would have made. [C]: WarriorSim, and
  [Magey › Windfury Totem](https://github.com/magey/classic-warrior/wiki/Windfury-Totem) ("it
  converts the melee swing into a spell cast"). In Forever players see the same, "that specific
  auto attack generates zero rage" ([forum](https://us.forums.blizzard.com/en/wow/t/warrior-rage-normalization-auto-attack-crits-dont-generate-extra-rage/2355684)). [?]
- **Unbridled Wrath** can proc on white hits, extra attacks and HS/Cleave swings, but not on other
  yellow attacks. [C] Classic sims (WarriorSim, Aurana, tzcnt) all limit it to autos plus
  HS/Cleave. In the Forever client data its proc mask is "melee auto attack" only, so the HS and
  Cleave part is open. This default and question Q5 are owned by
  [warrior.md §2.3](../classes/warrior.md#23-rage-warrior-specific). Confidence: medium.
- Forever Heroic Strike rank 9 is "+157 damage", unchanged from Classic
  ([spellbook](https://foreverchanges.pro/spellbook/warrior), DB2 25286). Damage, the queue and
  swing timing are covered in [damage-and-timing.md](damage-and-timing.md).

---

## Rage from damage taken

### Classic Era [C]

```
rage = 2.5 × damageTaken / c(L)      // c(60) = 230.6  →  1 rage per 92.24 damage taken
```

- `damageTaken` is the health actually lost, after armor, Defensive Stance, block and absorbs. A
  fully absorbed hit (Power Word: Shield) gives nothing. So does an attack you dodge, parry or
  that misses you. [C] Classic players stated this in the
  [2019 thread](https://us.forums.blizzard.com/en/wow/t/does-armor-effect-rage-generation/319913),
  and the formula appears in the Kalgan post quoted there. Confidence: medium. The community
  agrees on it, but we found no controlled 1.13 test. A blocked hit gives rage for the unblocked
  part.
- **Berserker Rage**'s "generating extra rage when taking damage": **the multiplier is unknown
  for Classic Era.** Tooltips give no number. The only number we found comes from a forbidden
  private-server emulator (see [Open questions](#open-questions)). Engine default: ×1.0, flagged
  `[?]`. This is the question [warrior.md Q20](../classes/warrior.md#9-open-questions) hands to
  this doc.

### Forever [?]

Beta testers report rage from damage taken is **well below Classic**, and the formula is not
settled ([forever-bugs#72](https://github.com/ClassicWoWCommunity/forever-bugs/issues/72), opened
2026-09-22):

| Observation (all at levels 1–20) | Source |
| --- | --- |
| "Roughly a single point of rage per 5% health lost" (with videos) | issue #72 body |
| ~0.02 rage per damage taken at level 20, against mobs hitting for 1–2, 16–18 and 80–90 | issue #72, sebwib |
| Level 1: 106 health lost → ~21 rage (Classic predicts 35.3). The tester fits `damageTaken / c × 1.5`. | issue #72, Atsumito |
| Rage per pre-armor damage point falls ~50% as armor rises from 52 to 170+. The tester fits a Cataclysm-style `10 × preArmorDamage / maxHealth`, with no rage from avoided hits. | issue #72, 1337LutZ |
| Hits absorbed by Power Word: Shield give 0 rage | [forever-bugs#78](https://github.com/ClassicWoWCommunity/forever-bugs/issues/78) |

Both fits agree at level 20 (about 0.02 rage per damage). At 60 they are far apart. A tank with
7,000 health taking 1,000 damage gets 6.5 rage under `1.5/c` but about 1.4 under `10/maxHP`.

- **Engine default `forever`:** `rage = 1.5 × damageTaken / c(L)`, using health actually lost.
  This is the smallest change that fits the data: all low-level reports come out at about 0.6 ×
  Classic.
- **Engine alternative `forever-hp`:** `rage = 10 × damageTaken / maxHealth`. A UI toggle lets the
  guild see how much prot TPS depends on this choice.
- Attacks you avoid give 0 in all models.

Rage from damage taken is the least certain number in this doc for Forever tanks. It is the first
item under [Open questions](#open-questions).

---

## Rage refunds on avoided abilities

| Rule | Value | Tag | Source |
| --- | --- | --- | --- |
| Special ability misses, or is dodged or parried | Refund 80% of the rage cost (you pay 20%) | [C] | [Magey issue #27](https://github.com/magey/classic-warrior/issues/27) (Pyte's 1.13 beta tests: "special abilities refund rage on a whiff except for Whirlwind and Cleave"). WarriorSim and Aurana use 0.8. |
| Whirlwind | No refund | [C] | Magey issue #27 (video analysis), and WarriorSim (`refund = false`) |
| Cleave | **No refund** | [C] | Magey issue #27: a dodged Cleave cost its full 20 rage in the video. **Disagreement:** WarriorSim ([ad5ac8b spell.js](https://github.com/guybrushgit/WarriorSim/blob/ad5ac8b5dd76db3f0fa7c41de52c0b0b60a5a4d8/js/classes/spell.js)) leaves Cleave on the default 80% refund. We follow Magey's observation. [warrior.md §2.3](../classes/warrior.md#23-rage-warrior-specific) lists only Whirlwind and Execute as exceptions and defers the details here. |
| Heroic Strike | Refund 80% | [C] | Magey issue #27 (video shows HS and Hamstring cost "only a fraction on whiffs"), WarriorSim |
| Execute | **The base cost is spent with no refund. The extra rage is not consumed**, so only the cost is lost. | [C], medium | Same rule as [warrior.md §3.1 "Execute details"](../classes/warrior.md#31-damage-abilities) and WarriorSim (`refund = false`). Magey issue #27 reports that "Execute refunds 84%". That fits this rule if it means the rage the tester still had after a miss (e.g. 79 of 94 left after losing the 15 cost). It does not fit if 84% of the cost came back. Q4 |
| Maul | Assumed to work like Heroic Strike: 80% | [?] | No Classic test found |
| Blocked abilities (a mob blocking your attack) | No refund; the attack landed | [C] | Same sources (only miss, dodge and parry refund) |
| Forever | No Forever data. Classic rules assumed. | [?] | — |

The refund applies to the rage actually paid, after cost reductions (Improved Heroic Strike,
Focused Rage, and so on). Refunded rage generates no threat: it is not an energize effect.

---

## Warrior rage sources and sinks

### Sources

| Source | Classic Era | Forever | Tags / source |
| --- | --- | --- | --- |
| Charge (rank 3) | 15 rage; can't be used in combat | 15 rage. Vanguard (Prot) lets you Charge from Defensive Stance. | [F][C] DB2 11578 energize 150; [spellbook](https://foreverchanges.pro/spellbook/warrior) |
| Improved Charge | +3 per rank | +3 per rank (same text) | [F][C] [class/warrior](https://foreverchanges.pro/class/warrior) |
| Bloodrage (1 min CD, costs health, puts you in combat) | 10 rage now, plus 1 rage/s for 10 s (20 total) | Same | [F][C] DB2 2687 energize 100; 29131 periodic energize 10 every 1000 ms for 10 s |
| Improved Bloodrage (2 ranks) | +2 / +5 instant rage | **+25% / +50% to all Bloodrage rage**: 12.5 + 1.25/s at 1/2, 15 + 1.5/s at 2/2 (30 total) | [F] curve 25/50; [C] Classic text |
| Berserker Rage (30 s CD, 10 s) | Immune to Fear and Incapacitate; "extra rage when taking damage" (multiplier unknown) | Same text | [F][C] DB2 18499 (immunity auras only); multiplier [?] |
| Improved Berserker Rage (2 ranks) | 5 / 10 rage on use | 5 / 10 rage on use, plus a 50% / 100% chance to remove movement impairment | [F][C] |
| Anger Management (Arms) | 1 rage every 3 s in combat | 1 rage every 3 s in combat (now stated in the tooltip) | [F] tooltip + DB2 12296 (aura 85 + dummy 1/3). [C] Classic sims ([Aurana](https://github.com/wow-aurana/bigdick/blob/master/cooldowns.js)). |
| Unbridled Wrath (Fury, 5 ranks) | 8% per rank to gain 1 rage when you deal weapon damage (40% at 5/5) | **12% per rank (60% at 5/5); 2 rage with a two-hander** | [F] curve 12…60, energize 12964 = 10 tenths; [C] |
| Shield Specialization (Prot, 5 ranks) | +1% block per rank; 20% per rank to gain **1** rage on a block | +1% block per rank; 20% per rank to gain **5** rage on a block (100% at 5/5) | [F] DB2 12298 → 1310318 energize 50, curve 20…100; [C] 23602 energize 10 |
| Master of Defense (Prot, new, 2 ranks) | — | 50% / 100% chance to gain 5 rage when you dodge or parry **with a shield equipped** | [F] 1310316 → 23602 energize 50, curve 50/100 |
| Mighty Rage Potion (2 min potion CD) | 45–75 rage, +60 Strength for 20 s | 45–75 rage (600 ± 25%), +60 Strength for 20 s | [F] DB2 17528: 600 with Variance 0.5, duration 20 s; [C] 449 + 1d301 |
| Dual Wield Specialization (Fury, 5 ranks) | Off-hand damage only | Also **+20% off-hand rage generation per rank** and +2% off-hand hit per rank | [F] curves 5…25 / 20…100 / 2…10 |

### Sinks and cost changes (Forever)

These live in the warrior class doc. They are listed here so the rage budget is complete.

| Talent | Effect | Tag |
| --- | --- | --- |
| Focused Rage (Prot, 3 ranks) | −1 rage per rank on the abilities in its class mask: nearly every attack, shout and utility ability. **Battle Shout, Shield Block, Berserker Rage and Bloodrage are not reduced.** The full list is in [warrior.md §2.3](../classes/warrior.md#23-rage-warrior-specific). | [F] [class/warrior](https://foreverchanges.pro/class/warrior); class mask per warrior.md |
| Gnome Eureka! (racial) | The next 3 damaging abilities cost 40% less | [F]; rounding is warrior.md Q18 |
| Improved Heroic Strike | −1 / −2 / −3 | [F][C] |
| Improved Sunder Armor | −1 / −2 / −3 | [F][C] |
| Improved Thunder Clap (moved to Prot) | −2 / −4 / −6 (Thunder Clap 20 → 14) | [F]. Classic was −1 / −2 / −4. |
| Improved Cleave | −1 / −2 / −3 rage (Classic: bonus damage) | [F] |
| Raging Blows | Cleave −2 | [F] |
| Improved Execute | −3 / −5 | [F]. Classic was −2 / −5. |

Ability costs and rotations: see [classes/warrior.md](../classes/warrior.md).

---

## Stance changes and Tactical Mastery

When you change stance (1 s stance cooldown), `rage = min(rage, retain)`. The rest is lost.
Changing stance produces no threat.

| Ruleset | `retain` | Tag | Source |
| --- | --- | --- | --- |
| Classic Era | `5 × Tactical Mastery rank` (Arms talent, 0–25). Untalented: 0. | [C] | Classic tooltip "You retain up to 5 … 25 of your rage points" ([class/warrior](https://foreverchanges.pro/class/warrior)) |
| Forever | `10 + 3 × Improved Tactical Mastery rank`: 10 at 0/5, 25 at 5/5. Tactical Mastery is trained at level 14 (spell 1310185, "You retain up to 10 Rage"). | [F] | [spellbook](https://foreverchanges.pro/spellbook/warrior); DB2 1310185 dummy 10; 12295 curve 3/6/9/12/15 |

Rage changes nothing else about stances. Stance threat and damage modifiers are in
[threat.md](threat.md#stance-and-form-modifiers).

---

## Bear druid rage

| Rule | Classic Era | Forever | Tags / source |
| --- | --- | --- | --- |
| Shifting into Bear or Dire Bear Form | Rage set to 0 | Assumed the same | [C] common Classic knowledge; Forever untested [?] |
| Furor (5 ranks) | 20% per rank to gain 10 rage on shifting to bear | Same bear effect (Cat part reworked) | [F] curve 20…100, 17057 energize 100; [C] |
| Rage from bear white hits | `7.5 × dmg / c` (same formula as warriors; bear attack speed 2.5 s) | Assumed `3.5 × 2.5` = 8.75 per landed auto, crits no bonus | [C]; Forever [?] (see [Forever model](#forever-normalized-rage-per-swing-)) |
| Rage from damage taken | `2.5 × dmg / c` | Same model as warriors (`1.5 × dmg / c` default) | [C]; Forever [?] |
| Maul | On-next-swing; the replaced swing gives no rage | Same | [C]; [F] spell unchanged (DB2 9881) |
| Enrage (1 min CD, 10 s, lowers armor) | 20 rage over 10 s (2 rage/s) | **10 rage now, plus 20 over 10 s (30 total)** | [F] DB2 5229: energize 100 + periodic 20/s; [C] periodic only |
| Improved Enrage | +5 / +10 instant | Removed (folded into Enrage) | [F] [class/druid](https://foreverchanges.pro/class/druid) |
| Wolfshead Helm (item 8345) | +5 rage on shifting into bear | **+5 rage from Enrage** instead (the bonus on shifting is removed) | [F] per [druid.md](../classes/druid.md), which owns it |
| Primal Fury (2 ranks) | 50% / 100% chance to gain 5 rage on any crit in bear form | Same bear effect (Cat part added) | [F][C] 16959 energize 50 |
| Natural Reaction (new, 5 ranks) | — | +1% dodge per rank; 20% per rank to gain 5 rage on each dodge | [F] 417051 curves, 417053 energize 50 |
| Ferocity (5 ranks) | −1 per rank to Maul, Swipe, Claw, Rake | Also Mangle | [F] |
| Shredding Attacks (new) | — | −1 per rank to Lacerate (−3 at 3/3) | [F] |
| Omen of Clarity | Talent | Baseline from level 20: "spells and attacks" can proc Clearcasting (your next ability is free) | [F]. Proc rate: see [classes/druid.md](../classes/druid.md). |
| Frenzied Regeneration | 10 rage/s → 10 health each | 10 rage/s → **1% of maximum health** each | [F] |
| Rage costs (max rank) | Maul 15, Swipe 20, Demoralizing Roar 10 | Plus Mangle (Bear) 20 rage with a 6 s CD, and Lacerate 15 | [F] [spellbook › druid](https://foreverchanges.pro/spellbook/druid) |

Feral Instinct no longer touches threat or rage in Forever. See [threat.md](threat.md#stance-and-form-modifiers).

---

## Rage model for a tank being hit by a boss

The engine simulates every swing. This closed form checks the average and lets the UI explain
where rage comes from. With a boss swing interval `T_boss` (after Thunder Clap's slow, see
[encounter.md](encounter.md)) and boss→player outcome probabilities from
[combat-tables.md](combat-tables.md):

```
per boss swing (warrior):
  R_taken  = Σ_o P(o) × f(D_o)          // o ∈ {hit, crit, crush, block}; D_o = health lost
                                        // f = damage-taken model (Forever 1.5/c · Classic 2.5/c · forever-hp)
  R_block  = P(block) × 5 × 0.2 × rank_ShieldSpec          // Forever; Classic: × 1 rage
  R_avoid  = (P(dodge) + P(parry)) × 5 × 0.5 × rank_MoD     // Forever, shield equipped
rage_per_sec_boss = (R_taken + R_block + R_avoid) / T_boss

own white swings:
  forever: P(land) × k × speed / swingInterval              // swingInterval includes haste; speed does not
  classic: [P(land) × E[dmg] + 0.75 × (P(dodge)+P(parry)) × E[dmg]] × 7.5 / c / swingInterval

flat: Anger Management 1/3 s · Bloodrage (10+10 per 60 s; ×1.5 with 2/2 Improved Bloodrage) · Unbridled Wrath
```

For a bear, replace `R_block` and `R_avoid` with Natural Reaction `P(dodge) × 5 × 0.2 × rank`, and
add Primal Fury `P(crit on your attacks) × 5 × 0.5 × rank` for each attack you make.

**What this means.** A Forever prot warrior gets much of its rage from avoidance and blocks
(5 per proc) and much less from damage taken. Block, dodge and parry now raise rage income
directly. For a Classic tank, rage income is dominated by damage taken.

---

## WoW Forever deviations

| Topic | Classic Era | Forever | Tag |
| --- | --- | --- | --- |
| White-hit rage | `7.5 × dmg / 230.6`; crits ×2; dodges and parries 75% | `3.5 / 4.5 × weapon speed` per landed hit; crits no bonus; dodges and parries 0 | [?] measured by third parties, low level ([#252](https://github.com/ElliotWood/Forever/issues/252), [#47](https://github.com/ClassicWoWCommunity/forever-bugs/issues/47)) |
| Rage from damage taken | `2.5 × dmg / 230.6` | Much lower. Formula unsettled (`1.5/c` or `∝ 1/maxHealth`). | [?] ([#72](https://github.com/ClassicWoWCommunity/forever-bugs/issues/72)) |
| Tactical Mastery | Arms talent, 5–25 | Trained at 14, retains 10; Improved Tactical Mastery +3 per rank (25 at 5/5) | [F] |
| Shield Specialization | 1 rage per proc | 5 rage per proc (100% at 5/5) | [F] |
| Master of Defense | — | 5 rage on dodge or parry with a shield (100% at 2/2) | [F] |
| Unbridled Wrath | 8% per rank, 1 rage | 12% per rank, 2 rage with a two-hander | [F] |
| Improved Bloodrage | +2 / +5 instant | +25% / +50% to all Bloodrage rage | [F] |
| Improved Berserker Rage | 5 / 10 rage | Same, plus movement-impairment removal | [F] |
| Boundless Rage | — | +10 / +20 / +30 maximum rage | [F] |
| Dual Wield Specialization | Damage only | +20% off-hand rage per rank | [F] (the base off-hand rate is [?]) |
| Anger Management | 1 rage / 3 s (hidden) | 1 rage / 3 s (in the tooltip) | [F] — no change |
| Druid Enrage | 20 over 10 s | 10 now + 20 over 10 s | [F] |
| Natural Reaction | — | 5 rage on dodge (100% at 5/5) | [F] |
| Frenzied Regeneration | 10 health per rage | 1% of maximum health per rage | [F] |
| Mighty Rage Potion, Charge, Bloodrage base, Furor, Primal Fury | — | No Forever change found | [F] (DB2 values match) |
| Refunds, yellow attacks generate none, HS/Maul swing generates none | — | No Forever change found; the HS swing is observed to give 0 rage | [?] |

### Reconciliation with the warrior class doc

[docs/classes/warrior.md](../classes/warrior.md) §2.3 hands the rage formulas to this doc and
owns the warrior-specific modifiers. The two docs were checked against each other on 2026-09-22.

**Agreements:**

- Tactical Mastery: 10 + 3 per rank.
- Improved Bloodrage: 15 + 15 at 2/2.
- Shield Specialization and Master of Defense: 5 rage per proc.
- Unbridled Wrath: 12% per rank, 2 rage with a two-hander, default on white, extra-attack and
  HS/Cleave swings.
- Boundless Rage: +10 per rank.
- The Heroic Strike swing generates no rage.
- Anger Management: 1 rage every 3 s.
- Execute's miss rule (see [refunds](#rage-refunds-on-avoided-abilities)).
- The off-hand multiplier from Dual Wield Specialization: warrior.md applies ×(1 + 0.2 × rank)
  to whatever off-hand rage this doc computes (W23).

**Differences:**

| Topic | warrior.md | This doc | Resolution |
| --- | --- | --- | --- |
| Cleave refund | Not listed as an exception, so it implicitly refunds 80% like WarriorSim | No refund (Magey issue #27 video) | This doc owns refunds, so **Cleave does not refund**. warrior.md should add Cleave to its exceptions. |
| Rage from white hits and damage taken in Forever | Not covered. It defers to this doc and uses the Classic damage-based model in examples such as W22 and W23. §5.4 expects Forever tanks to "run far richer in rage than Classic tanks". | Forever white-hit rage is **normalized per swing**, and damage-taken rage is **~0.6× Classic or lower** (evidence from 2026-09-18 to 09-22, after warrior.md was researched) | The 5-rage procs are real [F], but the rage from white hits and damage taken is lower. Whether Forever tanks end up richer or poorer in rage than Classic depends on gear and avoidance. warrior.md §5.4's claim should be treated as unverified until the sim runs both models. |
| Dodge rage for the off hand | "including dodge rage" (Classic mode) | Classic: dodged white swings give 75%. Forever: 0 | Consistent: dodge rage exists only in `classic` mode. |

---

## Implementation notes

**Order of events at one timestamp.** The engine is discrete-event with integer milliseconds
(see [damage-and-timing.md](damage-and-timing.md)).

1. **Main-hand swing with Heroic Strike, Cleave or Maul queued.** Check `rage ≥ cost` now.
   - Yes: deduct the cost and roll the yellow attack table (no glancing blows). No white rage.
     Unbridled Wrath may proc on a hit. On a miss, dodge or parry, refund 80% (never for Cleave).
   - No: clear the queue and resolve a normal white swing.

   The queued attack does not reserve rage. Anything you spend in the meantime can knock it back
   to a white swing.
2. **White swing resolves.** Apply its damage, then add its rage in the same event, then clamp to
   the cap. The rage can pay for abilities used from this point on, but never for the swing that
   produced it.
3. **Dual wield.** Off-hand swings add rage when they land, so a later main-hand Heroic Strike
   check sees it.
4. **Boss swing resolves.** Add rage from damage taken, then any procs (Shield Specialization,
   Master of Defense, Natural Reaction), in the same event.
5. **Periodic sources** (Bloodrage, Enrage, Anger Management) tick on their own timers. Anger
   Management ticks every 3000 ms from the start of combat. The phase is assumed, not measured.
6. Changing stance applies `min(rage, retain)` at the moment you swap.

**Rounding.** Keep rage as integer tenths. Round each gain down to the nearest tenth. The
server-side rounding is not known; Forever logs show tenths ([#252](https://github.com/ElliotWood/Forever/issues/252)).
Keep the running total exact, and never truncate the pool to whole rage.

**Spell batching / latency.** The Forever batching window is not known. See
[damage-and-timing.md](damage-and-timing.md). This doc assumes rage updates are visible
instantly within an event.

**Pseudo-code**

```ts
// docs/mechanics/rage.md#rage-from-damage-dealt
// Returns the BASE rage for the swing. The warrior module then multiplies off-hand results by
// (1 + 0.2 × Dual Wield Specialization rank), per docs/classes/warrior.md §2.3.
function whiteHitRage(o: Outcome, hand: Hand, w: Weapon, dmgDealt: number, wouldBeDmg: number, cfg: RageCfg): number {
  if (cfg.model === 'forever') {
    if (o === 'miss' || o === 'dodge' || o === 'parry' || dmgDealt <= 0) return 0;
    const k = w.twoHand ? 4.5 : 3.5;                 // [?] measured 3.45–3.5 (1H)
    const oh = hand === 'off' ? 0.5 : 1;             // [?] off-hand base
    return k * w.baseSpeedSec * oh;
  }
  // classic [C]
  const c = rageConversion(cfg.level);               // 230.6 at 60
  if (o === 'miss') return 0;
  if (o === 'dodge' || o === 'parry') return 0.75 * 7.5 * wouldBeDmg / c;
  return 7.5 * dmgDealt / c;                         // hit, crit, glance, blocked-by-mob
}

// docs/mechanics/rage.md#rage-from-damage-taken
function damageTakenRage(healthLost: number, cfg: RageCfg, maxHealth: number): number {
  if (healthLost <= 0) return 0;                     // avoided or fully absorbed
  const c = rageConversion(cfg.level);
  switch (cfg.takenModel) {
    case 'forever':    return 1.5 * healthLost / c;          // [?] default
    case 'forever-hp': return 10 * healthLost / maxHealth;   // [?] alternative
    case 'classic':    return 2.5 * healthLost / c * cfg.berserkerRageMult; // [C]; mult [?] = 1.0
  }
}
```

**Edge cases**

- Rage gained at the cap is lost, and it generates no threat.
- Bloodrage and Enrage ticks keep coming after a stance change or shapeshift.
- Master of Defense and Defiance ([threat.md](threat.md)) both need a shield. Check the
  equipped off-hand.
- Revenge being usable after a block, dodge or parry is part of the attack table and ability
  logic, not rage (see [classes/warrior.md](../classes/warrior.md)).
- Skipped under the 0.5% rule (doctrine §4): out-of-combat decay, and the rage-gain truncation
  details.

---

## Worked examples

Each of these becomes a unit test. Use level 60 and `c = 230.6` unless stated otherwise.

| # | Input | Expected output |
| --- | --- | --- |
| R1 | `rageConversion(60)` | 230.6 (±1e-6) |
| R2 | Classic: white hit for 600 | 600 × 7.5 / 230.6 = **19.514** rage |
| R3 | Classic: white crit for 1,200 | **39.029** |
| R4 | Classic: white swing dodged; it would have hit for 450 | 0.75 × 450 × 7.5 / 230.6 = **10.977** |
| R5 | Classic: white swing missed | **0** |
| R6 | Forever: 1H main-hand, base speed 2.6, hit or crit | 2.6 × 3.5 = **9.1** (91 tenths) |
| R7 | Forever: 2H, base speed 3.8, glancing blow | 3.8 × 4.5 = **17.1** |
| R8 | Forever: off-hand 1.8 s; base, then with 5/5 DWS (×2.0, [warrior.md W23](../classes/warrior.md#w23-off-hand-rage-with-dual-wield-specialization-55)) | Base 1.8 × 3.5 × 0.5 = **3.15**; with 5/5 DWS **6.3** |
| R9 | Forever: any white swing dodged or parried | **0** |
| R10 | Classic: 1,000 health lost to a boss hit | 1000 × 2.5 / 230.6 = **10.841** |
| R11 | Forever default: 1,000 health lost | 1000 × 1.5 / 230.6 = **6.505** |
| R12 | Forever `forever-hp`: 1,000 health lost, maximum health 7,000 | 10 × 1000 / 7000 = **1.429** |
| R13 | Heroic Strike queued with rage = 14 and cost = 15 at swing time | HS dequeued; white swing resolves and gives normal white rage |
| R14 | Heroic Strike (cost 12) dodged | Rage after = rage before − 12 + 9.6 (net −2.4); no white rage |
| R15 | Cleave (cost 20) parried | Net −20 (no refund) |
| R16 | Forever stance swap at 60 rage, 3/5 Improved Tactical Mastery | Rage → min(60, 10 + 9) = **19** |
| R17 | Classic stance swap at 60 rage, 5/5 Tactical Mastery | → **25** |
| R18 | Forever Bloodrage with 2/2 Improved Bloodrage | +15 at cast, then +1.5 every 1 s for 10 s (**30** total) |
| R19 | Forever Shield Specialization 5/5, one block | **+5** rage (100%) |
| R20 | Forever druid Enrage | +10 at cast, then +2 every 1 s for 10 s (**30** total) |
| R21 | Rage 95, gain 10, cap 100 (no Boundless Rage) | Rage 100; 5 counted as gained (for threat) |
| R22 | Rage 95, gain 10, Boundless Rage 3/3 (cap 130) | Rage 105 |
| R23 | Tank model, Forever. Boss swings every 2.0 s. Outcomes: miss 5%, dodge 15%, parry 15%, block 25% (1,050 lost), hit 40% (1,200 lost). Classic damage-taken model, Shield Specialization 5/5, Master of Defense 2/2. | R_taken = 0.40 × 13.0095 + 0.25 × 11.3833 = 8.0497. R_block = 1.25. R_avoid = 1.5. Per swing **10.7997**; **5.3998 rage/s** |
| R24 | Same as R23 with the Forever default (`1.5/c`) | R_taken = 8.0497 × 0.6 = 4.8298. Per swing 7.5798; **3.7899 rage/s** |
| R25 | Execute (cost 15) dodged at 50 rage | Rage after = **35** (the cost is lost, the extra 35 is kept, no refund) |
| R26 | Execute (cost 15) hits at 50 rage | Rage after = **0** (the damage uses 35 extra rage; see warrior.md W10) |

---

## Open questions

Each item says what to measure on the Forever beta. Record results with build, date, method and
sample size (doctrine §2, tier 2).

1. **Rage from damage taken at level 60 (highest priority for tank TPS).** Take ≥50 hits from
   one mob type and log `UNIT_POWER_UPDATE` and combat-log damage.
   - Repeat at two different maximum health values (swap Stamina gear or buffs, same armor) and
     two armor values (same maximum health).
   - Rage per damage changes with maximum health → the `forever-hp` model.
   - It changes only with health actually lost → the `1.5/c` model. Also measure the constant.
2. **White-hit rage at level 60.**
   - Confirm `k = 3.5 / 4.5` and pin down the 1H constant (3.45 vs 3.5).
   - Hasted or base speed: log with and without Flurry or a haste effect.
   - The off-hand base rate: 50% or 100%, and how DWS scales it.
   - Whether extra attacks (Windfury, Sword Weaponmaster, Reckoning) give rage.
3. **Bear rage.** Does normalization apply? If so, with what factor per landed bear auto (the
   default 3.5 × 2.5 = 8.75)? Does the damage-taken change apply to bears too?
4. **Refunds in Forever**: miss/dodge/parry refund percentage, and which abilities are exempt.
   Specifically:
   - Does Cleave refund? Magey says no; WarriorSim says yes.
   - What happens to Execute's cost and extra rage on a miss? Read rage before and after a
     dodged Execute at a known rage.
   - Does Maul refund?
5. **Berserker Rage multiplier on damage-taken rage.** We only found it in forbidden code, so it
   is **not adopted**: the vmangos emulator uses `addRage *= 1.3f` when aura 18499 is present
   ([vmangos Player.cpp `RewardRage`](https://github.com/vmangos/core/blob/development/src/game/Objects/Player.cpp)).
   Test: take a series of equal hits with and without Berserker Rage active.
6. **Shapeshift rage reset.** Does shifting to bear still set rage to 0 in Forever?
7. **Anger Management tick phase**: from the start of combat, or from when the talent is gained.
   It is a minor issue.
8. **Classic dodge/parry 75% rule** (only matters in `classic` mode): is "would-be damage" taken
   before or after armor?

---

## Sources

| Source | Covers | Ruleset |
| --- | --- | --- |
| [foreverchanges.pro › class/warrior](https://foreverchanges.pro/class/warrior), [class/druid](https://foreverchanges.pro/class/druid), [spellbook/warrior](https://foreverchanges.pro/spellbook/warrior), [spellbook/druid](https://foreverchanges.pro/spellbook/druid), [talents/warrior](https://foreverchanges.pro/talents/warrior), [talents/druid](https://foreverchanges.pro/talents/druid) | Forever talent and spell tooltips per rank, next to Classic Era 1.15.9 | Forever + Classic Era (client data) |
| [wago.tools DB2 SpellEffect (1.60.1.69913)](https://wago.tools/db2/SpellEffect?build=1.60.1.69913) and [(1.15.9.69722)](https://wago.tools/db2/SpellEffect?build=1.15.9.69722), plus [SpellName](https://wago.tools/db2/SpellName?build=1.60.1.69913), [SpellMisc](https://wago.tools/db2/SpellMisc?build=1.60.1.69913), [SpellDuration](https://wago.tools/db2/SpellDuration?build=1.60.1.69913), [TraitDefinition](https://wago.tools/db2/TraitDefinition?build=1.60.1.69913), [TraitDefinitionEffectPoints](https://wago.tools/db2/TraitDefinitionEffectPoints?build=1.60.1.69913), [CurvePoint](https://wago.tools/db2/CurvePoint?build=1.60.1.69913) | Energize amounts (tenths), periodic ticks, durations, per-rank talent curves. **Downloaded once on 2026-09-22 before we learned that robots.txt forbids it ([D9](../decisions.md#d9-wagotools-is-cited-never-crawled-2026-09-22)). A person should confirm in a browser; never fetch automatically.** | Forever + Classic Era (client data) |
| [docs/classes/warrior.md](../classes/warrior.md) §2.3, §3.1, Q5, Q17, Q18, Q20 | Warrior-specific rage modifiers, cost reductions, the Execute rule, and the DWS off-hand multiplier | Project doc (reconciled above) |
| [GuybrushGit/WarriorSim @ad5ac8b (Classic mode) › spell.js](https://github.com/guybrushgit/WarriorSim/blob/ad5ac8b5dd76db3f0fa7c41de52c0b0b60a5a4d8/js/classes/spell.js) | Refund flags: default 80%, Whirlwind and Execute none, Cleave on the default | Classic Era mode (the SoD mode is not used) |
| [ElliotWood/Forever#252](https://github.com/ElliotWood/Forever/issues/252) | Beta combat-log measurement: rage per landed white hit ∝ weapon speed (63 pairs, 9 warriors, levels 10–15) | Forever (third-party measurement) |
| [ClassicWoWCommunity/forever-bugs #47](https://github.com/ClassicWoWCommunity/forever-bugs/issues/47), [#72](https://github.com/ClassicWoWCommunity/forever-bugs/issues/72), [#78](https://github.com/ClassicWoWCommunity/forever-bugs/issues/78) | Crit normalization "intentional"; damage-taken rage measurements and fits; absorbs give 0 rage | Forever (community tracker) |
| [Blizzard forums: "Warrior Rage Normalization"](https://us.forums.blizzard.com/en/wow/t/warrior-rage-normalization-auto-attack-crits-dont-generate-extra-rage/2355684) | Player observations: per-swing rage, crits, HS swing gives 0 | Forever beta |
| [tzcnt/WarriorSim › data/forever/RAGE_GAIN.md](https://github.com/tzcnt/WarriorSim/blob/master/data/forever/RAGE_GAIN.md) | Independent Forever measurement (3.46 / 4.5 per second of weapon speed); off-hand assumptions | Forever (third-party) |
| [GuybrushGit/WarriorSim @180a3cc (May 2021) › player.js](https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js) | Classic 1.13 rage model: 7.5/230.6, dodge 75%, 80% refunds, Unbridled Wrath on autos/HS | Classic Era (the 2021 revision; later commits add SoD, not used) |
| [wow-aurana/bigdick (master)](https://github.com/wow-aurana/bigdick) | Classic 2019 Fury sim: conversion quadratic, dodge 75% ("Vilius on Fight Club"), 80% refund, Anger Management, Bloodrage | Classic Era |
| [magey/classic-warrior issue #27](https://github.com/magey/classic-warrior/issues/27) | 1.13 beta: refunds on whiffs except Whirlwind and Cleave | Classic Era |
| [magey/classic-warrior wiki › Windfury Totem](https://github.com/magey/classic-warrior/wiki/Windfury-Totem) | On-next-swing attacks turn the swing into a spell | Classic Era |
| [Blizzard Classic forums (2019): "Does armor affect rage generation"](https://us.forums.blizzard.com/en/wow/t/does-armor-effect-rage-generation/319913) | Damage-taken formula `× 2.5 / c`; absorbs give 0; the attacker gains rage when dodged or parried; Kalgan's formula quoted | Classic Era (community) |
| [vmangos core › Player.cpp](https://github.com/vmangos/core/blob/development/src/game/Objects/Player.cpp) | Berserker Rage ×1.3. **Forbidden source: recorded only as an open question, not adopted.** | Private-server emulator (forbidden) |
