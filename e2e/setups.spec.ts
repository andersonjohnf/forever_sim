import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#setups (decision D21): Save keeps a named copy of the current setup, spec included;
// Load, Rename and Delete work from the list; nothing prompts before a Load. And the bulk changes
// with no visible notice are announced to screen readers (docs/ux.md#accessibility).

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }
const KEY = 'forever-sim:saved-setups'

const toast = (page: Page, text: string) => page.locator('[data-sonner-toast]').filter({ hasText: text })
const announcement = (page: Page) => page.locator('[data-announcer]')
const moreButton = (page: Page) => page.getByRole('button', { name: 'More' })

async function openSetups(page: Page) {
  await moreButton(page).click()
  await page.getByRole('menuitem', { name: 'Setups…' }).click()
  const sheet = page.getByRole('dialog', { name: 'Setups' })
  await expect(sheet).toBeVisible()
  return sheet
}

async function save(page: Page, name: string) {
  const sheet = page.getByRole('dialog', { name: 'Setups' })
  await sheet.getByRole('textbox', { name: 'Save the current setup as' }).fill(name)
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
}

async function switchSpec(page: Page, name: 'Fury' | 'Arms') {
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: new RegExp(name) }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${name} Warrior`) })).toBeVisible()
}

const raceRadio = (page: Page, race: RegExp) => page.getByRole('radio', { name: race })

async function chooseRace(page: Page, race: RegExp) {
  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await raceRadio(page, race).click()
}

/** Saved setups in the stored form, before the page loads. */
async function seed(page: Page, setups: unknown[]) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem('seeded')) localStorage.setItem(key, value)
      sessionStorage.setItem('seeded', '1')
    },
    { key: KEY, value: JSON.stringify({ version: 1, setups }) },
  )
}

const entry = (id: string, name: string, config: unknown, minutesAgo = 0) => ({
  id,
  name,
  savedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  config,
})

for (const [label, device] of [
  ['phone', PHONE],
  ['desktop', DESKTOP],
] as const) {
  test.describe(`Setups (${label})`, () => {
    test.use(device)

    test('with nothing saved, it says what Setups are, and the name starts as the spec and the day', async ({ page }) => {
      await page.goto('./')
      const sheet = await openSetups(page)
      // Focus goes to the title, so the sheet is read from the top.
      await expect(sheet.getByRole('heading', { name: 'Setups', exact: true })).toBeFocused()
      await expect(sheet.getByText('No saved setups yet')).toBeVisible()
      await expect(sheet.getByText(/Save the current setup to keep a copy/)).toBeVisible()
      await expect(sheet.getByRole('textbox', { name: 'Save the current setup as' })).toHaveValue(/^Fury Warrior · \d{1,2} [A-Z][a-z]{2}$/)
      await expect(sheet.getByRole('listitem')).toHaveCount(0)
    })

    test('saves a Fury setup, and loads it back from Arms, switching spec', async ({ page }) => {
      await page.goto('./')
      await chooseRace(page, /Troll/)
      const sheet = await openSetups(page)
      await save(page, '  Troll   fury ')
      await expect(toast(page, 'Saved “Troll fury”')).toBeVisible()
      const row = sheet.getByRole('listitem').filter({ hasText: 'Troll fury' })
      await expect(row).toContainText('Fury Warrior')
      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()

      await switchSpec(page, 'Arms')
      await openSetups(page)
      await sheet.getByRole('button', { name: 'Load Troll fury' }).click()
      // No prompt: the sheet closes, and focus goes back to the menu's button.
      await expect(sheet).toBeHidden()
      await expect(moreButton(page)).toBeFocused()
      const loaded = toast(page, 'Loaded “Troll fury”')
      await expect(loaded).toContainText('It replaced your Fury Warrior setup, and you’re on Fury now.')
      await expect(page.getByRole('button', { name: /^Spec: Fury Warrior/ })).toBeVisible()
      await page.getByRole('tab', { name: 'Character', exact: true }).click()
      await expect(raceRadio(page, /Troll/)).toHaveAttribute('aria-checked', 'true')
    })

    test('saving under a saved name updates that save, and the default name moves on', async ({ page }) => {
      await page.goto('./')
      const sheet = await openSetups(page)
      const field = sheet.getByRole('textbox', { name: 'Save the current setup as' })
      const today = await field.inputValue()
      await sheet.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(toast(page, `Saved “${today}”`)).toBeVisible()
      // The next default doesn't replace the last save.
      await expect(field).toHaveValue(`${today} (2)`)

      await save(page, today.toUpperCase())
      await expect(toast(page, `Updated “${today.toUpperCase()}”`)).toBeVisible()
      await expect(sheet.getByRole('listitem')).toHaveCount(1)
      await expect(sheet.getByRole('listitem')).toContainText(today.toUpperCase())
    })

    test('renames in place, and deletes at once with a notice, keeping focus in the list', async ({ page }) => {
      await page.goto('./')
      const sheet = await openSetups(page)
      for (const name of ['Alpha', 'Beta', 'Gamma']) {
        await save(page, name)
        await expect(sheet.getByRole('button', { name: `Load ${name}` })).toBeVisible()
      }
      // Newest first.
      await expect(sheet.getByRole('listitem')).toHaveText([/^Gamma/, /^Beta/, /^Alpha/])

      await sheet.getByRole('button', { name: 'Rename Beta' }).click()
      const field = sheet.getByRole('textbox', { name: 'New name for Beta' })
      await expect(field).toBeFocused()
      await expect(field).toHaveValue('Beta')
      await field.fill('gamma')
      await field.press('Enter')
      await expect(sheet.getByRole('alert')).toHaveText('Another saved setup has that name.')
      await expect(field).toHaveAccessibleDescription('Another saved setup has that name.')
      await field.fill('  ')
      await sheet.getByRole('button', { name: 'Rename', exact: true }).click()
      await expect(sheet.getByRole('alert')).toHaveText('Enter a name.')
      await field.fill('Bravo')
      await field.press('Enter')
      await expect(sheet.getByRole('listitem')).toHaveText([/^Gamma/, /^Bravo/, /^Alpha/])
      await expect(sheet.getByRole('button', { name: 'Rename Bravo' })).toBeFocused()
      // No visible notice: the name changes in front of you. Screen readers hear it.
      await expect(announcement(page)).toHaveText('Renamed to Bravo.')

      // Escape cancels a rename, and leaves the sheet open.
      await sheet.getByRole('button', { name: 'Rename Bravo' }).click()
      await sheet.getByRole('textbox', { name: 'New name for Bravo' }).fill('Nope')
      await page.keyboard.press('Escape')
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Rename Bravo' })).toBeFocused()

      // Delete moves focus to the next row's Delete, or the one before at the end, then the name field.
      await sheet.getByRole('button', { name: 'Delete Gamma' }).click()
      await expect(toast(page, 'Deleted “Gamma”')).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Delete Bravo' })).toBeFocused()
      await sheet.getByRole('button', { name: 'Delete Alpha' }).click()
      await expect(toast(page, 'Deleted “Alpha”')).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Delete Bravo' })).toBeFocused()
      await sheet.getByRole('button', { name: 'Delete Bravo' }).click()
      await expect(sheet.getByRole('textbox', { name: 'Save the current setup as' })).toBeFocused()
      await expect(sheet.getByText('No saved setups yet')).toBeVisible()
      expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY)).toEqual({ version: 1, setups: [] })
    })

    test('works from the keyboard alone', async ({ page }) => {
      await page.goto('./')
      await moreButton(page).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('menuitem', { name: 'Setups…' })).toBeFocused()
      await page.keyboard.press('Enter')
      const sheet = page.getByRole('dialog', { name: 'Setups' })
      await expect(sheet.getByRole('heading', { name: 'Setups', exact: true })).toBeFocused()

      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused()
      await page.keyboard.press('Tab')
      // The default name is selected, so typing replaces it.
      await expect(sheet.getByRole('textbox', { name: 'Save the current setup as' })).toBeFocused()
      await page.keyboard.type('Keys')
      await page.keyboard.press('Enter')
      await expect(toast(page, 'Saved “Keys”')).toBeVisible()

      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: 'Load Keys' })).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Enter')
      await expect(sheet.getByRole('textbox', { name: 'New name for Keys' })).toBeFocused()
      await page.keyboard.type('Keyboard')
      await page.keyboard.press('Enter')
      await expect(sheet.getByRole('button', { name: 'Rename Keyboard' })).toBeFocused()

      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Enter')
      await expect(sheet).toBeHidden()
      await expect(toast(page, 'Loaded “Keyboard”')).toBeVisible()
      await expect(moreButton(page)).toBeFocused()

      // Escape closes it, and focus goes back to the menu's button.
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await expect(sheet.getByRole('heading', { name: 'Setups', exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()
      await expect(moreButton(page)).toBeFocused()
    })

    test('a saved setup that’s out of date loads normalized, and says so', async ({ page }) => {
      await seed(page, [
        entry('old', 'Old arms', { version: 1, spec: 'warrior-arms', race: 'horde-orc', rotation: { aSettingThatWasRemoved: true } }),
        { id: 'broken', name: 'Broken' },
      ])
      await page.goto('./')
      const sheet = await openSetups(page)
      await expect(toast(page, 'One saved setup couldn’t be read')).toBeVisible()
      await expect(sheet.getByRole('listitem')).toHaveCount(1)
      await sheet.getByRole('button', { name: 'Load Old arms' }).click()
      await expect(toast(page, 'Loaded “Old arms”')).toContainText('It replaced your Arms Warrior setup, and you’re on Arms now. One part was out of date and is back to its default.')
      await page.getByRole('tab', { name: 'Character', exact: true }).click()
      await expect(raceRadio(page, /Orc/)).toHaveAttribute('aria-checked', 'true')
    })

    test('a long name wraps to two lines at most, without scrolling sideways', async ({ page }) => {
      const long = 'Unbrokenlongnamewithoutanyspacesatallthatgoesonforsixtychars'
      await seed(page, [
        entry('a', long, { version: 1, spec: 'warrior-fury' }),
        entry('b', 'A very long setup name that goes all the way to sixty chars', { version: 1, spec: 'warrior-arms' }, 5),
      ])
      await page.goto('./')
      const sheet = await openSetups(page)
      await expect(sheet.getByRole('button', { name: `Load ${long}` })).toBeVisible()
      expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
      // Two lines at most; past that it ends in an ellipsis (on a phone, 60 characters fit in two).
      for (const name of [long, 'A very long setup name that goes all the way to sixty chars']) {
        const lines = await sheet.getByText(name).evaluate((el) => el.clientHeight / parseFloat(getComputedStyle(el).lineHeight))
        expect(lines).toBeLessThanOrEqual(2)
      }
    })

    test('says so when the browser’s storage is full or blocked', async ({ page }) => {
      await page.addInitScript((key) => {
        const setItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (k: string, v: string) {
          if (k === key) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
          return setItem.call(this, k, v)
        }
      }, KEY)
      await page.goto('./')
      const sheet = await openSetups(page)
      await save(page, 'Too much')
      await expect(toast(page, 'Couldn’t save the setup')).toContainText('storage for this site is full')
      await expect(sheet.getByText('No saved setups yet')).toBeVisible()
    })

    test('says so when the browser blocks storage', async ({ page }) => {
      await page.addInitScript((key) => {
        const getItem = Storage.prototype.getItem
        Storage.prototype.getItem = function (k: string) {
          if (k === key) throw new DOMException('The operation is insecure.', 'SecurityError')
          return getItem.call(this, k)
        }
      }, KEY)
      await page.goto('./')
      const sheet = await openSetups(page)
      await expect(sheet.getByText('Saved setups aren’t available')).toBeVisible()
      await save(page, 'Blocked')
      await expect(toast(page, 'Couldn’t save the setup')).toContainText('blocking storage for this site')
    })
  })

  test.describe(`Announcements (${label})`, () => {
    test.use(device)

    test('bulk changes with no visible notice are read out', async ({ page }) => {
      await page.goto('./')
      const said = announcement(page)
      await expect(said).toHaveAttribute('aria-live', 'polite')

      await page.getByRole('tab', { name: 'Gear', exact: true }).click()
      await page.getByRole('button', { name: 'Gear options' }).click()
      await page.getByRole('menuitem', { name: 'Remove all gear' }).click()
      await expect(said).toHaveText('Removed all gear.')
      await page.getByRole('button', { name: 'Gear options' }).click()
      await page.getByRole('menuitem', { name: 'Equip pre-raid best in slot' }).click()
      await expect(said).toHaveText('Equipped Fury Warrior pre-raid best in slot.')

      await page.getByRole('tab', { name: 'Talents', exact: true }).click()
      await page.getByRole('button', { name: 'Clear' }).click()
      await expect(said).toHaveText('Cleared all talent points.')
      await page.getByRole('combobox', { name: 'Talent build presets' }).click()
      await page.getByRole('option', { name: 'Fury + Precision' }).click()
      await expect(said).toHaveText('Talents set to Fury + Precision: 15 Arms, 36 Fury, 0 Protection.')
      await page.getByRole('button', { name: /Paste/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Paste a build code' })
      await dialog.getByRole('textbox', { name: 'Build code or link' }).fill('30305213132515201-05050103-')
      await dialog.getByRole('button', { name: 'Use this build' }).click()
      await expect(said).toHaveText('Pasted a talent build: 37 Arms, 14 Fury, 0 Protection.')

      await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
      await page.getByRole('switch', { name: 'Slam', exact: true }).click()
      await page.getByRole('button', { name: 'Reset rotation' }).click()
      await expect(said).toHaveText('Rotation settings reset to their defaults.')
    })
  })
}
