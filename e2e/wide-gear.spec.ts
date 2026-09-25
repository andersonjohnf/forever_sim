import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Gear", the wide layout (D34): from 1440 px the slots are one compact list, and the
// item picker opens inline in a sticky panel beside it rather than in a dialog. Picking an item
// keeps the panel on the slot; Back to list or Escape returns focus to the slot's row. Up and Down
// move between slots, Enter opens one, and `/` in the panel focuses its search. The slots stay one
// column. Under 1440 px the dialog is as it was (the other gear specs, at 1280).

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

  test('the panel is 24 rem, 30 rem from about 1,700 px and 40% of the pane from 1,920 px; the slots stay one column', async ({ page }) => {
    // Review findings DB-4, DL-2 and DB-6: the pane is 61.7 rem at 1600 px, 65.8 at 1700, 75 at 1920
    // and 101.7 at 2560.
    const panelRem = async () => (await panel(page).boundingBox())!.width / 16
    await openGear(page, 1600)
    await page.getByRole('button', { name: /^Head: / }).click()
    expect(await panelRem()).toBeCloseTo(24, 1)
    for (const [width, rem] of [
      [1700, 30],
      [1920, 30],
      [2560, 0.4 * 101.67],
    ]) {
      await page.setViewportSize({ width, height: 1200 })
      await expect.poll(panelRem, { message: `at ${width} px` }).toBeCloseTo(rem, 1)
      // Armor, then Jewelry and Weapons under it, in one column.
      const head = (await page.getByRole('button', { name: /^Head: / }).boundingBox())!
      const neck = (await page.getByRole('button', { name: /^Neck: / }).boundingBox())!
      expect(neck.y).toBeGreaterThan(head.y)
      expect(neck.x).toBe(head.x)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })

  test('with a scrollbar’s room taken, the panel is still 30 rem at 1,700 px', async ({ page }) => {
    await openGear(page, 1700)
    // Headless Chromium hides scrollbars; a wider gutter takes the same 17 px from the setup pane.
    await page.addStyleTag({ content: 'main { padding-right: 41px !important }' })
    await page.getByRole('button', { name: /^Head: / }).click()
    expect((await panel(page).boundingBox())!.width).toBeCloseTo(30 * 16, 0)
  })

  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
  ]) {
    test(`scrolled to the page's end at ${width}×${height}, the panel's head stays under the tabs`, async ({ page }) => {
      // Review finding DB-1: the footer under the list pushed a window-tall panel up under the tabs.
      await openGear(page, width, height)
      // The last slots are the ones you choose down there.
      await page.getByRole('button', { name: /^Ranged: / }).click({ position: { x: 24, y: 24 } })
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await expect.poll(() => page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1)).toBe(true)
      const stickyTop = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')))
      const back = panel(page).getByRole('button', { name: 'Back to list' })
      await expect.poll(async () => (await back.boundingBox())!.y).toBeGreaterThanOrEqual(stickyTop)
      expect((await panel(page).getByRole('heading', { name: 'Choose ranged' }).boundingBox())!.y).toBeGreaterThan(stickyTop)
      // Its bottom stops at the list's end, above the footer, and its items still scroll inside it.
      const box = (await panel(page).boundingBox())!
      const footer = (await page.getByText('Game data from').boundingBox())!
      expect(box.y + box.height).toBeLessThan(footer.y)
      await expect(panel(page).getByRole('list', { name: 'Items' })).toBeVisible()
    })
  }

  test('an enchant chip shows the whole name, with the effect under it', async ({ page }) => {
    // Review finding DB-2: "Lesser Arcanum of…" could have been any of the three Voracity arcanums.
    await openGear(page, 1440)
    const chip = page.getByRole('button', { name: /, Head enchant$/ })
    await expect(chip).toContainText('Lesser Arcanum of Voracity (Strength)')
    await expect(chip).toContainText('+8 Strength')
    // Nothing is cut short, on any chip; the whole text is its title too.
    const cut = await page.getByRole('button', { name: / enchant$/ }).evaluateAll((els) =>
      els.flatMap((el) => [...el.querySelectorAll('span span span')].filter((s) => s.scrollHeight > s.clientHeight + 1).map((s) => s.textContent)),
    )
    expect(cut.filter((text) => !text?.startsWith('Chance on hit'))).toEqual([])
    await expect(chip.locator('[title]')).toHaveAttribute('title', 'Lesser Arcanum of Voracity (Strength) · +8 Strength')
    const box = (await chip.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
  })

  test('the Best in slot filter lists the equipped item, first, marked Equipped', async ({ page }) => {
    // Review finding DB-8: a tank's threat set holds items no guide ranks, which the filter hid.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: Fury Warrior/ }).click()
    await page.getByRole('group', { name: 'Paladin' }).getByRole('menuitem', { name: /Protection/ }).click()
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    const chest = page.getByRole('button', { name: /^Chest: / })
    const worn = (await chest.getAttribute('aria-label'))!.replace('Chest: ', '')
    await chest.click({ position: { x: 24, y: 24 } })
    const picker = panel(page)
    await expect(picker.getByRole('radio', { name: 'Best in slot' })).toBeChecked()
    const items = picker.getByRole('list', { name: 'Items' }).getByRole('listitem')
    // After "Leave this slot empty".
    const escaped = worn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await expect(items.nth(1).getByRole('button').first()).toHaveAccessibleName(new RegExp(`^${escaped}\\..*Equipped$`))
    await expect(items.nth(1)).toContainText('Equipped')
    // A search that doesn't match it leaves it out.
    await picker.getByRole('textbox', { name: 'Search items' }).fill('zzzz')
    await expect(picker.getByText('No items match')).toBeVisible()
  })

  test('crossing 1440 px either way keeps focus on the slot', async ({ page }) => {
    // Review finding DL-1: the two layouts are different element trees, and focus fell to the page.
    await openGear(page, 1440)
    const legs = page.getByRole('button', { name: /^Legs: / })
    // From an enchant chip, to the narrow layout.
    await page.getByRole('button', { name: /, Legs enchant$/ }).focus()
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByRole('complementary', { name: 'Item picker' })).toHaveCount(0)
    await expect(legs).toBeFocused()
    // From a slot's button, back to the wide one.
    const feet = page.getByRole('button', { name: /^Feet: / })
    await feet.focus()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole('complementary', { name: 'Item picker' })).toBeVisible()
    await expect(feet).toBeFocused()
    // From the panel's search.
    await page.getByRole('button', { name: /^Hands: / }).press('Enter')
    await panel(page).getByRole('textbox', { name: 'Search items' }).focus()
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByRole('button', { name: /^Hands: / })).toBeFocused()
    // From the dialog, as the window widens.
    await page.getByRole('button', { name: /^Wrists: / }).press('Enter')
    await expect(page.getByRole('dialog', { name: 'Choose wrists' })).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Wrists: / })).toBeFocused()
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
