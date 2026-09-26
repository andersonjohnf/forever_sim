// The item tooltip, WoW-style (docs/ux.md "Item tooltips"). Its lines come from item-tooltip-lines.ts,
// and when it opens and where it goes from item-tooltip-open.ts. Built on Radix's Popover, which a tap
// can open where the Tooltip can't: on a phone nothing hovers, so a long press or the info control
// opens it.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, Children, useId } from 'react'
import type { Dispatch, FocusEvent, HTMLAttributes, MouseEvent, PointerEvent, ReactElement, ReactNode, RefObject } from 'react'
import { flushSync } from 'react-dom'
import { Info } from 'lucide-react'
import { Popover as PopoverPrimitive, Slot } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Popover, PopoverAnchor } from '@/components/ui/popover'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { Item } from '@/data/items/types'
import type { RuleProfileId } from '@/sim'
import { itemTooltipLines, TOOLTIP_PALETTE, type TooltipLine } from './item-tooltip-lines'
import {
  anchorBox,
  CLOSED,
  EDGE_PX,
  escapeGoesThrough,
  GAP_PX,
  HOVER_DELAY_MS,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
  overlapLine,
  tooltipOpenReducer,
  tooltipSide,
  type Box,
  type OpenedBy,
  type Placement,
  type TooltipEvent,
} from './item-tooltip-open'

interface TooltipContextValue {
  openedBy: OpenedBy | null
  dispatch: Dispatch<TooltipEvent>
  /** The lines' id, which the info control names as its description while it's open. */
  linesId: string
  itemName: string
  /** The info control, if there is one: pressing it toggles the tooltip rather than dismissing it. */
  infoRef: RefObject<HTMLButtonElement | null>
  /** The item: the trigger. The tooltip sits beside it, or its parts or container (`anchorParts`, `besideClosest`). */
  anchorRef: RefObject<HTMLElement | null>
}

const TooltipContext = createContext<TooltipContextValue | null>(null)

function useTooltipContext(part: string): TooltipContextValue {
  const context = useContext(TooltipContext)
  if (!context) throw new Error(`${part} must be inside an ItemTooltip`)
  return context
}

/** Marks every item's info control, so a tap on another item's opens that tooltip rather than only closing this one. */
const INFO_ATTRIBUTE = 'data-item-tooltip-info'

type Padding = Record<'top' | 'right' | 'bottom' | 'left', number>

interface Layout {
  placement: Placement
  padding: Padding
  /** Closing on an Escape that goes on to the picker: at once, without fading out, so the picker hears it. */
  instantClose: boolean
}

/**
 * What the tooltip keeps clear of: the window's edges by 8 px and, pinned open on the page, the sticky
 * header and section tabs above and the phone's sim bar below (`--sticky-top` and `--sim-bar-height`,
 * which App keeps), so it never covers them while the page scrolls under it. In a dialog or the
 * phone's sheet those are behind the overlay. A hover or focus tooltip, there only while the pointer
 * rests or focus stays, has the whole window's height: on a 720 px laptop a set's tooltip needs it.
 */
function chromePadding(onPage: boolean): Padding {
  const edges = { top: EDGE_PX, right: EDGE_PX, bottom: EDGE_PX, left: EDGE_PX }
  if (!onPage) return edges
  const style = getComputedStyle(document.documentElement)
  const px = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0
  return { ...edges, top: EDGE_PX + px('--sticky-top'), bottom: EDGE_PX + px('--sim-bar-height') }
}

/** The tooltip's lines on the game's dark panel. Exported for a place that shows them without a popover. */
export function ItemTooltipCard({ lines, id, className }: { lines: readonly TooltipLine[]; id?: string; className?: string }) {
  const { tone, quality } = TOOLTIP_PALETTE
  return (
    <div id={id} className={cn('flex flex-col text-[13px] leading-[1.35] tabular-nums', className)}>
      {lines.map((line, i) => (
        <div
          // The lines are a fixed list for the item: its order is its identity.
          key={i}
          className={cn(
            'flex justify-between gap-4',
            line.gapBefore && 'mt-2',
            line.indent && 'pl-3',
            line.quality !== undefined && 'text-sm leading-snug font-semibold',
          )}
          style={{ color: line.quality !== undefined ? (quality[line.quality] ?? tone.white) : tone[line.tone] }}
        >
          <span className="min-w-0 break-words">{line.text}</span>
          {line.right && <span className="shrink-0">{line.right}</span>}
        </div>
      ))}
    </div>
  )
}

export interface ItemTooltipProps {
  item: Item
  /** The enchant on the item (an EnchantDefinition id), shown as its green line. */
  enchantId?: string | null
  /** The setup's rule profile, for the enchant's Classic Era numbers. Forever by default. */
  profile?: RuleProfileId
  /** The ids of the items worn, to count the set's pieces and light the bonuses reached. */
  worn?: Iterable<number>
  /** Where the panel goes, flipping when there's no room: beside the item from 640 px, below it on a phone. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /**
   * The parts of the item the tooltip sits beside, a selector within the trigger's parent: where the
   * trigger covers a wide row (the wide Gear grid), its icon and name, so it opens next to them.
   */
  anchorParts?: string
  /**
   * A container the tooltip sits beside, the trigger's closest match (the item picker's dialog): it
   * opens beside the container, level with the item, rather than over the list.
   */
  besideClosest?: string
  /** An `ItemTooltipTrigger` around the item, and optionally an `ItemTooltipInfoButton`. */
  children: ReactNode
}

/**
 * An item's tooltip. Wrap the item in `ItemTooltipTrigger` (hover, keyboard focus and a long press
 * open it) and, for phones, add an `ItemTooltipInfoButton` (a tap opens and closes it):
 *
 *     <ItemTooltip item={item} enchantId={equipped.enchantId} profile={profile} worn={wornIds}>
 *       <ItemTooltipTrigger><button …>…</button></ItemTooltipTrigger>
 *       <ItemTooltipInfoButton />
 *     </ItemTooltip>
 *
 * Escape, a tap or click outside, and its item scrolling out of view close it; so does a tap on a
 * pinned one. It never takes focus, so the item keeps it.
 */
export function ItemTooltip({ item, enchantId, profile, worn, side, align = 'start', anchorParts, besideClosest, children }: ItemTooltipProps) {
  const [{ openedBy }, dispatch] = useReducer(tooltipOpenReducer, CLOSED)
  const linesId = useId()
  const wide = useMediaQuery('(min-width: 640px)')
  const open = openedBy !== null
  const pinned = openedBy === 'press'
  // The panel while it's drawn: from opening until it has faded out.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null)
  // Only a drawn tooltip builds its lines: a list of slots and picker rows holds many closed ones. A
  // closing one keeps them while it fades: lines removed from a dialog as focus moves between its rows
  // would make the dialog's focus trap take focus back to itself.
  const drawn = open || panel !== null
  const lines = useMemo(() => (drawn ? itemTooltipLines(item, { enchantId, profile, worn }) : []), [drawn, item, enchantId, profile, worn])
  const infoRef = useRef<HTMLButtonElement | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const context = useMemo(() => ({ openedBy, dispatch, linesId, itemName: item.name, infoRef, anchorRef }), [openedBy, linesId, item.name])

  // In a dialog (the item picker, and its sheet on a phone) the panel is drawn inside it, so the
  // dialog's scroll lock lets a pinned one scroll, and the phone's sheet doesn't drag with it.
  const [container, setContainer] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => setContainer(anchorRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null), [])

  // What the tooltip sits beside: the item, its parts, or its container's sides (`anchorBox`); or, placed
  // over the item where it fits nowhere else, a line inside that box (`overlapLine`).
  const measure = useCallback((): Box | undefined => {
    const trigger = anchorRef.current
    if (!trigger) return undefined
    const parts = anchorParts ? [...(trigger.parentElement?.querySelectorAll(anchorParts) ?? [])].map((el) => el.getBoundingClientRect()) : []
    const beside = besideClosest ? trigger.closest(besideClosest)?.getBoundingClientRect() : undefined
    return anchorBox(trigger.getBoundingClientRect(), parts, beside)
  }, [anchorParts, besideClosest])
  const preferred = side ?? (wide ? 'right' : 'bottom')
  // Where it goes and what it keeps clear of (below), which the anchor reads as it's measured.
  const layoutRef = useRef<Layout>({ placement: { side: preferred, overlap: false }, padding: chromePadding(false), instantClose: false })
  // A virtual anchor, so the trigger stays the item's own element; its scroll containers are the trigger's.
  const virtualRef = useMemo(
    () => ({
      current: {
        get contextElement() {
          return anchorRef.current ?? undefined
        },
        getBoundingClientRect() {
          const box = measure()
          if (!box) return new DOMRect()
          const { side: placed, overlap } = layoutRef.current.placement
          const at = overlap && (placed === 'left' || placed === 'right') ? overlapLine(box, placed, document.documentElement.clientWidth) : box
          return new DOMRect(at.left, at.top, at.right - at.left, at.bottom - at.top)
        },
      },
    }),
    [measure],
  )

  // Beside the item where there's room, else the other side, else below it (a wide item), else over it
  // where the panel fits neither below nor above: measured as it opens, before it's drawn, then again
  // once the panel's height is known; kept while it closes.
  const [{ placement, padding, instantClose }, setLayout] = useState<Layout>(() => ({
    placement: { side: preferred, overlap: false },
    padding: chromePadding(false),
    instantClose: false,
  }))
  useLayoutEffect(() => {
    if (!open) return
    const pad = chromePadding(pinned && container === null)
    const root = document.documentElement
    const room = { width: root.clientWidth, height: root.clientHeight, top: pad.top, bottom: pad.bottom }
    // The panel's whole height, its border included, however much of it the room shows.
    layoutRef.current = { placement: tooltipSide(preferred, measure(), room, panel ? panel.scrollHeight + 2 : undefined), padding: pad, instantClose: false }
    setLayout(layoutRef.current)
  }, [open, pinned, preferred, container, measure, panel])

  // Its item scrolled out of view (out of the picker's list, or under the sticky header and tabs or the
  // phone's bar), it closes, rather than coming loose and riding over them.
  useEffect(() => {
    const trigger = anchorRef.current
    if (!open || !trigger) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && !entry.isIntersecting) dispatch({ type: 'dismiss' })
      },
      { rootMargin: `-${padding.top - EDGE_PX}px 0px -${padding.bottom - EDGE_PX}px 0px` },
    )
    observer.observe(trigger)
    return () => observer.disconnect()
  }, [open, padding])

  // Escape with a tooltip only the resting pointer opened closes it and goes on, so one press closes the
  // picker as before (`escapeGoesThrough`). The panel goes at once, without fading out, so the picker's
  // dialog is the top layer again when the key reaches it.
  useEffect(() => {
    if (openedBy !== 'hover') return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !escapeGoesThrough(openedBy, !!anchorRef.current?.matches(':focus-visible'))) return
      flushSync(() => {
        setLayout((layout) => ({ ...layout, instantClose: true }))
        dispatch({ type: 'dismiss' })
      })
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [openedBy])

  // Radix wraps the panel in a positioning box, which would catch the pointer where the panel lets it
  // through: resting on the item, a tooltip drawn under the pointer (beside the wide grid's name, over
  // its own row) would take it off the item and close, then open again. Pinned, it takes the pointer.
  const placeContent = useCallback(
    (el: HTMLDivElement | null) => {
      contentRef.current = el
      setPanel(el)
      const wrapper = el?.parentElement
      if (wrapper) wrapper.style.pointerEvents = openedBy === 'press' ? '' : 'none'
    },
    [openedBy],
  )
  const within = (ref: RefObject<HTMLElement | null>, target: EventTarget | null) => target instanceof Node && !!ref.current?.contains(target)
  // Pinned open (a long press or the info control), a tap or click outside only closes it: the item or
  // row it lands on doesn't also act, as in the game and most phone popovers. Another item's info
  // control is the exception: it picks nothing, so its tap goes on to open that item's tooltip. A press
  // that turns into a scroll leaves it open. Escape, and focus moving on by keyboard, close it as before.
  const pressedOutside = useRef(false)
  useEffect(() => {
    if (openedBy !== 'press') return
    const inside = (target: EventTarget | null) => target instanceof Node && (!!contentRef.current?.contains(target) || !!infoRef.current?.contains(target))
    const down = (e: globalThis.PointerEvent) => {
      pressedOutside.current = !inside(e.target)
    }
    const click = (e: globalThis.MouseEvent) => {
      if (!pressedOutside.current) return
      pressedOutside.current = false
      dispatch({ type: 'dismiss' })
      if (e.target instanceof Element && e.target.closest(`[${INFO_ATTRIBUTE}]`)) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('click', click, true)
    return () => {
      pressedOutside.current = false
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('click', click, true)
    }
  }, [openedBy])
  const { panel: panelColour, border, tone } = TOOLTIP_PALETTE
  return (
    <TooltipContext value={context}>
      <Popover open={open} onOpenChange={(next) => !next && dispatch({ type: 'dismiss' })}>
        <PopoverAnchor virtualRef={virtualRef} />
        {children}
        <PopoverPrimitive.Portal container={container ?? undefined}>
          <PopoverPrimitive.Content
            ref={placeContent}
            data-slot="popover-content"
            role="tooltip"
            side={placement.side}
            align={align}
            sideOffset={GAP_PX}
            collisionPadding={padding}
            hideWhenDetached
            // A drag on it scrolls it, rather than the phone's sheet.
            data-vaul-no-drag=""
            // The item keeps focus: the tooltip describes it, and closing it hands nothing back.
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => {
              // The info control toggles it itself: a press on it isn't a press outside. Pinned open, the
              // press's click closes it (above), so the press alone doesn't.
              if (openedBy === 'press' || within(infoRef, e.target)) e.preventDefault()
            }}
            onFocusOutside={(e) => {
              // Hover and focus have their own closing rules, so focus moving on doesn't dismiss those; nor
              // does focus reaching the item or the info control (a long press's release focuses the item),
              // nor a press's focus, whose click closes it (above).
              if (openedBy !== 'press' || pressedOutside.current || within(anchorRef, e.target) || within(infoRef, e.target)) e.preventDefault()
            }}
            onClick={(e) => {
              // Pinned, a tap on it closes it, as a tap outside does: where it covers its own info control
              // (a touch screen's wide grid), that tap is the one the player makes.
              if (openedBy !== 'press') return
              e.stopPropagation()
              dispatch({ type: 'dismiss' })
            }}
            className={cn(
              'z-50 flex origin-(--radix-popover-content-transform-origin) flex-col rounded-md border p-2.5 text-sm shadow-lg outline-hidden [color-scheme:dark]',
              // 20 rem at most, narrowing to the room beside the item (down to 16 rem: `tooltipSide`). Before
              // it's placed, 20 rem, so the height measured as it opens is the height it will have.
              'w-max max-w-[min(20rem,var(--radix-popover-content-available-width,20rem),calc(100vw-1rem))]',
              'max-h-(--radix-popover-content-available-height) overflow-y-auto overscroll-contain',
              'duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
              instantClose ? 'data-closed:animate-none' : 'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
              // Resting on the item, the pointer never lands on the panel; a pinned one scrolls.
              openedBy !== 'press' && 'pointer-events-none',
            )}
            // Inside a modal, Radix's DismissableLayer sets an inline `pointer-events: auto` that beats the
            // class above; the style prop wins over it, so a hover or focus tooltip lets the pointer through (VT-1).
            style={{ backgroundColor: panelColour, borderColor: border, color: tone.white, pointerEvents: openedBy === 'press' ? undefined : 'none' }}
          >
            <ItemTooltipCard id={linesId} lines={lines} />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </Popover>
    </TooltipContext>
  )
}

type TriggerChildProps = HTMLAttributes<HTMLElement>

/**
 * Wraps the item (one element, a button or a row), which the tooltip sits beside (or its parts or
 * container: `anchorParts`, `besideClosest`). A mouse or pen resting on it opens the tooltip after a
 * short delay and leaving closes it; keyboard focus opens it and blur closes it; a long press on a
 * touch screen opens it without the tap that follows (the slot's own action, such as opening the
 * picker, doesn't run) and without the system's callout. The item's own handlers run first; one that
 * prevents the default keeps the tooltip out of it. The item keeps its own short accessible name and
 * description: the tooltip's twenty-odd lines aren't read at every focus stop (docs/ux.md "Item tooltips").
 */
export function ItemTooltipTrigger({ children }: { children: ReactElement<TriggerChildProps> }) {
  const { dispatch, anchorRef } = useTooltipContext('ItemTooltipTrigger')
  const child = Children.only(children)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  /** Set by a long press: swallows the click its release makes. */
  const swallowClick = useRef(false)

  const cancelHover = useCallback(() => clearTimeout(hoverTimer.current), [])
  const cancelPress = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }, [])
  useEffect(
    () => () => {
      cancelHover()
      cancelPress()
    },
    [cancelHover, cancelPress],
  )

  return (
    <Slot.Root
      ref={anchorRef}
      // A long press on a touch screen shows the tooltip, not the system's callout or a text selection.
      className="[-webkit-touch-callout:none] pointer-coarse:select-none"
      onPointerEnter={(e: PointerEvent<HTMLElement>) => {
        if (e.defaultPrevented || e.pointerType === 'touch') return
        cancelHover()
        hoverTimer.current = setTimeout(() => dispatch({ type: 'hover' }), HOVER_DELAY_MS)
      }}
      onPointerLeave={(e: PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'touch') return
        cancelHover()
        dispatch({ type: 'leave' })
      }}
      onFocus={(e: FocusEvent<HTMLElement>) => {
        // Keyboard focus only: a tap or click focuses the item too, and that isn't asking for the tooltip.
        if (!e.defaultPrevented && e.currentTarget.matches(':focus-visible')) dispatch({ type: 'focus' })
      }}
      onBlur={() => dispatch({ type: 'blur' })}
      onPointerDown={(e: PointerEvent<HTMLElement>) => {
        // A new press starts afresh, whatever the last one left behind (a long press whose click never came).
        swallowClick.current = false
        cancelPress()
        if (e.defaultPrevented || e.pointerType !== 'touch') return
        const timer = setTimeout(() => {
          press.current = null
          swallowClick.current = true
          dispatch({ type: 'longPress' })
        }, LONG_PRESS_MS)
        press.current = { timer, x: e.clientX, y: e.clientY }
      }}
      onPointerMove={(e: PointerEvent<HTMLElement>) => {
        const start = press.current
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_SLOP_PX) cancelPress()
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e: MouseEvent<HTMLElement>) => {
        // A touch screen's long press raises the context menu; the tooltip is what it asks for.
        if (press.current || swallowClick.current) e.preventDefault()
      }}
      onClickCapture={(e: MouseEvent<HTMLElement>) => {
        if (!swallowClick.current) return
        swallowClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {child}
    </Slot.Root>
  )
}

/**
 * The info control, for phones where nothing hovers: a 44 px button that opens the tooltip and, pressed
 * again, closes it. Beside a hover or focus tooltip it pins it open. While one item's tooltip is pinned,
 * a tap on another's info control opens that one instead. Pass `className` to place it (or hide it
 * where a pointer can hover); its accessible name is "<item> details", and while the tooltip is open
 * the tooltip is its description.
 */
export function ItemTooltipInfoButton({ className, onClick, ...props }: Omit<HTMLAttributes<HTMLButtonElement>, 'children'>) {
  const { openedBy, dispatch, linesId, itemName, infoRef } = useTooltipContext('ItemTooltipInfoButton')
  // A plain button, not the Popover's trigger: beside a custom anchor, Radix's trigger re-mounts itself
  // and leaves the panel anchored to the old, detached element (drawn in the window's top-left corner).
  return (
    <button
      ref={infoRef}
      type="button"
      aria-label={`${itemName} details`}
      aria-expanded={openedBy !== null}
      aria-describedby={openedBy ? linesId : undefined}
      data-item-tooltip-info=""
      {...props}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) dispatch({ type: 'toggle' })
      }}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:text-foreground',
        className,
      )}
    >
      <Info aria-hidden className="size-4" />
    </button>
  )
}
