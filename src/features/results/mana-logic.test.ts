import { describe, expect, it } from 'vitest'
import { manaRows } from './mana-logic'

// docs/ux.md#results "Mana per fight": a ledger of the average fight.
describe('the mana ledger', () => {
  const restored = [
    { id: 'sanctifiedJudgement', name: 'Sanctified Judgement', perFight: 1621.6 },
    { id: 'majorManaPotion', name: 'Major Mana Potion', perFight: 2250 },
  ]
  const mana = { max: 2882, regeneratedPerFight: 3120.4, restored, restoredPerFight: 3871.6, spentPerFight: 9650.2 }

  it('reads from the pull to the end: each gain on its own line, spending signed, and what’s left the sum under a rule', () => {
    expect(manaRows(mana)).toEqual([
      { label: 'At the pull', value: '2,882' },
      { label: 'Regenerated', value: '+3,120' },
      { label: 'Sanctified Judgement', value: '+1,622' },
      { label: 'Major Mana Potion', value: '+2,250' },
      { label: 'Spent', value: '−9,650' },
      { label: 'Left at the end', value: '224', total: true },
    ])
  })

  it('leaves out what restored nothing, and never reads below 0 at the end', () => {
    const dry = { max: 2000, regeneratedPerFight: 500, restored: [{ id: 'demonicRune', name: 'Demonic Rune', perFight: 0.2 }], restoredPerFight: 0.2, spentPerFight: 2500.4 }
    expect(manaRows(dry).map((r) => r.label)).toEqual(['At the pull', 'Regenerated', 'Spent', 'Left at the end'])
    expect(manaRows(dry).at(-1)!.value).toBe('0')
  })
})
