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

/** Skrati samo zadani rok aplikacije da regresija ne čeka stvarnih 30 s / 3 min. */
async function shortenAppTimeout(page: Page, originalMs: number) {
  await page.evaluate((targetMs) => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: any[]) =>
      nativeSetTimeout(handler, timeout === targetMs ? 1_000 : timeout, ...args)) as typeof window.setTimeout;
  }, originalMs);
}

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
  const button = sendButton(page);
  await button.click();
  const potvrdi = page.getByTestId('repair-workflow').locator('.lekta-repair-panel__confirm');
  await expect.poll(async () => {
    if (await potvrdi.isVisible().catch(() => false)) return 'confirm';
    if (await button.isDisabled().catch(() => false)) return 'sending';
    return 'waiting';
  }, { timeout: 5_000 }).not.toBe('waiting');
  if (await potvrdi.isVisible().catch(() => false)) await potvrdi.click();
}

test.describe('T10: oporavak nakon greske popravka', () => {
  test.setTimeout(300_000);

  test('prekid veze nakon slanja: prvo provjera postojeceg posla, ponovni pokusaj tek onda', async ({ page }) => {
    await analyzeToPanel(page);
    let requests = 0;
    let finishRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => { finishRetry = resolve; });
    await page.route(REPAIR, async (route) => {
      requests += 1;
      if (requests === 1) { await route.abort('connectionreset'); return; }
      await retryGate;
      await route.abort('connectionreset');
    });
    await page.route('**/rest/v1/repair_jobs*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await send(page);
    const recovery = page.getByTestId('repair-recovery');
    await expect(recovery).toBeVisible({ timeout: 60_000 });
    await expect(recovery).toHaveAttribute('data-repair-recovery', 'check-existing-job');
    await expect(recovery).toContainText('Moje popravke');
    const retry = recovery.locator('[data-repair-retry]');
    await expect(retry).toBeDisabled();
    await expect(sendButton(page)).toBeDisabled();
    expect(requests, 'tocno jedan zahtjev je poslan').toBe(1);
    // Provjera otkljucava ponovni pokusaj; tek tada drugi zahtjev.
    const jobs = recovery.locator('[data-repair-check-jobs]');
    await expect(jobs, 'uz sesiju s e-mailom provjera poslova mora biti dostupna').toBeEnabled();
    await jobs.click();
    await expect(page.locator('#repairHistoryList')).toContainText('Još nemaš spremljenih popravaka');
    await expect(retry).toBeEnabled();
    await page.keyboard.press('Escape'); // zatvori modal "Moji popravci" ako se otvorio
    await retry.click();
    await expect(retry).toBeDisabled();
    await expect(retry).toHaveText('Pokušavam ponovno…');
    await expect(retry).toHaveAttribute('aria-busy', 'true');
    await expect(recovery.getByRole('status')).toContainText('do 3 minute');
    await expect.poll(() => requests, { timeout: 30_000 }).toBe(2);
    finishRetry();
    await expect(recovery).toHaveAttribute('data-repair-recovery', 'check-existing-job');
    await expect(sendButton(page)).toBeDisabled();
  });

  test('timeout obnove sesije nakon nepoznatog ishoda zadržava zaključavanje do nove provjere', async ({ page }) => {
    await analyzeToPanel(page);
    await shortenAppTimeout(page, 30_000);
    let repairRequests = 0;
    await page.route(REPAIR, async (route) => {
      repairRequests += 1;
      await route.abort('connectionreset');
    });
    let historyRequests = 0;
    await page.route('**/rest/v1/repair_jobs*', (route) => {
      historyRequests += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    let refreshRequests = 0;
    await page.route((url) => url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'refresh_token', async (route) => {
      refreshRequests += 1;
      await refreshGate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...FAKE_SESSION,
        access_token: 'rotated-token',
        refresh_token: 'rotated-refresh-token',
      }) });
    });

    try {
      await send(page);
      const recovery = page.getByTestId('repair-recovery');
      await expect(recovery).toHaveAttribute('data-repair-recovery', 'check-existing-job');
      const retry = recovery.locator('[data-repair-retry]');
      await expect(retry).toBeDisabled();
      await recovery.locator('[data-repair-check-jobs]').click();
      await expect(page.locator('#repairHistoryList')).toContainText('Još nemaš spremljenih popravaka');
      await expect(retry).toBeEnabled();
      await page.keyboard.press('Escape');

      await page.evaluate(() => {
        const raw = localStorage.getItem('lekta.session');
        if (!raw) throw new Error('Očekivana testna sesija nije spremljena');
        const session = JSON.parse(raw);
        session.expiresAt = Date.now() - 1_000;
        localStorage.setItem('lekta.session', JSON.stringify(session));
      });
      await retry.click();
      await expect.poll(() => refreshRequests, { timeout: 10_000 }).toBe(1);
      await expect(recovery).toHaveAttribute('data-repair-recovery', 'check-existing-job', { timeout: 10_000 });
      await expect(recovery).toContainText('Prethodni popravak možda je još u obradi');
      await expect(recovery.locator('[data-repair-retry]')).toBeDisabled();
      await expect(sendButton(page)).toBeDisabled();
      expect(repairRequests, 'timeout prijave ne smije poslati drugi repair zahtjev').toBe(1);

      releaseRefresh();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lekta.session') || '{}').accessToken)).toBe('rotated-token');
      const checkedAgain = recovery.locator('[data-repair-check-jobs]');
      await checkedAgain.click();
      await expect.poll(() => historyRequests).toBe(2);
      await expect(page.locator('#repairHistoryList')).toContainText('Još nemaš spremljenih popravaka');
      await expect(recovery.locator('[data-repair-retry]')).toBeEnabled();
    } finally {
      releaseRefresh();
    }
  });

  test('zastoj prijave prekida vrtnju prije slanja dokumenta', async ({ page }) => {
    await analyzeToPanel(page);
    await shortenAppTimeout(page, 30_000);
    await page.unroute(SIGNUP);
    let releaseSignup!: () => void;
    const signupGate = new Promise<void>((resolve) => { releaseSignup = resolve; });
    let signups = 0;
    let repairs = 0;
    await page.route(SIGNUP, async (route) => {
      signups += 1;
      await signupGate;
      await route.abort('timedout').catch(() => {});
    });
    await page.route(REPAIR, async (route) => {
      repairs += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    try {
      await send(page);
      await expect.poll(() => signups, { timeout: 10_000 }).toBe(1);
      const button = sendButton(page);
      await expect(button).toContainText('Provjeravam prijavu…');
      const recovery = page.getByTestId('repair-recovery');
      await expect(recovery).toBeVisible({ timeout: 10_000 });
      await expect(recovery).toContainText('Provjera prijave trajala je predugo');
      await expect(recovery.locator('[data-repair-retry]')).toBeEnabled();
      expect(signups).toBe(1);
      expect(repairs, 'dokument se ne šalje dok prijava visi').toBe(0);
    } finally {
      releaseSignup();
    }
  });

  test('zastoj u Moji popravci prekida Učitavam vrtnju', async ({ page }) => {
    await analyzeToPanel(page);
    await shortenAppTimeout(page, 30_000);
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => { releaseHistory = resolve; });
    let requests = 0;
    await page.route('**/rest/v1/repair_jobs*', async (route) => {
      requests += 1;
      await historyGate;
      await route.abort('timedout').catch(() => {});
    });

    try {
      await page.locator('#repairHistoryBtn').click();
      const list = page.locator('#repairHistoryList');
      await expect.poll(() => requests, { timeout: 10_000 }).toBe(1);
      await expect(list).toContainText('Učitavanje je trajalo predugo', { timeout: 10_000 });
      await expect(list).not.toContainText('Učitavam…');
    } finally {
      releaseHistory();
    }
  });

  test('zastoj uploada prekida vrtnju i prikazuje siguran oporavak', async ({ page }) => {
    await analyzeToPanel(page);
    await shortenAppTimeout(page, 180_000);
    let releaseRepair!: () => void;
    const repairGate = new Promise<void>((resolve) => { releaseRepair = resolve; });
    let requests = 0;
    await page.route(REPAIR, async (route) => {
      requests += 1;
      await repairGate;
      await route.abort('timedout').catch(() => {});
    });

    try {
      await send(page);
      await expect.poll(() => requests, { timeout: 10_000 }).toBe(1);
      const recovery = page.getByTestId('repair-recovery');
      await expect(recovery).toBeVisible({ timeout: 10_000 });
      await expect(recovery).toHaveAttribute('data-repair-recovery', 'check-existing-job');
      await expect(recovery).toContainText('Moje popravke');
      await expect(recovery.locator('[data-repair-retry]')).toBeDisabled();
      expect(requests, 'istek uploada ne salje drugi zahtjev').toBe(1);
    } finally {
      releaseRepair();
    }
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
