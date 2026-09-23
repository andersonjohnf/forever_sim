import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Third-pass UX fixes on the setup tabs (docs/ux.md "Sections", "Layout"): the enchant listbox's
// active option (TU6), a Reset's hit area clear of the control above (TU7), the fixed number of
// fights (TU8) and the scroll after a tab switch (TU11); and from the M2.4i review, the caret a
// click or tap places in a grouped number field (UX14) and the "Damage you take" help (LX10, UX5).

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
    const reset = tab.getByRole('button', { name: 'Reset Boss level, default 63' })
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
    const reset = page.getByRole('button', { name: 'Reset Slam, default off' })
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
  // Still editing: the plain number (M2.4e). Its separators come back once you leave.
  await expect(fights).toHaveValue('12500')
  await expect(fights).toHaveAccessibleDescription('Changed. Default: 3,000')
  await tab.getByRole('button', { name: 'Increase Number of fights' }).click()
  await expect(fights).toHaveValue('12,600')
  await tab.getByRole('button', { name: 'Reset Number of fights, default 3,000' }).click()
  // Reset hands focus to the field, which shows the plain number while it has focus.
  await expect(fights).toBeFocused()
  await expect(fights).toHaveValue('3000')
  await fights.blur()
  await expect(fights).toHaveValue('3,000')
})

test('number fields read what’s typed in the typist’s own style (PV2, FV3)', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Fight', exact: true }).click()
  const fight = page.getByRole('tabpanel', { name: 'Fight' })
  await fight.getByRole('button', { name: 'Advanced' }).click()
  await fight.getByRole('radio', { name: 'Fixed' }).click()
  const fights = fight.getByRole('textbox', { name: 'Number of fights', exact: true })
  for (const typed of ['5.000', '5 000', '5,000']) {
    // Focused first, as a person would: fill() selects before it focuses, and focusing swaps
    // "3,000" for "3000".
    await fights.focus()
    await fights.fill(typed)
    await fights.press('Enter')
    await expect(fights, typed).toHaveValue('5000')
    await fights.blur()
    await expect(fights, typed).toHaveValue('5,000')
    await fights.focus()
    await fights.fill('3000')
    await fights.press('Enter')
  }
  // Editing shows the plain number, so deleting a digit or adding one never meets the field's
  // own separators (RV1: "3,00" had read as 3).
  await fights.blur()
  await expect(fights).toHaveValue('3,000')
  await fights.focus()
  await expect(fights).toHaveValue('3000')
  await fights.press('End')
  await fights.press('Backspace')
  await fights.blur()
  await expect(fights).toHaveValue('300')
  await fights.focus()
  await fights.press('End')
  await fights.pressSequentially('00')
  await fights.blur()
  await expect(fights).toHaveValue('30,000')
  // Tab into it, which selects the whole field, and type: the new number replaces the old one.
  await page.getByRole('button', { name: 'Decrease Number of fights' }).focus()
  await page.keyboard.press('Tab')
  await expect(fights).toBeFocused()
  await page.keyboard.type('4500')
  await fights.blur()
  await expect(fights).toHaveValue('4,500')
  // A whole-number field reads a decimal comma as the decimal point too, and rounds (QV3).
  const variation = fight.getByRole('textbox', { name: 'Length variation', exact: true })
  await variation.fill('2,5')
  await variation.press('Enter')
  await expect(variation).toHaveValue('3')

  // A fractional field reads a decimal comma as the decimal point.
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  await page.getByRole('button', { name: 'Advanced settings for Core abilities' }).click()
  const btLeft = page.getByRole('textbox', { name: 'Whirlwind: Bloodthirst cooldown left', exact: true })
  await btLeft.fill('0,5')
  await btLeft.press('Enter')
  await expect(btLeft).toHaveValue('0.5')
  // Its steppers leave no float noise (QV2): 0.5 + 0.1 + 0.1 is 0.7, not 0.7000000000000001.
  const more = page.getByRole('button', { name: 'Increase Whirlwind: Bloodthirst cooldown left' })
  await more.click()
  await more.click()
  await expect(btLeft).toHaveValue('0.7')
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

/**
 * A point in a centred text field's shown text, as a person would click it: the boundary before
 * character `i`, or with `side`, a quarter of a comma's width right (1) or left (−1) of character
 * `i`'s middle. That is where the comma's going moves the nearest boundary: the text re-centres
 * half a comma to the right, and what follows the comma moves half a comma left.
 */
const spot = (field: Locator, i: number, side = 0) =>
  field.evaluate(
    (el, [index, towards]) => {
      const input = el as HTMLInputElement
      const cs = getComputedStyle(input)
      const span = document.createElement('span')
      Object.assign(span.style, { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle, fontVariantNumeric: cs.fontVariantNumeric, fontFeatureSettings: cs.fontFeatureSettings, letterSpacing: cs.letterSpacing, position: 'absolute', whiteSpace: 'pre', visibility: 'hidden' })
      document.body.append(span)
      const width = (text: string) => {
        span.textContent = text
        return span.getBoundingClientRect().width
      }
      const full = width(input.value)
      const before = width(input.value.slice(0, index))
      const offset = towards === 0 ? 0 : width(input.value[index]) / 2 + (towards * width(',')) / 4
      span.remove()
      const box = input.getBoundingClientRect()
      const left = box.left + Number.parseFloat(cs.borderLeftWidth) + Number.parseFloat(cs.paddingLeft)
      const inner = input.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight)
      return { x: left + (inner - full) / 2 + before + offset, y: box.top + box.height / 2 }
    },
    [i, side] as const,
  )

/** The field's text and its selection. */
const caret = (field: Locator) =>
  field.evaluate((el) => {
    const input = el as HTMLInputElement
    return [input.value, input.selectionStart, input.selectionEnd]
  })

for (const device of ['mouse', 'touch'] as const) {
  test(`a ${device === 'mouse' ? 'click' : 'tap'} in a grouped number field puts the caret where it lands, the comma gone (UX14)`, async ({ browser }) => {
    const context = await browser.newContext(device === 'touch' ? PHONE : {})
    const page = await context.newPage()
    await page.goto('./')
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('radio', { name: /Custom/ }).click()
    const armor = page.getByRole('textbox', { name: 'Custom boss armor', exact: true })
    // Tab in, which selects the whole field, and type: the new number replaces the old one.
    await page.getByRole('button', { name: 'Decrease Custom boss armor' }).focus()
    await page.keyboard.press('Tab')
    await expect(armor).toBeFocused()
    await page.keyboard.type('5000')
    await page.keyboard.press('Tab')
    await expect(armor).toHaveValue('5,000')

    const tap = async (i: number, side = 0) => {
      const at = await spot(armor, i, side)
      if (device === 'mouse') await page.mouse.click(at.x, at.y)
      else {
        // Apart enough that the taps aren't a double tap, which selects the number.
        await page.waitForTimeout(600)
        await page.touchscreen.tap(at.x, at.y)
      }
      await expect(armor).toBeFocused()
    }
    const press = async (i: number, side = 0) => {
      await tap(i, side)
      const state = await caret(armor)
      await armor.blur()
      await expect(armor).toHaveValue('5,000')
      return state
    }
    // "5,000" becomes "5000", and the caret goes where it landed in "5,000", counted in digits:
    // between "5" and ",", just after the comma, and before the last "0".
    expect(await press(1)).toEqual(['5000', 1, 1])
    expect(await press(2)).toEqual(['5000', 1, 1])
    expect(await press(4)).toEqual(['5000', 3, 3])
    // Just right of the middle of "5": after it. Just left of the middle of the first and the
    // last "0": before each. Placed after the swap, these landed a place off.
    expect(await press(0, 1)).toEqual(['5000', 1, 1])
    expect(await press(2, -1)).toEqual(['5000', 1, 1])
    expect(await press(4, -1)).toEqual(['5000', 3, 3])

    // What's typed goes in at the caret: "5" then "4", so 54,000, which the field's 10,000 caps.
    await tap(1)
    await page.keyboard.type('4')
    await expect(armor).toHaveValue('54000')
    await armor.blur()
    await expect(armor).toHaveValue('10,000')
    await context.close()
  })
}

test('the Damage you take help says it’s before armor, and that each hit gives rage and can trigger Enrage (LX10, UX5)', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Fight', exact: true }).click()
  const tab = page.getByRole('tabpanel', { name: 'Fight' })
  await tab.getByRole('button', { name: 'Advanced' }).click()
  await expect(tab.getByRole('textbox', { name: 'Damage you take', exact: true })).toBeVisible()
  await expect(
    tab.getByText('What the boss deals you per second, before your armor. Each hit gives rage and can trigger Enrage. At 0 you’re never hit.', { exact: true }),
  ).toBeVisible()
})
