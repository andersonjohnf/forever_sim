// A spec's rotation as an action priority list you reorder (decision D31; docs/architecture.md
// "Rotation as a priority list").
//
// The rows are data (AplDefinition in types.ts): each an id, a label and icon, the switch that
// turns it on and its own settings, which are the spec's RotationOptions. The config stores the
// order only while it differs from the default (`rotationOrder`), and every reader goes through
// `normalizeAplOrder`, so an old setup, or one saved before a row was added, gets the default
// place for what it doesn't name. The spec's compiler emits each row's lines in that order
// (`compileAplRows`), so the engine's priority list is the tab's.
import type { AplDefinition, AplPreset, RotationOption, RotationValue } from '../types'
import { resolveRotationValues } from './options'

/** The preset that's the spec's defaults: the default order, every setting at its default. */
export const DEFAULT_APL_PRESET = 'default'
/** What the preset picker shows when the list matches no preset. */
export const CUSTOM_APL_PRESET = 'custom'

/** The default order's row ids. */
export const defaultAplOrder = (def: AplDefinition): string[] => def.rows.map((r) => r.id)

/** Which stretch of the list a row sits in: the number of pinned rows before it by default. Rows never leave it. */
function segments(def: AplDefinition): Map<string, number> {
  const out = new Map<string, number>()
  let segment = 0
  for (const row of def.rows) {
    if (row.pinned) segment++
    out.set(row.id, segment)
  }
  return out
}

/**
 * The order to use for a stored one (untrusted): unknown ids, repeats and anything that isn't a
 * string are dropped; a row it doesn't name goes just after the nearest row before it by default
 * that the order names (or first in its stretch), and past any rows right after that one that also
 * come before it by default, so it lands after them and before what follows it; pinned rows stay
 * at their default places, and no row crosses one. Absent or empty: the default order.
 */
export function normalizeAplOrder(def: AplDefinition, stored: readonly unknown[] | undefined): string[] {
  const fallback = defaultAplOrder(def)
  if (!stored || stored.length === 0) return fallback
  const byId = new Map(def.rows.map((r) => [r.id, r]))
  const segmentOf = segments(def)
  const kept: string[] = []
  for (const id of stored) {
    if (typeof id !== 'string' || kept.includes(id)) continue
    const row = byId.get(id)
    if (row && !row.pinned) kept.push(id)
  }
  const out: string[] = []
  const count = Math.max(0, ...segmentOf.values()) + 1
  for (let s = 0; s < count; s++) {
    const pinned = def.rows.find((r) => r.pinned && segmentOf.get(r.id) === s)
    if (pinned) out.push(pinned.id)
    const list = kept.filter((id) => segmentOf.get(id) === s)
    const defaults = def.rows.filter((r) => !r.pinned && segmentOf.get(r.id) === s).map((r) => r.id)
    defaults.forEach((id, i) => {
      if (list.includes(id)) return
      // After the nearest row before it by default that's in the list, or first; then past the
      // rows just after that which come before it by default too (["whirlwind", "bloodthirst"]
      // puts Overpower after Bloodthirst, not between them).
      const earlier = defaults.slice(0, i)
      const before = earlier.findLast((d) => list.includes(d))
      let at = before === undefined ? 0 : list.indexOf(before) + 1
      while (at < list.length && earlier.includes(list[at])) at++
      list.splice(at, 0, id)
    })
    out.push(...list)
  }
  return out
}

/** What the config stores for an order: nothing while it's the default. */
export function storedAplOrder(def: AplDefinition, order: readonly string[]): string[] | undefined {
  const normalized = normalizeAplOrder(def, order)
  const fallback = defaultAplOrder(def)
  return normalized.every((id, i) => id === fallback[i]) ? undefined : normalized
}

/**
 * The order with row `id` moved to index `to` of the whole list, or null if it can't go there: it's
 * pinned, `to` is off the list, or it would cross a pinned row.
 */
export function moveAplRow(def: AplDefinition, order: readonly string[], id: string, to: number): string[] | null {
  const current = normalizeAplOrder(def, order)
  const from = current.indexOf(id)
  const row = def.rows.find((r) => r.id === id)
  if (from < 0 || !row || row.pinned || to < 0 || to >= current.length) return null
  const segmentOf = segments(def)
  if (segmentOf.get(current[to]) !== segmentOf.get(id) || def.rows.find((r) => r.id === current[to])?.pinned) return null
  const next = [...current]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/** The ids of every setting in the list's rows: their switches and their own settings. */
export function aplRowOptionIds(def: AplDefinition): Set<string> {
  return new Set(def.rows.flatMap((r) => [...(r.enabledId === undefined ? [] : [r.enabledId]), ...r.optionIds]))
}

/** The spec's default and its named presets, the default first. */
export function aplPresets(def: AplDefinition): AplPreset[] {
  return [{ id: DEFAULT_APL_PRESET, label: 'Default', help: 'The spec’s defaults.', values: {} }, ...def.presets]
}

/**
 * Which preset the list matches: the first whose order is the list's and whose settings resolve to
 * the list's for every row setting and every setting the preset names (a default can follow the
 * talents or another setting, so values are compared as the sim uses them). CUSTOM_APL_PRESET
 * when none does.
 */
export function activeAplPreset(
  def: AplDefinition,
  options: readonly RotationOption[],
  saved: Readonly<Record<string, RotationValue>>,
  order: readonly string[] | undefined,
  talents: ReadonlyMap<string, number>,
): string {
  const current = normalizeAplOrder(def, order)
  const values = resolveRotationValues(options, saved, talents)
  const rowIds = aplRowOptionIds(def)
  for (const preset of aplPresets(def)) {
    const presetOrder = normalizeAplOrder(def, preset.order)
    if (presetOrder.some((id, i) => id !== current[i])) continue
    const theirs = resolveRotationValues(options, presetSaved(def, saved, preset), talents)
    const ids = [...rowIds, ...Object.keys(preset.values)]
    if (ids.every((id) => theirs[id] === values[id])) return preset.id
  }
  return CUSTOM_APL_PRESET
}

/** The saved settings with a preset picked: the spec-wide ones you set stay, unless the preset names them. */
function presetSaved(def: AplDefinition, saved: Readonly<Record<string, RotationValue>>, preset: AplPreset): Record<string, RotationValue> {
  const rowIds = aplRowOptionIds(def)
  const kept = Object.fromEntries(Object.entries(saved).filter(([id]) => !rowIds.has(id)))
  return { ...kept, ...preset.values }
}

/**
 * The saved settings and stored order with preset `id` picked: its order and its values for the
 * list's settings, the rest of the list's at their defaults; the spec-wide settings you set stay
 * (a potion's limit), unless the preset names them. Undefined for an unknown preset.
 */
export function applyAplPreset(
  def: AplDefinition,
  saved: Readonly<Record<string, RotationValue>>,
  id: string,
): { rotation: Record<string, RotationValue>; rotationOrder: string[] | undefined } | undefined {
  const preset = aplPresets(def).find((p) => p.id === id)
  if (!preset) return undefined
  return { rotation: presetSaved(def, saved, preset), rotationOrder: preset.order ? storedAplOrder(def, preset.order) : undefined }
}

/**
 * Emits each row's lines in `order` (normalized), calling its emitter; a row without one (the
 * pre-pull, which the compiler builds after the list) emits nothing there. Rows' conditions are
 * their own: a row that moves keeps them, and only its priority changes.
 */
export function compileAplRows(def: AplDefinition, order: readonly string[] | undefined, emit: Readonly<Record<string, (() => void) | undefined>>): void {
  for (const id of normalizeAplOrder(def, order)) emit[id]?.()
}
