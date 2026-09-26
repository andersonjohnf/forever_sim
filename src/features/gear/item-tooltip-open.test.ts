import { describe, expect, it } from 'vitest'
import {
  anchorBox,
  BESIDE_ROOM_PX,
  CLOSED,
  escapeGoesThrough,
  overlapLine,
  tooltipOpenReducer,
  tooltipSide,
  type TooltipEvent,
  type TooltipOpenState,
} from './item-tooltip-open'

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

  it('Escape, a click outside or the item scrolling away closes it however it opened', () => {
    for (const how of ['hover', 'focus', 'longPress', 'toggle'] as const) expect(run(how, 'dismiss')).toEqual(CLOSED)
  })

  it('closing events on a closed tooltip leave it closed', () => {
    expect(run('leave', 'blur', 'dismiss')).toEqual(CLOSED)
  })
})

describe('who hears Escape (docs/ux.md "Item tooltips")', () => {
  it('a tooltip the resting pointer opened lets it go on to the picker', () => {
    expect(escapeGoesThrough('hover', false)).toBe(true)
  })

  it('one the player asked for keeps it: keyboard focus, or pinned', () => {
    expect(escapeGoesThrough('focus', true)).toBe(false)
    expect(escapeGoesThrough('press', false)).toBe(false)
    // The pointer rested on the item first, but it has keyboard focus too.
    expect(escapeGoesThrough('hover', true)).toBe(false)
  })

  it('with none open, there is nothing to close', () => {
    expect(escapeGoesThrough(null, false)).toBe(false)
  })
})

describe('where an item tooltip goes (docs/ux.md "Item tooltips")', () => {
  /** A row 76 px tall, `top` px down the window. */
  const row = (left: number, right: number, top = 200) => ({ left, right, top, bottom: top + 76 })
  /** A window, keeping 8 px clear of its top and bottom edges. */
  const room = (width: number, height = 900, top = 8, bottom = 8) => ({ width, height, top, bottom })
  const beside = (side: 'left' | 'right' | 'bottom' | 'top') => ({ side, overlap: false })

  it('beside the item on the side asked for, where it has the room', () => {
    expect(tooltipSide('right', row(24, 456), room(1440))).toEqual(beside('right'))
    expect(tooltipSide('left', row(700, 1200), room(1440))).toEqual(beside('left'))
  })

  it('the other side where that one has no room', () => {
    expect(tooltipSide('right', row(400, 752), room(768))).toEqual(beside('left'))
    expect(tooltipSide('left', row(24, 456), room(1440))).toEqual(beside('right'))
  })

  it('below where neither side has the room: an item as wide as the window, a picker row with little beside the dialog', () => {
    expect(tooltipSide('right', row(16, 684), room(700))).toEqual(beside('bottom'))
    expect(tooltipSide('right', row(184, 840), room(1024))).toEqual(beside('bottom'))
    // Exactly the room it needs is enough.
    expect(tooltipSide('right', row(0, 1000 - BESIDE_ROOM_PX), room(1000))).toEqual(beside('right'))
  })

  it('beside the picker’s dialog where it leaves 16 rem: at 1280 px, not at 1024', () => {
    // The dialog is 42 rem wide, centred.
    expect(tooltipSide('right', row(304, 976), room(1280))).toEqual(beside('right'))
    expect(tooltipSide('right', row(176, 848), room(1024))).toEqual(beside('bottom'))
  })

  it('beside, the panel’s height doesn’t matter: it has the whole window’s height there', () => {
    expect(tooltipSide('right', row(304, 976), room(1280, 720), 700)).toEqual(beside('right'))
  })

  it('below or above where the panel fits one of them', () => {
    // 900 - 8 - 276 - 6 = 610 px below the row.
    expect(tooltipSide('right', row(176, 848), room(1024), 610)).toEqual(beside('bottom'))
    // Only above: 600 - 8 - 6 = 586 px (the popover flips it there).
    expect(tooltipSide('right', row(176, 848, 600), room(1024), 586)).toEqual(beside('bottom'))
  })

  it('over the item where the panel fits neither below nor above: Lightforge Legplates in the picker at 1024×768', () => {
    // 768 - 8 - 376 - 6 = 378 px below and 300 - 8 - 6 = 286 above, for a 582 px panel.
    expect(tooltipSide('right', row(176, 848, 300), room(1024, 768), 582)).toEqual({ side: 'right', overlap: true })
    // A gear card at 700×900 near the top of the window: 900 - 8 - 196 - 6 = 690 px below, for a 700 px panel.
    expect(tooltipSide('right', row(16, 684, 120), room(700), 700)).toEqual({ side: 'right', overlap: true })
  })

  it('the sticky header and tabs, and the phone’s bar, take their room from above and below', () => {
    // 610 px below the row with only the window's edge to keep clear of; 50 fewer over a 50 px bar.
    expect(tooltipSide('right', row(176, 848), room(1024), 610)).toEqual(beside('bottom'))
    expect(tooltipSide('right', row(176, 848), room(1024, 900, 8, 58), 610)).toEqual({ side: 'right', overlap: true })
    // 200 - 8 - 6 = 186 px above; 100 fewer under a 100 px header and tabs.
    expect(tooltipSide('right', row(176, 848, 200), room(1024, 282), 186)).toEqual(beside('bottom'))
    expect(tooltipSide('right', row(176, 848, 200), room(1024, 282, 108), 186)).toEqual({ side: 'right', overlap: true })
  })

  it('over the item, toward the side with more room outside it; the side asked for on a tie', () => {
    expect(tooltipSide('right', row(200, 900), room(1000, 400), 500)).toEqual({ side: 'left', overlap: true })
    expect(tooltipSide('left', row(100, 800), room(1000, 400), 500)).toEqual({ side: 'right', overlap: true })
    expect(tooltipSide('left', row(150, 850), room(1000, 400), 500)).toEqual({ side: 'left', overlap: true })
  })

  it('above or below stays as asked, and with no item measured nothing moves', () => {
    expect(tooltipSide('bottom', row(0, 390), room(390), 900)).toEqual(beside('bottom'))
    expect(tooltipSide('top', row(0, 390), room(390))).toEqual(beside('top'))
    expect(tooltipSide('right', undefined, room(390))).toEqual(beside('right'))
  })
})

describe('the line an overlapping tooltip sits beside (docs/ux.md "Item tooltips")', () => {
  const item = { left: 176, top: 300, right: 848, bottom: 376 }

  it('as far toward the window’s edge as a 20 rem panel allows: it ends 8 px from the edge', () => {
    // 1024 - 8 - 6 - 320 = 690: the panel runs from 696 to 1016.
    expect(overlapLine(item, 'right', 1024)).toEqual({ left: 690, right: 690, top: 300, bottom: 376 })
    // 8 + 6 + 320 = 334: the panel runs from 8 to 328.
    expect(overlapLine(item, 'left', 1024)).toEqual({ left: 334, right: 334, top: 300, bottom: 376 })
  })

  it('never outside the item’s box, so it stays level with the item and over it', () => {
    expect(overlapLine({ ...item, right: 600 }, 'right', 1024).left).toBe(600)
    expect(overlapLine({ ...item, left: 400 }, 'left', 1024).left).toBe(400)
  })

  it('a gear card as wide as a 700 px window: over its right half', () => {
    expect(overlapLine({ left: 16, top: 120, right: 684, bottom: 196 }, 'right', 700).left).toBe(366)
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

  it('a part with no size, such as a hidden BiS badge at the window’s corner, isn’t one', () => {
    const hidden = { left: 0, top: 0, right: 0, bottom: 0 }
    expect(anchorBox(row, [icon, name, hidden])).toEqual({ left: 36, top: 236, right: 186, bottom: 273 })
    // With every part hidden, the item itself.
    expect(anchorBox(row, [hidden])).toEqual(row)
  })

  it('beside a container: its sides, with the item’s top and bottom', () => {
    const dialog = { left: 304, top: 68, right: 976, bottom: 832 }
    expect(anchorBox(row, [], dialog)).toEqual({ left: 304, top: 230, right: 976, bottom: 306 })
  })
})
