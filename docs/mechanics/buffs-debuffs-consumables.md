# Buffs, debuffs, consumables and enchants

The cross-class catalogue the UI's buff, debuff, consumable and enchant toggles are built
from, with the default presets. It covers raid and party buffs from every class, target
debuffs, consumables, and permanent and temporary item enchantments that change a level-60
Warrior's, Feral Druid's or Paladin's DPS or TPS. **WoW Forever changed a lot here.** Most
long-duration buffs now last 1 hour. Battle Shout, Blessing of Might and Strength of Earth
got weaker, and the talents that improved them are gone. Mark of the Wild, Grace of Air,
Fortitude and Expose Armor got stronger. Trueshot Aura no longer gives melee attack power.
Windfury Totem became a party aura, and Sanctity Aura, Blessing of Sanctuary and Faerie Fire
(Feral) were removed. Windfury, Grace of Air and Tranquil Air don't stack, even from different
shamans (1.60.1.70009). Food now gives flat attack power or crit, many glove
and bracer enchants were buffed, and alchemy gained new elixirs. A new camping system
gives weaker 1-hour copies of the class buffs. Both factions can field paladins and
shamans. Class-specific self-buffs (seals, stances, forms, Seal of the
Crusader's attack-power half) live in the class docs; this doc owns everything a *second*
player or an item provides.

Status: researched 2026-09-22 · Classic Era values checked 2026-09-23 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified

Forever data: beta client **1.60.1.69913** (2026-09-18) vs Classic Era **1.15.9.69722**,
read from foreverchanges.pro (spellbooks, change log, item data files, enchanting recipes)
and from the raw client files of both builds.

**Client data.** A source cell `[client] (Table, build)` means the value was read from that
raw DB2 file, fetched through the wago.tools API and parsed by `scripts/scrape/client.mjs`
([client.md](../data/client.md)). The client check confirmed every value this doc had marked
for a browser check, with two corrections: **Frenzy potions share the potion cooldown**, and
Blessed Sunfruit's item casts 18124, which triggers the buff 18125. Classic's enchant table
has no duration column, so Windfury enchant 564's 10 s is Forever's value only. Raw files
lack server hotfixes and server scripts (dummy effects, PPM rates, the Hyjal flasks' zone
bonus), which stay as tagged ([hotfix caveat](../data/client.md#hotfix-caveat)).

**Tag rules for this doc.** **[F]** means the value was read from the Forever beta client,
through foreverchanges.pro or the raw client files. That includes values the Forever client shows
*unchanged* from Classic (foreverchanges' "Same as Classic" or "Unchanged" tab, or an
identical DB2 row); for those the number is the Classic tooltip, now confirmed in the
Forever client. **[C]** is used only where Forever data is silent. **[?]** entries also
appear in [Open questions](#open-questions).

**Reading the tables.** "X (C: Y)" means the Forever value is X and the Classic Era value
was Y. A value with no "(C: …)" is identical in both clients. IDs are spell IDs for buffs
and debuffs, item IDs for consumables (with the buff spell ID after `→`), and
enchanting-spell / SpellItemEnchantment IDs for enchants. The `classicEra` rule profile uses
the Classic Era values; [Classic Era values](#classic-era-values) lists every catalogue entry
in both clients with its client rows.

---

## Contents

1. [What the sim needs](#what-the-sim-needs)
2. [Raid and party buffs](#1-raid-and-party-buffs)
3. [World buffs: excluded](#2-world-buffs-excluded)
4. [Consumables](#3-consumables)
5. [Target debuffs](#4-target-debuffs)
6. [Enchants and item enhancements](#5-enchants-and-item-enhancements)
7. [Default presets](#6-default-presets)
8. [WoW Forever deviations](#wow-forever-deviations)
9. [Implementation notes](#implementation-notes)
10. [Worked examples](#worked-examples)
11. [Open questions](#open-questions)
12. [Sources](#sources)

---

## What the sim needs

- **A toggle per catalogue entry**, grouped as in this doc, each carrying: its effects, its
  scope (self / party / raid / target), the composition flag that makes it available
  ([§6](#61-composition-flags-not-factions)), and its exclusivity group
  ([Implementation notes](#exclusivity-groups)).
- **Effect primitives** the stat pipeline and combat engine must support. Stat order and
  rounding are owned by [character-stats](character-stats.md); armor math by
  [damage-and-timing](damage-and-timing.md).
  - Flat primary stats (Str, Agi, Sta, Int, Spi), including "all stats".
  - **% all stats** (Blessing of Kings, applied after flat bonuses).
  - Flat melee AP (Battle Shout, Blessing of Might, Juju Might), and flat melee+ranged AP.
  - Flat % crit (Leader of the Pack, Mongoose, Elemental Sharpening Stone, food), % attack
    speed (Juju Flurry, Minor Haste gloves, Arcanum of Rapidity), % hit (a Hyjal flask). An
    all-crit aura (290: Leader of the Pack, Mongoose, Grilled Squid, the Aggression flask in
    Forever) is spell crit too, for magic procs
    ([character-stats](character-stats.md#implementation-notes)); aura 52 (Elemental
    Sharpening Stone, Might of the Scourge, and Classic Era's Leader of the Pack and Mongoose) is
    melee and ranged crit only.
  - Armor, max health, dodge %, defense skill, block value, threat % (Salvation, Threat
    gloves), flat weapon damage (sharpening stones, Striking/Impact enchants), and flat
    spell or Holy damage (paladins).
  - Proc effects: Windfury Totem's extra attack; weapon enchants (Crusader and similar,
    PPM-based); target debuffs applied on hit (Annihilator).
  - **Target debuffs**: armor reduction (summed; floored at 0 in `classicEra`, allowed to go
    negative in `forever`, per [damage-and-timing §1.2](damage-and-timing.md#12-armor-reduction-debuffs-and-penetration)), +Holy damage taken,
    +magic damage taken %, and reductions to boss AP, attack speed and physical damage done.
    The last three matter only for tank rage and survival.
- **Cooldown categories for on-use items**: potions, Frenzy potions included (shared 2 min), runes (shared 2 min,
  separate from potions), explosives (shared 1 min), and the Blasted Lands buffs (shared
  1 h). One entry of a category is on at a time, as an exclusive group. See
  [Implementation notes](#on-use-items-and-cooldown-categories).
- **One temporary enchant per weapon** (stone, oil or poison): one stone or oil is on at a time,
  and a rogue picks a poison per hand. In Classic, Windfury Totem
  took the main-hand slot, and the `classicEra` profile models that; in Forever it probably
  doesn't. See [Windfury Totem](#windfury-totem).
- **Presets** built on raid composition, not faction ([§6](#6-default-presets)).
- **Class-only entries.** An entry that does nothing for the other classes (mana, spell damage:
  the paladin's and the shaman's), or that only some classes can use (the Mighty Rage Potion: warriors and
  druids), says which classes it's for. The Buffs tab lists it only for them, presets
  skip it for the others, and a saved setup of another class drops it
  ([Implementation notes](#class-only-entries)).
- **No world buffs** ([§2](#2-world-buffs-excluded)).
- **Camp buffs** (a new Forever system) as optional fallbacks for missing classes
  ([§1.3](#13-camp-buffs-new-forever-system)).

### Percentages vs ratings

Forever *gear* tooltips replace percentage stats with ratings: 14 crit rating per 1%, 10
hit per 1%, 12 dodge, 15 parry, 5 block, and defense 1:1 ([data/items.md, "Forever's
ratings"](../data/items.md#forevers-ratings-f-with-open-questions)). **No consumable,
enchant or temporary enhancement in this catalogue uses a rating in its Forever tooltip.**
Every consumable-class tooltip in foreverchanges' `new`, `changed` and `missing` files was
checked, and none contains "Rating", "Expertise" or "Armor Penetration". The unchanged ones
(Elemental Sharpening Stone, Might of the Scourge, the arcanums, the ZG enchants) keep their
Classic percentage text [F] [[fc-items]]. So the engine applies these as **percentages
directly**, with no rating conversion. The rating equivalents below are for comparison
only.

| Entry | Forever tooltip (%) | Rating equivalent at Forever's ratios |
| --- | --- | --- |
| Elemental Sharpening Stone; Elixir of the Mongoose / Grizzly (crit part) | +2% crit | 28 crit rating |
| Grilled Squid, Hot Smoked Bass; Might of the Scourge (crit part); Shield – Critical Strike | +1% crit | 14 crit rating |
| Flask of Natural Aggression (Hyjal zones) | +4% crit | 56 crit rating |
| Flask of Natural Accuracy (Hyjal zones) | +5% hit | 50 hit rating |
| Dark Desire / Fire-toasted Bun (holiday) | +2% hit | 20 hit rating |
| Cloak – Dodge; Arcanum of Protection | +1% dodge | 12 dodge rating |
| Shield – Lesser Block | +2% block | 10 block rating |
| Gloves – Minor Haste; Arcanum of Rapidity | +1% attack speed (Minor Haste also +1% casting) | Not a rating in either tooltip |
| Defense enchants (Deflection +7, Superior Deflection +9, Wild Leather Armor Kit +4) | Stated as "Defense" or "defense skill" | 1:1 defense rating |

---

## 1. Raid and party buffs

Both factions can field paladins and shamans in Forever: Undead paladins on the Horde and
Dwarf shamans on the Alliance are new **[F]**. The Forever client's `CharBaseInfo` table lists
these pairs (56, Undead paladin included) [F] [client] (CharBaseInfo, 1.60.1.69913);
[character-stats](character-stats.md#legal-races-for-the-sims-classes) owns the
matrix. foreverchanges' racials page marks
its own copy community-reported (`reported_compatibility`, transcribed from BlizzCon footage;
see [data/races.md](../data/races.md)), but the client table is the primary source
[[fc-racials]](https://foreverchanges.pro/racials) [[fc-beta]](https://foreverchanges.pro/beta).
**Do not gate any buff by faction.** Gate it by the composition flags in
[§6.1](#61-composition-flags-not-factions).

### 1.1 Attack power, stats and crit

| Name | ID | Effect (max rank) | Duration | Stacking / exclusivity | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Battle Shout (r7) | 25289 | **+139** melee AP (C: 232). Every rank is a flat 0.6× of Classic (9 / 21 / 33 / 51 / 78 / 111 / 139); see [warrior](../classes/warrior.md) | **3 min** (C: 2 min) | Party within 20 yd (Booming Voice adds radius only; it no longer adds duration). Stacks with Blessing of Might and all other AP | Warrior | [F] | [fc-sb-warrior] · [fc-changes] · [client] (SpellEffect, 1.60.1.69913) |
| Improved Battle Shout | talent (C: 12318) | **Removed** (C: +25% Battle Shout AP at 5/5) | — | — | — | [F] | [fc-changes] |
| Blessing of Might (r7) | 25291 | **+133** melee AP (C: 185) | **1 h** (C: 5 min) | One Blessing per paladin on a player; stacks with Battle Shout | Paladin | [F] | [fc-sb-paladin] · [client] (SpellEffect, 1.60.1.69913) |
| Greater Blessing of Might (r2) | 25916 | **+133** melee AP to every raid member of the target's class (C: 185) | **1 h** (C: 15 min) | Same blessing slot as Blessing of Might from that paladin | Paladin | [F] | [fc-sb-paladin] |
| Improved Blessing of Might | talent (C: 20042) | **Removed** (C: +20% at 5/5) | — | — | — | [F] | [fc-changes] |
| Blessing of Kings | 20217 | +10% all stats | **1 h** (C: 5 min) | One Blessing per paladin | Paladin, **trained at level 20** (C: Protection talent) | [F] | [fc-sb-paladin] · [fc-changes] |
| Greater Blessing of Kings | 25898 | +10% all stats, class-wide | **1 h** (C: 15 min) | As above | Paladin | [F] | [fc-sb-paladin] |
| Mark of the Wild (r7) | 9885 | **+385** armor, **+16** all stats, **+27** all resistances (C: 285 / 12 / 20) | **1 h** (C: 30 min) | Single target; same buff as Gift of the Wild | Druid (castable in Moonkin Form too) | [F] | [fc-sb-druid] · [client] (SpellEffect, 1.60.1.69913) |
| Gift of the Wild (r2) | 21850 | As Mark of the Wild, **whole raid** (C: target's party) | 1 h | Same as Mark of the Wild | Druid | [F] | [fc-sb-druid] |
| Improved Mark of the Wild | talent (C: 17050) | **Removed** (C: +35% at 5/5) | — | — | — | [F] | [fc-changes] |
| Leader of the Pack | 17007 (aura 24932) | +3% crit to the party within 45 yd. The Forever tooltip says "critical strike chance", and the aura is all-crit (aura 290 = 3) (C: melee and ranged crit) | While the druid is in Cat, Bear or Dire Bear Form | **Exclusive with Moonkin Aura** (Forever tooltip); several druids don't stack | Feral druid talent | [F] | [fc-changes] · [client] (SpellEffect, 1.60.1.69913) |
| Moonkin Aura (Moonkin Form) | 24907 | **+3% crit (all)** to the party within 45 yd (C: +3% *spell* crit, 30 yd) | While in Moonkin Form | Exclusive with Leader of the Pack | Balance druid talent. The casters' Buffs entry ([spells §9](spells.md#9-caster-raid-buffs-and-debuffs)); a Balance druid's own Moonkin Form brings it, so its Buffs tab shows it on and locked, and a Leader of the Pack in its group adds nothing ([druid §11.1](../classes/druid.md#111-moonkin-form)) | [F] | [fc-changes] · [client] (SpellEffect, 1.60.1.69913) |
| Power Infusion | 10060 | +20% spell damage (every magic school), 15 s | 3 min cooldown | — | Priest talent, cast on another player. The casters' Buffs entry, which a caster's rotation presses on cooldown ([spells §9](spells.md#9-caster-raid-buffs-and-debuffs)) | [F] | [client] (SpellEffect, SpellCooldowns, 1.60.1.69913) |
| Trueshot Aura (r5) | 20906 (r1 1299346) | **Ranged AP only** in Forever: 30 / 40 / 50 / 75 / 50 by rank (C: +50 / 75 / 100 melee **and** ranged AP) | 30 min | Party within 45 yd | Hunter talent | [F] | [fc-sb-hunter] · [fc-changes] |
| Strength of Earth Totem (r5) | 25361 | **+53** Str (C: 77) | **5 min**, 30 yd (C: 2 min, 20 yd) | Party only. Earth totem, so it excludes Stoneskin Totem from the same shaman | Shaman | [F] | [fc-sb-shaman] |
| Grace of Air Totem (r3) | 25359 | **+89** Agi (C: 77) | **5 min**, 30 yd (C: 2 min, 20 yd) | Party only. Air totem, so it excludes Windfury Totem from the same shaman | Shaman | [F] | [fc-sb-shaman] |
| Windfury Totem (r3) | 10614 (proc 10610) | Each main-hand hit has a 20% chance to grant 1 extra attack with **+246** AP (C: +315) | **5 min** (C: 2 min) | Party only, air totem. **Party aura in Forever, weapon enchant in Classic**; see [Windfury Totem](#windfury-totem) | Shaman | [F] | [fc-sb-shaman] · [client] (SpellEffect, SpellAuraOptions, 1.60.1.69913) |
| Enhancing Totems / Improved Weapon Totems / Totemic Mastery | talents (C: 16259 / 29192 / 16189) | **Removed** (C: +15% SoE/GoA; +30% Windfury AP; 30 yd radius). Forever's totems have 30 yd baseline | — | — | — | [F] | [fc-changes] |
| Power Word: Fortitude (r6) | 10938 | **+70** Sta (C: 54) | **1 h** (C: 30 min) | Same buff as Prayer of Fortitude | Priest | [F] | [fc-sb-priest] · [client] (SpellEffect, 1.60.1.69913) |
| Prayer of Fortitude (r2) | 21564 | **+70** Sta, **whole raid** (C: 54, party) | 1 h | As above | Priest | [F] | [fc-sb-priest] |
| Improved Power Word: Fortitude | talent (C: 14749) | **Removed** (C: +30%) | — | — | — | [F] | [fc-changes] |
| Divine Spirit (r4) / Prayer of Spirit | 27841 / 27681 | +40 Spi; Prayer of Spirit covers the whole raid (C: party) | **1 h** (C: 30 min for Divine Spirit) | — | Priest; **Divine Spirit is trained at level 30** (C: Discipline talent) | [F] | [fc-sb-priest] |
| Arcane Intellect (r5) / Arcane Brilliance | 10157 / 23028 | +31 Int; Arcane Brilliance covers the whole raid (C: party) | **1 h** (C: 30 min for Arcane Intellect) | — | Mage. Matters only to paladins | [F] | [fc-sb-mage] |
| Blood Pact (r5) | 11767 | Party Stamina: client base **49** + 0.5/level (C: 38 + 0.4/level, about 42 at 60). **Improved Imp no longer boosts it** | While the Imp is out | Party only | Warlock with Imp | [F] / [C] client values · [?] total at 60 | [client] (SpellEffect, 1.60.1.69913 and 1.15.9.69722) · [fc-changes] |

### 1.2 Threat, defense and mana

| Name | ID | Effect (max rank) | Duration | Stacking / exclusivity | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Blessing of Salvation | 1038 | −30% threat generated | **1 h** (C: 5 min) | One Blessing per paladin. **Default off for tanks** | Paladin | [F] | [fc-sb-paladin] · [client] (SpellEffect, 1.60.1.69913) |
| Greater Blessing of Salvation | 25895 | −30% threat, class-wide | **1 h** (C: 15 min) | Class-wide, so it also hits warrior/druid/paladin tanks of the same class unless they cancel it | Paladin | [F] | [fc-sb-paladin] |
| Blessing / Greater Blessing of Sanctuary | 20914 / 25899 | **Not in Forever** (C: −24 damage taken per hit, 35 Holy on block) | — | — | Removed spell and talent | [F] | [fc-sb-paladin] (missing list) · [fc-changes] |
| Tranquil Air Totem | 25908 → 25909 | −20% threat, party (aura 10 = −20) | 5 min | An air totem: doesn't stack with Windfury or Grace of Air, **even from another shaman** (1.60.1.70009) | Shaman, if it can be cast at all [?]; not in the catalogue: it only lowers threat, in the air slot Windfury or Grace of Air fills | [F] notes; [?] whether a shaman has it | [dev-70009] · [client] (SpellEffect, SpellMisc, SpellName, 1.60.1.70009): the aura 25909 is in the client and gains the air totems' shared `Attributes[11]` 0x400, but the totem spell 25908 isn't (no row, not an encrypted one), nor in the trainer data (SkillLineAbility). This doc read it as removed until the notes named it |
| Devotion Aura (r7) | 10293 | +735 armor, party within 30 yd | Aura | One Aura per paladin on a player. **Improved Devotion Aura removed** (C: +25%) | Paladin | [F] | [fc-sb-paladin] · [fc-changes] |
| Retribution Aura (r5) | 10301 | **30** Holy damage to each melee attacker (C: 20), + 0.08 × its caster's spell damage since 1.60.1.70009 [?] (below) | Aura | One Aura per paladin; Improved Retribution Aura removed | Paladin | [F] | [fc-sb-paladin] |
| Sanctity Aura | talent (C: 20218) | **Removed** (C: +10% Holy damage, party) | — | — | — | [F] | [fc-changes] |
| Stoneskin Totem (r6) | 10408 | −30 **Physical** damage taken per hit (C: melee damage) | **5 min**, 30 yd (C: 2 min, 20 yd) | Earth totem, so it excludes Strength of Earth from the same shaman | Shaman | [F] | [fc-sb-shaman] |
| Thorns (r6) | 9910 | **22** Nature damage to each melee attacker (C: 18), + 0.08 × its caster's spell damage since 1.60.1.70009 [?] (below) | 10 min | — | Druid. On the tank: a damage shield on the boss's swings (below) | [F] | [fc-sb-druid] · [client] (SpellEffect, 1.60.1.70009) |
| Blessing of Wisdom (r6) / Greater (r2) | 25290 / 25918 | **40** mana per 5 s (C: 33) | **1 h** (C: 5 / 15 min) | One Blessing per paladin | Paladin. Only paladins use it | [F] | [fc-sb-paladin] |
| Mana Spring Totem (r4) | 10497 | 10 mana per 2 s to the party | **5 min**, 30 yd (C: 1 min, 20 yd) | Water totem | Shaman. Only paladins, shamans and mages use it | [F] | [fc-sb-shaman] |

**Thorns on the tank** (`thorns`; M5.6 T3, BR5). A damage shield (aura 15) of 22 Nature damage,
plus its caster's spell damage × 0.08 (below), to the boss on each of its swings that lands on the
tank, a hit, crit, crushing blow or block, as
Retribution Aura's is ([paladin](../classes/paladin.md#other-abilities)): it always lands and never
crits [?], and as a pure Nature damage spell the boss's resistance takes its average share (6% at
24 resistance, [spells §3](spells.md)). Its threat is its damage × the tank's threat multipliers
(stance, form; not Righteous Fury, which is Holy only) [?]: no tooltip gives it a threat of its
own ([threat.md's wording table](threat.md#threat-wording-table): no threat words). A bear casts it
on itself before the pull (it lasts 10 min), so it's in every bear preset and Self only
(`selfCast`). In a raid a druid puts it on the main tank, so every tank's Standard and Max-consumables
raid presets have it, as they have Devotion Aura, when a druid is in the raid (T2's fix round, T3R-2;
[D29](../decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24):
a known effect isn't left at zero). Only a tank takes the boss's swings, so for any other spec it does
nothing, and the Buffs tab says so. At the flat 22 it was about 10 TPS for a bear (+1.0%), 9.5 for a
warrior (+1.0%) and 9.1 for a Protection paladin (+1.1%, on its T2 defaults; seed 424242, 20,000
fights); with the scaling below, 21.8 TPS for the paladin (+3.0%, its 1.60.1.70009 defaults, the
same seed).

**Damage shields that scale with spell power** (1.60.1.70009). The build's dev notes say Thorns and
Retribution Aura "will now dynamically update [their] values based on the caster's spell power" (Thorns
"reverts to its base values" when the caster can't be found or is too far away) [F]. The client
carries no coefficient for either (9910 and 10301: `EffectBonusCoefficient` 0 on the damage-shield
aura [F] [client] (SpellEffect, 1.60.1.70009)), so the server holds it, and the sim needs a default
(D29):
- **The coefficient, 0.08** [?]: Holy Shield's damage on each block (20928 effect 1, aura 43, 221 +
  0.08 × spell damage), the Forever client's closest analog: a damage shield that deals its damage on
  every attack it meets, with no internal cooldown. Lightning Shield's 0.267 a ball (26363) is the
  other allowed reading, but its balls fire at most every few seconds and are used up. At 0.267,
  Thorns on a Protection paladin would make about 52 TPS rather than 22 (paladin.md open question 29).
- **The caster's spell damage.** Retribution Aura is your own, so it's your spell damage (a
  Protection paladin's 379 in its default setup: 30 + 30.3 a swing). Thorns on a tank comes from a raid
  druid in the raid presets, so the sim takes **389**, the sim's default Balance druid's Nature spell
  damage [?]: 22 + 0.08 × 389 = 53.12, dealt as a whole **53** a swing [?], for every tank alike. A bear that casts its own,
  with no spell damage, would deal the base 22; the sim gives every tank the raid druid's
  (`THORNS_CASTER_SPELL_DAMAGE`, `DAMAGE_SHIELD_SP_COEFFICIENT` in `src/sim/effects/buffs.ts`).

### 1.3 Camp buffs (new Forever system)

A cook places a campfire and other players add profession objects. Anyone who sits by the
fire for a minute gets each object's buff **for 1 hour**, and can leave once they have it.
**Each camp buff does not stack with the class buff it copies**, and the class versions are
stronger at level 60 [F] ([fc-camping] · [fc/279979](https://foreverchanges.pro/item/279979)).
They matter only as **fallbacks when the matching class is missing**, so they default off
in every preset. The UI can offer "use camp buff if the class buff is off".

| Camp object (profession) | Buff at level 60 | Exclusive with | Tag | Source |
| --- | --- | --- | --- | --- |
| Lodestone (Mining) | +90 melee AP | Blessing of Might | [F] | [fc-camping] |
| Sharpening Wheel (Blacksmithing) | +34 Str | Strength of Earth Totem | [F] | [fc-camping] |
| Camp Chair (Skinning) | +2% crit with all spells and attacks | Moonkin Aura (and so, presumably, Leader of the Pack [?]) | [F] | [fc-camping] · [fc/279979](https://foreverchanges.pro/item/279979) |
| Fish Bowl (Fishing) | +8% all stats | Blessing of Kings | [F] | [fc-camping] · [fc/279967](https://foreverchanges.pro/item/279967) |
| Enchanted Lute (Enchanting) | +308 armor, +13 all stats, +22 all resistances | Mark of the Wild | [F] | [fc-camping] |
| First Aid Kit (First Aid) | +56 Sta | Power Word: Fortitude | [F] | [fc-camping] · [fc/279968](https://foreverchanges.pro/item/279968) |
| Faction Banner (Tailoring) | +32 Spi (own faction only) | Divine Spirit | [F] | [fc-camping] |
| Incense Candle (Herbalism) | +25 Int | Arcane Intellect | [F] | [fc-camping] |
| Mana Well (Alchemy) | 29 mana per 5 s | Blessing of Wisdom | [F] | [fc-camping] |

Unconfirmed on the site: whether camps work in instances, and whether you must be grouped
to get another player's camp buff. The 1-hour buff can be picked up outside the raid either
way. The Legacy perk *Permanence* lengthens class raid buffs and camp buffs by 50 / 100%,
which doesn't matter inside one fight [F] [[fc-camping]].

### Windfury Totem

- **Classic Era [C]:** Windfury Totem works as a main-hand weapon enchant. It **replaces**
  any main-hand sharpening stone, weightstone, oil or poison, which is why Horde warriors
  used an Elemental Sharpening Stone only on the off-hand ([Blizzard forum,
  Classic][bnet-cons] · [Almar][almar-tank]). The Classic tooltip says it "enchants all
  party members main-hand weapons … Each hit has a 20% chance of granting the attacker 1
  extra attacks with 315 extra melee attack power" [[fc-sb-shaman]]. Client detail
  ([client] (SpellEffect, SpellItemEnchantment, 1.15.9.69722)): the totem's passive (10612)
  pulses 10611 every 5 s, and 10611 applies temporary enchant **564 "Windfury Totem 3"**,
  which procs 10610 (20%). Classic's `SpellItemEnchantment` has no duration column, so the
  enchant's 10 s can't be read there; Forever's row for 564 says 10 s.
- **Forever [F]:** the tooltip was rewritten to "The totem **enhances the melee attacks** of
  all party members … Each main hand hit has a 20% chance of granting the attacker 1 extra
  attack with **246** extra melee attack power. Lasts 5 min." Windfury Weapon's Forever
  tooltip adds: "When applied to main hand, disables any benefit you personally receive
  from Windfury Totem" [[fc-sb-shaman]]. Client detail ([client] (SpellEffect,
  SpellAuraOptions, SpellName, 1.60.1.70009)): 10612 is now a party area aura, a **proc-trigger
  aura** (aura 42; a dummy, aura 4, until 1.60.1.70009, when it was also renamed "Windfury
  Totem" from "Windfury Totem Passive") with a 20% proc chance that triggers 10610 directly, with
  a **100 ms internal cooldown** (`ProcCategoryRecovery` 100). 10610 grants +246 AP and 1 extra
  attack; its AP aura has 2 charges and lasts 1 s. 10611, the spell that applied the weapon
  enchant, no longer exists. Nothing the sim does changes with the aura type: the proc was
  already modelled as one.
- **Consequence [?]:** in Forever, a main-hand sharpening stone or weightstone should
  coexist with Windfury Totem. The sim should allow it, flagged as an assumption until the
  beta confirms. Twisting Windfury with Grace of Air no longer works: the aura disappears with
  the totem, and since 1.60.1.70009 the two don't stack even from different shamans
  ([dev-70009]). See [Open questions](#open-questions).
- **`classicEra` [C]:** the totem's enchant takes the main hand's temporary-enchant slot, so
  a main-hand stone does nothing while the totem is up; the off hand keeps its own (which is
  where Classic warriors put an Elemental Sharpening Stone). With a two-hander, no stone
  applies at all.
- **Extra-attack rules [C]:** a Windfury extra attack can't proc Windfury, and Windfury can't
  proc twice in one chain of extra attacks ([Magey › Windfury Totem][magey-wf], text from 2019).
  `forever` also applies the client's 100 ms internal cooldown [F]; `classicEra` has none (the
  SoD-era 1.5 s cooldown stays refused). These rules are owned by
  [damage-and-timing §5.4](damage-and-timing.md#54-extra-attacks-and-chaining).

---

## 2. World buffs: excluded

**Not available in WoW Forever raids** (guild directive, 2026-09-22; see
[doctrine §1](../doctrine.md#1-what-were-building) and
[D8](../decisions.md#d8-world-buffs-are-excluded-2026-09-22)). The sim has no world-buff
toggles, and no preset includes them.

For context only (not adopted, no values given): in the Forever client, the stat effects
of Rallying Cry of the Dragonslayer (22888), Songflower Serenade (15366) and Warchief's
Blessing (16609) are replaced by **dummy auras**, i.e. their effects are now under
server-side control. That fits the directive
([client] (SpellEffect, 1.60.1.69913 vs 1.15.9.69722)). Spirit of Zandalar and Fengus' Ferocity still carry real
stat effects in the client, so this is not a full confirmation. See
[Open questions](#open-questions).

---

## 3. Consumables

Every item below was checked against foreverchanges' Forever item files (`new`, `changed`,
`same`, `missing`) [[fc-items]] and the Forever client's item→spell mapping [F] [client]
(ItemEffect, ItemXItemEffect, 1.60.1.69913). "Same" means the Forever tooltip is identical to
Classic, so the Classic tooltip number applies. The buff spell IDs after `→` come from that
mapping; where the item's spell only triggers the buff, the chain is written out (13810 →
18124 → 18125).

### 3.1 Flasks

"You can only have the effect of one flask at a time. This effect persists through death."
The tooltip is unchanged [F].

| Name | ID | Effect | Duration | Stacking | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Flask of the Titans | 13510 → 17626 | +1200 max health | 2 h | One flask | Alchemy (Same) | [F] | [fc-items] · [client] (ItemEffect, 1.60.1.69913) |
| Flask of Supreme Power | 13512 → 17628 | +150 spell damage, all magic schools (so Holy too) | 2 h | One flask | Alchemy (Same) | [F] | [fc-items] · [client] (SpellEffect, 1.60.1.69913) |
| Flask of Distilled Wisdom | 13511 → 17627 | +2000 max mana | 2 h | One flask | Alchemy (reworded only) | [F] | [fc/13511](https://foreverchanges.pro/item/13511) |
| Flask of Natural Aggression *(new)* | 274274 → 1293741 | +60 Sta; **+4% crit while in Mount Hyjal, Hyjal Summit or the Barrow Deeps** (the zero-valued aura the zone fills is 290, all crit, so spells too) | 2 h | One flask | New Forever recipe (BoP formula, Alchemy 300) | [F] | [fc/274274](https://foreverchanges.pro/item/274274) |
| Flask of Natural Accuracy *(new)* | 274273 → 1293740 | +60 Sta; **+5% hit** in those zones | 2 h | One flask | As above | [F] | [fc/274273](https://foreverchanges.pro/item/274273) |
| Flask of Natural Precision *(new)* | 274275 → 1293742 | +60 Sta; **5% reduced chance to be dodged or parried** in those zones | 2 h | One flask | As above | [F] | [fc/274275](https://foreverchanges.pro/item/274275) |
| Flask of Natural Swiftness *(new)* | 274276 → 1293743 | +60 Sta; **+5% haste** in those zones | 2 h | One flask | As above | [F] | [fc/274276](https://foreverchanges.pro/item/274276) |

The Hyjal flasks' zone bonus is a server-side conditional: the client holds a dummy with
the value and a zero-valued hit/crit/haste aura [F] [client] (SpellEffect, 1.60.1.69913). (The
Swiftness flask's spell 1293743 is named "Flask of Natural Accuracy" in `SpellName`; its
auras are haste.) The sim must offer them only when [encounter](encounter.md) says the fight
is in one of those zones.

### 3.2 Elixirs

Classic Era has no battle/guardian elixir split (that is TBC). Only the specific pairs
below are known not to stack. All elixirs share a 3-second cooldown (the "(3 Sec Cooldown)"
in the tooltips; category 79 [F] [client] (ItemEffect, 1.60.1.69913)).

| Name | ID | Effect | Duration | Stacking / exclusivity | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Elixir of the Mongoose | 13452 → 17538 | +25 Agi, +2% crit (Forever uses an all-crit aura, 290 = 2, [client] (SpellEffect, 1.60.1.69913)) | **30 min** (C: 1 h) | Probably exclusive with Elixir of Greater Agility | Alchemy | [F] effect · [?] stacking | [fc/13452](https://foreverchanges.pro/item/13452) |
| Elixir of Greater Strength *(Classic name: Elixir of Giants)* | 9206 → 11405 | +25 Str | 1 h | **Exclusive with Juju Power** | Alchemy. Renamed in Forever; required level **48** (C: 38) | [F] effect · [C] stacking | [fc/9206](https://foreverchanges.pro/item/9206) · [bnet-cons] · [almar-tank] |
| Elixir of Brute Force | 13453 → 17537 | +18 Str, +18 Sta | 1 h | Probably exclusive with Elixir of Giants / Juju Power (both are Strength elixirs) | Alchemy (Same) | [F] effect · [?] stacking | [fc-items] · [client] (SpellEffect, 1.60.1.69913) |
| Elixir of Greater Agility | 9187 → 11334 | +25 Agi | 1 h | Probably exclusive with Mongoose | Alchemy (Same) | [F] effect · [?] stacking | [fc-items] |
| Elixir of Greater Defense *(Classic: Elixir of Superior Defense)* | 13445 → 11348 | +450 armor | 1 h | — | Alchemy. Renamed | [F] | [fc/13445](https://foreverchanges.pro/item/13445) |
| Elixir of Lesser Fortitude *(Classic: Elixir of Fortitude)* | 3825 → 3593 | +120 max health | 1 h | Health elixirs are probably mutually exclusive | Alchemy. Renamed | [F] | [fc/3825](https://foreverchanges.pro/item/3825) |
| Elixir of Fortitude *(new)* | 250334 → 1250928 | +200 max health | 30 min | As above | New, Alchemy 150, required level 45 | [F] | [fc/250334](https://foreverchanges.pro/item/250334) |
| Elixir of Greater Fortitude *(new)* | 250335 → 1250931 | +400 max health | 30 min | As above | New, required level 55 | [F] | [fc/250335](https://foreverchanges.pro/item/250335) |
| Elixir of the Grizzly *(new)* | 250351 → 1250986 | +25 Str, +2% crit | 30 min | **Unknown**: may share a group with Mongoose and/or the Strength elixirs | New, required level 55 | [F] effect · [?] stacking | [fc/250351](https://foreverchanges.pro/item/250351) |
| Elixir of Ferocity *(new)* | 250350 → 1250985 | +18 Str, +18 Agi | 30 min | Unknown | New, required level 55 | [F] effect · [?] stacking | [fc/250350](https://foreverchanges.pro/item/250350) |
| Elixir of Cunning *(new)* | 250328 → 1250918 | +25 Agi, +25 Int | 30 min | Unknown | New, required level 55 | [F] effect · [?] stacking | [fc/250328](https://foreverchanges.pro/item/250328) |
| Elixir of the Phalanx *(new)* | 250329 → 1250920 | +400 max health, +500 armor | 30 min | Unknown | New, required level 55 | [F] effect · [?] stacking | [fc/250329](https://foreverchanges.pro/item/250329) |
| Elixir of Strength *(new)* | 250349 | +10 Str | 30 min | Unknown | New, required level 45 | [F] effect · [?] stacking | [fc/250349](https://foreverchanges.pro/item/250349) |
| Greater Arcane Elixir | 13454 → 17539 | +35 spell damage (all schools, so Holy too) | 1 h | — | Alchemy (Same). Paladins only | [F] | [fc-items] · [client] (SpellEffect, 1.60.1.69913) |
| Elixir of Shadow Power | 9264 → 11474 | +40 Shadow spell damage | 30 min | — | Alchemy (Same). Warlocks and priests only among the classes in scope ([warlock](../classes/warlock.md#74-enchants-and-consumables), [priest](../classes/priest.md#74-enchants-and-consumables)) | [F] [C] | [client] (SpellEffect, SpellDuration, 1.60.1.69913 and 1.15.9.69722) |
| Elixir of Holy Power *(Classic: Elixir of Greater Firepower)* | 21546 → 1310077 | **+40 Holy spell damage** (C: +40 Fire) | 30 min | — | Alchemy. Renamed and re-schooled, so it is now a paladin elixir | [F] | [fc/21546](https://foreverchanges.pro/item/21546) |
| Gift of Arthas | 9088 → 11371 | +10 Shadow resistance. When the drinker is struck, it may put a debuff on the attacker: +8 physical damage taken for 3 min (11374) | 30 min | — | Alchemy (Same) | [F] | [fc-items] · [client] (SpellEffect, 1.60.1.69913) |

### 3.3 Juju, Firewater, Blasted Lands and other buffs

| Name | ID | Effect | Duration | Stacking / exclusivity | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Juju Power | 12451 → 16323 | +30 Str | 30 min | **Exclusive with Elixir of Giants (Greater Strength)**. Stacks with R.O.I.D.S. and Juju Might | Winterspring (Same) | [F] effect · [C] stacking | [fc-items] · [bnet-cons] · [almar-tank] |
| Juju Might | 12460 → 16329 | +40 melee and ranged AP | 10 min | **Exclusive with Winterfall Firewater** | Winterspring (Same) | [F] effect · [C] stacking | [fc-items] · [almar-tank] |
| Juju Flurry | 12450 → 16322 | +3% attack speed | 20 s; 1 min cooldown | On-use in combat | Winterspring (Same) | [F] | [fc-items] · [client] (SpellEffect, 1.60.1.69913) |
| Winterfall Firewater | 12820 → 17038 | +35 melee AP, larger size | 20 min; 1 min cooldown | Exclusive with Juju Might | Winterfall furbolgs (Same) | [F] effect · [C] stacking | [fc-items] · [almar-tank] |
| Distilled Firewater *(new)* | 246948 → **17038** | +35 melee AP (tooltip identical to Winterfall Firewater). **Same spell as Winterfall Firewater**, so the two can never stack | 20 min | Exclusive with Winterfall Firewater and (by extension) Juju Might | New in Forever | [F] | [fc/246948](https://foreverchanges.pro/item/246948) · [client] (ItemEffect, 1.60.1.69913) |
| R.O.I.D.S. | 8410 → 10667 | +25 Str | 1 h; "(1 Hour Cooldown)" in the tooltip | **The Blasted Lands buffs share that 1-hour cooldown** (category 103, 3,600 s), so only one is active at a time. Stacks with Juju Power | Blasted Lands (Same) | [F] | [fc-items] · [wh-roids] · [client] (ItemEffect, 1.60.1.69913) · [bnet-cons] |
| Ground Scorpok Assay | 8412 → 10669 | +25 Agi | 1 h | Blasted Lands (one at a time) | Blasted Lands (Same) | [F] | [fc-items] · [client] (ItemEffect, 1.60.1.69913) |
| Lung Juice Cocktail | 8411 → 10668 | +25 Sta | 1 h | Blasted Lands | Same | [F] | [fc-items] |
| Cerebral Cortex Compound | 8423 → 10692 | +25 Int | 1 h | Blasted Lands | Same | [F] | [fc-items] |
| Gizzard Gum | 8424 → 10693 | +25 Spi | 1 h | Blasted Lands | Same | [F] | [fc-items] |
| Spirit of Zanza | 20079 → 24382 | +50 Sta, +50 Spi | 2 h | "Only one Zanza potion at a time" | Zul'Gurub (Same); ZG availability in Forever is unknown | [F] effect · [?] availability | [fc-items] · [wh-zanza] |
| Rumsey Rum Black Label | 21151 → 25804 | +15 Sta | 15 min | Probably exclusive with other Stamina drinks (Gordok Green Grog +10) | Same | [F] effect · [?] stacking | [fc-items] |
| Dark Desire / Fire-toasted Bun | 22237 / 23327 | +2% melee hit ("with attacks"; C: "chance to hit") | 1 h | Unknown | **Holiday items** (Love is in the Air / Midsummer). Default off; whether event consumables fall under the world-buff directive is an open question | [F] effect · [?] scope | [fc/22237](https://foreverchanges.pro/item/22237) · [fc/23327](https://foreverchanges.pro/item/23327) |

### 3.4 Food

**Forever reworked food.** Most level-45+ buff foods now say "you will become well fed and
gain …" and give flat AP, crit, Str, Agi or Sta for **15 min** (many were 10 min before)
[F: tooltips]. Under the hood they use a generic "Nutritious Food → Well Fed" spell family [F] [client] (ItemEffect, 1.60.1.69913). A player keeps **one Well Fed buff at a time** [?]. Dirge's
Kickin' Chimaerok Chops ("Increased Stamina") and Blessed Sunfruit keep their old,
differently named buffs, so whether they stack with a Well Fed buff is [?].

| Name | ID | Well Fed effect | Duration | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Smoked Desert Dumplings | 20452 | +20 Str (tooltip unchanged; now uses the Forever Nutritious Food spell 1248401, which grants Well Fed 1248422 after 10 s) | 15 min | Cooking (Same tooltip) | [F] | [fc-items] · [client] (ItemEffect, 1.60.1.69913) |
| Bear Bruscitti / Steaming Stag Steak *(new)* | 250070 / 250071 | +20 Str | 15 min | Cooking, required level 45 | [F] | [fc/250070](https://foreverchanges.pro/item/250070) |
| Savory Stag Sliders *(new)* | 250065 | +15 Str | 15 min | Required level 35 | [F] | [fc/250065](https://foreverchanges.pro/item/250065) |
| Flank au Poivre / Swiftstrike Steak *(new)* | 250069 / 250072 | +20 Agi | 15 min | Required level 45 | [F] | [fc/250069](https://foreverchanges.pro/item/250069) |
| Tender Wolf Steak / Jungle Stew | 18045 / 12212 | **+15 Agi** (C: +12 Sta/Spi and +8 Sta/Spi) | 15 min | Changed | [F] | [fc/18045](https://foreverchanges.pro/item/18045) |
| Mightfish Steak | 13934 | **+40 AP** (melee and ranged) (C: +10 Sta, 10 min) | 15 min | Changed | [F] | [fc/13934](https://foreverchanges.pro/item/13934) |
| Poached Sunscale Salmon | 13932 | **+40 AP** (C: 6 health per 5 s) | 15 min | Changed | [F] | [fc/13932](https://foreverchanges.pro/item/13932) |
| Cooked Glossy Mightfish | 13927 | **+30 AP** (C: +10 Sta) | 15 min | Changed | [F] | [fc/13927](https://foreverchanges.pro/item/13927) |
| Grilled Squid | 13928 | **+1% crit** (C: +10 Agi, 10 min) | 15 min | Changed | [F] | [fc/13928](https://foreverchanges.pro/item/13928) |
| Hot Smoked Bass | 13929 | **+1% crit** (C: +10 Spi) | 15 min | Changed | [F] | [fc/13929](https://foreverchanges.pro/item/13929) |
| Dirge's Kickin' Chimaerok Chops | 21023 | +25 Sta ("Increased Stamina" buff, not "Well Fed") | 15 min | Required level **45** (C: 55) | [F] | [fc/21023](https://foreverchanges.pro/item/21023) |
| Savory Turtle Stew *(new)* / Spider Sausage | 250068 / 17222 | +20 Sta / **+15 Sta** (C: Spider Sausage +12 Sta/Spi) | 15 min | New / changed | [F] | [fc/250068](https://foreverchanges.pro/item/250068) · [fc/17222](https://foreverchanges.pro/item/17222) |
| Plated Armorfish *(new)* | 286152 | +150 armor | 15 min | Required level 35 | [F] | [fc/286152](https://foreverchanges.pro/item/286152) |
| Nightfin Soup (`nightfinSoup`) | 13931 → Nutritious Food 1249513 | **+22 spell damage**, every magic school (C: 8 mana per 5 s, 10 min) | 15 min | Changed. Holy damage food for paladins: the Protection paladin's in every preset ([§6.3](#63-consumables-by-spec-and-preset)). One food at a time (`food`) | [F] | [client] (SpellEffect, 1.60.1.69913): 1249513 #1 (aura 227) passes 22 to Well Fed 1249520 (aura 13, school mask 126); Classic Era's Mana Regeneration 18194 #0: 7 + 1 [client] (SpellEffect, 1.15.9.69722) |
| Sagefish Delight / Smoked Sagefish | 21217 / 21072 | **+7 / +4 spell damage** (C: 6 / 3 mana per 5 s) | 15 min | Changed | [F] | [fc/21217](https://foreverchanges.pro/item/21217) |
| Blessed Sunfruit | 13810 → 18124 → 18125 | +10 Str ("Blessed Sunfruit" buff 18125, triggered by the item's spell 18124) | 10 min | Argent Dawn Revered (Same); stacking with Well Fed [?] | [F] effect · [?] stacking | [fc-items] · [client] (ItemEffect, 1.60.1.69913) |
| *Herbal Salad* | — | **Does not exist** in the Classic Era or Forever clients. The only match is a Turtle WoW private-server item, which is a forbidden source; not adopted | — | — | — | [turtle-salad] (forbidden, cited only to explain the refusal) |

### 3.5 Potions and runes

| Name | ID | Effect | Cooldown | Stacking | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mighty Rage Potion | 13442 → 17528 | +45–75 rage, +60 Str for 20 s | 2 min, potion category | Potion | **Warrior and Druid** (C: Warrior only) | [F] | [fc/13442](https://foreverchanges.pro/item/13442) · [client] (ItemEffect, 1.60.1.69913) |
| Great Rage Potion | 5633 → 6613 | +30–60 rage | 2 min, potion | Potion | **Warrior and Druid** (C: Warrior) | [F] | [fc/5633](https://foreverchanges.pro/item/5633) |
| Major Mana Potion | 13444 → 17531 | +1350–2250 mana | 2 min, potion | Potion | Same | [F] | [fc-items] · [client] (SpellEffect, 1.60.1.69913) |
| Major Healing Potion | 13446 → 17534 | +1050–1750 health | 2 min, potion | Potion | Same | [F] | [fc-items] |
| Greater Stoneshield Potion | 13455 → 17540 | +2000 armor for 2 min (aura 22 with misc 1, the Physical resistance: armor) | 2 min, potion | Potion | Same | [F] | [fc-items] · [client] (SpellEffect, SpellDuration, 1.60.1.69913) |
| Free Action Potion | 5634 → 6615 | Immunity to stun and movement impairment for 30 s | 2 min, potion | Potion | Same (no DPS effect) | [F] | [fc-items] |
| Major / Superior / Greater Frenzy Potion *(new)* | 250943 / 250942 / 250941 → 1251940 / 1251938 / 1251937 | **+80 / +56 / +40 attack power and ranged attack power** for 30 s (auras 99 and 124; the tooltip "Increases Attack Power by $s1"). Until 1.60.1.70009 the client gave +40/28/20 flat **physical damage done** (aura 13, school mask 1) under a +40/+28/+20 AP tooltip; the build made them attack power and doubled the values. No cooldown in the tooltip or on the item effects, but the potion spells are in the **potion category** (4, 120 s). The catalogue has the Major one (`majorFrenzyPotion`, for the specs that attack: melee and hunters); every rotation drinks it on cooldown from the pull, below. The Superior and Greater are lower ranks of the same, so they aren't catalogued | 2 min, potion category | Potion | New, required level 55 / 45 / 35 | [F] | [client] (SpellEffect, Spell, SpellCategories, 1.60.1.70009) |
| Demonic Rune / Dark Rune | 12662 / 20520 → 16666 / 27869 | +900–1500 mana; costs 600–1000 health | 2 min, **rune category** (1153, separate from potions) | Runes share a cooldown with each other | Same | [F] | [fc-items] · [client] (ItemEffect, 1.60.1.69913) |
| Thistle Tea | 7676 → 9512 | +100 Energy | Its own 5 min, and the rune category's 2 min (1153) | Shares the runes' category | Rogues, and **druids in Forever** (AllowableClass 1032; C: rogues) | [F] | [client] (ItemEffect, ItemSparse, SpellEffect, 1.60.1.69913) |

**One kind of potion, one rune.** The cooldown that counts is the category on the item's
`ItemEffect` row: 4 with 120 s for every potion above (the Frenzy potions' is on their spells),
1153 with 120 s for the Demonic and Dark Runes and Thistle Tea, and 24 with 60 s for the
explosives [F] [client] (ItemEffect, 1.60.1.69913). (The spells carry older categories of their own: Greater Stoneshield's 17540 is in
28, "Item - Quick Buff", and the runes' 16666 and 27869 in 30, "Item - Healing", each 60 s [F]
[client] (SpellCategories, SpellCooldowns, 1.60.1.69913); the item's row is the one the potion
category and its 2 min come from.) So a Major Mana Potion and a Greater Stoneshield Potion share one
2 min cooldown, and a rune or an EZ-Thro Dark Bomb doesn't touch it. The Buffs tab lets you pick
one entry of each category ([On-use items and cooldown categories](#on-use-items-and-cooldown-categories)).

**Greater Stoneshield Potion in the sim.** Every rotation drinks it on cooldown from the pull, at
0 s, 120 s, 240 s and so on, so its +2,000 armor is up all fight (`classes/shared-consumables.ts`).
An aura's armor is **bonus armor**, not item armor ([character-stats](character-stats.md#derived-stat-pipeline)
step 4): Toughness and Enrage leave it alone, and in `forever` Dire Bear Form's second armor aura
multiplies it by 4.6, as it does every bonus armor, so a bear gets **9,200** [?]
([druid §4.7](../classes/druid.md#47-bear-armor-low-priority-tps-doesnt-need-it), Q19). The armor goes
through the tank's armor factor against the boss's level, so each of the boss's swings costs less
health ([combat-tables §8](combat-tables.md#8-boss--player-tanks); worked example 11). Rage from
damage taken reads the hit before armor in `forever`, so there it changes no rage; the `classic` rage
model reads the health lost, so there it lowers rage ([rage](rage.md#rage-from-damage-taken)). For a
DPS spec it changes nothing: the damage it takes isn't mitigated by armor
([encounter](encounter.md#4-targets-and-position)). So for a DPS spec the Buffs tab says, after its
summary, that only the tank takes the boss's swings, as it does for Elixir of Greater Defense, Devotion
Aura and the Boss damage debuffs (`bossMelee`; [ux](../ux.md#sections)): turning it on still turns off the
spec's own potion (a Fire mage's Major Mana Potion: 513 → 446 DPS at its defaults) for no gain.

**Major Frenzy Potion in the sim.** Every rotation drinks it on cooldown from the pull as well, at
0 s and 120 s in a 3 min fight, off the GCD, so its +80 attack power and +80 ranged attack power are
up for 60 s of 180 (`classes/shared-consumables.ts`). No spec times it around a cooldown of its own
[?]: its 30 s outlasts most, and a timed potion is a tuning question
([D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)). The
Buffs tab lists it for the specs that attack (`forSpecs: 'melee'`, which a hunter sees too), and
Max consumables gives it to the specs it serves best ([§6.3](#63-consumables-by-spec-and-preset)).

### 3.6 Weapon enhancements (temporary)

One temporary enchant per weapon, 30 min: a second one replaces the first [C]. Dense sharpening
stones fit bladed weapons and weightstones fit blunt ones [C]. The Buffs tab has **one stone or
oil on at a time** (the `temp-enchant` group): a stone goes on each weapon you hold, and an oil on
your one weapon, since no class that can use the oils dual-wields (warriors, rogues and hunters do;
paladins, shamans and the casters don't, per the class proficiencies in `src/sim/equip.ts` [C]). A
saved setup with two keeps the one the weapon would take: Brilliant Wizard Oil, then Wizard Oil,
then the Elemental stone, then the Dense one. A dual-wielding warrior with an Elemental stone on
one weapon and a Dense one on the other isn't offered: the stone you pick goes on both. In
Classic, Windfury Totem overwrote the main-hand slot; in Forever it probably doesn't
([Windfury Totem](#windfury-totem)).

**Elemental Sharpening Stone.** It fits any melee weapon, blunt ones included: the item's spell
22756 and the aura its enchant applies, 22755, both require an item of class 2 (weapon) with
subclass mask **42483**, which is one- and two-handed axes, maces and swords, polearms, staves,
fist weapons and daggers [F] [C] [client] (SpellEquippedItems, 1.60.1.69913 and 1.15.9.69722).
Enchant 2506 applies 22755 as an equip spell (`SpellItemEnchantment` effect 3), and 22755 is
aura 52, +2% melee crit, on the wearer (implicit target 1, the caster) [F] [client]
(SpellItemEnchantment, SpellEffect, 1.60.1.69913). So each stone is its **own aura on the
warrior**, from its own item: the sim adds +2% crit to **all melee attacks** for each weapon
that has one, and two stones **stack** (+4%) [?]. The client doesn't settle it: the aura's
weapon requirement matches the weapon the stone is on, so it can't say whether the server
limits the crit to that weapon's attacks or refuses a second copy. The choice follows the aura's
target and type and Classic Era practice: Horde warriors put their only stone on the off hand
under Windfury ([bnet-cons], [almar-tank]), which is worth it when it counts for the main hand
too. It is aura crit, so crit suppression against a +3 boss applies
([combat-tables §4.4](combat-tables.md#44-crit-suppression)). [Open questions](#open-questions) 20.

| Name | ID | Effect | Duration | Stacking | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Elemental Sharpening Stone | 18262 → enchant 2506 | +2% melee crit to all melee attacks, on any melee weapon (above) | 30 min | Temporary-enchant slot of that weapon; one stone, oil or poison per weapon (`temp-enchant`), and two stack [?] | Blacksmithing (Same) | [F] | [fc-items] · [client] (SpellItemEnchantment, SpellEquippedItems, 1.60.1.69913) |
| Dense Sharpening Stone | 12404 → enchant 1643 | +8 weapon damage | 30 min | As above | Same | [F] | [fc-items] |
| Dense Weightstone | 12643 → enchant 1703 | +8 weapon damage (blunt) | 30 min | As above | Same | [F] | [fc-items] |
| Consecrated Sharpening Stone | 23122 → enchant 2684 | +100 AP vs Undead (tooltip unchanged; the Forever client's spell 28893 reads 99) | 30 min | As above | Argent Dawn (Same) | [F] | [fc-items] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Wizard Oil (`wizardOil`) | 20750 → 25121 → enchant 2627 → 25111 | **+24 spell damage and healing**, Classic Era's value again: 1.60.1.70009 reverted it from +30 (the development notes: "Minor Wizard Oil has been reverted to Classic Era value of 8 spell power, Lesser Wizard Oil to 16, and Wizard Oil to 24"; the minor and lesser oils aren't in the catalogue) | 30 min | As above: the main hand's, one stone or oil at a time | Enchanting | [F] | [client] (SpellItemEnchantment, SpellEffect, 1.60.1.70009 and 1.15.9.69722): 25111 #0 (aura 13, all magic schools) and #1 24 (30 in 1.60.1.69913); Classic Era's 23 + 1 |
| Brilliant Wizard Oil (`brilliantWizardOil`) | 20749 → 25122 → enchant 2628 → 25113 | +36 spell damage and healing, +1% spell crit | 30 min | As above | Enchanting (reworded) | [F] | [client] (SpellItemEnchantment, SpellEffect, 1.60.1.69913 and 1.15.9.69722): 25113 #0 36, #2 (aura 57) 1, the same in both |
| Brilliant Mana Oil | 20748 → enchant 2629 | **+15 mana per 5 s, +30 healing** (C: 12 / 25) | 30 min | As above | Enchanting | [F] | [fc/20748](https://foreverchanges.pro/item/20748) |
| Instant Poison VI | 8928 → 11340 | Enchant 625: each hit of its weapon has a 20% chance of 76–100 Nature damage (spell 11337; C: 112–148); 175 charges | 30 min | One poison per weapon, in place of a stone there; rogues only | Poisons (rogue) | [F] | [client] (ItemEffect, SpellEffect, SpellItemEnchantment, 1.60.1.69913); [rogue §4.1](../classes/rogue.md#41-instant-poison-vi) |
| Deadly Poison V | 20844 → 25351 | Enchant 2630: each hit of its weapon has a 30% chance of a stack of 23 Nature damage every 3 s for 12 s, 5 stacks (spell 25349; C: 34); 180 charges | 30 min | As above | Poisons (rogue) | [F] | [client] (ItemEffect, SpellEffect, SpellAuraOptions, SpellItemEnchantment, 1.60.1.69913); [rogue §4.2](../classes/rogue.md#42-deadly-poison-v) |

**Wizard oils** are the casters' temporary weapon enchants: the sim puts the one you pick on your main
hand, in place of a stone, and its spell damage and spell crit are its equip aura's, on you. A
caster that never swings its weapon still gets them from the one it holds. They
go to the classes that spend mana and deal spell damage ([Class-only entries](#class-only-entries)),
and they're locked off for the Enhancement shaman, whose weapon imbue is its main hand's temporary
enchant. In `classicEra`, Windfury Totem's enchant takes the main hand's slot from an oil as it does
from a stone ([Windfury Totem](#windfury-totem)).

**Poisons** are the rogue's temporary weapon enchants: one per weapon, chosen per hand in the Buffs
tab, and each takes the place of a stone on its weapon. Their procs, talents and the choice of
which goes where are the rogue's ([rogue §4](../classes/rogue.md#4-poisons)).

### 3.7 Engineering and explosives

All explosives share a **1-minute cooldown** (category 24 [F] [client] (ItemEffect, 1.60.1.69913)), apart from the
potions' and runes'. The Sapper also has its own 5-minute cooldown [F: "(1 Min Cooldown)" /
"(5 Min Cooldown)" in the tooltips]. EZ-Thro Dark Bomb is the catalogue's only explosive, in its
own `cooldown:explosive` group.

**EZ-Thro Dark Bomb in the sim** (`EZ_THRO_DARK_BOMB` in `effects/buffs.ts`). Its client rows:
item 260817 uses spell 1269334 with the explosive category's 60 s; the spell is School Damage 450
with variance 1, so **225–675 Fire**, and a 4 s stun; Fire school, the Magic `DefenseType`, no spell
damage coefficient, a **1 s cast** and no GCD [F] [client] (ItemEffect, SpellEffect, SpellMisc,
SpellCategories, SpellCastTimes, 1.60.1.69913), and a 15 yd range (`SpellRange`). Every rotation
throws it on cooldown (`classes/shared-consumables.ts`): a caster or a hunter from the pull, a spec
that swings from just after its first main-hand swing (below), and the results list the rules below
(`explosiveThrow`). Each [?] rule is [open question 21](#open-questions), with a beta check.

| Rule | Value | Tag |
| --- | --- | --- |
| Hit and crit | the spell table, like Fiery Weapon's damage: your spell hit, then your spell crit at ×1.5 ([combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic)) | [C] rule; [?] for this item |
| Resistance | the stun beside the damage makes it a **binary** spell: resisted whole at the boss's average Fire resistance, 6% at 24, with no partial resist on a landed one ([spells §3](spells.md#3-resistances)); a boss is immune to the stun itself | [?] |
| Its cast | stops your melee swings, which start again from a full swing when it lands, as a Lightning Bolt's or Hammer of Wrath's cast does ([shaman](../classes/shaman.md#shocks-and-lightning-bolt), [paladin](../classes/paladin.md#other-abilities)); no GCD ability starts during it ([spells §4](spells.md#4-cast-times-casting-speed-and-the-gcd)), so the engine gives it a GCD as long as its cast, and it waits for a free GCD; nor does an off-GCD one (a Heroic Strike queue, Bloodrage, a potion), since you can't use one during another's cast, as with Hammer of Wrath (`castHoldsOffGcd`). A caster's next cast waits for it, and a hunter's Auto Shot is held until it lands ([ranged §4](ranged-and-pets.md#4-auto-shot-the-timer-the-wind-up-and-clipping)) | [?] rule; the wait is an engine choice |
| When a melee spec throws it | **on cooldown, the first just after its first main-hand swing**: the line waits for the fight's first main-hand swing, white or an on-next-swing ability's (`COND.mainHandSwung`), so the throw doesn't cancel the pull's swing; after that it goes whenever it's ready and its GCD is free, **wherever the swing timer is**. A throw restarts the swing timer from full as it lands, so one thrown mid-swing also costs the part of the swing already run; a player who throws right after a swing, as a Slam without Improved Slam is used ([damage-and-timing §3.3](damage-and-timing.md#33-swing-reset-rules)), loses only the 1 s of the throw. **So the melee cost the sim shows is an upper bound**: a player who times the throws to the swings loses less. A window that threw only just after a swing was cut: a spec whose GCD is always busy waited for one (a bear up to 151.6 s), which cost it throws and hid their cost (review QC-1). A caster or a hunter throws it as it's ready | [?] engine choice |
| Threat | its damage × your threat multipliers; no tooltip names a threat of its own, as Thorns' doesn't | [?] |
| Talents and buffs | **none of your class's.** Spell 1269334 has no `SpellClassOptions` row, and the talents that would touch it are class-mask spell modifiers: Critical Mass and Elemental Precision are aura 107 with the mage's class set 3 and a spell mask [F] [client] (SpellEffect, SpellClassOptions, 1.60.1.69913), as Fire Power is; so it gets no school hit or crit from talents, no Combustion crit or charge, no per-spell crit (Winter's Chill), and triggers none of your spell procs (Ignite, Combustion's stacks, Master of Elements). Your spell hit and crit, your all-damage multiplier and the boss's Fire damage taken (Curse of the Elements, Improved Scorch) apply; your own school multipliers don't, which also leaves out the few plain school auras that would reach it (Power Infusion's +20% for the first throw, a warlock's sacrificed Imp's +15% for every one): at most 0.25% of DPS. A crit still ends a charge any crit ends (Weakness Analyzer) (`SpellDef.itemSpell`) | [?] |

A warrior with no spell hit fails 17% + 83% × 6% = **21.98%** of its throws, and at 5% spell crit a
throw averages 0.7802 × 450 × 1.025 = **359.87** damage (worked example 12). Every spec throws it
three times in a 3 min fight: at the pull (a melee spec just after its first swing), then at 61 s
and 122 s, give or take a GCD (for a caster, the cast in progress). For a spec that swings the throw costs more than it deals: the swings
it restarts and the GCD it holds lose white damage and rage, so it's in no melee preset
([§6.3](#63-consumables-by-spec-and-preset)).

| Name | ID | Effect | Cooldown | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Goblin Sapper Charge | 10646 → 13241 | 450–750 Fire damage to nearby enemies; 375–625 to self | 5 min own + 1 min shared | Requires Engineering 205 to use (Same tooltip) | [F] | [fc-items] · [wh-sapper] · [client] (ItemEffect, 1.60.1.69913) |
| Dense Dynamite | 18641 → 23063 | 340–460 Fire, 5 yd | 1 min shared | Requires Engineering 250 | [F] | [fc-items] · [wh-dyn] |
| Thorium Grenade | 15993 → 19769 | 300–500 Fire, 3 s stun, 3 yd | 1 min shared | Requires Engineering 260 | [F] | [fc-items] · [wh-thor] |
| EZ-Thro Thorium Grenade *(new)* | 260816 | 300–500 Fire, 3 s stun | 1 min shared | **Usable by anyone** ("Anyone can use grenades with EZ-Thro!") | [F] | [fc/260816](https://foreverchanges.pro/item/260816) |
| EZ-Thro Dark Bomb *(new)* | 260817 → 1269334 | 225–675 Fire, 4 s stun, 5 yd; 1 s cast | 1 min shared | Usable by anyone | [F] | [fc/260817](https://foreverchanges.pro/item/260817) · [client] (ItemEffect, SpellEffect, SpellMisc, 1.60.1.69913) |
| SAF-T Clever Dynamite *(new)* | 260814 | 340–460 Fire, 5 yd | 1 min shared | No Engineering requirement in the tooltip | [F] | [fc/260814](https://foreverchanges.pro/item/260814) |

---

## 4. Target debuffs

### 4.1 Armor reduction

| Name | ID | Effect | Duration | Stacking / exclusivity | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sunder Armor (r5) | 11597 | −450 armor per stack, 5 stacks = **−2250** | 30 s | **Exclusive with Expose Armor** in Classic [C]; unverified in Forever [?] | Warrior | [F] value | [fc-sb-warrior] · [crc-ea] |
| Expose Armor (r5) | 11198 | **−450 per combo point, −2250 at 5 CP** (C: −340 / −1700) | 30 s | Exclusive with Sunder [C] / [?] | Rogue | [F] value | [fc-sb-rogue] |
| Improved Expose Armor | talent (C: 14168) | **No longer adds armor reduction.** Forever: −10 energy cost, refunds 2 CP when used at 5 CP (C: +50%, i.e. −2550 at 5 CP) | — | — | Rogue talent | [F] | [fc-changes] |
| Faerie Fire (r4) | 9907 | −505 armor; target can't stealth | 40 s | Stacks with Sunder / Expose Armor and CoR [C] | Druid. **Castable in Cat, Bear and Dire Bear Form** in Forever; free with a 6 s cooldown in form (see [druid](../classes/druid.md)). A cat that keeps its own up (its Rotation tab's Faerie Fire, on by default, [druid §3.8](../classes/druid.md#38-faerie-fire-in-cat-9907-r4)) replaces this switch, as a warrior's own Battle Shout does | [F] | [fc-sb-druid] |
| Faerie Fire (Feral) | 17392 (Classic) | **Not in Forever** (the talent and spell were removed; Faerie Fire itself is now form-castable) | — | — | — | [F] | [fc-sb-druid] (missing list) · [fc-changes] |
| Curse of Recklessness (r4) | 11717 | **−505 armor** (C: −640 armor **and +90 AP to the target**); target won't flee | 2 min | One curse per warlock; stacks with Sunder / FF [C] | Warlock | [F] | [fc-sb-warlock] · [client] (SpellEffect, 1.60.1.69913) |
| Annihilator: Armor Shatter | item 12798 → 16928 | **−165** armor per stack, 3 stacks = −495 (C: −200 / −600) | 45 s | Stacks with the major armor debuffs [C] | Forever item is now **One-Hand, 2.40 speed, +14 AP** (C: Main Hand 1.70) | [F] | [fc/12798](https://foreverchanges.pro/item/12798) · [client] (SpellEffect, 1.60.1.69913) |
| Rivenspike: Puncture Armor | item 13286 → 17315 | Forever client: **−100** per stack ×3 (C: −200 ×3, tooltip "lowering it by 200") | 30 s | As Annihilator; does it stack with Armor Shatter? [?] | Item has **no Forever row yet** ("missing") | [?] | [fc/13286](https://foreverchanges.pro/item/13286) · [client] (SpellEffect, 1.60.1.69913) |

**Stacking and floor.** Active reductions are summed. The floor depends on the rules
profile, and [damage-and-timing §1.2](damage-and-timing.md#12-armor-reduction-debuffs-and-penetration)
owns it and its open question: in `classicEra` target armor can't go below 0 [C]; in
`forever` it can, and armor below 0 increases damage (per the client tooltip). Sunder Armor and
Expose
Armor occupy the same slot, so only one applies; FF and CoR stack with either [C: "with 5
stacks of Sunder, Curse of Recklessness and Faerie Fire" a 3731-armor boss drops to 336
[crc-ea]]. In Forever, Expose Armor and 5× Sunder are both −2250, so the choice no longer
matters for armor, only for who spends the GCDs. Armor math itself is in
[damage-and-timing](damage-and-timing.md).

### 4.2 Other debuffs

| Name | ID | Effect | Duration | Stacking / exclusivity | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Judgement of the Crusader (r6) (`judgementOfTheCrusader`, another paladin's) | 20303 | +**161** Holy damage taken (C: 140; Improved Seal of the Crusader's 15% is now baseline and the talent is removed). Whether each Holy hit gets the flat +161 or +161 × its coefficient is open; see [paladin](../classes/paladin.md). The Buffs entry is yours while your rotation judges it (both paladin specs do by default), otherwise another paladin's, on the boss all fight ([§6.2](#62-buffs-and-debuffs-by-preset)) | **40 s** (C: 10 s); the judging paladin's melee hits refresh it | One Judgement per paladin; several paladins can keep different Judgements up. Debuff Judgements always hit ([paladin](../classes/paladin.md)) | Paladin | [F] value · [?] application | [fc-sb-paladin] · [client] (SpellEffect, 1.60.1.69913) |
| Judgement of Wisdom (r3) | 20355 | Attacks and spells against the target may restore 59 mana | **40 s** (C: 10 s) | One per paladin; always hits | Paladin (only paladins use it) | [F] | [fc-sb-paladin] |
| Judgement of Light (r4) | 20346 | Melee attacks against the target may heal the attacker for 61 | **40 s** (C: 10 s) | One per paladin; always hits | Paladin | [F] | [fc-sb-paladin] |
| Curse of the Elements (r4) | 1311680 | −75 resistance to **all magic schools**, **+10% magic damage taken, Holy included** (C: r3, 11722, Fire and Frost only) | 5 min | One curse per warlock | Warlock; new rank 4 at level 50. **Curse of Shadow removed** (merged in) | [F] | [fc-sb-warlock] · [client] (SpellEffect, 1.60.1.69913) |
| Hunter's Mark (r4) | 14325 | **+71 ranged AP** for all attackers (C: 110). **No melee component in Classic Era or Forever** | 2 min | — | Hunter. Improved Hunter's Mark removed (C: +15% ranged only) | [F] | [fc-sb-hunter] · [fc-changes] |
| Demoralizing Shout (r5) | 11556 | Enemy melee AP **−204** at level 60 (C: −146 at 60). The level-60 tooltip: base −196 and −1.4 per level from 54, not capped below 60 (`SpellLevels` 54–64), which the client shows as 204 [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913). The −196 read before was the base, unscaled. Whether the debuff applies the same in combat is [?] ([OQ 19](#open-questions)) | **45 s** (C: 30 s) | Probably exclusive with Demoralizing Roar. Improved Demoralizing Shout removed | Warrior | [F] value · [?] stacking | [fc-sb-warrior] |
| Demoralizing Roar (r5) | 9898 | Enemy melee AP **−204** at level 60 (C: −138 at 60). The level-60 tooltip: base −193 and −1.4 per level from 52, not capped below 60 (`SpellLevels` 52–62), −204.2, which the client shows as 204 [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913). The −193 read before was the base, unscaled. Whether the debuff applies the same in combat is [?] ([OQ 19](#open-questions)) | 30 s | As above | Druid (bear) | [F] value · [?] stacking | [fc-sb-druid] |
| Thunder Clap (r6) | 11581 | 103 damage; enemy attack speed **−20%** (C: −10%) | 30 s; **6 s cooldown** (C: 4 s); also usable in Defensive Stance | — | Warrior | [F] | [fc-sb-warrior] |
| Curse of Weakness (r6) | 11708 | Target's **physical** damage done −37 (C: −31, all damage) | 2 min | One curse per warlock. Improved Curse of Weakness removed | Warlock | [F] | [fc-sb-warlock] |
| Stormstrike | 17364 | Forever: **self only**, +20% to the shaman's own next Lightning Bolt, Chain Lightning or Earth Shock (C: target takes +20% from the next 2 Nature damage sources, 12 s) | 12 s | — | Shaman talent. No longer a raid debuff | [F] | [fc-changes] |
| Nightfall: Spell Vulnerability | item 19169 → 23605 | +15% spell damage taken (paladin Holy damage included) | 5 s | Proc rate is server-side [?] | Same | [F] effect | [fc-items] · [client] (SpellEffect, 1.60.1.69913) |
| Gift of Arthas (proc) | 11374 | +8 physical damage taken | 3 min | Applied to whoever strikes the drinker | See [§3.2](#32-elixirs) | [F] | [client] (SpellEffect, 1.60.1.69913) |

Improved Scorch, Winter's Chill and Improved Shadow Bolt don't affect melee. Shadow
Weaving is now a debuff on the boss that counts only the priest's own Shadow damage [F]
([spells.md §9](spells.md#9-caster-raid-buffs-and-debuffs)).

### 4.3 Debuff slot limit

- **Classic Era [C]:** 16 debuffs per target on normal realms. Patch 1.14.4 removed the
  16-debuff and 32-buff limits on Hardcore realms only [[bt-1144]].
- **Forever [?]:** no source found. **Sim default: do not model debuff-slot pressure.**
  Assume every selected debuff is present. See [Open questions](#open-questions).

---

## 5. Enchants and item enhancements

The Forever client ships an **"Enchant …" scroll item** for almost every enchant (new item
IDs 273458–274426); their tooltips carry the Forever values. The Forever enchanting recipe
list has **229 recipes, 60 of them new** [[fc-ench]]. Several enchants from the
Season-of-Discovery era appear in the Forever client. Where they have a formula item in
Forever they are listed as available; where the recipe list shows *"No recipe item"* they
are marked [?] availability. Forever values come from the scroll tooltips in
foreverchanges' item data [[fc-items]]. Classic values come from foreverchanges'
"Classic" recipe and tooltip text, or from the Classic Era client's rows of the same enchants.

### 5.1 Weapon

| Name | IDs (spell / enchant) | Effect | Duration / proc | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Crusader | 20034 / 1900 → 20007 | On hit: +100 Str for 15 s and heals 75–125 | 1 PPM [C] | Formula (Same) | [F] effect · [C] rate | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) · [ws-gear] |
| Weapon – Agility | 23800 / 2564 | +15 Agi | Permanent | Formula (Same) | [F] | [fc-ench] |
| Weapon – Strength | 23799 / 2563 | +15 Str | Permanent | Formula (Same) | [F] | [fc-ench] |
| Superior Striking | 20031 / 1897 | +5 weapon damage | Permanent | Formula (Same) | [F] | [fc-ench] |
| Fiery Weapon | 13898 / 803 → 13897 | On hit: 40 Fire damage | 6 PPM [C] | Formula (Same) | [F] effect · [C] rate | [fc-ench] · [ws-gear] |
| Icy Chill | 20029 / 1894 → 20005 | On hit: target attack speed −25% and movement speed −30% | 1.6 PPM [?] | Formula (Same) | [F] effect | [fc-ench] · [wiki-ppm] |
| Lifestealing | 20032 / 1898 → 20004 | On hit: drains 30 Shadow health | 6 PPM [C] | Formula (Same) | [F] effect · [C] rate | [fc-ench] · [ws-gear] |
| Unholy Weapon | 20033 / 1899 → 20006 | On hit: target's physical damage done −15 | 3 PPM [?] | Formula (Same) | [F] effect | [fc-ench] · [wiki-ppm] |
| Weapon – Spell Power | 22749 / 2504 | +30 spell damage and healing | Permanent | Formula (Same). A paladin option; the warlock's default ([warlock](../classes/warlock.md#74-enchants-and-consumables)) | [F] | [fc-ench] |
| Recovery *(new)* | 1248760 / 8721 | When parried or dodged: heal 5% of max health (10 s cooldown) | — | New formula | [F] | [fc-ench] |
| Demonslaying | 13915 / 912 | Vs demons: **100** damage + stun (C: 75) | Proc | Formula | [F] | [fc-ench] |
| Grand Crusader | 1231128 / 7940 | On hit: +120 Str for 20 s, heals 350–450 | Proc | **No recipe item in Forever** | [F] effect · [?] availability | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |

### 5.2 Two-handed weapon

| Name | IDs | Effect | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- |
| 2H Weapon – Agility | 27837 / 2646 | +25 Agi. **Exists in Classic Era** (same spell and enchant in the Classic DB2) | Formula | [F] | [fc-ench] · [client] (SpellItemEnchantment, 1.15.9.69722) |
| 2H Weapon – Strength *(new)* | 1248668 / 8215 | +25 Str | New formula | [F] | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| 2H Weapon – Lesser Strength *(new)* | 1248511 / 2563 | +15 Str | New formula | [F] | [fc-ench] |
| 2H Weapon – Lesser Agility *(new)* | 1248510 / 2618 | Tooltip and enchant name: **+15 Agi**, but the enchant's equip spell 19989 grants **+9** | New formula | [?] | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| 2H Weapon – Superior Impact | 20030 / 1896 | +9 weapon damage (probably the "+9" in the brief; Classic has no "+9 Strength" 2H enchant) | Formula (Same) | [F] | [fc-ench] |
| 2H Weapon – Grand Inquisitor | 1232172 / 7943 | On hit: +200 Str for 20 s, heals 350–450 | **No recipe item** | [F] effect · [?] availability | [fc-ench] |

### 5.3 Head and legs (arcanums, ZG idols, armor kits)

Each of these is the item's permanent enchant, so an armor kit replaces an enchant or
arcanum on the same item [C].

| Name | Item → enchant | Effect | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- |
| Lesser Arcanum of Voracity | 11645 / 11646 / 11647 / 11648 / 11649 → 1506–1510 | +8 Str / Sta / Agi / Int / Spi (one item per stat) | Dire Maul libram turn-in (Same) | [F] | [fc-items] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Lesser Arcanum of Constitution | 11642 → 1503 | +100 health | Same | [F] | [fc-items] |
| Lesser Arcanum of Tenacity | 11643 → 1504 | +125 armor | Same | [F] | [fc-items] |
| Arcanum of Rapidity | 18329 → 2543 | +1% attack speed | Same | [F] | [fc-items] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Arcanum of Protection | 18331 → 2545 | +1% dodge | Same | [F] | [fc-items] |
| Arcanum of Focus | 18330 → 2544 | +8 spell damage and healing | Same | [F] | [fc-items] |
| Presence of Might (ZG, warrior) | 19782 → 2583 | +10 Sta, +7 defense, +15 block value | Same; ZG availability [?] | [F] effect | [fc-items] |
| Syncretist's Sigil (ZG, paladin) | 19783 → 2584 | +10 Sta, +7 defense, +24 healing | Same; ZG [?] | [F] effect | [fc-items] |
| Animist's Caress (ZG, druid) | 19790 → 2591 | +10 Sta, +10 Int, +24 healing | Same; ZG [?] | [F] effect | [fc-items] |
| Forceful Rugged Armor Kit *(new)* | 252488 → 8491 | +10 AP, +40 armor (chest, legs, hands or feet) | New, Leatherworking | [F] | [fc/252488](https://foreverchanges.pro/item/252488) |
| Wild Leather Armor Kit *(new)* | 279258 → 8719 | +4 defense, +10 Sta (chest, legs, hands or feet; item level 45+) | New, Leatherworking | [F] | [fc/279258](https://foreverchanges.pro/item/279258) |
| Rugged Armor Kit | 15564 → 8490 | **+5 Sta** and +40 armor (C: +40 armor) | Changed | [F] | [fc/15564](https://foreverchanges.pro/item/15564) |
| Core Armor Kit | 18251 → 2503 | +3 defense | Same | [F] | [fc-items] |

### 5.4 Shoulders

| Name | Item → enchant | Effect | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- |
| Zandalar Signet of Might | 20077 → 2606 | +30 AP (melee and ranged) | ZG reputation (Same); ZG availability [?] | [F] effect | [fc-items] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Zandalar Signet of Mojo | 20076 → 2605 | +18 spell damage and healing | As above | [F] effect | [fc-items] |
| Zandalar Signet of Serenity | 20078 → 2604 | +33 healing | As above | [F] effect | [fc-items] |
| Might of the Scourge | 23548 → 2717 | +26 AP, +1% crit | Naxxramas-era Argent Dawn (Same); availability [?] | [F] effect | [fc-items] |
| Fortitude of the Scourge | 23549 → 2716 | +16 Sta, +100 armor | As above | [F] effect | [fc-items] |
| Power of the Scourge | 23545 → 2721 | +15 spell damage, +1% spell crit | As above | [F] effect | [fc-items] |

### 5.5 Armor slots (enchanting)

| Slot | Name | IDs (spell / enchant) | Effect | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Cloak | Lesser Agility | 13882 / 849 | +3 Agi | Formula (Same) | [F] | [fc-ench] |
| Cloak | Agility | 1219587 / 7667 | +5 Agi | Formula listed in Forever | [F] | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Cloak | Minor Agility | 13419 / 247 | **+3** Agi (C: +1) | Changed | [F] | [fc-ench] |
| Cloak | Superior Defense | 20015 / 1889 | +70 armor | Formula | [F] | [fc-ench] |
| Cloak | Greater Defense | 13746 / 884 | **+60** armor (C: +50) | Changed | [F] | [fc-ench] |
| Cloak | Dodge | 25086 / 2622 | +1% dodge | Formula (Same) | [F] | [fc-ench] |
| Cloak | Subtlety (context) | 25084 / 2621 | −2% threat | Formula (Same) | [F] | [fc-ench] |
| Chest | Greater Stats | 20025 / 1891 | +4 all stats | Formula (Same) | [F] | [fc-ench] |
| Chest | Stats | 13941 / 928 | +3 all stats | Same | [F] | [fc-ench] |
| Chest | Major Stamina *(Classic: Major Health)* | 20026 / 1892 | **+10 Sta** (C: +100 health) | Formula; renamed | [F] | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Chest | Superior Stamina *(Classic: Superior Health)* | 13858 / 908 | **+8 Sta** (C: +50 health) | Renamed | [F] | [fc-ench] |
| Chest | Living Stats | 1213616 / 7645 | +4 all stats, +15 Nature resistance | **No recipe item** | [F] effect · [?] availability | [fc-ench] |
| Bracers | Superior Strength | 20010 / 1885 | +9 Str | Formula (Same) | [F] | [fc-ench] |
| Bracers | Greater Strength | 13939 / 927 | +7 Str | Same | [F] | [fc-ench] |
| Bracers | Strength | 13661 / 856 | +5 Str | Same | [F] | [fc-ench] |
| Bracers | Superior Agility *(new)* | 1248599 / 7656 | +9 Agi | New formula | [F] | [fc-ench] |
| Bracers | Greater Agility *(new)* | 1248500 / 1887 | +7 Agi | New formula | [F] | [fc-ench] |
| Bracers | Superior Stamina | 20011 / 1886 | +9 Sta | Formula (Same) | [F] | [fc-ench] |
| Bracers | Deflection | 13931 / 923 | **+7 defense** (C: +3) | Changed | [F] | [fc-ench] |
| Bracers | Superior Deflection *(new)* | 1248665 / 8214 | +9 defense | New formula | [F] | [fc-ench] |
| Bracers | Lesser Deflection | 13646 / 925 | Tooltip **+5 defense**, but the equip spell 13930 still grants +2 (C: +2) | Changed | [?] | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Gloves | Superior Strength *(new)* | 1248640 / 2563 | +15 Str | New formula | [F] | [fc-ench] |
| Gloves | Superior Agility | 25080 / 2564 | +15 Agi | Formula (Same) | [F] | [fc-ench] |
| Gloves | Greater Strength | 20013 / 8207 | **+10 Str** (C: +7) | Formula | [F] | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Gloves | Greater Agility | 20012 / 8206 | **+10 Agi** (C: +7) | Formula | [F] | [fc-ench] |
| Gloves | Strength / Agility | 13887 / 927, 13815 / 1887 | **+7** Str / **+7** Agi (C: +5 / +5) | Changed | [F] | [fc-ench] |
| Gloves | Minor Haste | 13948 / 931 | **+1% melee and ranged haste and +1% casting speed** (C: +1% attack speed) | "No recipe item" in Forever's list [?] | [F] effect · [?] availability | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Gloves | Threat | 25072 / 2613 | +2% threat | Formula (Same) | [F] | [fc-ench] |
| Gloves | Riding Skill | 13947 / 930 | Mount speed only (no combat effect) | Formula | [F] | [fc-ench] |
| Gloves | *"Greater Haste"* | — | No such enchant in the Classic Era or Forever data | — | [F] | [fc-ench] |
| Boots | Greater Agility | 20023 / 1887 | +7 Agi | Formula (Same) | [F] | [fc-ench] |
| Boots | Agility | 13935 / 904 | +5 Agi | Same | [F] | [fc-ench] |
| Boots | Greater Stamina | 20020 / 929 | +7 Sta | Formula (Same) | [F] | [fc-ench] |
| Boots | Minor Speed | 13890 / 911 | Small run-speed increase (no combat effect) | Same | [F] | [fc-ench] |
| Shield | Greater Stamina | 20017 / 1886 | **+9 Sta** (C: +7) | Formula | [F] | [fc-ench] |
| Shield | Stamina | 13817 / 929 | **+7 Sta** (C: +5) | Formula | [F] | [fc-ench] |
| Shield | Excellent Stamina | 1219581 / 7663 | +12 Sta | Formula listed in Forever | [F] | [fc-ench] |
| Shield | Critical Strike | 1220623 / 7664 | +1% crit (melee and spell) | Formula listed in Forever | [F] | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Shield | Lesser Block | 13689 / 863 | +2% block | Formula (Same) | [F] | [fc-ench] |
| Necklace *(new slot)* | Strength | 1249019 / 856 | +5 Str | New formula | [F] | [fc-ench] · [fc/273630](https://foreverchanges.pro/item/273630) |
| Necklace *(new slot)* | Agility | 1249059 / 904 | +5 Agi | New formula | [F] | [fc-ench] |
| Necklace *(new slot)* | Deflection | 1249060 / 925 | Tooltip **+5 defense**, but the equip spell grants +2 (same conflict as Lesser Deflection) | New formula | [?] | [fc-ench] · [client] (SpellItemEnchantment, 1.60.1.69913) |

---

## 6. Default presets

### 6.1 Composition flags (not factions)

Forever gives both factions paladins and shamans ([§1](#1-raid-and-party-buffs), [F] client
table), so **Alliance and Horde defaults are identical.** The UI exposes
composition flags; each buff toggle is enabled only if its flag is set.

| Flag | Meaning | Unlocks | Default (Standard raid) |
| --- | --- | --- | --- |
| `comp.paladins` (0–4+) | Paladins in the raid | 1: Might · 2: +Kings · 3: +Salvation (DPS) or Light (tanks) · 4: +Wisdom; plus Devotion Aura, JoW / JoC / JoL | 4 |
| `comp.shamanInParty` | A shaman in the player's party | Windfury or Grace of Air (one air totem); Strength of Earth or Stoneskin (one earth totem); Mana Spring | yes |
| `comp.warriorInParty` | A warrior (not the sim'd player) in the party | Battle Shout | yes |
| `comp.druid` | A druid in the raid | Gift of the Wild, Faerie Fire | yes |
| `comp.partyCritAura` | A feral or moonkin druid in the party | Leader of the Pack / Moonkin Aura (+3% crit) | yes for DPS, no for tanks |
| `comp.priest` | Priest | Prayer of Fortitude, Prayer of Spirit | yes |
| `comp.mage` | Mage | Arcane Brilliance | yes |
| `comp.warlocks` (0–2) | Warlocks | 1: Curse of Recklessness · 2: + Curse of the Elements | 2 |
| `comp.armorTank` | A warrior tank keeping 5 Sunders up (or a rogue on Expose Armor) | Sunder ×5 (or Expose Armor) | yes |
| `comp.annihilator` | Someone in the raid procs Annihilator | Armor Shatter ×3 | no (yes in Max) |

When the sim'd player *is* the warrior, druid or paladin providing a buff (their own Battle
Shout, Leader of the Pack or Sunders), the class doc models it as self-applied and the
external toggle is ignored. A druid casts Mark of the Wild on itself, so for a druid player
`comp.druid` is always met for it (the entry's `selfCast`): Gift of the Wild never needs another
druid. Faerie Fire in Buffs still does, since a cat's own is its rotation's. A paladin blesses
itself with Might the same way, so for a paladin player Blessing of Might never needs another
paladin; Kings, Salvation and Wisdom do, one blessing per paladin on a player. The switch is the
blessing whoever casts it, so it counts once. A shaman drops its own totems the same way: Strength
of Earth, Grace of Air and Mana Spring are its own (`selfCast`), one of each kind, so for a shaman
player they never need another shaman in the party
([shaman](../classes/shaman.md#totems)). Windfury Totem isn't among them: the Enhancement shaman's
Windfury Weapon disables its benefit, so its air totem is Grace of Air. A Protection warrior's Thunder Clap and
Demoralizing Shout are its own the way a cat's Faerie Fire is, its duties
([D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)):
the presets leave their toggles off, its Defensive rotation keeps them up, and a rotation that
drops them (Balanced, the default since [D28](../decisions.md#d28-three-tank-rotations-defensive-balanced-and-max-tps-2026-09-24),
and Max TPS) leaves the boss without them unless you turn a toggle on for another warrior's
([warrior §5.4](../classes/warrior.md#54-protection-tps)). A Feral bear's Faerie Fire and
Demoralizing Roar are its own the same way ([druid §6.3](../classes/druid.md#63-forever-bear-priority-tps)),
and its raid has a warrior tank's Thunder Clap and Demoralizing Shout only if you turn them on.

### 6.2 Buffs and debuffs by preset

`DPS` = Arms, Fury, Cat, Ret, Enhancement, the rogues and the mages · `Tank` = Prot warrior, Bear,
Prot paladin · `Pal` = paladin specs only (the effect does nothing for the others) · `Enh` = the
Enhancement shaman · `Mage` = the Fire, Frost and Arcane mages (the casters: `CASTER_SPECS`, the specs whose
`SpecMeta.caster` is set) ·
`all` = every spec · `Pal (your own)`, `Druid (your own)`, `Sha (your own)` = that class's buff it
casts on itself (`selfCast`), which Self only brings.
An entry marked † changes only attacks: attack power, Strength or Agility, the melee's party crit
aura, a weapon's attacks, or the boss's armor, which only physical damage feels (Expose Armor too,
in no preset). It's the melee's
(`forSpecs: 'melee'` in `src/sim/effects/buffs.ts`), so there `all` and `DPS` mean every spec but the
casters (`SpecMeta.caster`), and a caster's Buffs tab doesn't list it at all
([Class-only entries](#class-only-entries)). The melee and tank specs' presets are the same with or
without the mark.
Devotion Aura stays `Tank` though it's a paladin tank's duty, because unlike Thunder Clap and
Demoralizing Shout, which only a warrior tank applies, any paladin in the raid runs an aura, so a
warrior's or bear's raid has Devotion Aura when a paladin is in it and D26's rule that a tank's
preset leaves out another tank class's duties doesn't reach it.

Spirit and Intellect are mana, and among the classes in scope only the paladin, the shaman and
the mage spend mana in a rotation the sim ships: a warrior has none, and a Feral druid spends none in its form. The cat
never powershifts, since in Forever Furor keeps its Energy through a shift, so a shift gains
nothing ([druid §2.8](../classes/druid.md#28-shapeshifting-furor-wolfshead-helm-powershifting-mana)),
and its Faerie Fire is free in Cat Form. So they're `Pal`, `Enh` and `Mage`, like Blessing of Wisdom and
Mana Spring.

| Entry | Self-buffs only | Pre-raid dungeon group | Standard raid | Max-consumables raid |
| --- | --- | --- | --- | --- |
| Battle Shout † | — | all | all | all |
| Blessing of Might † | Pal (your own) | DPS | all | all |
| Blessing of Kings | — | Tank | all | all |
| Blessing of Salvation | — | — | DPS | DPS |
| Blessing of Wisdom | — | — | Pal, Enh, Mage | Pal, Enh, Mage |
| Mark / Gift of the Wild | Druid (your own) | all | all | all |
| Power Word / Prayer of Fortitude | — | all | all | all |
| Divine Spirit / Prayer of Spirit, Arcane Brilliance | — | — | Pal, Enh, Mage | Pal, Enh, Mage |
| Leader of the Pack † or Moonkin Aura | — | — | DPS (Moonkin Aura: Mage instead; see below) | the same |
| Windfury Totem † | — | — | all but Enh (see below) | all but Enh |
| Grace of Air Totem † | Sha (your own) | Enh | Enh | Enh |
| Strength of Earth Totem † | Sha (your own) | Enh | all | all |
| Mana Spring Totem | Sha (your own) | Enh | Pal, Enh, Mage | Pal, Enh, Mage |
| Devotion Aura | — | — | Tank (a Prot paladin's is its own duty: see below) | the same |
| Thorns (on the tank) | Druid (your own: the bear) | Bear | Tank (a druid puts it on the main tank) | Tank |
| Sunder Armor ×5 † | — | DPS | all | all |
| Faerie Fire † | — | — | all (not the Feral cat's or bear's: see below) | all (the same) |
| Curse of Recklessness † | — | — | all | all |
| Curse of the Elements | — | — | Mage; Pal once it reaches the paladin ([spells OQ-S12](spells.md#open-questions)) | the same |
| Judgement of the Crusader (the Buffs tab's: another paladin's) | — | — | — (every paladin spec judges its own: see below) | — |
| Power Infusion | — | — | — (an option for a Mage) | — |
| Judgement of Wisdom | — | — | Pal | Pal |
| Armor Shatter ×3 (Annihilator) † | — | — | — | all |
| Demoralizing Shout / Thunder Clap | — | — | — (a warrior tank's own: see below) | — |
| Demoralizing Roar | — | — | — (the Feral bear's own duty: see below) | — |
| Trueshot Aura, Hunter's Mark | never (no melee effect in Forever) | — | — | — |
| Camp buffs ([§1.3](#13-camp-buffs-new-forever-system)) | — | off (option: fill in for a missing class) | off (option) | off (option) |
| World buffs | **never** | **never** | **never** | **never** |

A buff a spec keeps up itself by default is that spec's own, and no preset adds it for the spec:
the Feral cat's Faerie Fire ([druid §6.2](../classes/druid.md#62-forever-cat-priority)), and a
tank's duties: a Protection warrior's Thunder Clap and Demoralizing Shout, a Protection paladin's
Devotion Aura, and the Feral bear's Faerie Fire and Demoralizing Roar
([D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23);
[paladin](../classes/paladin.md#priority-defensive-balanced-or-max-tps);
[druid §6.3](../classes/druid.md#63-forever-bear-priority-tps)).
Its rotation keeps it up; when the rotation doesn't, the Buffs tab's is off by default and means
another player's, on only if you turn it on ([ux.md](../ux.md) "Buffs"). Thunder Clap and
Demoralizing Shout are in no preset for any spec: they're a warrior tank's, so a bear's or a
Protection paladin's raid has them only if you add them there, as another warrior's (D26's
amendment). The roar is a duty only a bear keeps, so it's in no preset either.

No preset gives the Enhancement shaman Windfury Totem: its own Windfury Weapon "disables any
benefit you personally receive from Windfury Totem" [F] (the imbue's Forever tooltip), so its air
totem is Grace of Air. If you turn Windfury Totem on while Windfury Weapon is the imbue, the plan
leaves the totem's proc out and the results say so; with Rockbiter Weapon it applies
([shaman](../classes/shaman.md#totems)).

The party crit aura is Leader of the Pack for the melee and Moonkin Aura for the casters, one per
party (`party-crit-aura`): a mage's presets and Buffs tab have Moonkin Aura only, and a melee
spec's Leader of the Pack only. In `forever` both are +3% crit with spells and attacks, so which one
a spec is given changes nothing there; in `classicEra` Leader of the Pack is melee crit only and
Moonkin Aura spell crit only, so each goes to the specs it helps. Power Infusion is another priest's cooldown, so
no preset has it; turned on, a mage's rotation takes it whenever it's ready
([mage](../classes/mage.md#defaults)).

**Judgement of the Crusader** is a paladin's own, like the Feral cat's Faerie Fire: both paladin
specs judge it at the pull and keep it up with their auto attacks, Retribution and, since T2,
Protection (its opener: Seal of the Crusader before the pull, judged at the pull, then Seal of Fury;
[paladin](../classes/paladin.md#forever-priority-list-default-1)). So the Buffs tab's
(`judgementOfTheCrusader`, [§4.2](#42-other-debuffs)) is in no preset (`SpecMeta.ownBuffs`), shows as
yours while your rotation keeps yours up, and counts once; with yours off, turning it on means
another paladin's, on the boss from the pull. Only paladins deal Holy damage among the specs in
scope, so no other class sees it. Each Holy hit's share of its +161 is the Character → Advanced rule
([paladin](../classes/paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc)).

### 6.3 Consumables by spec and preset

Standard = what a typical guild raider brings. Max = everything that stacks, still no world
buffs. Forever's new elixirs (Grizzly, Ferocity, Cunning, Phalanx) default **off** until
their stacking group is verified; the UI offers them as options.

| Spec | Pre-raid dungeon group | Standard raid | Max-consumables raid (adds / replaces) |
| --- | --- | --- | --- |
| Arms / Fury | Smoked Desert Dumplings; Dense Sharpening Stone / Weightstone | Mongoose; Elixir of Greater Strength (Giants); Winterfall Firewater; Smoked Desert Dumplings; Dense stone on each weapon; Mighty Rage Potion | Juju Power (replaces Giants); Juju Might (replaces Firewater); R.O.I.D.S.; Juju Flurry (on use); Elemental Sharpening Stone (replaces Dense on each weapon). No explosive: EZ-Thro Dark Bomb's throw costs a warrior more than it deals (Fury −1.9%, Arms −2.7% as the sim times it, an upper bound; below), and the Sapper and Dense Dynamite aren't in the catalogue; one explosive would be on at a time anyway (`cooldown:explosive`) |
| Prot warrior | Smoked Desert Dumplings | Elixir of Greater Defense; Elixir of Fortitude (+200); Mongoose; Giants; Smoked Desert Dumplings; Dense stone; Mighty Rage Potion | Flask of the Titans; Juju Power; Juju Might; R.O.I.D.S.; Rumsey Rum Black Label; Elemental stone (replaces Dense). Keeps the Mighty Rage Potion: Greater Stoneshield shares its cooldown (below) |
| Feral cat | Flank au Poivre (+20 Agi) | Mongoose; Giants; Flank au Poivre | Juju Power; Juju Might; Ground Scorpok Assay; Mighty Rage Potion (for its +60 Str; the rage is wasted in cat) |
| Feral bear | Smoked Desert Dumplings | Elixir of Greater Defense; Elixir of Fortitude; Mongoose; Giants; Smoked Desert Dumplings; Mighty Rage Potion (druids can use it in Forever) | Flask of the Titans; Juju Power; Juju Might; R.O.I.D.S.; Rumsey Rum. Keeps the Mighty Rage Potion (below) |
| Retribution | Smoked Desert Dumplings; Dense stone | Mongoose; Giants; **Greater Arcane Elixir** (per-spec entry: Forever Ret's seals, judgements and Holy Strike scale with spell power, see [paladin](../classes/paladin.md#retribution-defaults)); Smoked Desert Dumplings; Dense stone; Major Mana Potion | Juju Power; Juju Might; R.O.I.D.S.; Juju Flurry (on use); Elixir of Holy Power; Elemental stone; Demonic / Dark Rune; Flask of Supreme Power (whether it pays off depends on Ret's Holy-damage scaling, see [paladin](../classes/paladin.md)) |
| Enhancement shaman | Smoked Desert Dumplings | Mongoose; Giants; Smoked Desert Dumplings; Major Mana Potion. No stone: the weapon imbue is the main hand's temporary enchant ([shaman](../classes/shaman.md#defaults)) | Juju Power; Juju Might; R.O.I.D.S.; Juju Flurry (on use); Greater Arcane Elixir; Flask of Supreme Power; Demonic / Dark Rune; Major Frenzy Potion (replaces Major Mana Potion, below) |
| Elemental shaman | — | Greater Arcane Elixir; Nightfin Soup; Brilliant Wizard Oil; Major Mana Potion. No stones: a caster never swings, and the melee entries leave its Buffs tab ([shaman](../classes/shaman.md#elemental-defaults)) | Flask of Supreme Power; Demonic / Dark Rune |
| Rogue (all three) | Flank au Poivre; Deadly Poison V (main hand), Instant Poison VI (off hand) | Mongoose; Flank au Poivre; the same poisons; Thistle Tea | Juju Power; Juju Might; Ground Scorpok Assay; Juju Flurry (on use); Major Frenzy Potion (below) |
| Warlock (all three) | — | Greater Arcane Elixir; Elixir of Shadow Power; Major Mana Potion ([warlock](../classes/warlock.md#74-enchants-and-consumables)) | Flask of Supreme Power; Demonic / Dark Rune; Brilliant Wizard Oil |
| Shadow Priest | — | Greater Arcane Elixir; Elixir of Shadow Power; Major Mana Potion ([priest](../classes/priest.md#74-enchants-and-consumables)) | Flask of Supreme Power; Demonic / Dark Rune; Brilliant Wizard Oil |
| Balance druid | — | Greater Arcane Elixir; Major Mana Potion ([druid](../classes/druid.md#11-balance-moonkin-sim-model)) | Flask of Supreme Power; Demonic / Dark Rune; Brilliant Wizard Oil |
| Prot paladin | Nightfin Soup | Elixir of Greater Defense; Elixir of Fortitude; Elixir of Holy Power; Nightfin Soup (+22 spell damage); Wizard Oil; Major Mana Potion | Flask of Supreme Power; Greater Arcane Elixir; Brilliant Wizard Oil (replaces Wizard Oil); Demonic / Dark Rune |
| Mage (Fire, Frost, Arcane) | — | Greater Arcane Elixir; Major Mana Potion. Conjured mana gems are the mage's own ([mage](../classes/mage.md#mana)) | Flask of Supreme Power; Demonic / Dark Rune; Nightfin Soup; Brilliant Wizard Oil. Elixir of Frost Power and the other caster foods aren't in the catalogue yet (a known gap) |

**One potion in Max consumables.** The potions share one cooldown, so a preset turns on one: the
tanks keep the Mighty Rage Potion, whose rage makes threat, and Greater Stoneshield Potion is in no
preset: its armor lowers the damage you take and nothing a tank's TPS reads (rage from damage taken
reads the hit before armor in `forever`, [§3.5](#35-potions-and-runes)). Turning it on in the Buffs
tab turns the rage potion off; the rotation then drinks Stoneshield on cooldown from the pull. At
Max consumables it lowers a Protection warrior's damage taken from 609 to 531 a second, a bear's
from 627 to 554 and a Protection paladin's (in place of its Major Mana Potion) from 904 to 788,
for 0.7–3.7% less threat without the rage potion or the mana potion (seed 12345, 2,000 fights).

**Major Frenzy Potion in Max consumables** where it beats the spec's current potion, each spec's
Max consumables with its potion and then with the Frenzy potion in its place (seed 12345, 20,000
fights for the close ones, 2,000 for the rest; the Frenzy potion drunk on cooldown from the pull),
**at the default 3 min fight**:

| Spec | Its potion at Max before | With the Major Frenzy Potion | In Max |
| --- | --- | --- | --- |
| Rogue (Combat, Assassination, Subtlety) | none | +1.2%, +1.0%, +1.2% DPS | yes |
| Enhancement shaman | Major Mana Potion (it rarely runs short in 3 min) | +0.9% DPS | yes, in its place |
| Marksmanship, Survival hunter | Major Mana Potion | +0.9%, +0.6% DPS | yes, in its place |
| Beast Mastery hunter | Major Mana Potion | −3.5% DPS: it needs the mana | no |
| Feral cat | Mighty Rage Potion, with Berserk | +0.2% DPS, a tie | no: its rotation times the rage potion |
| Fury, Arms | Mighty Rage Potion | −1.1%, −1.7% DPS | no |
| Retribution | Major Mana Potion | −1.1% DPS | no |
| Protection warrior, bear, Protection paladin | Mighty Rage Potion; the paladin's Major Mana Potion | −0.7%, −2.8%, −1.9% TPS | no |

**The Frenzy potion's lead holds only for short fights.** In a 5 min fight the mana runs short and
the Major Mana Potion wins for all three that swap it (Max consumables, seed 12345, 20,000 fights,
paired): Enhancement −0.85% (638.9 against 644.3 DPS), Marksmanship −2.41% (537.2 against 550.4) and
Survival −3.37% (490.8 against 507.9) with the Frenzy potion. The presets stay as the table says,
since the default fight is 3 min; for a longer fight, swap the Frenzy potion for the Major Mana
Potion in Buffs.

The Standard raid keeps each spec's potion as it was; this check is Max consumables' (D29).

**No bomb in Max consumables.** EZ-Thro Dark Bomb deals 7–8 damage a second over a 3 min fight.
For a spec that swings its 1 s throw restarts both swings and holds the next GCD, so white damage and
rage are lost. The sim throws it on cooldown after the pull's first swing, wherever the swing timer
is, so the melee cost below is an **upper bound** [?]: a player who throws right after a swing loses
less ([§3.7](#37-engineering-and-explosives)). At Max consumables (seed 12345, 2,000 fights, each
run's 95% confidence interval; 3.3 throws a fight, as the fight's length varies by 10%) every melee
spec loses: **Fury from 814.5 ± 2.0 to 799.3 ± 2.1 DPS (−1.87%)**, **Arms from 728.7 ± 2.2 to
708.7 ± 2.3 (−2.75%)**, Enhancement 646.6 ± 2.3 → 631.9 ± 2.2 (−2.28%), Retribution 760.8 ± 2.1 →
749.8 ± 2.0 (−1.44%), Combat 664.5 ± 1.4 → 656.5 ± 1.4 (−1.19%), a Feral cat 637.3 ± 1.0 → 632.3 ±
1.0 (−0.78%), Subtlety 569.2 ± 1.0 → 566.5 ± 1.0 (−0.47%) and Assassination 594.2 ± 1.1 → 592.3 ±
1.1 (−0.31%). The tanks lose threat: Protection warrior 1,293.2 ± 2.4 → 1,275.3 ± 2.4 TPS (−1.38%),
bear 1,191.5 ± 3.7 → 1,166.5 ± 3.6 (−2.10%), Protection paladin 962.4 ± 1.6 → 941.5 ± 1.6 (−2.17%).
Timed to the swings, the true cost lies between the two models: the swing window the sim used
before (§3.7), which threw only just after a swing, measured Fury −1.07% and Arms −0.56%, but a small
gain for the Feral cat (+0.28%), Retribution (+0.24%), the Protection paladin (+0.23% TPS) and
Subtlety (+0.19%). For those four the effect is within ±0.3% either way, so no melee preset throws it
(D29); whether a druid can throw it in Cat or Bear Form at all is open too
([open questions](#open-questions)). A caster loses a second of casting instead, and its result is
mixed (seed 12345, 2,000 fights): a Fire mage +0.63%, Affliction +0.24%, Elemental +0.24% and
Balance +0.16%, while Frost and Arcane −0.10%, Destruction −0.21%, Shadow −0.33% and Demonology
−0.45% lose. The hunters, whose Auto Shot it only holds, gain: Marksmanship
+0.89%, Survival +0.85%, Beast Mastery +0.51%. Its 15 yd range is the catch for both: a caster or
hunter at 30 yd or more would have to move in to throw it, which the sim doesn't model, so no caster
or hunter preset throws it yet (a known gap in the [milestones](../milestones.md)).

Druids in forms and weapon temporary enchants: whether stones or oils do anything in cat or
bear form is owned by [druid](../classes/druid.md). A shaman's weapon imbue is its main hand's
temporary enchant, so stones and oils are locked off for an Enhancement shaman with that reason
(`buffUnusedReason`; [shaman](../classes/shaman.md#weapon-imbues)); an Elemental shaman, a caster,
doesn't see the stones at all (`forSpecs: 'melee'`). Hyjal flasks are added automatically
only when the encounter is in Mount Hyjal, Hyjal Summit or the Barrow Deeps.

### 6.4 Enchant defaults by spec

These are the recommended defaults. The class docs own the final choice ([doctrine
§5](../doctrine.md#5-defaults)). Entries whose availability in Forever is [?] (ZG, Scourge)
are defaults only if the guild confirms the content exists; the fallback is in brackets.

| Slot | Arms / Fury | Prot warrior | Feral cat | Feral bear | Retribution | Prot paladin |
| --- | --- | --- | --- | --- | --- | --- |
| Head, legs | Arcanum of Voracity (Str) | Arcanum of Voracity (Str) | Arcanum of Voracity (Agi) | Arcanum of Voracity (Agi) | Arcanum of Voracity (Str) | Arcanum of Focus |
| Shoulders | Zandalar Signet of Might [none] | Zandalar Signet of Might [none] | Zandalar Signet of Might [none] | Zandalar Signet of Might [none] | Zandalar Signet of Might [none] | Zandalar Signet of Mojo [none] |
| Cloak | Agility (+5) | Agility (+5) | Agility (+5) | Agility (+5) | Agility (+5) | Superior Defense (+70) |
| Chest | Greater Stats (+4) | Greater Stats (+4) | Greater Stats (+4) | Greater Stats (+4) | Greater Stats (+4) | Greater Stats (+4) |
| Bracers | Superior Strength (+9) | Superior Strength (+9) | Superior Agility (+9) | Superior Agility (+9) | Superior Strength (+9) | Superior Stamina (+9) |
| Gloves | Greater Strength (+10) | Threat (+2%) | Greater Agility (+10) | Threat (+2%) | Greater Strength (+10) | Threat (+2%) |
| Boots | Greater Agility (+7) | Greater Agility (+7) | Greater Agility (+7) | Greater Agility (+7) | Greater Agility (+7) | Greater Agility (+7) |
| Weapon | Crusader (each weapon) | Crusader | 2H Agility (+25) | 2H Agility (+25) | Crusader | Spell Power (+30) |
| Shield | — | Greater Stamina (+9) | — | — | — | Greater Stamina (+9) |
| Necklace (new) | Strength (+5) | Strength (+5) | Agility (+5) | Agility (+5) | Strength (+5) | — |

**Warlock** ([warlock](../classes/warlock.md#74-enchants-and-consumables)): Arcanum of Focus (+8 spell
damage) on head and legs, Greater Stats on the chest, Minor Haste gloves (Forever's +1% casting
speed), and the weapon's Spell Power (+30). The catalogue has no caster enchant for the other slots
yet, so they stay empty.

The Superior Strength and Superior Agility gloves (+15) are stronger than Greater (+10) but
come from harder-to-get formulas. Offer them as options; don't default to them.

**Elemental shaman:** Greater Stats on the chest. Its column would be the Prot paladin's caster
enchants (Arcanum of Focus, Zandalar Signet of Mojo, Spell Power on the weapon), which the sim's
enchant catalogue doesn't have yet ([shaman](../classes/shaman.md#elemental-defaults)).

**Enhancement shaman:** Retribution's column. Its default weapon is a two-hander, so no shield, and
the weapon's Crusader sits beside the imbue, which is the temporary enchant
([shaman](../classes/shaman.md#defaults)).

---

## WoW Forever deviations

**Raid and party buffs**
- Battle Shout 232 → **139** AP, 3 min. Improved Battle Shout removed.
- Blessing of Might 185 → **133**. Improved Blessing of Might removed. All Blessings last
  **1 h**; Kings is baseline at level 20. **Sanctuary removed.**
- Mark / Gift of the Wild 285 / 12 / 20 → **385 / 16 / 27**, raid-wide, 1 h. Improved Mark
  of the Wild removed.
- Power Word: Fortitude 54 → **70**, raid-wide Prayer, 1 h. Improved Fortitude removed.
  Divine Spirit is baseline. Arcane Intellect lasts 1 h and Brilliance is raid-wide.
- Trueshot Aura is **ranged-only** (up to 75). Leader of the Pack's +3% crit is now
  exclusive with the new all-crit Moonkin Aura.
- Totems: 5 min, 30 yd. Strength of Earth 77 → **53**, Grace of Air 77 → **89**, Windfury
  315 → **246** AP and now a **party aura** instead of a weapon enchant. Enhancing Totems,
  Improved Weapon Totems and Totemic Mastery removed. The site listed **Tranquil Air** as removed
  too; the 1.60.1.70009 development notes name it among the air totems that no longer stack
  ([dev-70009]), and its aura 25909 is still in the client, though its totem spell 25908 isn't
  (§1.2).
- Sanctity Aura and Improved Devotion Aura removed. Retribution Aura 20 → 30.
- Both factions have paladins and shamans ([F] client `CharBaseInfo`; the site's own list is
  community-reported).
- **New: camp buffs.** Profession objects at a campfire give 1-hour copies of class buffs
  (Lodestone +90 AP, Sharpening Wheel +34 Str, Camp Chair +2% crit, Fish Bowl +8% stats, …),
  each exclusive with the class buff it copies.
- Consumable and enchant tooltips still use percentages, not the ratings Forever gear uses.

**World buffs**: excluded by directive. The Forever client turns three of them into dummy
auras ([§2](#2-world-buffs-excluded)).

**Consumables**
- Elixir of the Mongoose lasts 30 min (was 1 h). Giants, Superior Defense, Fortitude and
  Greater Firepower were **renamed** to Greater Strength, Greater Defense, Lesser Fortitude
  and **Holy Power** (the last now +40 Holy).
- New elixirs: Grizzly, Ferocity, Cunning, Phalanx, Fortitude (+200), Greater Fortitude
  (+400). New Hyjal-only flasks. New Distilled Firewater (same buff as Winterfall
  Firewater). New Frenzy potions, which share the potion cooldown.
- Food: flat AP (+30 / +40) and +1% crit foods, +20 Str / +20 Agi foods, 15 min.
- Rage potions usable by **Druids**. Wizard Oil and Brilliant Mana Oil buffed.
- New EZ-Thro explosives usable without Engineering.
- No change found: Flask of the Titans, Supreme Power, Juju (all), Blasted Lands buffs,
  Winterfall Firewater, Smoked Desert Dumplings (value), Blessed Sunfruit, sharpening
  stones, weightstones, runes, Major Mana, Stoneshield, Free Action, and Classic
  engineering explosives.

**Target debuffs**
- Expose Armor 1700 → **2250** at 5 CP (equal to 5 Sunders), and Improved Expose Armor no
  longer reduces armor. Curse of Recklessness 640 → **505** with no AP bonus. **Faerie Fire
  (Feral) removed**; Faerie Fire can be cast in feral forms. Annihilator 200 → **165** per
  stack. Rivenspike −100 per stack in the client.
- Judgements last **40 s**; Judgement of the Crusader 140 → **161**; Improved Seal of the
  Crusader removed.
- Curse of the Elements now covers **all magic schools including Holy**; Curse of Shadow
  removed.
- Demoralizing Shout −204 at 60 (−196 base) for 45 s, Demoralizing Roar −204 at 60 (−193 base), Thunder Clap −20% (6 s
  cooldown), Curse of Weakness −37 physical. The improved versions of these were removed.
- Hunter's Mark 110 → 71, still ranged-only; Improved Hunter's Mark removed. Stormstrike
  no longer debuffs the target.
- No change found: Sunder Armor, Nightfall.
- Debuff limit: no Forever information.

**Enchants**
- Gloves: Agility / Strength +5 → **+7**, Greater +7 → **+10**, new Superior Strength
  **+15**; Minor Haste is now +1% haste including casting.
- Bracers: new Agility line (+5 / +7 / +9), Deflection +3 → **+7**, new Superior
  Deflection +9.
- Chest: Major and Superior Health became **+10 / +8 Stamina**.
- Shields: Stamina enchants +2; a +1% Critical Strike shield enchant exists.
- New necklace enchants; new 2H Strength +25 and Lesser Strength / Agility +15.
- New armor kits: Forceful Rugged (+10 AP, +40 armor) and Wild Leather (+4 defense,
  +10 Sta).
- No change found: Crusader, +15 Agi / Str weapon, +25 Agi 2H, Fiery, Icy Chill (effect),
  Lifestealing, Unholy, bracer Strength line, Greater Stats, cloak Superior Defense, Dodge,
  Subtlety, Threat, boots, all arcanums, ZG signets and idols, Scourge shoulder enchants.

---

## Implementation notes

### Exclusivity groups

Encode these as data (`exclusiveGroup` on each entry). When several entries in a group
are selected, keep only the one with the largest effect and warn in the UI. Turning one on in
the Buffs tab turns the others of its group off.
`normalizeConfig` first keeps one the spec can use over one locked off for it (`buffUnusedReason`:
a hunter's Grilled Squid over Smoked Desert Dumplings, whose attack power its shots don't use).
Then it compares effects when both entries change the same things (Juju Power's
+30 Strength beats Elixir of Greater Strength's +25) and keeps the first on a tie. When they
change different things (Mightfish Steak's attack power against Smoked Desert Dumplings'
Strength), it keeps the one the spec's Max consumables preset picks, and otherwise the first. A
stone or oil keeps the one a weapon would take, by its priority ([§3.6](#36-weapon-enhancements-temporary)). The
note says why the other went: it "doesn't stack with", "takes the same weapon as" or "shares a
cooldown with" the one kept. One that's locked off for the spec anyway (an Enhancement shaman's
stones, `buffUnusedReason`) did nothing, so it goes without a note.

| Group key | Members | Tag |
| --- | --- | --- |
| `blessing:<type>` | Blessing and Greater Blessing of the same type; one Blessing per paladin (model it as one toggle per type) | [F] |
| `party-crit-aura` | Leader of the Pack, Moonkin Aura, Camp Chair | [F] (Camp Chair vs LotP [?]) |
| `camp:<copied buff>` | Each camp object and the class buff it copies (Lodestone / Might, Sharpening Wheel / Strength of Earth, Fish Bowl / Kings, Enchanted Lute / Mark of the Wild, First Aid Kit / Fortitude, …) | [F] |
| `totem:air` (one per group, even from different shamans, since 1.60.1.70009) | Windfury Totem, Grace of Air Totem (and Tranquil Air and Flametongue Totem, not in the catalogue; the notes say Flametongue no longer stacks with Windfury) | [F] [dev-70009]; [client] (SpellMisc `Attributes[11]` 0x400 on every rank's aura: Windfury Totem 8515, 10609, 10612; Grace of Air 8836, 10626, 25360; Flametongue Totem 8230, 8250, 10521, 15036; Tranquil Air 25909; 1.60.1.70009) |
| `totem:earth` (per shaman) | Strength of Earth Totem, Stoneskin Totem | [F] |
| `flask` | All flasks | [F] |
| `elixir:strength` | Elixir of Greater Strength (Giants), Juju Power; probably Brute Force, and maybe the new Str elixirs | [C] core, [?] rest |
| `elixir:agility` | Mongoose, Greater Agility; maybe the new Agi elixirs | [?] |
| `buff:ap-drink` | Juju Might, Winterfall Firewater, Distilled Firewater | [C] / [F] |
| `blasted-lands` | R.O.I.D.S., Ground Scorpok Assay, Lung Juice, Cerebral Cortex, Gizzard Gum (shared 1 h category cooldown) | [F] |
| `zanza` | Spirit / Swiftness / Sheen of Zanza | [F] tooltip |
| `food` | All Well Fed foods (Dirge's and Sunfruit [?]) | [?] |
| `health-elixir` | Lesser Fortitude, Fortitude, Greater Fortitude | [?] |
| `temp-enchant` | Dense and Elemental Sharpening Stones, Wizard Oil, Brilliant Wizard Oil: one stone on each weapon, or one oil on the only weapon of a class that can use oils ([§3.6](#36-weapon-enhancements-temporary)); Windfury Totem takes the main hand's in Classic only | [C] |
| `poison:mainHand`, `poison:offHand` | The rogue's poisons, one per hand, each in place of a stone there ([rogue §4](../classes/rogue.md#4-poisons)) | [C] |
| `cooldown:potion` | Mighty Rage, Major Mana, Greater Stoneshield and Major Frenzy Potions: ItemEffect category 4, 120 s (the Frenzy potion's on its spell, 1251940) | [F] |
| `cooldown:rune` | Demonic Rune (a Dark Rune is the same) and Thistle Tea: category 1153, 120 s | [F] |
| `cooldown:explosive` | EZ-Thro Dark Bomb: category 24, 60 s | [F] |
| `armor-major` | Sunder Armor ×5, Expose Armor | [C] / [?] |
| `ap-reduction` | Demoralizing Shout, Demoralizing Roar | [?] |
| `curse:<warlock n>` | One curse per warlock | [F] |
| `judgement:<paladin n>` | One Judgement per paladin | [F] |

### On-use items and cooldown categories

The APL uses these as actions, not as static buffs. The cooldown lengths are in the
tooltips [F]; which items *share* a category comes from the client [F] [client] (ItemEffect,
SpellCategories, 1.60.1.69913).

| Category | Members | Shared cooldown |
| --- | --- | --- |
| Potion (4) | Mighty / Great Rage, Major Mana, Major Healing, Greater Stoneshield, Free Action, and the Frenzy potions (whose category is on their spells, not their item effects) | 120 s |
| Rune (1153) | Demonic Rune, Dark Rune, Thistle Tea | 120 s (independent of potions; Thistle Tea also has its own 300 s) |
| Explosive (24) | Sapper, Dense Dynamite, Thorium Grenade, EZ-Thro / SAF-T items | 60 s (the Sapper also has its own 300 s) |
| Own cooldown only | Juju Flurry, Juju Might, Juju Power, Winterfall Firewater | 60 s |

**One of a category at a time.** Each category is an exclusive group (`cooldown:potion`,
`cooldown:rune`, `cooldown:explosive`, [Exclusivity groups](#exclusivity-groups)), so the Buffs tab
has at most one potion, one rune and one explosive on, and each is used on its category's
cooldown. That's how the rotations use them: a warrior or a bear drinks its Mighty Rage Potion once
a fight, anyone who spends mana drinks their Major Mana Potion whenever they're short of it, and
Greater Stoneshield and Major Frenzy Potions are drunk whenever they're ready, each on the 2 min cooldown, so a second kind
of potion would only take the first one's turns; the rune, on a cooldown of its own, goes beside the
potion. That holds while no entry of a category has a cooldown of its own longer than the
category's. One that does (the Sapper's 300 s, Thistle Tea's 300 s) leaves the category's cooldown
free in between, which a second entry could use: once such items are simulated side by side, the
category needs an alternation model rather than one entry. The same goes for the one pairing
players do use, a tank's Greater Stoneshield Potion on the pull and a rage potion 2 min later: the
sim offers one potion, so that pairing isn't simulated. `effects/client-values.test.ts` ties each
entry's group to its item's category.

**Which the rotation uses** ([warrior §5.2](../classes/warrior.md#52-fury-dual-wield) rows 16
and 17): the Fury rotation drinks the Mighty Rage Potion once, from the start of the execute
phase, and uses Juju Flurry on cooldown from the pull, each only when it's selected here; both
are off the GCD. The Feral cat ([druid §6.2](../classes/druid.md#62-forever-cat-priority)) drinks the
potion once, with Berserk, for its +60 Strength, and uses Juju Flurry on cooldown. Retribution
([paladin](../classes/paladin.md#forever-priority-list-default)) uses Juju Flurry on cooldown from
the pull too (more swings, more Seal of Command procs), and drinks the Major Mana Potion and uses
a Demonic or Dark Rune whenever it's missing at least the mana its setting names, off the GCD and
each on its own category's cooldown; a rune's 600–1000 health cost isn't simulated. Every
rotation uses Greater Stoneshield Potion, Major Frenzy Potion and EZ-Thro Dark Bomb, when they're selected, on their
categories' cooldowns from the pull, ahead of its own lines, and a spec that swings throws the bomb
first just after its first main-hand swing (`classes/shared-consumables.ts`;
[§3.5](#35-potions-and-runes), [§3.7](#37-engineering-and-explosives)). An
on-use *item* (a trinket, the Manual Crowd Pummeler) keeps its own cooldown and charges from its
item effect: the Pummeler's +50% attack speed is ready every 180 s, 3 times a fight [F] [client]
(ItemEffect, 1.60.1.69913; [druid §7.3](../classes/druid.md#73-weapon)). The long buffs above
(Juju Might, Juju Power, Firewater, elixirs, food) are static: used before the pull and up all
fight.
### Modelling rules

- **Static external buffs** (blessings, shouts, marks, totems, auras, elixirs, food) are
  assumed up for the whole fight. Every duration is at least 3 min, and fight length is
  owned by [encounter](encounter.md). A warrior's *own* Battle Shout upkeep belongs to
  [warrior](../classes/warrior.md#52-fury-dual-wield): the Battle Shout switch here means
  *someone else* keeps it up. When the warrior's rotation keeps its own up (Fury's default), the
  switch's static +139 is left out and the shout is an aura in the fight, so it counts once; the
  switch shows as on and locked. With the rotation's shout off, the switch decides.
- **Stat order**: flat buffs are added first, then Blessing of Kings multiplies. Rounding
  and conversions are in [character-stats](character-stats.md).
- **Windfury Totem (Forever)**: on each main-hand melee hit, roll 20%. On success, queue
  one extra main-hand attack that gets +246 AP. The extra attack can't proc Windfury again,
  and a proc starts the client's 100 ms internal cooldown [F]
  ([damage-and-timing §5.4](damage-and-timing.md#54-extra-attacks-and-chaining)).
  The totem aura is not a weapon enchant, so a main-hand temporary enchant is allowed ([?]).
  `classicEra`: +315 AP, and the totem's enchant replaces the main-hand temporary enchant [C]
  ([Windfury Totem](#windfury-totem)).
- **Temporary weapon enchants**: one stone or oil is on at a time (`temp-enchant`), and each weapon
  takes it if it fits; a rogue's poison on a hand takes that weapon's place from a stone.
  Each Elemental Sharpening Stone adds +2% crit to all melee attacks, so a stone on each weapon
  gives +4% [?] ([§3.6](#36-weapon-enhancements-temporary)).
- **Weapon enchant procs** use PPM (`chance = PPM × weaponSpeed / 60`, see
  [glossary](../glossary.md)). Crusader 1, Fiery 6 and Lifestealing 6 are [C] (the pre-SoD
  WarriorSim, [ws-gear]); Icy Chill 1.6 and Unholy 3 are [?] (an unversioned wiki only).
- **Holy-damage modifiers** (Judgement of the Crusader, Curse of the Elements, Elixir of
  Holy Power, Flask of Supreme Power, spell-damage food and oils) only matter to paladin
  specs. How "up to 161" applies to each Holy source belongs to
  [paladin](../classes/paladin.md).
- **Mana over time** is mana per 5 s on the sim's 2 s mana tick
  ([paladin](../classes/paladin.md#mana-model)): Blessing of Wisdom's 40 every 5 s is 16 a
  tick, and Mana Spring Totem's 10 every 2 s is 25 per 5 s, so exactly its 10 a tick. The
  Blessing's 5 s period isn't kept (under 0.5% of DPS).
- **Boss-side debuffs** (Demoralizing Shout / Roar, Thunder Clap, Curse of Weakness) reduce
  damage taken, which lowers tank rage from damage taken ([rage](rage.md)). They don't
  change DPS.
- **Hyjal flasks** are enabled only if the encounter zone is Mount Hyjal, Hyjal Summit or
  the Barrow Deeps.
- **Skipped (< 0.5% of DPS/TPS)**: Blood Pact, Gift of Arthas, Battle Squawk, healer-proc armor
  buffs (Inspiration / Ancestral Fortitude), and debuff-slot pressure. Retribution Aura (the
  Protection paladin's) and Thorns on the tank are modelled: a tank breaks the 0.5% bar
  ([§1.2](#12-threat-defense-and-mana)); on anyone else they do nothing, since only the tank is hit.

### Class-only entries

An entry that does nothing for some classes carries the classes it's for (`forClasses` in
`src/sim/effects/buffs.ts`). So far these are the paladin's: Prayer of Spirit, Arcane
Brilliance, Blessing of Wisdom, Mana Spring Totem, Greater Arcane Elixir, Elixir of Holy Power,
Flask of Supreme Power, the Major Mana Potion and the Demonic Rune (a Dark Rune is the same),
and since T2 the caster food and oils, Nightfin Soup, Wizard Oil and Brilliant Wizard Oil. Another
paladin's Judgement of the Crusader, which a paladin's rotation judges itself, is the paladin's alone:
it's Holy damage taken, which no other class in scope deals.
The shaman spends mana and deals Nature and Frost spell damage, so every one of them is the
shaman's too, except the Elixir of Holy Power: its +40 is Holy only, which no shaman spell uses
([shaman](../classes/shaman.md#spell-damage)). The caster classes (`CASTER_CLASSES`: those whose
every spec is a caster, the mage since K2, the warlock since K3 and the priest since K4) get them
too, all but Elixir of Holy Power, and so does every caster spec of another class
(`forCasterSpecs`): the druid's Balance spec since K6, while its Feral specs get none of them
([druid §11.6](../classes/druid.md#116-defaults)). The Elixir of Shadow Power is the warlock's and
the priest's alone ([warlock](../classes/warlock.md#74-enchants-and-consumables),
[priest](../classes/priest.md#74-enchants-and-consumables)).
Warriors and druids in feral forms spend rage or energy, not mana (the cat never powershifts,
[druid §2.8](../classes/druid.md#28-shapeshifting-furor-wolfshead-helm-powershifting-mana)), and
deal no spell damage. The Mighty Rage Potion is for warriors and druids, the only classes Forever
lets drink it ([§3.5](#35-potions-and-runes)).

An entry for one kind of spec carries it (`forSpecs`), and a spec is a caster when its `SpecMeta`
sets `caster` (the mage's three since K2 and the warlock's two since K3,
[spells §12](spells.md#12-what-a-class-slice-uses)):

- **The melee's** (`forSpecs: 'melee'`): what changes only attacks, so a caster's spells never
  feel it. Attack power (Battle Shout, Blessing of Might, Winterfall Firewater, Juju Might,
  Mightfish Steak), Strength and Agility (Strength of Earth and Grace of Air Totems, Elixir of
  Greater Strength, Juju Power, R.O.I.D.S., Ground Scorpok Assay, Smoked Desert Dumplings, Flank au
  Poivre), attacks and weapons (Windfury Totem, Juju Flurry, the Dense and Elemental Sharpening
  Stones, the Mighty Rage Potion), the boss's armor (Sunder Armor, Expose Armor, Faerie Fire, Curse
  of Recklessness, Armor Shatter), and Leader of the Pack, the melee's party crit aura as Moonkin
  Aura is the casters' ([§6.2](#62-buffs-and-debuffs-by-preset)). `effects/spec-kind.test.ts` checks
  each entry's effects against the mark, so a new entry that changes only attacks can't go unmarked.
  An entry whose Forever item reaches spells too stays for everyone: Elixir of the Mongoose, Grilled
  Squid and Flask of Natural Aggression give all crit (aura 290) in Forever, spell crit included, so
  a caster sees them. The debuffs on the boss's swings (Demoralizing Shout and Roar, Thunder Clap)
  aren't marked: they're a tank's, and every DPS spec, a caster too, sees them with the note that
  they change nothing for it ([ux.md](../ux.md) "Buffs"). **A caster whose pet swings**
  (`SpecMeta.petMelee`: the Demonology warlock, whose Succubus or Felhunter attacks, H3) keeps the
  boss's armor entries, in its Buffs tab and presets alike: its pet's swings meet the boss's armor
  ([ranged-and-pets §8](ranged-and-pets.md#8-how-owner-buffs-reach-the-pet),
  [warlock §11.2](../classes/warlock.md#112-your-demon)).
- **The casters'** (`forSpecs: 'caster'`): the caster core's ([spells §9](spells.md#9-caster-raid-buffs-and-debuffs)),
  Moonkin Aura, Power Infusion and Curse of the Elements; and Elixir of Shadow Power, which is the
  warlock's and the priest's by class too (`forClasses`).

A class slice opts its specs in by setting `SpecMeta.caster`: nothing else. For a class, or a
kind of spec, an entry isn't for, the Buffs tab doesn't list it, no preset selects it,
`normalizeConfig` turns it off in a saved setup with a note ("Battle Shout does nothing for a
caster, so it was turned off."), and the plan ignores it. The melee and tank specs' presets and
results are the same with or without the marks. The Feral cat brought no entries of its own: what
does nothing in Cat Form (a weapon stone's damage) is listed for a druid, locked off with the
reason (`buffUnusedReason`). The Enhancement shaman's stones and oils are the same: listed, and
locked off because its weapon imbue is its main hand's temporary enchant.

### Classic Era values

The `classicEra` rule profile uses each catalogue entry's Classic Era values where they differ
from Forever's. They were read from the Classic Era client **1.15.9.69722** on 2026-09-23, and
every Forever value was checked against **1.60.1.69913** at the same time [client]. In the
tables, `a + 1` is a `SpellEffect` row's `EffectBasePoints` a with `EffectDieSides` 1, so the
value is a + 1; `#n` is the effect index; `→` follows an item to its spell, an enchanting spell
to its `SpellItemEnchantment`, and an enchant to its equip spell. All **115** entries were
compared (59 buffs, debuffs and consumables, the rogue's four poisons and Thistle Tea among them;
56 enchants): **34 differ** (33 since 1.60.1.70009, below), **18 are new in Forever**, and the other **63** (64) are the same in both
clients. The caster core (2026-09-24, [spells §9](spells.md#9-caster-raid-buffs-and-debuffs))
added three, the casters' own: Moonkin Aura and Curse of the Elements differ, Power Infusion is
the same; and Minor Haste now differs, by Forever's casting speed. The Protection paladin's
threat fixes (T2, 2026-09-24) added four: Nightfin Soup, Wizard Oil and Judgement of the Crusader
differ, Brilliant Wizard Oil is the same. Since 1.60.1.70009 Wizard Oil is the same too (Forever
reverted it to +24), so **33** differ and **64** are the same. Two of the 33 differ only in the
kind of crit: Leader of the Pack and Mongoose are all crit (aura 290, spells too) in Forever and
melee and ranged crit (aura 52) in Classic Era.

- **Untalented spell values.** A Classic Era buff is the spell's own value. The providers'
  improving talents (Improved Battle Shout, Improved Blessing of Might, Improved Mark of the
  Wild, Improved Power Word: Fortitude, Enhancing Totems, Improved Weapon Totems) aren't
  applied, because the sim doesn't know the other players' builds; [worked example
  5](#worked-examples) shows the talented numbers. For reference, Forever's Mark of the Wild
  (16 / 385), Fortitude (70) and Grace of Air (89) equal Classic's with the improving talent at
  5/5, rounded.
- **New in Forever.** An entry with no Classic Era row, or whose only 1.15 row is Season of
  Discovery's (a forbidden source,
  [doctrine §2](../doctrine.md#2-where-numbers-come-from-non-negotiable)), has no Classic Era
  value, so both profiles use Forever's, as they do for Forever gear. It stays selectable in
  `classicEra`.
- **Where the values live.** An entry carries its Classic Era values itself (`classicEra` in
  `src/sim/effects/buffs.ts` and `enchants.ts`, with its own summary). The debuffs that
  worked examples tie to the profile (Expose Armor, Curse of Recklessness, Armor Shatter,
  Demoralizing Shout, Thunder Clap) and Windfury's attack power read the profile's `values`
  instead, and Windfury's main-hand enchant is the profile's `catalogue.windfuryMainHandEnchant`.
- **The warrior's own Battle Shout** (the rotation's upkeep) isn't a catalogue entry. It's the
  class ability ([warrior §3.2](../classes/warrior.md#32-buffs-debuffs-and-cooldowns)), which
  picks its profile's values the same way: +139 for 3 min in `forever`, Classic Era's 25289,
  +232 for 2 min, in `classicEra`. The character sheet counts it at that value, the same as the
  catalogue's Battle Shout (another warrior's). Recklessness and Berserker Stance follow the
  profile the same way: their crit is all crit (spells too) in `forever` and melee crit only
  (aura 52) in `classicEra`. The racials, talents and items stay Forever's in both profiles
  ([architecture](../architecture.md#rules-and-stats)).
- **Tests.** `src/sim/effects/catalogue.test.ts` mirrors these tables. With the raw client
  tables cached locally (`npm run scrape:client`), it also checks every cited row in both
  clients.

**Raid buffs and target debuffs**

| Entry (sim id) | Forever | Classic Era | Classic Era client row | Tag |
| --- | --- | --- | --- | --- |
| Battle Shout r7 (`battleShout`) | +139 AP | **+232 AP** | SpellEffect 25289 #0: 231 + 1 (+1 per level from 60) | [C] |
| Blessing of Might r7 (`blessingOfMight`) | +133 AP | **+185 AP** | 25291 #0: 184 + 1 (Greater 25916 the same) | [C] |
| Blessing of Kings (`blessingOfKings`) | +10% all stats | same | 20217 #0: 9 + 1 | [C] |
| Gift of the Wild r2 (`markOfTheWild`) | +16 all stats, +385 armor | **+12 all stats, +285 armor** | 21850 #1: 11 + 1; #0: 284 + 1 (resistances 19 + 1, not simulated) | [C] |
| Prayer of Fortitude r2 (`powerWordFortitude`) | +70 Sta | **+54 Sta** | 21564 #0: 53 + 1 | [C] |
| Prayer of Spirit (`prayerOfSpirit`) | +40 Spi | same | 27681 #0 (aura 29, Spirit): 39 + 1 (Divine Spirit 27841 the same) | [C] |
| Arcane Brilliance (`arcaneBrilliance`) | +31 Int | same | 23028 #0 (aura 29, Intellect): 30 + 1 (Arcane Intellect 10157 the same) | [C] |
| Leader of the Pack (`leaderOfThePack`) | +3% crit, spells too (aura 290) | **+3% melee and ranged crit** | 24932 #0 (aura 52): 2 + 1; Forever's is aura 290, all crit | [C] |
| Moonkin Aura (`moonkinAura`), the casters' | +3% crit, spells too (aura 290) | **+3% spell crit** | 24907 #0 (aura 57): 2 + 1; Forever's is aura 290, all crit | [C] |
| Power Infusion (`powerInfusion`), the casters' | +20% spell damage for 15 s, 3 min cooldown | same | 10060 #1 (aura 79, every magic school): 19 + 1 | [C] |
| Windfury Totem r3 (`windfuryTotem`) | 20% for an extra attack with +246 AP; a party aura | **+315 AP; a main-hand enchant that replaces a stone** | 10610 #0: 314 + 1; 10612 → 10611 → enchant 564 (20%, casts 10610) | [C] |
| Grace of Air Totem r3 (`graceOfAir`) | +89 Agi | **+77 Agi** | 25360 #0 (the totem's aura): 76 + 1 | [C] |
| Strength of Earth Totem r5 (`strengthOfEarth`) | +53 Str | **+77 Str** | 25362 #0 (the totem's aura): 76 + 1 | [C] |
| Blessing of Salvation (`blessingOfSalvation`) | −30% threat | same | 1038 #0: −31 + 1 | [C] |
| Devotion Aura r7 (`devotionAura`) | +735 armor | same | 10293 #0: 734 + 1 | [C] |
| Thorns r6 (`thorns`), on the tank | 22 Nature damage on each boss swing that lands | **18** | 9910 #0 (aura 15): 17 + 1 | [C] |
| Blessing of Wisdom r6 (`blessingOfWisdom`) | 40 mana every 5 s | **33 every 5 s** | 25290 #0 (aura 24, period 5000): 32 + 1 (Greater 25918 the same) | [C] |
| Mana Spring Totem r4 (`manaSpringTotem`) | 10 mana every 2 s (25 per 5 s) | same | the totem's Mana Spring 10494 #0 (aura 24, period 2000): 9 + 1 | [C] |
| Sunder Armor ×5 (`sunderArmor`) | −2250 armor | same | 11597 #0: −451 + 1, ×5 | [C] |
| Expose Armor (`exposeArmor`) | −2250 armor | **−1700 armor** | Both clients hold 0 (combo points scale it server-side), so these are the tooltip values ([§4.1](#41-armor-reduction)) | [C] tooltip |
| Curse of Recklessness (`curseOfRecklessness`) | −505 armor | **−640 armor, +90 boss AP** | 11717 #1: −641 + 1; #0 (aura 99): 89 + 1 (Forever's #0 is a dummy) | [C] |
| Faerie Fire (`faerieFire`) | −505 armor | same | 9907 #0: −506 + 1 | [C] |
| Annihilator ×3 (`armorShatter`) | −495 armor | **−600 armor** | 16928 #0: −201 + 1, ×3 | [C] |
| Demoralizing Roar (`demoralizingRoar`) | −204 boss AP | **−138 boss AP** | 9898 #0: −131 + 1, and −1 per level from 52, so −138 at 60 (as for Demoralizing Shout, whether combat applies the per-level term is [OQ 19](#open-questions)) | [C] |
| Demoralizing Shout (`demoralizingShout`) | −204 boss AP | **−146 boss AP** | 11556 #0: −141 + 1, and −1 per level from 54, so −146 at 60 (both clients carry a per-level term; whether combat applies it is [OQ 19](#open-questions)) | [C] |
| Thunder Clap (`thunderClap`) | boss attacks 20% slower | **10% slower** | 11581 #1 (aura 138): −11 + 1 | [C] |
| Judgement of the Crusader r6 (`judgementOfTheCrusader`) | +161 Holy damage taken | **+140** | 20303 #0 (aura 14, Holy): 139 + 1 | [C] |
| Curse of the Elements (`curseOfTheElements`), the casters' | +10% damage taken from every magic school, Holy included; −75 resistance (r4, 1311680) | **Fire and Frost only** | r3 11722 #1 (aura 87, misc 20): 9 + 1; #0 (aura 22): −76 + 1 | [C] |

**Consumables**

| Entry (sim id) | Forever | Classic Era | Classic Era client row | Tag |
| --- | --- | --- | --- | --- |
| Elixir of the Mongoose (`elixirOfTheMongoose`) | +25 Agi, +2% crit, spells too (aura 290) | **+25 Agi, +2% melee and ranged crit** | 13452 → 17538 #0: 24 + 1; #1 (aura 52): 1 + 1 | [C] |
| Elixir of Greater Strength (`elixirOfGreaterStrength`) | +25 Str | same (named Elixir of the Giants) | 9206 → 11405 #0: 24 + 1 | [C] |
| Juju Power (`jujuPower`) | +30 Str | same | 12451 → 16323 #0: 29 + 1 | [C] |
| Elixir of Greater Defense (`elixirOfGreaterDefense`) | +450 armor | same (named Elixir of Superior Defense) | 13445 → 11348 #0: 449 + 1 | [C] |
| Elixir of Fortitude (`elixirOfFortitude`) | +200 health | none: new in Forever (250334). Classic's item of that name, 3825 (+120 health), is Forever's Elixir of Lesser Fortitude, another item | — | [F] |
| Flask of the Titans (`flaskOfTheTitans`) | +1200 health | same | 13510 → 17626 #0: 1199 + 1 | [C] |
| Flask of Supreme Power (`flaskOfSupremePower`) | +150 spell damage | same | 13512 → 17628 #0 (aura 13, all magic schools): 149 + 1 | [C] |
| Greater Arcane Elixir (`greaterArcaneElixir`) | +35 spell damage | same | 13454 → 17539 #0 (aura 13, all magic schools): 34 + 1 | [C] |
| Elixir of Shadow Power (`elixirOfShadowPower`) | +40 Shadow spell damage | same | 9264 → 11474 #0 (aura 13, Shadow): 39 + 1 | [C] |
| Elixir of Holy Power (`elixirOfHolyPower`) | +40 Holy spell damage | **+40 Fire spell damage** (Elixir of Greater Firepower): nothing for Holy | 21546 → 26276 #0 (aura 13, Fire): 39 + 1 (Forever: 1310077, Holy) | [C] |
| Flasks of Natural Accuracy, Aggression, Precision, Swiftness (`flaskOfNatural…`) | +60 Sta and a zone bonus | none: new in Forever (274273–274276) | — | [F] |
| Winterfall Firewater (`winterfallFirewater`) | +35 AP | same | 12820 → 17038 #0: 34 + 1 | [C] |
| Juju Might (`jujuMight`) | +40 AP | same | 12460 → 16329 #0: 39 + 1 | [C] |
| R.O.I.D.S. (`roids`) | +25 Str | same | 8410 → 10667 #0: 24 + 1 | [C] |
| Ground Scorpok Assay (`groundScorpokAssay`) | +25 Agi | same | 8412 → 10669 #0: 24 + 1 | [C] |
| Rumsey Rum Black Label (`rumseyRum`) | +15 Sta | same | 21151 → 25804 #0: 14 + 1 | [C] |
| Smoked Desert Dumplings (`smokedDesertDumplings`) | +20 Str | same | 20452 → 24800 → Well Fed 24799 #0: 19 + 1 (Forever: 1248401 #1, aura 227 = 20) | [C] |
| Mightfish Steak (`mightfishSteak`) | +40 AP | **+10 Sta** | 13934 → 18234 → Increased Stamina 18191 #0: 9 + 1 (Forever: 1249515 #1 = 40) | [C] |
| Grilled Squid (`grilledSquid`) | +1% crit, spells too (Well Fed 1249523, aura 290) | **+10 Agi** | 13928 → 18230 → Increased Agility 18192 #0: 9 + 1 (Forever: 1249522 #1 = 1) | [C] |
| Dense Sharpening Stone / Weightstone (`denseSharpeningStone`) | +8 weapon damage | same | 12404 → 16138 → enchant 1643: 8; 12643 → 16622 → 1703: 8 | [C] |
| Elemental Sharpening Stone (`elementalSharpeningStone`) | +2% crit | same | 18262 → 22756 → enchant 2506 → 22755 #0: 1 + 1 | [C] |
| Nightfin Soup (`nightfinSoup`) | +22 spell damage | **8 mana every 5 s** | 13931 → Mana Regeneration 18194 #0 (aura 24, period 5000): 7 + 1 (Forever: 1249513 #1, aura 227 = 22, to Well Fed 1249520, aura 13) | [C] |
| Wizard Oil (`wizardOil`) | +24 spell damage (+30 until 1.60.1.70009) | same | 20750 → 25121 → enchant 2627 → 25111 #0 (aura 13, all magic schools): 23 + 1 | [C] |
| Brilliant Wizard Oil (`brilliantWizardOil`) | +36 spell damage, +1% spell crit | same | 20749 → 25122 → enchant 2628 → 25113 #0: 35 + 1; #2 (aura 57): 0 + 1 | [C] |
| Mighty Rage Potion (`mightyRagePotion`) | 45–75 rage, +60 Str for 20 s | same | 13442 → 17528 #0: 449 + 1d301 tenths; #1: 59 + 1; 20 s | [C] |
| Major Mana Potion (`majorManaPotion`) | 1350–2250 mana | same | 13444 → 17531 #0: 1349 + 1d901 | [C] |
| Demonic Rune (`demonicRune`; a Dark Rune is the same) | 900–1500 mana (and 600–1000 health, not simulated) | same | 12662 → 16666 and 20520 → 27869 #0: 899 + 1d601 | [C] |
| Juju Flurry (`jujuFlurry`) | +3% attack speed for 20 s | same | 12450 → 16322 #0: 2 + 1; 20 s | [C] |
| Instant Poison VI (`instantPoisonMainHand`, `instantPoisonOffHand`) | 20%: 76–100 Nature | **112–148** | 8928 → 11340 → enchant 625: 20%, proc 11337 #0: 111 + 1d37 | [C] |
| Deadly Poison V (`deadlyPoisonMainHand`, `deadlyPoisonOffHand`) | 30%: 23 a stack every 3 s, 5 stacks; ticks may crit | **34** a tick; no periodic-crit flag | 20844 → 25351 → enchant 2630: 30%, proc 25349 #0: 33 + 1, `CumulativeAura` 5 | [C] |
| Thistle Tea (`thistleTea`) | +100 Energy | same | 7676 → 9512 #0: 99 + 1 | [C] |
| EZ-Thro Dark Bomb (`ezThroDarkBomb`) | 225–675 Fire, a 1 s throw, every 60 s ([§3.7](#37-engineering-and-explosives)) | none: new in Forever (260817) | — | [F] |
| Greater Stoneshield Potion (`greaterStoneshieldPotion`) | +2,000 armor for 2 min ([§3.5](#35-potions-and-runes)) | same | 13455 → 17540 #0: 1999 + 1 | [C] |
| Major Frenzy Potion (`majorFrenzyPotion`) | +80 attack power and ranged attack power for 30 s ([§3.5](#35-potions-and-runes)) | none: new in Forever (250943) | — | [F] |

**Enchants**

| Entry (sim id) | Forever | Classic Era | Classic Era client row | Tag |
| --- | --- | --- | --- | --- |
| Crusader (`crusader`) | +100 Str for 15 s | same | 20034 → 1900 → 20007 #0: 99 + 1; 15 s (the PPM is server-side) | [C] |
| Weapon – Agility, Strength (`weaponAgility`, `weaponStrength`) | +15 Agi, +15 Str | same | 23800 → 2564 → 23794: 14 + 1; 23799 → 2563 → 23793: 14 + 1 | [C] |
| Weapon – Spell Power (`weaponSpellPower`) | +30 spell damage | same | 22749 → 2504 → 22747 #0 (aura 13, all magic schools): 29 + 1 | [C] |
| Superior Striking (`superiorStriking`) | +5 weapon damage | same | 20031 → 1897: 5 | [C] |
| Fiery Weapon (`fieryWeapon`) | 40 Fire damage | same | 13898 → 803 → 13897 #0: 39 + 1 | [C] |
| 2H Weapon – Agility (`twoHandAgility`) | +25 Agi | same | 27837 → 2646 → 27836: 24 + 1 | [C] |
| 2H Weapon – Strength, Lesser Strength (`twoHandStrength`, `twoHandLesserStrength`) | +25 Str, +15 Str | none: new in Forever (1248668, 1248511) | — | [F] |
| 2H Weapon – Superior Impact (`superiorImpact`) | +9 weapon damage | same | 20030 → 1896: 9 | [C] |
| Lesser Arcanum of Voracity (`arcanumVoracityStrength`, `…Agility`, `…Stamina`) | +8 | same | 1506, 1508, 1507 → 15396, 15401, 15399: 7 + 1 | [C] |
| Lesser Arcanum of Constitution, Tenacity (`arcanumConstitution`, `arcanumTenacity`) | +100 health, +125 armor | same | 1503 → 15388: 99 + 1; 1504 → 15390: 124 + 1 | [C] |
| Arcanum of Focus (`arcanumFocus`) | +8 spell damage | same | 2544 → 22843 #0 (aura 13, all magic schools): 7 + 1 | [C] |
| Arcanum of Rapidity, Protection (`arcanumRapidity`, `arcanumProtection`) | +1% attack speed, +1% dodge | same | 2543 → 22841 #0 (aura 138): 0 + 1; 2545 → 22847: 0 + 1 | [C] |
| Presence of Might (`presenceOfMight`) | +10 Sta, +7 defense, +15 block value | same | 2583 → 24148: 9 + 1, 6 + 1, 14 + 1 | [C] |
| Forceful Rugged, Wild Leather Armor Kit (`forcefulRuggedArmorKit`, `wildLeatherArmorKit`) | +10 AP and +40 armor; +4 defense and +10 Sta | none: new in Forever (enchants 8491, 8719) | — | [F] |
| Rugged Armor Kit (`ruggedArmorKit`) | +5 Sta, +40 armor | **+40 armor** | 15564 → 19057 → enchant 1843: 40 (Forever's 19057 applies 8490) | [C] |
| Core Armor Kit (`coreArmorKit`) | +3 defense | same | 18251 → 22725 → 2503 → 7516: 2 + 1 | [C] |
| Zandalar Signet of Might (`zandalarSignetOfMight`) | +30 AP | same | 2606 → 9336: 29 + 1 | [C] |
| Might, Fortitude of the Scourge (`mightOfTheScourge`, `fortitudeOfTheScourge`) | +26 AP and +1% crit; +16 Sta and +100 armor | same | 2717 → 29482: 25 + 1, 0 + 1; 2716 → 29481: 15 + 1, 99 + 1 | [C] |
| Cloak – Agility (`cloakAgility`) | +5 Agi | none: the 1.15 row (1219587 → 7667) is Season of Discovery's | — | [F] |
| Cloak – Lesser Agility (`cloakLesserAgility`) | +3 Agi | same | 13882 → 849 → 13364: 2 + 1 | [C] |
| Cloak – Superior Defense (`cloakSuperiorDefense`) | +70 armor | same | 20015 → 1889: 70 | [C] |
| Cloak – Greater Defense (`cloakGreaterDefense`) | +60 armor | **+50 armor** | 13746 → 884: 50 | [C] |
| Cloak – Dodge, Subtlety (`cloakDodge`, `cloakSubtlety`) | +1% dodge, −2% threat | same | 25086 → 2622 → 25071: 0 + 1; 25084 → 2621 → 25070: −3 + 1 | [C] |
| Chest – Greater Stats, Stats (`chestGreaterStats`, `chestStats`) | +4, +3 all stats | same | 20025 → 1891 → 19988: 3 + 1; 13941 → 928 → 13824: 2 + 1 | [C] |
| Chest – Major Stamina (`chestMajorStamina`) | +10 Sta | **+100 health** (Major Health) | 20026 → 1892 → 19990 (aura 34): 99 + 1 | [C] |
| Bracers – Superior, Greater Strength (`bracerSuperiorStrength`, `bracerGreaterStrength`) | +9, +7 Str | same | 20010 → 1885 → 19984: 8 + 1; 13939 → 927 → 13828: 6 + 1 | [C] |
| Bracers – Superior Stamina (`bracerSuperiorStamina`) | +9 Sta | same | 20011 → 1886 → 19985: 8 + 1 | [C] |
| Bracers – Deflection (`bracerDeflection`) | +7 defense | **+3 defense** | 13931 → 923 → 13922: 2 + 1 | [C] |
| Bracers – Superior Agility, Superior Deflection (`bracerSuperiorAgility`, `bracerSuperiorDeflection`) | +9 Agi, +9 defense | none: new in Forever (1248599, 1248665) | — | [F] |
| Gloves – Superior Strength (`gloveSuperiorStrength`) | +15 Str | none: new in Forever (1248640) | — | [F] |
| Gloves – Superior Agility (`gloveSuperiorAgility`) | +15 Agi | same | 25080 → 2564 → 23794: 14 + 1 | [C] |
| Gloves – Greater Strength (`gloveGreaterStrength`) | +10 Str | **+7 Str** | 20013 → 927 → 13828: 6 + 1 (Forever's 20013 applies 8207) | [C] |
| Gloves – Greater Agility (`gloveGreaterAgility`) | +10 Agi | **+7 Agi** | 20012 → 1887 → 13823: 6 + 1 (Forever: 8206) | [C] |
| Gloves – Strength (`gloveStrength`) | +7 Str | **+5 Str** | 13887 → 856 → 13372: 4 + 1 (Forever: 927) | [C] |
| Gloves – Agility (`gloveAgility`) | +7 Agi | **+5 Agi** | 13815 → 904 → 13365: 4 + 1 (Forever: 1887) | [C] |
| Gloves – Minor Haste (`gloveMinorHaste`) | +1% attack and casting speed | **+1% attack speed** (the tooltip has no casting speed) | 13948 → 931 → 13928 #0 (aura 138): 0 + 1; Forever's tooltip adds casting speed ([spells §4](spells.md#4-cast-times-casting-speed-and-the-gcd)) | [C] |
| Gloves – Threat (`gloveThreat`) | +2% threat | same | 25072 → 2613 → 25063: 1 + 1 | [C] |
| Boots – Greater Agility, Agility, Greater Stamina (`bootsGreaterAgility`, `bootsAgility`, `bootsGreaterStamina`) | +7 Agi, +5 Agi, +7 Sta | same | 20023 → 1887 → 13823: 6 + 1; 13935 → 904 → 13365: 4 + 1; 20020 → 929 → 13827: 6 + 1 | [C] |
| Shield – Greater Stamina (`shieldGreaterStamina`) | +9 Sta | **+7 Sta** | 20017 → 929 → 13827: 6 + 1 (Forever: 1886) | [C] |
| Shield – Excellent Stamina, Critical Strike (`shieldExcellentStamina`, `shieldCriticalStrike`) | +12 Sta, +1% crit | none: the 1.15 rows (1219581, 1220623) are Season of Discovery's | — | [F] |
| Shield – Lesser Block (`shieldLesserBlock`) | +2% block | same | 13689 → 863 → 13690: 1 + 1 | [C] |
| Necklace – Strength, Agility (`neckStrength`, `neckAgility`) | +5 Str, +5 Agi | none: a new Forever slot (1249019, 1249059) | — | [F] |

---

## Worked examples

These become unit tests. Boss armor 3731 is an *input* here; its value is owned by
[encounter](encounter.md).

1. **Standard armor debuffs, Forever.** Sunder ×5 (−2250) + Faerie Fire (−505) + Curse of
   Recklessness (−505): 3731 − 3260 = **471**.
2. **Same set in Classic Era** (regression check against a published number). Sunder ×5
   (−2250) + Faerie Fire (−505) + Curse of Recklessness (−640): 3731 − 3395 = **336**,
   which matches [crc-ea].
3. **Below zero (profile-dependent).** `forever`: Example 1 plus Armor Shatter ×3 (−495):
   471 − 495 = **−24**, not floored, so DR = −24 / 5476 = −0.438% and physical damage is
   ×**1.00438** ([damage-and-timing §1.2](damage-and-timing.md#12-armor-reduction-debuffs-and-penetration)).
   `classicEra`: Example 2 plus Armor Shatter ×3 (Classic −600): 336 − 600 = −264 → **0**.
4. **Sunder vs Expose Armor, Forever.** Sunder ×5 and a 5-CP Expose Armor both selected →
   one `armor-major` slot → **−2250** (not −4500).
5. **External melee AP, Forever standard raid.** Battle Shout 139 + Blessing of Might 133 =
   **272** flat AP. Classic Era with 5/5 Improved Battle Shout and 5/5 Improved Blessing of
   Might: 232 × 1.25 + 185 × 1.20 = 290 + 222 = **512**. That is 240 AP less in Forever. The
   `classicEra` profile uses the untalented spells ([Classic Era values](#classic-era-values)):
   232 + 185 = **417**.
6. **Strength stack.** A warrior with 200 Str from base and gear, plus Strength of Earth
   (+53) and Gift of the Wild (+16), with Kings: (200 + 53 + 16) × 1.10 = **295.9** before
   the rounding that [character-stats](character-stats.md) defines.
7. **Windfury extra attack.** A Forever proc adds +246 AP to the extra swing only. The extra
   attack is an ordinary main-hand swing, so with the AP-to-damage rule in
   [damage-and-timing](damage-and-timing.md) (AP / 14 × weapon speed), a 3.8-speed weapon
   gains 246 / 14 × 3.8 = **66.8** damage on that swing (Classic: 315 / 14 × 3.8 = 85.5).
8. **Crusader proc chance** [C]: 1 PPM on a 3.6-speed weapon → 3.6 / 60 = **6.0%** per hit.
9. **Blasted Lands cooldown.** Using R.O.I.D.S. at t = 0 blocks Ground Scorpok Assay
   until t = 3600 s. The sim must not allow both.
10. **Distilled + Winterfall Firewater.** Both apply spell 17038 → one buff, +35 AP total.
11. **Greater Stoneshield Potion on a tank.** A Protection warrior with 6,000 armor against a
    level-63 boss: 6000 / (6000 + 400 + 85 × 63) = **51.04%** reduction, so a 5,000 hit in
    Defensive Stance (×0.9) costs 5000 × 0.9 × 0.4896 = **2,203.1** health. With the potion's
    +2,000: 8000 / 13755 = 58.16%, and the hit costs **1,882.8**, 14.5% less
    ([combat-tables §8](combat-tables.md#8-boss--player-tanks)).
12. **EZ-Thro Dark Bomb on a warrior, Forever.** With no spell hit it fails 17% + 83% × 0.06 =
    **21.98%** of its throws (miss, or resisted whole at 24 Fire resistance); a landed one deals
    225–675, 450 on average, ×1.5 on a crit. At 5% spell crit a throw averages 0.7802 × 450 ×
    1.025 = **359.87**.

---

## Open questions

Each item says what was found and how the guild can check it on the Forever beta.

1. **Debuff limit in Forever.** Classic Era allows 16; Hardcore realms have no limit
   [[bt-1144]]. Nothing found for Forever. *Check:* have several players stack 17+ distinct
   debuffs on a raid boss or elite and see whether the oldest falls off.
2. **Sunder Armor vs Expose Armor in Forever.** Classic: exclusive [C]. Forever: both
   −2250. *Check:* 5 Sunders, then a 5-CP Expose Armor, then inspect the target's debuffs
   (one replaces the other, or both stay).
3. **Windfury Totem as a party aura.** Does a main-hand sharpening stone stay active with
   Windfury Totem up? Does twisting with Grace of Air still work, and does the totem proc on
   feral cat and bear attacks? Does 10610's AP aura (2 charges, 1 s in the client) give
   +246 AP to a second attack inside that second? (That an extra attack can't proc Windfury is
   Classic [C]; the internal cooldown is
   [damage-and-timing OQ 9](damage-and-timing.md#open-questions).)
   *Check:* apply a stone to the main hand next to a Windfury Totem and watch the enchant;
   combat-log 500+ swings.
4. **Stacking groups for the new Forever elixirs** (Grizzly, Ferocity, Cunning, Phalanx,
   Strength, Fortitude / Greater Fortitude) against Mongoose, Giants, Juju Power, Greater
   Defense and each other. *Check:* drink each pair and see whether both buffs stay.
5. **Mongoose vs Greater Agility, and Brute Force vs Giants, in Classic Era.** The only
   sources found are private-server and TBC-era forums (forbidden), so not adopted.
   *Check:* drink both in the beta.
6. **Food exclusivity.** One Well Fed at a time is assumed. Dirge's ("Increased Stamina")
   and Blessed Sunfruit use different buffs. *Check:* eat Dumplings, then Dirge's or
   Sunfruit, and watch the buff bar.
7. **Frenzy potions.** ✅ Resolved by 1.60.1.70009: the client now gives attack power and ranged
   attack power (auras 99 and 124, +80 / +56 / +40), where 1.60.1.69913 gave flat physical damage
   done (aura 13) under an attack power tooltip [F] [client] (SpellEffect, 1.60.1.70009). ✅
   Cooldown resolved from client data: their spells are in the potion category (4, 120 s), though
   the item effects carry none ([client] (SpellCategories, 1.60.1.69913)). *Check:* confirm that
   a Mighty Rage Potion is blocked afterwards.
8. **Enchant tooltip vs spell conflicts.** 2H Weapon – Lesser Agility (tooltip +15, spell
   19989 = +9); Bracer – Lesser Deflection and Necklace – Deflection (tooltip +5, spell
   13930 = +2). *Check:* apply the enchant and read the character sheet.
9. **Weapon-enchant PPM.** Crusader 1, Fiery 6 and Lifestealing 6 are [C] from the pre-SoD
   WarriorSim ([ws-gear]); Icy Chill 1.6 and Unholy 3 come only from an unversioned
   warcraft.wiki.gg section [[wiki-ppm]] [?]. No `SpellAuraOptions` row in the Forever client
   references a PPM row [F] [client] (SpellAuraOptions, 1.60.1.69913), so PPM is server-side and
   all five are unverified in Forever. *Check:* log 1000+ hits with a known weapon speed and fit
   the proc rate.
10. **Availability.** ZG (Signets, idols, Zanza), Naxxramas-era Scourge shoulder enchants,
    and the SoD-origin enchants with "No recipe item" in Forever (Grand Crusader, Grand
    Inquisitor, Living Stats, the +9 Bracer – Agility, and also Minor Haste gloves). Which
    raids and recipe sources exist in Forever? *Check:* the beta's content, trainers and
    drops.
11. **Rivenspike** has no Forever item row yet; its proc spell reads −100 per stack
    (Classic −200). Does Puncture Armor stack with Armor Shatter? *Check:* once the item
    drops in the beta.
12. **Blood Pact exact value.** The client value is 49 + 0.5/level [F] [client] (SpellEffect,
    1.60.1.69913); how the server applies the per-level term is unknown. *Check:* an Imp's buff
    on the party's character sheets.
13. **Race/class matrix.** ✅ Resolved from client data ([client.md](../data/client.md#doc-claims-checked-against-the-raw-client)): `CharBaseInfo` lists
    56 pairs, Undead paladin included [F]
    ([character-stats](character-stats.md#legal-races-for-the-sims-classes)). Optional cheap
    check: character creation in the beta (Undead paladin, Dwarf shaman).
14. **World buffs (context, not adopted).** The Forever client turns Rallying Cry,
    Songflower and Warchief's Blessing into dummy auras, consistent with the directive.
    Spirit of Zandalar and Fengus' Ferocity keep real stat auras in the client (Fengus now
    also +230 spell damage). This does not contradict the directive, because raid
    availability is server behaviour. No action; reported for completeness.
15. **Demoralizing Shout vs Roar** exclusivity is assumed from Classic lore, not a cited
    source. *Check:* apply both to a mob (the beta has no target dummies) and inspect its
    debuffs.
16. **Trueshot Aura rank 5** reads 50, lower than rank 4's 75, in both the tooltip and the
    client (20906 aura 124 = 50, [client] (SpellEffect, 1.60.1.69913)). Irrelevant for melee;
    flagged in case it is a data bug.
17. **Client-data reads.** ✅ Resolved from client data ([client.md](../data/client.md#doc-claims-checked-against-the-raw-client)). Every value this
    doc had marked for a browser check matches the raw 1.60.1.69913 files (and 1.15.9.69722
    for the Classic halves), with these corrections, now applied above:
    - Frenzy potions share the potion cooldown (category 4, 120 s) through their spells.
    - Blessed Sunfruit: the item casts 18124, which triggers the buff 18125.
    - Windfury: Classic's `SpellItemEnchantment` has no duration column, so enchant 564's
      10 s is unverifiable there (Forever's row says 10 s). New: 10612 has a 100 ms internal
      cooldown in the Forever client.
    - Also new: the Flask of Natural Swiftness's spell 1293743 is named "Flask of Natural
      Accuracy" in `SpellName` (its auras are haste, 342 and 65).
18. **Camp buffs in raids.** Do camps work inside instances? Do you have to be grouped with
    the object's owner? Is Camp Chair exclusive with Leader of the Pack as well as Moonkin
    Aura? *Check:* build a camp outside a raid, zone in, and inspect the buffs. Also, does
    the world-buff directive also cover event consumables such as Dark Desire and
    Fire-toasted Bun (+2% hit)? That is a guild decision. Both are default off here.
19. **Demoralizing Shout and Roar at level 60** [?]. **Shout r5: −204 [F]**, the level-60
    tooltip: the client data's −196 plus −1.4 per level from 54, which `MaxLevel` 64 doesn't cap
    below 60 [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913), is −204.4, shown as 204. The
    "tooltip −196" this doc used before was the base value rendered without the per-level term
    (by foreverchanges and by the sim's renderer until review finding L9), not the level-60
    tooltip. **Roar r5: −204 [F]** the same way (−193 and −1.4 per level from 52, `MaxLevel` 62:
    −204.2). Classic Era's rows scale too: Shout −146 and Roar −138 at 60 [C] [client]
    (1.15.9.69722). The sim's `demoralizingShout` debuff uses −204 (`classicEra`: −146). Still
    open: whether the debuff applies the tooltip's value in combat. *Check, Route C:* read the
    debuff tooltip on a target at 60.
20. **Elemental Sharpening Stone: all attacks, and two stack?** [?] Each stone's +2% melee crit
    is its own aura 52 on the warrior (enchant 2506 → 22755), with a weapon requirement that
    any melee weapon meets ([§3.6](#36-weapon-enhancements-temporary)). The sim counts it for
    every melee attack, whichever weapon holds it, and counts two stones as +4%. *Check* (Classic
    Era at 60 works too): dual wield, note the sheet's crit, put a stone on the off hand only and
    read it again (+2% means the main hand gets it), then add a second stone to the main hand
    (+4% in all means they stack).
21. **EZ-Thro Dark Bomb's rules** [?] ([§3.7](#37-engineering-and-explosives)). The client gives its
    damage, cast, cooldown and range; the sim assumes the rest, each untested:
    - **Binary resist:** its stun makes it resisted whole at the boss's average Fire resistance, and a
      landed one takes no partial resist.
    - **The cast stops swings:** its 1 s throw stops both melee swings, which restart from full as it
      lands, and holds your other abilities, off-GCD ones too (a caster's next cast, a hunter's Auto
      Shot). A melee spec's first throw follows its first main-hand swing; later ones go on
      cooldown wherever the swing timer is, so the melee cost the sim shows is an upper bound.
    - **Threat:** its damage × your threat multipliers, with no threat of its own.
    - **No class talents:** spell 1269334 has no `SpellClassOptions` row, so no talent that names your
      class's spells reads its school: no Critical Mass, Elemental Precision, Fire Power, Combustion or
      Ignite, and none of your own school multipliers.
    - **Forms:** whether a druid can throw it in Cat or Bear Form at all (the sim lets it).

    *Check:* throw 30+ bombs at a training dummy (or a mob, if the beta has none) with a swing-timer
    addon on and the combat log recording. Watch whether the swing bar restarts, pauses or runs on
    through the throw, and whether a Heroic Strike or potion can be used during it. In the log, count
    full resists and look for partial ones ("(x resisted)"), and count crits and their size (×1.5).
    As a Fire mage, compare the bombs' crit rate with Fireball's, which Critical Mass raises, and see
    whether an Ignite follows a bomb crit or a Combustion charge goes. With a second player on a mob,
    read the threat a bomb adds on a threat meter. As a druid, try it in Cat and Bear Form.

---

## Sources

| Label | URL | Covers | Ruleset |
| --- | --- | --- | --- |
| fc-changes | https://foreverchanges.pro/changes | Every changed, removed and new talent and spell (Forever vs Classic tooltips, from DB2 TraitNode / SkillLineAbility) | Forever [F] + Classic Era baseline |
| fc-sb-* | https://foreverchanges.pro/spellbook/warrior (also `/paladin`, `/druid`, `/shaman`, `/priest`, `/mage`, `/hunter`, `/warlock`, `/rogue`) | Per-rank Forever and Classic tooltips, spell IDs, "not in Forever" lists | Forever [F] |
| fc-items | https://foreverchanges.pro/items (data files `/items/new.json`, `/items/changed.json`, `/items/same.json`, `/items/missing.json`) | Forever and Classic item tooltips; "Same" means unchanged | Forever [F] |
| fc/<id> | https://foreverchanges.pro/item/13452 (pattern `/item/<id>`) | Single-item Forever vs Classic comparison | Forever [F] |
| fc-ench | https://foreverchanges.pro/professions/enchanting/recipes | All 229 Forever enchanting recipes, new ones and formula sources | Forever [F] |
| fc-racials | https://foreverchanges.pro/racials | Race/class matrix (community-reported), racials | Forever [F] / [?] |
| fc-beta | https://foreverchanges.pro/beta | Beta dates, builds, new race/class combinations | Forever [F] |
| client | [client.md](../data/client.md), `src/data/client/*.json`: raw DB2 files of build 1.60.1.69913 (and 1.15.9.69722 for Classic halves), fetched through the wago.tools API and parsed by `scripts/scrape/client.mjs` | Exact effect values, durations, proc chances and internal cooldowns, stack counts, item→spell mapping, cooldown categories; the claims check that confirmed this doc's values | Forever [F] / Classic Era [C] |
| DB2 pages (browse) | https://wago.tools/db2/SpellEffect?build=1.60.1.69913 · https://wago.tools/db2/SpellItemEnchantment?build=1.60.1.69913 · https://wago.tools/db2/ItemEffect?build=1.60.1.69913 (and the same tables at `?build=1.15.9.69722`) | The same tables for a person to browse; never fetched by scripts. **Caution:** the 1.15 client also contains Season of Discovery rows, so only rows for spells that exist in Classic Era are used | Forever [F] / Classic Era [C] |
| fc-camping | https://foreverchanges.pro/professions/camping | Camp system, camp objects' level-60 buffs and exclusivity, the Permanence perk | Forever [F] |
| wh-roids | https://www.wowhead.com/classic/item=8410 | Classic tooltip: "(1 Hour Cooldown)" | Classic Era [C] |
| wh-sapper / wh-dyn / wh-thor / wh-zanza | https://www.wowhead.com/classic/item=10646 · https://www.wowhead.com/classic/item=18641 · https://www.wowhead.com/classic/item=15993 · https://www.wowhead.com/classic/item=20079 | Classic tooltips: Engineering use requirements; the Zanza exclusivity line | Classic Era [C] (wowhead /classic also hosts SoD; these items are unchanged there) |
| bt-1144 | https://www.bluetracker.gg/wow/topic/us-en/1656146-wow-classic-era-version-1144-patch-notes/ | "The 16 debuff limit and 32 buff limits have been removed on Hardcore realms" | Classic Era [C] |
| crc-ea | https://classicroguecraft.com/expose-armor-guide-aq40/ | Expose Armor and Sunder don't stack; Sunder ×5 + CoR + FF takes a boss to 336 armor | Classic 2019–2020 [C] |
| almar-tank | https://almarsguides.com/WoW/GettingStarted/EndGame/Classic/Consumables/Warrior/Tank/ | "Juju Power or Elixir of Giants", "Juju Might or Winterfall Firewater" groupings; the Elemental stone goes off-hand under Windfury | Classic [C] |
| bnet-cons | https://us.forums.blizzard.com/en/wow/t/warrior-dps-consumables-current-phase-4/2126143 | Player posts: "JuJu Power and Elixir of Giants override"; the stone goes off-hand because Windfury overrides the main hand; R.O.I.D.S. used alongside Juju Power | Classic Era (community) [C] |
| wiki-ppm | https://warcraft.wiki.gg/wiki/Procs_per_minute | Weapon enchant PPM values (unversioned "original WoW" section) | Unclear, so [?] (Icy Chill, Unholy) |
| ws-gear | https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/data/gear.js | Enchant PPMs at WarriorSim's pre-SoD commit `180a3cc` (2021): Crusader 1, Fiery 6, Lifestealing 6 | Classic Era [C] (pre-SoD) |
| magey-wf | https://github.com/magey/classic-warrior/wiki/Windfury-Totem | Windfury can't proc itself or twice in one chain (2019 text) | Classic Era [C] |
| turtle-salad | https://database.turtlecraft.gg/?item=83309 | The only "Herbal Salad" found | **Forbidden** (Turtle WoW private server); cited only to explain why it isn't adopted |

Related docs: [character-stats](character-stats.md) (stat pipeline, Kings ordering) ·
[damage-and-timing](damage-and-timing.md) (armor formula, procs, extra attacks) ·
[combat-tables](combat-tables.md) · [encounter](encounter.md) (boss armor, fight length,
zone) · [rage](rage.md) · [threat](threat.md) (Salvation, Threat gloves, threat
multipliers) · [forever-system-changes](forever-system-changes.md) ·
[warrior](../classes/warrior.md) · [druid](../classes/druid.md) ·
[paladin](../classes/paladin.md).

[fc-changes]: https://foreverchanges.pro/changes
[fc-sb-warrior]: https://foreverchanges.pro/spellbook/warrior
[fc-sb-paladin]: https://foreverchanges.pro/spellbook/paladin
[fc-sb-druid]: https://foreverchanges.pro/spellbook/druid
[fc-sb-shaman]: https://foreverchanges.pro/spellbook/shaman
[dev-70009]: https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-updated-september-24/2360696
[fc-sb-priest]: https://foreverchanges.pro/spellbook/priest
[fc-sb-mage]: https://foreverchanges.pro/spellbook/mage
[fc-sb-hunter]: https://foreverchanges.pro/spellbook/hunter
[fc-sb-warlock]: https://foreverchanges.pro/spellbook/warlock
[fc-sb-rogue]: https://foreverchanges.pro/spellbook/rogue
[fc-items]: https://foreverchanges.pro/items
[fc-ench]: https://foreverchanges.pro/professions/enchanting/recipes
[fc-racials]: https://foreverchanges.pro/racials
[fc-beta]: https://foreverchanges.pro/beta
[wh-sapper]: https://www.wowhead.com/classic/item=10646
[wh-dyn]: https://www.wowhead.com/classic/item=18641
[wh-thor]: https://www.wowhead.com/classic/item=15993
[wh-zanza]: https://www.wowhead.com/classic/item=20079
[wh-roids]: https://www.wowhead.com/classic/item=8410
[fc-camping]: https://foreverchanges.pro/professions/camping
[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[bt-1144]: https://www.bluetracker.gg/wow/topic/us-en/1656146-wow-classic-era-version-1144-patch-notes/
[crc-ea]: https://classicroguecraft.com/expose-armor-guide-aq40/
[almar-tank]: https://almarsguides.com/WoW/GettingStarted/EndGame/Classic/Consumables/Warrior/Tank/
[bnet-cons]: https://us.forums.blizzard.com/en/wow/t/warrior-dps-consumables-current-phase-4/2126143
[wiki-ppm]: https://warcraft.wiki.gg/wiki/Procs_per_minute
[ws-gear]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/data/gear.js
[magey-wf]: https://github.com/magey/classic-warrior/wiki/Windfury-Totem
[turtle-salad]: https://database.turtlecraft.gg/?item=83309
