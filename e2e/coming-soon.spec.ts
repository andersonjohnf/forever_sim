import type { Locator, Page } from '@playwright/test'
import { ROADMAP } from '../src/app/roadmap.ts'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Coming soon": the header's menu opens what's planned, after Release history, as a side
// sheet like it, full width on a phone: focus on its title, every entry with when it's coming, the
// next update's label standing out, and focus back on the menu's button when it closes.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }

const comingSoon = (page: Page) => page.getByRole('dialog', { name: 'Coming soon' })

/** Opens the header's menu and waits for Coming soon's item, 44 px tall once the menu has zoomed in. */
async function menuItem(page: Page) {
  const item = page.getByRole('menuitem', { name: 'Coming soon' })
  await expect(item).toBeVisible()
  await expect.poll(async () => (await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  return item
}

/** Every entry in order, with its title and when it's coming, and its items as a bulleted list. */
async function listsTheRoadmap(sheet: Locator) {
  const entries = sheet.locator('article')
  await expect(entries).toHaveCount(ROADMAP.length)
  for (const [i, entry] of ROADMAP.entries()) {
    const article = entries.nth(i)
    const heading = article.getByRole('heading', { level: 3 })
    // A screen reader hears the name, a comma, then when: no space before the comma.
    await expect(heading).toHaveAccessibleName(`${entry.title}, ${entry.when}`)
    await expect(article.getByRole('listitem')).toHaveText(entry.items)
  }
  // The next update's label stands out, as Latest does in Release history; the others are muted.
  const next = ROADMAP.filter((e) => e.when === 'Next update').length
  expect(next).toBeGreaterThan(0)
  const nextLabels = sheet.locator('[data-slot=badge]', { hasText: 'Next update' })
  await expect(nextLabels).toHaveCount(next)
  await expect(nextLabels.first()).toBeVisible()
  await expect(nextLabels.first()).toHaveAttribute('data-variant', 'secondary')
  for (const badge of await sheet.locator('[data-slot=badge]', { hasNotText: 'Next update' }).all())
    await expect(badge).toHaveAttribute('data-variant', 'outline')
}

for (const [name, device] of [
  ['desktop', DESKTOP],
  ['phone', PHONE],
] as const) {
  test.describe(`Coming soon, ${name}`, () => {
    test.use(device)

    test('the menu opens it from the keyboard, it lists every entry, and Escape gives focus back', async ({ page }) => {
      await page.goto('./')
      const more = page.getByRole('button', { name: 'More' })
      await more.focus()
      await page.keyboard.press('Enter')
      const item = await menuItem(page)
      // Just after Release history.
      const items = await page.getByRole('menuitem').allInnerTexts()
      expect(items.indexOf('Coming soon')).toBe(items.indexOf('Release history') + 1)
      await item.focus()
      await page.keyboard.press('Enter')

      const sheet = comingSoon(page)
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('heading', { name: 'Coming soon' })).toBeFocused()
      await expect(sheet.getByText('What’s planned, in the order it’s coming. Plans can change.')).toBeVisible()
      await listsTheRoadmap(sheet)

      // No sideways scroll, in the page or the sheet.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
      expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
      // Full width on a phone.
      // (to within a pixel's rounding: the measured width can come back as 390.00001).
      if (name === 'phone') expect((await sheet.boundingBox())!.width).toBeCloseTo(device.viewport.width, 1)

      const close = sheet.getByRole('button', { name: 'Close' })
      const box = (await close.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)

      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()
      await expect(more).toBeFocused()
    })

    test('a tap opens it, and its Close gives focus back to the menu’s button', async ({ page }) => {
      await page.goto('./')
      const more = page.getByRole('button', { name: 'More' })
      await more.click()
      await (await menuItem(page)).click()
      const sheet = comingSoon(page)
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('heading', { name: 'Coming soon' })).toBeFocused()
      await sheet.getByRole('button', { name: 'Close' }).click()
      await expect(sheet).toBeHidden()
      await expect(more).toBeFocused()
    })
  })
}
