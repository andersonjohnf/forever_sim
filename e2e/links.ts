import { expect, type Page } from '@playwright/test'

/** A share-link hash for any JSON, in the app's format: deflate-raw, base64url, after #s=. */
export async function linkFor(page: Page, value: unknown): Promise<string> {
  return page.evaluate(async (v) => {
    const json = new TextEncoder().encode(JSON.stringify(v))
    const packed = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
    let binary = ''
    for (const b of packed) binary += String.fromCharCode(b)
    return '#s=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }, value)
}

/**
 * Opens a share link for `value` in a fresh document (so its notice is the only one) and returns
 * its "Loaded a shared setup" notice, once shown. The page must already be on the app.
 */
export async function openLinkNotice(page: Page, value: unknown) {
  const hash = await linkFor(page, value)
  await page.goto('about:blank')
  await page.goto('./' + hash)
  const notice = page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })
  await expect(notice).toBeVisible()
  return notice
}

/**
 * Pastes a share link for `value` into the open tab: only the hash changes, so the page loads it
 * on hashchange, and focus stays where it is.
 */
export async function pasteLink(page: Page, value: unknown) {
  const hash = await linkFor(page, value)
  await page.evaluate((hash) => (location.hash = hash), hash)
}
