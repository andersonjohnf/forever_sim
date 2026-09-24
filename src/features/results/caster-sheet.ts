// The character sheet's rows for a caster (docs/mechanics/spells.md §3–§5; docs/ux.md "Results"):
// spell damage, crit and hit, each by school where a school's own lines add to it, then casting
// speed, penetration, and the mana stats. The results panel renders them like every other sheet.
import type { CharacterSheet } from '@/sim'
import { formatInt, formatPct } from '@/lib/format'

type Caster = NonNullable<NonNullable<CharacterSheet['spell']>['caster']>

const SCHOOLS: [keyof Caster['schoolDamage'], string][] = [
  ['arcane', 'Arcane'],
  ['fire', 'Fire'],
  ['frost', 'Frost'],
  ['holy', 'Holy'],
  ['nature', 'Nature'],
  ['shadow', 'Shadow'],
]

/** A caster's sheet rows, or null for a sheet without a caster's spell block (docs/mechanics/spells.md §12). */
export function casterSheetRows(s: CharacterSheet): [string, string][] | null {
  const spell = s.spell
  const caster = spell?.caster
  if (!spell || !caster) return null
  const rows: [string, string][] = []
  // The all-schools figure is the lowest: a school's own lines (a talent's, for crit and hit) only
  // add to it, so each school above it gets a row of its own.
  const bySchool = (values: Caster['schoolDamage'], label: string, what: string, format: (n: number) => string) => {
    const all = Math.min(...SCHOOLS.map(([k]) => values[k]))
    rows.push([label, format(all)])
    for (const [k, name] of SCHOOLS) if (values[k] > all) rows.push([`${name} ${what}`, format(values[k])])
  }
  bySchool(caster.schoolDamage, 'Spell damage', 'damage', formatInt)
  bySchool(caster.schoolCrit, 'Spell crit', 'crit', formatPct)
  bySchool(caster.schoolHit, 'Spell hit', 'hit', formatPct)
  rows.push(['Casting speed', formatPct(caster.castSpeedPct)])
  if (caster.spellPen > 0) rows.push(['Spell penetration', formatInt(caster.spellPen)])
  rows.push(
    ['Intellect', formatInt(s.intellect)],
    ['Spirit', formatInt(s.spirit)],
    ['Mana', formatInt(s.mana ?? 0)],
    ['Mana per 5 s', formatInt(spell.mp5)],
    ['Stamina', formatInt(s.stamina)],
    ['Health', formatInt(s.health)],
  )
  return rows
}
