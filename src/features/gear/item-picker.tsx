import { Check, Search, X } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Item } from '@/data/items/types'
import { useIsDesktop } from '@/hooks/use-media-query'
import { itemData, summarizeItem } from '@/lib/items'
import { cn } from '@/lib/utils'
import { fitsSlot, SPEC_META, type GearSlot, type SpecId } from '@/sim'
import { ItemSummary } from './item-row'
import { bisRank, itemDetails, itemKind, SLOT_LABEL } from './slots'

type Filter = 'bis' | 'all'

interface PickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spec: SpecId
  slot: GearSlot
  equippedId: number | null
  /** The unique item in the paired slot (e.g. Ring 2), which moves here if picked. */
  pairedUnique: { slot: GearSlot; itemId: number } | null
  onPick: (item: Item | null) => void
}

/** The item picker: a dialog on desktop, a full-height drawer on phones (docs/ux.md#sections). */
export function ItemPicker(props: PickerProps) {
  const isDesktop = useIsDesktop()
  const title = `Choose ${SLOT_LABEL[props.slot].toLowerCase()}`
  const description = `Items a ${SPEC_META[props.spec].className.toLowerCase()} can equip here.`
  if (isDesktop) {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className="flex h-[min(85vh,52rem)] max-w-2xl flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b p-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <PickerBody {...props} autoFocus />
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent className="h-[92svh] max-h-[92svh]">
        <DrawerHeader className="border-b text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <PickerBody {...props} />
      </DrawerContent>
    </Drawer>
  )
}

function PickerBody({ spec, slot, equippedId, pairedUnique, onPick, autoFocus }: PickerProps & { autoFocus?: boolean }) {
  const { classId } = SPEC_META[spec]
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const candidates = useMemo(
    () =>
      itemData.items
        .filter((item) => fitsSlot(classId, slot, item))
        .map((item) => ({
          item,
          bis: bisRank(item, spec, slot),
          text: `${item.name} ${itemKind(item) ?? ''} ${summarizeItem(item)}`.toLowerCase(),
        }))
        .sort(
          (a, b) =>
            (a.bis ?? 99) - (b.bis ?? 99) || b.item.itemLevel - a.item.itemLevel || a.item.name.localeCompare(b.item.name),
        ),
    [classId, slot, spec],
  )
  const hasBis = candidates.some((c) => c.bis)
  const [filter, setFilter] = useState<Filter>(hasBis ? 'bis' : 'all')

  const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean)
  const searching = words.length > 0
  const shown = candidates.filter(
    (c) => (searching || filter === 'all' || c.bis) && words.every((w) => c.text.includes(w)),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, type or stat, e.g. “crit”"
            aria-label="Search items"
            className="h-11 pl-9"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={searching ? 'all' : filter}
            disabled={searching}
            onValueChange={(v) => v && setFilter(v as Filter)}
          >
            <ToggleGroupItem value="bis" disabled={!hasBis} className="h-9 px-3">
              Best in slot
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="h-9 px-3">
              All items
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {shown.length} {shown.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" aria-label="Items">
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
          const moves = pairedUnique?.itemId === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={equipped || undefined}
                onClick={() => onPick(item)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none',
                  'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                  equipped && 'bg-muted',
                )}
              >
                <ItemSummary
                  item={item}
                  bis={bis}
                  meta={itemDetails(item, moves ? `Unique: moves from ${SLOT_LABEL[pairedUnique.slot].toLowerCase()}` : null)}
                />
                {equipped && <Check className="mt-1 size-4 shrink-0" aria-label="Equipped" />}
              </button>
            </li>
          )
        })}
        {shown.length === 0 && (
          <li className="flex flex-col items-center gap-3 px-4 py-12 text-center text-sm text-muted-foreground">
            No items match “{deferredQuery}”.
            <Button variant="outline" onClick={() => setQuery('')}>
              Clear search
            </Button>
          </li>
        )}
      </ul>
    </div>
  )
}
