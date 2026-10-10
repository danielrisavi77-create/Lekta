import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';
import { karticaSaZahvatom, otvoriLadicu } from './result-live-ladica';

/**
 * T02 (plan razvoja): SVE ulazne akcije koje vode na popravak otvaraju nadredjeni prikaz, unutarnje detalje i
 * panel, te fokusiraju vidljivu kontrolu. Tri ulaza postoje i sva tri idu kroz `scrollToRepairPanel`:
 *   1. opca akcija      `[data-testid="repair-entry"]` (cockpit, "Napravi plan popravka"),
 *   2. akcija nalaza    od Z34 "U planu ✓" / "Uključi u plan" na kartici nalaza (`[data-rl-toggle]`), pa ladica,
 *   3. akcija iz plana  `[data-repair-plan-go]` (od Z34 ladica plana, ista radnja kao plan Z8).
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
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('analysis-results')).toBeVisible();
}

/**
 * Baseline + zavrsne tvrdnje koje dijele sva tri ulaza.
 *
 * Od koraka B3 (2026-09-12) panel popravka vise ne zivi u sklopljenom bloku
 * `#resultCockpitAdvancedContent` kartice "Spremnost za predaju", nego u vlastitoj povrsini
 * `#repairView` (`rad/index.html`); ulazak vodi `enterRepairPhase` (`src/ui/repair-phase.ts`), koji
 * sakriva `#resultView` i otkriva `#repairView`. Isto jamstvo (sklopljeno prije, otkriveno poslije,
 * fokus unutar povrsine) sada se mjeri na novoj povrsini; uzor je vec preveden u
 * `tests/ux-dist/critical-path.spec.ts` i `tests/ux/repair-cta-opens-panel.spec.ts`.
 */
async function expectCollapsedBaseline(page: Page) {
  await expect(page.locator('#repairView'), 'povrsina popravka mora biti skrivena prije klika').toBeHidden();
  await expect(page.locator('#resultView'), 'nalaz mora biti vidljiv prije klika').toBeVisible();
}

async function expectWorkflowRevealed(page: Page) {
  await expect(page.locator('#repairView'), 'ulaz mora otvoriti povrsinu popravka').toBeVisible();
  await expect(page.locator('#resultView'), 'nalaz i popravak ne smiju biti vidljivi istovremeno').toBeHidden();
  const workflow = page.getByTestId('repair-workflow');
  await expect(workflow, 'panel popravka mora biti vidljiv').toBeVisible();
  await expect(workflow).toContainText(/poprav/i);
  // Fokus je unutar #repairView (panel ILI ciljani redak ledgera): ledger modal zivi u <body>
  // (ne u mountu), pa je za akciju konkretnog nalaza upravo njegov redak ispravno mjesto fokusa.
  const fokusUnutar = await page.evaluate(() => {
    const povrsina = document.getElementById('repairView');
    const ledger = document.querySelector('[data-lekta-repair-ledger-modal]:not(.hidden)');
    const a = document.activeElement;
    if (!a || a === document.body) return false;
    return (!!povrsina && povrsina.contains(a)) || (!!ledger && ledger.contains(a));
  });
  expect(fokusUnutar, 'fokus mora biti na vidljivoj kontroli unutar povrsine popravka ili ledgera').toBe(true);
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
    // Z34: kartica nalaza s automatskim zahvatom nosi "U planu ✓" / "Uključi u plan"; fixture ih ima.
    // Kad ih ne bi bilo, `karticaSaZahvatom` pada umjesto da put ostane nemjeren.
    await karticaSaZahvatom(page);
    const gumb = page.locator('#resultCockpit [data-rl-toggle]');
    const ruleIds = ((await gumb.getAttribute('data-rl-toggle')) ?? '').split(' ').filter(Boolean);
    expect(ruleIds.length, 'gumb nalaza mora nositi svoj zahvat').toBeGreaterThan(0);
    // Iskljuci pa ukljuci: odabir je sad KORISNIKOV, i bas taj zahvat mora stici u panel.
    await gumb.click();
    await expect(gumb).toHaveAttribute('aria-pressed', 'false');
    await gumb.click();
    await expect(gumb).toHaveAttribute('aria-pressed', 'true');
    await otvoriLadicu(page);
    await page.locator('[data-rl-tray] [data-repair-plan-go]').click();
    await expectWorkflowRevealed(page);
    const oznaceni = await page.evaluate((ids) => ids.map((id) => {
      const cb = document.querySelector<HTMLInputElement>(`.lekta-repair-panel__list li[data-rule-id="${id}"] input[type="checkbox"]`);
      return cb ? cb.checked : null;
    }), ruleIds);
    expect(oznaceni, 'zahvat nalaza mora biti oznacen u panelu').toEqual(ruleIds.map(() => true));
  });

  test('akcija iz plana (korektorski stol) vodi na isti panel', async ({ page }) => {
    await analyzeToResult(page);
    await expectCollapsedBaseline(page);
    const stol = page.locator('[data-desk-host]');
    await expect(stol, 'fixture mora imati korektorski stol; bez njega put kroz plan nije izmjeren').toHaveCount(1);
    // Z34: plan se salje iz ladice, koja se pojavi kad presuda izadje iz pogleda.
    await otvoriLadicu(page);
    const go = page.locator('[data-repair-plan-go]');
    await expect(go.first()).toBeVisible();
    await go.first().click();
    await expectWorkflowRevealed(page);
  });
});
