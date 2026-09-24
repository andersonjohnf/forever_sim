// The preferred filler's tie-break (docs/optimizer.md#the-preferred-filler, D30).
import { describe, expect, it } from 'vitest'
import { PREFERRED_FILLER, SURVIVAL_FLOOR } from './floor'
import { PREFERENCE_TOLERANCE, preferFiller } from './prefer'

const at = (mean: number, halfWidth: number) => ({ mean, halfWidth })

describe('preferFiller', () => {
  // A balanced leader scores about 200, so 0.5% of it is about 1 point.
  const leader = { candidate: 1, ranks: 0, score: 204 }

  it('prefers the most ranks among candidates within 0.5% of the leader or inside its interval', () => {
    const pick = preferFiller(leader, [
      { candidate: 2, ranks: 2, vsLeader: at(0.3, 0.5), eligible: true }, // inside the interval
      { candidate: 3, ranks: 5, vsLeader: at(0.9, 0.2), eligible: true }, // clearly behind, but within 1.02
      { candidate: 4, ranks: 5, vsLeader: at(0.5, 0.1), eligible: true }, // as many ranks, later in the order
    ])
    expect(pick).toEqual({ candidate: 3, ranks: 5, leaderRanks: 0, vsLeader: at(0.9, 0.2), within: 'tolerance', tolerance: 204 * PREFERENCE_TOLERANCE })
    // Inside the interval is said so, even when also within the tolerance.
    expect(preferFiller(leader, [{ candidate: 2, ranks: 2, vsLeader: at(0.3, 0.5), eligible: true }])?.within).toBe('interval')
  })

  it('an interval wider than the tolerance still counts: the leader isn’t clear of it', () => {
    expect(preferFiller(leader, [{ candidate: 2, ranks: 5, vsLeader: at(1.5, 2), eligible: true }])).toMatchObject({ candidate: 2, within: 'interval' })
  })

  it('keeps the leader when no candidate is level with it, has more ranks, or may answer', () => {
    expect(preferFiller(leader, [{ candidate: 2, ranks: 5, vsLeader: at(1.1, 0.05), eligible: true }])).toBeNull()
    expect(preferFiller({ ...leader, ranks: 5 }, [{ candidate: 2, ranks: 5, vsLeader: at(0, 0.5), eligible: true }])).toBeNull()
    expect(preferFiller({ ...leader, ranks: 3 }, [{ candidate: 2, ranks: 2, vsLeader: at(0, 0.5), eligible: true }])).toBeNull()
    // Outside a result limit, or dropped as outside one: never the answer.
    expect(preferFiller(leader, [{ candidate: 2, ranks: 5, vsLeader: at(0, 0.5), eligible: false }])).toBeNull()
    expect(preferFiller(leader, [])).toBeNull()
  })

  it('the tolerance is 0.5% of the leader’s score in its own units: 5 DPS on 1,000', () => {
    const dps = { candidate: 1, ranks: 0, score: 1000 }
    expect(preferFiller(dps, [{ candidate: 2, ranks: 5, vsLeader: at(4.9, 1), eligible: true }])).toMatchObject({ within: 'tolerance', tolerance: 5 })
    expect(preferFiller(dps, [{ candidate: 2, ranks: 5, vsLeader: at(5.1, 1), eligible: true }])).toBeNull()
  })

  it('is the warrior’s and the paladin’s Anticipation, which left their floors (D30)', () => {
    expect(PREFERRED_FILLER).toEqual({ 'warrior-protection': 'Anticipation', 'paladin-protection': 'Anticipation' })
    for (const spec of ['warrior-protection', 'paladin-protection'] as const) {
      expect(SURVIVAL_FLOOR[spec]).not.toHaveProperty('Anticipation')
      expect(SURVIVAL_FLOOR[spec]).toHaveProperty('Deflection', 5)
    }
  })
})
