import { expect, test } from './fixtures.ts'

// The enchant picker (docs/ux.md "Gear"): one listbox with arrow keys, a named popover on wider
// screens and a full-height sheet on phones, and focus back on the chip when it closes. The gear
// flags' popovers are named too.

test.describe('enchant picker', () => {
  test('is a named listbox: arrow keys move, Enter picks, and focus returns to the chip', async ({ page }) => {
    await page.goto('./')
    const chip = page.getByRole('button', { name: /^Hands enchant: Greater Strength/ })
    await chip.click()
    const picker = page.getByRole('dialog', { name: 'Hands enchant' })
    const list = picker.getByRole('listbox', { name: 'Hands enchants' })
    await expect(list).toBeFocused()
    await expect(list.getByRole('option')).toHaveCount(13)
    await expect(list.getByRole('option', { name: 'No enchant' })).toBeVisible()
    // The current enchant is the active option.
    const active = () => list.evaluate((el) => document.getElementById(el.getAttribute('aria-activedescendant') ?? '')?.textContent)
    expect(await active()).toMatch(/^Greater Strength/)
    await page.keyboard.press('ArrowDown')
    expect(await active()).toMatch(/^Greater Agility/)
    await page.keyboard.press('Enter')
    await expect(picker).toBeHidden()
    await expect(page.getByRole('button', { name: /^Hands enchant: Greater Agility/ })).toBeFocused()

    // Escape closes it without a change, and focus returns too.
    await page.keyboard.press('Enter')
    await expect(list).toBeFocused()
    await page.keyboard.press('Home')
    expect(await active()).toBe('No enchant')
    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()
    await expect(page.getByRole('button', { name: /^Hands enchant: Greater Agility/ })).toBeFocused()
  })

  test('its options are 44 px targets and a click picks one', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Hands enchant:/ }).click()
    const options = page.getByRole('listbox', { name: 'Hands enchants' }).getByRole('option')
    for (const height of await options.evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetHeight))) {
      expect(height).toBeGreaterThanOrEqual(44)
    }
    await options.filter({ hasText: 'No enchant' }).click()
    await expect(page.getByRole('button', { name: 'Hands enchant: none. Change enchant' })).toBeVisible()
  })
})

test.describe('enchant picker on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('opens as a full-height sheet with a close button, and focus returns to the chip', async ({ page }) => {
    await page.goto('./')
    const chip = page.getByRole('button', { name: /^Hands enchant: Greater Strength/ })
    await chip.tap()
    const sheet = page.getByRole('dialog', { name: 'Hands enchant' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('listbox', { name: 'Hands enchants' })).toBeFocused()
    await expect.poll(async () => (await sheet.boundingBox())!.height).toBeGreaterThanOrEqual(844 * 0.9)
    const close = sheet.getByRole('button', { name: 'Close' })
    const size = await close.evaluate((el: HTMLElement) => [el.offsetWidth, el.offsetHeight])
    expect(Math.min(...size)).toBeGreaterThanOrEqual(44)

    await close.tap()
    await expect(sheet).toBeHidden()
    await expect(chip).toBeFocused()

    await chip.tap()
    await sheet.getByRole('option', { name: /^Superior Strength/ }).tap()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: /^Hands enchant: Superior Strength/ })).toBeVisible()
  })
})

test('the gear flags’ popovers are named', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Classic stats' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Classic stats' })).toContainText('uses its Classic Era stats')
})
