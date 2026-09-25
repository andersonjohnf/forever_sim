import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

/**
 * A section's title, its intro and an action on the right (Reset rotation, the gear menu). On a
 * phone the intro takes the full width under the two, so a longer one (the cat's Rotation intro)
 * isn't squeezed into a narrow column beside the action; from 640 px it sits beside it. The markup
 * keeps reading order, title, intro, then action, and the grid places each one.
 */
export function SectionHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
      <h2 className="col-start-1 row-start-1 self-center text-lg font-semibold tracking-tight sm:self-start">{title}</h2>
      {description && <p className="col-span-2 col-start-1 row-start-2 text-sm text-muted-foreground sm:col-span-1">{description}</p>}
      {action && <div className="col-start-2 row-start-1 sm:row-end-3">{action}</div>}
    </div>
  )
}

/**
 * A labelled control with optional one-line help (docs/ux.md: every control explains itself), and
 * under it, `changed`: the "Default: …" line of a setting that differs from its default.
 */
export function Field({
  label,
  help,
  htmlFor,
  children,
  changed,
  className,
}: {
  label: ReactNode
  help?: ReactNode
  htmlFor?: string
  children: ReactNode
  changed?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {changed}
    </div>
  )
}

/**
 * In the wide layout, from a 53 rem setup pane, an `Advanced` card with `flow` lays its settings out
 * in balanced columns, 2 from 53 rem and 3 from 72 rem (the Buffs tab's widths, docs/ux.md "Buffs"),
 * read top to bottom and then on to the next column (D34, docs/ux.md "Fight" and "Character"). Each
 * setting is a `FLOW_ITEM`, which never splits between two columns; a wrapper that groups settings
 * below 1440 px is `FLOW_CONTENTS` in the columns, so its settings flow on their own. CSS columns
 * balance whatever the settings are, so the card is as short as its content allows, whichever spec
 * and settings it holds, rather than tuned to today's. Below 1440 px the pane isn't a container, so
 * none of this applies.
 */
export const FLOW_ITEM = '@min-[53rem]/setup:mb-5 @min-[53rem]/setup:break-inside-avoid'
export const FLOW_CONTENTS = '@min-[53rem]/setup:contents'
const FLOW = {
  2: '@min-[53rem]/setup:block @min-[53rem]/setup:columns-2 @min-[53rem]/setup:gap-8 @min-[72rem]/setup:columns-3',
  3: '@min-[53rem]/setup:block @min-[53rem]/setup:columns-3 @min-[53rem]/setup:gap-6 @min-[72rem]/setup:columns-4',
} as const

/**
 * The "Advanced" disclosure (docs/ux.md principle 2): depth one level down, never removed. Like the
 * Rotation tab's headings, it opens by itself when `changed` settings inside it differ from their
 * defaults, and counts them even while closed.
 *
 * `shown` is for a wide screen, where there's room (docs/ux.md principle 4, "Show it when there's
 * room"): the same card, headed "Advanced", open, with no disclosure to press. Each setting inside
 * still marks its own change, so no count is needed. `id` names the heading then, and the
 * disclosure's button otherwise.
 *
 * Both are the same elements, the disclosure held open and its button hidden while shown, so a
 * window crossing 1440 px (browser zoom, snapping a window) keeps focus on the setting that had it
 * (review finding DL2-3). Once shown, the disclosure stays open if the window narrows: what you
 * were looking at doesn't fold away under you.
 */
export function Advanced({
  children,
  label = 'Advanced',
  changed = 0,
  id,
  shown = false,
  flow,
}: {
  children: ReactNode
  label?: string
  changed?: number
  id?: string
  shown?: boolean
  /** Its settings flow into columns in the wide layout, each a `FLOW_ITEM`: this many from 53 rem, one more from 72. */
  flow?: 2 | 3
}) {
  const [open, setOpen] = useState(changed > 0)
  if (shown && !open) setOpen(true)
  const ownId = useId()
  const headingId = shown ? (id ?? ownId) : ownId
  return (
    <Collapsible
      className="rounded-lg border"
      open={shown || open}
      onOpenChange={setOpen}
      role={shown ? 'region' : undefined}
      aria-labelledby={shown ? headingId : undefined}
    >
      <h3 id={headingId} hidden={!shown} className="flex min-h-11 items-center px-4 text-sm font-medium">
        {label}
      </h3>
      <CollapsibleTrigger
        id={shown ? undefined : id}
        hidden={shown}
        aria-label={changed > 0 ? `${label}, ${changed} changed` : undefined}
        className="group flex min-h-11 w-full items-center gap-2 px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
        {label}
        {changed > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            {changed} changed
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className={cn('flex flex-col gap-5 border-t px-4 py-4', flow && FLOW[flow])}>{children}</CollapsibleContent>
    </Collapsible>
  )
}
