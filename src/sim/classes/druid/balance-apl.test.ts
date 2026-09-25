// Balance's rotation as a priority list (decision D31; docs/classes/druid.md §11.5 "Balance's
// priority list"): the default order plays exactly as Balance played before the list.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { planJson } from '../warrior/fury-apl-cases'
import { BALANCE_OPTIONS } from './balance'
import { balanceCases, fingerprint } from './balance-apl-cases'

describe('Balance’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it:
    // a change to it is a change to what the default order plays.
    const cases = balanceCases(BALANCE_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover the potion, Power Infusion, Faerie Fire and Insect Swarm each on and off, and a rotation each.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['majorManaPotion', 'powerInfusion', 'faerieFire', 'insectSwarm']) {
      expect(has(id), id).toBeGreaterThan(20)
      expect(has(id), id).toBeLessThan(190)
    }
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })
})
