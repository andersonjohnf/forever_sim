// Talent codes written on older talent trees (docs/data/talents.md#tree-versions). A setup's
// `version` says which trees its build code was written on: version 1 on 1.60.1.69913's, versions 2
// and 3 on today's (3 since Hammer of the Righteous's default reading changed, ./normalize.ts).
// A code from older trees decodes against that build's frozen code order
// (src/data/talents/frozen.json) and is mapped onto today's trees by talent name, a renamed
// talent by its new name. Points that have no place on today's trees are refunded, and the load
// says so: a talent the game removed, ranks past a talent's new max, and a talent that no longer
// has the points above it or the arrow it needs. A code the sim itself shipped (a default or a
// preset) reads as the build that succeeds it instead (./talent-successors.ts).
import frozenJson from '@/data/talents/frozen.json'
import { decodeFrozenCode, encodeTalentCode, frozenBuildProblems, validateTalentBuild, type FrozenTalentOrders, type Talent, type TalentData, type TalentRanksById } from '@/data/talents/types'
import type { ClassId, SpecId } from '../types'

const frozen = frozenJson as unknown as FrozenTalentOrders

/**
 * The setup version this app writes: its talent codes are on today's trees (docs/data/talents.md#tree-versions).
 * 3 since 2026-09-26: a version-2 setup was written while Hammer of the Righteous's weapon DPS counted
 * attack power by default, which its load says (./normalize.ts, paladin.md OQ 11).
 */
export const CONFIG_VERSION = 3

/** Whether a setup's `version` is one this app reads: none (1), 1, 2 or this one; a newer one isn't. */
export const isReadableVersion = (version: unknown): boolean =>
  version === undefined || (typeof version === 'number' && Number.isInteger(version) && version >= 1 && version <= CONFIG_VERSION)

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

/** Why a talent's points have no place on today's trees: the game removed it, lowered its max rank, or its row or arrow lost what it needs. */
export type RefundCause = 'removed' | 'ranks' | 'row' | 'arrow'

/**
 * Points a build lost on today's trees, and why (`maxRank`: today's, for a lowered max rank;
 * `needs`: the talent today's arrow needs, for a lost arrow).
 */
export interface TalentRefund {
  name: string
  points: number
  cause: RefundCause
  maxRank?: number
  needs?: string
}

/**
 * The build a code on older trees was, when the sim itself shipped that code (a default or a
 * preset, ./talent-successors.ts), in the words of the load's notice: "Your talents were `label` on
 * the game’s old trees; they’re now `now`." `spec` is the spec whose default it was.
 */
export interface TalentSuccessor {
  label: string
  now: string
  spec?: SpecId
}

/**
 * Where a notice about a code from older trees is read: `whose` names the build's spec when the
 * notice doesn't otherwise (a load's notice covering several specs), `spec` being that spec, and
 * `pasted` is set for a code pasted into Talents, where the notice speaks of the code (review TMV-2).
 */
export interface NoticeContext {
  whose?: string
  spec?: SpecId
  pasted?: boolean
}

/** A code on older trees, read on today's: the canonical code, the points refunded, and the build it succeeds, if any. */
export interface TalentMigration {
  code: string
  refunds: TalentRefund[]
  successor?: TalentSuccessor
}

/** Why a talent of a build can't keep its points on today's trees (its row's gate, then its arrow), or null if it can. */
function lockedOut(data: TalentData, ranks: TalentRanksById, talent: Talent): 'row' | 'arrow' | null {
  const tree = data.trees.find((t) => t.id === talent.tree)!
  const above = tree.talents.filter((t) => t.tier < talent.tier).reduce((n, t) => n + (ranks[t.id] ?? 0), 0)
  if (above < data.rules.pointsPerTier * talent.tier) return 'row'
  const pre = talent.prerequisite
  if (pre && (ranks[pre.talentId] ?? 0) < pre.rank) return 'arrow'
  return null
}

/**
 * A code written on a frozen build's trees in canonical form: decoded on those trees, each tree's
 * trailing zeros trimmed, always three segments ("2500030-5030-…" is "250003-503-…"), as
 * `encodeTalentCode` writes today's. Null when there are no such trees or the code doesn't decode
 * on them (review TMV-1).
 */
export function canonicalFrozenCode(data: TalentData, fromBuild: string, code: string): string | null {
  const trees = frozen.builds[fromBuild]?.classes[data.class]
  if (!trees) return null
  try {
    const ranks = decodeFrozenCode(trees, code)
    return trees.map((tree) => tree.talents.map(([name]) => ranks[name] ?? 0).join('').replace(/0+$/, '')).join('-')
  } catch {
    return null
  }
}

/**
 * A build code written on a frozen build's trees (`fromBuild`), mapped onto today's (`data`) by talent
 * name: the canonical code on today's trees, and the points refunded. Throws if the code isn't a
 * legal build of the class on that build's trees.
 */
export function migrateTalentCode(data: TalentData, fromBuild: string, code: string): TalentMigration {
  const trees = frozen.builds[fromBuild]?.classes[data.class]
  if (!trees) throw new Error(`No frozen ${data.class} trees for ${fromBuild}`)
  const old = decodeFrozenCode(trees, code)
  const illegal = frozenBuildProblems(trees, old, data.rules)
  if (illegal.length > 0) throw new Error(`The ${data.class} build ${code} isn't legal on ${fromBuild}'s trees: ${illegal.join('; ')}`)
  return mapByName(data, old, RENAMED_TALENTS[fromBuild]?.[data.class as ClassId] ?? {})
}

/**
 * Old ranks by talent name (`renamed`: old name → today's), onto today's trees: migrateTalentCode's
 * mapping. Exported for its tests, which lower a max rank to reach a branch no build has needed yet.
 */
export function mapByName(data: TalentData, old: Readonly<Record<string, number>>, renamed: Readonly<Record<string, string>> = {}): TalentMigration {
  const all = data.trees.flatMap((t) => t.talents)
  const byName = new Map(all.map((t) => [t.name, t]))
  const ranks: TalentRanksById = {}
  const refunds: TalentRefund[] = []
  for (const [oldName, rank] of Object.entries(old)) {
    const talent = byName.get(renamed[oldName] ?? oldName)
    if (!talent) {
      refunds.push({ name: oldName, points: rank, cause: 'removed' })
      continue
    }
    if (rank > talent.maxRank) refunds.push({ name: talent.name, points: rank - talent.maxRank, cause: 'ranks', maxRank: talent.maxRank })
    ranks[talent.id] = Math.min(rank, talent.maxRank)
  }
  // A talent whose row or arrow the new trees gate differently loses its points, and so, in turn,
  // do the talents that needed them, until the build is legal. Points never move to another talent.
  for (;;) {
    const out = all.flatMap((t) => {
      const cause = ranks[t.id] ? lockedOut(data, ranks, t) : null
      return cause ? [[t, cause] as const] : []
    })
    if (out.length === 0) break
    for (const [t, cause] of out) {
      const needs = cause === 'arrow' ? all.find((p) => p.id === t.prerequisite?.talentId)?.name : undefined
      refunds.push({ name: t.name, points: ranks[t.id], cause, ...(needs ? { needs } : {}) })
      delete ranks[t.id]
    }
  }
  const problems = validateTalentBuild(data, ranks)
  if (problems.length > 0) throw new Error(`The ${data.class} build isn't legal on today's trees: ${problems.join('; ')}`)
  return { code: encodeTalentCode(data, ranks), refunds }
}

const list = (words: readonly string[]) => (words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)
const unique = (words: readonly string[]) => [...new Set(words)]

/**
 * Why the points went, a clause per cause, each talent named once however many builds or causes it's
 * in, and more than three talents that lost their arrow, or their row, counted rather than named: "Improved
 * Holy Strike and Crusade left the game, and 5 talents below them lost the points their rows need".
 * A talent that lost its arrow names the talent the arrow needs: "Call of Thunder now needs Elemental
 * Alacrity" (review TMV-5).
 */
function refundCauses(refunds: readonly TalentRefund[]): string {
  const named = (cause: RefundCause) => unique(refunds.filter((r) => r.cause === cause).map((r) => r.name))
  const removed = named('removed')
  // A lowered talent that then lost its row or arrow too is named once, with those: all its points went.
  const lockedOut = new Set([...named('row'), ...named('arrow')])
  const lowered = unique(refunds.filter((r) => r.cause === 'ranks' && !lockedOut.has(r.name)).map((r) => `${r.name} now has ${r.maxRank} ${r.maxRank === 1 ? 'rank' : 'ranks'}`))
  const clauses = [...(removed.length > 0 ? [`${list(removed)} left the game`] : []), ...lowered]
  // "below it" or "below them": the talents the game changed, which these needed.
  let below = removed.length + lowered.length === 0 ? '' : removed.length + lowered.length === 1 ? ' below it' : ' below them'
  const arrows = named('arrow')
  if (arrows.length > 3) clauses.push(`${arrows.length} talents${below} lost the talents their arrows need`)
  else {
    for (const name of arrows) {
      const needs = refunds.find((r) => r.cause === 'arrow' && r.name === name && r.needs)?.needs
      clauses.push(needs ? `${name} now needs ${needs}` : `${name} lost the talent its arrow needs`)
    }
  }
  if (arrows.length > 0) below = ''
  const rows = named('row')
  if (rows.length > 0) clauses.push(`${rows.length <= 3 ? list(rows) : `${rows.length} talents${below}`} lost ${rows.length === 1 ? 'the points its row needs' : 'the points their rows need'}`)
  return clauses.length < 2 ? clauses.join('') : `${clauses.slice(0, -1).join(', ')}, and ${clauses.at(-1)}`
}

/**
 * What a load says about points builds lost on today's trees: one sentence however many specs lost
 * them, `whose` naming each build's spec where the notice doesn't (docs/data/talents.md#tree-versions).
 *   "The game’s new talent trees refunded 16 talent points: Improved Holy Strike and Crusade left the
 *   game, and 5 talents below them lost the points their rows need. Spend them again in Talents."
 *   "The game’s new talent trees refunded 16 of your Retribution Paladin and 2 of your Protection
 *   Paladin talent points: …"
 * A paste, already in Talents, ends "Spend them again." (review TMV-2).
 */
export function refundNotice(builds: readonly { refunds: readonly TalentRefund[]; whose?: string }[], context: Pick<NoticeContext, 'pasted'> = {}): string {
  const counted = builds.map((b) => ({ ...b, points: b.refunds.reduce((n, r) => n + r.points, 0) })).filter((b) => b.points > 0)
  const total = counted.reduce((n, b) => n + b.points, 0)
  const amounts = counted.every((b) => b.whose)
    ? `${list(counted.map((b) => `${b.points} of your ${b.whose}`))} talent points`
    : `${total} talent ${total === 1 ? 'point' : 'points'}`
  const spend = `Spend ${total === 1 ? 'it' : 'them'} again${context.pasted ? '' : ' in Talents'}.`
  return `The game’s new talent trees refunded ${amounts}: ${refundCauses(counted.flatMap((b) => b.refunds))}. ${spend}`
}

/**
 * What a load says about a code the sim shipped on older trees, read as the build that succeeds it:
 * "Your talents were the Retribution default on the game’s old trees; they’re now today’s default."
 * With `whose`, the notice names the spec, and a default of that same spec isn't named twice: "Your
 * Retribution Paladin talents were the default on the game’s old trees; they’re now today’s
 * default." ("then" said nothing of when, review FU-6.) A paste speaks of the code: "That code was
 * the Retribution default on the game’s old trees; it’s now today’s default." (review TMV-2).
 */
export function successorNotice(successor: TalentSuccessor, context: NoticeContext = {}): string {
  if (context.pasted) return `That code was ${successor.label} on the game’s old trees; it’s now ${successor.now}.`
  if (context.whose && successor.spec && successor.spec === context.spec) return `Your ${context.whose} talents were the default on the game’s old trees; they’re now ${successor.now}.`
  return `Your ${context.whose ? `${context.whose} ` : ''}talents were ${successor.label} on the game’s old trees; they’re now ${successor.now}.`
}

/** What a load or a paste says about a code it read on older trees, or null when the build lost nothing and needs no word. */
export function migrationNotice(migration: Omit<TalentMigration, 'code'>, context: NoticeContext = {}): string | null {
  if (migration.successor) return successorNotice(migration.successor, context)
  return migration.refunds.length > 0 ? refundNotice([{ refunds: migration.refunds, whose: context.whose }], context) : null
}
