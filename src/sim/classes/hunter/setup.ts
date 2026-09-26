// What the hunter adds to a plan (docs/classes/hunter.md "What the sim needs"): its passive
// talents, Aspect of the Hawk, its mana model and the [?] assumptions its plan relies on. Its
// rotation and pet are rotation.ts and pet.ts.
import { FIVE_SECOND_RULE_MS, mp5TickTenths, spiritRegenTickTenths } from '../../core/formulas'
import type { Effect } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { type ManaPlan, type Plan, POWER_TICK_MS } from '../../plan/types'
import type { DerivedStats } from '../../stats/stat-block'
import { ASPECT_OF_THE_HAWK_RAP } from './abilities'
import { rank, talentEffects, type TalentRanks } from './talents'

/**
 * The hunter's passives for the build (hunter.md §4): its talents, and Aspect of the Hawk's +120
 * ranged attack power, cast before the pull and up all fight (§3.9).
 */
export function hunterEffects(talents: TalentRanks): Effect[] {
  return [{ kind: 'stat', stat: 'rap', value: ASPECT_OF_THE_HAWK_RAP }, ...talentEffects(talents)]
}

/** Bestial Discipline (19590): 25% of your mana regeneration a rank continues while casting (aura 134) [F]. */
export const BESTIAL_DISCIPLINE_SHARE = [0, 0.25, 0.5]

/**
 * The hunter's mana, in tenths (hunter.md#5-mana; docs/mechanics/spells.md §8): the engine's one mana
 * model, the sheet's maximum, Spirit regeneration `15 + Spirit / 5` a tick outside the five-second
 * rule [C], Bestial Discipline's share of it inside the rule, and mp5 every tick.
 */
export function hunterManaPlan(derived: Pick<DerivedStats, 'mana' | 'spirit'>, mp5: number, talents: TalentRanks): ManaPlan {
  const share = BESTIAL_DISCIPLINE_SHARE[rank(talents, 'Bestial Discipline')] ?? 0.5
  return {
    maxTenths: 10 * derived.mana,
    regenTickTenths: spiritRegenTickTenths(derived.spirit, 'hunter'),
    fiveSecondRuleMs: FIVE_SECOND_RULE_MS,
    mp5TickTenths: mp5TickTenths(mp5, POWER_TICK_MS),
    ...(share > 0 ? { inFsrShare: share } : {}),
  }
}

/** The [?] assumptions a hunter plan relies on (hunter.md#11-open-questions), by what it has. */
export function hunterAssumptions(plan: Plan, talents: TalentRanks): AssumptionId[] {
  if (plan.classId !== 'hunter') return []
  const ids: AssumptionId[] = ['hunterNoMelee', 'manaRegenHunter']
  const abilities = new Set(plan.abilities.map((a) => a.id))
  if (plan.ranged) ids.push('autoShotWindup', 'ammoDamage', 'rangedTableRolls')
  if (abilities.has('aimedShot') || abilities.has('multiShot') || abilities.has('sniperShot')) ids.push('shotCastHaste')
  if (abilities.has('serpentSting')) ids.push('serpentStingCrits')
  // Its text covers both: Arcane Shot's Arcane and Serpent Sting's Nature resists (doctrine §4).
  if (abilities.has('arcaneShot') || abilities.has('serpentSting')) ids.push('arcaneShotResists', 'shotScaling')
  if (abilities.has('huntersMark')) ids.push('huntersMarkLands')
  if (plan.pet) ids.push('petBaseStats', 'focusRegen', 'petTable', 'petBuffs')
  if (rank(talents, 'Careful Aim') > 0) ids.push('carefulAim')
  if (rank(talents, 'Ranged Weapon Specialization') > 0) ids.push('rangedWeaponSpecialization')
  if (rank(talents, 'Focused Fire') > 0 && plan.pet) ids.push('focusedFire')
  if (rank(talents, 'Lone Wolf') > 0) ids.push('loneWolf')
  ids.push('summonHawkNotSimulated')
  return ids
}
