# Paladin: Retribution and Protection

WoW Forever reworks the paladin more than any other class in scope. The biggest change is that
**Judgement no longer consumes the Seal**, so a paladin keeps one seal up and judges it on
cooldown. Damage judgements now roll on the **melee** table: they can't be dodged, parried or
blocked, and they crit for double damage. Judgement of Righteousness and of Fury can miss, but
Judgement of Command can't (its damage spell is *Always Hit*). Judgement debuffs still
always hit and now last 40 s instead of 10 s. Retribution gains a cheap 12 s strike (Holy Strike), a
spell-damage-from-Intellect capstone line (Champion of the Light), a mana-positive judgement
talent (Sanctified Judgement), a reworked Vengeance (up to 5 stacks, 30 s) and Twist of
Light, which does seal twisting for you. Protection gains a tank seal with a taunting
judgement (Seal of Fury), mana on block (Shield Specialization), a stronger baseline
Righteous Fury (+90% Holy threat) and a stronger Holy Shield. Blessing of Sanctuary,
Sanctity Aura and Improved Blessing of Might are gone. Blessing of Might drops to 133 attack
power, Consecration and Blessing of Kings are trained baseline, and Blessings last an hour.
Undead can now be paladins, so **both factions have paladins**, and Dwarves can be shamans,
so both factions also have Windfury. This doc is the engine contract for both specs: every
ability, proc and talent at level 60, with numbers, hit-table behaviour, rotation settings,
defaults, worked examples and the questions the beta has to answer.

Status: researched 2026-09-22 · Forever client build 1.60.1.69913 · Classic Era 1.15.9.69722 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified · engine: the class foundation (seals, judgements, spells, mana, talents; [Implementation notes](#implementation-notes)); the specs' rotations come next

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
6. **Stacking buffs and procs**: Vengeance (1–5 stacks), Vindication, Twist of Light echoes,
   Reckoning extra attacks, Redoubt, Iron Creed and Swift Judgement ([Talents](#talents)).
7. **Mana**: base-mana-percent costs, Benediction, Holy Conduit, Sanctified Judgement,
   Shield Specialization, the five-second rule, potions and runes ([Mana model](#mana-model)).
8. **Threat** (Protection): Righteous Fury ×1.9 on Holy, Holy Shield +20%, Iron Creed, and
   Instrument of Law for Retribution ([Threat](#threat-paladin-specific)).
9. **Target type** from [encounter.md](../mechanics/encounter.md) gates Exorcism, Holy Wrath
   and Crusade's extra 2%.
10. **Level scaling of lower-rank spells.** A rank learned below 60 grows by
    `EffectRealPointsPerLevel` per level up to its max level
    ([Conventions](#conventions-used-below)).

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
| Human | Alliance | yes | yes [F] | Sword Specialization: **+2% crit with all spells and attacks** while a sword or 2H sword is equipped (was +5 weapon skill) [F] ([racials](https://foreverchanges.pro/racials); [client] (SpellEffect 20597, 1.60.1.69913)) |
| Dwarf | Alliance | yes | yes [F] | Mace Specialization (new to Dwarves): +1% crit with spells and attacks with a mace; Stoneform −10% physical damage taken for 8 s [F] [client] (SpellEffect, SpellDuration, 1.60.1.69913; 1259719, 20594) |
| Undead | Horde | no | **yes (new)** [F] | Touch of the Grave: 5% chance on spell or attack hit to drain health from the target, up to 5% of max health [F]; the client spell 1260189 is a dummy (5), so the drain formula is server-side and unknown [?] |

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
| Judgement hit table | Magic class: damage judgements roll spell hit and spell crit | **Melee class** + *No Active Defense*: damage judgements (JoC, JoR, JoF) roll melee crit ×2 and never dodge, parry or block. **JoR and JoF roll melee miss; JoC's damage spell 20966 carries *Always Hit*, so JoC can't miss.** Debuff judgements (JotC, JoW, JoL, JoJ) carry *Always Hit* in both clients | [F] [client] (SpellCategories DefenseType 2, SpellMisc Attr0 0x200000 / Attr3 0x40000, 1.60.1.69913; [20286][f20286], [20414][f20414], [20968][f20968], [20966][f20966], [20303][f20303], [20355][f20355]) vs [C 20286][c20286], [C 20968][c20968], [C 20303][c20303]. Whether the server honours JoC's Always Hit is [?] ([open question 23](#open-questions)) |
| Judgement debuff duration (Crusader, Wisdom, Light) | 10 s | **40 s**, still refreshed by your melee strikes | [F] [client] (SpellDuration, 1.60.1.69913; [20303][f20303], [20355][f20355]) |
| Judgement of the Crusader (r6) | +140 Holy damage taken | **+161** (Improved SotC's 15% is now baseline) | [F] [F 20303][f20303] |
| Improved Seals (was Improved SoR) | +15% SoR/JoR, 5 ranks | **+15% all seal procs and judgements**, 3 ranks | [F] [client] (SpellEffect spell masks, TraitDefinitionEffectPoints, 1.60.1.69913; [20224][f20224]) |
| Seal of Command, SoR, JoC, JoR numbers | — | unchanged at max rank (SoR ranks 1–3 get the full 0.1 coefficient) | [F] [spellbook](https://foreverchanges.pro/spellbook/paladin) |
| Holy Strike | — | **new**, 8 ranks; r8: 20 mana, 12 s, 40% weapon + 81–105, Holy | [F] [client] (SpellEffect, SpellCategories, SpellMisc, 1.60.1.69913; [10333][f10333]) |
| Seal of Fury / Judgement of Fury | — | **new tank seal**; r7: +35 Holy per swing, absorb, judgement 146–160 + taunt 4 s | [F] [F 20423][f20423]; the 35 and 146–160: [client] (SpellEffect, 1.60.1.69913; [20418][f20418], [20414][f20414]) |
| Hammer of the Righteous | SoD rune only | **trained at 40**: 3× MH weapon DPS as Holy to the target and up to 3 more (tooltip); shares cooldown with Holy Strike | [F] [F 407632][f407632]; shared category 2404: [client] (SpellCategories, 1.60.1.69913) |
| Consecration | Holy talent; r5 384 over 8 s, 0.042/tick | **trained at 20**; r5 96 to all + 216 to the first 4, 0.095/tick on the capped part | [F] [client] (SpellEffect, 1.60.1.69913; [1280349][f1280349]) vs [C 20924][c20924] |
| Exorcism r6 | 505–563 | **475–529** | [F] [F 10314][f10314] |
| Hammer of Wrath r3 | 504–556 | **474–522** | [F] [F 24239][f24239] |
| Holy Shield r3 | 30% block, 130 dmg, 0.05 coef | **20% block, 221 dmg, 0.08 coef**, 4 charges | [F] [client] (SpellEffect, SpellAuraOptions, 1.60.1.69913; [20928][f20928]) vs [C 20928][c20928] |
| Righteous Fury | +60% Holy threat | **+90%** | [F] [client] (SpellEffect, school mask 2, 1.60.1.69913; [25780][f25780]) |
| Improved Righteous Fury | +16/33/50% RF threat | **−2/4/6% damage taken** while RF is up | [F] [talents](https://foreverchanges.pro/talents/paladin); [client] (TraitDefinitionEffectPoints curve 82954, 1.60.1.69913) |
| Blessing of Might r7 | 185 AP, 5 min | **133 AP, 1 h** | [F] [F 25291][f25291] |
| Improved Blessing of Might | +20% | **removed** | [F] [class page](https://foreverchanges.pro/class/paladin) |
| Blessing of Kings | Prot talent (tier 3) | **trained at 20**, 1 h | [F] [F 20217][f20217] |
| Blessing of Wisdom r6 | 33 mp5 | **40 mp5**, 1 h | [F] [F 25290][f25290] |
| Blessing of Salvation | 5 min | 1 h, still −30% threat | [F] [client] (SpellEffect, 1.60.1.69913; [1038][f1038]) |
| Blessing of Sanctuary (+ Greater) | talent | **gone from the client** | [F] [spellbook "Not in Forever"](https://foreverchanges.pro/spellbook/paladin), [C 20914][c20914] |
| Sanctity Aura (+10% party Holy damage) | Ret talent | **removed** from the tree and not trained | [F] [class page](https://foreverchanges.pro/class/paladin) |
| Retribution Aura r5 | 20 | **30** Holy per hit taken | [F] [F 10301][f10301] |
| Improved Devotion / Retribution / Concentration Aura, Improved SotC, Lasting Judgement, Improved BoW, Improved LoH | talents | **removed** | [F] [class page](https://foreverchanges.pro/class/paladin) |
| Divine Shield | +100% attack interval | −50% damage dealt | [F] |
| Lay on Hands | 1 h cooldown | 20 min cooldown, mana drain doesn't stop regen | [F] |

New and changed talents are covered in [Talents](#talents). Spells whose only change is a
longer Blessing, a party-to-raid resistance aura or a mount tooltip are omitted.

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
  categories) come from the raw Forever client files, build 1.60.1.69913, read through the
  wago.tools API and parsed by `scripts/scrape/client.mjs`. Values tagged `[F] [client]` were
  confirmed by the [claims check][client], which covered every value this doc had marked for a
  browser check, with one correction: Judgement of Command can't miss
  ([Seal of Command](#seal-of-command-soc)). Raw files lack server hotfixes and server
  scripts, so dummy values such as Judgement of Fury's scripted 1607 + 42.3/level and all PPM
  rates are server-side ([hotfix caveat](../data/client.md#hotfix-caveat)).
- **Rank at level 60.** Every table uses the max rank a level-60 paladin has. Where
  `SpellLevels.BaseLevel` < 60, add `EffectRealPointsPerLevel × (min(60, MaxLevel) −
  BaseLevel)` to the base: JoR r8 +8.2, JoF r7 +7.38, SoR r8 dummy +94, SotC r6 AP +19.2.
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
  ones (with 5% miss and 25% crit, 23.75% of casts rather than 25%). JoC and the seals' procs
  have nothing to roll first, so the two models agree.
- **Which spells trigger procs.** A spell you cast (Holy Strike, Exorcism, Hammer of Wrath)
  triggers on-hit and crit procs as any attack does. A spell that another spell or an aura
  triggers (a seal's proc, a judgement's damage spell, Consecration's ticks) triggers them only if
  it carries **NOT_A_PROC** (SpellMisc Attr3 `0x200`). Seal of Command's proc 20424 and the
  judgements' damage spells 20966, 20286 and 20414 carry it. Seal of Righteousness's proc 25713
  and Seal of Fury's 20418 (Attr3 `0x40000`, Always Hit only) and Consecration's ticks 1280345–1280349
  don't [F] [client] (SpellMisc, 1.60.1.69913). "Procs" means every kind: Windfury, Crusader, Hand
  of Justice, Vengeance, Vindication and crit charges. The attribute's reading is data; that
  Forever's server applies it this way is untested [?] ([open question 22](#open-questions)).
- **Holy damage ignores armor.** Mobs and raid bosses have no Holy resistance. Whether
  level-based partial resists apply to melee-class Holy spells is an
  [open question](#open-questions).
- **Multipliers.** Different auras multiply (e.g. Vengeance × Crusade ×
  Two-Handed Weapon Specialization). Percent spell modifiers (`ADD_PCT_MODIFIER`: Improved
  Seals, Sacred Arbiter, Benediction, Holy Conduit) are a separate factor. When two of them
  hit the same spell (Benediction + Holy Conduit on Consecration's cost), **add** them
  (Classic engine convention) [?].
- **Base mana** at level 60 is **1512** [F] [client] (`PlayerExpectedStat.BaseMana` and the
  `basemp.txt` game table, 1.60.1.69913), owned by
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
1.60.1.69913; 20920, 20293, 20423). The utility seals (SoW, SoL, SoJ) use `0x14`, so melee
specials can trigger them too [F] [client] (SpellAuraOptions, 1.60.1.69913). Recasting a seal while it's active refreshes it.
Replacing SoC, SoR, SoF or SoJ with a *different* seal grants a Twist of Light echo if you
have the talent ([Twist of Light](#retribution-tree)).

### Seal of Command (SoC)

| Field | Value | Tag, source |
| --- | --- | --- |
| Spell (r5) | 20920, Ret talent (tier 3 in both clients), ranks 2–5 trained at 30/40/50/60 | [F] [F 20920][f20920] |
| Cost | 210 mana (189 with Benediction 5/5) | [F] |
| Proc spell | 20424, used by every rank: `WEAPON_PERCENT_DAMAGE` **70%**, Holy, melee class | [F] [client] (SpellEffect, 1.60.1.69913; [20424][f20424]), same in [C 20424][c20424] |
| Proc rate | **7 PPM from base weapon speed**: `chance = 7 × speed / 60` per landed white hit (3.50 speed → 40.8%). Haste adds swings, not chance | [C] ([Warcraft Tavern Classic](https://www.warcrafttavern.com/wow-classic/guides/pve-retribution-paladin-rotations-cooldowns/), [ClassicSim `SealOfCommandProc.cpp`](https://github.com/timhul/ClassicSim/blob/master/Class/Paladin/Procs/SealOfCommandProc.cpp)). No `SpellAuraOptions` row in either client references a `SpellProcsPerMinute` row, so the rate is server-side ([client] (SpellAuraOptions, 1.60.1.69913 and 1.15.9.69722)). One [Blue-forum thread](https://us.forums.blizzard.com/en/wow/t/seal-of-command-proc-rate/407383) claims 6.8 [?] |
| Internal cooldown | **1.0 s** (`ProcCategoryRecovery 1000`). Windfury's extra swing right after a SoC proc can't proc again | [F] [client] (SpellAuraOptions, 1.60.1.69913; 20920), same in Classic |
| Damage | `0.70 × (MH weapon damage roll + AP × speed / 14 + 0.29 × SP)` (effective **0.203 × SP**) | Coefficient 0.29: [F] [client] (SpellEffect, 1.60.1.69913; [20424][f20424]), as in Classic ([C 20424][c20424]). Applying it *inside* the 70% is [?], see [open questions](#open-questions) |
| Hit table | Melee class **without** No Active Defense or Always Hit: rolls miss, dodge, parry, block and crit (×2) on the special-attack table. No glancing | [F] SpellMisc/SpellCategories on 20424 [?]: the attribute reading of dodge and parry needs a beta log |
| Modifiers | Improved Seals ×1.15 (spell mask includes 20424). Vengeance, Crusade and JotC apply. **Two-Handed Weapon Specialization does not** (Physical only) | [F] [client] (SpellEffect, 1.60.1.69913; [20224][f20224], [20111][f20111]) |
| Triggers | The proc counts as a melee special hit: it can crit, and it triggers on-hit and crit procs (Windfury, Crusader, Hand of Justice, Vengeance, Vindication) [?] | 20424 carries NOT_A_PROC (Attr3 `0x200`) [F] [client] (SpellMisc, 1.60.1.69913); the server's use of it [?] ([conventions](#conventions-used-below)) |

**Judgement of Command** (JoC, r5): dummy 20968 → damage spell 20966. Base **339–373 Holy,
halved unless the target is stunned or incapacitated** (tooltip "169.5 to 186.5 … 339 to 373
if stunned"), plus **0.429 × SP**, ×1.15 Improved Seals. Assume the coefficient is **not**
halved [?]. Both spells are melee class with No Active Defense, and the damage spell 20966
also carries **Always Hit** (Attr3 `0x40000`), so JoC **can't miss, be dodged, parried or
blocked, and crits ×2** [F] [client] (SpellMisc, SpellCategories, SpellEffect, 1.60.1.69913;
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
| Damage per landed white hit | **2H: `1.20 × v × speed`; 1H: `0.85 × v × speed`**, + **0.1 × SP**. So 18.8 × 1.2 × 3.5 = 79.0 before SP. Tooltip: "Slower weapons cause more Holy damage per swing", which normalizes to roughly constant DPS | Shape [C]/[?]: the server-side script isn't in the client. The tooltip's level-58 range 20.5–71.4 is `v × 1.1475 … v × 4.0` (0.85 × 1.35 to 1.2 × 3.33), consistent with those factors. The extra `+0.03 × avg weapon damage ± 1` in wiki formulas is from TBC-era text and **not adopted** [?] |
| SP coefficient | 0.1 per proc on the proc spell (Classic r8 also 0.1). Forever gives ranks 1–3 the full 0.1 too | [F] [client] (SpellEffect, 1.60.1.69913; [25713][f25713]), [C 25713][c25713] |
| Hit table | Melee class, **No Active Defense + Always Hit**: rides on the white hit that triggered it, can't miss, dodge, parry or block. **Can crit** (melee crit ×2; no "can't crit" attribute) [?] | [F] [client] (SpellMisc Attr0 0x240000, Attr3 0x40000; SpellCategories, 1.60.1.69913; 25713) |
| Modifiers | Improved Seals ×1.15, Vengeance, Crusade, JotC | [F] |
| Triggers | **Nothing**: the proc triggers no Windfury, Crusader, Hand of Justice, Vengeance or Vindication, even when it crits. The white hit that carries it still does [?] | 25713's Attr3 is `0x40000` (Always Hit) only, without NOT_A_PROC `0x200` [F] [client] (SpellMisc, 1.60.1.69913); the server's use of it [?] ([conventions](#conventions-used-below), [open question 22](#open-questions)) |

**Judgement of Righteousness** (r8, 20286): **162–178 + 8.2 = 170.2–186.2 at level 60**,
plus **0.5 × SP**, ×1.15 Improved Seals. Melee class, No Active Defense, no Always Hit: melee
miss, crit ×2, no dodge, parry or block [F] [client] (SpellEffect, SpellMisc, SpellCategories,
1.60.1.69913; [20286][f20286]). It has no weapon damage, so it rolls the miss first and crit on a
landed JoR second [?] ([one roll or two](#conventions-used-below)). A beta combat log shows a JoR crit at
exactly ×2 (69 on a 34 base) and plain misses only. That's a single Forever log (n=1)
reported by community sim authors
([ElliotWood `sor.go`](https://github.com/ElliotWood/Forever/blob/master/sim/paladin/sor.go)) [?].
It corroborates the client data above but isn't a guild measurement.

### Seal of the Crusader (SotC) and Judgement of the Crusader (JotC)

- **SotC r6** (20308, 160 mana): +306 melee AP and +40% attack speed, with "less damage with
  each attack" [C]/[F] ([F 20308][f20308]). The client grows the AP by 2.4 per level over
  levels 52–60 [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913), so it is **325 at 60**
  if the server applies that term [?]. Only
  used to judge. While it's active the sim applies +40% attack speed and divides weapon
  damage per swing by 1.4 [?]: an aura of −28.57% Physical damage, so it covers every Physical
  hit while it's up. Swapping *away* from SotC gives no Twist of Light echo (it
  isn't one of the listed seals) [F].
- **JotC r6** (20303): target takes **+161 Holy damage** (flat, `MOD_DAMAGE_TAKEN` Holy) for
  **40 s**. It **can't miss** (Always Hit) [F] [client] (SpellMisc, SpellDuration,
  1.60.1.69913; [20303][f20303]). Your own melee strikes refresh it, and so does Holy Strike
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
  builder takes the rule (`coefficient`, the default, or `flat`), and the Retribution settings
  will show it.
- **Where the bonus goes** [?]: as a flat bonus on the *target*, it's added after your own damage
  multipliers (Improved Seals, Vengeance, Crusade), which don't raise it, and before the crit
  multiplier, which does. That follows the Classic engine's order for flat damage taken; it's
  untested in Forever ([open question 5](#open-questions)).

### Seal of Fury (SoF), new: the Protection seal

| Field | Value | Tag, source |
| --- | --- | --- |
| Spell (r7) | 20423, trained at 58; ranks from level 10 | [F] [F 20423][f20423] |
| Cost | 200 mana | [F] |
| Per landed white hit | **+35 Holy** (proc 20418), **0.1 × SP** | [F] [client] (SpellEffect, 1.60.1.69913; [20418][f20418]) |
| Absorb | With a shield equipped, each hit grants an absorb of **50% of the Holy damage dealt** | [F] (effect 1 = 50). Stacking or refresh rules [?] |
| Hit table | Proc 20418: melee class, No Active Defense + Always Hit, like SoR | [F] [client] (SpellMisc, SpellCategories, 1.60.1.69913) |
| Triggers | **Nothing**, like SoR's proc: no Windfury, Crusader, Hand of Justice, Vengeance or Vindication from it [?] | 20418's Attr3 is `0x40000` only, without NOT_A_PROC [F] [client] (SpellMisc, 1.60.1.69913); the server's use of it [?] ([open question 22](#open-questions)) |
| Judgement of Fury (r7) | 20414: **146–160 + 7.38 = 153.4–167.4 at 60**, **0.45 × SP**, Holy, melee class, No Active Defense, no Always Hit (can miss; then crit on a landed one, two rolls [?]). **Taunts for 4 s** | [F] [client] (SpellEffect, SpellMisc, 1.60.1.69913; [20414][f20414]); taunt: tooltip |
| Improved Seals | applies to the proc and the judgement | [F] [client] (SpellEffect spell mask includes 20418 and 20414, 1.60.1.69913) |

The SoF aura carries the same weapon-speed "seal value" dummy as SoR (1607 + 42/level), and
Judgement of Fury has a scripted dummy of 1607 + 42.3/level at a 0.18 coefficient [F] [client]
(SpellEffect, 1.60.1.69913; [20423][f20423], [20414][f20414]). What the server does with them
is unknown, and the tooltip prints a flat 35, so the sim uses the flat value and ignores the
dummies [?].

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
| Outcome | the active seal's judgement spell: see each seal. Every Forever judgement is melee class + No Active Defense. JoR and JoF can miss (melee special miss chance); **JoC can't** (its damage spell 20966 is Always Hit). Damage judgements crit ×2. Debuff judgements always hit. The damage spells (20966, 20286, 20414) carry NOT_A_PROC, so a damage judgement triggers on-hit and crit procs [?] ([conventions](#conventions-used-below)) | [F] [client] (SpellMisc, SpellCategories, 1.60.1.69913); JoC in game [?] ([open question 23](#open-questions)) |
| Sanctified Judgement | 3/3: **100% chance to return 60% of the judged seal's mana cost** (SoC → 126). Base vs modified cost [?]: use the base cost | [F] [F 1311074][f1311074] |

---

## Other abilities

| Ability (max rank) | Numbers at 60 | Cost / CD / GCD | Class, hit table | Tag, source |
| --- | --- | --- | --- | --- |
| **Holy Strike** r8 (10333), new, trained at 6 | Effects: `NORMALIZED_WEAPON_DMG` +93 (81–105) then `WEAPON_PERCENT_DAMAGE` 40% ⇒ **0.40 × (normalized MH damage + 81..105)**, plus **0.429 × SP**. **All Holy**, so no armor | 20 mana; **12 s** (category 2404, shared with HotR); Improved Holy Strike −2 s → 10 s; GCD 1.5 s | Melee special: miss, dodge, parry, block, crit ×2. Doesn't proc damage seals [F]; doesn't reset the swing timer (instant special) [C] | [F] [client] (SpellEffect, SpellCategories, SpellMisc school 2, 1.60.1.69913; [10333][f10333]). The ×0.40 on the flat part and how the 0.429 applies are [?] (the tooltip prints the raw 81–105; the BlizzCon build printed "36 to 46", i.e. 40%) |
| **Consecration** r5 (20924), baseline from 20 | Per 1 s tick for 8 s (spell 1280349): **12 Holy to every enemy** (no coefficient) **+ 27 Holy + 0.095 × SP to the first 4 enemies**. Single target: **312 + 0.76 × SP** per cast | 565 mana; 8 s; GCD 1.5 s | Magic class; each tick is a separate direct-damage spell (spell hit roll per tick [?]; crit [?]). The ticks lack NOT_A_PROC, so they trigger no procs [?] ([conventions](#conventions-used-below)) | [F] [F 20924][f20924]; tick split and 0.095: [client] (SpellEffect, 1.60.1.69913; [1280349][f1280349]). Classic: 48/tick, 0.042 ([C 20924][c20924]) |
| Consecration ranks 1–4 | per tick all + first-4: r1 2 + 4, r2 3 + 7, r3 6 + 11, r4 8 + 20; **every rank has the full 0.095** | 135 / 235 / 320 / 435 mana | as above | [F] tick spells 1280345–1280348, [F 26573][f26573]. Downranking is mana-efficient: r1 is `48 + 0.76 × SP` for 135 mana |
| **Exorcism** r6 (10314) | **475–529 + 0.429 × SP** Holy; **Undead or Demon only** | 345 mana; 15 s; GCD 1.5 s | Magic: spell hit, crit ×1.5 | [F] [F 10314][f10314] |
| **Hammer of Wrath** r3 (24239) | **474–522 + 0.429 × SP** Holy; target **≤ 20% health** | 425 mana; 6 s; 1.0 s cast (Instrument of Law −0.5/−1.0 s → instant); **GCD 1.0 s**. During the cast the sim keeps swinging and lets the off-GCD Judgement act [?]; in game a cast likely pauses both. No default result depends on it yet: the core rotation doesn't cast Hammer of Wrath, and the default Retribution build's Instrument of Law 2/2 makes it instant. Protection's list (row 8) will cast it in 1 s | **Ranged** class (DefenseType 3): ranged hit/crit table, see combat-tables | [F] [F 24239][f24239]; the cast's effect on swings and Judgement [?] ([open question 22](#open-questions)) |
| **Hammer of the Righteous** (407632), trained at 40 | **3 × MH weapon DPS** as Holy to the target and up to 3 more (DB2 target field is 3 in Forever, 4 in SoD's copy [?]); no SP coefficient in data | 6% base mana (90); **6 s**, category 2404: **shares its cooldown with Holy Strike**; GCD 1.5 s; needs a 1H axe, mace or sword | Melee special, full table [?] | [F] [F 407632][f407632]; category 2404 with 6 s: [client] (SpellCategories, SpellCooldowns, 1.60.1.69913). It's SoD's spell id, but Forever changed its level, cooldown category and target count, so it's a deliberate Forever spell. Whether "weapon DPS" includes AP is [?] |
| **Holy Shield** r3 (20928), tier-7 (31-point) Prot talent | **+20% block** for 10 s, **4 charges**; each block deals **221 + 0.08 × SP** Holy; the damage has **+20% threat** | 240 mana; 10 s (category); GCD 1.5 s | Block damage is a proc (`PROC_TRIGGER_DAMAGE`); can it miss or crit [?] | [F] [client] (SpellEffect, SpellAuraOptions, 1.60.1.69913; [20928][f20928]) |
| **Righteous Fury** (25780) | **+90% threat from Holy damage**; Improved RF adds −2/4/6% damage taken | 30% base mana (453); 30 min | — | [F] [client] (SpellEffect, TraitDefinitionEffectPoints, 1.60.1.69913; [25780][f25780]) |
| **Holy Wrath** r2 (10318) | 490–576 Holy, AoE 20 yd, Undead/Demon only, now also stuns 2 s | 805 mana; 60 s; 2 s cast | Magic | [F]. Off by default |
| Templar's Bulwark (1311015), new Prot talent | absorb = 100% max health for 8 s; Forbearance | 110 mana; 5 min (−60 s Sacred Duty); off GCD | — | [F] [F 1311015][f1311015]. No TPS effect; not modelled by default |
| Swift Judgement (1310994), new Prot talent | finishes Judgement's cooldown; next Judgement free | 1 min; off GCD | — | [F] [F 1310994][f1310994] |
| Retribution Aura r5 (10301) | **30 Holy** to each attacker that hits a party member | — | damage shield | [F] [F 10301][f10301] |
| Devotion Aura r7 (10293) | +735 armor (party) | — | — | [F] [F 10293][f10293] |

### Blessings (for the buffs doc)

Might **133 AP** (Greater Might r2 133) [F] ([F 25291][f25291], [F 25916][f25916]). Kings +10% all
stats (baseline) [F] ([F 20217][f20217]). Wisdom **40 mp5** [F] ([F 25290][f25290]). Salvation
−30% threat [F] [client] (SpellEffect, 1.60.1.69913; [1038][f1038]). Light unchanged. All last 1 h, Greater Blessings too.
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
| Sacred Arbiter (1), new | "Increases the damage of your Holy Strike ability by 10% and causes it to refresh all Judgement effects on the target." ([F 1311087][f1311087]) | — | Holy Strike ×1.10; refreshes your judgement debuffs |
| Crusade (2), new | "Increases all damage dealt by 2%. Increased by an additional 2% against Demon and Undead targets." ([F 1311083][f1311083]) | — | ×1.02 all damage; a further ×1.02 vs Undead/Demon (separate aura, multiplicative) |
| Two-Handed Weapon Specialization (3) | "Increases the damage you deal with two-handed melee weapons by 9%." ([F 20111][f20111]) | 6% | ×1.09 **Physical only** (school mask 1, [client] (SpellEffect, 1.60.1.69913)), with a 2H equipped. Holy Strike, SoC and judgements don't benefit |
| Vengeance (3) | "Increases your Physical and Holy damage dealt by 3% for 30 sec after landing a critical strike. Stacks up to 5 times." ([F 20049][f20049], buff [F 20050][f20050]) | 15% flat for 8 s, 5 ranks | Buff: **+1/2/3% per stack, max 5 stacks (15% at 3/3)**, 30 s ([client] (SpellAuraOptions, SpellDuration, CurvePoint, 1.60.1.69913)). Each crit that triggers procs adds a stack and refreshes the duration: white, special, SoC proc, judgement, spell; **not** SoR's or SoF's procs or Consecration's ticks [?] ([conventions](#conventions-used-below)) |
| Repentance (1) | incapacitate | same | not modelled |
| Champion of the Light (3), new | "Increases your spell damage and healing by up to 100% of your Intellect." ([F 1311084][f1311084]) | — | **+Int to spell damage** (all magic schools) and healing, at 33/66/100% |
| Instrument of Law (2), new | "Reduces the cast time of your Hammer of Wrath by 1.0 sec, and reduces all threat you generate by 20% while Righteous Fury is not active." ([F 1311085][f1311085]) | — | HoW instant (still 1.0 s GCD); threat ×0.8 when RF is off (curves −500/−1000 ms and 10/20, [client] (TraitDefinitionEffectPoints, 1.60.1.69913)) |
| Twist of Light (1), new capstone | "When you replace your Seal of Command, Seal of Righteousness, Seal of Fury, or Seal of Justice with a different Seal, gain an Echo. Your next melee attack applies the replaced Seal's effects, consuming the Echo." ([F 1310735][f1310735]) | — (Classic twisting relied on batching) | On replacing a listed seal, gain `Echo of <old seal>` (1 charge, no duration, [F 1311703][f1311703]). It's consumed by the next landed **auto attack**, which applies the old seal's on-hit effect as well as the new one. **Echo of Command "empowers your next melee attack with a *chance* to activate Seal of Command"**: roll 7 PPM and respect the 1 s ICD. Echoes of Righteousness and Fury always fire |

Removed from Ret: Improved Blessing of Might, Improved Retribution Aura, Sanctity Aura,
Improved Seal of the Crusader [F].

### Protection tree

| Talent (max) | Forever tooltip (max rank) | Classic Era | Model |
| --- | --- | --- | --- |
| Toughness (5) | "+10% armor from items" | same | armor (tank stats) |
| Redoubt (5) | "Damaging melee attacks against you have a 10% chance to increase your chance to block by 30%. Lasts 10 sec or 5 blocks." ([F 20127][f20127], buff [F 20128][f20128]) | triggered by being crit | On each melee hit taken (`ProcTypeMask` taken-melee): 10% chance for +30% block, 10 s or 5 blocks. **Conflict:** the community sim reads the trait curve as 2/4/6/8/10% chance per rank; the client tooltips say 10% at every rank [?] |
| Precision (3) | "Improves your chance to hit by 3%." ([F 20189][f20189]) | melee only | **+3% melee and +3% spell hit** (two auras) |
| Guardian's Favor (2) | BoP/BoF cooldowns | same | not modelled |
| Anticipation (5) | "Increases your Defense Skill by 20." | +10 | +20 defense skill |
| Improved Seal of Fury (1), new | "When Seal of Fury's shield is fully absorbed, restore 60 Mana, increased by 15% per level the attacker is above you, up to 45%." ([F 1314103][f1314103]; the rank text in [`src/data/talents/paladin.json`](../../src/data/talents/paladin.json)) | — | foreverchanges printed "0"; the client's rank text reads 60 [F]. Mana only, and it needs the Seal of Fury absorb; not modelled until measured |
| Improved Righteous Fury (3) | "While Righteous Fury is active, all damage taken is reduced by 6%." ([F 20468][f20468]) | +50% RF threat | −6% damage taken (curve −2/−4/−6, [client] (TraitDefinitionEffectPoints, 1.60.1.69913)); **no threat effect** |
| Shield Specialization (3) | "Increases the amount of damage absorbed by your shield by 30%, and gives your blocks a 100% chance to restore 6% of your maximum Mana. May only occur once every 3 sec." ([F 1310925][f1310925]) | block value only | block value ×1.30; on block, +6% max mana (33/66/100%), 3 s ICD |
| Sacred Duty (2), new | "Increases your total Stamina by 4% and reduces the cooldown of your Divine Shield, Divine Protection, and Templar's Bulwark spells by 60 sec." ([F 1224697][f1224697]) | — | Stamina ×1.04 |
| Swift Judgement (1), new | "Finishes the remaining cooldown on your Judgement ability and reduces the Mana cost of your next Judgement by 100%." | — | active: see rotation |
| One-Handed Weapon Specialization (3) | "Increases the damage you deal with one-handed melee weapons by 10%." ([F 20196][f20196]) | 10% at 5/5 | ×1.10 **Physical only** (school mask 1, [client] (SpellEffect, 1.60.1.69913)) with a 1H |
| Improved Hammer of Justice (3) | −15 s | same | not modelled |
| Templar's Bulwark (1), new | absorb 100% max health, 8 s | — | not modelled by default |
| Reckoning (5) | "Gives you a 40% chance to gain an extra attack after Blocking a melee attack and a 100% chance to gain an extra attack after being the victim of a non-periodic critical strike." ([F 20177][f20177]) | 100% on crit only | Extra main-hand auto attack (can proc seals). Stacking cap: Classic stored up to 4 [?]; Forever cap [?] |
| Iron Creed (5), new | "Increases the threat generated by your Holy Strike ability 25%. While Righteous Fury is active, Holy Strike also reduces your damage taken by 10% for 6 sec." ([F 1311034][f1311034]) | — | Holy Strike threat ×1.25 (aura 108, modifier 2, curve 5…25, [client] (SpellEffect, CurvePoint, 1.60.1.69913)); −10% damage taken buff (tank survival only) |
| Holy Shield (1) | see [Other abilities](#other-abilities) | 30% block, 130 dmg | — |

Removed from Prot: Blessing of Sanctuary, Improved Devotion Aura, Improved Concentration
Aura. Blessing of Kings is now baseline [F].

### Holy tree (points Ret and Prot builds take)

| Talent (max) | Forever tooltip (max rank) | Model |
| --- | --- | --- |
| Improved Holy Strike (2), new | "Reduces the cooldown of your Holy Strike ability by 2 sec." | Holy Strike CD 10 s |
| Divine Strength (5) | "Increases your Strength by 10%." (unchanged) | Str ×1.10 |
| Divine Intellect (5) | "+10% Intellect" (unchanged) | Int ×1.10 |
| Improved Seals (3) | "Increases the damage done by your Seals and Judgements by 15%." ([F 20224][f20224]) | ×1.15 on SoC/SoR/SoF procs and JoC/JoR/JoF (spell masks and curve 5/10/15: [client] (SpellEffect, CurvePoint, 1.60.1.69913)). **Not** JotC's bonus, Holy Strike or Consecration |
| Reverence (3), new | "Allows 30% of your Mana regeneration to continue while casting." | 30% of spirit regen during the five-second rule (Holy builds only) |
| Purifying Power (2), new | "... reduces the cooldown of your Exorcism and Holy Wrath spells by 33%." | Exorcism CD 10 s |
| Holy Power (5) | "+15% Holy Shock crit, +5% crit on all other spells" | spell crit |
| Divine Precision (3), new | "Improves your chance to hit with Holy spells by 18%." | Holy spell hit |
| Consecrated Ground (2), new | "Gives your Holy spells 10% increased damage against the first 4 enemies that enter your Consecration." | Holy spell damage ×1.10 vs up to 4 targets standing in your Consecration |

Other Holy talents (Healing Light, Spiritual Focus, Unyielding Faith, Voice of Truth, Infusion
of Light, Illumination, Divine Favor, Holy Shock, Light's Vigil) have no melee-spec effect
and aren't modelled.

---

## Mana model

| Item | Value | Tag, source |
| --- | --- | --- |
| Base mana (60) | 1512 | [F] [client] (`PlayerExpectedStat`, `basemp.txt`, 1.60.1.69913); owned by character-stats ([conventions](#conventions-used-below)) |
| Max mana | base + Int→mana, see character-stats | [C] |
| Costs, Ret build (Benediction 5/5; no Holy Conduit) | SoC 189, SoR 180, SotC 144, Judgement 81, Holy Strike 18, Consecration r5 508 / r1 121, Exorcism 310, HoW 382 (instant with Instrument of Law, so Benediction applies). If Holy Conduit 2/2 is taken, Consecration r5 is 282 (additive) or 305 (multiplicative) [?] | [F] costs × talent |
| Costs, Prot build (no Benediction) | SoF 200, Judgement 90 (0 after Swift Judgement), Holy Strike 20, Holy Shield 240, Consecration r5 565, HotR 90, RF 453 | [F] |
| Sanctified Judgement 3/3 | +126 per SoC judgement, +120 per SoR/SoF judgement | [F] |
| Spirit regen | the class formula with the five-second rule; any mana spent starts a 5 s window with no spirit regen (Reverence lets some continue) | [C] → [character-stats.md](../mechanics/character-stats.md) |
| mp5 | gear mp5 and Blessing of Wisdom (40 mp5) tick through the five-second rule | [F]/[C] |
| The sim's ticks | every 2 s from a random phase in the first 2 s (the power tick the druid's Energy shares), each `mp5 × 2/5` plus, 5 s or more after the last mana spent, `15 + Spirit / 5` from the sheet's Spirit (Reverence: 10% per rank of it inside the rule). The fight starts with full mana, and a seal cast before the pull costs nothing and starts no five-second rule | [?] engine choices (the tick's phase and the pre-pull) |
| Mana from a spell effect | Sanctified Judgement, Shield Specialization: 0.5 threat per mana gained ([threat.md](../mechanics/threat.md#threat-from-healing-power-gains-and-buffs)) | [?] |
| Shield Specialization (Prot 3/3) | **+6% max mana per block**, at most every 3 s | [F] |
| Judgement of Wisdom (another paladin's) | chance on each of your hits to restore 59 mana (Classic 50% [?]) | [F]/[?] |
| Consumables | Major Mana Potion (1350–2250, 2 min, potion cooldown); Demonic Rune / Dark Rune (900–1500, 2 min, shared rune cooldown, separate from potions). Mageblood Potion, Nightfin Soup, Brilliant Mana Oil for mp5. **Values and cooldowns are owned by** [buffs-debuffs-consumables.md](../mechanics/buffs-debuffs-consumables.md) | [C] |

**What this means for Retribution in Forever.** Judging SoC costs 81 and returns 126, so it
**gains** 45 mana per judgement. A 30 s SoC cycle (one recast, 3.75 judgements, 3 Holy
Strikes) costs about 74 mana net ([Worked example 8](#worked-examples)). Ret no longer goes
OOM just from maintaining its seal. Mana is a **budget for Consecration, Exorcism, Hammer of
Wrath and seal twisting**, and each of those is gated by a mana threshold in the rotation.
The Classic problem of recasting SoC after every judgement is gone.

**Protection** has effectively unlimited mana while it's being hit, from Shield
Specialization (6% of max mana up to every 3 s). The sim still tracks it, because pulls and
downtime without blocks exist.

---

## Threat (paladin-specific)

Global threat rules (base multipliers, taunt, threat per healing and mana gained, Salvation
stacking) live in [threat.md](../mechanics/threat.md). Paladin inputs:

| Source | Threat | Tag |
| --- | --- | --- |
| Holy damage with Righteous Fury | damage × **1.9** | [F] [client] (SpellEffect, 1.60.1.69913; [25780][f25780]) |
| Physical damage (white hits) | damage × 1.0. RF doesn't affect it and paladins have no stance | [C] |
| Holy Shield block damage | damage × 1.9 × **1.2** (the 20% is multiplicative with RF [?]; additive would be ×2.1) | [F]/[?] |
| Holy Strike | damage × 1.9 × **1.25** (Iron Creed 5/5) | [F] [client] (SpellEffect, CurvePoint, 1.60.1.69913) |
| Judgement of Fury | damage × 1.9, **taunt 4 s** (sets you to top threat; no-op when you already are) | [F] |
| Retribution Aura | 30 per hit taken × 1.9 | [F] |
| Instrument of Law (Ret) | all threat × 0.8 while RF is off | [F] [client] (TraitDefinitionEffectPoints, 1.60.1.69913) |
| Blessing of Salvation | −30% | [F] [client] (SpellEffect, 1.60.1.69913) |
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
so check it between GCD actions too.

| # | Action | Condition (UI setting, default) | Default |
| --- | --- | --- | --- |
| 0 | Pre-pull: SotC at −1.5 s, Judgement on pull, then SoC | `judgementDebuff = Crusader` and nobody else holds JotC (`jotcCoveredExternally = false`) | on |
| 1 | Seal of Command | seal missing, or `remaining ≤ sealRefreshMs` (1500 ms) | on |
| 2 | Judgement (JotC) | the debuff is missing or ≤ 3 s and `judgementDebuff = Crusader`. Needs SotC first: cast SotC (GCD), judge, recast SoC | on (rarely fires: 40 s duration, refreshed by melee) |
| 3 | Judgement (seal) | ready | on |
| 4 | Hammer of Wrath | target ≤ 20% health and `mana% ≥ howMinManaPct` (0) | on |
| 5 | Holy Strike | ready | on |
| 6 | Exorcism | target Undead/Demon and `mana% ≥ exoMinManaPct` (20) | on (auto-gated by target type) |
| 7 | Consecration (rank 5) | `mana% ≥ consecrateHighManaPct` (60) | on |
| 8 | Consecration (rank 1) | `mana% ≥ consecrateLowManaPct` (30) | on |
| 9 | Twist: SoR, then after the next swing SoC | talent taken and `mana% ≥ twistMinManaPct` (80). Cast SoR when the swing lands within `twistWindowMs` (≤ 1500 ms) so the echo is used at once; recast SoC after that swing | **off** |
| — | Mana potion / rune | missing mana ≥ the item's max restore and off cooldown | on when the consumables preset includes it (potion: Standard raid; rune: Max-consumables raid) |
| — | Holy Wrath | Undead/Demon AoE | off |

Notes:

- **No seal twisting by default.** A twist pair (SoC→SoR, swing, SoR→SoC, swing) costs
  369 mana and 2 GCDs. It adds **two SoR procs** on top of the SoC rolls those swings get
  anyway: 2 × 88.96 ≈ 178 damage before multipliers at 100 SP (worked example 6), or about
  0.5 per mana. Consecration returns more per mana (at 250 SP: rank 5 about 1.0, rank 1
  about 2.0; worked example 7), so it comes first. Twisting is the mana sink after
  Consecration.
- Recast SoC **before** it expires, so there's always a seal for Judgement. Don't recast
  it early for no reason: the Judgement doesn't care about remaining duration.
- Improved Seals and Vengeance make JoC and SoC scale with SP. Champion of the Light turns
  Int into SP. **Intellect and spell damage are real Retribution stats in Forever.**
- `sealPrimary = SoR` is available for fast or weak weapons. SoC wins with any slow 2H:
  about 47 base DPS from SoC vs about 23 from SoR at 1200 AP, 3.5 speed, 250 weapon average.

### Retribution defaults

| Setting | Default | Why / source |
| --- | --- | --- |
| Talents | **`250003-503-052052310012330321`** (Holy 10 / Prot 8 / Ret 33): Improved Holy Strike 2, Divine Strength 5, Improved Seals 3; Toughness 5, Precision 3; Benediction 5, Improved Judgement 2, Conviction 5, Vindication 2, Sanctified Judgement 3, Seal of Command, Sacred Arbiter, Crusade 2, 2HWS 3, Vengeance 3, Champion of the Light 3, Instrument of Law 2, Twist of Light | the most popular Forever Ret build when chosen, 2026-09-22 ([talents](https://foreverchanges.pro/talents/paladin)); decoded by tier-then-column order ([data/talents.md](../data/talents.md#build-codes-verified)) [F] |
| Race | **Human** (Alliance) with a 2H sword; **Undead** for Horde presets | Sword Spec +2% crit to everything [F] |
| Weapon | slowest high-DPS pre-raid 2H (speed ≥ 3.4 preferred; ties → sword for Human) from `src/data/items` | SoC scales with weapon damage per swing; the 7 PPM normalizes procs/min, so a slow weapon gives bigger procs and more procs per swing |
| Seal / judgement | SoC; JotC maintained by you | [F] rotation above |
| Aura | Retribution Aura (no DPS effect unless you're hit); raid aura choice lives in the buffs doc | — |
| Buffs | standard raid buffs from the buffs doc: Kings and Might (133) from paladins, Windfury and totems in a melee group, both factions | [F] factions |
| Consumables tier | The **Standard raid** preset from [buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset): Elixir of the Mongoose, Elixir of Greater Strength (Classic: Giants), Greater Arcane Elixir (the buffs doc's per-spec entry for Ret: spell power matters now), Smoked Desert Dumplings, a Dense Sharpening Stone, Major Mana Potion. The Max-consumables preset adds Juju Power, Juju Might, R.O.I.D.S., Elixir of Holy Power, an Elemental stone, Demonic/Dark Rune and Flask of Supreme Power. **No world buffs** ([doctrine §1](../doctrine.md#1-what-were-building)) | buffs doc owns names, values and presets |

---

## Protection: model and rotation

### Threat sources, in expected order of size

Holy Shield block damage (×2.28 threat), Seal of Fury procs (every swing, plus Reckoning
extra attacks), Judgement of Fury, Holy Strike (×2.375), Consecration (×1.9, and AoE),
white hits, Retribution Aura (if chosen), Exorcism (Undead/Demon).

### Classic Era approach (baseline)

Righteous Fury on, **Holy Shield kept up**, Seal of Righteousness with Judgement when mana
allows, Consecration for AoE and bursts, downranked for mana (bind every rank), Blessing of
Sanctuary on tanks
([Icy Veins Classic prot paladin](https://www.icy-veins.com/wow-classic/protection-paladin-tank-pve-rotation-cooldowns-abilities)) [C].
Forever removes the mana constraint (Shield Specialization, seal not consumed) and replaces
Sanctuary with Seal of Fury, Iron Creed and Holy Strike.

### Forever priority list (default)

| # | Action | Condition (UI setting, default) | Default |
| --- | --- | --- | --- |
| 0 | Righteous Fury | missing (pre-pull) | on (forced) |
| 1 | Seal (`protSeal = Fury`) | missing, or remaining ≤ 1500 ms | on |
| 2 | Holy Shield | buff missing or 0 charges left | on |
| 3 | Judgement | ready (off GCD) | on |
| 4 | Swift Judgement | Judgement on cooldown with ≥ 4 s left (off GCD), then judge again | on |
| 5 | Holy Strike | ready, and `strike = HolyStrike` | on |
| 5b | Hammer of the Righteous instead of Holy Strike | `strike = HotR` or targets ≥ `hotrMinTargets` (3). 1H axe, mace or sword only | off (single target) |
| 6 | Exorcism | Undead/Demon | on (auto-gated) |
| 7 | Consecration (rank `consecrateRank`, 5) | `mana% ≥ consecrateMinManaPct` (20) | on |
| 8 | Hammer of Wrath | target ≤ 20% health | on |
| — | Judgement debuff | `protJudgementDebuff`: None, Wisdom or Light. Pre-pull: seal, judge, then Seal of Fury | None |
| — | Templar's Bulwark, Divine Protection | defensive; no TPS effect | off |

Holy Strike and HotR share category 2404: casting one locks the other for that spell's
cooldown [F] [client] (SpellCategories, 1.60.1.69913). Single target: Holy Strike wins. It's cheaper, scales with SP (0.429), and
Iron Creed adds 25% threat; HotR has no SP coefficient in the data.

### Protection defaults

| Setting | Default | Why / source |
| --- | --- | --- |
| Talents | **`2-4530513321301551-502`** (Holy 2 / Prot 42 / Ret 7): Improved Holy Strike 2; Toughness 4, Redoubt 5, Precision 3, Anticipation 5, Improved SoF, Improved RF 3, Shield Spec 3, Sacred Duty 2, Swift Judgement, 1HWS 3, Templar's Bulwark, Reckoning 5, Iron Creed 5, Holy Shield; Deflection 5, Improved Judgement 2 | the most popular Forever Prot build when chosen, 2026-09-22 [F] |
| Race | Human (1H sword) / Undead (Horde) | +2% crit; Dwarf is a close choice for Stoneform |
| Weapon | best pre-raid 1H **sword, mace or axe** (so HotR is usable) + shield | [F] HotR requirement |
| Seal | **Seal of Fury** (SoR selectable) | [F] |
| Aura | Devotion Aura (option: Retribution Aura, 30 × 1.9 threat per hit taken) | [F] |
| Consumables tier | The **Standard raid** preset from [buffs §6.3](../mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset): Elixir of Greater Defense (Classic: Superior Defense), Elixir of Fortitude (+200 health), Elixir of Holy Power (+40 Holy), Nightfin Soup (+22 spell damage), Wizard Oil, Major Mana Potion. The Max-consumables preset adds Flask of Supreme Power, Greater Arcane Elixir, Brilliant Wizard Oil (replacing Wizard Oil) and Demonic/Dark Rune. No world buffs | buffs doc owns names, values and presets |

---

## Implementation notes

- **Damage-seal procs (SoC, SoR, SoF) are triggered by landed main-hand auto attacks only**
  (`ProcTypeMask 0x4`) [F] [client] (SpellAuraOptions, 1.60.1.69913). Holy Strike, HotR,
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
- Skipped (under 0.5%): Touch of the Grave until its formula is known, SotC's own
  attack-speed swap during the 1.5 s pre-pull, Eye for an Eye, the Seal of Fury absorb
  (tank survival only), JoW/JoL healing and mana to others.

### How the engine does it

The class foundation (`src/sim/classes/paladin/`) and the engine's generic spells and mana
(`src/sim/engine/sim.ts`; [combat-tables §3 "Defense type"](../mechanics/combat-tables.md#3-special-yellow-attacks)):

- **Spells.** Every damaging paladin spell is a row of data (`spells.ts`): school, damage class
  (`SpellCategories.DefenseType`), No Active Defense, Always Hit, base range (or weapon share),
  SP coefficient, its own damage and threat multipliers, its share of JotC's bonus, and whether it
  triggers procs. One engine function rolls the right table, deals the damage and threat, and fires
  on-hit and crit procs unless the spell triggers none (a triggered spell without NOT_A_PROC:
  [conventions](#conventions-used-below)). The numbers and attributes are the client's, checked by
  `data.test.ts`.
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
- **Righteous Fury** is up for the whole fight when the spec fights with it (Protection) and
  down otherwise (Retribution): ×1.9 on Holy threat, Improved Righteous Fury's damage taken
  with it, and Instrument of Law's ×0.8 on all threat without it.
- **Talents** are effects (Divine Strength, Conviction, Crusade, Two-Handed Weapon Specialization,
  Vengeance, Vindication, Champion of the Light, …) or changes to the ability and spell rows
  (Benediction, Holy Conduit, Improved Judgement, Improved Seals, Sanctified Judgement, Sacred
  Arbiter, Iron Creed, Improved Holy Strike, Purifying Power, Instrument of Law's cast time).
  Vengeance's stack comes from any crit that triggers procs: white, special, Seal of Command's
  proc, judgement or spell.
- **The core both specs share** (`setup.ts` `paladinCore`): the spec's seal (Seal of Command or
  Seal of Fury) 1.5 s before the pull and recast when it has 1.5 s left, and its judgement
  whenever Judgement is ready. The specs' own rows (Holy Strike, Consecration, Exorcism, Hammer of
  Wrath, Judgement of the Crusader's upkeep, seal twisting; Holy Shield, Swift Judgement,
  Hammer of the Righteous) and their settings come next; their ability rows already exist.
- **Base stats** follow [character-stats](../mechanics/character-stats.md#paladin-and-druid-base-attributes):
  the attributes, base health, dodge and crits are all [?] placeholders under D24, which the
  results list.
- **Not modelled yet:** Twist of Light, Holy Shield's block damage, Reckoning, Redoubt, Swift
  Judgement, Hammer of the Righteous, Holy Wrath, Judgement of Fury's taunt, Sacred Arbiter's
  judgement refresh, the utility seals, the T1 5-piece's −0.5 s Judgement, and Blessing of Wisdom
  and Mana Spring Totem, which only paladins use and aren't in the buff catalogue yet.

---

## Worked examples

Assumptions unless stated: level 60 vs a level-63 boss; hits land, no crit; no buffs; 2H
weapon **3.50 speed, 200–300 damage (average 250)**; **AP 1200**; **SP 100**. Numbers use
the defaults marked [?] above, so a test failing after a beta measurement means the default
changed, not a bug. Every example runs through the engine in
`src/sim/classes/paladin/paladin.test.ts`, except 12 (Holy Shield) and 17 (Twist of Light),
which come with the rotations that use them.

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
4. **Judgement of Righteousness r8 at 60**: (162..178) + 8.2 → average 178.2 + 0.5 × 100 =
   **228.2**; ×1.15 = **262.43**.
5. **Holy Strike r8**: normalized MH = 250 + 1200 × 3.3 / 14 = 532.857; + 93 (average of
   81.375..104.625) = 625.857; × 0.40 = 250.343; + 0.429 × 100 = **293.24**; Sacred Arbiter
   ×1.10 = **322.57**. Range with Sacred Arbiter: **295.45–349.68**. Holy school: boss
   armor doesn't reduce it.
6. **SoR proc, 2H, r8 at 60**: 1.2 × 18.80 × 3.5 = 78.96 + 0.1 × 100 = **88.96**; ×1.15 =
   **102.30**. Same weapon 1H-style (0.85): 55.93 + 10 = 65.93.
7. **Consecration r5, SP 300, one target**: per tick 12 + 27 + 0.095 × 300 = **67.5**; 8 ticks
   = **540**. A fifth enemy takes only 12 per tick = **96**. Rank 1 on one target: 8 × (2 +
   4 + 28.5) = **276** for 135 mana.
8. **Retribution mana cycle** (Benediction 5/5, Sanctified Judgement 3/3, Improved Judgement
   2/2, Improved Holy Strike 2/2): Judgement = floor(1512 × 0.06) = 90 → ×0.9 = **81**;
   return 0.6 × 210 = **126** → **+45** per SoC judgement. SoC recast 189. Over 30 s:
   189 + 3 × 18 − 3.75 × 45 = **74.25 mana** (2.475 mana/s).
9. **Damage multiplier stack on a white hit** with 2HWS 3/3, Vengeance 3/3 at 5 stacks and
   Crusade 2/2 vs a non-Undead boss: 1.09 × 1.15 × 1.02 = **×1.27857**. On a SoC proc (Holy):
   1.15 (Improved Seals) × 1.15 × 1.02 = **×1.34895**.
10. **Hammer of Wrath r3, SP 300**: 498 + 128.7 = **626.7** average; with Instrument of Law
    2/2 it's instant with a 1.0 s GCD.
11. **JotC on Exorcism (default coefficient rule)**: +161 × 0.429 = **+69.07** per Exorcism.
    On a SoC proc: 161 × 0.203 = +32.68, added after your own damage multipliers and before a
    crit's.
12. **Protection Holy Shield, SP 300**: 221 + 0.08 × 300 = **245** damage per block; threat
    245 × 1.9 × 1.2 = **558.6** (additive-modifier alternative: 245 × 2.1 = 514.5). After
    4 blocks the buff ends even if 10 s haven't passed.
13. **Seal of Fury, SP 300**: 35 + 30 = **65** Holy per landed white hit; threat 65 × 1.9 =
    **123.5**; absorb 32.5 with a shield. Judgement of Fury at 60: average 160.38 +
    0.45 × 300 = **295.38** (the default Prot build has no Improved Seals; with it,
    ×1.15 = 339.69).
14. **Holy Strike threat (Prot)**: a 300-damage Holy Strike → 300 × 1.9 × 1.25 = **712.5**.
15. **Shield Specialization**: with 6000 max mana, blocks at t = 0.0, 1.0, 3.2 s restore
    360 mana at 0.0 and 3.2 only (3 s ICD).
16. **SoC ICD with Windfury**: a white hit at t = 0 procs SoC; the Windfury extra attack at
    t = 0 can't proc SoC (ICD until t = 1.0). The next white hit at t = 3.5 can.
17. **Twist of Light**: SoC active; cast SoR at t = 10.0; the white hit at t = 10.6 applies
    SoR's proc **and** rolls SoC at 40.83% (ICD permitting), then the Echo is gone. The
    white hit at t = 14.1 applies SoR only.
18. **Judgement doesn't consume the seal**: SoC active with 20 s left; Judgement at t → the
    SoC aura still has 20 s left, and a white hit at t + 0.5 can proc SoC.
19. **Vengeance ramp (3/3)**: crits at t = 0, 5, 8 → 3 stacks = +9% Physical/Holy until
    t = 38; no crit after that → the buff drops at t = 38.

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
4. **SoR formula**: per-hit damage vs weapon speed and SP, 1H and 2H, and whether a
   `+0.03 × weapon average ±1` term exists (that term is from TBC-era wiki text, so it's
   forbidden to adopt without a beta test). *Test:* two 2H weapons of different speed and
   one 1H, with no SP; then +SP.
5. **JotC interaction**: flat +161 per Holy hit, or scaled by each spell's coefficient? And
   does it come after your own damage multipliers (the sim's default) or before them?
   *Test:* JoC and SoC-proc damage with and without your JotC on a mob, then again with
   Vengeance stacked. This is the biggest single uncertainty for Ret DPS.
6. **Holy Strike formula**: is the flat 81–105 multiplied by 40%, and is the 0.429 SP added
   in full? *Test:* no-SP and +SP swings; compare with 0.4 × (normalized weapon + 93).
7. **Judgement of Command SP**: is the coefficient halved with the base when the target
   isn't stunned? *Test:* JoC on a mob with and without +SP.
8. **Redoubt proc chance** per rank (10% flat per the tooltips vs 2%/rank per the trait
   curve)? *Test:* count Redoubt procs per melee hit taken at 1–5 ranks.
9. **Reckoning** extra-attack stacking cap and block-trigger rate. *Test:* block-heavy
   tanking log.
10. **Seal of Fury**: flat 35 or weapon-speed scaled (the aura holds an SoR-style value)?
    Absorb stacking? Improved Seal of Fury's actual mana return ("restore 0 Mana")?
11. **Hammer of the Righteous**: target count (3 or 4 in total?), whether "weapon DPS"
    includes AP, avoidance, and whether its SP coefficient is really 0.
12. **Sanctified Judgement**: base or modified seal cost; refund on a missed JoR or JoF?
13. **Seal of Wisdom / Judgement of Wisdom** proc rates in Forever.
14. **Level-based partial resists** on melee-class Holy (SoC, judgements, Holy Strike) vs a
    level-63 target. See [combat-tables.md](../mechanics/combat-tables.md).
15. **Touch of the Grave** (Undead) drain amount.
16. **Righteous Fury and healing threat**; Holy Shield's 20% additive vs multiplicative with
    RF ([threat.md](../mechanics/threat.md)).
17. **Seal of the Crusader AP at 60**: 306 or 325? The client value is settled: 306 + 2.4 per
    level over levels 52–60 [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913). Whether the
    server applies the per-level term is the in-game question. *Test:* at level 60, sheet AP
    with and without SotC.
18. **Consecration ticks**: does each tick roll spell hit and crit separately (Forever
    periodic crits)? Which 4 targets count as "first to enter" on a multi-mob pull?
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
    ([Seal of Command](#seal-of-command-soc); in game: question 23).
22. **Which spells trigger procs, and minor mechanics.** The sim follows the client's
    NOT_A_PROC attribute ([conventions](#conventions-used-below)): SoC's proc and the damage
    judgements trigger on-hit and crit procs (Windfury, Crusader, Hand of Justice, Vengeance,
    Vindication); SoR's and SoF's procs and Consecration's ticks trigger none [?]. This one isn't
    minor: if SoR's and SoF's procs did trigger them, default Protection would deal about 12%
    more DPS and 11% more TPS, almost all from Windfury. *Test:* in a Windfury Totem group, count
    Windfury attacks per landed white swing with Seal of Fury up and with no seal (500+ swings
    each; the sim expects the same 20%), and Vengeance stacks from SoR crits alone. The minor ones
    (under 0.5% each, but the defaults are guesses): SotC's per-swing damage reduction (÷1.4
    assumed); whether Holy Shield's block damage can miss or crit; Eye for an Eye's damage school
    and threat; whether Hammer of Wrath's 1 s cast (without Instrument of Law) pauses white swings
    and keeps Judgement from being cast, which the sim doesn't do.
23. **Judgement of Command's miss chance.** The damage spell 20966 carries Always Hit, but the
    dummy 20968 that casts it doesn't [F] [client] (SpellMisc, 1.60.1.69913). The sim assumes
    JoC never misses. *Test:* 200+ JoC judgements on mobs three levels above you, counting
    misses, with JoR judgements as the control (they should miss at the melee special rate).

24. **Mana regeneration's timing.** The sim ticks every 2 s from a random phase, and a seal cast
    before the pull is free and starts no five-second rule [?]. *Test:* a combat log of a
    paladin's mana over the first 20 s of a pull, with and without a pre-pull seal.

---

## Sources

| Source | What it covers | Ruleset |
| --- | --- | --- |
| [foreverchanges.pro /class/paladin](https://foreverchanges.pro/class/paladin) | every paladin talent and spell change, per-rank Forever and Classic tooltips, sources | Forever client 1.60.1.69913 vs Classic Era 1.15.9.69722 |
| [foreverchanges.pro /spellbook/paladin](https://foreverchanges.pro/spellbook/paladin) | per-rank costs, cooldowns, spell ids, trained levels, "Not in Forever" list | Forever vs Classic Era |
| [foreverchanges.pro /talents/paladin](https://foreverchanges.pro/talents/paladin) | tree layout, rank texts, **popular builds** (Holy `005320213225131051-5032-05`, Prot `2-4530513321301551-502`, Ret `250003-503-052052310012330321`) | Forever |
| [foreverchanges.pro /racials](https://foreverchanges.pro/racials) | race/class matrix (Undead paladins, both factions have all classes), racials | Forever |
| [foreverchanges.pro /downrank-calculator](https://foreverchanges.pro/downrank-calculator) | Classic Era servers use client-stored coefficients (except HL/FoL/PW:S); Forever stores full coefficients on low ranks | Forever / Classic Era |
| Client DB2 tables for build 1.60.1.69913 (Forever) and 1.15.9.69722 (Classic Era): SpellEffect, SpellAuraOptions, SpellMisc, SpellCategories, SpellCooldowns, SpellPower, SpellLevels, Spell (descriptions); raw files via the wago.tools API, parsed into `src/data/client/*.json` ([client.md](../data/client.md)) | exact base points, variance, level scaling, coefficients, proc masks, ICDs, charges, defense types, attributes, costs, cooldowns. Every value this doc had marked for a browser check was confirmed by the [claims check][client], with one correction (JoC is Always Hit). Per-spell browse links below | Forever [F] / Classic Era [C]. **Caveat:** the Classic Era client also carries Season of Discovery data (SoD runes, "S03" spells), so a Classic value was only adopted where it's a base-game spell id and consistent with Classic practice |
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
Forever build 1.60.1.69913 (`f…`) and Classic Era 1.15.9.69722 (`c…`), SpellEffect filtered
by SpellID. The same `filter[SpellID]` works on SpellAuraOptions, SpellMisc,
SpellCategories, SpellCooldowns, SpellPower and SpellLevels. Table roots:
[f-SpellAuraOptions], [f-SpellCategories], [f-SpellMisc], [f-SpellCooldowns], [f-SpellPower].

[f20424]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20424
[f20920]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20920
[f20968]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20968
[f20966]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20966
[f25713]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=25713
[f20293]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20293
[f20286]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20286
[f20308]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20308
[f20303]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20303
[f20423]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20423
[f20418]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20418
[f20414]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20414
[f10333]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10333
[f20271]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20271
[f20924]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20924
[f26573]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=26573
[f1280349]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1280349
[f10314]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10314
[f24239]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=24239
[f407632]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=407632
[f20928]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20928
[f25780]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=25780
[f1310735]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1310735
[f1311703]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1311703
[f20049]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20049
[f20050]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20050
[f1311074]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1311074
[f1311083]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1311083
[f1311084]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1311084
[f1311085]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1311085
[f1311087]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1311087
[f20224]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20224
[f20101]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20101
[f1237268]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1237268
[f20117]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20117
[f20111]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20111
[f20189]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20189
[f20196]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20196
[f20127]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20127
[f20128]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20128
[f20177]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20177
[f1310925]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1310925
[f20468]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20468
[f1311034]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1311034
[f1310994]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1310994
[f1311015]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1311015
[f1314103]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1314103
[f1224697]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1224697
[f9452]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=9452
[f440668]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=440668
[f25291]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=25291
[f25916]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=25916
[f20217]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20217
[f1038]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1038
[f25290]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=25290
[f10301]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10301
[f10293]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=10293
[f20357]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20357
[f20355]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20355
[f20349]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20349
[f20164]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=20164
[f1301702]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1301702
[f1301083]: https://wago.tools/db2/SpellEffect?build=1.60.1.69913&filter%5BSpellID%5D=1301083
[c20424]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20424
[c20968]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20968
[c20303]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20303
[c20924]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20924
[c20928]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20928
[c20101]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20101
[c25713]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=25713
[c20286]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20286
[c20914]: https://wago.tools/db2/SpellEffect?build=1.15.9.69722&filter%5BSpellID%5D=20914
[f-SpellAuraOptions]: https://wago.tools/db2/SpellAuraOptions?build=1.60.1.69913
[f-SpellCategories]: https://wago.tools/db2/SpellCategories?build=1.60.1.69913
[f-SpellMisc]: https://wago.tools/db2/SpellMisc?build=1.60.1.69913
[f-SpellCooldowns]: https://wago.tools/db2/SpellCooldowns?build=1.60.1.69913
[f-SpellPower]: https://wago.tools/db2/SpellPower?build=1.60.1.69913
[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
