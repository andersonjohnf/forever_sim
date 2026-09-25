import type { Page } from '@playwright/test'
import { RELEASES } from '../src/app/releases.ts'
import { expect, test } from './fixtures.ts'

// docs/ux.md#layout "Header", D34 as amended: from 1440 px the overflow menu's items are the header's
// own buttons (Setups, About & data, Release history, Coming soon, Theme, Reset setup), after Share,
// each as wide as its label and 44 px tall, in one named group, tabbed left to right. Each opens what
// the menu's item does, and a sheet gives focus back to the button that opened it. Below 1440 px the
// menu is back (e2e/shell-a11y.spec.ts and the others cover it at 1280 and 390).

const WIDE = { viewport: { width: 1440, height: 900 } }
const TOOLS = ['Share', 'Setups', 'About & data', 'Release history', 'Coming soon', 'Theme', 'Reset setup']

const group = (page: Page) => page.getByRole('banner').getByRole('group', { name: 'Setup and app' })
const tool = (page: Page, name: string) => group(page).getByRole('button', { name, exact: true })

/**
 * Review finding V4-2: an Escape pressed the moment Release history opens in About's or What's New's
 * place, while that one is still closing. This presses it then, as focus lands on the title, which
 * no key from the test could time.
 */
const escapeAsHistoryOpens = (page: Page) =>
  page.evaluate(() =>
    document.addEventListener('focusin', (event) => {
      const title = event.target
      if (!(title instanceof HTMLElement) || title.tagName !== 'H2' || title.textContent !== 'Release history') return
      title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    }),
  )

test.describe('the header from 1440 px', () => {
  test.use(WIDE)

  test('lists the menu’s items after Share, each 44 px tall and as wide as its label, with no More', async ({ page }) => {
    await page.goto('./')
    const buttons = group(page).getByRole('button')
    await expect(buttons).toHaveText(TOOLS, { useInnerText: true })
    await expect(page.getByRole('button', { name: 'More' })).toHaveCount(0)
    const boxes = await buttons.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        // What the label needs: its icons, text and gaps, then the padding and border around them.
        const range = document.createRange()
        range.selectNodeContents(el)
        const style = getComputedStyle(el)
        const around = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, key) => sum + Number.parseFloat(style[key as 'paddingLeft']), 0)
        return { left: r.left, width: r.width, height: r.height, needs: range.getBoundingClientRect().width + around }
      }),
    )
    for (const [i, box] of boxes.entries()) {
      expect(box.height, TOOLS[i]).toBeGreaterThanOrEqual(44)
      // Sized to its label, never stretched to fill the row (docs/ux.md principle 4).
      expect(Math.abs(box.width - box.needs), TOOLS[i]).toBeLessThanOrEqual(1)
      if (i > 0) expect(box.left, TOOLS[i]).toBeGreaterThan(boxes[i - 1].left)
    }
  })

  test('fits beside the widest spec’s name, with room to spare for a classic scrollbar', async ({ page }) => {
    await page.goto('./')
    const switcher = page.getByRole('button', { name: /^Spec: / })
    for (const name of ['Marksmanship', 'Beast Mastery']) {
      await switcher.click()
      await page.getByRole('menuitem', { name }).click()
      await expect(switcher).toHaveAccessibleName(new RegExp(`^Spec: ${name} `))
      const room = await page.evaluate(() => ({
        header: document.querySelector('header')!.scrollWidth,
        page: document.documentElement.scrollWidth,
        width: window.innerWidth,
      }))
      expect(room.header, name).toBeLessThanOrEqual(room.width)
      expect(room.page, name).toBeLessThanOrEqual(room.width)
      // A Windows scrollbar takes up to 17 px: the gap between the switcher and Share still covers it.
      const gap = (await tool(page, 'Share').boundingBox())!.x - ((await switcher.boundingBox())!.x + (await switcher.boundingBox())!.width)
      expect(gap, name).toBeGreaterThan(17 + 16)
      expect(await switcher.locator('span > span').evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth)), name).toBe(true)
    }
  })

  test('Tab moves through them left to right', async ({ page }) => {
    await page.goto('./')
    await tool(page, 'Share').focus()
    for (const name of TOOLS.slice(1)) {
      await page.keyboard.press('Tab')
      await expect(tool(page, name)).toBeFocused()
    }
  })

  for (const [name, heading] of [
    ['Setups', 'Setups'],
    ['About & data', 'About Forever Sim'],
    ['Release history', 'Release history'],
    ['Coming soon', 'Coming soon'],
  ] as const) {
    test(`${name} opens its sheet, and focus goes back to it when the sheet closes`, async ({ page }) => {
      await page.goto('./')
      await tool(page, name).click()
      const sheet = page.getByRole('dialog')
      await expect(sheet.getByRole('heading', { name: heading, exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()
      await expect(tool(page, name)).toBeFocused()

      // The keyboard way in, closed with its Close button.
      await page.keyboard.press('Enter')
      await expect(sheet.getByRole('heading', { name: heading, exact: true })).toBeFocused()
      await sheet.getByRole('button', { name: 'Close' }).click()
      await expect(sheet).toBeHidden()
      await expect(tool(page, name)).toBeFocused()
    })
  }

  test('About’s release stamp opens Release history, which gives focus back to About & data', async ({ page }) => {
    await page.goto('./')
    await tool(page, 'About & data').click()
    await page.getByRole('dialog').getByRole('button', { name: 'What changed in each release' }).click()
    const history = page.getByRole('dialog', { name: 'Release history' })
    await expect(history.getByRole('heading', { name: 'Release history' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(history).toBeHidden()
    await expect(tool(page, 'About & data')).toBeFocused()
  })

  test('an Escape as Release history opens from About, while About is still closing, closes it', async ({ page }) => {
    await page.goto('./')
    await tool(page, 'About & data').click()
    const stamp = page.getByRole('dialog').getByRole('button', { name: 'What changed in each release' })
    await expect(stamp).toBeVisible()
    await escapeAsHistoryOpens(page)
    await stamp.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(tool(page, 'About & data')).toBeFocused()
  })

  test('Theme opens its three choices, and a choice takes', async ({ page }) => {
    await page.goto('./')
    await tool(page, 'Theme').click()
    const choices = page.getByRole('menuitemradio')
    await expect(choices).toHaveText(['System', 'Light', 'Dark'])
    // Once the menu has finished opening (it zooms in).
    await expect.poll(() => choices.evaluateAll((els) => Math.min(...els.map((el) => el.getBoundingClientRect().height)))).toBeGreaterThanOrEqual(44)
    await page.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect(tool(page, 'Theme')).toBeFocused()
    await tool(page, 'Theme').click()
    await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked()
    await page.getByRole('menuitemradio', { name: 'Light' }).click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  })

  test('Reset setup takes a second click that names the spec, then says so', async ({ page }) => {
    await page.goto('./')
    await tool(page, 'Reset setup').click()
    // The first click only opens its one choice: nothing is reset yet.
    const item = page.getByRole('menuitem', { name: 'Reset Fury to defaults' })
    await expect(item).toBeVisible()
    await expect.poll(async () => (await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    await item.click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Your Fury Warrior setup is back to its defaults' })).toBeVisible()
  })

  test('crossing 1440 px swaps the buttons for the menu, and back', async ({ page }) => {
    await page.goto('./')
    await expect(tool(page, 'Setups')).toBeVisible()
    await page.setViewportSize({ width: 1439, height: 900 })
    await expect(group(page).getByRole('button')).toHaveText(['Share', ''], { useInnerText: true })
    await expect(group(page).getByRole('button', { name: 'More' })).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(group(page).getByRole('button')).toHaveText(TOOLS, { useInnerText: true })
  })
})

test.describe('What’s new at 1440 px', () => {
  test.use({ ...WIDE, lastSeenRelease: RELEASES.at(-1)!.id })

  test('All releases opens Release history, which gives focus to the Release history button', async ({ page }) => {
    await page.goto('./')
    const dialog = page.getByRole('dialog', { name: 'What’s new' })
    await dialog.getByRole('button', { name: 'All releases' }).click()
    const history = page.getByRole('dialog', { name: 'Release history' })
    await expect(history.getByRole('heading', { name: 'Release history' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(history).toBeHidden()
    await expect(tool(page, 'Release history')).toBeFocused()
  })

  test('an Escape as Release history opens, while What’s new is still closing, closes it', async ({ page }) => {
    await page.goto('./')
    const all = page.getByRole('dialog', { name: 'What’s new' }).getByRole('button', { name: 'All releases' })
    await expect(all).toBeVisible()
    await escapeAsHistoryOpens(page)
    await all.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(tool(page, 'Release history')).toBeFocused()
  })
})
