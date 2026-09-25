// The Rotation tab's layout from 1440 px (docs/ux.md "Rotation", D34 as amended): the spec-wide
// settings in a column on the left and the priority list at the top of its own column beside them.
// Where a third column fits, the selected row's settings sit in a panel beside the list; where it
// doesn't, they open inline under the row. Which of the two also decides where the row's settings
// render, which CSS alone can't, so the tab measures the setup pane's width (its own: the tab has no
// side padding) rather than styling itself by a container query.
import { type FocusEvent, type RefObject, useLayoutEffect, useRef, useState } from 'react'
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

/** What can take focus with Tab, in the page's order. */
const tabbables = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')].filter(
    (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled,
  )

/**
 * Keeps focus on the same control when what holds it moves in the page as the layout changes under
 * it: the selected row's settings, inline under the row where two columns fit and a panel in the
 * third where three do, so a window crossing about 1,850 px (browser zoom, snapping a window) moves
 * them to new elements (review finding DL2-3; Gear keeps its elements instead, docs/ux.md "Gear").
 * Give `onFocus` and `onBlur` to each place the settings render. When `place` changes and the
 * control that had focus went with the old place, focus goes to the control with its id in the new
 * one (`container`), or else the one at its place in the tab order, or else `fallback`, the
 * settings' heading.
 */
export function useFocusAcrossPlaces(place: string, container: () => HTMLElement | null, fallback: () => HTMLElement | null) {
  const held = useRef<{ id: string; index: number } | null>(null)
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    held.current = { id: target.id, index: tabbables(e.currentTarget).indexOf(target) }
  }
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null
    if (next) {
      if (!e.currentTarget.contains(next)) held.current = null
      return
    }
    // Focus went to no element: a click on the page, or the control's removal with its place. Only
    // a click leaves the control in the page.
    const target = e.target as HTMLElement
    queueMicrotask(() => {
      if (target.isConnected && document.activeElement !== target) held.current = null
    })
  }
  // The effect of the render whose place changed, so `container` looks in the new place.
  const last = useRef(place)
  useLayoutEffect(() => {
    if (last.current === place) return
    last.current = place
    const was = held.current
    const active = document.activeElement
    if (!was || (active && active !== document.body)) return
    const root = container()
    if (!root) return
    const byId = was.id ? [...root.querySelectorAll<HTMLElement>('[id]')].find((el) => el.id === was.id) : undefined
    ;(byId ?? (was.index >= 0 ? tabbables(root)[was.index] : undefined) ?? fallback())?.focus()
  })
  return { onFocus, onBlur }
}
