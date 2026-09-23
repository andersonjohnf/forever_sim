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
 * It always drops from its trigger (popper), so it looks the same whether or not a toast is up,
 * and the toasts' reach is its bottom collision padding: Radix flips it above the trigger, or
 * shortens it to scroll, clear of them. shadcn's own list, laid over its trigger, reaches to the
 * window's edge whatever covers it.
 *
 * The padding is the one it opened with: a toast going while it's open doesn't move it, or lose
 * its active option. (None comes while it's open: a select's list closes as the window loses focus
 * or is resized, and choosing from one raises no toast.)
 */
export function SelectContent(props: Omit<ComponentProps<typeof ListContent>, 'position' | 'collisionPadding' | 'ref'>) {
  const clearance = useSyncExternalStore(onToastClearance, toastClearance)
  // Radix mounts the list only while it's open.
  const [list, setList] = useState<HTMLDivElement | null>(null)
  const [reach, setReach] = useState(clearance)
  if (list === null && reach !== clearance) setReach(clearance)
  return (
    <ListContent
      {...props}
      ref={setList}
      position="popper"
      collisionPadding={{ top: MARGIN, right: MARGIN, left: MARGIN, bottom: Math.max(MARGIN, reach + SPARE) }}
    />
  )
}
