// Share links (docs/ux.md#persistence-and-sharing): the setup, deflated and base64url-encoded
// in the URL hash as #s=…, so nothing is sent to a server.
import type { SimConfig } from '@/sim'

const PREFIX = '#s='

/**
 * Size caps for an incoming link, so a crafted one can't exhaust memory (a deflate bomb). The
 * largest real setup (every slot enchanted, every buff and rotation setting saved) is about
 * 4.4 KB of JSON and 1.7 K characters packed; share.test.ts keeps it under half of each cap.
 */
export const MAX_LINK_CHARS = 8 * 1024
export const MAX_SETUP_BYTES = 16 * 1024

/** A link that's corrupt or over a size cap. */
export class BrokenShareLinkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrokenShareLinkError'
  }
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** Inflates, giving up as soon as the output passes `limit` bytes. */
async function inflate(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      throw new BrokenShareLinkError('The shared setup is too large.')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** The packed form of a setup: what follows #s= in a share link. */
export async function packSetup(config: SimConfig): Promise<string> {
  return toBase64Url(await deflate(new TextEncoder().encode(JSON.stringify(config))))
}

/** The raw (unvalidated) setup in a link's packed form. Throws if it's corrupt or too large. */
export async function unpackSetup(packed: string): Promise<unknown> {
  if (packed.length > MAX_LINK_CHARS) throw new BrokenShareLinkError('The share link is too long.')
  const bytes = await inflate(fromBase64Url(packed), MAX_SETUP_BYTES)
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

export async function shareUrl(config: SimConfig): Promise<string> {
  return `${location.origin}${import.meta.env.BASE_URL}${PREFIX}${await packSetup(config)}`
}

/**
 * The packed setup in a URL's fragment (`#s=…`, with its `#`): its `s` parameter, or null if it has
 * none. Chat apps append tracking parameters to a link they pass on (`&fbclid=…`, `?utm_source=…`),
 * so any other parameter, before or after it, is ignored, and `&` or `?` ends it. What's left is
 * unpacked as it is, so a damaged code is still refused (docs/ux.md#persistence-and-sharing).
 */
export function fragmentCode(hash: string): string | null {
  if (!hash.startsWith('#')) return null
  for (const param of hash.slice(1).split(/[&?]/)) if (param.startsWith('s=')) return param.slice(2)
  return null
}

/** Whether the current URL holds a share link. */
export function hasSharedSetup(): boolean {
  return fragmentCode(location.hash) !== null
}

/**
 * The raw (unvalidated) setup in the current URL's link, leaving the link in place: for a look at it
 * before readSharedSetup loads it. Undefined without one; rejects if it's corrupt or too large.
 */
export function peekSharedSetup(): Promise<unknown> | undefined {
  const code = fragmentCode(location.hash)
  return code === null ? undefined : unpackSetup(code)
}

/**
 * The raw (unvalidated) setup in the current URL, or undefined if there's no link (JSON never
 * gives undefined, so a link whose JSON is `null` reads as null, to be refused as not a setup).
 * Throws if it's corrupt or too large. The link leaves the URL before it's decoded, so one that
 * breaks the page can't break it again on reload.
 */
export async function readSharedSetup(): Promise<unknown> {
  const code = fragmentCode(location.hash)
  if (code === null) return undefined
  // The whole fragment goes, tracking parameters included; the query stays.
  clearSharedSetupFromUrl()
  return unpackSetup(code)
}

function clearSharedSetupFromUrl() {
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}
