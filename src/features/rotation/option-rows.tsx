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
import { formatSetting, groupsThousands, type RowState } from './logic'

/**
 * Settings in a card. A setting that depends on another under the same heading sits under it,
 * indented on a rule (docs/ux.md "Rotation"). `all` is every setting under the heading, shown or
 * not, so a hidden parent's children don't come up to the top level. `fixed` rows, what the spec
 * always does, come first, with no control. `stacked` puts every number and choice under its label,
 * for a narrow panel (a priority-list row's settings beside the list).
 */
export function OptionList({
  options,
  all = options,
  fixed = [],
  ctx,
  stacked = false,
}: {
  options: RotationOption[]
  all?: RotationOption[]
  fixed?: FixedRotationRow[]
  ctx: RowContext
  stacked?: boolean
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
            <OptionRow option={child} ctx={ctx} nested stacked={stacked} />
            {renderChildren(child.id)}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
      {fixed.map((row) => (
        <li key={row.id}>
          <FixedRow row={row} />
        </li>
      ))}
      {options
        .filter((o) => o.dependsOn === undefined || !ids.has(o.dependsOn))
        .map((option) => (
          <li key={option.id}>
            <OptionRow option={option} ctx={ctx} stacked={stacked} />
            {renderChildren(option.id)}
          </li>
        ))}
    </ul>
  )
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

function OptionRow({ option, ctx, nested = false, stacked = false }: { option: RotationOption; ctx: RowContext; nested?: boolean; stacked?: boolean }) {
  const row = ctx.rows.get(option.id)!
  const pad = nested ? 'px-4 py-3' : 'p-4'
  if (option.kind === 'toggle') return <ToggleRow option={option} row={row} ctx={ctx} nested={nested} />
  const ids = rowIds(option.id)
  return (
    <div
      data-inactive={row.inactive || undefined}
      className={cn(
        // Number inputs and choices go under their label on a phone, and in a narrow panel.
        'flex flex-col gap-3',
        !stacked && 'sm:flex-row sm:items-center sm:justify-between',
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
          className={cn('w-full shrink-0', !stacked && 'sm:w-auto')}
        >
          {option.choices.map((choice) => (
            <ToggleGroupItem key={choice.value} value={choice.value} className={cn('h-11 flex-1 px-4', !stacked && 'sm:flex-none', CHOICE_ITEM, row.inactive && CHOICE_ITEM_INACTIVE)}>
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
function ToggleRow({ option, row, ctx, nested }: { option: Extract<RotationOption, { kind: 'toggle' }>; row: RowState; ctx: RowContext; nested: boolean }) {
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
          disabled={locked}
          className={cn(row.inactive && INACTIVE_SWITCH)}
          aria-labelledby={ids.label}
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
