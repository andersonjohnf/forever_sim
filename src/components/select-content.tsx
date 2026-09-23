import { useState, useSyncExternalStore, type ComponentProps } from 'react'
import { onToastClearance, toastClearance } from '@/app/toast-layer'
import { SelectContent as ListContent } from '@/components/ui/select'

/** Radix's margin round a select's list at the window's edges (its CONTENT_MARGIN). */
const MARGIN = 10
/** What the scroll padding leaves above the toasts, 0.5rem (src/index.css). */
const SPARE = 8

/**
 * A select's list that never shows an option under a toast (docs/ux.md#persistence-and-sharing,
 * WCAG 2.4.11). Use it in place of shadcn's SelectContent.
 *
 * With no toast up, it's shadcn's own: laid over its trigger, the chosen option on it
 * (item-aligned). That reaches to the window's edge whatever covers it, so opened while a toast is
 * up, the list drops from its trigger instead (popper), with the toasts' reach as its bottom
 * collision padding: Radix flips it above the trigger, or shortens it to scroll, clear of them.
 *
 * While it's open, nothing moves it by itself. It keeps the way it opened, because changing that
 * would remount the options and lose the active one. And its padding only rises: it moves clear
 * of a toast that grows, but it doesn't drop back when one goes.
 */
export function SelectContent(props: Omit<ComponentProps<typeof ListContent>, 'position' | 'collisionPadding' | 'ref'>) {
  const clearance = useSyncExternalStore(onToastClearance, toastClearance)
  // Radix mounts the list only while it's open.
  const [list, setList] = useState<HTMLDivElement | null>(null)
  const open = list !== null
  const [popper, setPopper] = useState(clearance > 0)
  if (!open && popper !== clearance > 0) setPopper(clearance > 0)
  const [reach, setReach] = useState(clearance)
  const next = open ? Math.max(reach, clearance) : clearance
  if (next !== reach) setReach(next)

  if (!popper) return <ListContent {...props} ref={setList} />
  return (
    <ListContent
      {...props}
      ref={setList}
      position="popper"
      collisionPadding={{ top: MARGIN, right: MARGIN, left: MARGIN, bottom: Math.max(MARGIN, reach + SPARE) }}
    />
  )
}
