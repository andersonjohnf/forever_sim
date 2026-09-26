// An item's tooltip as the game shows it, as lines (docs/ux.md "Item tooltips"). Pure: no React.
// Built from the item pool (src/data/items/pre-bis.json, as the browser build ships it: no flavor
// text, sell price or stat-spell ids) and the enchant's client name (enchant-lines.ts).
import type { Item, ItemSlot, Stats, WeaponSkill, WeaponType } from '@/data/items/types'
import type { Faction } from '@/data/races/types'
import { itemData, itemsById } from '@/lib/items'
import { itemFaction, type RuleProfileId } from '@/sim'
import { ITEM_EFFECTS } from '@/sim/effects/items'
import { setOf } from '@/sim/plan/build'
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
  /**
   * The rule profile. Forever by default. Under Classic Era rules the enchant takes Classic Era's
   * name where its number differs, and an item whose effect that profile simulates differently
   * says so in a note.
   */
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
 * The Equip lines for the stats no client line words, in this order: the Forever client's stat
 * columns, worded by its own `ITEM_MOD_*` strings ([gs-forever], docs/ux.md "Item tooltips"): the
 * long form after "Equip: " where the client has one ("Increases your critical strike by 28."), and
 * "+N" with the short form where it has only that ("+81 Attack Power Vs Undead."). Which form the
 * game prints is `[?]`. Stats that only equip spells give (percentages, defense skill) have no
 * `ITEM_MOD_*` string: each spell's own client line shows them (`item.statEquip`), and the words
 * here, the Classic Era descriptions of the same auras, stand in only for a spell the client
 * leaves without one (no pool item has such a spell; a test holds it).
 */
const EQUIP_STATS: { key: keyof Stats; line: (n: number) => string }[] = [
  { key: 'defense', line: (n) => `Increased Defense +${n}.` },
  { key: 'defenseRating', line: (n) => `Increases defense skill by ${n}.` },
  { key: 'dodge', line: (n) => `Increases your chance to dodge an attack by ${n}%.` },
  { key: 'dodgeRating', line: (n) => `Increases your dodge by ${n}.` },
  { key: 'parry', line: (n) => `Increases your chance to parry an attack by ${n}%.` },
  { key: 'parryRating', line: (n) => `Increases your parry by ${n}.` },
  { key: 'block', line: (n) => `Increases your chance to block attacks with a shield by ${n}%.` },
  { key: 'blockRating', line: (n) => `Increases your shield block by ${n}.` },
  { key: 'blockValue', line: (n) => `Increases the block value of your shield by ${n}.` },
  { key: 'hit', line: (n) => `Improves your chance to hit by ${n}%.` },
  { key: 'hitRating', line: (n) => `Increases your hit by ${n}.` },
  { key: 'spellHit', line: (n) => `Improves your chance to hit with spells by ${n}%.` },
  { key: 'crit', line: (n) => `Improves your chance to get a critical strike by ${n}%.` },
  { key: 'meleeCrit', line: (n) => `Improves your chance to get a critical strike with melee attacks by ${n}%.` },
  { key: 'critRating', line: (n) => `Increases your critical strike by ${n}.` },
  { key: 'spellCrit', line: (n) => `Improves your chance to get a critical strike with spells by ${n}%.` },
  { key: 'hasteRating', line: (n) => `Increases your haste by ${n}.` },
  { key: 'expertiseRating', line: (n) => `Increases your expertise by ${n}.` },
  { key: 'armorPenetration', line: (n) => `Increases your armor piercing by ${n}.` },
  { key: 'attackPower', line: (n) => `Increases attack power by ${n}.` },
  { key: 'rangedAttackPower', line: (n) => `Increases ranged attack power by ${n}.` },
  { key: 'feralAttackPower', line: (n) => `Increases attack power by ${n} in Cat, Bear, Dire Bear, and Moonkin forms only.` },
  ...CREATURES.map((c) => ({ key: `attackPowerVs${c}` as keyof Stats, line: (n: number) => `+${n} Attack Power Vs ${c}.` })),
  { key: 'weaponDamage', line: (n) => `Increases physical damage done by up to ${n}.` },
  { key: 'rangedAttackSpeed', line: (n) => `Increases ranged attack speed by ${n}%.` },
  { key: 'spellPower', line: (n) => `Increases spell power by ${n}.` },
  { key: 'healing', line: (n) => `Increases healing done by magical spells and effects by up to ${n}.` },
  { key: 'spellDamage', line: (n) => `Increases damage done by magical spells and effects by up to ${n}.` },
  ...SCHOOLS.map((s) => ({
    key: `${s.toLowerCase()}SpellDamage` as keyof Stats,
    line: (n: number) => `Increases ${s.toLowerCase()} damage done by up to ${n}.`,
  })),
  ...CREATURES.map((c) => ({ key: `spellDamageVs${c}` as keyof Stats, line: (n: number) => `+${n} Spell Damage Vs ${c}.` })),
  { key: 'spellPenetration', line: (n) => `Increases spell piercing by ${n}.` },
  { key: 'mp5', line: (n) => `Restores ${n} mana per 5 sec.` },
  { key: 'hp5', line: (n) => `Restores ${n} health per 5 sec.` },
  { key: 'healthRegen', line: (n) => `Restores ${n} health per 5 sec.` },
]

/** The tooltip's own words for a stat no client line gives, without the "Equip: " (`EQUIP_STATS`); undefined for a white stat. */
export function equipStatText(key: keyof Stats, value: number): string | undefined {
  return EQUIP_STATS.find((s) => s.key === key)?.line(value)
}

type StatValues = Partial<Record<keyof Stats, number>>
type SkillValues = Partial<Record<WeaponSkill, number>>

/** Who words an item's stats (`statSources`). */
interface StatSources {
  /** The client's own Equip line for each stat spell that has one, unless the item's effect lines already show it. */
  lines: string[]
  /** What's left for the tooltip to word: stat columns, armor, resistances, and a stat spell the client leaves without a line. */
  stats: StatValues
  weaponSkill: SkillValues
}

/** The item's stats split by who words them: the client's stat-spell lines, or the tooltip (docs/data/items.md#stat-spell-text). */
function statSources(item: Item): StatSources {
  const stats: StatValues = { ...item.stats }
  const weaponSkill: SkillValues = { ...item.weaponSkill }
  const shown = new Set([...item.otherEquip, ...item.procs, ...item.useEffects].map((e) => e.spellId))
  const lines: string[] = []
  for (const spell of item.statEquip) {
    for (const [key, value] of Object.entries(spell.stats) as [keyof Stats, number][]) stats[key] = (stats[key] ?? 0) - value
    for (const [skill, value] of Object.entries(spell.weaponSkill ?? {}) as [WeaponSkill, number][]) weaponSkill[skill] = (weaponSkill[skill] ?? 0) - value
    if (!shown.has(spell.spellId)) lines.push(spell.raw)
  }
  return { lines, stats, weaponSkill }
}

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

function whiteStatLines(item: Item, stats: StatValues): TooltipLine[] {
  const lines: TooltipLine[] = []
  // The Forever tooltip adds stat 50's bonus armor to the white armor line (docs/data/client.md
  // "Armor"); an equip spell's "+200 Armor." is its own Equip line (`statSources`).
  const armor = (stats.armor ?? 0) + (stats.bonusArmor ?? 0)
  if (armor) lines.push({ text: `${armor} Armor`, tone: 'white' })
  // Classic Era's innate block value, on a shield whose values fall back to Classic Era's (docs/data/items.md).
  if (item.classicShieldBlockValue) lines.push({ text: `${item.classicShieldBlockValue} Block`, tone: 'white' })
  for (const [key, label] of PRIMARY) {
    const value = stats[key]
    if (value) lines.push({ text: `${signed(value)} ${label}`, tone: 'white' })
  }
  const resists = RESISTANCES.map(([key]) => stats[key] ?? 0)
  // Forever's stat 124 gives all five as one stat (docs/data/client.md): an Equip line (`equipLines`).
  if (!allResistances(item, stats)) {
    RESISTANCES.forEach(([, school], i) => {
      if (resists[i]) lines.push({ text: `${signed(resists[i])} ${school} Resistance`, tone: 'white' })
    })
  }
  return lines
}

/** Forever's stat 124, all five resistances as one: the five equal, on an item whose values are Forever's. */
function allResistances(item: Item, stats: StatValues): number | null {
  const resists = RESISTANCES.map(([key]) => stats[key] ?? 0)
  return item.statsFrom === 'forever' && resists[0] && resists.every((r) => r === resists[0]) ? resists[0] : null
}

/**
 * The PvP rank titles, ranks 1 to 14, by faction: the client's `PVP_RANK_<rank + 4>_<0 Horde, 1
 * Alliance>` strings ([gs-forever]; the four dishonorable ranks come first, as `RequiredPVPRank`
 * counts them).
 */
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

/**
 * A PvP rank requirement as the game words it, "Requires Lieutenant Commander": the rank's title in
 * the faction that can wear the item (the one its name gives, `itemFaction`). The game names the
 * reader's own faction's title, and only that faction can wear the item here. Where the item suits
 * both and the titles differ, the data's "Requires PvP rank N" stands.
 */
function pvpRankLine(item: Item, rank: number, text: string): string {
  const faction = itemFaction(item)
  const titles = faction ? [PVP_RANK_TITLES[faction][rank - 1]] : [PVP_RANK_TITLES.Alliance[rank - 1], PVP_RANK_TITLES.Horde[rank - 1]]
  return titles[0] && titles.every((t) => t === titles[0]) ? `Requires ${titles[0]}` : text
}

function requirementLines(item: Item): TooltipLine[] {
  const lines: TooltipLine[] = []
  if (item.classes) lines.push({ text: `Classes: ${item.classes.join(', ')}`, tone: 'white' })
  if (item.races) lines.push({ text: `Races: ${item.races.join(', ')}`, tone: 'white' })
  if (item.reqLevel) lines.push({ text: `Requires Level ${item.reqLevel}`, tone: 'white' })
  for (const requirement of item.requirements) {
    const text = requirement.kind === 'pvpRank' && requirement.level ? pvpRankLine(item, requirement.level, requirement.text) : requirement.text
    lines.push({ text, tone: 'white' })
  }
  lines.push({ text: `Item Level ${item.itemLevel}`, tone: 'gold' })
  return lines
}

/** The note under an item effect the Classic Era profile simulates as Classic Era has it (docs/ux.md "Item tooltips"). */
export const CLASSIC_ERA_EFFECT_NOTE = 'Classic Era rules simulate this effect as Classic Era has it.'

/** An effect the Classic Era profile simulates as that client has it: a function of the profile in `ITEM_EFFECTS`. */
const differsUnderClassicEra = (item: Item) => typeof ITEM_EFFECTS[item.id]?.effects === 'function'

function equipLines(item: Item, sources: StatSources, profile: RuleProfileId): TooltipLine[] {
  const { stats, weaponSkill } = sources
  const lines: TooltipLine[] = []
  const all = allResistances(item, stats)
  if (all) lines.push({ text: `Equip: Increases spell resistance by ${all}.`, tone: 'green' })
  for (const { key, line } of EQUIP_STATS) {
    const value = stats[key]
    if (value) lines.push({ text: `Equip: ${line(value)}`, tone: 'green' })
  }
  for (const [skill, value] of Object.entries(weaponSkill) as [WeaponSkill, number][]) {
    if (value) lines.push({ text: `Equip: Increases ${skill.toLowerCase()} skill by ${value}.`, tone: 'green' })
  }
  for (const text of sources.lines) lines.push({ text, tone: 'green' })
  // The client's own lines, prefix and cooldown included (docs/data/items.md#effect-and-set-bonus-text).
  // A generated line is the scraper's words for a spell the game describes with nothing: left out.
  for (const effect of [...item.otherEquip, ...item.procs, ...item.useEffects]) {
    if (!effect.generated) lines.push({ text: effect.raw, tone: 'green' })
  }
  // The lines stay the Forever client's under Classic Era rules; an effect that profile simulates
  // as Classic Era's (Hand of Justice's chance, Ironfoe's) says so.
  if (profile === 'classicEra' && differsUnderClassicEra(item)) lines.push({ text: CLASSIC_ERA_EFFECT_NOTE, tone: 'grey' })
  return lines
}

function setLines(item: Item, worn: ReadonlySet<number>): TooltipLine[] {
  // The set the item counts toward: a Classic Era row can carry a set id Forever reuses for another set (`setOf`).
  const setId = setOf(item)
  const set = setId ? itemData.sets[setId] : undefined
  if (!set) return []
  const size = set.size ?? set.itemIds.length
  const count = set.itemIds.filter((id) => worn.has(id)).length
  const lines: TooltipLine[] = [{ text: `${set.name} (${count}/${size})`, tone: 'gold', gapBefore: true }]
  // Pieces outside the pool have no name in the data (docs/ux.md "Item tooltips"): they're left out.
  for (const id of set.itemIds) {
    const piece = itemsById.get(id)
    if (piece) lines.push({ text: piece.name, tone: worn.has(id) ? 'worn' : 'grey', indent: true })
  }
  // The client's ITEM_SET_BONUS "Set: %s" for a bonus reached, ITEM_SET_BONUS_GRAY "(%d) Set: %s" for one not.
  set.bonuses.forEach((bonus, i) => {
    const active = count >= bonus.pieces
    lines.push({ text: active ? `Set: ${bonus.text}` : `(${bonus.pieces}) Set: ${bonus.text}`, tone: active ? 'green' : 'grey', gapBefore: i === 0 })
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
  const sources = statSources(item)
  lines.push(...weaponLines(item), ...ammoLines(item), ...whiteStatLines(item, sources.stats))
  const enchant = enchantTooltipLine(enchantId, profile)
  if (enchant) lines.push({ text: enchant, tone: 'green' })
  lines.push(...requirementLines(item), ...equipLines(item, sources, profile), ...setLines(item, wornIds))
  return lines
}

/** The tooltip as plain text, one line a row and the two columns joined by a tab: for tests and screen readers. */
export function tooltipText(lines: readonly TooltipLine[]): string {
  return lines.map((l) => (l.right ? `${l.text}\t${l.right}` : l.text)).join('\n')
}
