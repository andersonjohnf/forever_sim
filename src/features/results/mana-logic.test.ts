import { describe, expect, it } from 'vitest'
import { manaNote, manaRows } from './mana-logic'

// docs/ux.md#results "Mana per fight": a ledger of the average fight.
describe('the mana ledger', () => {
  const mana = { max: 2882, regeneratedPerFight: 3120.4, restoredPerFight: 3871.6, spentPerFight: 9650.2 }

  it('reads from the pull to the end, gains and spending signed, what’s left the sum', () => {
    expect(manaRows(mana)).toEqual([
      { label: 'At the pull', value: '2,882' },
      { label: 'Regenerated', value: '+3,120' },
      { label: 'Restored', value: '+3,872' },
      { label: 'Spent', value: '−9,650' },
      { label: 'Left at the end', value: '224' },
    ])
    expect(manaNote(mana)).toBe('Regenerated counts Spirit and mana per 5 s; restored, Sanctified Judgement’s returns and mana potions and runes.')
  })

  it('leaves out Restored when nothing restores mana, and never reads below 0 at the end', () => {
    const dry = { max: 2000, regeneratedPerFight: 500, restoredPerFight: 0.2, spentPerFight: 2500.4 }
    expect(manaRows(dry).map((r) => r.label)).toEqual(['At the pull', 'Regenerated', 'Spent', 'Left at the end'])
    expect(manaRows(dry).at(-1)!.value).toBe('0')
    expect(manaNote(dry)).toBe('Regenerated counts Spirit and mana per 5 s.')
  })
})
