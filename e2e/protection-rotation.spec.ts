import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Protection's Rotation tab (docs/ux.md "Rotation"; docs/classes/warrior.md §5.4): its priority
// choice first, "Tank duties first" by default or "Max TPS" (decision D26), which moves the
// defaults of the switches it drops, as Arms' stance does; and a run with each.

/** Protection's Rotation tab, from the spec switcher, as a visitor gets there. */
async function openProtectionRotation(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
  await page.getByRole('menuitem', { name: /Protection/ }).click()
  await expect(page.getByRole('button', { name: /Spec: Protection Warrior/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('tabpanel', { name: 'Rotation' })
}

/** The switches Max TPS turns off by default: the tank's duties (D26). */
const DUTIES = ['Shield Block', 'Thunder Clap', 'Demoralizing Shout']
/** What a screen reader hears of a change from the last run (docs/ux.md#results). */
const HEARD_CHANGE = /^(up|down) [\d,]+\.\d from the last run, (better|worse)$/

test.describe('Protection rotation', () => {
  test('puts the priority first, tank duties by default, and its headings under it', async ({ page }) => {
    const tab = await openProtectionRotation(page)
    await expect(tab.getByText('Which abilities the sim uses, and when. The defaults are tuned for the default setup.', { exact: true })).toBeVisible()
    const priority = tab.getByRole('radiogroup', { name: 'Priority' })
    await expect(priority.getByRole('radio', { name: 'Tank duties first' })).toBeChecked()
    await expect(priority.getByRole('radio', { name: 'Max TPS' })).not.toBeChecked()
    // Its help says what Max TPS drops, why the default keeps it, what it gains and costs, and when to pick it.
    await expect(priority).toHaveAccessibleDescription(
      /^Tank duties first keeps Shield Block up and Thunder Clap and Demoralizing Shout on the boss, so you take less damage\. Max TPS drops all three for threat: about 15% more TPS and 39% more damage taken in the default setup\. Pick it when another tank or the raid covers your survival\./,
    )
    expect((await priority.boundingBox())!.y).toBeLessThan((await tab.getByRole('heading', { name: 'Before the pull' }).boundingBox())!.y)
    // Execute is the tank's only execute-phase setting, so it sits under Core abilities: no heading over one setting.
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Before the pull', 'Cooldowns and buffs', 'Core abilities', 'Fillers', 'Consumables'])
    const core = tab.getByRole('region', { name: 'Core abilities' })
    await expect(core.getByRole('switch', { name: 'Execute', exact: true })).not.toBeChecked()
    // Its switches in priority order: the debuffs first from the pull, then the threat abilities (D26).
    const order = ['Thunder Clap', 'Thunder Clap only to keep the slow up', 'Demoralizing Shout', 'Shield Slam', 'Revenge', 'Sunder Armor', 'Execute']
    const switches = core.getByRole('switch')
    await expect(switches).toHaveCount(order.length)
    for (const [i, name] of order.entries()) await expect(switches.nth(i)).toHaveAccessibleName(name)
    for (const name of DUTIES) await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    // The default Protection warrior is a Human, whose racial cooldown isn't used, as for every spec.
    await expect(tab.getByRole('switch', { name: 'Racial cooldown', exact: true })).toHaveAccessibleDescription(/Not used: Human has no racial cooldown that adds damage\./)
  })

  test('Max TPS turns the duties off by default, and a switch you set stays set until Reset', async ({ page }) => {
    const tab = await openProtectionRotation(page)
    const priority = tab.getByRole('radiogroup', { name: 'Priority' })
    await priority.getByRole('radio', { name: 'Max TPS' }).click()
    await expect(priority.getByRole('radio', { name: 'Max TPS' })).toBeChecked()
    await expect(priority).toHaveAccessibleDescription(/Changed\. Default: Tank duties first$/)
    // Their defaults follow the choice: off, and not marked as changed.
    for (const name of DUTIES) {
      const control = tab.getByRole('switch', { name, exact: true })
      await expect(control).not.toBeChecked()
      await expect(control).not.toHaveAccessibleDescription(/Changed/)
      await expect(control).toHaveAccessibleDescription(/Off by default with Max TPS/)
    }
    // Heroic Strike's threshold follows it too: 45 rage.
    const fillers = tab.getByRole('region', { name: 'Fillers' })
    await expect(fillers.getByRole('button', { name: 'Advanced settings for Fillers' })).toBeVisible()
    await fillers.getByRole('button', { name: 'Advanced settings for Fillers' }).click()
    const heroicStrike = fillers.getByRole('textbox', { name: 'Heroic Strike from' })
    await expect(heroicStrike).toHaveValue('45')
    await expect(heroicStrike).toHaveAccessibleDescription(/^Queue it at or above this much rage\. With Max TPS it’s 45 by default/)

    // The Buffs tab's Thunder Clap is the tank's own as well: off with Max TPS, and unlocked, to turn
    // on for another warrior's (D26; SpecMeta.ownBuffs).
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const thunderClap = buffs.getByRole('switch', { name: 'Thunder Clap', exact: true })
    await expect(thunderClap).not.toBeChecked()
    await expect(thunderClap).toBeEnabled()
    await expect(thunderClap).toHaveAccessibleDescription(/\. You’re not keeping it up \(see Rotation\); turn this on if another warrior does\.$/)
    await thunderClap.click()
    await expect(thunderClap).toBeChecked()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()

    // A switch you turn back on stays on, marked against its Max TPS default.
    const shieldBlock = tab.getByRole('switch', { name: 'Shield Block', exact: true })
    await shieldBlock.click()
    await expect(shieldBlock).toBeChecked()
    await expect(shieldBlock).toHaveAccessibleDescription(/Changed\. Default: off$/)
    // The priority's own Reset brings the duties back, and keeps what you set.
    await tab.getByRole('button', { name: 'Reset Priority, default Tank duties first' }).click()
    await expect(priority.getByRole('radio', { name: 'Tank duties first' })).toBeChecked()
    await expect(priority.getByRole('radio', { name: 'Tank duties first' })).toBeFocused()
    for (const name of DUTIES) await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    await expect(shieldBlock).not.toHaveAccessibleDescription(/Changed/)
    // Advanced opens afresh on each visit to the tab (docs/ux.md "Rotation").
    await fillers.getByRole('button', { name: 'Advanced settings for Fillers' }).click()
    await expect(heroicStrike).toHaveValue('76')
    // Back on tank duties, your own Thunder Clap replaces the one you turned on: locked, and said so.
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await expect(thunderClap).toBeChecked()
    await expect(thunderClap).toBeDisabled()
    await expect(thunderClap).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\)/)
  })

  test('a Max TPS run makes more threat than the default, and says so', async ({ page }) => {
    const tab = await openProtectionRotation(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    const run = async () => {
      await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    }
    await run()
    // The debuffs you keep on the boss show their uptime and their attack's casts per fight (PU6).
    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    for (const name of ['Sunder Armor', 'Thunder Clap', 'Demoralizing Shout']) {
      await expect(results.getByRole('table').getByRole('row', { name: new RegExp(`^${name} \\d+\\.\\d% \\d+\\.\\d$`) })).toBeVisible()
    }
    await tab.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Max TPS' }).click()
    await expect(results.getByRole('group', { name: 'TPS' })).toContainText('Setup changed')
    await run()
    const heard = (metric: string) => results.getByRole('group', { name: metric }).getByText(HEARD_CHANGE)
    await expect(heard('TPS')).toHaveText(/^up [\d,]+\.\d from the last run, better$/)
    // It keeps Shield Slam, and the boss's faster, harder swings give more rage: more damage too (§5.4).
    await expect(heard('DPS')).toHaveText(/^up [\d,]+\.\d from the last run, better$/)
    // The rows it dropped are gone from the threat breakdown; Sunder Armor, Revenge and Shield Slam are there.
    const breakdown = results.getByRole('region', { name: 'Threat by ability' })
    const row = (name: string) => breakdown.getByRole('listitem').filter({ hasText: name })
    await expect(row('Sunder Armor')).toHaveCount(1)
    await expect(row('Revenge')).toHaveCount(1)
    await expect(row('Shield Slam')).toHaveCount(1)
    for (const name of ['Thunder Clap', 'Demoralizing Shout']) await expect(row(name)).toHaveCount(0)
  })
})

test.describe('what Shield Block and Shield Slam need (docs/ux.md "Rotation", PU4)', () => {
  test('without a shield they’re off and locked, say so, and the link opens Gear on the off hand; the filler’s wait is dimmed', async ({ page }) => {
    // Protection with its sword and no shield, on the Rotation tab.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const config = { version: 1, spec: 'warrior-protection', gear: { mainHand: { itemId: 15806 } } }
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config, bySpec: {}, section: 'rotation' }, version: 1 }))
    })
    await page.goto('./')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    for (const name of ['Shield Block', 'Shield Slam']) {
      const control = tab.getByRole('switch', { name, exact: true })
      await expect(control).not.toBeChecked()
      await expect(control).toBeDisabled()
      await expect(control).toHaveAccessibleDescription(/Not used: needs a shield \( ?Gear ?\)\.$/)
    }
    const wait = page.locator('[data-inactive]').filter({ has: page.getByRole('switch', { name: 'Sunder Armor filler waits for Shield Slam', exact: true }) })
    await expect(wait).toHaveCount(1)
    await tab.getByRole('button', { name: 'Gear', exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'Off hand: empty' })).toBeFocused()
  })
})

test.describe('Expose Armor over your Sunder Armor (warrior.md §5.4 notes, Q35)', () => {
  test('the Buffs row, the Rotation help and the result each say yours makes threat but removes no armor', async ({ page }) => {
    const tab = await openProtectionRotation(page)
    // The Rotation's Sunder Armor help says what Expose Armor does to it, whatever the Buffs tab holds.
    await expect(tab.getByRole('switch', { name: 'Sunder Armor', exact: true })).toHaveAccessibleDescription(
      /With Expose Armor on there, yours removes no armor, since only one applies, but still makes its threat \(untested\)\.$/,
    )
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const sunder = buffs.getByRole('switch', { name: 'Sunder Armor ×5', exact: true })
    await expect(sunder).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\)/)
    await buffs.getByRole('switch', { name: 'Expose Armor', exact: true }).click()
    // Still yours and locked, and it says Expose Armor takes its place.
    await expect(sunder).toBeChecked()
    await expect(sunder).toBeDisabled()
    await expect(sunder).toHaveAccessibleDescription(/\. Expose Armor takes its place on the boss, since only one applies; yours still makes its threat \(untested\)\.$/)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await expect(results.getByText(/^Expose Armor \(Buffs\) takes the place of your Sunder Armor on the boss, since only one applies/)).toBeVisible()
  })
})

test.describe('Protection rotation on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the priority is a full-width choice with 44 px targets, inside the screen', async ({ page }) => {
    const tab = await openProtectionRotation(page)
    const priority = tab.getByRole('radiogroup', { name: 'Priority' })
    const group = (await priority.boundingBox())!
    expect(group.x).toBeGreaterThanOrEqual(16)
    expect(group.x + group.width).toBeLessThanOrEqual(390 - 16)
    const [duties, max] = [priority.getByRole('radio', { name: 'Tank duties first' }), priority.getByRole('radio', { name: 'Max TPS' })]
    for (const item of [duties, max]) {
      const box = (await item.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    // Side by side, filling the row between them.
    const [a, b] = [(await duties.boundingBox())!, (await max.boundingBox())!]
    expect(a.y).toBeCloseTo(b.y, 0)
    expect(b.x + b.width - a.x).toBeGreaterThan(group.width - 2)

    await max.tap()
    await expect(max).toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Thunder Clap', exact: true })).not.toBeChecked()
    // Its default and Reset sit under the help: the Reset's hit area (its ::after) is 44 px tall
    // and ends above the choice (docs/ux.md "Rotation", LINK_HIT_AREA).
    const reset = tab.getByRole('button', { name: 'Reset Priority, default Tank duties first' })
    await expect(reset).toBeVisible()
    const area = await reset.evaluate((el) => {
      el.scrollIntoView({ block: 'center' })
      const box = el.getBoundingClientRect()
      const after = getComputedStyle(el, '::after')
      return { top: box.top + Number.parseFloat(after.top), bottom: box.bottom - Number.parseFloat(after.bottom) }
    })
    expect(area.bottom - area.top).toBeGreaterThanOrEqual(44)
    expect(area.bottom).toBeLessThanOrEqual((await duties.boundingBox())!.y)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})
