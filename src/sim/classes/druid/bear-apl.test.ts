// The Feral bear's rotation as a priority list (decision D31; docs/classes/druid.md §6.3 "The
// priority list"): Defensive and Max TPS play exactly as the bear played them before the list.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { BEAR_OPTIONS } from './bear'
import { bearCases, fingerprint } from './bear-apl-cases'

describe('the Feral bear’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list, with Defensive or Max TPS', () => {
    // The snapshot is of the plans before the priority list (A2), whole: a change to it is a change
    // to what Defensive or Max TPS plays.
    const cases = bearCases(BEAR_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(JSON.stringify(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover the roar on and off, and a rotation each.
    const roars = plans.filter((p) => p.abilities.some((a) => a.id === 'demoralizingRoar')).length
    expect(roars).toBeGreaterThan(40)
    expect(roars).toBeLessThan(160)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })
})
