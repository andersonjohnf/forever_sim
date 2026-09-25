import type { Page, Route } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#accessibility: Ctrl+Enter, or ⌘+Enter, runs Simulate from anywhere, a text or number
// field included, at every width. A field commits what you typed first, and keeps focus. It stands
// aside while a sheet or dialog with its own form is open, and while a run is under way. It's heard
// before the focused control, so a Select's trigger or a drag handle doesn't also act on Enter
// (src/app/shortcuts.ts).

/** The visible Simulate button: the results pane's on a desktop, the bottom bar's on a phone. */
const simulate = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
/** The run's live region, in the shell: by CSS, since an open sheet hides the page from the role query. */
const status = (page: Page) => page.locator('[role="status"][aria-label="Simulation status"]')

/** Holds the workers' script until `release()`, so the first run stays under way (results-keyed.spec.ts). */
async function holdWorkers(page: Page) {
  const held: Route[] = []
  let holding = true
  await page.route('**/assets/sim.worker*.js', (route) => (holding ? void held.push(route) : route.continue()))
  return async () => {
    holding = false
    for (const route of held.splice(0)) await route.continue()
  }
}

/** Records every text the run's status takes from now on, so a run too quick to catch still shows. */
async function recordStatus(page: Page): Promise<() => Promise<string[]>> {
  await status(page).evaluate((el) => {
    const w = window as unknown as { __statusLog: string[] }
    w.__statusLog = []
    new MutationObserver(() => w.__statusLog.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true })
  })
  return () => page.evaluate(() => (window as unknown as { __statusLog: string[] }).__statusLog)
}

for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test.describe(`at ${width} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('./')
    })

    test('⌘+Enter runs Simulate from the page', async ({ page }) => {
      await page.getByRole('tab', { name: 'Talents', exact: true }).click()
      await expect(simulate(page, 'Simulate')).toBeVisible()
      await page.keyboard.press('Meta+Enter')
      await expect(simulate(page, 'Run again')).toBeVisible({ timeout: 30_000 })
      // It didn't also open anything: focus stays on the tab.
      await expect(page.getByRole('tab', { name: 'Talents', exact: true })).toBeFocused()
    })

    test('Ctrl+Enter in a number field runs Simulate with what was typed, and keeps focus there', async ({ page }) => {
      await page.getByRole('tab', { name: 'Fight', exact: true }).click()
      // The boss's level is under Advanced, a disclosure on a phone and shown open from 1440 px.
      if (width < 1440) await page.getByRole('tabpanel', { name: 'Fight' }).getByRole('button', { name: 'Advanced' }).click()
      const level = page.getByRole('textbox', { name: 'Boss level' })
      await level.fill('61')
      await expect(level).toBeFocused()
      await page.keyboard.press('Control+Enter')
      await expect(simulate(page, 'Run again')).toBeVisible({ timeout: 30_000 })
      await expect(level).toBeFocused()
      await expect(level).toHaveValue('61')
      // Leaving the field changes nothing more: the run already had 61, so its result isn't stale.
      await page.keyboard.press('Tab')
      await expect(simulate(page, 'Run again')).toBeVisible()
    })

    test('Ctrl+Enter in a dialog with its own form is the form’s, not Simulate’s', async ({ page }) => {
      await page.getByRole('tab', { name: 'Talents', exact: true }).click()
      await page.getByRole('button', { name: /Paste/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Paste a build code' })
      await expect(dialog.getByRole('textbox')).toBeFocused()
      await page.keyboard.press('Control+Enter')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      // No run started: a run would show Cancel, or Run again once done, never Simulate.
      await expect(simulate(page, 'Simulate')).toBeVisible()
    })

    test('Ctrl+Enter on the focused Rotation preset runs Simulate, and doesn’t open the menu (DL-3)', async ({ page }) => {
      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      const preset = page.getByRole('combobox', { name: 'Rotation preset' })
      await preset.focus()
      await page.keyboard.press('Control+Enter')
      await expect(simulate(page, 'Run again')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole('listbox')).toHaveCount(0)
      await expect(preset).toBeFocused()
      await expect(preset).toHaveAttribute('aria-expanded', 'false')
    })

    test('Ctrl+Enter on a focused drag handle runs Simulate, and doesn’t pick the row up (DL-3)', async ({ page }) => {
      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      const handle = page.getByRole('button', { name: 'Move Whirlwind, position 11' })
      await handle.focus()
      await page.keyboard.press('Control+Enter')
      await expect(simulate(page, 'Run again')).toBeVisible({ timeout: 30_000 })
      // Not picked up: had it been, Up would move it over position 10 and Space would drop it there.
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('Space')
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: 'Move Whirlwind, position 11' })).toBeFocused()
    })
  })
}

test('Ctrl+Enter during a run does nothing: the run carries on, and isn’t cancelled or started again (DL-8)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const release = await holdWorkers(page)
  await page.goto('./')
  await simulate(page, 'Simulate').click()
  await expect(simulate(page, 'Cancel')).toBeVisible()
  const log = await recordStatus(page)
  await page.keyboard.press('Control+Enter')
  await page.keyboard.press('Meta+Enter')
  await expect(simulate(page, 'Cancel')).toBeVisible()
  await expect(status(page)).toHaveText('Simulating…')
  await release()
  await expect(simulate(page, 'Run again')).toBeVisible({ timeout: 30_000 })
  // One run, finished: never cancelled, and never a second "Simulating…" after the key.
  expect((await log()).filter((text) => /cancel|Simulating/i.test(text))).toEqual([])
})

test.describe('the phone’s results sheet', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Ctrl+Enter in the open results sheet runs Simulate again, and the sheet stays open (DL-8)', async ({ page }) => {
    await page.goto('./')
    await simulate(page, 'Simulate').click()
    await expect(simulate(page, 'Run again')).toBeVisible({ timeout: 30_000 })
    const log = await recordStatus(page)
    await page.getByRole('button', { name: 'Show results and details' }).click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expect(page.getByRole('heading', { name: 'Results' })).toBeFocused()
    await page.keyboard.press('Control+Enter')
    await expect.poll(async () => (await log()).includes('Simulating…')).toBe(true)
    await expect(status(page)).toHaveText(/^Done: /, { timeout: 30_000 })
    await expect(sheet).toBeVisible()
  })
})
