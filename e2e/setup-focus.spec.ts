import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Focus on the setup screens never falls to the page (docs/ux.md#accessibility): a dialog opened
// from state gives focus back, a button that disables itself hands focus on first, and a link to
// another tab lands on what it names. Also the talent popover's reasons (docs/ux.md "Talents").

/** Headless Chromium's phone emulation still reports a fine, hovering pointer; answer as a phone does. */
const touchOnly = (page: Page) =>
  page.addInitScript(() => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      if (!/\b(any-)?(hover|pointer)\b/.test(query)) return original(query)
      const matches = /hover:\s*none|pointer:\s*coarse/.test(query) && !/hover:\s*hover|pointer:\s*fine/.test(query)
      return { matches, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
    }
  })

/**
 * Every point of a 44 × 44 px square hits the element (its hit area, pseudo-elements included):
 * centred across it, and down from the top of its hit area, since a small link's is lopsided,
 * reaching further below its text than above (LINK_HIT_AREA in src/features/changed-hint.tsx).
 */
const hitArea44 = (locator: Locator) =>
  locator.evaluate((el) => {
    el.scrollIntoView({ block: 'center' })
    const box = el.getBoundingClientRect()
    const cx = box.x + box.width / 2
    const hits = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)
      return !!hit && (hit === el || el.contains(hit))
    }
    let top = box.y + box.height / 2
    while (hits(cx, top - 1) && top > box.y - 44) top--
    const misses: string[] = []
    for (const dx of [-21, 0, 21]) for (const dy of [0, 22, 43]) if (!hits(cx + dx, top + dy)) misses.push(`${dx},${dy}`)
    return misses
  })

test.describe('talents', () => {
  test('the paste dialog gives focus back to Paste code, however it closes', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    const paste = page.getByRole('button', { name: /^Paste/ })
    const dialog = page.getByRole('dialog', { name: 'Paste a build code' })

    await paste.click()
    await expect(dialog.getByRole('textbox', { name: 'Build code or link' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(paste).toBeFocused()

    await paste.click()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(paste).toBeFocused()

    await paste.click()
    await dialog.getByRole('textbox').fill('30305213132515201-05050103-')
    await dialog.getByRole('button', { name: 'Use this build' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('37 / 14 / 0')).toBeVisible()
    await expect(paste).toBeFocused()
  })

  test('Clear hands focus to the preset menu before it disables itself', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    const clear = page.getByRole('button', { name: 'Clear' })
    await clear.focus()
    await page.keyboard.press('Enter')
    await expect(clear).toBeDisabled()
    const presets = page.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toBeFocused()
    await expect(presets).toHaveText('Custom build')
  })

  test('a point that can’t come back says why, in the tooltip and on a right-click', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    const deathWish = page.getByRole('button', { name: 'Death Wish, 1 of 1' })
    const reason = 'Can’t remove a point: Bloodthirst needs 1 point in Death Wish.'
    await deathWish.hover()
    await expect(page.getByRole('tooltip')).toContainText(reason)
    await deathWish.click({ button: 'right' })
    await expect(deathWish).toHaveAccessibleName('Death Wish, 1 of 1')
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: reason })).toBeVisible()
    // Backspace says the same; a second refusal replaces the toast rather than stacking.
    await deathWish.focus()
    await page.keyboard.press('Backspace')
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)
    // A locked talent says what it needs when clicked.
    await page.getByRole('button', { name: 'Clear' }).click()
    await page.getByRole('button', { name: 'Bloodthirst, 0 of 1' }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Requires 30 points in Fury.' })).toBeVisible()
  })
})

test.describe('talents on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the tree switcher is named, and the popover says why − is off', async ({ page }) => {
    await touchOnly(page)
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    const trees = page.getByRole('radiogroup', { name: 'Talent tree' })
    await expect(trees.getByRole('radio')).toHaveCount(3)
    await trees.getByRole('radio', { name: /^Fury/ }).click()

    await page.getByRole('button', { name: 'Death Wish, 1 of 1' }).click()
    const popover = page.getByRole('dialog', { name: 'Death Wish' })
    await expect(popover).toContainText('Can’t remove a point: Bloodthirst needs 1 point in Death Wish.')
    const minus = popover.getByRole('button', { name: 'Remove a point' })
    await expect(minus).toBeDisabled()
    await expect(minus).toHaveAccessibleDescription('Can’t remove a point: Bloodthirst needs 1 point in Death Wish.')
  })

  test('− at 0 hands focus to +, and + at the top rank to −', async ({ page }) => {
    await touchOnly(page)
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await page.getByRole('button', { name: 'Clear' }).click()
    await page.getByRole('radiogroup', { name: 'Talent tree' }).getByRole('radio', { name: /^Fury/ }).click()
    await page.getByRole('button', { name: 'Cruelty, 0 of 5' }).click()
    const popover = page.getByRole('dialog', { name: 'Cruelty' })
    const plus = popover.getByRole('button', { name: 'Add a point' })
    const minus = popover.getByRole('button', { name: 'Remove a point' })

    await plus.focus()
    for (let i = 0; i < 5; i++) await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Cruelty, 5 of 5' })).toBeVisible()
    await expect(plus).toBeDisabled()
    await expect(minus).toBeFocused()
    for (let i = 0; i < 5; i++) await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Cruelty, 0 of 5' })).toBeVisible()
    await expect(minus).toBeDisabled()
    await expect(plus).toBeFocused()
  })

  test('focus moves to a button the change has only just enabled', async ({ page }) => {
    await touchOnly(page)
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    // The default build spends all 51 points, so + is off until a point comes back.
    await page.getByRole('radiogroup', { name: 'Talent tree' }).getByRole('radio', { name: /^Fury/ }).click()
    await page.getByRole('button', { name: 'Raging Blows, 1 of 1' }).click()
    const popover = page.getByRole('dialog', { name: 'Raging Blows' })
    const plus = popover.getByRole('button', { name: 'Add a point' })
    const minus = popover.getByRole('button', { name: 'Remove a point' })
    await expect(plus).toBeDisabled()
    await minus.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Raging Blows, 0 of 1' })).toBeVisible()
    await expect(plus).toBeFocused()
    // A one-rank talent: + reaches the top at once, and − has just come on.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Raging Blows, 1 of 1' })).toBeVisible()
    await expect(minus).toBeFocused()
  })
})

test.describe('rotation', () => {
  test('Reset rotation hands focus to the first setting before it disables itself', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await tab.getByRole('switch', { name: 'Slam', exact: true }).click()
    const reset = tab.getByRole('button', { name: 'Reset rotation' })
    await reset.focus()
    await page.keyboard.press('Enter')
    await expect(reset).toBeDisabled()
    await expect(tab.getByRole('switch').first()).toBeFocused()
  })

  test('the Buffs link is a 44 px target and opens Buffs on the consumable’s switch', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const link = page.getByRole('tabpanel', { name: 'Rotation' }).getByRole('button', { name: 'Buffs', exact: true })
    await link.scrollIntoViewIfNeeded()
    expect(await hitArea44(link)).toEqual([])
    await link.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tab', { name: 'Buffs', exact: true })).toHaveAttribute('aria-selected', 'true')
    const juju = page.getByRole('tabpanel', { name: 'Buffs' }).getByRole('switch', { name: 'Juju Flurry' })
    await expect(juju).toBeFocused()
    await page.keyboard.press('Space')
    await expect(juju).toBeChecked()
  })
})

test.describe('number steppers', () => {
  test('a stepper that reaches its limit hands focus to the other stepper, not the field (TU4)', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('button', { name: 'Advanced' }).click()
    const level = page.getByRole('textbox', { name: 'Boss level' })
    const up = page.getByRole('button', { name: 'Increase Boss level' })
    const down = page.getByRole('button', { name: 'Decrease Boss level' })
    // 63 is the top.
    await expect(up).toBeDisabled()
    await down.focus()
    for (const value of ['62', '61', '60']) {
      await page.keyboard.press('Enter')
      await expect(level).toHaveValue(value)
    }
    await expect(down).toBeDisabled()
    // The way back, and no on-screen keyboard on a phone.
    await expect(up).toBeFocused()
    for (const value of ['61', '62', '63']) {
      await page.keyboard.press('Space')
      await expect(level).toHaveValue(value)
    }
    await expect(up).toBeDisabled()
    await expect(down).toBeFocused()
  })

  test('a stepper that didn’t hold focus leaves focus alone at its limit', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('button', { name: 'Advanced' }).click()
    const level = page.getByRole('textbox', { name: 'Boss level' })
    await level.focus()
    // A tap that doesn't focus the stepper (iOS Safari), as a script click does.
    const down = page.getByRole('button', { name: 'Decrease Boss level' })
    for (const value of ['62', '61', '60']) {
      await down.evaluate((el: HTMLElement) => el.click())
      await expect(level).toHaveValue(value)
    }
    await expect(level).toBeFocused()
  })
})
