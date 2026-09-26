import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Gear tab (docs/ux.md "Gear"): flag badges that explain themselves on tap, the slot
// button's description, the picker's sort and its 44 px controls, and no sideways scroll.

async function arms(page: Page) {
  await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
  await page.getByRole('menuitem', { name: /Arms/ }).click()
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a tap on a slot’s flags explains them; the slot button describes the item', async ({ page }) => {
    await page.goto('./')
    await arms(page)
    const slot = page.getByRole('button', { name: 'Main hand: Blackblade of Shahram' })
    await expect(slot).toHaveAccessibleDescription(/Best in slot\. Classic stats: no Forever data yet\. Has an effect the sim doesn’t simulate$/)
    await expect(slot).toHaveAccessibleDescription(/^59\.\d DPS · 3\.50 s/)

    const row = page.getByRole('listitem').filter({ has: slot })
    await row.getByRole('button', { name: 'Effect not simulated' }).tap()
    const effect = page.getByRole('dialog').filter({ hasText: 'Effect not simulated' })
    await expect(effect).toContainText('Chance on hit: Summons the infernal spirit of Shahram.')
    // The tap explained the flag; it didn't open the picker.
    await expect(page.getByRole('dialog', { name: 'Choose main hand' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await row.getByRole('button', { name: 'Classic stats' }).tap()
    await expect(page.getByRole('dialog').filter({ hasText: 'Classic stats' })).toContainText('uses its Classic Era stats')
    await page.keyboard.press('Escape')

    // Anywhere else on the row opens the picker (here, the item's icon).
    await slot.tap({ position: { x: 24, y: 24 } })
    const picker = page.getByRole('dialog', { name: 'Choose main hand' })
    await expect(picker).toBeVisible()

    // The picker's rows work the same way: a flag explains itself and doesn't pick the item.
    const blackblade = picker.getByRole('listitem').filter({ hasText: 'Blackblade of Shahram' })
    await blackblade.getByRole('button', { name: 'Classic stats', exact: true }).tap()
    await expect(page.getByRole('dialog').filter({ hasText: 'uses its Classic Era stats' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog').filter({ hasText: 'uses its Classic Era stats' })).toHaveCount(0)
    await expect(picker).toBeVisible()
    await expect(blackblade.getByRole('button').first()).toHaveAttribute('aria-current', 'true')
  })

  test('Sageclaw’s Classic Era spell power is flagged, in its own words (EU-2)', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: /^Fire/ }).click()
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: 'Human' }).click()
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    const slot = page.getByRole('button', { name: /^Main hand: Sageclaw/ })
    await expect(slot).toHaveAccessibleDescription(/Classic stats: its spell power is Classic Era’s, with no Forever tooltip on record yet/)
    const row = page.getByRole('listitem').filter({ has: slot })
    await row.getByRole('button', { name: 'Classic stats' }).tap()
    await expect(page.getByRole('dialog', { name: 'Classic stats' })).toContainText(
      'Its spell power is Classic Era’s: no one has recorded its Forever tooltip yet, so the sim uses the Classic Era value.',
    )
  })

  test('the flags’ hit areas are 44 px tall', async ({ page }) => {
    await page.goto('./')
    await arms(page)
    await expect(page.getByRole('button', { name: 'Main hand: Blackblade of Shahram' })).toBeVisible()
    const flags = page.getByRole('button', { name: /^(Classic stats|Effect not simulated)$/ })
    expect(await flags.count()).toBeGreaterThan(3)
    for (const box of await flags.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
  })
})

test('an empty slot opens its picker from its faded icon too', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Gear options' }).click()
  await page.getByRole('menuitem', { name: 'Remove all gear' }).click()
  await page.getByRole('button', { name: 'Head: empty' }).click({ position: { x: 24, y: 24 } })
  await expect(page.getByRole('dialog', { name: 'Choose head' })).toBeVisible()
})

test.describe('narrow phone', () => {
  test.use({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true })

  test('the Gear tab doesn’t scroll sideways at 320 px', async ({ page }) => {
    await page.goto('./')
    for (const spec of ['Fury', 'Arms']) {
      if (spec === 'Arms') await arms(page)
      await expect(page.getByRole('button', { name: /^Head: / })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${spec}: no horizontal page scroll`).toBeLessThanOrEqual(0)
    }
  })
})

test.describe('item picker', () => {
  test('sorts by BiS rank, item level or name', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Head: / }).click()
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    const sort = picker.getByRole('combobox', { name: 'Sort by BiS rank' })
    await expect(sort).toBeVisible()
    await picker.getByRole('radio', { name: 'All items' }).click()
    // Each row's first button is the item's, and its text starts with the name; "Leave this slot
    // empty" comes first.
    const rows = async () =>
      (
        await picker
          .getByRole('list', { name: 'Items' })
          .getByRole('listitem')
          .evaluateAll((els) => els.map((el) => el.querySelector('button')?.textContent ?? ''))
      ).slice(1, 8)
    const names = async () => (await rows()).map((t) => t.split('. ')[0])
    const levels = async () => (await rows()).map((t) => Number(/Item level (\d+)/.exec(t.replace(/\s/g, ' '))?.[1]))

    await sort.click()
    await page.getByRole('option', { name: 'Name' }).click()
    await expect(picker.getByRole('combobox', { name: 'Sort by Name' })).toBeVisible()
    const byName = await names()
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)))

    await picker.getByRole('combobox', { name: 'Sort by Name' }).click()
    await page.getByRole('option', { name: 'Item level' }).click()
    const byLevel = await levels()
    expect(byLevel.every((level) => Number.isFinite(level))).toBe(true)
    expect(byLevel).toEqual([...byLevel].sort((a, b) => b - a))
  })

  test('a Horde caster’s main hand lists Whiteout Staff first, above Mindfang at the same rank (EU-4)', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: /^Fire/ }).click()
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: 'Troll' }).click()
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await page.getByRole('button', { name: /^Main hand: Whiteout Staff/ }).click()
    const picker = page.getByRole('dialog', { name: 'Choose main hand' })
    await expect(picker.getByRole('combobox', { name: 'Sort by BiS rank' })).toBeVisible()
    // "Leave this slot empty" comes first, then the items.
    const names = (
      await picker
        .getByRole('list', { name: 'Items' })
        .getByRole('listitem')
        .evaluateAll((els) => els.map((el) => el.querySelector('button')?.textContent ?? ''))
    ).slice(1, 3)
    expect(names[0]).toMatch(/^Whiteout Staff/)
    expect(names[1]).toMatch(/^Mindfang/)
  })

  test('its filter chips, sort menu and clear-search buttons are 44 px targets', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Head: / }).click()
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await picker.getByLabel('Search items').fill('zzzz')
    await expect(picker.getByText('No items match “zzzz”.')).toBeVisible()
    const clear = picker.getByRole('button', { name: 'Clear search' })
    await expect(clear).toHaveCount(2)
    const controls = [
      picker.getByRole('radio', { name: 'Best in slot' }),
      picker.getByRole('radio', { name: 'All items' }),
      picker.getByRole('combobox', { name: /^Sort by / }),
      clear.first(),
      clear.last(),
    ]
    // Layout sizes, not bounding boxes: the dialog zooms in as it opens.
    for (const control of controls) {
      const { height, width, name } = await control.evaluate((el: HTMLElement) => ({
        height: el.offsetHeight,
        width: el.offsetWidth,
        name: el.textContent ?? '',
      }))
      expect(height, name).toBeGreaterThanOrEqual(44)
      expect(width, name).toBeGreaterThanOrEqual(44)
    }
    await clear.last().click()
    await expect(picker.getByLabel('Search items')).toHaveValue('')
    await expect(picker.getByLabel('Search items')).toBeFocused()
  })
})
