import { ExternalLink } from 'lucide-react'
import { useId } from 'react'
import { docTitle, docUrl } from '@/lib/docs'
import { SPEC_META, type Assumption, type SimResult } from '@/sim'
import { groupAssumptions, groupTitle } from './assumption-groups'

/**
 * The [?] assumptions behind a result (docs/ux.md#results), grouped so what you can change comes
 * first (assumption-groups.ts). Each row links to the doc section that owns it, on GitHub, in a
 * new tab so the result stays open.
 */
export function AssumptionList({ result }: { result: SimResult }) {
  const classId = SPEC_META[result.spec].classId
  // From 1920 px the list spans both of the pane's columns, so its lines keep a readable measure:
  // 32 rem holds about 75 characters of its 14 px rows (review finding DA-8). A `ch` cap measures
  // the wide "0", and let lines run past 100. Narrower, the pane is already narrower than that.
  return (
    <div className="flex flex-col gap-4 @min-[39.5rem]/results:max-w-[32rem]">
      <p className="text-xs text-muted-foreground">
        What this result takes on trust until someone tests it in game, starting with what you can change. Each links to its doc.
      </p>
      {groupAssumptions(result.assumptions).map(({ group, items }) => (
        <Group key={group} title={groupTitle(group, classId)} items={items} />
      ))}
    </div>
  )
}

function Group({ title, items }: { title: string; items: Assumption[] }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h4 id={headingId} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      <ul className="flex flex-col">
        {items.map((a) => (
          <li key={a.id}>
            <a
              href={docUrl(a.docRef)}
              target="_blank"
              rel="noreferrer"
              className="group/doc -mx-2 flex min-h-11 flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-sm">{a.text}</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 group-hover/doc:text-foreground">
                {docTitle(a.docRef)}
                <ExternalLink className="size-3" aria-hidden />
                <span className="sr-only">(doc, opens in a new tab)</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
