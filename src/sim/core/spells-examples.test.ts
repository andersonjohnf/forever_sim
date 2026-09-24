// docs/mechanics/spells.md "Worked examples": the caster core's rules as numbers. The engine's
// side of examples 2, 3, 6 and 11 (a binary spell's resists, a partial resist, a hasted cast,
// clipping) is in engine/caster.test.ts.
import { describe, expect, it } from 'vitest'
import { schoolPlan } from '../plan/build'
import { SCHOOL } from '../plan/types'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import { averageResist, levelResistance, spellMiss } from './attack-table'
import { castTimeCoefficient, hastedCastMs, spellCritMultiplier, spiritRegenTickTenths } from './formulas'

const RESIST = averageResist(levelResistance(63, 60), 60)

describe('docs/mechanics/spells.md worked examples', () => {
  it('1: 17% miss with no hit, 8% with 9%, and 0% (forever) or 1% (classicEra) at 17%', () => {
    expect(spellMiss(FOREVER, 60, 63, 0)).toBe(17)
    expect(spellMiss(FOREVER, 60, 63, 9)).toBe(8)
    expect(spellMiss(FOREVER, 60, 63, 17)).toBe(0)
    expect(spellMiss(CLASSIC_ERA, 60, 63, 17)).toBe(1)
    expect(spellMiss(CLASSIC_ERA, 60, 63, 16)).toBe(1)
  })

  it('2: a binary spell with no hit is resisted whole 21.98% of the time', () => {
    const miss = spellMiss(FOREVER, 60, 63, 0)
    expect(miss + (100 - miss) * RESIST).toBeCloseTo(21.98, 10)
  })

  it('3: a 1,000-damage Fire spell lands for 940 on average', () => {
    expect(levelResistance(63, 60)).toBe(24)
    expect(1000 * (1 - RESIST)).toBeCloseTo(940, 10)
  })

  it('4: the cast-time rule: 0.857 at 3 s, 0.429 at 1.5 s and instant, 1.0 at 4 s; Frostbolt 0.814', () => {
    expect(castTimeCoefficient(3000)).toBeCloseTo(0.857, 3)
    expect(castTimeCoefficient(1500)).toBeCloseTo(0.429, 3)
    expect(castTimeCoefficient(0)).toBe(castTimeCoefficient(1500))
    expect(castTimeCoefficient(4000)).toBe(1)
    expect(castTimeCoefficient(3000) * 0.95).toBeCloseTo(0.814, 3)
  })

  it('5: 500 + 0.857 × 600, with Curse of the Elements and the average resist: 1,048.68; ×1.5 and ×2 on a crit', () => {
    const hit = (500 + 0.857 * 600) * 1.1 * (1 - RESIST)
    expect(hit).toBeCloseTo(1048.68, 2)
    expect(hit * spellCritMultiplier()).toBeCloseTo(1573.02, 2)
    expect(hit * spellCritMultiplier(100)).toBeCloseTo(2097.37, 2)
  })

  it('6: 3 s with Mind Quickening is 2,256 ms, 2.5 s with Berserking 2,273 ms, 1.5 s with it 1,128 ms', () => {
    expect(hastedCastMs(3000, 1.33)).toBe(2256)
    expect(hastedCastMs(2500, 1.1)).toBe(2273)
    expect(hastedCastMs(1500, 1.33)).toBe(1128)
  })

  it('7: Forever’s Corruption row with 500 Shadow spell damage ticks for 162.62, 975.72 in all, 243.93 on a crit', () => {
    const tick = (73 + 0.2 * 500) * (1 - RESIST)
    expect(tick).toBeCloseTo(162.62, 10)
    expect(6 * tick).toBeCloseTo(975.72, 10)
    expect(tick * spellCritMultiplier()).toBeCloseTo(243.93, 10)
  })

  it('8: 200 Spirit: 63 a tick for a mage or priest, 58 for a warlock, 55 for a druid, shaman or paladin; 31.5 with Mage Armor inside the rule', () => {
    expect(spiritRegenTickTenths(200, 'mage')).toBe(630)
    expect(spiritRegenTickTenths(200, 'priest')).toBe(630)
    expect(spiritRegenTickTenths(200, 'warlock')).toBe(580)
    expect(['druid', 'shaman', 'paladin'].map((c) => spiritRegenTickTenths(200, c as 'druid'))).toEqual([550, 550, 550])
    expect(spiritRegenTickTenths(200)).toBe(550)
    expect(spiritRegenTickTenths(200, 'mage') * 0.5).toBe(315)
  })

  it('9: ×1.5, ×1.8 with Ice Shards 3/5, ×2 with 5/5', () => {
    expect([spellCritMultiplier(), spellCritMultiplier(60), spellCritMultiplier(100)].map((x) => Math.round(x * 1e9) / 1e9)).toEqual([1.5, 1.8, 2])
  })

  it('10: Curse of the Elements leaves a boss at 24; 10 penetration 14; 40 penetration −16 in forever (×1.04), 0 in classicEra', () => {
    const coe = { damage: Array(7).fill(1), taken: Array(7).fill(1.1), crit: Array(7).fill(0), resistance: [-75, -75, -75, -75, -75, -75, 0] }
    const fire = (pen: number, profile = FOREVER) => schoolPlan(coe, pen, 63, profile)!.resistance[SCHOOL.fire]
    for (const profile of [FOREVER, CLASSIC_ERA]) expect(fire(0, profile)).toBe(24)
    expect(fire(10)).toBe(14)
    expect(averageResist(fire(10), 60)).toBeCloseTo(0.035, 12)
    expect(fire(40)).toBe(-16)
    expect(1 - averageResist(fire(40), 60)).toBeCloseTo(1.04, 12)
    expect(fire(40, CLASSIC_ERA)).toBe(0)
    // Holy and physical have none; the plain schools make no plan at all.
    expect(schoolPlan(coe, 0, 63, FOREVER)!.resistance.slice(5)).toEqual([0, 0])
    const plain = { damage: Array(7).fill(1), taken: Array(7).fill(1), crit: Array(7).fill(0), resistance: Array(7).fill(0) }
    expect(schoolPlan(plain, 0, 63, FOREVER)).toBeUndefined()
  })
})
