import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * T12 (plan razvoja): "Ucitaj novu verziju ovog rada" i prikaz napretka.
 *
 * Tok: analiza prve verzije (neuskladjen rad) -> nova verzija ISTOG rada (ista fixture nakon zadanog popravka, dakle
 * ista naslovnica i isti detektirani profil) -> sazetak razlike s odvojenim skupinama (rijeseno / novi problemi /
 * neizvjesno). Identitet se ne izvodi iz imena datoteke: dvije fixture imaju razlicita imena, a isti naslov i
 * poglavlja, pa se povezuju bez pitanja. Kad nova verzija ima blokator, sazetak NE pise "Spremno za predaju".
 *
 * `lo-fpzg-zavrsni-uskladjen.docx` NIJE upotrebljiv kao druga verzija: ima drugu naslovnicu pa detekcija daje drugi
 * profil, a tada usporedba ispravno kaze "profil je promijenjen" (to je zaseban, takodjer ispravan ishod).
 */
const prva = path.resolve('tests/fixtures/docx/lo-fpzg-zavrsni-neuskladjen.docx');
const druga = path.resolve('tests/fixtures/docx/synthetic-fpzg-zavrsni-verzija-2.docx');

async function analyze(page: Page, fixture: string, prviPut: boolean) {
  if (prviPut) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rad/');
    const odbij = page.locator('#analyticsDecline');
    if (await odbij.isVisible().catch(() => false)) {
      await odbij.click();
      await expect(page.locator('#consentBanner')).toBeHidden();
    }
    await cekajApp(page);
    await page.locator('#fileInput').setInputFiles(fixture);
  } else {
    // Radnja iz trake dokumenta: skriveni <input type=file> prima novu verziju.
    await expect(page.getByTestId('load-new-version')).toBeVisible();
    await page.locator('#radDocNewVersionInput').setInputFiles(fixture);
  }
  await cekajKorak(page, '2');
  // Kad kartica potvrde vec stoji, #analyzeBtn je iza nje i klik istekne; potvrdiProfil() ispod CEKA karticu, pa
  // se potvrda ne ocitava trenutnim stanjem (ux-tok-gard: to je utrka).
  await page.locator('#analyzeBtn').click({ timeout: 5_000 }).catch(() => {});
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });
}

test.describe('T12: nova verzija rada i usporedba nalaza', () => {
  test.setTimeout(400_000);

  test('nova verzija istog rada daje sazetak s odvojenim skupinama; radnja je vidljiva tek uz dokument', async ({ page }) => {
    await page.goto('/rad/');
    await cekajApp(page);
    await expect(page.getByTestId('load-new-version'), 'bez dokumenta nema s cime usporedjivati').toBeHidden();

    await analyze(page, prva, true);
    await expect(page.getByTestId('revision-summary'), 'prva analiza nema prethodne verzije').toBeHidden();
    await expect(page.getByTestId('load-new-version')).toBeVisible();

    await analyze(page, druga, false);
    const summary = page.getByTestId('revision-summary');
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(summary).toContainText('Riješeno');
    await expect(summary).toContainText('Novi problemi');
    await expect(summary).toContainText('Neizvjesno');
    await expect(summary).not.toContainText('Spremno za predaju');
    // Isti rad, drugo ime datoteke: povezano bez pitanja (identitet iz naslova i poglavlja, ne iz imena).
    await expect(summary.locator('[data-revision-link]')).toHaveCount(0);
    await expect(summary.locator('[data-revision-comparable="da"]')).toHaveCount(1);
    const rijeseno = Number(await summary.locator('[data-revision-comparable]').getAttribute('data-revision-resolved'));
    expect(rijeseno, 'popravljena verzija mora rijesiti barem jedan nalaz neuskladjene').toBeGreaterThan(0);
  });

  test('drugi rad se ne spaja automatski: trazi se potvrda, "Ne" ostavlja sazetak skrivenim', async ({ page }) => {
    await analyze(page, prva, true);
    // Sasvim drugi rad: FER fixture (drugi naslov, autor i poglavlja).
    await analyze(page, path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx'), false);
    const summary = page.getByTestId('revision-summary');
    await expect(summary).toBeVisible({ timeout: 30_000 });
    const prompt = summary.locator('[data-revision-link]');
    await expect(prompt, 'razlicit ili slab identitet trazi odluku korisnika').toHaveCount(1);
    await summary.locator('[data-revision-link-no]').click();
    await expect(summary).toBeHidden();
  });
});
