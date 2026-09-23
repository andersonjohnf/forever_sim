import type { Item, PreRaidBisSlot, WeaponType } from '@/data/items/types'
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

const WEAPON_NOUN: Record<WeaponType, string> = {
  axe: 'axe',
  bow: 'bow',
  crossbow: 'crossbow',
  dagger: 'dagger',
  fist: 'fist weapon',
  gun: 'gun',
  mace: 'mace',
  polearm: 'polearm',
  staff: 'staff',
  sword: 'sword',
  thrown: 'thrown weapon',
  wand: 'wand',
}

const HAND: Partial<Record<Item['slot'], string>> = {
  twoHand: 'Two-hand',
  oneHand: 'One-hand',
  mainHand: 'Main-hand',
  offHand: 'Off-hand',
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)

/** What kind of item it is: "Plate", "Two-hand sword", "Shield", "Idol"; null for jewelry and cloaks. */
export function itemKind(item: Item): string | null {
  if (item.weaponType) {
    const hand = HAND[item.slot]
    return hand ? `${hand} ${WEAPON_NOUN[item.weaponType]}` : capitalize(WEAPON_NOUN[item.weaponType])
  }
  if (item.armorType && item.slot !== 'back') return capitalize(item.armorType)
  if (item.slot === 'shield') return 'Shield'
  if (item.slot === 'heldInOffHand') return 'Held in off hand'
  if (item.slot === 'relic') return item.itemSubclass
  return null
}

/**
 * The picker's detail line, e.g. "Two-hand sword · Item level 63 · Requires level 58". Each part
 * keeps its words together, so a narrow screen wraps the line only between parts.
 */
export function itemDetails(item: Item, extra?: string | null): string {
  const req = item.reqLevel ? `Requires level ${item.reqLevel}` : null
  return [itemKind(item), `Item level ${item.itemLevel}`, extra ?? req]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replaceAll(' ', ' '))
    .join(' · ')
}
