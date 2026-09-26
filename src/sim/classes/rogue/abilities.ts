// The rogue's abilities as data (docs/classes/rogue.md §2, §3): Energy and its tick, combo points,
// and the rows the three specs use. Their talents are applied by `withRogueTalents` (modifiers.ts)
// when a rotation resolves them.
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), written out
// here so the app bundle doesn't carry the client dataset; rogue.test.ts checks them against it.
// Energy is in tenths, times in ms.
import { CRIT_MULTIPLIER } from '../../core/formulas'
import type { AuraSpec, OnUseSpec } from '../../effects/types'
import { type AbilityDef, STANCE_ANY } from '../../plan/types'
import { NO_STRIKE } from '../druid/abilities'

export type { AbilityDef } from '../../plan/types'

// --- Energy and combo points (rogue.md §2.1, §2.2) ------------------------------------------------

/** 20 Energy per power tick, every 2 s [C] (rogue.md §2.1; druid.md §2.4 owns the tick). */
export const ENERGY_PER_TICK_TENTHS = 200
/** The Energy cap, 100 [?], before Vigor (rogue.md §2.1). */
export const BASE_MAX_ENERGY_TENTHS = 1000
/** Vigor: +5 maximum Energy per rank (aura 35, curve 5/10) [F] (rogue.md §5.1). */
export const VIGOR_TENTHS_PER_RANK = 50

/** Rogue abilities' GCD: `StartRecoveryTime` 1000 [F] (rogue.md §2.3). */
export const ROGUE_GCD_MS = 1000

/** A builder that misses or is dodged or parried refunds 80% of its Energy [?]; a finisher nothing (rogue.md §2.1). */
const BUILDER_REFUND = 0.8

/** The fields of a rogue attack: Energy, the 1 s GCD, one threat per damage. */
const ROGUE_ATTACK = {
  ...NO_STRIKE,
  resource: 'energy',
  cooldownMs: 0,
  gcdMs: ROGUE_GCD_MS,
  stances: STANCE_ANY,
  offHand: false,
  threatMult: 1,
  critMultiplier: CRIT_MULTIPLIER.melee,
} as const

/** Cold Blood's aura (14177), which Sinister Strike, Backstab, Ambush, Eviscerate and Mutilate use up (rogue.md §3.8). */
export const COLD_BLOOD_AURA_ID = 'coldBlood'
const COLD_BLOOD_CRIT = { aura: COLD_BLOOD_AURA_ID, pct: 100, consume: true } as const

// --- Builders (rogue.md §3.1, §3.2, §3.9, §3.11) ------------------------------------------------------

/**
 * Sinister Strike rank 8 (spells.json 11294): 45 Energy, GCD 1000, `NORMALIZED_WEAPON_DMG` +68, so
 * normalized weapon damage + 68, one roll; +1 combo point (`ENERGIZE` power 4) [F] (rogue.md §3.1).
 */
export const SINISTER_STRIKE: AbilityDef = {
  id: 'sinisterStrike',
  name: 'Sinister Strike',
  icon: 'spell_shadow_ritualofsacrifice',
  kind: 'weaponStrike',
  ...ROGUE_ATTACK,
  costTenths: 450,
  weaponPercent: 1,
  normalized: true,
  flatDamage: 68,
  refundShare: BUILDER_REFUND,
  comboPoints: 1,
  auraCrit: COLD_BLOOD_CRIT,
}

/**
 * Backstab rank 8 (spells.json 11281), the trainer's top rank (rank 9 is an Ahn'Qiraj book, D36;
 * rogue.md §3.2): 60 Energy, GCD 1000, `NORMALIZED_WEAPON_DMG` +140 and `WEAPON_PERCENT_DAMAGE` 150,
 * so 1.5 × (normalized weapon damage + 140) [F]; the flat inside the percentage is [C] (the Classic Era
 * tooltip's "plus 210"; rogue.md §3.2, Q2). From behind, with a
 * dagger in the main hand; +1 combo point.
 */
export const BACKSTAB: AbilityDef = {
  id: 'backstab',
  name: 'Backstab',
  icon: 'ability_backstab',
  kind: 'weaponStrike',
  ...ROGUE_ATTACK,
  costTenths: 600,
  weaponPercent: 1.5,
  normalized: true,
  flatDamage: 140,
  refundShare: BUILDER_REFUND,
  comboPoints: 1,
  behindOnly: true,
  auraCrit: COLD_BLOOD_CRIT,
}

/**
 * Mutilate rank 4 (spells.json 1241584, the strikes 1241586 and 1241590): 60 Energy, GCD 1000, both
 * weapons: `NORMALIZED_WEAPON_DMG` +67 and `WEAPON_PERCENT_DAMAGE` 75 each, so 0.75 × (normalized
 * weapon damage + 67), the flat inside the percentage as its tooltip computes it (${$m1*$m2/100});
 * +2 combo points; +20% against a target with your lasting poison on it (dummy 20) [F]. Each hand
 * rolls its own strike, and only the main hand's lands the points and rolls Seal Fate [?] (rogue.md
 * §3.11, Q7). It needs daggers.
 */
export const MUTILATE: AbilityDef = {
  id: 'mutilate',
  name: 'Mutilate',
  icon: 'ability_rogue_deadlybrew',
  kind: 'weaponStrike',
  ...ROGUE_ATTACK,
  offHand: true,
  costTenths: 600,
  weaponPercent: 0.75,
  normalized: true,
  flatDamage: 67,
  refundShare: BUILDER_REFUND,
  comboPoints: 2,
  poisonedTargetPct: 20,
  auraCrit: COLD_BLOOD_CRIT,
}

/**
 * Cutthroat's Ambush window (talent 462708, rogue.md §5.3): a landed Backstab opens it at 3% per rank,
 * and the next Ambush within 10 s needs no Stealth. The talent's row is a server-scripted dummy (aura
 * 4, 15 at 5/5); the 10 s is its tooltip's [F]. Ambush needs it, and using Ambush closes it.
 */
export const CUTTHROAT_WINDOW: AuraSpec = { id: 'cutthroat', name: 'Cutthroat', durationMs: 10000, mods: {} }

/**
 * Hemorrhage (spells.json 16511): 35 Energy, GCD 1000, `NORMALIZED_WEAPON_DMG` 0 and
 * `WEAPON_PERCENT_DAMAGE` 100, so 100% of normalized weapon damage; +1 combo point; and for 15 s your
 * Rupture deals 15% more to the target (aura 271 on Rupture's class mask) [F]. With a dagger its
 * dummy effect makes it 145% (`HEMORRHAGE_DAGGER_PCT`), which the rotation picks from the weapons
 * (rogue.md §3.9). Its debuff is read at each Rupture tick.
 */
export const HEMORRHAGE: AbilityDef = {
  id: 'hemorrhage',
  name: 'Hemorrhage',
  icon: 'spell_shadow_lifedrain',
  kind: 'weaponStrike',
  ...ROGUE_ATTACK,
  costTenths: 350,
  weaponPercent: 1,
  normalized: true,
  flatDamage: 0,
  refundShare: BUILDER_REFUND,
  comboPoints: 1,
  aura: { id: 'hemorrhage', name: 'Hemorrhage', durationMs: 15000, mods: { bleedDamage: 15 } },
}
/** Hemorrhage's share with a dagger, 145% (16511 effect 4, a dummy) [F]; with one in the main hand [?] (rogue.md §3.9). */
export const HEMORRHAGE_DAGGER_PCT = 1.45

/**
 * Ghostly Strike (spells.json 14278): 40 Energy, GCD 1000, `RecoveryTime` 20000;
 * `WEAPON_PERCENT_DAMAGE` 125, not normalized; +1 combo point [F]. With a dagger in the main hand its
 * dummy makes it 180% (`GHOSTLY_STRIKE_DAGGER_PCT`). Its +15% dodge for 7 s protects only a rogue the
 * boss attacks, so the sim leaves it out (rogue.md §3.9).
 */
export const GHOSTLY_STRIKE: AbilityDef = {
  id: 'ghostlyStrike',
  name: 'Ghostly Strike',
  icon: 'spell_shadow_curse',
  kind: 'weaponStrike',
  ...ROGUE_ATTACK,
  costTenths: 400,
  cooldownMs: 20000,
  weaponPercent: 1.25,
  normalized: false,
  flatDamage: 0,
  refundShare: BUILDER_REFUND,
  comboPoints: 1,
}
/** Ghostly Strike's share with a main-hand dagger, 180% (14278 effect 3, a dummy) [F] (rogue.md §3.9). */
export const GHOSTLY_STRIKE_DAGGER_PCT = 1.8

/**
 * Ambush rank 6 (spells.json 11269): 60 Energy, GCD 1000, `NORMALIZED_WEAPON_DMG` +116 and
 * `WEAPON_PERCENT_DAMAGE` 250, so 2.5 × (normalized weapon damage + 116), the tooltip's "250% weapon
 * damage plus 290"; +1 combo point; from behind with a dagger in the main hand [F]. It needs Stealth,
 * so the sim uses it only in Cutthroat's window (rogue.md §3.13, §5.3).
 */
export const AMBUSH: AbilityDef = {
  id: 'ambush',
  name: 'Ambush',
  icon: 'ability_rogue_ambush',
  kind: 'weaponStrike',
  ...ROGUE_ATTACK,
  costTenths: 600,
  weaponPercent: 2.5,
  normalized: true,
  flatDamage: 116,
  refundShare: BUILDER_REFUND,
  comboPoints: 1,
  behindOnly: true,
  auraCrit: COLD_BLOOD_CRIT,
  window: CUTTHROAT_WINDOW,
}

/**
 * Premeditation (spells.json 14183): free, off the GCD (no `StartRecoveryTime`), `RecoveryTime`
 * 120000; +2 combo points, no Stealth needed in Forever, to use within 20 s [F]. The rotation uses it
 * with room for both points, so the 20 s never runs out (rogue.md §3.10).
 */
export const PREMEDITATION: AbilityDef = {
  id: 'premeditation',
  name: 'Premeditation',
  icon: 'spell_shadow_possession',
  kind: 'cast',
  ...ROGUE_ATTACK,
  gcdMs: 0,
  threatMult: 0,
  costTenths: 0,
  cooldownMs: 120000,
  comboPoints: 2,
}

// --- Finishers (rogue.md §3.3–§3.6) -----------------------------------------------------------------

/** Eviscerate's attack power per combo point, 4% [?] (a player's in-game tests shared on Discord, 2026-09-25; rogue.md §3.4). */
export const EVISCERATE_AP_PER_CP = 0.04

/**
 * Eviscerate rank 9 (spells.json 31016): 35 Energy and every combo point, GCD 1000; `SCHOOL_DAMAGE`
 * 108 with `Variance` 1, so 54–162, + 170 per combo point (`EffectPointsPerResource`) [F], + 4% of
 * attack power per point [?] (a player's in-game tests shared on Discord, 2026-09-25; Classic Era sims' 3%; rogue.md §3.4).
 * No weapon damage, so it rolls twice [?] (rogue.md §3.4, Q4).
 */
export const EVISCERATE: AbilityDef = {
  id: 'eviscerate',
  name: 'Eviscerate',
  icon: 'ability_rogue_eviscerate',
  kind: 'meleeSpell',
  ...ROGUE_ATTACK,
  costTenths: 350,
  flatDamage: 54,
  flatDamageRange: 108,
  damagePerComboPoint: 170,
  apCoefficientPerComboPoint: EVISCERATE_AP_PER_CP,
  finisher: true,
  auraCrit: COLD_BLOOD_CRIT,
}

/** Slice and Dice's attack speed, 30% (6774 aura 319) [F] (rogue.md §3.3). */
export const SLICE_AND_DICE_HASTE = 30

/**
 * Slice and Dice rank 2 (spells.json 6774): 25 Energy and every combo point, GCD 1000; +30% melee
 * attack speed for 6 s + 3 s per point (`SpellDuration` 6000, `DurationPerResource` 3000) [F]. No
 * roll (rogue.md §3.3).
 */
export const SLICE_AND_DICE: AbilityDef = {
  id: 'sliceAndDice',
  name: 'Slice and Dice',
  icon: 'ability_rogue_slicedice',
  kind: 'cast',
  ...ROGUE_ATTACK,
  threatMult: 0,
  costTenths: 250,
  finisher: true,
  aura: { id: 'sliceAndDice', name: 'Slice and Dice', durationMs: 6000, mods: { haste: SLICE_AND_DICE_HASTE } },
  auraMsPerComboPoint: 3000,
}

/**
 * Rupture's attack power per combo point per tick, 1%, counting at most 3 points: 1% a tick at 1
 * point, 2% at 2, 3% at 3 to 5 [?] (a player's in-game tests shared on Discord, 2026-09-25; rogue.md §3.5).
 */
export const RUPTURE_AP_PER_CP_PER_TICK = 0.01
export const RUPTURE_AP_CP_CAP = 3

/**
 * Rupture rank 6 (spells.json 11275): 25 Energy and every combo point, GCD 1000; a bleed of 35 + 4.73
 * per point every 2000 ms (`EffectPointsPerResource` 4.73) for 6 s + 2 s per point (`SpellDuration`
 * 6000, `DurationPerResource` 2000), so 3 ticks + 1 per point [F]; + 1% of attack power per point per
 * tick, 3% at 3 points and above [?] (a player's in-game tests shared on Discord, 2026-09-25). Its ticks carry the
 * periodic-crit flag (rogue.md §3.5).
 */
export const RUPTURE: AbilityDef = {
  id: 'rupture',
  name: 'Rupture',
  icon: 'ability_rogue_rupture',
  kind: 'bleed',
  ...ROGUE_ATTACK,
  costTenths: 250,
  finisher: true,
  dotTickDamage: 35,
  dotTickPerComboPoint: 4.73,
  dotApCoefficientPerComboPoint: RUPTURE_AP_PER_CP_PER_TICK,
  comboPointApCap: RUPTURE_AP_CP_CAP,
  dotTicks: 3,
  dotTicksPerComboPoint: 1,
  dotTickMs: 2000,
  periodicCanCrit: true,
  aura: { id: 'rupture', name: 'Rupture', durationMs: 6000, mods: {} },
}

/** Expose Armor rank 5 (11198): −450 armor per combo point, −2,250 at 5 [F] (rogue.md §3.6). */
export const EXPOSE_ARMOR_PER_CP = 450

/**
 * Expose Armor rank 5 (spells.json 11198): 25 Energy and every combo point, GCD 1000; −450 armor per
 * point for 30 s [F]. The rotation uses it at 5 points only, so its aura is the 5-point one, −2,250.
 * It rolls to hit, like a melee special with no weapon damage, and deals none (rogue.md §3.6). Its aura
 * id is the Buffs entry's, so the two count once.
 */
export const EXPOSE_ARMOR: AbilityDef = {
  id: 'exposeArmor',
  name: 'Expose Armor',
  icon: 'ability_warrior_riposte',
  kind: 'meleeSpell',
  ...ROGUE_ATTACK,
  threatMult: 0,
  costTenths: 250,
  finisher: true,
  aura: { id: 'exposeArmor', name: 'Expose Armor', durationMs: 30000, mods: { targetArmor: 5 * EXPOSE_ARMOR_PER_CP } },
}

/**
 * Venom (spells.json 1310703, the talent): 25 Energy and every combo point, GCD 1000; for 6 s + 3 s
 * per point (`SpellDuration` 6000, `DurationPerResource` 3000), poisons deal 30% more (aura 108, the
 * poisons' class masks) and apply 10 points more often (aura 107, misc 18) [F]. No roll (rogue.md §4.3).
 */
export const VENOM: AbilityDef = {
  id: 'venom',
  name: 'Venom',
  icon: 'inv_sword_31',
  kind: 'cast',
  ...ROGUE_ATTACK,
  threatMult: 0,
  costTenths: 250,
  finisher: true,
  aura: { id: 'venom', name: 'Venom', durationMs: 6000, mods: { poisonDamage: 30, poisonChance: 10 } },
  auraMsPerComboPoint: 3000,
}

// --- Cooldowns (rogue.md §3.7, §3.8) ------------------------------------------------------------------

/**
 * Blade Flurry (spells.json 13877): 25 Energy, GCD 1000, `RecoveryTime` 120000; +20% melee attack
 * speed for 15 s [F]. Its second target waits for multi-target (M6) (rogue.md §3.7).
 */
export const BLADE_FLURRY: AbilityDef = {
  id: 'bladeFlurry',
  name: 'Blade Flurry',
  icon: 'ability_warrior_punishingblow',
  kind: 'cast',
  ...ROGUE_ATTACK,
  threatMult: 0,
  costTenths: 250,
  cooldownMs: 120000,
  aura: { id: 'bladeFlurry', name: 'Blade Flurry', durationMs: 15000, mods: { haste: 20 } },
}

/**
 * Adrenaline Rush (spells.json 13750): free, GCD 1000, `RecoveryTime` 300000; +100% Energy
 * regeneration for 15 s (aura 110, power 3) [F] (rogue.md §3.7).
 */
export const ADRENALINE_RUSH: AbilityDef = {
  id: 'adrenalineRush',
  name: 'Adrenaline Rush',
  icon: 'spell_shadow_shadowworddominate',
  kind: 'cast',
  ...ROGUE_ATTACK,
  threatMult: 0,
  costTenths: 0,
  cooldownMs: 300000,
  aura: { id: 'adrenalineRush', name: 'Adrenaline Rush', durationMs: 15000, mods: { energyRegen: 100 } },
}

/**
 * Cold Blood (spells.json 14177): free, off the GCD, `RecoveryTime` 180000; +100% crit on the next
 * Sinister Strike, Backstab, Ambush, Eviscerate or Mutilate, which uses it up (1 charge, no duration:
 * it lasts until used, here an hour) [F]; used up only when that strike lands [?] (rogue.md §3.8).
 */
export const COLD_BLOOD: AbilityDef = {
  id: 'coldBlood',
  name: 'Cold Blood',
  icon: 'spell_ice_lament',
  kind: 'cast',
  ...ROGUE_ATTACK,
  gcdMs: 0,
  threatMult: 0,
  costTenths: 0,
  cooldownMs: 180000,
  aura: { id: COLD_BLOOD_AURA_ID, name: 'Cold Blood', durationMs: 3600000, mods: {} },
}

// --- Consumables (rogue.md §7.5) --------------------------------------------------------------------

/**
 * Thistle Tea (item 7676 → spell 9512, Restore Energy): +100 Energy at once, no GCD, the item's 5 min
 * cooldown (`ItemEffect.CoolDownMSec` 300000) [F]. Forever lets druids use it too (AllowableClass 1032).
 */
export const THISTLE_TEA: OnUseSpec = {
  id: 'thistleTea',
  name: 'Thistle Tea',
  icon: 'inv_drink_milk_05',
  cooldownMs: 300000,
  gcdMs: 0,
  aura: null,
  rageTenths: 1000,
  rageSpreadTenths: 0,
}

/** Thistle Tea as a cast: its Energy is an energize (rogue.md §7.5). */
export const THISTLE_TEA_CAST: AbilityDef = {
  id: THISTLE_TEA.id,
  name: THISTLE_TEA.name,
  icon: THISTLE_TEA.icon,
  kind: 'cast',
  ...NO_STRIKE,
  resource: 'energy',
  offHand: false,
  costTenths: 0,
  cooldownMs: THISTLE_TEA.cooldownMs,
  gcdMs: 0,
  stances: STANCE_ANY,
  rageTenths: THISTLE_TEA.rageTenths,
}
