import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Talents", from 1440 px (D34): the setup pane is the container `setup`, so the tab lays
// itself out by the pane's width. The setup pane is 55 rem at 1440 px, about 62 at 1600, 75 at 1920,
// 80 at 2040 and about 102 at 2560 (e2e/wide-shell.spec.ts has the shell; the Rotation tab's wide
// layout is e2e/wide-rotation.spec.ts). Talents: icons stay 44 px at every width, each tree's card
// stops at 18 rem, left-aligned; from a 73 rem pane (about 1,870 px, so every 1920 px window) a detail
// panel beside the trees shows the talent under the pointer or focused, and then the pointer no longer
// opens a talent's tooltip (focus still does). Under 1440 px nothing changes (the rest of the suite
// runs at 1280).

const REM = 16

const open = async (page: Page, width: number, tab: 'Talents') => {
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

test.describe('the Talents tab at wide widths', () => {
  /** The rendered size of a talent's icon. */
  const iconSize = (page: Page, name: string) =>
    page
      .getByRole('button', { name: new RegExp(`^${name}, \\d of \\d$`) })
      .locator('img, span[aria-hidden]')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width)
  const cards = (page: Page) => page.locator('section[aria-label$=" tree"]')
  const setup = (page: Page) => page.evaluate(() => document.querySelector('main')!.firstElementChild!.getBoundingClientRect().toJSON() as DOMRect)

  test('at 1280 px the trees are as they were: 44 px icons and no detail panel', async ({ page }) => {
    await open(page, 1280, 'Talents')
    expect(await iconSize(page, 'Bloodthirst')).toBe(44)
    await expect(page.getByRole('complementary', { name: 'Talent details' })).toHaveCount(0)
  })

  for (const viewport of [1440, 1600, 1920, 2560]) {
    test(`at ${viewport} px the icons are 44 px and the cards 18 rem at most, left-aligned; the detail panel shows from a 73 rem pane`, async ({ page }) => {
      await open(page, viewport, 'Talents')
      const pane = await setup(page)
      // Never enlarged to fill the width (docs/ux.md principle 4).
      expect(await iconSize(page, 'Bloodthirst')).toBe(44)
      const boxes = await Promise.all((await cards(page).all()).map(async (card) => (await card.boundingBox())!))
      for (const box of boxes) expect(box.width).toBeLessThanOrEqual(18 * REM + 0.5)
      expect(boxes[0].x).toBeCloseTo(pane.left, 0)
      // Every talent fits its tree's card, and no two overlap.
      for (const card of await cards(page).all()) {
        const box = (await card.boundingBox())!
        const cells = await card.locator('button').evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().toJSON() as DOMRect))
        for (const cell of cells) expect(cell.right).toBeLessThanOrEqual(box.x + box.width)
        for (const a of cells) for (const b of cells) if (a !== b && a.top === b.top && a.left < b.left) expect(a.right).toBeLessThanOrEqual(b.left)
      }
      const details = page.getByRole('complementary', { name: 'Talent details' })
      if (pane.width >= 73 * REM) {
        await expect(details).toBeVisible()
        const panel = (await details.boundingBox())!
        const last = boxes[boxes.length - 1]
        expect(panel.x).toBeGreaterThan(last.x + last.width)
        expect(panel.x + panel.width).toBeLessThanOrEqual(pane.right + 0.5)
      } else {
        await expect(details).toBeHidden()
      }
      // A 1920 px window has the panel: its pane is 75 rem, 74 beside a scrollbar.
      if (viewport >= 1920) await expect(details).toBeVisible()
      await noSidewaysScroll(page)
    })
  }

  test('at 1440 px, with no panel, pointing at a talent opens its tooltip', async ({ page }) => {
    const tab = await open(page, 1440, 'Talents')
    await tab.getByRole('button', { name: /^Bloodthirst, 1 of 1$/ }).hover()
    await expect(page.getByRole('tooltip')).toContainText('Bloodthirst')
  })

  test('at 1920 px the detail panel follows the pointer, then focus; the pointer opens no tooltip, focus does', async ({ page }) => {
    const tab = await open(page, 1920, 'Talents')
    const details = page.getByRole('complementary', { name: 'Talent details' })
    await expect(details).toBeVisible()
    await expect(details).toHaveText('Point at a talent, or focus it, to see what it does and what it needs here.')

    // Pointing at Bloodthirst: its name, rank and what it needs, met; its tooltip still shows.
    const bloodthirst = tab.getByRole('button', { name: /^Bloodthirst, 1 of 1$/ })
    await bloodthirst.hover()
    await expect(details.getByRole('heading', { name: 'Bloodthirst' })).toBeVisible()
    await expect(details).toContainText('Rank 1/1')
    await expect(details).toContainText('Fury, tier 7')
    const needs = details.getByRole('region', { name: 'Needs' }).getByRole('listitem')
    await expect(needs).toHaveText([/^30 points in Fury, met\s*30 of 30$/, /^1 point in Death Wish, met\s*1 of 1$/])
    // The panel says it all, so the pointer doesn't also open the tooltip over the neighbours (DB-7).
    await page.waitForTimeout(1000)
    await expect(page.getByRole('tooltip')).toHaveCount(0)

    // Focus another talent with the pointer away: the panel follows focus.
    await page.mouse.move(0, 0)
    const shieldSlam = tab.getByRole('button', { name: /^Shield Slam, 0 of 1$/ })
    // Focus still opens the tooltip.
    await bloodthirst.focus()
    await expect(page.getByRole('tooltip')).toContainText('Bloodthirst')
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
