import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the production build served under the GitHub Pages base
// path, so they exercise exactly what gets deployed. A dedicated port keeps them clear of a
// dev or preview server you may already have running; E2E_PORT overrides it so two checkouts
// (e.g. a git worktree) can run e2e at the same time.
const PORT = Number(process.env.E2E_PORT ?? 4179)
const BASE_PATH = '/'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    // Navigate with relative paths (page.goto('./')) so the base path is kept.
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
