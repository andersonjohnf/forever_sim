import { expect, test } from './fixtures.ts'

test.describe('setup', () => {
  test('opens on a ready-to-run Fury warrior in pre-raid best in slot', async ({ page }) => {
    await page.goto('./')
    await expect(page).toHaveTitle('Forever Sim')
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Gear', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Head: Lionheart Helm' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Results' }).getByRole('button', { name: 'Simulate' })).toBeVisible()
  })

  test('switching to a tank spec headlines TPS', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Protection/ }).first().click()
    await expect(page.getByRole('button', { name: /Spec: Protection Warrior/ })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Results' }).getByText('TPS', { exact: true })).toBeVisible()
  })

  test('remembers the setup across reloads', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Orc/ }).click()
    await page.reload()
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await expect(page.getByRole('radio', { name: /Orc/ })).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('gear', () => {
  test('picks an item by searching', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Head: Lionheart Helm' }).click()
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await picker.getByRole('searchbox').or(picker.getByLabel('Search items')).fill('crown of caer darrow')
    await picker.getByRole('button', { name: /Crown of Caer Darrow/ }).click()
    await expect(picker).toBeHidden()
    await expect(page.getByRole('button', { name: 'Head: Crown of Caer Darrow' })).toBeVisible()
  })

  test('a two-handed weapon frees the off hand', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Main hand:/ }).click()
    const picker = page.getByRole('dialog', { name: 'Choose main hand' })
    await picker.getByLabel('Search items').fill('blackblade of shahram')
    await picker.getByRole('button', { name: /Blackblade of Shahram/ }).click()
    await expect(page.getByRole('button', { name: 'Off hand: two-handed weapon equipped' })).toBeDisabled()
  })
})

test.describe('talents', () => {
  test('pastes a build code, and rejects a broken one', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await expect(page.getByText('17 / 34 / 0')).toBeVisible()

    await page.getByRole('button', { name: /Paste/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Paste a build code' })
    await dialog.getByRole('textbox').fill('99999')
    await dialog.getByRole('button', { name: 'Use this build' }).click()
    await expect(dialog.getByText(/exceeds max rank|bad rank|not a valid/i)).toBeVisible()

    await dialog.getByRole('textbox').fill('30305213132515201-05050103-')
    await dialog.getByRole('button', { name: 'Use this build' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('37 / 14 / 0')).toBeVisible()
  })

  test('adds a point with a click and removes it with a right-click', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await page.getByRole('button', { name: 'Clear' }).click()
    const talent = page.getByRole('button', { name: /^Cruelty, 0 of 5/ })
    await talent.click()
    await expect(page.getByRole('button', { name: /^Cruelty, 1 of 5/ })).toBeVisible()
    await page.getByRole('button', { name: /^Cruelty, 1 of 5/ }).click({ button: 'right' })
    await expect(page.getByRole('button', { name: /^Cruelty, 0 of 5/ })).toBeVisible()
  })
})

test.describe('sharing', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('a share link restores the setup, with undo', async ({ page, context }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Night Elf/ }).click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/forever_sim/#s=')

    const other = await context.newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await other.getByRole('tab', { name: 'Character', exact: true }).click()
    await expect(other.getByRole('radio', { name: /Night Elf/ })).toHaveAttribute('aria-checked', 'true')
    expect(new URL(other.url()).hash).toBe('')
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('keeps Simulate in a bottom bar and opens pickers as a drawer', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('complementary', { name: 'Results' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeVisible()
    await page.getByRole('button', { name: 'Head: Lionheart Helm' }).click()
    await expect(page.getByRole('dialog', { name: 'Choose head' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('follows the OS colour scheme', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  })
})
