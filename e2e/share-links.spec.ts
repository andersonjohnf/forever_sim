import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Share links over the size caps in src/app/share.ts (docs/ux.md#persistence-and-sharing).

/** A share-link hash for any JSON, in the app's format: deflate-raw, base64url, after #s=. */
async function linkFor(page: Page, value: unknown): Promise<string> {
  return page.evaluate(async (v) => {
    const json = new TextEncoder().encode(JSON.stringify(v))
    const packed = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
    let binary = ''
    for (const b of packed) binary += String.fromCharCode(b)
    return '#s=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }, value)
}

async function open(page: Page, hash: string) {
  await page.goto(`./${hash}`)
  // A hash-only navigation keeps the page; reload so the app reads the link as it would from a click.
  await page.reload()
}

test.describe('oversized share links', () => {
  test('a link that inflates past the cap is refused, and a reload doesn’t try it again', async ({ page }) => {
    await page.goto('./')
    // About 4 MB of JSON that deflates to a few kilobytes.
    const hash = await linkFor(page, { version: 1, spec: 'warrior-arms', padding: ' '.repeat(4 * 1024 * 1024) })
    expect(hash.length).toBeLessThan(8 * 1024)
    await open(page, hash)
    await expect(page.getByText('That share link is broken')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')

    await page.reload()
    await expect(page.getByRole('button', { name: 'Head: Lionheart Helm' })).toBeVisible()
    await expect(page.getByText('That share link is broken')).toHaveCount(0)
  })

  test('a link over the length cap is refused', async ({ page }) => {
    await page.goto('./')
    await open(page, `#s=${'A'.repeat(9000)}`)
    await expect(page.getByText('That share link is broken')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
  })
})
