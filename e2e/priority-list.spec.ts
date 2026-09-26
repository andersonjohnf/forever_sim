import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Rotation tab's priority list (decision D31, docs/ux.md "Rotation"), Fury's first: a row
// moves by its handle (a pointer or the keyboard) or with Move up and Move down in its settings,
// which open beside the list on desktop and in a sheet on a phone; its switch turns it off; the
// preset picker says "Custom" once you've changed it; a run and a share link keep the order.

const DEFAULT_ORDER = [
  'prepull',
  'battleShout',
  'deathWish',
  'racial',
  'trinkets',
  'recklessness',
  'bloodrage',
  'executeBloodthirst',
  'execute',
  'bloodthirst',
  'whirlwind',
  'overpower',
  'rend',
  'heroicStrike',
  'hamstring',
  'berserkerRage',
  'slam',
]

const openRotation = async (page: Page) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('list', { name: 'Priority list' })
}
/** The rows' ids in the list's order (by attribute: a sheet hides the list from the accessibility tree). */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]')
const moved = (id: string, before: string) => {
  const out = DEFAULT_ORDER.filter((r) => r !== id)
  out.splice(out.indexOf(before), 0, id)
  return out
}
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
const announcement = (page: Page) => page.locator('[data-announcer]')

for (const width of [1280, 390]) {
  const phone = width < 1024
  test.describe(`the priority list at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    /** A row's settings: the panel beside the list, or the sheet. */
    const openRow = async (page: Page, list: Locator, name: string) => {
      await list.getByRole('button', { name, exact: true }).click()
      return phone ? page.getByRole('dialog', { name }) : page.getByRole('complementary', { name: `${name} settings` })
    }
    const closeRow = async (page: Page) => {
      if (!phone) return
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }

    test('starts in the default order, the pre-pull pinned first, with 44 px targets', async ({ page }) => {
      const list = await openRotation(page)
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await expect(preset(page)).toHaveText('Default')
      await expect(page.getByRole('button', { name: 'Reset order' })).toBeDisabled()
      // The pinned row has a lock and no handle; every other row a handle.
      const prepull = list.locator('[data-apl-row="prepull"]')
      await expect(prepull.getByText('Fixed in place:')).toHaveCount(1)
      await expect(prepull.getByRole('button', { name: /^Move / })).toHaveCount(0)
      await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(DEFAULT_ORDER.length - 1)
      const whirlwind = list.locator('[data-apl-row="whirlwind"]')
      await expect(whirlwind).toContainText('Bloodthirst 0.5 s away')
      // The Rend dance (W4), below the Overpower dance, on by default.
      await expect(list.locator('[data-apl-row="rend"]')).toContainText('Up to 25 rage · not in the execute phase')
      await expect(list.getByRole('switch', { name: 'Rend (stance dance)', exact: true })).toBeChecked()
      for (const target of [
        whirlwind.getByRole('button', { name: 'Move Whirlwind, position 11' }),
        whirlwind.getByRole('button', { name: 'Whirlwind', exact: true }),
        whirlwind.getByRole('switch', { name: 'Whirlwind', exact: true }).locator('..'),
      ]) {
        const box = (await target.boundingBox())!
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      }
      // No horizontal scroll.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('reorders by dragging a row’s handle, and never past the pinned pre-pull', async ({ page }) => {
      const list = await openRotation(page)
      const drag = async (from: Locator, to: Locator) => {
        await from.scrollIntoViewIfNeeded()
        const a = (await from.boundingBox())!
        const b = (await to.boundingBox())!
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
        await page.mouse.down()
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 10, { steps: 4 })
        await expect(liveRegion(page)).toContainText(/Picked up|is over/)
        await page.mouse.move(a.x + a.width / 2, b.y + b.height / 2, { steps: 12 })
        await page.waitForTimeout(100)
        await page.mouse.up()
        // dnd-kit swallows clicks for 50 ms after a drag, so the drop's own click doesn't select the row.
        await page.waitForTimeout(100)
      }
      await drag(list.getByRole('button', { name: /^Move Whirlwind/ }), list.locator('[data-apl-row="bloodthirst"]'))
      await expect.poll(() => order(page)).toEqual(moved('whirlwind', 'bloodthirst'))
      await expect(preset(page)).toHaveText('Custom')
      await expect(page.getByRole('button', { name: 'Reset order' })).toBeEnabled()
      // Onto the pre-pull: Battle Shout stays second.
      await drag(list.getByRole('button', { name: /^Move Battle Shout/ }), list.locator('[data-apl-row="prepull"]'))
      expect(await order(page)).toEqual(moved('whirlwind', 'bloodthirst'))
      // Reset order puts it back and moves focus to the preset picker.
      await page.getByRole('button', { name: 'Reset order' }).click()
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await expect(preset(page)).toBeFocused()
      await expect(preset(page)).toHaveText('Default')
      await expect(announcement(page)).toHaveText('Priority list back in its default order.')
    })

    test('reorders from the keyboard with a row’s handle, and says where it went', async ({ page }) => {
      const list = await openRotation(page)
      const handle = list.getByRole('button', { name: /^Move Whirlwind/ })
      await handle.focus()
      await page.keyboard.press('Space')
      await expect(liveRegion(page)).toContainText(/Whirlwind is over position 11 of 17|Picked up Whirlwind/)
      await page.keyboard.press('ArrowUp')
      await expect(liveRegion(page)).toHaveText('Whirlwind is over position 10 of 17.')
      await page.keyboard.press('Space')
      await expect.poll(() => order(page)).toEqual(moved('whirlwind', 'bloodthirst'))
      await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText('Whirlwind dropped at position 10 of 17.')
      // The handle keeps focus, and its name says its new place.
      await expect(list.getByRole('button', { name: 'Move Whirlwind, position 10' })).toBeFocused()
      // Escape cancels a move.
      await page.keyboard.press('Space')
      await expect(liveRegion(page)).toContainText(/Whirlwind is over position 10 of 17|Picked up Whirlwind/)
      await page.keyboard.press('ArrowDown')
      await expect(liveRegion(page)).toHaveText('Whirlwind is over position 11 of 17.')
      await page.keyboard.press('Escape')
      await expect(liveRegion(page)).toHaveText('Moving Whirlwind was cancelled. It’s still at position 10 of 17.')
      await expect.poll(() => order(page)).toEqual(moved('whirlwind', 'bloodthirst'))
    })

    test('moves a row with an arrow key pressed at once after the pick-up', async ({ page }) => {
      // The arrow keys work from the pick-up on (keyboard-sensor.ts): no pause between Space and
      // the arrow, here to the first place a row can go, just below the pinned pre-pull.
      const list = await openRotation(page)
      await list.getByRole('button', { name: 'Move Death Wish, position 3', exact: true }).focus()
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowUp')
      await expect(liveRegion(page)).toHaveText('Death Wish is over position 2 of 17.')
      await page.keyboard.press('Space')
      await expect.poll(() => order(page)).toEqual(moved('deathWish', 'battleShout'))
      await expect(liveRegion(page)).toHaveText('Death Wish dropped at position 2 of 17.')
    })

    test('reorders with Move up and Move down in a row’s settings, which stop at the ends', async ({ page }) => {
      const list = await openRotation(page)
      let settings = await openRow(page, list, 'Heroic Strike')
      await expect(settings.getByText(phone ? 'At position 14 of 17' : 'Position 14 of 17', { exact: true })).toBeVisible()
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      await expect(announcement(page)).toHaveText('Heroic Strike moved to position 13 of 17.')
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      await expect(settings.getByRole('button', { name: 'Move up', exact: true })).toBeFocused()
      expect(await order(page)).toEqual(moved('heroicStrike', 'overpower'))
      await settings.getByRole('button', { name: 'Move down', exact: true }).click()
      expect(await order(page)).toEqual(moved('heroicStrike', 'rend'))
      await closeRow(page)

      // Battle Shout can't pass the pinned pre-pull, and Slam is last.
      settings = await openRow(page, list, 'Battle Shout')
      await expect(settings.getByRole('button', { name: 'Move up', exact: true })).toBeDisabled()
      await closeRow(page)
      settings = await openRow(page, list, 'Slam')
      await expect(settings.getByRole('button', { name: 'Move down', exact: true })).toBeDisabled()
      // Moving Slam down to the end hands focus to Move up.
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      await settings.getByRole('button', { name: 'Move down', exact: true }).click()
      await expect(settings.getByRole('button', { name: 'Move up', exact: true })).toBeFocused()
      await closeRow(page)
      // The pre-pull's settings have no moves.
      settings = await openRow(page, list, 'Before the pull')
      await expect(settings.getByText('Fixed at position 1 of 17', { exact: true }).first()).toBeVisible()
      await expect(settings.getByRole('button', { name: /^Move (up|down)$/ })).toHaveCount(0)
      await closeRow(page)
      if (phone) await expect(list.getByRole('button', { name: 'Before the pull', exact: true })).toBeFocused()
    })

    test('turns a row off with its switch, and changes a row’s setting in its settings; the preset says Custom until you pick Default', async ({ page }) => {
      const list = await openRotation(page)
      const hamstring = list.locator('[data-apl-row="hamstring"]')
      await expect(hamstring).toContainText('Off')
      await expect(hamstring).toHaveAttribute('data-inactive')
      await list.getByRole('switch', { name: 'Hamstring filler', exact: true }).click()
      await expect(hamstring).toContainText('From 60 rage · not in the execute phase · while Bloodthirst and Whirlwind cool down')
      await expect(hamstring).not.toHaveAttribute('data-inactive')
      // With Bloodthirst off, Bloodthirst in the execute phase can't do anything, and says why.
      const executeBt = list.locator('[data-apl-row="executeBloodthirst"]')
      await expect(executeBt).not.toHaveAttribute('data-inactive')
      await list.getByRole('switch', { name: 'Bloodthirst', exact: true }).click()
      await expect(executeBt).toHaveAttribute('data-inactive')
      await expect(executeBt).toContainText('Not used: Bloodthirst is off.')
      await expect(list.getByRole('switch', { name: 'Bloodthirst in the execute phase', exact: true })).toBeChecked()
      await list.getByRole('switch', { name: 'Bloodthirst', exact: true }).click()
      await expect(executeBt).toContainText('From 2,434 AP')
      await expect(preset(page)).toHaveText('Custom')

      const settings = await openRow(page, list, 'Heroic Strike')
      const threshold = settings.getByRole('textbox', { name: 'Heroic Strike from', exact: true })
      await threshold.fill('55')
      await threshold.press('Enter')
      await expect(settings.getByText('Default: 40 rage')).toBeVisible()
      await closeRow(page)
      const heroicStrike = list.locator('[data-apl-row="heroicStrike"]')
      await expect(heroicStrike).toContainText('From 55 rage · cancel below 20 rage')
      // The row is marked changed, for sight and for a screen reader.
      await expect(list.getByRole('button', { name: 'Heroic Strike', exact: true })).toHaveAccessibleDescription('Changed. From 55 rage · cancel below 20 rage')

      // Default puts back the list's settings, and leaves the consumables as they are.
      await page.getByRole('tabpanel', { name: 'Rotation' }).getByRole('switch', { name: 'Mighty Rage Potion', exact: true }).click()
      await preset(page).click()
      await page.getByRole('option', { name: 'Default', exact: true }).click()
      await expect(preset(page)).toHaveText('Default')
      await expect(hamstring).toContainText('Off')
      await expect(heroicStrike).toContainText('From 40 rage')
      await expect(page.getByRole('switch', { name: 'Mighty Rage Potion', exact: true })).not.toBeChecked()
      await expect(announcement(page)).toHaveText('Rotation set to Default.')
    })
  })
}

test.describe('the desktop panel', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('from the keyboard alone: selecting a row moves focus to its settings, and Back to list or Escape returns it', async ({ page }) => {
    await openRotation(page)
    const heading = page.locator('#apl-settings-heading')
    const row = page.locator('#apl-whirlwind-select')
    // From Whirlwind's handle, Tab reaches the row's button; Enter selects it.
    await page.getByRole('button', { name: /^Move Whirlwind/ }).focus()
    await page.keyboard.press('Tab')
    await expect(row).toBeFocused()
    await page.keyboard.press('Enter')
    const panel = page.getByRole('complementary', { name: 'Whirlwind settings' })
    await expect(heading).toBeFocused()
    await expect(heading).toHaveText('Whirlwind')
    // The panel's controls come next, not the rest of the list.
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('button', { name: 'Move up', exact: true })).toBeFocused()
    // Back to list sits just before the heading, and returns focus to the row.
    await page.keyboard.press('Shift+Tab')
    await expect(panel.getByRole('button', { name: 'Back to list', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(row).toBeFocused()
    // Escape from a setting in the panel does too, and the row stays selected.
    await page.keyboard.press('Enter')
    await expect(heading).toBeFocused()
    await panel.getByRole('textbox', { name: 'Whirlwind rage reserve', exact: true }).focus()
    await page.keyboard.press('Escape')
    await expect(row).toBeFocused()
    await expect(page.locator('[data-apl-row="whirlwind"]')).toHaveAttribute('data-selected')
    // The panel's switch has a name of its own, so it isn't a second "Whirlwind" switch.
    await expect(panel.getByRole('switch', { name: 'Use Whirlwind', exact: true })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Whirlwind', exact: true })).toHaveCount(1)
  })

  for (const { width, height } of [
    { width: 1024, height: 600 },
    // From 1440 px, e2e/wide-rotation.spec.ts: inline under the row to 1,850 px, a panel from there.
    { width: 1280, height: 800 },
  ]) {
    test(`reaches the window's bottom at ${width}×${height}, and marks settings that scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      const list = await openRotation(page)
      await list.getByRole('button', { name: 'Heroic Strike', exact: true }).click()
      const panel = page.getByRole('complementary', { name: 'Heroic Strike settings' })
      // Scrolled so the list's top is past the sticky tabs: the panel sticks under them.
      await list.evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 40))
      const box = (await panel.boundingBox())!
      // Within the window, and either whole or marked where more scrolls.
      expect(box.y + box.height).toBeLessThanOrEqual(height)
      const scrolls = await panel.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
      await expect(panel).toHaveAttribute('data-fade', scrolls ? 'bottom' : 'none')
      if (scrolls) {
        // It uses the height it has: from under the sticky tabs to 1rem above the window's bottom.
        const stickyTop = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')))
        expect(box.height).toBeGreaterThanOrEqual(height - stickyTop - 32 - 1)
        await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight))
        await expect(panel).toHaveAttribute('data-fade', 'top')
      }
    })
  }
})

test.describe('a run and a share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('simulate with a new order; the result goes stale when the order changes, and a share link keeps it', async ({ page }) => {
    const list = await openRotation(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const before = await results.getByRole('group', { name: 'DPS' }).innerText()

    // Heroic Strike first: it's off the GCD, but spends the rage before Bloodthirst can.
    await list.getByRole('button', { name: 'Heroic Strike', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Heroic Strike settings' })
    for (let i = 0; i < 12; i++) await settings.getByRole('button', { name: 'Move up', exact: true }).click()
    const newOrder = moved('heroicStrike', 'battleShout')
    expect(await order(page)).toEqual(newOrder)
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText('Setup changed')
    await results.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(results.getByRole('group', { name: 'DPS' })).not.toContainText('Setup changed', { timeout: 30_000 })
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    expect(await results.getByRole('group', { name: 'DPS' }).innerText()).not.toBe(before)

    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    // Back to the default here, then the link brings the order back.
    await page.getByRole('button', { name: 'Reset order' }).click()
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    await page.goto('about:blank')
    await page.goto(link)
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await expect.poll(() => order(page)).toEqual(newOrder)
    await expect(preset(page)).toHaveText('Custom')
    // And a reload keeps it.
    await page.reload()
    await expect.poll(() => order(page)).toEqual(newOrder)
  })
})
