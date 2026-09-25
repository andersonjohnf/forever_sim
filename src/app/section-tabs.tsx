import { useEffect, useRef } from 'react'
import { useScrollFade } from '@/app/scroll-fade'
import type { Section } from '@/app/setup-store'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

/** One section's tab: its id in the store (SECTION_IDS) and the label the tab shows. */
export interface SectionTab {
  id: Section
  label: string
}

/**
 * Keeps the bottom edge of the sticky section tabs (their sticky offset under the header, plus
 * their height) in --sticky-top, so keyboard focus scrolls clear of the header and the tabs
 * (WCAG 2.4.11; the page's scroll padding, src/index.css).
 */
function useStickyTop() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = ref.current
    if (!bar) return
    const root = document.documentElement
    const observer = new ResizeObserver(() => {
      const top = Number.parseFloat(getComputedStyle(bar).top) || 0
      root.style.setProperty('--sticky-top', `${top + bar.getBoundingClientRect().height}px`)
    })
    observer.observe(bar)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--sticky-top')
    }
  }, [])
  return ref
}

/**
 * The setup's section tabs, sticky under the header (docs/ux.md#layout). They render inside App's
 * `<Tabs>` root, which owns the chosen section and manual activation: arrow keys move between tabs,
 * Enter or Space opens one. What each section holds is said by the wide panel's setup summary
 * (src/app/setup-summary.tsx), not under its tab.
 */
export function SectionTabs({
  sections,
  active,
}: {
  sections: readonly SectionTab[]
  /** The open section: the tab the sideways scroller keeps in view. */
  active: Section
}) {
  const { ref: listRef, fade } = useScrollFade<HTMLDivElement>(active)
  const bar = useStickyTop()
  return (
    <div ref={bar} data-sticky-tabs className="sticky top-14 z-30 -mx-4 border-b bg-page/95 px-4 backdrop-blur lg:mx-0 lg:px-0">
      {/*
       * On narrow screens the tabs scroll sideways, and a fade marks each edge with more past it.
       * Tabs are 44 px tall (docs/ux.md principle 4), their underline on the bar's edge.
       */}
      <TabsList
        ref={listRef}
        variant="line"
        data-fade={fade}
        className="w-full justify-start gap-1 overflow-x-auto [scrollbar-width:none] group-data-horizontal/tabs:h-[50px] data-[fade=both]:[mask-image:linear-gradient(to_right,transparent,black_3rem,black_calc(100%-3rem),transparent)] data-[fade=left]:[mask-image:linear-gradient(to_left,black_calc(100%-3rem),transparent)] data-[fade=right]:[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]"
      >
        {sections.map((s) => (
          <TabsTrigger key={s.id} value={s.id} className="h-11 flex-none px-3 group-data-horizontal/tabs:after:bottom-[-3px]">
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  )
}
