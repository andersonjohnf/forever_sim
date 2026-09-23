// The Fight tab's ids that other tabs link to (the Rotation tab's "Fight" link on Exorcism).
import { flushSync } from 'react-dom'
import type { Section } from '@/app/setup-store'
import type { CreatureType } from '@/sim'

/** The creature types, as the Fight tab's list names them. */
export const CREATURE_TYPES: { value: CreatureType; label: string }[] = [
  { value: 'none', label: 'Unspecified' },
  { value: 'beast', label: 'Beast' },
  { value: 'demon', label: 'Demon' },
  { value: 'dragonkin', label: 'Dragonkin' },
  { value: 'elemental', label: 'Elemental' },
  { value: 'giant', label: 'Giant' },
  { value: 'humanoid', label: 'Humanoid' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'undead', label: 'Undead' },
]


/** The Fight tab's Advanced disclosure's button, and its creature type control. */
export const FIGHT_ADVANCED_ID = 'fight-advanced'
export const CREATURE_TYPE_ID = 'fight-creatureType'

/**
 * Opens Fight on its creature type: the tab, then its Advanced disclosure if it's closed, with
 * focus on the control, so the next key press opens its list (docs/ux.md#accessibility).
 */
export function openCreatureType(setSection: (section: Section) => void): void {
  flushSync(() => setSection('fight'))
  const trigger = document.getElementById(FIGHT_ADVANCED_ID)
  if (trigger?.getAttribute('aria-expanded') === 'false') flushSync(() => trigger.click())
  document.getElementById(CREATURE_TYPE_ID)?.focus()
}
