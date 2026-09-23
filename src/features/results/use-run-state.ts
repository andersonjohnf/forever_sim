import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useSetup } from '@/app/setup-store'
import { configKey, useSim } from '@/app/sim-store'
import { useSpecMeta } from '@/app/specs'
import { runConfigFromKey, type Metric } from './run-logic'

export { headlineText, METRIC_LABEL, type Metric, metricsFor } from './run-logic'

/**
 * The run state everything results-related reads (docs/ux.md#results and #states).
 *
 * - `result` is the result to show: the latest one, unless it was run for another spec. A spec
 *   switch sets it aside rather than showing another spec's numbers under this one, and switching
 *   back brings it back unchanged. (The ▲/▼ change never compares specs either.)
 * - `stale`: the setup changed after that run. `dimmed`: stale, or a re-run is under way.
 * - `runConfig`: the setup `result` was run for, which can differ from `config` while stale.
 */
export function useRunState() {
  const config = useSetup((s) => s.config)
  const sim = useSim()
  const meta = useSpecMeta()
  const tank = meta.role === 'tank'
  const result = sim.result && sim.result.spec === config.spec ? sim.result : null
  const stale = result !== null && sim.resultKey !== configKey(config)
  const running = sim.status === 'running'
  const runConfig = useMemo(() => (result ? runConfigFromKey(sim.resultKey) : null), [result, sim.resultKey])
  const progressPct =
    running && sim.progress && sim.progress.totalIterations > 0
      ? Math.min(100, (100 * sim.progress.completedIterations) / sim.progress.totalIterations)
      : null
  const error = sim.status === 'error' ? (sim.error ?? '') : null
  return {
    config,
    sim,
    result,
    runConfig,
    stale,
    running,
    progressPct,
    error,
    dimmed: result !== null && (stale || running),
    metricLabel: tank ? 'TPS and DPS' : 'DPS',
  }
}

/**
 * What a tank's per-ability breakdown shows (docs/ux.md#results): threat by default, remembered
 * for the browser session.
 */
export const useBreakdownMetric = create<{ metric: Metric; setMetric: (metric: Metric) => void }>()(
  persist((set) => ({ metric: 'tps', setMetric: (metric) => set({ metric }) }), {
    name: 'forever-sim:breakdown',
    version: 1,
    storage: createJSONStorage(() => sessionStorage),
    partialize: ({ metric }) => ({ metric }),
    merge: (persisted, current) => {
      const saved = (persisted ?? {}) as { metric?: unknown }
      return { ...current, metric: saved.metric === 'dps' ? 'dps' : 'tps' }
    },
  }),
)
