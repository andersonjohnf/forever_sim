import { Ban, Check, Search, X } from 'lucide-react'
import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { DrawerCloseButton } from '@/app/drawer-close-button'
import { useSheetFocus } from '@/app/sheet-focus'
import { SelectContent } from '@/components/select-content'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Item } from '@/data/items/types'
import { useIsDesktop } from '@/hooks/use-media-query'
import { CHOICE_ITEM } from '@/lib/choice'
import { itemData, summarizeItem } from '@/lib/items'
import { cn } from '@/lib/utils'
import { fitsFaction, fitsSlot, SPEC_META, uniqueConflicts, type GearSlot, type SpecId, type UniqueConflict } from '@/sim'
import { itemDescription } from './item-flags'
import { ItemSummary } from './item-row'
import { bisRank, itemDetails, itemKind, SLOT_LABEL } from './slots'

type Filter = 'bis' | 'all'
type Sort = 'bis' | 'itemLevel' | 'name'

interface PickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spec: SpecId
  /** The character's race: the other faction's items aren't offered. */
  race: string
  slot: GearSlot
  equippedId: number | null
  /** What's equipped in every slot, for the Unique and Unique-Equipped rules. */
  worn: Partial<Record<GearSlot, Item>>
  onPick: (item: Item | null) => void
  /** The slot's button, which focus goes back to however the picker closes, a pick included. */
  returnTo: () => HTMLElement | null | undefined
}

/** How the Unique rules treat an item here: free to pick, moving from another slot, or blocked. */
function uniqueState(worn: PickerProps['worn'], slot: GearSlot, item: Item): { moves?: string; blocked?: string } {
  const conflicts = uniqueConflicts(worn, slot, item)
  if (conflicts.length === 0) return {}
  const where = (c: UniqueConflict) => SLOT_LABEL[c.slot].toLowerCase()
  // Another copy of this item: picking it moves it here (as the game swaps it).
  if (conflicts.every((c) => c.item.id === item.id)) return { moves: `Unique: moves from ${where(conflicts[0])}` }
  const { group, max } = conflicts[0]
  const wearing = conflicts.map((c) => `${c.item.name} in ${where(c)}`).join(' and ')
  return { blocked: `Unique-Equipped (${group}${max > 1 ? `, up to ${max}` : ''}): you’re wearing ${wearing}.` }
}

/** The dialog's close button at 44 px (the stock one is 28; docs/ux.md "Accessibility"). */
function CloseButton() {
  return (
    <DialogClose asChild>
      <Button variant="ghost" size="icon" className="absolute top-1.5 right-1.5 size-11" aria-label="Close">
        <X />
      </Button>
    </DialogClose>
  )
}

/**
 * The item picker: a dialog on desktop, a full-height drawer on phones (docs/ux.md#sections).
 * Focus moves in when it opens (the search box on desktop; the title on a phone, so the keyboard
 * doesn't pop up over the list), stays inside, and goes back to the slot's button when it closes.
 * The parent unmounts the picker rather than closing it, which Radix reports the same way.
 */
export function ItemPicker(props: PickerProps) {
  const isDesktop = useIsDesktop()
  const { titleRef, contentProps } = useSheetFocus(props.returnTo)
  const title = `Choose ${SLOT_LABEL[props.slot].toLowerCase()}`
  const description = `Items a ${SPEC_META[props.spec].className.toLowerCase()} can equip here.`
  if (isDesktop) {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(85vh,52rem)] max-w-2xl flex-col gap-0 p-0 sm:max-w-2xl"
          {...contentProps}
        >
          <DialogHeader className="border-b p-4 pr-14">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <PickerBody {...props} autoFocus />
          <CloseButton />
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent className="h-[92svh] max-h-[92svh] data-[vaul-drawer-direction=bottom]:max-h-[92svh]" {...contentProps}>
        <DrawerHeader className="relative border-b px-14 text-left">
          <DrawerTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {title}
          </DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
          <DrawerCloseButton />
        </DrawerHeader>
        <PickerBody {...props} />
      </DrawerContent>
    </Drawer>
  )
}

/** The picker's orders (docs/ux.md "Gear"): the spec's BiS ranks first, item level, or name. */
const SORTS: { value: Sort; label: string }[] = [
  { value: 'bis', label: 'BiS rank' },
  { value: 'itemLevel', label: 'Item level' },
  { value: 'name', label: 'Name' },
]

type Candidate = { item: Item; bis: number | null; text: string }

const byName = (a: Candidate, b: Candidate) => a.item.name.localeCompare(b.item.name)
const byItemLevel = (a: Candidate, b: Candidate) => b.item.itemLevel - a.item.itemLevel || byName(a, b)
const COMPARE: Record<Sort, (a: Candidate, b: Candidate) => number> = {
  bis: (a, b) => (a.bis ?? 99) - (b.bis ?? 99) || byItemLevel(a, b),
  itemLevel: byItemLevel,
  name: byName,
}

function PickerBody({ spec, race, slot, equippedId, worn, onPick, autoFocus }: PickerProps & { autoFocus?: boolean }) {
  const { classId } = SPEC_META[spec]
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const searchRef = useRef<HTMLInputElement>(null)
  const candidates = useMemo(
    () =>
      itemData.items
        // The equipped item stays listed even if it's the other faction's (the race changed since).
        .filter((item) => fitsSlot(classId, slot, item) && (fitsFaction(race, item) || item.id === equippedId))
        .map((item) => ({
          item,
          bis: bisRank(item, spec, slot),
          text: `${item.name} ${itemKind(item) ?? ''} ${summarizeItem(item)}`.toLowerCase(),
        })),
    [classId, slot, spec, race, equippedId],
  )
  const hasBis = candidates.some((c) => c.bis)
  const [filter, setFilter] = useState<Filter>(hasBis ? 'bis' : 'all')
  const [sort, setSort] = useState<Sort>(hasBis ? 'bis' : 'itemLevel')
  const sorts = hasBis ? SORTS : SORTS.filter((s) => s.value !== 'bis')

  const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean)
  const searching = words.length > 0
  const shown = candidates
    .filter((c) => (searching || filter === 'all' || c.bis) && words.every((w) => c.text.includes(w)))
    .sort(COMPARE[sort])
  const clearSearch = () => {
    setQuery('')
    searchRef.current?.focus()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, type or stat, e.g. “crit”"
            aria-label="Search items"
            className={cn('h-11 pl-9', query && 'pr-11')}
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 size-11 rounded-l-none"
              aria-label="Clear search"
              onClick={clearSearch}
            >
              <X />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={searching ? 'all' : filter}
            disabled={searching}
            onValueChange={(v) => v && setFilter(v as Filter)}
            aria-label="Show"
          >
            <ToggleGroupItem value="bis" disabled={!hasBis} className={cn('h-11 px-3', CHOICE_ITEM)}>
              Best in slot
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className={cn('h-11 px-3', CHOICE_ITEM)}>
              All items
            </ToggleGroupItem>
          </ToggleGroup>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            {/* A combobox takes no name from its content, so it says the order in its label. */}
            <SelectTrigger aria-label={`Sort by ${sorts.find((s) => s.value === sort)?.label ?? ''}`} className="data-[size=default]:h-11">
              <span aria-hidden className="text-muted-foreground">
                Sort:
              </span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sorts.map((s) => (
                <SelectItem key={s.value} value={s.value} className="min-h-11">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {shown.length} {shown.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      {/* Focus in it scrolls clear of the toasts, which sit over the picker (src/index.css). */}
      <ul className="min-h-0 flex-1 scroll-pb-toast overflow-y-auto overscroll-contain p-2" aria-label="Items">
        {equippedId !== null && !searching && (
          <li>
            <button
              type="button"
              onClick={() => onPick(null)}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <X className="size-4" /> Leave this slot empty
            </button>
          </li>
        )}
        {shown.map(({ item, bis }) => {
          const equipped = item.id === equippedId
          const { moves, blocked } = uniqueState(worn, slot, item)
          const details = itemDetails(item, moves)
          return (
            <li key={item.id}>
              {/* The item's button covers the row, with the whole item as its name; the flag badges sit
                  above it (docs/ux.md "Gear"). Its z-1 keeps it over a blocked item's faded content,
                  which opacity would lift above it. A blocked item stays focusable (aria-disabled), so
                  its reason is read out. */}
              <div
                className={cn(
                  'relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5',
                  blocked ? 'cursor-not-allowed' : 'hover:bg-muted',
                  equipped && 'bg-muted',
                )}
              >
                <button
                  type="button"
                  aria-current={equipped || undefined}
                  aria-disabled={blocked ? true : undefined}
                  onClick={() => !blocked && onPick(item)}
                  className={cn(
                    'absolute inset-0 z-1 rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    blocked && 'cursor-not-allowed',
                  )}
                >
                  <span className="sr-only">
                    {item.name}. {itemDescription(item, { bis, meta: details, note: blocked })}
                    {equipped && '. Equipped'}
                  </span>
                </button>
                <ItemSummary
                  item={item}
                  bis={bis}
                  meta={details}
                  dimmed={Boolean(blocked)}
                  note={
                    blocked && (
                      <>
                        <Ban className="mt-px size-3.5 shrink-0" aria-hidden />
                        {blocked}
                      </>
                    )
                  }
                />
                {equipped && <Check className="mt-1 size-4 shrink-0" aria-hidden />}
              </div>
            </li>
          )
        })}
        {shown.length === 0 && (
          <li className="flex flex-col items-center gap-3 px-4 py-12 text-center text-sm text-muted-foreground">
            No items match “{deferredQuery}”.
            <Button variant="outline" className="h-11" onClick={clearSearch}>
              Clear search
            </Button>
          </li>
        )}
      </ul>
    </div>
  )
}
