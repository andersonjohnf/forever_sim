# WoW Forever system changes

A survey of every WoW Forever change that isn't class-specific but could move a DPS/TPS
result. Each row gives what changed against Classic Era, a source, the sim impact and the doc
that owns it. The biggest changes:

- **Items are re-itemized with combat ratings**, and one hit stat and one crit stat now serve
  melee, ranged and spells.
- **Weapon skill is rebalanced**: racials no longer give it, items give less, and the client
  values it at 0.04% per point.
- **The client's own tooltips give a different raid-boss attack table** from Classic Era:
  8% / 27% / 17% hit caps and 16.5% boss parry.
- **Rage is normalized** to weapon speed.
- **Periodic effects can crit.**
- **Consumables, raid buffs and food are reworked**, including zone-gated flasks and camp
  buffs.
- **Launch raids are new** (Barrow Deeps 10, Hyjal Summit 20, Onyxia 40, unlocking
  2026-12-09).

Following the guild directive, **world buffs are excluded**. Much of this is read from client
data and tooltips, not measured in combat. The beta is capped at level 20 for now, so
level-60 behaviour can't be tested yet.

Status: researched 2026-09-22 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified
Client builds: Forever beta 1.60.1.69913 (2026-09-18; talents, spells and items unchanged since 1.60.1.69893, [foreverchanges beta][fc-beta]) · Classic Era 1.15.9.69722

Impact scale: **none** (no effect on DPS/TPS); **low** (< ~0.5%, or only in niche setups);
**medium** (~0.5–3%, or one spec only); **high** (> ~3%, or it changes how a mechanic must be
modeled).

---

## What the sim needs

- Consume **ratings** from gear and convert them in the stat pipeline (hit 10, crit 14,
  haste 10, expertise 10, dodge 12, parry 15, block 5 per 1%; defense 1:1)
  ([character-stats.md](character-stats.md); [combat-tables §10](combat-tables.md#10-ratings)).
- Implement the two attack-table profiles, `forever` (default) and `classicEra`
  ([combat-tables §1](combat-tables.md#1-rules-profiles)).
- Periodic crits, armor penetration, negative armor and the haste stat
  ([damage-and-timing.md](damage-and-timing.md)).
- Forever rage rules ([rage.md](rage.md)).
- Encounter `creatureType`, `biome` and `zone` for Forever's gated effects
  ([encounter §6](encounter.md#6-creature-type-biome-and-zone-forever)).
- Forever consumables, camp buffs, raid-buff values, and **no world buffs**
  ([buffs-debuffs-consumables.md](buffs-debuffs-consumables.md);
  [doctrine §1](../doctrine.md#1-what-were-building)).
- Class talent and spell changes (747 on foreverchanges) in the class docs.

---

## 1. Ruleset, world and raids

| Change | Forever vs Classic Era | Source | Sim impact | Owner |
| --- | --- | --- | --- | --- |
| Level cap | 60, same as Classic; progression continues through raid tiers, not levels; no level scaling in zones | [F] [wowsod.pro][wowsod] | none | – |
| Realmless rulesets | Normal, PvP, RP (Hardcore later), each one large shared world; no cross-ruleset or cross-faction grouping | [F] [Blizzard Deep Dive][bz-deepdive] | none | – |
| Beta window and cap | Beta 2026-09-17 → 10-21, capped at level 20, rising to 30 after a couple of weeks; launch 2026-11-04 | [F] [foreverchanges beta][fc-beta]; [wowsod.pro][wowsod] | none on DPS; **limits testing**: level-60 mechanics can't be measured on the beta yet | this doc (testing) |
| Raid lineup at launch | **Barrow Deeps (10), Hyjal Summit (20), Onyxia's Lair (40)**; unlock 2026-12-09; MC/BWL/Naxx not in the lineup | [F] [foreverchanges legacy][fc-legacy]; [classicwow.gg][cwgg-raids]; [wowsod.pro][wowsod] | low (the sim models one boss; boss stats unknown) | [encounter.md](encounter.md) |
| Raid format | 10/20 every tier, 40 sometimes; single difficulty; no flex | [F] [classicwow.gg][cwgg-raids] | low (raid size sets buff availability) | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |
| **World buffs** | **Not available in Forever raids: excluded from the sim** (guild directive, 2026-09-22; see [doctrine.md](../doctrine.md#1-what-were-building), [D8](../decisions.md#d8-world-buffs-are-excluded-2026-09-22)). No foreverchanges.pro page confirms or explains it. A player on the Blizzard forums reports a BlizzCon streamer saying world buffs work only in the open world, not in dungeons, raids or battlegrounds ([EU forum][bf-wbuffs]). That's consistent with the directive, and nothing contradicting it was found. | directive; [F reported] | high in Classic sims, **none here by design** | [doctrine §1](../doctrine.md#1-what-were-building) |
| Both factions have every class | New race/class combos include Undead **Paladin** (Horde) and Dwarf **Shaman** (Alliance), so blessings and totems are no longer faction-locked | [F] [Blizzard Deep Dive][bz-deepdive]; [foreverchanges racials][fc-racials] | **high** for default buff presets | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |
| Built-in swing timer and damage meter; modern addon API with Midnight's combat restrictions | new | [F reported] [wowsod.pro][wowsod]; `ENABLE_SWING_TIMER` strings ([gs][gs-forever]) | none on DPS; the restrictions make community testing harder ("much less direct information available", [fw-2]) | this doc (testing) |
| Hardcore, transmog, graphics toggle, PvP track, new battleground, GDKP ban, no gear resets, dual spec (not announced) | various | [F] [bz-deepdive]; [wowsod] | none | – |

---

## 2. Combat rules

| Change | Forever vs Classic Era | Source | Sim impact | Owner |
| --- | --- | --- | --- | --- |
| **Unified hit and crit** | One hit stat for melee, ranged and spells; one crit stat likewise | [F] [Blizzard Deep Dive][bz-deepdive] | **high** (hybrids; one stat feeds both tables) | [combat-tables §6](combat-tables.md#6-hit-caps); [character-stats.md](character-stats.md) |
| **Combat ratings on gear** | Items carry ratings instead of %: hit 10, crit 14, dodge 12, parry 15, block 5 per 1%, defense 1:1; plus new Haste (10), Expertise (10), Armor Penetration and Health Regeneration stats. The same at every level. Item tooltips display %. | [F] as displayed ([items dataset][items-ratings]; [wowsims CombatRatings][wf-cr]); in combat [?] | **high** | [character-stats.md](character-stats.md); [combat-tables §10](combat-tables.md#10-ratings) |
| **Raid-boss hit caps** | Tooltips: 8% melee, 27% dual wield, 17% spells (Classic Era: 9% / 28% / 16%), which implies no hit suppression and no spell 1% floor | [F] client tooltip ([gs][gs-forever]); untested ([fw-1]) | **high** | [combat-tables §6](combat-tables.md#6-hit-caps) |
| **Weapon skill** | Client skill panel: 0.04% hit/dodge/parry/crit per point (Classic: 0.1–0.2%); racials give crit instead of skill; items give less (Edgemaster's +7 → +1, Huge Thorium Battleaxe +10 → +2) | [F] client UI ([SkillsFrame][ui-skills]); [fc-racials]; [fc-items]; [Warcraft Tavern][wt-skill] | **high** | [combat-tables §4](combat-tables.md#4-weapon-skill-vs-defense) |
| **Boss parry** | Tooltip: 16.5% (Classic 14%) | [F] client tooltip ([gs][gs-forever]) | **high** for tanks (parry haste) | [combat-tables §1.1](combat-tables.md#11-profile-parameters-player-level-60-vs-boss-level-63-defense-315) |
| **Glancing blows** | Chance unchanged (40% vs +3); client UI penalty 25% at 300 skill (Classic 35%). Glancing damage vs higher-level mobs is **currently broken on the beta** | [F] client UI ([SkillsFrame][ui-skills]); [F measured] [magey/forever-warrior#1][fw-1] | **high** (~4% of white damage) | [combat-tables §2.3](combat-tables.md#23-glancing-blows) |
| **Crit suppression** vs +3 | Skill part 0.6% (UI) vs Classic's 3%; the 1.8% aura part is unverified | [F] client UI; [?] | **high** | [combat-tables §4.4](combat-tables.md#44-crit-suppression) |
| **Expertise** | New: "reduces the chance to be dodged or parried"; 10 rating = 1% as displayed; combat effect unknown | [F] [bz-deepdive]; [gs][gs-forever]; combat [?] | medium (tanks), low (DPS from behind) | [combat-tables §7](combat-tables.md#7-expertise-forever) |
| **Haste stat** | Haste rating (10 = 1%), haste flask, haste set bonuses, Skyborne racial +1% | [F] [wf-cr]; [fc-items]; [fc-racials] | medium | [damage-and-timing §3.1](damage-and-timing.md#31-haste) |
| **Armor penetration; negative armor** | New flat armor-pierce stat; armor below 0 increases damage (Classic: floor 0) | [F] tooltip ([gs][gs-forever]) | low to medium | [damage-and-timing §1.2](damage-and-timing.md#12-armor-reduction-debuffs-and-penetration) |
| Spell penetration below 0 resistance | "Spell Vulnerability": negative resistance increases spell damage taken | [F] tooltip ([gs][gs-forever]) | low | [combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic) |
| **Periodic crits and per-tick evaluation** | "Most periodic effects can critically strike". Per-spell flag: Rend, Rake, Rip, Pounce and Lacerate yes; Deep Wounds no. Rend's AP, modifiers and crit are reported to be read per tick (no snapshot). | [F] tooltip ([gs][gs-forever]); client flags ([wowsims spell data][wf-spell]); [F reported] ([tzcnt Forever notes][tz-forever]) | medium (bleed specs) | [damage-and-timing §4](damage-and-timing.md#4-dots-and-bleeds); class docs |
| **Rage normalization** | Beta logs: swing rage = 3.46 × speed (1H) or 4.5 × speed (2H), with no damage term and no crit bonus; damage-taken rage = pre-armor damage × 10 / max health, doubling below ~130–170 armor (levels 8–9) | [F measured] ([magey/forever-warrior#3][fw-3]); [wowsims/forever#2][wf-2] | **high** (warrior, bear) | [rage.md](rage.md) |
| HS/Cleave queue and the off-hand DW penalty | Still removes the penalty (5.19% vs 18.27% off-hand miss, small sample) | [F measured] [magey/forever-warrior#2][fw-2] | **high** (Fury) | [combat-tables §5](combat-tables.md#5-dual-wield-and-on-next-swing-queues) |
| Normalized weapon damage | Same rule; new normalized abilities (Holy Strike, Spearing Strike) | [F] client effects ([wf-spell]) | low | [damage-and-timing §2.2](damage-and-timing.md#22-normalization-for-instant-attacks) |
| PPM table | Classic Era's 1–10 PPM rows plus a new 2.3 PPM row (ID 479) | [F] wago.tools (confirm manually, [wago-ppm]) | low | [damage-and-timing §5](damage-and-timing.md#5-procs) |
| Armor formula | No change found (Classic 400 + 85 × level). A client gametable with retail values exists; not adopted | [C]; [?] | high **if** wrong | [damage-and-timing §1.1](damage-and-timing.md#11-formula) |
| Debuff limit | Not announced. Classic Era realms keep 16 debuffs; the limit was removed on Hardcore (1.14.4) and Anniversary (1.15.5) realms | [F] not announced ([wowsod]); [C] ([Massively OP][mop-debuff]) | low (the sim assumes the modeled debuffs fit) | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |
| Spell batching | Not announced. Classic Era has been at 10 ms since 1.13.7 | [C] ([Blizzard][bz-1137]) | low (not modeled) | [damage-and-timing §3.6](damage-and-timing.md#36-server-tick-and-spell-batching) |
| Unchanged (checked) | Crit ×2.0 / ×1.5; crushing 15% ×1.5; creature crit ×2; 440 defense uncrittable; glancing chance 40%; boss dodge 6.5%; DW +19%; parry haste 40%; GCD 1.5 s / 1.0 s cat; AP/14; armor cap 75%; resistance formula | [F] client tooltips and code ([gs][gs-forever]; [stats Lua][ui-stats]; [wf-spell]) | none | combat-tables, damage-and-timing |

---

## 3. Characters and classes

| Change | Forever vs Classic Era | Source | Sim impact | Owner |
| --- | --- | --- | --- | --- |
| Class talents and spells | 747 changes: 113 new talents, 300 changed, 77 removed and 257 changed spells; a new 16-point milestone talent | [F] [foreverchanges changes][fc-changes]; [bz-deepdive] | **high** | [classes/warrior.md](../classes/warrior.md), [druid.md](../classes/druid.md), [paladin.md](../classes/paladin.md) |
| Buff talents made baseline | e.g. Blessing of Kings, Improved Mark of the Wild and Divine Spirit are baseline; buff-improvement talents cut | [F] [bz-deepdive] | medium (buff presets) | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |
| Racials reworked | 2 active + 2 passive per race, "similar offensive power". Weapon-skill racials become crit (e.g. Human Sword Specialization, Orc Axe Specialization +1% crit, Dwarf Mace Specialization). Blood Fury +10% AP and SP for 15 s; Stoneform reduces physical damage; Skyborne Wind Blessed +1% haste. | [F] [fc-racials]; [bz-deepdive] | medium | [character-stats.md](character-stats.md) |
| Crit per Agility and base stats | From the client's `PlayerExpectedStat`: warrior 0.05 (20 Agi per 1%), druid 0.05, paladin 0.0506, rogue 0.0345, hunter 0.0189. These match Classic Era's per-class values as far as checked. | [F] client ([wowsims base stats][wf-basestats]) | low | [character-stats.md](character-stats.md) |
| Healing power gives spell damage | Bonus healing also gives one third as much spell damage; caster weapons give spell power from level ~10 | [F] [bz-deepdive] | low (Ret/Prot paladin spell damage from hybrid gear) | [character-stats.md](character-stats.md); [paladin.md](../classes/paladin.md) |
| Legacy perks | No combat power. Durations only: **Permanence** makes long-duration class raid buffs and camp buffs last +50/100%; **Gourmand** makes food buffs last +33/67/100%; Reagent Economy removes buff reagents. Cap 16 points per character. | [F] [foreverchanges legacy][fc-legacy] | none on in-fight DPS (buff uptime is assumed 100%) | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |

---

## 4. Items, enchants and professions

| Change | Forever vs Classic Era | Source | Sim impact | Owner |
| --- | --- | --- | --- | --- |
| Re-itemization | 5,335 new items and 4,271 changed; stats come from item-level budgets (`StatPercentEditor × RandPropPoints`); 81 new item sets (e.g. Grovekeeper, Justice, Blessed Plate); unique dungeon boss drops are blue; set bonuses improved | [F] [foreverchanges items][fc-items]; [bz-deepdive] | **high** (every gear set) | [data/items.md](../data/items.md); class docs |
| Items without Forever data | 2,039 Classic items have no Forever row yet (e.g. Edgemaster's Handguards, Destiny); they use Classic stats and are flagged | [F] [fc-items]; [D6](../decisions.md) | medium | [data/items.md](../data/items.md) |
| Creature-type and biome effects | Items, sets and potions with bonuses vs Demons, Undead, Beasts, Humanoids, Elementals…; woodland/mountain/desert effects; situational trinkets | [F] [bz-deepdive]; [fc-items] | medium | [encounter §6](encounter.md#6-creature-type-biome-and-zone-forever) |
| New enchants | Necklace, ring, off-hand, two-handed and staff enchants; weapon enchants such as *Recovery* (heal when dodged or parried) and *Revelation*; Shield crit enchant | [F] [fc-items]; [foreverchanges professions][fc-prof] | medium | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |
| Armor kits with offense | e.g. Forceful Rugged Armor Kit (+10 AP, +40 armor); Wild Leather Armor Kit (+4 defense, +10 Sta) | [F] [fc-items] | low | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |

---

## 5. Consumables, food and buffs

| Change | Forever vs Classic Era | Source | Sim impact | Owner |
| --- | --- | --- | --- | --- |
| Elixirs reworked | Many are now 30 min. Elixir of the Mongoose (+25 Agi, +2% crit) goes from 1 h to 30 min. New: Elixir of the Grizzly (+25 Str, +2% crit), Elixir of Ferocity (+18 Str and Agi), Elixir of the Phalanx (+400 HP, +500 armor), Elixir of Greater Fortitude (+400 HP) | [F] [fc-items] | **high** | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |
| **Zone-gated flasks** | Flask of Natural Accuracy / Aggression / Precision / Swiftness: +60 Sta, plus 5% hit / 4% crit / 5% dodge-parry reduction / 5% haste **only in Mount Hyjal, Hyjal Summit and the Barrow Deeps** | [F] [fc-items] | **high** in those raids | buffs doc; [encounter §6](encounter.md#6-creature-type-biome-and-zone-forever) |
| Potions | Rage potions usable by Druids; new Frenzy potions (+AP for 30 s, e.g. Major +40); Potion of Demonslaying changed to +108 SP / +185 AP vs Demons for 2 min; new Restored Healing/Mana potions (% based) | [F] [fc-items] | medium | buffs doc |
| Food | Well-fed buffs reworked (15 min): new stat foods (e.g. Bear Bruscitti +20 Str, Flank au Poivre +20 Agi), Grilled Squid now +1% crit, Tender Wolf Steak +15 Agi, Dirge's Chimaerok Chops still +25 Sta | [F] [fc-items]; [bz-deepdive] | medium | buffs doc |
| **Camping buffs** | Camp objects give one-hour buffs that copy class buffs and don't stack with them: Lodestone 90 melee AP (vs Blessing of Might), Sharpening Wheel 34 Str (vs Strength of Earth), Camp Chair 2% crit, Fish Bowl 8% stats (vs Kings), Enchanted Lute (vs Mark of the Wild), First Aid Kit 56 Sta (vs Fortitude), … Whether they work inside instances is unknown. | [F] [foreverchanges camping][fc-camping]; [bz-deepdive] | **high** if usable in raids, see [Open questions](#open-questions) | buffs doc |
| Raid buff and debuff magnitudes | Client values differ from Classic Era for several buffs. Examples: Mark of the Wild rank 7 (9885) is +385 armor, +16 stats, +27 resistances; Thunder Clap (11581) slows attack speed by 20% (Classic 10%); Demoralizing Shout (11556) is −205 AP for 45 s. The buffs doc compares each one with Classic Era. | [F] client ([wowsims spell data][wf-spell]; [wowsims/forever#36][wf-36]) | **high** | buffs doc |

---

## WoW Forever deviations

This whole document is a list of deviations. The ones that change how the engine must be
built, rather than only its numbers:

1. **Ratings on gear**, with one hit stat and one crit stat → the stat pipeline converts
   ratings, and one hit % feeds both the melee and spell tables.
2. **Two attack-table profiles** (`forever` from client UI, `classicEra` from measurement)
   until the guild measures the Forever table.
3. **Periodic crits** → DoT ticks need a crit roll when the spell's flag says so.
4. **Negative armor and negative resistance** → don't floor at 0 in the `forever` profile.
5. **Normalized rage** → the rage model changes shape, not just constants ([rage.md](rage.md)).
6. **Creature type, biome and zone** → encounter enums that gate item and consumable effects.
7. **No world buffs** (directive) and **camp buffs** (new, mutually exclusive with the class
   buffs they copy).

No Forever change was found in: level cap, the white-table order, crit/crushing/glancing
multipliers and chances (apart from the penalty), defense 440, parry haste, GCDs, AP/14,
the armor cap, or the PPM formula.

---

## Implementation notes

- Keep every Forever-vs-Classic switch in data (profile objects, aura definitions), not in
  code branches, so a beta measurement or a new client build only changes data.
- Each owner doc cites this survey's row when it implements a change. When foreverchanges
  updates (doctrine §6), re-check the **Source** column here first.
- Effects gated by zone, creature type or biome are ordinary auras with a condition on
  `SimConfig.encounter` ([encounter §6](encounter.md#6-creature-type-biome-and-zone-forever)).
- World buffs: no data, no toggles. If the item scraper ever emits a world-buff consumable,
  filter it out with a comment that cites doctrine §1.

---

## Worked examples

**WE-1: ratings to percentages (as displayed).** 140 crit rating → 10.0% crit; 60 hit rating
→ 6.0% hit (melee **and** spell); 50 haste rating → 5.0% haste; 12 expertise rating → 1.2%;
36 dodge rating → 3.0%; 30 parry rating → 2.0%; 25 block rating → 5.0%; 20 defense rating →
+20 defense (320 total at level 60).

**WE-2: hit cap in rating terms (`forever`, 300 skill).** Specials or 2H: 80 hit rating.
Dual-wield white: 270. Spells vs a boss: 170.

**WE-3: zone gate.** Flask of Natural Aggression, `zone = Hyjal Summit` → +60 Sta and +4% crit.
`zone = Onyxia's Lair` → +60 Sta only.

**WE-4: world buffs.** A `SimConfig` that tries to enable Rallying Cry of the Dragonslayer is
rejected or ignored. There's no toggle, and no preset contains it
([doctrine §1](../doctrine.md#1-what-were-building)).

**WE-5: camp buff exclusivity.** With Blessing of Might and a Lodestone camp buff both
selected, only the larger applies, never both [F] ([fc-camping]: camp buffs "do not stack
with" the class buff they copy).

---

## Open questions

1. **Do the displayed rating conversions hold in combat** at level 60 vs a level-63 boss? [?]
   See [combat-tables open questions](combat-tables.md#open-questions).
2. **The raid-boss attack table** (hit suppression, 16.5% parry, glancing penalty, crit
   suppression, weapon skill per point): all from client UI, none measured [?].
   [combat-tables](combat-tables.md#open-questions) has the tests. Magey's group is sweeping
   these ([fw-1]).
3. **Do camp buffs work inside raid instances**, and does a group need to be formed to get
   another player's camp buff? [?] Unconfirmed ([fc-camping]). This decides whether camp
   buffs belong in default raid presets.
4. **Debuff limit in Forever raids** [?]. Not announced. Test: stack 16+ debuffs on a boss and
   watch for pushed-off debuffs.
5. **Rage formulas at level 60** [?]. Measured only at levels 8–9 ([fw-3]).
6. **Armor mitigation constant** [?]. A retail-valued gametable exists in the client
   ([damage-and-timing open questions](damage-and-timing.md#open-questions)).
7. **World buffs.** Directive: excluded. The only public hint (a player relaying a streamer on
   the Blizzard forums) agrees that they don't work in instances ([bf-wbuffs]). Revisit only
   if Blizzard says otherwise ([doctrine §1](../doctrine.md#1-what-were-building)).
8. **Testing constraints.** The beta is capped at level 20 (→ 30), there are no target
   dummies ([fw-1]), and the modern addon API limits combat-log detail ([fw-2]). Guild tests
   of `+3` rules must use mobs 3 levels above the tester.

---

## Sources

| Ref | Source | Covers | Ruleset |
| --- | --- | --- | --- |
| [fc-beta] | foreverchanges.pro beta page, <https://foreverchanges.pro/beta> | dates, builds 69893 → 69913 | [F] |
| [fc-changes] | foreverchanges.pro changes, <https://foreverchanges.pro/changes> | 747 class talent and spell changes | [F] client |
| [fc-legacy] | foreverchanges.pro legacy perks, <https://foreverchanges.pro/legacy-perks> | perks, raid challenges and encounter names | [F] client |
| [fc-racials] | foreverchanges.pro racials, <https://foreverchanges.pro/racials> | racial rework, race/class combos | [F] client / reported |
| [fc-items] | foreverchanges.pro items and `/items/{new,changed,missing}.json`, <https://foreverchanges.pro/items> | new and changed items, consumables, flasks, enchants | [F] client |
| [fc-prof] | foreverchanges.pro professions, <https://foreverchanges.pro/professions> | new recipes, enchant types | [F] |
| [fc-camping] | foreverchanges.pro camping, <https://foreverchanges.pro/professions/camping> | camp objects and buffs, open points | [F] client |
| [items-ratings] | This repo's items dataset, "Forever's ratings" ([../data/items.md](../data/items.md#forevers-ratings-f-with-open-questions)) | rating ÷ percent ratios | [F] as displayed |
| [bz-deepdive] | Blizzard, Deep Dive panel recap, <https://news.blizzard.com/en-us/article/24303313/world-of-warcraft-forever-deep-dive-panel-recap> | itemization, stats, racials, talents, camping, Legacy | [F] official |
| [gs-forever] | Forever client GlobalStrings enUS, <https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua> | combat tooltips | [F] client |
| [ui-skills] | Forever `Camelot/SkillsFrame.lua`, <https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/SkillsFrame.lua> | weapon-skill formulas | [F] client |
| [ui-stats] | Forever `Camelot/PaperDollFrameStats.lua`, <https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua> | enemy tables, AP/14 | [F] client |
| [wf-cr] | wowsims/forever CombatRatings, <https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats/combatratings.txt> | rating conversions | [F] client (via wowsims) |
| [wf-basestats] | wowsims/forever `sim/core/base_stats_auto_gen.go`, <https://github.com/wowsims/forever/blob/master/sim/core/base_stats_auto_gen.go> | crit per Agility from `PlayerExpectedStat` | [F] client (via wowsims) |
| [wf-spell] | wowsims/forever generated spell data, <https://github.com/wowsims/forever/blob/master/sim/warrior/spell_data_auto_gen.go> (and druid, paladin) | GCDs, effect types, periodic-crit flags, buff values | [F] client (via wowsims) |
| [wf-36] | wowsims/forever issue #36, <https://github.com/wowsims/forever/issues/36> | buff and debuff census against the Forever client | [F] client (via wowsims) |
| [wf-2] | wowsims/forever issue #2, <https://github.com/wowsims/forever/issues/2> | "rage is normalized; crit does not double the gain" | [F] reported |
| [fw-1] | magey/forever-warrior #1, <https://github.com/magey/forever-warrior/issues/1> | attack-table test plan; glancing broken; no dummies | [F] measured (in progress) |
| [fw-2] | magey/forever-warrior #2, <https://github.com/magey/forever-warrior/issues/2> | HS queue and the off-hand DW penalty; addon limits | [F] measured |
| [fw-3] | magey/forever-warrior #3, <https://github.com/magey/forever-warrior/issues/3> | rage normalization logs | [F] measured |
| [wago-ppm] | wago.tools `SpellProcsPerMinute` (Forever), <https://wago.tools/db2/SpellProcsPerMinute?build=1.60.1.69913> | PPM rows; **a human should confirm this in a browser** (no further automated access) | [F] client |
| [wt-skill] | Warcraft Tavern, weapon skills in Forever, <https://www.warcrafttavern.com/forever/news/weapon-skills-in-world-of-warcraft-forever/> | Edgemaster's +1, racials | [F] reported |
| [wowsod] | wowsod.pro, Forever vs Classic pillar guide, <https://wowsod.pro/articles/wow-forever-vs-classic-every-key-change> | beta cap, raids, Q&A items (debuff limit and dual spec not announced) | [F] reported |
| [cwgg-raids] | classicwow.gg, Forever raids, <https://classicwow.gg/forever/raids> | raid sizes, unlock date, no flex | [F] reported |
| [bf-wbuffs] | Blizzard EU forums, "Question - World buffs" (2026-09-14), <https://eu.forums.blizzard.com/en/wow/t/question-world-buffs/628446> | player relays a streamer claim that world buffs don't work in instances | [F] reported (unofficial) |
| [mop-debuff] | Massively Overpowered, "No buff/debuff limits … anniversary realms" (2024), <https://massivelyop.com/2024/11/19/dual-spec-and-no-buff-debuff-limits-are-coming-to-the-wow-classic-anniversary-realms/> | Classic Era debuff-limit status | [C] |
| [bz-1137] | Blizzard, 1.13.7 PTR post, <https://us.forums.blizzard.com/en/wow/t/wow-classic-version-1137-ptr-is-now-available/838945> | batching 400 → 10 ms | [C] |
| [tz-forever] | tzcnt/WarriorSim Forever notes, <https://github.com/tzcnt/WarriorSim/tree/master/data/forever> | Rend per-tick evaluation; user-tested ability values | [F] reported |

[fc-beta]: https://foreverchanges.pro/beta
[fc-changes]: https://foreverchanges.pro/changes
[fc-legacy]: https://foreverchanges.pro/legacy-perks
[fc-racials]: https://foreverchanges.pro/racials
[fc-items]: https://foreverchanges.pro/items
[fc-prof]: https://foreverchanges.pro/professions
[fc-camping]: https://foreverchanges.pro/professions/camping
[items-ratings]: ../data/items.md#forevers-ratings-f-with-open-questions
[bz-deepdive]: https://news.blizzard.com/en-us/article/24303313/world-of-warcraft-forever-deep-dive-panel-recap
[gs-forever]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[gs]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[ui-skills]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/SkillsFrame.lua
[ui-stats]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua
[wf-cr]: https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats/combatratings.txt
[wf-basestats]: https://github.com/wowsims/forever/blob/master/sim/core/base_stats_auto_gen.go
[wf-spell]: https://github.com/wowsims/forever/blob/master/sim/warrior/spell_data_auto_gen.go
[wf-36]: https://github.com/wowsims/forever/issues/36
[wf-2]: https://github.com/wowsims/forever/issues/2
[fw-1]: https://github.com/magey/forever-warrior/issues/1
[fw-2]: https://github.com/magey/forever-warrior/issues/2
[fw-3]: https://github.com/magey/forever-warrior/issues/3
[wago-ppm]: https://wago.tools/db2/SpellProcsPerMinute?build=1.60.1.69913
[wt-skill]: https://www.warcrafttavern.com/forever/news/weapon-skills-in-world-of-warcraft-forever/
[wowsod]: https://wowsod.pro/articles/wow-forever-vs-classic-every-key-change
[cwgg-raids]: https://classicwow.gg/forever/raids
[bf-wbuffs]: https://eu.forums.blizzard.com/en/wow/t/question-world-buffs/628446
[mop-debuff]: https://massivelyop.com/2024/11/19/dual-spec-and-no-buff-debuff-limits-are-coming-to-the-wow-classic-anniversary-realms/
[bz-1137]: https://us.forums.blizzard.com/en/wow/t/wow-classic-version-1137-ptr-is-now-available/838945
[tz-forever]: https://github.com/tzcnt/WarriorSim/tree/master/data/forever
