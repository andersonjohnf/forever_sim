import type { Item, PreRaidBisSlot } from '@/data/items/types'
import type { GearSlot, SpecId } from '@/sim'

export const SLOT_LABEL: Record<GearSlot, string> = {
  head: 'Head',
  neck: 'Neck',
  shoulder: 'Shoulders',
  back: 'Back',
  chest: 'Chest',
  wrist: 'Wrists',
  hands: 'Hands',
  waist: 'Waist',
  legs: 'Legs',
  feet: 'Feet',
  finger1: 'Ring 1',
  finger2: 'Ring 2',
  trinket1: 'Trinket 1',
  trinket2: 'Trinket 2',
  mainHand: 'Main hand',
  offHand: 'Off hand',
  ranged: 'Ranged',
}

/** Paper-doll order, grouped as the game does. */
export const SLOT_GROUPS: { label: string; slots: GearSlot[] }[] = [
  { label: 'Armor', slots: ['head', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'] },
  { label: 'Jewelry', slots: ['neck', 'finger1', 'finger2', 'trinket1', 'trinket2'] },
  { label: 'Weapons', slots: ['mainHand', 'offHand', 'ranged'] },
]

/** Slots that hold the same kind of item, where a unique item can only be in one of them. */
export const PAIRED_SLOT: Partial<Record<GearSlot, GearSlot>> = {
  finger1: 'finger2',
  finger2: 'finger1',
  trinket1: 'trinket2',
  trinket2: 'trinket1',
  mainHand: 'offHand',
  offHand: 'mainHand',
}

/** Icon shown for an empty slot. */
export const EMPTY_SLOT_ICON: Record<GearSlot, string> = {
  head: 'inv_helmet_03',
  neck: 'inv_jewelry_necklace_07',
  shoulder: 'inv_shoulder_02',
  back: 'inv_misc_cape_02',
  chest: 'inv_chest_plate16',
  wrist: 'inv_bracer_07',
  hands: 'inv_gauntlets_04',
  waist: 'inv_belt_27',
  legs: 'inv_pants_04',
  feet: 'inv_boots_05',
  finger1: 'inv_jewelry_ring_03',
  finger2: 'inv_jewelry_ring_03',
  trinket1: 'inv_jewelry_talisman_07',
  trinket2: 'inv_jewelry_talisman_07',
  mainHand: 'inv_sword_04',
  offHand: 'inv_shield_04',
  ranged: 'inv_weapon_bow_07',
}

/** The item's BiS rank for this spec in this slot, if it's on the spec's pre-raid list. */
export function bisRank(item: Item, spec: SpecId, slot: GearSlot): number | null {
  const bisSlots: PreRaidBisSlot[] =
    slot === 'finger1' || slot === 'finger2'
      ? ['finger']
      : slot === 'trinket1' || slot === 'trinket2'
        ? ['trinket']
        : slot === 'mainHand'
          ? ['mainHand', 'twoHand']
          : slot === 'ranged'
            ? ['ranged', 'relic']
            : [slot]
  const entry = item.preRaidBis.find((p) => p.spec === spec && bisSlots.includes(p.slot))
  return entry?.rank ?? null
}

/** "Magmus · Blackrock Depths · 20%", or null when the item's source isn't known. */
export function sourceLine(item: Item): string | null {
  const entry = item.source?.[0]?.entries[0]
  if (!entry) return null
  const parts = [entry.name, ...entry.details]
  if (entry.chance) parts.push(`${entry.chance}%`)
  return parts.join(' · ')
}
