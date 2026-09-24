// The hunter's pet (docs/classes/hunter.md#6-pets; docs/mechanics/ranged-and-pets.md §6–§8): a cat
// with Claw and Bite on Focus, as a PetDef the plan builder derives (plan/pet.ts petPlan). Its base
// stats aren't in either client, so they're [?] placeholders (ranged-and-pets.md OQ-6); its
// abilities are the Forever client's rows.
import { COND } from '../../plan/types'
import type { PetAbilityDef, PetDef } from '../../plan/pet'
import { spread } from '../paladin/spells'
import { rank, type TalentRanks } from './talents'

const DOC = 'docs/classes/hunter.md#6-pets'

/**
 * A level-60 hunter pet's base numbers [?] (ranged-and-pets.md §6, OQ-6): a Classic Era player's
 * report of 22.9 base damage per second at 2.0 s, so 45.8 a swing (no spread known), and 252 attack
 * power, 2 × 136 Strength − 20; 5% base crit [?]. Not evidence; M9 replaces them.
 */
export const PET_BASE = { damagePerSwing: 45.8, speedSec: 2, str: 136, baseAp: -20, crit: 5 } as const

/**
 * What your pet inherits from you [?] (hunter.md §6; ranged-and-pets.md §6, OQ-6), D29's default: the
 * Forever client's "Hunter Pet Scaling" (415429) has slots for them with every amount 0 (they're set
 * server-side), and Forever testers report 10% of the hunter's higher attack power and all of its crit.
 * So the pet takes 10% of the higher of your attack power and ranged attack power, and your higher sheet
 * crit, melee or ranged (your ranged crit, with Lethal Shots and a scope), added to its own.
 */
export const PET_INHERITS = { apFromOwnerHigherAp: 0.1, critFromOwnerCrit: 1 } as const

/** A cat's damage modifier, ×1.10, and a Happy pet's ×1.25 [C] (Warcraft Tavern's Classic pet guide; ranged-and-pets.md §6). */
export const CAT_DAMAGE = 1.1
export const HAPPY_DAMAGE = 1.25

/**
 * Focus (ranged-and-pets.md §7): maximum 100 [F] (PowerType 3); about 5 a second in Classic Era
 * measurements, so 5 every second from a random phase [?] (OQ-5); Bestial Discipline's +10% a rank
 * (curve [10, 20]) [F].
 */
export const FOCUS_PER_SECOND = 5
export const BESTIAL_DISCIPLINE_FOCUS = [0, 10, 20]

/**
 * Claw r8 (3009) [F] [client] (SpellEffect, SpellPower, SpellCooldowns, 1.60.1.69913): 51 Physical
 * with variance 0.3137, so 43.0–59.0, 25 Focus, the pet's 1.5 s GCD, no cooldown, the melee table.
 */
const [CLAW_MIN, CLAW_MAX] = spread(51, 0.3137255)
export const CLAW: PetAbilityDef = {
  id: 'claw',
  name: 'Claw',
  icon: 'ability_druid_rake',
  kind: 'melee',
  school: 'physical',
  costTenths: 250,
  cooldownMs: 0,
  gcdMs: 1500,
  castMs: 0,
  min: CLAW_MIN,
  max: CLAW_MAX,
  apCoefficient: 0,
  spCoefficient: 0,
  weaponPercent: 0,
  bonusCrit: 0,
  critMultiplier: 2,
}

/** Bite r8 (17261) [F] [client]: 90 Physical ± 10% (81–99), 35 Focus, a 10 s cooldown (category 19), the pet's GCD. */
const [BITE_MIN, BITE_MAX] = spread(90, 0.2)
export const BITE: PetAbilityDef = { ...CLAW, id: 'bite', name: 'Bite', icon: 'ability_racial_cannibalize', costTenths: 350, cooldownMs: 10000, min: BITE_MIN, max: BITE_MAX }

/**
 * Unleashed Fury (19616): the pet's damage +3% a rank; Ferocity (19598): its crit +2% a rank;
 * Focused Fire (1223755): +1% a rank to you and the pet [F] (their curves and texts).
 */
export const petDamageMult = (talents: TalentRanks) =>
  CAT_DAMAGE * HAPPY_DAMAGE * (1 + (3 * rank(talents, 'Unleashed Fury')) / 100) * (1 + rank(talents, 'Focused Fire') / 100)

/**
 * The cat (docs/classes/hunter.md#6-pets): behind the boss, its white swings glancing as a player's
 * [?], with its shares of your attack power and crit (`PET_INHERITS`: Classic Era's pets inherit
 * nothing [C]; Forever's scaling auras are server-side, so the testers' report is the default [?],
 * OQ-6). Its list: Bite on cooldown, and Claw while its Focus is at least
 * `clawFocus` (so Bite stays affordable).
 */
export function hunterPet(talents: TalentRanks, clawFocus: number): PetDef {
  const focusTick = Math.round(10 * FOCUS_PER_SECOND * (1 + (BESTIAL_DISCIPLINE_FOCUS[rank(talents, 'Bestial Discipline')] ?? 20) / 100))
  return {
    id: 'cat',
    name: 'Cat',
    icon: 'ability_hunter_pet_cat',
    level: 60,
    weapon: { min: PET_BASE.damagePerSwing, max: PET_BASE.damagePerSwing, speedSec: PET_BASE.speedSec },
    stats: { baseStr: PET_BASE.str, baseAp: PET_BASE.baseAp, apPerStr: 2, baseCrit: PET_BASE.crit + 2 * rank(talents, 'Ferocity') },
    damageMult: petDamageMult(talents),
    ...PET_INHERITS,
    glances: true,
    front: false,
    power: { kind: 'focus', maxTenths: 1000, startTenths: 1000, tickTenths: focusTick, tickMs: 1000 },
    abilities: [BITE, CLAW],
    rotation: [
      { ability: 0, conditions: [] },
      { ability: 1, conditions: [{ code: COND.petPowerAtLeast, a: 10 * clawFocus, b: 0 }] },
    ],
  }
}

export const PET_DOC = DOC
