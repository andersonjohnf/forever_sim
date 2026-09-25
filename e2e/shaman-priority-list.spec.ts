import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { linkFor } from './links.ts'

// The shaman's Rotation tabs as priority lists (decision D31; docs/classes/shaman.md "The priority
// list (A2)"): each spec's rows show in the default order, a row moves by its handle from the
// keyboard and with Move up and Move down in its settings, the order survives a reload and a share
// link, and a run with a moved row gives a result. Elemental's rows say when the setup or the order
// leaves them unused.

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
  {
    name: 'Elemental',
    menu: /Elemental/,
    order: ['racial', 'trinkets', 'powerInfusion', 'manaTide', 'flameShock', 'lavaBurst', 'chainLightning', 'earthShock', 'lightningBolt'],
    keyboard: { id: 'lavaBurst', label: 'Lava Burst', passes: 'flameShock' },
    buttons: { id: 'lightningBolt', label: 'Lightning Bolt' },
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

test('dims a row without a switch while its choice does nothing: the Shock at None (docs/ux.md "Rotation")', async ({ page }) => {
  const list = await openRotation(page, SPECS[0])
  const shock = list.locator('[data-apl-row="shock"]')
  await expect(shock).toContainText('Earth Shock')
  await expect(shock).not.toHaveAttribute('data-inactive')
  // Its settings sit in the panel beside the list at the tests' 1280 px.
  await page.locator('#apl-shock-select').click()
  await page.getByRole('complementary').getByRole('radio', { name: 'None', exact: true }).click()
  await expect(page.locator('#apl-shock-summary')).toHaveText('None')
  await expect(shock).toHaveAttribute('data-inactive')
  await page.getByRole('complementary').getByRole('radio', { name: 'Frost Shock', exact: true }).click()
  await expect(shock).not.toHaveAttribute('data-inactive')
})

test.describe('the Elemental rows the setup leaves unused (docs/classes/shaman.md "Elemental priority list (A2)")', () => {
  const ELEMENTAL = SPECS.find((s) => s.name === 'Elemental')!
  const BELOW_BOLT = 'Below Lightning Bolt: cast only when Lightning Bolt can’t be.'

  for (const width of [1280, 390]) {
    test(`Lightning Bolt first leaves the rows on the global cooldown below it unused, at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const phone = width < 1024
      const list = await openRotation(page, ELEMENTAL)
      await list.getByRole('button', { name: 'Lightning Bolt', exact: true }).click()
      const settings = phone ? page.getByRole('dialog', { name: 'Lightning Bolt' }) : page.getByRole('complementary', { name: 'Lightning Bolt settings' })
      for (let i = 0; i < ELEMENTAL.order.length - 1; i++) await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      await expect(settings.getByRole('button', { name: 'Move up', exact: true })).toBeDisabled()
      if (phone) {
        await page.getByRole('button', { name: 'Close', exact: true }).click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      }
      expect(await order(page)).toEqual(['lightningBolt', ...ELEMENTAL.order.filter((id) => id !== 'lightningBolt')])
      for (const id of ['manaTide', 'flameShock', 'lavaBurst']) {
        await expect(list.locator(`[data-apl-row="${id}"]`), id).toContainText(BELOW_BOLT)
        await expect(list.locator(`[data-apl-row="${id}"]`), id).toHaveAttribute('data-inactive', 'true')
      }
      // Off the global cooldown, the racial isn't; Chain Lightning, a row without a switch, says the
      // same as its setting and is dimmed with the rest (VA-3).
      await expect(list.locator('[data-apl-row="racial"]')).toContainText('On cooldown')
      await expect(list.locator('[data-apl-row="racial"]')).not.toHaveAttribute('data-inactive')
      await expect(list.locator('[data-apl-row="chainLightning"]')).toContainText(BELOW_BOLT)
      await expect(list.locator('[data-apl-row="chainLightning"]')).toHaveAttribute('data-inactive', 'true')
      await list.getByRole('button', { name: 'Chain Lightning', exact: true }).click()
      const chain = phone ? page.getByRole('dialog', { name: 'Chain Lightning' }) : page.getByRole('complementary', { name: 'Chain Lightning settings' })
      await expect(chain.getByRole('radiogroup', { name: 'Chain Lightning' })).toHaveAccessibleDescription(new RegExp(BELOW_BOLT))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }

  test('Chain Lightning with Clearcasting says it needs Elemental Focus without the talent', async ({ page }) => {
    await page.goto('about:blank')
    const hash = await linkFor(page, { version: 2, spec: 'shaman-elemental', talents: '' })
    await page.goto(`./${hash}`)
    await expect(page.getByRole('button', { name: /^Spec: Elemental Shaman/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const list = page.getByRole('list', { name: 'Priority list' })
    await expect(list.locator('[data-apl-row="chainLightning"]')).toContainText('None')
    await list.getByRole('button', { name: 'Chain Lightning', exact: true }).click()
    const chain = page.getByRole('complementary', { name: 'Chain Lightning settings' })
    await expect(chain.getByText('Not used: Clearcasting needs the Elemental Focus talent.', { exact: true })).toBeVisible()
    await expect(chain.getByRole('radiogroup', { name: 'Chain Lightning' })).toHaveAccessibleDescription(/Not used: Clearcasting needs the Elemental Focus talent\./)
  })
})
