import { describe, expect, it } from 'vitest'
import { EventQueue } from './queue'
import { mix32, Rng, STREAM } from './rng'
import { addSample, ci95, combine, emptyMoments, stdev } from './welford'

describe('Rng (sfc32)', () => {
  it('is reproducible from (seed, fight, stream)', () => {
    const a = new Rng()
    const b = new Rng()
    a.seed(42, 7, STREAM.table)
    b.seed(42, 7, STREAM.table)
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32())
  })

  it('gives different sequences per stream, fight and seed', () => {
    const first = (seed: number, fight: number, stream: number) => {
      const r = new Rng()
      r.seed(seed, fight, stream)
      return [r.nextU32(), r.nextU32(), r.nextU32()]
    }
    const base = first(1, 0, 0)
    expect(first(1, 0, 1)).not.toEqual(base)
    expect(first(1, 1, 0)).not.toEqual(base)
    expect(first(2, 0, 0)).not.toEqual(base)
  })

  it('stays in [0, 1) with a sane mean', () => {
    const r = new Rng()
    r.seed(123, 0, 0)
    let sum = 0
    let min = 1
    let max = 0
    const n = 200_000
    for (let i = 0; i < n; i++) {
      const x = r.next()
      sum += x
      min = Math.min(min, x)
      max = Math.max(max, x)
    }
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThan(1)
    expect(sum / n).toBeCloseTo(0.5, 2)
  })

  it('pins its output so results stay reproducible across releases', () => {
    const r = new Rng()
    r.seed(1, 0, 0)
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toMatchInlineSnapshot(`
      [
        273635072,
        2775865043,
        3804953789,
      ]
    `)
    expect(mix32(0)).toBe(0)
    expect(mix32(1)).toBe(mix32(1))
  })
})

describe('EventQueue', () => {
  it('pops by time, then by insertion order', () => {
    const q = new EventQueue(2)
    const pushes: [number, number][] = [
      [500, 1],
      [100, 2],
      [500, 3],
      [100, 4],
      [0, 5],
      [900, 6],
      [500, 7],
    ]
    for (const [t, k] of pushes) q.push(t, k, 0, 0)
    const out: [number, number][] = []
    while (q.pop()) out.push([q.time, q.kind])
    expect(out).toEqual([
      [0, 5],
      [100, 2],
      [100, 4],
      [500, 1],
      [500, 3],
      [500, 7],
      [900, 6],
    ])
  })

  it('grows past its capacity and keeps order under random load', () => {
    const q = new EventQueue(4)
    const r = new Rng()
    r.seed(9, 0, 0)
    const times: number[] = []
    for (let i = 0; i < 5000; i++) {
      const t = Math.floor(r.next() * 100000)
      times.push(t)
      q.push(t, i, i, 0)
    }
    let last = -1
    let lastKind = -1
    let count = 0
    while (q.pop()) {
      expect(q.time).toBeGreaterThanOrEqual(last)
      if (q.time === last) expect(q.kind).toBeGreaterThan(lastKind)
      last = q.time
      lastKind = q.kind
      count++
    }
    expect(count).toBe(times.length)
  })

  it('carries data and generation, and clears', () => {
    const q = new EventQueue()
    q.push(10, 3, 42, 7)
    expect(q.peekTime()).toBe(10)
    expect(q.pop()).toBe(true)
    expect([q.kind, q.data, q.gen]).toEqual([3, 42, 7])
    q.push(1, 1, 1, 1)
    q.clear()
    expect(q.pop()).toBe(false)
    expect(q.peekTime()).toBe(Infinity)
  })
})

describe('Welford and Chan', () => {
  const values = Array.from({ length: 1000 }, (_, i) => Math.sin(i) * 100 + i / 10)
  const direct = () => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
    return { mean, sd: Math.sqrt(variance) }
  }

  it('matches the two-pass mean and sample standard deviation', () => {
    const m = emptyMoments()
    for (const v of values) addSample(m, v)
    const { mean, sd } = direct()
    expect(m.mean).toBeCloseTo(mean, 10)
    expect(stdev(m)).toBeCloseTo(sd, 10)
    expect(ci95(m)).toBeCloseTo((1.959963984540054 * sd) / Math.sqrt(values.length), 10)
  })

  it('combines chunks to the same moments as one pass', () => {
    const chunks = [values.slice(0, 250), values.slice(250, 500), values.slice(500, 1000)]
    const merged = chunks
      .map((c) => {
        const m = emptyMoments()
        for (const v of c) addSample(m, v)
        return m
      })
      .reduce(combine, emptyMoments())
    const { mean, sd } = direct()
    expect(merged.n).toBe(1000)
    expect(merged.mean).toBeCloseTo(mean, 10)
    expect(stdev(merged)).toBeCloseTo(sd, 10)
  })
})
