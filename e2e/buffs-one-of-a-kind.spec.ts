import { expect, test } from './fixtures.ts'

// docs/ux.md "Buffs": entries of which only one can be on turn each other off, and their summaries
// say so. A weapon takes one stone or oil (issue #13; buffs doc "Exclusivity groups").

test('a warrior’s stones: one at a time, the other switched off', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  await buffs.getByRole('radio', { name: 'Max consumables' }).click()

  const dense = buffs.getByRole('switch', { name: 'Dense Sharpening Stone / Weightstone' })
  const elemental = buffs.getByRole('switch', { name: 'Elemental Sharpening Stone' })
  await expect(elemental).toBeChecked()
  await expect(dense).not.toBeChecked()
  await expect(dense).toHaveAccessibleDescription('+8 weapon damage on each weapon (one stone or oil per weapon)')
  await dense.click()
  await expect(dense).toBeChecked()
  await expect(elemental).not.toBeChecked()
  await expect(page.getByText('Custom selection.')).toBeVisible()
})

test('a mage’s oils: one at a time', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: /^Fire/ }).click()
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  await buffs.getByRole('radio', { name: 'Max consumables' }).click()

  const wizard = buffs.getByRole('switch', { name: 'Wizard Oil', exact: true })
  const brilliant = buffs.getByRole('switch', { name: 'Brilliant Wizard Oil' })
  await expect(brilliant).toBeChecked()
  await expect(wizard).not.toBeChecked()
  await wizard.click()
  await expect(wizard).toBeChecked()
  await expect(brilliant).not.toBeChecked()
  await brilliant.click()
  await expect(brilliant).toBeChecked()
  await expect(wizard).not.toBeChecked()
})
