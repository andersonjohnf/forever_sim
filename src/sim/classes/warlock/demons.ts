// The Demonology warlock's demons and what they bring (docs/classes/warlock.md §11): the Imp, the
// Succubus and the Felhunter as pets (PetDef, docs/mechanics/ranged-and-pets.md §12), their spells
// from the Forever client, the talents that buff them, and the auras they give you while they're
// out (Master Demonologist, Demonic Knowledge, Soul Link), with Soul Fire for Decimation.
//
// Spell numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), written
// out as abilities.ts does; warlock.test.ts checks them. A demon's own stats aren't in either client:
// they're D24 placeholders [?] (warlock.md §11.2, Q14).
import { CRIT_MULTIPLIER } from '../../core/formulas'
import type { AuraSpec, ProcSpec } from '../../effects/types'
import type { PetAbilityDef, PetDef } from '../../plan/pet'
import { type AbilityDef, MAGIC_SCHOOLS, schoolMask, type SpellDef } from '../../plan/types'
import { atLevel60, spread } from '../paladin/spells'
import { DOC, WARLOCK } from './abilities'
import { rank, type TalentRanks } from './talents'

/** The demon you keep out (warlock.md §11.2). */
export type Demon = 'imp' | 'succubus' | 'felhunter' | 'none'

const DEMO = `${DOC}#11-demonology`

// --- The talents' per-rank curves (TraitDefinitionEffectPoints, 1.60.1.69913; warlock.md §11.3) ----
export const DEMO_CURVE = {
  /** Improved Imp #1: Firebolt's damage % (aura 108, mask 4096). */
  improvedImp: [10, 20, 30],
  /**
   * Improved Imp #2, a dummy (aura 4) the tooltip doesn't show. Nothing describes it, so the sim gives
   * it no effect [?] (warlock.md §11.3, Q19); the curve stays for its assumption and its test.
   */
  improvedImpHidden: [-300, -700, -1000],
  /** Unholy Power #0: all your demon's damage %, its Forever tooltip. */
  unholyPower: [2, 4, 6, 8, 10],
  /** Improved Sayaad #0: Lash of Pain's effect % (aura 108, mask 8192). */
  improvedSayaad: [10, 20, 30],
  /** Fel Vitality #0: your demon's health and mana % (#1 is yours, talents.ts). */
  felVitality: [5, 10, 15],
  /** Demonic Energies #1: the share of Life Tap's mana your demon gains %. */
  demonicEnergies: [50, 100],
  /** Demonic Knowledge #0: spell damage as a % of your level, for you and your demon. */
  demonicKnowledge: [33, 67, 100],
  /** Master Demonologist #0 (Imp: Fire damage %) and #2 (Succubus: Shadow damage %). */
  masterDemonologist: [2, 4, 6, 8, 10],
  /** Demonic Brand #1 (aura 107, misc 4: charges on its brand 1293696): your demon's attacks the brand lasts. */
  demonicBrandCharges: [2, 4, 6],
} as const

const at = (curve: readonly number[], r: number) => (r > 0 ? curve[Math.min(r, curve.length) - 1] : 0)
export const talentValue = (talents: TalentRanks, name: string, curve: readonly number[]) => at(curve, rank(talents, name))

// --- The demons at 60 (warlock.md §11.2) ------------------------------------------------------------

/**
 * A demon's attributes and mana at 60: the mangoszero database's `pet_levelstats` rows (Imp 416,
 * Succubus 1863, Felhunter 417), Classic Era's as an emulator records them: [?] placeholders (D24;
 * origin https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/pet_levelstats.sql,
 * not evidence). Neither client has them (ranged-and-pets.md OQ-6).
 */
export const DEMON_STATS = {
  imp: { str: 122, agi: 27, int: 264, spi: 197, mana: 1898 },
  succubus: { str: 130, agi: 87, int: 106, spi: 98, mana: 1874 },
  felhunter: { str: 130, agi: 87, int: 106, spi: 101, mana: 1874 },
} as const

/**
 * A melee demon's swing: 22.9 damage a second at 2.0 s, the base damage a Classic Era player
 * reported for a level-60 hunter pet (ranged-and-pets.md §6), ±20% [?] (warlock.md Q14).
 */
export const DEMON_WEAPON = { min: 36.64, max: 54.96, speedSec: 2 } as const

/**
 * Firebolt r7 (11763), the Imp's: 44 Fire, variance 0.11363637, + trunc(0.6 a level from 58) = 1, so 42.50–47.50
 * at 60 (Classic Era 83–94 +1.2 a level), coefficient 0.571; 115 mana, a 2 s cast, a 1 s GCD [F]
 * [client] (SpellEffect, SpellPower, SpellMisc, SpellCooldowns, SpellLevels, 1.60.1.69913).
 */
export const FIREBOLT = (() => {
  const [min, max] = spread(44, 0.11363637)
  const grow = atLevel60(0, 0.6, 58, 63)
  return { min: min + grow, max: max + grow, spCoefficient: 0.571, costTenths: 1150, castMs: 2000, gcdMs: 1000 }
})()

/**
 * Lash of Pain r6 (11780), the Succubus's: 50 Shadow (Classic Era 99), coefficient 0.429, instant,
 * 160 mana, a 12 s cooldown (category 40), a 1.5 s GCD [F] [client] (SpellEffect, SpellPower,
 * SpellCooldowns, SpellCategories, 1.60.1.69913).
 */
export const LASH_OF_PAIN = { min: 50, max: 50, spCoefficient: 0.429, costTenths: 1600, cooldownMs: 12000, gcdMs: 1500 } as const

/** A pet's mana regeneration: 8 + Spirit / 4 every 2 s, the warlock's own formula, casting or not [?] (warlock.md Q16). */
export const demonRegenTenths = (spirit: number) => Math.floor(10 * (8 + spirit / 4) + 1e-9)

const petSpell = (
  id: string,
  name: string,
  icon: string,
  school: 'fire' | 'shadow',
  row: { min: number; max: number; spCoefficient: number; costTenths: number; gcdMs: number; castMs?: number; cooldownMs?: number },
  mult: number,
): PetAbilityDef => ({
  id,
  name,
  icon,
  kind: 'spell',
  school,
  costTenths: row.costTenths,
  cooldownMs: row.cooldownMs ?? 0,
  gcdMs: row.gcdMs,
  castMs: row.castMs ?? 0,
  // A damage % on the spell alone (Improved Imp, Master Demonologist) multiplies its base and its
  // spell damage alike, so it's folded into both (warlock.md §11.8).
  min: row.min * mult,
  max: row.max * mult,
  apCoefficient: 0,
  spCoefficient: row.spCoefficient * mult,
  weaponPercent: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.spell,
})

/**
 * Your demon as a pet (warlock.md §11.2, §11.4): its placeholder stats and melee, its spell, its mana,
 * and what your talents give it: Unholy Power and Soul Link on all its damage, Improved Imp on
 * Firebolt, Improved Sayaad on Lash of Pain, Master Demonologist's school on its spells, Demonic
 * Knowledge's spell damage and Fel Vitality's mana. What it inherits of your stats is every pet's rule
 * (ranged-and-pets.md §6, `PET_INHERITANCE`) [?]. Null for 'none'.
 */
export function demonPet(demon: Demon, talents: TalentRanks): PetDef | null {
  if (demon === 'none') return null
  const stats = DEMON_STATS[demon]
  const soulLink = rank(talents, 'Soul Link') > 0 ? SOUL_LINK_PCT : 0
  const damageMult = (1 + talentValue(talents, 'Unholy Power', DEMO_CURVE.unholyPower) / 100) * (1 + soulLink / 100)
  const md = talentValue(talents, 'Master Demonologist', DEMO_CURVE.masterDemonologist)
  const mana = Math.floor(10 * stats.mana * (1 + talentValue(talents, 'Fel Vitality', DEMO_CURVE.felVitality) / 100) + 1e-9)
  const power = { kind: 'mana' as const, maxTenths: mana, startTenths: mana, tickTenths: demonRegenTenths(stats.spi), tickMs: 2000 }
  const base = {
    level: 60,
    stats: {
      baseStr: stats.str,
      baseAgi: stats.agi,
      // 2 attack power a Strength − 20, the hunter pet's reported rule (ranged-and-pets.md §6) [?].
      baseAp: -20,
      // Its crit and hit are what it inherits of yours (plan/pet.ts PET_INHERITANCE), none of its own.
      spellDamage: demonicKnowledge(talents),
    },
    damageMult,
    glances: true,
    front: false,
  }
  if (demon === 'imp') {
    const mult = (1 + talentValue(talents, 'Improved Imp', DEMO_CURVE.improvedImp) / 100) * (1 + md / 100)
    // Improved Imp's hidden #2 does nothing: an undescribed dummy (warlock.md §11.3, Q19).
    const firebolt = FIREBOLT
    return {
      ...base,
      id: 'imp',
      name: 'Imp',
      icon: 'spell_shadow_summonimp',
      weapon: null,
      power,
      abilities: [petSpell('firebolt', 'Firebolt', 'spell_fire_firebolt', 'fire', firebolt, mult)],
      rotation: [{ ability: 0, conditions: [] }],
    }
  }
  if (demon === 'succubus') {
    const mult = (1 + talentValue(talents, 'Improved Sayaad', DEMO_CURVE.improvedSayaad) / 100) * (1 + md / 100)
    return {
      ...base,
      id: 'succubus',
      name: 'Succubus',
      icon: 'spell_shadow_summonsuccubus',
      weapon: DEMON_WEAPON,
      power,
      abilities: [petSpell('lashOfPain', 'Lash of Pain', 'spell_shadow_curse', 'shadow', LASH_OF_PAIN, mult)],
      rotation: [{ ability: 0, conditions: [] }],
    }
  }
  // The Felhunter's abilities (Tainted Blood, Spell Lock, Devour Magic, Paranoia) deal no damage.
  return { ...base, id: 'felhunter', name: 'Felhunter', icon: 'spell_shadow_summonfelhunter', weapon: DEMON_WEAPON, power: null, abilities: [], rotation: [] }
}

// --- What your demon gives you while it's out (warlock.md §11.3) -------------------------------------

/** Demonic Knowledge (412732): spell damage up to 100% of your level (33/67/100% a rank), yours and your demon's, rounded down [F] (tooltip); rounding [?]. */
export const demonicKnowledge = (talents: TalentRanks) => Math.floor((60 * talentValue(talents, 'Demonic Knowledge', DEMO_CURVE.demonicKnowledge)) / 100 + 1e-9)

/** Soul Link's aura (25228): all damage done +3% (#0, aura 79, mask 127), yours and your demon's [F] [client] (SpellEffect, 1.60.1.69913). */
export const SOUL_LINK_PCT = 3

/** A passive of your demon's, up from before the pull for 2 h (as Demonic Sacrifice's buff, warlock.md §11.4). */
const passive = (id: string, name: string, icon: string, aura: AuraSpec): AbilityDef => ({ ...WARLOCK, id, name, icon, kind: 'cast', gcdMs: 0, noThreat: true, aura })

const TWO_HOURS = 7200000

/**
 * Soul Link (19028), cast before the pull: its aura 25228 raises all your damage 3% (your spells:
 * every magic school) while your demon is out [F] [client]; the 30% of damage taken it moves to the
 * demon isn't simulated.
 */
export const SOUL_LINK: AbilityDef = passive('soulLink', 'Soul Link', 'spell_shadow_gathershadows', {
  id: 'soulLink',
  name: 'Soul Link',
  durationMs: TWO_HOURS,
  mods: { schoolMask: schoolMask(MAGIC_SCHOOLS), schoolDamage: SOUL_LINK_PCT },
})

/**
 * Master Demonologist (23785), while your demon is out, on you and on it [F] (its Forever tooltip):
 * the Imp +2% Fire damage a rank (23759, aura 79, mask 4), the Succubus +2% Shadow (23761, mask 32);
 * the Felhunter's and Voidwalker's cut damage taken, which a DPS result doesn't read. Null when it
 * gives you no damage.
 */
export function masterDemonologist(demon: Demon, talents: TalentRanks): AbilityDef | null {
  const pct = talentValue(talents, 'Master Demonologist', DEMO_CURVE.masterDemonologist)
  if (pct === 0 || (demon !== 'imp' && demon !== 'succubus')) return null
  return passive('masterDemonologist', 'Master Demonologist', 'spell_shadow_shadowpact', {
    id: 'masterDemonologist',
    name: 'Master Demonologist',
    durationMs: TWO_HOURS,
    mods: { schoolMask: schoolMask([demon === 'imp' ? 'fire' : 'shadow']), schoolDamage: pct },
  })
}

/** Demonic Knowledge's aura on you while your demon is out (1243120: spell damage, aura 13, every school). Null without the talent. */
export function demonicKnowledgeAura(talents: TalentRanks): AbilityDef | null {
  const amount = demonicKnowledge(talents)
  if (amount === 0) return null
  return passive('demonicKnowledge', 'Demonic Knowledge', 'spell_shadow_improvedvampiricembrace', {
    id: 'demonicKnowledge',
    name: 'Demonic Knowledge',
    durationMs: TWO_HOURS,
    mods: { spellDamage: amount },
  })
}

/** Your demon's passives go up before the pull, after Demonic Sacrifice (−3 s): Soul Link, Master Demonologist, Demonic Knowledge. */
export const PREPULL_DEMON_MS = -2000

// --- Soul Fire and Decimation (warlock.md §11.3) -----------------------------------------------------

/**
 * Soul Fire r2 (17924): 431 Fire, variance 0.22474748, + trunc(1.9 a level from 56) = 7, so 389.57–486.43
 * at 60 (the tooltip's 390–486), coefficient 1.0; 335 mana, a 6 s cast, a 60 s cooldown (category 631) and a Soul Shard [F] [client]
 * (SpellEffect, SpellPower, SpellCooldowns, SpellLevels, 1.60.1.69913).
 */
export const SOUL_FIRE_SPELL: SpellDef = {
  id: 'soulFire',
  name: 'Soul Fire',
  icon: 'spell_fire_fireball02',
  school: 'fire',
  defense: 'magic',
  noActiveDefense: false,
  alwaysHit: false,
  triggersProcs: true,
  weaponPercent: 0,
  normalized: false,
  critMultiplier: CRIT_MULTIPLIER.spell,
  bonusCrit: 0,
  damageMult: 1,
  threatMult: 1,
  threatBonus: 0,
  takenScale: 0,
  ...(() => {
    const [min, max] = spread(431, 0.22474748)
    const grow = atLevel60(0, 1.9, 56, 62)
    return { min: min + grow, max: max + grow }
  })(),
  spCoefficient: 1,
}
export const SOUL_FIRE: AbilityDef = {
  ...WARLOCK,
  id: 'soulFire',
  name: 'Soul Fire',
  icon: 'spell_fire_fireball02',
  kind: 'spell',
  costTenths: 3350,
  castMs: 6000,
  castHasted: true,
  cooldownMs: 60000,
  spellDef: SOUL_FIRE_SPELL,
}

/** Decimation's threshold: the target below 35% health (440870 #2) [F] [client]. */
export const DECIMATION_BELOW_PCT = 35

// --- Demonic Brand (warlock.md §11.3) -----------------------------------------------------------------

/**
 * Demonic Brand's brand on the boss (1293696): 10 s (SpellDuration 1), or until your demon's next 2/4/6
 * landed attacks, swings and spells alike, have used it (its proc mask is every attack the target takes)
 * [F] [client] (SpellMisc, SpellDuration, SpellAuraOptions, the talent's #1 curve, 1.60.1.70009). Null
 * without the talent.
 */
export function demonicBrandAura(talents: TalentRanks): AuraSpec | null {
  const charges = talentValue(talents, 'Demonic Brand', DEMO_CURVE.demonicBrandCharges)
  if (charges === 0) return null
  return { id: 'demonicBrand', name: 'Demonic Brand', durationMs: 10000, petLandedCharges: charges, mods: {} }
}

/**
 * What each of those attacks deals (1293698 Fire, the Imp's; 1293697 Shadow, the Succubus's): the client's
 * formula, `(level − 26) × 1.5 + 14 … 17 + 0.078 × your spell damage of its school`, so 65–68 at 60, ×
 * Master Demonologist's school % and Unholy Power (its description variables 1016–1018) [F] [client]
 * (SpellXDescriptionVariables, SpellMisc, 1.60.1.70009). The school follows the demon: the Felhunter's
 * isn't named, and the talent's "Fire or Shadow" makes it Shadow [?] (warlock.md Q23).
 */
export const DEMONIC_BRAND_HIT = { min: (60 - 26) * 1.5 + 14, max: (60 - 26) * 1.5 + 17, spCoefficient: 0.078 } as const

/**
 * The brand's damage as a proc of your demon's landed attacks while the brand is up (warlock.md §11.3):
 * the pet core's damage (`petSpellDamage`: the demon's all-damage multiplier, Unholy Power and Soul Link,
 * its spell crit, no miss roll: the spell's Always Hit, SpellMisc Attributes[3] 0x40000 [F]), with Master
 * Demonologist's school % folded into its numbers, as a pet spell's is. Null without a demon or the talent.
 */
export function demonicBrandProc(demon: Demon, talents: TalentRanks): ProcSpec | null {
  if (demon === 'none' || rank(talents, 'Demonic Brand') === 0) return null
  const school = demon === 'imp' ? 'fire' : 'shadow'
  const md = demon === 'felhunter' ? 0 : talentValue(talents, 'Master Demonologist', DEMO_CURVE.masterDemonologist)
  const mult = 1 + md / 100
  return {
    id: 'demonicBrand',
    name: 'Demonic Brand',
    icon: 'ability_demonhunter_chaoticimprint_fire',
    trigger: 'petLanded',
    from: 'any',
    chance: { pct: 100 },
    requiresAura: 'demonicBrand',
    action: { kind: 'petSpellDamage', school, min: DEMONIC_BRAND_HIT.min * mult, max: DEMONIC_BRAND_HIT.max * mult, spCoefficient: DEMONIC_BRAND_HIT.spCoefficient * mult },
    docRef: `${DOC}#113-talents-in-the-sim`,
  }
}

/** Doc anchors, for the procs and rows that cite them. */
export const DEMONOLOGY_DOC = DEMO
