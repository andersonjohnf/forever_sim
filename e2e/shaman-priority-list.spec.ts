import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The shaman's Rotation tabs as priority lists (decision D31; docs/classes/shaman.md "The priority
// list (A2)"): each spec's rows show in the default order, a row moves by its handle from the
// keyboard and with Move up and Move down in its settings, the order survives a reload and a share
// link, and a run with a moved row gives a result.

interface ShamanSpec {
  name: string
  menu: RegExp
  order: string[]
  /** A row to move up one place from the keyboard, with its label, and the row it passes. */
  keyboard: { id: string; label: string; passes: string }
  /** A row to move with the Move buttons, by label. */
  buttons: { id: string; label: string }
}

const SPECS: ShamanSpec[] = [
  {
    name: 'Enhancement',
    menu: /Enhancement/,
    order: ['racial', 'rageOfTheFarseer', 'trinkets', 'stormstrike', 'lightningBolt', 'shock'],
    keyboard: { id: 'lightningBolt', label: 'Lightning Bolt', passes: 'stormstrike' },
    buttons: { id: 'shock', label: 'Shock' },
  },
]

/** The rows' ids in the list's order (by attribute: a sheet hides the list from the accessibility tree). */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]')
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
/** `order` with `id` moved to just before `before`. */
const moved = (list: readonly string[], id: string, before: string) => {
  const out = list.filter((r) => r !== id)
  out.splice(out.indexOf(before), 0, id)
  return out
}

async function openRotation(page: Page, spec: ShamanSpec): Promise<Locator> {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: spec.menu }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${spec.name} Shaman`) })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('list', { name: 'Priority list' })
}

for (const spec of SPECS) {
  test.describe(`the ${spec.name} shaman’s priority list`, () => {
    test('starts in the default order, the Default preset, with 44 px targets and nothing pinned', async ({ page }) => {
      const list = await openRotation(page, spec)
      expect(await order(page)).toEqual(spec.order)
      await expect(preset(page)).toHaveText('Default')
      await expect(page.getByRole('button', { name: 'Reset order' })).toBeDisabled()
      // Every row has a handle: nothing is pinned.
      await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(spec.order.length)
      await expect(list.getByText('Fixed in place:')).toHaveCount(0)
      const box = (await list.getByRole('button', { name: new RegExp(`^Move ${spec.keyboard.label},`) }).boundingBox())!
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('moves a row from the keyboard with its handle, and the order survives a reload', async ({ page }) => {
      const list = await openRotation(page, spec)
      const at = spec.order.indexOf(spec.keyboard.id) + 1
      const handle = list.getByRole('button', { name: `Move ${spec.keyboard.label}, position ${at}` })
      await handle.focus()
      await page.keyboard.press('Space')
      await expect(liveRegion(page)).toContainText(new RegExp(`Picked up ${spec.keyboard.label}|${spec.keyboard.label} is over position ${at}`))
      await page.keyboard.press('ArrowUp')
      await expect(liveRegion(page)).toHaveText(`${spec.keyboard.label} is over position ${at - 1} of ${spec.order.length}.`)
      await page.keyboard.press('Space')
      const next = moved(spec.order, spec.keyboard.id, spec.keyboard.passes)
      await expect.poll(() => order(page)).toEqual(next)
      await expect(preset(page)).toHaveText('Custom')
      await page.reload()
      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      await expect.poll(() => order(page)).toEqual(next)
      await expect(preset(page)).toHaveText('Custom')
    })

    for (const width of [1280, 390]) {
      test(`moves a row with Move up and Move down in its settings at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        const phone = width < 1024
        const list = await openRotation(page, spec)
        await list.getByRole('button', { name: spec.buttons.label, exact: true }).click()
        const settings = phone ? page.getByRole('dialog', { name: spec.buttons.label }) : page.getByRole('complementary', { name: `${spec.buttons.label} settings` })
        const at = spec.order.indexOf(spec.buttons.id)
        await settings.getByRole('button', { name: 'Move up', exact: true }).click()
        await expect(page.locator('[data-announcer]')).toHaveText(`${spec.buttons.label} moved to position ${at} of ${spec.order.length}.`)
        const up = moved(spec.order, spec.buttons.id, spec.order[at - 1])
        expect(await order(page)).toEqual(up)
        await settings.getByRole('button', { name: 'Move down', exact: true }).click()
        expect(await order(page)).toEqual(spec.order)
        if (phone) {
          // The sheet hides the rest of the tab until it closes.
          await page.getByRole('button', { name: 'Close', exact: true }).click()
          await expect(page.getByRole('dialog')).toHaveCount(0)
        }
        await expect(preset(page)).toHaveText('Default')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      })
    }

    test.describe('a run and a share link', () => {
      test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

      test('simulates with a moved row, and a share link brings the order back', async ({ page }) => {
        const list = await openRotation(page, spec)
        await list.getByRole('button', { name: spec.buttons.label, exact: true }).click()
        const settings = page.getByRole('complementary', { name: `${spec.buttons.label} settings` })
        await settings.getByRole('button', { name: 'Move up', exact: true }).click()
        const next = moved(spec.order, spec.buttons.id, spec.order[spec.order.indexOf(spec.buttons.id) - 1])
        expect(await order(page)).toEqual(next)
        const results = page.getByRole('complementary', { name: 'Results' })
        await results.getByRole('button', { name: 'Simulate', exact: true }).click()
        await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
        await expect(results.getByRole('group', { name: 'DPS' })).toContainText(/\d[\d,]*\.\d/)

        await page.getByRole('button', { name: /Share/ }).click()
        await expect(page.getByText('Link copied')).toBeVisible()
        const link = await page.evaluate(() => navigator.clipboard.readText())
        await page.getByRole('button', { name: 'Reset order' }).click()
        expect(await order(page)).toEqual(spec.order)
        await page.goto('about:blank')
        await page.goto(link)
        await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${spec.name} Shaman`) })).toBeVisible()
        await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
        await expect.poll(() => order(page)).toEqual(next)
        await expect(preset(page)).toHaveText('Custom')
      })
    })
  })
}
