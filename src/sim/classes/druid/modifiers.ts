// Talents that modify druid abilities (docs/classes/druid.md §2.3, §2.5, §5.1, §5.2): cost
// reductions, damage and periodic-damage multipliers, the crit damage bonus and Primal Fury's
// combo point. The plan applies them once, when it resolves the rotation's abilities from the
// build's talent ranks; the engine only sees the resolved numbers, as for the warrior
// (classes/warrior/modifiers.ts).
//
// Abilities are keyed by id. The sets are the talents' class masks as druid.md lists them, and
// name abilities the cat and bear rotations add, so each list is complete before they arrive.
import { CRIT_MULTIPLIER } from '../../core/formulas'
import type { AbilityDef } from '../../plan/types'
import { PRIMAL_FURY_CP_CHANCE_PER_RANK } from './abilities'

export type TalentRanks = ReadonlyMap<string, number>

const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

/** Ferocity: −1 rage or Energy per rank on Maul, Mangle, Swipe, Claw and Rake [F] (druid.md §5.1). */
export const FEROCITY: ReadonlySet<string> = new Set(['maul', 'mangle', 'swipe', 'claw', 'rake'])

/** Shredding Attacks: −6 Energy per rank on Shred, −1 rage per rank on Lacerate [F] (druid.md §5.1). */
export const SHREDDING_ATTACKS: Readonly<Record<string, number>> = { shred: 6, lacerate: 1 }

/**
 * Savage Fury: +5% damage per rank on Claw, Rake (its hit and its bleed), Shred, Maul and Swipe;
 * not Mangle, Rip, Ferocious Bite or Lacerate [F] (druid.md §2.3, §5.1; 16998's class masks).
 */
export const SAVAGE_FURY: ReadonlySet<string> = new Set(['claw', 'rake', 'shred', 'maul', 'swipe'])
export const SAVAGE_FURY_PCT_PER_RANK = 5

/** Feral Instinct: +10% Swipe damage per rank, and no threat in Forever [F] (druid.md §2.3, §5.1). */
export const FERAL_INSTINCT_PCT_PER_RANK = 10

/** Genesis: +1% periodic damage per rank on Rip, Rake's bleed and Lacerate's bleed [F] (druid.md §2.3, §5.2). */
export const GENESIS: ReadonlySet<string> = new Set(['rip', 'rake', 'lacerate'])
export const GENESIS_PCT_PER_RANK = 1

/**
 * Predatory Instincts: +10% crit damage bonus per rank on the cat and bear specials, not white
 * swings, so a crit deals 1 + 1.0 × (1 + 0.1 × rank): 2.2 at 2/2 [F]; the reading is [?] (druid.md
 * §2.3, §5.1 note, Q10). Rip is in the mask, so its ticks' crits take it too in `forever` [?] (§2.9).
 */
export const PREDATORY_INSTINCTS: ReadonlySet<string> = new Set([
  'claw',
  'rake',
  'shred',
  'ravage',
  'pounce',
  'rip',
  'ferociousBite',
  'maul',
  'swipe',
  'mangle',
  'lacerate',
])

/** The cat combo-point builders: Primal Fury adds a point on their non-periodic crits [F] (druid.md §2.5). */
export const CP_BUILDERS: ReadonlySet<string> = new Set(['shred', 'claw', 'rake', 'ravage', 'pounce'])

/**
 * Rend and Tear: +2% damage per rank from melee abilities against a bleeding target, not white
 * swings or periodic ticks [F]; its scope is [?] (druid.md §2.3, §5.1, Q9). The engine hook that
 * knows whether the target bleeds comes with the cat rotation (druid.md §8).
 */
export const REND_AND_TEAR_PCT_PER_RANK = 2

/** Rage or Energy a build's talents take off an ability's cost, in whole points (druid.md §5.1). */
export function costReduction(id: string, talents: TalentRanks): number {
  let reduction = FEROCITY.has(id) ? rank(talents, 'Ferocity') : 0
  reduction += (SHREDDING_ATTACKS[id] ?? 0) * rank(talents, 'Shredding Attacks')
  return reduction
}

/** An ability's damage multiplier from the build's talents, before periodic-only ones (druid.md §2.3). */
export function damageMultiplier(id: string, talents: TalentRanks): number {
  let m = SAVAGE_FURY.has(id) ? 1 + (SAVAGE_FURY_PCT_PER_RANK * rank(talents, 'Savage Fury')) / 100 : 1
  if (id === 'swipe') m *= 1 + (FERAL_INSTINCT_PCT_PER_RANK * rank(talents, 'Feral Instinct')) / 100
  return m
}

/** The periodic-only multiplier (Genesis) on an ability's bleed (druid.md §2.3). */
export const periodicMultiplier = (id: string, talents: TalentRanks) =>
  GENESIS.has(id) ? 1 + (GENESIS_PCT_PER_RANK * rank(talents, 'Genesis')) / 100 : 1

/** An ability's crit damage multiplier: 2.2 with Predatory Instincts 2/2 on its class mask, 2 otherwise (druid.md §5.1). */
export function abilityCritMultiplier(id: string, talents: TalentRanks): number {
  const r = PREDATORY_INSTINCTS.has(id) ? rank(talents, 'Predatory Instincts') : 0
  return 1 + (CRIT_MULTIPLIER.melee - 1) * (1 + 0.1 * r)
}

/**
 * The ability as this build uses it (druid.md §2.3, §2.5, §5): cost reductions (in the ability's
 * resource, tenths), Savage Fury and Feral Instinct on its hit and bleed, Genesis on its bleed,
 * Predatory Instincts' crit damage, and Primal Fury's chance of an extra combo point on a builder's
 * crit. Stacking: percentage modifiers from different talents multiply [?] (druid.md §2.3).
 */
export function withDruidTalents(def: AbilityDef, talents: TalentRanks): AbilityDef {
  const hit = damageMultiplier(def.id, talents)
  const resolved: AbilityDef = {
    ...def,
    costTenths: Math.max(0, def.costTenths - 10 * costReduction(def.id, talents)),
    critMultiplier: abilityCritMultiplier(def.id, talents),
    // A weapon-based ability's flat bonus is inside the weapon share (Shred: 1.55 × (W + 80), §3.1).
    weaponPercent: def.weaponPercent * hit,
    flatDamage: def.weaponPercent > 0 ? def.flatDamage : def.flatDamage * hit,
    apCoefficient: def.apCoefficient * hit,
  }
  const periodic = hit * periodicMultiplier(def.id, talents)
  resolved.dotTickDamage = def.dotTickDamage * periodic
  if (def.dotTickPerComboPoint) resolved.dotTickPerComboPoint = def.dotTickPerComboPoint * periodic
  if (def.dotApCoefficientPerComboPoint) resolved.dotApCoefficientPerComboPoint = def.dotApCoefficientPerComboPoint * periodic
  if (def.damagePerComboPoint) resolved.damagePerComboPoint = def.damagePerComboPoint * hit
  if (def.apCoefficientPerComboPoint) resolved.apCoefficientPerComboPoint = def.apCoefficientPerComboPoint * hit
  const primalFury = rank(talents, 'Primal Fury')
  if (CP_BUILDERS.has(def.id) && primalFury > 0) resolved.critComboPointChance = Math.min(1, PRIMAL_FURY_CP_CHANCE_PER_RANK * primalFury)
  return resolved
}
