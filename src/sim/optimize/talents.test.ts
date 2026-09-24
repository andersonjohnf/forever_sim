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
