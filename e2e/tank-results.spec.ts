import { deflateRawSync } from 'node:zlib'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Tank specs report TPS and DPS as equals (decision D18). Tanks aren't in the spec picker until
// they ship, but a shared setup can load one: this is the share link (#s=…, deflated JSON; see
// docs/ux.md#persistence-and-sharing) for the default Protection warrior.
const PROTECTION = `./#s=${deflateRawSync(JSON.stringify({ version: 1, spec: 'warrior-protection' })).toString('base64url')}`

/** A value with its ± 95% CI, e.g. "212.9± 0.5" in the text of a headline group. */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/
/** …followed by a change from the previous run: a sign and a value. */
const WITH_CHANGE = /± \d[\d,]*\.\d\s*[+−]\d[\d,]*\.\d/

async function openProtection(page: Page) {
  await page.goto(PROTECTION)
  await expect(page.getByText('Loaded a shared setup')).toBeVisible()
  await expect(page.getByRole('button', { name: /Spec: Protection Warrior/ })).toBeVisible()
}

async function simulate(scope: Locator | Page) {
  await scope.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(scope.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
}

test.describe('tank results', () => {
  test('headline TPS and DPS side by side, each with its CI and its own change', async ({ page }) => {
    await openProtection(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    const tps = results.getByRole('group', { name: 'TPS' })
    const dps = results.getByRole('group', { name: 'DPS' })
    await expect(tps).toContainText('—')
    await expect(dps).toContainText('—')
    await expect(results).toContainText('Simulate to see your TPS and DPS.')

    await simulate(results)
    await expect(tps).toContainText(VALUE_WITH_CI)
    await expect(dps).toContainText(VALUE_WITH_CI)
    // DPS has its own headline now, so the run summary no longer repeats it.
    await expect(results.getByText(/fights of \d+ s · Forever rules/)).not.toContainText('DPS')
    // TPS comes first.
    const [tpsBox, dpsBox] = [await tps.boundingBox(), await dps.boundingBox()]
    expect(tpsBox!.x).toBeLessThan(dpsBox!.x)

    // A different race changes both numbers; each shows its own change from the last run.
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Night Elf/ }).click()
    await expect(tps).toContainText('Setup changed')
    await simulate(results)
    await expect(tps).toContainText(WITH_CHANGE)
    await expect(dps).toContainText(WITH_CHANGE)
    await expect(tps).not.toContainText('Setup changed')
  })

  test('the breakdown switches between threat and damage, and remembers the choice', async ({ page }) => {
    await openProtection(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)

    const breakdown = results.getByRole('region', { name: /by ability$/ })
    const threat = breakdown.getByRole('radio', { name: 'Threat' })
    const damage = breakdown.getByRole('radio', { name: 'Damage' })
    await expect(breakdown.getByRole('heading')).toHaveText('Threat by ability')
    await expect(threat).toHaveAttribute('aria-checked', 'true')
    // Master of Defense only gives rage, so it makes threat but deals no damage.
    await expect(breakdown.getByText('Master of Defense')).toBeVisible()
    const mainHandThreat = await breakdown.getByRole('listitem').filter({ hasText: 'Main hand' }).textContent()

    await damage.click()
    await expect(breakdown.getByRole('heading')).toHaveText('Damage by ability')
    await expect(damage).toHaveAttribute('aria-checked', 'true')
    await expect(breakdown.getByText('Master of Defense')).toBeHidden()
    await expect(breakdown.getByRole('listitem').filter({ hasText: 'Main hand' })).not.toHaveText(mainHandThreat!)

    // Remembered for the session: still damage after a reload and a new run.
    await page.reload()
    await simulate(results)
    await expect(breakdown.getByRole('heading')).toHaveText('Damage by ability')
  })

  test('DPS specs keep one DPS headline and a damage breakdown with no switch', async ({ page }) => {
    await page.goto('./')
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
    await expect(results.getByRole('group', { name: 'TPS' })).toHaveCount(0)
    await expect(results.getByRole('heading', { name: 'Damage by ability' })).toBeVisible()
    await expect(results.getByRole('radio', { name: 'Threat' })).toHaveCount(0)
  })
})

test.describe('tank results on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the bottom bar shows TPS and DPS, and the results sheet has both with the switch', async ({ page }) => {
    await openProtection(page)
    await simulate(page)

    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/TPS\s*\d[\d,]*\.\d/)
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    // Both values and Run again fit on the bar, inside the screen, with a full-size touch target.
    const again = await page.getByRole('button', { name: 'Run again' }).boundingBox()
    const shown = await bar.boundingBox()
    expect(again!.height).toBeGreaterThanOrEqual(44)
    expect(again!.x + again!.width).toBeLessThanOrEqual(390)
    expect(shown!.x + shown!.width).toBeLessThanOrEqual(again!.x)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)

    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expect(sheet.getByRole('group', { name: 'TPS' })).toContainText(VALUE_WITH_CI)
    await expect(sheet.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
    const damage = sheet.getByRole('radio', { name: 'Damage' })
    expect((await damage.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await damage.click()
    await expect(sheet.getByRole('heading', { name: 'Damage by ability' })).toBeVisible()
  })
})
