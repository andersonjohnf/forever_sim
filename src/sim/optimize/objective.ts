// What the optimizer optimizes for, and the paired statistics it compares candidates with
// (docs/optimizer.md#goals and #the-statistics; decisions D18, D23, D30).
import { Z95 } from '../core/welford'
import type { Role } from '../types'

/**
 * What the player tells the optimizer to optimize for (D30, user decision after O1's fifth review
 * round; docs/optimizer.md#goals):
 * - `defense`: the least damage taken a second, as the sim measures it; the most TPS breaks a tie
 * - `dps`, `tps`: the most of that metric; the least damage taken breaks a tie
 * - `balanced`: TPS and DPS as equals (D18, D30), the sum of each one's change relative to the
 *   baseline, the spec's current default; for a DPS spec, DPS alone (`scoredGoal`)
 */
export type Goal = 'defense' | 'dps' | 'tps' | 'balanced'

export const GOALS: readonly Goal[] = ['defense', 'dps', 'tps', 'balanced']

/** D30: a DPS spec optimizes for DPS; a tank for the balanced approach. */
export function defaultGoal(role: Role): Goal {
  return role === 'tank' ? 'balanced' : 'dps'
}

/**
 * The goal a search scores: the player's, except that `balanced` for a DPS spec is DPS alone
 * (docs/optimizer.md#goals). `defense` is a tank's: the boss attacks only a tank, so a DPS spec
 * takes no damage and there's nothing to rank.
 */
export function scoredGoal(goal: Goal, role: Role): Goal {
  if (goal === 'defense' && role !== 'tank') throw new Error('The Defense goal is for a tank: the boss attacks only a tank, so a DPS spec takes no damage to lower')
  return goal === 'balanced' && role !== 'tank' ? 'dps' : goal
}

/** The baseline's mean TPS and DPS, which `balanced` scores relative to. */
export interface BaselineMeans {
  dps: number
  tps: number
}

/** A fight's score from its DPS, TPS and damage taken a second: higher is better, whatever the goal. */
export type Score = (dps: number, tps: number, taken: number) => number

/**
 * A fight's score, higher is better. `balanced` is 100 × (TPS ÷ TPS₀ + DPS ÷ DPS₀), so the baseline
 * scores about 200 and a difference of 1 is one percentage point of TPS or of DPS: +3 TPS% and −1
 * DPS% is +2 (D30, "the sum of each one's change relative to the spec's current default"). A
 * baseline mean of zero (a DPS spec's TPS can't be, but a setup with no damage could) contributes
 * nothing. `defense` is minus the damage taken a second, so less damage taken is a higher score and
 * every comparison (the leader, the drops, the separation and confirmation bars) reads the same way
 * for every goal.
 */
export function scorer(goal: Goal, base: BaselineMeans): Score {
  if (goal === 'defense') return (_dps, _tps, taken) => -taken
  if (goal === 'dps') return (dps) => dps
  if (goal === 'tps') return (_dps, tps) => tps
  const kd = base.dps > 0 ? 100 / base.dps : 0
  const kt = base.tps > 0 ? 100 / base.tps : 0
  return (dps, tps) => kt * tps + kd * dps
}

/**
 * What breaks a tie in score, higher is better (D30: what the score leaves out is a tie-break): the
 * most TPS for `defense`, the least damage taken for the others.
 */
export function tieBreaker(goal: Goal): Score {
  return goal === 'defense' ? (_dps, tps) => tps : (_dps, _tps, taken) => -taken
}

/**
 * The per-fight numbers the goal's score reads, and only those (OG-4). Two candidates equal on these
 * on every fight are the same to it: the race merges them, and the screen calls a talent that changes
 * none of them a tie-break talent or one with no effect. DPS for `dps`, TPS for `tps`, both for
 * `balanced`, damage taken for `defense`: a talent that only adds threat (Iron Creed for a
 * Retribution paladin) does nothing for DPS.
 */
export function scoreReads(goal: Goal): readonly ('dps' | 'tps' | 'taken')[] {
  switch (goal) {
    case 'dps':
      return ['dps']
    case 'tps':
      return ['tps']
    case 'balanced':
      return ['dps', 'tps']
    case 'defense':
      return ['taken']
  }
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

/** z for a two-sided 99% interval. */
export const Z99 = 2.5758293035489004

/**
 * The upper tail's share the race's elimination bar allows the true best, a round: 0.5%, the one
 * side of a 99% interval (docs/optimizer.md#racing).
 */
export const ELIMINATION_TAIL = 0.005

/**
 * The elimination bar for a round (docs/optimizer.md#racing): with `comparisons` survivors compared
 * with the leader over `n` paired fights, the Bonferroni-corrected quantile of Student's t with
 * n − 1 degrees of freedom, so the chance any one of them (the true best among them) is dropped by
 * bad luck stays at most `tail` a round, however many there are. The leader is the best of many
 * noisy means (the winner's curse); the correction covers every candidate that could be it.
 */
export function eliminationZ(comparisons: number, n: number, tail = ELIMINATION_TAIL): number {
  return tQuantile(tail / Math.max(1, comparisons), n - 1)
}

/**
 * The standard normal's quantile for an upper tail p (0 < p < 1): P(Z > z) = p. Acklam's rational
 * approximation (relative error under 1.2e-9), refined by one Halley step on erfc.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`A tail share is between 0 and 1, got ${p}`)
  // Acklam's approximation for the lower-tail quantile of q = 1 − p, computed from p directly.
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const low = 0.02425
  let z: number
  if (p < low) {
    // Upper tail.
    const q = Math.sqrt(-2 * Math.log(p))
    z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else {
    const q = 0.5 - p
    const r = q * q
    z = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  // One Halley step on the upper tail, 0.5 × erfc(z / √2) − p.
  const e = 0.5 * erfc(z / Math.SQRT2) - p
  const u = -e * Math.sqrt(2 * Math.PI) * Math.exp((z * z) / 2)
  return z - u / (1 + (z * u) / 2)
}

/** The complementary error function, to about 1e-14 (the continued fraction for large x, the series below). */
function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x)
  // Upper incomplete gamma Q(1/2, x²) = erfc(x).
  return gammaQ(0.5, x * x)
}

/** ln Γ(x), x > 0 (Lanczos, g = 7, 9 terms). */
function logGamma(x: number): number {
  const g = [0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7]
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  x -= 1
  let s = g[0]
  for (let i = 1; i < 9; i++) s += g[i] / (x + i)
  const t = x + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(s)
}

/** The regularized upper incomplete gamma Q(a, x). */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1
  const front = Math.exp(-x + a * Math.log(x) - logGamma(a))
  if (x < a + 1) {
    // Series for P, then Q = 1 − P.
    let sum = 1 / a
    let term = sum
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break
    }
    return 1 - sum * front
  }
  // Continued fraction (modified Lentz).
  const tiny = 1e-300
  let b = x + 1 - a
  let c = 1 / tiny
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 1e-16) break
  }
  return front * h
}

/** The regularized incomplete beta I_x(a, b), by its continued fraction (modified Lentz). */
function betaI(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  // The fraction converges fast for x < (a + 1) / (a + b + 2); use the symmetry otherwise.
  if (x > (a + 1) / (a + b + 2)) return 1 - betaI(1 - x, b, a)
  const tiny = 1e-300
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m < 1000; m++) {
    const m2 = 2 * m
    let an = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + an * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    an = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + an * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 1e-15) break
  }
  return (front * h) / a
}

/** Student's t with ν degrees of freedom: the upper tail P(T > t), for any t (0.5 at zero, by symmetry below it). */
export function tTail(t: number, dof: number): number {
  if (Number.isNaN(t)) return NaN
  if (!(dof > 0) || t === 0) return 0.5
  const tail = 0.5 * betaI(dof / (dof + t * t), dof / 2, 0.5)
  return t > 0 ? tail : 1 - tail
}

/**
 * Student's t quantile for an upper tail p with ν degrees of freedom: P(T > t) = p. It's wider than
 * the normal's at few fights, which a race's early rounds have; past 10⁶ degrees of freedom it's the
 * normal's. Found by bisection on `tTail`, which falls as t grows.
 */
export function tQuantile(p: number, dof: number): number {
  if (!(p > 0 && p < 0.5)) throw new Error(`An upper tail share is between 0 and 0.5, got ${p}`)
  const z = normalQuantile(p)
  if (!(dof >= 1)) return Infinity
  if (dof > 1e6) return z
  let lo = z
  let hi = Math.max(2 * z, 1)
  while (tTail(hi, dof) > p) hi *= 2
  for (let i = 0; i < 200 && hi - lo > 1e-12 * hi; i++) {
    const mid = (lo + hi) / 2
    if (tTail(mid, dof) > p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
