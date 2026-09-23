// A paladin's mana over a fight, as the results show it (docs/ux.md#results "Mana per fight").
import { formatInt } from '@/lib/format'
import type { ManaResult } from '@/sim'

export interface ManaRow {
  label: string
  /** Signed as a ledger reads: "+3,120" gained, "−9,650" spent. */
  value: string
}

/**
 * The ledger of an average fight: the pool at the pull, what regeneration and spells or
 * consumables added, what the rotation spent, and what's left at the end. "Restored" is left out
 * when nothing restores mana (no Sanctified Judgement, potion or rune), and what's left never
 * reads below 0.
 */
export function manaRows(mana: ManaResult): ManaRow[] {
  const left = Math.max(0, mana.max + mana.regeneratedPerFight + mana.restoredPerFight - mana.spentPerFight)
  return [
    { label: 'At the pull', value: formatInt(mana.max) },
    { label: 'Regenerated', value: `+${formatInt(mana.regeneratedPerFight)}` },
    ...(Math.round(mana.restoredPerFight) > 0 ? [{ label: 'Restored', value: `+${formatInt(mana.restoredPerFight)}` }] : []),
    { label: 'Spent', value: `−${formatInt(mana.spentPerFight)}` },
    { label: 'Left at the end', value: formatInt(left) },
  ]
}

/** What the gains count, naming only the ones this result has. */
export function manaNote(mana: ManaResult): string {
  const regen = 'Regenerated counts Spirit and mana per 5 s'
  return Math.round(mana.restoredPerFight) > 0 ? `${regen}; restored, Sanctified Judgement’s returns and mana potions and runes.` : `${regen}.`
}
