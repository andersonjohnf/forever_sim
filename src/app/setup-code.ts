// Setup codes (docs/ux.md#setups, decision D21): a share link's payload on its own, the setup
// deflated and base64url-encoded (src/app/share.ts). Export's "Copy setup code" copies one, and
// Import's field takes one, or a whole share link, and makes it the current setup.
import { normalizeConfig, SPEC_META, type SimConfig } from '@/sim'
import { BrokenShareLinkError, unpackSetup } from './share'
import { isVisibleSpec } from './specs'

/** A code's characters: base64url, with no padding. */
const CODE = /^[A-Za-z0-9_-]+$/

/**
 * The code in what was pasted, or null if there's none to find:
 * - Anything with a URL fragment (a share link, or just its #s=…): the fragment's `s` parameter,
 *   among any others (#s=…&x=1, #x=1&s=…), up to the first character a code can't have. Text
 *   around the link is ignored, a comma after it included.
 * - Otherwise a bare code, with any whitespace in it dropped: a long code pasted from a chat or an
 *   email may have been wrapped.
 * A link's code may still be damaged or empty, which unpacking finds.
 */
export function findSetupCode(text: string): string | null {
  for (const [, fragment] of text.matchAll(/#([^\s#]*)/g)) {
    const param = fragment.split('&').find((p) => p.startsWith('s='))
    if (param !== undefined) return /^[A-Za-z0-9_-]*/.exec(param.slice(2))![0]
  }
  const bare = text.replace(/\s+/g, '')
  return CODE.test(bare) ? bare : null
}

export const CODE_ERRORS = {
  empty: 'Paste a setup code or a share link.',
  notACode: 'That isn’t a setup code or a share link.',
  damaged: 'That code is damaged or cut short. Copy the whole code again.',
  tooLarge: 'That code is too large to be a setup.',
} as const

export type ReadCode = { ok: true; config: SimConfig; warnings: string[] } | { ok: false; error: string }

/**
 * The setup in a pasted code or share link, normalized for this version of the app as a shared
 * link's is; or, if it can't be used, why, in a sentence for under the field.
 */
export async function readSetupCode(text: string): Promise<ReadCode> {
  if (!text.trim()) return { ok: false, error: CODE_ERRORS.empty }
  const code = findSetupCode(text)
  if (code === null) return { ok: false, error: CODE_ERRORS.notACode }
  let raw: unknown
  try {
    // Checks the size caps (MAX_LINK_CHARS, MAX_SETUP_BYTES) as a link's.
    raw = await unpackSetup(code)
  } catch (error) {
    return { ok: false, error: error instanceof BrokenShareLinkError ? CODE_ERRORS.tooLarge : CODE_ERRORS.damaged }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: CODE_ERRORS.damaged }
  const { config, warnings } = normalizeConfig(raw)
  if (!isVisibleSpec(config.spec)) {
    const { name, className } = SPEC_META[config.spec]
    return { ok: false, error: `That setup is for a ${name} ${className}. This sim doesn’t cover that spec.` }
  }
  return { ok: true, config, warnings }
}
