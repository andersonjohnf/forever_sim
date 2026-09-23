# Buffs, debuffs, consumables and enchants

The cross-class catalogue the UI's buff, debuff, consumable and enchant toggles are built
from, with the default presets. It covers raid and party buffs from every class, target
debuffs, consumables, and permanent and temporary item enchantments that change a level-60
Warrior's, Feral Druid's or Paladin's DPS or TPS. **WoW Forever changed a lot here.** Most
long-duration buffs now last 1 hour. Battle Shout, Blessing of Might and Strength of Earth
got weaker, and the talents that improved them are gone. Mark of the Wild, Grace of Air,
Fortitude and Expose Armor got stronger. Trueshot Aura no longer gives melee attack power.
Windfury Totem became a party aura, and Sanctity Aura, Tranquil Air, Blessing of Sanctuary
and Faerie Fire (Feral) were removed. Food now gives flat attack power or crit, many glove
and bracer enchants were buffed, and alchemy gained new elixirs. A new camping system
gives weaker 1-hour copies of the class buffs. Both factions can field paladins and
shamans. Class-specific self-buffs (seals, stances, forms, Seal of the
Crusader's attack-power half) live in the class docs; this doc owns everything a *second*
player or an item provides.

Status: researched 2026-09-22 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified

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
enchanting-spell / SpellItemEnchantment IDs for enchants.

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
    speed (Juju Flurry, Minor Haste gloves, Arcanum of Rapidity), % hit (a Hyjal flask).
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
  1 h). See [Implementation notes](#on-use-items-and-cooldown-categories).
- **One temporary enchant per weapon** (stone, oil or poison). In Classic, Windfury Totem
  took the main-hand slot; in Forever it probably doesn't. See
  [Windfury Totem](#windfury-totem).
- **Presets** built on raid composition, not faction ([§6](#6-default-presets)).
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
| Moonkin Aura (Moonkin Form) | 24907 | **+3% crit (all)** to the party within 45 yd (C: +3% *spell* crit, 30 yd) | While in Moonkin Form | Exclusive with Leader of the Pack | Balance druid talent | [F] | [fc-changes] · [client] (SpellEffect, 1.60.1.69913) |
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
| Tranquil Air Totem | 25908 | **Not in Forever** (C: −20% threat, party) | — | — | Removed | [F] | [fc-sb-shaman] (missing list) |
| Devotion Aura (r7) | 10293 | +735 armor, party within 30 yd | Aura | One Aura per paladin on a player. **Improved Devotion Aura removed** (C: +25%) | Paladin | [F] | [fc-sb-paladin] · [fc-changes] |
| Retribution Aura (r5) | 10301 | **30** Holy damage to each melee attacker (C: 20) | Aura | One Aura per paladin; Improved Retribution Aura removed | Paladin | [F] | [fc-sb-paladin] |
| Sanctity Aura | talent (C: 20218) | **Removed** (C: +10% Holy damage, party) | — | — | — | [F] | [fc-changes] |
| Stoneskin Totem (r6) | 10408 | −30 **Physical** damage taken per hit (C: melee damage) | **5 min**, 30 yd (C: 2 min, 20 yd) | Earth totem, so it excludes Strength of Earth from the same shaman | Shaman | [F] | [fc-sb-shaman] |
| Thorns (r6) | 9910 | **22** Nature damage to each melee attacker (C: 18) | 10 min | — | Druid | [F] | [fc-sb-druid] |
| Blessing of Wisdom (r6) / Greater (r2) | 25290 / 25918 | **40** mana per 5 s (C: 33) | **1 h** (C: 5 / 15 min) | One Blessing per paladin | Paladin. Only paladins use it | [F] | [fc-sb-paladin] |
| Mana Spring Totem (r4) | 10497 | 10 mana per 2 s to the party | **5 min**, 30 yd (C: 1 min, 20 yd) | Water totem | Shaman. Only paladins use it | [F] | [fc-sb-shaman] |

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
  SpellAuraOptions, 1.60.1.69913)): 10612 is now a party area aura (dummy aura, 20% proc
  chance) that triggers 10610 directly, with a **100 ms internal cooldown**
  (`ProcCategoryRecovery` 100). 10610 grants +246 AP and 1 extra attack; its AP aura has 2
  charges and lasts 1 s. 10611, the spell that applied the weapon enchant, no longer exists.
- **Consequence [?]:** in Forever, a main-hand sharpening stone or weightstone should
  coexist with Windfury Totem. The sim should allow it, flagged as an assumption until the
  beta confirms. Twisting Windfury with Grace of Air probably no longer works, because the
  aura disappears with the totem. See [Open questions](#open-questions).
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
| Flask of Natural Aggression *(new)* | 274274 → 1293741 | +60 Sta; **+4% crit while in Mount Hyjal, Hyjal Summit or the Barrow Deeps** | 2 h | One flask | New Forever recipe (BoP formula, Alchemy 300) | [F] | [fc/274274](https://foreverchanges.pro/item/274274) |
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
| Nightfin Soup | 13931 | **+22 spell damage** (C: 8 mana per 5 s, 10 min) | 15 min | Changed. Holy damage food for paladins | [F] | [fc/13931](https://foreverchanges.pro/item/13931) |
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
| Greater Stoneshield Potion | 13455 → 17540 | +2000 armor for 2 min | 2 min, potion | Potion | Same | [F] | [fc-items] · [client] (SpellEffect, 1.60.1.69913) |
| Free Action Potion | 5634 → 6615 | Immunity to stun and movement impairment for 30 s | 2 min, potion | Potion | Same (no DPS effect) | [F] | [fc-items] |
| Major / Superior / Greater Frenzy Potion *(new)* | 250943 / 250942 / 250941 → 1251940 / 1251938 / 1251937 | Tooltip: **+40 / +28 / +20 Attack Power** for 30 s. Client aura: +40/28/20 flat **physical damage done** (aura 13, school mask 1). No cooldown in the tooltip or on the item effects, but the potion spells are in the **potion category** (4, 120 s) | 2 min, potion category | Potion | New, required level 55 / 45 / 35 | [F] tooltip, category · [?] AP vs flat damage | [fc/250943](https://foreverchanges.pro/item/250943) · [client] (SpellEffect, SpellCategories, 1.60.1.69913) |
| Demonic Rune / Dark Rune | 12662 / 20520 → 16666 / 27869 | +900–1500 mana; costs 600–1000 health | 2 min, **rune category** (1153, separate from potions) | Runes share a cooldown with each other | Same | [F] | [fc-items] · [client] (ItemEffect, 1.60.1.69913) |

### 3.6 Weapon enhancements (temporary)

One temporary enchant per weapon, 30 min. Sharpening stones fit bladed weapons and
weightstones fit blunt ones [C]. In Classic, Windfury Totem overwrote the main-hand slot;
in Forever it probably doesn't ([Windfury Totem](#windfury-totem)).

| Name | ID | Effect | Duration | Stacking | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Elemental Sharpening Stone | 18262 → enchant 2506 | +2% melee crit | 30 min | Temporary-enchant slot of that weapon | Blacksmithing (Same) | [F] | [fc-items] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Dense Sharpening Stone | 12404 → enchant 1643 | +8 weapon damage | 30 min | As above | Same | [F] | [fc-items] |
| Dense Weightstone | 12643 → enchant 1703 | +8 weapon damage (blunt) | 30 min | As above | Same | [F] | [fc-items] |
| Consecrated Sharpening Stone | 23122 → enchant 2684 | +100 AP vs Undead (tooltip unchanged; the Forever client's spell 28893 reads 99) | 30 min | As above | Argent Dawn (Same) | [F] | [fc-items] · [client] (SpellItemEnchantment, 1.60.1.69913) |
| Wizard Oil | 20750 → enchant 2627 | **+30 spell damage and healing** (C: +24 damage) | 30 min | As above | Enchanting | [F] | [fc/20750](https://foreverchanges.pro/item/20750) |
| Brilliant Wizard Oil | 20749 → enchant 2628 | +36 spell damage and healing, +1% spell crit | 30 min | As above | Enchanting (reworded) | [F] | [fc/20749](https://foreverchanges.pro/item/20749) |
| Brilliant Mana Oil | 20748 → enchant 2629 | **+15 mana per 5 s, +30 healing** (C: 12 / 25) | 30 min | As above | Enchanting | [F] | [fc/20748](https://foreverchanges.pro/item/20748) |

### 3.7 Engineering and explosives

All explosives share a **1-minute cooldown** (category 24 [F] [client] (ItemEffect, 1.60.1.69913)). The Sapper also has its own
5-minute cooldown [F: "(1 Min Cooldown)" / "(5 Min Cooldown)" in the tooltips].

| Name | ID | Effect | Cooldown | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Goblin Sapper Charge | 10646 → 13241 | 450–750 Fire damage to nearby enemies; 375–625 to self | 5 min own + 1 min shared | Requires Engineering 205 to use (Same tooltip) | [F] | [fc-items] · [wh-sapper] · [client] (ItemEffect, 1.60.1.69913) |
| Dense Dynamite | 18641 → 23063 | 340–460 Fire, 5 yd | 1 min shared | Requires Engineering 250 | [F] | [fc-items] · [wh-dyn] |
| Thorium Grenade | 15993 → 19769 | 300–500 Fire, 3 s stun, 3 yd | 1 min shared | Requires Engineering 260 | [F] | [fc-items] · [wh-thor] |
| EZ-Thro Thorium Grenade *(new)* | 260816 | 300–500 Fire, 3 s stun | 1 min shared | **Usable by anyone** ("Anyone can use grenades with EZ-Thro!") | [F] | [fc/260816](https://foreverchanges.pro/item/260816) |
| EZ-Thro Dark Bomb *(new)* | 260817 | 225–675 Fire, 4 s stun, 5 yd | 1 min shared | Usable by anyone | [F] | [fc/260817](https://foreverchanges.pro/item/260817) |
| SAF-T Clever Dynamite *(new)* | 260814 | 340–460 Fire, 5 yd | 1 min shared | No Engineering requirement in the tooltip | [F] | [fc/260814](https://foreverchanges.pro/item/260814) |

---

## 4. Target debuffs

### 4.1 Armor reduction

| Name | ID | Effect | Duration | Stacking / exclusivity | Availability | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sunder Armor (r5) | 11597 | −450 armor per stack, 5 stacks = **−2250** | 30 s | **Exclusive with Expose Armor** in Classic [C]; unverified in Forever [?] | Warrior | [F] value | [fc-sb-warrior] · [crc-ea] |
| Expose Armor (r5) | 11198 | **−450 per combo point, −2250 at 5 CP** (C: −340 / −1700) | 30 s | Exclusive with Sunder [C] / [?] | Rogue | [F] value | [fc-sb-rogue] |
| Improved Expose Armor | talent (C: 14168) | **No longer adds armor reduction.** Forever: −10 energy cost, refunds 2 CP when used at 5 CP (C: +50%, i.e. −2550 at 5 CP) | — | — | Rogue talent | [F] | [fc-changes] |
| Faerie Fire (r4) | 9907 | −505 armor; target can't stealth | 40 s | Stacks with Sunder / Expose Armor and CoR [C] | Druid. **Castable in Cat, Bear and Dire Bear Form** in Forever; free with a 6 s cooldown in form (see [druid](../classes/druid.md)) | [F] | [fc-sb-druid] |
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
| Judgement of the Crusader (r6) | 20303 | +**161** Holy damage taken (C: 140; Improved Seal of the Crusader's 15% is now baseline and the talent is removed). Whether each Holy hit gets the flat +161 or +161 × its coefficient is open; see [paladin](../classes/paladin.md) | **40 s** (C: 10 s); the judging paladin's melee hits refresh it | One Judgement per paladin; several paladins can keep different Judgements up. Debuff Judgements always hit ([paladin](../classes/paladin.md)) | Paladin | [F] value · [?] application | [fc-sb-paladin] · [client] (SpellEffect, 1.60.1.69913) |
| Judgement of Wisdom (r3) | 20355 | Attacks and spells against the target may restore 59 mana | **40 s** (C: 10 s) | One per paladin; always hits | Paladin (only paladins use it) | [F] | [fc-sb-paladin] |
| Judgement of Light (r4) | 20346 | Melee attacks against the target may heal the attacker for 61 | **40 s** (C: 10 s) | One per paladin; always hits | Paladin | [F] | [fc-sb-paladin] |
| Curse of the Elements (r4) | 1311680 | −75 resistance to **all magic schools**, **+10% magic damage taken, Holy included** (C: r3, 11722, Fire and Frost only) | 5 min | One curse per warlock | Warlock; new rank 4 at level 50. **Curse of Shadow removed** (merged in) | [F] | [fc-sb-warlock] · [client] (SpellEffect, 1.60.1.69913) |
| Hunter's Mark (r4) | 14325 | **+71 ranged AP** for all attackers (C: 110). **No melee component in Classic Era or Forever** | 2 min | — | Hunter. Improved Hunter's Mark removed (C: +15% ranged only) | [F] | [fc-sb-hunter] · [fc-changes] |
| Demoralizing Shout (r5) | 11556 | Enemy melee AP **−196** (C: −140). The tooltip value is used; a per-level term in the client data would give about −204 at 60 [?] ([OQ 19](#open-questions)) | **45 s** (C: 30 s) | Probably exclusive with Demoralizing Roar. Improved Demoralizing Shout removed | Warrior | [F] value · [?] stacking | [fc-sb-warrior] |
| Demoralizing Roar (r5) | 9898 | Enemy melee AP **−193** (C: −130). Tooltip value; the data's per-level term would give −204.2 at 60 [?] ([OQ 19](#open-questions)) | 30 s | As above | Druid (bear) | [F] value · [?] stacking | [fc-sb-druid] |
| Thunder Clap (r6) | 11581 | 103 damage; enemy attack speed **−20%** (C: −10%) | 30 s; **6 s cooldown** (C: 4 s); also usable in Defensive Stance | — | Warrior | [F] | [fc-sb-warrior] |
| Curse of Weakness (r6) | 11708 | Target's **physical** damage done −37 (C: −31, all damage) | 2 min | One curse per warlock. Improved Curse of Weakness removed | Warlock | [F] | [fc-sb-warlock] |
| Stormstrike | 17364 | Forever: **self only**, +20% to the shaman's own next Lightning Bolt, Chain Lightning or Earth Shock (C: target takes +20% from the next 2 Nature damage sources, 12 s) | 12 s | — | Shaman talent. No longer a raid debuff | [F] | [fc-changes] |
| Nightfall: Spell Vulnerability | item 19169 → 23605 | +15% spell damage taken (paladin Holy damage included) | 5 s | Proc rate is server-side [?] | Same | [F] effect | [fc-items] · [client] (SpellEffect, 1.60.1.69913) |
| Gift of Arthas (proc) | 11374 | +8 physical damage taken | 3 min | Applied to whoever strikes the drinker | See [§3.2](#32-elixirs) | [F] | [client] (SpellEffect, 1.60.1.69913) |

Improved Scorch, Winter's Chill and Improved Shadow Bolt don't affect melee. Shadow
Weaving is now a self-buff [F] [[fc-changes]].

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
| Weapon – Spell Power | 22749 / 2504 | +30 spell damage and healing | Permanent | Formula (Same). A paladin option | [F] | [fc-ench] |
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
external toggle is ignored.

### 6.2 Buffs and debuffs by preset

`DPS` = Arms, Fury, Cat, Ret · `Tank` = Prot warrior, Bear, Prot paladin · `Pal` = paladin
specs only (the effect does nothing for the others) · `all` = every spec.

| Entry | Self-buffs only | Pre-raid dungeon group | Standard raid | Max-consumables raid |
| --- | --- | --- | --- | --- |
| Battle Shout | — | all | all | all |
| Blessing of Might | — | DPS | all | all |
| Blessing of Kings | — | Tank | all | all |
| Blessing of Salvation | — | — | DPS | DPS |
| Blessing of Wisdom | — | — | Pal | Pal |
| Mark / Gift of the Wild | — | all | all | all |
| Power Word / Prayer of Fortitude | — | all | all | all |
| Divine Spirit / Prayer of Spirit, Arcane Brilliance | — | — | all | all |
| Leader of the Pack or Moonkin Aura | — | — | DPS | DPS |
| Windfury Totem | — | — | all | all |
| Strength of Earth Totem | — | — | all | all |
| Mana Spring Totem | — | — | Pal | Pal |
| Devotion Aura | — | — | Tank | Tank |
| Sunder Armor ×5 | — | DPS | all | all |
| Faerie Fire | — | — | all | all |
| Curse of Recklessness | — | — | all | all |
| Curse of the Elements | — | — | Pal | Pal |
| Judgement of Wisdom | — | — | Pal | Pal |
| Armor Shatter ×3 (Annihilator) | — | — | — | all |
| Demoralizing Shout / Thunder Clap | — | — | Tank (self-applied by warrior tanks; external for the others) | Tank |
| Trueshot Aura, Hunter's Mark | never (no melee effect in Forever) | — | — | — |
| Camp buffs ([§1.3](#13-camp-buffs-new-forever-system)) | — | off (option: fill in for a missing class) | off (option) | off (option) |
| World buffs | **never** | **never** | **never** | **never** |

Judgement of the Crusader is not a raid toggle: Ret and Prot paladins apply it themselves
(see [paladin](../classes/paladin.md)), and it does nothing for warriors or druids.

### 6.3 Consumables by spec and preset

Standard = what a typical guild raider brings. Max = everything that stacks, still no world
buffs. Forever's new elixirs (Grizzly, Ferocity, Cunning, Phalanx) default **off** until
their stacking group is verified; the UI offers them as options.

| Spec | Pre-raid dungeon group | Standard raid | Max-consumables raid (adds / replaces) |
| --- | --- | --- | --- |
| Arms / Fury | Smoked Desert Dumplings; Dense Sharpening Stone / Weightstone | Mongoose; Elixir of Greater Strength (Giants); Winterfall Firewater; Smoked Desert Dumplings; Dense stone on each weapon; Mighty Rage Potion | Juju Power (replaces Giants); Juju Might (replaces Firewater); R.O.I.D.S.; Juju Flurry (on use); Elemental Sharpening Stone (replaces Dense, bladed only); EZ-Thro Dark Bomb (or Sapper + Dense Dynamite if `engineer`) |
| Prot warrior | Smoked Desert Dumplings | Elixir of Greater Defense; Elixir of Fortitude (+200); Mongoose; Giants; Smoked Desert Dumplings; Dense stone; Mighty Rage Potion | Flask of the Titans; Juju Power; Juju Might; R.O.I.D.S.; Rumsey Rum Black Label; Elemental stone; Greater Stoneshield Potion (on use) |
| Feral cat | Flank au Poivre (+20 Agi) | Mongoose; Giants; Flank au Poivre | Juju Power; Juju Might; Ground Scorpok Assay; Mighty Rage Potion (for its +60 Str; the rage is wasted in cat) |
| Feral bear | Smoked Desert Dumplings | Elixir of Greater Defense; Elixir of Fortitude; Mongoose; Giants; Smoked Desert Dumplings; Mighty Rage Potion (druids can use it in Forever) | Flask of the Titans; Juju Power; Juju Might; R.O.I.D.S.; Rumsey Rum; Greater Stoneshield Potion |
| Retribution | Smoked Desert Dumplings; Dense stone | Mongoose; Giants; **Greater Arcane Elixir** (per-spec entry: Forever Ret's seals, judgements and Holy Strike scale with spell power, see [paladin](../classes/paladin.md#retribution-defaults)); Smoked Desert Dumplings; Dense stone; Major Mana Potion | Juju Power; Juju Might; R.O.I.D.S.; Elixir of Holy Power; Elemental stone; Demonic / Dark Rune; Flask of Supreme Power (whether it pays off depends on Ret's Holy-damage scaling, see [paladin](../classes/paladin.md)) |
| Prot paladin | Nightfin Soup | Elixir of Greater Defense; Elixir of Fortitude; Elixir of Holy Power; Nightfin Soup (+22 spell damage); Wizard Oil; Major Mana Potion | Flask of Supreme Power; Greater Arcane Elixir; Brilliant Wizard Oil (replaces Wizard Oil); Demonic / Dark Rune |

Druids in forms and weapon temporary enchants: whether stones or oils do anything in cat or
bear form is owned by [druid](../classes/druid.md). Hyjal flasks are added automatically
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

The Superior Strength and Superior Agility gloves (+15) are stronger than Greater (+10) but
come from harder-to-get formulas. Offer them as options; don't default to them.

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
  Improved Weapon Totems, Totemic Mastery and **Tranquil Air** removed.
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
- Demoralizing Shout −196 for 45 s, Demoralizing Roar −193, Thunder Clap −20% (6 s
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

Encode these as data (`exclusivityGroup` on each entry). When several entries in a group
are selected, keep only the one with the largest effect and warn in the UI.
`normalizeConfig` compares effects when both entries change the same things (Juju Power's
+30 Strength beats Elixir of Greater Strength's +25) and keeps the first on a tie. When they
change different things (Mightfish Steak's attack power against Smoked Desert Dumplings'
Strength), it keeps the one the spec's Max consumables preset picks, and otherwise the first.

| Group key | Members | Tag |
| --- | --- | --- |
| `blessing:<type>` | Blessing and Greater Blessing of the same type; one Blessing per paladin (model it as one toggle per type) | [F] |
| `party-crit-aura` | Leader of the Pack, Moonkin Aura, Camp Chair | [F] (Camp Chair vs LotP [?]) |
| `camp:<copied buff>` | Each camp object and the class buff it copies (Lodestone / Might, Sharpening Wheel / Strength of Earth, Fish Bowl / Kings, Enchanted Lute / Mark of the Wild, First Aid Kit / Fortitude, …) | [F] |
| `totem:air` (per shaman) | Windfury Totem, Grace of Air Totem | [F] |
| `totem:earth` (per shaman) | Strength of Earth Totem, Stoneskin Totem | [F] |
| `flask` | All flasks | [F] |
| `elixir:strength` | Elixir of Greater Strength (Giants), Juju Power; probably Brute Force, and maybe the new Str elixirs | [C] core, [?] rest |
| `elixir:agility` | Mongoose, Greater Agility; maybe the new Agi elixirs | [?] |
| `buff:ap-drink` | Juju Might, Winterfall Firewater, Distilled Firewater | [C] / [F] |
| `blasted-lands` | R.O.I.D.S., Ground Scorpok Assay, Lung Juice, Cerebral Cortex, Gizzard Gum (shared 1 h category cooldown) | [F] |
| `zanza` | Spirit / Swiftness / Sheen of Zanza | [F] tooltip |
| `food` | All Well Fed foods (Dirge's and Sunfruit [?]) | [?] |
| `health-elixir` | Lesser Fortitude, Fortitude, Greater Fortitude | [?] |
| `temp-enchant:mh`, `temp-enchant:oh` | Stones, oils, poisons (plus Windfury Totem on MH in Classic only) | [C] / [?] |
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
| Rune (1153) | Demonic Rune, Dark Rune | 120 s (independent of potions) |
| Explosive (24) | Sapper, Dense Dynamite, Thorium Grenade, EZ-Thro / SAF-T items | 60 s (the Sapper also has its own 300 s) |
| Own cooldown only | Juju Flurry, Juju Might, Juju Power, Winterfall Firewater | 60 s |

**Which the rotation uses** ([warrior §5.2](../classes/warrior.md#52-fury-dual-wield) rows 16
and 17): the Fury rotation drinks the Mighty Rage Potion once, from the start of the execute
phase, and uses Juju Flurry on cooldown from the pull, each only when it's selected here; both
are off the GCD. EZ-Thro Dark Bomb and Greater Stoneshield Potion aren't simulated, and a result
that selects them says so. The long buffs above (Juju Might, Juju Power, Firewater, elixirs,
food) are static: used before the pull and up all fight.
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
  Classic mode (if ever needed): +315 AP, and it replaces the main-hand temporary enchant.
- **Weapon enchant procs** use PPM (`chance = PPM × weaponSpeed / 60`, see
  [glossary](../glossary.md)). Crusader 1, Fiery 6 and Lifestealing 6 are [C] (the pre-SoD
  WarriorSim, [ws-gear]); Icy Chill 1.6 and Unholy 3 are [?] (an unversioned wiki only).
- **Holy-damage modifiers** (Judgement of the Crusader, Curse of the Elements, Elixir of
  Holy Power, Flask of Supreme Power, spell-damage food and oils) only matter to paladin
  specs. How "up to 161" applies to each Holy source belongs to
  [paladin](../classes/paladin.md).
- **Boss-side debuffs** (Demoralizing Shout / Roar, Thunder Clap, Curse of Weakness) reduce
  damage taken, which lowers tank rage from damage taken ([rage](rage.md)). They don't
  change DPS.
- **Hyjal flasks** are enabled only if the encounter zone is Mount Hyjal, Hyjal Summit or
  the Barrow Deeps.
- **Skipped (< 0.5% of DPS/TPS)**: Retribution Aura and Thorns damage, Blood Pact, Gift of
  Arthas, Battle Squawk, healer-proc armor buffs (Inspiration / Ancestral Fortitude), and
  debuff-slot pressure.

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
   Might: 232 × 1.25 + 185 × 1.20 = 290 + 222 = **512**. That is 240 AP less in Forever.
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
7. **Frenzy potions.** Tooltip: +X Attack Power. Client: +X flat physical damage done (aura
   13, school mask 1) [F] [client] (SpellEffect, 1.60.1.69913). ✅ Cooldown resolved from
   client data: their spells are in the potion category (4, 120 s), though the item effects
   carry none ([client] (SpellCategories, 1.60.1.69913)). *Check:* drink one and compare the
   character sheet AP and white-hit damage; confirm that a Mighty Rage Potion is blocked
   afterwards.
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
19. **Demoralizing Shout and Roar at level 60** [?]. The Forever tooltips say −196 (Shout r5)
    and −193 (Roar r5), and the sim uses them (tooltip beats derived, doctrine §2). The client
    data adds a per-level term (−1.4 per level, from 54 for the Shout and 52 for the Roar), and
    `MaxLevel` (64 / 62) doesn't cap it below 60 [F] [client] (SpellEffect, SpellLevels,
    1.60.1.69913), so it would give about −204.4 and −204.2 at 60 if the server applies it. ✅
    The client read is resolved; whether the server applies the term is still open. *Check,
    Route C:* read the debuff tooltip on a target at 60.

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
