import { validateTalentBuild, type Talent, type TalentData, type TalentRanksById } from '@/data/talents/types'

export function totalPoints(ranks: TalentRanksById): number {
  return Object.values(ranks).reduce((a, b) => a + b, 0)
}

export function withRank(ranks: TalentRanksById, id: string, rank: number): TalentRanksById {
  const next = { ...ranks }
  if (rank > 0) next[id] = rank
  else delete next[id]
  return next
}

/** A point can be added if the resulting build is legal (tier gates, prerequisites, 51-point cap). */
export function canAdd(data: TalentData, ranks: TalentRanksById, talent: Talent): boolean {
  const rank = ranks[talent.id] ?? 0
  return rank < talent.maxRank && validateTalentBuild(data, withRank(ranks, talent.id, rank + 1)).length === 0
}

/** A point can be removed if nothing that depends on it (higher tiers, arrows) breaks. */
export function canRemove(data: TalentData, ranks: TalentRanksById, talent: Talent): boolean {
  const rank = ranks[talent.id] ?? 0
  return rank > 0 && validateTalentBuild(data, withRank(ranks, talent.id, rank - 1)).length === 0
}

/** Why a talent can't take a point yet, in plain words, or null if it can. */
export function lockReason(data: TalentData, ranks: TalentRanksById, talent: Talent): string | null {
  const rank = ranks[talent.id] ?? 0
  if (rank >= talent.maxRank) return null
  if (totalPoints(ranks) >= data.rules.maxPoints) return `All ${data.rules.maxPoints} points are spent.`
  const tree = data.trees.find((t) => t.id === talent.tree)!
  const below = tree.talents.filter((t) => t.tier < talent.tier).reduce((n, t) => n + (ranks[t.id] ?? 0), 0)
  const needed = data.rules.pointsPerTier * talent.tier
  if (below < needed) return `Requires ${needed} points in ${tree.name}.`
  const pre = talent.prerequisite
  if (pre && (ranks[pre.talentId] ?? 0) < pre.rank) {
    const name = tree.talents.find((t) => t.id === pre.talentId)?.name ?? 'another talent'
    return `Requires ${pre.rank} ${pre.rank === 1 ? 'point' : 'points'} in ${name}.`
  }
  return null
}
