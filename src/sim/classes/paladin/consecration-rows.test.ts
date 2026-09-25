// The two Consecration rows, rank 5 and rank 1, which share one cooldown (docs/classes/paladin.md,
// Retribution's rows 7 and 8, Protection's 7 and 7b; docs/ux.md "Rows that share a cooldown"): the
// rule for when the lower row is never cast, proved by sweeping both thresholds in both orders on both
// specs and counting its casts, and the Rotation tab's note, which says so only when it's true.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { Sim } from '../../engine/sim'
import { unusedRotationSettings } from '../../index'
import { buildPlan } from '../../plan/build'
import type { SimConfig, SpecId } from '../../types'
import { defaultAplOrder, moveAplRow } from '../apl'
import {
  CONSECRATION_MOST_COST_TENTHS,
  consecrationFloorTenths,
  lowerConsecrationAlwaysNeverCast,
  lowerConsecrationNeverCast,
  PALADIN_LEAST_MAX_MANA,
} from './consecration-rows'
import { PROTECTION_APL, PROTECTION_IDS } from './protection'
import { RETRIBUTION_APL, RETRIBUTION_IDS } from './retribution'

const SPECS = [
  { spec: 'paladin-retribution' as SpecId, apl: RETRIBUTION_APL, ids: RETRIBUTION_IDS },
  { spec: 'paladin-protection' as SpecId, apl: PROTECTION_APL, ids: PROTECTION_IDS },
]
const THRESHOLDS = [0, 5, 10, 15, 20, 25, 30, 40]
const FIGHTS = 4

/** Each Consecration rank's casts over the first `FIGHTS` fights. */
function consecrations(config: SimConfig) {
  const { plan, sheet } = buildPlan(config)
  const count = { consecration: 0, consecrationRank1: 0 }
  for (let f = 0; f < FIGHTS; f++) {
    const sim = new Sim(plan)
    sim.castTrace = (a) => {
      const id = plan.abilities[a].id
      if (id === 'consecration' || id === 'consecrationRank1') count[id]++
    }
    sim.runFight(f)
  }
  const cost = (id: string) => plan.abilities.find((a) => a.id === id)!.costTenths
  return { count, maxMana: sheet.mana!, rank5Cost: cost('consecration'), rank1Cost: cost('consecrationRank1') }
}

describe('the two Consecration rows', () => {
  it('know the least maximum mana a paladin is simulated with, and rank 5’s most cost', () => {
    // 1,512 base mana and the Undead row's 68 Intellect: 20 + 15 × 48.
    expect(PALADIN_LEAST_MAX_MANA).toBe(2252)
    expect(CONSECRATION_MOST_COST_TENTHS).toBe(5650)
    // Rank 1 below rank 5 from as much mana, or more: never cast whatever the gear and talents only
    // from just over 25% (565 of 2,252 is 25.09%).
    expect(lowerConsecrationAlwaysNeverCast(true, 20, 25)).toBe(false)
    expect(lowerConsecrationAlwaysNeverCast(true, 20, 25.1)).toBe(true)
    expect(lowerConsecrationAlwaysNeverCast(true, 30, 25.1)).toBe(false)
    // Rank 5 below rank 1 from as much mana, or more: never cast, from 0%.
    expect(lowerConsecrationAlwaysNeverCast(false, 0, 0)).toBe(true)
    expect(lowerConsecrationAlwaysNeverCast(false, 10, 5)).toBe(false)
  })

  for (const { spec, apl, ids } of SPECS) {
    it(`are never cast below the other exactly when the rule says so, and the note says so only then (${spec})`, { timeout: 120_000 }, () => {
      const base = defaultConfig(spec)
      const order = defaultAplOrder(apl)
      const rank1First = moveAplRow(apl, order, 'consecrationRank1', order.indexOf('consecration'))!
      const cast: string[] = []
      const noted: string[] = []
      for (const [lowerIsRank1, rotationOrder] of [
        [true, undefined],
        [false, rank1First],
      ] as const) {
        for (const rank5 of THRESHOLDS) {
          for (const rank1 of THRESHOLDS) {
            const config: SimConfig = {
              ...base,
              buffs: { ...base.buffs, enabled: base.buffs.enabled.filter((id) => id !== 'majorManaPotion' && id !== 'demonicRune') },
              rotation: { ...base.rotation, [ids.consecrationMana]: rank5, [ids.consecrationRank1Mana]: rank1 },
              ...(rotationOrder ? { rotationOrder } : {}),
            }
            const { count, maxMana, rank5Cost, rank1Cost } = consecrations(config)
            const floor5 = consecrationFloorTenths(rank5, maxMana, rank5Cost)
            const floor1 = consecrationFloorTenths(rank1, maxMana, rank1Cost)
            const never = lowerIsRank1 ? lowerConsecrationNeverCast(floor5, floor1) : lowerConsecrationNeverCast(floor1, floor5)
            const lower = lowerIsRank1 ? count.consecrationRank1 : count.consecration
            const note = unusedRotationSettings(config)[lowerIsRank1 ? ids.consecrationRank1 : ids.consecration]
            const cell = `${lowerIsRank1 ? 'rank 1' : 'rank 5'} lower, rank 5 from ${rank5}%, rank 1 from ${rank1}%`
            // The rule: never cast exactly when its floor is at least the higher row's. Where it says
            // never, the sweep never casts it.
            if (never) expect(lower, cell).toBe(0)
            // The note, which knows neither the maximum mana nor the talents, only where it's never cast.
            if (note !== undefined) {
              expect(never, cell).toBe(true)
              expect(lowerConsecrationAlwaysNeverCast(lowerIsRank1, lowerIsRank1 ? rank5 : rank1, lowerIsRank1 ? rank1 : rank5), cell).toBe(true)
            }
            if (lower > 0) cast.push(cell)
            if (note !== undefined) noted.push(cell)
          }
        }
      }
      // Not vacuous: rank 1 below rank 5 is cast somewhere in the sweep, with no note there, and the
      // note shows in both orders.
      expect(cast.filter((c) => c.startsWith('rank 1 lower')).length, spec).toBeGreaterThan(10)
      expect(noted.filter((c) => c.startsWith('rank 1 lower')).length, spec).toBeGreaterThan(5)
      expect(noted.filter((c) => c.startsWith('rank 5 lower')).length, spec).toBeGreaterThan(20)
    })
  }

  it('say nothing where the review measured rank 1 cast below rank 5: both from 0%, and Protection from 10%', () => {
    for (const { spec, ids } of SPECS) {
      const base = defaultConfig(spec)
      const buffs = { ...base.buffs, enabled: base.buffs.enabled.filter((id) => id !== 'majorManaPotion' && id !== 'demonicRune') }
      for (const pct of spec === 'paladin-protection' ? [0, 10] : [0]) {
        const config: SimConfig = { ...base, buffs, rotation: { ...base.rotation, [ids.consecrationMana]: pct, [ids.consecrationRank1Mana]: pct } }
        expect(unusedRotationSettings(config), `${spec} ${pct}%`).toEqual({})
        if (pct === 0) expect(consecrations(config).count.consecrationRank1, spec).toBeGreaterThan(0)
      }
    }
  })
})
