import { expect, test } from './fixtures.ts'

// docs/ux.md "Motion": with prefers-reduced-motion, dialogs, sheets, popovers, menus and selects
// only fade (src/index.css): no zoom or slide, and a close still ends, so nothing is left open.

test.describe('reduced motion, desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })

  test('the item picker opens without a zoom and closes with Escape', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await page.getByRole('button', { name: /^Head: / }).click()
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await expect(picker).toBeVisible()
    const scale = await picker.evaluate((el) => getComputedStyle(el).getPropertyValue('--tw-enter-scale').trim())
    expect(scale === '' || scale === '1').toBe(true)
    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()
  })

  test('the spec menu opens and closes', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const translate = await menu.evaluate((el) => getComputedStyle(el).getPropertyValue('--tw-enter-translate-y').trim())
    expect(translate === '' || translate === '0').toBe(true)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })
})

test.describe('reduced motion, phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' })

  test('the item picker sheet opens and closes', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await page.getByRole('button', { name: /^Head: / }).click({ position: { x: 24, y: 24 } })
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await expect(picker).toBeVisible()
    // The drawer doesn't slide: its open animation lasts 1 ms (review QC-1).
    const duration = await page.locator('[data-vaul-drawer]').evaluate((el) => getComputedStyle(el).animationDuration)
    expect(duration).toBe('0.001s')
    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()
  })
})
