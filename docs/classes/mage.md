# Mage: Fire, Frost and Arcane

WoW Forever keeps the Classic mage's spellbook and cuts its damage: Fireball, Scorch and Pyroblast
lose about 30% of their base damage, Frostbolt 11%, and an Arcane Missile falls from 230 to 209 while
its coefficient rises. It makes the old raid debuffs the mage's own: **Improved Scorch**'s Fire
Vulnerability counts only your Fire damage, and **Winter's Chill** raises only your Frostbolt's crit.
**Ignite** pools into one two-tick DoT, **Combustion** lasts four crits, and new talents add
**Hot Streak** (crits make Pyroblast faster), **Arcane Blast**, **Missile Barrage**, **Ice Lance** and
**Fingers of Frost**. Regeneration while casting is much higher (Mage Armor and Arcane Meditation 50%
each), Arcane Mind is now Intellect and Arcane crit damage, and the hit talents give spell hit.
Orcs and High Order Skyborne can be mages.

This doc is the engine contract for the three mage specs (slice K2, landed in the 90/10 mode of
[D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)), on the
caster core ([spells.md](../mechanics/spells.md), whose [§12](../mechanics/spells.md#12-what-a-class-slice-uses)
is the API it builds on). It's a lighter class doc than [shaman.md](shaman.md): the spells, cooldowns
and talents the sim uses, with numbers and sources, the three priorities and their settings, the
defaults, and the questions the beta has to answer.

Status: researched 2026-09-24 · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 ·
ruleset tags: [F] Forever · [C] Classic Era · [?] unverified · engine: Fire, Frost and Arcane with
first-pass defaults ([First-pass defaults](#first-pass-defaults))

---

## What the sim needs

1. **Spells on the spell table** (spell hit, crit ×1.5 or ×2.0 with Ice Shards or Arcane Mind, the
   average partial resist, Frostbolt binary), cast times that casting speed shortens, and Arcane
   Missiles as a channel of five missiles ([Spells](#spells)).
2. **Ignite** as one pooled, rolling Fire DoT fed by crits ([Ignite](#ignite)).
3. **Improved Scorch**'s five stacks of Fire Vulnerability on the boss, kept up by Scorch
   ([Improved Scorch](#improved-scorch)).
4. **Hot Streak** stacks that cut Pyroblast's cast time ([Hot Streak](#hot-streak)).
5. **Combustion**'s growing Fire crit that ends after 4 crits, and whose cooldown starts then
   ([Combustion](#combustion)).
6. **Winter's Chill** stacks that give Frostbolt crit ([Winter's Chill](#winters-chill)).
7. **Presence of Mind**, **Arcane Power** and **Clearcasting** ([Presence of Mind](#presence-of-mind),
   [Arcane Power](#arcane-power), [Clearcasting](#clearcasting)).
8. **Mana**: the mage's regeneration, Evocation, mana gems, potions and runes ([Mana](#mana)).
9. **Talents** as passives, procs and changes to the spell rows ([Talents](#talents)).
10. **Three priority lists** with their settings ([Fire](#fire-priority), [Frost](#frost-priority),
    [Arcane](#arcane-priority)).

A mage never swings its weapon in the sim: its weapon's stats count, and nothing melee applies.

---

## WoW Forever deviations

Every value below was read from the raw Forever client files (build 1.60.1.69913) and the Classic
Era client (1.15.9.69722) through the wago.tools API ([client data](../data/client.md)), unless the
row says otherwise. Spell ranges are at level 60 before spell damage.

### Races

| Race | Faction | Mage in Classic | Mage in Forever | What matters to the sim |
| --- | --- | --- | --- | --- |
| Troll | Horde | yes | yes | **Berserking** (20554): +10% casting and attack speed for 10 s, 3 min (auras 65, 319, 140) [F]; the default race |
| Orc | Horde | no | **yes (new)** | **Blood Fury** (20572): +10% attack power and **+10% spell power** (aura 317) for 15 s, 2 min [F]: the casters' shared definition, a live multiplier on your spell damage while it's up ([warlock.md §7.2](warlock.md#72-race)). Simulated since issue #10; on the defaults (seed 12345, 20,000 fights) an Orc measures level with or above a Troll: Fire 521.13 vs 516.26, Frost 411.11 vs 410.81, Arcane 405.13 vs 402.32 (± 0.2–0.5). For Fire a Human (520.65) and an Undead (517.96) measure above a Troll too: Fire's mana binds, so Berserking's casting speed mostly spends it sooner (+0.45 DPS). The default race stays Troll until the tuning milestone looks at it |
| Undead | Horde | yes | yes | nothing the sim models for a caster |
| Human | Alliance | yes | yes | The Human Spirit (+5% Spirit); Sword Specialization (+2% crit, spells too, with a sword) |
| Gnome | Alliance | yes | yes | Expansive Mind (20591): **+5% maximum mana** (aura 178) instead of Classic's +5% Intellect [F]; **Eureka!** (1259817), pressed on cooldown from the pull: the next 3 of Fireball, Scorch, Fire Blast, Frostbolt and Arcane Missiles cost 50% less mana and deal +10% (Fireball's DoT +10%; Arcane Missiles only its cost, its missiles are outside the mask; not Pyroblast) [F], its rules [?] (`src/sim/classes/eureka.ts`, `eureka`): +1.98% Fire, +0.84% Frost, +0.32% Arcane (Gnome, racial on vs off, the defaults, seed 12345, 20,000 fights) |
| High Order Skyborne | Alliance | — (new race) | yes | Wind Blessed (1259710): +1% melee and ranged haste (aura 342) and **+1% casting speed** (aura 65) [F]. Worth +0.4 Fire DPS on the default setup (+1.5 with unlimited mana) and +3.8 Frost, 20,000 fights ([Casting speed](#fire-priority-list-default)) |

[F] [client] (ChrRaces, CharBaseInfo, SkillLineAbility, SpellEffect, 1.60.1.69913;
`src/data/races/races.json`; racials in
[character-stats](../mechanics/character-stats.md#racials-that-matter-to-the-sim)).

### Changes that affect a DPS sim

| Area | Classic Era [C] | WoW Forever [F] | Source |
| --- | --- | --- | --- |
| Fireball r12 (25306) | 596–760, DoT 19 × 4 | **424.58–541.42** (483 ± 12.1%), DoT **15 × 4**; coefficient 1.0 both | [client] (SpellEffect; [f25306]); tooltip "425 to 541 … 60 Fire damage over 8 sec" |
| Scorch r7 (10207) | 237–279 | **166.68–196.12**; 0.429 | [client] ([f10207]) |
| Fire Blast r7 (10199) | 446–524 | **416.66–489.34**; 0.429 | [client] ([f10199]) |
| Pyroblast r8 (18809) | 716–890, DoT 67 × 4 | **519.84–646.16**, DoT **53 × 4** (0.15 a tick); 1.0 | [client] ([f18809]) |
| Frostbolt r11 (25304) | 515–555 | **457.24–492.76** (−11%); 0.814 | [client] ([f25304]) |
| Arcane Missiles r8 (25345 → 25346) | 230 a missile, 0.24 | **209** a missile, **0.286** | [client] ([f25346]) |
| Improved Scorch (11095 → 22959) | Fire Vulnerability on the boss for everyone's Fire (aura 87) | **your own**: aura 270 on the boss, "+3% Fire damage from the Mage" a stack | [client] (SpellEffect, 1.60.1.69913); [Improved Scorch](#improved-scorch) |
| Winter's Chill (11180 → 12579) | +2% crit a stack for anyone's Frost spells | **your own**: aura 308, class mask **Frostbolt and Ice Lance** only | [client] (SpellEffect); [Winter's Chill](#winters-chill) |
| Combustion (11129) | ends after 3 Fire crits | ends after **4** non-periodic Fire crits (`ProcCharges` 4) | [client] (SpellAuraOptions) |
| Ignite (11119) | its DoT 12654: periodic damage (aura 3), **5 stacks**, 2 s ticks for 4 s | its DoT **412538**: a one-stack periodic dummy (aura 226, 2 s for 4 s) that triggers 412545's school damage, and whose aura text deals half the amount it holds each tick: **a pooled two-tick DoT** | [client] (SpellEffect, SpellAuraOptions, SpellDuration, both builds); [Ignite](#ignite) |
| New talents | — | Arcane Blast (400574, teaches Arcane Blast r5 1239700), Missile Barrage (400588), Hot Streak (400624), Ice Lance (1312002), Fingers of Frost (400647); **Frostfire Bolt** (1237313) is a trained spell | [client] (TraitDefinition, Spell) |
| Arcane Mind (11232) | +10% maximum mana | **+10% Intellect** and **+100% Arcane crit bonus** (×2.0) | [client] (SpellEffect, CurvePoint) |
| Arcane Meditation (18462) | 15% of regeneration while casting | **50%** | [client] (SpellEffect aura 134) |
| Mage Armor r3 (22783) | 30% | **50%** | [client] (SpellEffect aura 134, both builds) |
| Arcane Focus (11222), Elemental Precision (29438) | −2% resist chance a rank (Arcane Focus 5 ranks, Elemental Precision 3) | **+1% spell hit a rank** with Arcane spells, and with Fire and Frost spells (op 16), 5 ranks each | [client] (SpellEffect, TraitDefinitionEffectPoints) |
| Arcane Impact (11242) | Arcane Explosion's crit | **+2% crit a rank to every Arcane spell** | [client] |
| Incineration (18459) | Fire Blast and Scorch +2% crit a rank, 2 ranks | also Arcane Blast and Ice Lance, **3** ranks (+6%) | [client] |
| Arcane Instability (15058) | +1% spell damage and spell crit a rank | +1% damage and **+1% crit with spells and attacks** a rank (aura 290) | [client] |
| Presence of Mind (12043), Combustion (11129) | — | share **category 1151** ("Talent - DPS"): one 3 min cooldown | [client] (SpellCategories, SpellCooldowns) |
| Mana Ruby, Mana Citrine | — | share **category 1153**'s 2 min cooldown with the **Demonic Rune** | [client] (ItemEffect, 1.60.1.69913) |
| Races | no Orc mage | **Orc** and **High Order Skyborne** mages | [client] ([Races](#races)) |

### Forever system rules that matter here (owned elsewhere)

- **One hit stat and one crit stat** for attacks and spells; a spell misses a level-63 boss 17% of
  the time before hit ([spells §1](../mechanics/spells.md#1-spell-hit)).
- **Crit ×1.5** for spells, and talents add to the bonus ([spells §2](../mechanics/spells.md#2-spell-crit)).
- **Curse of the Elements** covers every magic school, Arcane included
  ([spells §9](../mechanics/spells.md#9-caster-raid-buffs-and-debuffs)).
- **Berserking** is a flat +10% casting speed; casting speed doesn't shorten a channel
  ([spells §4](../mechanics/spells.md#4-cast-times-casting-speed-and-the-gcd)).

---

## Spells

Ranges are base × (1 ± variance / 2) plus the rank's per-level points up to 60
([spells §5](../mechanics/spells.md#5-spell-power-and-coefficients)); each matches the Forever
tooltip [F] [client] (SpellEffect, SpellMisc, SpellPower, SpellCastTimes, 1.60.1.69913;
`src/data/spells/mage.json`). Every one is magic (DefenseType 1), on the GCD, and triggers procs.
"SP" is the school's spell damage.

### Fire spells

| Spell (id) | Range at 60 | SP coefficient | Mana | Cast, cooldown |
| --- | --- | --- | --- | --- |
| Fireball r12 (25306) | 424.58–541.42, then a DoT of 15 every 2 s for 8 s (4 ticks, coefficient 0) | 1.0 | 410 | 3.5 s (3.0 with Improved Fireball 5/5) |
| Scorch r7 (10207) | 166.68–196.12 (178 ± 8.27%, +1.7 a level from 58) | 0.429 | 150 | 1.5 s |
| Fire Blast r7 (10199) | 416.66–489.34 (438 ± 8.30%, +3 a level from 54 to 59) | 0.429 | 340 | instant, 8 s (6 s with Wake of Fire 2/2) |
| Pyroblast r8 (18809) | 519.84–646.16 (583 ± 10.83%), then 53 every 3 s for 12 s (4 ticks, 0.15 a tick) | 1.0 | 440 | 6 s (Hot Streak cuts it) |

- **DoTs** snapshot your side as they land and read the boss's at each tick
  ([spells §7](../mechanics/spells.md#7-dots)); a recast restarts one.
- **Periodic crits.** The client flags both DoTs with the periodic-crit attribute (SpellMisc
  Attributes[8] 0x200 on 25306 and 18809) [F], so by spells §7 their ticks crit in `forever`, at the
  snapshot's crit, ×1.5 (`dotCanCrit`); in `classicEra` they never do. Whether flagged ticks crit in
  combat is spells.md's [OQ-S4](../mechanics/spells.md#open-questions) [?].
- **Frostfire Bolt** (1237313, trained at 40: 270–314 Frostfire, 57 over 9 s, 370 mana, 3 s,
  checked against the lower of Frost and Fire resistance) isn't simulated: it needs a spell that is
  both schools, and Improved Fireball and Hot Streak would apply to it (a known gap).
- **Blast Wave** (13021: 453–533, 45 s) is a point-blank wave around the caster, which a raid mage at
  range doesn't reach; not simulated.

### Frost spells

| Spell (id) | Range at 60 | SP coefficient | Mana | Cast |
| --- | --- | --- | --- | --- |
| Frostbolt r11 (25304) | 457.24–492.76 (475 ± 3.74%) | 0.814 | 290 (246 with Frost Channeling 3/3) | 3.0 s (2.5 with Improved Frostbolt 5/5) |

#### Frostbolt

Its tooltip multiplies effect 2's points by a description variable in both clients, which the scraper
renders: "457 to 493" in Forever, "515 to 555" in Classic Era [F] [C]. Its slow makes it **binary**: resisted whole
at `miss + (1 − miss) × average resist`, and a landed one takes no partial resist
([spells §3](../mechanics/spells.md#3-resistances)) [C] ([R1][r1-mech] gives it no partials). Its
travel time isn't simulated ([spells OQ-S13](../mechanics/spells.md#open-questions)). Ice Lance (1240047:
136–160, instant, ×4 against a Frozen target) isn't cast: a raid boss is never Frozen
([Talents › Not modelled](#not-modelled)).

### Arcane spells

| Spell (id) | Damage at 60 | SP coefficient | Mana | Cast |
| --- | --- | --- | --- | --- |
| Arcane Missiles r8 (25345 → missile 25346) | 5 missiles of 209, one a second from 1 s after the start (aura 23, period 1,000) | 0.286 a missile | 655 | a 5 s channel |
| Arcane Blast r5 (1239700) | 364.25–423.75 (394 ± 7.55%) | 0.714 | 15% of base mana (181) | 2.5 s |

- **Each missile is its own spell**, with its own hit, crit and partial resist, and fires its own
  procs (Clearcasting) [F] client structure; the rest is [?] (`mageArcaneMissiles`,
  [spells §6](../mechanics/spells.md#6-channels)). Casting speed doesn't shorten the channel, so
  Berserking does nothing for it. The channel and its missiles share one breakdown row.
- **Arcane Blast** is in the sim's spell rows but no rotation casts it: its stacks (+10% to your other
  spells and +175% to its own cost a stack, 4 stacks, 8 s) aren't modelled (a known gap).

### Cooldowns and mana abilities

| Ability (id) | Effect | Cost, cooldown, GCD | Tag, source |
| --- | --- | --- | --- |
| Combustion (11129 → 28682) | [Combustion](#combustion) | free, 3 min (category 1151), off the GCD | [F] [client] (SpellAuraOptions, SpellEffect, SpellCooldowns, SpellCategories) |
| Presence of Mind (12043) | [Presence of Mind](#presence-of-mind) | free, 3 min (category 1151), off the GCD | [F] [client] |
| Arcane Power (12042) | [Arcane Power](#arcane-power) | free, 3 min, off the GCD | [F] [client] |
| Evocation (12051) | an 8 s channel: mana regeneration +1,500% (aura 110), all of it while casting (aura 134) | free, 8 min, on the GCD | [F] [client]; [Mana](#mana) |
| Ice Barrier r4 (13033) | an 819-point absorb for 60 s (811 + 4 a level from 58) | 480 mana, 30 s, on the GCD | [F] [client] |
| Mana Ruby (item 8008 → 10058), Mana Citrine (8007 → 10057) | 1,000–1,200 and 775–925 mana | once each a fight, 2 min (category 1153), off the GCD | [F] [client] (SpellEffect, ItemEffect) |
| Berserking (20554, Troll) | +10% casting speed for 10 s | 3 min, off the GCD | [F] [client] |
| Blood Fury (20572, Orc) | +10% spell power for 15 s (a multiplier on spell damage) | 2 min, off the GCD | [F] [client] |

---

## Ignite

Ignite 5/5 (11119), Forever tooltip: "Your critical strikes from Fire damage spells cause the target
to burn for an additional 40% of your spell's damage over 4 sec" (8% a rank) [F]. Its DoT is
412538: one stack, a 2 s period for 4 s, triggering 412545's damage; its aura text deals half the
amount it holds each tick [F] [client] (SpellEffect, SpellAuraOptions,
SpellDuration, 1.60.1.69913). How the server adds a new crit to what's left isn't in the client.

**The sim's rolling Ignite** (`Plan.ignite`) [?] (`mageIgnite`):

- A crit of a direct Fire spell (Fireball, Scorch, Fire Blast, Pyroblast; not a DoT tick) adds
  **40% of the crit's final damage** to the pool: after your multipliers, the boss's damage taken and
  its average partial resist.
- It gives the pool **2 ticks, 2 s apart.** With no tick pending, the next comes 2 s after the crit;
  a tick already due **keeps its time**, and the ticks left go back to 2.
- Each tick deals **pool ÷ ticks left × the boss's Fire damage taken now × (1 − average Fire
  resist)**. It never misses, never crits and triggers nothing.
- Its row counts the crits that fed it (casts) and its ticks (hits); a marker on the boss shows its
  uptime.

**Classic Era basis** [C] (ronkuby's Classic Era fire-mage simulation, [R1][r1-mech], pinned before
Season of Discovery):

- The 40%: each tick adds 0.2 × 1.5 × the spell's hit, over two ticks.
- The double dip: the crit's damage already carries Curse of the Elements and Improved Scorch's stacks,
  and each tick multiplies by them again, with a partial resist rolled again.
- No crits on the ticks.
- **The contrast**: R1's Classic Ignite is 12654's 5-stack DoT. Up to five crits add to it and each
  refreshes it to 4 s; later crits refresh it without adding. It snapshots Power Infusion at the
  first stack into every tick. The sim's pool has no cap, and counts Power Infusion once, in the
  crit. Forever's one-stack dummy replaced that row, so the sim pools without a cap.

---

## Improved Scorch

Improved Scorch 3/3 (11095 → 22959): each landed Scorch has a **33 / 67 / 100%** chance by rank to add
a stack of **Fire Vulnerability**: **+3% Fire damage the boss takes from you** a stack, up to 5,
30 s, refreshed by each new stack [F] [client] (SpellEffect aura 270 on the enemy, ImplicitTarget 6;
SpellAuraOptions `CumulativeAura` 5; SpellDuration, 1.60.1.69913). Forever tooltip: "This
vulnerability increases all Fire damage you deal to your target by 3%".

- It's an aura the mage keeps on the boss (`schoolTaken`, [spells §9](../mechanics/spells.md#9-caster-raid-buffs-and-debuffs)),
  read at each hit and tick, Ignite's included, and it multiplies with Curse of the Elements.
- The stack lands with Scorch's hit, after its damage, with no separate roll to resist the debuff
  [?] (`mageImprovedScorch`). Scorch's travel time isn't simulated
  ([spells OQ-S13](../mechanics/spells.md#open-questions)).
- Classic Era's was a raid debuff for everyone's Fire (aura 87) that one mage kept up [C]
  ([Wowhead rotation][wh-rotation]: "It may be the role of just one Mage in a group to keep this up").

---

## Hot Streak

Hot Streak (400624 → 400625), new in Forever: "Your non-periodic critical strikes with Fireball,
Frostfire Bolt, Fire Blast, and Scorch grant Hot Streak for 15 sec. Hot Streak reduces the cast time
of Pyroblast by 25%, stacking up to 3 times" [F] tooltip; [client] (SpellEffect aura 108 misc 10,
−25, class mask Pyroblast; SpellAuraOptions: 3 stacks, 1 charge, 1.60.1.69913).

- A crit of Fireball, Fire Blast or Scorch adds a stack (Frostfire Bolt isn't simulated); a
  Pyroblast's crit doesn't.
- Pyroblast casts in 6 s × (1 − 0.25 × stacks): **4.5 s, 3 s, 1.5 s** at 1, 2, 3 stacks, then casting
  speed divides it. Its cost is unchanged.
- Casting Pyroblast **uses all the stacks** as it starts (the aura has one charge) [?]
  (`mageHotStreak`): how the server spends them is its own.

---

## Combustion

Combustion (11129 → 28682), Forever tooltip: "When activated, this spell causes each of your Fire
damage spell hits to increase your critical strike chance with Fire damage spells by 10%. This effect
lasts until you have caused 4 non-periodic critical strikes with Fire spells" [F]. [client]
(SpellAuraOptions `ProcCharges` 4 on 11129; 28682: aura 107 misc 7, +10 a stack, 10 stacks; category
1151, 3 min, 1.60.1.69913). Off the GCD and free.

The sim follows R1's model [C] ([R1][r1-mech]); Forever's server rules are [?] (`mageCombustion`):

- It goes up with **one stack**, so the first Fire spell after it already has **+10%**.
- Each Fire spell that hits adds a stack **after its own crit roll**, up to 10; the added stack keeps
  the charges left.
- Each non-periodic Fire crit uses a charge; the **4th** ends it. Ignite's ticks and the DoTs'
  ticks neither add stacks nor use charges.
- Its **3 min cooldown starts when it ends**, not when it's used, and it isn't ready while it's up.
  Presence of Mind shares the category, so it waits too.

---

## Winter's Chill

Winter's Chill 5/5 (11180 → 12579): each landed Frost damage spell has a **20% chance a rank** to add
a stack, up to 5, 15 s; each stack gives **your Frostbolt (and Ice Lance) +2% crit** against the
target [F] [client] (SpellEffect aura 308, class mask Frostbolt and Ice Lance, ImplicitTarget 6;
SpellAuraOptions 5 stacks; SpellDuration). Forever tooltip: "increases the chance your Ice Lance and
Frostbolt spells will critically hit the target by 2% for 15 sec. Stacks up to 5 times."

- It's the mage's own: other mages' Frostbolts don't use it, and yours don't use theirs. Classic
  Era's raised anyone's Frost spells, and Wowhead's Classic guide made it one mage's raid duty [C]
  ([Wowhead talents][wh-talents]: "it is vital that one Mage in every raid runs this build").
- In the sim it's Frostbolt's `critAura`: +2% crit × the stacks while they're up. The stack comes
  after the Frostbolt's own crit roll, so the first Frostbolt gets none, and a resisted one adds none.
- The chance is 20% a rank and the stacks stop at the rank (5 at 5/5) [?] (`mageWintersChill`): the
  tooltip's chance reads effect 2's points, which are 0
  ([spells OQ-S9](../mechanics/spells.md#open-questions)).

---

## Presence of Mind

Presence of Mind (12043): "When activated, your next Mage spell with a casting time less than 10 sec
becomes an instant cast spell" [F] tooltip; [client] (SpellEffect aura 108 misc 10, −100%, class mask
bit 30: Fireball, Scorch, Pyroblast, Frostbolt, Arcane Blast; one charge; category 1151, 3 min).
Off the GCD and free.

- The next spell with a cast time is instant and uses it up; Hot Streak's stacks stay for the next
  Pyroblast. Arcane Missiles (a channel) and Evocation don't use it.
- Its **3 min cooldown starts when you use it**, and Combustion's category waits with it [?]
  (`magePresenceOfMind`).
- Frost uses it on cooldown for an instant Frostbolt; Arcane pairs it with Arcane Power for an
  instant Pyroblast ([Arcane priority](#arcane-priority)).

---

## Arcane Power

Arcane Power (12042): "For the next 15 sec, your spells deal 30% more damage while costing 30% more
mana to cast" [F] tooltip; [client] (SpellEffect aura 108: +30 damage, +30 cost (misc 14);
SpellCooldowns 3 min; SpellDuration 15 s). Off the GCD and free.

- **+30% damage** to every magic school's spells, a DoT's snapshot included.
- **+30% mana cost**, rounded to a tenth of mana: Arcane Missiles 851.5, Pyroblast 572. A cast pays
  when it lands, so one that lands after Arcane Power ends pays the usual cost; a Clearcasting cast
  stays free.
- Master of Elements returns its share of the spell's base cost, without the 30%.

---

## Clearcasting

Arcane Concentration 5/5 (11213 → 12536): a **2% chance a rank** (10% at 5/5), when a damage spell
hits, of Clearcasting: the next damage spell costs no mana (−100%), one charge, 15 s [F] [client]
(SpellAuraOptions `ProcChance`, `ProcCategoryRecovery` 1,000; SpellEffect aura 108 misc 14).

- Every damage spell that hits can proc it, **each Arcane Missile included**, at most once a second
  [?] (`mageClearcasting`). DoT and Ignite ticks don't.
- The next damage spell or channel pays nothing and starts no five-second rule; it uses the charge
  even under Arcane Power.

---

## Mana

The mage uses the caster core's mana model ([spells §8](../mechanics/spells.md#8-mana);
[character-stats](../mechanics/character-stats.md#spirit-and-mana-regeneration)) and the results'
mana ledger ("Mana per fight").

| Item | Value | Tag, source |
| --- | --- | --- |
| Base mana (60) | **1,213** | [F] [client] (PlayerExpectedStat.BaseMana, `basemp.txt`, 1.60.1.69913) |
| Pool | full at the pull; maximum from base mana and Intellect | [C] ([character-stats](../mechanics/character-stats.md#intellect)) |
| Ticks | every 2 s from a random phase: **13 + Spirit / 4** outside the five-second rule, and `mp5 × 2 / 5` always | [C] ([spells §8](../mechanics/spells.md#8-mana)); [?] in Forever (`manaRegenMage`) |
| Five-second rule | a cost paid starts it as the cast lands (a channel: as it starts); a free cast starts none | [C] |
| While casting | **Mage Armor**'s 50% plus **Arcane Meditation**'s 17 / 33 / **50%** of the spirit regeneration go on inside the rule, at most all of it. The sim keeps Mage Armor up all fight [?] (`manaRegenMage`). Default builds: Fire 50% (no Arcane Meditation), Frost and Arcane 100% | [F] [client] (SpellEffect aura 134 of 22783 and 18462); `classicEra`: Mage Armor 30% [C] |
| Master of Elements 3/3 | a Fire or Frost crit returns **30% of the spell's base cost** (Fireball 123, Scorch 45, Fire Blast 102, Pyroblast 132), paid or free | [F] tooltip "refund 30% of their base mana cost" (29074 → 29077) |
| Consumables | Major Mana Potion (1,350–2,250, 2 min) and Demonic or Dark Rune (900–1,500); values owned by the [buffs doc](../mechanics/buffs-debuffs-consumables.md#35-potions-and-runes) | [C] |

### Evocation

Evocation (12051) is an 8 s channel on the GCD, every 8 minutes, so once in a default fight. While
it channels, the spirit regeneration is ×16 (+1,500%) and all of it goes on inside the five-second
rule; its four power ticks bring most of its mana [F] [client]. The rotation channels it when mana
falls to **Evocation at** (a share of maximum mana, default **0%**), or as soon as mana can't pay the
spec's filler: Fireball (410), Frostbolt (246 with Frost Channeling 3/3) or Arcane Missiles (655).
So a low threshold never leaves the mage waiting on regeneration with Evocation ready. The filler
check uses the base cost, not Arcane Power's.

### Mana gems, potion and rune

- **Mana Ruby and Mana Citrine**, once each, conjured before the pull [?] (`manaRegenMage`), each
  when all it can restore fits: missing 1,200 for the Ruby, 925 for the Citrine. Off the GCD.
  Whichever fits first goes first, and the Ruby when both fit at once. So the Citrine usually goes
  first for Fire and Frost, whose mana falls a spell at a time past 925 before 1,200, and the Ruby
  usually first for Arcane, whose Arcane Missiles (655) often carry it past both at once. The
  sooner the first gem goes, the sooner their shared cooldown lets the second go, and neither
  restores more than is missing.
- They share **category 1153**'s 2 min cooldown with the **Demonic Rune** [F] [client] (ItemEffect):
  a gem's use, its last included, holds the category, so the second gem waits 2 min after the
  first, and the rune 2 min after the second. The rune goes when missing **Demonic Rune when missing** (default
  1,500).
- The **Major Mana Potion** has its own 2 min cooldown: when missing **Major Mana Potion when
  missing** (default 2,250).
- All of them come before any spell in the priority, in the Rotation tab's order: the gems, the
  potion, the rune, then Evocation.

---

## Talents

Values are each rank curve's (TraitDefinitionEffectPoints → CurvePoint), checked by
`src/sim/classes/mage/data.test.ts` [F] [client] (1.60.1.69913). Build codes decode by tier, then
column ([data/talents.md](../data/talents.md#build-codes-verified)).

### Arcane tree

| Talent (spell) | Ranks | Forever effect at max rank | Sim |
| --- | --- | --- | --- |
| Arcane Focus (11222) | 5 | +5% hit with Arcane spells (op 16) | Arcane spell hit |
| Arcane Subtlety (11210) | 2 | the target's resistance to your spells −8 / **−15** (aura 123) | spell penetration |
| Arcane Concentration (11213) | 5 | 10% on a damage spell's hit, at most once a second: Clearcasting | [Clearcasting](#clearcasting) |
| Arcane Impact (11242) | 3 | +6% crit with Arcane spells | Arcane Missiles, Arcane Blast |
| Arcane Meditation (18462) | 3 | 17 / 33 / **50%** of regeneration while casting | [Mana](#mana) |
| Presence of Mind (12043) | 1 | the ability | [Presence of Mind](#presence-of-mind) |
| Arcane Mind (11232) | 5 | +10% Intellect (aura 137) and +100% Arcane crit bonus (×2.0) | Intellect; Arcane crit multiplier |
| Arcane Instability (15058) | 3 | +3% damage and +3% crit with spells and attacks (aura 290) | every damage spell |
| Arcane Power (12042) | 1 | the ability | [Arcane Power](#arcane-power) |

### Fire tree

| Talent (spell) | Ranks | Forever effect at max rank | Sim |
| --- | --- | --- | --- |
| Wake of Fire (11078) | 2 | Fire Blast's cooldown −2 s (−1 s a rank) | cooldown; its bonus after a kill isn't simulated |
| Incineration (18459) | 3 | +6% crit to Fire Blast, Scorch, Arcane Blast and Ice Lance | Fire Blast, Scorch, Arcane Blast |
| Improved Fireball (11069) | 5 | Fireball's cast −0.5 s | cast time |
| Ignite (11119) | 5 | 40% of a Fire crit over 4 s | [Ignite](#ignite) |
| Pyroblast (11366) | 1 | the spell | [Fire spells](#fire-spells) |
| Improved Scorch (11095) | 3 | 33 / 67 / **100%** Fire Vulnerability from Scorch | [Improved Scorch](#improved-scorch) |
| Hot Streak (400624), new | 1 | Pyroblast −25% cast a stack, 3 stacks | [Hot Streak](#hot-streak) |
| Master of Elements (29074) | 3 | a Fire or Frost crit refunds 30% of its base cost | [Mana](#mana) |
| Critical Mass (11115) | 3 | +6% crit with Fire spells | Fire spell crit |
| Fire Power (11124) | 5 | +10% Fire damage, DoTs included | Fire spells |
| Combustion (11129) | 1 | the ability | [Combustion](#combustion) |

### Frost tree

| Talent (spell) | Ranks | Forever effect at max rank | Sim |
| --- | --- | --- | --- |
| Improved Frostbolt (11070) | 5 | Frostbolt's cast −0.5 s | cast time |
| Elemental Precision (29438) | 5 | +5% hit with Fire and Frost spells (op 16) | Fire and Frost spell hit |
| Ice Shards (11207) | 5 | +100% Frost crit bonus (×2.0) | Frost crit multiplier |
| Piercing Ice (11151) | 3 | +6% Frost damage | Frostbolt |
| Frost Channeling (11160) | 3 | −15% Frost mana (rounded down to whole mana: 290 → 246) | Frostbolt's cost |
| Winter's Chill (11180) | 5 | 100% on a Frost hit: +2% Frostbolt crit a stack, 5 stacks | [Winter's Chill](#winters-chill) |
| Ice Barrier (11426) | 1 | the ability (r4 13033) | off by default ([Frost priority](#frost-priority)) |

The talents stack as the client's auras do: damage multipliers multiply (Arcane Instability × Fire
Power or Piercing Ice), crit adds (Incineration, Arcane Impact, Critical Mass, Arcane Instability),
and the crit-bonus talents set the spell's crit multiplier (×1.5 + 0.5 × 20% a rank).

### Not modelled

- **Nothing for a damage dealer on one boss:** Wand Specialization (the sim casts no wand), Improved
  Channeling and Burning Soul (pushback and threat: the sim deals no damage to you), Magic
  Absorption, Arcane Resilience, Arcane Geometry, Arcane Shielding, Improved Counterspell, Flame
  Throwing, Impact, Improved Flamestrike, Improved Fire Ward, Frost Warding, Permafrost, Improved
  Frost Nova, Frostbite, Improved Blizzard, Arctic Reach, Ice Block, Improved Cone of Cold and Cold
  Snap (no Frost cooldown the rotation uses).
- **Blast Wave**: a point-blank wave, out of a ranged mage's reach ([Fire spells](#fire-spells)).
- **Shatter, Ice Lance and Fingers of Frost**: Shatter's +50% crit and Ice Lance's ×4 need a Frozen
  target, which a raid boss never is; Fingers of Frost (15% on a Chill: your next 2 spells treat the
  target as Frozen) would make one, and with them a different Frost rotation. It needs its own model
  and a test of its proc on a boss (a known gap). No default build takes them.
- **Arcane Blast's stacks** and **Missile Barrage** (Arcane Blast 40%, Fireball and Frostbolt 20%:
  the next Arcane Missiles is half as long, free, a missile every 0.5 s): an Arcane Blast rotation
  needs both (a known gap). The Frost and Arcane builds learn Arcane Blast on the way down the tree.
- **Frostfire Bolt**, which Improved Fireball, Hot Streak and Missile Barrage name
  ([Fire spells](#fire-spells)).

---

## Fire priority

### Damage sources (Fire)

On the default setup: Fireball about 34% (its DoT 1%), Pyroblast 24% (its DoT 6%), Fire Blast 21%,
Ignite 12%, Scorch 8%.

**Classic Era approach** [C]:

- [Wowhead's Classic rotation][wh-rotation] (Phase 6): "Scorch until Improved Scorch is up to 5
  stacks (It may be the role of just one Mage in a group to keep this up)", then Combustion with any
  damage racials and trinkets, then Fireball.
- [Icy Veins' Classic rotation][iv-rotation]: "Maximize Winter's Chill and Improved Scorch stacks on
  the enemy", Fireball otherwise; Fire Blast to finish enemies; Combustion "when you have trinkets
  and other cooldowns available to stack with it"; Evocation "at low Mana"; the Mana Ruby, Major
  Mana Potion and Demonic Runes for mana.
- [R1][r1-const] refreshes Scorch with at most 5 s of Fire Vulnerability left (`_MAX_SCORCH_REMAIN`).

**Adapted to Forever**:

- **Scorch for your own stacks.** Fire Vulnerability is yours, so every Fire mage keeps its own five,
  and again with 5 s or less left, or sooner when the spell it would cast next (a 4.5 s Pyroblast)
  would let them run out before the Scorch after it lands: the Scorch must *land* in time, at any
  casting speed.
- **Pyroblast on Hot Streak.** Pyroblast was an opener in Classic; Hot Streak makes it a cast worth
  weaving, at the first stack by default ([First-pass defaults](#first-pass-defaults)).
- **Fire Blast on cooldown.** Its 340 mana buys 417–489 instantly, and Forever's Fireball fell further
  than Fire Blast did.
- **Combustion on cooldown from the pull**, with Berserking and the trinkets: off the GCD, and its
  cooldown waits for its fourth crit anyway.

### Fire priority list (default)

Evaluated top to bottom whenever the mage is free. Setting ids are `mage.fire.<x>` (written without
the prefix below), in the Rotation tab's groups. A mana threshold is a share of maximum mana.

| # | Action | Condition (setting, default) | Default |
| --- | --- | --- | --- |
| 1 | Combustion, off the GCD | `combustion.enabled`, with the talent; ready | on |
| 2 | Berserking (Troll), Blood Fury (Orc) or Eureka! (Gnome), off the GCD | `racial.enabled`; on cooldown | on |
| 3 | On-use trinkets, off the GCD | `trinkets.enabled`; on cooldown | on |
| 4 | Power Infusion, off the GCD | `powerInfusion.enabled`, with Power Infusion selected in Buffs; ready | on (Buffs: off) |
| 5 | Mana Ruby or Mana Citrine, whichever fits first (the Ruby on a tie) | `manaGems.enabled`; missing 1,200 / 925 | on |
| 6 | Major Mana Potion | `manaPotion.enabled`, selected in Buffs (Standard raid); missing `manaPotion.missingMana` | on, 2,250 |
| 7 | Demonic Rune | `rune.enabled`, selected in Buffs (Max consumables); missing `rune.missingMana`; after the gems | on, 1,500 |
| 8 | Evocation | `evocation.enabled`; mana ≤ `evocation.maxManaPct`, or below Fireball's cost | on, 0% |
| 9 | Scorch | `scorch.enabled`, with Improved Scorch; Fire Vulnerability under 5 stacks, or at most `scorch.refreshSec` left, or at most a Pyroblast's cast (when row 10 would go) or a Fireball's, plus a Scorch's, left (COND 44) | on, 5 s |
| 10 | Pyroblast | `pyroblast.enabled`, with Hot Streak and Pyroblast; at least `pyroblast.minStacks` Hot Streak stacks (1–3). If it would land up to 0.3 s before its own DoT's next tick, the mage waits and lands it with the tick (COND 45) | on, 1 stack |
| 11 | Fire Blast | `fireBlast.enabled`; ready | on |
| 12 | Fireball | always, unless Fire Blast is ready within 0.3 s: the mage waits for it (COND 1) | — |

**Casting speed** (issue review EI-1, September 2026). Every cast used to end on a 1.5 s grid at ×1.00
casting speed, and three ties on that grid decided more than the speed did (Human, unlimited mana,
4,000 fights: ×1.00 558.3, ×1.002 552.5, ×1.01 555.8, ×1.02 559.7 DPS):

- **Fire Blast** (row 12): at ×1.00 a Pyroblast or two Fireballs after Fire Blast end the very
  millisecond its 6 s cooldown does. A hair faster, they end a few ms early and a 3 s Fireball
  started, holding Fire Blast back a whole cast (21.1 → 19.0 a fight). Fireball now waits up to
  `FIRE_WAIT_MS` (0.3 s) for it [?] (`mageFireWait`).
- **Pyroblast's DoT** (row 10): a Pyroblast, Fire Blast and two Fireballs take 12.0 s at ×1.00, its
  DoT's length, so the next Pyroblast landed with the last tick (a tick due that moment lands first,
  [spells §7](../mechanics/spells.md#7-dots)); a hair faster, it landed first and cut the tick off.
  A recast restarts the DoT and loses the tick in progress, so Pyroblast now waits up to 0.3 s to
  land with the tick.
- **Fire Vulnerability** (row 9): a Pyroblast started with 5–6 s of it left leaves 1.5 s, and the
  Scorch after it lands as it runs out (at ×1.00, the same millisecond, which the expiry wins), so
  five more Scorches rebuilt it. Scorch now goes first whenever the Pyroblast, or a Fireball, and then
  a Scorch wouldn't land in time, at their cast times now.

0.3 s is near where waiting stops paying, across common casting speeds [?]: at about 560 DPS it costs
about 170 damage, what a cut-off Pyroblast tick (53 + 0.15 SP, with its crits) or a Fire Blast held
back a Fireball costs. Measured (Human, unlimited mana, seed 12345, 4,000 fights, ±0.8), waits of 0,
0.15, 0.3, 0.45 and 0.6 s give ×1.00 561.8 for each; ×1.01 556.1, then 564.0 for each of the rest;
×1.05 573.3, 573.8, 576.1, 575.6, 575.2; ×1.10 592.3, 592.3, 591.9, 590.5, 590.3. So no wait loses at
×1.01, 0.3 s is best at ×1.05 and within the noise of the best at ×1.10, and longer waits start to
lose. Afterwards (same runs): ×1.00 561.3, ×1.002 560.3, ×1.01 562.6, ×1.02 565.4, and on
the default setup (Troll, with its mana, seed 12345, 1,000 fights) the golden moved 513.15 → 514.50. The
1 DPS left at ×1.002 is within those runs' ±0.8 (95% CI).

---

## Frost priority

### Damage sources (Frost)

Frostbolt, all of it. About 10% of the casts miss or are resisted whole on the default setup.

**Classic Era approach** [C]: [Wowhead's Classic rotation][wh-rotation]: "Frostbolt; once Winter's
Chill is up to five stacks use Arcane Power and any damage related racials/trinkets; Frostbolt", for
both the Arcane Power and the Winter's Chill builds. [Icy Veins][iv-rotation]: Presence of Mind "can
also be used to burst with Pyroblast (or Frostbolt / Fireball)".

**Adapted to Forever**:

- **Frostbolt**, with Winter's Chill as your own crit rather than a raid duty.
- **Presence of Mind on cooldown** for an instant Frostbolt (the default build has no Arcane Power:
  [Defaults](#defaults)).
- **Ice Barrier off.** The sim deals no damage to you, so its shield only costs a GCD and 480 mana; in
  a raid it stops pushback. The default build doesn't take it.

### Frost priority list (default)

Setting ids are `mage.frost.<x>`.

| # | Action | Condition (setting, default) | Default |
| --- | --- | --- | --- |
| 1 | Presence of Mind, off the GCD | `presenceOfMind.enabled`, with the talent; ready | on |
| 2–7 | Berserking, trinkets, Power Infusion, mana gems, Major Mana Potion, Demonic Rune | as Fire's 2–7 | as Fire's |
| 8 | Evocation | `evocation.enabled`; mana ≤ `evocation.maxManaPct`, or below Frostbolt's cost | on, 0% |
| 9 | Ice Barrier | `iceBarrier.enabled`, with the talent; ready | **off** |
| 10 | Frostbolt | always | — |

---

## Arcane priority

### Damage sources (Arcane)

Arcane Missiles about 96%, Pyroblast 3% (with its DoT), Ignite under 1%.

**Classic Era approach** [C]: Classic Era raided with Arcane Power and Presence of Mind on Frost
(Wowhead's "Arcane Power Frost 31/0/20", [talents][wh-talents]) or on Fire, and Presence of Mind
went on a Pyroblast ([Icy Veins][iv-rotation]). Neither guide has an Arcane Missiles spec:
Wowhead's rotation says Arcane Missiles "is outshined by both Fireball and Frostbolt"
([rotation][wh-rotation]).

**Adapted to Forever**: Arcane Impact (+6% Arcane crit), Arcane Mind (×2.0 Arcane crit) and the 0.286
coefficient make Arcane Missiles the Arcane filler. **Arcane Power and Presence of Mind on cooldown
from the pull**, Presence of Mind spent on a **Pyroblast**, as Classic Era's AP/PoM mage did, and
**Arcane Missiles** otherwise. Arcane Blast's stacks aren't modelled, so it isn't cast
([Arcane spells](#arcane-spells)).

### Arcane priority list (default)

Setting ids are `mage.arcane.<x>`.

| # | Action | Condition (setting, default) | Default |
| --- | --- | --- | --- |
| 1 | Arcane Power, off the GCD | `arcanePower.enabled`, with the talent; ready | on |
| 2 | Presence of Mind, off the GCD | `presenceOfMind.enabled`, with the talent; ready | on |
| 3–8 | Berserking, trinkets, Power Infusion, mana gems, Major Mana Potion, Demonic Rune | as Fire's 2–7 | as Fire's |
| 9 | Evocation | `evocation.enabled`; mana ≤ `evocation.maxManaPct`, or below Arcane Missiles' cost | on, 0% |
| 10 | Pyroblast | with Presence of Mind and Pyroblast; while Presence of Mind's aura is up | on (with Presence of Mind) |
| 11 | Arcane Missiles | always | — |

---

## Defaults

| Setting | Default | Why / source |
| --- | --- | --- |
| Fire talents | **`230225-23550000130133051-005`** (Arcane 14 / Fire 32 / Frost 5): Wand Specialization 2, Arcane Focus 3, Arcane Subtlety 2, Magic Absorption 2, Arcane Concentration 5; Wake of Fire 2, Incineration 3, Improved Fireball 5, Ignite 5, Pyroblast 1, Improved Scorch 3, Hot Streak 1, Master of Elements 3, Critical Mass 3, Fire Power 5, Combustion 1; Elemental Precision 5 | Wowhead's Classic "Combustion Fire 17/31/3" (`230025030002-5052000123033151-003`, [talents][wh-talents]) [C], adapted: Hot Streak (new), and Elemental Precision's five ranks of hit (it had three of resist chance). The Arcane side stops at 14 points, short of Arcane Meditation (tier 4) |
| Frost talents | **`230225200100301--055510033002000105`** (21 / 0 / 30): Wand Specialization 2, Arcane Focus 3, Arcane Subtlety 2, Magic Absorption 2, Arcane Concentration 5, Arcane Resilience 2, Arcane Blast 1, Arcane Meditation 3, Presence of Mind 1; Improved Frostbolt 5, Elemental Precision 5, Ice Shards 5, Permafrost 1, Piercing Ice 3, Frost Channeling 3, Arctic Reach 2, Cold Snap 1, Winter's Chill 5 | Wowhead's Classic "Arcane Power Frost 31/0/20" (`2300450310031531--053500030013`) and "Winter's Chill Frost 19/0/32" (`230045200003--05350013122301051`) [C]. Winter's Chill is your own crit in Forever, and it and Arcane Power (31 Arcane points) don't fit in one build, so the default is the Winter's Chill shape with Presence of Mind and Arcane Meditation |
| Arcane talents | **`050225003100301531-2355001010003-`** (31 / 20 / 0): Arcane Focus 5, Arcane Subtlety 2, Magic Absorption 2, Arcane Concentration 5, Arcane Impact 3, Arcane Blast 1, Arcane Meditation 3, Presence of Mind 1, Arcane Mind 5, Arcane Instability 3, Arcane Power 1; Wake of Fire 2, Incineration 3, Improved Fireball 5, Ignite 5, Burning Soul 1, Pyroblast 1, Master of Elements 3 | AP Frost's 31 Arcane points (with Forever's Arcane Impact and Arcane Mind, now Arcane crit) and a Fire side for Presence of Mind's Pyroblast. Wake of Fire, Incineration, Improved Fireball and Burning Soul do nothing in its rotation: they're the way to Pyroblast (tier 3) and Master of Elements (tier 4) |
| Race | **Troll** (Horde) | Berserking's +10% casting speed; an Orc's Blood Fury (+10% spell power for 15 s every 2 min) is the other racial cooldown for a mage, and measures as much or more since it's simulated ([Races](#races)) |
| Gear | Fire: Icy Veins' Classic mage pre-raid list; Frost and Arcane: Wowhead's ([Races and gear](#races-and-gear)) | [pre-raid BiS](../data/items.md#pre-raid-bis-lists) [C] |
| Enchants | **Greater Stats on the chest** only | the enchant catalogue has no caster enchants yet (a known gap: spell damage on the weapon, head, legs, gloves and shoulders) |
| Buffs | the Standard raid preset ([buffs §6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset)): the caster core's **Curse of the Elements**, Arcane Brilliance, Prayer of Spirit, Blessing of Wisdom, Mana Spring Totem, Moonkin Aura (the casters' party crit aura). Nothing that changes only attacks (Battle Shout, Windfury Totem, Sunder Armor, …): those are the melee's, not listed for a mage ([buffs "Class-only entries"](../mechanics/buffs-debuffs-consumables.md#class-only-entries)). **Power Infusion off** (another priest's cooldown; an option). **No world buffs** ([D8](../decisions.md#d8-world-buffs-are-excluded-2026-09-22)) | buffs doc |
| Consumables | Standard raid: **Greater Arcane Elixir**, **Major Mana Potion**. Max adds **Flask of Supreme Power**, the **Demonic Rune**, **Nightfin Soup** (+22 spell damage) and **Brilliant Wizard Oil** (+36, +1% spell crit) | [buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset); [Wowhead consumables][wh-consumables] [C] |
| Rotation | the priority lists above with their first-pass defaults | [First-pass defaults](#first-pass-defaults) |

Wowhead's Classic consumables list also has Brilliant Wizard Oil ("the best Weapon Oil in the game"),
Elixir of Frost Power, Mageblood, Nightfin Soup and Runn Tum Tuber Surprise [C]
([consumables][wh-consumables]). Brilliant Wizard Oil and Nightfin Soup (+22 spell damage in Forever)
are in the catalogue since the Protection paladin's threat fixes (T2), and in the Max-consumables
preset ([buffs §3.4, §3.6](../mechanics/buffs-debuffs-consumables.md#36-weapon-enhancements-temporary));
the others aren't yet (a known gap).
Wowhead's Elixir of Greater Firepower (21546) is Forever's Elixir of Holy Power (Holy only), which does
nothing for a mage.

### Races and gear

- **Armor and weapons**: cloth; daggers, one-handed swords and staves; wands [C]. No shield.
- **Fire**: [Icy Veins' Classic mage pre-raid list][iv-prebis] (archived 2021-02-15, "for Fire mages
  heading into AQ40"), since Wowhead's Classic guide has no Fire list. A Troll wears: Spellweaver's
  Turban, Nacreous Shell Necklace, Champion's Silk Mantle, Crystalline Threaded Cape, Bloodvine Vest,
  Rockfury Bracers, Blood Guard's Silk Handwraps, Ban'thok Sash, Bloodvine Leggings, Bloodvine Boots,
  Rune Band of Wizardry, Wrath of Cenarius, Briarwood Reed, Draconic Infused Emblem, Mindfang, Tome of
  Fiery Arcana and Pyric Caduceus.
- **Frost and Arcane**: [Wowhead's Classic mage pre-raid list][wh-prebis] (archived 2021-05-15), one
  list with no spec split, a Frost list by its picks; Arcane reuses it (Classic Era had no Arcane
  list). A Troll wears: Champion's Silk Cowl, Orb of the Darkmoon, Boreal Mantle, Amplifying Cloak, Robe
  of the Archmage, Rockfury Bracers, Hands of Power, Ban'thok Sash, Legionnaire's Silk Legguards, Blood
  Guard's Silk Walkers, Rune Band of Wizardry, Don Mauricio's Band of Domination, Briarwood Reed, Eye of
  the Beast, Witchblade, Therazane's Touch and Wand of Biting Cold. The list's rank-1 dagger, Sageclaw,
  needs the League of Arathor (Alliance), and the list has no Horde twin, so a Troll's main hand is the
  rank-2 Witchblade.
- **Random-suffix items** whose base item has no spell stats are dropped, and the entries below them
  move up; the lists' notes name them (`scripts/scrape/pre-raid-bis.json`).

---

## First-pass defaults

The defaults are the Classic Era priorities adapted to Forever, with one quick search of the biggest
settings, as [D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)
asks: 20,000 fights on seed 1, each spec's default setup (Troll, 180 s ± 10%, 20% execute), paired
against the defaults with `scripts/tune/rotation.mjs --spec mage-<spec>`. The Rotation tab calls them
"the common priority" until the tuning milestone (M10) tunes them under
[D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23).

The search changed three things: the **Major Mana Potion** joined the mages' Standard and Max presets,
as the other mana users'; **Evocation** also goes when mana can't pay the spec's filler, and "Evocation
at" defaults to **0%**; and **Pyroblast** goes at **1** Hot Streak stack (it was 3).

**Fire**: baseline **515.57 ± 0.51 DPS** (95% CI). Each row is the change from it:

| Candidate | Δ DPS | Δ % |
| --- | --- | --- |
| Pyroblast at 2 / 3 Hot Streak stacks | −4.73 / −10.35 | −0.92% / −2.01% |
| Fire Blast off | −19.32 | −3.75% |
| Scorch again at 15 s left (vs 5 s) | +0.93 | +0.18% |
| Combustion off | −18.83 | −3.65% |
| Evocation at 10% / 20% (vs 0%) | −0.15 / −0.53 | −0.03% / −0.10% |
| Mana gems off | −33.17 | −6.43% |

**Frost**: baseline **411.01 ± 0.34 DPS**:

| Candidate | Δ DPS | Δ % |
| --- | --- | --- |
| Evocation at 10% / 20% (vs 0%) | −1.00 / −4.59 | −0.24% / −1.12% |
| Presence of Mind off | −2.90 | −0.71% |
| Mana gems off | −12.37 | −3.01% |
| Ice Barrier on | 0: the default build doesn't take it | — |

**Arcane**: baseline **402.25 ± 0.23 DPS**:

| Candidate | Δ DPS | Δ % |
| --- | --- | --- |
| Arcane Power off | −13.13 | −3.26% |
| Presence of Mind off | −8.64 | −2.15% |
| Evocation at 20% (vs 0%) | −1.42 | −0.35% |
| Mana gems off | −4.41 | −1.10% |

- **Fire's mana is its limit**: the gems are worth 6.43%. In the first search, before the potion
  joined its preset, Fire ran out (416 DPS, with Evocation off costing 22% and the gems 11%), and
  cheaper Scorch refreshes gained steadily. Scorch again at 15 s gains 0.18%, within D27's first
  pass, so it stays at R1's 5 s.
- **Pyroblast at 1 stack**: a 4.5 s Pyroblast beats waiting for more stacks (+1.74% against 3).
- **Berserking** doesn't haste the Arcane Missiles channel (casting speed doesn't shorten channels,
  [spells §4](../mechanics/spells.md#4-cast-times-casting-speed-and-the-gcd)), so Arcane gets less
  from it than the others.
- The `classicEra` profile's baselines, from the first search: Fire 372.30, Frost 383.38, Arcane
  345.60 DPS.
- The Frost and Arcane rows are from the first search; Combustion's stacks and the gems' shared
  cooldown (fixed since) moved their baselines by under 0.3%.

---

## Base stats

The Forever client ships no class base attributes, base crit or base health
([character-stats](../mechanics/character-stats.md#what-the-forever-client-ships-and-does-not)).
Until a tier 1–3 source has them, these are
[D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23) placeholders, shown on
the sheet and in the results' assumptions (`baseStatPlaceholders`):

| Value | Placeholder | Tag, origin |
| --- | --- | --- |
| Attributes (Str / Agi / Sta / Int / Spi) | Human 30 / 35 / 45 / 125 / 120; Gnome 25 / 38 / 44 / 128 / 120; Orc 33 / 32 / 47 / 122 / 123 (the class row plus the [C] Orc offset: Classic Era had no Orc mage); Undead 29 / 33 / 46 / 123 / 125; Troll 31 / 37 / 46 / 121 / 121; High Order Skyborne 30 / 35 / 45 / 125 / 120 (the class row: Skyborne offsets are unknown) | [?] placeholder (D24); origin: [mangos player_levelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql) (class row 30 / 35 / 45 / 125 / 120 plus the race offsets; wowsims/classic's `ClassBaseStats` has the same row), not evidence. Mangos' Gnome row (Int 133) fits neither the offsets nor Classic's +5% Intellect, which Forever removed, so the Gnome row is the model's |
| Base health | 1,360 | [?] placeholder (D24); origin: [mangos player_classlevelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql); wowsims/classic's 1,370 conflicts; not evidence |
| Base spell crit | **0.2%** | [?] placeholder (D24); origin: [wowsims/classic base_stats.go](https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go), and RatingBuster since [d8588dcd](https://github.com/raethkcj/RatingBuster/commit/d8588dcd1644e635ac664d468e1614726f885bf7), which corrected its −4.8%; not evidence |
| Base melee crit, base dodge | 3.2%, 3.2% | [?] placeholder (D24); origin: both sources agree; nothing in the sim uses them |

From the client [F] [client] (PlayerExpectedStat, `basemp.txt`, ChrClasses, 1.60.1.69913): base mana
**1,213**; spell crit per Intellect 0.000168 (**59.5 Intellect per 1%**); crit per Agility 0.000514
(19.46 Agility per 1%); cloth. A mage can't parry, block or use a shield.

---

## Implementation notes

The class is data and rotation in `src/sim/classes/mage/` (`abilities.ts`, `talents.ts`, `setup.ts`,
`rotation.ts`) on the engine's generic pieces ([architecture](../architecture.md#the-event-loop)):

- **Ignite** is an `ignite` proc on spell crits of Fire; the plan makes one rolling DoT of it
  (`Plan.ignite`: pct, ticks, period, school, row, marker aura), which the engine feeds and ticks.
- **Fire Vulnerability**, **Hot Streak**, **Winter's Chill** and **Combustion**'s stacks are procs
  on `spellLanded` or `spellCrit`, filtered by school or one spell (`fromSpell`). Winter's Chill is
  Frostbolt's `critAura` (crit per stack of a plan aura); Hot Streak is Pyroblast's `stackAura`, which
  cuts only its cast time (`stackCostPct` 0).
- **Combustion**'s aura has 4 `critCharges` that only Fire crits use (`critChargeSchools`), a stack
  added keeps them (`refreshKeepsCharges`), and its ability's cooldown starts when its aura ends
  (`cooldownAfterAura`), with its category's (Presence of Mind's).
- **Presence of Mind** is every cast-time ability's `instantAura`: while it's up, the cast is instant
  and uses it up.
- **Arcane Power** is an aura with school damage and `manaCostPct`; **Clearcasting** is the plan's
  free-cast aura (`Plan.freeCastAura`); **Master of Elements** is a `manaOfCost` proc.
- **Arcane Focus** and **Elemental Precision** are spell hit per school (`schoolHit`), so each school
  reads its own miss chance.
- **Scorch**'s lines use conditions `auraStacksBelow` (42), `auraEndsWithin` (43) and
  `auraEndsBeforeCasts` (44: the aura has at most another ability's cast time now plus the line's own
  left, both with casting speed and their stacks' cut) on Fire Vulnerability; Pyroblast's uses
  `auraStacksAtLeast` (34) on Hot Streak and `dotTickWait` (45: when its cast would land up to b ms
  before its own DoT's next tick, the walk stops and resumes as it can land with the tick); Fireball
  `cooldownAtLeast` (1) on Fire Blast; Arcane's Pyroblast `abilityAuraUp` (10) on Presence of Mind;
  Evocation `maxMana` (19).
- **The gems** are `usesPerFight` 1 casts in the gem category, which the Demonic Rune joins.
- **No weapon**: a mage's plan has no weapon, so no swing, no weapon proc and no "no weapon" note.

---

## Worked examples

Assumptions unless stated: level 60 against a level-63 boss; **400 spell damage** in every school;
spells always hit; no gear, buffs or regeneration beyond what the example names; the boss's average
partial resist, **6%** (×0.94, from its level-based 24). Numbers use the defaults marked [?] above,
so a test failing after a beta measurement means a default changed, not a bug. Each runs through the
engine in `src/sim/classes/mage/mage.test.ts` ("worked examples"), in the `forever` profile.

1. **A Fireball hit** (Fire Power 5/5, Arcane Instability 3/3, 5 Fire Vulnerability stacks, Curse of
   the Elements): (483 + 1.0 × 400) × 1.10 × 1.03 × 1.15 × 1.10 × 0.94 = **1,189.62** at the middle of
   its range (**1,110.92–1,268.32** over 424.58–541.42). Curse of the Elements' −75 can't take the
   boss below its own 0, so the level's 24 still resists.
2. **A Frostbolt crit** (Ice Shards 5/5): (475 + 0.814 × 400) × 2.0 = (475 + 325.6) × 2.0 =
   **1,601.2** (**1,565.69–1,636.71** over its range). It's binary, so a landed one takes no partial
   resist.
3. **Ignite from one 1,000 crit** (Ignite 5/5): 40% = **400** into the pool; **2 ticks of 200 × 0.94 =
   188**, 2 s and 4 s after the crit. With Fire Vulnerability or Curse of the Elements up, each tick
   is multiplied by them again.
4. **Scorch's refresh** (Improved Scorch 3/3, Scorch again at 5 s, Fireball's 3.5 s cast): Scorches
   at 0, 1.5, 3, 4.5 and 6 s put up 5 stacks by 7.5 s, which hold to **37.5 s**. Fireballs follow from
   7.5 s. The one starting at 32 s sees 5.5 s left, more than 5, so it's another Fireball; at 35.5 s,
   2 s are left, so a **Scorch**, landing at 37 s. With the setting at 10 s, the Scorch comes at
   **28.5 s** (9 s left).
5. **Pyroblast on Hot Streak** (Pyroblast at 3 stacks, every Fireball a crit): Fireballs at 0, 3.5 and
   7 s land their crits at 3.5, 7 and 10.5 s; at 3 stacks Pyroblast casts in 6 s × (1 − 3 × 0.25) =
   **1.5 s**, from 10.5 s, and uses them all; the next Fireball starts at 12 s. At 1 stack (the
   default) it casts in **4.5 s**.

---

## Open questions

Each needs an in-game test on the Forever beta; record the result here with build, date, method and
sample size ([doctrine §2](../doctrine.md#2-where-numbers-come-from-non-negotiable)). Effects are on
the default setups' DPS. Each names the results' assumption it's listed under.

1. **OQ-M1: Ignite's pooling** (`mageIgnite`). The sim pools every Fire crit's 40% into two ticks, a due
   tick keeping its time; the rules are server-side. *Test:* two Fire crits 1 s apart (Fire Blast, then
   Scorch) on a dummy; log Ignite's ticks and compare them with the pool rule. *Effect:* Ignite is 12% of
   Fire's damage; a different pooling rule moves Fire by up to ±2%.
2. **OQ-M2: Improved Scorch's stacks** (`mageImprovedScorch`) land with Scorch's hit, with no separate
   resist. *Test:* count Fire Vulnerability stacks against landed Scorches over 100 casts. *Effect:*
   under 0.5% (a lost stack costs one more Scorch).
3. **OQ-M3: Hot Streak's stacks** (`mageHotStreak`): does Pyroblast spend them all, or one? *Test:* log
   the aura's stacks around a Pyroblast cast at 2 stacks. *Effect:* Pyroblast is 24% of Fire's damage; if
   it spends one, the default (1 stack) keeps the rest: up to +2%.
4. **OQ-M4: Combustion's model** (`mageCombustion`): +10% on the first spell, a stack per Fire hit after
   its crit roll, 4 crits, the cooldown from the last. *Test:* log Fire crits and Combustion's stacks
   after activation, and its cooldown. *Effect:* Combustion is worth 3.49% in all; its details under 1%.
5. **OQ-M5: Winter's Chill's chance and cap** (`mageWintersChill`): 20% a rank, stacks up to the rank.
   *Test:* count stacks after each Frostbolt at 5/5 and 1/5. *Effect:* none at 5/5 if the chance is 100%;
   at a flat 20% the stacks build 5× slower, under 1%.
6. **OQ-M6: Clearcasting from each missile** (`mageClearcasting`), at most once a second. *Test:* count
   Clearcasting procs over 500 missiles. *Effect:* under 0.5% for Arcane (its gems are worth 0.84%); more
   for Fire, whose mana binds.
7. **OQ-M7: Arcane Missiles' channel** (`mageArcaneMissiles`): 5 missiles 1 s apart, casting speed doesn't
   shorten it (spells [OQ-S6](../mechanics/spells.md#open-questions)). *Test:* time 5 missiles with and
   without Berserking. *Effect:* if Berserking hastened it, about +0.5% for Arcane.
8. **OQ-M8: Presence of Mind's cooldown** (`magePresenceOfMind`) starts when you use it. *Test:* the
   cooldown timer after using it, before casting. *Effect:* under 0.3% (a second use near the fight's
   end).
9. **OQ-M9: the mage's regeneration** (`manaRegenMage`): 13 + Spirit / 4 a tick, Mage Armor up all
   fight, gems conjured before the pull. *Test:* mana ticks at two Spirit values, in and out of the
   five-second rule, with Mage Armor. *Effect:* 10% less regeneration (about 900 mana a fight) ≈ −3%
   for Fire, whose gems' 1,950 mana are worth 6.43%; about −1.3% for Frost and −0.4% for Arcane.
10. **OQ-M10: the spell table** (`mageSpells`): the level-based resistance of 24 (6% on average),
    Frostbolt resisted whole, projectiles landing with the cast, and the Forever rows untested in game
    (spells [OQ-S1, OQ-S2, OQ-S8, OQ-S13](../mechanics/spells.md#open-questions)). *Test:* 200 Frostbolts
    and 200 Fireballs on a level-63 dummy: count whole and partial resists, and compare damage with the
    tooltips. *Effect:* ±2–3% for every spec from the resistance; about 1% from the binary rule.
11. **OQ-M11: reaction time** (`reactionTimeMage`): the rotation acts the moment a cast lands or the mana
    arrives. *Effect:* small with spell queueing; owned by
    [damage-and-timing §3.6](../mechanics/damage-and-timing.md#36-server-tick-and-spell-batching).
12. **OQ-M12: base stats** (`baseStatPlaceholders`): the attributes, health and base spell crit are D24
    placeholders ([Base stats](#base-stats)). *Test:* a naked level-60 mage's character sheet per race
    (it shows spell crit). *Effect:* 1% spell crit is worth about 1% (Frost's crits ×2.0); ±5 Intellect
    under 0.2%.

---

## Sources

| Source | What it covers | Ruleset |
| --- | --- | --- |
| Client DB2 tables and game tables, Forever 1.60.1.69913 and Classic Era 1.15.9.69722, via the wago.tools API, parsed into `src/data/client/*.json`, `src/data/spells/mage.json`, `src/data/talents/mage.json` ([client.md](../data/client.md)) | every [F] number: ranges, coefficients, costs, cast times, cooldowns and categories, charges, stacks, auras, class masks, talent curves, base mana, crit per stat, races | Forever [F] / Classic Era [C] |
| [R1] ronkuby's Classic Era fire-mage simulation, pinned before Season of Discovery (commit 9ae1d3bb, 2023-10-19): [mechanics][r1-mech], [constants][r1-const] | Ignite's 40%, double dip and ticks; Combustion's model; Scorch refresh at 5 s; Frostbolt without partials | Classic Era [C] |
| [Wowhead Classic: mage rotation][wh-rotation], [talents and builds][wh-talents], [consumables][wh-consumables], [pre-raid BiS][wh-prebis] (Wayback, 2021) | the Classic Era priorities, the builds the defaults adapt, consumables, the Frost and Arcane gear | Classic Era [C] |
| [Icy Veins Classic: mage rotation][iv-rotation], [pre-raid gear][iv-prebis] (Wayback, 2021) | Scorch and Winter's Chill stacks, Presence of Mind on Pyroblast, Evocation, the Fire gear | Classic Era [C] |
| [mangos player_levelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql), [player_classlevelstats](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql) | the D24 attribute and health placeholders | **Forbidden** as evidence (an emulator); placeholders only, under D24 |
| [wowsims/classic base_stats.go](https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go), [RatingBuster d8588dcd](https://github.com/raethkcj/RatingBuster/commit/d8588dcd1644e635ac664d468e1614726f885bf7) | base spell crit, melee crit and dodge placeholders | secondary (mixed lineage) [?] |

[r1-mech]: https://github.com/ronkuby-mage/fire-mage-simulation/blob/9ae1d3bbbdeba7468b48f02c28aafa747c17f26d/src/sim/mechanics.py
[r1-const]: https://github.com/ronkuby-mage/fire-mage-simulation/blob/9ae1d3bbbdeba7468b48f02c28aafa747c17f26d/src/sim/constants.py
[wh-rotation]: http://web.archive.org/web/20210515120244/https://classic.wowhead.com/guides/mage-dps-rotation-abilities-classic-wow
[wh-talents]: http://web.archive.org/web/20210515183325/https://classic.wowhead.com/guides/mage-dps-talents-builds-classic-wow
[wh-consumables]: http://web.archive.org/web/20210515120525/https://classic.wowhead.com/guides/mage-dps-consumables-classic-wow
[wh-prebis]: https://web.archive.org/web/20210515152513/https://classic.wowhead.com/guides/wow-classic-mage-dps-pre-raid-best-in-slot-gear
[iv-rotation]: http://web.archive.org/web/20210421131322/https://www.icy-veins.com/wow-classic/mage-dps-pve-rotation-cooldowns-abilities
[iv-prebis]: https://web.archive.org/web/20210215101245/https://www.icy-veins.com/wow-classic/mage-dps-pre-raid-gear

### DB2 links (per spell)

Browse links to the same rows on wago.tools' table pages, for reading by hand; the pages stay
off-limits to scripts ([D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)).

[f25306]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=25306
[f10207]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10207
[f10199]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10199
[f18809]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=18809
[f25304]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=25304
[f25346]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=25346

- Fireball [f25306]; Scorch [f10207]; Fire Blast [f10199]; Pyroblast [f18809]; Frostbolt [f25304];
  Arcane Missiles' missile [f25346]. The same `filter[SpellID]` works on SpellAuraOptions, SpellMisc,
  SpellCategories, SpellCooldowns, SpellPower and SpellCastTimes, and for the other spell ids above
  (11119, 412538, 412545, 12654, 11095, 22959, 400624, 400625, 11129, 28682, 11180, 12579, 12043,
  12042, 12051, 12536, 22783, 18462, 10058, 10057, 13033, 1239700, 20554). The client scraper
  extracts the triggered ones through these markers: spell 412538, spell 412545, spell 22959,
  spell 12579, spell 28682, spell 400625, spell 12536, spell 29077, spell 25346, spell 10058,
  spell 10057.
