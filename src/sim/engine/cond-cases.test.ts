// The engine's condition switches label their cases with COND's numbers, each followed by its name
// (sim.ts conditionsHold, petConditionsHold): each number must be that name's.
import { describe, expect, it } from 'vitest'
import { COND } from '../plan/types'
import simSource from './sim.ts?raw'

/** A method's source, from its declaration to the next method's. */
function body(from: string, to: string): string {
  const start = simSource.indexOf(from)
  const end = simSource.indexOf(to, start)
  expect([start, end].every((i) => i >= 0), from).toBe(true)
  return simSource.slice(start, end)
}

describe('the condition switches’ case labels (sim.ts)', () => {
  it('each `case n: // COND.name` is COND.name’s number, and every case carries its name', () => {
    for (const [from, to, least] of [
      ['private conditionsHold(', 'private use(', 25],
      ['private petConditionsHold(', 'private petUse(', 4],
    ] as const) {
      const src = body(from, to)
      const cases = [...src.matchAll(/^\s*case (.+)$/gm)].map((m) => m[1])
      expect(cases.length, from).toBeGreaterThanOrEqual(least)
      for (const label of cases) {
        const m = /^(\d+):( \{)? \/\/ COND\.(\w+)$/.exec(label)
        expect(m, `${from} case ${label}`).not.toBeNull()
        expect(COND[m![3] as keyof typeof COND], label).toBe(Number(m![1]))
      }
    }
  })
})
