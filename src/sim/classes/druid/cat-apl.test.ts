// The Feral cat's rotation as a priority list (decision D31; docs/classes/druid.md §6.2 "The
// priority list"): the default order plays exactly as the cat played before the list.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { planJson } from '../warrior/fury-apl-cases'
import { CAT_OPTIONS } from './cat'
import { catCases, fingerprint } from './cat-apl-cases'

describe('the Feral cat’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it:
    // a change to it is a change to what the default order plays.
    const cases = catCases(CAT_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover Rake, Claw and Berserk each on and off, and a rotation each. Every druid has Omen of
    // Clarity in Forever (druid.md §2.7), so every plan has Clearcasting.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['rake', 'claw', 'berserk']) {
      expect(has(id), id).toBeGreaterThan(20)
      expect(has(id), id).toBeLessThan(190)
    }
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })
})
