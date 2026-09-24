// A druid build's passives (docs/classes/druid.md §2, §5): the forms' own effects, Omen of Clarity,
// and the talents, each bound to its form where it has one. classes/index.ts `classSetup` calls it.
import type { DruidForm, Effect } from '../../effects/types'
import type { RulesProfile } from '../../rules/profiles'
import type { SpecId } from '../../types'
import { OMEN_OF_CLARITY } from './abilities'
import { MOONKIN_AURA_BUFF, moonkinFormEffects, omenOfClaritySpells } from './balance-abilities'
import { formEffects } from './forms'
import { DRUID_TALENT_EFFECTS } from './talents'

/**
 * The form each druid spec fights in: Cat Form, Dire Bear Form for the bear (druid.md §3, §4), and
 * Moonkin Form for Balance with the talent, caster form without it (§11.1).
 */
export const DRUID_SPEC_FORM: Partial<Record<SpecId, DruidForm>> = {
  'druid-feral-cat': 'cat',
  'druid-feral-bear': 'bear',
  'druid-balance': 'moonkin',
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
 * Leader of the Pack from the build replaces the Buffs tab's: several don't stack (buffs doc). The
 * Balance druid (§11) fights in Moonkin Form with the talent: its crit aura, which replaces the Buffs
 * tab's Moonkin Aura, and its armor; and Omen of Clarity procs from its spells, twice as often and
 * twice as soon in Moonkin Form (§11.3).
 */
export function druidSetup(spec: SpecId, talents: ReadonlyMap<string, number>, profile: RulesProfile): DruidSetup {
  // A Balance druid casts and never swings (§11.1): its Omen of Clarity procs from spells, below.
  const effects: Effect[] = [...formEffects(profile), ...(spec === 'druid-balance' ? [] : [{ kind: 'proc', proc: OMEN_OF_CLARITY } as const])]
  for (const [name, rank] of talents) {
    const f = DRUID_TALENT_EFFECTS[name]
    if (f) effects.push(...f(rank, profile))
  }
  const moonkin = spec === 'druid-balance' && talents.has('Moonkin Form')
  if (spec === 'druid-balance') effects.push(...(moonkin ? moonkinFormEffects(profile) : []), { kind: 'proc', proc: omenOfClaritySpells(moonkin) })
  const form = spec === 'druid-balance' && !moonkin ? 'caster' : (DRUID_SPEC_FORM[spec] ?? 'caster')
  // The Balance spec's own Moonkin Aura; Leader of the Pack is an animal form's, never a moonkin's.
  const replacesBuffs = moonkin ? [MOONKIN_AURA_BUFF] : talents.has('Leader of the Pack') && form !== 'caster' ? [LEADER_OF_THE_PACK_BUFF] : []
  return { effects, form, replacesBuffs }
}
