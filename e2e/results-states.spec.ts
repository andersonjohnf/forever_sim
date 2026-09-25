import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The results' run states and details (docs/ux.md#results, #states): progress on a re-run, stale
// and other-spec results, failures on a phone, the desktop panel's own scrolling, and the
// Cooldowns and buffs and Assumptions details.

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

async function simulate(scope: Locator | Page, timeout = 60_000) {
  await scope.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(scope.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout })
}

const results = (page: Page) => page.getByRole('complementary', { name: 'Results' })
const status = (page: Page) => page.getByRole('status', { name: 'Simulation status' })

test.describe('run states', () => {
  test('a re-run shows its progress over the dimmed result, and announces the outcome', async ({ page }) => {
    // A full 100,000-fight run first: about 8 s on 16 cores, but on a 4-core CI runner it can take
    // over a minute, past the 30 s test timeout.
    test.setTimeout(180_000)
    // 100,000 fights of 10 minutes: long enough to watch the run.
    await seed(page, { run: { mode: 'fixed', iterations: 100000, seed: 1 }, fight: { durationSec: 600 } })
    await page.goto('./')
    const panel = results(page)
    const dps = panel.getByRole('group', { name: 'DPS' })
    await panel.getByRole('button', { name: 'Simulate' }).click()
    await expect(status(page)).toHaveText('Simulating…')
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 150_000 })
    await expect(status(page)).toHaveText(/^Done: [\d,]+\.\d DPS$/)
    await expect(dps.locator('[data-dimmed="true"]')).toHaveCount(0)

    await panel.getByRole('button', { name: 'Run again' }).click()
    await expect(panel.getByRole('progressbar', { name: 'Simulation progress' })).toBeVisible()
    await expect(panel.getByText(/^Simulating…/)).toBeVisible()
    await expect(dps.locator('[data-dimmed="true"]')).toHaveCount(1)
    await expect(panel.getByRole('region', { name: 'Result details' }).locator('[data-dimmed="true"]')).toHaveCount(1)
    await expect(status(page)).toHaveText('Simulating…')

    await panel.getByRole('button', { name: 'Cancel' }).click()
    await expect(status(page)).toHaveText('Simulation cancelled.')
    await expect(panel.getByRole('progressbar')).toHaveCount(0)
    await expect(dps.locator('[data-dimmed="true"]')).toHaveCount(0)
  })

  test('a changed setup dims the whole result; another spec’s result is set aside until you switch back', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const details = panel.getByRole('region', { name: 'Result details' })
    await expect(details.locator('[data-dimmed="true"]')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Orc/ }).click()
    await expect(panel.getByRole('group', { name: 'DPS' })).toContainText('Setup changed')
    await expect(details.locator('[data-dimmed="true"]')).toHaveCount(1)
    await expect(panel.getByRole('button', { name: 'Simulate' })).toBeVisible()

    // Arms has no result of its own yet, so Fury's isn't shown under it.
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await expect(panel.getByRole('group', { name: 'DPS' })).toContainText('—')
    await expect(panel).toContainText('Simulate to see your DPS.')
    await expect(panel.getByRole('region', { name: 'Damage by ability' })).toHaveCount(0)

    await page.getByRole('button', { name: /Spec: Arms Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()
    await expect(panel.getByRole('group', { name: 'DPS' })).toContainText(/\d+\.\d/)
    await expect(panel.getByRole('region', { name: 'Damage by ability' })).toBeVisible()
  })

  test('each spec keeps its own result: running Arms doesn’t lose Fury’s, and the change compares each with its own', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    const dps = panel.getByRole('group', { name: 'DPS' })
    await simulate(panel)
    const fury = (await dps.textContent())!

    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await expect(panel).toContainText('Simulate to see your DPS.')
    await simulate(panel)
    const arms = (await dps.textContent())!
    expect(arms).not.toBe(fury)

    // Back on Fury, its own result, not stale and with no change from Arms's.
    await page.getByRole('button', { name: /Spec: Arms Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()
    await expect(dps).toHaveText(fury)
    await expect(dps).not.toContainText('Setup changed')
    await expect(panel.getByRole('region', { name: 'Damage by ability' })).toBeVisible()
    // And Arms's is still there.
    await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await expect(dps).toHaveText(arms)
  })

  test('a run whose worker stops answering ends after a minute, and says to run it again', async ({ page }) => {
    // A worker that never answers, and a clock the test moves (docs/architecture.md#iterations-determinism-and-workers).
    await page.route('**/assets/sim.worker*.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage = () => {}' }))
    // Paused before the run, so only runFor moves it: real time spent between the worker starting
    // and runFor (a second or more under load) doesn't count toward the minute.
    const start = new Date('2026-01-01T00:00:00Z').getTime()
    await page.clock.install({ time: start })
    await page.goto('./')
    await page.clock.pauseAt(start + 3_600_000)
    await results(page).getByRole('button', { name: 'Simulate' }).click()
    await expect(results(page).getByRole('button', { name: 'Cancel' })).toBeVisible()
    await page.clock.runFor(59_000)
    await expect(results(page).getByRole('alert')).toHaveCount(0)
    await page.clock.runFor(2_000)
    const alert = results(page).getByRole('alert')
    await expect(alert).toContainText('The simulation failed')
    await expect(alert).toContainText('The simulation stopped responding for a minute, so it was stopped. Run it again.')
    await expect(alert).not.toContainText('reset this spec')
  })

  test('a worker that can’t start fails the run, says to reload, and the next Simulate recovers (#1)', async ({ page }) => {
    // Workers whose script throws as it loads, as one the site no longer serves would fail; they
    // used to respawn in a loop, and every later run failed with them.
    let failing = true
    let loads = 0
    await page.route('**/assets/sim.worker*.js', (route) => {
      loads++
      return failing ? route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("no worker")' }) : route.continue()
    })
    await page.goto('./')
    const panel = results(page)
    await panel.getByRole('button', { name: 'Simulate' }).click()
    const alert = panel.getByRole('alert')
    await expect(alert).toContainText('The simulation failed')
    await expect(alert).toContainText('The simulation couldn’t start. Reload the page, then run it again.')
    await expect(alert).not.toContainText('reset this spec')
    await expect(alert.getByRole('button', { name: 'Reload page' })).toBeVisible()
    // No worker is started again until a run asks for one.
    const afterFailure = loads
    await page.waitForTimeout(1_000)
    expect(loads).toBe(afterFailure)

    failing = false
    await simulate(panel)
    await expect(alert).toHaveCount(0)
    await expect(panel.getByRole('group', { name: 'DPS' })).toContainText(/\d+\.\d/)
  })

  test('a worker the site no longer serves (a 404 page): reload offered, and after two failed starts runs go on the page (AR-7, AR-10)', async ({ page, pageProblems }) => {
    // As after a deploy: the old page asks for a worker script that's gone, and gets the 404 page.
    let loads = 0
    await page.route('**/assets/sim.worker*.js', (route) => {
      loads++
      return route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>Not found</title><h1>404</h1>' })
    })
    await page.goto('./')
    const panel = results(page)
    const alert = panel.getByRole('alert')
    const run = () => panel.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
    await run()
    await expect(alert).toContainText('The simulation couldn’t start. Reload the page, then run it again.')
    const reload = alert.getByRole('button', { name: 'Reload page' })
    await expect(reload).toBeVisible()
    expect((await reload.boundingBox())!.height).toBeGreaterThanOrEqual(44)

    // A second failed start, then the third run goes on the page itself: a result, and no worker asked for.
    await run()
    await expect(alert).toContainText('couldn’t start')
    const loaded = loads
    await run()
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
    await expect(alert).toHaveCount(0)
    await expect(panel.getByRole('group', { name: 'DPS' })).toContainText(/\d+\.\d/)
    expect(loads).toBe(loaded)

    // The 404s are what this test serves; nothing else may fail.
    const others = pageProblems.filter((p) => !/^HTTP 404 .*\/assets\/sim\.worker/.test(p))
    pageProblems.splice(0, pageProblems.length, ...others)
  })

  test('Reload page reloads, with the setup kept', async ({ page }) => {
    await page.route('**/assets/sim.worker*.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("no worker")' }))
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Orc/ }).click()
    const panel = results(page)
    await panel.getByRole('button', { name: 'Simulate' }).click()
    const alert = panel.getByRole('alert')
    await Promise.all([page.waitForEvent('load'), alert.getByRole('button', { name: 'Reload page' }).click()])
    await expect(alert).toHaveCount(0)
    await expect(page.getByRole('radio', { name: /Orc/ })).toBeChecked()
  })

  test('a worker that started and then failed says the simulation stopped, not that it couldn’t start (AR-1)', async ({ page }) => {
    // A runtime error in a worker that loaded fine: reloading wouldn't help, so no Reload button.
    await page.route('**/assets/sim.worker*.js', async (route) => {
      const response = await route.fetch()
      const body = `${await response.text()}\n;self.addEventListener('message', (e) => { if (e.data.type === 'plan') throw new Error('engine bug') })`
      return route.fulfill({ response, body })
    })
    await page.goto('./')
    const panel = results(page)
    await panel.getByRole('button', { name: 'Simulate' }).click()
    const alert = panel.getByRole('alert')
    await expect(alert).toContainText('The simulation stopped unexpectedly.')
    await expect(alert).toContainText('Try again.')
    await expect(alert.getByRole('button', { name: 'Reload page' })).toHaveCount(0)
  })

  test('says how many fights of what length, and how long the run took', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await expect(panel.getByText(/^[\d,]+ fights of 180 s · Forever rules · ran in (under 0\.1|\d+\.\d) s$/)).toBeVisible()
  })

  test('a result with no weapon says what to do and takes you to Gear', async ({ page }) => {
    await seed(page, { gear: {} }, 'fight')
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await expect(panel.getByText('No main-hand weapon')).toBeVisible()
    await expect(panel.getByText(/Add a weapon in Gear/)).toBeVisible()
    await panel.getByRole('button', { name: 'Open Gear' }).click()
    await expect(page.getByRole('tab', { name: 'Gear', exact: true })).toHaveAttribute('aria-selected', 'true')
    // The button goes once Gear is open beside it, so focus moves on to the weapon to add (RU6).
    await expect(page.getByRole('button', { name: 'Main hand: empty' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Main hand: empty' })).toBeInViewport()
  })
})

test.describe('the desktop results panel', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('never runs past the viewport: its details scroll inside it', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    for (const name of ['Cooldowns and buffs', 'Character sheet', /^Assumptions \(\d+\)$/]) {
      await panel.getByRole('button', { name }).click()
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    const details = panel.getByRole('region', { name: 'Result details' })
    const box = (await details.boundingBox())!
    expect(box.y + box.height, 'the details end inside the viewport').toBeLessThanOrEqual(800)
    expect(await details.evaluate((el) => el.scrollHeight > el.clientHeight), 'the details scroll').toBe(true)
    // While it overflows, the keyboard can reach it to scroll it.
    await expect(details).toHaveAttribute('tabindex', '0')

    await details.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    const last = details.getByRole('link').last()
    const lastBox = (await last.boundingBox())!
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(800)
    expect(await page.evaluate(() => window.scrollY), 'the page itself didn’t scroll').toBe(0)
    // Simulate stays in view above the details.
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeInViewport()
  })
})

test.describe('result details', () => {
  test('Character sheet names the Classic-based placeholders the Assumptions name (D24)', async ({ page }) => {
    // Arms with a one-hander and a shield: the sheet shows its defensive rows (it has block value),
    // but the boss never attacks it, so neither the sheet nor the Assumptions name its avoidance.
    await seed(page, { spec: 'warrior-arms', gear: { mainHand: { itemId: 11784 }, offHand: { itemId: 16998 } } })
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await panel.getByRole('button', { name: 'Character sheet' }).click()
    await expect(panel.getByRole('term').filter({ hasText: /^Parry$/ })).toBeVisible()
    await expect(panel.getByText('Classic-based values until they’re measured: base health.')).toBeVisible()
    await panel.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await expect(panel.getByText(/placeholders until they are: base health 1,689\.$/)).toBeVisible()
    await expect(panel.getByText(/base parry|base block/)).toHaveCount(0)
  })

  test('Cooldowns and buffs explains Enrage while you take no damage, under short column headers', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await panel.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    const table = panel.getByRole('table')
    await expect(table.getByRole('row', { name: /^Enrage Needs damage taken \(Fight → Advanced\) none none$/ })).toBeVisible()
    // A short visible header, with the full name for screen readers.
    const casts = table.getByRole('columnheader', { name: 'Casts per fight' })
    await expect(casts.locator('[aria-hidden="true"]')).toHaveText('Casts')
  })

  test('Enrage shows its uptime when you take damage', async ({ page }) => {
    await seed(page, { fight: { damageTakenPerSec: 100 } })
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await panel.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    await expect(panel.getByRole('table').getByRole('row', { name: /^Enrage \d+\.\d% none$/ })).toBeVisible()
  })

  test('assumptions are grouped, your own choices first, each linking to its doc section', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await panel.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    const headings = panel.getByRole('heading', { level: 4 })
    await expect(headings.first()).toHaveText('Your gear and consumables')
    const titles = await headings.allTextContents()
    const order = ['Your gear and consumables', 'Your race and stats', 'Warrior mechanics', 'Combat rules']
    expect(titles).toEqual(order.filter((t) => titles.includes(t)))
    const links = panel.getByRole('region', { name: 'Result details' }).getByRole('link')
    const count = await links.count()
    expect(count).toBeGreaterThan(5)
    for (let i = 0; i < count; i++) {
      await expect(links.nth(i)).toHaveAttribute('href', /^https:\/\/github\.com\/andersonjohnf\/forever_sim\/blob\/main\/docs\/[\w/-]+\.md(#[\w-]+)?$/)
      await expect(links.nth(i)).toHaveAttribute('target', '_blank')
    }
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a failed first run shows in the bar and opens the sheet with the reason', async ({ page }) => {
    // A hunter with no ranged weapon: the engine refuses it (ranged-and-pets.md §12).
    await seed(page, { spec: 'hunter-marksmanship', gear: {} })
    await page.goto('./')
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText('Failed')
    await expect(bar).toBeEnabled()
    await expect(status(page)).toContainText('Couldn’t simulate')
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expect(sheet.getByRole('alert')).toContainText('This setup can’t be simulated')
    await expect(sheet.getByRole('alert')).toContainText('Add a ranged weapon')
    // A setup the engine refuses says what to change; retrying wouldn't help.
    await expect(sheet.getByRole('alert')).not.toContainText('Try again')
  })

  test('workers that couldn’t start: the bar says Failed, and the sheet offers Reload page (AR-8)', async ({ page }) => {
    await page.route('**/assets/sim.worker*.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("no worker")' }))
    await page.goto('./')
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText('Failed')
    await expect(status(page)).toContainText('The simulation couldn’t start.')
    await bar.click()
    const reload = page.getByRole('dialog', { name: 'Results' }).getByRole('alert').getByRole('button', { name: 'Reload page' })
    await expect(reload).toBeVisible()
    expect((await reload.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('a failed re-run shows in the bar too, and the sheet keeps the last result', async ({ page }) => {
    await seed(page, { spec: 'hunter-marksmanship' })
    await page.goto('./')
    await simulate(page)
    // Empty the ranged slot: the engine refuses a hunter with nothing to shoot.
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await page.getByRole('tabpanel', { name: 'Gear' }).getByRole('button', { name: /^Ranged: / }).click({ position: { x: 24, y: 24 } })
    await page.getByRole('dialog', { name: 'Choose ranged' }).getByRole('button', { name: 'Leave this slot empty' }).click()
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText('Failed')
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expect(sheet.getByRole('alert')).toBeVisible()
    await expect(sheet.getByRole('group', { name: 'DPS' })).toContainText('Setup changed')
    await expect(sheet.getByRole('region', { name: 'Damage by ability' })).toBeVisible()
  })

  test('a re-run shows its progress in the bar', async ({ page }) => {
    // A full 100,000-fight run first: about 8 s on 16 cores, but on a 4-core CI runner it can take
    // over a minute, past the 30 s test timeout.
    test.setTimeout(180_000)
    await seed(page, { run: { mode: 'fixed', iterations: 100000, seed: 1 }, fight: { durationSec: 600 } })
    await page.goto('./')
    await simulate(page, 150_000)
    await page.getByRole('button', { name: 'Run again' }).click()
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/Simulating\s*\d+%/)
    await expect(bar).toContainText(/DPS/)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible()
  })

  test('cooldown names stay on one line beside short column headers', async ({ page }) => {
    await page.goto('./')
    await simulate(page)
    await page.getByRole('button', { name: 'Show results' }).click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await sheet.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    const holy = sheet.getByRole('rowheader', { name: 'Holy Strength (main hand)' })
    await expect(holy).toBeVisible()
    expect((await holy.boundingBox())!.height, 'one line').toBeLessThan(32)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})
