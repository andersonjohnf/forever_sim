/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://andersonjohnf.github.io/forever_sim/ on GitHub Pages.
  base: '/forever_sim/',
  // No SPA fallback: like GitHub Pages, unknown paths 404 instead of serving index.html, so
  // dev, preview and e2e runs surface missing assets. Use hash routing if routing is needed.
  appType: 'mpa',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Unit tests only; e2e/*.spec.ts belongs to Playwright (npm run test:e2e).
    include: ['src/**/*.test.ts'],
  },
})
