import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Gear", the wide layout (D34, as amended): from 1440 px every slot shows at once, with
// no scrolling at 1440×900 and up, in a grid laid out like the character pane: Armor in two
// columns, Jewelry in a third, the Weapons in a row across the bottom. Each slot shows its icon, the
// item in its quality colour with its rank, the stats and its enchant, each on a fixed budget of
// lines; the flags are icons, or their words too where those fit. The item picker is the dialog, as
// at 1280 px, and Gear's actions are buttons rather than a menu. That every slot fits whatever it
// holds is wide-gear-fit.spec.ts. Under 1440 px nothing changes (the other gear specs, at 1280).

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
  test('the default set’s line stays one line as the gear changes, and the slots don’t move', async ({ page }) => {
    // Review finding DU1-4: one slot emptied and one changed wrapped the line, moving every slot 20 px.
    await openGear(page, 1440, 900)
    const status = page.locator('#gear-default-status')
    const tops = async () => Object.values(await slotBoxes(page)).map((box) => box.top)
    const before = await tops()
    await page.getByRole('button', { name: /^Chest: / }).click({ position: { x: 20, y: 20 } })
    await page.getByRole('dialog', { name: 'Choose chest' }).getByRole('button', { name: /^Knight-Captain's Plate Hauberk\./ }).click()
    await page.getByRole('button', { name: /^Hands: / }).click({ position: { x: 20, y: 20 } })
    await page.getByRole('dialog', { name: 'Choose hands' }).getByRole('button', { name: /^Leave this slot empty/ }).click()
    await expect(status).toHaveText('2 slots differ: Chest and Hands. Equipping fills 1 empty slot and replaces the other.')
    // The whole sentence on hover.
    await expect(status.locator('span[title]')).toHaveAttribute(
      'title',
      /^2 slots differ from pre-raid best in slot: Chest and Hands\. Equipping it fills\s1 empty slot and replaces the other\.$/,
    )
    expect((await status.boundingBox())!.height).toBe(20)
    expect(await tops()).toEqual(before)
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
    // Review finding DB-2: the enchant's name and effect on one line, the whole as its hover title.
    const chip = page.getByRole('button', { name: /, Head enchant$/ })
    await expect(chip).toContainText('Lesser Arcanum of Voracity (Strength) · +8 Strength')
    await expect(chip.locator('[title]')).toHaveAttribute('title', 'Lesser Arcanum of Voracity (Strength) · +8 Strength')
    expect((await chip.locator('[data-chip-text]').boundingBox())!.height).toBe(16)
    // The stats on one line, the whole on hover.
    const stats = head.locator('span[title^="+18 Str"]')
    await expect(stats).toHaveCSS('text-overflow', 'ellipsis')
    expect((await stats.boundingBox())!.height).toBe(16)

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

  for (const width of [1440, 1920]) {
    test(`the targets are 44 px and their hit areas don’t overlap, ${width} px`, async ({ page }) => {
      await openGear(page, width)
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
  }

  test('the enchant chip’s focus ring stays on its own line, clear of the stats above', async ({ page }) => {
    // Review finding DU1-5: the ring was drawn around the chip's 44 px hit area, over the stats line.
    await openGear(page, 1440)
    const chip = page.getByRole('button', { name: /, Head enchant$/ })
    await chip.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(chip).toBeFocused()
    const ring = await chip.evaluate((el) => {
      const text = el.querySelector('[data-chip-text]')!.parentElement!
      const li = el.closest('li')!
      const stats = li.querySelector('span[title^="+18 Str"]')!
      const width = Number.parseFloat(getComputedStyle(text).getPropertyValue('--tw-ring-shadow').match(/0 0 0 calc\((\d+)px/)?.[1] ?? '3')
      return {
        buttonShadow: getComputedStyle(el).boxShadow,
        textShadow: getComputedStyle(text).boxShadow,
        ringTop: text.getBoundingClientRect().top - width,
        ringBottom: text.getBoundingClientRect().bottom + width,
        statsBottom: stats.getBoundingClientRect().bottom,
        slotBottom: li.getBoundingClientRect().bottom,
      }
    })
    // Drawn around the text, not the button: a 3 px ring's spread on the one, none on the other.
    expect(ring.buttonShadow).not.toMatch(/0px 0px 0px [1-9]/)
    expect(ring.textShadow).toMatch(/0px 0px 0px 3px/)
    expect(ring.ringTop).toBeGreaterThanOrEqual(ring.statsBottom)
    expect(ring.ringBottom).toBeLessThanOrEqual(ring.slotBottom)
  })

  test('the flags show their words where they fit beside the enchant, and icons where they don’t', async ({ page }) => {
    // Review finding DU1-6. At 1920 px the wrists' flag fits in words beside "Superior Strength · +9
    // Strength", about 45 px to spare, while the chest's two don't beside "Greater Stats · +4 all
    // stats", some 75 px short; at 1440 px the wrists' don't either.
    await openGear(page, 1920, 1080)
    const slot = (name: string) => page.locator('li').filter({ has: page.locator(`[data-gear-slot="${name}"]`) })
    const wrists = slot('wrist').getByRole('button', { name: 'Classic stats', exact: true })
    await expect(wrists).toHaveText('Classic stats')
    await expect(slot('chest').getByRole('button', { name: 'Classic stats', exact: true })).toHaveText('')
    await expect(slot('chest').getByRole('button', { name: 'Effect not simulated', exact: true })).toHaveText('')
    // Words never cut the enchant short: every line showing them has its enchant whole.
    const cut = await page.locator('[data-chip-text]').evaluateAll((els) =>
      els
        .filter((el) => [...el.closest('button')!.parentElement!.querySelectorAll('button[title]')].some((flag) => flag.textContent) && el.scrollWidth > el.clientWidth)
        .map((el) => el.textContent),
    )
    expect(cut).toEqual([])
    // The words still open the explanation.
    await wrists.click()
    await expect(page.getByRole('dialog', { name: 'Classic stats' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(wrists).toBeFocused()
    // Narrower, the same flag is its icon again, and the enchant keeps the room.
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(wrists).toHaveText('')
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
    await expect(page.locator('#gear-default-status')).toHaveText('1 slot differs: Chest. Equipping replaces that slot.')
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

  test('Gear’s actions are buttons sized to their labels; Remove all gear takes a second click', async ({ page }) => {
    await openGear(page, 1440)
    await expect(page.getByRole('button', { name: 'Gear options' })).toHaveCount(0)
    const remove = page.getByRole('button', { name: 'Remove all gear' })
    expect((await remove.boundingBox())!.width).toBeLessThan(200)
    // Review finding DL2-4: like the header's Reset setup, it opens a one-item menu (decision D21:
    // no undo), so one click alone empties nothing.
    await remove.click()
    const empty = page.getByRole('menuitem', { name: 'Empty all 17 slots' })
    await expect(empty).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(remove).toBeFocused()
    await expect(page.getByRole('button', { name: 'Head: Lionheart Helm' })).toBeVisible()
    await remove.press('Enter')
    await empty.click()
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
