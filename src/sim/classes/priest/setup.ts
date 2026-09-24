// What the priest adds to a plan (docs/classes/priest.md "What the sim needs"): its passive talents
// and Shadowform, its mana model, Inner Focus as the free-cast aura, and the [?] assumptions its plan
// relies on. Its rotation is shadow.ts.
import { FIVE_SECOND_RULE_MS, mp5TickTenths, spiritRegenTickTenths } from '../../core/formulas'
import type { Effect } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { type ManaPlan, type Plan, POWER_TICK_MS } from '../../plan/types'
import type { DerivedStats } from '../../stats/stat-block'
import { INNER_FOCUS_AURA, INNER_FOCUS_CRIT_PCT } from './abilities'
import { MEDITATION_SHARE, rank, TALENT_EFFECTS, type TalentRanks } from './talents'

/** The priest's passives for the build: its talents, Shadowform's Shadow damage included (priest.md §4). */
export function priestEffects(talents: TalentRanks): Effect[] {
  const effects: Effect[] = []
  for (const [name, r] of talents) {
    const f = TALENT_EFFECTS[name]
    if (f) effects.push(...f(r))
  }
  return effects
}

/**
 * The priest's mana, in tenths (priest.md#5-mana; docs/mechanics/spells.md §8): the engine's one mana
 * model, the sheet's maximum, Spirit regeneration `13 + Spirit / 4` a tick outside the five-second
 * rule [C], Meditation's share of it inside the rule, and mp5 every tick.
 */
export function priestManaPlan(derived: Pick<DerivedStats, 'mana' | 'spirit'>, mp5: number, talents: TalentRanks): ManaPlan {
  const share = MEDITATION_SHARE[rank(talents, 'Meditation')] ?? 0.5
  return {
    maxTenths: 10 * derived.mana,
    regenTickTenths: spiritRegenTickTenths(derived.spirit, 'priest'),
    fiveSecondRuleMs: FIVE_SECOND_RULE_MS,
    mp5TickTenths: mp5TickTenths(mp5, POWER_TICK_MS),
    ...(share > 0 ? { inFsrShare: share } : {}),
  }
}

/**
 * Inner Focus as the plan's free-cast aura (priest.md#35-inner-focus-14751): its charge makes the next
 * spell with a cost free and gives it +25% crit. None when the rotation doesn't use it.
 */
export function priestPlan(auras: readonly { id: string }[]): Pick<Plan, 'freeCastAura' | 'freeCastCritPct'> {
  const i = auras.findIndex((a) => a.id === INNER_FOCUS_AURA.id)
  return i >= 0 ? { freeCastAura: i, freeCastCritPct: INNER_FOCUS_CRIT_PCT } : {}
}

/** The [?] assumptions a priest plan relies on (priest.md#9-open-questions), by what it has. */
export function priestAssumptions(plan: Plan, talents: TalentRanks): AssumptionId[] {
  if (plan.classId !== 'priest') return []
  const ids: AssumptionId[] = ['priestNoMelee']
  if (plan.mana) ids.push('manaRegenPriest')
  const abilities = new Set(plan.abilities.map((a) => a.id))
  const procs = new Set(plan.procs.map((p) => p.id))
  if ((plan.spells ?? []).length > 0) ids.push('priestSpellResists')
  if (abilities.has('shadowWordPain') || abilities.has('mindFlay')) ids.push('priestPeriodicCrits')
  if (abilities.has('mindFlay')) ids.push('mindFlayChannel')
  if (procs.has('shadowWeaving')) ids.push('shadowWeaving')
  if (rank(talents, 'Shadowform') > 0) ids.push('shadowformCosts')
  if (rank(talents, 'Shadow Focus') > 0) ids.push('shadowFocusHit')
  if (abilities.has('innerFocus')) ids.push('innerFocus')
  if (abilities.has('darkSacrifice')) ids.push('darkSacrifice')
  ids.push('shadowfiendNotSimulated')
  return ids
}
