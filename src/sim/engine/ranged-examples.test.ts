// docs/mechanics/ranged-and-pets.md#worked-examples, one test each (doctrine §4: worked examples
// become unit tests). The plans are ranged-helpers.ts's; the item rows are the pool's.
import { describe, expect, it } from 'vitest'
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData } from '@/data/items/types'
import { swingMs } from '../core/formulas'
import { noRangedMods, rangedPlan as rangedFromItem } from '../plan/ranged'
import { COND } from '../plan/types'
import { CLASSIC_ERA } from '../rules/profiles'
import { Sim } from './sim'
import { addCast, addPlanAura, addShot, rangedPlan, withPet } from './ranged-helpers'
import { at, damages, expectMean, line, timeline } from './test-helpers'

const item = (id: number) => (itemJson as unknown as ItemData).items.find((i) => i.id === id) as Item
const BLOODSEEKER = item(19107)

describe('WE-1: an Auto Shot', () => {
  it('Bloodseeker, 17.5 DPS arrows, 1,000 ranged attack power: 399.96 on average, 799.93 a crit', () => {
    const r = rangedFromItem(BLOODSEEKER, 300, { ...noRangedMods(), ammoDps: 17.5 }, 0)!
    const average = (r.min + r.max) / 2 + r.flatDamage + (1000 / 14) * r.speedSec
    expect(average).toBeCloseTo(399.964, 3)
    expect(2 * average).toBeCloseTo(799.93, 2)
    // The engine's shots, over many fights, average the same.
    const plan = rangedPlan(60000, { ...r, source: 0 })
    plan.ranged!.source = plan.sources.findIndex((s) => s.id === 'autoShot')
    plan.stats.rap = 1000
    expectMean(damages(plan, plan.ranged!.source, 200), average)
  })
})

describe('WE-2: the ranged table vs +3 at 300 skill, from behind', () => {
  const table = (profile: typeof CLASSIC_ERA | undefined, hit: number) => {
    const plan = rangedPlan()
    if (profile) plan.profile = profile
    Object.assign(plan.stats, { hit, baseCrit: 5, critPerAgi: 0, crit: 15 })
    const i = new Sim(plan).inspect()
    return { miss: i.rangedThresholds[0], avoidance: i.rangedThresholds[4] - i.rangedThresholds[0], crit: i.rangedCrit }
  }

  it('forever: miss 8%, nothing else before the crit roll, crit 20 − 0.6 − 1.8 = 17.6%; 5% miss with 3% hit', () => {
    const t = table(undefined, 0)
    expect(t.miss).toBeCloseTo(8, 9)
    expect(t.avoidance).toBe(0)
    expect(t.crit).toBeCloseTo(17.6, 9)
    expect(table(undefined, 3).miss).toBeCloseTo(5, 9)
  })

  it('classicEra: miss 8%, crit 20 − 3.0 − 1.8 = 15.2%; 6% miss with 3% hit, its first 1% ignored', () => {
    const t = table(CLASSIC_ERA, 0)
    expect(t.miss).toBeCloseTo(8, 9)
    expect(t.crit).toBeCloseTo(15.2, 9)
    expect(table(CLASSIC_ERA, 3).miss).toBeCloseTo(6, 9)
  })
})

describe('WE-3: clipping', () => {
  const setup = (castAt: number | null) => {
    const plan = rangedPlan(12000, { speedSec: 3.3, hasteMult: 1.15 })
    const aimed = addShot(plan, { castMs: 2000, cooldownMs: 60000, castRangedHasted: true })
    if (castAt !== null) line(plan, aimed, at(plan, castAt))
    return { plan, aimed }
  }

  it('a 2,870 ms cycle; a 1,739 ms Aimed Shot right after a shot delays nothing', () => {
    expect(swingMs(3.3, 1.15)).toBe(2870)
    const { plan } = setup(0)
    expect(timeline(plan).shots.slice(0, 2)).toEqual([0, 2870])
  })

  it('cast at 1,000 it ends at 2,739, and the shot fires at 3,239, 369 ms late', () => {
    const { plan } = setup(1000)
    expect(timeline(plan).shots.slice(0, 2)).toEqual([0, 3239])
  })

  it('autoShotClear allows it only in the first 631 ms after a shot', () => {
    const at631 = (t: number) => {
      const plan = rangedPlan(3000, { speedSec: 3.3, hasteMult: 1.15 })
      const aimed = addShot(plan, { castMs: 2000, cooldownMs: 600000, castRangedHasted: true })
      line(plan, aimed, [...at(plan, t), { code: COND.autoShotClear, a: aimed, b: 0 }])
      return timeline(plan).uses[aimed]
    }
    expect(at631(631)).toEqual([631])
    expect(at631(632)).toEqual([])
  })
})

describe('WE-4: ranged haste stacks', () => {
  it('quiver and Rapid Fire: 3300 / (1.15 × 1.40) = 2,050 ms; with Quick Shots, 1,577 ms', () => {
    expect(swingMs(3.3, 1.15 * 1.4)).toBe(2050)
    expect(swingMs(3.3, 1.15 * 1.4 * 1.3)).toBe(1577)
    const plan = rangedPlan(9000, { speedSec: 3.3, hasteMult: 1.15 })
    line(plan, addCast(plan, addPlanAura(plan, 'rapidFire', 15000, { rangedHaste: 40 })))
    line(plan, addCast(plan, addPlanAura(plan, 'quickShots', 12000, { rangedHaste: 30 })))
    // The pull's shot keeps its 2,870 cycle; the next ones are 1,577.
    expect(timeline(plan).shots).toEqual([0, 2870, 4447, 6024, 7601])
  })
})

describe('WE-5: a pet’s white hit', () => {
  it('42–64 at 2.0 s, 252 attack power, Happy cat (×1.375): 122.375; a crit 244.75; +50% aura 183.5625', () => {
    const plan = withPet(rangedPlan(60000), { weapon: { min: 42, max: 64, speedSec: 2 }, ap: 252, damageMult: 1.25 * 1.1 })
    expectMean(damages(plan, plan.pet!.source, 100), 122.375)
    const crits = withPet(rangedPlan(10000), { weapon: { min: 53, max: 53, speedSec: 2 }, ap: 252, damageMult: 1.25 * 1.1, crit: 200 })
    for (const d of damages(crits, crits.pet!.source, 1)) expect(d).toBeCloseTo(244.75, 9)
    const wrath = withPet(rangedPlan(10000), { weapon: { min: 53, max: 53, speedSec: 2 }, ap: 252, damageMult: 1.25 * 1.1 })
    line(wrath, addCast(wrath, addPlanAura(wrath, 'bestialWrath', 60000, { petDamage: 50 })))
    // Your walk at the pull puts the aura up before the pet's first swing.
    for (const d of damages(wrath, wrath.pet!.source, 1)) expect(d).toBeCloseTo(183.5625, 9)
  })
})
