// The Combat rogue's rotation as a priority list (decision D31; docs/classes/rogue.md §6.1): the list
// in its default order plays exactly as Combat played before it.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { COMBAT_OPTIONS } from './combat'
import { combatCases, fingerprint, planJson } from './combat-apl-cases'

describe('the Combat rogue’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it.
    const plans = combatCases(COMBAT_OPTIONS, 200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover Rupture and Expose Armor on and off, and every plan has a rotation.
    const ruptures = plans.filter((p) => p.abilities.some((a) => a.id === 'rupture')).length
    expect(ruptures).toBeGreaterThan(30)
    expect(ruptures).toBeLessThan(170)
    const exposes = plans.filter((p) => p.abilities.some((a) => a.id === 'exposeArmor')).length
    expect(exposes).toBeGreaterThan(30)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })
})
