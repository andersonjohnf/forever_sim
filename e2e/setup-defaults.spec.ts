import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Defaults on the setup screens (docs/ux.md "Character", "Buffs", "Fight", checklist 3): marked,
// and each changed setting shows its default with a Reset. Classic Era rules say so where their
// values show. Dimmed rows are dimmed by colour, not opacity, so their text stays AA.

/**
 * WCAG contrast of an element's text against what's behind it, compositing translucent colours
 * and ancestors' opacity (as in shell-a11y.spec.ts).
 */
const contrast = (locator: Locator) =>
  locator.first().evaluate((el) => {
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
    const [hi, lo] = [lum(paint(el, true)), lum(paint(el, false))].sort((a, b) => b - a)
    return (hi + 0.05) / (lo + 0.05)
  })

/** Every point of a 44 × 44 px square centred on the element hits it (its hit area, pseudo-elements included). */
const hitArea44 = (locator: Locator) =>
  locator.evaluate((el) => {
    el.scrollIntoView({ block: 'center' })
    const box = el.getBoundingClientRect()
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]
    const misses: string[] = []
    for (const dx of [-21, 0, 21]) for (const dy of [-21, 0, 21]) {
      const hit = document.elementFromPoint(cx + dx, cy + dy)
      if (!hit || !(hit === el || el.contains(hit))) misses.push(`${dx},${dy}`)
    }
    return misses
  })

test.describe('defaults', () => {
  test('Buffs marks the default preset', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const presets = page.getByRole('radiogroup', { name: 'Preset' })
    await expect(presets.getByRole('radio', { name: 'Standard raid (default)' })).toHaveAttribute('aria-checked', 'true')
    await expect(presets.getByText('(default)')).toHaveCount(1)
  })

  test('a changed Fight setting shows its default, and its Reset puts it back and keeps focus on it', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Fight' })
    await expect(tab.getByText(/^Default:/)).toHaveCount(0)

    const length = tab.getByRole('slider', { name: 'Fight length' })
    await length.focus()
    await page.keyboard.press('ArrowRight')
    await expect(tab.getByText('Default: 3:00')).toBeVisible()
    await expect(length).toHaveAccessibleDescription('Changed. Default: 3:00')
    expect(await hitArea44(tab.getByRole('button', { name: 'Reset Fight length to 3:00' }))).toEqual([])
    await tab.getByRole('button', { name: 'Reset Fight length to 3:00' }).click()
    await expect(length).toHaveAttribute('aria-valuetext', '3 minutes')
    await expect(length).toBeFocused()
    await expect(tab.getByText('Default: 3:00')).toHaveCount(0)

    await tab.getByRole('radio', { name: 'In front' }).click()
    await expect(tab.getByText('In front of the boss, it can parry and block your attacks.')).toBeVisible()
    await tab.getByRole('button', { name: 'Reset Position to Behind' }).click()
    await expect(tab.getByRole('radio', { name: 'Behind' })).toBeFocused()
    await expect(tab.getByRole('radio', { name: 'Behind' })).toHaveAttribute('aria-checked', 'true')
  })

  test('Fight’s Advanced opens by itself when a setting in it is changed, and counts them', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Fight' })
    await tab.getByRole('button', { name: 'Advanced' }).click()
    await tab.getByRole('button', { name: 'Decrease Boss level' }).click()
    const damage = tab.getByRole('textbox', { name: 'Damage you take' })
    await damage.fill('100')
    await damage.press('Enter')

    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    const advanced = tab.getByRole('button', { name: 'Advanced, 2 changed' })
    await expect(advanced).toHaveAttribute('aria-expanded', 'true')
    await expect(tab.getByText('Default: 63')).toBeVisible()
    await expect(damage).toHaveAccessibleDescription('Changed. Default: 0/s')
    await tab.getByRole('button', { name: 'Reset Boss level to 63' }).click()
    await expect(tab.getByRole('textbox', { name: 'Boss level' })).toHaveValue('63')
    await expect(tab.getByRole('textbox', { name: 'Boss level' })).toBeFocused()
    await expect(tab.getByRole('button', { name: 'Advanced, 1 changed' })).toBeVisible()
  })

  test('Fight fields’ accessible names match their visible labels (WCAG 2.5.3)', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('button', { name: 'Advanced' }).click()
    for (const name of ['Execute phase starts at', 'Damage you take', 'Length variation', 'Boss level']) {
      await expect(page.getByRole('textbox', { name, exact: true })).toBeVisible()
      await expect(page.getByText(name, { exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Increase execute phase start' })).toBeVisible()
  })

  test('Character: a changed race and rules show their defaults, and reset', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Character' })
    await expect(tab.getByText(/^Default:/)).toHaveCount(0)

    await tab.getByRole('radio', { name: 'Dwarf' }).click()
    await expect(tab.getByRole('radiogroup', { name: 'Race' })).toHaveAccessibleDescription('Changed. Default: Human')
    await tab.getByRole('button', { name: 'Reset Race to Human' }).click()
    await expect(tab.getByRole('radio', { name: 'Human' })).toHaveAttribute('aria-checked', 'true')
    await expect(tab.getByRole('radio', { name: 'Human' })).toBeFocused()

    await tab.getByRole('button', { name: 'Advanced' }).click()
    const rules = tab.getByRole('radiogroup', { name: 'Rules' })
    await expect(rules).toHaveAccessibleDescription(/^Forever uses the Forever client’s numbers.*Racials, talents, your other abilities and gear stay Forever’s\.$/)
    await rules.getByRole('radio', { name: 'Classic Era' }).click()
    await expect(rules).toHaveAccessibleDescription(/Changed\. Default: Forever$/)
    await expect(tab.getByRole('button', { name: 'Advanced, 1 changed' })).toBeVisible()
    await tab.getByRole('button', { name: 'Reset Rules to Forever' }).click()
    await expect(rules.getByRole('radio', { name: 'Forever' })).toBeFocused()
    await expect(rules.getByRole('radio', { name: 'Forever' })).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('Classic Era rules', () => {
  test('Buffs and the enchant picker say they show Classic Era values, and link to the setting', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await expect(page.getByText('Classic Era values.')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('button', { name: 'Advanced' }).click()
    await page.getByRole('radiogroup', { name: 'Rules' }).getByRole('radio', { name: 'Classic Era' }).click()

    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await page.getByRole('button', { name: /^Hands enchant:/ }).click()
    await expect(page.getByRole('dialog', { name: 'Hands enchant' })).toContainText('Classic Era values. Enchants use Classic Era’s numbers')
    await page.keyboard.press('Escape')

    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const note = page.getByRole('tabpanel', { name: 'Buffs' }).locator('p').filter({ hasText: 'Classic Era values.' })
    await expect(note).toContainText('Raid buffs, debuffs and consumables use Classic Era’s numbers, as set in Character → Advanced.')
    expect(await hitArea44(note.getByRole('button', { name: 'Character → Advanced' }))).toEqual([])
    await note.getByRole('button', { name: 'Character → Advanced' }).click()
    await expect(page.getByRole('tab', { name: 'Character', exact: true })).toHaveAttribute('aria-selected', 'true')
    // Advanced opened by itself (Classic Era isn't the default), on the rule profile.
    await expect(page.getByRole('button', { name: 'Advanced, 1 changed' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('radiogroup', { name: 'Rules' }).getByRole('radio', { name: 'Classic Era' })).toBeFocused()
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`dimmed by colour, ${colorScheme}`, () => {
    test.use({ colorScheme })

    test('dependent Rotation rows, unavailable buffs and locked talents keep AA text, with no opacity', async ({ page }) => {
      await page.goto('./')
      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      await page.getByRole('switch', { name: 'Death Wish', exact: true }).click()
      const row = page.locator('[data-inactive]').filter({ has: page.getByRole('switch', { name: 'Save the last Death Wish for the end', exact: true }) })
      await expect(row).toHaveCSS('opacity', '1')
      expect(await contrast(row.getByText('Save the last Death Wish for the end'))).toBeGreaterThanOrEqual(4.5)
      expect(await contrast(row.getByText(/^When no later Death Wish/))).toBeGreaterThanOrEqual(4.5)
      // The dependent switch is on, on a neutral track rather than the primary colour.
      const dimmedSwitch = row.getByRole('switch')
      await expect(dimmedSwitch).toBeChecked()
      const primary = await page.getByRole('switch', { name: 'Recklessness', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(await dimmedSwitch.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(primary)

      await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
      await page.getByRole('button', { name: 'Paladin', exact: true }).click()
      const kings = page.locator('[data-unavailable]').filter({ has: page.getByRole('switch', { name: 'Blessing of Kings' }) })
      await expect(kings).toHaveCSS('opacity', '1')
      for (const text of ['Blessing of Kings', 'Needs a paladin in the raid']) expect(await contrast(kings.getByText(text, { exact: true }))).toBeGreaterThanOrEqual(4.5)

      await page.getByRole('tab', { name: 'Talents', exact: true }).click()
      await page.getByRole('button', { name: 'Clear' }).click()
      // Locked: nothing in the Fury tree yet.
      const badge = page.getByRole('button', { name: 'Bloodthirst, 0 of 1' }).getByText('0/1', { exact: true })
      await expect(badge).toHaveCSS('opacity', '1')
      expect(await contrast(badge)).toBeGreaterThanOrEqual(4.5)
    })
  })
}
