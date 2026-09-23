// What a notice says after a whole setup loads (docs/ux.md#persistence-and-sharing): a shared
// link, or a saved setup.
import { SPEC_META, type SpecId } from '@/sim'

/**
 * A notice's description for a setup that just loaded: the spec it switched you to, if it did, and
 * how many parts were out of date and went back to their defaults (normalizeConfig's warnings).
 */
export function loadedDescription(switchedTo: SpecId | null, warnings: readonly string[]): string | undefined {
  const switched = switchedTo ? `You’re on ${SPEC_META[switchedTo].name} ${SPEC_META[switchedTo].className} now.` : ''
  const outdated =
    warnings.length === 1
      ? 'One part was out of date and is back to its default.'
      : warnings.length > 1
        ? `${warnings.length} parts were out of date and are back to their defaults.`
        : ''
  return [switched, outdated].filter(Boolean).join(' ') || undefined
}
