import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { WowIcon } from '@/components/wow-icon'
import type { Item } from '@/data/items/types'
import { SectionHeader } from '@/features/section'
import { itemsById } from '@/lib/items'
import { cn } from '@/lib/utils'
import { defaultConfig, isTwoHand, type GearSlot, type SimConfig } from '@/sim'
import { EnchantPicker } from './enchant-picker'
import { enchantsFor } from './enchants'
import { ItemPicker } from './item-picker'
import { ItemSummary } from './item-row'
import { bisRank, EMPTY_SLOT_ICON, PAIRED_SLOT, SLOT_GROUPS, SLOT_LABEL } from './slots'

function equip(config: SimConfig, slot: GearSlot, item: Item | null): SimConfig {
  const gear = { ...config.gear }
  if (!item) {
    delete gear[slot]
    return { ...config, gear }
  }
  // A unique item moves rather than being duplicated.
  const paired = PAIRED_SLOT[slot]
  if (paired && item.unique && gear[paired]?.itemId === item.id) delete gear[paired]
  // Keep the slot's enchant if it still applies to the new item.
  const enchantId = gear[slot]?.enchantId
  const keep = enchantId && enchantsFor(slot, item).some((e) => e.id === enchantId)
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

  const mainHand = config.gear.mainHand ? itemsById.get(config.gear.mainHand.itemId) : undefined
  const twoHanded = mainHand ? isTwoHand(mainHand) : false

  const loadBis = () => {
    const previous = config
    update((c) => ({ ...c, gear: defaultConfig(c.spec).gear }))
    toast('Pre-raid best in slot equipped', { action: { label: 'Undo', onClick: () => replace(previous) } })
  }
  const clearAll = () => {
    const previous = config
    update((c) => ({ ...c, gear: {} }))
    toast('All gear removed', { action: { label: 'Undo', onClick: () => replace(previous) } })
  }

  const pairedUnique = (slot: GearSlot) => {
    const paired = PAIRED_SLOT[slot]
    const other = paired && config.gear[paired] ? itemsById.get(config.gear[paired]!.itemId) : undefined
    return paired && other?.unique ? { slot: paired, itemId: other.id } : null
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Gear"
        description={`Starts as ${meta.name} ${meta.className} pre-raid best in slot. Tap a slot to change it.`}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label="Gear options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-10" onSelect={loadBis}>
                Equip pre-raid best in slot
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-10" onSelect={clearAll}>
                Remove all gear
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {SLOT_GROUPS.map((group) => (
        <section key={group.label} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {group.slots.map((slot) => {
              const equipped = config.gear[slot]
              const item = equipped ? itemsById.get(equipped.itemId) : undefined
              const lockedByTwoHand = slot === 'offHand' && twoHanded
              return (
                <li key={slot} className="flex flex-col rounded-xl border">
                  <button
                    type="button"
                    disabled={lockedByTwoHand}
                    onClick={() => setPicking(slot)}
                    className={cn(
                      'flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors outline-none',
                      'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
                      item && enchantsFor(slot, item).length > 0 && 'rounded-b-none',
                    )}
                    aria-label={`${SLOT_LABEL[slot]}: ${item?.name ?? (lockedByTwoHand ? 'two-handed weapon equipped' : 'empty')}`}
                  >
                    {item ? (
                      <ItemSummary item={item} bis={bisRank(item, config.spec, slot)} meta={SLOT_LABEL[slot]} />
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-3">
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
                  </button>
                  {item && enchantsFor(slot, item).length > 0 && (
                    <div className="border-t">
                      <EnchantPicker
                        slot={slot}
                        item={item}
                        enchantId={equipped?.enchantId}
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
          slot={picking}
          equippedId={config.gear[picking]?.itemId ?? null}
          pairedUnique={pairedUnique(picking)}
          onPick={(item) => {
            update((c) => equip(c, picking, item))
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}
