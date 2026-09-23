import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The gear rules the picker and defaults follow (docs/data/items.md#equipping-rules,
// docs/ux.md#sections "Gear"): Unique and Unique-Equipped, and each faction's own PvP gear.

async function pick(page: Page, slotButton: RegExp | string, dialogName: string, search: string, item: RegExp) {
  await page.getByRole('button', { name: slotButton }).click()
  const picker = page.getByRole('dialog', { name: dialogName })
  await picker.getByLabel('Search items').fill(search)
  await picker.getByRole('button', { name: item }).click()
  await expect(picker).toBeHidden()
}

test.describe('unique items', () => {
  test('the picker won’t pair two items of a Unique-Equipped group, and says why', async ({ page }) => {
    await page.goto('./')
    await pick(page, /^Trinket 2: /, 'Choose trinket 2', 'weakness analyzer', /Weakness Analyzer/)
    await expect(page.getByRole('button', { name: 'Trinket 2: Weakness Analyzer' })).toBeVisible()

    await page.getByRole('button', { name: /^Trinket 1: / }).click()
    const picker = page.getByRole('dialog', { name: 'Choose trinket 1' })
    await picker.getByLabel('Search items').fill('adaptive combat')
    const blocked = picker.getByRole('button', { name: /Adaptive Combat Assistant/ })
    await expect(blocked).toHaveAttribute('aria-disabled', 'true')
    await expect(blocked).toContainText('Unique-Equipped (Undermine Trinkets): you’re wearing Weakness Analyzer in trinket 2.')
    await blocked.click({ force: true })
    await expect(picker).toBeVisible()

    // The same item isn't blocked: it moves over, as before.
    await picker.getByLabel('Search items').fill('weakness analyzer')
    const same = picker.getByRole('button', { name: /Weakness Analyzer/ })
    await expect(same).toContainText('Unique: moves from trinket 2')
    await same.click()
    await expect(page.getByRole('button', { name: 'Trinket 1: Weakness Analyzer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Trinket 2: empty' })).toBeVisible()
  })

  test('a unique weapon moves between hands instead of being wielded twice', async ({ page }) => {
    await page.goto('./')
    await pick(page, /^Main hand: /, 'Choose main hand', 'annihilator', /Annihilator/)
    await page.getByRole('button', { name: /^Off hand: / }).click()
    const picker = page.getByRole('dialog', { name: 'Choose off hand' })
    await picker.getByLabel('Search items').fill('annihilator')
    const annihilator = picker.getByRole('button', { name: /Annihilator/ })
    await expect(annihilator).toContainText('Unique: moves from main hand')
    await annihilator.click()
    await expect(page.getByRole('button', { name: 'Off hand: Annihilator' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Main hand: empty' })).toBeVisible()
  })
})

test.describe('faction gear', () => {
  test('an Alliance character gets Alliance PvP gear and a Horde one Horde gear', async ({ page }) => {
    await page.goto('./')
    // Human by default: the Alliance twins, and the picker doesn't offer the Horde ones.
    await expect(page.getByRole('button', { name: 'Shoulders: Lieutenant Commander\'s Plate Shoulders' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Feet: Knight-Lieutenant\'s Plate Greaves' })).toBeVisible()
    await page.getByRole('button', { name: /^Shoulders: / }).click()
    const picker = page.getByRole('dialog', { name: 'Choose shoulders' })
    await picker.getByLabel('Search items').fill('plate shoulders')
    await expect(picker.getByRole('button', { name: /Lieutenant Commander's Plate Shoulders/ })).toBeVisible()
    await expect(picker.getByRole('button', { name: /Champion's Plate Shoulders/ })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Orc/ }).click()
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await page.getByRole('button', { name: 'Gear options' }).click()
    await page.getByRole('menuitem', { name: 'Equip pre-raid best in slot' }).click()
    await expect(page.getByRole('button', { name: 'Shoulders: Champion\'s Plate Shoulders' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Feet: Blood Guard\'s Plate Greaves' })).toBeVisible()
    await page.getByRole('button', { name: /^Feet: / }).click()
    const feet = page.getByRole('dialog', { name: 'Choose feet' })
    await feet.getByLabel('Search items').fill('plate greaves')
    await expect(feet.getByRole('button', { name: /Blood Guard's Plate Greaves/ })).toBeVisible()
    await expect(feet.getByRole('button', { name: /Knight-Lieutenant's Plate Greaves/ })).toHaveCount(0)
  })
})
