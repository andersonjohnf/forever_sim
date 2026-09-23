// Rotation options and priority lists per spec (docs/classes/warrior.md#51-conventions-for-rotation-settings).
//
// The rotation section of the UI renders the options generically; the plan builder turns the
// config's values (or the declared defaults) into the spec's abilities and priority list. Specs
// without a rotation yet simulate white swings only.
import type { RotationOption, SpecId } from '../types'
import { type ClassRotation, FURY_OPTIONS, furyRotation } from './warrior/fury'
import type { TalentRanks } from './warrior/modifiers'

export type { ClassRotation } from './warrior/fury'

export function rotationOptions(spec: SpecId): RotationOption[] {
  return spec === 'warrior-fury' ? FURY_OPTIONS : []
}

/** The spec's abilities and priority list for these settings; empty for specs without one yet. */
export function classRotation(
  spec: SpecId,
  values: Record<string, number | boolean>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  race: string,
): ClassRotation {
  if (spec === 'warrior-fury') return furyRotation(values, talents, auraIndex, race)
  return { abilities: [], rotation: [] }
}
