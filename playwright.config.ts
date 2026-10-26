import { defineConfig } from '@playwright/test';

const PORT = 4173;

// Smoke tests run against the production build (service worker and CSP included),
// on a 360 px Android-sized phone and on a desktop window (SPEC rule 9).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/carlog/`,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'phone-360',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1366, height: 860 } },
    },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/carlog/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
