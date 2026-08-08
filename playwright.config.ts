import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ux',
  timeout: 120_000,
  fullyParallel: true,
  // Lokalno JEDAN radnik. Paralelno dizanje preglednika na razvojnom stroju iscrpi memoriju
  // ("Zone Allocation failed - process out of memory", pa "browserType.launch: spawn UNKNOWN")
  // i suite pada bez ijednog stvarnog kvara: u tri uzastopna prolaza pala je svaki put DRUGA
  // trojka testova, a svaki od njih izoliran prolazi.
  // Mjereno na ovom stroju: 1 radnik = 41/41 u 4,9 min; 2 radnika = 38/41 u 10,4 min.
  // Paralelizam ovdje dakle ne ubrzava nego mlati memoriju. CI ima vlastiti stroj i ostaje
  // na zadanoj vrijednosti (uz retries: 1).
  workers: process.env.CI ? undefined : 1,
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
