// What a notice says after a whole setup replaces yours (docs/ux.md#persistence-and-sharing,
// decision D21): a shared link, an imported code, or a saved setup loaded. Nothing prompts first,
// so the notice says whose setup it replaced, and what loading it had to change.
import { SPEC_META, type SpecId } from '@/sim'

/** The most changes a notice spells out; past that it names the first ones and counts the rest. */
export const NOTICE_CHANGES_SHOWN = 3

/**
 * A notice's description for a setup that just replaced yours: your setup for which spec it
 * replaced, whether that switched you to the spec, and what loading it changed, in normalizeConfig's
 * own words (a setting reset, a buff turned off because it shares a cooldown with another). Up to
 * `NOTICE_CHANGES_SHOWN` changes are spelled out; beyond that, the first two and a count of the rest.
 *   "It replaced your Arms Warrior setup, and you’re on Arms now."
 */
export function replacedDescription(spec: SpecId, switched: boolean, warnings: readonly string[]): string {
  const { name, className } = SPEC_META[spec]
  const replaced = switched ? `It replaced your ${name} ${className} setup, and you’re on ${name} now.` : `It replaced your ${name} ${className} setup.`
  if (warnings.length <= NOTICE_CHANGES_SHOWN) return [replaced, ...warnings].join(' ')
  const shown = warnings.slice(0, NOTICE_CHANGES_SHOWN - 1)
  const rest = warnings.length - shown.length
  return [replaced, ...shown, `${rest} other parts changed too.`].join(' ')
}

/** The notice's title after Reset setup: whose setup is back to its defaults. */
export function resetTitle(spec: SpecId): string {
  const { name, className } = SPEC_META[spec]
  return `Your ${name} ${className} setup is back to its defaults`
}
