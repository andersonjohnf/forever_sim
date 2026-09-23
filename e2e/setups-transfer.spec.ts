import { readFileSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { linkFor } from './links.ts'

/** A setup code for any JSON: a share link's part after #s=. */
const codeFor = async (page: Page, value: unknown) => (await linkFor(page, value)).slice('#s='.length)

// docs/ux.md#setups (decision D21): Export copies a setup code for the current setup, or downloads
// a file of every saved setup and the current one. Import takes a code or a share link, which
// becomes the current setup with no prompt, or a file, whose setups join the saved list.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }
const CODE_FIELD = 'Setup code or share link'
const FILE_BUTTON = 'Add setups from a file…'

const toast = (page: Page, text: string) => page.locator('[data-sonner-toast]').filter({ hasText: text })
/** The line under Export's buttons that says what Copy or Download did (a live region, not a notice). */
const exportStatus = (sheet: Locator) => sheet.getByRole('region', { name: 'Export' }).getByRole('status')

/** Deletes a save from its row: Delete, then Delete again in the row's question. */
async function deleteSave(sheet: Locator, name: string) {
  await sheet.getByRole('button', { name: `Delete ${name}` }).click()
  await sheet.getByRole('group', { name: `Delete “${name}”?` }).getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(sheet.getByRole('button', { name: `Load ${name}` })).toHaveCount(0)
}
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
 * Chooses a file in the picker that Add setups from a file… opens: with a click, or with Enter
 * when a notice may be up (another file's), which on a phone sits over the end of the sheet, where
 * the button is, until it goes (docs/ux.md#persistence-and-sharing).
 */
async function openFile(sheet: Locator, file: string | { name: string; mimeType: string; buffer: Buffer }, how: 'click' | 'keyboard' = 'click') {
  const chooser = sheet.page().waitForEvent('filechooser')
  const button = sheet.getByRole('button', { name: FILE_BUTTON })
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
      // UX7: said in a line under the buttons, not in a notice over the end of the sheet.
      await expect(exportStatus(sheet)).toHaveText('Copied the setup code. Import it in any browser to get this exact setup.')
      await expect(toast(page, 'copied')).toHaveCount(0)
      // The code alone, as a share link carries it after #s=.
      const code = await page.evaluate(() => navigator.clipboard.readText())
      expect(code).toMatch(/^[A-Za-z0-9_-]{100,}$/)
      await expect(sheet).toBeVisible()
      await closeSetups(page)

      // Then on Arms, as an Orc, import it.
      await switchSpec(page, 'Arms')
      await openSetups(page)
      await sheet.getByRole('textbox', { name: CODE_FIELD }).fill(code)
      // Enter: on a phone, the race's notice (its gear swap) may still be over the Import button.
      await sheet.getByRole('textbox', { name: CODE_FIELD }).press('Enter')
      // No prompt: the sheet closes, and focus goes back to the menu's button.
      await expect(sheet).toBeHidden()
      await expect(moreButton(page)).toBeFocused()
      await expect(toast(page, 'Imported a setup')).toContainText('It replaced your Fury Warrior setup, and you’re on Fury now.')
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
      await expect(toast(page, 'Imported a setup')).toContainText('It replaced your Arms Warrior setup, and you’re on Arms now.')
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

      // UX4: a word is text, not a code cut short; a talent build goes in Talents.
      await field.fill('hello world')
      await field.press('Enter')
      await expect(sheet.getByRole('alert')).toHaveText('That isn’t a setup code or a share link.')
      await field.fill('30305213132515201-05050103-')
      await field.press('Enter')
      await expect(sheet.getByRole('alert')).toHaveText('That’s a talent build code. Paste it in the Talents tab instead.')

      // LX1: a code that isn't a usable setup is refused, rather than replacing yours with defaults.
      await field.fill(await codeFor(page, { version: 2, spec: 'warrior-arms', race: 'horde-orc' }))
      await field.press('Enter')
      await expect(sheet.getByRole('alert')).toHaveText('That code is from a newer version of Forever Sim. Reload this page to update it, then try again.')
      await field.fill(await codeFor(page, { version: 1, spec: 'mage-fire', race: 'horde-orc', talents: '' }))
      await field.press('Enter')
      await expect(sheet.getByRole('alert')).toHaveText('That code is for a spec this sim doesn’t know.')
      await field.fill(`#s=${await codeFor(page, {})}`)
      await field.press('Enter')
      await expect(sheet.getByRole('alert')).toHaveText('That code doesn’t hold a setup.')

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
      // UX7: said under the buttons, not in a notice.
      await expect(exportStatus(sheet)).toHaveText(`Downloaded ${download.suggestedFilename()}. It holds the current setup and 2 saved setups.`)
      await expect(toast(page, 'Downloaded')).toHaveCount(0)

      // Clear the saves, then add them back from the file.
      await deleteSave(sheet, 'Beta')
      await deleteSave(sheet, 'Alpha')
      await expect(sheet.getByText('No saved setups yet')).toBeVisible()
      await openFile(sheet, path, 'keyboard')
      await expect(toast(page, 'Imported 3 setups')).toBeVisible()
      // The sheet stays open, with focus on the list, which shows them: the current setup, saved now,
      // first. UX9: each is marked New, until the sheet closes.
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('heading', { name: 'Saved setups' })).toBeFocused()
      await expect(sheet.getByRole('listitem')).toHaveText([
        /^Imported · \d{1,2} [A-Z][a-z]{2}NewArms Warrior/,
        /^BetaNewArms Warrior/,
        /^AlphaNewFury Warrior/,
      ])

      // The same file again adds nothing.
      await openFile(sheet, path, 'keyboard')
      await expect(toast(page, 'Nothing new to import')).toContainText('Every setup in that file is saved already.')
      await expect(sheet.getByRole('listitem')).toHaveCount(3)
      await closeSetups(page)
      await openSetups(page)
      await expect(sheet.getByRole('listitem')).toHaveText([/^Imported · .*Arms Warrior/, /^BetaArms Warrior/, /^AlphaFury Warrior/])

      // And each loads as it was saved.
      await sheet.getByRole('button', { name: 'Load Alpha' }).click()
      await expectSetup(page, 'Fury', /Troll/)
    })

    // VF9: Download counted saves the list doesn't show, so its line said 4 where the list showed 2.
    test('download’s line counts the saves the list doesn’t show apart', async ({ page }) => {
      await seed(page, [
        entry('beta', 'Beta', { version: 1, spec: 'warrior-arms' }, 5),
        entry('alpha', 'Alpha', { version: 1, spec: 'warrior-fury' }, 10),
        // For a spec the sim doesn't offer yet, and one that can't be read (no name).
        entry('bear', 'Bear', { version: 1, spec: 'druid-feral-bear' }, 15),
        { id: 'broken', savedAt: new Date().toISOString(), config: { version: 1, spec: 'warrior-fury' } },
      ])
      await page.goto('./')
      const sheet = await openSetups(page)
      await expect(sheet.getByRole('listitem')).toHaveCount(2)
      const downloading = page.waitForEvent('download')
      await sheet.getByRole('button', { name: 'Download all setups' }).click()
      const download = await downloading
      await expect(exportStatus(sheet)).toHaveText(`Downloaded ${download.suggestedFilename()}. It holds the current setup and 4 saved setups (2 not shown here).`)
      const file = JSON.parse(readFileSync(await download.path(), 'utf8'))
      expect(file.setups).toHaveLength(4)
    })

    // VF7: the rows a file added sorted by their own dates, so older ones landed below the fold,
    // away from the list's heading, where focus goes. VF10: `"current": null` counted as a setup
    // that couldn't be read.
    test('a file’s setups come first in the list, marked New, under the heading focus goes to', async ({ page }) => {
      await seed(
        page,
        ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'].map((name, i) => entry(name.toLowerCase(), name, { version: 1, spec: 'warrior-fury' }, i)),
      )
      await page.goto('./')
      const sheet = await openSetups(page)
      const lastYear = (days: number) => new Date(Date.now() - (365 + days) * 86_400_000).toISOString()
      await openFile(
        sheet,
        jsonFile({
          app: 'forever-sim',
          version: 1,
          exportedAt: lastYear(0),
          current: null,
          setups: [
            { id: 'old-arms', name: 'Old Arms', savedAt: lastYear(1), config: { version: 1, spec: 'warrior-arms' } },
            { id: 'old-fury', name: 'Old Fury', savedAt: lastYear(2), config: { version: 1, spec: 'warrior-fury', race: 'horde-orc' } },
          ],
        }),
      )
      const notice = toast(page, 'Imported 2 setups')
      await expect(notice).toBeVisible()
      await expect(notice).not.toContainText('couldn’t be read')
      const heading = sheet.getByRole('heading', { name: 'Saved setups' })
      await expect(heading).toBeFocused()
      await expect(heading).toHaveAccessibleDescription('The 2 setups you just imported come first, marked New.')
      const rows = sheet.getByRole('listitem')
      await expect(rows).toHaveCount(10)
      await expect(rows.nth(0)).toHaveText(/^Old ArmsNewArms Warrior/)
      await expect(rows.nth(1)).toHaveText(/^Old FuryNewFury Warrior/)
      await expect(rows.nth(2)).toHaveText(/^OneFury Warrior/)
      await expect(rows.nth(0)).toBeInViewport({ ratio: 1 })
      // Until the sheet closes: then the list is newest first again, with nothing marked.
      await closeSetups(page)
      await openSetups(page)
      await expect(rows.nth(0)).toHaveText(/^OneFury Warrior/)
      await expect(rows.last()).toHaveText(/^Old FuryFury Warrior/)
      await expect(sheet.getByText('you just imported')).toHaveCount(0)
    })

    // LX2: a save renamed on the way in ("Raid night (2)") came in again with each import of the file.
    test('a file whose save took a number on the way in adds nothing the second time', async ({ page }) => {
      await seed(page, [entry('mine', 'Raid night', { version: 1, spec: 'warrior-fury' }, 5)])
      await page.goto('./')
      const sheet = await openSetups(page)
      const file = jsonFile({
        app: 'forever-sim',
        version: 1,
        exportedAt: new Date().toISOString(),
        setups: [entry('theirs', 'Raid night', { version: 1, spec: 'warrior-arms' }, 60)],
      })
      await openFile(sheet, file)
      await expect(toast(page, 'Imported 1 setup')).toBeVisible()
      // The file's save comes first while the sheet is open, though it's older.
      await expect(sheet.getByRole('listitem')).toHaveText([/^Raid night \(2\)NewArms Warrior/, /^Raid nightFury Warrior/])
      await openFile(sheet, file, 'keyboard')
      await expect(toast(page, 'Nothing new to import')).toBeVisible()
      await expect(sheet.getByRole('listitem')).toHaveCount(2)
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
      const button = sheet.getByRole('button', { name: FILE_BUTTON })

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

      // UX4: one of ours, cut short, is damaged, not someone else's.
      const whole = JSON.stringify({ app: 'forever-sim', version: 1, exportedAt: new Date().toISOString(), setups: [entry('x', 'Cut', { version: 1, spec: 'warrior-fury' }, 1)] })
      await openFile(sheet, { name: 'setups.json', mimeType: 'application/json', buffer: Buffer.from(whole.slice(0, whole.length / 2)) })
      await expect(sheet.getByRole('alert')).toHaveText('That setups file is damaged, so nothing was imported.')

      // LX5: a setup nested far deeper than any real one is left out, and the import doesn't crash.
      const deep = `${'['.repeat(5000)}0${']'.repeat(5000)}`
      const deepFile = `{"app":"forever-sim","version":1,"setups":[{"id":"d","name":"Deep","savedAt":"${new Date().toISOString()}","config":{"version":1,"spec":"warrior-fury","x":${deep}}}]}`
      await openFile(sheet, { name: 'deep.json', mimeType: 'application/json', buffer: Buffer.from(deepFile) })
      await expect(sheet.getByRole('alert')).toHaveText('None of the setups in that file could be read, so nothing was imported.')

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
      await expect(exportStatus(sheet)).toHaveText(/^Copied the setup code\./)
      const code = await page.evaluate(() => navigator.clipboard.readText())

      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: 'Download all setups' })).toBeFocused()
      const downloading = page.waitForEvent('download')
      await page.keyboard.press('Enter')
      const download = await downloading
      const path = test.info().outputPath(download.suggestedFilename())
      await download.saveAs(path)
      await expect(exportStatus(sheet)).toHaveText(/^Downloaded forever-sim-setups-.*\. It holds the current setup\.$/)

      // The line isn't a tab stop.
      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('textbox', { name: CODE_FIELD })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: 'Import', exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(sheet.getByRole('button', { name: FILE_BUTTON })).toBeFocused()
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
      await expect(toast(page, 'Imported a setup')).toContainText('It replaced your Fury Warrior setup, and you’re on Fury now.')
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
    await expect(exportStatus(sheet)).toHaveText(/^Copied the setup code\./)
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
    // In the line under the buttons, as a copy that works is.
    await expect(exportStatus(sheet)).toHaveText(
      'Couldn’t copy the setup code: your browser blocked the clipboard. Allow clipboard access for this site, then try again.',
    )
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    // Saying it again is a new line, so it's read out again.
    const line = exportStatus(sheet).locator('span')
    const first = await line.elementHandle()
    await sheet.getByRole('button', { name: 'Copy setup code' }).click()
    await expect.poll(async () => (await line.elementHandle())?.evaluate((el, old) => el !== old, first)).toBe(true)
  })
})
