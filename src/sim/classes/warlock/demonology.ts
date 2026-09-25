// The Demonology warlock's priority list (docs/classes/warlock.md §11.5): a demon sacrificed and another
// kept out with Demonic Pact, its passives on you (Soul Link, Master Demonologist, Demonic Knowledge),
// Curse of the Elements, Corruption and the Bane kept up, Shadow Bolt, Decimation's Soul Fire below 35%
// and Life Tap, which feeds the demon's mana through Demonic Energies; the Classic Era common priority
// adapted to Forever's Demonology tree, with the sim's best found build as its default (D30, §11.6).
import type { RotationValue } from '../../types'
import type { ClassRotationContext } from '../rotation'
import type { ClassRotation } from '../warrior/shared'
import { CURSE_BUFF, demonologyOptions, warlockApl, warlockIds, warlockRotation, warlockUnusedSettings, type WarlockDefaults } from './shared'
import type { TalentRanks } from './talents'

/**
 * The defaults (warlock.md §11.6): the best build the sim has found (D30), the Imp out with the Succubus
 * sacrificed and Soul Fire below 35%. Its lead over the Succubus rests on Improved Imp's hidden effect
 * (Q19) [?]; the optimizer (O4) confirms it.
 */
export const DEMONOLOGY_DEFAULTS: WarlockDefaults = {
  sacrifice: 'succubus',
  demon: 'imp',
  filler: 'shadowBolt',
  shadowburn: false,
  lifeTapPct: 10,
  corruption: true,
  bane: 'doom',
  immolate: true,
  soulFire: true,
}
export const DEMONOLOGY_OPTIONS = demonologyOptions(DEMONOLOGY_DEFAULTS)
export const DEMONOLOGY_IDS = warlockIds('demonology')
/** Its rotation as a priority list (decision D31; warlock.md §11.5). */
export const DEMONOLOGY_APL = warlockApl('demonology')

/** The settings with their defaults under what the setup sets. */
const withDefaults = (values: Record<string, RotationValue>): Record<string, RotationValue> => ({
  ...Object.fromEntries(DEMONOLOGY_OPTIONS.map((o) => [o.id, o.default])),
  ...values,
})

export function demonologyRotation(values: Record<string, RotationValue>, talents: TalentRanks, auraIndex: (id: string) => number, context: Partial<ClassRotationContext> = {}, order?: readonly string[]): ClassRotation {
  return warlockRotation('demonology', DEMONOLOGY_OPTIONS, values, talents, auraIndex, context, order)
}

/** Its own Curse of the Elements, while the rotation keeps it up. */
export function demonologyMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return values[DEMONOLOGY_IDS.curse] === false ? [] : [CURSE_BUFF]
}

export const demonologyUnusedSettings = (values: Record<string, RotationValue>, talents: TalentRanks) => warlockUnusedSettings('demonology', withDefaults(values), talents)
