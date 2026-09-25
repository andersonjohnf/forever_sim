import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#accessibility: Ctrl+Enter, or ⌘+Enter, runs Simulate from anywhere, a text or number
// field included, at every width. A field commits what you typed first, and keeps focus. It stands
// aside while a sheet or dialog with its own form is open (src/app/shortcuts.ts).

/** The visible Simulate button: the results pane's on a desktop, the bottom bar's on a phone. */
const simulate = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test.describe(`at ${width} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('./')
    })

    test('⌘+Enter runs Simulate from the page', async ({ page }) => {
      await page.getByRole('tab', { name: 'Talents', exact: true }).click()
      await expect(simulate(page, 'Simulate')).toBeVisible()
      await page.keyboard.press('Meta+Enter')
      await expect(simulate(page, 'Run again')).toBeVisible({ timeout: 30_000 })
      // It didn't also open anything: focus stays on the tab.
      await expect(page.getByRole('tab', { name: 'Talents', exact: true })).toBeFocused()
    })

    test('Ctrl+Enter in a number field runs Simulate with what was typed, and keeps focus there', async ({ page }) => {
      await page.getByRole('tab', { name: 'Fight', exact: true }).click()
      // The boss's level is under Advanced.
      await page.getByRole('tabpanel', { name: 'Fight' }).getByRole('button', { name: 'Advanced' }).click()
      const level = page.getByRole('textbox', { name: 'Boss level' })
      await level.fill('61')
      await expect(level).toBeFocused()
      await page.keyboard.press('Control+Enter')
      await expect(simulate(page, 'Run again')).toBeVisible({ timeout: 30_000 })
      await expect(level).toBeFocused()
      await expect(level).toHaveValue('61')
      // Leaving the field changes nothing more: the run already had 61, so its result isn't stale.
      await page.keyboard.press('Tab')
      await expect(simulate(page, 'Run again')).toBeVisible()
    })

    test('Ctrl+Enter in a dialog with its own form is the form’s, not Simulate’s', async ({ page }) => {
      await page.getByRole('tab', { name: 'Talents', exact: true }).click()
      await page.getByRole('button', { name: /Paste/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Paste a build code' })
      await expect(dialog.getByRole('textbox')).toBeFocused()
      await page.keyboard.press('Control+Enter')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      // No run started: a run would show Cancel, or Run again once done, never Simulate.
      await expect(simulate(page, 'Simulate')).toBeVisible()
    })
  })
}
