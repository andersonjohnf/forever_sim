import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WowIcon } from '@/components/wow-icon'
import type { Item } from '@/data/items/types'
import { QUALITY_CLASS, summarizeItem } from '@/lib/items'
import { cn } from '@/lib/utils'

/** Badge for items with no Forever data yet (decision D6). */
export function ClassicStatsBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="cursor-help" tabIndex={0}>
          Classic stats
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        The Forever beta client has no data for this item yet, so the sim uses its Classic Era stats. It
        updates when a client build ships the item.
      </TooltipContent>
    </Tooltip>
  )
}

export function BisBadge({ rank }: { rank: number }) {
  return (
    <Badge variant="secondary" className="tabular-nums">
      {rank === 1 ? 'BiS' : `BiS #${rank}`}
    </Badge>
  )
}

/** The icon, name, summary and badges of an item. Shared by gear slots and the picker. */
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
  note?: React.ReactNode
  /** Fades the icon, name and stats (an item the picker can't equip here). */
  dimmed?: boolean
  className?: string
}) {
  const fade = dimmed && 'opacity-60'
  return (
    <div className={cn('flex min-w-0 flex-1 items-start gap-3', className)}>
      <WowIcon icon={item.icon} size="lg" className={cn(fade)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('truncate text-sm font-medium', QUALITY_CLASS[item.quality], fade)}>{item.name}</span>
        {meta && <span className={cn('line-clamp-2 text-xs text-muted-foreground', fade)}>{meta}</span>}
        <span className={cn('line-clamp-2 text-xs text-muted-foreground tabular-nums', fade)}>{summarizeItem(item) || 'No stats'}</span>
        {(bis || !item.foreverData) && (
          <span className={cn('mt-1 flex flex-wrap gap-1', fade)}>
            {bis ? <BisBadge rank={bis} /> : null}
            {!item.foreverData && <ClassicStatsBadge />}
          </span>
        )}
        {note && <span className="mt-1 flex items-start gap-1.5 text-xs text-foreground">{note}</span>}
      </div>
    </div>
  )
}
