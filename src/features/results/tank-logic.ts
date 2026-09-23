// Pure helpers for a tank's results (docs/ux.md#results): the boss's swings against you, and
// whether it can land crushing blows. No React, no stores, so unit tests can import them.
import { formatInt, formatPct } from '@/lib/format'
import type { BossOutcomes, FightConfig } from '@/sim'

/**
 * The boss's outcomes in the order its one roll takes them (docs/mechanics/combat-tables.md#8-boss--player-tanks):
 * the four that spare you most of the swing, then the three that land in full.
 */
export const BOSS_OUTCOMES: readonly (readonly [key: keyof BossOutcomes, label: string])[] = [
  ['miss', 'Miss'],
  ['dodge', 'Dodge'],
  ['parry', 'Parry'],
  ['block', 'Block'],
  ['crit', 'Crit'],
  ['crush', 'Crushing'],
  ['hit', 'Hit'],
]

/** A share this small is float noise from the table's truncation, not a real slice. */
const NOISE = 1e-9

/**
 * Whether the boss can land crushing blows on you, from its table as the fight starts
 * (combat-tables §8: crushing blows fall off the table once miss, dodge, parry, block and crit
 * fill it).
 * - `off`: crushing blows are switched off in Fight → Advanced.
 * - `cannot`: the boss can't crush at all (it's under level 63), though it lands plain hits.
 * - `uncrushable`: nothing is left on its table for them.
 * - `crushable`: they land; `short` more avoidance or block (percentage points, to the tenth the
 *   table shows, and at least 0.1 so it never reads 0.0) would push them off. Crushing blows sit
 *   before hits, so that's the crushing slice and the hit slice together.
 */
export type CrushingState =
  | { kind: 'off' }
  | { kind: 'cannot'; bossLevel: number | null }
  | { kind: 'uncrushable' }
  | { kind: 'crushable'; short: number }

export function crushingState(table: BossOutcomes, fight: Pick<FightConfig, 'bossLevel' | 'boss'> | null): CrushingState {
  if (fight && !fight.boss.canCrush) return { kind: 'off' }
  if (table.crush > NOISE) return { kind: 'crushable', short: Math.max(0.1, Math.round((table.crush + table.hit) * 10) / 10) }
  // No crushing slice, yet room for plain hits: this boss never crushes.
  if (table.hit > NOISE) return { kind: 'cannot', bossLevel: fight?.bossLevel ?? null }
  return { kind: 'uncrushable' }
}

/** What `crushingState` says, as the line under the boss's table. */
export function crushingText(state: CrushingState): string {
  switch (state.kind) {
    case 'off':
      return 'Crushing blows are off for this fight (Fight → Advanced).'
    case 'cannot':
      return state.bossLevel === null ? 'This boss can’t land crushing blows.' : `A level ${state.bossLevel} boss can’t land crushing blows.`
    case 'uncrushable':
      return 'You’re uncrushable: there’s no room left on its table for crushing blows.'
    case 'crushable':
      return `${formatPct(state.short)} more avoidance or block would make you uncrushable.`
  }
}

/**
 * How much your defense lowers an attacker's crit chance (character-stats#defense-skill): "5.6%"
 * at 440 defense. Below 300 it raises it instead, shown with a minus sign: "−0.4%". A value that
 * rounds to 0.0 has no sign.
 */
export function formatCritReduction(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  return rounded < 0 ? `−${formatPct(-rounded)}` : formatPct(Math.abs(rounded))
}

/** The boss's swing size for the damage-taken line: "4,500 to 5,500", or "5,000" when fixed. */
export function swingDamageText(boss: Pick<FightConfig['boss'], 'damageMin' | 'damageMax'>): string {
  return boss.damageMin === boss.damageMax ? formatInt(boss.damageMin) : `${formatInt(boss.damageMin)} to ${formatInt(boss.damageMax)}`
}
