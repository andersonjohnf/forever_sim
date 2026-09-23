import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/**
 * The smoke suite's unit half (npm run test:smoke): a few fast files that catch a broken build of
 * the core. The data is valid, the engine's goldens hold, configs normalize and share, and the sim's
 * API answers. The deploy workflow runs it; the full suite (npm test) runs everything. The list
 * replaces vite.config.ts's `include` rather than merging with it (mergeConfig would add to it).
 */
const SMOKE_FILES = [
  'src/data/data.test.ts',
  'src/data/schema.test.ts',
  'src/sim/defaults.test.ts',
  'src/sim/config/normalize.test.ts',
  'src/sim/engine/engine.test.ts',
  'src/sim/index.test.ts',
  'src/app/share.test.ts',
]

// A renamed or deleted file would otherwise drop out of the suite without a word.
const missing = SMOKE_FILES.filter((file) => !existsSync(new URL(file, import.meta.url)))
if (missing.length > 0) throw new Error(`vitest.smoke.config.ts lists files that don't exist: ${missing.join(', ')}`)

export default defineConfig({
  ...viteConfig,
  test: { ...viteConfig.test, include: SMOKE_FILES },
})
