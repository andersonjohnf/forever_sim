import { describe, expect, it } from 'vitest'
import type { GearSlot, SimConfig } from '@/sim'
import { equipEffect } from './default-set'

// The Gear tab's line says what equipping the default set does to the slots that differ (docs/ux.md "Gear").
describe('equipEffect', () => {
  const held = (...slots: GearSlot[]): SimConfig['gear'] => Object.fromEntries(slots.map((slot) => [slot, { itemId: 1 }]))

  it('replaces slots that hold something: that slot, both, all N', () => {
    expect(equipEffect(held('head'), ['head'])).toBe('replaces that slot')
    expect(equipEffect(held('head', 'neck'), ['head', 'neck'])).toBe('replaces both')
    expect(equipEffect(held('head', 'neck', 'legs'), ['head', 'neck', 'legs'])).toBe('replaces all\u00a03')
  })

  it('fills empty slots, as after Remove all gear', () => {
    expect(equipEffect({}, ['head'])).toBe('fills that slot')
    expect(equipEffect({}, ['head', 'neck'])).toBe('fills both')
    expect(equipEffect({}, ['head', 'neck', 'legs', 'feet'])).toBe('fills all\u00a04')
  })

  it('says both for a mix', () => {
    expect(equipEffect(held('head'), ['head', 'neck'])).toBe('fills 1 empty slot and replaces the other')
    expect(equipEffect(held('head', 'legs', 'feet'), ['head', 'neck', 'back', 'legs', 'feet'])).toBe(
      'fills 2 empty slots and replaces the other 3',
    )
  })

  it('counts only the slots that differ', () => {
    // The chest holds an item but matches the default, so it isn't listed and doesn't count.
    expect(equipEffect(held('chest', 'head'), ['head', 'neck'])).toBe('fills 1 empty slot and replaces the other')
  })
})
