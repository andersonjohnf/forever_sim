import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Marks a setting that differs from its default (docs/ux.md "Rotation", "Fight", "Character",
 * checklist 3): a dot, its default ("Default: 3:00") and a Reset for that setting alone. Give the
 * control `aria-describedby={id}` so a screen reader hears "Changed. Default: …" with it.
 *
 * The Reset button goes away once the setting is back to its default, so `onReset` should move
 * focus to the setting's control (see `changeAndFocus` in ./refocus).
 */
export function ChangedHint({
  id,
  label,
  value,
  onReset,
  className,
}: {
  /** The id of the "Changed. Default: …" text, for the control's aria-describedby. */
  id: string
  /** The setting's name, for the button: "Reset Fight length to 3:00". */
  label: string
  /** The default as the setting shows it. */
  value: string
  onReset: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground', className)}>
      <span id={id} className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
        <span>
          <span className="sr-only">Changed. </span>Default: {value}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Reset ${label} to ${value}`}
        onClick={onReset}
        // A small link with a 44 px hit area around it.
        className="relative inline-flex items-center gap-1 rounded-sm font-medium text-foreground outline-none after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <RotateCcw aria-hidden className="size-3" />
        Reset
      </button>
    </div>
  )
}
