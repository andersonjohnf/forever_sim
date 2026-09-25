// The Elemental shaman's rotation as a priority list (decision D31; docs/classes/shaman.md
// "Elemental priority"): the list in its default order plays exactly as the rotation played before it.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { ELEMENTAL_OPTIONS } from './elemental'
import { elementalCases, fingerprint, planJson } from './elemental-apl-cases'

describe('the Elemental shaman’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Elemental plays.
    const plans = elementalCases(ELEMENTAL_OPTIONS, 200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover Lava Burst, Mana Tide, rank 4 Lightning Bolt and Chain Lightning on and off.
    const count = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['lavaBurst', 'manaTideTotem', 'lightningBoltRank4', 'chainLightning', 'flameShock']) {
      expect(count(id), id).toBeGreaterThan(20)
      expect(count(id), id).toBeLessThan(195)
    }
    expect(hashes).toMatchSnapshot()
  })
})
