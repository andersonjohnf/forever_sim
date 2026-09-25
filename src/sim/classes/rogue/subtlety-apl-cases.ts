// Random Subtlety setups for subtlety-apl.test.ts's check that the priority list (decision D31) in
// its default order plays exactly as Subtlety played before it (the generator is
// combat-apl-cases.ts's). Not part of the app.
import type { RotationOption } from '../../types'
import { rogueCases } from './combat-apl-cases'

/** Subtlety's settings before the priority list, in their order then, so the random stream stays the same. */
export const SUBTLETY_SETTINGS_BEFORE = [
  'rogue.subtlety.racial.enabled',
  'rogue.subtlety.onUseItems.enabled',
  'rogue.subtlety.premeditation.enabled',
  'rogue.subtlety.sliceAndDice.enabled',
  'rogue.subtlety.sliceAndDice.minComboPoints',
  'rogue.subtlety.sliceAndDice.refreshBelowSec',
  'rogue.subtlety.exposeArmor.enabled',
  'rogue.subtlety.builder',
  'rogue.subtlety.rupture.enabled',
  'rogue.subtlety.rupture.minComboPoints',
  'rogue.subtlety.rupture.minFightLeftSec',
  'rogue.subtlety.eviscerate.enabled',
  'rogue.subtlety.eviscerate.minComboPoints',
  'rogue.subtlety.hemorrhage.enabled',
  'rogue.subtlety.ambush.enabled',
  'rogue.subtlety.ghostlyStrike.enabled',
  'rogue.subtlety.thistleTea.enabled',
  'rogue.subtlety.thistleTea.maxEnergy',
  'rogue.subtlety.jujuFlurry.enabled',
]

/** Subtlety's cases. */
export const subtletyCases = (options: readonly RotationOption[], count: number, seed = 31103) =>
  rogueCases('rogue-subtlety', options, SUBTLETY_SETTINGS_BEFORE, count, seed)
