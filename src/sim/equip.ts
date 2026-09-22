// What a class can equip, and which items fit which gear slot.
//
// Proficiencies are Classic Era's [C]; no Forever change to them has been found [?]
// (docs/open-questions.md). Plate and mail are trained at level 40, so every level-60
// warrior and paladin has them.
import type { ArmorType, Item, WeaponType } from '@/data/items/types'
import type { ClassId, GearSlot } from './types'

interface Proficiency {
  armor: ArmorType[]
  shield: boolean
  /** Weapon types for melee slots, by hands. */
  oneHand: WeaponType[]
  twoHand: WeaponType[]
  ranged: WeaponType[]
  relic: string | null
  dualWield: boolean
}

export const PROFICIENCY: Record<ClassId, Proficiency> = {
  warrior: {
    armor: ['cloth', 'leather', 'mail', 'plate'],
    shield: true,
    oneHand: ['axe', 'mace', 'sword', 'dagger', 'fist'],
    twoHand: ['axe', 'mace', 'sword', 'polearm', 'staff'],
    ranged: ['bow', 'crossbow', 'gun', 'thrown'],
    relic: null,
    dualWield: true,
  },
  paladin: {
    armor: ['cloth', 'leather', 'mail', 'plate'],
    shield: true,
    oneHand: ['axe', 'mace', 'sword'],
    twoHand: ['axe', 'mace', 'sword', 'polearm'],
    ranged: [],
    relic: 'Libram',
    dualWield: false,
  },
  druid: {
    armor: ['cloth', 'leather'],
    shield: false,
    oneHand: ['mace', 'dagger', 'fist'],
    twoHand: ['mace', 'staff'],
    ranged: [],
    relic: 'Idol',
    dualWield: false,
  },
}

const CLASS_NAME: Record<ClassId, string> = { warrior: 'Warrior', paladin: 'Paladin', druid: 'Druid' }

/** The item gear slots each paper-doll slot accepts. */
const SLOT_EQUIPS: Record<GearSlot, Item['equipSlots'][number]> = {
  head: 'head',
  neck: 'neck',
  shoulder: 'shoulder',
  back: 'back',
  chest: 'chest',
  wrist: 'wrist',
  hands: 'hands',
  waist: 'waist',
  legs: 'legs',
  feet: 'feet',
  finger1: 'finger',
  finger2: 'finger',
  trinket1: 'trinket',
  trinket2: 'trinket',
  mainHand: 'mainHand',
  offHand: 'offHand',
  ranged: 'ranged',
}

export function isTwoHand(item: Item): boolean {
  return item.slot === 'twoHand'
}

/** Can this class use the item at all (armor type, weapon type, relic, class restriction)? */
export function canUse(classId: ClassId, item: Item): boolean {
  if (item.classes && !item.classes.includes(CLASS_NAME[classId])) return false
  const p = PROFICIENCY[classId]
  if (item.itemClass === 'Armor') {
    if (item.slot === 'shield') return p.shield
    if (item.slot === 'relic') return item.itemSubclass === p.relic
    // Cloaks are cloth by subclass but any class can wear them; jewelry has no armor type.
    if (item.slot === 'back' || !item.armorType) return true
    return p.armor.includes(item.armorType)
  }
  if (item.itemClass === 'Weapon' && item.weaponType) {
    if (item.slot === 'ranged' || item.slot === 'thrown') return p.ranged.includes(item.weaponType)
    return (isTwoHand(item) ? p.twoHand : p.oneHand).includes(item.weaponType)
  }
  return false
}

/** Does the item fit this paper-doll slot for this class (e.g. off-hand weapons need dual wield)? */
export function fitsSlot(classId: ClassId, slot: GearSlot, item: Item): boolean {
  if (!item.equipSlots.includes(SLOT_EQUIPS[slot])) return false
  if (!canUse(classId, item)) return false
  if (slot === 'offHand' && item.itemClass === 'Weapon') return PROFICIENCY[classId].dualWield
  if (slot === 'ranged' && item.slot === 'relic') return PROFICIENCY[classId].relic !== null
  return true
}
