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
 * 20–40% high. Off by ±100, it moves the default Protection warrior's TPS by about 0.001% today,
 * because nothing spends rage yet; once a rotation spends it, by about ±0.3–0.7% (rage from
 * damage taken is about 44% of that warrior's rage; OQ-2 has the numbers).
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
}
