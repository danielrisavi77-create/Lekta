import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';
import { karticaSaZahvatom, otvoriLadicu } from './result-live-ladica';

/**
 * T09 (plan razvoja): plan ispravaka je STVARNO upravljiv prikaz, i odabir u planu je isti odabir koji
 * panel drzi prije slanja (kontroler toka, T08). Od ALIGNMENT Z34 plan se slaze na kartici nalaza
 * ("U planu ✓" / "Uključi u plan"), a salje iz ladice plana (`[data-repair-plan-go]`,
 * `repair-plan-continue`). Tipkovnica radi, a na mobilnom je glavna radnja dostupna bez otvaranja
 * skrivenih detalja (spec se vrti i u `mobile-chromium`).
 *
 * Fixture `lo-fpzg-zavrsni-neuskladjen.docx` ima cetiri automatska zahvata (repair-real-corpus.json:
 * targeted 4), pa plan ima sigurne zahvate i ima sto iskljuciti.
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
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
}

const brojUPlanu = async (page: Page): Promise<number> =>
  Number(await page.locator('[data-rl-tray-n]').getAttribute('data-rl-tray-n'));

test.describe('T09: odabir u planu je odabir koji se salje', () => {
  test.setTimeout(300_000);

  test('iskljucen zahvat nestaje iz ladice, brojac pada, a panel dobiva isti odabir', async ({ page }) => {
    await analyzeToResult(page);
    await karticaSaZahvatom(page);
    await otvoriLadicu(page);
    const prije = await brojUPlanu(page);
    expect(prije, 'plan mora imati barem dva zahvata').toBeGreaterThanOrEqual(2);

    const gumb = page.locator('#resultCockpit [data-rl-toggle]');
    await expect(gumb).toHaveAttribute('aria-pressed', 'true');
    await gumb.click();
    await expect(gumb).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => brojUPlanu(page)).toBe(prije - 1);

    await page.getByTestId('repair-plan-continue').click();
    await expect(page.getByTestId('repair-workflow')).toBeVisible();
    // ISTI odabir prije slanja: panel ima tocno onoliko ukljucenih zahvata koliko je pisalo u ladici.
    const uPanelu = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLInputElement>('.lekta-repair-panel__list input[type="checkbox"][data-idx]')).filter((cb) => cb.checked).length);
    expect(uPanelu).toBe(prije - 1);
    // Ledger (vidljivi prikaz odabira) pokazuje isti broj.
    await expect(page.locator('.lekta-repair-trigger__price').first()).toContainText(`${prije - 1} od`);
  });

  test('tipkovnica: razmaknica mijenja odabir, Enter na ladici vodi na panel', async ({ page }) => {
    await analyzeToResult(page);
    await karticaSaZahvatom(page);
    const gumb = page.locator('#resultCockpit [data-rl-toggle]');
    await gumb.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#resultCockpit [data-rl-toggle]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#resultCockpit [data-rl-toggle]'), 'fokus ostaje na gumbu').toBeFocused();
    await otvoriLadicu(page);
    const nastavi = page.getByTestId('repair-plan-continue');
    await nastavi.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('repair-workflow')).toBeVisible();
  });

  test('iskljucivanje svih zahvata s kartica spusta ladicu tocno za njih; s nula je radnja onemogucena', async ({ page }) => {
    await analyzeToResult(page);
    await otvoriLadicu(page);
    const prije = await brojUPlanu(page);
    const nalaza = Number((await page.locator('[data-desk-count]').textContent())?.split(' od ')[1] ?? '0');
    // Zahvat koji nijedna kartica ne nosi (plan ga nudi, nalaz nije vezan) ostaje u planu: skup
    // iskljucenih se broji po `ruleId`, ne po kartici, jer dvije kartice mogu nositi isti zahvat.
    const iskljuceni = new Set<string>();
    for (let i = 0; i < nalaza; i += 1) {
      const gumb = page.locator('#resultCockpit [data-rl-toggle][aria-pressed="true"]');
      if (await gumb.count()) {
        ((await gumb.getAttribute('data-rl-toggle')) ?? '').split(' ').filter(Boolean).forEach((id) => iskljuceni.add(id));
        await gumb.click();
      }
      const dalje = page.locator('#resultCockpit .rl-card .desk-nav__btn--next');
      if (await dalje.isDisabled()) break;
      await dalje.click();
    }
    expect(iskljuceni.size, 'fixture mora imati zahvate na karticama').toBeGreaterThan(0);
    await otvoriLadicu(page);
    await expect.poll(() => brojUPlanu(page)).toBe(prije - iskljuceni.size);
    const ostalo = await brojUPlanu(page);
    if (ostalo === 0) {
      await expect(page.getByTestId('repair-plan-continue')).toBeDisabled();
      await expect(page.locator('[data-rl-tray-n]')).toHaveText('0 zahvata');
    } else {
      await expect(page.getByTestId('repair-plan-continue')).toBeEnabled();
      test.info().annotations.push({ type: 'zahvati bez kartice', description: `${ostalo} zahvat(a) plana nema karticu nalaza; nula je izmjerena u tests/result-live.test.ts` });
    }
  });
});
