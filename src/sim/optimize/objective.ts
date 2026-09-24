// What the optimizer maximizes, and the paired statistics it compares candidates with
// (docs/optimizer.md#the-objective and #the-statistics; decisions D18, D23, D30).
import { Z95 } from '../core/welford'
import type { Role } from '../types'

/**
 * `dps` and `tps` maximize that one metric. `balanced` weighs TPS and DPS as equals (D18, D30):
 * the sum of each one's change relative to the baseline, the spec's current default.
 */
export type ObjectiveId = 'dps' | 'tps' | 'balanced'

export const OBJECTIVES: readonly ObjectiveId[] = ['dps', 'tps', 'balanced']

/** D30: a DPS spec maximizes DPS; a tank maximizes TPS and DPS as equals. */
export function defaultObjective(role: Role): ObjectiveId {
  return role === 'tank' ? 'balanced' : 'dps'
}

/** The baseline's mean TPS and DPS, which `balanced` scores relative to. */
export interface BaselineMeans {
  dps: number
  tps: number
}

/**
 * A fight's score. `balanced` is 100 × (TPS ÷ TPS₀ + DPS ÷ DPS₀), so the baseline scores about
 * 200 and a difference of 1 is one percentage point of TPS or of DPS: +3 TPS% and −1 DPS% is +2
 * (D30, "the sum of each one's change relative to the spec's current default"). A baseline mean of
 * zero (a DPS spec's TPS can't be, but a setup with no damage could) contributes nothing.
 */
export function scorer(objective: ObjectiveId, base: BaselineMeans): (dps: number, tps: number) => number {
  if (objective === 'dps') return (dps) => dps
  if (objective === 'tps') return (_dps, tps) => tps
  const kd = base.dps > 0 ? 100 / base.dps : 0
  const kt = base.tps > 0 ? 100 / base.tps : 0
  return (dps, tps) => kt * tps + kd * dps
}

/** A mean and the half-width of its confidence interval. */
export interface Interval {
  mean: number
  halfWidth: number
}

/** The interval's bounds. */
export const lower = (i: Interval) => i.mean - i.halfWidth
export const upper = (i: Interval) => i.mean + i.halfWidth

/**
 * The mean of `a[k] − b[k]` over k < n, with its confidence interval (z × the standard error of
 * the paired differences; z = 1.96 for 95%). With common random numbers most of the fight-to-fight
 * spread cancels in the difference, so a paired interval is far narrower than the two means' own.
 */
export function pairedInterval(a: ArrayLike<number>, b: ArrayLike<number>, n: number, z = Z95): Interval {
  if (n <= 0) return { mean: 0, halfWidth: Infinity }
  let mean = 0
  let m2 = 0
  for (let k = 0; k < n; k++) {
    const d = a[k] - b[k]
    const delta = d - mean
    mean += delta / (k + 1)
    m2 += delta * (d - mean)
  }
  const sd = n > 1 ? Math.sqrt(m2 / (n - 1)) : Infinity
  return { mean, halfWidth: n > 1 ? (z * sd) / Math.sqrt(n) : Infinity }
}

/** The mean of `a[k]` over k < n, with its confidence interval. */
export function meanInterval(a: ArrayLike<number>, n: number, z = Z95): Interval {
  if (n <= 0) return { mean: 0, halfWidth: Infinity }
  let mean = 0
  let m2 = 0
  for (let k = 0; k < n; k++) {
    const delta = a[k] - mean
    mean += delta / (k + 1)
    m2 += delta * (a[k] - mean)
  }
  return { mean, halfWidth: n > 1 ? (z * Math.sqrt(m2 / (n - 1))) / Math.sqrt(n) : Infinity }
}

/** z for a two-sided 99% interval: the racing's elimination bar (docs/optimizer.md#racing). */
export const Z99 = 2.5758293035489004
