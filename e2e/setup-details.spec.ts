import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Third-pass UX fixes on the setup tabs (docs/ux.md "Sections", "Layout"): the enchant listbox's
// active option (TU6), a Reset's hit area clear of the control above (TU7), the fixed number of
// fights (TU8) and the scroll after a tab switch (TU11).

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** Contrast of the active option's left bar against the option behind it, both composited over the page. */
const barContrast = (option: Locator) =>
  option.evaluate((el) => {
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
    for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e)
    const behind = chain.reduce((color, e) => over(parse(getComputedStyle(e).backgroundColor), color), [255, 255, 255, 1])
    const bar = over(parse(getComputedStyle(el, '::before').backgroundColor), behind)
    const lum = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const [hi, lo] = [lum(bar), lum(behind)].sort((a, b) => b - a)
    return { contrast: (hi + 0.05) / (lo + 0.05), width: Number.parseFloat(getComputedStyle(el, '::before').width) }
  })

/** A small link's hit area (its ::after), in the viewport. */
const hitArea = (link: Locator) =>
  link.evaluate((el) => {
    el.scrollIntoView({ block: 'center' })
    const box = el.getBoundingClientRect()
    const after = getComputedStyle(el, '::after')
    return {
      top: box.top + Number.parseFloat(after.top),
      bottom: box.bottom - Number.parseFloat(after.bottom),
      left: box.left + Number.parseFloat(after.left),
      right: box.right - Number.parseFloat(after.right),
    }
  })

/** Whether the point hits the element (or something inside it). */
const hits = (el: Locator, x: number, y: number) =>
  el.evaluate((node, [px, py]) => {
    const hit = document.elementFromPoint(px, py)
    return !!hit && (hit === node || node.contains(hit))
  }, [x, y] as const)

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the enchant listbox marks its active option at 3:1 or more, ${colorScheme} (TU6)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('./')
    await page.getByRole('button', { name: /, Hands enchant$/ }).click()
    const list = page.getByRole('listbox', { name: 'Hands enchants' })
    await expect(list).toBeFocused()
    await page.keyboard.press('ArrowDown')
    const active = list.locator('[data-active]')
    await expect(active).toHaveCount(1)
    await expect(active).toHaveAttribute('id', (await list.getAttribute('aria-activedescendant'))!)
    const { contrast, width } = await barContrast(active)
    expect(width).toBeGreaterThanOrEqual(3)
    expect(contrast).toBeGreaterThanOrEqual(3)
    // Only the active option has it.
    expect(await list.locator('[role=option]:not([data-active])').first().evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none')
  })
}

test.describe('a Reset’s hit area (TU7)', () => {
  test('is 44 px tall and stays clear of the field above it', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Fight' })
    await tab.getByRole('button', { name: 'Advanced' }).click()
    await tab.getByRole('button', { name: 'Decrease Boss level' }).click()
    const reset = tab.getByRole('button', { name: 'Reset Boss level to 63' })
    const area = await hitArea(reset)
    expect(area.bottom - area.top).toBeGreaterThanOrEqual(44)
    // Its hit area starts below the field's steppers and input.
    const above = (await tab.getByRole('button', { name: 'Decrease Boss level' }).boundingBox())!
    expect(area.top).toBeGreaterThanOrEqual(above.y + above.height)
    const x = (area.left + area.right) / 2
    expect(await hits(reset, x, area.top + 1)).toBe(true)
    expect(await hits(reset, x, area.bottom - 1)).toBe(true)
    expect(await hits(tab.getByRole('button', { name: 'Decrease Boss level' }), above.x + above.width / 2, above.y + above.height - 1)).toBe(true)
  })

  test('on a switch row, stays clear of the row it belongs to', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const slam = page.getByRole('switch', { name: 'Slam', exact: true })
    await slam.click()
    const reset = page.getByRole('button', { name: 'Reset Slam to off' })
    const area = await hitArea(reset)
    expect(area.bottom - area.top).toBeGreaterThanOrEqual(44)
    const row = (await page.locator('label').filter({ has: slam }).boundingBox())!
    expect(area.top).toBeGreaterThanOrEqual(row.y + row.height)
    // The row's last pixel still flips the switch.
    await page.mouse.click((area.left + area.right) / 2, row.y + row.height - 1)
    await expect(slam).not.toBeChecked()
  })
})

test('Fixed precision gives the number of fights its own labelled field, with separators (TU8)', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Fight', exact: true }).click()
  const tab = page.getByRole('tabpanel', { name: 'Fight' })
  await tab.getByRole('button', { name: 'Advanced' }).click()
  await tab.getByRole('radio', { name: 'Fixed' }).click()
  await expect(tab.getByText('Always runs exactly the number of fights you set below.')).toBeVisible()

  const label = tab.getByText('Number of fights', { exact: true })
  await expect(label).toBeVisible()
  await expect(tab.getByText('From 100 to 100,000. More fights give a narrower ± range, and take longer.')).toBeVisible()
  const fights = tab.getByRole('textbox', { name: 'Number of fights', exact: true })
  await expect(fights).toHaveValue('3,000')
  // The visible label is the field's label.
  await label.click()
  await expect(fights).toBeFocused()

  await fights.fill('12,500')
  await fights.press('Enter')
  await expect(fights).toHaveValue('12,500')
  await expect(fights).toHaveAccessibleDescription('Changed. Default: 3,000')
  await tab.getByRole('button', { name: 'Increase Number of fights' }).click()
  await expect(fights).toHaveValue('12,600')
  await tab.getByRole('button', { name: 'Reset Number of fights to 3,000' }).click()
  await expect(fights).toHaveValue('3,000')
  await expect(fights).toBeFocused()
})

test.describe('a tab switch from further down the page (TU11)', () => {
  test.use(PHONE)

  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    test(`starts the new section at its top, under the sticky tabs (${reducedMotion} motion)`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion })
      await page.goto('./')
      // Classic Era rules, so Gear opens with its note at the top.
      await page.getByRole('tab', { name: 'Character', exact: true }).click()
      await page.getByRole('button', { name: 'Advanced' }).click()
      await page.getByRole('radio', { name: 'Classic Era' }).click()

      await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)

      await page.getByRole('tab', { name: 'Gear', exact: true }).click()
      const tabs = page.locator('[data-sticky-tabs]')
      const heading = page.getByRole('heading', { level: 2, name: 'Gear', exact: true })
      const note = page.getByText('Classic Era values.').first()
      const clear = async (target: Locator) => {
        const bar = (await tabs.boundingBox())!
        const box = (await target.boundingBox())!
        return box.y >= bar.y + bar.height && box.y + box.height <= 844
      }
      await expect.poll(() => clear(heading)).toBe(true)
      await expect.poll(() => clear(note)).toBe(true)

      // A tab past the bar's edge, whose own scroll into view as the click focuses it mustn't cut
      // the page's scroll short.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)
      await page.getByRole('tab', { name: 'Fight', exact: true }).click()
      await expect.poll(() => clear(page.getByRole('heading', { level: 2, name: 'Fight', exact: true }))).toBe(true)
      await page.waitForTimeout(800)
      expect(await clear(page.getByRole('heading', { level: 2, name: 'Fight', exact: true }))).toBe(true)
      const fightTab = (await page.getByRole('tab', { name: 'Fight', exact: true }).boundingBox())!
      expect(fightTab.x + fightTab.width).toBeLessThanOrEqual(390)
    })
  }
})
