// The talent calculator's rules against the client data (docs/data/talents.md#tier-gates and
// #prerequisite-arrows): arrows need the prerequisite at max rank, tier N needs 5·N points in
// lower tiers of the same tree, and the cap is 51 points.
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, talentsInCodeOrder, type Talent, type TalentData } from '@/data/talents/types'
import { TALENT_DATA } from '@/sim/defaults'
import { canAdd, canRemove, lockReason, readBuildCode, withRank } from './logic'

const find = (data: TalentData, name: string): Talent => data.trees.flatMap((t) => t.talents).find((t) => t.name === name)!

describe('talent calculator rules', () => {
  const druid = TALENT_DATA.druid
  const splendor = find(druid, "Nature's Splendor")
  const majesty = find(druid, "Nature's Majesty")
  // Balance tiers 1–2 with 10 points: Improved Wrath 5, Genesis 3, Nature's Majesty 1, Nature's Reach 1.
  const base = decodeTalentCode(druid, '530011')

  it('locks Nature’s Splendor until Nature’s Majesty is at max rank (the client-only arrow)', () => {
    expect(splendor.prerequisite).toEqual({ talentId: majesty.id, rank: 2 })
    expect(canAdd(druid, base, splendor)).toBe(false)
    expect(lockReason(druid, base, splendor)).toBe("Requires 2 points in Nature's Majesty.")
    const maxed = withRank(base, majesty.id, 2)
    expect(canAdd(druid, maxed, splendor)).toBe(true)
    expect(lockReason(druid, maxed, splendor)).toBeNull()
    // Nature's Majesty can't drop below max rank while Nature's Splendor has a point.
    const taken = withRank(maxed, splendor.id, 1)
    expect(canRemove(druid, taken, majesty)).toBe(false)
  })

  it('gates tier N behind 5·N points in lower tiers of the same tree', () => {
    const warrior = TALENT_DATA.warrior
    const cruelty = find(warrior, 'Cruelty') // Fury tier 1
    const unbridled = find(warrior, 'Unbridled Wrath') // Fury tier 2
    expect(unbridled.tier).toBe(1)
    const four = { [cruelty.id]: 4 }
    expect(lockReason(warrior, four, unbridled)).toBe('Requires 5 points in Fury.')
    // Points in another tree don't count.
    const armsTalent = find(warrior, 'Improved Heroic Strike')
    expect(canAdd(warrior, { ...four, [armsTalent.id]: 3 }, unbridled)).toBe(false)
    expect(canAdd(warrior, { [cruelty.id]: 5 }, unbridled)).toBe(true)
  })

  it('counts only lower tiers for a tier-7 talent (stricter than the client’s whole-tree gate)', () => {
    const warrior = TALENT_DATA.warrior
    const ranks = decodeTalentCode(warrior, '-05050103') // Fury 14 points
    const bloodthirst = find(warrior, 'Bloodthirst')
    expect(bloodthirst.tier).toBe(6)
    expect(lockReason(warrior, ranks, bloodthirst)).toBe('Requires 30 points in Fury.')
  })
})

describe('pasting a build code (plain-language errors)', () => {
  const warrior = TALENT_DATA.warrior
  const example = '30305213132515201-05050103-'
  const read = (text: string) => readBuildCode(warrior, text, example)

  it('reads a bare code or a calculator link ending in one, in canonical form', () => {
    expect(read(' 30305213132515201-05050103- ')).toEqual({ ok: true, code: '30305213132515201-05050103-' })
    expect(read('https://example.com/talent-calc/warrior/30305213132515201-05050103')).toEqual({
      ok: true,
      code: '30305213132515201-05050103-',
    })
  })

  it('says when the text isn’t a talent code at all, with an example', () => {
    for (const text of ['hello', '1-2-3-4', '--', 'https://example.com/']) {
      expect(read(text)).toEqual({
        ok: false,
        error: `That isn’t a talent code. A code has a digit for each talent and a dash between trees, like ${example}`,
      })
    }
  })

  it('says when a code is for another class', () => {
    expect(read('99999')).toEqual({
      ok: false,
      error: 'That isn’t a Warrior code: it puts 9 points in Improved Heroic Strike, which has 3 ranks. Is it for another class?',
    })
    expect(read('1'.repeat(30))).toMatchObject({ ok: false, error: expect.stringMatching(/more talents than the Arms tree/) })
  })

  it('says when a build breaks the rules, naming the talent', () => {
    // One point in Fury's last talent, with nothing above it.
    const fury = talentsInCodeOrder(warrior)[1]
    expect(read(`-${'0'.repeat(fury.length - 1)}1`)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^That build can’t be made in the game: \S.* requires \d+ points in Fury\.$/),
    })
    // Every talent at max rank.
    const everything = talentsInCodeOrder(warrior)
      .map((tree) => tree.map((t) => t.maxRank).join(''))
      .join('-')
    expect(read(everything)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^That build spends \d+ points, and a level 60 character has 51\.$/),
    })
  })
})
