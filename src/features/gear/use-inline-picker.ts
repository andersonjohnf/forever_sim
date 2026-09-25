import { useLayoutEffect, useState, type RefObject } from 'react'
import { useIsWide } from '@/hooks/use-media-query'

/**
 * The setup pane's width, in rem, from which Gear shows the item picker inline beside a compact slot
 * list instead of in a dialog (docs/ux.md "Gear", D34). The setup pane is a container only from
 * 1440 px, where it's 55 rem (1440 px, less the 24 px gutters, the 32 px gap and the 30 rem results
 * pane), or about 54 where a scrollbar takes room (Windows, or macOS set to always show them); 53
 * keeps the panel on from 1440 px either way.
 * The layout's other steps are container variants on the pane (`@min-[68rem]/setup:`), which
 * need no script.
 */
export const INLINE_PICKER_MIN_REM = 53

/**
 * Whether the element (the Gear tab's body, as wide as the setup pane) is wide enough for the inline
 * picker. Under 1440 px it's always false: the dialog and the phone's drawer are as they were.
 * From 1440 px the pane always fits, so the first render follows the media query alone and Gear
 * mounts the wide layout straight away, rather than the narrow one and then a swap (review finding
 * DL-6). It measures before the first paint all the same, for a pane some other rule has narrowed.
 */
export function useInlinePicker(ref: RefObject<HTMLElement | null>): boolean {
  const wide = useIsWide()
  const [fits, setFits] = useState(true)
  useLayoutEffect(() => {
    const el = ref.current
    if (!wide || !el) return
    const update = () => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setFits(el.clientWidth >= INLINE_PICKER_MIN_REM * rem)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, wide])
  return wide && fits
}
