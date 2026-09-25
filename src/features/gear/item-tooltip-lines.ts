// An item's tooltip as the game shows it, as lines (docs/ux.md "Item tooltips"). Pure: no React.
// Built from the item pool (src/data/items/pre-bis.json, as the browser build ships it: no flavor
// text, sell price or stat-spell ids) and the enchant's client name (enchant-lines.ts).
import type { Item, ItemSlot, Stats, WeaponType } from '@/data/items/types'
import { itemData, itemsById } from '@/lib/items'
import type { RuleProfileId } from '@/sim'
import { enchantTooltipLine } from './enchant-lines'

/**
 * The game's text colours: white for the item's own facts, green for Equip, Use and Chance on hit
 * lines, the enchant and an active set bonus, gold for the set's name and the item level, grey for
 * a set piece not worn and a bonus not reached, and pale yellow for a set piece worn.
 */
export type TooltipTone = 'white' | 'green' | 'gold' | 'grey' | 'worn'

export interface TooltipLine {
  text: string
  /** The right-hand column, where the game has two: the type beside the slot, the speed beside the damage. */
  right?: string
  tone: TooltipTone
  /** The name line: shown in this quality's colour, a size up. */
  quality?: number
  /** Indented, as the set's pieces are. */
  indent?: boolean
  /** A blank line's space above it, as before the set and before its bonuses. */
  gapBefore?: boolean
}

/**
 * The tooltip panel's colours. The panel is dark in both themes, as the game's is (docs/ux.md "Item
 * tooltips"); `item-tooltip-lines.test.ts` holds every text colour to 4.5:1 or more on it. The
 * quality colours are the game's where they reach that (Uncommon, Legendary) and the app's
 * dark-theme ones otherwise (Rare #0070dd and Epic #a335ee are about 4:1 on the panel), as `QUALITY_CLASS`.
 */
export const TOOLTIP_PALETTE = {
  panel: '#0b0d1a',
  border: '#565d7e',
  tone: { white: '#ffffff', green: '#1eff00', gold: '#ffd100', grey: '#9d9d9d', worn: '#ffff99' } satisfies Record<TooltipTone, string>,
  quality: { 0: '#9d9d9d', 1: '#ffffff', 2: '#1eff00', 3: '#4da3ff', 4: '#c27ef7', 5: '#ff8000' } as Record<number, string>,
}

export interface TooltipOptions {
  /** The enchant on the item: an EnchantDefinition id. */
  enchantId?: string | null
  /** The rule profile, for the enchant's numbers under Classic Era rules. Forever by default. */
  profile?: RuleProfileId
  /** The ids of the items worn, to count the set's pieces and light the bonuses reached. */
  worn?: Iterable<number>
}

const BINDING: Record<string, string> = {
  BoP: 'Binds when picked up',
  BoE: 'Binds when equipped',
  BoU: 'Binds when used',
  Quest: 'Quest Item',
}

/** The slot as the game names it (its INVTYPE strings). Quivers and ammo pouches show their subclass instead. */
const SLOT: Record<ItemSlot, string | null> = {
  head: 'Head',
  neck: 'Neck',
  shoulder: 'Shoulder',
  back: 'Back',
  chest: 'Chest',
  wrist: 'Wrist',
  hands: 'Hands',
  waist: 'Waist',
  legs: 'Legs',
  feet: 'Feet',
  finger: 'Finger',
  trinket: 'Trinket',
  twoHand: 'Two-Hand',
  mainHand: 'Main Hand',
  oneHand: 'One-Hand',
  offHand: 'Off Hand',
  shield: 'Off Hand',
  heldInOffHand: 'Held In Off-hand',
  ranged: 'Ranged',
  thrown: 'Thrown',
  relic: 'Relic',
  ammo: 'Projectile',
  quiver: null,
}

const WEAPON: Record<WeaponType, string> = {
  axe: 'Axe',
  bow: 'Bow',
  crossbow: 'Crossbow',
  dagger: 'Dagger',
  fist: 'Fist Weapon',
  gun: 'Gun',
  mace: 'Mace',
  polearm: 'Polearm',
  staff: 'Staff',
  sword: 'Sword',
  thrown: 'Thrown',
  wand: 'Wand',
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)

/** The right-hand type: the weapon's kind, the armor's, "Shield", the relic's or projectile's subclass; none for jewelry, cloaks and held items. */
function typeName(item: Item): string | undefined {
  if (item.weaponType) return WEAPON[item.weaponType]
  if (item.slot === 'back') return undefined
  if (item.armorType) return capitalize(item.armorType)
  if (item.slot === 'shield') return 'Shield'
  if (item.slot === 'relic' || item.slot === 'ammo') return item.itemSubclass
  return undefined
}

/** A stat's sign, with a minus sign for a stat an item takes away (Crown of Tyranny's Spirit). */
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

const PRIMARY: [keyof Stats, string][] = [
  ['strength', 'Strength'],
  ['agility', 'Agility'],
  ['stamina', 'Stamina'],
  ['intellect', 'Intellect'],
  ['spirit', 'Spirit'],
]

/** The game's resistance order. */
const RESISTANCES: [keyof Stats, string][] = [
  ['fireResistance', 'Fire'],
  ['natureResistance', 'Nature'],
  ['frostResistance', 'Frost'],
  ['shadowResistance', 'Shadow'],
  ['arcaneResistance', 'Arcane'],
]

const CREATURES = ['Beasts', 'Demons', 'Dragonkin', 'Elementals', 'Giants', 'Humanoids', 'Mechanical', 'Undead'] as const
const SCHOOLS = ['Arcane', 'Fire', 'Frost', 'Holy', 'Nature', 'Shadow'] as const

/**
 * The Equip lines for the stats that aren't white ones, in this order, each worded two ways:
 * `forever`, the Forever client's stat columns ("+28 Critical Strike Rating", the words
 * docs/data/items.md and the `Stats` type quote), and `classic`, the Classic Era equip spells'
 * descriptions, as the pool's set bonuses render the same auras from the client ("Improves your
 * chance to hit by 1%."). An item whose values are the Forever client's has only stat columns and
 * the Classic ones only spells (docs/data/client.md "Aura → stat"), so `statsFrom` picks the words.
 * Where only one wording is known, both use it.
 */
const EQUIP_STATS: { key: keyof Stats; forever: (n: number) => string; classic?: (n: number) => string }[] = [
  { key: 'defense', forever: (n) => `Increased Defense +${n}.` },
  { key: 'defenseRating', forever: (n) => `+${n} Defense Rating.` },
  { key: 'dodge', forever: (n) => `Increases your chance to dodge an attack by ${n}%.` },
  { key: 'dodgeRating', forever: (n) => `+${n} Dodge Rating.` },
  { key: 'parry', forever: (n) => `Increases your chance to parry an attack by ${n}%.` },
  { key: 'parryRating', forever: (n) => `+${n} Parry Rating.` },
  { key: 'block', forever: (n) => `Increases your chance to block attacks with a shield by ${n}%.` },
  { key: 'blockRating', forever: (n) => `+${n} Block Rating.` },
  // Barrier Shield's 22912, as the Forever client describes it (docs/data/client.md "Aura → stat").
  { key: 'blockValue', forever: (n) => `Increases the block value of your shield by ${n}.` },
  { key: 'hit', forever: (n) => `Improves your chance to hit by ${n}%.` },
  { key: 'hitRating', forever: (n) => `+${n} Hit Rating.` },
  { key: 'spellHit', forever: (n) => `Improves your chance to hit with spells by ${n}%.` },
  { key: 'crit', forever: (n) => `Improves your chance to get a critical strike by ${n}%.` },
  { key: 'meleeCrit', forever: (n) => `Improves your chance to get a critical strike with melee attacks by ${n}%.` },
  { key: 'critRating', forever: (n) => `+${n} Critical Strike Rating.` },
  { key: 'spellCrit', forever: (n) => `Improves your chance to get a critical strike with spells by ${n}%.` },
  { key: 'hasteRating', forever: (n) => `+${n} Haste Rating.` },
  { key: 'expertiseRating', forever: (n) => `+${n} Expertise Rating.` },
  { key: 'armorPenetration', forever: (n) => `+${n} Armor Penetration Rating.` },
  { key: 'attackPower', forever: (n) => `+${n} Attack Power.` },
  { key: 'rangedAttackPower', forever: (n) => `+${n} Ranged Attack Power.`, classic: (n) => `+${n} ranged Attack Power.` },
  { key: 'feralAttackPower', forever: (n) => `+${n} Attack Power in Cat, Bear, and Dire Bear forms only.` },
  ...CREATURES.map((c) => ({ key: `attackPowerVs${c}` as keyof Stats, forever: (n: number) => `+${n} Attack Power when fighting ${c}.` })),
  { key: 'weaponDamage', forever: (n) => `+${n} Weapon Damage.` },
  { key: 'rangedAttackSpeed', forever: (n) => `Increases ranged attack speed by ${n}%.` },
  {
    key: 'spellPower',
    forever: (n) => `+${n} Spell Power.`,
    classic: (n) => `Increases damage and healing done by magical spells and effects by up to ${n}.`,
  },
  { key: 'healing', forever: (n) => `+${n} Healing.`, classic: (n) => `Increases healing done by spells and effects by up to ${n}.` },
  {
    key: 'spellDamage',
    forever: (n) => `+${n} Spell Damage.`,
    classic: (n) => `Increases damage done by magical spells and effects by up to ${n}.`,
  },
  ...SCHOOLS.map((s) => ({
    key: `${s.toLowerCase()}SpellDamage` as keyof Stats,
    forever: (n: number) => `Increases damage done by ${s} spells and effects by up to ${n}.`,
  })),
  ...CREATURES.map((c) => ({
    key: `spellDamageVs${c}` as keyof Stats,
    forever: (n: number) => `Increases damage done to ${c} by magical spells and effects by up to ${n}.`,
  })),
  { key: 'spellPenetration', forever: (n) => `Decreases the magical resistances of your spell targets by ${n}.` },
  { key: 'mp5', forever: (n) => `+${n} Mana Regeneration.`, classic: (n) => `Restores ${n} mana per 5 sec.` },
  { key: 'hp5', forever: (n) => `Restores ${n} health per 5 sec.` },
  { key: 'healthRegen', forever: (n) => `+${n} Health Regeneration.` },
]

function weaponLines(item: Item): TooltipLine[] {
  const weapon = item.weapon
  if (!weapon) return []
  const lines: TooltipLine[] = []
  const speed = `Speed ${weapon.speed.toFixed(2)}`
  if (weapon.min !== null && weapon.max !== null) {
    const school = weapon.school === 'Physical' ? '' : ` ${weapon.school}`
    lines.push({ text: `${weapon.min} - ${weapon.max}${school} Damage`, right: speed, tone: 'white' })
  } else {
    lines.push({ text: speed, tone: 'white' })
  }
  for (const extra of weapon.extraDamage ?? []) {
    lines.push({ text: `+${extra.min} - ${extra.max}${extra.school ? ` ${extra.school}` : ''} Damage`, tone: 'white' })
  }
  if (weapon.dps) lines.push({ text: `(${weapon.dps.toFixed(1)} damage per second)`, tone: 'white' })
  return lines
}

/** An arrow's or bullet's damage, as Classic Era's tooltip words it (docs/data/items.md#ammo-and-quivers). */
function ammoLines(item: Item): TooltipLine[] {
  return item.ammo ? [{ text: `Adds ${item.ammo.dps.toFixed(1)} damage per second`, tone: 'white' }] : []
}

function whiteStatLines(item: Item): TooltipLine[] {
  const stats = item.stats as Partial<Record<keyof Stats, number>>
  const lines: TooltipLine[] = []
  // The Forever tooltip adds stat 50's bonus armor to the white armor line (docs/data/client.md "Armor").
  const armor = (stats.armor ?? 0) + (stats.bonusArmor ?? 0)
  if (armor) lines.push({ text: `${armor} Armor`, tone: 'white' })
  // Classic Era's innate block value, on a shield whose values fall back to Classic Era's (docs/data/items.md).
  if (item.classicShieldBlockValue) lines.push({ text: `${item.classicShieldBlockValue} Block`, tone: 'white' })
  for (const [key, label] of PRIMARY) {
    const value = stats[key]
    if (value) lines.push({ text: `${signed(value)} ${label}`, tone: 'white' })
  }
  const resists = RESISTANCES.map(([key]) => stats[key] ?? 0)
  // Forever's stat 124 gives all five as one line, "+N Spell Resistance" (docs/data/client.md).
  if (item.statsFrom === 'forever' && resists[0] && resists.every((r) => r === resists[0])) {
    lines.push({ text: `${signed(resists[0])} Spell Resistance`, tone: 'white' })
  } else {
    RESISTANCES.forEach(([, school], i) => {
      if (resists[i]) lines.push({ text: `${signed(resists[i])} ${school} Resistance`, tone: 'white' })
    })
  }
  return lines
}

function requirementLines(item: Item): TooltipLine[] {
  const lines: TooltipLine[] = []
  if (item.classes) lines.push({ text: `Classes: ${item.classes.join(', ')}`, tone: 'white' })
  if (item.races) lines.push({ text: `Races: ${item.races.join(', ')}`, tone: 'white' })
  if (item.reqLevel) lines.push({ text: `Requires Level ${item.reqLevel}`, tone: 'white' })
  for (const requirement of item.requirements) lines.push({ text: requirement.text, tone: 'white' })
  lines.push({ text: `Item Level ${item.itemLevel}`, tone: 'gold' })
  return lines
}

function equipLines(item: Item): TooltipLine[] {
  const stats = item.stats as Partial<Record<keyof Stats, number>>
  const lines: TooltipLine[] = []
  for (const { key, forever, classic } of EQUIP_STATS) {
    const value = stats[key]
    if (value) lines.push({ text: `Equip: ${(item.statsFrom === 'classic' && classic ? classic : forever)(value)}`, tone: 'green' })
  }
  for (const [skill, value] of Object.entries(item.weaponSkill ?? {})) {
    if (value) lines.push({ text: `Equip: Increased ${skill} +${value}.`, tone: 'green' })
  }
  // The client's own lines, prefix and cooldown included (docs/data/items.md#effect-and-set-bonus-text).
  for (const effect of [...item.otherEquip, ...item.procs, ...item.useEffects]) lines.push({ text: effect.raw, tone: 'green' })
  return lines
}

function setLines(item: Item, worn: ReadonlySet<number>): TooltipLine[] {
  const set = item.setId ? itemData.sets[item.setId] : undefined
  if (!set) return []
  const size = set.size ?? set.itemIds.length
  const count = set.itemIds.filter((id) => worn.has(id)).length
  const lines: TooltipLine[] = [{ text: `${set.name} (${count}/${size})`, tone: 'gold', gapBefore: true }]
  // Pieces outside the pool have no name in the data (docs/ux.md "Item tooltips"): they're left out.
  for (const id of set.itemIds) {
    const piece = itemsById.get(id)
    if (piece) lines.push({ text: piece.name, tone: worn.has(id) ? 'worn' : 'grey', indent: true })
  }
  set.bonuses.forEach((bonus, i) => {
    lines.push({ text: `(${bonus.pieces}) Set: ${bonus.text}`, tone: count >= bonus.pieces ? 'green' : 'grey', gapBefore: i === 0 })
  })
  return lines
}

/**
 * The item's tooltip, top to bottom as the game orders it: name; binding; unique; slot and type;
 * weapon damage, speed and damage per second; armor and block; primary stats; resistances; the
 * enchant; classes, races and requirements; required level and item level; the Equip, Use and
 * Chance on hit lines; the set, its pieces and its bonuses. A fact the data doesn't carry is left
 * out, never guessed.
 */
export function itemTooltipLines(item: Item, { enchantId, profile = 'forever', worn = [] }: TooltipOptions = {}): TooltipLine[] {
  const wornIds = new Set(worn)
  const lines: TooltipLine[] = [{ text: item.name, tone: 'white', quality: item.quality }]
  if (item.binding && BINDING[item.binding]) lines.push({ text: BINDING[item.binding], tone: 'white' })
  if (item.uniqueEquipped) {
    const { group, max } = item.uniqueEquipped
    lines.push({ text: group ? `Unique-Equipped: ${group} (${max})` : 'Unique-Equipped', tone: 'white' })
  } else if (item.unique) {
    lines.push({ text: 'Unique', tone: 'white' })
  }
  const slot = SLOT[item.slot] ?? item.itemSubclass
  lines.push({ text: slot, right: typeName(item), tone: 'white' })
  lines.push(...weaponLines(item), ...ammoLines(item), ...whiteStatLines(item))
  const enchant = enchantTooltipLine(enchantId, profile)
  if (enchant) lines.push({ text: enchant, tone: 'green' })
  lines.push(...requirementLines(item), ...equipLines(item), ...setLines(item, wornIds))
  return lines
}

/** The tooltip as plain text, one line a row and the two columns joined by a tab: for tests and screen readers. */
export function tooltipText(lines: readonly TooltipLine[]): string {
  return lines.map((l) => (l.right ? `${l.text}\t${l.right}` : l.text)).join('\n')
}
