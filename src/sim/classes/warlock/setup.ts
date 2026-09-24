// What every warlock brings to the plan (docs/classes/warlock.md §2, §4, §5): its passive talents as
// effects, its mana, and the [?] assumptions its plan relies on. Its rotations are destruction.ts and
// affliction.ts.
import { FIVE_SECOND_RULE_MS, mp5TickTenths, spiritRegenTickTenths } from '../../core/formulas'
import type { Effect } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { type ManaPlan, type Plan, POWER_TICK_MS } from '../../plan/types'
import type { DerivedStats } from '../../stats/stat-block'
import { FIREBOLT } from './demons'
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
 * Each comes with the detail its text fills in, if any (Improved Shadow Bolt's rank).
 */
export function warlockAssumptions(plan: Plan): { id: AssumptionId; detail?: string }[] {
  if (plan.classId !== 'warlock') return []
  const ids: AssumptionId[] = ['warlockMana', 'casterSpellRules']
  const has = (id: string) => plan.abilities.some((a) => a.id === id)
  const spells = plan.spells ?? []
  if (spells.some((s) => (s.dotTicks ?? 0) > 0)) ids.push(plan.profile.combat.periodicCrits ? 'casterDotCrits' : 'casterDots')
  if (has('lifeTap')) ids.push('lifeTap')
  // docs/classes/warlock.md §11.7: Demonology's demon replaces the "no pet" ones.
  if (plan.pet) ids.push('demonOut', 'demonStats', 'demonTable', ...(plan.pet.power ? (['demonMana'] as const) : []))
  else if (has('demonicSacrifice')) ids.push('demonicSacrifice')
  else if (plan.spec !== 'warlock-demonology') ids.push('warlockNoPet')
  if (has('masterDemonologist')) ids.push('masterDemonologist')
  if (has('soulFire')) ids.push('decimation')
  if (has('curseOfTheElements')) ids.push('curseOfTheElementsOwn')
  if (has('conflagrate')) ids.push('conflagrate')
  if (has('incinerate')) ids.push('incinerate')
  if (has('shadowburn')) ids.push('shadowburnShards')
  if (plan.procs.some((p) => p.id === 'nightfall')) ids.push('nightfall')
  if (plan.procs.some((p) => p.id === 'improvedShadowBolt')) ids.push('improvedShadowBolt')
  if (has('baneOfAgony')) ids.push('baneOfAgonyRamp')
  ids.push('warlockTalentStacking')
  // Improved Imp's hidden effect, read as Firebolt's cast time (§11.7 Q19), when it shortens the Imp's.
  const firebolt = plan.pet?.abilities.find((a) => a.id === 'firebolt')
  if (firebolt && firebolt.castMs < FIREBOLT.castMs) ids.push('improvedImpCast')
  // Improved Shadow Bolt's text names the rank's Shadow Vulnerability: +4% a rank (warlock.md §4.1).
  const vulnerability = plan.auras.find((a) => a.id === 'shadowVulnerability')?.schoolTaken ?? 0
  const detail: Partial<Record<AssumptionId, string>> = {
    improvedShadowBolt: String(vulnerability),
    improvedImpCast: String((firebolt?.castMs ?? 0) / 1000),
    ...(plan.pet ? demonDetails(plan.pet) : {}),
  }
  return ids.map((id) => ({ id, detail: detail[id] }))
}

/**
 * The demon's assumptions, worded for the demon out (warlock.md §11.2): its swing only for one that
 * swings (the Succubus, the Felhunter), its spells' table only for one with a damage spell (the Imp,
 * the Succubus). What it inherits is every pet's `petInheritance` (plan/pet.ts).
 */
function demonDetails(pet: NonNullable<Plan['pet']>): Partial<Record<AssumptionId, string>> {
  const swings = pet.weapon !== null
  const spells = pet.abilities.some((a) => a.kind === 'spell' && (a.max > 0 || a.spCoefficient > 0))
  const stats = [`its attributes${pet.power ? ' and mana' : ''} at 60 are Classic Era’s as an emulator records them`]
  if (swings) stats.push('its attack power 2 per Strength − 20 and its swing 37–55 every 2 s (a level-60 hunter pet’s reported rule and damage)')
  const tables: string[] = []
  if (spells) tables.push('its spells miss the boss 17% of the time less its hit, lose 6% to its resistance and crit for ×1.5')
  if (swings) tables.push('its swings, from behind, miss, are dodged and glance as yours would, against the boss’s armor after the Buffs tab’s debuffs')
  return {
    demonStats: stats.join(', '),
    demonTable: tables.join('; '),
  }
}
