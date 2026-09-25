import { Badge } from '@/components/ui/badge'
import { NoteEntry, NoteItems, NotesList } from './notes-sheet'
import { formatReleaseTime } from './release'
import type { Release } from './releases'

/**
 * Releases as What's New and Release history show them (docs/ux.md "What's new"): each one's time
 * in the viewer's own zone as its heading, then its groups, each a label over its changes.
 * `markLatest` labels the first "Latest" (Release history, which lists them all).
 */
export function ReleaseNotes({ releases, markLatest = false }: { releases: readonly Release[]; markLatest?: boolean }) {
  return (
    <NotesList>
      {releases.map((release, i) => (
        <ReleaseEntry key={release.id} release={release} divided={i > 0} latest={markLatest && i === 0} />
      ))}
    </NotesList>
  )
}

function ReleaseEntry({ release, divided, latest }: { release: Release; divided: boolean; latest: boolean }) {
  const time = new Date(release.time)
  return (
    <NoteEntry
      divided={divided}
      headingClassName="tabular-nums"
      heading={<time dateTime={time.toISOString()}>{formatReleaseTime(time)}</time>}
      label={latest && <Badge variant="secondary">Latest</Badge>}
    >
      {release.groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h4>
          <NoteItems items={group.items} />
        </section>
      ))}
    </NoteEntry>
  )
}
