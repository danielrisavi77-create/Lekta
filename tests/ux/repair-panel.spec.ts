import { expect, test } from '@playwright/test';
import path from 'node:path';

// FER diplomski, prazni odlomci: profil ima wired repair-map fixere (font/margine/prored/format
// papira) + universal fixeri (toc-field/bibliography-repair/section-surgery/consistency-engine)
// koji su gotovo univerzalni za stvarne teze - dobar reprezentativan slucaj za "predugacak panel".
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function analyzeAndOpenSubmissionTab(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.locator('#uploadCtaBtn').click();
  await page.locator('#fileInput').setInputFiles(fixture);
  await page.locator('#stepToAnalyze').click();
  await page.locator('#analyzeBtn').click();
  const confirm = page.locator('[data-confirm-profile]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  await page.locator('#resultDetailsToggle').click();
  await page.locator('#tabbtn-submission').click();
}

test('repair panel: kompaktan ledger umjesto duge liste, bez obzira na mix stavki', async ({ page }) => {
  await analyzeAndOpenSubmissionTab(page);

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

test('repair panel: ledger modal ima focus-trap i Escape ga zatvara', async ({ page }) => {
  await analyzeAndOpenSubmissionTab(page);
  await page.locator('#repairPanelMount .lekta-repair-trigger__btn').click();

  const ledger = page.locator('.modal-backdrop[data-lekta-repair-ledger-modal]');
  await expect(ledger).toBeVisible();
  // trapModal fokusira .modal-close (ili prvi fokusabilni) ~30ms nakon otvaranja.
  await expect(ledger.locator('.modal-close')).toBeFocused({ timeout: 1000 });

  await page.keyboard.press('Escape');
  await expect(ledger).toBeHidden();
});

test('repair panel: Tier A "Uredi..." zamijeni ledger jednim fokusiranim modalom, "Natrag" se vraca', async ({ page }) => {
  await analyzeAndOpenSubmissionTab(page);
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

test('repair panel: konsenzus checkbox daje jasnu povratnu informaciju umjesto tihog no-opa', async ({ page }) => {
  await analyzeAndOpenSubmissionTab(page);
  const btn = page.locator('#repairPanelMount .lekta-repair-panel__download');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.locator('#repairPanelMount .lekta-repair-panel__consent-hint')).toBeVisible();
  await expect(page.locator('#repairPanelMount [data-repair-consent]')).toBeFocused();
});
