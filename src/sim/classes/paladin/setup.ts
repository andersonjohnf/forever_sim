// What the paladin adds to a plan (docs/classes/paladin.md "What the sim needs"): its passive
// talents, Righteous Fury, its mana model, and the priority-list core both specs share. The specs'
// own rows (Retribution: Holy Strike, Consecration, Exorcism, Hammer of Wrath, Judgement of the
// Crusader; Protection: Holy Shield, Swift Judgement, Righteous Fury's upkeep) and their settings
// build on `paladinCore`.
import { FIVE_SECOND_RULE_MS, mp5TickTenths, spiritRegenTickTenths } from '../../core/formulas'
import type { Effect, ProcSpec } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { type AbilityDef, COND, DEFENSE, type ManaPlan, NO_PREPULL, type Plan, POWER_TICK_MS, type RotationEntry } from '../../plan/types'
import type { DerivedStats } from '../../stats/stat-block'
import type { WeaponType } from '@/data/items/types'
import type { SpecId } from '../../types'
import type { ClassRotation, RotationContext } from '../warrior/shared'
import { JOTC_REFRESH, JUDGE_CRUSADER, JUDGEMENT_OF, SEAL_OF_COMMAND, SEAL_OF_FURY, sealProcs } from './abilities'
import { reverenceShare, righteousFuryEffects, TALENT_EFFECTS, type TalentRanks, withSpellTalents, withTalents } from './talents'

/**
 * The paladin's mana, in tenths (paladin.md#mana-model; character-stats.md#spirit-and-mana-regeneration):
 * the engine's one mana model, the druid's pool, five-second rule and spirit regeneration
 * (core/formulas.ts), plus what only the paladin's plan sets: mp5 every power tick, and Reverence's
 * 10% per rank of the spirit regeneration inside the rule. Spell-effect mana makes 0.5 threat per
 * mana [?] (threat.md#threat-from-healing-power-gains-and-buffs; the engine's).
 */
export function paladinManaPlan(derived: Pick<DerivedStats, 'mana' | 'spirit'>, mp5: number, talents: TalentRanks): ManaPlan {
  return {
    maxTenths: 10 * derived.mana,
    regenTickTenths: spiritRegenTickTenths(derived.spirit),
    fiveSecondRuleMs: FIVE_SECOND_RULE_MS,
    mp5TickTenths: mp5TickTenths(mp5, POWER_TICK_MS),
    inFsrShare: reverenceShare(talents),
  }
}

/** Whether a spec fights with Righteous Fury up: Protection does (paladin.md#protection-defaults), Retribution doesn't. */
export const righteousFuryOn = (spec: SpecId) => spec === 'paladin-protection'

/** The paladin's passives for the build: its talents and Righteous Fury (or Instrument of Law without it). */
export function paladinEffects(spec: SpecId, talents: TalentRanks): Effect[] {
  const effects: Effect[] = []
  for (const [name, r] of talents) {
    const f = TALENT_EFFECTS[name]
    if (f) effects.push(...f(r))
  }
  effects.push(...righteousFuryEffects(righteousFuryOn(spec), talents))
  return effects
}

/**
 * The main-hand weapon, for the seals whose procs scale with it (Seal of Righteousness), the
 * maximum mana, which the "mana% ≥ x" settings are shares of (paladin.md#forever-priority-list-default),
 * and whether a shield is equipped (Protection).
 */
export interface PaladinContext extends RotationContext {
  /** The main hand's base speed, whether it's a two-hander, and its type (Hammer of the Righteous needs a one-handed axe, mace or sword). */
  mainHand?: { speedSec: number; twoHand: boolean; type?: WeaponType } | null
  maxMana?: number
  /** Whether Hammer of the Righteous's weapon DPS counts attack power (Character → Advanced, `rules.hotrWeaponDps`; OQ 11). */
  hotrWeaponDps?: 'withAttackPower' | 'weaponOnly'
  /** A shield is equipped: Holy Shield and Seal of Fury's absorb need one (paladin.md#protection-model-and-rotation). */
  hasShield?: boolean
}

/** Each spec's seal (paladin.md#retribution-defaults, #protection-defaults). */
export const SPEC_SEAL: Partial<Record<SpecId, AbilityDef>> = {
  'paladin-retribution': SEAL_OF_COMMAND,
  'paladin-protection': SEAL_OF_FURY,
}

/** The seal goes up 1.5 s before the pull, one GCD, so it's there for the first swing (paladin.md#forever-priority-list-default row 0). */
export const PREPULL_SEAL_MS = -1500

/** Recast the seal when it has at most this long left, so Judgement always has one (`sealRefreshMs`, paladin.md row 1). */
export const SEAL_REFRESH_MS = 1500

/**
 * The procs a paladin rotation's abilities need: the procs of the damage seals among them (each
 * only while its seal is up), with the build's talents and the JotC rule, and, if it judges the
 * Crusader, Judgement of the Crusader's refresh by your auto attacks.
 */
export function paladinProcs(
  abilities: readonly AbilityDef[],
  talents: TalentRanks,
  context: PaladinContext,
): ProcSpec[] {
  const has = (id: string) => abilities.some((a) => a.id === id)
  const seals = sealProcs(context.mainHand ?? null, (s) => withSpellTalents(s, talents), context.hasShield ?? false)
  return [...seals.filter((p) => p.requiresAura !== undefined && has(p.requiresAura)), ...(has(JUDGE_CRUSADER.id) ? [JOTC_REFRESH] : [])]
}

/**
 * The core both specs share (paladin.md rows 0, 1 and 3 of each priority list): the spec's seal
 * 1.5 s before the pull and recast when it has 1.5 s left, and its judgement whenever Judgement is
 * ready, which needs the seal up and leaves it up. Abilities 0 and 1 are the seal and its
 * judgement; a spec's rotation adds its rows after them.
 */
export function paladinCore(spec: SpecId, talents: TalentRanks, context: PaladinContext): ClassRotation {
  const seal = SPEC_SEAL[spec]
  if (!seal) return { abilities: [], rotation: [], prepull: NO_PREPULL, onUse: [], procs: [] }
  const abilities = [withTalents(seal, talents), withTalents(JUDGEMENT_OF[seal.id], talents)]
  const rotation: RotationEntry[] = [
    { ability: 0, conditions: [{ code: COND.abilityAuraRefresh, a: 0, b: SEAL_REFRESH_MS }], unqueueBelowTenths: 0 },
    { ability: 1, conditions: [{ code: COND.abilityAuraUp, a: 0, b: 0 }], unqueueBelowTenths: 0 },
  ]
  return {
    abilities,
    rotation,
    prepull: { casts: [{ ability: 0, atMs: PREPULL_SEAL_MS }], chargeTenths: 0, keepTenths: -1 },
    onUse: [],
    procs: paladinProcs(abilities, talents, context),
  }
}

/**
 * The [?] assumptions a paladin plan relies on (paladin.md#open-questions), by what it has: its
 * seals' procs, its judgements, Judgement of the Crusader, Sanctified Judgement, Vindication and mana.
 */
export function paladinAssumptions(plan: Plan): AssumptionId[] {
  if (!plan.mana || plan.classId !== 'paladin') return []
  const ids: AssumptionId[] = ['manaRegen']
  const procs = new Set(plan.procs.map((p) => p.id))
  const abilities = new Set(plan.abilities.map((a) => a.id))
  if (procs.has('sealOfCommandProc')) ids.push('sealOfCommandRate', 'sealOfCommandScaling')
  if (procs.has('sealOfRighteousnessProc')) ids.push('sealOfRighteousness')
  if (procs.has('sealOfFuryProc')) ids.push('sealOfFury')
  if (abilities.has('judgementOfCommand')) ids.push('judgementOfCommand')
  if ((plan.spells ?? []).some((s) => s.defense === DEFENSE.melee)) ids.push('meleeSpellProcs')
  // Judgement of the Crusader's share of each Holy hit (the spell's coefficient, measured).
  // Another paladin's Judgement of the Crusader, from the Buffs tab (buffs doc §4.2), counts the same way.
  const raidJotc = (plan.holyTaken ?? 0) > 0
  if (raidJotc || plan.auras.some((a) => (a.holyTaken ?? 0) > 0)) ids.push('jotcBonus')
  if (raidJotc) ids.push('jotcRaid')
  if (abilities.has('holyStrike')) ids.push('holyStrike')
  if (abilities.has('consecration') || abilities.has('consecrationRank1')) ids.push('consecrationTicks')
  if (abilities.has('hammerOfWrath')) ids.push('hammerOfWrath')
  if (plan.abilities.some((a) => (a.manaReturnTenths ?? 0) > 0)) ids.push('sanctifiedJudgement')
  if (procs.has('vindication')) ids.push('vindication')
  // paladin.md#other-abilities, OQ 22: Hammer of Wrath's cast, without Instrument of Law 2/2.
  if (plan.abilities.some((a) => a.id === 'hammerOfWrath' && a.castMs > 0)) ids.push('hammerOfWrathCast')
  return ids
}
