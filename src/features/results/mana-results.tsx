// A paladin's mana over a fight (docs/ux.md#results "Mana per fight"): what Consecration, Exorcism
// and the potion lines are weighed against.
import { useId } from 'react'
import type { ManaResult } from '@/sim'
import { manaNote, manaRows } from './mana-logic'

/** The ledger of an average fight, one row per line, under a heading that names the list. */
export function ManaPerFight({ mana }: { mana: ManaResult }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-medium">
        Mana per fight
      </h3>
      <dl className="flex flex-col gap-1.5 text-sm">
        {manaRows(mana).map((row) => (
          <div key={row.label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{manaNote(mana)}</p>
    </section>
  )
}
