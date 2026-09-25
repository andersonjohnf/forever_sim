// The Destruction warlock's priority list (docs/classes/warlock.md §6.1): Curse of the Elements, Immolate
// kept up, Conflagrate and Shadowburn on cooldown, Corruption and the Bane kept up, Incinerate or Shadow
// Bolt, Life Tap; the Classic Era common priority adapted to Forever, with the first-pass search's picks
// (D27, §6.3).
import type { RotationValue } from '../../types'
import type { ClassRotationContext } from '../rotation'
import type { ClassRotation } from '../warrior/shared'
import { CURSE_BUFF, destructionOptions, warlockApl, warlockIds, warlockRotation, warlockUnusedSettings, type WarlockDefaults } from './shared'
import type { TalentRanks } from './talents'

/** The first-pass defaults (warlock.md §6.3). */
export const DESTRUCTION_DEFAULTS: WarlockDefaults = { sacrifice: 'succubus', filler: 'incinerate', shadowburn: true, lifeTapPct: 5, corruption: true, bane: 'doom' }
export const DESTRUCTION_OPTIONS = destructionOptions(DESTRUCTION_DEFAULTS)
export const DESTRUCTION_IDS = warlockIds('destruction')
/** Its rotation as a priority list (decision D31; warlock.md §6.1). */
export const DESTRUCTION_APL = warlockApl('destruction')

export function destructionRotation(values: Record<string, RotationValue>, talents: TalentRanks, auraIndex: (id: string) => number, context: Partial<ClassRotationContext> = {}, order?: readonly string[]): ClassRotation {
  return warlockRotation('destruction', DESTRUCTION_OPTIONS, values, talents, auraIndex, context, order)
}

/** Its own Curse of the Elements, while the rotation keeps it up. */
export function destructionMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return values[DESTRUCTION_IDS.curse] === false ? [] : [CURSE_BUFF]
}

export const destructionUnusedSettings = (values: Record<string, RotationValue>, talents: TalentRanks) => warlockUnusedSettings('destruction', values, talents)
