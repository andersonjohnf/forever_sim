// Random Elemental shaman setups for elemental-apl.test.ts's check that the priority list (decision
// D31) in its default order gives the plan the rotation gave before it (enhancement-apl-cases.ts's
// generator). Not part of the app.
import type { RotationOption } from '../../types'
import { shamanCases } from './enhancement-apl-cases'

export { fingerprint, planJson } from './enhancement-apl-cases'

/** The Elemental settings before the priority list, in their order then. */
export const ELEMENTAL_SETTINGS_BEFORE = [
  'shaman.elemental.racial.enabled',
  'shaman.elemental.trinkets.enabled',
  'shaman.elemental.powerInfusion.enabled',
  'shaman.elemental.manaTide.enabled',
  'shaman.elemental.manaTide.missingMana',
  'shaman.elemental.flameShock.enabled',
  'shaman.elemental.lavaBurst.enabled',
  'shaman.elemental.lavaBurst.withFlameShock',
  'shaman.elemental.chainLightning.use',
  'shaman.elemental.earthShock.enabled',
  'shaman.elemental.earthShock.minManaPct',
  'shaman.elemental.lightningBolt.downrank',
  'shaman.elemental.lightningBolt.maxRankFromPct',
  'shaman.elemental.manaPotion.enabled',
  'shaman.elemental.manaPotion.missingMana',
  'shaman.elemental.rune.enabled',
  'shaman.elemental.rune.missingMana',
]

/**
 * Random Elemental setups: Power Infusion and the mana consumables in Buffs; Totem of Rage in place
 * of Totem of the Storm, and Weakness Analyzer (shaman.md "Elemental priority").
 */
export const elementalCases = (options: readonly RotationOption[], count: number, seed = 31072) =>
  shamanCases(
    {
      spec: 'shaman-elemental',
      settings: ELEMENTAL_SETTINGS_BEFORE,
      buffs: ['powerInfusion', 'majorManaPotion', 'demonicRune'],
      items: [
        ['ranged', 22395],
        ['trinket2', 272438],
      ],
    },
    options,
    count,
    seed,
  )
