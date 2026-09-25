import { CircleAlert } from 'lucide-react'
import type { Talent, TalentData, TalentRanksById } from '@/data/talents/types'
import { cn } from '@/lib/utils'
import { lockReason, removeReason } from './logic'

/**
 * A talent's name, rank and texts, and why a point can't be added or removed. `inverted` is for the
 * tooltip's inverted colours, where the notice colour would fall below AA, so a reason there is
 * marked by weight and icon instead. `named` false leaves out the name and rank line, for the wide
 * tab's detail panel, which has its own heading.
 */
export function TalentDetails({
  data,
  talent,
  ranks,
  removeId,
  inverted = false,
  named = true,
}: {
  data: TalentData
  talent: Talent
  ranks: TalentRanksById
  /** The id of the remove reason, which describes the popover's "−". */
  removeId?: string
  inverted?: boolean
  named?: boolean
}) {
  const rank = ranks[talent.id] ?? 0
  const current = rank > 0 ? talent.ranks.forever[rank - 1] : null
  const next = rank < talent.maxRank ? talent.ranks.forever[rank] : null
  const reasons = [
    { id: undefined, text: lockReason(data, ranks, talent) },
    { id: removeId, text: removeReason(data, ranks, talent) },
  ].filter((r) => r.text)
  return (
    <div className="flex flex-col gap-2 text-sm">
      {named && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{talent.name}</span>
          <span className="tabular-nums opacity-80">
            Rank {rank}/{talent.maxRank}
          </span>
        </div>
      )}
      {/* Rank texts keep the client's paragraph breaks as "\n" (docs/data/talents.md). */}
      {current && <p className="whitespace-pre-line">{current}</p>}
      {next && (
        <p className={cn('whitespace-pre-line', current && 'opacity-80')}>
          {current ? 'Next rank: ' : ''}
          {next}
        </p>
      )}
      {reasons.map((r) => (
        <p key={r.text} id={r.id} className={cn('flex items-start gap-1.5 font-medium', !inverted && 'text-notice')}>
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {r.text}
        </p>
      ))}
    </div>
  )
}
