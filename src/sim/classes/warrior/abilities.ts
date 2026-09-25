// Warrior abilities as data (docs/classes/warrior.md §3.1, docs/architecture.md#engine-design-m1).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), with the
// doc value as fallback. They're written out here rather than read from spells.json at runtime,
// so the app bundle doesn't carry the 1.3 MB client dataset; abilities.test.ts checks every one
// against the client data. Client units: rage costs in tenths (`manaCost` 300 = 30 rage), times
// in ms. These are the base rows: talents (cost reductions, Impale, Raging Blows, Improved
// Bloodrage, Improved Berserker Rage, Improved Rend, Improved Slam, Improved Overpower, Improved
// Revenge) are applied by `withTalents` in modifiers.ts when the plan resolves the rotation.
// Strikes roll the attack tables (Slam after its cast time; Overpower and Revenge only while their
// window is open, and only a miss avoids Overpower); `spell` rows roll the spell table (Thunder
// Clap, Demoralizing Shout); a landed strike or spell can put a debuff on the boss (Sunder Armor,
// Thunder Clap, Demoralizing Shout); Rend's `bleed` row lands a bleed; `cast` rows (Battle Shout,
// Bloodrage, Death Wish, Recklessness, Berserker Rage, Shield Block, racial cooldowns, on-use items
// and consumables) apply an aura and grant rage (warrior.md §3.1, §3.2, §2.8, §5.2, §5.4, §7).
// Stance swaps' cooldown and rage cap are here too (§2.1).
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import type { AuraSpec, OnUseSpec, ProcSpec } from '../../effects/types'
import { type AbilityDef, STANCE, STANCE_ANY } from '../../plan/types'
import type { RulesProfile } from '../../rules/profiles'

export type { AbilityDef } from '../../plan/types'

/** A special that misses or is dodged or parried refunds 80% of its cost [C] (rage.md#rage-refunds-on-avoided-abilities). */
const REFUND = 0.8

/** A cast's rage and use fields when it has none of its own: no rage, no limit on uses. */
const NO_CAST_RAGE = { rageTenths: 0, rageSpreadTenths: 0, rageTickTenths: 0, rageTicks: 0, rageTickMs: 0, usesPerFight: 0 } as const

/** The `cast` fields of an attack: no aura, no rage, no limit on uses. */
const NO_CAST = { aura: null, ...NO_CAST_RAGE } as const

/**
 * The fields of an instant ability with no weapon restriction beyond a melee weapon, no bleed, and
 * the whole attack table (it can be dodged, parried and blocked).
 */
const INSTANT = {
  castMs: 0,
  castStopsSwings: false,
  twoHandOnly: false,
  unavoidable: false,
  dotTickDamage: 0,
  dotTicks: 0,
  dotTickMs: 0,
  periodicCanCrit: false,
} as const

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
  ...INSTANT,
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
  ...INSTANT,
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
  ...INSTANT,
  ...NO_CAST,
}

/**
 * Heroic Strike rank 8 (spells.json 11567), the trainer's top rank: rank 9 is an Ahn'Qiraj book
 * (D36; warrior.md §3.1). Cost 150, no cooldown or GCD, effect 17 `WEAPON_DAMAGE_NOSCHOOL` +138 at
 * the real weapon speed (warrior.md §2.4, §3.1, W7). Threat dmg + 145 [C] (threat.md#warrior).
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
  flatDamage: 138,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 145,
  offHand: false,
  ...INSTANT,
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
  ...INSTANT,
  ...NO_CAST,
}

/**
 * Execute rank 5 (spells.json 20662): cost 150, no cooldown, GCD 1500, Battle or Berserker Stance
 * (`shapeshiftMask` 0x50000), only on a target at or below 20% health (`targetAuraState` 2).
 * Damage `DUMMY` 600 plus 15 per rage left after the cost [F] [sb]. The 15 is client data: the
 * effect's `effectChainAmplitude` 1.5, which the tooltip's `$*10;F1` shows as 15 [F] [client]
 * (spells.json 20662; warrior.md §3.1 "Execute details", W10). A melee spell: two rolls
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
  ...INSTANT,
  ...NO_CAST,
}

/**
 * Mortal Strike rank 4 (spells.json 21553): cost 300, cooldown `categoryRecoveryTime` 6000, GCD
 * 1500, any stance, effect 121 `NORMALIZED_WEAPON_DMG` +160 (warrior.md §3.1, W2;
 * damage-and-timing §2.2). One roll (combat-tables §3). Its −50% healing on the target doesn't
 * matter to damage. Threat dmg × 1 [C] (threat.md#warrior).
 */
export const MORTAL_STRIKE: AbilityDef = {
  id: 'mortalStrike',
  name: 'Mortal Strike',
  icon: 'ability_warrior_savageblow',
  kind: 'weaponStrike',
  costTenths: 300,
  cooldownMs: 6000,
  gcdMs: GCD_MS,
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 1,
  normalized: true,
  flatDamage: 160,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 0,
  offHand: false,
  ...INSTANT,
  ...NO_CAST,
}

/**
 * Slam rank 5 (spells.json 11605, and its Improved Slam version 1310200 with the same numbers):
 * cost 150, cooldown `categoryRecoveryTime` 18000 (1.60.1.70009; 15000 before), GCD 1500, cast
 * `castTime` 1500, any stance,
 * effect 17 `WEAPON_DAMAGE_NOSCHOOL` +87 at the real weapon speed (warrior.md §3.1, W4). One
 * roll. Without Improved Slam no white swings land during the cast and both swing timers restart
 * when it completes (§3.1 "Slam"; damage-and-timing §3.3); Improved Slam shortens the cast, the
 * GCD and the cooldown and leaves the timers alone (modifiers.ts). Threat dmg × 1 [C]
 * (threat.md#warrior).
 */
export const SLAM: AbilityDef = {
  id: 'slam',
  name: 'Slam',
  icon: 'ability_warrior_decisivestrike',
  kind: 'weaponStrike',
  costTenths: 150,
  cooldownMs: 18000,
  gcdMs: GCD_MS,
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 1,
  normalized: false,
  flatDamage: 87,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 0,
  offHand: false,
  ...INSTANT,
  castMs: 1500,
  castStopsSwings: true,
  ...NO_CAST,
}

/**
 * Spearing Strike (spells.json 1310222, an Arms talent): cost 150, cooldown `recoveryTime` 20000,
 * GCD 1500, any stance, two-handed weapons only (`equippedItemSubclass` 1378: two-handed axes,
 * maces and swords, polearms and staves). Effect 121 `NORMALIZED_WEAPON_DMG` plus effect 31
 * `WEAPON_PERCENT_DAMAGE` 40: 0.40 × normalized main-hand damage, AP included; against Giants
 * and Dragonkin (and mounted targets, which bosses aren't) the tooltip's "additional 80%" makes
 * it 1.20 [F] [?] (warrior.md §3.1, W6, Q13). One roll. Threat dmg × 1 [?] (threat.md#warrior).
 */
export const SPEARING_STRIKE: AbilityDef = {
  id: 'spearingStrike',
  name: 'Spearing Strike',
  icon: 'inv_spear_01',
  kind: 'weaponStrike',
  costTenths: 150,
  cooldownMs: 20000,
  gcdMs: GCD_MS,
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 0.4,
  normalized: true,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 0,
  offHand: false,
  ...INSTANT,
  twoHandOnly: true,
  ...NO_CAST,
  vsCreature: { types: ['giant', 'dragonkin'], weaponPercent: 1.2 },
}

/**
 * Rend rank 7 (spells.json 11574): cost 100, no cooldown, GCD 1500, Battle or Defensive Stance
 * (`shapeshiftMask` 0x30000); aura 3 (periodic damage) 21 every `effectAuraPeriod` 3000 for
 * `duration` 21000: 7 ticks, 147 in all, with the periodic-crit flag (SpellMisc Attributes[8]
 * 0x200) (warrior.md §3.1, W13; damage-and-timing §4). The application rolls miss, dodge and
 * parry and can't crit; a miss, dodge or parry refunds 80% [C]
 * (rage.md#rage-refunds-on-avoided-abilities). Improved Rend multiplies the ticks (modifiers.ts).
 * Its `aura` marks the bleed on the target for 21 s. Threat: each tick's dmg × 1 [C]
 * (threat.md#warrior).
 */
export const REND: AbilityDef = {
  id: 'rend',
  name: 'Rend',
  icon: 'ability_gouge',
  kind: 'bleed',
  costTenths: 100,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  stances: STANCE.battle | STANCE.defensive,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 0,
  offHand: false,
  ...INSTANT,
  dotTickDamage: 21,
  dotTicks: 7,
  dotTickMs: 3000,
  periodicCanCrit: true,
  ...NO_CAST,
  aura: { id: 'rend', name: 'Rend', durationMs: 21000, mods: {} },
}

/**
 * The Overpower window (spells.json 1282733, "Overpower"): a dodge of any of your attacks opens it
 * for `duration` 5000 ms (warrior.md §2.8). In the client it grants 1 point of power type 4, which
 * Overpower spends as its second cost. Since 1.60.1.70009 the aura no longer stacks (it lost its
 * `cumulativeAura` 3), so a new dodge refreshes the one window and none are banked [F] (Q10).
 * Bloodthrill triggers the same spell, so its window is this one, 5 s too; a refresh never shortens it
 * (warrior.md §7).
 */
export const OVERPOWER_WINDOW: AuraSpec = { id: 'overpowerWindow', name: 'Overpower window', durationMs: 5000, mods: {} }

/**
 * Bloodthrill's chance per rank, % (spells.json 1289682's rank curve 4 / 8 / 12 / 16 / 20 [F]
 * [client] (TraitDefinitionEffectPoints, CurvePoint, 1.60.1.70009); 2 / 4 / 6 / 8 / 10 before).
 */
export const BLOODTHRILL_PCT_PER_RANK = 4

/**
 * Overpower rank 4 (spells.json 11585): cost 50, cooldown `categoryRecoveryTime` 5000, GCD 1500,
 * Battle Stance only (`shapeshiftMask` 0x10000), effect 121 `NORMALIZED_WEAPON_DMG` +35
 * (warrior.md §3.1, W5; damage-and-timing §2.2). Usable only while the Overpower window is open,
 * which using it closes (its second cost, 1 point of power type 4; §2.8). It can't be dodged,
 * parried or blocked [F] [sb], so its one roll is miss, crit, hit (combat-tables §3). Improved
 * Overpower adds 25% crit per rank (modifiers.ts). A miss refunds 80% [C]
 * (rage.md#rage-refunds-on-avoided-abilities). Threat dmg × 0.75 [C] (threat.md#warrior).
 */
export const OVERPOWER: AbilityDef = {
  id: 'overpower',
  name: 'Overpower',
  icon: 'ability_meleedamage',
  kind: 'weaponStrike',
  costTenths: 50,
  cooldownMs: 5000,
  gcdMs: GCD_MS,
  stances: STANCE.battle,
  executePhaseOnly: false,
  weaponPercent: 1,
  normalized: true,
  flatDamage: 35,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 0.75,
  threatBonus: 0,
  offHand: false,
  ...INSTANT,
  unavoidable: true,
  ...NO_CAST,
  window: OVERPOWER_WINDOW,
}

/**
 * The procs that open the Overpower window, for a rotation that uses Overpower (warrior.md §2.8):
 * a target's dodge of any of your attacks, white or special, either hand; and with Bloodthrill, 4% per
 * rank on each landed main-hand melee attack, white or special (Heroic Strike and Cleave included,
 * extra attacks too; never the off hand: its proc mask 0x14 and Attributes[3] 0x400, main hand only),
 * while your Rend is on the target [F] (1.60.1.70009; Q11). Both open the same 5 s window (1282733).
 * Without Rend in the rotation the plan leaves Bloodthrill out.
 */
export function overpowerWindowProcs(talents: ReadonlyMap<string, number>): ProcSpec[] {
  const doc = 'docs/classes/warrior.md#28-reactive-abilities-overpower-bloodthrill-revenge'
  const procs: ProcSpec[] = [
    {
      id: 'overpowerDodge',
      name: 'Overpower',
      icon: OVERPOWER.icon,
      trigger: 'targetDodge',
      from: 'any',
      chance: { pct: 100 },
      action: { kind: 'aura', aura: OVERPOWER_WINDOW },
      docRef: doc,
    },
  ]
  const bloodthrill = talents.get('Bloodthrill') ?? 0
  if (bloodthrill > 0) {
    procs.push({
      id: 'bloodthrill',
      name: 'Bloodthrill',
      icon: 'inv_sword_01',
      trigger: 'meleeLanded',
      from: 'mainHand',
      chance: { pct: BLOODTHRILL_PCT_PER_RANK * bloodthrill },
      action: { kind: 'aura', aura: OVERPOWER_WINDOW },
      requiresAura: REND.aura!.id,
      docRef: doc,
    })
  }
  return procs
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
 * Battle Shout rank 6 (spells.json 11551), the trainer's top rank: rank 7 is an Ahn'Qiraj book (D36;
 * warrior.md §1.1). Cost `manaCost` 100, no cooldown, GCD 1500, any stance; for 180000 ms aura 99
 * (melee attack power) at base 111 + 0.6 per level above `spellLevel` 52 (`maxLevel` 61), so
 * 111 + trunc(4.8) = 115 at 60 (docs/data/items.md#per-level-values; warrior.md §1.1, §3.2).
 * Focused Rage doesn't reduce it (§2.3). Its threat (52 per party member buffed at rank 6,
 * threat.md) isn't counted: the party isn't modelled (warrior.md §7).
 * Forever's; `battleShout(profile)` picks the rule profile's.
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
  aura: { id: 'battleShout', name: 'Battle Shout', durationMs: 180000, mods: { ap: 115 } },
  ...NO_CAST_RAGE,
}

/**
 * Classic Era's Battle Shout rank 6 (11551 in 1.15.9.69722), the same rank as Forever's (D36): the
 * same cost, cooldown, GCD and stances, and aura 99 at 184 + 1, +1 per level above 52, so 193 at 60,
 * for 120000 ms (`DurationIndex` 4) (warrior.md §1.1, §3.2) [C] [client] (SpellEffect, SpellLevels,
 * SpellMisc, SpellDuration, 1.15.9.69722). The catalogue's Classic Era Battle Shout has the same 193
 * (buffs doc, Classic Era values).
 */
export const BATTLE_SHOUT_CLASSIC_ERA: AbilityDef = {
  ...BATTLE_SHOUT,
  aura: { id: 'battleShout', name: 'Battle Shout', durationMs: 120000, mods: { ap: 193 } },
}

/**
 * The warrior's own Battle Shout under a rule profile: Classic Era's where the profile reads the
 * catalogue's Classic Era column, as `catalogueEffects` does for a buff, Forever's otherwise.
 */
export function battleShout(profile: RulesProfile): AbilityDef {
  return profile.catalogue.column === 'classicEra' ? BATTLE_SHOUT_CLASSIC_ERA : BATTLE_SHOUT
}

/**
 * Charge rank 3 (spells.json 11578): an energize of 150 tenths, Battle Stance only, out of combat
 * only; Improved Charge adds 30 tenths per rank (12285, aura 107 +30). The sim uses it only as the
 * opener's rage (warrior.md §2.3, §5.2 row 0).
 */
export const CHARGE_RAGE_TENTHS = 150
export const IMPROVED_CHARGE_TENTHS_PER_RANK = 30

/**
 * The cooldown the three stances share: `categoryRecoveryTime` 1000 of category 47, off the GCD
 * (warrior.md §2.1, §2.2) [F] [client] (SpellCooldowns, 1.60.1.69913).
 */
export const STANCE_SWAP_COOLDOWN_MS = 1000

/**
 * The most rage a stance swap keeps, in tenths (warrior.md §2.1, rage.md#stance-changes-and-tactical-mastery,
 * W18): in `forever` 10 (Tactical Mastery, trained) + 3 per rank of Improved Tactical Mastery [F];
 * in `classicEra` 5 per rank of Tactical Mastery, the talent in the same place [C].
 */
export function stanceSwapKeepTenths(talents: ReadonlyMap<string, number>, profile: RulesProfile): number {
  const r = talents.get('Improved Tactical Mastery') ?? 0
  return 10 * (profile.rage.stanceRetainBase + profile.rage.stanceRetainPerRank * r)
}

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
 * most 900 s + 25%), GCD 1500, Berserker Stance only; for 15000 ms aura 290 (all crit) +100, so
 * spells crit more too (warrior.md §2.6, §3.2). It's aura crit, so the white table still caps it
 * (combat-tables §2.2) and the +3-boss suppression is unchanged (already at its 1.8% maximum,
 * §4.4); its 20% more damage taken (aura 87) isn't simulated (warrior.md §7). `recklessness(profile)`
 * picks the rule profile's.
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
  aura: { id: 'recklessness', name: 'Recklessness', durationMs: 15000, mods: { crit: 100, spellCrit: 100 } },
  ...NO_CAST_RAGE,
}

/** Classic Era's Recklessness: 1719 #0 is aura 52, +100% melee crit only [C] (SpellEffect, 1.15.9.69722). */
export const RECKLESSNESS_CLASSIC_ERA: AbilityDef = {
  ...RECKLESSNESS,
  aura: { id: 'recklessness', name: 'Recklessness', durationMs: 15000, mods: { crit: 100 } },
}

/** The warrior's Recklessness under a rule profile: Classic Era's where the profile reads its values. */
export function recklessness(profile: RulesProfile): AbilityDef {
  return profile.catalogue.column === 'classicEra' ? RECKLESSNESS_CLASSIC_ERA : RECKLESSNESS
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
 * - Night Elf Elune's Light (1259799): aura 290 (all crit: attacks and spells) +10 for 15000 ms,
 *   `recoveryTime` 180000. Forever's racials hold in both rule profiles (docs/architecture.md).
 * Gnome Eureka! is every class's own (classes/eureka.ts).
 */
export const racialCooldown = (id: string, name: string, icon: string, cooldownMs: number, aura: AbilityDef['aura']): AbilityDef => ({
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
  mods: { crit: 10, spellCrit: 10 },
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

// ---------------------------------------------------------------------------------------------
// Protection (warrior.md §3.1, §3.2, §5.4). Threat is threat.md's warrior rows.
// ---------------------------------------------------------------------------------------------

/**
 * The Revenge window (warrior.md §2.8): after the warrior blocks, dodges or parries, Revenge is
 * usable for 5 s [?] (Q12). The client gates it on the caster's aura state 1 (spells.json 11601
 * `casterAuraState`), which the server sets. With a 5 s cooldown as long as the window, closing it
 * when Revenge is used changes nothing, so it reuses the Overpower window's mechanism (§7).
 */
export const REVENGE_WINDOW: AuraSpec = { id: 'revengeWindow', name: 'Revenge window', durationMs: 5000, mods: {} }

/** The procs that open the Revenge window: the warrior's dodge or parry, and block, of the boss's swings (§2.8). */
export function revengeWindowProcs(): ProcSpec[] {
  const doc = 'docs/classes/warrior.md#28-reactive-abilities-overpower-bloodthrill-revenge'
  const open = (id: string, trigger: 'dodgeParry' | 'block'): ProcSpec => ({
    id,
    name: 'Revenge',
    icon: 'ability_warrior_revenge',
    trigger,
    from: 'any',
    chance: { pct: 100 },
    action: { kind: 'aura', aura: REVENGE_WINDOW },
    docRef: doc,
  })
  return [open('revengeDodgeParry', 'dodgeParry'), open('revengeBlock', 'block')]
}

/**
 * Revenge rank 5 (spells.json 11601), the trainer's top rank: rank 6 is an Ahn'Qiraj book (D36;
 * warrior.md §3.1). Cost 50, cooldown `categoryRecoveryTime` 5000, GCD 1500, Defensive Stance only
 * (`shapeshiftMask` 0x20000), `SCHOOL_DAMAGE` 121 with `Variance` 0.1971831, so 109.07–132.93, whole
 * numbers 109–133 as the tooltip rounds them: 121 ± 12 (warrior.md §3.1, W14) [F] [client]
 * (SpellEffect, 1.60.1.70009). A melee spell: two rolls (combat-tables §3). Needs the Revenge
 * window. Improved Revenge adds 20% per rank (modifiers.ts). Threat 2.25 × dmg + 243 [C]
 * (threat.md#warrior).
 */
export const REVENGE: AbilityDef = {
  id: 'revenge',
  name: 'Revenge',
  icon: 'ability_warrior_revenge',
  kind: 'meleeSpell',
  costTenths: 50,
  cooldownMs: 5000,
  gcdMs: GCD_MS,
  stances: STANCE.defensive,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 121,
  flatSpread: 12,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 2.25,
  threatBonus: 243,
  offHand: false,
  ...INSTANT,
  ...NO_CAST,
  window: REVENGE_WINDOW,
}

/**
 * Shield Slam rank 4 (spells.json 23925, the talent): cost 200, cooldown `categoryRecoveryTime`
 * 6000, GCD 1500, any stance, a shield (`equippedItemSubclass` 64). `SCHOOL_DAMAGE` 655 with
 * `Variance` 0.0457, 655 ± 15.0: the tooltip's 640–670 [F] [sb], 655 ± 15, plus the block value (the
 * tooltip's "increased by your Block Value", ×1; warrior.md §3.1, W15). A melee spell: two rolls
 * (combat-tables §3). Its dispel doesn't matter here. Threat dmg + 475 [?]: the Forever tooltip raised
 * its threat from Classic's "high" to "a very high amount", and neither client carries a value
 * (`SHIELD_SLAM_THREAT`; threat.md#threat-wording-table, warrior.md Q1). This is the `forever` row;
 * `shieldSlam(profile)` is the profile's.
 */
export const SHIELD_SLAM: AbilityDef = {
  id: 'shieldSlam',
  name: 'Shield Slam',
  icon: 'inv_shield_05',
  kind: 'meleeSpell',
  costTenths: 200,
  cooldownMs: 6000,
  gcdMs: GCD_MS,
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 655,
  flatSpread: 15,
  blockValueCoefficient: 1,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 1,
  threatBonus: 475,
  offHand: false,
  ...INSTANT,
  shieldOnly: true,
  ...NO_CAST,
}

/**
 * Shield Slam's threat bonus per landed hit, on top of its damage, by rule profile
 * (threat.md#threat-wording-table):
 * - `forever`: 475 [?], the wording table's "very high". Classic's "high" was 254 [C] (Magey) on
 *   342–358 damage; Forever raised the damage to 640–670 (×1.871 at the midpoints, 655 / 350) and the
 *   words to "very high" together, so the bonus scales with the damage, as the table's "high" on
 *   Heroic Strike scales with its bonus damage: 254 × 1.871 = 475. A guild test replaces it
 *   (warrior.md Q34, open-questions C6).
 * - `classicEra`: Classic Era's 254 [C], its tooltip's "high".
 */
export const SHIELD_SLAM_THREAT = { forever: 475, classicEra: 254 } as const

/** Shield Slam under a rule profile: its threat bonus is the profile's (`SHIELD_SLAM_THREAT`). */
export function shieldSlam(profile: RulesProfile): AbilityDef {
  const bonus = SHIELD_SLAM_THREAT[profile.id]
  return bonus === SHIELD_SLAM.threatBonus ? SHIELD_SLAM : { ...SHIELD_SLAM, threatBonus: bonus }
}

/**
 * Sunder Armor rank 5 (spells.json 11597): cost 150, no cooldown, GCD 1500, any stance, a melee
 * weapon. On a landed hit (a block lands too) aura 22 −450 armor for `duration` 30000, stacking to 5
 * (`cumulativeAura` 5), each application refreshing the stack's duration; and a THREAT effect (63) of
 * 206 [F] (1.60.1.70009; 1013 before it), plus 0.05 × attack power [?]: Blizzard's notes add "a small
 * increase to threat generated from Attack Power", which the client doesn't carry (the effect has no
 * bonus coefficient), so the share is a D29 default (`SUNDER_ARMOR_THREAT`; threat.md#warrior,
 * warrior.md Q1). It deals no damage: one roll over miss, dodge, parry and block (combat-tables §3),
 * and what lands is a hit, not a crit (warrior.md §7). A miss, dodge or parry refunds 80% [C]. Its
 * stacks on the boss take the place of the Buffs tab's Sunder Armor ×5 (warrior.md §5.4 notes). This
 * is the `forever` row; `sunderArmor(profile)` is the profile's.
 */
export const SUNDER_ARMOR: AbilityDef = {
  id: 'sunderArmor',
  name: 'Sunder Armor',
  icon: 'ability_warrior_sunder',
  kind: 'weaponStrike',
  costTenths: 150,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 0,
  threatBonus: 206,
  threatApCoefficient: 0.05,
  offHand: false,
  ...INSTANT,
  ...NO_CAST,
  aura: { id: 'sunderArmor', name: 'Sunder Armor', durationMs: 30000, maxStacks: 5, mods: { targetArmor: 450 } },
}

/**
 * Sunder Armor's threat per landed application, by rule profile (threat.md#warrior, worked examples T1
 * and T2): `bonus` + `apCoefficient` × the attack power when it lands, before the global multipliers.
 * - `forever`: the Forever client's THREAT effect, 206 at rank 5 [F] (1.60.1.70009, 34 / 75 / 117 /
 *   158 / 206 by rank), plus 0.05 × attack power [?]. Blizzard's notes promise an Attack Power term
 *   the client doesn't carry; 0.05 is D29's reasoned guess, which keeps the total near Classic Era's
 *   rank 5 total of 261, the closest allowed value: 261 at 1,100 attack power, about 281 at the
 *   default tank's ~1,500 when its Sunders land (threat.md#warrior; warrior.md Q1; open-questions B10).
 * - `classicEra`: Classic Era's server-side 261 [C] (Magey), flat, since the Classic Era client has no
 *   threat effect on the spell.
 */
export const SUNDER_ARMOR_THREAT = {
  forever: { bonus: 206, apCoefficient: 0.05 },
  classicEra: { bonus: 261, apCoefficient: 0 },
} as const

/** Sunder Armor under a rule profile: its threat is the profile's (`SUNDER_ARMOR_THREAT`). */
export function sunderArmor(profile: RulesProfile): AbilityDef {
  const { bonus, apCoefficient } = SUNDER_ARMOR_THREAT[profile.id]
  return bonus === SUNDER_ARMOR.threatBonus && apCoefficient === SUNDER_ARMOR.threatApCoefficient
    ? SUNDER_ARMOR
    : { ...SUNDER_ARMOR, threatBonus: bonus, threatApCoefficient: apCoefficient }
}

/**
 * Thunder Clap rank 6 (spells.json 11581): cost 200, cooldown `categoryRecoveryTime` 6000, GCD 1500,
 * Battle or Defensive Stance (`shapeshiftMask` 0x30000), `DefenseType` 1 (Magic): the spell table, so
 * no dodge, parry or block (warrior.md §3.1, §7 "Spell-table abilities" [?]). `SCHOOL_DAMAGE` 103,
 * physical, to up to 4 targets (the boss alone until multi-target, §5.5), and aura 319 (melee attack
 * speed) −20 for `duration` 30000: the boss swings 20% slower (the profile's
 * `thunderClapSlow`, as the Buffs tab's Thunder Clap reads it: Classic Era's is 10%). Threat 2.5 ×
 * dmg [C] (threat.md#warrior). `thunderClap(profile)` is the profile's.
 */
export const THUNDER_CLAP: AbilityDef = {
  id: 'thunderClap',
  name: 'Thunder Clap',
  icon: 'spell_nature_thunderclap',
  kind: 'spellTable',
  costTenths: 200,
  cooldownMs: 6000,
  gcdMs: GCD_MS,
  stances: STANCE.battle | STANCE.defensive,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 103,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 2.5,
  threatBonus: 0,
  offHand: false,
  ...INSTANT,
  ...NO_CAST,
  aura: { id: 'thunderClap', name: 'Thunder Clap', durationMs: 30000, mods: { bossSlow: 20 } },
}

/** Thunder Clap under a rule profile: its slow is the profile's `thunderClapSlow` (Forever 20%, Classic Era 10%). */
export function thunderClap(profile: RulesProfile): AbilityDef {
  const slow = Math.round(100 * profile.values.thunderClapSlow)
  return slow === THUNDER_CLAP.aura!.mods.bossSlow ? THUNDER_CLAP : { ...THUNDER_CLAP, aura: { ...THUNDER_CLAP.aura!, mods: { bossSlow: slow } } }
}

/**
 * Demoralizing Shout rank 5 (spells.json 11556): cost 100, no cooldown, GCD 1500, any stance,
 * `DefenseType` 1 (Magic): the spell table (warrior.md §7 "Spell-table abilities" [?]). Aura 99
 * (melee attack power) on the boss for `duration` 45000: −204 at level 60 (base −196, −1.4 per level
 * from 54; the profile's `demoralizingShoutAp`, as the Buffs tab's reads it; warrior.md §3.2, Q22). It
 * deals no damage. Threat 43.2 per enemy debuffed [C] (threat.md#warrior). `demoralizingShout(profile)`
 * is the profile's.
 */
export const DEMORALIZING_SHOUT: AbilityDef = {
  id: 'demoralizingShout',
  name: 'Demoralizing Shout',
  icon: 'ability_warrior_warcry',
  kind: 'spellTable',
  costTenths: 100,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: REFUND,
  threatMult: 0,
  threatBonus: 43.2,
  offHand: false,
  ...INSTANT,
  ...NO_CAST,
  aura: { id: 'demoralizingShout', name: 'Demoralizing Shout', durationMs: 45000, mods: { bossAp: -204 } },
}

/** Demoralizing Shout under a rule profile: its attack power is the profile's `demoralizingShoutAp` (Forever 204, Classic Era 146). */
export function demoralizingShout(profile: RulesProfile): AbilityDef {
  const ap = -profile.values.demoralizingShoutAp
  const own = DEMORALIZING_SHOUT.aura!
  return ap === own.mods.bossAp ? DEMORALIZING_SHOUT : { ...DEMORALIZING_SHOUT, aura: { ...own, mods: { bossAp: ap } } }
}

/**
 * Shield Block (spells.json 2565): cost 100, `recoveryTime` 5000, no GCD, Defensive Stance only, a
 * shield. Aura 51 (block chance) +75 for `duration` 7000, ending after 2 blocks (`procCharges` 2):
 * Forever's baseline, Classic Era's Improved Shield Block (warrior.md §3.2). Focused Rage doesn't
 * reduce it (§2.3). No threat of its own.
 */
export const SHIELD_BLOCK: AbilityDef = {
  id: 'shieldBlock',
  name: 'Shield Block',
  icon: 'ability_defend',
  ...NO_STRIKE,
  costTenths: 100,
  cooldownMs: 5000,
  gcdMs: 0,
  stances: STANCE.defensive,
  shieldOnly: true,
  aura: { id: 'shieldBlock', name: 'Shield Block', durationMs: 7000, blockCharges: 2, mods: { block: 75 } },
  ...NO_CAST_RAGE,
}

/** Execute's damage before modifiers: `600 + 15 × (rage − cost)`, rage read after paying the cost (warrior.md §3.1, W10). */
export const executeDamage = (rage: number, cost: number) => EXECUTE.flatDamage + EXECUTE.damagePerExtraRage * (rage - cost)

/**
 * The AP above which Bloodthirst beats an Execute cast at Bloodthirst's 30 rage:
 * `0.35 × AP + 48 > 600 + 15 × (30 − cost)` (warrior.md W11): 2220 at cost 15, 2434.29 at cost 10.
 */
export const executeBreakEvenAp = (executeCost: number) =>
  (executeDamage(BLOODTHIRST.costTenths / 10, executeCost) - BLOODTHIRST.flatDamage) / BLOODTHIRST.apCoefficient
