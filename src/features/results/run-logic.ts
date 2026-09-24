// Pure helpers for the results (docs/ux.md#results, #states): no React, no stores, so unit tests
// can import them.
import { SPEC_META, WORKER_HANG_MESSAGE, WORKER_START_MESSAGE, type CooldownResult, type SimConfig, type SimResult, type SpecId } from '@/sim'

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
 * What the live region says when a run ends (docs/ux.md#states "Running"): "Done: 682.5 DPS", "Simulation
 * cancelled.", or a failure (on desktop the panel's alert reads that out, so nothing). A run that
 * ends while another spec is showing names its own spec, so its numbers aren't heard as this spec's:
 * "Fury Warrior’s run is done: 682.5 DPS"; its failure is read out at every width, since this spec's
 * panel doesn't show it. `result` is the new result, or null when the run brought none (cancelled).
 */
export function runOutcomeMessage({
  status,
  error,
  result,
  runSpec,
  currentSpec,
  desktop,
}: {
  status: string
  error: string | null
  result: SimResult | null
  runSpec: SpecId | null
  currentSpec: SpecId
  desktop: boolean
}): string {
  const elsewhere = runSpec !== null && runSpec !== currentSpec
  const whose = elsewhere ? `${SPEC_META[runSpec].name} ${SPEC_META[runSpec].className}’s run` : ''
  if (status === 'error') {
    if (elsewhere) return `${whose} failed: ${error ?? ''} Switch back to it for details.`
    return desktop ? '' : `Couldn’t simulate: ${error ?? ''} Open the results for details.`
  }
  if (!result) return 'Simulation cancelled.'
  return elsewhere ? `${whose} is done: ${headlineText(result)}` : `Done: ${headlineText(result)}`
}

/**
 * The breakdown's rows (docs/ux.md#results): those that add to the metric, most first, except that
 * a bleed with a hit of its own (Rake's) sits right after that hit.
 */
export function breakdownRows<T extends { id: string; bleed?: { hitId?: string } }>(abilities: readonly T[], value: (a: T) => number): T[] {
  const rows = abilities.filter((a) => value(a) > 0).sort((a, b) => value(b) - value(a))
  const ids = new Set(rows.map((r) => r.id))
  const bleedOf = new Map<string, T>()
  for (const r of rows) if (r.bleed?.hitId && ids.has(r.bleed.hitId)) bleedOf.set(r.bleed.hitId, r)
  const moved = new Set(bleedOf.values())
  return rows.flatMap((r) => (moved.has(r) ? [] : bleedOf.has(r.id) ? [r, bleedOf.get(r.id)!] : [r]))
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
 * A failed run's message, while the setup is still the one that failed (docs/ux.md#states
 * "Error"); null otherwise. A failure is keyed to its config as a result is: fixing the setup
 * clears it, and a spec switch sets it aside until you switch back to the same setup. `key` is
 * the current config's key (`configKey` in src/app/sim-store.ts).
 */
export function runError(sim: { status: string; error: string | null; errorKey: string | null }, key: string): string | null {
  return sim.status === 'error' && sim.errorKey === key ? (sim.error ?? '') : null
}

/**
 * Whether a failed run's message is the engine refusing the setup (a race or spec it can't
 * simulate yet). Those messages say what to change, so a retry would only fail again; any other
 * failure (a worker that stopped) may pass on a retry. A unit test ties this to the engine's
 * actual messages.
 */
export const isSetupError = (message: string) => /can[’']t be simulated|simulation isn[’']t available/i.test(message)

/**
 * Whether a failed run's message already says what to do next, so the retry advice would repeat it:
 * a hung worker ("Run it again") or one that couldn't start ("Reload the page"), where resetting the
 * spec wouldn't help.
 */
export const carriesItsOwnAdvice = (message: string) =>
  isSetupError(message) || message === WORKER_HANG_MESSAGE || message === WORKER_START_MESSAGE

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
