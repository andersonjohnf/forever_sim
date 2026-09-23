// What the Rotation tab shows for each setting (docs/ux.md "Rotation"): its value, its default for
// this setup, whether you've changed it, and whether it can apply at all.
import { buffCatalogue, rotationValues, type BuffDefinition, type CreatureType, type RotationOption, type RotationValue, type SimConfig } from '@/sim'

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
  /** The creature types a switch needs (Exorcism: Undead and Demons), while the fight's is another. */
  needsCreature?: readonly CreatureType[]
  /**
   * Why it can't do anything in this setup, as the row's note says it ("Not used: Tauren has no
   * racial cooldown that adds damage."), from `unusedRotationSettings`. The row is dimmed, and its
   * switch stays usable: it takes effect once the setup lets it.
   */
  notUsed?: string
  /**
   * A switch it depends on is off, or can't apply itself, so this setting changes nothing; or it
   * needs an execute phase (Execute) or a creature type (Exorcism) itself and the fight hasn't one;
   * or the setup leaves it unused (`notUsed`).
   */
  inactive: boolean
}

/**
 * Thresholds and fine-tuning numbers sit behind each heading's Advanced disclosure; switches and
 * choices stay in view (docs/ux.md principle 2 and "Rotation").
 */
export const isAdvanced = (option: RotationOption) => option.kind === 'number'

/**
 * Every setting's row state for this setup. The fight decides whether the settings that need an
 * execute phase can apply (at 0% there's none), and those that need a creature type (docs/ux.md
 * "Rotation"); a fight without a creature type given counts as any. `unused` gives the settings the
 * rest of the setup leaves unused, with why (`unusedRotationSettings`).
 */
export function rotationRows(
  config: Pick<SimConfig, 'spec' | 'talents' | 'rotation'> & { fight: Pick<SimConfig['fight'], 'executePct'> & Partial<Pick<SimConfig['fight'], 'creatureType'>> },
  options: readonly RotationOption[],
  enabledBuffs: readonly string[],
  unused: Readonly<Record<string, string>> = {},
): Map<string, RowState> {
  const { spec, talents, rotation } = config
  const values = rotationValues({ spec, talents, rotation })
  const byId = new Map(options.map((o) => [o.id, o]))
  const missing = (option: RotationOption | undefined) => {
    if (option?.kind !== 'toggle' || option.requiresBuff === undefined || enabledBuffs.includes(option.requiresBuff)) return undefined
    return buffCatalogue.find((b) => b.id === option.requiresBuff)
  }
  /** It needs an execute phase, and the fight has none. */
  const noPhase = (option: RotationOption | undefined) => option?.kind === 'toggle' && option.needsExecutePhase === true && !(config.fight.executePct > 0)
  /** The creature types it needs, when the fight's is another. */
  const wrongCreature = (option: RotationOption | undefined) => {
    const types = option?.kind === 'toggle' ? option.needsCreatureType : undefined
    const creature = config.fight.creatureType
    return types && creature !== undefined && !types.includes(creature) ? types : undefined
  }
  // A switch applies while it's on, its consumable is selected, any execute phase or creature type
  // it needs is there, and the switch it depends on applies.
  const applies = (id: string, depth = 0): boolean => {
    const option = byId.get(id)
    if (!option || depth > options.length) return false
    if (Boolean(values[id]) === false || missing(option) || noPhase(option) || wrongCreature(option)) return false
    return option.dependsOn === undefined || applies(option.dependsOn, depth + 1)
  }
  const rows = new Map<string, RowState>()
  for (const option of options) {
    const { [option.id]: saved, ...others } = rotation
    const def = saved === undefined ? values[option.id] : rotationValues({ spec, talents, rotation: others })[option.id]
    const missingBuff = missing(option)
    const notUsed = unused[option.id]
    const needsCreature = wrongCreature(option)
    rows.set(option.id, {
      value: values[option.id],
      default: def,
      changed: saved !== undefined && saved !== def,
      missingBuff,
      on: Boolean(values[option.id]) && missingBuff === undefined,
      ...(notUsed !== undefined ? { notUsed } : {}),
      ...(needsCreature ? { needsCreature } : {}),
      // An unused setting dims itself only: the settings under it may be how to use it (Rake's
      // "only when nothing else bleeds"). One the fight rules out dims what depends on it too.
      inactive:
        notUsed !== undefined ||
        noPhase(option) ||
        needsCreature !== undefined ||
        [option.dependsOn, option.kind === 'number' ? option.alsoDependsOn : undefined].some((id) => id !== undefined && !applies(id)),
    })
  }
  return rows
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** A value as the row's default hint reads it: "on", "40 rage", "3 s left", "Battle", "65% mana", "1,500 mana". */
export function formatSetting(option: RotationOption, value: RotationValue): string {
  if (option.kind === 'toggle') return value ? 'on' : 'off'
  if (option.kind === 'choice') return option.choices.find((c) => c.value === value)?.label ?? String(value)
  // A percentage sits against its number; thousands are grouped, as the rest of the app writes them.
  return `${NUMBER.format(Number(value))}${option.unit === '' || option.unit.startsWith('%') ? '' : ' '}${option.unit}`
}

/** Whether a number setting's field groups thousands ("1,500"): one whose range reaches them. */
export const groupsThousands = (option: RotationOption) => option.kind === 'number' && option.max >= 1000
