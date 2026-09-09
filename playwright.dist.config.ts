import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright nad PRODUKCIJSKIM artefaktom (`dist/`, posluzen kroz `vite preview`), ne nad dev serverom.
 *
 * ZASTO ZASEBAN CONFIG (vanjski audit 2026-09-08, nalaz 3): `tests/ux/**` se vrti protiv `npm run dev`,
 * a `post-deploy-smoke` nad zivom stranicom nikad ne ucitava dokument. Nista dakle nije vrtjelo kriticni
 * put (dokument -> profil -> nalaz -> panel popravka) nad onim sto se stvarno objavljuje: minificiran
 * bundle, `__DEV_TOOLS__=false`, tree-shake, `_headers`, generirane staticke stranice. Razlika dev/dist
 * je bas ona koju je audit prijavio kao "javno korisnicko iskustvo nije master".
 *
 * PREDUVJET: `dist/` mora postojati i biti proizveden PUNIM lancem iz `netlify.toml` (build + generatori),
 * inace preview servira nepotpun site i test pada iz krivog razloga. CI job `dist-gate` to radi prije.
 *
 * `reuseExistingServer: false` UVIJEK: preview na dijeljenom portu bi servirao TUDJI `dist/`
 * (`tests/playwright-reuses-foreign-server`), pa se port daje kroz `LEKTA_UX_PORT` po sesiji.
 */
const UX_PORT = process.env.LEKTA_UX_PORT ?? '4173';
const UX_ORIGIN = `http://127.0.0.1:${UX_PORT}`;

export default defineConfig({
  testDir: './tests/ux-dist',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: UX_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${UX_PORT} --strictPort`,
    url: UX_ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
