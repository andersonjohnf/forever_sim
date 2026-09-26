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
- **Periodic effects can crit**, per the client tooltip; a per-spell client flag says which
  (whether the server honours it is unverified).
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

- Consume **ratings** from gear and convert them in the stat pipeline (hit 10, crit 14, dodge
  12, parry 15, block 5 per 1%; defense 1:1; haste 10 and expertise 10 by hypothesis behind
  `unmeasuredRatings`, [D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22))
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
| **Unified hit and crit** | One hit stat for melee, ranged and spells; one crit stat likewise | [F] [Blizzard Deep Dive][bz-deepdive]; foreverchanges item data: Classic items' melee-hit and spell-hit lines both became "Hit Rating", and melee- and spell-crit lines both "Critical Strike Rating" ([items dataset][items-ratings]). In combat [?] | **high** (hybrids; one stat feeds both tables) | [combat-tables §6](combat-tables.md#6-hit-caps); [character-stats.md](character-stats.md) |
| **Combat ratings on gear** | Items carry ratings instead of %: hit 10, crit 14, dodge 12, parry 15, block 5 per 1%, defense 1:1; plus new Haste, Expertise, Armor Penetration and Health Regeneration stats. The same at every level. The new ratings apply by hypothesis (haste and expertise 10 per 1%, armor penetration flat), behind `unmeasuredRatings` ([D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)). | [F] as displayed for hit, crit, dodge, parry, block and defense ([items dataset][items-ratings]); haste and expertise 10 per 1% [F] in the client's `combatratings.txt` ([client], 1.60.1.69913), applied by hypothesis [?]; in combat [?] | **high** | [character-stats.md](character-stats.md); [combat-tables §10](combat-tables.md#10-ratings) |
| **Raid-boss hit caps** | Tooltips: 8% melee, 27% dual wield, 17% spells (Classic Era: 9% / 28% / 16%), which implies no hit suppression and no spell 1% floor | [F] client strings ([gs][gs-forever]); [?] in combat, untested ([fw-1]) | **high** | [combat-tables §6](combat-tables.md#6-hit-caps) |
| **Weapon skill** | Client skill panel: 0.04% hit/dodge/parry/crit per point (Classic: 0.1–0.2%); racials give crit instead of skill; items give less (Edgemaster's +7 → +1, Huge Thorium Battleaxe +10 → +2) | 0.04% per point: [F] client UI ([SkillsFrame][ui-skills]), [?] in combat; racials and items [F] ([fc-racials]; [fc-items]; [Warcraft Tavern][wt-skill]) | **high** | [combat-tables §4](combat-tables.md#4-weapon-skill-vs-defense) |
| **Boss parry** | Tooltip: 16.5% (Classic 14%) | [F] client strings ([gs][gs-forever]); [?] in combat | **high** for tanks (parry haste) | [combat-tables §1.1](combat-tables.md#11-profile-parameters-player-level-60-vs-boss-level-63-defense-315) |
| **Glancing blows** | Chance unchanged (40% vs +3); client UI penalty 25% at 300 skill (Classic 35%). Glancing damage vs higher-level mobs is reported **broken on the beta** | [F] client UI ([SkillsFrame][ui-skills]); the 25% penalty [?] in combat; broken damage [?] (third-party report, [magey/forever-warrior#1][fw-1]) | **high** (~4% of white damage) | [combat-tables §2.3](combat-tables.md#23-glancing-blows) |
| **Crit suppression** vs +3 | Skill part 0.6% (UI) vs Classic's 3%; the 1.8% aura part is unverified | skill part [F] client UI, [?] in combat; aura part [?] | **high** | [combat-tables §4.4](combat-tables.md#44-crit-suppression) |
| **Expertise** | New: "reduces the chance to be dodged or parried"; 10 rating = 1% as displayed; combat effect unknown | [F] [bz-deepdive]; [gs][gs-forever]; combat [?] | medium (tanks), low (DPS from behind) | [combat-tables §7](combat-tables.md#7-expertise-forever) |
| **Haste stat** | Haste Rating (10 = 1% by hypothesis, D12), haste flask, haste set bonuses, Skyborne racial +1% | rating cost 10 [F] client game table ([client]); its combat effect [?] (D12); flask, sets and racial [F] ([fc-items]; [fc-racials]) | medium | [damage-and-timing §3.1](damage-and-timing.md#31-haste) |
| **Armor penetration; negative armor** | New flat armor-pierce stat (modelled as flat armor removed, D12); armor below 0 increases damage in the `forever` profile (Classic: floor 0) | [F] tooltip text ([gs][gs-forever]; not shown on foreverchanges); in combat [?] | low to medium | [damage-and-timing §1.2](damage-and-timing.md#12-armor-reduction-debuffs-and-penetration) |
| Spell penetration below 0 resistance | "Spell Vulnerability": negative resistance increases spell damage taken | [F] tooltip text ([gs][gs-forever]); in combat [?] | low | [combat-tables §9](combat-tables.md#9-spell-hit-and-crit-generic) |
| **Periodic crits and per-tick evaluation** | "Most periodic effects can critically strike". Per-spell client flag (`PERIODIC_CAN_CRIT`, SpellMisc Attributes[8]): Rend, Rake, Rip, Pounce and Lacerate yes; Deep Wounds (412609) and Consecration no. The `forever` profile lets flagged ticks crit. A third-party sim reports Rend reading AP, modifiers and crit per tick (no snapshot); only its 0.02 × AP a tick is adopted ([D36](../decisions.md#d36-what-we-take-from-warriorsim-2026-09-25)), read as the tick lands: otherwise both profiles snapshot at application (Deep Wounds excepted). | [F] tooltip text ([gs][gs-forever]); per-spell flags [F] [client] (SpellMisc, 1.60.1.69913; [wf-spell] agrees), whether flagged ticks crit in combat [?]; per-tick reads [?] ([tzcnt Forever notes][tz-forever], anecdotal) | medium (bleed specs) | [damage-and-timing §4](damage-and-timing.md#4-dots-and-bleeds); class docs |
| **Rage normalization** | Swing rage is a fixed amount per landed hit set by weapon speed. [rage.md](rage.md#forever-normalized-rage-per-swing-) owns the model: `k × speed` with k = 3.46 (1H) or 4.5 (2H), no crit bonus [?], fitted to public beta logs once each swing's fraction of a tenth counts ([rage § rounding](rage.md#rounding)). Damage-taken rage is `10 × damage before armor, block and absorbs ÷ max health` [?], fitted to about 2,000 logged beta hits: blocked and absorbed hits give full rage, several attackers each count, and it is much lower than Classic at 60 ([rage § damage taken](rage.md#forever-)). | [?] third-party beta logs ([magey/forever-warrior#3][fw-3]; [wowsims/forever#2][wf-2]; [tzcnt/forever-data][fd-logs]) | **high** (warrior, bear) | [rage.md](rage.md) |
| HS/Cleave queue and the off-hand DW penalty | The Classic rule (a queued HS/Cleave removes the off-hand penalty) is kept in both profiles [C]; a third-party beta test found it still present (5.19% vs 18.27% off-hand miss, 77 and 394 swings) | [?] third-party measurement ([magey/forever-warrior#2][fw-2]); guild test pending | **high** (Fury) | [combat-tables §5](combat-tables.md#5-dual-wield-and-on-next-swing-queues) |
| Normalized weapon damage | Same rule; new normalized abilities (Holy Strike, Spearing Strike) | [F] client effects as read by the class docs ([damage-and-timing §2.2](damage-and-timing.md#22-normalization-for-instant-attacks)); [wf-spell] corroborates | low | [damage-and-timing §2.2](damage-and-timing.md#22-normalization-for-instant-attacks) |
| PPM table | Classic Era's 1–10 PPM rows (IDs 454–463) plus a new 2.3 PPM row (ID 479). No client proc references any PPM row, so proc rates are server-side and keep their own [C]/[?] tags | [F] [client] (SpellProcsPerMinute, SpellAuraOptions, 1.60.1.69913) | low | [damage-and-timing §5](damage-and-timing.md#5-procs) |
| Armor formula | No change found (Classic 400 + 85 × level). The client's `armormitigationbylvl.txt` holds retail values (1,059 at 60, [F] [client]); not adopted | [C]; [?] | high **if** wrong | [damage-and-timing §1.1](damage-and-timing.md#11-formula) |
| Debuff limit | Not announced. Classic Era realms keep 16 debuffs; the limit was removed on Hardcore (1.14.4) and Anniversary (1.15.5) realms | [F] not announced ([wowsod]); [C] ([Massively OP][mop-debuff]) | low (the sim assumes the modeled debuffs fit) | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |
| Spell batching | Not announced. Classic Era has been at 10 ms since 1.13.7 | [C] ([Blizzard][bz-1137]) | low (not modeled) | [damage-and-timing §3.6](damage-and-timing.md#36-server-tick-and-spell-batching) |
| Unchanged (checked) | Crit ×2.0 / ×1.5; crushing 15% ×1.5; creature crit ×2; 440 defense uncrittable; glancing chance 40%; boss dodge 6.5%; DW +19%; parry haste 40%; GCD 1.5 s / 1.0 s cat; AP/14; armor cap 75%; resistance formula | [F] client tooltips and code ([gs][gs-forever]; [stats Lua][ui-stats]); GCDs from the class docs' client reads ([damage-and-timing §3.5](damage-and-timing.md#35-global-cooldown)). Since the client shows the Classic values, combat keeps Classic's measured behaviour [C] | none | combat-tables, damage-and-timing |

---

## 3. Characters and classes

| Change | Forever vs Classic Era | Source | Sim impact | Owner |
| --- | --- | --- | --- | --- |
| Class talents and spells | 747 changes: 113 new talents, 300 changed, 77 removed and 257 changed spells; a new 16-point milestone talent | [F] [foreverchanges changes][fc-changes]; [bz-deepdive] | **high** | [classes/warrior.md](../classes/warrior.md), [druid.md](../classes/druid.md), [paladin.md](../classes/paladin.md) |
| Buff talents made baseline | e.g. Blessing of Kings, Improved Mark of the Wild and Divine Spirit are baseline; buff-improvement talents cut | [F] [bz-deepdive] | medium (buff presets) | [buffs-debuffs-consumables.md](buffs-debuffs-consumables.md) |
| Racials reworked | 2 active + 2 passive per race, "similar offensive power". Weapon-skill racials become crit (e.g. Human Sword Specialization, Orc Axe Specialization +1% crit, Dwarf Mace Specialization). Blood Fury +10% AP and SP for 15 s; Stoneform reduces physical damage; Skyborne Wind Blessed +1% haste. | [F] [fc-racials]; [bz-deepdive] | medium | [character-stats.md](character-stats.md) |
| Crit per Agility and base stats | From the client's `PlayerExpectedStat`: warrior 0.05 (20 Agi per 1%), druid 0.05, paladin 0.0506, rogue 0.0345, hunter 0.0189. These match Classic Era's per-class values as far as checked. | [F] [client] (PlayerExpectedStat, 1.60.1.69913), used by [character-stats](character-stats.md#agility); wowsims/forever's read agrees ([wf-basestats], secondary) | low | [character-stats.md](character-stats.md) |
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
| Potions | Rage potions usable by Druids; new Frenzy potions (+AP and ranged AP for 30 s: Major +80 since 1.60.1.70009, +40 before); Potion of Demonslaying changed to +108 SP / +185 AP vs Demons for 2 min; new Restored Healing/Mana potions (% based) | [F] [fc-items] | medium | buffs doc |
| Food | Well-fed buffs reworked (15 min): new stat foods (e.g. Bear Bruscitti +20 Str, Flank au Poivre +20 Agi), Grilled Squid now +1% crit, Tender Wolf Steak +15 Agi, Dirge's Chimaerok Chops still +25 Sta | [F] [fc-items]; [bz-deepdive] | medium | buffs doc |
| **Camping buffs** | Camp objects give one-hour buffs that copy class buffs and don't stack with them: Lodestone 90 melee AP (vs Blessing of Might), Sharpening Wheel 34 Str (vs Strength of Earth), Camp Chair 2% crit, Fish Bowl 8% stats (vs Kings), Enchanted Lute (vs Mark of the Wild), First Aid Kit 56 Sta (vs Fortitude), … Whether they work inside instances is unknown. | [F] [foreverchanges camping][fc-camping]; [bz-deepdive] | **high** if usable in raids, see [Open questions](#open-questions) | buffs doc |
| Raid buff and debuff magnitudes | Forever values differ from Classic Era for several buffs. Examples: Mark of the Wild rank 7 (9885) is +385 armor, +16 stats, +27 resistances; Thunder Clap (11581) slows attack speed by 20% (Classic 10%); Demoralizing Shout (11556) is −204 AP at 60 for 45 s (the level-60 tooltip: base −196 and a per-level term in the client data; whether combat applies it is an [open question](buffs-debuffs-consumables.md#open-questions)). The buffs doc compares each one with Classic Era. | [F] Forever tooltips ([foreverchanges spellbooks][fc-spellbooks]); wowsims/forever's census agrees ([wf-spell]; [wf-36], secondary) | **high** | buffs doc |

---

## WoW Forever deviations

This whole document is a list of deviations. The ones that change how the engine must be
built, rather than only its numbers:

1. **Ratings on gear**, with one hit stat and one crit stat → the stat pipeline converts
   ratings, and one hit % feeds both the melee and spell tables.
2. **Two attack-table profiles** (`forever` from client UI, `classicEra` from measurement)
   until the guild measures the Forever table. Per doctrine §2, the client UI values are [F] for
   what the client shows and [?] in combat, so they drive the `forever` defaults and stay open
   questions.
3. **Periodic crits** → DoT ticks need a crit roll when the spell's flag says so (`forever`; the flags
   are [F] client data, their combat effect [?]).
4. **Negative armor and negative resistance** → don't floor at 0 in the `forever` profile (tooltip text [F]; in combat [?]).
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

**WE-1: ratings to percentages (as displayed; `forever` profile).** 140 crit rating → 10.0%
crit; 60 hit rating → 6.0% hit (melee **and** spell); 36 dodge rating → 3.0%; 30 parry rating →
2.0%; 25 block rating → 5.0%; 20 defense rating → +20 defense (320 total at level 60). By the
D12 hypothesis [?], with `unmeasuredRatings: 'apply'`: 50 haste rating → 5.0% haste and 12
expertise rating → 1.2% (0 with `'ignore'`, and in `classicEra`).

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
5. **Rage formulas at level 60** [?]. Measured only at levels 1–25, by third parties ([fw-3]; [fd-logs]; [rage.md open questions](rage.md#open-questions)).
6. **Armor mitigation constant** [?]. A retail-valued game table exists in the client
   (`armormitigationbylvl.txt`, 1,059 at 60, [client])
   ([damage-and-timing open questions](damage-and-timing.md#open-questions)).
7. **World buffs.** Directive: excluded. The only public hint (a player relaying a streamer on
   the Blizzard forums) agrees that they don't work in instances ([bf-wbuffs]). Revisit only
   if Blizzard says otherwise ([doctrine §1](../doctrine.md#1-what-were-building)).
8. **Testing constraints.** The beta is capped at level 20 (→ 30), there are no target
   dummies ([fw-1]), and the modern addon API limits combat-log detail ([fw-2]). In-game tests
   of `+3` rules must use mobs 3 levels above the tester.
9. **Third-party and secondary findings to repeat** [?]: the HS-queue off-hand result ([fw-2];
   [combat-tables open questions](combat-tables.md#open-questions)), whether ticks with the
   periodic-crit flag crit in combat, and negative armor ([damage-and-timing open questions](damage-and-timing.md#open-questions)),
   and the beta's broken glancing damage ([fw-1]).

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
| [gs-forever] | Forever client GlobalStrings enUS, <https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua> | combat tooltips | [F] client (verbatim mirror): what the client displays; combat [?] until measured |
| [ui-skills] | Forever `Camelot/SkillsFrame.lua`, <https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/SkillsFrame.lua> | weapon-skill formulas | [F] client (verbatim mirror): what the client computes; combat [?] until measured |
| [ui-stats] | Forever `Camelot/PaperDollFrameStats.lua`, <https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua> | enemy tables, AP/14 | [F] client (verbatim mirror): what the client computes; combat [?] until measured |
| [wf-cr] | wowsims/forever CombatRatings, <https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats/combatratings.txt> | rating conversions | [?] secondary (corroborates the client game table, now read directly: [client]) |
| [wf-basestats] | wowsims/forever `sim/core/base_stats_auto_gen.go`, <https://github.com/wowsims/forever/blob/master/sim/core/base_stats_auto_gen.go> | crit per Agility from `PlayerExpectedStat` | [?] secondary (corroboration only) |
| [wf-spell] | wowsims/forever generated spell data, <https://github.com/wowsims/forever/blob/master/sim/warrior/spell_data_auto_gen.go> (and druid, paladin) | GCDs, effect types, periodic-crit flags, buff values | [?] secondary (client data read by wowsims; corroborates the periodic-crit flags now read directly, [client]) |
| [wf-36] | wowsims/forever issue #36, <https://github.com/wowsims/forever/issues/36> | buff and debuff census against the Forever client | [?] secondary (corroboration only) |
| [fc-spellbooks] | foreverchanges.pro spellbooks, <https://foreverchanges.pro/spellbook/druid> (and `/warrior`, `/warlock`) | Mark of the Wild, Thunder Clap, Demoralizing Shout tooltips | [F] |
| [wf-2] | wowsims/forever issue #2, <https://github.com/wowsims/forever/issues/2> | "rage is normalized; crit does not double the gain" | [?] secondary (reported) |
| [fw-1] | magey/forever-warrior #1, <https://github.com/magey/forever-warrior/issues/1> | attack-table test plan; glancing broken; no dummies | [?] third-party measurement (in progress) |
| [fw-2] | magey/forever-warrior #2, <https://github.com/magey/forever-warrior/issues/2> | HS queue and the off-hand DW penalty; addon limits | [?] third-party measurement |
| [fw-3] | magey/forever-warrior #3, <https://github.com/magey/forever-warrior/issues/3> | rage normalization logs (1H 3.46 per second of speed; damage taken as pre-armor damage × 10 / max health) | [?] third-party measurement |
| [fd-logs] | tzcnt/forever-data raw logs @c7d1746 (18–19 Sep 2026, build 1.60.1), <https://github.com/tzcnt/forever-data/tree/c7d17462c50d1eb0103aa5e2aff52f77f33e3418/raw-logs> | rage from damage taken, re-analysed 2026-09-23 in [rage.md](rage.md#forever-) | [?] third-party logs |
| [client] | Raw Forever client files (build 1.60.1.69913) read through the wago.tools API, [../data/client.md](../data/client.md#doc-claims-checked-against-the-raw-client) | PPM rows, periodic-crit flags, `PlayerExpectedStat`, game tables | [F] client |
| [wago-ppm] | wago.tools `SpellProcsPerMinute` (Forever), <https://wago.tools/db2/SpellProcsPerMinute?build=1.60.1.69913> | PPM rows (browse link; the values were checked in the raw client files, [client]) | [F] client |
| [wt-skill] | Warcraft Tavern, weapon skills in Forever, <https://www.warcrafttavern.com/forever/news/weapon-skills-in-world-of-warcraft-forever/> | Edgemaster's +1, racials | [F] reported |
| [wowsod] | wowsod.pro, Forever vs Classic pillar guide, <https://wowsod.pro/articles/wow-forever-vs-classic-every-key-change> | beta cap, raids, Q&A items (debuff limit and dual spec not announced) | [F] reported |
| [cwgg-raids] | classicwow.gg, Forever raids, <https://classicwow.gg/forever/raids> | raid sizes, unlock date, no flex | [F] reported |
| [bf-wbuffs] | Blizzard EU forums, "Question - World buffs" (2026-09-14), <https://eu.forums.blizzard.com/en/wow/t/question-world-buffs/628446> | player relays a streamer claim that world buffs don't work in instances | [F] reported (unofficial) |
| [mop-debuff] | Massively Overpowered, "No buff/debuff limits … anniversary realms" (2024), <https://massivelyop.com/2024/11/19/dual-spec-and-no-buff-debuff-limits-are-coming-to-the-wow-classic-anniversary-realms/> | Classic Era debuff-limit status | [C] |
| [bz-1137] | Blizzard, 1.13.7 PTR post, <https://us.forums.blizzard.com/en/wow/t/wow-classic-version-1137-ptr-is-now-available/838945> | batching 400 → 10 ms | [C] |
| [tz-forever] | tzcnt/WarriorSim Forever notes, <https://github.com/tzcnt/WarriorSim/tree/master/data/forever> | Rend per-tick evaluation; user-tested ability values | [?] secondary (anecdotal; not adopted) |

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
[fd-logs]: https://github.com/tzcnt/forever-data/tree/c7d17462c50d1eb0103aa5e2aff52f77f33e3418/raw-logs
[wago-ppm]: https://wago.tools/db2/SpellProcsPerMinute?build=1.60.1.69913
[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[wt-skill]: https://www.warcrafttavern.com/forever/news/weapon-skills-in-world-of-warcraft-forever/
[wowsod]: https://wowsod.pro/articles/wow-forever-vs-classic-every-key-change
[cwgg-raids]: https://classicwow.gg/forever/raids
[bf-wbuffs]: https://eu.forums.blizzard.com/en/wow/t/question-world-buffs/628446
[mop-debuff]: https://massivelyop.com/2024/11/19/dual-spec-and-no-buff-debuff-limits-are-coming-to-the-wow-classic-anniversary-realms/
[bz-1137]: https://us.forums.blizzard.com/en/wow/t/wow-classic-version-1137-ptr-is-now-available/838945
[tz-forever]: https://github.com/tzcnt/WarriorSim/tree/master/data/forever
[fc-spellbooks]: https://foreverchanges.pro/spellbook/druid
