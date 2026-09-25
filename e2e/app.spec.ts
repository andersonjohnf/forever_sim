import { expect, test } from './fixtures.ts'

test('opens every section without an error', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('./')
  // The fixture fails the test on any console error, uncaught exception or failed request.
  for (const section of ['Character', 'Talents', 'Gear', 'Buffs', 'Rotation', 'Fight']) {
    await page.getByRole('tab', { name: section, exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: section, exact: true })).toBeVisible()
  }
})

test.describe('setup', () => {
  test('opens on a ready-to-run Fury warrior in pre-raid best in slot', { tag: '@smoke' }, async ({ page }) => {
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
    // Each class's specs are a group named by its heading, in the switcher's order.
    const warriors = page.getByRole('group', { name: 'Warrior' })
    await expect(warriors.getByRole('menuitem', { name: /Fury/ })).toBeVisible()
    await expect(warriors.getByRole('menuitem', { name: /Arms/ })).toBeVisible()
    // Protection, the first tank, since P2; its role reads "Tank" on the item's second line.
    await expect(warriors.getByRole('menuitem', { name: /Protection/ })).toContainText('Tank')
    // The Feral cat since B2, the bear, a tank, since B4, and Balance since K6, under the Druid heading.
    await expect(page.getByRole('group', { name: 'Druid' }).getByRole('menuitem')).toHaveText([/^Feral \(Cat\)\s*DPS$/, /^Feral \(Bear\)\s*Tank$/, /^Balance\s*DPS$/])
    // Retribution since C2 and the Protection paladin, a tank, since C3, under the Paladin heading.
    const paladins = page.getByRole('group', { name: 'Paladin' })
    await expect(page.getByRole('menu').getByText('Paladin', { exact: true })).toBeVisible()
    await expect(paladins.getByRole('menuitem')).toHaveText([/^Retribution\s*DPS$/, /^Protection\s*Tank$/])
    // Enhancement since S1 and Elemental since K5, under the Shaman heading.
    await expect(page.getByRole('group', { name: 'Shaman' }).getByRole('menuitem')).toHaveText([/^Enhancement\s*DPS$/, /^Elemental\s*DPS$/])
    // The three rogues since R1, under their class's heading.
    await expect(page.getByRole('group', { name: 'Rogue' }).getByRole('menuitem')).toHaveText([/^Combat\s*DPS$/, /^Assassination\s*DPS$/, /^Subtlety\s*DPS$/])
    // Fire, Frost and Arcane since K2, under the Mage heading.
    await expect(page.getByRole('group', { name: 'Mage' }).getByRole('menuitem')).toHaveText([/^Fire\s*DPS$/, /^Frost\s*DPS$/, /^Arcane\s*DPS$/])
    // The Destruction and Affliction warlocks since K3, Demonology since H3.
    await expect(page.getByRole('group', { name: 'Warlock' }).getByRole('menuitem')).toHaveText([/^Destruction\s*DPS$/, /^Affliction\s*DPS$/, /^Demonology\s*DPS$/])
    // The Shadow Priest since K4, under the Priest heading.
    await expect(page.getByRole('group', { name: 'Priest' }).getByRole('menuitem')).toHaveText([/^Shadow\s*DPS$/])
    // Marksmanship, Beast Mastery and Survival since H2, under the Hunter heading.
    await expect(page.getByRole('group', { name: 'Hunter' }).getByRole('menuitem')).toHaveText([/^Marksmanship\s*DPS$/, /^Beast\sMastery\s*DPS$/, /^Survival\s*DPS$/])
    await expect(page.getByRole('menuitem')).toHaveCount(23)
    await expect(page.getByRole('menu').getByRole('group')).toHaveText([/^Warrior/, /^Druid/, /^Paladin/, /^Shaman/, /^Rogue/, /^Mage/, /^Warlock/, /^Priest/, /^Hunter/])
  })

  test('switching to Arms keeps it across reloads, with its own setup', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await expect(page.getByRole('button', { name: /Spec: Arms Warrior/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Main hand: Blackblade of Shahram' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: /Spec: Arms Warrior/ })).toBeVisible()
  })

  // Every spec in the sim ships (B4), so a spec it doesn't offer is one it doesn't know: a newer
  // version's, say.
  test('a saved setup for a spec the sim doesn’t offer opens Fury instead', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const state = { config: { version: 1, spec: 'deathknight-frost' }, bySpec: {}, section: 'rotation' }
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state, version: 1 }))
    })
    await page.goto('./')
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Rotation', exact: true })).toHaveAttribute('aria-selected', 'true')
  })

  // #8: a stored tab that no longer exists left no tab selected and no section showing, and a setup
  // stored under another spec's key opened when you switched to that spec.
  test('a malformed save falls back safely: an unknown tab opens Gear, and a misfiled setup is dropped', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const fury = { version: 1, spec: 'warrior-fury', race: 'horde-orc' }
      const bySpec = { 'warrior-arms': { ...fury }, 'warrior-berserker': { version: 1, spec: 'warrior-arms' }, 'rogue-combat': 'garbage' }
      const state = { config: fury, bySpec, section: 'stats', junk: { a: 1 } }
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state, version: 1 }))
    })
    await page.goto('./')
    await expect(page.getByRole('tab', { name: 'Gear', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel', { name: 'Gear' })).toBeVisible()
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Orc', exact: true })).toBeChecked()
    // Arms opens on its own defaults, not on the Fury setup stored under its name.
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await expect(page.getByRole('button', { name: /^Spec: Arms Warrior/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Human', exact: true })).toBeChecked()
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
    await expect(dialog.getByRole('alert')).toHaveText(/^That isn’t a Warrior code: .* Is it for another class\?$/)

    await dialog.getByRole('textbox').fill('30305213132515201-05050103-')
    await dialog.getByRole('button', { name: 'Use this build' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('37 / 14 / 0')).toBeVisible()
  })

  test('loads a documented preset from the menu', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    const presets = page.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Fury (default)')
    await presets.click()
    // Only the builds of specs the app offers (docs/ux.md principle 8): Protection's since it
    // shipped. One "(default)": another spec's default reads plainly (TU10).
    await expect(page.getByRole('option')).toHaveText(['Fury (default)', 'Fury + Precision', 'Arms default', 'Protection default', 'Protection + Improved Thunder Clap'])
    await page.getByRole('option', { name: 'Fury + Precision' }).click()
    await expect(page.getByText('15 / 36 / 0')).toBeVisible()
    await expect(presets).toHaveText('Fury + Precision')
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
      // Every spec in the sim ships (B4): a spec it doesn't offer is one it doesn't know.
      const json = new TextEncoder().encode(JSON.stringify({ version: 1, spec: 'deathknight-frost' }))
      const packed = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      let binary = ''
      for (const b of packed) binary += String.fromCharCode(b)
      return '#s=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    })
    // A fresh load of the link (e2e/shell-sharing.spec.ts covers one pasted into an open tab).
    await page.goto('about:blank')
    await page.goto(`./${hash}`)
    await expect(page.getByText('That link is for a spec this sim doesn’t know')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
  })

  test('a share link restores the setup, and says so', { tag: '@smoke' }, async ({ page, context }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Night Elf/ }).click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/#s=')

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

  test('keeps Simulate in a bottom bar and opens pickers as a drawer', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('complementary', { name: 'Results' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Simulate', exact: true })).toBeVisible()
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

  test('selects Fury, simulates, and breaks the DPS down by ability', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByText('DPS', { exact: true })).toBeVisible()
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    for (const ability of ['Bloodthirst', 'Execute', 'Whirlwind', 'Heroic Strike', 'Main hand', 'Off hand']) {
      await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    }
    // Each row's line starts with its count a fight, named for what it counts, and ends with its
    // average per landed hit (docs/ux.md#results "Breakdown").
    const row = (name: string) => breakdown.getByRole('listitem').filter({ hasText: new RegExp(`^${name}\\d`) })
    await expect(row('Main hand')).toContainText(/\d+\.\d swings a fight · \d+\.\d% crit · \d+\.\d% avoided · \d+\.\d% glancing · [\d,]+ avg hit/)
    await expect(row('Bloodthirst')).toContainText(/\d+\.\d casts a fight · \d+\.\d% crit · \d+\.\d% avoided · [\d,]+ avg hit/)
    await expect(row('Hand of Justice')).toContainText(/\d+\.\d procs a fight/)
    await expect(row('Deep Wounds')).toContainText(/\d+\.\d procs a fight · [\d,]+ avg tick/)
  })

  test('shows Fury’s cooldowns and buffs with uptimes and casts per fight, collapsed until opened', async ({ page }) => {
    await page.goto('./')
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const toggle = results.getByRole('button', { name: 'Cooldowns and buffs' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Casts that deal no damage stay out of the damage breakdown.
    await expect(results.getByRole('region', { name: 'Damage by ability' }).getByText('Death Wish', { exact: true })).toHaveCount(0)
    await toggle.click()
    const table = results.getByRole('table')
    await expect(table.getByRole('columnheader', { name: 'Uptime' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Casts per fight' })).toBeVisible()
    // Death Wish: its buff's uptime and its casts; Flurry, a proc, has no casts.
    await expect(table.getByRole('row', { name: /^Death Wish \d+\.\d% \d+\.\d$/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /^Flurry \d+\.\d% none$/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /^Bloodrage none \d+\.\d$/ })).toBeVisible()
  })

  test('selects Arms, simulates, and breaks the DPS down by ability', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByText('DPS', { exact: true })).toBeVisible()
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    for (const ability of ['Mortal Strike', 'Slam', 'Overpower', 'Rend', 'Execute', 'Main hand']) {
      await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    }
    await expect(breakdown.getByText('Off hand', { exact: true })).toBeHidden()
    // Rend's row reads its ticks and its applications apart (docs/ux.md#results).
    const rend = breakdown.getByRole('listitem').filter({ hasText: /^Rend/ })
    await expect(rend).toContainText(/\d+\.\d% uptime on the boss/)
    // Its count names what its avoided share is of.
    await expect(rend).toContainText(/\d+\.\d applications a fight · \d+\.\d% tick crit · \d+\.\d% avoided · [\d,]+ avg tick/)
    await expect(breakdown.getByRole('listitem').filter({ hasText: /^Deep Wounds/ })).toContainText(/\d+\.\d procs a fight · [\d,]+ avg tick/)
    // The Overpower window is among the buffs.
    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    await expect(results.getByRole('table').getByRole('row', { name: /^Overpower window \d+\.\d% none$/ })).toBeVisible()
  })

  test('simulates a Skyborne warrior on its class row, and names that placeholder in the assumptions (D24, D36)', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    const skyborne = page.getByRole('radio', { name: /Skyborne \(High Order\)/ })
    await skyborne.click()
    await expect(skyborne).not.toContainText('Can’t be simulated')
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByRole('alert')).toHaveCount(0)
    await expect(results.getByRole('group', { name: 'DPS' })).toBeVisible()
    await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await expect(
      results.getByText(/base attributes Str 120, Agi 80, Sta 110, Int 30, Spi 45, the class row with no race adjustment, as Skyborne’s is unknown;/),
    ).toBeVisible()
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

test.describe('rotation groups', () => {
  test('groups a spec’s settings above its list under headings, each dependent setting under its parent (Retribution)', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Retribution/ }).click()
    await expect(page.getByRole('button', { name: /^Spec: Retribution Paladin/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    // Juju Flurry sits with the mana consumables, and the on-use trinkets are a row of the list, as every spec's.
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
    await expect(tab.getByRole('list', { name: 'Priority list' }).getByRole('switch', { name: 'On-use trinkets', exact: true })).toBeVisible()
    // The potion's thresholds wait behind the heading's Advanced button, then sit in the potion's own list item, under it.
    const consumables = tab.getByRole('region', { name: 'Consumables' })
    const potion = consumables.getByRole('listitem').filter({ has: page.getByRole('switch', { name: 'Major Mana Potion', exact: true }) })
    await expect(potion.getByRole('textbox', { name: 'Major Mana Potion when missing' })).toHaveCount(0)
    await consumables.getByRole('button', { name: /^Advanced/ }).click()
    await expect(potion.getByRole('textbox', { name: 'Major Mana Potion early, when missing' })).toBeVisible()
    await expect(potion.getByRole('textbox', { name: 'Major Mana Potion when missing' })).toBeVisible()
    // Every heading sits above the list.
    const list = (await tab.getByRole('list', { name: 'Priority list' }).boundingBox())!
    expect((await consumables.boundingBox())!.y).toBeLessThan(list.y)
  })

  test('shows Fury’s consumables under their heading, above its priority list', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
    const consumables = (await tab.getByRole('region', { name: 'Consumables' }).boundingBox())!
    expect(consumables.y).toBeLessThan((await tab.getByRole('list', { name: 'Priority list' }).boundingBox())!.y)
  })

  test('puts Arms’ stance first, above its headings and its list', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    const stance = tab.getByRole('radiogroup', { name: 'Stance' })
    await expect(stance).toBeVisible()
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
    const stanceTop = (await stance.boundingBox())!.y
    expect(stanceTop).toBeLessThan((await tab.getByRole('heading', { name: 'Consumables' }).boundingBox())!.y)
    expect(stanceTop).toBeLessThan((await tab.getByRole('list', { name: 'Priority list' }).boundingBox())!.y)
    // Rend is a row on the list.
    await expect(tab.locator('[data-apl-row="rend"]')).toBeVisible()
  })
})

test.describe('fight', () => {
  test('offers no number of enemies while the sim has one target, and a saved setup with more still loads', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const state = { config: { version: 1, spec: 'warrior-fury', fight: { extraTargets: 2 } }, bySpec: {}, section: 'fight' }
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state, version: 1 }))
    })
    await page.goto('./')
    await expect(page.getByRole('tab', { name: 'Fight', exact: true })).toHaveAttribute('aria-selected', 'true')
    const fight = page.getByRole('tabpanel', { name: 'Fight' })
    await expect(fight.getByRole('radio', { name: 'Behind' })).toBeVisible()
    await expect(fight.getByText('Enemies', { exact: true })).toHaveCount(0)
    await expect(fight.getByRole('textbox', { name: 'Number of enemies' })).toHaveCount(0)
  })
})

test.describe('Arms rotation', () => {
  test('fighting in Berserker Stance turns Whirlwind on and Rend and Overpower off, until you set them', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const stance = page.getByRole('radiogroup', { name: 'Stance' })
    await expect(stance.getByRole('radio', { name: 'Battle' })).toBeChecked()
    const whirlwind = page.getByRole('switch', { name: 'Whirlwind', exact: true })
    const rend = page.getByRole('switch', { name: 'Rend', exact: true })
    const overpower = page.getByRole('switch', { name: 'Overpower', exact: true })
    await expect(whirlwind).not.toBeChecked()
    await expect(rend).toBeChecked()
    await expect(overpower).toBeChecked()

    await stance.getByRole('radio', { name: 'Berserker' }).click()
    await expect(stance.getByRole('radio', { name: 'Berserker' })).toBeChecked()
    await expect(whirlwind).toBeChecked()
    await expect(rend).not.toBeChecked()
    await expect(overpower).not.toBeChecked()
    // A setting you choose sticks; the defaults come back with Reset rotation.
    await overpower.click()
    await expect(overpower).toBeChecked()
    await page.getByRole('button', { name: 'Reset rotation' }).click()
    await expect(stance.getByRole('radio', { name: 'Battle' })).toBeChecked()
    await expect(whirlwind).not.toBeChecked()
    await expect(overpower).toBeChecked()
  })
})

test.describe('about', () => {
  // The release stamp's format depends on the locale and zone (docs/ux.md "About & data").
  test.use({ locale: 'en-US', timezoneId: 'America/New_York' })

  test('credits wago.tools, the only game-data source, in the footer and the About sheet', async ({ page }) => {
    await page.goto('./')
    const footer = page.locator('footer')
    await expect(footer).toContainText('Game data from')
    await expect(footer.getByRole('link', { name: 'wago.tools' })).toBeVisible()
    await expect(footer).not.toContainText(/foreverchanges/i)

    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'About & data' }).click()
    const about = page.getByRole('dialog', { name: 'About Forever Sim' })
    await expect(about.getByRole('link', { name: 'wago.tools' })).toBeVisible()
    await expect(about).toContainText('all come from the WoW Forever beta client')
    await expect(about).toContainText(/Items\s*Build 1\.60\./)
    await expect(about).not.toContainText(/foreverchanges/i)
    // The release stamp (docs/ux.md "About & data"): the build's time, in the viewer's zone, and its commit.
    const stamp = about.getByText(/^Updated /)
    await expect(stamp).toHaveText(/^Updated \d{1,2}:\d{2}\s?[AP]M \S+ · [A-Z][a-z]{2} \d{1,2}, \d{4}( · build [0-9a-f]{7})?$/)
    await expect(stamp.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
  })
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('follows the OS colour scheme', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  })
})
