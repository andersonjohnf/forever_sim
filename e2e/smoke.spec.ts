import { expect, test } from './fixtures.ts'

test('landing page renders under the Pages base path', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Forever Sim')
  await expect(page.getByRole('heading', { name: 'Forever Sim' })).toBeVisible()
  for (const cls of ['Warrior', 'Druid', 'Paladin']) {
    await expect(page.getByText(cls, { exact: true })).toBeVisible()
  }
})

test('lists every scraped dataset in the snapshot table', async ({ page }) => {
  await page.goto('./')
  for (const dataset of [
    'spells/warrior.json',
    'spells/druid.json',
    'spells/paladin.json',
    'talents/warrior.json',
    'talents/druid.json',
    'talents/paladin.json',
    'races/races.json',
    'items/pre-bis.json',
  ]) {
    await expect(page.getByRole('cell', { name: dataset })).toBeVisible()
  }
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('follows the OS colour scheme', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  })
})
