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
        The Forever beta hasn’t received this item’s data yet, so the sim uses its Classic Era stats. It
        updates when the data does.
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
  className,
}: {
  item: Item
  bis?: number | null
  /** An extra muted line, e.g. the slot name or where the item drops. */
  meta?: string | null
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-1 items-start gap-3', className)}>
      <WowIcon icon={item.icon} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('truncate text-sm font-medium', QUALITY_CLASS[item.quality])}>{item.name}</span>
        {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
        <span className="line-clamp-2 text-xs text-muted-foreground tabular-nums">{summarizeItem(item) || 'No stats'}</span>
        {(bis || !item.foreverData) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {bis ? <BisBadge rank={bis} /> : null}
            {!item.foreverData && <ClassicStatsBadge />}
          </span>
        )}
      </div>
    </div>
  )
}
