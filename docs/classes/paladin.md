# Paladin: Retribution and Protection

WoW Forever reworks the paladin more than any other class in scope. The biggest change is that
**Judgement no longer consumes the Seal**, so a paladin keeps one seal up and judges it on
cooldown. Damage judgements now roll on the **melee** table: they can't be dodged, parried or
blocked, and they crit for double damage. Judgement of Righteousness and of Fury can miss, but
Judgement of Command can't (its damage spell is *Always Hit*). Judgement debuffs still
always hit and now last 40 s instead of 10 s. Retribution gains a cheap 10 s strike (Holy Strike), a
spell-damage-from-Intellect capstone line (Champion of the Light), a mana-positive judgement
talent (Sanctified Judgement), a reworked Vengeance (up to 3 stacks, 30 s) and Twist of
Light, which does seal twisting for you and makes seals cheaper. Protection gains a tank seal with a taunting
judgement (Seal of Fury), mana on block (Shield Specialization), Iron Creed and a stronger
Holy Shield; Righteous Fury is Classic Era's +60% Holy threat again (1.60.1.70009; it was +90%). Blessing of Sanctuary,
Sanctity Aura and Improved Blessing of Might are gone. Blessing of Might drops to 133 attack
power at rank 7 (112 at rank 6, the trainer's: rank 7 is an Ahn'Qiraj libram, D36), Consecration and Blessing of Kings are trained baseline, and Blessings last an hour.
Undead can now be paladins, so **both factions have paladins**, and Dwarves can be shamans,
so both factions also have Windfury. This doc is the engine contract for both specs: every
ability, proc and talent at level 60, with numbers, hit-table behaviour, rotation settings,
defaults, worked examples and the questions the beta has to answer.

Status: researched 2026-09-22, updated 2026-09-24 for 1.60.1.70009 ([what changed](#changes-in-160170009)) · Forever client build 1.60.1.70009 · Classic Era 1.15.9.69722 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified · engine: the class foundation (seals, judgements, spells, mana, talents; [Implementation notes](#implementation-notes)), the Retribution rotation ([Forever priority list](#forever-priority-list-default)) and Protection's (slice C3, [Protection: model and rotation](#protection-model-and-rotation))

---

## What the sim needs

Both specs need the following. Each item links to its section.

1. **One active seal**, 30 s duration, recast by the rotation. Damage-seal procs fire on
   **landed main-hand auto attacks** (white swings and extra attacks), not on specials
   ([Seals](#seals)).
2. **Judgement** as an off-GCD, 10 s (8 s talented) cooldown that fires the active seal's
   judgement **without removing the seal**. Damage judgements (JoC, JoR, JoF) roll the melee
   special-attack table with no dodge, parry or block; JoC's damage spell is *Always Hit*, so
   only JoR and JoF can miss. Debuff judgements (JotC, JoW, JoL, JoJ) always hit
   ([Judgement](#judgement)).
3. **Judgement debuffs** (Crusader, Wisdom, Light, Justice): one per paladin per target,
   40 s (Justice 10 s), refreshed by the paladin's melee strikes and by Holy Strike with
   Sacred Arbiter.
4. **Seal of Command**: a 7 PPM proc from base weapon speed, 1 s internal cooldown, 70%
   weapon damage as Holy ([Seal of Command](#seal-of-command-soc)).
5. **Holy Strike**, **Consecration** (new two-part tick model), **Exorcism** (Undead/Demon
   only), **Hammer of Wrath** (target ≤ 20% health), and for Protection **Holy Shield**,
   **Righteous Fury**, **Seal of Fury** and **Hammer of the Righteous**, which shares a
   cooldown category with Holy Strike ([Other abilities](#other-abilities)).
6. **Stacking buffs and procs**: Vengeance (1–3 stacks), Vindication, Twist of Light echoes,
   Reckoning extra attacks, Redoubt, Iron Creed and Swift Judgement ([Talents](#talents)).
7. **Mana**: base-mana-percent costs, Benediction, Holy Conduit, Sanctified Judgement,
   Shield Specialization, the five-second rule, potions and runes ([Mana model](#mana-model)).
8. **Threat** (Protection): Righteous Fury ×1.6 on Holy, Holy Shield +20%, Iron Creed, and
   Instrument of Law for Retribution ([Threat](#threat-paladin-specific)).
9. **Target type** from [encounter.md](../mechanics/encounter.md) gates Exorcism and Holy
   Wrath.
10. **Level scaling of lower-rank spells.** A rank learned below 60 grows by
    `EffectRealPointsPerLevel` per level up to its max level, truncated to a whole number by the
    datasets' rule, the client's own rounding [?] ([Conventions](#conventions-used-below)).

---

## WoW Forever deviations

Everything below comes from the Forever client
([foreverchanges /class/paladin](https://foreverchanges.pro/class/paladin),
[/spellbook/paladin](https://foreverchanges.pro/spellbook/paladin),
[/talents/paladin](https://foreverchanges.pro/talents/paladin)), checked against the
client's own DB2 tables ([client data](../data/client.md)) where a number matters. Tags are
per row.

### Races and factions

| Race | Faction | Paladin in Classic | Paladin in Forever | Combat-relevant racial (Forever) |
| --- | --- | --- | --- | --- |
| Human | Alliance | yes | yes [F] | Sword Specialization: **+2% crit with all spells and attacks** while a sword or 2H sword is equipped (was +5 weapon skill) [F] ([racials](https://foreverchanges.pro/racials); [client] (SpellEffect 20597, 1.60.1.70009)) |
| Dwarf | Alliance | yes | yes [F] | Mace Specialization (new to Dwarves): +1% crit with spells and attacks with a mace; Stoneform −10% physical damage taken for 8 s [F] [client] (SpellEffect, SpellDuration, 1.60.1.70009; 1259719, 20594) |
| Undead | Horde | no | **yes (new)** [F] | Touch of the Grave: 5% chance on spell or attack hit to drain health from the target, up to 5% of max health, 1 s internal cooldown [F]; the client spell 1260189 is a dummy (5), so the drain formula is server-side. Simulated as 5% of maximum health as Shadow damage a proc, never missing or critting, with damage threat and its heal's healing threat, not Righteous Fury's (Holy only) [?] ([character-stats](../mechanics/character-stats.md#touch-of-the-grave)) |

"Both factions have access to all nine classes in Forever"
([racials](https://foreverchanges.pro/racials)). Horde raids therefore have Blessings, and
Alliance raids have Windfury Totem (Dwarf shamans). **Buff presets should not be split by
faction** for Blessings or Windfury. See
[buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md) and
[character-stats.md](../mechanics/character-stats.md) (racials) for the details. Summon
Charger is Dwarf and Human only [F].

### Changes that affect a DPS/TPS sim

| Area | Classic Era | WoW Forever | Tag, source |
| --- | --- | --- | --- |
| **Judgement consumes seal** | yes | **no**: "Does not consume the Seal." | [F] [spellbook](https://foreverchanges.pro/spellbook/paladin), [F 20271][f20271] |
| Judgement hit table | Magic class: damage judgements roll spell hit and spell crit | **Melee class** + *No Active Defense*: damage judgements (JoC, JoR, JoF) roll melee crit ×2 and never dodge, parry or block. **JoR and JoF roll melee miss; JoC's damage spell 20966 carries *Always Hit*, so JoC can't miss.** Debuff judgements (JotC, JoW, JoL, JoJ) carry *Always Hit* in both clients | [F] [client] (SpellCategories DefenseType 2, SpellMisc Attr0 0x200000 / Attr3 0x40000, 1.60.1.70009; [20286][f20286], [20414][f20414], [20968][f20968], [20966][f20966], [20303][f20303], [20355][f20355]) vs [C 20286][c20286], [C 20968][c20968], [C 20303][c20303]. Whether the server honours JoC's Always Hit is [?] ([open question 23](#open-questions)) |
| Judgement debuff duration (Crusader, Wisdom, Light) | 10 s | **40 s**, still refreshed by your melee strikes | [F] [client] (SpellDuration, 1.60.1.70009; [20303][f20303], [20355][f20355]) |
| Judgement of the Crusader (r6) | +140 Holy damage taken | **+161** (Improved SotC's 15% is now baseline) | [F] [F 20303][f20303] |
| Improved Seals (was Improved SoR) | +15% SoR/JoR, 5 ranks | **+15% all seal procs and judgements**, 3 ranks | [F] [client] (SpellEffect spell masks, TraitDefinitionEffectPoints, 1.60.1.70009; [20224][f20224]) |
| Seal of Command, SoR, JoC, JoR numbers | — | unchanged at max rank (SoR ranks 1–3 get the full 0.1 coefficient) | [F] [spellbook](https://foreverchanges.pro/spellbook/paladin) |
| Holy Strike | — | **new**, 8 ranks; r8: 20 mana, **10 s**, **50%** weapon + 81–105, Holy (12 s and 40% before 1.60.1.70009) | [F] [client] (SpellEffect, SpellCategories, SpellMisc, 1.60.1.70009; [10333][f10333]) |
| Seal of Fury / Judgement of Fury | — | **new tank seal**; r7: +35 Holy per swing, absorb, judgement 146–160 + taunt 4 s | [F] [F 20423][f20423]; the 35 and 146–160: [client] (SpellEffect, 1.60.1.70009; [20418][f20418], [20414][f20414]) |
| Hammer of the Righteous | SoD rune only | **trained at 40**: 3× MH weapon DPS as Holy to the target and up to 3 more (tooltip); shares cooldown with Holy Strike | [F] [F 407632][f407632]; shared category 2404: [client] (SpellCategories, 1.60.1.70009) |
| Consecration | Holy talent; r5 384 over 8 s, 0.042/tick | **trained at 20**; r5 96 to all + 216 to the first 4, 0.095/tick on the capped part | [F] [client] (SpellEffect, 1.60.1.70009; [1280349][f1280349]) vs [C 20924][c20924] |
| Exorcism r6 | 505–563 | **475–529** | [F] [F 10314][f10314] |
| Hammer of Wrath r3 | 504–556 | **474–522** | [F] [F 24239][f24239] |
| Holy Shield r3 | 30% block, 130 dmg, 0.05 coef | **20% block, 221 dmg, 0.08 coef**, 4 charges | [F] [client] (SpellEffect, SpellAuraOptions, 1.60.1.70009; [20928][f20928]) vs [C 20928][c20928] |
| Righteous Fury | +60% Holy threat | **+60%**, the same (+90% until 1.60.1.70009) | [F] [client] (SpellEffect, school mask 2, 1.60.1.70009; [25780][f25780]) |
| Improved Righteous Fury | +16/33/50% RF threat | **−2/4/6% damage taken** while RF is up | [F] [talents](https://foreverchanges.pro/talents/paladin); [client] (TraitDefinitionEffectPoints curve 82954, 1.60.1.70009) |
| Blessing of Might r6 (19838), the trainer's (r7 is an Ahn'Qiraj libram, D36) | 155 AP, 5 min | **112 AP, 1 h** (r7: 133) | [F] [F 19838][f19838] ([F 25291][f25291]) |
| Improved Blessing of Might | +20% | **removed** | [F] [class page](https://foreverchanges.pro/class/paladin) |
| Blessing of Kings | Prot talent (tier 3) | **trained at 20**, 1 h | [F] [F 20217][f20217] |
| Blessing of Wisdom r5 (19854), the trainer's (r6 is an Ahn'Qiraj libram, D36) | 30 mp5 | **36 mp5**, 1 h (r6: 40) | [F] [F 19854][f19854] ([F 25290][f25290]) |
| Blessing of Salvation | 5 min | 1 h, still −30% threat | [F] [client] (SpellEffect, 1.60.1.70009; [1038][f1038]) |
| Blessing of Sanctuary (+ Greater) | talent | **gone from the client** | [F] [spellbook "Not in Forever"](https://foreverchanges.pro/spellbook/paladin), [C 20914][c20914] |
| Sanctity Aura (+10% party Holy damage) | Ret talent | **removed** from the tree and not trained | [F] [class page](https://foreverchanges.pro/class/paladin) |
| Retribution Aura r5 | 20 | **30** Holy per hit taken, + 0.08 × your spell damage since 1.60.1.70009 (the coefficient [?]) | [F] [F 10301][f10301]; the scaling: the 1.60.1.70009 dev notes, [below](#changes-in-160170009) |
| Improved Devotion / Retribution / Concentration Aura, Improved SotC, Lasting Judgement, Improved BoW, Improved LoH | talents | **removed** | [F] [class page](https://foreverchanges.pro/class/paladin) |
| Divine Shield | +100% attack interval | −50% damage dealt | [F] |
| Lay on Hands | 1 h cooldown | 20 min cooldown, mana drain doesn't stop regen | [F] |

New and changed talents are covered in [Talents](#talents). Spells whose only change is a
longer Blessing, a party-to-raid resistance aura or a mount tooltip are omitted.

### Changes in 1.60.1.70009

The beta build 1.60.1.70009 (2026-09-24) changed the paladin; each change is in the client's data
[F] [client] (1.60.1.70009) and in the build's dev notes, an official source [F]. The sections below
carry the new values.

| Change | Before (1.60.1.69913) | 1.60.1.70009 | The sim |
| --- | --- | --- | --- |
| Righteous Fury (25780) | +90% Holy threat | **+60%**, Classic Era's value | ×1.6 on Holy threat ([Threat](#threat-paladin-specific)) |
| Holy Strike (10333) | 12 s (10 s with Improved Holy Strike 2/2); 40% weapon at rank 8 | **10 s** baseline, Improved Holy Strike removed ("made its behavior baseline"); **50%** at rank 8 (ranks 1–8: 25/29/32/36/39/43/46/50%) | [Other abilities](#other-abilities) |
| Vengeance (20049, 20050) | 5 stacks; any crit (its proc mask had periodic damage, 0x40000) | **3 stacks**, from **non-periodic** crits (proc mask 69972, no periodic bit) | +1/2/3% a stack, 9% at 3/3 ([Retribution tree](#retribution-tree)) |
| Crusade | +2% damage, +2% more vs Demon and Undead | **removed** from the tree | its points refunded ([data/talents.md](../data/talents.md#tree-versions)) |
| Sacred Arbiter (1311087) | Holy Strike +10% | **+20%** | |
| Two-Handed Weapon Specialization (20111) | 3/6/9% | **2/4/6%** | Physical only, as before |
| Twist of Light (1310735) | echoes only | also **−20% mana on the seals** (aura 108 on cost) | added to Benediction's cut [?] ([mana model](#mana-model)) |
| Holy Power (5923) | +1% crit a rank on spells | also **+3% a rank on Holy Strike** (and Holy Shock) | tier 6 Holy: out of both default builds' reach |
| Retribution Aura (10301), and the druid's Thorns | flat 30 (Thorns 22) | "will now dynamically update its values based on the caster's spell power" | the client has no coefficient, so 0.08 [?], Holy Shield's ([buffs §1.2](../mechanics/buffs-debuffs-consumables.md#12-threat-defense-and-mana)) |

The default builds lost their Improved Holy Strike and Crusade points; the sim places them by
measurement ([Retribution defaults](#retribution-defaults), [Protection defaults](#protection-defaults)).
In the default Protection setup (seed 31101, 100,000 fights) the slice's build made **749.2 TPS** and
466.8 DPS, against 828.9 and 448.0 on 1.60.1.70009's data with the old values: Righteous Fury's cut is
most of it, which Holy Strike's 10 s and 50% and the scaling Thorns partly return. With the paladin
review's order and Holy Conduit 1 (PR-1) and a raid Restoration druid's Thorns (PR-4) it makes
**752.6 TPS** and 466.6 DPS. On the same seed the warrior makes 1,001.6 and the bear 1,126.6
(+33.1% and +49.7%): observations for the guild's tests, not a target missed (D29 has no numeric
target; [milestones T6](../milestones.md#m56-tanks-reviewed-against-the-guild-d28-d29-)).
Retribution makes **621.9 DPS** with the review's joint search (PR-2; 612.7 with the slice's
placement, 611.0 on this data with 3 points unspent).

### Forever system rules that matter here (owned elsewhere)

These are owned by [forever-system-changes.md](../mechanics/forever-system-changes.md#2-combat-rules)
and the docs it links; this list only summarizes them, with the same tags.

- **One hit stat and one crit stat** count for all attacks, melee and spell [F]: Blizzard's Deep
  Dive recap says so, and foreverchanges' item data shows it (Classic items' melee-hit and
  spell-hit lines both became "Hit Rating", and melee- and spell-crit lines both "Critical
  Strike Rating"; [combat-tables §6](../mechanics/combat-tables.md#6-hit-caps)). Whether 10 hit
  rating is exactly 1% in the spell table in combat is open
  ([combat-tables OQ 18](../mechanics/combat-tables.md#open-questions)). The
  [Warcraft Tavern Forever paladin guide](https://www.warcrafttavern.com/forever/guides/paladin/)
  and the community sim
  [ElliotWood/Forever `forever_rules.md`](https://github.com/ElliotWood/Forever/blob/master/docs/forever_rules.md)
  relay the same panel statement (secondary).
- **Periodic damage can crit**: the Forever tooltip says "Most periodic effects can critically
  strike" [F text], but which spells carry the flag was read only by a secondary source, so it
  is [?] ([damage-and-timing §4](../mechanics/damage-and-timing.md#4-dots-and-bleeds)). The
  secondary read puts no flag on Consecration's ranked spell; [open question 18](#open-questions)
  covers Consecration's ticks.
- **Bonus healing on gear adds spell damage at 1/3** [F] (Deep Dive; foreverchanges' item data,
  e.g. Whitesoul Helm's new "+12 Spell Damage" next to "+35 Healing",
  [items dataset](../data/items.md#forevers-ratings-f-with-open-questions)).
- Expertise exists: the T1 Protection 4-piece reduces dodge and parry of your attacks
  ([F 1301083][f1301083]) [F]. Its combat effect applies by hypothesis
  ([D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)).

---

## Conventions used below

- **Client data.** Numbers that foreverchanges doesn't print (coefficients, variance,
  per-level growth, proc masks, ICDs, charges, defense types, spell attributes, cooldown
  categories) come from the raw Forever client files, build 1.60.1.70009, read through the
  wago.tools API and parsed by `scripts/scrape/client.mjs`. Values tagged `[F] [client]` were
  confirmed by the [claims check][client], which covered every value this doc had marked for a
  browser check, with one correction: Judgement of Command can't miss
  ([Seal of Command](#seal-of-command-soc)). Raw files lack server hotfixes and server
  scripts, so dummy values such as Judgement of Fury's scripted 1607 + 42.3/level and all PPM
  rates are server-side ([hotfix caveat](../data/client.md#hotfix-caveat)).
- **Rank at level 60.** Every table uses the max rank a level-60 paladin has. Where
  `SpellLevels.BaseLevel` < 60, add `EffectRealPointsPerLevel × (min(60, MaxLevel) −
  BaseLevel)` to the base, truncated toward zero to a whole number, the datasets' rendering by the
  same rule; how the client itself rounds it is [?]
  ([per-level values](../data/items.md#per-level-values),
  [open-questions B74](../open-questions.md#b74-per-level-tooltip-values)): JoR r8 +8 (8.2), JoF r7 +7 (7.38),
  SoR r8 dummy +94, SotC r6 AP +19 (19.2).
  foreverchanges tooltips show the unscaled base ("Numbers are base values, before talents,
  gear and level scaling",
  [spellbook](https://foreverchanges.pro/spellbook/paladin)) [F]. Ranges come from
  `EffectBasePointsF × (1 ± Variance/2)` [F].
- **Spell power coefficients** are the client's `EffectBonusCoefficient`. The Classic Era
  server uses the stored coefficient except for Holy Light, Flash of Light and Power Word:
  Shield ([foreverchanges downrank calculator](https://foreverchanges.pro/downrank-calculator)) [C].
  Forever keeps the same field, and nothing yet shows a server-side override [F]/[?].
  "SP" below means **Holy spell damage** (all-schools spell damage plus Holy-only).
- **Damage class** is `SpellCategories.DefenseType`: 1 magic (spell hit and crit, ×1.5),
  2 melee (melee special table, ×2), 3 ranged. **No Active Defense** (SpellMisc Attr0
  `0x200000`) removes dodge, parry and block. **Always Hit** (Attr3 `0x40000`) removes the
  miss roll. Table percentages are in [combat-tables.md](../mechanics/combat-tables.md).
- **One roll or two.** A melee-class spell whose client effect is weapon damage (SoC's proc,
  effect 31; Holy Strike, 121 and 31) rolls the special table once. One without weapon damage
  (the damage judgements, SoR's and SoF's procs: effect 2) rolls twice: miss, dodge, parry and
  block first, then crit on anything that landed, like the warrior's Bloodthirst. That's
  [combat-tables §3](../mechanics/combat-tables.md#3-special-yellow-attacks)'s "melee spells"
  split by effect type, applied to the paladin by inference [?]. It matters only for spells that
  can miss or be avoided and have no weapon share, JoR and JoF: their crits come from the landed
  ones (with 5% miss and 25% crit, 23.75% of casts rather than 25%). JoC and SoR's and SoF's
  procs have nothing to roll first (Always Hit and No Active Defense), so the two models agree.
- **Which spells trigger procs.** A spell you cast (Holy Strike, Exorcism, Hammer of Wrath)
  triggers procs as any attack or spell does. A spell that another spell or an aura
  triggers (a seal's proc, a judgement's damage spell, Consecration's ticks) triggers them only if
  it carries **NOT_A_PROC** (SpellMisc Attr3 `0x200`). Seal of Command's proc 20424 and the
  judgements' damage spells 20966, 20286 and 20414 carry it. Seal of Righteousness's proc 25713
  and Seal of Fury's 20418 (Attr3 `0x40000`, Always Hit only) and Consecration's ticks 1280345–1280349
  don't [F] [client] (SpellMisc, 1.60.1.70009). "Procs" means every kind: Windfury, Crusader, Hand
  of Justice, Vengeance, Vindication and crit charges, with one exception: an aura with Attr3
  `0x4000000`, Can Proc From Procs, is procced by those spells too. Vengeance's (20049) has it, so
  SoR's and SoF's proc crits give its stacks; a periodic aura's ticks (Consecration's) don't, by its
  proc mask ([Retribution tree](#retribution-tree)). The attribute's reading is data; that
  Forever's server applies it this way is untested [?] ([open question 22](#open-questions)).
  **Item spells stay out [?]:** an enchant's or item's damage proc (Fiery Weapon's 40 Fire) and an
  item's own spell (EZ-Thro Dark Bomb) give no Vengeance, crit or not. They're the item's spells,
  not your class's, so the sim keeps them outside your class's procs, as it keeps an item's spell
  out of every class's spell procs
  ([buffs §3.7](../mechanics/buffs-debuffs-consumables.md#37-engineering-and-explosives)); whether Can Proc From Procs lets their
  crits give stacks on Forever's server is a guild-test candidate (open question 22). Ranged shots
  are the hunter's and never reach a paladin. `paladin.test.ts` holds both item paths.
- **Holy damage ignores armor.** Mobs and raid bosses have no Holy resistance. Whether
  level-based partial resists apply to melee-class Holy spells is an
  [open question](#open-questions).
- **Multipliers.** Different auras multiply (e.g. Vengeance ×
  Two-Handed Weapon Specialization). Vengeance's Holy share multiplies every Holy hit, a Holy
  item proc's too. Percent spell modifiers (`ADD_PCT_MODIFIER`: Improved
  Seals, Sacred Arbiter, Benediction, Holy Conduit) are a separate factor. When two of them
  hit the same spell (Benediction + Holy Conduit on Consecration's cost), **add** them
  (Classic engine convention) [?].
- **Base mana** at level 60 is **1512** [F] [client] (`PlayerExpectedStat.BaseMana` and the
  `basemp.txt` game table, 1.60.1.70009), owned by
  [character-stats](../mechanics/character-stats.md#other-base-values-at-level-60); the client
  check replaces the browser check of
  [OQ-13](../mechanics/character-stats.md#oq-13-confirm-wagotools-values-in-a-browser).
  Corroboration only: the community sim ElliotWood/Forever transcribes the same value from the
  `OctBaseMPByClass` table
  ([`octbasempbyclass.txt`](https://github.com/ElliotWood/Forever/blob/master/assets/db_inputs/basestats/octbasempbyclass.txt)),
  and its level-20 value, 412, matches foreverchanges' level-20 Human paladin sheet (702 mana at
  38 Int) ([BiS](https://foreverchanges.pro/bis/paladin)). Percent-of-base costs round down:
  6% → 90. Stat-to-mana, regen and crit conversions are in
  [character-stats.md](../mechanics/character-stats.md).

---

## Seals

All seals last 30 s, cost a 1.5 s GCD, and are exclusive: only one seal is active per
paladin [F]/[C]. The damage seals (SoC, SoR, SoF) fire on `ProcTypeMask 0x4`, the paladin's
**melee auto attacks**: white swings and extra attacks such as Windfury, Reckoning and Hand
of Justice. They don't fire on Holy Strike or other specials [F] [client] (SpellAuraOptions,
1.60.1.70009; 20920, 20293, 20423). The utility seals (SoW, SoL, SoJ) use `0x14`, so melee
specials can trigger them too [F] [client] (SpellAuraOptions, 1.60.1.70009). Recasting a seal while it's active refreshes it.
Replacing SoC, SoR, SoF or SoJ with a *different* seal grants a Twist of Light echo if you
have the talent ([Twist of Light](#retribution-tree)).

### Seal of Command (SoC)

| Field | Value | Tag, source |
| --- | --- | --- |
| Spell (r5) | 20920, Ret talent (tier 3 in both clients), ranks 2–5 trained at 30/40/50/60 | [F] [F 20920][f20920] |
| Cost | 210 mana (189 with Benediction 5/5; 147 with Twist of Light too) | [F] |
| Proc spell | 20424, used by every rank: `WEAPON_PERCENT_DAMAGE` **70%**, Holy, melee class | [F] [client] (SpellEffect, 1.60.1.70009; [20424][f20424]), same in [C 20424][c20424] |
| Proc rate | **7 PPM from base weapon speed**: `chance = 7 × speed / 60` per landed white hit (3.50 speed → 40.8%). Haste adds swings, not chance | [C] ([Warcraft Tavern Classic](https://www.warcrafttavern.com/wow-classic/guides/pve-retribution-paladin-rotations-cooldowns/), [ClassicSim `SealOfCommandProc.cpp`](https://github.com/timhul/ClassicSim/blob/master/Class/Paladin/Procs/SealOfCommandProc.cpp)). No `SpellAuraOptions` row in either client references a `SpellProcsPerMinute` row, so the rate is server-side ([client] (SpellAuraOptions, 1.60.1.70009 and 1.15.9.69722)). One [Blue-forum thread](https://us.forums.blizzard.com/en/wow/t/seal-of-command-proc-rate/407383) claims 6.8 [?] |
| Internal cooldown | **1.0 s** (`ProcCategoryRecovery 1000`). Windfury's extra swing right after a SoC proc can't proc again | [F] [client] (SpellAuraOptions, 1.60.1.70009; 20920), same in Classic |
| Damage | `0.70 × (MH weapon damage roll + AP × speed / 14 + 0.29 × SP)` (effective **0.203 × SP**) | Coefficient 0.29: [F] [client] (SpellEffect, 1.60.1.70009; [20424][f20424]), as in Classic ([C 20424][c20424]). Applying it *inside* the 70% is [?], see [open questions](#open-questions) |
| Hit table | Melee class **without** No Active Defense or Always Hit: rolls miss, dodge, parry, block and crit (×2) on the special-attack table. No glancing | [F] SpellMisc/SpellCategories on 20424 [?]: the attribute reading of dodge and parry needs a beta log |
| Modifiers | Improved Seals ×1.15 (spell mask includes 20424). Vengeance and JotC apply. **Two-Handed Weapon Specialization does not** (Physical only) | [F] [client] (SpellEffect, 1.60.1.70009; [20224][f20224], [20111][f20111]) |
| Triggers | The proc counts as a melee special hit: it can crit, and it triggers on-hit and crit procs (Windfury, Crusader, Hand of Justice, Vengeance, Vindication) [?] | 20424 carries NOT_A_PROC (Attr3 `0x200`) [F] [client] (SpellMisc, 1.60.1.70009); the server's use of it [?] ([conventions](#conventions-used-below)) |

**Judgement of Command** (JoC, r5): dummy 20968 → damage spell 20966. Base **339–373 Holy,
halved unless the target is stunned or incapacitated** (tooltip "169.5 to 186.5 … 339 to 373
if stunned"), plus **0.429 × SP**, ×1.15 Improved Seals. Assume the coefficient is **not**
halved [?]. Both spells are melee class with No Active Defense, and the damage spell 20966
also carries **Always Hit** (Attr3 `0x40000`), so JoC **can't miss, be dodged, parried or
blocked, and crits ×2** [F] [client] (SpellMisc, SpellCategories, SpellEffect, 1.60.1.70009;
[20968][f20968], [20966][f20966]). Unlike JoR and JoF, it has no miss chance in the sim. The
dummy 20968 lacks Always Hit; whether the server rolls a miss on it anyway is untested, and the
sim assumes it doesn't [?] ([open question 23](#open-questions)). In Classic JoC was magic
class, rolling spell hit ([C 20968][c20968]) [C]. Raid bosses are stun-immune, so the sim
always uses the halved value.

### Seal of Righteousness (SoR)

| Field | Value | Tag, source |
| --- | --- | --- |
| Spell (r8) | 20293, trained at 58; proc 25713 | [F] [F 20293][f20293], [F 25713][f25713] |
| Cost | 200 mana | [F] |
| Seal value `v` | dummy points 1786 + 47/level from 58 to 60 → **v = 18.80** per second of weapon speed at 60 | [F] data (same as [C]) |
| Damage per landed white hit | **35 +** **2H: `1.20 × v × speed`; 1H: `0.85 × v × speed`**, + **0.1 × SP**. So 35 + 18.8 × 1.2 × 3.5 = 114.0 before SP. The flat 35 is Forever's: proc 25713 carries base 35 on effect 0, where Classic Era's had 0 (and rank 1's proc 25742 went from 0 to 4), the same 35 as Seal of Fury's 20418 [F] [client] (SpellEffect, 1.60.1.70009 and 1.15.9.69722; [25713][f25713], [C 25713][c25713]). Adding it to the seal value, rather than in its place, is [?]: the same reading as Seal of Fury's ([D29](../decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24), [open question 10](#open-questions), guild test T1). Tooltip: "Slower weapons cause more Holy damage per swing", which normalizes to roughly constant DPS | Shape [C]/[?]: the server-side script isn't in the client. The tooltip's level-58 range 20.5–71.4 is `v × 1.1475 … v × 4.0` (0.85 × 1.35 to 1.2 × 3.33), consistent with those factors. The extra `+0.03 × avg weapon damage ± 1` in wiki formulas is from TBC-era text and **not adopted** [?] |
| SP coefficient | 0.1 per proc on the proc spell (Classic r8 also 0.1). Forever gives ranks 1–3 the full 0.1 too | [F] [client] (SpellEffect, 1.60.1.70009; [25713][f25713]), [C 25713][c25713] |
| Hit table | Melee class, **No Active Defense + Always Hit**: rides on the white hit that triggered it, can't miss, dodge, parry or block. **Can crit** (melee crit ×2; no "can't crit" attribute) [?] | [F] [client] (SpellMisc Attr0 0x240000, Attr3 0x40000; SpellCategories, 1.60.1.70009; 25713) |
| Modifiers | Improved Seals ×1.15, Vengeance, JotC | [F] |
| Triggers | **Nothing**: the proc triggers no Windfury, Crusader, Hand of Justice, Vengeance or Vindication, even when it crits. The white hit that carries it still does [?] | 25713's Attr3 is `0x40000` (Always Hit) only, without NOT_A_PROC `0x200` [F] [client] (SpellMisc, 1.60.1.70009); the server's use of it [?] ([conventions](#conventions-used-below), [open question 22](#open-questions)) |

**Judgement of Righteousness** (r8, 20286): **162–178 + 8 = 170–186 at level 60**,
plus **0.5 × SP**, ×1.15 Improved Seals. Melee class, No Active Defense, no Always Hit: melee
miss, crit ×2, no dodge, parry or block [F] [client] (SpellEffect, SpellMisc, SpellCategories,
1.60.1.70009; [20286][f20286]). It has no weapon damage, so it rolls the miss first and crit on a
landed JoR second [?] ([one roll or two](#conventions-used-below)). A beta combat log shows a JoR crit at
exactly ×2 (69 on a 34 base) and plain misses only. That's a single Forever log (n=1)
reported by community sim authors
([ElliotWood `sor.go`](https://github.com/ElliotWood/Forever/blob/master/sim/paladin/sor.go)) [?].
It corroborates the client data above but isn't a guild measurement.

### Seal of the Crusader (SotC) and Judgement of the Crusader (JotC)

- **SotC r6** (20308, 160 mana): +306 melee AP and +40% attack speed, with "less damage with
  each attack" [C]/[F] ([F 20308][f20308]). The client grows the AP by 2.4 per level over
  levels 52–60 [F] [client] (SpellEffect, SpellLevels, 1.60.1.70009), so it is **325 at 60**
  if the server applies that term [?]. Only
  used to judge. While it's active the sim applies +40% attack speed and divides weapon
  damage per swing by 1.4 [?]: an aura of −28.57% Physical damage, so it covers every Physical
  hit while it's up. Swapping *away* from SotC gives no Twist of Light echo (it
  isn't one of the listed seals) [F].
- **JotC r6** (20303): target takes **+161 Holy damage** (flat, `MOD_DAMAGE_TAKEN` Holy) for
  **40 s**. It **can't miss** (Always Hit) [F] [client] (SpellMisc, SpellDuration,
  1.60.1.70009; [20303][f20303]). Your own melee strikes refresh it, and so does Holy Strike
  with Sacred Arbiter [F] (tooltip). Only one judgement debuff per
  paladin per target [F]/[C]. Direct damage judgements (JoC, JoR, JoF) are **not** debuffs
  and don't replace it [C] (Classic practice: apply JotC, then SoC and judge SoC,
  [Warcraft Tavern Classic](https://www.warcrafttavern.com/wow-classic/guides/pve-retribution-paladin-rotations-cooldowns/)).
- **How much of the +161 each hit gets** is a server rule [?]. Default: add
  `161 × c`, where `c` is that hit's effective SP coefficient (SoC proc 0.203, JoC 0.429,
  JoR 0.5, SoR proc 0.1, Holy Strike 0.429, Exorcism/HoW 0.429, Consecration 0.095 per tick).
  JotC benefits **every** paladin's and every player's Holy damage, not only yours. The main
  alternative, a flat +161 on each melee-class Holy hit, would roughly double JotC's value.
  Expose it as an engine switch until measured ([open questions](#open-questions)): the spell
  builder takes the rule (`coefficient`, the default, or `flat`), set as `rules.jotcBonus` under
  **Character → Advanced**, beside the other untested switch, "Count untested ratings" ("A share"
  or "All of it"). It's not a rotation choice, so the Rotation tab doesn't show it.
- **A Protection paladin judges it too** (user, 2026-09-24): it opens with Seal of the Crusader
  before the pull, judges it at the pull to place JotC, then puts Seal of Fury up and judges Fury for
  every judgement after; its landed auto attacks keep JotC up all fight
  ([the opener](#forever-priority-list-default-1)). In the T2 default setup that's **+84.7 TPS
  (+11.7%) and +41.6 DPS** against no JotC (40,000 paired fights, seed 777), for one Judgement of Fury
  and 90 mana at the pull. The Character → Advanced rule applies to Protection's Holy hits as to
  Retribution's (it didn't before T2). The Buffs tab's `judgementOfTheCrusader` is then yours, counted
  once; with your own off it's another paladin's, on the boss from the pull
  ([buffs §6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset)).
- **Where the bonus goes** [?]: as a flat bonus on the *target*, it's added after your own damage
  multipliers (Improved Seals, Vengeance), which don't raise it, and before the crit
  multiplier, which does. That follows the Classic engine's order for flat damage taken; it's
  untested in Forever ([open question 5](#open-questions)).

### Seal of Fury (SoF), new: the Protection seal

| Field | Value | Tag, source |
| --- | --- | --- |
| Spell (r7) | 20423, trained at 58; ranks from level 10 | [F] [F 20423][f20423] |
| Cost | 200 mana | [F] |
| Per landed white hit | **+35 Holy** (proc 20418), **plus the seal value** by Seal of Righteousness's rule (below): `0.85 × 16.91 × speed` with a one-hander, `1.2 × 16.91 × speed` with a two-hander, and **0.1 × SP**. The default 1.5 s axe: 35 + 21.56 | 35 and 0.1: [F] [client] (SpellEffect, 1.60.1.70009; [20418][f20418]); the seal value's use [?] ([open question 10](#open-questions), guild test T1) |
| Absorb | With a shield equipped, each hit grants an absorb of **50% of the Holy damage dealt** | [F] (effect 1 = 50). Stacking or refresh rules [?]: the sim keeps **one** absorb, which each proc replaces and the next hit that costs you health uses up, lasting at most the seal's 30 s. A boss's hit is thousands, so it always takes all of it, which is what [Improved Seal of Fury](#protection-tree)'s mana needs. The absorb itself isn't taken off that hit (about 20 damage, under 1% of damage taken) ([open question 10](#open-questions)) |
| Hit table | Proc 20418: melee class, No Active Defense + Always Hit, like SoR | [F] [client] (SpellMisc, SpellCategories, 1.60.1.70009) |
| Triggers | **Nothing**, like SoR's proc: no Windfury, Crusader, Hand of Justice, Vengeance or Vindication from it [?] | 20418's Attr3 is `0x40000` only, without NOT_A_PROC [F] [client] (SpellMisc, 1.60.1.70009); the server's use of it [?] ([open question 22](#open-questions)) |
| Judgement of Fury (r7) | 20414: **146.3–159.7 + 7 = 153.3–166.7 at 60**, **0.45 × SP**, Holy, melee class, No Active Defense, no Always Hit (can miss; then crit on a landed one, two rolls [?]). **Taunts for 4 s** | [F] [client] (SpellEffect, SpellMisc, 1.60.1.70009; [20414][f20414]); taunt: tooltip |
| Improved Seals | applies to the proc and the judgement | [F] [client] (SpellEffect spell mask includes 20418 and 20414, 1.60.1.70009) |

**The seal value** [?]. The SoF aura carries the same weapon-speed "seal value" dummy as SoR,
1607 + 42/level from 58, so **16.91** per second of weapon speed at 60 [F] [client] (SpellEffect,
1.60.1.70009; [20423][f20423]). SoR's is its whole damage in Classic Era (1786 + 47/level, 18.80, by the one- and
two-hander factors 0.85 and 1.2, [Seal of Righteousness](#seal-of-righteousness-sor)), and Forever
gives SoR's proc 25713 the same base 35 as SoF's 20418, where Classic Era's had 0. The two procs carry
identical client data, so the sim reads them the same way: the 35 plus the seal value, for both
([Seal of Righteousness](#seal-of-righteousness-sor)). For Seal of Fury that's the seal value on top
of the tooltip's flat 35: `35 + 0.85 × 16.91 × speed` a landed swing with a one-hander (with the default
1.5 s Flurry Axe, 56.56), `35 + 1.2 × 16.91 × speed` with a two-hander [?]. That's
[D29](../decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24):
the aura carries the value, so it gets a default from its closest analog, and of the two readings
(the value on top of the 35, or in its place as Classic Era's SoR formula has it) the one that fits the guild's
benchmark. The tooltip's flat 35 is the other reading, and the one guild test T1 would confirm
([open question 10](#open-questions)). It's +27.2 TPS in the default setup (T2's measurement).
Per second it hardly depends on the weapon's speed: a slower weapon hits for more, less often.

Judgement of Fury has a scripted dummy too, 1607 + 42.3/level at a 0.18 coefficient [F] [client]
(SpellEffect, 1.60.1.70009; [20414][f20414]). It's the analog of Judgement of Righteousness's, whose
Classic Era client has the identical structure (a dummy of the seal value beside its damage effect),
and whose Classic Era damage is only its own 170–186 + 0.5 × SP [C]: an allowed source that gives the
dummy no effect, so the sim gives Judgement of Fury's none either (D29's one exception). As flat threat
it would add about 454 TPS, which no tank measurement supports. Guild test T5 checks it.

### Utility seals (not in default rotations)

| Seal (max rank) | Cost | On hit | Judgement | Tag |
| --- | --- | --- | --- | --- |
| Seal of Wisdom r3 (20357) | 200 | chance to restore 90 mana (proc rate server-side) [?] | **JoW 40 s**: attacks and spells on the target have a chance (Classic 50% [?]) to restore 59 mana to the attacker | [F] [F 20357][f20357], [F 20355][f20355] |
| Seal of Light r4 (20349) | 210 | chance to heal 94 | **JoL 40 s**: melee attacks on the target have a chance to heal the attacker 61 | [F] [F 20349][f20349] |
| Seal of Justice (20164) | 13% base (196) | chance to stun 2 s | JoJ 10 s, prevents fleeing | [F] [F 20164][f20164] |

These judgements are debuffs: taking one replaces your JotC.

---

## Judgement

| Field | Value | Tag, source |
| --- | --- | --- |
| Spell | 20271 | [F] [F 20271][f20271] |
| Cost | 6% of base mana = **90** (81 with Benediction 5/5); free after Swift Judgement | [F] (`PowerCostPct 6`) |
| Cooldown | 10 s; Improved Judgement −1/−2 s → **8 s**; T1 Ret 5-piece −0.5 s ([F 1301702][f1301702]) | [F] |
| GCD | **none** (`StartRecoveryTime 0`) | [F]/[C] [f-SpellCooldowns] |
| Range | 10 yd | [F] |
| Requirement | an active seal. **The seal stays up** (Forever) | [F] |
| Outcome | the active seal's judgement spell: see each seal. Every Forever judgement is melee class + No Active Defense. JoR and JoF can miss (melee special miss chance); **JoC can't** (its damage spell 20966 is Always Hit). Damage judgements crit ×2. Debuff judgements always hit. The damage spells (20966, 20286, 20414) carry NOT_A_PROC, so a damage judgement triggers on-hit and crit procs [?] ([conventions](#conventions-used-below)) | [F] [client] (SpellMisc, SpellCategories, 1.60.1.70009); JoC in game [?] ([open question 23](#open-questions)) |
| Sanctified Judgement | 3/3: **100% chance to return 60% of the judged seal's mana cost** (SoC → 126). Base vs modified cost [?]: use the base cost | [F] [F 1311074][f1311074] |

---

## Other abilities

| Ability (max rank) | Numbers at 60 | Cost / CD / GCD | Class, hit table | Tag, source |
| --- | --- | --- | --- | --- |
| **Holy Strike** r8 (10333), new, trained at 6 | Effects: `NORMALIZED_WEAPON_DMG` +93 (81–105) and `WEAPON_PERCENT_DAMAGE` **50%** (40% before 1.60.1.70009), read as the tooltip prints them, "50% weapon damage plus an additional 81 to 105" ⇒ **0.50 × normalized MH damage + 81..105**, plus **0.429 × SP**. **All Holy**, so no armor. Its third effect, 77 (a script), is Sacred Arbiter's "refresh all Judgement effects": the same effect is on Judgement 20271, and Sacred Arbiter's own aura (1311087) holds only its +20% damage. No threat wording, so no threat of its own (D29) | 20 mana; **10 s** (category 2404, shared with HotR; 12 s before 1.60.1.70009, which removed Improved Holy Strike and made its −2 s baseline); GCD 1.5 s | Melee special: miss, dodge, parry, block, crit ×2. Doesn't proc damage seals [F]; doesn't reset the swing timer (instant special) [C] | [F] [client] (SpellEffect, SpellCategories, SpellMisc school 2, 1.60.1.70009; [10333][f10333]). The flat part outside the 50% is the tooltip's reading [?] (rank 8 prints "81 to 105", rank 1 "25% … plus 11 to 14", both the raw base points; the BlizzCon build printed "36 to 46", i.e. 40% of them, the other reading); how the 0.429 applies is [?] too ([open question 6](#open-questions), guild test T2) |
| **Consecration** r5 (20924), baseline from 20 | Per 1 s tick for 8 s (spell 1280349): **12 Holy to every enemy** (no coefficient) **+ 27 Holy + 0.095 × SP to the first 4 enemies**. Single target: **312 + 0.76 × SP** per cast | 565 mana; 8 s; GCD 1.5 s | Magic class; each tick is a separate direct-damage spell (spell hit roll per tick [?]; crit [?]). The ticks lack NOT_A_PROC, so they trigger no procs [?] ([conventions](#conventions-used-below)) | [F] [F 20924][f20924]; tick split and 0.095: [client] (SpellEffect, 1.60.1.70009; [1280349][f1280349]). Classic: 48/tick, 0.042 ([C 20924][c20924]) |
| Consecration ranks 1–4 | per tick all + first-4: r1 2 + 4, r2 3 + 7, r3 6 + 11, r4 8 + 20; **every rank has the full 0.095** | 135 / 235 / 320 / 435 mana | as above | [F] tick spells 1280345–1280348, [F 26573][f26573]. Downranking is mana-efficient: r1 is `48 + 0.76 × SP` for 135 mana |
| **Exorcism** r6 (10314) | **475–529 + 0.429 × SP** Holy; **Undead or Demon only** | 345 mana; 15 s; GCD 1.5 s | Magic: spell hit, crit ×1.5 | [F] [F 10314][f10314] |
| **Hammer of Wrath** r3 (24239) | **474–522 + 0.429 × SP** Holy; target **≤ 20% health** | 425 mana; 6 s; 1.0 s cast (Instrument of Law −0.5/−1.0 s → instant); **GCD 1.0 s**. The cast stops your auto attacks, which start again from a full swing when it ends, as [damage-and-timing §3.3](../mechanics/damage-and-timing.md#33-swing-reset-rules) has every cast do, and holds everything else until it ends, the off-GCD Judgement too: in game you can't cast one spell during another [?]. It pays its mana and starts its cooldown when the cast ends. The default Retribution build's Instrument of Law 2/2 makes it instant; the default Protection build casts it in 1 s (row 8), where the cast costs 1.8% of TPS against letting swings and Judgement go on | **Ranged** class (DefenseType 3): ranged hit/crit table, see combat-tables | [F] [F 24239][f24239]; the cast's effect on swings and Judgement [?] ([open question 22](#open-questions)) |
| **Hammer of the Righteous** (407632), trained at 40 | **3 × MH weapon DPS** as Holy to the target and up to 3 more (the tooltip's "up to 3 additional"; the client's chain-target fields are 4 on effect 0, 3 on effect 1 and 4 on effect 2 [F] [client] (SpellEffect, 1.60.1.70009), so 4 targets in all with the first); no SP coefficient in data | 6% base mana (90); **6 s**, category 2404: **shares its cooldown with Holy Strike** (casting it holds Holy Strike 6 s; Holy Strike holds it for its own 10 s); GCD 1.5 s; needs a 1H axe, mace or sword (subclass mask 145) | Melee class, neither No Active Defense nor Always Hit: the full special table, crit ×2; no weapon share, so it rolls to hit and then to crit, as the judgements do [?] ([one roll or two](#conventions-used-below)). A cast spell: it triggers procs, not the seals' | [F] [F 407632][f407632]; category 2404 with 6 s, cost 6%, subclass mask 145: [client] (SpellCategories, SpellCooldowns, SpellPower, SpellEquippedItems, 1.60.1.70009). It's SoD's spell id, but Forever changed its level, cooldown category and target count, so it's a deliberate Forever spell. The damage is effect 0 (a script) at effect 2's 3 × weapon DPS; effect 1 (120, 3 chain targets) is read as the extra targets' part, left out on one target ([M6](../milestones.md#m6-multi-target-)). **Whether "weapon DPS" counts attack power** is [?] ([open question 11](#open-questions), guild test T3): the sim counts it by default, the weapon DPS a character sheet shows, since that reading fits the guild's benchmark ([D29](../decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24)); **Character → Advanced** switches to the weapon's own (`rules.hotrWeaponDps`). Worked example 24 |
| **Holy Shield** r3 (20928), tier-7 (31-point) Prot talent | **+20% block** for 10 s, **4 charges**; each block deals **221 + 0.08 × SP** Holy; the damage has **+20% threat** | 240 mana; 10 s (category); GCD 1.5 s | Block damage is the buff's own effect (aura 43, `PROC_TRIGGER_DAMAGE`), with no damage spell of its own. The client marks spell 20928 **magic** (DefenseType 1), which would give the damage the spell table: a miss roll (14% for the default build against a level-63 boss) and spell crit. The sim overrides it and has the damage always land and never crit [?]: 20928's table is the one its cast rolls, on yourself, and nothing in the client says the damage its aura deals rolls one again. Untested ([open question 16](#open-questions)). Needs a shield | [F] [client] (SpellEffect, SpellAuraOptions, SpellCategories, 1.60.1.70009; [20928][f20928]) |
| **Righteous Fury** (25780) | **+60% threat from Holy damage** (+90% until 1.60.1.70009); Improved RF adds −2/4/6% damage taken | 30% base mana (453); 30 min | — | [F] [client] (SpellEffect, TraitDefinitionEffectPoints, 1.60.1.70009; [25780][f25780]) |
| **Holy Wrath** r2 (10318) | 490–576 Holy, AoE 20 yd, Undead/Demon only, now also stuns 2 s | 805 mana; 60 s; 2 s cast | Magic | [F]. Off by default |
| Templar's Bulwark (1311015), new Prot talent | absorb = 100% max health for 8 s; Forbearance | 110 mana; 5 min (−60 s Sacred Duty); off GCD | — | [F] [F 1311015][f1311015]. No TPS effect; not modelled by default |
| Swift Judgement (1310994), new Prot talent | finishes Judgement's cooldown; next Judgement free | 1 min; off GCD | — | [F] [F 1310994][f1310994] |
| Retribution Aura r5 (10301) | **30 Holy + 0.08 × SP** to each attacker that hits a party member. Since 1.60.1.70009 it "will now dynamically update its values based on the caster's spell power" (the dev notes) [F]; the client carries no coefficient (0 on its aura), so the server holds it, and the sim takes Holy Shield's 0.08, the client's closest analog: a damage shield that deals its damage on each attack it meets [?] ([buffs §1.2](../mechanics/buffs-debuffs-consumables.md#12-threat-defense-and-mana), D29). Its share of JotC's bonus is its coefficient's | — | damage shield: the sim has it land on each of the boss's swings that lands on you, a blocked one too, and never crit [?] | [F] [F 10301][f10301]; 30 and the missing coefficient: [client] (SpellEffect, 1.60.1.70009) |
| Devotion Aura r7 (10293) | +735 armor (party) | — | — | [F] [F 10293][f10293]. A Protection paladin's own is its duty (D26): the rotation puts it up before the pull ([Priority](#priority-defensive-balanced-or-max-tps)) |

### Blessings (for the buffs doc)

The trainer's ranks ([D36](../decisions.md#d36-what-we-take-from-warriorsim-2026-09-25): no
Ahn'Qiraj libram's rank): Might r6 **112 AP** (Greater Might r1 112) [F] ([F 19838][f19838],
[F 25782][f25782]); the librams' r7 and Greater r2 are 133 ([F 25291][f25291], [F 25916][f25916]),
and Greater r2 is taken to come with the libram [?] ([buffs OQ 22](../mechanics/buffs-debuffs-consumables.md#open-questions)).
Kings +10% all stats (baseline) [F] ([F 20217][f20217]). Wisdom r5 **36 mp5** (Greater r1 the same;
the libram's r6 40) [F] ([F 19854][f19854], [F 25290][f25290]). Salvation
−30% threat [F] [client] (SpellEffect, 1.60.1.70009; [1038][f1038]). Light unchanged. All last 1 h, Greater Blessings too.
Blessing of Sanctuary doesn't exist [F]. Presets and stacking rules belong in
[buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md).

---

## Talents

Tooltips are quoted at **max rank** from the Forever client
([talents](https://foreverchanges.pro/talents/paladin); calculator order is tier, then
column). Every value is [F] unless marked. "Model" is the engine contract. Talents with no
DPS, TPS or mana effect are listed but not modelled.

### Retribution tree

| Talent (max) | Forever tooltip (max rank) | Classic Era | Model |
| --- | --- | --- | --- |
| Deflection (5) | "Increases your Parry chance by 5%." | same | +5% parry (tank table) |
| Benediction (5) | "Reduces the Mana cost of all instant cast spells and abilities by 10%." ([F 20101][f20101]) | seals and judgements only, −15% ([C 20101][c20101]) | ×0.9 cost on instant spells: seals, Judgement, Holy Strike, Consecration, Exorcism, Holy Shield, HotR, instant HoW, Blessings |
| Improved Judgement (2) | "Decreases the cooldown of your Judgement ability by 2 sec." | same | Judgement CD 8 s |
| Holy Conduit (2), new | "Reduces the mana cost of your Consecration, Holy Wrath, Exorcism, and Hammer of Wrath spells by 40%." ([F 1237268][f1237268]) | — | −40% cost; stacks additively with Benediction [?] |
| Conviction (5) | "Improves your chance to get a critical strike with melee attacks by 5%." ([F 20117][f20117]) | same numbers | +5% melee crit. Melee-class spells use melee crit, so in Forever it also covers judgements, SoC procs, Holy Strike and HotR |
| Vindication (3) | "Gives your damaging melee attacks a chance to reduce the target's Attack Power by -6, and increase your Attack Power by 3% for 30 sec." ([F 9452][f9452], buff [F 440668][f440668]) | −15% Str/Agi debuff on target | **+1/2/3% AP** (`MOD_ATTACK_POWER_PCT`). Proc chance in data is 100% on melee damage, so treat it as permanent after the first landed hit [?] |
| Sanctified Judgement (3), new | "Gives your Judgement ability a 100% chance to return 60% of the Mana cost of the judged seal." ([F 1311074][f1311074]) | — | on each landed [?] Judgement (JoC always lands): +20/40/60% of the seal's base cost at 33/66/100% chance |
| Seal of Command (1) | see [SoC](#seal-of-command-soc) | same | — |
| Pursuit of Justice (2) | +15% movement speed | +8% | not modelled |
| Eye for an Eye (2) | "All critical strikes against you cause 10% of the damage taken to the attacker as well." (capped at 50% of your health) | spell crits only, 30% | Prot option only: reflect 10% of crit damage taken as Holy damage (threat source) [?] |
| Sacred Arbiter (1), new | "Increases the damage of your Holy Strike ability by 20% and causes it to refresh all Judgement effects on the target." ([F 1311087][f1311087]) | — | Holy Strike ×1.20 (×1.10 until 1.60.1.70009; aura 108 = 20, [client] (SpellEffect, 1.60.1.70009)); refreshes your judgement debuffs |
| Crusade (2), new | "Increases all damage dealt by 2%. Increased by an additional 2% against Demon and Undead targets." ([F 1311083][f1311083]) | — | **Removed from the trees in 1.60.1.70009** ([data/talents.md](../data/talents.md#tree-versions)); was ×1.02 all damage and a further ×1.02 vs Undead/Demon |
| Two-Handed Weapon Specialization (3) | "Increases the damage you deal with two-handed melee weapons by 6%." ([F 20111][f20111]) | 6% | ×1.06 (2/4/6%; 3/6/9% until 1.60.1.70009, [client] (SpellEffect, 1.60.1.70009)) **Physical only** (school mask 1, [client] (SpellEffect, 1.60.1.70009)), with a 2H equipped. Holy Strike, SoC and judgements don't benefit |
| Vengeance (3) | "Increases your Physical and Holy damage dealt by 3% for 30 sec after landing a non-periodic critical strike. Stacks up to 3 times." ([F 20049][f20049], buff [F 20050][f20050]) | 15% flat for 8 s, 5 ranks | Buff: **+1/2/3% per stack, max 3 stacks (9% at 3/3)**, 30 s (5 stacks until 1.60.1.70009) ([client] (SpellAuraOptions, SpellDuration, CurvePoint, 1.60.1.70009)). Each non-periodic crit that triggers procs adds a stack and refreshes the duration: white, special, SoC proc, judgement, spell. The talent's proc mask (69972) has no periodic bit since 1.60.1.70009 (1.60.1.69913's 332116 had 0x40000), so a periodic tick gives none. Its aura carries Attr3 `0x4000000`, **Can Proc From Procs**, which lets triggered spells *without* NOT_A_PROC proc it: so **SoR's and SoF's proc crits give stacks too**, as SoC's do, though they trigger no other procs [?]. Consecration's ticks also lack NOT_A_PROC, but they're a periodic aura's, which the proc mask leaves out [?] ([conventions](#conventions-used-below), [open question 22](#open-questions)) |
| Repentance (1) | incapacitate | same | not modelled |
| Champion of the Light (3), new | "Increases your spell damage and healing by up to 100% of your Intellect." ([F 1311084][f1311084]) | — | **+Int to spell damage** (all magic schools) and healing, at 33/66/100% |
| Instrument of Law (2), new | "Reduces the cast time of your Hammer of Wrath by 1.0 sec, and reduces all threat you generate by 20% while Righteous Fury is not active." ([F 1311085][f1311085]) | — | HoW instant (still 1.0 s GCD); threat ×0.8 when RF is off (curves −500/−1000 ms and 10/20, [client] (TraitDefinitionEffectPoints, 1.60.1.70009)) |
| Twist of Light (1), new capstone | "Reduces the Mana cost of your Seal spells by 20%, and when you replace your Seal of Command, Seal of Righteousness, Seal of Fury, or Seal of Justice with a different Seal, gain an Echo of that Seal. Your next melee attack applies the replaced Seal's effects, consuming the Echo." ([F 1310735][f1310735]) | — (Classic twisting relied on batching) | **−20% mana on every seal** since 1.60.1.70009 (aura 108, misc 14 = −20, on every seal's class mask [F] [client] (SpellEffect, 1.60.1.70009)), added to Benediction's cut [?] ([open question 19](#open-questions)): Seal of Command 147. On replacing a listed seal, gain `Echo of <old seal>` (1 charge, no duration, [F 1311703][f1311703]). It's consumed by the next landed **auto attack**, which applies the old seal's on-hit effect as well as the new one. **Echo of Command "empowers your next melee attack with a *chance* to activate Seal of Command"**: roll 7 PPM and respect the 1 s ICD. Echoes of Righteousness and Fury always fire |

Removed from Ret: Improved Blessing of Might, Improved Retribution Aura, Sanctity Aura,
Improved Seal of the Crusader [F].

### Protection tree

| Talent (max) | Forever tooltip (max rank) | Classic Era | Model |
| --- | --- | --- | --- |
| Toughness (5) | "+10% armor from items" | same | armor (tank stats) |
| Redoubt (5) | "Damaging melee attacks against you have a 10% chance to increase your chance to block by 30%. Lasts 10 sec or 5 blocks." ([F 20127][f20127], buff [F 20128][f20128]) | triggered by being crit | On each melee hit taken (`ProcTypeMask` taken-melee): 10% chance for +30% block, 10 s or 5 blocks. **Conflict:** the community sim reads the trait curve as 2/4/6/8/10% chance per rank; the client tooltips say 10% at every rank [?]. The sim follows the tooltips: 10% at every rank, +6% block a rank, on each of the boss's swings that lands on you, with a shield. At 5/5 both readings agree |
| Precision (3) | "Improves your chance to hit by 3%." ([F 20189][f20189]) | melee only | **+3% melee and +3% spell hit** (two auras) |
| Guardian's Favor (2) | BoP/BoF cooldowns | same | not modelled |
| Anticipation (5) | "Increases your Defense Skill by 20." | +10 | +20 defense skill |
| Improved Seal of Fury (1), new | "When Seal of Fury's shield is fully absorbed, restore 60 Mana, increased by 15% per level the attacker is above you, up to 45%." ([F 1314103][f1314103]; the rank text in [`src/data/talents/paladin.json`](../../src/data/talents/paladin.json)) | — | foreverchanges printed "0"; the client's rank text reads 60 (0 + 1 a level) [F]. When a hit that costs you health uses up Seal of Fury's absorb: 60 mana, 15% more a level the boss is above you, up to 45% more: **87** against a level-63 boss, 0.5 threat a mana. The absorb's rules are the sim's [?] ([Seal of Fury](#seal-of-fury-sof-new-the-protection-seal), [open question 10](#open-questions)). Without it the default Protection setup makes 16.5% less TPS: it's short of mana ([mana model](#mana-model)) |
| Improved Righteous Fury (3) | "While Righteous Fury is active, all damage taken is reduced by 6%." ([F 20468][f20468]) | +50% RF threat | −6% damage taken (curve −2/−4/−6, [client] (TraitDefinitionEffectPoints, 1.60.1.70009)); **no threat effect** |
| Shield Specialization (3) | "Increases the amount of damage absorbed by your shield by 30%, and gives your blocks a 100% chance to restore 6% of your maximum Mana. May only occur once every 3 sec." ([F 1310925][f1310925]) | block value only | block value ×1.30; on block, +6% max mana (33/66/100%), 3 s ICD |
| Sacred Duty (2), new | "Increases your total Stamina by 4% and reduces the cooldown of your Divine Shield, Divine Protection, and Templar's Bulwark spells by 60 sec." ([F 1224697][f1224697]) | — | Stamina ×1.04 |
| Swift Judgement (1), new | "Finishes the remaining cooldown on your Judgement ability and reduces the Mana cost of your next Judgement by 100%." | — | active, off the GCD, 1 min: the rotation uses it with Judgement cooling down and judges again at once, for free ([rotation](#forever-priority-list-default-1)) |
| One-Handed Weapon Specialization (3) | "Increases the damage you deal with one-handed melee weapons by 10%." ([F 20196][f20196]) | 10% at 5/5 | ×1.10 **Physical only** (school mask 1, [client] (SpellEffect, 1.60.1.70009)) with a 1H |
| Improved Hammer of Justice (3) | −15 s | same | not modelled |
| Templar's Bulwark (1), new | absorb 100% max health, 8 s | — | not modelled by default |
| Reckoning (5) | "Gives you a 40% chance to gain an extra attack after Blocking a melee attack and a 100% chance to gain an extra attack after being the victim of a non-periodic critical strike." ([F 20177][f20177]) | 100% on crit only | Extra main-hand auto attack (can proc seals): 8% a rank after a block, 20% a rank after a crit taken (40% and 100% at 5/5, the rank texts). In combat it swings at once, from the boss's swing that gave it; the stacking cap (Classic stored up to 4 [?]; Forever's [?]) doesn't arise |
| Iron Creed (5), new | "Increases the threat generated by your Holy Strike ability 25%. While Righteous Fury is active, Holy Strike also reduces your damage taken by 10% for 6 sec." ([F 1311034][f1311034]) | — | Holy Strike threat ×1.25 (aura 108, modifier 2, curve 5…25, [client] (SpellEffect, CurvePoint, 1.60.1.70009)). **−2% damage taken a rank** (−10% at 5/5), all schools, for 6 s after Holy Strike, while Righteous Fury is up: the talent's aura 231 on done melee-class spells triggers 1311033 (aura 87, 6 s, caster aura 25780 Righteous Fury), at 2/4/6/8/10 on curve 110345 [F] [client] (SpellEffect, SpellDuration, SpellAuraRestrictions, CurvePoint, 1.60.1.70009). A Protection paladin's Righteous Fury is up all fight, so each landed Holy Strike puts it up; whether a missed or dodged one does is the server's [?]. Tank survival only: in the default setup it's up 43% of the fight (Holy Strike every 10 s, 72% of them landing) and cuts damage taken by 4.3% |
| Holy Shield (1) | see [Other abilities](#other-abilities) | 30% block, 130 dmg | — |

Removed from Prot: Blessing of Sanctuary, Improved Devotion Aura, Improved Concentration
Aura. Blessing of Kings is now baseline [F].

### Holy tree (points Ret and Prot builds take)

| Talent (max) | Forever tooltip (max rank) | Model |
| --- | --- | --- |
| Improved Holy Strike (2), new | "Reduces the cooldown of your Holy Strike ability by 2 sec." | **Removed from the trees in 1.60.1.70009** ([data/talents.md](../data/talents.md#tree-versions)), which made its −2 s baseline: Holy Strike's cooldown is 10 s |
| Divine Strength (5) | "Increases your Strength by 10%." (unchanged) | Str ×1.10 |
| Divine Intellect (5) | "+10% Intellect" (unchanged) | Int ×1.10 |
| Improved Seals (3) | "Increases the damage done by your Seals and Judgements by 15%." ([F 20224][f20224]) | ×1.15 on SoC/SoR/SoF procs and JoC/JoR/JoF (spell masks and curve 5/10/15: [client] (SpellEffect, CurvePoint, 1.60.1.70009)). **Not** JotC's bonus, Holy Strike or Consecration |
| Reverence (3), new | "Allows 30% of your Mana regeneration to continue while casting." | 30% of spirit regen during the five-second rule (Holy builds only) |
| Purifying Power (2), new | "... reduces the cooldown of your Exorcism and Holy Wrath spells by 33%." | Exorcism CD 10 s |
| Holy Power (5) | "Increases the critical strike chance of your Holy Shock and Holy Strike spells by 15%, and all other spells by 5%." (Holy Strike joined in 1.60.1.70009) | +1% crit a rank: the magic spells' as spell crit, the seals' procs and damage judgements' on their own (the first effect's class mask); **+3% a rank on Holy Strike** (the second's). Tier 6, 25 Holy points: neither default build reaches it |
| Divine Precision (3), new | "Improves your chance to hit with Holy spells by 18%." | Holy spell hit |
| Consecrated Ground (2), new | "Gives your Holy spells 10% increased damage against the first 4 enemies that enter your Consecration." | Holy spell damage ×1.10 vs up to 4 targets standing in your Consecration |

Other Holy talents (Healing Light, Spiritual Focus, Unyielding Faith, Voice of Truth, Infusion
of Light, Illumination, Divine Favor, Holy Shock, Light's Vigil) have no melee-spec effect
and aren't modelled.

---

## Mana model

| Item | Value | Tag, source |
| --- | --- | --- |
| Base mana (60) | 1512 | [F] [client] (`PlayerExpectedStat`, `basemp.txt`, 1.60.1.70009); owned by character-stats ([conventions](#conventions-used-below)) |
| Max mana | base + Int→mana, see character-stats | [C] |
| Costs, Ret build (Benediction 5/5, Twist of Light, Holy Conduit 2/2; the cuts added [?]) | SoC 147, SoR 140, SotC 112 (seals −30%), Judgement 81, Holy Strike 18, Consecration r5 282 / r1 67, Exorcism 172, HoW 212 (instant with Instrument of Law, so Benediction applies; −50%). Benediction alone: SoC 189, SoR 180, SotC 144, Consecration 508 / 121, Exorcism 310, HoW 382. With Holy Conduit 1/2 (the default until the paladin review's PR-2), Consecration r5 395 / r1 94, Exorcism 241, HoW 297; multiplied rather than added, Holy Conduit 2/2's Consecration r5 would be 305 [?] | [F] costs × talent |
| Costs, Prot build (no Benediction) | SoF 200, Judgement 90 (0 after Swift Judgement), Holy Strike 20, Holy Shield 240, Consecration r5 565, HotR 90, RF 453 | [F] |
| Sanctified Judgement 3/3 | +126 per SoC judgement, +120 per SoR/SoF judgement | [F] |
| Spirit regen | the class formula with the five-second rule; any mana spent starts a 5 s window with no spirit regen (Reverence lets some continue) | [C] → [character-stats.md](../mechanics/character-stats.md) |
| mp5 | gear mp5 and Blessing of Wisdom (36 mp5) tick through the five-second rule | [F]/[C] |
| The sim's ticks | every 2 s from a random phase in the first 2 s (the one power tick, which the druid's Energy and mana share), each `mp5 × 2/5` plus, 5 s or more after the last mana spent, `15 + Spirit / 5` from the sheet's Spirit, rounded down to a tenth (Reverence: 10% per rank of it inside the rule). The fight starts with full mana, and a seal cast before the pull costs nothing and starts no five-second rule | [?] engine choices (the tick's phase and the pre-pull) |
| Mana from a spell effect | Sanctified Judgement, Shield Specialization, Improved Seal of Fury: 0.5 threat per mana gained ([threat.md](../mechanics/threat.md#threat-from-healing-power-gains-and-buffs)) | [?] |
| Shield Specialization (Prot 3/3) | **+6% max mana per block**, at most every 3 s | [F] |
| Improved Seal of Fury (Prot) | **87 mana** (against a level-63 boss) each time a hit that costs you health uses up Seal of Fury's absorb | [F] rank text; the absorb's rules [?] ([Protection tree](#protection-tree)) |
| Judgement of Wisdom (another paladin's) | chance on each of your hits to restore 59 mana (Classic 50% [?]) | [F]/[?] |
| Consumables | Major Mana Potion (1350–2250, 2 min, potion cooldown); Demonic Rune / Dark Rune (900–1500, 2 min, shared rune cooldown, separate from potions). Mageblood Potion and Brilliant Mana Oil for mp5 (Nightfin Soup was mp5 in Classic Era; Forever's is +22 spell damage). **Values and cooldowns are owned by** [buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md) | [C] |

**What this means for Retribution in Forever.** Judging SoC costs 81 and returns 126, so it
**gains** 45 mana per judgement. A 30 s SoC cycle (one recast, 3.75 judgements, 3 Holy
Strikes) costs about 74 mana net, 32 with Twist of Light's cheaper seal ([Worked example 8](#worked-examples)). Ret no longer goes
OOM just from maintaining its seal. Mana is a **budget for Consecration, Exorcism, Hammer of
Wrath and seal twisting**, and each of those is gated by a mana threshold in the rotation.
The Classic problem of recasting SoC after every judgement is gone.

**Protection** gets its mana from being hit: Shield Specialization (6% of maximum mana on a
block, at most every 3 s) and Improved Seal of Fury (87 mana each time a hit uses up Seal of
Fury's absorb). That isn't unlimited. With the default gear's 3,227 mana and the Standard raid's
paladin buffs (Prayer of Spirit, Arcane Brilliance, Blessing of Wisdom, Mana Spring Totem),
Improved Seal of Fury brings about 24 mana a second, Shield Specialization 27 and regeneration
18, and the Major Mana Potion, drunk 1.9 times a fight, 18 more: well over the 45 a second the
seal, Judgement, Holy Shield and Holy Strike cost, so Consecration and Hammer of Wrath have a
budget. The tuned rotation puts Consecration down from 40% mana. Over 10 minutes the rest holds
(Holy Shield up 94%, the seal 99.9%, Judgement and Holy Strike on cooldown), and so does the pool,
around 35–50% of the maximum with a potion every 2 minutes, until the execute phase at 8 minutes:
there Hammer of Wrath spends it, down to about 9% on average in the last minute
([Tuning the defaults](#tuning-the-defaults-c3)).

---

## Threat (paladin-specific)

Global threat rules (base multipliers, taunt, threat per healing and mana gained, Salvation
stacking) live in [threat.md](../mechanics/threat.md). Paladin inputs:

| Source | Threat | Tag |
| --- | --- | --- |
| Holy damage with Righteous Fury | damage × **1.6** (×1.9 until 1.60.1.70009) | [F] [client] (SpellEffect, 1.60.1.70009; [25780][f25780]) |
| Physical damage (white hits) | damage × 1.0. RF doesn't affect it and paladins have no stance | [C] |
| Holy Shield block damage | damage × 1.6 × **1.2** = ×1.92 (the 20% is multiplicative with RF [?]; additive would be ×1.8). It always lands and never crits [?] ([open question 16](#open-questions)) | [F]/[?] |
| Holy Strike | damage × 1.6 × **1.25** = ×2.0 (Iron Creed 5/5) | [F] [client] (SpellEffect, CurvePoint, 1.60.1.70009) |
| Judgement of Fury | damage × 1.6, **taunt 4 s** (sets you to top threat; no-op when you already are) | [F] |
| Retribution Aura | (30 + 0.08 × SP) per hit taken × 1.6 | [F]; the 0.08 [?] ([Other abilities](#other-abilities)) |
| Instrument of Law (Ret) | all threat × 0.8 while RF is off | [F] [client] (TraitDefinitionEffectPoints, 1.60.1.70009) |
| Blessing of Salvation | −30% | [F] [client] (SpellEffect, 1.60.1.70009) |
| Heals, Blessings and mana gains (Shield Specialization, JoW, SoW) | generic rules in threat.md. Whether RF's Holy-school modifier also scales healing threat is [?] | [?] |

---

## Retribution: model and rotation

### Damage sources, in expected order of size

White hits (Physical; 2HWS applies), SoC procs, JoC, Holy Strike, Consecration, JotC's bonus
on all your Holy damage, Exorcism (Undead/Demon), Hammer of Wrath (execute). Twist of Light
echoes when enabled.

### Classic Era approach (baseline)

Pre-pull SotC, judge JotC, then keep **SoC** up and judge it. Classic judging consumed the
seal, so it had to be recast. Consecration only on Vengeance procs, because of mana. Hammer of
Wrath in execute, Exorcism against Undead and Demons. Advanced players twisted SoC→SoR
0.4 s before a swing, using spell batching, at high mana cost
([Warcraft Tavern, Classic](https://www.warcrafttavern.com/wow-classic/guides/pve-retribution-paladin-rotations-cooldowns/)) [C].

### Forever priority list (default)

Evaluate top to bottom whenever the paladin is free (off GCD). **Judgement is off the GCD**,
so check it between GCD actions too. Setting ids are `paladin.retribution.<ability>.<param>`
(written without the prefix below), in the Rotation tab's groups. A mana threshold is a share
of maximum mana: "mana ≥ 65%" is mana ≥ 0.65 × the sheet's maximum. The defaults are the best
rotation found for the default setup ([D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23);
[Tuning the defaults](#tuning-the-defaults-c2) below). The Rotation tab shows these rows as a
priority list you reorder ([The priority list (A2)](#the-priority-list-a2) below).

| # | Action | Condition (setting, default) | Default |
| --- | --- | --- | --- |
| 0 | Pre-pull: Seal of the Crusader at −1.5 s (free, no five-second rule), its judgement at the pull, then the main seal | `judgementOfTheCrusader.enabled` | on |
| — | On-use trinkets (Weakness Analyzer, Earthstrike) and Juju Flurry, off the GCD, on cooldown from the pull: nothing in the list is worth saving them for | `trinkets.enabled`; `jujuFlurry.enabled` with Juju Flurry selected in Buffs (Max consumables selects it) | on; neither acts in the default setup, and each gains in every cell of D23's grid where it acts ([Tuning the defaults](#tuning-the-defaults-c2)) |
| 1 | The main seal: Seal of Command, or Seal of Righteousness (`seal.primary`) | the seal missing, or at most `seal.refreshBelowSec` (1.5 s) of it left. With row 0 on, never over Seal of the Crusader before its judgement has landed | Command |
| 2 | Judgement of the Crusader | the debuff is missing: cast Seal of the Crusader (GCD) when neither it nor the debuff is up, judge it when Judgement is ready, then recast the main seal (row 1). Your landed auto attacks restart its 40 s, so after the pull this fires only if it drops | with row 0 |
| 3 | Judgement (the seal's) | `judgement.enabled`; ready, with the seal up | on |
| 4 | Hammer of Wrath | `hammerOfWrath.enabled`; the execute phase (target ≤ 20% health) and mana ≥ `hammerOfWrath.minManaPct` (0%). Dimmed on the Rotation tab without an execute phase | on |
| 5 | Holy Strike | `holyStrike.enabled`; ready | on |
| 6 | Exorcism | `exorcism.enabled`; target Undead or Demon and mana ≥ `exorcism.minManaPct` (20%). Dimmed on the Rotation tab, with a link to Fight's creature type, against anything else | on (gated by target type) |
| 7 | Consecration (rank 5) | `consecration.enabled`; mana ≥ `consecration.minManaPct` (20%, with Holy Conduit 2/2; 40% on the 1.60.1.70009 slice's build, 60% before it, [below](#the-160170009-re-check)) | on |
| 8 | Consecration (rank 1) | `consecrationRank1.enabled`; mana ≥ `consecrationRank1.minManaPct` (10%; 20% on the slice's build, 15% before 1.60.1.70009). The ranks share one 8 s cooldown | on |
| 9 | Twist: SoR, then after the next swing SoC | talent taken and `mana% ≥ twistMinManaPct` (80). Cast SoR when the swing lands within `twistWindowMs` (≤ 1500 ms) so the echo is used at once; recast SoC after that swing | **off**; not simulated yet |
| — | Major Mana Potion | selected in Buffs, `manaPotion.enabled`; missing at least `manaPotion.earlyMissingMana` (1,500) while the fight has at least its 2 min cooldown left, so another will be ready before the end; after that, missing at least `manaPotion.missingMana` (2,250, its most, so none is lost) | on (Standard raid) |
| — | Demonic Rune (a Dark Rune is the same) | selected in Buffs, `rune.enabled`; the same pair: `rune.earlyMissingMana` (0, never early) and `rune.missingMana` (1,500, its most); its own cooldown, apart from the potion's | on (Max consumables) |
| — | Holy Wrath | Undead/Demon AoE | off; not simulated |

Judgement of the Crusader's rule (A share, the default, or All of it) isn't a rotation setting:
it's the engine switch of [open question 5](#open-questions), how much of the +161 each Holy hit
gets, under Character → Advanced (`rules.jotcBonus`). Tuning leaves it at the documented default.

The fight's end is known exactly: the early potion line's "another will be ready" needs it, where a
player has to judge it. The results list it (`knownFightEnd`) with what misjudging it costs
([Tuning the defaults](#tuning-the-defaults-c2)), whenever an early line is in the list, with or
without a main-hand weapon: the potion line acts either way.

Notes:

- **No seal twisting by default.** A twist pair (SoC→SoR, swing, SoR→SoC, swing) costs
  369 mana and 2 GCDs. It adds **two SoR procs** on top of the SoC rolls those swings get
  anyway: 2 × 123.96 ≈ 248 damage before multipliers at 100 SP (worked example 6), or about
  0.7 per mana. Consecration returns more per mana (at 250 SP: rank 5 about 1.0, rank 1
  about 2.0; worked example 7), so it comes first. Twisting is the mana sink after
  Consecration.
- Recast SoC **before** it expires, so there's always a seal for Judgement. Don't recast
  it early for no reason: the Judgement doesn't care about remaining duration.
- Improved Seals and Vengeance make JoC and SoC scale with SP. Champion of the Light turns
  Int into SP. **Intellect and spell damage are real Retribution stats in Forever.**
- `sealPrimary = SoR` is available for fast or weak weapons. SoC wins with any slow 2H:
  about 47 base DPS from SoC vs about 33 from SoR at 1200 AP, 3.5 speed, 250 weapon average.
  In the default setup SoR in SoC's place makes 31.0 DPS less (−4.9%; 20,000 fights, seed 777;
  −51.6, −8.2%, before SoR's proc had Forever's flat 35).

#### The priority list (A2)

Since M5.65 A2 the rows above are the Rotation tab's priority list
([D31](../decisions.md#d31-the-rotation-tab-is-an-action-priority-list-you-reorder-2026-09-24);
`RETRIBUTION_APL` in `retribution.ts`), in this order, each with its switch and its own settings.
The conditions are the table's rows above, and each row keeps its own wherever it sits.

| Row (`id`) | Table row | Switch | Its settings | Condition |
| --- | --- | --- | --- | --- |
| Before the pull (`prepull`), pinned first | 0 and 2 | — | `judgementOfTheCrusader.enabled` | Seal of the Crusader 1.5 s before the pull and judged at the pull; judged again whenever the debuff is missing. Off: the main seal 1.5 s before the pull |
| Seal (`seal`) | 1 | — (always) | `seal.primary`, `seal.refreshBelowSec` | missing or at most 1.5 s left; with the opener, not over Seal of the Crusader before its judgement |
| Judgement (`judgement`) | 3 | `judgement.enabled` | | ready, with the seal up; off the GCD |
| Hammer of Wrath (`hammerOfWrath`) | 4 | `hammerOfWrath.enabled` | `hammerOfWrath.minManaPct` | execute phase, mana ≥ 0% |
| Holy Strike (`holyStrike`) | 5 | `holyStrike.enabled` | | ready |
| Exorcism (`exorcism`) | 6 | `exorcism.enabled` | `exorcism.minManaPct` | Undead or Demon, mana ≥ 20% |
| Consecration (`consecration`) | 7 | `consecration.enabled` | `consecration.minManaPct` | rank 5, mana ≥ 20% |
| Consecration (Rank 1) (`consecrationRank1`) | 8 | `consecrationRank1.enabled` | `consecrationRank1.minManaPct` | mana ≥ 10% |
| On-use trinkets (`trinkets`) | — (the trinkets' line) | `trinkets.enabled` | | on cooldown, off the GCD |

- **Pinned:** only the pre-pull and opener, first: its judgement comes at the pull. The seal has no
  switch, since there's always one, and its row holds the seal choice, as the Protection paladin's
  seal row does.
- **The on-use trinkets are a row,** as every other spec's are, last by
  default, where their lines always came, so the default order's plan didn't move; a setup saved
  before the row puts it last too. Moved up, they're still off the GCD.
- **Spec-wide, above the list:** Juju Flurry and the Major Mana Potion and Demonic Rune with their
  limits, under Consumables, as every spec's Juju Flurry is. They're off the GCD and always come
  after the list, as they did before it.
- **No named presets:** the defaults are the implicit Default, as Fury's, and the tab still says how
  they were tuned (C2, then a quick search on 1.60.1.70009 under
  [D27](../decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)). In the default order the plan is the
  one the rotation gave before the list, byte for byte: 200 random setups (settings, talents,
  race, main hand, on-use trinkets, consumables, execute phase, creature type and the JotC rule)
  are fingerprinted against the code before it (`retribution-apl.test.ts`), and the Retribution
  golden is unchanged.
- **The two Consecration rows share one cooldown,** so with both on, the higher takes it whenever
  it can be cast, and the lower only when it can't. Each can first be cast at its *floor*: its
  threshold's share of maximum mana, or its cost, whichever is more. The lower row is cast only with
  mana at or above its own floor and below the higher's, so **it's never cast exactly when its floor
  is at least the higher's** (`consecration-rows.ts`; `consecration-rows.test.ts` sweeps both
  thresholds from 0 to 40% in both orders on both specs and counts the casts). Rank 5 below rank 1
  from as much mana, or more, is never cast, since it costs more. Rank 1 below rank 5 from as much
  mana is still cast whenever the mana is there for it and not for rank 5's cost: from 0% each, 15.76
  times a fight in the default setup without the potions, a review measured. The Rotation tab knows neither the
  maximum mana nor the talents, so it says "Not used" under the lower row only where that holds on
  every paladin: rank 5 from at least rank 1's threshold, or rank 1 from at least rank 5's and from
  enough to pay rank 5's most cost (565, no talent) on the least maximum mana a paladin is simulated
  with (2,252: base mana and the Undead row's Intellect), just over 25%. The note names both
  thresholds: "Not used: Consecration, above it, takes their shared cooldown from 20% mana, and this
  starts from 30%. Set this below 20%, or move it above Consecration." (`retributionUnusedSettings`).
  The plan keeps the lower row's line either way.
- **What reordering does,** in the default setup (seed 28301, 20,000 paired fights, 622.0 DPS):
  Consecration above Holy Strike −0.33% (95% CI −0.42 to −0.23%), unlike the Protection paladin's,
  where it gains ([its priority list](#forever-priority-list-default-1) below); Consecration above Hammer of Wrath −0.31%; Holy Strike above Hammer of Wrath −0.06%; Holy Strike
  above the seal −0.32%; rank 1 above rank 5 −5.12%, since rank 5 is then never cast.

### Retribution defaults

| Setting | Default | Why / source |
| --- | --- | --- |
| Talents | **`51003-503-05225331001330321`** (Holy 10 / Prot 8 / Ret 33): Divine Strength 5, **Divine Intellect 1**, Improved Seals 3; Toughness 5, Precision 3; Benediction 5, Improved Judgement 2, **Holy Conduit 2**, Conviction 5, **Vindication 3**, Sanctified Judgement 3, Seal of Command, Sacred Arbiter, 2HWS 3, Vengeance 3, Champion of the Light 3, Instrument of Law 2, Twist of Light. The popular build below on 1.60.1.70009's trees, talent by talent: that build removed Improved Holy Strike and Crusade ([data/talents.md](../data/talents.md#tree-versions)), and of their 4 points one goes to Vindication's third rank, which the 20-point row under Crusade needs, and the other 3 to Divine Intellect 1 and Holy Conduit 2, the best placement searched together with Consecration's thresholds, +1.45% DPS against the slice's Divine Intellect 2 and Holy Conduit 1 (the paladin review's PR-2, [the 1.60.1.70009 re-check](#the-160170009-re-check)). The slice's `52003-503-05215331001330321` and the talent migration's interim `50003-503-05205331001330321`, with those 3 unspent, stay decodable for saved setups | the most popular Forever Ret build when chosen, 2026-09-22, on 1.60.1.69913's trees: `250003-503-052052310012330321` (Holy 10 / Prot 8 / Ret 33: Improved Holy Strike 2, Divine Strength 5, Improved Seals 3; Toughness 5, Precision 3; Benediction 5, Improved Judgement 2, Conviction 5, Vindication 2, Sanctified Judgement 3, Seal of Command, Sacred Arbiter, Crusade 2, 2HWS 3, Vengeance 3, Champion of the Light 3, Instrument of Law 2, Twist of Light) ([talents](https://foreverchanges.pro/talents/paladin)); decoded by tier-then-column order ([data/talents.md](../data/talents.md#build-codes-verified)) [F] |
| Race | **Human** (Alliance) with a 2H sword; **Undead** for Horde presets | Sword Spec +2% crit to everything [F] |
| Weapon | slowest high-DPS pre-raid 2H (speed ≥ 3.4 preferred; ties → sword for Human) from `src/data/items` | SoC scales with weapon damage per swing; the 7 PPM normalizes procs/min, so a slow weapon gives bigger procs and more procs per swing |
| Seal / judgement | SoC; JotC maintained by you | [F] rotation above |
| Aura | Retribution Aura (no DPS effect unless you're hit); raid aura choice lives in the buffs doc | — |
| Buffs | standard raid buffs from the buffs doc: Kings and Might (112) from paladins, Windfury and totems in a melee group, both factions. Might is yours when no other paladin brings it: you bless yourself (the entry's `selfCast`, [buffs §6.1](../mechanics/buffs-debuffs-consumables.md#61-composition-flags-not-factions)), while Kings, Wisdom and Salvation need another paladin | [F] factions |
| Consumables tier | The **Standard raid** preset from [buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset): Elixir of the Mongoose, Elixir of Greater Strength (Classic: Giants), Greater Arcane Elixir (the buffs doc's per-spec entry for Ret: spell power matters now), Smoked Desert Dumplings, a Dense Sharpening Stone, Major Mana Potion. The Max-consumables preset adds Juju Power, Juju Might, R.O.I.D.S., Juju Flurry, Elixir of Holy Power, an Elemental stone (in place of the Dense one: one stone at a time), Demonic/Dark Rune and Flask of Supreme Power. The Standard raid's paladin-only buffs are Prayer of Spirit, Arcane Brilliance, Blessing of Wisdom and Mana Spring Totem ([buffs §6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset), "Pal"): 3,392 mana with the default gear. **No world buffs** ([doctrine §1](../doctrine.md#1-what-were-building)) | buffs doc owns names, values and presets |
| Rotation | the [priority list](#forever-priority-list-default) with its tuned defaults: Judgement of the Crusader from before the pull, Seal of Command, Consecration from 20% mana and rank 1 from 10% (searched with the talents on 1.60.1.70009, first pass, D27), Exorcism from 20%, Hammer of Wrath at any mana, the potion early from 1,500 missing, on-use trinkets and Juju Flurry on cooldown | [D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23): the best found, [below](#tuning-the-defaults-c2) |

#### Tuning the defaults (C2)

The defaults are the best rotation found on 2026-09-23 per
[D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23), with the
method of [warrior §5.3 "Tuning the defaults"](warrior.md#tuning-the-defaults-m25a): paired
comparisons on the real engine with `scripts/tune/rotation.mjs --spec paladin-retribution`, the
same fights for every candidate (common random numbers), and a candidate adopted only when the 95%
confidence interval of its per-fight difference lies above zero, on a seed no search used. The setup
is the default Retribution setup (Human, the 10/8/33 build, pre-raid BiS, the Standard raid buffs,
180 s ± 10%, 20% execute, armor 3,731, no creature type). It was tuned twice: once when C2 was
built, and again after its review gave a paladin's Standard raid Prayer of Spirit and Arcane
Brilliance (2,882 → 3,392 mana), which moved the Consecration thresholds.

##### The 1.60.1.70009 re-check

1.60.1.70009's changes ([what changed](#changes-in-160170009)) made Retribution's seals cheaper
(Twist of Light) and moved its talents, so the thresholds were re-checked as a first pass (D27: one
quick search, then a confirmation on a fresh seed; D23's grid by fight length waits for the tuning
milestone), on the new default build ([Retribution defaults](#retribution-defaults): Divine Intellect 1 and Holy
Conduit 2 give 3,422 mana and Consecrations at 282 and 67).

- **The refunded points and the thresholds, searched together (the paladin review's PR-2,
  2026-09-24).** The slice first placed the points, then tuned the thresholds on them; the review
  found a better pair searched together. Improved Holy Strike's and Crusade's 4 points: one to
  Vindication's third rank, which the 20-point row under Crusade needs; the other 3 among Divine
  Intellect, Holy Conduit and Reverence (Divine Intellect 3; 2 and Holy Conduit 1; 1 and Holy Conduit
  2; 2 and Reverence 1), each with Consecration from 10 to 50% by 5 and rank 1 from 0 to 25% by 5
  (seed 777, 20,000 paired fights a candidate, 216 in all): **Divine Intellect 1 and Holy Conduit 2,
  with Consecration from 20% and rank 1 from 10%**, +1.58%; the slice's Divine Intellect 2 and Holy
  Conduit 1 was best at 35% and 20% (+0.04%), Divine Intellect 3 at 40% and 15% (−1.58%), Reverence
  at 40% and 20% (−1.30%). **Confirmed** on seed 20260934 (100,000 paired fights, which the search
  didn't use): **+8.90 DPS (+1.45%, 95% CI +8.66 to +9.14)** against the slice's defaults; the build
  alone at the old thresholds +1.11%, the thresholds alone on the old build −0.96%. With Holy Conduit
  2/2 Consecration costs 282 and rank 1 67, so both pay from a lower share of the pool. In the winner
  (seed 779, 40,000 fights): rank 1 from 15% −0.03%, from 5% −0.05%, rank 5 from 15% −0.06%, from 25%
  −0.06%, the slice's build −2.42%; the seal recast at 1.5 s (1 s +0.02%, 2 s −0.03%: neither
  clears), Hammer of Wrath at any mana (10%: −0.10%) and the early potion at 1,500 missing (1,250
  +0.03%, not clearing; 1,750 −0.17%) hold. On seed 31101 (100,000 fights): **621.93 DPS** (612.69
  before).
- **The slice's placement (until PR-2).** The other 3 points by measured DPS alone (seed 777,
  40,000 paired fights a build; confirmed on seed 20260927, 100,000): Divine Intellect 2 and Holy
  Conduit 1, +6.29 DPS (+1.04%, 95% CI +6.06 to +6.52) against the 3 left unspent; Holy Conduit 2
  and Divine Intellect 1 +1.00% (and 0.04% behind, +0.02 to +0.48 DPS, at the thresholds before
  1.60.1.70009); Divine Intellect 3 +0.47%; Holy Conduit 2 alone +0.46%; Divine Intellect 2 and
  Reverence 1 +0.43%. Deflection gives no DPS. Then **Consecration from 40%, rank 1 from 20%**: +3.83
  DPS (+0.63%, 95% CI +3.72 to +3.93) against 60% and 15% (seed 20260928, 100,000 paired fights).

**Second round (C2's review), the defaults until 1.60.1.70009.** Against the first round's defaults on the new
setup (Consecration from 65%, rank 1 from 20%), the result is **+1.63 DPS (+0.26%, 95% CI +1.55 to
+1.71)**, 621.27 → 622.90, over 400,000 paired fights on seed 6464
(`--against` the commit before the change).

- **Search** on seed 1 (40,000 fights a candidate), each threshold swept with re-sweeps on top of
  each change, then the few candidates on seed 3 (100,000) and seed 9191 (400,000).
- **In the winner** (seed 6464, 400,000 fights, each change reverted in turn):

| Setting | Old → new | In the winner, Δ DPS (95% CI) |
| --- | --- | --- |
| `consecration.minManaPct` | 65% → 60% | +1.63 (+1.55 to +1.70) |
| `consecrationRank1.minManaPct` | 20% → 15% | +0.21 (+0.19 to +0.23) |
| `manaPotion.earlyMissingMana` | 1,500, kept | +14.40 over none (+2.31%) |

- **Why.** With 510 more mana, rank 5 pays from a lower share of the pool, and rank 1 can go
  down lower still before the execute phase's Hammers of Wrath need what's left.
- **Robustness** (seed 11, 100,000 paired fights a cell, the new defaults against the first
  round's). With no creature type, every cell of D23's grid gains but one that doesn't move:

| Fight | No execute phase | 10% | 20% |
| --- | --- | --- | --- |
| 30 s | +0.52% | +0.41% | 0.00% |
| 45 s | +1.16% | +1.12% | +1.22% |
| 60 s | +0.87% | +0.96% | +1.01% |
| 90 s | +0.58% | +0.82% | +0.78% |
| 180 s | +0.70% | +0.63% | +0.30% |
| 300 s | +0.30% | +0.27% | +0.04% |

  Against Undead (Demons the same), with Exorcism's revert below: +0.01% to +0.59% in 10 cells,
  unchanged in five (30 s, and 45 s with no phase or 10%), and −0.63% at 180 s with a 20% phase,
  −0.14% and −0.35% at 300 s with 10% and 20%: the cells where Exorcism from 40% was ahead.
- **Tried and dropped.** The potion's "when missing" at 2,500 (+0.01% in the winner): above a
  setup's maximum mana it's never missing that much, so a paladin under 2,500 mana, such as one on
  Self only buffs, would never drink it late. The early potion from 1,875 missing (+0.03% on seed
  9191): it lost in five cells of the grid (up to 0.09%), and 2,000 loses 1.4%, too near a cliff.
  Hammer of Wrath from 5 to 20% and the seal recast at 0 to 3.5 s: none clears.

**Exorcism's threshold (C2's review, RL1).** The first round set it to 40%, searched against
Undead in the default fight only, and it failed D23's grid, losing up to 2.6% (60 s, no execute
phase). It's back at **20%**. On the final defaults (seed 4242, 100,000 fights a cell, against
Undead; Demons are the same), 40% against 20%:

| Fight | No execute phase | 10% | 20% |
| --- | --- | --- | --- |
| 30 s | 0.00% | 0.00% | 0.00% |
| 45 s | 0.00% | 0.00% | −0.19% |
| 60 s | 0.00% | 0.00% | −0.01% |
| 90 s | −0.20% | −0.45% | −0.57% |
| 180 s | −1.06% | −0.74% | +0.03% (−0.06 to +0.41 DPS: no) |
| 300 s | −0.85% | −0.37% | −0.12% |

A reserve tied to the execute phase, Exorcism from 40% only while a phase is still to come and
from 20% in it or without one, was tried on the same grid (seed 5151): no different in 15 cells,
and −0.64% at 180 s with a 10% phase, −0.30% and −0.18% at 300 s with 10% and 20%. It never wins,
so it isn't adopted.

**Knowing the fight's end (RL2).** The early potion line drinks only while another will be ready
before the fight ends, which the sim knows exactly and a player has to judge; the results list it
(`knownFightEnd`). With the default setup (seed 7373, 100,000 paired fights), judging its two
minutes 10 or 20 s off costs up to 0.37% (150 s with 140 s judged: −0.37%; 100 s: −0.29%), and
nothing in a 180 s fight judged short. The review measured up to 0.58% on the first round's setup.

**On-use trinkets and Juju Flurry (C2's review, RV2).** Neither acts in the default setup, which
wears no on-use trinket and selects no Juju Flurry, so each is held to D23's rule for a change that
doesn't act there: on a fresh seed, its interval lies above zero in every cell of the grid where it
acts. Against the same setup with the switch off, on seed 8675309 with 20,000 paired fights a cell:
`trinkets.enabled` with Weakness Analyzer worn (in place of Blackhand's Breadth), and
`jujuFlurry.enabled` with Juju Flurry selected in Buffs.

| Fight | Weakness Analyzer on cooldown: no execute phase, 10%, 20% | Juju Flurry on cooldown: no execute phase, 10%, 20% |
| --- | --- | --- |
| 30 s | +0.72%, +0.69%, +0.68% | +1.55%, +1.45%, +1.46% |
| 45 s | +0.50%, +0.48%, +0.46% | +0.95%, +0.90%, +0.88% |
| 60 s | +0.38%, +0.37%, +0.36% | +0.82%, +0.76%, +0.71% |
| 90 s | +0.31%, +0.30%, +0.29% | +1.09%, +1.07%, +1.05% |
| 180 s | +0.26%, +0.26%, +0.25% | +0.86%, +0.80%, +0.76% |
| 300 s | +0.25%, +0.24%, +0.24% | +0.85%, +0.79%, +0.80% |

All 36 intervals lie above zero (the lowest bounds: +0.23% for the trinket at 300 s, +0.60% for
Juju Flurry at 60 s with a 20% phase), so both stay on. The trinket gains most in short fights,
where its one use at the pull is a larger share of the fight. The review's verification ran the
same grid and seed and agreed.

**First round (C2).** Against the documented priority (Consecration from 60% and rank 1 from 30%,
the potion only when missing 2,250), on the setup without Prayer of Spirit and Arcane Brilliance:
**+7.99 DPS (+1.33%, 95% CI +7.86 to +8.11)**, 600.61 → 608.60, over 400,000 paired fights on seed
7919. In the winner: the early potion from 1,500 missing +7.25 (+7.12 to +7.37), rank 1 from 20%
+0.36, rank 5 from 65% +0.03 (the second round moved both).

- **Why the early potion wins.** Mana, not the global cooldown, limits Retribution: the pool runs
  dry in a 180 s fight. In the default fight, Hammer of Wrath and Consecration rank 1 deal about
  2.5 damage per mana, Exorcism (against Undead) about 2.3, and rank 5 about 1.2, so rank 5 waits
  for more mana and rank 1 goes down lower. The first potion goes about 30 s in, once a
  Consecration has left you 1,500 short, so a second is ready in the execute phase for its Hammers
  of Wrath. At 2,250 missing there was one potion a fight, late. The early line needs at least
  the potion's 2 minute cooldown left, so a short fight doesn't drink early for nothing.
- **Kept** (each against the first round's defaults on seed 1, 40,000 fights). Seal of
  Righteousness in place of Command: −52.78 DPS (−8.68%); with Forever's flat 35 on its proc
  (2026-09-24) still −31.0 (−4.9%) in today's default setup. Judgement of the Crusader off: −45.27
  (−7.44%). The seal recast at 1.5 s left (0 to 3 s: none clears; 0 s −0.94). Hammer of Wrath at
  any mana (from 15%: −0.19). The potion's no-waste 2,250 after the early line (1,750 to 2,500:
  none clears). Turning a row off costs: Judgement −86.14, Holy Strike −66.29, Hammer of Wrath
  −29.81, the potion −22.92, Consecration rank 1 −13.26, rank 5 −2.30.
- **Tried and dropped.** Consecration at any mana in the fight's last 5 to 60 s (each worse, up
  to −2.13%: the execute phase's Hammers of Wrath need that mana), Consecration waiting for Holy
  Strike's cooldown (worse, on the engine before C1's fixes), and a reserve of mana per minute
  left before rank 5 (every reserve worse or level). One lower threshold for every potion, without
  the "another will be ready" condition (missing 1,125, with Consecration from 70% and rank 1 from
  20%), won +0.87% in the default fight but lost 0.55% in a 120 s fight and 0.23% against Undead:
  it drank early whatever the fight's length.
- **Not tuned:** the rune's pair (not in the default Standard raid preset); the Judgement of the
  Crusader rule (an engine switch for [open question 5](#open-questions) under Character →
  Advanced, not a rotation choice: All of it adds +46.24 DPS, +7.60%, on the first round's setup);
  and seal twisting (not simulated). On-use trinkets and Juju Flurry have their grid above.
- Rerun with, for example, `node scripts/tune/rotation.mjs --spec paladin-retribution --fights
  400000 --seed 6464 consecration.minManaPct=65` (a candidate against the defaults) or
  `--sweep consecration.minManaPct=50:70:2`.

---

## Protection: model and rotation

### Threat sources, in expected order of size

Measured in the default setup on 1.60.1.70009 (2026-09-24, after the paladin review's PR-1 and PR-4:
180 s, the Standard raid with a raid Restoration druid's Thorns, your own Judgement of the Crusader
from the opener, the interim gear, the default talents and order, 379 Holy spell damage; 752.6 TPS
and 466.6 DPS over 100,000 fights on seed 31101): Seal of Fury's procs (19.0% of TPS, 143 TPS),
Consecration (16.9%, 127, rank 1's 0.1% with it; 21.3 a fight), Judgement of Fury (14.6%, 110),
Holy Shield's block damage (12.3%, 93, ×1.92 threat), white hits with their Windfury, Flurry Axe
and Reckoning extra attacks (15.3% together, 115, ×1), Holy Strike (9.7%, 73, ×2.0; 17.4 a fight),
Hammer of Wrath in the execute phase (4.8%, 36), the mana Shield Specialization, Improved Seal of
Fury and the potion give (5.2%, 39, 0.5 a mana), and Thorns (2.1%, 16). Retribution Aura adds 6.8%
with Max TPS; Exorcism counts only against Undead and Demons. Before PR-1 (750.3 TPS, 10,000
fights, a raid druid's Thorns at 53) Consecration was 14.8% and Holy Strike 10.2%. After T2's fix round, before 1.60.1.70009 (823.6 TPS, seed 12345), the shares were much the
same (Consecration 19%, Holy Strike 9%, Thorns 1%); before T2 (C3's setup, 2026-09-23, 424.8 TPS)
Holy Shield led with 24%.
Righteous Fury, cast before the pull, is behind every Holy share: the Rotation tab's pinned
**Before the pull** row names it and its help says it stays up all fight, and the results list it
up all fight.

### Classic Era approach (baseline)

Righteous Fury on, **Holy Shield kept up**, Seal of Righteousness with Judgement when mana
allows, Consecration for AoE and bursts, downranked for mana (bind every rank), Blessing of
Sanctuary on tanks
([Icy Veins Classic prot paladin](https://www.icy-veins.com/wow-classic/protection-paladin-tank-pve-rotation-cooldowns-abilities)) [C].
Forever eases the mana constraint (Shield Specialization and Improved Seal of Fury pay mana for
being hit, and Judgement doesn't consume the seal) without removing it ([mana model](#mana-model)),
and replaces Sanctuary with Seal of Fury, Iron Creed and Holy Strike.

### Forever priority list (default)

Evaluate top to bottom whenever the paladin is free (off GCD); Judgement and Swift Judgement are
off the GCD, so they're checked between GCD actions too. Setting ids are
`paladin.protection.<ability>.<param>`; the defaults are the tuned ones
([Tuning the defaults](#tuning-the-defaults-c3) below), and a preset at the top of the Rotation tab
picks D28's Defensive, Balanced (the default) or Max TPS ([below](#priority-defensive-balanced-or-max-tps)).
The Rotation tab shows these rows as a priority list you reorder (D31, `PROTECTION_APL` in
`src/sim/classes/paladin/protection.ts`): rows 0–0c are one pinned row first, **Before the pull**
(the aura, Righteous Fury and the opener; its settings are Devotion Aura and Judgement of the
Crusader), since the aura is D26's duty with a fixed rule and the opener's judgement comes at the
pull; then rows 1–8, each its own row with its switch and settings (the seal's row has no switch,
since there's always one), in this order. Since the paladin review's PR-1, Exorcism, Hammer of Wrath
and Consecration (rows 6, 8, 7 and 7b) come before Holy Strike (row 5): Consecration from 20% mana
then goes down on its cooldown rather than behind Holy Strike's, **+12.37 TPS (+1.67%, 95% CI +12.18
to +12.55)** and +7.47 DPS (+1.63%) for 1.1 more damage taken a second, together with the refunded
point's Holy Conduit 1 ([Protection defaults](#protection-defaults); seed 20260935, 100,000 paired
fights, which no search used; Max TPS the same, +12.36 TPS, +1.56%). The on-use trinkets are the
list's last row (`trinkets`), as Retribution's are, where their lines always came, so no plan moved;
Juju Flurry and the mana consumables are spec-wide, above the list, under Consumables, and always
come after it: they're all off the global cooldown. A row's
conditions are its own wherever it sits: Swift Judgement still frees Judgement wherever it is.
Hammer of the Righteous and Holy Strike share a cooldown, so with both on, the plan has both rows
and the shared cooldown decides, as a real priority list would: the higher row is used whenever it
can be, and the lower only when the higher can't be paid for. Hammer of the Righteous sits just
above Holy Strike by default, the last two ability rows, off, so turning it on puts it in Holy Strike's place, with Holy Strike
as its fallback when Hammer's 90 mana isn't there (rarely, in the default setup); moving it below
Holy Strike keeps Holy Strike, which costs 20 and so leaves Hammer nothing, and the plan leaves Hammer out (and its weapon-DPS assumption with it). In the order before PR-1 the plan is the one the rotation gave before the list, fight for
fight (`protection-apl.test.ts`, `PRE_LIST_ORDER`).

| # | Action | Condition (setting, default) | Default |
| --- | --- | --- | --- |
| 0 | Aura: Devotion Aura, the duty, or Retribution Aura instead (`devotionAura.enabled`) | 4.5 s before the pull, first: a duty comes before any threat ability (D26's fixed rule, [below](#priority-defensive-balanced-or-max-tps)). Free, and it lasts all fight. Retribution Aura deals 30 Holy + 0.08 × SP to the boss on each of its swings that lands on you | Devotion; Retribution with Max TPS |
| 0b | Righteous Fury | up all fight, cast 3 s before the pull, a global cooldown after the aura and before the seal (free; the plan's ×1.6 Holy threat). The Rotation tab names it in the pinned Before the pull row, whose help says it stays up all fight; no switch, and no fixed row, since that would be a heading's only setting (the verification pass's VA-1) | on (forced, no setting) |
| 0c | **The opener: Judgement of the Crusader** (`judgementOfTheCrusader.enabled`) | Seal of the Crusader 1.5 s before the pull (free) in the seal's place; judge it at the pull (off the GCD), placing JotC; then row 1 puts the main seal up. Your landed auto attacks restart JotC's 40 s, so it stays up; if it's ever missing (40 s with no landed swing), Seal of the Crusader and its judgement again, the same way. As Retribution's rows 0–2 | on (user, 2026-09-24) |
| 1 | Seal: Seal of Fury, or Seal of Righteousness (`seal.primary`) | 1.5 s before the pull (free) without the opener; then missing or with at most `seal.refreshBelowSec` (2.5 s) left, but not over Seal of the Crusader before its judgement has landed | Fury |
| 2 | Holy Shield | `holyShield.enabled`; the talent and a shield; its buff gone (4 blocks used, or its 10 s over). Its cooldown is its duration | on |
| 3 | Judgement (the seal's) | `judgement.enabled`; ready (off GCD), with the seal up | on |
| 4 | Swift Judgement | `swiftJudgement.enabled`; the talent; Judgement has at least `swiftJudgement.minCooldownSec` (4.5 s) of cooldown left and the seal is up (off GCD). It ends Judgement's cooldown, and row 3 judges again at once, for free | on |
| 6 | Exorcism | `exorcism.enabled`; target Undead or Demon and mana ≥ `exorcism.minManaPct` (0%). Dimmed on the Rotation tab, with a link to Fight's creature type, against anything else | on (gated by target type) |
| 8 | Hammer of Wrath | `hammerOfWrath.enabled`; the execute phase (target ≤ 20% health) and mana ≥ `hammerOfWrath.minManaPct` (0%); a 1 s cast, which stops auto attacks and holds Judgement ([Other abilities](#other-abilities)). Dimmed on the Rotation tab without an execute phase | on |
| 7 | Consecration (rank 5) | `consecration.enabled`; mana ≥ `consecration.minManaPct` (20%: T2's re-check, [below](#tuning-the-defaults-c3)) | on |
| 7b | Consecration (rank 1) | `consecrationRank1.enabled`; mana ≥ `consecrationRank1.minManaPct` (10%). The ranks share one 8 s cooldown, so the lower row is cast only when the higher can't be: never when its floor (its threshold's share of maximum mana, or its cost, whichever is more) is at least the higher's. The Rotation tab says "Not used" under it only where that holds for any maximum mana and talents, as Retribution's does ([its notes](#the-priority-list-a2)): rank 1 below rank 5 from 10% with rank 5 from 10% is still cast, up to 0.61 times a fight (a review's measurement), when the mana is there for rank 1 and not for rank 5's cost (`protectionUnusedSettings`) | on (T2) |
| 5b | Hammer of the Righteous in Holy Strike's place (listed just above it) | `hammerOfTheRighteous.enabled`; ready; a 1H axe, mace or sword (with anything else, row 5 instead). They share one cooldown, so the higher of the two rows is used whenever it can be: this one, while it's above Holy Strike and on, with Holy Strike when its 90 mana isn't there. The Rotation tab's Holy Strike row then says so ("Rarely used: Hammer of the Righteous, above it, takes its place (they share a cooldown). It's used when you can't pay Hammer's 90 mana."); its own row says when the main hand can't use it (and that Holy Strike is used, or to turn Holy Strike on; with no main hand, neither is), or when Holy Strike, moved above it, takes its place | **off in every preset**: Holy Strike makes more threat, and its Iron Creed cuts damage taken, which Balanced keeps (user decision in D28, [below](#priority-defensive-balanced-or-max-tps)) |
| 5 | Holy Strike | `holyStrike.enabled`; ready; a weapon in the main hand (with none, the Rotation tab says "Not used: needs a weapon in your main hand.") | on |
| — | On-use trinkets (Weakness Analyzer, Earthstrike) and Juju Flurry, off the GCD, on cooldown from the pull, as Retribution's (`consumables.ts`) | `trinkets.enabled`; `jujuFlurry.enabled` with Juju Flurry selected in Buffs (no Protection preset selects it) | on; neither acts in the default setup |
| — | Major Mana Potion | selected in Buffs, `manaPotion.enabled`; missing at least `manaPotion.earlyMissingMana` (1,500) while the fight has at least its 2 min cooldown left, so another will be ready before the end; after that, missing at least `manaPotion.missingMana` (2,250, its most). Its mana makes threat, 0.5 a point. The early line rests on knowing the fight's end, which the results list (`knownFightEnd`, [below](#tuning-the-defaults-c3)) | on (Standard raid) |
| — | Demonic Rune (a Dark Rune is the same) | selected in Buffs, `rune.enabled`; the same pair: `rune.earlyMissingMana` (0, never early) and `rune.missingMana` (1,500, its most); its own cooldown, apart from the potion's | on (Max consumables) |
| — | Judgement debuff | `protJudgementDebuff`: None, Wisdom or Light. Pre-pull: seal, judge, then Seal of Fury | None; not simulated yet |
| — | Templar's Bulwark, Divine Protection | defensive; no TPS effect | off; not simulated |

Holy Strike and HotR share category 2404: casting one locks the other for that spell's
cooldown [F] [client] (SpellCategories, 1.60.1.70009). Single target: Holy Strike wins, though HotR
comes every 6 s to its 10. It scales with SP (0.429) and with another paladin's Judgement of the
Crusader, and Iron Creed adds 25% threat and cuts damage taken; HotR has no SP coefficient in the
data. In the T2 default setup, HotR in its place makes **−13.4 TPS (−1.65%)** and +2.5 DPS (+0.57%),
even with attack power counted in its weapon DPS, for 5% more damage taken (40,000 paired fights,
seed 777): −1.1% on the balanced objective. With T2's fix-round build it's −0.39% TPS and +1.24%
DPS, and 4.3% more damage taken. On 1.60.1.70009 (Holy Strike's 50% every 10 s; the default build,
seed 31101, 100,000 paired fights) it's **−10.80 TPS (−1.44%)**, +2.45 DPS (+0.52%) and +46.4 damage
taken a second (+5.1%). Balanced still keeps Holy Strike, whose Iron Creed is active
mitigation (user decision in D28, [below](#priority-defensive-balanced-or-max-tps)).
A slow, high-DPS one-hander with little spell damage is where HotR could win.

#### Priority: Defensive, Balanced or Max TPS

Per [D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23)
and [D28](../decisions.md#d28-three-tank-rotations-defensive-balanced-and-max-tps-2026-09-24), the
Rotation tab opens with the priority list's preset (`priority`): **Defensive** (D26's "Tank duties
first", renamed; its stored value `duties` still loads as it), **Balanced** (`balanced`, the
default) and **Max TPS** (`maxTps`). A preset sets the Priority choice, which moves defaults, and
puts the list's other settings at their defaults and its order back; editing the list after picking
one makes it "Custom" (D31). A setup that kept the old default gets Balanced.

- **Balanced** plays as Defensive does. It keeps Defensive's upkeep, Devotion Aura and Holy Shield
  (D28: a paladin has no armor debuff, but a survival aura), with the same fixed timing, and Holy
  Strike too: its Iron Creed cuts damage taken by 10% for 6 s after each landed Holy Strike, which
  is active mitigation, and Balanced keeps a tank's active mitigation (user decision, 2026-09-24,
  in D28). The two differ only in what their searches tune: threat and damage together for
  Balanced, the balanced objective (Δ TPS % + Δ DPS % against Defensive, D30), threat alone for
  Defensive. Its defaults are first-pass (D27): Defensive's tuned list plus one quick search
  (2026-09-24, seed 777, 20,000 paired fights a candidate) of the three biggest settings, which
  found one change, now declined:
  - **Hammer of the Righteous in Holy Strike's place: declined** (user decision). It measured
    −3.33 TPS (−0.40%) and +5.45 DPS (+1.22%), for 39.0 more damage taken a second (+4.3%, Iron
    Creed's cut goes with Holy Strike): +0.82 on the objective. On seed 20260925, which the search
    didn't use (100,000 paired fights): −0.36% TPS (95% CI −0.38% to −0.34%), +1.27% DPS (+1.25%
    to +1.30%), on T2's fix-round build; on the theorycrafter's, −1.20% TPS and +0.84% DPS (below).
    It stays a row, off, just above Holy Strike: turned on, it trades TPS and Iron Creed's 10%
    damage-taken cut for a little DPS.
  - **Consecration's threshold and rank**, from 0 to 60% with rank 1 on and off: 20% with rank 1
    from 10% stays best (10% and 0% −0.09% TPS, 30% −0.07%, rank 1 off −0.11%); rank 1 alone, no
    rank 5, loses 7.3% of TPS and 5.5% of DPS. Rank 1 from 0% gains +0.03% and +0.03%, within
    what a first pass leaves (D27).
  - **Hammer of Wrath**: from 0% stays (10% −0.01%, 20% −0.15%, 40% −0.85% of TPS, and less DPS);
    off, in Defensive, it loses 3.6% of TPS and 2.9% of DPS. Swift Judgement's 4.5 s and the seal's
    2.5 s hold too (4 s −0.48%; the seal from 1.5 to 3.5 s within ±0.05% of TPS and ±0.1% of DPS).
  - **So Balanced is Defensive's rotation**, fight for fight. With the theorycrafter's talents, the
    default since ([Protection defaults](#protection-defaults)), on seed 20260926 (100,000 fights):
    832.13 TPS, 447.95 DPS and 918.3 damage taken a second. Max TPS against it: **+24.93 TPS
    (+3.00%)**, +12.87 DPS (+2.87%), +52.5 damage taken (+5.7%). Hammer of the Righteous turned on,
    with Holy Strike as its fallback (the tank integration review's TI-5): **−8.85 TPS (−1.06%)**,
    +4.12 DPS (+0.92%), +46.3 damage taken (+5.0%); before the fallback, when a Hammer it couldn't
    pay for left the cooldown unused, −9.95 TPS (−1.20%) and +3.77 DPS (+0.84%). (The search above
    ran on T2's fix-round build: 823.8 TPS and 447.0 DPS on seed 20260925.)
  - **On 1.60.1.70009** (the default build, [Protection defaults](#protection-defaults); seed 31101,
    100,000 fights): **749.25 TPS**, 466.81 DPS and 917.5 damage taken a second. Max TPS against it:
    **+51.20 TPS (+6.83%)**, +31.37 DPS (+6.72%), +52.5 damage taken (+5.7%): Retribution Aura now
    scales with spell damage. Hammer of the Righteous on: −10.80 TPS (−1.44%), +2.45 DPS (+0.52%),
    +46.4 damage taken (+5.1%). The first-pass re-check (seed 777, 20,000 paired fights a candidate)
    holds every threshold, for Balanced and Max TPS alike: Consecration from 20% (0 or 10% −0.06%
    of TPS, 30% −0.02%, 40% −0.14%, 60% −0.60%), rank 1 from 10% (0% +0.02% TPS and +0.02% DPS,
    within a first pass; 20% or off −0.10%), Swift Judgement's 4.5 s (4 s −0.47%), the seal's 2.5 s
    (2 s −0.04%, 3 s −1.15%), Hammer of Wrath from 0% (10% level) and the early potion at 1,500
    (1,250 level, 1,750 −0.08%).
  - **The paladin review's joint search (PR-1, 2026-09-24):** the row order, the refunded point and
    the thresholds together, on the Balanced objective (Δ TPS % + Δ DPS %).
    - **The order.** Every order of the global-cooldown rows (the seal, Holy Shield, Holy Strike with
      Hammer of the Righteous and Exorcism, Consecration ranks 5 and 1, Hammer of Wrath; rank 5 above
      rank 1; 360 orders, seed 777, 20,000 paired fights each): the best put Consecration above Holy
      Strike, +1.3 to +1.4% TPS and about +1.3% DPS; Hammer of Wrath above Consecration adds about
      0.1%; where rank 1 sits doesn't matter. Consecration above Holy Shield (+1.20%) or the seal
      (+1.09%) is worse than above Holy Strike. Against Undead, Exorcism above Consecration gains
      +0.32% (seed 20260933, 40,000 fights), so it moved up with them; with no creature type it never
      acts. The adopted order: the seal, Holy Shield, Judgement, Swift Judgement, Exorcism, Hammer of
      Wrath, Consecration, rank 1, Hammer of the Righteous, Holy Strike.
    - **The refunded point, with the order** (seed 777, 40,000 fights; one point must go to Divine
      Strength 5 or Divine Intellect 1 for Improved Seals' row): **Holy Conduit 1** +0.26% TPS and
      +0.31% DPS over Conviction 1; Divine Intellect 1 with Holy Conduit 1 +0.17%; Benediction 1
      −0.38%; Divine Intellect 1 in Divine Strength 5's place with Conviction +0.01%; Anticipation 3,
      Toughness 1 or the point unspent −0.65%. Without the new order Holy Conduit 1 loses 0.59% of TPS
      to Conviction 1: Consecration's cheaper cost pays only once it's cast on its cooldown.
    - **The thresholds, with both** (Consecration from 0 to 40% by 5, rank 1 from 0 to 20% by 5):
      from 20% with rank 1 from 10% stays. Rank 5 from 0 to 10% with rank 1 from 0% measured +0.21 TPS
      more (+0.03%, seed 20260935), within a first pass (D27), but spends the pool to nothing: with no
      raid buffs the seal then lapses for want of mana (Seal of Fury up 96.8% of the fight, not 99.9%;
      `protection.test.ts`'s opener check), so the 10% reserve stays. The seal's 2.5 s, Swift
      Judgement's 4.5 s, Hammer of Wrath from 0% and the early potion at 1,500 hold (seed 778, 40,000
      fights: the seal at 1.5 s +0.07%, confirmed on seed 20260931 at +0.53 TPS but not at 1 s
      (−0.15%) or 0.5 s (+0.02%), a global-cooldown alignment rather than a threshold, left to the
      tuning milestone).
    - **Confirmed** on seed 20260935 (100,000 paired fights) against the order, talents and
      thresholds before it: Balanced and Defensive **+12.37 TPS (+1.67%, 95% CI +12.18 to +12.55)**,
      +7.47 DPS (+1.63%), +1.1 damage taken a second (+0.12%); Max TPS +12.36 TPS (+1.56%), +7.47
      DPS. On seed 31101 (100,000 fights): **752.62 TPS, 466.60 DPS and 918.6 damage taken a second**
      for Balanced and Defensive; Max TPS against it +6.76% TPS, +6.68% DPS and +5.72% damage taken;
      Hammer of the Righteous turned on −1.64% TPS, +0.23% DPS and +4.92% damage taken.
    - **Re-measured with the trainers' ranks** ([D36](../decisions.md#d36-what-we-take-from-warriorsim-2026-09-25):
      the raid's Blessing of Might r6 and Wisdom r5, Battle Shout r6 and Strength of Earth r4; seed
      31101, 100,000 fights): **746.42 TPS, 460.97 DPS and 918.9 damage taken a second** for Balanced
      and Defensive; Max TPS against it +6.81% TPS, +6.76% DPS and +5.72% damage taken; Hammer of the
      Righteous turned on −2.00% TPS (−15.13 to −14.77), −0.13% DPS (−0.73 to −0.50) and +4.92% damage
      taken. The presets' help quotes these (`PROTECTION_PRESET_MEASURES`, which
      `protection-presets.test.ts` measures again), each change with its direction.

- **The duty: Devotion Aura**, the paladin's own aura, +735 armor. It's survival with a measured
  cost. In the default setup it saves 38 damage taken a second (5.3% of the 719 you'd take without
  it) and costs Retribution Aura's threat, 20.0 TPS (4.7%) and 10.3 DPS (4.5%). **Defensive** and
  **Balanced** keep it up all fight (`devotionAura.enabled`), and the Buffs tab's Devotion Aura is
  then yours: the switch shows it on, and it counts once.
- **Its timing is D26's fixed rule, never tuned** (user decision, D26's "How it applies"): the
  duties come first in the priority, before any threat ability on the global cooldown; a duty that
  isn't a debuff on the boss is used when it's ready; and a debuff, with or without a cooldown, is
  refreshed as soon as a missed cast could still be tried again before it falls off, from its own
  cooldown, or from one global cooldown if it has none. For the paladin that's one line: Devotion
  Aura, a buff with no cooldown, is ready before the pull, so it's cast first, 4.5 s before it,
  ahead of Righteous Fury (3 s) and the seal (1.5 s), and it's up from the pull. It can't miss and
  lasts until you cancel it, so it never needs a refresh. The search tunes only the threat
  abilities around it.
- **Max TPS** drops it for Retribution Aura, 30 Holy damage + 0.08 × spell damage to the boss on
  each of its swings that lands, ×1.6 threat. The Buffs tab's Devotion Aura is then off by default, and says so:
  "You're not keeping it up (see Rotation); turn this on if another paladin does." It's the
  spec's own (`SpecMeta.ownBuffs`), so no preset has it, and none has a warrior tank's Thunder
  Clap or Demoralizing Shout either (D26; [buffs §6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset));
  you can add them.
  Max TPS moves only that setting's default; Hammer of the Righteous stays off, as in every preset.
- **Not duties.** Holy Shield (+20% block, and a block's damage), Seal of Fury (its absorb, and
  its judgement's taunt) and Holy Strike (Iron Creed's −10% damage taken) help you survive too,
  but each also makes more threat than what would replace it, so no preset gives them up. In
  the default setup after T2's fix round (40,000 paired fights, seed 777): Holy Shield off loses
  14.4% of TPS (and takes 0.4% more damage), Seal of Righteousness 3.9% with the default 1.5 s axe,
  Holy Strike 9.2% (and takes 3.1% more damage). Nothing is dropped for an untested threat value,
  and every threshold's best value is the same for all three. The seal is up from before the
  pull: with the opener it's Seal of the Crusader, judged at the pull, so the first global cooldown
  at the pull puts Seal of Fury up and Holy Shield follows at 1.5 s
  ([worked example 25](#worked-examples)); without the opener Holy Shield is the first.

Max TPS against the default (C3's setup; after T2 it's +25.2 TPS, +3.1%, for 5.7% more damage taken, [T2's re-check](#tuning-the-defaults-c3); after T2's fix round +24.4 TPS, +3.0%, and +12.6 DPS, for 5.7% more): **+19.98 TPS (+4.70%, 95% CI +19.98 to +19.99)** and +10.31 DPS
(+4.46%), for 38.1 more damage taken a second (+5.6%), over 400,000 paired fights on seed 4482,
which no search used; +4.54% at 60 s and +4.82% at 300 s. Its search on its own base (seed 1,
40,000 fights) found the default's thresholds best too: around them, Consecration from 35% −0.06%
and from 45% −0.04%, Swift Judgement with 4 s −0.33%, the seal with 2 s −0.05%, Hammer of Wrath
from 20% −0.07%, and the early potion at 1,250 missing −0.08% and at 1,750 −0.19%.

### Protection defaults

| Setting | Default | Why / source |
| --- | --- | --- |
| Talents | **`50003-0530213321301551-5021`** (Holy 8 / Prot 35 / Ret 8): **the guild's lead theorycrafter's build on 1.60.1.70009's trees**, talent by talent: that build removed Improved Holy Strike ([data/talents.md](../data/talents.md#tree-versions)), and its 2 points go by measured Balanced value (D28's objective, Δ TPS % + Δ DPS %; D30's newest rule prefers no talent by name): one to Divine Strength's fifth rank, since Improved Seals' row needs 5 points above it and Divine Strength held 4 (Divine Intellect 1 in its place: −0.06% TPS and −0.15% DPS), and one to **Holy Conduit 1**, searched together with the row order and the thresholds (the paladin review's PR-1, [above](#priority-defensive-balanced-or-max-tps)): with Consecration above Holy Strike it's +0.26% TPS and +0.31% DPS over Conviction 1, and the whole change +1.67% TPS and +1.63% DPS. The 1.60.1.70009 slice first put it in **Conviction 1** on the old order, +4.90 TPS (+0.66%, 95% CI +4.77 to +5.04) and +3.54 DPS (+0.76%) against the migration's Anticipation 3 (seed 20260927, 100,000 paired fights; the search, seed 777, 40,000 fights: Holy Conduit 1 +0.07% and +0.32%, Benediction 1 +0.05% and +0.09%, Divine Intellect 1 +0.06% and +0.03%, Toughness 1 level); that build, `50003-0530213321301551-50201`, and the migration's interim `50003-0530313321301551-502` (Anticipation 3) stay decodable for saved setups. On 1.60.1.69913's trees it was **`240003-0530213321301551-502`** (Holy 9 / Prot 35 / Ret 7), **the guild's lead theorycrafter's build** (the guild's lead theorycrafter, 2026-09-24; user decision; the optimizer's result replaces it, [D30](../decisions.md#d30-the-sim-finds-the-best-talents-gear-and-rotation-itself-defaults-are-its-results-2026-09-24)): Improved Holy Strike 2, Divine Strength 4, Improved Seals 3; Redoubt 5, Precision 3, Anticipation 2, Improved SoF, Improved RF 3, Shield Spec 3, Sacred Duty 2, Swift Judgement, 1HWS 3, Templar's Bulwark, Reckoning 5, Iron Creed 5, Holy Shield; Deflection 5, Improved Judgement 2. Against T2's fix-round build, the default before it (`-0530513321301551-50215`, [below](#the-interim-talents-t2s-fix-round)): **+8.27 TPS (+1.00%, 95% CI +8.05 to +8.48)**, +0.97 DPS (+0.22%) and 13.0 more damage taken a second (+1.4%) over 100,000 paired fights on seed 20260926 (the theorycrafter's own measurement: +8.19 TPS, +0.85 DPS, +12.8 taken, seed 777, 20,000 fights). Improved Seals' +15% to every seal proc and judgement and Divine Strength's Strength are worth more than Anticipation's last three ranks, Holy Conduit and Conviction. The rotation's thresholds hold on it (seed 777, 20,000 fights: Consecration from 10, 30 or 40% −0.02% to −0.15% of TPS, rank 1 from 0% +0.02%, the seal from 2 or 3 s, Swift Judgement from 4 or 5 s and Hammer of Wrath from 10% level or worse). T2's fix-round build stays decodable for saved setups, and so do the ones before it. The popular build stays a preset: `2-4530513321301551-502`, Improved Holy Strike 2 (on 1.60.1.70009's trees the same digits are Divine Strength 2, where the preset now puts those points); Toughness 4, Redoubt 5, Precision 3, Anticipation 5, Improved SoF, Improved RF 3, Shield Spec 3, Sacred Duty 2, Swift Judgement, 1HWS 3, Templar's Bulwark, Reckoning 5, Iron Creed 5, Holy Shield; Deflection 5, Improved Judgement 2, the most popular Forever Prot build on 2026-09-22 [F] | the guild's lead theorycrafter, measured; [D29](../decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24), D30 |
| Effective-health floor | The default gear keeps an **effective-health floor** (user decision): health ÷ (1 − armor's reduction against a level-63 boss) at least 90% of v1's preset with the same talents and race, for either faction's races (a unit test holds it, `defaults.test.ts`). It reads the character sheet; no talent is kept by its name ([below](#no-talent-kept-by-name)) | user, D30 |
| Race | Human / Undead (Horde) | The default weapon is an axe (below), so Human's Sword Specialization (+2% crit, with a sword) doesn't apply, nor Dwarf's Mace Specialization; the race changes only base stats until you pick a sword or mace. Dwarf is a close choice for Stoneform |
| Weapon | **Flurry Axe** (1.5 s, the weapon's +30 spell damage) and **Draconian Aegis of the Legion** (+20 spell damage). Of the pool's spell damage one-handers, Simone's Cultivating Hammer (the gear search's pick, 46 spell damage, 1.8 s) makes 8.7 TPS and 8.1 DPS less after T2's model fixes, and the Elderwild Construction Hammer (68, 2.4 s) 22.6 TPS less: a fast weapon's swings carry Seal of Fury's flat 35 and Windfury's chances. A 1H axe, mace or sword keeps Hammer of the Righteous usable | measured (20,000 fights, seed 12345) |
| Gear | **Interim, measured** (T2; `INTERIM_GEAR` in `src/sim/defaults.ts`; the optimizer replaces it): the gear review's slot-by-slot paired search for threat from the pool (`.cache/probes/gear-review`), Lionheart Helm, Orb of the Darkmoon, Lieutenant Commander's Lamellar Shoulders, Crystalline Threaded Cape, Knight-Captain's Lamellar Breastplate and Leggings, Battleborn Armbraces, Soulforge Belt, Knight-Lieutenant's Lamellar Sabatons, Elemental Focus Band, Don Julio's Band, Weakness Analyzer, Briarwood Reed, with **Deathbone Gauntlets** in place of its Darkrune Gauntlets for the effective-health floor: 90.6% of v1's on T2's build (5,241 health, 8,512 armor, 12,993) where the search's set had 89.4%, for 8.0 TPS. On the fix round's build (no Toughness) it's 90.4% (5,241 health, 8,018 armor, 12,543). 379 Holy spell damage and 4,382 mana with the Standard raid; damage taken 905 a second (v1's preset 681 in C3's setup), defense 330, so the boss crits for 4.4%. **A Horde paladin** (Undead) can't wear the Lamellar PvP pieces, which have no Horde twin, so those four slots list a Horde pick after them (T2R-2, corrected by its verification, TV-1 and TV-2): **Premier Scaled Shoulders and Sabatons** (274233, 274226: the client's item set 2084, "Champion's Vindication", Horde's title, so the Horde twins of the Premier Chevalier pieces, and their 2-piece bonus of +23 spell damage, like the Lamellar set's), **Plate of the Shaman King** and **Premier Scaled Leggings** (274232, the same set): all plate, 794.0 TPS and 431.6 DPS at 91.9% of v1's effective health (20,000 fights, seed 12345), where the pre-raid list's survival pieces made 745 TPS at 88.8%. (Legionnaire's Plate Leggings, first picked here, are warriors' only: the pre-push check caught it, and the defaults now skip any item the class can't wear.) That's 3.6% below Alliance's 823.6; an Undead paladin in the Alliance set would make 822.8, so the gap is the gear. The first search (787.2 TPS) missed the Premier set's bonus. A mail variant with Outrider's Chain Leggings measured 799.8, but a Protection paladin in agility mail isn't what paladins wear; Premier Scaled Gauntlets in place of Deathbone would reach 813.0 at 90.3%, but the slot lists can't give only Horde a different glove while B76 holds, so the Optimizer (O2) takes that choice | measured; user's floor |
| Seal | **Seal of Fury** (SoR selectable) | [F] |
| Judgement of the Crusader | **Your own**, from the opener (row 0c): +161 Holy damage taken all fight, +84.7 TPS | user, 2026-09-24 |
| Enchants | The Prot paladin column of [buffs §6.4](../mechanics/buffs-debuffs-consumables.md#64-enchant-defaults-by-spec): Arcanum of Focus on head and legs (+8 spell damage each), Superior Defense cloak, Greater Stats, Superior Stamina bracers, Threat gloves, Greater Agility boots, **Spell Power (+30) on the weapon** and Greater Stamina on the shield. The shoulders stay empty until Zandalar is confirmed. Holy threat scales with spell damage, so the caster enchants are worth 5.4% of TPS (+22.9) in the default setup ([D29](../decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24)) | buffs doc owns the values |
| Aura | Devotion Aura, your own, kept up by the rotation; Retribution Aura with Max TPS ((30 + 0.08 × SP) × 1.6 threat per hit taken) | [F]; [D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23) |
| Rotation | **Balanced** (D28): Defensive's list, Holy Strike kept (user decision), with Exorcism, Hammer of Wrath and Consecration above it (PR-1); Defensive and Max TPS selectable | first pass (D27), [above](#priority-defensive-balanced-or-max-tps) |
| Consumables tier | The **Standard raid** preset from [buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset): Elixir of Greater Defense (Classic: Superior Defense), Elixir of Fortitude (+200 health), Elixir of Holy Power (+40 Holy), Nightfin Soup (+22 spell damage), Wizard Oil, Major Mana Potion. The Max-consumables preset adds Flask of Supreme Power, Greater Arcane Elixir, Brilliant Wizard Oil (replacing Wizard Oil) and Demonic/Dark Rune. No world buffs. Nightfin Soup and the wizard oils are the caster food and oils of [buffs §3.4 and §3.6](../mechanics/buffs-debuffs-consumables.md#34-food), in the catalogue since T2: +46 spell damage in the Standard raid (+52, worth 5.8% of TPS (+25.9) in the default setup, until 1.60.1.70009 cut Wizard Oil from +30 to +24). Wizard Oil's +24 is worth **12.4 TPS (1.7%)** and 7.3 DPS in today's default setup (seed 424242, 20,000 fights, 2026-09-24). The Standard raid's paladin-only buffs are Prayer of Spirit, Arcane Brilliance, Blessing of Wisdom and Mana Spring Totem ([buffs §6.2](../mechanics/buffs-debuffs-consumables.md#62-buffs-and-debuffs-by-preset), "Pal"): 4,382 mana with the default gear. The raid preset has no Devotion Aura (yours), Thunder Clap or Demoralizing Shout (a warrior tank's; D26), and has a raid Restoration druid's Thorns on you, as every tank's raid preset does (+15.6 TPS, 2.1%, with its caster's 200 spell damage since 1.60.1.70009, seed 424242, 20,000 fights, after PR-1; +21.8 at the Balance druid's 389 until the paladin review's PR-4; +9 TPS before 1.60.1.70009; [buffs §1.2](../mechanics/buffs-debuffs-consumables.md#12-threat-defense-and-mana)) | buffs doc owns names, values and presets |

#### The interim talents (T2's fix round)

The default from T2's fix round until the guild's lead theorycrafter's build replaced it
([above](#protection-defaults)); kept here as the record of its search. D30's survival floor then
kept Anticipation 5/5 (the optimizer has no floor since, D30), which T2's build had
traded for Conviction, so the fix round searched again (2026-09-24), by hand in the optimizer's way:
paired, same-seed runs of whole builds with `scripts/tune/rotation.mjs --spec paladin-protection
talents=<code>` (40,000 fights on seed 777), on T2's gear, rotation and buffs (before Thorns joined the tanks' raid presets, which moves each row by under 0.05 points), scored on the balanced
objective, Δ TPS % + Δ DPS % (D18, D28), against T2's build. Every candidate keeps the floor and
spends 51 points. The first rounds kept Toughness 5, the floor then; the user made it optional, and
the last rounds let the search set it. Some of the ~45 builds (the rest are in the fix round's
review log):

| Build | What changes against T2's | Δ TPS % | Δ DPS % | Objective |
| --- | --- | --- | --- | --- |
| `-0530513321301551-50215` **(adopted)** | Anticipation 5 and Holy Conduit 1 for Toughness 4 and Improved Holy Strike 2 | +0.50 | +0.95 | **+1.45** |
| `-1530513321301541-50215` | as adopted, with Toughness 1 for Iron Creed's fifth rank | +0.14 | +0.95 | +1.09 |
| `-0530513321301541-50225` | Holy Conduit 2 for Iron Creed's fifth rank | −0.21 | +1.05 | +0.84 |
| `-2530513321301531-50215` | Toughness 2, Iron Creed 3 | −0.23 | +0.95 | +0.72 |
| `-0530513321201551-50225` | Holy Conduit 2 for a rank of 1HWS | −0.25 | +0.32 | +0.07 |
| `-4530513321301511-50215` | Toughness 4, Iron Creed 1 | −0.95 | +0.95 | +0.00 |
| `2-0530513321301531-50215` | Improved Holy Strike 2 for two ranks of Iron Creed | −0.60 | +0.45 | −0.15 |
| `-5530513321301501-50215` | Toughness 5 (the earlier floor), no Iron Creed | −1.31 | +0.95 | −0.36 |
| `1-0530513321301551-50205` | Improved Holy Strike 1 for Holy Conduit | −0.48 | −0.25 | −0.73 |
| `-5530513321301511-50205` | Toughness 5, Iron Creed 1, no Holy Conduit | −1.97 | −0.17 | −2.14 |
| `-5530513321301501-5000503` | Toughness 5, Sanctified Judgement 3 for Improved Judgement | −3.19 | −1.70 | −4.89 |
| `-5530513321301551-53` | Toughness 5, Benediction 3, no Conviction | −5.46 | −5.58 | −11.04 |
| `2-4530513321301551-502` | the popular build (keeps the floor) | −3.10 | −3.67 | −6.77 |

- **Why.** Improved Judgement 2 and Conviction 5 are worth the most of the optional points (each
  build without them loses 2 to 5%). Holy Conduit's first rank makes Consecration 20% cheaper, and
  mana still limits Protection ([mana model](#mana-model)), but its second rank costs more than it
  gives. Iron Creed's ranks are worth more than Toughness's (armor only) and Improved Holy Strike's
  (a Holy Strike every 11 or 10 s, each one pushing a global cooldown's worth of something else).
- **Confirmed** on seed 20260924 (100,000 paired fights, which the search didn't use), against T2's
  build: +4.12 TPS (+0.51%, 95% CI +3.90 to +4.34), +4.07 DPS (+0.94%), and 6.1 more damage taken a
  second (Toughness's armor goes; Anticipation's defense comes). The runner-up, Toughness 1 for
  Iron Creed's fifth rank, is +0.15% and +0.94%.
- **Not searched:** Improved Seals, which needs five Holy points before it; the rotation's
  thresholds, held from T2's re-check (the optimizer, O4, searches them with the talents).

#### No talent kept by name

The optimizer keeps no talent by its name ([D30](../decisions.md#d30-the-sim-finds-the-best-talents-gear-and-rotation-itself-defaults-are-its-results-2026-09-24), user decision after O1's fifth review
round): no survival floor and no preferred filler. Improved Righteous Fury, Sacred Duty, Templar's
Bulwark, Holy Shield, Deflection, Anticipation and Toughness race like any other talent, judged by
what the screen measures them doing for the goal; a player who wants survival first picks the
**Defense** goal or sets a sheet constraint ([optimizer.md](../optimizer.md#goals)). The default
build ([Protection defaults](#protection-defaults)) stands until the optimizer's result replaces
it (O4).

#### Tuning the defaults (C3)

**T2's re-check (2026-09-24).** The threat fixes (the caster enchants, Nightfin Soup and Wizard Oil,
another paladin's Judgement of the Crusader, Seal of Fury's seal value, Holy Strike's flat damage)
and the interim gear and talents ([above](#protection-defaults)) raise the pool to 4,382 mana and
the Holy spell damage to 379, so Consecration's threshold moved: **from 20%, with rank 1 on (from
10%)**, +4.55 TPS (+0.56%, 95% CI +4.47 to +4.63) and +2.56 DPS over 100,000 paired fights on seed
9091, which the search (seed 777, 40,000 fights: 0 to 60% in steps of 5 and 10, rank 1 on and off)
didn't use; 20% alone is +0.45%. The opener ([row 0c](#forever-priority-list-default-1)) came after,
and the re-check around it (seed 777, 40,000 paired fights) holds every value: Consecration from 30%
−0.02% and from 10% −0.06%, rank 1 off −0.09%, the seal with 2 s left −0.06%, Swift Judgement with
4 s −0.55%. Hammer of the Righteous in Holy Strike's place loses 1.65%; Max TPS gains +3.1% TPS
(+25.2) for 5.7% more damage taken. The optimizer (O4) re-tunes all of them with the talents and
gear. The grid by fight length below is C3's. **After T2's fix round** (its talents and Thorns;
seed 777, 40,000 paired fights) Consecration from 20% still holds (10% level, 30% −0.06%, 40%
−0.18%; rank 1 off −0.03%), and Hammer of the Righteous in Holy Strike's place loses 0.39% of TPS
but gains 1.24% of DPS, for 4.3% more damage taken (Iron Creed's cut goes with Holy Strike): under
D23's rule for tanks, TPS first, Holy Strike stays in Defensive; D28's Balanced declines it too,
keeping Holy Strike's Iron Creed as active mitigation (user decision,
[above](#priority-defensive-balanced-or-max-tps)). The tuning below is Defensive's (and Max TPS's).

The defaults are the best rotation found on 2026-09-24 per
[D23](../decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23) and, keeping
the tank's duties, per
[D26](../decisions.md#d26-a-tanks-default-keeps-its-duties-max-tps-is-a-selectable-rotation-2026-09-23),
with the method of [warrior §5.3 "Tuning the defaults"](warrior.md#tuning-the-defaults-m25a):
paired comparisons on the real engine with
`scripts/tune/rotation.mjs --spec paladin-protection --metric tps`, the same fights for every
candidate (common random numbers), and a candidate adopted only when the 95% confidence interval
of its per-fight TPS difference lies above zero and it costs no larger share of DPS than it gains
in TPS (D18). **The search tunes only the threat abilities**: the duty, Devotion Aura, follows
D26's fixed rule ([above](#priority-defensive-balanced-or-max-tps)). **They're tuned for the
default setup**, a 3-minute fight: the Protection default setup (Human, the 2/42/7 build,
pre-raid BiS, the Standard raid buffs with a paladin's Prayer of Spirit, Arcane Brilliance,
Blessing of Wisdom, Mana Spring Totem, Elixir of Holy Power and the Major Mana Potion, without a
warrior tank's Thunder Clap or Demoralizing Shout, your own Devotion Aura, 180 s ± 10%, 20%
execute, armor 3,731, no creature type; 3,227 mana and 40 spell damage). How they fare at other
lengths is recorded below, not tuned for.

**The re-run (2026-09-24).** The first round ([below](#first-round-c3)) was tuned before
Retribution's raid buffs and the mana potion reached a paladin's Standard raid. With them, mana
binds far less, and the search moved two defaults. Against the first round's defaults
(Consecration from 90%, the seal again with 2 s left) on the new setup, the result is **+25.54 TPS
(+6.40%, 95% CI +25.48 to +25.60)**, 399.26 → 424.80, and +9.99 DPS (+4.51%), 221.38 → 231.37,
over 400,000 paired fights on seed 4481, which no search used.

- **Search** on seed 1 (40,000 fights a candidate), setting by setting with re-sweeps on top of
  each change: Consecration from 0 to 100% and rank 1 from 0 to 40%, Swift Judgement's threshold
  from 0 to 8 s, the seal's recast from 0 to 4 s, Hammer of Wrath from 0 to 40%, and the potion's
  early line from 0 to 3,000 missing and its late one from 500 to 2,500; then a joint sweep of
  Consecration, the early potion and the seal, and each finalist at 400,000 fights on seeds 5557
  and 2. Max TPS was searched the same way on its own base, and found the same values.
- **Freeze, then confirm** on seed 4481 (400,000 fights): the winner against the old defaults,
  and against itself with each change reverted in turn ("in the winner"). Each gains DPS too:

| Setting | Old → new | In the winner, Δ TPS (95% CI) | Δ DPS |
| --- | --- | --- | --- |
| `consecration.minManaPct` | 90% → 40% | +25.49 (+25.43 to +25.55) | +9.98 |
| `seal.refreshBelowSec` | 2 → 2.5 s | +0.26 (+0.23 to +0.28) | +0.11 |

- **Why they win.** Mana still limits Protection more than the global cooldown
  ([mana model](#mana-model)), but the raid's mana buffs and the potion give it enough for
  Consecration. Threat per mana in the default fight: Consecration about 1.0, Hammer of Wrath 2.4,
  Holy Shield 4.2, Judgement of Fury 4.4, Holy Strike 12.6. From 40% Consecration goes down 14.7
  times a fight instead of 8.3, and the pool now gets low enough for the potion, drunk 1.9 times a
  fight instead of 0.4; its mana is threat too (0.5 a point). Below 40% the mana does more for
  Holy Shield, the seal and, in the execute phase, Hammer of Wrath: from 30% loses 0.2%, and 35%
  and 45% lose 0.06% and 0.04% (400,000 fights). **The seal with 2.5 s left** isn't about the
  seal, which is up 99.97% of the fight either way: recasting it earlier moves the global
  cooldowns after it so that Holy Shield is recast on time more often, up 96.37% of the fight
  instead of 96.13%, with 0.09 more blocks' damage a fight. It gained 0.05% on seeds 1, 2 and 5557
  alike; 3 s loses 0.8%.
- **Held.** Swift Judgement with 4.5 s (4 s loses 0.35%; 5 s is level, −0.02 TPS): it comes off
  cooldown a minute after its last use, exactly when Judgement, every 8 s, has 4 s left, so from
  4.5 s it waits for the next Judgement and saves all 8. Hammer of Wrath from 0% (level up to 10%, 20%
  loses 0.08%). The early potion from 1,500 missing (1,250 loses 0.08%, 1,750 0.20%; 1,400 was
  level on seeds 5557 and 2), and the late one at 2,250, its most: 2,500 gains 0.02%, but above a
  setup's maximum mana it's never missing that much, as for Retribution. Consecration rank 1 stays
  off: from 35% it's level, and lower it loses up to 0.33%. Every switch on: off, Holy Shield
  loses 24%, Consecration 14%, Judgement 11%, the potion 5.9%, Holy Strike 5.6%, Hammer of Wrath
  3.2% and Swift Judgement 1.6%.
- **Robustness: Consecration's threshold by fight length and execute phase.** 40% is best, or
  within half a percent of the best, in every cell of D23's grid, and its help says so. Δ TPS %
  against 40% (seed 9153, which no search used, 100,000 paired fights each; the best in bold):

  | Fight | Execute | 20% | 30% | 50% | 60% | 70% | 80% | 90% |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 30 s | 0% | 0.00 | 0.00 | −0.00 | −0.02 | −0.18 | −0.98 | −2.61 |
  | 30 s | 10% | 0.00 | 0.00 | −0.00 | −0.04 | −0.31 | −1.20 | −2.76 |
  | 30 s | 20% | 0.00 | 0.00 | −0.00 | −0.06 | −0.40 | −1.35 | −2.92 |
  | 45 s | 0% | **+0.02** | **+0.02** | −0.51 | −0.91 | −1.60 | −2.78 | −4.41 |
  | 45 s | 10% | **+0.07** | **+0.07** | −0.47 | −1.13 | −2.04 | −3.13 | −4.69 |
  | 45 s | 20% | **+0.05** | **+0.05** | −0.73 | −1.95 | −3.27 | −4.67 | −6.22 |
  | 60 s | 0% | **+0.06** | **+0.06** | −1.17 | −2.65 | −3.64 | −4.82 | −6.12 |
  | 60 s | 10% | **+0.09** | **+0.09** | −0.63 | −2.22 | −4.02 | −5.25 | −6.50 |
  | 60 s | 20% | −0.02 | −0.02 | −0.31 | −1.64 | −3.66 | −5.52 | −6.94 |
  | 90 s | 0% | **+0.05** | **+0.05** | −1.17 | −4.49 | −5.65 | −6.54 | −7.46 |
  | 90 s | 10% | +0.01 | **+0.02** | −0.80 | −3.37 | −5.30 | −6.50 | −7.41 |
  | 90 s | 20% | −0.02 | **+0.02** | −0.69 | −2.97 | −5.15 | −6.79 | −7.88 |
  | 180 s | 0% | **+0.48** | **+0.48** | −1.09 | −3.22 | −4.10 | −6.33 | −7.14 |
  | 180 s | 10% | −0.22 | **+0.20** | −0.54 | −1.77 | −3.35 | −6.12 | −7.10 |
  | 180 s | 20% | −0.82 | −0.18 | −0.14 | −0.70 | −1.88 | −4.64 | −6.01 |
  | 300 s | 0% | −0.42 | **+0.28** | −0.67 | −2.21 | −3.12 | −4.99 | −6.36 |
  | 300 s | 10% | −1.20 | −0.12 | −0.18 | −0.80 | −1.90 | −4.16 | −5.85 |
  | 300 s | 20% | −1.38 | −0.37 | **+0.18** | +0.14 | −0.49 | −2.27 | −3.86 |

  Where no cell is bold, 40% is the best. The first round's 90% loses 2.6 to 7.9% everywhere.
- **Settings the default setup doesn't use**, under D23's rule for them (on a fresh seed, an
  interval above zero in every cell of the grid where it acts):
  - **On-use trinkets and Juju Flurry**, on against off (seed 8675310, 20,000 paired fights a
    cell): Weakness Analyzer worn in place of Smotts' Compass gains +0.61 to +0.65% at 30 s, down
    to +0.25 to +0.26% from 90 s on, and Juju Flurry selected in Buffs +0.85 to +0.94% at 30 s and
    +0.46 to +0.63% elsewhere. All 36 intervals lie above zero, so both stay on.
  - **Exorcism's threshold**, against Undead (seed 6161, 40,000 fights a cell): every threshold
    above 0% loses where it acts (20% up to 0.27%, 40% up to 2.2%), so 0% stays.
  - **The rune's pair** isn't tuned: no Protection preset but Max consumables brings a rune. It
    keeps Retribution's values.
- **Knowing the fight's end.** The early potion line drinks only while another will be ready
  before the fight ends, which the sim knows exactly and a player has to judge; the results list
  it (`knownFightEnd`). With the default setup (seed 7374, 100,000 paired fights), judging its two
  minutes 10 or 20 s off costs up to 0.51% (140 s judged: −0.51%; 100 s: −0.09%).
- **Not adopted.** Seal of Righteousness (35 + 0.85 × 18.80 × speed a swing, read as Seal of Fury's
  is, [above](#seal-of-righteousness-sor)) loses 5.0% of TPS with the default 1.5 s axe on T2's talents (−40.4 TPS,
  −12.6 DPS; 3.9% on the fix round's, −32.0 TPS) and 4.4% with a 2.8 s one-hander (the Ravenholdt Slicer), where it has no absorb and so
  no Improved Seal of Fury mana: it wins only with a two-hander (+3.1% against Seal of Fury with the
  Retribution default's), which leaves no hand for a shield, so no Holy Shield, and far less threat
  (587 TPS against the default's 811). T2's setup, 20,000 fights on seed 777; before its proc had
  Forever's flat 35 it lost 11.2% with the axe.

##### First round (C3)

Before Retribution's raid buffs reached a paladin (2,717 mana, no spell damage, no potion),
against the documented priority (Consecration from 20%, Swift Judgement with at least 4 s left,
the seal recast with 1.5 s left): **+29.39 TPS (+8.83%, 95% CI +29.32 to +29.45)**, 332.82 →
362.21, and +11.76 DPS (+6.09%), over 400,000 paired fights on seed 7331. In the winner:
Consecration from 90% +28.85 TPS, Swift Judgement with 4.5 s +1.15, and the seal with 2 s +0.45.
Mana bound hard then: Consecration waited for 90%, which put it down at the pull and seldom
after, and left the mana to Holy Shield, the seal and Hammer of Wrath. The re-run above replaces
its Consecration and seal values; Swift Judgement's held.

---

## Implementation notes

- **Damage-seal procs (SoC, SoR, SoF) are triggered by landed main-hand auto attacks only**
  (`ProcTypeMask 0x4`) [F] [client] (SpellAuraOptions, 1.60.1.70009). Holy Strike, HotR,
  judgements and spells never proc them.
  Windfury, Reckoning, Hand of Justice and other item extra attacks do. SoC's 1 s ICD is per
  paladin.
- **Order inside one white hit** (single tick): resolve the white swing, then Vengeance and
  Vindication triggers, then the seal procs of the current seal plus a pending echo, then
  JotC refresh. The SoC proc spell rolls its own hit table. SoR/SoF procs can't miss.
- **Spell batching / "twist within 0.4 s"**: the sim doesn't model batching. Twist of Light
  makes batching irrelevant for Forever twisting. Hand-off to
  [damage-and-timing.md](../mechanics/damage-and-timing.md).
- **Judgement debuff exclusivity**: store `activeJudgementDebuff[paladinId][targetId]`.
  Applying a debuff judgement replaces your previous one. Damage judgements don't touch it.
- **Holy Strike/HotR shared cooldown**: model as a category timer set to the cast spell's
  cooldown after talents.
- **Sanctified Judgement**: grant mana when the Judgement lands [?] (on a missed JoR or JoF,
  assume no refund; JoC can't miss). Use the seal's base cost.
- **Judgement miss rolls**: JoR and JoF roll the melee special miss chance, then crit on a
  landed one (two rolls, no weapon damage); JoC and the debuff judgements skip the miss roll
  (Always Hit).
- **Level scaling**: store per-rank `base`, `variance`, `perLevel`, `baseLevel`,
  `maxLevel` from the spell data, so the numbers at 60 follow the formula in
  [Conventions](#conventions-used-below).
- Touch of the Grave (Undead) is simulated with a `[?]` default: 5% of maximum health as Shadow
  damage a proc, from every damaging attack or spell that lands (seal procs and Holy Shield's damage
  fire no procs, so not them), with damage threat and its heal's healing threat (0.5 a point, not
  a paladin spell's ×0.25, and no Righteous Fury), +2.3% of the default Protection paladin's TPS
  as Undead
  ([character-stats](../mechanics/character-stats.md#touch-of-the-grave)).
- Skipped (under 0.5%): SotC's own
  attack-speed swap during the 1.5 s pre-pull, Eye for an Eye, the damage the Seal of Fury absorb
  takes off a hit (tank survival only; its mana is modelled), JoW/JoL healing and mana to others.

### How the engine does it

The class foundation (`src/sim/classes/paladin/`) and the engine's generic spells and mana
(`src/sim/engine/sim.ts`; [combat-tables §3 "Defense type"](../mechanics/combat-tables.md#3-special-yellow-attacks)):

- **Spells.** Every damaging paladin spell is a row of data (`spells.ts`): school, damage class
  (`SpellCategories.DefenseType`), No Active Defense, Always Hit, base range (or weapon share),
  SP coefficient, its own damage and threat multipliers, its share of JotC's bonus, and whether it
  triggers procs. One engine function rolls the right table, deals the damage and threat, and fires
  on-hit and crit procs unless the spell triggers none (a triggered spell without NOT_A_PROC:
  [conventions](#conventions-used-below)). The numbers and attributes are the client's, checked by
  `data.test.ts`. With no main-hand weapon, the melee- and ranged-class spells (the judgements,
  Hammer of Wrath) still roll the special table, unarmed: skill 5 × level and no weapon bonuses
  [?]; Holy Strike, which deals weapon damage, isn't used.
- **Seals** are casts that put an aura up; seals form an exclusive group, so a new one ends the
  old. Each damage seal's proc is a proc on landed main-hand auto attacks (white swings and
  extra attacks) that rolls only while its seal is up, and fires **after** the swing's own procs,
  so a white crit's Vengeance stack counts for the seal's proc (this section's order). A seal's
  proc has its own breakdown row (`sealOfCommandProc`), apart from the seal's cast in "Cooldowns
  and buffs" (`sealOfCommand`, with its uptime).
- **Judgement** is one row per seal (Judgement of Command, of Righteousness, of Fury, of the
  Crusader), all in one cooldown category, so judging any of them starts the cooldown for all.
  A rotation line judges only while its seal is up, and the seal stays up. Damage judgements are
  spells; Judgement of the Crusader puts its debuff on the target (the judgement debuffs are an
  exclusive group too), and your landed auto attacks restart its 40 s while it's up.
  Sanctified Judgement's mana comes when the judgement lands.
- **Consecration's ticks** come from its cast: one tick spell a second for 8 s, each with its own
  rolls. Recast on its 8 s cooldown, the old cast's 8th tick is due at the moment of the recast:
  it lands first, then the new cast's ticks start, the tie-break Rend's refresh uses
  ([damage-and-timing §4 "Refresh"](../mechanics/damage-and-timing.md#4-dots-and-bleeds)) [?].
  So every cast deals all 8 ticks.
- **Mana** is the engine's one mana model, the druid's too
  ([character-stats.md](../mechanics/character-stats.md#spirit-and-mana-regeneration),
  [architecture](../architecture.md#the-event-loop)). A paladin row pays its cost in tenths from
  `resource: 'mana'`, which starts the five-second rule. The plan's `ManaPlan` (`setup.ts`
  `paladinManaPlan`) is the sheet's maximum mana, spirit regeneration `15 + Spirit / 5` per tick
  and the rule, plus the two fields only the paladin sets: mp5 × 2/5 per tick, and Reverence's
  share of the spirit regeneration inside the rule. The player-global power tick adds them every
  2 s. The rotation's mana threshold is condition `minMana` (code 18). Mana a spell effect returns
  (Sanctified Judgement, Shield Specialization) goes through the same pool and makes 0.5 threat per
  mana. The paladin has no rage pool, so its white hits and hits taken give no rage and none of
  the rage assumptions apply.
- **Righteous Fury** is up for the whole fight when the spec fights with it (Protection) and
  down otherwise (Retribution): ×1.6 on Holy threat, Improved Righteous Fury's damage taken
  with it, and Instrument of Law's ×0.8 on all threat without it.
- **Talents** are effects (Divine Strength, Conviction, Two-Handed Weapon Specialization,
  Vengeance, Vindication, Champion of the Light, …) or changes to the ability and spell rows
  (Benediction, Holy Conduit, Twist of Light's seal cost, Improved Judgement, Improved Seals,
  Sanctified Judgement, Sacred Arbiter, Iron Creed, Holy Power's crit, Purifying Power, Instrument
  of Law's cast time). Vengeance's stack comes from any non-periodic crit that triggers procs:
  white, special, Seal of Command's proc, judgement or spell (a periodic tick fires only its tick
  procs, never a crit's).
- **The core both specs share** (`setup.ts` `paladinCore`): the spec's seal (Seal of Command or
  Seal of Fury) 1.5 s before the pull and recast when it has 1.5 s left, and its judgement
  whenever Judgement is ready. Each spec's own rows and settings build on it: Retribution's in
  `retribution.ts`, Protection's in `protection.ts` (below).
- **Retribution** (`retribution.ts`) builds the [priority list](#forever-priority-list-default)
  from its settings. Abilities 0 and 1 are the main seal and its judgement, as in the core; each
  ability is resolved with the build's talents and the Judgement of the Crusader rule before its
  cost or spell feeds anything. Row 0 puts Seal of the Crusader up before the pull. Rows 1 and 2
  read "Seal of the Crusader is down" and "the debuff is up or down" on each walk (the engine's
  `abilityAuraDown`), so the main seal never replaces Seal of the Crusader before its judgement.
  Hammer of Wrath is in the list only with an execute phase, and Exorcism only against Undead and
  Demons. A mana threshold is `minMana` at its share of the plan's maximum mana, and the potion and
  rune wait for `maxMana` at the maximum minus their setting. They're casts off the GCD that
  restore their roll at once: 13,500 + a whole 0…9,000 tenths from the proc stream for the potion,
  9,000 + 0…6,000 for a rune (buffs doc §3.5), each on its item's own 2 min cooldown. These lines,
  and the on-use trinkets' and Juju Flurry's, are one implementation both specs use
  (`consumables.ts`).
- **Consecration's ranks share one cooldown**, as every rank of a spell does [C]: rank 5 and rank 1
  are one category.
- **Protection** (`protection.ts`, [Protection: model and rotation](#protection-model-and-rotation)):
  - **Righteous Fury** is a `cast` 4.5 s before the pull, whose buff has no mods: its ×1.6 Holy
    threat is the plan's for the whole fight, and the buff lets the results list it up all fight.
    The Rotation tab names it in the pinned **Before the pull** row, whose help says it stays up
    all fight; it has no switch and no fixed row of its own.
  - **Holy Shield** is a `cast` whose buff has +20% block and 4 block charges, the tank core's
    `blockCharges` ([combat-tables §8](../mechanics/combat-tables.md#8-boss--player-tanks)): each
    block uses one after its procs, so the 4th block still deals the damage. The damage is a proc on
    the block trigger while the buff is up, casting a spell that always lands and can't crit
    (`cannotCrit`, which rolls no crit on any table), with its 20% threat in the spell's threat
    multiplier. The results show the boss's table with it up too (`bossTableUp`), with its uptime.
  - **Hammer of Wrath's cast** stops the swing timers (`castStopsSwings`, Slam's rule) and holds
    every other line until it ends (`castHoldsOffGcd`): the walk stops when the cast starts and
    starts again at its end, so an off-GCD Judgement that comes ready during it waits. An extra
    attack granted during the cast (Reckoning's) swings when it ends. Its note is its own
    (`hammerOfWrathCast`), not Slam's.
  - **Iron Creed**'s buff is the Holy Strike row's aura: a `spell` ability with an aura puts it on
    you when its spell lands, −2% damage taken a rank for 6 s.
  - **Swift Judgement** is a `cast` off the GCD whose `endsCooldownOf` ends its judgement's
    cooldown, the category's too, and whose buff is the plan's free-cast aura, Clearcasting's
    path ([druid.md §2.7](druid.md#27-omen-of-clarity-and-clearcasting)), so the judgement it
    frees costs nothing and uses it up.
  - **Seal of Fury's absorb** is an aura a proc on each landed white swing puts up, with a shield,
    while Seal of Fury is up. A hit that costs health uses it up (`takenCharges`), after the
    damage-taken procs, one of which is **Improved Seal of Fury**'s mana: a flat 60 raised by the
    boss's level (`manaFlat`, 87 against level 63). As with block charges, only an absorb up before
    the hit's procs pays; one they put up keeps its charge. A breakdown row counts the mana its
    effects gave (Improved Seal of Fury, Shield Specialization), which the results show a fight.
  - **Swift Judgement**'s `endsCooldownOf` never readies an ability that can't be used again (one
    used up, or needing a weapon the setup lacks, ready at Infinity).
  - **Reckoning** is two procs on the boss's swings, 8% a rank on a block and 20% a rank on a crit
    taken, each an extra main-hand attack the tank core swings at once. **Redoubt** is a 10% proc on
    each landed swing taken, an aura of +6% block a rank with 5 block charges.
  - **Naglering's thorns** (an item: 15438, 3 Arcane to each attacker that hits you) is a damage
    shield like Retribution Aura's: a proc on each of the boss's swings that lands on you, always
    landing and never critting [?], Arcane, so without Righteous Fury (`src/sim/effects/items.ts`).
  - **The aura** is a `cast` 3 s before the pull, in one exclusive group: **Devotion Aura**'s
    +735 armor, which the plan counts once with the Buffs tab's (`maintainedBuffs`), or
    **Retribution Aura**, whose damage is a proc on each landed swing taken while it's up.
- **Base stats** follow [character-stats](../mechanics/character-stats.md#paladin-and-druid-base-attributes):
  the attributes, base health, dodge and crits are all [?] placeholders under
  [D24](../decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23), kept with the
  druid's in `BASE_PLACEHOLDERS` (`src/sim/stats/base-stats.ts`), which the results list on the
  sheet and in the assumptions (`baseStatPlaceholders`).
- **Not modelled yet:** Twist of Light and seal twisting (row 9, off by default), Hammer of the
  Righteous's extra targets (M6), Holy Wrath, Sacred Arbiter's judgement refresh (your auto attacks already keep
  Judgement of the Crusader up), the utility seals, another paladin's Judgement of Wisdom, a
  Protection paladin's judgement debuff for the raid (Wisdom or Light), a rune's health cost, and
  the T1 5-piece's −0.5 s Judgement. For a tank: Judgement of Fury's taunt (no threat while you
  hold the boss), the damage Seal of Fury's absorb takes off a hit, Templar's Bulwark, Divine
  Protection and Eye for an Eye. Blessing of Wisdom and Mana Spring Totem are in the buff
  catalogue, for paladins only ([buffs doc](../mechanics/buffs-debuffs-consumables.md#class-only-entries)).

---

## Worked examples

Assumptions unless stated: level 60 vs a level-63 boss; hits land, no crit; no buffs; 2H
weapon **3.50 speed, 200–300 damage (average 250)**; **AP 1200**; **SP 100**. Numbers use
the defaults marked [?] above, so a test failing after a beta measurement means the default
changed, not a bug. Every example runs through the engine in
`src/sim/classes/paladin/paladin.test.ts`, except 12 (Holy Shield), which runs in
`protection.test.ts` with Protection's rows, 17 (Twist of Light), which comes with seal
twisting, and 20–22 (the Retribution rotation), which run in `retribution.test.ts` on the
default setup.

1. **SoC proc chance.** `7 × 3.5 / 60 = 0.40833` per landed white hit. With 10% haste the
   chance is still 0.40833 per hit; only the swing count rises.
2. **SoC proc damage.** `0.70 × (weapon + 1200 × 3.5 / 14 + 0.29 × 100)` =
   0.70 × (w + 300 + 29): min w=200 → **370.3**, average w=250 → **405.3**, max w=300 →
   **440.3**. With Improved Seals 3/3: ×1.15 → average **466.09**. Crit: ×2 → 932.18.
   Two-Handed Weapon Specialization must **not** change it. (The alternative with SP
   outside the 70% gives an average of 414.0 before talents.)
3. **Judgement of Command** (`forever` profile; target not stunned): (339..373)/2 → average
   178 + 0.429 × 100 = **220.9**; ×1.15 = **254.04**. Crit ×2. Can't miss (Always Hit on
   20966), be dodged, parried or blocked, so its expected damage carries no miss factor, unlike
   JoR's in example 4. (`classicEra`: magic class, spell hit and ×1.5 crit.)
4. **Judgement of Righteousness r8 at 60**: (162..178) + 8 → average 178 + 0.5 × 100 =
   **228**; ×1.15 = **262.2**.
5. **Holy Strike r8** (1.60.1.70009's 50%), its tooltip's reading: normalized MH = 250 + 1200 ×
   3.3 / 14 = 532.857; × 0.50 = 266.429; + 93 (average of 81.375..104.625) = 359.429; + 0.429 × 100
   = **402.33**; Sacred Arbiter ×1.20 = **482.79**. Range with Sacred Arbiter and a 200–300 weapon:
   **438.84–526.74**. Holy school: boss armor doesn't reduce it. (The other reading, 0.50 ×
   (532.857 + 93) + 42.9, is 355.83: [open question 6](#open-questions).)
6. **SoR proc, 2H, r8 at 60**: 35 + 1.2 × 18.80 × 3.5 = 113.96 + 0.1 × 100 = **123.96**; ×1.15 =
   **142.55**. Same weapon 1H-style (0.85): 35 + 55.93 + 10 = 100.93.
7. **Consecration r5, SP 300, one target**: per tick 12 + 27 + 0.095 × 300 = **67.5**; 8 ticks
   = **540**. A fifth enemy takes only 12 per tick = **96**. Rank 1 on one target: 8 × (2 +
   4 + 28.5) = **276** for 135 mana.
8. **Retribution mana cycle** (Benediction 5/5, Sanctified Judgement 3/3, Improved Judgement
   2/2; Holy Strike every 10 s, 1.60.1.70009's baseline): Judgement = floor(1512 × 0.06) = 90 →
   ×0.9 = **81**; return 0.6 × 210 = **126** → **+45** per SoC judgement. SoC recast 189. Over
   30 s: 189 + 3 × 18 − 3.75 × 45 = **74.25 mana** (2.475 mana/s). With Twist of Light's −20% on
   the seal, added to Benediction's −10% [?]: SoC 210 × 0.7 = 147, and **32.25 mana** (1.075
   mana/s); Sanctified Judgement still returns 60% of the base 210.
9. **Damage multiplier stack on a white hit** with 2HWS 3/3 and Vengeance 3/3 at its 3 stacks
   (1.60.1.70009: 2HWS 6%, Vengeance 3 stacks): 1.06 × 1.09 = **×1.1554**. On a SoC
   proc (Holy): 1.15 (Improved Seals) × 1.09 = **×1.2535**.
10. **Hammer of Wrath r3, SP 300**: 498 + 128.7 = **626.7** average; with Instrument of Law
    2/2 it's instant with a 1.0 s GCD.
11. **JotC on Exorcism (default coefficient rule)**: +161 × 0.429 = **+69.07** per Exorcism.
    On a SoC proc: 161 × 0.203 = +32.68, added after your own damage multipliers and before a
    crit's.
12. **Protection Holy Shield, SP 300**: 221 + 0.08 × 300 = **245** damage per block; threat
    245 × 1.6 × 1.2 = **470.4** (additive-modifier alternative: 245 × 1.8 = 441). After
    4 blocks the buff ends even if 10 s haven't passed.
13. **Seal of Fury, SP 300, a 2.7 s one-hander**: 35 + 0.85 × 16.91 × 2.7 (38.81) + 30 = **103.81**
    Holy per landed white hit; threat × 1.6 = **166.10**; absorb 51.90 with a shield. With the default
    1.5 s axe and no SP: 35 + 21.56 = **56.56**. Judgement of Fury at 60: average 160 +
    0.45 × 300 = **295** (the default Prot build has no Improved Seals; with it,
    ×1.15 = 339.25).
14. **Holy Strike threat (Prot)**: a 300-damage Holy Strike → 300 × 1.6 × 1.25 = **600**.
15. **Shield Specialization**: with 6000 max mana, blocks at t = 0, 1, 2 and 3 s restore
    360 mana at 0 and 3 s only, 720 in all: the blocks at 1 and 2 s fall inside the 3 s ICD, and
    at exactly 3 s it has ended.
16. **SoC ICD with Windfury**: a white hit at t = 0 procs SoC; the Windfury extra attack at
    t = 0 can't proc SoC (ICD until t = 1.0). The next white hit at t = 3.5 can.
17. **Twist of Light**: SoC active; cast SoR at t = 10.0; the white hit at t = 10.6 applies
    SoR's proc **and** rolls SoC at 40.83% (ICD permitting), then the Echo is gone. The
    white hit at t = 14.1 applies SoR only.
18. **Judgement doesn't consume the seal**: SoC active with 20 s left; Judgement at t → the
    SoC aura still has 20 s left, and a white hit at t + 0.5 can proc SoC.
19. **Vengeance ramp (3/3)**: crits at t = 0, 5, 8 → 3 stacks, its most since 1.60.1.70009, =
    +9% Physical/Holy until t = 38; a fourth crit only refreshes it; no crit after that → the buff
    drops at t = 38.
20. **The Retribution opener** (the default build and settings): Seal of the Crusader at
    t = −1.5 s, free. At t = 0, Judgement of the Crusader (81 mana; Sanctified Judgement 3/3
    returns 60% of the seal's 160 = 96, capped at the maximum), then Seal of Command (147 mana
    with Twist of Light, a GCD). Judgement's 8 s cooldown started at 0, so the first Judgement of Command is at 8 s.
    Seal of the Crusader and its judgement come once a fight: every landed auto attack restarts
    the debuff's 40 s.
21. **Mana thresholds** are shares of maximum mana, in tenths: at the default setup's 3,422
    maximum mana (Divine Intellect 1), "Consecration from 20%" needs 684.4 mana (6,844 tenths)
    and "rank 1 from 10%" 342.2 (3,422). A Major Mana Potion "early, when missing 1,500" goes at
    1,922 mana or less (19,220) while the fight has at least 2 minutes left; "when missing 2,250",
    at 1,172 or less (11,720).
22. **Major Mana Potion**: 1800 mana with variance 0.5, so 1,350–2,250, drawn as 13,500 + a
    whole 0…9,000 tenths, at most every 2 minutes. Early (missing 1,500, with 2 minutes left) up to
    750 of it can be lost to the cap; after that it waits until it's missing 2,250, so none is. A
    Demonic or Dark Rune: 900–1,500, its own 2 minute cooldown.

23. **Judgement of the Crusader on a Protection paladin's hits**: each landed Judgement of Fury gets
    161 × 0.45 = **+72.45** (a crit ×2: +144.9), each Seal of Fury proc 161 × 0.1 = **+16.1**, after
    your own damage multipliers; with the flat rule, +161 each. Runs in `protection.test.ts`.
24. **Hammer of the Righteous**, a 150-damage one-hander of 2.7 s speed and 1,200 attack power:
    3 × (150 + 1,200 / 14 × 2.7) / 2.7 = **423.81** Holy, threat ×1.6 = 678.10; weapon only,
    3 × 150 / 2.7 = **166.67**. Runs in `protection.test.ts`.
25. **The Protection opener** (the default settings): Devotion Aura at −4.5 s, Righteous Fury at
    −3 s, Seal of the Crusader at −1.5 s, all free. At 0: Judgement of the Crusader (off the GCD,
    90 mana), which starts Judgement's 8 s cooldown; then Seal of Fury on the first GCD; Swift
    Judgement at once, since Judgement has 8 s of cooldown left, and Judgement of Fury, free; Holy
    Shield at 1.5 s. Runs in `protection.test.ts`.

---

## Open questions

Each needs an in-game test on the Forever beta. Record the results in this doc with build,
date, method and sample size ([doctrine §2](../doctrine.md#2-where-numbers-come-from-non-negotiable)).

1. **SoC proc rate**: 7 PPM ([C] community) or 6.8 (forum claim)? *Test:* 1000+ white swings
   with a known-speed weapon on mobs three levels above you (the beta has no target dummies);
   procs ÷ landed white hits vs 7×speed/60.
   Also confirm base speed rather than hasted speed (repeat with a haste effect).
2. **SoC proc SP scaling**: is it 0.29 × SP inside the 70% (effective 0.203) or 0.29 on
   top? *Test:* average non-crit proc with and without a +100 spell damage item.
3. **SoC proc avoidance**: can procs be dodged or parried, and do they partially resist?
   *Test:* combat log on a mob attacked from the front.
4. **SoR formula**: per-hit damage vs weapon speed and SP, 1H and 2H, whether Forever's flat 35
   is added to the seal value (the sim's reading, [open question 10](#open-questions)), and whether a
   `+0.03 × weapon average ±1` term exists (that term is from TBC-era wiki text, so it's
   forbidden to adopt without a beta test). *Test:* two 2H weapons of different speed and
   one 1H, with no SP; then +SP.
5. **JotC interaction**: flat +161 per Holy hit, or scaled by each spell's coefficient? And
   does it come after your own damage multipliers (the sim's default) or before them?
   *Test:* JoC and SoC-proc damage with and without your JotC on a mob, then again with
   Vengeance stacked. This is the biggest single uncertainty for Ret DPS.
6. **Holy Strike formula**: is the flat 81–105 multiplied by 50% (40% before 1.60.1.70009), and is
   the 0.429 SP added in full? The sim follows the tooltip: 0.5 × normalized weapon + 81–105 +
   0.429 × SP [?]; the scaled reading, 0.4 × (weapon + 81–105) at 40%, was 10.6 TPS less in the
   review's setup. *Test (guild
   test T2):* 50+ non-crit Holy Strikes with no spell damage and a known attack power; compare with
   0.5 × (normalized weapon + 93) and 0.5 × normalized weapon + 93; then again at +100 spell damage
   (is the 0.429 full, or × 0.5?).
7. **Judgement of Command SP**: is the coefficient halved with the base when the target
   isn't stunned? *Test:* JoC on a mob with and without +SP.
8. **Redoubt proc chance** per rank (10% flat per the tooltips vs 2%/rank per the trait
   curve)? *Test:* count Redoubt procs per melee hit taken at 1–5 ranks. The sim uses 10% at
   every rank; at the default 5/5 both readings agree, so no default moves. Without Redoubt the
   default Protection setup makes 7.5% less TPS: its blocks feed Holy Shield and Shield
   Specialization.
9. **Reckoning** extra-attack stacking cap and block-trigger rate. *Test:* block-heavy
   tanking log. The sim swings each at once, so in combat no stack builds (one given during Hammer
   of Wrath's cast swings when the cast ends); without Reckoning the default Protection setup makes
   2.8% less TPS.
10. **Seal of Fury**: flat 35 or weapon-speed scaled (the aura holds an SoR-style value)? The sim
    adds the seal value by SoR's rule to the 35 [?] (`35 + 0.85 × 16.91 × speed` one-handed,
    [Seal of Fury](#seal-of-fury-sof-new-the-protection-seal)): +27.2 TPS in the default setup
    against the flat 35. *Test (guild test T1):* 200+ auto hits with Seal of Fury and no spell damage
    with a 1.5 s one-hander, then a 2.6–2.8 s one: about 35 both times means flat; more on the slow
    weapon, the seal value applies (by how much says whether it's on top of the 35 or in its place).
    Seal of Righteousness's proc 25713 carries the same base 35 in Forever (Classic Era's had 0), so the
    sim reads it the same way, 35 plus its seal value (`35 + 0.85 × 18.80 × speed` one-handed): T1 on
    Seal of Righteousness settles that too.
    Absorb stacking? Improved Seal of Fury's actual mana return ("restore 0 Mana")? The client's
    rank text reads 60 (0 + 1 a level) [F]. The sim keeps one absorb, which each proc replaces and
    the next hit that costs you health uses up (at most the seal's 30 s), restoring 87 mana against
    a level-63 boss; the absorb isn't taken off the hit. Without Improved Seal of Fury the default
    Protection setup makes 16.5% less TPS, short of mana ([mana model](#mana-model)); if every hit
    taken while an absorb exists restored mana (the absorb never used up), it would make 2.0% more.
    *Test:* mana per boss hit taken with Seal of Fury up, with and without Improved Seal of Fury,
    and whether two boss hits between two of your swings both restore it.
11. **Hammer of the Righteous**: target count (3 or 4 in total?), whether "weapon DPS"
    includes AP, avoidance, and whether its SP coefficient is really 0. The sim counts attack power
    [?] (Character → Advanced switches it off), rolls the full table in two rolls, and gives it no
    spell damage; it's off by default, as Holy Strike makes more threat on one target. With the
    default Flurry Axe and 1,034 attack power: 3 × (53 + 1,034 / 14 × 1.5) / 1.5 = 328 with it, 106
    without. *Test (guild test T3):* 50 non-crit Hammer of the Righteous casts with Blessing of Might
    on and off: does the damage move with attack power?
12. **Sanctified Judgement**: base or modified seal cost; refund on a missed JoR or JoF?
13. **Seal of Wisdom / Judgement of Wisdom** proc rates in Forever.
14. **Level-based partial resists** on melee-class Holy (SoC, judgements, Holy Strike) vs a
    level-63 target. See [combat-tables.md](../mechanics/combat-tables.md).
15. **Touch of the Grave** (Undead) drain amount, school and threat. Modelled as 5% of maximum
    health as Shadow damage, damage threat and its heal's healing threat (0.5 a point, all of it
    effective), neither with Righteous Fury [?]
    ([open-questions B52](../open-questions.md#b52-touch-of-the-grave)).
16. **Righteous Fury and healing threat**; Holy Shield's 20% additive vs multiplicative with
    RF ([threat.md](../mechanics/threat.md)); **whether Holy Shield's block damage can miss or
    crit**. Righteous Fury is ×1.6 since 1.60.1.70009, so the two readings are ×1.92 and ×1.8. The
    client marks Holy Shield (20928) magic, DefenseType 1 [F] [client] (SpellCategories,
    1.60.1.70009), which would give its damage the spell table. The sim multiplies (×1.92) and has
    the damage always land and never crit [?]: the damage is the buff's aura effect (43), with no
    damage spell of its own, and the sim reads 20928's table as its cast's, on yourself
    ([Other abilities](#other-abilities)). Holy Shield's damage was 28% of the default Protection
    TPS in C3's setup (2026-09-23): additive (×2.1) would have cost about 2.2% of TPS, a miss on the
    spell table (14% for the default build against a boss) about 3.9%, and a crit at spell crit
    would have added about 0.7%. After T2's fix round it's 13% of TPS, so each is about half that
    (the milestones' known gap P9).
    *Test (guild test T6):* Holy Shield's damage events against a boss (misses, crits), and the
    threat of each block ÷ its damage: 1.92 means multiplied, 1.80 additive; count misses over 100
    blocks.
17. **Seal of the Crusader AP at 60**: 306 or 325? The client value is settled: 306 + 2.4 per
    level over levels 52–60 [F] [client] (SpellEffect, SpellLevels, 1.60.1.70009). Whether the
    server applies the per-level term is the in-game question. *Test:* at level 60, sheet AP
    with and without SotC.
18. **Consecration ticks**: does each tick roll spell hit and crit separately (Forever
    periodic crits)? Which 4 targets count as "first to enter" on a multi-mob pull? *Test (guild test
    T7):* count missed Consecration ticks over 300+ on a mob three levels above you.
19. **Spell modifier stacking** (Benediction + Holy Conduit): additive or multiplicative?
20. **Vindication proc chance** (data reads 100% on melee damage).
21. ✅ **Resolved from client data** ([client.md][client]). The DB2-derived values this doc
    relies on that foreverchanges doesn't show were all confirmed in the raw client files,
    build 1.60.1.69913: SoC proc 0.29 coefficient and 1 s ICD (20424, 20920); JoC 0.429 and
    the melee/No Active Defense attributes (20966, 20968); JoR 0.5 (20286); JotC Always Hit and
    40 s (20303); SoR proc 0.1 and attributes (25713); SoF proc 35 at 0.1 and JoF 0.45 (20418,
    20414); Holy Strike effects and 0.429, category 2404 with 12 s (10333); HotR category 2404
    with 6 s (407632); Consecration tick split 12 + 27 at 0.095 (1280349); Holy Shield 4
    charges and 0.08 (20928); Vengeance stack 5, 30 s (20050); 2HWS/1HWS Physical-only school
    mask (20111, 20196); Improved Seals spell masks (20224); seal-aura proc masks 0x4 vs 0x14.
    **One correction:** JoC's damage spell 20966 also carries Always Hit, so JoC can't miss
    ([Seal of Command](#seal-of-command-soc); in game: question 23). The check against
    1.60.1.70009 found the build's changes and nothing else: Holy Strike's 50% and 10 s, Vengeance's
    3 stacks and Righteous Fury's 60 ([what changed](#changes-in-160170009)).
22. **Which spells trigger procs, and minor mechanics.** The sim follows the client's
    NOT_A_PROC attribute ([conventions](#conventions-used-below)): SoC's proc and the damage
    judgements trigger on-hit and crit procs (Windfury, Crusader, Hand of Justice, Vengeance,
    Vindication); SoR's and SoF's procs and Consecration's ticks trigger none [?], but Vengeance.
    Vengeance's own aura (20049) carries Attr3 `0x4000000`, Can Proc From Procs: the flag lets
    triggered spells *without* NOT_A_PROC proc it (those with it proc everything anyway), so SoR's and
    SoF's proc crits give stacks too, as SoC's do [?]. Consecration's ticks, which also lack NOT_A_PROC,
    are a periodic aura's (20924's aura 23 triggering 1280345–1280349), so they stay out: the talent's
    proc mask (69972) has no periodic bit [?]. It moves no default: Retribution runs Seal of Command
    and Protection takes no Vengeance. This one isn't
    minor: if SoR's and SoF's procs did trigger them, default Protection would deal about 8% more
    DPS and 5.7% more TPS, mostly from Windfury's extra attacks and the Seal of Fury procs they
    bring (the Flurry Axe's are a sixth of it). *Test:* in a Windfury Totem group, count Windfury
    attacks per landed white swing with Seal of Fury up and with no seal (500+ swings each; the sim
    expects the same 20%), and Vengeance stacks from SoR crits alone (the sim expects them), and
    from a Fiery Weapon crit alone (the sim expects none). Two more that aren't minor:
    - **Hammer of Wrath's 1 s cast** (without Instrument of Law). The sim has it stop your white
      swings, which start again from a full swing when it ends, and hold everything else, the
      off-GCD Judgement too, as [damage-and-timing §3.3](../mechanics/damage-and-timing.md#33-swing-reset-rules)
      has every cast do [?]. Letting swings and Judgement go on instead would make 1.9% more TPS
      in the default Protection setup, all of it from the swings. *Test:* a swing timer addon's
      log around a Hammer of Wrath cast, and whether Judgement can be pressed during one.
    - **Retribution Aura on blocked hits** (Max TPS only). The sim has it deal its damage on each
      of the boss's swings that lands on you, a blocked one too, and never crit [?]. Blocks are
      59% of those swings, so if blocked ones didn't count, Max TPS would lose about 3.1% of its
      TPS. *Test:* Retribution Aura's damage events against a boss's blocked swings.

    The minor ones (under 0.5% each, but the defaults are guesses): SotC's per-swing damage
    reduction (÷1.4 assumed); Eye for an Eye's damage school and threat.
23. **Judgement of Command's miss chance.** The damage spell 20966 carries Always Hit, but the
    dummy 20968 that casts it doesn't [F] [client] (SpellMisc, 1.60.1.70009). The sim assumes
    JoC never misses. *Test:* 200+ JoC judgements on mobs three levels above you, counting
    misses, with JoR judgements as the control (they should miss at the melee special rate).

24. **Mana regeneration's timing.** The sim ticks every 2 s from a random phase, and a seal cast
    before the pull is free and starts no five-second rule [?]. *Test:* a combat log of a
    paladin's mana over the first 20 s of a pull, with and without a pre-pull seal.
25. **Holy Shield's charges.** The client data gives Holy Shield 4 charges at every rank
    (SpellAuraOptions procCharges 4) [F] [client] (1.60.1.70009; [20928][f20928]), and the sim uses
    them, but Forever's rank 2 and 3 tooltips no longer end with "Each block expends a charge. 4
    charges." (rank 1's still does) [F] (the rank texts in [`src/data/spells/paladin.json`](../../src/data/spells/paladin.json)).
    If blocks used no charges, Holy Shield would last its full 10 s, and the default Protection
    setup would make 0.6% more TPS. *Test:* count the blocks that deal Holy Shield's damage in one
    10 s buff against a fast-hitting mob.

26. *(Withdrawn in T2: the Protection defaults judged another paladin's Judgement of the Crusader
    into the raid; a Protection paladin judges its own instead, [the opener](#forever-priority-list-default-1).)*
27. **Holy Strike's third effect** (77, a script): the sim reads it as Sacred Arbiter's "refresh all
    Judgement effects" (Judgement 20271 carries the same effect; Sacred Arbiter's aura 1311087 holds
    only its +20% damage), with no threat of its own, since the tooltip has no threat wording (D29).
    Were it a Heroic Strike-like bonus, about +102 threat a strike (+14 TPS in the review's setup).
    *Test (guild test T4):* a Holy Strike's threat ÷ (its damage × 1.6 × 1.25 × the gloves' 1.02):
    1.00 means no bonus; repeat without Iron Creed.

28. **Judgement of Fury's scripted dummy** (1607 + 42.3/level, coefficient 0.18): the sim gives it no
    damage and no threat, as the Classic Era client's identical dummy on Judgement of Righteousness
    has none ([Seal of Fury](#seal-of-fury-sof-new-the-protection-seal)). As flat threat it would be
    about +454 TPS. *Test (guild test T5):* Judgement of Fury's threat against its damage × 1.6,
    judged while you already have top threat (so the taunt does nothing).
29. **Retribution Aura's and Thorns' spell damage coefficient** (1.60.1.70009: both "dynamically
    update" with their caster's spell power; the client carries no coefficient). The sim takes Holy
    Shield's 0.08 [?] and, for Thorns on another tank, a raid Restoration druid's 200 spell damage
    [?], both unrounded
    ([buffs §1.2](../mechanics/buffs-debuffs-consumables.md#12-threat-defense-and-mana)). Lightning
    Shield's 0.267 a ball is the other allowed analog: at 0.267, Thorns would be about 31 TPS for a
    Protection paladin rather than 16. *Test:* Retribution Aura's damage on a mob with and without
    +100 spell damage; and Thorns' from a druid with known spell damage.
30. **Twist of Light's cost cut with Benediction**: added (210 × 0.7 = 147, the sim's) or multiplied
    (210 × 0.9 × 0.8 = 151)? The same question as 19. *Test:* Seal of Command's cost with both.
---

## Sources

| Source | What it covers | Ruleset |
| --- | --- | --- |
| [foreverchanges.pro /class/paladin](https://foreverchanges.pro/class/paladin) | every paladin talent and spell change, per-rank Forever and Classic tooltips, sources | Forever client 1.60.1.69913 vs Classic Era 1.15.9.69722 |
| [foreverchanges.pro /spellbook/paladin](https://foreverchanges.pro/spellbook/paladin) | per-rank costs, cooldowns, spell ids, trained levels, "Not in Forever" list | Forever vs Classic Era |
| [foreverchanges.pro /talents/paladin](https://foreverchanges.pro/talents/paladin) | tree layout, rank texts, **popular builds** (on 1.60.1.69913's trees: Holy `005320213225131051-5032-05`, Prot `2-4530513321301551-502`, Ret `250003-503-052052310012330321`) | Forever |
| [foreverchanges.pro /racials](https://foreverchanges.pro/racials) | race/class matrix (Undead paladins, both factions have all classes), racials | Forever |
| [foreverchanges.pro /downrank-calculator](https://foreverchanges.pro/downrank-calculator) | Classic Era servers use client-stored coefficients (except HL/FoL/PW:S); Forever stores full coefficients on low ranks | Forever / Classic Era |
| Client DB2 tables for build 1.60.1.70009 (Forever) and 1.15.9.69722 (Classic Era): SpellEffect, SpellAuraOptions, SpellMisc, SpellCategories, SpellCooldowns, SpellPower, SpellLevels, Spell (descriptions); raw files via the wago.tools API, parsed into `src/data/client/*.json` ([client.md](../data/client.md)) | exact base points, variance, level scaling, coefficients, proc masks, ICDs, charges, defense types, attributes, costs, cooldowns. Every value this doc had marked for a browser check was confirmed by the [claims check][client], with one correction (JoC is Always Hit). Per-spell browse links below | Forever [F] / Classic Era [C]. **Caveat:** the Classic Era client also carries Season of Discovery data (SoD runes, "S03" spells), so a Classic value was only adopted where it's a base-game spell id and consistent with Classic practice |
| [Warcraft Tavern: PvE Retribution Paladin Rotations (WoW Classic)](https://www.warcrafttavern.com/wow-classic/guides/pve-retribution-paladin-rotations-cooldowns/) | Classic Era Ret rotation: JotC then SoC, Consecration on Vengeance, HoW execute, Exorcism, SoC/SoR twisting 0.4 s before a swing | Classic Era |
| [Icy Veins: Classic Protection Paladin rotation](https://www.icy-veins.com/wow-classic/protection-paladin-tank-pve-rotation-cooldowns-abilities) | Classic Era prot approach: RF, Holy Shield, SoR + Judgement, downranked Consecration, Sanctuary (search-result summary; page blocks direct fetch) | Classic Era |
| [Warcraft Tavern: Forever Paladin guide](https://www.warcrafttavern.com/forever/guides/paladin/) | Forever overview: judgements don't consume seals, Seal of Fury taunt, Human vs Dwarf racials, "unified" hit/crit statement | Forever (community guide, pre-data) |
| [Blizzard forums: "Seal of Command proc rate?" (2020)](https://us.forums.blizzard.com/en/wow/t/seal-of-command-proc-rate/407383) | SoC PPM discussion (7 vs 6.8), base-speed calculation | Classic (2019 re-release), player claims |
| [timhul/ClassicSim](https://github.com/timhul/ClassicSim) `SealOfCommandProc.cpp` | SoC 7.0 PPM in a WoW Classic (2019) simulator | Classic; corroboration only |
| [ElliotWood/Forever](https://github.com/ElliotWood/Forever) (`docs/beta-pass/paladin.md`, `docs/forever_rules.md`, `sim/paladin/*.go`, `assets/db_inputs/basestats/octbasempbyclass.txt`) | a community Forever sim: its own client reading (Holy Strike, Consecration, Holy Shield 0.08), a beta combat-log note (JoR crit ×2, no dodge/parry), the base mana table (corroboration of character-stats' [F] value only) | **Mixed**: built on wowsims/classic code, which describes itself as a Season of Discovery sim. Only its **client-data readings and beta-log notes** are used here, never its SoD-tested formulas (e.g. its SoR "×1.1 for 2H from testing in SoD" is **not** adopted) |
| [cmangos/issues #2022](https://github.com/cmangos/issues/issues/2022) | SoR "9.2%/10.8% per weapon-speed" and the `0.03 × weapon` term | **Forbidden** (TBC 2.4.3 wiki and private server). Listed only to explain why those terms are **not** adopted ([open question 4](#open-questions)) |

### DB2 links (per spell)

Browse links to the same rows on wago.tools' table pages, for reading by hand; the pages stay
off-limits to scripts ([D16](../decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)),
and the parsed values are in `src/data/client/spells.json`.
Forever build 1.60.1.70009 (`f…`) and Classic Era 1.15.9.69722 (`c…`), SpellEffect filtered
by SpellID. The same `filter[SpellID]` works on SpellAuraOptions, SpellMisc,
SpellCategories, SpellCooldowns, SpellPower and SpellLevels. Table roots:
[f-SpellAuraOptions], [f-SpellCategories], [f-SpellMisc], [f-SpellCooldowns], [f-SpellPower].

[f20424]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20424
[f20920]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20920
[f20968]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20968
[f20966]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20966
[f25713]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=25713
[f20293]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20293
[f20286]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20286
[f20308]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20308
[f20303]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20303
[f20423]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20423
[f20418]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20418
[f20414]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20414
[f10333]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=10333
[f20271]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20271
[f20924]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20924
[f26573]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=26573
[f1280349]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1280349
[f10314]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=10314
[f24239]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=24239
[f407632]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=407632
[f20928]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20928
[f25780]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=25780
[f1310735]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1310735
[f1311703]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1311703
[f20049]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20049
[f20050]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20050
[f1311074]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1311074
[f1311083]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1311083
[f1311084]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1311084
[f1311085]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1311085
[f1311087]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1311087
[f20224]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20224
[f20101]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20101
[f1237268]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1237268
[f20117]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20117
[f20111]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20111
[f20189]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20189
[f20196]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20196
[f20127]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20127
[f20128]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20128
[f20177]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20177
[f1310925]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1310925
[f20468]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20468
[f1311034]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1311034
[f1310994]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1310994
[f1311015]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1311015
[f1314103]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1314103
[f1224697]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1224697
[f9452]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=9452
[f440668]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=440668
[f19838]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=19838
[f25782]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=25782
[f19854]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=19854
[f25291]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=25291
[f25916]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=25916
[f20217]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20217
[f1038]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1038
[f25290]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=25290
[f10301]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=10301
[f10293]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=10293
[f20357]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20357
[f20355]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20355
[f20349]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20349
[f20164]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=20164
[f1301702]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1301702
[f1301083]: https://wago.tools/db2/SpellEffect?build=1.60.1.70009&filter%5BSpellID%5D=1301083
[c20424]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20424
[c20968]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20968
[c20303]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20303
[c20924]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20924
[c20928]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20928
[c20101]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20101
[c25713]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=25713
[c20286]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20286
[c20914]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20914
[f-SpellAuraOptions]: https://wago.tools/db2/SpellAuraOptions?build=1.60.1.70009
[f-SpellCategories]: https://wago.tools/db2/SpellCategories?build=1.60.1.70009
[f-SpellMisc]: https://wago.tools/db2/SpellMisc?build=1.60.1.70009
[f-SpellCooldowns]: https://wago.tools/db2/SpellCooldowns?build=1.60.1.70009
[f-SpellPower]: https://wago.tools/db2/SpellPower?build=1.60.1.70009
[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
