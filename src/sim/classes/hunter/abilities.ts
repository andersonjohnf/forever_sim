// Hunter shots, stings and cooldowns as data (docs/classes/hunter.md §3).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), written out
// here so the app bundle doesn't carry the client dataset; data.test.ts checks each against it.
// These are the base rows: the build's talents (Efficiency, Improved Arcane Shot, Improved Stings,
// Barrage, Mortal Shots, Rapid Killing) are applied by talents.ts. Auto Shot is the plan's ranged
// weapon (docs/mechanics/ranged-and-pets.md §4), not a row.
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import type { AuraSpec } from '../../effects/types'
import { type AbilityDef, CASTER_ROW, type SpellDef } from '../../plan/types'
import { BERSERKING, BLOOD_FURY, ELUNES_LIGHT } from '../warrior/abilities'

/** Base mana at level 60 [F] (PlayerExpectedStat.BaseMana, 1.60.1.69913): costs in % of base mana use it. */
export const HUNTER_BASE_MANA = 1720

/** A mana cost as a row's `costTenths` (paid from mana: `resource: 'mana'`, in tenths). */
const mana = (cost: number) => ({ costTenths: 10 * cost })
/** A cost in % of base mana, rounded down to whole mana [?] (docs/classes/hunter.md#3-abilities). */
export const baseManaCost = (pct: number) => Math.floor((HUNTER_BASE_MANA * pct) / 100 + 1e-9)

/**
 * What every hunter ability starts from: the caster core's row, paid from mana, the 1.5 s GCD
 * (StartRecoveryTime 1500, category 133), instant. A shot needs the ranged weapon (`needsRanged`).
 */
const HUNTER = {
  ...CASTER_ROW,
  resource: 'mana',
  costTenths: 0,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  castMs: 0,
  offHand: false,
  aura: null,
} as const

/** A shot: HUNTER, needing the ranged weapon (docs/mechanics/ranged-and-pets.md §5). */
const SHOT = { ...HUNTER, kind: 'spell', needsRanged: true } as const

/**
 * What every shot's spell starts from (docs/mechanics/ranged-and-pets.md §5): DefenseType 3, the
 * ranged table and weapon (`ranged`), physical, 100% of the ranged weapon's damage normalized to
 * 2.8 s (effect 121), a crit ×2 [F] (`STAT_CRIT_BONUS`), triggering the ranged procs.
 */
const SHOT_SPELL = {
  school: 'physical',
  defense: 'ranged',
  ranged: true,
  noActiveDefense: false,
  alwaysHit: false,
  triggersProcs: true,
  min: 0,
  max: 0,
  weaponPercent: 1,
  normalized: true,
  spCoefficient: 0,
  takenScale: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  bonusCrit: 0,
  damageMult: 1,
  threatMult: 1,
  threatBonus: 0,
} as const

/** Aimed Shot and Multi-Shot's shared cooldown: category 2, `CategoryRecoveryTime` 6000 [F]. */
export const AIMED_MULTI_CATEGORY = 'aimedMulti'

// --- Aimed Shot (docs/classes/hunter.md#31-aimed-shot-r6-20904) ------------------------------------

/**
 * Aimed Shot r6 (20904) [F] [client] (SpellEffect, SpellCastTimes, SpellCooldowns, SpellCategories,
 * SpellPower, 1.60.1.69913): normalized weapon damage (effect 121) + 166 (Classic Era +600), a 2.0 s
 * cast (Classic Era 3.0 s), 310 mana, category 2's 6 s cooldown shared with Multi-Shot, a baseline
 * spell every hunter has (Classic Era: a Marksmanship talent).
 */
export const AIMED_SHOT_SPELL: SpellDef = { ...SHOT_SPELL, id: 'aimedShot', name: 'Aimed Shot', icon: 'inv_spear_07', min: 166, max: 166 }
export const AIMED_SHOT: AbilityDef = {
  ...SHOT,
  id: 'aimedShot',
  name: 'Aimed Shot',
  icon: 'inv_spear_07',
  ...mana(310),
  castMs: 2000,
  // docs/mechanics/ranged-and-pets.md §4: ranged haste shortens the cast [?].
  castRangedHasted: true,
  cooldownMs: 6000,
  category: AIMED_MULTI_CATEGORY,
  spellDef: AIMED_SHOT_SPELL,
}

// --- Multi-Shot (docs/classes/hunter.md#32-multi-shot-2643) ---------------------------------------

/**
 * Multi-Shot (2643), Forever's one rank [F] [client] (SpellEffect, SpellCastTimes, SpellPower,
 * 1.60.1.69913): normalized weapon damage with no bonus (Classic Era r5 +150) on up to 3 targets, a
 * 0.5 s cast (Classic Era "instant", a hidden ~0.5 s), 13.9% of base mana (239), category 2's 6 s
 * cooldown shared with Aimed Shot. The sim fights one target.
 */
export const MULTI_SHOT_SPELL: SpellDef = { ...SHOT_SPELL, id: 'multiShot', name: 'Multi-Shot', icon: 'ability_upgrademoonglaive' }
export const MULTI_SHOT: AbilityDef = {
  ...SHOT,
  id: 'multiShot',
  name: 'Multi-Shot',
  icon: 'ability_upgrademoonglaive',
  costTenths: 10 * baseManaCost(13.9),
  castMs: 500,
  castRangedHasted: true,
  cooldownMs: 6000,
  category: AIMED_MULTI_CATEGORY,
  spellDef: MULTI_SHOT_SPELL,
}

// --- Arcane Shot (docs/classes/hunter.md#33-arcane-shot-r8-14287) ---------------------------------

/**
 * Arcane Shot r8 (14287) [F] [client] (SpellEffect, SpellCooldowns, SpellPower, 1.60.1.69913): 217
 * Arcane (Classic Era 183 and a 0.429 spell damage coefficient; Forever's has none), instant, 190 mana,
 * its own 6 s category (1173, shared with Summon Hawk). A school shot: the ranged table, the
 * Arcane multipliers and the boss's average resist, no armor; its crit ×2 as a shot's [?].
 */
export const ARCANE_SHOT_SPELL: SpellDef = {
  ...SHOT_SPELL,
  id: 'arcaneShot',
  name: 'Arcane Shot',
  icon: 'ability_impalingbolt',
  school: 'arcane',
  weaponPercent: 0,
  normalized: false,
  min: 217,
  max: 217,
}
export const ARCANE_SHOT: AbilityDef = { ...SHOT, id: 'arcaneShot', name: 'Arcane Shot', icon: 'ability_impalingbolt', ...mana(190), cooldownMs: 6000, spellDef: ARCANE_SHOT_SPELL }

// --- Serpent Sting (docs/classes/hunter.md#34-serpent-sting-r9-25295) -----------------------------

/**
 * Serpent Sting r9 (25295) [F] [client] (SpellEffect, SpellDuration, SpellMisc, SpellPower,
 * 1.60.1.69913): a pure DoT on the ranged table (DefenseType 3), aura 3, 111 Nature every 3 s for 15 s
 * (5 ticks, 555, as in Classic Era), no coefficient, and the periodic-crit flag (Attributes[8] 0x200):
 * its ticks crit at your spell crit, ×1.5 [?]. 250 mana, instant. Pure damage: partially resisted.
 */
export const SERPENT_STING_SPELL: SpellDef = {
  ...SHOT_SPELL,
  id: 'serpentSting',
  name: 'Serpent Sting',
  icon: 'ability_hunter_quickshot',
  school: 'nature',
  weaponPercent: 0,
  normalized: false,
  critMultiplier: CRIT_MULTIPLIER.spell,
  dotTicks: 5,
  dotTickMs: 3000,
  dotTickDamage: 111,
  dotSpCoefficient: 0,
  dotCanCrit: true,
}
/** Its marker on the boss, up until the last tick (docs/mechanics/spells.md §7). */
export const SERPENT_STING_AURA: AuraSpec = { id: 'serpentSting', name: 'Serpent Sting', durationMs: 15000, mods: {} }
export const SERPENT_STING: AbilityDef = {
  ...SHOT,
  id: 'serpentSting',
  name: 'Serpent Sting',
  icon: 'ability_hunter_quickshot',
  ...mana(250),
  aura: SERPENT_STING_AURA,
  spellDef: SERPENT_STING_SPELL,
}

// --- Sniper Shot (docs/classes/hunter.md#35-sniper-shot-r3-1310786) -------------------------------

/**
 * Sniper Shot r3 (1310786), new in Forever, taught by the Marksmanship tree's last talent [F]
 * [client] (SpellEffect, SpellCastTimes, SpellCooldowns, SpellPower, 1.60.1.69913): normalized weapon
 * damage + 295, a 4.0 s cast, its own 15 s cooldown, 365 mana.
 */
export const SNIPER_SHOT_SPELL: SpellDef = { ...SHOT_SPELL, id: 'sniperShot', name: 'Sniper Shot', icon: 'hunter_pvp_snipershot', min: 295, max: 295 }
export const SNIPER_SHOT: AbilityDef = {
  ...SHOT,
  id: 'sniperShot',
  name: 'Sniper Shot',
  icon: 'hunter_pvp_snipershot',
  ...mana(365),
  castMs: 4000,
  castRangedHasted: true,
  cooldownMs: 15000,
  spellDef: SNIPER_SHOT_SPELL,
}

// --- Hunter's Mark, Rapid Fire, Bestial Wrath (docs/classes/hunter.md §3.6–§3.8) -----------------

/**
 * Hunter's Mark r4 (14325) [F] [client] (SpellEffect, SpellDuration, SpellPower, 1.60.1.69913): aura
 * 127, +71 ranged attack power to every attacker of the target (Classic Era 110), 2 min, 60 mana, on
 * the GCD. Your own debuff on the boss: an aura on you with +71 ranged attack power while it's up. It
 * always lands [?].
 */
export const HUNTERS_MARK_RAP = 71
export const HUNTERS_MARK: AbilityDef = {
  ...HUNTER,
  id: 'huntersMark',
  name: 'Hunter’s Mark',
  icon: 'ability_hunter_snipershot',
  kind: 'cast',
  ...mana(60),
  aura: { id: 'huntersMark', name: 'Hunter’s Mark', durationMs: 120000, mods: { rap: HUNTERS_MARK_RAP } },
}

/**
 * Rapid Fire (3045) [F] [client] (SpellEffect, SpellCooldowns, SpellDuration, 1.60.1.69913): +40%
 * ranged attack speed (aura 140; Forever adds +40% melee, aura 319, which a hunter that doesn't swing
 * never uses) for 15 s, a 5 min cooldown (category 55), 100 mana, off the GCD.
 */
export const RAPID_FIRE: AbilityDef = {
  ...HUNTER,
  id: 'rapidFire',
  name: 'Rapid Fire',
  icon: 'ability_hunter_runningshot',
  kind: 'cast',
  ...mana(100),
  gcdMs: 0,
  cooldownMs: 300000,
  aura: { id: 'rapidFire', name: 'Rapid Fire', durationMs: 15000, mods: { rangedHaste: 40 } },
}

/**
 * Bestial Wrath (19574), the Beast Mastery tree's last talent [F] [client] (SpellEffect,
 * SpellCooldowns, SpellDuration, SpellPower, 1.60.1.69913): the pet deals +50% damage (aura 79, all
 * schools) for 18 s, a 2 min cooldown, 12% of base mana (206), off the GCD.
 */
export const BESTIAL_WRATH: AbilityDef = {
  ...HUNTER,
  id: 'bestialWrath',
  name: 'Bestial Wrath',
  icon: 'ability_druid_ferociousbite',
  kind: 'cast',
  costTenths: 10 * baseManaCost(12),
  gcdMs: 0,
  cooldownMs: 120000,
  aura: { id: 'bestialWrath', name: 'Bestial Wrath', durationMs: 18000, mods: { petDamage: 50 } },
}

// --- Aspect of the Hawk and its Quick Shots (docs/classes/hunter.md#39-aspect-of-the-hawk-r7-25296) -

/** Aspect of the Hawk r7 (25296): +120 ranged attack power (aura 124) until cancelled [F]; cast before the pull. */
export const ASPECT_OF_THE_HAWK_RAP = 120
/**
 * Quick Shots (6150), the proc Aspect of the Hawk carries (its aura 42) at the chance Deadly Aspects
 * gives it: +30% ranged attack speed (aura 140) for 12 s [F] [client] (SpellEffect, SpellDuration,
 * 1.60.1.69913).
 */
export const QUICK_SHOTS_AURA: AuraSpec = { id: 'quickShots', name: 'Quick Shots', durationMs: 12000, mods: { rangedHaste: 30 } }

// --- Racials (docs/classes/hunter.md#72-race) ------------------------------------------------------

/**
 * The hunter's racial cooldowns: Forever's Blood Fury (20572) is +10% melee and ranged attack power
 * (auras 166 and 167) and spell power for 15 s; Berserking (20554) +10% melee and ranged attack speed
 * (auras 319, 140, 65) for 10 s [F] [client] (SpellEffect, 1.60.1.69913). The warrior's rows carry
 * only their melee parts; Elune's Light's crit reaches every attack.
 */
export const HUNTER_RACIALS: Readonly<Partial<Record<string, AbilityDef>>> = {
  'horde-orc': { ...BLOOD_FURY, aura: { id: 'bloodFury', name: 'Blood Fury', durationMs: 15000, mods: { apPct: 10, rapPct: 10 } } },
  'horde-troll': { ...BERSERKING, aura: { id: 'berserking', name: 'Berserking', durationMs: 10000, mods: { rangedHaste: 10 } } },
  'alliance-night-elf': ELUNES_LIGHT,
}
