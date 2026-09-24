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

  it('17 is abilityAuraDown, the cat’s and Retribution’s: the aura an ability puts up is down', () => {
    expect(COND.abilityAuraDown).toBe(17)
  })

  it('the paladin’s codes follow: minMana 18, maxMana 19', () => {
    expect([COND.minMana, COND.maxMana]).toEqual([18, 19])
    // After the tank core's boss-swing triggers (8–11): the seals' swing trigger and Vengeance's spell crits.
    expect([TRIGGER.dodge, TRIGGER.parry, TRIGGER.meleeTaken, TRIGGER.critTaken, TRIGGER.whiteResolved, TRIGGER.spellCrit]).toEqual([8, 9, 10, 11, 12, 13])
    expect([ACTION.spell, ACTION.mana]).toEqual([5, 6])
  })

  it('the bear’s stack condition is Warrior Protection’s, at 20', () => {
    expect(COND.abilityAuraStacksBelow).toBe(20)
  })

  it('executeWithin’s opposite, executeNotWithin (Fury’s potion, M2.5b), takes 29, after the codes the other tracks hold', () => {
    expect(COND.executeNotWithin).toBe(29)
  })

  it('the Protection paladin adds no condition or trigger, and one proc action: manaFlat 7 (Improved Seal of Fury)', () => {
    expect(ACTION.manaFlat).toBe(7)
  })

  it('the rogue’s codes (R1): maxComboPoints takes 30, the first of its 30–33, and ACTION 8, after manaFlat, is Deadly Poison’s stackingDot', () => {
    expect(COND.maxComboPoints).toBe(30)
    expect(ACTION.stackingDot).toBe(8)
    // The mage's actions sit at 20 and up (below).
    expect(Math.max(...Object.values(ACTION).filter((code) => code < 20))).toBe(8)
  })

  it('the mage’s codes (docs/classes/mage.md): conditions auraStacksBelow 42 and auraEndsWithin 43, actions ignite 20 and manaOfCost 21, past the ranges the other tracks hold', () => {
    expect([COND.auraStacksBelow, COND.auraEndsWithin]).toEqual([42, 43])
    expect([ACTION.ignite, ACTION.manaOfCost]).toEqual([20, 21])
  })

  it('the shaman’s auraStacksAtLeast (Lightning Bolt at 5 Maelstrom Weapon stacks) takes 34: 30–33 are the Rogue track’s', () => {
    expect(COND.auraStacksAtLeast).toBe(34)
    // No other condition sits in the Rogue's range yet, whichever track merges first.
    for (const [key, code] of Object.entries(COND)) if (code >= 30 && code <= 33) expect(key).not.toBe('auraStacksAtLeast')
  })

  it('the caster core’s codes (docs/mechanics/spells.md §10, §11): triggers spellLanded 20 and spellTick 21, past the 14–19 the other tracks hold, and condition auraUp 38', () => {
    expect([TRIGGER.spellLanded, TRIGGER.spellTick]).toEqual([20, 21])
    // The ranged and pet core's triggers follow them (below).
    expect(TRIGGER_COUNT).toBeGreaterThanOrEqual(22)
    expect(COND.auraUp).toBe(38)
  })

  it('the Shadow Priest’s code (K4): abilityReady takes 50, the first of its 50–53, and adds no trigger or action', () => {
    expect(COND.abilityReady).toBe(50)
    for (const [key, code] of Object.entries(COND)) if (code >= 50 && code <= 53) expect(key).toBe('abilityReady')
  })

  it('the ranged and pet core’s codes (docs/mechanics/ranged-and-pets.md §9, §11): conditions 62–65, triggers 22–26 and action petPower 22, past main’s highest', () => {
    expect([COND.autoShotClear, COND.autoShotWithin, COND.petPowerAtLeast, COND.petPowerAtMost]).toEqual([62, 63, 64, 65])
    expect([TRIGGER.rangedLanded, TRIGGER.autoShotLanded, TRIGGER.rangedCrit, TRIGGER.petLanded, TRIGGER.petCrit]).toEqual([22, 23, 24, 25, 26])
    expect(TRIGGER_COUNT).toBe(27)
    expect(ACTION.petPower).toBe(22)
  })
})
