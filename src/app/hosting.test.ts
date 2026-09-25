// Firebase Hosting's response headers (firebase.json; docs/architecture.md#firebase-hosting and
// docs/architecture.md#content-security-policy). The header policy is index.html's meta policy
// plus frame-ancestors, which a meta tag can't carry; the two can't drift apart.
import { describe, expect, test } from 'vitest'
import firebaseJson from '../../firebase.json?raw'
import indexHtml from '../../index.html?raw'

type Rule = { source: string; headers: { key: string; value: string }[] }
const hosting = (JSON.parse(firebaseJson) as { hosting: { public: string; headers: Rule[] } }).hosting

/** The value of a header on the one rule with that source. */
function header(source: string, key: string): string | undefined {
  const rules = hosting.headers.filter((r) => r.source === source)
  expect(rules, `one rule for ${source}`).toHaveLength(1)
  return rules[0].headers.find((h) => h.key === key)?.value
}

describe('Firebase Hosting headers', () => {
  test('serve the Vite build', () => {
    expect(hosting.public).toBe('dist')
  })

  test("the header CSP is index.html's meta CSP plus frame-ancestors 'none'", () => {
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(indexHtml)?.[1]
    expect(meta).toMatch(/^default-src 'self';/)
    expect(meta).not.toContain('frame-ancestors')
    expect(header('**', 'Content-Security-Policy')).toBe(`${meta}; frame-ancestors 'none'`)
  })

  test('every response carries the security headers', () => {
    expect(header('**', 'X-Content-Type-Options')).toBe('nosniff')
    expect(header('**', 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    // Share and Export copy to the clipboard; nothing else the page could ask for is allowed.
    const permissions = header('**', 'Permissions-Policy')
    expect(permissions).toContain('clipboard-write=(self)')
    expect(permissions).toContain('camera=()')
  })

  test("the page revalidates every load; Vite's hashed assets are immutable; the rest caches an hour", () => {
    expect(header('/', 'Cache-Control')).toBe('no-cache')
    expect(header('/index.html', 'Cache-Control')).toBe('no-cache')
    expect(header('/assets/**', 'Cache-Control')).toBe('public, max-age=31536000, immutable')
    // Everything public/ copies into dist unhashed.
    const unhashed = Object.keys(import.meta.glob('../../public/**/*', { query: '?url', import: 'default' })).map((p) =>
      p.replace('../../public', ''),
    )
    expect(unhashed.length).toBeGreaterThan(0)
    for (const path of unhashed) {
      const source = path.includes('/', 1) ? `/${path.split('/')[1]}/**` : path
      expect(header(source, 'Cache-Control'), path).toBe('public, max-age=3600')
    }
  })
})
