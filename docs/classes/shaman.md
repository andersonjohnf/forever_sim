# Shaman: Enhancement

WoW Forever turns the Enhancement shaman into a two-hander that mixes melee and instant spells.
**Stormstrike** is an 8 s, 125-mana normalized strike whose +20% now goes only to the shaman's own
next Lightning Bolt, Chain Lightning or Earth Shock, so it's no longer a raid debuff. New talents
turn Intellect into attack power (**Mental Dexterity**) and spell damage (**Mental Quickness**),
let Earth Shock cost 45% less (**Shamanistic Focus**), give mana regeneration after a Stormstrike
(**Improved Stormstrike**), stack **Maelstrom Weapon** from melee hits until a Lightning Bolt is
instant and free, and add a 30% haste cooldown (**Rage of the Farseer**). Spell damage is roughly
halved (Lightning Bolt 190–211, Earth Shock 293–309), weapon imbues last an hour, totems 5 minutes,
and Windfury Weapon disables Windfury Totem's benefit for the shaman who wears it. Two-handed axes
and maces need no talent. Dwarves can be shamans, so both factions have them.

This doc is the engine contract for Enhancement (slice S1, landed in the 90/10 mode of
[D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)): every
ability, proc and talent it uses at level 60, with numbers and sources, the rotation and its
settings, the defaults, worked examples that run as unit tests, and the questions the beta has to
answer. Elemental comes later, on the caster core ([Elemental](#elemental-later)).

Status: researched 2026-09-24 · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 ·
ruleset tags: [F] Forever · [C] Classic Era · [?] unverified · engine: Enhancement with first-pass
defaults ([Enhancement priority](#enhancement-priority)); Elemental waits for K1 and K5

---

## What the sim needs

Each item links to its section.

1. **Stormstrike**: an 8 s normalized weapon strike on the special table that leaves a 12 s,
   one-charge +20% on the shaman's next Earth Shock or Lightning Bolt ([Stormstrike](#stormstrike)).
2. **Windfury Weapon**: 20% per landed main-hand hit, at most once every 1.5 s, 2 extra attacks
   with extra attack power; or **Rockbiter Weapon**'s flat attack power ([Weapon imbues](#weapon-imbues)).
3. **Maelstrom Weapon** stacks from landed melee hits, which cut Lightning Bolt's cast time and
   cost 20% each, and a rotation line that waits for 5 of them ([Maelstrom Weapon](#maelstrom-weapon)).
4. **Flurry**: 3 charges of +25% attack speed after a melee crit, used by white swings at most
   once per 500 ms ([Flurry](#flurry)).
5. **Shocks and Lightning Bolt** on the spell table (spell hit, spell crit ×1.5, the average partial
   resist), the shocks sharing one 6 s cooldown ([Shocks and Lightning Bolt](#shocks-and-lightning-bolt)).
6. **Spell damage** from all-schools gear plus 30% of Intellect ([Spell damage](#spell-damage)).
7. **Mana**: costs, the five-second rule, Improved Stormstrike's regeneration inside it, potions
   and runes ([Mana](#mana)).
8. **Totems** as the shaman's own raid buffs, and Windfury Totem left out while Windfury Weapon is on
   ([Totems](#totems)).
9. **Talents** as passives and cost, crit and cast-time changes ([Talents](#talents)).
10. **Rage of the Farseer, Blood Fury, Berserking, Earthstrike and Juju Flurry** off the GCD on
    cooldown ([Enhancement priority](#enhancement-priority)).

---

## WoW Forever deviations

Every value below was read from the raw Forever client files (build 1.60.1.69913) and the Classic
Era client (1.15.9.69722) through the wago.tools API ([client data](../data/client.md)), unless the
row says otherwise.

### Races

| Race | Faction | Shaman in Classic | Shaman in Forever | What matters to the sim |
| --- | --- | --- | --- | --- |
| Orc | Horde | yes | yes | Blood Fury: +10% attack power for 15 s, 2 min ([character-stats](../mechanics/character-stats.md#racials-that-matter-to-the-sim)); Axe Specialization (+1% crit with an axe) |
| Tauren | Horde | yes | yes | Endurance: +1% hit with attacks and spells |
| Troll | Horde | yes | yes | Berserking: +10% attack speed for 10 s, 3 min |
| Windshaper Skyborne | Horde | — (new race) | yes | Wind Blessed: +1% haste |
| Dwarf | Alliance | no | **yes (new)** | Mace Specialization: +1% crit with a mace |

[F] [client] (ChrRaces, CharBaseInfo, 1.60.1.69913; `src/data/races/races.json`). Blizzard's
2026-09-22 article ([Create the hero you want to be](https://news.blizzard.com/en-us/article/24304075/create-the-hero-you-want-to-be-in-world-of-warcraft-forever))
also lists Undead shamans, but this build's client has no Undead shaman row, so the sim doesn't
offer one [?] ([open question 6](#open-questions)).

### Changes that affect a DPS sim

| Area | Classic Era [C] | WoW Forever [F] | Source |
| --- | --- | --- | --- |
| Stormstrike (17364) cost, cooldown | 21% of base mana, 20 s | **125 mana, 8 s** | [client] (SpellPower, SpellCooldowns, 1.60.1.69913; [f17364]) |
| Stormstrike damage | weapon damage (effect 58), the weapon's own speed | **normalized** weapon damage (effect 121) | [client] (SpellEffect; [f17364]) |
| Stormstrike's aura | +20% to the next 2 Nature damage sources from anyone (aura 87) | **+20% to the caster's own next Lightning Bolt, Chain Lightning or Earth Shock** (aura 271, class mask 0x100003), 1 charge, 12 s | [client] (SpellEffect, SpellAuraOptions, SpellDuration; [f17364]) |
| Lightning Bolt r10 (15208) | 428–476, 0.857, 3.0 s, 265 mana | **190.18–211.42** (196 ± 10.8%, +1.2 a level from 56), **0.714**, **2.5 s**, **220 mana** | [client] (SpellEffect, SpellLevels, SpellCastTimes, SpellPower; [f15208]) |
| Earth Shock r7 (10414) | 517–545 | **293.06–308.94** (301 ± 5.27%), 0.386, 450 mana | [client] ([f10414]) |
| Frost Shock r4 (10473) | 492–520 | **278.68–294.52** (283 ± 5.6%, +1.8 a level from 58), 0.386, 430 mana | [client] ([f10473]) |
| Flame Shock r6 (29228) | 292 + 320 over 12 s | 166 (0.214) + 4 × 44 over 12 s (0.1 a tick), 410 mana; not in the Enhancement rotation | [client] ([f29228]) |
| Shock cooldown | category 19, 6 s | same, on the GCD | [client] (SpellCategories, SpellCooldowns) |
| Windfury Weapon r4 (16362) | enchant 1669 → 439431 (20%, proc mask 0x14, 1.5 s) and 16361 (+333 AP, 2 extra attacks) | the same rows; the tooltip adds "When applied to main hand, disables any benefit you personally receive from Windfury Totem." | [client] (SpellItemEnchantment, SpellAuraOptions, SpellEffect, 1.60.1.69913); Forever tooltip (`src/data/spells/shaman.json`) |
| Weapon imbue duration | 5 min | **60 min** | [client] (SpellItemEnchantment) |
| Totem duration | 2 min | **5 min** | [client] (SpellDuration); values owned by the [buffs doc](../mechanics/buffs-debuffs-consumables.md#11-attack-power-stats-and-crit) |
| Flurry | +30% for 3 swings after a crit | **+25%** (5% a rank), 3 charges, 15 s, at most one charge per 500 ms | [client] (CurvePoint, SpellAuraOptions `ProcCategoryRecovery` of 16257) |
| Thundering Strikes | +1% weapon crit a rank | **+1% crit with all spells and attacks** a rank (aura 290) | [client] (SpellEffect 16255) |
| Ancestral Knowledge | +1% maximum mana a rank | **+2% Intellect** a rank | [client] (SpellEffect 17485, CurvePoint) |
| Concussion | +1% to all shocks, Lightning Bolt, Chain Lightning | Lightning Bolt, Chain Lightning and **Earth Shock only** (mask 0x100003) | [client] (SpellEffect 16035) |
| Call of Thunder | 5 ranks, +6% crit | 1 rank, **+3%** crit to Lightning Bolt and Chain Lightning | [client] (SpellEffect 16120) |
| Tidal Focus (Restoration) | −1% healing cost a rank | also **+1% melee and spell hit a rank** (auras 54, 55) | [client] (SpellEffect 16179, CurvePoint) |
| New talents | — | Mental Dexterity, Shamanistic Focus, Mental Quickness, Improved Stormstrike, Maelstrom Weapon, Rage of the Farseer ([Talents](#talents)) | [client] (TraitDefinition, 1.60.1.69913) |
| Gone from the tree | Weapon Mastery, Two-Handed Axes and Maces, Shield Specialization, Enhancing Totems, Improved Weapon Totems, Elemental Mastery, Nature's Guidance, Totemic Mastery | removed; two-handed axes and maces are trained without a talent | [client] (TraitDefinition, 1.60.1.69913); the two-handers: [Warcraft Tavern, Forever](https://www.warcrafttavern.com/forever/guides/shaman/) [?] |
| Totem of Rage (relic 22395) | +30 Earth Shock damage (aura 112) | **+2% damage to all shocks** (27859, aura 108) | [client] (SpellEffect 27859) |
| Blackhand's Breadth (13965) | equip: +2% crit | equip **+1% crit** (1318954), and **on use** +5% crit against the target for 20 s, 5 min (1318944, aura 306) | [client] (ItemEffect, SpellEffect, SpellDuration, 1.60.1.69913); the on-use isn't simulated ([open question 11](#open-questions)) |

Windfury Weapon's rows 439431 and 16361 are the same in Classic Era 1.15.9 (439431 is an id in the
range Season of Discovery used, but it's Classic Era's enchant row too); the sim cites Forever's
own client for them. Wowhead's Forever tooltip shows 433 attack power, which is 16361's value at
level 68 (333 + 8 × 12.5), not at 60.

### Forever system rules that matter here (owned elsewhere)

- **One hit stat and one crit stat** for attacks and spells; spell hit against a level-63 boss
  misses 17% before hit ([combat-tables §9](../mechanics/combat-tables.md#9-spell-hit-and-crit-generic)).
- **Extra attacks** can't proc their own source again in the same chain
  ([damage-and-timing §5.4](../mechanics/damage-and-timing.md#54-extra-attacks-and-chaining)).
- **Mana** regenerates by the paladin's model ([paladin.md › Mana model](paladin.md#mana-model);
  [character-stats](../mechanics/character-stats.md#spirit-and-mana-regeneration)).

---

## Conventions used below

- **Rank at level 60.** A rank learned below 60 grows by its per-level points up to 60 or its max
  level, and a range is base × (1 ± variance / 2) [F] ([paladin.md](paladin.md#conventions-used-below)).
- **Damage class** is `SpellCategories.DefenseType`: the shocks and Lightning Bolt are magic
  (DefenseType 1: the spell table, crit ×1.5); Stormstrike is melee (2: the special-attack table,
  crit ×2) with neither No Active Defense nor Always Hit, so it can miss, be dodged or parried
  [F] [client] (SpellCategories, SpellMisc, 1.60.1.69913).
- **"SP"** below is the shaman's spell damage for Nature and Frost: all-schools spell damage plus
  Mental Quickness's share of Intellect ([Spell damage](#spell-damage)).
- **Costs** are whole mana: a cut rounds down (247.5 → 247) [?].
- **Cost cuts add** (Convection + Shamanistic Focus), as the paladin's Benediction and Holy Conduit
  do [?].

---

## Stormstrike

| Item | Value | Tag, source |
| --- | --- | --- |
| Cost, cooldown, GCD | 125 mana, 8 s, 1.5 s | [F] [client] (SpellPower, SpellCooldowns; [f17364]) |
| Damage | 100% normalized weapon damage (effect 121): weapon roll + AP / 14 × 3.3 for a two-hander | [F] [client] (SpellEffect) |
| Table | one roll on the special table (miss, dodge, parry, crit) | [F] (DefenseType 2, no attributes); [combat-tables §3](../mechanics/combat-tables.md#3-special-yellow-attacks) |
| Its aura | on a landed strike: the target takes 20% more from the shaman's next Lightning Bolt, Chain Lightning or Earth Shock (aura 271, mask 0x100003), 1 charge, 12 s. **Not Frost Shock.** The shaman's own, so not a raid debuff ([buffs §4.2](../mechanics/buffs-debuffs-consumables.md#42-other-debuffs)) | [F] [client] (SpellEffect, SpellAuraOptions, SpellDuration) |
| Used up by | the next Earth Shock or Lightning Bolt **that lands**; a missed spell keeps it | [?] ([open question 2](#open-questions)) |
| Threat | its damage | [C] |
| Mana on a miss | not refunded: mana has no refund rule | [?] ([open question 15](#open-questions)) |

Forever tooltip: "Instantly strike for normal weapon damage and increase the damage you deal to the
target with your next Lightning Bolt, Chain Lightning, or Earth Shock spell by 20% for 12 sec."
Improved Stormstrike adds its regeneration ([Mana](#mana)) and, on your dodge or parry, resets
Stormstrike's cooldown, which a boss's back never gives a DPS shaman (not simulated).

---

## Weapon imbues

The imbue is the main hand's temporary enchant, so a sharpening stone or oil has no weapon to go on:
the Buffs tab locks stones and oils off for a shaman ("Not used: your weapon imbue is your main
hand's temporary enchant"), and the plan leaves them out.

**Windfury Weapon r4** (16362 → enchant 1669 → 439431 and 16361) [F] [client] (SpellItemEnchantment,
SpellAuraOptions, SpellEffect, SpellLevels, 1.60.1.69913):

- Each landed hit with the imbued weapon, white or special (proc mask 0x14: auto attacks and melee
  abilities), has a **20%** chance to grant **2 extra attacks** (16361 #1: effect 19, 2).
- At most **once every 1.5 s** (439431's `ProcCategoryRecovery` 1500).
- The extra attacks get **+333 attack power** (16361 #0: aura 99, +12.5 a level from 60, so 333 at
  60), **+40% at Elemental Weapons 3/3: 466.2**.
- An extra attack can't proc it again: its chain and the 1.5 s cooldown both stop it
  ([damage-and-timing §5.4](../mechanics/damage-and-timing.md#54-extra-attacks-and-chaining)).
- The attack-power aura has 3 charges and lasts 1.5 s, so a third charge would reach the next white
  swing only if it came within 1.5 s. A two-hander's swing never does (3.6 s ÷ 1.25 Flurry ÷ 1.3
  Rage of the Farseer ≈ 2.2 s), so it isn't simulated [?] ([open question 3](#open-questions)).
- It disables Windfury Totem's benefit for you (its tooltip), so the plan leaves the totem's proc out
  and says so ([Totems](#totems)).
- It's cast before the pull (60 min), so its 165 mana is never spent in the fight.

**Rockbiter Weapon r7** (16316 → enchant 1664 → 16313): **+653 attack power** (aura 99: 554 +
16.5 a level from 54 to 62) while the imbued weapon is in hand, **+20% at Elemental Weapons 3/3:
783.6** [F] [client] (SpellItemEnchantment, SpellEffect, SpellLevels, 1.60.1.69913). The sim casts
it 3 s before the pull, an hour-long buff. Its worth in Forever is [?]
([open question 10](#open-questions)).

**Flametongue Weapon r6** (16342 → enchant 1666 → 436519 and 10444) isn't simulated: its per-hit
damage is set server-side from 16344's 2810 (the client's 10444 has base 1 and coefficient 0.1),
and it was the weakest imbue for a two-hander in Classic Era [C]
([Icy Veins spell summary](http://web.archive.org/web/20210419094508/https://www.icy-veins.com/wow-classic/enhancement-shaman-dps-pve-spell-summary)).

---

## Maelstrom Weapon

| Item | Value | Tag, source |
| --- | --- | --- |
| Stacks | up to 5, 30 s, refreshed by each new one | [F] [client] (SpellEffect, SpellAuraOptions, SpellDuration of 408498 and 408505) |
| Per stack | −4% Lightning Bolt cast time and mana a rank: **−20% at 5/5** | [F] [client] (TraitDefinitionEffectPoints, CurvePoint 408498) |
| At 5 stacks | Lightning Bolt is **instant and free** | [F] (5 × 20%); [Warcraft Tavern, Forever](https://www.warcrafttavern.com/forever/guides/shaman/): "Maelstrom Weapon stacks up to five times to let Enh Shamans cast an instant and free Lightning Bolt" |
| Stacks from | "When you deal damage with a melee attack, you have a chance": any landed melee hit, white, special or extra attack (proc mask 0x10014) | [F] tooltip and SpellAuraOptions |
| Chance a hit | **50%** in the sim: the talent's aura carries three dummy values, 20 (the stack's cut, which the rank curve sets), 50 and 5 (the stacks), and the sim reads the 50 as the chance. No source states the rate | [?] ([open question 1](#open-questions)) |
| Used by | the next Lightning Bolt, which spends all the stacks when it's cast; the cut is read then | [F] tooltip; the timing [?] |

A Lightning Bolt with fewer than 5 stacks still has a cast time: 2.5 s × (1 − 0.2 × stacks) and
220 × (1 − 0.2 × stacks) mana, rounded down ([worked example 2](#worked-examples)). A free bolt
spends no mana, so it starts no five-second rule.

---

## Flurry

Flurry 5/5 (16256 → 16257): a melee crit (proc mask 0x14) gives **3 charges of +25% attack speed**
for 15 s; white swings use the charges [F] [client] (SpellAuraOptions, SpellEffect, SpellDuration,
CurvePoint, 1.60.1.69913). Forever tooltip: "Increases your attack speed by 25% for your next 3
swings after dealing a melee critical strike."

**At most one charge per 500 ms** (16257's `ProcCategoryRecovery` 500) [F] [client], applied in the
sim this way [?] ([open question 4](#open-questions)):

- A white swing uses a charge before its own crit can refresh them, and that starts the 500 ms.
- Windfury Weapon's 2 extra attacks come at the same moment, inside those 500 ms, so they use none.
  Without the rule, one swing and its 2 extra attacks would use all 3 charges at once.
- A crit refreshes the aura to 3 charges; the 500 ms keeps running.

Measured on the default setup (20,000 fights, seed 1): the rule is worth **+1.17%** DPS
(95% CI +1.09% to +1.25%) against one charge per swing.

---

## Shocks and Lightning Bolt

| Spell | Range at 60 | SP coefficient | Mana (base → default build) | Cast, cooldown | Stormstrike boost | Tag |
| --- | --- | --- | --- | --- | --- | --- |
| Earth Shock r7 (10414), Nature | 293.06–308.94 | 0.386 | 450 → **247** | instant, 6 s shared | yes | [F] [client] ([f10414]) |
| Frost Shock r4 (10473), Frost | 278.68–294.52 | 0.386 | 430 → **236** | instant, 6 s shared | no | [F] [client] ([f10473]) |
| Lightning Bolt r10 (15208), Nature | 190.18–211.42 | 0.714 | 220 (Maelstrom Weapon cuts it) | 2.5 s cast | yes | [F] [client] ([f15208]) |

- **The spell table** [combat-tables §9](../mechanics/combat-tables.md#9-spell-hit-and-crit-generic):
  a miss roll at 17% − spell hit against a level-63 boss, then a crit roll at spell crit, ×1.5 (×2.0
  with Elemental Fury 5/5). Never dodged, parried, blocked or glancing.
- **Partial resists**: the average, 0.75 × 24 / (5 × 60) = **6%**, from the boss's level-based
  resistance [?] ([combat-tables §9](../mechanics/combat-tables.md#9-spell-hit-and-crit-generic)).
- **The shocks share category 19**: one 6 s cooldown for both, on the GCD [F] [client]
  (SpellCategories, SpellCooldowns).
- **Talents**: Concussion +5% to Earth Shock and Lightning Bolt (not Frost Shock); Shamanistic Focus
  −45% shock mana; Convection −2% a rank to both; Reverberation −0.2 s a rank on the shocks' cooldown;
  Call of Thunder +3% crit and Elemental Alacrity −0.5 s cast on Lightning Bolt ([Talents](#talents)).
- **Totem of Rage** (the default relic): +2% to either shock (27859) [F] [client] (SpellEffect).
- **Frost Shock's slow** does nothing to a boss's damage in this sim, and **Earth Shock's
  interrupt** nothing at all.
- **Lightning Bolt with a cast time** (fewer than 5 stacks) stops the white swings, which restart
  from full when it completes, as Slam without Improved Slam does
  ([damage-and-timing §3.3](../mechanics/damage-and-timing.md#33-swing-reset-rules)) [?]
  ([open question 5](#open-questions)). Its travel time (speed 20) isn't simulated.
- **Procs**: a spell crit fires Elemental Devastation ([Talents](#talents)); a spell triggers no
  melee procs (not Windfury Weapon, Flurry or Maelstrom Weapon).
- **Threat** is the damage; any extra threat on Earth Shock isn't simulated [?]
  ([open question 8](#open-questions)).

---

## Spell damage

"SP" for the shaman's spells is **all-schools spell damage plus Mental Quickness's 30% of
Intellect**, rounded down (Mental Quickness 2/2: aura 174, "Increases your spell damage and healing
by up to 30% of your Intellect") [F] [client] (SpellEffect 30812, CurvePoint).

- Holy-only spell damage does nothing for a shaman: the plan zeroes it.
- **Nature-only and Frost-only spell damage on gear isn't counted yet** [?]: the caster core (K1)
  brings spell damage per school. No item in the default gear has any
  ([open question 9](#open-questions)).
- Orc Blood Fury's +10% spell power isn't simulated [?] ([open question 13](#open-questions)).
- The sheet's "spell damage" shows this number (the default setup: 53, from 179 Intellect).

---

## Mana

The shaman uses the paladin's mana model ([paladin.md › Mana model](paladin.md#mana-model);
[character-stats](../mechanics/character-stats.md#spirit-and-mana-regeneration)) and the results'
mana ledger ("Mana per fight": the pool, regenerated, restored, spent).

| Item | Value | Tag, source |
| --- | --- | --- |
| Base mana (60) | **1520** | [F] [client] (PlayerExpectedStat.BaseMana, `basemp.txt`, 1.60.1.69913) |
| Pool | full at the pull; maximum from base mana and Intellect | [C] ([character-stats](../mechanics/character-stats.md#spirit-and-mana-regeneration)) |
| Ticks | every 2 s from a random phase: `15 + Spirit / 5` outside the five-second rule, and `mp5 × 2 / 5` always | [C]; the phase [?] |
| Five-second rule | any mana spent starts it; a free Lightning Bolt spends none, so starts none | [C] |
| Improved Stormstrike 2/2 | 15 s after each Stormstrike (used, landed or not), **50% of the spirit regeneration continues inside the rule** (1238931, aura 134). At 1/2 its chance is 50%, not simulated | [F] [client] (SpellEffect, SpellDuration, CurvePoint of 1223031); [F] tooltip |
| Costs, default build | Stormstrike 125, Earth Shock 247 (Frost Shock 236), Lightning Bolt 0 at 5 stacks | [F] × talents |
| Consumables | Major Mana Potion (1,350–2,250, 2 min) and Demonic or Dark Rune (900–1,500, their own 2 min); values owned by the [buffs doc](../mechanics/buffs-debuffs-consumables.md#35-potions-and-runes) | [C] |

Mindfulness (Restoration, 50% of regeneration while casting) isn't in the default build and isn't
simulated. With the default setup's Spirit 168 and mp5 65, a tick is 48.6 + 26 = 74.6 outside the
rule, 26 inside it, and 26 + 24.3 = 50.3 inside it after a Stormstrike
([worked example 9](#worked-examples)). Earth Shock is the mana sink: the rotation keeps a reserve
for Stormstrike by shocking only above 10% mana.

---

## Totems

A shaman drops its own totems: one earth, one air and one water. They're the Buffs tab's entries,
marked as the shaman's own (`selfCast`), as a paladin's Blessing of Might is, so they need no other
shaman in the raid and Self only brings them
([buffs §6.1](../mechanics/buffs-debuffs-consumables.md#61-composition-flags-not-factions)):

| Totem | Effect | Default |
| --- | --- | --- |
| Strength of Earth | +53 Strength | on |
| Grace of Air | +89 Agility | on (the air totem) |
| Mana Spring | 10 mana every 2 s | on |
| Windfury Totem | 20% on a main-hand hit, 1 extra attack with +246 AP | **off**: Windfury Weapon disables it for you |

Values, durations (5 min, [F]) and exclusivity (one air totem at a time) are the
[buffs doc](../mechanics/buffs-debuffs-consumables.md#11-attack-power-stats-and-crit)'s.

- **Windfury Totem and Windfury Weapon.** Windfury Weapon's Forever tooltip: "When applied to main
  hand, disables any benefit you personally receive from Windfury Totem" [F]. So no preset gives
  the Enhancement shaman Windfury Totem, and if you turn it on while Windfury Weapon is the imbue,
  the plan leaves the totem's proc out and the results say so. With Rockbiter Weapon it works.
- **No totem twisting.** In Classic Era, Enhancement shamans dropped Windfury Totem and then Grace of
  Air every 10 s, since the totem's weapon enchant outlasted it by 10 s [C]
  ([Wowhead rotation guide](http://web.archive.org/web/20210517045123/https://classic.wowhead.com/guides/enhancement-shaman-dps-rotation-abilities-classic-wow)).
  In Forever, Windfury Totem is a party aura that ends with the totem
  ([buffs doc › Windfury Totem](../mechanics/buffs-debuffs-consumables.md#windfury-totem)), and Windfury
  Weapon disables it for you anyway. The Rotation tab says so.
- **Recasts**: the totems are up all fight, dropped before the pull. A fight longer than their
  5 minutes would need a recast (a GCD and mana each), which isn't simulated [?]
  ([open question 12](#open-questions)).

---

## Talents

Values are each rank curve's (TraitDefinitionEffectPoints → CurvePoint), checked by
`src/sim/classes/shaman/data.test.ts` [F] [client] (1.60.1.69913). Build codes decode by tier, then
column ([data/talents.md](../data/talents.md#build-codes-verified)).

### Enhancement tree

| Talent (spell) | Ranks | Forever effect at max rank | Sim |
| --- | --- | --- | --- |
| Thundering Strikes (16255) | 5 | +5% crit with all spells and attacks (aura 290) | melee and spell crit |
| Ancestral Knowledge (17485) | 5 | +10% Intellect (2% a rank; aura 137) | Intellect × 1.10 |
| Mental Dexterity (415140), new | 3 | attack power equal to 33 / 67 / **100%** of Intellect (aura 598) | AP from Intellect |
| Elemental Weapons (16266) | 3 | Rockbiter +7 / 13 / **20%**, Windfury Weapon +13 / 27 / **40%**, Flametongue and Frostbrand +15% | the imbues' AP |
| Shamanistic Focus (1223030), new | 1 | −45% mana for the shocks and Lightning Shield (aura 108, mask 0x90100400) | shock costs |
| Flurry (16256) | 5 | +5% attack speed a rank, 3 charges, after a melee crit | [Flurry](#flurry) |
| Stormstrike (17364) | 1 | the ability | [Stormstrike](#stormstrike) |
| Mental Quickness (30812), new | 2 | spell damage equal to 15 / **30%** of Intellect (aura 174) | [Spell damage](#spell-damage) |
| Improved Stormstrike (1223031), new | 2 | 50 / **100%** chance after a Stormstrike: 50% of mana regeneration while casting for 15 s; Stormstrike's cooldown resets on your dodge or parry | 2/2 only; [Mana](#mana) |
| Maelstrom Weapon (408498), new | 5 | −4% a stack a rank to Lightning Bolt's cast time and cost, 5 stacks, 30 s | [Maelstrom Weapon](#maelstrom-weapon) |
| Rage of the Farseer (425336), new, tier 7 | 1 | +30% melee attack and casting speed for 25 s; 3 min cooldown; off the GCD; free | a cooldown |

Rage of the Farseer's casting speed does nothing to an instant Lightning Bolt and isn't simulated
for a cast one [?].

### Elemental and Restoration points

| Talent (spell) | Ranks | Forever effect | Sim |
| --- | --- | --- | --- |
| Convection (16039) | 5 | −2% a rank to the shocks', Lightning Bolt's, Chain Lightning's and Lava Burst's mana | added to Shamanistic Focus [?] |
| Concussion (16035) | 5 | +1% a rank to Lightning Bolt, Chain Lightning and Earth Shock (mask 0x100003) | spell damage |
| Reverberation (16040) | 5 | −0.2 s a rank on the shocks' cooldown | cooldown |
| Elemental Devastation (30160 → 30165) | 3 | a harmful spell's crit (mask 0x10000) gives +3% melee crit a rank for 10 s (aura 52, melee only) | a proc on spell crits |
| Elemental Fury (16089) | 5 | +20% a rank to Fire, Frost and Nature spells' crit bonus (×2.0 at 5/5) | spell crit multiplier |
| Call of Thunder (16120) | 1 | +3% crit to Lightning Bolt and Chain Lightning | spell crit |
| Elemental Alacrity (16578) | 3 | −170 / 330 / 500 ms on Lightning Bolt's cast | cast time |
| Tidal Focus (16179), Restoration | 5 | −1% healing mana a rank, and **+1% melee and spell hit a rank** (auras 54, 55) | hit |
| Totemic Focus (16173), Restoration | 5 | −25% totem mana | nothing (totems are dropped before the pull) |

### Not modelled

Talents that do nothing for a damage dealer against one boss: Earth's Grasp, Guardian Totems,
Improved Ghost Wolf, Improved Lightning Shield (Lightning Shield isn't cast), Anticipation,
Toughness, Spirit Weapons (parry and threat), Elemental Warding, Call of Flame, Improved Fire Nova,
Eye of the Storm, Elemental Reach, Earthbound, and the healing talents. Talents that would matter
but whose spells the sim doesn't cast yet: Elemental Focus, Lightning Overload and Lava Burst
(Elemental, [below](#elemental-later)); Mindfulness (regeneration while casting). Unleashed Rage
is a TBC talent in neither client's tree.

---

## Enhancement priority

### Damage sources, in expected order of size

On the default setup's golden run: white swings about 45%, Windfury Weapon's extra attacks 26%,
Stormstrike 16%, Earth Shock 10%, Lightning Bolt 3%.

### Classic Era approach (baseline)

All pre-August-2021 Wayback snapshots, [C]:

- [Wowhead's Classic rotation guide](http://web.archive.org/web/20210517045123/https://classic.wowhead.com/guides/enhancement-shaman-dps-rotation-abilities-classic-wow)
  (updated 2020-02-16): Stormstrike whenever possible; max-rank Frost Shock in raids, since
  "Stormstrike's debuff will generally not be present on the target"; twist Windfury Totem and
  Grace of Air every 10 s; no Lightning Bolt in the raid rotation.
- [Icy Veins' Classic rotation](http://web.archive.org/web/20210508050234/https://www.icy-veins.com/wow-classic/enhancement-shaman-dps-pve-rotation-cooldowns-abilities)
  (updated 2020-02-20): "Use Stormstrike as your main attack whenever it is up"; "Use Frost Shock on
  cooldown unless you are Totem Twisting"; Lightning Bolt only out of melee range
  ([spell summary](http://web.archive.org/web/20210419094508/https://www.icy-veins.com/wow-classic/enhancement-shaman-dps-pve-spell-summary)).
- [Warcraft Tavern's Classic guide](https://www.warcrafttavern.com/wow-classic/guides/pve-enhancement-shaman/)
  (Wayback 2021-04-16): "Totems > Stormstrike > Flame Shock (dot) > Frost / Earth Shock"; Windfury
  Totem in the air slot, Strength of Earth in the earth slot.
- [Wowhead's consumables guide](http://web.archive.org/web/20210515152931/https://classic.wowhead.com/guides/enhancement-shaman-dps-consumables-classic-wow):
  the Major Mana Potion is the "number one priority"; runes on their own cooldown.

### Adapted to Forever

- **Stormstrike first**, on its 8 s cooldown. Its aura is the shaman's own now, so there's no
  debuff slot to argue about.
- **Earth Shock over Frost Shock.** Stormstrike and Concussion boost Earth Shock and not Frost
  Shock: Frost Shock loses 1.61% ([First-pass defaults](#first-pass-defaults)).
- **Lightning Bolt only when instant**, at 5 Maelstrom Weapon stacks. Classic had no Maelstrom
  Weapon, and a cast pauses the swings.
- **No totem twisting** ([Totems](#totems)).
- **Rage of the Farseer, the racial, Earthstrike and Juju Flurry on cooldown** from the pull: they're
  off the GCD, and nothing in the list is worth saving them for.
- Flame Shock isn't in the list: its 12 s DoT needs the caster core's DoTs (K1), and it shares the
  shocks' cooldown.

### Forever priority list (default)

Evaluated top to bottom whenever the shaman is free. Setting ids are `shaman.enhancement.<x>`
(written without the prefix below), in the Rotation tab's groups. A mana threshold is a share of
maximum mana.

| # | Action | Condition (setting, default) | Default |
| --- | --- | --- | --- |
| 0 | Weapon imbue: Windfury Weapon (its procs), or Rockbiter Weapon cast 3 s before the pull | `imbue` (`windfury` or `rockbiter`) | Windfury |
| 1 | Blood Fury (Orc) or Berserking (Troll), off the GCD | `racial.enabled`; on cooldown from the pull | on |
| 2 | Rage of the Farseer, off the GCD | `rageOfTheFarseer.enabled`, with the talent; on cooldown | on |
| 3 | On-use trinkets (Earthstrike), off the GCD | `trinkets.enabled`; on cooldown | on |
| 4 | Juju Flurry, off the GCD | `jujuFlurry.enabled`, with Juju Flurry selected in Buffs (Max consumables); on cooldown | on |
| 5 | Stormstrike | `stormstrike.enabled`, with the talent; ready | on |
| 6 | Lightning Bolt | `lightningBolt.enabled`, with Maelstrom Weapon; at least `lightningBolt.minStacks` stacks (1–5) | on, 5 stacks |
| 7 | The shock: Earth Shock, Frost Shock or none | `shock.spell`; ready and mana ≥ `shock.minManaPct` (0–100%) | Earth Shock, 10% |
| — | Major Mana Potion, off the GCD | `manaPotion.enabled`, selected in Buffs (Standard raid); missing at least `manaPotion.missingMana` | on, 2,250 |
| — | Demonic Rune (a Dark Rune is the same), off the GCD | `rune.enabled`, selected in Buffs (Max consumables); missing at least `rune.missingMana`; its own cooldown | on, 1,500 |

The Rotation tab says: "The defaults are the common priority. There's no totem twisting: in
Forever, Windfury Totem is an aura that ends with the totem."

---

## Defaults

| Setting | Default | Why / source |
| --- | --- | --- |
| Talents | **`050003-055030031005102251-05005`** (Elemental 8 / Enhancement 33 / Restoration 10): Concussion 5, Elemental Devastation 3; Thundering Strikes 5, Ancestral Knowledge 5, Mental Dexterity 3, Elemental Weapons 3, Shamanistic Focus 1, Flurry 5, Stormstrike 1, Mental Quickness 2, Improved Stormstrike 2, Maelstrom Weapon 5, Rage of the Farseer 1; Totemic Focus 5, Tidal Focus 5 | Classic Era's raid build was 0/31/20 Stormstrike ([Wowhead talents](http://web.archive.org/web/20210516030639/https://classic.wowhead.com/guides/enhancement-shaman-dps-talents-builds-classic-wow), calc `-5025002105023051-0510530105`; Icy Veins the same) [C], adapted: every new Enhancement talent, and Restoration's hit from Tidal Focus, since Nature's Guidance is gone; the spare points buy Concussion and Elemental Devastation |
| Race | **Orc** (Horde) | Classic Era's best ([Wowhead overview](http://web.archive.org/web/20210516004127/https://classic.wowhead.com/guides/enhancement-shaman-dps-classic-wow), Icy Veins, Warcraft Tavern) [C]; Forever: "Orcs appear to be the best choice for Horde Shamans" ([Warcraft Tavern, Forever](https://www.warcrafttavern.com/forever/guides/shaman/)) [?] |
| Weapon | **The Unstoppable Force** (19323: two-handed mace, 3.6 s, Alterac Valley Exalted), with Crusader | [Races and weapons](#races-and-weapons) |
| Gear | Wowhead's Classic Enhancement pre-raid BiS (snapshot 2021-05-15, Phase 6), in `scripts/scrape/pre-raid-bis.json` `shaman-enhancement` ([D11](../decisions.md#d11-known-pre-raid-bis-items-are-always-in-the-pool-2026-09-22)): Crown of Tyranny, Amulet of the Darkmoon, Abyssal Mail Pauldrons, Deathguard's Cloak, Savage Gladiator Chain, Forest Stalker's Bracers, Chromatic Gauntlets, Cloudrunner Girdle, Outrider's Chain Leggings, Bloodmail Boots, Don Julio's Band, Band of Earthen Might, Earthstrike, Blackhand's Breadth, Totem of Rage | [pre-raid BiS](http://web.archive.org/web/20210515151721/https://classic.wowhead.com/guides/wow-classic-enhancement-shaman-pre-raid-best-in-slot-gear) [C] |
| Enchants | Retribution's column of [buffs §6.4](../mechanics/buffs-debuffs-consumables.md#64-enchant-defaults-by-spec) (Strength and Agility, Crusader on the weapon) | buffs doc |
| Imbue | Windfury Weapon | [First-pass defaults](#first-pass-defaults): Rockbiter loses 6.60% |
| Totems | Strength of Earth, Grace of Air, Mana Spring (your own) | [Totems](#totems) |
| Buffs | the Standard raid preset ([buffs §6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset)): no Windfury Totem; Prayer of Spirit, Arcane Brilliance and Blessing of Wisdom for your mana. **No world buffs** ([D8](../decisions.md#d8-world-buffs-are-excluded-2026-09-22)) | buffs doc |
| Consumables | Standard raid: Elixir of the Mongoose, Elixir of Greater Strength, Smoked Desert Dumplings, Major Mana Potion. Max adds Juju Power, Juju Might, R.O.I.D.S., Juju Flurry, Greater Arcane Elixir, Flask of Supreme Power and Demonic Rune. **No weapon stone**: the imbue takes the temporary enchant | [buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset) |
| Rotation | [the priority list](#forever-priority-list-default) with its first-pass defaults | [First-pass defaults](#first-pass-defaults) |

### Races and weapons

- **Armor and weapons**: mail at 40 and shields [C]; one-handed axes, maces, daggers and fist
  weapons; two-handed axes, maces and staves. **Forever trains two-handed axes and maces without
  Classic's talent**: the talent and its spell are gone from the client [F], and "can use two-handed
  weapons without a need for talents" ([Warcraft Tavern, Forever](https://www.warcrafttavern.com/forever/guides/shaman/)) [?].
  No dual wield at 60.
- **Two-hander**: Classic Era's norm ("Normally an Enhancement Shaman will use a 2H Mace with high
  DPS", [Wowhead weapons guide](http://web.archive.org/web/20210516003347/https://classic.wowhead.com/guides/wow-classic-best-shaman-weapons))
  [C], and no Forever source recommends a shield. A slow two-hander gets more from Windfury
  Weapon's attack power per swing and from normalized Stormstrike.
- The Unstoppable Force is rank 1 on Wowhead's Classic pre-raid list; an Orc gets no Axe
  Specialization with it (a mace), a Dwarf gets Mace Specialization's +1% crit.

---

## First-pass defaults

The defaults are the Classic Era priority adapted to Forever, with one quick search of the biggest
settings, as [D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)
asks: 20,000 fights on seed 1, the default setup (Orc, 180 s ± 10%, 20% execute, armor 3,731),
paired against the defaults with `scripts/tune/rotation.mjs --spec shaman-enhancement`. The Rotation
tab calls them "the common priority" until the tuning milestone (M10) tunes them under
[D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23).

Baseline **555.53 ± 0.62 DPS** (95% CI). Each row is the change from it:

| Candidate | Δ DPS | Δ % |
| --- | --- | --- |
| Rockbiter Weapon | −36.64 | −6.60% |
| Frost Shock | −8.97 | −1.61% |
| No shock | −60.42 | −10.88% |
| Lightning Bolt at 4 stacks | −17.99 | −3.24% |
| Lightning Bolt at 3 stacks | −41.17 | −7.41% |
| No Lightning Bolt | −14.43 | −2.60% |
| Shock from 0% mana | +0.09 | +0.02% |
| Shock from 20% / 30% / 40% / 50% / 60% | −0.99 / −3.07 / −5.79 / −8.89 / −25.62 | −0.18% / −0.55% / −1.04% / −1.60% / −4.61% |
| Potion when missing 750–2,000 (vs 2,250) | −0.04 to +0.33 | all within ±0.06%, none clears |

- **Shock from 10% mana.** 0% gains 0.02%; 10% keeps a reserve for Stormstrike, and the difference
  is within D27's first pass.
- **Potion at 2,250 missing**, its most, so none of it is lost.
- Maelstrom Weapon's rate matters more than any setting: 25% a hit would be −1.31%, 100% +2.35%
  ([open question 1](#open-questions)).

These numbers are the engine's after Flurry's 500 ms rule reached the plan (2026-09-24); the first
search, before it did, picked the same defaults (then 549.11 DPS).

---

## Base stats

The Forever client ships no class base attributes, base attack power, base crit or base health
([character-stats](../mechanics/character-stats.md#what-the-forever-client-ships-and-does-not)).
Until a tier 1–3 source has them, these are
[D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23) placeholders, shown on
the sheet and in the results' assumptions:

| Value | Placeholder | Tag, origin |
| --- | --- | --- |
| Attributes (Str / Agi / Sta / Int / Spi) | Orc 88 / 52 / 97 / 87 / 103; Tauren 90 / 50 / 97 / 85 / 102; Troll 86 / 57 / 96 / 86 / 101; Dwarf 87 / 51 / 98 / 89 / 99 (the class row plus the [C] Dwarf offset: Classic Era had no Dwarf shaman); Windshaper Skyborne 85 / 55 / 95 / 90 / 100 (the class row: Skyborne offsets are unknown) | [?] placeholder (D24); origin: [mangos player_levelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql) (class row 85 / 55 / 95 / 90 / 100 plus the race offsets; wowsims/classic's `base_stats.go` has the same rows), not evidence |
| Base health | 1,280 | [?] placeholder (D24); origin: [mangos player_classlevelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql), not evidence |
| Base attack power | 100 (60 × 2 − 20) | [?] placeholder (D24); origin: [wowsims/classic base_stats.go](https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go), not evidence |
| Base melee crit | 1.7% | [?] placeholder (D24); origin: [RatingBuster d11164cf](https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua) and wowsims/classic, which agree, not evidence |
| Base spell crit | **2.3%** | [?] placeholder (D24); origin: wowsims/classic; RatingBuster's table reads **−0.7%**: the sources conflict ([open question 7](#open-questions)) |
| Base dodge | 1.7% | [?] placeholder (D24); origin: RatingBuster and wowsims/classic; matters only to a tank |

From the client [F] [client] (PlayerExpectedStat, `basemp.txt`, ChrClasses, 1.60.1.69913): base mana
**1,520**; crit per Agility 0.000508 (**19.69 Agility per 1%**); spell crit per Intellect 0.000169
(**59.17 Intellect per 1%**); 2 attack power per Strength and none per Agility; mail and shields.
A shaman parries only with Spirit Weapons, a talent the default build doesn't take.

---

## Implementation notes

- **Imbue procs fire on the main hand only**, from landed white swings, Windfury Weapon's own extra
  attacks excepted, and from Stormstrike (proc mask 0x14).
- **Order inside one hit**: resolve the swing; Windfury Weapon, Maelstrom Weapon and (on a crit)
  Flurry roll in the plan's order; the extra attacks swing at the same moment after it.
- **Spells trigger no melee procs**; a spell crit fires Elemental Devastation.
- Skipped (under 0.5% at the default): Windfury Weapon's third attack-power charge, Earth Shock's
  extra threat, Lightning Bolt's travel time, Blood Fury's spell power, totem recasts in fights
  under 5 minutes, Flametongue Weapon, Frost Shock's slow.

### How the engine does it

The class is data and rotation in `src/sim/classes/shaman/` (`abilities.ts`, `talents.ts`,
`setup.ts`, `enhancement.ts`) on the engine's generic pieces, which any class can use
([architecture](../architecture.md#the-event-loop)):

- **Stormstrike** is a `weaponStrike` row (normalized, 100%) whose landed strike puts its aura on the
  target. Earth Shock's and Lightning Bolt's `SpellDef.boost` names that aura: while it's up they
  deal 20% more, and a landed one removes it.
- **Windfury Weapon** is a `meleeLanded` proc on the main hand, 20%, a 1,500 ms internal cooldown and
  its own chain bit, granting 2 extra attacks with 466.2 bonus attack power. With it, the plan drops
  Windfury Totem's proc and adds the `windfuryWeaponTotem` note. **Rockbiter Weapon** is a free cast at
  −3 s with an hour-long +783.6 AP aura.
- **Maelstrom Weapon** is a `meleeLanded` proc (any hand, 50%) adding a stack to a 5-stack, 30 s
  aura. Lightning Bolt's row names that aura (`stackAura`) with a 20% cut a stack to its cast time
  and cost; using it reads the stacks, removes the aura, and pays the cut cost (rounded down to whole
  mana) when the cast completes, or at once if the cut makes it instant. Its line waits on condition
  34, `auraStacksAtLeast` (the aura, 5).
- **Flurry** is an aura with 3 white-swing charges and `whiteSwingChargeIcdMs` 500: a white swing
  uses a charge only when 500 ms have passed since the last one it used.
- **Improved Stormstrike** is a second aura Stormstrike puts on the player when used (`selfAura`),
  and the mana plan names it (`inFsrShareAura`): while it's up, 50% of the spirit regeneration
  continues inside the five-second rule.
- **Mental Dexterity** is attack power per point of Intellect (`apPerInt`); **Mental Quickness** the
  paladin's spell damage from Intellect (`spellDamagePerIntPct`).
- **Elemental Devastation** is a `spellCrit` proc; the shocks are `spell` rows in one cooldown
  category (`shock`).
- **Mana** is the paladin's model and ledger; the shaman has no rage pool, and its hits give none.
- **Totems** are Buffs-tab entries with `selfCast`; Windfury Totem's presets are every spec but the
  Enhancement shaman's (`{ not: [...] }`), and stones and oils are unused for a shaman
  (`buffUnusedReason`).

---

## Worked examples

Assumptions unless stated: level 60 vs a level-63 boss with no armor; hits and spells land and
never crit; no buffs; a two-hander of **3.6 speed, 200–300 damage (average 250)**; **AP 1200**;
**SP 100**; the boss's average partial resist, **6%** (×0.94). Numbers use the defaults marked [?]
above, so a test failing after a beta measurement means a default changed, not a bug. Every example
runs through the engine in `src/sim/classes/shaman/shaman.test.ts`.

1. **Earth Shock** (Concussion 5/5, Shamanistic Focus): cost 450 × (1 − 0.45) = 247.5 → **247**
   (with Convection 5/5 too: 450 × 0.45 = 202.5 → **202**; Frost Shock 430 → **236**). Damage
   (293.06–308.94 + 0.386 × 100) × 1.05 × 0.94 = **327.35–343.02, 335.19** on average; a crit
   ×1.5 = 502.78. Frost Shock: (278.68–294.52 + 38.6) × 0.94 = **305.69** on average (Concussion
   doesn't touch it). With Totem of Rage, either shock ×1.02 (Earth Shock 341.89).
2. **Lightning Bolt and Maelstrom Weapon** (Concussion 5/5, Maelstrom Weapon 5/5): damage
   (190.18–211.42 + 0.714 × 100) × 1.05 × 0.94 = **268.66** on average. Cast time and cost by stacks:
   5 → **instant, free**; 4 → 0.5 s, 44 mana; 3 → 1.0 s, 88; 2 → 1.5 s, 132; 1 → 2.0 s, 176
   (2,500 ms and 220 mana × (1 − 0.2 × stacks), rounded down). With one stack a landed swing and
   Lightning Bolt at 5, it goes on every 5th swing and the stacks start again from 0. A cast one
   stops the swings; the next swing comes a full 3.6 s after the cast ends.
3. **Stormstrike**: 250 + 1200 × 3.3 / 14 = **532.86** on average (**482.86–582.86**), whatever the
   weapon's speed; 125 mana at 0, 8, 16 s…; its crits are the crit slice of all strikes (one roll).
4. **Stormstrike's boost**: Stormstrike at 0 s, Earth Shock at 1.5 s: **335.19 × 1.2 = 402.22**,
   and the aura is gone; the next Earth Shock at 7.5 s deals 335.19. A Lightning Bolt the same:
   268.66 × 1.2 = **322.39**. A missed spell keeps the aura; Frost Shock neither gets it nor uses it
   up; a Stormstrike that misses puts nothing up.
5. **Windfury Weapon** (Elemental Weapons 3/3): extra attack power 333 × 1.4 = **466.2**; each of the
   2 extra attacks is a white swing: 250 + (1200 + 466.2) / 14 × 3.6 = **678.45**. It procs from
   20% of the landed main-hand hits (white swings and Stormstrikes) that come 1.5 s or more after
   its last proc, and never from its own extra attacks.
6. **Rockbiter Weapon** (Elemental Weapons 3/3): 653 × 1.2 = **783.6** attack power from 3 s before the
   pull; the sheet rounds 1,983.6 down to **1,983**, so a white hit deals 250 + 1983 / 14 × 3.6 =
   **759.91**.
7. **Flurry's charges** (5/5, up with 3 charges at the pull, no crits, Windfury Weapon on every hit):
   the swing at 0 uses a charge and its 2 extra attacks use none (inside 500 ms); the swings at
   **2.88 s and 5.76 s** use the other two (3.6 / 1.25); the next comes at **9.36 s** (+3.6 s).
   Without the 500 ms rule the swing and its extra attacks would use all 3 at 0, and the swings
   would come at 0, 3.6, 7.2 s.
8. **Elemental Devastation** (3/3): a spell crit gives **+9% melee crit for 10 s**; an Earth Shock that
   crits every 6 s keeps it up, and your white crits rise by 9 points.
9. **Mana ticks** (the default setup: 3,925 mana, Spirit 168, mp5 65): **48.6** spirit regeneration
   (15 + 168 / 5) and **26** mp5 (65 × 2 / 5) a tick, so **74.6** outside the five-second rule, **26**
   inside it, and **50.3** inside it within 15 s of a Stormstrike with Improved Stormstrike 2/2. A
   free Lightning Bolt (5 stacks) starts no five-second rule; one with 4 stacks (44 mana) does.
10. **Intellect**: the default setup's **179** Intellect (Ancestral Knowledge's +10% and Blessing of
    Kings' +10% included) gives **+179 attack power** (Mental Dexterity 3/3) and **+53 spell damage**
    (30% = 53.7, rounded down; Mental Quickness 2/2).
11. **The shocks on the spell table**: 17% − spell hit misses against a level-63 boss (the default
    setup's 8% spell hit: **9%**); never dodged, parried or blocked, even from the front. Frost Shock
    and Earth Shock share one 6 s cooldown: with Frost Shock first in the list, Earth Shock never
    goes.
12. **Mana thresholds** (the default setup's 3,925 mana): "Shock from 10%" needs **392.5** mana; the
    potion "when missing 2,250" goes at **1,675** or less; Frost Shock from 50%, **1,962.5**.

---

## Elemental (later)

Elemental lands with the caster core ([K1 and K5](../milestones.md)) and needs, beyond what S1 built:

- **Casts and channels** as the rotation's main actions, with haste on cast time (Rage of the
  Farseer's casting speed) and pushback ignored.
- **Spell power per school** (Nature, Frost, Fire), so Nature-only and Frost-only gear counts.
- **Flame Shock's DoT**: 166 direct (0.214) + 4 × 44 over 12 s (0.1 a tick), its periodic-crit
  flag, and Lava Burst's +20% while it's up.
- **Lightning Overload** (3 ranks, 10%): a second bolt at half damage and no threat.
- **Lava Burst** (the tier-7 talent): 106–134 Fire.
- **Elemental Focus**'s Clearcasting (10% after a damage spell: the next one free).
- Chain Lightning r4 (119–133 at 60, 0.571, 3 targets) for multi-target.
- **Elemental Mastery is gone** from the Forever tree; Call of Thunder is one rank (+3%);
  Elemental Fury +100% crit bonus at 5/5; Elemental Alacrity −0.5 s.

---

## Open questions

Each needs an in-game test on the Forever beta; record the result here with build, date, method and
sample size ([doctrine §2](../doctrine.md#2-where-numbers-come-from-non-negotiable)). Effects are on
the default setup's DPS unless stated.

1. **Maelstrom Weapon's chance a hit.** The sim reads the talent's dummy 50 as 50% per landed melee
   hit (white, special and extra attacks). *Test:* count Maelstrom Weapon stacks gained against landed
   melee hits over 500+ hits (the combat log's buff applications), with and without Windfury Weapon.
   *Effect:* 25% → −1.31%, 100% → +2.35%.
2. **Is Stormstrike's boost used up by a missed spell?** The sim keeps it. *Test:* Stormstrike, then
   Earth Shocks on a +3 mob until one misses, then one that lands; compare its damage. *Effect:* the
   boost is worth 1.31% in all, and about 9% of the spells miss: about −0.12%.
3. **Windfury Weapon's third attack-power charge.** 16361's aura has 3 charges for 1.5 s; the sim
   gives the bonus to the 2 extra attacks only. *Test:* a fast one-hander's white swing within 1.5 s
   of a proc. *Effect:* none with a two-hander (its swings are 2.2 s or more apart).
4. **Flurry's 500 ms charge rule**, and whether a crit's refresh restarts it. The sim uses a charge
   at most once per 500 ms and doesn't restart the window on a refresh. *Test:* the combat log's
   Flurry charges around a Windfury Weapon proc. *Effect:* the rule is worth +1.17% against one
   charge a swing; the refresh detail much less.
5. **Does a cast Lightning Bolt pause the swings?** The sim stops both timers and restarts them from
   full, as Slam does. *Test:* a 2.5 s Lightning Bolt mid-swing; time the next white hit. *Effect:*
   none at the default (5 stacks, instant); it's most of why 3 and 4 stacks lose 3–7%. Two details
   go with it: the sim reads the Maelstrom Weapon stacks and spends them when the cast starts, and
   Rage of the Farseer's +30% casting speed doesn't shorten a cast bolt.
6. **Undead shamans.** Blizzard's 2026-09-22 article lists them; the 1.60.1.69913 client has no row.
   *Test:* the character creation screen on a later build. *Effect:* none on the default (Orc); the
   race would need its placeholder row.
7. **Base stats** ([Base stats](#base-stats)): the attributes, health, attack power and crits are D24
   placeholders. The base spell crit sources conflict: 2.3% (wowsims/classic) or −0.7% (RatingBuster).
   *Test:* a naked level-60 shaman's character sheet per race (the sheet shows spell crit). *Effect:*
   −0.7% instead of 2.3% is −0.49%; the attributes under ±0.5%.
8. **Earth Shock's extra threat**: whether it still carries the extra threat Classic Era shaman
   tanks relied on is unknown, and none is simulated. *Test:* a threat meter on a single Earth Shock. *Effect:* none on DPS; TPS only.
9. **Nature-only and Frost-only spell damage on gear** isn't counted until K1. *Effect:* none on the
   default gear, which has none; an item's line would be worth what all-schools spell damage is (50
   SP ≈ +1.0%).
10. **Rockbiter Weapon's value** in Forever: 653 AP from 16313's rows (554 + 16.5 a level). *Test:*
    the character sheet's attack power with and without it. *Effect:* only when chosen (it's 6.6%
    behind Windfury Weapon).
11. **Blackhand's Breadth's on-use** (+5% crit against the target for 20 s, 5 min) isn't simulated.
    *Effect:* one use a 3-minute fight, about +0.4%.
12. **Totem recasts** in fights over 5 minutes aren't simulated (a GCD and mana a totem).
    *Effect:* none at the default 180 s.
13. **Blood Fury's +10% spell power** isn't simulated. *Effect:* +5 spell damage for 15 s every
    2 minutes: under 0.05%.
14. **Cost rounding and additive cost cuts**: 247.5 → 247, and Convection added to Shamanistic Focus.
    *Test:* Earth Shock's cost on the tooltip with each talent. *Effect:* under 0.1%.
15. **No mana refund on an avoided Stormstrike.** *Test:* the mana bar on a dodged Stormstrike.
    *Effect:* under 0.1% (a few dodges a fight from behind).
16. **Improved Stormstrike's regeneration** starts on every Stormstrike, landed or not, and lets 50%
    of the spirit regeneration continue (not of mp5, which always ticks). *Test:* mana ticks while
    casting within 15 s of a Stormstrike. *Effect:* small; the mana it gives is spent on Earth Shock.
    The ticks' random phase is the paladin's engine choice ([paladin.md › Mana model](paladin.md#mana-model)).
17. **The level-based partial resist** (24, 6% on average) is combat-tables' [?]. *Effect:* ±6% on
    the spells (13% of damage): about ±0.8%.
18. **The rotation's reaction time**: it acts the moment a stack or cooldown arrives. *Effect:*
    small; owned by [damage-and-timing §3.6](../mechanics/damage-and-timing.md#36-server-tick-and-spell-batching).
19. **Warcraft Tavern's Forever guide** is a community guide, so its claims are [?]: Orc as the best
    Horde race, and two-handed axes and maces without a talent. *Test:* a new shaman's trainer (the
    weapon skills offered); the racials' value is the sim's own comparison of races. *Effect:* none
    on the numbers; they only pick defaults.

---

## Sources

| Source | What it covers | Ruleset |
| --- | --- | --- |
| Client DB2 tables and game tables, Forever 1.60.1.69913 and Classic Era 1.15.9.69722, via the wago.tools API, parsed into `src/data/client/*.json`, `src/data/spells/shaman.json`, `src/data/talents/shaman.json` ([client.md](../data/client.md)) | every [F] number: costs, cooldowns, ranges, coefficients, proc masks and cooldowns, charges, auras, talent curves, base mana, crit per stat, races | Forever [F] / Classic Era [C] |
| [Blizzard: Create the hero you want to be (2026-09-22)](https://news.blizzard.com/en-us/article/24304075/create-the-hero-you-want-to-be-in-world-of-warcraft-forever) | race and class combinations, Undead shamans | Forever (announcement) |
| [Warcraft Tavern: Forever Shaman guide](https://www.warcrafttavern.com/forever/guides/shaman/) | Stormstrike's 8 s, Maelstrom Weapon's instant free bolt, two-handers without talents, Orc for Horde | Forever (community guide) [?] |
| [Wowhead Classic: Enhancement rotation](http://web.archive.org/web/20210517045123/https://classic.wowhead.com/guides/enhancement-shaman-dps-rotation-abilities-classic-wow), [talents](http://web.archive.org/web/20210516030639/https://classic.wowhead.com/guides/enhancement-shaman-dps-talents-builds-classic-wow), [weapons](http://web.archive.org/web/20210516003347/https://classic.wowhead.com/guides/wow-classic-best-shaman-weapons), [overview](http://web.archive.org/web/20210516004127/https://classic.wowhead.com/guides/enhancement-shaman-dps-classic-wow), [pre-raid BiS](http://web.archive.org/web/20210515151721/https://classic.wowhead.com/guides/wow-classic-enhancement-shaman-dps-pre-raid-best-in-slot-gear), [consumables](http://web.archive.org/web/20210515152931/https://classic.wowhead.com/guides/enhancement-shaman-dps-consumables-classic-wow) (Wayback, 2021) | the Classic Era priority, build, race, weapon, gear and consumables | Classic Era [C] |
| [Icy Veins Classic: rotation](http://web.archive.org/web/20210508050234/https://www.icy-veins.com/wow-classic/enhancement-shaman-dps-pve-rotation-cooldowns-abilities), [spell summary](http://web.archive.org/web/20210419094508/https://www.icy-veins.com/wow-classic/enhancement-shaman-dps-pve-spell-summary) (Wayback, 2021) | Stormstrike on cooldown, Frost Shock, Windfury Weapon, Lightning Bolt out of range only | Classic Era [C] |
| [Warcraft Tavern: Classic PvE Enhancement](https://www.warcrafttavern.com/wow-classic/guides/pve-enhancement-shaman/) (Wayback 2021-04-16) | "Totems > Stormstrike > Flame Shock > Frost / Earth Shock" | Classic Era [C] |
| [mangos player_levelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql), [player_classlevelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql) | the D24 attribute and health placeholders | **Forbidden** as evidence (an emulator); placeholders only, under D24 |
| [wowsims/classic base_stats.go](https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go), [RatingBuster d11164cf](https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua) | base attack power, crit and spell crit placeholders | secondary (mixed lineage) [?] |

### DB2 links (per spell)

Browse links to the same rows on wago.tools' table pages, for reading by hand; the pages stay
off-limits to scripts ([D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)).

[f17364]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=17364
[f15208]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=15208
[f10414]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10414
[f10473]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10473
[f29228]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=29228

- Stormstrike [f17364]; Lightning Bolt [f15208]; Earth Shock [f10414]; Frost Shock [f10473]; Flame
  Shock [f29228]. The same `filter[SpellID]` works on SpellAuraOptions, SpellMisc, SpellCategories,
  SpellCooldowns, SpellPower and SpellLevels, and for the other spell ids above (16362, 439431,
  16361, 16316, 16313, 425336, 408498, 408505, 16256, 16257, 30160, 30165, 1223031, 1238931,
  27859). The client scraper extracts the triggered ones through these markers: spell 439431, spell
  16361, spell 16313, spell 408505, spell 16257, spell 30165, spell 1238931.
