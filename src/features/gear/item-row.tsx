import { Check, FlaskConicalOff, History, Info, type LucideIcon } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
 * `icon` is for the wide Gear grid (docs/ux.md "Gear"), where the badge shares a line with the
 * enchant: the icon alone, or with `words` the icon and its words, where they fit (`ItemFlags`). The
 * label is its name and its hover title either way, and the popover says it in full. It takes a 16 px
 * line's height in the layout, with its 44 px hit area 14 px past it each way.
 */
function FlagBadge({ label, icon: Icon, words = false, children }: { label: string; icon?: LucideIcon; words?: boolean; children: ReactNode }) {
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
            // An icon takes its own width in the layout, its hit area 12 px past it each side too; with
            // its words it's wider than 44 px, and its hit area is its own box.
            Icon && '-my-3.5 justify-center',
            Icon && !words && '-mx-3',
          )}
        >
          {Icon ? (
            <Badge variant="outline" className={cn('group-hover/flag:bg-muted', words ? 'gap-1.5 px-2' : 'size-5 p-0')}>
              <Icon aria-hidden />
              {words && label}
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
export function ClassicStatsBadge({ iconOnly = false, words = false }: { iconOnly?: boolean; words?: boolean }) {
  return (
    <FlagBadge label="Classic stats" icon={iconOnly ? History : undefined} words={words}>
      <p className="text-muted-foreground">
        The Forever beta client has no data for this item yet, so the sim uses its Classic Era stats. It updates when a
        client build ships the item.
      </p>
    </FlagBadge>
  )
}

/** Items with an effect the sim leaves out; the result's assumptions list them too. */
export function UnsimulatedBadge({ effects, iconOnly = false, words = false }: { effects: string[]; iconOnly?: boolean; words?: boolean }) {
  return (
    <FlagBadge
      label={effects.length === 1 ? 'Effect not simulated' : 'Effects not simulated'}
      icon={iconOnly ? FlaskConicalOff : undefined}
      words={words}
    >
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
 * An item's flags, for the wide Gear grid (docs/ux.md "Gear"): icons 24 px apart, so their 44 px hit
 * areas don't meet, beside an item with no enchant to choose, where the name and stats keep the room.
 *
 * On a slot's enchant line (`fit`, which changes with the enchant) they show their words too wherever
 * those fit beside the enchant's whole text (review finding DU1-6), 6 px apart, each its own hit area;
 * otherwise their icons, and the enchant takes the room. It measures the line: the enchant chip's text
 * at its full width (`data-chip-text`) and a hidden copy of the flags' words, neither of which depends
 * on which the line shows, so the choice never flips back and forth.
 */
export function ItemFlags({ item, className, fit }: { item: Item; className?: string; fit?: string }) {
  const effects = unsimulatedEffects(item, useSpecMeta().id)
  const flagged = !item.foreverData || effects.length > 0
  const own = useRef<HTMLSpanElement>(null)
  const wordsCopy = useRef<HTMLSpanElement>(null)
  const [words, setWords] = useState(false)
  const measured = fit !== undefined && flagged
  useLayoutEffect(() => {
    const flags = own.current
    const line = flags?.parentElement
    if (!measured || !flags || !line) return
    const check = () => {
      const lineStyle = getComputedStyle(line)
      const room =
        line.clientWidth - Number.parseFloat(lineStyle.paddingLeft) - Number.parseFloat(lineStyle.paddingRight) - Number.parseFloat(getComputedStyle(flags).marginRight)
      const text = line.querySelector<HTMLElement>('[data-chip-text]')
      const chip = text?.closest('button')
      // The chip as wide as its whole text: its icon, gap and padding, and the text unclipped.
      const chipWidth = text && chip ? chip.offsetWidth - text.clientWidth + text.scrollWidth : 0
      const gap = Number.parseFloat(lineStyle.columnGap) || 0
      setWords(chipWidth + gap + (wordsCopy.current?.offsetWidth ?? Number.POSITIVE_INFINITY) <= room)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(line)
    // A web font changes the text's width as it loads.
    document.fonts?.addEventListener('loadingdone', check)
    return () => {
      observer.disconnect()
      document.fonts?.removeEventListener('loadingdone', check)
    }
  }, [measured, fit])
  if (!flagged) return null
  return (
    <span ref={own} className={cn('flex shrink-0 items-center', words ? 'gap-x-1.5' : 'gap-x-6', className)}>
      {!item.foreverData && <ClassicStatsBadge iconOnly words={words} />}
      {effects.length > 0 && <UnsimulatedBadge effects={effects} iconOnly words={words} />}
      {measured && (
        // What the words take, measured, never shown.
        <span ref={wordsCopy} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex gap-x-1.5 whitespace-nowrap">
          {!item.foreverData && (
            <Badge variant="outline" className="gap-1.5 px-2">
              <History />
              Classic stats
            </Badge>
          )}
          {effects.length > 0 && (
            <Badge variant="outline" className="gap-1.5 px-2">
              <FlaskConicalOff />
              {effects.length === 1 ? 'Effect not simulated' : 'Effects not simulated'}
            </Badge>
          )}
        </span>
      )}
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
   * The wide layout's slot grid (docs/ux.md "Gear"), where each slot has a fixed budget of lines so
   * every slot fits the window whatever it holds: the name and its BiS rank on up to two 18 px lines,
   * then one line of `meta` and the stats, or of `note` in their place, each cut short with the whole
   * text as its hover title. The block is always the two lines' height and a stats line's, so a
   * short name doesn't move the slots. The flags go on the slot's enchant line (`ItemFlags`).
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
        <div className="flex min-h-13 min-w-0 flex-1 flex-col justify-center">
          {/* The rank follows the name's last word, wrapping with it; its box is the line's height, so
              it never makes the line taller. The whole name on hover, and as the slot's name. */}
          <span aria-hidden title={item.name} className={cn('line-clamp-2 text-sm leading-4.5 font-medium break-words', fade)}>
            <span className={QUALITY_CLASS[item.quality]}>{item.name}</span>
            {bis ? (
              <span className="ml-1.5 inline-flex h-4.5 items-center align-top">
                <BisBadge rank={bis} />
              </span>
            ) : null}
          </span>
          {/* One line, the whole text on hover, where an effect's words stand in for stats (Earthstrike's Use:). */}
          {note ? (
            <span aria-hidden className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
              {note}
            </span>
          ) : (
            <span aria-hidden title={statsLine(item)} className={cn('truncate text-xs text-muted-foreground tabular-nums', fade)}>
              {[meta, statsLine(item)].filter(Boolean).join(' · ')}
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
