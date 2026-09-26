import { Info } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { WowIcon } from '@/components/wow-icon'
import type { Item } from '@/data/items/types'
import { QUALITY_CLASS } from '@/lib/items'
import { cn } from '@/lib/utils'
import type { ClassId, GearSlot } from '@/sim'
import { ENCHANT_LINE_SLOTS } from './enchants'
import { statsLine } from './item-flags'
import { BisBadge } from './item-row'
import { EMPTY_SLOT_ICON, paneGroups, SLOT_LABEL } from './slots'

/**
 * A row's height in the wide grid, fixed by the kind of slots in it rather than by what they hold
 * (docs/ux.md "Gear"): with a slot enchants go on, the icon beside a one-line name and a stats line,
 * the enchant line under them and room below for its 44 px hit area; without, the icon beside the name
 * and stats, the flags' hit areas inside. The shorter side of the pane shares out the difference, so
 * the two end together: the left side's six rows take the right side's 468 px (8 slots, 3 of them
 * with an enchant line), 78 px each.
 */
const SLOT_HEIGHT = { enchant: 76, plain: 48 } as const

/**
 * Marks a wide slot's icon, name and rank: its item's tooltip opens beside them rather than at the
 * row's far edge (docs/ux.md "Item tooltips"), as `ItemTooltip`'s `anchorParts`.
 */
export const WIDE_TOOLTIP_ANCHOR = 'item-tooltip-anchor'

/** Where a slot sits in the wide grid, and so how it's drawn. */
export type WidePlace = {
  /** The right side of the character pane: the icon on the right edge, the text aligned toward it. */
  mirrored: boolean
  /**
   * Its row has an enchant line's height: the slot keeps the line whatever it holds, for its enchant
   * chip where enchants go on it, and its flags (a ranged weapon beside the main and off hand).
   */
  enchantLine: boolean
  /** Its dividers: under it, and after it in the weapons' row. */
  className: string
}

/**
 * From 1440 px Gear's slots are one grid in the game's character-pane order (docs/ux.md "Gear", D34):
 * the pane's left side (head to wrists) and its right side (hands to trinkets) in two columns, the
 * right one mirrored, and the weapons along the bottom across both, three to a row (a hunter's ammo
 * and quiver in a second). Each group is one bordered list with a divider between its slots, named by
 * a heading for screen readers only: the layout says what's where. Its rows are fixed heights, so
 * every slot is in view at 1440×900 whatever the gear.
 */
export function WideSlotGrid({ classId, renderSlot }: { classId: ClassId; renderSlot: (slot: GearSlot, place: WidePlace) => ReactNode }) {
  const groups = paneGroups(classId).map((group) => {
    const columns = group.side === 'bottom' ? 3 : 1
    const rows = Array.from({ length: Math.ceil(group.slots.length / columns) }, (_, row) => group.slots.slice(row * columns, (row + 1) * columns))
    const heights = rows.map((row) => (row.some((slot) => ENCHANT_LINE_SLOTS.has(slot)) ? SLOT_HEIGHT.enchant : SLOT_HEIGHT.plain))
    return { ...group, columns, heights }
  })
  const total = (heights: number[]) => heights.reduce((sum, h) => sum + h, 0)
  const pane = Math.max(...groups.filter((g) => g.side !== 'bottom').map((g) => total(g.heights)))
  return (
    <div className="grid grid-cols-2 gap-3">
      {groups.map((group) => {
        const { columns, heights } = group
        const bottom = group.side === 'bottom'
        // The shorter side's rows share out the difference, so both sides end together.
        const extra = bottom ? 0 : (pane - total(heights)) / heights.length
        const template = heights.map((h) => `${h + extra}px`).join(' ')
        return (
          <section key={group.label} className={cn('min-w-0', bottom && 'col-span-2')}>
            <h3 className="sr-only">{group.label}</h3>
            <ul style={{ gridTemplateRows: template } as CSSProperties} className={cn('grid overflow-hidden rounded-xl border bg-surface shadow-surface', bottom ? 'grid-cols-3' : 'grid-cols-1')}>
              {group.slots.map((slot, index) => {
                const [row, column] = [Math.floor(index / columns), index % columns]
                return renderSlot(slot, {
                  mirrored: group.side === 'right',
                  enchantLine: heights[row] === SLOT_HEIGHT.enchant,
                  className: cn(row < heights.length - 1 && 'border-b', column < columns - 1 && 'border-r'),
                })
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/**
 * A slot in the wide grid (docs/ux.md "Gear"): its icon on the outer edge, then the item's name in
 * its quality colour with its BiS rank, and its stats, each on one line cut short with the whole as
 * its hover title; under them, where enchants go on the slot, the enchant chip and the flags, or else
 * the flags beside the item. `button` covers the slot; the chip and flags sit over it.
 */
export function WideSlot({
  slot,
  place,
  item,
  locked,
  bis,
  note,
  button,
  chip,
  flags,
  flagged,
  info,
}: {
  slot: GearSlot
  place: WidePlace
  item: Item | undefined
  /** An off hand a two-hander leaves empty. */
  locked: boolean
  bis: number | null
  /** Why the item does nothing here (ammo the ranged weapon doesn't fire), in the stats line's place. */
  note: string | null
  button: ReactNode
  chip: ReactNode
  flags: ReactNode
  /** The item has a flag to show (`ItemFlags`), after its text or on its enchant line. */
  flagged: boolean
  /** The item tooltip's info control, where nothing hovers (docs/ux.md "Item tooltips"). */
  info?: ReactNode
}) {
  const { mirrored } = place
  // The enchant line, where the row has one and there's a chip or a flag to put on it; else the text is centred.
  const line = Boolean(item && place.enchantLine && (chip || flagged))
  const fade = note && 'opacity-60'
  // A locked off hand's reason in fewer words than below 1440 px, to fit beside the other weapons.
  const second = item ? (note ? null : statsLine(item)) : locked ? 'Your two-hander uses both hands' : 'Empty'
  return (
    <li className={cn('relative min-w-0', !locked && 'hover:bg-muted/60', place.className)}>
      {button}
      <div className={cn('flex h-full min-w-0 items-center gap-3 px-3', mirrored && 'flex-row-reverse')}>
        {/* With an enchant line, the icon sits beside the name and the line hangs under the text, with
            10 px under it for the chip's and flags' hit areas, 14 px past their 16 px line. */}
        <div
          aria-hidden={!item || undefined}
          // Beside flags, as wide as its text, so they follow it (mirrored: precede it) rather than sit
          // across the slot from it.
          className={cn('flex min-w-0 gap-3', line ? 'flex-1 items-start pb-2.5' : 'items-center', !line && !(item && flagged) && 'flex-1', mirrored && 'flex-row-reverse')}
        >
          {/* The icon, name and rank are what the item's tooltip opens beside (WIDE_TOOLTIP_ANCHOR). */}
          <WowIcon icon={item?.icon ?? EMPTY_SLOT_ICON[slot]} size="md" grayscale={!item} className={cn(WIDE_TOOLTIP_ANCHOR, fade)} />
          <div className={cn('flex min-w-0 flex-1 flex-col', mirrored && 'items-end text-right')}>
            {/* The whole name on hover, and as the slot's accessible name (its button's). */}
            <span aria-hidden className={cn('flex h-4.5 w-full min-w-0 items-center gap-1.5 text-sm leading-4.5 font-medium', mirrored && 'justify-end', fade)}>
              <span title={item?.name ?? SLOT_LABEL[slot]} className={cn(WIDE_TOOLTIP_ANCHOR, 'truncate', item ? QUALITY_CLASS[item.quality] : 'text-muted-foreground')}>
                {item?.name ?? SLOT_LABEL[slot]}
              </span>
              {bis ? (
                <span className={cn(WIDE_TOOLTIP_ANCHOR, 'flex shrink-0')}>
                  <BisBadge rank={bis} />
                </span>
              ) : null}
            </span>
            {note ? (
              <span aria-hidden className={cn('flex h-4 w-full min-w-0 items-center gap-1.5 text-xs text-foreground', mirrored && 'justify-end')}>
                <Info className="size-3.5 shrink-0" />
                <span title={note} className="truncate">
                  {note}
                </span>
              </span>
            ) : (
              <span aria-hidden title={second ?? undefined} className={cn('h-4 w-full truncate text-xs leading-4 text-muted-foreground tabular-nums')}>
                {second}
              </span>
            )}
            {line && (
              // One 16 px line: the chip, cut short where the flags need the room, and the flags after it.
              <div className={cn('mt-1 flex h-4 w-full min-w-0 items-center gap-x-3', mirrored && 'flex-row-reverse')}>
                {chip}
                {flags}
              </div>
            )}
          </div>
        </div>
        {item && !place.enchantLine && flags}
        {/* At the row's inner end, toward the pane's middle on either side. */}
        {info && <div className={cn('flex shrink-0', mirrored ? 'mr-auto' : 'ml-auto')}>{info}</div>}
      </div>
    </li>
  )
}
