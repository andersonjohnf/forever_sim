import {
  decodeTalentCode,
  encodeTalentCode,
  talentsInCodeOrder,
  validateTalentBuild,
  type Talent,
  type TalentData,
  type TalentRanksById,
} from '@/data/talents/types'

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

const pointsText = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`
const list = (words: string[]) => (words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

/**
 * Why a talent can't give a point back, in plain words, or null if it can (or has none): the
 * talents whose arrow needs its points, then the deeper talents whose tier gate would break
 * (docs/ux.md "Talents"), e.g. "Can’t remove a point: Bloodthirst needs 30 points in Fury above it."
 */
export function removeReason(data: TalentData, ranks: TalentRanksById, talent: Talent): string | null {
  const rank = ranks[talent.id] ?? 0
  if (rank === 0 || canRemove(data, ranks, talent)) return null
  const after = withRank(ranks, talent.id, rank - 1)
  const tree = data.trees.find((t) => t.id === talent.tree)!
  const spent = tree.talents.filter((t) => (after[t.id] ?? 0) > 0)
  const reasons: string[] = []
  // Arrows: a talent that needs this one at a rank it would drop below.
  for (const dependent of spent) {
    const pre = dependent.prerequisite
    if (pre?.talentId === talent.id && rank - 1 < pre.rank) reasons.push(`${dependent.name} needs ${pointsText(pre.rank)} in ${talent.name}`)
  }
  // Tier gates: the shallowest tier below this one whose talents would lose their gate.
  const pointsAbove = (tier: number) => tree.talents.filter((t) => t.tier < tier).reduce((n, t) => n + (after[t.id] ?? 0), 0)
  const gated = spent.filter((t) => t.tier > talent.tier && pointsAbove(t.tier) < data.rules.pointsPerTier * t.tier)
  const tier = Math.min(...gated.map((t) => t.tier))
  const names = gated.filter((t) => t.tier === tier).map((t) => t.name)
  if (names.length > 0) {
    const one = names.length === 1
    reasons.push(`${list(names)} ${one ? 'needs' : 'need'} ${data.rules.pointsPerTier * tier} points in ${tree.name} above ${one ? 'it' : 'them'}`)
  }
  return reasons.length > 0 ? `Can’t remove a point: ${reasons.join('; ')}.` : null
}

/**
 * The spec a talent preset is for: the class's spec whose name starts the preset's ("Fury + Precision"
 * is Fury's, "Feral cat (default)" is Feral (Cat)'s). Presets are listed only for specs the app
 * offers (docs/ux.md principle 8), so the menu grows with them.
 */
export function presetSpec<S extends { name: string }>(presetName: string, specs: readonly S[]): S | undefined {
  const words = (name: string) => name.toLowerCase().replace(/[()]/g, '').split(/\s+/).filter(Boolean)
  const preset = words(presetName)
  // The longest matching name wins, should one spec's name start another's.
  return [...specs]
    .sort((a, b) => words(b.name).length - words(a.name).length)
    .find((spec) => words(spec.name).every((word, i) => preset[i] === word))
}

export type BuildCodeResult = { ok: true; code: string } | { ok: false; error: string }

/**
 * Reads a pasted build code, or a talent calculator link ending in one, into a canonical code.
 * Every problem comes back as a plain sentence the paste dialog shows as is; `example` is a code
 * for this class, to show what one looks like.
 */
export function readBuildCode(data: TalentData, text: string, example: string): BuildCodeResult {
  const className = data.class[0].toUpperCase() + data.class.slice(1)
  const candidate = text.trim().split(/[/#?=]/).at(-1) ?? ''
  if (!/^[0-9]*(-[0-9]*){0,2}$/.test(candidate) || !/[0-9]/.test(candidate)) {
    return {
      ok: false,
      error: `That isn’t a talent code. A code has a digit for each talent and a dash between trees, like ${example}`,
    }
  }
  const order = talentsInCodeOrder(data)
  for (const [t, segment] of candidate.split('-').entries()) {
    const talents = order[t]
    if (segment.length > talents.length) {
      return {
        ok: false,
        error: `That isn’t a ${className} code: it has more talents than the ${data.trees[t].name} tree. Is it for another class?`,
      }
    }
    for (const [i, digit] of [...segment].entries()) {
      const talent = talents[i]
      if (Number(digit) > talent.maxRank) {
        return {
          ok: false,
          error: `That isn’t a ${className} code: it puts ${pointsText(Number(digit))} in ${talent.name}, which has ${talent.maxRank} ${talent.maxRank === 1 ? 'rank' : 'ranks'}. Is it for another class?`,
        }
      }
    }
  }
  const ranks = decodeTalentCode(data, candidate)
  const spent = totalPoints(ranks)
  if (spent > data.rules.maxPoints) {
    return { ok: false, error: `That build spends ${spent} points, and a level 60 character has ${data.rules.maxPoints}.` }
  }
  for (const talents of order) {
    for (const talent of talents) {
      if (!ranks[talent.id]) continue
      // What its first point needs: the tier gate, then the arrow.
      const reason = lockReason(data, withRank(ranks, talent.id, 0), talent)
      if (reason) {
        return { ok: false, error: `That build can’t be made in the game: ${talent.name} ${reason[0].toLowerCase()}${reason.slice(1)}` }
      }
    }
  }
  return { ok: true, code: encodeTalentCode(data, ranks) }
}
