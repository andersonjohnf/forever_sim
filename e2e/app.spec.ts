import { expect, test } from './fixtures.ts'

test.describe('setup', () => {
  test('opens on a ready-to-run Fury warrior in pre-raid best in slot', async ({ page }) => {
    await page.goto('./')
    await expect(page).toHaveTitle('Forever Sim')
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Gear', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Head: Lionheart Helm' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Results' }).getByRole('button', { name: 'Simulate' })).toBeVisible()
  })

  test('the spec switcher offers only finished specs', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await expect(page.getByRole('menuitem', { name: /Fury/ })).toBeVisible()
    await expect(page.getByRole('menuitem')).toHaveCount(1)
  })

  test('a saved setup for a spec the sim doesn’t offer opens Fury instead', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const state = { config: { version: 1, spec: 'warrior-protection' }, bySpec: {}, section: 'rotation' }
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state, version: 1 }))
    })
    await page.goto('./')
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Rotation', exact: true })).toHaveAttribute('aria-selected', 'true')
  })

  test('remembers the setup across reloads', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Orc/ }).click()
    await page.reload()
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await expect(page.getByRole('radio', { name: /Orc/ })).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('gear', () => {
  test('picks an item by searching', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Head: Lionheart Helm' }).click()
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    await picker.getByRole('searchbox').or(picker.getByLabel('Search items')).fill('crown of caer darrow')
    await picker.getByRole('button', { name: /Crown of Caer Darrow/ }).click()
    await expect(picker).toBeHidden()
    await expect(page.getByRole('button', { name: 'Head: Crown of Caer Darrow' })).toBeVisible()
  })

  test('shows each item’s type and level, and finds items by type', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Head: Lionheart Helm' }).click()
    const picker = page.getByRole('dialog', { name: 'Choose head' })
    // "plate" is only in the item's type line, not its name or stats.
    await picker.getByLabel('Search items').fill('plate lionheart')
    await expect(picker.getByRole('button', { name: /Lionheart Helm/ })).toContainText('Plate · Item level 61 · Requires level 56')
    await picker.getByLabel('Search items').fill('two-hand sword blackblade')
    await expect(picker.getByText('No items match')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^Main hand:/ }).click()
    const weapons = page.getByRole('dialog', { name: 'Choose main hand' })
    await weapons.getByLabel('Search items').fill('two-hand sword blackblade')
    await expect(weapons.getByRole('button', { name: /Blackblade of Shahram/ })).toContainText('Two-hand sword · Item level')
  })

  test('a two-handed weapon frees the off hand', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Main hand:/ }).click()
    const picker = page.getByRole('dialog', { name: 'Choose main hand' })
    await picker.getByLabel('Search items').fill('blackblade of shahram')
    await picker.getByRole('button', { name: /Blackblade of Shahram/ }).click()
    await expect(page.getByRole('button', { name: 'Off hand: two-handed weapon equipped' })).toBeDisabled()
  })
})

test.describe('talents', () => {
  test('pastes a build code, and rejects a broken one', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await expect(page.getByText('17 / 34 / 0')).toBeVisible()

    await page.getByRole('button', { name: /Paste/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Paste a build code' })
    await dialog.getByRole('textbox').fill('99999')
    await dialog.getByRole('button', { name: 'Use this build' }).click()
    await expect(dialog.getByText(/exceeds max rank|bad rank|not a valid/i)).toBeVisible()

    await dialog.getByRole('textbox').fill('30305213132515201-05050103-')
    await dialog.getByRole('button', { name: 'Use this build' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('37 / 14 / 0')).toBeVisible()
  })

  test('adds a point with a click and removes it with a right-click', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await page.getByRole('button', { name: 'Clear' }).click()
    const talent = page.getByRole('button', { name: /^Cruelty, 0 of 5/ })
    await talent.click()
    await expect(page.getByRole('button', { name: /^Cruelty, 1 of 5/ })).toBeVisible()
    await page.getByRole('button', { name: /^Cruelty, 1 of 5/ }).click({ button: 'right' })
    await expect(page.getByRole('button', { name: /^Cruelty, 0 of 5/ })).toBeVisible()
  })
})

test.describe('sharing', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('a link for a spec the sim doesn’t offer leaves your setup alone', async ({ page }) => {
    await page.goto('./')
    // The share format (src/app/share.ts): deflate-raw JSON, base64url, in #s=.
    const hash = await page.evaluate(async () => {
      const json = new TextEncoder().encode(JSON.stringify({ version: 1, spec: 'paladin-retribution' }))
      const packed = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      let binary = ''
      for (const b of packed) binary += String.fromCharCode(b)
      return '#s=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    })
    await page.goto(`./${hash}`)
    await page.reload()
    await expect(page.getByText('That link is for a Retribution Paladin')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
  })

  test('a share link restores the setup, with undo', async ({ page, context }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Night Elf/ }).click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/forever_sim/#s=')

    const other = await context.newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await other.getByRole('tab', { name: 'Character', exact: true }).click()
    await expect(other.getByRole('radio', { name: /Night Elf/ })).toHaveAttribute('aria-checked', 'true')
    expect(new URL(other.url()).hash).toBe('')
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('keeps Simulate in a bottom bar and opens pickers as a drawer', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('complementary', { name: 'Results' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeVisible()
    await page.getByRole('button', { name: 'Head: Lionheart Helm' }).click()
    await expect(page.getByRole('dialog', { name: 'Choose head' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})

test.describe('simulation', () => {
  test('runs the default setup in the worker pool and shows a result', async ({ page }) => {
    await page.goto('./')
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByText(/fights of \d+ s · Forever rules/)).toBeVisible()
    await expect(results.getByText('Main hand')).toBeVisible()
  })

  test('selects Fury, simulates, and breaks the DPS down by ability', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByText('DPS', { exact: true })).toBeVisible()
    const breakdown = results.getByRole('heading', { name: 'Damage by ability' }).locator('..')
    for (const ability of ['Bloodthirst', 'Execute', 'Whirlwind', 'Heroic Strike', 'Main hand', 'Off hand']) {
      await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    }
  })

  test('explains a setup it can’t simulate', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Skyborne \(High Order\)/ }).click()
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('alert')).toContainText('a Skyborne warrior can’t be simulated')
  })
})

test.describe('rotation and buffs', () => {
  test('your own Battle Shout replaces the Buffs one, and a potion needs its Buffs switch', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const shout = page.getByRole('switch', { name: 'Battle Shout' })
    await expect(shout).toBeChecked()
    await expect(shout).toBeDisabled()
    await expect(page.getByText(/You keep it up yourself \(see Rotation\)/)).toBeVisible()
    await page.getByRole('switch', { name: 'Mighty Rage Potion' }).click()

    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await expect(page.getByText('Not used: turn on Mighty Rage Potion in Buffs first.')).toBeVisible()
    await page.getByRole('switch', { name: 'Battle Shout', exact: true }).click()

    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await expect(shout).toBeEnabled()
    await expect(shout).toBeChecked()
    await expect(page.getByText(/You keep it up yourself/)).toBeHidden()
  })
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('follows the OS colour scheme', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  })
})
