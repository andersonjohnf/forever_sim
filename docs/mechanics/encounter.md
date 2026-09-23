# Encounter

The default target the sim fights, and the encounter settings the UI exposes. The default
target is a **level-63 boss** (defense 315) with **3,731 armor**, the standard Classic Era
raid-boss value. The fight lasts **180 s ± 10%**, and the **execute phase** is its last 20%.
It's a single target; DPS stand **behind** it and tanks **in front**. For tanks it swings
every **2.0 s** for a configurable pre-armor amount. Forever adds two encounter properties a
Classic sim doesn't need: the boss's **creature type** (Forever gear and consumables have
Demon/Undead/Beast/… bonuses) and the **raid zone** (Forever flasks only work in Mount Hyjal,
Hyjal Summit and the Barrow Deeps). No Forever raid is open yet (unlock 2026-12-09), so every
boss-specific number is a Classic Era stand-in or `[?]` until the guild has logs.

Status: researched 2026-09-22 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified
Client builds: Forever beta 1.60.1.69913 · Classic Era 1.15.9.69722

---

## What the sim needs

- A `SimConfig.encounter` object with the fields in [Encounter settings](#encounter-settings).
  All have defaults.
- The **target**: level 63, defense 315, armor 3,731 before debuffs, resistances as in
  [combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic), and flags for
  can-dodge/parry/block, parry haste and crushing.
- **Fight length** drawn per iteration from `uniform(L × (1 − v), L × (1 + v))`, in integer
  ms.
- **Execute phase** starts at `fightLength × (1 − executePct)`, i.e. boss health falls
  linearly with time.
- **Extra targets** (0–4) with an uptime %, for cleave and AoE abilities.
- **Position**: DPS behind, tanks in front, with an override.
- **Boss melee** for tank specs: swing speed, pre-armor damage range, and the boss → player
  table from [combat-tables §8](combat-tables.md#8-boss--player-tanks).
- **Creature type** and **zone**, so Forever's type-, biome- and zone-gated effects switch on
  or off.

---

## 1. The target

| Property | Default | Tag / source |
| --- | --- | --- |
| Level | 63 (raid boss, "skull") | [F] the Forever sheet labels level + 3 as the raid-boss skull (`AddDefenseChanceTable`, [stats Lua][ui-stats]); [C] ([Magey][magey-at]) |
| Defense skill | 315 (= 5 × level) | [F] `GetEnemySkillDifference` uses `(level + 3) × 5` ([stats Lua][ui-stats]); [C] ([AMR][amr-hit]) |
| Weapon skill (for its melee) | 315 | [F] ([stats Lua][ui-stats]) |
| Armor | **3,731** | [C], see [§2](#2-boss-armor) |
| Can dodge / parry / block | yes / yes (front only) / yes (front only) | [F] tooltips ([gs][gs-forever]); in combat [C] (unchanged); per-boss flags [?] |
| Magic resistance | 0 base + level-based 24 | [?] ([combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic)) |
| Creature type | none selected (no type bonuses) | modelling default, [§6](#6-creature-type-biome-and-zone-forever) |
| Health | not modeled; time-based | [§3](#3-fight-length-and-execute-phase) |

---

## 2. Boss armor

Classic Era raid bosses use a few fixed armor values, often described as "warrior",
"paladin" and "mage" armor types:

| Armor | Which bosses | Tag / source |
| --- | --- | --- |
| **3,731** | most raid bosses: every AQ40 boss except Skeram | [C] ([AMR forum][amr-armor]; the pre-SoD WarriorSim defaults to 336 target armor, which is 3,731 after Sunder ×5, Faerie Fire and Classic's Curse of Recklessness, [ws-classic]) |
| ~3,740 | measured via Swipe damage on MC bosses (2020) | [C] ([Blizzard forums][bf-armor]); consistent with 3,731 |
| 3,009 | lighter bosses (e.g. AQ40 Skeram) | [C] ([amr-armor]) |

**Default: 3,731** [C]. It's the value Classic Era sims and measurements agree on for most
bosses, and Onyxia, the one Classic raid in Forever's launch lineup, is commonly treated as
3,731 [?]. The armor of Forever's new raid bosses (Barrow Deeps, Hyjal Summit) is unknown
[?]. Offer presets 3,731 / 3,009 / custom. Armor debuffs are subtracted per
[damage-and-timing §1.2](damage-and-timing.md#12-armor-reduction-debuffs-and-penetration),
and their values are in [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md).

---

## 3. Fight length and execute phase

- **Default fight length: 180 s, varied ±10% per iteration** (uniform 162–198 s) [?].
  Rationale: the guild raids new Forever content (10- and 20-player, single difficulty) in
  pre-raid gear with **no world buffs** ([doctrine §1](../doctrine.md#1-what-were-building)).
  Classic Era sims default to 50–60 s (WarriorSim's pre-SoD default, [ws-classic]) because they assume world
  buffs and speed-run gear, which doesn't fit here. The variation spreads cooldown alignment
  across iterations.
- **Execute phase:** the last **20%** of boss health (Execute, Hammer of Wrath) [C]
  ([glossary](../glossary.md); WarriorSim "Execute phase percentage 20", [ws-classic]).
  Health falls linearly with time, so the execute phase begins at
  `t_exec = fightLength × (1 − 0.20)`. Forever changes to execute thresholds or talents are
  owned by the class docs.
- Settings: `fightLengthSec` (30–900), `fightLengthVariationPct` (0–25),
  `executePhasePct` (0–50). A "no execute phase" option is simply `executePhasePct = 0`.
- **Pre-pull:** the fight starts at t = 0 with the first swing. Pre-pull actions (starting
  rage, pre-pots, Charge) belong to the rotation and class docs and [rage.md](rage.md).

---

## 4. Targets and position

- **Not simulated yet.** The engine fights one target. The model below is the design for
  multi-target support; until it lands, `extraTargets` is kept in saved setups but read nowhere,
  and the Fight tab hides its control ([M6](../milestones.md#m6-multi-target-)).
- **Single target by default.** `extraTargets` (0–4, default 0) adds identical copies of the
  boss (same level, armor and debuffs [?]) that cleave and AoE abilities (Cleave, Whirlwind,
  Swipe, Consecration, …) can hit. `extraTargetUptimePct` (default 100 when extraTargets >
  0) scales how often they're in range [?].
  - Forever's design: "tanks are built to hold three or four enemies" [F reported]
    ([wowsod.pro][wowsod]). Consecration deals full damage to "the first four targets it
    hits" [F] ([Blizzard Deep Dive][bz-deepdive]). Hence the maximum of 4 extra targets.
  - Only the primary target gets the boss's melee on the tank. Adds don't attack in this
    model.
- **Position:** DPS specs attack from **behind**; tank specs (Prot warrior, Prot paladin,
  bear) from the **front** [C]. `attackFromFront` overrides this for DPS (bosses that can't
  be flanked). Its effect on the tables is in
  [combat-tables §2.4](combat-tables.md#24-attacking-from-behind-vs-the-front).
- **Boss target:** in tank sims the boss attacks the simulated tank all fight. In DPS sims
  the boss attacks no one. Damage taken by DPS players (and the rage it gives) is off unless
  `dpsDamageTakenPerSec` is set (default 0) [?].

---

## 5. Boss melee (tank modeling)

| Property | Default | Tag / source |
| --- | --- | --- |
| Swing speed | **2.0 s** | [?] (typical raid-boss swing; no Forever data; tune from logs) |
| Pre-armor damage per swing | **uniform 4,500–5,500** (mean 5,000) | [?], see below |
| Attack table vs the tank | [combat-tables §8](combat-tables.md#8-boss--player-tanks): miss, dodge, parry, block, crit 5.6% at 300 defense, crushing 15% | [F]/[C] |
| Crit / crushing multiplier | ×2.0 / ×1.5 | [F] tooltip ([gs][gs-forever]); in combat [C] (unchanged) |
| Parry haste (when the tank parries the boss's swings, and when the boss parries the tank) | on | [F] tooltip; [C] ([damage-and-timing §3.4](damage-and-timing.md#parry-haste)) |
| Armor constant vs the tank | 400 + 85 × 63 = 5,755 | [C] ([damage-and-timing §1.1](damage-and-timing.md#11-formula)) |
| Attack-speed debuffs (Thunder Clap, …) | per buffs doc | [damage-and-timing §3.2](damage-and-timing.md#32-attack-speed-debuffs-on-the-boss-tank-modeling) |
| AP debuffs (Demoralizing Shout/Roar) | `damage −= APreduction / 14 × swingSpeed` | [?] (creature damage modeled as base + AP/14 × speed) |
| Spells or special attacks | not modeled; optional `bossExtraDtps` (default 0) | modelling choice |

**Why 5,000 pre-armor per swing** [?]. Classic-era raid bosses hit a well-geared tank for
about 1,500–2,500 after armor. At 10,000 armor vs a level-63 attacker, mitigation is 63.5%, so
5,000 pre-armor ≈ 1,826 after armor. The value matters for tank survivability outputs and for
tank rage. [rage.md](rage.md#rage-from-damage-taken) owns the damage-taken rage model: its
Forever default is `1.5 × health lost / 230.6` [?], so rage follows the post-armor hit; its
`forever-hp-prearmor` variant, a third-party fit, uses pre-armor damage ÷ max health.
Replace the stand-in with measured values once Forever raid logs exist.

---

## 6. Creature type, biome and zone (Forever)

Forever ties item effects to what you fight and where:

- **Creature type** [F]. Examples: set bonuses "+36 Attack Power against Demons" (Grovekeeper
  4-piece) and "against Humanoids" (Grimstitch 4-piece), "+30 Attack Power Vs Undead", the
  Potion of Beast Culling ([foreverchanges items][fc-items]), and the Dwarf racial Big Game
  Hunter vs Beasts ([Blizzard Deep Dive][bz-deepdive]). Paladin Exorcism and Holy Wrath are
  Undead/Demon tools ([bz-deepdive]; the paladin doc owns them).
  - Setting `creatureType`: `none` (default) | Beast | Demon | Dragonkin | Elemental | Giant |
    Humanoid | Mechanical | Undead. `none` means no type-specific bonus applies.
  - Onyxia is Dragonkin [C]. The types of the Barrow Deeps and Hyjal Summit bosses are unknown
    [?].
- **Biome** [F]: "New effects also tie item choices to specific environments, such as
  Woodlands, Mountains, or Deserts" ([bz-deepdive]). Setting `biome`: `none` (default) |
  woodland | mountain | desert | city | cavern. Which biome each raid counts as is unknown
  [?].
- **Zone** [F]: the Flasks of Natural Accuracy, Aggression, Precision and Swiftness grant 5%
  hit / 4% crit / 5% dodge-parry reduction / 5% haste **only in Mount Hyjal, Hyjal Summit and
  the Barrow Deeps** ([foreverchanges items][fc-items]). Setting `zone`: **Hyjal Summit**
  (default) | Barrow Deeps | Onyxia's Lair | Other. Hyjal Summit is the default because it's
  the tier's 20-player raid. The zone only switches zone-gated effects on or off; the
  consumables doc decides whether a preset uses them.

---

## 7. Forever raids at launch

Raids unlock **2026-12-09**, five weeks after launch. Each has a single difficulty; there's no
flex raiding and no cross-faction play [F] ([classicwow.gg raids][cwgg-raids];
[wowsod.pro][wowsod]; [Blizzard What's Next recap][bz-whatsnext]).

| Raid | Size | Encounters (from the client's Legacy challenges) | Tag / source |
| --- | --- | --- | --- |
| The Barrow Deeps | 10 | Deepscar Matriarch, Elder Tangleclaw, Khalith the Dreadspinner, Well of Sorrow, Amethrax, Del'lynar Songwood, Ravus and Darlissa, Sonya Darkhallow | [F] ([foreverchanges legacy][fc-legacy]) |
| Hyjal Summit | 20 | Bandalar, Ancient of Decay, Time-Lost Battalion, Sylvestris Dusksong, Old Gloomlurker, Gharalis the Abyssal, Kathris the Haunted, Anara Chillwind, Elder Minderel, Tracker Stillwind, Council of Thorns, Nythus the Dreambound, The Wild King | [F] ([fc-legacy]) |
| Onyxia's Lair | 40 | Onyxia | [F] ([fc-legacy]) |

Molten Core, Blackwing Lair and Naxxramas aren't in the launch lineup [F reported]
([wowsod.pro][wowsod]). The raid size matters for buffs (how many of each class are
available), which is owned by [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md).
The sim still models one boss.

---

<a id="encounter-settings"></a>
## Encounter settings

What the UI exposes, with defaults. All are part of `SimConfig.encounter`.

| Setting | Default | Range / options | Tag / source |
| --- | --- | --- | --- |
| `bossLevel` | 63 | 60–63 | [F]/[C] §1 |
| `bossArmor` | 3731 | presets 3731 / 3009 / custom | [C] §2 |
| `fightLengthSec` | 180 | 30–900 | [?] §3 |
| `fightLengthVariationPct` | 10 | 0–25 | [?] §3 |
| `executePhasePct` | 20 | 0–50 | [C] §3 |
| `extraTargets` | 0 | 0–4 | [F] design / [?] §4 |
| `extraTargetUptimePct` | 100 | 0–100 | [?] §4 |
| `attackFromFront` | false for DPS, true for tanks | bool | [C] §4 |
| `bossCanParry` | true | bool | [?] §1 |
| `bossCanBlock` | true | bool | [?] §1 |
| `bossCanDodge` | true | bool | [?] §1 |
| `bossParryHaste` | true | bool | [C]/[F] §5 |
| `bossSwingSpeedSec` (tanks) | 2.0 | 1.0–4.0 | [?] §5 |
| `bossDamageMin` / `bossDamageMax` (tanks, pre-armor) | 4500 / 5500 | 0–20,000 | [?] §5 |
| `bossCanCrush` | true | bool | [F] §5 |
| `bossExtraDtps` (tanks) | 0 | 0–2,000 | modelling choice §5 |
| `dpsDamageTakenPerSec` | 0 | 0–500 | [?] §4 |
| `creatureType` | none | none / Beast / Demon / Dragonkin / Elemental / Giant / Humanoid / Mechanical / Undead | [F] §6 |
| `biome` | none | none / woodland / mountain / desert / city / cavern | [F]/[?] §6 |
| `zone` | Hyjal Summit | Hyjal Summit / Barrow Deeps / Onyxia's Lair / Other | [F] §6 |
| `attackTableProfile` | forever | forever / classicEra | [combat-tables §1](combat-tables.md#1-rules-profiles) |

Target debuffs (Sunder, Faerie Fire, …) and raid buffs aren't encounter settings. They're in
[buffs-debuffs-consumables.md](buffs-debuffs-consumables.md).

---

## WoW Forever deviations

| Topic | Classic Era | Forever | Tag / source |
| --- | --- | --- | --- |
| Raid lineup at 60 | MC, Onyxia, BWL, ZG, AQ, Naxx | Barrow Deeps (10), Hyjal Summit (20), Onyxia (40); more tiers in 2027 | [F] [fc-legacy]; [cwgg-raids] |
| Raid sizes | 20 / 40 | 10 / 20 / 40, single difficulty, no flex | [F] [cwgg-raids] |
| Creature-type, biome and zone effects | a few (e.g. +AP vs Undead in Scourge areas) | a whole system, plus zone-gated flasks | [F] [bz-deepdive]; [fc-items] |
| World buffs | common in raids | **not available in Forever raids; excluded** (guild directive) | [doctrine §1](../doctrine.md#1-what-were-building) |
| Boss level, defense, crit and crushing rules | – | unchanged | [F] ([stats Lua][ui-stats]) |

No Forever change found for boss armor values (no Forever raid data yet) or the execute
threshold as a boss property.

---

## Implementation notes

- Draw the fight length once per iteration from the iteration's seeded RNG:
  `L_i = round(L × (1 + v × (2u − 1)))` ms, where `u ∈ [0, 1)`.
- `t_exec = floor(L_i × (1 − executePct/100))`. Schedule an "execute phase begins" event at
  `t_exec` so APL conditions such as `target.healthPct < 20` can read it. Report boss health %
  as `100 × (1 − t / L_i)`. The engine computes it as `floor(L_i × (100 − executePct) / 100)`
  (`core/formulas.ts` `executePhaseStart`), which floors whole percentages exactly:
  `L_i × (1 − 0.30)` for 41,000 ms lands a hair below 28,700 and would floor to 28,699. It
  schedules the event only for specs with a
  rotation; at 0% `t_exec = L_i`, so there's no phase.
- Extra targets are separate target objects with their own debuff lists, since Sunder is
  applied only to the primary unless the rotation says otherwise. Their armor starts at
  `bossArmor`.
- The boss swing loop exists only when the simulated spec is a tank. Every swing resolves on
  the boss → player table, applies armor and block, and triggers the tank's damage-taken hooks
  (rage, Reckoning, …).
- The zone, biome and creature type are plain enums passed to the aura system. An aura with a
  `requiresZone`/`requiresCreatureType` condition checks them.

---

## Worked examples

**WE-1: execute timing.** Fight 180 s with no variation: execute starts at 180 × 0.8 =
**144.0 s**. An iteration drawn at 171.0 s starts it at **136.8 s**.

**WE-2: fight-length draw.** L = 180 s, v = 10%, u = 0.25: L_i = 180 × (1 + 0.1 × (−0.5)) =
**171.0 s**.

**WE-3: a boss swing on a 10,000-armor tank** (5,000 pre-armor, armor DR = 10000/15755 =
63.472%):

| Outcome | Damage |
| --- | --- |
| Hit | 5000 × 0.36528 = **1826.4** |
| Crit (×2) | **3652.8** |
| Crushing (×1.5) | **2739.6** |
| Blocked hit, block value 150 | 1826.4 − 150 = **1676.4** |

**WE-4: Demoralizing Shout on the boss (`forever`).** −204 AP (the Forever rank-5 tooltip at
level 60 [F]; whether combat applies it is [?]; value owned by the [buffs
doc](buffs-debuffs-consumables.md#42-other-debuffs)) × 2.0 / 14 = **−29.14** per swing →
**4,970.86** pre-armor. (`classicEra`, −146 at 60: −20.86 → 4,979.14.)

**WE-5: Thunder Clap slow.** 2.0 s × (1 + 0.20) = **2.4 s** between swings
([damage-and-timing §3.2](damage-and-timing.md#32-attack-speed-debuffs-on-the-boss-tank-modeling),
convention [?]).

---

## Open questions

1. **Forever raid-boss armor, creature types, swing speeds and damage** [?]. Unknown until
   2026-12-09. Collect from the first logs. Swipe or another fixed-damage physical ability
   gives armor, as Classic players did.
2. **Default fight length** [?]: 180 s is a judgment call for pre-raid guilds. Revisit with
   the guild's first Forever kill times.
3. **Boss pre-armor damage** [?]: 5,000 per 2.0 s is a stand-in. Tank rage depends on it
   under every rage model: through health lost in rage.md's default, and directly in its
   pre-armor variant ([rage.md open questions](rage.md#open-questions)).
4. **Level-based magic resistance of a +3 boss** [?]: 24 vs ~15; see
   [combat-tables open questions](combat-tables.md#open-questions).
5. **Onyxia's armor** [?]: assumed 3,731 (a common Classic value); not directly sourced.
6. **Do bosses have "cannot parry/block" flags?** [?] Server-side; watch the first logs for
   parries from the front.
7. **Which biome each raid counts as** [?].
8. **Should the default zone be Hyjal Summit?** A UI default for the guild to confirm. It only
   affects zone-gated consumables.

---

## Sources

| Ref | Source | Covers | Ruleset |
| --- | --- | --- | --- |
| [ui-stats] | Forever `Camelot/PaperDollFrameStats.lua`, <https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua> | boss = level + 3, skill 315 | [F] client |
| [gs-forever] | Forever GlobalStrings enUS, <https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua> | crit/crushing multipliers, position rules | [F] client (verbatim mirror): what the client displays |
| [magey-at] | Magey, "Attack table", <https://github.com/magey/classic-warrior/wiki/Attack-table> | +3 boss = defense 315 | [C] |
| [amr-hit] | Ask Mr. Robot, Classic hit caps, <https://forums.askmrrobot.com/t/hit-rating-and-hit-caps-in-wow-classic/8614> | raid bosses have 315 defense | [C] |
| [amr-armor] | Ask Mr. Robot, "Armor Values - IEA/Sunder Armor" (2020), <https://forums.askmrrobot.com/t/armor-values-iea-sunder-armor/10277> | AQ40 bosses 3,731, Skeram 3,009 | [C] |
| [bf-armor] | Blizzard forums, "Boss armor value question" (2020), <https://us.forums.blizzard.com/en/wow/t/boss-armor-value-question/444825> | ~3,740 measured via Swipe | [C] |
| [ws-classic] | GuybrushGit/WarriorSim `index.html` at pre-SoD commit `180a3cc` (2021-05-11), <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/index.html> | default target armor 336 (3,731 after the Classic debuffs); 50–60 s fights; execute 20% | [C] (pre-SoD) |
| [fc-legacy] | foreverchanges.pro legacy perks (raid challenges), <https://foreverchanges.pro/legacy-perks> | Forever raid encounter lists | [F] client |
| [fc-items] | foreverchanges.pro items, <https://foreverchanges.pro/items> | creature-type and zone-gated effects | [F] |
| [bz-deepdive] | Blizzard, Deep Dive recap, <https://news.blizzard.com/en-us/article/24303313/world-of-warcraft-forever-deep-dive-panel-recap> | biome/creature effects, Consecration targets, racials | [F] official |
| [bz-whatsnext] | Blizzard, What's Next recap, <https://news.blizzard.com/en-us/article/24303862/world-of-warcraft-forever-whats-next-panel-recap> | roadmap and raids | [F] official |
| [cwgg-raids] | classicwow.gg, "World of Warcraft: Forever Raids", <https://classicwow.gg/forever/raids> | sizes, unlock date, no flex | [F] reported |
| [wowsod] | wowsod.pro, "WoW Forever vs Classic: Every Key Change", <https://wowsod.pro/articles/wow-forever-vs-classic-every-key-change> | tanks hold 3–4 enemies; raid lineup | [F] reported |

[ui-stats]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua
[gs-forever]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[gs]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[magey-at]: https://github.com/magey/classic-warrior/wiki/Attack-table
[amr-hit]: https://forums.askmrrobot.com/t/hit-rating-and-hit-caps-in-wow-classic/8614
[amr-armor]: https://forums.askmrrobot.com/t/armor-values-iea-sunder-armor/10277
[bf-armor]: https://us.forums.blizzard.com/en/wow/t/boss-armor-value-question/444825
[ws-classic]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/index.html
[fc-legacy]: https://foreverchanges.pro/legacy-perks
[fc-items]: https://foreverchanges.pro/items
[bz-deepdive]: https://news.blizzard.com/en-us/article/24303313/world-of-warcraft-forever-deep-dive-panel-recap
[bz-whatsnext]: https://news.blizzard.com/en-us/article/24303862/world-of-warcraft-forever-whats-next-panel-recap
[cwgg-raids]: https://classicwow.gg/forever/raids
[wowsod]: https://wowsod.pro/articles/wow-forever-vs-classic-every-key-change
