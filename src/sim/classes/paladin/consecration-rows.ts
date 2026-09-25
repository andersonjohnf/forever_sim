// The two Consecration rows both paladin specs list, rank 5 and rank 1 (docs/classes/paladin.md
// "Forever priority list (default)": Retribution's rows 7 and 8, Protection's 7 and 7b), which share
// one cooldown: when the lower row is never cast, and what the Rotation tab says under it then.
import { BASE_PLACEHOLDERS, CLASS_BASE } from '../../stats/base-stats'
import { manaFromIntellect } from '../../stats/stat-block'
import type { AplDefinition } from '../../types'
import { normalizeAplOrder } from '../apl'
import type { Reader } from '../warrior/shared'
import { CONSECRATION, PALADIN_BASE_MANA } from './abilities'

/** A Consecration row: its list id, its label, its switch and its mana threshold (% of maximum mana). */
export interface ConsecrationRow {
  row: string
  label: string
  on: string
  mana: string
}

/**
 * The lowest maximum mana a level-60 paladin is simulated with: base mana (paladin.md#mana-model) and
 * the lowest paladin race's base Intellect, with nothing worn and no buffs
 * (docs/mechanics/character-stats.md#paladin-and-druid-base-attributes; a race with no row can't be
 * simulated). 2,252 with the Undead row's 68 Intellect.
 */
export const PALADIN_LEAST_MAX_MANA =
  PALADIN_BASE_MANA +
  Math.min(...Object.keys(BASE_PLACEHOLDERS.paladin.attributes ?? {}).map((race) => manaFromIntellect((CLASS_BASE.paladin.attributes(race) ?? BASE_PLACEHOLDERS.paladin.attributes![race]).int)))

/** Rank 5's cost at its most, 565 mana: no talent cutting it (Benediction, Holy Conduit; talents.ts), in tenths. */
export const CONSECRATION_MOST_COST_TENTHS = CONSECRATION.costTenths

/**
 * Where a Consecration row can first be cast, in tenths of mana: its threshold's share of the
 * maximum, as the rotation's `minMana` line rounds it (none at 0%), or its cost, whichever is more.
 */
export const consecrationFloorTenths = (pct: number, maxMana: number, costTenths: number): number =>
  Math.max(pct > 0 ? Math.round((pct / 100) * 10 * maxMana) : 0, costTenths)

/**
 * Whether the lower of the two rows is never cast (paladin.md "the two Consecration rows"): the
 * higher row takes their shared cooldown whenever the mana it needs is there, both being instant
 * with the same cooldown, so the lower is cast only with mana at or above its own floor and below
 * the higher's (`consecrationFloorTenths`). It's never cast exactly when its floor is at least the
 * higher's.
 */
export const lowerConsecrationNeverCast = (higherFloorTenths: number, lowerFloorTenths: number): boolean => lowerFloorTenths >= higherFloorTenths

/**
 * Whether the lower row is never cast whatever the maximum mana and the talents: what the Rotation
 * tab can say without either. Rank 1 below rank 5 is never cast when it starts from as much mana
 * as rank 5, or more, and from enough to pay rank 5's most (565) on the least maximum mana
 * (`PALADIN_LEAST_MAX_MANA`, so from just over 25%); from less, the paladin can have the mana for rank 1
 * without rank 5's cost, and casts it. Rank 5 below rank 1 is never cast when it starts from as much
 * mana as rank 1, or more (rank 5 costs more, with the same talents).
 */
export function lowerConsecrationAlwaysNeverCast(lowerIsRank1: boolean, higherPct: number, lowerPct: number): boolean {
  if (lowerPct < higherPct) return false
  return !lowerIsRank1 || (lowerPct / 100) * PALADIN_LEAST_MAX_MANA * 10 >= CONSECRATION_MOST_COST_TENTHS
}

/** "20%": a mana threshold in a note. */
const pct = (n: number) => `${n}%`

/**
 * What the Rotation tab says under the lower Consecration row when it's never cast, whatever the
 * maximum mana and talents (docs/ux.md "Rows that share a cooldown"; `lowerConsecrationAlwaysNeverCast`).
 * Nothing with either row off. The note names both thresholds and how to use the row.
 */
export function consecrationUnused(apl: AplDefinition, rows: readonly [rank5: ConsecrationRow, rank1: ConsecrationRow], v: Reader, order: readonly string[] | undefined): Record<string, string> {
  if (!rows.every((r) => v.on(r.on))) return {}
  const current = normalizeAplOrder(apl, order)
  const [higher, lower] = [...rows].sort((a, b) => current.indexOf(a.row) - current.indexOf(b.row))
  const lowerIsRank1 = lower === rows[1]
  const [hp, lp] = [v.num(higher.mana), v.num(lower.mana)]
  if (!lowerConsecrationAlwaysNeverCast(lowerIsRank1, hp, lp)) return {}
  // From 0%, the higher row takes the cooldown whenever it can be paid for; lowering rank 1's
  // threshold still helps (below rank 5's cost), lowering rank 5's doesn't (rank 1 costs less).
  const note =
    hp > 0
      ? `Not used: ${higher.label}, above it, takes their shared cooldown from ${pct(hp)} mana, and this starts from ${pct(lp)}. Set this below ${pct(hp)}, or move it above ${higher.label}.`
      : lowerIsRank1
        ? `Not used: ${higher.label}, above it, takes their shared cooldown whenever you can pay for it, and this starts from ${pct(lp)}. Set this lower, or move it above ${higher.label}.`
        : `Not used: ${higher.label}, above it, takes their shared cooldown whenever you can pay for it, and costs less. Move this above ${higher.label}.`
  return { [lower.on]: note }
}
