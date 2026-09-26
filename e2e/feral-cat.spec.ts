import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Feral cat (docs/classes/druid.md §3, §6.2, §7), shipped in B2: the switcher, its tabs in its
// own terms, a run and its results, and a share link, on a desktop and on a phone (docs/ux.md).

const CAT = /^Spec: Feral \(Cat\) Druid/

async function switchToCat(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: /Feral \(Cat\)/ }).click()
  await expect(page.getByRole('button', { name: CAT })).toBeVisible()
}

const openTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
}

test.describe('Feral cat', () => {
  test('is in the switcher under Druid, with its own talent build and a Tauren in pre-raid gear', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    const cat = page.getByRole('menuitem', { name: /Feral \(Cat\)/ })
    await expect(cat).toContainText('DPS')
    // The bear beside it, a tank (B4).
    await expect(page.getByRole('menuitem', { name: /Feral \(Bear\)/ })).toContainText('Tank')
    await cat.click()
    await expect(page.getByRole('button', { name: CAT })).toBeVisible()

    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Tauren/ })).toHaveAttribute('aria-checked', 'true')
    await openTab(page, 'Gear')
    await expect(page.getByRole('button', { name: 'Main hand: Manual Crowd Pummeler' })).toBeVisible()

    await openTab(page, 'Talents')
    const presets = page.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Feral cat (default)')
    await expect(page.getByText('9 / 37 / 5')).toBeVisible()
    await presets.click()
    // Both druid builds, the bear's since it shipped (B4); only the cat's is marked "(default)" here.
    await expect(page.getByRole('option')).toHaveText(['Feral cat (default) 9/37/5', 'Feral bear default 9/42/0', 'Balance default 41/5/0'])
  })

  test('its Rotation tab says its defaults are tuned and why it never powershifts', async ({ page }) => {
    await switchToCat(page)
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(
      tab.getByText(
        'Which abilities the sim uses, and when. The defaults are tuned for the default setup. There’s no powershifting: in Forever, Furor keeps your Energy through a shift, so it gains nothing.',
        { exact: true },
      ),
    ).toBeVisible()
    // The rotation is a priority list (D31, druid.md §6.2 "The cat's priority list"), the consumables above it.
    const list = page.getByRole('list', { name: 'Priority list' })
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
    for (const name of ['Berserk', 'Tiger’s Fury', 'Faerie Fire', 'Shred', 'Claw', 'Rip', 'Ferocious Bite']) {
      await expect(list.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    await expect(list.getByRole('switch', { name: 'Rake', exact: true })).not.toBeChecked()
    // What the rest of the setup leaves unused says why, dimmed: the Tauren's racial, and Rake in a
    // raid whose warriors keep the boss bleeding, whose note names the way to use it anyway.
    const racial = list.getByRole('switch', { name: 'Racial cooldown', exact: true })
    await expect(racial).toHaveAccessibleDescription(/Not used: Tauren has no racial cooldown that adds damage\./)
    const row = (id: string) => list.locator(`[data-apl-row="${id}"]`)
    await expect(row('racial')).toHaveAttribute('data-inactive')
    const rake = list.getByRole('switch', { name: 'Rake', exact: true })
    await rake.click()
    await expect(rake).toBeChecked()
    await expect(rake).toHaveAccessibleDescription(/Not used in this raid: its warriors keep the boss bleeding\. Turn off “Rake only when nothing else bleeds” to use it anyway\./)
    await expect(row('rake')).toHaveAttribute('data-inactive')
    await list.getByRole('button', { name: 'Rake', exact: true }).click()
    const rakeSettings = page.getByRole('complementary', { name: 'Rake settings' })
    await rakeSettings.getByRole('switch', { name: 'Rake only when nothing else bleeds' }).click()
    await expect(rake).not.toHaveAccessibleDescription(/Not used/)
    await expect(row('rake')).not.toHaveAttribute('data-inactive')

    // The tuned thresholds are each row's own, in Energy and combo points (druid.md §6.2).
    await expect(row('ferociousBite')).toContainText('At 5 combo points · Shred first from 35 Energy · at any Energy in the last 4 s')
    await expect(row('rip')).toContainText('At 5 combo points · while the fight has 8 s left')
    await expect(row('tigersFury')).toContainText('Up to 20 Energy over the cap')
    await expect(row('clearcasting')).toContainText('Shred or Claw first: it’s free')
    await list.getByRole('button', { name: 'Tiger’s Fury', exact: true }).click()
    const tigersFury = page.getByRole('complementary', { name: 'Tiger’s Fury settings' }).getByRole('textbox', { name: 'Tiger’s Fury losing up to' })
    await expect(tigersFury).toHaveValue('20')
    await expect(tigersFury).toHaveAccessibleDescription(/at most this much of its Energy would be lost at the 100 cap/)
  })

  test('its Buffs and Fight tabs lock what it brings itself and leave out what it doesn’t use', async ({ page }) => {
    await switchToCat(page)
    await openTab(page, 'Buffs')
    // Its own Faerie Fire (the rotation) and Leader of the Pack (the talent) aren't counted twice.
    const faerieFire = page.getByRole('switch', { name: 'Faerie Fire' })
    await expect(faerieFire).toBeChecked()
    await expect(faerieFire).toBeDisabled()
    const pack = page.getByRole('switch', { name: 'Leader of the Pack' })
    await expect(pack).toBeChecked()
    await expect(pack).toBeDisabled()
    await expect(pack).toHaveAccessibleDescription(/Your talents bring it \(see Talents\), so it isn’t added twice\./)
    // A weapon stone's damage does nothing in Cat Form: off and locked, saying so. The Elemental
    // stone's crit still counts.
    const dense = page.getByRole('switch', { name: 'Dense Sharpening Stone / Weightstone' })
    await expect(dense).not.toBeChecked()
    await expect(dense).toBeDisabled()
    await expect(dense).toHaveAccessibleDescription(/Not used in Cat Form: your attacks there don’t use your weapon’s damage\./)
    await expect(page.getByRole('switch', { name: 'Elemental Sharpening Stone' })).toBeEnabled()
    // You're the raid's druid for Gift of the Wild, which you cast on yourself.
    await page.getByRole('button', { name: 'Druid', exact: true }).click()
    const gift = page.getByRole('switch', { name: 'Gift of the Wild' })
    await expect(gift).toBeChecked()
    await expect(gift).toBeEnabled()
    await expect(page.getByText('Needs a druid in the raid')).toHaveCount(0)

    await openTab(page, 'Fight')
    const fight = page.getByRole('tabpanel', { name: 'Fight' })
    // No line of the cat's reads the execute phase, so there's no switch for it.
    await expect(fight.getByRole('switch', { name: 'Execute phase' })).toHaveCount(0)
    await fight.getByRole('radio', { name: 'In front' }).click()
    await expect(fight.getByText('In front of the boss, it can parry and block your attacks. You can’t Shred there, so Claw builds instead.')).toBeVisible()
    await fight.getByRole('button', { name: /^Advanced/ }).click()
    await expect(fight.getByRole('textbox', { name: 'Execute phase starts at' })).toHaveCount(0)
    // Nothing a cat has reacts to being hit, so there's no damage to take either.
    await expect(fight.getByRole('textbox', { name: 'Boss level' })).toBeVisible()
    await expect(fight.getByRole('textbox', { name: 'Damage you take' })).toHaveCount(0)
  })

  test('with its own Faerie Fire off, the Buffs tab’s is off and unlocked, for another druid’s; what you set stays', async ({ page }) => {
    await switchToCat(page)
    const setOwn = async () => {
      await openTab(page, 'Rotation')
      await page.getByRole('tabpanel', { name: 'Rotation' }).getByRole('switch', { name: 'Faerie Fire', exact: true }).click()
      await openTab(page, 'Buffs')
    }
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const faerieFire = buffs.getByRole('switch', { name: 'Faerie Fire' })
    await setOwn()
    await expect(faerieFire).not.toBeChecked()
    await expect(faerieFire).toBeEnabled()
    await expect(faerieFire).toHaveAccessibleDescription(/You’re not keeping it up \(see Rotation\); turn this on if another druid does\./)
    await faerieFire.click()
    await expect(faerieFire).toBeChecked()
    // Your own again: on and locked. Off once more, another druid's is still on, as you set it.
    await setOwn()
    await expect(faerieFire).toBeChecked()
    await expect(faerieFire).toBeDisabled()
    await setOwn()
    await expect(faerieFire).toBeChecked()
    await expect(faerieFire).toBeEnabled()
  })

  test('simulates, and its results name its abilities, cooldowns and assumptions', { tag: '@smoke' }, async ({ page }) => {
    await switchToCat(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByText('DPS', { exact: true })).toBeVisible()
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    for (const ability of ['Shred', 'Auto attack', 'Rip', 'Ferocious Bite']) {
      await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    }
    // The form's swings aren't the weapon's, and a cat has no off hand.
    for (const name of ['Main hand', 'Off hand']) await expect(breakdown.getByText(name, { exact: true })).toHaveCount(0)
    const rip = breakdown.getByRole('listitem').filter({ hasText: /^Rip/ })
    await expect(rip).toContainText(/\d+\.\d% uptime on the boss/)
    await expect(rip).toContainText(/\d+\.\d% tick crit/)

    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    const table = results.getByRole('table')
    for (const name of ['Berserk', 'Manual Crowd Pummeler', 'Tiger’s Fury', 'Faerie Fire']) {
      await expect(table.getByRole('row', { name: new RegExp(`^${name} \\d+\\.\\d% \\d+\\.\\d$`) })).toBeVisible()
    }
    const clearcasting = table.getByRole('row', { name: /^Clearcasting \d+\.\d a fight, each spent by the next ability it makes free \d+\.\d% none$/ })
    await expect(clearcasting).toBeVisible()

    await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await expect(results.getByRole('heading', { name: 'Druid mechanics' })).toBeVisible()
    await expect(results.getByText(/^Energy comes 20 every 2 s/)).toBeVisible()
    await expect(results.getByText(/^Omen of Clarity procs Clearcasting 2 times a minute/)).toBeVisible()
    await expect(results.getByText(/Energy ticks in or Clearcasting procs/)).toBeVisible()
    await expect(results.getByText(/^The global cooldown, 1 s in Cat Form/)).toBeVisible()
    await expect(results.getByText(/^The cat never powershifts\./)).toBeVisible()
    await expect(results.getByText(/^In Cat Form you attack with the form’s own weapon: 43\.84–65\.76 damage every 1\.0 s/)).toBeVisible()
    // Nothing of the warrior's or the bear's: rage, Execute, Rend or Bloodthirst, and no bear figures.
    await expect(results.getByText(/rage arrives|Execute|Rend’s|Bloodthirst|in bear|Bear Form/)).toHaveCount(0)
  })
})

test.describe('Feral cat share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('carries the cat, its race and its rotation to a fresh page load', async ({ page }) => {
    await switchToCat(page)
    await openTab(page, 'Character')
    await page.getByRole('radio', { name: /Night Elf/ }).click()
    await openTab(page, 'Rotation')
    await page.getByRole('switch', { name: 'Rake', exact: true }).click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    // Change it after copying, and go back to Fury: the link brings the copied cat back.
    await page.getByRole('switch', { name: 'Rake', exact: true }).click()
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()

    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
    await expect(page.getByRole('button', { name: CAT })).toBeVisible()
    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Night Elf/ })).toHaveAttribute('aria-checked', 'true')
    await openTab(page, 'Rotation')
    const rake = page.getByRole('switch', { name: 'Rake', exact: true })
    await expect(rake).toBeChecked()
    // Its row is marked changed; the default raid's warriors leave it unused, and it says why.
    await expect(rake).toHaveAccessibleDescription(/^Changed\. Not used in this raid/)
  })
})

for (const [spec, width] of [
  ['Feral (Cat)', 360],
  ['Fury', 320],
] as const) {
  test.describe(`${spec}'s talent tree tabs at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true })

    test('show every tree’s name and points in full', async ({ page }) => {
      await page.goto('./')
      if (spec !== 'Fury') {
        await page.getByRole('button', { name: /^Spec: / }).click()
        await page.getByRole('menuitem', { name: /Feral \(Cat\)/ }).click()
      }
      await openTab(page, 'Talents')
      const tabs = page.getByRole('radiogroup', { name: 'Talent tree' }).getByRole('radio')
      await expect(tabs).toHaveCount(3)
      for (const tab of await tabs.all()) {
        const name = tab.locator('span').first()
        expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth), await tab.innerText()).toBe(true)
      }
      await noSideScroll(page)
    })
  })
}

test.describe('Feral cat on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches, shows its Rotation tab, runs and shows its results, all without side scroll', async ({ page }) => {
    await switchToCat(page)
    // The tree switcher's tabs are as wide as their names: "Feral Combat" isn't cut short.
    await openTab(page, 'Talents')
    const feral = page.getByRole('radio', { name: /^Feral Combat 37$/ })
    await expect(feral).toBeVisible()
    expect(await feral.locator('span').first().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.getByText(/There’s no powershifting/)).toBeVisible()
    await expect(tab.getByRole('switch', { name: 'Tiger’s Fury', exact: true })).toBeVisible()
    await noSideScroll(page)

    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    const show = page.getByRole('button', { name: 'Show results' })
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await show.click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Results' })).toBeFocused()
    const breakdown = sheet.getByRole('region', { name: 'Damage by ability' })
    for (const ability of ['Shred', 'Auto attack', 'Rip']) await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    await noSideScroll(page)
  })
})
