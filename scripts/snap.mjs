// Quick visual check of the production build in headless Chromium.
//
// Builds into its own folder, .cache/snap-dist (with --build, which `npm run snap` passes),
// serves it under the GitHub Pages base path, opens a page, prints console errors and
// warnings, page errors and failed requests, and saves a full-page screenshot. Exits 1 if
// anything went wrong. It never touches dist/, which `npm run test:e2e` builds and serves, so
// the two can run at once.
//
//   npm run snap                                   # build, then snap the landing page
//   npm run snap -- --dark --width 390             # dark mode at phone width
//   node scripts/snap.mjs --click Talents --out .cache/snaps/talents.png   # reuse the snap build, open a tab first
//   node scripts/snap.mjs --click Simulate --out .cache/snaps/result.png   # waits for the run to finish
//   node scripts/snap.mjs --width 390 --click Simulate --click "Show results"   # phone: open the results sheet
//   node scripts/snap.mjs --width 390 --click Simulate --click "Show results" --click "Cooldowns and buffs" --scroll "Cooldowns and buffs"
//                                                  # …and scroll the sheet to a section it opened
//
// Seeding and filling in, for states a fresh page doesn't reach (the Setups sheet's list, say):
//   --storage seed.json    sets localStorage before the app loads, from a JSON object of keys:
//                          a string value is stored as it is, anything else as JSON, e.g.
//                          { "forever-sim:saved-setups": { "version": 1, "setups": [ … ] } }
//   --fill "Label=text"    types text into the field with that accessible name, in turn with --click
//   --upload file.json     the file for the file picker that a --click opens
//   --viewport             screenshot the viewport alone, as it shows an open sheet, not the whole page
//   node scripts/snap.mjs --viewport --storage seed.json --click More --click "Setups…" --fill "Setup code or share link=junk" --click Import
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { build, preview } from 'vite'

/** The snap build's own folder: never dist/, which the e2e run builds and serves. */
const OUT_DIR = '.cache/snap-dist'

const { values: args, tokens } = parseArgs({
  tokens: true,
  options: {
    /** Build the app into OUT_DIR first (`npm run snap` passes it); without it, reuse the last snap build. */
    build: { type: 'boolean', default: false },
    path: { type: 'string', default: '' },
    out: { type: 'string', default: '.cache/snaps/snap.png' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '900' },
    dark: { type: 'boolean', default: false },
    /** Screenshot the viewport alone, as it shows an open sheet, rather than the whole page. */
    viewport: { type: 'boolean', default: false },
    /** Accessible names of tabs, buttons or menu items to click, in order, before the screenshot. Simulate waits for the result. */
    click: { type: 'string', multiple: true, default: [] },
    /** Accessible name of a tab, button, menu item or heading to scroll to the top of its scroller before the screenshot (inside a sheet). */
    scroll: { type: 'string' },
    /** A JSON file of localStorage keys and values, set before the app loads. */
    storage: { type: 'string' },
    /** "Label=text": types text into the field with that accessible name, in turn with the clicks. */
    fill: { type: 'string', multiple: true, default: [] },
    /** A file for the file picker a click opens. */
    upload: { type: 'string' },
  },
})

/** The clicks and fills, in the order given. */
const steps = tokens.filter((t) => t.kind === 'option' && (t.name === 'click' || t.name === 'fill')).map((t) => ({ kind: t.name, value: t.value }))

/** localStorage to set before the app loads: string values as they are, others as JSON. */
const storage = args.storage
  ? Object.entries(JSON.parse(readFileSync(args.storage, 'utf8'))).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])
  : []

if (args.build) await build({ build: { outDir: OUT_DIR, emptyOutDir: true }, logLevel: 'warn' })
else if (!existsSync(`${OUT_DIR}/index.html`)) throw new Error(`No snap build in ${OUT_DIR}: run npm run snap, or pass --build`)
const server = await preview({ build: { outDir: OUT_DIR }, preview: { port: 0 }, logLevel: 'silent' })
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
  if (storage.length) {
    await page.addInitScript((entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value)
    }, storage)
  }
  if (args.upload) page.on('filechooser', (chooser) => chooser.setFiles(args.upload))
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console.${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()} ${res.url()}`)
  })

  await page.goto(url, { waitUntil: 'networkidle' })
  const control = (name) =>
    page
      .getByRole('tab', { name, exact: true })
      .or(page.getByRole('button', { name, exact: true }))
      .or(page.getByRole('menuitem', { name, exact: true }))
      .first()
  for (const step of steps) {
    if (step.kind === 'fill') {
      const at = step.value.indexOf('=')
      if (at < 0) throw new Error(`--fill needs "Label=text", not "${step.value}"`)
      await page.getByRole('textbox', { name: step.value.slice(0, at), exact: true }).fill(step.value.slice(at + 1))
      continue
    }
    const name = step.value
    await control(name).click()
    await page.waitForLoadState('networkidle')
    // A run finishes when its button reads "Run again" again (the results panel or phone bar).
    if (name === 'Simulate' || name === 'Run again') {
      await page.getByRole('button', { name: 'Run again', exact: true }).first().waitFor({ state: 'visible', timeout: 60_000 })
    }
  }
  if (args.scroll) {
    await control(args.scroll)
      .or(page.getByRole('heading', { name: args.scroll, exact: true }))
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'start' }))
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
  await page.screenshot({ path: args.out, fullPage: !args.viewport })

  console.log(`${url}\n  title: ${await page.title()}\n  screenshot: ${args.out}`)
  console.log(problems.length ? `  problems:\n${problems.map((p) => `    ${p}`).join('\n')}` : '  problems: none')
} finally {
  await browser.close()
  await server.close()
}
process.exitCode = problems.length ? 1 : 0
