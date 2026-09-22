// Share links (docs/ux.md#persistence-and-sharing): the setup, deflated and base64url-encoded
// in the URL hash as #s=…, so nothing is sent to a server.
import type { SimConfig } from '@/sim'

const PREFIX = '#s='

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
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

export async function shareUrl(config: SimConfig): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(config))
  const packed = toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
  return `${location.origin}${import.meta.env.BASE_URL}${PREFIX}${packed}`
}

/** The raw (unvalidated) setup in the current URL, or null if there is none. Throws if it's corrupt. */
export async function readSharedSetup(hash = location.hash): Promise<unknown | null> {
  if (!hash.startsWith(PREFIX)) return null
  const bytes = await pipe(fromBase64Url(hash.slice(PREFIX.length)), new DecompressionStream('deflate-raw'))
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function clearSharedSetupFromUrl() {
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}
