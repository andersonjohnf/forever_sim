import { describe, expect, it } from 'vitest'
import type { GearSlot, SimConfig } from '@/sim'
import { defaultGearFor, equipEffect, slotsOffDefault } from './default-set'

// The Gear tab's line says what equipping the default set does to the slots that differ (docs/ux.md "Gear").
describe('equipEffect', () => {
  const held = (...slots: GearSlot[]): SimConfig['gear'] => Object.fromEntries(slots.map((slot) => [slot, { itemId: 1 }]))
  /** A default set that fills every slot but these. */
  const allBut = (...empty: GearSlot[]): SimConfig['gear'] =>
    held(...(['head', 'neck', 'back', 'legs', 'feet', 'mainHand', 'offHand', 'ranged', 'ammo', 'quiver'] as GearSlot[]).filter((s) => !empty.includes(s)))
  const full = allBut()

  it('replaces slots that hold something: that slot, both, all N', () => {
    expect(equipEffect(held('head'), ['head'], full)).toBe('replaces that slot')
    expect(equipEffect(held('head', 'neck'), ['head', 'neck'], full)).toBe('replaces both')
    expect(equipEffect(held('head', 'neck', 'legs'), ['head', 'neck', 'legs'], full)).toBe('replaces all 3')
  })

  it('fills empty slots, as after Remove all gear', () => {
    expect(equipEffect({}, ['head'], full)).toBe('fills that slot')
    expect(equipEffect({}, ['head', 'neck'], full)).toBe('fills both')
    expect(equipEffect({}, ['head', 'neck', 'legs', 'feet'], full)).toBe('fills all 4')
  })

  it('says both for a mix, each count kept with the word before it (LC-4)', () => {
    expect(equipEffect(held('head'), ['head', 'neck'], full)).toBe('fills 1 empty slot and replaces the other')
    expect(equipEffect(held('head', 'legs', 'feet'), ['head', 'neck', 'back', 'legs', 'feet'], full)).toBe(
      'fills 2 empty slots and replaces the other 3',
    )
  })

  it('counts only the slots that differ', () => {
    // The chest holds an item but matches the default, so it isn't listed and doesn't count.
    expect(equipEffect(held('chest', 'head'), ['head', 'neck'], full)).toBe('fills 1 empty slot and replaces the other')
  })

  it('clears, by name, a slot the default leaves empty but the player filled (LC-2)', () => {
    // An Arms warrior's own off hand beside a one-hander: the default two-hander clears it.
    expect(equipEffect(held('offHand'), ['offHand'], allBut('offHand'))).toBe('clears Off hand')
    expect(equipEffect(held('mainHand', 'offHand'), ['mainHand', 'offHand'], allBut('offHand'))).toBe('replaces 1 slot and clears Off hand')
    expect(equipEffect(held('head', 'neck', 'ammo', 'quiver'), ['head', 'neck', 'ammo', 'quiver'], allBut('ammo', 'quiver'))).toBe(
      'replaces 2 slots and clears Ammo and Quiver',
    )
    expect(equipEffect(held('ranged'), ['head', 'ranged'], allBut('ranged'))).toBe('fills 1 empty slot and clears Ranged')
    expect(equipEffect(held('mainHand', 'offHand', 'ammo'), ['head', 'neck', 'mainHand', 'offHand', 'ammo'], allBut('offHand', 'ammo', 'quiver'))).toBe(
      'fills 2 empty slots, replaces 1 and clears Off hand and Ammo',
    )
    expect(equipEffect(held('offHand', 'ammo', 'quiver'), ['offHand', 'ammo', 'quiver'], allBut('offHand', 'ammo', 'quiver'))).toBe(
      'clears Off hand, Ammo and Quiver',
    )
  })

  it('reads the real defaults: an Arms warrior who took up a one-hander and an off hand', () => {
    const defaults = defaultGearFor('warrior-arms', 'Human')
    expect(defaults.offHand).toBeUndefined()
    // Ironfoe and Mirah's Song, the Fury set's weapons.
    const config = { spec: 'warrior-arms' as const, race: 'Human', gear: { ...defaults, mainHand: { itemId: 11684 }, offHand: { itemId: 15806 } } }
    const off = slotsOffDefault(config)
    expect(off).toEqual(['mainHand', 'offHand'])
    expect(equipEffect(config.gear, off, defaults)).toBe('replaces 1 slot and clears Off hand')
  })
})
