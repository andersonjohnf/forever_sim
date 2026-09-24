// The Rotation tab's priority list (decision D31, docs/ux.md "Rotation"): the spec's rows in the
// order the sim tries them, each with a drag handle, an icon, its name and a one-line summary, and
// a switch. Selecting a row opens its settings: beside the list on desktop (≥ 1024 px), in a sheet
// below that. A row moves by its handle (a pointer, or the keyboard: Space, the arrow keys, Space),
// or with Move up and Move down in its settings. Pinned rows (the pre-pull) show a lock and don't
// move, and nothing moves past them. Above the list, the preset picker ("Custom" once you've
// edited it) and Reset order.
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
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Lock, RotateCcw } from 'lucide-react'
import { type ReactNode, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { announce } from '@/app/announce'
import { DrawerCloseButton } from '@/app/drawer-close-button'
import { useSheetFocus } from '@/app/sheet-focus'
import { useSetup } from '@/app/setup-store'
import { SelectContent } from '@/components/select-content'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
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
  moveAplRow,
  normalizeAplOrder,
  type RotationOption,
  rotationPreset,
  storedAplOrder,
} from '@/sim'
import { INACTIVE_SWITCH, type RowContext } from './ids'
import { aplRowChanged, aplRowSummary, withRotationOrder } from './logic'
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

/** Drags move rows up and down only. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function PriorityList({ apl, options, ctx }: { apl: AplDefinition; options: readonly RotationOption[]; ctx: RowContext }) {
  const config = useSetup((s) => s.config)
  const update = useSetup((s) => s.update)
  const desktop = useIsDesktop()
  const order = normalizeAplOrder(apl, config.rotationOrder)
  const byId = new Map(apl.rows.map((r) => [r.id, r]))
  const [selected, setSelected] = useState<string | null>(null)
  const selectedRow = selected === null ? undefined : byId.get(selected)
  const presetRef = useRef<HTMLButtonElement>(null)
  const helpId = useId()

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

  const preset = rotationPreset(config)
  const presets = aplPresets(apl)
  const pickPreset = (id: string) => {
    const picked = applyAplPreset(apl, config.rotation, id)
    if (!picked) return
    update((c) => withRotationOrder({ ...c, rotation: picked.rotation }, picked.rotationOrder))
    announce(`Rotation set to ${presets.find((p) => p.id === id)!.label}.`)
  }
  const resetOrder = () => {
    // Reset order disables itself, so focus moves to the preset picker first (docs/ux.md#accessibility).
    presetRef.current?.focus()
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
        <Select value={preset === CUSTOM_APL_PRESET ? '' : (preset ?? '')} onValueChange={pickPreset}>
          {/* The trigger's size attribute sets its height, so the 44 px target overrides that (docs/ux.md "Accessibility"). */}
          <SelectTrigger ref={presetRef} className="min-w-0 flex-1 data-[size=default]:h-11 sm:max-w-64 sm:min-w-48" aria-label="Rotation preset">
            <SelectValue placeholder="Custom" />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id} className="min-h-11">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" className="h-11 shrink-0" disabled={config.rotationOrder === undefined} onClick={resetOrder}>
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
                    onSelect={() => setSelected(row.id)}
                  />
                )}
              />
            ))}
          </ol>
        </DndContext>
        {desktop && (
          // Keyed by the row, so another row's settings start at their top. Short enough to stay
          // whole beside the list's last rows, above the footer.
          <aside
            key={selected ?? 'none'}
            aria-label={selectedRow ? `${selectedRow.label} settings` : 'Ability settings'}
            className="sticky top-[calc(var(--sticky-top,7rem)+1rem)] max-h-[calc(100svh-var(--sticky-top,7rem)-12rem)] overflow-y-auto"
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
  // What the row's settings say with links (Buffs, Talents, Gear), said here in words.
  const unmet = state?.unmet && [state.unmet.talent !== undefined && `the ${state.unmet.talent} talent`, state.unmet.shield && 'a shield'].filter(Boolean).join(' and ')
  const note = state?.notUsed ?? (state?.missingBuff ? `Not used: turn on ${state.missingBuff.name} in Buffs first.` : unmet ? `Not used: needs ${unmet}.` : undefined)
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
            <span id={ids.summary} className="line-clamp-2 text-xs text-muted-foreground">
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
}: {
  row: AplRow
  options: readonly RotationOption[]
  ctx: RowContext
  position: number
  count: number
  canMove: (delta: -1 | 1) => boolean
  onMove: (delta: -1 | 1) => boolean
  inSheet: boolean
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
        <div className="flex items-center gap-3">
          <WowIcon icon={row.icon} size="md" />
          <div className="flex min-w-0 flex-col">
            <h4 className="text-sm font-medium">{row.label}</h4>
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
      {own.length > 0 && <OptionList options={own} ctx={ctx} stacked />}
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
