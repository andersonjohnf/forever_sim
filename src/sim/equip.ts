// What a class can equip, which items fit which gear slot, and the rules that limit a set of
// gear as a whole: Unique and Unique-Equipped, and items only one faction can wear.
//
// Proficiencies are Classic Era's [C]; no Forever change to them has been found [?]
// (docs/open-questions.md). Plate and mail are trained at level 40, so every level-60
// warrior and paladin has them.
import itemJson from '@/data/items/pre-bis.json'
import type { ArmorType, Item, ItemData, WeaponType } from '@/data/items/types'
import raceJson from '@/data/races/races.json'
import type { Faction, RaceData } from '@/data/races/types'
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
  /**
   * Arrows or bullets in the ammo slot and a quiver or ammo pouch in the quiver slot: the hunter's
   * (docs/mechanics/ranged-and-pets.md §1). Absent: neither slot.
   */
  supplies?: boolean
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
  // docs/classes/shaman.md#races-and-weapons: mail at 40 and shields [C]; Forever trains two-handed
  // axes and maces without Classic's talent [F] (its talent and spell are gone from the client).
  shaman: {
    armor: ['cloth', 'leather', 'mail'],
    shield: true,
    oneHand: ['axe', 'mace', 'dagger', 'fist'],
    twoHand: ['axe', 'mace', 'staff'],
    ranged: [],
    relic: 'Totem',
    dualWield: false,
  },
  // docs/classes/rogue.md#73-weapons-and-gear: leather, daggers, swords, maces and fist weapons in
  // either hand, no two-handers or shields, and bows, crossbows, guns and thrown weapons [C]; and
  // one-handed axes, which Forever trains (SkillLineAbility row 248, spell 196: class mask 79 has the rogue) [F].
  rogue: {
    armor: ['cloth', 'leather'],
    shield: false,
    oneHand: ['axe', 'mace', 'sword', 'dagger', 'fist'],
    twoHand: [],
    ranged: ['bow', 'crossbow', 'gun', 'thrown'],
    relic: null,
    dualWield: true,
  },
  // docs/classes/mage.md#races-and-gear: cloth; daggers, one-handed swords and staves; wands [C].
  mage: {
    armor: ['cloth'],
    shield: false,
    oneHand: ['dagger', 'sword'],
    twoHand: ['staff'],
    ranged: ['wand'],
    relic: null,
    dualWield: false,
  },
  // docs/classes/warlock.md#73-gear: cloth, daggers and swords, staves, wands, and an item held in
  // the off hand; no shields or dual wield [C].
  warlock: {
    armor: ['cloth'],
    shield: false,
    oneHand: ['dagger', 'sword'],
    twoHand: ['staff'],
    ranged: ['wand'],
    relic: null,
    dualWield: false,
  },
  // docs/classes/priest.md#72-race-and-weapons: cloth, one-handed maces, daggers, staves and wands
  // (SkillLineAbility rows 254, 1387, 700 and 2927: their class masks include the priest's 16) [F];
  // held-in-off-hand items, no shields.
  priest: {
    armor: ['cloth'],
    shield: false,
    oneHand: ['mace', 'dagger'],
    twoHand: ['staff'],
    ranged: ['wand'],
    relic: null,
    dualWield: false,
  },
  // docs/classes/hunter.md#72-race: cloth, leather and mail (mail from level 40), one-handed axes and
  // swords, daggers and fist weapons, two-handed axes and swords, polearms and staves, bows, guns,
  // crossbows and thrown weapons, dual wield, no shields [C]; ammo and a quiver.
  hunter: {
    armor: ['cloth', 'leather', 'mail'],
    shield: false,
    oneHand: ['axe', 'sword', 'dagger', 'fist'],
    twoHand: ['axe', 'sword', 'polearm', 'staff'],
    ranged: ['bow', 'gun', 'crossbow', 'thrown'],
    relic: null,
    dualWield: true,
    supplies: true,
  },
}

const CLASS_NAME: Record<ClassId, string> = { warrior: 'Warrior', paladin: 'Paladin', druid: 'Druid', shaman: 'Shaman', rogue: 'Rogue', mage: 'Mage', warlock: 'Warlock', priest: 'Priest', hunter: 'Hunter' }

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
  ammo: 'ammo',
  quiver: 'quiver',
}

export function isTwoHand(item: Item): boolean {
  return item.slot === 'twoHand'
}

/** Whether the class fills the ammo and quiver slots (the hunter; docs/mechanics/ranged-and-pets.md §1). */
export const usesSupplies = (classId: ClassId) => PROFICIENCY[classId].supplies === true

// --- Class-quest rewards (docs/data/items.md#class-quest-rewards) ----------------------------

/**
 * Item sets whose every piece is a quest reward only one class receives, by the set's name in the
 * client's ItemSet table, and that class. The item rows carry no class restriction, so the client
 * would let anyone wear them, but no other class can get one. Dungeon Set 2: each class takes its
 * own version of the upgrade quests and receives its own set's piece [C]
 * ([Dungeon Set 2](https://warcraft.wiki.gg/wiki/Dungeon_Set_2);
 * [An Earnest Proposition](https://warcraft.wiki.gg/wiki/An_Earnest_Proposition): one quest per
 * class, Alliance 8905–8912 and 10492, Horde from 8913).
 */
export const CLASS_QUEST_SETS: Readonly<Record<string, ClassId>> = {
  'Battlegear of Heroism': 'warrior',
  'Soulforge Armor': 'paladin',
  'Feralheart Raiment': 'druid',
  'The Five Thunders': 'shaman',
  'Darkmantle Armor': 'rogue',
  "Sorcerer's Regalia": 'mage',
  'Deathmist Raiment': 'warlock',
  'Vestments of the Virtuous': 'priest',
  'Beastmaster Armor': 'hunter',
}

/** Each class-quest set piece's class, from the sets' item lists (every piece, in the pool or not). */
const QUEST_CLASS = new Map<number, ClassId>()
for (const set of Object.values((itemJson as unknown as ItemData).sets)) {
  const classId = CLASS_QUEST_SETS[set.name]
  if (classId) for (const id of set.itemIds) QUEST_CLASS.set(id, classId)
}

/** The one class that receives this item as a quest reward, or null when the item isn't a class-quest reward. */
export function questClass(item: Pick<Item, 'id'>): ClassId | null {
  return QUEST_CLASS.get(item.id) ?? null
}

/**
 * Can this class use the item at all (armor type, weapon type, relic, class restriction, and a
 * class-quest reward's class: docs/data/items.md#class-quest-rewards)?
 */
export function canUse(classId: ClassId, item: Item): boolean {
  const quest = QUEST_CLASS.get(item.id)
  if (quest !== undefined && quest !== classId) return false
  return canWear(classId, item)
}

/** canUse without the class-quest rule: what the client alone lets the class wear. */
function canWear(classId: ClassId, item: Item): boolean {
  if (item.classes && !item.classes.includes(CLASS_NAME[classId])) return false
  const p = PROFICIENCY[classId]
  if (item.itemClass === 'Armor') {
    if (item.slot === 'shield') return p.shield
    if (item.slot === 'relic') return item.itemSubclass === p.relic
    // Cloaks are cloth by subclass but any class can wear them; jewelry has no armor type.
    if (item.slot === 'back' || !item.armorType) return true
    return p.armor.includes(item.armorType)
  }
  // docs/mechanics/ranged-and-pets.md §1: arrows, bullets, quivers and ammo pouches, the hunter's.
  if (item.itemClass === 'Projectile' || item.itemClass === 'Quiver') return p.supplies === true
  if (item.itemClass === 'Weapon' && item.weaponType) {
    if (item.slot === 'ranged' || item.slot === 'thrown') return p.ranged.includes(item.weaponType)
    return (isTwoHand(item) ? p.twoHand : p.oneHand).includes(item.weaponType)
  }
  return false
}

/** Does the item fit this paper-doll slot for this class (e.g. off-hand weapons need dual wield)? */
export function fitsSlot(classId: ClassId, slot: GearSlot, item: Item): boolean {
  const quest = QUEST_CLASS.get(item.id)
  return (quest === undefined || quest === classId) && fitsSlotByClient(classId, slot, item)
}

/** fitsSlot without the class-quest rule. */
function fitsSlotByClient(classId: ClassId, slot: GearSlot, item: Item): boolean {
  if (!item.equipSlots.includes(SLOT_EQUIPS[slot])) return false
  if (!canWear(classId, item)) return false
  if (slot === 'offHand' && item.itemClass === 'Weapon') return PROFICIENCY[classId].dualWield
  if (slot === 'ranged' && item.slot === 'relic') return PROFICIENCY[classId].relic !== null
  return true
}

/**
 * The class whose quest reward keeps this item out of the slot, when that's the only reason: the
 * item fits the slot for this class by the client alone (its armor type, slot and class
 * restriction), but it's another class's quest reward (docs/data/items.md#class-quest-rewards).
 * Null otherwise, including for an item the class couldn't wear there anyway, whose reason is that.
 */
export function questOnlyBar(classId: ClassId, slot: GearSlot, item: Item): ClassId | null {
  const quest = QUEST_CLASS.get(item.id)
  return quest !== undefined && quest !== classId && fitsSlotByClient(classId, slot, item) ? quest : null
}

// --- Unique and Unique-Equipped (docs/data/items.md#equipping-rules) -------------------------

export interface UniqueConflict {
  /** Where the conflicting item is equipped. */
  slot: GearSlot
  item: Item
  /** The Unique-Equipped group the two share; null when it's another copy of the same item. */
  group: string | null
  /** How many of the group (or copies of the item) may be equipped at once. */
  max: number
}

/**
 * The equipped items that `item` in `slot` would break a Unique or Unique-Equipped rule with.
 * A "Unique" item, or one Unique-Equipped with no group, is limited in copies; one in a
 * Unique-Equipped group is limited across the group's items, copies included. The item already
 * in `slot` is being replaced, so it never conflicts, and a two-hander in the main hand frees
 * the off hand.
 */
export function uniqueConflicts(
  equipped: Partial<Record<GearSlot, Item>>,
  slot: GearSlot,
  item: Item,
): UniqueConflict[] {
  const others: [GearSlot, Item][] = []
  for (const [s, other] of Object.entries(equipped) as [GearSlot, Item | undefined][]) {
    if (!other || s === slot) continue
    if (slot === 'mainHand' && s === 'offHand' && isTwoHand(item)) continue
    others.push([s, other])
  }
  const group = item.uniqueEquipped?.group ?? null
  const max = item.uniqueEquipped?.max ?? (item.unique ? 1 : Infinity)
  const rivals = others.filter(([, other]) => (group === null ? other.id === item.id : other.uniqueEquipped?.group === group))
  return rivals.length >= max ? rivals.map(([s, other]) => ({ slot: s, item: other, group, max })) : []
}

// --- Faction-bound items (docs/data/items.md#equipping-rules) --------------------------------

const raceData = raceJson as unknown as RaceData

const RACE_FACTION = new Map<string, Faction>(raceData.races.map((r) => [r.id, r.faction]))
/** The factions of the races a race name can mean (the Skyborne name is on both sides). */
const RACE_NAME_FACTIONS = new Map<string, Set<Faction>>()
for (const race of raceData.races) {
  for (const name of [race.name, race.baseName]) {
    RACE_NAME_FACTIONS.set(name, (RACE_NAME_FACTIONS.get(name) ?? new Set<Faction>()).add(race.faction))
  }
}

/**
 * Reputations only one faction can earn: the client's Faction table files them under Alliance
 * (891) or Horde (892) as `ParentFactionID` [F] (Faction, 1.60.1.69913).
 */
const REPUTATION_FACTION: Record<string, Faction> = {
  'The League of Arathor': 'Alliance',
  'Stormpike Guard': 'Alliance',
  'Silverwing Sentinels': 'Alliance',
  'Theramore Expeditionary Force': 'Alliance',
  'The Defilers': 'Horde',
  'Frostwolf Clan': 'Horde',
  'Warsong Outriders': 'Horde',
  'Darkspear Raiders': 'Horde',
}

/** PvP rank titles, ranks 1–14, by faction [C]. Rank 3 is "Sergeant" on both sides. */
const PVP_RANK_TITLES: Record<Faction, readonly string[]> = {
  Alliance: [
    'Private',
    'Corporal',
    'Sergeant',
    'Master Sergeant',
    'Sergeant Major',
    'Knight',
    'Knight-Lieutenant',
    'Knight-Captain',
    'Knight-Champion',
    'Lieutenant Commander',
    'Commander',
    'Marshal',
    'Field Marshal',
    'Grand Marshal',
  ],
  Horde: [
    'Scout',
    'Grunt',
    'Sergeant',
    'Senior Sergeant',
    'First Sergeant',
    'Stone Guard',
    'Blood Guard',
    'Legionnaire',
    'Centurion',
    'Champion',
    'Lieutenant General',
    'General',
    'Warlord',
    'High Warlord',
  ],
}

/** The rank-3 cloaks, whose title both factions share [C] (the pre-raid BiS lists' notes). */
const ITEM_FACTION: Record<number, Faction> = {
  16342: 'Horde', // Sergeant's Cape
  18461: 'Alliance', // Sergeant's Cloak
}

/** Alterac Valley rewards, which the client lists with no reputation requirement [C]. */
const AV_PREFIX: [RegExp, Faction][] = [
  [/^Stormpike /, 'Alliance'],
  [/^Frostwolf /, 'Horde'],
]

/**
 * Warsong Gulch rewards, which the client also lists with no reputation requirement: the Silverwing
 * Sentinels' and the Warsong Outriders' quartermasters sell twins of the same stats under these
 * names [C] (docs/data/items.md#equipping-rules). Only Classic Era items: a Forever item with one of
 * these names (Sentinel's Libram, 272434) has no twin to go by, so it suits both factions [?]. The
 * names are broad ("Scout's", "Protector's"), so a test checks that every item in the pool they
 * place has a twin of the other faction's.
 */
export const WARSONG_GULCH_PREFIX: readonly (readonly [RegExp, Faction])[] = [
  [/^(Sentinel|Protector|Lorekeeper|Caretaker|Outrunner)'s /, 'Alliance'],
  [/^(Legionnaire|Outrider|Scout|Advisor|Battle Healer)'s /, 'Horde'],
]
const BATTLEGROUND_PREFIX = [...AV_PREFIX, ...WARSONG_GULCH_PREFIX]

/** The faction a race belongs to; null for an unknown race id. */
export function raceFaction(race: string): Faction | null {
  return RACE_FACTION.get(race) ?? null
}

const RACE_NAME = new Map<string, string>(raceData.races.map((r) => [r.id, r.name]))

/** A race's name ("Night Elf"), or its id if it's unknown. */
export const raceName = (race: string): string => RACE_NAME.get(race) ?? race

/** The only faction that can equip the item, or null when both can. */
export function itemFaction(item: Item): Faction | null {
  if (item.races) {
    const factions = new Set(item.races.flatMap((name) => [...(RACE_NAME_FACTIONS.get(name) ?? [])]))
    if (factions.size === 1) return [...factions][0]
  }
  const fixed = ITEM_FACTION[item.id]
  if (fixed) return fixed
  for (const req of item.requirements) {
    const byReputation = req.kind === 'reputation' && req.faction ? REPUTATION_FACTION[req.faction] : undefined
    if (byReputation) return byReputation
    if (req.kind === 'pvpRank' && req.level) {
      const rank = req.level
      const sides = (Object.keys(PVP_RANK_TITLES) as Faction[]).filter((f) =>
        item.name.startsWith(`${PVP_RANK_TITLES[f][rank - 1]}'s `),
      )
      if (sides.length === 1) return sides[0]
    }
  }
  return (item.tab === 'new' ? AV_PREFIX : BATTLEGROUND_PREFIX).find(([pattern]) => pattern.test(item.name))?.[1] ?? null
}

/** Can a character of this race equip the item, i.e. it isn't the other faction's? */
export function fitsFaction(race: string, item: Item): boolean {
  const faction = itemFaction(item)
  return faction === null || faction === raceFaction(race)
}
