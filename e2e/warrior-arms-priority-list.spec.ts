import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Arms' Rotation tab as a priority list (decision D31, docs/ux.md "Rotation"; docs/classes/warrior.md
// §5.3 "The priority list"): the rows in the default order with the stance spec-wide above them, a
// row moved by the keyboard and by Move up and Move down, the order kept by a reload and a share link,
// and a run with it.

/** §5.3's rows in the list's default order. */
const DEFAULT_ORDER = [
  'prepull',
  'battleShout',
  'rend',
  'deathWish',
  'racial',
  'trinkets',
  'recklessness',
  'bloodrage',
  'executeSlam',
  'executeMortalStrike',
  'execute',
  'mortalStrike',
  'overpower',
  'slam',
  'spearingStrike',
  'whirlwind',
  'heroicStrike',
  'hamstring',
]
const COUNT = DEFAULT_ORDER.length

/** Arms' Rotation tab, from the spec switcher, as a visitor gets there. */
async function openArmsRotation(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
  await page.getByRole('group', { name: 'Warrior' }).getByRole('menuitem', { name: /Arms/ }).click()
  await expect(page.getByRole('button', { name: /Spec: Arms Warrior/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('list', { name: 'Priority list' })
}
/** The rows' ids in the list's order (by attribute: a sheet hides the list from the accessibility tree). */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const moved = (id: string, before: string) => {
  const out = DEFAULT_ORDER.filter((r) => r !== id)
  out.splice(out.indexOf(before), 0, id)
  return out
}
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]')

for (const width of [1280, 390]) {
  const phone = width < 1024
  test.describe(`Arms’ priority list at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('starts in the default order, the pre-pull pinned first and the stance above the list', async ({ page }) => {
      const list = await openArmsRotation(page)
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await expect(preset(page)).toHaveText('Default')
      await expect(list.locator('[data-apl-row="prepull"]').getByRole('button', { name: /^Move / })).toHaveCount(0)
      await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(COUNT - 1)
      // The stance is spec-wide, above the list, not a row.
      const tab = page.getByRole('tabpanel', { name: 'Rotation' })
      const stance = tab.getByRole('radiogroup', { name: 'Stance', exact: true })
      await expect(stance.getByRole('radio', { name: 'Battle', exact: true })).toBeChecked()
      expect((await stance.boundingBox())!.y).toBeLessThan((await list.boundingBox())!.y)
      // Row summaries read their settings; rows off by default say so.
      await expect(list.locator('[data-apl-row="hamstring"]')).toContainText('From 40 rage · not in the execute phase · while your strikes cool down')
      await expect(list.locator('[data-apl-row="slam"]')).toContainText('5 rage reserve · not in the execute phase · while Mortal Strike cools down')
      await expect(list.locator('[data-apl-row="whirlwind"]')).toContainText('Off')
      await expect(list.locator('[data-apl-row="heroicStrike"]')).toContainText('Off')
      // 44 px targets, and no horizontal scroll.
      const slam = list.locator('[data-apl-row="slam"]')
      for (const target of [
        slam.getByRole('button', { name: 'Move Slam, position 14' }),
        slam.getByRole('button', { name: 'Slam', exact: true }),
        slam.getByRole('switch', { name: 'Slam', exact: true }).locator('..'),
      ]) {
        const box = (await target.boundingBox())!
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('moves a row with the keyboard and with Move up and Move down', async ({ page }) => {
      const list = await openArmsRotation(page)
      // The keyboard: Slam's handle, up one, above Overpower.
      await list.getByRole('button', { name: /^Move Slam,/ }).focus()
      await page.keyboard.press('Space')
      await expect(liveRegion(page)).toContainText(new RegExp(`Slam is over position 14 of ${COUNT}|Picked up Slam`))
      await page.keyboard.press('ArrowUp')
      await expect(liveRegion(page)).toHaveText(`Slam is over position 13 of ${COUNT}.`)
      await page.keyboard.press('Space')
      await expect.poll(() => order(page)).toEqual(moved('slam', 'overpower'))
      await expect(preset(page)).toHaveText('Custom')

      // Move up and Move down in Hamstring's settings: beside the list, or in a sheet.
      await list.getByRole('button', { name: 'Hamstring filler', exact: true }).click()
      const settings = phone ? page.getByRole('dialog', { name: 'Hamstring filler' }) : page.getByRole('complementary', { name: 'Hamstring filler settings' })
      await expect(settings.getByRole('button', { name: 'Move down', exact: true })).toBeDisabled()
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      await expect(page.locator('[data-announcer]')).toHaveText(`Hamstring filler moved to position ${COUNT - 1} of ${COUNT}.`)
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      const expected = moved('slam', 'overpower').filter((id) => id !== 'hamstring')
      expected.splice(expected.indexOf('whirlwind'), 0, 'hamstring')
      expect(await order(page)).toEqual(expected)
      await settings.getByRole('button', { name: 'Move down', exact: true }).click()
      expected.splice(expected.indexOf('hamstring'), 1)
      expected.splice(expected.indexOf('heroicStrike'), 0, 'hamstring')
      expect(await order(page)).toEqual(expected)
      if (phone) await page.getByRole('button', { name: 'Close', exact: true }).click()
      // Reset order puts the list back.
      await page.getByRole('button', { name: 'Reset order' }).click()
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await expect(preset(page)).toHaveText('Default')
    })
  })
}

test.describe('Arms: a run, a share link and a reload', () => {
  test.use({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })

  test('simulates with a new order, and a share link and a reload keep it', async ({ page }) => {
    const list = await openArmsRotation(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const before = await results.getByRole('group', { name: 'DPS' }).innerText()

    // Hamstring to the top: at 40 rage it takes global cooldowns and rage Mortal Strike and Slam had.
    await list.getByRole('button', { name: 'Hamstring filler', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Hamstring filler settings' })
    for (let i = 0; i < COUNT - 2; i++) await settings.getByRole('button', { name: 'Move up', exact: true }).click()
    const newOrder = moved('hamstring', 'battleShout')
    expect(await order(page)).toEqual(newOrder)
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText('Setup changed')
    await results.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(results.getByRole('group', { name: 'DPS' })).not.toContainText('Setup changed', { timeout: 30_000 })
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    expect(await results.getByRole('group', { name: 'DPS' }).innerText()).not.toBe(before)

    // A reload keeps it.
    await page.reload()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await expect.poll(() => order(page)).toEqual(newOrder)

    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    // Back to the default here, then the link brings the order back.
    await page.getByRole('button', { name: 'Reset order' }).click()
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.getByRole('button', { name: /Spec: Arms Warrior/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await expect.poll(() => order(page)).toEqual(newOrder)
    await expect(preset(page)).toHaveText('Custom')
  })
})
