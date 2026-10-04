import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';
import { cekajMirovanjeSkrola } from './stabilan-skrol';

/**
 * MOBILNI REZULTAT PRVI (mobilni audit 2026-09-28, PR 1).
 *
 * Dva nalaza iz audita zive stranice na 390 px:
 *  1. Prvi ekran nakon provjere pokazivao je blok "Komentari mentora u dokumentu" s karticama, a sazetak rezultata
 *     tek na drugom ekranu. Sada je blok na uskom ekranu sklopljen u jedan redak.
 *  2. Nakon "Pregledaj nalaze" list rezultata je izlazio ~18 px preko desnog ruba: nagib lista (.3deg) na listu
 *     visokom tisucama piksela. Na uskom ekranu list stoji ravno i ostaje unutar ekrana.
 *
 * Mjere su u stvarnom viewportu od 360 px, ne u dokumentu ni u tekstu CSS-a (Codex F2 do F5 na #235): vrh
 * cockpita nakon smirivanja skrola, izracunati `transform` lista, okviri potomaka lista te `scrollX` i polozaj
 * nalaza odmah nakon skoka, bez vracanja skrola. Fixture nosi komentare mentora (T13), inace prvi nalaz ne bi
 * imao sto dokazati.
 */
const fixture = path.resolve('tests/fixtures/docx/synthetic-mentor-komentari.docx');
const SIRINA = 360;

async function analiziraj(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/rad/');
  const odbij = page.locator('#analyticsDecline');
  if (await odbij.isVisible().catch(() => false)) await odbij.click();
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(fixture);
  await cekajKorak(page, '2');
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId('mentor-tasks'), 'fixture mora imati komentare mentora')
    .toContainText('Komentari mentora u dokumentu (4)', { timeout: 30_000 });
  await expect(page.locator('#resultCockpit')).toBeVisible({ timeout: 30_000 });
}

/** Opisi potomaka lista koji izlaze preko ruba viewporta, osim onih unutar vlastitog spremnika s pomicanjem. */
async function izvanEkrana(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const out: string[] = [];
    const uSpremniku = (el: Element) => {
      for (let p = el.parentElement; p && !p.classList.contains('analyzer-wrap'); p = p.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('.analyzer-wrap, .analyzer-wrap *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || uSpremniku(el)) continue;
      if (r.left < -0.5 || r.right > w + 0.5) out.push(`${el.tagName}.${(el as HTMLElement).className} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return out.slice(0, 5);
  });
}

test('mobitel: rezultat je na prvom ekranu, a list nakon nalaza ne izlazi preko ruba', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
  test.setTimeout(Number(process.env.LEKTA_MOBILE_TIMEOUT_MS ?? 300_000));
  await page.setViewportSize({ width: SIRINA, height: 740 });
  await analiziraj(page);
  await cekajMirovanjeSkrola(page);

  // F2: vrh cockpita u stvarnom viewportu, gdje god je skrol stao nakon provjere.
  const vrh = await page.locator('#resultCockpit').evaluate((el) => ({ top: el.getBoundingClientRect().top, h: window.innerHeight }));
  expect(vrh.top, 'cockpit nije iznad vrha ekrana').toBeGreaterThanOrEqual(0);
  expect(vrh.top, 'sazetak rezultata pocinje unutar prvog ekrana').toBeLessThan(vrh.h * 0.6);
  await expect(page.getByTestId('mentor-tasks').locator('details.mt'), 'na uskom ekranu blok komentara je sklopljen')
    .not.toHaveAttribute('open', /.*/);

  // F5: izracunati stil, ne tekst pravila; kasnije jace pravilo s nagibom pada ovdje.
  expect(await page.locator('.analyzer-wrap').evaluate((el) => getComputedStyle(el).transform), 'list stoji ravno').toBe('none');

  // F4: otvoren komentar s nizom od 200 znakova bez razmaka ne smije siriti list ni stranicu.
  await page.getByTestId('mentor-tasks').locator('summary.mt-kicker').click();
  await page.locator('.mt-tekst').first().evaluate((el) => { el.append(` ${'x'.repeat(200)}`); });
  expect(await izvanEkrana(page), 'otvoren komentar s dugim nizom: nista ne izlazi preko ruba').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'stranica nema vodoravni preljev').toBeLessThanOrEqual(SIRINA);
  await page.getByTestId('mentor-tasks').locator('summary.mt-kicker').click();

  // F3: odmah nakon skoka na nalaze, bez vracanja skrola.
  // Skok je gladak (oko 1 s, i uz smanjeni pokret, Codex F7 je zaseban zahvat) i krece kadar nakon klika, pa
  // mirovanje skrola samo po sebi moze proci prije pocetka. Cekamo stanje: nalazi stignu u vidno polje.
  await page.locator('#resultCockpit [data-cockpit-action="open-findings"]').click();
  await expect.poll(() => page.locator('#issuesList').evaluate((el) => el.getBoundingClientRect().top), {
    message: 'skok dovodi nalaze u vidno polje', timeout: 10_000,
  }).toBeLessThan(100);
  await cekajMirovanjeSkrola(page);
  expect(await page.evaluate(() => window.scrollX), 'skok na nalaze ne pomice stranicu vodoravno').toBe(0);
  const nalazi = await page.locator('#issuesList').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, w: window.innerWidth, h: window.innerHeight };
  });
  expect(nalazi.top, 'nalazi su u vidnom polju nakon skoka').toBeLessThan(nalazi.h);
  expect(nalazi.left, 'nalazi ne izlaze preko lijevog ruba').toBeGreaterThanOrEqual(-0.5);
  expect(nalazi.right, 'nalazi ne izlaze preko desnog ruba').toBeLessThanOrEqual(nalazi.w + 0.5);
  const list = await page.locator('.analyzer-wrap').boundingBox();
  expect(list, 'list rezultata postoji').not.toBeNull();
  expect(list!.x, 'list ne izlazi preko lijevog ruba').toBeGreaterThanOrEqual(-0.5);
  expect(list!.x + list!.width, 'list ne izlazi preko desnog ruba').toBeLessThanOrEqual(SIRINA + 0.5);
  expect(await izvanEkrana(page), 'nakon skoka nista u listu ne izlazi preko ruba').toEqual([]);
});

test('mobitel: rezultat otvoren na sirokom ekranu pa suzen sklapa blok komentara (Codex F6)', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
  test.setTimeout(Number(process.env.LEKTA_MOBILE_TIMEOUT_MS ?? 300_000));
  await page.setViewportSize({ width: 1024, height: 800 });
  await analiziraj(page);
  const blok = page.getByTestId('mentor-tasks').locator('details.mt');
  await expect(blok, 'na sirokom ekranu blok je otvoren').toHaveAttribute('open', /.*/);

  // Codex D1 (runda 2 na #235): `<details>` i lomljenje dugog komentara namjerno vrijede na svim sirinama. Na
  // 1024 px naslov je meta od 44 px, a komentar s dugim URL-om ne izlazi preko ruba. Snimka ide u izvjestaj.
  const naslov = await blok.locator('summary.mt-kicker').boundingBox();
  expect(naslov?.height ?? 0, 'siroki ekran: naslov bloka je meta od najmanje 44 px').toBeGreaterThanOrEqual(44);
  await page.locator('.mt-tekst').first().evaluate((el) => { el.append(` https://example.org/${'dugisegment'.repeat(30)}`); });
  expect(await izvanEkrana(page), 'siroki ekran: komentar s dugim URL-om ne izlazi preko ruba ekrana').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'siroki ekran: bez vodoravnog preljeva').toBeLessThanOrEqual(1024);
  await test.info().attach('komentari-mentora-1024', { body: await blok.screenshot(), contentType: 'image/png' });

  await page.setViewportSize({ width: SIRINA, height: 740 });
  await expect(blok, 'suzeno na mobitel: blok se sklopi').not.toHaveAttribute('open', /.*/);
});
