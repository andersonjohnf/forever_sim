// Simulation worker (docs/architecture.md#engine-design-m1, decision D15).
//
// Stays warm between runs: it keeps one engine per plan and runs chunks as they arrive. It imports
// only the engine, never the datasets; the main thread sends the resolved plan. The messages are
// handled in ./handler, which tests can import.
import { createHandler } from './handler'
import type { FromWorker, ToWorker } from './protocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope
const handle = createHandler((message, transfer) => scope.postMessage(message, transfer))
scope.onmessage = (event) => handle(event.data)
// The script loaded and ran: a later error is the simulation stopping, not failing to start
// (WORKER_START_MESSAGE and WORKER_CRASH_MESSAGE in src/sim/run/pool.ts).
scope.postMessage({ type: 'ready' })
