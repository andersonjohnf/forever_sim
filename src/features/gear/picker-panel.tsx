import { ArrowLeft } from 'lucide-react'
import { useRef, type KeyboardEvent, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { PickerBody, type PickerBodyProps } from './item-picker'
import { pickerDescription, pickerTitle } from './picker-text'

/** The panel's heading, which takes focus when a slot is chosen (docs/ux.md "Gear"). */
export const PICKER_HEADING_ID = 'gear-picker-heading'

/**
 * Where the panel sits: under the sticky header and tabs, reaching down to 1rem above the window's
 * bottom, as the Rotation panel does (src/features/rotation/priority-list.tsx, docs/ux.md
 * "Rotation"). App keeps the sticky edge in --sticky-top.
 */
const STICKY = 'sticky top-[calc(var(--sticky-top,7rem)+1rem)]'

/** Whether a key press is typing in a field, where `/` is a character rather than a shortcut. */
function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

/**
 * The item picker inline, beside the slot list, in the wide layout (docs/ux.md "Gear", D34): the
 * dialog's own body (search, filters, sort, rows, rules and messages) under a heading and **Back to
 * list**. Picking an item equips it and the panel stays on the slot. Back to list, or Escape
 * anywhere in the panel, returns focus to the slot's row; `/` focuses the search. Until a slot is
 * chosen it says to choose one. The parent keys it by the slot, so another slot starts afresh.
 */
export function PickerPanel({
  slot,
  onBack,
  ...body
}: Omit<PickerBodyProps, 'slot' | 'autoFocus' | 'searchRef' | 'fadeEdges'> & {
  slot: PickerBodyProps['slot'] | null
  /** Back to the slot's row on the list. */
  onBack: () => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  if (slot === null) {
    return (
      <aside aria-label="Item picker" className={STICKY}>
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Choose a slot to see the items you can equip there.</p>
      </aside>
    )
  }
  return (
    <aside
      aria-labelledby={PICKER_HEADING_ID}
      onKeyDown={(e) => panelKeys(e, onBack, searchRef)}
      className={`${STICKY} flex h-[calc(100svh-var(--sticky-top,7rem)-2rem)] min-h-96 flex-col overflow-hidden rounded-xl border`}
    >
      <div className="flex flex-col gap-1 border-b px-4 pt-2 pb-4">
        {/* Back to the list first, so Shift+Tab from the heading reaches it. */}
        <Button variant="ghost" className="-ml-2 h-11 self-start text-muted-foreground" onClick={onBack}>
          <ArrowLeft /> Back to list
        </Button>
        <h3 id={PICKER_HEADING_ID} tabIndex={-1} className="font-medium outline-none">
          {pickerTitle(slot)}
        </h3>
        <p className="text-sm text-muted-foreground">{pickerDescription(body.spec)}</p>
      </div>
      <PickerBody {...body} slot={slot} searchRef={searchRef} fadeEdges />
    </aside>
  )
}

/**
 * Escape goes back to the slot's row; `/` outside a field focuses the search. Keys from a popover
 * or a select's list, which React passes up from their portals, are theirs: only the panel's own
 * elements count.
 */
function panelKeys(e: KeyboardEvent<HTMLElement>, onBack: () => void, searchRef: RefObject<HTMLInputElement | null>) {
  if (e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return
  if (e.key === 'Escape') {
    e.preventDefault()
    onBack()
  } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) {
    e.preventDefault()
    searchRef.current?.focus()
  }
}
