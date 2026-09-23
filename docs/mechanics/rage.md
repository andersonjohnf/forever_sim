# Rage

How warriors and bear-form druids gain and spend rage: from white hits, from damage taken, from
talents, cooldowns and consumables, and what stance changes and shapeshifts cost. The Classic Era
baseline is well understood (a damage-based formula with conversion constant 230.6 at level 60).
**WoW Forever replaces it.** Forever beta combat logs show a landed white hit giving a fixed amount
of rage set by weapon speed (3.46 × speed with a one-hander and 4.5 × speed with a
two-hander). Crits give no extra rage. Misses, dodges and parries give none. Each hit you take
gives `10 × its damage before armor, block and absorbs ÷ your maximum health`, which about 2,000
logged beta hits fit. The beta tracker confirms the normalization is intentional. Forever
also adds 5-rage procs on blocks, dodges and parries, and makes Tactical Mastery baseline. Both
models are documented below. The Forever model is the engine default. It still counts as
unverified (`[?]`) until it has been measured at level 60.

Status: researched 2026-09-22; rage from damage taken and rounding 2026-09-23 (beta logs of 18–22 Sep, build 1.60.1) · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified

**Client-data values.** Values cited as `[client] (Table, build)` come from the raw Forever
client files (build 1.60.1.69913; Classic Era 1.15.9.69722 for the Classic halves), read through
the wago.tools API and parsed by `scripts/scrape/client.mjs`. The claim check in
[client.md][client] confirmed every value this doc had marked for a browser check, with no
corrections. Raw files lack server hotfixes and scripts (dummy effects, proc rates; see the
[hotfix caveat](../data/client.md#hotfix-caveat)). Where a foreverchanges.pro tooltip gives the
same number, the tooltip is the primary citation.

---

## What the sim needs

- A rage pool per character, stored in **tenths** (integers), with a cap of 100 rage
  ([rage-pool](#rage-pool-cap-and-decay)). Boundless Rage raises the cap by 10, 20 or 30.
- **Fractions of a tenth** ([rounding](#rounding)): in `forever` (`[?]`) a white hit's or a hit
  taken's fraction carries to the next such gain, so none is lost; `classicEra` floors each gain.
- **Rage from white hits.** There are two models behind a ruleset switch
  ([rage-from-damage-dealt](#rage-from-damage-dealt)):
  - `forever` (default, `[?]`): per landed white hit, `k × baseWeaponSpeed`, with `k = 3.46`
    for a one-hander and `4.5` for a two-hander. Crits and glancing blows change nothing. Misses,
    dodges and parries give 0.
  - `classic` `[C]`: `7.5 × damage / 230.6`. A white attack that is dodged or parried gives 75%
    of what it would have hit for. A miss gives 0.
- **On-next-swing attacks** (Heroic Strike, Cleave, Maul) replace the white swing. The swing
  itself generates no rage, in both models ([yellow-attacks](#yellow-damage-and-on-next-swing-attacks)).
- **Rage from damage taken**, also switchable ([rage-from-damage-taken](#rage-from-damage-taken)).
  Every model gives rage per hit that lands on you, and 0 for an attack you avoid (miss, dodge,
  parry):
  - `forever` (default, `[?]`): `10 × D_pre / maxHealth`. `D_pre` is the hit's damage before
    armor, block, absorbs and damage-taken modifiers, with a crit or crushing blow at its
    multiplied size. So a blocked or absorbed hit gives its full rage, even when it costs no
    health. Hits from several attackers each count, with no cap.
  - `classic` `[C]`: `2.5 × healthLost / 230.6`.
  - `foreverFlat` (`[?]` alternative): `1.5 × healthLost / 230.6`, an earlier low-level fit.
  - `foreverHealthLost` (`[?]` alternative): `10 × healthLost / maxHealth`.

  The three health-lost models give 0 for a hit that costs no health. Setups saved with the old
  ids still load: `foreverHp` is now `foreverHealthLost`, and `foreverHpPreArmor` is now
  `forever`.
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
  Rage from white hits and from damage taken produces none. Whether Forever's damage-taken rage
  is a hidden energize is open question 1.
- The expected-value tank model in [tank-model](#rage-model-for-a-tank-being-hit-by-a-boss) is
  there to sanity-check the simulation. The engine itself rolls every event.

---

## Rage pool, cap and decay

| Rule | Value | Tag | Source |
| --- | --- | --- | --- |
| Rage cap | 100 | [C] | [LTC2 core](https://github.com/dfherr/LibThreatClassic2/blob/master/ThreatClassModuleCore.lua), Classic sims ([WarriorSim `addRage`](https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js)) |
| Boundless Rage (Fury talent, 3 ranks) | +10 / +20 / +30 maximum rage | [F] | [foreverchanges › warrior](https://foreverchanges.pro/class/warrior); [client] (SpellEffect, CurvePoint, 1.60.1.69913): spell 1310236, aura 418, curve 100/200/300 tenths |
| Gnome, Expansive Mind (racial) | +5% maximum rage. How it combines with Boundless Rage, and how it rounds, is open. | [F] text; combination [?] | [warrior.md §2.3 and Q17](../classes/warrior.md#23-rage-warrior-specific), [racials](https://foreverchanges.pro/racials) |
| Internal unit | Tenths of rage. DB2 stores every rage amount ×10 (Bloodrage energize = 100 → 10 rage), and Forever combat logs report rage in tenths. | [F] | [client] (SpellEffect, 1.60.1.69913): 2687 = 100; [ElliotWood/Forever#252](https://github.com/ElliotWood/Forever/issues/252) |
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
k = 3.46 one-handed                (777 logged swings: 3.4608)
k = 4.5  two-handed                (354 logged swings: 4.4975)
crit / glancing / blocked-by-mob: same as a normal hit
miss, dodge, parry: 0
your attack fully absorbed by the target's shield: 0
```

| Evidence | What it shows | Source |
| --- | --- | --- |
| Beta combat logs, 17–18 Sep 2026, levels ~10–15: 63 clean pairs of auto attacks, 9 warriors, with no abilities used and no damage taken between them | 2.1 s 1H: 7.2–7.3 rage. 2.5 s 1H: 8.6–8.7 rage. 3.2 / 3.3 / 3.5 s 2H: 14.4 / 14.9 / 15.7 rage. Hits of 15–64 damage, crits included, made no difference. | [ElliotWood/Forever#252](https://github.com/ElliotWood/Forever/issues/252) |
| Beta tracker bug "Rage Generation Not Increased on Critical Hit" | Closed by the tracker maintainer as **"Not A Bug. This was done intentionally."** | [forever-bugs#47](https://github.com/ClassicWoWCommunity/forever-bugs/issues/47) |
| Beta forum thread (80 posts) | "1hrs around 7–9 rage every 2–3 s, 2hrs 14–17 every 3–4 s". On critters: 103-damage hit → 13 rage, 195-damage crit → 13 rage. Heroic Strike's swing "generates zero rage". | [Blizzard forums, Forever beta](https://us.forums.blizzard.com/en/wow/t/warrior-rage-normalization-auto-attack-crits-dont-generate-extra-rage/2355684) |
| A second Forever sim's measurements | 1H 3.46 per second of weapon speed, 2H 4.5 per second (levels 8–10). Crits no bonus, glancing no penalty, misses and dodges 0. | [tzcnt/WarriorSim RAGE_GAIN.md](https://github.com/tzcnt/WarriorSim/blob/master/data/forever/RAGE_GAIN.md) |
| Our re-read of the public beta logs (2026-09-23), with each swing's fraction counted ([rounding](#rounding)) | One-handers: 777 clean swings at 10 weapon speeds, from 23 characters, fit **k = 3.4608**; per speed, 3.449–3.464. Two-handers: 354 swings at 5 speeds, from 6 characters, fit 4.4975. A 2.6 s one-hander gives 8.9 or 9.0 (3.46 × 2.6 = 8.996), never 3.5's 9.1; a 2.0 s one 6.9 or 7.0 (6.92), mostly 6.9, where 3.5 gives 7.0 every swing under any rounding. The earlier reading of 3.45–3.5 came from not knowing how the log rounds. | [?] [fd-logs], [lutz-gist] |
| Forever talent text consistent with a per-hit, weapon-type model | Dual Wield Specialization: "off-hand Rage generation by 20%" per rank (+100% at 5/5). Unbridled Wrath: 2 rage per proc with two-handers. | [F] [foreverchanges › warrior](https://foreverchanges.pro/class/warrior) |

**Tagged `[?]`, not `[F]`.** The measurements come from third parties, not guild tests. They
were all taken at levels 8–15, and nobody has shown that the same rule holds at 60. The rule is
server-side, so the client tables can't confirm it.

**Unknowns** (each has a default and is listed under [Open questions](#open-questions)):

| Unknown | Default | Why |
| --- | --- | --- |
| Off-hand rage | This doc defines the off-hand **base**: `0.5 × 3.46 × OH speed`. Dual Wield Specialization then multiplies the result by `1 + 0.2 × rank` (×2.0 at 5/5). That multiplier is owned by [warrior.md §2.3](../classes/warrior.md#23-rage-warrior-specific) and example W23, so 5/5 gives the full 3.46 × speed. | A 50% off-hand base is what makes "+100% off-hand rage at 5/5" a sensible talent. [tzcnt](https://github.com/tzcnt/WarriorSim/blob/master/js/classes/player.js) does the same. The ElliotWood sim instead gives the full rate plus the talent. |
| Hasted or base speed | Base (unhasted) weapon speed | With the hasted interval, haste would be rage-neutral per second. Both Forever sims use base speed. |
| Level scaling | None: the same `k` at every level | Nothing points to scaling, but it is untested. |
| Extra attacks (Windfury, Sword procs, Reckoning) | Give rage like a normal landed hit | Same as Classic. Untested. |
| Bear form | The one-hander's `k × 2.5 s` = 8.65 per landed bear auto | Unmeasured. Players report "these rage changes also affect bears". The ElliotWood sim uses the 1H factor on the bear's 2.5 s attack. |

### Outcome summary for a white swing

| Outcome of your white swing | Classic Era [C] | Forever [?] |
| --- | --- | --- |
| Hit | `7.5 × dmg / c` | `k × speed` |
| Crit | `7.5 × critDmg / c` (≈ ×2) | `k × speed` (no bonus) |
| Glancing | `7.5 × glancedDmg / c` | `k × speed` (no penalty) |
| Blocked by the mob (bosses can't block from behind) | `7.5 × (dmg − blocked) / c` | `k × speed` |
| Dodged or parried | `0.75 × 7.5 × wouldBeDmg / c` | 0 |
| Miss | 0 | 0 |
| Fully absorbed by the target's shield | 0 [C, community] | 0, by design as a PvP counter, says the tracker's triager closing [forever-bugs#78](https://github.com/ClassicWoWCommunity/forever-bugs/issues/78) (2026-09-23) [?]. The hit's victim still gains rage ([damage taken](#forever-)). |

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
- **Unbridled Wrath** can proc on white hits, extra attacks and HS/Cleave swings, but not on
  other yellow attacks. [C] Classic sims (WarriorSim, Aurana, tzcnt) all limit it to autos plus
  HS/Cleave. In the Forever client data its proc mask is "melee auto attack" only ([F] [client]
  (SpellAuraOptions, 1.60.1.69913)), so the HS and Cleave part is open. This default and question
  Q5 are owned by [warrior.md §2.3](../classes/warrior.md#23-rage-warrior-specific). Confidence:
  medium.
- Forever Heroic Strike rank 9 is "+157 damage", unchanged from Classic
  ([spellbook](https://foreverchanges.pro/spellbook/warrior); 25286 [client] (SpellEffect,
  1.60.1.69913)). Damage, the queue and swing timing are covered in
  [damage-and-timing.md](damage-and-timing.md).

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
  agrees on it, but we found no controlled 1.13 test. In Classic Era a blocked hit gives rage for
  its unblocked part only. **Forever differs on both blocks and absorbs** ([Forever](#forever-)).
- **Berserker Rage**'s "generating extra rage when taking damage": **the multiplier is unknown
  for Classic Era.** Tooltips give no number. The only number we found comes from a forbidden
  private-server emulator (see [Open questions](#open-questions)). Engine default: ×1.0, flagged
  `[?]`. This is the question [warrior.md Q20](../classes/warrior.md#9-open-questions) hands to
  this doc. For Forever, [wowsims/forever f9f9f21883][wsf-rage] doubles it, marked as its own
  guess ("TODO: Ingame test needed"). That is a secondary source's guess, so it isn't adopted
  either.

### Forever [?]

```
rage per hit that lands on you = 10 × D_pre / maxHealth
D_pre = the hit's damage before armor, block, absorbs and damage-taken modifiers
        (a crit or crushing blow at its multiplied size [?])
blocked, partly or fully:   full rage (D_pre is unchanged)
absorbed, partly or fully:  full rage [?]
miss, dodge, parry:         0
several attackers:          each hit counts; no cap and no internal cooldown (18 Sep build)
```

**Method.** On 2026-09-23 we re-read the public beta logs in [tzcnt/forever-data @c7d1746][fd-logs]
(7 logs of 18–19 Sep 2026, build 1.60.1, many unrelated players) and 1337LutZ's 12 logs
([gist][lutz-gist], 22 Sep 2026, one warrior at levels 8–9). For each clean hit on a rage user,
with no other rage source between two power snapshots, the **ratio** is the rage gained (read in
tenths from the advanced log's power snapshot at `SWING_DAMAGE_LANDED`) ÷ `10 × D_pre /
maxHealth`. `D_pre` is the event's unmitigated amount (its second damage field: before armor,
block and absorbs). A ratio of 1.0 is the formula. The **factor** is `rage × maxHealth ÷ D_pre`,
so 10 is the formula.

| What | Evidence (third-party beta logs, levels about 5–25) | Tag, source |
| --- | --- | --- |
| The formula | About 2,000 clean hits on about 50 rage users, maximum health 155–730, armor 170 or more. The factor stays flat as maximum health rises: 9.75, 9.64, 9.84 and 9.91 by health band, and 9.8 at 400–449. Fitted to the damage **after** armor instead, it drifts from 12.8 to over 14.8. A flat rate per point of damage doesn't fit either: rage per point before armor falls from 0.055 to 0.022 as maximum health rises. 1337LutZ fitted the same formula to his own logs. | [?] [fd-logs], [lutz-gist]; [forever-bugs#72][fb72]; [magey/forever-warrior#3][fw3] |
| Blocked hits give full rage | 74 blocked hits on 22 players: median ratio 0.97 against the full `D_pre`, but 1.24 against the unblocked part alone. For example a hit of 8 blocked down to 1 gave +0.3 rage, where the full 8 predicts 0.26. The gist's log 01 shows the same: hits of 5 and 6 before mitigation, blocked down to 1, gave +0.3 rage each. | [?] [fd-logs], [lutz-gist] |
| Absorbed hits give rage | 2 fully absorbed hits on one player gave +0.3 and +0.2 rage, against 0.29 and 0.32 predicted. The tracker's triager closed [forever-bugs#78][fb78] as "[Incorrect Report]" on 2026-09-23: in their tests a warrior hit through Power Word: Shield still got "0 to 2 Rage". Forum reports disagree. Two say warriors still get rage under the shield and bears in form get none ([US 2354715 #2][f-pws1], [US 2356535 #1][f-pws2]); one says the shield does prevent it ([US 2358789 #2][f-pws3]). | [?] 2 hits; bears may differ (open question 1) |
| Several attackers each count | Median ratio with 1 attacker in 3 s: 0.97 (1,706 hits). With 2: 0.97 (260). With 3 or more: 0.98 (110). With 2 or more other mobs hitting within 1 s: 0.98 (67 hits, 97% of them between 0.7 and 1.4). When the previous hit came from a different mob under 0.35 s earlier: 0.98 (106). In the heaviest window 5–7 Kobolds hit one warrior 10 times in under 3 s, for 43.6% of his 195 maximum health before armor: +4.4 rage, against 4.36 predicted. Across multi-attacker 3 s windows worth 20–50% of maximum health, the median ratio is 1.00 (42 windows). No other source measured it; one forum post feels two mobs give too little rage ([US 2353811 #103][f-2mobs]). | [?] measured on the **18 Sep build** only; the beta updates weekly (next 2026-09-24) |
| Low armor doubles it | Below about 122–154 armor, rage per hit roughly doubles. Two characters at 122–123 armor show 1.85× and 2.3×, and 138–154 armor is mixed (0.8–2.2×). The threshold is probably a mitigation percentage, so it moves with the attacker's level. 1337LutZ saw the same below ~130–170 armor and suspects a bug. **Not modelled:** a level-60 tank's armor is far above it. | [?] [fd-logs]; [fw3] |
| Player reports | "Getting hit by mobs no longer generates any rage" ([EU 630258][f-eu1], [EU 630912][f-eu2]); "every forth attack against the warrior generates 1 rage" ([US 2358514 #1][f-4th]); about 10 hits of 4–5 damage per rage when geared ([US 2355684 #25][f-geared]). All fit the formula's size at low level: a 5-damage hit on 200 maximum health gives 0.25 rage. | [?] impressions |
| Bears | 33 hits on 4 players who are likely bears (armor 900 or more): median ratio 0.93. Weak evidence that bears use the same formula. | [?] [fd-logs]; open question 3 |

The logs show no Berserker Rage or Defensive Stance hits, so neither is measured. White-swing
rage is unchanged by this analysis ([above](#forever-normalized-rage-per-swing-)).

- **What's measured** (third-party, so `[?]`): the formula at levels about 5–25 on the 18 Sep
  build; full rage from blocked hits; rage from absorbed hits (2 hits); no cap or internal
  cooldown with several attackers; no rage from avoided attacks.
- **What's assumed** `[?]`:
  - It holds at level 60, where a tank has 6,000–8,000 maximum health and takes 4,000–6,000 per
    boss hit before armor. **The logs can't tell maximum health from a level term**: both rose
    together in them. A term in level instead of health would change level-60 rage.
  - Damage-taken modifiers (Defensive Stance −10%, Berserker Stance +10%, Death Wish +5%,
    Recklessness +20%) don't change `D_pre`: the log's unmitigated amount, which the rage
    follows, is the hit before all mitigation. Untested: the logs show no hits in those stances.
  - A crit counts at 2 × and a crushing blow at 1.5 × the hit's `D_pre`.
  - Several attackers still count in full on later builds.
- **The sim's maximum health leaves out base health**, which isn't known at 60
  ([character-stats OQ-2](character-stats.md#oq-2-base-health)). Since `forever` divides by it,
  its rage per hit comes out high until base health is known. The result says so.
- **At level 60** this gives much less than Classic Era. A 5,000 boss hit before armor gives a
  7,000-health tank `10 × 5000 / 7000` = 7.1 rage. Classic Era's model gives 19.8 for the same hit
  after 10,000 armor (1,826 lost).

**Engine models** (`damageTakenRage` in `src/sim/core/formulas.ts`). A setup can pick any of them
in its rules (`rules.damageTakenRage`), though the app has no control for it yet:

- **`forever`** (the Forever default): `10 × D_pre / maxHealth`, as above.
- **`foreverFlat`**: `1.5 × healthLost / c(L)`. It was the default until 2026-09-23, fitted to the
  earliest low-level reports on [forever-bugs#72][fb72] (about 0.6 × Classic). The logs don't
  support it: rage per damage moves with maximum health.
- **`foreverHealthLost`**: `10 × healthLost / maxHealth`. The same shape fitted to the damage after
  armor, which the logs don't support either.
- **`classic`** (the Classic Era default): see [above](#classic-era-c).

Rage from damage taken is still the least certain rage number for Forever tanks at 60. Open
question 1 lists the tests that would settle it.

---

## Rounding

The pool is kept in tenths, the unit of the client tables and the combat log
([pool](#rage-pool-cap-and-decay)). A white hit (`k × speed`) or a hit taken (`10 × D_pre ÷
maxHealth`) is rarely a whole number of tenths, and what happens to the rest decides whether
small gains count. A 5-damage hit on a 200-health character is worth 0.25 rage; floored to a
tenth it gives 0.2, and a stream of hits worth under 0.1 each gives nothing.

**Forever [?]: the fraction counts.** The logs show whole tenths, and each gain's fraction
counts in full on average. The engine carries a white hit's or a hit taken's fraction to the
next such gain: the pool holds whole tenths, and the fractions add up, so none is lost. The
fraction is lost when the pool is set rather than added to: at the cap (with the rest of the
gain), by a stance swap's limit, and when Execute spends all the rage.

**Classic Era [?]: floored.** Nothing measures it, so `classicEra` floors each gain to a tenth,
as the engine always has.

**Energizes** (Bloodrage, Shield Specialization, Unbridled Wrath and other spell effects) are
whole tenths in the client data and need no rounding. A talent-scaled one is floored: Improved
Bloodrage 1/2's 1.25-rage ticks give 1.2 ([warrior Q29](../classes/warrior.md#9-open-questions)).

**Evidence** (third-party, `[?]`). The public logs of the [damage-taken analysis](#forever-):
[tzcnt/forever-data][fd-logs] (18–19 Sep 2026, build 1.60.1, many players) and
[1337LutZ's][lutz-gist] 12 labelled logs (22 Sep 2026, one warrior), re-read on 2026-09-23. A
white swing's rage is the change in the advanced log's power snapshot at the swing, with no
other snapshot, spending or cap in between (the method of [damage taken](#forever-)).

1. **A weapon's swings give two neighbouring values, in the share the fraction predicts.** In
   the logs, 777 clean one-hander swings, grouped by the pair of values they take:

   | Weapon speed | `3.46 × speed` | Logged rage per swing | Share at the higher value: logged, predicted |
   | --- | --- | --- | --- |
   | 1.5 s | 5.19 | 5.1 ×3, 5.2 ×9 | 0.75, 0.90 |
   | 1.6 s | 5.536 | 5.5 ×9, 5.6 ×5 | 0.36, 0.36 |
   | 1.7 s | 5.882 | 5.8 ×15, 5.9 ×53 | 0.78, 0.82 |
   | 1.9 s | 6.574 | 6.5 ×8, 6.6 ×35 | 0.81, 0.74 |
   | 2.0 s | 6.92 | 6.9 ×22, 7.0 ×7 | 0.24, 0.20 |
   | 2.1 s | 7.266 | 7.2 ×35, 7.3 ×81 | 0.70, 0.66 |
   | 2.2 s | 7.612 | 7.6 ×13, 7.7 ×2 | 0.13, 0.12 |
   | 2.3 s | 7.958 | 7.9 ×59, 8.0 ×95 | 0.62, 0.58 |
   | 2.5 s | 8.65 | 8.6 ×118, 8.7 ×125 | 0.51, 0.50 |
   | 2.6 s | 8.996 | 8.9 ×3, 9.0 ×80 | 0.96, 0.96 |

   The speed is the one whose `3.46 × speed` falls between the two values; for 36 of the 44
   characters with enough swings (one character in one log each), the logged swing interval
   gives the same speed. Across the 34 whose two values are the floor and ceiling of `k × speed`
   (848 swings, two-handers included at `4.5 × speed`), 485 swings are at the higher value; a
   kept fraction predicts 500. **Flooring each swing predicts 0, and rounding each to the
   nearest tenth 805**: 332 swings sit below where the nearest tenth would put them. Any rule
   that rounds each gain by itself gives one weapon one value.
2. **Hits taken.** Identical hits give different rage: in 1337LutZ's logs a 5-damage hit on 203
   maximum health (0.246 rage) gave 0.2 eight times and 0.3 eleven times, where flooring or the
   nearest tenth give 0.2 every time. A hit of 8 before mitigation blocked down to 1 gave +0.3
   (0.26 predicted, 0.2 floored). The heaviest multi-attacker window, 10 Kobold hits on one
   warrior in under 3 s, gave +4.4 against 4.36 predicted; floored per hit it would be 4.0, and
   rounded per hit 4.5. Two fully absorbed hits gave +0.3 and +0.2 against 0.29 and 0.32.
3. **Carried or random?** The logs fit either way the fraction could count. Carried from gain to
   gain, one weapon's swings would alternate evenly: with a fraction under 0.5 two higher swings
   never come back to back, and above 0.5 two lower ones never do. Rounded up at random, with a
   chance equal to the fraction, both can happen. Of 36 pairs of back-to-back swings with nothing
   between them, 2 are pairs a carried fraction can't give; random rounding expects about 3. That leans
   towards random rounding, on too few pairs to decide, and both give the same average. The
   engine carries the fraction, which needs no random numbers and gives the same mean
   ([open question 9](#open-questions)).

These swings also set a one-hander's `k` at 3.46, not the 3.5 read before the rounding was
known: a 2.6 s weapon gives 8.9 or 9.0, never 9.1
([Forever white hits](#forever-normalized-rage-per-swing-)).

---

## Rage refunds on avoided abilities

| Rule | Value | Tag | Source |
| --- | --- | --- | --- |
| Special ability misses, or is dodged or parried | Refund 80% of the rage cost (you pay 20%) | [C] | [Magey issue #27](https://github.com/magey/classic-warrior/issues/27) (Pyte's 1.13 beta tests: "special abilities refund rage on a whiff except for Whirlwind and Cleave"). WarriorSim and Aurana use 0.8. |
| Whirlwind | No refund | [C] | Magey issue #27 (video analysis), and WarriorSim (`refund = false`) |
| Cleave | **No refund** | [C] | Magey issue #27: a dodged Cleave cost its full 20 rage in the video. **Disagreement:** WarriorSim's post-SoD code ([ad5ac8b spell.js](https://github.com/guybrushgit/WarriorSim/blob/ad5ac8b5dd76db3f0fa7c41de52c0b0b60a5a4d8/js/classes/spell.js)) leaves Cleave on the default 80% refund; its 2021 revision has no Cleave. We follow Magey's observation, and [warrior.md §2.3](../classes/warrior.md#23-rage-warrior-specific) lists Cleave among the exceptions. |
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
| Charge (rank 3) | 15 rage; can't be used in combat | 15 rage. Vanguard (Prot) lets you Charge from Defensive Stance. | [F][C] [client] (SpellEffect, 1.60.1.69913): 11578 energize 150; [spellbook](https://foreverchanges.pro/spellbook/warrior) |
| Improved Charge | +3 per rank | +3 per rank (same text) | [F][C] [class/warrior](https://foreverchanges.pro/class/warrior) |
| Bloodrage (1 min CD, costs health, puts you in combat) | 10 rage now, plus 1 rage/s for 10 s (20 total) | Same | [F][C] [client] (SpellEffect, 1.60.1.69913): 2687 energize 100; 29131 periodic energize 10 every 1000 ms for 10 s |
| Improved Bloodrage (2 ranks) | +2 / +5 instant rage | **+25% / +50% to all Bloodrage rage**: 12.5 + 1.25/s at 1/2, 15 + 1.5/s at 2/2 (30 total) | [F] [client] (CurvePoint, 1.60.1.69913): curve 25/50; [C] Classic text |
| Berserker Rage (30 s CD, 10 s) | Immune to Fear and Incapacitate; "extra rage when taking damage" (multiplier unknown) | Same text | [F][C] DB2 18499 (immunity auras only); multiplier [?] |
| Improved Berserker Rage (2 ranks) | 5 / 10 rage on use | 5 / 10 rage on use, plus a 50% / 100% chance to remove movement impairment | [F][C] |
| Anger Management (Arms) | 1 rage every 3 s in combat | 1 rage every 3 s in combat (now stated in the tooltip) | [F] tooltip + DB2 12296 (aura 85 + dummy 1/3). [C] Classic sims ([Aurana](https://github.com/wow-aurana/bigdick/blob/master/cooldowns.js)). |
| Unbridled Wrath (Fury, 5 ranks) | 8% per rank to gain 1 rage when you deal weapon damage (40% at 5/5) | **12% per rank (60% at 5/5); 2 rage with a two-hander** | [F] [client] (CurvePoint, SpellEffect, 1.60.1.69913): curve 12…60, energize 12964 = 10 tenths; [C] |
| Shield Specialization (Prot, 5 ranks) | +1% block per rank; 20% per rank to gain **1** rage on a block | +1% block per rank; 20% per rank to gain **5** rage on a block (100% at 5/5) | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913): 12298 → 1310318 energize 50, curve 20…100; [C] [client] (SpellEffect, 1.15.9.69722): 23602 energize 10 |
| Master of Defense (Prot, new, 2 ranks) | — | 50% / 100% chance to gain 5 rage when you dodge or parry **with a shield equipped** | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913): 1310316 → 23602 energize 50, curve 50/100 |
| Mighty Rage Potion (2 min potion CD) | 45–75 rage, +60 Strength for 20 s | 45–75 rage (600 ± 25%), +60 Strength for 20 s | [F] [client] (SpellEffect, SpellDuration, 1.60.1.69913): 17528 = 600 with Variance 0.5, duration 20 s; [C] [client] (SpellEffect, 1.15.9.69722): 449 + 1d301 |
| Dual Wield Specialization (Fury, 5 ranks) | Off-hand damage only | Also **+20% off-hand rage generation per rank** and +2% off-hand hit per rank | [F] [client] (CurvePoint, 1.60.1.69913): curves 5…25 / 20…100 / 2…10 |

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
| Forever | `10 + 3 × Improved Tactical Mastery rank`: 10 at 0/5, 25 at 5/5. Tactical Mastery is trained at level 14 (spell 1310185, "You retain up to 10 Rage"). | [F] | [spellbook](https://foreverchanges.pro/spellbook/warrior); [client] (SpellEffect, CurvePoint, 1.60.1.69913): 1310185 dummy 10; 12295 curve 3/6/9/12/15 |

Rage changes nothing else about stances. Stance threat and damage modifiers are in
[threat.md](threat.md#stance-and-form-modifiers).

---

## Bear druid rage

| Rule | Classic Era | Forever | Tags / source |
| --- | --- | --- | --- |
| Shifting into Bear or Dire Bear Form | Rage set to 0 | Assumed the same | [C] common Classic knowledge; Forever untested [?] |
| Furor (5 ranks) | 20% per rank to gain 10 rage on shifting to bear | Same bear effect (Cat part reworked) | [F] [client] (CurvePoint, SpellEffect, 1.60.1.69913): curve 20…100, 17057 energize 100; [C] |
| Rage from bear white hits | `7.5 × dmg / c` (same formula as warriors; bear attack speed 2.5 s) | Assumed `3.46 × 2.5` = 8.65 per landed auto, crits no bonus | [C]; Forever [?] (see [Forever model](#forever-normalized-rage-per-swing-)) |
| Rage from damage taken | `2.5 × dmg / c` | Same model as warriors (`10 × D_pre / maxHealth`). 33 logged hits on likely bears fit it at a median ratio of 0.93. Whether Power Word: Shield stops it for bears is open. | [C]; Forever [?] ([damage taken](#forever-), open question 3) |
| Maul | On-next-swing; the replaced swing gives no rage | Same | [C]; [F] spell unchanged (DB2 9881) |
| Enrage (1 min CD, 10 s, lowers armor) | 20 rage over 10 s (2 rage/s) | **10 rage now, plus 20 over 10 s (30 total)** | [F] [client] (SpellEffect, 1.60.1.69913): 5229 energize 100 + periodic 20/s; [C] periodic only |
| Improved Enrage | +5 / +10 instant | Removed (folded into Enrage) | [F] [class/druid](https://foreverchanges.pro/class/druid) |
| Wolfshead Helm (item 8345) | +5 rage on shifting into bear | **+5 rage from Enrage** instead (the bonus on shifting is removed) | [F] per [druid.md](../classes/druid.md), which owns it |
| Primal Fury (2 ranks) | 50% / 100% chance to gain 5 rage on any crit in bear form | Same bear effect (Cat part added) | [F][C] [client] (SpellEffect, 1.60.1.69913): 16959 energize 50 |
| Natural Reaction (new, 5 ranks) | — | +1% dodge per rank; 20% per rank to gain 5 rage on each dodge | [F] [client] (CurvePoint, SpellEffect, 1.60.1.69913): 417051 curves 1…5 / 20…100, 417053 energize 50 |
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
  R_taken  = Σ_o P(o) × f(D_o)          // o ∈ {hit, crit, crush, block}
                                        // forever: f = 10 × D_o / maxHealth, D_o = the swing before armor, block
                                        //   and Defensive Stance (×2 crit, ×1.5 crush). A block doesn't lower it.
                                        // classic 2.5/c · foreverFlat 1.5/c · foreverHealthLost 10/maxHealth:
                                        //   D_o = health lost, after armor, stance and block
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
(5 per proc) and much less from damage taken: a 5,000 boss hit before armor gives a 7,000-health
tank 7.1 rage, where Classic Era gives 19.8 after 10,000 armor. Block, dodge and parry now raise
rage income directly, and a block no longer costs the hit's rage. Stamina lowers rage per hit.
For a Classic tank, rage income is dominated by damage taken.

---

## WoW Forever deviations

| Topic | Classic Era | Forever | Tag |
| --- | --- | --- | --- |
| White-hit rage | `7.5 × dmg / 230.6`; crits ×2; dodges and parries 75% | `3.46 / 4.5 × weapon speed` per landed hit; crits no bonus; dodges and parries 0 | [?] measured by third parties and fitted to public logs, low level ([#252](https://github.com/ElliotWood/Forever/issues/252), [#47](https://github.com/ClassicWoWCommunity/forever-bugs/issues/47), [rounding](#rounding)) |
| Rage from damage taken | `2.5 × health lost / 230.6`; a block or absorb lowers it | `10 × damage before armor, block and absorbs ÷ max health`: blocked and absorbed hits give full rage, and several attackers each count. Much lower at 60. | [?] third-party beta logs at levels ~5–25 ([damage taken](#forever-); [fd-logs], [#72][fb72], [#78][fb78]) |
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
| Mighty Rage Potion, Charge, Bloodrage base, Furor, Primal Fury | — | No Forever change found | [F] [client] (SpellEffect, 1.60.1.69913) |
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
| Cleave refund | Now lists Whirlwind, Cleave and Execute as exceptions (2026-09-22) | No refund (Magey issue #27 video) | This doc owns refunds, so **Cleave does not refund**. Resolved in warrior.md §2.3. |
| Rage from white hits and damage taken in Forever | Defers to this doc. §5.4 used to expect Forever tanks to "run far richer in rage than Classic tanks"; it now links here and calls the outlook unverified (2026-09-22). | Forever white-hit rage is **normalized per swing**, and damage-taken rage is **`10 × damage before mitigation ÷ max health`**, about a third of Classic's for a level-60 tank (evidence from 2026-09-18 to 09-23, after warrior.md was researched) | The 5-rage procs are real [F], but the rage from white hits and damage taken is lower. Whether Forever tanks end up richer or poorer in rage than Classic depends on gear and avoidance, and stays unverified until the sim runs both models. Resolved in warrior.md. |
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
   Master of Defense, Natural Reaction), in the same event. Near the cap the order decides which
   rage is lost: a blocked hit's own rage fills the bar first, so Shield Specialization's 5 (an
   energize, 5 threat per rage) gains, and threatens, only what room is left. In `forever` a
   blocked hit's rage is that of its full `D_pre`, even when the block leaves no damage. Procs
   on damage taken (Enrage) need a hit that costs health.
5. **Periodic sources** (Bloodrage, Enrage, Anger Management) tick on their own timers. Anger
   Management ticks every 3000 ms from the start of combat. The phase is assumed, not measured.
6. Changing stance applies `min(rage, retain)` at the moment you swap.

**Rounding.** Keep rage as integer tenths, and never truncate the pool to whole rage. In
`forever`, keep a white hit's or a hit taken's fraction of a tenth, `0 ≤ f < 1`, and add it to
the next such gain: `whole = ⌊f + gain⌋`, `f = f + gain − whole`. Drop `f` whenever the pool is
set rather than added to: at the cap, a stance swap's limit, or Execute spending it all. In
`classicEra`, floor each gain. Energizes are whole tenths, except a talent-scaled one, which is
floored ([rounding](#rounding)). The per-fight reset sets `f = 0`, so each fight is reproducible
from its seed alone.

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
    const k = w.twoHand ? 4.5 : 3.46;                // [?] fitted to logged swings (rounding)
    const oh = hand === 'off' ? 0.5 : 1;             // [?] off-hand base
    return k * w.baseSpeedSec * oh;
  }
  // classic [C]
  const c = rageConversion(cfg.level);               // 230.6 at 60
  if (o === 'miss') return 0;
  if (o === 'dodge' || o === 'parry') return 0.75 * 7.5 * wouldBeDmg / c;
  return 7.5 * dmgDealt / c;                         // hit, crit, glance, blocked-by-mob
}

// docs/mechanics/rage.md#rage-from-damage-taken. Called for hits that land on you: an attack
// you miss, dodge or parry never gets here. dPre = the hit before armor, block, absorbs and
// damage-taken modifiers (a crit or crushing blow at its multiplied size).
function damageTakenRage(healthLost: number, dPre: number, cfg: RageCfg, maxHealth: number): number {
  const c = rageConversion(cfg.level);
  switch (cfg.takenModel) {
    case 'forever':           return dPre > 0 ? 10 * dPre / maxHealth : 0;         // [?] default; blocked or absorbed: full
    case 'foreverFlat':       return healthLost > 0 ? 1.5 * healthLost / c : 0;    // [?] alternative
    case 'foreverHealthLost': return healthLost > 0 ? 10 * healthLost / maxHealth : 0; // [?] alternative
    case 'classic':           return healthLost > 0 ? 2.5 * healthLost / c * cfg.berserkerRageMult : 0; // [C]; mult [?] = 1.0
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
- Skipped under the 0.5% rule (doctrine §4): out-of-combat decay, and whether the server
  carries a gain's fraction or rounds it at random (both give the same mean; [rounding](#rounding)).

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
| R6 | Forever: 1H main-hand, base speed 2.6, hit or crit | 2.6 × 3.46 = **8.996** (89.96 tenths, the fraction carried) |
| R7 | Forever: 2H, base speed 3.8, glancing blow | 3.8 × 4.5 = **17.1** |
| R8 | Forever: off-hand 1.8 s; base, then with 5/5 DWS (×2.0, [warrior.md W23](../classes/warrior.md#w23-off-hand-rage-with-dual-wield-specialization-55)) | Base 1.8 × 3.46 × 0.5 = **3.114**; with 5/5 DWS **6.228** |
| R9 | Forever: any white swing dodged or parried | **0** |
| R10 | Classic: 1,000 health lost to a boss hit | 1000 × 2.5 / 230.6 = **10.841** |
| R11 | `foreverFlat`: 1,000 health lost | 1000 × 1.5 / 230.6 = **6.505** |
| R11b | `foreverHealthLost`: 1,000 health lost, maximum health 7,000 | 10 × 1000 / 7000 = **1.429** |
| R12 | Forever default (`forever`): a hit of 2,000 before mitigation that costs 1,000 health, maximum health 7,000 | 10 × 2000 / 7000 = **2.857** |
| R12a | Forever default: maximum health 195; 10 hits from 5–7 attackers in under 3 s, 43.6% of maximum health before armor in all (the logged Kobold window) | 10 × 0.436 = **+4.36** rage (logged: +4.4). Each hit counts: no cap, no internal cooldown. |
| R12b | Forever default: a hit of 8 before mitigation, blocked down to 1, maximum health 200 | 10 × 8 / 200 = **0.4**, the rage of all 8 (the unblocked 1 alone would give 0.05) |
| R12c | Forever default: a hit of 50 before mitigation, fully absorbed, maximum health 1,000 | 10 × 50 / 1000 = **0.5**. The health-lost models give **0**. |
| R12d | Any model: an attack you miss, dodge or parry | **0** |
| R12e | Forever default at 60: a boss hit of 5,000 before armor (1,826.4 after 10,000 armor), maximum health 7,000; then its crit and crushing blow | **7.143**; crit (10,000) **14.286**; crushing (7,500) **10.714** |
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
| R23 | Tank model, Forever. Boss swings every 2.0 s for 3,000 before armor. Outcomes: miss 5%, dodge 15%, parry 15%, block 25% (1,050 lost), hit 40% (1,200 lost after armor and Defensive Stance). Classic damage-taken model, Shield Specialization 5/5, Master of Defense 2/2. | R_taken = 0.40 × 13.0095 + 0.25 × 11.3833 = 8.0497. R_block = 1.25. R_avoid = 1.5. Per swing **10.7997**; **5.3998 rage/s** |
| R24 | Same as R23 with the Forever default, maximum health 7,000. The block doesn't lower the hit's rage. | R_taken = (0.40 + 0.25) × 10 × 3000 / 7000 = 2.7857. Per swing 5.5357; **2.7679 rage/s** |
| R24b | Same as R23 with `foreverFlat` (`1.5/c`) | R_taken = 8.0497 × 0.6 = 4.8298. Per swing 7.5798; **3.7899 rage/s** |
| R25 | Execute (cost 15) dodged at 50 rage | Rage after = **35** (the cost is lost, the extra 35 is kept, no refund) |
| R26 | Execute (cost 15) hits at 50 rage | Rage after = **0** (the damage uses 35 extra rage; see warrior.md W10) |
| R27 | Forever: a 3.5 s two-hander (4.5 × 3.5 = 15.75 rage), two landed swings from 0 | The pool shows **15.7**, then **31.5**, its fraction carried. Floored per swing it would be 31.4. |
| R28 | Forever: a hit of 5 before mitigation every second, maximum health 990 (10 × 5 / 990 = 0.0505 rage each), 59 hits | **2.9** rage (29.8 tenths, floored once). Floored per hit it would be 0. |
| R29 | Forever, cap 100: the swings of R27 from 0, ten of them | 15.7, 31.5, 47.2, 63.0, 78.7, 94.5, then **100**: the 7th's 15.7 loses 10.2 over the cap, and its 0.05 with it. At the cap each later swing wastes 15.7, never 15.8: **57.3** wasted in all. |
| R30 | Classic Era: a 10-damage hit every second (2.5 × 10 / 230.6 = 0.108 rage each), 59 hits | Each floored to 0.1: **5.9** rage |

---

## Open questions

Each item says what to measure on the Forever beta. Record results with build, date, method and
sample size (doctrine §2, tier 2).

1. **Rage from damage taken: confirm the logged fit (highest priority for tank TPS).** The
   default, `10 × D_pre / maxHealth`, fits third-party logs at levels about 5–25 on the 18 Sep
   build ([Forever](#forever-)). Turn on advanced combat logging and log `/combatlog` with
   `UNIT_POWER_UPDATE`. For each hit, record the log's unmitigated amount, the health lost, any
   blocked or absorbed amount, and your maximum health, armor and level. Take ≥50 hits per
   condition. The tests:
   - **Several attackers on the current build** (2026-09-24 or later): rage per hit from 1 mob,
     then from 3 or more at once. The 18 Sep logs show no cap or internal cooldown; a newer build
     could add one.
   - **Maximum health or level:** at one level, change maximum health (Stamina gear, Power Word:
     Fortitude) with armor held; then compare two levels at about the same maximum health. The
     logs can't tell the two apart, since both rose together in them.
   - **Berserker Rage** on and off, against the same mobs (item 5).
   - **Defensive Stance** against Battle Stance: does its −10% damage taken lower the rage? The
     default says no.
   - **Mob crits and crushing blows:** rage per crit or crush against a plain hit's. The default
     counts them at 2 × and 1.5 × `D_pre`.
   - **Power Word: Shield**, on a warrior and on a bear in form: rage from fully absorbed hits.
     Two logged hits and the tracker's triager say warriors still get it; forum reports
     disagree, and say bears get none.
   - **Bears:** rage per hit taken in Bear Form (item 3).
   - **A hidden energize:** does the combat log show the damage-taken rage as a
     `SPELL_ENERGIZE` with its own spell ID? If so, look the ID up in the client data, and check
     whether it makes threat as energizes do ([threat.md](threat.md#threat-from-healing-power-gains-and-buffs)).
   - Note whether the doubling below ~122–154 armor still happens, and at what mitigation.
2. **White-hit rage at level 60.**
   - Confirm `k = 3.46 / 4.5` at 60. The logs fit 3.4608 and 4.4975 at low level
     ([rounding](#rounding)); a two-hander's 4.4975 could be 1.3 × 3.46 = 4.498.
   - Hasted or base speed: log with and without Flurry or a haste effect.
   - The off-hand base rate: 50% or 100%, and how DWS scales it.
   - Whether extra attacks (Windfury, Sword Weaponmaster, Reckoning) give rage.
3. **Bear rage.** Does normalization apply? If so, with what factor per landed bear auto (the
   default 3.46 × 2.5 = 8.65)? One player reports "11 rage per hit no matter what, 1 rage when i
   get hit" ([US 2355684 #97][f-bear]); one anecdote, so the default stays. Log landed bear autos
   and the rage each gives. Does the damage-taken formula apply to bears too? 33 logged hits on
   likely bears fit it at a median ratio of 0.93 ([Forever](#forever-)); log rage per hit taken in
   Bear Form as in item 1.
4. **Refunds in Forever**: miss/dodge/parry refund percentage, and which abilities are exempt.
   Specifically:
   - Does Cleave refund? Magey says no; WarriorSim says yes.
   - What happens to Execute's cost and extra rage on a miss? Read rage before and after a
     dodged Execute at a known rage.
   - Does Maul refund?
5. **Berserker Rage multiplier on damage-taken rage.** We only found it in forbidden code, so it
   is **not adopted**: the vmangos emulator uses `addRage *= 1.3f` when aura 18499 is present
   ([vmangos Player.cpp `RewardRage`](https://github.com/vmangos/core/blob/development/src/game/Objects/Player.cpp)).
   For Forever, [wowsims/forever f9f9f21883][wsf-rage] uses ×2 as its own guess ("TODO: Ingame
   test needed"), also not adopted. Test: take a series of equal hits with and without Berserker
   Rage active.
6. **Shapeshift rage reset.** Does shifting to bear still set rage to 0 in Forever?
7. **Anger Management tick phase**: from the start of combat, or from when the talent is gained.
   It is a minor issue.
8. **Classic dodge/parry 75% rule** (only matters in `classic` mode): is "would-be damage" taken
   before or after armor?
9. **Rounding: is each gain's fraction carried, rounded at random, or floored, and does it hold
   at 60?** The default carries it ([rounding](#rounding)). The logs rule out flooring and the
   nearest tenth per gain, and lean towards random rounding over a carried fraction on 36 pairs
   of swings. **Test: log many hits and see whether the totals drift.** One weapon, auto attack
   only, nothing else giving rage (no rage talents, a target that can't hit back, the pool far
   from the cap): log 50 or more landed swings in a row and compare the rage gained with
   `swings × k × speed`. A carried fraction keeps the total within 0.1 of it all the way; random
   rounding wanders about ±0.35 after 50 swings at a fraction of 0.5; flooring each swing falls
   behind by the fraction every swing (2.5 after 50). Then take a stream of small hits (a weak
   mob, no swings of your own) and do the same with `10 × D_pre / maxHealth` per hit. Also note
   back-to-back swings: with a fraction under 0.5, a carried fraction never gives two higher
   swings in a row. Classic Era: the same test with a Classic Era warrior.

---

## Sources

| Source | Covers | Ruleset |
| --- | --- | --- |
| [foreverchanges.pro › class/warrior](https://foreverchanges.pro/class/warrior), [class/druid](https://foreverchanges.pro/class/druid), [spellbook/warrior](https://foreverchanges.pro/spellbook/warrior), [spellbook/druid](https://foreverchanges.pro/spellbook/druid), [talents/warrior](https://foreverchanges.pro/talents/warrior), [talents/druid](https://foreverchanges.pro/talents/druid) | Forever talent and spell tooltips per rank, next to Classic Era 1.15.9 | Forever + Classic Era (client data) |
| [wago.tools DB2 SpellEffect (1.60.1.69913)](https://wago.tools/db2/SpellEffect?build=1.60.1.69913) and [(1.15.9.69722)](https://wago.tools/db2/SpellEffect?build=1.15.9.69722), plus [SpellName](https://wago.tools/db2/SpellName?build=1.60.1.69913), [SpellMisc](https://wago.tools/db2/SpellMisc?build=1.60.1.69913), [SpellDuration](https://wago.tools/db2/SpellDuration?build=1.60.1.69913), [TraitDefinition](https://wago.tools/db2/TraitDefinition?build=1.60.1.69913), [TraitDefinitionEffectPoints](https://wago.tools/db2/TraitDefinitionEffectPoints?build=1.60.1.69913), [CurvePoint](https://wago.tools/db2/CurvePoint?build=1.60.1.69913) | Energize amounts (tenths), periodic ticks, durations, per-rank talent curves. Browse links; the values are checked against the raw client files in [client.md][client] (read through the wago.tools API, [D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)). | Forever + Classic Era (client data) |
| [docs/classes/warrior.md](../classes/warrior.md) §2.3, §3.1, Q5, Q17, Q18, Q20 | Warrior-specific rage modifiers, cost reductions, the Execute rule, and the DWS off-hand multiplier | Project doc (reconciled above) |
| [GuybrushGit/WarriorSim @ad5ac8b (Classic mode) › spell.js](https://github.com/guybrushgit/WarriorSim/blob/ad5ac8b5dd76db3f0fa7c41de52c0b0b60a5a4d8/js/classes/spell.js) | Refund flags: default 80%, Whirlwind and Execute none, Cleave on the default | Classic Era mode (the SoD mode is not used) |
| [ElliotWood/Forever#252](https://github.com/ElliotWood/Forever/issues/252) | Beta combat-log measurement: rage per landed white hit ∝ weapon speed (63 pairs, 9 warriors, levels 10–15) | Forever (third-party measurement) |
| [ClassicWoWCommunity/forever-bugs #47](https://github.com/ClassicWoWCommunity/forever-bugs/issues/47), [#72][fb72], [#78][fb78] | Crit normalization "intentional"; damage-taken rage measurements and fits; #78, closed 2026-09-23 as "[Incorrect Report]": a warrior hit through Power Word: Shield still gains rage, and hitting a shielded target gives none, by design | Forever (community tracker) |
| [tzcnt/forever-data @c7d1746 › raw-logs][fd-logs] | 7 public advanced combat logs, 18–19 Sep 2026, build 1.60.1, many players: our 2026-09-23 re-analysis of rage from damage taken (about 2,000 hits; blocks, absorbs, several attackers, low armor, likely bears) | Forever (third-party logs) |
| [1337LutZ's logs (gist)][lutz-gist] and [magey/forever-warrior#3][fw3] | 12 logs of one warrior at levels 8–9 (22 Sep 2026), and his write-up fitting `10 × damage before armor ÷ max health` | Forever (third-party measurement) |
| [wowsims/forever f9f9f21883][wsf-rage] | A Forever sim's rage port (1337LutZ, 2026-09-22): 3.46 / 4.5, off hand half, damage taken as `10 × damage before armor ÷ max health`, Berserker Rage ×2 as a guess | Forever (secondary sim) |
| Blizzard forums, Forever beta: [US 2354715 #2][f-pws1], [US 2356535 #1][f-pws2], [US 2358789 #2][f-pws3], [US 2353811 #103][f-2mobs], [US 2358514 #1][f-4th], [US 2355684 #25][f-geared], [US 2355684 #97][f-bear], [EU 630258][f-eu1], [EU 630912][f-eu2] | Player impressions: Power Word: Shield and rage, several mobs, low rage from being hit, a bear's ~11 rage per auto | Forever beta (anecdotal) |
| [Blizzard forums: "Warrior Rage Normalization"](https://us.forums.blizzard.com/en/wow/t/warrior-rage-normalization-auto-attack-crits-dont-generate-extra-rage/2355684) | Player observations: per-swing rage, crits, HS swing gives 0 | Forever beta |
| [tzcnt/WarriorSim › data/forever/RAGE_GAIN.md](https://github.com/tzcnt/WarriorSim/blob/master/data/forever/RAGE_GAIN.md) | Independent Forever measurement (3.46 / 4.5 per second of weapon speed); off-hand assumptions | Forever (third-party) |
| [GuybrushGit/WarriorSim @180a3cc (May 2021) › player.js](https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js) | Classic 1.13 rage model: 7.5/230.6, dodge 75%, 80% refunds, Unbridled Wrath on autos/HS | Classic Era (the 2021 revision; later commits add SoD, not used) |
| [wow-aurana/bigdick (master)](https://github.com/wow-aurana/bigdick) | Classic 2019 Fury sim: conversion quadratic, dodge 75% ("Vilius on Fight Club"), 80% refund, Anger Management, Bloodrage | Classic Era |
| [magey/classic-warrior issue #27](https://github.com/magey/classic-warrior/issues/27) | 1.13 beta: refunds on whiffs except Whirlwind and Cleave | Classic Era |
| [magey/classic-warrior wiki › Windfury Totem](https://github.com/magey/classic-warrior/wiki/Windfury-Totem) | On-next-swing attacks turn the swing into a spell | Classic Era |
| [Blizzard Classic forums (2019): "Does armor affect rage generation"](https://us.forums.blizzard.com/en/wow/t/does-armor-effect-rage-generation/319913) | Damage-taken formula `× 2.5 / c`; absorbs give 0; the attacker gains rage when dodged or parried; Kalgan's formula quoted | Classic Era (community) |
| [vmangos core › Player.cpp](https://github.com/vmangos/core/blob/development/src/game/Objects/Player.cpp) | Berserker Rage ×1.3. **Forbidden source: recorded only as an open question, not adopted.** | Private-server emulator (forbidden) |

[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[fd-logs]: https://github.com/tzcnt/forever-data/tree/c7d17462c50d1eb0103aa5e2aff52f77f33e3418/raw-logs
[lutz-gist]: https://gist.github.com/077264a1aada001889e5ce0f47674623
[fb72]: https://github.com/ClassicWoWCommunity/forever-bugs/issues/72
[fb78]: https://github.com/ClassicWoWCommunity/forever-bugs/issues/78
[fw3]: https://github.com/magey/forever-warrior/issues/3
[wsf-rage]: https://github.com/wowsims/forever/commit/f9f9f21883
[f-pws1]: https://us.forums.blizzard.com/en/wow/t/2354715/2
[f-pws2]: https://us.forums.blizzard.com/en/wow/t/2356535/1
[f-pws3]: https://us.forums.blizzard.com/en/wow/t/2358789/2
[f-2mobs]: https://us.forums.blizzard.com/en/wow/t/2353811/103
[f-4th]: https://us.forums.blizzard.com/en/wow/t/2358514/1
[f-geared]: https://us.forums.blizzard.com/en/wow/t/warrior-rage-normalization-auto-attack-crits-dont-generate-extra-rage/2355684/25
[f-bear]: https://us.forums.blizzard.com/en/wow/t/warrior-rage-normalization-auto-attack-crits-dont-generate-extra-rage/2355684/97
[f-eu1]: https://eu.forums.blizzard.com/en/wow/t/630258/1
[f-eu2]: https://eu.forums.blizzard.com/en/wow/t/630912/1
