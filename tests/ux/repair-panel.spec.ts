import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

// FER diplomski, prazni odlomci: profil ima wired repair-map fixere (font/margine/prored/format
// papira) + universal fixeri (toc-field/bibliography-repair/section-surgery/consistency-engine)
// koji su gotovo univerzalni za stvarne teze - dobar reprezentativan slucaj za "predugacak panel".
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function analyzeAndOpenSubmissionTab(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Bez ovoga `setWizardStep(3, true)` ide kroz View Transition, pa `#analyzeBtn` fizicki putuje
  // dok Playwright provjerava akcijabilnost ("element is not stable"). Klik se tada odgadja, a
  // analiza u medjuvremenu krene i gumb postane disabled + skriven, pa isti locator ceka do
  // timeouta. `withViewTransition` (src/ui/app.ts) prvo pita `motionReduced()`, pa reduced-motion
  // uklanja tranziciju u korijenu umjesto da je test ceka na srecu. Isti obrazac vec koriste
  // analyzer-hero-demo i free-tools-audit specovi.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#uploadCtaBtn').click();
  await page.locator('#fileInput').setInputFiles(fixture);
  await page.locator('#stepToAnalyze').click();
  // Korak 3 mora biti u DOM-u prije klika (isti barijerni obrazac kao roadmap-v2.spec.ts).
  await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '3');
  await expect(page.locator('#analyzeBtn')).toBeEnabled();
  await page.locator('#analyzeBtn').click();
  const confirm = page.locator('[data-confirm-profile]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  await page.locator('#resultDetailsToggle').click();
  await page.locator('#tabbtn-submission').click();
}

/**
 * JEDNA analiza za sve cetiri tvrdnje.
 *
 * Dosad je svaki test pokretao punu analizu stvarnog `.docx`-a, dakle cetiri puta isto stanje.
 * Uz mobilni projekt (koji je sada iskljucen, vidi `playwright.config.ts`) to je bilo osam analiza
 * za jedan jedini prikaz panela. Pod usporednim radnicima nad DEV posluziteljem to je i palo:
 * `#resultView` nije stigao unutar 90 s, bez ijedne navigacije, greske u konzoli ili pada workera,
 * dakle nije bio kvar nego natjecanje za isti stroj.
 *
 * Tvrdnje se ne mijenjaju: sve cetiri i dalje gledaju isti panel, samo ga ne grade iznova. Cijena
 * je serijski redoslijed (pad prvog preskace ostale), sto je za cetiri tvrdnje nad ISTIM stanjem
 * posten kompromis.
 */
test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await analyzeAndOpenSubmissionTab(page);
});

test.afterAll(async () => {
  await page?.close();
});

// Stanje modala je jedino sto testovi medjusobno mijenjaju, pa se vraca na nulu prije svakog.
// Escape je isti put kojim ih zatvara i korisnik; tri pokusaja pokrivaju najdublje ugnjezdjenje
// (ledger -> stavka), a tvrdnja na kraju ne dopusta da se tiho ude u test s otvorenim modalom.
test.beforeEach(async () => {
  for (let i = 0; i < 3 && (await page.locator('.modal-backdrop:not(.hidden)').count()); i++) {
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('.modal-backdrop:not(.hidden)')).toHaveCount(0);
});

test('repair panel: kompaktan ledger umjesto duge liste, bez obzira na mix stavki', async () => {
  const mount = page.locator('#repairPanelMount');
  await expect(mount.locator('.lekta-repair-trigger__btn')).toBeVisible();
  // Stara ravna lista ostaje u DOM-u (checkbox izvor istine) ali SKRIVENA - ledger je jedini
  // vidljivi prikaz, bez obzira ima li stavka literaturu/citate/sekcije i sl.
  await expect(mount.locator('.lekta-repair-panel__list')).toBeHidden();
  const visibleInteractive = await mount.locator('input, button, select, textarea').evaluateAll(
    (els) => els.filter((el) => el.getClientRects().length > 0).length,
  );
  expect(visibleInteractive).toBeLessThan(15);
});

test('repair panel: ledger modal ima focus-trap i Escape ga zatvara', async () => {
  await page.locator('#repairPanelMount .lekta-repair-trigger__btn').click();

  const ledger = page.locator('.modal-backdrop[data-lekta-repair-ledger-modal]');
  await expect(ledger).toBeVisible();
  // trapModal fokusira .modal-close (ili prvi fokusabilni) ~30ms nakon otvaranja.
  await expect(ledger.locator('.modal-close')).toBeFocused({ timeout: 1000 });

  await page.keyboard.press('Escape');
  await expect(ledger).toBeHidden();
});

test('repair panel: Tier A "Uredi..." zamijeni ledger jednim fokusiranim modalom, "Natrag" se vraca', async () => {
  await page.locator('#repairPanelMount .lekta-repair-trigger__btn').click();
  const ledger = page.locator('.modal-backdrop[data-lekta-repair-ledger-modal]');
  await expect(ledger).toBeVisible();

  const editButtons = ledger.locator('.lekta-repair-ledger-row-edit');
  const count = await editButtons.count();
  test.skip(count === 0, 'Ovaj fixture nema stavku s Tier A naprednom formom (literatura/citati/...).');

  await editButtons.first().click();
  // Zamijeni-ne-slazi: NIKAD dva otvorena modal-backdropa istovremeno. Stranica ima jos ~12
  // statickih modala (narudzba, povijest, QA...) - svi ostaju .hidden, pa ih iskljucujemo.
  await expect(page.locator('.modal-backdrop:not(.hidden)')).toHaveCount(1);
  const itemModal = page.locator('.modal-backdrop:not([data-lekta-repair-ledger-modal]):not(.hidden)');
  await expect(itemModal).toBeVisible();

  await itemModal.locator('.lekta-repair-ledger-back').click();
  await expect(itemModal).toHaveCount(0);
  await expect(ledger).toBeVisible();
});

test('repair panel: konsenzus checkbox daje jasnu povratnu informaciju umjesto tihog no-opa', async () => {
  const btn = page.locator('#repairPanelMount .lekta-repair-panel__download');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.locator('#repairPanelMount .lekta-repair-panel__consent-hint')).toBeVisible();
  await expect(page.locator('#repairPanelMount [data-repair-consent]')).toBeFocused();
});
