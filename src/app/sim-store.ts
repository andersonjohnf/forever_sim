// Simulation runs (docs/ux.md#results): progress and cancel, the previous result for deltas,
// and staleness when the setup changes after a run.
import { create } from 'zustand'
import { simulate, type SimConfig, type SimProgress, type SimResult, type SpecId } from '@/sim'

type Status = 'idle' | 'running' | 'done' | 'error'

/** A spec's latest result, the one before it (for the ▲/▼ delta) and the config it was run for (JSON). */
export interface SpecResult {
  result: SimResult
  previous: SimResult | null
  resultKey: string
}

interface SimState {
  status: Status
  progress: SimProgress | null
  /** The latest result, whatever its spec (the live region announces it). */
  result: SimResult | null
  /**
   * Each spec's latest result, kept while you switch specs: switching back to Fury brings Fury's
   * back (docs/ux.md#states "Stale"). Kept for the page's life, not saved.
   */
  bySpec: Partial<Record<SpecId, SpecResult>>
  /** The config of the run under way (JSON), so a re-run that applies the setup isn't marked stale. */
  runKey: string | null
  /**
   * The spec of the run under way. A run belongs to its spec as its result does: another spec shows
   * no progress for it, and its result lands under its own spec (docs/ux.md#states "Running").
   */
  runSpec: SpecId | null
  error: string | null
  /**
   * The config the failed run was given (JSON). Like a result, a failure belongs to its setup: it
   * shows only while the setup still matches (docs/ux.md#states "Error").
   */
  errorKey: string | null
  run: (config: SimConfig) => Promise<void>
  cancel: () => void
}

let controller: AbortController | null = null

export const configKey = (config: SimConfig) => JSON.stringify(config)

export const useSim = create<SimState>()((set, get) => ({
  status: 'idle',
  progress: null,
  result: null,
  bySpec: {},
  runKey: null,
  runSpec: null,
  error: null,
  errorKey: null,
  run: async (config) => {
    controller?.abort()
    const current = new AbortController()
    controller = current
    const key = configKey(config)
    set({ status: 'running', progress: null, error: null, errorKey: null, runKey: key, runSpec: config.spec })
    try {
      const result = await simulate(config, {
        signal: current.signal,
        onProgress: (progress) => set({ progress }),
      })
      if (controller !== current) return
      const { bySpec } = get()
      set({
        status: 'done',
        result,
        bySpec: { ...bySpec, [result.spec]: { result, previous: bySpec[result.spec]?.result ?? null, resultKey: key } },
        runKey: null,
        runSpec: null,
        progress: null,
      })
    } catch (err) {
      if (controller !== current) return
      if (err instanceof DOMException && err.name === 'AbortError') {
        set({ status: get().result ? 'done' : 'idle', progress: null, runKey: null, runSpec: null })
      } else {
        const error = err instanceof Error ? err.message : String(err)
        set({ status: 'error', error, errorKey: key, progress: null, runKey: null, runSpec: null })
      }
    } finally {
      if (controller === current) controller = null
    }
  },
  cancel: () => controller?.abort(),
}))
