import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Gear", the wide layout (D34): from 1440 px the slots are one compact list, and the
// item picker opens inline in a sticky panel beside it rather than in a dialog. Picking an item
// keeps the panel on the slot; Back to list or Escape returns focus to the slot's row. Up and Down
// move between slots, Enter opens one, and `/` in the panel focuses its search. From 84 rem of setup
// pane the slots take two columns. Under 1440 px the dialog is as it was (the other gear specs, at 1280).

async function openGear(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height })
  await page.goto('./')
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
}

const panel = (page: Page) => page.getByRole('complementary', { name: /^Choose / })

test.describe('the wide Gear tab', () => {
  test('choosing a slot opens its picker inline, and a pick keeps the panel on the slot', async ({ page }) => {
    await openGear(page, 1440)
    // Until a slot is chosen, the panel says to choose one.
    await expect(page.getByRole('complementary', { name: 'Item picker' })).toContainText('Choose a slot to see the items you can equip there.')

    const chest = page.getByRole('button', { name: 'Chest: Savage Gladiator Chain' })
    // On its icon: its flags explain themselves instead.
    await chest.click({ position: { x: 24, y: 24 } })
    // No dialog: the picker is beside the list, its heading focused, the slot marked as chosen.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const picker = panel(page)
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('heading', { name: 'Choose chest' })).toBeFocused()
    await expect(picker).toContainText('Items a warrior can equip here.')
    await expect(chest).toHaveAttribute('aria-current', 'true')
    // The dialog's body: search, filters, sort and the item rows.
    await expect(picker.getByRole('textbox', { name: 'Search items' })).toBeVisible()
    await expect(picker.getByRole('radio', { name: 'Best in slot' })).toBeVisible()
    await expect(picker.getByRole('combobox', { name: /^Sort by/ })).toBeVisible()
    await expect(picker.getByText('3 items')).toBeVisible()

    // The panel sits beside the list.
    const list = await page.getByRole('list').filter({ has: chest }).boundingBox()
    expect((await picker.boundingBox())!.x).toBeGreaterThan(list!.x + list!.width)

    // Picking equips the item, and the panel stays on the chest to compare.
    await picker.getByRole('button', { name: /^Knight-Captain's Plate Hauberk\./ }).click()
    await expect(page.getByRole('button', { name: "Chest: Knight-Captain's Plate Hauberk" })).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(picker.getByRole('heading', { name: 'Choose chest' })).toBeVisible()
    await expect(picker.getByRole('button', { name: /^Knight-Captain's Plate Hauberk\..*Equipped$/ })).toHaveAttribute('aria-current', 'true')
    // The default set's line notices the change.
    await expect(page.locator('#gear-default-status')).toContainText('1 slot differs from pre-raid best in slot: Chest.')

    // Leaving the slot empty takes its row away, so focus moves to the panel's heading.
    await picker.getByRole('button', { name: 'Leave this slot empty' }).click()
    await expect(page.getByRole('button', { name: 'Chest: empty' })).toBeVisible()
    await expect(picker.getByRole('heading', { name: 'Choose chest' })).toBeFocused()
  })

  test('Back to list and Escape return focus to the slot; / focuses the search', async ({ page }) => {
    await openGear(page, 1440)
    const head = page.getByRole('button', { name: 'Head: Lionheart Helm' })
    await head.click()
    const picker = panel(page)
    await picker.getByRole('button', { name: 'Back to list' }).click()
    await expect(head).toBeFocused()
    // The panel stays on the slot meanwhile.
    await expect(picker.getByRole('heading', { name: 'Choose head' })).toBeVisible()

    await head.press('Enter')
    await expect(picker.getByRole('heading', { name: 'Choose head' })).toBeFocused()
    await page.keyboard.press('/')
    const search = picker.getByRole('textbox', { name: 'Search items' })
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('')
    // In the search box, / is a character, and Escape goes back to the slot.
    await page.keyboard.type('helm/')
    await expect(search).toHaveValue('helm/')
    await page.keyboard.press('Escape')
    await expect(head).toBeFocused()

    // Escape from a select's list closes the list and stays in the panel.
    await head.press('Enter')
    await picker.getByRole('combobox', { name: /^Sort by/ }).click()
    await expect(page.getByRole('option', { name: 'Name' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('option', { name: 'Name' })).toHaveCount(0)
    await expect(picker.getByRole('combobox', { name: /^Sort by/ })).toBeFocused()
  })

  test('Up and Down move between slots, across the groups, and Enter opens one', async ({ page }) => {
    await openGear(page, 1440)
    const feet = page.getByRole('button', { name: /^Feet: / })
    await feet.focus()
    await page.keyboard.press('ArrowDown')
    // Feet ends Armor; Neck starts Jewelry.
    await expect(page.getByRole('button', { name: /^Neck: / })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('button', { name: /^Legs: / })).toBeFocused()
    // From the enchant chip too.
    await page.getByRole('button', { name: /, Legs enchant$/ }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(feet).toBeFocused()
    // The first slot stays put going up.
    await page.getByRole('button', { name: /^Head: / }).focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('button', { name: /^Head: / })).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(panel(page).getByRole('heading', { name: 'Choose head' })).toBeFocused()
  })

  test('Up and Down skip an off hand a two-hander locks', async ({ page }) => {
    await openGear(page, 1440)
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await expect(page.getByRole('button', { name: 'Off hand: two-handed weapon equipped' })).toBeDisabled()
    await page.getByRole('button', { name: /^Main hand: / }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('button', { name: /^Ranged: / })).toBeFocused()
  })

  test('the enchant picker is still a popover, and the options menu and default set work', async ({ page }) => {
    await openGear(page, 1440)
    await page.getByRole('button', { name: 'Hands: Devilsaur Gauntlets' }).click()
    await page.getByRole('button', { name: /, Hands enchant$/ }).click()
    const enchants = page.getByRole('dialog', { name: 'Hands enchant' })
    await expect(enchants.getByRole('listbox', { name: 'Hands enchants' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(enchants).toHaveCount(0)
    await expect(page.getByRole('button', { name: /, Hands enchant$/ })).toBeFocused()
    // The item panel stayed on the hands meanwhile.
    await expect(panel(page).getByRole('heading', { name: 'Choose hands' })).toBeVisible()

    await page.getByRole('button', { name: 'Gear options' }).click()
    await page.getByRole('menuitem', { name: 'Remove all gear' }).click()
    await expect(page.getByRole('button', { name: 'Head: empty' })).toBeVisible()
    // The panel's slot is empty now: no "Leave this slot empty", and the full list of hands.
    await expect(panel(page).getByRole('button', { name: 'Leave this slot empty' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Equip pre-raid best in slot' }).click()
    await expect(page.getByRole('button', { name: 'Head: Lionheart Helm' })).toBeVisible()
    await expect(page.locator('#gear-default-status')).toBeFocused()
  })

  test('rows are at least 56 px, their targets 44 px, and nothing scrolls sideways', async ({ page }) => {
    await openGear(page, 1440)
    await page.getByRole('button', { name: /^Head: / }).click()
    const sizes = await page.locator('[data-gear-slot]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
    expect(sizes).toHaveLength(17)
    for (const box of sizes) {
      expect(box.height).toBeGreaterThanOrEqual(56)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    const chips = await page.getByRole('button', { name: /enchant/i }).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
    for (const height of chips) expect(height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })

  test('the panel stays in view as the list scrolls', async ({ page }) => {
    await openGear(page, 1440, 800)
    await page.getByRole('button', { name: /^Head: / }).click()
    const before = (await panel(page).boundingBox())!
    await page.mouse.wheel(0, 500)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400)
    // It stops 1rem under the sticky tabs, and reaches down to 1rem above the window's bottom.
    const stickyTop = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')))
    const box = (await panel(page).boundingBox())!
    expect(box.y).toBeLessThan(before.y)
    expect(box.y).toBeCloseTo(stickyTop + 16, 0)
    expect(box.y + box.height).toBeCloseTo(800 - 16, 0)
  })

  test('narrowing the window past 1440 px doesn’t pop the dialog up', async ({ page }) => {
    await openGear(page, 1440)
    await page.getByRole('button', { name: /^Head: / }).click()
    await expect(panel(page)).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByRole('button', { name: /^Head: / })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // And under 1440 px a slot opens the dialog, as ever.
    await page.getByRole('button', { name: /^Head: / }).click()
    await expect(page.getByRole('dialog', { name: 'Choose head' })).toBeVisible()
  })

  test('at 1920 px the panel widens; at 2560 px the slots take two columns', async ({ page }) => {
    await openGear(page, 1920)
    await page.getByRole('button', { name: /^Head: / }).click()
    expect((await panel(page).boundingBox())!.width).toBeCloseTo(30 * 16, 0)
    const head = (await page.getByRole('button', { name: /^Head: / }).boundingBox())!
    const neck = (await page.getByRole('button', { name: /^Neck: / }).boundingBox())!
    expect(neck.y).toBeGreaterThan(head.y)
    expect(neck.x).toBe(head.x)

    await page.setViewportSize({ width: 2560, height: 1200 })
    // Armor on the left; Jewelry and Weapons beside it, from the top.
    const head2 = (await page.getByRole('button', { name: /^Head: / }).boundingBox())!
    const neck2 = (await page.getByRole('button', { name: /^Neck: / }).boundingBox())!
    expect(neck2.x).toBeGreaterThan(head2.x + head2.width)
    expect(neck2.y).toBeCloseTo(head2.y, 0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})

test('at 1440 px the picker is inline where a 17 px scrollbar takes room too', async ({ page }) => {
  await openGear(page, 1440)
  // Headless Chromium hides scrollbars; a wider gutter takes the same 17 px from the setup pane.
  await page.addStyleTag({ content: 'main { padding-right: 41px !important }' })
  const setup = await page.evaluate(() => document.querySelector('main')!.firstElementChild!.getBoundingClientRect().width)
  expect(setup).toBeLessThan(54 * 16)
  await expect(page.getByRole('complementary', { name: 'Item picker' })).toBeVisible()
  await page.getByRole('button', { name: /^Head: / }).click()
  await expect(panel(page)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('at 1439 px a slot still opens the dialog', async ({ page }) => {
  await openGear(page, 1439)
  await page.getByRole('button', { name: /^Head: / }).click()
  await expect(page.getByRole('dialog', { name: 'Choose head' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Item picker' })).toHaveCount(0)
})
