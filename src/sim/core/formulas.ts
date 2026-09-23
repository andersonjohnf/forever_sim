// Damage, timing, rage and threat formulas as pure functions. The engine's hot loop inlines the
// same arithmetic on precomputed values; these are the reference versions its tests check
// against, each citing the doc section that owns it.
import type { DamageTakenRageModel, RulesProfile } from '../rules/profiles'

// ---------------------------------------------------------------------------------------------
// Armor: docs/mechanics/damage-and-timing.md#1-armor
// ---------------------------------------------------------------------------------------------

/** K = 400 + 85 × attacker level: 5500 for a level-60 player, 5755 for a level-63 boss (§1.1). */
export const armorConstant = (attackerLevel: number) => 400 + 85 * attackerLevel

/**
 * The lowest armor the `forever` profile counts: −K/2 (−2,750 for a level-60 attacker), where the
 * reduction is −100% and damage doubles. An engine guard [?] (§1.1): A / (A + K) grows without
 * bound as A nears −K and flips sign below it, and no Forever source says what happens there.
 */
export const negativeArmorFloor = (attackerLevel: number) => -armorConstant(attackerLevel) / 2

/**
 * Damage reduction from armor, capped at 75% (§1.1). `classicEra` floors armor at 0; `forever`
 * lets it go negative, so the reduction is negative and damage rises (§1.2), down to the
 * −K/2 floor (×2.0 damage). A custom boss armor of about 1,000 or less, under every armor
 * debuff (−3,755 in all), reaches it; the plan builder then says so in the `negativeArmor`
 * assumption.
 */
export function armorReduction(armor: number, attackerLevel: number, profile: RulesProfile): number {
  const k = armorConstant(attackerLevel)
  const a = profile.armor.allowNegative ? Math.max(armor, negativeArmorFloor(attackerLevel)) : Math.max(0, armor)
  return Math.min(a / (a + k), profile.armor.cap)
}

// ---------------------------------------------------------------------------------------------
// Boss melee on the tank: docs/mechanics/combat-tables.md#8-boss--player-tanks and
// docs/mechanics/damage-and-timing.md#26-order-of-operations-physical-direct-hit
// ---------------------------------------------------------------------------------------------

/** The boss's swing outcomes that land on the player (combat-tables §8). */
export type BossHitOutcome = 'hit' | 'crit' | 'crush' | 'block'

/** Damage multiplier of a landed boss swing: a crit ×2, a crushing blow ×1.5 (damage-and-timing §2.5). */
export function bossOutcomeMultiplier(outcome: BossHitOutcome): number {
  return outcome === 'crit' ? CRIT_MULTIPLIER.creature : outcome === 'crush' ? CRIT_MULTIPLIER.crushing : 1
}

/**
 * Health one landed boss swing costs (damage-and-timing §2.6, boss → tank): the swing × the
 * damage-taken modifiers (Defensive Stance's −10%, …) × (1 − armor reduction against the boss's
 * level) × the outcome's multiplier, then a block removes the block value, never below 0. Crits
 * and crushing blows can't be blocked: they're other outcomes of the one roll (combat-tables §8).
 */
export function bossHitHealthLost(
  swing: number,
  outcome: BossHitOutcome,
  armorReductionPct: number,
  damageTakenMult: number,
  blockValue: number,
): number {
  const mitigated = swing * damageTakenMult * (1 - armorReductionPct) * bossOutcomeMultiplier(outcome)
  return outcome === 'block' ? Math.max(0, mitigated - blockValue) : mitigated
}

/**
 * The size of a landed boss swing that Forever's rage from damage taken reads, `D_pre`: before
 * armor, block, absorbs and damage-taken modifiers, a crit or crushing blow at its multiplied size
 * (rage.md#forever-). A block doesn't lower it.
 */
export const bossHitPreMitigation = (swing: number, outcome: BossHitOutcome) => swing * bossOutcomeMultiplier(outcome)

// ---------------------------------------------------------------------------------------------
// Weapon damage: docs/mechanics/damage-and-timing.md#2-weapon-damage
// ---------------------------------------------------------------------------------------------

/** Attack power per damage per second of weapon speed: ATTACK_POWER_MAGIC_NUMBER (§2.1). */
export const AP_PER_DPS = 14

/** Average weapon damage before multipliers: (min + max)/2 + flat + AP/14 × speed (§2.1). */
export const averageWeaponDamage = (min: number, max: number, flat: number, ap: number, speedSec: number) =>
  (min + max) / 2 + flat + (ap / AP_PER_DPS) * speedSec

/** Off-hand share of damage before talents (§2.3). */
export const OFF_HAND_DAMAGE = 0.5

/** Normalized weapon speeds (§2.2). */
export const NORMALIZED_SPEED = { oneHand: 2.4, dagger: 1.7, twoHand: 3.3 } as const

/** Crit multipliers (§2.5): melee and ranged ×2, spells ×1.5, crushing ×1.5. */
export const CRIT_MULTIPLIER = { melee: 2, spell: 1.5, creature: 2, crushing: 1.5 } as const

// ---------------------------------------------------------------------------------------------
// Timing: docs/mechanics/damage-and-timing.md#3-swing-timers
// ---------------------------------------------------------------------------------------------

/** A hasted swing in integer ms: speed / Π(1 + haste_i), rounded (§3.1, implementation notes). */
export const swingMs = (speedSec: number, hasteProduct: number) => Math.round((speedSec * 1000) / hasteProduct)

/**
 * Parry haste on the defender's pending swing (§3.4): remove 40% of its swing speed, but never
 * leave less than 20% of it; if less than 20% remains, nothing changes.
 */
export const parryHasteRemaining = (remainingMs: number, swingMsValue: number) =>
  remainingMs - Math.min(0.4 * swingMsValue, Math.max(0, remainingMs - 0.2 * swingMsValue))

/** Chance per landed hit for a procs-per-minute effect: PPM × base weapon speed / 60 (§5.1). */
export const ppmChance = (ppm: number, baseSpeedSec: number) => (ppm * baseSpeedSec) / 60

/** GCD in ms for warrior and paladin abilities (§3.5); not reduced by haste. */
export const GCD_MS = 1500

/** Attack-speed slow on the boss: base × (1 + slow) (§3.2, convention [?]). */
export const slowedSwingSec = (baseSec: number, slow: number) => baseSec * (1 + slow)

/**
 * When the execute phase starts, in integer ms: `t_exec = floor(L_i × (1 − executePct/100))`
 * (docs/mechanics/encounter.md#implementation-notes, WE-1). Computed as L_i × (100 − pct) / 100
 * so whole percentages floor exactly (41 000 × (1 − 0.3) floors to 28 699, not 28 700). At 0% it
 * is the fight's end: no execute phase.
 */
export const executePhaseStart = (fightMs: number, executePct: number) => Math.floor((fightMs * (100 - executePct)) / 100)

// ---------------------------------------------------------------------------------------------
// Rage: docs/mechanics/rage.md
// ---------------------------------------------------------------------------------------------

/** Rage conversion value c(L) (rage.md#classic-era-formula-c); 230.6 at level 60. */
export const rageConversion = (level: number) => 0.0091107836 * level * level + 3.225598133 * level + 4.2652911

/**
 * Floors a rage amount to whole tenths, exact for representable inputs: energizes and rotation
 * thresholds (rage.md#rounding). White hits and hits taken keep their fraction in `forever` instead.
 */
export const toTenths = (rage: number) => Math.floor(rage * 10 + 1e-9)

export type SwingResult = 'hit' | 'crit' | 'glance' | 'block' | 'miss' | 'dodge' | 'parry'

/**
 * Base rage from one white swing, before the warrior's Dual Wield Specialization multiplier
 * (rage.md#rage-from-damage-dealt, pseudo-code). `damageDealt` is after armor; `wouldBeDamage`
 * is what a dodged or parried swing would have dealt.
 */
export function whiteHitRage(
  profile: RulesProfile,
  outcome: SwingResult,
  offHand: boolean,
  twoHand: boolean,
  baseSpeedSec: number,
  damageDealt: number,
  wouldBeDamage: number,
  level = 60,
): number {
  const r = profile.rage
  if (r.white === 'normalized') {
    if (outcome === 'miss' || outcome === 'dodge' || outcome === 'parry' || damageDealt <= 0) return 0
    const k = twoHand ? r.normalizedTwoHand : r.normalizedOneHand
    return k * baseSpeedSec * (offHand ? r.offHandBase : 1)
  }
  const c = rageConversion(level)
  if (outcome === 'miss') return 0
  if (outcome === 'dodge' || outcome === 'parry') return (r.avoidedWhiteShare * 7.5 * wouldBeDamage) / c
  return (7.5 * damageDealt) / c
}

/**
 * Rage from one hit that lands on you (rage.md#rage-from-damage-taken). `preMitigation` is the
 * hit's damage before armor, block, absorbs and damage-taken modifiers, a crit or crushing blow at
 * its multiplied size; `healthLost` is what it cost after all of them. A missed, dodged or parried
 * attack deals neither, so it gives 0.
 * - `forever`, the Forever default: 10 × preMitigation ÷ max health (rage.md#forever-). A blocked
 *   or fully absorbed hit gives its full rage.
 * - `foreverFlat`: 1.5 × health lost ÷ c(L), the earlier low-level fit.
 * - `foreverHealthLost`: 10 × health lost ÷ max health.
 * - `classic`: 2.5 × health lost ÷ c(L) (rage.md#classic-era-c).
 * The three health-lost models give 0 for a hit that costs no health.
 */
export function damageTakenRage(
  model: DamageTakenRageModel,
  healthLost: number,
  preMitigation: number,
  maxHealth: number,
  level = 60,
): number {
  switch (model) {
    case 'forever':
      return preMitigation > 0 && maxHealth > 0 ? (10 * preMitigation) / maxHealth : 0
    case 'foreverFlat':
      return healthLost > 0 ? (1.5 * healthLost) / rageConversion(level) : 0
    case 'foreverHealthLost':
      return healthLost > 0 && maxHealth > 0 ? (10 * healthLost) / maxHealth : 0
    case 'classic':
      return healthLost > 0 ? (2.5 * healthLost) / rageConversion(level) : 0
  }
}

// ---------------------------------------------------------------------------------------------
// Threat: docs/mechanics/threat.md
// ---------------------------------------------------------------------------------------------

/** threat = (amount × abilityMult + bonus) × Π global multipliers (threat.md#base-rule-and-how-modifiers-stack). */
export const threat = (amount: number, abilityMult: number, bonus: number, globalMult: number) =>
  (amount * abilityMult + bonus) * globalMult

/** Threat per rage gained from a spell effect, split across enemies, no multipliers (threat.md). */
export const THREAT_PER_RAGE = 5

/** Aggro thresholds: melee 110%, ranged 130% of the current target's threat (threat.md#aggro-thresholds). */
export const AGGRO_THRESHOLD = { melee: 1.1, ranged: 1.3 } as const
