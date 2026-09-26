// Mage spells, cooldowns and mana abilities as data (docs/classes/mage.md).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), written out
// here so the app bundle doesn't carry the client dataset; data.test.ts checks each against it.
// These are the base rows: the build's talents are applied by talents.ts. A rank learned below 60
// grows by its per-level points, and a range is base × (1 ± variance / 2), as the paladin's
// (paladin.md#conventions-used-below; docs/mechanics/spells.md §5).
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import type { AuraSpec } from '../../effects/types'
import { type AbilityDef, CASTER_ROW, MAGIC_SCHOOLS, schoolMask, type SpellDef } from '../../plan/types'
import { atLevel60, spread } from '../paladin/spells'

/** Base mana at level 60 [F] (PlayerExpectedStat.BaseMana and basemp.txt, 1.60.1.69913; mage.md#base-stats). */
export const MAGE_BASE_MANA = 1213

/** A mana cost as a row's `costTenths` (paid from mana: `resource: 'mana'`, in tenths). */
const mana = (cost: number) => ({ costTenths: 10 * cost })

/**
 * What every mage damage spell starts from: the magic class (DefenseType 1: the spell table,
 * docs/mechanics/spells.md §1), crit ×1.5, triggering procs as a spell you cast does, no talents.
 */
const SPELL = {
  defense: 'magic',
  noActiveDefense: false,
  alwaysHit: false,
  triggersProcs: true,
  weaponPercent: 0,
  normalized: false,
  critMultiplier: CRIT_MULTIPLIER.spell,
  bonusCrit: 0,
  damageMult: 1,
  threatMult: 1,
  threatBonus: 0,
  takenScale: 0,
} as const

/** A rank's range at level 60: base × (1 ± variance / 2), plus its per-level points up to 60, truncated (docs/data/items.md#per-level-values). */
const range = (base: number, variance: number, perLevel = 0, spellLevel = 60, maxLevel = 60) => {
  const grow = atLevel60(0, perLevel, spellLevel, maxLevel)
  const [min, max] = spread(base, variance)
  return { min: min + grow, max: max + grow }
}

// --- Fire (mage.md#fire-spells) ---------------------------------------------------------------------

/**
 * Fireball r11 (10151), the trainer's top rank (r12 is an Ahn'Qiraj book, D36; mage.md#fire-spells)
 * [F] [client] (SpellEffect, SpellMisc, 1.60.1.70009): 451 base points, variance 0.2413793, so
 * 396.57–505.43 at 60 (Classic Era 561–715), coefficient 1.0; its DoT 14 every 2 s for 8 s (4 ticks,
 * Classic Era 18), coefficient 0. Its DoT carries the periodic-crit flag (SpellMisc Attributes[8] 0x200), so its ticks can crit in `forever` (docs/mechanics/spells.md §7).
 */
export const FIREBALL_SPELL: SpellDef = {
  ...SPELL,
  id: 'fireball',
  name: 'Fireball',
  icon: 'spell_fire_flamebolt',
  school: 'fire',
  ...range(451, 0.2413793),
  spCoefficient: 1,
  dotTicks: 4,
  dotTickMs: 2000,
  dotTickDamage: 14,
  dotSpCoefficient: 0,
  dotCanCrit: true,
}

/** Scorch r7 (10207): 178 base points, variance 0.16535433, +1.7 a level from 58 to 62, so 166.28–195.72 at 60 (+ trunc(3.4) = 3) (Classic Era 237–279), coefficient 0.429 [F] [client]. */
export const SCORCH_SPELL: SpellDef = {
  ...SPELL,
  id: 'scorch',
  name: 'Scorch',
  icon: 'spell_fire_soulburn',
  school: 'fire',
  ...range(178, 0.16535433, 1.7, 58, 62),
  spCoefficient: 0.429,
}

/** Fire Blast r7 (10199): 438 base points, variance 0.16595745, +3 a level from 54 to 59, so 416.66–489.34 at 60 (Classic Era 446–524), coefficient 0.429 [F] [client]. */
export const FIRE_BLAST_SPELL: SpellDef = {
  ...SPELL,
  id: 'fireBlast',
  name: 'Fire Blast',
  icon: 'spell_fire_fireball',
  school: 'fire',
  ...range(438, 0.16595745, 3, 54, 59),
  spCoefficient: 0.429,
}

/**
 * Pyroblast r8 (18809): 583 base points, variance 0.21668743, so 519.84–646.16 at 60 (Classic Era 716–890),
 * coefficient 1.0; its DoT 53 every 3 s for 12 s (4 ticks, Classic Era 67), coefficient 0.15 a tick [F] [client].
 */
export const PYROBLAST_SPELL: SpellDef = {
  ...SPELL,
  id: 'pyroblast',
  name: 'Pyroblast',
  icon: 'spell_fire_fireball02',
  school: 'fire',
  ...range(583, 0.21668743),
  spCoefficient: 1,
  dotTicks: 4,
  dotTickMs: 3000,
  dotTickDamage: 53,
  dotSpCoefficient: 0.15,
  dotCanCrit: true,
}

// --- Frost (mage.md#frost-spells) --------------------------------------------------------------------

/**
 * Frostbolt r10 (10181), the trainer's top rank (r11 is an Ahn'Qiraj book, D36): 386 base points, variance
 * 0.076233186, +2.9 a level from 56 to 60, so 382.29–411.71 at 60 (+ trunc(11.6) = 11; Classic Era 440–474), coefficient 0.814; its slow makes it binary: resisted whole or not at all (docs/mechanics/spells.md §3) [F] [client].
 */
export const FROSTBOLT_SPELL: SpellDef = {
  ...SPELL,
  id: 'frostbolt',
  name: 'Frostbolt',
  icon: 'spell_frost_frostbolt02',
  school: 'frost',
  ...range(386, 0.076233186, 2.9, 56, 60),
  spCoefficient: 0.814,
  binary: true,
}

// --- Arcane (mage.md#arcane-spells) ------------------------------------------------------------------

/**
 * Arcane Missiles r7's missile (10274), the trainer's top rank (r8 is an Ahn'Qiraj book, D36): 171 base
 * points, +0.9 a level from 56 to 60, so 174 a missile at 60 (+ trunc(3.6) = 3; Classic Era 195), coefficient 0.286
 * (Classic Era 0.24) [F] [client] (SpellEffect, SpellLevels, 1.60.1.70009). Each is its own spell, with its own hit, crit and resist (docs/mechanics/spells.md §6).
 */
export const ARCANE_MISSILE_SPELL: SpellDef = {
  ...SPELL,
  id: 'arcaneMissiles',
  name: 'Arcane Missiles',
  icon: 'spell_nature_starfall',
  school: 'arcane',
  ...range(171, 0, 0.9, 56, 60),
  spCoefficient: 0.286,
}

/** Arcane Blast r5 (1239700), Forever's: 394 base points, variance 0.15102041, so 364.25–423.75 at 60, coefficient 0.714 [F] [client]. */
export const ARCANE_BLAST_SPELL: SpellDef = {
  ...SPELL,
  id: 'arcaneBlast',
  name: 'Arcane Blast',
  icon: 'spell_arcane_blast',
  school: 'arcane',
  ...range(394, 0.15102041),
  spCoefficient: 0.714,
}

// --- Abilities ---------------------------------------------------------------------------------------

/** A spell cast as an ability: its mana, the 1.5 s GCD (category 133), its cast time, which casting speed shortens. */
const spellAbility = (spell: SpellDef, manaCost: number, castMs: number, rest: Partial<AbilityDef> = {}): AbilityDef => ({
  ...CASTER_ROW,
  offHand: false,
  aura: null,
  id: spell.id,
  name: spell.name,
  icon: spell.icon,
  kind: 'spell',
  resource: 'mana',
  ...mana(manaCost),
  cooldownMs: 0,
  gcdMs: GCD_MS,
  castMs,
  castHasted: castMs > 0,
  clearcastable: true,
  spellDef: spell,
  ...rest,
})

/** Fireball r11: 395 mana, a 3.5 s cast [F] [client] (SpellPower, SpellCastTimes). */
export const FIREBALL = spellAbility(FIREBALL_SPELL, 395, 3500)
/** Scorch r7: 150 mana, a 1.5 s cast [F]. */
export const SCORCH = spellAbility(SCORCH_SPELL, 150, 1500)
/** Fire Blast r7: 340 mana, instant, an 8 s cooldown (category 19, "Quick Damage - Spell") [F]. */
export const FIRE_BLAST = spellAbility(FIRE_BLAST_SPELL, 340, 0, { cooldownMs: 8000 })
/** Pyroblast r8: 440 mana, a 6 s cast [F]. */
export const PYROBLAST = spellAbility(PYROBLAST_SPELL, 440, 6000)
/** Frostbolt r10: 260 mana, a 3 s cast [F]. */
export const FROSTBOLT = spellAbility(FROSTBOLT_SPELL, 260, 3000)
/** Arcane Blast r5: 15% of base mana (181), a 2.5 s cast [F]. */
export const ARCANE_BLAST = spellAbility(ARCANE_BLAST_SPELL, Math.floor(0.15 * MAGE_BASE_MANA), 2500)

/**
 * Arcane Missiles r7 (10212): a 5 s channel, 595 mana, that fires a missile (ARCANE_MISSILE_SPELL) each
 * second, the first 1 s after the start (aura 23, period 1000) [F] [client]. Its missile count and
 * period are a channel's `rageTicks` and `rageTickMs` (plan/types.ts AbilityPlan). Casting speed
 * doesn't shorten a channel (docs/mechanics/spells.md §4 [?]).
 */
export const ARCANE_MISSILES: AbilityDef = {
  ...CASTER_ROW,
  offHand: false,
  aura: null,
  // Its missiles' spell's id, so the channel and its missiles share one breakdown row (as Consecration's ticks do).
  id: 'arcaneMissiles',
  name: 'Arcane Missiles',
  icon: 'spell_nature_starfall',
  kind: 'channel',
  resource: 'mana',
  ...mana(595),
  cooldownMs: 0,
  gcdMs: GCD_MS,
  castMs: 0,
  rageTicks: 5,
  rageTickMs: 1000,
  clearcastable: true,
  tickSpellDef: ARCANE_MISSILE_SPELL,
  // Its breakdown row's average is per missile (docs/ux.md#results "Breakdown").
  tickNoun: 'missile',
}

/** A mana `cast` row with no cost and no cast time: a cooldown, a gem, a consumable. */
export const CASTER_ROW_CAST = { ...CASTER_ROW, offHand: false, kind: 'cast', resource: 'mana', costTenths: 0, castMs: 0 } as const

/** A cooldown cast off the GCD with a buff on the mage. */
const cooldown = (id: string, name: string, icon: string, cooldownMs: number, aura: AuraSpec | null, rest: Partial<AbilityDef> = {}): AbilityDef => ({
  ...CASTER_ROW,
  offHand: false,
  id,
  name,
  icon,
  kind: 'cast',
  resource: 'mana',
  costTenths: 0,
  cooldownMs,
  gcdMs: 0,
  castMs: 0,
  aura,
  ...rest,
})

/**
 * Combustion (11129 → 28682) [F] [client] (SpellAuraOptions, SpellEffect, SpellCooldowns, 1.60.1.69913):
 * off the GCD, no cost; each Fire spell that hits adds a stack of +10% Fire crit (up to 10), and it
 * ends after 4 non-periodic Fire crits (Classic Era: 3). It shares category 1151's 3 min cooldown with
 * Presence of Mind. The first spell after it already has +10%, and the cooldown starts as it ends
 * (R1's model) [C] (docs/classes/mage.md#combustion).
 */
export const COMBUSTION_AURA: AuraSpec = {
  id: 'combustion',
  name: 'Combustion',
  durationMs: 3600000,
  maxStacks: 10,
  critCharges: 4,
  critChargeSchools: ['fire'],
  refreshKeepsCharges: true,
  mods: { schoolMask: schoolMask(['fire']), schoolCrit: 10 },
}
/** Category 1151 ("Talent - DPS"): Combustion and Presence of Mind share its 3 min cooldown [F] [client] (SpellCategories). */
export const TALENT_DPS_CATEGORY = 'talentDps'
export const COMBUSTION = cooldown('combustion', 'Combustion', 'spell_fire_sealoffire', 180000, COMBUSTION_AURA, {
  category: TALENT_DPS_CATEGORY,
  cooldownAfterAura: true,
})

/**
 * Presence of Mind (12043) [F] [client]: off the GCD, no cost, one charge: the next spell with a cast
 * time is instant (−100% cast time, class mask b30: Fireball, Scorch, Pyroblast, Frostbolt, Arcane
 * Blast). Its 3 min category cooldown is Combustion's too.
 */
export const PRESENCE_OF_MIND_AURA: AuraSpec = { id: 'presenceOfMind', name: 'Presence of Mind', durationMs: 3600000, mods: {} }
export const PRESENCE_OF_MIND = cooldown('presenceOfMind', 'Presence of Mind', 'spell_nature_enchantarmor', 180000, PRESENCE_OF_MIND_AURA, {
  category: TALENT_DPS_CATEGORY,
})

/** Arcane Power (12042) [F] [client]: off the GCD, 3 min cooldown; +30% damage from every damage spell and +30% mana cost, 15 s. */
export const ARCANE_POWER_AURA: AuraSpec = {
  id: 'arcanePower',
  name: 'Arcane Power',
  durationMs: 15000,
  mods: { schoolMask: schoolMask(MAGIC_SCHOOLS), schoolDamage: 30, manaCostPct: 30 },
}
export const ARCANE_POWER = cooldown('arcanePower', 'Arcane Power', 'spell_nature_lightning', 180000, ARCANE_POWER_AURA)

/**
 * Evocation (12051) [F] [client]: an 8 s channel on the GCD, 8 min cooldown, no cost: mana regeneration
 * +1,500% (aura 110), all of it while casting (aura 134). The channel's aura is up for its ticks
 * (docs/mechanics/spells.md §8).
 */
export const EVOCATION_AURA: AuraSpec = { id: 'evocation', name: 'Evocation', durationMs: 8000, mods: { spiritRegen: 1500, castingRegen: 100 } }
export const EVOCATION: AbilityDef = {
  ...CASTER_ROW,
  offHand: false,
  id: 'evocation',
  name: 'Evocation',
  icon: 'spell_nature_purge',
  kind: 'channel',
  resource: 'mana',
  costTenths: 0,
  cooldownMs: 480000,
  gcdMs: GCD_MS,
  castMs: 0,
  rageTicks: 8,
  rageTickMs: 1000,
  aura: EVOCATION_AURA,
}

/** Ice Barrier r4 (13033) [F] [client]: 480 mana, a 30 s cooldown, on the GCD; its 819-point shield does nothing to your damage. */
export const ICE_BARRIER_AURA: AuraSpec = { id: 'iceBarrier', name: 'Ice Barrier', durationMs: 60000, mods: {} }
export const ICE_BARRIER: AbilityDef = { ...cooldown('iceBarrier', 'Ice Barrier', 'spell_ice_lament', 30000, ICE_BARRIER_AURA), ...mana(480), gcdMs: GCD_MS }

/**
 * Mana gems (mage.md#mana): Mana Ruby (item 8008, spell 10058) restores 1,100 × (1 ± 0.1818 / 2) =
 * 1,000–1,200 mana, Mana Citrine (8007, 10057) 850 × (1 ± 0.1765 / 2) = 775–925 [F] [client]. Each is
 * conjured before the fight and used once; off the GCD; they share category 1153's 2 min cooldown
 * with the Demonic Rune [F] [client] (ItemEffect, 1.60.1.69913).
 */
export const GEM_CATEGORY = 'manaGem'
const gem = (id: string, name: string, icon: string, min: number, max: number): AbilityDef => ({
  ...cooldown(id, name, icon, 120000, null),
  aura: null,
  category: GEM_CATEGORY,
  usesPerFight: 1,
  manaTenths: 10 * min,
  manaSpreadTenths: 10 * (max - min),
})
export const MANA_RUBY = gem('manaRuby', 'Mana Ruby', 'inv_misc_gem_ruby_01', 1000, 1200)
export const MANA_CITRINE = gem('manaCitrine', 'Mana Citrine', 'inv_misc_gem_opal_01', 775, 925)
