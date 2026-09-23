import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { undoToast } from '@/app/undo-toast'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { WowIcon } from '@/components/wow-icon'
import type { Item } from '@/data/items/types'
import { ClassicEraNote } from '@/features/character/classic-era-note'
import { SectionHeader } from '@/features/section'
import { itemsById } from '@/lib/items'
import { cn } from '@/lib/utils'
import { defaultConfig, isTwoHand, uniqueConflicts, type GearSlot, type SimConfig } from '@/sim'
import { EnchantPicker } from './enchant-picker'
import { enchantsFor } from './enchants'
import { ItemPicker } from './item-picker'
import { itemDescription } from './item-flags'
import { ItemSummary } from './item-row'
import { bisRank, EMPTY_SLOT_ICON, SLOT_GROUPS, SLOT_LABEL } from './slots'

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
  return { ...config, gear }
}

export function GearSection() {
  const meta = useSpecMeta()
  const config = useSetup((s) => s.config)
  const update = useSetup((s) => s.update)
  const replace = useSetup((s) => s.replace)
  const [picking, setPicking] = useState<GearSlot | null>(null)
  // Each slot's button, which takes focus back when the picker closes (docs/ux.md#accessibility).
  const slotButtons = useRef(new Map<GearSlot, HTMLButtonElement>())

  const mainHand = config.gear.mainHand ? itemsById.get(config.gear.mainHand.itemId) : undefined
  const twoHanded = mainHand ? isTwoHand(mainHand) : false

  const loadBis = () => {
    const previous = config
    update((c) => ({ ...c, gear: defaultConfig(c.spec, c.race).gear }))
    undoToast('Pre-raid best in slot equipped', () => replace(previous))
  }
  const clearAll = () => {
    const previous = config
    update((c) => ({ ...c, gear: {} }))
    undoToast('All gear removed', () => replace(previous))
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Gear"
        description={`Starts as ${meta.name} ${meta.className} pre-raid best in slot. Choose a slot to change its item.`}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label="Gear options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-11" onSelect={loadBis}>
                Equip pre-raid best in slot
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={clearAll}>
                Remove all gear
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <ClassicEraNote what="Enchants" />

      {SLOT_GROUPS.map((group) => (
        <section key={group.label} className="flex min-w-0 flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h3>
          {/* minmax(0, 1fr) columns: a long enchant or item name truncates instead of widening the page. */}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))]">
            {group.slots.map((slot) => {
              const equipped = config.gear[slot]
              const item = equipped ? itemsById.get(equipped.itemId) : undefined
              const lockedByTwoHand = slot === 'offHand' && twoHanded
              const bis = item ? bisRank(item, config.spec, slot) : null
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
                          {itemDescription(item, { bis })}
                        </span>
                      )}
                    </button>
                    {item ? (
                      <ItemSummary item={item} bis={bis} meta={SLOT_LABEL[slot]} />
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
            update((c) => equip(c, picking, item))
            setPicking(null)
          }}
          returnTo={() => slotButtons.current.get(picking)}
        />
      )}
    </div>
  )
}
