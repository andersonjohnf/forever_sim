// Class modules: what a class adds to the plan (docs/architecture.md#engine-design-m1).
//
// A class contributes data (talent and stance effects) and, from M2, small ability modules and a
// priority-list rotation. The engine loop is shared by every spec.
import { decodeTalentCode, type TalentData } from '@/data/talents/types'
import { TALENT_DATA } from '../defaults'
import type { Effect } from '../effects/types'
import type { RulesProfile } from '../rules/profiles'
import type { ClassId, SpecId } from '../types'
import { stanceEffects, TALENT_EFFECTS, type Stance } from './warrior/talents'

export interface ClassSetup {
  effects: Effect[]
  /** Warrior stance the spec fights in (warrior.md §5). */
  stance: Stance | null
  /** Talent ranks by name, for rules that depend on a talent. */
  talents: Map<string, number>
  /** Whether the engine can simulate this class yet. */
  simulated: boolean
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
  if (classId !== 'warrior') return { effects: [], stance: null, talents, simulated: false }
  stance ??= WARRIOR_STANCE[spec] ?? 'battle'
  const effects: Effect[] = [...stanceEffects(profile)[stance]]
  for (const [name, rank] of talents) {
    const f = TALENT_EFFECTS[name]
    if (f) effects.push(...f(rank))
  }
  return { effects, stance, talents, simulated: true }
}
