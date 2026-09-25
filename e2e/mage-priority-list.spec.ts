import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The mage's Rotation tabs as priority lists (decision D31, docs/classes/mage.md "The priority
// lists"): Fire, Frost and Arcane each show their rows in the default order, with nothing pinned; a
// row moves by its handle from the keyboard and with Move up and Move down in its settings; the order
// survives a reload and a share link; and a run with a moved row gives a result.

type MageSpec = 'Fire' | 'Frost' | 'Arcane'

const SHARED = ['racial', 'trinkets', 'powerInfusion', 'manaGems', 'evocation']
const DEFAULT_ORDER: Record<MageSpec, string[]> = {
  Fire: ['combustion', ...SHARED, 'scorch', 'pyroblast', 'fireBlast', 'fireball'],
  Frost: ['presenceOfMind', ...SHARED, 'iceBarrier', 'frostbolt'],
  Arcane: ['arcanePower', 'presenceOfMind', ...SHARED, 'pyroblast', 'arcaneMissiles'],
}
/** Per spec: a row to move with the keyboard (its label, id and the row it goes above), and one to move with the buttons. */
const MOVES: Record<MageSpec, { key: [label: string, id: string, above: string]; buttons: [label: string, id: string] }> = {
  Fire: { key: ['Fire Blast', 'fireBlast', 'pyroblast'], buttons: ['Evocation', 'evocation'] },
  Frost: { key: ['Evocation', 'evocation', 'manaGems'], buttons: ['Mana gems', 'manaGems'] },
  Arcane: { key: ['Presence of Mind', 'presenceOfMind', 'arcanePower'], buttons: ['Pyroblast with Presence of Mind', 'pyroblast'] },
}
const SPECS = Object.keys(DEFAULT_ORDER) as MageSpec[]

/** `order` with `id` moved to just before `before` (or to the end without one). */
const moved = (order: readonly string[], id: string, before?: string) => {
  const out = order.filter((r) => r !== id)
  out.splice(before === undefined ? out.length : out.indexOf(before), 0, id)
  return out
}
/** The rows' ids in the list's order (by attribute: a sheet hides the list from the accessibility tree). */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]')
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })

async function openRotation(page: Page, spec: MageSpec) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: new RegExp(`^${spec}`) }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${spec} Mage`) })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('list', { name: 'Priority list' })
}

for (const width of [1280, 390]) {
  const phone = width < 1024
  test.describe(`the mage's priority lists at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    for (const spec of SPECS) {
      test(`${spec}: the default order, then moves by the keyboard and the Move buttons`, async ({ page }) => {
        const list = await openRotation(page, spec)
        const defaults = DEFAULT_ORDER[spec]
        expect(await order(page)).toEqual(defaults)
        await expect(preset(page)).toHaveText('Default')
        await expect(page.getByRole('button', { name: 'Reset order' })).toBeDisabled()
        // Nothing is pinned: every row has a handle.
        await expect(list.getByText('Fixed in place:')).toHaveCount(0)
        await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(defaults.length)
        // The Rotation tab still says the defaults are the common priority (D27), and the potion sits above the list.
        const tab = page.getByRole('tabpanel', { name: 'Rotation' })
        await expect(tab.getByText(/The defaults are the common priority\.$/)).toBeVisible()
        await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
        await expect(tab.getByRole('switch', { name: 'Major Mana Potion', exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

        // The keyboard: a row's handle, Space, an arrow, Space.
        const [keyLabel, keyId, above] = MOVES[spec].key
        const from = defaults.indexOf(keyId) + 1
        const to = defaults.indexOf(above) + 1
        await list.getByRole('button', { name: `Move ${keyLabel}, position ${from}`, exact: true }).focus()
        await page.keyboard.press('Space')
        await expect(liveRegion(page)).toContainText(new RegExp(`Picked up ${keyLabel}|${keyLabel} is over position ${from} of`))
        for (let at = from - 1; at >= to; at--) {
          await page.keyboard.press('ArrowUp')
          await expect(liveRegion(page)).toHaveText(`${keyLabel} is over position ${at} of ${defaults.length}.`)
        }
        await page.keyboard.press('Space')
        const afterKey = moved(defaults, keyId, above)
        await expect.poll(() => order(page)).toEqual(afterKey)
        await expect(liveRegion(page)).toHaveText(`${keyLabel} dropped at position ${to} of ${defaults.length}.`)
        await expect(preset(page)).toHaveText('Custom')

        // The Move buttons in the row's settings: down one, then back up.
        const [buttonLabel, buttonId] = MOVES[spec].buttons
        await list.getByRole('button', { name: buttonLabel, exact: true }).click()
        const settings = phone ? page.getByRole('dialog', { name: buttonLabel }) : page.getByRole('complementary', { name: `${buttonLabel} settings` })
        const at = afterKey.indexOf(buttonId)
        await settings.getByRole('button', { name: 'Move down', exact: true }).click()
        const down = moved(afterKey, buttonId, afterKey[at + 2])
        await expect.poll(() => order(page)).toEqual(down)
        await settings.getByRole('button', { name: 'Move up', exact: true }).click()
        await expect.poll(() => order(page)).toEqual(afterKey)
        await settings.getByRole('button', { name: 'Move down', exact: true }).click()
        await expect.poll(() => order(page)).toEqual(down)
        if (phone) {
          await page.getByRole('button', { name: 'Close', exact: true }).click()
          await expect(page.getByRole('dialog')).toHaveCount(0)
        }

        // The order survives a reload.
        await page.reload()
        await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
        await expect.poll(() => order(page)).toEqual(down)
        await expect(preset(page)).toHaveText('Custom')
        // Reset order puts it back.
        await page.getByRole('button', { name: 'Reset order' }).click()
        expect(await order(page)).toEqual(defaults)
        await expect(preset(page)).toHaveText('Default')
      })
    }
  })
}

test.describe('the mage’s priority list in a run and a share link', () => {
  test.use({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })

  for (const spec of SPECS) {
    test(`${spec}: a run with its filler moved up gives a result, and a share link keeps the order`, async ({ page, context }) => {
      const list = await openRotation(page, spec)
      const defaults = DEFAULT_ORDER[spec]
      // The filler above the mana rows: a real priority, if a costly one.
      const filler = defaults.at(-1)!
      const label = await list.locator(`[data-apl-row="${filler}"]`).getByRole('button', { name: /^Move / }).getAttribute('aria-label')
      const fillerLabel = label!.replace(/^Move (.+), position \d+$/, '$1')
      await list.getByRole('button', { name: fillerLabel, exact: true }).click()
      const settings = page.getByRole('complementary', { name: `${fillerLabel} settings` })
      // A row without a switch says what it does.
      await expect(settings.getByText('Your filler: cast whenever nothing above it is. It has no switch.')).toBeVisible()
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      const newOrder = moved(defaults, filler, defaults.at(-2))
      expect(await order(page)).toEqual(newOrder)

      const results = page.getByRole('complementary', { name: 'Results' })
      await results.getByRole('button', { name: 'Simulate', exact: true }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
      await expect(results.getByRole('group', { name: 'DPS' })).toContainText(/\d[\d,]*\.\d\s*± \d/)

      await page.getByRole('button', { name: /Share/ }).click()
      await expect(page.getByText('Link copied')).toBeVisible()
      const link = await page.evaluate(() => navigator.clipboard.readText())
      // A fresh browser opens the link with the order.
      const other = await (await context.browser()!.newContext()).newPage()
      await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
      await other.goto(link)
      await expect(other.getByText('Loaded a shared setup')).toBeVisible()
      await other.getByRole('tab', { name: 'Rotation', exact: true }).click()
      await expect.poll(() => order(other)).toEqual(newOrder)
      await expect(preset(other)).toHaveText('Custom')
      await other.context().close()
    })
  }
})
