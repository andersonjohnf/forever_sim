import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export function SectionHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
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
export function Advanced({ children, label = 'Advanced', changed = 0 }: { children: ReactNode; label?: string; changed?: number }) {
  return (
    <Collapsible className="rounded-lg border" defaultOpen={changed > 0}>
      <CollapsibleTrigger
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
