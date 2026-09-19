import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * T09 (plan razvoja): plan ispravaka je STVARNO upravljiv prikaz. Kvacice su pravi checkboxovi vezani na jedan
 * `ruleId`; odabir u planu je isti odabir koji panel drzi prije slanja (kontroler toka, T08). Tipkovnica radi, a na
 * mobilnom je glavna radnja dostupna bez otvaranja skrivenih detalja (spec se vrti i u `mobile-chromium`).
 *
 * Fixture `lo-fpzg-zavrsni-neuskladjen.docx` ima cetiri automatska zahvata (repair-real-corpus.json: targeted 4), pa plan ima
 * "Sigurne zahvate" i ima sto iskljuciti.
 */
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
  await expect(page.locator('#analyzeBtn')).toBeEnabled();
  await page.locator('#analyzeBtn').click();
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
}

async function openPlan(page: Page) {
  await expect(page.locator('[data-desk-host]'), 'fixture mora imati korektorski stol').toHaveCount(1);
  const otvori = page.locator('[data-desk-plan-open]');
  if ((await otvori.count()) > 0) await otvori.first().click();
  await expect(page.locator('[data-repair-plan]')).toBeVisible();
}

test.describe('T09: odabir u planu je odabir koji se salje', () => {
  test.setTimeout(300_000);

  test('iskljucen zahvat nestaje iz sazetka, brojac pada, a panel dobiva isti odabir', async ({ page }) => {
    await analyzeToResult(page);
    await openPlan(page);
    const kutije = page.locator('[data-repair-plan-item]');
    const n = await kutije.count();
    expect(n, 'plan mora imati barem dva zahvata s kontrolom').toBeGreaterThanOrEqual(2);
    const prva = kutije.first();
    const ruleId = await prva.getAttribute('data-repair-plan-item');
    const label = (await page.locator(`label[for="${await prva.getAttribute('id')}"]`).textContent())?.trim() ?? '';
    expect(label.length).toBeGreaterThan(0);
    await expect(prva).toBeChecked();
    const brojacPrije = Number(await page.locator('[data-repair-plan-count]').getAttribute('data-repair-plan-count'));

    // Pravi checkbox, dostupan kao role=checkbox s imenom iz labela.
    await page.getByRole('checkbox', { name: label }).uncheck();
    await expect(page.locator('[data-repair-plan-count]')).toHaveAttribute('data-repair-plan-count', String(brojacPrije - 1));
    await expect(page.getByTestId('repair-selected-summary')).not.toContainText(label);

    await page.getByTestId('repair-plan-continue').click();
    await expect(page.getByTestId('repair-workflow')).toBeVisible();
    // ISTI odabir prije slanja: skriveni checkbox tog zahvata u panelu je iskljucen, ostali ukljuceni.
    const uPanelu = await page.evaluate((rid) => {
      const rows = Array.from(document.querySelectorAll<HTMLInputElement>('.lekta-repair-panel__list input[type="checkbox"][data-idx]'));
      const byRule = (r: string) => rows.find((cb) => cb.closest('li')?.getAttribute('data-rule-id') === r);
      return { target: byRule(rid)?.checked ?? null, ukupno: rows.length, ukljuceno: rows.filter((cb) => cb.checked).length };
    }, ruleId);
    expect(uPanelu.target, 'iskljuceni zahvat mora ostati iskljucen u panelu').toBe(false);
    expect(uPanelu.ukljuceno).toBe(brojacPrije - 1);
    // Ledger (vidljivi prikaz odabira) pokazuje isti broj.
    await expect(page.locator('.lekta-repair-trigger__price').first()).toContainText(`${brojacPrije - 1} od`);
  });

  test('tipkovnica: razmaknica mijenja odabir, Enter na "Izradi" vodi na panel', async ({ page }) => {
    await analyzeToResult(page);
    await openPlan(page);
    const prva = page.locator('[data-repair-plan-item]').first();
    await prva.focus();
    await page.keyboard.press('Space');
    await expect(prva).not.toBeChecked();
    const nastavi = page.getByTestId('repair-plan-continue');
    await nastavi.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('repair-workflow')).toBeVisible();
  });

  test('bez ijednog zahvata glavna radnja je onemogucena, bez privida', async ({ page }) => {
    await analyzeToResult(page);
    await openPlan(page);
    const kutije = page.locator('[data-repair-plan-item]');
    const n = await kutije.count();
    for (let i = 0; i < n; i += 1) await kutije.nth(i).uncheck();
    await expect(page.getByTestId('repair-plan-continue')).toBeDisabled();
    await expect(page.getByTestId('repair-selected-summary')).toContainText('Nijedan zahvat nije odabran');
  });
});
