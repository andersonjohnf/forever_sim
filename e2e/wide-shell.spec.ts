import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#layout: the wide desktop layout (D34). From 1440 px the page fills the window, up to
// 2560 px and centred, with 24 px gutters; the results pane grows smoothly with the window, 30 rem at
// 1440 px and a rem for every 48 px past it (40 rem at 1920, 53.3 at 2560), up to 60 rem, with no
// step (review finding DA-2). The results never run past the viewport and scroll inside. Under
// 1440 px nothing changes: the rest of the suite runs at 1280.

const REM = 16

/** The results pane's width at a window width from 1440 px: `clamp()` in src/App.tsx. */
const pane = (width: number) => Math.min(60 * REM, 30 * REM + (width - 1440) / 3)

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
    { width: 1600, results: pane(1600) },
    { width: 1920, results: 40 * REM },
    { width: 2560, results: pane(2560) },
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
    // The pane follows the window, not the capped page, so here it's at its 60 rem cap.
    expect(s.results.width).toBeCloseTo(60 * REM, 0)
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
      // Gear fits the window from 1440 px (docs/ux.md "Sections"), so scrolling needs a longer tab.
      await page.getByRole('tab', { name: 'Talents' }).click()
      const results = page.getByRole('complementary', { name: 'Results' })
      await results.getByRole('button', { name: 'Simulate' }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
      // The sheet, your setup and the result scroll as one, inside the pane (docs/ux.md#results).
      const panel = results.getByRole('region', { name: 'Sheet, setup and result' })
      // Open a long section, so there's more than the pane shows.
      await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
      const fits = await panel.evaluate((el) => ({
        bottom: el.getBoundingClientRect().bottom,
        height: window.innerHeight,
        overflows: el.scrollHeight > el.clientHeight,
      }))
      expect(fits.bottom).toBeLessThanOrEqual(fits.height)
      expect(fits.overflows).toBe(true)
      // Scrolling the page moves nothing: the pane is sticky.
      const top = await results.evaluate((el) => el.querySelector('div')!.getBoundingClientRect().top)
      // Halfway, short of the page's end, where the pane's own bottom would carry it up. The wide
      // layout keeps sections close to the window's height, so there's little to scroll.
      const room = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
      expect(room).toBeGreaterThan(20)
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), Math.floor(room / 2))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      expect(await results.evaluate((el) => el.querySelector('div')!.getBoundingClientRect().top)).toBeCloseTo(top, 0)
      // It scrolls inside, and the fade under your setup shows once it has.
      await panel.evaluate((el) => el.scrollTo({ top: 400 }))
      await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
      await expect(results.locator('[data-fade-above]')).toHaveClass(/opacity-100/)
    })
  }

  // The tabs are the same at every width: their label, 44 px tall. What each section holds is the
  // wide panel's setup summary (wide-results.spec.ts).
  test('the section tabs keep their names, keyboard and height at 1440 px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('./')
    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveText(['Character', 'Talents', 'Gear', 'Buffs', 'Rotation', 'Fight'])
    for (const name of ['Character', 'Talents', 'Gear', 'Buffs', 'Rotation', 'Fight']) {
      await expect(page.getByRole('tab', { name, exact: true })).not.toHaveAttribute('aria-describedby')
    }
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
    const heights = await tabs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
    expect(heights.every((h) => h === 44)).toBe(true)
  })

  for (const width of [1024, 1440]) {
    test(`at ${width} px “Skip to results” is first, shows when focused, and moves focus to Simulate`, async ({ page }) => {
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
      // Focus lands on the pane's Simulate button, with its focus ring showing where (review
      // finding DA-4: the pane draws no ring, so focusing it changed nothing you could see).
      const simulate = results.getByRole('button', { name: 'Simulate' })
      await expect(simulate).toBeFocused()
      expect(await simulate.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
      await expect(results).not.toHaveAttribute('tabindex')
      // Its hash belongs to share links: following the link leaves the address alone.
      expect(new URL(page.url()).hash).toBe('')
      // After a run the button is Run again, and the link lands there.
      await page.keyboard.press('Enter')
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
      await page.getByRole('tab', { name: 'Gear', exact: true }).focus()
      await skip.focus()
      await page.keyboard.press('Enter')
      await expect(results.getByRole('button', { name: 'Run again' })).toBeFocused()
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
