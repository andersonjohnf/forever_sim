// The Shadow Priest's talents and Shadowform (docs/classes/priest.md §4): the passives as effects, and
// the changes the build makes to the ability and spell rows. Values are the Forever client's rank
// curves (TraitDefinitionEffectPoints, src/data/client/talents.json, build 1.60.1.69913), checked by
// data.test.ts. Talents that do nothing for a damage dealer on one boss (Blackout's stun, Spirit Tap's
// kills, Shadow Reach, the threat, healing and utility talents) have no entry: priest.md says which.
import { spellCritMultiplier } from '../../core/formulas'
import type { AuraSpec, Effect, ProcSpec } from '../../effects/types'
import { type AbilityDef, schoolMask, type SpellDef } from '../../plan/types'
import { DEVOURING_PLAGUE, MIND_BLAST, MIND_FLAY, SHADOW_WORD_PAIN, STARSHARDS, VAMPIRIC_EMBRACE } from './abilities'

const DOC = 'docs/classes/priest.md'

/** Talent ranks by name (classes/index.ts talentRanksByName). */
export type TalentRanks = ReadonlyMap<string, number>

export const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

/** Whether the build has Shadowform, which the priest keeps up all fight (priest.md#36-shadowform-15473). */
export const hasShadowform = (talents: TalentRanks) => rank(talents, 'Shadowform') > 0

/**
 * Shadowform (15473) [F] [client] (SpellEffect, 1.60.1.69913): +10% Shadow damage done (aura 79, misc
 * 32; Classic Era +15%), −50% mana cost of Shadow spells (aura 72, misc 32), +100% crit damage bonus
 * (aura 108, spell mod 15) for Shadow Word: Pain, Devouring Plague, Mind Blast and Mind Flay (its class
 * mask 0x2809010), and −15% physical damage taken. Cast before the pull, it lasts until cancelled.
 */
export const SHADOWFORM_DAMAGE_PCT = 10
export const SHADOWFORM_COST_PCT = 50
export const SHADOWFORM_CRIT_BONUS_PCT = 100
/** The spells Shadowform's crit bonus covers (15473 #4's class mask) that the sim casts. */
const SHADOWFORM_CRIT_SPELLS = new Set([SHADOW_WORD_PAIN.id, DEVOURING_PLAGUE.id, MIND_BLAST.id, MIND_FLAY.id])
/** The priest's Shadow spells, which Shadowform's cost cut and Shadow Focus's hit cover (aura 72 misc 32; 15260's mask). */
const SHADOW_ABILITIES = new Set([SHADOW_WORD_PAIN.id, DEVOURING_PLAGUE.id, MIND_BLAST.id, MIND_FLAY.id, VAMPIRIC_EMBRACE.id])

/**
 * Shadow Weaving (15257 → 15258) [F] [client] (SpellEffect, SpellAuraOptions, SpellDuration,
 * CurvePoint, 1.60.1.69913): the priest's Shadow damage spells that land (proc mask 0x10000; not DoT
 * ticks) have a 33 / 67 / 100% chance by rank to put a stack on the boss, +2% Shadow damage taken from
 * the priest a stack (aura 270, misc 32), 5 stacks, 15 s. It counts only the priest's own damage, the
 * only damage the sim deals, so it's the boss's `schoolTaken` (docs/mechanics/spells.md §9).
 */
export const SHADOW_WEAVING_AURA: AuraSpec = {
  id: 'shadowWeaving',
  name: 'Shadow Weaving',
  durationMs: 15000,
  maxStacks: 5,
  mods: { schoolMask: schoolMask(['shadow']), schoolTaken: 2 },
}
const SHADOW_WEAVING_CHANCE = [0, 33, 67, 100]
const shadowWeaving = (r: number): ProcSpec => ({
  id: 'shadowWeaving',
  name: 'Shadow Weaving',
  icon: 'spell_shadow_blackplague',
  trigger: 'spellLanded',
  from: 'any',
  schools: ['shadow'],
  chance: { pct: SHADOW_WEAVING_CHANCE[r] ?? 100 },
  action: { kind: 'aura', aura: SHADOW_WEAVING_AURA },
  docRef: `${DOC}#4-talents`,
})

/**
 * The passives as effects, by talent name (priest.md §4). Each value is its rank curve's at rank r
 * [F] [client] (TraitDefinitionEffectPoints, CurvePoint, SpellEffect, 1.60.1.69913).
 */
export const TALENT_EFFECTS: Record<string, (r: number) => Effect[]> = {
  // 15259: aura 79, Shadow damage done +2% a rank (Classic Era the same, "Shadow spell damage").
  Darkness: (r) => [{ kind: 'schoolDamage', schools: ['shadow'], pct: 2 * r }],
  // 15260: aura 107, spell mod 16 (hit), +1% a rank on the priest's Shadow spells: the school's hit
  // (Classic Era: −2% resist chance a rank).
  'Shadow Focus': (r) => [{ kind: 'schoolHit', schools: ['shadow'], pct: r }],
  // 18551: aura 137 (total stat %), Intellect +3% a rank (Classic Era: +2% maximum mana).
  'Mental Strength': (r) => [{ kind: 'mult', stat: 'int', pct: 3 * r }],
  'Shadow Weaving': (r) => [{ kind: 'proc', proc: shadowWeaving(r) }],
  // 15473: its +10% Shadow damage; the cost and crit parts are the rows' (withTalents).
  Shadowform: () => [{ kind: 'schoolDamage', schools: ['shadow'], pct: SHADOWFORM_DAMAGE_PCT }],
}

/** Meditation (14521): 17 / 33 / 50% of your Spirit regeneration continues while casting (aura 134) [F]. */
export const MEDITATION_SHARE = [0, 0.17, 0.33, 0.5]

/**
 * The build's changes to a spell (priest.md §4) [F] [client] (SpellEffect spell masks,
 * TraitDefinitionEffectPoints, 1.60.1.69913): Improved Shadow Word: Pain's +3 s a rank (a tick); Improved Mind Flay's +10% a rank to
 * Mind Flay's periodic damage (spell mod 22); Twin Disciplines' +1% a rank to Shadow Word: Pain's and
 * Devouring Plague's periodic damage (its effect 1, spell mod 22; effect 0 names none the sim casts);
 * and Shadowform's crit bonus. The spell's own multipliers multiply [?].
 */
export function withSpellTalents(spell: SpellDef, talents: TalentRanks): SpellDef {
  const id = spell.id
  const out: SpellDef = { ...spell }
  if (id === SHADOW_WORD_PAIN.id) out.dotTicks = (spell.dotTicks ?? 0) + rank(talents, 'Improved Shadow Word: Pain')
  if (id === MIND_FLAY.id) out.damageMult *= 1 + (10 * rank(talents, 'Improved Mind Flay')) / 100
  if (id === SHADOW_WORD_PAIN.id || id === DEVOURING_PLAGUE.id) out.damageMult *= 1 + rank(talents, 'Twin Disciplines') / 100
  if (hasShadowform(talents) && SHADOWFORM_CRIT_SPELLS.has(id)) out.critMultiplier = spellCritMultiplier(SHADOWFORM_CRIT_BONUS_PCT)
  return out
}

/** Mental Agility (14520): −3 / −7 / −10% mana on the instant spells it names (spell mod 14) [F]. */
const MENTAL_AGILITY = [0, 3, 7, 10]
const MENTAL_AGILITY_SPELLS = new Set([SHADOW_WORD_PAIN.id, DEVOURING_PLAGUE.id, VAMPIRIC_EMBRACE.id, STARSHARDS.id])

/**
 * The build's changes to an ability row (priest.md §4): Improved Mind Blast's −0.5 s a rank to Mind
 * Blast's cooldown; Improved Shadow Word: Pain's longer marker; and the mana cost cuts. The talents'
 * cuts add up (Mental Agility, Devouring Contagion's −25% a rank on Devouring Plague), and
 * Shadowform's −50% on Shadow spells multiplies after them [?], each cost rounded down to whole mana.
 */
export function withTalents(ability: AbilityDef, talents: TalentRanks): AbilityDef {
  const id = ability.id
  let cut = 0
  if (MENTAL_AGILITY_SPELLS.has(id)) cut += MENTAL_AGILITY[rank(talents, 'Mental Agility')] ?? 10
  if (id === DEVOURING_PLAGUE.id) cut += 25 * rank(talents, 'Devouring Contagion')
  const form = hasShadowform(talents) && SHADOW_ABILITIES.has(id) ? 1 - SHADOWFORM_COST_PCT / 100 : 1
  const out: AbilityDef = {
    ...ability,
    costTenths: 10 * Math.floor((ability.costTenths / 10) * (1 - cut / 100) * form + 1e-9),
    ...(ability.spellDef ? { spellDef: withSpellTalents(ability.spellDef, talents) } : {}),
  }
  if (id === MIND_BLAST.id) out.cooldownMs = ability.cooldownMs - 500 * rank(talents, 'Improved Mind Blast')
  if (id === SHADOW_WORD_PAIN.id && ability.aura) {
    const ticks = out.spellDef?.dotTicks ?? 6
    out.aura = { ...ability.aura, durationMs: ticks * (out.spellDef?.dotTickMs ?? 3000) }
  }
  return out
}
