import { describe, expect, it } from 'vitest'
import { docTitle, docUrl } from './docs'

describe('doc links', () => {
  it('point at the doc section on GitHub', () => {
    expect(docUrl('docs/mechanics/rage.md#rage-from-damage-taken')).toBe(
      'https://github.com/andersonjohnf/forever_sim/blob/main/docs/mechanics/rage.md#rage-from-damage-taken',
    )
  })

  it('name the doc briefly, and fall back to its file name', () => {
    expect(docTitle('docs/mechanics/combat-tables.md#1-rules-profiles')).toBe('Combat tables')
    expect(docTitle('docs/classes/warrior.md#9-open-questions')).toBe('Warrior')
    expect(docTitle('docs/some-new-doc.md#x')).toBe('Some new doc')
  })
})
