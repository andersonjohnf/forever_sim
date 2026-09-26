# Open questions: the in-game testing checklist

This is the in-game testing checklist. It merges the *Open questions* sections of the research
docs (eight mechanics docs, three class docs and the items dataset doc) into one
deduplicated list of everything the sim currently assumes that a person needs to verify. The
list is grouped by how each question can be answered today: on a level-60 **Classic Era**
character (Route A), on the **Forever beta at its current level cap** (Route B), on **Forever
at level 60** once the cap lifts or at launch (Route C), or by reading the Forever client's own
data tables (Route D). Route D is now closed: the client-data pipeline checked every value in it
against the raw client files ([client.md](data/client.md#doc-claims-checked-against-the-raw-client)).
Within each route, questions are sorted by their impact on sim output
and then by the milestone that needs them. Nothing here answers a question: each entry states
the docs' current assumption, and the linked doc sections own the value. Record every result in
the owning doc ([Recording results](#recording-results)), then tick it off here.

Status: consolidated 2026-09-22, reconciled with the cross-doc review the same day
([D13](decisions.md#d13-cross-doc-reconciliation-rules-2026-09-22)), and synced with the
client-data check the same day ([client.md](data/client.md)); B9, B14, C2 and C25 updated
2026-09-23 from the beta-log analysis of rage from damage taken
([rage.md](mechanics/rage.md#forever-)), and B77 added the same day from its rounding
([rage.md](mechanics/rage.md#rounding)); B9, B14 and C2 noted 2026-09-24 from two bears' logs
([rage.md](mechanics/rage.md#bear-logs-of-23-and-24-sep-)), defaults unchanged; B79 added
2026-09-24 from the ability-counts review (Deep Wounds' refresh,
[its review](reviews/2026-09-24-ability-counts.md)); A9 and B81 added 2026-09-25 from the Power
Infusion review (buffs OQ 23 and 21); B86 and B87 added 2026-09-26 from the beta-log re-read
(warrior Q37 and Q38, hunter OQ-H9) · Forever beta 1.60.1.69913 · Classic Era
1.15.9.69722 · beta capped at level 20 (rising to 30), launch 2026-11-04, raids unlock 2026-12-09

**152 entries, 129 open:** Route A 9 (High 1, Medium 2, Low 6) · Route B 83 (23 / 28 / 32) ·
Route C 37 (9 / 14 / 14) · Route D 23, all ✅ resolved from client data (was 7 / 11 / 5), plus
7 items settled by the sim or a guild decision. The client-data check added in-game checks to
B41, C11 and C12 rather than new entries.

---

## How to read an entry

- **Impact.** **High**: could move DPS or TPS by more than ~2%, or blocks a spec. **Medium**:
  about 0.5–2%, or one spec only. **Low**: under ~0.5%, niche setups, or UI only.
- **Milestone.** M2 warrior DPS, M3 warrior Protection, M4 feral druid, M5 paladin
  ([milestones](milestones.md)). An entry lists the earliest milestone that needs it.
- **Level** (Route B). **≤20** works at today's cap. **≤30** needs a level 21–30 ability or a
  tier-4/5 talent (tier *n* needs 5 × (*n* − 1) points spent) and waits for the cap to reach
  30. Forever trainer levels can differ from Classic's: if an ability isn't trainable yet, the
  entry waits.
- **Tags** follow [doctrine](doctrine.md#tagging): [F] Forever, [C] Classic Era, [?] unverified.
  Values read from the Forever client's UI code or strings (a verbatim mirror) are [F] for what
  the client displays or computes and [?] in combat until measured
  ([doctrine §2](doctrine.md#2-where-numbers-come-from-non-negotiable)). The `forever` profile
  uses them as defaults; the B and C entries below say what to measure.
- **Boss conditions without a boss.** Attack mobs **three levels above you**: their defense is
  5 × level, the same +3 gap as a level-60 player vs a level-63 boss. The beta has **no target
  dummies** ([system-changes OQ 8](mechanics/forever-system-changes.md#open-questions)), so
  every test uses mobs. DPS tests attack from **behind** (no parry or block); tank tests attack
  from the **front**.
- **Logging.** `/combatlog` and the log file, the built-in swing timer, an addon on
  `UNIT_POWER_UPDATE` for rage and Energy, and Magey's threat macro
  `/run local _,_,_,_,t=UnitDetailedThreatSituation("player","target") print(t)`. The modern
  addon API limits combat-log detail.
- **Third-party sweeps.** Magey's group is running the +3 attack-table sweep
  ([magey/forever-warrior#1](https://github.com/magey/forever-warrior/issues/1)). Read its
  results before starting B2–B7 and B12; an in-game run then confirms them as tier-2 data.

## Recording results

Doctrine tier 2 ([doctrine §2](doctrine.md#2-where-numbers-come-from-non-negotiable)) needs
four things with every result: **build number, date, method and sample size**.

- **Build:** the exact client build (`/dump GetBuildInfo()`), not just "beta".
- **Method:** addon or log used, race/class/level, talents, gear and ratings, target level and
  type, and position (front or behind).
- **Sample size:** the count (swings, hits, casts, ticks), plus a ±range if you can.
- Link raw data (log file, screenshots) so someone else can recount.
- Write the result into the **owning doc** (the *Docs* links), change the tag (Forever
  measurement → [F]; Classic Era sheet → [C], "measured on Classic Era"), and tick the entry
  here. Post negative and inconclusive results too.
- If a measurement contradicts a tooltip or client data, the measurement wins; flag the
  conflict in the doc.

```text
B2 · 1.60.1.xxxxx · 2026-09-24 · Tauren warrior 20, 2H, 1% hit (Endurance), behind, level-23 mobs
Method: /combatlog, white outcomes counted by script · n = <swings>
Result: white miss <x.x>% (±<y.y>% at 95%) · raw: <link>
```

---

## Top 10 to test first

1. [B1](#b1-rage-per-landed-white-hit): rage per landed white hit (M2; any warrior, today).
2. [B2](#b2-hit-suppression-and-the-raid-boss-hit-cap): hit suppression and the hit cap (M2).
3. [B3](#b3-crit-suppression-against-a-3-target): crit suppression vs +3 (M2; same logs as B2).
4. [B4](#b4-rating-conversions-sheet-and-combat): rating conversions, sheet test first (all
   specs; ten minutes).
5. [B5](#b5-armor-mitigation-constant): armor constant from the character sheet (M2; one
   read, high stakes if wrong).
6. [B6](#b6-heroic-strike-queue-and-the-off-hand-miss-penalty): Heroic Strike queue and the
   off-hand miss penalty, with a bigger sample (M2).
7. [A1](#a1-paladin-and-druid-base-stats-naked-sheets): naked Classic Era sheets for paladin and
   druid, to replace the [D24](decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23) placeholders (any level-60 Classic Era character).
8. [B9](#b9-rage-from-damage-taken-confirm-the-logged-fit): rage from damage taken, confirming
   the logged fit (M3).
9. [B10](#b10-sunder-armor-threat): Sunder Armor's attack power term (M3).
10. [B12](#b12-boss-parry-from-the-front): boss parry from the front (M3, M4, M5 tanks; same
    session as B2 and B3).

---

## Route A: Classic Era at level 60

A level-60 character on a live **Classic Era** realm (normal or Hardcore, **not** Season of
Discovery). Results are tagged [C], "measured on Classic Era", with realm, client build, date
and character. The **standard naked sheet** is defined in
[character-stats Open questions](mechanics/character-stats.md#open-questions): every item and
buff removed, talents reset or listed, caster form or Battle Stance, then hover each stat.

### High

#### A1. Paladin and druid base stats (naked sheets)
**High · M4, M5**
- **Assumes:** the paladin and druid class rows (Str, Agi, Sta, Int, Spi) may stand in as D24
  placeholders until a sheet replaces them [?], so they no longer block either spec
  ([D24](decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)). The druid's are in use, and every druid base value is a placeholder, not
  evidence: the Night Elf and Tauren rows are the mangos emulator's 1.12 rows (ClassicSim's
  pre-SoD rows reproduce them: corroboration only), Skyborne druids use the class row, and base
  health 1,483, base melee crit and dodge 0.9%, base spell crit 1.8% and caster AP −20 are values
  two sims copied from a private server. The base crit comes first: its plausible range, 0–1%,
  moves cat DPS by up to about 1.5%, over D24's 1%; the AP's −20 is about 0.7% of cat DPS. The
  paladin's are in use the same way: the Human and Dwarf rows are the mangos rows (Undead derived
  from the Human row with the [C] offset), and base health 1,381, dodge 0.7%, melee crit 0.7% and
  spell crit 3.5% are D24 placeholders [?].
  Base melee crit's sources conflict (0 to 1.7%): its likely error moves Ret DPS by
  −0.62% to +0.92%. Also unknown for the
  paladin: base parry and block (5% [?]), and the AP term `160 + 2 × Str` [?]. The druid's spirit regen `15 + Spirit/5` per 2 s
  comes only from a secondary sim [?].
- **Test:** standard naked sheet for a Human paladin, Dwarf paladin, Night Elf druid and Tauren
  druid. Druids also shift to Cat, Bear and Dire Bear and read AP, crit, armor and health in
  each. For spirit regen, stand out of combat, spend no mana for 5 s, and note mana gained per
  2 s tick at a known Spirit. Record the base and bonus part of each attribute (tooltip), HP,
  mana, AP, melee crit, Holy (paladin) or Nature (druid) spell crit, dodge, parry, block with a
  shield, and defense. The druid caster and Cat AP formulas can also be checked on the beta at
  the cap (Route B): Cat AP at level L should be `2 × Str + Agi − 20 + 12 + 2 × (L − 6)`.
- **Samples:** one sheet per race/class (two races per class confirm the race-offset rule);
  3+ regen ticks.
- **Changes:** replaces the placeholder class rows and base values (the Human paladin's crit
  first), and settles druid Q30.
- **Docs:** [stats OQ-1](mechanics/character-stats.md#oq-1-paladin-druid-and-skyborne-base-attributes),
  [OQ-2](mechanics/character-stats.md#oq-2-base-health),
  [OQ-3](mechanics/character-stats.md#oq-3-base-melee-and-spell-crit),
  [OQ-5](mechanics/character-stats.md#oq-5-base-dodge-parry-and-block),
  [OQ-7](mechanics/character-stats.md#oq-7-base-attack-power-formulas);
  [druid Q30](classes/druid.md#10-open-questions)

### Medium

#### A2. Warrior naked sheets: base health, avoidance, rounding
**Medium · M2 (avoidance: M3)**
- **Assumes:** warrior Str, Agi, Sta and Int from WarriorSim's pre-SoD Classic rows and additive
  race offsets [C]; warrior Spirit [?] (only WarriorSim's post-SoD data has it); base health
  1,689, a [?] placeholder ([D24](decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23);
  the client ships no base-HP table, only `hppersta.txt`: 10 HP per Stamina at 60 [F client]);
  base dodge 0% [C]; base parry 5% and block 5% [?]; attributes floored once after all
  multipliers [?]; the first 20 Stamina and Intellect give 1 HP or mana each (the Forever sheet
  code does this [F client UI; ? on the server]; no genuine Classic Era source [?]).
- **Test:** standard naked sheet for a Human or Night Elf warrior and an Orc or Tauren warrior
  (shield on for block), including Spirit. Rounding: a naked Gnome warrior's Int reads 34 if
  truncated, 35 if rounded; a Night Elf warrior with Blessing of Kings reads Str 128 or 129, AP
  416 or 418.
- **Samples:** one sheet per character.
- **Changes:** confirms or corrects the warrior rows; replaces the base HP placeholder (tank
  survival, and tank rage: Forever's rage from damage taken divides by max health, so ±100 base
  health moves the Protection warrior's TPS about ∓0.15%;
  [OQ-2](mechanics/character-stats.md#oq-2-base-health)) and settles base parry and
  block; sets the rounding rule.
- **Docs:** [stats OQ-1](mechanics/character-stats.md#oq-1-paladin-druid-and-skyborne-base-attributes),
  [OQ-2](mechanics/character-stats.md#oq-2-base-health),
  [OQ-5](mechanics/character-stats.md#oq-5-base-dodge-parry-and-block),
  [OQ-6](mechanics/character-stats.md#oq-6-rounding),
  [OQ-12](mechanics/character-stats.md#oq-12-minor-items)

#### A3. Agility and Strength elixir stacking
**Medium · M2**
- **Assumes:** Elixir of the Mongoose and Elixir of Greater Agility probably exclusive; Elixir of
  Brute Force probably exclusive with Giants and Juju Power [?]. Only forbidden sources were
  found.
- **Test:** drink Mongoose then Greater Agility, and Brute Force then Giants; see whether both
  buffs stay.
- **Samples:** one try per pair.
- **Changes:** the `elixir:agility` and `elixir:strength` groups and the Max preset. Repeat on
  Forever with the new elixirs ([C12](#c12-new-elixirs-and-frenzy-potions)).
- **Docs:** [buffs OQ 5](mechanics/buffs-debuffs-consumables.md#open-questions),
  [exclusivity groups](mechanics/buffs-debuffs-consumables.md#exclusivity-groups)

### Low

#### A4. Classic dodge/parry white-swing rage: before or after armor?
**Low · M2 (`classic` rage model only)**
- **Assumes:** a dodged or parried white swing gives 75% of its would-be damage, after armor
  [C, medium confidence].
- **Test:** vs one mob type at two armor states (with and without Sunder Armor), log rage from
  dodged white swings.
- **Samples:** ≥50 dodges per armor state.
- **Changes:** the `classic` rage model only.
- **Docs:** [rage § Classic formula](mechanics/rage.md#classic-era-formula-c),
  [rage OQ 8](mechanics/rage.md#open-questions)

#### A5. Classic Era boss parry vs weapon skill
**Low · M3 (`classicEra` profile only)**
- **Assumes:** 14% flat at any skill [?] (Magey measured 13.49% at +5 and 14.01% at +9).
- **Test:** white swings from the front vs level-63 raid bosses at 300 skill and with +skill
  items; count parries.
- **Samples:** ≥5,000 front swings per skill level.
- **Changes:** parry per skill point in the `classicEra` profile.
- **Docs:** [combat-tables §4.1](mechanics/combat-tables.md#41-effects-per-point),
  [OQ 13](mechanics/combat-tables.md#open-questions)

#### A6. Berserker Rage and rage from damage taken
**Low · M3**
- **Assumes:** ×1.0, no bonus [?]. The only number found is from a forbidden emulator and isn't
  adopted.
- **Test:** take a series of equal hits from one mob with and without Berserker Rage active.
- **Samples:** ≥30 hits per state.
- **Changes:** `berserkerRageMult` in the classic rage model. Repeat on Forever
  ([C25](#c25-berserker-rage-multiplier-forever)).
- **Docs:** [rage OQ 5](mechanics/rage.md#open-questions),
  [warrior Q20](classes/warrior.md#9-open-questions)

#### A7. Execute and Mocking Blow threat
**Low · M3**
- **Assumes:** Execute dmg × 1.25, from threat-meter code only [?]; Mocking Blow dmg × 1 with
  no bonus [?].
- **Test:** threat macro: auto attack off, one cast on a mob, read threat before and after; fit
  `(mult × dmg + bonus) × stance` over several damage rolls.
- **Samples:** ≥8 casts per ability.
- **Changes:** Execute and Mocking Blow threat (the Forever values stay [?] until measured).
- **Docs:** [threat § warrior](mechanics/threat.md#warrior),
  [threat OQ 8](mechanics/threat.md#open-questions)

#### A8. Elemental Sharpening Stone: all attacks, and two stack?
**Low · M2 (the Max consumables preset)**
- **Assumes** [?]: each stone's +2% crit is its own aura on the warrior (enchant 2506 → spell
  22755, aura 52 [F client]), so it counts for every melee attack whichever weapon holds it, and
  a stone on each weapon gives +4%. The client doesn't settle either point. The stone fits any
  melee weapon, maces included (`SpellEquippedItems` mask 42483 [F, C client]).
- **Test:** dual wield and note the sheet's crit; put a stone on the off hand only and read it
  again (+2% means the main hand gets it too); then add a stone to the main hand (+4% in all
  means two stack). Repeat on Forever once the stone is usable.
- **Samples:** one sheet per state.
- **Changes:** the stone's crit per weapon, and the Max preset's value for dual wielders.
- **Docs:** [buffs §3.6](mechanics/buffs-debuffs-consumables.md#36-weapon-enhancements-temporary),
  [buffs OQ 20](mechanics/buffs-debuffs-consumables.md#open-questions)

#### A9. Power Infusion with Arcane Power
**Low · Arcane mage (0% in every default setup; about 0.8% with Power Infusion on)**
- **Assumes** [?]: they don't stack, and Arcane Power wins: Power Infusion doesn't land while Arcane
  Power is up ("A more powerful spell is already active"), and Arcane Power going up ends it. A
  [D24](decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)-style placeholder: its
  origin is the 1.10.2 and 1.12.0 patch notes, not evidence, and no 2019+ Classic Era source
  confirms that Classic Era, which runs 1.12's rules, keeps it. Neither client's tables show it (no
  aura restriction, different aura types), so it's the server's rule, and the sim has the priest
  hold an Arcane mage's Power Infusion until its Arcane Power ends (+1.58% DPS). Power Infusion is
  off in every preset, so no default moves; with it on, if they stack, a priest would cast it at the
  pull with Arcane Power (×1.56 while both are up), about +2.4%, some 0.8% more than the sim gives.
- **Test:** a level-60 Arcane mage uses Arcane Power, then a priest casts Power Infusion on them:
  does it land, or say "A more powerful spell is already active"? Then the other way round: with
  Power Infusion up, the mage uses Arcane Power; read the buffs, and a Frostbolt's damage with both
  up against one with Arcane Power alone. Repeat on Forever at 60, since Forever's server may differ.
- **Samples:** one try each way; 5+ Frostbolts each if both land.
- **Changes:** if they stack, Power Infusion's `yieldsTo` and the Arcane mage's wait for Arcane
  Power go, and it comes at the pull; the tag becomes [C] if Classic Era keeps the rule, [F] once
  Forever is tested.
- **Docs:** [buffs "Power Infusion"](mechanics/buffs-debuffs-consumables.md#power-infusion),
  [buffs OQ 23](mechanics/buffs-debuffs-consumables.md#open-questions);
  [mage "Arcane Power"](classes/mage.md#arcane-power)

---

## Route B: Forever beta at the current level cap

### High

#### B1. Rage per landed white hit
**High · M2 · ≤20** (bears: [B14](#b14-bear-rage))
- **Assumes:** `k × base weapon speed`, with k = 3.46 (one-hander) and 4.5 (two-hander),
  fitted to 777 and 354 swings in public beta logs once each swing's fraction of a tenth counts
  ([B77](#b77-rage-fractions-carried-random-or-floored)). Crits, glances and mob blocks add nothing; misses, dodges
  and parries give 0; the off-hand base is `0.5 × 3.46 × speed`; base (unhasted) speed; extra
  attacks give rage like a white hit [?]. The `classic` model (`7.5 × dmg / 230.6`) is the
  alternative.
- **Test:** a warrior with no rage talents, auto attack only (no abilities, no damage taken).
  Log rage in tenths per swing, with hand, weapon base speed and outcome. Use two one-handers
  and two two-handers of different speeds; dual wield to log off-hand swings; repeat one weapon
  with a haste effect (e.g. Troll Berserking) to see whether rage follows base or hasted speed;
  log an extra-attack proc weapon if one is available.
- **Samples:** ≥50 clean swings per weapon and hand (the third-party set had 63 pairs).
- **Changes:** `k`, base vs hasted speed and the off-hand factor of the `forever` rage model
  (all warrior rage income). Confirm at 60 in [C2](#c2-rage-formulas-at-level-60).
- **Docs:** [rage § Forever white hits](mechanics/rage.md#forever-normalized-rage-per-swing-),
  [rage OQ 2](mechanics/rage.md#open-questions),
  [system-changes §2](mechanics/forever-system-changes.md#2-combat-rules),
  [warrior §2.3](classes/warrior.md#23-rage-warrior-specific)

#### B2. Hit suppression and the raid-boss hit cap
**High · M2 · ≤20**
- **Assumes** (`forever` profile, the default): no hit suppression; caps of 8% for specials and
  single-weapon white swings and 27% for dual-wield white swings, from the client tooltip [F
  client strings; ? in combat]. `classicEra`: the first 1% of +hit is ignored at 300 skill
  (caps 9% and 28%).
- **Test:** a character with exactly 1% hit (Tauren Endurance gives +1%, or a +1% hit talent),
  300 skill, one two-hander, from behind vs mobs three levels higher. Count white misses.
  Expect 7% with no suppression, 8% with it.
- **Samples:** ≥3,000 white swings.
- **Changes:** `hitSuppression` and the hit caps (80 / 270 hit rating) in the `forever` profile.
- **Docs:** [combat-tables §4.3](mechanics/combat-tables.md#43-hit-suppression),
  [§6](mechanics/combat-tables.md#6-hit-caps),
  [OQ 1](mechanics/combat-tables.md#open-questions);
  [system-changes §2, OQ 2](mechanics/forever-system-changes.md#open-questions)

#### B3. Crit suppression against a +3 target
**High · M2 · ≤20**
- **Assumes** (`forever`): table crit = sheet crit − 0.04% × (315 − skill) − min(aura crit,
  1.8%), so −2.4% at 300 skill. The 0.6% is [F client UI; ? in combat]; the 1.8% aura part is
  [?] (carried over from Classic Era). `classicEra`: −3.0% − 1.8%. Whether rating crit counts as aura crit
  is open [?] (moot at 60).
- **Test:** Magey's crit-suppression method: note sheet crit and how much of it is aura crit,
  then white swings from behind vs mobs three levels higher; compare the crit rate with
  sheet − 0.6 − aura and sheet − 3.0 − aura.
- **Samples:** ≥5,000 white swings separate 0.6% from 3.0%. The 1.8% aura part needs far more
  (Magey used 60,000 hits).
- **Changes:** the crit formula of the `forever` profile (~2.4 crit points for every spec).
- **Docs:** [combat-tables §4.4](mechanics/combat-tables.md#44-crit-suppression),
  [OQ 5, OQ 12](mechanics/combat-tables.md#open-questions);
  [system-changes §2](mechanics/forever-system-changes.md#2-combat-rules)

#### B4. Rating conversions (sheet and combat)
**High · M2 (all specs) · ≤20**
- **Assumes:** 14 crit rating = 1% melee **and** spell crit; 10 hit rating = 1% melee **and**
  spell hit; 12 dodge, 15 parry and 5 block rating per 1%; 1 defense rating = 1 defense skill;
  the same at every level [F as displayed, and F client: `combatratings.txt` has these values
  at every level 1–123 ([client.md](data/client.md#gametablesjson)); ? in combat].
- **Test:** sheet test: equip and remove Forever items with known ratings and read melee crit,
  spell crit, hit, dodge, parry, block and defense (the sheet reads server values). Combat spot
  check: white crit rate vs mobs three levels higher with and without a crit-rating item.
- **Samples:** ≥2 items per rating type for the sheet; ≥3,000 swings per state in combat.
- **Changes:** the rating constants in the stat pipeline, which every Forever item uses. The
  spell-table half is [B43](#b43-hit-rating-in-the-spell-table).
- **Docs:** [combat-tables §10](mechanics/combat-tables.md#10-ratings),
  [OQ 17](mechanics/combat-tables.md#open-questions);
  [stats § ratings](mechanics/character-stats.md#combat-ratings-forever-items),
  [OQ-14](mechanics/character-stats.md#oq-14-combat-ratings-in-play);
  [system-changes OQ 1](mechanics/forever-system-changes.md#open-questions);
  [items § ratings](data/items.md#forevers-ratings-f-with-open-questions)

#### B5. Armor mitigation constant
**High (if wrong) · M2 · ≤20**
- **Assumes:** Classic's `DR = A / (A + 400 + 85 × L)`, i.e. 5,500 for a level-60 attacker,
  capped at 75% [C; cap F tooltip]. The client's `ArmorMitigationByLvl` gametable (1,059 at
  level 60, retail values) is read as a leftover and not adopted [?].
- **Test:** hover armor on the character sheet at two or three known armor totals and compare
  the displayed reduction with `A / (A + 400 + 85 × your level)`. At 60 (later, C1), 3,000
  armor shows 35.29% under the Classic formula and 73.9% under the gametable.
- **Samples:** 2–3 armor values, one read each.
- **Changes:** the armor constant for every physical hit.
- **Docs:** [damage §1.1](mechanics/damage-and-timing.md#11-formula),
  [damage OQ 1](mechanics/damage-and-timing.md#open-questions);
  [system-changes OQ 6](mechanics/forever-system-changes.md#open-questions);
  [stats OQ-12](mechanics/character-stats.md#oq-12-minor-items)

#### B6. Heroic Strike queue and the off-hand miss penalty
**High · M2 · ≤20**
- **Assumes:** while Heroic Strike or Cleave is queued, off-hand white swings use the
  single-weapon miss chance (no +19%), in both profiles [C Classic Era]. For Forever, a
  third-party beta test agrees (5.19% vs 18.27% over 77 and 394 swings) [? until an in-game
  test repeats it].
- **Test:** dual-wielding warrior from behind vs mobs three levels higher; alternate stretches
  with Heroic Strike always queued and never queued; count off-hand misses separately.
- **Samples:** ≥1,000 off-hand swings per state.
- **Changes:** the `dwPenalty` flag; Fury off-hand hit and Heroic Strike's value.
- **Docs:** [combat-tables §5](mechanics/combat-tables.md#5-dual-wield-and-on-next-swing-queues),
  [§6](mechanics/combat-tables.md#6-hit-caps), [OQ 21](mechanics/combat-tables.md#open-questions);
  [system-changes §2](mechanics/forever-system-changes.md#2-combat-rules);
  [warrior §2.4](classes/warrior.md#24-heroic-strike-and-cleave-on-next-swing),
  [Q6](classes/warrior.md#9-open-questions)

#### B7. Glancing-blow damage
**High · M2 · ≤20 · blocked until glancing damage is fixed on the beta**
- **Assumes** (`forever`): glancing chance 40%; damage ×0.65–0.85, mean ×0.75 at 300 skill,
  from the client UI formula [F client UI; ? in combat]. `classicEra`: mean ×0.65. The UI
  formula jumps non-monotonically at 305 skill [?]. Beta glancing damage vs higher-level mobs is reported
  broken.
- **Test** (after the fix): white swings from behind vs mobs three levels higher at 300 skill;
  average glancing damage ÷ average normal hit.
- **Samples:** ~7,000 glances for ±1%.
- **Changes:** the glancing formula (~4% of white damage).
- **Docs:** [combat-tables §2.3](mechanics/combat-tables.md#23-glancing-blows),
  [OQ 4](mechanics/combat-tables.md#open-questions);
  [system-changes §2](mechanics/forever-system-changes.md#2-combat-rules)

#### B79. Deep Wounds' refresh: restart or keep the tick timer
**High · M2 · ≤20 (Arms tier 3)**
- **Assumes:** Deep Wounds **rolls**, as Season of Discovery's 412609 does, the bleed the Forever
  client carries in place of Classic's 12721 ([D36](decisions.md#d36-what-we-take-from-warriorsim-2026-09-25))
  [?]: each crit adds `0.2 × rank ×` the critting weapon's
  average hit (the off-hand modifier on an off-hand crit), snapshotted with the damage modifiers,
  to a pool; the ticks left go back to 4 and the pending tick keeps its time; each tick pays
  `pool ÷ ticks left`. Nobody has measured it. The Classic Era restart (the next tick 3 s after
  each crit, old damage lost) gives the default Fury and Arms warriors about **14% less DPS**
  on today's defaults ([warrior Q21](classes/warrior.md#9-open-questions)). Deadly Poison's stacks keep their
  timer too ([rogue Q8](classes/rogue.md#10-open-questions)), so the two models now agree.
- **Evidence so far** (searched 2026-09-25, no level-60 data: the beta is capped at 20):
  - WarriorSim's author, watching Pikaboo's BlizzCon demo stream, saw "Deep Wounds stacking
    SoD-style" ([PR #10](https://github.com/tzcnt/WarriorSim/pull/10), 2026-09-14; the moment is
    [1:51:22](https://www.twitch.tv/videos/2872621915?t=1h51m22s)) and no Deep Wounds tick
    crit ([PR #11](https://github.com/tzcnt/WarriorSim/pull/11)). Second-hand, from a demo build.
  - Forever's client carries only SoD's pair, 412609 (a periodic dummy the server computes) and
    412613, with rows identical to 1.15.9's but for flags Forever sets on hundreds of spells;
    Classic's 12721 is gone. It also keeps SoD's rolling Ignite 412545, which the mage model
    already pools ([mage.md](classes/mage.md)). A beta log (build 69977, magey/forever-warrior
    discussion #13) shows 412609 applied and one 412613 tick 2.98 s later: one crit, so it can't
    tell the models apart.
  - ElliotWood/Forever restarts the bleed, marked "TODO: Test in-game"; no source.
  - One forum post says "rend/deep wounds dots also crit"
    ([RIP Warriors](https://us.forums.blizzard.com/en/wow/t/rip-warriors/2348963)); the client's
    412609 lacks the periodic-crit flag, so the sim keeps no crit.
- **Re-check under [D37](decisions.md#d37-only-sourced-values-2026-09-26).** D36 adopted the
  rolling bleed as "SoD behaviour as the closest analog", an exception D37 replaced with
  [doctrine §2 tier 4's scoped SoD rule](doctrine.md#2-where-numbers-come-from-non-negotiable):
  only Blizzard's own SoD client data or patch notes for 412609 may supply its behaviour.
  "Rolls" rests on the evidence above (the BlizzCon stream and the Forever client's SoD spells;
  the beta log is neutral) plus WarriorSim's SoD `DeepWounds` code, which is unconfirmed data,
  not a source. The user's D36 decision stands until the re-check, which
  [M5.669's B3](milestones.md#m5669-only-sourced-values--next-update) schedules: Blizzard's SoD
  patch notes for Deep Wounds (412609), or back to Classic Era's restart if nothing allowed
  supports rolling.
- **Test:** with Deep Wounds (1/3 is enough) vs a mob three levels higher, crit it every 1–2 s
  (auto attacks with a fast weapon, or a crit buff) and log the bleed's tick times and amounts
  from the combat log. Rolling: ticks come every 3 s from the first application, whatever crits
  in between, and each tick grows after a crit. Restarting: ticks come 3 s after the latest crit,
  so a crit less than 3 s after the last one pushes the tick back. Then apply Deadly Poison
  stacks on a rogue the same way.
- **Samples:** 10 refresh trials with at least 5 refreshes each, per spell.
- **Changes:** the rule of `weaponBleed` (Deep Wounds, `combat.deepWoundsRolls`) or of Deadly
  Poison's stacks.
- **Docs:** [warrior §2.5](classes/warrior.md#25-crits-impale-flurry-deep-wounds),
  [Q21](classes/warrior.md#9-open-questions); [rogue Q8](classes/rogue.md#10-open-questions);
  [damage §4 "Refresh"](mechanics/damage-and-timing.md#4-dots-and-bleeds)

#### B8. Dual Wield Specialization: off-hand-only hit and rage
**High · M2 · ≤30 (Fury tier 4)**
- **Assumes:** +2% hit per rank on off-hand attacks only (tooltip), although the data's hit
  aura has no hand restriction; off-hand rage × (1 + 0.2 × rank) [F tooltip; ? scope].
- **Test:** with and without the talent, count main-hand and off-hand misses separately vs mobs
  three levels higher; log rage per off-hand hit.
- **Samples:** ≥1,500 swings per hand per state.
- **Changes:** whether Fury gets +10% hit on both hands (a large gain) or on the off hand only.
- **Docs:** [warrior §2.3](classes/warrior.md#23-rage-warrior-specific),
  [Q4](classes/warrior.md#9-open-questions); [rage OQ 2](mechanics/rage.md#open-questions)

#### B9. Rage from damage taken: confirm the logged fit
**High · M3 (bears: M4) · ≤20**
- **Assumes:** default `forever`: `10 × D_pre / max health`, where `D_pre` is the hit before
  armor, block, absorbs and damage-taken modifiers [?]. About 2,000 hits in third-party beta logs
  (levels about 5–25, build 1.60.1 of 18 Sep) fit it: blocked and absorbed hits give full rage,
  several attackers each count with no cap, and avoided attacks give 0. Untested: whether
  Defensive Stance's −10% lowers it (assumed not), mob crits and crushing blows (assumed 2 × and
  1.5 × `D_pre`), whether a level term hides behind max health, and whether later builds cap
  several attackers. Alternatives: `foreverFlat` (`1.5 × health lost / 230.6`, the earlier fit)
  and `foreverHealthLost` (`10 × health lost / max health`) [?]. rage.md owns them all.
- **Partly answered** (2026-09-24, two bears' logs of 23–24 Sep, [?], not adopted:
  [rage.md](mechanics/rage.md#bear-logs-of-23-and-24-sep-)): max-health normalization holds
  (the health-lost models don't fit); crits and crushing blows count at 2 × and 1.5 × the
  unmitigated amount; two mobs' hits each count in full; and the factor rises with the mob's
  level, from 10.5–11.0 against level 25–26 to 16.0 against 56. Either the mob's level or the
  level gap explains it; at 60 against a boss that is about 10.5 or 16.5 instead of 10
  (Protection warrior +0.4% or +4.9% TPS, bear +1.1% or +8.5%). The default stays 10 until a test
  tells the two apart.
- **Test:** with advanced combat logging and `UNIT_POWER_UPDATE`, record per hit the log's
  unmitigated amount, health lost, any blocked or absorbed amount, max health, armor and level:
  1. rage per hit from 1 mob, then from 3 or more at once, on the current build (2026-09-24 or
     later);
  2. max health changed at one level (Stamina gear, Power Word: Fortitude) with armor held, then
     two levels at about the same max health; and one character hit by the same mob type at
     several relative levels (0, +3, +10), then a second character at a different level against
     the same mobs;
  3. Defensive Stance against Battle Stance;
  4. mob crits and crushing blows against plain hits;
  5. hits fully absorbed by Power Word: Shield;
  6. whether the log shows the rage as a `SPELL_ENERGIZE` with its own spell ID (if so, it
     could make threat).
- **Samples:** ≥50 hits per condition.
- **Changes:** confirms the default, or adds a cap on several attackers, a level term, a stance
  rule or a crit rule. The largest single input to tank rage. Confirm at 60 in
  [C2](#c2-rage-formulas-at-level-60).
- **Docs:** [rage § damage taken](mechanics/rage.md#forever-),
  [rage OQ 1](mechanics/rage.md#open-questions);
  [system-changes §2, OQ 5](mechanics/forever-system-changes.md#open-questions);
  [encounter §5](mechanics/encounter.md#5-boss-melee-tank-modeling),
  [OQ 3](mechanics/encounter.md#open-questions)

#### B10. Sunder Armor threat
**High · M3 · ≤20** (the base is answered; the attack power term needs 60)
- **Answered by build 1.60.1.70009 (the base):** the client's threat effect is 34 / 75 / 117 / 158 /
  **206** by rank [F] (1 / 405 / 608 / 810 / 1013 in 1.60.1.69913), and Blizzard's notes call it a
  correction "on all ranks, including a small increase to threat generated from Attack Power". So
  whether 1013 replaced or added to 261 is moot, and rank 1's "1" is gone.
- **Assumes now:** **206 flat** [F] per landed Sunder at rank 5. The notes' attack power term has
  no value: no client carries a coefficient and nobody has measured it, so the sim adds 0 [?] (until
  2026-09-26 it assumed 0.05 × AP, a share we chose; D37 removed it, −3.0% on the default
  Protection warrior's TPS). The results list it.
- **Test:** at 60, Defensive Stance with Defiance 3/3 and a shield (×1.495), auto attack off: one
  landed Sunder on a mob, threat read before and after, at two attack powers (with and without
  Battle Shout and a Mighty Rage Potion or Juju Might). `threat ÷ 1.495 − 206` is the term; its
  change over the attack power change is the coefficient. Calibrate with a plain white hit.
- **Samples:** ≥5 landed Sunders per attack power.
- **Changes:** Sunder's threat (about 9% of the default Protection warrior's), the Protection
  filler and presets.
- **Docs:** [threat § warrior](mechanics/threat.md#warrior),
  [threat OQ 2](mechanics/threat.md#open-questions);
  [warrior §1](classes/warrior.md#1-wow-forever-deviations),
  [Q1](classes/warrior.md#9-open-questions)

#### B11. Defiance: multiplicative or additive, and the shield
**High · M3 · ≤20 (Protection tier 3)**
- **Assumes:** Defensive Stance ×1.3 times Defiance ×(1 + 0.05 × rank), only with a shield
  (1.495 at 3/3) [F values; C multiplicative stacking].
- **Test:** plain white hits in Defensive Stance with 0 and ≥1 ranks, with and without a
  shield; threat macro. At 1/3: 1.365 (multiplicative) vs 1.35 (additive).
- **Samples:** ≥10 hits per state.
- **Changes:** the tank multiplier (1.495 vs 1.45 at 3/3, ~3% TPS).
- **Docs:** [threat § base rule](mechanics/threat.md#base-rule-and-how-modifiers-stack),
  [§ stances](mechanics/threat.md#stance-and-form-modifiers),
  [OQ 3](mechanics/threat.md#open-questions);
  [warrior W16](classes/warrior.md#w16-threat-multiplier)

#### B12. Boss parry from the front
**High · M3 (all tanks) · ≤20**
- **Assumes:** 16.5% parry vs a +3 target at 300 skill, from the client tooltip [F client
  strings; ? in combat]; Classic Era 14%, and another client string still says 14%. Mob block
  5% [C].
- **Evidence so far:** 47 public beta logs read 14.3% ± 1.5 against +3 mobs at levels 1–20 (not
  bosses; the audit of 2026-09-26), nearer 14% than 16.5%. The filter to swings from the front is
  unverified: no script or write-up of it exists, and swings from behind would pull the rate down.
  Not yet a D22 default: the method isn't documented and no log is at 60 against a boss. The
  results don't cite it until that write-up exists. 14% would give the default Protection warrior
  about 2.5% more TPS
  ([combat-tables OQ 3](mechanics/combat-tables.md#open-questions)).
- **Test:** white swings from the front vs mobs three levels higher that can parry; count
  parries and blocks.
- **Samples:** ≥3,500 front swings.
- **Changes:** `parryBase[3]`, tank TPS and parry haste on the boss.
- **Docs:** [combat-tables §1.1](mechanics/combat-tables.md#11-profile-parameters-player-level-60-vs-boss-level-63-defense-315),
  [OQ 3](mechanics/combat-tables.md#open-questions);
  [system-changes §2](mechanics/forever-system-changes.md#2-combat-rules)

#### B78. The mob → player table against a tank
**High · M3 (all tanks) · ≤20**
- **Assumes:** a mob 3 levels up misses a player `5% + (defense − its skill) × 0.04%` of the time,
  crits `5% + (its skill − defense) × 0.04%`, crushes `(its skill − min(defense, 5 × level)) × 2% − 15%`,
  and lowers the player's dodge, parry and block by 0.04% per skill point above `5 × level`
  (combat-tables §8: the Forever client's UI formulas [F], Classic Era's rules in combat [C];
  unlogged in Forever [?]). Crushing blows ×1.5, crits ×2; a block removes the block value.
- **Test:** a tank in Defensive Stance with a shield, facing mobs three levels higher, logs every
  swing it takes. Compare miss, dodge, parry, block, crit and crushing rates with the sheet
  (dodge, parry and block less 0.04% per level of skill gap), and a blocked hit's damage with the
  unblocked hits' less the block value.
- **Samples:** ≥3,000 swings taken for ±1% on the big slices; crushing needs the full 3-level gap.
- **Changes:** confirms or corrects §8's table and the damage a tank takes per second.
- **Docs:** [combat-tables §8, OQ 22](mechanics/combat-tables.md#8-boss--player-tanks)

#### B13. Warrior ability threat at low ranks
**High · M3 · ≤20** (max ranks and Shield Slam: [C6](#c6-warrior-threat-at-max-rank))
- **Assumes:** Classic Era values for everything except Sunder [?] (Magey's 1.13.6 tests; Heroic
  Strike r8 and Revenge r5 from Resultsmayvary's 1.13.2 aggro-rip threshold tests, Heroic Strike r8's
  a thin sample): Heroic Strike dmg + 145 (r8), Revenge
  2.25 × dmg + 243 (r5), Shield Bash 1.5 × dmg + 156,
  Cleave dmg + 100 per target, Thunder Clap 2.5 × dmg, Battle Shout 52 per recipient (r6),
  Demoralizing Shout 43.2, Hamstring 1.25 × dmg + 135; Mocking Blow's bonus unknown. (Shield Slam
  keeps Classic Era's + 254; its "very high" is [C6](#c6-warrior-threat-at-max-rank).)
- **Build 1.60.1.70009:** Blizzard's notes retuned only Sunder Armor's threat among the warrior's
  ("Corrected the threat values on all ranks"), and its low ranks now carry values (34 / 75 / 117 /
  158) where rank 1 had 1, so the low-rank Sunder bug players reported is fixed in the data. Every
  other ability's low-rank threat is still unmeasured, and no other warrior spell carries a threat
  effect in 1.60.1.70009's client.
- **Test:** threat macro at every rank available: one ability per cast, several damage rolls,
  fit `(mult × dmg + bonus) × stance`; compare with Classic's per-rank values.
- **Samples:** ≥8 casts per ability and rank.
- **Changes:** per-ability threat constants, if Blizzard retuned them as it did Sunder.
- **Docs:** [threat § warrior](mechanics/threat.md#warrior),
  [threat OQ 1](mechanics/threat.md#open-questions);
  [warrior §5.4](classes/warrior.md#54-protection-tps)

#### B86. Attack power in Rend, Revenge and Thunder Clap
**High · M2, M3 · ≤20**
- **Assumes** [?]: neither the Forever client nor Classic Era gives these an attack-power term. The
  beta logs show all three scaling, so the sim follows
  [doctrine §2's fallback order](doctrine.md#2-where-numbers-come-from-non-negotiable). Rend: **WarriorSim's
  0.02 × AP a tick** in `forever`, another sim's value, for want of an allowed source or a
  measurement (none in `classicEra`). Revenge and Thunder Clap: **none**, since no source, measurement,
  similar value or other sim has one (WarriorSim has no Revenge, and its Thunder Clap is flat), so
  Revenge hits 109–133 and Thunder Clap 103 before modifiers.
- **Why it's open:** public beta logs show all three scaling: rank-1 Rend ticks 6–7 for a base of
  5, rank-1 Revenge hits for 69–78 for a base of 22, Thunder Clap rank 1 for 16–19 for 10. The
  extra grows with the log's attack-power field, but that field isn't the character sheet's (one
  posted sheet reads 222 where its log reads 389), so no coefficient is measured. Rend's log slope,
  converted through that sheet, is about 0.016 × sheet AP, near WarriorSim's 0.02
  ([warrior Q37, Q38](classes/warrior.md#9-open-questions)).
- **Test:** at a known sheet attack power, with no Improved Rend or Improved Revenge, log each
  ability's hits (Rend's ticks); raise the sheet attack power by a known amount (Battle Shout, a
  potion, gear) and log again. The change in damage over the change in attack power is the
  coefficient; note the level, as a coefficient may scale with it.
- **Samples:** ≥50 of each at each attack power (Revenge's ±1.7 base spread needs the most).
- **Changes:** Rend's worth (without the 0.02, Fury −1.3% and Arms about −2% DPS); Revenge's
  damage and threat (at 0.21 × AP, about 300 more damage a Revenge at 60, a large rise in
  Protection's threat); Thunder Clap's.
- **Docs:** [warrior §3.1](classes/warrior.md#31-damage-abilities),
  [Q37, Q38](classes/warrior.md#9-open-questions)

#### B14. Bear rage
**High · M4 · ≤20 (Bear Form from level 3 in the public beta logs)**
- **Assumes:** 4.5 × 2.5 = 11.25 rage per landed bear auto, the two-hander's rate, crits no bonus
  [?]: 22 of 26 clean pairs of bear swings in the public beta logs, from 17 druids at levels 3–14
  ([rage.md](mechanics/rage.md#bear-white-hits-in-the-public-beta-logs-); adopted 2026-09-26 under
  D22, +1.45% bear TPS; 8.65, the one-hander's rate, before); rage from damage taken as for warriors
  ([B9](#b9-rage-from-damage-taken-confirm-the-logged-fit)) [?], which 33 logged hits on likely
  bears fit weakly; shifting into bear sets rage to 0 [C; Forever ?]. Two bears' logs of 23–24
  Sep ([rage.md](mechanics/rage.md#bear-logs-of-23-and-24-sep-)) add 49 hits taken that fit the
  damage-taken formula's shape with a level term (not adopted: two testers, D22), and shifts that
  start at 0 (weak: rage was likely 0 already).
- **Test:** bear form, auto attack only, no damage taken and nothing else giving rage (no Enrage,
  Furor or Blood Frenzy): rage per landed swing. Then take hits as in B9, including hits fully
  absorbed by Power Word: Shield (players report bears get none there). Shift out and back in at a
  known rage (no Furor) and read rage after the shift.
- **Samples:** ≥50 landed autos at 60 (the logs' 11.25 is from levels 3–14); ≥50 hits taken; 10
  absorbed hits; 5 shifts, with rage above 0 before each.
- **Changes:** the bear rage model.
- **Docs:** [rage § bear](mechanics/rage.md#bear-druid-rage),
  [rage OQ 3, OQ 6](mechanics/rage.md#open-questions)

#### B15. Bear ability threat
**High · M4 · ≤20** (Primal Bite ≤30; Lacerate: [C8](#c8-lacerate))
- **Assumes:** Maul and Swipe 1.75 × dmg, Demoralizing Roar 39, Faerie Fire 108 [?: every Classic
  and Season of Discovery threat tool has used them since 2019; they trace to a 2006 guide and were
  never measured on Classic Era; kept by user decision, 2026-09-26]; Primal Bite (Mangle until
  1.60.1.70009) dmg × 1 [?: its tooltip names no threat; Season of Discovery's ×1.5 for Mangle
  (Bear) doesn't carry over to Forever's reworked spell, user decision, 2026-09-26]; bear form ×1.3 with no Feral Instinct threat [F].
- **Test:** threat macro in bear form: fit mult × dmg + bonus over several damage rolls for Maul,
  Swipe and Primal Bite; flat values for Demoralizing Roar and Faerie Fire; calibrate with a white
  hit (×1.3).
- **Samples:** ≥8 casts per ability.
- **Changes:** bear TPS per ability.
- **Docs:** [threat § bear](mechanics/threat.md#druid-bear),
  [threat OQ 4](mechanics/threat.md#open-questions);
  [druid §4.8](classes/druid.md#48-bear-threat-and-druid-rage-numbers-summary-for-the-shared-docs),
  [Q15](classes/druid.md#10-open-questions)

#### B16. Shred and Claw: flat bonus before or after the weapon %
**High · M4 · ≤30 (Shred at ~22)**
- **Assumes:** `1.55 × (W + 80)` at rank 5, flat added before the % [C from Classic tooltip
  arithmetic; Forever ?]. The alternative `1.55 × W + 80` is ~13% less Shred.
- **Test:** from behind, note the character-sheet cat damage range, then log non-crit rank-1
  Shreds (155% + 24). Before-%: `1.55 × min + 37.2 … 1.55 × max + 37.2`; after: `… + 24`.
- **Samples:** ≥30 non-crit Shreds.
- **Changes:** the Shred and Claw formulas.
- **Docs:** [druid §3.1](classes/druid.md#31-shred-r5-9830),
  [Q1, Q2](classes/druid.md#10-open-questions)

#### B17. Rip attack-power scaling
**High · M4 · ≤20 (if Rip is trainable; Classic: level 20)** (Bite: [C17](#c17-ferocious-bite))
- **Assumes:** each Rip tick adds `0.01 × min(CP, 4) × AP`, from a secondary sim only [?].
- **Test:** Rips at the same combo points and two AP levels (swap AP gear or buffs), no damage
  buffs; fit tick damage against AP.
- **Samples:** ≥10 Rips (60 ticks) per AP level.
- **Changes:** Rip damage and the Rip vs Bite default.
- **Docs:** [druid §3.4](classes/druid.md#34-rip-r6-9896),
  [Q3](classes/druid.md#10-open-questions)

#### B18. Judgement of the Crusader: flat or coefficient-scaled bonus
**Medium · M5 · ≤20**
- **Settled (2026-09-26):** each Holy hit gets `bonus × c`, `c` its client spell-power coefficient,
  whole (outside a weapon percentage): the beta logs, 23 hits from 6 characters, 1.001 ± 0.039; the
  user's level-20 test rules out the flat reading [F]. The "All of it" switch is gone.
- **Assumes:** Seal of Command's share is its whole 0.29, by Holy Strike's [?]; the share comes
  after your own damage multipliers and before a crit's [?]. Unexplained: the user's single hits,
  Holy Strike 36 under JotC where the share predicts 42, and 43 with Seal of Fury up too [?].
- **Test:** Seal of Command proc damage with and without your own JotC on the target, then the
  same with Vengeance stacked; Holy Strike with no judgement, with JotC, and with JotC and Seal of
  Fury up.
- **Samples:** ≥30 non-crit hits of each, with and without; ≥10 Holy Strikes a state.
- **Changes:** Retribution DPS (Seal of Command's share).
- **Docs:** [paladin § JotC](classes/paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc),
  [OQ 5](classes/paladin.md#open-questions);
  [buffs §4.2](mechanics/buffs-debuffs-consumables.md#42-other-debuffs)

#### B19. Seal of Command proc rate
**High · M5 · ≤20 (Ret tier-3 talent)**
- **Assumes:** 7 PPM from base weapon speed (`7 × speed / 60` per landed white hit) [C
  community]; 1 s internal cooldown [F client]. A forum claim says 6.8.
- **Test:** Seal of Command up, known weapon speed, white swings on mobs; procs ÷ landed white
  hits; repeat with a haste effect to confirm base speed.
- **Samples:** ≥1,000 white swings per state.
- **Changes:** the SoC proc chance, a top Ret damage source.
- **Docs:** [paladin § SoC](classes/paladin.md#seal-of-command-soc),
  [OQ 1](classes/paladin.md#open-questions)

#### B20. Seal of Fury per-hit damage and absorb
**High · M5 · ≤20 (ranks from level 10)**
- **Settled (2026-09-26):** 35 Holy + 0.1 × SP per landed white hit at rank 7, whatever the weapon
  [F tooltip, client], measured in the beta logs (179 of 179 procs from 24 characters,
  [paladin § SoF](classes/paladin.md#the-beta-logs-seal-of-fury)); the aura's undescribed
  weapon-speed dummy adds nothing.
- **Settled (2026-09-26), the absorb:** Light's Fury (1310927), all schools, 10 s [F client]; one
  absorb of 50% of the last proc's damage, which each proc replaces (214 of 224 absorbs; none fits a
  sum) and hits you take spend; Improved Seal of Fury's mana comes with the hit that uses it up (221
  of 224), measured in the beta logs ([paladin § Light's Fury](classes/paladin.md#the-beta-logs-lights-fury)).
- **Assumes:** Improved Seal of Fury's mana at level 60 (the client's rank text reads 60, which
  foreverchanges printed as 0), 87 against a level-63 boss [?].
- **Test:** at level 60, Seal of Fury up with a shield: the mana each Improved Seal of Fury restore
  gives against mobs of your level and three above.
- **Samples:** ≥30 restores per state.
- **Changes:** Improved Seal of Fury's mana, which funds a Protection paladin's rotation.
- **Docs:** [paladin § SoF](classes/paladin.md#seal-of-fury-sof-new-the-protection-seal),
  [OQ 10](classes/paladin.md#open-questions);
  [threat § paladin](mechanics/threat.md#paladin)

#### B82. Epic caster weapons' spell power
**High · every caster · any level (a chat-linked tooltip)**
- **Assumes** [C]: Mindfang and Sageclaw carry Classic Era's **+30** spell power and both Ironbark
  Staffs **+41**. Forever's client gives caster weapons their spell power from a flag, and the rule
  that reproduces the Rare ones (2 × the item level's budget) isn't extrapolated to Epic quality,
  where it would give +94.
- **Test:** link Mindfang, Sageclaw or Ironbark Staff in chat on the beta and read its spell power
  line (and its DPS).
- **Samples:** one tooltip each.
- **Changes:** every caster's main hand: +94 would be +5 to +8% DPS for the 9 caster specs.
- **Docs:** [client.md "Epic caster weapons"](data/client.md#weapon-damage),
  [warlock §7.3](classes/warlock.md#73-gear)

#### B83. Improved Imp's hidden value
**High · Demonology warlock · ≤20 (tier 1)**
- **Assumes** [?]: Improved Imp's third effect (a dummy of −300/−700/−1000 its tooltip doesn't show)
  does nothing, so the Imp's Firebolt keeps its 2 s cast, and Demonology defaults to the Succubus
  out with the Imp sacrificed.
- **Test:** watch the Imp's Firebolt cast bar with Improved Imp 0/3 and 3/3 (or time 20 Firebolts
  in the combat log).
- **Samples:** 20 casts at each rank.
- **Changes:** if it's 1 s off the cast at 3/3, the Imp build gains about 11.5% and becomes the
  default again (about +4% on the Demonology headline).
- **Docs:** [warlock §11.3, Q19](classes/warlock.md#117-open-questions)

### Medium

#### B21. Special attacks: one roll or two?
**Medium · M2 · ≤20**
- **Assumes** (both profiles): the Classic Era split [C]. Weapon-damage specials (Heroic Strike,
  Mortal Strike, Whirlwind, Shred, …) make one roll with crit on the same table; "melee spells"
  without a weapon-damage effect (Bloodthirst, Execute, Shield Slam, Revenge) roll hit first,
  then crit on a landed hit (2020 Classic log analysis; the pre-SoD WarriorSim). Whether Forever
  keeps it, and how other classes' non-weapon specials (Ferocious Bite, Swipe, Rake's hit,
  judgements) map onto it, is [?]. Two rolls for every special is the vanilla-era model and is
  not adopted.
- **Test:** from the front vs mobs three levels higher (dodge, parry and block give high
  avoidance), compare Heroic Strike and a two-roll ability (Revenge, or Shield Slam or
  Bloodthirst once trainable): one roll gives crits ÷ attempts ≈ table crit; two rolls give
  crits ÷ landed ≈ table crit. A druid can do the same with Claw vs Ferocious Bite.
- **Samples:** ≥2,000 casts per ability.
- **Changes:** yellow crit for every special (~10% relative at ~10% avoidance).
- **Docs:** [combat-tables §3](mechanics/combat-tables.md#3-special-yellow-attacks),
  [OQ 6](mechanics/combat-tables.md#open-questions);
  [druid §3](classes/druid.md#3-feral-cat-sim-model), [Q33](classes/druid.md#10-open-questions)

#### B22. DoTs: periodic crits, snapshots and refresh
**Medium · M2 (Rend, Deep Wounds), M4 (Rip, Rake) · ≤20**
- **Assumes:** in `forever`, ticks crit when the spell has the periodic-crit flag (Rend, Rake,
  Rip, Pounce, Lacerate; not Deep Wounds) [the tooltip text and the per-spell flags are F
  client, `SpellMisc` Attributes[8], ✅ D14; whether ticks crit in combat ?], ×2.0 for physical,
  raised by crit-bonus talents whose class mask covers the spell (Impale on Rend, [B73](#b73-rend-tick-crits-and-impale))
  [?]; in `classicEra`, ticks never crit [C]. Both
  profiles snapshot AP, caster modifiers and crit chance at application [?], except Deep
  Wounds, which recomputes each tick [C]; a third-party report that Forever's Rend reads them
  per tick is not adopted [?]. A melee bleed's tick crits at the main hand's special-attack
  crit chance, crit suppression included [?]; a refresh restarts duration and tick timer and
  loses the partial tick [?]. Deep Wounds: 4 ticks over 12 s [C; F client: the
  Forever bleed is spell 412609, every 3 s for 12 s, and 12721 doesn't exist in the Forever
  client].
- **Test:** vs mobs three levels higher, log Rend, Deep Wounds (1/3), Rip and Rake ticks: count
  crits and their size. Reapply Rend mid-duration and log tick times. Apply a DoT, then gain AP
  or a damage buff mid-DoT (Battle Shout; Tiger's Fury if trainable) and see whether later ticks
  change.
- **Samples:** ≥200 ticks per spell for crits; 5 refresh trials; 5 mid-DoT buff trials.
- **Changes:** tick crit roll, crit multiplier, snapshot flag per spell and the refresh rule.
- **Docs:** [damage §4](mechanics/damage-and-timing.md#4-dots-and-bleeds),
  [damage OQ 2, OQ 3](mechanics/damage-and-timing.md#open-questions);
  [druid §2.9](classes/druid.md#29-snapshotting), [Q21](classes/druid.md#10-open-questions);
  [warrior §2.5](classes/warrior.md#25-crits-impale-flurry-deep-wounds),
  [Q21](classes/warrior.md#9-open-questions)

#### B23. Weapon-enchant proc rates
**Medium · M2 · ≤20**
- **Assumes:** Crusader 1 PPM, Fiery Weapon 6 and Lifestealing 6 [C, the pre-SoD WarriorSim];
  Icy Chill 1.6 and Unholy Weapon 3 [?, an unversioned wiki only]; all from base weapon speed.
  None is measured in Forever, and its new 2.3 PPM row has no known user [?]. Flat chances are
  client data instead: Hand of Justice 1% against non-Dwarves (2% in Classic Era), 2 s
  cooldown [F client]; Ironfoe's reading is [C37](#c37-ironfoes-proc-chance-and-hands).
- **Test:** Crusader (and any other enchant you can get) on a known-speed weapon; procs per
  landed hit; repeat with a second weapon speed.
- **Samples:** ≥1,000 landed hits per weapon.
- **Changes:** enchant proc chances; Crusader is the default Fury, Arms and Ret enchant.
- **Docs:** [buffs §5.1](mechanics/buffs-debuffs-consumables.md#51-weapon),
  [buffs OQ 9](mechanics/buffs-debuffs-consumables.md#open-questions);
  [damage §5.1](mechanics/damage-and-timing.md#51-ppm-formula),
  [OQ 10](mechanics/damage-and-timing.md#open-questions)

#### B24. Unbridled Wrath from Heroic Strike, Cleave and extra attacks
**Medium · M2 · ≤20 (Fury tier 2)**
- **Assumes:** procs on white swings and extra attacks only, not HS/Cleave swings, as the Forever
  data's proc mask (auto attacks) says [F data] ([D36](decisions.md#d36-what-we-take-from-warriorsim-2026-09-25));
  Classic sims also counted HS swings [C]. **Partly answered (2026-09-26):** public beta logs show
  no procs from 397 HS and Cleave hits (none within 50 ms that a white swing didn't account for),
  2 rage with a two-hander, and no weapon-speed scaling [?]. They also show about 7.2% a rank, not
  12%: a bug the developers say a later build fixes, so the sim keeps 12%
  ([warrior §2.3](classes/warrior.md#unbridled-wrath-on-the-beta-)).
- **Test:** on the build with the fix, 5/5 Unbridled Wrath: its procs against landed white swings,
  and HS swings vs white swings.
- **Samples:** ≥1,000 white swings; ≥300 Heroic Strike swings.
- **Changes:** the UW chance (at the beta's 7.2% a rank: Fury −0.7%, Arms −1.0% DPS); Fury and
  Arms rage.
- **Docs:** [warrior §2.3](classes/warrior.md#23-rage-warrior-specific),
  [Q5](classes/warrior.md#9-open-questions);
  [rage § yellow attacks](mechanics/rage.md#yellow-damage-and-on-next-swing-attacks)

#### B25. Rage refunds on avoided abilities
**Medium · M2 · ≤20 (Execute ≤30)**
- **Assumes:** 80% refund on a miss, dodge or parry; Whirlwind and Cleave none; a failed Execute
  loses only its base cost [C]; Maul refunds like Heroic Strike [?]. The warrior doc now lists
  Whirlwind, Cleave and Execute as the exceptions, as rage.md does.
- **Test:** read rage before and after avoided Heroic Strikes, Cleaves, Mauls (bear) and, once
  trainable, a dodged Execute at a known rage.
- **Samples:** ≥10 avoided casts per ability.
- **Changes:** the refund table.
- **Docs:** [rage § refunds](mechanics/rage.md#rage-refunds-on-avoided-abilities),
  [rage OQ 4](mechanics/rage.md#open-questions);
  [warrior §2.3](classes/warrior.md#23-rage-warrior-specific)

#### B26. Armor penetration, negative armor, haste rating and health regeneration
**Medium · M2 · ≤20 (armor penetration and negative armor; haste rating needs level 60: C1)**
- **Assumes** (`forever`, per
  [D12](decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22),
  with the `unmeasuredRatings: 'apply' | 'ignore'` switch): armor penetration is flat armor
  removed from the target for your own attacks [?]; 10 haste rating = 1%, multiplicative with
  other haste [F client `combatratings.txt` for the 10; ? in combat]; Health Regeneration has no
  combat effect.
  Armor below 0 increases damage in `forever` (client tooltip text [F]; in combat [?]), down to
  the engine's floor of −2,750 armor, where damage doubles [?, an engine guard], and is floored
  at 0 in `classicEra` [C]; resistance below 0 likewise ("Spell Vulnerability").
- **Test:** under the cap, the only armor-penetration item in foreverchanges' data is Leafre's
  Ring of Armor Piercing (+50, requires level 1; source unknown). If it can be had: average
  white hit on the same mob with and without it, and on a low-armor mob whose armor it exceeds
  (negative armor), compared with the same mob at 0 effective armor. Haste rating (every item
  requires level 60): sheet attack speed with and without the item, and together with another
  haste buff (product vs sum). Health Regeneration: out-of-combat health ticks with and without
  the item.
- **Samples:** ≥500 hits per state for armor penetration; sheet reads; ≥20 health ticks.
- **Changes:** how the stat pipeline treats the new ratings, and the `forever` armor floor.
- **Docs:** [stats OQ-14](mechanics/character-stats.md#oq-14-combat-ratings-in-play);
  [damage §1.2](mechanics/damage-and-timing.md#12-armor-reduction-debuffs-and-penetration),
  [§3.1](mechanics/damage-and-timing.md#31-haste),
  [OQ 4, 12](mechanics/damage-and-timing.md#open-questions);
  [combat-tables OQ 20](mechanics/combat-tables.md#open-questions);
  [items § ratings](data/items.md#forevers-ratings-f-with-open-questions)

#### B27. Race/class combinations
**Medium · M2 · ≤20**
- **Assumes:** Undead paladins (Horde) and Dwarf shamans (Alliance) exist, so both factions get
  Blessings and Windfury [F client `CharBaseInfo`, owned by character-stats; ✅ confirmed from
  client data, [D11](#route-d-wagotools-lookups-in-a-browser)]. This is a cheap in-game
  confirmation, not an open [?].
- **Test:** character creation: Undead paladin, Dwarf shaman, and a Skyborne warrior and druid
  on each faction.
- **Samples:** one attempt each.
- **Changes:** composition flags and the faction-neutral buff presets.
- **Docs:** [buffs §6.1](mechanics/buffs-debuffs-consumables.md#61-composition-flags-not-factions),
  [buffs OQ 13](mechanics/buffs-debuffs-consumables.md#open-questions);
  [stats § legal races](mechanics/character-stats.md#legal-races-for-the-sims-classes);
  [system-changes §1](mechanics/forever-system-changes.md#1-ruleset-world-and-raids)

#### B28. Sunder Armor vs Expose Armor
**Medium · M2 · ≤20** (High for M3: a Protection warrior's TPS with Expose Armor, below)
- **Assumes:** they share one slot (−2250 either way) [C Classic; ? Forever], and a Sunder Armor
  over an Expose Armor still lands and makes its threat [?]; in Classic Era it may fail to apply
  over a stronger one, and make none.
- **Test:** 5 Sunders, then a 5-point Expose Armor on one mob; inspect the target's debuffs. Then
  Sunder Armor over the Expose Armor: an error or not, the debuff, and the threat macro.
- **Samples:** 2 trials.
- **Changes:** the `armor-major` group. If both stay, standard raid armor drops another 2,250. If
  a Sunder fails over Expose Armor, a Protection warrior with it loses about 31% of its TPS
  (996.34 → 684.08; [warrior Q35](classes/warrior.md#9-open-questions)).
- **Docs:** [buffs §4.1](mechanics/buffs-debuffs-consumables.md#41-armor-reduction),
  [buffs OQ 2](mechanics/buffs-debuffs-consumables.md#open-questions)

#### B29. Camp buffs inside instances
**Medium · M2 · ≤20** (Camp Chair vs Leader of the Pack ≤30)
- **Assumes:** camp buffs are off in every preset (fallbacks only); whether they work in
  instances and whether you must be grouped with the camp's owner are unknown [?]; Camp Chair
  excludes Moonkin Aura [F] and presumably Leader of the Pack [?].
- **Test:** build a camp outside a dungeon, pick up the buffs, zone in and check they persist;
  pick up grouped vs ungrouped; with a feral druid, try Camp Chair plus Leader of the Pack.
- **Samples:** one trial each.
- **Changes:** whether camps belong in raid presets.
- **Docs:** [buffs §1.3](mechanics/buffs-debuffs-consumables.md#13-camp-buffs-new-forever-system),
  [buffs OQ 18](mechanics/buffs-debuffs-consumables.md#open-questions);
  [system-changes OQ 3](mechanics/forever-system-changes.md#open-questions)

#### B30. Enrage triggers
**Medium · M2 · ≤30 (Fury tier 4)** (raid event rate: [C5](#c5-raid-boss-melee-and-incoming-damage))
- **Assumes:** 30% chance on any damaging attack taken, +2% Physical damage per rank for 12 s,
  refreshed, no swing cap [F]; which events count (periodic, AoE, absorbed, blocked) [?]; DPS
  warriors take no damage by default [?].
- **Test:** Enrage 5/5; take hits of each kind from mobs; procs per hit; check refresh.
- **Samples:** ≥200 hits taken.
- **Changes:** Enrage uptime.
- **Docs:** [warrior §2.6](classes/warrior.md#26-enrage-death-wish-recklessness),
  [Q8](classes/warrior.md#9-open-questions)

#### B31. Weaponmaster details
**Medium · M2 · ≤30 (Arms tier 5)**
- **Assumes:** mace or staff ignores 3% of armor per rank, applied after all flat reductions
  [?]; sword extra attacks at 1% per rank with a 200 ms internal cooldown [F client
  `SpellAuraOptions`, ✅ D2; whether the server honours it ?], rolled once per cast on
  multi-target abilities [?] (only a post-SoD sim does this). The axe and polearm crit, on that
  weapon's attacks only as its tooltip reads, is [B49](#b49-weapon-conditional-crit-while-dual-wielding)'s.
- **Test:** mace hits on a mob of known armor with and without Sunder; the minimum gap between
  sword extra attacks, and sword procs per Cleave that hits two mobs.
- **Samples:** ≥300 hits per state.
- **Changes:** armor-penetration order and the sword ICD.
- **Docs:** [warrior §2.7](classes/warrior.md#27-weaponmaster-extra-attacks-and-windfury),
  [Q9](classes/warrior.md#9-open-questions)

#### B32. Overpower windows and Bloodthrill
**Medium · M2 · ≤20 (Bloodthrill ≤30)**
- **Answered by build 1.60.1.70009 (the data):** the window's aura 1282733 no longer stacks (it
  stacked to 3), so windows don't bank [F]. Bloodthrill's proc mask is 0x14 (auto attacks and
  melee abilities), main hand only (Attributes[3] 0x400), at 4% a rank, into 1282733 itself, so its
  window is the dodge's 5 s [F]; the notes: "Bloodthrill only activates off of Main Hand melee
  attacks. This includes Cleave and Heroic Strike."
- **Assumes now:** one 5 s window, refreshed by each dodge or Bloodthrill proc, spent by any
  Overpower, even one that misses [?]; Bloodthrill procs from every landed main-hand attack, white
  or special, and still needs your own Rend (the tooltip's words; the notes leave it open, and the
  client has no aura restriction) [?]. The tooltip's "Lasts 6 sec." is the old window spell's
  (1289681), which nothing triggers now; the sim takes the data's 5 s.
- **Test:** after a missed Overpower, check whether it lights up again before the next dodge; with
  Bloodthrill, main-hand attacks on a target with your Rend, then with another warrior's Rend only,
  then none, and whether Overpower lights up; the time until it greys out after a Bloodthrill proc.
- **Samples:** ≥20 windows; ≥200 main-hand attacks per Rend state.
- **Changes:** Arms Overpower frequency.
- **Docs:** [warrior §2.8](classes/warrior.md#28-reactive-abilities-overpower-bloodthrill-revenge),
  [Q10, Q11](classes/warrior.md#9-open-questions)

#### B33. Spearing Strike and Raging Blows
**Medium · M2 · ≤30 (tier 4)**
- **Assumes:** Spearing Strike = 0.40 × normalized main-hand damage including AP (1.20 vs Giants,
  Dragonkin and mounted targets) [F; ?]; Raging Blows' off-hand Whirlwind strike is normalized,
  takes the 50% off-hand penalty, and can crit and proc [?].
- **Test:** average non-crit Spearing Strike at two AP values; off-hand Whirlwind hit sizes vs
  off-hand weapon and AP; count crits and procs.
- **Samples:** ≥30 hits each.
- **Changes:** the Arms filler and Fury Whirlwind damage.
- **Docs:** [warrior §3.1](classes/warrior.md#31-damage-abilities),
  [Q13](classes/warrior.md#9-open-questions)

#### B49. Weapon-conditional crit while dual wielding
**Medium · M2 · ≤20 (Weaponmaster ≤30)**
- **Assumes** [?]: each as its tooltip reads, though the client data is the same kind (all
  crit, aura 290, with a weapon-type `SpellEquippedItems` mask). The racials ("all spells and
  attacks"): +2% crit to all attacks (both hands, white and special) and spells while a sword is
  in either hand; Orc Axe and Dwarf Mace Specialization likewise. Weaponmaster ("with Axes and
  Polearms"): +1% per rank only on the attacks made with the axe or polearm, and not on spells.
  With a mace and a sword (the default Human Fury), a per-hand answer for the racial would cost
  about 1.2%, so this is Medium (re-rated from Low after review finding L3).
- **Test:** Human warrior with a sword in the main hand only, then the off hand only, and a mace
  in the other hand; read sheet crit and, if unclear, log crits per hand. Then an Arms warrior
  with Weaponmaster, a sword in the main hand and an axe in the off hand, the same way.
- **Samples:** sheet reads; ≥1,000 swings per hand if needed.
- **Changes:** the scope of the racials (all attacks, or the matching weapon's) and of
  Weaponmaster's axe crit (the axe's attacks, or all attacks).
- **Docs:** [warrior §2.7, §2.9](classes/warrior.md#29-racials-for-warriors),
  [Q15](classes/warrior.md#9-open-questions)

#### B34. Threat from rage and mana gains
**Medium · M3 · ≤20**
- **Assumes:** 5 threat per rage from spell effects [C, Magey], and 0.5 per mana and 5 per
  energy [?, threat-meter code only], split across enemies, with no multipliers; Anger
  Management none [?].
- **Test:** threat macro before and after Bloodrage (and Shield Specialization procs when
  available) in Battle and Defensive Stance, with a known number of enemies in combat.
- **Samples:** ≥5 per stance.
- **Changes:** power-gain threat; each 5-rage proc is 25 threat.
- **Docs:** [threat § power gains](mechanics/threat.md#threat-from-healing-power-gains-and-buffs),
  [threat OQ 7](mechanics/threat.md#open-questions)

#### B35. Omen of Clarity rate and cooldown
**Medium · M4 · ≤20**
- **Assumes:** 2 PPM (3.33% per cat hit, 8.33% per bear hit) [? secondary only]; 10 s internal
  cooldown [F client].
- **Test:** cat auto attack plus Claw on mobs; Clearcasting procs per landed hit and the minimum
  gap between procs.
- **Samples:** ≥30 minutes (≥1,800 landed hits).
- **Changes:** the OoC proc model.
- **Docs:** [druid §2.7](classes/druid.md#27-omen-of-clarity-and-clearcasting),
  [Q4](classes/druid.md#10-open-questions)

#### B36. Energy and combo points
**Medium · M4 · ≤20**
- **Assumes:** 20 Energy every 2.0 s (not 20.2 per 2.02 s), not sped up by haste [C; ?];
  cap 100 [?]; builders refund 80% on a miss, dodge or parry, finishers refund nothing and keep
  their combo points [?]; combo points on the player or target doesn't matter single-target [?].
- **Test:** log Energy over time with an addon, with and without a haste effect; read the bar's
  maximum; Energy and combo points before and after a dodged Claw and a dodged Rip; build combo
  points and swap targets. Around a powershift (Cat Form → Cat Form) and a cat → bear → cat
  shift, log the swing timer and the Energy and mana ticks: the sim keeps the swing in progress
  and one 2 s power tick for both, through shifts [?] (Q34).
- **Samples:** ≥300 ticks; ≥10 avoided builders and finishers.
- **Changes:** the Energy model constants.
- **Docs:** [druid §2.4](classes/druid.md#24-energy-cat), [§2.5](classes/druid.md#25-combo-points),
  [Q6, Q18, Q29, Q34](classes/druid.md#10-open-questions)

#### B37. Form attacks, procs and the Manual Crowd Pummeler
**Medium · M4 · ≤20 (MCP ≤30)**
- **Assumes:** haste speeds form swings; PPM procs use the form's speed (1.0 cat, 2.5 bear);
  "+X Attack Power in Cat, Bear, and Dire Bear forms" adds 1:1; no normalization; Crusader,
  stones and oils work in form; MCP (+50% attack speed on use) is the default feral weapon [?
  secondary sources]. Its 3 charges and 180 s cooldown are client data now [F] (druid Q24).
- **Test:** swing timer in cat with a haste effect (Skyborne Wind Blessed or MCP); Crusader
  procs per landed hit in cat vs caster form; sheet AP with and without a feral-AP item.
- **Samples:** ≥500 landed hits per form for Crusader.
- **Changes:** form weapon rules and MCP modelling.
- **Docs:** [druid §2.1](classes/druid.md#21-form-attacks-swing-timer-and-damage),
  [§7.3](classes/druid.md#73-weapon), [Q24, Q25, Q28](classes/druid.md#10-open-questions)

#### B38. Predatory Instincts
**Medium · M4 · ≤30 (tier 5)**
- **Assumes:** special crits deal 2.2× (the +100% bonus becomes +120%) [F data; ?
  interpretation]; the alternative is 2.4×.
- **Test:** ratio of crit to non-crit Shred or Claw with 2/2.
- **Samples:** ≥30 crits and ≥30 non-crits.
- **Changes:** cat and bear special crit damage.
- **Docs:** [druid §5.1](classes/druid.md#51-feral-combat), [Q10](classes/druid.md#10-open-questions)

#### B39. Nature's Reach melee hit
**Medium · M4 · ≤20 (Balance tier 2)**
- **Assumes:** +4% melee and spell hit at 2/2 (aura 54 and 55) [F data].
- **Test:** white miss rate vs mobs three levels higher with 0 and 2 points.
- **Samples:** ≥1,500 swings per state.
- **Changes:** feral hit (3–4% DPS if it didn't apply to melee).
- **Docs:** [druid §2.3](classes/druid.md#23-crit-hit-and-damage-modifiers-from-druid-sources-level-60),
  [Q22](classes/druid.md#10-open-questions)

#### B40. Paladin spell-power coefficients
**Medium · M5 · ≤20**
- **Assumes:** SoC proc 0.29 × SP inside the 70% (0.203 effective) [?]; JoC 0.429 × SP, not
  halved with its base [?]; Holy Strike 0.40 × (normalized weapon + flat) plus 0.429 × SP in
  full [?].
- **Test:** average non-crit SoC procs, JoC and Holy Strike with and without a +spell damage
  item.
- **Samples:** ≥30 non-crit hits of each per state.
- **Changes:** Ret spell-power scaling.
- **Docs:** [paladin § SoC](classes/paladin.md#seal-of-command-soc),
  [§ other abilities](classes/paladin.md#other-abilities),
  [OQ 2, 6, 7](classes/paladin.md#open-questions)

#### B41. SoC and judgement avoidance; partial resists on melee-class Holy
**Medium · M5 · ≤20**
- **Assumes:** SoC procs roll the full special table (miss, dodge, parry, block, crit ×2) [F
  data; ? dodge and parry reading]; JoR and JoF can miss but not be dodged, parried or
  blocked, and crit ×2 [F data; one third-party log]; **JoC can miss too**: its damage spell
  20966 carries Always Hit, but the dummy 20968 that casts it doesn't [F client `SpellMisc`], and
  in the beta logs the dummy misses (10 of 43, 5 characters; 2026-09-26), so the sim rolls it the
  melee special miss chance [?]. Which table the judgements roll is open: in those logs they missed
  30% (17 of 56) where the same characters' Holy Strikes missed 11% and white swings 6%, which fits a
  spell-like table better [?]; level-based partial resists on melee-class Holy vs +3 [?].
- **Test:** from the front vs mobs three levels higher, log SoC procs and judgement outcomes (the
  judgements' miss rate against Holy Strike's, the melee control, with and without +spell hit and
  +melee hit gear); compare average SoC damage vs +3 and +0 mobs.
- **Samples:** ≥300 SoC procs; ≥200 JoC and ≥50 JoR judgements.
- **Changes:** Ret hit tables and resist averaging.
- **Docs:** [paladin § SoC](classes/paladin.md#seal-of-command-soc),
  [§ judgement](classes/paladin.md#judgement), [OQ 3, 14, 23](classes/paladin.md#open-questions);
  [combat-tables §9](mechanics/combat-tables.md#9-spell-hit-and-crit-generic)

#### B42. Consecration ticks
**Medium · M5 · ≤20 (trained at 20)**
- **Assumes:** each 1 s tick is a separate magic-class hit with its own spell-hit roll; crit [?];
  12 Holy to every enemy plus 27 + 0.095 × SP to the first 4 [F]; which 4 count on a multi-mob
  pull [?].
- **Test:** Consecration on mobs three levels higher; log each tick's misses and crits; on a
  pull of 5+ mobs, note which ones get the larger tick.
- **Samples:** ≥20 casts (160 ticks).
- **Changes:** the Consecration model for Ret and Prot.
- **Docs:** [paladin § other abilities](classes/paladin.md#other-abilities),
  [OQ 18](classes/paladin.md#open-questions);
  [damage §4](mechanics/damage-and-timing.md#4-dots-and-bleeds)

#### B43. Hit rating in the spell table
**Medium · M5 · ≤20**
- **Assumes:** 10 hit rating = 1% spell hit as well as melee hit (one hit stat) [F data; ? in
  combat].
- **Test:** a paladin spell's resist rate (e.g. Consecration ticks) vs mobs three levels higher
  with and without a hit-rating item.
- **Samples:** ≥1,000 spell rolls per state.
- **Changes:** paladin spell hit.
- **Docs:** [combat-tables §6](mechanics/combat-tables.md#6-hit-caps),
  [OQ 18](mechanics/combat-tables.md#open-questions)

#### B44. Paladin Intellect to spell crit
**Medium · M5 · ≤20** (plus a Classic Era paladin of the same level)
- **Assumes:** 59.88 Int per 1% spell crit, from the client's `PlayerExpectedStat` [F]; RatingBuster's
  pre-SoD Classic Era logic gives 59.9 too, and the "about 29.5" in some Classic guides traces back
  to 2005 addon text; whether the server uses the table at all [?].
- **Test:** a beta paladin reads Holy spell crit, gains a known amount of Int (item or buff) and
  reads again: slope = Δcrit / ΔInt. Repeat exactly on a Classic Era paladin of the same level.
- **Samples:** two Int changes per character.
- **Changes:** paladin spell crit (Consecration, Exorcism, Holy Shield crits).
- **Docs:** [stats § Intellect](mechanics/character-stats.md#intellect),
  [OQ-4](mechanics/character-stats.md#oq-4-paladin-intellect-to-spell-crit),
  [OQ-12](mechanics/character-stats.md#oq-12-minor-items)

#### B45. Judgement of Fury's taunt
**Medium · M5 · ≤20**
- **Assumes:** taunts like Taunt: sets you to top threat, and does nothing if you are already
  there [?]; the client's scripted 1607 + 42.3/level value isn't threat [?].
- **Test:** two players on a mob; the non-tank judges JoF; read both players' threat before and
  after with the threat macro.
- **Samples:** ≥5 judgements.
- **Changes:** the JoF threat model.
- **Docs:** [threat § taunts](mechanics/threat.md#taunts-and-forced-attacks),
  [threat OQ 6](mechanics/threat.md#open-questions);
  [paladin § threat](classes/paladin.md#threat-paladin-specific)

#### B87. Attack power in Arcane Shot and Serpent Sting
**Medium · hunters · ≤20**
- **Assumes** [?]: none. The Forever client dropped Classic Era's spell damage coefficients and gives
  no attack-power term, so Arcane Shot deals 217 and Serpent Sting 83 a tick [F]. No measurement,
  similar value or other sim gives one, so the sim adds nothing (the last step of
  [doctrine §2's fallback order](doctrine.md#2-where-numbers-come-from-non-negotiable)).
- **Why it's open:** public beta logs show more: Arcane Shot rank 1 (20) hits for 26–38, rank 3
  (39) for 56–75, Serpent Sting rank 1 (2) ticks for 3–6. The logs carry only the melee
  attack-power field, not the sheet's ranged attack power, so no coefficient is measured
  ([hunter OQ-H9](classes/hunter.md#oq-h9-arcane-shot-and-serpent-sting-scaling)).
- **Test:** as B86, with the sheet's ranged attack power (Aspect of the Hawk on and off, or Trueshot
  Aura) and no talents that change the two.
- **Samples:** ≥50 Arcane Shots and ≥100 ticks at each attack power.
- **Changes:** both abilities' damage, most for Beast Mastery, which uses Arcane Shot.
- **Docs:** [hunter §3.3, §3.4](classes/hunter.md#33-arcane-shot-r8-14287),
  [OQ-H9](classes/hunter.md#oq-h9-arcane-shot-and-serpent-sting-scaling)

#### B75. Trainer spells the client has no data for
**Medium · M4 (paladin: M5) · ≤20 for the low ranks**
- **Assumes:** 27 trainer rows of the druid and paladin `SkillLineAbility` point at spells the
  Forever client has no data for at all (no `SpellName`, `Spell` or `SpellEffect` row, none
  encrypted), so the spellbooks don't list them [F client]. Among them: Tiger's Fury ranks 2–4
  (6793, 9845, 9846, a rank chain from 5217), Faerie Fire (Feral) ranks 2–4, Frenzied
  Regeneration ranks 2–3, Mangle 22571 and its chain 1238074 → 1238075 → 1238077, Avenger's
  Shield (407669), Righteous Fury 25781 and Greater Blessing of Sanctuary. They may exist only
  as server hotfix rows, like the items no client carries, or be rows Forever abandoned [?].
- **Test:** at a druid and a paladin trainer, list what they teach at each level up to the cap;
  compare with the book (the spellbook tab) and with `meta.noClientData` in
  `src/data/spells/<class>.json`. Read any such spell's tooltip.
- **Samples:** one visit per class and level bracket.
- **Changes:** the druid and paladin books, and Tiger's Fury's, Mangle's and Avenger's Shield's
  values for M4 and M5.
- **Docs:** [spells.md § Trainer rows with no client data](data/spells.md#trainer-rows-with-no-client-data)

#### B84. Earth Shock's threat
**Medium · Enhancement shaman (TPS only) · ≤20 (Earth Shock r1, level 4)**
- **Assumes** [?]: 2 × its damage, by name as a user decision ([D38](decisions.md#d38-the-values-audits-calls-2026-09-26), 2026-09-26): the value of the
  Maul ×1.75 lineage, which every Classic Era threat tool carries and nobody has measured. Its
  tooltip says "Causes a high amount of threat"; the wording table's rule (dmg + 206, Sunder's
  Forever value) stays for the tanks' abilities.
- **Test:** the threat macro before and after single Earth Shocks on a fresh mob, against each
  shock's damage in the combat log; a Lightning Bolt the same way calibrates ×1.
- **Samples:** ≥8 shocks.
- **Changes:** Enhancement's TPS: ×1 would be −9.4% (423 → 383).
- **Docs:** [shaman Shocks, open question 8](classes/shaman.md#shocks-and-lightning-bolt),
  [threat § shaman](mechanics/threat.md#shaman-dps-context)

#### B85. Maelstrom Weapon's rate
**Medium · Enhancement shaman · ≤30 (tier 5)**
- **Assumes** [?]: a stack on 50% of landed melee hits, white, special and extra attacks. The
  tooltip describes a chance but never shows it (it references the talent's 20 and 5, not its 50);
  the sim reads the client's undescribed dummy 50 as that chance, kept and labelled by user decision
  ([D38](decisions.md#d38-the-values-audits-calls-2026-09-26), item 26). Blizzard never published the rate; its Season of Discovery notes raise
  it about 50% with Windfury Weapon and 25% with a two-hander, which the sim doesn't add.
- **Test:** count Maelstrom Weapon stacks gained against landed melee hits in the combat log, with a
  one-hander and a two-hander, with and without Windfury Weapon.
- **Samples:** 500+ landed hits per setup.
- **Changes:** 25% would be −1.3%, 100% +2.4%; the SoD raises on 50% (94% for the default) +2.2%.
- **Docs:** [shaman Maelstrom Weapon, open question 1](classes/shaman.md#maelstrom-weapon)

### Low

#### B46. Weapon skill per point
**Low · M2 · ≤20**
- **Assumes:** 0.04% per point for hit, dodge, parry and crit [F client UI; ? in combat];
  Classic 0.1–0.2%. Matters only with +skill items; 300–302 skill is the norm.
- **Test:** Magey's proxy: compare miss, dodge and crit rates vs +2 and +3 mobs (one level is
  5 defense points).
- **Samples:** ≥3,000 swings per mob level.
- **Changes:** the per-point constants.
- **Docs:** [combat-tables §4.1](mechanics/combat-tables.md#41-effects-per-point),
  [OQ 2](mechanics/combat-tables.md#open-questions)

#### B47. Level-based magic resistance
**Low · M2 · ≤20**
- **Assumes:** 24 vs a +3 target (a Classic sim's default) [?]; other sources say ~15.
- **Test:** average damage of a fixed non-binary magic proc (e.g. Fiery Weapon) vs +3 and +0
  mobs.
- **Samples:** ≥300 procs per mob level.
- **Changes:** partial resists on fire, nature and shadow procs.
- **Docs:** [combat-tables §9](mechanics/combat-tables.md#9-spell-hit-and-crit-generic),
  [OQ 8](mechanics/combat-tables.md#open-questions);
  [encounter OQ 4](mechanics/encounter.md#open-questions)

#### B48. Haste and swing-timer details
**Low · M2 · ≤20**
- **Assumes:** haste doesn't shorten the GCD [C, the pre-SoD WarriorSim; Forever ?]; a haste
  change mid-swing applies from the next swing [?]; paladin and druid cast-time spells pause and
  restart swings like Slam [?]; the first off-hand swing comes at half its speed (a modelling
  choice) [?].
- **Test:** built-in swing timer and cooldown display: time GCDs with and without a haste
  effect; gain haste mid-swing and time that swing; cast a spell with a cast time mid-melee
  and time the next swings; log the first off-hand swing after a pull.
- **Samples:** ≥10 trials each.
- **Changes:** engine timing rules.
- **Docs:** [damage §3.3](mechanics/damage-and-timing.md#33-swing-reset-rules),
  [§3.5](mechanics/damage-and-timing.md#35-global-cooldown),
  [OQ 5, 6, 7, 11](mechanics/damage-and-timing.md#open-questions)

#### B50. Gnome maximum rage and Eureka!
**Low · M2 · ≤20**
- **Assumes:** Expansive Mind +5% maximum rage; how it combines with Boundless Rage [?]; Eureka!'s
  −10% cost rounding (−40% until 1.60.1.70009; down, to whole rage), that it cuts only Execute's base cost, and that a miss
  spends a charge [?] (the `eureka` assumption; every class's variant models the same rules).
- **Test:** Gnome warrior with Boundless Rage 1/3: maximum rage reads 115.5 or 115. Use Eureka!
  on abilities with known costs, and on an avoided ability.
- **Samples:** one read; ≥3 casts per case.
- **Changes:** Gnome rage cap and Eureka! costs.
- **Docs:** [rage § pool](mechanics/rage.md#rage-pool-cap-and-decay);
  [warrior Q17, Q18](classes/warrior.md#9-open-questions)

#### B51. Blood Fury scope
**Low · M2 · ≤20**
- **Assumes:** +10% of total attack power [? scope]; the alternative is 10% of the level-plus-
  Strength part.
- **Test:** Orc warrior with Battle Shout up: sheet AP before and after Blood Fury.
- **Samples:** one read at two AP levels.
- **Changes:** the Blood Fury multiplier.
- **Docs:** [stats OQ-9](mechanics/character-stats.md#oq-9-blood-fury-scope)

#### B52. Touch of the Grave
**Low · M2 · ≤20**
- **Assumes:** it deals damage: its drain takes health from the target, and since 1.60.1.70009
  only spells and abilities with a damage component proc it (Shadow Word: Pain on the cast, not its
  ticks), so it no longer breaks crowd control [F] (the build's notes;
  [stats OQ-10](mechanics/character-stats.md#oq-10-touch-of-the-grave)). Its chance (5% for the
  warrior, paladin and rogue, 10% for the priest, mage and warlock) and 1 s internal cooldown are
  the client's [F]. **Simulated with a default** (the `touchOfTheGrave` assumption;
  [stats: Touch of the Grave](mechanics/character-stats.md#touch-of-the-grave)): 5% of maximum
  health, the tooltip's "up to", as Shadow damage a proc, which never misses or crits and makes
  damage threat; the health it drains heals you for as much, all of it effective (the sim keeps no
  health pool to overheal), and makes healing threat, 0.5 a point × the global multiplier [C] with
  no paladin ×0.5 or Righteous Fury [?]. No default race is Undead, so no default headline moves.
  As Undead, over 20,000 fights, it adds +2.3% to a Protection paladin's TPS, +1.9% to a
  Protection warrior's and +1.6% to a Shadow Priest's DPS.
- **Test:** Undead warrior or paladin: log 5 minutes of melee; count procs and read amounts.
- **Samples:** ≥5 minutes.
- **Changes:** its default: the amount, school, crit, miss and threat (and whether its heal makes
  threat).
- **Docs:** [stats OQ-10](mechanics/character-stats.md#oq-10-touch-of-the-grave);
  [warrior Q16](classes/warrior.md#9-open-questions);
  [paladin OQ 15](classes/paladin.md#open-questions)

#### B53. Anger Management tick phase
**Low · M2 · ≤20 (Arms tier 3)**
- **Assumes:** 1 rage every 3 s from the start of combat [?].
- **Test:** log Anger Management ticks relative to entering combat.
- **Samples:** 10 pulls.
- **Changes:** tick phase.
- **Docs:** [rage OQ 7](mechanics/rage.md#open-questions)

#### B54. Debuff limit
**Low · M2 · ≤20**
- **Assumes:** no limit modelled; every selected debuff is present [?] (Classic Era: 16).
- **Test:** a group stacks 17+ distinct debuffs on an elite and watches whether the oldest
  falls off.
- **Samples:** 2 trials.
- **Changes:** whether debuff-slot pressure is modelled.
- **Docs:** [buffs §4.3](mechanics/buffs-debuffs-consumables.md#43-debuff-slot-limit),
  [buffs OQ 1](mechanics/buffs-debuffs-consumables.md#open-questions);
  [system-changes OQ 4](mechanics/forever-system-changes.md#open-questions)

#### B55. Minor food, enchant and buff checks
**Low · M2 · ≤20**
- **Assumes:** one Well Fed buff at a time, while Dirge's Chops and Blessed Sunfruit may stack
  with it [?]; 2H Lesser Agility gives +15 (its spell says +9), Lesser Deflection and Necklace
  Deflection give +5 defense (spell says +2) [?]; Blood Pact is 49 + 0.5/level Stamina [?].
- **Test:** eat two foods and watch the buff bar; apply each enchant to low-level gear and read
  the sheet; read an Imp's Blood Pact on the party's sheets.
- **Samples:** one each.
- **Changes:** food exclusivity and small stat values.
- **Docs:** [buffs OQ 6, 8, 12](mechanics/buffs-debuffs-consumables.md#open-questions)

#### B56. Minor character-sheet checks
**Low · M2 · ≤20**
- **Assumes:** the "first 20 Stamina and Intellect count as 1" rule holds in Forever [F client
  UI: the sheet code uses `STAMINA_BREAK = INTELLECT_BREAK = 20`; ? on the server; Classic Era
  ?]; warrior ranged AP is 2 per Agi in Forever data (1 in Classic), irrelevant to melee [?];
  the two unnamed `PlayerExpectedStat` columns are unused [?].
- **Test:** naked sheet at the cap: maximum HP and mana (the server's values) against Stamina
  and Intellect at two totals each, compared with `min(20, x) + 10 or 15 × (x − 20)`; ranged
  AP against Agility.
- **Samples:** one sheet.
- **Changes:** HP and mana formulas.
- **Docs:** [stats OQ-12](mechanics/character-stats.md#oq-12-minor-items)

#### B57. Victory Rush damage
**Low · M2 · ≤20 (not used on bosses)**
- **Assumes:** 1 damage (tooltip); the data has a dummy value of 15 [?].
- **Test:** Victory Rush after a kill at two AP values.
- **Samples:** 5 per AP value.
- **Changes:** nothing on bosses.
- **Docs:** [warrior Q14](classes/warrior.md#9-open-questions)

#### B58. Revenge window
**Low · M3 · ≤20**
- **Assumes:** usable for 5 s after a block, dodge or parry [?] (the only 4 s source is
  forbidden).
- **Test:** time from a dodge or block until Revenge greys out.
- **Samples:** ≥10.
- **Changes:** Revenge availability.
- **Docs:** [warrior §2.8](classes/warrior.md#28-reactive-abilities-overpower-bloodthrill-revenge),
  [Q12](classes/warrior.md#9-open-questions)

#### B59. How attack-speed slows apply
**Low · M3 · ≤20**
- **Assumes:** `swing × (1 + slow)`, so a 20% slow turns 2.0 s into 2.4 s [?]; the alternative
  `÷ (1 − slow)` gives 2.5 s.
- **Test:** time a mob's swings with and without Thunder Clap.
- **Samples:** ≥30 swings per state.
- **Changes:** boss swing interval (tank rage and damage taken).
- **Docs:** [damage §3.2](mechanics/damage-and-timing.md#32-attack-speed-debuffs-on-the-boss-tank-modeling),
  [OQ 8](mechanics/damage-and-timing.md#open-questions)

#### B60. Mob block value and +1/+2 parry bases
**Low · M3 · ≤20**
- **Assumes:** a mob's block removes 0 damage (a blocked hit counts as a normal hit) [?];
  `forever` parry of 5.5% and 6.0% vs +1 and +2 mobs [?] (trash only).
- **Test:** from the front, compare blocked and unblocked white-hit damage; count parries vs +1
  and +2 mobs.
- **Samples:** ≥100 blocks; ≥2,000 swings per mob level.
- **Changes:** minor table details.
- **Docs:** [combat-tables §2.4](mechanics/combat-tables.md#24-attacking-from-behind-vs-the-front),
  [OQ 10, 14](mechanics/combat-tables.md#open-questions)

#### B61. Demoralizing Shout vs Demoralizing Roar
**Low · M3 · ≤20**
- **Assumes:** exclusive [?], from Classic lore, not a cited source.
- **Test:** apply both to a mob and inspect its debuffs.
- **Samples:** 2 trials.
- **Changes:** the `ap-reduction` group.
- **Docs:** [buffs OQ 15](mechanics/buffs-debuffs-consumables.md#open-questions)

#### B62. Aggro thresholds
**Low · M3 · ≤20 (UI only)**
- **Assumes:** 110% of the tank's threat in melee, 130% at range [C].
- **Test:** a DPS player builds threat against a tank of known threat and notes when the mob
  switches.
- **Samples:** ≥5 pulls each.
- **Changes:** the UI's threat-budget hint.
- **Docs:** [threat § aggro](mechanics/threat.md#aggro-thresholds),
  [threat OQ 9](mechanics/threat.md#open-questions)

#### B63. Bear armor and dodge talents
**Low · M4 · ≤20** (Dire Bear: [C29](#c29-dire-bear-armor))
- **Assumes:** Forever's second bear armor aura (466) may multiply bonus armor [?]; Thick Hide is
  +1 armor per level per rank before the form multiplier [F text]; Feral Swiftness's +4% dodge
  may no longer be cat-only [?]; passive 1306459 isn't live [?].
- **Test:** in Bear Form, sheet armor with and without Mark of the Wild (does armor rise by the
  buff's armor or 2.8 times it?); Thick Hide trained vs untrained; sheet dodge in bear with and
  without Feral Swiftness.
- **Samples:** sheet reads.
- **Changes:** bear armor (survival only: Forever's rage from damage taken reads the hit before
  armor) and bear dodge.
- **Docs:** [stats OQ-8](mechanics/character-stats.md#oq-8-bear-armor-multipliers-and-thick-hide),
  [OQ-11](mechanics/character-stats.md#oq-11-feral-swiftness-dodge-scope);
  [druid §4.7](classes/druid.md#47-bear-armor-low-priority-tps-doesnt-need-it),
  [Q19](classes/druid.md#10-open-questions)

#### B64. Feral talent scopes
**Low · M4 · ≤20 (King of the Jungle ≤30)**
- **Assumes:** Genesis applies to Rip, Rake's bleed and Lacerate, and Savage Fury to Rake's bleed
  [F masks]; Heart of the Wild's Strength applies before or after Kings [?]; Furor's cat
  re-entry formula and rounding [F tooltip]; entering cat without Furor sets Energy to 0 [C
  inferred]; King of the Jungle's hidden 5/10/15 value and whether Tiger's Fury persists out of
  cat [?].
- **Test:** Rip and Rake ticks with 0 and 5 Genesis, 0 and 2 Savage Fury; sheet Strength in cat
  with and without Kings; shift at a known Energy and time the caster phase; Tiger's Fury with 0
  and 3 King of the Jungle.
- **Samples:** ≥30 ticks per state; 5 shifts.
- **Changes:** small feral multipliers and the powershift rule.
- **Docs:** [druid §2.8](classes/druid.md#28-shapeshifting-furor-wolfshead-helm-powershifting-mana),
  [Q7, Q11, Q12, Q13, Q23](classes/druid.md#10-open-questions)

#### B65. Righteous Fury scope and paladin healing threat
**Low · M5 · ≤20**
- **Assumes:** Righteous Fury ×1.6 on Holy damage [F] (×1.9 until 1.60.1.70009); whether it also scales Holy heals and
  blessing casts, whether paladin healing threat is halved, and each blessing cast's threat
  (about its spell level per recipient) [? threat-meter code only].
- **Test:** threat macro before and after a self-heal and a blessing cast, with and without
  Righteous Fury, in combat with one mob; the blessing value from the cast without RF.
- **Samples:** ≥5 each.
- **Changes:** paladin non-damage threat.
- **Docs:** [threat § Righteous Fury](mechanics/threat.md#paladin-righteous-fury),
  [threat OQ 5](mechanics/threat.md#open-questions);
  [paladin OQ 16](classes/paladin.md#open-questions)

#### B66. Spell crit suppression vs +3
**Low · M5 · ≤20**
- **Assumes:** none [C]; the only number found (2.1%) is from an SoD sim and refused.
- **Test:** spell crit rate vs mobs three levels higher against sheet spell crit.
- **Samples:** ≥2,000 spell hits.
- **Changes:** paladin spell crit vs bosses.
- **Docs:** [combat-tables §9](mechanics/combat-tables.md#9-spell-hit-and-crit-generic),
  [OQ 9](mechanics/combat-tables.md#open-questions)

#### B67. Seal of Righteousness formula
**Low · M5 · ≤20**
- **Assumes:** two-hander `1.20 × v × speed`, one-hander `0.85 × v × speed`, with v = 18.80 at
  60, and not the proc's base points (35 at rank 8): the beta logs at ranks 1–4 [C/?]; 0.1 × SP at
  rank 8, the proc's 0.1 plus the aura dummy's none there [F]; at ranks 1–4 the logs' 0.2 (16 procs
  from 4 characters) is the proc's 0.1 plus the dummy's 0.1 [?]; the TBC-era `+0.03 × weapon average`
  term is refused.
- **Test:** SoR procs at level 60 with a known weapon, with and without +100 spell damage (0.1 × SP
  adds 10 a proc; 0.2 would add 20).
- **Samples:** ≥50 procs per state.
- **Changes:** SoR (the alternative seal and twisting partner).
- **Docs:** [paladin § SoR](classes/paladin.md#seal-of-righteousness-sor),
  [OQ 4](classes/paladin.md#open-questions)

#### B68. Paladin talent details
**Low · M5 · needs each talent**
- **Assumes:** Redoubt 10% per melee hit taken at every rank (the trait curve says 2% per rank)
  [?]; Reckoning's stacking cap [?]; Sanctified Judgement returns 60% of the seal's base cost
  and nothing on a missed judgement [?]; Vindication effectively permanent (100% proc in data)
  [?]; Benediction and Holy Conduit add [?]; Seal and Judgement of Wisdom proc rates [?].
- **Test:** Redoubt procs per hit taken at 1–5 ranks; a block-heavy log for Reckoning; mana
  before and after landed and missed judgements; Vindication uptime; Consecration's cost with
  both talents; mana procs per hit with Wisdom.
- **Samples:** ≥200 hits taken; ≥20 judgements.
- **Changes:** Prot and Ret details.
- **Docs:** [paladin § talents](classes/paladin.md#talents),
  [OQ 8, 9, 12, 13, 19, 20](classes/paladin.md#open-questions)

#### B69. Paladin minor mechanics
**Low · M5 · ≤20**
- **Assumes:** Seal of the Crusader divides weapon damage per swing by 1.4 [?]; Eye for an Eye's
  school and threat [?]; following the client's NOT_A_PROC attribute, Seal of Command's proc and
  the damage judgements trigger Windfury, Hand of Justice, Crusader, Vengeance and Vindication,
  and Seal of Righteousness's and Seal of Fury's procs trigger none but Vengeance, whose aura can
  proc from procs (Attr3 `0x4000000`), so their crits give its stacks [?] (not minor: the other
  reading adds about 11% to default Protection TPS); mana regenerates on 2 s ticks from a random
  phase, and a seal cast before the pull costs nothing [?].
- **Test:** swing damage with and without SotC; crits taken with Eye for an Eye; Windfury attacks
  per landed white swing with Seal of Fury up and with no seal, and item procs from SoC hits and
  judgements; Vengeance stacks from Seal of Righteousness's crits alone; a paladin's mana over the first 20 s of a pull.
- **Samples:** ≥50 of each.
- **Changes:** minor Ret and Prot details.
- **Docs:** [paladin OQ 22, 24](classes/paladin.md#open-questions)

#### B70. Classic rules that only a post-SoD sim encodes
**Low · M2 · ≤20**
- **Assumes** [?]: flat "damage taken" bonuses on a target (Gift of Arthas' +8 physical, a boss
  debuff in Max consumables) add after your damage multipliers and before the outcome's and the
  armor's: a crit gets +16, a glancing blow its share, and armor mitigates it. Every direct
  physical hit that deals damage gets it, white or special, ranged, and a pet's; a bleed's ticks
  (Deep Wounds, Rend, Rip, Rupture, Garrote) and Sunder Armor don't. On multi-target attacks,
  ordinary weapon procs roll per target hit while extra-attack procs other than Windfury roll once
  per cast. Only WarriorSim's post-SoD code has these; its pre-SoD commit, the doctrine's Classic
  Era source, doesn't model them.
- **Test:** white hits on a mob carrying Gift of Arthas' debuff vs the same mob without it, at
  0 armor if one can be found or a known armor: the difference per normal hit (+8, or +8 scaled
  by your multipliers?) and per crit (+16 or +8?); Rend's or Deep Wounds' ticks on it, +8 or not;
  Cleave with a weapon enchant on two mobs: procs per Cleave.
- **Samples:** ≥100 hits per state; ≥50 ticks; ≥200 Cleaves.
- **Changes:** two small rules in the damage and proc engine; Gift of Arthas' value at Max
  consumables (+0.5% to +3.2% of a physical spec's DPS, most for the rogues' many small hits).
- **Docs:** [damage §2.4](mechanics/damage-and-timing.md#24-damage-modifier-stacking),
  [buffs §4.2](mechanics/buffs-debuffs-consumables.md#42-other-debuffs),
  [§5.3](mechanics/damage-and-timing.md#53-what-can-trigger-a-chance-on-hit-proc),
  [OQ 13](mechanics/damage-and-timing.md#open-questions)

#### B71. Execute and fractional rage
**Low · M2 · ≤30 (Execute)**
- **Assumes** [?]: Execute converts all the rage left after its cost, tenths included (15
  damage per rage). Forever's normalized white rage leaves fractions: a 2.6 s main hand gives
  3.46 × 2.6 = 8.996 rage, which the pool shows as 8.9 or 9.0. The difference is at most 13.5
  damage per Execute.
- **Test:** Execute a mob at a known fractional rage (read with an addon on
  `UNIT_POWER_UPDATE`), and compare the damage with `600 + 15 × (rage − cost)` with and
  without the fraction. Use non-crits only, at a known armor.
- **Samples:** ≥30 Executes.
- **Changes:** Execute's damage per extra rage.
- **Docs:** [warrior §7](classes/warrior.md#7-implementation-notes),
  [Q28](classes/warrior.md#9-open-questions)

#### B72. Improved Bloodrage 1/2 rounding
**Low · M3 · ≤20 (Protection tier 2)**
- **Assumes** [?]: at 1/2, each rage gain is ×1.25 floored to a tenth: 12.5 at once, then 1.2
  per tick (1.25 floored), 24.5 in all instead of 25. Rank 2/2 (×1.5) is exact.
- **Test:** Improved Bloodrage 1/2; use Bloodrage out of combat and log each rage gain with
  decimals.
- **Samples:** 3 casts.
- **Changes:** Bloodrage's per-tick rage at rank 1.
- **Docs:** [warrior §2.3](classes/warrior.md#23-rage-warrior-specific),
  [Q29](classes/warrior.md#9-open-questions)

#### B73. Rend tick crits and Impale
**Low · M2 · ≤30 (Impale, tier 4)**
- **Assumes** [?]: a Rend tick crit deals ×2.2 with Impale 2/2 (×2.0 without), since Impale's
  class mask covers Rend [F client] (the mask is Classic Era's, where Rend couldn't crit, so it
  shows no intent); a tick's crit chance is the main hand's special-attack crit chance,
  suppression included, snapshotted at the application; a tick crit fires no crit procs (Flurry,
  Deep Wounds) [F client: their proc masks have no periodic bit]; a landed Rend application
  fires on-hit procs (Windfury, Weaponmaster, weapon enchants).
- **Test:** with Impale 0/2 and 2/2, log Rend's ticks against mobs three levels higher: the size
  of crit ticks against normal ones (×2.0 or ×2.2) and their rate against the sheet's crit;
  with Windfury or a Crusader weapon, count procs right after Rend applications.
- **Samples:** ≥200 ticks per Impale rank; ≥100 Rend applications.
- **Changes:** Rend's tick crits and its proc value in the Arms rotation.
- **Docs:** [warrior §2.5, §7](classes/warrior.md#25-crits-impale-flurry-deep-wounds),
  [Q32](classes/warrior.md#9-open-questions);
  [damage §4](mechanics/damage-and-timing.md#4-dots-and-bleeds)

#### B74. Per-level tooltip values
**Low · M3 · ≤20**
- **Assumes** [?]: the datasets render every effect with a per-level term at level 60, counting
  levels from `SpellLevels.SpellLevel` up to `MaxLevel`, truncating the term to a whole number
  and adding it after the spread ([items.md § Per-level values](data/items.md#per-level-values)).
  That gives the level-60 tooltips: Demoralizing Shout r5 −204 (base −196), Cat Form 120, Dire
  Bear Form 1240 health. Where `BaseLevel` differs from `SpellLevel` the rule is a choice: the
  Forever client zeroes `BaseLevel` on 743 of its 1,559 per-level spells, and Vindication's aura
  440667 (`BaseLevel` 0, `SpellLevel` 1, −3.5 per level from 6) gives the talent 200 at 3/3
  from `SpellLevel`, 204 from `BaseLevel`.
- **Test:** at the current level, read tooltips whose values scale: Demoralizing Shout rank 1–2
  and Battle Shout (warrior), Cat Form's attack power (druid), Vindication 1/3 (paladin, if the
  cap allows the tier). Compare with the formula at that level: from `SpellLevel`, truncated,
  and the `BaseLevel` alternative. At 60, the rounding itself: Frostbolt rank 10's tooltip low
  end reads **382** if the client truncates the term (386 × (1 − 0.0381) + trunc(2.9 × 4) =
  371.29 + 11) and **383** if it rounds (371.29 + 11.6 = 382.89); the class docs' spell tables
  and every rank below 60 in the engine assume truncation.
- **Samples:** one read per spell, at two levels if possible.
- **Changes:** the rendered tooltips, and the tank-side boss AP reduction of Demoralizing
  Shout.
- **Docs:** [items.md § Per-level values](data/items.md#per-level-values),
  [spells.md § Caveats](data/spells.md#caveats), [talents.md § Caveats](data/talents.md#caveats);
  [C27](#c27-demoralizing-shout-and-roar-level-scaling)

#### B76. Faction of Forever's new PvP and battleground items
**Low · M2 · ≤20**
- **Assumes** [?]: an item new in Forever whose row carries no reputation, rank or race
  requirement suits both factions: the "Premier" PvP pieces and Sentinel's Libram (272434), whose
  name is an Alliance Warsong Gulch prefix but which has no Horde twin. Classic Era's Warsong
  Gulch and Alterac Valley rewards go by their names [C]. **Evidence against it:** every Premier
  family comes as a pair of item sets whose names carry a faction's rank-10 title, e.g. Premier
  Chevalier's set 2086 "Lieutenant Commander's Vindication" (Alliance) and Premier Scaled's 2084
  "Champion's Vindication" (Horde), identical in stats and bonuses [F] (ItemSet, 1.60.1.69913). So
  each Premier piece is probably its set's faction's; the defaults already pick by set name for the
  Horde paladin (tank quick-fix verification TV-1), and teaching the item's faction to read its set
  name is a follow-up.
- **Test:** find who sells or drops Sentinel's Libram and the Premier pieces, on each faction (a
  vendor's list or a loot table is enough).
- **Samples:** one look per item family.
- **Changes:** which items the gear picker offers each faction.
- **Docs:** [items § Equipping rules, Caveats](data/items.md#equipping-rules)

#### B77. Rage fractions: carried, random or floored
**Low · M2 · ≤20**
- **Assumes** [?]: in `forever` a white hit's or a hit taken's fraction of a tenth carries to the
  next such gain, so none is lost, and the pool shows whole tenths. Third-party beta logs rule
  out flooring each gain or rounding it to the nearest tenth: one weapon's swings take two
  neighbouring values, in the share its fraction predicts. They lean towards random rounding
  over a carried fraction (2 of 36 back-to-back pairs are ones a carried fraction can't give);
  both have the same mean. `classicEra` floors each gain (unmeasured).
- **Hits taken, by extension:** the white swings set the rule (848 swings, 34 characters). A
  hit taken carries its fraction because the same server gain rule makes it; its own evidence
  is mostly one tester's, which can't set a default by itself
  ([D22](decisions.md#d22-reproducible-log-analyses-can-set-server-side-forever-defaults-2026-09-23)).
- **Test:** log many hits and see whether the totals drift. One weapon, auto attack only, no
  rage talents, a target that can't hit back, the pool far from the cap: log 50 or more landed
  swings in a row and compare the rage gained with `swings × k × speed`. A carried fraction
  stays within 0.1 of it; random rounding wanders about ±0.35 after 50 swings at a fraction of
  0.5; flooring each swing falls 2.5 behind. Then hits taken, on two or more characters: one
  weak mob, no swings of your own, advanced combat logging with `UNIT_POWER_UPDATE`, and for
  each hit its unmitigated amount, any blocked or absorbed part, and your maximum health.
  Compare the rage gained with the sum of `10 × D_pre / maxHealth`: a carried fraction stays
  within 0.1, and identical hits take the two neighbouring tenths in the share their fraction
  predicts.
- **Samples:** 50 or more swings in a row, twice; 50 or more hits taken in a row, on each of two
  or more characters.
- **Changes:** how the rage model rounds. Flooring would cost Arms' 3.5 s two-hander 0.05 rage a
  swing and a tank about 0.05 a boss hit; carried and random rounding differ only in spread.
- **Docs:** [rage § Rounding](mechanics/rage.md#rounding),
  [rage OQ 9](mechanics/rage.md#open-questions)

#### B80. Bastion and Focused Rage: which row is which
**Low · M3 · ≤20 (a look at the talent pane)**
- **Contradiction:** Blizzard's development notes for 1.60.1.70009
  ([notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-september-24/2360696))
  say the Protection warrior's Bastion and Focused Rage swapped rows, but the build's client data
  doesn't have the swap: Bastion stays at tier 5, column 4 and Focused Rage at tier 6, column 3, as
  in 1.60.1.69913 [F] [client](data/client.md#talentsjson) (TraitNode, 1.60.1.70009).
- **Assumes:** the client's rows, since the sim reads its trees from the client
  ([talents.md](data/talents.md#tree-versions)). Either way the default Protection build takes both
  at full rank, so no default or headline moves; a swap would move their build-code positions,
  which the talent migration maps by name.
- **Test:** open the Protection tree on the beta and read which row each is on.
- **Samples:** one look.
- **Changes:** the trees, once a client build carries the swap (the talent scraper reports it).
- **Docs:** [warrior §4.3](classes/warrior.md#43-protection-18-talents)

#### B81. EZ-Thro Dark Bomb's rules
**Low · M2 · ≤20 (once you have bombs: `RequiredLevel` 1, no skill [F client ItemSparse])**
- **Assumes** [?]: the client gives its damage (225–675 Fire), 1 s cast, 60 s shared cooldown and
  range [F]; the sim assumes the rest: it's a **binary** spell (its stun makes it resisted whole at
  the boss's average Fire resistance, and a landed one takes no partial resist); its throw
  **stops both melee swings**, which restart from full as it lands, and holds your other
  abilities, off-GCD ones too (a caster's next cast, a hunter's Auto Shot); its threat is its
  damage × your threat multipliers, with nothing of its own; **no class talents** reach it (spell
  1269334 has no `SpellClassOptions` row: no Critical Mass, Elemental Precision, Fire Power,
  Combustion or Ignite, and none of your school multipliers); and a druid can throw it in Cat or
  Bear Form. It's off in every preset, so no default moves; picked, it costs a melee spec 0.3–2.8%
  of DPS (an upper bound, thrown wherever the swing timer is) and moves a caster or hunter by
  under ±1%.
- **Test:** throw 30+ bombs at mobs three levels above you with a swing-timer addon on and the
  combat log recording. Watch whether the swing bar restarts, pauses or runs on through the throw,
  and whether a Heroic Strike or potion can be used during it. In the log, count full resists and
  look for partial ones ("(x resisted)"), and count crits and their size (×1.5). As a Fire mage,
  compare the bombs' crit rate with Fireball's, which Critical Mass raises, and see whether an
  Ignite follows a bomb crit or a Combustion charge goes. With a second player on a mob, read the
  threat a bomb adds with the threat macro. As a druid, try it in Cat and Bear Form.
- **Samples:** 30+ throws; more for the resist count (a 6% rate needs 100+ to tell from 0%).
- **Changes:** the bomb's hit and resist, its swing cost (the melee presets' "no bomb" rests on
  it), its threat and which talents reach it.
- **Docs:** [buffs §3.7](mechanics/buffs-debuffs-consumables.md#37-engineering-and-explosives),
  [buffs OQ 21](mechanics/buffs-debuffs-consumables.md#open-questions)

---

## Route C: Forever at level 60

These wait for the cap to lift, launch (2026-11-04) or the raids (2026-12-09).

### High

#### C1. Attack table and ratings at 60 vs level-63 bosses
**High · M2**
- **Assumes:** the +3 results from [B2](#b2-hit-suppression-and-the-raid-boss-hit-cap)–[B7](#b7-glancing-blow-damage)
  and [B12](#b12-boss-parry-from-the-front) carry over to a level-60 player vs a level-63 boss
  [?].
- **Test:** repeat those white-swing and sheet tests at 60 against level-63 bosses or elites.
- **Samples:** as in B2–B7 and B12.
- **Changes:** promotes the `forever` profile and the rating table to measured at 60.
- **Docs:** [system-changes OQ 1, OQ 2](mechanics/forever-system-changes.md#open-questions);
  [combat-tables OQ 17](mechanics/combat-tables.md#open-questions)

#### C2. Rage formulas at level 60
**High · M2 (tanks: M3, M4)**
- **Assumes:** the same `k` at every level, and the damage-taken formula from B9 holds at 60 [?]
  (measured only at levels 1–25). The 18–22 Sep logs can't tell max health from a level term;
  two bears' logs of 23–24 Sep find one: the factor rises with the mob's level or the level gap
  ([rage.md](mechanics/rage.md#bear-logs-of-23-and-24-sep-)), which at 60 against a level-63
  boss gives about 10.5 or 16.5 instead of 10 [?]. The default stays 10.
- **Test:** repeat [B1](#b1-rage-per-landed-white-hit) and
  [B9](#b9-rage-from-damage-taken-confirm-the-logged-fit) at 60 with level-60 weapons and hits,
  including boss or elite hits of several thousand before armor, and a level-60 tank hit by a
  level-63 mob.
- **Samples:** as in B1 and B9.
- **Changes:** the level-60 rage constants.
- **Docs:** [rage OQ 1, OQ 2](mechanics/rage.md#open-questions);
  [system-changes OQ 5](mechanics/forever-system-changes.md#open-questions)

#### C3. Flurry: 25% or 30%?
**High · M2 (Fury tier 6)**
- **Assumes:** 25% at 5/5 (tooltip and rank curve) [F]; the buff row still has base 30 [?].
  Heroic Strike and Cleave swings don't consume Flurry charges [F data: the buff's proc mask is
  auto attacks only]; for Classic Era the pre-SoD WarriorSim says they do [?].
- **Test:** swing interval with Flurry up vs down; count the hasted swings after a crit while
  Heroic Strike is queued on every swing.
- **Samples:** ≥100 swings with Flurry up; ≥20 crits with Heroic Strike queued.
- **Changes:** Fury haste (~2–3% DPS).
- **Docs:** [warrior §2.5](classes/warrior.md#25-crits-impale-flurry-deep-wounds),
  [Q7](classes/warrior.md#9-open-questions)

#### C4. Raid-boss armor and creature types
**High · M2**
- **Assumes:** 3,731 armor (Classic raid-boss value; Onyxia assumed the same) [C/?]; creature
  type none by default, and the Barrow Deeps and Hyjal Summit bosses' types unknown [?]; which
  bosses are Giants or Dragonkin for Spearing Strike [?].
- **Test:** first raid logs: damage of a fixed-damage physical ability (e.g. Swipe) solves for
  armor; read creature types from boss tooltips.
- **Samples:** ≥20 hits per boss.
- **Changes:** boss armor presets and creature-type defaults.
- **Docs:** [encounter §2](mechanics/encounter.md#2-boss-armor),
  [§6](mechanics/encounter.md#6-creature-type-biome-and-zone-forever),
  [OQ 1, 5](mechanics/encounter.md#open-questions);
  [warrior Q13](classes/warrior.md#9-open-questions)

#### C5. Raid-boss melee and incoming damage
**High · M3**
- **Assumes:** 2.0 s boss swings for 4,500–5,500 pre-armor damage [?]; DPS players take no
  damage (so no Enrage or damage rage for DPS) [?].
- **Test:** raid logs: boss swing interval and damage on tanks (before and after mitigation);
  damage events per minute on DPS warriors.
- **Samples:** ≥100 boss swings per boss.
- **Changes:** tank rage and TPS; Fury Enrage uptime.
- **Docs:** [encounter §5](mechanics/encounter.md#5-boss-melee-tank-modeling),
  [OQ 1, 3](mechanics/encounter.md#open-questions);
  [warrior Q8](classes/warrior.md#9-open-questions)

#### C6. Warrior threat at max rank
**High · M3**
- **Assumes:** Classic values for the trainer's top ranks at 60 (D36: no Ahn'Qiraj book's rank) [?]:
  Heroic Strike r8 + 145, Revenge r5 2.25 × dmg + 243, Thunder Clap, Battle Shout r6, Demoralizing
  Shout r5; and Shield Slam dmg + **254** [?] (Classic Era's rank 4 [C], Magey's 1.13.6 and
  Resultsmayvary's 1.13.2 measurements). Forever's tooltip says "very high" where Classic's said "high", and no
  allowed source gives the extra a value, so it adds 0 [?]
  ([wording table](mechanics/threat.md#threat-wording-table)).
- **Test:** as [B13](#b13-warrior-ability-threat-at-low-ranks) at 60 with max ranks. Shield Slam
  first: in Defensive Stance with Defiance 3/3 and a shield, threat ÷ 1.495 − its logged damage =
  the bonus.
- **Samples:** ≥8 casts per ability.
- **Changes:** Prot TPS per ability. Shield Slam is about a quarter of the default Protection
  warrior's threat, so its bonus moves the headline most: the + 475 the sim assumed until 2026-09-26
  (254 scaled by the damage ratio, removed by D37) gave the default 5.0% more TPS (removing it cost 4.75%). It decides no
  preset: off, Balanced loses 18.3% of its TPS ([warrior Q34](classes/warrior.md#9-open-questions)).
- **Docs:** [threat OQ 1](mechanics/threat.md#open-questions);
  [warrior §5.4](classes/warrior.md#54-protection-tps)

#### C7. Cat and bear form base damage
**High · M4**
- **Assumes:** cat 43.84–65.76 per 1.0 s swing and Dire Bear 109.6–164.4 per 2.5 s swing at 60
  [? secondary only]; the ±20% spread [F data].
- **Test:** at 60, the character-sheet damage range in Cat and Dire Bear Form minus AP/14 ×
  speed.
- **Samples:** sheet reads at two AP values.
- **Changes:** every feral white hit and ability (examples 2–4 and 12–15 in the druid doc).
- **Docs:** [druid §2.1](classes/druid.md#21-form-attacks-swing-timer-and-damage),
  [Q5](classes/druid.md#10-open-questions)

#### C8. Lacerate
**High · M4 (rank 1 at 42)**
- **Assumes:** 15 per 3 s per stack, up to 5 stacks, plus an immediate hit of
  `0.10 × W_b × stacks already on the target` [?]; threat dmg × 1 plus, for the tooltip's "a high
  amount of threat", a flat 206 per landed application, Forever's Sunder Armor r5 client value at
  the same level by the wording table (D29; user decision, 2026-09-26; 261, Classic Era's rule,
  before build 1.60.1.70009) [?]. Season of Discovery's Lacerate, the same spell (Forever's rank 1 reuses its id), has
  Blizzard's 3.33 × damage on the hit and ticks: an allowed analog (D37), not adopted: the user kept 206 by the same-wording rule across tanks (D38).
- **Test:** apply 1 to 5 stacks, log hits and ticks, and read threat after each application.
- **Samples:** ≥10 full stack cycles.
- **Changes:** Lacerate damage and bear TPS.
- **Docs:** [druid §4.3](classes/druid.md#43-lacerate-r3-1235827),
  [Q15, Q16](classes/druid.md#10-open-questions);
  [threat OQ 4](mechanics/threat.md#open-questions)

#### C37. Ironfoe's proc chance and hands
**High · M2**
- **Assumes** [?]: Forever's equip aura 1301046 (`ProcChance` 6; "Attacks against Orcs are
  $s2 times as likely", `$s2` = 2; proc mask 0x14; 100 ms `ProcCategoryRecovery` [F client])
  procs **3%** of **Ironfoe's own** landed white and yellow hits against a non-Orc boss. Its text
  states no chance; the aura is otherwise a clone of Hand of Justice's 15600, so the chance is
  read as Hand of Justice's `${$h/3}%` is. The client doesn't settle the hands, so they're
  Classic Era's (doctrine §2). Its one hint is the mask's second word, 0x20: Hand of Justice
  lacks it, no Classic Era spell has it, and only eight Forever-new item procs carry it, two of
  whose texts say "Melee attacks with this weapon" [F client]: Adaptation 1253389, Dreadfrost
  Saber 1294939, Iceblade Hacker 1298413 ("with this weapon"), Warblade of Caer Darrow 1298500
  ("with this weapon"), Fury of Forgewright 1301046, Forge Blast 1312176, Holy Smite 1312330 and
  Lash of the Dark Rider 1315077. For the default Fury warrior, either hand's hits (the
  alternative to measure) would add about 2.7% DPS, and 6% on its own hits about 3.7%.
- **Test:** Ironfoe in the main hand and a slow one-hander in the off hand, on non-Orc mobs:
  count "Fury of Forgewright" procs (2 extra attacks) per landed hit of each hand; then the same
  against Orcs.
- **Samples:** ≥2,000 landed hits per hand.
- **Changes:** Ironfoe's chance and internal cooldown (the `ironfoe` rule-profile value) and its
  hands (the proc's `from`, `src/sim/effects/items.ts`); default Fury DPS.
- **Docs:** [damage §5.2, OQ 15](mechanics/damage-and-timing.md#52-ppm-vs-flat-chance-classic-era-examples)

### Medium

#### C9. Bloodthirst formula
**Medium · M2 (Fury tier 7)**
- **Assumes:** 0.35 × AP + 48 at rank 4 [F, tooltip and data agree].
- **Test:** average non-crit Bloodthirst at two AP values (with and without Battle Shout) vs a
  low-armor target.
- **Samples:** ≥30 non-crits per AP value.
- **Changes:** Fury's core ability.
- **Docs:** [warrior §3.1](classes/warrior.md#31-damage-abilities),
  [Q2](classes/warrior.md#9-open-questions)

#### C10. Slam and the swing timer
**Medium · M2**
- **Assumes:** without Improved Slam, Classic behaviour (no swings during the cast, both timers
  restart) [C]; with it, timers untouched [F tooltip; 1.60.1.70009's reads "no longer interrupts or
  delays your melee swing", and its data kept the cast and GCD cut and added −1.5 s a rank off the
  cooldown, now 18 s; so as far as the data goes it's answered, and what's left is in-game timing].
  A third-party Forever sim's notes say
  Slam pauses and resumes the timers [?, anecdotal, not adopted]. Slam pays its cost and starts
  its cooldown when the cast completes, and fails if a Heroic Strike swing during an Improved
  Slam cast left too little rage [?]; off-GCD actions (the Heroic Strike queue, Bloodrage,
  racials) work during the cast [?]; haste doesn't shorten the cast [?].
- **Test:** swing timestamps around Slam casts in the combat log, with and without Improved Slam;
  when Slam's cooldown starts (cast start or end); with Improved Slam and little rage, a Heroic
  Strike swing during the cast; the cast time with Berserking or Flurry up.
- **Samples:** ≥20 Slams each.
- **Changes:** Arms Slam value.
- **Docs:** [warrior §3.1](classes/warrior.md#31-damage-abilities),
  [Q3](classes/warrior.md#9-open-questions);
  [damage §3.3](mechanics/damage-and-timing.md#33-swing-reset-rules)

#### C11. Windfury Totem
**Medium · M2**
- **Assumes:** a party aura rather than a weapon enchant, so a main-hand stone coexists [?];
  20% per main-hand hit, +246 AP [F]; it can't proc itself or twice in one chain [C, Magey's
  2019 text; every doc agrees], which the sim applies to every extra-attack source over a root
  swing's whole chain, so two sources procced by one swing can't proc each other [?]; the
  Forever client gives Windfury Totem's party aura 10612 (a proc-trigger aura, aura 42, since
  1.60.1.70009) a
  **100 ms internal cooldown** (`ProcCategoryRecovery` 100) [F client `SpellAuraOptions`, found
  by the client-data check], which `forever` now models; whether the server applies it [?]; the
  SoD-era 1.5 s stays refused (forbidden source); the proc's +246 AP aura 10610 has 2 charges
  and lasts 1 s [F client], so does a second attack inside that second also get the AP [?];
  procs from feral attacks [?]. ✅ Twisting with Grace of Air is settled: it doesn't work, since the
  1.60.1.70009 notes make Windfury, Grace of Air and Tranquil Air exclusive even across shamans
  (buffs `totem:air`).
- **Test:** a main-hand stone next to a Windfury Totem (does the enchant stay?); log Windfury
  procs, chains and the minimum gap between procs (expect ≥ 100 ms); compare the damage of an
  instant attack pressed right after a Windfury extra attack with the same attack without one;
  repeat in cat and bear form.
- **Samples:** ≥500 swings.
- **Changes:** the Windfury model and the main-hand stone default.
- **Docs:** [buffs § Windfury](mechanics/buffs-debuffs-consumables.md#windfury-totem),
  [buffs OQ 3](mechanics/buffs-debuffs-consumables.md#open-questions);
  [damage §5.4](mechanics/damage-and-timing.md#54-extra-attacks-and-chaining),
  [OQ 9](mechanics/damage-and-timing.md#open-questions);
  [warrior §2.7](classes/warrior.md#27-weaponmaster-extra-attacks-and-windfury),
  [Q27](classes/warrior.md#9-open-questions)

#### C12. New elixirs and Frenzy potions
**Medium · M2**
- **Assumes:** the new elixirs (Grizzly, Ferocity, Cunning, Phalanx, Strength, Fortitude,
  Greater Fortitude) default off until their stacking groups are known [?]; ✅ Frenzy potions give
  attack power and ranged attack power, +80 / +56 / +40 (auras 99 and 124): 1.60.1.70009 settled
  the tooltip-versus-data split (it was flat physical damage, aura 13) [F client `SpellEffect`];
  they **share the 120 s potion
  cooldown**: their spells 1251937/1251938/1251940 sit in cooldown category 4, although their
  item effects carry no category [F client `SpellCategories`, corrected by the client-data
  check (D13); whether the server enforces it ?].
- **Test:** drink each pair and watch the buffs; drink a Frenzy potion after another potion to
  confirm the shared cooldown.
- **Samples:** one per pair.
- **Changes:** consumable presets.
- **Docs:** [buffs §3.2](mechanics/buffs-debuffs-consumables.md#32-elixirs),
  [§3.5](mechanics/buffs-debuffs-consumables.md#35-potions-and-runes),
  [buffs OQ 4, 7](mechanics/buffs-debuffs-consumables.md#open-questions)

#### C13. Rank availability at launch
**Medium · M2**
- **Resolved in part by [D36](decisions.md#d36-what-we-take-from-warriorsim-2026-09-25)** (user
  decision): Ahn'Qiraj comes long after launch, so no class has an Ahn'Qiraj book's rank: Heroic
  Strike r8, Battle Shout r6, Revenge r5, and every other class's and buff's rank below its AQ book
  (the class docs' rank sections; [buffs §1.1](mechanics/buffs-debuffs-consumables.md#11-attack-power-stats-and-crit)).
  Whether a trainer teaches the Greater Blessings' rank 2 without the libram is
  [buffs OQ 22](mechanics/buffs-debuffs-consumables.md#open-questions).
- **Assumes:** the trainer teaches Primal Bite ranks 2–4 [?]; Ferocious Bite r5 is there at launch,
  from the trainer or its Upper Blackrock Spire book (not an Ahn'Qiraj one, so D36 keeps it) [?].
- **Test:** trainer windows at 36, 48, 56 and 60, and the launch patch notes.
- **Samples:** one check per rank.
- **Changes:** ability values at 60.
- **Docs:** [warrior Q25](classes/warrior.md#9-open-questions);
  [druid Q17](classes/druid.md#10-open-questions)

#### C14. Content availability
**Medium · M2**
- **Assumes:** Zul'Gurub enchants and Spirit of Zanza, the Scourge shoulder enchants, and the
  SoD-origin enchants with no recipe item (Grand Crusader, Grand Inquisitor, Living Stats, the
  +9 bracer Agility, Minor Haste) may not exist [?]; Rivenspike has no Forever row yet [?].
- **Test:** check content, trainers and drops at 60; read Rivenspike's debuff once it drops.
- **Samples:** one check each.
- **Changes:** enchant defaults (e.g. Zandalar Signet of Might) and availability flags.
- **Docs:** [buffs OQ 10, 11](mechanics/buffs-debuffs-consumables.md#open-questions)

#### C15. Default fight length
**Medium · M2**
- **Assumes:** 180 s ± 10% [?].
- **Test:** the guild's first Forever kill times per boss.
- **Samples:** every early kill.
- **Changes:** the default fight length.
- **Docs:** [encounter §3](mechanics/encounter.md#3-fight-length-and-execute-phase),
  [OQ 2](mechanics/encounter.md#open-questions)

#### C16. Expertise in combat
**Medium · M3 (tanks; under 1% for DPS)**
- **Assumes:** hypothesis A, E percentage points off the boss's dodge and parry, at 10 rating
  per 1% [?]; every doc applies it in `forever` per
  [D12](decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22),
  with the `unmeasuredRatings` switch; which items carry it (foreverchanges and wowsims
  disagree) [?].
- **Test:** Adaptive Combat Assistant (+20 rating, 2%; it requires level 60) on and off: dodges
  from behind and parries from the front vs mobs three levels higher. It can start under the cap
  (Route B) with the Dwarven Tree Chopper (+6 rating; item level 20, no level requirement in its
  Forever tooltip), which predicts −0.6 points and so needs about four times the sample; the
  Servomechanic Sledgehammer (+10) needs Engineering 100.
- **Samples:** ≥3,000 swings per state and position.
- **Changes:** the expertise model.
- **Docs:** [combat-tables §7](mechanics/combat-tables.md#7-expertise-forever),
  [OQ 15, 16](mechanics/combat-tables.md#open-questions);
  [stats OQ-14](mechanics/character-stats.md#oq-14-combat-ratings-in-play);
  [items § ratings](data/items.md#forevers-ratings-f-with-open-questions)

#### C17. Ferocious Bite
**Medium · M4**
- **Assumes:** Bite adds `0.03 × CP × AP` [? secondary only]; under Clearcasting it still
  converts all Energy [?].
- **Test:** 5-point Bites at two AP levels; a Bite with a Clearcasting proc at high Energy.
- **Samples:** ≥20 non-crit Bites per AP level.
- **Changes:** Bite damage and the finisher default.
- **Docs:** [druid §3.5](classes/druid.md#35-ferocious-bite-r5-31018),
  [Q3, Q20](classes/druid.md#10-open-questions)

#### C18. Rend and Tear scope
**Medium · M4 (tier 6)**
- **Assumes:** +10% on abilities (not white hits or ticks) against a target with any bleed,
  including other players' Deep Wounds [?].
- **Test:** Shred damage with and without a warrior's Rend on the target; white-hit averages;
  Rip ticks.
- **Samples:** ≥30 non-crit hits per state.
- **Changes:** cat DPS and the Rip condition.
- **Docs:** [druid §2.3](classes/druid.md#23-crit-hit-and-damage-modifiers-from-druid-sources-level-60),
  [Q9](classes/druid.md#10-open-questions)

#### C19. Wolfshead Helm and King of the Jungle
**Medium · M4**
- **Assumes:** Wolfshead's +20 Energy from Tiger's Fury stacks with King of the Jungle's 60 [F
  tooltip].
- **Test:** press Tiger's Fury at 0 Energy with the helm and 3/3 King of the Jungle.
- **Samples:** 3 presses.
- **Changes:** Wolfshead's value.
- **Docs:** [druid §3.6](classes/druid.md#36-tigers-fury-5217),
  [Q14](classes/druid.md#10-open-questions)

#### C20. Holy Shield
**Medium · M5 (tier 7)**
- **Assumes:** block-damage threat ×1.2, multiplicative with Righteous Fury (×1.92 with its +60%
  since 1.60.1.70009; ×2.28 at the +90% before) [?]; the additive alternative is ×1.8 (×2.1 before);
  whether block damage can miss or crit [?].
- **Test:** threat macro around Holy Shield block hits with Righteous Fury; log misses and crits.
- **Samples:** ≥20 blocks.
- **Changes:** the top Prot paladin threat source.
- **Docs:** [paladin § threat](classes/paladin.md#threat-paladin-specific),
  [OQ 16, 22](classes/paladin.md#open-questions);
  [threat OQ 5](mechanics/threat.md#open-questions)

#### C21. Undead paladin and Skyborne sheets
**Medium · M5**
- **Assumes:** Undead paladin = paladin class row + Undead offset [C, derived]; Skyborne base
  attributes unknown [?], so every class a Skyborne can be uses its class row with neutral race
  offsets, a D24 placeholder (the warrior and hunter since
  [D36](decisions.md#d36-what-we-take-from-warriorsim-2026-09-25)). 5 Strength is about 0.4% of
  Fury DPS; 5 Agility about 0.5% of Marksmanship DPS.
- **Test:** standard naked sheets at 60, including a Skyborne warrior and hunter.
- **Samples:** one sheet per race/class.
- **Changes:** the Horde paladin default and the Skyborne placeholder rows.
- **Docs:** [stats OQ-1](mechanics/character-stats.md#oq-1-paladin-druid-and-skyborne-base-attributes)

#### C35. Fallback items with Forever effects
**Medium · M2**
- **Assumes** [?]: for the 745 items with no Forever `ItemSparse` row, stats are Classic Era's
  (D6) and effects the Forever client's: the item effects Forever links to the item, and every
  spell read from Forever; a Classic Era stat spell stays unless Forever's effects give that stat
  ([items.md](data/items.md#effects-of-fallback-items)). Where Forever moved a bonus into the
  missing `ItemSparse` row it is kept from Classic Era (Hand of Justice's +20 attack power);
  where it added an effect of another kind next to one both are kept (Savage Gladiator Chain's
  +2% crit and Forever's fear resistance); where it re-pointed the item effect row itself to
  another spell, Classic Era's goes (Mark of Tyranny's +1% dodge, now a health use). The Fury
  and Arms defaults' Blackhand's Breadth reads +1% crit (Forever's spell 1318954) with
  Forever's new use.
- **Test:** read these items' tooltips in game (an item link is enough; the server sends the
  row): Blackhand's Breadth, Hand of Justice, Savage Gladiator Chain, Mark of Tyranny and
  Counterattack Lodestone. Re-scrape when a build ships their rows.
- **Samples:** one read per item.
- **Changes:** fallback items' stats and effects; the Fury and Arms default trinket (about 1%
  DPS per 1% crit).
- **Docs:** [items.md § Effects of fallback items, Caveats](data/items.md#caveats)

### Low

#### C22. Weapon skill and expertise on Forever pre-raid gear
**Low · M2**
- **Assumes:** items give less weapon skill (Edgemaster's +1) [F]; most Classic weapon-skill
  pre-raid items have no Forever data yet [F].
- **Test:** re-scrape the item snapshot as the server sends items (not a guild test); spot-check
  tooltips in game.
- **Samples:** —
- **Changes:** available skill and expertise on gear.
- **Docs:** [combat-tables OQ 15, 19](mechanics/combat-tables.md#open-questions)

#### C23. Biome of each raid
**Low · M2**
- **Assumes:** unknown; `biome` defaults to none [?].
- **Test:** raid zone information and biome-gated effects in game.
- **Samples:** one check per raid.
- **Changes:** biome presets.
- **Docs:** [encounter OQ 7](mechanics/encounter.md#open-questions)

#### C24. Recklessness, Retaliation and Shield Wall cooldowns
**Low · M2 (no DPS effect)**
- **Assumes:** independent in Forever (the data gives Recklessness its own recovery) [?].
- **Test:** use one and check the others' cooldowns.
- **Samples:** one check.
- **Changes:** nothing for DPS.
- **Docs:** [warrior Q26](classes/warrior.md#9-open-questions)

#### C25. Berserker Rage multiplier (Forever)
**Low · M3**
- **Assumes:** ×1.0 on `10 × D_pre / max health` [?]. A Forever sim uses ×2 as its own guess
  (wowsims/forever f9f9f21883); not adopted.
- **Test:** as [A6](#a6-berserker-rage-and-rage-from-damage-taken) on Forever, logging each
  hit's unmitigated amount.
- **Samples:** ≥30 hits per state.
- **Changes:** Forever damage-taken rage with Berserker Rage.
- **Docs:** [rage OQ 5](mechanics/rage.md#open-questions);
  [warrior Q20](classes/warrior.md#9-open-questions)

#### C26. Boss "cannot parry or block" flags
**Low · M3**
- **Assumes:** every boss can dodge, parry and block [?].
- **Test:** raid logs: parries and blocks of the tank's swings from the front.
- **Samples:** ≥500 tank swings per boss.
- **Changes:** per-boss encounter toggles.
- **Docs:** [combat-tables OQ 11](mechanics/combat-tables.md#open-questions);
  [encounter OQ 6](mechanics/encounter.md#open-questions)

#### C27. Demoralizing Shout and Roar level scaling
**Low · M3**
- **Assumes:** Shout r5 is **−204** at 60 [F]: the level-60 tooltip, −196 plus −1.4 per level
  from 54 (−204.4, shown as 204; review finding L9). Roar r5 is **−204** too: −193 plus −1.4 per
  level from 52 (−204.2). The −196 and −193 the docs used before were the base values, rendered
  without the term. The sim's Demoralizing Shout debuff uses −204 (`classicEra`: −146, which
  scales the same way). Whether the debuff applies the tooltip's value in combat is [?].
- ✅ **Client half resolved** ([client.md](data/client.md#doc-claims-checked-against-the-raw-client),
  row C27): `SpellEffect` has −196 / −193 with −1.4 per level, and `SpellLevels` runs 54–64 /
  52–62, so `MaxLevel` doesn't cap the term below 60 [F client]. Only the server's behaviour is
  left.
- **Test:** **Route C**: at 60, read the AP reduction in the debuff's tooltip on the target.
- **Samples:** one read each.
- **Changes:** boss AP reduction (tank damage taken only).
- **Docs:** [buffs §4.2](mechanics/buffs-debuffs-consumables.md#42-other-debuffs),
  [buffs OQ 19](mechanics/buffs-debuffs-consumables.md#open-questions);
  [warrior Q22](classes/warrior.md#9-open-questions);
  [druid §1.1](classes/druid.md#11-spells), [Q32](classes/druid.md#10-open-questions)

#### C28. Berserk and Primal Fury
**Low · M4 (tier 7)**
- **Assumes:** Berserk's forced crits trigger Blood Frenzy (Primal Fury until 1.60.1.70009), so each landed builder gives 2 combo
  points [?].
- **Test:** Shred under Berserk and count combo points.
- **Samples:** ≥10 Shreds.
- **Changes:** Berserk's combo-point gain.
- **Docs:** [druid Q8](classes/druid.md#10-open-questions)

#### C29. Dire Bear armor
**Low · M4**
- **Assumes:** as [B63](#b63-bear-armor-and-dodge-talents), for Dire Bear's +360% auras [?].
- **Test:** as B63 in Dire Bear Form.
- **Samples:** sheet reads.
- **Changes:** Dire Bear armor.
- **Docs:** [stats OQ-8](mechanics/character-stats.md#oq-8-bear-armor-multipliers-and-thick-hide);
  [druid Q19](classes/druid.md#10-open-questions)

#### C30. Spell miss floor
**Low · M5**
- **Assumes:** 0% miss at 17% spell hit [F client strings; ? in combat]; Classic keeps a 1%
  floor.
- **Test:** a character with 17% spell hit vs level-63 targets; count spell misses.
- **Samples:** ≥2,000 spells.
- **Changes:** the spell-miss floor.
- **Docs:** [combat-tables §9](mechanics/combat-tables.md#9-spell-hit-and-crit-generic),
  [OQ 7](mechanics/combat-tables.md#open-questions)

#### C31. Hammer of the Righteous
**Low · M5 (trained at 40)**
- **Assumes:** the target and up to 3 more; "weapon DPS" excludes AP [?]; full melee table [?];
  no spell-power coefficient; any flat threat bonus unknown [?].
- **Test:** Hammer of the Righteous on 5 mobs at two AP values; threat macro.
- **Samples:** ≥20 casts.
- **Changes:** Prot AoE option.
- **Docs:** [paladin § other abilities](classes/paladin.md#other-abilities),
  [OQ 11](classes/paladin.md#open-questions); [threat OQ 6](mechanics/threat.md#open-questions)

#### C32. Seal of the Crusader AP at 60
**Low · M5**
- **Assumes:** 306 + 2.4 per level from 52 → 325 at 60 [?].
- **Test:** sheet AP with Seal of the Crusader at 60.
- **Samples:** one read.
- **Changes:** SotC's AP (only used to judge).
- **Docs:** [paladin OQ 17](classes/paladin.md#open-questions)

#### C33. Diamond Flask in Forever
**Low · M2**
- **Assumes:** nothing; the sim doesn't use it [?]. Forever's client replaced Classic Era's
  +75 Strength for 60 s with "CHUG! CHUG! CHUG! CHUG!" (363881): a 5 s channel healing 224 a
  second, "If finished, gain $s2 Strength for $d" ($s2 = 20, $d = 5 s), 6 min cooldown, 60 s
  shared with runes. The item also gained an equip dummy (1318073) with no description. It has
  no Forever `ItemSparse` row, so its stats are Classic Era's; since review finding L5 its use
  line was Forever's ([items.md](data/items.md#effects-of-fallback-items)). As a heal it's no
  longer a damage trinket, so it's off the Fury and Arms pre-raid lists (the guides' rank 3),
  and with them out of the item pool, which it was in only for those lists.
- **Test:** read the tooltip; use it, and watch Strength on the character sheet during the
  channel, after it, and with the flask merely equipped.
- **Samples:** one use, sheet read every second for 10 s.
- **Changes:** whether it goes back on the pre-raid lists as a damage trinket, and its use in
  the rotation.
- **Docs:** [warrior §5.2 notes, Q30](classes/warrior.md#9-open-questions)

#### C34. Weakness Analyzer: cooldown and what ends it
**Low · M2**
- **Assumes:** a 90 s cooldown (the client's item effect; an older tooltip said 2 min, maybe a
  hotfix) [?], and the +5% crit ends on the first white or special crit you deal, including
  the crit it helped make [?].
- **Test:** its cooldown after a use; with it up, log swings and specials until the buff drops,
  and note whether it drops on the first crit and on a crit from a weapon proc or extra attack.
- **Samples:** 3 uses for the cooldown; ≥10 uses for what ends it.
- **Changes:** the trinket's uses per fight and its value.
- **Docs:** [warrior §5.2 notes, Q31](classes/warrior.md#9-open-questions)

#### C36. Toughness and bonus armor
**Low · M3**
- **Assumes** [?]: Toughness multiplies an item's base armor, not Forever's stat-50 bonus armor;
  a Classic Era fallback item's stored armor is multiplied whole.
- **Test:** with Toughness 5/5, note the sheet's armor; equip a Forever item with bonus armor
  (level-60 gear, PvP pieces among them) and read it again: `base × 1.10 + bonus` or
  `(base + bonus) × 1.10`.
- **Samples:** one sheet per item; two items.
- **Changes:** tank armor.
- **Docs:** [stats OQ-15](mechanics/character-stats.md#oq-15-toughness-and-bonus-armor),
  [items § armor](data/items.md#stats-armor-and-block-value)

---

## Route D: wago.tools lookups in a browser

✅ **Closed 2026-09-22: every row is resolved from client data.** These are values the research
agents read from wago.tools DB2 tables before the project learned that its `robots.txt` forbids
automated access ([D9](decisions.md#d9-wagotools-is-cited-never-crawled-2026-09-22)), listed
here for a person to confirm in a browser. The client-data pipeline now reads the same raw
client files through the documented wago.tools API
([D16](decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)) and checked every
row against build 1.60.1.69913 (and 1.15.9.69722 for the Classic halves). **18 rows match as
written; 5 match only in part** (D9, D12, D13, D18, D19), and the owning docs now carry the
client's value. The claim-by-claim results are in
[client.md](data/client.md#doc-claims-checked-against-the-raw-client). The owning docs tag
these values [F] client and have dropped their "confirm on wago.tools" notes (‡ in the buffs
doc).

What raw client files can't settle stays in Routes B and C: server-side behaviour (PPM rates,
what a dummy effect does, whether the server honours an attribute) and anything a hotfix changed
([client.md § hotfix caveat](data/client.md#hotfix-caveat)). The partial matches added checks
to [B41](#b41-soc-and-judgement-avoidance-partial-resists-on-melee-class-holy) (JoC's miss, which the beta logs later showed),
[C11](#c11-windfury-totem) (Windfury's 100 ms internal cooldown) and
[C12](#c12-new-elixirs-and-frenzy-potions) (Frenzy potions share the potion cooldown). For a
new build, re-run `npm run scrape:client -- --claims` instead of checking in a browser.

| # | What was looked up | Table · build | Value the docs assumed | Impact · M | Docs | Result |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | PPM rows and proc links | `SpellProcsPerMinute` · both builds; `SpellAuraOptions` · Forever | IDs 454–463 = 1–10 PPM in both; new ID 479 = 2.3 PPM in Forever only; no `SpellAuraOptions` row references a PPM ID | High · M2 | [damage §5.1](mechanics/damage-and-timing.md#51-ppm-formula), [system-changes §2](mechanics/forever-system-changes.md#2-combat-rules) | ✅ confirmed from client data (every PPM row has Flags 1; no proc references one, so PPM rates are server-side and keep their [C]/[?] tags), see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D2 | Warrior DPS core | `SpellEffect`, `SpellAuraOptions`, `SpellMisc`, `TraitDefinitionEffectPoints` + `CurvePoint` · Forever | Bloodthirst 23894 = 0.35 × AP + 48; Flurry buff 12966 base 30 vs talent curve 5–25, 15,000 ms; Dual Wield Spec curves 5–25 / 20–100 / 2–10 and a hit aura (54) with no hand restriction; Unbridled Wrath curve 12–60, energize 12964 = 10 tenths, proc mask auto attack only; Weaponmaster sword 12281 `ProcCategoryRecovery` 200 (both builds), axe 12700 aura 290 | High · M2 | [warrior §2.3–§2.7](classes/warrior.md#2-warrior-mechanics) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D3 | Rage energize amounts (tenths) | `SpellEffect` · both builds | Bloodrage 2687 = 100 and 29131 = 10 per 1,000 ms for 10 s; Charge 11578 = 150; Mighty Rage Potion 17528 = 600, variance 0.5, 20 s; Shield Specialization 1310318 = 50 (Classic 23602 = 10); Master of Defense → 23602 = 50; Enrage 5229 = 100 + 20/s; Furor 17057 = 100; Primal Fury 16959 = 50; Natural Reaction 417053 = 50; Heroic Strike 25286 +157 | High · M2 | [rage § sources](mechanics/rage.md#warrior-rage-sources-and-sinks), [§ bear](mechanics/rage.md#bear-druid-rage) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D4 | Sunder Armor threat effect (63) by rank | `SpellEffect` · Forever (Classic has none) | r1 34, r2 75, r3 117, r4 158, r5 206 (11597), no attack power coefficient (1.60.1.70009; 1 / 405 / 608 / 810 / 1013 in 1.60.1.69913) | High · M3 | [threat § warrior](mechanics/threat.md#warrior), [warrior Q1](classes/warrior.md#9-open-questions) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D5 | Base stat tables | `PlayerExpectedStat` · Forever (level 60; also the level you test at for B44) and 1.15.9 (absent); `ChrClasses` · both | BaseMana 1512 (paladin), 1244 (druid); CritPerAgility 0.0005 / 0.000506 / 0.0005; SpellCritPerIntellect 0.000167; unnamed columns 10 and 287; AttackPowerPerStrength 2, AttackPowerPerAgility 0, ArmorTypeMask 127 / 2303 / 2343 (all zero in 1.15.9) | High · M4 | [stats OQ-13](mechanics/character-stats.md#oq-13-confirm-wagotools-values-in-a-browser), [OQ-4](mechanics/character-stats.md#oq-4-paladin-intellect-to-spell-crit) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D6 | Cat damage values | `SpellEffect` · both; `SpellDescriptionVariables` · 1.15.9 | Shred 9830 flat 80 / 155%; Claw 9850 115 / 110%; Rake 9904 61 / 34 per 3 s; Rip 9896 15 + 25.5 per CP (Classic 16+1 / 28; SDV 865 `$ticks=6`, `$mult=1.0`); Ferocious Bite 31018 base 82, variance 0.7317, 147 per CP, dummy 270; Tiger's Fury 5217 15%, 30,000 ms, no GCD | High · M4 | [druid Q27](classes/druid.md#10-open-questions) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D7 | Ret damage coefficients | `SpellEffect` · Forever | SoC proc 20424 70% weapon, 0.29; JoC 20966 0.429; JoR 20286 0.5; SoR proc 25713 0.1; Holy Strike 10333 effect 121 (+93) then 31 (40%), 0.429; Consecration 1280349 12 + 27 at 0.095; Vengeance 20050 5 stacks, 30 s; 2HWS 20111 / 1HWS 20196 Physical only; Improved Seals 20224 spell masks | High · M5 | [paladin OQ 21](classes/paladin.md#open-questions), [§ DB2 links](classes/paladin.md#db2-links-per-spell) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D8 | Rage talent curves | `TraitDefinitionEffectPoints` + `CurvePoint` · Forever | Boundless Rage 1310236 aura 418 = 100/200/300; Improved Bloodrage 25/50; Shield Specialization 20…100; Master of Defense 50/100; Improved Tactical Mastery 12295 = 3/6/9/12/15 and Tactical Mastery 1310185 dummy 10; Furor 20…100; Natural Reaction 417051 | Medium · M2 | [rage § sources](mechanics/rage.md#warrior-rage-sources-and-sinks), [§ stances](mechanics/rage.md#stance-changes-and-tactical-mastery) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D9 | Warrior timing, procs and masks | `SpellCooldowns`, `SpellCategories`, `SpellShapeshift`, `SpellPower`, `SpellMisc`, `SpellAuraOptions`, `SpellClassOptions`, `SpellName` · Forever | Slam 18 s CD on every rank (15 s in 1.60.1.69913), Improved Slam −1.5 s a rank; stance swap 1.0 s shared, off GCD; racial `StartRecoveryTime` 0; Thunder Clap defense type 1, usable in Defensive; Overpower window 1282733 = 5,000 ms, second cost power type 4, no longer stacking (3 in 1.60.1.69913); Bloodthrill proc mask 0x14, main hand only, into 1282733 (4 in 1.60.1.69913); Enrage proc mask 0x222A8; Berserker Stance aura 290 (Classic 52) plus an empty aura 166; Recklessness has its own recovery; Improved Slam spells 1310196–1310200; Battle Shout 25289 base 139 + 0.6/level; weapon-damage effect types (121 normalized: Mortal Strike, Overpower, Whirlwind, Spearing Strike; 17: Heroic Strike, Cleave, Slam); Focused Rage and Impale class masks; Deep Wounds 12721 has no name; Victory Rush dummy 15. (Demoralizing Shout's per-level term: [C27](#c27-demoralizing-shout-and-roar-level-scaling)) | Medium · M2 | [warrior §2](classes/warrior.md#2-warrior-mechanics), [Q19, Q21, Q22](classes/warrior.md#9-open-questions) | ✅ resolved from client data, with one correction: **Stoneform is on the GCD** (`StartRecoveryTime` 1500); Blood Fury, Berserking, Elune's Light and Eureka! are 0. Deep Wounds 12721 is absent from the client altogether (the Forever bleed is 412609). See [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D10 | Racials | `SpellEffect`, `SpellMisc`, `SpellDuration`, `SpellPower` · Forever | 20597 (+2% crit, aura 290), 20598, 20572 (+10% AP, RAP, SP; 15 s), 20574, 1259719, 1259721, 20594, 20582, 1259799 (+10%, 15 s), 1259802, 1259813 (15 s), 1260189, 20550 (+5% HP; +1% hit via auras 54 and 55), 20554 (10 s, no cost), 20557 | Medium · M2 | [stats OQ-13](mechanics/character-stats.md#oq-13-confirm-wagotools-values-in-a-browser) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D11 | Race/class pairs | `CharBaseInfo`, `ChrRaces` · Forever | 56 pairs including Undead paladin; High Order Skyborne = race 95, Windshaper = 96 | Medium · M2 | [stats OQ-13](mechanics/character-stats.md#oq-13-confirm-wagotools-values-in-a-browser) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D12 | Windfury Totem | `SpellEffect`, `SpellAuraOptions` · both | Forever: 10612 is a party aura (a dummy in 1.60.1.69913, a proc-trigger aura, 42, in 1.60.1.70009), 20% proc into 10610 (+246 AP, 1 extra attack), 10611 absent. Classic: 10612 pulses 10611 every 5 s → enchant 564 (10 s) | Medium · M2 | [buffs OQ 17](mechanics/buffs-debuffs-consumables.md#open-questions) | ✅ Forever half confirmed; also found: 10612 has a 100 ms internal cooldown (`ProcCategoryRecovery` 100, see [C11](#c11-windfury-totem)). Classic half: 10612 pulses 10611 → enchant 564 as written, but Classic's `SpellItemEnchantment` has no duration column, so the 10 s is unverifiable there (Forever's row for 564 says 10 s). See [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D13 | Consumable mechanics | `ItemEffect`, `ItemXItemEffect`, `SpellEffect` · Forever | cooldown categories: elixirs 79, potions 4, runes 1153, explosives 24, Blasted Lands 103 (3,600 s); Frenzy potions aura 13 (school mask 1), no category; all-crit aura on Leader of the Pack 24932 and Mongoose 17538; Hyjal flasks = dummy + zero-valued aura | Medium · M2 | [buffs OQ 17](mechanics/buffs-debuffs-consumables.md#open-questions) | ✅ resolved from client data, with one correction: **Frenzy potions share the 120 s potion cooldown** (their spells are in category 4, though their item effects carry none; see [C12](#c12-new-elixirs-and-frenzy-potions)). The rest confirmed. See [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D14 | Periodic-crit flags and Deep Wounds (read so far only by wowsims/forever, a secondary source) | `SpellMisc` (Attributes[8], `PERIODIC_CAN_CRIT`), `SpellName`, `SpellEffect` · Forever | flag set on Rend 11574, Rake 9904, Rip 9896, Pounce bleed 9826 and Lacerate 1235827; not set on Deep Wounds and Consecration 20924 / 1280349; Forever's Deep Wounds bleed is spell 412609 (4 ticks, 3 s) | Medium · M2 | [damage §4](mechanics/damage-and-timing.md#4-dots-and-bleeds), [OQ 2](mechanics/damage-and-timing.md#open-questions); [warrior Q21](classes/warrior.md#9-open-questions); [druid Q21](classes/druid.md#10-open-questions) | ✅ confirmed from client data (412609: every 3,000 ms for 12,000 ms; the flags are client values, whether ticks crit in combat stays [B22](#b22-dots-periodic-crits-snapshots-and-refresh)), see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D15 | Threat auras | `SpellEffect` · both; `SpellClassOptions` · 1.15.9 | Battle 21156 −20, Berserker 7381 −20, Defensive 7376 +30; Bear Passive2 21178 +30; Cat 3025 −29; Defiance 12792 curve 5/10/15; Righteous Fury 25780 = 90 (Classic 59+1), school mask 2; Improved RF 20468 −2/−4/−6 (curve 82954); Instrument of Law 1311085 10/20; Iron Creed 1311034 aura 108, modifier 2, 5…25; Salvation 1038 / 25895 −30; Feral Instinct 16947 (Classic: aura 107 on mask 0x2000000) | Medium · M3 | [threat § stances](mechanics/threat.md#stance-and-form-modifiers), [§ Righteous Fury](mechanics/threat.md#paladin-righteous-fury) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D16 | Bear and form values | `SpellEffect`, `SpellShapeshiftForm`, `SpellShapeshift`, `SpellLevels`, `SpellCooldowns`, `SpellPower`, `SpellAuraOptions` · both | Primal Bite (Mangle until 1.60.1.70009) 407995 / 1238069 / 1238070 / 1238073 = 26/38/59/77, 20 rage, 6 s, shapeshift mask 144; Lacerate 1235827 15 per 3 s, 5 stacks; Cat 3025 12 + 2/level from 6, Faerie Fire cost −100%, CD +6,000, GCD −500, aura 598 = 100 on Agility; Dire Bear 9635; forms 1/5/8 = 1,000/2,500 ms, variance 0.4; cat `StartRecoveryTime` 1,000; Berserk 417141 masks, 180,000 ms; Omen of Clarity 16864 `ProcCategoryRecovery` 10,000; Cower 9892 −1200 − 1/level (Demoralizing Roar's per-level term: [C27](#c27-demoralizing-shout-and-roar-level-scaling)); `SpellLevels` 3025 base 6 (Classic 20), 1178 10–40, 9635 40–70 | Medium · M4 | [druid Q27](classes/druid.md#10-open-questions), [stats OQ-13](mechanics/character-stats.md#oq-13-confirm-wagotools-values-in-a-browser) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D17 | Feral talent auras | `SpellEffect`, `CurvePoint` · Forever | Genesis, Savage Fury, Predatory Instincts, Nature's Reach (auras 54/55), Nature's Majesty, Naturalist (aura 79) values and class masks; King of the Jungle 20/40/60 plus a hidden 5/10/15 | Medium · M4 | [druid Q7, Q27](classes/druid.md#10-open-questions) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D18 | Paladin attributes, cooldowns and procs | `SpellMisc`, `SpellCategories`, `SpellAuraOptions`, `SpellCooldowns`, `SpellEffect` · Forever | JoC/JoR/JotC melee class with No Active Defense / Always Hit (20966, 20968, 20286, 20303 for 40 s); SoR and SoF proc attributes (25713, 20418); SoC 1 s ICD (20920); seal proc masks 0x4 (damage) vs 0x14 (utility); Holy Strike and HotR category 2404 (12 s / 6 s); Holy Strike SpellMisc school 2; Holy Shield 20928 4 charges, 0.08; SoF 20418 35 at 0.1; JoF 20414 0.45; SotC 20308 +2.4/level; JoF scripted value 1607 + 42.3/level, coefficient 0.18 | Medium · M5 | [paladin OQ 17, 21](classes/paladin.md#open-questions), [threat OQ 6](mechanics/threat.md#open-questions) | ✅ resolved from client data, with one correction: **JoC's damage spell 20966 also has Always Hit**, so JoC can't miss; JoR 20286 and JoF 20414 can (see [B41](#b41-soc-and-judgement-avoidance-partial-resists-on-melee-class-holy)). The rest confirmed. See [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D19 | Item → buff spells | `ItemEffect`, `ItemXItemEffect` · Forever | the spell IDs after "→" in buffs §3; Distilled Firewater → 17038; Smoked Desert Dumplings → 1248401 (the Well Fed family) | Low · M2 | [buffs §3](mechanics/buffs-debuffs-consumables.md#3-consumables) | ✅ resolved from client data, with one correction: **Blessed Sunfruit 13810 casts 18124, which triggers the buff 18125**. The other 48 item → buff ids and both named items confirmed. See [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D20 | Enchant and minor consumable values | `SpellItemEnchantment`, `SpellEffect` · Forever | enchant 2618 → spell 19989 (+9 Agi); enchant 925 → spell 13930 (+2 defense); Rivenspike 17315 −100 per stack; Consecrated Sharpening Stone reads 99; Gift of Arthas 11374 +8; Blood Pact 11767 = 49 + 0.5/level; Trueshot Aura r5 = 50 (possible data bug) | Low · M2 | [buffs OQ 16, 17](mechanics/buffs-debuffs-consumables.md#open-questions) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D21 | World buffs (context only) | `SpellEffect` · both | 22888, 15366, 16609 are dummy auras in Forever | Low · M2 | [buffs §2](mechanics/buffs-debuffs-consumables.md#2-world-buffs-excluded) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D22 | Threat items and enchants | `SpellItemEnchantment`, `ItemEffect`, `ItemXItemEffect`, `SpellEffect` · Forever | Gloves – Threat 2613 → 25063 (+2); Cloak – Subtlety 2621 → 25070 (−2); Fetish of the Sand Reaver 26400 −70, 20 s, CD 180 s; Eye of Diminution 28862 −35, 20 s, CD 120 s; Increase/Decrease Threat All 01–04 linked to 278540, 279493, 278929, 278299, 14576, 13959, 18308; Enhanced Sunder 23561 | Low · M3 | [threat § global](mechanics/threat.md#global-threat-modifiers), [threat OQ 10](mechanics/threat.md#open-questions) | ✅ confirmed from client data (none of the seven threat items has an `ItemSparse` row in this build), see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |
| D23 | Taunts and forced attacks | `SpellEffect`, `SpellDuration` · Forever | Taunt 355 and Growl 6795: effect 114 + aura 11, 3 s; Mocking Blow 20560 aura 11, 6 s; Challenging Shout 1161 and Roar 5209 6 s | Low · M3 | [threat § taunts](mechanics/threat.md#taunts-and-forced-attacks) | ✅ confirmed from client data, see [client.md](data/client.md#doc-claims-checked-against-the-raw-client) |

---

## Not tests: settled by the sim or by a guild decision

- **Warrior build variants**: settled by the sim in W4 (warrior §6.1): "Fury + Precision" 15/36 is +0.44%
  over the popular 17/34, and WarriorSim's 13/38 (Precision and Improved Execute, no Impale) +3.5%, now the
  default; 17/34 stays a preset for short fights, and 15/36 is no longer one. **Arms base stance** (Battle vs Berserker): simulate once M2 and M3 exist
  ([warrior Q23, Q24](classes/warrior.md#9-open-questions)). The base stance's first run (M2.3c):
  Battle 630 DPS, Berserker 604, Berserker dancing for Rend and Overpower 631, so Battle stays
  the default.
- **Rip vs Bite as the default finisher**: settled by the sim for now. Rip wins in both profiles,
  with the default raid's bleed: Bite in its place loses 9.8% in `forever` and 4.3% in
  `classicEra`. Re-run it after B17, C17, C18, B38 and B22 change the inputs
  ([druid Q26](classes/druid.md#10-open-questions)).
- **Bear rotation thresholds** (Maul every swing, Swipe at 60+ spare rage, Enrage pre-pull only):
  sim sensitivity plus tank feedback ([druid Q31](classes/druid.md#10-open-questions)).
- **Default zone** (Hyjal Summit) for zone-gated flasks: a guild call
  ([encounter OQ 8](mechanics/encounter.md#open-questions)).
- **World buffs**: excluded by guild directive; revisit only if Blizzard says otherwise
  ([system-changes OQ 7](mechanics/forever-system-changes.md#open-questions);
  [buffs OQ 14](mechanics/buffs-debuffs-consumables.md#open-questions)).
- **Holiday consumables** (Dark Desire, Fire-toasted Bun): does the world-buff directive cover
  them? A guild call; both default off
  ([buffs OQ 18](mechanics/buffs-debuffs-consumables.md#open-questions)).
- **Reaction time and latency**: the rotation reacts in 0 ms, an ideal player; a modelling
  choice, not a game rule to measure. A setting can come if the guild wants its own
  ([damage OQ 14](mechanics/damage-and-timing.md#open-questions)).
