// The Enhancement shaman's rotation as a priority list (decision D31; docs/classes/shaman.md
// "Enhancement priority"): the list in its default order plays exactly as the rotation played before it.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { ENHANCEMENT_OPTIONS } from './enhancement'
import { enhancementCases, fingerprint, planJson } from './enhancement-apl-cases'

describe('the Enhancement shaman’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Enhancement plays.
    const plans = enhancementCases(ENHANCEMENT_OPTIONS, 200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover both imbues and Stormstrike on and off.
    const storm = plans.filter((p) => p.abilities.some((a) => a.id === 'stormstrike')).length
    expect(storm).toBeGreaterThan(40)
    expect(storm).toBeLessThan(190)
    const rockbiter = plans.filter((p) => p.abilities.some((a) => a.id.startsWith('rockbiter'))).length
    expect(rockbiter).toBeGreaterThan(20)
    expect(hashes).toMatchSnapshot()
  })
})
