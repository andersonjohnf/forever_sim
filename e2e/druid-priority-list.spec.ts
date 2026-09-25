import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The druid's DPS specs on the Rotation tab's priority list (decision D31, docs/classes/druid.md
// §6.2 "The cat's priority list"): the rows in their default order, a row moved from the keyboard
// with its handle and with Move up and Move down in its settings, the order kept by a reload and a
// share link, and a run with it.

interface Spec {
  name: string
  menu: RegExp
  order: string[]
  /** A row to move up one place from the keyboard, and the row it passes. */
  keyboard: { label: string; id: string; passes: string }
  /** A row to move up one place with Move up. */
  button: { label: string; id: string }
  /** A row the default setup leaves unused, dimmed with why. */
  unused: { id: string; text: string }
}

const SPECS: Spec[] = [
  {
    name: 'Feral (Cat)',
    menu: /Feral \(Cat\)/,
    order: ['berserk', 'racial', 'onUseItems', 'tigersFury', 'faerieFire', 'clearcasting', 'rip', 'ferociousBite', 'rake', 'shred', 'claw'],
    keyboard: { label: 'Ferocious Bite', id: 'ferociousBite', passes: 'rip' },
    button: { label: 'Rake', id: 'rake' },
    // Off, and its "only when nothing else bleeds" meets the default raid's warriors.
    unused: { id: 'rake', text: 'Not used in this raid: its warriors keep the boss bleeding.' },
  },
]

const openRotation = async (page: Page, spec: Spec) => {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: spec.menu }).click()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('list', { name: 'Priority list' })
}
/** The rows' ids in the list's order (by attribute: a sheet hides the list from the accessibility tree). */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]')
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
/** The order with `id` moved to just before `before`. */
const moved = (list: readonly string[], id: string, before: string) => {
  const out = list.filter((r) => r !== id)
  out.splice(out.indexOf(before), 0, id)
  return out
}
/** The order with `id` moved up one place. */
const movedUp = (list: readonly string[], id: string) => moved(list, id, list[list.indexOf(id) - 1])

for (const spec of SPECS) {
  const count = spec.order.length
  for (const width of [1280, 390]) {
    const phone = width < 1024
    test.describe(`${spec.name}’s priority list at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('shows its rows in the default order, each with a handle and 44 px targets, and no sideways scroll', async ({ page }) => {
        const list = await openRotation(page, spec)
        expect(await order(page)).toEqual(spec.order)
        await expect(preset(page)).toHaveText('Default')
        // Nothing is pinned: every row has a handle.
        await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(count)
        const unused = list.locator(`[data-apl-row="${spec.unused.id}"]`)
        await expect(unused).toContainText(spec.unused.text)
        await expect(unused).toHaveAttribute('data-inactive')
        const row = list.locator(`[data-apl-row="${spec.keyboard.id}"]`)
        for (const target of [row.getByRole('button', { name: /^Move / }), row.getByRole('button', { name: spec.keyboard.label, exact: true })]) {
          const box = (await target.boundingBox())!
          expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      })

      test('moves a row from the keyboard with its handle, and with Move up in its settings', async ({ page }) => {
        const list = await openRotation(page, spec)
        const at = spec.order.indexOf(spec.keyboard.id) + 1
        const handle = list.getByRole('button', { name: `Move ${spec.keyboard.label}, position ${at}` })
        await handle.focus()
        await page.keyboard.press('Space')
        await expect(liveRegion(page)).toContainText(new RegExp(`${spec.keyboard.label} is over position ${at} of ${count}|Picked up ${spec.keyboard.label}`))
        await page.keyboard.press('ArrowUp')
        await expect(liveRegion(page)).toHaveText(`${spec.keyboard.label} is over position ${at - 1} of ${count}.`)
        await page.keyboard.press('Space')
        const first = moved(spec.order, spec.keyboard.id, spec.keyboard.passes)
        await expect.poll(() => order(page)).toEqual(first)
        await expect(preset(page)).toHaveText('Custom')

        // Move up in the row's settings, beside the list or in a sheet.
        await list.getByRole('button', { name: spec.button.label, exact: true }).click()
        const settings = phone ? page.getByRole('dialog', { name: spec.button.label }) : page.getByRole('complementary', { name: `${spec.button.label} settings` })
        await settings.getByRole('button', { name: 'Move up', exact: true }).click()
        await expect.poll(() => order(page)).toEqual(movedUp(first, spec.button.id))
        if (phone) await page.getByRole('button', { name: 'Close', exact: true }).click()
        // Reset order puts it back.
        await page.getByRole('button', { name: 'Reset order' }).click()
        expect(await order(page)).toEqual(spec.order)
        await expect(preset(page)).toHaveText('Default')
      })
    })
  }

  test.describe(`${spec.name}’s order, a run and a share link`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })

    test('runs with a moved order, and keeps it through a share link and a reload', async ({ page }) => {
      const list = await openRotation(page, spec)
      await list.getByRole('button', { name: spec.button.label, exact: true }).click()
      await page.getByRole('complementary', { name: `${spec.button.label} settings` }).getByRole('button', { name: 'Move up', exact: true }).click()
      const newOrder = movedUp(spec.order, spec.button.id)
      await expect.poll(() => order(page)).toEqual(newOrder)

      const results = page.getByRole('complementary', { name: 'Results' })
      await results.getByRole('button', { name: 'Simulate', exact: true }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
      await expect(results.getByRole('group', { name: 'DPS' })).not.toContainText('Setup changed')
      await expect(results.getByRole('group', { name: 'DPS' })).toContainText(/\d/)

      await page.getByRole('button', { name: /Share/ }).click()
      await expect(page.getByText('Link copied')).toBeVisible()
      const link = await page.evaluate(() => navigator.clipboard.readText())
      await page.getByRole('button', { name: 'Reset order' }).click()
      expect(await order(page)).toEqual(spec.order)
      await page.goto('about:blank')
      await page.goto(link)
      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      await expect.poll(() => order(page)).toEqual(newOrder)
      await expect(preset(page)).toHaveText('Custom')
      await page.reload()
      await expect.poll(() => order(page)).toEqual(newOrder)
    })
  })
}
