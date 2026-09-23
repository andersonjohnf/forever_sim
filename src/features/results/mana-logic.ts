// A paladin's mana over a fight, as the results show it (docs/ux.md#results "Mana per fight").
import { formatInt } from '@/lib/format'
import type { ManaResult } from '@/sim'

export interface ManaRow {
  label: string
  /** Signed as a ledger reads: "+3,120" gained, "−9,650" spent. */
  value: string
  /** The sum under a rule: what's left at the end. */
  total?: true
}

/**
 * The ledger of an average fight: the pool at the pull, what regeneration added, what restored mana
 * (Sanctified Judgement, the mana potion, the rune: each only when it restored some), what the
 * rotation spent, and, under a rule, what's left at the end, never below 0.
 */
export function manaRows(mana: ManaResult): ManaRow[] {
  const left = Math.max(0, mana.max + mana.regeneratedPerFight + mana.restoredPerFight - mana.spentPerFight)
  return [
    { label: 'At the pull', value: formatInt(mana.max) },
    { label: 'Regenerated', value: `+${formatInt(mana.regeneratedPerFight)}` },
    ...mana.restored.filter((r) => Math.round(r.perFight) > 0).map((r) => ({ label: r.name, value: `+${formatInt(r.perFight)}` })),
    { label: 'Spent', value: `−${formatInt(mana.spentPerFight)}` },
    { label: 'Left at the end', value: formatInt(left), total: true },
  ]
}

/** What "Regenerated" counts: the other gains name themselves. */
export const MANA_NOTE = 'Regenerated counts Spirit and mana per 5 s.'
