import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The rogues' Rotation tab as a priority list (decision D31, docs/classes/rogue.md §6 "The priority
// list"): each spec's rows in their default order, a row moved by the keyboard and by Move up in its
// settings, the order kept by a reload and a share link, and a run with it.

interface RogueSpec {
  name: 'Combat' | 'Assassination' | 'Subtlety'
  order: string[]
  /** A row the keyboard moves up one place, and the row it passes. */
  keyboard: { id: string; label: string; passes: string }
  /** A row Move up moves one place, and the row it passes. */
  button: { label: string; id: string; passes: string }
}

const SPECS: RogueSpec[] = [
  {
    name: 'Combat',
    order: ['racial', 'onUseItems', 'sliceAndDice', 'bladeFlurry', 'adrenalineRush', 'exposeArmor', 'rupture', 'eviscerate', 'sinisterStrike'],
    keyboard: { id: 'eviscerate', label: 'Eviscerate', passes: 'rupture' },
    button: { id: 'adrenalineRush', label: 'Adrenaline Rush', passes: 'bladeFlurry' },
  },
]

async function switchTo(page: Page, spec: RogueSpec['name']) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: new RegExp(spec) }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${spec} Rogue`) })).toBeVisible()
}
const openRotation = async (page: Page) => {
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('list', { name: 'Priority list' })
}
/** The rows' ids in the list's order (by attribute: a sheet hides the list from the accessibility tree). */
const rowOrder = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]')
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
const moved = (order: readonly string[], id: string, before: string) => {
  const out = order.filter((r) => r !== id)
  out.splice(out.indexOf(before), 0, id)
  return out
}

for (const spec of SPECS) {
  for (const width of [1280, 390]) {
    const phone = width < 1024
    test.describe(`the ${spec.name} rogue’s priority list at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      const openRow = async (page: Page, list: Locator, name: string) => {
        await list.getByRole('button', { name, exact: true }).click()
        return phone ? page.getByRole('dialog', { name }) : page.getByRole('complementary', { name: `${name} settings` })
      }

      test('starts in the default order; a row moves by the keyboard and by Move up, and a reload keeps it', async ({ page }) => {
        await switchTo(page, spec.name)
        const list = await openRotation(page)
        expect(await rowOrder(page)).toEqual(spec.order)
        await expect(preset(page)).toHaveText('Default')
        // Every row moves: nothing is pinned.
        await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(spec.order.length)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

        // The keyboard: pick up the row's handle, one place up, drop.
        const count = spec.order.length
        const from = spec.order.indexOf(spec.keyboard.id) + 1
        await list.getByRole('button', { name: new RegExp(`^Move ${spec.keyboard.label},`) }).focus()
        await page.keyboard.press('Space')
        await expect(liveRegion(page)).toContainText(new RegExp(`${spec.keyboard.label} is over position ${from} of ${count}|Picked up ${spec.keyboard.label}`))
        await page.keyboard.press('ArrowUp')
        await expect(liveRegion(page)).toHaveText(`${spec.keyboard.label} is over position ${from - 1} of ${count}.`)
        await page.keyboard.press('Space')
        const afterKeys = moved(spec.order, spec.keyboard.id, spec.keyboard.passes)
        await expect.poll(() => rowOrder(page)).toEqual(afterKeys)
        await expect(preset(page)).toHaveText('Custom')

        // Move up in the row's settings.
        const settings = await openRow(page, list, spec.button.label)
        await settings.getByRole('button', { name: 'Move up', exact: true }).click()
        const afterButton = moved(afterKeys, spec.button.id, spec.button.passes)
        expect(await rowOrder(page)).toEqual(afterButton)
        if (phone) await page.getByRole('button', { name: 'Close', exact: true }).click()

        await page.reload()
        await expect.poll(() => rowOrder(page)).toEqual(afterButton)
        await expect(preset(page)).toHaveText('Custom')
      })
    })
  }

  test.describe(`the ${spec.name} rogue’s run and share link`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })

    test('simulates with a new order, and a share link keeps it', async ({ page }) => {
      await switchTo(page, spec.name)
      const list = await openRotation(page)
      await list.getByRole('button', { name: spec.button.label, exact: true }).click()
      await page.getByRole('complementary', { name: `${spec.button.label} settings` }).getByRole('button', { name: 'Move up', exact: true }).click()
      const newOrder = moved(spec.order, spec.button.id, spec.button.passes)
      expect(await rowOrder(page)).toEqual(newOrder)
      const results = page.getByRole('complementary', { name: 'Results' })
      await results.getByRole('button', { name: 'Simulate', exact: true }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
      await expect(results.getByRole('group', { name: 'DPS' })).toContainText(/\d/)

      await page.getByRole('button', { name: /Share/ }).click()
      await expect(page.getByText('Link copied')).toBeVisible()
      const link = await page.evaluate(() => navigator.clipboard.readText())
      await page.getByRole('button', { name: 'Reset order' }).click()
      expect(await rowOrder(page)).toEqual(spec.order)
      await page.goto('about:blank')
      await page.goto(link)
      await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${spec.name} Rogue`) })).toBeVisible()
      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      await expect.poll(() => rowOrder(page)).toEqual(newOrder)
      await expect(preset(page)).toHaveText('Custom')
    })
  })
}
