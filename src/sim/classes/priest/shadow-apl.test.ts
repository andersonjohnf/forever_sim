// The Shadow Priest's rotation as a priority list (decision D31; docs/classes/priest.md §6 "The
// priority list"): the plans of 200 random setups before the list, which the list's default order
// must give byte for byte.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { SHADOW_OPTIONS } from './shadow'
import { fingerprint, planJson, shadowCases } from './shadow-apl-cases'

describe('the Shadow Priest’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Shadow plays.
    const plans = shadowCases(SHADOW_OPTIONS, 200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover each race's own spells and the mana consumables, on and off.
    const using = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['starshards', 'darkSacrifice', 'majorManaPotion', 'demonicRune', 'powerInfusion', 'vampiricEmbrace', 'innerFocus']) {
      expect(using(id), id).toBeGreaterThan(5)
      expect(using(id), id).toBeLessThan(195)
    }
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })
})
