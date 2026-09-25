import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The themes' surfaces (docs/ux.md#visual-language "Surfaces" and "Tooltips", #brand; user decision
// 2026-09-25): the header is the guild's ink navy in both themes, with every class colour AA on it
// and on its hover fill; the light theme's page is a soft grey-blue under white panels; and tooltips
// take the popover's colours in both themes rather than an inverted box.

/** An element's colour and the colour behind it (its own fill, or its nearest painted ancestor's), composited over white, as [r, g, b]. */
const colours = (locator: Locator, what: 'text' | 'fill' = 'text') =>
  locator.first().evaluate((el, what) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const parse = (css: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const over = (top: number[], bottom: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1)
    const chain: Element[] = []
    for (let e: Element | null = what === 'fill' ? el.parentElement : el; e; e = e.parentElement) chain.unshift(e)
    const behind = chain.reduce((c, e) => over(parse(getComputedStyle(e).backgroundColor), c), [255, 255, 255, 1])
    const front = what === 'fill' ? over(parse(getComputedStyle(el).backgroundColor), behind) : over(parse(getComputedStyle(el).color), behind)
    return { front: front.slice(0, 3), behind: behind.slice(0, 3) }
  }, what)

const lum = (c: number[]) => {
  const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = ({ front, behind }: { front: number[]; behind: number[] }) => {
  const [hi, lo] = [lum(front), lum(behind)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}
/** The ink navy, #1f1c3d (oklch(0.25 0.06 285)), within a unit or two of rounding. */
const isNavy = (c: number[]) => Math.abs(c[0] - 0x1f) <= 2 && Math.abs(c[1] - 0x1c) <= 2 && Math.abs(c[2] - 0x3d) <= 2

const noTransitions = (page: Page) => page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme })

    test('the header is ink navy, and every class colour in the spec switcher is AA on it, at rest and hovered', async ({ page }) => {
      await page.goto('./')
      await noTransitions(page)
      const header = page.getByRole('banner')
      const { front } = await colours(header, 'fill')
      expect(isNavy(front), `header fill ${front}`).toBe(true)
      // Its text is near-white, 15:1 on the navy.
      expect(ratio(await colours(page.getByRole('heading', { level: 1 })))).toBeGreaterThanOrEqual(12)

      const switcher = page.getByRole('button', { name: /^Spec: / })
      await switcher.click()
      const count = await page.getByRole('menuitem').count()
      await page.keyboard.press('Escape')
      const seen = new Set<string>()
      for (let i = 0; i < count; i++) {
        await switcher.click()
        await page.getByRole('menuitem').nth(i).click()
        const className = switcher.locator('span > span').nth(1)
        const name = await className.innerText()
        if (seen.has(name)) continue
        seen.add(name)
        await page.mouse.move(1, 700)
        const rest = ratio(await colours(className))
        await switcher.hover()
        const hovered = ratio(await colours(className))
        console.log(`${colorScheme} ${name}: ${rest.toFixed(2)}:1 on the navy, ${hovered.toFixed(2)}:1 hovered`)
        expect.soft(rest, `${name} at rest`).toBeGreaterThanOrEqual(4.5)
        expect.soft(hovered, `${name} hovered`).toBeGreaterThanOrEqual(4.5)
        // Hovered is a visible fill, not the navy itself.
        expect(isNavy((await colours(switcher, 'fill')).front), `${name}: a hover fill`).toBe(false)
      }
      expect(seen.size).toBe(9)
    })

    test('a toolbar button’s focus ring is 3:1 on the navy, and its icon is the header’s text colour', async ({ page }) => {
      await page.goto('./')
      await noTransitions(page)
      const share = page.getByRole('banner').getByRole('button', { name: /Share/ })
      await page.keyboard.press('Shift')
      await share.focus()
      const ring = await share.evaluate((el) => {
        const found = getComputedStyle(el)
          .boxShadow.split(/,(?![^(]*\))/)
          .map((s) => s.trim())
          .find((s) => /\b0px 0px 0px 3px\b/.test(s))
        return found?.replace(/\s*-?[\d.]+px/g, '').trim() ?? ''
      })
      expect(ring).not.toBe('')
      // The ring colour composited over the navy, against the navy.
      const composited = await page.evaluate((css) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.fillStyle = '#1f1c3d'
        ctx.fillRect(0, 0, 1, 1)
        ctx.fillStyle = css
        ctx.fillRect(0, 0, 1, 1)
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
      }, ring)
      expect(ratio({ front: composited, behind: [0x1f, 0x1c, 0x3d] })).toBeGreaterThanOrEqual(3)
      expect(ratio(await colours(share.locator('svg')))).toBeGreaterThanOrEqual(12)
    })

    test('tooltips take the popover’s colours, with AA text and the notice colour for a reason', async ({ page }) => {
      await page.goto('./')
      await noTransitions(page)
      await page.getByRole('tab', { name: 'Talents', exact: true }).click()
      // Cruelty's point can't come back while Fury's deeper talents need it: the tooltip says why.
      await page.getByRole('button', { name: /^Cruelty, / }).hover()
      const tip = page.locator('[data-slot="tooltip-content"]')
      await expect(tip).toBeVisible()
      const fill = await colours(tip, 'fill')
      const popover = await page.evaluate(() => {
        const probe = document.createElement('div')
        probe.className = 'bg-popover'
        document.body.append(probe)
        const c = getComputedStyle(probe).backgroundColor
        probe.remove()
        return c
      })
      expect(await tip.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(popover)
      // Light on light, dark on dark: never the inverted box.
      expect(lum(fill.front) > 0.5, `tooltip fill ${fill.front}`).toBe(colorScheme === 'light')
      expect(await tip.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px')
      expect(ratio(await colours(tip.getByText('Cruelty', { exact: true })))).toBeGreaterThanOrEqual(4.5)
      const reason = tip.getByText(/^Can’t remove a point/)
      const notice = ratio(await colours(reason))
      console.log(`${colorScheme} talent tooltip: the reason ${notice.toFixed(2)}:1`)
      expect(notice).toBeGreaterThanOrEqual(4.5)
      expect(await reason.evaluate((el) => el.closest('p')!.className)).toContain('text-notice')
      // The arrow is the tooltip's own surface.
      expect(await tip.locator('svg').last().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(popover)
    })
  })
}

test.describe('light', () => {
  test.use({ colorScheme: 'light' })

  test('the page is a soft grey-blue, panels on it are white with a shadow, and muted text is AA on both', async ({ page }) => {
    await page.goto('./')
    const page_ = (await colours(page.locator('body'), 'fill')).front
    // #f4f4fa: light, and leaning blue.
    expect(lum(page_)).toBeGreaterThan(0.85)
    expect(lum(page_)).toBeLessThan(0.95)
    expect(page_[2]).toBeGreaterThan(page_[0])
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    const tree = page.getByRole('region', { name: 'Arms tree' })
    expect((await colours(tree, 'fill')).front).toEqual([255, 255, 255])
    expect(await tree.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none')
    // Muted text on the page (the tab's summary line) and on a white panel.
    expect(ratio(await colours(page.getByText(/points left$/)))).toBeGreaterThanOrEqual(4.5)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const muted = page.getByRole('tabpanel', { name: 'Buffs' }).getByText('Raid buffs follow who’s in the raid', { exact: false })
    expect(ratio(await colours(muted))).toBeGreaterThanOrEqual(4.5)
  })
})

test.describe('dark', () => {
  test.use({ colorScheme: 'dark' })

  test('panels keep no fill of their own, and the header stands a step above the page', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    const tree = page.getByRole('region', { name: 'Arms tree' })
    expect(await tree.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    const body = (await colours(page.locator('body'), 'fill')).front
    const header = (await colours(page.getByRole('banner'), 'fill')).front
    expect(lum(header)).toBeGreaterThan(lum(body))
  })
})
