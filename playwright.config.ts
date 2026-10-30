/* Proves de punta a punta del tauler de missions: l'API de desenvolupament (PGlite en memòria) i el wiki construït
   apuntant-hi. `npm run test:e2e` (cal haver fet `npx playwright install chromium` un cop, fora d'aquest entorn). */
import { defineConfig, devices } from '@playwright/test';

export const API = 'http://127.0.0.1:8799';
export const SITE = 'http://127.0.0.1:4399';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: SITE,
    viewport: { width: 1600, height: 900 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } }],
  webServer: [
    {
      command: 'node --experimental-strip-types --no-warnings api/src/dev.ts',
      url: API + '/healthz',
      env: { DATABASE_URL: 'pglite://memory', PORT: '8799', ALLOWED_ORIGINS: SITE, PING_INTERVAL_MS: '5000' },
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: 'npm run build && npx astro preview --host 127.0.0.1 --port 4399',
      url: SITE + '/wiki/',
      env: { PUBLIC_MISSIONS_API_URL: API },
      reuseExistingServer: false,
      timeout: 180_000
    }
  ]
});
