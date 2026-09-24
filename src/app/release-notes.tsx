import { useId } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatReleaseTime } from './release'
import type { Release } from './releases'

/**
 * Releases as What's New and Release history show them (docs/ux.md "What's new"): each one's time
 * in the viewer's own zone as its heading, then its groups, each a label over its changes.
 * `markLatest` labels the first "Latest" (Release history, which lists them all).
 */
export function ReleaseNotes({ releases, markLatest = false }: { releases: readonly Release[]; markLatest?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {releases.map((release, i) => (
        <ReleaseEntry key={release.id} release={release} divided={i > 0} latest={markLatest && i === 0} />
      ))}
    </div>
  )
}

function ReleaseEntry({ release, divided, latest }: { release: Release; divided: boolean; latest: boolean }) {
  const headingId = useId()
  const time = new Date(release.time)
  return (
    <article aria-labelledby={headingId} className={divided ? 'flex flex-col gap-3 border-t pt-6' : 'flex flex-col gap-3'}>
      <h3 id={headingId} className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium tabular-nums">
        <time dateTime={time.toISOString()}>{formatReleaseTime(time)}</time>
        {/* The comma is for screen readers: "…, 2026, Latest". */}
        {latest && (
          <Badge variant="secondary">
            <span className="sr-only">, </span>Latest
          </Badge>
        )}
      </h3>
      {release.groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h4>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground">
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  )
}
