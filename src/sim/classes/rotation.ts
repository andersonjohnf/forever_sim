// Rotation options per spec (docs/classes/warrior.md#51-conventions-for-rotation-settings).
//
// The rotation section of the UI renders these generically. M1 simulates white swings only, so
// no spec has options yet; M2 adds the warrior priority lists (warrior.md §5.2–§5.3) here, with
// setting ids `warrior.<spec>.<ability>.<param>`.
import type { RotationOption, SpecId } from '../types'

export function rotationOptions(spec: SpecId): RotationOption[] {
  void spec
  return []
}
