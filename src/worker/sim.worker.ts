// Simulation worker (docs/architecture.md#engine-design-m1, decision D15).
//
// Stays warm between runs: it keeps one engine per plan and runs chunks as they arrive. It imports
// only the engine, never the datasets; the main thread sends the resolved plan.
import { runChunk } from '@/sim/engine/chunk'
import { Sim } from '@/sim/engine/sim'
import { EngineCache, ENGINES_PER_LANE, runFights } from '@/sim/optimize/fights'
import type { FromWorker, ToWorker } from './protocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope
let current: { planId: number; sim: Sim } | null = null
// The optimizer's engines by plan key (least recently used out), mirrored by the pool.
const engines = new EngineCache<Sim>(ENGINES_PER_LANE)

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'plan') {
    current = { planId: message.planId, sim: new Sim(message.plan) }
    return
  }
  if (message.type === 'fights') {
    try {
      let sim = engines.get(message.key)
      if (!sim) {
        if (!message.plan) throw new Error('The worker has no plan for these fights.')
        sim = new Sim(message.plan)
        engines.set(message.key, sim)
      }
      const samples = runFights(sim, message.from, message.count)
      scope.postMessage({ type: 'samples', jobId: message.jobId, samples }, [samples.dps.buffer, samples.tps.buffer, samples.taken.buffer])
    } catch (error) {
      scope.postMessage({ type: 'error', jobId: message.jobId, message: error instanceof Error ? error.message : String(error) })
    }
    return
  }
  try {
    if (!current || current.planId !== message.planId) throw new Error('The worker has no plan for this chunk.')
    const result = runChunk(current.sim.plan, message.chunk, message.fights, current.sim)
    scope.postMessage({ type: 'result', jobId: message.jobId, result }, [result.counters.buffer, result.auraUpMs.buffer, result.auraApplications.buffer, result.auraStackMs.buffer])
  } catch (error) {
    scope.postMessage({ type: 'error', jobId: message.jobId, message: error instanceof Error ? error.message : String(error) })
  }
}
