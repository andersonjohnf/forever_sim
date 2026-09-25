import { Check, FlaskConicalOff, History, Info, type LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WowIcon } from '@/components/wow-icon'
import type { Item } from '@/data/items/types'
import { QUALITY_CLASS } from '@/lib/items'
import { cn } from '@/lib/utils'
import { useSpecMeta } from '@/app/specs'
import { statsLine, unsimulatedEffects } from './item-flags'

/**
 * A badge that explains itself on tap, click or Enter (docs/ux.md "Gear": nothing is hover-only).
 * It sits on top of its row's button, never inside it, and its hit area is 44 px tall while it
 * takes a badge's height in the layout.
 *
 * `icon` shows the badge as its icon alone, for the wide Gear grid (docs/ux.md "Gear"), where
 * the words on every other slot would take a line of their own; the label is its name and its
 * hover title, and the popover says it in full.
 */
function FlagBadge({ label, icon: Icon, children }: { label: string; icon?: LucideIcon; children: ReactNode }) {
  // The popover is a dialog, named by its heading (docs/ux.md#accessibility).
  const titleId = useId()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={Icon ? label : undefined}
          title={Icon ? label : undefined}
          className={cn(
            'group/flag relative z-10 -my-3 inline-flex h-11 min-w-11 items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            // An icon takes its own width in the layout, its hit area 12 px past it each side too.
            Icon && '-mx-3 justify-center',
          )}
        >
          {Icon ? (
            <Badge variant="outline" className="size-5 p-0 group-hover/flag:bg-muted">
              <Icon aria-hidden />
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 group-hover/flag:bg-muted">
              {label}
              <Info aria-hidden />
            </Badge>
          )}
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
export function ClassicStatsBadge({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <FlagBadge label="Classic stats" icon={iconOnly ? History : undefined}>
      <p className="text-muted-foreground">
        The Forever beta client has no data for this item yet, so the sim uses its Classic Era stats. It updates when a
        client build ships the item.
      </p>
    </FlagBadge>
  )
}

/** Items with an effect the sim leaves out; the result's assumptions list them too. */
export function UnsimulatedBadge({ effects, iconOnly = false }: { effects: string[]; iconOnly?: boolean }) {
  return (
    <FlagBadge label={effects.length === 1 ? 'Effect not simulated' : 'Effects not simulated'} icon={iconOnly ? FlaskConicalOff : undefined}>
      <p className="text-muted-foreground">The sim doesn’t simulate {effects.length === 1 ? 'this effect' : 'these effects'} yet, so results leave {effects.length === 1 ? 'it' : 'them'} out:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {effects.map((effect) => (
          <li key={effect}>{effect}</li>
        ))}
      </ul>
    </FlagBadge>
  )
}

/**
 * An item's flags as icons, for the wide Gear grid, where they follow the enchant chip (docs/ux.md
 * "Gear"). 24 px apart, so their 44 px hit areas don't meet.
 */
export function ItemFlags({ item, className }: { item: Item; className?: string }) {
  const effects = unsimulatedEffects(item, useSpecMeta().id)
  if (item.foreverData && effects.length === 0) return null
  return (
    <span className={cn('flex shrink-0 items-center gap-x-6', className)}>
      {!item.foreverData && <ClassicStatsBadge iconOnly />}
      {effects.length > 0 && <UnsimulatedBadge effects={effects} iconOnly />}
    </span>
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
  compact = false,
  equipped = false,
  className,
}: {
  item: Item
  bis?: number | null
  /** An extra muted line, e.g. the slot name, or the item's type and level. */
  meta?: string | null
  /** Why the item can't be picked, or does nothing here; stays at full contrast when the rest is dimmed. */
  note?: ReactNode
  /** Fades the icon, name and stats (an item the picker can't equip here, or ammo the ranged weapon doesn't fire). */
  dimmed?: boolean
  /**
   * The item the slot holds, in the picker: "Equipped", with a check, leads the badges (review
   * finding DB-8: the Best in slot filter can list it first, out of its order).
   */
  equipped?: boolean
  /**
   * The wide layout's slot grid (docs/ux.md "Gear"): the name and its BiS rank, then `meta` and the
   * stats, each wrapping rather than cut short, so an item with a short name and stats is two lines.
   * The flags go on the slot's action line, beside its enchant (`ItemFlags`).
   */
  compact?: boolean
  className?: string
}) {
  const fade = dimmed && 'opacity-60'
  const effects = unsimulatedEffects(item, useSpecMeta().id)
  if (compact) {
    return (
      <div className={cn('flex min-w-0 flex-1 items-center gap-3', className)}>
        <WowIcon icon={item.icon} size="md" className={cn(fade)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The rank follows the name's last word, wrapping with it. Up to two lines each, the
              whole text on hover, where an effect's words stand in for stats (Earthstrike's Use:). */}
          <span aria-hidden title={item.name} className={cn('line-clamp-2 text-sm font-medium break-words', fade)}>
            <span className={QUALITY_CLASS[item.quality]}>{item.name}</span>
            {bis ? (
              <span className="ml-1.5 inline-block align-text-bottom">
                <BisBadge rank={bis} />
              </span>
            ) : null}
          </span>
          <span aria-hidden title={statsLine(item)} className={cn('line-clamp-2 text-xs break-words text-muted-foreground tabular-nums', fade)}>
            {[meta, statsLine(item)].filter(Boolean).join(' · ')}
          </span>
          {note && (
            <span aria-hidden className="mt-1 flex items-start gap-1.5 text-xs text-foreground">
              {note}
            </span>
          )}
        </div>
      </div>
    )
  }
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
          {statsLine(item)}
        </span>
        {(equipped || bis || !item.foreverData || effects.length > 0) && (
          // A wrapped line starts 24 px lower, so the flags' 44 px hit areas never overlap.
          <span className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-6">
            {equipped && (
              <span aria-hidden className="mr-1 inline-flex items-center gap-1 text-xs font-medium">
                <Check className="size-3.5" />
                Equipped
              </span>
            )}
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
