import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * TRAKA PRIVOLE NE PREKRIVA RADNJU NA MOBITELU (mobilni audit 2026-09-28, PR 3; odluka vlasnika 2026-10-03).
 *
 * Izmjereno na masteru 2026-10-03, korak 2 pri prvom posjetu: fiksna traka visoka 169 px; na 360x740 i 430x740
 * `elementFromPoint` u sredistu "Potvrdi profil i analiziraj" vracao je traku, ne gumb. Na uskom ekranu traka sada
 * stoji u toku stranice, na dnu sadrzaja. Izravni signali: polozaj trake je `static`, primarni gumb je na vrhu u
 * svom sredistu na prvom ekranu, rezerve ispod sadrzaja nema, a traka je dostizna na dnu i gumbi su mete od 44 px.
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function naVrhu(page: Page, sel: string): Promise<string> {
  return page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= window.innerHeight) return 'izvan ekrana';
    const y = Math.min(r.top + r.height / 2, window.innerHeight - 1);
    const vrh = document.elementFromPoint(r.left + r.width / 2, y);
    return vrh && (el === vrh || el.contains(vrh)) ? 'ok' : `prekriva ${vrh?.id || vrh?.className || vrh?.tagName}`;
  });
}

for (const [sirina, visina] of [[360, 740], [390, 844], [430, 740]] as const) {
  test(`mobitel ${sirina}x${visina}: traka privole u toku stranice ne prekriva "Potvrdi profil"`, async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
    test.setTimeout(Number(process.env.LEKTA_MOBILE_TIMEOUT_MS ?? 300_000));
    await page.setViewportSize({ width: sirina, height: visina });
    await page.goto('/rad/');
    await page.waitForSelector('#consentBanner:not(.hidden)');
    await cekajApp(page);
    await page.locator('#fileInput').setInputFiles(fixture);
    await cekajKorak(page, '2');
    await expect(page.locator('#analyzeBtn')).toBeVisible();

    expect(await page.locator('#consentBanner').evaluate((el) => getComputedStyle(el).position), 'traka je u toku stranice').toBe('static');
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom)), 'nema rezerve ispod sadrzaja').toBe(0);
    expect(await naVrhu(page, '#analyzeBtn'), 'primarni gumb na prvom ekranu').toBe('ok');

    // Traka je i dalje dostizna: na dnu stranice, gumbi su mete od barem 44 px i nista ih ne prekriva.
    await page.locator('#consentBanner').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior }));
    for (const gumb of ['#analyticsDecline', '#analyticsAccept']) {
      expect(await naVrhu(page, gumb), `${gumb} je dodirljiv`).toBe('ok');
      expect((await page.locator(gumb).boundingBox())!.height, `${gumb} je meta od 44 px`).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#analyticsDecline').click();
    await expect(page.locator('#consentBanner')).toHaveClass(/hidden/);
  });
}

test('alat na mobitelu: traka privole u toku stranice, bez rezerve, gumbi 44 px', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/citat.html');
  const traka = page.locator('.lekta-consent-banner.is-visible');
  await expect(traka).toBeVisible();
  expect(await traka.evaluate((el) => getComputedStyle(el).position), 'traka je u toku stranice').toBe('static');
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom)), 'nema rezerve ispod sadrzaja').toBe(0);
  expect(await naVrhu(page, '#copyBtn'), 'primarna radnja alata nije prekrivena trakom').not.toMatch(/lekta-consent/);
  for (const h of await traka.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    expect(h, 'gumb trake je meta od 44 px').toBeGreaterThanOrEqual(44);
  }
});
