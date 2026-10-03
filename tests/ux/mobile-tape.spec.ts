import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';
import { cekajMirovanjeSkrola } from './stabilan-skrol';

/**
 * TRAKA NE PREKRIVA KORAKE (mobilni audit 2026-09-28, PR 2).
 *
 * Ukrasna traka lista (`.analyzer-wrap::before`, 150 px na sredini lista) na 360 do 430 px pada na traku koraka:
 * prekriva kraj natpisa "Dokument" i kruzice koraka 2 i 3 (na uskom ekranu vidljiv je samo natpis aktivnog koraka).
 * Izravni signal: mreza tocaka svaka 3 px preko cijelog vidljivog `.rail-step` (kruzic i natpis); u svakoj tocki
 * element na vrhu mora biti sam korak. Traku nosi `.analyzer-wrap`, pa `elementFromPoint` ondje vraca list.
 * Sredisnja tocka natpisa nije dovoljna: na masteru je preklapanje samo uz rub natpisa (izmjereno 2026-10-03).
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function prekriveniKoraci(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const korak of document.querySelectorAll<HTMLElement>('.wizard-rail .rail-step')) {
      const r = korak.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
      let prekriveno = 0;
      let vrh = '';
      for (let x = r.left + 1; x < r.right - 1; x += 3) {
        for (let y = r.top + 1; y < r.bottom - 1; y += 3) {
          const el = document.elementFromPoint(x, y);
          if (el && !korak.contains(el)) { prekriveno += 1; vrh = String((el as HTMLElement).className || el.tagName); }
        }
      }
      if (prekriveno) out.push(`${korak.textContent?.trim()}: ${prekriveno} tocaka (na vrhu: ${vrh})`);
    }
    return out;
  });
}

async function traka(page: Page): Promise<void> {
  await page.locator('.wizard-rail').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }));
  await cekajMirovanjeSkrola(page);
  const vidljivi = await page.locator('.wizard-rail .rail-step').evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().width > 0).length);
  expect(vidljivi, 'barem dva koraka moraju biti vidljiva, inace mjera ne dokazuje nista').toBeGreaterThan(1);
}

test('mobitel: ukrasna traka ne prekriva korake', async ({ page }) => {
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

  for (const sirina of [360, 390, 430]) {
    await page.setViewportSize({ width: sirina, height: 800 });
    await traka(page);
    expect(await prekriveniKoraci(page), `korak 2, ${sirina} px: koraci nisu prekriveni`).toEqual([]);
  }

  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 240_000 });
  await traka(page);
  expect(await prekriveniKoraci(page), 'rezultat, 430 px: koraci nisu prekriveni').toEqual([]);
});

/**
 * ZBIJENO ZAGLAVLJE RADNOG PROSTORA (mobilni audit 2026-09-28, PR 2; odluka vlasnika 2026-10-03: zbijen redak).
 * Izmjereno na masteru 2026-10-03, 390 px, rezultat: dokumentov red (`#radDocMeta`) zauzimao je 85 px u dva retka,
 * a list je pocinjao na 174 px. Signali: list pocinje do 150 px, "Spremljeno" i znacka "Lokalno" su u istom retku,
 * gumb nove verzije je dodirljiv u pojasu od 44 px, a stranica nema vodoravni preljev.
 */
for (const sirina of [360, 390, 430]) {
  test(`mobitel ${sirina} px: dokumentov red je zbijen, gumb nove verzije je meta od 44 px`, async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
    test.setTimeout(Number(process.env.LEKTA_MOBILE_TIMEOUT_MS ?? 300_000));
    await page.setViewportSize({ width: sirina, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rad/');
    const odbij = page.locator('#analyticsDecline');
    if (await odbij.isVisible().catch(() => false)) await odbij.click();
    await cekajApp(page);
    await page.locator('#fileInput').setInputFiles(fixture);
    await cekajKorak(page, '2');
    await potvrdiProfil(page);
    await expect(page.locator('#resultView')).toBeVisible({ timeout: 240_000 });
    await expect(page.locator('#radDocSave')).toBeVisible();
    await expect(page.locator('#radDocNewVersion')).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
    await cekajMirovanjeSkrola(page);

    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const b = r('#radDocNewVersion');
      const c = b.top + b.height / 2;
      const pogodci = [-21.5, -15, 0, 15, 21.5].map((d) => {
        const e = document.elementFromPoint(b.left + 20, c + d);
        return !!e && !!e.closest('#radDocNewVersion');
      });
      return {
        list: r('.analyzer-wrap').top,
        isti: Math.abs(r('#radDocSave').top - r('#radDocMeta .local-badge').top) < 6,
        pogodci,
        sw: document.documentElement.scrollWidth,
      };
    });
    expect(m.list, 'list pocinje unutar 150 px od vrha').toBeLessThan(150);
    expect(m.isti, '"Spremljeno" i znacka "Lokalno" u istom retku').toBe(true);
    expect(m.pogodci, 'gumb nove verzije pogodjen u pojasu od 44 px').toEqual([true, true, true, true, true]);
    expect(m.sw, 'stranica nema vodoravni preljev').toBeLessThanOrEqual(sirina);
  });
}
