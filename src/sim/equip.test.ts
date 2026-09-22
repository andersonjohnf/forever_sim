import { describe, expect, it } from 'vitest'
import itemJson from '@/data/items/pre-bis.json'
import type { ItemData } from '@/data/items/types'
import { defaultConfig } from './defaults'
import { canUse, fitsSlot } from './equip'
import { SPEC_IDS, SPEC_META } from './specs'
import type { GearSlot } from './types'

const items = (itemJson as unknown as ItemData).items
const byName = (name: string) => {
  const item = items.find((i) => i.name === name)
  if (!item) throw new Error(`No item named ${name}`)
  return item
}

describe('proficiencies', () => {
  it('keeps druids out of mail and plate and paladins away from idols', () => {
    expect(canUse('druid', byName('Lionheart Helm'))).toBe(false)
    expect(canUse('warrior', byName('Lionheart Helm'))).toBe(true)
    const idol = items.find((i) => i.itemSubclass === 'Idol')!
    expect(canUse('druid', idol)).toBe(true)
    expect(canUse('paladin', idol)).toBe(false)
  })

  it('only lets warriors put a weapon in the off hand', () => {
    const offHandWeapon = byName("Mirah's Song")
    expect(fitsSlot('warrior', 'offHand', offHandWeapon)).toBe(true)
    expect(fitsSlot('paladin', 'offHand', offHandWeapon)).toBe(false)
  })

  it('respects class-restricted items', () => {
    const druidOnly = items.find((i) => i.classes?.length === 1 && i.classes[0] === 'Druid')!
    expect(canUse('druid', druidOnly)).toBe(true)
    expect(canUse('warrior', druidOnly)).toBe(false)
  })
})

describe.each(SPEC_IDS)('default gear for %s', (spec) => {
  it('is all equippable by the class in its slot', () => {
    const { classId } = SPEC_META[spec]
    for (const [slot, { itemId }] of Object.entries(defaultConfig(spec).gear)) {
      const item = items.find((i) => i.id === itemId)!
      expect(fitsSlot(classId, slot as GearSlot, item), `${slot}: ${item.name}`).toBe(true)
    }
  })
})
