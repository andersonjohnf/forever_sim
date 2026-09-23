import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#accessibility and #persistence-and-sharing: toasts over open sheets, the keyboard's
// way to a toast, focus in and out of the item picker, touch targets in the shell, and section
// tabs moved by arrow keys.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }

const undoIn = (page: Page, title: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: title }).getByRole('button', { name: 'Undo' })

/** The slot's accessible name, e.g. "Head: Lionheart Helm", read without its aria-hidden guard. */
const slotName = (page: Page, slot: string) => page.locator(`[data-gear-slot="${slot}"]`).getAttribute('aria-label')

/** Every match is at least 44 × 44 px (after any open animation). */
const expectTarget = async (locator: Locator) => {
  await expect(locator).toBeVisible()
  await expect.poll(async () => Math.min((await locator.boundingBox())!.width, (await locator.boundingBox())!.height)).toBeGreaterThanOrEqual(44)
}

async function removeAllGear(page: Page) {
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
  await page.getByRole('button', { name: 'Gear options' }).click()
  await page.getByRole('menuitem', { name: 'Remove all gear' }).click()
  await expect(undoIn(page, 'All gear removed')).toBeVisible()
}

test.describe('an Undo toast over an open sheet (RU1)', () => {
  test.describe('phone', () => {
    test.use(PHONE)

    test('a tap on Undo over the results sheet puts the gear back and leaves the sheet as it was', async ({ page }) => {
      await page.goto('./')
      await removeAllGear(page)
      await page.getByRole('button', { name: 'Simulate', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: 'Show results' }).tap()
      const sheet = page.getByRole('dialog', { name: 'Results' })
      await expect(sheet.getByText('No main-hand weapon')).toBeVisible()
      await expect(sheet.getByRole('group', { name: 'DPS' })).not.toContainText('Setup changed')

      await undoIn(page, 'All gear removed').tap()
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
      // The sheet is still open and untouched; the result is now for another setup.
      await expect(sheet).toBeVisible()
      await expect(sheet.getByText('No main-hand weapon')).toBeVisible()
      await expect(sheet.getByRole('group', { name: 'DPS' })).toContainText('Setup changed')
      expect(await slotName(page, 'mainHand')).not.toBe('Main hand: empty')
    })

    test('the keyboard reaches Undo over the results sheet with Alt+T, and comes back to the sheet', async ({ page }) => {
      await page.goto('./')
      await removeAllGear(page)
      await page.getByRole('button', { name: 'Simulate', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: 'Show results' }).click()
      const sheet = page.getByRole('dialog', { name: 'Results' })
      await expect(sheet.getByRole('heading', { name: 'Results' })).toBeFocused()

      await page.keyboard.press('Alt+KeyT')
      const undo = undoIn(page, 'All gear removed')
      await expect(undo).toBeFocused()
      // Its focus ring shows, though the last thing before Alt+T was a click.
      await expect(undo).toHaveCSS('outline-style', 'solid')
      await page.keyboard.press('Enter')
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('group', { name: 'DPS' })).toContainText('Setup changed')
      // Focus is back where it was, inside the sheet.
      await expect(sheet.getByRole('heading', { name: 'Results' })).toBeFocused()
    })
  })

  test.describe('desktop', () => {
    test.use(DESKTOP)

    test('Undo over the item picker works by click, and leaves the picker open', async ({ page }) => {
      await page.goto('./')
      await removeAllGear(page)
      await page.getByRole('button', { name: 'Head: empty' }).click()
      const picker = page.getByRole('dialog', { name: 'Choose head' })
      await expect(picker.getByLabel('Search items')).toBeFocused()
      await undoIn(page, 'All gear removed').click()
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
      await expect(picker).toBeVisible()
      // The head is back, so the picker now offers to empty the slot.
      await expect(picker.getByRole('button', { name: 'Leave this slot empty' })).toBeVisible()
    })

    test('Undo over the About sheet works from the keyboard, and Escape then closes the sheet', async ({ page }) => {
      await page.goto('./')
      await page.getByRole('tab', { name: 'Character', exact: true }).click()
      await page.getByRole('radio', { name: 'Orc' }).click()
      await page.getByRole('button', { name: 'More' }).click()
      await page.getByRole('menuitem', { name: /Reset Fury/ }).click()
      await page.getByRole('button', { name: 'More' }).click()
      await page.getByRole('menuitem', { name: 'About & data' }).click()
      const about = page.getByRole('dialog', { name: 'About Forever Sim' })
      await expect(about.getByRole('heading', { name: 'About Forever Sim' })).toBeFocused()

      await page.keyboard.press('Alt+KeyT')
      await expect(undoIn(page, 'Fury Warrior reset to defaults')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(about).toBeVisible()
      await expect(about.getByRole('heading', { name: 'About Forever Sim' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(about).toBeHidden()
      await expect(page.getByRole('radio', { name: 'Orc' })).toHaveAttribute('aria-checked', 'true')
    })
  })
})

test.describe('toasts and the keyboard (RU8)', () => {
  test.use(DESKTOP)

  test('a toast raised from the keyboard says how to reach it and waits; Escape dismisses it and hands focus back', async ({ page }) => {
    await page.clock.install()
    await page.goto('./')
    await page.getByRole('button', { name: 'More' }).click()
    const reset = page.getByRole('menuitem', { name: /Reset Fury/ })
    await reset.focus()
    await page.keyboard.press('Enter')
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Fury Warrior reset to defaults' })
    await expect(toast).toContainText(/Press (Alt|Option)\+T to reach Undo\./)
    await expect(toast.getByRole('button', { name: 'Dismiss' })).toBeVisible()
    await page.clock.runFor(60_000)
    await expect(toast).toBeVisible()

    const more = page.getByRole('button', { name: 'More' })
    await expect(more).toBeFocused()
    await page.keyboard.press('Alt+KeyT')
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
    // Sonner takes the toast away after its exit animation.
    await page.clock.runFor(1_000)
    await expect(toast).toHaveCount(0)
  })

  test('Dismiss closes it too', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /Reset Fury/ }).focus()
    await page.keyboard.press('Enter')
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Fury Warrior reset to defaults' })
    await expect(toast.getByRole('button', { name: 'Dismiss' })).toBeVisible()
    await expectTarget(toast.getByRole('button', { name: 'Dismiss' }))
    await toast.getByRole('button', { name: 'Dismiss' }).click()
    await expect(toast).toHaveCount(0)
  })

  test('a toast raised by a click has no hint and no Dismiss (it goes by itself)', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /Reset Fury/ }).click()
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Fury Warrior reset to defaults' })
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible()
    await expect(toast).not.toContainText('to reach Undo')
    await expect(toast.getByRole('button', { name: 'Dismiss' })).toHaveCount(0)
  })
})

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

  test('has a 44 px close button that hands focus back to Show results', async ({ page }) => {
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
    await expect(links).toHaveCount(3)
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
