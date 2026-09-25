import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#results "The wide layout's right panel": from 1440 px the boss's attack table explains
// itself behind an info button beside its heading (wide-panel.spec.ts: click, keyboard, not hover).
// Review finding V4-4: the explanation opened over the table it explains. It opens beside the
// character sheet instead, out in the page, its top level with the table's heading, clear of the
// sheet and inside the window.

async function seedPaladin(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    const state = { config: { version: 1, spec: 'paladin-protection' }, bySpec: {}, section: 'gear' }
    localStorage.setItem('forever-sim:setup', JSON.stringify({ state, version: 1 }))
  })
}

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`the boss table’s explanation opens beside the sheet, not over it, ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await seedPaladin(page)
    await page.goto('./')
    const sheet = page.getByRole('complementary', { name: 'Results' }).getByRole('region', { name: 'Character sheet' })
    const table = sheet.getByRole('region', { name: 'Boss’s attack table' })
    const info = table.getByRole('button', { name: 'About the boss’s attack table' })
    for (const open of [() => info.click(), () => info.press('Enter')]) {
      await open()
      const popover = page.getByRole('dialog', { name: 'Boss’s attack table' })
      await expect(popover).toContainText('Your rotation keeps Holy Shield up most of the fight.')
      // Once it has settled in place (it zooms in).
      await expect.poll(() => popover.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0)
      const [p, s, heading] = await Promise.all([popover.boundingBox(), sheet.boundingBox(), table.getByRole('heading').boundingBox()])
      // Left of the whole sheet, with room between, and its top level with the table's heading.
      expect(p!.x + p!.width).toBeLessThanOrEqual(s!.x - 8)
      expect(Math.abs(p!.y - heading!.y)).toBeLessThanOrEqual(16)
      // Whole, inside the window.
      expect(p!.x).toBeGreaterThanOrEqual(16)
      expect(p!.y + p!.height).toBeLessThanOrEqual(height - 16)
      expect(await popover.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
      await page.keyboard.press('Escape')
      await expect(popover).toBeHidden()
      await expect(info).toBeFocused()
    }
  })
}
