import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#layout: the wide desktop layout (D34). From 1440 px the page fills the window, up to
// 2560 px and centred, with 24 px gutters; the results pane is 30 rem, and from 1920 px 38% of the
// page between 46 and 68 rem. The results never run past the viewport and scroll inside. Under
// 1440 px nothing changes: the rest of the suite runs at 1280.

const REM = 16

/** The page's layout boxes: the header's row, the main grid, the setup and results panes. */
const shell = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => {
      const r = el!.getBoundingClientRect()
      return { left: r.left, right: r.right, width: r.width, top: r.top, bottom: r.bottom }
    }
    const main = document.querySelector('main')!
    const style = getComputedStyle(main)
    return {
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      header: box(document.querySelector('header > div')),
      main: box(main),
      padding: Number.parseFloat(style.paddingLeft),
      gap: Number.parseFloat(style.columnGap),
      setup: box(main.firstElementChild),
      results: box(document.querySelector('aside[aria-label="Results"]')),
      containers: [main.firstElementChild, document.querySelector('aside[aria-label="Results"]')].map(
        (el) => getComputedStyle(el!).containerName,
      ),
    }
  })

test.describe('the wide shell', () => {
  for (const { width, results } of [
    { width: 1440, results: 30 * REM },
    // 38% of the page inside its gutters, 1,872 px, is 711 px: under the 46 rem floor.
    { width: 1920, results: 46 * REM },
    // 38% of 2,512 px.
    { width: 2560, results: 0.38 * (2560 - 48) },
  ]) {
    test(`at ${width} px the page fills the width, with its results pane beside the setup`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const s = await shell(page)
      // No sideways scroll.
      expect(s.scrollWidth).toBeLessThanOrEqual(s.viewport)
      // Full width, 24 px gutters, the header along the same edges.
      expect(s.main.left).toBe(0)
      expect(s.main.width).toBe(s.viewport)
      expect(s.padding).toBe(24)
      expect(s.header.left).toBe(s.main.left)
      expect(s.header.width).toBe(s.main.width)
      // The results pane's width, 32 px from the setup, and the pane ends at the gutter.
      expect(s.results.width).toBeCloseTo(results, 0)
      expect(s.gap).toBe(32)
      expect(s.results.left - s.setup.right).toBeCloseTo(32, 0)
      expect(s.results.right).toBeCloseTo(s.viewport - 24, 0)
      // Both panes are named containers for the sections' and results' own layouts.
      expect(s.containers).toEqual(['setup', 'results'])
    })
  }

  test('past 2560 px the page stops growing and sits centred', async ({ page }) => {
    await page.setViewportSize({ width: 3200, height: 900 })
    await page.goto('./')
    const s = await shell(page)
    expect(s.scrollWidth).toBeLessThanOrEqual(s.viewport)
    expect(s.main.width).toBe(2560)
    expect(s.main.left).toBeCloseTo((s.viewport - 2560) / 2, 0)
    expect(s.header.left).toBe(s.main.left)
    expect(s.header.width).toBe(2560)
    // As at 2560: 38% of the capped page inside its gutters.
    expect(s.results.width).toBeCloseTo(0.38 * (2560 - 48), 0)
  })

  test('under 1440 px the page keeps its 1280 px cap and 22 rem results', async ({ page }) => {
    await page.setViewportSize({ width: 1439, height: 900 })
    await page.goto('./')
    const s = await shell(page)
    expect(s.main.width).toBe(1280)
    expect(s.results.width).toBe(22 * REM)
    expect(s.gap).toBe(40)
    // No named containers, so a section's container queries match nothing below 1440 px.
    expect(s.containers).toEqual(['none', 'none'])
  })

  for (const width of [1440, 1920]) {
    test(`at ${width} px the results stay in the viewport and scroll inside`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const results = page.getByRole('complementary', { name: 'Results' })
      await results.getByRole('button', { name: 'Simulate' }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
      const details = results.getByRole('region', { name: 'Result details' })
      // Open a long section, so there's more than the pane shows.
      await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
      const fits = await details.evaluate((el) => ({
        bottom: el.getBoundingClientRect().bottom,
        height: window.innerHeight,
        overflows: el.scrollHeight > el.clientHeight,
      }))
      expect(fits.bottom).toBeLessThanOrEqual(fits.height)
      expect(fits.overflows).toBe(true)
      // Scrolling the page moves nothing: the pane is sticky.
      const top = await results.evaluate((el) => el.querySelector('div')!.getBoundingClientRect().top)
      await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      expect(await results.evaluate((el) => el.querySelector('div')!.getBoundingClientRect().top)).toBeCloseTo(top, 0)
      // It scrolls inside, and its fade at the top shows once it has.
      await details.evaluate((el) => el.scrollTo({ top: 400 }))
      await expect.poll(() => details.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
      await expect(details.locator('xpath=following-sibling::div[1]')).toHaveClass(/opacity-100/)
    })
  }

  test('the section tabs keep their names and keyboard at 1440 px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('./')
    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveText(['Character', 'Talents', 'Gear', 'Buffs', 'Rotation', 'Fight'])
    const character = page.getByRole('tab', { name: 'Character', exact: true })
    await character.click()
    await expect(character).toHaveAttribute('aria-selected', 'true')
    // Manual activation: arrow keys move focus, Enter opens the focused tab.
    await page.keyboard.press('ArrowRight')
    const talents = page.getByRole('tab', { name: 'Talents', exact: true })
    await expect(talents).toBeFocused()
    await expect(character).toHaveAttribute('aria-selected', 'true')
    // Radix moves focus on a timer after each arrow key, so each press waits for it.
    await page.keyboard.press('ArrowRight')
    const gear = page.getByRole('tab', { name: 'Gear', exact: true })
    await expect(gear).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(gear).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toHaveAttribute('data-section', 'gear')
    // Back past the start wraps to the end.
    await character.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('tab', { name: 'Fight', exact: true })).toBeFocused()
    // No summaries yet (slice S2 fills them): each tab is 44 px tall.
    const heights = await tabs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
    expect(heights.every((h) => h === 44)).toBe(true)
  })

  for (const width of [1024, 1440]) {
    test(`at ${width} px “Skip to results” is first, shows when focused, and moves focus to the results`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      await page.keyboard.press('Tab')
      const skip = page.getByRole('link', { name: 'Skip to results' })
      await expect(skip).toBeFocused()
      const box = (await skip.boundingBox())!
      expect(box.width).toBeGreaterThan(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      await page.keyboard.press('Enter')
      const results = page.getByRole('complementary', { name: 'Results' })
      await expect(results).toBeFocused()
      // Its hash belongs to share links: following the link leaves the address alone.
      expect(new URL(page.url()).hash).toBe('')
      // Tab goes on into the pane, and the pane isn't focusable after it.
      await page.keyboard.press('Tab')
      await expect(results.getByRole('button', { name: 'Simulate' })).toBeFocused()
      await expect(results).not.toHaveAttribute('tabindex')
      // Hidden again once focus has left it.
      const hidden = (await skip.boundingBox())!
      expect(hidden.width).toBeLessThanOrEqual(1)
    })
  }

  test('a phone has no skip link: its results are the bottom bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('./')
    await expect(page.getByRole('link', { name: 'Skip to results' })).toBeHidden()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: /^Decades: decades.gg/ })).toBeFocused()
  })
})
