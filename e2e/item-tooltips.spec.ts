import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Item tooltips" (M5.67): every item shows its tooltip as the game does, wherever it's
// shown: the gear slots at every layout and the item picker's rows. On desktop hover and keyboard
// focus open it, and Escape closes it; the info control shows only where nothing hovers, where a tap
// on it opens the tooltip and a tap outside closes it. Headless Chromium's touch emulation (hasTouch)
// answers the hover and pointer media queries as a phone does.

async function openGear(page: Page) {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
}

/** Presses Tab until `target` has focus: keyboard focus, which is what opens the tooltip. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((el) => el === document.activeElement)) return
  }
  throw new Error('Tab never reached the target')
}

/** The worn item's name, from a slot's accessible name ("Head: Lionheart Helm"). */
async function wornName(slot: Locator) {
  return (await slot.getAttribute('aria-label'))!.replace(/^[^:]+: /, '')
}

/** The open tooltip: one that's closing fades out for a moment first. */
/** The picker's first item the slot doesn't hold that can be picked: its row's button, not its info control. */
const candidate = (picker: Locator) => picker.locator('li > div > button:has(.sr-only):not([aria-current]):not([aria-disabled])').first()

/** The wide grid's edge of a slot's icon, name and rank toward the tooltip: their right, or on the mirrored side their left. */
const nameRight = (slot: Locator) =>
  slot.evaluate((el) => Math.max(...[...el.parentElement!.querySelectorAll('.item-tooltip-anchor')].map((part) => part.getBoundingClientRect().right)))
const nameLeft = (slot: Locator) =>
  slot.evaluate((el) => Math.min(...[...el.parentElement!.querySelectorAll('.item-tooltip-anchor')].map((part) => part.getBoundingClientRect().left)))

const tooltip = (page: Page) => page.locator('[role="tooltip"][data-state="open"]')
/** A stat, armor or weapon line, the way the game words them. */
const STAT_LINE = /\+\d+ (Strength|Agility|Stamina|Intellect|Spirit)|\d+ Armor|Damage/

for (const width of [1280, 1920]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: width === 1920 ? 1080 : 900 } })

    test('hovering a gear slot shows its tooltip; keyboard focus does too, and Escape closes it', async ({ page }) => {
      await openGear(page)
      const head = page.getByRole('button', { name: /^Head: / })
      const name = await wornName(head)
      // On its icon: from 1440 px the enchant chip sits over the slot's middle.
      await head.hover({ position: { x: 20, y: 20 } })
      await expect(tooltip(page)).toBeVisible()
      await expect(tooltip(page)).toContainText(name)
      await expect(tooltip(page)).toContainText(STAT_LINE)
      // While it's open, the slot names it as its description.
      await expect(head).toHaveAccessibleDescription(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      const [slotBox, tipBox] = [(await head.boundingBox())!, (await tooltip(page).boundingBox())!]
      if (width < 1440) {
        // Beside the card, never over it.
        expect(tipBox.x).toBeGreaterThanOrEqual(slotBox.x + slotBox.width)
      } else {
        // Beside the slot's icon, name and rank, where the pointer is, not at the row's far edge: it covers
        // some of its own row, and none of the right side.
        const nameEnd = await nameRight(head)
        expect(tipBox.x).toBeGreaterThanOrEqual(nameEnd)
        expect(tipBox.x).toBeLessThanOrEqual(nameEnd + 12)
        expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(slotBox.x + slotBox.width)
      }
      // The mouse leaving closes it.
      await page.mouse.move(0, 0)
      await expect(tooltip(page)).toHaveCount(0)
      // No info control where a mouse hovers: hover and focus open the tooltip.
      await expect(page.getByRole('button', { name: `${name} details` })).toHaveCount(0)

      await tabTo(page, head)
      await expect(tooltip(page)).toBeVisible()
      await expect(tooltip(page)).toContainText(name)
      await page.keyboard.press('Escape')
      await expect(tooltip(page)).toHaveCount(0)
      await expect(head).toBeFocused()
    })
  })
}

test.describe('1920 px, the mirrored right side', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('a right-side slot’s tooltip opens to the left of its name, into the pane', async ({ page }) => {
    await openGear(page)
    const hands = page.getByRole('button', { name: /^Hands: / })
    // On its icon, at the slot's right edge.
    const box = (await hands.boundingBox())!
    await hands.hover({ position: { x: box.width - 20, y: 20 } })
    await expect(tooltip(page)).toContainText(await wornName(hands))
    const tipBox = (await tooltip(page).boundingBox())!
    const nameStart = await nameLeft(hands)
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(nameStart)
    expect(tipBox.x + tipBox.width).toBeGreaterThanOrEqual(nameStart - 12)
  })

  test('a tooltip drawn under the resting pointer stays open: the pointer passes through it to the slot', async ({ page }) => {
    await openGear(page)
    const hands = page.getByRole('button', { name: /^Hands: / })
    // At the slot's inner end, where its tooltip, beside the name, is drawn.
    await hands.hover({ position: { x: 150, y: 20 } })
    await expect(tooltip(page)).toContainText(await wornName(hands))
    const tipBox = (await tooltip(page).boundingBox())!
    const slotBox = (await hands.boundingBox())!
    expect(tipBox.x).toBeLessThanOrEqual(slotBox.x + 150)
    await page.waitForTimeout(600)
    await expect(tooltip(page)).toBeVisible()
    await expect(page.locator('[role="tooltip"]')).toHaveCount(1)
  })

  test('a weapon’s tooltip opens beside its icon and name', async ({ page }) => {
    await openGear(page)
    const mainHand = page.getByRole('button', { name: /^Main hand: / })
    await mainHand.hover({ position: { x: 20, y: 20 } })
    await expect(tooltip(page)).toContainText(await wornName(mainHand))
    const tipBox = (await tooltip(page).boundingBox())!
    const nameEnd = await nameRight(mainHand)
    expect(tipBox.x).toBeGreaterThanOrEqual(nameEnd)
    expect(tipBox.x).toBeLessThanOrEqual(nameEnd + 12)
  })
})

test.describe('700 px, a card as wide as the window', () => {
  test.use({ viewport: { width: 700, height: 900 } })

  test('with no room beside the slot, the tooltip goes below it, inside the window', async ({ page }) => {
    await openGear(page)
    const head = page.getByRole('button', { name: /^Head: / })
    await head.hover({ position: { x: 20, y: 20 } })
    await expect(tooltip(page)).toContainText(await wornName(head))
    const [slotBox, tipBox] = [await head.boundingBox(), await tooltip(page).boundingBox()]
    expect(tipBox!.y).toBeGreaterThanOrEqual(slotBox!.y + slotBox!.height)
    expect(tipBox!.x).toBeGreaterThanOrEqual(0)
    expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(700)
  })
})

test.describe('390 px phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a tap on the info control opens the tooltip, a tap outside closes it', async ({ page }) => {
    await openGear(page)
    const head = page.getByRole('button', { name: /^Head: / })
    const name = await wornName(head)
    const info = page.getByRole('button', { name: `${name} details` })
    await expect(info).toHaveAttribute('aria-expanded', 'false')
    const box = (await info.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    // It fits the row: no sideways scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

    await info.tap()
    await expect(tooltip(page)).toBeVisible()
    await expect(tooltip(page)).toContainText(name)
    await expect(tooltip(page)).toContainText(STAT_LINE)
    await expect(info).toHaveAttribute('aria-expanded', 'true')
    // The tap opened the tooltip, not the picker.
    await expect(page.getByRole('dialog', { name: 'Choose head' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

    await page.getByRole('heading', { name: 'Gear', level: 2 }).tap()
    await expect(tooltip(page)).toHaveCount(0)
    await expect(info).toHaveAttribute('aria-expanded', 'false')

    // A tap on another slot while it's open only closes it; the next tap opens that slot's picker.
    await info.tap()
    await expect(tooltip(page)).toContainText(name)
    const back = page.getByRole('button', { name: /^Back: / })
    await back.tap({ position: { x: 24, y: 24 } })
    await expect(tooltip(page)).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Choose back' })).toHaveCount(0)
    await back.tap({ position: { x: 24, y: 24 } })
    await expect(page.getByRole('dialog', { name: 'Choose back' })).toBeVisible()
  })

  test('the picker’s rows have an info control too, and a row’s tap still picks it', async ({ page }) => {
    await openGear(page)
    await page.getByRole('button', { name: /^Head: / }).tap({ position: { x: 24, y: 24 } })
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    const row = candidate(picker)
    const name = (await row.locator('.sr-only').textContent())!.split('. ')[0]
    await picker.getByRole('button', { name: `${name} details` }).tap()
    await expect(tooltip(page)).toContainText(name)
    await picker.getByRole('button', { name: `${name} details` }).tap()
    await expect(tooltip(page)).toHaveCount(0)
    await row.tap({ position: { x: 24, y: 24 } })
    await expect(picker).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Head: ${name}` })).toBeVisible()
  })

  test('with a picker row’s tooltip open, a tap on another row only closes it; the next tap picks', async ({ page }) => {
    await openGear(page)
    const worn = await wornName(page.getByRole('button', { name: /^Head: / }))
    await page.getByRole('button', { name: /^Head: / }).tap({ position: { x: 24, y: 24 } })
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    // The worn item's tooltip, then a tap on another item's row.
    await picker.getByRole('button', { name: `${worn} details` }).tap()
    await expect(tooltip(page)).toContainText(worn)
    const row = candidate(picker)
    const name = (await row.locator('.sr-only').textContent())!.split('. ')[0]
    // Its bottom right, clear of the tooltip below the worn row and of the row's own info control.
    const box = (await row.boundingBox())!
    const clear = { position: { x: box.width - 12, y: box.height - 8 } }
    await row.tap(clear)
    await expect(tooltip(page)).toHaveCount(0)
    await expect(picker).toBeVisible()
    await expect(picker.locator('[aria-current]')).toContainText(worn)
    await row.tap(clear)
    await expect(picker).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Head: ${name}` })).toBeVisible()
  })
})

test.describe('the item picker', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('hovering a candidate shows its tooltip, and a click still picks it', async ({ page }) => {
    await openGear(page)
    await page.getByRole('button', { name: /^Head: / }).click({ position: { x: 20, y: 20 } })
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    const row = candidate(picker)
    const name = (await row.locator('.sr-only').textContent())!.split('. ')[0]
    await row.hover()
    await expect(tooltip(page)).toBeVisible()
    await expect(tooltip(page)).toContainText(name)
    await expect(tooltip(page)).toContainText(STAT_LINE)
    // Beside the dialog, which leaves 16 rem at 1280 px: it covers none of the list.
    const [dialogBox, tipBox] = [(await picker.boundingBox())!, (await tooltip(page).boundingBox())!]
    expect(tipBox.x).toBeGreaterThanOrEqual(dialogBox.x + dialogBox.width)
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(1280)
    // The tooltip lets the pointer through, so the row under it still picks.
    await row.click()
    await expect(picker).toHaveCount(0)
    await expect(tooltip(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Head: ${name}` })).toBeFocused()
  })

  test('keyboard focus on a candidate shows its tooltip; Escape closes it, not the picker, and Enter picks', async ({ page }) => {
    await openGear(page)
    await page.getByRole('button', { name: /^Head: / }).click({ position: { x: 20, y: 20 } })
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await expect(picker.getByRole('textbox', { name: 'Search items' })).toBeFocused()
    const row = candidate(picker)
    const name = (await row.locator('.sr-only').textContent())!.split('. ')[0]
    await page.mouse.move(0, 0)
    await tabTo(page, row)
    await expect(tooltip(page)).toContainText(name)
    await page.keyboard.press('Escape')
    await expect(tooltip(page)).toHaveCount(0)
    await expect(picker).toBeVisible()
    await expect(row).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(picker).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Head: ${name}` })).toBeFocused()
  })
})

test.describe('the item picker at 1024 px', () => {
  test.use({ viewport: { width: 1024, height: 900 } })

  test('with too little room beside the dialog, a row’s tooltip opens below or above it', async ({ page }) => {
    await openGear(page)
    await page.getByRole('button', { name: /^Head: / }).click({ position: { x: 20, y: 20 } })
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    const row = candidate(picker)
    await row.hover({ position: { x: 20, y: 20 } })
    await expect(tooltip(page)).toBeVisible()
    // Below the row, or above it where there's more room: level with it, never beside the dialog.
    const [rowBox, tipBox] = [(await row.boundingBox())!, (await tooltip(page).boundingBox())!]
    expect(tipBox.y >= rowBox.y + rowBox.height || tipBox.y + tipBox.height <= rowBox.y).toBe(true)
    expect(tipBox.x).toBeLessThan((await picker.boundingBox())!.x + (await picker.boundingBox())!.width)
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(1024)
  })
})
