import { ArrowDown, ArrowUp } from 'lucide-react'
import { formatOne } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DIM_TEXT } from './dim'

/**
 * The change from the previous result: arrow, sign and color (docs/ux.md#results). The color says
 * whether it's better: up for TPS and DPS, down for damage taken (`lowerIsBetter`). Color alone
 * can't say that to a screen reader, which hears the change in words instead: "up 239.0 from the
 * last run, worse".
 */
export function Delta({
  value,
  previous,
  lowerIsBetter = false,
  className,
  amountClassName,
}: {
  value: number
  previous: number | null
  lowerIsBetter?: boolean
  className?: string
  /** Hides the amount where it doesn't fit (the phone bar), leaving the arrow and the spoken text. */
  amountClassName?: string
}) {
  if (previous === null) return null
  const delta = value - previous
  if (Math.abs(delta) < 0.05) return null
  const up = delta > 0
  const better = lowerIsBetter ? !up : up
  const amount = formatOne(Math.abs(delta))
  return (
    <span className={cn('flex items-center font-medium tabular-nums', better ? 'text-positive' : 'text-negative', DIM_TEXT, className)}>
      {up ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
      <span aria-hidden className={amountClassName}>{`${up ? '+' : '−'}${amount}`}</span>
      <span className="sr-only">{`${up ? 'up' : 'down'} ${amount} from the last run, ${better ? 'better' : 'worse'}`}</span>
    </span>
  )
}
