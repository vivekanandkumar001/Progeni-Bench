import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  // Chromium is the default local matrix; set BROWSERS=all in CI where the
  // Firefox/WebKit binaries are installed.
  projects: process.env.BROWSERS === 'all'
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && node scripts/serve.js 3000 dist',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
