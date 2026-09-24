/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

type Json = Record<string, unknown>

const omit = (obj: Json, keys: readonly string[]) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)))

/** Per-dataset slimming: what the browser build keeps from each generated JSON file. */
const SLIMMERS: [RegExp, (data: Json) => Json][] = [
  [
    /\/src\/data\/items\/pre-bis\.json$/,
    (data) => ({
      ...data,
      meta: omit(data.meta as Json, ['tables', 'descriptionCoverage', 'preRaidBis', 'noClientRow', 'fallbackEffects']),
      items: (data.items as Json[]).map((item) => omit(item, ['classic', 'flavor', 'sellPrice', 'notes', 'statSpellIds'])),
    }),
  ],
  [
    /\/src\/data\/talents\/\w+\.json$/,
    (data) => ({
      ...data,
      meta: omit(data.meta as Json, ['tables', 'wowDbDefs']),
      trees: (data.trees as Json[]).map((tree) => ({
        ...tree,
        talents: (tree.talents as Json[]).map((t) => ({
          ...omit(t, ['classic', 'tooltip', 'classicSpellId', 'previousName', 'changeKind']),
          ranks: { forever: (t.ranks as Json).forever },
        })),
      })),
    }),
  ],
  [
    // The app reads only the spellbooks' `meta` (the About sheet's build and date).
    /\/src\/data\/spells\/\w+\.json$/,
    (data) => ({ ...data, meta: omit(data.meta as Json, ['tables', 'wowDbDefs', 'noClientData']) }),
  ],
  [
    /\/src\/data\/races\/races\.json$/,
    (data) => ({
      ...omit(data, ['newCombos']),
      meta: omit(data.meta as Json, ['tables', 'wowDbDefs']),
      races: (data.races as Json[]).map((race) => ({
        ...omit(race, ['removedRacials']),
        racials: (race.racials as Json[]).map((r) => omit(r, ['classic', 'tooltip', 'spellIds', 'classicSpellId'])),
      })),
    }),
  ],
]

/**
 * Ships slimmer datasets to the browser. The generated JSON files in src/data stay the single,
 * complete source of truth (and what the data-integrity tests read); the app doesn't need raw
 * tooltips, Classic comparison rows, sources or evidence metadata, which are most of their size.
 */
function slimData(): Plugin {
  return {
    name: 'forever-sim:slim-data',
    enforce: 'pre',
    load(id) {
      if (process.env.VITEST) return null
      const slim = SLIMMERS.find(([pattern]) => pattern.test(id))?.[1]
      return slim ? JSON.stringify(slim(JSON.parse(readFileSync(id, 'utf8')))) : null
    },
  }
}

/**
 * The release stamp (docs/architecture.md "Release stamp"): when this build was made and from which
 * commit, shown in About. The deploy builds on every push to main, so its time is the release's.
 * BUILD_TIME can pin it (a test's build); GitHub Actions gives the commit as GITHUB_SHA.
 */
function gitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}
const BUILD_TIME = process.env.BUILD_TIME ?? new Date().toISOString()
const BUILD_COMMIT = process.env.GITHUB_SHA ?? gitCommit()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
  },
  // Served from the root of https://sim.decades.gg/, GitHub Pages' custom domain. The old
  // https://andersonjohnf.github.io/forever_sim/ redirects there, keeping a link's #s= setup.
  base: '/',
  // No SPA fallback: like GitHub Pages, unknown paths 404 instead of serving index.html, so
  // dev, preview and e2e runs surface missing assets. Use hash routing if routing is needed.
  appType: 'mpa',
  plugins: [slimData(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Unit tests only; e2e/*.spec.ts belongs to Playwright (npm run test:e2e). Scraper library
    // tests sit next to their modules in scripts/.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
