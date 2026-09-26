// The gear search end to end on the real engine, on a tiny budget (docs/optimizer.md#gear).
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../defaults'
import type { GearSlot, SimConfig } from '../types'
import { localFightRunner } from './fights'
import { gearContext, type Gear, POOL, SEARCHED_SLOTS, slotPool } from './gear'
import { type GearSearchOptions, optimizeGear } from './gear-search'
import { gearKey } from './optimize'

const OPEN: GearSlot[] = ['head', 'neck', 'finger1', 'finger2']

/** Fury with the lowest-level item the pool has in each open slot: a deliberately bad set. */
function badFury(): SimConfig {
  const config: SimConfig = { ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 0, seed: 7 } }
  const ctx = gearContext(config)
  const gear: Gear = { ...config.gear }
  const worst = (slot: GearSlot, not?: number) =>
    slotPool(ctx, slot)
      .filter((i) => i.id !== not)
      .sort((a, b) => a.itemLevel - b.itemLevel || a.id - b.id)[0]
  for (const slot of OPEN) gear[slot] = { itemId: worst(slot, slot === 'finger2' ? gear.finger1!.itemId : undefined).id }
  return { ...config, gear }
}

const search = (config: SimConfig, extra: Partial<GearSearchOptions> = {}) =>
  optimizeGear({
    config,
    filters: { locked: SEARCHED_SLOTS.filter((s) => !OPEN.includes(s)) },
    budget: { fights: 24_000 },
    runner: localFightRunner(),
    restarts: false,
    passes: 2,
    perSlot: 3,
    enchantsPerItem: 1,
    weightFights: 40,
    measureFights: 20,
    ...extra,
  })

describe('the gear search', () => {
  it('improves a bad set, within its budget, the same for a seed', { timeout: 120_000 }, async () => {
    const config = badFury()
    const a = await search(config)
    expect(a.answer).not.toBeNull()
    const answer = a.answer!.gear!
    // Something open changed, and nothing locked did.
    expect(OPEN.some((s) => answer[s]?.itemId !== config.gear[s]?.itemId)).toBe(true)
    for (const slot of SEARCHED_SLOTS.filter((s) => !OPEN.includes(s))) expect(answer[slot]).toEqual(config.gear[slot])
    // Clearly better than the bad set it started from, paired on the same fights.
    const leader = a.final!.race.standings.find((s) => s.candidate === a.final!.race.leader)!
    expect(leader.vsBaseline.score.mean - leader.vsBaseline.score.halfWidth).toBeGreaterThan(0)
    // The new items are the better ones: each open slot's item level went up.
    for (const slot of OPEN) if (answer[slot]?.itemId !== config.gear[slot]?.itemId) expect(POOL.get(answer[slot]!.itemId)!.itemLevel).toBeGreaterThan(POOL.get(config.gear[slot]!.itemId)!.itemLevel)
    expect(a.fights).toBeLessThanOrEqual(24_000)
    // Deterministic: the same inputs and seed give the same answer and the same fights.
    const b = await search(config)
    expect(gearKey(b.answer!.gear!)).toBe(gearKey(answer))
    expect(b.fights).toBe(a.fights)
    expect(b.starts[0].steps.map((s) => [s.group, s.changed, s.fights])).toEqual(a.starts[0].steps.map((s) => [s.group, s.changed, s.fights]))
  })
})
