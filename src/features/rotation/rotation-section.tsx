import { ChevronRight, RotateCcw } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { announce } from '@/app/announce'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { Button } from '@/components/ui/button'
import { changeAndFocus } from '@/features/refocus'
import { EmptyState } from '@/features/empty-state'
import { SectionHeader } from '@/features/section'
import { cn } from '@/lib/utils'
import { type FixedRotationRow, getSpec, rotationGroups, unusedRotationSettings, type RotationGroup, type RotationOption } from '@/sim'
import { COLUMNS, useRotationLayout } from './layout'
import { isAdvanced, rotationRows, withRotationOrder } from './logic'
import { APL_PRESET_TRIGGER_ID, controlOf, hasNamedPresets, type RowContext } from './ids'
import { OptionList } from './option-rows'
import { AplPresetPicker, PriorityList } from './priority-list'

export function RotationSection() {
  const meta = useSpecMeta()
  const rotation = useSetup((s) => s.config.rotation)
  const talents = useSetup((s) => s.config.talents)
  const enabledBuffs = useSetup((s) => s.config.buffs.enabled)
  const executePct = useSetup((s) => s.config.fight.executePct)
  const race = useSetup((s) => s.config.race)
  const raid = useSetup((s) => s.config.buffs.raid)
  const creatureType = useSetup((s) => s.config.fight.creatureType)
  const gear = useSetup((s) => s.config.gear)
  const rotationOrder = useSetup((s) => s.config.rotationOrder)
  const update = useSetup((s) => s.update)
  // From 1440 px the tab lays itself out in columns by its width (layout.ts).
  const rootRef = useRef<HTMLDivElement>(null)
  const layout = useRotationLayout(rootRef)
  const wide = layout !== 'narrow'
  const spec = getSpec(meta.id)
  const options = spec.rotationOptions
  // A priority-list spec (decision D31) shows its spec-wide settings under the headings, above the
  // list; the list's rows hold the rest.
  const apl = spec.rotationApl
  const headed = apl ? options.filter((o) => apl.specWide.includes(o.id)) : options
  // D28's tanks, whose named rotations are the list's presets.
  const namedPresets = apl !== undefined && hasNamedPresets(apl)
  // Each setting's value, its default for this setup (a default can follow the talents or another
  // setting), whether it's changed, and whether it can apply: the execute phase's settings need one
  // under Fight, Exorcism an Undead or Demon target, and Shield Slam its talent and a shield
  // (docs/ux.md "Rotation").
  // A setting the rest of the setup leaves unused says why: the race's, or the raid's (docs/ux.md "Rotation").
  const rows = useMemo(() => {
    const unused = unusedRotationSettings({ spec: meta.id, talents, rotation, race, buffs: { raid, enabled: enabledBuffs }, gear, rotationOrder })
    return rotationRows({ spec: meta.id, talents, rotation, race, gear, fight: { executePct, creatureType } }, options, enabledBuffs, unused)
  }, [meta.id, talents, rotation, gear, executePct, creatureType, options, enabledBuffs, race, raid, rotationOrder])
  const ctx: RowContext = {
    rows,
    setup: { spec: meta.id, talents, gear },
    set: (id, value) => update((c) => ({ ...c, rotation: { ...c.rotation, [id]: value } })),
    reset: (id) =>
      update((c) => {
        const { [id]: _, ...rest } = c.rotation
        return { ...c, rotation: rest }
      }),
  }
  // The few settings without a heading (Arms' stance) come first, then each heading's settings in
  // the spec's priority order (docs/ux.md "Rotation").
  const ungrouped = headed.filter((o) => o.group === undefined)
  const fixedRows = getSpec(meta.id).rotationFixed
  const groups = rotationGroups
    .map((group) => ({ group, options: headed.filter((o) => o.group === group), fixed: fixedRows.filter((f) => f.group === group) }))
    .filter((g) => g.options.length > 0 || g.fixed.length > 0)
  // No visible notice: the settings change in front of you, and screen readers hear it
  // (src/app/announce.ts). The button disables itself, so focus moves on to the first setting, the
  // next control after it, rather than falling to the page (docs/ux.md#accessibility).
  const resetAll = () => {
    // Headings' thresholds may be hidden behind Advanced; their switches never are.
    const first = [...ungrouped, ...groups.flatMap((g) => g.options.filter((o) => !isAdvanced(o)))][0]
    changeAndFocus(
      () => update((c) => withRotationOrder({ ...c, rotation: {} }, undefined)),
      // A tank's named rotations come first (the preset picker); a priority list with nothing above it: its first row.
      () =>
        namedPresets
          ? document.getElementById(APL_PRESET_TRIGGER_ID)
          : first
            ? controlOf(first)
            : document.querySelector<HTMLElement>('[data-apl-row] button'),
    )
    announce('Rotation settings reset to their defaults.')
  }

  // The spec-wide settings: the unheaded ones first (Arms' stance), then each heading's. From
  // 1440 px they're a column of their own, a setting a line with its numbers and choices under its
  // label, and every heading shows its thresholds: there's room, so there's no Advanced (docs/ux.md
  // principle 4 and "Rotation").
  const settings = (
    <>
      {ungrouped.length > 0 && <OptionList options={ungrouped} ctx={ctx} stacked={wide} />}
      {groups.map(({ group, options: grouped, fixed }) => (
        // Keyed by spec, so a switch of spec starts each heading's disclosure afresh.
        <GroupSection key={`${meta.id}:${group}`} group={group} options={grouped} fixed={fixed} ctx={ctx} wide={wide} />
      ))}
    </>
  )
  // D28's rotations as the list's presets: first on the tab, as a tank's priority choice always was;
  // from 1440 px first in the list's column, so the settings beside it never push the list down.
  const picker = namedPresets ? <AplPresetPicker apl={apl} wide={wide} /> : undefined

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      <SectionHeader
        title="Rotation"
        description={['Which abilities the sim uses, and when.', spec.rotationDefaults].filter(Boolean).join(' ')}
        action={
          <Button variant="ghost" className="h-11 shrink-0" disabled={Object.keys(rotation).length === 0 && rotationOrder === undefined} onClick={resetAll}>
            <RotateCcw /> Reset rotation
          </Button>
        }
      />
      {options.length === 0 ? (
        <EmptyState title="No rotation options yet">{meta.name} options come with its simulation.</EmptyState>
      ) : wide && apl ? (
        // From 1440 px (D34 as amended): the settings in a column on the left, the list at the top of
        // the next, and where a third fits, the selected row's settings beside the list (layout.ts).
        <div className={cn('grid items-start gap-6', COLUMNS[layout === 'three' ? 'three' : 'two'])}>
          <div className="flex min-w-0 flex-col gap-6">{settings}</div>
          {/* Keyed by spec, so a switch of spec starts with no row selected. */}
          <PriorityList key={meta.id} apl={apl} options={options} ctx={ctx} layout={layout} top={picker} />
        </div>
      ) : (
        <>
          {picker}
          {settings}
          {apl && <PriorityList key={meta.id} apl={apl} options={options} ctx={ctx} layout={layout} />}
        </>
      )}
    </div>
  )
}

/**
 * One heading's settings. Its switches are always in view; under 1440 px its thresholds wait behind
 * the heading's Advanced button and appear in place, under the switch they tune. A heading opens by
 * itself when one of them differs from its default, and its button counts them (docs/ux.md
 * principle 2 and "Rotation"). From 1440 px (`wide`) there's room, so every threshold shows and
 * there's no Advanced (principle 4), and the settings are a column's width, so each number and
 * choice goes under its label.
 */
function GroupSection({ group, options, fixed, ctx, wide }: { group: RotationGroup; options: RotationOption[]; fixed: FixedRotationRow[]; ctx: RowContext; wide: boolean }) {
  const advanced = wide ? [] : options.filter(isAdvanced)
  const changed = advanced.filter((o) => ctx.rows.get(o.id)?.changed).length
  const [open, setOpen] = useState(changed > 0)
  const headingId = `rot-group-${group.toLowerCase().replace(/\W+/g, '-')}`
  const shown = open || wide ? options : options.filter((o) => !isAdvanced(o))
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      {/* The 44 px line holds the Advanced button, where there is one. */}
      <div className={cn('flex items-center justify-between gap-3', !wide && 'min-h-11')}>
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
      <OptionList options={shown} all={options} fixed={fixed} ctx={ctx} stacked={wide} />
    </section>
  )
}

