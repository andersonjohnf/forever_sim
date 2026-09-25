// Talents that modify warrior abilities (docs/classes/warrior.md §2.3 "Cost reductions" and the
// Bloodrage and Berserker Rage rows, §2.5 Impale, §3.1 Raging Blows, §4.1 Improved Rend, Improved
// Slam and Improved Overpower; §4.3 Improved Revenge). The plan applies them once,
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
 * Impale's class mask: the abilities whose crits it raises [F] [client] (SpellEffect, 1.60.1.69913)
 * (warrior.md §2.5). It covers Rend, whose ticks can crit in `forever`, so a Rend tick crit takes
 * Impale too [?] (damage-and-timing §4); and Sunder Armor, which deals no damage. White swings,
 * extra attacks and Deep Wounds aren't in it.
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
  'rend',
  'spearingStrike',
  'sunderArmor',
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
 * Improved Rend's bonus on Rend's bleed by rank, in %: a table, the talent's rank curve 12 / 23 /
 * 35 [F] [tal] [client] (TraitDefinitionEffectPoints, CurvePoint, 1.60.1.69913) (warrior.md §4.1,
 * §7, W13).
 */
export const IMPROVED_REND_PCT = [0, 12, 23, 35]

/**
 * Improved Slam: −250 ms per rank on Slam's cast time and on its GCD (its effects 0 and 1, aura
 * 107 on the cast-time and GCD modifiers, curve −250 / −500), and with any rank Slam no longer
 * interrupts or delays the swing timers [F] [tal] [client] (SpellEffect, CurvePoint, 1.60.1.70009)
 * (warrior.md §3.1 "Slam", §4.1, W4).
 */
export const IMPROVED_SLAM_MS_PER_RANK = 250

/**
 * Improved Slam's cooldown cut, −1500 ms per rank on Slam's 18 s (its effect 2, aura 107 on the
 * cooldown modifier, misc 11, curve −1500 / −3000) [F] [client] (SpellEffect, CurvePoint,
 * 1.60.1.70009): 15 s at 2/2 (warrior.md §4.1, W4).
 */
export const IMPROVED_SLAM_COOLDOWN_MS_PER_RANK = 1500

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
 * W19): 15 + 1.5/s at 2/2. Each gain is floored to a tenth, as talent-scaled energizes are
 * (rage.md#rounding), so 1/2's 1.25-rage ticks give 1.2.
 */
export function bloodrageRage(tenths: number, talents: TalentRanks): number {
  return Math.floor(tenths * (1 + 0.25 * rank(talents, 'Improved Bloodrage')) + 1e-9)
}

/** Improved Berserker Rage: +5 rage per rank when Berserker Rage is used [F] (warrior.md §2.3). */
export const IMPROVED_BERSERKER_RAGE_PER_RANK = 5

/**
 * Improved Overpower: +25% crit chance per rank on Overpower (12290: aura 107, misc 7 crit chance,
 * rank curve 25 / 50) [F] [tal] [client] (SpellEffect, CurvePoint, 1.60.1.69913) (warrior.md §4.1, W5).
 */
export const IMPROVED_OVERPOWER_CRIT_PER_RANK = 25

/**
 * Improved Revenge: +20% Revenge damage per rank, applied to its base and range before other
 * modifiers (12797: aura 108, a percent modifier on Revenge's class mask, rank curve 20 / 40 / 60)
 * [F] [tal] [client] (SpellEffect, CurvePoint, 1.60.1.69913) (warrior.md §4.3, §7 "Damage order", W14).
 */
export const IMPROVED_REVENGE_PCT_PER_RANK = 20

/**
 * The ability as this build uses it: cost reductions, Impale's crit multiplier, Raging Blows'
 * off-hand strike on Whirlwind (warrior.md §3.1 "Raging Blows"; [?] Q13), the rage of
 * Improved Bloodrage and Improved Berserker Rage (§2.3), Improved Rend's bleed, Improved
 * Slam's cast, GCD, cooldown and swing timers, and Improved Overpower's crit (§4.1), and Improved Revenge's
 * damage (§4.3).
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
  } else if (def.id === 'rend') {
    const r = Math.min(rank(talents, 'Improved Rend'), IMPROVED_REND_PCT.length - 1)
    // The whole tick: its base and, in `forever`, its attack-power part (W13).
    const m = 1 + IMPROVED_REND_PCT[r] / 100
    resolved.dotTickDamage = def.dotTickDamage * m
    if (def.dotTickApCoefficient) resolved.dotTickApCoefficient = def.dotTickApCoefficient * m
  } else if (def.id === 'slam') {
    const r = rank(talents, 'Improved Slam')
    resolved.castMs = Math.max(0, def.castMs - IMPROVED_SLAM_MS_PER_RANK * r)
    resolved.gcdMs = Math.max(0, def.gcdMs - IMPROVED_SLAM_MS_PER_RANK * r)
    resolved.cooldownMs = Math.max(0, def.cooldownMs - IMPROVED_SLAM_COOLDOWN_MS_PER_RANK * r)
    resolved.castStopsSwings = def.castStopsSwings && r === 0
  } else if (def.id === 'overpower') {
    resolved.bonusCrit = def.bonusCrit + IMPROVED_OVERPOWER_CRIT_PER_RANK * rank(talents, 'Improved Overpower')
  } else if (def.id === 'revenge') {
    const m = 1 + (IMPROVED_REVENGE_PCT_PER_RANK * rank(talents, 'Improved Revenge')) / 100
    resolved.flatDamage = def.flatDamage * m
    resolved.flatSpread = (def.flatSpread ?? 0) * m
  }
  return resolved
}
