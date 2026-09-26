# Priest: Shadow

WoW Forever reworks the Shadow Priest around **Shadowform**: +10% Shadow damage (Classic Era +15%),
Shadow spells at **half their mana**, and Shadow crits that deal **double damage**, including the
ticks of Shadow Word: Pain and Mind Flay, which crit in Forever. **Shadow Weaving** is the priest's
own now, +2% of *its* Shadow damage a stack on the boss, 5 stacks. **Devouring Plague** is every
priest's spell (a 1 min cooldown) rather than the Undead's racial, and a talent halves its cost.
New talents raise Mind Flay's damage 20% (**Improved Mind Flay**) and periodic damage 5% (**Twin
Disciplines**), and **Meditation** keeps 50% of regeneration while casting. Base damage is lower,
the coefficients the same or higher. **Shadowfiend** is baseline, and each race has two priest
spells: the Night Elf's **Starshards** is a 30 s channel for 1,800 Arcane damage, and the Undead's
**Dark Sacrifice** trades health for 1,600 mana plus your Spirit.

This doc is the engine contract for the Shadow Priest (slice K4, landed in the 90/10 mode of
[D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24) on the
caster core, [spells.md](../mechanics/spells.md)): the spells and talents it uses at level 60, with
numbers and sources, the rotation and its settings, the defaults, worked examples that run as unit
tests, and the questions the beta has to answer. Discipline and Holy (healers) are out of scope.

Status: researched 2026-09-24 · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 ·
ruleset tags: [F] Forever · [C] Classic Era · [?] unverified · engine: Shadow with first-pass
defaults ([§6](#6-rotation))

---

## What the sim needs

1. **Shadowform** all fight: +10% Shadow damage, half-price Shadow spells, ×2.0 Shadow crits
   ([§3.6](#36-shadowform-15473)).
2. **Shadow Word: Pain** and **Devouring Plague** as DoTs that snapshot the caster's side
   ([§3.1](#31-shadow-word-pain-r8-10894), [§3.4](#34-devouring-plague-r6-19280)).
3. **Mind Blast** as a 1.5 s cast on a 5.5 s cooldown ([§3.2](#32-mind-blast-r9-10947)).
4. **Mind Flay** as a DoT channel: one binary hit roll, then three ticks ([§3.3](#33-mind-flay-r6-18807)).
5. **Shadow Weaving** as the boss's `schoolTaken` stacks that only the priest's damage reads
   ([§4](#4-talents)).
6. **Inner Focus** as a free, +25% crit next spell, used on Mind Blast ([§3.5](#35-inner-focus-14751)).
7. **Mana**: Spirit regeneration `13 + Spirit / 4`, Meditation's 50% while casting, potions, runes
   and Dark Sacrifice ([§5](#5-mana)).
8. **Racials**: Troll Berserking's casting speed, Night Elf Elune's Light and Starshards
   ([§3.8](#38-racial-spells)).

---

## 1. WoW Forever changes

Every value below was read from the raw Forever client files (build 1.60.1.69913) and the Classic
Era client (1.15.9.69722) through the wago.tools API ([client data](../data/client.md)) [F] [C]
[client], unless the row says otherwise.

| What | Forever | Classic Era |
| --- | --- | --- |
| Races | Undead, Troll, Human, Dwarf, Night Elf, **Gnome** (races.json) | no Gnome priest |
| Shadowform (15473) | +10% Shadow damage (aura 79), **−50% Shadow spell cost** (aura 72), **+100% crit bonus** on Shadow Word: Pain, Devouring Plague, Mind Blast, Mind Flay (aura 108, spell mod 15), −15% physical taken; "may not cast healing spells" | +15% Shadow damage, −15% physical taken; no Holy spells |
| Shadow Weaving (15257 → 15258) | +2% Shadow damage taken **from the priest** a stack (aura 270), 5 stacks, 15 s, 33/67/100% by rank | +3% Shadow taken for everyone (aura 87), 20–100% by rank |
| Shadow Focus (15260) | +1% Shadow **hit** a rank (spell mod 16) | −2% resist chance a rank |
| Darkness (15259) | +2% Shadow damage a rank (aura 79) | the same, "Shadow spell damage" |
| Spirit Tap (15270) | after a **kill**, +100% Spirit, 50% regen while casting | the same (experience-giving kills) |
| Shadow Word: Pain r8 (10894) | 127 a tick × 6, coefficient **0.2** a tick, **periodic-crit flag** | 142 × 6, 0.167, no crits |
| Mind Blast r9 (10947) | 477–503, 0.429, 8 s | 508–536, 0.429, 8 s |
| Mind Flay r6 (18807) | 130 a tick × 3, **0.167** a tick, periodic-crit flag | 142 × 3, 0.15 |
| Devouring Plague r6 (19280) | **every race**, 106 a tick × 8, 0.1 a tick, **1 min** cooldown, 985 mana; no crit flag | Undead only, 113 × 8, 3 min |
| Vampiric Embrace (15286) | 30 s on the boss, **1 min** cooldown | 1 min, 10 s cooldown |
| Starshards r7 (19305) | Night Elf, **1,800** Arcane over 6 s (a channel), **30 s** cooldown, crit flag | 936 over 6 s, no cooldown |
| New talents | Improved Mind Flay (+20% Mind Flay damage), Twin Disciplines (+5% periodic damage of Shadow Word: Pain and Devouring Plague), Devouring Contagion (−50% Devouring Plague cost), Early Demise (Shadow Word: Death crit), Holy Precision, Power in Light, Penance, Renewed Hope, Divine Aegis, Soul Warding, Litany of Light, Binding Heal, Prayer of Mending | — |
| Changed talents | Meditation 50% (15%), Mental Strength +15% **Intellect** (+10% mana), Mental Agility also Smite and Holy Fire, Improved Mind Blast in the Shadow tree's tier 3 | — |
| Gone from the tree | Improved Vampiric Embrace, Divine Spirit (trained), Force of Will, Unbreakable Will, Improved Power Word: Fortitude, Improved Prayer of Healing, Lightwell (trained) | — |
| New spells | Shadowfiend (baseline, 5 min), Dark Sacrifice (Undead), Contingency Plan (Gnome), Divine Grace (Human), Chastise (Dwarf), Confounding Flash (Gnome) | — |

Shadow Word: Death exists in the client (1309595 and later ranks) and Early Demise names it, but no
trainer row teaches it in this build, so the sim doesn't cast it ([OQ-P7](#9-open-questions)).

## 2. Conventions

- The caster core's rules apply ([spells.md](../mechanics/spells.md)): spell hit (17% miss at a
  level-63 boss, 0% floor in Forever), spell crit ×1.5, the boss's 24 resistance (6% on average),
  DoTs that snapshot your side and read the boss's at each tick, channels, the five-second rule.
- A rank learned below 60 grows by its per-level points to 60, truncated to a whole number by the
  datasets' rule ([per-level values](../data/items.md#per-level-values); how the client itself
  rounds it is [?], [open-questions B74](../open-questions.md#b74-per-level-tooltip-values)); a range is base × (1 ± variance / 2)
  ([paladin conventions](paladin.md#conventions-used-below)).
- Mana costs are whole mana, rounded down after every cut ([§4](#4-talents)).

## 3. Abilities

### 3.1 Shadow Word: Pain (r8, 10894)

A pure DoT (aura 3): 127 Shadow every 3 s for 18 s, +0.2 × Shadow spell damage a tick, 470 mana,
instant, on the GCD [F]. Its one effect is damage, so it's partially resisted on each tick
([spells.md §3](../mechanics/spells.md#3-resistances)). Its **periodic-crit flag** (Attributes[8]
0x200) lets its ticks crit in `forever` at the spell crit it snapshotted, ×2.0 in Shadowform
[F] flag, [?] in combat (OQ-S4). Improved Shadow Word: Pain adds 3 s (one tick) a rank.

### 3.2 Mind Blast (r9, 10947)

485 base points, variance 0.054, +2.6 a level from 58 to 63, truncated to +5
([per-level values](../data/items.md#per-level-values)): **476.87–503.13** at 60 (the tooltip's
477 to 503), +0.429 × Shadow spell damage, 350 mana, a 1.5 s cast that casting speed shortens, an
8 s cooldown (category 19), on the GCD [F]. Pure damage: partially resisted. Improved Mind Blast cuts
the cooldown 0.5 s a rank (5.5 s at 5/5).

### 3.3 Mind Flay (r6, 18807)

A channel (Attributes[1] 0x4) whose ticks are its own periodic damage: 130 Shadow a second for 3 s,
+0.167 × Shadow spell damage a tick, 205 mana paid as it starts, the periodic-crit flag, and a 50%
slow (aura 33) [F]. Its slow makes it a **binary** spell: resisted whole at `miss + (1 − miss) ×
6%`, never partially ([spells.md §3](../mechanics/spells.md#3-resistances) [?]). One hit roll as it
starts; the channel holds the GCD and every cast until it ends, and the rotation may cut it off after
fewer ticks ([spells.md §6](../mechanics/spells.md#6-channels)). Improved Mind Flay adds 10% a rank to
its periodic damage.

### 3.4 Devouring Plague (r6, 19280)

A pure DoT (aura 53, a leech): 106 Shadow every 3 s for 24 s, +0.1 × Shadow spell damage a tick,
985 mana, a 1 min cooldown (category 691), on the GCD, **no** periodic-crit flag [F]. Every Forever
priest has it. Its healing is ignored. Devouring Contagion halves its cost; its spread to another
target does nothing on one boss.

### 3.5 Inner Focus (14751)

An aura with one charge (`ProcCharges` 1): the next spell costs nothing (aura 108, cost −100%) and
gets +25% crit (aura 107) [F]. A 3 min cooldown, off the GCD, no cost. The sim makes it the plan's
free-cast aura: the next priest spell with a cost uses the charge, and the rotation presses Inner
Focus only when Mind Blast could start at once (COND `abilityReady`), so that's the spell. The +25%
covers a DoT's snapshot too, and nothing else: not a spell that spell's procs cast, and not the next
spell when the charge goes on an ability with no spell of its own (the engine's free-cast crit is
cleared once its spell resolves, and at every fight's start, so fights stay reproducible).

### 3.6 Shadowform (15473)

Cast before the pull, it lasts until cancelled; the sim keeps it up all fight whenever the build has
the talent (the priority list's pinned row before the pull on the Rotation tab). Its effects [F]:

| Effect | Value | In the sim |
| --- | --- | --- |
| #1 aura 79, misc 32 | +10% Shadow damage done | a `schoolDamage` effect, multiplied with Darkness's |
| #3 aura 72, misc 32 | −50% mana cost of Shadow spells | each Shadow row's cost × 0.5, after the talents' cuts [?] |
| #4 aura 108, spell mod 15, mask 0x2809010 | +100% crit damage bonus: Shadow Word: Pain, Devouring Plague, Mind Blast, Mind Flay | their crit multiplier `1 + 0.5 × 2` = **2.0** |
| #2 aura 87, misc 1 | −15% physical damage taken | nothing for a DPS |

### 3.7 Vampiric Embrace (15286)

A debuff on the boss for 30 s that heals the party for 20% of the priest's Shadow damage, 40 mana
(20 in Shadowform), a 1 min cooldown, on the GCD; it rolls spell hit [F]. The sim ignores healing, so
it only costs a GCD: off by default.

### 3.8 Racial spells

| Race | Spell | In the sim |
| --- | --- | --- |
| Troll | Berserking (20554): **+10% casting and attack speed** for 10 s, 3 min, off the GCD [F] | on cooldown (a Mind Blast casts in 1,364 ms) |
| Night Elf | Elune's Light (1259799): +10% all crit for 15 s, 3 min [F] | on cooldown |
| Night Elf | Starshards r7 (19305): a channel, 300 Arcane a second for 6 s, +0.167 a tick, the crit flag, 350 mana, 30 s cooldown [F] | on cooldown; Arcane, so no Shadowform, Shadow Weaving or Darkness |
| Undead | Dark Sacrifice r5 (1277328): 1,600 mana **plus your Spirit** over 15 s, 5 ticks every 3 s, paid in 1,600 health, 10 min, on the GCD [F] [client] (SpellEffect, Spell, 1.60.1.70009: the tooltip's `${$o2+$SPI}`; before 1.60.1.70009 it was 1,600 flat, and its health cost could break crowd control) | once the mana setting fits (1,600 by default); Spirit at the pull, spread evenly over the ticks [?]; health isn't tracked |
| Gnome | Expansive Mind (20591): +5% maximum mana (aura 178) [F] | a passive: the mana pool is 5% larger |
| Gnome | Eureka! (1259823): the next 3 damaging or healing spells cost 10% less mana (15% until 1.60.1.70009 made every class's cut 10%) and deal +10%, periodic damage +10%; 3 charges, 15 s, 2 min [F] [client] (1.60.1.70009) | on cooldown from the pull: Mind Blast, Shadow Word: Pain, Mind Flay, Devouring Plague and Starshards spend its charges, rounded down, landed or not [?] (`src/sim/classes/eureka.ts`, `eureka`): +1.11% (Gnome, racial on vs off, the defaults, seed 12345, 20,000 fights; the same at 15%: the +10% damage is nearly all of it) |
| Human, Dwarf, Gnome, Troll, Undead | Feedback, Divine Grace, Desperate Prayer, Chastise (humanoids only), Contingency Plan, Confounding Flash, Hex of Weakness, Shadowguard, Touch of Weakness | nothing for damage on a boss, or not modelled (Chastise: [OQ-P8](#9-open-questions)) |

The Classic Era guide below leaves Devouring Plague and Starshards out of raids for their debuff
slots; the sim has no debuff limit ([buffs §4.3](../mechanics/buffs-debuffs-consumables.md#43-debuff-slot-limit)).

## 4. Talents

Rank values are the Forever client's curves (`TraitDefinitionEffectPoints`, talents.json) [F].

| Talent | Ranks | Effect at full rank | In the sim |
| --- | --- | --- | --- |
| Shadow Focus (15260) | 5 | +5% hit with Shadow spells (spell mod 16) | a `schoolHit` effect: Shadow's own hit, before the 0% floor (the mage's Elemental Precision's mechanism) |
| Improved Shadow Word: Pain (15275) | 2 | +6 s | +2 ticks, a 24 s marker |
| Improved Mind Blast (15273) | 5 | −2.5 s cooldown | 5.5 s |
| Mind Flay (15407) | 1 | the spell | the filler |
| Improved Mind Flay (1225139) | 2 | +20% periodic damage (spell mod 22) | Mind Flay's own multiplier ×1.2 |
| Vampiric Embrace (15286) | 1 | the spell | a switch, off |
| Shadow Weaving (15257) | 3 | 100% chance, +2% a stack, 5, 15 s | a `spellLanded` proc on Shadow spells: DoT applications and a channel's start count, ticks don't |
| Devouring Contagion (1309950) | 2 | −50% Devouring Plague cost | cost cut |
| Darkness (15259) | 5 | +10% Shadow damage (aura 79) | `schoolDamage`, multiplied with Shadowform's |
| Shadowform (15473) | 1 | [§3.6](#36-shadowform-15473) | always on |
| Twin Disciplines (1225132) | 5 | +5% periodic damage of Shadow Word: Pain and Devouring Plague (its effect 1, spell mod 22) | their own multiplier ×1.05; its effect 0 names no spell the sim casts |
| Mental Agility (14520) | 3 | −10% cost of Shadow Word: Pain, Devouring Plague, Vampiric Embrace (and Smite, Holy Fire); its class mask doesn't cover Starshards (19305) | cost cut, added to Devouring Contagion's [?] |
| Inner Focus (14751) | 1 | [§3.5](#35-inner-focus-14751) | before Mind Blast |
| Meditation (14521) | 3 | 50% of regeneration while casting (aura 134) | the mana plan's share inside the five-second rule |
| Mental Strength (18551) | 5 | +15% Intellect (aura 137) | an Intellect multiplier |
| Power Infusion (10060) | 1 | +20% spell damage, 15 s, 3 min | the Discipline tree's 31st point: out of a Shadow build's reach; another priest's is a Buffs entry |

Not modelled, with why: Blackout (a stun), Spirit Tap (kills only: a boss fight has none, and
Vampiric Embrace's chance is on a kill too), Shadow Affinity (threat), Shadow Reach, Improved
Psychic Scream, Improved Fade, Silence (utility), Early Demise (Shadow Word: Death isn't trained),
Wand Specialization (the wand isn't simulated) and the healing talents.

## 5. Mana

The caster core's one mana pool ([spells.md §8](../mechanics/spells.md#8-mana)): base mana 1,376
[F], Spirit regeneration **13 + Spirit / 4** a 2 s tick outside the five-second rule [C] ([OQ-S11](../mechanics/spells.md#open-questions)),
Meditation's 17/33/50% of it inside the rule [F], and mp5 always. What restores it:

- **Major Mana Potion** and **Demonic Rune** (Buffs), off the GCD when their most fits
  ([buffs §3.5](../mechanics/buffs-debuffs-consumables.md#35-potions-and-runes)).
- **Dark Sacrifice** (Undead): 1,600 mana plus your Spirit in 5 ticks over 15 s, a GCD, once it fits.
- **Spirit Tap** does nothing: it needs a kill.
- **Shadowfiend** (401977: "Caster receives 5% mana when the Shadowfiend attacks", 15 s, 5 min) is a
  pet; the sim can't model pets until the pet core (H1), so it's left out and listed in the result's
  assumptions (`shadowfiendNotSimulated`) and the [known gaps](../known-gaps.md).

In the default setup the priest spends about 10,600 mana a fight and still ends it with about 2,300
of its 5,506: its Major Mana Potion is used about once.

## 6. Rotation

### Classic Era common priority (baseline)

Wowhead's Classic Shadow Priest rotation guide (Phase 6, archived 2021-05-18,
[wh-rot]) [C]: spell-damage trinkets; Shadow Word: Pain; Inner Focus followed by Mind Blast; Mind
Flay twice; Mind Blast again; Mind Flay; potions and runes when low; keep 5 Shadow Weaving stacks.
Devouring Plague, Starshards and Vampiric Embrace are left out of raids for debuff slots and threat.

### Adapted to Forever (the default)

Off the GCD, from the pull: the racial cooldown (Berserking, Elune's Light), on-use trinkets, another
priest's Power Infusion (a Buffs entry), and the mana potion, rune and Dark Sacrifice once their most
fits. On the GCD, first usable line wins:

| # | Line | Condition |
| --- | --- | --- |
| 0 | Shadowform | before the pull, always on (the list's pinned row) |
| 1 | Shadow Word: Pain | missing from the boss, and at least 6 s of the fight left |
| 2 | Devouring Plague | on cooldown, at least 6 s left |
| 3 | Inner Focus (off the GCD) | Mind Blast could start now |
| 4 | Mind Blast | on cooldown |
| 5 | Starshards (Night Elf) | on cooldown |
| 6 | Vampiric Embrace | off by default |
| 7 | Mind Flay | all 3 ticks |

Shadow Weaving needs no line: every Shadow spell that lands stacks it. Settings are
`priest.shadow.<ability>.<param>`; the Rotation tab says "the common priority".

#### The priority list (A2)

Since M5.65 A2 the lines above are the Rotation tab's priority list
([D31](../decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24);
`SHADOW_APL` in [`shadow.ts`](../../src/sim/classes/priest/shadow.ts)), in this order, each with its
switch, its own settings and its own conditions, which it keeps wherever it sits:

| Row (`id`) | Switch (`priest.shadow.…`) | Its settings | Its conditions |
| --- | --- | --- | --- |
| Before the pull (`prepull`), pinned first | — | | Shadowform, with the talent ([§3.6](#36-shadowform-15473)) |
| Racial cooldown (`racial`) | `racial.enabled` | | on cooldown: Berserking, Elune's Light or Eureka! ([§3.8](#38-racial-spells)) |
| On-use trinkets (`trinkets`) | `trinkets.enabled` | | on cooldown, each the sim models |
| Power Infusion (`powerInfusion`) | `powerInfusion.enabled` | | selected in Buffs (another priest's), once, at the pull ([buffs](../mechanics/buffs-debuffs-consumables.md#power-infusion)); the mana potion and rune take their turn just after it |
| Dark Sacrifice (`darkSacrifice`) | `darkSacrifice.enabled` | `darkSacrifice.missingMana` | Undead only; missing at least that much mana ([§3.8](#38-racial-spells)) |
| Shadow Word: Pain (`shadowWordPain`) | `shadowWordPain.enabled` | `dots.minTimeLeftSec` | off the boss, and at least that much of the fight left ([§3.1](#31-shadow-word-pain-r8-10894)) |
| Devouring Plague (`devouringPlague`) | `devouringPlague.enabled` | `dots.minTimeLeftSec` | on cooldown, at least that much left ([§3.4](#34-devouring-plague-r6-19280)) |
| Inner Focus (`innerFocus`) | `innerFocus.enabled` | | Mind Blast could start now; needs the talent and Mind Blast on ([§3.5](#35-inner-focus-14751)) |
| Mind Blast (`mindBlast`) | `mindBlast.enabled` | | on cooldown ([§3.2](#32-mind-blast-r9-10947)) |
| Starshards (`starshards`) | `starshards.enabled` | | Night Elf only; on cooldown ([§3.8](#38-racial-spells)) |
| Vampiric Embrace (`vampiricEmbrace`) | `vampiricEmbrace.enabled` | | off the boss; needs the talent; off by default ([§3.7](#37-vampiric-embrace-15286)) |
| Mind Flay (`mindFlay`) | `mindFlay.enabled` | `mindFlay.ticks` | the filler, cut off after that many ticks; needs the talent ([§3.3](#33-mind-flay-r6-18807)) |

- **Pinned:** only Shadowform before the pull. It has no switch: a build with the talent always
  keeps it up ([§3.6](#36-shadowform-15473)). Without the talent nothing is cast before the pull,
  and the row reads "None".
- **Power Infusion is a row,** as on Balance and Elemental. It was spec-wide, taking its turn with
  the on-use trinkets, and alone under its heading, which [ux.md "Rotation"](../ux.md#sections) rules out.
- **Spec-wide, above the list:** the Major Mana Potion and Demonic Rune with their mana thresholds
  (under Consumables). They're Buffs entries the rotation presses, and take their turn just after
  Power Infusion's row, wherever it sits, whether it's on or off. That's where they were before it
  was a row: an order saved then has no Power Infusion, which goes just after the on-use trinkets
  (or the row after them that came before it by default), so it plays as it did.
- **Presets:** Shadow has no named rotations, so the preset is the implicit Default, the order
  above with every setting at its default; the tab still says the defaults are the common priority
  (D27).
- **Inner Focus keeps its own condition:** it's used once Mind Blast could start. Just above Mind
  Blast, the Mind Blast that follows takes its free, +25% crit cast; moved above the DoTs, the
  charge can go to whatever the list casts next. **Moved below Mind Blast it's never used** while
  there's the mana for Mind Blast, which goes first the moment it's ready, so "Mind Blast ready"
  never reaches Inner Focus (0 casts in the default setup). Its row and setting say so, dimmed:
  "Not used: below Mind Blast, which it waits for, so Mind Blast always goes first. Move it above Mind
  Blast." (`shadowUnusedSettings`). It isn't the below-filler rule, since it's never cast rather than
  cast only when the row above can't be; and when it sits below Mind Flay too, this note is the one
  that shows. Above Mind Blast but below Mind Flay, the below-filler rule's note shows instead
  ([ux.md "Rotation"](../ux.md#sections)).
- **Rows below Mind Flay:** the filler takes every global cooldown there's the mana for, so a row on
  the global cooldown moved below it (Dark Sacrifice, Shadow Word: Pain, Devouring Plague, Mind
  Blast, Starshards, Vampiric Embrace) gets one only without that mana, and so does Inner Focus,
  which waits for Mind Blast's. In the default setup, Mind Flay first casts none of them. Each
  such row that's on (with its talent) says so, dimmed, by the rule every filler's rows share
  ([ux.md "Rotation"](../ux.md#sections), rows below the filler): "Below Mind Flay: cast only when Mind Flay
  can't be." (`shadowUnusedSettings`); a race's note ("only Night Elf priests have Starshards")
  comes first. The racial, the trinkets, Power Infusion and the
  consumables are off the global cooldown and pressed wherever they sit.
- **Equivalence.** In the default order the plan is the one before the list, byte for byte: 200
  random setups (settings, talents, race, on-use items, the mana consumables and Power Infusion,
  fight length and rules) are fingerprinted against the code before it (`shadow-apl.test.ts`), and
  the golden run is unchanged.

### 6.1 First-pass defaults

D27's one quick search, on the default setup (Troll, the default build and gear, Standard raid; the
gear then had the guide's Scepter of the Unholy, before §7.5's Mindfang), 20,000 fights on seed 1, fixed ([`SHADOW_OPTIONS`](../../src/sim/classes/priest/shadow.ts)), 95% CI
about ±0.22 DPS:

| Mind Flay ticks | DoTs until (s left) | Devouring Plague | DPS |
| --- | --- | --- | --: |
| **3** | **6** | **on** | **523.16** |
| 3 | 12 | on | 523.07 |
| 3 | 3 | on | 522.86 |
| 3 | 6 | off | 506.06 |
| 2 | 6 | on | 516.99 |
| 2 | 6 | off | 502.20 |

Cutting Mind Flay after 1 tick costs about 25% (390 DPS on 2,000 fights: a whole GCD for one tick).
Devouring Plague is worth +3.4%; the DoTs' cut-off moves under 0.1%. The defaults stay the common
priority's: all three ticks, Devouring Plague on cooldown, DoTs until 6 s are left.

## 7. Sensible defaults

### 7.1 Talents

**Discipline 20 / Holy 0 / Shadow 31**, `025300031303--500320501201312051`: Shadow Focus 5, Shadow
Affinity 3 (a gate filler), Improved Shadow Word: Pain 2, Improved Mind Blast 5, Mind Flay,
Improved Mind Flay 2, Vampiric Embrace (Shadowform's arrow), Shadow Weaving 3, Silence (a filler),
Devouring Contagion 2, Darkness 5, Shadowform; then Wand Specialization 2 and Silent Resolve 3
(fillers), Twin Disciplines 5, Mental Agility 3, Inner Focus, Meditation 3, Mental Strength 3. The
Shadow tree's other points buy nothing for damage on a boss, so 31 there and 20 in Discipline.

### 7.2 Race and weapons

**Troll** by default: Berserking's +10% casting speed is the one racial DPS cooldown a Horde priest
has (Undead: Dark Sacrifice's mana). Alliance: a Night Elf has Starshards and Elune's Light. Priests
wear cloth and use one-handed maces, daggers, staves and wands (SkillLineAbility rows 254, 1387, 700
and 2927) [F]; an off hand is a held item. The sim doesn't melee or shoot the wand; their stats count.

### 7.3 Base values

Base mana 1,376, 59.5 Intellect per 1% spell crit (0.0168%) and 20 Agility per 1% melee crit [F]
(`PlayerExpectedStat`). Everything else is a D24 placeholder [?] (`baseStatPlaceholders`): the
attribute rows (the class row Str 35, Agi 40, Sta 50, Int 120, Spi 125, the Human's, plus the [C]
race offsets; Gnome Int 123, Forever having removed its +5%) and health 1,387 from the mangos
emulator's tables ([mangos-stats]), and **base spell crit 0.8%**, melee crit and dodge 3% and attack
power −10 from wowsims/classic's priest row ([wowsims-base]), which copies the emulator's attributes;
none is evidence. Only the base spell crit moves DPS: each 1% is about 1% of it.

### 7.4 Enchants and consumables

The defaults are Greater Stats on the chest and Forever's **Minor Haste** gloves (+1% casting speed)
[F]. Arcanum of Focus and the +30 Spell Power weapon enchant, which the warlock's slice (K3) added to
the catalogue, aren't in the priest's defaults yet (you can pick them on the Gear tab); Mana Oil isn't
in the catalogue. Both are a known gap. Consumables by preset
([buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset)):
Standard raid has Greater Arcane Elixir (+35), **Elixir of Shadow Power** (+40 Shadow; 11474, 30 min
[F] [C]) and the Major Mana Potion; Max adds Flask of Supreme Power, the Demonic Rune and Brilliant
Wizard Oil (+36 spell damage and +1% spell crit), as every caster's Max does. The Buffs tab doesn't offer a caster what only helps melee
(Battle Shout, Windfury Totem, armor debuffs).

### 7.5 Gear

The pre-raid list is Wowhead's Classic Era Shadow Priest pre-raid BiS guide (Phase 6, archived
2021-05-18, [wh-bis]), its random-suffix items ("of Shadow Wrath") left out: the pool has no
suffixes ([items.md](../data/items.md#pre-raid-bis-lists)). Most of its items have no Forever row
yet and use Classic Era stats (`classicItems`).

**The main hand isn't the guide's.** The Arathi Basin Exalted daggers, Mindfang (The Defilers, Horde)
and Sageclaw (League of Arathor, Alliance), lead the guide's Scepter of the Unholy (the Destruction gear
review, DG-2). They take rank 1, the guide's picks move to ranks 2 and 3, and the default gained 7.0%
(523.3 → 559.7 DPS, 20,000 fights on seed 2701) while the sim gave them +94 spell power, the Rare
caster-weapon rule extrapolated to Epic quality. Since 2026-09-26 they carry Classic Era's +30
([client.md "Epic caster weapons"](../data/client.md#weapon-damage)) with Forever's crit rating, and
still lead the Scepter by 9 DPS (paired, 10,000 fights). A
sim-ranked list, as the warlocks' ([warlock.md §7.3](warlock.md#73-gear)), would gain a few percent
more; it's a known gap. Briarwood Reed's Forever effect ("+15 Spell Power in
certain areas") and Eye of the Beast's on-use +7% spell hit aren't simulated: they count as zero (E7 in
[shaman.md](shaman.md), the [known gaps](../known-gaps.md)).

**The off hand is re-ranked by the sim** (DV2-4, 1.60.1.70009): Spirit of Aquementas, the default's,
lost its Forever row in 1.60.1.70009 and has Classic Era's stats, so its slot was ranked again among the
list's own items (paired in the default set, 20,000 fights on seed 2701): Tome of Shadow Force (+34
Shadow; +6.0 DPS over Spirit of Aquementas), Therazane's Touch (+4.7), Spirit of Aquementas. The default
goes 559.7 → **565.7** DPS. Draconic Infused Emblem, off the guide's list, would add +9.6 in the second
trinket: a known gap with the full ranking of the guide lists.

## 8. Implementation notes

- **Rows:** `src/sim/classes/priest/abilities.ts` (checked against the client by `data.test.ts`),
  `talents.ts` (passives, Shadowform, the rows' talent changes), `setup.ts` (effects, the mana plan,
  Inner Focus as the free-cast aura, assumptions), `shadow.ts` (settings and the priority list).
- **No melee:** a spec with `SpecMeta.caster` (the mage's since K2, the priest's) gets a plan with no
  weapons, so it never swings; its gear's stats still count, and the notes about a missing weapon,
  glancing and crit suppression are left out.
- **Engine additions** (each absent on every other plan): `Plan.freeCastCritPct`, the crit the free-cast charge's
  spell gets (Inner Focus), its DoT's snapshot included; COND `abilityReady` (50), an ability that
  could start now. Codes 50–53 are the priest's.
- **A core fix:** a DoT channel that ended on its last tick delivered it, but that tick's own event
  stayed live and landed again when the next cast wasn't the same channel (a full Mind Flay ticked
  4 times). `endChannel` now makes the event stale.
- **Buffs:** the priest is a caster class (`CASTER_CLASSES`), so it gets the mana and spell damage
  entries and the caster entries (Moonkin Aura, Power Infusion, Curse of the Elements), and not the
  melee ones (`forSpecs: 'melee'`: Battle Shout, Windfury Totem, armor debuffs), as the mage.

## Worked examples

Each is a unit test (`src/sim/classes/priest/priest.test.ts`). A level-60 priest, a level-63 boss
(24 resistance: 6% on average), **500 Shadow spell damage**, no talents unless named.

1. **Shadow Word: Pain.** `(127 + 0.2 × 500) × 0.94 = 213.38` a tick, 1,280.28 over 6; with
   Improved Shadow Word: Pain 2/2, 8 ticks, 1,707.04.
2. **In the default build.** Shadowform ×1.1, Darkness 5/5 ×1.1, Twin Disciplines 5/5 ×1.05:
   `227 × 1.2705 × 0.94 = 271.10` a tick; a crit ×2.0: 542.20; with 5 Shadow Weaving stacks ×1.10:
   298.21.
3. **Mind Blast.** `(476.87 to 503.13) + 214.5`, `704.5 × 0.94 = 662.23` on average; cooldown 5.5 s
   with Improved Mind Blast 5/5, from the cast's end, so one every 7 s when nothing else is cast.
4. **Mind Flay.** `130 + 0.167 × 500 = 213.5` a tick, no partial resist (binary); Improved Mind Flay
   2/2: 256.2. With no hit it lands `1 − (0.17 + 0.83 × 0.06) = 78.02%` of the time; with 7% gear hit
   and Shadow Focus 5/5, 89.3%.
5. **Costs** in the default build: Shadow Word: Pain `470 × 0.9 × 0.5 = 211.5 → 211`; Devouring
   Plague `985 × (1 − 0.10 − 0.50) × 0.5 = 197`; Mind Blast 175; Mind Flay `102.5 → 102`.
6. **Regeneration.** 200 Spirit: `13 + 200 / 4 = 63` mana a tick outside the five-second rule, and
   Meditation 3/3's half, 31.5, inside it.
7. **Shadow Weaving.** Each landed Shadow spell adds a stack (1–5), ×1.02 to ×1.10 on the priest's
   Shadow damage; Mind Blast at 5 stacks: `662.23 × 1.1 = 728.45`. A lone Shadow Word: Pain's stack
   covers its ticks at 3–12 s (×1.02): it expires at 15 s, before that moment's tick.
8. **Inner Focus.** The Mind Blast after it costs 0 and crits at the sheet's spell crit + 25%.
9. **Dark Sacrifice.** 5 ticks of 320 + Spirit ÷ 5: 1,600 mana plus your Spirit over 15 s; at 250
   Spirit, 5 ticks of 370, **1,850**.

## 9. Open questions

Each [?] the priest relies on, its assumption id (the result's list) and its estimated effect.

- **OQ-P1: Shadow Weaving in combat** (`shadowWeaving`). Does the Forever debuff count only the
  priest's damage, stack from Mind Flay's start and the DoTs' applications but not their ticks, and
  refresh on each? Effect: up to 10% of Shadow damage while it's up, which is nearly all fight.
- **OQ-P2: Shadowform's cost cut with the talents' cuts** (`shadowformCosts`): multiplied after
  Mental Agility and Devouring Contagion (the sim), or added to them? Effect: mana only; Devouring
  Plague would cost 0 if they added.
- **OQ-P3: periodic crits** (`priestPeriodicCrits`): do Shadow Word: Pain's and Mind Flay's ticks
  crit in combat, for ×2.0 in Shadowform? Effect: about 10% of their damage.
- **OQ-P4: Mind Flay** (`mindFlayChannel`): one hit roll, resisted whole as a binary spell, not
  shortened by casting speed. Effect: under 1% (hit), 0 without haste.
- **OQ-P5: Inner Focus** (`innerFocus`): does its charge go to the next spell with a cost, and does
  its +25% reach a DoT's ticks? Effect: under 0.5%.
- **OQ-P6: Spirit regeneration** (`manaRegenPriest`, spells.md OQ-S11): 13 + Spirit / 4 [C]. Effect:
  under 1% while the priest doesn't run dry.
- **OQ-P7: Shadow Word: Death.** The client has it (1309595–1309636) and Early Demise names it, but
  no trainer row teaches it in 1.60.1.69913. Effect: unknown until it's trained.
- **OQ-P8: Chastise** (Dwarf): 272–306 Holy on a humanoid, 2 min; not modelled (few bosses are
  humanoid). Effect: under 0.5% where it applies.
- **OQ-P9: the base values** (`baseStatPlaceholders`, D24): base spell crit 0.8%. Effect: about
  1% a 1% of error. A naked level-60 priest's sheet settles them.
- **OQ-P10: no melee or wand** (`priestNoMelee`): a Shadow Priest at range casts only; its wand isn't
  simulated. Effect: none in raids, where it casts all fight.
- **OQ-P11: Shadowfiend** (`shadowfiendNotSimulated`): a pet; its mana waits for the pet core.
  Effect: about 5% of mana a hit for 15 s every 5 minutes.
- **OQ-P12: Dark Sacrifice** (`darkSacrifice`): ✅ its Spirit scaling is settled by 1.60.1.70009: the
  tooltip reads "gain ${$o2+$SPI} Mana", 1,600 plus your Spirit [F] [client] (Spell.Description_lang;
  the build's [notes][dev-70009]: "the Mana gained from the ability scales with Spirit"). Still [?]: the Spirit it
  reads (the sim takes the sheet's at the pull, as Life Tap's) and how it's spread (evenly over the 5
  ticks); the health cost is ignored. Effect: none on the default (Troll); an Undead gets about 50 mana
  a tick more at 250 Spirit.

## Sources

- [client] Forever beta client 1.60.1.69913 and Classic Era 1.15.9.69722 through the wago.tools API
  ([data/client.md](../data/client.md)): SpellEffect, SpellMisc, SpellPower, SpellCooldowns,
  SpellDuration, SpellCastTimes, SpellAuraOptions, SpellClassOptions, SkillLineAbility, the Trait
  tables and TraitDefinitionEffectPoints (talents.json), PlayerExpectedStat (gametables.json).
- [wh-rot] Wowhead, *Classic Shadow Priest Abilities & Rotation Guide*, Phase 6 (Classic Era 1.13,
  not SoD), archived 2021-05-18: https://web.archive.org/web/20210518130919/https://classic.wowhead.com/guides/shadow-priest-dps-rotation-abilities-classic-wow
- [wh-bis] Wowhead, *Classic Shadow Priest Best in Slot (BiS) Pre-Raid Gear Guide*, 1.13.7, archived
  2021-05-18: https://web.archive.org/web/20210518011006/https://classic.wowhead.com/guides/wow-classic-shadow-priest-dps-pre-raid-best-in-slot-gear
- [mangos-stats] The mangos emulator's 1.12 tables, `player_levelstats.sql` and
  `player_classlevelstats.sql` (a D24 origin, not evidence):
  https://github.com/mangoszero/database/tree/master/World/Setup/FullDB
- [wowsims-base] wowsims/classic `sim/core/base_stats.go`, the priest class row (a D24 origin, not
  evidence): https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go

[wh-rot]: https://web.archive.org/web/20210518130919/https://classic.wowhead.com/guides/shadow-priest-dps-rotation-abilities-classic-wow
[wh-bis]: https://web.archive.org/web/20210518011006/https://classic.wowhead.com/guides/wow-classic-shadow-priest-dps-pre-raid-best-in-slot-gear
[wowsims-base]: https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go
[mangos-stats]: https://github.com/mangoszero/database/tree/master/World/Setup/FullDB
[dev-70009]: https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-updated-september-24/2360696
