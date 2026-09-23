import { Minus, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A number input with − / + steppers (44 px touch targets). Commits on blur or Enter and
 * clamps to [min, max], so typing a partial number never pushes an invalid value.
 *
 * `aria-label` names the input and, after "Decrease" / "Increase", the steppers; it should match
 * the field's visible label (WCAG 2.5.3). `stepLabel` names the steppers instead when the label
 * reads badly after "Decrease" ("Execute phase starts at").
 */
export function NumberField({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  className,
  stepLabel,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
}: {
  id?: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  className?: string
  stepLabel?: string
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  // While typing, the draft is shown; otherwise the committed value. No effect needed.
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const stepName = stepLabel ?? ariaLabel

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step))
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    if (draft.trim() !== '' && !Number.isNaN(n) && clamp(n) !== value) onChange(clamp(n))
    setDraft(null)
  }
  // A stepper that reaches its limit disables itself, which would drop focus to the page, so
  // focus moves to the input first (docs/ux.md#accessibility).
  const stepTo = (next: number) => {
    const clamped = clamp(next)
    if (clamped <= min || clamped >= max) inputRef.current?.focus()
    onChange(clamped)
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={stepName ? `Decrease ${stepName}` : 'Decrease'}
        disabled={value <= min}
        onClick={() => stepTo(value - step)}
      >
        <Minus />
      </Button>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          inputMode="decimal"
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className={cn('h-11 w-24 text-center tabular-nums', unit && 'pr-9')}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={stepName ? `Increase ${stepName}` : 'Increase'}
        disabled={value >= max}
        onClick={() => stepTo(value + step)}
      >
        <Plus />
      </Button>
    </div>
  )
}
