import type { Page, Route } from '@playwright/test'
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
    await expect(bar).toContainText('Failed')

    await switchSpec(page, 'Arms')
    await expect(bar).not.toContainText('Failed')
    await expect(bar).toBeDisabled()
    await switchSpec(page, 'Fury')
    await expect(bar).toContainText('Failed')

    await chooseRace(page, 'Human')
    await expect(bar).not.toContainText('Failed')
    await expect(bar).toContainText('DPS')
    await expect(bar).toBeDisabled()
  })
})

test.describe('the phone bar’s Details button', () => {
  // People missed the bare chevron and took the headline for the whole result (docs/ux.md#layout).
  test('is labelled at 390 px, only an outlined chevron below 360 px, and opens the results sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('./')
    const bar = page.getByRole('button', { name: 'Show results and details' })
    await expect(bar).toBeDisabled()
    await expect(bar.getByText('Details', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again', exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(bar.getByText('Details', { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 320, height: 700 })
    await expect(bar.getByText('Details', { exact: true })).toBeHidden()
    await bar.click()
    await expect(page.getByRole('dialog', { name: 'Results' })).toBeVisible()
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

// A run belongs to the spec it was started on (#5): switching spec mid-run showed Fury's progress and
// Cancel under Arms, and announced Fury's headline there as if it were Arms's.
test.describe('a spec switch while a run is under way', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  /**
   * Holds the workers' script until `release`, so a run stays under way for as long as the test needs:
   * messages to a worker that hasn't started wait for it.
   */
  async function holdWorkers(page: Page) {
    const held: Route[] = []
    let holding = true
    await page.route('**/assets/sim.worker*.js', (route) => (holding ? void held.push(route) : route.continue()))
    return async () => {
      holding = false
      for (const route of held.splice(0)) await route.continue()
    }
  }

  test('leaves the other spec ready to simulate; the run finishes under its own spec, and says whose it is', async ({ page }) => {
    const release = await holdWorkers(page)
    await page.goto('./')
    const panel = page.getByRole('complementary', { name: 'Results' })
    const dps = panel.getByRole('group', { name: 'DPS' })
    const status = page.getByRole('status', { name: 'Simulation status' })
    await panel.getByRole('button', { name: 'Simulate' }).click()
    await expect(panel.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(status).toHaveText('Simulating…')

    await switchSpec(page, 'Arms')
    // Fury's run isn't Arms's: no progress, no Cancel, nothing of Fury's under the Arms header.
    await expect(panel.getByRole('button', { name: 'Simulate' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
    await expect(panel.getByText(/^Simulating…/)).toHaveCount(0)
    await expect(panel.getByRole('progressbar')).toHaveCount(0)
    await expect(panel).toContainText('Simulate to see your DPS.')
    await expect(dps).toContainText('—')

    // It finishes in the background, and the live region names its spec.
    await release()
    await expect(status).toHaveText(/^Fury Warrior’s run is done: [\d,]+\.\d DPS$/, { timeout: 60_000 })
    await expect(dps).toContainText('—')
    await expect(panel).toContainText('Simulate to see your DPS.')

    // Back on Fury, its result is there.
    await switchSpec(page, 'Fury')
    await expect(dps).toContainText(/\d+\.\d/)
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible()
  })

  test('switching back mid-run shows its progress again, and simulating another spec stops it', async ({ page }) => {
    const release = await holdWorkers(page)
    await page.goto('./')
    const panel = page.getByRole('complementary', { name: 'Results' })
    const simulating = panel.getByText(/^Simulating…/)
    await panel.getByRole('button', { name: 'Simulate' }).click()
    await expect(simulating).toBeVisible()
    await switchSpec(page, 'Arms')
    await expect(simulating).toHaveCount(0)
    await switchSpec(page, 'Fury')
    await expect(simulating).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Cancel' })).toBeVisible()

    // Arms's run replaces Fury's, which leaves Fury as it was before, with no result.
    await switchSpec(page, 'Arms')
    await panel.getByRole('button', { name: 'Simulate' }).click()
    await expect(simulating).toBeVisible()
    await switchSpec(page, 'Fury')
    await expect(simulating).toHaveCount(0)
    await expect(panel).toContainText('Simulate to see your DPS.')
    await switchSpec(page, 'Arms')
    await release()
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
    await switchSpec(page, 'Fury')
    await expect(panel).toContainText('Simulate to see your DPS.')
  })

  test('on a phone, the other spec’s bar shows no progress for it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const release = await holdWorkers(page)
    await page.goto('./')
    const bar = page.getByRole('button', { name: 'Show results and details' })
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
    await switchSpec(page, 'Arms')
    await expect(page.getByRole('button', { name: 'Simulate', exact: true })).toBeVisible()
    await expect(bar).toBeDisabled()
    await expect(bar).not.toContainText('%')
    await release()
    await expect(page.getByRole('status', { name: 'Simulation status' })).toHaveText(/^Fury Warrior’s run is done/, { timeout: 60_000 })
    await expect(bar).toBeDisabled()
    await switchSpec(page, 'Fury')
    await expect(bar).toBeEnabled()
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
