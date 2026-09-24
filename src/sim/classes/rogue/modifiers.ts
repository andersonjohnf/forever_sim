// Talents that modify rogue abilities (docs/classes/rogue.md §5): Energy costs, damage, crit chance
// and crit damage, combo points, and Slice and Dice's time. The plan applies them once, when it
// resolves the rotation's abilities from the build's talent ranks; the engine only sees resolved
// numbers, as for the warrior and the druid.
//
// Abilities are keyed by id. Each set is the talent's class mask as rogue.md §5 lists it, naming
// every rogue ability the specs use, so each list is complete as specs arrive. Per-rank values are
// the client's curves (src/data/client/talents.json), which rogue.test.ts checks.
import { CRIT_MULTIPLIER } from '../../core/formulas'
import type { AbilityDef } from '../../plan/types'

export type TalentRanks = ReadonlyMap<string, number>

const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

/** Energy each talent takes off an ability per rank, or its whole value at its only rank (rogue.md §5). */
const COST_PER_RANK: Readonly<Record<string, readonly [string, number][]>> = {
  exposeArmor: [['Improved Expose Armor', 5]],
  eviscerate: [['Flawless Execution', 10]],
}

/** Improved Sinister Strike's curve, −3 / −5 Energy [F] (13732; rogue.md §5.2). */
const IMPROVED_SINISTER_STRIKE = [0, 3, 5] as const

/** Energy the build's talents take off an ability's cost, in whole points (rogue.md §5). */
export function costReduction(id: string, talents: TalentRanks): number {
  let reduction = 0
  for (const [name, perRank] of COST_PER_RANK[id] ?? []) reduction += perRank * rank(talents, name)
  if (id === 'sinisterStrike') reduction += IMPROVED_SINISTER_STRIKE[Math.min(2, rank(talents, 'Improved Sinister Strike'))]
  return reduction
}

/** Improved Eviscerate's curve, +7 / +13 / +20% [F] (14162; rogue.md §5.2). */
const IMPROVED_EVISCERATE = [0, 7, 13, 20] as const

/**
 * Damage % per rank, by talent, and the abilities it applies to (rogue.md §5): Aggression 2% on
 * Sinister Strike, Backstab and Eviscerate; Opportunity 5% on Backstab, Ambush and Mutilate.
 */
const DAMAGE_PER_RANK: readonly [string, number, ReadonlySet<string>][] = [
  ['Aggression', 2, new Set(['sinisterStrike', 'backstab', 'eviscerate'])],
  ['Opportunity', 5, new Set(['backstab', 'ambush', 'mutilate'])],
]

/** Serrated Blades: +10% Rupture damage per rank [F] (14171 effect 1; rogue.md §5.3). */
const SERRATED_BLADES_RUPTURE_PER_RANK = 10

/** An ability's damage multiplier from the build's talents; different talents' percentages multiply [?] (rogue.md §5). */
export function damageMultiplier(id: string, talents: TalentRanks): number {
  let m = 1
  if (id === 'eviscerate') m *= 1 + IMPROVED_EVISCERATE[Math.min(3, rank(talents, 'Improved Eviscerate'))] / 100
  for (const [name, perRank, ids] of DAMAGE_PER_RANK) if (ids.has(id)) m *= 1 + (perRank * rank(talents, name)) / 100
  if (id === 'rupture') m *= 1 + (SERRATED_BLADES_RUPTURE_PER_RANK * rank(talents, 'Serrated Blades')) / 100
  return m
}

/**
 * Lethality: +4% crit damage bonus per rank on Sinister Strike, Gouge, Backstab, Mutilate, Ghostly
 * Strike and Hemorrhage, so a crit deals 1 + 1.0 × (1 + 0.04 × rank): 2.2 at 5/5 [F]; the reading is
 * [?], as the warrior's Impale and the druid's Predatory Instincts (rogue.md §5.1).
 */
export const LETHALITY: ReadonlySet<string> = new Set(['sinisterStrike', 'gouge', 'backstab', 'mutilate', 'ghostlyStrike', 'hemorrhage'])

export function abilityCritMultiplier(id: string, talents: TalentRanks): number {
  const r = LETHALITY.has(id) ? rank(talents, 'Lethality') : 0
  return 1 + (CRIT_MULTIPLIER.melee - 1) * (1 + 0.04 * r)
}

/** Crit % per rank on an ability (Puncturing Wounds: Backstab 10, Mutilate 5; Improved Ambush 15) [F] (rogue.md §5). */
const CRIT_PER_RANK: readonly [string, number, string][] = [
  ['Puncturing Wounds', 10, 'backstab'],
  ['Puncturing Wounds', 5, 'mutilate'],
  ['Improved Ambush', 15, 'ambush'],
]

/** The combo-point builders, whose crits Seal Fate turns into a second point (rogue.md §5.1). */
export const CP_BUILDERS: ReadonlySet<string> = new Set(['sinisterStrike', 'backstab', 'hemorrhage', 'ghostlyStrike', 'mutilate', 'ambush'])

/**
 * The finishers Relentless Strikes and Ruthlessness act on (rogue.md §2.2, §5.1): 14179's class mask
 * [4063232, 0, 67108864, 0] names Eviscerate, Slice and Dice, Rupture, Expose Armor, Kidney Shot and
 * Venom (1310703: [0, 0, 67108864, 0]) [F]. Ruthlessness (14156) has no mask, only "finishing moves";
 * Venom's Spell rows match Slice and Dice's, so it counts there too [?].
 */
export const FINISHERS: ReadonlySet<string> = new Set(['eviscerate', 'sliceAndDice', 'rupture', 'exposeArmor', 'kidneyShot', 'venom'])

/** Seal Fate 20%, Ruthlessness 20%, Puncturing Wounds' Backstab point 15% per rank; Relentless Strikes 20% per point, 25 Energy [F] (rogue.md §5.1, §5.2). */
export const SEAL_FATE_PER_RANK = 0.2
export const RUTHLESSNESS_PER_RANK = 0.2
export const PUNCTURING_WOUNDS_CP_PER_RANK = 0.15
export const RELENTLESS_STRIKES_PER_CP = 0.2
export const RELENTLESS_STRIKES_ENERGY_TENTHS = 250

/** Improved Slice and Dice: +15% duration per rank (aura 108, duration) [F] (rogue.md §5.1). */
export const IMPROVED_SLICE_AND_DICE_PER_RANK = 15

/** Initiative's chance of one more combo point on Ambush, by rank: 33 / 67 / 100% [F] (13976's curve; rogue.md §5.3). */
export const INITIATIVE = [0, 0.33, 0.67, 1] as const

/** Quietus: +2% per rank on Sinister Strike, Ghostly Strike and Hemorrhage below 35% health [F] (1310728; rogue.md §5.3). */
export const QUIETUS: ReadonlySet<string> = new Set(['sinisterStrike', 'ghostlyStrike', 'hemorrhage'])
export const QUIETUS_PCT_PER_RANK = 2
export const QUIETUS_BELOW_HEALTH_PCT = 35

/**
 * Thousand Cuts (1310721 → 1310723; rogue.md §5.3): each Rupture tick adds a stack, up to 5, for 10 s,
 * and the next Backstab or Hemorrhage costs 3 Energy less per stack and uses them up [F]. Its 1.9 s
 * `ProcCategoryRecovery` never binds on Rupture's 2 s ticks.
 */
export const THOUSAND_CUTS_AURA = { id: 'thousandCuts', name: 'Thousand Cuts', durationMs: 10000, maxStacks: 5, mods: {} } as const
export const THOUSAND_CUTS_TENTHS_PER_STACK = 30
const THOUSAND_CUTS_ABILITIES: ReadonlySet<string> = new Set(['backstab', 'hemorrhage'])

/**
 * The ability as this build uses it (rogue.md §5): cost reductions, damage and crit, Lethality's
 * crit damage, Seal Fate's and Puncturing Wounds' combo points, the finishers' Relentless Strikes,
 * Ruthlessness and Improved Expose Armor, Improved Slice and Dice's time, and Cold Blood only with
 * the talent.
 */
export function withRogueTalents(def: AbilityDef, talents: TalentRanks): AbilityDef {
  const hit = damageMultiplier(def.id, talents)
  const resolved: AbilityDef = {
    ...def,
    costTenths: Math.max(0, def.costTenths - 10 * costReduction(def.id, talents)),
    critMultiplier: abilityCritMultiplier(def.id, talents),
    // A weapon-based ability's flat bonus is inside the weapon share (Backstab: 1.5 × (W + 150), §3.2).
    weaponPercent: def.weaponPercent * hit,
    flatDamage: def.weaponPercent > 0 ? def.flatDamage : def.flatDamage * hit,
    apCoefficient: def.apCoefficient * hit,
    dotTickDamage: def.dotTickDamage * hit,
  }
  if (def.flatDamageRange) resolved.flatDamageRange = def.flatDamageRange * hit
  if (def.damagePerComboPoint) resolved.damagePerComboPoint = def.damagePerComboPoint * hit
  if (def.apCoefficientPerComboPoint) resolved.apCoefficientPerComboPoint = def.apCoefficientPerComboPoint * hit
  if (def.dotTickPerComboPoint) resolved.dotTickPerComboPoint = def.dotTickPerComboPoint * hit
  if (def.dotApCoefficientPerComboPoint) resolved.dotApCoefficientPerComboPoint = def.dotApCoefficientPerComboPoint * hit
  for (const [name, perRank, id] of CRIT_PER_RANK) if (id === def.id) resolved.bonusCrit += perRank * rank(talents, name)
  const sealFate = rank(talents, 'Seal Fate')
  if (CP_BUILDERS.has(def.id) && sealFate > 0) resolved.critComboPointChance = Math.min(1, SEAL_FATE_PER_RANK * sealFate)
  const punctures = rank(talents, 'Puncturing Wounds')
  if (def.id === 'backstab' && punctures > 0) resolved.bonusComboPointChance = PUNCTURING_WOUNDS_CP_PER_RANK * punctures
  if (FINISHERS.has(def.id)) {
    if (rank(talents, 'Relentless Strikes') > 0) {
      resolved.finisherEnergyChancePerCp = RELENTLESS_STRIKES_PER_CP
      resolved.finisherEnergyTenths = RELENTLESS_STRIKES_ENERGY_TENTHS
    }
    const ruthless = rank(talents, 'Ruthlessness')
    if (ruthless > 0) resolved.finisherComboPointChance = RUTHLESSNESS_PER_RANK * ruthless
  }
  const improvedExpose = rank(talents, 'Improved Expose Armor')
  if (def.id === 'exposeArmor' && improvedExpose > 0) resolved.comboPointsBackAtFive = improvedExpose
  const improvedSnd = rank(talents, 'Improved Slice and Dice')
  if (def.id === 'sliceAndDice' && improvedSnd > 0 && def.aura) {
    const factor = 1 + (IMPROVED_SLICE_AND_DICE_PER_RANK * improvedSnd) / 100
    resolved.aura = { ...def.aura, durationMs: Math.round(def.aura.durationMs * factor) }
    resolved.auraMsPerComboPoint = Math.round((def.auraMsPerComboPoint ?? 0) * factor)
  }
  // Subtlety's (rogue.md §5.3): Initiative's point on Ambush, Quietus below 35%, Thousand Cuts.
  const initiative = rank(talents, 'Initiative')
  if (def.id === 'ambush' && initiative > 0) resolved.bonusComboPointChance = INITIATIVE[Math.min(3, initiative)]
  const quietus = rank(talents, 'Quietus')
  if (QUIETUS.has(def.id) && quietus > 0) {
    resolved.lowHealthPct = QUIETUS_PCT_PER_RANK * quietus
    resolved.lowHealthBelowPct = QUIETUS_BELOW_HEALTH_PCT
  }
  if (rank(talents, 'Thousand Cuts') > 0) {
    if (def.id === 'rupture') resolved.tickAuraSpec = THOUSAND_CUTS_AURA
    if (THOUSAND_CUTS_ABILITIES.has(def.id)) resolved.costStacks = { aura: THOUSAND_CUTS_AURA.id, tenthsPerStack: THOUSAND_CUTS_TENTHS_PER_STACK }
  }
  // Cold Blood's crit only with the talent (rogue.md §3.8).
  if (def.auraCrit?.aura === 'coldBlood' && rank(talents, 'Cold Blood') === 0) delete resolved.auraCrit
  return resolved
}
