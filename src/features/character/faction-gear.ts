// Faction-bound gear on a race change (docs/ux.md "Character"; docs/data/items.md#equipping-rules).
// PvP, battleground and reputation rewards come in one twin per faction with the same stats (read
// from the client, docs/data/items.md#faction-twins), so when the race changes sides each such item
// swaps for the new faction's piece with the same stats: its twin, or a piece whose set differs.
import type { Item } from '@/data/items/types'
import raceJson from '@/data/races/races.json'
import type { Faction, RaceData } from '@/data/races/types'
import { itemData, itemsById } from '@/lib/items'
import { canUse, fitsFaction, GEAR_SLOTS, itemFaction, SPEC_META, uniqueConflicts, type ClassId, type GearSlot, type SimConfig } from '@/sim'
import { followDefaults, following } from '@/features/gear/default-set'

const races = (raceJson as unknown as RaceData).races

/** The faction a race id belongs to, or null for an unknown id. */
export function factionOf(race: string): Faction | null {
  return races.find((r) => r.id === race)?.faction ?? null
}

/** Length of the longest common suffix, to pick "Defiler's Chain Greaves" for "Highlander's Chain Greaves". */
function sharedSuffix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

/** The other-faction items among `ids` that this class can wear, the name that ends the same way first, then by id. */
function otherSide(item: Item, ids: readonly number[], faction: Faction, classId: ClassId): Item[] {
  if (itemFaction(item) === null || itemFaction(item) === faction) return []
  return ids
    .map((id) => itemsById.get(id))
    .filter((other): other is Item => other !== undefined && itemFaction(other) === faction && canUse(classId, other))
    .sort((a, b) => sharedSuffix(b.name, item.name) - sharedSuffix(a.name, item.name) || a.id - b.id)
}

/**
 * The other faction's version of a faction-bound item for a character of this class, for the
 * pre-raid lists' ranks: among the item's twins, which the item scraper reads from the client with
 * the set's bonuses matched (docs/data/items.md#faction-twins), the one bound to `faction` that the
 * class can wear. When several match (Highlander's Chain Greaves has Defiler's Chain and Mail
 * Greaves), the one whose name ends the same way wins. Null when the item isn't bound to the other
 * side or has no twin there.
 */
export function factionTwin(item: Item, faction: Faction, classId: ClassId): Item | null {
  return otherSide(item, item.twins, faction, classId)[0] ?? null
}

/** The name of the item's set, or '' for none: "The Defiler's Fortitude". */
function setName(item: Item): string {
  return (item.setId && itemData.sets[item.setId]?.name) || ''
}

/**
 * The piece a race change swaps a faction-bound item for (docs/data/items.md#faction-twins, "Two
 * tiers"): among its `statTwins`, the other faction's pieces with the same stats and effects whatever
 * their set, the one the class can wear whose set name ends the same way, so a set's pieces move
 * together (The Defiler's Fortitude's greaves take The Highlander's Fortitude's, as its pauldrons and
 * girdle do, not their exact twin in The Highlander's Determination: GC-1); then its exact twin, the
 * name that ends the same way, and the lower id. `setDiffers` says the new piece isn't an exact twin,
 * so its set bonus isn't the old one's (the Alliance's Rank 7 to 10 silk and leather have no item
 * set, Highlander's Mail Pauldrons a spell-crit 3-piece bonus where the Defilers' is melee crit),
 * which the race change's notice names. Null when the item isn't bound to the other side or nothing
 * there matches.
 */
export function raceChangeTwin(item: Item, faction: Faction, classId: ClassId): { twin: Item; setDiffers: boolean } | null {
  const set = setName(item)
  const exact = (other: Item) => (item.twins.includes(other.id) ? 1 : 0)
  const twin = otherSide(item, item.statTwins, faction, classId).sort(
    (a, b) =>
      sharedSuffix(setName(b), set) - sharedSuffix(setName(a), set) ||
      exact(b) - exact(a) ||
      sharedSuffix(b.name, item.name) - sharedSuffix(a.name, item.name) ||
      a.id - b.id,
  )[0]
  return twin ? { twin, setDiffers: !item.twins.includes(twin.id) } : null
}

export interface FactionGearChange {
  config: SimConfig
  /**
   * Items swapped for the new faction's piece with the same stats (`raceChangeTwin`), in paper-doll
   * order of the config's gear; `setDiffers` when its set bonus isn't the old piece's.
   */
  swapped: { slot: GearSlot; from: Item; to: Item; setDiffers: boolean }[]
  /**
   * Default items swapped for the new race's default, which isn't their twin (a Horde paladin's own
   * threat set pieces), in paper-doll order.
   */
  defaulted: { slot: GearSlot; from: Item; to: Item }[]
  /** The other faction's items with no twin, kept as they are. */
  kept: { slot: GearSlot; item: Item }[]
}

/**
 * Changes the race. The slots that hold the spec's default for the old race take the new race's
 * default (docs/architecture.md "Following the defaults"), so an untouched set stays the default set;
 * then each other item the new race's faction can't wear swaps for the other faction's piece with
 * the same stats (`raceChangeTwin`). An item with none, or whose match would break a Unique rule
 * with the rest of the gear, stays. Enchants stay with the slot: the twins take the same enchants.
 */
export function changeRace(config: SimConfig, race: string): FactionGearChange {
  const faction = factionOf(race)
  const { classId } = SPEC_META[config.spec]
  const swapped: FactionGearChange['swapped'] = []
  const defaulted: FactionGearChange['defaulted'] = []
  const kept: FactionGearChange['kept'] = []
  const follow = following(config)
  const gear = { ...followDefaults({ ...config, race }, { gear: follow.gear, talents: false }).config.gear }
  for (const slot of follow.gear) {
    const from = config.gear[slot] && itemsById.get(config.gear[slot].itemId)
    const to = gear[slot] && itemsById.get(gear[slot].itemId)
    if (!from || !to || from.id === to.id) continue
    const twin = faction ? raceChangeTwin(from, faction, classId) : null
    if (twin?.twin.id === to.id) swapped.push({ slot, from, to, setDiffers: twin.setDiffers })
    else defaulted.push({ slot, from, to })
  }
  if (faction) {
    const worn: Partial<Record<GearSlot, Item>> = {}
    for (const [slot, entry] of Object.entries(gear) as [GearSlot, { itemId: number } | undefined][]) {
      const item = entry && itemsById.get(entry.itemId)
      if (item) worn[slot] = item
    }
    for (const [slot, item] of Object.entries(worn) as [GearSlot, Item][]) {
      if (fitsFaction(race, item)) continue
      const match = raceChangeTwin(item, faction, classId)
      if (match && uniqueConflicts(worn, slot, match.twin).length === 0) {
        const { twin, setDiffers } = match
        gear[slot] = { ...gear[slot], itemId: twin.id }
        worn[slot] = twin
        swapped.push({ slot, from: item, to: twin, setDiffers })
      } else {
        kept.push({ slot, item })
      }
    }
  }
  const order = (a: { slot: GearSlot }, b: { slot: GearSlot }) => GEAR_SLOTS.indexOf(a.slot) - GEAR_SLOTS.indexOf(b.slot)
  return { config: { ...config, race, gear }, swapped: swapped.sort(order), defaulted, kept }
}
