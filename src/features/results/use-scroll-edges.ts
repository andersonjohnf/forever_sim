import { type RefObject, useEffect, useState } from 'react'

/**
 * Whether a scroll container has content hidden above or below, kept up to date as it scrolls
 * and as it or its content (`content`, e.g. a section opening) changes size.
 */
export function useScrollEdges(scroller: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ above: false, below: false })
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => {
      const above = el.scrollTop > 1
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1
      setEdges((e) => (e.above === above && e.below === below ? e : { above, below }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(el)
    if (content.current) observer?.observe(content.current)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [scroller, content])
  return edges
}
