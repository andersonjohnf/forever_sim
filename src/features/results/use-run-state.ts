import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useSetup } from '@/app/setup-store'
import { configKey, useSim } from '@/app/sim-store'
import { useSpecMeta } from '@/app/specs'
import { SPEC_META, type SpecId } from '@/sim'

export type Metric = 'tps' | 'dps'

export const METRIC_LABEL: Record<Metric, string> = { tps: 'TPS', dps: 'DPS' }

/**
 * The headline metrics of a spec, in order: tanks report TPS and DPS as equals, TPS first
 * (decision D18); DPS specs report DPS.
 */
export const metricsFor = (spec: SpecId): Metric[] => (SPEC_META[spec].role === 'tank' ? ['tps', 'dps'] : ['dps'])

/** The run state everything results-related reads: progress, staleness and the headline metrics. */
export function useRunState() {
  const config = useSetup((s) => s.config)
  const sim = useSim()
  const meta = useSpecMeta()
  const tank = meta.role === 'tank'
  const stale = sim.result !== null && sim.resultKey !== configKey(config)
  return { config, sim, stale, metricLabel: tank ? 'TPS and DPS' : 'DPS' }
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
