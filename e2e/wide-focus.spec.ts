import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Review finding DL2-3 (D34): a layout that changes under focus keeps it on the same control, as
// Gear's does when the window crosses 1440 px (e2e/wide-gear.spec.ts). Fight's and Character's
// Advanced is a disclosure below 1440 px and shown open from there, the same elements either way
// (src/features/section.tsx), so a window crossing 1440 px (browser zoom, snapping a window) leaves
// focus where it was, with the disclosure open. The selected Rotation row's settings are inline
// under the row below a 72 rem setup pane and a panel in the third column from there
// (src/features/rotation/layout.ts), so crossing about 1,850 px moves them to new elements, and
// focus goes with them to the same control.

const openSpec = async (page: Page, spec: string, section: string, width: number, height = 900): Promise<Locator> => {
  await page.setViewportSize({ width, height })
  await page.goto('./')
  await page.evaluate(
    ([spec, section]) =>
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config: { version: 1, spec }, bySpec: {}, section }, version: 1 })),
    [spec, section],
  )
  await page.reload()
  const name = section[0].toUpperCase() + section.slice(1)
  return page.getByRole('tabpanel', { name })
}

const resize = (page: Page, width: number, height = 900) => page.setViewportSize({ width, height })

test.describe('focus through a change of layout', () => {
  test('a Fight Advanced setting keeps focus as the window crosses 1440 px, and Advanced stays open', async ({ page }) => {
    const fight = await openSpec(page, 'warrior-protection', 'fight', 1440)
    await expect(fight.getByRole('region', { name: 'Advanced' })).toBeVisible()
    for (const name of ['Random seed', 'Boss swing speed']) {
      const control = fight.getByRole('textbox', { name })
      await control.focus()
      await resize(page, 1439)
      // Below 1440 px it's a disclosure again, open, with the setting still focused.
      await expect(fight.getByRole('button', { name: 'Advanced' })).toHaveAttribute('aria-expanded', 'true')
      await expect(control).toBeFocused()
      await resize(page, 1440)
      await expect(fight.getByRole('button', { name: /^Advanced/ })).toHaveCount(0)
      await expect(control).toBeFocused()
    }
    // A switch, and the creature type's menu button, too.
    const crushing = fight.getByRole('switch', { name: 'Crushing blows' })
    await crushing.focus()
    await resize(page, 1439)
    await expect(crushing).toBeFocused()
    await resize(page, 1440)
    await expect(crushing).toBeFocused()
  })

  test('a Fight Advanced setting keeps focus as the window widens past 1440 px from a disclosure', async ({ page }) => {
    const fight = await openSpec(page, 'warrior-fury', 'fight', 1439)
    await fight.getByRole('button', { name: 'Advanced' }).click()
    const creature = fight.getByRole('combobox', { name: 'Creature type' })
    await creature.focus()
    await resize(page, 1440)
    await expect(fight.getByRole('region', { name: 'Advanced' })).toBeVisible()
    await expect(creature).toBeFocused()
  })

  test('a Character Advanced setting keeps focus as the window crosses 1440 px', async ({ page }) => {
    const character = await openSpec(page, 'paladin-protection', 'character', 1440)
    const ratings = character.getByRole('switch', { name: 'Count untested ratings' })
    await ratings.focus()
    await resize(page, 1439)
    await expect(character.getByRole('button', { name: 'Advanced' })).toHaveAttribute('aria-expanded', 'true')
    await expect(ratings).toBeFocused()
    await resize(page, 1440)
    await expect(ratings).toBeFocused()
  })

  test('a Rotation row’s settings keep focus on the same control as they move between inline and the third column', async ({ page }) => {
    const tab = await openSpec(page, 'warrior-fury', 'rotation', 1600, 1000)
    const list = tab.getByRole('list', { name: 'Priority list' })
    await list.getByRole('button', { name: 'Bloodrage', exact: true }).click()
    const inline = page.locator('[data-apl-row="bloodrage"]').getByRole('region', { name: 'Bloodrage settings' })
    const panel = page.getByRole('complementary', { name: 'Bloodrage settings' })

    // Its switch: inline at 1600 px, then in the panel at 1920 px, and back.
    await inline.getByRole('switch', { name: 'Use Bloodrage', exact: true }).focus()
    await resize(page, 1920, 1000)
    await expect(panel.getByRole('switch', { name: 'Use Bloodrage', exact: true })).toBeFocused()
    await resize(page, 1600, 1000)
    await expect(inline.getByRole('switch', { name: 'Use Bloodrage', exact: true })).toBeFocused()

    // Move down, a button without an id: the same button by its place in the settings.
    await inline.getByRole('button', { name: 'Move down' }).focus()
    await resize(page, 1920, 1000)
    await expect(panel.getByRole('button', { name: 'Move down' })).toBeFocused()
    await resize(page, 1600, 1000)
    await expect(inline.getByRole('button', { name: 'Move down' })).toBeFocused()

    // Focus that left the settings stays where it went.
    const row = list.getByRole('button', { name: 'Whirlwind', exact: true })
    await list.getByRole('switch', { name: 'Whirlwind', exact: true }).focus()
    await resize(page, 1920, 1000)
    await expect(list.getByRole('switch', { name: 'Whirlwind', exact: true })).toBeFocused()
    await expect(row).not.toBeFocused()
  })
})
