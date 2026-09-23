// Level-60 base values per race and class (docs/mechanics/character-stats.md#base-stats-at-level-60).
//
// Values a tier 1–3 source supports, and D24 placeholders (docs/decisions.md D24), which are
// tagged [?] and listed in the results' assumptions. Anything else unknown is `null` and
// reported as missing.
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
    baseDodge: null,
    // docs/mechanics/character-stats.md#other-base-values-at-level-60: base parry and block 5% [?]
    baseParry: 5,
    baseBlock: 5,
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
