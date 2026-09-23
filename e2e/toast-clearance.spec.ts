import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#persistence-and-sharing: a toast never hides the focused control. A waiting toast
// clears every control in a sheet or drawer, not just on the page (PV1); and only a waiting toast
// grows the bottom padding, so nothing moves when a 10 s toast goes (PV5).

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }

const toasts = (page: Page) => page.locator('[data-sonner-toast]')

/** Chooses a Gear menu item with the keyboard, so its toast waits for Dismiss. */
async function gearMenuByKeyboard(page: Page, item: 'Remove all gear' | 'Equip pre-raid best in slot') {
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
  await page.getByRole('button', { name: 'Gear options' }).click()
  await page.getByRole('menuitem', { name: item }).focus()
  await page.keyboard.press('Enter')
}

/** Chooses a Gear menu item with a tap or click, so its toast goes by itself in 10 s. */
async function gearMenuByPointer(page: Page, item: 'Remove all gear' | 'Equip pre-raid best in slot') {
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
  await page.getByRole('button', { name: 'Gear options' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Raises a toast that waits for Dismiss, and waits for it to slide in. */
async function waitingToast(page: Page, item: 'Remove all gear' | 'Equip pre-raid best in slot' = 'Remove all gear') {
  await gearMenuByKeyboard(page, item)
  const toast = toasts(page).filter({ hasText: /to reach Undo/ })
  await expect(toast).toBeVisible()
  await settled(page)
  return toast
}

/** Waits until no toast is moving. */
async function settled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].some((t) => t.getAnimations().length > 0)))
    .toBe(false)
}

/** How many px of the focused control the toasts cover (TU2's measure, e2e/undo-toasts.spec.ts). */
const covered = (page: Page) =>
  page.evaluate(() => {
    const box = document.activeElement!.getBoundingClientRect()
    const tops = [...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top)
    return Math.max(0, box.bottom - Math.min(...tops))
  })

/**
 * Tabs once round an open sheet or dialog (its focus trap brings Tab back to the first stop), or
 * through `limit` stops, and checks that no stop is left under a toast. With `expand`, it opens
 * each collapsed section on the way, with Enter, so the controls inside get their turn. Returns
 * how many stops it checked.
 */
async function tabClearOfToasts(page: Page, { expand = false, limit = 200 } = {}) {
  await page.evaluate(() => ((window as unknown as { tabbed: WeakSet<Element> }).tabbed = new WeakSet()))
  let checked = 0
  while (checked < limit) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const el = document.activeElement!
      const { tabbed } = window as unknown as { tabbed: WeakSet<Element> }
      const again = tabbed.has(el)
      tabbed.add(el)
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 50) ?? el.tagName
      const collapsed = el.getAttribute('data-slot') === 'collapsible-trigger' && el.getAttribute('aria-expanded') === 'false'
      return { again, name, collapsed }
    })
    if (stop.again) break
    if (expand && stop.collapsed) await page.keyboard.press('Enter')
    await expect.poll(() => covered(page), { message: `${stop.name} is clear of the toast` }).toBe(0)
    checked++
  }
  return checked
}

/** Waits for an opening sheet or dialog to finish sliding in. */
async function opened(page: Page, name: string) {
  const sheet = page.getByRole('dialog', { name })
  await expect(sheet).toBeVisible()
  await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0)
  return sheet
}

test.describe('a waiting toast over a sheet or drawer (PV1)', () => {
  test.describe('phone', () => {
    test.use(PHONE)

    test('every control in the results sheet can be focused clear of it', async ({ page }) => {
      await page.goto('./')
      const toast = await waitingToast(page)
      await page.getByRole('button', { name: 'Simulate', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: 'Show results' }).click()
      await opened(page, 'Results')
      await expect(page.getByRole('heading', { name: 'Results' })).toBeFocused()
      // Close, Open Gear, Run again, the three sections (opened on the way, the Character sheet
      // among them) and every assumption in the last.
      expect(await tabClearOfToasts(page, { expand: true })).toBeGreaterThan(10)
      await expect(toast).toBeVisible()
    })

    test('every choice in the enchant drawer can be made active clear of it', async ({ page }) => {
      await page.goto('./')
      await gearMenuByPointer(page, 'Remove all gear')
      const toast = await waitingToast(page, 'Equip pre-raid best in slot')
      await page.getByRole('button', { name: /, Hands enchant$/ }).click()
      await opened(page, 'Hands enchant')
      const list = page.getByRole('listbox', { name: 'Hands enchants' })
      await expect(list).toBeFocused()
      const options = await list.getByRole('option').count()
      expect(options).toBeGreaterThan(8)
      // The list holds focus; the active option is what the keys move, so that's what must show.
      const activeCovered = () =>
        page.evaluate(() => {
          const box = document.querySelector('[role=option][data-active]')!.getBoundingClientRect()
          const tops = [...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top)
          return Math.max(0, box.bottom - Math.min(...tops))
        })
      for (let i = 0; i < options; i++) {
        await page.keyboard.press('ArrowDown')
        await expect.poll(activeCovered, { message: `option ${i + 1} is clear of the toast` }).toBe(0)
      }
      await expect(toast).toBeVisible()
    })
  })

  for (const [width, device] of [
    [390, PHONE],
    [768, { viewport: { width: 768, height: 900 } }],
  ] as const) {
    test.describe(`${width} px`, () => {
      test.use(device)

      test('every control in About can be focused clear of it', async ({ page }) => {
        await page.goto('./')
        const toast = await waitingToast(page)
        await page.getByRole('button', { name: 'More' }).click()
        await page.getByRole('menuitem', { name: 'About & data' }).click()
        await opened(page, 'About Forever Sim')
        // Close, the wago.tools link, and the two links under "Source and docs".
        expect(await tabClearOfToasts(page)).toBe(4)
        await expect(toast).toBeVisible()
      })
    })
  }

  for (const [name, device] of [
    ['phone', PHONE],
    ['desktop', DESKTOP],
  ] as const) {
    test.describe(name, () => {
      test.use(device)

      test('the item picker’s list can be focused clear of it', async ({ page }) => {
        await page.goto('./')
        const toast = await waitingToast(page)
        await page.getByRole('button', { name: 'Main hand: empty' }).click()
        await opened(page, 'Choose main hand')
        await page.getByRole('radio', { name: 'All items' }).click()
        // Well past the first screenful of items.
        expect(await tabClearOfToasts(page, { limit: 40 })).toBe(40)
        await expect(toast).toBeVisible()
      })
    })
  }
})

for (const [name, device] of [
  ['phone', PHONE],
  ['desktop', DESKTOP],
] as const) {
  test.describe(`toasts and the page, ${name}`, () => {
    test.use(device)

    test('a toast that goes by itself leaves the bottom padding alone, so nothing moves when it goes (PV5)', async ({ page }) => {
      await page.clock.install()
      await page.goto('./')
      const padding = () => page.locator('main').evaluate((el) => getComputedStyle(el).paddingBottom)
      const before = await padding()
      await gearMenuByPointer(page, 'Remove all gear')
      const toast = toasts(page).filter({ hasText: 'All gear removed' })
      await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible()
      await expect(toast.getByRole('button', { name: 'Dismiss' })).toHaveCount(0)
      await settled(page)
      expect(await padding()).toBe(before)

      // Scrolled to the end of the page as it times out.
      await page.mouse.move(0, 0)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const end = await page.evaluate(() => window.scrollY)
      await page.clock.runFor(11_000)
      await expect(toast).toHaveCount(0)
      expect(await padding()).toBe(before)
      expect(await page.evaluate(() => window.scrollY)).toBe(end)
    })
  })
}
