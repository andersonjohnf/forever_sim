import { describe, expect, it } from 'vitest'
import { itemsById } from '@/lib/items'
import { ammoNote } from './slots'

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
