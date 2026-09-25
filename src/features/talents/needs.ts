import type { Talent, TalentData, TalentRanksById } from '@/data/talents/types'

/** One thing a talent needs before its first point: the tree's points above its tier, or its arrow's talent. */
export interface TalentNeed {
  /** "10 points in Fury", "1 point in Death Wish". */
  text: string
  /** How much of it there is now, capped at what's needed ("7 of 10"). */
  have: number
  needed: number
  met: boolean
}

const points = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`

/**
 * What a talent needs, met or not, for the wide Talents tab's detail panel (docs/ux.md "Talents"):
 * the tier gate, points spent in its tree's tiers above it (none in the first tier), then the talent
 * its arrow comes from, at that talent's rank. The same rules as `lockReason`, shown whether they're
 * met or not, so the panel says what a talent needs before a click is refused. Empty for a
 * first-tier talent with no arrow. The 51-point cap isn't a need of the talent; `lockReason` says it.
 */
export function talentNeeds(data: TalentData, ranks: TalentRanksById, talent: Talent): TalentNeed[] {
  const tree = data.trees.find((t) => t.id === talent.tree)
  if (!tree) return []
  const needs: TalentNeed[] = []
  const gate = data.rules.pointsPerTier * talent.tier
  if (gate > 0) {
    const above = tree.talents.filter((t) => t.tier < talent.tier).reduce((n, t) => n + (ranks[t.id] ?? 0), 0)
    needs.push({ text: `${points(gate)} in ${tree.name}`, have: Math.min(above, gate), needed: gate, met: above >= gate })
  }
  const pre = talent.prerequisite
  if (pre) {
    const name = tree.talents.find((t) => t.id === pre.talentId)?.name ?? 'another talent'
    const rank = ranks[pre.talentId] ?? 0
    needs.push({ text: `${points(pre.rank)} in ${name}`, have: Math.min(rank, pre.rank), needed: pre.rank, met: rank >= pre.rank })
  }
  return needs
}
