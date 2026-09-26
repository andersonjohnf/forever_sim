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
 * The row's stats line (docs/ux.md "Gear"): its key stats, or, for an item with none, its effects in
 * the tooltip's own words, so a trinket whose worth is its proc says what earns its rank (Draconic
 * Infused Emblem's spell damage, Earthstrike's attack power); "No stats" only when it has neither.
 */
export function statsLine(item: Item): string {
  return summarizeItem(item) || effectsLine(item) || 'No stats'
}

/** The item's equip, chance-on-hit and use lines, as its tooltip words them, or '' for none. */
export function effectsLine(item: Item): string {
  return [...item.procs, ...item.otherEquip, ...item.useEffects].map((e) => e.raw).join(' ')
}

/** A stat's name as the flag says it: "spell power". */
const CLASSIC_STAT_NAME: Record<string, string> = { spellPower: 'spell power' }

/**
 * Which of the item's numbers are Classic Era's (docs/ux.md "Gear"): the whole item's, for one the
 * Forever client has no data for yet (decision D6); or, for a Forever item, the stats it took from its
 * Classic Era item because no Forever tooltip of it is on record (`classicStats`: Mindfang's and
 * Sageclaw's spell power, docs/data/client.md#weapon-damage), by name; or null for neither. Both show
 * the same clock badge.
 */
export function classicFlag(item: Item): { kind: 'item' } | { kind: 'stats'; stats: string } | null {
  if (!item.foreverData) return { kind: 'item' }
  const stats = item.classicStats ?? []
  if (stats.length === 0) return null
  const names = stats.map((s) => CLASSIC_STAT_NAME[s] ?? s)
  return { kind: 'stats', stats: names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` }
}

/** The screen reader's words for the item's Classic flag, or null for none. */
function classicDescription(item: Item): string | null {
  const flag = classicFlag(item)
  if (!flag) return null
  return flag.kind === 'item' ? 'Classic stats: no Forever data yet' : `Classic stats: its ${flag.stats} is Classic Era’s, with no Forever tooltip on record yet`
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
    statsLine(item),
    bis ? (bis === 1 ? 'Best in slot' : `Best in slot, choice ${bis}`) : null,
    classicDescription(item),
    unsimulatedEffects(item, spec).length ? 'Has an effect the sim doesn’t simulate' : null,
    note,
  ]
    .filter(Boolean)
    .join('. ')
}
