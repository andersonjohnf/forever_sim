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

  it('17 is abilityAuraDown, the cat’s, and Retribution’s when it comes: the aura an ability puts on the player is down', () => {
    expect(COND.abilityAuraDown).toBe(17)
  })

  it('the paladin’s codes follow: minMana 18, with 19 kept free for maxMana', () => {
    expect(COND.minMana).toBe(18)
    const conditions: number[] = Object.values(COND)
    expect(conditions).not.toContain(19)
    // After the tank core's boss-swing triggers (8–11): the seals' swing trigger and Vengeance's spell crits.
    expect([TRIGGER.dodge, TRIGGER.parry, TRIGGER.meleeTaken, TRIGGER.critTaken, TRIGGER.whiteResolved, TRIGGER.spellCrit]).toEqual([8, 9, 10, 11, 12, 13])
    expect(TRIGGER_COUNT).toBe(14)
    expect([ACTION.spell, ACTION.mana]).toEqual([5, 6])
  })

  it('executeWithin’s opposite, executeNotWithin (Fury’s potion, M2.5b), takes 29, after the codes the other tracks hold', () => {
    expect(COND.executeNotWithin).toBe(29)
  })
})
