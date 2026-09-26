// Which content an item belongs to, for the gear search's default pool (docs/optimizer.md#the-default-pool;
// decision D30, user decision 2026-09-25): the default searches pre-raid gear and the launch raids'
// loot, and leaves the later raids out unless the player opts in. The client has no drop sources (its
// Encounter Journal ships empty, docs/data/items.md), so the rule reads what the data does say: the
// pre-raid lists, the item level, whether an item is new in Forever, and a few curated Classic Era ids
// and set names. Pure, no fights.
import type { Item } from '@/data/items/types'

/**
 * - `pre-raid`: on a pre-raid list (D11), or a dungeon, PvP, reputation, crafted or other non-raid
 *   item at item level 63 or below
 * - `forever-new`: new in Forever (no Classic Era row): a new dungeon's, reputation's or profession's
 *   item, or a launch raid's, which the client can't tell apart; both are in the launch game
 * - `launch-raid`: a launch raid's loot, where it can be identified (Onyxia's, by id [C])
 * - `later`: a later raid's loot or a later patch's item: a curated Zul'Gurub item or raid set [C],
 *   or any item above item level 63 on no pre-raid list
 */
export type GearContent = 'pre-raid' | 'forever-new' | 'launch-raid' | 'later'

export interface ContentOf {
  content: GearContent
  /** The raid, when it's known: "Onyxia", "Zul'Gurub". */
  raid?: string
  /** Why the rule put it there, in words, for a `later` item: "item level 71, on no pre-raid list". */
  why?: string
}

/** The highest item level the default pool takes from outside the pre-raid lists (user decision, D30 2026-09-25). */
export const PRE_RAID_MAX_ITEM_LEVEL = 63

/**
 * Onyxia's Lair's loot, a launch raid (encounter.md §7), by Classic Era item id [C]: her drops, the
 * Tier 2 helms, and the Head of Onyxia quest's rewards. None is in the pool today: Onyxia drops Epics,
 * and the pool (D10) takes Rares and the pre-raid lists' items, which leave raid drops out. The list is
 * here so that an Onyxia item the pool gains is a launch raid's, not a later one's.
 */
export const ONYXIA_ITEMS: ReadonlyMap<number, string> = new Map([
  [16900, 'Stormrage Cover'],
  [16908, 'Bloodfang Hood'],
  [16914, 'Netherwind Crown'],
  [16921, 'Halo of Transcendence'],
  [16929, 'Nemesis Skullcap'],
  [16939, "Dragonstalker's Helm"],
  [16947, 'Helmet of Ten Storms'],
  [16955, 'Judgement Crown'],
  [16963, 'Helm of Wrath'],
  [17064, 'Shard of the Scale'],
  [17067, 'Ancient Cornerstone Grimoire'],
  [17068, 'Deathbringer'],
  [17075, "Vis'kag the Bloodletter"],
  [17078, 'Sapphiron Drape'],
  [18205, "Eskhandar's Collar"],
  [18403, "Dragonslayer's Signet"],
  [18404, 'Onyxia Tooth Pendant'],
  [18406, 'Onyxia Blood Talisman'],
  [18813, 'Ring of Binding'],
])

/**
 * Later raids' items at item level 63 or below, which the item-level line can't see, by id: Zul'Gurub's
 * Zandalar Tribe class necks, the lower of each pair (the item level 68 upgrades are above the line
 * anyway) [C], and the two Hakkari cloaks, Zul'Gurub's by their name and item ids beside the Zandalar
 * rewards [?]. Every id is checked against the pool's name in gear.test.ts.
 */
export const LATER_RAID_ITEMS: ReadonlyMap<number, { name: string; raid: string }> = new Map([
  [19575, { name: 'Strength of Mugamba', raid: "Zul'Gurub" }],
  [19585, { name: "Heathen's Brand", raid: "Zul'Gurub" }],
  [19592, { name: 'The Eye of Zuldazar', raid: "Zul'Gurub" }],
  [19599, { name: 'Pebble of Kajaro', raid: "Zul'Gurub" }],
  [19603, { name: "Kezan's Taint", raid: "Zul'Gurub" }],
  [19607, { name: 'Vision of Voodress', raid: "Zul'Gurub" }],
  [19611, { name: 'Enchanted South Seas Kelp', raid: "Zul'Gurub" }],
  [19615, { name: 'Zandalarian Shadow Talisman', raid: "Zul'Gurub" }],
  [19619, { name: "Maelstrom's Tendril", raid: "Zul'Gurub" }],
  [20218, { name: 'Faded Hakkari Cloak', raid: "Zul'Gurub" }],
  [20219, { name: 'Tattered Hakkari Cape', raid: "Zul'Gurub" }],
])

/** Later raids' item sets, by the set's name [C]: a piece of one is the raid's whatever its item level. Checked against the data in gear.test.ts. */
export const LATER_RAID_SETS: ReadonlyMap<string, string> = new Map([
  ["Zanzil's Concentration", "Zul'Gurub"],
  ["Overlord's Resolution", "Zul'Gurub"],
  ['Prayer of the Primal', "Zul'Gurub"],
  ['Major Mojo Infusion', "Zul'Gurub"],
])

/**
 * Which content an item is (docs/optimizer.md#the-default-pool), in this order: Onyxia's loot is a
 * launch raid's; an item on a pre-raid list is pre-raid, whatever its level; an item new in Forever is
 * the launch game's; a curated later-raid item or set piece is later; an item above item level 63 is
 * later; the rest is pre-raid. `setName` reads an item's set's name.
 */
export function itemContent(item: Item, setName: (setId: string) => string | undefined): ContentOf {
  if (ONYXIA_ITEMS.has(item.id)) return { content: 'launch-raid', raid: 'Onyxia' }
  if (item.preRaidBis.length > 0) return { content: 'pre-raid' }
  if (item.tab === 'new') return { content: 'forever-new' }
  const known = LATER_RAID_ITEMS.get(item.id)
  if (known) return { content: 'later', raid: known.raid }
  const set = item.setId ? setName(item.setId) : undefined
  const setRaid = set ? LATER_RAID_SETS.get(set) : undefined
  if (setRaid) return { content: 'later', raid: setRaid, why: `a piece of ${set}` }
  if (item.itemLevel > PRE_RAID_MAX_ITEM_LEVEL) return { content: 'later', why: `item level ${item.itemLevel}, on no pre-raid list` }
  return { content: 'pre-raid' }
}
