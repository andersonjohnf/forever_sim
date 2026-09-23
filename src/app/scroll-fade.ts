import { useEffect, useRef, useState } from 'react'

/** Which edges of a horizontal scroller have more content past them. */
export type Fade = 'none' | 'left' | 'right' | 'both'

/**
 * Tracks a horizontal scroller's position (docs/ux.md#layout), so its edge fade shows only where
 * there's more to scroll to: no right fade at the end, a left fade once scrolled. Also keeps the
 * `active` element in view, clear of the fades, when it changes (e.g. the saved tab on a phone),
 * and the focused one as arrow keys move focus between the items.
 */
export function useScrollFade<T extends HTMLElement>(active: unknown) {
  const ref = useRef<T>(null)
  const [fade, setFade] = useState<Fade>('none')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 1
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setFade(left && right ? 'both' : left ? 'left' : right ? 'right' : 'none')
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    // Focus moved by arrow keys (manual activation) doesn't change the active item, and the
    // browser scrolls the focused one only just into view, under the fade.
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && e.target !== el) reveal(el, e.target, behavior())
    }
    el.addEventListener('focusin', onFocus)
    // Resizes of the scroller or of its content (a web font arriving) move the ends too.
    const observer = new ResizeObserver(update)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => {
      el.removeEventListener('scroll', update)
      el.removeEventListener('focusin', onFocus)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    reveal(ref.current, activeItem(ref.current), behavior())
  }, [active])

  // On first load the web font can widen the items after that first layout.
  useEffect(() => {
    void document.fonts?.ready.then(() => reveal(ref.current, activeItem(ref.current), 'auto'))
  }, [])

  return { ref, fade }
}

const behavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

const activeItem = (scroller: HTMLElement | null) => scroller?.querySelector<HTMLElement>('[data-state="active"]') ?? null

/**
 * Scrolls `scroller` just enough to show `item` clear of the edge fades. The target is absolute,
 * so a second call during the smooth scroll (a click focuses a tab, then opens it) aims at the
 * same place rather than adding to it.
 */
function reveal(scroller: HTMLElement | null, item: HTMLElement | null, behavior: ScrollBehavior) {
  if (!scroller || !item) return
  const margin = 48 // the width of a fade
  const box = scroller.getBoundingClientRect()
  const rect = item.getBoundingClientRect()
  // The item's edges in the scroller's content, whatever it's scrolled to right now.
  const left = rect.left - box.left + scroller.scrollLeft
  const right = rect.right - box.left + scroller.scrollLeft
  const view = scroller.scrollLeft
  const target =
    left - margin < view ? left - margin : right + margin > view + scroller.clientWidth ? right + margin - scroller.clientWidth : null
  if (target !== null) scroller.scrollTo({ left: Math.max(0, target), behavior })
}
