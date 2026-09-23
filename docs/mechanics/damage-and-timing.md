# Damage and timing

How much damage a landed attack does, and when attacks happen. Armor uses Classic Era's
formula (constant 5,500 for a level-60 attacker, capped at 75%). Forever adds two things: flat
**armor penetration** on gear, and, per its tooltip, **armor below 0 increases damage**. White
damage is weapon damage + AP/14 × weapon speed. Instant attacks that the Forever client marks as
*normalized* (Mortal Strike, Overpower, Whirlwind, Holy Strike, Spearing Strike) use 2.4/1.7/3.3
instead of the real speed. Swing timers, parry haste, extra attacks and the 1.5 s / 1.0 s GCD
work as in Classic Era, plus a new **haste** stat (10 rating = 1%, applied by hypothesis per
[D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)).
Forever's tooltip says **periodic effects can crit**, and the client puts the per-spell flag on
Rend, Rake, Rip, Pounce and Lacerate but not Deep Wounds [F]. Procs use Classic's PPM formula;
Forever's PPM table is Classic Era's plus one new 2.3 PPM row, and no proc links to it in the
client, so proc rates are server-side.

Status: researched 2026-09-22 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified
Client builds: Forever beta 1.60.1.69913 · Classic Era 1.15.9.69722

**Client data.** Values cited `[client] (Table, build)` come from the raw client files, fetched
through the wago.tools API and parsed by `scripts/scrape/client.mjs`
([client.md](../data/client.md)). The client check confirmed every value this doc had marked
for a browser check, and added one finding: Windfury Totem has a 100 ms internal cooldown
([§5.4](#54-extra-attacks-and-chaining)). Raw files lack server hotfixes and server scripts
such as PPM rates ([hotfix caveat](../data/client.md#hotfix-caveat)).

---

## What the sim needs

- **Armor:** `DR = A / (A + 5500)` for our level-60 attacker, capped at 0.75 and applied to
  physical direct damage only. Armor reductions subtract from armor. `classicEra` floors armor
  at 0; `forever` lets it go negative (damage > 100%), per the client tooltip [F text; ? in
  combat] ([§1](#1-armor)).
- **Weapon damage:** `uniform(min, max) + flatWeaponBonus + AP/14 × speed`, where `speed` is
  the real speed for white swings, on-next-swing attacks and Slam, and the normalized speed for
  abilities whose client effect is *normalized weapon damage* ([§2](#2-weapon-damage)).
- The **off-hand** deals 50% of everything (weapon + AP part), before talents.
- **Damage multipliers** multiply together. Crit is ×2.0 for melee and ranged, ×1.5 for
  spells. Glancing and crushing come from [combat-tables.md](combat-tables.md).
- **Swing timers** in integer ms: `speed / Π(1 + haste_i)`. On-next-swing attacks don't touch
  the timer. Casts with a cast time (Slam without Improved Slam) stop swings and restart both
  timers when they end.
  An extra attack swings the main hand immediately and restarts its timer ([§3](#3-swing-timers)).
- **Parry haste** on whoever parried: remove 40% of their swing speed from their remaining
  timer, but never below 20% remaining ([§3.4](#parry-haste)).
- **GCD:** 1.5 s; 1.0 s for cat-form abilities; not reduced by haste ([§3.5](#35-global-cooldown)).
- **No spell-batching model** ([§3.6](#36-server-tick-and-spell-batching)).
- **DoTs/bleeds:** fixed tick intervals from the client. Ticks never miss. Bleeds ignore armor.
  Both profiles snapshot AP and caster modifiers when the DoT is applied [?], except Deep
  Wounds, which recomputes each tick [C]. In `forever`, each tick can crit when the spell has
  the periodic-crit flag (flag [F], in combat [?]); in `classicEra` ticks never crit [C]
  ([§4](#4-dots-and-bleeds)).
- **Procs:** `chance = PPM × baseWeaponSpeed / 60` per landed hit, or a flat % per landed hit.
  Extra attacks can chain other procs, but Windfury can't proc off its own chain. `forever`
  applies the client's 100 ms Windfury internal cooldown; `classicEra` has none ([§5](#5-procs)).
- **New ratings** (haste, armor penetration) apply by hypothesis in `forever`, behind the
  `unmeasuredRatings: 'apply' | 'ignore'` switch
  ([D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)).

---

## 1. Armor

### 1.1 Formula

For physical damage dealt by an attacker of level `L` to a target with armor `A` [C]
([WarriorSim `getArmorReduction`, pre-SoD commit 180a3cc][ws-player]):

```
K  = 400 + 85 × L            // 5500 for L = 60 (player → boss); 5755 for L = 63 (boss → tank)
DR = clamp(A / (A + K), −∞, 0.75)
damage_after_armor = damage × (1 − DR)
```

- **Cap:** DR ≤ 75%, reached at `A = 3K`: 16,500 armor against a level-60 attacker, **17,265**
  against a level-63 boss [C]. The Forever tooltip confirms the 75% cap:
  `ARMOR_MAX_EFFECTIVENESS_TOOLTIP` "Damage reduction from Armor cannot exceed 75.00%" [F]
  ([gs][gs-forever]). A third-party Forever guide also quotes "around 17265 Armor against raid
  bosses" for the cap, which only works with the Classic formula [F reported]
  ([Warcraft Tavern stats][wt-stats]).
- **Confidence note.** The Forever character sheet computes armor reduction through the engine
  API `C_PaperDollInfo.GetArmorEffectiveness` ([ui PaperDollFrame][ui-pdf]), so the client Lua
  doesn't show the formula. A copy of the client's `ArmorMitigationByLvl` gametable in the
  wowsims/forever repo gives 1,059 at level 60 ([wf-armor]). But it runs to level 123 with
  retail values (7,765 at level 120), wowsims doesn't use it, and a constant of 1,059 would put
  a 3,731-armor boss at 78% reduction. We treat it as a retail leftover and **don't adopt it**.
  See [Open questions](#open-questions).

### 1.2 Armor-reduction debuffs and penetration

- Debuffs **add up** and are subtracted from the boss's armor:
  `A = baseArmor − Σ debuffs − armorPen` [C] ([WarriorSim][ws-player]). The values are owned by
  [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md). The examples here use Sunder
  Armor 450 × 5 = 2,250 [F], Faerie Fire rank 4 505 [F] and Curse of Recklessness rank 4 **505**
  with no AP bonus [F] (Classic Era: 640 [C]), all from the Forever spellbook tooltips on
  foreverchanges ([buffs §4.1](buffs-debuffs-consumables.md#41-armor-reduction)).
- **Floor.** `classicEra`: armor can't go below 0 [C] (WarriorSim clamps with
  `Math.max(…, 0)`, [ws-player]; a player on the Blizzard forum reached the same conclusion,
  [bf-armor]). `forever`: **negative armor is allowed and increases damage**. The evidence is the
  Forever client's own tooltip text, `ARMOR_PENETRATION_TOOLTIP`: "Reducing an enemies armor
  below 0 will increase your damage against them" [F text] ([gs][gs-forever]). It is checkable
  client data (the same string mirror as the combat-tables `forever` profile), but it isn't
  shown on foreverchanges.pro and nobody has measured it, so the combat effect is **[?]**
  ([Open questions](#open-questions)). With `A < 0`, `DR` is negative and `1 − DR > 1`.
- **Armor penetration** (Forever): a new item stat, "Your attacks pierce up to X Armor", shown
  on the sheet as a flat number ("Your Attacks ignore %d of your enemies Armor") [F text]
  ([gs][gs-forever]; example item: Leafre's Ring of Armor Piercing, "+50 Armor Penetration",
  [foreverchanges items][fc-items]). The `forever` profile treats it as flat armor removed from
  the target for the player's own attacks only [?], by hypothesis per
  [D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)
  (`unmeasuredRatings: 'ignore'` turns it off). Talent sources, such as Weaponmaster with a mace
  or staff, are owned by [classes/warrior.md](../classes/warrior.md).

### 1.3 What ignores armor

- All non-physical schools (Holy, Fire, Nature, …) [C].
- **Physical bleeds and other periodic physical damage**, e.g. Rend, Deep Wounds, and the
  Rake/Rip/Pounce ticks [C] (the pre-SoD WarriorSim applies no armor to Deep Wounds ticks,
  [ws-spell]; a Classic Era feral guide: "bleed damage is not discounted by armor",
  [wowhead Classic feral rotation][wh-feral]). The initial hit of Rake or Pounce is a normal
  physical hit and *is* mitigated.
- Direct physical hits (white swings, Heroic Strike, Shred, …) are mitigated.

---

## 2. Weapon damage

### 2.1 White swing

```
base = uniform(weaponMin, weaponMax) + flatWeaponBonus + AP / 14 × weaponSpeed
```

- AP/14 per second of weapon speed: `ATTACK_POWER_MAGIC_NUMBER = 14`; "Every 14 Attack Power
  adds 1 damage per second" [F] ([stats Lua][ui-stats]; [gs][gs-forever]); [C].
- `flatWeaponBonus` covers flat "+X weapon damage" effects (sharpening stones, some enchants).
  They add to the weapon roll before multipliers [C] ([WarriorSim `bonusdmg`][ws-weapon]).
- `weaponSpeed` is the item's base speed, not the hasted speed [C].
- Feral forms replace the weapon with the form's own damage and speed; see
  [classes/druid.md](../classes/druid.md).

### 2.2 Normalization for instant attacks

Normalized speeds [C] ([WarriorSim `normSpeed`][ws-weapon]; Marrow's Classic compendium uses
the same 2.4 and 3.3 for Whirlwind, [marrow-ab]):

| Weapon | Normalized speed |
| --- | --- |
| One-hand (not dagger) | 2.4 |
| Dagger | 1.7 |
| Two-hand | 3.3 |

Which abilities use them. The Forever client marks each weapon effect's type in `SpellEffect`:
effect **121** `NORMALIZED_WEAPON_DMG` is normalized, while **17** `WEAPON_DAMAGE_NOSCHOOL`,
**58** `WEAPON_DAMAGE` and **31** `WEAPON_PERCENT_DAMAGE` use the real speed. The effect types
are [F] [client] (SpellEffect, 1.60.1.69913); the class docs own the abilities
([warrior §3.1](../classes/warrior.md#31-damage-abilities),
[paladin § other abilities](../classes/paladin.md#other-abilities),
[druid §1.1](../classes/druid.md#11-spells)). The wowsims/forever spell data
([warrior][wf-spell-warrior], [paladin][wf-spell-paladin], [druid][wf-spell-druid]) reads the
same types and is corroboration only.

| Ability (top rank) | Effect type | Speed used | Tag |
| --- | --- | --- | --- |
| Mortal Strike (21553) | 121 | normalized | [F]; [C] same in Classic Era ([ws-spell]) |
| Overpower (11585) | 121 | normalized | [F]; [C] ([ws-spell]) |
| Whirlwind (1680) | 121 | normalized | [F]; [C] ([ws-spell]; [marrow-ab]) |
| Spearing Strike (1310222, new) | 121 + 31 | normalized | [F] |
| Holy Strike (10333, new baseline) | 121 + 31 | normalized | [F] |
| Heroic Strike (25286) | 17 | real | [F]; [C] ([ws-weapon]) |
| Cleave (20569) | 17 | real | [F]; [C] (it replaces the main-hand swing, [marrow-ab]) |
| Slam (11605) | 17 | real | [F] tooltip "weapon damage plus 87"; [C] "Slam is not speed normalized" ([marrow-ab]) |
| Cat/bear attacks (Shred, Claw, Rake, Ravage, Maul, …) | 58 (+31) | form weapon | [F]; see the druid doc |

Rule for the engine: read the effect type from the class data. Don't hard-code the list.

### 2.3 Off-hand

- An off-hand hit deals **50%** of its full damage (weapon roll + AP part + flat bonuses)
  before talents [C] ([WarriorSim `modifier = 0.5 × …`][ws-weapon]). Forever keeps the Dual
  Wield Specialization off-hand damage bonus [F]
  ([foreverchanges changes][fc-changes]). Talent values are in the warrior doc.
- The off-hand has its own swing timer, weapon skill, procs and enchant.

### 2.4 Damage-modifier stacking

- Percentage damage modifiers from **different effects multiply** [C] (WarriorSim multiplies
  each `dmgmod` source, [ws-player]). Example: two-handed spec 1.05 × a 20% cooldown 1.20 =
  1.26.
- Flat "damage done" bonuses add before multipliers. Flat "damage taken" bonuses on the target
  (e.g. Gift of Arthas' +8) add after them [?]. Only WarriorSim's post-SoD code has these terms
  (`moddmgdone`, `moddmgtaken`, [ws-post-weapon]); its pre-SoD commit has flat *weapon* damage
  only (§2.1). See [Open questions](#open-questions).
- Forever: no change found. Class docs note any talent that says "additively".

### 2.5 Crit, glancing, crushing and block multipliers

| Outcome | Multiplier | Tag / source |
| --- | --- | --- |
| Melee or ranged crit (player) | ×2.0 ("Melee critical strikes deal 100% increased damage") | [F] `STAT_CRIT_BONUS` ([gs][gs-forever]); [C] |
| Spell or heal crit | ×1.5 ("50% more effective") | [F] ([gs][gs-forever]); [C] |
| Periodic crit (Forever only) | ×2.0 physical / ×1.5 magic, raised like a direct crit by crit-bonus talents whose class mask covers the spell (Impale on Rend: ×2.2 at 2/2) | [?] (assumed to follow the school's multiplier; Impale's mask covers Rend [F] [client], [warrior §2.5](../classes/warrior.md#25-crits-impale-flurry-deep-wounds)) |
| Glancing | per [combat-tables §2.3](combat-tables.md#23-glancing-blows) | [F]/[C] |
| Creature crit on a player | ×2.0 | [F] tooltip `DEFAULT_STATDEFENSE_TOOLTIP` ([gs][gs-forever]); in combat [C] (unchanged) |
| Crushing blow | ×1.5 | [F] tooltip ([gs][gs-forever]); in combat [C] (unchanged) |
| Blocked hit on a player | − block value (min 0) | [F] tooltip `STAT_BLOCK_VALUE_FLAT_TOOLTIP` ([gs][gs-forever]); in combat [C] (unchanged) |

Talents that raise the crit *bonus* (Impale, Predatory Instincts, …) scale the "+100%" part.
Their values are in the class docs.

### 2.6 Order of operations (physical direct hit)

```
1. base      = weapon roll + flatWeaponBonus + AP/14 × (real or normalized speed) + ability flat bonus
2. ability % = base × abilityPercent            (e.g. 110% weapon damage)
3. mods      = × Π damage multipliers            (talents, buffs, target debuffs)
4. armor     = × (1 − DR)                        (§1; skipped for bleeds and magic)
5. outcome   = × 2.0 crit | × glance factor | × 1.0 hit
6. block     = − block value, floor 0            (tanks being hit; mob block value is 0, see combat-tables §2.4)
```

The game rounds to integers; the sim keeps floats (<0.1% effect).

---

## 3. Swing timers

### 3.1 Haste

- **Stacking:** `swing = baseSpeed / Π(1 + h_i)` over all active attack-speed increases
  (Flurry, trinkets, racials, …). They multiply rather than add [C]
  ([WarriorSim `stats.haste *= (1 + x/100)`][ws-player]).
- **Forever haste stat:** Haste Rating is on Forever gear ([foreverchanges items][fc-items];
  every haste-rating item in the snapshot needs level 60). Its conversion, **10 rating = 1%** at
  every level, is [?]: no foreverchanges tooltip shows a haste percentage, and the only source is
  the client `CombatRatings` gametable as extracted by wowsims ([wf-cr], secondary). Haste as a
  percentage exists in Forever: the Flask of Natural Swiftness (5% haste, Hyjal zones only) [F]
  ([fc-items]), the Skyborne racial Wind Blessed (+1% haste) [F]
  ([foreverchanges racials][fc-racials]), and set bonuses that "increase your attack speed and
  casting speed by X%" [F] ([fc-items]). Per
  [D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22),
  the `forever` profile applies rating haste as one more multiplicative factor
  `(1 + rating/1000)` [?]; `unmeasuredRatings: 'ignore'` drops it.
- **When haste changes mid-swing,** the new speed applies from the **next** swing. The current
  timer isn't rescaled [?] (this is WarriorSim's behaviour, [ws-weapon]; no Classic Era
  measurement found).
- The first swing on the pull: main hand at t = 0, off-hand at t = 0.5 × off-hand speed [?].
  This is a modelling choice that avoids artificial hand synchronisation, taken from
  WarriorSim ([ws-player]).

### 3.2 Attack-speed debuffs on the boss (tank modeling)

- Examples: Thunder Clap is **−20%** attack speed in Forever [F] (spell 11581 tooltip,
  "increasing the time between their attacks by 20%", [foreverchanges spellbook][fc-sb-warrior]),
  vs −10% in Classic Era [C]. The values are owned by the warrior and buffs docs.
- Applying a slow: `bossSwing = base × (1 + slow)` [?], the engine's convention for negative
  haste. The alternative `base / (1 − slow)` gives 2.5 s instead of 2.4 s for a 20% slow on
  2.0 s. Listed in [Open questions](#open-questions).

### 3.3 Swing-reset rules

| Event | Effect on swing timers | Tag / source |
| --- | --- | --- |
| On-next-swing ability (Heroic Strike, Cleave, Maul) | Replaces the next main-hand white swing when the timer fires. The timer is unchanged. If the resource isn't there when the swing fires, a normal white swing happens. | [C] ([Magey Windfury][magey-wf]; [WarriorSim][ws-player]) |
| Instant ability (Bloodthirst, Shred, …) | No effect on either timer | [C] |
| Ability with a cast time (Slam) | No auto-attacks during the cast; **both** timers restart from full when the cast completes | [C] (Marrow: a mistimed Slam "clip[s] your next auto", so it is used right after a white hit, [marrow-ab]; only WarriorSim's post-SoD code models it, so it is not cited) |
| Other casts with a cast time (paladin, druid) | Same as Slam | [?] (no Classic Era measurement found; class docs may override) |
| Extra attack (Windfury, Hand of Justice, Sword Specialization, Thrash Blade, …) | The main hand swings **immediately** and its timer restarts from full, so an extra attack is worth less than a whole swing | [C] ([Magey Windfury][magey-wf]) |
| Parry by the defender | Parry haste on the defender, [below](#parry-haste) | [C]; [F] tooltip |
| Stance or form change | Owned by the class docs | – |

Forever's Slam has a 1.5 s cast and a 15 s cooldown [F] (tooltip,
[foreverchanges spellbook][fc-sb-warrior]). A Forever warrior sim reports, from user testing,
that Forever Slam **pauses** the swing timers during the cast and resumes them afterwards,
rather than restarting them as Classic does. With Improved Slam, the timers keep running but
due swings wait for the cast to end [?] ([tz-forever]: third-party notes from a Classic-sim
fork, anecdotal, so not adopted). The warrior doc owns Slam; the generic rule above stays
Classic's until that doc says otherwise.

<a id="parry-haste"></a>
### 3.4 Parry haste

When a unit parries a melee attack, its own current swing timer shortens [C]
([Magey parry haste][magey-ph]), confirmed by the Forever tooltip: "Parrying … reduces the time
until the defender's next Melee attack by 40%" [F] ([gs][gs-forever]):

```
S = defender's (hasted) swing speed, r = time remaining on its swing timer
r' = r − min(0.4 × S, max(0, r − 0.2 × S))
```

In words: if more than 60% of the swing remains, remove 40% of the speed; if 20–60% remains,
drop to 20%; if less than 20% remains, nothing changes. It applies to bosses (when the tank
attacks from the front) and to players (a tank's own parries) [C] ([magey-ph]). Magey measured
it on NPCs and players on the 1.13 client.

### 3.5 Global cooldown

| Case | GCD | Tag / source |
| --- | --- | --- |
| Warrior and paladin abilities | 1.5 s | [F] [client] (SpellCooldowns, 1.60.1.69913): `StartRecoveryTime` 1500 ms (e.g. Bloodthirst, Mortal Strike: [warrior §2.2](../classes/warrior.md#22-global-cooldown-and-off-gcd-actions); Holy Strike: [paladin](../classes/paladin.md#other-abilities)); [C] |
| Cat-form abilities (Shred, Claw, Rake, Rip, Ferocious Bite, Ravage) | **1.0 s** | [F] client 1000 ms ([druid §2.6](../classes/druid.md#26-global-cooldowns)); [C] |
| Bear-form abilities (Swipe, Lacerate, …) | 1.5 s | [F] client 1500 ms ([druid §2.6](../classes/druid.md#26-global-cooldowns)) |
| On-next-swing abilities (HS, Cleave, Maul) | none | [F] client (no GCD: [warrior §2.2](../classes/warrior.md#22-global-cooldown-and-off-gcd-actions), [druid §2.6](../classes/druid.md#26-global-cooldowns)); [C] |
| Haste reduces the GCD? | no | [C] (the pre-SoD WarriorSim uses a fixed 1500 ms GCD, [ws-spell]); Forever unknown [?] |

The wowsims/forever spell data ([warrior][wf-spell-warrior], [druid][wf-spell-druid]) reads the
same GCDs; it is corroboration only.

Per-ability GCD exceptions (e.g. abilities with no GCD, or a 1.0 s GCD on a paladin spell) come
from the class data, not from this table. Racials: Blood Fury, Berserking, Elune's Light and
Eureka! have no GCD, while Stoneform has 1.5 s [F] [client] (SpellCooldowns, 1.60.1.69913).

### 3.6 Server tick and spell batching

- Classic Era processed actions in 400 ms batches until patch **1.13.7** (2021), which cut the
  window to **10 ms** [C] (Blizzard, [1.13.7 PTR post][bz-1137]). Magey's batching page and
  its Windfury uptime analysis describe the older 400 ms behaviour ([magey-batch]).
- Forever: nothing announced. It runs on the modern client.
- **Decision:** don't model batching. At 10 ms it's below the doctrine's 0.5% threshold, and
  modelling 400 ms would contradict Classic Era's live behaviour. An optional reaction-time
  delay for procs such as Overpower windows belongs to the rotation settings, not here.
- Energy and mana ticks (2 s) are owned by the class docs and [rage.md](rage.md).

---

## 4. DoTs and bleeds

| Rule | Value | Tag / source |
| --- | --- | --- |
| Tick interval and count | per spell, from client data (table below) | [F] |
| Can a tick miss? | no. The application rolls its table once; ticks always hit | [C] |
| Armor | physical periodic damage ignores armor | [C] (§1.3) |
| Can a tick crit? | `classicEra`: never [C] (the pre-SoD WarriorSim's Deep Wounds has no crit roll, [ws-spell]; the Classic feral guide contrasts Bite, which "can crit", with Rip, [wh-feral]). `forever`: yes, **if** the spell carries the SpellMisc attribute `PERIODIC_CAN_CRIT` (Attributes[8] 0x200); the flag is [F], whether flagged ticks crit in combat is [?] | The Forever tooltip says "Most periodic effects can critically strike" [F text] (`STAT_CRIT_BONUS`, [gs][gs-forever]). The per-spell flags are [F] [client] (SpellMisc, 1.60.1.69913); wowsims/forever reads the same ([wf-spelldata-doc]) |
| Crit chance of a tick | `forever`: each flagged tick rolls crit separately, with the caster's crit chance **snapshotted at application** like the damage (default) [?]. For a melee bleed (Rend) that chance is the main hand's special-attack crit ([combat-tables §3](combat-tables.md#3-special-yellow-attacks)), crit suppression vs +3 included [?]. Multipliers in §2.5. A tick crit fires no melee crit procs ([warrior §7](../classes/warrior.md#7-implementation-notes)) | A Forever warrior-sim author relays a Discord statement that Rend's tick crit is evaluated at each tick ([tzcnt Forever notes][tz-forever]). That is anecdotal secondary evidence, so it is **not adopted**; it is an open question |
| Damage snapshot | **Both profiles (default):** AP and the caster's damage modifiers are fixed when the DoT is applied; target-side modifiers apply per tick [?]. **Exception: Deep Wounds** recomputes each tick from current AP and modifiers [C] (pre-SoD WarriorSim `DeepWounds.step`, [ws-spell]; see [warrior §2.5](../classes/warrior.md#25-crits-impale-flurry-deep-wounds)) | The snapshot default is [?]: the only Classic code for it (WarriorSim's Rend) is post-SoD, and no Classic Era measurement was found. `forever`: the same tzcnt notes report Rend reading AP, modifiers and crit per tick (~0.02 × AP per tick at level ~10) [?]; anecdotal, so not adopted; see [Open questions](#open-questions) |
| Refresh | reapplying restarts the duration **and** the tick timer; the partial tick in progress is lost; the damage is re-snapshotted. A tick due at the very moment of the refresh lands first (an engine tie-break) | [?] |
| Stacking | one instance per caster per target unless the spell stacks (Lacerate, …) | [C]; class docs |

Client values for the DoTs in scope (top ranks). Durations are [F] from the foreverchanges
tooltips; tick periods and periodic-crit flags are [F] [client] (SpellEffect, SpellMisc,
1.60.1.69913):

| DoT | Tick | Ticks | Duration | Periodic crit flag [F] |
| --- | --- | --- | --- | --- |
| Rend (11574) | 3 s | 7 | 21 s | yes |
| Deep Wounds (412609) | 3 s | 4 | 12 s | **no** |
| Rake (9904) | 3 s | 3 | 9 s | yes |
| Rip (9896) | 2 s | 6 | 12 s | yes |
| Pounce bleed (9826) | 3 s | 6 | 18 s | yes |
| Lacerate (1235827, new) | 3 s | 5 | 15 s | yes |
| Consecration (20924) | 1 s | 8 | 8 s | no (on the ranked spell) |

Deep Wounds' bleed is spell 412609 ("Deep Wound", aura 226 every 3,000 ms for 12,000 ms);
the talent 12834 triggers it server-side. The Classic bleed 12721 doesn't exist in the
Forever client: no `SpellName`, `SpellEffect` or `SpellMisc` row, and it isn't encrypted [F]
[client] (SpellEffect, SpellName, 1.60.1.69913)
([warrior Q21](../classes/warrior.md#9-open-questions)). Damage values, AP scaling and special
cases (Deep Wounds' per-tick recomputation, Lacerate stacks) are owned by the class docs.

---

## 5. Procs

### 5.1 PPM formula

```
chance_per_landed_hit = PPM × weaponBaseSpeed / 60
```

This uses the weapon's **base** speed, so haste raises procs per minute. Each hand uses its own
speed [C] ([WarriorSim `speed × ppm / 0.006` basis points][ws-weapon]).

Forever's `SpellProcsPerMinute` table has the same ten rows as Classic Era (IDs 454–463 = 1 to
10 PPM) plus **one new row: ID 479 = 2.3 PPM**, all with Flags 1 [F] [client]
(SpellProcsPerMinute, 1.60.1.69913 vs 1.15.9.69722). No `SpellAuraOptions` row in the Forever
client references a PPM ID, and `SpellProcsPerMinuteMod` is empty [F] [client]
(SpellAuraOptions, 1.60.1.69913), so which proc uses which rate is server-side: per-proc PPM
values stay [C] or [?] as tagged. We keep Classic Era's per-proc rates unless Forever data says
otherwise. The new 2.3 PPM row's user is unknown.

### 5.2 PPM vs flat chance: Classic Era examples

| Effect | Model | Value | Tag / source |
| --- | --- | --- | --- |
| Crusader enchant | PPM | 1 | [C] (enchant list in the pre-SoD WarriorSim's `gear.js`, [ws-gear]) |
| Fiery Weapon enchant | PPM | 6 | [C] ([ws-gear]) |
| Lifestealing enchant | PPM | 6 | [C] ([ws-gear]) |
| Weapon chance-on-hit (e.g. Ironfoe 0.8, Thrash Blade 1, Flurry Axe 1.8, Deathbringer 0.8, Perdition's Blade 1, Empyrean Demolisher 1) | PPM | as listed | [C] ([WarriorSim gear][ws-gear]) |
| Hand of Justice | flat | 2% per landed hit | [C] ([ws-gear]). (Blackhand's Breadth, listed here before, is a +2% crit trinket with no proc, [ws-gear].) |
| Windfury Totem | flat | 20% per main-hand landed hit | [C] ([Magey Windfury][magey-wf]); Forever values → [buffs doc](buffs-debuffs-consumables.md) |
| Talent procs (Flurry, Unbridled Wrath, Sword Spec, Omen of Clarity, Seal of Command, …) | per class doc | – | class docs |

The item database or class doc for each proc says which model and value it uses. The engine
supports both.

### 5.3 What can trigger a chance-on-hit proc

- Only a **landed** hit: hit, crit, glancing or block. Never a miss, dodge or parry [C]
  ([WarriorSim `procattack`][ws-player]).
- **White and yellow** melee hits both roll weapon procs at the same per-hit chance [C]
  ([ws-player]). Each weapon's procs roll only on that weapon's hits. Windfury only procs from
  main-hand attacks [C] ([magey-wf]).
- **Multi-target** attacks (Whirlwind, Cleave): Windfury procs **once per cast** [C]
  ([magey-wf]: "the proc is on-cast meaning only a single extra attack can be gained even when
  e.g. Whirlwind hits 4 targets"). The sim assumes the same for every other extra-attack proc,
  while ordinary weapon procs roll per target hit [?]: only WarriorSim's post-SoD code encodes
  that split ("Extra attacks roll only once per multi target attack", [ws-post-player]). See
  [Open questions](#open-questions).
- Spells and periodic ticks don't roll weapon procs [C].
- Procs with an internal cooldown carry it in their data.

### 5.4 Extra attacks and chaining

- An extra attack is a real main-hand swing (§3.3). It can trigger procs, including **other**
  extra-attack procs [C] ([magey-wf]: "Other extra attacks (e.g. Ironfoe, Sword
  Specialization, etc.)" can proc Windfury).
- Windfury **can't proc itself** or proc twice in one chain of extra attacks [C] ([magey-wf];
  the line dates from the page's first version, 2019-11-04, well before SoD). The sim applies
  the same rule to every extra-attack source: a source can't proc from its own extra attack [?].
- **Windfury internal cooldown.** The Forever client gives Windfury Totem Passive 10612
  `ProcCategoryRecovery` 100: a **100 ms internal cooldown** [F] [client] (SpellAuraOptions,
  1.60.1.69913). `forever` models it, as data on the proc (§5.3). It is far shorter than any
  swing timer, and the chain rule above already bars the proc's own extra attack, so it only
  blocks a main-hand hit that lands within 100 ms of a proc, such as an instant attack pressed
  in the same moment as the proccing swing. Whether the server applies it is [?].
  `classicEra` models none [C] (Magey's 2019 text has none, [magey-wf]).
- Magey's page also notes a 1.5 s internal cooldown on Windfury, added in 2024 and citing a
  2023-12-01 statement that also mentions *Wild Strikes*, an SoD rune. That's SoD-era evidence,
  so it is **not adopted** in either profile. See [Open questions](#open-questions).
- For safety, the engine caps a chain at 10 extra attacks.

---

## WoW Forever deviations

| Topic | Classic Era | Forever | Tag / source |
| --- | --- | --- | --- |
| Armor below 0 | floored at 0 | allowed; increases damage | [F] tooltip text [gs][gs-forever]; in combat [?] |
| Armor penetration | none on gear | flat "pierce up to X armor" stat | [F] stat on items [fc-items]; flat-armor model [?] (D12) |
| Periodic crits | never | "Most periodic effects can critically strike"; per-spell flag | [F] tooltip text [gs][gs-forever]; per-spell flags [F] [client] (SpellMisc, 1.60.1.69913); in combat [?] |
| Haste stat | only from specific effects | Haste Rating on gear; 10 per 1% by hypothesis | stat [F] [fc-items]; conversion [?] [wf-cr] (D12) |
| Thunder Clap attack-speed slow | 10% | 20% | [F] tooltip [fc-sb-warrior] |
| Normalized abilities | MS, OP, WW | MS, OP, WW + Spearing Strike, Holy Strike (new abilities) | [F] class docs' client reads (§2.2) |
| PPM table | 1–10 PPM rows | the same plus ID 479 = 2.3 PPM; no proc references a row | [F] [client] (SpellProcsPerMinute, SpellAuraOptions, 1.60.1.69913) |
| Windfury internal cooldown | none modelled | 100 ms (10612 `ProcCategoryRecovery`) | [F] [client] (SpellAuraOptions, 1.60.1.69913); in combat [?] |
| Crit multipliers, AP/14, 75% armor cap, parry haste 40%, GCD 1.5/1.0 | – | unchanged | [F] tooltips and client data |

No Forever change found for: the armor formula itself (see the confidence note in §1.1),
damage-modifier stacking, the off-hand 50%, swing-reset rules, or the PPM formula.

---

## Implementation notes

- **Time:** integer ms everywhere. Round hasted swing times with `Math.round`. Timers are
  scheduled events; the architecture's event queue breaks ties by insertion order.
- **Swing event** (per hand): at fire time, check the main-hand queue. Resolve the attack
  ([combat-tables.md](combat-tables.md#implementation-notes)), then schedule the next swing at
  `now + round(baseSpeed / hasteProduct)`.
- **Extra attack:** push an immediate main-hand swing event at `now`, then reschedule the
  main-hand timer from that swing. Keep a `chainSources` set on the event so a source can't
  proc from its own chain. In `forever`, Windfury also respects its 100 ms internal cooldown
  (§5.4).
- **Parry haste:** when the defender parries, reschedule its pending swing event using the
  formula in §3.4. For the boss, that's the boss's swing on the tank.
- **Cast-time abilities:** at cast start, cancel pending white swings. At cast end, apply the
  ability, then schedule both hands at `now + speed`. This is for casts that stop swings (Slam
  without Improved Slam); Slam's cost, cooldown and what can happen during its cast are in
  [warrior §7](../classes/warrior.md#7-implementation-notes).
- **Armor per target** is recomputed when a debuff changes. Cache `1 − DR` per target and
  profile.
- **DoTs** are auras with a tick event every `tickLength` from application. On refresh,
  cancel the pending tick and restart. Store the snapshot (AP, caster multipliers, crit chance)
  on the aura at application; Deep Wounds reads the live values instead (§4). In `forever`, a
  tick rolls crit only when the spell's periodic-crit flag is set. The warrior's own bleed
  (Rend) also puts a marker aura on the target, up until its last tick, which rotation
  conditions read (and Bloodthrill's proc will).
- **`unmeasuredRatings`** (`'apply'` in `forever` by default, per D12): haste rating and armor
  penetration go through the stat pipeline only when it is `'apply'`.
- **Skipped (documented):** spell batching (§3.6), integer rounding of damage (§2.6), and mob
  block value (combat-tables §2.4).

Pseudo-code for a physical hit:

```
function physicalDamage(attacker, target, src):     // src: white swing or ability
  speed = src.normalized ? NORMALIZED[attacker.weapon(src.hand).kind] : attacker.weapon(src.hand).speed
  base  = rng.uniform(w.min, w.max) + w.flatBonus + attacker.ap / 14 * speed + src.flatBonus
  dmg   = base * src.weaponPercent * product(attacker.damageMultipliers(src))
  if (src.hand == OFF) dmg *= 0.5 * attacker.offhandBonus
  if (!src.ignoresArmor) dmg *= 1 - armorDR(effectiveArmor(target, attacker), attacker.level, profile)
  return dmg   // outcome multipliers applied by the caller
```

---

## Worked examples

All use player level 60, so `K = 5500`. Where the profiles differ, the example names them.

**WE-1: armor mitigation at boss armor 3,731**

| Profile | Armor after debuffs | DR | Damage factor |
| --- | --- | --- | --- |
| both | 3,731 (none) | 3731 / 9231 = **40.418%** | 0.59582 |
| both | 1,481 (− 5 × 450 Sunder) | 1481 / 6981 = **21.215%** | 0.78785 |
| both | 976 (− Faerie Fire 505) | 976 / 6476 = **15.071%** | 0.84929 |
| `forever` | 471 (− Curse of Recklessness 505) | 471 / 5971 = **7.888%** | 0.92112 |
| `forever` | −129 (600 more reduction, e.g. armor penetration) | −129 / 5371 = **−2.402%** | 1.02402 |
| `classicEra` | 336 (− Curse of Recklessness 640 [C]) | 336 / 5836 = **5.757%** | 0.94243 |
| `classicEra` | −264 (600 more reduction) | clamped to 0 → **0%** | 1.00000 |
| both | 16,500 | **75.000%** (cap) | 0.25 |

Tank vs a level-63 boss: 10,000 armor → 10000 / 15755 = **63.472%**; the cap is at 17,265
armor.

**WE-2: white 2H swing**

Weapon 150–230 (mean 190), speed 3.60, AP 1500, multipliers ×1.05:
- base mean = 190 + 1500/14 × 3.6 = **575.714**; × 1.05 = 604.500
- `forever`, boss armor 471 (Sunder ×5, Faerie Fire, Curse of Recklessness 505):
  × (1 − 0.078881) = **556.816** (normal hit); crit ×2 = **1113.633**; glancing mean ×0.75 =
  **417.612**
- `classicEra`, boss armor 336 (Curse of Recklessness 640): × (1 − 0.057574) = **569.697**;
  crit ×2 = **1139.393**; glancing mean ×0.65 = **370.303**

**WE-3: normalization (same weapon and AP, before multipliers and armor; both profiles)**

- Whirlwind (normalized 3.3): 190 + 1500/14 × 3.3 = **543.571**
- Mortal Strike (+160 flat in the Forever client, rank 4; value owned by the warrior doc):
  543.571 + 160 = **703.571**
- Heroic Strike (rank 9, +157 in both clients' tooltips; value owned by the warrior doc; real
  speed 3.6): 575.714 + 157 = **732.714**

**WE-4: off-hand**

1H off-hand weapon, mean 100, speed 2.0, AP 1500: (100 + 1500/14 × 2.0) × 0.5 = **157.143**
before talents.

**WE-5: haste stacking**

3.60 s weapon with a 30% attack-speed buff and 50 haste rating: `forever` with
`unmeasuredRatings: 'apply'` (5%): 3.6 / (1.30 × 1.05) = 2.63736 s → **2637 ms**. With
`'ignore'`, or in `classicEra` (no rating haste): 3.6 / 1.30 = 2.76923 s → **2769 ms**.

**WE-6: parry haste on a 2.0 s boss swing**

| Remaining when parried | Rule | Remaining after |
| --- | --- | --- |
| 1.60 s (80%) | − 0.4 × 2.0 | **0.80 s** |
| 1.20 s (60%) | − min(0.8, 0.8) | **0.40 s** |
| 1.00 s (50%) | drop to 20% | **0.40 s** |
| 0.30 s (15%) | no change | **0.30 s** |

**WE-7: PPM**

Crusader (1 PPM) on a 3.60 s weapon → **6.000%** per landed hit; on 2.60 s → **4.333%**.
Fiery Weapon (6 PPM) on 2.70 s → **27.000%**. Haste doesn't change these per-hit chances.

**WE-8: extra attack resets the timer**

A 2.60 s main hand swings at t = 0 (next due at 2.60). Bloodthirst at t = 1.00 procs Windfury,
so the main hand swings at 1.00 and next at 3.60. Over 0–3.60 s that's 3 main-hand swings
(0, 1.00, 3.60) instead of 2 (0, 2.60) plus the one due at 5.20. The net gain is less than one
full swing.

**WE-9: DoT refresh**

Rend (3 s ticks, 21 s) applied at t = 0 ticks at 3, 6, 9. Reapplied at t = 10, it ticks at 13,
16, 19, 22, 25, 28, 31. The tick that was due at 12 is lost.

**WE-10: GCD**

A warrior pressing Bloodthirst at t = 0 can use the next GCD ability at 1.5 s. A cat pressing
Shred at t = 0 can Shred again at 1.0 s if it has the energy.

---

## Open questions

1. **Armor constant in Forever** [?]. Is `K(60) = 5500` (Classic) or does the server use the
   client gametable's 1,059? Test: with a known total armor (e.g. 3,000), read the character
   sheet's armor tooltip. The Classic formula vs a level-60 attacker gives 35.29%; 1,059 would
   give 73.9%.
2. **Periodic crits in Forever** [?]. ✅ The flags and Deep Wounds' id are resolved from client
   data ([client.md](../data/client.md#doc-claims-checked-against-the-raw-client)): `PERIODIC_CAN_CRIT` is set on Rend, Rake, Rip, Pounce and Lacerate, not on
   Deep Wounds (412609) or Consecration. Still open: whether flagged ticks crit in combat, the
   multiplier (assumed ×2.0 physical, ×1.5 magic, raised by crit-bonus talents whose mask covers
   the spell: Impale on Rend, [warrior Q32](../classes/warrior.md#9-open-questions)), and
   whether crit suppression applies to ticks (assumed yes). Test: Rend/Rip tick crits in the
   combat log vs +3 mobs.
3. **DoT snapshot and refresh rules** [?]. Both profiles snapshot AP, caster modifiers and crit
   chance at application by default; Deep Wounds recomputes each tick. A third-party Forever
   sim's notes say Rend reads AP, modifiers and crit **per tick** ([tz-forever]; anecdotal, not
   adopted). Is there any pandemic-style carry-over? Do Rake, Rip, Pounce and Lacerate behave the
   same? Test: reapply Rend mid-duration and log tick times. Then pop a crit/AP cooldown mid-DoT
   and check whether later ticks change.
4. **Haste rating** [?]: does 10 rating give 1% (the gametable, as extracted by wowsims), and
   does it multiply with other haste (the D12 hypothesis) or add? Test: the character-sheet
   "Haste" with a haste buff plus rating haste (the sheet shows the combined melee haste %).
5. **Does haste reduce the GCD in Forever?** [?] Test: with the 5% haste flask in Hyjal, time
   GCDs with the built-in swing timer and cooldown manager.
6. **Mid-swing haste changes** [?]: rescale the current timer, or apply at the next swing?
   Test with a haste proc and the built-in swing timer.
7. **Casts with a cast time and the swing timer** for paladins and druids [?].
8. **How attack-speed slows apply** (`× (1 + s)` vs `÷ (1 − s)`) [?]. Test: time the boss's
   (or a mob's) swings with Thunder Clap up.
9. **Windfury internal cooldown** [?]. The Forever client sets 100 ms (10612
   `ProcCategoryRecovery`) [F], and `forever` models it; `classicEra` models none. The 1.5 s
   cooldown quoted on Magey's page (a 2023 statement that mentions an SoD rune) stays refused.
   Open: does the server apply the 100 ms, and does anything else limit chained extra attacks?
   Test: minimum gap between Windfury procs over 500+ main-hand swings (expect ≥ 100 ms).
10. **Per-proc PPM values in Forever** [?]. ✅ Confirmed from client data: no proc links to a
    PPM row, so per-proc rates are server-side and stay [C] or [?] as tagged. Which effect uses
    the new 2.3 PPM row? Test: fit proc rates from combat logs (weapon enchants:
    [buffs OQ 9](buffs-debuffs-consumables.md#open-questions)).
11. **Off-hand first-swing offset** [?]: a modelling choice, not a measured rule.
12. **Negative armor and armor penetration in combat (`forever`)** [?]. The client tooltip says
    armor below 0 increases damage, and the `forever` profile applies it; armor penetration is
    modelled as flat armor removed (D12). Nobody has measured either. The same holds for
    resistance below 0 ("Spell Vulnerability", [combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic)).
    Test: with armor penetration or armor debuffs that exceed a low-armor mob's armor, compare
    average white damage against the same mob at exactly 0 effective armor.
13. **Classic rules only a post-SoD sim encodes** [?]: flat "damage taken" bonuses added after
    multipliers (§2.4), and on multi-target attacks ordinary weapon procs rolling per target
    while extra-attack procs other than Windfury roll once per cast (§5.3). Test: a mob with a
    flat damage-taken debuff (Gift of Arthas' +8), and weapon-enchant procs per Cleave that hits
    two mobs.

---

## Sources

| Ref | Source | Covers | Ruleset |
| --- | --- | --- | --- |
| [gs-forever] | Forever client GlobalStrings (enUS), <https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua> | armor cap, armor pen, crit multipliers, parry haste, periodic crits, block | [F] client (verbatim mirror, doctrine §2): what the client displays; combat [?] until measured, or [C] where unchanged from Classic |
| [ui-stats] | Forever `Camelot/PaperDollFrameStats.lua`, <https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua> | AP/14, block value per Strength | [F] client |
| [ui-pdf] | Forever `Camelot/PaperDollFrame.lua`, <https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrame.lua> | armor tooltip uses `C_PaperDollInfo.GetArmorEffectiveness` | [F] client |
| [wf-cr] | wowsims/forever CombatRatings extraction, <https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats/combatratings.txt> | haste 10 rating per 1% | [?] secondary (Forever client gametable read by wowsims; not on foreverchanges) |
| [wf-armor] | wowsims/forever `basestats-forever/ArmorMitigationByLvl.txt`, <https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats-forever/ArmorMitigationByLvl.txt> | client armor gametable (retail leftover; not adopted) | [?] |
| [wf-spell-warrior] | wowsims/forever `sim/warrior/spell_data_auto_gen.go`, <https://github.com/wowsims/forever/blob/master/sim/warrior/spell_data_auto_gen.go> | effect types, GCDs, DoT ticks (corroboration of the class docs' own reads) | [?] secondary (client data read by wowsims) |
| [wf-spell-druid] | wowsims/forever `sim/druid/spell_data_auto_gen.go`, <https://github.com/wowsims/forever/blob/master/sim/druid/spell_data_auto_gen.go> | cat 1.0 s GCD, bleed ticks (corroboration) | [?] secondary (client data read by wowsims) |
| [wf-spell-paladin] | wowsims/forever `sim/paladin/spell_data_auto_gen.go`, <https://github.com/wowsims/forever/blob/master/sim/paladin/spell_data_auto_gen.go> | Holy Strike normalized, Consecration ticks (corroboration) | [?] secondary (client data read by wowsims) |
| [wf-spelldata-doc] | wowsims/forever `docs/spell_data.md`, <https://github.com/wowsims/forever/blob/master/docs/spell_data.md> | how PeriodicCanCrit, GCD and effect types are read from the client; corroborates the per-spell periodic-crit flags and Deep Wounds' id 412609, now read from the client directly | [?] secondary (client data read by wowsims) |
| [client] | [client.md](../data/client.md), `src/data/client/*.json`: raw DB2 files of build 1.60.1.69913 (and 1.15.9.69722), fetched through the wago.tools API and parsed by `scripts/scrape/client.mjs` | effect types, GCDs, DoT ticks and periodic-crit flags, Deep Wounds 412609, PPM rows and their (absent) proc links, Windfury's 100 ms ICD | [F] client; [C] for 1.15.9.69722 |
| [ws-player] | GuybrushGit/WarriorSim `js/classes/player.js` at pre-SoD commit `180a3cc` (2021-05-11), <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js> | armor formula and floor, haste stacking, proc triggers, damage mods | [C] (pre-SoD) |
| [ws-weapon] | WarriorSim `js/classes/weapon.js` at `180a3cc`, <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/weapon.js> | normalized speeds, off-hand 0.5, flat weapon damage, PPM chance, swing timer | [C] (pre-SoD) |
| [ws-spell] | WarriorSim `js/classes/spell.js` at `180a3cc`, <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/spell.js> | normalized abilities, fixed 1500 ms GCD, Deep Wounds (per-tick, no armor, no crit) | [C] (pre-SoD) |
| [ws-gear] | WarriorSim `js/data/gear.js` at `180a3cc`, <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/data/gear.js> | enchant PPMs (Crusader 1, Fiery 6, Lifestealing 6), item PPM and flat proc values, Blackhand's Breadth +2% crit | [C] (pre-SoD; Classic items only) |
| [ws-post-player] | WarriorSim `js/classes/player.js` at post-SoD commit `ad5ac8b` (2024-12), <https://github.com/guybrushgit/WarriorSim/blob/ad5ac8b5dd76db3f0fa7c41de52c0b0b60a5a4d8/js/classes/player.js> | "Extra attacks roll only once per multi target attack" | not a [C] source (post-SoD); cited only to show where a [?] assumption comes from |
| [ws-post-weapon] | WarriorSim `js/classes/weapon.js` at `ad5ac8b`, <https://github.com/guybrushgit/WarriorSim/blob/ad5ac8b5dd76db3f0fa7c41de52c0b0b60a5a4d8/js/classes/weapon.js> | `moddmgdone` / `moddmgtaken` flat terms | not a [C] source (post-SoD) |
| [marrow-ab] | Marrow's Compendium of Dragonslaying, ch. 4, <https://bookdown.org/marrowwar/marrow_compendium/abilities.html> | Whirlwind normalized (2.4 / 3.3), Slam not normalized and clipping the next auto, HS/Cleave replace the next swing | [C] (WoW Classic 2019–2020) |
| [wh-feral] | Wowhead Classic feral DPS rotation (NerdEgghead, patch 1.15.8), <https://www.wowhead.com/classic/guide/classes/druid/feral/dps-rotation-cooldowns-abilities-pve> | bleeds ignore armor; Rip doesn't crit (Bite can) | [C] (Classic Era page; the site also hosts SoD guides, not used) |
| [fc-sb-warrior] | foreverchanges.pro warrior spellbook, <https://foreverchanges.pro/spellbook/warrior> | Thunder Clap 20% slow; Slam 1.5 s cast, 15 s cooldown | [F] |
| [magey-wf] | Magey, "Windfury Totem", <https://github.com/magey/classic-warrior/wiki/Windfury-Totem> | 20% chance, extra-attack mechanics, proc triggers | [C] (ICD note refused: SoD-era) |
| [magey-ph] | Magey, "Parry haste", <https://github.com/magey/classic-warrior/wiki/Parry-haste> | parry-haste rule | [C] |
| [magey-batch] | Magey, "Spell batching", <https://github.com/magey/classic-warrior/wiki/Spell-batching> | 400 ms batching (pre-1.13.7) | [C] (historical) |
| [bz-1137] | Blizzard, "WoW Classic Version 1.13.7 PTR is Now Available", <https://us.forums.blizzard.com/en/wow/t/wow-classic-version-1137-ptr-is-now-available/838945> | batching 400 ms → 10 ms | [C] |
| [bf-armor] | Blizzard forums, "Boss armor value question" (2020), <https://us.forums.blizzard.com/en/wow/t/boss-armor-value-question/444825> | boss armor ~3,740; armor not below 0 | [C] (player observation) |
| [fc-items] | foreverchanges.pro items, <https://foreverchanges.pro/items> | haste/armor-pen items, flasks | [F] |
| [fc-racials] | foreverchanges.pro racials, <https://foreverchanges.pro/racials> | Wind Blessed haste | [F] |
| [fc-changes] | foreverchanges.pro changes, <https://foreverchanges.pro/changes> | Dual Wield Specialization keeps off-hand damage | [F] |
| [wt-stats] | Warcraft Tavern, Forever stats guide, <https://www.warcrafttavern.com/forever/guides/stats/> | 17,265 armor for the cap vs bosses | [F] reported |
| [tz-forever] | tzcnt/WarriorSim, Forever notes `data/forever/ABILITY_MECHANICS.md` and `README.md`, <https://github.com/tzcnt/WarriorSim/tree/master/data/forever> | Rend ticks: per-tick crit and AP (no snapshot); Forever Slam timer behaviour; in-game flat damage values | [?] secondary (user tests and a relayed Discord statement, in a Classic-sim fork with a Forever mode whose baseline hit and glancing are still Classic; anecdotal, not adopted) |

[gs-forever]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[gs]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[ui-stats]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua
[ui-pdf]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrame.lua
[wf-cr]: https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats/combatratings.txt
[wf-armor]: https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats-forever/ArmorMitigationByLvl.txt
[wf-spell-warrior]: https://github.com/wowsims/forever/blob/master/sim/warrior/spell_data_auto_gen.go
[wf-spell-druid]: https://github.com/wowsims/forever/blob/master/sim/druid/spell_data_auto_gen.go
[wf-spell-paladin]: https://github.com/wowsims/forever/blob/master/sim/paladin/spell_data_auto_gen.go
[wf-spelldata-doc]: https://github.com/wowsims/forever/blob/master/docs/spell_data.md
[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[ws-player]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js
[ws-weapon]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/weapon.js
[ws-spell]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/spell.js
[ws-gear]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/data/gear.js
[ws-post-player]: https://github.com/guybrushgit/WarriorSim/blob/ad5ac8b5dd76db3f0fa7c41de52c0b0b60a5a4d8/js/classes/player.js
[ws-post-weapon]: https://github.com/guybrushgit/WarriorSim/blob/ad5ac8b5dd76db3f0fa7c41de52c0b0b60a5a4d8/js/classes/weapon.js
[marrow-ab]: https://bookdown.org/marrowwar/marrow_compendium/abilities.html
[wh-feral]: https://www.wowhead.com/classic/guide/classes/druid/feral/dps-rotation-cooldowns-abilities-pve
[fc-sb-warrior]: https://foreverchanges.pro/spellbook/warrior
[magey-wf]: https://github.com/magey/classic-warrior/wiki/Windfury-Totem
[magey-ph]: https://github.com/magey/classic-warrior/wiki/Parry-haste
[magey-batch]: https://github.com/magey/classic-warrior/wiki/Spell-batching
[bz-1137]: https://us.forums.blizzard.com/en/wow/t/wow-classic-version-1137-ptr-is-now-available/838945
[bf-armor]: https://us.forums.blizzard.com/en/wow/t/boss-armor-value-question/444825
[fc-items]: https://foreverchanges.pro/items
[fc-racials]: https://foreverchanges.pro/racials
[fc-changes]: https://foreverchanges.pro/changes
[wt-stats]: https://www.warcrafttavern.com/forever/guides/stats/

[tz-forever]: https://github.com/tzcnt/WarriorSim/tree/master/data/forever
