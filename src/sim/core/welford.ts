// Streaming mean and variance (docs/architecture.md#engine-design-m1, decision D15).
//
// Welford's update within a chunk, and Chan et al.'s pairwise combination across chunks. Chunks
// are combined in chunk order, so the result is bit-identical however many workers ran them.

export interface Moments {
  n: number
  mean: number
  /** Sum of squared deviations from the mean. */
  m2: number
}

export const emptyMoments = (): Moments => ({ n: 0, mean: 0, m2: 0 })

/** Welford's single-value update, in place. */
export function addSample(m: Moments, x: number): void {
  m.n += 1
  const delta = x - m.mean
  m.mean += delta / m.n
  m.m2 += delta * (x - m.mean)
}

/** Chan's combination of two sets of moments. `a` comes first in the fixed merge order. */
export function combine(a: Moments, b: Moments): Moments {
  if (b.n === 0) return { ...a }
  if (a.n === 0) return { ...b }
  const n = a.n + b.n
  const delta = b.mean - a.mean
  return {
    n,
    mean: a.mean + (delta * b.n) / n,
    m2: a.m2 + b.m2 + (delta * delta * a.n * b.n) / n,
  }
}

/** Sample standard deviation (n − 1). */
export function stdev(m: Moments): number {
  return m.n > 1 ? Math.sqrt(m.m2 / (m.n - 1)) : 0
}

/** z for a two-sided 95% interval. */
export const Z95 = 1.959963984540054

/** Half-width of the 95% confidence interval of the mean. */
export function ci95(m: Moments): number {
  return m.n > 1 ? (Z95 * stdev(m)) / Math.sqrt(m.n) : 0
}
