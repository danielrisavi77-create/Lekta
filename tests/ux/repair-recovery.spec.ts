import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * T10 (plan razvoja): oporavak nakon greske na SERVERSKOM putu popravka i zastita od dvostruke potrosnje prava.
 *
 * Server se ne dira: `/auth/v1/signup` (anonimna prijava) i `/functions/v1/repair-docx` se presrecu na mreznoj razini
 * (`page.route`), pa spec mjeri iskljucivo ponasanje sucelja:
 *   1. prekid veze NAKON slanja -> poruka o nepoznatom ishodu, "Pokusaj ponovno" ONEMOGUCEN dok se ne otvore Moji popravci;
 *   2. odbijena prava pristupa (401) -> ponovna prijava (auth modal), ne slijepi ponovni pokusaj;
 *   3. istekli uvjeti (400 consent_required) -> poruka o osvjezavanju privole, bez gumba za ponovni pokusaj;
 *   4. dvostruki klik dok zahtjev traje salje TOCNO JEDAN zahtjev (kontroler `ready -> running`, T08).
 *
 * `repairEndpoint` je u dev konfiguraciji uvijek postavljen (DEFAULT_PRODUCTION_CONFIG), pa se prikazuje serverski
 * panel; bez toga bi spec mjerio lokalni put i tvrdio nesto sto korisnik ne vidi.
 */
const fixture = path.resolve('tests/fixtures/docx/lo-fpzg-zavrsni-neuskladjen.docx');
const REPAIR = '**/functions/v1/repair-docx*';
const SIGNUP = '**/auth/v1/signup*';
// Sesija S E-MAILOM: "Moji popravci" postoje samo uz e-mail (authSessionActive), a bas taj put spec mjeri. Za anonimnu
// sesiju prikaz umjesto provjere daje napomenu i odmah dopusta ponovni pokusaj (tests/repair-recovery.test.ts).
const FAKE_SESSION = { access_token: 'test-token', refresh_token: 'r', expires_in: 3600, user: { id: 'u-test', email: 'test@example.invalid', is_anonymous: false } };

async function analyzeToPanel(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const st = document.createElement('style');
    st.textContent = 'html,body,*{scroll-behavior:auto!important}';
    document.documentElement.appendChild(st);
  });
  await page.route(SIGNUP, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_SESSION) }));
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
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('repair-entry').click();
  const workflow = page.getByTestId('repair-workflow');
  await expect(workflow).toBeVisible();
  // Serverski panel: privola je uvjet slanja. Bez nje gumb ne salje i spec bi mjerio krivi put.
  const consent = workflow.locator('[data-repair-consent]');
  await expect(consent, 'spec ocekuje SERVERSKI panel (repairEndpoint konfiguriran)').toHaveCount(1);
  await consent.check();
  return workflow;
}

const sendButton = (page: Page) => page.getByTestId('repair-workflow').locator('.lekta-repair-panel__download');

/** Klik na slanje; kad odabir sadrzi zahvat koji trazi potvrdu lokacije (K6), prvo se potvrdi, pa tek onda ide zahtjev. */
async function send(page: Page) {
  await sendButton(page).click();
  const potvrdi = page.getByTestId('repair-workflow').locator('.lekta-repair-panel__confirm');
  if (await potvrdi.isVisible().catch(() => false)) await potvrdi.click();
}

test.describe('T10: oporavak nakon greske popravka', () => {
  test.setTimeout(300_000);

  test('prekid veze nakon slanja: prvo provjera postojeceg posla, ponovni pokusaj tek onda', async ({ page }) => {
    await analyzeToPanel(page);
    let requests = 0;
    await page.route(REPAIR, (route) => { requests += 1; void route.abort('connectionreset'); });
    await send(page);
    const recovery = page.getByTestId('repair-recovery');
    await expect(recovery).toBeVisible({ timeout: 60_000 });
    await expect(recovery).toHaveAttribute('data-repair-recovery', 'check-existing-job');
    await expect(recovery).toContainText('Moje popravke');
    const retry = recovery.locator('[data-repair-retry]');
    await expect(retry).toBeDisabled();
    expect(requests, 'tocno jedan zahtjev je poslan').toBe(1);
    // Provjera otkljucava ponovni pokusaj; tek tada drugi zahtjev.
    const jobs = recovery.locator('[data-repair-check-jobs]');
    await expect(jobs, 'uz sesiju s e-mailom provjera poslova mora biti dostupna').toBeEnabled();
    await jobs.click();
    await expect(retry).toBeEnabled();
    await page.keyboard.press('Escape'); // zatvori modal "Moji popravci" ako se otvorio
    await retry.click();
    await expect.poll(() => requests, { timeout: 30_000 }).toBe(2);
  });

  test('odbijena prava pristupa (401): ponovna prijava, ne slijepi ponovni pokusaj', async ({ page }) => {
    await analyzeToPanel(page);
    let requests = 0;
    await page.route(REPAIR, (route) => { requests += 1; void route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }); });
    await send(page);
    await expect(page.locator('#authModal')).toBeVisible({ timeout: 60_000 });
    expect(requests).toBe(1);
  });

  test('istekli uvjeti (400 consent_required): osvjezenje privole, bez gumba za ponovni pokusaj', async ({ page }) => {
    await analyzeToPanel(page);
    await page.route(REPAIR, (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'consent_required' }) }));
    await send(page);
    const recovery = page.getByTestId('repair-recovery');
    await expect(recovery).toBeVisible({ timeout: 60_000 });
    await expect(recovery).toHaveAttribute('data-repair-recovery', 'refresh-consent');
    await expect(recovery.locator('[data-repair-retry]')).toHaveCount(0);
  });

  test('dvostruki klik dok zahtjev traje salje tocno jedan zahtjev', async ({ page }) => {
    await analyzeToPanel(page);
    let requests = 0;
    let release: () => void = () => {};
    const held = new Promise<void>((r) => { release = r; });
    await page.route(REPAIR, async (route) => { requests += 1; await held; await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); });
    const btn = sendButton(page);
    await send(page);
    // Drugi klik dok prvi traje: gumb je onemogucen (i kontroler je u `running`), pa `force` samo dokazuje da ni
    // sam dogadjaj ne moze proizvesti drugi zahtjev.
    await btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    expect(requests, 'dok zahtjev traje, drugi klik ne salje nista').toBe(1);
    release();
    await expect(page.getByTestId('repair-recovery')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('repair-recovery')).toHaveAttribute('data-repair-recovery', 'retry');
    expect(requests).toBe(1);
  });
});
