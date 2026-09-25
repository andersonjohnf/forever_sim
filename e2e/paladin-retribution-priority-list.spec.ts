import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Retribution's Rotation tab as a priority list (decision D31; docs/classes/paladin.md "The priority
// list (A2)"): the rows in paladin.md's order, the opener pinned first; a row moves by its handle from
// the keyboard or with Move up and Move down in its settings; the order survives a reload and a share
// link; a moved order runs to a result; and the lower of the two Consecration rows says when it's
// never used.

const DEFAULT_ORDER = ['prepull', 'seal', 'judgement', 'hammerOfWrath', 'holyStrike', 'exorcism', 'consecration', 'consecrationRank1']

async function openRetributionRotation(page: Page): Promise<Locator> {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: Fury Warrior/ }).click()
  await page.getByRole('menuitem', { name: /Retribution/ }).click()
  await expect(page.getByRole('button', { name: /^Spec: Retribution Paladin/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('list', { name: 'Priority list' })
}
/** The rows' ids in the list's order (by attribute: a sheet hides the list from the accessibility tree). */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]')
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
const moved = (id: string, before: string) => {
  const out = DEFAULT_ORDER.filter((r) => r !== id)
  out.splice(out.indexOf(before), 0, id)
  return out
}

for (const width of [1280, 390]) {
  const phone = width < 1024
  test.describe(`Retribution’s priority list at ${width} px`, () => {
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

    test('shows the rows in paladin.md’s order, the opener pinned first, with readable summaries and 44 px targets', async ({ page }) => {
      const list = await openRetributionRotation(page)
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await expect(preset(page)).toHaveText('Default')
      await expect(page.getByRole('button', { name: 'Reset order' })).toBeDisabled()
      const row = (id: string) => list.locator(`[data-apl-row="${id}"]`)
      await expect(row('prepull').getByText('Fixed in place:')).toHaveCount(1)
      await expect(row('prepull')).toContainText('Seal of the Crusader, judged at the pull')
      await expect(row('seal')).toContainText('Seal of Command · again with 1.5 s left')
      await expect(row('hammerOfWrath')).toContainText('Execute phase')
      await expect(row('consecration')).toContainText('Rank 5 · from 20% mana')
      await expect(row('consecrationRank1')).toContainText('From 10% mana')
      await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(DEFAULT_ORDER.length - 1)
      for (const target of [
        list.getByRole('button', { name: 'Move Holy Strike, position 5' }),
        list.getByRole('button', { name: 'Holy Strike', exact: true }),
        list.getByRole('switch', { name: 'Holy Strike', exact: true }).locator('..'),
      ]) {
        const box = (await target.boundingBox())!
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('moves a row from the keyboard with its handle, and with Move up and Move down, never past the opener', async ({ page }) => {
      const list = await openRetributionRotation(page)
      const handle = list.getByRole('button', { name: /^Move Consecration, position/ })
      await handle.focus()
      await page.keyboard.press('Space')
      await expect(liveRegion(page)).toContainText(/Consecration is over position 7 of 8|Picked up Consecration/)
      await page.keyboard.press('ArrowUp')
      await expect(liveRegion(page)).toHaveText('Consecration is over position 6 of 8.')
      await page.keyboard.press('ArrowUp')
      await expect(liveRegion(page)).toHaveText('Consecration is over position 5 of 8.')
      await page.keyboard.press('Space')
      await expect.poll(() => order(page)).toEqual(moved('consecration', 'holyStrike'))
      await expect(preset(page)).toHaveText('Custom')

      // Move up and Move down in Holy Strike's settings; the seal can't pass the pinned opener.
      let settings = await openRow(page, list, 'Holy Strike')
      await settings.getByRole('button', { name: 'Move down', exact: true }).click()
      expect(await order(page)).toEqual(['prepull', 'seal', 'judgement', 'hammerOfWrath', 'consecration', 'exorcism', 'holyStrike', 'consecrationRank1'])
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      expect(await order(page)).toEqual(['prepull', 'seal', 'judgement', 'hammerOfWrath', 'holyStrike', 'consecration', 'exorcism', 'consecrationRank1'])
      await closeRow(page)
      settings = await openRow(page, list, 'Seal')
      await expect(settings.getByRole('button', { name: 'Move up', exact: true })).toBeDisabled()
      await closeRow(page)
      settings = await openRow(page, list, 'Before the pull')
      await expect(settings.getByRole('button', { name: /^Move (up|down)$/ })).toHaveCount(0)
      await closeRow(page)

      // Reset order puts it back.
      await page.getByRole('button', { name: 'Reset order' }).click()
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await expect(preset(page)).toHaveText('Default')
    })

    test('turns a row off with its switch, and says when the lower Consecration row never has the shared cooldown', async ({ page }) => {
      const list = await openRetributionRotation(page)
      const holyStrike = list.locator('[data-apl-row="holyStrike"]')
      await list.getByRole('switch', { name: 'Holy Strike', exact: true }).click()
      await expect(holyStrike).toContainText('Off')
      await expect(holyStrike).toHaveAttribute('data-inactive')
      await list.getByRole('switch', { name: 'Holy Strike', exact: true }).click()
      await expect(holyStrike).not.toHaveAttribute('data-inactive')
      // Rank 1 above rank 5: rank 5, from more mana, is never cast, and says so.
      const settings = await openRow(page, list, 'Consecration (Rank 1)')
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      await closeRow(page)
      expect(await order(page)).toEqual(moved('consecrationRank1', 'consecration'))
      await expect(list.locator('[data-apl-row="consecration"]')).toContainText('Not used: Consecration (Rank 1), above it, takes the cooldown they share')
    })
  })
}

test.describe('Retribution’s order in a run, a reload and a share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('runs with a moved order, and a reload and a share link keep it', async ({ page }) => {
    const list = await openRetributionRotation(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const before = await results.getByRole('group', { name: 'DPS' }).innerText()

    // Consecration above Holy Strike: its own mana threshold still holds.
    await list.getByRole('button', { name: 'Consecration', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Consecration settings' })
    for (let i = 0; i < 2; i++) await settings.getByRole('button', { name: 'Move up', exact: true }).click()
    const newOrder = moved('consecration', 'holyStrike')
    expect(await order(page)).toEqual(newOrder)
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText('Setup changed')
    await results.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(results.getByRole('group', { name: 'DPS' })).not.toContainText('Setup changed', { timeout: 30_000 })
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    expect(await results.getByRole('group', { name: 'DPS' }).innerText()).not.toBe(before)
    await expect(results.getByRole('region', { name: 'Damage by ability' }).getByText('Consecration', { exact: true })).toBeVisible()

    // A reload keeps it.
    await page.reload()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await expect.poll(() => order(page)).toEqual(newOrder)
    await expect(preset(page)).toHaveText('Custom')

    // A share link brings it back after Reset order here.
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await page.getByRole('button', { name: 'Reset order' }).click()
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.getByRole('button', { name: /^Spec: Retribution Paladin/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await expect.poll(() => order(page)).toEqual(newOrder)
    await expect(preset(page)).toHaveText('Custom')
  })
})
