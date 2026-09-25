// What a talent needs, for the wide Talents tab's detail panel (docs/ux.md "Talents"): the tier gate
// and the arrow, met or not, by the same rules as lockReason (docs/data/talents.md#tier-gates and
// #prerequisite-arrows).
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, type Talent, type TalentData } from '@/data/talents/types'
import { TALENT_DATA } from '@/sim/defaults'
import { canAdd } from './logic'
import { talentNeeds } from './needs'

const find = (data: TalentData, name: string): Talent => data.trees.flatMap((t) => t.talents).find((t) => t.name === name)!
const warrior = TALENT_DATA.warrior

describe('talentNeeds', () => {
  it('a first-tier talent with no arrow needs nothing', () => {
    expect(talentNeeds(warrior, {}, find(warrior, 'Cruelty'))).toEqual([])
  })

  it('counts the tree’s points in the tiers above, capped at the gate, and not another tree’s', () => {
    const unbridled = find(warrior, 'Unbridled Wrath') // Fury tier 2
    const cruelty = find(warrior, 'Cruelty')
    const arms = find(warrior, 'Improved Heroic Strike')
    expect(talentNeeds(warrior, { [cruelty.id]: 4, [arms.id]: 3 }, unbridled)).toEqual([{ text: '5 points in Fury', have: 4, needed: 5, met: false }])
    expect(talentNeeds(warrior, { [cruelty.id]: 5 }, unbridled)).toEqual([{ text: '5 points in Fury', have: 5, needed: 5, met: true }])
  })

  it('lists the arrow’s talent at its rank after the gate (Bloodthirst: 30 in Fury, then Death Wish)', () => {
    const bloodthirst = find(warrior, 'Bloodthirst')
    const fury = decodeTalentCode(warrior, '30305013002-050530035150010051-') // the Fury default
    expect(talentNeeds(warrior, fury, bloodthirst)).toEqual([
      { text: '30 points in Fury', have: 30, needed: 30, met: true },
      { text: '1 point in Death Wish', have: 1, needed: 1, met: true },
    ])
    expect(talentNeeds(warrior, {}, bloodthirst)).toEqual([
      { text: '30 points in Fury', have: 0, needed: 30, met: false },
      { text: '1 point in Death Wish', have: 0, needed: 1, met: false },
    ])
  })

  it('agrees with canAdd under the cap: a talent that can take a first point has every need met, and the reverse', () => {
    // Legal builds with points to spare: none, 14 in Fury, and 22 in Arms.
    for (const code of ['', '-05050103', '30305013002']) {
      const ranks = decodeTalentCode(warrior, code)
      for (const talent of warrior.trees.flatMap((t) => t.talents)) {
        if ((ranks[talent.id] ?? 0) > 0) continue
        expect(talentNeeds(warrior, ranks, talent).every((n) => n.met), `${talent.name} on "${code}"`).toBe(canAdd(warrior, ranks, talent))
      }
    }
  })
})
