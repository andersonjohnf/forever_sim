// Hand-built plans for the ranged and pet core's tests (ranged.test.ts, ranged-examples.test.ts;
// docs/mechanics/ranged-and-pets.md): a warrior plan from test-helpers with no melee weapon, a ranged
// weapon and Auto Shot, shots as ranged spells, casts that put an aura up, and a pet. Test code only.
import { type AbilityPlan, type AuraPlan, CASTER_ROW, DEFENSE, type PetAbilityPlan, type PetPlan, type Plan, type RangedPlan, type RotationCondition, SCHOOL } from '../plan/types'
import { armsPlan } from './test-helpers'

/**
 * No melee weapon, no rage, no static haste; a 3.0-speed ranged weapon rolling exactly 100, no ammo,
 * a 500 ms wind-up that casts hold back, the first shot at the pull; 0 ranged attack power, boss armor
 * 0, and every attack landing and never critting unless a test says so.
 */
export function rangedPlan(durationMs = 30000, patch: Partial<RangedPlan> = {}): Plan {
  const plan = armsPlan(durationMs)
  plan.weapons = [null, null]
  plan.rage.maxTenths = 0
  plan.spells = []
  const s = plan.stats
  s.haste = 1
  s.hasteRating = 0
  s.hitRating = 0
  s.critRating = 0
  s.hit = 100
  s.crit = -100
  s.rap = 0
  plan.sources.push({ id: 'autoShot', name: 'Auto Shot', icon: 'x' })
  plan.ranged = {
    name: 'Bow',
    icon: 'x',
    min: 100,
    max: 100,
    speedSec: 3,
    flatDamage: 0,
    skill: 300,
    hitBonus: 0,
    critBonus: 0,
    damageMult: 1,
    hasteMult: 1,
    normalizedSpeed: 2.8,
    windupMs: 500,
    windupHasted: false,
    castsHoldAutoShot: true,
    critMultiplier: 2,
    firstShotMs: 0,
    source: plan.sources.length - 1,
    ...patch,
  }
  return plan
}

/**
 * A shot (SpellDef.ranged) as a `spell` ability: physical, 100% weapon damage plus `flat`, normalized,
 * with the ability's cast time, cooldown and GCD. Returns the ability index.
 */
export function addShot(plan: Plan, patch: { castMs?: number; cooldownMs?: number; gcdMs?: number; flat?: number; normalized?: boolean; castRangedHasted?: boolean; school?: number; weaponPercent?: number } = {}): number {
  const i = plan.spells!.length
  plan.sources.push({ id: `shot${i}`, name: `Shot ${i}`, icon: 'x' })
  const source = plan.sources.length - 1
  plan.spells!.push({
    id: `shot${i}`,
    school: patch.school ?? SCHOOL.physical,
    defense: DEFENSE.ranged,
    noActiveDefense: false,
    alwaysHit: false,
    triggersProcs: true,
    min: patch.flat ?? 0,
    max: patch.flat ?? 0,
    weaponPercent: patch.weaponPercent ?? 1,
    normalized: patch.normalized ?? true,
    spCoefficient: 0,
    takenScale: 0,
    critMultiplier: 2,
    bonusCrit: 0,
    damageMult: 1,
    threatMult: 1,
    threatBonus: 0,
    ranged: true,
    source,
  })
  const row: AbilityPlan = {
    ...CASTER_ROW,
    id: `shot${i}`,
    name: `Shot ${i}`,
    icon: 'x',
    kind: 'spell',
    source,
    costTenths: 0,
    cooldownMs: patch.cooldownMs ?? 0,
    gcdMs: patch.gcdMs ?? 1500,
    castMs: patch.castMs ?? 0,
    offHandSource: -1,
    aura: -1,
    window: -1,
    spell: i,
    ...(patch.castRangedHasted ? { castRangedHasted: true } : {}),
  }
  plan.abilities.push(row)
  return plan.abilities.length - 1
}

/** A plan aura with only the given mods (the engine reads every mod optional or 0). */
export function addPlanAura(plan: Plan, id: string, durationMs: number, mods: Partial<AuraPlan>): number {
  plan.auras.push({
    id,
    name: id,
    icon: 'x',
    durationMs,
    maxStacks: 1,
    whiteSwingCharges: 0,
    critCharges: 0,
    str: 0,
    agi: 0,
    ap: 0,
    apPct: 0,
    crit: 0,
    spellCrit: 0,
    haste: 0,
    damage: 0,
    ...mods,
  })
  return plan.auras.length - 1
}

/** A free, off-GCD `cast` that puts `aura` up. */
export function addCast(plan: Plan, aura: number, cooldownMs = 600000): number {
  plan.sources.push({ id: `cast${plan.abilities.length}`, name: 'Cast', icon: 'x' })
  plan.abilities.push({ ...CASTER_ROW, id: `cast${plan.abilities.length}`, name: 'Cast', icon: 'x', kind: 'cast', source: plan.sources.length - 1, costTenths: 0, cooldownMs, gcdMs: 0, castMs: 0, offHandSource: -1, aura, window: -1 })
  return plan.abilities.length - 1
}

/** A pet with a 2.0-speed swing rolling exactly 50, 280 attack power, no crit, never missing, from behind, inheriting nothing, no power, no abilities. */
export function withPet(plan: Plan, patch: Partial<PetPlan> = {}): Plan {
  plan.sources.push({ id: 'petMelee', name: 'Auto attack', icon: 'x', pet: 'Cat' })
  plan.pet = {
    id: 'cat',
    name: 'Cat',
    icon: 'x',
    level: 60,
    weapon: { min: 50, max: 50, speedSec: 2 },
    skill: 300,
    ap: 280,
    crit: -100,
    auraCrit: 0,
    hit: 100,
    spellDamage: 0,
    spellCrit: 0,
    spellHit: 100,
    inherit: { attackPower: 0, spellDamage: 0, crit: 0, hit: 0 },
    damageMult: 1,
    hasteMult: 1,
    critMultiplier: 2,
    glances: false,
    glanceLow: 1,
    glanceHigh: 1,
    front: false,
    startMs: 0,
    power: null,
    abilities: [],
    rotation: [],
    source: plan.sources.length - 1,
    ...patch,
  }
  plan.fight.bossCanDodge = false
  return plan
}

/** A pet ability: melee, physical, no cost, cooldown or GCD, dealing `min` flat. */
export function addPetAbility(plan: Plan, patch: Partial<PetAbilityPlan> = {}): number {
  const pet = plan.pet!
  plan.sources.push({ id: `pet${pet.abilities.length}`, name: `Pet ${pet.abilities.length}`, icon: 'x', pet: pet.name })
  pet.abilities.push({
    id: `pet${pet.abilities.length}`,
    name: `Pet ${pet.abilities.length}`,
    icon: 'x',
    kind: 'melee',
    school: SCHOOL.physical,
    costTenths: 0,
    cooldownMs: 0,
    gcdMs: 0,
    castMs: 0,
    min: 60,
    max: 60,
    apCoefficient: 0,
    spCoefficient: 0,
    weaponPercent: 0,
    bonusCrit: 0,
    critMultiplier: 2,
    aura: -1,
    source: plan.sources.length - 1,
    ...patch,
  })
  return pet.abilities.length - 1
}

export const petLine = (plan: Plan, ability: number, conditions: RotationCondition[] = []) => plan.pet!.rotation.push({ ability, conditions })
