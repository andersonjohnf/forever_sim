// The talent space on the real trees (docs/optimizer.md#the-talent-space), with roles given by hand
// so the counts don't move when the engine's numbers do.
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, type TalentData, talentsInCodeOrder, validateTalentBuild } from '@/data/talents/types'
import { TALENT_DATA } from '../defaults'
import { type TalentRole, talentSpace } from './talents'

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
      roles: roles(['Cruelty', 'Unbridled Wrath', 'Shield Slam', 'Bastion'], { Toughness: 'harmful', Deflection: 'survival' }),
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
    // Survival-only talents are the first fillers.
    expect(space.fillOrder.indexOf(id('Deflection'))).toBeLessThan(space.fillOrder.indexOf(id('Booming Voice')))
  })

  it('puts leftover points in the objective talent with the most score per point', () => {
    // Arms at 47 leaves 4 points for Fury's first tier: Cruelty or Unbridled Wrath (tier 2 needs 5 above).
    const base = { data: warrior, roles: roles(['Cruelty', 'Booming Voice']), minPoints: { Arms: 47 } }
    const cruelFirst = talentSpace({ ...base, values: new Map([[id('Cruelty'), 2], [id('Booming Voice'), 1]]) })
    const voiceFirst = talentSpace({ ...base, values: new Map([[id('Cruelty'), 1], [id('Booming Voice'), 2]]) })
    for (const s of [cruelFirst, voiceFirst]) expectLegal(s.builds.map((b) => b.code))
    expect(cruelFirst.builds.map((b) => [rank(b.code, 'Cruelty'), rank(b.code, 'Booming Voice')])).toEqual([[4, 0]])
    expect(voiceFirst.builds.map((b) => [rank(b.code, 'Cruelty'), rank(b.code, 'Booming Voice')])).toEqual([[0, 4]])
    expect(cruelFirst.builds[0].partial).toEqual([id('Cruelty')])
  })

  it('searches partial ranks when asked, one per build', () => {
    const plain = talentSpace({ data: warrior, roles: roles(['Cruelty', 'Unbridled Wrath', 'Improved Heroic Strike']) })
    const partial = talentSpace({ data: warrior, roles: roles(['Cruelty', 'Unbridled Wrath', 'Improved Heroic Strike']), searchPartials: true })
    expect(plain.builds).toHaveLength(1)
    expect(partial.builds.length).toBe(1)
    const tight = { data: warrior, roles: roles(['Cruelty', 'Unbridled Wrath', 'Shield Slam']), minPoints: { Protection: 43 } }
    // 8 points left for Fury: 5 + 3 of the other, which is a partial either way.
    expect(talentSpace(tight).builds.length).toBeGreaterThan(0)
    const searched = talentSpace({ ...tight, searchPartials: true })
    expectLegal(searched.builds.map((b) => b.code))
    for (const b of searched.builds) expect(b.partial.length).toBeLessThanOrEqual(1)
  })

  it('searches a talent a constraint reads, and never forces a harmful one', () => {
    const base = { data: warrior, minPoints: { Protection: 31 }, keep: { [id('Last Stand')]: 1, [id('Improved Shield Wall')]: 2 } }
    const objective = MODELLED.filter((n) => n !== 'Toughness')
    const withFive = (space: ReturnType<typeof talentSpace>) => space.builds.filter((b) => rank(b.code, 'Toughness') === 5).length
    // As a filler, Toughness gets only leftover points.
    const filler = talentSpace({ ...base, roles: roles(objective, { Toughness: 'survival' }) })
    // Read by a constraint (armor, effective health), it's a dimension: builds with it and without.
    const searched = talentSpace({ ...base, roles: roles(objective, { Toughness: 'survival' }), constrained: new Set([id('Toughness')]) })
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
    const base = { data: warrior, roles: roles(['Cruelty', 'Deflection']) }
    const positive = talentSpace({ ...base, values: new Map([[id('Cruelty'), 2], [id('Deflection'), 0.1]]) })
    expect(new Set(positive.builds.map((b) => rank(b.code, 'Deflection')))).toEqual(new Set([5]))
    const negative = talentSpace({ ...base, values: new Map([[id('Cruelty'), 2], [id('Deflection'), -0.1]]) })
    expect(new Set(negative.builds.map((b) => rank(b.code, 'Deflection')))).toEqual(new Set([0, 5]))
    expect(negative.fillOrder).not.toContain(id('Deflection'))
    expectLegal(negative.builds.map((b) => b.code))
  })

  it('gives leftover points to the preferred filler after the partial ranks and before the fillers, whatever its role (D30)', () => {
    // Shield Slam's 31 points in Protection, and 20 left over: Anticipation takes 5 of them before
    // Toughness, a survival filler, even screened as harmful or as a dimension below zero.
    const base = { data: warrior, minPoints: { Protection: 31 }, preferTree: 'Protection' }
    const anticipation = [id('Anticipation')]
    const plain = talentSpace({ ...base, roles: roles(['Shield Slam'], { Toughness: 'survival', Anticipation: 'harmful' }) })
    expect(plain.builds.map((b) => rank(b.code, 'Anticipation'))).toEqual([0])
    for (const role of ['harmful', 'survival', 'none'] as const) {
      const space = talentSpace({ ...base, roles: roles(['Shield Slam'], { Toughness: 'survival', Anticipation: role }), preferred: anticipation })
      expect(space.builds.map((b) => rank(b.code, 'Anticipation'))).toEqual([5])
      expect(space.fillOrder.indexOf(id('Anticipation'))).toBeLessThan(space.fillOrder.indexOf(id('Toughness')))
      expectLegal(space.builds.map((b) => b.code))
    }
    // As a dimension screened below zero, builds with and without it race, and leftover points go to it.
    const dim = talentSpace({ ...base, roles: roles(['Shield Slam', 'Anticipation'], { Toughness: 'survival' }), values: new Map([[id('Anticipation'), -0.05]]), preferred: anticipation })
    expect(new Set(dim.builds.map((b) => rank(b.code, 'Anticipation')))).toEqual(new Set([5]))
    expect(dim.fillOrder.slice(0, 2)).toEqual([id('Shield Slam'), id('Anticipation')])
    // After an objective talent's partial ranks: Arms at 47 leaves 4 points in Fury's first tier and
    // Protection's; Cruelty's partial ranks come first.
    const arms = talentSpace({ data: warrior, roles: roles(['Cruelty']), values: new Map([[id('Cruelty'), 1]]), minPoints: { Arms: 47 }, preferred: anticipation })
    expect(arms.builds.map((b) => [rank(b.code, 'Cruelty'), rank(b.code, 'Anticipation')])).toEqual([[4, 0]])
    // Before Toughness even when a constraint makes Toughness a dimension (the effective-health floor).
    const floor = talentSpace({ ...base, roles: roles(['Shield Slam'], { Toughness: 'survival' }), constrained: new Set([id('Toughness')]), preferred: anticipation })
    expect(floor.fillOrder.indexOf(id('Anticipation'))).toBeLessThan(floor.fillOrder.indexOf(id('Toughness')))
    expect(new Set(floor.builds.map((b) => rank(b.code, 'Anticipation')))).toEqual(new Set([5]))
    expect(new Set(floor.builds.map((b) => rank(b.code, 'Toughness')))).toContain(5)
    // Kept or excluded, it's left alone.
    const kept = talentSpace({ ...base, roles: roles(['Shield Slam'], { Toughness: 'survival' }), keep: { [id('Anticipation')]: 2 }, preferred: anticipation })
    expect(kept.builds.map((b) => rank(b.code, 'Anticipation'))).toEqual([2])
    const out = talentSpace({ ...base, roles: roles(['Shield Slam'], { Toughness: 'survival' }), exclude: anticipation, preferred: anticipation })
    expect(out.builds.map((b) => rank(b.code, 'Anticipation'))).toEqual([0])
  })

  it('keeps a build with the preferred filler and no Toughness when 5–9 points are left over, whatever the filler’s role (OV3-1)', () => {
    // A Protection build kept whole (34 points with its prerequisites), and Arms filled to its
    // minimum: 51 − 34 − arms points are left over. Toughness is a dimension only because the
    // effective-health floor reads it, so it has no screened value and isn't a raise: the build
    // without it keeps its spare points for Anticipation, which takes 5 of them before Toughness
    // takes the rest (the fill order).
    const protection = {
      'Shield Specialization': 5, 'Improved Thunder Clap': 3, 'Last Stand': 1, 'Master of Defense': 2, 'Improved Revenge': 3, Defiance: 3,
      'Improved Sunder Armor': 3, 'Improved Shield Wall': 2, Bastion: 5, 'Focused Rage': 3, 'Shield Slam': 1,
    }
    const keep = Object.fromEntries(Object.entries({ ...protection, Deflection: 5 }).map(([n, r]) => [id(n), r]))
    for (const left of [5, 6, 7, 8, 9]) {
      for (const role of ['objective', 'none', 'harmful'] as const) {
        const space = talentSpace({
          data: warrior,
          roles: roles([], { Toughness: 'survival', Anticipation: role }),
          keep,
          minPoints: { Protection: 31, Arms: 51 - 34 - left },
          constrained: new Set([id('Toughness')]),
          preferred: [id('Anticipation')],
          preferTree: 'Protection',
        })
        expectLegal(space.builds.map((b) => b.code))
        const pairs = space.builds.map((b) => [rank(b.code, 'Anticipation'), rank(b.code, 'Toughness')])
        expect(pairs, `${left} left over, Anticipation ${role}`).toContainEqual([5, left - 5])
        // And the build with Toughness races beside it.
        expect(pairs.some(([, t]) => t === 5)).toBe(true)
      }
    }
  })

  it('races builds with the preferred filler at max rank even when screened harmful, beside the objective talents’ partial ranks (OV3-1)', () => {
    // The warrior's modelled talents objective, Anticipation harmful: the objective talents' partial
    // ranks take every leftover point, so as a filler alone it would never get one. As a dimension,
    // builds with it and without it race, and Toughness (for the effective-health floor) with each.
    const base = {
      data: warrior,
      roles: roles(MODELLED.filter((n) => n !== 'Anticipation'), { Toughness: 'survival', Anticipation: 'harmful' }),
      keep: { [id('Last Stand')]: 1, [id('Improved Shield Wall')]: 2, [id('Deflection')]: 5 },
      minPoints: { Protection: 31 },
      constrained: new Set([id('Toughness')]),
      preferTree: 'Protection',
    }
    const kinds = (space: ReturnType<typeof talentSpace>) => new Set(space.builds.map((b) => `A${rank(b.code, 'Anticipation')}/T${rank(b.code, 'Toughness')}`))
    expect(kinds(talentSpace(base))).not.toContain('A5/T0')
    const space = talentSpace({ ...base, preferred: [id('Anticipation')] })
    expect(space.dimensions.map((d) => d.name)).toContain('Anticipation')
    for (const kind of ['A5/T0', 'A5/T5', 'A0/T0', 'A0/T5']) expect(kinds(space)).toContain(kind)
    expectLegal(space.builds.slice(0, 200).map((b) => b.code))
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
    const space = talentSpace({
      data: warrior,
      roles: roles(MODELLED, { Toughness: 'survival' }),
      keep: { [id('Last Stand')]: 1, [id('Improved Shield Wall')]: 2 },
      minPoints: { Protection: 31 },
      preferTree: 'Protection',
    })
    expect(space.builds.length).toBe(COUNT_PROTECTION)
    expectLegal(space.builds.map((b) => b.code))
    // Every build keeps the floor and the minimum; one with Shield Slam has its arrow.
    for (const { code } of space.builds) {
      expect(rank(code, 'Last Stand') + rank(code, 'Improved Shield Wall')).toBe(3)
      if (rank(code, 'Shield Slam')) expect(rank(code, 'Concussion Blow')).toBe(1)
      expect(treePoints(code, 'Protection')).toBeGreaterThanOrEqual(31)
    }
  })
})

/** Pinned: a change here means the space's rules changed (update it on purpose, with the reason). */
const COUNT_PROTECTION = 2283
