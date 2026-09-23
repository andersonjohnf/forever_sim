import { Minus, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseNumber, snapToStep } from '@/lib/parse-number'
import { cn } from '@/lib/utils'

/**
 * A number input with − / + steppers (44 px touch targets). Commits on blur or Enter and
 * clamps to [min, max], so typing a partial number never pushes an invalid value.
 *
 * `grouping` shows thousands separators ("10,000") while the field isn't being edited, as the rest
 * of the app writes counts; while it has focus it shows the plain number ("10000"). What's
 * typed is read in the typist's locale style either way (`parseNumber`): "5.000" and "5 000" are
 * 5000, and "1,5" is 1.5, snapped to the step. Leave it off for an identifier such as a seed.
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
  grouping = false,
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
  grouping?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  // While typing, the draft is shown. Otherwise the value: plain while the field has focus
  // (editing), grouped if asked when it hasn't. So an edit never has to tell the field's own
  // separators from the typist's (docs/ux.md, Sections, "Fight"). No effect needed.
  const [draft, setDraft] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const decreaseRef = useRef<HTMLButtonElement>(null)
  const increaseRef = useRef<HTMLButtonElement>(null)
  const stepName = stepLabel ?? ariaLabel

  const clamp = (n: number) => Math.min(max, Math.max(min, snapToStep(n, step)))
  // On focus the field swaps "3,000" for "3000". The selection or caret comes along, placed by
  // the digits before it, so Tab (which selects the whole field) then typing still replaces it.
  const startEditing = () => {
    const input = inputRef.current
    if (!input || input.value === String(value)) return setEditing(true)
    const shown = input.value
    const at = (i: number | null) => (i === null ? null : shown.slice(0, i).replace(/,/g, '').length)
    const [start, end] = [at(input.selectionStart), at(input.selectionEnd)]
    flushSync(() => setEditing(true))
    if (start !== null && end !== null) input.setSelectionRange(start, end)
  }
  /** Commits the draft, if it reads as a number, and drops it. */
  const commit = () => {
    const n = draft === null ? null : parseNumber(draft, { step, max })
    if (n !== null && clamp(n) !== value) onChange(clamp(n))
    setDraft(null)
  }
  // A stepper that reaches its limit disables itself, which would drop focus to the page, so
  // focus moves to the other stepper, now enabled: the way back, and never the text field, which
  // on a phone would open the on-screen keyboard (docs/ux.md#accessibility). Only when the
  // stepper held focus: a tap on a phone may not focus it.
  const stepTo = (next: number, stepper: HTMLButtonElement | null, other: HTMLButtonElement | null) => {
    const clamped = clamp(next)
    const atLimit = clamped <= min || clamped >= max
    if (!atLimit || stepper === null || document.activeElement !== stepper) {
      onChange(clamped)
      return
    }
    flushSync(() => onChange(clamped))
    if (other && !other.disabled) other.focus()
    else inputRef.current?.focus()
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={stepName ? `Decrease ${stepName}` : 'Decrease'}
        ref={decreaseRef}
        disabled={value <= min}
        onClick={() => stepTo(value - step, decreaseRef.current, increaseRef.current)}
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
          value={draft ?? (grouping && !editing ? value.toLocaleString('en-US') : String(value))}
          onFocus={startEditing}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            commit()
            setEditing(false)
          }}
          // Enter commits and keeps editing, the plain number showing.
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
        ref={increaseRef}
        disabled={value >= max}
        onClick={() => stepTo(value + step, increaseRef.current, decreaseRef.current)}
      >
        <Plus />
      </Button>
    </div>
  )
}
