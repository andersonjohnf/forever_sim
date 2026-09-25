import { describe, expect, it } from 'vitest'
import { holdToasts, releaseToasts, showWhenClear, type NoticeClosed } from './held-toasts'

/** A notice that records its name when shown, and its callbacks in `up`. */
function recorder() {
  const shown: string[] = []
  const up: NoticeClosed[] = []
  const notice = (name: string) => (closed: NoticeClosed) => {
    shown.push(name)
    up.push(closed)
    return true
  }
  return { shown, up, notice }
}

describe('a load’s notices (docs/ux.md "Notices", "What’s new")', () => {
  it('come one at a time: the next once the one before has gone, however it went', () => {
    const { shown, up, notice } = recorder()
    showWhenClear(notice('a'))
    showWhenClear(notice('b'))
    showWhenClear(notice('c'))
    expect(shown).toEqual(['a'])
    up[0].onAutoClose()
    // Sonner may call both, or one twice: the next comes once.
    up[0].onDismiss()
    expect(shown).toEqual(['a', 'b'])
    up[1].onDismiss()
    expect(shown).toEqual(['a', 'b', 'c'])
    up[2].onAutoClose()
    showWhenClear(notice('d'))
    expect(shown).toEqual(['a', 'b', 'c', 'd'])
    up[3].onAutoClose()
  })

  it('skip one that raised nothing after all', () => {
    const { shown, up, notice } = recorder()
    showWhenClear(notice('visit'))
    showWhenClear(() => false)
    showWhenClear(notice('later'))
    expect(shown).toEqual(['visit'])
    up[0].onAutoClose()
    expect(shown).toEqual(['visit', 'later'])
    up[1].onAutoClose()
  })

  it('wait while What’s New holds them, then come in order, one at a time', () => {
    const { shown, up, notice } = recorder()
    holdToasts()
    holdToasts()
    showWhenClear(notice('link'))
    showWhenClear(notice('defaults'))
    expect(shown).toEqual([])
    releaseToasts()
    expect(shown).toEqual(['link'])
    releaseToasts()
    expect(shown).toEqual(['link'])
    up[0].onAutoClose()
    expect(shown).toEqual(['link', 'defaults'])
    up[1].onAutoClose()
    showWhenClear(notice('later'))
    expect(shown).toEqual(['link', 'defaults', 'later'])
    up[2].onAutoClose()
  })
})
