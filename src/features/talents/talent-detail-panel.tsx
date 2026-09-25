// The wide Talents tab's detail panel (decision D34, docs/ux.md "Talents"): beside the trees on a
// setup pane of 90 rem or more, the talent under the pointer, or else the focused one, or else the
// last one either showed: its name, rank, texts, what it needs and why a point can't move, so a
// mouse user reads it without chasing tooltips. The tooltips and popovers stay; this adds nothing a
// click or key does.
import { Check, Circle } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { WowIcon } from '@/components/wow-icon'
import type { TalentData, TalentRanksById } from '@/data/talents/types'
import { cn } from '@/lib/utils'
import { talentNeeds } from './needs'
import { TalentDetails } from './talent-details'
import type { TalentTracker } from './tracker'

/**
 * The panel. Hidden below a 90 rem setup pane (a container only from 1440 px), so the trees keep
 * the width; sticky beside them, as the Rotation tab's settings panel is.
 */
export function TalentDetailPanel({ data, ranks, tracker }: { data: TalentData; ranks: TalentRanksById; tracker: TalentTracker }) {
  const id = useSyncExternalStore(tracker.subscribe, tracker.shown)
  const talent = id === null ? undefined : data.trees.flatMap((t) => t.talents).find((t) => t.id === id)
  const tree = talent && data.trees.find((t) => t.id === talent.tree)
  const rank = talent ? (ranks[talent.id] ?? 0) : 0
  const needs = talent ? talentNeeds(data, ranks, talent) : []
  return (
    <aside
      aria-label="Talent details"
      data-talent-detail={talent?.id}
      className="sticky top-[calc(var(--sticky-top,7rem)+1rem)] hidden max-h-[calc(100svh-var(--sticky-top,7rem)-2rem)] flex-col gap-4 overflow-y-auto rounded-xl border p-4 @min-[90rem]/setup:flex"
    >
      {talent && tree ? (
        <>
          <div className="flex items-center gap-3">
            <WowIcon icon={talent.icon} size="md" />
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="text-sm font-semibold">{talent.name}</h3>
              <p className="text-xs text-muted-foreground">
                {tree.name}, tier {talent.tier + 1}
              </p>
            </div>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              Rank {rank}/{talent.maxRank}
            </span>
          </div>
          <TalentDetails data={data} talent={talent} ranks={ranks} named={false} />
          <section aria-label="Needs" className="flex flex-col gap-2 border-t pt-3">
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Needs</h4>
            {needs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing: it’s in the first tier.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {needs.map((need) => (
                  <li key={need.text} className={cn('flex items-start gap-2', !need.met && 'text-muted-foreground')}>
                    {need.met ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0" />}
                    <span className="flex-1">
                      {need.text}
                      <span className="sr-only">{need.met ? ', met' : ', not met'}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {need.have} of {need.needed}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Point at a talent, or focus it, to see what it does and what it needs here.</p>
      )}
    </aside>
  )
}
