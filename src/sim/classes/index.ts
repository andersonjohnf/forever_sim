// Class modules: what a class adds to the plan (docs/architecture.md#engine-design-m1).
//
// A class contributes data (talent and stance effects) and, from M2, small ability modules and a
// priority-list rotation. The engine loop is shared by every spec.
import { decodeTalentCode, type TalentData } from '@/data/talents/types'
import { TALENT_DATA } from '../defaults'
import type { DruidForm, Effect } from '../effects/types'
import type { RulesProfile } from '../rules/profiles'
import type { ClassId, SpecId } from '../types'
import { druidSetup } from './druid/setup'
import { paladinEffects } from './paladin/setup'
import { shamanEffects } from './shaman/setup'
import { rogueEffects } from './rogue/setup'
import { mageEffects } from './mage/setup'
import { warlockEffects } from './warlock/setup'
import { priestEffects } from './priest/setup'
import { stanceEffects, TALENT_EFFECTS, type Stance } from './warrior/talents'

export interface ClassSetup {
  effects: Effect[]
  /** Warrior stance the spec fights in (warrior.md §5). */
  stance: Stance | null
  /** Talent ranks by name, for rules that depend on a talent. */
  talents: Map<string, number>
  /** Whether the engine can simulate this class yet. */
  simulated: boolean
  /**
   * The druid form the spec fights in (druid.md §2); absent for classes without forms. Effects with
   * `when.form` hold only in their forms: the plan builds a stat block per form.
   */
  form?: DruidForm
  /** Buff catalogue ids the build provides itself (a druid's Leader of the Pack): the Buffs tab's copy adds nothing more. */
  replacesBuffs?: string[]
}

/** Base stance per warrior spec (warrior.md §5.2–§5.4), unless its settings choose another. */
const WARRIOR_STANCE: Partial<Record<SpecId, Stance>> = {
  'warrior-fury': 'berserker',
  'warrior-arms': 'battle',
  'warrior-protection': 'defensive',
}

/** Talent ranks by talent name; an invalid code gives no talents (normalizeConfig reports it). */
export function talentRanksByName(data: TalentData, code: string): Map<string, number> {
  const byName = new Map<string, number>()
  let ranks: Record<string, number>
  try {
    ranks = decodeTalentCode(data, code)
  } catch {
    return byName
  }
  const names = new Map(data.trees.flatMap((t) => t.talents).map((t) => [t.id, t.name]))
  for (const [id, rank] of Object.entries(ranks)) {
    const name = names.get(id)
    if (name && rank > 0) byName.set(name, rank)
  }
  return byName
}

/**
 * A class's passives for the build, the stance's under the rule profile. `stance` overrides a
 * warrior spec's base stance when its settings choose another (Arms in Berserker Stance,
 * warrior.md §5.3 notes, Q24).
 */
export function classSetup(classId: ClassId, spec: SpecId, talentCode: string, profile: RulesProfile, stance?: Stance): ClassSetup {
  const talents = talentRanksByName(TALENT_DATA[classId], talentCode)
  if (classId === 'druid') return { ...druidSetup(spec, talents, profile), stance: null, talents, simulated: true }
  // docs/classes/paladin.md: talents, Righteous Fury and mana; no stances.
  if (classId === 'paladin') return { effects: paladinEffects(spec, talents), stance: null, talents, simulated: true }
  // docs/classes/shaman.md: talents and mana; no stances or forms.
  if (classId === 'shaman') return { effects: shamanEffects(talents), stance: null, talents, simulated: true }
  // docs/classes/rogue.md §5: its passive talents; Energy is the plan's (rogueEnergy).
  if (classId === 'rogue') return { effects: rogueEffects(talents), stance: null, talents, simulated: true }
  // docs/classes/mage.md: talents and their procs; no stances or forms.
  if (classId === 'mage') return { effects: mageEffects(talents), stance: null, talents, simulated: true }
  // docs/classes/warlock.md §4: its passive talents and procs; mana is the plan's (warlockManaPlan).
  if (classId === 'warlock') return { effects: warlockEffects(talents), stance: null, talents, simulated: true }
  // docs/classes/priest.md §4: its talents and Shadowform; mana is the plan's (priestManaPlan).
  if (classId === 'priest') return { effects: priestEffects(talents), stance: null, talents, simulated: true }
  if (classId !== 'warrior') return { effects: [], stance: null, talents, simulated: false }
  stance ??= WARRIOR_STANCE[spec] ?? 'battle'
  const effects: Effect[] = [...stanceEffects(profile)[stance]]
  for (const [name, rank] of talents) {
    const f = TALENT_EFFECTS[name]
    if (f) effects.push(...f(rank))
  }
  return { effects, stance, talents, simulated: true }
}
