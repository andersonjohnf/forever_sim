import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Gear", the wide layout (D34, as amended): from 1440 px every slot shows at once, with
// no scrolling at 1440×900 and up, in a grid laid out like the character pane: Armor in two
// columns, Jewelry in a third, the Weapons in a row across the bottom. Each slot shows its icon, the
// item in its quality colour with its rank, the stats and its enchant, whole; the flags are icons.
// The item picker is the dialog, as at 1280 px, and Gear's actions are buttons rather than a menu.
// Under 1440 px nothing changes (the other gear specs, at 1280).

async function openGear(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height })
  await page.goto('./')
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
}

async function chooseSpec(page: Page, className: string, spec: RegExp) {
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: className }).getByRole('menuitem', { name: spec }).click()
}

/** Each slot's box: its list item, the button's cell. */
const slotBoxes = (page: Page) =>
  page.locator('[data-gear-slot]').evaluateAll((els) =>
    Object.fromEntries(els.map((el) => [(el as HTMLElement).dataset.gearSlot!, el.closest('li')!.getBoundingClientRect().toJSON() as DOMRect])),
  )

/** Every slot, Gear's heading and the default set's line are in the window, unscrolled. */
async function expectAllInView(page: Page, height: number) {
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.getByRole('heading', { name: 'Gear', level: 2 })).toBeInViewport()
  await expect(page.locator('#gear-default-status')).toBeInViewport()
  const boxes = Object.values(await slotBoxes(page))
  expect(boxes.length).toBeGreaterThanOrEqual(17)
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  expect(bottom, 'the last slot’s bottom').toBeLessThanOrEqual(height)
}

test.describe('the wide Gear tab', () => {
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ]) {
    test(`every slot shows without scrolling at ${width}×${height}`, async ({ page }) => {
      await openGear(page, width, height)
      await expect(page.locator('#gear-default-status')).toHaveText('Wearing pre-raid best in slot.')
      await expectAllInView(page, height)
      // With a slot changed, the line and its button still leave room for every slot.
      await page.getByRole('button', { name: /^Chest: / }).click({ position: { x: 20, y: 20 } })
      await page.getByRole('dialog', { name: 'Choose chest' }).getByRole('button', { name: /^Knight-Captain's Plate Hauberk\./ }).click()
      await expect(page.getByRole('button', { name: 'Equip pre-raid best in slot' })).toBeVisible()
      await expectAllInView(page, height)
    })
  }

  test('a tank’s longer intro and threat set still fit at 1440×900', async ({ page }) => {
    // The tightest default measured: the Feral (Bear) threat set, whose intro takes two lines.
    await openGear(page, 1440, 900)
    await chooseSpec(page, 'Druid', /Feral \(Bear\)/)
    await expect(page.locator('#gear-default-status')).toHaveText('Wearing the threat set.')
    await expectAllInView(page, 900)
  })

  test('Armor is two columns, Jewelry a third, and the Weapons a row across the bottom', async ({ page }) => {
    await openGear(page, 1440)
    const box = await slotBoxes(page)
    // Armor's left side, then its right, as the character pane has them.
    expect(box.shoulder.x).toBe(box.head.x)
    expect(box.shoulder.y).toBeGreaterThan(box.head.y)
    expect(box.hands.y).toBe(box.head.y)
    expect(box.hands.x).toBeGreaterThan(box.head.x)
    expect(box.feet.x).toBe(box.hands.x)
    // Jewelry beside it, from the top.
    expect(box.neck.x).toBeGreaterThan(box.hands.right)
    expect(box.neck.y).toBe(box.head.y)
    expect(box.trinket2.x).toBe(box.neck.x)
    // The weapons across the bottom, under Armor, the main hand's divider under Armor's.
    expect(box.mainHand.y).toBeGreaterThan(box.wrist.bottom)
    expect(box.offHand.y).toBe(box.mainHand.y)
    expect(box.ranged.y).toBe(box.mainHand.y)
    expect(Math.abs(box.offHand.x - box.hands.x)).toBeLessThanOrEqual(2)
    expect(box.ranged.right).toBeCloseTo(box.neck.right, 0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })

  test('a hunter’s ammo and quiver take a second row of weapons, and still fit', async ({ page }) => {
    await openGear(page, 1440)
    await chooseSpec(page, 'Hunter', /Beast Mastery/)
    const box = await slotBoxes(page)
    expect(box.ammo.x).toBe(box.mainHand.x)
    expect(box.ammo.y).toBeGreaterThan(box.mainHand.y)
    expect(box.quiver.y).toBe(box.ammo.y)
    await expectAllInView(page, 900)
  })

  test('each slot shows its item, rank, stats and whole enchant; the flags are icons that explain themselves', async ({ page }) => {
    await openGear(page, 1440)
    const head = page.locator('li').filter({ has: page.locator('[data-gear-slot="head"]') })
    await expect(head).toContainText('Lionheart Helm')
    await expect(head).toContainText('BiS')
    await expect(head).toContainText('+18 Str')
    // Review finding DB-2: the enchant's whole name and effect, and the same as its hover title.
    const chip = page.getByRole('button', { name: /, Head enchant$/ })
    await expect(chip).toContainText('Lesser Arcanum of Voracity (Strength) · +8 Strength')
    await expect(chip.locator('[title]')).toHaveAttribute('title', 'Lesser Arcanum of Voracity (Strength) · +8 Strength')
    // No chip's text is cut short.
    const cut = await page.getByRole('button', { name: / enchant$/ }).evaluateAll((els) =>
      els.flatMap((el) => [...el.querySelectorAll('span')].filter((s) => s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent)),
    )
    expect(cut).toEqual([])

    // The chest's flags: an icon each, named, with the words as the hover title, opening the explanation.
    const chest = page.locator('li').filter({ has: page.locator('[data-gear-slot="chest"]') })
    const classic = chest.getByRole('button', { name: 'Classic stats', exact: true })
    await expect(classic).toHaveAttribute('title', 'Classic stats')
    await expect(chest.getByRole('button', { name: 'Effect not simulated', exact: true })).toBeVisible()
    await classic.click()
    await expect(page.getByRole('dialog', { name: 'Classic stats' })).toContainText('uses its Classic Era stats')
    await page.keyboard.press('Escape')
    await expect(classic).toBeFocused()
  })

  test('the targets are 44 px and their hit areas don’t overlap', async ({ page }) => {
    await openGear(page, 1440)
    const boxes = await page.evaluate(() => {
      const rect = (el: Element) => el.getBoundingClientRect().toJSON() as DOMRect
      return [...document.querySelectorAll('[data-gear-slot]')].map((slot) => {
        const li = slot.closest('li')!
        // The chip and the flags sit on the slot's button; each is its own target.
        const small = [...li.querySelectorAll('button')].filter((b) => b !== slot).map(rect)
        return { slot: rect(slot), small }
      })
    })
    for (const { slot, small } of boxes) {
      expect(slot.height).toBeGreaterThanOrEqual(44)
      for (const box of small) expect(box.height).toBeGreaterThanOrEqual(44)
      for (const [i, a] of small.entries()) {
        // Inside their slot, clear of each other.
        expect(a.top).toBeGreaterThanOrEqual(slot.top - 0.5)
        expect(a.bottom).toBeLessThanOrEqual(slot.bottom + 0.5)
        for (const b of small.slice(i + 1)) {
          const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0
          expect(overlap).toBe(false)
        }
      }
    }
  })

  test('a slot opens the item picker as a dialog; a pick equips the item and returns focus to the slot', async ({ page }) => {
    await openGear(page, 1440)
    const chest = page.getByRole('button', { name: 'Chest: Savage Gladiator Chain' })
    await chest.click({ position: { x: 20, y: 20 } })
    const dialog = page.getByRole('dialog', { name: 'Choose chest' })
    await expect(dialog).toContainText('Items a warrior can equip here.')
    await expect(dialog.getByRole('textbox', { name: 'Search items' })).toBeFocused()
    await expect(page.getByRole('complementary', { name: /Item picker|^Choose / })).toHaveCount(0)
    await dialog.getByRole('button', { name: /^Knight-Captain's Plate Hauberk\./ }).click()
    await expect(dialog).toHaveCount(0)
    const picked = page.getByRole('button', { name: "Chest: Knight-Captain's Plate Hauberk" })
    await expect(picked).toBeFocused()
    await expect(page.locator('#gear-default-status')).toContainText('1 slot differs from pre-raid best in slot: Chest.')
    // Escape closes it too, back to the slot.
    await picked.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(picked).toBeFocused()
  })

  test('the Best in slot filter lists the equipped item, first, marked Equipped', async ({ page }) => {
    // Review finding DB-8: a tank's threat set holds items no guide ranks, which the filter hid.
    await openGear(page, 1440)
    await chooseSpec(page, 'Paladin', /Protection/)
    const chest = page.getByRole('button', { name: /^Chest: / })
    const worn = (await chest.getAttribute('aria-label'))!.replace('Chest: ', '')
    await chest.click({ position: { x: 20, y: 20 } })
    const picker = page.getByRole('dialog', { name: 'Choose chest' })
    await expect(picker.getByRole('radio', { name: 'Best in slot' })).toBeChecked()
    const items = picker.getByRole('list', { name: 'Items' }).getByRole('listitem')
    // After "Leave this slot empty".
    const escaped = worn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await expect(items.nth(1).getByRole('button').first()).toHaveAccessibleName(new RegExp(`^${escaped}\\..*Equipped$`))
    await expect(items.nth(1)).toContainText('Equipped')
  })

  test('Gear’s actions are buttons sized to their labels, not a menu', async ({ page }) => {
    await openGear(page, 1440)
    await expect(page.getByRole('button', { name: 'Gear options' })).toHaveCount(0)
    const remove = page.getByRole('button', { name: 'Remove all gear' })
    expect((await remove.boundingBox())!.width).toBeLessThan(200)
    await remove.click()
    await expect(page.getByRole('button', { name: 'Head: empty' })).toBeVisible()
    const equip = page.getByRole('button', { name: 'Equip pre-raid best in slot' })
    const box = (await equip.boundingBox())!
    expect(box.width).toBeLessThan(260)
    // 32 px on the line, with a 44 px hit area.
    expect(box.height).toBeCloseTo(32, 0)
    expect(await equip.evaluate((el) => Number.parseFloat(getComputedStyle(el, '::after').height))).toBeGreaterThanOrEqual(44)
    await equip.click()
    await expect(page.getByRole('button', { name: 'Head: Lionheart Helm' })).toBeVisible()
    await expect(page.locator('#gear-default-status')).toBeFocused()
  })

  test('crossing 1440 px keeps focus on the slot: the same elements, restyled', async ({ page }) => {
    await openGear(page, 1440)
    const legs = page.getByRole('button', { name: /^Legs: / })
    await legs.focus()
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByRole('button', { name: 'Gear options' })).toBeVisible()
    await expect(legs).toBeFocused()
    const chip = page.getByRole('button', { name: /, Feet enchant$/ })
    await chip.focus()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole('button', { name: 'Remove all gear' })).toBeVisible()
    await expect(chip).toBeFocused()
  })
})

test('at 1439 px the slots are cards and the actions a menu, as below', async ({ page }) => {
  await openGear(page, 1439)
  await expect(page.getByRole('button', { name: 'Gear options' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove all gear' })).toHaveCount(0)
  // The flags keep their words.
  await expect(page.getByRole('button', { name: 'Classic stats', exact: true }).first()).toContainText('Classic stats')
  await page.getByRole('button', { name: /^Head: / }).click()
  await expect(page.getByRole('dialog', { name: 'Choose head' })).toBeVisible()
})
