// Codes written on older talent trees, mapped onto today's by name (docs/data/talents.md#tree-versions).
import { describe, expect, it } from 'vitest'
import frozenJson from '@/data/talents/frozen.json'
import { decodeTalentCode, type FrozenTalentOrders, validateTalentBuild } from '@/data/talents/types'
import storedBuildsJson from '../../../scripts/scrape/stored-builds.json'
import { TALENT_DATA } from '../defaults'
import type { ClassId } from '../types'
import { CONFIG_VERSION, migrateTalentCode, refundNotice, RENAMED_TALENTS, TALENT_TREES_OF_VERSION } from './talent-trees'

const frozen = frozenJson as unknown as FrozenTalentOrders
const OLD = '1.60.1.69913'
type Codes = Record<string, Record<string, { note: string; ranks: string[] }>>
const legacy = (storedBuildsJson as unknown as { legacy: Record<string, Codes> }).legacy[OLD]

/** A build on today's trees as "Name rank" per tree, as stored-builds.json lists it. */
const byName = (classId: ClassId, code: string) => {
  const data = TALENT_DATA[classId]
  const ranks = decodeTalentCode(data, code)
  return data.trees.map((tree) =>
    tree.talents
      .filter((t) => ranks[t.id])
      .sort((a, b) => a.order - b.order)
      .map((t) => `${t.name} ${ranks[t.id]}`)
      .join(', '),
  )
}

describe('setup versions', () => {
  it('version 1 is 1.60.1.69913’s trees, frozen; version 2, today’s', () => {
    expect(CONFIG_VERSION).toBe(2)
    expect(TALENT_TREES_OF_VERSION).toEqual({ 1: OLD })
    expect(Object.keys(frozen.builds)).toEqual([OLD])
    for (const data of Object.values(TALENT_DATA)) expect(data.meta.foreverBuild, data.class).toBe('1.60.1.70009')
  })

  it('names each renamed talent as today’s trees do, where the old one was: the same spell in the same cell', () => {
    for (const [classId, renames] of Object.entries(RENAMED_TALENTS[OLD]) as [ClassId, Record<string, string>][]) {
      const old = frozen.builds[OLD].classes[classId].flatMap((tree) => tree.talents)
      const now = TALENT_DATA[classId].trees.flatMap((tree) => tree.talents)
      for (const [from, to] of Object.entries(renames)) {
        const [, max, spellId, tier, col] = old.find(([name]) => name === from)!
        expect(now.find((t) => t.name === from), from).toBeUndefined()
        expect(now.find((t) => t.name === to), to).toMatchObject({ maxRank: max, spellId, tier, col })
      }
    }
  })
})

describe('migrateTalentCode', () => {
  const classes = Object.entries(legacy).filter(([cls]) => !cls.startsWith('$')) as [ClassId, Codes[string]][]
  it.each(classes.flatMap(([cls, codes]) => Object.keys(codes).map((code) => [cls, code] as const)))(
    'maps %s’s stored 69913 code %s onto a legal build of today’s trees',
    (cls, code) => {
      const data = TALENT_DATA[cls]
      const { code: now, refunds } = migrateTalentCode(data, OLD, code)
      expect(validateTalentBuild(data, decodeTalentCode(data, now))).toEqual([])
      // Every point is kept or refunded.
      const before = [...code.replace(/-/g, '')].reduce((n, d) => n + Number(d), 0)
      const after = [...now.replace(/-/g, '')].reduce((n, d) => n + Number(d), 0)
      expect(after + refunds.reduce((n, r) => n + r.points, 0)).toBe(before)
    },
  )

  it.each([
    ['paladin', '250003-503-052052310012330321', '50003-503-05205231001', 16],
    ['paladin', '240003-0530213321301551-502', '4-0530213321301551-502', 5],
    ['paladin', '2-4530513321301551-502', '-4530513321301551-502', 2],
    ['paladin', '2-4530013321301551-50205', '-4530013321301551-50205', 2],
    ['paladin', '005320213225131051-5032-05', '05320213225131051-5032-05', 0],
    ['shaman', '5504301500103031-04-053250000001', '5504301300103051-04-053250000001', 0],
  ] as const)('maps %s %s to %s, refunding %i points, as docs/data/talents.md’s table says', (cls, from, to, refunded) => {
    const { code, refunds } = migrateTalentCode(TALENT_DATA[cls], OLD, from)
    expect(code).toBe(to)
    expect(refunds.reduce((n, r) => n + r.points, 0)).toBe(refunded)
  })

  it('keeps the trees no build moved exactly as they were', () => {
    for (const cls of ['warrior', 'rogue', 'mage', 'warlock', 'priest', 'hunter'] as const) {
      for (const code of Object.keys(legacy[cls])) expect(migrateTalentCode(TALENT_DATA[cls], OLD, code), code).toEqual({ code, refunds: [] })
    }
  })

  it('Feral Combat: Mangle and Primal Fury keep their points as Primal Bite and Blood Frenzy, in the same code', () => {
    for (const code of Object.keys(legacy.druid)) {
      const { code: now, refunds } = migrateTalentCode(TALENT_DATA.druid, OLD, code)
      expect(now).toBe(code)
      expect(refunds).toEqual([])
      expect(byName('druid', now)).toEqual(legacy.druid[code].ranks.map((r) => r.replace('Mangle', 'Primal Bite').replace('Primal Fury', 'Blood Frenzy')))
    }
  })

  it('Holy: Improved Holy Strike is refunded, and Improved Seals with it when its row loses the 5 points it needs', () => {
    // The guild's lead theorycrafter's Protection build: Improved Holy Strike 2, Divine Strength 4, Improved Seals 3.
    expect(migrateTalentCode(TALENT_DATA.paladin, OLD, '240003-0530213321301551-502')).toEqual({
      code: '4-0530213321301551-502',
      refunds: [
        { name: 'Improved Holy Strike', points: 2, reason: 'removed from the game' },
        { name: 'Improved Seals', points: 3, reason: 'needs 5 points in Holy above it' },
      ],
    })
    // The popular build: only Improved Holy Strike.
    expect(migrateTalentCode(TALENT_DATA.paladin, OLD, '2-4530513321301551-502')).toEqual({
      code: '-4530513321301551-502',
      refunds: [{ name: 'Improved Holy Strike', points: 2, reason: 'removed from the game' }],
    })
    // The Holy build takes none of it: every talent keeps its points, at its new position.
    const holy = migrateTalentCode(TALENT_DATA.paladin, OLD, '005320213225131051-5032-05')
    expect(holy).toEqual({ code: '05320213225131051-5032-05', refunds: [] })
    expect(byName('paladin', holy.code)).toEqual(legacy.paladin['005320213225131051-5032-05'].ranks)
  })

  it('Retribution: Crusade is refunded, and the rows below it lose their gate in turn', () => {
    const { code, refunds } = migrateTalentCode(TALENT_DATA.paladin, OLD, '250003-503-052052310012330321')
    expect(code).toBe('50003-503-05205231001')
    expect(refunds.map((r) => `${r.name} ${r.points}`)).toEqual([
      'Improved Holy Strike 2',
      'Crusade 2',
      'Two-Handed Weapon Specialization 3',
      'Vengeance 3',
      'Champion of the Light 3',
      'Instrument of Law 2',
      'Twist of Light 1',
    ])
  })

  it('Elemental: Elemental Fury and Elemental Alacrity trade places; the default keeps every point', () => {
    const { code, refunds } = migrateTalentCode(TALENT_DATA.shaman, OLD, '5504301500103031-04-053250000001')
    expect(refunds).toEqual([])
    expect(code).toBe('5504301300103051-04-053250000001')
    expect(byName('shaman', code)[0]).toBe(
      'Convection 5, Concussion 5, Reverberation 4, Call of Flame 3, Elemental Focus 1, Elemental Alacrity 3, Call of Thunder 1, Lightning Overload 3, Elemental Fury 5, Lava Burst 1',
    )
  })

  it('Elemental: a build without Elemental Alacrity loses Call of Thunder’s arrow, then Elemental Fury, then the row they held up', () => {
    // Elemental Fury 5, Call of Thunder 1 and Lightning Overload 3, no Elemental Alacrity: legal on 69913's trees.
    const { code, refunds } = migrateTalentCode(TALENT_DATA.shaman, OLD, '550530150010300')
    expect(refunds).toEqual([
      { name: 'Call of Thunder', points: 1, reason: 'needs 3 points in Elemental Alacrity' },
      { name: 'Elemental Fury', points: 5, reason: 'needs 25 points in Elemental above it' },
      { name: 'Lightning Overload', points: 3, reason: 'needs 20 points in Elemental above it' },
    ])
    expect(code).toBe('5505301--')
  })

  it('throws for a code that isn’t a legal build on the old trees', () => {
    expect(() => migrateTalentCode(TALENT_DATA.shaman, OLD, '5505301500103001')).toThrow(/isn't legal on 1.60.1.69913's trees/)
    expect(() => migrateTalentCode(TALENT_DATA.paladin, OLD, '3')).toThrow(/exceeds max rank/)
    expect(() => migrateTalentCode(TALENT_DATA.paladin, OLD, 'x')).toThrow(/Malformed/)
  })
})

describe('refundNotice', () => {
  it('says how many points and where from, in the reasons’ own words', () => {
    expect(refundNotice([{ name: 'Crusade', points: 2, reason: 'removed from the game' }])).toBe(
      'The game’s new talent trees refunded 2 of your talent points: 2 in Crusade (removed from the game).',
    )
    expect(
      refundNotice([
        { name: 'Improved Holy Strike', points: 2, reason: 'removed from the game' },
        { name: 'Improved Seals', points: 3, reason: 'needs 5 points in Holy above it' },
        { name: 'Unyielding Faith', points: 1, reason: 'now 2 ranks' },
      ]),
    ).toBe(
      'The game’s new talent trees refunded 6 of your talent points: 2 in Improved Holy Strike (removed from the game), 3 in Improved Seals (needs 5 points in Holy above it) and 1 in Unyielding Faith (now 2 ranks).',
    )
  })
})
