// The talent calculator's rules against the client data (docs/data/talents.md#tier-gates and
// #prerequisite-arrows): arrows need the prerequisite at max rank, tier N needs 5·N points in
// lower tiers of the same tree, and the cap is 51 points.
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, talentsInCodeOrder, type Talent, type TalentData } from '@/data/talents/types'
import { SPEC_META } from '@/sim'
import { TALENT_DATA, talentPresets } from '@/sim/defaults'
import { canAdd, canRemove, lockReason, presetSpec, readBuildCode, removeReason, withRank } from './logic'

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

describe('why a point can’t come back (docs/ux.md "Talents")', () => {
  const warrior = TALENT_DATA.warrior
  const fury = decodeTalentCode(warrior, '30305013002-050530035150010051-') // the Fury default
  const reason = (name: string) => removeReason(warrior, fury, find(warrior, name))

  it('names the talent whose arrow needs it', () => {
    expect(reason('Death Wish')).toBe('Can’t remove a point: Bloodthirst needs 1 point in Death Wish.')
    expect(reason('Enrage')).toBe('Can’t remove a point: Flurry needs 5 points in Enrage.')
  })

  it('names the talents in the first tier whose gate would break', () => {
    // Cruelty is Fury's tier 1: without its fifth point, tier 2 has 4 points above it.
    expect(reason('Cruelty')).toBe('Can’t remove a point: Unbridled Wrath needs 5 points in Fury above it.')
    // Unbridled Wrath is tier 2: tier 3 would have 9, and Improved Cleave and Boundless Rage need 10.
    expect(reason('Unbridled Wrath')).toBe('Can’t remove a point: Improved Cleave and Boundless Rage need 10 points in Fury above them.')
  })

  it('is null for a point that can go, and for a talent with none', () => {
    expect(reason('Flurry')).toBeNull()
    expect(reason('Bloodthirst')).toBeNull()
    expect(reason('Booming Voice')).toBeNull() // no points
    expect(canRemove(warrior, fury, find(warrior, 'Flurry'))).toBe(true)
  })
})

describe('talent presets per spec (docs/ux.md principle 8)', () => {
  it('ties every documented preset to exactly one spec of its class', () => {
    for (const classId of ['warrior', 'druid', 'paladin'] as const) {
      const specs = Object.values(SPEC_META).filter((s) => s.classId === classId)
      for (const preset of talentPresets(classId)) {
        expect(presetSpec(preset.name, specs)?.classId, preset.name).toBe(classId)
      }
    }
    const warriors = Object.values(SPEC_META).filter((s) => s.classId === 'warrior')
    expect(talentPresets('warrior').map((p) => presetSpec(p.name, warriors)?.id)).toEqual([
      'warrior-fury',
      'warrior-fury',
      'warrior-arms',
      'warrior-protection',
      'warrior-protection',
    ])
    const druids = Object.values(SPEC_META).filter((s) => s.classId === 'druid')
    expect(talentPresets('druid').map((p) => presetSpec(p.name, druids)?.id)).toEqual(['druid-feral-cat', 'druid-feral-bear'])
  })

  it('leaves out presets for specs that aren’t offered', () => {
    const offered = [SPEC_META['warrior-fury'], SPEC_META['warrior-arms']]
    expect(talentPresets('warrior').filter((p) => presetSpec(p.name, offered)).map((p) => p.name)).toEqual([
      'Fury (default)',
      'Fury + Precision',
      'Arms (default)',
    ])
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
