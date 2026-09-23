import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Controls meet 3:1 against what's behind them, in both themes (docs/ux.md "Accessibility",
// WCAG 1.4.11; UX13): the border of a text field, a select, an outline button and a segmented
// choice (all drawn with --input), and an unchecked switch's track (--switch-off).

/**
 * The contrast of a control's edge (its top border, or with `fill`, its background) against the
 * colour behind it, both composited over the page the way a browser blends them; and, for a
 * border, against the control's own fill inside it.
 */
const edgeContrast = (control: Locator, fill = false) =>
  control.evaluate((el, useFill) => {
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
    for (let e = el.parentElement; e; e = e.parentElement) chain.unshift(e)
    const behind = chain.reduce((color, e) => over(parse(getComputedStyle(e).backgroundColor), color), [255, 255, 255, 1])
    const style = getComputedStyle(el)
    const edge = over(parse(useFill ? style.backgroundColor : style.borderTopColor), behind)
    const inside = over(parse(style.backgroundColor), behind)
    const lum = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    return { outside: ratio(edge, behind), inside: useFill ? Infinity : ratio(edge, inside) }
  }, fill)

for (const colorScheme of ['light', 'dark'] as const) {
  test(`text fields, selects, outline buttons, segmented choices and switches meet 3:1, ${colorScheme} (UX13)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    const check = async (name: string, control: Locator, fill = false) => {
      await expect(control, name).toBeVisible()
      const { outside, inside } = await edgeContrast(control, fill)
      console.log(`${colorScheme} ${name}: ${outside.toFixed(2)}:1 against what's behind it${fill ? '' : `, ${inside.toFixed(2)}:1 against its own fill`}`)
      expect.soft(outside, name).toBeGreaterThanOrEqual(3)
    }

    // The Fight tab, with a custom boss armor so its field and steppers show.
    await page.goto('./')
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    const fight = page.getByRole('tabpanel', { name: 'Fight' })
    await fight.getByRole('radio', { name: /Custom/ }).click()
    await fight.getByRole('button', { name: 'Advanced' }).click()
    await check('text field', fight.getByRole('textbox', { name: 'Custom boss armor', exact: true }))
    await check('outline button', fight.getByRole('button', { name: 'Decrease Custom boss armor' }))
    await check('segmented choice', fight.getByRole('radio', { name: /3,009/ }))
    await check('select', fight.getByRole('combobox', { name: 'Creature type' }))
    // An unchecked switch's track, on the Buffs tab.
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await check('switch, off', page.getByRole('tabpanel', { name: 'Buffs' }).getByRole('switch', { checked: false }).first(), true)
    // A field among the rotation's options.
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await page.getByRole('button', { name: 'Advanced settings for Core abilities' }).click()
    await check('rotation option field', page.getByRole('textbox', { name: 'Whirlwind: Bloodthirst cooldown left', exact: true }))
  })
}
