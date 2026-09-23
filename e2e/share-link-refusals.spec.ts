import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { linkFor, pasteLink } from './links.ts'

// docs/ux.md#persistence-and-sharing (LX1): a link that isn't a setup the app can load is refused
// with a notice saying why, and your setup is left as it was. Before, normalizing turned such a
// link into a default setup that replaced yours, and a link of `null` did nothing at all.

const notice = (page: Page, title: string) => page.locator('[data-sonner-toast]').filter({ hasText: title })

async function expectUnchanged(page: Page) {
  await expect(page.getByRole('button', { name: /^Spec: Fury Warrior/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await expect(page.getByRole('radio', { name: /Gnome/ })).toHaveAttribute('aria-checked', 'true')
}

const REFUSED: [string, unknown, string, RegExp][] = [
  ['null', null, 'That share link is broken', /It doesn’t hold a setup, so your own setup is unchanged\./],
  ['a number', 42, 'That share link is broken', /It doesn’t hold a setup, so your own setup is unchanged\./],
  ['a list', [], 'That share link is broken', /It doesn’t hold a setup, so your own setup is unchanged\./],
  ['an empty object', {}, 'That share link is broken', /It doesn’t hold a setup, so your own setup is unchanged\./],
  [
    'a newer version',
    { version: 2, spec: 'warrior-arms', race: 'horde-orc' },
    'That link is from a newer version of Forever Sim',
    /Reload this page to update it, then open the link again\. Your own setup is unchanged\./,
  ],
  ['an unknown spec', { version: 1, spec: 'mage-fire' }, 'That link is for a spec this sim doesn’t know', /your own setup is unchanged\./],
]

test.describe('share links that aren’t a usable setup', () => {
  for (const [what, value, title, description] of REFUSED) {
    test(`${what}, pasted into an open tab, is refused and changes nothing`, async ({ page }) => {
      await page.goto('./')
      await page.getByRole('tab', { name: 'Character', exact: true }).click()
      await page.getByRole('radio', { name: /Gnome/ }).click()
      await pasteLink(page, value)
      await expect(notice(page, title)).toContainText(description)
      await expect(notice(page, 'Loaded a shared setup')).toHaveCount(0)
      expect(new URL(page.url()).hash).toBe('')
      await expectUnchanged(page)
    })
  }

  test('a link of null, opened afresh, says so too', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Gnome/ }).click()
    const hash = await linkFor(page, null)
    await page.goto('about:blank')
    await page.goto(`./${hash}`)
    await expect(notice(page, 'That share link is broken')).toContainText('It doesn’t hold a setup')
    await expectUnchanged(page)
  })
})
