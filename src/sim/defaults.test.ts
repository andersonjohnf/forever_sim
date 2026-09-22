import { describe, expect, it } from 'vitest'
import itemJson from '@/data/items/pre-bis.json'
import type { ItemData } from '@/data/items/types'
import raceJson from '@/data/races/races.json'
import type { RaceData } from '@/data/races/types'
import { decodeTalentCode, validateTalentBuild } from '@/data/talents/types'
import { defaultConfig, TALENT_DATA } from './defaults'
import { SPEC_IDS, SPEC_META } from './specs'
import type { GearSlot } from './types'

const items = new Map((itemJson as unknown as ItemData).items.map((i) => [i.id, i]))
const races = (raceJson as unknown as RaceData).races

/** Which item equip slots may go in each gear slot. */
const FITS: Record<GearSlot, string[]> = {
  head: ['head'], neck: ['neck'], shoulder: ['shoulder'], back: ['back'], chest: ['chest'],
  wrist: ['wrist'], hands: ['hands'], waist: ['waist'], legs: ['legs'], feet: ['feet'],
  finger1: ['finger'], finger2: ['finger'], trinket1: ['trinket'], trinket2: ['trinket'],
  mainHand: ['mainHand'], offHand: ['offHand'], ranged: ['ranged'],
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

  it('equips pool items in slots they fit, without doubling unique items', () => {
    const equipped = Object.entries(config.gear)
    expect(equipped.length).toBeGreaterThanOrEqual(15)
    for (const [slot, { itemId }] of equipped) {
      const item = items.get(itemId)
      expect(item, `${slot}: ${itemId}`).toBeDefined()
      expect(item!.equipSlots.some((s) => FITS[slot as GearSlot].includes(s)), `${slot}: ${item!.name}`).toBe(true)
    }
    for (const [a, b] of [['finger1', 'finger2'], ['trinket1', 'trinket2']] as const) {
      const [x, y] = [config.gear[a]?.itemId, config.gear[b]?.itemId]
      if (x && y && items.get(x)!.unique) expect(x, `${a}/${b}`).not.toBe(y)
    }
  })
})
