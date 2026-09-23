// Level-60 base values per race and class (docs/mechanics/character-stats.md#base-stats-at-level-60).
//
// Values a tier 1–3 source supports, and D24 placeholders
// (docs/decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23), which are tagged [?]
// and listed in the results' assumptions. Anything else unknown is `null` and reported as missing.
// CLASS_BASE holds the supported values (`null` there means nobody has measured it), and
// BASE_PLACEHOLDERS below holds the placeholders, in one replaceable table. The paladin and druid
// attribute rows (OQ-1) may stand in the same way under D24; their specs' tracks add them.
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

export interface ClassBase {
  /** Base attributes by race id; null = unknown (OQ-1). */
  attributes: (race: string) => Attributes | null
  /** Melee AP at level 60 before Strength (character-stats §attack power formulas). */
  baseAp: number
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
    // OQ-1: the paladin class row isn't known from any allowed source.
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
    attributes: () => null,
    // caster form: 2 × Str − 20 [?] (OQ-7)
    baseAp: -20,
    baseCrit: null,
    critPerAgi: 0.05,
    spellCritPerInt: 0.0167,
    baseSpellCrit: null,
    baseDodge: null,
    // Druids can't parry or block (character-stats §other base values).
    baseParry: 0,
    baseBlock: 0,
    baseHealth: null,
    // 1244 [F]
    baseMana: 1244,
  },
}

/**
 * The base values D24 lets the sim fill with a placeholder while CLASS_BASE has none. One left
 * out here and unknown in CLASS_BASE is left out of the sheet (0) and listed in its `unknown`.
 */
export interface BasePlaceholders {
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
 * (OQ-2). Left out, Forever's rage from damage taken (10 × the hit ÷
 * maximum health) comes out 20–40% high; off by ±100, it moves a tank's TPS about ±0.3–0.7%.
 */
export const BASE_PLACEHOLDERS: Record<ClassId, BasePlaceholders> = {
  warrior: { baseHealth: 1689 },
  paladin: { baseHealth: 1381 },
  druid: { baseHealth: 1483 },
}
