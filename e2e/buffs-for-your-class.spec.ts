import { expect, test } from './fixtures.ts'

// docs/ux.md "Buffs": only what does something for your class is listed. Mana and spell damage are
// the paladin's (buffs doc "Class-only entries"), so a warrior never sees them.

const PALADIN_ONLY = [
  'Blessing of Wisdom',
  'Mana Spring Totem',
  'Greater Arcane Elixir',
  'Elixir of Holy Power',
  'Flask of Supreme Power',
  'Major Mana Potion',
  'Demonic Rune / Dark Rune',
]

test('a warrior’s Buffs tab lists no mana or spell damage entries, in any preset', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Blessing of Might' })).toBeVisible()
  for (const preset of ['Standard raid (default)', 'Max consumables']) {
    await page.getByRole('radio', { name: preset }).click()
    await expect(page.getByRole('switch', { name: 'Elixir of the Mongoose' })).toBeChecked()
    for (const name of PALADIN_ONLY) await expect(page.getByRole('switch', { name })).toHaveCount(0)
  }
})
