// Which talent the wide Talents tab's detail panel shows (docs/ux.md "Talents"): the one under the
// pointer, or else the focused one, or else the last one shown.
import { describe, expect, it, vi } from 'vitest'
import { createTracker } from './tracker'


describe('the talent tracker', () => {
  it('shows nothing before a talent is pointed at or focused', () => {
    expect(createTracker().shown()).toBeNull()
  })

  it('prefers the pointer, then focus, then keeps the last one shown', () => {
    const t = createTracker()
    t.focus('a')
    expect(t.shown()).toBe('a')
    t.enter('b')
    expect(t.shown()).toBe('b')
    // Leaving b goes back to the focused talent.
    t.leave('b')
    expect(t.shown()).toBe('a')
    // With neither, the last one stays, so moving the pointer to the panel doesn't empty it.
    t.blur('a')
    expect(t.shown()).toBe('a')
    t.enter('c')
    t.leave('c')
    expect(t.shown()).toBe('c')
  })

  it('ignores a late leave or blur from a talent that isn’t the current one', () => {
    const t = createTracker()
    t.enter('a')
    t.enter('b')
    t.leave('a')
    expect(t.shown()).toBe('b')
    t.focus('x')
    t.blur('y')
    t.leave('b')
    expect(t.shown()).toBe('x')
  })

  it('tells its listeners only when the shown talent changes', () => {
    const t = createTracker()
    const listener = vi.fn()
    const stop = t.subscribe(listener)
    t.enter('a')
    t.focus('a')
    t.leave('a')
    expect(listener).toHaveBeenCalledTimes(1)
    t.enter('b')
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    t.enter('c')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
