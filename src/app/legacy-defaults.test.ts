import { describe, expect, it } from 'vitest'
import raceJson from '@/data/races/races.json'
import type { RaceData } from '@/data/races/types'
import { decodeTalentCode } from '@/data/talents/types'
import { itemsById } from '@/lib/items'
import { GEAR_SLOTS, SPEC_IDS, SPEC_META, TALENT_DATA, type SpecId } from '@/sim'
import { ENCHANTS_BY_ID } from '@/sim/effects/enchants'
import { LEGACY_COMMIT, LEGACY_DEFAULTS } from './legacy-defaults'

// The frozen snapshot saves from before `following` migrate by (docs/architecture.md "Following the
// defaults"): its shape, so a bad regeneration or a hand edit shows up here.

const races = (raceJson as unknown as RaceData).races

describe('the frozen defaults (src/app/legacy-defaults.ts)', () => {
  it('is ee171d2a’s, the last build deployed before saves said what follows the defaults', () => {
    expect(LEGACY_COMMIT).toBe('ee171d2a')
  })

  it('has every spec of that build, each with every race its class can be', () => {
    // Every spec the app has today existed then; a spec added later has no legacy saves.
    for (const spec of SPEC_IDS) {
      const frozen = LEGACY_DEFAULTS[spec]
      expect(frozen, spec).toBeDefined()
      const legal = races.filter((r) => r.classes.forever.includes(SPEC_META[spec].classId)).map((r) => r.id)
      expect(Object.keys(frozen!.races).sort(), spec).toEqual([...legal].sort())
      expect(legal, spec).toContain(frozen!.race)
    }
    for (const spec of Object.keys(LEGACY_DEFAULTS)) expect(SPEC_IDS).toContain(spec)
  })

  it('holds real gear: known slots, items and enchants, and set indices in range', () => {
    for (const [spec, frozen] of Object.entries(LEGACY_DEFAULTS) as [SpecId, (typeof LEGACY_DEFAULTS)[SpecId]][]) {
      expect(frozen!.sets.length, spec).toBeGreaterThan(0)
      for (const set of frozen!.sets) {
        expect(Object.keys(set).length, spec).toBeGreaterThan(10)
        for (const [slot, entry] of Object.entries(set)) {
          expect(GEAR_SLOTS, `${spec} ${slot}`).toContain(slot)
          expect(itemsById.has(entry[0]), `${spec} ${slot} item ${entry[0]}`).toBe(true)
          if (entry[1] !== undefined) expect(ENCHANTS_BY_ID.has(entry[1]), `${spec} ${slot} enchant ${entry[1]}`).toBe(true)
        }
      }
      for (const [race, picks] of Object.entries(frozen!.races)) {
        expect(picks, `${spec} ${race}`).toHaveLength(2)
        for (const i of picks) expect(frozen!.sets[i], `${spec} ${race} set ${i}`).toBeDefined()
      }
      // Every set is some race's: no stray ones.
      expect(new Set(Object.values(frozen!.races).flat()).size, spec).toBe(frozen!.sets.length)
    }
  })

  it('holds each spec’s default talent build then, one that decodes within the class’s points', () => {
    for (const [spec, frozen] of Object.entries(LEGACY_DEFAULTS) as [SpecId, (typeof LEGACY_DEFAULTS)[SpecId]][]) {
      const data = TALENT_DATA[SPEC_META[spec].classId]
      const ranks = decodeTalentCode(data, frozen!.talents)
      const spent = Object.values(ranks).reduce((sum, r) => sum + r, 0)
      // Not always all 51: Balance's popular 41/5/0 spends 46 (druid.md).
      expect(spent, spec).toBeGreaterThan(40)
      expect(spent, spec).toBeLessThanOrEqual(data.rules.maxPoints)
    }
    // The Protection paladin's 0/38/13 from T2's fix round, which a change to the default is about to replace.
    expect(LEGACY_DEFAULTS['paladin-protection']!.talents).toBe('-0530513321301551-50215')
  })
})
