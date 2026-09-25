// What the Rotation tab shows for each setting (docs/ux.md "Rotation"): its value, its default for
// this setup, whether you've changed it, and whether it can apply at all.
import {
  type AplRow,
  buffCatalogue,
  isBelowRowNote,
  rotationValues,
  unmetRequirements,
  type BuffDefinition,
  type CreatureType,
  type RotationOption,
  type RotationValue,
  type SimConfig,
} from '@/sim'

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
  /** What else it needs that the setup lacks: its talent (Talents) or a shield (Gear); absent when it has them. */
  unmet?: { talent?: string; shield?: boolean }
  /** Whether a switch shows on: only while it's on, and any consumable, talent or shield it needs is there. */
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
  /**
   * Why a setting that's on still can't apply, when it's for want of something outside itself: it
   * needs an execute phase the fight hasn't, another creature type, or a switch it depends on is
   * off (or can't apply itself). A priority-list row says so in place of its summary
   * (`aplRowNote`). Absent while it applies, or while its own switch is off.
   */
  blockedBy?: Blocker
}

/** What keeps a setting from applying (`RowState.blockedBy`). */
export type Blocker = { kind: 'phase' } | { kind: 'creature' } | { kind: 'off'; label: string }

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
  config: Pick<SimConfig, 'spec' | 'talents' | 'rotation' | 'gear'> & Partial<Pick<SimConfig, 'race'>> & { fight: Pick<SimConfig['fight'], 'executePct'> & Partial<Pick<SimConfig['fight'], 'creatureType'>> },
  options: readonly RotationOption[],
  enabledBuffs: readonly string[],
  unused: Readonly<Record<string, string>> = {},
): Map<string, RowState> {
  const { spec, talents, rotation, race } = config
  const values = rotationValues({ spec, talents, rotation, race })
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
  /** The talent or shield it needs that the setup lacks (Shield Slam, Shield Block), or undefined. */
  const unmetOf = (option: RotationOption | undefined) => {
    if (option?.kind !== 'toggle' || option.requires === undefined) return undefined
    const unmet = unmetRequirements(config, option.requires)
    return unmet.talent !== undefined || unmet.shield ? unmet : undefined
  }
  /** The switches a setting depends on: the one it sits under, and one it needs too. */
  const parents = (option: RotationOption) => [option.dependsOn, option.kind !== 'choice' ? option.alsoDependsOn : undefined].filter((id) => id !== undefined)
  // A switch applies while it's on, its consumable is selected, any execute phase, creature type,
  // talent or shield it needs is there, and the switches it depends on apply (Bloodthirst in the
  // execute phase needs Execute and Bloodthirst).
  const applies = (id: string, depth = 0): boolean => {
    const option = byId.get(id)
    if (!option || depth > options.length) return false
    if (Boolean(values[id]) === false || missing(option) || noPhase(option) || wrongCreature(option) || unmetOf(option)) return false
    return parents(option).every((parent) => applies(parent, depth + 1))
  }
  /** Why a switch it depends on doesn't apply: the fight, or the first switch up the chain that's off. */
  const blocker = (id: string, depth = 0): Blocker | undefined => {
    const option = byId.get(id)
    if (!option || depth > options.length) return undefined
    if (noPhase(option)) return { kind: 'phase' }
    if (wrongCreature(option)) return { kind: 'creature' }
    if (Boolean(values[id]) === false || missing(option) || unmetOf(option)) return { kind: 'off', label: option.label }
    const parent = parents(option).find((p) => !applies(p))
    return parent === undefined ? undefined : blocker(parent, depth + 1)
  }
  const rows = new Map<string, RowState>()
  for (const option of options) {
    const { [option.id]: saved, ...others } = rotation
    const def = saved === undefined ? values[option.id] : rotationValues({ spec, talents, rotation: others, race })[option.id]
    const missingBuff = missing(option)
    const notUsed = unused[option.id]
    const needsCreature = wrongCreature(option)
    const unmet = unmetOf(option)
    const on = Boolean(values[option.id]) && missingBuff === undefined && unmet === undefined
    const blockedParent = parents(option).find((id) => !applies(id))
    const blockedBy: Blocker | undefined =
      notUsed !== undefined || !on
        ? undefined
        : noPhase(option)
          ? { kind: 'phase' }
          : needsCreature
            ? { kind: 'creature' }
            : blockedParent === undefined
              ? undefined
              : blocker(blockedParent)
    rows.set(option.id, {
      value: values[option.id],
      default: def,
      changed: saved !== undefined && saved !== def,
      missingBuff,
      ...(unmet ? { unmet } : {}),
      on,
      ...(notUsed !== undefined ? { notUsed } : {}),
      ...(needsCreature ? { needsCreature } : {}),
      // An unused setting dims itself only: the settings under it may be how to use it (Rake's
      // "only when nothing else bleeds"). One the fight rules out dims what depends on it too.
      inactive:
        notUsed !== undefined ||
        noPhase(option) ||
        needsCreature !== undefined ||
        blockedParent !== undefined,
      ...(blockedBy ? { blockedBy } : {}),
    })
  }
  return rows
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/**
 * The number settings' units that count something, each with its singular: "1 combo point",
 * "1 stack". Every other unit (mana, rage, Energy, Focus, AP, s, s left, %) reads the same at 1.
 */
export const UNIT_SINGULAR: Readonly<Record<string, string>> = {
  'combo points': 'combo point',
  stacks: 'stack',
  ticks: 'tick',
  casts: 'cast',
}

/** A number setting's unit as it reads after `value`: singular at exactly 1 ("1 combo point", "2 combo points"). */
export const unitFor = (unit: string, value: number) => (value === 1 ? (UNIT_SINGULAR[unit] ?? unit) : unit)

/** A value as the row's default hint and summary read it: "on", "40 rage", "3 s left", "Battle", "65% mana", "1,500 mana", "1 combo point". */
export function formatSetting(option: RotationOption, value: RotationValue): string {
  if (option.kind === 'toggle') return value ? 'on' : 'off'
  if (option.kind === 'choice') return option.choices.find((c) => c.value === value)?.label ?? String(value)
  // A percentage sits against its number; thousands are grouped, as the rest of the app writes them.
  const unit = unitFor(option.unit, Number(value))
  return `${NUMBER.format(Number(value))}${unit === '' || unit.startsWith('%') ? '' : ' '}${unit}`
}

/** Whether a number setting's field groups thousands ("1,500"): one whose range reaches them. */
export const groupsThousands = (option: RotationOption) => option.kind === 'number' && option.max >= 1000

/**
 * The parts of a priority-list row's summary that apply (`aplRowSummary`): a setting that can't
 * apply (its own switch is off) left out, or read as its `inactiveText`, and so is one a choice rules
 * out (`choiceIs`, `choiceIsNot`: no "between Auto Shots" with Neither) or the setup lacks what it
 * `requires` (the hunter's Trueshot Aura without its talent; without `setup`, such a part is left out).
 */
function summaryParts(
  row: AplRow,
  options: readonly RotationOption[],
  rows: ReadonlyMap<string, RowState>,
  setup?: Pick<SimConfig, 'spec' | 'talents' | 'gear'>,
): string[] {
  const byId = new Map(options.map((o) => [o.id, o]))
  const choiceIn = (choice: { option: string; values: readonly string[] }) => choice.values.includes(String(rows.get(choice.option)?.value))
  const parts: string[] = []
  for (const part of row.summary ?? []) {
    if (part.alsoOn?.some((id) => !rows.get(id)?.on || rows.get(id)?.inactive)) continue
    if (part.choiceIs && !choiceIn(part.choiceIs)) continue
    if (part.choiceIsNot && choiceIn(part.choiceIsNot)) continue
    if (part.requires) {
      const unmet = setup && unmetRequirements(setup, part.requires)
      if (!unmet || unmet.talent !== undefined || unmet.shield) continue
    }
    if (part.option === undefined) {
      parts.push(part.text)
      continue
    }
    const option = byId.get(part.option)
    const state = rows.get(part.option)
    if (!option || !state) continue
    if (state.inactive) {
      // A setting that can't apply says what happens instead, if its part knows (a warlock's filler without Incinerate).
      if (part.inactiveText !== undefined) parts.push(part.inactiveText)
      continue
    }
    if (option.kind === 'toggle') {
      if (Boolean(state.value) === (part.when ?? true)) parts.push(part.text)
    } else if (option.kind === 'number' && part.zeroText !== undefined && state.value === 0) {
      parts.push(part.zeroText)
    } else if (option.kind !== 'number' || part.hideWhen === undefined || state.value !== part.hideWhen) {
      parts.push(part.text.replace('{}', formatSetting(option, state.value)))
    }
  }
  return parts
}

/**
 * A priority-list row's one-line summary (docs/ux.md "Rotation"): "Off" while its switch is off;
 * otherwise its summary parts that apply ("From 40 rage · cancel below 20 rage", `summaryParts`);
 * "None" for a row without a switch that does nothing (the pre-pull with every part off).
 */
export function aplRowSummary(
  row: AplRow,
  options: readonly RotationOption[],
  rows: ReadonlyMap<string, RowState>,
  setup?: Pick<SimConfig, 'spec' | 'talents' | 'gear'>,
): string {
  if (row.enabledId !== undefined && !rows.get(row.enabledId)?.on) return 'Off'
  const text = summaryParts(row, options, rows, setup).join(' · ')
  if (text === '') return row.enabledId === undefined ? 'None' : ''
  return text[0].toUpperCase() + text.slice(1)
}

/**
 * The choice values that leave a row without a switch doing nothing while its lead setting is at
 * one: the Shock at None, Chain Lightning at Never, a warlock's Bane at None, the hunter's Neither.
 */
const NOTHING_CHOICES: readonly string[] = ['none', 'never']

/**
 * Why a row without a switch does nothing, in its lead setting's (its first's) note: the setup
 * leaves that setting unused, and no part of the summary says what the row does instead (a
 * warlock's filler without Incinerate still casts Shadow Bolt). Balance's Filler under Wrath for
 * Eclipse: "Not used: Wrath for Eclipse is on. …". A row below the spec's filler always shows its
 * note ("Below Lightning Bolt: cast only when Lightning Bolt can’t be.", `isBelowRowNote`), whatever
 * its summary says it does instead, so the row and its setting say the same and the row is dimmed.
 */
function switchlessNote(row: AplRow, rows: ReadonlyMap<string, RowState>): string | undefined {
  const lead = row.optionIds[0]
  const notUsed = lead === undefined ? undefined : rows.get(lead)?.notUsed
  if (notUsed === undefined) return undefined
  if (!isBelowRowNote(notUsed) && row.summary?.some((p) => p.option === lead && p.inactiveText !== undefined)) return undefined
  return notUsed
}

/**
 * Whether a row without a switch does nothing, so the list dims it as it does a row that's off
 * (docs/ux.md "Rotation"): its note says why (`aplRowNote`: Balance's Filler under Wrath for
 * Eclipse, or Chain Lightning below Lightning Bolt, even with a summary part's `inactiveText`), its lead setting is a choice of nothing (`NOTHING_CHOICES`: the Shock at None), or no
 * part of its summary applies (it reads "None": the pre-pull with every part off). False for a row
 * with a switch, which dims itself by its switch.
 */
export function aplRowIdle(
  row: AplRow,
  options: readonly RotationOption[],
  rows: ReadonlyMap<string, RowState>,
  setup?: Pick<SimConfig, 'spec' | 'talents' | 'gear'>,
): boolean {
  if (row.enabledId !== undefined) return false
  if (switchlessNote(row, rows) !== undefined) return true
  const lead = options.find((o) => o.id === row.optionIds[0])
  if (lead?.kind === 'choice' && NOTHING_CHOICES.includes(String(rows.get(lead.id)?.value))) return true
  return summaryParts(row, options, rows, setup).length === 0
}

/**
 * What a priority-list row says in place of its summary when it's on but can't do anything
 * (docs/ux.md "Rotation"): the setup leaves it unused, it needs a consumable, a talent or a shield,
 * an execute phase or another creature type (the Fight tab), or a switch it depends on is off
 * ("Not used: Bloodthirst is off."). A row without a switch says why the setup leaves it nothing to
 * do (`switchlessNote`). Undefined while it can apply, or while it's off.
 */
export function aplRowNote(row: AplRow, rows: ReadonlyMap<string, RowState>): string | undefined {
  if (row.enabledId === undefined) return switchlessNote(row, rows)
  const state = rows.get(row.enabledId)
  if (!state) return undefined
  if (state.notUsed !== undefined) return state.notUsed
  if (state.missingBuff) return `Not used: turn on ${state.missingBuff.name} in Buffs first.`
  // What the row's settings say with links (Buffs, Talents, Gear), said here in words.
  const unmet = state.unmet && [state.unmet.talent !== undefined && `the ${state.unmet.talent} talent`, state.unmet.shield && 'a shield'].filter(Boolean).join(' and ')
  if (unmet) return `Not used: needs ${unmet}.`
  switch (state.blockedBy?.kind) {
    case 'phase':
      return 'Not used: needs an execute phase (Fight tab).'
    case 'creature':
      return 'Not used: needs another creature type (Fight tab).'
    case 'off':
      return `Not used: ${state.blockedBy.label} is off.`
    default:
      return undefined
  }
}

/** A row's settings (its switch and its own) that differ from their defaults, so the list marks the row. */
export const aplRowChanged = (row: AplRow, rows: ReadonlyMap<string, RowState>) =>
  [row.enabledId, ...row.optionIds].some((id) => id !== undefined && rows.get(id)?.changed)

/**
 * The config with a priority list's order stored, or cleared while it's the default (`stored`
 * undefined), after `rotation` as normalizeConfig puts it, so a setup's JSON reads the same either way.
 */
export function withRotationOrder(config: SimConfig, stored: string[] | undefined): SimConfig {
  const { fight, rules, run, rotationOrder: _, ...head } = config
  return { ...head, ...(stored ? { rotationOrder: stored } : {}), fight, rules, run }
}
