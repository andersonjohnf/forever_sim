import { ArrowDown, ArrowUp } from 'lucide-react'
import { formatOne } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DIM_TEXT } from './dim'

/**
 * The change from the previous result: arrow, sign and color (docs/ux.md#results). The color says
 * whether it's better: up for TPS and DPS, down for damage taken (`lowerIsBetter`).
 */
export function Delta({
  value,
  previous,
  lowerIsBetter = false,
  className,
}: {
  value: number
  previous: number | null
  lowerIsBetter?: boolean
  className?: string
}) {
  if (previous === null) return null
  const delta = value - previous
  if (Math.abs(delta) < 0.05) return null
  const better = lowerIsBetter ? delta < 0 : delta > 0
  return (
    <span className={cn('flex items-center font-medium tabular-nums', better ? 'text-positive' : 'text-negative', DIM_TEXT, className)}>
      {delta > 0 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
      {delta > 0 ? '+' : '−'}
      {formatOne(Math.abs(delta))}
    </span>
  )
}
