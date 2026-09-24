import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData, Stats } from '@/data/items/types'

export const itemData = itemJson as unknown as ItemData
export const itemsById = new Map<number, Item>(itemData.items.map((i) => [i.id, i]))

/** Item quality text colors, AA contrast in both themes (docs/ux.md#visual-language). */
export const QUALITY_CLASS: Record<number, string> = {
  0: 'text-muted-foreground',
  1: 'text-foreground',
  2: 'text-[#1a8a00] dark:text-[#1eff00]',
  3: 'text-[#0062c4] dark:text-[#4da3ff]',
  4: 'text-[#8a2bd0] dark:text-[#c27ef7]',
  5: 'text-[#b35900] dark:text-[#ff8000]',
}

export const QUALITY_NAME: Record<number, string> = {
  0: 'Poor',
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
}

/** Stats shown in one-line summaries, in display order, with short labels. */
const SUMMARY_STATS: [keyof Stats, string, '%' | ''][] = [
  ['strength', 'Str', ''],
  ['agility', 'Agi', ''],
  ['stamina', 'Sta', ''],
  ['intellect', 'Int', ''],
  ['spirit', 'Spi', ''],
  ['attackPower', 'AP', ''],
  // Ranged attack power beyond the melee-and-ranged AP line, and a quiver's ranged attack speed (docs/mechanics/ranged-and-pets.md §1).
  ['rangedAttackPower', 'Ranged AP', ''],
  ['rangedAttackSpeed', 'Ranged speed', '%'],
  ['feralAttackPower', 'Feral AP', ''],
  ['hitRating', 'Hit', ''],
  ['hit', 'Hit', '%'],
  ['critRating', 'Crit', ''],
  ['crit', 'Crit', '%'],
  ['meleeCrit', 'Crit', '%'],
  ['hasteRating', 'Haste', ''],
  ['expertiseRating', 'Expertise', ''],
  ['armorPenetration', 'Armor pen', ''],
  ['defenseRating', 'Defense', ''],
  ['defense', 'Defense', ''],
  ['dodgeRating', 'Dodge', ''],
  ['dodge', 'Dodge', '%'],
  ['parryRating', 'Parry', ''],
  ['parry', 'Parry', '%'],
  ['blockRating', 'Block', ''],
  ['block', 'Block', '%'],
  ['blockValue', 'Block value', ''],
  ['spellPower', 'SP', ''],
  ['spellDamage', 'Spell dmg', ''],
  // One school's spell damage (docs/mechanics/spells.md §5): a caster's tomes and elixirs.
  ['arcaneSpellDamage', 'Arcane dmg', ''],
  ['fireSpellDamage', 'Fire dmg', ''],
  ['frostSpellDamage', 'Frost dmg', ''],
  ['natureSpellDamage', 'Nature dmg', ''],
  ['shadowSpellDamage', 'Shadow dmg', ''],
  ['holySpellDamage', 'Holy dmg', ''],
  ['spellHit', 'Spell hit', '%'],
  ['spellCrit', 'Spell crit', '%'],
  ['spellPenetration', 'Spell pen', ''],
  ['mp5', 'MP5', ''],
]

/** Rating → percent at level 60, from the Forever tooltips (docs/data/items.md#forevers-ratings). */
const RATING_PER_PCT: Partial<Record<keyof Stats, number>> = Object.fromEntries(
  Object.entries(itemData.meta.ratingConversions)
    .filter(([key]) => key !== 'defenseRating')
    .map(([key, conversion]) => [key, conversion.ratingPerUnit]),
)

const trimPct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`

/** A stat's sign: "+20", or "−10" (a minus sign) for a stat an item takes away (Crown of Tyranny's Spirit). */
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

/** A compact stat line, e.g. "+22 Str · +28 Crit (2%) · 1% Hit". Weapons lead with DPS and speed. */
export function summarizeItem(item: Item): string {
  const parts: string[] = []
  if (item.weapon?.dps && item.weapon.speed) {
    parts.push(`${item.weapon.dps.toFixed(1)} DPS · ${item.weapon.speed.toFixed(2)} s`)
  }
  // An arrow's or bullet's damage per second, which each shot adds × the weapon's speed (docs/data/items.md#ammo-and-quivers).
  if (item.ammo) parts.push(`+${item.ammo.dps.toFixed(1)} DPS`)
  const stats = item.stats as Record<string, number | undefined>
  for (const [key, label, unit] of SUMMARY_STATS) {
    const value = stats[key]
    if (!value) continue
    const perPct = RATING_PER_PCT[key]
    if (unit === '%') parts.push(`${value}% ${label}`)
    else if (perPct) parts.push(`${signed(value)} ${label} (${trimPct(value / perPct)})`)
    else parts.push(`${signed(value)} ${label}`)
  }
  if (item.weaponSkill) {
    for (const [skill, value] of Object.entries(item.weaponSkill)) parts.push(`+${value} ${skill} skill`)
  }
  if (parts.length === 0 && item.stats.armor) parts.push(`${item.stats.armor} Armor`)
  return parts.join(' · ')
}
