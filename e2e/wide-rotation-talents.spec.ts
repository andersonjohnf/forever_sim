import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Rotation" and "Talents", from 1440 px (D34): the setup pane is the container `setup`,
// so each tab lays itself out by the pane's width. The setup pane is 55 rem at 1440 px, 65 rem at
// 1600, 69 rem at 1920 and about 95 rem at 2560 (e2e/wide-shell.spec.ts has the shell).
// Rotation: the row settings panel is 24 rem from a 53 rem pane and 28 rem from 80 rem; it names the
// ability once, with its place; the spec-wide settings above the list flow into two columns from
// 80 rem. Talents: icons grow from 44 to 52 px and each tree's card stops at 26 rem from a 64 rem
// pane; from 90 rem a detail panel beside the trees shows the talent under the pointer or focused.
// Under 1440 px nothing changes (the rest of the suite runs at 1280).

const REM = 16

const open = async (page: Page, width: number, tab: 'Rotation' | 'Talents') => {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('./')
  await page.getByRole('tab', { name: tab, exact: true }).click()
  return page.getByRole('tabpanel', { name: tab })
}

const noSidewaysScroll = async (page: Page) => {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(scroll).toBeLessThanOrEqual(client)
}

const width = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!.width

test.describe('the Rotation tab at wide widths', () => {
  for (const { viewport, panel } of [
    // A 55 rem pane (54 with a scrollbar): over the 53 rem step.
    { viewport: 1440, panel: 24 * REM },
    { viewport: 1600, panel: 24 * REM },
    { viewport: 1920, panel: 24 * REM },
    { viewport: 2560, panel: 28 * REM },
  ]) {
    test(`at ${viewport} px the row's settings panel is ${panel / REM} rem and names the ability once`, async ({ page }) => {
      const tab = await open(page, viewport, 'Rotation')
      await tab.getByRole('list', { name: 'Priority list' }).getByRole('button', { name: 'Bloodrage', exact: true }).click()
      const settings = page.getByRole('complementary', { name: 'Bloodrage settings' })
      await expect(settings.getByRole('heading', { name: 'Bloodrage' })).toBeFocused()
      expect(await width(settings)).toBeCloseTo(panel, 0)
      // The name shows once, in the heading with its place; the switch's line is its help, and its
      // name for a screen reader is still "Use Bloodrage".
      await expect(settings.getByText('Position 7 of 16')).toBeVisible()
      await expect(settings.getByText('Bloodrage', { exact: true })).toHaveCount(2)
      expect(await width(settings.getByText('Bloodrage', { exact: true }).last())).toBeLessThanOrEqual(1)
      const use = settings.getByRole('switch', { name: 'Use Bloodrage', exact: true })
      await expect(use).toBeChecked()
      await expect(settings.getByText(/^Use Bloodrage on cooldown/)).toBeVisible()
      // Behaviour as below 1440: Move up moves it and says where; Escape goes back to the row.
      await settings.getByRole('button', { name: 'Move up' }).click()
      await expect(settings.getByText('Position 6 of 16')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(tab.getByRole('button', { name: 'Bloodrage', exact: true })).toBeFocused()
      // The switch still works from the panel.
      await use.click()
      await expect(tab.getByRole('list', { name: 'Priority list' }).getByRole('switch', { name: 'Bloodrage', exact: true })).not.toBeChecked()
      await noSidewaysScroll(page)
    })
  }

  test('below 1440 px the panel is as it was: the name twice, the switch under its label', async ({ page }) => {
    const tab = await open(page, 1280, 'Rotation')
    await tab.getByRole('list', { name: 'Priority list' }).getByRole('button', { name: 'Bloodrage', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Bloodrage settings' })
    expect(await width(settings)).toBeCloseTo(20 * REM, 0)
    expect(await width(settings.getByText('Bloodrage', { exact: true }).last())).toBeGreaterThan(40)
  })

  test('a row still moves by its handle from the keyboard at 2560 px', async ({ page }) => {
    const tab = await open(page, 2560, 'Rotation')
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

  test('the spec-wide settings flow into two columns from an 80 rem pane, and stay one below it', async ({ page }) => {
    // 1920 px: a 69 rem pane, one column.
    let tab = await open(page, 1920, 'Rotation')
    const potion = () => tab.getByRole('switch', { name: 'Mighty Rage Potion', exact: true })
    const juju = () => tab.getByRole('switch', { name: 'Juju Flurry', exact: true })
    let [a, b] = [(await potion().boundingBox())!, (await juju().boundingBox())!]
    expect(b.y).toBeGreaterThan(a.y + a.height)
    // 2560 px: a 95 rem pane, Mighty Rage Potion beside Juju Flurry, each on its own half.
    tab = await open(page, 2560, 'Rotation')
    ;[a, b] = [(await potion().boundingBox())!, (await juju().boundingBox())!]
    expect(Math.abs(a.y - b.y)).toBeLessThan(24)
    expect(b.x).toBeGreaterThan(a.x + a.width)
    // Opening Advanced puts the threshold under the potion, in its own cell.
    await tab.getByRole('button', { name: /^Advanced settings for Consumables/ }).click()
    const threshold = tab.getByLabel('Mighty Rage Potion up to', { exact: true })
    const t = (await threshold.boundingBox())!
    expect(t.x).toBeLessThan(b.x)
    expect(t.y).toBeGreaterThan(a.y + a.height)
    await noSidewaysScroll(page)
  })
})

test.describe('the Talents tab at wide widths', () => {
  /** The rendered size of a talent's icon. */
  const iconSize = (page: Page, name: string) =>
    page
      .getByRole('button', { name: new RegExp(`^${name}, \\d of \\d$`) })
      .locator('img, span[aria-hidden]')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width)
  const cards = (page: Page) => page.locator('section[aria-label$=" tree"]')

  test('at 1280 px the trees are as they were: 44 px icons and no detail panel', async ({ page }) => {
    await open(page, 1280, 'Talents')
    expect(await iconSize(page, 'Bloodthirst')).toBe(44)
    await expect(page.getByRole('complementary', { name: 'Talent details' })).toHaveCount(0)
  })

  test('at 1440 px (a 55 rem pane) the trees are unchanged, and the detail panel is hidden', async ({ page }) => {
    await open(page, 1440, 'Talents')
    expect(await iconSize(page, 'Bloodthirst')).toBe(44)
    await expect(page.getByRole('complementary', { name: 'Talent details' })).toBeHidden()
    await noSidewaysScroll(page)
  })

  test('at 1920 px the icons are 52 px and the cards share the pane, 26 rem at most', async ({ page }) => {
    await open(page, 1920, 'Talents')
    expect(await iconSize(page, 'Bloodthirst')).toBe(52)
    for (const card of await cards(page).all()) expect(await width(card)).toBeLessThanOrEqual(26 * REM)
    await expect(page.getByRole('complementary', { name: 'Talent details' })).toBeHidden()
    // Every talent is still a 44 px target or more.
    const smallest = await page
      .locator('section[aria-label$=" tree"] button')
      .evaluateAll((buttons) => Math.min(...buttons.map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))))
    expect(smallest).toBeGreaterThanOrEqual(44)
    await noSidewaysScroll(page)
  })

  test('at 2560 px the detail panel follows the pointer, then focus, and the tooltip stays', async ({ page }) => {
    const tab = await open(page, 2560, 'Talents')
    const details = page.getByRole('complementary', { name: 'Talent details' })
    await expect(details).toBeVisible()
    await expect(details).toHaveText('Point at a talent, or focus it, to see what it does and what it needs here.')
    // The cards stop at 26 rem, and the panel sits to their right.
    for (const card of await cards(page).all()) expect(await width(card)).toBeLessThanOrEqual(26 * REM)
    const lastCard = (await cards(page).last().boundingBox())!
    expect((await details.boundingBox())!.x).toBeGreaterThan(lastCard.x + lastCard.width)

    // Pointing at Bloodthirst: its name, rank and what it needs, met; its tooltip still shows.
    const bloodthirst = tab.getByRole('button', { name: /^Bloodthirst, 1 of 1$/ })
    await bloodthirst.hover()
    await expect(details.getByRole('heading', { name: 'Bloodthirst' })).toBeVisible()
    await expect(details).toContainText('Rank 1/1')
    await expect(details).toContainText('Fury, tier 7')
    const needs = details.getByRole('region', { name: 'Needs' }).getByRole('listitem')
    await expect(needs).toHaveText([/^30 points in Fury, met\s*30 of 30$/, /^1 point in Death Wish, met\s*1 of 1$/])
    await expect(page.getByRole('tooltip')).toContainText('Bloodthirst')

    // Focus another talent with the pointer away: the panel follows focus.
    await page.mouse.move(0, 0)
    const shieldSlam = tab.getByRole('button', { name: /^Shield Slam, 0 of 1$/ })
    await shieldSlam.focus()
    await expect(details.getByRole('heading', { name: 'Shield Slam' })).toBeVisible()
    await expect(details.getByRole('region', { name: 'Needs' }).getByRole('listitem').first()).toHaveText(/^\d+ points in Protection, not met\s*0 of \d+$/)
    // Why a point can't go in yet, as the tooltip says: the default build spends all 51.
    await expect(details).toContainText('All 51 points are spent.')

    // Keys still add and remove points, and the panel keeps up: Cruelty, from a cleared build.
    await tab.getByRole('button', { name: 'Clear' }).click()
    await tab.getByRole('button', { name: /^Cruelty, 0 of 5$/ }).focus()
    await expect(details.getByRole('heading', { name: 'Cruelty' })).toBeVisible()
    await expect(details).toContainText('Nothing: it’s in the first tier.')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(details).toContainText('Rank 2/5')
    await page.keyboard.press('Backspace')
    await expect(tab.getByRole('button', { name: /^Cruelty, 1 of 5$/ })).toBeFocused()
    await expect(details).toContainText('Rank 1/5')
    // With neither pointer nor focus on a talent, the last one stays.
    await tab.getByRole('button', { name: 'Paste code' }).focus()
    await expect(details.getByRole('heading', { name: 'Cruelty' })).toBeVisible()
    await noSidewaysScroll(page)
  })
})
