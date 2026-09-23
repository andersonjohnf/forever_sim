import { Check, Sparkles, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useSheetFocus } from '@/app/sheet-focus'
import { useSetup } from '@/app/setup-store'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Item } from '@/data/items/types'
import { ClassicEraNote } from '@/features/character/classic-era-note'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import type { EnchantDefinition, GearSlot } from '@/sim'
import { enchantsFor } from './enchants'
import { SLOT_LABEL } from './slots'

/**
 * A slot's enchant chip, which opens the enchant picker (docs/ux.md "Gear"): a popover on wider
 * screens, a full-height sheet below 640 px, like the item picker. Either way the choices are one
 * listbox: focus goes to it with the current enchant active, arrow keys move, Enter picks, and
 * focus returns to the chip when it closes.
 *
 * If the chip goes while the picker is open (an Undo from a toast takes the slot's item away),
 * focus goes to `fallbackFocus`, the slot's button, rather than falling to the page.
 */
export function EnchantPicker({
  slot,
  item,
  enchantId,
  onChange,
  fallbackFocus,
}: {
  slot: GearSlot
  item: Item
  enchantId: string | undefined
  onChange: (enchantId: string | undefined) => void
  fallbackFocus: () => HTMLElement | null | undefined
}) {
  const [open, setOpen] = useState(false)
  const profile = useSetup((s) => s.config.rules.profile)
  const wide = useMediaQuery('(min-width: 640px)')
  // Radix reports a picker that unmounts with its chip as a close, once the chip has gone.
  const chipRef = useRef<HTMLButtonElement>(null)
  const { contentProps } = useSheetFocus(() => chipRef.current ?? fallbackFocus())
  const listRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const options = enchantsFor(slot, item, profile)
  const current = options.find((e) => e.id === enchantId)
  if (options.length === 0) return null

  const title = `${SLOT_LABEL[slot]} enchant`
  const pick = (id: string | undefined) => {
    onChange(id)
    setOpen(false)
  }
  // Focus goes to the list, whose active option is the current enchant.
  const focusList = (event: Event) => {
    event.preventDefault()
    listRef.current?.focus({ preventScroll: true })
  }
  const list = (
    <EnchantList
      listRef={listRef}
      label={`${SLOT_LABEL[slot]} enchants`}
      options={options}
      current={current}
      onPick={pick}
      className={wide ? undefined : 'min-h-0 flex-1'}
    />
  )
  const trigger = (
    <button
      ref={chipRef}
      type="button"
      // Starts with its visible text (WCAG 2.5.3): "Greater Strength · +10 Strength, Hands enchant".
      aria-label={current ? `${current.name} · ${current.summary}, ${title}` : `Add an enchant, ${SLOT_LABEL[slot]}`}
      aria-haspopup="dialog"
      onClick={wide ? undefined : () => setOpen(true)}
      className={cn(
        'flex min-h-11 w-full items-center gap-2 rounded-b-xl px-3 text-left text-xs outline-none',
        'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
        current ? 'text-positive' : 'text-muted-foreground',
      )}
    >
      <Sparkles className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{current ? `${current.name} · ${current.summary}` : 'Add an enchant'}</span>
    </button>
  )

  if (wide) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          aria-labelledby={titleId}
          onOpenAutoFocus={focusList}
          onCloseAutoFocus={(event) => {
            // Its trigger takes focus back, unless the chip has gone.
            if (chipRef.current) return
            event.preventDefault()
            fallbackFocus()?.focus({ preventScroll: true })
          }}
          className="w-[min(22rem,calc(100vw-2rem))] gap-1 p-1"
        >
          <p id={titleId} className="px-3 pt-2 pb-1 text-sm font-medium">
            {title}
          </p>
          {/* Room below for its link's hit area, clear of the list (LINK_HIT_AREA). */}
          <ClassicEraNote what="Enchants" className="mx-2 mb-3" />
          {list}
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <>
      {trigger}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent onOpenAutoFocus={focusList} onCloseAutoFocus={contentProps.onCloseAutoFocus} className="h-[92svh] data-[vaul-drawer-direction=bottom]:max-h-[92svh]">
          <DrawerHeader className="relative border-b pr-14 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{item.name}</DrawerDescription>
            {/* 44 px, like the item picker's (docs/ux.md "Accessibility"). */}
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="absolute top-2 right-2 size-11" aria-label="Close">
                <X />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          <ClassicEraNote what="Enchants" className="mx-4 mt-3 mb-3" />
          {list}
        </DrawerContent>
      </Drawer>
    </>
  )
}

/**
 * The enchants as one single-select listbox (the ARIA listbox pattern), "No enchant" first. The
 * list holds focus and points at its active option (aria-activedescendant), which starts on the
 * current enchant; the current one is the selected option and carries a check. Arrow keys, Home and
 * End move, Enter or Space picks. No search box: there are at most a dozen choices.
 */
function EnchantList({
  listRef,
  label,
  options,
  current,
  onPick,
  className,
}: {
  listRef: RefObject<HTMLDivElement | null>
  label: string
  options: EnchantDefinition[]
  current: EnchantDefinition | undefined
  onPick: (id: string | undefined) => void
  className?: string
}) {
  const baseId = useId()
  const choices = [undefined, ...options]
  const [active, setActive] = useState(() => Math.max(0, choices.indexOf(current)))
  const optionId = (index: number) => `${baseId}-${index}`
  // Keep the active option in view as the keys move it, scrolling the list only, never the page.
  useEffect(() => {
    const list = listRef.current
    const option = document.getElementById(`${baseId}-${active}`)
    if (!list || !option) return
    const pad = 4
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop - pad
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight + pad
    }
  }, [active, baseId, listRef])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = choices.length - 1
    const next = { ArrowDown: active === last ? 0 : active + 1, ArrowUp: active === 0 ? last : active - 1, Home: 0, End: last }[e.key]
    if (next !== undefined) {
      e.preventDefault()
      setActive(next)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(choices[active]?.id)
    }
  }
  return (
    <div
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={optionId(active)}
      onKeyDown={onKeyDown}
      className={cn(
        'relative flex max-h-80 flex-col overflow-y-auto rounded-md p-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        'in-data-[slot=drawer-content]:max-h-none in-data-[slot=drawer-content]:p-2',
        className,
      )}
    >
      {choices.map((option, index) => {
        const checked = option?.id === current?.id
        return (
          <div
            key={option?.id ?? 'none'}
            id={optionId(index)}
            role="option"
            aria-selected={checked}
            data-active={index === active || undefined}
            onPointerMove={() => index !== active && setActive(index)}
            onClick={() => onPick(option?.id)}
            // The active option's muted fill takes its secondary text to the full text colour (AA).
            // The fill alone is about 1.1:1, so a bar in the focus ring's colour marks it too, at
            // 3:1 or more in both themes (WCAG 1.4.11).
            className={cn(
              'group/option relative flex min-h-11 cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm select-none',
              'data-active:bg-muted data-active:before:absolute data-active:before:inset-y-2 data-active:before:left-0.5 data-active:before:w-1 data-active:before:rounded-full data-active:before:bg-ring',
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn(!option && 'text-muted-foreground group-data-active/option:text-foreground')}>{option?.name ?? 'No enchant'}</span>
              {option && <span className="text-xs text-muted-foreground group-data-active/option:text-foreground">{option.summary}</span>}
            </span>
            <Check aria-hidden className={cn('size-4 shrink-0', !checked && 'invisible')} />
          </div>
        )
      })}
    </div>
  )
}
