import { useEffect, useId, useRef } from 'react'
import { useScrollFade } from '@/app/scroll-fade'
import type { Section } from '@/app/setup-store'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

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
 * Enter or Space opens one.
 *
 * `summaries` gives a tab a second line under its label, shown from 1440 px (the wide layout,
 * D34), where the tabs grow to 56 px. The tab's accessible name stays its label, so
 * `getByRole('tab', { name: 'Gear', exact: true })` still finds it; the summary is its
 * description. With no summaries the tabs are 44 px at every width.
 */
export function SectionTabs({
  sections,
  active,
  summaries,
}: {
  sections: readonly SectionTab[]
  /** The open section: the tab the sideways scroller keeps in view. */
  active: Section
  summaries?: Partial<Record<Section, string>>
}) {
  const { ref: listRef, fade } = useScrollFade<HTMLDivElement>(active)
  const bar = useStickyTop()
  const idBase = useId()
  const hasSummaries = sections.some((s) => summaries?.[s.id])
  return (
    <div ref={bar} data-sticky-tabs className="sticky top-14 z-30 -mx-4 border-b bg-background/95 px-4 backdrop-blur lg:mx-0 lg:px-0">
      {/*
       * On narrow screens the tabs scroll sideways, and a fade marks each edge with more past it.
       * Tabs are 44 px tall (docs/ux.md principle 4), 56 px with a summary line at 1440 px and up,
       * their underline on the bar's edge.
       */}
      <TabsList
        ref={listRef}
        variant="line"
        data-fade={fade}
        className={cn(
          'w-full justify-start gap-1 overflow-x-auto [scrollbar-width:none] group-data-horizontal/tabs:h-[50px] data-[fade=both]:[mask-image:linear-gradient(to_right,transparent,black_3rem,black_calc(100%-3rem),transparent)] data-[fade=left]:[mask-image:linear-gradient(to_left,black_calc(100%-3rem),transparent)] data-[fade=right]:[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]',
          hasSummaries && 'wide:group-data-horizontal/tabs:h-[62px]',
        )}
      >
        {sections.map((s) => {
          const summary = summaries?.[s.id]
          const summaryId = `${idBase}-${s.id}-summary`
          return (
            <TabsTrigger
              key={s.id}
              value={s.id}
              aria-describedby={summary ? summaryId : undefined}
              className={cn(
                'h-11 flex-none px-3 group-data-horizontal/tabs:after:bottom-[-3px]',
                hasSummaries && 'wide:h-14 wide:flex-col wide:items-start wide:justify-center wide:gap-0.5',
              )}
            >
              {s.label}
              {/*
               * Hidden from the tab's name (it stays the label), but its description: aria-describedby
               * reads a node it points at even when that node is aria-hidden or not displayed.
               */}
              {summary && (
                <span id={summaryId} aria-hidden className="hidden text-xs leading-none font-normal text-muted-foreground wide:block">
                  {summary}
                </span>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </div>
  )
}
