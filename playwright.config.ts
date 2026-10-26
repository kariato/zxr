import { defineConfig, devices } from '@playwright/test';

const pages = process.env.GITHUB_PAGES === 'true';
const baseURL = `http://127.0.0.1:4173${pages ? '/zxr/' : '/'}`;

export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: true,
  // Shared CI runners render WebGL in software; concurrent scene captures can
  // starve the browser event loop and consume the source-journey timeout.
  workers: process.env.CI ? 1 : undefined,
  reporter: 'line',
  use: { baseURL },
  webServer: {
    command: pages ? 'npx --no-install vite preview --host 127.0.0.1 --port 4173 --strictPort' : 'npm run dev -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
