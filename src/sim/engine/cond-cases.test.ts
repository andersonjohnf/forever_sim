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

  // Review finding EM-4: a COND with no case would silently hold (the switch has no default), and a
  // repeated number's second case would never run.
  it('covers every COND once: a case in one switch, or resolved before the walk', () => {
    const numbers = (from: string, to: string) => [...body(from, to).matchAll(/^\s*case (\d+):/gm)].map((m) => Number(m[1]))
    const own = numbers('private conditionsHold(', 'private use(')
    const pet = numbers('private petConditionsHold(', 'private petUse(')
    expect(new Set(own).size, 'conditionsHold repeats a case').toBe(own.length)
    expect(new Set(pet).size, 'petConditionsHold repeats a case').toBe(pet.length)
    // Resolved when the plan is read, before any walk: the walk never sees them.
    const RESOLVED_UP_FRONT = [4, 8, 9, 11, 13, 29]
    const covered = new Set([...own, ...pet, ...RESOLVED_UP_FRONT])
    const missing = Object.entries(COND).filter(([, n]) => !covered.has(n as number))
    expect(missing).toEqual([])
  })
})
