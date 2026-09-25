// The note after the summary of a buff that turns a rival off on the Buffs tab (docs/ux.md "Buffs";
// docs/mechanics/buffs-debuffs-consumables.md#exclusivity-groups), for the groups whose summaries
// don't already say so: the flasks, potions, stones and oils say it themselves. Switching one on
// turns the other off, so the note says why, and only when the spec's tab lists a rival it can use.
import type { BuffDefinition } from '@/sim'

/**
 * What each group's note says (buffs doc "Exclusivity groups": `totem:air` is one per group, even
 * from different shamans, since 1.60.1.70009; §1.2 "Thorns on the tank": the two don't stack).
 */
const NOTES: Readonly<Record<string, string>> = {
  // A group gets one totem per element, so a second shaman's air totem doesn't add to the first's.
  'totem:air': 'One air totem at a time (even from different shamans)',
  'thorns': 'Doesn’t stack with the other Thorns',
}

/**
 * The note for an entry of a group in NOTES, when this spec's tab (`catalogue`, already filtered to
 * the spec) lists another entry of the group it can use (`unused`: the ones locked off for it, which
 * say why instead). Undefined otherwise: for a locked-off entry, one with no rival listed (a warrior's
 * Thorns: only a druid casts its own), or any other group.
 */
export function rivalNote(def: BuffDefinition, catalogue: readonly BuffDefinition[], unused: Readonly<Record<string, string>>): string | undefined {
  const note = def.exclusiveGroup ? NOTES[def.exclusiveGroup] : undefined
  if (!note || unused[def.id] !== undefined) return undefined
  const rival = catalogue.some((b) => b.id !== def.id && b.exclusiveGroup === def.exclusiveGroup && unused[b.id] === undefined)
  return rival ? note : undefined
}
