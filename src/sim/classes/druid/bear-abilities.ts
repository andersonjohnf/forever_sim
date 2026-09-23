// The Feral bear's abilities as data (docs/classes/druid.md §4): Maul, Swipe, Mangle, Lacerate,
// Demoralizing Roar, Faerie Fire in Dire Bear Form and Enrage. Berserk is the cat's row
// (cat-abilities.ts), usable in both forms; its bear part is Mangle's `noCooldownWhile`. Auto attack
// is the form's weapon (forms.ts).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), with the doc
// value as fallback, written out here so the app bundle doesn't carry the client dataset;
// bear.test.ts checks them against it. Rage is in tenths, times in ms. These are the base rows:
// the build's talents (Ferocity, Shredding Attacks, Savage Fury, Feral Instinct, Genesis,
// Predatory Instincts, Rend and Tear) are applied by `withDruidTalents` (modifiers.ts) when the plan
// resolves the rotation. Threat values are threat.md's bear rows: Classic values that only a threat
// library carries, so [?] (Q15).
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import { type AbilityDef, STANCE_ANY } from '../../plan/types'
import type { RulesProfile } from '../../rules/profiles'
import { NO_STRIKE } from './abilities'
import { BERSERK_AURA_ID, FAERIE_FIRE_ARMOR } from './cat-abilities'
import { formBit } from './forms'

const BEAR = formBit('bear')

/** Bear abilities' GCD: `StartRecoveryTime` 1500 [F] (druid.md §2.6). */
export const BEAR_GCD_MS = GCD_MS

/** A bear attack that misses or is dodged or parried refunds 80% of its rage, as a warrior's does [?] (rage.md#rage-refunds-on-avoided-abilities). */
const BEAR_REFUND = 0.8

/** Maul's and Swipe's threat: 1.75 per damage before the global multipliers [?] (threat.md#druid-bear, druid.md §4.8, Q15). */
export const MAUL_THREAT_MULT = 1.75
export const SWIPE_THREAT_MULT = 1.75
/** Faerie Fire's threat, 108 (rank 4), and Demoralizing Roar's, 39 per target (rank 5) [?] (threat.md#druid-bear, druid.md §4.8). */
export const FAERIE_FIRE_THREAT = 108
export const DEMORALIZING_ROAR_THREAT = 39

/** The fields of a bear attack: rage, Dire Bear Form only, the 1.5 s GCD, one threat per damage (druid.md §4.8). */
const BEAR_ATTACK = {
  ...NO_STRIKE,
  resource: 'rage',
  forms: BEAR,
  cooldownMs: 0,
  gcdMs: BEAR_GCD_MS,
  stances: STANCE_ANY,
  offHand: false,
  threatMult: 1,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: BEAR_REFUND,
} as const

/**
 * Maul rank 7 (spells.json 9881): 15 rage, on the next swing, no GCD; `WEAPON_DAMAGE` +128 with the
 * form's weapon, so `(W_b + 128)`, one roll, no glancing [F] (druid.md §4.1). Its swing gives no
 * rage (rage.md#yellow-damage-and-on-next-swing-attacks). Threat ×1.75 [?]. Clearcasting's class
 * mask covers it (§2.7).
 */
export const MAUL: AbilityDef = {
  id: 'maul',
  name: 'Maul',
  icon: 'ability_druid_maul',
  kind: 'onNextSwing',
  ...BEAR_ATTACK,
  gcdMs: 0,
  costTenths: 150,
  weaponPercent: 1,
  flatDamage: 128,
  threatMult: MAUL_THREAT_MULT,
  clearcastable: true,
}

/**
 * Swipe rank 5 (spells.json 9908): 20 rage, GCD 1500; `SCHOOL_DAMAGE` 83 with no attack power
 * scaling, to up to 3 targets (`EffectChainTargets`) [F] (druid.md §4.4); the sim has one. No weapon
 * damage, so it rolls twice like Bloodthirst [?] (Q33). Like the warrior's area attacks, Whirlwind
 * and Cleave, it refunds nothing when it misses [?] (rage.md#rage-refunds-on-avoided-abilities).
 * Threat ×1.75 [?].
 */
export const SWIPE: AbilityDef = {
  id: 'swipe',
  name: 'Swipe',
  icon: 'inv_misc_monsterclaw_03',
  kind: 'meleeSpell',
  ...BEAR_ATTACK,
  costTenths: 200,
  flatDamage: 83,
  refundShare: 0,
  threatMult: SWIPE_THREAT_MULT,
  clearcastable: true,
}

/**
 * Mangle, rank 4 at 60 (spells.json 1238073, the talent 407995): 20 rage, `categoryRecoveryTime`
 * 6000, GCD 1500; `WEAPON_PERCENT_DAMAGE` 100 and `WEAPON_DAMAGE` +77: `1.00 × (W_b + 77)`, one
 * roll [F] (druid.md §4.2). Bear and Dire Bear only (shapeshift mask 144). Its threat is unknown:
 * one per damage [?] (Q15). While Berserk is up it starts no cooldown (§4.6).
 */
export const MANGLE: AbilityDef = {
  id: 'mangle',
  name: 'Mangle',
  icon: 'ability_druid_mangle2',
  kind: 'weaponStrike',
  ...BEAR_ATTACK,
  costTenths: 200,
  cooldownMs: 6000,
  weaponPercent: 1,
  flatDamage: 77,
  clearcastable: true,
  noCooldownWhile: BERSERK_AURA_ID,
}

/** Lacerate stacks to 5 on the target (`CumulativeAura` 5) [F] (druid.md §4.3). */
export const LACERATE_MAX_STACKS = 5

/** Lacerate's hit: 10% of weapon damage per application already on the target (effect 1, `DUMMY` 10) [F] tooltip, [?] model (druid.md §4.3, Q16). */
export const LACERATE_WEAPON_PCT_PER_STACK = 0.1

/**
 * Lacerate rank 3 (spells.json 1235827): 15 rage, GCD 1500; a bleed of 15 every 3000 ms for 15000 ms
 * per stack (aura 3, mechanic 15), up to 5 stacks [F]. Each application hits for 10% of the weapon
 * damage per stack already on the target, rolls once, can crit, adds a stack, and restarts and
 * re-snapshots the bleed for every stack [?] (druid.md §4.3, §2.9, Q16). Its ticks carry the
 * periodic-crit flag (SpellMisc Attributes[8] 0x200), so they crit in `forever` [?]. Its threat,
 * "high" in the tooltip, is unknown: one per damage [?] (Q15). Clearcasting's class mask covers it
 * (§2.7).
 */
export const LACERATE: AbilityDef = {
  id: 'lacerate',
  name: 'Lacerate',
  icon: 'ability_druid_lacerate',
  kind: 'weaponStrike',
  ...BEAR_ATTACK,
  costTenths: 150,
  weaponPercentPerStack: LACERATE_WEAPON_PCT_PER_STACK,
  clearcastable: true,
  dotTickDamage: 15,
  dotTicks: 5,
  dotTickMs: 3000,
  periodicCanCrit: true,
  aura: { id: 'lacerate', name: 'Lacerate', durationMs: 15000, maxStacks: LACERATE_MAX_STACKS, mods: {} },
}

/**
 * Faerie Fire rank 4 (spells.json 9907) in Dire Bear Form: −505 armor on the boss for 40000 ms, GCD
 * 1500. Dire Bear Form (Passive) 9635 makes it free (effect 4: −100% cost) and adds a 6000 ms
 * cooldown (effect 5) [F] [client] (SpellEffect, 1.60.1.69913; druid.md §4.5). `DefenseType` Magic:
 * it rolls spell hit (combat-tables §9). Threat 108 [?]. Clearcasting's class mask leaves it out.
 */
export const FAERIE_FIRE_BEAR: AbilityDef = {
  id: 'faerieFire',
  name: 'Faerie Fire',
  icon: 'spell_nature_faeriefire',
  kind: 'cast',
  ...BEAR_ATTACK,
  resource: 'mana',
  costTenths: 0,
  cooldownMs: 6000,
  refundShare: 0,
  threatMult: 0,
  threatBonus: FAERIE_FIRE_THREAT,
  spellHit: true,
  aura: { id: 'faerieFire', name: 'Faerie Fire', durationMs: 40000, mods: { targetArmor: FAERIE_FIRE_ARMOR } },
}

/**
 * Demoralizing Roar rank 5 (spells.json 9898): 10 rage, GCD 1500; the boss's attack power −204 for
 * 30000 ms in `forever` (the level-60 tooltip; in combat, Q32 [?]), −138 in `classicEra` [F] [C]
 * (druid.md §4.5, W18). `DefenseType` Magic: it rolls spell hit, and refunds 80% when it misses, as a
 * missed melee ability does [?]. Threat 39 [?]. Clearcasting's class mask covers it.
 * The aura is named after its Buffs entry, which the bear's upkeep replaces.
 */
export function demoralizingRoar(profile: RulesProfile): AbilityDef {
  return {
    id: 'demoralizingRoar',
    name: 'Demoralizing Roar',
    icon: 'ability_druid_demoralizingroar',
    kind: 'cast',
    ...BEAR_ATTACK,
    costTenths: 100,
    threatMult: 0,
    threatBonus: DEMORALIZING_ROAR_THREAT,
    spellHit: true,
    clearcastable: true,
    aura: { id: 'demoralizingRoar', name: 'Demoralizing Roar', durationMs: 30000, mods: { bossAp: -profile.values.demoralizingRoarAp } },
  }
}

/** Enrage's rage (5229): 10 at once (`ENERGIZE` 100), then 2 every 1000 ms for 10 s (aura 24, 20 tenths) [F] (druid.md §4.5). */
export const ENRAGE_RAGE_TENTHS = 100
export const ENRAGE_TICK_TENTHS = 20
export const ENRAGE_TICKS = 10

/** Wolfshead Helm: +5 rage from Enrage in Forever [F] (druid.md §1.1, §4.5). */
export const WOLFSHEAD_ENRAGE_TENTHS = 50

/**
 * Enrage's armor loss in Dire Bear Form: 16% of base armor for its 10 s [F] tooltip (druid.md §4.5).
 * The client's effect is a dummy (server-side), so the sim reads "base armor" as armor from items and
 * adds −16% to the other item-armor bonuses, as Dire Bear Form's +360% is [?].
 */
export const ENRAGE_ITEM_ARMOR_PCT = -16

/**
 * Enrage (spells.json 5229): free, off the GCD, `RecoveryTime` 60000, Bear and Dire Bear only; its
 * rage is an energize, 5 threat per rage, and Wolfshead Helm adds 5 at once. For 10 s it lowers the
 * armor from items (above) [F] (druid.md §4.5).
 */
export function enrage(wolfshead: boolean): AbilityDef {
  return {
    id: 'enrage',
    name: 'Enrage',
    icon: 'ability_druid_enrage',
    kind: 'cast',
    ...BEAR_ATTACK,
    gcdMs: 0,
    costTenths: 0,
    cooldownMs: 60000,
    refundShare: 0,
    threatMult: 0,
    rageTenths: ENRAGE_RAGE_TENTHS + (wolfshead ? WOLFSHEAD_ENRAGE_TENTHS : 0),
    rageTickTenths: ENRAGE_TICK_TENTHS,
    rageTicks: ENRAGE_TICKS,
    rageTickMs: 1000,
    aura: { id: 'enrage', name: 'Enrage', durationMs: 10000, mods: { itemArmorPct: ENRAGE_ITEM_ARMOR_PCT } },
  }
}
