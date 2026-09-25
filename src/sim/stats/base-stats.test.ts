import { describe, expect, it } from 'vitest'
import { BASE_PLACEHOLDERS, CLASS_BASE, type Attributes } from './base-stats'

// docs/mechanics/character-stats.md#race-offsets: the [C] race offsets (Str, Agi, Sta, Int, Spi).
const OFFSETS: Record<string, readonly [number, number, number, number, number]> = {
  'alliance-human': [0, 0, 0, 0, 0],
  'alliance-dwarf': [2, -4, 3, -1, -1],
  'alliance-night-elf': [-3, 5, -1, 0, 0],
  'horde-orc': [3, -3, 2, -3, 3],
  'horde-undead': [-1, -2, 1, -2, 5],
  'horde-tauren': [5, -5, 2, -5, 2],
  'horde-troll': [1, 2, 1, -4, 1],
}
const SKYBORNE = ['alliance-skyborne-high-order', 'horde-skyborne-windshaper'] as const

const plus = (row: Attributes, [str, agi, sta, int, spi]: readonly number[]): Attributes => ({
  str: row.str + str,
  agi: row.agi + agi,
  sta: row.sta + sta,
  int: row.int + int,
  spi: row.spi + spi,
})

describe('Skyborne warrior base attributes (character-stats.md#warrior-base-attributes, D24, D36)', () => {
  const human = CLASS_BASE.warrior.attributes('alliance-human')!

  it('the Human row is the class row: every [C] row is it plus its race offset', () => {
    for (const [race, offset] of Object.entries(OFFSETS)) expect(CLASS_BASE.warrior.attributes(race), race).toEqual(plus(human, offset))
  })

  it('are placeholders, not measured rows: the class row, with neutral race offsets', () => {
    expect(human).toEqual({ str: 120, agi: 80, sta: 110, int: 30, spi: 45 })
    for (const race of SKYBORNE) {
      expect(CLASS_BASE.warrior.attributes(race), race).toBeNull()
      expect(BASE_PLACEHOLDERS.warrior.attributes?.[race], race).toEqual(human)
    }
    // The table holds the Skyborne rows only: every other warrior row is measured.
    expect(Object.keys(BASE_PLACEHOLDERS.warrior.attributes ?? {}).sort()).toEqual([...SKYBORNE].sort())
  })
})

describe('Skyborne hunter base attributes (hunter.md#75-base-values, D24, D36)', () => {
  const rows = BASE_PLACEHOLDERS.hunter.attributes!
  const classRow = { str: 55, agi: 125, sta: 90, int: 65, spi: 70 }

  it('every other hunter row is the class row plus its race offset', () => {
    for (const race of ['alliance-human', 'alliance-dwarf', 'alliance-night-elf', 'horde-orc', 'horde-tauren', 'horde-troll']) {
      expect(rows[race], race).toEqual(plus(classRow, OFFSETS[race]))
    }
  })

  it('are the class row, with neutral race offsets', () => {
    for (const race of SKYBORNE) expect(rows[race], race).toEqual(classRow)
  })
})
