import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { potvrdiProfil } from '../ux/confirm-profile';
import { cekajApp, cekajKorak } from '../ux/app-ready';

/**
 * PRAVILA PROFILA U DIST BUILDU DOLAZE S MREZE, NE IZ LOKALNOG DAVATELJA.
 *
 * Dev server (`tests/ux/**`) pravila dobiva iz `profile-rules-local` (lijeni chunkovi), a produkcijski
 * bundle ISKLJUCIVO s Edge funkcije `profile-rules`. Izmjereno 2026-09-09 pri prvom prolazu ovog speca:
 * pod `vite preview` na 127.0.0.1 Edge odbija origin (CORS), klijent posteno degradira na "opcu
 * provjeru (pravila fakulteta nisu ucitana)", kartica potvrde se nikad ne prikaze i rezultat se
 * iscrta bez profila. To je tocno razred razlike dev/dist zbog koje ovaj spec postoji.
 *
 * Zato se poziv presrece i posluzuje iz COMMITANOG artefakta `data/generated/profile-rules-server.json`,
 * u istom obliku kao Edge (`ProfileRulesResponseV1`, vidi supabase/functions/profile-rules/index.ts).
 * Mjeri se dakle klijentski produkcijski artefakt s pravim podacima; sam Edge pokrivaju `check:edge`,
 * `post-deploy-smoke` i vlastiti testovi funkcije.
 */
const ARTEFAKT = JSON.parse(readFileSync(path.resolve('data/generated/profile-rules-server.json'), 'utf8')) as {
  datasetVersion: string;
  profiles: Record<string, { etag: string; profile: Record<string, unknown>; repairEntries: unknown[] }>;
};

async function posluziPravilaIzArtefakta(page: Page) {
  await page.route('**/functions/v1/profile-rules*', async (route) => {
    const url = new URL(route.request().url());
    const profileId = url.searchParams.get('profileId') ?? '';
    const entry = ARTEFAKT.profiles[profileId];
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (!entry) return route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ error: 'not_found' }) });
    const body = {
      v: 1,
      profileId,
      verifiedAt: typeof entry.profile.verifiedAt === 'string' ? entry.profile.verifiedAt : null,
      datasetVersion: ARTEFAKT.datasetVersion,
      profile: entry.profile,
      repairEntries: entry.repairEntries,
    };
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(body) });
  });
}

/**
 * Kriticni put nad PRODUKCIJSKIM artefaktom: dokument -> profil -> nalaz -> CTA popravka -> vidljiv panel.
 *
 * Vanjski audit 2026-09-08 (nalaz 3): nijedan gate nije vrtio produkcijski `dist/` u pregledniku.
 * `tests/ux/**` mjeri dev server, `post-deploy-smoke` mjeri zivu stranicu ali nikad ne ucitava dokument.
 * Ovaj spec je isti korisnicki tok kao `tests/ux/repair-cta-opens-panel.spec.ts`, ali nad
 * `vite preview` bundleom (`playwright.dist.config.ts`): minificirano, `__DEV_TOOLS__=false`, tree-shake.
 *
 * Isti fixture kao u `repair-panel.spec.ts`; traka privole se odbija kao sto to radi korisnik.
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

test.describe('dist: kriticni put', () => {
  test.setTimeout(300_000);

  test('dokument -> profil -> nalaz -> CTA popravka -> panel vidljiv (produkcijski bundle)', async ({ page }) => {
    await posluziPravilaIzArtefakta(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const st = document.createElement('style');
      st.textContent = 'html,body,*{scroll-behavior:auto!important}';
      document.documentElement.appendChild(st);
    });
    await page.goto('/rad/');
    const odbij = page.locator('#analyticsDecline');
    if (await odbij.isVisible().catch(() => false)) {
      await odbij.click();
      await expect(page.locator('#consentBanner')).toBeHidden();
    }
    await cekajApp(page);
    await page.locator('#fileInput').setInputFiles(fixture);
    await cekajKorak(page, '2');
    await expect(page.locator('#analyzeBtn')).toBeEnabled();
    await page.locator('#analyzeBtn').click();
    await potvrdiProfil(page);
    await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });

    // Nalaz je vidljiv: ocjena ili sazetak postoji i ima sadrzaj.
    await expect(page.locator('#resultCockpit')).toBeVisible();

    // CTA popravka mora otvoriti sklopljeni blok i dovesti panel u vidno polje (nalaz 2 iz istog audita,
    // ovdje dokazan i na produkcijskom bundleu).
    const advanced = page.locator('#resultCockpitAdvancedContent');
    await expect(advanced, 'napredni blok je zadano sklopljen').toBeHidden();
    const safe = page.locator('#resultCockpit [data-cockpit-action="repair-safe"]');
    const simulate = page.locator('#resultCockpit [data-cockpit-action="simulate-repair"]');
    const safeEnabled = (await safe.count()) > 0 && (await safe.first().isEnabled());
    const simulateEnabled = (await simulate.count()) > 0 && (await simulate.first().isEnabled());
    expect(safeEnabled || simulateEnabled, 'ni repair-safe ni simulate-repair nisu omoguceni').toBe(true);
    await (safeEnabled ? safe : simulate).first().click();
    await expect(advanced).toBeVisible();
    await expect(page.locator('#repairPanelMount')).toBeVisible();
  });

  test('produkcijski bundle ne nosi dev alate (kontrola da se mjeri dist, ne dev server)', async ({ page }) => {
    // `__DEV_TOOLS__` je build-time konstanta (vite.config.ts `define`); u dev buildu `?qa=1` otkriva
    // QA gumb (`#qaBtn`, app.ts), u dist buildu je ta grana mrtav kod pa gumb ostaje skriven ili ga nema.
    // Ovo je jedina razlika dev/dist koju je jednostavno mjeriti izravno, i sluzi kao kontrola da spec
    // doista gleda produkcijski artefakt, a ne slucajno dev server na istom portu.
    await page.goto('/rad/?qa=1');
    await cekajApp(page);
    await expect(page.locator('#qaBtn')).toBeHidden();
  });
});
