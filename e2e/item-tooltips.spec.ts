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

/** A finger dragging from one point to another, as a phone scrolls: Chromium's touch events. */
async function touchDrag(page: Page, x: number, fromY: number, toY: number) {
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y?: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y === undefined ? [] : [{ x, y }] })
  await touch('touchStart', fromY)
  for (let step = 1; step <= 12; step++) {
    await touch('touchMove', fromY + ((toY - fromY) * step) / 12)
    await page.waitForTimeout(16)
  }
  await touch('touchEnd')
  await cdp.detach()
}

/**
 * A Retribution Paladin's legs picker, listing Lightforge Legplates alone: a set piece, whose tooltip,
 * with its eight pieces and five bonuses, is taller than most rooms. `touch` taps rather than clicks.
 */
async function lightforgePicker(page: Page, touch = false) {
  const press = (target: Locator, position?: { x: number; y: number }) => (touch ? target.tap({ position }) : target.click({ position }))
  await page.goto('./')
  await press(page.getByRole('button', { name: /^Spec: / }))
  await press(page.getByRole('menuitem', { name: /Retribution/ }))
  await press(page.getByRole('tab', { name: 'Gear', exact: true }))
  await press(page.getByRole('button', { name: /^Legs: / }), { x: 20, y: 20 })
  const picker = page.getByRole('dialog', { name: 'Choose legs' })
  await press(picker.getByRole('radio', { name: 'All items' }))
  await picker.getByRole('textbox', { name: 'Search items' }).fill('Lightforge')
  await expect(picker.getByText('1 item', { exact: true })).toBeVisible()
  return picker
}

/** The tooltip shows all its lines: nothing is cut off, and it's inside the window. */
async function expectWhole(page: Page) {
  const { hidden, top, bottom, height } = await tooltip(page).evaluate((el) => {
    const box = el.getBoundingClientRect()
    return { hidden: el.scrollHeight - el.clientHeight, top: box.top, bottom: box.bottom, height: window.innerHeight }
  })
  expect(hidden).toBeLessThanOrEqual(1)
  expect(top).toBeGreaterThanOrEqual(0)
  expect(bottom).toBeLessThanOrEqual(height)
}

/** The last of a set's bonuses in the open tooltip: "(6) Set: …". */
const lastSetBonus = (page: Page) => tooltip(page).getByText(/^\(\d\) Set: /).last()
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
      // The slot keeps its own short description: the tooltip's lines aren't read at every focus stop.
      await expect(head).toHaveAccessibleDescription(/\S/)
      await expect(head).not.toHaveAccessibleDescription(/Binds when|Item Level/)
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
    // The info control names the tooltip as its description; the slot keeps its own short one.
    await expect(info).toHaveAccessibleDescription(/Binds when/)
    await expect(head).not.toHaveAccessibleDescription(/Binds when/)
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
    // The worn Lionheart Helm, no set's piece: its tooltip fits below the row (a taller one goes over it, below).
    const row = picker.locator('li > div > button[aria-current]')
    await row.hover({ position: { x: 20, y: 20 } })
    await expect(tooltip(page)).toBeVisible()
    // Below the row, or above it where there's more room: level with it, never beside the dialog.
    const [rowBox, tipBox] = [(await row.boundingBox())!, (await tooltip(page).boundingBox())!]
    expect(tipBox.y >= rowBox.y + rowBox.height || tipBox.y + tipBox.height <= rowBox.y).toBe(true)
    expect(tipBox.x).toBeLessThan((await picker.boundingBox())!.x + (await picker.boundingBox())!.width)
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(1024)
  })
})

// Review round (TU-1 to TU-8): a tall tooltip, a pinned one while its list or page scrolls, and the
// taps and keys around them.

/** Where the sticky tabs end and the phone's sim bar starts: a pinned tooltip on the page stays between them. */
async function chrome(page: Page) {
  const tabs = (await page.locator('[data-sticky-tabs]').boundingBox())!
  const bar = await page.locator('[data-sim-bar]').boundingBox()
  return { top: tabs.y + tabs.height, bottom: bar && bar.height > 0 ? bar.y : page.viewportSize()!.height }
}

async function expectBetweenChrome(page: Page) {
  const { top, bottom } = await chrome(page)
  const box = (await tooltip(page).boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(top)
  expect(box.y + box.height).toBeLessThanOrEqual(bottom)
}

test.describe('390 px phone, a tall tooltip and scrolling', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a pinned tooltip taller than its room scrolls inside the picker, to its last set bonus', async ({ page }) => {
    const picker = await lightforgePicker(page, true)
    await picker.getByRole('button', { name: 'Lightforge Legplates details' }).tap()
    await expect(tooltip(page)).toContainText('Lightforge Armor (0/8)')
    // Taller than the room below the row: the set's bonuses are out of sight.
    await expect(lastSetBonus(page)).not.toBeInViewport()
    const box = (await tooltip(page).boundingBox())!
    await touchDrag(page, box.x + box.width / 2, box.y + box.height - 20, box.y + 20)
    await expect(lastSetBonus(page)).toBeInViewport()
    expect(await tooltip(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    // The drag scrolled the tooltip: it didn't close it, the picker or its sheet.
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('button', { name: 'Lightforge Legplates details' })).toHaveAttribute('aria-expanded', 'true')
    // A tap on it closes it.
    await tooltip(page).tap({ position: { x: 20, y: 20 } })
    await expect(tooltip(page)).toHaveCount(0)
    await expect(picker).toBeVisible()
  })

  test('a pinned picker row’s tooltip closes when its row scrolls out of the list, rather than riding over the sheet', async ({ page }) => {
    await openGear(page)
    await page.getByRole('button', { name: /^Head: / }).tap({ position: { x: 24, y: 24 } })
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await picker.getByRole('radio', { name: 'All items' }).tap()
    const list = picker.getByRole('list', { name: 'Items' })
    const info = picker.getByRole('button', { name: / details$/ }).nth(1)
    await info.tap()
    await expect(tooltip(page)).toBeVisible()
    // A drag on the list, below the tooltip, scrolls the row away.
    const listBox = (await list.boundingBox())!
    await touchDrag(page, listBox.x + listBox.width - 30, listBox.y + listBox.height - 20, listBox.y + 10)
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(200)
    await expect(tooltip(page)).toHaveCount(0)
    await expect(info).toHaveAttribute('aria-expanded', 'false')
    await expect(picker).toBeVisible()
  })

  test('a pinned tooltip on Gear stays clear of the sticky tabs and the sim bar, and closes as its slot scrolls under them', async ({ page }) => {
    await openGear(page)
    const hands = page.getByRole('button', { name: /^Hands: / })
    const name = await wornName(hands)
    await hands.scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: `${name} details` }).tap()
    await expect(tooltip(page)).toContainText(name)
    await expectBetweenChrome(page)
    // The page scrolls under it: it follows its slot, never over the tabs, until the slot has gone.
    for (let step = 0; step < 12 && (await tooltip(page).count()) > 0; step++) {
      await page.evaluate(() => window.scrollBy(0, 80))
      await page.waitForTimeout(100)
      if ((await tooltip(page).count()) > 0) await expectBetweenChrome(page)
    }
    await expect(tooltip(page)).toHaveCount(0)
    const slot = (await hands.boundingBox())!
    expect(slot.y + slot.height).toBeLessThanOrEqual((await chrome(page)).top)
  })

  test('with one picker row’s tooltip pinned, a tap on another row’s info control opens that one at once', async ({ page }) => {
    await openGear(page)
    const worn = await wornName(page.getByRole('button', { name: /^Head: / }))
    await page.getByRole('button', { name: /^Head: / }).tap({ position: { x: 24, y: 24 } })
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await picker.getByRole('button', { name: `${worn} details` }).tap()
    await expect(tooltip(page)).toContainText(worn)
    const row = candidate(picker)
    const name = (await row.locator('.sr-only').textContent())!.split('. ')[0]
    await picker.getByRole('button', { name: `${name} details` }).tap()
    await expect(tooltip(page)).toHaveCount(1)
    await expect(tooltip(page)).toContainText(name)
    await expect(picker.getByRole('button', { name: `${worn} details` })).toHaveAttribute('aria-expanded', 'false')
    // Nothing was picked.
    await expect(picker.locator('[aria-current]')).toContainText(worn)
  })

  test('the info control sits on the name’s line, so every card’s stats keep one line', async ({ page }) => {
    await openGear(page)
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 })
      const wrapped = await page.locator('li [data-gear-slot]').evaluateAll((buttons) =>
        buttons.flatMap((button) => {
          const lines = [...button.closest('div')!.querySelectorAll('span.tabular-nums')]
          const stats = lines.at(-1)
          if (!stats) return []
          const oneLine = Number.parseFloat(getComputedStyle(stats).lineHeight)
          return stats.getBoundingClientRect().height > oneLine * 1.5 ? [(button as HTMLElement).dataset.gearSlot] : []
        }),
      )
      expect(wrapped, `stats lines wrapped at ${width} px`).toEqual([])
    }
  })
})

test.describe('320 px phone', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true })

  test('a pinned tooltip near the top opens clear of the header, the tabs and the sim bar', async ({ page }) => {
    await openGear(page)
    const shoulders = page.getByRole('button', { name: /^Shoulders: / })
    const info = page.getByRole('button', { name: `${await wornName(shoulders)} details` })
    await info.scrollIntoViewIfNeeded()
    await info.tap()
    await expect(tooltip(page)).toContainText(await wornName(shoulders))
    await expectBetweenChrome(page)
  })
})

test.describe('tall tooltips where the dialog or card leaves no room beside it', () => {
  test('in the picker at 1024×768, a set piece’s hover tooltip shows whole, over the list', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    const picker = await lightforgePicker(page)
    const row = candidate(picker)
    await row.hover({ position: { x: 30, y: 30 } })
    await expect(tooltip(page)).toContainText('Lightforge Armor (0/8)')
    await expectWhole(page)
    await expect(lastSetBonus(page)).toBeInViewport()
    // It lets the pointer through: the row under it still picks.
    await row.click({ position: { x: 30, y: 30 } })
    await expect(picker).toHaveCount(0)
  })

  for (const width of [1100, 1209]) {
    test(`in the picker at ${width}×800 too`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      const picker = await lightforgePicker(page)
      await candidate(picker).hover({ position: { x: 30, y: 30 } })
      await expect(tooltip(page)).toContainText('Lightforge Armor (0/8)')
      await expectWhole(page)
    })
  }

  test('on a Gear card at 700×900 near the top, a set piece’s hover tooltip shows whole', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 })
    const picker = await lightforgePicker(page)
    await candidate(picker).click()
    await expect(picker).toHaveCount(0)
    const legs = page.getByRole('button', { name: 'Legs: Lightforge Legplates' })
    // Near the top, where neither the room below it nor the room above is the tooltip's height.
    await legs.evaluate((el) => {
      el.scrollIntoView({ block: 'start' })
      window.scrollBy(0, -120)
    })
    await page.mouse.move(0, 0)
    await legs.hover({ position: { x: 20, y: 20 } })
    await expect(tooltip(page)).toContainText('Lightforge Armor (1/8)')
    await expectWhole(page)
    await expect(lastSetBonus(page)).toBeInViewport()
    // Over the card's far half, clear of the pointer on its icon.
    expect((await tooltip(page).boundingBox())!.x).toBeGreaterThan(300)
  })
})

test.describe('the item picker and Escape', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('with the mouse resting on a row, one Escape closes its tooltip and the picker', async ({ page }) => {
    await openGear(page)
    await page.getByRole('button', { name: /^Head: / }).click({ position: { x: 20, y: 20 } })
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await candidate(picker).hover()
    await expect(tooltip(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
  })
})

test.describe('a touch screen at 1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true })

  test('a second tap where the info control is closes the tooltip, even where the tooltip covers it', async ({ page }) => {
    await openGear(page)
    const shoulders = page.getByRole('button', { name: /^Shoulders: / })
    const info = page.getByRole('button', { name: `${await wornName(shoulders)} details` })
    const box = (await info.boundingBox())!
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.touchscreen.tap(centre.x, centre.y)
    await expect(tooltip(page)).toBeVisible()
    // The tooltip covers the info control here: the second tap lands on the panel.
    expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[role="tooltip"]'), centre)).toBe(true)
    await page.touchscreen.tap(centre.x, centre.y)
    await expect(tooltip(page)).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
