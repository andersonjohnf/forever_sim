import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { linkFor } from './links.ts'

// docs/architecture.md "Following the defaults"; docs/ux.md "Persistence and sharing" and "Gear".

const toasts = (page: Page) => page.locator('[data-sonner-toast]')

/**
 * A Protection paladin saved before the threat set and today's talents: v1's defaults (the pre-raid
 * list's gear and the popular 2/42/7 build), except the head, which the player set: Helm of Valor.
 */
const OLD_PALADIN = {
  version: 1,
  spec: 'paladin-protection',
  talents: '2-4530513321301551-502',
  gear: {
    head: { itemId: 16731, enchantId: 'arcanumFocus' },
    neck: { itemId: 13091 },
    shoulder: { itemId: 14552 },
    back: { itemId: 11930, enchantId: 'cloakSuperiorDefense' },
    chest: { itemId: 14624, enchantId: 'chestGreaterStats' },
    wrist: { itemId: 13951, enchantId: 'bracerSuperiorStamina' },
    hands: { itemId: 14622, enchantId: 'gloveThreat' },
    waist: { itemId: 14620 },
    // v1's legs and weapon had no enchant yet.
    legs: { itemId: 14623 },
    feet: { itemId: 14621, enchantId: 'bootsGreaterAgility' },
    finger1: { itemId: 11669 },
    finger2: { itemId: 15855 },
    trinket1: { itemId: 11810 },
    trinket2: { itemId: 4130 },
    mainHand: { itemId: 871 },
    offHand: { itemId: 12602, enchantId: 'shieldGreaterStamina' },
  },
}

/** Seeds the automatic save with OLD_PALADIN, once per test (a reload keeps what the app saved). */
async function seedOldPaladin(page: Page) {
  await page.addInitScript((config) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config, bySpec: {}, section: 'gear' }, version: 1 }))
  }, OLD_PALADIN)
}

test.describe('a returning visitor’s untouched gear and talents follow the defaults', () => {
  test('an old save gets the new threat set and talents, keeps the player’s own head, and says so once', async ({ page }) => {
    await seedOldPaladin(page)
    await page.goto('./')

    const notice = toasts(page).filter({ hasText: 'Updated to the new default gear and talents for Protection Paladin' })
    await expect(notice).toHaveCount(1)
    await expect(notice).toContainText('Gear and talents you changed yourself are kept.')

    const gear = page.getByRole('tabpanel', { name: 'Gear' })
    await expect(gear.getByRole('button', { name: "Shoulders: Lieutenant Commander's Lamellar Shoulders" })).toBeVisible()
    await expect(gear.getByRole('button', { name: 'Trinket 1: Weakness Analyzer' })).toBeVisible()
    await expect(gear.getByRole('button', { name: 'Head: Helm of Valor' })).toBeVisible()
    await expect(gear.getByText('1 slot differs from the threat set: Head. Equipping it replaces that slot.', { exact: true })).toBeVisible()

    // Today's default build, the guild theorycrafter's on 1.60.1.70009's trees with its refunded points
    // placed by measurement, 8/35/8 (D30).
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await expect(page.getByRole('tabpanel', { name: 'Talents' }).getByText(/8\s*\/\s*35\s*\/\s*8/).first()).toBeVisible()

    // The load saved what follows, so a reload moves nothing and says nothing.
    await page.reload()
    await expect(page.getByRole('tabpanel', { name: 'Talents' })).toBeVisible()
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await expect(gear.getByRole('button', { name: 'Head: Helm of Valor' })).toBeVisible()
    await expect(toasts(page)).toHaveCount(0)
  })
})

test.describe('a build from the game’s older talent trees (docs/data/talents.md#tree-versions)', () => {
  /** Seeds the automatic save with a Retribution build on 1.60.1.69913's trees (version 1), saved as the player's own. */
  const seedOldRetribution = (page: Page, talents: string) =>
    page.addInitScript((talents) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const config = { version: 1, spec: 'paladin-retribution', talents }
      const following = { 'paladin-retribution': { gear: [], talents: false } }
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config, bySpec: {}, section: 'talents', following }, version: 1 }))
    }, talents)

  test('the player’s own Retribution build is mapped by name, and the visit says what it lost, once', async ({ page }) => {
    // The Retribution default then, one point off: the player's own build.
    await seedOldRetribution(page, '250003-503-052052310012330311')
    await page.goto('./')
    const notice = toasts(page).filter({ hasText: 'Talent points refunded for Retribution Paladin' })
    await expect(notice).toHaveCount(1)
    await expect(notice).toContainText(
      'The game’s new talent trees refunded 15 of your Retribution Paladin talent points: Improved Holy Strike and Crusade left the game, and 5 talents below them lost the points their rows need. Spend them again in Talents.',
    )
    await expect(toasts(page).filter({ hasText: /Updated to the new default/ })).toHaveCount(0)
    // 8/8/19 on today's trees: what kept its place.
    await expect(page.getByRole('tabpanel', { name: 'Talents' }).getByText(/8\s*\/\s*8\s*\/\s*19/).first()).toBeVisible()

    // The visit saved it on today's trees, so a reload says nothing.
    await page.reload()
    await expect(page.getByRole('tabpanel', { name: 'Talents' }).getByText(/8\s*\/\s*8\s*\/\s*19/).first()).toBeVisible()
    await expect(toasts(page)).toHaveCount(0)
  })

  test('the Retribution default then loads as today’s default, and the visit says so (review TM2-1)', async ({ page }) => {
    await seedOldRetribution(page, '250003-503-052052310012330321')
    await page.goto('./')
    const notice = toasts(page).filter({ hasText: 'Talents moved onto the game’s new trees for Retribution Paladin' })
    await expect(notice).toHaveCount(1)
    await expect(notice).toContainText('Your Retribution Paladin talents were the default on the game’s old trees; they’re now today’s default.')
    await expect(page.getByRole('tabpanel', { name: 'Talents' }).getByText('Using the default build.')).toBeVisible()
  })

  // Review FU-1: two stacked, the one behind ran out its time unread, and a phone can't hover to spread them.
  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

    test('a shared link opened over it: the link’s notice and the visit’s come one at a time', async ({ page }) => {
      await page.clock.install()
      await page.goto('about:blank')
      const hash = await linkFor(page, { version: 1, spec: 'paladin-protection', talents: '2-4530513321301551-5' })
      await seedOldRetribution(page, '250003-503-052052310012330311')
      await page.goto(`./${hash}`)
      await oneAtATime(page, ['Loaded a shared setup', 'Talent points refunded for Retribution Paladin'])
    })
  })
})

test.describe('a share link and the defaults notice (docs/ux.md "Persistence and sharing")', () => {
  test('a link that replaces the moved spec leaves it out, so no notice contradicts the link', async ({ page }) => {
    await page.goto('about:blank')
    const hash = await linkFor(page, { version: 1, spec: 'paladin-protection', talents: '2-4530513321301551-502' })
    await seedOldPaladin(page)
    await page.goto(`./${hash}`)
    const loaded = toasts(page).filter({ hasText: 'Loaded a shared setup' })
    await expect(loaded).toHaveCount(1)
    await expect(toasts(page).filter({ hasText: /Updated to the new default/ })).toHaveCount(0)
    // The link's own talents, written on 1.60.1.69913's trees (version 1): the popular build the sim
    // shipped as a preset, so they read as today's preset of that name (docs/data/talents.md
    // #tree-versions), 2/42/7 with Divine Strength's 2 points where Improved Holy Strike's were.
    await expect(loaded).toContainText('Your talents were the Protection popular build on the game’s old trees; they’re now its version for today’s trees.')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await expect(page.getByRole('tabpanel', { name: 'Talents' }).getByText(/2\s*\/\s*42\s*\/\s*7/).first()).toBeVisible()
  })

  test('a link for another spec leaves the notice for the spec that moved, and the two come one at a time', async ({ page }) => {
    await page.clock.install()
    await page.goto('about:blank')
    const hash = await linkFor(page, { version: 1, spec: 'warrior-arms' })
    await seedOldPaladin(page)
    await page.goto(`./${hash}`)
    await oneAtATime(page, ['Loaded a shared setup', 'Updated to the new default gear and talents for Protection Paladin'])
  })
})

/**
 * The load's notices `titles` come one at a time (docs/ux.md "Notices"): one is up alone, in either
 * order, and the other comes once it has gone, with its own whole time to be read (10 s at least).
 * The page's clock must be installed.
 */
async function oneAtATime(page: Page, titles: readonly [string, string]) {
  await expect(toasts(page)).toHaveCount(1)
  // Both have been raised by now; the second waits.
  await page.waitForTimeout(1000)
  await expect(toasts(page)).toHaveCount(1)
  const firstText = await toasts(page).first().innerText()
  const [first, second] = firstText.includes(titles[0]) ? titles : [titles[1], titles[0]]
  expect(firstText).toContain(first)
  // Its time runs out, a second at a time (30 s at the most), and only then does the second come.
  const front = toasts(page).filter({ hasText: first })
  const next = toasts(page).filter({ hasText: second })
  for (let s = 0; s < 31 && (await front.count()) > 0; s++) {
    await expect(next).toHaveCount(0)
    await page.clock.runFor(1_000)
  }
  await expect(front).toHaveCount(0)
  await expect(next).toBeVisible()
  await expect(toasts(page)).toHaveCount(1)
  // Its own time starts now: still up 9 s later.
  await page.clock.runFor(9_000)
  await expect(next).toBeVisible()
  await page.clock.runFor(22_000)
  await expect(toasts(page)).toHaveCount(0)
}

test.describe('the Gear tab’s default set button (docs/ux.md "Gear")', () => {
  for (const width of [390, 1280]) {
    test(`says what it replaces, puts the default set back from the keyboard, then goes, ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const gear = page.getByRole('tabpanel', { name: 'Gear' })
      const equip = gear.getByRole('button', { name: 'Equip pre-raid best in slot' })
      const status = gear.locator('#gear-default-status')
      // Matching: the line says so, and no button waits that would do nothing.
      await expect(status).toHaveText('Wearing pre-raid best in slot.')
      await expect(equip).toHaveCount(0)

      await gear.getByRole('button', { name: 'Gear options' }).click()
      await page.getByRole('menuitem', { name: 'Remove all gear' }).click()
      await expect(page.getByRole('menuitem', { name: /Equip/ })).toHaveCount(0)
      const differs = 'slots differ from pre-raid best in slot: Head, Neck, Shoulders and \\d+ more\\. Equipping it fills all\\s'
      await expect(equip).toHaveAccessibleDescription(new RegExp(`^(\\d+) ${differs}\\1\\.$`))
      expect((await equip.boundingBox())!.height).toBeGreaterThanOrEqual(44)

      await equip.focus()
      await page.keyboard.press('Enter')
      await expect(gear.getByRole('button', { name: /^Head: Lionheart Helm/ })).toBeVisible()
      await expect(status).toHaveText('Wearing pre-raid best in slot.')
      await expect(equip).toHaveCount(0)
      // Focus moved to the line as the button went, not to the page.
      await expect(status).toBeFocused()
      // No horizontal scroll at either width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }

  test('names a slot it clears: an Arms warrior’s own off hand, which the two-hander leaves empty', async ({ page }) => {
    await page.goto('about:blank')
    await page.goto(`./${await linkFor(page, { version: 1, spec: 'warrior-arms' })}`)
    const gear = page.getByRole('tabpanel', { name: 'Gear' })
    const onIcon = { position: { x: 24, y: 24 } }
    for (const [slot, search, item] of [
      ['main hand', 'ironfoe', /Ironfoe/],
      ['off hand', 'mirah', /Mirah/],
    ] as const) {
      await gear.getByRole('button', { name: new RegExp(`^${slot[0].toUpperCase()}${slot.slice(1)}: `) }).click(onIcon)
      const picker = page.getByRole('dialog', { name: `Choose ${slot}` })
      await picker.getByLabel('Search items').fill(search)
      await picker.getByRole('button', { name: item }).click(onIcon)
      await expect(picker).toBeHidden()
    }
    await expect(gear.locator('#gear-default-status')).toHaveText(
      /^2 slots differ from pre-raid best in slot: Main hand and Off hand\. Equipping it replaces\s1 slot and clears Off hand\.$/,
    )
    await gear.getByRole('button', { name: 'Equip pre-raid best in slot' }).click()
    await expect(gear.getByRole('button', { name: /^Main hand: Blackblade of Shahram/ })).toBeVisible()
    await expect(gear.getByRole('button', { name: /^Off hand: two-handed weapon equipped/ })).toBeVisible()
  })
})

test.describe('the Talents tab’s default build line (docs/ux.md "Talents")', () => {
  test('shows while the build is the default, and goes once the points change', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    const talents = page.getByRole('tabpanel', { name: 'Talents' })
    const line = talents.getByText('Using the default build.', { exact: true })
    await expect(line).toBeVisible()
    await talents.getByRole('button', { name: 'Clear' }).click()
    await expect(line).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Talent build presets' }).click()
    await page.getByRole('option', { name: /\(default\)/ }).click()
    await expect(line).toBeVisible()
  })
})
