import { DecadesCrest } from '@/components/decades-crest'
import { cn } from '@/lib/utils'
import { DECADES_URL } from './brand'

/**
 * "An app by Decades" in the page's footer, beside and paired with the wago.tools credit
 * (docs/ux.md#brand): the same small muted lead-in, then a 44 px link holding a 24 px mark, as tall
 * as wago.tools' logo. The guild's full logo stacks its wordmark under the crest and can't be read
 * at that height, so the mark is the crest with "Decades" beside it in the guild's lettering, as the
 * header's lockup has it. The link opens the guild's site in a new tab and says so.
 */
export function DecadesCredit({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-x-3 text-xs text-muted-foreground', className)}>
      <span>An app by</span>
      <a
        href={DECADES_URL}
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm px-1 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <DecadesCrest className="size-6" />
        {/*
         * The tracking's trailing space is taken back, so the mark ends at its last letter, and the
         * lettering's capitals, which sit high in their line, drop a pixel to centre on the crest.
         */}
        {/* The lettering is uppercased for looks only; screen readers get the plain name below. */}
        <span aria-hidden className="-mr-[0.24em] translate-y-px font-brand text-sm leading-none font-semibold tracking-[0.24em] uppercase">
          Decades
        </span>
        <span className="sr-only">Decades (opens in a new tab)</span>
      </a>
    </div>
  )
}
