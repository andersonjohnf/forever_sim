import { describe, expect, it } from 'vitest'
import { CLOSED, tooltipOpenReducer, type TooltipEvent, type TooltipOpenState } from './item-tooltip-open'

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
