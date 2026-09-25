import { describe, expect, it } from 'vitest'
import raceJson from '@/data/races/races.json'
import { racesForClass, type RaceData } from '@/data/races/types'
import { maintainedBuffIds } from '@/features/buffs/active-preset'
import { changeRace } from '@/features/character/faction-gear'
import {
  aplPresets,
  applyAplPreset,
  buffPresets,
  defaultAplOrder,
  defaultConfig,
  GEAR_SLOTS,
  getSpec,
  normalizeConfig,
  presetBuffs,
  SPEC_IDS,
  SPEC_META,
  talentPresets,
  type SimConfig,
  type SpecId,
} from '@/sim'
import { SUMMARY_MAX_CHARS, sectionSummaries } from './section-summary'
import { SECTION_IDS, type Section } from './setup-store'

const raceData = raceJson as unknown as RaceData

/** A spec's setup as a first visit loads it (setup-store.ts `fresh`). */
const fresh = (spec: SpecId): SimConfig => normalizeConfig(defaultConfig(spec)).config

/** Every spec's default setup, tab by tab: race, tree split, gear, Buffs preset, Rotation preset, fight. */
const DEFAULTS: Record<SpecId, [string, string, string, string, string, string]> = {
  'warrior-fury': ['Human', '17/34/0', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'warrior-arms': ['Human', '37/14/0', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'warrior-protection': ['Human', '8/5/38', 'Threat set', 'Standard raid', 'Balanced', '3:00'],
  'druid-feral-cat': ['Tauren', '9/37/5', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'druid-feral-bear': ['Tauren', '9/42/0', 'Threat set', 'Standard raid', 'Balanced', '3:00'],
  'druid-balance': ['Tauren', '41/5/0', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'paladin-retribution': ['Human', '9/8/34', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'paladin-protection': ['Human', '8/35/8', 'Threat set', 'Standard raid', 'Balanced', '3:00'],
  'shaman-enhancement': ['Orc', '8/33/10', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'shaman-elemental': ['Orc', '31/4/16', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'rogue-combat': ['Human', '18/33/0', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'rogue-assassination': ['Human', '38/11/2', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'rogue-subtlety': ['Human', '15/0/36', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'mage-fire': ['Troll', '14/32/5', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'mage-frost': ['Troll', '21/0/30', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'mage-arcane': ['Troll', '31/20/0', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'warlock-destruction': ['Orc', '7/11/33', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'warlock-affliction': ['Orc', '35/11/5', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'warlock-demonology': ['Orc', '0/31/20', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'priest-shadow': ['Troll', '20/0/31', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'hunter-marksmanship': ['Orc', '10/41/0', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'hunter-beast-mastery': ['Orc', '31/20/0', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'hunter-survival': ['Orc', '0/21/30', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
}

/** The sections whose summary differs between two setups. */
function changedSections(before: SimConfig, after: SimConfig): Section[] {
  const a = sectionSummaries(before)
  const b = sectionSummaries(after)
  return SECTION_IDS.filter((s) => a[s] !== b[s])
}

describe('sectionSummaries', () => {
  it('covers every spec', () => {
    expect(Object.keys(DEFAULTS).sort()).toEqual([...SPEC_IDS].sort())
  })

  it.each(SPEC_IDS)('reads %s’s default setup in six short lines', (spec) => {
    const [character, talents, gear, buffs, rotation, fight] = DEFAULTS[spec]
    expect(sectionSummaries(fresh(spec))).toEqual({ character, talents, gear, buffs, rotation, fight })
  })

  describe.each(SPEC_IDS)('%s: one change moves only its own tab’s line', (spec) => {
    const base = fresh(spec)

    it('Character: the rules profile', () => {
      const after = { ...base, rules: { ...base.rules, profile: 'classicEra' as const } }
      expect(changedSections(base, after)).toEqual(['character'])
      expect(sectionSummaries(after).character).toBe(`${DEFAULTS[spec][0]} · Classic Era`)
    })

    it('Character: every other race, changed as the Character tab changes it', () => {
      for (const race of racesForClass(raceData, SPEC_META[spec].classId)) {
        if (race.id === base.race) continue
        const after = changeRace(base, race.id).config
        expect(changedSections(base, after), race.id).toEqual(['character'])
        expect(sectionSummaries(after).character).toBe(race.name)
      }
    })

    it('Talents: a cleared build', () => {
      const after = { ...base, talents: '' }
      expect(changedSections(base, after)).toEqual(['talents'])
      expect(sectionSummaries(after).talents).toBe('0/0/0')
    })

    it('Gear: one slot, then two, off the default set', () => {
      const one = { ...base, gear: { ...base.gear, head: undefined } }
      expect(changedSections(base, one)).toEqual(['gear'])
      expect(sectionSummaries(one).gear).toBe('1 slot changed')
      const two = { ...one, gear: { ...one.gear, neck: undefined } }
      expect(sectionSummaries(two).gear).toBe('2 slots changed')
    })

    it('Gear: every slot empty is "No gear", not a count of changed slots (DA-7)', () => {
      expect(sectionSummaries({ ...base, gear: {} }).gear).toBe('No gear')
      const cleared = Object.fromEntries(Object.keys(base.gear).map((slot) => [slot, undefined]))
      expect(sectionSummaries({ ...base, gear: cleared }).gear).toBe('No gear')
    })

    it('Buffs: another preset, then a buff off it', () => {
      const max = { ...base, buffs: { ...base.buffs, enabled: presetBuffs('max', spec, base.buffs.raid) } }
      expect(changedSections(base, max)).toEqual(['buffs'])
      expect(sectionSummaries(max).buffs).toBe('Max consumables')
      // The raid preset less one buff you choose (not one your rotation keeps up): no preset has exactly that.
      const maintained = maintainedBuffIds(base)
      const dropped = base.buffs.enabled.find((id) => !maintained.has(id))
      const custom = { ...base, buffs: { ...base.buffs, enabled: base.buffs.enabled.filter((id) => id !== dropped) } }
      expect(changedSections(base, custom)).toEqual(['buffs'])
      expect(sectionSummaries(custom).buffs).toBe('Custom')
    })

    it('Rotation: the list reordered', () => {
      const apl = getSpec(spec).rotationApl!
      const after = normalizeConfig({ ...base, rotationOrder: defaultAplOrder(apl).toReversed() }).config
      expect(changedSections(base, after)).toEqual(['rotation'])
      expect(sectionSummaries(after).rotation).toBe('Custom')
    })

    it('Rotation: each named preset by its name', () => {
      const apl = getSpec(spec).rotationApl!
      for (const preset of aplPresets(apl)) {
        const picked = applyAplPreset(apl, base.rotation, preset.id)!
        const after = normalizeConfig({ ...base, rotation: picked.rotation, rotationOrder: picked.rotationOrder }).config
        expect(sectionSummaries(after).rotation).toBe(preset.label)
        expect(changedSections(base, after).filter((s) => s !== 'rotation')).toEqual([])
      }
    })

    it('Fight: the length, then the boss level', () => {
      const longer = { ...base, fight: { ...base.fight, durationSec: 300 } }
      expect(changedSections(base, longer)).toEqual(['fight'])
      expect(sectionSummaries(longer).fight).toBe('5:00')
      const lower = { ...base, fight: { ...base.fight, bossLevel: 62 } }
      expect(changedSections(base, lower)).toEqual(['fight'])
      expect(sectionSummaries(lower).fight).toBe('3:00 · level 62')
    })
  })

  it('names each Buffs preset the Buffs tab offers', () => {
    const base = fresh('warrior-fury')
    for (const preset of buffPresets) {
      const after = { ...base, buffs: { ...base.buffs, enabled: presetBuffs(preset.id, base.spec, base.buffs.raid) } }
      expect(sectionSummaries(after).buffs).toBe(preset.name)
    }
  })

  it('matches a Buffs preset without the buffs the rotation keeps up itself, as the Buffs tab does (D26)', () => {
    // Fury keeps its own Battle Shout up (warrior.md §5.2 row 1): its switch on the Buffs tab is
    // locked on, so whether the saved list holds it doesn't change the preset.
    const base = fresh('warrior-fury')
    expect(maintainedBuffIds(base).has('battleShout')).toBe(true)
    const withShout = { ...base, buffs: { ...base.buffs, enabled: [...base.buffs.enabled.filter((id) => id !== 'battleShout'), 'battleShout'] } }
    const withoutShout = { ...base, buffs: { ...base.buffs, enabled: base.buffs.enabled.filter((id) => id !== 'battleShout') } }
    expect(sectionSummaries(withShout).buffs).toBe('Standard raid')
    expect(sectionSummaries(withoutShout).buffs).toBe('Standard raid')
  })

  it('shows a fight under a minute, and the longest, as the Fight tab does', () => {
    const base = fresh('mage-fire')
    expect(sectionSummaries({ ...base, fight: { ...base.fight, durationSec: 45 } }).fight).toBe('0:45')
    expect(sectionSummaries({ ...base, fight: { ...base.fight, durationSec: 900, bossLevel: 60 } }).fight).toBe('15:00 · level 60')
  })

  it('counts an unreadable talent code as no points, as the Talents tab shows it', () => {
    expect(sectionSummaries({ ...fresh('rogue-combat'), talents: 'not a code' }).talents).toBe('0/0/0')
  })

  it('shortens a Skyborne race under Classic Era rules to fit, keeping the rules', () => {
    const base = fresh('warrior-fury')
    const after = { ...changeRace(base, 'alliance-skyborne-high-order').config, rules: { ...base.rules, profile: 'classicEra' as const } }
    expect(sectionSummaries(after).character).toBe('Skyborne · Classic Era')
  })

  it(`keeps every line within ${SUMMARY_MAX_CHARS} characters`, () => {
    const lines = new Set<string>()
    for (const spec of SPEC_IDS) {
      const base = fresh(spec)
      const classId = SPEC_META[spec].classId
      for (const race of racesForClass(raceData, classId)) {
        for (const profile of ['forever', 'classicEra'] as const) {
          const s = sectionSummaries({ ...base, race: race.id, rules: { ...base.rules, profile } })
          lines.add(s.character)
        }
      }
      for (const preset of talentPresets(classId)) lines.add(sectionSummaries({ ...base, talents: preset.code }).talents)
      lines.add(sectionSummaries({ ...base, gear: {} }).gear)
      // The most slots a count names: all but one emptied (an empty set is "No gear").
      const [kept] = Object.entries(base.gear).filter(([, item]) => item)
      lines.add(sectionSummaries({ ...base, gear: Object.fromEntries([kept]) }).gear)
      const apl = getSpec(spec).rotationApl!
      for (const preset of aplPresets(apl)) lines.add(preset.label)
      for (const preset of buffPresets) lines.add(preset.name)
      lines.add(sectionSummaries({ ...base, fight: { ...base.fight, durationSec: 900, bossLevel: 60 } }).fight)
    }
    expect(GEAR_SLOTS.length).toBeLessThan(100) // "19 slots changed": two digits at most
    expect([...lines].filter((line) => line.length > SUMMARY_MAX_CHARS)).toEqual([])
  })
})
