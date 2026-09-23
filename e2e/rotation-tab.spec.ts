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
    for (const name of ['Save the last Death Wish for the end', 'Racial and trinkets with Death Wish']) {
      await expect(deathWish.getByRole('switch', { name, exact: true })).toBeVisible()
      await expect(inactiveRow(page, name)).toHaveCount(0)
    }
    const hamstring = tab.getByRole('listitem').filter({ has: page.getByRole('switch', { name: 'Hamstring filler', exact: true }) })
    await expect(hamstring.getByRole('switch', { name: 'Hamstring only without Flurry', exact: true })).toBeVisible()

    await page.getByRole('switch', { name: 'Death Wish', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Death Wish', exact: true })).not.toBeChecked()
    for (const name of ['Save the last Death Wish for the end', 'Racial and trinkets with Death Wish']) await expect(inactiveRow(page, name)).toHaveCount(1)
    await page.getByRole('switch', { name: 'Hamstring filler', exact: true }).click()
    await expect(inactiveRow(page, 'Hamstring only without Flurry')).toHaveCount(1)
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
    await expect(threshold).toHaveValue('42')
    await threshold.fill('50')
    await threshold.press('Enter')
    await expect(heroicStrike.getByText('Default: 42 rage')).toBeVisible()
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

  test('the intro says what the spec’s defaults are: tuned for Arms, the common priority for Fury', async ({ page }) => {
    const fury = await openRotation(page)
    await expect(fury.getByText('Which abilities the sim uses, and when. The defaults follow the common priority.', { exact: true })).toBeVisible()
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
    await expect(threshold).toHaveAccessibleDescription('Queue it at or above this much rage. Changed. Default: 42 rage')
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
