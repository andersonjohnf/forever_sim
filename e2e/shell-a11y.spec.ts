import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#accessibility and #layout: the app shell (header, menus, tabs, sheets, toasts).

/** Every match is at least 44 px tall (after any open animation). */
const expectTouchTargets = async (locator: Locator) => {
  await expect(locator.first()).toBeVisible()
  await expect
    .poll(() => locator.evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().height))))
    .toBeGreaterThanOrEqual(44)
}

/**
 * WCAG contrast of an element's text (or, for `fill`, its background; for `ring`, its 3 px focus
 * ring) against what's behind it, compositing translucent colors and ancestors' opacity.
 */
const contrast = (locator: Locator, what: 'text' | 'fill' | 'ring' = 'text') =>
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
    const mix = (a: number[], b: number[], t: number) => [0, 1, 2].map((i) => a[i] * t + b[i] * (1 - t)).concat(1)
    const paint = (target: Element, withText: boolean) => {
      const chain: Element[] = []
      for (let e: Element | null = target; e; e = e.parentElement) chain.unshift(e)
      const render = (i: number, behind: number[]): number[] => {
        const style = getComputedStyle(chain[i])
        let c = over(parse(style.backgroundColor), behind)
        c = i === chain.length - 1 ? (withText ? over(parse(style.color), c) : c) : render(i + 1, c)
        const opacity = Number(style.opacity)
        return opacity < 1 ? mix(c, behind, opacity) : c
      }
      return render(0, [255, 255, 255, 1])
    }
    const lum = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    /** The color of the element's 3 px ring (Tailwind's `ring-3`), from its box shadows; none yet (mid-transition): transparent. */
    const ring = () => {
      const shadows = getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/)
      const found = shadows.map((s) => s.trim()).find((s) => /\b0px 0px 0px 3px\b/.test(s))
      return found ? parse(found.replace(/\s*-?[\d.]+px/g, '').trim()) : [0, 0, 0, 0]
    }
    const [fg, bg] =
      what === 'text'
        ? [paint(el, true), paint(el, false)]
        : what === 'ring'
          ? [over(ring(), paint(el.parentElement!, false)), paint(el.parentElement!, false)]
          : [paint(el, false), paint(el.parentElement!, false)]
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
    return (hi + 0.05) / (lo + 0.05)
  }, what)

test.describe('header', () => {
  test('has the page’s one heading 1, naming the app', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Forever Sim')
  })

  test('menu items and section tabs are 44 px touch targets', async ({ page }) => {
    await page.goto('./')
    await expectTouchTargets(page.getByRole('tab'))
    await page.getByRole('button', { name: /^Spec: / }).click()
    await expectTouchTargets(page.getByRole('menuitem'))
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'More' }).click()
    await expectTouchTargets(page.getByRole('menuitem'))
  })

  test('section tabs: arrow keys move between them, Enter or Space opens one', async ({ page }) => {
    await page.goto('./')
    const tab = (name: string) => page.getByRole('tab', { name, exact: true })
    await tab('Gear').focus()
    // Radix moves focus on a timer after each arrow key, so each press waits for it.
    await page.keyboard.press('ArrowRight')
    await expect(tab('Buffs')).toBeFocused()
    await expect(tab('Gear')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(tab('Buffs')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { level: 2, name: 'Buffs', exact: true })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(tab('Gear')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(tab('Talents')).toBeFocused()
    await expect(tab('Buffs')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press(' ')
    await expect(tab('Talents')).toHaveAttribute('aria-selected', 'true')
  })
})

test.describe('About', () => {
  const openAbout = async (page: Page) => {
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'About & data' }).click()
  }

  test('takes focus when it opens and gives it back to the menu button when it closes', async ({ page }) => {
    await page.goto('./')
    await openAbout(page)
    await expect(page.getByRole('heading', { name: 'About Forever Sim' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('button', { name: 'More' })).toBeFocused()

    await openAbout(page)
    const close = page.getByRole('dialog').getByRole('button', { name: 'Close' })
    await expectTouchTargets(close)
    await close.click()
    await expect(page.getByRole('button', { name: 'More' })).toBeFocused()
  })

  test('says what the app is, as the page’s description does, and lists the specs it covers', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await expect(page.getByRole('menuitem').first()).toBeVisible()
    const items = await page.getByRole('menuitem').allInnerTexts()
    const specs = items.map((text) => text.split('\n')[0].trim())
    // The switcher labels each spec's role ("DPS" or "Tank") on its second line.
    const roles = items.map((text) => text.split('\n')[1]?.trim())
    expect(roles.every((role) => role === 'DPS' || role === 'Tank'), `roles: ${roles.join(', ')}`).toBe(true)
    const hasTank = roles.includes('Tank')
    await page.keyboard.press('Escape')
    const meta = await page.locator('meta[name="description"]').getAttribute('content')
    const og = await page.locator('meta[property="og:description"]').getAttribute('content')
    await openAbout(page)
    const sheet = page.getByRole('dialog')
    const about = await sheet.locator('[data-slot="sheet-description"]').innerText()
    // The description says what the app is, never which specs, so it holds as specs ship;
    // index.html has to be kept in step (its "DPS and TPS" once a tank spec ships).
    expect(meta).toBe(about)
    expect(og).toBe(about)
    expect(about).toMatch(hasTank ? /^A DPS and TPS simulator for WoW Forever\./ : /^A DPS simulator for WoW Forever\./)
    for (const spec of specs) expect(about).not.toContain(spec)
    // The specs it covers are listed on their own line.
    const coverage = await sheet.getByText(/^Covers /).innerText()
    for (const spec of specs) expect(coverage).toContain(spec)
    expect(about + coverage).not.toMatch(/coming soon/i)
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the results sheet takes focus and gives it back to Show results', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    const show = page.getByRole('button', { name: 'Show results' })
    await expect(show).toBeEnabled({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await show.click()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(show).toBeFocused()
  })

  test('the tab bar fades only the edges with more tabs past them', async ({ page }) => {
    await page.goto('./')
    const bar = page.getByRole('tablist')
    await expect(bar).toHaveAttribute('data-fade', 'right')
    await bar.evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
    await expect(bar).toHaveAttribute('data-fade', 'left')
    await bar.evaluate((el) => el.scrollTo({ left: (el.scrollWidth - el.clientWidth) / 2 }))
    await expect(bar).toHaveAttribute('data-fade', 'both')
    await bar.evaluate((el) => el.scrollTo({ left: 0 }))
    await expect(bar).toHaveAttribute('data-fade', 'right')
  })

  test('keyboard focus stays clear of the sticky header and the sim bar (WCAG 2.4.11)', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const header = (await page.locator('header').boundingBox())!
    const bar = (await page.locator('[data-sim-bar]').boundingBox())!
    await page.getByRole('switch').first().focus()
    let checked = 0
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      const focused = page.locator(':focus')
      if ((await focused.getAttribute('role')) !== 'switch') continue
      await expect
        .poll(async () => {
          const box = (await focused.boundingBox())!
          return box.y >= header.y + header.height && box.y + box.height <= bar.y
        }, { message: `${await focused.getAttribute('aria-label')} is clear of the header and the bar` })
        .toBe(true)
      checked++
    }
    expect(checked).toBeGreaterThan(20)
  })

  test('the header and tab bar’s bottom edge is kept for the page’s scroll padding', async ({ page }) => {
    await page.goto('./')
    const tabs = (await page.locator('[data-sticky-tabs]').boundingBox())!
    await expect
      .poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)))
      .toBeGreaterThanOrEqual(tabs.y + tabs.height + 4)
  })

  test('the chosen tab scrolls into view', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { section: 'fight' }, version: 1 }))
    })
    await page.goto('./')
    const bar = (await page.getByRole('tablist').boundingBox())!
    const fight = page.getByRole('tab', { name: 'Fight', exact: true })
    await expect(fight).toHaveAttribute('aria-selected', 'true')
    await expect.poll(async () => (await fight.boundingBox())!.x + (await fight.boundingBox())!.width).toBeLessThanOrEqual(bar.x + bar.width)
  })
})

// WCAG 2.4.11 (U34, RU3): going backwards, the page scrolls up, and a focused control must clear
// the sticky section tabs as well as the header.
for (const [width, device] of [
  [390, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  [1280, { viewport: { width: 1280, height: 900 } }],
] as const) {
  test.describe(`focus going backwards, ${width} px`, () => {
    test.use(device)

    for (const section of ['Buffs', 'Rotation']) {
      test(`Shift+Tab through ${section} keeps each control clear of the header, the tabs and the sim bar`, async ({ page }) => {
        await page.goto('./')
        await page.getByRole('tab', { name: section, exact: true }).click()
        const panel = page.locator(`[data-section="${section.toLowerCase()}"]`)
        // From the tab's last control, at the foot of the page, back up to the tab panel itself.
        await panel.locator('button:visible, input:visible').last().focus()
        let checked = 0
        for (let i = 0; i < 120; i++) {
          await page.keyboard.press('Shift+Tab')
          if (!(await panel.evaluate((el) => el.contains(document.activeElement) && el !== document.activeElement))) break
          /** How far the focused control reaches under the tabs or the phone's sim bar, in px. */
          const hidden = () =>
            page.evaluate(() => {
              const box = document.activeElement!.getBoundingClientRect()
              const tabs = document.querySelector('[data-sticky-tabs]')!.getBoundingClientRect()
              const bar = document.querySelector('[data-sim-bar]')!.getBoundingClientRect()
              const floor = bar.height > 0 ? bar.top : window.innerHeight
              return Math.max(0, tabs.bottom - box.top, box.bottom - floor)
            })
          const name = await page.evaluate(() => {
            const el = document.activeElement!
            const labelledBy = el.getAttribute('aria-labelledby')
            const label = labelledBy && document.getElementById(labelledBy.split(' ')[0])?.textContent
            return el.getAttribute('aria-label') || label || el.textContent?.slice(0, 40) || el.outerHTML.slice(0, 80)
          })
          await expect.poll(hidden, { message: `${name} is fully in view` }).toBe(0)
          checked++
        }
        expect(checked).toBeGreaterThan(10)
      })
    }
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`contrast, ${colorScheme}`, () => {
    test.use({ colorScheme })

    test('class colour, talent ranks and switches meet AA', async ({ page }) => {
      await page.goto('./')
      expect(await contrast(page.getByRole('button', { name: /^Spec: / }).getByText('Warrior', { exact: true }))).toBeGreaterThanOrEqual(4.5)

      await page.getByRole('tab', { name: 'Talents', exact: true }).click()
      const maxed = page.getByRole('button', { name: /^Improved Heroic Strike, 3 of 3/ }).getByText('3/3', { exact: true })
      expect(await contrast(maxed)).toBeGreaterThanOrEqual(4.5)
      await page.getByRole('button', { name: 'Clear' }).click()
      await page.getByRole('button', { name: /^Cruelty, 0 of 5/ }).click()
      const partial = page.getByRole('button', { name: /^Cruelty, 1 of 5/ }).getByText('1/5', { exact: true })
      expect(await contrast(partial)).toBeGreaterThanOrEqual(4.5)

      await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
      // Controls: 3:1 for the track (WCAG 1.4.11), off and on.
      expect(await contrast(page.locator('[role=switch][data-state=unchecked]:not([disabled])'), 'fill')).toBeGreaterThanOrEqual(3)
      expect(await contrast(page.locator('[role=switch][data-state=checked]:not([disabled])'), 'fill')).toBeGreaterThanOrEqual(3)
    })

    test('the focus ring meets 3:1 on the page and in a dialog (U33)', async ({ page }) => {
      await page.goto('./')
      await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
      // Keyboard modality, so programmatic focus shows the ring (:focus-visible).
      await page.keyboard.press('Shift')
      for (const control of [page.getByRole('switch', { name: 'Blessing of Might' }), page.getByRole('button', { name: 'Warrior', exact: true })]) {
        await control.focus()
        await expect(control).toBeFocused()
        await expect.poll(() => contrast(control, 'ring')).toBeGreaterThanOrEqual(3)
      }
      await page.getByRole('tab', { name: 'Gear', exact: true }).click()
      await page.getByRole('button', { name: 'Head: Lionheart Helm' }).click()
      const search = page.getByRole('dialog', { name: 'Choose head' }).getByLabel('Search items')
      await expect(search).toBeFocused()
      await expect.poll(() => contrast(search, 'ring')).toBeGreaterThanOrEqual(3)
    })

    test('the "Setup changed" badge isn’t dimmed with the stale result', async ({ page }) => {
      await page.goto('./')
      const results = page.getByRole('complementary', { name: 'Results' })
      await results.getByRole('button', { name: 'Simulate' }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('tab', { name: 'Character', exact: true }).click()
      await page.getByRole('radio', { name: /Orc/ }).click()
      const badge = results.getByText('Setup changed', { exact: true })
      await expect(badge).toBeVisible()
      expect(await contrast(badge)).toBeGreaterThanOrEqual(4.5)
    })
  })
}
