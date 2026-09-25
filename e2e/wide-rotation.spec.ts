import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Rotation", from 1440 px (D34 as amended): the spec-wide settings are a column on the
// left, with every threshold shown (no Advanced), and the priority list sits at the top of the next
// column, a tank's preset picker first. Where a third column fits (a setup pane of 72 rem, from a
// window of about 1,850 px) the selected row's settings are a panel beside the list; where it
// doesn't they open inline under the row. Back to list shows only below 1440 px. The setup pane is
// 55 rem at 1440 px, about 62 at 1600, 75 at 1920 and 102 at 2560 (e2e/wide-shell.spec.ts has the
// shell); under 1440 px nothing changes (the rest of the suite runs at 1280).

const REM = 16

const open = async (page: Page, width: number, height = 1000) => {
  await page.setViewportSize({ width, height })
  await page.goto('./')
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('tabpanel', { name: 'Rotation' })
}

/** Opens a spec's default setup on its Rotation tab. */
const openSpec = async (page: Page, spec: string, width: number, height = 1000) => {
  await page.setViewportSize({ width, height })
  await page.goto('./')
  await page.evaluate(
    (spec) => localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config: { version: 1, spec }, bySpec: {}, section: 'rotation' }, version: 1 })),
    spec,
  )
  await page.reload()
  const tab = page.getByRole('tabpanel', { name: 'Rotation' })
  await expect(tab.getByRole('list', { name: 'Priority list' })).toBeVisible()
  return tab
}

const box = async (locator: Locator) => (await locator.boundingBox())!

const noSidewaysScroll = async (page: Page) => {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(scroll).toBeLessThanOrEqual(client)
}

const list = (tab: Locator) => tab.getByRole('list', { name: 'Priority list' })
const listHeading = (tab: Locator) => tab.getByRole('heading', { name: 'Priority list', exact: true })

/** The settings column beside the list: the list's heading is level with the first heading on the tab's left, and to its right. */
const expectListBesideSettings = async (firstLeft: Locator, firstRight: Locator) => {
  const [left, right] = [await box(firstLeft), await box(firstRight)]
  expect(right.x).toBeGreaterThan(left.x + 20 * REM)
  expect(Math.abs(right.y - left.y)).toBeLessThan(24)
}

test.describe('the Rotation tab at wide widths', () => {
  for (const width of [1440, 1600, 1920, 2560]) {
    test(`at ${width} px the list is at the top of its own column, beside the settings, with every threshold shown`, async ({ page }) => {
      const tab = await open(page, width)
      await expectListBesideSettings(tab.getByRole('heading', { name: 'Consumables', exact: true }), listHeading(tab))
      // Room for them, so no Advanced: Mighty Rage Potion's threshold shows under it.
      await expect(tab.getByRole('button', { name: /^Advanced/ })).toHaveCount(0)
      const potion = await box(tab.getByRole('switch', { name: 'Mighty Rage Potion', exact: true }))
      const threshold = await box(tab.getByLabel('Mighty Rage Potion up to', { exact: true }))
      expect(threshold.y).toBeGreaterThan(potion.y + potion.height)
      // Nothing stretched: the settings column stops at 28 rem and the list at 36 rem.
      const settingsCard = await box(tab.locator('ul').filter({ has: page.getByRole('switch', { name: 'Juju Flurry', exact: true }) }))
      expect(settingsCard.width).toBeLessThanOrEqual(28 * REM + 1)
      expect((await box(list(tab))).width).toBeLessThanOrEqual(36 * REM + 1)
      await noSidewaysScroll(page)
    })
  }

  for (const width of [1440, 1600, 1840]) {
    test(`at ${width} px (two columns) a row's settings open inline under it, and close again`, async ({ page }) => {
      const tab = await open(page, width)
      const row = list(tab).getByRole('button', { name: 'Bloodrage', exact: true })
      await row.click()
      await expect(row).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByRole('complementary', { name: /settings$/ })).toHaveCount(0)
      const settings = page.locator('[data-apl-row="bloodrage"]').getByRole('region', { name: 'Bloodrage settings' })
      await expect(settings.getByRole('heading', { name: 'Bloodrage' })).toBeFocused()
      await expect(settings.getByText('Position 7 of 16')).toBeVisible()
      // It's a panel on a phone only: no Back to list here.
      await expect(tab.getByRole('button', { name: 'Back to list' })).toHaveCount(0)
      // Under the row, pushing the next one down.
      const [rowBox, settingsBox, next] = [await box(row), await box(settings), await box(list(tab).getByRole('button', { name: 'Bloodthirst in the execute phase', exact: true }))]
      expect(settingsBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height)
      expect(next.y).toBeGreaterThanOrEqual(settingsBox.y + settingsBox.height)
      // Move up moves the row with its settings, says where, and keeps focus; the buttons are as wide as their labels.
      const up = settings.getByRole('button', { name: 'Move up' })
      expect((await box(up)).width).toBeLessThan(8 * REM)
      await up.click()
      await expect(settings.getByText('Position 6 of 16')).toBeVisible()
      await expect(up).toBeFocused()
      await expect(page.locator('[data-apl-row]').nth(5)).toHaveAttribute('data-apl-row', 'bloodrage')
      await settings.getByRole('button', { name: 'Move down' }).click()
      await expect(settings.getByText('Position 7 of 16')).toBeVisible()
      await expect(settings.getByRole('button', { name: 'Move down' })).toBeFocused()
      // Its switch works from here, and is named for what it does.
      await settings.getByRole('switch', { name: 'Use Bloodrage', exact: true }).click()
      await expect(list(tab).getByRole('switch', { name: 'Bloodrage', exact: true })).not.toBeChecked()
      // Escape goes back to the row, and selecting it again closes its settings.
      await page.keyboard.press('Escape')
      await expect(row).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(row).toHaveAttribute('aria-expanded', 'false')
      await expect(settings).toHaveCount(0)
      // Another row opens in its place.
      await list(tab).getByRole('button', { name: 'Whirlwind', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Whirlwind settings' }).getByRole('heading', { name: 'Whirlwind' })).toBeFocused()
      await expect(page.getByRole('region', { name: /settings$/ })).toHaveCount(1)
      await noSidewaysScroll(page)
    })
  }

  for (const width of [1880, 1920, 2560]) {
    test(`at ${width} px (three columns) a row's settings are a panel beside the list, naming the ability once`, async ({ page }) => {
      const tab = await open(page, width)
      await expect(page.getByRole('complementary', { name: 'Ability settings' })).toHaveText('Select an ability in the list to see its settings here.')
      const row = list(tab).getByRole('button', { name: 'Bloodrage', exact: true })
      await row.click()
      const settings = page.getByRole('complementary', { name: 'Bloodrage settings' })
      await expect(settings.getByRole('heading', { name: 'Bloodrage' })).toBeFocused()
      await expect(row).toHaveAttribute('aria-current', 'true')
      // Beside the list, level with the top of its column, and 22 to 28 rem wide.
      const [panel, listBox] = [await box(settings), await box(list(tab))]
      expect(panel.x).toBeGreaterThan(listBox.x + listBox.width)
      expect(Math.abs(panel.y - (await box(listHeading(tab))).y)).toBeLessThan(24)
      expect(panel.width).toBeGreaterThanOrEqual(22 * REM - 1)
      expect(panel.width).toBeLessThanOrEqual(28 * REM + 1)
      // No Back to list beside the list; Escape still goes back to the row.
      await expect(settings.getByRole('button', { name: 'Back to list' })).toHaveCount(0)
      // The name shows once, in the heading with its place; the switch's line is its help, and its
      // name for a screen reader is still "Use Bloodrage".
      await expect(settings.getByText('Position 7 of 16')).toBeVisible()
      await expect(settings.getByText('Bloodrage', { exact: true })).toHaveCount(2)
      expect((await box(settings.getByText('Bloodrage', { exact: true }).last())).width).toBeLessThanOrEqual(1)
      const use = settings.getByRole('switch', { name: 'Use Bloodrage', exact: true })
      await expect(use).toBeChecked()
      await expect(settings.getByText(/^Use Bloodrage on cooldown/)).toBeVisible()
      // Move up moves it and says where; the buttons are as wide as their labels.
      const up = settings.getByRole('button', { name: 'Move up' })
      expect((await box(up)).width).toBeLessThan(8 * REM)
      await up.click()
      await expect(settings.getByText('Position 6 of 16')).toBeVisible()
      await expect(up).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(row).toBeFocused()
      await use.click()
      await expect(list(tab).getByRole('switch', { name: 'Bloodrage', exact: true })).not.toBeChecked()
      await noSidewaysScroll(page)
    })
  }

  test('at 1920×1080 the panel reaches the window’s bottom, and marks settings that scroll', async ({ page }) => {
    const tab = await open(page, 1920, 1080)
    await list(tab).getByRole('button', { name: 'Heroic Strike', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'Heroic Strike settings' })
    await list(tab).evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 40))
    const b = await box(panel)
    expect(b.y + b.height).toBeLessThanOrEqual(1080)
    const scrolls = await panel.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
    await expect(panel).toHaveAttribute('data-fade', scrolls ? 'bottom' : 'none')
  })

  test('a row still moves by its handle from the keyboard at 2560 px', async ({ page }) => {
    const tab = await open(page, 2560)
    const live = page.locator('[id^="DndLiveRegion"]')
    await tab.getByRole('button', { name: 'Move Whirlwind, position 11' }).focus()
    await page.keyboard.press('Space')
    await expect(live).toContainText(/Whirlwind is over position 11 of 16|Picked up Whirlwind/)
    await page.keyboard.press('ArrowUp')
    await expect(live).toHaveText('Whirlwind is over position 10 of 16.')
    await page.keyboard.press('Space')
    await expect(live).toHaveText('Whirlwind dropped at position 10 of 16.')
    await expect(tab.getByRole('button', { name: 'Move Whirlwind, position 10' })).toBeFocused()
  })

  test('with a row open inline at 1440 px, a keyboard move of another row still works', async ({ page }) => {
    const tab = await open(page, 1440)
    await list(tab).getByRole('button', { name: 'Bloodrage', exact: true }).click()
    const live = page.locator('[id^="DndLiveRegion"]')
    await tab.getByRole('button', { name: 'Move Whirlwind, position 11' }).focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowUp')
    await expect(live).toHaveText('Whirlwind is over position 10 of 16.')
    await page.keyboard.press('Space')
    await expect(live).toHaveText('Whirlwind dropped at position 10 of 16.')
    await expect(page.getByRole('region', { name: 'Bloodrage settings' })).toBeVisible()
  })

  test('a tank’s presets sit first in the list’s column, beside the settings, and Reset rotation hands focus to them', async ({ page }) => {
    const tab = await openSpec(page, 'warrior-protection', 1440)
    const preset = tab.getByRole('heading', { name: 'Preset', exact: true })
    await expectListBesideSettings(tab.getByRole('heading', { name: 'Consumables', exact: true }), preset)
    const [presetBox, listBox] = [await box(preset), await box(listHeading(tab))]
    expect(Math.abs(presetBox.x - listBox.x)).toBeLessThan(2)
    expect(listBox.y).toBeGreaterThan(presetBox.y)
    await tab.getByRole('combobox', { name: 'Rotation preset' }).click()
    await page.getByRole('option', { name: 'Max TPS' }).click()
    await tab.getByRole('button', { name: 'Reset rotation' }).click()
    await expect(tab.getByRole('combobox', { name: 'Rotation preset' })).toBeFocused()
    await expect(tab.getByRole('combobox', { name: 'Rotation preset' })).toHaveText('Balanced (default)')
    await noSidewaysScroll(page)
  })

  test('Destruction’s unheaded Demonic Sacrifice leads the settings column, beside the list', async ({ page }) => {
    const tab = await openSpec(page, 'warlock-destruction', 1440)
    const sacrifice = tab.getByRole('radiogroup', { name: 'Demonic Sacrifice' })
    // Its card is first on the left, level with the list's heading and clear of it.
    const [column, l] = [await box(tab.locator('ul').filter({ has: page.getByRole('radiogroup', { name: 'Demonic Sacrifice' }) })), await box(listHeading(tab))]
    expect(l.x).toBeGreaterThan(column.x + column.width)
    expect(Math.abs(column.y - l.y)).toBeLessThan(24)
    // Its four demons stay in the column.
    for (const item of await sacrifice.locator('[data-slot="toggle-group-item"]').all()) {
      const r = await box(item)
      expect(r.x + r.width).toBeLessThanOrEqual(column.x + column.width + 0.5)
    }
    await noSidewaysScroll(page)
  })

  test('under 1440 px the tab is as it was: settings above the list, Advanced, and Back to list in a 20 rem panel', async ({ page }) => {
    const tab = await open(page, 1280)
    const [consumables, heading] = [await box(tab.getByRole('heading', { name: 'Consumables', exact: true })), await box(listHeading(tab))]
    expect(heading.y).toBeGreaterThan(consumables.y + 100)
    expect(Math.abs(heading.x - consumables.x)).toBeLessThan(2)
    await expect(tab.getByRole('button', { name: /^Advanced settings for Consumables/ })).toBeVisible()
    await list(tab).getByRole('button', { name: 'Bloodrage', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Bloodrage settings' })
    expect((await box(settings)).width).toBeCloseTo(20 * REM, 0)
    await expect(settings.getByRole('button', { name: 'Back to list' })).toBeVisible()
    // The switch under its label, as before.
    expect((await box(settings.getByText('Bloodrage', { exact: true }).last())).width).toBeGreaterThan(40)
  })
})

/** Every spec, as src/sim/specs.ts lists them. */
const SPEC_IDS = ['warrior-fury', 'warrior-arms', 'warrior-protection', 'druid-feral-cat', 'druid-feral-bear', 'druid-balance', 'paladin-retribution', 'paladin-protection', 'shaman-enhancement', 'shaman-elemental', 'rogue-combat', 'rogue-assassination', 'rogue-subtlety', 'mage-fire', 'mage-frost', 'mage-arcane', 'warlock-destruction', 'warlock-affliction', 'warlock-demonology', 'priest-shadow', 'hunter-marksmanship', 'hunter-beast-mastery', 'hunter-survival']

test.describe('every spec’s Rotation tab at wide widths', () => {
  // At 1440 px the settings column is about 25 rem, its narrowest: every setting keeps room for its
  // words, every option fits its row, no heading has an Advanced, and the list is beside the settings.
  for (const viewport of [1440, 1920]) {
    test(`at ${viewport} px the list is beside the settings, which all show and fit`, async ({ page }) => {
      test.setTimeout(120_000)
      const problems: string[] = []
      await page.setViewportSize({ width: viewport, height: 1000 })
      await page.goto('./')
      for (const spec of SPEC_IDS) {
        const tab = await openSpec(page, spec, viewport)
        if ((await tab.getByRole('button', { name: /^Advanced/ }).count()) > 0) problems.push(`${spec}: an Advanced button`)
        const found = await tab.evaluate((root) => {
          const out: string[] = []
          const heading = [...root.querySelectorAll('h3')].find((h) => h.textContent === 'Priority list')!.getBoundingClientRect()
          // The settings cards: every list but the priority list and the row's own settings.
          const cards = [...root.querySelectorAll('ul')].filter((ul) => !ul.closest('ol, aside'))
          for (const card of cards) {
            const box = card.getBoundingClientRect()
            if (box.right > heading.left) out.push('a settings card reaches into the list’s column')
            for (const label of card.querySelectorAll('label, [id$="-label"]')) {
              // A fixed row (a hunter's Auto Shot and Pet) has no control: its value sits beside its
              // words at every width (option-rows.tsx FixedRow), so it's left to that file.
              if (!label.closest('li')?.querySelector('input, button, [role="switch"]')) continue
              const words = label.closest('div, span')!.getBoundingClientRect()
              if (words.width < 12 * 16) out.push(`${label.textContent}: ${Math.round(words.width)} px for its words`)
            }
            for (const item of card.querySelectorAll('[data-slot="toggle-group-item"]')) {
              const r = item.getBoundingClientRect()
              if (item.scrollWidth > item.clientWidth + 0.5 || r.left < box.left - 0.5 || r.right > box.right + 0.5) out.push(`${item.textContent} clipped or outside its card`)
            }
          }
          return out
        })
        problems.push(...found.map((f) => `${spec}: ${f}`))
      }
      expect(problems).toEqual([])
      await noSidewaysScroll(page)
    })
  }
})
