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

/**
 * The slots any enchant can go on, under either rule profile. The wide Gear grid gives each of them
 * an enchant line whatever it holds, so a slot's height never depends on its item (docs/ux.md "Gear").
 */
export const ENCHANT_LINE_SLOTS: ReadonlySet<GearSlot> = new Set(
  (['forever', 'classicEra'] as const satisfies readonly RuleProfileId[]).flatMap((profile) => enchantCatalogueFor(profile).flatMap((e) => e.slots)),
)

/** The enchants that fit, with their summaries in the setup's rule profile (Classic Era's numbers where they differ). */
export function enchantsFor(slot: GearSlot, item: Item, profile: RuleProfileId): EnchantDefinition[] {
  return enchantCatalogueFor(profile).filter((e) => enchantFits(e, slot, item))
}
