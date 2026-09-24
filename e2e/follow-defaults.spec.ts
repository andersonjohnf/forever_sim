import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/architecture.md "Following the defaults"; docs/ux.md "Persistence and sharing" and "Gear".

const toasts = (page: Page) => page.locator('[data-sonner-toast]')

/**
 * A Protection paladin saved before the threat set and today's talents: v1's defaults (the pre-raid
 * list's gear and the popular 2/42/7 build), except the head, which the player set: Helm of Valor.
 */
const OLD_PALADIN = {
  version: 1,
  spec: 'paladin-protection',
  talents: '2-4530513321301551-502',
  gear: {
    head: { itemId: 16731, enchantId: 'arcanumFocus' },
    neck: { itemId: 13091 },
    shoulder: { itemId: 14552 },
    back: { itemId: 11930, enchantId: 'cloakSuperiorDefense' },
    chest: { itemId: 14624, enchantId: 'chestGreaterStats' },
    wrist: { itemId: 13951, enchantId: 'bracerSuperiorStamina' },
    hands: { itemId: 14622, enchantId: 'gloveThreat' },
    waist: { itemId: 14620 },
    // v1's legs and weapon had no enchant yet.
    legs: { itemId: 14623 },
    feet: { itemId: 14621, enchantId: 'bootsGreaterAgility' },
    finger1: { itemId: 11669 },
    finger2: { itemId: 15855 },
    trinket1: { itemId: 11810 },
    trinket2: { itemId: 4130 },
    mainHand: { itemId: 871 },
    offHand: { itemId: 12602, enchantId: 'shieldGreaterStamina' },
  },
}

test.describe('a returning visitor’s untouched gear and talents follow the defaults', () => {
  test('an old save gets the new threat set and talents, keeps the player’s own head, and says so once', async ({ page }) => {
    await page.addInitScript((config) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config, bySpec: {}, section: 'gear' }, version: 1 }))
    }, OLD_PALADIN)
    await page.goto('./')

    const notice = toasts(page).filter({ hasText: 'Updated to the new default gear and talents for Protection Paladin' })
    await expect(notice).toHaveCount(1)
    await expect(notice).toContainText('Anything you changed yourself is kept.')

    const gear = page.getByRole('tabpanel', { name: 'Gear' })
    await expect(gear.getByRole('button', { name: "Shoulders: Lieutenant Commander's Lamellar Shoulders" })).toBeVisible()
    await expect(gear.getByRole('button', { name: 'Trinket 1: Weakness Analyzer' })).toBeVisible()
    await expect(gear.getByRole('button', { name: 'Head: Helm of Valor' })).toBeVisible()
    await expect(gear.getByText('1 slot differs from the threat set: Head.', { exact: true })).toBeVisible()

    // Today's default build, 0/38/13.
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await expect(page.getByRole('tabpanel', { name: 'Talents' }).getByText(/0\s*\/\s*38\s*\/\s*13/).first()).toBeVisible()

    // The load saved what follows, so a reload moves nothing and says nothing.
    await page.reload()
    await expect(page.getByRole('tabpanel', { name: 'Talents' })).toBeVisible()
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await expect(gear.getByRole('button', { name: 'Head: Helm of Valor' })).toBeVisible()
    await expect(toasts(page)).toHaveCount(0)
  })
})

test.describe('the Gear tab’s default set button (docs/ux.md "Gear")', () => {
  for (const width of [390, 1280]) {
    test(`says how the gear compares and puts the default set back, from the keyboard, ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const gear = page.getByRole('tabpanel', { name: 'Gear' })
      const equip = gear.getByRole('button', { name: 'Equip pre-raid best in slot' })
      await expect(gear.getByText('Wearing pre-raid best in slot.', { exact: true })).toBeVisible()
      await expect(equip).toHaveAccessibleDescription('Wearing pre-raid best in slot.')
      expect((await equip.boundingBox())!.height).toBeGreaterThanOrEqual(44)

      await gear.getByRole('button', { name: 'Gear options' }).click()
      await page.getByRole('menuitem', { name: 'Remove all gear' }).click()
      await expect(page.getByRole('menuitem', { name: /Equip/ })).toHaveCount(0)
      const differs = 'slots differ from pre-raid best in slot: Head, Neck, Shoulders and '
      await expect(equip).toHaveAccessibleDescription(new RegExp(`^\\d+ ${differs}\\d+ more\\.$`))

      await equip.focus()
      await page.keyboard.press('Enter')
      await expect(gear.getByRole('button', { name: /^Head: Lionheart Helm/ })).toBeVisible()
      await expect(equip).toHaveAccessibleDescription('Wearing pre-raid best in slot.')
      // No horizontal scroll at either width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }
})
