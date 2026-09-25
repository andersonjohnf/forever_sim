// The character sheet's rows (docs/ux.md#results "Character sheet"): the flat list the result's
// collapsed sheet shows under 1440 px, and the groups the wide panel's sheet shows from 1440 px
// (D34 as amended), as a player reads them: what hits, what it's made of, what keeps you alive.
import { formatInt, formatPct } from '@/lib/format'
import type { CharacterSheet } from '@/sim'
import { casterSheetRows, rangedSheetRows } from './caster-sheet'
import { CRIT_REDUCTION_LABEL, formatCritReduction } from './tank-logic'

/** A row: its label and its value as shown. */
export type SheetRow = [label: string, value: string]

/** The weapon skill row's label: its value is `weaponSkillValue`'s. */
export const WEAPON_SKILL_LABEL = 'Weapon skill'

/**
 * Weapon skill as one number (docs/ux.md#results): "300" with a single weapon or both hands equal,
 * and "300 · 305" (main hand first) when they differ, so it never needs a row of its own. `spoken`
 * and `title` name the hands where they differ.
 */
export function weaponSkillValue(skill: CharacterSheet['weaponSkill']): { text: string; spoken: string | null; title: string | null } {
  const { mainHand, offHand } = skill
  if (offHand === null || offHand <= 0 || offHand === mainHand) return { text: formatInt(mainHand), spoken: null, title: null }
  return {
    text: `${formatInt(mainHand)} · ${formatInt(offHand)}`,
    spoken: `${formatInt(mainHand)} main hand, ${formatInt(offHand)} off hand`,
    title: `Main hand ${formatInt(mainHand)}, off hand ${formatInt(offHand)}`,
  }
}

/**
 * Whether the sheet shows the defensive rows (Defense, dodge, parry, block): a tank's, with the
 * boss's table, and anyone's with defense above 300 or block value. A ranged spec's gear defense
 * (Dal'Rend's Tribal Guardian's +7) doesn't make it a tank's sheet (docs/classes/hunter.md#9-implementation-notes).
 */
export function isDefensive(s: CharacterSheet): boolean {
  return (s.bossTable ?? null) !== null || (!s.ranged && (s.defense > 300 || s.blockValue > 0))
}

/**
 * The sheet's rows in the flat order of its two columns (docs/ux.md#results): a ranged spec's, a
 * caster's, a paladin's counterparts row by row (Attack power | Spell damage, …), or a melee
 * spec's; then Armor and the defensive rows.
 */
export function sheetRows(s: CharacterSheet): SheetRow[] {
  const spell = s.spell
  const weaponSkill = weaponSkillValue(s.weaponSkill).text
  const rows: SheetRow[] = rangedSheetRows(s) ??
    casterSheetRows(s) ??
    (spell
      ? [
          ['Attack power', formatInt(s.attackPower)],
          // Holy: every paladin spell is (Champion of the Light's share of Intellect included).
          ['Spell damage', formatInt(spell.holyDamage)],
          ['Crit', formatPct(s.critPct)],
          ['Spell crit', formatPct(spell.critPct)],
          ['Hit', formatPct(s.hitPct)],
          ['Spell hit', formatPct(spell.hitPct)],
          [WEAPON_SKILL_LABEL, weaponSkill],
          ['Expertise', formatInt(s.expertise)],
          ['Strength', formatInt(s.strength)],
          ['Agility', formatInt(s.agility)],
          ['Stamina', formatInt(s.stamina)],
          ['Intellect', formatInt(s.intellect)],
          ['Health', formatInt(s.health)],
          ['Mana', formatInt(s.mana ?? 0)],
          ['Spirit', formatInt(s.spirit)],
          ['Mana per 5 s', formatInt(spell.mp5)],
          ['Haste', formatPct(s.hastePct)],
        ]
      : [
          ['Attack power', formatInt(s.attackPower)],
          ['Crit', formatPct(s.critPct)],
          ['Hit', formatPct(s.hitPct)],
          ['Haste', formatPct(s.hastePct)],
          [WEAPON_SKILL_LABEL, weaponSkill],
          ['Expertise', formatInt(s.expertise)],
          ['Strength', formatInt(s.strength)],
          ['Agility', formatInt(s.agility)],
          ['Stamina', formatInt(s.stamina)],
          ['Health', formatInt(s.health)],
        ])
  rows.push(['Armor', formatInt(s.armor)])
  if (isDefensive(s)) {
    rows.push(['Defense', formatInt(s.defense)])
    if (s.bossTable) rows.push([CRIT_REDUCTION_LABEL, formatCritReduction(s.critReductionPct)])
    rows.push(['Dodge', formatPct(s.dodgePct)])
    // A druid can neither parry nor block: no rows for them (BU15).
    if (s.canParry !== false) rows.push(['Parry', formatPct(s.parryPct)])
    if (s.canBlock !== false) rows.push(['Block', formatPct(s.blockPct)], ['Block value', formatInt(s.blockValue)])
  }
  return rows
}

export type SheetGroupId = 'offense' | 'spells' | 'attributes' | 'mana' | 'defense'

export interface SheetGroup {
  id: SheetGroupId
  title: string
  rows: SheetRow[]
}

const GROUP_OF: Record<string, SheetGroupId> = {
  'Attack power': 'offense',
  Crit: 'offense',
  Hit: 'offense',
  Haste: 'offense',
  [WEAPON_SKILL_LABEL]: 'offense',
  Expertise: 'offense',
  'Ranged attack power': 'offense',
  'Ranged crit': 'offense',
  'Ranged hit': 'offense',
  'Shot speed': 'offense',
  'Ranged weapon skill': 'offense',
  'Ammo damage': 'offense',
  'Spell damage': 'spells',
  'Spell crit': 'spells',
  'Spell hit': 'spells',
  'Casting speed': 'spells',
  'Spell penetration': 'spells',
  Strength: 'attributes',
  Agility: 'attributes',
  Stamina: 'attributes',
  Intellect: 'attributes',
  Spirit: 'attributes',
  Mana: 'mana',
  'Mana per 5 s': 'mana',
  Health: 'defense',
  Armor: 'defense',
  Defense: 'defense',
  [CRIT_REDUCTION_LABEL]: 'defense',
  Dodge: 'defense',
  Parry: 'defense',
  Block: 'defense',
  'Block value': 'defense',
}

/** A school's own spell row, "Fire crit" (src/features/results/caster-sheet.ts). */
const SCHOOL_ROW = /^(Arcane|Fire|Frost|Holy|Nature|Shadow) (damage|crit|hit)$/

/** Whether the groups know a row: sheet-groups.test.ts holds every spec's sheet to it. */
export function isKnownRow(label: string): boolean {
  return label in GROUP_OF || SCHOOL_ROW.test(label)
}

/** Which group a row belongs to; a row this list doesn't know goes with the offense, never dropped. */
export function groupOf(label: string): SheetGroupId {
  return GROUP_OF[label] ?? (SCHOOL_ROW.test(label) ? 'spells' : 'offense')
}

const ORDER: SheetGroupId[] = ['offense', 'spells', 'mana', 'attributes', 'defense']

/**
 * The wide panel's groups (docs/ux.md#results): Offense (Melee beside a paladin's Spells), Spells,
 * Mana, Attributes, then Defense, next to a tank's boss's table. Mana follows Spells, as a caster
 * reads it, and so the columns come out even (a caster's in 8 lines, a paladin's in 7 at 1920 px).
 * Each keeps its rows' sheet order; a group with no rows is left out.
 */
export function sheetGroups(rows: readonly SheetRow[]): SheetGroup[] {
  const by = new Map<SheetGroupId, SheetRow[]>()
  for (const row of rows) {
    const id = groupOf(row[0])
    by.set(id, [...(by.get(id) ?? []), row])
  }
  const hybrid = by.has('offense') && by.has('spells')
  const TITLE: Record<SheetGroupId, string> = {
    offense: hybrid ? 'Melee' : 'Offense',
    spells: 'Spells',
    attributes: 'Attributes',
    mana: 'Mana',
    defense: 'Defense',
  }
  return ORDER.filter((id) => by.has(id)).map((id) => ({ id, title: TITLE[id], rows: by.get(id)! }))
}

/** A key stat in the wide panel's strip: the sheet's row (`label`) and how the strip names it. */
export interface KeyStat {
  label: string
  short: string
  value: string
}

/** How many stats the strip shows: what a player checks first, on one line at 1440 px. */
export const KEY_STAT_COUNT = 3

/** The strip's shorter names, as players write them ("AP 1,455"); a row not listed keeps its own. */
const SHORT_LABEL: Record<string, string> = { 'Attack power': 'AP', 'Ranged attack power': 'Ranged AP' }

/** A caster's spell row of a kind: "Spell damage", or a school's own, "Fire damage". */
const SPELL_KIND = (kind: string) => new RegExp(`^(Spell|Arcane|Fire|Frost|Holy|Nature|Shadow) ${kind}$`)

const numeric = (value: string) => Number.parseFloat(value.replace(/,/g, ''))

/**
 * The wide panel's key-stats strip (docs/ux.md#results "Scrolling"): the first stats of the sheet's
 * first group, the ones a player checks first, which stay in view under Your setup once the sheet
 * has scrolled away. A melee or ranged spec's attack power, crit and hit; a caster's spell damage,
 * crit and hit, each its best school's where a school's own is higher (a fire mage's Fire crit); a
 * tank's (a sheet with the boss's table) health, armor and defense, its Defense group's first.
 */
export function keyStats(rows: readonly SheetRow[], tank: boolean): KeyStat[] {
  const groups = sheetGroups(rows)
  const group = (tank ? groups.find((g) => g.id === 'defense') : undefined) ?? groups[0]
  if (!group) return []
  const picked =
    group.id === 'spells'
      ? ['damage', 'crit', 'hit'].flatMap((kind) => {
          const of = group.rows.filter(([label]) => SPELL_KIND(kind).test(label))
          return of.length === 0 ? [] : [of.reduce((best, row) => (numeric(row[1]) > numeric(best[1]) ? row : best))]
        })
      : group.rows.slice(0, KEY_STAT_COUNT)
  return picked.map(([label, value]) => ({ label, short: SHORT_LABEL[label] ?? label, value }))
}
