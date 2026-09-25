// The Retribution paladin's rotation as a priority list (decision D31; docs/classes/paladin.md
// "Forever priority list (default)"): the default order gives the plans the rotation gave before the
// list.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { fingerprint, planJson } from '../warrior/fury-apl-cases'
import { retributionCases } from './retribution-apl-cases'

describe('Retribution’s priority list (D31)', () => {
  it('gives 200 random setups the plan they had before the list', () => {
    // Settings, talents, race, weapons, trinkets, consumables, phase, creature type and the JotC rule
    // at random, none with a stored order. The snapshot is of the plans before the priority list (A2),
    // taken on that code: a change to it is a change to what the default order plays.
    const plans = retributionCases(200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover both seals, the opener on and off, Exorcism and Hammer of Wrath in and out.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['sealOfCommand', 'sealOfRighteousness', 'sealOfTheCrusader', 'exorcism', 'hammerOfWrath', 'consecrationRank1']) {
      expect(has(id), id).toBeGreaterThan(20)
      expect(has(id), id).toBeLessThan(190)
    }
    expect(hashes).toMatchSnapshot()
  })
})
