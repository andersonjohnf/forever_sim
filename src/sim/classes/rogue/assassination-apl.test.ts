// The Assassination rogue's rotation as a priority list (decision D31; docs/classes/rogue.md §6.2):
// the list in its default order plays exactly as Assassination played before it.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { ASSASSINATION_OPTIONS } from './assassination'
import { assassinationCases } from './assassination-apl-cases'
import { fingerprint, planJson } from './combat-apl-cases'

describe('the Assassination rogue’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it.
    const plans = assassinationCases(ASSASSINATION_OPTIONS, 200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover Mutilate and Sinister Strike, Venom and Cold Blood.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    expect(has('mutilate')).toBeGreaterThan(30)
    expect(has('sinisterStrike')).toBeGreaterThan(30)
    expect(has('venom')).toBeGreaterThan(20)
    expect(has('coldBlood')).toBeGreaterThan(30)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })
})
