import { defineConfig } from '@playwright/test';
import { e2eOrigin, e2ePort } from './tests/e2e/test-origin.js';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: e2eOrigin, browserName: 'chromium',
    launchOptions: process.platform === 'darwin' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {},
    viewport: { width: 1440, height: 1050 }, trace: 'retain-on-failure' },
  // Never attach tests to a developer's open session or a shared emulator.
  webServer: { command: `npm run dev -- --port ${e2ePort} --strictPort`, url: e2eOrigin, reuseExistingServer: false }
});
