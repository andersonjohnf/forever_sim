import { useId, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { sectionSummaries } from '@/app/section-summary'
import type { SectionTab } from '@/app/section-tabs'
import { useSetup, type Section } from '@/app/setup-store'

/**
 * "Your setup" in the wide layout's right panel (from 1440 px, D34; docs/ux.md#results): one line a
 * section, its name and what it holds (src/app/section-summary.ts), so the whole setup reads at a
 * glance. Each line is a button that opens its section's tab and moves focus there (`onOpen`, the
 * shell's own tab opening). `action` is Simulate, on the heading's right as a section's action sits
 * (docs/ux.md "Setup sections"), and `note` the line under the list that says what a run would do.
 */
export function SetupSummary({
  sections,
  onOpen,
  action,
  note,
}: {
  sections: readonly SectionTab[]
  onOpen: (section: Section) => void
  action: ReactNode
  note: ReactNode
}) {
  // Kept while no line changes.
  const summaries = useSetup(useShallow((s) => sectionSummaries(s.config)))
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm font-medium">
          Your setup
        </h3>
        {action}
      </div>
      {/* Two columns in a 30 rem panel (1440 px), three once the panel has room for the longest line (about 1,830 px). */}
      <ul className="-mx-2 grid grid-cols-2 gap-x-2 @min-[38rem]/results:grid-cols-3">
        {sections.map(({ id, label }) => (
          <li key={id} className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(id)}
              className="flex min-h-11 w-full flex-col items-start justify-center rounded-md px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-xs text-muted-foreground">{label}</span>
              {/* Its name reads "Talents 17/34/0": the space isn't drawn between flex items. */}{' '}
              <span className="text-sm">{summaries[id]}</span>
            </button>
          </li>
        ))}
      </ul>
      {note}
    </section>
  )
}
