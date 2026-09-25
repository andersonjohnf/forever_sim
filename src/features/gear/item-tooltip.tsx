// The item tooltip, WoW-style (docs/ux.md "Item tooltips"). Its lines come from item-tooltip-lines.ts
// and when it opens from item-tooltip-open.ts. Built on shadcn's Popover, which a tap can open where
// the Tooltip can't: on a phone nothing hovers, so a long press or the info control opens it.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, cloneElement, Children, useId } from 'react'
import type { Dispatch, FocusEvent, HTMLAttributes, MouseEvent, PointerEvent, ReactElement, ReactNode, RefObject } from 'react'
import { Info } from 'lucide-react'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { Item } from '@/data/items/types'
import type { RuleProfileId } from '@/sim'
import { itemTooltipLines, TOOLTIP_PALETTE, type TooltipLine } from './item-tooltip-lines'
import {
  CLOSED,
  HOVER_DELAY_MS,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
  tooltipOpenReducer,
  tooltipSide,
  type OpenedBy,
  type TooltipEvent,
} from './item-tooltip-open'

interface TooltipContextValue {
  openedBy: OpenedBy | null
  dispatch: Dispatch<TooltipEvent>
  /** The lines' id, which the item and the info control name as their description while it's open. */
  linesId: string
  itemName: string
  /** The info control, if there is one: pressing it toggles the tooltip rather than dismissing it. */
  infoRef: RefObject<HTMLButtonElement | null>
  /** The item the tooltip is anchored to. */
  anchorRef: RefObject<HTMLElement | null>
}

const TooltipContext = createContext<TooltipContextValue | null>(null)

function useTooltipContext(part: string): TooltipContextValue {
  const context = useContext(TooltipContext)
  if (!context) throw new Error(`${part} must be inside an ItemTooltip`)
  return context
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
 * Escape and a tap or click outside close it. It never takes focus, so the item keeps it.
 */
export function ItemTooltip({ item, enchantId, profile, worn, side, align = 'start', children }: ItemTooltipProps) {
  const [{ openedBy }, dispatch] = useReducer(tooltipOpenReducer, CLOSED)
  const linesId = useId()
  const wide = useMediaQuery('(min-width: 640px)')
  const open = openedBy !== null
  // Only an open tooltip builds its lines: a list of slots and picker rows holds many closed ones.
  const lines = useMemo(() => (open ? itemTooltipLines(item, { enchantId, profile, worn }) : []), [open, item, enchantId, profile, worn])
  const infoRef = useRef<HTMLButtonElement | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const context = useMemo(() => ({ openedBy, dispatch, linesId, itemName: item.name, infoRef, anchorRef }), [openedBy, linesId, item.name])
  // Beside the item where there's room, else the other side, else below it (a wide item): measured as it
  // opens, before it's drawn, and kept while it closes.
  const preferred = side ?? (wide ? 'right' : 'bottom')
  const [placed, setPlaced] = useState(preferred)
  useLayoutEffect(() => {
    if (open) setPlaced(tooltipSide(preferred, anchorRef.current?.getBoundingClientRect(), document.documentElement.clientWidth))
  }, [open, preferred])
  const within = (ref: RefObject<HTMLElement | null>, target: EventTarget | null) => target instanceof Node && !!ref.current?.contains(target)
  const { panel, border, tone } = TOOLTIP_PALETTE
  return (
    <TooltipContext value={context}>
      <Popover open={open} onOpenChange={(next) => !next && dispatch({ type: 'dismiss' })}>
        {children}
        <PopoverContent
          role="tooltip"
          side={placed}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          // The item keeps focus: the tooltip describes it, and closing it hands nothing back.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            // The info control toggles it itself: a press on it isn't a press outside.
            if (within(infoRef, e.target)) e.preventDefault()
          }}
          onFocusOutside={(e) => {
            // Hover and focus have their own closing rules, so focus moving on doesn't dismiss those; nor
            // does focus reaching the item or the info control (a long press's release focuses the item).
            if (openedBy !== 'press' || within(anchorRef, e.target) || within(infoRef, e.target)) e.preventDefault()
          }}
          className={cn(
            'w-max max-w-[min(20rem,calc(100vw-1rem))] gap-0 rounded-md border p-2.5 shadow-lg ring-0 [color-scheme:dark]',
            'max-h-(--radix-popover-content-available-height) overflow-y-auto',
            // Resting on the item, the pointer never lands on the panel; a pinned one scrolls.
            openedBy !== 'press' && 'pointer-events-none',
          )}
          style={{ backgroundColor: panel, borderColor: border, color: tone.white }}
        >
          <ItemTooltipCard id={linesId} lines={lines} />
        </PopoverContent>
      </Popover>
    </TooltipContext>
  )
}

type TriggerChildProps = HTMLAttributes<HTMLElement>

/**
 * Wraps the item (one element, a button or a row) and anchors the tooltip to it. A mouse or pen
 * resting on it opens the tooltip after a short delay and leaving closes it; keyboard focus opens it
 * and blur closes it; a long press on a touch screen opens it without the tap that follows (the
 * slot's own action, such as opening the picker, doesn't run) and without the system's callout.
 * The item's own handlers run first; one that prevents the default keeps the tooltip out of it.
 */
export function ItemTooltipTrigger({ children }: { children: ReactElement<TriggerChildProps> }) {
  const { openedBy, dispatch, linesId, anchorRef } = useTooltipContext('ItemTooltipTrigger')
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

  // Slot lets the child's own props win, so its description is joined here rather than replaced.
  const theirDescription = child.props['aria-describedby']
  const describedBy = [theirDescription, openedBy ? linesId : null].filter(Boolean).join(' ') || undefined

  return (
    <PopoverAnchor asChild>
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
        {cloneElement(child, { 'aria-describedby': describedBy })}
      </Slot.Root>
    </PopoverAnchor>
  )
}

/**
 * The info control, for phones where nothing hovers: a 44 px button that opens the tooltip and, pressed
 * again, closes it. Beside a hover or focus tooltip it pins it open. Pass `className` to place it
 * (or hide it where a pointer can hover); its accessible name is "<item> details".
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
      // It describes the item and never takes focus: a tooltip, named as the item's description.
      aria-describedby={openedBy ? linesId : undefined}
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
