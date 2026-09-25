import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { linkFor } from './links.ts'

// The Shadow Priest's Rotation tab as a priority list (decision D31, docs/classes/priest.md §6 "The
// priority list"): its rows in the default order with Shadowform pinned first, a row moved by its
// handle from the keyboard and with Move up and Move down, a row turned off, the notes on a row a
// reordered list leaves unused, and an order that survives a run, a share link and a reload.

const DEFAULT_ORDER = [
  'prepull',
  'racial',
  'trinkets',
  'powerInfusion',
  'darkSacrifice',
  'shadowWordPain',
  'devouringPlague',
  'innerFocus',
  'mindBlast',
  'starshards',
  'vampiricEmbrace',
  'mindFlay',
]
const COUNT = DEFAULT_ORDER.length

const openRotation = async (page: Page) => {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Priest' }).getByRole('menuitem', { name: /Shadow/ }).click()
  await expect(page.getByRole('button', { name: /^Spec: Shadow Priest/ })).toBeVisible()
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

for (const width of [1280, 390]) {
  const phone = width < 1024
  test.describe(`the Shadow Priest's priority list at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    const openRow = async (page: Page, list: Locator, name: string) => {
      await list.getByRole('button', { name, exact: true }).click()
      return phone ? page.getByRole('dialog', { name }) : page.getByRole('complementary', { name: `${name} settings` })
    }
    const closeRow = async (page: Page) => {
      if (!phone) return
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }

    test('starts in the default order, Shadowform pinned first, with readable summaries and 44 px targets', async ({ page }) => {
      const list = await openRotation(page)
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await expect(preset(page)).toHaveText('Default')
      await expect(page.getByText('The defaults are the common priority, with a first quick search; they aren’t tuned yet.', { exact: false })).toBeVisible()
      // Shadowform is the pinned row: a lock, no handle; every other row a handle.
      const prepull = list.locator('[data-apl-row="prepull"]')
      await expect(prepull).toContainText('Shadowform')
      await expect(prepull.getByText('Fixed in place:')).toHaveCount(1)
      await expect(prepull.getByRole('button', { name: /^Move / })).toHaveCount(0)
      await expect(list.getByRole('button', { name: /^Move / })).toHaveCount(COUNT - 1)
      // Each row's summary, and the other races' spells marked unused for a Troll.
      await expect(list.locator('[data-apl-row="shadowWordPain"]')).toContainText('When it’s off the boss · until 6 s left')
      await expect(list.locator('[data-apl-row="mindFlay"]')).toContainText('Filler · 3 ticks')
      await expect(list.locator('[data-apl-row="vampiricEmbrace"]')).toContainText('Off')
      await expect(list.locator('[data-apl-row="starshards"]')).toContainText('Not used: only Night Elf priests have Starshards, not Troll.')
      await expect(list.locator('[data-apl-row="darkSacrifice"]')).toContainText('Not used: only Undead priests have Dark Sacrifice, not Troll.')
      // Power Infusion is a row, waiting for another priest's in Buffs; the mana consumables sit
      // above the list, under their one heading.
      await expect(list.locator('[data-apl-row="powerInfusion"]')).toContainText('Not used: turn on Power Infusion in Buffs first.')
      const tab = page.getByRole('tabpanel', { name: 'Rotation' })
      await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
      await expect(tab.getByRole('switch', { name: 'Major Mana Potion', exact: true })).toBeChecked()
      const blast = list.locator('[data-apl-row="mindBlast"]')
      for (const target of [
        blast.getByRole('button', { name: 'Move Mind Blast, position 9' }),
        blast.getByRole('button', { name: 'Mind Blast', exact: true }),
        blast.getByRole('switch', { name: 'Mind Blast', exact: true }).locator('..'),
      ]) {
        const box = (await target.boundingBox())!
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('moves a row with Move up and Move down, turns one off, and never past Shadowform', async ({ page }) => {
      const list = await openRotation(page)
      let settings = await openRow(page, list, 'Mind Flay')
      await expect(settings.getByText(phone ? `At position ${COUNT} of ${COUNT}` : `Position ${COUNT} of ${COUNT}`, { exact: true })).toBeVisible()
      await expect(settings.getByRole('button', { name: 'Move down', exact: true })).toBeDisabled()
      await expect(settings.getByRole('textbox', { name: 'Mind Flay ticks', exact: true })).toHaveValue('3')
      await settings.getByRole('button', { name: 'Move up', exact: true }).click()
      expect(await order(page)).toEqual(moved('mindFlay', 'vampiricEmbrace'))
      // A sheet hides the page behind it, the preset picker too.
      if (!phone) await expect(preset(page)).toHaveText('Custom')
      await settings.getByRole('button', { name: 'Move down', exact: true }).click()
      expect(await order(page)).toEqual(DEFAULT_ORDER)
      await closeRow(page)
      // The first row after Shadowform can't move up.
      settings = await openRow(page, list, 'Racial cooldown')
      await expect(settings.getByRole('button', { name: 'Move up', exact: true })).toBeDisabled()
      await closeRow(page)

      // Devouring Plague off: its row says so; Mind Blast off leaves Inner Focus nothing to do.
      await list.getByRole('switch', { name: 'Devouring Plague', exact: true }).click()
      await expect(list.locator('[data-apl-row="devouringPlague"]')).toContainText('Off')
      await list.getByRole('switch', { name: 'Mind Blast', exact: true }).click()
      await expect(list.locator('[data-apl-row="innerFocus"]')).toContainText('Not used: Mind Blast is off.')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  })
}

test.describe('the Shadow Priest’s list from the keyboard, in a run and a share link', () => {
  test.use({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })

  test('moves Mind Blast above Inner Focus by its handle, says where it went, and Inner Focus says it’s then unused', async ({ page }) => {
    const list = await openRotation(page)
    const focus = list.locator('[data-apl-row="innerFocus"]')
    await expect(focus).toContainText('When Mind Blast is ready')
    const handle = list.getByRole('button', { name: /^Move Mind Blast/ })
    await handle.focus()
    await page.keyboard.press('Space')
    await expect(liveRegion(page)).toContainText(new RegExp(`Mind Blast is over position 9 of ${COUNT}|Picked up Mind Blast`))
    await page.keyboard.press('ArrowUp')
    await expect(liveRegion(page)).toHaveText(`Mind Blast is over position 8 of ${COUNT}.`)
    await page.keyboard.press('Space')
    await expect.poll(() => order(page)).toEqual(moved('mindBlast', 'innerFocus'))
    await expect(liveRegion(page)).toHaveText(`Mind Blast dropped at position 8 of ${COUNT}.`)
    await expect(list.getByRole('button', { name: 'Move Mind Blast, position 8' })).toBeFocused()
    // Below Mind Blast, Inner Focus never finds it ready: its row is dimmed and says so.
    await expect(focus).toContainText('Below Mind Blast: used only while you haven’t the mana for Mind Blast, which goes first the moment it’s ready.')
    await expect(focus).toHaveAttribute('data-inactive', 'true')
  })

  test('says a row can’t reach Shadowform without the talent', async ({ page }) => {
    await page.goto('about:blank')
    const hash = await linkFor(page, { version: 2, spec: 'priest-shadow', talents: '' })
    await page.goto(`./${hash}`)
    await expect(page.getByRole('button', { name: /^Spec: Shadow Priest/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const prepull = page.getByRole('list', { name: 'Priority list' }).locator('[data-apl-row="prepull"]')
    await expect(prepull).toContainText('None')
    await expect(prepull).not.toContainText('Shadowform')
  })

  test('a run with Mind Flay first differs, and a share link and a reload keep the order', async ({ page }) => {
    const list = await openRotation(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const before = await results.getByRole('group', { name: 'DPS' }).innerText()

    // Mind Flay first: the filler takes every global cooldown ahead of the DoTs and Mind Blast.
    await list.getByRole('button', { name: 'Mind Flay', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Mind Flay settings' })
    for (let i = 0; i < COUNT - 2; i++) await settings.getByRole('button', { name: 'Move up', exact: true }).click()
    const newOrder = moved('mindFlay', 'racial')
    expect(await order(page)).toEqual(newOrder)
    // The rows on the global cooldown below it, and Inner Focus, are dimmed and say why; the racial,
    // off the global cooldown, isn't.
    for (const id of ['shadowWordPain', 'devouringPlague', 'innerFocus', 'mindBlast']) {
      await expect(list.locator(`[data-apl-row="${id}"]`), id).toContainText('Below Mind Flay: used only while you haven’t the mana for Mind Flay.')
      await expect(list.locator(`[data-apl-row="${id}"]`), id).toHaveAttribute('data-inactive', 'true')
    }
    await expect(list.locator('[data-apl-row="racial"]')).toContainText('On cooldown')
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText('Setup changed')
    await results.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(results.getByRole('group', { name: 'DPS' })).not.toContainText('Setup changed', { timeout: 30_000 })
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    expect(await results.getByRole('group', { name: 'DPS' }).innerText()).not.toBe(before)

    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await page.getByRole('button', { name: 'Reset order' }).click()
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.getByRole('button', { name: /^Spec: Shadow Priest/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await expect.poll(() => order(page)).toEqual(newOrder)
    await expect(preset(page)).toHaveText('Custom')
    await page.reload()
    await expect.poll(() => order(page)).toEqual(newOrder)
  })
})
