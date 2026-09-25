import { Check, ChevronRight, Info, MoreHorizontal } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { announce } from '@/app/announce'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { WowIcon } from '@/components/wow-icon'
import type { Item } from '@/data/items/types'
import { ClassicEraNote } from '@/features/character/classic-era-note'
import { changeAndFocus } from '@/features/refocus'
import { SectionHeader } from '@/features/section'
import { itemsById } from '@/lib/items'
import { cn } from '@/lib/utils'
import { hasThreatSet, isTwoHand, matchSupplies, uniqueConflicts, type GearSlot, type SimConfig } from '@/sim'
import { defaultGearFor, equipEffect, slotsOffDefault } from './default-set'
import { EnchantPicker } from './enchant-picker'
import { enchantsFor } from './enchants'
import { ItemPicker } from './item-picker'
import { PICKER_HEADING_ID, PickerPanel } from './picker-panel'
import { useInlinePicker } from './use-inline-picker'
import { itemDescription } from './item-flags'
import { ItemSummary } from './item-row'
import { ammoNote, bisRank, EMPTY_SLOT_ICON, SLOT_LABEL, slotGroups } from './slots'

/** The items equipped in each slot. */
function wornItems(gear: SimConfig['gear']): Partial<Record<GearSlot, Item>> {
  const worn: Partial<Record<GearSlot, Item>> = {}
  for (const [slot, entry] of Object.entries(gear) as [GearSlot, { itemId: number } | undefined][]) {
    const item = entry && itemsById.get(entry.itemId)
    if (item) worn[slot] = item
  }
  return worn
}

function equip(config: SimConfig, slot: GearSlot, item: Item | null): SimConfig {
  const gear = { ...config.gear }
  if (!item) {
    delete gear[slot]
    return { ...config, gear }
  }
  // A unique item moves rather than being duplicated. The picker doesn't offer an item that
  // breaks a Unique-Equipped group, so this only ever clears another copy of the same item.
  for (const conflict of uniqueConflicts(wornItems(gear), slot, item)) delete gear[conflict.slot]
  // Keep the slot's enchant if it still applies to the new item.
  const enchantId = gear[slot]?.enchantId
  const keep = enchantId && enchantsFor(slot, item, config.rules.profile).some((e) => e.id === enchantId)
  gear[slot] = keep ? { itemId: item.id, enchantId } : { itemId: item.id }
  if (slot === 'mainHand' && isTwoHand(item)) delete gear.offHand
  // A new ranged weapon takes ammo it fires, and the quiver or pouch that holds it (hunter.md §7.3).
  if (slot === 'ranged') return { ...config, gear: matchSupplies(gear, item) }
  return { ...config, gear }
}

/** What a ranged pick swapped in the ammo and quiver slots, for screen readers: the rows change in view. */
function suppliesSwapped(before: SimConfig['gear'], after: SimConfig['gear']): string | null {
  const swapped = (['ammo', 'quiver'] as const)
    .filter((slot) => after[slot] && before[slot]?.itemId !== after[slot]?.itemId)
    .map((slot) => itemsById.get(after[slot]!.itemId)?.name)
    .filter(Boolean)
  return swapped.length ? `Swapped in ${swapped.join(' and ')} to match the ranged weapon.` : null
}

/** Up to three slots by name, then how many more: "Head, Neck, Shoulders and 13 more". */
function slotList(slots: readonly GearSlot[]): string {
  const names = slots.map((slot) => SLOT_LABEL[slot])
  if (names.length > 3) return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** An empty slot's icon and name, or why a two-hander leaves the off hand empty. */
function EmptySlot({ slot, locked }: { slot: GearSlot; locked: boolean }) {
  return (
    <div aria-hidden className="flex min-w-0 flex-1 items-center gap-3">
      <WowIcon icon={EMPTY_SLOT_ICON[slot]} size="lg" grayscale />
      <div className="flex flex-col">
        <span className="text-sm font-medium text-muted-foreground">{SLOT_LABEL[slot]}</span>
        <span className="text-xs text-muted-foreground">{locked ? 'Your two-handed weapon uses both hands' : 'Empty'}</span>
      </div>
    </div>
  )
}

export function GearSection() {
  const meta = useSpecMeta()
  const config = useSetup((s) => s.config)
  const update = useSetup((s) => s.update)
  const [picking, setPicking] = useState<GearSlot | null>(null)
  // Each slot's button, which takes focus back when the picker closes (docs/ux.md#accessibility).
  const slotButtons = useRef(new Map<GearSlot, HTMLButtonElement>())
  const statusRef = useRef<HTMLParagraphElement>(null)

  const mainHand = config.gear.mainHand ? itemsById.get(config.gear.mainHand.itemId) : undefined
  const twoHanded = mainHand ? isTwoHand(mainHand) : false
  const ranged = config.gear.ranged ? itemsById.get(config.gear.ranged.itemId) : undefined

  // A tank's default is the sim's measured threat set, not a guide's pre-raid list, and the tab says
  // so (docs/ux.md "Gear").
  const threatSet = hasThreatSet(config.spec)
  const defaultSet = threatSet ? `the ${meta.name} ${meta.className} threat set` : `${meta.name} ${meta.className} pre-raid best in slot`
  // The default set's button sits at the top, stronger while the gear differs from it (docs/ux.md "Gear").
  const offSlots = slotsOffDefault(config)
  const offDefault = offSlots.length
  const setName = threatSet ? 'the threat set' : 'pre-raid best in slot'

  // No visible notice for these: the slots change in front of you. Screen readers hear them
  // (src/app/announce.ts).
  // The button goes once the gear matches, so focus moves to the line that says so.
  const loadBis = () => {
    changeAndFocus(
      () => update((c) => ({ ...c, gear: { ...defaultGearFor(c.spec, c.race) } })),
      () => statusRef.current,
    )
    announce(`Equipped ${defaultSet}.`)
  }
  const clearAll = () => {
    update((c) => ({ ...c, gear: {} }))
    announce('Removed all gear.')
  }

  // From 1440 px the picker opens inline beside a compact slot list (docs/ux.md "Gear", D34). A slot
  // chosen in one layout doesn't carry into the other: the dialog doesn't pop up when the window
  // narrows past it.
  const rootRef = useRef<HTMLDivElement>(null)
  const inline = useInlinePicker(rootRef)
  const [wasInline, setWasInline] = useState(inline)
  if (wasInline !== inline) {
    setWasInline(inline)
    setPicking(null)
  }
  // The off hand can't be chosen while a two-hander locks it, so the panel lets it go.
  const panelSlot = inline && picking && !(picking === 'offHand' && twoHanded) ? picking : null
  const groups = slotGroups(meta.classId)

  /** Opens a slot's picker. Inline, focus moves to the panel's heading, as a Rotation row's does. */
  const choose = (slot: GearSlot) => {
    if (!inline) return setPicking(slot)
    changeAndFocus(
      () => setPicking(slot),
      () => document.getElementById(PICKER_HEADING_ID),
    )
  }

  /** Equips a pick. The dialog closes on it; the inline panel stays on the slot to compare (D34). */
  const pick = (slot: GearSlot, item: Item | null) => {
    const before = config.gear
    const after = equip(config, slot, item).gear
    const swapped = slot === 'ranged' ? suppliesSwapped(before, after) : null
    if (!inline) {
      update((c) => equip(c, slot, item))
      if (swapped) announce(swapped)
      return setPicking(null)
    }
    // The row that left the slot empty goes with the item, so focus moves to the panel's heading.
    changeAndFocus(
      () => update((c) => equip(c, slot, item)),
      () => (item ? null : document.getElementById(PICKER_HEADING_ID)),
    )
    // Focus stays on the item, so screen readers hear what changed.
    announce([item ? `Equipped ${item.name}.` : `${SLOT_LABEL[slot]} left empty.`, swapped].filter(Boolean).join(' '))
  }

  /** What a slot holds, and how its row shows it. */
  const slotState = (slot: GearSlot) => {
    const equipped = config.gear[slot]
    const item = equipped ? itemsById.get(equipped.itemId) : undefined
    return {
      equipped,
      item,
      lockedByTwoHand: slot === 'offHand' && twoHanded,
      bis: item ? bisRank(item, config.spec, slot) : null,
      // Ammo the ranged weapon doesn't fire adds nothing: dimmed, with the reason, as in the picker.
      unused: item ? ammoNote(item, ranged) : null,
      enchantable: Boolean(item && enchantsFor(slot, item, config.rules.profile).length > 0),
    }
  }

  const slotButton = (slot: GearSlot, item: Item | undefined, locked: boolean, bis: number | null, unused: string | null, className: string) => (
    <button
      ref={(el) => {
        if (el) slotButtons.current.set(slot, el)
        else slotButtons.current.delete(slot)
      }}
      type="button"
      // "Open Gear" in a result with no weapon focuses the main hand (src/app/section-focus.ts).
      data-gear-slot={slot}
      disabled={locked}
      onClick={() => choose(slot)}
      className={className}
      aria-label={`${SLOT_LABEL[slot]}: ${item?.name ?? (locked ? 'two-handed weapon equipped' : 'empty')}`}
      aria-describedby={item ? `slot-${slot}-description` : undefined}
      // Inline, the slot whose items the panel shows, as the Rotation list's selected row.
      aria-current={inline && panelSlot === slot ? 'true' : undefined}
    >
      {item && (
        <span id={`slot-${slot}-description`} className="sr-only">
          {itemDescription(item, { bis, spec: meta.id, note: unused })}
        </span>
      )}
    </button>
  )

  const unusedNote = (unused: string | null) =>
    unused && (
      <>
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        {unused}
      </>
    )

  const enchantPicker = (slot: GearSlot, item: Item, enchantId: string | undefined) => (
    <EnchantPicker
      slot={slot}
      item={item}
      enchantId={enchantId}
      // The slot's button, or the main hand's if a two-hander now locks this slot.
      fallbackFocus={() => {
        const button = slotButtons.current.get(slot)
        return button && !button.disabled ? button : slotButtons.current.get('mainHand')
      }}
      onChange={(enchantId) =>
        update((c) => ({
          ...c,
          gear: { ...c.gear, [slot]: enchantId ? { itemId: item.id, enchantId } : { itemId: item.id } },
        }))
      }
    />
  )

  /**
   * Up and Down from anywhere in a slot's row move to the slot above or below, across the groups;
   * Enter on the slot opens it. Keys from a badge's popover, which React passes up from its portal,
   * and the enchant list's own arrows are left alone.
   */
  const slotKeys = (e: KeyboardEvent<HTMLLIElement>, slot: GearSlot) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return
    const order = groups.flatMap((g) => g.slots).filter((s) => s === slot || slotButtons.current.get(s)?.disabled === false)
    const next = order[order.indexOf(slot) + (e.key === 'ArrowDown' ? 1 : -1)]
    if (!next) return
    e.preventDefault()
    slotButtons.current.get(next)?.focus()
  }

  /** A group of the wide layout's compact slot list: one row a slot, about 56 px, with its enchant chip at the end. */
  const compactGroup = (group: { label: string; slots: GearSlot[] }) => (
    <section key={group.label} className="flex min-w-0 flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h3>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {group.slots.map((slot) => {
          const { equipped, item, lockedByTwoHand, bis, unused, enchantable } = slotState(slot)
          return (
            <li key={slot} onKeyDown={(e) => slotKeys(e, slot)} className="relative flex min-h-14 min-w-0">
              {/* The chosen slot: a bar in the primary colour on its leading edge, as a Rotation row's. */}
              {panelSlot === slot && <span aria-hidden className="absolute inset-y-0 left-0 z-2 w-[3px] bg-primary" />}
              <div
                className={cn(
                  'relative flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 transition-colors',
                  lockedByTwoHand ? 'opacity-60' : 'hover:bg-muted',
                )}
              >
                {/* Its ring is inset, so the list's rounded edge doesn't clip it. */}
                {slotButton(slot, item, lockedByTwoHand, bis, unused, 'absolute inset-0 z-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:cursor-not-allowed')}
                {item ? (
                  <ItemSummary compact item={item} bis={bis} meta={SLOT_LABEL[slot]} dimmed={Boolean(unused)} note={unusedNote(unused)} />
                ) : (
                  <EmptySlot slot={slot} locked={lockedByTwoHand} />
                )}
              </div>
              {item && enchantable && (
                // The chip fills its cell, square-cornered and with an inset ring, beside the item.
                <div className="flex w-[min(34%,13rem)] shrink-0 border-l [&>button]:rounded-none [&>button]:focus-visible:ring-inset">
                  {enchantPicker(slot, item, equipped?.enchantId)}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      <SectionHeader
        title="Gear"
        description={
          threatSet
            ? `Starts as ${defaultSet}: pre-raid items measured for threat, keeping an effective-health floor. Choose a slot to change its item.`
            : `Starts as ${defaultSet}. Choose a slot to change its item.`
        }
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label="Gear options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-11" onSelect={clearAll}>
                Remove all gear
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <div
        className={cn(
          'flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4',
          offDefault > 0 && 'bg-muted/50',
        )}
      >
        {/* Focus lands here when the button that equipped the set goes away (docs/ux.md#accessibility). */}
        <p
          ref={statusRef}
          id="gear-default-status"
          tabIndex={-1}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {offDefault > 0 ? (
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
          ) : (
            <Check aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className={cn(offDefault === 0 && 'text-muted-foreground')}>
            {offDefault === 0
              ? `Wearing ${setName}.`
              : `${offDefault} ${offDefault === 1 ? 'slot differs' : 'slots differ'} from ${setName}: ${slotList(offSlots)}. Equipping it ${equipEffect(config.gear, offSlots, defaultGearFor(config.spec, config.race))}.`}
          </span>
        </p>
        {/* Only while there's something to equip: once the gear matches, the line says so and nothing waits to be pressed. */}
        {offDefault > 0 && (
          <Button className="h-11 w-full px-4 sm:w-auto" aria-describedby="gear-default-status" onClick={loadBis}>
            {threatSet ? 'Equip the threat set' : 'Equip pre-raid best in slot'}
          </Button>
        )}
      </div>
      <ClassicEraNote what="Enchants" />

      {inline ? (
        // The wide layout (docs/ux.md "Gear", D34): the slots as a compact list, and the item picker
        // in a panel beside it. The panel widens with the pane, and from 84 rem the slots take two
        // columns beside it: Armor, then Jewelry and Weapons.
        <div className="grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-6 @min-[68rem]/setup:grid-cols-[minmax(0,1fr)_30rem]">
          <div className="grid min-w-0 gap-6 @min-[84rem]/setup:grid-cols-2 @min-[84rem]/setup:items-start">
            <div className="flex min-w-0 flex-col gap-6">{groups.slice(0, 1).map(compactGroup)}</div>
            <div className="flex min-w-0 flex-col gap-6">{groups.slice(1).map(compactGroup)}</div>
          </div>
          <PickerPanel
            key={panelSlot ?? 'none'}
            slot={panelSlot}
            spec={config.spec}
            race={config.race}
            equippedId={panelSlot ? (config.gear[panelSlot]?.itemId ?? null) : null}
            worn={wornItems(config.gear)}
            onPick={(item) => panelSlot && pick(panelSlot, item)}
            onBack={() => panelSlot && slotButtons.current.get(panelSlot)?.focus()}
          />
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="flex min-w-0 flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h3>
            {/* minmax(0, 1fr) columns: a long enchant or item name truncates instead of widening the page. */}
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))]">
              {group.slots.map((slot) => {
                const { equipped, item, lockedByTwoHand, bis, unused, enchantable } = slotState(slot)
                return (
                  <li key={slot} className="flex min-w-0 flex-col rounded-xl border">
                    {/* The slot's button covers the row; the flag badges sit above it, so a tap on one
                        explains it rather than opening the picker (docs/ux.md "Gear"). Its z-1 keeps it
                        over faded content too (an empty slot's icon), which opacity would lift above it. */}
                    <div
                      className={cn(
                        'relative flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                        lockedByTwoHand ? 'opacity-60' : 'hover:bg-muted',
                        enchantable && 'rounded-b-none',
                      )}
                    >
                      {slotButton(slot, item, lockedByTwoHand, bis, unused, 'absolute inset-0 z-1 rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed')}
                      {item ? (
                        <ItemSummary item={item} bis={bis} meta={SLOT_LABEL[slot]} dimmed={Boolean(unused)} note={unusedNote(unused)} />
                      ) : (
                        <EmptySlot slot={slot} locked={lockedByTwoHand} />
                      )}
                      {!lockedByTwoHand && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    </div>
                    {item && enchantable && <div className="border-t">{enchantPicker(slot, item, equipped?.enchantId)}</div>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {picking && !inline && (
        <ItemPicker
          open
          onOpenChange={(open) => !open && setPicking(null)}
          spec={config.spec}
          race={config.race}
          slot={picking}
          equippedId={config.gear[picking]?.itemId ?? null}
          worn={wornItems(config.gear)}
          onPick={(item) => pick(picking, item)}
          returnTo={() => slotButtons.current.get(picking)}
        />
      )}
    </div>
  )
}
