// The gear search's candidates and rules (O2; docs/optimizer.md#gear, decision D30's build plan of
// 2026-09-25). Pure: which items and enchants a slot may take under the player's filters, which gear
// sets are legal as a whole (Unique and Unique-Equipped, a two-hander's empty off hand, a shield
// tank's shield), how the stat weights price an item or an enchant, and the gear sets a step of the
// coordinate ascent races: one slot's top items with their enchants, a pair of slots together (rings,
// trinkets, the weapons: a two-hander against a main and an off hand), and a set's pieces together so
// its bonus can show. The fights live in ./gear-search.ts.
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData, ItemSet, Stats } from '@/data/items/types'
import { matchSupplies } from '../defaults'
import { ENCHANTS, type EnchantSpec } from '../effects/enchants'
import { ITEM_EFFECTS } from '../effects/items'
import { catalogueEffects, type FlatStat } from '../effects/types'
import { canUse, fitsFaction, fitsSlot, isTwoHand, uniqueConflicts } from '../equip'
import { PROFILES, type RulesProfile } from '../rules/profiles'
import { SPEC_META } from '../specs'
import type { ClassId, EquippedItem, GearSlot, SimConfig, SpecId } from '../types'

const itemData = itemJson as unknown as ItemData
/** The item pool, by id (src/data/items/pre-bis.json; D11 decides what's in it). */
export const POOL: ReadonlyMap<number, Item> = new Map(itemData.items.map((i) => [i.id, i]))
export const ITEM_SETS: Readonly<Record<string, ItemSet>> = itemData.sets

/** A whole gear map, as the config holds it. */
export type Gear = SimConfig['gear']

// --- Sources ----------------------------------------------------------------------------------

/**
 * Where an item comes from, as far as the client says (docs/optimizer.md#gear): the Encounter
 * Journal ships empty (docs/data/items.md), so the drops, quests and crafts are one group, `other`.
 * `pvp` is a PvP rank requirement or a battleground's reward (its reputation, or the Alterac Valley
 * and Warsong Gulch names `itemFaction` reads); `reputation` another faction's standing; `profession`
 * a profession skill (Engineering's goggles).
 */
export type GearSource = 'pvp' | 'reputation' | 'profession' | 'other'
export const GEAR_SOURCES: readonly GearSource[] = ['pvp', 'reputation', 'profession', 'other']

/** The battlegrounds' reputations (their quartermasters' rewards are PvP gear). */
const BATTLEGROUND_REPUTATIONS = new Set(['The League of Arathor', 'Stormpike Guard', 'Silverwing Sentinels', 'The Defilers', 'Frostwolf Clan', 'Warsong Outriders'])
const BATTLEGROUND_NAME = /^(Stormpike|Frostwolf|Sentinel's|Protector's|Lorekeeper's|Caretaker's|Outrunner's|Legionnaire's|Outrider's|Scout's|Advisor's|Battle Healer's) /

export function itemSource(item: Item): GearSource {
  if (item.requirements.some((r) => r.kind === 'pvpRank')) return 'pvp'
  const reputation = item.requirements.find((r) => r.kind === 'reputation')
  if (reputation) return reputation.faction && BATTLEGROUND_REPUTATIONS.has(reputation.faction) ? 'pvp' : 'reputation'
  if (item.requirements.some((r) => r.kind === 'skill')) return 'profession'
  // A Forever-new item with a battleground's name has no twin to go by (equip.ts): only Classic Era's count.
  if (item.tab !== 'new' && BATTLEGROUND_NAME.test(item.name)) return 'pvp'
  return 'other'
}

/** An item's source in words, for a result's changes: "PvP rank 10", "reputation (Timbermaw Hold)". */
export function describeSource(item: Item): string | null {
  const rank = item.requirements.find((r) => r.kind === 'pvpRank')
  if (rank) return `PvP rank ${rank.level}`
  const source = itemSource(item)
  const rep = item.requirements.find((r) => r.kind === 'reputation')
  if (source === 'pvp') return rep?.faction ? `battleground reputation (${rep.faction})` : 'battleground reward'
  if (source === 'reputation') return `reputation (${rep?.faction ?? '?'}${rep?.standing ? `, ${rep.standing}` : ''})`
  if (source === 'profession') return `profession (${item.requirements.find((r) => r.kind === 'skill')?.skill ?? '?'})`
  return null
}

// --- Filters and slots --------------------------------------------------------------------------

/** The player's limits on the pool (D30: an item level range, sources, slots to leave as they are). */
export interface GearFilters {
  /** Item levels to search, inclusive (default: the whole pool). */
  itemLevel?: { min?: number; max?: number }
  /** Sources to search (default: every one). */
  sources?: readonly GearSource[]
  /** Slots the search leaves as they are. */
  locked?: readonly GearSlot[]
  /**
   * Enchants the search never tries, by id (a slot's current enchant stays when its slot is kept).
   * For content whose presence in Forever is unconfirmed: the Zandalar and Scourge shoulder
   * enchants the default presets leave out (buffs doc §6.4). Default: UNCONFIRMED_ENCHANTS; [] searches
   * every one.
   */
  excludedEnchants?: readonly string[]
}

/**
 * Enchants the gear search leaves out unless told otherwise (`GearFilters.excludedEnchants`): the
 * shoulder enchants of Zul'Gurub's and the Argent Dawn's Scourge rewards, whose content Forever may
 * not have. The default presets leave the shoulders empty until the guild confirms it (buffs doc
 * §6.4; src/sim/defaults.ts), so the optimizer's defaults (O4) must too.
 */
export const UNCONFIRMED_ENCHANTS: readonly string[] = ['zandalarSignetOfMight', 'mightOfTheScourge', 'fortitudeOfTheScourge']

/** The slots the search fills: every paper-doll slot but a hunter's ammo and quiver, which follow the ranged weapon (`matchSupplies`). */
export const SEARCHED_SLOTS: readonly GearSlot[] = [
  'head',
  'neck',
  'shoulder',
  'back',
  'chest',
  'wrist',
  'hands',
  'waist',
  'legs',
  'feet',
  'finger1',
  'finger2',
  'trinket1',
  'trinket2',
  'mainHand',
  'offHand',
  'ranged',
]

/**
 * A step of the coordinate ascent: one slot, or two raced together (docs/optimizer.md#gear): the
 * rings, the trinkets and the weapons (a two-hander against a main and an off hand), and the sets
 * (a set's pieces swapped in together, so its bonus can show).
 */
export type GearGroup =
  | 'head'
  | 'neck'
  | 'shoulder'
  | 'back'
  | 'chest'
  | 'wrist'
  | 'hands'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'rings'
  | 'trinkets'
  | 'weapons'
  | 'ranged'
  | 'sets'

export const GEAR_GROUPS: readonly GearGroup[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'rings', 'trinkets', 'weapons', 'ranged', 'sets']

export const GROUP_SLOTS: Record<Exclude<GearGroup, 'sets'>, readonly GearSlot[]> = {
  head: ['head'],
  neck: ['neck'],
  shoulder: ['shoulder'],
  back: ['back'],
  chest: ['chest'],
  wrist: ['wrist'],
  hands: ['hands'],
  waist: ['waist'],
  legs: ['legs'],
  feet: ['feet'],
  rings: ['finger1', 'finger2'],
  trinkets: ['trinket1', 'trinket2'],
  weapons: ['mainHand', 'offHand'],
  ranged: ['ranged'],
}

/**
 * Specs that keep a shield (D30's build plan: "off-hand rules, shields for tanks"): a warrior's and
 * a paladin's tanking rests on abilities that need one (Shield Slam and Shield Block,
 * warrior.md §3.1–§3.2; Holy Shield, paladin.md), so their gear search keeps a one-hander and a
 * shield. A bear has no shield to keep.
 */
export const SHIELD_SPECS: ReadonlySet<SpecId> = new Set(['warrior-protection', 'paladin-protection'])

/** What the search needs to know about the character. */
export interface GearContext {
  spec: SpecId
  classId: ClassId
  race: string
  profile: RulesProfile
  creatureType: SimConfig['fight']['creatureType']
  filters: GearFilters
}

export function gearContext(config: SimConfig, filters: GearFilters = {}): GearContext {
  return {
    spec: config.spec,
    classId: SPEC_META[config.spec].classId,
    race: config.race,
    profile: PROFILES[config.rules.profile],
    creatureType: config.fight.creatureType,
    filters,
  }
}

/** Whether the filters let an item in (the item level range and sources; the class and faction are `slotPool`'s). */
export function passesFilters(item: Item, filters: GearFilters): boolean {
  const { min = -Infinity, max = Infinity } = filters.itemLevel ?? {}
  if (item.itemLevel < min || item.itemLevel > max) return false
  return !filters.sources || filters.sources.includes(itemSource(item))
}

/**
 * The pool's items a slot can take for this character under the filters (docs/optimizer.md#gear):
 * the class can wear or wield it in that slot (`fitsSlot`: armor, weapon types, dual wield, relics),
 * its faction can, and the filters let it in. A shield spec's main hand takes one-handers only, and
 * its off hand shields only. Not the currently equipped item unless it passes too: a step adds it
 * back (`groupGears`).
 */
export function slotPool(ctx: GearContext, slot: GearSlot): Item[] {
  const shield = SHIELD_SPECS.has(ctx.spec)
  const out: Item[] = []
  for (const item of POOL.values()) {
    if (item.reqLevel > 60) continue
    if (!fitsSlot(ctx.classId, slot, item) || !fitsFaction(ctx.race, item) || !passesFilters(item, ctx.filters)) continue
    if (shield && slot === 'mainHand' && isTwoHand(item)) continue
    if (shield && slot === 'offHand' && item.slot !== 'shield') continue
    out.push(item)
  }
  return out
}

// --- Enchants ----------------------------------------------------------------------------------

/** Does the enchant apply to this item in this slot (as the Gear tab's picker, src/features/gear/enchants.ts)? */
export function enchantFits(enchant: Pick<EnchantSpec, 'slots' | 'requires'>, slot: GearSlot, item: Item): boolean {
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

export const enchantsFor = (slot: GearSlot, item: Item): EnchantSpec[] => ENCHANTS.filter((e) => enchantFits(e, slot, item))

/**
 * Whether stat weights price the enchant: every effect a flat stat (the rest, procs, haste and
 * threat, are measured by a swap; ./gear-search.ts).
 */
export const weighedEnchant = (enchant: EnchantSpec, profile: RulesProfile): boolean => catalogueEffects(enchant, profile).every((e) => e.kind === 'stat')

// --- Validity ----------------------------------------------------------------------------------

const itemIn = (gear: Gear, slot: GearSlot): Item | undefined => {
  const id = gear[slot]?.itemId
  return id === undefined ? undefined : POOL.get(id)
}

/** The gear's items by slot (items the pool lacks are left out). */
export function wornItems(gear: Gear): Partial<Record<GearSlot, Item>> {
  const out: Partial<Record<GearSlot, Item>> = {}
  for (const slot of Object.keys(gear) as GearSlot[]) {
    const item = itemIn(gear, slot)
    if (item) out[slot] = item
  }
  return out
}

/**
 * What makes a gear set illegal, a line a problem, checked on the slots that differ from `from`
 * (all of them without it), so a setup that already breaks a rule elsewhere can still be searched
 * (docs/optimizer.md#gear): the item fits its slot for the class and faction; no Unique or
 * Unique-Equipped rule is broken (`uniqueConflicts`); a two-hander leaves the off hand empty; a
 * shield spec keeps a one-hander and a shield; and each enchant fits its item.
 */
export function gearProblems(ctx: GearContext, gear: Gear, from?: Gear): string[] {
  const problems: string[] = []
  const worn = wornItems(gear)
  const slots = [...new Set([...Object.keys(gear), ...Object.keys(from ?? {})])] as GearSlot[]
  const changed = slots.filter((slot) => !from || !sameEquipped(gear[slot], from[slot]))
  for (const slot of changed) {
    const entry = gear[slot]
    if (!entry) continue
    const item = POOL.get(entry.itemId)
    if (!item) {
      problems.push(`${slot}: item ${entry.itemId} isn't in the pool`)
      continue
    }
    if (slot !== 'ammo' && slot !== 'quiver' && !fitsSlot(ctx.classId, slot, item)) problems.push(`${slot}: ${item.name} doesn't fit`)
    if (!fitsFaction(ctx.race, item)) problems.push(`${slot}: ${item.name} is the other faction's`)
    const others = { ...worn }
    delete others[slot]
    if (uniqueConflicts(others, slot, item).length > 0) problems.push(`${slot}: ${item.name} breaks a Unique rule`)
    if (entry.enchantId) {
      const enchant = ENCHANTS.find((e) => e.id === entry.enchantId)
      if (!enchant || !enchantFits(enchant, slot, item)) problems.push(`${slot}: enchant ${entry.enchantId} doesn't fit ${item.name}`)
    }
  }
  // The hands' rules, when a hand changed: a setup that breaks one can still have its other slots searched.
  if (changed.includes('mainHand') || changed.includes('offHand')) {
    const mh = worn.mainHand
    if (mh && isTwoHand(mh) && gear.offHand) problems.push('a two-hander leaves the off hand empty')
    if (SHIELD_SPECS.has(ctx.spec) && (!mh || isTwoHand(mh) || worn.offHand?.slot !== 'shield')) problems.push('a shield tank keeps a one-hander and a shield')
  }
  return problems
}

export const sameEquipped = (a: EquippedItem | undefined, b: EquippedItem | undefined): boolean =>
  a?.itemId === b?.itemId && (a?.enchantId ?? null) === (b?.enchantId ?? null)

// --- Stat weights ------------------------------------------------------------------------------

/**
 * Item stat → the stat block's fields it adds to, as the plan builder's `ITEM_STAT` and
 * `addGearStat` do (src/sim/plan/build.ts; character-stats.md#derived-stat-pipeline, step 2):
 * "+x Attack Power" is melee and ranged attack power both. Stats the builder ignores (resistances,
 * healing, health regeneration) aren't here, and are worth nothing.
 */
const ITEM_STAT_FIELDS: Partial<Record<keyof Stats, readonly FlatStat[]>> = {
  strength: ['str'],
  agility: ['agi'],
  stamina: ['sta'],
  intellect: ['int'],
  spirit: ['spi'],
  armor: ['itemArmor'],
  bonusArmor: ['bonusArmor'],
  defense: ['defense'],
  defenseRating: ['defenseRating'],
  dodge: ['dodge'],
  dodgeRating: ['dodgeRating'],
  parry: ['parry'],
  parryRating: ['parryRating'],
  block: ['block'],
  blockRating: ['blockRating'],
  blockValue: ['blockValue'],
  attackPower: ['ap', 'rap'],
  rangedAttackPower: ['rap'],
  hit: ['hit'],
  crit: ['crit'],
  meleeCrit: ['crit'],
  spellHit: ['spellHit'],
  spellCrit: ['spellCrit'],
  hitRating: ['hitRating'],
  critRating: ['critRating'],
  hasteRating: ['hasteRating'],
  expertiseRating: ['expertiseRating'],
  armorPenetration: ['armorPen'],
  spellPower: ['spellDamage'],
  spellDamage: ['spellDamage'],
  holySpellDamage: ['holySpellDamage'],
  mp5: ['mp5'],
  fireSpellDamage: ['fireSpellDamage'],
  frostSpellDamage: ['frostSpellDamage'],
  shadowSpellDamage: ['shadowSpellDamage'],
  natureSpellDamage: ['natureSpellDamage'],
  arcaneSpellDamage: ['arcaneSpellDamage'],
  spellPenetration: ['spellPen'],
}

const AP_VS: Partial<Record<keyof Stats, SimConfig['fight']['creatureType']>> = {
  attackPowerVsBeasts: 'beast',
  attackPowerVsDemons: 'demon',
  attackPowerVsDragonkin: 'dragonkin',
  attackPowerVsElementals: 'elemental',
  attackPowerVsGiants: 'giant',
  attackPowerVsHumanoids: 'humanoid',
  attackPowerVsMechanical: 'mechanical',
  attackPowerVsUndead: 'undead',
}
const SPELL_VS: Partial<Record<keyof Stats, SimConfig['fight']['creatureType']>> = {
  spellDamageVsBeasts: 'beast',
  spellDamageVsDemons: 'demon',
  spellDamageVsDragonkin: 'dragonkin',
  spellDamageVsElementals: 'elemental',
  spellDamageVsGiants: 'giant',
  spellDamageVsHumanoids: 'humanoid',
  spellDamageVsMechanical: 'mechanical',
  spellDamageVsUndead: 'undead',
}

/** Item stats the plan applies outside the stat block (a weapon's "+x damage", a quiver's speed): their items are measured, not weighed. */
const UNWEIGHED_STATS: ReadonlySet<keyof Stats> = new Set(['weaponDamage', 'rangedAttackSpeed'])

/** The fields an item stat adds to for this character, or null when the stat isn't a flat one (the item is then measured). */
export function statFields(ctx: GearContext, key: keyof Stats): readonly FlatStat[] | null {
  if (UNWEIGHED_STATS.has(key)) return null
  if (key === 'feralAttackPower') return ctx.spec === 'druid-feral-cat' || ctx.spec === 'druid-feral-bear' ? ['ap'] : []
  if (key in AP_VS) return AP_VS[key] === ctx.creatureType ? ['ap', 'rap'] : []
  if (key in SPELL_VS) return SPELL_VS[key] === ctx.creatureType ? ['spellDamage'] : []
  return ITEM_STAT_FIELDS[key] ?? []
}

/**
 * Whether the stat weights can price the item (docs/optimizer.md#gear): its value is all flat stats.
 * A weapon (its damage and speed), a relic (its effect on an ability), an item whose equip or use
 * effect the engine models (`ITEM_EFFECTS`), one with a weapon skill bonus or a stat the plan applies
 * outside the stat block, is measured by a swap instead (./gear-search.ts).
 */
export function weighedItem(ctx: GearContext, item: Item): boolean {
  if (item.itemClass === 'Weapon' || item.slot === 'relic' || ITEM_EFFECTS[item.id]) return false
  if (item.weaponSkill && Object.values(item.weaponSkill).some((v) => v)) return false
  return (Object.entries(item.stats) as [keyof Stats, number][]).every(([key, value]) => !value || statFields(ctx, key) !== null)
}

/** The stat block fields an item adds to, with their amounts (a shield's Classic Era block value included). */
export function itemFieldValues(ctx: GearContext, item: Item): Map<FlatStat, number> {
  const out = statsFieldValues(ctx, item.stats)
  if (item.slot === 'shield' && item.classicShieldBlockValue) out.set('blockValue', (out.get('blockValue') ?? 0) + item.classicShieldBlockValue)
  return out
}

/** The stat block fields flat item stats add to (an item's, or a set bonus's). */
export function statsFieldValues(ctx: GearContext, stats: Partial<Stats>): Map<FlatStat, number> {
  const out = new Map<FlatStat, number>()
  for (const [key, value] of Object.entries(stats) as [keyof Stats, number][]) {
    if (!value) continue
    for (const field of statFields(ctx, key) ?? []) out.set(field, (out.get(field) ?? 0) + value)
  }
  return out
}

/** The stat block fields an enchant adds to, under the setup's rule profile. */
export function enchantFieldValues(ctx: GearContext, enchant: EnchantSpec): Map<FlatStat, number> {
  const out = new Map<FlatStat, number>()
  for (const e of catalogueEffects(enchant, ctx.profile)) if (e.kind === 'stat') out.set(e.stat, (out.get(e.stat) ?? 0) + e.value)
  return out
}

/** Score per point of each stat block field, from ./gear-search.ts's `measureStatWeights`. */
export type StatWeights = Partial<Record<FlatStat, number>>

export function weighValues(values: Map<FlatStat, number>, weights: StatWeights): number {
  let total = 0
  for (const [field, value] of values) total += value * (weights[field] ?? 0)
  return total
}

// --- Rankings ---------------------------------------------------------------------------------

/**
 * What a slot's options are worth, each against the slot empty, in the goal's score (a step ranks
 * its candidates by these; the race decides). An item's value is its stats priced by the weights,
 * or measured by a swap; an enchant's is its own, added to its item's.
 */
export interface Rankings {
  /** Items by their ranking list: a single slot's name, `finger`, `trinket`, `twoHand`, `mainHand` (one-handers) and `offHand`. */
  items: Map<RankList, Map<number, number>>
  /** Enchants by id, against none: weighed, or measured on the slot's item (null when it couldn't be measured there). */
  enchants: Map<string, number | null>
  /** The stat weights the values were priced with (a set bonus's stats are priced with them too). */
  weights: StatWeights
}

export type RankList = Exclude<GearSlot, 'finger1' | 'finger2' | 'trinket1' | 'trinket2' | 'ammo' | 'quiver'> | 'finger' | 'trinket' | 'twoHand'

/** The ranking list an item in a slot is ranked in. */
export function rankList(slot: GearSlot, item: Item): RankList {
  if (slot === 'finger1' || slot === 'finger2') return 'finger'
  if (slot === 'trinket1' || slot === 'trinket2') return 'trinket'
  if (slot === 'mainHand' && isTwoHand(item)) return 'twoHand'
  return slot as RankList
}

/** An item's value in a slot, or −∞ when it wasn't ranked (it then never makes a top list). */
const itemValue = (rankings: Rankings, slot: GearSlot, item: Item): number => rankings.items.get(rankList(slot, item))?.get(item.id) ?? -Infinity

/** A slot's items, best value first (ties by id, so the order is the same everywhere). */
export function topItems(rankings: Rankings, slot: GearSlot, pool: readonly Item[], k: number): Item[] {
  return [...pool]
    .filter((item) => Number.isFinite(itemValue(rankings, slot, item)))
    .sort((a, b) => itemValue(rankings, slot, b) - itemValue(rankings, slot, a) || a.id - b.id)
    .slice(0, k)
}

/**
 * The enchants a step tries on an item in a slot: the `k` best that fit it by value, and every one
 * that fits but couldn't be measured (its value unknown). None when nothing fits.
 */
export function topEnchants(rankings: Rankings, slot: GearSlot, item: Item, k: number): (string | undefined)[] {
  // Only enchants the ranking priced or tried (an excluded one it left out).
  const fitting = enchantsFor(slot, item).filter((e) => rankings.enchants.has(e.id))
  if (fitting.length === 0) return [undefined]
  const known = fitting.filter((e) => rankings.enchants.get(e.id) != null)
  const unknown = fitting.filter((e) => rankings.enchants.get(e.id) == null)
  known.sort((a, b) => rankings.enchants.get(b.id)! - rankings.enchants.get(a.id)! || a.id.localeCompare(b.id))
  return [...known.slice(0, k), ...unknown].map((e) => e.id)
}

/** The best enchant for an item in a slot by value (unmeasured ones aside), or none. */
export function bestEnchant(rankings: Rankings, slot: GearSlot, item: Item): string | undefined {
  const best = topEnchants(rankings, slot, item, 1)[0]
  return best && rankings.enchants.get(best) != null && rankings.enchants.get(best)! > 0 ? best : undefined
}

// --- A step's gear sets -----------------------------------------------------------------------

export interface GroupOptions {
  /** Items a slot keeps by value, beside the current one (D30's build plan: 5 to 8; default 6). */
  perSlot?: number
  /** Enchants each item tries by value, beside the current one (default 2). */
  enchantsPerItem?: number
}

export const PER_SLOT = 6
export const ENCHANTS_PER_ITEM = 2

/** The gear with a slot set (and a ranged weapon's ammo and quiver matched to it). */
function put(gear: Gear, slot: GearSlot, item: Item | undefined, enchantId?: string): Gear {
  const next: Gear = { ...gear }
  if (item) next[slot] = { itemId: item.id, ...(enchantId ? { enchantId } : {}) }
  else delete next[slot]
  return slot === 'ranged' && item ? matchSupplies(next, item) : next
}

/** Each gear set once, and none that's the base, in order. */
function distinct(ctx: GearContext, base: Gear, sets: Gear[]): Gear[] {
  const seen = new Set<string>([keyOf(base)])
  const out: Gear[] = []
  for (const g of sets) {
    const key = keyOf(g)
    if (seen.has(key)) continue
    seen.add(key)
    if (gearProblems(ctx, g, base).length === 0) out.push(g)
  }
  return out
}

const keyOf = (gear: Gear) =>
  (Object.keys(gear) as GearSlot[])
    .filter((s) => gear[s])
    .sort()
    .map((s) => `${s}:${gear[s]!.itemId}+${gear[s]!.enchantId ?? ''}`)
    .join(',')

/** An item with each enchant a step tries on it, and its current enchant when it's the slot's current item. */
function withEnchants(rankings: Rankings, slot: GearSlot, item: Item, current: EquippedItem | undefined, k: number): (string | undefined)[] {
  const list = topEnchants(rankings, slot, item, k)
  if (current?.itemId === item.id && !list.includes(current.enchantId)) list.push(current.enchantId)
  return list
}

/**
 * The gear sets a step of the ascent races for a group, beside the current gear (docs/optimizer.md#gear):
 * - a single slot: its top items by value and the current one, each with its top enchants;
 * - rings and trinkets: every pair of their top items and the current two (Unique rules kept);
 * - the weapons: the top two-handers (each with its top enchants), against every pair of the top main
 *   hands and off hands (each with its best enchant), and the current pair with its hands' top
 *   enchants; a shield spec keeps a one-hander and a shield;
 * - the sets: for each set whose bonus the engine applies, its best pieces in as many slots as each
 *   bonus needs, swapped in together.
 * Locked slots stay as they are. Every set returned is legal (`gearProblems`) and differs from `gear`.
 */
export function groupGears(ctx: GearContext, group: GearGroup, gear: Gear, rankings: Rankings, pools: ReadonlyMap<GearSlot, readonly Item[]>, options: GroupOptions = {}): Gear[] {
  const k = options.perSlot ?? PER_SLOT
  const e = options.enchantsPerItem ?? ENCHANTS_PER_ITEM
  const locked = new Set(ctx.filters.locked ?? [])
  const current = (slot: GearSlot) => itemIn(gear, slot)
  const candidatesFor = (slot: GearSlot, pool: readonly Item[] = pools.get(slot) ?? []) => {
    const top = topItems(rankings, slot, pool, k)
    const now = current(slot)
    return now && !top.some((i) => i.id === now.id) ? [...top, now] : top
  }
  if (group === 'sets') return distinct(ctx, gear, setGears(ctx, gear, rankings, pools, locked))
  const slots = GROUP_SLOTS[group].filter((slot) => !locked.has(slot))
  if (slots.length === 0) return []
  const out: Gear[] = []
  if (group === 'weapons') {
    const mhLocked = locked.has('mainHand')
    const ohLocked = locked.has('offHand')
    const mhPool = pools.get('mainHand') ?? []
    const twoHands = mhPool.filter(isTwoHand)
    const oneHands = mhPool.filter((i) => !isTwoHand(i))
    const now = current('mainHand')
    const nowOff = current('offHand')
    // A two-hander, with the off hand empty.
    if (!mhLocked && !ohLocked)
      for (const item of candidatesFor('mainHand', twoHands).filter(isTwoHand))
        for (const enchant of withEnchants(rankings, 'mainHand', item, gear.mainHand, e)) out.push(put(put(gear, 'mainHand', item, enchant), 'offHand', undefined))
    // A main hand and an off hand, each with its best enchant (the current items keep theirs too).
    const mains = mhLocked ? (now && !isTwoHand(now) ? [now] : []) : candidatesFor('mainHand', oneHands).filter((i) => !isTwoHand(i))
    const offs = ohLocked ? (nowOff ? [nowOff] : []) : candidatesFor('offHand')
    const enchantOf = (slot: GearSlot, item: Item) =>
      gear[slot]?.itemId === item.id && (locked.has(slot) || !bestEnchant(rankings, slot, item)) ? gear[slot]?.enchantId : bestEnchant(rankings, slot, item)
    for (const main of mains) {
      if (offs.length === 0) out.push(put(gear, 'mainHand', main, enchantOf('mainHand', main)))
      for (const off of offs) out.push(put(put(gear, 'mainHand', main, enchantOf('mainHand', main)), 'offHand', off, enchantOf('offHand', off)))
    }
    // The current weapons with other enchants.
    for (const slot of ['mainHand', 'offHand'] as const) {
      const item = current(slot)
      if (!item || locked.has(slot)) continue
      for (const enchant of withEnchants(rankings, slot, item, gear[slot], e)) out.push(put(gear, slot, item, enchant))
    }
    return distinct(ctx, gear, out)
  }
  if (slots.length === 2) {
    // Rings or trinkets: every pair of the top items and the current two.
    const [a, b] = slots
    const pool = candidatesFor(a)
    const other = current(b)
    const list = other && !pool.some((i) => i.id === other.id) ? [...pool, other] : pool
    for (let i = 0; i < list.length; i++)
      for (let j = i; j < list.length; j++) {
        if (i === j && (list[i].unique || list[i].uniqueEquipped)) continue
        out.push(put(put(gear, a, list[i]), b, list[j]))
      }
    return distinct(ctx, gear, out)
  }
  const slot = slots[0]
  for (const item of candidatesFor(slot)) for (const enchant of withEnchants(rankings, slot, item, gear[slot], e)) out.push(put(gear, slot, item, enchant))
  return distinct(ctx, gear, out)
}

/** Whether a set bonus is one the plan applies: flat stats or a weapon skill (src/sim/plan/build.ts). */
export const appliedBonus = (bonus: ItemSet['bonuses'][number]): boolean =>
  Object.keys(bonus.parsed ?? {}).length > 0 || Object.keys(bonus.weaponSkill ?? {}).length > 0

/**
 * The slot a set's piece goes in: its own, or for a ring, trinket or one-hander the one of the pair
 * whose item is worth less (not one another piece took); a two-hander empties the off hand.
 */
function pieceSlot(ctx: GearContext, item: Item, gear: Gear, rankings: Rankings, taken: Set<GearSlot>): GearSlot | null {
  const options = SEARCHED_SLOTS.filter((slot) => !taken.has(slot) && fitsSlot(ctx.classId, slot, item))
  if (options.length === 0) return null
  const value = (slot: GearSlot) => {
    const now = itemIn(gear, slot)
    return now ? itemValue(rankings, slot, now) : -Infinity
  }
  return options.reduce((best, slot) => (value(slot) < value(best) ? slot : best))
}

/** A set's candidates: for each bonus the plan applies, its best pieces in as many slots as it needs. */
function setGears(ctx: GearContext, gear: Gear, rankings: Rankings, pools: ReadonlyMap<GearSlot, readonly Item[]>, locked: ReadonlySet<GearSlot>): Gear[] {
  const worn = wornItems(gear)
  const allowed = new Set([...pools.values()].flat().map((i) => i.id))
  const out: { gear: Gear; gain: number }[] = []
  for (const [setId, set] of Object.entries(ITEM_SETS)) {
    const bonuses = set.bonuses.filter(appliedBonus)
    if (bonuses.length === 0) continue
    const pieces = set.itemIds.flatMap((id) => POOL.get(id) ?? []).filter((i) => allowed.has(i.id) && canUse(ctx.classId, i) && fitsFaction(ctx.race, i))
    const wornPieces = (Object.entries(worn) as [GearSlot, Item][]).filter(([, i]) => i.setId === setId)
    if (pieces.length + wornPieces.length < Math.min(...bonuses.map((b) => b.pieces))) continue
    // Pieces not worn yet, best value first (a piece's value in the first slot it fits).
    const valueOf = (i: Item) => Math.max(...SEARCHED_SLOTS.filter((s) => fitsSlot(ctx.classId, s, i)).map((s) => itemValue(rankings, s, i)))
    const unworn = pieces.filter((i) => !wornPieces.some(([, w]) => w.id === i.id)).sort((a, b) => valueOf(b) - valueOf(a) || a.id - b.id)
    for (const bonus of bonuses) {
      const need = bonus.pieces - wornPieces.length
      if (need <= 0 || need > unworn.length) continue
      let next = gear
      const taken = new Set<GearSlot>([...locked, ...wornPieces.map(([slot]) => slot)])
      let placed = 0
      for (const item of unworn) {
        if (placed === need) break
        const slot = pieceSlot(ctx, item, next, rankings, taken)
        if (!slot) continue
        taken.add(slot)
        // The slot's enchant stays when it fits the piece, else the piece takes its best.
        const kept = next[slot]?.enchantId
        next = put(next, slot, item, kept && enchantFitsId(kept, slot, item) ? kept : bestEnchant(rankings, slot, item))
        if (slot === 'mainHand' && isTwoHand(item)) next = put(next, 'offHand', undefined)
        placed++
      }
      if (placed === need) out.push({ gear: next, gain: estimatedGain(ctx, gear, next, rankings) })
    }
  }
  // The most promising first: every legal one would race, but a set of poor pieces seldom wins.
  return out
    .sort((a, b) => b.gain - a.gain)
    .slice(0, SET_CANDIDATES)
    .map((c) => c.gear)
}

/** The most set candidates a sets step races, by estimated gain (`estimatedGain`). */
export const SET_CANDIDATES = 12

/**
 * What a change of gear is estimated to gain, in score: each changed slot's item and enchant values
 * against the old ones, and the set bonuses (their flat stats, priced by the weights) it turns on or
 * off. A bonus the weights can't price (a weapon skill) counts nothing here; the race measures it.
 */
export function estimatedGain(ctx: GearContext, from: Gear, to: Gear, rankings: Rankings): number {
  let gain = 0
  const value = (slot: GearSlot, entry: EquippedItem | undefined) => {
    const item = entry ? POOL.get(entry.itemId) : undefined
    if (!item) return 0
    const v = itemValue(rankings, slot, item)
    return (Number.isFinite(v) ? v : 0) + (entry?.enchantId ? (rankings.enchants.get(entry.enchantId) ?? 0) : 0)
  }
  for (const slot of SEARCHED_SLOTS) if (!sameEquipped(from[slot], to[slot])) gain += value(slot, to[slot]) - value(slot, from[slot])
  const bonusValue = (gear: Gear) => {
    const counts = new Map<string, number>()
    for (const item of Object.values(wornItems(gear))) if (item.setId) counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1)
    let total = 0
    for (const [setId, count] of counts)
      for (const bonus of ITEM_SETS[setId]?.bonuses ?? []) if (bonus.pieces <= count && bonus.parsed) total += weighValues(statsFieldValues(ctx, bonus.parsed), rankings.weights)
    return total
  }
  return gain + bonusValue(to) - bonusValue(from)
}

const enchantFitsId = (id: string, slot: GearSlot, item: Item) => {
  const enchant = ENCHANTS.find((e) => e.id === id)
  return enchant !== undefined && enchantFits(enchant, slot, item)
}

/**
 * The greedy set a restart begins from (D30's build plan): each slot's best item by value with its
 * best enchant, the rings' and trinkets' best two that go together, and the weapons' best of a
 * two-hander or a main and an off hand, by the sum of their values. Locked slots stay. Not raced:
 * it's a start, which the ascent then improves.
 */
export function greedyGear(ctx: GearContext, gear: Gear, rankings: Rankings, pools: ReadonlyMap<GearSlot, readonly Item[]>): Gear {
  const locked = new Set(ctx.filters.locked ?? [])
  let next: Gear = { ...gear }
  const enchanted = (slot: GearSlot, item: Item) => bestEnchant(rankings, slot, item)
  const total = (slot: GearSlot, item: Item) => itemValue(rankings, slot, item) + (rankings.enchants.get(enchanted(slot, item) ?? '') ?? 0)
  for (const group of GEAR_GROUPS) {
    if (group === 'sets' || group === 'weapons') continue
    const slots = GROUP_SLOTS[group].filter((s) => !locked.has(s))
    for (const slot of slots) {
      const list = topItems(rankings, slot, pools.get(slot) ?? [], 8)
      const item = list.find((i) => gearProblems(ctx, put(next, slot, i, enchanted(slot, i)), next).length === 0)
      if (item && total(slot, item) > (itemIn(next, slot) ? total(slot, itemIn(next, slot)!) : -Infinity)) next = put(next, slot, item, enchanted(slot, item))
    }
  }
  if (!locked.has('mainHand') && !locked.has('offHand')) {
    const mh = pools.get('mainHand') ?? []
    const best2h = topItems(rankings, 'mainHand', mh.filter(isTwoHand), 1)[0]
    const best1h = topItems(rankings, 'mainHand', mh.filter((i) => !isTwoHand(i)), 1)[0]
    const bestOff = best1h ? topItems(rankings, 'offHand', (pools.get('offHand') ?? []).filter((i) => gearProblems(ctx, put(put(next, 'mainHand', best1h), 'offHand', i), next).length === 0), 1)[0] : undefined
    const dual = best1h ? total('mainHand', best1h) + (bestOff ? total('offHand', bestOff) : 0) : -Infinity
    const two = best2h ? total('mainHand', best2h) : -Infinity
    const options: Gear[] = []
    if (two > dual && best2h) options.push(put(put(next, 'mainHand', best2h, enchanted('mainHand', best2h)), 'offHand', undefined))
    if (best1h) options.push(put(bestOff ? put(next, 'offHand', bestOff, enchanted('offHand', bestOff)) : next, 'mainHand', best1h, enchanted('mainHand', best1h)))
    const legal = options.find((g) => gearProblems(ctx, g, next).length === 0)
    if (legal) next = legal
  }
  return next
}
