// Pure helpers for the results (docs/ux.md#results, #states): no React, no stores, so unit tests
// can import them.
import { SPEC_META, type CooldownResult, type SimConfig, type SimResult, type SpecId } from '@/sim'

export type Metric = 'tps' | 'dps'

export const METRIC_LABEL: Record<Metric, string> = { tps: 'TPS', dps: 'DPS' }

/**
 * The headline metrics of a spec, in order: tanks report TPS and DPS as equals, TPS first
 * (decision D18); DPS specs report DPS.
 */
export const metricsFor = (spec: SpecId): Metric[] => (SPEC_META[spec].role === 'tank' ? ['tps', 'dps'] : ['dps'])

const one = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** A result's headline in words, for the live region: "682.5 DPS", or "1,204.3 TPS and 612.0 DPS". */
export function headlineText(result: SimResult): string {
  return metricsFor(result.spec)
    .map((m) => `${one.format(result[m].mean)} ${METRIC_LABEL[m]}`)
    .join(' and ')
}

/**
 * The setup a result was run for. The sim store keys a result by its config's JSON (`configKey`
 * in src/app/sim-store.ts), so the key is that config; null if it can't be read.
 */
export function runConfigFromKey(key: string | null): SimConfig | null {
  if (!key) return null
  try {
    const config: unknown = JSON.parse(key)
    return config && typeof config === 'object' && 'fight' in config ? (config as SimConfig) : null
  } catch {
    return null
  }
}

/**
 * Whether a failed run's message is the engine refusing the setup (a race or spec it can't
 * simulate yet). Those messages say what to change, so a retry would only fail again; any other
 * failure (a worker that stopped) may pass on a retry. A unit test ties this to the engine's
 * actual messages.
 */
export const isSetupError = (message: string) => /can[’']t be simulated|simulation isn[’']t available/i.test(message)

/**
 * Buffs on you that only trigger when you're hit (Fury's Enrage talent). A DPS player is hit only
 * when Fight → Advanced → "Damage you take" is above 0; it's 0 by default (warrior.md §2.6, Q8),
 * so these show a dash and say why instead of 0.0%. A unit test keeps the list in step with the
 * engine's damage-taken procs.
 */
export const NEEDS_DAMAGE_TAKEN: ReadonlySet<string> = new Set(['enrage'])

/** Whether a Cooldowns and buffs row never had a chance to trigger because the run took no damage. */
export function neverHit(row: CooldownResult, runConfig: SimConfig | null): boolean {
  return NEEDS_DAMAGE_TAKEN.has(row.id) && !row.uptimePct && noDamageTaken(runConfig)
}

/** A DPS run with no damage taken: tanks are hit by the boss, DPS only through "Damage you take". */
function noDamageTaken(runConfig: SimConfig | null): boolean {
  if (!runConfig) return false
  return SPEC_META[runConfig.spec]?.role !== 'tank' && !(runConfig.fight.damageTakenPerSec > 0)
}
