import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { type MenuSheetProps, NoteEntry, NoteItems, NotesList, NotesSheet } from './notes-sheet'
import { ROADMAP } from './roadmap'

/**
 * Coming soon (docs/ux.md "Coming soon"): what's planned, in the order it's coming, from
 * src/app/roadmap.ts. Release history's pair: the same sheet, each entry headed by its name with
 * when it's coming beside it, then its plans as a bulleted list.
 */
export function ComingSoonSheet(props: MenuSheetProps) {
  return (
    <NotesSheet {...props} title="Coming soon" description="What’s planned, in the order it’s coming. Plans can change.">
      <NotesList>
        {ROADMAP.map((entry, i) => {
          const next = entry.when === 'Next update'
          return (
            <NoteEntry
              key={entry.id}
              divided={i > 0}
              heading={
                <>
                  {entry.title}
                  {/* The next update's label stands out, as Release history's Latest does; the later
                      ones are muted. The comma is for screen readers: "The Optimizer, Planned". */}
                  <Badge variant={next ? 'secondary' : 'outline'} className={cn(!next && 'text-muted-foreground')}>
                    <span className="sr-only">, </span>
                    {entry.when}
                  </Badge>
                </>
              }
            >
              <NoteItems items={entry.items} />
            </NoteEntry>
          )
        })}
      </NotesList>
    </NotesSheet>
  )
}
