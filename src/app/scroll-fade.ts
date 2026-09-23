import { useEffect, useRef, useState } from 'react'

/** Which edges of a horizontal scroller have more content past them. */
export type Fade = 'none' | 'left' | 'right' | 'both'

/**
 * Tracks a horizontal scroller's position (docs/ux.md#layout), so its edge fade shows only where
 * there's more to scroll to: no right fade at the end, a left fade once scrolled. Also keeps the
 * `active` element in view, clear of the fades, when it changes (e.g. the saved tab on a phone).
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
    // Resizes of the scroller or of its content (a web font arriving) move the ends too.
    const observer = new ResizeObserver(update)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    reveal(ref.current, reduce ? 'auto' : 'smooth')
  }, [active])

  // On first load the web font can widen the items after that first layout.
  useEffect(() => {
    void document.fonts?.ready.then(() => reveal(ref.current, 'auto'))
  }, [])

  return { ref, fade }
}

/** Scrolls `scroller` just enough to show its active item clear of the edge fades. */
function reveal(scroller: HTMLElement | null, behavior: ScrollBehavior) {
  const item = scroller?.querySelector<HTMLElement>('[data-state="active"]')
  if (!scroller || !item) return
  const margin = 48 // the width of a fade
  const box = scroller.getBoundingClientRect()
  const { left, right } = item.getBoundingClientRect()
  const by = left < box.left + margin ? left - box.left - margin : right > box.right - margin ? right - box.right + margin : 0
  if (by !== 0) scroller.scrollBy({ left: by, behavior })
}
