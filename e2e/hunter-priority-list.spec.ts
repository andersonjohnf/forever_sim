import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The hunters' Rotation tab as a priority list (decision D31; docs/classes/hunter.md §8.3), for each
// of Marksmanship, Beast Mastery and Survival: the rows in their default order with the pre-pull
// pinned first, a row moved by keyboard and by the Move buttons, a result that runs with the new
// order, and the order kept through a reload and a share link; on a phone, a row moved in its sheet.

const DEFAULT_ORDER = ['prepull', 'racial', 'trinkets', 'rapidFire', 'bestialWrath', 'huntersMark', 'sharedShot', 'arcaneShot', 'serpentSting', 'sniperShot']

const SPECS = [
  { name: 'Marksmanship', item: /Marksmanship/, button: /^Spec: Marksmanship Hunter/ },
  { name: 'Beast Mastery', item: /Beast/, button: /^Spec: Beast\sMastery Hunter/ },
  { name: 'Survival', item: /Survival/, button: /^Spec: Survival Hunter/ },
]

/** A value with its ± 95% CI in the headline, e.g. "485.1± 1.0". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

async function openRotation(page: Page, spec: (typeof SPECS)[number]) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Hunter' }).getByRole('menuitem', { name: spec.item }).click()
  await expect(page.getByRole('button', { name: spec.button })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('list', { name: 'Priority list' })
}
/** The rows' ids in the list's order (by attribute: a sheet hides the list from the accessibility tree). */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]')
const announcement = (page: Page) => page.locator('[data-announcer]')
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
/** `from` with `id` moved to just before `before`, or last. */
const moved = (from: readonly string[], id: string, before?: string) => {
  const out = from.filter((r) => r !== id)
  out.splice(before === undefined ? out.length : out.indexOf(before), 0, id)
  return out
}

test.describe('the hunters’ priority lists at 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })

  for (const spec of SPECS) {
    test(`${spec.name}: the default order, a move by keyboard and by Move down, a run, a reload and a share link`, async ({ page }) => {
      const list = await openRotation(page, spec)
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await expect(preset(page)).toHaveText('Default')
      // The pre-pull is pinned: a lock and no handle; every other row has one.
      await expect(list.locator('[data-apl-row="prepull"]')).toContainText('Aspect of the Hawk')
      await expect(list.locator('[data-apl-row="prepull"]').getByRole('button', { name: /^Move / })).toHaveCount(0)
      await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(DEFAULT_ORDER.length - 1)

      // Serpent Sting up one, from the keyboard: above Arcane Shot.
      await list.getByRole('button', { name: /^Move Serpent Sting/ }).focus()
      await page.keyboard.press('Space')
      await expect(liveRegion(page)).toContainText(/Serpent Sting is over position 9 of 10|Picked up Serpent Sting/)
      await page.keyboard.press('ArrowUp')
      await expect(liveRegion(page)).toHaveText('Serpent Sting is over position 8 of 10.')
      await page.keyboard.press('Space')
      const byKeyboard = moved(DEFAULT_ORDER, 'serpentSting', 'arcaneShot')
      await expect.poll(() => order(page)).toEqual(byKeyboard)
      await expect(liveRegion(page)).toHaveText('Serpent Sting dropped at position 8 of 10.')
      await expect(preset(page)).toHaveText('Custom')

      // Hunter's Mark down one with its Move down button: below the shared shot.
      await list.getByRole('button', { name: 'Hunter’s Mark', exact: true }).click()
      const settings = page.getByRole('complementary', { name: 'Hunter’s Mark settings' })
      await expect(settings.getByText('Position 6 of 10', { exact: true })).toBeVisible()
      await settings.getByRole('button', { name: 'Move down', exact: true }).click()
      await expect(announcement(page)).toHaveText('Hunter’s Mark moved to position 7 of 10.')
      const newOrder = moved(byKeyboard, 'huntersMark', 'serpentSting')
      expect(await order(page)).toEqual(newOrder)

      // A run with the new order.
      const results = page.getByRole('complementary', { name: 'Results' })
      await results.getByRole('button', { name: 'Simulate', exact: true }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
      await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)

      // A reload keeps the order.
      await page.reload()
      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      await expect.poll(() => order(page)).toEqual(newOrder)

      // A share link carries it: back to the default here, then the link brings it back.
      await page.getByRole('button', { name: 'Share', exact: true }).click()
      await expect(page.getByText('Link copied')).toBeVisible()
      const link = await page.evaluate(() => navigator.clipboard.readText())
      await page.getByRole('button', { name: 'Reset order' }).click()
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await page.goto('about:blank')
      await page.goto(link)
      await expect(page.getByText('Loaded a shared setup')).toBeVisible()
      await expect(page.getByRole('button', { name: spec.button })).toBeVisible()
      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      await expect.poll(() => order(page)).toEqual(newOrder)
      await expect(preset(page)).toHaveText('Custom')
    })
  }
})

test.describe('a hunter’s priority list on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('Beast Mastery: a row moves up in its sheet, the shared shot’s choice is there, 44 px targets and no sideways scroll', async ({ page }) => {
    const list = await openRotation(page, SPECS[1])
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    const arcane = list.locator('[data-apl-row="arcaneShot"]')
    for (const target of [arcane.getByRole('button', { name: /^Move Arcane Shot/ }), arcane.getByRole('button', { name: 'Arcane Shot', exact: true })]) {
      const box = (await target.boundingBox())!
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    }
    await list.getByRole('button', { name: 'Arcane Shot', exact: true }).click()
    let sheet = page.getByRole('dialog', { name: 'Arcane Shot' })
    await expect(sheet.getByText('At position 8 of 10', { exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: 'Move up', exact: true }).click()
    await expect(announcement(page)).toHaveText('Arcane Shot moved to position 7 of 10.')
    expect(await order(page)).toEqual(moved(DEFAULT_ORDER, 'arcaneShot', 'sharedShot'))
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Beast Mastery's shot on the shared cooldown is Multi-Shot, waiting for Auto Shot.
    await expect(list.locator('[data-apl-row="sharedShot"]')).toContainText('Multi-Shot · between Auto Shots')
    await list.getByRole('button', { name: 'Aimed Shot or Multi-Shot', exact: true }).click()
    sheet = page.getByRole('dialog', { name: 'Aimed Shot or Multi-Shot' })
    await expect(sheet.getByRole('radio', { name: 'Multi-Shot', exact: true })).toBeChecked()
    await expect(sheet.getByRole('switch', { name: 'Wait for Auto Shot', exact: true })).toBeChecked()
    // At Neither there's no shot to wait for, so the row says just that, not "between Auto Shots".
    await sheet.getByRole('radio', { name: 'Neither', exact: true }).click()
    // Its "Wait for Auto Shot" does nothing then: dimmed with a note (docs/ux.md "Rotation").
    await expect(sheet.getByRole('switch', { name: 'Wait for Auto Shot', exact: true })).toHaveAccessibleDescription(/Not used: at Neither there’s no shot to cast between Auto Shots/)
    await sheet.getByRole('radio', { name: 'Multi-Shot', exact: true }).click()
    await expect(sheet.getByRole('switch', { name: 'Wait for Auto Shot', exact: true })).not.toHaveAccessibleDescription(/Not used/)
    await sheet.getByRole('radio', { name: 'Neither', exact: true }).click()
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(list.locator('#apl-sharedShot-summary')).toHaveText('Neither')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
