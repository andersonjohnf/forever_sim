import { test as base, expect } from '@playwright/test'
import { LAST_SEEN_RELEASE_KEY, RELEASES } from '../src/app/releases.ts'

// 1×1 transparent PNG: game icons come from Wowhead's CDN, which tests must not depend on.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/**
 * Every test fails if the page logs a console error, throws, or gets an HTTP error for any
 * request (e.g. an asset missing the base path).
 *
 * `lastSeenRelease` is the release the browser saw last, stored before the app loads unless the
 * page has stored one itself (so a reload keeps what the app wrote). It's the newest by default, so
 * What's New (src/app/whats-new.tsx) stays shut; a test opts in with an older id, or null for a
 * first visit: `test.use({ lastSeenRelease: null })`.
 */
export const test = base.extend<{ pageProblems: string[]; lastSeenRelease: string | null }>({
  lastSeenRelease: [RELEASES[0].id, { option: true }],
  pageProblems: [
    async ({ page, lastSeenRelease }, use) => {
      if (lastSeenRelease !== null) {
        await page.addInitScript(
          ([key, id]) => {
            try {
              if (localStorage.getItem(key) === null) localStorage.setItem(key, id)
            } catch {
              // Storage blocked: the app shows nothing then.
            }
          },
          [LAST_SEEN_RELEASE_KEY, lastSeenRelease] as const,
        )
      }
      await page.route('https://wow.zamimg.com/**', (route) => route.fulfill({ contentType: 'image/png', body: PIXEL }))
      // Anything the Content-Security-Policy (index.html) blocks, stated plainly whatever the
      // browser's own console message says.
      await page.addInitScript(() =>
        document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'}`)),
      )
      const problems: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`)
      })
      page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))
      page.on('response', (res) => {
        if (res.status() >= 400) problems.push(`HTTP ${res.status()} ${res.url()}`)
      })
      await use(problems)
      expect(problems, 'console errors, page errors or failed requests').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
