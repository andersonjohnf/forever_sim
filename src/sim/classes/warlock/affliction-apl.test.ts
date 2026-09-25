// The Affliction warlock's rotation as a priority list (decision D31; docs/classes/warlock.md §6.2).
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { afflictionCases } from './affliction-apl-cases'
import { fingerprint, planJson } from './apl-cases'
import { AFFLICTION_OPTIONS } from './affliction'

describe('the Affliction warlock’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Affliction plays.
    const plans = afflictionCases(AFFLICTION_OPTIONS, 200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    // They cover Siphon Life on and off.
    const using = plans.filter((p) => p.abilities.some((a) => a.id === 'siphonLife')).length
    expect(using).toBeGreaterThan(40)
    expect(using).toBeLessThan(160)
    expect(hashes).toMatchSnapshot()
  })
})
