import { readFileSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#setups (decision D21): Export copies a setup code for the current setup, or downloads
// a file of every saved setup and the current one. Import takes a code or a share link, which
// becomes the current setup with no prompt, or a file, whose setups join the saved list.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }
const CODE_FIELD = 'Setup code or share link'

const toast = (page: Page, text: string) => page.locator('[data-sonner-toast]').filter({ hasText: text })
const moreButton = (page: Page) => page.getByRole('button', { name: 'More' })
const setupsSheet = (page: Page) => page.getByRole('dialog', { name: 'Setups' })

async function openSetups(page: Page) {
  await moreButton(page).click()
  await page.getByRole('menuitem', { name: 'Setups…' }).click()
  const sheet = setupsSheet(page)
  await expect(sheet.getByRole('heading', { name: 'Setups', exact: true })).toBeFocused()
  return sheet
}

async function closeSetups(page: Page) {
  await page.keyboard.press('Escape')
  await expect(setupsSheet(page)).toBeHidden()
}

async function switchSpec(page: Page, name: 'Fury' | 'Arms') {
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: new RegExp(name) }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${name} Warrior`) })).toBeVisible()
}

async function chooseRace(page: Page, race: RegExp) {
  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await page.getByRole('radio', { name: race }).click()
}

async function expectSetup(page: Page, spec: 'Fury' | 'Arms', race: RegExp) {
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${spec} Warrior`) })).toBeVisible()
  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await expect(page.getByRole('radio', { name: race })).toHaveAttribute('aria-checked', 'true')
}

/**
 * Chooses a file in the picker that Open a file… opens: with a click, or with Enter when a notice
 * may be up, which on a phone sits over the end of the sheet, where the button is, until it goes
 * (docs/ux.md#persistence-and-sharing).
 */
async function openFile(sheet: Locator, file: string | { name: string; mimeType: string; buffer: Buffer }, how: 'click' | 'keyboard' = 'click') {
  const chooser = sheet.page().waitForEvent('filechooser')
  const button = sheet.getByRole('button', { name: 'Open a file…' })
  if (how === 'click') await button.click()
  else {
    await button.focus()
    await sheet.page().keyboard.press('Enter')
  }
  await (await chooser).setFiles(file)
}

/** Saved setups in the stored form, before the page loads. */
async function seed(page: Page, setups: unknown[]) {
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem('forever-sim:saved-setups', value)
    sessionStorage.setItem('seeded', '1')
  }, JSON.stringify({ version: 1, setups }))
}

const entry = (id: string, name: string, config: unknown, minutesAgo: number) => ({
  id,
  name,
  savedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  config,
})

const jsonFile = (value: unknown, name = 'setups.json') => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) })

for (const [label, device] of [
  ['phone', PHONE],
  ['desktop', DESKTOP],
] as const) {
  test.describe(`Setups export and import (${label})`, () => {
    test.use({ ...device, permissions: ['clipboard-read', 'clipboard-write'] })

    // Races are chosen before a notice comes up: on a phone, one sits over the lower races.
    test('a copied setup code, imported into a changed setup, brings that setup back, switching spec', async ({ page }) => {
      await page.goto('./')
      await switchSpec(page, 'Arms')
      await chooseRace(page, /Orc/)
      await switchSpec(page, 'Fury')
      await chooseRace(page, /Troll/)
      const sheet = await openSetups(page)
      await sheet.getByRole('button', { name: 'Copy setup code' }).click()
      await expect(toast(page, 'Setup code copied')).toBeVisible()
      // The code alone, as a share link carries it after #s=.
      const code = await page.evaluate(() => navigator.clipboard.readText())
      expect(code).toMatch(/^[A-Za-z0-9_-]{100,}$/)
      await expect(sheet).toBeVisible()
      await closeSetups(page)

      // Then on Arms, as an Orc, import it.
      await switchSpec(page, 'Arms')
      await openSetups(page)
      await sheet.getByRole('textbox', { name: CODE_FIELD }).fill(code)
      // Enter: on a phone, the notice about the copy is still over the Import button.
      await sheet.getByRole('textbox', { name: CODE_FIELD }).press('Enter')
      // No prompt: the sheet closes, and focus goes back to the menu's button.
      await expect(sheet).toBeHidden()
      await expect(moreButton(page)).toBeFocused()
      await expect(toast(page, 'Imported a setup')).toContainText('You’re on Fury Warrior now.')
      await expectSetup(page, 'Fury', /Troll/)
      // The Arms setup you were on is kept, as switching spec keeps it.
      await switchSpec(page, 'Arms')
      await expectSetup(page, 'Arms', /Orc/)
    })

    test('a share link works too, with text around it', async ({ page }) => {
      await page.goto('./')
      await switchSpec(page, 'Arms')
      await chooseRace(page, /Tauren/)
      await page.getByRole('button', { name: /Share/ }).click()
      await expect(toast(page, 'Link copied')).toBeVisible()
      const link = await page.evaluate(() => navigator.clipboard.readText())
      await switchSpec(page, 'Fury')

      const sheet = await openSetups(page)
      await sheet.getByRole('textbox', { name: CODE_FIELD }).fill(`My Arms setup: ${link} , have fun`)
      await sheet.getByRole('textbox', { name: CODE_FIELD }).press('Enter')
      await expect(sheet).toBeHidden()
      await expect(toast(page, 'Imported a setup')).toContainText('You’re on Arms Warrior now.')
      await expectSetup(page, 'Arms', /Tauren/)
    })

    test('a code that isn’t one says why under the field, and changes nothing', async ({ page }) => {
      await page.goto('./')
      const sheet = await openSetups(page)
      const field = sheet.getByRole('textbox', { name: CODE_FIELD })
      const importButton = sheet.getByRole('button', { name: 'Import', exact: true })

      await importButton.click()
      await expect(sheet.getByRole('alert')).toHaveText('Paste a setup code or a share link.')
      await expect(field).toBeFocused()

      await field.fill('not a code!')
      // Typing clears the last reason.
      await expect(sheet.getByRole('alert')).toHaveCount(0)
      await importButton.click()
      await expect(sheet.getByRole('alert')).toHaveText('That isn’t a setup code or a share link.')
      await expect(field).toHaveAttribute('aria-invalid', 'true')
      await expect(field).toHaveAccessibleDescription('That isn’t a setup code or a share link.')
      await expect(field).toBeFocused()

      await field.fill('#s=AAAA')
      await field.press('Enter')
      await expect(sheet.getByRole('alert')).toHaveText('That code is damaged or cut short. Copy the whole code again.')

      // No toast, and the sheet stays open on your own setup.
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
      await expect(sheet).toBeVisible()
      await closeSetups(page)
      await expectSetup(page, 'Fury', /Human/)
    })

    test('downloads every setup, and the file brings them back once the saves are gone', async ({ page }) => {
      await seed(page, [
        entry('beta', 'Beta', { version: 1, spec: 'warrior-arms', race: 'horde-orc' }, 5),
        entry('alpha', 'Alpha', { version: 1, spec: 'warrior-fury', race: 'horde-troll' }, 10),
      ])
      await page.goto('./')
      // The current setup is neither save.
      await switchSpec(page, 'Arms')
      await chooseRace(page, /Tauren/)
      const sheet = await openSetups(page)

      const downloading = page.waitForEvent('download')
      await sheet.getByRole('button', { name: 'Download all setups' }).click()
      const download = await downloading
      expect(download.suggestedFilename()).toMatch(/^forever-sim-setups-\d{4}-\d{2}-\d{2}\.json$/)
      const path = test.info().outputPath(download.suggestedFilename())
      await download.saveAs(path)
      const file = JSON.parse(readFileSync(path, 'utf8'))
      expect(file).toMatchObject({ app: 'forever-sim', version: 1, current: { spec: 'warrior-arms', race: 'horde-tauren' } })
      expect(Date.parse(file.exportedAt)).not.toBeNaN()
      expect(file.setups.map((s: { name: string }) => s.name)).toEqual(['Beta', 'Alpha'])
      await expect(toast(page, 'Setups downloaded')).toContainText(`${download.suggestedFilename()} holds the current setup and 2 saved setups.`)

      // Clear the saves, then open the file.
      await sheet.getByRole('button', { name: 'Delete Beta' }).click()
      await sheet.getByRole('button', { name: 'Delete Alpha' }).click()
      await expect(sheet.getByText('No saved setups yet')).toBeVisible()
      await openFile(sheet, path, 'keyboard')
      await expect(toast(page, 'Imported 3 setups')).toBeVisible()
      // The sheet stays open, with focus on the list, which shows them: the current setup, saved now, first.
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('heading', { name: 'Saved setups' })).toBeFocused()
      await expect(sheet.getByRole('listitem')).toHaveText([/^Imported · \d{1,2} [A-Z][a-z]{2}Arms Warrior/, /^BetaArms Warrior/, /^AlphaFury Warrior/])

      // The same file again adds nothing.
      await openFile(sheet, path, 'keyboard')
      await expect(toast(page, 'Nothing new to import')).toContainText('Every setup in that file is saved already.')
      await expect(sheet.getByRole('listitem')).toHaveCount(3)

      // And each loads as it was saved.
      await sheet.getByRole('button', { name: 'Load Alpha' }).click()
      await expectSetup(page, 'Fury', /Troll/)
    })

    test('a file that isn’t ours, or is from a newer version, says why under the button', async ({ page }) => {
      // Enough saves that the reason lands at the foot of the sheet, below what's showing.
      await seed(page, [
        entry('a', 'One', { version: 1, spec: 'warrior-fury' }, 1),
        entry('b', 'Two', { version: 1, spec: 'warrior-arms' }, 2),
        entry('c', 'Three', { version: 1, spec: 'warrior-fury' }, 3),
      ])
      await page.goto('./')
      const sheet = await openSetups(page)
      const button = sheet.getByRole('button', { name: 'Open a file…' })

      await openFile(sheet, jsonFile({ hello: 'world' }, 'notes.json'))
      const notOurs = 'That isn’t a Forever Sim setups file. Choose one that Download all setups saved.'
      await expect(sheet.getByRole('alert')).toHaveText(notOurs)
      await expect(button).toHaveAccessibleDescription(notOurs)
      await expect(sheet.getByRole('alert')).toBeInViewport()

      await openFile(sheet, jsonFile({ app: 'forever-sim', version: 2, setups: [] }))
      await expect(sheet.getByRole('alert')).toHaveText('That file is from a newer version of Forever Sim. Reload this page to update it, then try again.')
      await expect(sheet.getByRole('alert')).toBeInViewport()
      await expect(button).toBeFocused()

      await openFile(sheet, { name: 'photo.json', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) })
      await expect(sheet.getByRole('alert')).toHaveText(notOurs)

      // Nothing was added, and there's no toast.
      await expect(sheet.getByRole('listitem')).toHaveCount(3)
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    })

    test('works from the keyboard alone', async ({ page }) => {
      await page.goto('./')
      await chooseRace(page, /Troll/)
      await moreButton(page).focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      const sheet = setupsSheet(page)
      await expect(sheet.getByRole('heading', { name: 'Setups', exact: true })).toBeFocused()

      // Close, the name field and Save, then Export (the empty list has no controls).
      for (let i = 0; i < 4; i++) await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: 'Copy setup code' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(toast(page, 'Setup code copied')).toBeVisible()
      const code = await page.evaluate(() => navigator.clipboard.readText())

      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: 'Download all setups' })).toBeFocused()
      const downloading = page.waitForEvent('download')
      await page.keyboard.press('Enter')
      const download = await downloading
      const path = test.info().outputPath(download.suggestedFilename())
      await download.saveAs(path)

      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('textbox', { name: CODE_FIELD })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: 'Import', exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: 'Open a file…' })).toBeFocused()
      const chooser = page.waitForEvent('filechooser')
      await page.keyboard.press('Enter')
      await (await chooser).setFiles(path)
      await expect(toast(page, 'Imported 1 setup')).toBeVisible()
      await expect(sheet.getByRole('heading', { name: 'Saved setups' })).toBeFocused()
      // From the list, Tab reaches its first row.
      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: /^Load Imported · / })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(moreButton(page)).toBeFocused()

      // Change the setup (another spec), then import the code back.
      await switchSpec(page, 'Arms')
      await moreButton(page).focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await expect(sheet.getByRole('heading', { name: 'Setups', exact: true })).toBeFocused()
      await sheet.getByRole('textbox', { name: CODE_FIELD }).focus()
      await page.keyboard.insertText(code)
      await page.keyboard.press('Enter')
      await expect(sheet).toBeHidden()
      await expect(moreButton(page)).toBeFocused()
      await expect(toast(page, 'Imported a setup')).toContainText('You’re on Fury Warrior now.')
      await expectSetup(page, 'Fury', /Troll/)
    })
  })
}

test.describe('Copy setup code', () => {
  // Safari (iOS and macOS) only lets a page write to the clipboard during the tap itself, not
  // after an await, as for Share (shell-sharing.spec.ts). This clipboard refuses the same way.
  test('copies during the tap, as Safari requires', async ({ page }) => {
    await page.addInitScript(() => {
      const copied: Promise<string>[] = []
      const inTap = () => (window as unknown as { event?: Event }).event?.type === 'click'
      Object.defineProperty(window, 'copied', { value: copied })
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          write: (items: ClipboardItem[]) => {
            if (!inTap()) return Promise.reject(new DOMException('Not during a tap', 'NotAllowedError'))
            copied.push(items[0].getType('text/plain').then((blob) => blob.text()))
            return Promise.resolve()
          },
        },
      })
    })
    await page.goto('./')
    const sheet = await openSetups(page)
    await sheet.getByRole('button', { name: 'Copy setup code' }).click()
    await expect(toast(page, 'Setup code copied')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { copied: Promise<string>[] }).copied[0])).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('says so when the browser refuses the clipboard', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { write: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
      })
    })
    await page.goto('./')
    const sheet = await openSetups(page)
    await sheet.getByRole('button', { name: 'Copy setup code' }).click()
    await expect(toast(page, 'Couldn’t copy the setup code')).toContainText('Allow clipboard access for this site')
  })
})
