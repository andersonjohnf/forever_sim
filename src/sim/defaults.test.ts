import { describe, expect, it } from 'vitest'
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData } from '@/data/items/types'
import raceJson from '@/data/races/races.json'
import type { RaceData } from '@/data/races/types'
import { decodeTalentCode, validateTalentBuild } from '@/data/talents/types'
import { defaultConfig, TALENT_DATA } from './defaults'
import { fitsFaction, uniqueConflicts } from './equip'
import { SPEC_IDS, SPEC_META } from './specs'
import type { GearSlot, SpecId } from './types'

const items = new Map((itemJson as unknown as ItemData).items.map((i) => [i.id, i]))
const raceData = raceJson as unknown as RaceData
const races = raceData.races

/** Which item equip slots may go in each gear slot. */
const FITS: Record<GearSlot, string[]> = {
  head: ['head'], neck: ['neck'], shoulder: ['shoulder'], back: ['back'], chest: ['chest'],
  wrist: ['wrist'], hands: ['hands'], waist: ['waist'], legs: ['legs'], feet: ['feet'],
  finger1: ['finger'], finger2: ['finger'], trinket1: ['trinket'], trinket2: ['trinket'],
  mainHand: ['mainHand'], offHand: ['offHand'], ranged: ['ranged'], ammo: ['ammo'], quiver: ['quiver'],
}

describe.each(SPEC_IDS)('default setup for %s', (spec) => {
  const config = defaultConfig(spec)
  const meta = SPEC_META[spec]

  it('uses a legal talent build for the class', () => {
    const data = TALENT_DATA[meta.classId]
    expect(validateTalentBuild(data, decodeTalentCode(data, config.talents))).toEqual([])
  })

  it('uses a race that can be the class in Forever', () => {
    const race = races.find((r) => r.id === config.race)
    expect(race?.classes.forever).toContain(meta.classId)
  })

  it('equips pool items in slots they fit', () => {
    const equipped = Object.entries(config.gear)
    expect(equipped.length).toBeGreaterThanOrEqual(15)
    for (const [slot, { itemId }] of equipped) {
      const item = items.get(itemId)
      expect(item, `${slot}: ${itemId}`).toBeDefined()
      expect(item!.equipSlots.some((s) => FITS[slot as GearSlot].includes(s)), `${slot}: ${item!.name}`).toBe(true)
    }
  })

  // docs/data/items.md#equipping-rules: for every race the class can be, the gear is the race's
  // faction's, breaks no Unique or Unique-Equipped rule, and keeps two distinct rings and trinkets.
  it.each(raceData.simClassAvailability[meta.classId].forever)('is legal for a %s', (race) => {
    const gear = defaultConfig(spec, race).gear
    expect(defaultConfig(spec, race).race).toBe(race)
    const worn: Partial<Record<GearSlot, Item>> = {}
    for (const [slot, { itemId }] of Object.entries(gear) as [GearSlot, { itemId: number }][]) {
      const item = items.get(itemId)!
      expect(fitsFaction(race, item), `${slot}: ${item.name}`).toBe(true)
      expect(uniqueConflicts(worn, slot, item), `${slot}: ${item.name}`).toEqual([])
      worn[slot] = item
    }
    for (const [a, b] of [['finger1', 'finger2'], ['trinket1', 'trinket2']] as const) {
      if (gear[a] && gear[b]) expect(gear[a].itemId, `${a}/${b}`).not.toBe(gear[b].itemId)
    }
  })
})

describe('default gear by faction (docs/data/items.md#equipping-rules)', () => {
  const ids = (spec: SpecId, race: string, slots: GearSlot[]) => slots.map((s) => defaultConfig(spec, race).gear[s]?.itemId)

  it('gives an Alliance warrior the Alliance PvP twins and a Horde one the Horde twins', () => {
    // Lieutenant Commander's Plate Shoulders, Knight-Lieutenant's Plate Greaves / Champion's, Blood Guard's.
    for (const spec of ['warrior-fury', 'warrior-arms'] as const) {
      expect(ids(spec, 'alliance-human', ['shoulder', 'feet'])).toEqual([23315, 23287])
      expect(ids(spec, 'alliance-dwarf', ['shoulder', 'feet'])).toEqual([23315, 23287])
      expect(ids(spec, 'horde-orc', ['shoulder', 'feet'])).toEqual([23243, 22858])
      expect(ids(spec, 'horde-undead', ['shoulder', 'feet'])).toEqual([23243, 22858])
    }
    // Knight-Captain's / Legionnaire's Plate Hauberk.
    expect(ids('warrior-protection', 'alliance-gnome', ['shoulder', 'chest', 'feet'])).toEqual([23315, 23300, 23287])
    expect(ids('warrior-protection', 'horde-tauren', ['shoulder', 'chest', 'feet'])).toEqual([23243, 22872, 22858])
  })

  it('gives each faction its own rank-3 cloak', () => {
    expect(ids('druid-feral-bear', 'alliance-night-elf', ['back'])).toEqual([18461]) // Sergeant's Cloak
    expect(ids('druid-feral-bear', 'horde-tauren', ['back'])).toEqual([16342]) // Sergeant's Cape
  })

  it('opens with the default race’s gear', () => {
    expect(defaultConfig('warrior-fury')).toEqual(defaultConfig('warrior-fury', 'alliance-human'))
    expect(defaultConfig('druid-feral-cat')).toEqual(defaultConfig('druid-feral-cat', 'horde-tauren'))
  })
})
