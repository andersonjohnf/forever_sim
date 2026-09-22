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

/** A labelled control with optional one-line help (docs/ux.md: every control explains itself). */
export function Field({
  label,
  help,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode
  help?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}

/** The "Advanced" disclosure (docs/ux.md principle 2): depth one level down, never removed. */
export function Advanced({ children, label = 'Advanced' }: { children: ReactNode; label?: string }) {
  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="group flex min-h-11 w-full items-center gap-2 px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-5 border-t px-4 py-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}
