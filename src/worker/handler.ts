// What the simulation worker does with each message (docs/architecture.md#engine-design-m1): builds
// one engine per plan and runs chunks on it. Every chunk is answered, with its result or an error,
// so a bad plan fails its run with a message rather than crashing the worker.
import { runChunk } from '@/sim/engine/chunk'
import { Sim } from '@/sim/engine/sim'
import type { FromWorker, ToWorker } from './protocol'

type Post = (message: FromWorker, transfer?: Transferable[]) => void

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function createHandler(post: Post): (message: ToWorker) => void {
  // The current plan's engine, or why it couldn't be built: its chunks answer with that error.
  let current: { planId: number; sim: Sim | null; error: string | null } | null = null
  return (message) => {
    if (message.type === 'plan') {
      try {
        current = { planId: message.planId, sim: new Sim(message.plan), error: null }
      } catch (error) {
        current = { planId: message.planId, sim: null, error: messageOf(error) }
      }
      return
    }
    try {
      if (!current || current.planId !== message.planId) throw new Error('The worker has no plan for this chunk.')
      if (!current.sim) throw new Error(current.error ?? 'The worker has no plan for this chunk.')
      const result = runChunk(current.sim.plan, message.chunk, message.fights, current.sim)
      post({ type: 'result', jobId: message.jobId, result }, [result.counters.buffer, result.auraUpMs.buffer, result.auraApplications.buffer, result.auraStackMs.buffer])
    } catch (error) {
      post({ type: 'error', jobId: message.jobId, message: messageOf(error) })
    }
  }
}
