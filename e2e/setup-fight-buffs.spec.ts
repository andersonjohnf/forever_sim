import { expect, test } from './fixtures.ts'

// The Fight and Buffs tabs (docs/ux.md "Fight", "Buffs"): named controls, a spoken fight length,
// copy that follows the setup, and preset descriptions in view.

test('the Fight tab’s controls have names, and its copy follows the setup', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Fight', exact: true }).click()
  await expect(page.getByText('A level 63 raid boss, and how the fight plays out.')).toBeVisible()

  const length = page.getByRole('slider', { name: 'Fight length' })
  await expect(length).toHaveAttribute('aria-valuetext', '3 minutes')
  const box = (await length.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  await length.focus()
  await page.keyboard.press('ArrowRight')
  await expect(length).toHaveAttribute('aria-valuetext', '3 minutes 15 seconds')
  await expect(page.getByText('3:15')).toBeVisible()

  // Execute phase: a warrior's help names Execute, and the whole row toggles the switch.
  const execute = page.getByRole('switch', { name: 'Execute phase' })
  await expect(execute).toHaveAccessibleDescription('The last 20% of the boss’s health, when Execute can be used.')
  await expect(page.getByText(/Hammer of Wrath/)).toHaveCount(0)
  await page.getByText('The last 20% of the boss’s health').click()
  await expect(execute).not.toBeChecked()

  await page.getByRole('button', { name: 'Advanced' }).click()
  for (const name of ['Creature type', 'Zone']) {
    const select = page.getByRole('combobox', { name })
    await expect(select).toBeVisible()
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  // Steppers say what they change, and the header follows Boss level.
  await page.getByRole('button', { name: 'Decrease Boss level' }).click()
  await expect(page.getByRole('textbox', { name: 'Boss level' })).toHaveValue('62')
  await expect(page.getByText('A level 62 boss, and how the fight plays out.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Increase Random seed' })).toBeVisible()
})

test('Buffs presets say what they bring in view, not in a hover title', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const presets = page.getByRole('radiogroup', { name: 'Preset' })
  const raid = presets.getByRole('radio', { name: 'Standard raid' })
  await expect(raid).toHaveAttribute('aria-checked', 'true')
  await expect(raid).toHaveAccessibleDescription('Raid buffs and common consumables.')
  await expect(raid).not.toHaveAttribute('title')
  for (const text of ['Your own buffs, no group.', 'A five-player group and basic consumables.', 'Raid buffs and every consumable that helps.']) {
    await expect(presets.getByText(text)).toBeVisible()
  }
})

test('Classic Era rules show Classic Era’s buff and enchant numbers', async ({ page }) => {
  await page.goto('./')
  // Forever: the warrior's own Battle Shout is +115 (rank 6, the trainer's: D36), and the gloves' Greater Strength +10.
  await expect(page.getByRole('button', { name: /^Greater Strength · .*, Hands enchant$/ })).toContainText('Greater Strength · +10 Strength')
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const shout = page.locator('label').filter({ has: page.getByRole('switch', { name: 'Battle Shout' }) })
  await expect(shout).toContainText('+115 attack power')

  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByRole('radiogroup', { name: 'Rules' }).getByRole('radio', { name: 'Classic Era' }).click()

  // Classic Era: Battle Shout rank 6, the trainer's (D36), is +193 (buffs doc, Classic Era values), as the fight uses it.
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  await expect(shout).toContainText('+193 attack power')
  await expect(shout).not.toContainText('+139')
  await expect(page.locator('label').filter({ has: page.getByRole('switch', { name: 'Blessing of Might' }) })).toContainText('+155 attack power')
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Greater Strength · .*, Hands enchant$/ })).toContainText('Greater Strength · +7 Strength')
})
