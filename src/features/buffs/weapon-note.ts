// The note after a stone's or an oil's summary on the Buffs tab (docs/ux.md "Buffs"; buffs doc §3.6,
// "Exclusivity groups"): a weapon takes one temporary enchant, so switching one on turns the others
// off, and the note names only what this spec can put on its weapons: a warrior's stones, a
// caster's oils, a Retribution paladin's stones and oils, a rogue's stones and poisons.
import type { BuffDefinition } from '@/sim'

/** The stones' and oils' exclusive group (effects/buffs.ts TEMP_ENCHANT), and the rogue's poisons' per hand. */
const TEMP_ENCHANT = 'temp-enchant'
const POISON = 'poison:'

type WeaponKind = 'stone' | 'oil' | 'poison'

/** What a weapon entry is: a poison by its group, an oil or a stone by its id. */
function weaponKind(def: BuffDefinition): WeaponKind | undefined {
  if (def.exclusiveGroup?.startsWith(POISON)) return 'poison'
  if (def.exclusiveGroup !== TEMP_ENCHANT) return undefined
  return /Oil$/.test(def.id) ? 'oil' : 'stone'
}

/**
 * The note for a stone or an oil, "(one stone or poison per weapon)", from the weapon entries this
 * spec's Buffs tab lists and can use (`catalogue` already filtered to the spec; `unused`: the ones
 * locked off for it, which say why instead). An oil-only spec holds one weapon: "(one oil at a
 * time)". Undefined for any other entry, or a locked-off one.
 */
export function weaponNote(def: BuffDefinition, catalogue: readonly BuffDefinition[], unused: Readonly<Record<string, string>>): string | undefined {
  if (def.exclusiveGroup !== TEMP_ENCHANT || unused[def.id] !== undefined) return undefined
  const kinds = new Set(catalogue.filter((b) => unused[b.id] === undefined).map(weaponKind))
  const names = (['stone', 'oil', 'poison'] as const).filter((k) => kinds.has(k))
  if (names.length === 1 && names[0] === 'oil') return '(one oil at a time)'
  return `(one ${names.join(' or ')} per weapon)`
}
