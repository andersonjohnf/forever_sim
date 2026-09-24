// The Rotation tab's priority list (decision D31, docs/ux.md "Rotation"): the spec's rows in the
// order the sim tries them, each with a drag handle, an icon, its name and a one-line summary, and
// a switch. Selecting a row opens its settings: beside the list on desktop (≥ 1024 px), in a sheet
// below that. A row moves by its handle (a pointer, or the keyboard: Space, the arrow keys, Space),
// or with Move up and Move down in its settings. Pinned rows (the pre-pull) show a lock and don't
// move, and nothing moves past them. Above the list, the preset picker ("Custom" once you've
// edited it) and Reset order; a spec with named rotations (D28's tanks) has its picker at the top
// of the tab instead (`AplPresetPicker`), with a line on what the chosen one plays and an info
// button with every preset's full help.
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, GripVertical, Info, Lock, RotateCcw } from 'lucide-react'
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { announce } from '@/app/announce'
import { DrawerCloseButton } from '@/app/drawer-close-button'
import { useSheetFocus } from '@/app/sheet-focus'
import { useSetup } from '@/app/setup-store'
import { SelectContent } from '@/components/select-content'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { WowIcon } from '@/components/wow-icon'
import { useIsDesktop } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import {
  type AplDefinition,
  type AplRow,
  aplPresets,
  applyAplPreset,
  CUSTOM_APL_PRESET,
  DEFAULT_APL_PRESET,
  moveAplRow,
  normalizeAplOrder,
  type RotationOption,
  rotationPreset,
  storedAplOrder,
} from '@/sim'
import { APL_PRESET_TRIGGER_ID, hasNamedPresets, INACTIVE_SWITCH, type RowContext } from './ids'
import { aplRowChanged, aplRowNote, aplRowSummary, withRotationOrder } from './logic'
import { OptionList } from './option-rows'

/** Element ids of a list row's parts. */
const listIds = (id: string) => ({
  row: `apl-${id}`,
  select: `apl-${id}-select`,
  label: `apl-${id}-label`,
  summary: `apl-${id}-summary`,
  changed: `apl-${id}-changed`,
  handle: `apl-${id}-handle`,
})

/** The desktop panel's heading, which takes focus when a row is selected. */
const PANEL_HEADING_ID = 'apl-settings-heading'

/** Which edges of the desktop panel have more of its settings past them (it scrolls when it's taller than the window). */
type Fade = 'none' | 'top' | 'bottom' | 'both'

/** Tracks a vertical scroller's position, so its edge fades show only where there's more to scroll to. */
function useVerticalFade(ref: RefObject<HTMLElement | null>, key: unknown): Fade {
  const [fade, setFade] = useState<Fade>('none')
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const top = el.scrollTop > 1
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
      setFade(top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : 'none')
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    // The window's height, and the settings' own (a note appears, a web font arrives), move the ends.
    const observer = new ResizeObserver(update)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [ref, key])
  return fade
}

/** Drags move rows up and down only. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** The preset the list matches, the presets, and picking one (docs/ux.md "Rotation": "Presets and Custom"). */
function useAplPresets(apl: AplDefinition) {
  const config = useSetup((s) => s.config)
  const update = useSetup((s) => s.update)
  const preset = rotationPreset(config)
  const presets = aplPresets(apl)
  const pick = (id: string) => {
    const picked = applyAplPreset(apl, config.rotation, id)
    if (!picked) return
    update((c) => withRotationOrder({ ...c, rotation: picked.rotation }, picked.rotationOrder))
    announce(`Rotation set to ${presets.find((p) => p.id === id)!.label}.`)
  }
  return { preset, presets, pick }
}

/**
 * The preset picker: "Custom" once the list matches none. With `triggerRef`, the list's own (a spec
 * without named rotations, beside Reset order); otherwise a spec's named rotations at the top of the
 * tab, under a heading, with what the chosen one plays and its default marked, as the Buffs tab's
 * presets are (docs/ux.md "Rotation").
 */
function PresetSelect({ apl, triggerRef, id, describedBy }: { apl: AplDefinition; triggerRef?: RefObject<HTMLButtonElement | null>; id?: string; describedBy?: string }) {
  const { preset, presets, pick } = useAplPresets(apl)
  const ownDefault = apl.presets.some((p) => p.id === DEFAULT_APL_PRESET)
  return (
    <Select value={preset === CUSTOM_APL_PRESET ? '' : (preset ?? '')} onValueChange={pick}>
      {/* The trigger's size attribute sets its height, so the 44 px target overrides that (docs/ux.md "Accessibility"). */}
      <SelectTrigger ref={triggerRef} id={id} className="min-w-0 flex-1 data-[size=default]:h-11 sm:max-w-64 sm:min-w-48" aria-label="Rotation preset" aria-describedby={describedBy}>
        <SelectValue placeholder="Custom" />
      </SelectTrigger>
      <SelectContent>
        {presets.map((p) => (
          <SelectItem key={p.id} value={p.id} className="min-h-11">
            {p.label}
            {ownDefault && p.id === DEFAULT_APL_PRESET && ' (default)'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * A spec's named rotations (D28: Defensive, Balanced and Max TPS), first on the tab as a tank's
 * priority choice always was: the picker, its info button, and under them one short line on the
 * chosen one (what it keeps and gives up, three lines at most on a phone), or that the list is
 * Custom. The info lists every preset with its full help and measured numbers, so they can be
 * compared before picking (docs/ux.md "Rotation").
 */
export function AplPresetPicker({ apl }: { apl: AplDefinition }) {
  const { preset, presets } = useAplPresets(apl)
  const helpId = useId()
  const infoTitleId = useId()
  const current = presets.find((p) => p.id === preset)
  const line = preset === CUSTOM_APL_PRESET ? 'Custom: the list matches none of the presets. Pick one to start again from it.' : (current?.summary ?? current?.help)
  return (
    <section aria-labelledby="apl-preset-heading" className="flex flex-col gap-2">
      <div className="flex min-h-11 items-center">
        <h3 id="apl-preset-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Preset
        </h3>
      </div>
      {/* In a row, so the trigger's flex-1 is its width, not its height. */}
      <div className="flex items-center gap-1">
        <PresetSelect apl={apl} id={APL_PRESET_TRIGGER_ID} describedBy={line ? helpId : undefined} />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="About the presets">
              <Info aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" collisionPadding={16} aria-labelledby={infoTitleId} className="flex max-h-(--radix-popover-content-available-height) w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto text-sm">
            <p id={infoTitleId} className="font-medium">
              The presets
            </p>
            <dl className="flex flex-col gap-3">
              {presets.map((p) => (
                <div key={p.id} className="flex flex-col gap-1">
                  <dt className="font-medium">
                    {p.label}
                    {p.id === DEFAULT_APL_PRESET && ' (default)'}
                  </dt>
                  <dd className="text-muted-foreground">{p.help}</dd>
                </div>
              ))}
            </dl>
          </PopoverContent>
        </Popover>
      </div>
      {line && (
        <p id={helpId} className="text-sm text-muted-foreground">
          {line}
        </p>
      )}
    </section>
  )
}

export function PriorityList({ apl, options, ctx }: { apl: AplDefinition; options: readonly RotationOption[]; ctx: RowContext }) {
  const config = useSetup((s) => s.config)
  const update = useSetup((s) => s.update)
  const desktop = useIsDesktop()
  const order = normalizeAplOrder(apl, config.rotationOrder)
  const byId = new Map(apl.rows.map((r) => [r.id, r]))
  const [selected, setSelected] = useState<string | null>(null)
  const selectedRow = selected === null ? undefined : byId.get(selected)
  const presetRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const fade = useVerticalFade(panelRef, selected)
  const helpId = useId()
  // A spec with named rotations has its picker at the top of the tab (AplPresetPicker).
  const pickerAbove = hasNamedPresets(apl)
  /** Selecting a row on desktop moves focus to its settings' heading, as the phone's sheet does (docs/ux.md "Rotation"). */
  const select = (id: string) => {
    if (!desktop) return setSelected(id)
    flushSync(() => setSelected(id))
    document.getElementById(PANEL_HEADING_ID)?.focus()
  }
  /** Back from the desktop panel to the selected row on the list. */
  const backToRow = () => {
    if (selected !== null) document.getElementById(listIds(selected).select)?.focus()
  }

  const position = (id: string) => order.indexOf(id) + 1
  const where = (id: string) => `position ${position(id)} of ${order.length}`
  const setOrder = (next: string[]) => update((c) => withRotationOrder(c, storedAplOrder(apl, next)))
  /** Moves a row to index `to`, and says so. False when it can't go there. */
  const move = (id: string, to: number): boolean => {
    const next = moveAplRow(apl, order, id, to)
    if (!next) return false
    flushSync(() => setOrder(next))
    announce(`${byId.get(id)!.label} moved to position ${to + 1} of ${order.length}.`)
    return true
  }

  const sensors = useSensors(
    // Only the handle starts a drag, so a few pixels of travel tell a drag from a tap.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const next = moveAplRow(apl, order, String(active.id), order.indexOf(String(over.id)))
    if (next) setOrder(next)
  }
  const labelOf = (id: string | number) => byId.get(String(id))?.label ?? String(id)

  // The rows between pinned rows move among themselves (normalizeAplOrder), each stretch its own
  // sortable list; a pinned row is a fixed row between them.
  const stretches: { pinned?: AplRow; rows: AplRow[] }[] = []
  for (const id of order) {
    const row = byId.get(id)!
    if (row.pinned || stretches.length === 0) stretches.push(row.pinned ? { pinned: row, rows: [] } : { rows: [row] })
    else stretches.at(-1)!.rows.push(row)
  }

  const resetOrder = () => {
    // Reset order disables itself, so focus moves to the preset picker first (docs/ux.md#accessibility),
    // or with the picker at the top of the tab, to the next control after it: the list's first row.
    if (pickerAbove) document.getElementById(listIds(order[0]).select)?.focus()
    else presetRef.current?.focus()
    setOrder(apl.rows.map((r) => r.id))
    announce('Priority list back in its default order.')
  }

  const settings = (row: AplRow, inSheet: boolean) => (
    <RowSettings
      row={row}
      options={options}
      ctx={ctx}
      position={position(row.id)}
      count={order.length}
      canMove={(delta) => moveAplRow(apl, order, row.id, order.indexOf(row.id) + delta) !== null}
      onMove={(delta) => move(row.id, order.indexOf(row.id) + delta)}
      inSheet={inSheet}
      onBack={backToRow}
    />
  )

  return (
    <section aria-labelledby="apl-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id="apl-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Priority list
        </h3>
        <p id={helpId} className="text-sm text-muted-foreground">
          Each global cooldown, the sim uses the first ability whose conditions hold. Drag a row by its handle to change the order, or select it for its settings.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!pickerAbove && <PresetSelect apl={apl} triggerRef={presetRef} />}
        <Button variant="ghost" className={cn('h-11 shrink-0', pickerAbove && '-ml-2 self-start')} disabled={config.rotationOrder === undefined} onClick={resetOrder}>
          <RotateCcw /> Reset order
        </Button>
      </div>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[vertical]}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable: 'To move this ability, press Space or Enter, move it with the Up and Down arrow keys, and press Space or Enter again to drop it, or Escape to cancel.',
            },
            announcements: {
              onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}, ${where(String(active.id))}.`,
              onDragOver: ({ active, over }) =>
                over ? `${labelOf(active.id)} is over position ${position(String(over.id))} of ${order.length}.` : `${labelOf(active.id)} is no longer over the list.`,
              onDragEnd: ({ active, over }) =>
                over && moveAplRow(apl, order, String(active.id), order.indexOf(String(over.id))) !== null
                  ? `${labelOf(active.id)} dropped at position ${position(String(over.id))} of ${order.length}.`
                  : `${labelOf(active.id)} dropped, still at ${where(String(active.id))}.`,
              onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled. It’s still at ${where(String(active.id))}.`,
            },
          }}
        >
          <ol aria-labelledby="apl-heading" aria-describedby={helpId} className="flex flex-col divide-y overflow-hidden rounded-xl border">
            {stretches.map((stretch, i) => (
              <StretchRows
                key={stretch.pinned?.id ?? `start-${i}`}
                stretch={stretch}
                render={(row, sortable) => (
                  <ListRow
                    key={row.id}
                    row={row}
                    options={options}
                    ctx={ctx}
                    position={position(row.id)}
                    selected={selected === row.id}
                    desktop={desktop}
                    sortable={sortable}
                    onSelect={() => select(row.id)}
                  />
                )}
              />
            ))}
          </ol>
        </DndContext>
        {desktop && (
          // Keyed by the row, so another row's settings start at their top. It reaches down to 1rem
          // above the window's bottom; taller settings scroll inside it, and a fade marks each edge
          // with more past it, as the tabs' does (docs/ux.md "Rotation"). Focus scrolls clear of
          // the fades. Escape goes back to the row on the list.
          <aside
            key={selected ?? 'none'}
            ref={panelRef}
            aria-label={selectedRow ? `${selectedRow.label} settings` : 'Ability settings'}
            data-fade={fade}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || e.defaultPrevented || selected === null) return
              e.preventDefault()
              backToRow()
            }}
            className="sticky top-[calc(var(--sticky-top,7rem)+1rem)] max-h-[calc(100svh-var(--sticky-top,7rem)-2rem)] scroll-py-12 overflow-y-auto data-[fade=both]:[mask-image:linear-gradient(to_bottom,transparent,black_2.5rem,black_calc(100%-2.5rem),transparent)] data-[fade=bottom]:[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)] data-[fade=top]:[mask-image:linear-gradient(to_top,black_calc(100%-2.5rem),transparent)]"
          >
            {selectedRow ? (
              settings(selectedRow, false)
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Select an ability in the list to see its settings here.</p>
            )}
          </aside>
        )}
      </div>
      {!desktop && (
        <RowSheet
          row={selectedRow}
          describe={(row) => (row.pinned ? `Fixed at ${where(row.id)}` : `At ${where(row.id)}`)}
          onClose={() => setSelected(null)}
          render={(row) => settings(row, true)}
        />
      )}
    </section>
  )
}

/** One stretch of the list: its pinned row, fixed, then its rows, which move among themselves. */
function StretchRows({ stretch, render }: { stretch: { pinned?: AplRow; rows: AplRow[] }; render: (row: AplRow, sortable: boolean) => ReactNode }) {
  return (
    <>
      {stretch.pinned && render(stretch.pinned, false)}
      <SortableContext items={stretch.rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        {stretch.rows.map((row) => render(row, true))}
      </SortableContext>
    </>
  )
}

/**
 * A row on the list: its handle (a lock for a pinned row), then a button with its icon, name and
 * summary that selects it, then its switch. Each is a 44 px target. A row with a changed setting
 * shows a dot after its name; a row that's off, or can't apply, is dimmed by colour.
 */
function ListRow({
  row,
  options,
  ctx,
  position,
  selected,
  desktop,
  sortable,
  onSelect,
}: {
  row: AplRow
  options: readonly RotationOption[]
  ctx: RowContext
  position: number
  selected: boolean
  desktop: boolean
  sortable: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: !sortable })
  const ids = listIds(row.id)
  const state = row.enabledId === undefined ? undefined : ctx.rows.get(row.enabledId)
  const locked = state?.missingBuff !== undefined || state?.unmet !== undefined
  const off = state !== undefined && !state.on
  const dim = off || state?.inactive === true
  const note = aplRowNote(row, ctx.rows)
  const summary = note ?? aplRowSummary(row, options, ctx.rows)
  const changed = aplRowChanged(row, ctx.rows)
  // Its name is its label; that it's changed, and its summary, are its description.
  const described = [changed && ids.changed, summary && ids.summary].filter(Boolean).join(' ') || undefined
  return (
    <li
      ref={setNodeRef}
      id={ids.row}
      data-apl-row={row.id}
      data-selected={selected || undefined}
      data-inactive={dim || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative flex min-h-16 items-center gap-1 bg-background pr-2',
        // Selected: a bar in the primary colour on its leading edge, so its dimmed text keeps AA on the page's background.
        selected && desktop && 'shadow-[inset_3px_0_0_var(--color-primary)]',
        isDragging && 'z-10 shadow-lg ring-2 ring-ring/50',
      )}
    >
      {sortable ? (
        <button
          ref={setActivatorNodeRef}
          id={ids.handle}
          type="button"
          className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          {...attributes}
          aria-label={`Move ${row.label}, position ${position}`}
          {...listeners}
        >
          <GripVertical className="size-5" aria-hidden />
        </button>
      ) : (
        <span className="grid size-11 shrink-0 place-items-center text-muted-foreground" title="Fixed in place">
          <Lock className="size-4" aria-hidden />
          <span className="sr-only">Fixed in place:</span>
        </span>
      )}
      <button
        id={ids.select}
        type="button"
        onClick={onSelect}
        aria-labelledby={ids.label}
        aria-describedby={described}
        {...(desktop ? { 'aria-current': selected ? ('true' as const) : undefined } : { 'aria-haspopup': 'dialog' as const })}
        className={cn(
          'flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md py-2 pr-1 pl-1 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
          dim && 'text-muted-foreground',
        )}
      >
        <WowIcon icon={row.icon} size="sm" grayscale={dim} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span id={ids.label} className="min-w-0">
              {row.label}
            </span>
            {changed && (
              <>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                <span id={ids.changed} className="sr-only">
                  Changed.
                </span>
              </>
            )}
          </span>
          {summary && (
            // Never cut short: it wraps as it needs to (a filler's runs to four lines at 1024 px).
            <span id={ids.summary} className="text-xs text-muted-foreground">
              {summary}
            </span>
          )}
        </span>
        {!desktop && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </button>
      {row.enabledId !== undefined && state && (
        <span className="grid size-11 shrink-0 place-items-center">
          <Switch
            checked={state.on}
            disabled={locked}
            className={cn(state.inactive && INACTIVE_SWITCH)}
            aria-labelledby={ids.label}
            aria-describedby={described}
            onCheckedChange={(on) => ctx.set(row.enabledId!, on)}
          />
        </span>
      )}
    </li>
  )
}

/**
 * The selected row's settings: its name and place, Move up and Move down (not for a pinned row),
 * one line on what it does if it has no switch, then its switch and its own settings as the tab's
 * other settings show them, a dependent one under its parent.
 */
function RowSettings({
  row,
  options,
  ctx,
  position,
  count,
  canMove,
  onMove,
  inSheet,
  onBack,
}: {
  row: AplRow
  options: readonly RotationOption[]
  ctx: RowContext
  position: number
  count: number
  canMove: (delta: -1 | 1) => boolean
  onMove: (delta: -1 | 1) => boolean
  inSheet: boolean
  /** Back to the row on the list, from the desktop panel. */
  onBack: () => void
}) {
  const upRef = useRef<HTMLButtonElement>(null)
  const downRef = useRef<HTMLButtonElement>(null)
  const placeId = useId()
  const byId = new Map(options.map((o) => [o.id, o]))
  const own = [row.enabledId, ...row.optionIds].flatMap((id) => (id === undefined ? [] : [byId.get(id)!]))
  const place = row.pinned ? `Fixed at position ${position} of ${count}` : `Position ${position} of ${count}`
  // A button that disables itself at the end hands focus to the other (docs/ux.md#accessibility).
  const step = (delta: -1 | 1) => {
    if (!onMove(delta)) return
    const self = delta < 0 ? upRef.current : downRef.current
    if (self?.disabled) (delta < 0 ? downRef.current : upRef.current)?.focus()
  }
  return (
    <div className={cn('flex flex-col gap-3', inSheet && 'p-4')}>
      {!inSheet && (
        // Back to the list first, so Shift+Tab from the heading reaches it.
        <Button variant="ghost" className="-ml-2 h-11 self-start text-muted-foreground" onClick={onBack}>
          <ArrowLeft /> Back to list
        </Button>
      )}
      {!inSheet && (
        <div className="flex items-center gap-3">
          <WowIcon icon={row.icon} size="md" />
          <div className="flex min-w-0 flex-col">
            <h4 id={PANEL_HEADING_ID} tabIndex={-1} className="text-sm font-medium outline-none">
              {row.label}
            </h4>
            <p id={placeId} className="text-xs text-muted-foreground">
              {place}
            </p>
          </div>
        </div>
      )}
      {inSheet && (
        <p id={placeId} className="sr-only">
          {place}
        </p>
      )}
      {!row.pinned && (
        <div className="grid grid-cols-2 gap-2">
          <Button ref={upRef} variant="outline" className="h-11" disabled={!canMove(-1)} aria-describedby={placeId} onClick={() => step(-1)}>
            <ArrowUp /> Move up
          </Button>
          <Button ref={downRef} variant="outline" className="h-11" disabled={!canMove(1)} aria-describedby={placeId} onClick={() => step(1)}>
            <ArrowDown /> Move down
          </Button>
        </div>
      )}
      {row.help && <p className="text-sm text-muted-foreground">{row.help}</p>}
      {/* Its switch is named "Use …", so it isn't a second switch with the list row's name. */}
      {own.length > 0 && <OptionList options={own} ctx={ctx} stacked rowSwitch={row.enabledId} />}
    </div>
  )
}

/** Below 1024 px, the selected row's settings open in a sheet; closing it returns focus to the row. */
function RowSheet({
  row,
  describe,
  onClose,
  render,
}: {
  row: AplRow | undefined
  describe: (row: AplRow) => string
  onClose: () => void
  render: (row: AplRow) => ReactNode
}) {
  // Keeps the last row while the sheet animates closed.
  const [shown, setShown] = useState(row)
  if (row && row !== shown) setShown(row)
  const { titleRef, contentProps } = useSheetFocus<HTMLButtonElement>(() => (shown ? document.getElementById(listIds(shown.id).select) : null))
  return (
    <Drawer open={row !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[92svh] data-[vaul-drawer-direction=bottom]:max-h-[92svh]" {...contentProps}>
        {shown && (
          <>
            <DrawerHeader className="relative border-b pr-14 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
              <div className="flex items-center gap-3">
                <WowIcon icon={shown.icon} size="md" />
                <div className="flex min-w-0 flex-col">
                  <DrawerTitle ref={titleRef} tabIndex={-1} className="outline-none">
                    {shown.label}
                  </DrawerTitle>
                  <DrawerDescription>{describe(shown)}</DrawerDescription>
                </div>
              </div>
              <DrawerCloseButton />
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{render(shown)}</div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
