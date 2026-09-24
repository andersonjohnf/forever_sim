// A caster's character sheet rows (docs/mechanics/spells.md §12; docs/ux.md "Results").
import { describe, expect, it } from 'vitest'
import type { CharacterSheet } from '@/sim'
import { casterSheetRows } from './caster-sheet'

const sheet = (spell: CharacterSheet['spell']): CharacterSheet =>
  ({ intellect: 300, spirit: 120, mana: 5500, stamina: 200, health: 3800, spell }) as unknown as CharacterSheet

const ZERO = { arcane: 0, fire: 0, frost: 0, holy: 0, nature: 0, shadow: 0 }

describe('casterSheetRows', () => {
  it('is null without a caster’s spell block (a paladin’s sheet keeps its own rows)', () => {
    expect(casterSheetRows(sheet(undefined))).toBeNull()
    expect(casterSheetRows(sheet({ holyDamage: 300, critPct: 5, hitPct: 3, mp5: 10 }))).toBeNull()
  })

  it('shows spell damage, crit and hit, each with the schools whose own lines (a talent’s) add to it, casting speed, penetration and mana', () => {
    const rows = casterSheetRows(
      sheet({
        holyDamage: 300,
        critPct: 7.5,
        hitPct: 4,
        mp5: 12,
        caster: {
          schoolDamage: { arcane: 300, fire: 300, frost: 300, holy: 300, nature: 300, shadow: 345 },
          schoolCrit: { arcane: 7.5, fire: 13.5, frost: 7.5, holy: 7.5, nature: 7.5, shadow: 7.5 },
          schoolHit: { arcane: 7, fire: 9, frost: 9, holy: 4, nature: 4, shadow: 4 },
          castSpeedPct: 1,
          spellPen: 10,
        },
      }),
    )!
    expect(rows).toEqual([
      ['Spell damage', '300'],
      ['Shadow damage', '345'],
      ['Spell crit', '7.5%'],
      ['Fire crit', '13.5%'],
      ['Spell hit', '4.0%'],
      ['Arcane hit', '7.0%'],
      ['Fire hit', '9.0%'],
      ['Frost hit', '9.0%'],
      ['Casting speed', '1.0%'],
      ['Spell penetration', '10'],
      ['Intellect', '300'],
      ['Spirit', '120'],
      ['Mana', '5,500'],
      ['Mana per 5 s', '12'],
      ['Stamina', '200'],
      ['Health', '3,800'],
    ])
  })

  it('leaves out penetration when there’s none', () => {
    const rows = casterSheetRows(
      sheet({ holyDamage: 0, critPct: 0, hitPct: 0, mp5: 0, caster: { schoolDamage: ZERO, schoolCrit: ZERO, schoolHit: ZERO, castSpeedPct: 0, spellPen: 0 } }),
    )!
    expect(rows.map(([label]) => label)).not.toContain('Spell penetration')
  })
})
