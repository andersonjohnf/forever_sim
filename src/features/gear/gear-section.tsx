import { Check, ChevronRight, Info, MoreHorizontal } from 'lucide-react'
import { useRef, useState, type CSSProperties } from 'react'
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
import { useIsWide } from '@/hooks/use-media-query'
import { itemsById } from '@/lib/items'
import { cn } from '@/lib/utils'
import { hasThreatSet, isTwoHand, matchSupplies, uniqueConflicts, type GearSlot, type SimConfig } from '@/sim'
import { defaultGearFor, equipEffect, slotsOffDefault } from './default-set'
import { EnchantPicker } from './enchant-picker'
import { enchantsFor } from './enchants'
import { ItemPicker } from './item-picker'
import { itemDescription } from './item-flags'
import { ItemFlags, ItemSummary } from './item-row'
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

/**
 * How each group lays out in the wide grid (docs/ux.md "Gear"), whose three columns are 0.75 rem
 * apart: Armor spans two and has a column in each, filled down each one, left side then right, as
 * the character pane has them; Jewelry is the third; Weapons run across all three, their dividers
 * lined up with Armor's and with the middle of the gap beside Jewelry.
 */
const WIDE_GRID: Record<string, { columns: number; down: boolean; span: string; template: string }> = {
  Armor: { columns: 2, down: true, span: 'wide:col-span-2', template: 'wide:grid-cols-[repeat(2,minmax(0,1fr))]' },
  Jewelry: { columns: 1, down: true, span: '', template: 'wide:grid-cols-[minmax(0,1fr)]' },
  Weapons: {
    columns: 3,
    down: false,
    span: 'wide:col-span-3',
    template: 'wide:grid-cols-[calc((100%_-_1.5rem)/3_+_0.375rem)_calc((100%_-_1.5rem)/3_+_0.75rem)_minmax(0,1fr)]',
  },
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

  // From 1440 px the slots are a grid that shows them all at once (docs/ux.md "Gear", D34).
  const wide = useIsWide()
  const groups = slotGroups(meta.classId)

  const pick = (slot: GearSlot, item: Item | null) => {
    const swapped = slot === 'ranged' ? suppliesSwapped(config.gear, equip(config, slot, item).gear) : null
    update((c) => equip(c, slot, item))
    if (swapped) announce(swapped)
    setPicking(null)
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
      onClick={() => setPicking(slot)}
      className={className}
      aria-label={`${SLOT_LABEL[slot]}: ${item?.name ?? (locked ? 'two-handed weapon equipped' : 'empty')}`}
      aria-describedby={item ? `slot-${slot}-description` : undefined}
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
      whole={wide}
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

  return (
    <div className="flex flex-col gap-6 wide:gap-4">
      <SectionHeader
        title="Gear"
        description={
          threatSet
            ? `Starts as ${defaultSet}: pre-raid items measured for threat, keeping an effective-health floor. Choose a slot to change its item.`
            : `Starts as ${defaultSet}. Choose a slot to change its item.`
        }
        action={
          // From 1440 px the action is in view rather than in a menu (docs/ux.md principle 4), sized to its label.
          wide ? (
            <Button variant="outline" className="h-11 px-4" onClick={clearAll}>
              Remove all gear
            </Button>
          ) : (
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
          )
        }
      />
      <div
        className={cn(
          'flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4',
          offDefault > 0 && 'bg-muted/50',
          // From 1440 px it's a line under the intro rather than a box, leaving the height to the slots.
          'wide:-mt-2 wide:border-0 wide:bg-transparent wide:p-0',
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
          <Button
            // From 1440 px it takes the line's height: 32 px, with a 44 px hit area (from inside its
            // border) into the space above and below.
            className="h-11 w-full px-4 sm:w-auto wide:relative wide:-my-1.5 wide:h-8 wide:px-3 wide:after:absolute wide:after:inset-x-0 wide:after:-inset-y-[7px]"
            aria-describedby="gear-default-status"
            onClick={loadBis}
          >
            {threatSet ? 'Equip the threat set' : 'Equip pre-raid best in slot'}
          </Button>
        )}
      </div>
      <ClassicEraNote what="Enchants" />

      {/* Under 1440 px the groups stack, each a list of cards. From 1440 px (docs/ux.md "Gear", D34)
          they're one grid, laid out like the character pane, that shows every slot without scrolling
          at 1440×900: Armor in two columns (its left and right sides), Jewelry in a third, and the
          Weapons in a row across the bottom. The same elements either way, in the same order, so
          focus stays put as the window crosses 1440 px. */}
      <div className="flex flex-col gap-6 wide:grid wide:grid-cols-3 wide:items-start wide:gap-3">
        {groups.map((group) => {
          const { columns, down, span, template } = WIDE_GRID[group.label] ?? WIDE_GRID.Jewelry
          const rows = Math.ceil(group.slots.length / columns)
          return (
            <section key={group.label} className={cn('flex min-w-0 flex-col gap-2', span)}>
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase wide:sr-only">{group.label}</h3>
              {/* minmax(0, 1fr) columns: a long enchant or item name truncates instead of widening the
                  page. At wide, one bordered list a group, with a divider between its slots. */}
              <ul
                style={down ? ({ '--rows': rows } as CSSProperties) : undefined}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))]',
                  'wide:gap-0 wide:overflow-hidden wide:rounded-xl wide:border',
                  template,
                  down && 'wide:grid-flow-col wide:grid-rows-[repeat(var(--rows),auto)]',
                )}
              >
                {group.slots.map((slot, index) => {
                  const [row, column] = down ? [index % rows, Math.floor(index / rows)] : [Math.floor(index / columns), index % columns]
                  const { equipped, item, lockedByTwoHand, bis, unused, enchantable } = slotState(slot)
                  return (
                    <li
                      key={slot}
                      className={cn(
                        'flex min-w-0 flex-col rounded-xl border wide:relative wide:rounded-none wide:border-0',
                        !lockedByTwoHand && 'wide:hover:bg-muted/60',
                        // At wide, a divider under each slot but the last row's, and after each column but the last.
                        row < rows - 1 && 'wide:border-b',
                        column < columns - 1 && 'wide:border-r',
                      )}
                    >
                      {/* The slot's button covers the row (at wide, the whole slot, action line and all); the
                          flag badges and the enchant chip sit above it, so a tap on one explains it rather
                          than opening the picker (docs/ux.md "Gear"). Its z-1 keeps it over faded content
                          too (an empty slot's icon), which opacity would lift above it. */}
                      <div
                        className={cn(
                          'relative flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors wide:static wide:min-h-0 wide:rounded-none wide:hover:bg-transparent',
                          enchantable ? 'wide:pt-1.5 wide:pb-1' : 'wide:py-1.5',
                          lockedByTwoHand ? 'opacity-60' : 'hover:bg-muted',
                          enchantable && 'rounded-b-none',
                        )}
                      >
                        {/* At wide its ring is inset, so the list's rounded edge doesn't clip it. */}
                        {slotButton(
                          slot,
                          item,
                          lockedByTwoHand,
                          bis,
                          unused,
                          'absolute inset-0 z-1 rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed wide:focus-visible:ring-inset',
                        )}
                        {item ? (
                          <ItemSummary compact={wide} item={item} bis={bis} meta={wide ? null : SLOT_LABEL[slot]} dimmed={Boolean(unused)} note={unusedNote(unused)} />
                        ) : (
                          <EmptySlot slot={slot} locked={lockedByTwoHand} />
                        )}
                        {/* At wide the flags sit at the slot's right edge: here beside an item with no enchant,
                            otherwise on the enchant chip's line. */}
                        {wide && item && !enchantable && <ItemFlags item={item} className="mr-1" />}
                        {!lockedByTwoHand && <ChevronRight className="size-4 shrink-0 text-muted-foreground wide:hidden" aria-hidden />}
                      </div>
                      {item && enchantable && (
                        // At wide one line of 44 px hit areas that each take 20 px, the chip's text wrapping
                        // beside the flags; the slot's bottom padding leaves room for their hit areas, and
                        // the 12 px gap keeps the chip's clear of the first flag's.
                        <div className="border-t wide:flex wide:items-start wide:gap-x-3 wide:border-t-0 wide:pr-4 wide:pb-3 wide:pl-2">
                          {enchantPicker(slot, item, equipped?.enchantId)}
                          {wide && <ItemFlags item={item} className="mr-1 ml-auto" />}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      {picking && (
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
