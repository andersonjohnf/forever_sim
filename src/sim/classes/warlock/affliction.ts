// The Affliction warlock's priority list (docs/classes/warlock.md §6.2): Curse of the Elements,
// Corruption, Bane of Agony and Siphon Life kept up, an instant Shadow Bolt on Nightfall's Shadow Trance,
// Shadow Bolt, Life Tap; the Classic Era common priority adapted to Forever (Dark Pact is gone), with the
// first-pass search's picks (D27, §6.3).
import type { RotationValue } from '../../types'
import type { ClassRotationContext } from '../rotation'
import type { ClassRotation } from '../warrior/shared'
import { afflictionOptions, CURSE_BUFF, warlockApl, warlockIds, warlockRotation, warlockUnusedSettings, type WarlockDefaults } from './shared'
import type { TalentRanks } from './talents'

/**
 * The first-pass defaults (warlock.md §6.3). The filler stays Shadow Bolt even with Incinerate talented:
 * Affliction casts no Immolate for its +25%, and it loses 13.6% there (§6.4).
 */
export const AFFLICTION_DEFAULTS: WarlockDefaults = { sacrifice: 'imp', filler: 'shadowBolt', shadowburn: false, lifeTapPct: 10, corruption: true, bane: 'doom' }
export const AFFLICTION_OPTIONS = afflictionOptions(AFFLICTION_DEFAULTS)
export const AFFLICTION_IDS = warlockIds('affliction')
/** Its rotation as a priority list (decision D31; warlock.md §6.2). */
export const AFFLICTION_APL = warlockApl('affliction')

export function afflictionRotation(values: Record<string, RotationValue>, talents: TalentRanks, auraIndex: (id: string) => number, context: Partial<ClassRotationContext> = {}, order?: readonly string[]): ClassRotation {
  return warlockRotation('affliction', AFFLICTION_OPTIONS, values, talents, auraIndex, context, order)
}

/** Its own Curse of the Elements, while the rotation keeps it up. */
export function afflictionMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return values[AFFLICTION_IDS.curse] === false ? [] : [CURSE_BUFF]
}

export const afflictionUnusedSettings = (values: Record<string, RotationValue>, talents: TalentRanks) => warlockUnusedSettings('affliction', values, talents)
