// When an item tooltip opens and closes (docs/ux.md "Item tooltips"). Pure, so the rules are tested
// without a browser; item-tooltip.tsx feeds it the pointer, focus and key events.

/**
 * How the tooltip was opened, which decides what closes it: `hover` (a mouse or pen resting on the
 * item) closes when the pointer leaves; `focus` (keyboard focus on the item) closes on blur; `press`
 * (a long press on the item, or the info control) stays until a tap outside, Escape or the info
 * control again.
 */
export type OpenedBy = 'hover' | 'focus' | 'press'

export interface TooltipOpenState {
  openedBy: OpenedBy | null
}

export type TooltipEvent =
  /** A mouse or pen has rested on the item for the hover delay. */
  | { type: 'hover' }
  /** The mouse or pen left the item. */
  | { type: 'leave' }
  /** Keyboard focus reached the item (`:focus-visible`, so a tap's focus doesn't count). */
  | { type: 'focus' }
  | { type: 'blur' }
  /** A touch held on the item for the long-press time. */
  | { type: 'longPress' }
  /** The info control was activated. */
  | { type: 'toggle' }
  /** Escape, or a tap or click outside the tooltip. */
  | { type: 'dismiss' }

export const CLOSED: TooltipOpenState = { openedBy: null }

/** Hover waits this long before opening, so sweeping the pointer across a list doesn't flash tooltips. */
export const HOVER_DELAY_MS = 150
/** A touch held this long is a long press. */
export const LONG_PRESS_MS = 500
/** A touch that moves farther than this is a scroll, not a long press. */
export const LONG_PRESS_SLOP_PX = 10

export function tooltipOpenReducer(state: TooltipOpenState, event: TooltipEvent): TooltipOpenState {
  const { openedBy } = state
  switch (event.type) {
    case 'hover':
      return openedBy ? state : { openedBy: 'hover' }
    case 'leave':
      return openedBy === 'hover' ? CLOSED : state
    case 'focus':
      return openedBy ? state : { openedBy: 'focus' }
    case 'blur':
      return openedBy === 'focus' ? CLOSED : state
    case 'longPress':
      return { openedBy: 'press' }
    case 'toggle':
      // Open by hover or focus, the control pins it open rather than closing what the player is reading.
      return openedBy === 'press' ? CLOSED : { openedBy: 'press' }
    case 'dismiss':
      return CLOSED
  }
}

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left'

/** The room a tooltip beside its item needs: its widest (20 rem), the 6 px gap and the 8 px clear of the edge. */
export const BESIDE_ROOM_PX = 320 + 6 + 8

/**
 * Where the tooltip goes (docs/ux.md "Item tooltips"): beside the item on the side asked for, or the
 * other side where that has no room, or below it where neither has, as for an item that spans the
 * window (a gear card on a tablet, a picker row with little beside the dialog). The popover itself
 * only flips to the opposite side, so beside a wide item it would run off the window.
 */
export function tooltipSide(preferred: TooltipSide, item: { left: number; right: number } | undefined, windowWidth: number): TooltipSide {
  if (!item || preferred === 'top' || preferred === 'bottom') return preferred
  const room = { right: windowWidth - item.right, left: item.left }
  const other = preferred === 'right' ? 'left' : 'right'
  if (room[preferred] >= BESIDE_ROOM_PX) return preferred
  if (room[other] >= BESIDE_ROOM_PX) return other
  return 'bottom'
}
