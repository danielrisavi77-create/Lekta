import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { potvrdiProfil } from '../ux/confirm-profile';
import { cekajApp, cekajKorak } from '../ux/app-ready';

/**
 * PRODUKCIJSKO PUTOVANJE OD POCETNE STRANICE (plan T03).
 *
 * `critical-path.spec.ts` pocinje na `/rad/` i time preskace prvi korak koji korisnik stvarno radi: ubaci
 * dokument na `/`, pohrana ga spremi kao lokalnu sesiju i preusmjeri na `/rad/#session=<uuid>`, gdje radni
 * prostor MORA odmah pokazati ucitani dokument bez ponovnog ucitavanja i bez marketinskog uvoda. Rez naslovnice
 * (2026-09-05) je bas taj most; nijedan gate ga do sada nije mjerio nad produkcijskim artefaktom.
 *
 * Analizator se i dalje trazi ISKLJUCIVO na `/rad/` (tests/intake-entry-boundary.test.ts): ovdje se na `/`
 * radi samo ubacivanje, a sve tvrdnje o analizi dolaze nakon preusmjeravanja.
 *
 * Pravila profila se posluzuju iz commitanog artefakta iz istog razloga kao u critical-path.spec.ts (Edge
 * odbija `vite preview` origin).
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

const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

test.describe('dist: putovanje od pocetne stranice', () => {
  test.setTimeout(300_000);

  test('/ -> ubaci dokument -> /rad/#session -> dokument vec ucitan -> analiza -> plan popravka', async ({ page }) => {
    await posluziPravilaIzArtefakta(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const st = document.createElement('style');
      st.textContent = 'html,body,*{scroll-behavior:auto!important;transition:none!important;animation:none!important}';
      document.documentElement.appendChild(st);
    });

    await page.goto('/');
    // Pocetna stranica nosi SAMO ulaz: nema analizatora ni njegove privolne trake u pocetnom grafu.
    await expect(page.locator('#intakeDropzone')).toBeVisible();
    await expect(page.locator('#resultView')).toHaveCount(0);
    await page.locator('#intakeFile').setInputFiles(fixture);

    // Preusmjeravanje na radni prostor s identitetom sesije; ime datoteke ne smije biti u URL-u.
    await page.waitForURL(/\/rad\/#session=[0-9a-f-]{36}$/i, { timeout: 60_000 });
    expect(page.url()).not.toContain('prazni-odlomci');

    // Privola nije predmet ovog testa. Izmjereno na CI-u 2026-09-09: nakon preusmjeravanja s `/` gumb je
    // "resolved" ali Playwright ga 300 s nije proglasio stabilnim (traka ulazi animacijom), pa se odbijanje
    // salje kao dogadjaj, kako to radi i korisnikov klik, bez cekanja na animaciju.
    const odbij = page.locator('#analyticsDecline');
    if (await odbij.isVisible().catch(() => false)) {
      await odbij.dispatchEvent('click');
      await expect(page.locator('#consentBanner')).toBeHidden({ timeout: 30_000 });
    }
    await cekajApp(page);

    // CRTANJE MORA ZIVJETI. Izmjereno 2026-09-09 nad dist/ (headless, headed i pravi Chrome 152): nakon
    // primopredaje s `/` requestAnimationFrame na `/rad/` vise ne okida (0 okvira u 3 s), dok izravan ulaz radi.
    // Bez ove tvrdnje svaki kasniji klik visi 300 s na "stable" i pad izgleda kao spor stroj. Zivi build od
    // 2026-09-06 (4d7c6f6e) to nema; regresija je u masteru poslije njega.
    const okvir = await page.evaluate(() => new Promise<number | null>((ok) => {
      const t0 = performance.now();
      requestAnimationFrame(() => ok(Math.round(performance.now() - t0)));
      setTimeout(() => ok(null), 5000);
    }));
    expect(okvir, 'requestAnimationFrame nije okinuo 5 s nakon dolaska s /: crtanje je zamrznuto').not.toBeNull();

    // Dokument je VEC ucitan: korak 2 bez ponovnog ubacivanja, i bez marketinskog uvoda.
    await cekajKorak(page, '2');
    await expect(page.locator('#analyzer')).toBeVisible();

    // Obnovljena sesija ide korak dalje od rucnog ubacivanja: radni prostor ODMAH nudi karticu potvrde
    // profila ("Potvrdi i provjeri"), a #analyzeBtn stoji iza nje i nije klikabilan (izmjereno lokalno
    // i na CI-u 2026-09-09: "resolved", ali nikad "visible, enabled and stable"). Klik na analizu ide
    // samo kad kartice jos nema; u oba slucaja potvrda profila je tvrda tvrdnja (vidi confirm-profile.ts).
    const potvrda = page.locator('[data-confirm-profile]');
    if (!(await potvrda.isVisible().catch(() => false))) {
      await expect(page.locator('#analyzeBtn')).toBeEnabled({ timeout: 60_000 });
      await page.locator('#analyzeBtn').click();
    }
    await potvrdiProfil(page);
    await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('#resultCockpit')).toBeVisible();

    // Plan popravka je dostupan iz rezultata (isti CTA kao critical-path, ovdje kao kraj putovanja od `/`).
    const safe = page.locator('#resultCockpit [data-cockpit-action="repair-safe"]');
    const simulate = page.locator('#resultCockpit [data-cockpit-action="simulate-repair"]');
    const safeEnabled = (await safe.count()) > 0 && (await safe.first().isEnabled());
    const simulateEnabled = (await simulate.count()) > 0 && (await simulate.first().isEnabled());
    expect(safeEnabled || simulateEnabled, 'ni repair-safe ni simulate-repair nisu omoguceni').toBe(true);
    await (safeEnabled ? safe : simulate).first().click();
    await expect(page.locator('#repairPanelMount')).toBeVisible();
  });
});
