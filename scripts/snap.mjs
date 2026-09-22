// Quick visual check of the production build in headless Chromium.
//
// Serves dist/ under the GitHub Pages base path, opens a page, prints console errors and
// warnings, page errors and failed requests, and saves a full-page screenshot. Exits 1 if
// anything went wrong.
//
//   npm run snap                                   # build, then snap the landing page
//   npm run snap -- --dark --width 390             # dark mode at phone width
//   node scripts/snap.mjs --path '#/sim' --out .cache/snaps/sim.png   # reuse the existing dist/
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
  },
})

const server = await preview({ preview: { port: 0 }, logLevel: 'silent' })
const { port } = server.httpServer.address()
const url = new URL(args.path, `http://localhost:${port}${server.config.base}`).href

const browser = await chromium.launch()
const problems = []
try {
  const page = await browser.newPage({
    viewport: { width: Number(args.width), height: Number(args.height) },
    colorScheme: args.dark ? 'dark' : 'light',
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console.${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()} ${res.url()}`)
  })

  await page.goto(url, { waitUntil: 'networkidle' })
  mkdirSync(dirname(args.out), { recursive: true })
  await page.screenshot({ path: args.out, fullPage: true })

  console.log(`${url}\n  title: ${await page.title()}\n  screenshot: ${args.out}`)
  console.log(problems.length ? `  problems:\n${problems.map((p) => `    ${p}`).join('\n')}` : '  problems: none')
} finally {
  await browser.close()
  await server.close()
}
process.exitCode = problems.length ? 1 : 0
