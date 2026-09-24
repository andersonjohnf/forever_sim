import { describe, expect, it } from 'vitest'
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData } from '@/data/items/types'
import raceJson from '@/data/races/races.json'
import type { RaceData } from '@/data/races/types'
import { decodeTalentCode, validateTalentBuild } from '@/data/talents/types'
import { ammoKind, DEFAULT_SUPPLIES, defaultConfig, matchSupplies, TALENT_DATA } from './defaults'
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

describe('matchSupplies (docs/classes/hunter.md#73-gear)', () => {
  const pool = (itemJson as unknown as ItemData).items
  const item = (id: number) => pool.find((i) => i.id === id)!
  const gun = item(2099) // Dwarven Hand Cannon
  const bow = item(12653) // Riphook
  const crossbow = item(19107) // Bloodseeker
  const thrown = item(13173) // Flightblade Throwing Axe

  it('knows what each ranged weapon fires', () => {
    expect([gun, bow, crossbow, thrown, undefined].map(ammoKind)).toEqual(['bullet', 'arrow', 'arrow', null, null])
  })

  it('swaps arrows and a quiver for bullets and a pouch when a gun replaces a bow, as defaultGear picks', () => {
    const gear = { ranged: { itemId: bow.id }, ammo: { itemId: DEFAULT_SUPPLIES.arrows }, quiver: { itemId: DEFAULT_SUPPLIES.quiver } }
    expect(matchSupplies(gear, gun)).toEqual({
      ranged: { itemId: bow.id },
      ammo: { itemId: DEFAULT_SUPPLIES.bullets },
      quiver: { itemId: DEFAULT_SUPPLIES.pouch },
    })
    expect(matchSupplies({ ammo: { itemId: DEFAULT_SUPPLIES.bullets }, quiver: { itemId: DEFAULT_SUPPLIES.pouch } }, crossbow)).toEqual({
      ammo: { itemId: DEFAULT_SUPPLIES.arrows },
      quiver: { itemId: DEFAULT_SUPPLIES.quiver },
    })
  })

  it('keeps the ammo’s damage: arrows become their bullet twin, else the closest bullet (VF3)', () => {
    // Swiftfeather Arrow 274387 ↔ Swiftstrike Shot 274388, both 24.617; Doomshot 12654 (20.244) has
    // no twin, so it becomes Miniature Cannon Balls 13377 (20.901), the closest bullet.
    expect(matchSupplies({ ammo: { itemId: 274387 } }, gun)).toEqual({ ammo: { itemId: 274388 } })
    expect(matchSupplies({ ammo: { itemId: 274388 } }, bow)).toEqual({ ammo: { itemId: 274387 } })
    expect(matchSupplies({ ammo: { itemId: 12654 } }, gun)).toEqual({ ammo: { itemId: 13377 } })
    // A tie (Thorium Shells and Thorium Headed Arrow, 17.715) keeps to the default.
    expect(matchSupplies({ ammo: { itemId: DEFAULT_SUPPLIES.bullets } }, bow)).toEqual({ ammo: { itemId: DEFAULT_SUPPLIES.arrows } })
  })

  it('keeps the quiver’s haste: a 13% quiver becomes the 13% pouch', () => {
    // Quickdraw Quiver 8217 and Thick Leather Ammo Pouch 8218, both 13% (ranged-and-pets.md §1).
    expect(matchSupplies({ quiver: { itemId: 8217 } }, gun)).toEqual({ quiver: { itemId: 8218 } })
    expect(matchSupplies({ quiver: { itemId: 2663 } }, bow)).toEqual({ quiver: { itemId: 2662 } })
    // Ancient Sinew Wrapped Lamina (15%) has one 15% pouch, Gnoll Skin Bandolier.
    expect(matchSupplies({ quiver: { itemId: 18714 } }, gun)).toEqual({ quiver: { itemId: DEFAULT_SUPPLIES.pouch } })
  })

  it('leaves supplies the weapon uses, and a thrown weapon’s, alone', () => {
    const gear = { ammo: { itemId: 274387 }, quiver: { itemId: 18714 } }
    expect(matchSupplies(gear, bow)).toBe(gear)
    expect(matchSupplies(gear, thrown)).toBe(gear)
    expect(matchSupplies(gear, null)).toBe(gear)
    expect(matchSupplies({}, gun)).toEqual({})
  })

  it('gives every hunter spec ammo its default ranged weapon fires', () => {
    for (const spec of SPEC_IDS.filter((s) => SPEC_META[s].classId === 'hunter')) {
      const gear = defaultConfig(spec).gear
      expect(matchSupplies(gear, item(gear.ranged!.itemId))).toBe(gear)
    }
  })
})
