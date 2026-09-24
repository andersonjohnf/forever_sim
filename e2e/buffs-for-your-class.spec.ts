import { expect, test } from './fixtures.ts'

// docs/ux.md "Buffs": only what does something for your class is listed. Mana and spell damage are
// the paladin's (buffs doc "Class-only entries"), so a warrior never sees them.

const PALADIN_ONLY = [
  'Prayer of Spirit',
  'Arcane Brilliance',
  'Blessing of Wisdom',
  'Mana Spring Totem',
  'Greater Arcane Elixir',
  'Elixir of Holy Power',
  'Flask of Supreme Power',
  'Major Mana Potion',
  'Demonic Rune',
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

// docs/ux.md "Buffs": a debuff on the boss's swings changes only a tank's results, and the two
// attack-power debuffs, one at a time, name each other (BU1).
test('the Boss damage debuffs say they change nothing for a DPS spec, and the roar and the Shout name each other', async ({ page }) => {
  await page.goto('./')
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const note = 'Only the tank takes the boss’s swings, so it changes nothing for you.'
  await expect(buffs.getByRole('switch', { name: 'Demoralizing Roar' })).toHaveAccessibleDescription(`−204 boss attack power (instead of Demoralizing Shout). ${note}`)
  await expect(buffs.getByRole('switch', { name: 'Demoralizing Shout' })).toHaveAccessibleDescription(`−204 boss attack power (instead of Demoralizing Roar). ${note}`)
  await expect(buffs.getByRole('switch', { name: 'Thunder Clap' })).toHaveAccessibleDescription(`Boss attacks 20% slower. ${note}`)
})
