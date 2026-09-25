// The talent space on the real trees (docs/optimizer.md#the-talent-space), with roles given by hand
// so the counts don't move when the engine's numbers do.
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, type TalentData, talentsInCodeOrder, validateTalentBuild } from '@/data/talents/types'
import { TALENT_DATA } from '../defaults'
import { type TalentRole, talentSpace, talentSpaceSize } from './talents'

const warrior = TALENT_DATA.warrior
const byName = (data: TalentData, name: string) => talentsInCodeOrder(data).flat().find((t) => t.name === name)!
const id = (name: string, data = warrior) => byName(data, name).id
const roles = (objective: string[], extra: Record<string, TalentRole> = {}, data = warrior) =>
  new Map<string, TalentRole>([...objective.map((n) => [id(n, data), 'objective'] as const), ...Object.entries(extra).map(([n, r]) => [id(n, data), r] as const)])
const rank = (code: string, name: string) => decodeTalentCode(warrior, code)[id(name)] ?? 0
const total = (code: string) => Object.values(decodeTalentCode(warrior, code)).reduce((a, b) => a + b, 0)
const treePoints = (code: string, tree: string) =>
  warrior.trees.find((t) => t.id === tree)!.talents.reduce((n, t) => n + (decodeTalentCode(warrior, code)[t.id] ?? 0), 0)

/** Every build is legal by the app's validator, spends 51 points, and decodes to itself. */
function expectLegal(codes: string[]) {
  for (const code of codes) {
    expect(validateTalentBuild(warrior, decodeTalentCode(warrior, code))).toEqual([])
    expect(total(code)).toBe(51)
  }
}

describe('talentSpace', () => {
  it('with one objective talent there is one build: it, at max rank, and fillers', () => {
    const space = talentSpace({ data: warrior, roles: roles(['Cruelty']) })
    expect(space.builds.map((b) => b.code)).toHaveLength(1)
    expect(rank(space.builds[0].code, 'Cruelty')).toBe(5)
    expectLegal(space.builds.map((b) => b.code))
    expect(space.dimensions.map((d) => d.name)).toEqual(['Cruelty'])
  })

  it('opens tier gates with fillers: Precision needs 20 points above it in Fury', () => {
    const space = talentSpace({ data: warrior, roles: roles(['Cruelty', 'Precision']) })
    expect(space.builds).toHaveLength(1)
    const code = space.builds[0].code
    expect(rank(code, 'Cruelty')).toBe(5)
    expect(rank(code, 'Precision')).toBe(3)
    expectLegal([code])
  })

  it('only one 31-point capstone fits in 51 points, so each build has one (maximality, gates, arrows)', () => {
    const space = talentSpace({ data: warrior, roles: roles(['Mortal Strike', 'Bloodthirst', 'Shield Slam']) })
    const codes = space.builds.map((b) => b.code)
    expect(codes).toHaveLength(3)
    expectLegal(codes)
    for (const code of codes) expect(rank(code, 'Mortal Strike') + rank(code, 'Bloodthirst') + rank(code, 'Shield Slam')).toBe(1)
    // A prerequisite that isn't objective comes with its talent, at max rank.
    const slam = codes.find((c) => rank(c, 'Shield Slam') === 1)!
    expect(rank(slam, 'Concussion Blow')).toBe(1)
    const bt = codes.find((c) => rank(c, 'Bloodthirst') === 1)!
    expect(rank(bt, 'Death Wish')).toBe(1)
  })

  it('keeps a tree minimum: 31 in Protection leaves only Shield Slam', () => {
    const space = talentSpace({ data: warrior, roles: roles(['Mortal Strike', 'Bloodthirst', 'Shield Slam']), minPoints: { Protection: 31 } })
    expect(space.builds).toHaveLength(1)
    expect(rank(space.builds[0].code, 'Shield Slam')).toBe(1)
    expect(treePoints(space.builds[0].code, 'Protection')).toBeGreaterThanOrEqual(31)
  })

  it('keeps kept talents with their prerequisites, never takes excluded or harmful ones', () => {
    const space = talentSpace({
      data: warrior,
      roles: roles(['Cruelty', 'Unbridled Wrath', 'Shield Slam', 'Bastion'], { Toughness: 'harmful', Deflection: 'tie-break' }),
      tieValues: new Map([[id('Deflection'), 0.4]]),
      keep: { [id('Last Stand')]: 1, [id('Improved Shield Wall')]: 2 },
      exclude: [id('Unbridled Wrath')],
      minPoints: { Protection: 31 },
    })
    expect(space.builds.length).toBeGreaterThan(0)
    for (const { code } of space.builds) {
      expect(rank(code, 'Last Stand')).toBe(1)
      expect(rank(code, 'Improved Bloodrage')).toBe(2)
      expect(rank(code, 'Improved Shield Wall')).toBe(2)
      expect(rank(code, 'Unbridled Wrath')).toBe(0)
      expect(rank(code, 'Toughness')).toBe(0)
    }
    expectLegal(space.builds.map((b) => b.code))
    // A talent that helps the goal's tie-break is a first filler.
    expect(space.fillOrder.indexOf(id('Deflection'))).toBeLessThan(space.fillOrder.indexOf(id('Booming Voice')))
  })

  it('puts leftover points in the objective talent with the most score per point', () => {
    // Arms at 47 leaves 4 points for Fury's first tier: Cruelty or Unbridled Wrath (tier 2 needs 5 above).
    // Max ranks only, so the fill alone decides the partial rank.
    const base = { data: warrior, roles: roles(['Cruelty', 'Booming Voice']), minPoints: { Arms: 47 }, searchPartials: false }
    const cruelFirst = talentSpace({ ...base, values: new Map([[id('Cruelty'), 2], [id('Booming Voice'), 1]]) })
    const voiceFirst = talentSpace({ ...base, values: new Map([[id('Cruelty'), 1], [id('Booming Voice'), 2]]) })
    for (const s of [cruelFirst, voiceFirst]) expectLegal(s.builds.map((b) => b.code))
    expect(cruelFirst.builds.map((b) => [rank(b.code, 'Cruelty'), rank(b.code, 'Booming Voice')])).toEqual([[4, 0]])
    expect(voiceFirst.builds.map((b) => [rank(b.code, 'Cruelty'), rank(b.code, 'Booming Voice')])).toEqual([[0, 4]])
    expect(cruelFirst.builds[0].partial).toEqual([id('Cruelty')])
  })

  it('searches partial ranks by default, one per build; searchPartials: false searches max ranks only', () => {
    const plain = talentSpace({ data: warrior, roles: roles(['Cruelty', 'Unbridled Wrath', 'Improved Heroic Strike']), searchPartials: false })
    const partial = talentSpace({ data: warrior, roles: roles(['Cruelty', 'Unbridled Wrath', 'Improved Heroic Strike']) })
    expect(plain.builds).toHaveLength(1)
    expect(partial.builds.length).toBe(1)
    const tight = { data: warrior, roles: roles(['Cruelty', 'Unbridled Wrath', 'Shield Slam']), minPoints: { Protection: 43 } }
    // 8 points left for Fury: 5 + 3 of the other, which is a partial either way.
    expect(talentSpace({ ...tight, searchPartials: false }).builds.length).toBeGreaterThan(0)
    const searched = talentSpace(tight)
    expectLegal(searched.builds.map((b) => b.code))
    for (const b of searched.builds) expect(b.partial.length).toBeLessThanOrEqual(1)
  })

  it('searches the partial ranks of a talent whose max rank screens below zero (OG-2)', () => {
    // The review's warrior: Boundless Rage screened −0.18 at max rank, so it never took leftover
    // points, and its 2 of 3 ranks beside Booming Voice 3 were never tried. Searched by default, every
    // rank of it races: a talent's ranks needn't add up to its max rank's effect.
    const base = { data: warrior, roles: roles(['Cruelty', 'Booming Voice', 'Boundless Rage']), minPoints: { Protection: 36 } }
    const values = new Map([[id('Cruelty'), 1.4], [id('Booming Voice'), 0.3], [id('Boundless Rage'), -0.06]])
    const byRank = (space: ReturnType<typeof talentSpace>) => new Set(space.builds.map((b) => rank(b.code, 'Boundless Rage')))
    expect(byRank(talentSpace({ ...base, values, searchPartials: false }))).toEqual(new Set([0, 3]))
    const searched = talentSpace({ ...base, values })
    expect(byRank(searched)).toEqual(new Set([0, 1, 2, 3]))
    expectLegal(searched.builds.map((b) => b.code))
  })

  it('a cheap raise of a weak talent doesn’t shadow a strong talent’s partial ranks (OG-3)', () => {
    // The review's toy: 4 points outside Protection, for Deflection (1 a point, 5 ranks) or Improved
    // Rend (0.01 a point, 3 ranks). Improved Rend's 3 points fit, and Deflection's 5 don't, but a
    // raise dominates only when it fits in points no objective talent would take: Deflection 4 races.
    const base = { data: warrior, roles: roles(['Deflection', 'Improved Rend']), minPoints: { Protection: 47 }, values: new Map([[id('Deflection'), 1], [id('Improved Rend'), 0.01]]) }
    const pairs = (space: ReturnType<typeof talentSpace>) => space.builds.map((b) => `${rank(b.code, 'Deflection')}/${rank(b.code, 'Improved Rend')}`)
    for (const searchPartials of [false, true]) {
      const space = talentSpace({ ...base, searchPartials })
      expect(pairs(space)).toContain('4/0')
      expectLegal(space.builds.map((b) => b.code))
    }
    // Where the raise fits in filler points, it still dominates: 5 points outside Protection take
    // Deflection 5, and no build spends them on Improved Rend and fillers.
    expect(pairs(talentSpace({ ...base, minPoints: { Protection: 46 }, searchPartials: false }))).toEqual(['5/0', '2/3'])
  })

  it('searches a talent a constraint reads, and never forces a harmful one', () => {
    // Max ranks only, to keep the spaces small.
    const base = { data: warrior, minPoints: { Protection: 31 }, keep: { [id('Last Stand')]: 1, [id('Improved Shield Wall')]: 2 }, searchPartials: false }
    const objective = MODELLED.filter((n) => n !== 'Toughness')
    const withFive = (space: ReturnType<typeof talentSpace>) => space.builds.filter((b) => rank(b.code, 'Toughness') === 5).length
    // As a filler, Toughness gets only leftover points.
    const filler = talentSpace({ ...base, roles: roles(objective, { Toughness: 'tie-break' }) })
    // Read by a constraint (armor, effective health), it's a dimension: builds with it and without.
    const searched = talentSpace({ ...base, roles: roles(objective, { Toughness: 'tie-break' }), constrained: new Set([id('Toughness')]) })
    expect(new Set(searched.builds.map((b) => rank(b.code, 'Toughness')))).toContain(0)
    expect(withFive(searched)).toBeGreaterThan(withFive(filler))
    expect(searched.dimensions.map((d) => d.name)).toContain('Toughness')
    expectLegal(searched.builds.slice(0, 200).map((b) => b.code))
    // A harmful one is searched too, but never takes leftover points or counts as a free raise.
    const harmful = talentSpace({ ...base, roles: roles(objective, { Toughness: 'harmful' }), constrained: new Set([id('Toughness')]) })
    expect(harmful.fillOrder).not.toContain(id('Toughness'))
    expect(new Set(harmful.builds.map((b) => rank(b.code, 'Toughness')))).toEqual(new Set([0, 5]))
  })

  it('never forces an objective talent whose screened effect is below zero: builds with and without it race (O1-5)', () => {
    // Deflection's screen mean below zero (it's objective: its interval reaches zero). With room
    // for it, a build without it isn't dropped as dominated, and leftover points don't go to it.
    const base = { data: warrior, roles: roles(['Cruelty', 'Deflection']), searchPartials: false }
    const positive = talentSpace({ ...base, values: new Map([[id('Cruelty'), 2], [id('Deflection'), 0.1]]) })
    expect(new Set(positive.builds.map((b) => rank(b.code, 'Deflection')))).toEqual(new Set([5]))
    const negative = talentSpace({ ...base, values: new Map([[id('Cruelty'), 2], [id('Deflection'), -0.1]]) })
    expect(new Set(negative.builds.map((b) => rank(b.code, 'Deflection')))).toEqual(new Set([0, 5]))
    expect(negative.fillOrder).not.toContain(id('Deflection'))
    expectLegal(negative.builds.map((b) => b.code))
  })

  it('orders the fillers by their measured tie-break: those that help it first, the most a point first; those that hurt it last (D30)', () => {
    // Shield Slam's 31 points in Protection leave 20. Three tie-break talents with measured values
    // (for Balanced, less damage taken a second a point): whichever helps most takes points first,
    // whatever its name, and the one that hurts the tie-break comes after every talent with none.
    const base = { data: warrior, roles: roles(['Shield Slam'], { Toughness: 'tie-break', Anticipation: 'tie-break', Deflection: 'tie-break' }), minPoints: { Protection: 31 }, preferTree: 'Protection' }
    const order = (space: ReturnType<typeof talentSpace>, names: string[]) => names.map((n) => space.fillOrder.indexOf(id(n)))
    const anticipationFirst = talentSpace({ ...base, tieValues: new Map([[id('Anticipation'), 0.5], [id('Toughness'), 0.2], [id('Deflection'), -0.3]]) })
    const [a, t, bloodrage, d] = order(anticipationFirst, ['Anticipation', 'Toughness', 'Improved Bloodrage', 'Deflection'])
    expect(a).toBeLessThan(t)
    expect(t).toBeLessThan(bloodrage)
    expect(bloodrage).toBeLessThan(d)
    expect(anticipationFirst.builds).toHaveLength(1)
    const code = anticipationFirst.builds[0].code
    expect([rank(code, 'Anticipation'), rank(code, 'Toughness'), rank(code, 'Deflection')]).toEqual([5, 5, 0])
    expectLegal([code])
    // The same talents with the values swapped: Toughness first. No talent is preferred by name.
    const toughnessFirst = talentSpace({ ...base, tieValues: new Map([[id('Anticipation'), 0.2], [id('Toughness'), 0.5], [id('Deflection'), -0.3]]) })
    const [a2, t2] = order(toughnessFirst, ['Anticipation', 'Toughness'])
    expect(t2).toBeLessThan(a2)
  })

  it('treats every talent alike: the Toughness-over-Anticipation builds the preferred filler cut race again (OV5-1)', () => {
    // The fourth verification's repro: the default Protection warrior with every talent kept but
    // Anticipation and Toughness, and the Arms and Fury talents it lacks excluded. Toughness is a
    // dimension for the effective-health floor, and Anticipation an objective talent whose screened
    // effect is below zero (so not a raise). With no talent-specific rule, both builds race: the
    // default (Anticipation 5, Toughness 1) and its twin (Anticipation 0, Toughness 5), which the
    // preferred filler's narrowing (OV4-1) had left out; the race, not a name, decides.
    const DEFAULT = '35-05-552101233301210531'
    const ranks = decodeTalentCode(warrior, DEFAULT)
    const keep = Object.fromEntries(Object.entries(ranks).filter(([t]) => t !== id('Anticipation') && t !== id('Toughness')))
    const exclude = ['Unbridled Wrath', 'Improved Charge', 'Improved Thunder Clap', 'Boundless Rage', 'Anger Management', 'Deep Wounds', 'Impale', 'Weaponmaster', 'Enrage', 'Flurry', 'Precision', 'Improved Rend'].map((n) => id(n))
    const space = talentSpace({
      data: warrior,
      keep,
      exclude,
      minPoints: { Protection: 31 },
      constrained: new Set([id('Toughness')]),
      roles: roles(['Anticipation'], { Toughness: 'tie-break' }),
      values: new Map([[id('Anticipation'), -0.067]]),
      preferTree: 'Protection',
    })
    expectLegal(space.builds.map((b) => b.code))
    const kinds = new Set(space.builds.map((b) => `A${rank(b.code, 'Anticipation')}/T${rank(b.code, 'Toughness')}`))
    expect(space.builds.map((b) => b.code)).toContain(DEFAULT)
    expect(kinds).toContain('A0/T5')
  })

  it('searches partial ranks only for objective talents: a dimension a constraint made is at 0 or max (OGV-1)', () => {
    // Toughness hurts the tie-break here, so the fill never gives it points: every rank it has is
    // the core's, and a core puts a constraint's dimension at 0 or its max, never between.
    const base = { data: warrior, roles: roles(['Cruelty', 'Booming Voice'], { Toughness: 'tie-break' }), constrained: new Set([id('Toughness')]), tieValues: new Map([[id('Toughness'), -1]]), minPoints: { Protection: 43 } }
    const space = talentSpace(base)
    expect(new Set(space.builds.map((b) => rank(b.code, 'Toughness')))).toEqual(new Set([0, 5]))
    // The objective talents' partial ranks are still searched.
    expect(space.builds.some((b) => b.partial.includes(id('Booming Voice')))).toBe(true)
    expect(space.builds.some((b) => b.partial.includes(id('Cruelty')))).toBe(true)
    expectLegal(space.builds.map((b) => b.code))
  })

  it('the warrior under ehp>=103%: every rank of one objective talent, Toughness at 0 or 5, finds the better build (OGV-1)', () => {
    // The screen for Balanced on 1.60.1.70009 (quick, seed 1, the CLI's report): each objective
    // talent's change in score at max rank, and the tie-break (less damage taken a second) at max
    // rank. The floor at 103% of the default's effective health binds, so Toughness is a dimension.
    // Before OGV-1 it searched Toughness's partial ranks too: 52,506 builds on 69913's screen, too
    // many for quick's budget at 50 fights each, so the search fell back to max ranks and missed
    // Booming Voice 3 with Boundless Rage 2, +0.36 ± 0.10 points over the leader it found, paired
    // (69913). On 70009 the answer is Booming Voice 4 with Boundless Rage 1, a partial rank too. The
    // warrior's tree didn't change in 70009, and the space's counts didn't either.
    const effect: Record<string, number> = {
      'Improved Heroic Strike': 2.686, Deflection: -0.138, 'Improved Charge': -0.084, 'Anger Management': 1.258, 'Deep Wounds': 5.603,
      Impale: 4.89, Weaponmaster: 8.698, Cruelty: 7.676, 'Unbridled Wrath': 1.224, 'Boundless Rage': -0.686, Enrage: 12.14, Flurry: 17.779,
      'Shield Specialization': 13.027, Anticipation: -0.958, 'Improved Bloodrage': 0.745, 'Master of Defense': 3.743, 'Improved Revenge': 8.891,
      Defiance: 14.73, 'Improved Sunder Armor': 5.125, Vanguard: 0.706, Bastion: 15.908, 'Focused Rage': 13.449, 'Shield Slam': 54.656,
    }
    const tie: Record<string, number> = {
      'Improved Heroic Strike': 0.473, Deflection: 51.336, 'Improved Charge': -0.231, 'Anger Management': -1.353, Weaponmaster: -2.607, Cruelty: -0.693,
      'Unbridled Wrath': -0.764, 'Boundless Rage': -0.459, Enrage: -0.945, Flurry: -4.676, 'Shield Specialization': -0.036, Anticipation: 26.569,
      'Improved Bloodrage': 0.474, Toughness: 32.244, 'Master of Defense': -0.093, 'Improved Sunder Armor': 0.385, Vanguard: 0.708, 'Focused Rage': -0.292,
      'Shield Slam': 1.266,
    }
    const perPoint = (table: Record<string, number>) => new Map(Object.entries(table).map(([n, x]) => [id(n), x / byName(warrior, n).maxRank]))
    const options = {
      data: warrior,
      roles: roles(Object.keys(effect), { Toughness: 'tie-break' }),
      values: perPoint(effect),
      tieValues: perPoint(tie),
      constrained: new Set([id('Toughness')]),
      minPoints: { Protection: 31 },
      preferTree: 'Protection',
    }
    const space = talentSpace(options)
    expect(space.builds.length).toBe(COUNT_WARRIOR_EHP103_PARTIALS)
    expect(talentSpaceSize(options)).toEqual({ builds: COUNT_WARRIOR_EHP103_PARTIALS, stopped: false })
    const codes = space.builds.map((b) => b.code)
    // 70009's answer (Booming Voice 4, Boundless Rage 1, Toughness 5) and 69913's (Booming Voice 3,
    // Boundless Rage 2) are in it, and so is the leader 69913's max-rank fallback found.
    const partialAnswers = ['-45050001005-500500233300010531', '-35050002005-500500233300010531']
    for (const code of partialAnswers) expect(codes).toContain(code)
    expect(codes).toContain('-25050003005-500500233300010531')
    expectLegal(codes.filter((_, i) => i % 211 === 0))
    const maxRanks = talentSpace({ ...options, searchPartials: false })
    expect(maxRanks.builds.length).toBe(COUNT_WARRIOR_EHP103)
    for (const code of partialAnswers) expect(maxRanks.builds.map((b) => b.code)).not.toContain(code)
  }, SLOW_SPACE_MS)

  it('sizes a space before listing it, exactly, and stops counting past a limit (OGV-5)', () => {
    const options = { data: warrior, roles: roles(MODELLED, { Toughness: 'tie-break' }), keep: { [id('Last Stand')]: 1, [id('Improved Shield Wall')]: 2 }, minPoints: { Protection: 31 }, preferTree: 'Protection', searchPartials: false }
    expect(talentSpaceSize(options)).toEqual({ builds: COUNT_PROTECTION, stopped: false })
    expect(talentSpaceSize({ ...options, stopAt: 100 })).toEqual({ builds: 101, stopped: true })
  })

  it('rejects contradictory constraints', () => {
    expect(() => talentSpace({ data: warrior, roles: roles(['Cruelty']), keep: { [id('Cruelty')]: 5 }, exclude: [id('Cruelty')] })).toThrow(/both kept and excluded/)
    expect(() => talentSpace({ data: warrior, roles: roles(['Cruelty']), minPoints: { Arms: 31, Fury: 31 } })).toThrow(/more than 51/)
    expect(() => talentSpace({ data: warrior, roles: roles(['Cruelty']), minPoints: { Nope: 1 } })).toThrow(/No tree/)
    expect(() => talentSpace({ data: warrior, roles: roles(['Cruelty']), keep: { [id('Cruelty')]: 9 } })).toThrow(/rank 9/)
  })

  // The warrior's talents the class doc models (docs/classes/warrior.md §4, "Model" column), all
  // objective, and the Protection tank's constraints: a count on the real tree.
  const MODELLED = [
    'Improved Heroic Strike', 'Deflection', 'Improved Rend', 'Improved Tactical Mastery', 'Improved Overpower', 'Anger Management',
    'Deep Wounds', 'Impale', 'Weaponmaster', 'Cruelty', 'Unbridled Wrath', 'Boundless Rage', 'Enrage', 'Improved Execute', 'Precision',
    'Death Wish', 'Flurry', 'Bloodthirst', 'Shield Specialization', 'Anticipation', 'Improved Bloodrage', 'Improved Thunder Clap',
    'Master of Defense', 'Improved Revenge', 'Defiance', 'Improved Sunder Armor', 'Bastion', 'Focused Rage', 'Shield Slam',
  ]
  it('counts the Protection space on the real tree, and every build is legal', () => {
    const options = {
      data: warrior,
      roles: roles(MODELLED, { Toughness: 'tie-break' }),
      keep: { [id('Last Stand')]: 1, [id('Improved Shield Wall')]: 2 },
      minPoints: { Protection: 31 },
      preferTree: 'Protection',
    }
    // With every rank of one talent a build searched (the default, OG-2), and max ranks only.
    const partials = talentSpace(options)
    expect(partials.builds.length).toBe(COUNT_PROTECTION_PARTIALS)
    expectLegal(partials.builds.filter((_, i) => i % 97 === 0).map((b) => b.code))
    const space = talentSpace({ ...options, searchPartials: false })
    expect(space.builds.length).toBe(COUNT_PROTECTION)
    expectLegal(space.builds.map((b) => b.code))
    // Every build keeps the kept talents and the minimum; one with Shield Slam has its arrow.
    for (const { code } of space.builds) {
      expect(rank(code, 'Last Stand') + rank(code, 'Improved Shield Wall')).toBe(3)
      if (rank(code, 'Shield Slam')) expect(rank(code, 'Concussion Blow')).toBe(1)
      expect(treePoints(code, 'Protection')).toBeGreaterThanOrEqual(31)
    }
  }, SLOW_SPACE_MS)
})

/**
 * The two tests that list a real tree's whole space (about 50,000 builds) take 1.2 to 1.5 s here and
 * over vitest's 5 s default on the shared CI runner, so they get their own limit.
 */
const SLOW_SPACE_MS = 30_000

/** Pinned: a change here means the space's rules changed (update it on purpose, with the reason). */
const COUNT_PROTECTION = 4730
const COUNT_PROTECTION_PARTIALS = 57_558
/** The warrior's space under ehp>=103% (OGV-1), with every rank of one objective talent and with max ranks only. */
const COUNT_WARRIOR_EHP103_PARTIALS = 46_814
const COUNT_WARRIOR_EHP103 = 3945
