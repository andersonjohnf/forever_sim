import { Info } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WowIcon } from '@/components/wow-icon'
import type { Item } from '@/data/items/types'
import { QUALITY_CLASS, summarizeItem } from '@/lib/items'
import { cn } from '@/lib/utils'
import { useSpecMeta } from '@/app/specs'
import { unsimulatedEffects } from './item-flags'

/**
 * A badge that explains itself on tap, click or Enter (docs/ux.md "Gear": nothing is hover-only).
 * It sits on top of its row's button, never inside it, and its hit area is 44 px tall while it
 * takes a badge's height in the layout.
 */
function FlagBadge({ label, children }: { label: string; children: ReactNode }) {
  // The popover is a dialog, named by its heading (docs/ux.md#accessibility).
  const titleId = useId()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group/flag relative z-10 -my-3 inline-flex h-11 min-w-11 items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Badge variant="outline" className="gap-1 group-hover/flag:bg-muted">
            {label}
            <Info aria-hidden />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-labelledby={titleId} className="w-[min(20rem,calc(100vw-2rem))]">
        <p id={titleId} className="font-medium">
          {label}
        </p>
        {children}
      </PopoverContent>
    </Popover>
  )
}

/** Items with no Forever data yet (decision D6). */
export function ClassicStatsBadge() {
  return (
    <FlagBadge label="Classic stats">
      <p className="text-muted-foreground">
        The Forever beta client has no data for this item yet, so the sim uses its Classic Era stats. It updates when a
        client build ships the item.
      </p>
    </FlagBadge>
  )
}

/** Items with an effect the sim leaves out; the result's assumptions list them too. */
export function UnsimulatedBadge({ effects }: { effects: string[] }) {
  return (
    <FlagBadge label={effects.length === 1 ? 'Effect not simulated' : 'Effects not simulated'}>
      <p className="text-muted-foreground">The sim doesn’t simulate {effects.length === 1 ? 'this effect' : 'these effects'} yet, so results leave {effects.length === 1 ? 'it' : 'them'} out:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {effects.map((effect) => (
          <li key={effect}>{effect}</li>
        ))}
      </ul>
    </FlagBadge>
  )
}

export function BisBadge({ rank }: { rank: number }) {
  return (
    <Badge variant="secondary" className="tabular-nums">
      {rank === 1 ? 'BiS' : `BiS #${rank}`}
    </Badge>
  )
}

/**
 * The icon, name, summary and badges of an item. Shared by gear slots and the picker, whose rows
 * lay a button over it: the text is hidden from screen readers (the button carries it, see
 * `itemDescription`), and the flag badges sit above the button so a tap on them explains the flag.
 */
export function ItemSummary({
  item,
  bis,
  meta,
  note,
  dimmed = false,
  className,
}: {
  item: Item
  bis?: number | null
  /** An extra muted line, e.g. the slot name, or the item's type and level. */
  meta?: string | null
  /** Why the item can't be picked; stays at full contrast when the rest is dimmed. */
  note?: ReactNode
  /** Fades the icon, name and stats (an item the picker can't equip here). */
  dimmed?: boolean
  className?: string
}) {
  const fade = dimmed && 'opacity-60'
  const effects = unsimulatedEffects(item, useSpecMeta().id)
  return (
    <div className={cn('flex min-w-0 flex-1 items-start gap-3', className)}>
      <WowIcon icon={item.icon} size="lg" className={cn(fade)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span aria-hidden className={cn('truncate text-sm font-medium', QUALITY_CLASS[item.quality], fade)}>
          {item.name}
        </span>
        {meta && (
          <span aria-hidden className={cn('line-clamp-2 text-xs text-muted-foreground', fade)}>
            {meta}
          </span>
        )}
        <span aria-hidden className={cn('line-clamp-2 text-xs text-muted-foreground tabular-nums', fade)}>
          {summarizeItem(item) || 'No stats'}
        </span>
        {(bis || !item.foreverData || effects.length > 0) && (
          // A wrapped line starts 24 px lower, so the flags' 44 px hit areas never overlap.
          <span className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-6">
            {bis ? (
              <span aria-hidden className={cn(fade)}>
                <BisBadge rank={bis} />
              </span>
            ) : null}
            {!item.foreverData && <ClassicStatsBadge />}
            {effects.length > 0 && <UnsimulatedBadge effects={effects} />}
          </span>
        )}
        {note && (
          <span aria-hidden className="mt-1 flex items-start gap-1.5 text-xs text-foreground">
            {note}
          </span>
        )}
      </div>
    </div>
  )
}
