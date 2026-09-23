import { describe, expect, it } from 'vitest'
import { defaultConfig, normalizeConfig, type Assumption } from '@/sim'
import { buildPlan } from '@/sim/plan/build'
import type { AssumptionId } from '@/sim/plan/assumptions'
import { ASSUMPTION_GROUP, groupAssumptions, groupTitle } from './assumption-groups'

// Every engine assumption has a group, and every grouped id is one the engine has: `npm run
// typecheck` fails here when src/sim/plan/assumptions.ts gains or loses an id.
type Unmapped = Exclude<AssumptionId, keyof typeof ASSUMPTION_GROUP>
type Unknown = Exclude<keyof typeof ASSUMPTION_GROUP, AssumptionId>
const inStep: [Unmapped, Unknown] extends [never, never] ? true : false = true

const a = (id: string): Assumption => ({ id, text: id, docRef: 'docs/doctrine.md' })

describe('assumption groups', () => {
  it('cover exactly the engine’s assumptions', () => {
    expect(inStep).toBe(true)
  })

  it('put your own choices first, then the class, then the combat rules, the likely bigger ones first inside each', () => {
    const groups = groupAssumptions([a('foreverHitTable'), a('procRates'), a('deepWounds'), a('classicItems'), a('racialWeaponCrit')])
    expect(groups.map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ['gear', ['classicItems', 'procRates']],
      ['character', ['racialWeaponCrit']],
      ['class', ['deepWounds']],
      ['combat', ['foreverHitTable']],
    ])
  })

  it('never drops an assumption it doesn’t know: it goes last in the combat rules', () => {
    expect(groupAssumptions([a('somethingNew'), a('foreverHitTable')])).toEqual([
      { group: 'combat', items: [a('foreverHitTable'), a('somethingNew')] },
    ])
  })

  it('names the class group after the result’s class', () => {
    expect(groupTitle('class', 'warrior')).toBe('Warrior mechanics')
    expect(groupTitle('gear', 'warrior')).toBe('Your gear and consumables')
  })

  it('keeps the damage you set next to the rage it gives, in the class group (UX12)', () => {
    const fury = normalizeConfig(defaultConfig('warrior-fury')).config
    const { assumptions } = buildPlan({ ...fury, fight: { ...fury.fight, damageTakenPerSec: 200 } })
    const group = groupAssumptions(assumptions).find((g) => g.items.some((i) => i.id === 'dpsDamageTaken'))!
    expect(group.group).toBe('class')
    const ids = group.items.map((i) => i.id)
    expect(ids.slice(ids.indexOf('damageTakenRage'), ids.indexOf('damageTakenRage') + 3)).toEqual(['damageTakenRage', 'dpsDamageTaken', 'enrageTrigger'])
  })

  it('puts a druid’s base values with your race and stats, beside the other base values', () => {
    const { assumptions } = buildPlan(normalizeConfig(defaultConfig('druid-feral-cat')).config)
    const groups = groupAssumptions(assumptions)
    expect(groups.find((g) => g.items.some((i) => i.id === 'druidBaseStats'))!.group).toBe('character')
    expect(ASSUMPTION_GROUP.druidBaseStats).toBe(ASSUMPTION_GROUP.unknownBaseAttributes)
  })

  it('groups the default Fury setup’s assumptions without losing any', () => {
    const { assumptions } = buildPlan(normalizeConfig(defaultConfig('warrior-fury')).config)
    const grouped = groupAssumptions(assumptions)
    expect(grouped.flatMap((g) => g.items)).toHaveLength(assumptions.length)
    expect(grouped[0].group).toBe('gear')
  })
})
