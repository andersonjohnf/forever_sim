// Ids and shared bits of the Rotation tab's setting rows (option-rows.tsx, docs/ux.md "Rotation").
import type { AplDefinition, RotationOption, RotationValue } from '@/sim'
import type { RowState } from './logic'

/** What every row needs: its state, and setting or resetting a value. */
export interface RowContext {
  rows: Map<string, RowState>
  set: (id: string, value: RotationValue) => void
  reset: (id: string) => void
}

export const rowIds = (id: string) => ({
  control: `rot-${id}`,
  label: `rot-${id}-label`,
  help: `rot-${id}-help`,
  default: `rot-${id}-default`,
  missing: `rot-${id}-missing`,
  notUsed: `rot-${id}-not-used`,
  creature: `rot-${id}-creature`,
})

/** A setting's control as it is now: its switch or input, or a choice's selected option. */
export const controlOf = (option: RotationOption) => {
  const ids = rowIds(option.id)
  return option.kind === 'choice'
    ? document.querySelector<HTMLElement>(`[aria-labelledby="${ids.label}"] [data-state="on"]`)
    : document.getElementById(ids.control)
}

/**
 * A switch that depends on one that's off is dimmed by colour, not opacity (docs/ux.md "Rotation"
 * and "Visual language"): on, its track is a neutral gray rather than the primary colour, which
 * still meets 3:1 against the page.
 */
export const INACTIVE_SWITCH = 'data-checked:bg-muted-foreground'

/** The top-of-tab preset picker's trigger (priority-list.tsx `AplPresetPicker`), which Reset rotation hands focus to. */
export const APL_PRESET_TRIGGER_ID = 'apl-preset'

/** Whether the spec has named rotations (D28's tanks), whose picker sits at the top of the tab, first (docs/ux.md "Rotation"). */
export const hasNamedPresets = (apl: AplDefinition) => apl.presets.length > 0
