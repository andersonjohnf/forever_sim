// Simulation runs (docs/ux.md#results): progress and cancel, the previous result for deltas,
// and staleness when the setup changes after a run.
import { create } from 'zustand'
import { simulate, type SimConfig, type SimProgress, type SimResult } from '@/sim'

type Status = 'idle' | 'running' | 'done' | 'error'

interface SimState {
  status: Status
  progress: SimProgress | null
  result: SimResult | null
  /** The result before the latest one, for the ▲/▼ delta. Only kept for the same spec. */
  previous: SimResult | null
  /** The config the current result was computed from (JSON), for staleness. */
  resultKey: string | null
  error: string | null
  run: (config: SimConfig) => Promise<void>
  cancel: () => void
}

let controller: AbortController | null = null

export const configKey = (config: SimConfig) => JSON.stringify(config)

export const useSim = create<SimState>()((set, get) => ({
  status: 'idle',
  progress: null,
  result: null,
  previous: null,
  resultKey: null,
  error: null,
  run: async (config) => {
    controller?.abort()
    const current = new AbortController()
    controller = current
    set({ status: 'running', progress: null, error: null })
    try {
      const result = await simulate(config, {
        signal: current.signal,
        onProgress: (progress) => set({ progress }),
      })
      if (controller !== current) return
      const last = get().result
      set({
        status: 'done',
        result,
        previous: last && last.spec === result.spec ? last : null,
        resultKey: configKey(config),
        progress: null,
      })
    } catch (err) {
      if (controller !== current) return
      if (err instanceof DOMException && err.name === 'AbortError') {
        set({ status: get().result ? 'done' : 'idle', progress: null })
      } else {
        set({ status: 'error', error: err instanceof Error ? err.message : String(err), progress: null })
      }
    } finally {
      if (controller === current) controller = null
    }
  },
  cancel: () => controller?.abort(),
}))
