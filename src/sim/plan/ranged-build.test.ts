// The plan builder's ranged weapon and pet (docs/mechanics/ranged-and-pets.md §12): rangedPlan,
// petPlan, and buildPlan for a spec marked `ranged`. No shipped spec is ranged or has a pet yet, so the
// buildPlan cases mark one for the test and put it back.
import { afterEach, describe, expect, it } from 'vitest'
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData } from '@/data/items/types'
import { BUFFS_BY_ID } from '../effects/buffs'
import { catalogueEffects } from '../effects/types'
import { defaultConfig } from '../defaults'
import { Sim } from '../engine/sim'
import { PROFILES } from '../rules/profiles'
import { SPEC_META } from '../specs'
import { buildPlan } from './build'
import { type PetDef, petPlan } from './pet'
import { AUTO_SHOT, noRangedMods, rangedPlan } from './ranged'
import { type AuraPlan, SCHOOL, type SourcePlan } from './types'

const item = (id: number) => (itemJson as unknown as ItemData).items.find((i) => i.id === id) as Item
/** Bloodseeker, a Forever crossbow: 85–128 at 3.3 (the pool's row). */
const BLOODSEEKER = 19107

describe('rangedPlan (§2–§4)', () => {
  it('the weapon’s roll and speed, the ammo’s DPS × its speed and a scope’s damage per shot, the quiver’s haste', () => {
    const r = rangedPlan(item(BLOODSEEKER), 300, { ...noRangedMods(), ammoDps: 17.5, flatDamage: 7, hasteMult: 1.15, hit: 3 }, 5)!
    expect([r.min, r.max, r.speedSec]).toEqual([85, 128, 3.3])
    expect(r.flatDamage).toBeCloseTo(7 + 17.5 * 3.3, 9)
    expect(r.hasteMult).toBe(1.15)
    expect(r.hitBonus).toBe(3)
    expect(r.source).toBe(5)
    expect([r.windupMs, r.windupHasted, r.castsHoldAutoShot, r.normalizedSpeed, r.critMultiplier]).toEqual([
      AUTO_SHOT.windupMs,
      AUTO_SHOT.windupHasted,
      AUTO_SHOT.castsHoldAutoShot,
      AUTO_SHOT.normalizedSpeed,
      AUTO_SHOT.critMultiplier,
    ])
  })

  it('none for a wand, a relic or nothing: only bows, guns, crossbows and thrown weapons fire Auto Shot', () => {
    const wand = (itemJson as unknown as ItemData).items.find((i) => i.weaponType === 'wand')!
    expect(rangedPlan(wand, 300, noRangedMods(), 0)).toBeNull()
    expect(rangedPlan(undefined, 300, noRangedMods(), 0)).toBeNull()
  })
})

describe('buildPlan for a ranged spec (§12)', () => {
  const meta = SPEC_META['warrior-fury']
  afterEach(() => {
    delete meta.ranged
  })

  const config = () => {
    const d = defaultConfig('warrior-fury')
    return { ...d, gear: { ...d.gear, ranged: { itemId: BLOODSEEKER } } }
  }

  it('its plan has the ranged weapon as Auto Shot, on its own row, and no melee swings', () => {
    meta.ranged = true
    const { plan } = buildPlan(config())
    expect(plan.weapons).toEqual([null, null])
    expect(plan.ranged?.name).toBe('Bloodseeker')
    expect(plan.sources[plan.ranged!.source].id).toBe('autoShot')
    // Crossbow skill: 300 with no bonus.
    expect(plan.ranged!.skill).toBe(300)
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(sim.counters[plan.ranged!.source * 10]).toBeGreaterThan(0)
  })

  it('a spec that isn’t ranged gets none, whatever is in its ranged slot', () => {
    expect(buildPlan(config()).plan.ranged).toBeUndefined()
  })

  it('an item’s ranged attack power goes to the stat block’s, which only a ranged plan reads', () => {
    meta.ranged = true
    const d = config()
    const withBracers = buildPlan({ ...d, gear: { ...d.gear, wrist: { itemId: 18508 } } })
    const without = buildPlan({ ...d, gear: { ...d.gear, wrist: undefined } })
    expect(withBracers.plan.stats.rap - without.plan.stats.rap).toBe(41)
    expect(new Sim(withBracers.plan).inspect().rangedAttackPower - new Sim(without.plan).inspect().rangedAttackPower).toBe(41)
  })
})

describe('petPlan (§6–§8)', () => {
  const cat: PetDef = {
    id: 'cat',
    name: 'Cat',
    icon: 'ability_hunter_pet_cat',
    level: 60,
    weapon: { min: 42, max: 64, speedSec: 2 },
    stats: { baseStr: 136, baseAgi: 100, baseAp: -20, apPerStr: 2, baseCrit: 0, critPerAgi: 0.05 },
    damageMult: 1.1 * 1.25,
    glances: true,
    front: false,
    power: { kind: 'focus', maxTenths: 1000, startTenths: 1000, tickTenths: 50, tickMs: 1000 },
    abilities: [
      { id: 'claw', name: 'Claw', icon: 'ability_druid_rake', kind: 'melee', school: 'physical', costTenths: 250, cooldownMs: 0, gcdMs: 1500, castMs: 0, min: 43, max: 59, apCoefficient: 0, spCoefficient: 0, weaponPercent: 0, bonusCrit: 0, critMultiplier: 2 },
      {
        id: 'furiousHowl',
        name: 'Furious Howl',
        icon: 'ability_hunter_pet_wolf',
        kind: 'melee',
        school: 'physical',
        costTenths: 600,
        cooldownMs: 30000,
        gcdMs: 1500,
        castMs: 0,
        min: 0,
        max: 0,
        apCoefficient: 0,
        spCoefficient: 0,
        weaponPercent: 0,
        bonusCrit: 0,
        critMultiplier: 2,
        aura: { id: 'furiousHowl', name: 'Furious Howl', durationMs: 60000, mods: { ap: 136, petAp: 136 } },
      },
    ],
    rotation: [{ ability: 0, conditions: [] }],
  }
  const auras: AuraPlan[] = []
  const auraIndex = (spec: { id: string; name: string; durationMs: number }) => {
    auras.push({ id: spec.id, name: spec.name, icon: 'x', durationMs: spec.durationMs, maxStacks: 1, whiteSwingCharges: 0, critCharges: 0, str: 0, agi: 0, ap: 0, apPct: 0, crit: 0, spellCrit: 0, haste: 0, damage: 0 })
    return auras.length - 1
  }

  it('derives its stats through the stat pipeline: AP = base + 2 × Strength, crit from Agility; its rows name it', () => {
    const sources: SourcePlan[] = []
    const pet = petPlan(cat, [], PROFILES.forever, 63, sources, auraIndex)
    expect(pet.ap).toBe(-20 + 2 * 136)
    expect(pet.crit).toBeCloseTo(100 * 0.05, 9)
    expect(pet.skill).toBe(300)
    expect(pet.damageMult).toBeCloseTo(1.375, 9)
    // Its white swings glance at 300 skill vs 63: the profile's range (combat-tables §2.3).
    expect([pet.glanceLow, pet.glanceHigh]).toEqual([0.65, 0.85])
    expect(sources.map((s) => [s.id, s.pet])).toEqual([
      ['cat.melee', 'Cat'],
      ['cat.claw', 'Cat'],
      ['cat.furiousHowl', 'Cat'],
    ])
    expect(pet.abilities.map((a) => [a.school, a.source, a.aura])).toEqual([
      [SCHOOL.physical, 1, -1],
      [SCHOOL.physical, 2, auras.length - 1],
    ])
  })

  it('a buff that reaches it adds to its stats: Battle Shout’s attack power (§8)', () => {
    const shout = catalogueEffects(BUFFS_BY_ID.get('battleShout')!, PROFILES.forever)
    const ap = shout.find((e) => e.kind === 'stat' && e.stat === 'ap')
    expect(ap).toBeDefined()
    const pet = petPlan(cat, shout, PROFILES.forever, 63, [], auraIndex)
    expect(pet.ap).toBe(-20 + 2 * 136 + (ap as { value: number }).value)
  })

  it('without glancing, a range of 1 (§6)', () => {
    const pet = petPlan({ ...cat, glances: false }, [], PROFILES.forever, 63, [], auraIndex)
    expect([pet.glanceLow, pet.glanceHigh]).toEqual([1, 1])
  })
})
