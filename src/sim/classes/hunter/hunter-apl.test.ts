// The hunters' rotation as a priority list (decision D31; docs/classes/hunter.md §8 "The priority
// list"): each spec plays exactly as it played before the list.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { fingerprint, hunterCases, planJson } from './hunter-apl-cases'
import { HUNTER_SPECS } from './rotation'

describe('the hunters’ priority list (D31)', () => {
  for (const spec of HUNTER_SPECS) {
    it(`gives 200 random ${spec} setups the plan they had before the list`, () => {
      // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
      // it: a change to it is a change to what the spec plays.
      const plans = hunterCases(spec, 200).map((config) => buildPlan(config).plan)
      const hashes = plans.map((plan) => fingerprint(planJson(plan)))
      expect(new Set(hashes).size).toBeGreaterThan(150)
      // They cover a pet and none, each shot on the shared cooldown, the mana consumables and a rotation each.
      const pets = plans.filter((p) => p.pet !== undefined).length
      expect(pets).toBeGreaterThan(20)
      expect(pets).toBeLessThan(180)
      for (const id of ['aimedShot', 'multiShot', 'arcaneShot', 'serpentSting', 'rapidFire', 'majorManaPotion', 'demonicRune']) {
        expect(plans.filter((p) => p.abilities.some((a) => a.id === id)).length, id).toBeGreaterThan(10)
      }
      for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
      expect(hashes).toMatchSnapshot()
    }, 30_000)
  }
})
