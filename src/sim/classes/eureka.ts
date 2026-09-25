// Gnome Eureka!, one racial with a spell per class (docs/mechanics/character-stats.md#racials-that-matter-to-the-sim):
// the next 3 abilities it modifies cost less and deal +10% damage, their periodic damage +10%, for
// 15 s, every 2 minutes. Off the GCD, no cost; every class presses it on cooldown from the pull.
//
// [F] [client] (SpellEffect, SpellAuraOptions, SpellDuration, SpellCooldowns, SpellClassOptions,
// 1.60.1.70009): four effects on each variant, aura 108 (a % spell modifier) on the class's spell
// family mask: misc 14 (cost) −10% for every class, misc 0 (damage) +10%, misc 22 (periodic damage)
// +10% on a narrower mask, and aura 4 (a dummy); `ProcCharges` 3, 15,000 ms, `recoveryTime` 120,000.
// Until 1.60.1.70009 the cost cut was the class's own: warrior −40% rage, rogue −20% Energy, mage and
// warlock −50% mana, priest −15% ("Changed Eureka on every class to a 10% discount on Mana, Rage, or
// Energy abilities", the build's development notes). The damage and periodic effects are unchanged.
//
// The model's rules are [?] (`eureka`): a charge goes to each use of an ability either modifier
// covers, as it's paid (a cast-time spell's as it lands), whether it lands or not; the cost is cut,
// then rounded down to whole resource; the damage +10% is the ability's direct damage, and the
// periodic +10% its DoT's or bleed's snapshot. Which abilities count is the client's masks, per
// ability below (the data test checks each against them).
import type { AbilityDef } from '../plan/types'
import type { ClassId } from '../types'
import { racialCooldown } from './warrior/abilities'

/** The classes with a Eureka! (its class masks: warrior 1, rogue 8, priest 16, mage 128, warlock 256). */
export type EurekaClass = 'warrior' | 'rogue' | 'priest' | 'mage' | 'warlock'

export interface EurekaDef {
  /** The class's variant. */
  spellId: number
  /** Cost cut % (misc 14). */
  costPct: number
  /** Direct damage % (misc 0) and periodic damage % (misc 22). */
  damagePct: number
  dotPct: number
  charges: number
  durationMs: number
  cooldownMs: number
}

/** Every class's cost cut since 1.60.1.70009 [F] [client]. */
export const EUREKA_COST_PCT = 10

const def = (spellId: number): EurekaDef => ({ spellId, costPct: EUREKA_COST_PCT, damagePct: 10, dotPct: 10, charges: 3, durationMs: 15000, cooldownMs: 120000 })

/** Each class's variant [F] [client]: its own spell and masks, the same numbers. */
export const EUREKA: Readonly<Record<EurekaClass, EurekaDef>> = {
  warrior: def(1259813),
  rogue: def(1259812),
  mage: def(1259817),
  warlock: def(1259821),
  priest: def(1259823),
}

/** The resource each class's cut is of, for the results' assumption. */
export const EUREKA_RESOURCE: Readonly<Record<EurekaClass, string>> = { warrior: 'rage', rogue: 'Energy', mage: 'mana', warlock: 'mana', priest: 'mana' }

/** What Eureka! does to an ability: bits of `EUREKA_COST`, `EUREKA_DAMAGE` and `EUREKA_DOT` (plan/types.ts AbilityPlan.eureka). */
export const EUREKA_COST = 1
export const EUREKA_DAMAGE = 2
export const EUREKA_DOT = 4

/**
 * The sim's abilities each class's Eureka! modifies, by ability id: the client spell it casts (its
 * cost and charge), the spell whose damage it deals when that's another (Arcane Missiles' missiles,
 * Mutilate's strikes), and the bits the masks give. An ability not listed isn't modified and spends no charge (Pyroblast,
 * Incinerate, Siphon Life, Hemorrhage, Sunder Armor, Revenge, Spearing Strike: outside the masks).
 */
export const EUREKA_ABILITIES: Readonly<Record<EurekaClass, Readonly<Record<string, { spell: number; damageSpell?: number; bits: number }>>>> = {
  warrior: {
    bloodthirst: { spell: 23894, bits: EUREKA_COST | EUREKA_DAMAGE },
    mortalStrike: { spell: 21553, bits: EUREKA_COST | EUREKA_DAMAGE },
    whirlwind: { spell: 1680, bits: EUREKA_COST | EUREKA_DAMAGE },
    slam: { spell: 1310200, bits: EUREKA_COST | EUREKA_DAMAGE },
    execute: { spell: 20662, bits: EUREKA_COST | EUREKA_DAMAGE },
    overpower: { spell: 11585, bits: EUREKA_COST | EUREKA_DAMAGE },
    heroicStrike: { spell: 25286, bits: EUREKA_COST | EUREKA_DAMAGE },
    hamstring: { spell: 7373, bits: EUREKA_COST | EUREKA_DAMAGE },
    shieldSlam: { spell: 23925, bits: EUREKA_COST | EUREKA_DAMAGE },
    thunderClap: { spell: 11581, bits: EUREKA_COST | EUREKA_DAMAGE },
    rend: { spell: 11574, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
  },
  rogue: {
    sinisterStrike: { spell: 11294, bits: EUREKA_COST | EUREKA_DAMAGE },
    backstab: { spell: 25300, bits: EUREKA_COST | EUREKA_DAMAGE },
    ambush: { spell: 11269, bits: EUREKA_COST | EUREKA_DAMAGE },
    ghostlyStrike: { spell: 14278, bits: EUREKA_COST | EUREKA_DAMAGE },
    eviscerate: { spell: 31016, bits: EUREKA_COST | EUREKA_DAMAGE },
    rupture: { spell: 11275, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
    // Mutilate's cast (1241584) is in the cost mask, its strikes (1241586, 1241590) in the damage mask.
    mutilate: { spell: 1241584, damageSpell: 1241586, bits: EUREKA_COST | EUREKA_DAMAGE },
    bladeFlurry: { spell: 13877, bits: EUREKA_COST | EUREKA_DAMAGE },
  },
  mage: {
    fireball: { spell: 25306, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
    scorch: { spell: 10207, bits: EUREKA_COST | EUREKA_DAMAGE },
    fireBlast: { spell: 10199, bits: EUREKA_COST | EUREKA_DAMAGE },
    frostbolt: { spell: 25304, bits: EUREKA_COST | EUREKA_DAMAGE },
    // The channel (25345) is in the masks, its missiles (25346) aren't: a cheaper channel, no more damage.
    arcaneMissiles: { spell: 25345, damageSpell: 25346, bits: EUREKA_COST },
  },
  warlock: {
    shadowBolt: { spell: 25307, bits: EUREKA_COST | EUREKA_DAMAGE },
    corruption: { spell: 25311, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
    immolate: { spell: 25309, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
    baneOfAgony: { spell: 11713, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
    baneOfDoom: { spell: 603, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
    conflagrate: { spell: 1293818, bits: EUREKA_COST | EUREKA_DAMAGE },
    shadowburn: { spell: 18871, bits: EUREKA_COST | EUREKA_DAMAGE },
    soulFire: { spell: 17924, bits: EUREKA_COST | EUREKA_DAMAGE },
  },
  priest: {
    mindBlast: { spell: 10947, bits: EUREKA_COST | EUREKA_DAMAGE },
    shadowWordPain: { spell: 10894, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
    mindFlay: { spell: 18807, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
    devouringPlague: { spell: 19280, bits: EUREKA_COST | EUREKA_DAMAGE | EUREKA_DOT },
    starshards: { spell: 19305, bits: EUREKA_COST | EUREKA_DAMAGE },
  },
}

/** The class's Eureka! as a cast: off the GCD, free, its 15 s aura with 3 charges (the plan's `eureka`). */
export function eurekaAbility(classId: EurekaClass): AbilityDef {
  const e = EUREKA[classId]
  return racialCooldown('eureka', 'Eureka!', 'inv_gnometoy', e.cooldownMs, { id: 'eureka', name: 'Eureka!', durationMs: e.durationMs, mods: {} })
}

/** The Gnome's Eureka! for this class, or none (a Gnome hunter's, or another race). */
export const eurekaFor = (race: string, classId: ClassId): AbilityDef | undefined =>
  race === 'alliance-gnome' && classId in EUREKA ? eurekaAbility(classId as EurekaClass) : undefined
