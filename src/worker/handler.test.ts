// The worker's message handling (docs/architecture.md#engine-design-m1): every chunk is answered,
// so a plan the engine can't build fails its run with a message instead of crashing the worker,
// which the pool would report as the simulation stopping (AR-1).
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '@/sim/defaults'
import { CHUNK_SIZE } from '@/sim/engine/chunk'
import { buildPlan } from '@/sim/plan/build'
import type { Plan } from '@/sim/plan/types'
import { createHandler } from './handler'
import type { FromWorker } from './protocol'

const setup = () => {
  const sent: FromWorker[] = []
  const transfers: (Transferable[] | undefined)[] = []
  return {
    sent,
    transfers,
    handle: createHandler((message, transfer) => {
      sent.push(message)
      transfers.push(transfer)
    }),
  }
}

const planFor = (spec: 'warrior-fury' | 'warrior-arms') =>
  buildPlan({ ...defaultConfig(spec), run: { mode: 'fixed', iterations: CHUNK_SIZE, seed: 1 } }).plan

describe('the worker’s handler', () => {
  it('answers a chunk of a plan it can’t build with the error, not by throwing', () => {
    const { sent, handle } = setup()
    expect(() => handle({ type: 'plan', planId: 1, plan: {} as Plan })).not.toThrow()
    handle({ type: 'chunk', jobId: 7, planId: 1, chunk: 0, fights: 1 })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'error', jobId: 7 })
    expect((sent[0] as { message: string }).message).not.toBe('')
  })

  it('runs a good plan’s chunks, and refuses a chunk of a plan it wasn’t sent', () => {
    const { sent, handle } = setup()
    handle({ type: 'plan', planId: 2, plan: planFor('warrior-fury') })
    handle({ type: 'chunk', jobId: 1, planId: 2, chunk: 0, fights: 3 })
    handle({ type: 'chunk', jobId: 2, planId: 3, chunk: 0, fights: 3 })
    expect(sent.map((m) => m.type)).toEqual(['result', 'error'])
    expect(sent[1]).toMatchObject({ jobId: 2, message: 'The worker has no plan for this chunk.' })
  })

  it('recovers when the next plan is a good one', () => {
    const { sent, handle } = setup()
    handle({ type: 'plan', planId: 1, plan: {} as Plan })
    handle({ type: 'plan', planId: 2, plan: planFor('warrior-arms') })
    handle({ type: 'chunk', jobId: 1, planId: 2, chunk: 0, fights: 2 })
    expect(sent.map((m) => m.type)).toEqual(['result'])
  })

  // The optimizer's per-fight samples (docs/optimizer.md#fights-and-runners, OG-7).
  describe('the optimizer’s fights', () => {
    it('builds an engine from the plan sent, reuses it by key when none comes, and transfers the samples', () => {
      const { sent, transfers, handle } = setup()
      handle({ type: 'fights', jobId: 1, key: 9, plan: planFor('warrior-fury'), from: 0, count: 4 })
      // No plan this time: the engine cached under key 9 runs it, the same fights as ever.
      handle({ type: 'fights', jobId: 2, key: 9, from: 2, count: 2 })
      expect(sent.map((m) => m.type)).toEqual(['samples', 'samples'])
      const [first, second] = sent as Extract<FromWorker, { type: 'samples' }>[]
      expect(first.jobId).toBe(1)
      expect(first.samples.dps).toHaveLength(4)
      expect(first.samples.dps[0]).toBeGreaterThan(0)
      expect(Array.from(second.samples.dps)).toEqual(Array.from(first.samples.dps.slice(2)))
      expect(Array.from(second.samples.tps)).toEqual(Array.from(first.samples.tps.slice(2)))
      // Its three arrays' buffers go back transferred, not copied.
      expect(transfers[1]).toEqual([second.samples.dps.buffer, second.samples.tps.buffer, second.samples.taken.buffer])
    })

    it('answers fights of a plan it doesn’t have with an error, and still runs the next job', () => {
      const { sent, handle } = setup()
      handle({ type: 'fights', jobId: 3, key: 5, from: 0, count: 2 })
      expect(sent[0]).toEqual({ type: 'error', jobId: 3, message: 'The worker has no plan for these fights.' })
      handle({ type: 'fights', jobId: 4, key: 5, plan: {} as Plan, from: 0, count: 2 })
      expect(sent[1]).toMatchObject({ type: 'error', jobId: 4 })
      handle({ type: 'fights', jobId: 5, key: 6, plan: planFor('warrior-arms'), from: 0, count: 2 })
      expect(sent[2]).toMatchObject({ type: 'samples', jobId: 5 })
    })

    it('keeps the optimizer’s engines apart from a run’s plan', () => {
      const { sent, handle } = setup()
      handle({ type: 'plan', planId: 1, plan: planFor('warrior-arms') })
      handle({ type: 'fights', jobId: 1, key: 1, plan: planFor('warrior-fury'), from: 0, count: 1 })
      handle({ type: 'chunk', jobId: 2, planId: 1, chunk: 0, fights: 1 })
      expect(sent.map((m) => m.type)).toEqual(['samples', 'result'])
    })
  })
})
