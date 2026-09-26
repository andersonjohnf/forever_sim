import type { Faction } from '@/data/races/types'
import { itemsById } from '@/lib/items'
import { computeSheet, defaultConfig, hasThreatSet, isTwoHand, type SpecId } from '@/sim'
import { SLOT_LABEL } from '@/features/gear/slots'
import type { FactionGearChange } from './faction-gear'

const simulatable = new Map<string, boolean>()

/**
 * Whether the sim knows the race's base attributes for the spec's class, measured or a D24
 * placeholder (docs/mechanics/character-stats.md, OQ-1). Every race a class can be in Forever has
 * a row now, the Skyborne's as the class row (decision D36); one without would be refused by the
 * engine, and its tile says so.
 */
export function raceSimulatable(spec: SpecId, race: string): boolean {
  const key = `${spec}:${race}`
  let known = simulatable.get(key)
  if (known === undefined) {
    const sheet = computeSheet({ ...defaultConfig(spec), race })
    known = sheet !== null && !sheet.unknown.includes('base attributes')
    simulatable.set(key, known)
  }
  return known
}

const list = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

type Swap = FactionGearChange['swapped'][number]

/**
 * How a swapped piece's set bonus changed (docs/ux.md "Character"): 'same' for an exact twin or two
 * pieces in no set, 'lost' when the new piece has none (the Alliance's Rank 7 to 10 silk and satin,
 * the Horde's leather), 'gained' the way back, 'other' for a set with another bonus (Highlander's
 * Mail Pauldrons' spell crit for the Defilers' melee crit).
 */
function setChange({ from, to, setDiffers }: Swap): 'same' | 'lost' | 'gained' | 'other' {
  if (!setDiffers || (!from.setId && !to.setId)) return 'same'
  if (!to.setId) return 'lost'
  return from.setId ? 'other' : 'gained'
}

/** What each kind of swap says after the new pieces' names. */
const SWAP_WORDS = {
  same: 'with the same stats',
  lost: 'with the same stats but no set bonus',
  gained: 'with the same stats, now with a set bonus',
  other: 'with the same stats but in another set',
} as const

/** Why the new default leaves a slot empty: ": Whiteout Staff takes both hands" for the off hand beside a two-hander. */
function clearedBecause(change: FactionGearChange, slot: string): string {
  const main = change.config.gear.mainHand && itemsById.get(change.config.gear.mainHand.itemId)
  return slot === 'offHand' && main && isTwoHand(main) ? `: ${main.name} takes both hands` : ''
}

/**
 * The toast after a race change that moved faction-bound gear, or null when nothing changed. Default
 * pieces that became the new race's own default, not their twin, say which set they come from (a slot
 * that was empty too: an Alliance caster's off hand), a piece whose set bonus isn't the old one's says
 * how, and a slot the new default leaves empty says why (a Horde caster's Whiteout Staff takes both
 * hands). The title counts every slot that moved (docs/ux.md "Character").
 */
export function raceChangeMessage(change: FactionGearChange, faction: Faction): { title: string; description: string } | null {
  const { swapped, defaulted, cleared, kept } = change
  if (swapped.length === 0 && defaulted.length === 0 && cleared.length === 0 && kept.length === 0) return null
  const keptNames = list(kept.map((k) => k.item.name))
  const keptLine = kept.length
    ? `Kept ${keptNames}: ${kept.length === 1 ? 'it has' : 'they have'} no ${faction} version, so pick ${kept.length === 1 ? 'a replacement' : 'replacements'} under Gear.`
    : ''
  if (swapped.length === 0 && defaulted.length === 0 && cleared.length === 0) return { title: `Your gear includes items a ${faction} character can’t wear`, description: keptLine }
  const set = hasThreatSet(change.config.spec) ? `the ${faction} threat set` : `${faction} pre-raid best in slot`
  const swapLines = (Object.keys(SWAP_WORDS) as (keyof typeof SWAP_WORDS)[]).map((kind) => {
    const names = swapped.filter((s) => setChange(s) === kind).map((s) => s.to.name)
    return names.length ? `${list(names)}, ${SWAP_WORDS[kind]}.` : ''
  })
  const lines = [
    ...swapLines,
    defaulted.length ? `${list(defaulted.map((s) => s.to.name))}, from ${set}.` : '',
    ...cleared.map(({ slot }) => `${SLOT_LABEL[slot]} cleared${clearedBecause(change, slot)}.`),
    keptLine,
  ]
  const moved = swapped.length + defaulted.length + cleared.length
  return {
    title:
      cleared.length > 0
        ? `Changed ${moved} ${moved === 1 ? 'slot' : 'slots'} for ${faction} gear`
        : defaulted.length > 0
          ? `Swapped ${moved} ${moved === 1 ? 'item' : 'items'} for ${faction} gear`
          : swapped.length === 1
            ? `Swapped 1 item for its ${faction} version`
            : `Swapped ${swapped.length} items for their ${faction} versions`,
    description: lines.filter(Boolean).join(' '),
  }
}
