import type { Item } from '@/data/items/types'
import { enchantCatalogueFor, isTwoHand, type EnchantDefinition, type GearSlot, type RuleProfileId } from '@/sim'

/** Does the enchant apply to this item in this slot (e.g. a two-hander enchant needs a 2H)? */
export function enchantFits(enchant: EnchantDefinition, slot: GearSlot, item: Item): boolean {
  if (!enchant.slots.includes(slot)) return false
  switch (enchant.requires) {
    case 'weapon':
      return item.itemClass === 'Weapon'
    case 'twoHand':
      return isTwoHand(item)
    case 'shield':
      return item.slot === 'shield'
    default:
      return true
  }
}

/** The enchants that fit, with their summaries in the setup's rule profile (Classic Era's numbers where they differ). */
export function enchantsFor(slot: GearSlot, item: Item, profile: RuleProfileId): EnchantDefinition[] {
  return enchantCatalogueFor(profile).filter((e) => enchantFits(e, slot, item))
}
