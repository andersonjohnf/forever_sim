// Warrior abilities as data (docs/classes/warrior.md §3.1, docs/architecture.md#engine-design-m1).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), with the
// doc value as fallback. They're written out here rather than read from spells.json at runtime,
// so the app bundle doesn't carry the 1.3 MB client dataset; abilities.test.ts checks every one
// against the client data. Client units: rage costs in tenths (`manaCost` 300 = 30 rage), times
// in ms. These are the base rows: talents (cost reductions, Impale, Raging Blows, Improved
// Bloodrage, Improved Berserker Rage) are applied by `withTalents` in modifiers.ts when the plan
// resolves the rotation. Strikes roll the attack tables; `cast` rows (Battle Shout, Bloodrage,
// Death Wish, Recklessness, Berserker Rage, racial cooldowns, on-use items and consumables)
// apply an aura and grant rage (warrior.md §3.2, §5.2).
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import type { OnUseSpec } from '../../effects/types'
import { type AbilityDef, STANCE, STANCE_ANY } from '../../plan/types'

export type { AbilityDef } from '../../plan/types'

/** A special that misses or is dodged or parried refunds 80% of its cost [C] (rage.md#rage-refunds-on-avoided-abilities). */
const REFUND = 0.8

/** A cast's rage and use fields when it has none of its own: no rage, no limit on uses. */
const NO_CAST_RAGE = { rageTenths: 0, rageSpreadTenths: 0, rageTickTenths: 0, rageTicks: 0, rageTickMs: 0, usesPerFight: 0 } as const

/** The `cast` fields of an attack: no aura, no rage, no limit on uses. */
const NO_CAST = { aura: null, ...NO_CAST_RAGE } as const

/** The attack fields of a `cast`: it rolls nothing, deals nothing and refunds nothing. */
export const NO_STRIKE = {
  kind: 'cast',
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: 0,
  threatMult: 0,
  threatBonus: 0,
  offHand: false,
} as const

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
  ...NO_CAST,
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
  ...NO_CAST,
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
  ...NO_CAST,
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
  ...NO_CAST,
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
  ...NO_CAST,
}

/**
 * Bloodrage (spells.json 2687): no rage cost (its cost is 20% of base health, not simulated),
 * `recoveryTime` 60000, no GCD, any stance. `ENERGIZE` 100 tenths at once, then its trigger 29131
 * energizes 10 tenths every 1000 ms for 10000 ms: 10 ticks, the first 1 s after the cast
 * (warrior.md §2.3, §3.2, W19). Improved Bloodrage multiplies all of it (modifiers.ts).
 */
export const BLOODRAGE: AbilityDef = {
  id: 'bloodrage',
  name: 'Bloodrage',
  icon: 'ability_racial_bloodrage',
  ...NO_STRIKE,
  costTenths: 0,
  cooldownMs: 60000,
  gcdMs: 0,
  stances: STANCE_ANY,
  aura: null,
  rageTenths: 100,
  rageSpreadTenths: 0,
  rageTickTenths: 10,
  rageTicks: 10,
  rageTickMs: 1000,
  usesPerFight: 0,
}

/**
 * Battle Shout rank 7 (spells.json 25289): cost `manaCost` 100, no cooldown, GCD 1500, any stance;
 * for 180000 ms aura 99 (melee attack power) at base 139 + 0.6 per level above `baseLevel` 60, so
 * 139 at 60 (warrior.md §1.1, §3.2). Focused Rage doesn't reduce it (§2.3). Its threat (60 per
 * party member buffed, threat.md) isn't counted: the party isn't modelled (warrior.md §7).
 */
export const BATTLE_SHOUT: AbilityDef = {
  id: 'battleShout',
  name: 'Battle Shout',
  icon: 'ability_warrior_battleshout',
  ...NO_STRIKE,
  costTenths: 100,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  stances: STANCE_ANY,
  aura: { id: 'battleShout', name: 'Battle Shout', durationMs: 180000, mods: { ap: 139 } },
  ...NO_CAST_RAGE,
}

/**
 * Charge rank 3 (spells.json 11578): an energize of 150 tenths, Battle Stance only, out of combat
 * only; Improved Charge adds 30 tenths per rank (12285, aura 107 +30). The sim uses it only as the
 * opener's rage (warrior.md §2.3, §5.2 row 0).
 */
export const CHARGE_RAGE_TENTHS = 150
export const IMPROVED_CHARGE_TENTHS_PER_RANK = 30

/**
 * A stance swap keeps at most 10 rage (Tactical Mastery, trained) plus 3 per rank of Improved
 * Tactical Mastery (warrior.md §2.1) [F].
 */
export const TACTICAL_MASTERY_TENTHS = 100
export const IMPROVED_TACTICAL_MASTERY_TENTHS_PER_RANK = 30

/**
 * Death Wish (spells.json 12328): cost 100, `recoveryTime` 180000, GCD 1500, any stance; for
 * 30000 ms aura 79 (damage done %) +20 on the physical school (warrior.md §2.6, §3.2). Its 5%
 * more damage taken (aura 87) isn't simulated (warrior.md §7).
 */
export const DEATH_WISH: AbilityDef = {
  id: 'deathWish',
  name: 'Death Wish',
  icon: 'spell_shadow_deathpact',
  ...NO_STRIKE,
  costTenths: 100,
  cooldownMs: 180000,
  gcdMs: GCD_MS,
  stances: STANCE_ANY,
  aura: { id: 'deathWish', name: 'Death Wish', durationMs: 30000, mods: { damage: 20 } },
  ...NO_CAST_RAGE,
}

/**
 * Recklessness (spells.json 1719): no cost, `recoveryTime` 1800000 (once per fight: fights are at
 * most 900 s + 25%), GCD 1500, Berserker Stance only; for 15000 ms aura 290 (all crit) +100
 * (warrior.md §2.6, §3.2). It's aura crit, so the white table still caps it (combat-tables §2.2)
 * and the +3-boss suppression is unchanged (already at its 1.8% maximum, §4.4); its 20% more
 * damage taken (aura 87) isn't simulated (warrior.md §7).
 */
export const RECKLESSNESS: AbilityDef = {
  id: 'recklessness',
  name: 'Recklessness',
  icon: 'ability_criticalstrike',
  ...NO_STRIKE,
  costTenths: 0,
  cooldownMs: 1800000,
  gcdMs: GCD_MS,
  stances: STANCE.berserker,
  aura: { id: 'recklessness', name: 'Recklessness', durationMs: 15000, mods: { crit: 100 } },
  ...NO_CAST_RAGE,
}

/**
 * Berserker Rage (spells.json 18499): no cost, `recoveryTime` 30000, GCD 1500, Berserker Stance
 * only (warrior.md §2.2, §3.2). Its own effects (fear immunity; extra rage from damage taken,
 * ×1.0 by rage.md's default, Q20) change nothing in the sim; Improved Berserker Rage's +5/+10
 * rage on use comes from modifiers.ts.
 */
export const BERSERKER_RAGE: AbilityDef = {
  id: 'berserkerRage',
  name: 'Berserker Rage',
  icon: 'spell_nature_ancestralguardian',
  ...NO_STRIKE,
  costTenths: 0,
  cooldownMs: 30000,
  gcdMs: GCD_MS,
  stances: STANCE.berserker,
  aura: null,
  ...NO_CAST_RAGE,
}

/**
 * Racial cooldowns the Fury rotation presses (warrior.md §2.9, §5.2 row 3), by race id. All are
 * off the GCD (`startRecoveryTime` 0), cost nothing (no `SpellPower` row) and work in any stance
 * [F] [client] (SpellCooldowns, SpellDuration, SpellEffect, 1.60.1.69913):
 * - Orc Blood Fury (20572): aura 166 (attack power %) +10 for 15000 ms, `recoveryTime` 120000;
 *   its ranged-AP and spell-power parts don't matter to a warrior.
 * - Troll Berserking (20554): aura 319 (melee haste %) +10 for 10000 ms, `recoveryTime` 180000,
 *   multiplicative with other haste (W17).
 * - Night Elf Elune's Light (1259799): aura 290 (all crit) +10 for 15000 ms, `recoveryTime` 180000.
 * Gnome Eureka! (1259813) isn't simulated (warrior.md §7, Q18).
 */
const racialCooldown = (id: string, name: string, icon: string, cooldownMs: number, aura: AbilityDef['aura']): AbilityDef => ({
  id,
  name,
  icon,
  ...NO_STRIKE,
  costTenths: 0,
  cooldownMs,
  gcdMs: 0,
  stances: STANCE_ANY,
  aura,
  ...NO_CAST_RAGE,
})

export const BLOOD_FURY = racialCooldown('bloodFury', 'Blood Fury', 'racial_orc_berserkerstrength', 120000, {
  id: 'bloodFury',
  name: 'Blood Fury',
  durationMs: 15000,
  mods: { apPct: 10 },
})
export const BERSERKING = racialCooldown('berserking', 'Berserking', 'racial_troll_berserk', 180000, {
  id: 'berserking',
  name: 'Berserking',
  durationMs: 10000,
  mods: { haste: 10 },
})
export const ELUNES_LIGHT = racialCooldown('elunesLight', 'Elune’s Light', 'spell_holy_elunesgrace', 180000, {
  id: 'elunesLight',
  name: 'Elune’s Light',
  durationMs: 15000,
  mods: { crit: 10 },
})

/**
 * An on-use item or consumable as a cast (effects/types.ts OnUseSpec): no cost, any stance, its
 * cooldown, GCD, buff and rage from the spec (warrior.md §5.2 rows 3, 16 and 17).
 */
export const onUseAbility = (use: OnUseSpec): AbilityDef => ({
  id: use.id,
  name: use.name,
  icon: use.icon,
  ...NO_STRIKE,
  costTenths: 0,
  cooldownMs: use.cooldownMs,
  gcdMs: use.gcdMs,
  stances: STANCE_ANY,
  aura: use.aura,
  ...NO_CAST_RAGE,
  rageTenths: use.rageTenths,
  rageSpreadTenths: use.rageSpreadTenths,
})

export const RACIAL_COOLDOWNS: Readonly<Partial<Record<string, AbilityDef>>> = {
  'horde-orc': BLOOD_FURY,
  'horde-troll': BERSERKING,
  'alliance-night-elf': ELUNES_LIGHT,
}

/** Execute's damage before modifiers: `600 + 15 × (rage − cost)`, rage read after paying the cost (warrior.md §3.1, W10). */
export const executeDamage = (rage: number, cost: number) => EXECUTE.flatDamage + EXECUTE.damagePerExtraRage * (rage - cost)

/**
 * The AP above which Bloodthirst beats an Execute cast at Bloodthirst's 30 rage:
 * `0.35 × AP + 48 > 600 + 15 × (30 − cost)` (warrior.md W11): 2220 at cost 15, 2434.29 at cost 10.
 */
export const executeBreakEvenAp = (executeCost: number) =>
  (executeDamage(BLOODTHIRST.costTenths / 10, executeCost) - BLOODTHIRST.flatDamage) / BLOODTHIRST.apCoefficient
