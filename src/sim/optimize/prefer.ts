// The preferred filler's tie-break (docs/optimizer.md#the-preferred-filler; decision D30, user
// decision 2026-09-24).
//
// A tank's preferred filler (Anticipation for a warrior and a paladin, PREFERRED_FILLER in
// ./floor.ts) isn't in the survival floor, but tanks take it. The sim measures what its avoided hits
// cost in threat and nothing of what they're worth, so the race's leader may have fewer ranks of it
// than a candidate that is level with it in all but the model's blind spot. When the race ends, a
// candidate with more ranks is preferred to the leader if it's within PREFERENCE_TOLERANCE of the
// leader's score, or inside the leader's paired 95% interval. It's D30's rule for an item whose value
// rests on an unmeasured rating, turned the other way: there an item with no unmeasured rating is
// taken when it's that close; here the build with the value the sim can't see.
import { type Interval, lower } from './objective'

/** D30's 0.5% (the unmeasured-rating items' rule): within it of the leader's score, a candidate is as good. */
export const PREFERENCE_TOLERANCE = 0.005

/** A candidate the rule may prefer, as the race stands at its end. */
export interface FillerContender {
  candidate: number
  /** Its ranks in the preferred filler. */
  ranks: number
  /** Leader − it in score, 95%, over the fights it ran. */
  vsLeader: Interval
  /** Whether it may answer: its means meet every result constraint, and it wasn't dropped as outside one. */
  eligible: boolean
}

export interface FillerPreference {
  candidate: number
  ranks: number
  /** The leader's ranks, which it has more than. */
  leaderRanks: number
  /** Leader − it in score, 95%. */
  vsLeader: Interval
  /** Why it counts as level: the leader's paired interval reaches zero, or the leader is ahead by no more than the tolerance. */
  within: 'interval' | 'tolerance'
  /** The tolerance in score units: PREFERENCE_TOLERANCE of the leader's mean score. */
  tolerance: number
}

/**
 * The candidate to answer with instead of the leader, or null to keep the leader. Of the eligible
 * candidates with more ranks than the leader, inside the leader's paired interval or within the
 * tolerance of its score, the one with the most ranks; among those, the first in `others`' order
 * (the race's standings: the leader's order).
 */
export function preferFiller(
  leader: { candidate: number; ranks: number; score: number },
  others: readonly FillerContender[],
  tolerance = PREFERENCE_TOLERANCE,
): FillerPreference | null {
  const margin = tolerance * Math.abs(leader.score)
  let best: FillerPreference | null = null
  for (const o of others) {
    if (o.candidate === leader.candidate || !o.eligible || o.ranks <= leader.ranks) continue
    const inside = !(lower(o.vsLeader) > 0)
    if (!inside && !(o.vsLeader.mean <= margin)) continue
    if (best === null || o.ranks > best.ranks)
      best = { candidate: o.candidate, ranks: o.ranks, leaderRanks: leader.ranks, vsLeader: o.vsLeader, within: inside ? 'interval' : 'tolerance', tolerance: margin }
  }
  return best
}
