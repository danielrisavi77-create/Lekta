import { expect, test } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';
import { cekajMirovanjeSkrola } from './stabilan-skrol';

/**
 * MOBILNI REZULTAT PRVI (mobilni audit 2026-09-28, PR 1).
 *
 * Dva nalaza iz audita zive stranice na 390 px:
 *  1. Prvi ekran nakon provjere pokazivao je blok "Komentari mentora u dokumentu" s karticama, a sazetak rezultata
 *     tek na drugom ekranu. Sada je blok na uskom ekranu sklopljen u jedan redak, pa rezultat pocinje unutar
 *     prvog ekrana od vrha rezultata.
 *  2. Nakon "Pregledaj nalaze" list rezultata je izlazio ~18 px preko desnog ruba: nagib lista (.3deg) na listu
 *     visokom tisucama piksela. Na uskom ekranu list stoji ravno i ostaje unutar ekrana.
 *
 * Fixture nosi komentare mentora (T13), inace prvi nalaz ne bi imao sto dokazati.
 */
const fixture = path.resolve('tests/fixtures/docx/synthetic-mentor-komentari.docx');

test('mobitel: rezultat je na prvom ekranu, a list nakon nalaza ne izlazi preko ruba', async ({ page }) => {
  const vp = page.viewportSize();
  test.skip(!vp || vp.width > 720, 'mobilni raspored vrijedi do 720 px');
  test.setTimeout(Number(process.env.LEKTA_MOBILE_TIMEOUT_MS ?? 300_000));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/rad/');
  const odbij = page.locator('#analyticsDecline');
  if (await odbij.isVisible().catch(() => false)) await odbij.click();
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(fixture);
  await cekajKorak(page, '2');
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 240_000 });

  // Blok komentara mora biti prikazan, inace mjera razmaka ispod ne bi dokazivala nista.
  const blok = page.getByTestId('mentor-tasks');
  await expect(blok, 'fixture mora imati komentare mentora').toContainText('Komentari mentora u dokumentu (4)', { timeout: 30_000 });

  const cockpit = page.locator('#resultCockpit');
  await expect(cockpit).toBeVisible({ timeout: 30_000 });
  // Mjera ne ovisi o tome gdje je skrol stao: razmak od vrha rezultata do vrha cockpita, u dokumentu.
  const razmak = await page.evaluate(() => {
    const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().top + window.scrollY;
    return top('#resultCockpit') - top('#resultView');
  });
  expect(razmak, 'sazetak rezultata pocinje unutar prvog ekrana').toBeLessThan(vp!.height * 0.6);

  const komentari = blok.locator('details.mt');
  await expect(komentari, 'na uskom ekranu blok komentara je sklopljen').not.toHaveAttribute('open', /.*/);

  await page.locator('#resultCockpit [data-cockpit-action="open-findings"]').click();
  await cekajMirovanjeSkrola(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await cekajMirovanjeSkrola(page);
  const list = await page.locator('.analyzer-wrap').boundingBox();
  expect(list, 'list rezultata postoji').not.toBeNull();
  expect(list!.x, 'list ne izlazi preko lijevog ruba').toBeGreaterThanOrEqual(0);
  expect(list!.x + list!.width, 'list ne izlazi preko desnog ruba').toBeLessThanOrEqual(vp!.width + 0.5);
});
