import { describe, expect, it } from 'vitest'
import { BESIDE_ROOM_PX, CLOSED, tooltipOpenReducer, tooltipSide, type TooltipEvent, type TooltipOpenState } from './item-tooltip-open'

const run = (...events: TooltipEvent['type'][]): TooltipOpenState =>
  events.reduce<TooltipOpenState>((state, type) => tooltipOpenReducer(state, { type } as TooltipEvent), CLOSED)

describe('when an item tooltip opens and closes (docs/ux.md "Item tooltips")', () => {
  it('desktop: hover opens it and leaving closes it', () => {
    expect(run('hover')).toEqual({ openedBy: 'hover' })
    expect(run('hover', 'leave')).toEqual(CLOSED)
  })

  it('keyboard: focus opens it and blur closes it; leaving with the pointer doesn’t', () => {
    expect(run('focus')).toEqual({ openedBy: 'focus' })
    expect(run('focus', 'leave')).toEqual({ openedBy: 'focus' })
    expect(run('focus', 'blur')).toEqual(CLOSED)
  })

  it('hover then focus keeps the first reason: blur doesn’t close a hovered tooltip, leaving does', () => {
    expect(run('hover', 'focus', 'blur')).toEqual({ openedBy: 'hover' })
    expect(run('hover', 'focus', 'leave')).toEqual(CLOSED)
  })

  it('phone: a long press opens it, and only a tap outside, Escape or the info control closes it', () => {
    expect(run('longPress')).toEqual({ openedBy: 'press' })
    expect(run('longPress', 'leave', 'blur')).toEqual({ openedBy: 'press' })
    expect(run('longPress', 'dismiss')).toEqual(CLOSED)
    expect(run('longPress', 'toggle')).toEqual(CLOSED)
  })

  it('the info control opens and closes it, and pins a hovered or focused one open', () => {
    expect(run('toggle')).toEqual({ openedBy: 'press' })
    expect(run('toggle', 'toggle')).toEqual(CLOSED)
    expect(run('hover', 'toggle')).toEqual({ openedBy: 'press' })
    expect(run('hover', 'toggle', 'leave')).toEqual({ openedBy: 'press' })
    expect(run('focus', 'toggle', 'blur')).toEqual({ openedBy: 'press' })
  })

  it('Escape or a click outside closes it however it opened', () => {
    for (const how of ['hover', 'focus', 'longPress', 'toggle'] as const) expect(run(how, 'dismiss')).toEqual(CLOSED)
  })

  it('closing events on a closed tooltip leave it closed', () => {
    expect(run('leave', 'blur', 'dismiss')).toEqual(CLOSED)
  })
})

describe('where an item tooltip goes (docs/ux.md "Item tooltips")', () => {
  it('beside the item on the side asked for, where it has the room', () => {
    expect(tooltipSide('right', { left: 24, right: 456 }, 1440)).toBe('right')
    expect(tooltipSide('left', { left: 700, right: 1200 }, 1440)).toBe('left')
  })

  it('the other side where that one has no room', () => {
    expect(tooltipSide('right', { left: 400, right: 752 }, 768)).toBe('left')
    expect(tooltipSide('left', { left: 24, right: 456 }, 1440)).toBe('right')
  })

  it('below where neither side has the room: an item as wide as the window, a picker row with little beside the dialog', () => {
    expect(tooltipSide('right', { left: 16, right: 684 }, 700)).toBe('bottom')
    expect(tooltipSide('right', { left: 184, right: 840 }, 1024)).toBe('bottom')
    // Exactly the room it needs is enough.
    expect(tooltipSide('right', { left: 0, right: 1000 - BESIDE_ROOM_PX }, 1000)).toBe('right')
  })

  it('above or below stays as asked, and with no item measured nothing moves', () => {
    expect(tooltipSide('bottom', { left: 0, right: 390 }, 390)).toBe('bottom')
    expect(tooltipSide('top', { left: 0, right: 390 }, 390)).toBe('top')
    expect(tooltipSide('right', undefined, 390)).toBe('right')
  })
})
