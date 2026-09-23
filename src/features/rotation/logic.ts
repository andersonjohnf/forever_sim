// What the Rotation tab shows for each setting (docs/ux.md "Rotation"): its value, its default for
// this setup, whether you've changed it, and whether it can apply at all.
import { buffCatalogue, rotationValues, type BuffDefinition, type RotationOption, type RotationValue, type SimConfig } from '@/sim'

export interface RowState {
  /** The value the sim uses: the saved one, or the default for this setup. */
  value: RotationValue
  /**
   * Its default for this setup, with every other setting as it is now: a default can follow the
   * talents or another setting (Arms: Whirlwind in Berserker Stance).
   */
  default: RotationValue
  /** Saved and different from its default, so the row marks it and offers its own reset. */
  changed: boolean
  /** A consumable this switch needs selected in Buffs, while it isn't. */
  missingBuff?: BuffDefinition
  /** Whether a switch shows on: only while it's on and any consumable it needs is selected. */
  on: boolean
  /** A switch it depends on is off, or can't apply itself, so this setting changes nothing. */
  inactive: boolean
}

/**
 * Thresholds and fine-tuning numbers sit behind each heading's Advanced disclosure; switches and
 * choices stay in view (docs/ux.md principle 2 and "Rotation").
 */
export const isAdvanced = (option: RotationOption) => option.kind === 'number'

/** Every setting's row state for this setup. */
export function rotationRows(
  config: Pick<SimConfig, 'spec' | 'talents' | 'rotation'>,
  options: readonly RotationOption[],
  enabledBuffs: readonly string[],
): Map<string, RowState> {
  const { spec, talents, rotation } = config
  const values = rotationValues({ spec, talents, rotation })
  const byId = new Map(options.map((o) => [o.id, o]))
  const missing = (option: RotationOption | undefined) => {
    if (option?.kind !== 'toggle' || option.requiresBuff === undefined || enabledBuffs.includes(option.requiresBuff)) return undefined
    return buffCatalogue.find((b) => b.id === option.requiresBuff)
  }
  // A switch applies while it's on, its consumable is selected, and the switch it depends on applies.
  const applies = (id: string, depth = 0): boolean => {
    const option = byId.get(id)
    if (!option || depth > options.length) return false
    if (Boolean(values[id]) === false || missing(option)) return false
    return option.dependsOn === undefined || applies(option.dependsOn, depth + 1)
  }
  const rows = new Map<string, RowState>()
  for (const option of options) {
    const { [option.id]: saved, ...others } = rotation
    const def = saved === undefined ? values[option.id] : rotationValues({ spec, talents, rotation: others })[option.id]
    const missingBuff = missing(option)
    rows.set(option.id, {
      value: values[option.id],
      default: def,
      changed: saved !== undefined && saved !== def,
      missingBuff,
      on: Boolean(values[option.id]) && missingBuff === undefined,
      inactive: [option.dependsOn, option.kind === 'number' ? option.alsoDependsOn : undefined].some((id) => id !== undefined && !applies(id)),
    })
  }
  return rows
}

/** A value as the row's default hint reads it: "on", "42 rage", "3 s left", "Battle". */
export function formatSetting(option: RotationOption, value: RotationValue): string {
  if (option.kind === 'toggle') return value ? 'on' : 'off'
  if (option.kind === 'choice') return option.choices.find((c) => c.value === value)?.label ?? String(value)
  return `${value} ${option.unit}`
}
