import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Controls meet 3:1 against what's behind them, in both themes (docs/ux.md "Accessibility",
// WCAG 1.4.11; UX13): the border of a text field, a select, an outline button (whatever its slot:
// "Gear options" is a menu's trigger, VF2), an outline badge that opens a popover (the gear flags,
// VF12) and a segmented choice (all drawn with --input), and an unchecked switch's track
// (--switch-off). And a destructive button's text is AA, at rest and on hover (VF1).

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

/** The contrast of a control's text against its own fill, both composited over what's behind it. */
const textContrast = (control: Locator) =>
  control.evaluate((el) => {
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
    const fill = chain.reduce((color, e) => over(parse(getComputedStyle(e).backgroundColor), color), [255, 255, 255, 1])
    const text = over(parse(getComputedStyle(el).color), fill)
    const lum = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const [hi, lo] = [lum(text), lum(fill)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  })

for (const colorScheme of ['light', 'dark'] as const) {
  test(`text fields, selects, outline buttons, flag badges, segmented choices and switches meet 3:1, ${colorScheme} (UX13, VF2, VF12)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    const check = async (name: string, control: Locator, fill = false) => {
      await expect(control, name).toBeVisible()
      const { outside, inside } = await edgeContrast(control, fill)
      console.log(`${colorScheme} ${name}: ${outside.toFixed(2)}:1 against what's behind it${fill ? '' : `, ${inside.toFixed(2)}:1 against its own fill`}`)
      expect.soft(outside, name).toBeGreaterThanOrEqual(3)
    }

    await page.goto('./')
    // The Fight tab, with a custom boss armor so its field and steppers show.
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

    // The Gear tab: the menu's outline button, and the flags on Blackblade of Shahram's row (Arms'
    // main hand), whose badge is their edge: the button around it has none.
    await page.getByRole('button', { name: /^Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    const gear = page.getByRole('tabpanel', { name: 'Gear' })
    await check('outline button that opens a menu (Gear options, VF2)', gear.getByRole('button', { name: 'Gear options' }))
    const mainHand = gear.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Main hand: Blackblade of Shahram' }) })
    for (const flag of ['Classic stats', 'Effect not simulated']) {
      const button = mainHand.getByRole('button', { name: flag, exact: true })
      await expect(button, flag).toHaveCSS('border-top-width', '0px')
      await check(`flag badge, ${flag} (VF12)`, button.locator('[data-slot="badge"]'))
    }
    // A badge that only labels something keeps the fainter edge.
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('menuitem', { name: 'About & data' }).click()
    const staticBadge = page.getByRole('dialog').locator('[data-slot="badge"][data-variant="outline"]')
    const faint = await edgeContrast(staticBadge)
    expect(faint.outside, 'a static badge’s edge').toBeLessThan(3)
    await page.keyboard.press('Escape')
  })

  // VF1: the Delete that confirms a save's deletion was red text on a 10% red tint, 4.0:1 in light
  // mode (3.3:1 on hover) and 3.8:1 on hover in dark mode, under AA's 4.5:1 for text.
  test(`a destructive button's text is AA at rest and on hover, and its focus ring 3:1, ${colorScheme} (VF1)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      const config = { version: 1, spec: 'warrior-fury' }
      localStorage.setItem('forever-sim:saved-setups', JSON.stringify({ version: 1, setups: [{ id: 'a', name: 'Raid night', savedAt: new Date().toISOString(), config }] }))
      sessionStorage.setItem('seeded', '1')
    })
    await page.goto('./')
    // No transitions, so hover's fill is measured as it ends, not partway.
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Setups…' }).click()
    const sheet = page.getByRole('dialog', { name: 'Setups' })
    await sheet.getByRole('button', { name: 'Delete Raid night' }).click()
    const confirm = sheet.getByRole('group', { name: 'Delete “Raid night”?' }).getByRole('button', { name: 'Delete', exact: true })
    await expect(confirm).toHaveAttribute('data-variant', 'destructive')

    const atRest = await textContrast(confirm)
    await confirm.hover()
    const onHover = await textContrast(confirm)
    console.log(`${colorScheme} destructive button text: ${atRest.toFixed(2)}:1 at rest, ${onHover.toFixed(2)}:1 on hover`)
    expect(onHover, 'the hover fill is darker than the rest fill').not.toBeCloseTo(atRest, 2)
    expect.soft(atRest, 'at rest').toBeGreaterThanOrEqual(4.5)
    expect.soft(onHover, 'on hover').toBeGreaterThanOrEqual(4.5)

    // Its focus ring, from the keyboard: Keep has focus, and Shift+Tab goes back to Delete.
    await page.mouse.move(0, 0)
    await sheet.getByRole('button', { name: 'Keep' }).focus()
    await page.keyboard.press('Shift+Tab')
    await expect(confirm).toBeFocused()
    const ring = await confirm.evaluate((el) => {
      const shadow = getComputedStyle(el).boxShadow
      // The ring is the shadow with a spread and no blur: "<color> 0px 0px 0px 3px".
      const match = shadow.match(/((?:rgba?|oklab|oklch|color)\([^)]*\)) 0px 0px 0px 3px/)
      return match ? match[1] : shadow
    })
    const contrast = await confirm.evaluate((el, ringColor) => {
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
      const lum = (c: number[]) => {
        const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
      }
      const [hi, lo] = [lum(over(parse(ringColor), behind)), lum(behind)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }, ring)
    console.log(`${colorScheme} destructive button focus ring ${ring}: ${contrast.toFixed(2)}:1`)
    expect.soft(contrast, 'focus ring').toBeGreaterThanOrEqual(3)
  })
}
