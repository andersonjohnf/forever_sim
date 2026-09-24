import { describe, expect, it } from 'vitest'
import { holdToasts, releaseToasts, showWhenClear } from './held-toasts'

describe('held toasts (docs/ux.md "What’s new")', () => {
  it('shows at once when nothing holds them', () => {
    const shown: string[] = []
    showWhenClear(() => shown.push('a'))
    expect(shown).toEqual(['a'])
  })

  it('holds them until released, then shows them in order, once', () => {
    const shown: string[] = []
    holdToasts()
    holdToasts()
    showWhenClear(() => shown.push('link'))
    showWhenClear(() => shown.push('defaults'))
    expect(shown).toEqual([])
    releaseToasts()
    expect(shown).toEqual(['link', 'defaults'])
    releaseToasts()
    expect(shown).toEqual(['link', 'defaults'])
    showWhenClear(() => shown.push('later'))
    expect(shown).toEqual(['link', 'defaults', 'later'])
  })
})
