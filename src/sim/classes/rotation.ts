// Rotation options and priority lists per spec (docs/classes/warrior.md#51-conventions-for-rotation-settings).
//
// The rotation section of the UI renders the options generically; the plan builder turns the
// config's values (or the options' defaults for the setup, classes/options.ts) into the spec's
// abilities, priority list and pre-pull. Specs without a rotation yet simulate white swings only.
import { NO_PREPULL } from '../plan/types'
import type { RotationGroup, RotationOption, RotationValue, SpecId } from '../types'
import { ARMS_OPTIONS, armsBaseStance, armsMaintainedBuffs, armsRotation } from './warrior/arms'
import { paladinCore, type PaladinContext } from './paladin/setup'
import { FURY_OPTIONS, FURY_RENAMED_OPTIONS, furyMaintainedBuffs, furyRotation } from './warrior/fury'
import type { TalentRanks } from './warrior/modifiers'
import type { ClassRotation } from './warrior/shared'
import type { Stance } from './warrior/talents'

export type { ClassRotation, RotationContext } from './warrior/shared'
export type { PaladinContext } from './paladin/setup'

/**
 * The Rotation tab's headings, in the order it shows them (docs/ux.md "Rotation"): the pre-pull,
 * what runs all fight, the normal phase, the execute phase and consumables. Settings without one
 * (Arms' stance) come first.
 */
export const ROTATION_GROUPS: readonly RotationGroup[] = [
  'Before the pull',
  'Cooldowns and buffs',
  'Core abilities',
  'Fillers',
  'Execute phase',
  'Consumables',
]

export function rotationOptions(spec: SpecId): RotationOption[] {
  if (spec === 'warrior-fury') return FURY_OPTIONS
  if (spec === 'warrior-arms') return ARMS_OPTIONS
  return []
}

/**
 * What the Rotation tab's intro says about the spec's defaults (docs/ux.md "Rotation"): tuned for
 * the default setup once a paired search has tuned them (decision D23; Arms since M2.5a), the common
 * priority until then (Fury, until M2.5b). None for a spec without rotation settings.
 */
export function rotationDefaultsNote(spec: SpecId): string | undefined {
  if (spec === 'warrior-arms') return 'The defaults are tuned for the default setup.'
  if (spec === 'warrior-fury') return 'The defaults follow the common priority.'
  return undefined
}

/** Setting ids a spec renamed, old → new (normalizeConfig carries saved values over). */
export function renamedRotationOptions(spec: SpecId): Readonly<Record<string, string>> {
  return spec === 'warrior-fury' ? FURY_RENAMED_OPTIONS : {}
}

/**
 * Buff catalogue ids the spec's rotation keeps up itself with these settings: the plan leaves
 * their static Buffs effects out, so each counts once (Battle Shout, warrior.md §5.2 and §5.3 row 1).
 */
export function maintainedBuffs(spec: SpecId, values: Record<string, RotationValue>): string[] {
  if (spec === 'warrior-fury') return furyMaintainedBuffs(values)
  if (spec === 'warrior-arms') return armsMaintainedBuffs(values)
  return []
}

/**
 * The stance the spec's settings make it fight in, or undefined for the spec's own (warrior.md
 * §5; Arms can fight in Berserker Stance, §5.3 notes, Q24).
 */
export function rotationBaseStance(spec: SpecId, values: Record<string, RotationValue>): Stance | undefined {
  return spec === 'warrior-arms' ? armsBaseStance(values) : undefined
}

/** The spec's abilities, priority list and pre-pull for these settings; empty for specs without one yet. */
export function classRotation(
  spec: SpecId,
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  /** RotationContext, and for the paladin its main-hand weapon (Seal of Righteousness scales with it). */
  context: PaladinContext,
): ClassRotation {
  if (spec === 'warrior-fury') return furyRotation(values, talents, auraIndex, context)
  if (spec === 'warrior-arms') return armsRotation(values, talents, auraIndex, context)
  // docs/classes/paladin.md: the seal and its judgement both specs share; the specs' rows come with C2 and the Protection slice.
  if (spec === 'paladin-retribution' || spec === 'paladin-protection') return paladinCore(spec, talents, context)
  return { abilities: [], rotation: [], prepull: NO_PREPULL, onUse: [], procs: [] }
}
