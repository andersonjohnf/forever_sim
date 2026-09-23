import type { Item } from '@/data/items/types'
import { summarizeItem } from '@/lib/items'
// Which effects the engine models, read the way the plan builder reads them (build.ts, "Gear stats,
// set bonuses and item effects"). item-flags.test.ts holds this to the plan's own lists.
import { modelledItemEffects, type SpecId } from '@/sim'

/**
 * The item's effects the sim doesn't simulate, as their tooltip lines: equip and chance-on-hit
 * effects with no engine override, extra weapon damage, and use effects the rotation can't press.
 * The result lists the same items in its assumptions ("Some item effects aren’t simulated yet").
 * For a spec, an effect that names only other specs' abilities isn't one (Idol of Brutality, a cat).
 */
export function unsimulatedEffects(item: Item, spec?: SpecId): string[] {
  const modelled = modelledItemEffects(item.id, spec)
  const lines: string[] = []
  if (!modelled.equip) {
    lines.push(...item.procs.map((e) => e.raw), ...item.otherEquip.map((e) => e.raw))
    for (const extra of item.weapon?.extraDamage ?? []) {
      lines.push(`Adds ${extra.min}–${extra.max}${extra.school ? ` ${extra.school}` : ''} damage.`)
    }
  }
  if (!modelled.use) lines.push(...item.useEffects.map((e) => e.raw))
  return lines
}

/**
 * What a screen reader hears for an item after its name: its details, stats, BiS rank and flags.
 * The row's button carries it (docs/ux.md "Gear"), since the visible text sits outside the button.
 */
export function itemDescription(
  item: Item,
  { bis, meta, note, spec }: { bis?: number | null; meta?: string | null; note?: string | null; spec?: SpecId } = {},
): string {
  return [
    meta,
    summarizeItem(item) || 'No stats',
    bis ? (bis === 1 ? 'Best in slot' : `Best in slot, choice ${bis}`) : null,
    item.foreverData ? null : 'Classic stats: no Forever data yet',
    unsimulatedEffects(item, spec).length ? 'Has an effect the sim doesn’t simulate' : null,
    note,
  ]
    .filter(Boolean)
    .join('. ')
}
