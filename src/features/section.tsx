import type { ReactNode } from 'react'
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
 * The "Advanced" disclosure (docs/ux.md principle 2): depth one level down, never removed. Like the
 * Rotation tab's headings, it opens by itself when `changed` settings inside it differ from their
 * defaults, and counts them even while closed.
 */
export function Advanced({ children, label = 'Advanced', changed = 0, id }: { children: ReactNode; label?: string; changed?: number; id?: string }) {
  return (
    <Collapsible className="rounded-lg border" defaultOpen={changed > 0}>
      <CollapsibleTrigger
        id={id}
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
      <CollapsibleContent className="flex flex-col gap-5 border-t px-4 py-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}
