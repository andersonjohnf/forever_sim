import { expect, test } from './fixtures.ts'

// The Talents tab (docs/ux.md "Talents"): keyboard removal and plain paste errors.

test('a focused talent takes a point with Enter and gives it back with Backspace', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Talents', exact: true }).click()
  await expect(page.getByText('On a focused talent, Enter adds a point and Backspace removes one.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear' }).click()
  const cruelty = page.getByRole('button', { name: /^Cruelty, / })
  await expect(cruelty).toHaveAccessibleName('Cruelty, 0 of 5')
  await expect(cruelty).toHaveAttribute('aria-keyshortcuts', 'Backspace')
  await cruelty.focus()
  // The tooltip opens on focus and names the keys too.
  await expect(page.getByRole('tooltip')).toContainText('Right-click or Backspace removes one.')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(cruelty).toHaveAccessibleName('Cruelty, 2 of 5')
  await page.keyboard.press('Backspace')
  await expect(cruelty).toHaveAccessibleName('Cruelty, 1 of 5')
  await page.keyboard.press('-')
  await expect(cruelty).toHaveAccessibleName('Cruelty, 0 of 5')
  await expect(page.getByText('0 / 0 / 0')).toBeVisible()
})

test('a bad build code gets a plain reason', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Talents', exact: true }).click()
  await page.getByRole('button', { name: /Paste/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Paste a build code' })
  const input = dialog.getByRole('textbox', { name: 'Build code or link' })
  const error = dialog.getByRole('alert')

  await input.fill('hello')
  await dialog.getByRole('button', { name: 'Use this build' }).click()
  await expect(error).toHaveText(/^That isn’t a talent code\. A code has a digit for each talent and a dash between trees, like \d[\d-]+$/)
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveAccessibleDescription(/^That isn’t a talent code/)

  // Typing clears the error; another class's code says so in words.
  await input.fill('99999')
  await expect(error).toHaveCount(0)
  await input.press('Enter')
  await expect(error).toHaveText(
    'That isn’t a Warrior code: it puts 9 points in Improved Heroic Strike, which has 3 ranks. Is it for another class?',
  )
})
