import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { linkFor } from './links.ts'

// The warlock's Rotation tab as a priority list (decision D31, docs/classes/warlock.md §6.4): each
// spec's rows in their default order, a row moved by its handle from the keyboard and with Move up
// and Move down, the order kept through a reload and a share link, and a run with it.

const SPECS = [
  {
    name: 'Destruction',
    order: ['racial', 'trinkets', 'powerInfusion', 'curse', 'immolate', 'conflagrate', 'shadowburn', 'corruption', 'bane', 'lifeTap', 'filler'],
    // A row to move from the keyboard, and one to move with the buttons, by id and label.
    key: { id: 'corruption', label: 'Corruption', before: 'shadowburn' },
    button: { id: 'bane', label: 'Bane', before: 'immolate' },
  },
  {
    name: 'Affliction',
    order: ['racial', 'trinkets', 'powerInfusion', 'curse', 'corruption', 'bane', 'siphonLife', 'shadowTrance', 'lifeTap', 'filler'],
    key: { id: 'siphonLife', label: 'Siphon Life', before: 'bane' },
    button: { id: 'shadowTrance', label: 'Shadow Bolt on Shadow Trance', before: 'curse' },
  },
  {
    name: 'Demonology',
    order: ['racial', 'trinkets', 'powerInfusion', 'searingPain', 'curse', 'immolate', 'corruption', 'bane', 'soulFire', 'lifeTap', 'filler'],
    key: { id: 'soulFire', label: 'Soul Fire', before: 'bane' },
    button: { id: 'immolate', label: 'Immolate', before: 'curse' },
  },
]

/** The rows' ids in the list's order (by attribute: a sheet hides the list from the accessibility tree). */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]')
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
const moved = (from: readonly string[], id: string, before: string) => {
  const out = from.filter((r) => r !== id)
  out.splice(out.indexOf(before), 0, id)
  return out
}

async function openRotation(page: Page, spec: string) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: new RegExp(spec) }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${spec} Warlock`) })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('list', { name: 'Priority list' })
}

for (const spec of SPECS) {
  test.describe(`${spec.name} warlock’s priority list`, () => {
    test('starts in the default order, and a row moves from the keyboard with its handle', async ({ page }) => {
      const list = await openRotation(page, spec.name)
      expect(await order(page)).toEqual(spec.order)
      await expect(preset(page)).toHaveText('Default')
      // Nothing is pinned: every row has a handle.
      await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(spec.order.length)
      const n = spec.order.length
      const at = spec.order.indexOf(spec.key.id) + 1
      await list.getByRole('button', { name: `Move ${spec.key.label}, position ${at}` }).focus()
      await page.keyboard.press('Space')
      await expect(liveRegion(page)).toContainText(new RegExp(`${spec.key.label} is over position ${at} of ${n}|Picked up ${spec.key.label}`))
      await page.keyboard.press('ArrowUp')
      await expect(liveRegion(page)).toHaveText(`${spec.key.label} is over position ${at - 1} of ${n}.`)
      await page.keyboard.press('Space')
      await expect.poll(() => order(page)).toEqual(moved(spec.order, spec.key.id, spec.key.before))
      await expect(list.getByRole('button', { name: `Move ${spec.key.label}, position ${at - 1}` })).toBeFocused()
      await expect(preset(page)).toHaveText('Custom')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('moves a row with Move up and Move down, and a reload keeps the order', async ({ page }) => {
      const list = await openRotation(page, spec.name)
      await list.getByRole('button', { name: spec.button.label, exact: true }).click()
      const settings = page.getByRole('complementary', { name: `${spec.button.label} settings` })
      const from = spec.order.indexOf(spec.button.id)
      const to = spec.order.indexOf(spec.button.before)
      for (let i = to; i < from; i++) await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      await settings.getByRole('button', { name: 'Move down', exact: true }).click()
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      const newOrder = moved(spec.order, spec.button.id, spec.button.before)
      expect(await order(page)).toEqual(newOrder)
      await page.reload()
      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      await expect.poll(() => order(page)).toEqual(newOrder)
      // Reset order puts it back.
      await page.getByRole('button', { name: 'Reset order' }).click()
      expect(await order(page)).toEqual(spec.order)
    })
  })
}

// Issue #17: every spec's filler is a choice once Incinerate is talented, and Demonology casts
// Searing Pain for Demonic Brand (docs/classes/warlock.md §6.4, §11.3).
test.describe('the warlock’s filler choice and Searing Pain row', () => {
  /** Opens a shared setup of `spec` with these talents, on the Rotation tab. */
  async function openWith(page: Page, spec: string, talents: string) {
    await page.goto('about:blank')
    const hash = await linkFor(page, { version: 2, spec, talents })
    await page.goto(`./${hash}`)
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    return page.getByRole('list', { name: 'Priority list' })
  }

  test('Affliction: the filler is Shadow Bolt without Incinerate, and a choice once it’s talented', async ({ page }) => {
    let list = await openRotation(page, 'Affliction')
    const filler = () => list.locator('[data-apl-row="filler"]')
    await expect(filler()).toContainText('Shadow Bolt')
    await list.getByRole('button', { name: 'Filler', exact: true }).click()
    let settings = page.getByRole('complementary', { name: 'Filler settings' })
    await expect(settings.getByText('Not used: Incinerate isn’t in your talents, so Shadow Bolt is the filler.')).toBeVisible()
    await expect(settings.getByRole('radio', { name: 'Shadow Bolt', exact: true })).toBeChecked()

    // 20/0/31 with Incinerate (warlock.md §6.4): the choice applies, Shadow Bolt by default.
    list = await openWith(page, 'warlock-affliction', '255500100002--0550315103101051')
    await list.getByRole('button', { name: 'Filler', exact: true }).click()
    settings = page.getByRole('complementary', { name: 'Filler settings' })
    await expect(settings.getByText(/^Not used/)).toHaveCount(0)
    await expect(settings.getByRole('radio', { name: 'Shadow Bolt', exact: true })).toBeChecked()
    await settings.getByRole('radio', { name: 'Incinerate', exact: true }).click()
    await expect(settings.getByRole('radio', { name: 'Incinerate', exact: true })).toBeChecked()
    await expect(filler()).toContainText('Incinerate')
  })

  test('Demonology: Incinerate is its filler once talented, and Shadow Bolt until then', async ({ page }) => {
    const list = await openRotation(page, 'Demonology')
    await expect(list.locator('[data-apl-row="filler"]')).toContainText('Shadow Bolt')
    await list.getByRole('button', { name: 'Filler', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Filler settings' })
    await expect(settings.getByRole('radio', { name: 'Incinerate', exact: true })).toBeChecked()
    await expect(settings.getByText('Not used yet: Shadow Bolt is the filler until you take the Incinerate talent; from then on, Incinerate.')).toBeVisible()
  })

  test('Demonology: Searing Pain’s row needs Demonic Brand, and is on with it', async ({ page }) => {
    let list = await openRotation(page, 'Demonology')
    const row = () => list.locator('[data-apl-row="searingPain"]')
    await expect(row()).toContainText('Searing Pain')
    await expect(row()).toContainText('Not used: needs the Demonic Brand talent.')

    // Demonic Brand 3/3 for Demonic Embrace's and Master Summoner's points (warlock.md §11.6).
    list = await openWith(page, 'warlock-demonology', '-0305003221020301351-0450305003')
    await expect(row()).toContainText('When your Demonic Brand is off the boss')
    await list.getByRole('button', { name: 'Searing Pain', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Searing Pain settings' })
    await expect(settings.getByRole('switch', { name: 'Searing Pain for Demonic Brand' })).toBeChecked()
    // One help text, with the charges by rank (LB-2).
    await expect(settings.getByText(/next 2, 4 or 6 attacks \(by its rank\)/)).toHaveCount(1)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText(/\d/)
  })
})

test.describe('the warlock’s priority list, a run and a share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  for (const spec of SPECS) {
    test(`${spec.name}: simulates with a new order, and a share link keeps it`, async ({ page }) => {
      const list = await openRotation(page, spec.name)
      // The filler first: below it only the rows off the global cooldown are ever cast.
      await list.getByRole('button', { name: 'Filler', exact: true }).click()
      const settings = page.getByRole('complementary', { name: 'Filler settings' })
      for (let i = 0; i < spec.order.length - 1; i++) await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      const newOrder = moved(spec.order, 'filler', spec.order[0])
      expect(await order(page)).toEqual(newOrder)
      const results = page.getByRole('complementary', { name: 'Results' })
      await results.getByRole('button', { name: 'Simulate', exact: true }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
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
    })
  }
})

test.describe('the warlock’s priority list on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  for (const spec of SPECS) {
    test(`${spec.name}: a row’s settings open in a sheet with its moves, with no side scroll`, async ({ page }) => {
      const list = await openRotation(page, spec.name)
      expect(await order(page)).toEqual(spec.order)
      await list.getByRole('button', { name: spec.button.label, exact: true }).click()
      const sheet = page.getByRole('dialog', { name: spec.button.label })
      await sheet.getByRole('button', { name: 'Move up', exact: true }).click()
      const i = spec.order.indexOf(spec.button.id)
      expect(await order(page)).toEqual(moved(spec.order, spec.button.id, spec.order[i - 1]))
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }
})
