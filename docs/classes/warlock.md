# Warlock: Destruction, Affliction

WoW Forever rebuilds the warlock more than any class so far. Every damage spell's base damage is
about half of Classic Era's (Shadow Bolt 253–283 against 482–538) with the same or higher
coefficients, so spell damage carries more of each hit. **Curse of Agony and Curse of Doom become
Banes**, a slot beside your curse, and **Curse of Shadow is gone** into a Curse of the Elements that
covers every magic school. The DoTs **crit** (the periodic-crit flag). **Demonic Sacrifice swaps its
schools**: the Imp now gives +15% Shadow and the Succubus +15% Fire. The trees are new Trait trees:
**Incinerate**, **Shadow and Flame** (Conflagrate stops consuming Immolate), **Malediction**,
**Pandemic**, **Malevolence**, **Wrack**, and a Suppression that is 5% hit for every spell. Dark Pact
is gone. This doc reads every value from the Forever client, compares it with Classic Era's, and
gives Destruction's and Affliction's first-pass rotations and defaults under
[D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24).
Demonology waits for the pet core.

Status: researched and built 2026-09-24 (slice K3) · Destruction and Affliction shipped
([§6](#6-rotation-and-priority)) · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified

Forever client build `1.60.1.69913`, Classic Era client build `1.15.9.69722`. Source links use short
labels, resolved under [Sources](#sources).

> **Client data.** Values tagged **[F] [client] (Table, 1.60.1.69913)** come from the raw Forever
> client files, read through the wago.tools API by `scripts/scrape/*.mjs`, and are in
> `src/data/spells/warlock.json`, `src/data/talents/warlock.json` and `src/data/client/*.json`;
> `src/sim/classes/warlock/warlock.test.ts` checks the engine's rows against them. The rendered
> tooltips confirm the halved base damage ([spells OQ-S8](../mechanics/spells.md#open-questions)).
> Raw files lack server scripts: what a dummy effect does and proc rates stay server-side.

---

## Contents

1. [What the sim needs](#what-the-sim-needs)
2. [WoW Forever changes](#1-wow-forever-changes)
3. [Resources](#2-resources)
4. [Abilities](#3-abilities)
5. [Talents](#4-talents)
6. [Mana](#5-mana)
7. [Rotation and priority](#6-rotation-and-priority)
8. [Sensible defaults](#7-sensible-defaults)
9. [Implementation notes](#8-implementation-notes)
10. [Open questions](#9-open-questions)
11. [Worked examples](#10-worked-examples)

---

## What the sim needs

- The spells on the caster core ([spells.md](../mechanics/spells.md)): Shadow Bolt, Immolate,
  Conflagrate, Incinerate, Shadowburn, Corruption, the Banes and Siphon Life, with the Forever client's
  base damage, coefficients, costs and cast times, and the periodic-crit flag on the DoTs.
- Mana, Life Tap (mana for health), and Demonic Sacrifice's buff with no pet.
- Curse of the Elements as your own debuff, Improved Shadow Bolt's Shadow Vulnerability, Nightfall's
  Shadow Trance, Conflagrate consuming Immolate, and Shadow and Flame's buffs.

## 1. WoW Forever changes

### 1.1 Spells (level 60)

Top ranks, before spell damage, from the rendered tooltips and SpellEffect [F] [C] [client]
(SpellEffect, SpellPower, SpellMisc, SpellCastTimes, both builds):

| Spell (rank, id) | Forever | Classic Era | Coefficient F / C |
| --- | --- | --- | --- |
| Shadow Bolt (10, 25307) | 253–283, 3 s, 380 mana | 482–538 | 0.857 / 0.857 |
| Immolate (8, 25309) | 158, then 55 × 5 (3 s), 2 s, 380 mana | 279, then 102 × 5 | 0.2 + 0.13 a tick, both |
| Conflagrate (6, 18932) | 251–313, 10 s cooldown, 255 mana | 18932 is rank 4: 447–557 | 0.429 / 0.429 |
| Incinerate (3, 1293813) | 201–233, +25% on your Immolate, 2.5 s, 325 mana | none (new) | 0.714 |
| Shadowburn (6, 18871) | 258–288, 15 s cooldown, 365 mana | 462–514 | 0.429 / 0.429 |
| Corruption (7, 25311) | 73 × 6 (3 s), 2 s, 340 mana | 137 × 6 | 0.2 / 0.167 a tick |
| Bane of Agony (6, 11713) | 46 × 12 (2 s), 552 in all, 215 mana | Curse of Agony: 87 × 12 | 0.133 / 0.083 a tick |
| Bane of Doom (603) | 1742 after 60 s, 1 min cooldown, 300 mana | Curse of Doom: 3200 | **4.0** / 1.0 |
| Siphon Life (4, 18881) | 41 × 10 (3 s), 365 mana, no periodic crits | 45 × 10 | 0.05 / 0.05 |
| Curse of the Elements (4, 1311680, new at 50) | +10% damage taken from every magic school, Holy included; 5 min; 200 mana | rank 3: Fire and Frost | — |
| Life Tap (6, 11689) | 424 mana **plus your Spirit**, for 424 health | 424 mana | — |

**Periodic crits:** Corruption, Immolate, the Banes and Wrack carry the periodic-crit flag (SpellMisc
Attributes[8] 0x200); Siphon Life doesn't, and Classic Era's don't [F] [C] [client] (SpellMisc).
**Banes:** "Only one Bane per Warlock can be active on any one target", beside "Only one Curse per
Warlock", so Bane of Agony and Curse of the Elements are both up in Forever [F] (tooltips). Curse of
Shadow, Curse of Agony and Curse of Doom are gone from the spellbook, and so are Dark Pact and the
conjured-stone ranks the book lists as not in Forever (`src/data/spells/warlock.json` `missing`).

### 1.2 Talents

New Trait trees [F] [client] (Trait tables, 1.60.1.69913; `src/data/talents/warlock.json`):
Affliction adds Malediction (+5% periodic damage), Pandemic (+100% crit bonus for the DoTs),
Malevolence (+5% Shadow crit), Soul Siphon, Soul Harvesting, Improved Drains and Wrack; Suppression
is +5% hit with every spell (Classic Era: −10% Affliction resists). Destruction adds Molten Skin,
Agonizing Flames (+10% to every Destruction spell), Bane of Havoc, Fire and Brimstone, Shadow and
Flame and Incinerate; Improved Shadow Bolt's debuff is the warlock's own with no charges; Aftermath
is +50% to Immolate's hit. Demonology adds Demonic Aegis, Demonic Energies, Decimation, Demonic
Brand, Improved Felhunter, Demonic Knowledge and Demonic Pact; Master Demonologist and Soul Link need
the pet, and Demonic Sacrifice lasts 2 hours with swapped schools (§3.4).

## 2. Resources

Mana only (§5). The warlock pays for a spell with a cast time as it lands (the caster core's rule,
[spells §4](../mechanics/spells.md#4-cast-times-casting-speed-and-the-gcd)), and its GCD is 1.5 s.

## 3. Abilities

### 3.1 Destruction

- **Shadow Bolt**, **Immolate**, **Conflagrate**, **Incinerate** and **Shadowburn** as §1.1, Shadow or
  Fire, on the spell table ([spells §1](../mechanics/spells.md#1-spell-hit)).
- **Conflagrate** needs your Immolate on the boss (`targetAuraSpell` 1282590, a hidden Immolate aura)
  and consumes it when it lands, unless Shadow and Flame keeps it (20% a rank, so always at 5/5) [F].
  A miss leaves Immolate [?].
- **Incinerate** deals 25% more to a target with your Immolate (#1, a dummy of 25; its tooltip) [F],
  and doesn't use Immolate up. The sim multiplies the rest of its damage by it [?] (Q3).
- **Shadowburn** costs a Soul Shard in game; the sim doesn't track shards (Q6), and Shadow and Flame
  at 5/5 refunds it anyway.

### 3.2 Affliction

- **Corruption** (instant with Improved Corruption 5/5), **Bane of Agony**, **Bane of Doom** and
  **Siphon Life** as §1.1, pure DoTs: they roll hit as they land and never miss after
  ([spells §7](../mechanics/spells.md#7-dots)).
- **Bane of Agony** ramps in game, weak ticks first; the client row is the average, which the sim
  deals every tick [?] (Q4). **Bane of Doom** is one tick 60 s after it lands, at coefficient 4 [F];
  one Bane at a time, so a rotation casts one or the other.
- **Siphon Life** heals you; the healing isn't simulated.

### 3.3 Curses, Life Tap and buffs

- **Curse of the Elements** (1311680) is your own debuff here: the rotation keeps it up, and the Buffs
  tab's entry (another warlock's) is left out while it does (SpecMeta `ownBuffs`). Its −75 resistance
  changes nothing on a boss ([spells §3](../mechanics/spells.md#3-resistances)). It rolls spell hit;
  a curse's resist isn't rolled apart [?] (Q7).
- **Life Tap** (11689) gives `(424 + Spirit) × (1 + Improved Life Tap)` mana, its tooltip's
  `${($m1+$SPI*1)*(1+$18182m1/100)}` [F]. The sim reads Spirit from the sheet at the pull. Its health
  cost and the threat of its mana aren't simulated; it's on the GCD and costs no mana, so it starts no
  five-second rule.
- **Racial cooldowns:** Forever's Blood Fury (Orc, 20572) is +10% attack power **and spell power** for
  15 s (aura 317) [F], and Berserking (Troll, 20554) +10% casting and attack speed for 10 s [F]. The
  rotation presses them on cooldown.

### 3.4 Demonic Sacrifice

Demonic Sacrifice (18788) gives up your demon for a 2 h buff [F] [client] (SpellEffect, SpellDuration):

| Demon | Forever | Classic Era |
| --- | --- | --- |
| Imp | Burning Shadow (18789): +15% Shadow damage | +15% Fire |
| Succubus / Incubus | Touch of Fire (18791): +15% Fire damage | +15% Shadow |
| Voidwalker | Fel Energy (18792): 2% of maximum mana every 4 s | 3% health every 4 s |
| Felhunter | Fel Stamina (18790): 3% of maximum health every 4 s | 2% mana every 4 s |

The sim casts it 3 s before the pull, with no pet: the pet core comes later. Without the talent, or
with "None", no pet is simulated either (Q12).

## 4. Talents

Each talent's value per rank is its Trait curve (TraitDefinitionEffectPoints) [F] [client]; the
spells it names come from its class mask (§8). Different talents' percentages on one spell multiply
[?] (Q10), as the druid's do.

### 4.1 Destruction

| Talent | Per rank | In the sim |
| --- | --- | --- |
| Improved Shadow Bolt (17793) | +4% Shadow damage taken from you, 12 s, after a Shadow Bolt crit | Shadow Vulnerability (17794, aura 270), the boss's; read at each hit and tick |
| Bane (17788) | −0.1 s cast (Shadow Bolt, Immolate, Incinerate), −0.4 s Soul Fire | cast times |
| Cataclysm (17778) | −3/6/10% mana cost of Destruction spells | Shadow Bolt, Immolate, Conflagrate, Incinerate, Shadowburn; rounded down [?] |
| Aftermath (18119) | +10% Immolate's hit | Immolate's direct part only |
| Ruin (17959) | +20% crit bonus (×2.0 at 5/5) | the same five spells, Immolate's ticks too |
| Agonizing Flames (17927) | +3/7/10% damage of Destruction spells | the five spells' hits and Immolate's ticks |
| Fire and Brimstone (412751) | +8/17/25% Conflagrate crit | Conflagrate |
| Shadow and Flame (426316) | Conflagrate: +2% Shadow damage for 20 s; Shadowburn: +2% Fire for 20 s; 20% not to consume Immolate | auras (1293816 for Shadow); Q8 |
| Conflagrate, Shadowburn, Incinerate | the spells of §3.1 | |

### 4.2 Affliction

| Talent | Per rank | In the sim |
| --- | --- | --- |
| Improved Life Tap (18182) | +10% Life Tap mana | Life Tap |
| Suppression (18174) | +1% hit (spells and attacks), −4% threat | spell hit |
| Improved Corruption (17810) | −0.4 s cast, +2% damage | Corruption |
| Malediction (1225177) | +1% periodic damage | Corruption, Immolate's ticks, the Banes, Siphon Life |
| Improved Bane of Agony (18827) | +5% | Bane of Agony |
| Pandemic (427712) | +33/67/100% crit bonus | Corruption, the Banes, Siphon Life (×2.0 at 3/3) |
| Malevolence (1310949) | +1% crit, Shadow spells | Shadow Bolt, Shadowburn, Corruption, the Banes, Siphon Life |
| Nightfall (18094) | 2% a Corruption tick for Shadow Trance | Shadow Trance (17941): the next Shadow Bolt instant, 10 s |
| Shadow Mastery (18271) | +1% Shadow damage (#0 hits, #1 DoTs) | Shadow Bolt, Shadowburn, Corruption, the Banes, Siphon Life |
| Siphon Life, Wrack | spells | Wrack isn't cast (a 6 s channel: Q13) |

### 4.3 Demonology

Fel Vitality (18731) is +5% maximum mana a rank (#1, aura 178) [F]; Demonic Embrace +3% Stamina a
rank, as its tooltip reads (Q9); Demonic Sacrifice §3.4. The pet talents do nothing without a pet.

## 5. Mana

The caster core's pool ([spells §8](../mechanics/spells.md#8-mana)): full at the pull, 1,373 base
mana [F] (PlayerExpectedStat), and each 2 s tick **8 + Spirit / 4** outside the five-second rule [C],
plus mp5 always. Mana comes back from Life Tap, the Major Mana Potion and Demonic Rune when the Buffs
tab has them, and the Voidwalker's Fel Energy. The results show it per fight.

## 6. Rotation and priority

The Classic Era raid warlock spammed Shadow Bolt after its assigned curse, with Corruption only when
debuff slots allowed and Life Tap to refill ([wh-rotation]; [wt-warlock]); its raid build sacrificed
the Succubus for +15% Shadow ([wh-talents]), and it called Conflagrate "not a viable talent for
Classic WoW raiding" ([wh-talents]). Forever's trees change the answer: Shadow and Flame keeps
Immolate up for Conflagrate, Incinerate is a Fire filler with a Forever-only boost, the Succubus now
gives Fire, and the Banes sit beside the curse. The priorities below are that common priority
adapted, and §6.3's search picks the biggest settings.

### 6.1 Destruction (shipped)

1. Demonic Sacrifice before the pull (the Succubus by default).
2. Off the GCD: the racial cooldown, Power Infusion (if Buffs has it), then the Major Mana Potion and
   Demonic Rune once their most fits.
3. Curse of the Elements, recast when it's down.
4. Immolate, recast as it runs out (from its cast time before its end).
5. Conflagrate on cooldown, while Immolate is up.
6. Shadowburn on cooldown.
7. Corruption, recast as it runs out (a 2 s cast without Improved Corruption).
8. Your Bane, as Affliction's (§6.2): **Bane of Doom** by default, then Bane of Agony for the last
   minute; or Bane of Agony kept up, or none. Bane of Doom is baseline, so Destruction has it too.
9. Life Tap at or below 5% mana.
10. The filler: **Incinerate** by default, or Shadow Bolt (whose crits put Improved Shadow Bolt up).
11. Life Tap whenever the filler can't be paid for.

### 6.2 Affliction (shipped)

1. Demonic Sacrifice before the pull (the Imp, +15% Shadow).
2. The same off-GCD line.
3. Curse of the Elements.
4. Corruption, recast as it runs out.
5. Your Bane: **Bane of Doom** by default, cast while at least 61 s are left, then Bane of Agony for
   the last minute once the last Doom has landed; or Bane of Agony kept up.
6. Siphon Life, recast as it runs out.
7. An instant Shadow Bolt on Shadow Trance.
8. Life Tap at or below 10% mana; Shadow Bolt; Life Tap when Shadow Bolt can't be paid for.

Dark Pact isn't in Forever, so Life Tap is the mana ability.

### 6.3 First-pass defaults (D27)

One search over the biggest settings, 20,000 fights on seed 2701 each, the default setup otherwise
(Orc, the pre-raid list, the Standard raid buffs). DPS ± the 95% interval:

| Destruction (with the Imp, Shadow Bolt, no Shadowburn: the Classic priority) | DPS |
| --- | --- |
| Imp, Shadow Bolt, Shadowburn off / on | 358.2 / 368.1 |
| Imp, Incinerate, off / on | 314.0 / 346.3 |
| Succubus, Shadow Bolt, off / on | 342.0 / 353.0 |
| **Succubus, Incinerate, Shadowburn on** | **386.5** ±0.2 |
| Immolate off (Imp, Shadow Bolt) | 322.8 |
| Life Tap at 0 / 5 / 10 / 20% (Succubus, Incinerate, Shadowburn) | 387.1 / 387.1 / 386.5 / 384.3 |
| The Fire build: Aftermath 5/5 in place of Improved Shadow Bolt | 397.8 ±0.3 |

The Fire build then adds Corruption and a Bane (rerun in the K3 review, WL1, on the same seed; with no
Bane and no Corruption it gives 398.1 there):

| Destruction, the Fire build: Bane, Corruption off / on | DPS |
| --- | --- |
| No Bane | 398.1 / 406.1 |
| Bane of Agony | 425.7 / 431.5 |
| **Bane of Doom**, then Agony for the last minute | 441.9 / **447.6** ±0.3 |
| Corruption and Doom ahead of Conflagrate / ahead of Immolate (instead of after Shadowburn) | 446.7 / 445.4 |
| Life Tap at 0 / 5 / 10 / 20% (Corruption and Doom) | 447.0 / 447.6 / 448.0 / 447.0 |
| Shadow Bolt filler / the Imp / Shadowburn off (Corruption and Doom) | 415.4 / 430.3 / 427.3 |

So Destruction defaults to Fire: the Succubus, Incinerate, Shadowburn on, Corruption and Bane of Doom
after Shadowburn, Life Tap at 5% (10% is within the interval), and the Fire build (§7.1), 25% above
the Classic priority. Shadow Bolt stays a choice.

| Affliction | DPS |
| --- | --- |
| Bane of Agony, Siphon Life on / off | 393.4 / 387.1 |
| **Bane of Doom**, Siphon Life on / off | **402.0** ±0.3 / 396.8 |
| No Bane | 333.1 |
| Voidwalker instead of the Imp | 355.2 |
| Life Tap at 0 / 5 / 10 / 20 / 30% | 392.8 / 392.8 / 393.4 / 392.1 / 390.3 |

So Affliction defaults to Bane of Doom (its coefficient 4 makes it worth more than Agony's 12 ticks),
Siphon Life on, the Imp and Life Tap at 10%. Keeping Immolate up too would add about 2.2% (410.8
against 402.1 in the K3 review's probe, 6,000 fights); its rotation has no Immolate yet, left for the
tuning milestone.

## 7. Sensible defaults

### 7.1 Talents

- **Destruction 7/11/33, Fire** (`25-0050203001-0050355103101351`): Improved Life Tap 2, Suppression 5;
  Demonic Embrace 5, Demonic Aegis 2, Fel Vitality 3, Demonic Sacrifice; Bane 5, Cataclysm 3,
  Aftermath 5, Ruin 5, Shadowburn, Agonizing Flames 3, Conflagrate, Bane of Havoc, Fire and
  Brimstone 3, Shadow and Flame 5, Incinerate. The Demonology points reach Demonic Sacrifice; the
  pet-only talents on the way do nothing. A Shadow Bolt build moves Aftermath's 5 into Improved Shadow
  Bolt.
- **Affliction 35/11/5** (`2555002003520105-0050203001-005`): Improved Life Tap 2, Suppression 5,
  Improved Corruption 5, Malediction 5, Improved Bane of Agony 2, Pandemic 3, Malevolence 5,
  Nightfall 2, Siphon Life, Shadow Mastery 5; the same 11 in Demonology; Bane 5.

### 7.2 Race

**Orc** by default: Forever's Blood Fury adds 10% spell power for 15 s every 2 min. Troll's Berserking
(+10% casting speed for 10 s every 3 min) is next; Gnome's Forever Expansive Mind is +5% maximum mana
for a warlock [F] (20591, aura 178), and its Eureka! isn't simulated. Human and Undead have no racial
that adds damage. Classic Era had no Troll warlock; Forever does (CharBaseInfo) [F].

### 7.3 Gear

Cloth; daggers and swords, staves, wands and an item held in the off hand [C]. The pre-raid list is
Wowhead's Classic warlock guide as archived on 2021-05-18 ([wh-bis]; `scripts/scrape/pre-raid-bis.json`),
one list for both specs; its random-suffix "of Shadow Wrath" items are left out, since the item pool
has only their base items. A caster doesn't swing its weapon: its stats count, its procs don't.

### 7.4 Enchants and consumables

Arcanum of Focus (+8 spell damage) on head and legs, Greater Stats on the chest, Minor Haste gloves
(Forever's +1% casting speed) and Spell Power (+30) on the weapon; nothing else in the catalogue helps
a caster yet. Standard raid: Greater Arcane Elixir, Elixir of Shadow Power (+40 Shadow), the Major
Mana Potion; Max adds Flask of Supreme Power and a Demonic Rune
([buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset)).

### 7.5 Buffs

The casters' Buffs entries (Arcane Brilliance, Prayer of Spirit, Blessing of Wisdom, Mana Spring,
Moonkin Aura, Power Infusion) reach the warlock; Curse of the Elements is its own (§3.3).

### 7.6 Base values

Every warlock base value nobody has measured is a D24 placeholder, flagged [?] in the results: the
attribute rows (Human 45/50/65/110/115, Orc 48/47/66/107/118, Undead 44/48/66/108/120, Gnome
40/53/64/113/115, Troll 46/52/66/106/116: the mangos emulator's 1.12 rows, stored before racials,
and the class row plus the [C] Troll offset), base health 1,414, attack power −10, base spell crit
1.7% (wowsims/classic; RatingBuster's pre-SoD table reads −0.3%, so the sources conflict), melee
crit and dodge 2% ([mangos-stats], [ws-base], [rb]). Base mana 1,373, 60.6 Intellect per 1% spell
crit and 20 Agility per 1% crit are [F] (PlayerExpectedStat).

## 8. Implementation notes

- **Rows.** `src/sim/classes/warlock/abilities.ts` writes each spell out from the client, and
  `talents.ts` applies the talents: which spells each names follows its class mask (SpellClassOptions:
  Shadow Bolt 1, Corruption 2, Immolate 4, Shadowburn 128, Conflagrate 512, Bane of Agony 1024,
  Incinerate [0, 64], Siphon Life [0, 1], Bane of Doom [0, 2]).
- **The engine's additions**, each optional, so a plan without them is unchanged bit for bit:
  a DoT's own multiplier (`SpellDef.dotDamageMult`: Aftermath's hit-only bonus, Malediction's
  ticks-only one), a boost that keeps its aura (`boost.keep`: Incinerate on Immolate), an ability
  that needs an aura up (`needsAura`, a condition put first on its lines: Conflagrate) and one that ends
  another spell's DoT when it lands (`consumesDot`, `consumeChance`: Conflagrate and Shadow and
  Flame), gains that make no threat (`noThreat`: Life Tap, Fel Energy), a spell damage % aura
  (`spellDamagePct`: Blood Fury) and a maximum-mana % (`StatBlock.manaMult`: Fel Vitality, Expansive
  Mind).
- **Shadow Trance** is Maelstrom Weapon's mechanism: an aura whose one stack cuts Shadow Bolt's cast
  by 100% and is spent when it's used.
- **Demonic Sacrifice** is a pre-pull cast whose aura lasts 2 h; the Voidwalker's is ticks of mana.
- **No melee:** a caster spec's plan has no weapons (`SpecMeta.caster`).

## 9. Open questions

Each with its estimated effect on DPS, per [D24](../decisions.md).

- **Q1 Base damage.** Confirmed: the tooltips render the halved base damage (spells OQ-S8).
- **Q2 Bane of Doom's coefficient 4** (Classic Era's 1): is it what the server uses? Effect: Doom
  would lose about 1,000 damage a minute at 1, and Agony would win (§6.3).
- **Q3 Incinerate's +25%**: on the whole hit, spell damage included, as the sim has it? Effect: up
  to 8% of Incinerate's damage.
- **Q4 Bane of Agony's ramp**: the average each tick changes only a Bane the fight ends; under 0.5%.
- **Q5 Nightfall**: 4% a Corruption tick, as Classic Era; server-side. Effect: about 1% of
  Affliction's DPS per point.
- **Q6 Soul Shards** aren't tracked: Shadowburn is used on cooldown. Without Shadow and Flame 5/5,
  shards run out in a long fight.
- **Q7 Curse resists**: Curse of the Elements rolls only spell hit. Under 0.2%.
- **Q8 Shadow and Flame's Fire buff**: its spell isn't in the client files; the tooltip's +10% Fire
  for 20 s is used. Its first effect (4 a rank) is unexplained.
- **Q9 Demonic Embrace's −1% Spirit** (a client effect the tooltip doesn't show) isn't applied.
  Under 0.1% through Life Tap.
- **Q10 Talent stacking**: multiplicative, not additive; under 1%.
- **Q11 Fire and Brimstone's first effect** (10 at 3/3, a dummy) isn't in its tooltip; not simulated.
- **Q12 The pet**: none is simulated (the pet core). An unsacrificed demon's damage is missing.
- **Q13 Wrack** (a 6 s channel that raises your other Shadow DoTs 10%) isn't cast: at pre-raid spell
  damage it deals about a third of a Shadow Bolt's damage per second.

## 10. Worked examples

Each is a unit test in `src/sim/classes/warlock/warlock.test.ts`. Profile `forever`; a level-63 boss
(6% average resist).

1. **Shadow Bolt.** 268 × (1 ± 0.0549) = 253.29–282.71; with 500 Shadow spell damage, no talents:
   `(268 + 0.857 × 500) × 0.94 = 654.71` on average.
2. **Immolate, Destruction build.** Aftermath 5 and Agonizing Flames 3: its hit ×1.5 × 1.1 = ×1.65,
   its ticks ×1.1; with 400 Fire spell damage, `(158 + 80) × 1.65 = 392.7` before resist, and each
   tick `(55 + 52) × 1.1 = 117.7`.
3. **Costs with Cataclysm 3/3.** Shadow Bolt 380 → 342, Immolate 342, Conflagrate 255 → 229,
   Incinerate 325 → 292, Shadowburn 365 → 328 (rounded down).
4. **Casts with Bane 5/5.** Shadow Bolt 2.5 s, Immolate 1.5 s, Incinerate 2.0 s; Corruption with
   Improved Corruption 5/5 is instant.
5. **Ruin and Pandemic.** A Destruction spell's crit ×2.0; Corruption's with Pandemic 3/3 ×2.0.
6. **Life Tap.** 220 Spirit, Improved Life Tap 2/2: `(424 + 220) × 1.2 = 772.8` mana.
7. **Corruption, Affliction build.** Improved Corruption, Malediction and Shadow Mastery at 5/5:
   ×1.10 × 1.05 × 1.05 = ×1.21275 a tick.
8. **Bane of Doom.** 400 Shadow spell damage: `1742 + 4 × 400 = 3342`, ×1.05 × 1.05 with Malediction
   and Shadow Mastery = 3684.56, one tick 60 s after it lands.
9. **Fel Energy.** 6,518 maximum mana: 2% = 130.36 mana every 4 s.
10. **Spirit regeneration.** 220 Spirit: `8 + 220 / 4 = 63` a tick outside the five-second rule.

---

## Sources

- [client] Forever beta client 1.60.1.69913 and Classic Era 1.15.9.69722, through the wago.tools API
  ([data/client.md](../data/client.md)).
- [wh-rotation] Wowhead, *Warlock DPS Rotation and Abilities – Classic WoW*, archived 2021-05-15:
  https://web.archive.org/web/20210515190018/https://classic.wowhead.com/guides/warlock-dps-rotation-abilities-classic-wow
  ("Apply your assigned curse … Apply Corruption if allowed / Cast Shadow Bolt").
- [wh-talents] Wowhead, *Warlock DPS Talents and Builds – Classic WoW*, archived 2021-05-15:
  https://web.archive.org/web/20210515204810/https://classic.wowhead.com/guides/warlock-dps-talents-builds-classic-wow
- [wt-warlock] Warcraft Tavern, *Warlock PvE DPS guide*, archived 2021-06-19:
  https://web.archive.org/web/20210619035247/https://www.warcrafttavern.com/wow-classic/guides/warlock-pve-dps/
- [wh-bis] Wowhead, *Classic Warlock Best in Slot Pre-Raid Gear Guide*, archived 2021-05-18:
  https://web.archive.org/web/20210518023319/https://classic.wowhead.com/guides/wow-classic-warlock-dps-pre-raid-best-in-slot-gear
- [mangos-stats] https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql
  and `player_classlevelstats.sql` (D24 placeholders, not evidence).
- [ws-base] https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go (placeholder origin).
- [rb] RatingBuster at d11164cf (pre-SoD): https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua
