import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Rotation tab (docs/ux.md "Rotation"): its intro per spec, dependent switches, changed
// settings and their defaults, each heading's Advanced thresholds and their descriptions, Reset
// rotation, and consumables that need their Buffs switch.

const openRotation = async (page: Page) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('tabpanel', { name: 'Rotation' })
}

/** The Rotation tab of Arms, the second spec. */
const openArmsRotation = async (page: Page) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
  await page.getByRole('menuitem', { name: /Arms/ }).click()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('tabpanel', { name: 'Rotation' })
}

/** The row a switch sits in, if it's dimmed because the switch it depends on is off. */
const inactiveRow = (page: Page, name: string) => page.locator('[data-inactive]').filter({ has: page.getByRole('switch', { name, exact: true }) })

test.describe('rotation tab', () => {
  test('settings that depend on a switch sit under it and dim while it’s off', async ({ page }) => {
    const tab = await openRotation(page)
    const deathWish = tab.getByRole('listitem').filter({ has: page.getByRole('switch', { name: 'Death Wish', exact: true }) })
    for (const name of ['Save the last Death Wish for the execute phase or the end', 'Racial and trinkets with Death Wish']) {
      await expect(deathWish.getByRole('switch', { name, exact: true })).toBeVisible()
      await expect(inactiveRow(page, name)).toHaveCount(0)
    }
    // Hamstring is off by default (warrior.md §5.2), so its own setting starts dimmed.
    const hamstring = tab.getByRole('listitem').filter({ has: page.getByRole('switch', { name: 'Hamstring filler', exact: true }) })
    await expect(hamstring.getByRole('switch', { name: 'Hamstring only without Flurry', exact: true })).toBeVisible()
    await expect(inactiveRow(page, 'Hamstring only without Flurry')).toHaveCount(1)

    await page.getByRole('switch', { name: 'Death Wish', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Death Wish', exact: true })).not.toBeChecked()
    for (const name of ['Save the last Death Wish for the execute phase or the end', 'Racial and trinkets with Death Wish']) await expect(inactiveRow(page, name)).toHaveCount(1)
    await page.getByRole('switch', { name: 'Hamstring filler', exact: true }).click()
    await expect(inactiveRow(page, 'Hamstring only without Flurry')).toHaveCount(0)
  })

  test('timings before the execute phase and the potion’s limit dim while Execute, under another heading, is off', async ({ page }) => {
    const tab = await openRotation(page)
    const cooldowns = tab.getByRole('region', { name: 'Cooldowns and buffs' })
    await cooldowns.getByRole('button', { name: /^Advanced settings for Cooldowns and buffs/ }).click()
    const consumables = tab.getByRole('region', { name: 'Consumables' })
    await consumables.getByRole('button', { name: /^Advanced settings for Consumables/ }).click()
    // The potion's limit applies only in the execute phase (warrior.md §5.2 row 16).
    const names = ['Last Death Wish before the execute phase', 'Recklessness before the execute phase', 'Mighty Rage Potion up to']
    const inactive = (name: string) => page.locator('[data-inactive]').filter({ has: page.getByRole('textbox', { name, exact: true }) })
    for (const name of names) {
      await expect(tab.getByRole('textbox', { name, exact: true })).toBeVisible()
      await expect(inactive(name)).toHaveCount(0)
    }
    for (const name of ['Recklessness before the execute phase', 'Mighty Rage Potion up to'])
      await expect(tab.getByRole('textbox', { name, exact: true })).toHaveAccessibleDescription(/Needs Execute on, and an execute phase under Fight\./)
    await tab.getByRole('switch', { name: 'Execute', exact: true }).click()
    for (const name of names) await expect(inactive(name)).toHaveCount(1)
  })

  test('with no execute phase under Fight, Execute and every setting that needs it dim', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('switch', { name: 'Execute phase' }).click()
    await expect(page.getByRole('switch', { name: 'Execute phase' })).not.toBeChecked()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    for (const group of ['Cooldowns and buffs', 'Execute phase', 'Consumables'])
      await tab.getByRole('region', { name: group }).getByRole('button', { name: new RegExp(`^Advanced settings for ${group}`) }).click()
    const execute = tab.getByRole('switch', { name: 'Execute', exact: true })
    // Still on, and still usable, but dimmed, with its help saying why.
    await expect(execute).toBeChecked()
    await expect(execute).toHaveAccessibleDescription(/Needs an execute phase under Fight\.$/)
    for (const name of ['Execute', 'Whirlwind in the execute phase', 'Heroic Strike in the execute phase']) await expect(inactiveRow(page, name)).toHaveCount(1)
    const inactiveInput = (name: string) => page.locator('[data-inactive]').filter({ has: page.getByRole('textbox', { name, exact: true }) })
    for (const name of ['Execute: wait for extra rage', 'Last Death Wish before the execute phase', 'Recklessness before the execute phase', 'Mighty Rage Potion up to'])
      await expect(inactiveInput(name)).toHaveCount(1)
    // What doesn't need the phase stays as it was.
    await expect(inactiveRow(page, 'Save the last Death Wish for the execute phase or the end')).toHaveCount(0)
    await expect(inactiveInput('Recklessness in the last')).toHaveCount(0)
    // Back on under Fight, they apply again.
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('switch', { name: 'Execute phase' }).click()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await expect(inactiveRow(page, 'Execute')).toHaveCount(0)
  })

  test('a tap anywhere on a switch’s row flips it, and the row is at least 44 px tall', async ({ page }) => {
    const tab = await openRotation(page)
    const charge = page.getByRole('switch', { name: 'Charge in', exact: true })
    await expect(charge).not.toBeChecked()
    await tab.getByText(/^Open with Charge for 15 rage/).click()
    await expect(charge).toBeChecked()
    const row = tab.locator('label').filter({ has: charge })
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('a changed setting shows its default and resets on its own', async ({ page }) => {
    const tab = await openRotation(page)
    const slam = page.getByRole('switch', { name: 'Slam', exact: true })
    await expect(slam).not.toBeChecked()
    await expect(tab.getByText('Default: off')).toHaveCount(0)
    await slam.click()
    await expect(slam).toBeChecked()
    await expect(slam).toHaveAccessibleDescription(/Changed\. Default: off/)
    await tab.getByRole('button', { name: 'Reset Slam, default off' }).click()
    await expect(slam).not.toBeChecked()
    await expect(slam).toBeFocused()
    await expect(tab.getByRole('button', { name: 'Reset Slam, default off' })).toHaveCount(0)
  })

  test('thresholds wait behind each heading’s Advanced button, which opens by itself for a changed one', async ({ page }) => {
    const tab = await openRotation(page)
    const fillers = tab.getByRole('region', { name: 'Fillers' })
    // Switches stay in view; the thresholds don't.
    await expect(fillers.getByRole('switch', { name: 'Heroic Strike', exact: true })).toBeVisible()
    await expect(fillers.getByRole('textbox', { name: 'Heroic Strike from' })).toHaveCount(0)
    const advanced = fillers.getByRole('button', { name: /^Advanced settings for Fillers/ })
    await expect(advanced).toHaveAttribute('aria-expanded', 'false')
    await advanced.click()
    await expect(advanced).toHaveAttribute('aria-expanded', 'true')
    // In place, under the switch it tunes.
    const heroicStrike = fillers.getByRole('listitem').filter({ has: page.getByRole('switch', { name: 'Heroic Strike', exact: true }) })
    const threshold = heroicStrike.getByRole('textbox', { name: 'Heroic Strike from' })
    await expect(threshold).toHaveValue('40')
    await threshold.fill('50')
    await threshold.press('Enter')
    await expect(heroicStrike.getByText('Default: 40 rage')).toBeVisible()
    await expect(advanced).toHaveAccessibleName('Advanced settings for Fillers, 1 changed')

    // Next visit, the heading with a changed threshold is open; closed, it still counts it.
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Rotation', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(threshold).toHaveValue('50')
    await expect(advanced).toHaveAttribute('aria-expanded', 'true')
    await expect(tab.getByRole('button', { name: /^Advanced settings for Core abilities/ })).toHaveAttribute('aria-expanded', 'false')
    await advanced.click()
    await expect(threshold).toHaveCount(0)
    await expect(advanced).toContainText('1 changed')
  })

  test('the intro says what the spec’s defaults are: tuned for Fury (since M2.5b) and Arms', async ({ page }) => {
    const fury = await openRotation(page)
    await expect(fury.getByText('Which abilities the sim uses, and when. The defaults are tuned for the default setup.', { exact: true })).toBeVisible()
    await expect(fury.getByText(/common priority/)).toHaveCount(0)
    const arms = await openArmsRotation(page)
    await expect(arms.getByText('Which abilities the sim uses, and when. The defaults are tuned for the default setup.', { exact: true })).toBeVisible()
    await expect(arms.getByText(/we’ve found/)).toHaveCount(0)
  })

  test('a threshold is described by its help, and once changed by its default too', async ({ page }) => {
    const tab = await openRotation(page)
    const fillers = tab.getByRole('region', { name: 'Fillers' })
    await fillers.getByRole('button', { name: /^Advanced settings for Fillers/ }).click()
    const threshold = fillers.getByRole('textbox', { name: 'Heroic Strike from' })
    await expect(threshold).toHaveAccessibleDescription('Queue it at or above this much rage.')
    await threshold.fill('50')
    await threshold.press('Enter')
    await expect(threshold).toHaveAccessibleDescription('Queue it at or above this much rage. Changed. Default: 40 rage')
  })

  test('a threshold’s Reset names it and its default once each, and puts it back', async ({ page }) => {
    const tab = await openArmsRotation(page)
    const consumables = tab.getByRole('region', { name: 'Consumables' })
    await consumables.getByRole('button', { name: /^Advanced settings for Consumables/ }).click()
    const limit = consumables.getByRole('textbox', { name: 'Mighty Rage Potion up to' })
    await expect(limit).toHaveValue('0')
    await limit.fill('20')
    await limit.press('Enter')
    // Not "Reset Mighty Rage Potion up to to 0 rage".
    const reset = consumables.getByRole('button', { name: 'Reset Mighty Rage Potion up to, default 0 rage', exact: true })
    await reset.click()
    await expect(limit).toHaveValue('0')
    await expect(limit).toBeFocused()
    await expect(reset).toHaveCount(0)
  })

  test('Reset rotation restores every default', async ({ page }) => {
    const tab = await openRotation(page)
    const reset = tab.getByRole('button', { name: 'Reset rotation' })
    await expect(reset).toBeDisabled()
    const slam = page.getByRole('switch', { name: 'Slam', exact: true })
    const execute = page.getByRole('switch', { name: 'Execute', exact: true })
    await slam.click()
    await execute.click()
    await expect(slam).toBeChecked()
    await expect(execute).not.toBeChecked()

    await reset.click()
    await expect(slam).not.toBeChecked()
    await expect(execute).toBeChecked()
    await expect(reset).toBeDisabled()
  })

  test('a consumable shows off and locked until it’s selected in Buffs, and links there', async ({ page }) => {
    const tab = await openRotation(page)
    // The default raid has no Juju Flurry.
    const juju = tab.getByRole('switch', { name: 'Juju Flurry', exact: true })
    await expect(juju).not.toBeChecked()
    await expect(juju).toBeDisabled()
    await expect(tab.getByText('Not used: turn on Juju Flurry in Buffs first.')).toBeVisible()

    await tab.getByRole('button', { name: 'Buffs', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Buffs', exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tabpanel', { name: 'Buffs' }).getByRole('switch', { name: 'Juju Flurry' }).click()

    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await expect(juju).toBeChecked()
    await expect(juju).toBeEnabled()
    await expect(tab.getByText(/Not used: turn on Juju Flurry/)).toHaveCount(0)
  })
})
