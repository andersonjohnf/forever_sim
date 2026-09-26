import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { linkFor } from './links.ts'

// The gear rules the picker and defaults follow (docs/data/items.md#equipping-rules,
// docs/ux.md#sections "Gear"): Unique and Unique-Equipped, each faction's own PvP gear, and each
// class's own quest rewards.

/**
 * Clicks a slot or picker row's button on the item's icon. The row's flag badges sit above the
 * button and explain themselves when tapped, and the middle of a row can be one of them.
 */
const onIcon = { position: { x: 24, y: 24 } }

async function pick(page: Page, slotButton: RegExp | string, dialogName: string, search: string, item: RegExp) {
  await page.getByRole('button', { name: slotButton }).click(onIcon)
  const picker = page.getByRole('dialog', { name: dialogName })
  await picker.getByLabel('Search items').fill(search)
  await picker.getByRole('button', { name: item }).click(onIcon)
  await expect(picker).toBeHidden()
}

test.describe('unique items', () => {
  test('the picker won’t pair two items of a Unique-Equipped group, and says why', async ({ page }) => {
    await page.goto('./')
    await pick(page, /^Trinket 2: /, 'Choose trinket 2', 'weakness analyzer', /Weakness Analyzer/)
    await expect(page.getByRole('button', { name: 'Trinket 2: Weakness Analyzer' })).toBeVisible()

    await page.getByRole('button', { name: /^Trinket 1: / }).click(onIcon)
    const picker = page.getByRole('dialog', { name: 'Choose trinket 1' })
    await picker.getByLabel('Search items').fill('adaptive combat')
    const blocked = picker.getByRole('button', { name: /Adaptive Combat Assistant/ })
    await expect(blocked).toHaveAttribute('aria-disabled', 'true')
    await expect(blocked).toContainText('Unique-Equipped (Undermine Trinkets): you’re wearing Weakness Analyzer in trinket 2.')
    // The click lands on the item's button (it takes focus), which still doesn't pick it.
    await blocked.click({ ...onIcon, force: true })
    await expect(blocked).toBeFocused()
    await expect(picker).toBeVisible()

    // The same item isn't blocked: it moves over, as before.
    await picker.getByLabel('Search items').fill('weakness analyzer')
    const same = picker.getByRole('button', { name: /Weakness Analyzer/ })
    await expect(same).toContainText('Unique: moves from trinket 2')
    await same.click(onIcon)
    await expect(page.getByRole('button', { name: 'Trinket 1: Weakness Analyzer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Trinket 2: empty' })).toBeVisible()
  })

  test('a unique weapon moves between hands instead of being wielded twice', async ({ page }) => {
    await page.goto('./')
    await pick(page, /^Main hand: /, 'Choose main hand', 'annihilator', /Annihilator/)
    await page.getByRole('button', { name: /^Off hand: / }).click(onIcon)
    const picker = page.getByRole('dialog', { name: 'Choose off hand' })
    await picker.getByLabel('Search items').fill('annihilator')
    const annihilator = picker.getByRole('button', { name: /Annihilator/ })
    await expect(annihilator).toContainText('Unique: moves from main hand')
    await annihilator.click(onIcon)
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
    await page.getByRole('button', { name: /^Shoulders: / }).click(onIcon)
    const picker = page.getByRole('dialog', { name: 'Choose shoulders' })
    await picker.getByLabel('Search items').fill('plate shoulders')
    await expect(picker.getByRole('button', { name: /Lieutenant Commander's Plate Shoulders/ })).toBeVisible()
    await expect(picker.getByRole('button', { name: /Champion's Plate Shoulders/ })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Orc/ }).click()
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    // The race change moved the untouched set to the Orc's own, so it matches and nothing waits to be equipped.
    await expect(page.getByText('Wearing pre-raid best in slot.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Equip pre-raid best in slot' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Shoulders: Champion\'s Plate Shoulders' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Feet: Blood Guard\'s Plate Greaves' })).toBeVisible()
    await page.getByRole('button', { name: /^Feet: / }).click(onIcon)
    const feet = page.getByRole('dialog', { name: 'Choose feet' })
    await feet.getByLabel('Search items').fill('plate greaves')
    await expect(feet.getByRole('button', { name: /Blood Guard's Plate Greaves/ })).toBeVisible()
    await expect(feet.getByRole('button', { name: /Knight-Lieutenant's Plate Greaves/ })).toHaveCount(0)
  })

  // #12 said the picker offers the other faction's items. It doesn't (e7a9c882): this pins the filter
  // for a character wearing one of the other faction's items, which stays listed rather than vanishing.
  test('a worn item of the other faction stays in its slot and the picker; the rest of that faction’s aren’t offered', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      // A Human wearing the Horde's Champion's Plate Shoulders (23243); nothing follows the defaults.
      const config = { version: 1, spec: 'warrior-fury', race: 'alliance-human', gear: { shoulder: { itemId: 23243 } } }
      const state = { config, bySpec: {}, section: 'gear', following: { 'warrior-fury': { gear: [], talents: false } } }
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state, version: 1 }))
    })
    await page.goto('./')
    await expect(page.getByRole('button', { name: 'Shoulders: Champion\'s Plate Shoulders' })).toBeVisible()
    await page.getByRole('button', { name: /^Shoulders: / }).click(onIcon)
    const picker = page.getByRole('dialog', { name: 'Choose shoulders' })
    await picker.getByRole('radio', { name: 'All items' }).click()
    await expect(picker.getByRole('button', { name: /^Champion's Plate Shoulders\..*Equipped$/ })).toBeVisible()
    await expect(picker.getByRole('button', { name: /^Lieutenant Commander's Plate Shoulders/ })).toBeVisible()
    await page.keyboard.press('Escape')

    // Other slots offer the Alliance's own, and none of the Horde's.
    await page.getByRole('button', { name: /^Feet: / }).click(onIcon)
    const feet = page.getByRole('dialog', { name: 'Choose feet' })
    await feet.getByLabel('Search items').fill('plate greaves')
    await expect(feet.getByRole('button', { name: /Knight-Lieutenant's Plate Greaves/ })).toBeVisible()
    await expect(feet.getByRole('button', { name: /Blood Guard's Plate Greaves/ })).toHaveCount(0)
  })
})

test.describe('class-quest rewards', () => {
  // docs/data/items.md#class-quest-rewards: Dungeon Set 2 pieces come from quests only their set's
  // class can take, though the client lets any class that wears the armor type wear them.
  async function switchSpec(page: Page, menuItem: RegExp, button: RegExp) {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: menuItem }).click()
    await expect(page.getByRole('button', { name: button })).toBeVisible()
  }

  async function searchHeads(page: Page, search: string) {
    await page.getByRole('button', { name: /^Head: / }).click(onIcon)
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await picker.getByRole('radio', { name: 'All items' }).click()
    await picker.getByLabel('Search items').fill(search)
    return picker
  }

  test('the head picker offers Darkmantle Cap to a rogue, and not to a Feral druid', async ({ page }) => {
    await switchSpec(page, /Combat/, /^Spec: Combat Rogue/)
    let picker = await searchHeads(page, 'darkmantle')
    await expect(picker.getByRole('button', { name: /^Darkmantle Cap/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()

    await switchSpec(page, /Feral \(Bear\)/, /^Spec: Feral \(Bear\) Druid/)
    // The bear's default head isn't the rogue's cap any more.
    await expect(page.getByRole('button', { name: /^Head: / })).not.toHaveAccessibleName(/Darkmantle Cap/)
    // A leather helm the druid can wear is offered (Dungeon Set 1's, anyone's); the rogue's cap isn't.
    picker = await searchHeads(page, 'wildheart cowl')
    await expect(picker.getByRole('button', { name: /^Wildheart Cowl/ })).toBeVisible()
    await picker.getByLabel('Search items').fill('darkmantle')
    await expect(picker.getByRole('button', { name: /Darkmantle Cap/ })).toHaveCount(0)
  })

  test('a shared bear setup wearing Darkmantle Cap still loads, without it, and says why', async ({ page }) => {
    await page.goto('./')
    const hash = await linkFor(page, { version: 1, spec: 'druid-feral-bear', race: 'horde-tauren', gear: { head: { itemId: 22005 }, neck: { itemId: 19491 } } })
    await page.goto('about:blank')
    await page.goto(`./${hash}`)
    await expect(page.getByText('Loaded a shared setup')).toBeVisible()
    await expect(page.getByText('Darkmantle Cap comes from a quest only rogues can take, so it was removed.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Spec: Feral \(Bear\) Druid/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Head: empty' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Neck: Amulet of the Darkmoon' })).toBeVisible()
  })
})
