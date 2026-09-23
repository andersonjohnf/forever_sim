// Warrior abilities as data (docs/classes/warrior.md §3.1, docs/architecture.md#engine-design-m1).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), with the
// doc value as fallback. They're written out here rather than read from spells.json at runtime,
// so the app bundle doesn't carry the 1.3 MB client dataset; abilities.test.ts checks every one
// against the client data. Client units: rage costs in tenths (`manaCost` 300 = 30 rage), times
// in ms. These are the base rows: talents (cost reductions, Impale, Raging Blows) are applied by
// `withTalents` in modifiers.ts when the plan resolves the rotation.
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import { type AbilityPlan, STANCE, STANCE_ANY } from '../../plan/types'

/**
 * An ability before the plan gives it breakdown rows. `offHand` asks for a second strike with the
 * off hand (Raging Blows' Whirlwind, warrior.md §3.1); the plan gives it its own row.
 */
export type AbilityDef = Omit<AbilityPlan, 'source' | 'offHandSource'> & { offHand: boolean }

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
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 48,
  apCoefficient: 0.35,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 0,
  offHand: false,
}

/**
 * Whirlwind (spells.json 1680): cost 250, cooldown 10000, GCD 1500, effect 121
 * `NORMALIZED_WEAPON_DMG` (warrior.md §3.1, W3; damage-and-timing §2.2), Berserker Stance only
 * (`shapeshiftMask` 0x40000). One roll. No refund on a miss, dodge or parry [C]
 * (rage.md#rage-refunds-on-avoided-abilities). Up to 4 targets (`maxTargets` 4): the primary
 * target only until multi-target support (warrior.md §5.5). Raging Blows adds an off-hand strike
 * (modifiers.ts).
 */
export const WHIRLWIND: AbilityDef = {
  id: 'whirlwind',
  name: 'Whirlwind',
  icon: 'ability_whirlwind',
  kind: 'weaponStrike',
  costTenths: 250,
  cooldownMs: 10000,
  gcdMs: GCD_MS,
  stances: STANCE.berserker,
  executePhaseOnly: false,
  weaponPercent: 1,
  normalized: true,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: 0,
  threatMult: 1,
  threatBonus: 0,
  offHand: false,
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
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 1,
  normalized: false,
  flatDamage: 157,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 173,
  offHand: false,
}

/**
 * Hamstring rank 3 (spells.json 7373): cost 100, GCD 1500, `SCHOOL_DAMAGE` 45 flat, physical,
 * Battle or Berserker Stance (`shapeshiftMask` 0x50000; warrior.md §3.1). One roll: combat-tables §3's source lists only Bloodthirst, Execute, Shield
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
  stances: STANCE.battle | STANCE.berserker,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 45,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1.25,
  threatBonus: 135,
  offHand: false,
}

/**
 * Execute rank 5 (spells.json 20662): cost 150, no cooldown, GCD 1500, Battle or Berserker Stance
 * (`shapeshiftMask` 0x50000), only on a target at or below 20% health (`targetAuraState` 2).
 * Damage `DUMMY` 600 plus 15 per rage left after the cost [F] [sb]; the 15 is server-side, not in
 * the client data (warrior.md §3.1 "Execute details", W10). A melee spell: two rolls
 * (combat-tables §3). A miss, dodge or parry loses only the cost, with no refund [C]
 * (rage.md#rage-refunds-on-avoided-abilities). Threat dmg × 1.25 [?] (threat.md#warrior).
 */
export const EXECUTE: AbilityDef = {
  id: 'execute',
  name: 'Execute',
  icon: 'inv_sword_48',
  kind: 'meleeSpell',
  costTenths: 150,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  stances: STANCE.battle | STANCE.berserker,
  executePhaseOnly: true,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 600,
  apCoefficient: 0,
  damagePerExtraRage: 15,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: 0,
  threatMult: 1.25,
  threatBonus: 0,
  offHand: false,
}

/** Execute's damage before modifiers: `600 + 15 × (rage − cost)`, rage read after paying the cost (warrior.md §3.1, W10). */
export const executeDamage = (rage: number, cost: number) => EXECUTE.flatDamage + EXECUTE.damagePerExtraRage * (rage - cost)

/**
 * The AP above which Bloodthirst beats an Execute cast at Bloodthirst's 30 rage:
 * `0.35 × AP + 48 > 600 + 15 × (30 − cost)` (warrior.md W11): 2220 at cost 15, 2434.29 at cost 10.
 */
export const executeBreakEvenAp = (executeCost: number) =>
  (executeDamage(BLOODTHIRST.costTenths / 10, executeCost) - BLOODTHIRST.flatDamage) / BLOODTHIRST.apCoefficient
