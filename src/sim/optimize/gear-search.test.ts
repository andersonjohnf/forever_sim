// The gear search end to end on the real engine, on a tiny budget (docs/optimizer.md#gear).
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../defaults'
import type { GearSlot, SimConfig } from '../types'
import { localFightRunner, SearchTooLargeError } from './fights'
import { gearContext, type Gear, groupGears, POOL, SEARCHED_SLOTS, slotPool } from './gear'
import { decodeTalentCode, talentsInCodeOrder } from '@/data/talents/types'
import { TALENT_DATA } from '../defaults'
import { type GearSearchOptions, gearPools, MIN_RANK_FIGHTS, optimizeGear, optimizeTogether, rankGear, rankingPlans } from './gear-search'
import { gearKey, setupCandidate } from './optimize'

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

describe('talents, gear and rotation together', () => {
  it('passes each answer on, and stops when a cycle moves nothing', { timeout: 120_000 }, async () => {
    // Fury, every default talent kept but Deep Wounds and Impale, so the talent space is small.
    const config = badFury()
    const data = TALENT_DATA.warrior
    const ranks = decodeTalentCode(data, config.talents)
    const keep = Object.fromEntries(
      talentsInCodeOrder(data)
        .flat()
        .filter((t) => (ranks[t.id] ?? 0) > 0 && t.name !== 'Deep Wounds' && t.name !== 'Impale')
        .map((t) => [t.name, ranks[t.id]]),
    )
    const passes = await optimizeTogether({
      config,
      talents: { keep, screenFights: 10 },
      filters: { locked: SEARCHED_SLOTS.filter((s) => !OPEN.includes(s)) },
      gearOptions: { restarts: false, passes: 1, perSlot: 2, enchantsPerItem: 1, weightFights: 30, measureFights: 20 },
      budget: { fights: 6_000 },
      maxFights: 200_000,
      runner: localFightRunner(),
      cycles: 2,
    })
    expect(passes[0].kind).toBe('talents')
    expect(passes[1].kind).toBe('gear')
    // The gear pass searched gear with the talent pass's answer.
    expect(passes[1].answer!.talents).toBe(passes[0].answer!.talents)
    // A pass after the first starts where the last ended, so its answer keeps what that one found.
    const gear = passes[1].answer!.gear!
    if (passes[2]) expect(passes[2].answer!.gear).toEqual(gear)
    // It stops on a whole cycle with nothing moved, or when the cycles run out.
    expect(passes.length).toBeLessThanOrEqual(4)
    expect(passes.reduce((n, p) => n + p.report.fights, 0)).toBeLessThanOrEqual(200_000)
  })
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

describe('a pair with one slot locked (O2L-2)', () => {
  it('is ranked through the other slot, and its step races', { timeout: 120_000 }, async () => {
    const config: SimConfig = { ...defaultConfig('warrior-protection'), run: { mode: 'fixed', iterations: 0, seed: 1 } }
    for (const lock of ['trinket1', 'finger1', 'trinket2'] as const) {
      const ctx = gearContext(config, { locked: [lock] })
      const pools = gearPools(ctx)
      const { rankings } = await rankGear({ config, candidate: setupCandidate(config), ctx, pools, goal: 'balanced', runner: localFightRunner(), weightFights: 20, measureFights: 10 })
      const list = lock.startsWith('finger') ? 'finger' : 'trinket'
      expect(rankings.items.get(list)?.size ?? 0).toBeGreaterThan(10)
      const gears = groupGears(ctx, list === 'finger' ? 'rings' : 'trinkets', config.gear, rankings, pools)
      expect(gears.length).toBeGreaterThanOrEqual(5)
      for (const g of gears) expect(g[lock]).toEqual(config.gear[lock])
    }
  })
})

describe('the hard ceiling (O2L-3)', () => {
  it('refuses a cap the first ranking can’t fit, and never passes one it can', { timeout: 120_000 }, async () => {
    const config: SimConfig = { ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 0, seed: 3 } }
    const filters = { locked: SEARCHED_SLOTS.filter((s) => !['head', 'neck', 'trinket1', 'trinket2'].includes(s)) }
    const ctx = gearContext(config, filters)
    const { weightPlans, measurePlans } = rankingPlans(ctx, gearPools(ctx))
    const least = (weightPlans + measurePlans) * MIN_RANK_FIGHTS
    const run = (budget: number, maxFights: number) => optimizeGear({ config, filters, budget: { fights: budget }, maxFights, runner: localFightRunner(), passes: 1, perSlot: 3, enchantsPerItem: 1 })
    // Below the first ranking's fewest fights: refused before any fight.
    await expect(run(1_000_000, least - 1)).rejects.toThrow(SearchTooLargeError)
    // A small budget under a small cap: the ranking scales down to its floor, grows the budget to fit, and the whole search stays under the cap.
    const cap = least + 4_000
    const small = await run(1_000, cap)
    expect(small.ranking.weightFights).toBe(MIN_RANK_FIGHTS)
    expect(small.ranking.measureFights).toBe(MIN_RANK_FIGHTS)
    expect(small.fights).toBeLessThanOrEqual(cap)
    expect(small.notes.join(' ')).toMatch(/grows to that/)
    // No note reports a negative number of fights.
    expect(small.notes.join(' ')).not.toMatch(/-\d/)
    // A budget that fits: the first ranking is the whole search's (at most 40% of it), and the setup's start still steps.
    const fits = await run(80_000, 200_000)
    expect(fits.ranking.fights).toBeLessThanOrEqual(0.4 * 80_000 * 0.85 + 1)
    expect(fits.starts[0].steps.length).toBeGreaterThan(0)
    expect(fits.fights).toBeLessThanOrEqual(80_000)
  })
})
