// What every warlock brings to the plan (docs/classes/warlock.md §2, §4, §5): its passive talents as
// effects, its mana, and the [?] assumptions its plan relies on. Its rotations are destruction.ts and
// affliction.ts.
import { FIVE_SECOND_RULE_MS, mp5TickTenths, spiritRegenTickTenths } from '../../core/formulas'
import type { Effect } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { type ManaPlan, type Plan, POWER_TICK_MS } from '../../plan/types'
import type { DerivedStats } from '../../stats/stat-block'
import { type TalentRanks, warlockTalentEffects } from './talents'

/** The warlock's passive effects for this build (warlock.md §4). */
export function warlockEffects(talents: TalentRanks): Effect[] {
  return warlockTalentEffects(talents)
}

/**
 * The warlock's mana, in tenths (warlock.md §5; docs/mechanics/spells.md §8): the sheet's maximum,
 * spirit regeneration `8 + Spirit / 4` a tick outside the five-second rule, and mp5 every tick.
 */
export function warlockManaPlan(derived: Pick<DerivedStats, 'mana' | 'spirit'>, mp5: number): ManaPlan {
  return {
    maxTenths: 10 * derived.mana,
    regenTickTenths: spiritRegenTickTenths(derived.spirit, 'warlock'),
    fiveSecondRuleMs: FIVE_SECOND_RULE_MS,
    mp5TickTenths: mp5TickTenths(mp5, POWER_TICK_MS),
  }
}

/**
 * The [?] assumptions a warlock plan relies on (warlock.md §9), each only when the plan uses what it's
 * about: the caster core's spell rules, its DoTs' crits and snapshots, Life Tap, Demonic Sacrifice with
 * no pet, Conflagrate and Incinerate, Nightfall, Bane of Agony's ramp and the multiplying talents.
 */
export function warlockAssumptions(plan: Plan): AssumptionId[] {
  if (plan.classId !== 'warlock') return []
  const ids: AssumptionId[] = ['warlockMana', 'casterSpellRules']
  const has = (id: string) => plan.abilities.some((a) => a.id === id)
  const spells = plan.spells ?? []
  if (spells.some((s) => (s.dotTicks ?? 0) > 0)) ids.push(plan.profile.combat.periodicCrits ? 'casterDotCrits' : 'casterDots')
  if (has('lifeTap')) ids.push('lifeTap')
  if (has('demonicSacrifice')) ids.push('demonicSacrifice')
  else ids.push('warlockNoPet')
  if (has('curseOfTheElements')) ids.push('curseOfTheElementsOwn')
  if (has('conflagrate')) ids.push('conflagrate')
  if (has('incinerate')) ids.push('incinerate')
  if (has('shadowburn')) ids.push('shadowburnShards')
  if (plan.procs.some((p) => p.id === 'nightfall')) ids.push('nightfall')
  if (plan.procs.some((p) => p.id === 'improvedShadowBolt')) ids.push('improvedShadowBolt')
  if (has('baneOfAgony')) ids.push('baneOfAgonyRamp')
  ids.push('warlockTalentStacking')
  return ids
}
