// Seeded randomness (docs/architecture.md#engine-design-m1, decision D15).
//
// sfc32 (Chris Doty-Humphrey's Small Fast Counter): 128 bits of state, only 32-bit integer
// operations, so it is exact and identical on every JS engine and device. Each fight seeds its
// own streams from (master seed, fight index, stream), which makes results independent of how
// fights are split into chunks and workers, and lets later comparisons use common random
// numbers: two configs run with the same seed see the same rolls on each stream.

/** Independent random streams, one per purpose (D15: attack table, damage rolls, procs, …). */
export const STREAM = {
  fight: 0,
  table: 1,
  damage: 2,
  proc: 3,
  boss: 4,
} as const

export const STREAM_COUNT = 5

const TWO_POW_32 = 4294967296

/** Murmur3's 32-bit finalizer: a fast, well-mixed integer hash. */
export function mix32(x: number): number {
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}

export class Rng {
  a = 0
  b = 0
  c = 0
  d = 0

  /** Seeds the stream for (seed, fight index, stream), then discards a few outputs to decorrelate. */
  seed(seed: number, fight: number, stream: number): void {
    const s = mix32((seed >>> 0) ^ 0x9e3779b9)
    const f = mix32((fight >>> 0) + Math.imul(stream + 1, 0x85ebca6b))
    this.a = mix32(s ^ f) | 0
    this.b = mix32(this.a ^ 0x68e31da4) | 0
    this.c = mix32(this.b ^ 0xb5297a4d) | 0
    this.d = mix32(this.c ^ 0x1b56c4e9) | 1
    for (let i = 0; i < 12; i++) this.nextU32()
  }

  nextU32(): number {
    const t0 = (this.a + this.b) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.d = (this.d + 1) | 0
    const t = (t0 + this.d) | 0
    this.c = (this.c + t) | 0
    return t >>> 0
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / TWO_POW_32
  }

  /** Uniform in [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** A percentage roll in [0, 100). */
  roll100(): number {
    return this.next() * 100
  }
}
