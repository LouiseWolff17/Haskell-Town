import { defineConfig, devices } from '@playwright/test';

// Browser tests for the main flows (e2e/*.spec.ts). They run against the production build,
// served by `vite preview`, so the bundled Web Worker is tested the way players get it.
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // The character walks to a building before its notebook opens, and code runs in a worker.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}/Haskell-Town/`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/Haskell-Town/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
