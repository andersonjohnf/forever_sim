// A druid build's passives (docs/classes/druid.md §2, §5): the forms' own effects, Omen of Clarity,
// and the talents, each bound to its form where it has one. classes/index.ts `classSetup` calls it.
import type { DruidForm, Effect } from '../../effects/types'
import type { RulesProfile } from '../../rules/profiles'
import type { SpecId } from '../../types'
import { OMEN_OF_CLARITY } from './abilities'
import { formEffects } from './forms'
import { DRUID_TALENT_EFFECTS } from './talents'

/** The form each druid spec fights in: Cat Form, or Dire Bear Form for the bear (druid.md §3, §4). */
export const DRUID_SPEC_FORM: Partial<Record<SpecId, DruidForm>> = {
  'druid-feral-cat': 'cat',
  'druid-feral-bear': 'bear',
}

/** Buff catalogue id of Leader of the Pack, which a druid with the talent provides itself (druid.md §2.3). */
export const LEADER_OF_THE_PACK_BUFF = 'leaderOfThePack'

export interface DruidSetup {
  effects: Effect[]
  form: DruidForm
  /** Buff catalogue ids the build provides itself: the Buffs tab's copy adds nothing more. */
  replacesBuffs: string[]
}

/**
 * A druid's passives for a build: the forms' own (form AP, Agility to AP, armor, health, threat),
 * Omen of Clarity, which every druid has trained in Forever (druid.md §2.7), and the talents'.
 * Leader of the Pack from the build replaces the Buffs tab's: several don't stack (buffs doc).
 */
export function druidSetup(spec: SpecId, talents: ReadonlyMap<string, number>, profile: RulesProfile): DruidSetup {
  const effects: Effect[] = [...formEffects(profile), { kind: 'proc', proc: OMEN_OF_CLARITY }]
  for (const [name, rank] of talents) {
    const f = DRUID_TALENT_EFFECTS[name]
    if (f) effects.push(...f(rank, profile))
  }
  return {
    effects,
    form: DRUID_SPEC_FORM[spec] ?? 'caster',
    replacesBuffs: talents.has('Leader of the Pack') ? [LEADER_OF_THE_PACK_BUFF] : [],
  }
}
