import { ChevronRight, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { announce } from '@/app/announce'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { NumberField } from '@/components/number-field'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { buffSwitchId } from '@/features/buffs/ids'
import { CREATURE_TYPES, openCreatureType } from '@/features/fight/ids'
import { ChangedHint, LINK_HIT_AREA } from '@/features/changed-hint'
import { changeAndFocus } from '@/features/refocus'
import { EmptyState } from '@/features/empty-state'
import { SectionHeader } from '@/features/section'
import { CHOICE_ITEM, CHOICE_ITEM_INACTIVE } from '@/lib/choice'
import { cn } from '@/lib/utils'
import { getSpec, rotationGroups, unusedRotationSettings, type RotationGroup, type RotationOption, type RotationValue } from '@/sim'
import { formatSetting, groupsThousands, isAdvanced, rotationRows, type RowState } from './logic'

/** What every row needs: its state, and setting or resetting a value. */
interface RowContext {
  rows: Map<string, RowState>
  set: (id: string, value: RotationValue) => void
  reset: (id: string) => void
}

const rowIds = (id: string) => ({
  control: `rot-${id}`,
  label: `rot-${id}-label`,
  help: `rot-${id}-help`,
  default: `rot-${id}-default`,
  missing: `rot-${id}-missing`,
  notUsed: `rot-${id}-not-used`,
  creature: `rot-${id}-creature`,
})

/** A setting's control as it is now: its switch or input, or a choice's selected option. */
const controlOf = (option: RotationOption) => {
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
const INACTIVE_SWITCH = 'data-checked:bg-muted-foreground'

export function RotationSection() {
  const meta = useSpecMeta()
  const rotation = useSetup((s) => s.config.rotation)
  const talents = useSetup((s) => s.config.talents)
  const enabledBuffs = useSetup((s) => s.config.buffs.enabled)
  const executePct = useSetup((s) => s.config.fight.executePct)
  const race = useSetup((s) => s.config.race)
  const raid = useSetup((s) => s.config.buffs.raid)
  const creatureType = useSetup((s) => s.config.fight.creatureType)
  const update = useSetup((s) => s.update)
  const spec = getSpec(meta.id)
  const options = spec.rotationOptions
  // Each setting's value, its default for this setup (a default can follow the talents or another
  // setting), whether it's changed, and whether it can apply: the execute phase's settings need one
  // under Fight, and Exorcism an Undead or Demon target (docs/ux.md "Rotation").
  // A setting the rest of the setup leaves unused says why: the race's, or the raid's (docs/ux.md "Rotation").
  const rows = useMemo(() => {
    const unused = unusedRotationSettings({ spec: meta.id, talents, rotation, race, buffs: { raid, enabled: enabledBuffs } })
    return rotationRows({ spec: meta.id, talents, rotation, fight: { executePct, creatureType } }, options, enabledBuffs, unused)
  }, [meta.id, talents, rotation, executePct, creatureType, options, enabledBuffs, race, raid])
  const ctx: RowContext = {
    rows,
    set: (id, value) => update((c) => ({ ...c, rotation: { ...c.rotation, [id]: value } })),
    reset: (id) =>
      update((c) => {
        const { [id]: _, ...rest } = c.rotation
        return { ...c, rotation: rest }
      }),
  }
  // The few settings without a heading (Arms' stance) come first, then each heading's settings in
  // the spec's priority order (docs/ux.md "Rotation").
  const ungrouped = options.filter((o) => o.group === undefined)
  const groups = rotationGroups.map((group) => ({ group, options: options.filter((o) => o.group === group) })).filter((g) => g.options.length > 0)
  // No visible notice: the settings change in front of you, and screen readers hear it
  // (src/app/announce.ts). The button disables itself, so focus moves on to the first setting, the
  // next control after it, rather than falling to the page (docs/ux.md#accessibility).
  const resetAll = () => {
    // Headings' thresholds may be hidden behind Advanced; their switches never are.
    const first = [...ungrouped, ...groups.flatMap((g) => g.options.filter((o) => !isAdvanced(o)))][0]
    changeAndFocus(
      () => update((c) => ({ ...c, rotation: {} })),
      () => first && controlOf(first),
    )
    announce('Rotation settings reset to their defaults.')
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Rotation"
        description={['Which abilities the sim uses, and when.', spec.rotationDefaults].filter(Boolean).join(' ')}
        action={
          <Button variant="ghost" className="h-11 shrink-0" disabled={Object.keys(rotation).length === 0} onClick={resetAll}>
            <RotateCcw /> Reset rotation
          </Button>
        }
      />
      {options.length === 0 ? (
        <EmptyState title="No rotation options yet">{meta.name} options come with its simulation.</EmptyState>
      ) : (
        <>
          {ungrouped.length > 0 && <OptionList options={ungrouped} ctx={ctx} />}
          {groups.map(({ group, options: grouped }) => (
            // Keyed by spec, so a switch of spec starts each heading's disclosure afresh.
            <GroupSection key={`${meta.id}:${group}`} group={group} options={grouped} ctx={ctx} />
          ))}
        </>
      )}
    </div>
  )
}

/**
 * One heading's settings. Its switches are always in view; its thresholds wait behind the
 * heading's Advanced button and appear in place, under the switch they tune. A heading opens by
 * itself when one of them differs from its default, and its button counts them (docs/ux.md
 * principle 2 and "Rotation").
 */
function GroupSection({ group, options, ctx }: { group: RotationGroup; options: RotationOption[]; ctx: RowContext }) {
  const advanced = options.filter(isAdvanced)
  const changed = advanced.filter((o) => ctx.rows.get(o.id)?.changed).length
  const [open, setOpen] = useState(changed > 0)
  const headingId = `rot-group-${group.toLowerCase().replace(/\W+/g, '-')}`
  const shown = open ? options : options.filter((o) => !isAdvanced(o))
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h3 id={headingId} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {group}
        </h3>
        {advanced.length > 0 && (
          <Button
            variant="ghost"
            className="h-11 px-3"
            aria-expanded={open}
            aria-label={`Advanced settings for ${group}${changed > 0 ? `, ${changed} changed` : ''}`}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
            Advanced
            {changed > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                {changed} changed
              </span>
            )}
          </Button>
        )}
      </div>
      <OptionList options={shown} all={options} ctx={ctx} />
    </section>
  )
}

/**
 * Settings in a card. A setting that depends on another under the same heading sits under it,
 * indented on a rule (docs/ux.md "Rotation"). `all` is every setting under the heading, shown or
 * not, so a hidden parent's children don't come up to the top level.
 */
function OptionList({ options, all = options, ctx }: { options: RotationOption[]; all?: RotationOption[]; ctx: RowContext }) {
  const ids = new Set(all.map((o) => o.id))
  const childrenOf = (id: string) => options.filter((o) => o.dependsOn === id)
  const renderChildren = (id: string) => {
    const children = childrenOf(id)
    if (children.length === 0) return null
    return (
      <ul className="mb-2 ml-4 flex flex-col border-l">
        {children.map((child) => (
          <li key={child.id}>
            <OptionRow option={child} ctx={ctx} nested />
            {renderChildren(child.id)}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
      {options
        .filter((o) => o.dependsOn === undefined || !ids.has(o.dependsOn))
        .map((option) => (
          <li key={option.id}>
            <OptionRow option={option} ctx={ctx} />
            {renderChildren(option.id)}
          </li>
        ))}
    </ul>
  )
}

function OptionRow({ option, ctx, nested = false }: { option: RotationOption; ctx: RowContext; nested?: boolean }) {
  const row = ctx.rows.get(option.id)!
  const pad = nested ? 'px-4 py-3' : 'p-4'
  if (option.kind === 'toggle') return <ToggleRow option={option} row={row} ctx={ctx} nested={nested} />
  const ids = rowIds(option.id)
  return (
    <div
      data-inactive={row.inactive || undefined}
      className={cn(
        // Number inputs and choices go under their label on a phone.
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        pad,
        // Room for the Reset's hit area below its line, clear of the control under it on a phone
        // and of the next row (LINK_HIT_AREA).
        row.changed && 'gap-5 pb-5 sm:gap-3',
        // Dimmed by colour, never opacity, so its text stays AA (docs/ux.md "Visual language").
        row.inactive && 'text-muted-foreground',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <label id={ids.label} htmlFor={option.kind === 'choice' ? undefined : ids.control} className="text-sm font-medium">
          {option.label}
        </label>
        <p id={ids.help} className="text-xs text-muted-foreground">
          {option.help}
        </p>
        {row.changed && <DefaultHint option={option} row={row} ctx={ctx} className="mt-1" />}
      </div>
      {option.kind === 'choice' ? (
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby={ids.label}
          aria-describedby={[ids.help, row.changed && ids.default].filter(Boolean).join(' ')}
          value={String(row.value)}
          onValueChange={(v) => v && ctx.set(option.id, v)}
          className="w-full shrink-0 sm:w-auto"
        >
          {option.choices.map((choice) => (
            <ToggleGroupItem key={choice.value} value={choice.value} className={cn('h-11 flex-1 px-4 sm:flex-none', CHOICE_ITEM, row.inactive && CHOICE_ITEM_INACTIVE)}>
              {choice.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <NumberField
          id={ids.control}
          value={Number(row.value)}
          onChange={(v) => ctx.set(option.id, v)}
          min={option.min}
          max={option.max}
          step={option.step}
          unit={option.unit}
          grouping={groupsThousands(option)}
          aria-label={option.label}
          aria-describedby={[ids.help, row.changed && ids.default].filter(Boolean).join(' ')}
        />
      )}
    </div>
  )
}

/** "Undead or Demon": the creature types a switch needs, as the Fight tab names them. */
const creatureList = (types: readonly string[]) => {
  const names = types.map((t) => CREATURE_TYPES.find((c) => c.value === t)?.label ?? t)
  return names.length < 3 ? names.join(' or ') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
}

/** A small link with a 44 px hit area around it, like a row's Reset (LINK_HIT_AREA). */
const NOTE_LINK = cn('rounded-sm font-medium text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', LINK_HIT_AREA)

/**
 * A switch row. The whole row is its label, so any tap on it flips the switch (a 44 px target, as
 * on the Buffs tab). A consumable whose Buffs switch is off shows its own switch off and locked,
 * with a note saying why; a switch that needs another creature type is dimmed, with a note that
 * links to Fight. The notes sit outside the label, since they have buttons.
 */
function ToggleRow({ option, row, ctx, nested }: { option: Extract<RotationOption, { kind: 'toggle' }>; row: RowState; ctx: RowContext; nested: boolean }) {
  const setSection = useSetup((s) => s.setSection)
  const ids = rowIds(option.id)
  const notes = row.missingBuff !== undefined || row.notUsed !== undefined || row.needsCreature !== undefined || row.changed
  return (
    // Dimmed by colour, never opacity, so its text stays AA (docs/ux.md "Visual language").
    <div data-inactive={row.inactive || undefined} className={cn(row.inactive && 'text-muted-foreground')}>
      <label
        className={cn(
          'flex min-h-14 items-center gap-4 px-4',
          nested ? 'py-3' : 'py-4',
          notes && 'pb-0',
          row.missingBuff ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span id={ids.label} className="text-sm font-medium">
            {option.label}
          </span>
          <span id={ids.help} className="text-xs text-muted-foreground">
            {option.help}
          </span>
        </span>
        <Switch
          id={ids.control}
          checked={row.on}
          disabled={row.missingBuff !== undefined}
          className={cn(row.inactive && INACTIVE_SWITCH)}
          aria-labelledby={ids.label}
          aria-describedby={[ids.help, row.missingBuff && ids.missing, row.notUsed && ids.notUsed, row.needsCreature && ids.creature, row.changed && ids.default].filter(Boolean).join(' ')}
          onCheckedChange={(on) => ctx.set(option.id, on)}
        />
      </label>
      {notes && (
        // Spaced so each link's hit area (LINK_HIT_AREA: 10 px above its line, 18 px below) stays
        // clear of the row's label, of the other link, and of the next row.
        <div className={cn('flex flex-col px-4 pt-3 pb-5', (row.missingBuff || row.needsCreature) && row.changed ? 'gap-6' : 'gap-2')}>
          {row.missingBuff && (
            <p id={ids.missing} className="text-xs text-muted-foreground">
              Not used: turn on {row.missingBuff.name} in{' '}
              <button
                type="button"
                className={NOTE_LINK}
                onClick={() => {
                  // Opens Buffs on that consumable's switch, so the next key press turns it on.
                  const buff = row.missingBuff!.id
                  changeAndFocus(
                    () => setSection('buffs'),
                    () => document.getElementById(buffSwitchId(buff)),
                  )
                }}
              >
                Buffs
              </button>{' '}
              first.
            </p>
          )}
          {row.notUsed && (
            <p id={ids.notUsed} className="text-xs text-muted-foreground">
              {row.notUsed}
            </p>
          )}
          {row.needsCreature && (
            <p id={ids.creature} className="text-xs text-muted-foreground">
              Not used: set Creature type to {creatureList(row.needsCreature)} in{' '}
              <button type="button" className={NOTE_LINK} onClick={() => openCreatureType(setSection)}>
                Fight
              </button>
              .
            </p>
          )}
          {row.changed && <DefaultHint option={option} row={row} ctx={ctx} />}
        </div>
      )}
    </div>
  )
}

/** Marks a changed setting with its default and a reset for this row alone (docs/ux.md "Rotation"). */
function DefaultHint({ option, row, ctx, className }: { option: RotationOption; row: RowState; ctx: RowContext; className?: string }) {
  return (
    <ChangedHint
      id={rowIds(option.id).default}
      label={option.label}
      value={formatSetting(option, row.default)}
      onReset={() =>
        changeAndFocus(
          () => ctx.reset(option.id),
          () => controlOf(option),
        )
      }
      className={className}
    />
  )
}
