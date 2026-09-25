// The mage's rotations as priority lists (decision D31; docs/classes/mage.md "Fire priority list",
// "Frost priority list", "Arcane priority list"): each spec's default order plays exactly as the
// mage played before the list.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { MAGE_OPTIONS } from './rotation'
import { fingerprint, mageCases, type MageSpecId, planJson } from './mage-apl-cases'

const SPECS: [MageSpecId, keyof typeof MAGE_OPTIONS][] = [
  ['mage-fire', 'fire'],
  ['mage-frost', 'frost'],
  ['mage-arcane', 'arcane'],
]

describe.each(SPECS)('the %s priority list (D31)', (spec, key) => {
  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what the default order plays.
    const plans = mageCases(spec, MAGE_OPTIONS[key], 200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    // They cover Evocation on and off, and the mana gems on and off.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['evocation', 'manaRuby']) {
      expect(has(id), id).toBeGreaterThan(40)
      expect(has(id), id).toBeLessThan(180)
    }
    expect(hashes).toMatchSnapshot()
  })
})
