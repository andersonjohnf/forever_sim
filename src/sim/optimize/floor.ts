// The survival floor per tank spec (decision D30): talents nearly every tank takes for its
// survival, which the sim can't value (a defensive cooldown it never presses, health it never runs
// out of) or values below what tanks give them (avoidance, which costs rage in the model). A tank's
// talent search keeps them in every build. Each list is its class doc's "Survival floor" section;
// DPS specs have none. Talents are keyed by name, as the engine keys them.
//
// To extend the floor for one search, keep more talents (`TalentSearch.keep`, the CLI's `--keep`):
// kept talents join the floor in every build. To change a spec's default floor, change its list
// here and its class doc's section together.
import type { SpecId } from '../types'

export const SURVIVAL_FLOOR: Partial<Record<SpecId, Readonly<Record<string, number>>>> = {
  // docs/classes/warrior.md#64-survival-floor: the defensive cooldowns, and (user decision, D30)
  // Deflection's parry. Anticipation is the preferred filler instead (below); Toughness is
  // optional: the search decides its ranks.
  'warrior-protection': { 'Last Stand': 1, 'Improved Shield Wall': 2, Deflection: 5 },
  // docs/classes/druid.md#76-survival-floor: health, armor, and (user decision, D30) the
  // avoidance talent, Feral Swiftness's 4% dodge.
  'druid-feral-bear': { 'Heart of the Wild': 5, 'Thick Hide': 3, 'Feral Swiftness': 2 },
  // docs/classes/paladin.md#protection-survival-floor: the cooldowns and damage cuts, and (user
  // decision, D30) Deflection's parry. Anticipation is the preferred filler instead (below);
  // Toughness is optional: the search decides its ranks.
  'paladin-protection': { 'Improved Righteous Fury': 3, 'Sacred Duty': 2, "Templar's Bulwark": 1, Deflection: 5 },
}

/**
 * A tank's **preferred filler** (user decision, D30; docs/optimizer.md#the-preferred-filler): not in
 * the floor, but where a build's leftover points go first, after the objective talents' partial
 * ranks and before Toughness or any other filler. The model counts only what its avoided hits cost
 * in threat, so when the race ends a candidate with more of it is preferred to the leader if it's
 * within PREFERENCE_TOLERANCE of the leader's score or inside the leader's paired 95% interval
 * (`preferFiller`, ./prefer.ts). The bear has none: its avoidance, Feral Swiftness, is in its floor.
 */
export const PREFERRED_FILLER: Partial<Record<SpecId, string>> = {
  // docs/classes/warrior.md#64-survival-floor
  'warrior-protection': 'Anticipation',
  // docs/classes/paladin.md#protection-survival-floor
  'paladin-protection': 'Anticipation',
}

/**
 * A tank's own tree, by id, where its talent search spends at least TANK_TREE_POINTS unless told
 * otherwise (D30: "a minimum in a tree, for example 31 points in Protection"): the tree whose
 * 31-point talent makes the spec a tank.
 */
export const TANK_TREE: Partial<Record<SpecId, string>> = {
  'warrior-protection': 'Protection',
  'druid-feral-bear': 'Feral Combat',
  'paladin-protection': 'Protection',
}
export const TANK_TREE_POINTS = 31
