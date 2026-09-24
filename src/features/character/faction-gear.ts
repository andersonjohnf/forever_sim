// Faction-bound gear on a race change (docs/ux.md "Character"; docs/data/items.md#equipping-rules).
// PvP, battleground and reputation rewards come in one twin per faction with the same stats, so
// when the race changes sides each such item swaps for the new faction's twin.
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

/**
 * What must match for two items to be the same item for either side: everything that changes what
 * the item does. A use effect's text can name a faction's base (the Alterac Valley insignias
 * return you to Dun Baldar or Frostwolf Keep), so use effects match by count and cooldown. Class
 * restrictions match by whether this class can wear the item, not by the whole list: Horde's rank-5
 * plate bracers are warrior-only while Alliance's twin is for warriors and paladins, and a warrior
 * wears either.
 */
function twinKey(item: Item, classId: ClassId): string {
  return JSON.stringify([
    item.slot,
    item.itemLevel,
    item.quality,
    item.armorType,
    item.weaponType,
    item.unique,
    item.uniqueEquipped,
    canUse(classId, item),
    item.stats,
    item.weapon,
    item.weaponSkill,
    item.procs,
    item.otherEquip,
    item.useEffects.map((u) => u.cooldownSec ?? null),
  ])
}

/** Length of the longest common suffix, to pick "Defiler's Chain Greaves" for "Highlander's Chain Greaves". */
function sharedSuffix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

const twinCache = new Map<string, Item | null>()

/**
 * The other faction's version of a faction-bound item for a character of this class: the `faction`
 * item with the same stats, effects, slot and level that the class can wear too. When several match
 * (Highlander's Chain and Mail Greaves), the one whose name ends the same way wins. Null when the
 * item isn't bound to the other side or has no twin.
 */
export function factionTwin(item: Item, faction: Faction, classId: ClassId): Item | null {
  const own = itemFaction(item)
  if (own === null || own === faction) return null
  const cacheKey = `${item.id}:${faction}:${classId}`
  const cached = twinCache.get(cacheKey)
  if (cached !== undefined) return cached
  const key = twinKey(item, classId)
  const matches = itemData.items.filter((other) => itemFaction(other) === faction && twinKey(other, classId) === key)
  const twin = matches.sort((a, b) => sharedSuffix(b.name, item.name) - sharedSuffix(a.name, item.name) || a.id - b.id)[0] ?? null
  twinCache.set(cacheKey, twin)
  return twin
}

export interface FactionGearChange {
  config: SimConfig
  /** Items swapped for the new faction's twin, in paper-doll order of the config's gear. */
  swapped: { slot: GearSlot; from: Item; to: Item }[]
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
 * then each other item the new race's faction can't wear swaps for its twin. An item with no twin,
 * or whose twin would break a Unique rule with the rest of the gear, stays. Enchants stay with the
 * slot: the twins take the same enchants.
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
    if (faction && factionTwin(from, faction, classId)?.id === to.id) swapped.push({ slot, from, to })
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
      const twin = factionTwin(item, faction, classId)
      if (twin && uniqueConflicts(worn, slot, twin).length === 0) {
        gear[slot] = { ...gear[slot], itemId: twin.id }
        worn[slot] = twin
        swapped.push({ slot, from: item, to: twin })
      } else {
        kept.push({ slot, item })
      }
    }
  }
  const order = (a: { slot: GearSlot }, b: { slot: GearSlot }) => GEAR_SLOTS.indexOf(a.slot) - GEAR_SLOTS.indexOf(b.slot)
  return { config: { ...config, race, gear }, swapped: swapped.sort(order), defaulted, kept }
}
