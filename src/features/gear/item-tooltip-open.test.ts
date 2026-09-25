import { describe, expect, it } from 'vitest'
import { anchorBox, BESIDE_ROOM_PX, CLOSED, tooltipOpenReducer, tooltipSide, type TooltipEvent, type TooltipOpenState } from './item-tooltip-open'

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

  it('beside the picker’s dialog where it leaves 16 rem: at 1280 px, not at 1024', () => {
    // The dialog is 42 rem wide, centred.
    expect(tooltipSide('right', { left: 304, right: 976 }, 1280)).toBe('right')
    expect(tooltipSide('right', { left: 176, right: 848 }, 1024)).toBe('bottom')
  })

  it('above or below stays as asked, and with no item measured nothing moves', () => {
    expect(tooltipSide('bottom', { left: 0, right: 390 }, 390)).toBe('bottom')
    expect(tooltipSide('top', { left: 0, right: 390 }, 390)).toBe('top')
    expect(tooltipSide('right', undefined, 390)).toBe('right')
  })
})

describe('the box an item tooltip sits beside (docs/ux.md "Item tooltips")', () => {
  const row = { left: 24, top: 230, right: 617, bottom: 306 }
  const icon = { left: 36, top: 237, right: 72, bottom: 273 }
  const name = { left: 84, top: 236, right: 186, bottom: 254 }
  const badge = { left: 192, top: 237, right: 226, bottom: 253 }

  it('the item itself, with no parts named', () => {
    expect(anchorBox(row)).toEqual(row)
  })

  it('the wide grid’s icon and name (and rank): it opens next to them, not at the row’s far edge', () => {
    expect(anchorBox(row, [icon, name, badge])).toEqual({ left: 36, top: 236, right: 226, bottom: 273 })
  })

  it('beside a container: its sides, with the item’s top and bottom', () => {
    const dialog = { left: 304, top: 68, right: 976, bottom: 832 }
    expect(anchorBox(row, [], dialog)).toEqual({ left: 304, top: 230, right: 976, bottom: 306 })
  })
})
