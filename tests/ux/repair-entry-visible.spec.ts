import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * T02 (plan razvoja): SVE ulazne akcije koje vode na popravak otvaraju nadredjeni prikaz, unutarnje detalje i
 * panel, te fokusiraju vidljivu kontrolu. Tri ulaza postoje i sva tri idu kroz `scrollToRepairPanel`:
 *   1. opca akcija      `[data-testid="repair-entry"]` (cockpit, "Popravi sigurne stavke"),
 *   2. akcija nalaza    `[data-finding-action="repair"]` (kartica prioritetnog nalaza),
 *   3. akcija iz plana  `[data-repair-plan-go]` (korektorski stol, prikaz plana).
 * Kriterij iz plana: prolaze mis, tipkovnica i mobilni prikaz; spec se vrti u `chromium` i `mobile-chromium`.
 *
 * Detalji se NE otvaraju u pripremi: upravo sklopljeno stanje je kvar koji se mjeri (audit 2026-09-08, nalaz 2).
 * Panel se prepoznaje po `[data-testid="repair-workflow"]`, koji nose i lokalni (`repair-panel.ts`) i serverski
 * (`renderServerRepairPanel`) korijen, pa spec ne ovisi o tome je li `repairEndpoint` konfiguriran.
 */
// Fixture s AUTOMATSKIM zahvatima (4 ciljane provjere, sve razrijesene u repair-real-corpus.json): bez njih
// "Popravi sigurne stavke" je onemogucen i kartice nalaza nemaju "Popravi automatski", pa se put nalaza ne bi mogao mjeriti.
const fixture = path.resolve('tests/fixtures/docx/lo-fpzg-zavrsni-neuskladjen.docx');

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
  await expect(page.getByTestId('document-profile'), 'kartica profila mora biti vidljiva prije analize').toBeVisible();
  await expect(page.locator('#analyzeBtn')).toBeEnabled();
  await page.locator('#analyzeBtn').click();
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('analysis-results')).toBeVisible();
}

/** Baseline + zavrsne tvrdnje koje dijele sva tri ulaza. */
async function expectCollapsedBaseline(page: Page) {
  await expect(page.locator('#resultCockpitAdvancedContent'), 'napredni blok mora biti sklopljen prije klika').toBeHidden();
}

async function expectWorkflowRevealed(page: Page) {
  await expect(page.locator('#resultCockpitAdvancedContent'), 'ulaz mora otvoriti napredni blok').toBeVisible();
  const workflow = page.getByTestId('repair-workflow');
  await expect(workflow, 'panel popravka mora biti vidljiv').toBeVisible();
  await expect(workflow).toContainText(/poprav/i);
  // Fokus je na vidljivoj kontroli panela ILI na ciljanom retku ledgera: ledger modal zivi u <body> (ne u mountu),
  // pa je za akciju konkretnog nalaza upravo njegov redak ispravno mjesto fokusa.
  const fokusUnutar = await page.evaluate(() => {
    const m = document.getElementById('repairPanelMount');
    const ledger = document.querySelector('[data-lekta-repair-ledger-modal]:not(.hidden)');
    const a = document.activeElement;
    if (!a || a === document.body) return false;
    return (!!m && m.contains(a)) || (!!ledger && ledger.contains(a));
  });
  expect(fokusUnutar, 'fokus mora biti na vidljivoj kontroli unutar panela ili ledgera').toBe(true);
}

test.describe('T02: svaki ulaz u popravak otkriva nastavak', () => {
  test.setTimeout(300_000);

  test('opca akcija misem: repair-entry otvara repair-workflow', async ({ page }) => {
    await analyzeToResult(page);
    await expectCollapsedBaseline(page);
    const entry = page.getByTestId('repair-entry');
    await expect(entry, 'opca akcija mora postojati na cockpitu').toHaveCount(1);
    await expect(entry, 'repair-entry je po ugovoru uvijek omogucen gumb').toBeEnabled();
    // Fixture ima automatske stavke, pa je ulaz bas "Popravi sigurne stavke", ne simulacija.
    await expect(entry).toHaveAttribute('data-cockpit-action', 'repair-safe');
    await entry.click();
    await expectWorkflowRevealed(page);
  });

  test('opca akcija tipkovnicom: fokus + Enter, bez misa', async ({ page }) => {
    await analyzeToResult(page);
    await expectCollapsedBaseline(page);
    const entry = page.getByTestId('repair-entry');
    await expect(entry).toBeEnabled();
    await entry.focus();
    await expect(entry).toBeFocused();
    await page.keyboard.press('Enter');
    await expectWorkflowRevealed(page);
  });

  test('akcija konkretnog nalaza vodi na panel i oznacava bas taj zahvat', async ({ page }) => {
    await analyzeToResult(page);
    await expectCollapsedBaseline(page);
    const findingRepair = page.locator('#resultCockpit [data-finding-action="repair"]');
    // Prioritetne kartice nude "Popravi automatski" samo za nalaze koji imaju zahvat; ovaj fixture ih ima
    // (prazni odlomci). Kad ih ne bi bilo, tvrdnja pada umjesto da put ostane nemjeren.
    await expect(findingRepair.first(), 'fixture mora nuditi barem jedan nalaz s automatskim zahvatom').toBeVisible();
    await findingRepair.first().click();
    await expectWorkflowRevealed(page);
    // Ispravan odabir se cuva: ciljani zahvat je oznacen (ledger redak ili checkbox), ne neki drugi.
    const oznacen = await page.evaluate(() => {
      const row = document.querySelector('.lekta-repair-ledger-row--target');
      if (row) return row.getAttribute('aria-checked') === 'true';
      const item = document.querySelector('.lekta-repair-panel__item--target input[type="checkbox"]') as HTMLInputElement | null;
      return item ? item.checked : null;
    });
    expect(oznacen, 'ciljani zahvat mora biti oznacen nakon akcije nalaza').toBe(true);
  });

  test('akcija iz plana (korektorski stol) vodi na isti panel', async ({ page }) => {
    await analyzeToResult(page);
    await expectCollapsedBaseline(page);
    const stol = page.locator('[data-desk-host]');
    await expect(stol, 'fixture mora imati korektorski stol; bez njega put kroz plan nije izmjeren').toHaveCount(1);
    const otvori = page.locator('[data-desk-plan-open]');
    if ((await otvori.count()) > 0) await otvori.first().click();
    const go = page.locator('[data-repair-plan-go]');
    await expect(go.first()).toBeVisible();
    await go.first().click();
    await expectWorkflowRevealed(page);
  });
});
