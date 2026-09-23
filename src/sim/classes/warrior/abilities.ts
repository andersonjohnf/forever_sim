// Warrior abilities as data (docs/classes/warrior.md §3.1, docs/architecture.md#engine-design-m1).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), with the
// doc value as fallback. They're written out here rather than read from spells.json at runtime,
// so the app bundle doesn't carry the 1.3 MB client dataset; abilities.test.ts checks every one
// against the client data. Client units: rage costs in tenths (`manaCost` 300 = 30 rage), times
// in ms. Talent cost reductions and Impale's crit multiplier (warrior.md §2.3, §2.5) come with
// the Fury talents in M2.2.
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import type { AbilityPlan } from '../../plan/types'

/** An ability before the plan gives it a breakdown row. */
export type AbilityDef = Omit<AbilityPlan, 'source'>

/** A special that misses or is dodged or parried refunds 80% of its cost [C] (rage.md#rage-refunds-on-avoided-abilities). */
const REFUND = 0.8

/**
 * Bloodthirst rank 4 (spells.json 23894): cost `manaCost` 300, cooldown `categoryRecoveryTime`
 * 6000, GCD `startRecoveryTime` 1500; damage `SCHOOL_DAMAGE` 48 plus `DUMMY` 35 = 35% of AP
 * (docs/data/client.md "AP coefficients"; warrior.md §3.1, W1). A melee spell: two rolls
 * (combat-tables §3). Threat dmg × 1 (threat.md#warrior).
 */
export const BLOODTHIRST: AbilityDef = {
  id: 'bloodthirst',
  name: 'Bloodthirst',
  icon: 'spell_nature_bloodlust',
  kind: 'meleeSpell',
  costTenths: 300,
  cooldownMs: 6000,
  gcdMs: GCD_MS,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 48,
  apCoefficient: 0.35,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 0,
}

/**
 * Whirlwind (spells.json 1680): cost 250, cooldown 10000, GCD 1500, effect 121
 * `NORMALIZED_WEAPON_DMG` (warrior.md §3.1, W3; damage-and-timing §2.2). One roll. No refund on
 * a miss, dodge or parry [C] (rage.md#rage-refunds-on-avoided-abilities). Up to 4 targets
 * (`maxTargets` 4): the primary target only until multi-target support (warrior.md §5.5).
 */
export const WHIRLWIND: AbilityDef = {
  id: 'whirlwind',
  name: 'Whirlwind',
  icon: 'ability_whirlwind',
  kind: 'weaponStrike',
  costTenths: 250,
  cooldownMs: 10000,
  gcdMs: GCD_MS,
  weaponPercent: 1,
  normalized: true,
  flatDamage: 0,
  apCoefficient: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: 0,
  threatMult: 1,
  threatBonus: 0,
}

/**
 * Heroic Strike rank 9 (spells.json 25286): cost 150, no cooldown or GCD, effect 17
 * `WEAPON_DAMAGE_NOSCHOOL` +157 at the real weapon speed (warrior.md §2.4, §3.1, W7). Threat
 * dmg + 173 [C] (threat.md#warrior).
 */
export const HEROIC_STRIKE: AbilityDef = {
  id: 'heroicStrike',
  name: 'Heroic Strike',
  icon: 'ability_rogue_ambush',
  kind: 'onNextSwing',
  costTenths: 150,
  cooldownMs: 0,
  gcdMs: 0,
  weaponPercent: 1,
  normalized: false,
  flatDamage: 157,
  apCoefficient: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 173,
}

/**
 * Hamstring rank 3 (spells.json 7373): cost 100, GCD 1500, `SCHOOL_DAMAGE` 45 flat, physical
 * (warrior.md §3.1). One roll: combat-tables §3's source lists only Bloodthirst, Execute, Shield
 * Slam and Revenge as two-roll. Threat 1.25 × dmg + 135 [C] (threat.md#warrior).
 */
export const HAMSTRING: AbilityDef = {
  id: 'hamstring',
  name: 'Hamstring',
  icon: 'ability_shockwave',
  kind: 'weaponStrike',
  costTenths: 100,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 45,
  apCoefficient: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1.25,
  threatBonus: 135,
}
