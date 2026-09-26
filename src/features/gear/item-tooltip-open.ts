// When an item tooltip opens and closes, and where it goes (docs/ux.md "Item tooltips"). Pure, so the
// rules are tested without a browser; item-tooltip.tsx feeds it the pointer, focus and key events and
// the boxes it measures.

/**
 * How the tooltip was opened, which decides what closes it: `hover` (a mouse or pen resting on the
 * item) closes when the pointer leaves; `focus` (keyboard focus on the item) closes on blur; `press`
 * (a long press on the item, or the info control) stays until a tap outside or on the panel, Escape
 * or the info control again. Any of them closes when its item scrolls out of view.
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
  /** Escape, a tap or click outside the tooltip or on it, or the item scrolling out of view. */
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

/**
 * Whether Escape, closing the tooltip, also goes on to what's under it (the picker, which it closes).
 * A hover tooltip opened only because the pointer rests on the item, so one press closes the picker
 * as it did before tooltips; a tooltip the player asked for (keyboard focus on the item, or pinned)
 * takes Escape for itself, and the next press closes the picker.
 */
export function escapeGoesThrough(openedBy: OpenedBy | null, itemHasKeyboardFocus: boolean): boolean {
  return openedBy === 'hover' && !itemHasKeyboardFocus
}

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left'

/** The gap between the tooltip and its item. */
export const GAP_PX = 6
/** How far the tooltip keeps from the window's edges, and from the sticky chrome (`Room`). */
export const EDGE_PX = 8
/** The panel's widest: 20 rem. */
export const PANEL_MAX_PX = 320

/**
 * The room a tooltip beside its item needs: 16 rem of panel, the 6 px gap and the 8 px clear of the
 * window's edge. It's 20 rem at most, and narrows to the room there is, down to 16 rem.
 */
export const BESIDE_ROOM_PX = 256 + GAP_PX + EDGE_PX

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The window the tooltip has: its width and height, and how far it keeps from the top and bottom
 * edges (the collision padding: 8 px, plus the sticky header and section tabs and the phone's sim bar
 * where they're over the page).
 */
export interface Room {
  width: number
  height: number
  top: number
  bottom: number
}

/**
 * Where the tooltip goes: a side, and whether it sits over its item (`overlap`), beside a line inside
 * the item's box (`overlapLine`) rather than beside the box.
 */
export interface Placement {
  side: TooltipSide
  overlap: boolean
}

/**
 * The box the tooltip sits beside (docs/ux.md "Item tooltips"): the item's parts that show it (the
 * wide grid's icon and name, so it opens next to them, not at the row's far edge), else the item
 * itself; and, given a container (the item picker's dialog), that container's sides with the item's
 * top and bottom, so it opens beside the dialog rather than over the list. A part with no size (a
 * hidden BiS badge, whose box sits at the window's corner) isn't one it sits beside.
 */
export function anchorBox(item: Box, parts: readonly Box[] = [], beside?: Box): Box {
  const shown = parts.filter((p) => p.right > p.left && p.bottom > p.top)
  const own = shown.length
    ? {
        left: Math.min(...shown.map((p) => p.left)),
        top: Math.min(...shown.map((p) => p.top)),
        right: Math.max(...shown.map((p) => p.right)),
        bottom: Math.max(...shown.map((p) => p.bottom)),
      }
    : { left: item.left, top: item.top, right: item.right, bottom: item.bottom }
  return beside ? { ...own, left: beside.left, right: beside.right } : own
}

/**
 * Where the tooltip goes (docs/ux.md "Item tooltips"): beside the item on the side asked for, or the
 * other side where that has no room, or below it where neither has, as for an item that spans the
 * window (a gear card on a tablet, a picker row whose dialog leaves little beside it); the popover
 * flips it above where there's more room there. Given the panel's height, where it fits neither
 * below nor above, it goes over the item instead, beside a line toward the side with more room
 * outside the item (`overlapLine`), where the window's whole height is its: a hover tooltip can't
 * scroll, so otherwise a set's bonuses would be cut off. (The popover itself only flips to the
 * opposite side, so beside a wide item it would run off the window.)
 */
export function tooltipSide(preferred: TooltipSide, item: Box | undefined, room: Room, panelHeight?: number): Placement {
  if (!item || preferred === 'top' || preferred === 'bottom') return { side: preferred, overlap: false }
  const beside = { right: room.width - item.right, left: item.left }
  const other = preferred === 'right' ? 'left' : 'right'
  if (beside[preferred] >= BESIDE_ROOM_PX) return { side: preferred, overlap: false }
  if (beside[other] >= BESIDE_ROOM_PX) return { side: other, overlap: false }
  const below = room.height - room.bottom - item.bottom - GAP_PX
  const above = item.top - room.top - GAP_PX
  if (panelHeight === undefined || Math.max(below, above) >= panelHeight) return { side: 'bottom', overlap: false }
  return { side: beside[other] > beside[preferred] ? other : preferred, overlap: true }
}

/**
 * The line an overlapping tooltip sits beside (`tooltipSide`): inside the item's box, as far toward
 * the window's edge on its side as a 20 rem panel allows, so it covers as little of the item as it
 * can; with the item's top and bottom, so it opens level with it.
 */
export function overlapLine(item: Box, side: 'left' | 'right', windowWidth: number): Box {
  const reach = EDGE_PX + GAP_PX + PANEL_MAX_PX
  const x = side === 'right' ? Math.max(item.left, Math.min(item.right, windowWidth - reach)) : Math.min(item.right, Math.max(item.left, reach))
  return { left: x, right: x, top: item.top, bottom: item.bottom }
}
