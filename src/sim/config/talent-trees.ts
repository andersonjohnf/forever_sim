// Talent codes written on older talent trees (docs/data/talents.md#tree-versions). A setup's
// `version` says which trees its build code was written on: version 1 on 1.60.1.69913's, version 2
// on today's. A code from older trees decodes against that build's frozen code order
// (src/data/talents/frozen.json) and is mapped onto today's trees by talent name, a renamed
// talent by its new name. Points that have no place on today's trees are refunded, and the load
// says so: a talent the game removed, ranks past a talent's new max, and a talent that no longer
// has the points above it or the arrow it needs.
import frozenJson from '@/data/talents/frozen.json'
import { decodeFrozenCode, encodeTalentCode, frozenBuildProblems, validateTalentBuild, type FrozenTalentOrders, type Talent, type TalentData, type TalentRanksById } from '@/data/talents/types'
import type { ClassId } from '../types'

const frozen = frozenJson as unknown as FrozenTalentOrders

/** The setup version this app writes: its talent codes are on today's trees (docs/data/talents.md#tree-versions). */
export const CONFIG_VERSION = 2

/** The client build whose trees each older setup version's talent codes were written on. */
export const TALENT_TREES_OF_VERSION: Readonly<Record<number, string>> = { 1: '1.60.1.69913' }

/**
 * Talents a later build renamed, by the frozen build they were named on: old name → today's
 * (docs/data/talents.md#tree-versions). 1.60.1.70009 renamed two Feral Combat talents in their own
 * cells, each keeping its spell (407995, 16958).
 */
export const RENAMED_TALENTS: Readonly<Record<string, Partial<Record<ClassId, Readonly<Record<string, string>>>>>> = {
  '1.60.1.69913': { druid: { Mangle: 'Primal Bite', 'Primal Fury': 'Blood Frenzy' } },
}

/** Points a build lost on today's trees, and why, in the words of the load's notice. */
export interface TalentRefund {
  name: string
  points: number
  reason: string
}

const points = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`

/** Why a talent of a build can't keep its points on today's trees, or null if it can. */
function lockedOut(data: TalentData, ranks: TalentRanksById, talent: Talent, byId: Map<string, Talent>): string | null {
  const tree = data.trees.find((t) => t.id === talent.tree)!
  const above = tree.talents.filter((t) => t.tier < talent.tier).reduce((n, t) => n + (ranks[t.id] ?? 0), 0)
  const needed = data.rules.pointsPerTier * talent.tier
  if (above < needed) return `needs ${needed} points in ${tree.name} above it`
  const pre = talent.prerequisite
  if (pre && (ranks[pre.talentId] ?? 0) < pre.rank) return `needs ${points(pre.rank)} in ${byId.get(pre.talentId)?.name ?? 'another talent'}`
  return null
}

/**
 * A build code written on a frozen build's trees (`fromBuild`), mapped onto today's (`data`) by talent
 * name: the canonical code on today's trees, and the points refunded. Throws if the code isn't a
 * legal build of the class on that build's trees.
 */
export function migrateTalentCode(data: TalentData, fromBuild: string, code: string): { code: string; refunds: TalentRefund[] } {
  const trees = frozen.builds[fromBuild]?.classes[data.class]
  if (!trees) throw new Error(`No frozen ${data.class} trees for ${fromBuild}`)
  const renamed = RENAMED_TALENTS[fromBuild]?.[data.class as ClassId] ?? {}
  const all = data.trees.flatMap((t) => t.talents)
  const byName = new Map(all.map((t) => [t.name, t]))
  const byId = new Map(all.map((t) => [t.id, t]))
  const old = decodeFrozenCode(trees, code)
  const illegal = frozenBuildProblems(trees, old, data.rules)
  if (illegal.length > 0) throw new Error(`The ${data.class} build ${code} isn't legal on ${fromBuild}'s trees: ${illegal.join('; ')}`)
  const ranks: TalentRanksById = {}
  const refunds: TalentRefund[] = []
  for (const [oldName, rank] of Object.entries(old)) {
    const talent = byName.get(renamed[oldName] ?? oldName)
    if (!talent) {
      refunds.push({ name: oldName, points: rank, reason: 'removed from the game' })
      continue
    }
    if (rank > talent.maxRank) refunds.push({ name: talent.name, points: rank - talent.maxRank, reason: `now ${talent.maxRank} ${talent.maxRank === 1 ? 'rank' : 'ranks'}` })
    ranks[talent.id] = Math.min(rank, talent.maxRank)
  }
  // A talent whose row or arrow the new trees gate differently loses its points, and so, in turn,
  // do the talents that needed them, until the build is legal. Points never move to another talent.
  for (;;) {
    const out = all.flatMap((t) => (ranks[t.id] ? [[t, lockedOut(data, ranks, t, byId)] as const] : [])).filter(([, why]) => why !== null)
    if (out.length === 0) break
    for (const [t, why] of out) {
      refunds.push({ name: t.name, points: ranks[t.id], reason: why! })
      delete ranks[t.id]
    }
  }
  const problems = validateTalentBuild(data, ranks)
  if (problems.length > 0) throw new Error(`The ${data.class} build ${code} isn't legal on today's trees: ${problems.join('; ')}`)
  return { code: encodeTalentCode(data, ranks), refunds }
}

const list = (words: string[]) => (words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

/**
 * What a load says about points a build lost on today's trees, `whose` naming the spec where the
 * notice doesn't:
 *   "The game’s new talent trees refunded 4 of your talent points: 2 in Improved Holy Strike
 *   (removed from the game) and 2 in Crusade (removed from the game)."
 *   "The game’s new talent trees refunded 4 of your Retribution Paladin talent points: …"
 */
export function refundNotice(refunds: readonly TalentRefund[], whose?: string): string {
  const total = refunds.reduce((n, r) => n + r.points, 0)
  const items = refunds.map((r) => `${r.points} in ${r.name} (${r.reason})`)
  return `The game’s new talent trees refunded ${total} of your ${whose ? `${whose} ` : ''}talent points: ${list(items)}.`
}
