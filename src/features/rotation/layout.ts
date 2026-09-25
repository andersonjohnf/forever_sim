// The Rotation tab's layout from 1440 px (docs/ux.md "Rotation", D34 as amended): the spec-wide
// settings in a column on the left and the priority list at the top of its own column beside them.
// Where a third column fits, the selected row's settings sit in a panel beside the list; where it
// doesn't, they open inline under the row. Which of the two also decides where the row's settings
// render, which CSS alone can't, so the tab measures the setup pane's width (its own: the tab has no
// side padding) rather than styling itself by a container query.
import { type RefObject, useLayoutEffect, useState } from 'react'
import { useIsWide } from '@/hooks/use-media-query'

/**
 * `narrow`: under 1440 px, one column as ever. `two`: settings | list, the row's settings inline
 * under it. `three`: settings | list | the row's settings panel.
 */
export type RotationLayout = 'narrow' | 'two' | 'three'

/**
 * The three columns' least widths and the gap between them: the settings and the row's panel from
 * 22 rem, the list from 24 rem (its rows' handle, icon, name, summary and switch). Each grows by the
 * same share of any room left, the settings and the panel to 28 rem and the list to 36 rem, past
 * which the rest stays empty rather than stretching them (docs/ux.md principle 4).
 */
export const COLUMNS = {
  two: 'grid-cols-[minmax(22rem,28rem)_minmax(24rem,36rem)]',
  three: 'grid-cols-[minmax(22rem,28rem)_minmax(24rem,36rem)_minmax(22rem,28rem)]',
} as const

/**
 * The setup pane's width from which the three columns fit: their 71 rem least (22 + 24 + 22 and two
 * 1.5 rem gaps) and a rem to spare. The pane is 72 rem from a window of about 1,850 px, about 1,870
 * beside a classic scrollbar, so a 1,920 px window (74 rem with a scrollbar) has three columns and
 * a 1,600 px one (about 62 rem) two.
 */
export const THREE_COLUMNS_FROM_REM = 72

/** The Rotation tab's layout for the width of `ref`'s element, the tab itself (docs/ux.md "Rotation"). */
export function useRotationLayout(ref: RefObject<HTMLElement | null>): RotationLayout {
  const wide = useIsWide()
  const [three, setThree] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!wide || !el) return
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    // Measured before the first paint, then on every change of width (a window resized, a scrollbar).
    const update = () => setThree(el.getBoundingClientRect().width >= THREE_COLUMNS_FROM_REM * rem)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, wide])
  return !wide ? 'narrow' : three ? 'three' : 'two'
}
