import { describe, expect, it } from 'vitest'
import { itemsById } from '@/lib/items'
import type { ClassId } from '@/sim'
import { ENCHANT_LINE_SLOTS } from './enchants'
import { ammoNote, paneGroups, slotGroups } from './slots'

describe('paneGroups (docs/ux.md "Gear", the wide layout)', () => {
  it('holds every slot once, in the character pane’s order', () => {
    const classes: ClassId[] = ['warrior', 'druid', 'paladin', 'shaman', 'rogue', 'mage', 'warlock', 'priest', 'hunter']
    for (const classId of classes) {
      const pane = paneGroups(classId).flatMap((g) => g.slots)
      expect([...pane].sort(), classId).toEqual(slotGroups(classId).flatMap((g) => g.slots).sort())
      expect(new Set(pane).size).toBe(pane.length)
    }
    expect(paneGroups('hunter').map((g) => [g.side, g.slots])).toEqual([
      ['left', ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist']],
      ['right', ['hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2']],
      ['bottom', ['mainHand', 'offHand', 'ranged', 'ammo', 'quiver']],
    ])
  })

  it('gives an enchant line to the slots enchants go on', () => {
    expect([...ENCHANT_LINE_SLOTS].sort()).toEqual(['back', 'chest', 'feet', 'hands', 'head', 'legs', 'mainHand', 'neck', 'offHand', 'shoulder', 'wrist'])
  })
})

describe('ammoNote (docs/mechanics/ranged-and-pets.md §1)', () => {
  const item = (id: number) => itemsById.get(id)!
  const arrow = item(274387) // Swiftfeather Arrow
  const bullet = item(274388) // Swiftstrike Shot

  it('says why ammo does nothing with the ranged weapon', () => {
    expect(ammoNote(arrow, item(2099))).toBe('For bows and crossbows: your gun fires bullets')
    expect(ammoNote(bullet, item(12653))).toBe('For guns: your bow fires arrows')
    expect(ammoNote(bullet, item(19107))).toBe('For guns: your crossbow fires arrows')
    expect(ammoNote(arrow, item(13173))).toBe('For bows and crossbows: a thrown weapon fires no ammo')
  })

  it('is null for ammo the weapon fires, with no ranged weapon, and for other items', () => {
    expect(ammoNote(arrow, item(12653))).toBeNull()
    expect(ammoNote(bullet, item(2099))).toBeNull()
    expect(ammoNote(arrow, undefined)).toBeNull()
    expect(ammoNote(item(19319), item(2099))).toBeNull()
  })
})
