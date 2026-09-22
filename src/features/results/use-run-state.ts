import { useSetup } from '@/app/setup-store'
import { configKey, useSim } from '@/app/sim-store'
import { useSpecMeta } from '@/app/specs'
import type { SimResult } from '@/sim'

/** The run state everything results-related reads: progress, staleness and the headline metric. */
export function useRunState() {
  const config = useSetup((s) => s.config)
  const sim = useSim()
  const meta = useSpecMeta()
  const tank = meta.role === 'tank'
  const stale = sim.result !== null && sim.resultKey !== configKey(config)
  const metric = (r: SimResult) => (tank ? r.tps : r.dps)
  return { config, sim, tank, stale, metric, metricLabel: tank ? 'TPS' : 'DPS' }
}
