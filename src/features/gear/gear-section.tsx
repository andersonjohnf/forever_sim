import { Check, ChevronRight, Info, MoreHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
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
import { defaultGearFor, slotsOffDefault } from './default-set'
import { EnchantPicker } from './enchant-picker'
import { enchantsFor } from './enchants'
import { ItemPicker } from './item-picker'
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

  return (
    <div className="flex flex-col gap-6">
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
              : `${offDefault} ${offDefault === 1 ? 'slot differs' : 'slots differ'} from ${setName}: ${slotList(offSlots)}. Equipping it replaces ${offDefault === 1 ? 'that slot' : `all ${offDefault}`}.`}
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

      {slotGroups(meta.classId).map((group) => (
        <section key={group.label} className="flex min-w-0 flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h3>
          {/* minmax(0, 1fr) columns: a long enchant or item name truncates instead of widening the page. */}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))]">
            {group.slots.map((slot) => {
              const equipped = config.gear[slot]
              const item = equipped ? itemsById.get(equipped.itemId) : undefined
              const lockedByTwoHand = slot === 'offHand' && twoHanded
              const bis = item ? bisRank(item, config.spec, slot) : null
              // Ammo the ranged weapon doesn't fire adds nothing: dimmed, with the reason, as in the picker.
              const unused = item ? ammoNote(item, ranged) : null
              return (
                <li key={slot} className="flex min-w-0 flex-col rounded-xl border">
                  {/* The slot's button covers the row; the flag badges sit above it, so a tap on one
                      explains it rather than opening the picker (docs/ux.md "Gear"). Its z-1 keeps it
                      over faded content too (an empty slot's icon), which opacity would lift above it. */}
                  <div
                    className={cn(
                      'relative flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                      lockedByTwoHand ? 'opacity-60' : 'hover:bg-muted',
                      item && enchantsFor(slot, item, config.rules.profile).length > 0 && 'rounded-b-none',
                    )}
                  >
                    <button
                      ref={(el) => {
                        if (el) slotButtons.current.set(slot, el)
                        else slotButtons.current.delete(slot)
                      }}
                      type="button"
                      // "Open Gear" in a result with no weapon focuses the main hand (src/app/section-focus.ts).
                      data-gear-slot={slot}
                      disabled={lockedByTwoHand}
                      onClick={() => setPicking(slot)}
                      className="absolute inset-0 z-1 rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
                      aria-label={`${SLOT_LABEL[slot]}: ${item?.name ?? (lockedByTwoHand ? 'two-handed weapon equipped' : 'empty')}`}
                      aria-describedby={item ? `slot-${slot}-description` : undefined}
                    >
                      {item && (
                        <span id={`slot-${slot}-description`} className="sr-only">
                          {itemDescription(item, { bis, spec: meta.id, note: unused })}
                        </span>
                      )}
                    </button>
                    {item ? (
                      <ItemSummary
                        item={item}
                        bis={bis}
                        meta={SLOT_LABEL[slot]}
                        dimmed={Boolean(unused)}
                        note={
                          unused && (
                            <>
                              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                              {unused}
                            </>
                          )
                        }
                      />
                    ) : (
                      <div aria-hidden className="flex min-w-0 flex-1 items-center gap-3">
                        <WowIcon icon={EMPTY_SLOT_ICON[slot]} size="lg" grayscale />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-muted-foreground">{SLOT_LABEL[slot]}</span>
                          <span className="text-xs text-muted-foreground">
                            {lockedByTwoHand ? 'Your two-handed weapon uses both hands' : 'Empty'}
                          </span>
                        </div>
                      </div>
                    )}
                    {!lockedByTwoHand && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  </div>
                  {item && enchantsFor(slot, item, config.rules.profile).length > 0 && (
                    <div className="border-t">
                      <EnchantPicker
                        slot={slot}
                        item={item}
                        enchantId={equipped?.enchantId}
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
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {picking && (
        <ItemPicker
          open
          onOpenChange={(open) => !open && setPicking(null)}
          spec={config.spec}
          race={config.race}
          slot={picking}
          equippedId={config.gear[picking]?.itemId ?? null}
          worn={wornItems(config.gear)}
          onPick={(item) => {
            const before = config.gear
            const after = equip(config, picking, item).gear
            update((c) => equip(c, picking, item))
            const swapped = picking === 'ranged' ? suppliesSwapped(before, after) : null
            if (swapped) announce(swapped)
            setPicking(null)
          }}
          returnTo={() => slotButtons.current.get(picking)}
        />
      )}
    </div>
  )
}
