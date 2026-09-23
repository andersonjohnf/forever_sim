// Rotation options and priority lists per spec (docs/classes/warrior.md#51-conventions-for-rotation-settings).
//
// The rotation section of the UI renders the options generically; the plan builder turns the
// config's values (or the declared defaults) into the spec's abilities, priority list and
// pre-pull. Specs without a rotation yet simulate white swings only.
import { NO_PREPULL } from '../plan/types'
import type { RotationOption, SpecId } from '../types'
import { type ClassRotation, FURY_OPTIONS, FURY_RENAMED_OPTIONS, furyMaintainedBuffs, furyRotation, type RotationContext } from './warrior/fury'
import type { TalentRanks } from './warrior/modifiers'

export type { ClassRotation, RotationContext } from './warrior/fury'

export function rotationOptions(spec: SpecId): RotationOption[] {
  return spec === 'warrior-fury' ? FURY_OPTIONS : []
}

/** Setting ids a spec renamed, old → new (normalizeConfig carries saved values over). */
export function renamedRotationOptions(spec: SpecId): Readonly<Record<string, string>> {
  return spec === 'warrior-fury' ? FURY_RENAMED_OPTIONS : {}
}

/**
 * Buff catalogue ids the spec's rotation keeps up itself with these settings: the plan leaves
 * their static Buffs effects out, so each counts once (Battle Shout, warrior.md §5.2 row 1).
 */
export function maintainedBuffs(spec: SpecId, values: Record<string, number | boolean>): string[] {
  return spec === 'warrior-fury' ? furyMaintainedBuffs(values) : []
}

/** The spec's abilities, priority list and pre-pull for these settings; empty for specs without one yet. */
export function classRotation(
  spec: SpecId,
  values: Record<string, number | boolean>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: RotationContext,
): ClassRotation {
  if (spec === 'warrior-fury') return furyRotation(values, talents, auraIndex, context)
  return { abilities: [], rotation: [], prepull: NO_PREPULL, onUse: [], procs: [] }
}
