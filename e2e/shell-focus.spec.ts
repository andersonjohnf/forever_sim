import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#accessibility: focus in and out of the item picker, touch targets in the shell, and
// section tabs moved by arrow keys. (Notices over open sheets and the keyboard's way to them:
// e2e/notices.spec.ts.)

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }

/** Every match is at least 44 × 44 px (after any open animation). */
const expectTarget = async (locator: Locator) => {
  await expect(locator).toBeVisible()
  await expect.poll(async () => Math.min((await locator.boundingBox())!.width, (await locator.boundingBox())!.height)).toBeGreaterThanOrEqual(44)
}

for (const [name, device] of [
  ['phone', PHONE],
  ['desktop', DESKTOP],
] as const) {
  test.describe(`the item picker, ${name} (RU2, RU12)`, () => {
    test.use(device)

    test('takes focus when it opens, keeps it, and gives it back to the slot however it closes', async ({ page }) => {
      await page.goto('./')
      const slot = page.locator('[data-gear-slot="head"]')
      const picker = page.getByRole('dialog', { name: 'Choose head' })
      // Phones focus the title, so the keyboard doesn't cover the list; desktop, the search box.
      const first = name === 'phone' ? picker.getByRole('heading', { name: 'Choose head' }) : picker.getByLabel('Search items')

      // Escape. (Clicks land on the item's icon, clear of any flag badge.)
      await slot.click({ position: { x: 24, y: 24 } })
      await expect(first).toBeFocused()
      // Focus stays in the picker, going backwards or forwards.
      for (const key of ['Shift+Tab', 'Shift+Tab', 'Tab', 'Tab', 'Tab']) {
        await page.keyboard.press(key)
        await expect.poll(() => picker.evaluate((el) => el.contains(document.activeElement))).toBe(true)
      }
      await page.keyboard.press('Escape')
      await expect(picker).toBeHidden()
      await expect(slot).toBeFocused()

      // The close button, 44 px on phones too.
      await slot.click({ position: { x: 24, y: 24 } })
      await expect(first).toBeFocused()
      const close = picker.getByRole('button', { name: 'Close' })
      await expectTarget(close)
      await close.click()
      await expect(picker).toBeHidden()
      await expect(slot).toBeFocused()

      // Picking an item.
      await slot.click({ position: { x: 24, y: 24 } })
      await expect(first).toBeFocused()
      const item = picker.getByRole('list', { name: 'Items' }).getByRole('button').filter({ hasNotText: 'Leave this slot empty' })
      const other = item.and(page.locator(':not([aria-current])')).first()
      const picked = (await other.innerText()).split('.')[0]
      await other.click()
      await expect(picker).toBeHidden()
      await expect(slot).toBeFocused()
      await expect(slot).toHaveAttribute('aria-label', `Head: ${picked}`)
    })
  })
}

test.describe('the phone results sheet (RU12)', () => {
  test.use(PHONE)

  test('has a 44 px close button that hands focus back to Show results and details', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const show = page.getByRole('button', { name: 'Show results' })
    await show.click()
    const close = page.getByRole('dialog', { name: 'Results' }).getByRole('button', { name: 'Close' })
    await expectTarget(close)
    await close.click()
    await expect(page.getByRole('dialog', { name: 'Results' })).toBeHidden()
    await expect(show).toBeFocused()
  })
})

test.describe('touch targets in the shell (RU7)', () => {
  test.use(PHONE)

  test('Share, the footer’s wago.tools link and the About links are 44 px', async ({ page }) => {
    await page.goto('./')
    await expectTarget(page.getByRole('button', { name: 'Share setup' }))
    const footer = page.locator('footer').getByRole('link', { name: 'wago.tools' })
    await footer.scrollIntoViewIfNeeded()
    await expect.poll(async () => (await footer.boundingBox())!.height).toBeGreaterThanOrEqual(44)

    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'About & data' }).click()
    const about = page.getByRole('dialog', { name: 'About Forever Sim' })
    const links = about.getByRole('link')
    // wago.tools, the repository, what still needs testing, and decades.gg.
    await expect(links).toHaveCount(4)
    for (const link of await links.all()) {
      await link.scrollIntoViewIfNeeded()
      await expect.poll(async () => (await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('section tabs on a phone (RU13)', () => {
  test.use(PHONE)

  test('a tab reached with the arrow keys scrolls clear of the edge fades', async ({ page }) => {
    await page.goto('./')
    const bar = page.getByRole('tablist')
    const tabs = ['Character', 'Talents', 'Gear', 'Buffs', 'Rotation', 'Fight']
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    /** How far the focused tab sits inside the faded edges, in px (0 when it's clear of them). */
    const hidden = () =>
      bar.evaluate((el) => {
        const tab = document.activeElement as HTMLElement
        const box = el.getBoundingClientRect()
        const { left, right } = tab.getBoundingClientRect()
        const fade = el.dataset.fade ?? 'none'
        const leftFade = fade === 'left' || fade === 'both' ? 48 : 0
        const rightFade = fade === 'right' || fade === 'both' ? 48 : 0
        return Math.max(0, box.left + leftFade - left, right - (box.right - rightFade))
      })
    for (const [key, order] of [
      ['ArrowRight', tabs.slice(1)],
      ['ArrowLeft', tabs.slice(0, -1).reverse()],
    ] as const) {
      for (const tab of order) {
        await page.keyboard.press(key)
        await expect(page.getByRole('tab', { name: tab, exact: true })).toBeFocused()
        await expect.poll(hidden, { message: `${tab} is clear of the fades` }).toBeLessThanOrEqual(1)
      }
    }
  })
})
