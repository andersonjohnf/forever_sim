// A caster's character sheet rows (docs/mechanics/spells.md §12; docs/ux.md "Results").
import { describe, expect, it } from 'vitest'
import type { CharacterSheet } from '@/sim'
import { casterSheetRows } from './caster-sheet'

const sheet = (spell: CharacterSheet['spell']): CharacterSheet =>
  ({ intellect: 300, spirit: 120, mana: 5500, stamina: 200, health: 3800, spell }) as unknown as CharacterSheet

describe('casterSheetRows', () => {
  it('is null without a caster’s spell block (a paladin’s sheet keeps its own rows)', () => {
    expect(casterSheetRows(sheet(undefined))).toBeNull()
    expect(casterSheetRows(sheet({ holyDamage: 300, critPct: 5, hitPct: 3, mp5: 10 }))).toBeNull()
  })

  it('shows spell damage, each school whose own lines add to it, crit, hit, casting speed, penetration and mana', () => {
    const rows = casterSheetRows(
      sheet({
        holyDamage: 300,
        critPct: 7.5,
        hitPct: 4,
        mp5: 12,
        caster: { schoolDamage: { arcane: 300, fire: 300, frost: 300, holy: 300, nature: 300, shadow: 345 }, castSpeedPct: 1, spellPen: 10 },
      }),
    )!
    expect(rows).toEqual([
      ['Spell damage', '300'],
      ['Shadow damage', '345'],
      ['Spell crit', '7.5%'],
      ['Spell hit', '4.0%'],
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
      sheet({ holyDamage: 0, critPct: 0, hitPct: 0, mp5: 0, caster: { schoolDamage: { arcane: 0, fire: 0, frost: 0, holy: 0, nature: 0, shadow: 0 }, castSpeedPct: 0, spellPen: 0 } }),
    )!
    expect(rows.map(([label]) => label)).not.toContain('Spell penetration')
  })
})
