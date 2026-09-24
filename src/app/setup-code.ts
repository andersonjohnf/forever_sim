// Setup codes (docs/ux.md#setups, decision D21): a share link's payload on its own, the setup
// deflated and base64url-encoded (src/app/share.ts). Export's "Copy setup code" copies one, and
// Import's field takes one, or a whole share link, and makes it the current setup.
import { CONFIG_VERSION, normalizeConfig, SPEC_IDS, SPEC_META, type SimConfig, type SpecId } from '@/sim'
import { withinDepth } from './saved-setups'
import { BrokenShareLinkError, unpackSetup } from './share'
import { isVisibleSpec } from './specs'

/** A code's characters: base64url, with no padding. */
const CODE = /^[A-Za-z0-9_-]+$/

/**
 * Shorter than any setup code: the smallest setup that's usable, `{"spec":"warrior-fury"}`, packs
 * to 34 characters. Shorter text can't be one, so it isn't taken for a damaged code.
 */
export const MIN_CODE_CHARS = 24

/**
 * The code in what was pasted, or null if there's none to find:
 * - Anything with a URL fragment (a share link, or just its #s=…): the fragment's `s` parameter,
 *   among any others (#s=…&x=1, #x=1&s=…, or a chat app's #s=…?utm_source=…, as an opened link
 *   reads them: `fragmentCode` in ./share.ts), up to the first character a code can't have. Text
 *   around the link is ignored, a comma after it included.
 * - Otherwise a bare code, with any whitespace in it dropped: a long code pasted from a chat or an
 *   email may have been wrapped.
 * A link's code may still be damaged or empty, which unpacking finds.
 */
export function findSetupCode(text: string): string | null {
  for (const [, fragment] of text.matchAll(/#([^\s#]*)/g)) {
    const param = fragment.split(/[&?]/).find((p) => p.startsWith('s='))
    if (param !== undefined) return /^[A-Za-z0-9_-]*/.exec(param.slice(2))![0]
  }
  const bare = text.replace(/\s+/g, '')
  return CODE.test(bare) ? bare : null
}

/**
 * Whether what was pasted is a talent build code (digits in up to three trees, split by dashes:
 * "30305213132515201-05050103-") or a talent calculator's link, which the Talents tab takes.
 */
export function isTalentCode(text: string): boolean {
  const bare = text.replace(/\s+/g, '')
  return /^\d[\d-]*$/.test(bare) || /\/talent-calc\//i.test(bare)
}

export const CODE_ERRORS = {
  empty: 'Paste a setup code or a share link.',
  notACode: 'That isn’t a setup code or a share link.',
  talentCode: 'That’s a talent build code. Paste it in the Talents tab instead.',
  damaged: 'That code is damaged or cut short. Copy the whole code again.',
  tooLarge: 'That code is too large to be a setup.',
  notASetup: 'That code doesn’t hold a setup.',
  newer: 'That code is from a newer version of Forever Sim. Reload this page to update it, then try again.',
  unknownSpec: 'That code is for a spec this sim doesn’t know.',
} as const

/**
 * Why a code's or a link's setup, as unpacked, isn't one this app can load, before it's normalized
 * (normalizing would turn anything into a default setup, and replace yours with it):
 * - notASetup: not an object, an empty one, a version that isn't a number, or nested deeper than
 *   any setup (MAX_CONFIG_DEPTH)
 * - newer: a version after CONFIG_VERSION (2), so a newer version of the app made it
 * - unknownSpec: a spec that isn't one of the sim's (SPEC_IDS)
 * A setup with no version is taken as version 1, as normalizing and saved setups take it; version 1's
 * talent code is on older trees, which normalizing maps (docs/data/talents.md#tree-versions).
 */
export type SetupProblem = 'notASetup' | 'newer' | 'unknownSpec'

export function setupProblem(raw: unknown): SetupProblem | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'notASetup'
  const { version, spec } = raw as Record<string, unknown>
  if (Object.keys(raw).length === 0) return 'notASetup'
  if (version !== undefined && version !== 1 && version !== CONFIG_VERSION) return typeof version === 'number' && version > CONFIG_VERSION ? 'newer' : 'notASetup'
  if (typeof spec !== 'string' || !SPEC_IDS.includes(spec as SpecId)) return 'unknownSpec'
  if (!withinDepth(raw)) return 'notASetup'
  return null
}

export type ReadCode = { ok: true; config: SimConfig; warnings: string[] } | { ok: false; error: string }

/**
 * The setup in a pasted code or share link, normalized for this version of the app as a shared
 * link's is; or, if it can't be used, why, in a sentence for under the field.
 */
export async function readSetupCode(text: string): Promise<ReadCode> {
  if (!text.trim()) return { ok: false, error: CODE_ERRORS.empty }
  if (isTalentCode(text)) return { ok: false, error: CODE_ERRORS.talentCode }
  const code = findSetupCode(text)
  if (code === null) return { ok: false, error: CODE_ERRORS.notACode }
  // A bare word ("hello") is text, not a code cut short. A link's code is a code, however short.
  if (!text.includes('#') && code.length < MIN_CODE_CHARS) return { ok: false, error: CODE_ERRORS.notACode }
  let raw: unknown
  try {
    // Checks the size caps (MAX_LINK_CHARS, MAX_SETUP_BYTES) as a link's.
    raw = await unpackSetup(code)
  } catch (error) {
    return { ok: false, error: error instanceof BrokenShareLinkError ? CODE_ERRORS.tooLarge : CODE_ERRORS.damaged }
  }
  const problem = setupProblem(raw)
  if (problem) return { ok: false, error: CODE_ERRORS[problem] }
  const { config, warnings } = normalizeConfig(raw)
  if (!isVisibleSpec(config.spec)) {
    const { name, className } = SPEC_META[config.spec]
    return { ok: false, error: `That setup is for a ${name} ${className}. This sim doesn’t cover that spec.` }
  }
  return { ok: true, config, warnings }
}
