// What a notice says after a whole setup replaces yours (docs/ux.md#persistence-and-sharing,
// decision D21): a shared link, an imported code, or a saved setup loaded. Nothing prompts first,
// so the notice says whose setup it replaced.
import { SPEC_META, type SpecId } from '@/sim'

/**
 * A notice's description for a setup that just replaced yours: your setup for which spec it
 * replaced, whether that switched you to the spec, and how many parts were out of date and went
 * back to their defaults (normalizeConfig's warnings).
 *   "It replaced your Arms Warrior setup, and you’re on Arms now."
 */
export function replacedDescription(spec: SpecId, switched: boolean, warnings: readonly string[]): string {
  const { name, className } = SPEC_META[spec]
  const replaced = switched ? `It replaced your ${name} ${className} setup, and you’re on ${name} now.` : `It replaced your ${name} ${className} setup.`
  const outdated =
    warnings.length === 1
      ? 'One part was out of date and is back to its default.'
      : warnings.length > 1
        ? `${warnings.length} parts were out of date and are back to their defaults.`
        : ''
  return [replaced, outdated].filter(Boolean).join(' ')
}

/** The notice's title after Reset setup: whose setup is back to its defaults. */
export function resetTitle(spec: SpecId): string {
  const { name, className } = SPEC_META[spec]
  return `Your ${name} ${className} setup is back to its defaults`
}
