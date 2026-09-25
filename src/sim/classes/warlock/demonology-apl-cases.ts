// Random Demonology setups for demonology-apl.test.ts (apl-cases.ts): the settings the spec had
// before the priority list, in their order then, so the random stream stays the same.
import type { RotationOption, SimConfig } from '../../types'
import { warlockCases } from './apl-cases'
import { warlockIds } from './shared'

const ID = warlockIds('demonology')
const SETTINGS_BEFORE = [
  ID.sacrifice,
  ID.demon,
  ID.racial,
  ID.trinkets,
  ID.powerInfusion,
  ID.curse,
  ID.immolate,
  ID.corruption,
  ID.bane,
  ID.soulFire,
  ID.lifeTap,
  ID.manaPotion,
  ID.manaPotionMissing,
  ID.rune,
  ID.runeMissing,
]

export const demonologyCases = (options: readonly RotationOption[], count: number): SimConfig[] => warlockCases('warlock-demonology', options, SETTINGS_BEFORE, count, 60603)
