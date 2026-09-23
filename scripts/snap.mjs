// Quick visual check of the production build in headless Chromium.
//
// Serves dist/ under the GitHub Pages base path, opens a page, prints console errors and
// warnings, page errors and failed requests, and saves a full-page screenshot. Exits 1 if
// anything went wrong.
//
//   npm run snap                                   # build, then snap the landing page
//   npm run snap -- --dark --width 390             # dark mode at phone width
//   node scripts/snap.mjs --click Talents --out .cache/snaps/talents.png   # reuse dist/, open a tab first
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { preview } from 'vite'

const { values: args } = parseArgs({
  options: {
    path: { type: 'string', default: '' },
    out: { type: 'string', default: '.cache/snaps/snap.png' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '900' },
    dark: { type: 'boolean', default: false },
    /** Accessible names of tabs, buttons or menu items to click, in order, before the screenshot. */
    click: { type: 'string', multiple: true, default: [] },
  },
})

const server = await preview({ preview: { port: 0 }, logLevel: 'silent' })
const { port } = server.httpServer.address()
const url = new URL(args.path, `http://localhost:${port}${server.config.base}`).href

const browser = await chromium.launch()
const problems = []
try {
  // Phone widths get a touch device, so touch-only UI (e.g. talent popovers) is what you see.
  const phone = Number(args.width) < 640
  const page = await browser.newPage({
    viewport: { width: Number(args.width), height: Number(args.height) },
    colorScheme: args.dark ? 'dark' : 'light',
    isMobile: phone,
    hasTouch: phone,
  })
  if (phone) {
    // Headless Chromium's mobile emulation still reports a hover-capable fine pointer and
    // can't emulate those media features, so answer those queries the way a phone does.
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = (query) => {
        const result = original(query)
        if (!/\b(any-)?(hover|pointer)\b/.test(query)) return result
        const matches = /hover:\s*none|pointer:\s*coarse/.test(query) && !/hover:\s*hover|pointer:\s*fine/.test(query)
        // A static list: phones don't switch input types mid-session.
        return {
          matches,
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent: () => false,
        }
      }
    })
  }
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console.${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()} ${res.url()}`)
  })

  await page.goto(url, { waitUntil: 'networkidle' })
  for (const name of args.click) {
    await page
      .getByRole('tab', { name, exact: true })
      .or(page.getByRole('button', { name, exact: true }))
      .or(page.getByRole('menuitem', { name, exact: true }))
      .first()
      .click()
    await page.waitForLoadState('networkidle')
  }
  // Full-page screenshots don't scroll, so lazy images below the fold would never load. Load
  // them all, wait for them, then let CSS transitions (150 ms) settle.
  await page.evaluate(async () => {
    const images = [...document.images]
    for (const img of images) img.loading = 'eager'
    await Promise.race([
      Promise.all(
        images
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((done) => {
                img.addEventListener('load', done, { once: true })
                img.addEventListener('error', done, { once: true })
              }),
          ),
      ),
      new Promise((done) => setTimeout(done, 5000)),
    ])
  })
  await page.waitForTimeout(400)
  mkdirSync(dirname(args.out), { recursive: true })
  await page.screenshot({ path: args.out, fullPage: true })

  console.log(`${url}\n  title: ${await page.title()}\n  screenshot: ${args.out}`)
  console.log(problems.length ? `  problems:\n${problems.map((p) => `    ${p}`).join('\n')}` : '  problems: none')
} finally {
  await browser.close()
  await server.close()
}
process.exitCode = problems.length ? 1 : 0
