// A rotation setting's row on the Rotation tab (docs/ux.md "Rotation"): a switch, a number with its
// unit or a choice, with its help, its notes ("Not used: …") and, once changed, its default and a
// Reset. The tab's headings (rotation-section.tsx) and a priority-list row's settings
// (priority-list.tsx) both render settings with these.
import { type ReactNode } from 'react'
import { useSetup } from '@/app/setup-store'
import { NumberField } from '@/components/number-field'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { buffSwitchId } from '@/features/buffs/ids'
import { CREATURE_TYPES, openCreatureType } from '@/features/fight/ids'
import { ChangedHint, LINK_HIT_AREA } from '@/features/changed-hint'
import { changeAndFocus } from '@/features/refocus'
import { CHOICE_ITEM, CHOICE_ITEM_INACTIVE } from '@/lib/choice'
import { cn } from '@/lib/utils'
import type { FixedRotationRow, RotationOption } from '@/sim'
import { controlOf, INACTIVE_SWITCH, rowIds, type RowContext } from './ids'
import { formatSetting, groupsThousands, type RowState, unitFor } from './logic'

/**
 * Settings in a card. A setting that depends on another under the same heading sits under it,
 * indented on a rule (docs/ux.md "Rotation"). `all` is every setting under the heading, shown or
 * not, so a hidden parent's children don't come up to the top level. `fixed` rows, what the spec
 * always does, come first, with no control. `stacked` puts every number and choice under its label,
 * for a narrow panel (a priority-list row's settings beside the list); `flow` puts the rows in two
 * columns on a wide setup pane.
 */
export function OptionList({
  options,
  all = options,
  fixed = [],
  ctx,
  stacked = false,
  flow = false,
  rowSwitch,
}: {
  options: RotationOption[]
  all?: RotationOption[]
  fixed?: FixedRotationRow[]
  ctx: RowContext
  stacked?: boolean
  /**
   * The tab's spec-wide settings above the list: from a 53 rem setup pane (every width from 1440 px,
   * where the pane is a container and 55 rem, 54 beside a classic scrollbar), their rows flow into
   * two columns, as the Buffs tab's groups do, so a switch isn't a whole pane's width from its name
   * (docs/ux.md "Rotation", DB-5).
   */
  flow?: boolean
  /**
   * A priority-list row's switch, in its settings: named "Use Battle Shout" rather than by its
   * label, so it isn't a second switch with the list row's name beside it (docs/ux.md "Rotation").
   */
  rowSwitch?: string
}) {
  const ids = new Set(all.map((o) => o.id))
  const childrenOf = (id: string) => options.filter((o) => o.dependsOn === id)
  const renderChildren = (id: string) => {
    const children = childrenOf(id)
    if (children.length === 0) return null
    return (
      <ul className="mb-2 ml-4 flex flex-col border-l">
        {children.map((child) => (
          <li key={child.id}>
            <OptionRow option={child} ctx={ctx} nested stacked={stacked} flow={flow} rowSwitch={rowSwitch} />
            {renderChildren(child.id)}
          </li>
        ))}
      </ul>
    )
  }
  const top = [
    ...fixed.map((row) => ({ key: row.id, node: <FixedRow row={row} /> })),
    ...options
      .filter((o) => o.dependsOn === undefined || !ids.has(o.dependsOn))
      .map((option) => ({
        key: option.id,
        node: (
          <>
            <OptionRow option={option} ctx={ctx} stacked={stacked} flow={flow} rowSwitch={rowSwitch} />
            {renderChildren(option.id)}
          </>
        ),
      })),
  ]
  return (
    <ul className={cn('flex flex-col divide-y overflow-hidden rounded-xl border', flow && '@min-[53rem]/setup:grid @min-[53rem]/setup:grid-cols-2 @min-[53rem]/setup:divide-y-0')}>
      {top.map(({ key, node }, i) => (
        <li key={key} className={flow ? flowCell(i, top.length) : undefined}>
          {node}
        </li>
      ))}
    </ul>
  )
}

/**
 * A top-level row's place in a card that flows its rows into two columns (OptionList's `flow`):
 * rules between rows and columns, and a last row alone on its line takes both columns, so the card
 * has no hole. Its dependent settings stay under it, in its cell.
 */
function flowCell(i: number, count: number): string {
  const spans = i === count - 1 && i % 2 === 0
  return cn(i >= 2 && '@min-[53rem]/setup:border-t', spans ? '@min-[53rem]/setup:col-span-2' : i % 2 === 0 && '@min-[53rem]/setup:border-r')
}

/**
 * Something the spec always does (a Protection paladin's Righteous Fury): a row like a switch's,
 * with what it is in place of the switch, which there's no point offering.
 */
function FixedRow({ row }: { row: FixedRotationRow }) {
  const ids = rowIds(row.id)
  return (
    <div className="flex min-h-14 items-center gap-4 p-4">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={ids.label} className="text-sm font-medium">
          {row.label}
        </span>
        <span id={ids.help} className="text-xs text-muted-foreground">
          {row.help}
        </span>
      </span>
      <span id={ids.control} className="shrink-0 text-sm text-muted-foreground">
        {row.value}
      </span>
    </div>
  )
}

function OptionRow({
  option,
  ctx,
  nested = false,
  stacked = false,
  flow = false,
  rowSwitch,
}: {
  option: RotationOption
  ctx: RowContext
  nested?: boolean
  stacked?: boolean
  /**
   * In a card whose rows flow into two columns (OptionList's `flow`): there a choice's options go
   * under its label, sharing the cell's width, since half the pane beside them would squeeze its
   * help to a word a line (docs/ux.md "Rotation").
   */
  flow?: boolean
  rowSwitch?: string
}) {
  const row = ctx.rows.get(option.id)!
  const flowStack = flow && option.kind === 'choice'
  const pad = nested ? 'px-4 py-3' : 'p-4'
  if (option.kind === 'toggle') return <ToggleRow option={option} row={row} ctx={ctx} nested={nested} name={option.id === rowSwitch ? `Use ${option.label}` : undefined} />
  const ids = rowIds(option.id)
  return (
    <div
      data-inactive={row.inactive || undefined}
      className={cn(
        // Number inputs and choices go under their label on a phone, and in a narrow panel.
        'flex flex-col gap-3',
        !stacked && 'sm:flex-row sm:items-center sm:justify-between',
        flowStack && '@min-[53rem]/setup:flex-col @min-[53rem]/setup:items-stretch',
        pad,
        // Room for the Reset's hit area below its line, clear of the control under it on a phone
        // and of the next row (LINK_HIT_AREA).
        row.changed && (stacked ? 'gap-5 pb-5' : 'gap-5 pb-5 sm:gap-3'),
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
        {/* A setting the rest of the setup leaves unused says why, as a switch does (the Balance filler under Eclipse). */}
        {row.notUsed && (
          <p id={ids.notUsed} className="mt-1 text-xs text-muted-foreground">
            {row.notUsed}
          </p>
        )}
        {row.changed && <DefaultHint option={option} row={row} ctx={ctx} className="mt-1" />}
      </div>
      {option.kind === 'choice' ? (
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby={ids.label}
          aria-describedby={[ids.help, row.notUsed && ids.notUsed, row.changed && ids.default].filter(Boolean).join(' ')}
          value={String(row.value)}
          onValueChange={(v) => v && ctx.set(option.id, v)}
          // Its options share the line equally while their names fit, and wrap to another line
          // where they don't (a phone, the desktop panel beside the list); four sit two to a line
          // on a phone, so a line never holds three and one. No name is ever clipped, nor the page
          // scrolled sideways (docs/ux.md "Layout"; e2e/rotation-choices-fit.spec.ts).
          className={cn('w-full shrink-0 flex-wrap', !stacked && 'sm:w-auto sm:flex-nowrap', flowStack && '@min-[53rem]/setup:w-full @min-[53rem]/setup:flex-wrap')}
        >
          {option.choices.map((choice) => (
            <ToggleGroupItem
              key={choice.value}
              value={choice.value}
              className={cn(
                'h-11 min-w-fit flex-1 px-4',
                option.choices.length === 4 && 'max-[27rem]:basis-[calc(50%-0.25rem)]',
                !stacked && 'sm:flex-none',
                flowStack && '@min-[53rem]/setup:flex-1',
                CHOICE_ITEM,
                row.inactive && CHOICE_ITEM_INACTIVE,
              )}
            >
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
          unit={unitFor(option.unit, Number(row.value))}
          grouping={groupsThousands(option)}
          aria-label={option.label}
          aria-describedby={[ids.help, row.notUsed && ids.notUsed, row.changed && ids.default].filter(Boolean).join(' ')}
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
function ToggleRow({
  option,
  row,
  ctx,
  nested,
  name,
}: {
  option: Extract<RotationOption, { kind: 'toggle' }>
  row: RowState
  ctx: RowContext
  nested: boolean
  /** Its accessible name, when not its label (a priority-list row's switch: "Use Battle Shout"). */
  name?: string
}) {
  const setSection = useSetup((s) => s.setSection)
  const ids = rowIds(option.id)
  const locked = row.missingBuff !== undefined || row.unmet !== undefined
  const notes = locked || row.notUsed !== undefined || row.needsCreature !== undefined || row.changed
  return (
    // Dimmed by colour, never opacity, so its text stays AA (docs/ux.md "Visual language").
    <div data-inactive={row.inactive || undefined} className={cn(row.inactive && 'text-muted-foreground')}>
      <label
        className={cn(
          'flex min-h-14 items-center gap-4 px-4',
          nested ? 'py-3' : 'py-4',
          notes && 'pb-0',
          locked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50',
        )}
      >
        {/* A row's own switch in its settings panel, from 1440 px (where the setup pane is the
            container `setup`, so `@min-[0px]/setup:` means "in the wide layout"): the panel's heading
            already names the ability, with its place, so the switch's line is its help, at the
            label's size and colour, and the name stays for screen readers (docs/ux.md "Rotation"). */}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span id={ids.label} className={cn('text-sm font-medium', name !== undefined && '@min-[0px]/setup:sr-only')}>
            {option.label}
          </span>
          <span id={ids.help} className={cn('text-xs text-muted-foreground', name !== undefined && '@min-[0px]/setup:text-sm @min-[0px]/setup:text-inherit')}>
            {option.help}
          </span>
        </span>
        <Switch
          id={ids.control}
          checked={row.on}
          disabled={locked}
          className={cn(row.inactive && INACTIVE_SWITCH)}
          {...(name === undefined ? { 'aria-labelledby': ids.label } : { 'aria-label': name })}
          aria-describedby={[ids.help, locked && ids.missing, row.notUsed && ids.notUsed, row.needsCreature && ids.creature, row.changed && ids.default].filter(Boolean).join(' ')}
          onCheckedChange={(on) => ctx.set(option.id, on)}
        />
      </label>
      {notes && (
        // Spaced so each link's hit area (LINK_HIT_AREA: 10 px above its line, 18 px below) stays
        // clear of the row's label, of the other link, and of the next row.
        <div className={cn('flex flex-col px-4 pt-3 pb-5', (locked || row.needsCreature) && row.changed ? 'gap-6' : 'gap-2')}>
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
          {row.unmet && (
            <p id={ids.missing} className="text-xs text-muted-foreground">
              Not used: needs{' '}
              {row.unmet.talent !== undefined && (
                <>
                  the {row.unmet.talent} talent (
                  <SectionLink section="talents" onOpen={() => setSection('talents')}>
                    Talents
                  </SectionLink>
                  )
                </>
              )}
              {row.unmet.talent !== undefined && row.unmet.shield && ' and '}
              {row.unmet.shield && (
                <>
                  a shield (
                  <SectionLink section="gear" onOpen={() => setSection('gear')}>
                    Gear
                  </SectionLink>
                  )
                </>
              )}
              .
            </p>
          )}
          {row.changed && <DefaultHint option={option} row={row} ctx={ctx} />}
        </div>
      )}
    </div>
  )
}

/**
 * A small link that opens another setup tab and focuses where the fix is: Gear's off hand (a shield;
 * its main hand while a two-hander locks it), or the Talents panel. A 44 px hit area, like a row's Reset.
 */
function SectionLink({ section, onOpen, children }: { section: 'gear' | 'talents'; onOpen: () => void; children: ReactNode }) {
  const target = () =>
    section === 'gear'
      ? (document.querySelector<HTMLButtonElement>('[data-gear-slot="offHand"]:not(:disabled)') ?? document.querySelector<HTMLElement>('[data-gear-slot="mainHand"]'))
      : document.querySelector<HTMLElement>('[data-section="talents"]')
  return (
    <button
      type="button"
      className={cn('rounded-sm font-medium text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', LINK_HIT_AREA)}
      onClick={() => changeAndFocus(onOpen, target)}
    >
      {children}
    </button>
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
