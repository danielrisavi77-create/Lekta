import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ux',
  timeout: 120_000,
  fullyParallel: true,
  // Lokalno ograniceno na 2 radnika. Uz zadani broj (pola jezgri) paralelno dizanje
  // preglednika je na razvojnom stroju znalo pasti na "Zone Allocation failed - process
  // out of memory" pa "browserType.launch: spawn UNKNOWN": suite je bio crven bez ijednog
  // stvarnog kvara (isti testovi izolirano prolaze). CI ima vlastiti stroj pa tamo ostaje
  // zadana vrijednost.
  workers: process.env.CI ? undefined : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
