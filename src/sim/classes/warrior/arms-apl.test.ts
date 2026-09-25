// Arms' rotation as a priority list (decision D31; docs/classes/warrior.md §5.3 "The priority
// list"): the default order gives every setup the plan it had before the list.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { ARMS_OPTIONS } from './arms'
import { armsCases, fingerprint } from './arms-apl-cases'
import { planJson } from './fury-apl-cases'

describe('Arms’ priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Arms plays.
    const plans = armsCases(ARMS_OPTIONS, 200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover each stance, Death Wish, Spearing Strike, the potion and the Whirlwind dance.
    const using = (id: string) => plans.filter((p) => p.rotation.some((e) => p.abilities[e.ability].id === id)).length
    for (const id of ['deathWish', 'spearingStrike', 'mightyRagePotion', 'whirlwind', 'rend', 'overpower', 'heroicStrike', 'execute']) {
      expect(using(id), id).toBeGreaterThan(15)
      expect(using(id), id).toBeLessThan(195)
    }
    expect(hashes).toMatchSnapshot()
  })
})
