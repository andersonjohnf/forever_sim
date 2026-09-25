import { expect, test } from './fixtures.ts'

// docs/ux.md "Results": on desktop the panel never runs past the viewport. The assumption rows'
// hidden "(opens in a new tab)" text once escaped the panel's scroll area and added about 2,800 px
// of blank page below it (the desktop layout audit, 2026-09-25).
test('opening Assumptions on desktop scrolls inside the panel, not the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  const results = page.getByRole('complementary', { name: 'Results' })
  await results.getByRole('button', { name: 'Simulate' }).click()
  await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
  const before = await page.evaluate(() => document.documentElement.scrollHeight)
  const trigger = results.getByRole('button', { name: /^Assumptions \(\d+\)$/ })
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const after = await page.evaluate(() => document.documentElement.scrollHeight)
  expect(after - before).toBeLessThanOrEqual(1)
})
