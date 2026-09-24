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
  return { sent, handle: createHandler((message) => sent.push(message)) }
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
})
