// What every rogue brings to the plan (docs/classes/rogue.md §2, §5): its passive talents as effects,
// and Energy (20 every 2 s, capped at 100 plus Vigor, times a Gnome's +5%, full at the pull [?]).
import type { Effect } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { ACTION, type EnergyPlan, type Plan } from '../../plan/types'
import { BASE_MAX_ENERGY_TENTHS, ENERGY_PER_TICK_TENTHS, VIGOR_TENTHS_PER_RANK } from './abilities'
import { LETHALITY } from './modifiers'
import { rogueTalentEffects } from './talents'

/** The rogue's passive effects for this build (rogue.md §5). */
export function rogueEffects(talents: ReadonlyMap<string, number>): Effect[] {
  return rogueTalentEffects(talents)
}

/**
 * The rogue's Energy (rogue.md §2.1): the cap with Vigor, times `maxMult` (a Gnome's Expansive Mind,
 * +5% of the total [?] as the warrior's rage, warrior Q17) and rounded down to whole Energy [?], full
 * at the pull [?], 20 a tick [C].
 */
export function rogueEnergy(talents: ReadonlyMap<string, number>, maxMult = 1): EnergyPlan {
  const total = BASE_MAX_ENERGY_TENTHS + VIGOR_TENTHS_PER_RANK * (talents.get('Vigor') ?? 0)
  // Whole Energy: floor(total × 1.05) × 10 tenths; the 1e-9 keeps an exact product (105.0) whole.
  const max = 10 * Math.floor((total * maxMult) / 10 + 1e-9)
  return { maxTenths: max, startTenths: max, tickTenths: ENERGY_PER_TICK_TENTHS }
}

/**
 * The rogue's [?] this plan relies on (rogue.md §10), for the results' assumptions: Energy, the
 * finisher talents on the guild-tested attack-power shares, the two-roll abilities, Backstab's flat
 * bonus, Lethality, the poisons and their attack-power shares, Hack and Slash, Slice and Dice's
 * haste, Cold Blood and Subtlety's talents, each only when the plan uses it.
 */
export function rogueAssumptions(plan: Plan, talents: ReadonlyMap<string, number>): AssumptionId[] {
  if (plan.classId !== 'rogue') return []
  const ids: AssumptionId[] = []
  const has = (id: string) => plan.abilities.some((a) => a.id === id)
  if (plan.abilities.some((a) => a.resource === 'energy' && a.costTenths > 0)) ids.push('energyTicksRogue')
  // Eviscerate's and Rupture's attack-power shares are the guild's measurements [F] since 2026-09-25
  // (rogue.md §3.4, §3.5); that Improved Eviscerate, Aggression and Serrated Blades multiply them is [?]
  // (rogue.md Q3), so it shows when the plan uses a finisher one of them raises.
  const rank = (name: string) => talents.get(name) ?? 0
  if ((has('eviscerate') && (rank('Improved Eviscerate') > 0 || rank('Aggression') > 0)) || (has('rupture') && rank('Serrated Blades') > 0)) ids.push('rogueFinisherTalents')
  if (has('eviscerate') || has('exposeArmor')) ids.push('rogueTwoRolls')
  if (has('backstab')) ids.push('rogueFlatInside')
  if ((talents.get('Lethality') ?? 0) > 0 && plan.abilities.some((a) => LETHALITY.has(a.id))) ids.push('lethality')
  if (plan.procs.some((p) => p.poison)) ids.push('poisons')
  // The poisons' attack-power shares are the guild's [F]; how Deadly Poison reads it and which bonuses scale it are [?] (rogue.md §4.1, §4.2).
  if (plan.procs.some((p) => p.poison && (p.apCoefficient ?? 0) > 0)) ids.push('poisonAp')
  if (plan.procs.some((p) => p.action === ACTION.stackingDot)) ids.push('deadlyPoisonTicks')
  if ((talents.get('Hack and Slash') ?? 0) > 0 && plan.weapons.some((w) => w !== null)) ids.push('hackAndSlash')
  if (has('sliceAndDice') && plan.auras.filter((a) => a.haste).length > 1) ids.push('sliceAndDiceHaste')
  if (has('coldBlood')) ids.push('coldBlood')
  if (has('mutilate')) ids.push('mutilate')
  if (has('venom')) ids.push('venom')
  // Subtlety's (rogue.md §5.3).
  if (has('hemorrhage')) ids.push('hemorrhage')
  if (plan.abilities.some((a) => (a.lowHealthPct ?? 0) !== 0)) ids.push('quietus')
  if (plan.abilities.some((a) => (a.costAura ?? -1) >= 0)) ids.push('thousandCuts')
  if (plan.abilities.some((a) => (a.opensAura ?? -1) >= 0)) ids.push('cutthroat')
  return ids
}
