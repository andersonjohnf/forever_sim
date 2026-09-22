import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A number input with − / + steppers (44 px touch targets). Commits on blur or Enter and
 * clamps to [min, max], so typing a partial number never pushes an invalid value.
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
  'aria-label': ariaLabel,
}: {
  id?: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  className?: string
  'aria-label'?: string
}) {
  // While typing, the draft is shown; otherwise the committed value. No effect needed.
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step))
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    if (draft.trim() !== '' && !Number.isNaN(n) && clamp(n) !== value) onChange(clamp(n))
    setDraft(null)
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <Minus />
      </Button>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          aria-label={ariaLabel}
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
        aria-label="Increase"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <Plus />
      </Button>
    </div>
  )
}
