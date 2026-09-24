// The Protection paladin's rotation as a priority list (decisions D28, D31; docs/classes/paladin.md
// "Forever priority list (default)"): Defensive and Max TPS give the plans they gave before the list.
import { describe, expect, it } from 'vitest'
import { buildPlan } from '../../plan/build'
import { fingerprint } from '../warrior/fury-apl-cases'
import { PROTECTION_IDS as ID, PROTECTION_OPTIONS } from './protection'
import { protectionCases } from './protection-apl-cases'

describe('Protection paladin’s priority list (D31)', () => {
  it('gives 200 random Defensive and Max TPS setups the plan they had before the list', () => {
    // Settings, talents, race, weapons, shield, trinkets, consumables, phase, creature type and
    // rules at random, the priority always set to one of the two rotations there were. The snapshot
    // is of the plans before the priority list (A2), taken on that code: a change to it is a change
    // to what Defensive or Max TPS plays.
    const hashes = protectionCases(PROTECTION_OPTIONS, ID.priority, 200).map((config) => fingerprint(JSON.stringify(buildPlan(config).plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    expect(hashes).toMatchSnapshot()
  })
})
