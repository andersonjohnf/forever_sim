// Random Assassination setups for assassination-apl.test.ts's check that the priority list (decision
// D31) in its default order plays exactly as Assassination played before it (the generator is
// combat-apl-cases.ts's). Not part of the app.
import type { RotationOption } from '../../types'
import { rogueCases } from './combat-apl-cases'

/** Assassination's settings before the priority list, in their order then, so the random stream stays the same. */
export const ASSASSINATION_SETTINGS_BEFORE = [
  'rogue.assassination.racial.enabled',
  'rogue.assassination.onUseItems.enabled',
  'rogue.assassination.sliceAndDice.enabled',
  'rogue.assassination.sliceAndDice.minComboPoints',
  'rogue.assassination.sliceAndDice.refreshBelowSec',
  'rogue.assassination.venom.enabled',
  'rogue.assassination.venom.minComboPoints',
  'rogue.assassination.venom.refreshBelowSec',
  'rogue.assassination.exposeArmor.enabled',
  'rogue.assassination.coldBlood.enabled',
  'rogue.assassination.eviscerate.enabled',
  'rogue.assassination.eviscerate.minComboPoints',
  'rogue.assassination.mutilate.enabled',
  'rogue.assassination.thistleTea.enabled',
  'rogue.assassination.thistleTea.maxEnergy',
  'rogue.assassination.jujuFlurry.enabled',
]

/** Assassination's cases. */
export const assassinationCases = (options: readonly RotationOption[], count: number, seed = 31102) =>
  rogueCases('rogue-assassination', options, ASSASSINATION_SETTINGS_BEFORE, count, seed)
