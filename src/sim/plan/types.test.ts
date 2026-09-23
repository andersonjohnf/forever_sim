// The plan's integer code tables: each is a set of distinct codes, so a renumbering at a merge
// (the parallel tracks each add conditions and triggers) can't give two meanings one code.
import { describe, expect, it } from 'vitest'
import { ACTION, COND, TRIGGER, TRIGGER_COUNT } from './types'

const distinct = (table: Record<string, number>) => new Set(Object.values(table)).size === Object.keys(table).length

describe('the plan’s code tables', () => {
  it.each([
    ['COND', COND],
    ['TRIGGER', TRIGGER],
    ['ACTION', ACTION],
  ] as const)('%s gives each key its own code', (_, table) => {
    expect(distinct(table)).toBe(true)
  })

  it('TRIGGER_COUNT covers every trigger, which index the plan’s trigger lists', () => {
    expect(TRIGGER_COUNT).toBe(Math.max(...Object.values(TRIGGER)) + 1)
  })

  it('the druid’s conditions keep their codes: 13 is executeWithin, resolved into a time window', () => {
    expect([COND.executeWithin, COND.minEnergy, COND.maxEnergy, COND.minComboPoints]).toEqual([13, 14, 15, 16])
  })
})
