import { test as base, expect } from '@playwright/test'

// 1×1 transparent PNG: game icons come from Wowhead's CDN, which tests must not depend on.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/**
 * Every test fails if the page logs a console error, throws, or gets an HTTP error for any
 * request (e.g. an asset missing the /forever_sim/ base path).
 */
export const test = base.extend<{ pageProblems: string[] }>({
  pageProblems: [
    async ({ page }, use) => {
      await page.route('https://wow.zamimg.com/**', (route) => route.fulfill({ contentType: 'image/png', body: PIXEL }))
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
