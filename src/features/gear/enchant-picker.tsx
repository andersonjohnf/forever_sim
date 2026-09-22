import { Check, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Item } from '@/data/items/types'
import { cn } from '@/lib/utils'
import type { GearSlot } from '@/sim'
import { enchantsFor } from './enchants'
import { SLOT_LABEL } from './slots'

export function EnchantPicker({
  slot,
  item,
  enchantId,
  onChange,
}: {
  slot: GearSlot
  item: Item
  enchantId: string | undefined
  onChange: (enchantId: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const options = enchantsFor(slot, item)
  const current = options.find((e) => e.id === enchantId)
  if (options.length === 0) return null
  const pick = (id: string | undefined) => {
    onChange(id)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${SLOT_LABEL[slot]} enchant: ${current?.name ?? 'none'}. Change enchant`}
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-b-xl px-3 text-left text-xs outline-none',
            'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
            current ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
          )}
        >
          <Sparkles className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{current ? `${current.name} · ${current.summary}` : 'Add an enchant'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-1">
        <ul role="listbox" aria-label={`${SLOT_LABEL[slot]} enchants`} className="flex max-h-80 flex-col overflow-y-auto">
          {[undefined, ...options].map((option) => {
            const selected = option?.id === current?.id
            return (
              <li key={option?.id ?? 'none'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(option?.id)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn(!option && 'text-muted-foreground')}>{option?.name ?? 'No enchant'}</span>
                    {option && <span className="text-xs text-muted-foreground">{option.summary}</span>}
                  </span>
                  {selected && <Check className="size-4 shrink-0" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
