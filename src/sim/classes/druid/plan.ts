// A druid's plan fields (docs/classes/druid.md §2.4, §2.7, §2.8; plan/types.ts): the forms, what
// entering one does, Energy, mana and the Clearcasting aura. The plan builder calls it once the
// forms' stat blocks and the auras are in.
import type { DruidForm } from '../../effects/types'
import type { AuraPlan, FormPlan, Plan } from '../../plan/types'
import type { DerivedStats } from '../../stats/stat-block'
import {
  CLEARCASTING,
  ENERGY_PER_TICK_TENTHS,
  FIVE_SECOND_RULE_MS,
  FUROR_BEAR_CHANCE_PER_RANK,
  FUROR_BEAR_RAGE_TENTHS,
  MAX_ENERGY_TENTHS,
  spiritRegenTickTenths,
  START_ENERGY_TENTHS,
} from './abilities'
import { FORM_INDEX } from './forms'

export type DruidPlanFields = Required<Pick<Plan, 'forms' | 'form' | 'shapeshift' | 'energy' | 'mana'>> & Pick<Plan, 'freeCastAura'>

/**
 * The druid's plan fields: its forms and the one it fights in, Furor's rank for entering them,
 * Energy (20 per tick, capped at 100, full at the pull [?]; druid.md §2.4), mana with spirit
 * regeneration outside the five-second rule (druid.md §2.8), and Clearcasting as the aura that makes
 * the next ability free (druid.md §2.7), if the plan has it.
 */
export function druidPlan(
  forms: FormPlan[],
  start: DruidForm,
  talents: ReadonlyMap<string, number>,
  derived: DerivedStats,
  auras: readonly AuraPlan[],
): DruidPlanFields {
  const clearcasting = auras.findIndex((a) => a.id === CLEARCASTING.id)
  const furor = talents.get('Furor') ?? 0
  return {
    forms,
    form: FORM_INDEX[start],
    shapeshift: {
      caster: FORM_INDEX.caster,
      cat: FORM_INDEX.cat,
      bear: FORM_INDEX.bear,
      furorRank: furor,
      bearRageTenths: FUROR_BEAR_RAGE_TENTHS,
      bearRageChance: Math.min(1, FUROR_BEAR_CHANCE_PER_RANK * furor),
    },
    energy: { maxTenths: MAX_ENERGY_TENTHS, startTenths: START_ENERGY_TENTHS, tickTenths: ENERGY_PER_TICK_TENTHS },
    mana: { maxTenths: 10 * derived.mana, regenTickTenths: spiritRegenTickTenths(derived.spirit), fiveSecondRuleMs: FIVE_SECOND_RULE_MS },
    ...(clearcasting >= 0 ? { freeCastAura: clearcasting } : {}),
  }
}
