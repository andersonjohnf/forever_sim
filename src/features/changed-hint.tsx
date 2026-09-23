import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A small text link's 44 px hit area (docs/ux.md principle 4) on a 16 px line: 10 px above it and
 * 18 px below, lopsided so it stays clear of the control above. Whatever holds one leaves at least
 * 10 px of space above the line (ChangedHint brings 4 px of its own) and 18 px below.
 */
export const LINK_HIT_AREA = 'relative after:absolute after:-inset-x-2 after:-top-2.5 after:-bottom-4.5'

/**
 * Marks a setting that differs from its default (docs/ux.md "Rotation", "Fight", "Character",
 * checklist 3): a dot, its default ("Default: 3:00") and a Reset for that setting alone. Give the
 * control `aria-describedby={id}` so a screen reader hears "Changed. Default: …" with it.
 *
 * The Reset button goes away once the setting is back to its default, so `onReset` should move
 * focus to the setting's control (see `changeAndFocus` in ./refocus).
 *
 * Its Reset's hit area reaches 10 px above the line and 18 px below (LINK_HIT_AREA). With its own
 * 4 px top margin it fits under a control 8 px above it (a gap-2 column), with 18 px free below.
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
    <div className={cn('mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground', className)}>
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
        className={cn(
          'inline-flex items-center gap-1 rounded-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50',
          LINK_HIT_AREA,
        )}
      >
        <RotateCcw aria-hidden className="size-3" />
        Reset
      </button>
    </div>
  )
}
