// An in-thread executor: runs chunks on the calling thread, yielding between them so a caller
// can cancel. Used where Web Workers don't exist (Node, tests) and as a fallback.
import { runChunk } from '../engine/chunk'
import { Sim } from '../engine/sim'
import type { Plan } from '../plan/types'
import type { ChunkExecutor } from './driver'

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export function localExecutor(plan: Plan): ChunkExecutor {
  const sim = new Sim(plan)
  let queue = Promise.resolve()
  return {
    lanes: 1,
    run(chunk, fights) {
      // One chunk at a time, in submission order.
      const job = queue.then(nextTick).then(() => runChunk(plan, chunk, fights, sim))
      queue = job.then(
        () => undefined,
        () => undefined,
      )
      return job
    },
  }
}
