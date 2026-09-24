// Level-60 base values per race and class (docs/mechanics/character-stats.md#base-stats-at-level-60).
//
// Values a tier 1–3 source supports, and D24 placeholders
// (docs/decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23), which are tagged [?]
// and listed in the results' assumptions. Anything else unknown is `null` and reported as missing.
// CLASS_BASE holds the supported values (`null` there means nobody has measured it), and
// BASE_PLACEHOLDERS below holds the placeholders, in one replaceable table: every druid and every
// paladin base value nobody has measured is one, their attribute rows included.
import type { ClassId } from '../types'

export interface Attributes {
  str: number
  agi: number
  sta: number
  int: number
  spi: number
}

/**
 * Warrior base attributes by race: Str/Agi/Sta/Int [C] (WarriorSim races.js at pre-SoD commit
 * 180a3cc); raw Spirit [?] (post-SoD levelstats.js only; the Human Spirit racial multiplies it).
 * Skyborne rows are unknown (OQ-1). docs/mechanics/character-stats.md#warrior-base-attributes
 */
const WARRIOR_ROWS: Record<string, Attributes | null> = {
  'alliance-human': { str: 120, agi: 80, sta: 110, int: 30, spi: 45 },
  'alliance-dwarf': { str: 122, agi: 76, sta: 113, int: 29, spi: 44 },
  'alliance-night-elf': { str: 117, agi: 85, sta: 109, int: 30, spi: 45 },
  // Gnome Int is 33: Forever removed the Classic +5% Int racial (character-stats §warrior base attributes).
  'alliance-gnome': { str: 115, agi: 83, sta: 109, int: 33, spi: 45 },
  'horde-orc': { str: 123, agi: 77, sta: 112, int: 27, spi: 48 },
  'horde-undead': { str: 119, agi: 78, sta: 111, int: 28, spi: 50 },
  'horde-tauren': { str: 125, agi: 75, sta: 112, int: 25, spi: 47 },
  'horde-troll': { str: 121, agi: 82, sta: 111, int: 26, spi: 46 },
  'alliance-skyborne-high-order': null,
  'horde-skyborne-windshaper': null,
}

/**
 * Druid base attributes by race at level 60, as the character sheet shows them: [?] placeholders
 * (D24); origin: mangos, not evidence
 * (docs/mechanics/character-stats.md#paladin-and-druid-base-attributes, OQ-1):
 * https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql.
 * Both rows are the class row Str 65, Agi 60, Sta 70, Int 100, Spi 110 plus the [C] race offsets.
 * ClassicSim's pre-SoD rows reproduce them (corroboration, not evidence: they came from a guide
 * whose method is unknown). Skyborne has no known offsets, so both Skyborne rows are that class
 * row, with neutral offsets.
 */
const DRUID_ROWS: Readonly<Record<string, Attributes>> = {
  'alliance-night-elf': { str: 62, agi: 65, sta: 69, int: 100, spi: 110 },
  'horde-tauren': { str: 70, agi: 55, sta: 72, int: 95, spi: 112 },
  // [?] placeholder (D24): the class row, neutral race offsets (Skyborne's are unknown, OQ-1).
  'alliance-skyborne-high-order': { str: 65, agi: 60, sta: 70, int: 100, spi: 110 },
  'horde-skyborne-windshaper': { str: 65, agi: 60, sta: 70, int: 100, spi: 110 },
}

/**
 * Paladin base attributes at level 60, [?] placeholders (D24 rule 2;
 * docs/mechanics/character-stats.md#paladin-and-druid-base-attributes). Origin: the mangos
 * emulator's 1.12 rows, not evidence; they agree exactly with the [C] race offsets. ClassicSim's
 * pre-SoD rows (f9cb48d, PR #103) reproduce them, which corroborates them but isn't evidence.
 * Human 105/65/100/70/78 and Dwarf 107/61/103/69/74 on the sheet; Spirit is stored raw, before The
 * Human Spirit's ×1.05 (75 × 1.05 = 78.75, floored to the sheet's 78). Undead is derived, so a
 * placeholder too: the Human row plus the [C] Undead offset (−1/−2/+1/−2/+5); Classic Era has no
 * Undead paladin. The naked Classic Era sheets of OQ-1 replace them.
 */
const PALADIN_ROWS: Readonly<Record<string, Attributes>> = {
  'alliance-human': { str: 105, agi: 65, sta: 100, int: 70, spi: 75 },
  'alliance-dwarf': { str: 107, agi: 61, sta: 103, int: 69, spi: 74 },
  'horde-undead': { str: 104, agi: 63, sta: 101, int: 68, spi: 80 },
}

/**
 * Shaman base attributes at level 60, [?] placeholders (D24 rule 2; docs/classes/shaman.md#base-stats,
 * character-stats.md OQ-1). Origin: the mangos emulator's 1.12 rows for Orc, Tauren and Troll
 * shamans (https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql),
 * not evidence; they are the class row Str 85, Agi 55, Sta 95, Int 90, Spi 100 plus the [C] race
 * offsets, and wowsims/classic's `base_stats.go` has the same rows. Classic Era had no Dwarf shaman:
 * its row is the class row plus the [C] Dwarf offset (+2/−4/+3/−1/−1), so a placeholder too. The
 * Windshaper Skyborne row is the class row, with neutral offsets (Skyborne's are unknown, OQ-1).
 */
const SHAMAN_ROWS: Readonly<Record<string, Attributes>> = {
  'horde-orc': { str: 88, agi: 52, sta: 97, int: 87, spi: 103 },
  'horde-tauren': { str: 90, agi: 50, sta: 97, int: 85, spi: 102 },
  'horde-troll': { str: 86, agi: 57, sta: 96, int: 86, spi: 101 },
  'horde-skyborne-windshaper': { str: 85, agi: 55, sta: 95, int: 90, spi: 100 },
  'alliance-dwarf': { str: 87, agi: 51, sta: 98, int: 89, spi: 99 },
}

/**
 * Rogue base attributes at level 60, [?] placeholders (D24 rule 2;
 * docs/classes/rogue.md#76-base-values, docs/mechanics/character-stats.md OQ-1). Origin: the mangos
 * emulator's 1.12 rows, https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql,
 * not evidence; every race's row is the Human class row Str 80, Agi 130, Sta 75, Int 35, Spi 50 plus
 * the [C] race offsets, and wowsims/classic `base_stats.go` copies the class row. Spirit is stored
 * raw (the Human's sheet 52 is 50 × 1.05). Gnome Int is 38: Forever removed its +5% Int. Skyborne has
 * no known offsets, so both Skyborne rows are the class row. A naked Classic Era Human rogue sheet
 * (October 2019) showed 80 Stamina, not 75; Stamina moves no DPS number.
 */
const ROGUE_ROWS: Readonly<Record<string, Attributes>> = {
  'alliance-human': { str: 80, agi: 130, sta: 75, int: 35, spi: 50 },
  'alliance-dwarf': { str: 82, agi: 126, sta: 78, int: 34, spi: 49 },
  'alliance-night-elf': { str: 77, agi: 135, sta: 74, int: 35, spi: 50 },
  'alliance-gnome': { str: 75, agi: 133, sta: 74, int: 38, spi: 50 },
  'horde-orc': { str: 83, agi: 127, sta: 77, int: 32, spi: 53 },
  'horde-undead': { str: 79, agi: 128, sta: 76, int: 33, spi: 55 },
  'horde-troll': { str: 81, agi: 132, sta: 76, int: 31, spi: 51 },
  // [?] placeholder (D24): the class row, neutral race offsets (Skyborne's are unknown, OQ-1).
  'alliance-skyborne-high-order': { str: 80, agi: 130, sta: 75, int: 35, spi: 50 },
  'horde-skyborne-windshaper': { str: 80, agi: 130, sta: 75, int: 35, spi: 50 },
}

/**
 * Mage base attributes at level 60, [?] placeholders (D24 rule 2; docs/classes/mage.md#base-stats,
 * character-stats.md OQ-1). Origin: the mangos emulator's 1.12 class row, Str 30, Agi 35, Sta 45,
 * Int 125, Spi 120 (https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql;
 * wowsims/classic's `ClassBaseStats` has the same), plus the [C] race offsets, not evidence. Its Human,
 * Undead and Troll rows fit that model; its Gnome row (Int 133) fits neither it nor Classic's +5%
 * Intellect racial, which Forever removed, so the Gnome row is the model's. Classic Era had no Orc
 * mage (the class row plus the [C] Orc offset), and the High Order Skyborne row is the class row, as
 * Skyborne offsets are unknown (OQ-1).
 */
const MAGE_ROWS: Readonly<Record<string, Attributes>> = {
  'alliance-human': { str: 30, agi: 35, sta: 45, int: 125, spi: 120 },
  'alliance-gnome': { str: 25, agi: 38, sta: 44, int: 128, spi: 120 },
  'alliance-skyborne-high-order': { str: 30, agi: 35, sta: 45, int: 125, spi: 120 },
  'horde-orc': { str: 33, agi: 32, sta: 47, int: 122, spi: 123 },
  'horde-undead': { str: 29, agi: 33, sta: 46, int: 123, spi: 125 },
  'horde-troll': { str: 31, agi: 37, sta: 46, int: 121, spi: 121 },
}

/**
 * Warlock base attributes at level 60, [?] placeholders (D24 rule 2; docs/classes/warlock.md#76-base-values,
 * character-stats.md OQ-1). Origin: the mangos emulator's 1.12 rows,
 * https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql, not
 * evidence; wowsims/classic's `base_stats.go` has the class row Str 45, Agi 50, Sta 65, Int 110, Spi 115,
 * which is the Human row. Stored raw, before a racial: mangos's Human Spirit 120 is 115 × 1.05, and
 * its Gnome Intellect 119 is 113 × 1.05, a Classic racial Forever removed. Classic Era had no Troll
 * warlock: its row is the class row plus the [C] Troll offset (+1/+2/+1/−4/+1), a placeholder too.
 * Skyborne can't be warlocks.
 */
const WARLOCK_ROWS: Readonly<Record<string, Attributes>> = {
  'alliance-human': { str: 45, agi: 50, sta: 65, int: 110, spi: 115 },
  'alliance-gnome': { str: 40, agi: 53, sta: 64, int: 113, spi: 115 },
  'horde-orc': { str: 48, agi: 47, sta: 66, int: 107, spi: 118 },
  'horde-undead': { str: 44, agi: 48, sta: 66, int: 108, spi: 120 },
  'horde-troll': { str: 46, agi: 52, sta: 66, int: 106, spi: 116 },
}

/**
 * Priest base attributes at level 60, [?] placeholders (D24 rule 2; docs/classes/priest.md#73-base-values,
 * character-stats.md OQ-1). Origin: the mangos emulator's 1.12 rows,
 * https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql, not
 * evidence: the class row Str 35, Agi 40, Sta 50, Int 120, Spi 125 plus the [C] race offsets, which
 * wowsims/classic `base_stats.go` copies. Spirit is stored raw (the emulator's Human 131 is 125 ×
 * 1.05). The Gnome, a priest only in Forever, is the class row plus its offsets, Int 123: Forever
 * removed its +5% Int. No Skyborne priest in Forever.
 */
const PRIEST_ROWS: Readonly<Record<string, Attributes>> = {
  'alliance-human': { str: 35, agi: 40, sta: 50, int: 120, spi: 125 },
  'alliance-dwarf': { str: 37, agi: 36, sta: 53, int: 119, spi: 124 },
  'alliance-night-elf': { str: 32, agi: 45, sta: 49, int: 120, spi: 125 },
  'alliance-gnome': { str: 30, agi: 43, sta: 49, int: 123, spi: 125 },
  'horde-undead': { str: 34, agi: 38, sta: 51, int: 118, spi: 130 },
  'horde-troll': { str: 36, agi: 42, sta: 51, int: 116, spi: 126 },
}

export interface ClassBase {
  /** Base attributes by race id; null = unknown (OQ-1). */
  attributes: (race: string) => Attributes | null
  /** Melee AP at level 60 before Strength (character-stats §attack power formulas); null = unknown (OQ-7). */
  baseAp: number | null
  /** Base melee crit % before Agility; null = unknown (OQ-3). */
  baseCrit: number | null
  /** Crit % per point of Agility (PlayerExpectedStat.CritPerAgility). */
  critPerAgi: number
  /** Spell crit % per point of Intellect (PlayerExpectedStat.SpellCritPerIntellect). */
  spellCritPerInt: number
  /** Base spell crit %; null = unknown (OQ-3). */
  baseSpellCrit: number | null
  /** Base dodge % before Agility; null = unknown (OQ-5). */
  baseDodge: number | null
  /** Base parry %, or 0 for classes that can't parry (OQ-5). */
  baseParry: number
  /** Base block % with a shield (OQ-5). */
  baseBlock: number
  /** Base health before Stamina; null = unknown (OQ-2). */
  baseHealth: number | null
  /** Base mana before Intellect; null = no mana. */
  baseMana: number | null
  /**
   * Melee attack power per point of Strength and of Agility (ChrClasses); absent, the stat block's
   * 2 and 0 (the warrior's, the paladin's and a druid's before its forms). The rogue's are 1 and 1.
   */
  apPerStr?: number
  apPerAgi?: number
}

export const CLASS_BASE: Record<ClassId, ClassBase> = {
  warrior: {
    attributes: (race) => WARRIOR_ROWS[race] ?? null,
    // docs/mechanics/character-stats.md#other-base-values-at-level-60: 3 × 60 − 20 [C]
    baseAp: 160,
    // docs/mechanics/character-stats.md#other-base-values-at-level-60: warrior base crit 0 [C]
    baseCrit: 0,
    // docs/mechanics/character-stats.md#agility: 20 Agility per 1% [F]
    critPerAgi: 0.05,
    spellCritPerInt: 0,
    baseSpellCrit: 0,
    // docs/mechanics/character-stats.md#other-base-values-at-level-60: warrior base dodge 0 [C]
    // (RatingBuster's Classic Era table at pre-SoD commit d11164c)
    baseDodge: 0,
    // docs/mechanics/character-stats.md#other-base-values-at-level-60: base parry and block 5% [?]
    // (a Blizzard Classic forum statement, 2020-01-21)
    baseParry: 5,
    baseBlock: 5,
    // A D24 placeholder: BASE_PLACEHOLDERS below.
    baseHealth: null,
    baseMana: null,
  },
  paladin: {
    // Unmeasured (OQ-1): the attribute rows, crit, spell crit, dodge and health are D24
    // placeholders, in BASE_PLACEHOLDERS below.
    attributes: () => null,
    // 160 term [?] (OQ-7)
    baseAp: 160,
    baseCrit: null,
    // docs/mechanics/character-stats.md#agility: 19.76 Agility per 1% [F]
    critPerAgi: 0.0506,
    // docs/mechanics/character-stats.md#intellect: 59.88 Int per 1% [F] (OQ-4)
    spellCritPerInt: 0.0167,
    baseSpellCrit: null,
    baseDodge: null,
    baseParry: 5,
    baseBlock: 5,
    baseHealth: null,
    // docs/mechanics/character-stats.md#other-base-values-at-level-60: 1512 [F]
    baseMana: 1512,
  },
  druid: {
    // Unmeasured (OQ-1): the attribute rows, caster attack power, crit, spell crit, dodge and
    // health are D24 placeholders, in BASE_PLACEHOLDERS below.
    attributes: () => null,
    baseAp: null,
    baseCrit: null,
    // docs/mechanics/character-stats.md#agility: 20 Agility per 1% [F]
    critPerAgi: 0.05,
    // docs/mechanics/character-stats.md#intellect: 59.88 Int per 1% [F]
    spellCritPerInt: 0.0167,
    baseSpellCrit: null,
    baseDodge: null,
    // Druids can't parry or block (character-stats §other base values).
    baseParry: 0,
    baseBlock: 0,
    baseHealth: null,
    // docs/mechanics/character-stats.md#other-base-values-at-level-60: 1244 [F]
    baseMana: 1244,
  },
  shaman: {
    // Unmeasured (docs/classes/shaman.md#base-stats): the attribute rows, attack power, crit, spell
    // crit, dodge and health are D24 placeholders, in BASE_PLACEHOLDERS below.
    attributes: () => null,
    baseAp: null,
    baseCrit: null,
    // docs/classes/shaman.md#base-stats: PlayerExpectedStat.CritPerAgility 0.000508, 19.69 Agility per 1% [F]
    critPerAgi: 0.0508,
    // PlayerExpectedStat.SpellCritPerIntellect 0.000169, 59.17 Intellect per 1% [F]
    spellCritPerInt: 0.0169,
    baseSpellCrit: null,
    baseDodge: null,
    // A shaman parries only with Spirit Weapons, a talent (docs/classes/shaman.md#base-stats);
    // shields block from the base 5% [?] (character-stats OQ-5).
    baseParry: 0,
    baseBlock: 5,
    baseHealth: null,
    // docs/classes/shaman.md#base-stats: PlayerExpectedStat.BaseMana and basemp.txt, 1520 [F]
    baseMana: 1520,
  },
  rogue: {
    // Unmeasured (OQ-1): the attribute rows, attack power, crit and health are D24 placeholders, in
    // BASE_PLACEHOLDERS below (docs/classes/rogue.md#76-base-values).
    attributes: () => null,
    baseAp: null,
    baseCrit: null,
    // docs/classes/rogue.md#76-base-values: 29 Agility per 1% (PlayerExpectedStat.CritPerAgility 0.000345) [F]
    critPerAgi: 0.0345,
    // No spell crit from Intellect (PlayerExpectedStat.SpellCritPerIntellect 0) [F]; base spell crit is a placeholder.
    spellCritPerInt: 0,
    baseSpellCrit: null,
    baseDodge: null,
    baseParry: 5,
    baseBlock: 0,
    baseHealth: null,
    // No mana (PlayerExpectedStat.BaseMana 0) [F].
    baseMana: null,
    // ChrClasses AttackPowerPerStrength 1 and AttackPowerPerAgility 1 [F] (docs/classes/rogue.md#76-base-values).
    apPerStr: 1,
    apPerAgi: 1,
  },
  mage: {
    // Unmeasured (docs/classes/mage.md#base-stats): the attribute rows, crit, spell crit, dodge and
    // health are D24 placeholders, in BASE_PLACEHOLDERS below; base attack power has none.
    attributes: () => null,
    baseAp: null,
    baseCrit: null,
    // docs/classes/mage.md#base-stats: PlayerExpectedStat.CritPerAgility 0.000514, 19.46 Agility per 1% [F]
    critPerAgi: 0.0514,
    // PlayerExpectedStat.SpellCritPerIntellect 0.000168, 59.5 Intellect per 1% [F]
    spellCritPerInt: 0.0168,
    baseSpellCrit: null,
    baseDodge: null,
    // A mage can't parry or use a shield [C].
    baseParry: 0,
    baseBlock: 0,
    baseHealth: null,
    // docs/classes/mage.md#base-stats: PlayerExpectedStat.BaseMana and basemp.txt, 1213 [F]
    baseMana: 1213,
  },
  warlock: {
    // Unmeasured (docs/classes/warlock.md#76-base-values): the attribute rows, attack power, crit,
    // spell crit, dodge and health are D24 placeholders, in BASE_PLACEHOLDERS below.
    attributes: () => null,
    baseAp: null,
    baseCrit: null,
    // PlayerExpectedStat.CritPerAgility 0.0005, 20 Agility per 1% [F]
    critPerAgi: 0.05,
    // PlayerExpectedStat.SpellCritPerIntellect 0.000165, 60.6 Intellect per 1% [F]
    spellCritPerInt: 0.0165,
    baseSpellCrit: null,
    baseDodge: null,
    // A warlock can't parry or block (no skill, no shield) [C].
    baseParry: 0,
    baseBlock: 0,
    baseHealth: null,
    // PlayerExpectedStat.BaseMana 1373 [F] (docs/mechanics/spells.md §8)
    baseMana: 1373,
  },
  priest: {
    // Unmeasured (docs/classes/priest.md#73-base-values): the attribute rows, attack power, crit, spell
    // crit, dodge and health are D24 placeholders, in BASE_PLACEHOLDERS below.
    attributes: () => null,
    baseAp: null,
    baseCrit: null,
    // PlayerExpectedStat.CritPerAgility 0.0005, 20 Agility per 1% [F]
    critPerAgi: 0.05,
    // PlayerExpectedStat.SpellCritPerIntellect 0.000168, 59.52 Intellect per 1% [F] (docs/mechanics/spells.md §2)
    spellCritPerInt: 0.0168,
    baseSpellCrit: null,
    baseDodge: null,
    // A priest can't parry or block (no parry skill, no shields).
    baseParry: 0,
    baseBlock: 0,
    baseHealth: null,
    // PlayerExpectedStat.BaseMana 1376 [F] (docs/mechanics/spells.md §8)
    baseMana: 1376,
  },
}

/**
 * The base values D24 lets the sim fill with a placeholder while CLASS_BASE has none. One left
 * out here and unknown in CLASS_BASE is left out of the sheet (0) and listed in its `unknown`.
 */
export interface BasePlaceholders {
  /** Base attributes by race id, as the naked sheet shows them (character-stats OQ-1); a race left out has none. */
  attributes?: Readonly<Record<string, Attributes>>
  /** Melee attack power before Strength and Agility (character-stats OQ-7). */
  baseAp?: number
  /** Base health before Stamina (character-stats OQ-2). */
  baseHealth?: number
  /** Base dodge %, before Agility, defense and gear (character-stats OQ-5). */
  baseDodge?: number
  /** Base melee crit %, before Agility (character-stats OQ-3). */
  baseCrit?: number
  /** Base spell crit %, before Intellect (character-stats OQ-3). */
  baseSpellCrit?: number
}

/**
 * Placeholders for level-60 base values nobody has measured (decision D24,
 * docs/decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23;
 * docs/mechanics/character-stats.md#other-base-values-at-level-60).
 * Every one is [?], listed in the doc's open questions and in the results' assumptions
 * (`baseStatPlaceholders`), and replaced by the measured value (M9 validation). A value here is
 * used only where CLASS_BASE has `null`.
 *
 * Base health: warrior 1,689, paladin 1,381, druid 1,483. "[?] placeholder (D24); origin:
 * https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql
 * (the vanilla emulator's class table, which wowsims/classic's `base_stats.go` copies), not
 * evidence". No Classic Era measurement exists, and the 1.15.9 client has no base-health table
 * (OQ-2). Left out, Forever's rage from damage taken (10 × the hit ÷ maximum health) comes out
 * 20–40% high. Off by ±100, it moves the default Protection warrior's TPS by about ∓0.15% (OQ-2
 * has the numbers).
 *
 * The druid's other base values (character-stats.md OQ-1, which has each one's estimated effect):
 * "[?] placeholder (D24); origin: RatingBuster's Classic Era table at its last commit before
 * Season of Discovery,
 * https://github.com/raethkcj/RatingBuster/blob/d11164cf6de90688a635a6ff880b71ea9ea07367/libs/StatLogic/Vanilla_Logic.lua,
 * and wowsims/classic `base_stats.go`, https://github.com/wowsims/classic/blob/master/sim/core/base_stats.go,
 * which both copy a private server's tables; not evidence". The attribute rows are DRUID_ROWS above.
 *
 * The paladin's attribute rows are PALADIN_ROWS above. Its base melee crit, spell crit and dodge
 * have the druid's origins (the melee crit via wowsims/classic only), and the same caveat: not
 * evidence.
 *
 * The shaman's (docs/classes/shaman.md#base-stats) are SHAMAN_ROWS above, base health 1,280 (the
 * emulator's class table, as for the others), base attack power 60 × 2 − 20 = 100 (wowsims/classic),
 * base melee crit and dodge 1.7% (RatingBuster and wowsims/classic agree), and base spell crit 2.3%
 * (wowsims/classic; RatingBuster's table reads −0.7%, so the sources conflict): all "[?] placeholder
 * (D24); origin: …, not evidence".
 */
export const BASE_PLACEHOLDERS: Record<ClassId, BasePlaceholders> = {
  warrior: { baseHealth: 1689 },
  paladin: {
    attributes: PALADIN_ROWS,
    baseHealth: 1381,
    /**
     * Base melee crit before Agility, % (OQ-3): origin the emulator via wowsims/classic. Sources
     * conflict (0 to 1.7%); the likely error moves Ret DPS by −0.62% to +0.92%, within D24's 1%.
     */
    baseCrit: 0.7,
    /** Base spell crit before Intellect, % (OQ-3): origin RatingBuster and wowsims/classic. */
    baseSpellCrit: 3.5,
    /** Base dodge before Agility, % (OQ-5): origin RatingBuster and wowsims/classic. */
    baseDodge: 0.7,
  },
  druid: {
    attributes: DRUID_ROWS,
    /** Caster-form attack power before Strength (origin: wowsims/classic; OQ-7): about 0.7% of cat DPS. */
    baseAp: -20,
    baseHealth: 1483,
    /** Base melee crit before Agility, % (OQ-3): plausibly 0–1%, cat DPS −1.5% to +0.2%, so measured first. */
    baseCrit: 0.9,
    /** Base spell crit before Intellect, % (OQ-3): nothing for cat or bear. */
    baseSpellCrit: 1.8,
    /** Base dodge before Agility, % (OQ-5): under ±0.3% of bear TPS. */
    baseDodge: 0.9,
  },
  shaman: {
    attributes: SHAMAN_ROWS,
    /** Attack power before Strength: 60 × 2 − 20 (origin wowsims/classic). */
    baseAp: 100,
    baseHealth: 1280,
    /** Base melee crit before Agility, % (origin RatingBuster and wowsims/classic, which agree). */
    baseCrit: 1.7,
    /** Base spell crit before Intellect, % (origin wowsims/classic; RatingBuster's −0.7 conflicts). */
    baseSpellCrit: 2.3,
    /** Base dodge before Agility, %: matters only to a tank. */
    baseDodge: 1.7,
  },
  // docs/classes/rogue.md#76-base-values: every rogue base value nobody has measured, each "[?]
  // placeholder (D24)": attributes and health from the mangos emulator (wowsims/classic copies
  // them), attack power 2 × 60 − 20 = 100 before Strength and Agility (wowsims/classic), and 0% base
  // melee crit, spell crit and dodge (RatingBuster's Classic Era table at its pre-SoD commit and
  // wowsims/classic; the warrior's are 0 too). Not evidence.
  rogue: {
    attributes: ROGUE_ROWS,
    baseAp: 100,
    baseHealth: 1523,
    baseCrit: 0,
    baseSpellCrit: 0,
    baseDodge: 0,
  },
  // docs/classes/mage.md#base-stats: MAGE_ROWS above; base health 1,360 (mangos' class table;
  // wowsims/classic's 1,370 conflicts); base spell crit 0.2% (wowsims/classic, and RatingBuster since
  // d8588dcd, which corrected its −4.8%); base melee crit and dodge 3.2% (both agree). All "[?]
  // placeholder (D24); origin: …, not evidence".
  mage: {
    attributes: MAGE_ROWS,
    baseHealth: 1360,
    /** Base melee crit before Agility, % (a wand's, if ever used). */
    baseCrit: 3.2,
    /** Base spell crit before Intellect, %. */
    baseSpellCrit: 0.2,
    /** Base dodge before Agility, %: matters only to a tank. */
    baseDodge: 3.2,
  },
  // docs/classes/warlock.md#76-base-values: every warlock base value nobody has measured, each "[?]
  // placeholder (D24)": attributes and health 1,414 from the mangos emulator (wowsims/classic copies
  // them), attack power −10 before Strength (wowsims/classic), and base spell crit 1.7%, melee crit
  // and dodge 2% (wowsims/classic; RatingBuster's pre-SoD table reads spell crit −0.3%, so the sources
  // conflict, as for the shaman). Not evidence.
  warlock: {
    attributes: WARLOCK_ROWS,
    baseAp: -10,
    baseHealth: 1414,
    baseCrit: 2,
    baseSpellCrit: 1.7,
    baseDodge: 2,
  },
  // docs/classes/priest.md#73-base-values: every priest base value nobody has measured, each "[?]
  // placeholder (D24)": attributes and health 1,387 from the mangos emulator's tables (as the other
  // classes'), and base spell crit 0.8%, melee crit and dodge 3% and attack power −10 from
  // wowsims/classic's priest row. Not evidence. Only the spell crit moves a Shadow Priest's DPS.
  priest: {
    attributes: PRIEST_ROWS,
    baseAp: -10,
    baseHealth: 1387,
    baseCrit: 3,
    baseSpellCrit: 0.8,
    baseDodge: 3,
  },
}
