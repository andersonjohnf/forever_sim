import { ChevronRight, ListOrdered, type LucideIcon, Network, Shield, Sparkles, Swords, UserRound } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { sectionSummaries } from '@/app/section-summary'
import type { SectionTab } from '@/app/section-tabs'
import { useSetup, type Section } from '@/app/setup-store'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'

/** Each section's icon, beside its name in Your setup (docs/ux.md#results). */
const SECTION_ICON: Record<Section, LucideIcon> = {
  character: UserRound,
  talents: Network,
  gear: Shield,
  buffs: Sparkles,
  rotation: ListOrdered,
  fight: Swords,
}

/**
 * "Your setup" in the wide layout's right panel (from 1440 px, D34; docs/ux.md#results), a card
 * under the character sheet: one line a section, its icon and name over what it holds
 * (src/app/section-summary.ts), so the whole setup reads at a glance. Each line is a button that
 * opens its section's tab and moves focus there (`onOpen`, the shell's own tab opening), and looks
 * it: its name ends on a faint chevron, and on hover or focus the chevron darkens, the name takes the
 * value's colour and the value an underline. The card ends on its action row (`data-setup-actions`,
 * which the panel keeps in view as a run starts and ends): `note` on the left, where things stand
 * (what a run would do, its progress, the result's headline, or that it failed), and `action`,
 * Simulate, on the right, sized to its label. Simulate sits at the row's top, so it stays in the
 * same place in every state however tall the note grows.
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
    <section aria-labelledby={headingId}>
      <Card size="sm" className="gap-2">
        <CardHeader>
          {/* A section heading's size, as the sheet's above it, with no icon (D34, after the user's look at the fixes). */}
          <h3 id={headingId} className="text-base font-semibold tracking-tight">
            Your setup
          </h3>
        </CardHeader>
        <CardContent>
          {/* Two columns in a 30 rem panel (1440 px), three once the panel has room for the longest line (about 1,830 px). */}
          <ul className="-mx-2 grid grid-cols-2 gap-x-2 @min-[38rem]/results:grid-cols-3">
            {sections.map(({ id, label }) => {
              const Icon = SECTION_ICON[id]
              return (
                <li key={id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpen(id)}
                    className="group flex min-h-11 w-full flex-col items-start justify-center rounded-md px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {/* On the hover fill the name turns the value's colour, keeping it over 4.5:1 (review finding DU2-5). */}
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground">
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      {label}
                      {/* Faint at rest, so the line reads as something to press before it's hovered (DU2-3). */}
                      <ChevronRight
                        className="size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                        aria-hidden
                      />
                    </span>
                    {/* Its name reads "Talents 17/34/0": the space isn't drawn between flex items. */}{' '}
                    <span className="max-w-full truncate text-sm decoration-muted-foreground/60 underline-offset-4 group-hover:underline group-focus-visible:underline">{summaries[id]}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </CardContent>
        <CardFooter data-setup-actions className="items-start justify-between gap-3 py-2">
          {/* At least the button's height, so a one-line note centres on it, and a taller one (a tank's two values) grows down. */}
          <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">{note}</div>
          <div className="shrink-0">{action}</div>
        </CardFooter>
      </Card>
    </section>
  )
}
