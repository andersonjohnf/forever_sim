// Rotation settings' values for a setup (docs/classes/warrior.md#51-conventions-for-rotation-settings).
//
// A saved value wins; otherwise the option's default for this setup: the first `defaultWhen`
// entry that matches (a talent the build has, or another option's current value), else its
// plain `default`. An entry given as a share of the rage bar (`pctOfMaxRage`) resolves against the
// build's max rage (`RotationSetup`). Switches and numbers can follow the setup; a choice has one
// default. The plan builder and the Rotation tab both read settings through this, so what the tab
// shows is what the sim uses.
import type { RotationOption, RotationValue } from '../types'

/** What a default can follow besides the talents and the other settings. */
export interface RotationSetup {
  /** The build's max rage in rage points (a warrior's: 100 + Boundless Rage, × a Gnome's 1.05); 100 when absent. */
  maxRage?: number
}

/** The rage bar a share-of-max-rage default is drawn from when the setup doesn't give one (rage.md#rage-pool-cap-and-decay). */
const DEFAULT_MAX_RAGE = 100

/** Every option's value for these saved values and talents. */
export function resolveRotationValues(
  options: readonly RotationOption[],
  saved: Readonly<Record<string, RotationValue>>,
  /** Talent ranks by name (classes/index.ts talentRanksByName). */
  talents: ReadonlyMap<string, number>,
  setup: RotationSetup = {},
): Record<string, RotationValue> {
  const byId = new Map(options.map((o) => [o.id, o]))
  const out: Record<string, RotationValue> = {}
  const resolve = (id: string, depth: number): RotationValue | undefined => {
    if (id in out) return out[id]
    const option = byId.get(id)
    if (!option) return undefined
    let value: RotationValue = saved[id] ?? option.default
    if (saved[id] === undefined && option.kind !== 'choice' && option.defaultWhen && depth < byId.size) {
      const hit = option.defaultWhen.find((w) => ('talent' in w ? (talents.get(w.talent) ?? 0) > 0 : resolve(w.option, depth + 1) === w.is))
      if (hit) value = hit.pctOfMaxRage && typeof hit.default === 'number' ? Math.round((hit.default * (setup.maxRage ?? DEFAULT_MAX_RAGE)) / 100) : hit.default
    }
    out[id] = value
    return value
  }
  for (const o of options) resolve(o.id, 0)
  return out
}
