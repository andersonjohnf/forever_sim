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
  'warrior-fury': ['Human', '13/38/0', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'warrior-arms': ['Human', '35/16/0', 'Pre-raid best in slot', 'Standard raid', 'Default', '3:00'],
  'warrior-protection': ['Human', '13/5/33', 'Threat set', 'Standard raid', 'Balanced', '3:00'],
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

    // Review finding DL2-6: a setting the line doesn't name still shows it's been changed.
    it('Fight: a setting the line doesn’t name adds "changed", with the level where it’s named', () => {
      for (const fight of [{ bossArmor: base.fight.bossArmor + 1 }, { durationVariationPct: 0 }, { zone: base.fight.zone === 'other' ? ('hyjal' as const) : ('other' as const) }]) {
        const after = { ...base, fight: { ...base.fight, ...fight } }
        expect(changedSections(base, after), JSON.stringify(fight)).toEqual(['fight'])
        expect(sectionSummaries(after).fight).toBe('3:00 · changed')
      }
      const seeded = { ...base, run: { ...base.run, seed: base.run.seed + 1 } }
      expect(sectionSummaries(seeded).fight).toBe('3:00 · changed')
      const lower = { ...seeded, fight: { ...seeded.fight, bossLevel: 62, durationSec: 900 } }
      expect(sectionSummaries(lower).fight).toBe('15:00 · level 62 · changed')
    })

    it('Character: a rule the line doesn’t name adds "changed", after the rules profile', () => {
      const ratings = { ...base, rules: { ...base.rules, unmeasuredRatings: base.rules.unmeasuredRatings === 'apply' ? ('ignore' as const) : ('apply' as const) } }
      expect(changedSections(base, ratings)).toEqual(['character'])
      expect(sectionSummaries(ratings).character).toBe(`${DEFAULTS[spec][0]} · changed`)
      const classic = { ...ratings, rules: { ...ratings.rules, profile: 'classicEra' as const } }
      expect(sectionSummaries(classic).character).toBe(`${DEFAULTS[spec][0]} · Classic Era · changed`)
    })
  })

  it('counts a Fight setting only where the Fight tab shows it', () => {
    // The execute phase is a warrior's or paladin's; a DPS warrior's damage taken; a tank's boss swings.
    const mage = fresh('mage-fire')
    expect(sectionSummaries({ ...mage, fight: { ...mage.fight, executePct: mage.fight.executePct > 0 ? 0 : 20 } }).fight).toBe('3:00')
    expect(sectionSummaries({ ...mage, fight: { ...mage.fight, damageTakenPerSec: mage.fight.damageTakenPerSec + 100 } }).fight).toBe('3:00')
    expect(sectionSummaries({ ...mage, fight: { ...mage.fight, boss: { ...mage.fight.boss, canCrush: !mage.fight.boss.canCrush } } }).fight).toBe('3:00')
    const fury = fresh('warrior-fury')
    expect(sectionSummaries({ ...fury, fight: { ...fury.fight, executePct: fury.fight.executePct > 0 ? 0 : 20 } }).fight).toBe('3:00 · changed')
    expect(sectionSummaries({ ...fury, fight: { ...fury.fight, damageTakenPerSec: fury.fight.damageTakenPerSec + 100 } }).fight).toBe('3:00 · changed')
    const prot = fresh('warrior-protection')
    expect(sectionSummaries({ ...prot, fight: { ...prot.fight, damageTakenPerSec: prot.fight.damageTakenPerSec + 100 } }).fight).toBe('3:00')
    expect(sectionSummaries({ ...prot, fight: { ...prot.fight, boss: { ...prot.fight.boss, canCrush: !prot.fight.boss.canCrush } } }).fight).toBe('3:00 · changed')
    expect(sectionSummaries({ ...prot, fight: { ...prot.fight, boss: { ...prot.fight.boss, damageMax: prot.fight.boss.damageMax + 1 } } }).fight).toBe('3:00 · changed')
    // Fixed precision's number of fights counts only while it's fixed, as the tab shows it.
    expect(sectionSummaries({ ...mage, run: { ...mage.run, iterations: mage.run.iterations + 1 } }).fight).toBe('3:00')
  })

  it('counts a paladin’s untested rules as a Character change, only for a paladin', () => {
    const ret = fresh('paladin-retribution')
    const prot = fresh('paladin-protection')
    expect(sectionSummaries({ ...prot, rules: { ...prot.rules, hotrWeaponDps: 'withAttackPower' } }).character).toBe('Human · changed')
    expect(sectionSummaries({ ...ret, rules: { ...ret.rules, hotrWeaponDps: 'withAttackPower' } }).character).toBe('Human')
    const fury = fresh('warrior-fury')
    expect(sectionSummaries({ ...fury, rules: { ...fury.rules, hotrWeaponDps: 'withAttackPower' } }).character).toBe('Human')
  })

  it('lets a Skyborne race’s variant, then the rules, give way to "changed" where the line would run long', () => {
    const base = fresh('warrior-fury')
    const skyborne = changeRace(base, 'alliance-skyborne-high-order').config
    const ratings = { ...skyborne.rules, unmeasuredRatings: skyborne.rules.unmeasuredRatings === 'apply' ? ('ignore' as const) : ('apply' as const) }
    expect(sectionSummaries({ ...skyborne, rules: ratings }).character).toBe('Skyborne · changed')
    expect(sectionSummaries({ ...skyborne, rules: { ...ratings, profile: 'classicEra' } }).character).toBe('Skyborne · changed')
    const nightElf = changeRace(base, 'alliance-night-elf').config
    expect(sectionSummaries({ ...nightElf, rules: { ...ratings, profile: 'classicEra' } }).character).toBe('Night Elf · changed')
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
          for (const unmeasuredRatings of ['apply', 'ignore'] as const) {
            lines.add(sectionSummaries({ ...base, race: race.id, rules: { ...base.rules, profile, unmeasuredRatings } }).character)
          }
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
      lines.add(sectionSummaries({ ...base, fight: { ...base.fight, durationSec: 900, bossLevel: 60 }, run: { ...base.run, seed: base.run.seed + 1 } }).fight)
    }
    expect(GEAR_SLOTS.length).toBeLessThan(100) // "19 slots changed": two digits at most
    expect([...lines].filter((line) => line.length > SUMMARY_MAX_CHARS)).toEqual([])
  })
})
