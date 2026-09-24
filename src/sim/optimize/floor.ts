// The survival floor per tank spec (decision D30): talents nearly every tank takes for its
// survival, which the sim can't value (a defensive cooldown it never presses, health it never runs
// out of). A tank's talent search keeps them in every build. Each list is its class doc's
// "Survival floor" section; DPS specs have none. Talents are keyed by name, as the engine keys them.
import type { SpecId } from '../types'

export const SURVIVAL_FLOOR: Partial<Record<SpecId, Readonly<Record<string, number>>>> = {
  // docs/classes/warrior.md#63-survival-floor
  'warrior-protection': { 'Last Stand': 1, 'Improved Shield Wall': 2 },
  // docs/classes/druid.md#76-survival-floor
  'druid-feral-bear': { 'Heart of the Wild': 5, 'Thick Hide': 3 },
  // docs/classes/paladin.md#protection-survival-floor
  'paladin-protection': { 'Improved Righteous Fury': 3, 'Sacred Duty': 2, "Templar's Bulwark": 1 },
}
