# Shaman: Enhancement and Elemental

WoW Forever turns the Enhancement shaman into a two-hander that mixes melee and instant spells.
**Stormstrike** is an 8 s, 125-mana normalized strike whose +20% now goes only to the shaman's own
next Lightning Bolt, Chain Lightning or Earth Shock, so it's no longer a raid debuff. New talents
turn Intellect into attack power (**Mental Dexterity**) and spell damage (**Mental Quickness**),
let Earth Shock cost 45% less (**Shamanistic Focus**), give mana regeneration after a Stormstrike
(**Improved Stormstrike**), stack **Maelstrom Weapon** from melee hits until a Lightning Bolt is
instant and free, and add a 30% attack speed cooldown (**Rage of the Farseer**). Spell damage is roughly
halved (Lightning Bolt 190–211, Earth Shock 293–309), weapon imbues last an hour, totems 5 minutes,
and Windfury Weapon disables Windfury Totem's benefit for the shaman who wears it. Two-handed axes
and maces need no talent. Dwarves can be shamans, so both factions have them.

This doc is the engine contract for Enhancement (slice S1) and Elemental (slice K5, on the caster
core), both landed in the 90/10 mode of
[D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24): every
ability, proc and talent they use at level 60, with numbers and sources, the rotations and their
settings, the defaults, worked examples that run as unit tests, and the questions the beta has to
answer. [Elemental](#elemental) has its own part below.

Status: researched 2026-09-24 · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 ·
ruleset tags: [F] Forever · [C] Classic Era · [?] unverified · engine: Enhancement and Elemental with
first-pass defaults ([Enhancement priority](#enhancement-priority), [Elemental priority](#elemental-priority))

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
| Orc | Horde | yes | yes | Blood Fury: +10% attack power and +10% spell power for 15 s, 2 min ([character-stats](../mechanics/character-stats.md#racials-that-matter-to-the-sim)); Axe Specialization (+1% crit with an axe) |
| Tauren | Horde | yes | yes | Endurance: +1% hit with attacks and spells |
| Troll | Horde | yes | yes | Berserking: +10% attack and casting speed for 10 s, 3 min |
| Windshaper Skyborne | Horde | — (new race) | yes | Wind Blessed: +1% attack and casting speed (auras 342, 65) |
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
- **A school's own spell damage on gear counts for that school's spells** (the caster core's,
  [spells.md §5](../mechanics/spells.md#5-spell-power-and-coefficients)): Nature-only for Lightning
  Bolt, Chain Lightning and Earth Shock, Frost-only for Frost Shock, Fire-only for Flame Shock and
  Lava Burst. Since K5; no item in the Enhancement default gear has any, so its results didn't
  move ([Enhancement on the core](#enhancement-on-the-core)).
- Orc Blood Fury's +10% spell power multiplies the spell damage of every school while it's up, as
  for every caster (the shared `caster-racials.ts`; [warlock.md §7.2](warlock.md#72-race)), not
  rounded [?]. Both specs press the casters' Blood Fury and Berserking.
- The sheet's "spell damage" shows this number (the default setup: 53, from 179 Intellect); an
  Elemental shaman's sheet shows it by school.

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
simulated. With the default setup's Spirit 168 and mp5 61, a tick is 48.6 + 24.4 = 73.0 outside the
rule, 24.4 inside it, and 24.4 + 24.3 = 48.7 inside it after a Stormstrike
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
| Strength of Earth (rank 4) | +42 Strength | on |
| Grace of Air (rank 2) | +77 Agility | on (the air totem) |
| Mana Spring | 10 mana every 2 s | on |
| Windfury Totem | 20% on a main-hand hit, 1 extra attack with +246 AP | **off**: Windfury Weapon disables it for you |

Values, durations (5 min, [F]) and exclusivity are the
[buffs doc](../mechanics/buffs-debuffs-consumables.md#11-attack-power-stats-and-crit)'s: one air
totem, and since 1.60.1.70009 Windfury, Grace of Air and Tranquil Air don't stack **even from
different shamans** in the group, so a second shaman can't add the other one, and Flametongue
Totem no longer stacks with Windfury ([Forever development notes][dev-70009]). The client marks
them all with the same new `Attributes[11]` flag, 0x400, on every rank's aura [F] [client]
(SpellMisc, 1.60.1.70009):

- Windfury Totem 8515, 10609 and 10612, and Grace of Air 8836, 10626 and 25360;
- Flametongue Totem 8230, 8250, 10521 and 15036, and Tranquil Air 25909.

The sim models the rank-3 Windfury, the rank-2 Grace of Air and the rank-4 Strength of Earth, the
top ranks a trainer teaches: Grace of Air rank 3 (25359) and Strength of Earth rank 5 (25361) are
Ahn'Qiraj tablets (Tablet of Grace of Air Totem III and Tablet of Strength of Earth Totem V, items 21293
and 21292 [F] [client] (ItemSparse, ItemEffect, ItemXItemEffect, 1.60.1.70009)), and Ahn'Qiraj comes
long after launch ([D36](../decisions.md#d36-what-we-take-from-warriorsim-2026-09-25)). Flametongue
Totem isn't in the catalogue.

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
| Rage of the Farseer (425336), new, tier 7 | 1 | +30% attack speed for 25 s; 3 min cooldown; off the GCD; free | a cooldown |

Rage of the Farseer lost its +30% casting speed in 1.60.1.70009 ("no longer increases the Shaman's
Spell Casting Speed", [development notes][dev-70009]): the client's 425336 no longer carries aura 65
[F] [client] (SpellEffect, 1.60.1.70009). So it no longer shortens a cast Lightning Bolt.

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
Eye of the Storm, Elemental Reach, Earthbound, and the healing talents. Elemental Focus, Lightning
Overload, Lava Burst and Mindfulness are the Elemental build's ([Elemental talents](#elemental-talents)).
Unleashed Rage is a TBC talent in neither client's tree.

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
(written without the prefix below). Rows 1–3 and 5–7 are the Rotation tab's priority list
([below](#the-priority-list-a2)); the imbue and the consumables are its spec-wide settings. A mana
threshold is a share of maximum mana.

| # | Action | Condition (setting, default) | Default |
| --- | --- | --- | --- |
| 0 | Weapon imbue: Windfury Weapon (its procs), or Rockbiter Weapon cast 3 s before the pull | `imbue` (`windfury` or `rockbiter`) | Windfury |
| 1 | Blood Fury (Orc) or Berserking (Troll), off the GCD | `racial.enabled`; on cooldown from the pull | on |
| 2 | Rage of the Farseer, off the GCD | `rageOfTheFarseer.enabled`, with the talent; on cooldown | on |
| 3 | On-use trinkets (Earthstrike), off the GCD | `trinkets.enabled`; on cooldown | on |
| 4 | Juju Flurry, off the GCD, with row 3 | `jujuFlurry.enabled`, with Juju Flurry selected in Buffs (Max consumables); on cooldown | on |
| 5 | Stormstrike | `stormstrike.enabled`, with the talent; ready | on |
| 6 | Lightning Bolt | `lightningBolt.enabled`, with Maelstrom Weapon; at least `lightningBolt.minStacks` stacks (1–5) | on, 5 stacks |
| 7 | The shock: Earth Shock, Frost Shock or none | `shock.spell`; ready and mana ≥ `shock.minManaPct` (0–100%) | Earth Shock, 10% |
| — | Major Mana Potion, off the GCD | `manaPotion.enabled`, selected in Buffs (Standard raid); missing at least `manaPotion.missingMana` | on, 2,250 |
| — | Demonic Rune (a Dark Rune is the same), off the GCD | `rune.enabled`, selected in Buffs (Max consumables); missing at least `rune.missingMana`; its own cooldown | on, 1,500 |

The Rotation tab says: "The defaults are the common priority. There's no totem twisting: in
Forever, Windfury Totem is an aura that ends with the totem."

### The priority list (A2)

Since M5.65 A2 rows 1–7 above are the Rotation tab's priority list
([D31](../decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24);
`ENHANCEMENT_APL` in `enhancement.ts`), in this order, each with its switch and its own settings.
Each row keeps its conditions wherever you move it:

| Row (`id`) | Switch | Its settings | Condition |
| --- | --- | --- | --- |
| Racial cooldown (`racial`) | `racial.enabled` | | on cooldown (row 1) |
| Rage of the Farseer (`rageOfTheFarseer`) | `rageOfTheFarseer.enabled` | | with the talent, on cooldown (row 2) |
| On-use trinkets (`trinkets`) | `trinkets.enabled` | | on cooldown (row 3); Juju Flurry (row 4) takes its turn here |
| Stormstrike (`stormstrike`) | `stormstrike.enabled` | | with the talent, on cooldown (row 5) |
| Lightning Bolt (`lightningBolt`) | `lightningBolt.enabled` | `lightningBolt.minStacks` | with Maelstrom Weapon, at the stacks (row 6) |
| Shock (`shock`) | — (`None` in its choice) | `shock.spell`, `shock.minManaPct` | ready, mana ≥ the share (row 7); at None its summary reads just "None", without the share |

- **Pinned:** nothing. The imbue goes on 3 s before the pull whatever the order.
- **Spec-wide, above the list:** the weapon imbue (row 0), first and without a heading, since it
  shapes the rest (Windfury Weapon turns off Windfury Totem), as Arms' stance does
  ([ux.md "Rotation"](../ux.md#sections)); and the consumables: Juju Flurry, the Major Mana Potion and
  Demonic Rune with their mana limits, under Consumables. Juju Flurry takes its
  turn in the list with the on-use trinkets' row, wherever that sits, as it did before the list;
  the potion and rune come after the list, off the GCD once all they restore fits.
- **No named rotations:** the implicit Default only, the common priority (D27).
- **Equivalence:** in the default order every plan is the one it was before the list, byte for
  byte: 200 random setups (settings, talents, race, relic, on-use trinkets, Buffs, fight and
  rules) are fingerprinted against the code before it (`enhancement-apl.test.ts`).
- **What reordering does:** the rows off the GCD (1–4) are pressed as soon as they're ready
  wherever they sit, so their place matters only when two are ready at once. Rows 5–7 share the
  GCD: a row moved up takes it first when both are ready (the shock above Stormstrike spends its
  mana before Stormstrike does). Not measured yet: the tuning milestone searches the order (D27,
  D30).

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
| Consumables | Standard raid: Elixir of the Mongoose, Elixir of Greater Strength, Smoked Desert Dumplings, Major Mana Potion. Max adds Juju Power, Juju Might, R.O.I.D.S., Juju Flurry, Greater Arcane Elixir, Flask of Supreme Power and Demonic Rune, and drinks the Major Frenzy Potion on cooldown from the pull in place of the Major Mana Potion (+0.9% DPS at the default 3 min fight; past about 4 min the mana potion wins: buffs §6.3). **No weapon stone**: the imbue takes the temporary enchant | [buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset) |
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
  and it carries the caster core's mana hook (`castingRegen` 50, [spells.md §8](../mechanics/spells.md#8-mana)):
  while it's up, 50% of the spirit regeneration continues inside the five-second rule.
- **Mental Dexterity** is attack power per point of Intellect (`apPerInt`); **Mental Quickness** the
  paladin's spell damage from Intellect (`spellDamagePerIntPct`).
- **Lightning Bolt** is `castHasted` (the caster core's casting speed, after Maelstrom Weapon's cut).
  Rage of the Farseer's aura is attack speed only (`haste` 30) since 1.60.1.70009.
- **Elemental**: the spells are `spell` rows on the caster core; Flame Shock's DoT marks the boss
  with its ability's `aura`, which Lava Burst's `boost` reads and keeps (`SpellDef.boost.keep`);
  Elemental Focus's Clearcasting is the plan's `freeCastAura` and the damage spells are
  `clearcastable`; Lightning Overload is a `spellLanded` proc per spell (`fromSpell`) that casts a
  half-damage copy; Mindfulness is the mana plan's `inFsrShare`; Mana Tide Totem is a `cast` whose
  ticks restore mana (`rageTickTenths` on a mana row); the plan has no weapon (`SpecMeta.caster`).
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
9. **Mana ticks** (the default setup: 3,925 mana, Spirit 168, mp5 61: Blessing of Wisdom r5's 36 and
   Mana Spring's 25): **48.6** spirit regeneration (15 + 168 / 5) and **24.4** mp5 (61 × 2 / 5) a tick,
   so **73.0** outside the five-second rule, **24.4** inside it, and **48.7** inside it within 15 s of a
   Stormstrike with Improved Stormstrike 2/2. A
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

## Elemental

The Elemental shaman casts from range on the caster core ([spells.md](../mechanics/spells.md)): it
never swings its weapon, and its spells roll the spell table, take the boss's average partial
resist and crit for ×2.0 with Elemental Fury. Forever keeps Classic Era's Lightning Bolt spam and
changes the rest around it: **Elemental Mastery is gone**, **Lava Burst** is the new tier-7 talent
(+20% while your Flame Shock burns), **Lightning Overload** casts a half-damage copy of 10% of your
bolts, **Call of Thunder** is one rank of +3%, **Call of Flame** now raises Flame Shock and Lava
Burst, and **Mindfulness** lets half your regeneration go on while casting. Spell damage is roughly
halved (Lightning Bolt 190–211 at 0.714), but the cost isn't, so mana decides the damage: the
default rotation downranks Lightning Bolt when low, as Classic Era elementals did.

This part is slice K5's engine contract, landed in D27's 90/10 mode. It also takes the Enhancement
shaman onto the caster core ([Enhancement on the core](#enhancement-on-the-core)).

### What the Elemental sim needs

1. **Lightning Bolt** (ranks 10 and 4), **Chain Lightning**, **Flame Shock** (a DoT) and **Lava
   Burst** as caster-core casts with the client's coefficients ([Elemental abilities](#elemental-abilities)).
2. **Spell damage by school**: all schools, Mental Quickness's share, and Nature-, Fire- and
   Frost-only gear lines ([Spell damage](#spell-damage)).
3. **The talents**: Elemental Fury's ×2, Call of Thunder, Concussion, Call of Flame, Convection,
   Elemental Alacrity, Elemental Focus's Clearcasting, Lightning Overload, Mindfulness and Mana Tide
   Totem ([Elemental talents](#elemental-talents)).
4. **Mana**: the five-second rule, Mindfulness, Mana Spring, Mana Tide, potions and runes
   ([Elemental mana](#elemental-mana)).
5. **The priority**: Flame Shock kept up for Lava Burst, Lava Burst, Chain Lightning with
   Clearcasting, and Lightning Bolt rank 10 above a mana threshold and rank 4 below it
   ([Elemental priority](#elemental-priority)).
6. **No melee**: a caster's plan has no weapon, and the melee's Buffs entries (`forSpecs: 'melee'`) leave it
   ([spells.md §12](../mechanics/spells.md#12-what-a-class-slice-uses)).

### Elemental: WoW Forever deviations

Read from the Forever client (1.60.1.69913; Lightning Bolt r4 and Lava Burst from 1.60.1.70009)
against Classic Era's (1.15.9.69722) through the wago.tools API ([client data](../data/client.md))
[F] [C] [client] (SpellEffect, SpellMisc, SpellCastTimes, SpellPower, SpellCooldowns, SpellLevels,
TraitDefinition, CurvePoint).

| Area | Classic Era [C] | WoW Forever [F] |
| --- | --- | --- |
| Lightning Bolt r10 (15208) | 428–476 at 0.857, 3.0 s, 265 mana | **190.18–211.42 at 0.714, 2.5 s, 220 mana** |
| Lightning Bolt r4 (915) | 88–100, 3.0 s, 75 mana | **55.22–62.78 at 0.714** (every rank from 3 up has 0.714; 49.63–56.37 until 1.60.1.70009 raised ranks 3 and 4), 2.5 s, 60 mana |
| Chain Lightning r4 (10605) | 505–563, 2.5 s, 605 mana, 6 s cooldown | **119.37–133.03 at 0.571**, 2.0 s, 485 mana, 6 s cooldown |
| Flame Shock r6 (29228) | 292 + 320 over 12 s | **166 (0.214) + 4 × 44 (0.1 a tick)**, the **periodic-crit flag**, 410 mana |
| Lava Burst r3 (1238300) | — (not in Classic Era) | **new tier-7 talent**: 192.14–247.86 Fire at 0.714, 2.5 s, 265 mana, 10 s cooldown, **+20% while your Flame Shock is on the target**. 1.60.1.70009 raised ranks 1 and 2 (408490 113 → 164, 1238299 179 → 196 base points), not rank 3 |
| Elemental Mastery | 31-point talent | **gone** from the tree |
| Call of Thunder (16120) | 5 ranks, +6% | **1 rank, +3%** to Lightning Bolt and Chain Lightning |
| Elemental Fury (16089) | 1 rank, +100% crit bonus | **5 ranks**, +20% a rank: ×2.0 at 5/5 |
| Call of Flame (16038) | Fire totems | **+5% a rank to Flame Shock** (its hit and ticks), **Lava Burst** and Fire Nova |
| Lightning Overload (408438) | — | **new**: 3 / 7 / 10% a Lightning Bolt or Chain Lightning casts a second at half damage and no threat |
| Elemental Alacrity (16578) | Lightning Mastery: 5 ranks, −1.0 s on Lightning Bolt and Chain Lightning | **renamed**, 3 ranks: −170 / 330 / 500 ms on Lightning Bolt, Chain Lightning **and Lava Burst**. 1.60.1.70009 swapped its place in the tree with Elemental Fury's (it's now tier 3, Elemental Fury tier 6); neither's values changed [F] [client] (TraitNode, TraitDefinitionEffectPoints, 1.60.1.70009) |
| Convection (16039) | shocks, Lightning Bolt, Chain Lightning | the same **and Lava Burst**, −2% a rank |
| Concussion (16035) | +1% to shocks, Lightning Bolt, Chain Lightning | Lightning Bolt, Chain Lightning and **Earth Shock only** |
| Mindfulness (1223033), Restoration | — | **new**: 17 / 33 / **50%** of mana regeneration continues while casting (aura 134) |
| Tidal Focus (16179) | healing cost | also **+1% hit a rank** (with spells too) |
| Mana Tide Totem (17359) | 290 every 3 s for 12 s, 5 min | the same, **tier 4 of Restoration** (15 points) |
| Blood Fury (20572, Orc) | +attack power | also **+10% spell power** (aura 317) |
| Berserking (20554, Troll) | 10–30% by health | **flat +10% casting and attack speed** for 10 s |

### Elemental abilities

Values at level 60; a range is base × (1 ± variance / 2) plus per-level points
([Conventions](#conventions-used-below)). Costs and casts are after the default build's talents.

| Spell | Damage | Coefficient | Cast, cooldown | Mana (base → default) | Tag |
| --- | --- | --- | --- | --- | --- |
| Lightning Bolt r10 (15208), Nature | 190.18–211.42 | 0.714 | 2.5 s → **2.0 s** | 220 → **198** | [F] [client] ([f15208]) |
| Lightning Bolt r4 (915), Nature | 55.22–62.78 | 0.714 | 2.5 s → **2.0 s** | 60 → **54** | [F] [client] ([f915], 1.60.1.70009) |
| Chain Lightning r4 (10605), Nature | 119.37–133.03 (the first target) | 0.571 | 2.0 s → **1.5 s**, 6 s | 485 → **436** | [F] [client] ([f10605]) |
| Flame Shock r6 (29228), Fire | 166, then 4 × 44 every 3 s | 0.214, 0.1 a tick | instant, shocks' 6 s → **5.2 s** | 410 → **369** | [F] [client] ([f29228]) |
| Lava Burst r3 (1238300), Fire | 192.14–247.86; ×1.2 with your Flame Shock up | 0.714 | 2.5 s → **2.0 s**, 10 s | 265 → **238** | [F] [client] ([f1238300]) |
| Earth Shock r7 (10414), Nature | 293.06–308.94 | 0.386 | instant, shocks' cooldown | 450 → **405** | [F] ([Shocks](#shocks-and-lightning-bolt)) |

- **The spell table** ([spells.md §1–§3](../mechanics/spells.md#1-spell-hit)): 17% − spell hit
  misses against a level-63 boss; the average partial resist, **6%**; ×1.5 crits, **×2.0** with
  Elemental Fury 5/5. None of these spells is binary: Flame Shock's extra effect is a dummy Lava
  Burst reads [F] (SpellEffect 29228 #2), so each hit and tick loses 6% on average [?]
  ([OQ-S1](../mechanics/spells.md#open-questions)).
- **Flame Shock's DoT** snapshots your spell damage and crit as it lands; its ticks crit ×2.0 in
  `forever`, since the client flags them (SpellMisc Attributes[8] 0x200) [F] [?] in combat
  ([spells.md §7](../mechanics/spells.md#7-dots)). It marks the boss for 12 s, which Lava Burst
  reads; it shares the shocks' cooldown category with Earth Shock and Frost Shock.
- **Lava Burst's +20%** (1238300 #1, a dummy of 20) applies while your Flame Shock is on the boss,
  and doesn't use it up [F].
- **Casting speed** (Berserking) shortens Lightning Bolt, Chain Lightning and Lava Burst, not the
  1.5 s GCD ([spells.md §4](../mechanics/spells.md#4-cast-times-casting-speed-and-the-gcd)).
- **Chain Lightning** hits one boss: its jumps (3 targets, −30% each) wait for multi-target (M6).
- **Rank 4 Lightning Bolt** is learned at 20, so Classic Era's penalty for spells below level 20
  doesn't touch it, and the client gives it rank 10's 0.714 [F]. Whether Forever charges a
  downranking penalty the client doesn't show is [?] ([Elemental open questions](#elemental-open-questions)).
- **Travel time** (speed 20) isn't simulated: it delays a hit, never removes one.
- **Threat** is the damage; Lightning Overload's copy makes none.

### Elemental talents

Values are the Forever client's rank curves, checked by `src/sim/classes/shaman/data.test.ts` [F]
[client] (TraitDefinitionEffectPoints, CurvePoint, SpellEffect, 1.60.1.69913).

| Talent (spell) | Ranks | Forever effect at the default's rank | Sim |
| --- | --- | --- | --- |
| Convection (16039) | 5 | −10% mana: the shocks, Lightning Bolt, Chain Lightning, Lava Burst | cost, added to other cuts [?] |
| Concussion (16035) | 5 | +5% to Lightning Bolt, Chain Lightning, Earth Shock | damage |
| Reverberation (16040) | 4 of 5 | −0.8 s on the shocks' cooldown | cooldown |
| Call of Flame (16038) | 3 | +15% to Flame Shock (its hit, mask 0x10000000, and its ticks, misc 22) and Lava Burst (word 1 0x1000) | damage |
| Elemental Focus (16164 → 16246) | 1 | 10% of your Fire, Frost and Nature damage spells: Clearcasting, the next damage spell costs no mana, 15 s | a proc on landed spells [?]; the plan's free-cast aura |
| Elemental Fury (16089) | 5 | +100% crit bonus: ×2.0 | crit multiplier |
| Call of Thunder (16120) | 1 | +3% crit to Lightning Bolt and Chain Lightning | crit |
| Lightning Overload (408438) | 3 | 10%: a second Lightning Bolt or Chain Lightning at half damage and no threat | a proc on landed bolts [?] |
| Elemental Alacrity (16578) | 3 | −500 ms on Lightning Bolt, Chain Lightning, Lava Burst | cast time |
| Lava Burst (408490) | 1 | the spell ([Elemental abilities](#elemental-abilities)) | a cast |
| Thundering Strikes (16255), Enhancement | 4 of 5 | +4% crit with spells and attacks | spell crit |
| Totemic Focus (16173), Restoration | 5 | −25% totem mana (the gate to tier 2) | nothing |
| Mindfulness (1223033), Restoration | 3 | 50% of mana regeneration continues while casting | the mana plan's in-rule share |
| Natural Grace (29187), Restoration | 2 of 3 | −10% threat from spells | not simulated (TPS only) |
| Tidal Focus (16179), Restoration | 5 | +5% hit | spell hit |
| Mana Tide Totem (16190 → 17359), Restoration | 1 | a totem: 290 mana every 3 s for 12 s, 5 min | a cast ([Elemental mana](#elemental-mana)) |

Not modelled: Elemental Warding, Eye of the Storm (pushback), Elemental Reach (range), Improved
Fire Nova and Earthbound (no Fire Nova or totems in the rotation), Elemental Devastation (melee
crit), Nature's Swiftness (Restoration tier 5, out of the build's reach), Restorative Totems (not in
the build; it would raise the Buffs tab's Mana Spring).

### Elemental mana

The shaman's mana model ([Mana](#mana)) with Mindfulness: every 2 s, `15 + Spirit / 5` outside the
five-second rule, **50% of it inside** (the plan's `inFsrShare`, as the paladin's Reverence), and
mp5 always [C] [F]. A spell Clearcasting makes free spends nothing, so it starts no five-second rule.

| Source | Value | Tag |
| --- | --- | --- |
| Pool (default setup) | **4,975** mana (Intellect 249) | [F] base mana, [C] per Intellect |
| Spirit regeneration | 15 + 188 / 5 = **52.6** a tick; **26.3** while casting (Mindfulness 3/3) | [C]; the share [F] |
| mp5 | 65 → **26** a tick | [C] |
| Mana Spring Totem | the Buffs tab's (your own, `selfCast`): 10 mana every 2 s | [F] ([buffs doc](../mechanics/buffs-debuffs-consumables.md#12-threat-defense-and-mana)) |
| Mana Tide Totem r3 (17359) | 60 mana, 1 s GCD, 5 min cooldown; **4 × 290** every 3 s from 3 s after it drops [?] | [F] cost, cooldown and tooltip; the tick timing [?] |
| Major Mana Potion, Demonic Rune | 1,350–2,250 and 900–1,500, their own 2 min cooldowns | [F] ([buffs §3.5](../mechanics/buffs-debuffs-consumables.md#35-potions-and-runes)) |
| Totems | dropped before the pull, up all fight (5 min) | [F] |

Mana is the Elemental shaman's limit: on the default setup a fight spends about three pools. Rank 10
Lightning Bolt deals 2.4 damage per mana at SP 400 (480 for 198 mana without crits), rank 4 6.3
(340 for 54), so the rotation casts rank 10 while mana lasts and rank 4 once it's low: +20.6%
against rank 10 alone, measured before 1.60.1.70009 raised rank 4 by 6 base points
([Elemental first-pass defaults](#elemental-first-pass-defaults)).

### Elemental priority

#### Classic Era approach (baseline)

All pre-August-2021 Wayback snapshots, [C]:

- [Wowhead's Classic Elemental rotation](http://web.archive.org/web/20210513041129/https://classic.wowhead.com/guides/elemental-shaman-dps-rotation-abilities-classic-wow)
  (updated for Phase 6): "Lightning Bolt for the bulk of the damage. Downrank it to rank 4 in longer
  fights"; "Chain Lightning when Elemental Focus procs"; its "high Mana cost makes it unsustainable";
  Earth Shock only "to finish off enemies"; no Flame Shock in PvE; "It is not recommended to do
  Totem Twisting as an Elemental Shaman"; Mana Spring Totem "is actually worth casting".
- [Wowhead's Classic Elemental talents](http://web.archive.org/web/20210516151409/https://classic.wowhead.com/guides/elemental-shaman-dps-talents-builds-classic-wow):
  "Consider using rank 4 Lightning Bolt as your main spell in long fights and only using max rank
  Lightning Bolt when it made free by this talent"; Elemental Mastery "with Chain Lightning";
  Mana Tide "too far deep into the Restoration Tree".
- [Icy Veins' Classic Elemental rotation](http://web.archive.org/web/20210508032115/https://www.icy-veins.com/wow-classic/elemental-shaman-dps-pve-rotation-cooldowns-abilities):
  totems up; "If you get Elemental Focus procs, use Chain Lightning instead"; "Lightning Bolt for
  Mana efficient damage. The shorter the fight, the higher rank you will use, but never go under
  rank 4"; "Rank 4 for efficient single target damage and Rank 10 for maximum throughput".
- [Wowhead's Classic Elemental consumables](http://web.archive.org/web/20210517033500/https://classic.wowhead.com/guides/elemental-shaman-dps-consumables-classic-wow):
  the Major Mana Potion is the "number one priority… every time it comes off cooldown"; Dark and
  Demonic Runes "do not share a cooldown with Major Mana Potion".

#### Adapted to Forever

- **Flame Shock is back in the list**, kept on the boss for Lava Burst's +20%. Classic Era had no
  Lava Burst, so no reason to use it: without it the default loses 3.89%.
- **Lava Burst on cooldown**, a Forever talent; waiting for Flame Shock gains 0.10%, within D27.
- **No Elemental Mastery**: Forever removed it. Nature's Swiftness is out of the build's reach.
- **Chain Lightning with Clearcasting**, as Classic Era did: on cooldown it loses 5.06%; never
  gains 0.39%, within D27's first pass (Forever's Chain Lightning is weak against one target).
- **Rank 4 Lightning Bolt below 10% mana**, Classic Era's downrank, with Clearcasting always spent
  on rank 10 (or Chain Lightning).
- **Mana Tide Totem**, which Classic Era's build couldn't reach, is in Forever's (tier 4): dropped
  once you're missing 3,000 mana.
- **Racial and Power Infusion on cooldown** from the pull; a mana potion and rune when all they
  restore fits.
- **No totem twisting**: the totems are the Buffs tab's, up all fight.

#### Forever priority list (default)

Evaluated top to bottom whenever the shaman is free. Setting ids are `shaman.elemental.<x>`
(written without the prefix below). Every row but 5 is the Rotation tab's priority list
([below](#elemental-priority-list-a2)); the mana potion and rune are its spec-wide settings. A mana
threshold is a share of maximum mana.

| # | Action | Condition (setting, default) | Default |
| --- | --- | --- | --- |
| 1 | Berserking (Troll) or Blood Fury (Orc), off the GCD | `racial.enabled`; on cooldown from the pull | on |
| 2 | On-use trinkets (Weakness Analyzer), off the GCD | `trinkets.enabled`; on cooldown | on |
| 3 | Power Infusion, off the GCD | `powerInfusion.enabled`, with it selected in Buffs (a priest's); on cooldown | on |
| 4 | Mana Tide Totem (1 s GCD) | `manaTide.enabled`, with the talent; missing at least `manaTide.missingMana` | on, 3,000 |
| 5 | Major Mana Potion, Demonic Rune, off the GCD, with row 4 | `manaPotion.enabled`, `rune.enabled`, selected in Buffs; missing at least `manaPotion.missingMana`, `rune.missingMana` | on, 2,250 and 1,500 |
| 6 | Flame Shock | `flameShock.enabled` (default on with Lava Burst); your Flame Shock isn't on the boss | on |
| 7 | Lava Burst | `lavaBurst.enabled`, with the talent; ready; with `lavaBurst.withFlameShock`, only while your Flame Shock is up | on, any time |
| 8 | Chain Lightning | `chainLightning.use`: with Clearcasting, on cooldown or never | with Clearcasting |
| 9 | Earth Shock | `earthShock.enabled`; mana ≥ `earthShock.minManaPct` | off (50%) |
| 10 | Lightning Bolt rank 10 | with Clearcasting, or mana ≥ `lightningBolt.maxRankFromPct` | 10% |
| 11 | Lightning Bolt rank 4 | `lightningBolt.downrank` | on |

The Rotation tab says: "The defaults are the common priority, with a first quick search; they
aren't tuned yet. Flame Shock is there for Lava Burst, which Classic Era didn't have."

#### Elemental priority list (A2)

Since M5.65 A2 the rows above are the Rotation tab's priority list
([D31](../decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24);
`ELEMENTAL_APL` in `elemental.ts`), in this order, each with its switch and its own settings. Each
row keeps its conditions wherever you move it:

| Row (`id`) | Switch | Its settings | Condition |
| --- | --- | --- | --- |
| Racial cooldown (`racial`) | `racial.enabled` | | on cooldown (row 1) |
| On-use trinkets (`trinkets`) | `trinkets.enabled` | | on cooldown (row 2) |
| Power Infusion (`powerInfusion`) | `powerInfusion.enabled` | | selected in Buffs, on cooldown (row 3) |
| Mana Tide Totem (`manaTide`) | `manaTide.enabled` | `manaTide.missingMana` | with the talent, missing the mana (row 4); the mana potion and rune (row 5) take their turn here |
| Flame Shock (`flameShock`) | `flameShock.enabled` | | your Flame Shock isn't on the boss (row 6) |
| Lava Burst (`lavaBurst`) | `lavaBurst.enabled` | `lavaBurst.withFlameShock` | with the talent, ready; waits for your Flame Shock only while Flame Shock's row is on (row 7) |
| Chain Lightning (`chainLightning`) | — (`never` in its choice) | `chainLightning.use` | with Clearcasting or on cooldown (row 8); its summary reads "With Clearcasting", "On cooldown" or "Never"; "None" at With Clearcasting without Elemental Focus, which never casts it, and "Not used" below Lightning Bolt (its setting says why, below) |
| Earth Shock (`earthShock`) | `earthShock.enabled` | `earthShock.minManaPct` | mana ≥ the share (row 9) |
| Lightning Bolt (`lightningBolt`) | — (always there: the filler) | `lightningBolt.downrank`, `lightningBolt.maxRankFromPct` | rank 10 with Clearcasting or from the share, rank 4 below it (rows 10 and 11) |

- **Lightning Bolt is a row.** Before the list it was a fixed row with no control ("Always on"); it
  has no switch still, since the filler is what you cast when nothing else is ready, but it moves
  like any row, and its downrank settings are its own.
- **Pinned:** nothing. There's no pre-pull.
- **Spec-wide, above the list:** the Major Mana Potion and Demonic Rune, with their mana limits,
  under Consumables. They take their turn in the list with Mana Tide Totem's row, wherever that
  sits, as they did before the list, and are used whether that row is on or off.
- **No named rotations:** the implicit Default only, the common priority (D27).
- **Equivalence:** in the default order every plan is the one it was before the list, byte for
  byte: 200 random setups (settings, talents, race, relic, Weakness Analyzer, Buffs, fight and
  rules) are fingerprinted against the code before it (`elemental-apl.test.ts`).
- **What reordering does:** rows 1–3 and the consumables are off the GCD and pressed as soon as
  they're ready wherever they sit. The rest share the GCD: a row moved up takes it first when both
  are ready, and Lightning Bolt above a row leaves that row almost no GCD, since the bolt's last
  line (rank 4, or rank 10 without the downrank) has no condition but its mana.
  Not measured yet: the tuning milestone searches the order (D27, D30).
- **What the settings say is unused** (`elementalUnusedSettings`, docs/ux.md "Rotation"):
  - Chain Lightning with Clearcasting without Elemental Focus, the only source of Clearcasting,
    never casts: "Not used: Clearcasting needs the Elemental Focus talent."
  - A row on the global cooldown below Lightning Bolt (Mana Tide Totem, Flame Shock, Lava Burst,
    Chain Lightning, Earth Shock), on and with its talent, gets a GCD only when the bolt can't be
    cast, and says so, dimmed, by the rule every filler's rows share ([ux.md "Rotation"](../ux.md#sections),
    rows below the filler): "Below Lightning Bolt: cast only when Lightning Bolt can't be." In the
    default setup, Lightning Bolt first casts none of them. Chain Lightning's Elemental Focus note
    comes first.
  - Chain Lightning's row has no switch. Without Elemental Focus it reads "None", dimmed, and its
    setting says why. Below Lightning Bolt the row shows the same note as its setting, dimmed like
    the rows with a switch (VA-3).

### Elemental defaults

| Setting | Default | Why / source |
| --- | --- | --- |
| Talents | **`5504301300103051-04-053250000001`** (Elemental 31 / Enhancement 4 / Restoration 16): Convection 5, Concussion 5, Reverberation 4, Call of Flame 3, Elemental Focus 1, Elemental Alacrity 3, Call of Thunder 1, Lightning Overload 3, Elemental Fury 5, Lava Burst 1; Thundering Strikes 4; Totemic Focus 5, Mindfulness 3, Natural Grace 2, Tidal Focus 5, Mana Tide Totem 1. The same talents as on 1.60.1.69913's trees, where the code was `5504301500103031-04-053250000001`: 1.60.1.70009 swapped Elemental Fury (now tier 6, after Call of Thunder) and Elemental Alacrity (now tier 3, before it) ([data/talents.md](../data/talents.md#tree-versions)) | Classic Era's raid build was 31/0/20 with Elemental Mastery ([Wowhead talents](http://web.archive.org/web/20210516151409/https://classic.wowhead.com/guides/elemental-shaman-dps-talents-builds-classic-wow), `550331050002151--05204301005`; Icy Veins the same) [C], adapted: every damage talent to Lava Burst (31 points), Restoration for hit (Tidal Focus, as Nature's Guidance was), Mindfulness and Mana Tide, which Forever moved within reach, and the spare 4 in Thundering Strikes. Swapping Mana Tide and Natural Grace for Thundering Strikes' fifth point (`-05-05325`) loses 1.22%; Enhancement 10 / Restoration 10 without Mindfulness (`-055-05005`) 17.68% |
| Race | **Orc** (Horde) | Classic Era's pick is Troll ("the best WoW Classic Shaman race for PvE", [Wowhead overview](http://web.archive.org/web/20210518035051/https://classic.wowhead.com/guides/elemental-shaman-dps-classic-wow); Icy Veins the same) [C] for Berserking's 10–30%. Forever's Berserking is a flat 10% and Forever's Blood Fury adds 10% spell power, so on the default setup (20,000 fights, seed 1): Orc **336.34**, Tauren 336.35 (its +1% hit), Troll 334.35 (−0.59%), Windshaper Skyborne 333.17 (no racial cooldown), Dwarf 285.51 (Alliance gear, below). Orc is the class default, within D27's first pass of Tauren |
| Gear | Wowhead's Classic Elemental pre-raid BiS (snapshot 2021-05-16, Phase 5), in `scripts/scrape/pre-raid-bis.json` `shaman-elemental` ([D11](../decisions.md#d11-known-pre-raid-bis-items-are-always-in-the-pool-2026-09-22)): Spellweaver's Turban, Orb of the Darkmoon, Champion's Mail Pauldrons, Crystalline Threaded Cape, Bloodvine Vest, Rockfury Bracers, Blood Guard's Mail Vices, Ban'thok Sash, Bloodvine Leggings, Bloodvine Boots, Wrath of Cenarius, Elemental Focus Band, Draconic Infused Emblem, Royal Seal of Eldre'Thalas, Mindfang (Sageclaw, its Alliance twin from the client, for a Dwarf; [items.md](../data/items.md#faction-twins)), Therazane's Touch, Totem of the Storm. **The rings, trinkets and off hand are re-ranked by the sim** among the list's own items (DV2-4, 1.60.1.70009, paired in the default set, 20,000 fights on seed 2701), now that Wrath of Cenarius's and Draconic Infused Emblem's procs are modelled ([items.md](../data/items.md#modelled-item-effects)) and Spirit of Aquementas has only Classic Era stats: rings Wrath of Cenarius, Elemental Focus Band (ties it, −0.07), Rune Band of Wizardry (−0.6), Maiden's Circle; trinkets Draconic Infused Emblem (+14.4 over Eye of the Beast), Royal Seal of Eldre'Thalas (+6.0), Briarwood Reed (+4.5), Eye of the Beast (its use counts as zero, E7); off hand Therazane's Touch (+3.4 over the Scepter), Scepter of Interminable Focus, Spirit of Aquementas (−2.1). The default goes 381.7 → **401.1** DPS (Orc). **The guide's rank-1 belt, Sash of the Windreaver, is left out** as event-only (GV-6): The Windreaver is an Elemental Invasion boss, and every list leaves out an invasion boss's loot as it leaves out a raid drop ([items.md "Sources"](../data/items.md#sources-c)), so Ban'thok Sash moves up: 400.9 DPS (Orc), 387.5 (Dwarf). With every 1.60.1.70009 slice merged (the casters' shaman values among them), the defaults make **402.2** (Orc) and **388.9** (Dwarf) (20,000 fights on seed 2701) | [pre-raid BiS](http://web.archive.org/web/20210516060750/https://classic.wowhead.com/guides/wow-classic-elemental-shaman-dps-pre-raid-best-in-slot-gear) [C] |
| Relic | **Totem of the Storm** (23199): "Increases damage done by Chain Lightning and Lightning Bolt by up to 33" (28857, aura 112: a server-side class script) | read as 33 spell damage for those spells, so +23.56 to Lightning Bolt (× 0.714) and +18.84 to Chain Lightning [?] |
| Enchants | Greater Stats on the chest. The caster enchants (Spell Power on the weapon, Arcanum of Focus, Zandalar Signet of Mojo) aren't in the sim's enchant catalogue yet | [buffs §6.4](../mechanics/buffs-debuffs-consumables.md#64-enchant-defaults-by-spec) |
| Totems | Mana Spring (your own); the raid's others don't help a caster | [Totems](#totems) |
| Buffs | the Standard raid preset: Arcane Brilliance, Prayer of Spirit, Blessing of Wisdom, Blessing of Kings, Curse of the Elements (a warlock's; the casters' entry), Moonkin Aura (a druid's, +3% crit; the casters' entry, as Leader of the Pack is the melee's). No Windfury Totem, stones or other melee entries: you never swing, so the Buffs tab doesn't list them. **No world buffs** ([D8](../decisions.md#d8-world-buffs-are-excluded-2026-09-22)) | [buffs §6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset) |
| Consumables | Standard raid: Greater Arcane Elixir, Nightfin Soup (+22 spell damage), Brilliant Wizard Oil (+36 and +1% spell crit, on your main hand though you never swing it), Major Mana Potion: the caster food and oil came with the Protection paladin's threat fixes (T2), +9.6% DPS. Max adds Flask of Supreme Power and Demonic Rune | [buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset) |
| Rotation | [the priority list](#forever-priority-list-default-1) with its first-pass defaults | [Elemental first-pass defaults](#elemental-first-pass-defaults) |

### Elemental first-pass defaults

The Classic Era priority adapted to Forever, with one quick search, as
[D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24) asks:
20,000 fights on seed 1, the default setup (Orc, 180 s ± 10%, 20% execute), paired against the
defaults with `scripts/tune/rotation.mjs --spec shaman-elemental` (builds as `talents=<code>`).
Baseline **336.34 ± 0.22 DPS** (95% CI). Each row is the change from it:

| Candidate | Δ DPS | Δ % |
| --- | --- | --- |
| No rank 4 Lightning Bolt | −57.47 | −17.09% |
| Rank 10 from 5% / 20% / 50% / 100% mana | +0.76 / −1.11 / −6.72 / −23.98 | +0.23% / −0.33% / −2.00% / −7.13% |
| No Flame Shock | −13.10 | −3.89% |
| Lava Burst only with Flame Shock | +0.34 | +0.10% |
| No Lava Burst | −4.62 | −1.37% |
| Chain Lightning on cooldown / never | −17.02 / +1.31 | −5.06% / +0.39% |
| Earth Shock from 50% / 80% mana | −7.81 / −3.10 | −2.32% / −0.92% |
| Mana Tide at 1,160 / 4,500 missing / off | −3.71 / −0.36 / −6.74 | −1.10% / −0.11% / −2.00% |
| Potion at 1,750 / 3,000 missing | −0.31 / −1.86 | −0.09% / −0.55% |
| No racial cooldown | −3.40 | −1.01% |

- **Rank 10 from 10% mana.** 5% gains 0.23%, within D27's first pass; 10% keeps a reserve.
- **Chain Lightning with Clearcasting**, Classic Era's use: never gains 0.39%, within D27's first
  pass, so the common priority stays.
- **Mana Tide at 3,000 missing**: from 2,500 to 4,000 the result is flat (+1.03% to +1.05% over
  1,160, the most it restores), since it restores over 12 s while you keep casting.
- The first search, on Troll before the race comparison, picked the same settings (then 334.35).

### Elemental worked examples

Assumptions unless stated: level 60 vs a level-63 boss; spells land and never crit; no buffs;
**SP 400** for every school; the boss's average partial resist, **6%** (×0.94); the default
build's talents. Each runs through the engine in `src/sim/classes/shaman/elemental.test.ts`.

1. **Lightning Bolt r10**: (190.18–211.42 + 0.714 × 400) × 1.05 (Concussion) × 0.94 =
   **469.60–490.56, 480.08** on average; a crit ×2.0 (Elemental Fury) = 960.15. Cost 220 × 0.9 =
   **198**; cast 2,500 − 500 = **2,000 ms**, **1,818 ms** with Berserking (+10%). With Totem of the
   Storm, +33 × 0.714 = 23.56 on the base: 503.33.
2. **Lightning Bolt r4**: (55.22–62.78 + 285.6) × 1.05 × 0.94 = **336.39–343.85, 340.12**; 60 × 0.9
   = **54** mana; 2,000 ms.
3. **Chain Lightning** (one target): (119.37–133.03 + 0.571 × 400) × 1.05 × 0.94 = **343.25–356.73,
   349.99**; 485 × 0.9 = 436.5 → **436** mana; 2,000 − 500 = **1,500 ms**; 6 s cooldown.
4. **Flame Shock**: (166 + 0.214 × 400) × 1.15 (Call of Flame) × 0.94 = **271.98** at once, then
   (44 + 0.1 × 400) × 1.15 × 0.94 = **90.80** at 3, 6, 9 and 12 s (363.22); a tick's crit ×2.0 =
   181.61. 410 × 0.9 = **369** mana; the shocks' cooldown 6 − 0.8 = **5.2 s**.
5. **Lava Burst**: (192.14–247.86 + 285.6) × 1.15 × 0.94 = **516.44–576.67, 546.55**; with your
   Flame Shock on the boss ×1.2 = **655.86**, and Flame Shock stays. 265 × 0.9 = 238.5 → **238**
   mana; 2,000 ms; 10 s cooldown.
6. **Lightning Overload** (3/3): 10% of landed bolts cast a copy for half: **240.04** on average
   from rank 10, 170.06 from rank 4, 175.00 from Chain Lightning; the copy costs nothing, makes no
   threat and triggers nothing.
7. **Clearcasting**: 10% of landed Fire, Frost and Nature spells; the next spell costs nothing and
   starts no five-second rule, and Chain Lightning with Clearcasting waits for it.
8. **Mana** (the default setup: 4,975 mana, Spirit 188, mp5 61): **52.6 + 24.4 = 77.0** a tick
   outside the five-second rule, **26.3 + 24.4 = 50.7** inside it (Mindfulness 3/3). Mana Tide restores **1,160**
   (4 × 290, from 3 s after it drops), once a 3-minute fight, at 3,000 missing: 1,975 mana or less.
9. **Downranking** with rank 10 from 10% (497.5 mana): rank 10 at 497.5 or more, rank 4 below;
   rank 10 with Clearcasting at any mana.
10. **Flame Shock kept up**: cast at 0, it ticks at 3, 6, 9 and 12 s; it's recast at the first free
    moment after its last tick, 13.5 s when a Lightning Bolt was cast from 11.5 s.

### Elemental open questions

Each with its effect on the default setup's DPS, per
[D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23).

- **E1: a downranking penalty.** The client gives rank 4 Lightning Bolt rank 10's 0.714; Classic Era
  penalized only spells below level 20. *Test:* rank 4's damage at a known spell damage against a
  dummy (100 casts). *Effect:* rank 4 is about a third of the casts; a TBC-style penalty
  ((20 + 11) / 60 of the coefficient) would cost about 10%.
- **E2: Elemental Focus's trigger.** "After casting": the sim rolls it on a landed spell, not a
  missed one. *Effect:* under 0.1%.
- **E3: Lightning Overload.** The sim rolls it on a landed Lightning Bolt or Chain Lightning; the
  copy rolls its own hit and crit, gets the same talents and triggers nothing (no Clearcasting,
  no Elemental Devastation). *Test:* the combat log's overloads against landed bolts over 300
  casts. *Effect:* the copies are about 5% of the damage.
- **E4: Totem of the Storm's 33.** A server-side script: the sim reads it as 33 spell damage (×
  the coefficient); as 33 flat it would be worth 40% more. *Effect:* ±0.3%.
- **E5: Mana Tide's ticks.** 4 of 290 from 3 s after it drops, for the tooltip's 12 s (the spell
  lasts 13 s). *Effect:* a fifth tick would be +290 mana a fight, about +0.3%.
- **E6: Blood Fury's spell power** is a live +10% on spell damage while it's up, unrounded [?]
  (until issue #10 it was a flat 10% of the sheet's Nature spell damage at the pull; the default
  moved 368.76 → 368.72, within its ± 0.23). *Effect:* under 0.1%.
- **E7: Eye of the Beast's use** (+7% spell hit for 20 s, 5 min) isn't simulated. *Effect:* one use
  a 3-minute fight, about +0.6%.
- **E8: Alliance gear.** The list's honor mail is Horde's, and the client has no Alliance twin a shaman
  can wear ([items.md](../data/items.md#faction-twins): the Alliance's honor chain is the hunter's), so a
  Dwarf takes the next rank. Its Arathi Basin weapons have twins, Sageclaw and the League of Arathor's
  Ironbark Staff. A Dwarf's default measures **388.9** DPS against an Orc's 402.2, **−3.3%** (20,000
  fights on seed 2701, 1.60.1.70009 with every slice merged; 387.5 and 400.9 before the casters' slice, GV-8): the next-rank mail and the race together. *Effect:* Alliance only.
- **E9: the caster enchants** (Spell Power on the weapon, Arcanum of Focus) are in the catalogue
  (the warlock's slice) but not the Elemental defaults yet, and Zandalar Signet of Mojo waits on
  Zandalar: about 50 spell damage, roughly +5%. The caster food and oil (Nightfin Soup, Brilliant
  Wizard Oil) are in the Standard raid since T2.
- **E10: the core's [?]s** apply as spells.md has them: the level-based resistance (OQ-S2), DoT
  crits (OQ-S4), the GCD under casting speed (OQ-S7) and the partial resist on each tick (OQ-S3).

[f915]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=915
[f10605]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10605
[f1238300]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1238300

### Enhancement on the core

K5 turns on the two switches the caster core left off for the Enhancement shaman
([milestones' known gaps](../milestones.md#known-gaps-and-follow-ups)):

- **Its Lightning Bolt is hasted**: casting speed (Berserking) shortens a cast bolt (fewer than 5
  Maelstrom Weapon stacks). Rage of the Farseer's +30% casting speed (aura 65) did the same until
  1.60.1.70009 removed it.
- **Nature-, Frost- and Fire-only spell damage on gear counts** for the spells of that school.
- **Totem of the Storm** gives its 33 to the Enhancement shaman's Lightning Bolt too.

A correction, measured against the S1 engine (20,000 fights, seed 1): the default setup is
**unchanged** (every golden too: the default bolt is instant, and no default item has a
Nature- or Frost-only line); Lightning Bolt at 3 stacks gains **+1.23 DPS (+0.24%)**, at 4 stacks
on a Troll +0.31 (+0.06%).

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
   casting speed (Berserking's +10%) shortens a cast bolt after the stacks' cut (since K5).
6. **Undead shamans.** Blizzard's 2026-09-22 article lists them; the 1.60.1.69913 and 1.60.1.70009
   clients have no row.
   *Test:* the character creation screen on a later build. *Effect:* none on the default (Orc); the
   race would need its placeholder row.
7. **Base stats** ([Base stats](#base-stats)): the attributes, health, attack power and crits are D24
   placeholders. The base spell crit sources conflict: 2.3% (wowsims/classic) or −0.7% (RatingBuster).
   *Test:* a naked level-60 shaman's character sheet per race (the sheet shows spell crit). *Effect:*
   −0.7% instead of 2.3% is −0.49%; the attributes under ±0.5%.
8. **Earth Shock's extra threat**: whether it still carries the extra threat Classic Era shaman
   tanks relied on is unknown, and none is simulated. *Test:* a threat meter on a single Earth Shock. *Effect:* none on DPS; TPS only.
9. **Resolved in K5: Nature-only and Frost-only spell damage on gear** counts for its school's
   spells, on the caster core ([Spell damage](#spell-damage)).
10. **Rockbiter Weapon's value** in Forever: 653 AP from 16313's rows (554 + 16.5 a level). *Test:*
    the character sheet's attack power with and without it. *Effect:* only when chosen (it's 6.6%
    behind Windfury Weapon).
11. **Blackhand's Breadth's on-use** (+5% crit against the target for 20 s, 5 min) isn't simulated.
    *Effect:* one use a 3-minute fight, about +0.4%.
12. **Totem recasts** in fights over 5 minutes aren't simulated (a GCD and mana a totem).
    *Effect:* none at the default 180 s.
13. **Blood Fury's +10% spell power**: simulated since issue #10, as every caster's (Enhancement
    556.06 → 556.16 on its golden seed). Whether it rounds is [?]. *Effect:* under 0.05%.
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
| [WoW Forever Beta Development Notes, updated September 24][dev-70009] (Blizzard, 2026-09-24), the 1.60.1.70009 build's | Rage of the Farseer's casting speed removed; Lightning Bolt ranks 3–4 and Lava Burst ranks 1–2 raised; Windfury, Grace of Air and Tranquil Air don't stack across shamans; Elemental Fury and Elemental Alacrity swapped | Forever [F] |
| [Blizzard: Create the hero you want to be (2026-09-22)](https://news.blizzard.com/en-us/article/24304075/create-the-hero-you-want-to-be-in-world-of-warcraft-forever) | race and class combinations, Undead shamans | Forever (announcement) |
| [Warcraft Tavern: Forever Shaman guide](https://www.warcrafttavern.com/forever/guides/shaman/) | Stormstrike's 8 s, Maelstrom Weapon's instant free bolt, two-handers without talents, Orc for Horde | Forever (community guide) [?] |
| [Wowhead Classic: Enhancement rotation](http://web.archive.org/web/20210517045123/https://classic.wowhead.com/guides/enhancement-shaman-dps-rotation-abilities-classic-wow), [talents](http://web.archive.org/web/20210516030639/https://classic.wowhead.com/guides/enhancement-shaman-dps-talents-builds-classic-wow), [weapons](http://web.archive.org/web/20210516003347/https://classic.wowhead.com/guides/wow-classic-best-shaman-weapons), [overview](http://web.archive.org/web/20210516004127/https://classic.wowhead.com/guides/enhancement-shaman-dps-classic-wow), [pre-raid BiS](http://web.archive.org/web/20210515151721/https://classic.wowhead.com/guides/wow-classic-enhancement-shaman-dps-pre-raid-best-in-slot-gear), [consumables](http://web.archive.org/web/20210515152931/https://classic.wowhead.com/guides/enhancement-shaman-dps-consumables-classic-wow) (Wayback, 2021) | the Classic Era priority, build, race, weapon, gear and consumables | Classic Era [C] |
| [Icy Veins Classic: rotation](http://web.archive.org/web/20210508050234/https://www.icy-veins.com/wow-classic/enhancement-shaman-dps-pve-rotation-cooldowns-abilities), [spell summary](http://web.archive.org/web/20210419094508/https://www.icy-veins.com/wow-classic/enhancement-shaman-dps-pve-spell-summary) (Wayback, 2021) | Stormstrike on cooldown, Frost Shock, Windfury Weapon, Lightning Bolt out of range only | Classic Era [C] |
| [Warcraft Tavern: Classic PvE Enhancement](https://www.warcrafttavern.com/wow-classic/guides/pve-enhancement-shaman/) (Wayback 2021-04-16) | "Totems > Stormstrike > Flame Shock > Frost / Earth Shock" | Classic Era [C] |
| [Wowhead Classic: Elemental rotation](http://web.archive.org/web/20210513041129/https://classic.wowhead.com/guides/elemental-shaman-dps-rotation-abilities-classic-wow), [talents](http://web.archive.org/web/20210516151409/https://classic.wowhead.com/guides/elemental-shaman-dps-talents-builds-classic-wow), [overview](http://web.archive.org/web/20210518035051/https://classic.wowhead.com/guides/elemental-shaman-dps-classic-wow), [pre-raid BiS](http://web.archive.org/web/20210516060750/https://classic.wowhead.com/guides/wow-classic-elemental-shaman-dps-pre-raid-best-in-slot-gear), [consumables](http://web.archive.org/web/20210517033500/https://classic.wowhead.com/guides/elemental-shaman-dps-consumables-classic-wow) (Wayback, 2021) | the Classic Era Elemental priority (rank 4 Lightning Bolt, Chain Lightning with Clearcasting), build (31/0/20), race (Troll), gear and consumables | Classic Era [C] |
| [Icy Veins Classic: Elemental rotation](http://web.archive.org/web/20210508032115/https://www.icy-veins.com/wow-classic/elemental-shaman-dps-pve-rotation-cooldowns-abilities) (Wayback, 2021) | Lightning Bolt ranks 4 and 10, Chain Lightning on Elemental Focus's procs | Classic Era [C] |
| [mangos player_levelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql), [player_classlevelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql) | the D24 attribute and health placeholders | **Forbidden** as evidence (an emulator); placeholders only, under D24 |
| [wowsims/classic base_stats.go](https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go), [RatingBuster d11164cf](https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua) | base attack power, crit and spell crit placeholders | secondary (mixed lineage) [?] |

[dev-70009]: https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-updated-september-24/2360696

### DB2 links (per spell)

Browse links to the same rows on wago.tools' table pages, for reading by hand; the pages stay
off-limits to scripts ([D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)).

[f17364]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=17364
[f15208]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=15208
[f10414]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10414
[f10473]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10473
[f29228]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=29228

- Stormstrike [f17364]; Lightning Bolt [f15208] (rank 4 [f915]); Earth Shock [f10414]; Frost Shock
  [f10473]; Flame Shock [f29228]; Chain Lightning [f10605]; Lava Burst [f1238300]. The same
  `filter[SpellID]` works on SpellAuraOptions, SpellMisc, SpellCategories, SpellCooldowns, SpellPower
  and SpellLevels, and for the other spell ids above (16362, 439431, 16361, 16316, 16313, 425336,
  408498, 408505, 16256, 16257, 30160, 30165, 1223031, 1238931, 27859; Elemental's 16164, 16246,
  408438, 16038, 16089, 16120, 16578, 408490, 1223033, 16190, 17359, 28857, 20572, 20554). The
  client scraper extracts the triggered ones through these markers: spell 439431, spell 16361,
  spell 16313, spell 408505, spell 16257, spell 30165, spell 1238931, spell 16246.
