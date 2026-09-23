import { deflateRawSync } from 'node:zlib'
import { expect, test } from './fixtures.ts'

// The Feral bear before it ships (docs/classes/druid.md §6.3): the switcher doesn't offer it, so
// these tests preview it (`?preview=`, in a browser under automation: src/app/preview-specs.ts)
// through the share link (#s=…, deflated JSON) for the default bear.
const BEAR = `./?preview=druid-feral-bear#s=${deflateRawSync(JSON.stringify({ version: 1, spec: 'druid-feral-bear' })).toString('base64url')}`

test.describe('Feral bear (preview)', () => {
  test('simulates TPS and DPS, its abilities in the threat breakdown', async ({ page }) => {
    await page.goto(BEAR)
    await expect(page.getByText('Loaded a shared setup')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Feral \(Bear\)/ })).toBeVisible()
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByRole('group', { name: 'TPS' })).toContainText(/\d[\d,]*\.\d\s*± /)
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText(/\d[\d,]*\.\d\s*± /)
    const breakdown = results.getByRole('region', { name: /by ability$/ })
    await expect(breakdown.getByRole('heading')).toHaveText('Threat by ability')
    // Demoralizing Roar deals no damage, so it's in the threat view only.
    for (const name of ['Maul', 'Mangle', 'Faerie Fire', 'Demoralizing Roar']) {
      await expect(breakdown.getByRole('listitem').filter({ hasText: name }).first()).toBeVisible()
    }
  })

  test('keeps the tank’s duties by default, and the Buffs tab shows its own debuffs as kept up', async ({ page }) => {
    await page.goto(BEAR)
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.getByText('The defaults are tuned for the default setup.')).toBeVisible()
    for (const name of ['Demoralizing Roar', 'Faerie Fire', 'Maul', 'Mangle']) await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Enrage in combat', exact: true })).not.toBeChecked()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    for (const name of ['Demoralizing Roar', 'Faerie Fire']) {
      const own = page.getByRole('switch', { name, exact: true })
      await expect(own).toBeChecked()
      await expect(own).toBeDisabled()
    }
    await expect(page.getByText('−204 boss attack power. You keep it up yourself (see Rotation), so it isn’t added twice.')).toBeVisible()
  })
})
