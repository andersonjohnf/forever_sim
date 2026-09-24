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
    await expect(tab.getByText(/The defaults keep your duties, Demoralizing Roar and Faerie Fire on the boss, and within them are tuned for threat in the default setup\./)).toBeVisible()
    for (const name of ['Demoralizing Roar', 'Faerie Fire', 'Maul', 'Mangle', 'Lacerate']) await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Enrage in combat', exact: true })).toBeChecked()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    for (const name of ['Demoralizing Roar', 'Faerie Fire']) {
      const own = page.getByRole('switch', { name, exact: true })
      await expect(own).toBeChecked()
      await expect(own).toBeDisabled()
    }
    await expect(page.getByText('−204 boss attack power (instead of Demoralizing Shout). You keep it up yourself (see Rotation), so it isn’t added twice.')).toBeVisible()
  })

  test('with its roar off, the Buffs tab’s is off and unlocked, for another druid’s; without another druid it needs one (BU3, BU14)', async ({ page }) => {
    await page.goto(BEAR)
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await page.getByRole('tabpanel', { name: 'Rotation' }).getByRole('switch', { name: 'Demoralizing Roar', exact: true }).click()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const roar = buffs.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    // A duty is the bear's own, in no preset: off by default once its rotation drops it.
    await expect(roar).not.toBeChecked()
    await expect(roar).toBeEnabled()
    await expect(roar).toHaveAccessibleDescription(/You’re not keeping it up \(see Rotation\); turn this on if another druid does\./)
    // No other druid in the raid: the roar needs one, and your own Mark of the Wild (Gift of the Wild) is still yours.
    await buffs.getByRole('button', { name: 'Druid', exact: true }).click()
    await expect(roar).toBeDisabled()
    await expect(roar).toHaveAccessibleDescription('Needs another druid in the raid')
    const mark = buffs.getByRole('switch', { name: 'Gift of the Wild', exact: true })
    await expect(mark).toBeChecked()
    await expect(mark).toBeEnabled()
  })

  test('with a Demoralizing Shout from Buffs, its roar shows off, naming the Shout, and Rotation says it isn’t cast (BU2)', async ({ page }) => {
    await page.goto(BEAR)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const roar = buffs.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    await expect(roar).toBeChecked()
    await buffs.getByRole('switch', { name: 'Demoralizing Shout', exact: true }).click()
    await expect(roar).not.toBeChecked()
    await expect(roar).toBeDisabled()
    await expect(roar).toHaveAccessibleDescription(
      '−204 boss attack power (instead of Demoralizing Shout). Your raid’s Demoralizing Shout is on the boss instead, so you don’t cast it (see Rotation).',
    )
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.getByText('Not used: the Demoralizing Shout in Buffs is on the boss instead, so you don’t cast the roar.')).toBeVisible()
    await expect(tab.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).toBeChecked()
  })

  test('says why Lacerate does nothing while it waits for no other bleeds in a raid with warriors, as the cat’s Rake does (BU4)', async ({ page }) => {
    await page.goto(BEAR)
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    const alone = tab.getByRole('switch', { name: 'Lacerate only when nothing else bleeds', exact: true })
    await expect(alone).not.toBeChecked()
    const note = tab.getByText('Not used in this raid: its warriors keep the boss bleeding. Turn off “Lacerate only when nothing else bleeds” to use it anyway.')
    await expect(note).toHaveCount(0)
    await alone.click()
    await expect(note).toBeVisible()
    // Lacerate's switch stays on and usable; the one that makes it wait stays live.
    await expect(tab.getByRole('switch', { name: 'Lacerate', exact: true })).toBeChecked()
    await expect(alone).toBeEnabled()
  })

  test('shows Lacerate’s uptime and stacks on its bleed row, spells’ misses, its own roar under damage taken, and no parry or block (BU5, BU7, BU8, BU15)', async ({ page }) => {
    await page.goto(BEAR)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const breakdown = results.getByRole('region', { name: /by ability$/ })
    const row = (name: string) => breakdown.getByRole('listitem').filter({ hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) })
    await expect(row('Lacerate (bleed)')).toContainText(/\d+\.\d% uptime on the boss, \d\.\d stacks on average/)
    for (const name of ['Faerie Fire', 'Demoralizing Roar']) {
      await expect(row(name)).toContainText(/\d+\.\d% missed/)
      await expect(row(name)).not.toContainText('crit')
    }
    await expect(results.getByText(/Debuffs on it, such as Demoralizing Roar and Thunder Clap, lower its damage and slow its swings, whether yours \(Rotation\) or the raid’s \(Buffs\)\./)).toBeVisible()
    // Lacerate's marker is on the boss: its uptime is on the bleed's row, not under Cooldowns and buffs.
    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    await expect(results.getByRole('rowheader', { name: 'Faerie Fire' })).toBeVisible()
    await expect(results.getByRole('rowheader', { name: 'Lacerate' })).toHaveCount(0)
    await results.getByRole('button', { name: 'Character sheet' }).click()
    const labels = await results.locator('dl').first().locator('dt').allTextContents()
    expect(labels).toEqual(expect.arrayContaining(['Defense', 'Dodge']))
    for (const label of ['Parry', 'Block', 'Block value']) expect(labels).not.toContain(label)
  })

  test('leaves the execute phase off the Fight tab, and the Buffs tab shows what the bear brings itself (BU13, BU14, BU16)', async ({ page }) => {
    await page.goto(BEAR)
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Execute phase' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const lotp = page.getByRole('switch', { name: 'Leader of the Pack', exact: true })
    await expect(lotp).toBeChecked()
    await expect(lotp).toBeDisabled()
    await expect(page.getByText('+3% crit (feral druid in your party). Your talents bring it (see Talents), so it isn’t added twice.')).toBeVisible()
    await expect(page.getByText('+8 weapon damage on each weapon. Not used in Dire Bear Form: your attacks there don’t use your weapon’s damage.')).toBeVisible()
    const presets = page.getByRole('radiogroup', { name: 'Preset' })
    await expect(presets.getByRole('radio', { name: 'Standard raid (default)' })).toHaveAttribute('aria-checked', 'true')
    // Self only leaves only what the bear brings itself on, and still matches its preset.
    await presets.getByRole('radio', { name: 'Self only' }).click()
    await expect(presets.getByRole('radio', { name: 'Self only' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Custom selection.')).toHaveCount(0)
    await expect(page.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).toBeChecked()
  })
})
