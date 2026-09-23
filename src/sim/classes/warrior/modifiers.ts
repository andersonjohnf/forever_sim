// Talents that modify warrior abilities (docs/classes/warrior.md §2.3 "Cost reductions" and the
// Bloodrage and Berserker Rage rows, §2.5 Impale, §3.1 Raging Blows). The plan applies them once,
// when it resolves the rotation's abilities from the build's talent ranks; the engine only sees
// the resolved numbers.
//
// Abilities are keyed by the ids in abilities.ts. The class-mask lists name abilities the engine
// doesn't simulate yet, so each list is complete and the cost tables (W20, W21) are pure functions
// of the build; abilities.test.ts checks them against the talents' client class masks.
import { CRIT_MULTIPLIER } from '../../core/formulas'
import type { AbilityDef } from './abilities'

export type TalentRanks = ReadonlyMap<string, number>

const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

/**
 * Focused Rage's class mask: −1 rage per rank on these [F] [client] (SpellEffect, 1.60.1.69913).
 * Not Battle Shout, Shield Block, Berserker Rage or Bloodrage (warrior.md §2.3).
 */
export const FOCUSED_RAGE: ReadonlySet<string> = new Set([
  // attacks
  'bloodthirst',
  'mortalStrike',
  'whirlwind',
  'slam',
  'heroicStrike',
  'cleave',
  'execute',
  'overpower',
  'revenge',
  'shieldSlam',
  'spearingStrike',
  'rend',
  'hamstring',
  'thunderClap',
  'sunderArmor',
  // shouts
  'demoralizingShout',
  'challengingShout',
  'intimidatingShout',
  'piercingHowl',
  // utility and cooldowns
  'pummel',
  'shieldBash',
  'intercept',
  'mockingBlow',
  'disarm',
  'concussionBlow',
  'deathWish',
  'sweepingStrikes',
])

/**
 * Impale's class mask: the attacks whose crits it raises [F] [client] (SpellEffect, 1.60.1.69913)
 * (warrior.md §2.5). White swings, extra attacks, Deep Wounds and Rend aren't in it.
 */
export const IMPALE: ReadonlySet<string> = new Set([
  'bloodthirst',
  'mortalStrike',
  'whirlwind',
  'slam',
  'heroicStrike',
  'cleave',
  'execute',
  'overpower',
  'revenge',
  'shieldSlam',
  'thunderClap',
  'hamstring',
  'spearingStrike',
  'victoryRush',
  'intercept',
  'pummel',
  'shieldBash',
  'mockingBlow',
  'concussionBlow',
])

/** Improved Execute's reduction by rank: a table, not per rank (warrior.md §2.3, §7) [F]. */
const IMPROVED_EXECUTE = [0, 3, 5]

/**
 * Rage the build's talents take off an ability's cost, in rage points. All reductions are flat
 * and stack additively (warrior.md §2.3 "Cost reductions"). Cleave's (Improved Cleave, Raging
 * Blows) wait for Cleave itself.
 */
export function costReduction(id: string, talents: TalentRanks): number {
  let reduction = FOCUSED_RAGE.has(id) ? rank(talents, 'Focused Rage') : 0
  switch (id) {
    case 'heroicStrike':
      reduction += rank(talents, 'Improved Heroic Strike')
      break
    case 'execute':
      reduction += IMPROVED_EXECUTE[Math.min(rank(talents, 'Improved Execute'), IMPROVED_EXECUTE.length - 1)]
      break
    case 'sunderArmor':
      reduction += rank(talents, 'Improved Sunder Armor')
      break
    case 'thunderClap':
      reduction += 2 * rank(talents, 'Improved Thunder Clap')
      break
  }
  return reduction
}

/** An ability's rage cost for a build: base cost − talent reductions, never below 0 (warrior.md §2.3, W20, W21). */
export const rageCost = (id: string, baseCost: number, talents: TalentRanks) => Math.max(0, baseCost - costReduction(id, talents))

/**
 * Crit damage multiplier of an ability: `1 + 1.0 × (1 + 0.10 × Impale rank)` for attacks in
 * Impale's class mask, 2.2 at 2/2; ×2 otherwise (warrior.md §2.5, W1).
 */
export function abilityCritMultiplier(id: string, talents: TalentRanks): number {
  const impale = IMPALE.has(id) ? rank(talents, 'Impale') : 0
  return 1 + (CRIT_MULTIPLIER.melee - 1) * (1 + 0.1 * impale)
}

/**
 * Improved Bloodrage multiplies all of Bloodrage's rage by `1 + 0.25 × rank` [F] (warrior.md §2.3,
 * W19): 15 + 1.5/s at 2/2. Each gain is floored to a tenth (rage.md#implementation-notes
 * "Rounding"), so 1/2's 1.25-rage ticks give 1.2.
 */
export function bloodrageRage(tenths: number, talents: TalentRanks): number {
  return Math.floor(tenths * (1 + 0.25 * rank(talents, 'Improved Bloodrage')) + 1e-9)
}

/** Improved Berserker Rage: +5 rage per rank when Berserker Rage is used [F] (warrior.md §2.3). */
export const IMPROVED_BERSERKER_RAGE_PER_RANK = 5

/**
 * The ability as this build uses it: cost reductions, Impale's crit multiplier, Raging Blows'
 * off-hand strike on Whirlwind (warrior.md §3.1 "Raging Blows"; [?] Q13), and the rage of
 * Improved Bloodrage and Improved Berserker Rage (§2.3).
 */
export function withTalents(def: AbilityDef, talents: TalentRanks): AbilityDef {
  const resolved: AbilityDef = {
    ...def,
    costTenths: Math.max(0, def.costTenths - 10 * costReduction(def.id, talents)),
    critMultiplier: abilityCritMultiplier(def.id, talents),
    offHand: def.offHand || (def.id === 'whirlwind' && rank(talents, 'Raging Blows') > 0),
  }
  if (def.id === 'bloodrage') {
    resolved.rageTenths = bloodrageRage(def.rageTenths, talents)
    resolved.rageTickTenths = bloodrageRage(def.rageTickTenths, talents)
  } else if (def.id === 'berserkerRage') {
    resolved.rageTenths = def.rageTenths + 10 * IMPROVED_BERSERKER_RAGE_PER_RANK * rank(talents, 'Improved Berserker Rage')
  }
  return resolved
}
