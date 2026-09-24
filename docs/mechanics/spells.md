# Spells: the caster core

How a level-60 caster's spells land on a level-63 raid boss, how much they deal, how long they
take, and what they cost. It's the shared engine every caster DPS spec builds on (Mage, Warlock,
Shadow Priest, Elemental Shaman, Balance Druid; slice K1 of
[M5.5](../milestones.md#m55-every-other-dps-spec-d27-)): spell hit, crit and resists, spell power
and coefficients, cast times and casting speed, channels, DoTs, mana, and the caster raid buffs and
debuffs. The class docs own each class's spells, talents and rotation; this doc owns the rules
they share. It extends [combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic) (the spell
table) and [damage-and-timing §4](damage-and-timing.md#4-dots-and-bleeds) (DoTs), and doesn't
repeat them.

Forever keeps Classic's spell rules and changes the numbers around them: its client gives most
periodic spells the periodic-crit flag, lowers the base damage of the top-rank nukes while keeping
or raising their spell power coefficients, turns three raid debuffs (Improved Scorch, Winter's
Chill, Shadow Weaving) into the caster's own, folds Curse of Shadow into a Curse of the Elements
that covers every magic school, Holy included, and makes Moonkin Aura all crit
([WoW Forever deviations](#wow-forever-deviations)).

Status: researched 2026-09-24 · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 ·
ruleset tags: [F] Forever · [C] Classic Era · [?] unverified · engine: the caster core (slice K1),
no caster spec yet ([Implementation notes](#implementation-notes))

---

## What the sim needs

- A spell rolls its hit (and a binary spell its resist) on the spell table, then its crit, then
  deals its base damage plus its coefficient × the school's spell damage, × your multipliers and
  the boss's, less an average partial resist ([§1](#1-spell-hit)–[§5](#5-spell-power-and-coefficients)).
- Casts with a cast time hold the GCD and every other cast; casting speed shortens them, not the
  GCD ([§4](#4-cast-times-casting-speed-and-the-gcd)).
- Channels tick while they hold the caster, and can be cut off ([§6](#6-channels)).
- DoTs snapshot the caster's side as they land and read the boss's side each tick; reapplying
  restarts them ([§7](#7-dots)).
- Mana: the one pool of [character-stats](character-stats.md#spirit-and-mana-regeneration), with
  each class's Spirit regeneration, the five-second rule and mp5 ([§8](#8-mana)).
- The caster buffs and debuffs, as the Buffs tab's entries or as auras a rotation keeps up
  ([§9](#9-caster-raid-buffs-and-debuffs)).

---

## 1. Spell hit

[combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic) owns the table. In short:

| Rule | Value | Tag |
| --- | --- | --- |
| Base spell miss vs a level-63 boss | **17%** (83% land) | [F] `spellMissChances` ([stats Lua][ui-stats]); [C] ([AMR][amr-hit]) |
| Hit cap vs +3 | `forever` **17%** (never misses: floor 0%, the tooltip "To never miss Raid Bosses: 17.00% Spells"); `classicEra` **16%** (1% floor) | [F] tooltip; [?] in combat ([combat-tables OQ](combat-tables.md#open-questions)); [C] |
| Hit from gear | Forever's one hit rating serves melee and spells, 10 rating per 1% at 60 (`CombatRatings` `hitSpell` 10); Classic Era gear's "+x% spell hit" is spell only | [F] [client] (gametables, 1.60.1.69913); [C] |
| Roll | one roll for hit (a binary spell's resist in the same roll, [§3](#3-resistances)), then a second for crit on a landed spell | [C] ([combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic)) |

A spell's damage class (`SpellCategories.DefenseType`) picks its table: every caster nuke and DoT
in the client is **magic** (1), which is this one [F] [client] (SpellCategories, 1.60.1.69913).

## 2. Spell crit

| Rule | Value | Tag |
| --- | --- | --- |
| Crit damage | **×1.5** ("Spell and Healing critical strikes are 50% more effective") | [F] tooltip `STAT_CRIT_BONUS` ([gs][gs-forever]); [C] ([R1 `_CRIT_DAMAGE`][r1-const]) |
| Talents that raise the crit bonus | +100% of the bonus at full rank makes **×2.0**: Ice Shards (Frost, 20% a rank), Ruin (Destruction), Vengeance (Balance, 20% a rank), Elemental Fury (Elemental). The multiplier is `1 + 0.5 × (1 + bonus%)` (`spellCritMultiplier`) | [C] ([mana guide][wt-mana]: "to 100% from 50%"; [anlif][anlif-sb]: "150% … with Ruin … 200%"). Forever's ranks come from the class slices' talent data |
| Crit chance | the sheet's spell crit: class base + Intellect × the class's `SpellCritPerIntellect` + gear + auras, plus the spell's own and its school's bonuses ([§5](#5-spell-power-and-coefficients), [§9](#9-caster-raid-buffs-and-debuffs)) | [F] per-Int values: mage 0.0168%, priest 0.0168%, warlock 0.0165%, shaman 0.0169%, druid 0.0167% per point (`PlayerExpectedStat`) [client] (1.60.1.69913); base values per class: the class slices |
| Crit rating | 14 rating per 1% at 60 (`critSpell` 14) | [F] [client] (gametables, 1.60.1.69913) |
| Crit suppression vs +3 | none for spells | [C] ([combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic)) |

A spell crit fires the `spellCrit` procs ([§10](#10-spell-procs)); DoT ticks crit only as
[§7](#7-dots) says.

## 3. Resistances

[combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic) has the formula,
`avgResist = 0.75 × R / (5 × casterLevel)`, capped at 75%, and the boss's level-based
resistance, **24** at +3 [?] (6% on average). This section adds what casters need.

| Rule | Value | Tag |
| --- | --- | --- |
| Level-based resistance | 24 (8 a level). A Classic Era fire-mage sim's hard-coded partial-resist table against a level-63 boss averages **5.90%** (83.03% none, 11.12% 25%, 4.90% 50%, 0.95% 75%), which 24 gives within 0.1% | [?] value; [C] corroboration ([R1 `_RES_THRESH`][r1-const]) |
| A pure damage spell (non-binary) | partially resisted: the sim takes the **average**, × (1 − avgResist), on its direct hit and on each DoT tick | [C] ([R1][r1-mech] rolls the partial table on Ignite's ticks too); the average instead of the 0/25/50/75% buckets is the sim's (it keeps the mean, not the spread) |
| A binary spell | a spell with an effect besides damage (a slow, a debuff: Frostbolt, Mind Flay) is **resisted whole or not at all**: one roll against `miss + (1 − miss) × avgResist`, and a landed one takes no partial resist | [?] rule (only wiki text); [C] for Frostbolt ([R1][r1-mech] gives it no partials). The class slices mark their binary spells (`SpellDef.binary`) |
| A binary spell and negative resistance | its whole-resist chance uses the average resist floored at 0, and a landed one takes no partial resist, so a resistance below 0 (spell penetration in `forever`, below) raises only non-binary spells' damage | [?] engine choice (no source either way) |
| Holy | no resistance: never partially or binary-resisted | [C] ([combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic)) |
| Resistance debuffs (Curse of the Elements' −75) | lower the boss's **own** resistance, which is 0, and **not below 0**, so against a raid boss they change nothing; they can't touch the level-based 24 | [?] (a Classic player's "can't be penetrated", [mmoc-res]; R1 applies no resistance change for CoE) |
| Spell penetration (a stat) | subtracted from the total, level-based part included. `forever`: can take it **below 0**, which raises damage ("Spell Vulnerability", `SPELL_PENETRATION_TOOLTIP`); `classicEra`: floored at 0 | [F] tooltip ([gs][gs-forever]); [?] in combat ([combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic)); [?] for Classic Era. No pre-raid item has any |

So the boss's resistance to a school is `24 + max(0, 0 + debuffs) − penetration`, and
`max(0, …)` of that in `classicEra` (`schoolPlan` in `sim/plan/build.ts`).

## 4. Cast times, casting speed and the GCD

| Rule | Value | Tag |
| --- | --- | --- |
| Cast time | the client's `SpellCastTimes` per spell (Frostbolt 3.0 s, Fireball 3.5 s, Shadow Bolt 3.0 s, Mind Blast 1.5 s; Forever's Lightning Bolt 2.5 s, Classic Era's 3.0 s), less the class's talents | [F] [C] [client] (SpellMisc, SpellCastTimes, both builds) |
| A cast | holds the GCD and every other cast until it lands. It pays its mana, starts its cooldown and deals its damage **when it lands** (so the five-second rule starts then) | [C] ([mana guide][wt-mana]: "the second you complete a cast") |
| Off-GCD actions during a cast (a trinket, a potion) | go on, unless the ability holds them (`castHoldsOffGcd`) | [?] engine choice, per ability |
| GCD | **1.5 s** (`StartRecoveryTime` 1500, category 133) for casters' spells; some (Power Infusion, Arcane Power, Mind Quickening) have none | [F] [client] (SpellCooldowns, 1.60.1.69913); [C] |
| Does casting speed shorten the GCD? | **no**: it stays 1.5 s | [C] ([R1 `_GLOBAL_COOLDOWN`][r1-const]); Forever [?] |
| Casting speed | divides the cast time: `cast ÷ Π(1 + speed%)`, rounded to a whole ms (`hastedCastMs`) | [C] ([R1][r1-mech]: `cast_timer /= 1 + 0.33 × mqg`) |
| Sources at 60 | Mind Quickening Gem +33% for 20 s (23723, aura 65; Forever's tooltip drops "non-channeled"); Berserking (Troll): Forever **+10% casting and attack speed for 10 s** (20554, auras 65 and 319, flat), Classic Era 10–30% by health; the gloves' **Minor Haste: Forever "+1% attack and casting speed"** (13948), Classic Era attack speed only; Forever's haste rating, 10 per 1% (`hasteSpell`), only with D12's switch | [F] [C] [client] (SpellEffect, Spell, 1.60.1.69913 and 1.15.9.69722); haste rating [?] ([D12](../decisions.md)) |
| Channels | casting speed doesn't change them | [?] (no Classic Era source; the engine hastes only the abilities marked `castHasted`) |

The first cast of a fight starts at the pull, 0 ms. Projectile travel time (a Frostbolt's
28 yards a second) isn't modelled: it only delays when a hit's damage and debuff land, never how
many land ([Implementation notes](#implementation-notes)).

## 5. Spell power and coefficients

**Spell damage by school** [C]: an item's "+x spell damage" (and Forever's "Spell Power", damage
and healing) adds to every school; "+x Shadow spell damage" adds to Shadow only. A spell reads its
school's: all-schools plus its own. A talent's share of Intellect adds to every school: the
paladin's Champion of the Light ([paladin](../classes/paladin.md#conventions-used-below)), the
shaman's Mental Quickness ([shaman](../classes/shaman.md#spell-damage)). A buff's spell damage
(Greater Arcane Elixir's +35, a trinket's aura) is all schools. The character sheet shows each
school's for a caster ([ux.md](../ux.md) "Results").

**Coefficients.** A spell deals `base + coefficient × spell damage` of its school, then the
multipliers ([§9](#9-caster-raid-buffs-and-debuffs)).

| Rule | Value | Tag |
| --- | --- | --- |
| The authority | the client's `SpellEffect.EffectBonusCoefficient`, per effect, in both clients: Frostbolt **0.814**, Fireball **1.0** (its DoT 0), Shadow Bolt **0.857**, Mind Blast **0.429**, Starfire **1.0**; per tick for a DoT (Corruption: Forever **0.2** a tick, Classic Era 0.167) | [F] [C] [client] (SpellEffect, both builds) |
| The cast-time rule (fallback) | a direct spell: cast time ÷ 3.5 s, with the cast time at least 1.5 s (instants count as 1.5 s) and at most 3.5 s (`castTimeCoefficient`): 3.0 s → 0.857, 1.5 s → 0.429 | [C] ([R1][r1-const]: Scorch and Fire Blast 1.5/3.5, Fireball 1.0; [anlif][anlif-sb]: Shadow Bolt 3/3.5) |
| Frostbolt's slow | 0.814 = 3/3.5 × 0.95: a spell with a side effect gets 95% | [C] ([R1][r1-const] `0.814286`); the client value [F] |
| DoTs, channels, hybrids, AoE, spells below level 20 | the duration ÷ 15 s rule, channels' duration ÷ 3.5 s, the hybrid split, the AoE and low-level penalties: the client's coefficient is used for each spell, so the sim needs none of these rules | no Classic Era source found for the rules [?]; the client values are [F] [C] |
| Ranks below 60 | a rank's base grows by its per-level points up to its maximum level; a range is `base × (1 ± variance/2)` in the Forever client | [F] ([paladin conventions](../classes/paladin.md#conventions-used-below)) |

## 6. Channels

| Rule | Value | Tag |
| --- | --- | --- |
| Ticks | every `EffectAuraPeriod` (Arcane Missiles, Mind Flay: 1 s), the first one period after the start; 5 for Arcane Missiles (5 s), 3 for Mind Flay (3 s) | [F] [C] [client] (SpellEffect, SpellDuration, both builds) |
| Two kinds | a channel that **triggers a spell each tick** (Arcane Missiles: aura 23, `PERIODIC_TRIGGER_SPELL`): each missile is its own spell, with its own hit, crit and resist; a channel whose ticks are its **own periodic damage** (Mind Flay, Drain Soul: aura 3): one hit roll as it starts, then ticks that never miss | [F] client structure; [?] in combat |
| Holding the caster | a channel holds the GCD (1.5 s from its start) and every other cast until it ends | [C] |
| Cost | paid as it starts, which starts the five-second rule | [?] (no source for channels; the client's cost is the spell's) |
| Cutting it off (clipping) | a rotation can stop it after any tick: the ticks after that are lost, the GCD still runs its 1.5 s from the start | [C] (a player can stop a channel); the engine's `channelTicks` |
| A missed start | ends the channel at once; the GCD runs on | [?] |
| Its aura on the caster | a channel's own buff (Evocation's regeneration) is up while it channels and ends with it, cut off or not: the ability's `aura`, unless that's its DoT's marker. A `selfAura` instead lasts its own duration | [?] (a channel's auras end when it stops; no source for Classic Era) |
| Its procs | a DoT channel fires `spellLanded` once, as its hit lands at the start; a channel that triggers a spell fires it for **each missile** that lands, if the missile triggers procs ([§10](#10-spell-procs)) | [?] |

## 7. DoTs

[damage-and-timing §4](damage-and-timing.md#4-dots-and-bleeds) owns the rules DoTs and bleeds
share (ticks never miss, the refresh tie-break, periodic crits). For spell DoTs:

| Rule | Value | Tag |
| --- | --- | --- |
| Application | a spell DoT rolls its hit (and a binary spell its resist) when it's cast; a hybrid (Fireball, Immolate, Moonfire) rolls once for its direct part and its DoT | [C] |
| Snapshot | your spell damage, the spell's own multiplier, your school multipliers and your crit chance are fixed when it lands | [C] (weak: a Classic beta player, "Dot snapshotting exists for SPELLPOWER ONLY", [mmoc-dot]) |
| The boss's side | its damage taken (Curse of the Elements, a Fire Vulnerability) and its resist apply **at each tick** | [C] ([R1][r1-mech] applies Scorch stacks and CoE to each Ignite tick) |
| Partial resist | each tick of a non-binary DoT, on average; a binary one's ticks none | [C] ([R1][r1-mech]) |
| Refresh | recasting restarts it: a tick due that moment lands first, the partial tick in progress is lost, and it snapshots again | [?] (as damage-and-timing §4) |
| Can ticks crit? | `forever`: yes if the spell has the periodic-crit flag (SpellMisc Attributes[8] 0x200), at the snapshot's crit × the spell's crit multiplier. **Forever flags** Corruption, Immolate, Shadow Word: Pain, Moonfire, Mind Flay and Fireball's DoT; Classic Era flags none of them. `classicEra`: never. The flag alone decides: a spell's `cannotCrit` covers only its direct part, never its ticks | [F] flags [client] (SpellMisc, 1.60.1.69913); [?] in combat; [C] never |
| Procs from ticks | a tick fires only the `spellTick` procs ([§10](#10-spell-procs)): no crit procs | [?] |

## 8. Mana

The one mana pool of [character-stats](character-stats.md#spirit-and-mana-regeneration): full at
the pull, costs paid from it, one power tick every 2 s from a random phase.

| Rule | Value | Tag |
| --- | --- | --- |
| Spirit regeneration per 2 s tick, outside the five-second rule | mage and priest **13 + Spirit/4**; warlock **8 + Spirit/4**; shaman, druid, paladin and hunter **15 + Spirit/5** (`SPIRIT_REGEN`) | [C] ([mana guide][wt-mana]'s table; the shaman is 15, not 17) |
| Five-second rule | after a cast that costs mana lands (a channel: as it starts), Spirit regeneration stops for 5 s; a free cast (Clearcasting) doesn't start it | [C] ([mana guide][wt-mana]) |
| mp5 | always, inside the rule too | [C] ([mana guide][wt-mana]) |
| Regeneration while casting | a talent's or buff's share of Spirit regeneration goes on inside the rule, added up, at most all of it: Forever's Mage Armor **50%** (Classic Era 30%), Innervate 100% (with +400%), Evocation (+1500%, 100%), the shaman's Improved Stormstrike 50% for 15 s ([shaman.md](../classes/shaman.md#mana)) | [F] [C] [client] (SpellEffect aura 134, both builds) |
| Base mana at 60 | mage 1213, priest 1376, warlock 1373, shaman 1520, druid 1244 | [F] `PlayerExpectedStat.BaseMana` [client] (1.60.1.69913) |
| Potions and runes | the Major Mana Potion and the runes of [buffs §3.5](buffs-debuffs-consumables.md#35-potions-and-runes) | [F] |

The mana abilities come with the class slices, on hooks the core has: Evocation as a channel
whose `aura` is its Spirit-regeneration buff, up while it channels ([§6](#6-channels)), Life Tap
as a cast that restores mana (`AbilityPlan.manaTenths`), Innervate as an aura (`spiritRegen`,
`castingRegen`; [§12](#12-what-a-class-slice-uses)).

## 9. Caster raid buffs and debuffs

**Multipliers.** A spell's damage is `(base + coefficient × SP) × its own × your magic ×
your school's × the boss's damage taken of its school × (1 − avgResist)` [C]. Your school's is the
product of your school-wide buffs (Power Infusion's +20%); the boss's is the product of its debuffs
(Curse of the Elements' +10%, and Forever's Improved Scorch and Shadow Weaving, which count only
the caster's own damage). A DoT snapshots your side as it lands and reads the boss's at each tick
([§7](#7-dots)), so a debuff stack that a DoT's own landing adds counts from its first tick. For
Holy, Judgement of the Crusader's flat bonus comes before the boss's damage taken [?]
([OQ-S12](#open-questions)). A class's talents that name its spells (Fire Power, Shadow Mastery)
are the spell's own multiplier, set by the class slice.

| Name | Forever | Classic Era | In the sim | Tag |
| --- | --- | --- | --- | --- |
| **Curse of the Elements** r4 (1311680, new at 50) | **+10% damage taken from every magic school, Holy included**, −75 resistance to them; 5 min; one curse per warlock | r3 (11722): Fire and Frost only | Buffs entry, the casters' ([§12](#12-what-a-class-slice-uses)); its −75 changes nothing on a boss ([§3](#3-resistances)) | [F] [C] [client] (SpellEffect, both builds) |
| **Curse of Shadow** | **gone** (folded into Curse of the Elements; r2 17937 isn't in the client) | r2: Shadow and Arcane +10%, −75 | not in the catalogue | [F] [client] (SpellName, 1.60.1.69913) |
| **Shadow Weaving** (15257 → 15258) | a **debuff on the boss that counts only the priest's own damage**: "Taking 2% increased Shadow damage from the caster" a stack (aura 270 on the enemy, ImplicitTarget 6, as Improved Scorch's), 5 stacks, 15 s; 100% chance from each of the priest's Shadow damage spells. The talent's tooltip words it as "the Shadow damage you deal" | a debuff on the boss for everyone: +3% Shadow taken a stack (aura 87), 5 stacks, 15 s, 20–100% chance by rank | K4's, as an aura the priest keeps on the boss (`schoolTaken`), read at each hit and tick; no Buffs entry (another priest's stacks don't count for you) | [F] [client] (SpellEffect, Spell, SpellAuraOptions, 1.60.1.69913); [C] [client] (SpellEffect, 1.15.9.69722) |
| **Improved Scorch** (11095 → 22959) | **the mage's own**: "+3% Fire damage **from the Mage**" a stack, 5 stacks, 30 s; 100% chance from Scorch | Fire Vulnerability on the boss for everyone, 33/66/100% by rank | K2's, as an aura the mage keeps (`schoolTaken`) | [F] tooltip; [C] ([R1][r1-const]) |
| **Winter's Chill** (11180 → 12579) | **the mage's own**: +2% crit a stack for "your Ice Lance and Frostbolt", 5 stacks, 15 s | +2% Frost crit a stack for anyone's Frost spells, 20–100% by rank | K2's (`schoolCrit`) | [F] tooltip; [C]; the talent's chance [?] ([OQ-S9](#open-questions)) |
| **Improved Shadow Bolt** (Shadow Vulnerability 17794) | the Forever row has no charges; the ranks are Forever talents | +20% Shadow taken, 4 charges, 12 s (17800) | K3's | [F] [C] [client] |
| **Nightfall** (item 19169, Spell Vulnerability 23605) | +15% spell damage taken (every magic school, not physical), 5 s, unchanged | the same | not in the catalogue yet: its proc rate is server-side and a static entry needs an uptime ([OQ-S10](#open-questions)) | [F] [C] [client] (SpellEffect, both builds); rate [?] |
| **Moonkin Aura** (24907) | **+3% crit, all** (aura 290), party; exclusive with Leader of the Pack | +3% spell crit (aura 57) | Buffs entry, the casters' | [F] [C] [client] (SpellEffect, both builds) |
| **Power Infusion** (10060) | +20% spell damage, 15 s, 3 min cooldown, off the GCD, unchanged | the same | Buffs entry, the casters', which a caster's rotation presses on cooldown ([§12](#12-what-a-class-slice-uses)) | [F] [C] [client] (SpellEffect, SpellCooldowns, both builds) |
| **Arcane Brilliance**, **Prayer of Spirit**, **Blessing of Wisdom**, **Mana Spring Totem** | [buffs §1.1, §1.2](buffs-debuffs-consumables.md#1-raid-and-party-buffs) | | the paladin's and the casters' | [F] |
| **Totem of Wrath**, **Wrath of Air Totem** | **not in the Forever client** | not in Classic Era | none | [F] [client] (SpellName, 1.60.1.69913) |

The casters' Buffs entries are class-only ([buffs "Class-only entries"](buffs-debuffs-consumables.md#class-only-entries)):
until a caster class ships, no warrior, druid or paladin gets them, in a preset, a saved setup or
a plan.

## 10. Spell procs

Two triggers join `spellCrit` ([combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic)):

- `spellLanded` (20): a spell of the magic or `none` class landed: a direct hit, a DoT's
  application, a DoT channel's start (its one hit roll), or **each missile** of a channel that
  triggers a spell (Arcane Missiles: every missile is a spell of its own, and fires it if it
  triggers procs). Shadow Weaving, Improved Scorch, Winter's Chill, Clearcasting.
- `spellTick` (21): a spell DoT ticked. Nightfall's Shadow Trance.

A proc on them can name the **schools** that fire it (Shadow Weaving: Shadow) or **one spell**
(Improved Scorch: Scorch; `ProcSpec.schools`, `fromSpell`). A proc that casts a spell (a seal's)
fires that spell's triggers inside the first; the rest of the first trigger's procs still see its
own school and spell. Item procs that deal magic damage (Fiery Weapon) get their school's resist
and multipliers too. Codes 14–19 are left to the parallel tracks.

## 11. Rotation conditions

The class slices' priority lists read the existing conditions (mana, an ability's aura down or due
for a refresh, stacks below a number, time left) and one new one, **`auraUp` (38)**: a plan aura
is up, for a buff a caster spends (Clearcasting, Shadow Trance). A DoT's marker is its ability's
aura, so "Corruption missing or under x s" is `abilityAuraRefresh` on it. Codes 39–41 are left for
the class slices.

## 12. What a class slice uses

The API the caster class slices (K2–K6) build on, in `src/sim/plan/types.ts`:

- **Spells** (`SpellDef`): school, `defense: 'magic'`, `min`–`max`, `spCoefficient`,
  `critMultiplier` (`spellCritMultiplier(talent%)`), `bonusCrit`, `damageMult` (the class's
  talents), `binary`, and a DoT: `dotTicks`, `dotTickMs`, `dotTickDamage`, `dotSpCoefficient`,
  `dotCanCrit` (the periodic-crit flag). A hybrid's DoT gets its own breakdown row.
- **Abilities** (`AbilityPlan`, starting from `CASTER_ROW`): `kind: 'spell'` with `castMs`,
  `castHasted`, `resource: 'mana'`, `costTenths`, and an `aura` that marks its DoT on the boss;
  `kind: 'channel'` with its `spell` (a DoT channel) or `tickSpell`, `rageTicks`, `rageTickMs` (a
  triggering channel), and `channelTicks` to cut it off; `kind: 'cast'` for a cooldown's buff.
- **Auras** (`AuraSpec.mods`): `schoolMask` with `schoolDamage` (your damage, which a DoT
  snapshots), `schoolTaken` (the boss's damage taken, read at each hit and tick: a debuff you keep
  up, including one that counts only your damage, Improved Scorch's and Shadow Weaving's, since
  the sim deals no one else's) and `schoolCrit`; `spellDamage`; `castHaste`; and the mana hooks
  `spiritRegen` and `castingRegen`. A channel's `aura` is up while it channels (Evocation).
- **Static effects** (`Effect`): `schoolDamage`, `schoolTaken`, `schoolCrit`, `targetResistance`,
  `castHaste`, and the stats `fireSpellDamage` … `arcaneSpellDamage`, `spellPen`.
- **Procs** (`ProcSpec`): the `spellLanded` and `spellTick` triggers, `schools`, `fromSpell`.
- **Mana**: `ManaPlan` with `regenTickTenths` from `spiritRegenTickTenths(spirit, class)`.
- **Naming: ticks.** A channel that triggers a spell counts its ticks in `rageTicks` and
  `rageTickMs`: the cast ticks' fields, named for the warrior's Bloodrage, which Consecration's
  ticks already share. A DoT channel's ticks are its spell's `SpellDef.dotTicks` and `dotTickMs`.
  An ability's own `dotTicks`, `dotTickMs` and `dotTickDamage` are a **bleed's** (Rend, Rake): a
  caster ability never sets them, and a channel ignores them.
- **Buffs**: add the class to `CASTER_CLASSES` and its specs to `CASTER_SPECS` in
  `sim/effects/buffs.ts`, and set `SpecMeta.caster` for the sheet's spell block. A class whose
  other specs cast no spells (the druid) needs its entries gated per spec instead.

---

## WoW Forever deviations

What the Forever client changes for casters, read from its tables against Classic Era's
[F] [C] [client] (SpellEffect, SpellMisc, SpellCastTimes, SpellCooldowns, both builds):

- **Periodic crits:** Corruption, Immolate, Shadow Word: Pain, Moonfire, Mind Flay and Fireball's
  DoT carry the periodic-crit flag; no Classic Era spell does.
- **Top-rank base damage is lower, the coefficients the same or higher.** At level 60, before
  spell damage:

  | Spell (rank) | Forever | Classic Era | Coefficient F / C |
  | --- | --- | --- | --- |
  | Frostbolt (11) | 457–493 | 515–555 | 0.814 / 0.814 |
  | Fireball (12) | 425–541, DoT 15 × 4 | 596–760, DoT 19 × 4 | 1.0 / 1.0 |
  | Shadow Bolt (10) | 253–283 | 482–538 | 0.857 / 0.857 |
  | Corruption (7) | 73 × 6 | 137 × 6 | 0.2 / 0.167 a tick |
  | Immolate (8) | 158, DoT 55 × 5 | 279, DoT 102 × 5 | 0.2 + 0.13 a tick, both |
  | Shadow Word: Pain (8) | 127 × 6 | 142 × 6 | 0.2 / 0.167 a tick |
  | Mind Blast (9) | 477–503 | 508–536 | 0.429 / 0.429 |
  | Mind Flay (6) | 130 × 3 | 142 × 3 | 0.167 / 0.15 a tick |
  | Lightning Bolt (10) | 190–212, **2.5 s** | 429–477, 3.0 s | **0.714** / 0.857 |
  | Starfire (7) | 350–412 | 496–584 | 1.0 / 1.0 |
  | Moonfire (10) | 129–151, DoT 60 × 4 | 196–228, DoT 96 × 4 | 0.15 + 0.13, both |

  A rank learned before 60 includes its per-level points to 60 (Mind Blast, Lightning Bolt,
  Moonfire), rounded to whole points. These are the raw client rows; the class slices confirm them against the rendered tooltips, which win where they differ
  ([doctrine §2](../doctrine.md#2-where-numbers-come-from-non-negotiable), [OQ-S8](#open-questions)).
- **Raid debuffs made personal:** Improved Scorch's Fire Vulnerability and Winter's Chill are the
  mage's own, and Shadow Weaving the priest's: Fire Vulnerability and Shadow Weaving stay debuffs
  on the boss but count only their caster's damage, and Winter's Chill raises only the mage's
  crit. Curse of the Elements covers every magic school, Holy included, and Curse of Shadow is
  gone ([§9](#9-caster-raid-buffs-and-debuffs)).
- **Moonkin Aura** is all crit (Classic Era spell crit). **Mage Armor** keeps 50% of regeneration
  while casting (30%). **Berserking** is a flat +10% casting and attack speed for 10 s (10–30% by
  health). The gloves' **Minor Haste** adds casting speed.
- **No Totem of Wrath or Wrath of Air.** Spell hit's floor is 0% ([§1](#1-spell-hit)).

---

## Implementation notes

- **The spell table** is the paladin's `castSpell` in `sim/engine/sim.ts`, extended: a binary
  spell's resist joins its hit roll; a pure DoT rolls no crit as it lands; the damage reads the
  school's spell damage, your school multiplier, the boss's damage taken and the school's average
  resist (`resistFactor`), all 1 and the level-based resist for a plan without caster effects, so
  every warrior, druid and paladin result is unchanged, bit for bit.
- **Schools** are arrays by `SCHOOL` code: the plan's static numbers (`Plan.schools`, absent when
  plain) and the active auras' (`recomputeSchools`, only when an aura with school mods starts or
  ends). Resistance is static: the plan works it out per school (`schoolPlan`).
- **DoTs** have one slot per plan spell: ticks left, generation, next tick, snapshot damage and
  crit. A tick is an event (`EV_SPELL_DOT_TICK`); the marker aura is up from the application until
  the last tick.
- **Channels** reuse the cast ticks (Consecration's) for a triggering channel, or the spell's DoT
  for a DoT channel, and an end event (`EV_CHANNEL_END`) that delivers a tick due that moment
  first, then cuts off the rest and takes down the channel's own aura (`channelAura`), which is
  queued to expire just after it.
- **Casting speed** is the derived stats' (`castHasteMult`: Π casting speed × haste rating's %)
  times the auras'. It divides only the casts marked `castHasted`, so Slam and Hammer of Wrath keep
  their fixed cast times.
- **Not modelled** (each under 0.5% of a caster's DPS, or not a rate): projectile travel time
  (it delays a hit, never removes one, [damage-and-timing §3.6](damage-and-timing.md#36-server-tick-and-spell-batching)
  for latency), pushback (a DPS caster isn't hit), the 0/25/50/75% partial-resist buckets (the
  average keeps the mean), and the debuff limit ([buffs §4.3](buffs-debuffs-consumables.md#43-debuff-slot-limit)).

---

## Worked examples

Each is a unit test (`src/sim/core/spells-examples.test.ts`). Profile `forever` unless named;
the boss is level 63, the caster 60.

1. **Hit.** No hit from gear: 17% miss, 83% land. 9% hit (90 hit rating): 8% miss. 17%: 0% in
   `forever`; 16% in `classicEra` leaves its 1% floor.
2. **Binary resist.** A binary Frost spell with no hit: resisted whole `17 + 83 × 0.06 = 21.98%`
   of casts; a pure damage one 17%.
3. **Partial resist.** A 1,000-damage Fire spell lands for `1,000 × (1 − 0.06) = 940` on average;
   a Holy one 1,000.
4. **Coefficients.** Cast time 3.0 s: 3/3.5 = 0.857; 1.5 s and an instant: 0.429; 4.0 s: 1.0.
   Frostbolt's slow: 0.857 × 0.95 = 0.814, the client's.
5. **A hit, with its multipliers.** A 500-base Shadow spell, coefficient 0.857, 600 Shadow spell
   damage, Curse of the Elements (+10%): `(500 + 514.2) × 1.1 × 0.94 = 1,048.68`; a crit ×1.5:
   1,573.02; with Ruin (×2): 2,097.37.
6. **Casting speed.** A 3.0 s cast with Mind Quickening (+33%): `3,000 / 1.33 = 2,255.6 → 2,256 ms`;
   a 2.5 s one with Forever's Berserking (+10%): 2,273 ms; a 1.5 s one: 1,128 ms, but the next
   waits for the 1.5 s GCD.
7. **A DoT's tick.** Forever's Corruption row, 73 a tick and 0.2 a tick, with 500 Shadow spell
   damage: `(73 + 100) × 0.94 = 162.62` a tick, 975.72 over 6 ticks; its crit ×1.5: 243.93.
8. **Spirit regeneration.** 200 Spirit, per 2 s tick: mage and priest `13 + 50 = 63`, warlock 58,
   druid, shaman and paladin 55. With Mage Armor's 50% inside the five-second rule, a mage gets
   31.5.
9. **Crit multipliers.** No talent ×1.5; Ice Shards 3/5 (+60%): ×1.8; 5/5: ×2.0.
10. **Resistance.** Curse of the Elements on a 0-resistance boss: `24 + max(0, 0 − 75) − 0 = 24`,
    6%, in both profiles. With 10 spell penetration: 14 (3.5%). With 40: `forever` −16, an
    average resist of −4%, so ×1.04; `classicEra` 0.
11. **Clipping.** Arcane Missiles, 5 ticks a second apart: cut after 3, three missiles and the
    next cast at 3 s; after 1, one missile and the next cast at 1.5 s (the GCD).

---

## Open questions

Each with its estimated effect on a caster's DPS, per [D24](../decisions.md). None blocks K1: no
caster spec ships in it.

- **OQ-S1: binary spells.** Which Forever spells are binary, and does the rule hold (resisted
  whole at `miss + (1 − miss) × resist`, never partially)? The class slices mark them from the
  spell's effects. Effect: a binary spell loses about 5% of casts instead of 6% of its damage,
  under 1%.
- **OQ-S2: the level-based resistance.** 24 [?] (6%); other sources say about 15. Do debuffs or
  spell penetration reduce it, and does Forever's negative resistance apply in combat? Effect: up to
  2–3% of every non-Holy spell's damage. Test: average a Frostbolt's partial resists over 200 casts
  on a level-63 dummy.
- **OQ-S3: DoT resists.** Partial resists on each tick (the default) or binary at the application?
  Effect: under 1%.
- **OQ-S4: DoT crits in Forever.** Do flagged ticks crit in combat, at the caster's spell crit,
  ×1.5, and do they fire crit procs? Effect: a DoT's damage × crit% × 0.5, 5–10% of a warlock's
  DoTs. Test: a combat log of Corruption ticks.
- **OQ-S5: DoT refresh.** Is the partial tick lost on a recast, as the default has it? Effect: under
  1% for a rotation that refreshes at the end.
- **OQ-S6: channels.** Is Mind Flay's hit rolled once, and does casting speed shorten channels?
  Effect: under 1% (hit), 0 at pre-raid (speed).
- **OQ-S7: casting speed from haste rating** (D12's switch) and the GCD under haste in Forever.
  Effect: at most the rating's %, and 0 without haste gear.
- **OQ-S8: the top-rank base damage.** The raw rows above are far below Classic Era's (Shadow Bolt
  −47%); the class slices confirm them against the rendered tooltips before using them. Effect:
  large, per spell.
- **OQ-S9: Winter's Chill's chance.** Its tooltip reads "$m2% chance", and effect 2's points are
  0; the aura's `ProcChance` is 100. Effect: Frostbolt's crit, up to +10%.
- **OQ-S10: Nightfall's uptime** for a Buffs entry (its proc rate is server-side; Classic Era sims
  use 15% a swing, [R1][r1-const]). Effect: +15% for its uptime, 0 while it isn't offered.
- **OQ-S11: Spirit regeneration in Forever:** the [C] formulas per class. Effect: under 1% unless a
  spec runs out of mana.
- **OQ-S12: Holy damage taken with Judgement of the Crusader:** Curse of the Elements' +10% after
  its flat +161 (the default) or before. Effect: under 0.2% for a paladin. **The paladin doesn't
  get Curse of the Elements yet**, though the buffs doc's presets list it for them: K1 leaves every
  paladin result unchanged, and the gap (a few percent of Retribution's DPS) is in the milestones'
  known gaps.
- **OQ-S13: projectile travel time** isn't modelled: a debuff a projectile applies (Winter's Chill,
  Improved Scorch) lands up to a second late in game. Effect: under 0.5%.

---

## Sources

- [client] Forever beta client 1.60.1.69913 and Classic Era 1.15.9.69722, read through the
  wago.tools API ([data/client.md](../data/client.md)): SpellEffect, SpellMisc, SpellCastTimes,
  SpellDuration, SpellCooldowns, SpellCategories, SpellName, gametables.
- [R1] ronkuby's Classic Era fire-mage simulation, pinned before Season of Discovery (commit
  9ae1d3bb, 2023-10-19): [constants][r1-const], [mechanics][r1-mech].
- [Warcraft Tavern, WoW Classic mana guide][wt-mana] (Classic, not SoD).
- [anlif, Classic warlock quick maths, Shadow Bolt][anlif-sb] (2019).
- Classic players, not staff: [boss resistances][mmoc-res] (2020), [DoT snapshotting][mmoc-dot]
  (Classic beta, 2019). Weak evidence, cited only as corroboration.

[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[ui-stats]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua
[gs-forever]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[amr-hit]: https://forums.askmrrobot.com/t/hit-rating-and-hit-caps-in-wow-classic/8614
[r1-const]: https://github.com/ronkuby-mage/fire-mage-simulation/blob/9ae1d3bbbdeba7468b48f02c28aafa747c17f26d/src/sim/constants.py
[r1-mech]: https://github.com/ronkuby-mage/fire-mage-simulation/blob/9ae1d3bbbdeba7468b48f02c28aafa747c17f26d/src/sim/mechanics.py
[wt-mana]: https://www.warcrafttavern.com/wow-classic/guides/mana-management-optimization/
[anlif-sb]: https://github.com/anlif/classic_warlock_quickmaths/blob/e0016e5/shadowbolt_damage.md
[mmoc-res]: https://www.mmo-champion.com/threads/2547179-Boss-resistances-in-classic-(Spell-pen-)
[mmoc-dot]: https://www.mmo-champion.com/threads/2497466-Dot-Snapshotting-in-Classic
