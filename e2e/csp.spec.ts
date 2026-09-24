import { expect, test } from './fixtures.ts'

// The Content-Security-Policy (docs/architecture.md#content-security-policy). Every other test
// runs under it too: the fixture fails a test on any violation.
test.describe('Content-Security-Policy', () => {
  test('lets the game icons, fonts and sim worker load', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /script-src 'self';/)
    const icon = page.locator('img[src^="https://wow.zamimg.com/"]').first()
    await expect(icon).toBeVisible()
    await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Geist Variable"'))).toBe(true)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByText(/fights of \d+ s · Forever rules/)).toBeVisible()
  })

  test('blocks a script from another site, and the fixture reports it', async ({ page, pageProblems }) => {
    await page.goto('./')
    const blocked = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          document.addEventListener('securitypolicyviolation', (e) => resolve(`${e.effectiveDirective} ${e.blockedURI}`), { once: true })
          const script = document.createElement('script')
          script.src = 'https://example.com/injected.js'
          document.head.append(script)
        }),
    )
    expect(blocked).toBe('script-src-elem https://example.com/injected.js')
    await expect.poll(() => pageProblems.some((p) => p.includes('CSP violation: script-src-elem blocked https://example.com/injected.js'))).toBe(true)
    // Expected here, so it doesn't fail the test.
    pageProblems.splice(0)
  })
})
