// Simulation worker (docs/architecture.md#engine-design-m1, decision D15).
//
// Stays warm between runs: it keeps one engine per plan and runs chunks as they arrive. It imports
// only the engine, never the datasets; the main thread sends the resolved plan.
import { runChunk } from '@/sim/engine/chunk'
import { Sim } from '@/sim/engine/sim'
import type { FromWorker, ToWorker } from './protocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope
let current: { planId: number; sim: Sim } | null = null

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'plan') {
    current = { planId: message.planId, sim: new Sim(message.plan) }
    return
  }
  try {
    if (!current || current.planId !== message.planId) throw new Error('The worker has no plan for this chunk.')
    const result = runChunk(current.sim.plan, message.chunk, message.fights, current.sim)
    scope.postMessage({ type: 'result', jobId: message.jobId, result }, [result.counters.buffer, result.auraUpMs.buffer])
  } catch (error) {
    scope.postMessage({ type: 'error', jobId: message.jobId, message: error instanceof Error ? error.message : String(error) })
  }
}
