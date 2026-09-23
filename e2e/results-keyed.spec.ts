import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#states: a failed run's message belongs to its setup, as a result does (RU4); a re-run
// that applies a change isn't marked "Setup changed" (RU17); and "Open Gear" in the phone's results
// sheet moves focus into the Gear tab (RU6).

/** Seeds a saved setup before the first load: a partial SimConfig, normalized by the app. */
async function seed(page: Page, config: Record<string, unknown>, section = 'gear') {
  await page.addInitScript(
    ({ config, section }) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const state = { config: { version: 1, spec: 'warrior-fury', ...config }, bySpec: {}, section }
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state, version: 1 }))
    },
    { config, section },
  )
}

const SKYBORNE = { race: 'alliance-skyborne-high-order' }

const switchSpec = async (page: Page, name: 'Fury' | 'Arms') => {
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: new RegExp(name) }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${name} Warrior`) })).toBeVisible()
}
const chooseRace = async (page: Page, race: string) => {
  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await page.getByRole('radio', { name: race, exact: true }).click()
}

test.describe('a failed run, on desktop (RU4)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('shows only while the setup is the one that failed: set aside on a spec switch, gone once fixed', async ({ page }) => {
    await seed(page, SKYBORNE)
    await page.goto('./')
    const panel = page.getByRole('complementary', { name: 'Results' })
    await panel.getByRole('button', { name: 'Simulate' }).click()
    const alert = panel.getByRole('alert')
    await expect(alert).toContainText('can’t be simulated')

    // Arms is another setup: nothing failed there.
    await switchSpec(page, 'Arms')
    await expect(alert).toHaveCount(0)
    await expect(panel).toContainText('Simulate to see your DPS.')
    // Back on the same Fury setup, the failure still applies.
    await switchSpec(page, 'Fury')
    await expect(alert).toContainText('can’t be simulated')

    // Fixing the setup clears it; there's no result yet, so the panel is ready to simulate.
    await chooseRace(page, 'Human')
    await expect(alert).toHaveCount(0)
    await expect(panel).toContainText('Simulate to see your DPS.')
    // Going back to the failing race shows it again, as a result would come back.
    await chooseRace(page, 'Skyborne (High Order)')
    await expect(alert).toContainText('can’t be simulated')
  })

  test('after a failed re-run, fixing the setup leaves the last result, stale, without the error', async ({ page }) => {
    await page.goto('./')
    const panel = page.getByRole('complementary', { name: 'Results' })
    await panel.getByRole('button', { name: 'Simulate' }).click()
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await chooseRace(page, 'Skyborne (High Order)')
    await panel.getByRole('button', { name: 'Simulate' }).click()
    await expect(panel.getByRole('alert')).toBeVisible()
    await chooseRace(page, 'Orc')
    await expect(panel.getByRole('alert')).toHaveCount(0)
    await expect(panel.getByRole('group', { name: 'DPS' })).toContainText('Setup changed')
    await expect(panel).toContainText('Your setup changed since this run.')
  })
})

test.describe('a failed run, on a phone (RU4)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the bar shows the failure only while the setup is the one that failed', async ({ page }) => {
    await seed(page, SKYBORNE)
    await page.goto('./')
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText('Couldn’t simulate')

    await switchSpec(page, 'Arms')
    await expect(bar).not.toContainText('Couldn’t simulate')
    await expect(bar).toBeDisabled()
    await switchSpec(page, 'Fury')
    await expect(bar).toContainText('Couldn’t simulate')

    await chooseRace(page, 'Human')
    await expect(bar).not.toContainText('Couldn’t simulate')
    await expect(bar).toContainText('DPS')
    await expect(bar).toBeDisabled()
  })
})

test.describe('a re-run on desktop (RU17)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('isn’t marked "Setup changed" while it applies the change, and is once the setup changes again', async ({ page }) => {
    // A full 100,000-fight run first: about 8 s on 16 cores, but on a 4-core CI runner it can take
    // over a minute, past the 30 s test timeout.
    test.setTimeout(180_000)
    // 100,000 fights of 10 minutes: long enough to watch the run.
    await seed(page, { run: { mode: 'fixed', iterations: 100000, seed: 1 }, fight: { durationSec: 600 } })
    await page.goto('./')
    const panel = page.getByRole('complementary', { name: 'Results' })
    const dps = panel.getByRole('group', { name: 'DPS' })
    await panel.getByRole('button', { name: 'Simulate' }).click()
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 150_000 })

    await chooseRace(page, 'Dwarf')
    await expect(dps).toContainText('Setup changed')
    await panel.getByRole('button', { name: 'Simulate' }).click()
    await expect(panel.getByText(/^Simulating…/)).toBeVisible()
    await expect(dps).not.toContainText('Setup changed')

    // A change during the run isn't in it, so the kept result is marked again.
    await page.getByRole('radio', { name: 'Gnome', exact: true }).click()
    await expect(panel.getByText(/^Simulating…/)).toBeVisible()
    await expect(dps).toContainText('Setup changed')
    await panel.getByRole('button', { name: 'Cancel' }).click()
  })
})

// On desktop, results-states.spec.ts ("a result with no weapon…") checks the focus.
test.describe('"Open Gear" in a result with no weapon, on a phone (RU6)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the sheet closes and focus lands on the main hand, in view', async ({ page }) => {
    await seed(page, { gear: {} }, 'fight')
    await page.goto('./')
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Show results' }).click()
    await page.getByRole('dialog', { name: 'Results' }).getByRole('button', { name: 'Open Gear' }).click()
    await expect(page.getByRole('dialog', { name: 'Results' })).toBeHidden()
    const mainHand = page.getByRole('button', { name: 'Main hand: empty' })
    await expect(mainHand).toBeFocused()
    await expect(mainHand).toBeInViewport()
  })
})
