// A druid's plan fields (docs/classes/druid.md §2.4, §2.7, §2.8; plan/types.ts): the forms, what
// entering one does, Energy, mana and the Clearcasting aura. The plan builder calls it once the
// forms' stat blocks and the auras are in.
import type { DruidForm } from '../../effects/types'
import type { AuraPlan, FormPlan, Plan } from '../../plan/types'
import type { DerivedStats } from '../../stats/stat-block'
import { mp5TickTenths } from '../../core/formulas'
import { POWER_TICK_MS } from '../../plan/types'
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

/** Reflection: this share of Spirit regeneration goes on while casting, per rank: 17/33/50% (17106's curve) [F] (druid.md §11.4). */
export const REFLECTION_PCT = [0, 17, 33, 50] as const

/**
 * The druid's plan fields: its forms and the one it fights in, Furor's rank for entering them,
 * Energy (20 per tick, capped at 100, full at the pull [?]; druid.md §2.4), mana with spirit
 * regeneration outside the five-second rule (druid.md §2.8), and Clearcasting as the aura that makes
 * the next ability free (druid.md §2.7), if the plan has it. Gear's mp5 and Reflection's share of
 * Spirit regeneration while casting are in the mana only when there are any (a Balance druid's,
 * §11.4), so a feral's plan is as it was.
 */
export function druidPlan(
  forms: FormPlan[],
  start: DruidForm,
  talents: ReadonlyMap<string, number>,
  derived: DerivedStats,
  auras: readonly AuraPlan[],
  mp5 = 0,
): DruidPlanFields {
  const clearcasting = auras.findIndex((a) => a.id === CLEARCASTING.id)
  const furor = talents.get('Furor') ?? 0
  const reflection = talents.get('Reflection') ?? 0
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
    mana: {
      maxTenths: 10 * derived.mana,
      regenTickTenths: spiritRegenTickTenths(derived.spirit),
      fiveSecondRuleMs: FIVE_SECOND_RULE_MS,
      ...(mp5 > 0 ? { mp5TickTenths: mp5TickTenths(mp5, POWER_TICK_MS) } : {}),
      ...(reflection > 0 ? { inFsrShare: REFLECTION_PCT[Math.min(3, reflection)] / 100 } : {}),
    },
    ...(clearcasting >= 0 ? { freeCastAura: clearcasting } : {}),
  }
}
