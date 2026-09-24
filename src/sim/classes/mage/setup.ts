// What the mage adds to a plan (docs/classes/mage.md "What the sim needs"): its passive talents and
// procs, its mana model and the [?] assumptions its plan relies on. Its rotations are rotation.ts.
import { FIVE_SECOND_RULE_MS, mp5TickTenths, spiritRegenTickTenths } from '../../core/formulas'
import type { Effect } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { type AuraPlan, type ManaPlan, type Plan, POWER_TICK_MS } from '../../plan/types'
import type { RulesProfile } from '../../rules/profiles'
import type { DerivedStats } from '../../stats/stat-block'
import { CLEARCASTING, rank, TALENT_EFFECTS, type TalentRanks } from './talents'

/** The mage's passives for the build: its talents (mage.md#talents). */
export function mageEffects(talents: TalentRanks): Effect[] {
  const effects: Effect[] = []
  for (const [name, r] of talents) {
    const f = TALENT_EFFECTS[name]
    if (f) effects.push(...f(r))
  }
  return effects
}

/**
 * Mage Armor r3 (22783): "allows 50% of your mana regeneration to continue while casting" [F] (Classic
 * Era 30% [C]) [client] (SpellEffect aura 134, both builds). The sim assumes it's up all fight: a
 * damage-dealing mage's armor (mage.md#mana).
 */
export const MAGE_ARMOR_SHARE = { forever: 0.5, classicEra: 0.3 } as const
/** Arcane Meditation (18462): 17 / 33 / 50% of regeneration while casting by rank [F] (Classic Era 5 / 10 / 15%) [client]. */
export const ARCANE_MEDITATION_SHARE = [0, 0.17, 0.33, 0.5]

/**
 * The mage's mana, in tenths (mage.md#mana; docs/mechanics/spells.md §8): the sheet's maximum, spirit
 * regeneration `13 + Spirit / 4` a tick outside the five-second rule, mp5 every tick, and inside the
 * rule Mage Armor's share plus Arcane Meditation's, at most all of it. Evocation's aura adds its own
 * (abilities.ts EVOCATION_AURA).
 */
export function mageManaPlan(derived: Pick<DerivedStats, 'mana' | 'spirit'>, mp5: number, talents: TalentRanks, profile: RulesProfile): ManaPlan {
  const armor = profile.id === 'classicEra' ? MAGE_ARMOR_SHARE.classicEra : MAGE_ARMOR_SHARE.forever
  const share = Math.min(1, armor + (ARCANE_MEDITATION_SHARE[rank(talents, 'Arcane Meditation')] ?? 0.5))
  return {
    maxTenths: 10 * derived.mana,
    regenTickTenths: spiritRegenTickTenths(derived.spirit, 'mage'),
    fiveSecondRuleMs: FIVE_SECOND_RULE_MS,
    mp5TickTenths: mp5TickTenths(mp5, POWER_TICK_MS),
    inFsrShare: share,
  }
}

/** Clearcasting as the plan's free-cast aura (Arcane Concentration, mage.md#talents), when the build has it. */
export function mageFreeCast(auras: readonly AuraPlan[]): Pick<Plan, 'freeCastAura'> {
  const i = auras.findIndex((a) => a.id === CLEARCASTING.id)
  return i >= 0 ? { freeCastAura: i } : {}
}

/**
 * The [?] assumptions a mage plan relies on (mage.md#open-questions), by what it has: its spells on the
 * spell table, Ignite, Improved Scorch, Hot Streak, Combustion, Winter's Chill, Clearcasting, Arcane
 * Missiles, Presence of Mind, the mana model and its gems.
 */
export function mageAssumptions(plan: Plan): AssumptionId[] {
  if (plan.classId !== 'mage') return []
  const ids: AssumptionId[] = ['mageSpells']
  const procs = new Set(plan.procs.map((p) => p.id))
  const abilities = new Set(plan.abilities.map((a) => a.id))
  const auras = new Set(plan.auras.map((a) => a.id))
  if (plan.ignite) ids.push('mageIgnite')
  if (procs.has('improvedScorch')) ids.push('mageImprovedScorch')
  if (auras.has('hotStreak') && abilities.has('pyroblast')) ids.push('mageHotStreak')
  if (abilities.has('combustion')) ids.push('mageCombustion')
  if (procs.has('wintersChill')) ids.push('mageWintersChill')
  if (procs.has('arcaneConcentration')) ids.push('mageClearcasting')
  if (abilities.has('arcaneMissiles')) ids.push('mageArcaneMissiles')
  if (abilities.has('presenceOfMind')) ids.push('magePresenceOfMind')
  if (plan.mana) ids.push('manaRegenMage')
  return ids
}
