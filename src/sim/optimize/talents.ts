// The talent build space (docs/optimizer.md#the-talent-space, decision D30).
//
// A build spends 51 points under the tree rules (docs/data/talents.md: 5 points a tier, counted in
// the lower tiers of the same tree; an arrow's talent needs its prerequisite at max rank). The
// optimizer doesn't try every legal build, which would be astronomically many, but every build that
// could win: builds that differ only where the goal can't tell them apart are one build. Every
// talent is treated alike, by what the screen measured it doing for the goal (./screen.ts), never by
// its name (D30, user decision after O1's fifth review round: no talent-specific rules).
// - **Objective** talents, those that change the goal's score, are search dimensions. Every other
//   talent is a **filler**: it can't change the score, so builds that differ only in fillers are
//   ties. Fillers take the points the objective talents leave, in the order of what they measurably
//   do for the goal's tie-break (`byTieBreak`: the ones that help it most a point first, those
//   with no effect next, those that hurt it last), then by tree and tier.
// - An objective talent is at 0 or its max rank in a build's core, but one talent a build may be at
//   any rank (`searchPartials`, the default, OG-2): a talent's ranks needn't add up to its max
//   rank's effect, so a talent whose max rank screens below zero may still help at 2 of 3. Points the
//   cores leave over go first to partial ranks of objective talents, where the sim can measure them,
//   in the order of the score per point the screen measured, and only then to fillers.
// - A talent that changes what a sheet constraint reads (health, armor, effective health, …) is a
//   search dimension too, whatever it does to the score (`constrained`): under the effective-health
//   floor, a build with Toughness and one without both race. It reads the character sheet, not the
//   talent's name. It's at 0 or its max rank in a core, never a searched partial rank (OGV-1): it
//   has no screened value to search ranks by, and its ranks multiplied the space.
// - Kept talents (the player's) sit at their rank in every build; excluded and **harmful** talents
//   (those that lower the score wherever they act, measured) are never taken, not even to fill a
//   tier gate, unless a constraint reads them (a pruning rule too, OG-9). A prerequisite comes with
//   its talent, as a filler if it's not objective itself.
// - A build must be **maximal**, a pruning rule that's objective: if another objective talent that
//   the screen didn't measure below zero fits at max rank in the points the fill would give to
//   fillers (which the goal can't tell from spare points; not those it gives to an objective talent's
//   partial rank, OG-3), the build that takes it scores at least as well, so only that one is kept.
//   A dimension a constraint alone made has no screened value, and an objective one whose screened
//   effect is below zero, though not clearly (Feral Swiftness for a bear), might lower the score:
//   builds with and without either race.
//   The trees are enumerated one at a time and combined by their points, since the tree rules
//   never reach across trees: only the 51-point total does.
// Every build is checked with the app's own validator (validateTalentBuild) and encoded with its
// encoder, and decodes back to the same ranks.
import {
  decodeTalentCode,
  encodeTalentCode,
  type Talent,
  type TalentData,
  type TalentRanksById,
  talentsInCodeOrder,
  validateTalentBuild,
} from '@/data/talents/types'

/**
 * What a talent does in the sim, for one setup and goal (./screen.ts):
 * - `objective`: it changes the goal's score (DPS or TPS; damage taken for Defense): a search dimension
 * - `tie-break`: it changes only the goal's tie-break (damage taken; TPS for Defense): a filler,
 *   ordered by how much it helps the tie-break
 * - `none`: it changes nothing the sim measures (utility, PvP, an ability the rotation doesn't use)
 * - `harmful`: it lowers the score wherever it acts: never taken unless kept or a constraint reads it
 */
export type TalentRole = 'objective' | 'tie-break' | 'none' | 'harmful'

export interface TalentConstraints {
  /** Least points per tree, by tree id ("Protection"): D30's "31 points in Protection". */
  minPoints?: Readonly<Record<string, number>>
  /** Talents in every build at exactly this rank, by talent id: the player's picks. */
  keep?: Readonly<Record<string, number>>
  /** Talents never taken, by talent id. */
  exclude?: readonly string[]
}

export interface TalentSpaceOptions extends TalentConstraints {
  data: TalentData
  /** Each talent's role, by id; a talent missing from it is `none`. */
  roles: ReadonlyMap<string, TalentRole>
  /** The tree whose fillers come first (the spec's own). */
  preferTree?: string
  /**
   * Score per point of each objective talent, by id (the screen's measured effect ÷ its ranks): the
   * order leftover points go to partial ranks. A talent missing from it comes after those in it; one
   * below zero never takes leftover points nor counts as a raise.
   */
  values?: ReadonlyMap<string, number>
  /**
   * Tie-break per point of each talent, by id (the screen's measured `tieEffect` ÷ its ranks; higher
   * is better): the order fillers take leftover points in. Those above zero come first, the most a
   * point first; then those with none measured; then those below zero.
   */
  tieValues?: ReadonlyMap<string, number>
  /**
   * Talents, by id, that change what a constraint reads: search dimensions whatever their role (a
   * harmful one is never taken to fill leftover points, nor counted as a raise).
   */
  constrained?: ReadonlySet<string>
  /**
   * Search every rank of one objective talent a build, not only 0 or max (default yes, OG-2); a
   * dimension only a constraint made is at 0 or max either way (OGV-1), and leftover points go to
   * partial ranks either way.
   */
  searchPartials?: boolean
  /** Stop after this many builds (the space is reported as larger). Default MAX_BUILDS, 200,000. */
  limit?: number
}

export interface TalentBuild {
  /** The build code (docs/data/talents.md#build-codes-verified). */
  code: string
  ranks: TalentRanksById
  /** Points in each tree, in `trees` order. */
  points: number[]
  /** Points in fillers (non-objective talents, not kept), prerequisites included. */
  fillerPoints: number
  /** Objective talents below max rank, by id: where the leftover points went. */
  partial: string[]
}

export interface TalentSpace {
  builds: TalentBuild[]
  /** Whether `limit` cut the enumeration short. */
  truncated: boolean
  /** The search dimensions, by id, with their rank choices. */
  dimensions: { id: string; name: string; ranks: number[] }[]
  /** Legal cores before the maximality rule, and those it dropped. */
  cores: number
  dominated: number
  /** Where leftover points go, in order, by id: objective talents by score per point, then the rest by their tie-break. */
  fillOrder: string[]
}

interface Node {
  t: Talent
  tree: number
  tier: number
  max: number
  pre: number
  role: TalentRole
}

/**
 * The most builds a talent space lists (D30's hard ceiling, OGV-2; docs/optimizer.md#budgets): a
 * search whose space would pass it narrows to max ranks, and says so.
 */
export const MAX_BUILDS = 200_000

/**
 * The ways a build breaks the talent constraints, in words (none: it keeps them): a kept talent at
 * another rank, an excluded one taken, a tree below its minimum. Every build `talentSpace` makes
 * keeps them; the setup's own build (the baseline) may not.
 */
export function brokenConstraints(data: TalentData, code: string, constraints: TalentConstraints): string[] {
  let ranks: TalentRanksById = {}
  try {
    ranks = decodeTalentCode(data, code)
  } catch {
    /* an unreadable build has no talents */
  }
  const byId = new Map(talentsInCodeOrder(data).flat().map((t) => [t.id, t]))
  const out: string[] = []
  for (const [id, rank] of Object.entries(constraints.keep ?? {}))
    if ((ranks[id] ?? 0) !== rank) out.push(`${byId.get(id)?.name ?? id} ${ranks[id] ?? 0}/${rank}`)
  for (const id of constraints.exclude ?? []) if ((ranks[id] ?? 0) > 0) out.push(`${byId.get(id)?.name ?? id} taken`)
  for (const [tree, min] of Object.entries(constraints.minPoints ?? {})) {
    const t = data.trees.find((x) => x.id === tree || x.name === tree)
    const points = t ? t.talents.reduce((n, x) => n + (ranks[x.id] ?? 0), 0) : 0
    if (points < min) out.push(`${t?.name ?? tree} ${points}/${min} points`)
  }
  return out
}

/** Every sensible build under the constraints, in a fixed order: the same inputs give the same list. */
export function talentSpace(options: TalentSpaceOptions): TalentSpace {
  return enumerate(options, false) as TalentSpace
}

/**
 * The space's size before it's built (OGV-5): the builds `talentSpace` would list with the same
 * options, counted without encoding, validating or listing them. It stops counting past `stopAt`.
 */
export function talentSpaceSize(options: TalentSpaceOptions & { stopAt?: number }): { builds: number; stopped: boolean } {
  return enumerate(options, true) as { builds: number; stopped: boolean }
}

function enumerate(options: TalentSpaceOptions & { stopAt?: number }, counting: boolean): TalentSpace | { builds: number; stopped: boolean } {
  const { data, roles } = options
  const perTier = data.rules.pointsPerTier
  const maxPoints = data.rules.maxPoints
  const order = talentsInCodeOrder(data)
  const nodes: Node[] = []
  const index = new Map<string, number>()
  order.forEach((talents, tree) =>
    talents.forEach((t) => {
      index.set(t.id, nodes.length)
      nodes.push({ t, tree, tier: t.tier, max: t.maxRank, pre: -1, role: roles.get(t.id) ?? 'none' })
    }),
  )
  for (const node of nodes) if (node.t.prerequisite) node.pre = index.get(node.t.prerequisite.talentId) ?? -1
  const count = nodes.length
  const treeIndex = (id: string) => {
    const i = data.trees.findIndex((t) => t.id === id || t.name === id)
    if (i < 0) throw new Error(`No tree "${id}" in ${data.class}'s talents (${data.trees.map((t) => t.id).join(', ')})`)
    return i
  }
  const lookup = (id: string) => {
    const i = index.get(id)
    if (i === undefined) throw new Error(`No talent "${id}" in ${data.class}'s talents`)
    return i
  }

  const keep = new Map<number, number>()
  for (const [id, rank] of Object.entries(options.keep ?? {})) {
    const i = lookup(id)
    if (!(Number.isInteger(rank) && rank >= 1 && rank <= nodes[i].max)) throw new Error(`${nodes[i].t.name} is kept at rank ${rank}; it has ${nodes[i].max}`)
    keep.set(i, rank)
  }
  const excluded = new Set((options.exclude ?? []).map(lookup))
  for (const i of excluded) if (keep.has(i)) throw new Error(`${nodes[i].t.name} is both kept and excluded`)
  const minPoints = new Array<number>(data.trees.length).fill(0)
  for (const [id, points] of Object.entries(options.minPoints ?? {})) minPoints[treeIndex(id)] = points
  if (minPoints.reduce((a, b) => a + b, 0) > maxPoints) throw new Error(`The trees' minimums add up to more than ${maxPoints} points`)

  // A kept talent's prerequisites are kept too, at max rank.
  for (let changed = true; changed; ) {
    changed = false
    for (const [i] of keep) {
      const p = nodes[i].pre
      if (p >= 0 && keep.get(p) !== nodes[p].max) {
        if (excluded.has(p)) throw new Error(`${nodes[i].t.name} is kept but its prerequisite ${nodes[p].t.name} is excluded`)
        keep.set(p, nodes[p].max)
        changed = true
      }
    }
  }

  // Search dimensions: objective talents, and those a constraint reads, neither kept nor excluded.
  const dims = nodes
    .map((_, i) => i)
    .filter((i) => (nodes[i].role === 'objective' || options.constrained?.has(nodes[i].t.id)) && !keep.has(i) && !excluded.has(i))
  /**
   * A dimension leftover points may go to: not a harmful one, nor an objective one whose screened
   * effect is below zero (not harmful only because its interval reaches zero). Builds with and
   * without one that isn't both race.
   */
  const fillable = (i: number) => nodes[i].role !== 'harmful' && !((options.values?.get(nodes[i].t.id) ?? 0) < 0)
  /**
   * A dimension whose max rank the maximality rule forces when it fits: an objective one that's
   * fillable. A dimension only a constraint made (Toughness under the effective-health floor) has
   * no screened value, so it never is: builds with and without it race.
   */
  const raisable = (i: number) => nodes[i].role === 'objective' && fillable(i)
  const isDim = new Uint8Array(count)
  for (const i of dims) isDim[i] = 1

  /**
   * Where a talent that can't change the score takes leftover points, by its measured tie-break
   * (D30: what the score leaves out is a tie-break): those that help it first, the most a point
   * first; then those that don't change it; then those that hurt it. Then the spec's own tree, the
   * shallower tier, and code order.
   */
  const preferTree = options.preferTree === undefined ? -1 : treeIndex(options.preferTree)
  const tieValue = (i: number) => options.tieValues?.get(nodes[i].t.id) ?? 0
  const byTieBreak = (a: number, b: number) => {
    const group = (i: number) => (tieValue(i) > 0 ? 0 : tieValue(i) < 0 ? 2 : 1)
    const tree = (i: number) => (nodes[i].tree === preferTree ? 0 : 1)
    return group(a) - group(b) || tieValue(b) - tieValue(a) || tree(a) - tree(b) || nodes[a].tier - nodes[b].tier || a - b
  }
  // Fillers: every other talent that may be taken.
  const fillerOrder = nodes
    .map((_, i) => i)
    .filter((i) => !isDim[i] && !keep.has(i) && !excluded.has(i) && nodes[i].role !== 'harmful' && nodes[i].role !== 'objective')
  const isFiller = new Uint8Array(count)
  for (const i of fillerOrder) isFiller[i] = 1
  // Leftover points: partial ranks of objective talents, the most score per point first; then the
  // dimensions a constraint made and the fillers together, by their tie-break.
  const value = (i: number) => options.values?.get(nodes[i].t.id) ?? -Infinity
  const partials = dims.filter(fillable)
  const objectivePartials = partials.filter((i) => nodes[i].role === 'objective').sort((a, b) => value(b) - value(a) || a - b)
  const rest = [...partials.filter((i) => nodes[i].role !== 'objective'), ...fillerOrder].sort(byTieBreak)
  const fillOrder = [...objectivePartials, ...rest]
  const isObjectivePartial = new Uint8Array(count)
  for (const i of objectivePartials) isObjectivePartial[i] = 1
  /**
   * The most leftover points that can go to one objective talent's partial rank (its ranks less
   * one): the fill leaves at most that on a talent it doesn't take to max. A build whose fill takes
   * more tops some talent up to max, and it's the same build as the core with that talent at max.
   */
  const partialRoom = Math.max(0, ...objectivePartials.map((i) => nodes[i].max - 1))
  const searchPartials = options.searchPartials ?? true

  const treeCount = data.trees.length
  const inTree = Array.from({ length: treeCount }, (_, tree) => nodes.map((_, i) => i).filter((i) => nodes[i].tree === tree))
  const dimsIn = inTree.map((ids) => ids.filter((i) => isDim[i]))
  const fillersIn = inTree.map((_, tree) => fillOrder.filter((i) => nodes[i].tree === tree))

  const below = (ranks: Int8Array, tree: number, tier: number) => {
    let n = 0
    for (const i of inTree[tree]) if (nodes[i].tier < tier) n += ranks[i]
    return n
  }
  const treePoints = (ranks: Int8Array, tree: number) => {
    let n = 0
    for (const i of inTree[tree]) n += ranks[i]
    return n
  }
  /** Whether filler `f` can take one more point now: room, its tier's gate, its prerequisite, below `maxTier`. */
  const canFill = (ranks: Int8Array, f: number, maxTier = Infinity) => {
    const n = nodes[f]
    return n.tier < maxTier && ranks[f] < n.max && below(ranks, n.tree, n.tier) >= perTier * n.tier && (n.pre < 0 || ranks[n.pre] === nodes[n.pre].max)
  }
  /** An objective prerequisite must be at max rank in the core itself (a filler one comes with its talent). */
  const prereqsOk = (core: Int8Array, tree: number) => {
    for (const i of inTree[tree]) {
      const p = nodes[i].pre
      if (core[i] > 0 && p >= 0 && !isFiller[p] && core[p] !== nodes[p].max) return false
    }
    return true
  }

  /**
   * Completes one tree's core in place, as cheaply as it can be legal: its talents' prerequisites,
   * the fillers its tier gates need (shallowest gate first, in the tiers above it) and those its
   * minimum needs. Returns the tree's points, or −1 if it can't be legal.
   */
  const completeTree = (ranks: Int8Array, tree: number): number => {
    for (let changed = true; changed; ) {
      changed = false
      for (const i of inTree[tree]) {
        const p = nodes[i].pre
        if (ranks[i] === 0 || p < 0 || ranks[p] === nodes[p].max) continue
        if (!isFiller[p]) return -1
        ranks[p] = nodes[p].max
        changed = true
      }
    }
    for (let tier = 1; tier <= data.rules.maxTier; tier++) {
      if (!inTree[tree].some((i) => nodes[i].tier === tier && ranks[i] > 0)) continue
      for (let need = perTier * tier - below(ranks, tree, tier); need > 0; need--) {
        const f = fillersIn[tree].find((i) => canFill(ranks, i, tier))
        if (f === undefined) return -1
        ranks[f]++
      }
    }
    while (treePoints(ranks, tree) < minPoints[tree]) {
      const f = fillersIn[tree].find((i) => canFill(ranks, i))
      if (f === undefined) return -1
      ranks[f]++
    }
    return treePoints(ranks, tree)
  }

  /** A tree's part of a build: its core completed as cheaply as it can be, and what one more objective point would cost. */
  interface TreeCore {
    ranks: Int8Array
    used: number
    partial: boolean
    /** The fewest extra points a raise of one of its objective talents costs, any raise; and one that makes no new partial rank. */
    raiseAny: number
    raiseKeepingPartials: number
  }

  const treeCores: TreeCore[][] = []
  let cores = 0
  let dominated = 0
  for (let tree = 0; tree < treeCount; tree++) {
    const list: TreeCore[] = []
    const core = new Int8Array(count)
    for (const [i, r] of keep) if (nodes[i].tree === tree) core[i] = r
    const dims = dimsIn[tree]
    const leaf = (partial: number) => {
      if (!prereqsOk(core, tree)) return
      const ranks = core.slice()
      const used = completeTree(ranks, tree)
      if (used < 0 || used > maxPoints) return
      let raiseAny = Infinity
      let raiseKeepingPartials = Infinity
      for (const i of dims) {
        if (!raisable(i)) continue
        const r = core[i]
        const tries: [number, boolean][] = []
        if (i === partial) tries.push([r + 1, false])
        else if (r === 0) {
          tries.push([nodes[i].max, false])
          if (searchPartials && partial < 0 && nodes[i].max > 1) tries.push([1, true])
        }
        for (const [next, makesPartial] of tries) {
          const up = core.slice()
          up[i] = next
          if (!prereqsOk(up, tree)) continue
          const cost = completeTree(up, tree) - used
          if (cost + used < 0 || cost + used > maxPoints) continue
          raiseAny = Math.min(raiseAny, cost)
          if (!makesPartial) raiseKeepingPartials = Math.min(raiseKeepingPartials, cost)
        }
      }
      cores++
      // A raise that costs no more points (it replaces a filler the gates needed) wins in every build.
      if (raiseKeepingPartials <= 0) {
        dominated++
        return
      }
      list.push({ ranks, used, partial: partial >= 0, raiseAny, raiseKeepingPartials })
    }
    const visit = (d: number, spent: number, partial: number) => {
      if (d === dims.length) return leaf(partial)
      const i = dims[d]
      const max = nodes[i].max
      // Max first, so the fuller builds come first.
      if (spent + max <= maxPoints) {
        core[i] = max
        visit(d + 1, spent + max, partial)
      }
      // Partial ranks only for objective talents (OGV-1): a dimension only a constraint made has no
      // screened value, so it's at 0 or max, and the fill still gives it leftover points by its tie-break.
      if (searchPartials && partial < 0 && nodes[i].role === 'objective')
        for (let r = max - 1; r >= 1; r--) {
          if (spent + r > maxPoints) continue
          core[i] = r
          visit(d + 1, spent + r, i)
        }
      core[i] = 0
      visit(d + 1, spent, partial)
    }
    visit(0, treePoints(core, tree), -1)
    treeCores.push(list)
  }

  // Combine one core per tree: at most one partial rank in all, within 51 points, and maximal: the
  // points left over that fillers take (not the objective partial ranks they go to first) are fewer
  // than any tree's cheapest raise (OG-3).
  const byUsed = treeCores.map((list) => {
    const buckets: TreeCore[][] = Array.from({ length: maxPoints + 1 }, () => [])
    for (const c of list) buckets[c.used].push(c)
    return buckets
  })
  const builds: TalentBuild[] = []
  const seen = new Set<string>()
  const limit = counting ? (options.stopAt ?? Infinity) : (options.limit ?? MAX_BUILDS)
  let truncated = false
  let counted = 0
  const chosen: TreeCore[] = []
  const emit = (slack: number) => {
    const partials = chosen.filter((c) => c.partial).length
    if (partials > 1) return
    let cheapest = Infinity
    for (const c of chosen) cheapest = Math.min(cheapest, partials > 0 || c.partial ? c.raiseKeepingPartials : c.raiseAny)
    // Even with the most the fill can leave on a partial rank, the rest would fit a raise.
    if (slack - partialRoom >= cheapest) {
      dominated++
      return
    }
    const ranks = new Int8Array(count)
    for (const c of chosen) for (let i = 0; i < count; i++) ranks[i] += c.ranks[i]
    // The rest of the points, by preference, a point at a time (a point can open a deeper filler's gate).
    let toObjective = 0
    for (let left = slack; left > 0; left--) {
      const f = fillOrder.find((i) => canFill(ranks, i))
      if (f === undefined) break
      ranks[f]++
      toObjective += isObjectivePartial[f]
    }
    // A raise dominates only when it fits in the points the score can't see (OG-3): taking it from
    // points on an objective talent's partial rank could cost more than it gains (a cheap raise of a
    // weak talent in place of a strong talent's ranks).
    if (slack - toObjective >= cheapest) {
      dominated++
      return
    }
    if (counting) {
      // The ranks themselves as the key: the same build as the code, without encoding it.
      const key = String.fromCharCode(...ranks)
      if (seen.has(key)) return
      seen.add(key)
      if (++counted > limit) truncated = true
      return
    }
    const byId: TalentRanksById = {}
    nodes.forEach((n, i) => {
      if (ranks[i] > 0) byId[n.t.id] = ranks[i]
    })
    const code = encodeTalentCode(data, byId)
    if (seen.has(code)) return
    const problems = validateTalentBuild(data, byId)
    if (problems.length > 0) throw new Error(`The optimizer built an illegal build ${code}: ${problems[0]}`)
    const back = decodeTalentCode(data, code)
    if (Object.keys(back).length !== Object.keys(byId).length || Object.entries(byId).some(([id, r]) => back[id] !== r))
      throw new Error(`The optimizer's build ${code} doesn't decode to its own ranks`)
    seen.add(code)
    let fillerPoints = 0
    for (let i = 0; i < count; i++) if (!isDim[i] && !keep.has(i)) fillerPoints += ranks[i]
    const partial = dims.filter((i) => ranks[i] > 0 && ranks[i] < nodes[i].max).map((i) => nodes[i].t.id)
    builds.push({ code, ranks: byId, points: data.trees.map((_, tree) => treePoints(ranks, tree)), fillerPoints, partial })
    if (builds.length >= limit) truncated = true
  }
  const combine = (tree: number, used: number, widest: number) => {
    if (truncated) return
    const last = tree === treeCount - 1
    // Maximal needs the filler points under every tree's raise cost, and the fill leaves at most
    // `partialRoom` on a partial rank, so the last tree's points can't be far below what's left.
    const lowest = last ? Math.max(0, maxPoints - used - Math.min(widest, Math.max(...treeCores[tree].map((c) => c.raiseKeepingPartials), 0)) - partialRoom + 1) : 0
    for (let u = maxPoints - used; u >= lowest; u--) {
      for (const c of byUsed[tree][u]) {
        chosen.push(c)
        if (last) emit(maxPoints - used - u)
        else combine(tree + 1, used + u, Math.min(widest, c.raiseKeepingPartials))
        chosen.pop()
        if (truncated) return
      }
    }
  }
  combine(0, 0, Infinity)

  if (counting) return { builds: counted, stopped: truncated }
  return {
    builds,
    truncated,
    dimensions: dims.map((i) => ({ id: nodes[i].t.id, name: nodes[i].t.name, ranks: [0, ...Array.from({ length: nodes[i].max }, (_, r) => r + 1)] })),
    cores,
    dominated,
    fillOrder: fillOrder.map((i) => nodes[i].t.id),
  }
}
