// Random Affliction setups for affliction-apl.test.ts (apl-cases.ts): the settings the spec had
// before the priority list, in their order then, so the random stream stays the same.
import type { RotationOption, SimConfig } from '../../types'
import { warlockCases } from './apl-cases'
import { warlockIds } from './shared'

const ID = warlockIds('affliction')
const SETTINGS_BEFORE = [
  ID.sacrifice,
  ID.racial,
  ID.trinkets,
  ID.powerInfusion,
  ID.curse,
  ID.corruption,
  ID.bane,
  ID.siphonLife,
  ID.lifeTap,
  ID.manaPotion,
  ID.manaPotionMissing,
  ID.rune,
  ID.runeMissing,
]

export const afflictionCases = (options: readonly RotationOption[], count: number): SimConfig[] => warlockCases('warlock-affliction', options, SETTINGS_BEFORE, count, 60602)
