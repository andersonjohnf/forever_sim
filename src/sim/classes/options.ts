// Rotation settings' values for a setup (docs/classes/warrior.md#51-conventions-for-rotation-settings).
//
// A saved value wins; otherwise the option's default for this setup: the first `defaultWhen`
// entry that matches (a talent the build has, or another option's current value), else its
// plain `default`. The plan builder and the Rotation tab both read settings through this, so what
// the tab shows is what the sim uses.
import type { RotationOption, RotationValue } from '../types'

/** Every option's value for these saved values and talents. */
export function resolveRotationValues(
  options: readonly RotationOption[],
  saved: Readonly<Record<string, RotationValue>>,
  /** Talent ranks by name (classes/index.ts talentRanksByName). */
  talents: ReadonlyMap<string, number>,
): Record<string, RotationValue> {
  const byId = new Map(options.map((o) => [o.id, o]))
  const out: Record<string, RotationValue> = {}
  const resolve = (id: string, depth: number): RotationValue | undefined => {
    if (id in out) return out[id]
    const option = byId.get(id)
    if (!option) return undefined
    let value: RotationValue = saved[id] ?? option.default
    if (saved[id] === undefined && option.kind === 'toggle' && option.defaultWhen && depth < byId.size) {
      const hit = option.defaultWhen.find((w) => ('talent' in w ? (talents.get(w.talent) ?? 0) > 0 : resolve(w.option, depth + 1) === w.is))
      if (hit) value = hit.default
    }
    out[id] = value
    return value
  }
  for (const o of options) resolve(o.id, 0)
  return out
}
