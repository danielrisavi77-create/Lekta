import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * Glavni poziv na popravak MORA dovesti do VIDLJIVOG panela popravka.
 *
 * Vanjski audit 2026-09-08 (nalaz 2, P1), potvrdjen na origin/master 2438bbd4: klik na "Popravi
 * sigurne stavke" (i "Simuliraj") zvao je samo `scrollToRepairPanel`, koja otkriva `#resultDetails` i
 * `#tabDetails` i prebacuje karticu, ali NE otvara nadredjeni blok `#resultCockpitAdvancedContent`.
 * `ensureResultsCockpitAdvancedShell` u taj blok seli SVE iza cockpita i zadano ga sklapa, pa je panel
 * imao visinu 0: kartica je prebacena, skrol nije imao metu, korisnik je gledao isti ekran i sam morao
 * otvoriti "Naprednu provjeru". Isti kvar je nasljedjivao i novi plan popravka (`[data-repair-plan-go]`
 * u desk-mount.ts), jer i on emitira `repair-safe`.
 *
 * Nijedan Playwright spec nije mjerio vidljivost NAKON klika: `repair-panel.spec.ts` sam otvara
 * `open-findings` pa tek onda dira panel, a jedinicni testovi tvrde samo da je akcija EMITIRANA.
 *
 * DOKAZ DA GARD GRIZE: ovaj spec je 2026-09-09 vrcen nad `src/ui/app.ts` BEZ popravka i pao je na
 * `#repairPanelMount` "hidden" u oba projekta; s popravkom (jedan redak u `scrollToRepairPanel`) prolazi.
 *
 * Tok do rezultata je namjerno isti kao u `repair-panel.spec.ts` (fixture, odbijanje trake privole,
 * reducedMotion, `scroll-behavior:auto`), ali BEZ klika na `open-findings`: bas to stanje korisnik
 * napusta prvim klikom na popravak, i bas ono do sada nije bilo mjereno. Dupliciran je s referencom
 * umjesto izdvojen u helper, da se ne dira spec koji druga sesija upravo mijenja.
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function analyzeToResult(page: Page) {
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
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
}

test.describe('CTA popravka otvara panel', () => {
  test.setTimeout(300_000);

  test('klik na "Popravi sigurne stavke" (ili "Simuliraj") ostavlja panel VIDLJIV i fokusiran', async ({ page }) => {
    await analyzeToResult(page);

    // BASELINE: napredni blok je zadano SKLOPLJEN. Bez ove tvrdnje test bi mogao prolaziti zato sto
    // je blok vec otvoren iz drugog razloga, a ne zato sto ga CTA otvara.
    const advanced = page.locator('#resultCockpitAdvancedContent');
    await expect(advanced, 'napredni blok mora biti sklopljen prije klika (inace test ne mjeri nista)').toBeHidden();

    // Jedan od dva CTA-a MORA biti omogucen; tihi `if` bi ovdje pretvorio nedostatak gumba u prolaz.
    const safe = page.locator('#resultCockpit [data-cockpit-action="repair-safe"]');
    const simulate = page.locator('#resultCockpit [data-cockpit-action="simulate-repair"]');
    const safeEnabled = (await safe.count()) > 0 && (await safe.first().isEnabled());
    const simulateEnabled = (await simulate.count()) > 0 && (await simulate.first().isEnabled());
    expect(safeEnabled || simulateEnabled, 'ni repair-safe ni simulate-repair nisu omoguceni').toBe(true);
    await (safeEnabled ? safe : simulate).first().click();

    await expect(advanced, 'CTA popravka mora otvoriti napredni blok').toBeVisible();
    const mount = page.locator('#repairPanelMount');
    await expect(mount, 'panel popravka mora biti vidljiv nakon CTA').toBeVisible();
    const fokusUnutar = await page.evaluate(() => {
      const m = document.getElementById('repairPanelMount');
      const a = document.activeElement;
      return !!m && !!a && m.contains(a);
    });
    expect(fokusUnutar, 'fokus mora biti unutar panela popravka').toBe(true);
  });

  test('plan popravka (`[data-repair-plan-go]`) vodi na isti vidljiv panel, ako je stol prisutan', async ({ page }) => {
    await analyzeToResult(page);
    const go = page.locator('[data-repair-plan-go]');
    const stol = await page.locator('[data-desk-host]').count();
    if (stol === 0) {
      // Izricito, ne tiho: kad stola nema u ovom fixtureu, spec to KAZE, pa se ne moze citati kao
      // da je put kroz plan izmjeren.
      test.info().annotations.push({ type: 'preskoceno', description: 'fixture nema [data-desk-host]; put kroz plan nije izmjeren' });
      expect(await go.count()).toBe(0);
      return;
    }
    const otvori = page.locator('[data-desk-plan-open]');
    if ((await otvori.count()) > 0) await otvori.first().click();
    await expect(go.first()).toBeVisible();
    await go.first().click();
    await expect(page.locator('#resultCockpitAdvancedContent')).toBeVisible();
    await expect(page.locator('#repairPanelMount')).toBeVisible();
  });
});
