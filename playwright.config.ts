import { defineConfig, devices } from '@playwright/test';

const viewport = { width: 1360, height: 900 };

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL: process.env.EVENTBANK_URL ?? 'http://localhost:3000',
    screenshot: 'on',
    trace: 'on',
    video: { mode: 'on', size: viewport },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } }],
});
