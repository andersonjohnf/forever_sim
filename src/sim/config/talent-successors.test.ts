// The builds that succeed the codes the sim shipped on older trees (docs/data/talents.md#tree-versions,
// review TM2-1).
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, validateTalentBuild } from '@/data/talents/types'
import storedBuildsJson from '../../../scripts/scrape/stored-builds.json'
import { defaultTalents, TALENT_DATA, talentPresets } from '../defaults'
import { SPEC_META } from '../specs'
import type { ClassId } from '../types'
import { migrateOlderCode, readOnOlderTrees, successorOf, TALENT_SUCCESSORS } from './talent-successors'
import { canonicalFrozenCode, migrateTalentCode, migrationNotice } from './talent-trees'

const OLD = '1.60.1.69913'
type Codes = Record<string, Record<string, { note: string; ranks: string[] }>>
const legacy = (storedBuildsJson as unknown as { legacy: Record<string, Codes> }).legacy[OLD]
const classes = Object.keys(legacy).filter((c) => !c.startsWith('$')) as ClassId[]

describe('TALENT_SUCCESSORS', () => {
  it('has a successor for every code stored-builds.json’s legacy section froze, and nothing else', () => {
    expect(Object.keys(TALENT_SUCCESSORS)).toEqual([OLD])
    expect(Object.keys(TALENT_SUCCESSORS[OLD]).sort()).toEqual([...classes].sort())
    for (const cls of classes) expect(Object.keys(TALENT_SUCCESSORS[OLD][cls]!).sort(), cls).toEqual(Object.keys(legacy[cls]).sort())
  })

  it('names a default of the code’s own class, a preset the class still has, or a legal build of the same digits', () => {
    for (const cls of classes) {
      const data = TALENT_DATA[cls]
      for (const [code, successor] of Object.entries(TALENT_SUCCESSORS[OLD][cls]!)) {
        if ('default' in successor) expect(SPEC_META[successor.default].classId, code).toBe(cls)
        if ('preset' in successor) expect(talentPresets(cls).map((p) => p.name), code).toContain(successor.preset)
        if ('same' in successor) expect(validateTalentBuild(data, decodeTalentCode(data, code)), code).toEqual([])
        // A mapping by name is the current version only when it keeps every point.
        if ('byName' in successor) expect(migrateTalentCode(data, OLD, code).refunds, code).toEqual([])
      }
    }
  })

  it('reads every shipped code as a legal build on today’s trees that loses no point it had a place for', () => {
    for (const cls of classes) {
      const data = TALENT_DATA[cls]
      for (const code of Object.keys(legacy[cls])) {
        const read = migrateOlderCode(data, OLD, code)
        expect(validateTalentBuild(data, decodeTalentCode(data, read.code)), code).toEqual([])
        // A successor carries no refunds: it's the build the sim ships today.
        if (read.successor) expect(read.refunds, code).toEqual([])
      }
    }
  })
})

describe('migrateOlderCode', () => {
  it('reads the old Retribution and Protection defaults as today’s defaults, from today’s defaults', () => {
    const ret = migrateOlderCode(TALENT_DATA.paladin, OLD, '250003-503-052052310012330321')
    expect(ret).toEqual({
      code: defaultTalents('paladin-retribution'),
      refunds: [],
      successor: { label: 'the Retribution default', now: 'today’s default', spec: 'paladin-retribution' },
    })
    expect(migrationNotice(ret)).toBe('Your talents were the Retribution default on the game’s old trees; they’re now today’s default.')
    // A notice that names the spec doesn't name the default's spec again (review TMV-2)...
    expect(migrationNotice(ret, { whose: 'Retribution Paladin', spec: 'paladin-retribution' })).toBe(
      'Your Retribution Paladin talents were the default on the game’s old trees; they’re now today’s default.',
    )
    // ...unless it's another spec's default.
    expect(migrationNotice(ret, { whose: 'Protection Paladin', spec: 'paladin-protection' })).toBe(
      'Your Protection Paladin talents were the Retribution default on the game’s old trees; they’re now today’s default.',
    )
    // A paste speaks of the code.
    expect(migrationNotice(ret, { pasted: true })).toBe('That code was the Retribution default on the game’s old trees; it’s now today’s default.')
    const prot = migrateOlderCode(TALENT_DATA.paladin, OLD, '240003-0530213321301551-502')
    expect(prot.code).toBe(defaultTalents('paladin-protection'))
    expect(prot.refunds).toEqual([])
    // Mapped by name, the two lost 16 and 5 points.
    expect(migrateTalentCode(TALENT_DATA.paladin, OLD, '250003-503-052052310012330321').refunds.reduce((n, r) => n + r.points, 0)).toBe(16)
    expect(migrateTalentCode(TALENT_DATA.paladin, OLD, '240003-0530213321301551-502').refunds.reduce((n, r) => n + r.points, 0)).toBe(5)
  })

  it('reads the popular Protection preset as the preset of the same name today, the same digits', () => {
    const popular = migrateOlderCode(TALENT_DATA.paladin, OLD, '2-4530513321301551-502')
    expect(popular.code).toBe(talentPresets('paladin').find((p) => p.name === 'Protection popular build')!.code)
    expect(popular.code).toBe('2-4530513321301551-502')
    expect(migrationNotice(popular)).toBe('Your talents were the Protection popular build on the game’s old trees; they’re now its version for today’s trees.')
    // T2's interim default, which no preset keeps: the same digits, Divine Strength 2 for Improved Holy Strike 2.
    expect(migrateOlderCode(TALENT_DATA.paladin, OLD, '2-4530013321301551-50205').code).toBe('2-4530013321301551-50205')
  })

  it('says nothing when the successor is what the name mapping gives: Holy, Elemental and the trees that didn’t change', () => {
    expect(migrateOlderCode(TALENT_DATA.paladin, OLD, '005320213225131051-5032-05')).toEqual({ code: '05320213225131051-5032-05', refunds: [] })
    expect(migrateOlderCode(TALENT_DATA.shaman, OLD, '5504301500103031-04-053250000001')).toEqual({ code: defaultTalents('shaman-elemental'), refunds: [] })
    expect(migrateOlderCode(TALENT_DATA.warrior, OLD, '30305013002-050530035150010051-')).toEqual({ code: defaultTalents('warrior-fury'), refunds: [] })
  })

  it('maps a player’s own build by name, with its refunds: only the exact shipped codes have successors', () => {
    // The old Retribution default, one point off in Retribution.
    const own = migrateOlderCode(TALENT_DATA.paladin, OLD, '250003-503-052052310012330311')
    expect(own.successor).toBeUndefined()
    expect(own.code).toBe('50003-503-05205231001')
    expect(own.refunds.reduce((n, r) => n + r.points, 0)).toBe(15)
    expect(successorOf(TALENT_DATA.paladin, OLD, '250003-503-052052310012330311')).toBeNull()
  })

  it('finds a shipped code written with trailing zeros, in canonical form on its own trees (review TMV-1)', () => {
    expect(migrateOlderCode(TALENT_DATA.paladin, OLD, '2500030-5030-052052310012330321').code).toBe(defaultTalents('paladin-retribution'))
    expect(migrateOlderCode(TALENT_DATA.paladin, OLD, '240003-0530213321301551-5020').code).toBe(defaultTalents('paladin-protection'))
    expect(canonicalFrozenCode(TALENT_DATA.paladin, OLD, '2500030-5030-052052310012330321')).toBe('250003-503-052052310012330321')
    expect(canonicalFrozenCode(TALENT_DATA.warrior, OLD, '3500-050-552101233301210531')).toBe('35-05-552101233301210531')
    // Always three segments: the Fury default written without its empty third tree.
    expect(canonicalFrozenCode(TALENT_DATA.warrior, OLD, '30305013002-050530035150010051')).toBe('30305013002-050530035150010051-')
    expect(successorOf(TALENT_DATA.warrior, OLD, '30305013002-050530035150010051')).not.toBeNull()
    // A code that doesn't decode on the old trees has no canonical form there.
    expect(canonicalFrozenCode(TALENT_DATA.paladin, OLD, '99')).toBeNull()
  })

  it('keeps every successor key in canonical form, so the lookup can find it', () => {
    for (const cls of classes) for (const code of Object.keys(TALENT_SUCCESSORS[OLD][cls]!)) expect(canonicalFrozenCode(TALENT_DATA[cls], OLD, code), code).toBe(code)
  })

  it('throws for a code that isn’t a legal build on the old trees', () => {
    expect(() => migrateOlderCode(TALENT_DATA.shaman, OLD, '5505301500103001')).toThrow(/isn't legal on 1.60.1.69913's trees/)
  })
})

describe('readOnOlderTrees', () => {
  it('reads a code legal on 1.60.1.69913’s trees, successors first; null for one legal on none', () => {
    expect(readOnOlderTrees(TALENT_DATA.paladin, '250003-503-052052310012330321')?.code).toBe(defaultTalents('paladin-retribution'))
    expect(readOnOlderTrees(TALENT_DATA.paladin, '2-4530513321301541-502')?.refunds).toEqual([{ name: 'Improved Holy Strike', points: 2, cause: 'removed' }])
    expect(readOnOlderTrees(TALENT_DATA.paladin, '99')).toBeNull()
    expect(readOnOlderTrees(TALENT_DATA.shaman, '5505301500103001')).toBeNull()
  })
})
