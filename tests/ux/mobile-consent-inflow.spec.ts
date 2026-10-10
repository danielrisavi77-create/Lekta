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
 *
 * Codex runda na #305: povratni put "Postavke privatnosti" dovodi traku u vidokrug i fokusira prvu radnju (R1);
 * prag rezerve nema rupu izmedju 720 i 721 px za frakcijske sirine (R2); primarna radnja alata i gumbi trake
 * moraju biti stvarno pogodjeni, ne samo "ne prekriveni trakom" (R3).
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

/** Gumb je pogodjen u svom sredistu i meta je od barem 44 x 44 px. */
async function metaProblemi(page: Page, sel: string): Promise<string[]> {
  const out: string[] = [];
  const vrh = await naVrhu(page, sel);
  if (vrh !== 'ok') out.push(`${sel}: ${vrh}`);
  const okvir = (await page.locator(sel).boundingBox())!;
  if (okvir.width < 44 || okvir.height < 44) out.push(`${sel}: meta ${Math.round(okvir.width)}x${Math.round(okvir.height)} px`);
  return out;
}

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
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rad/');
    await page.waitForSelector('#consentBanner:not(.hidden)');
    await cekajApp(page);
    await page.locator('#fileInput').setInputFiles(fixture);
    await cekajKorak(page, '2');
    await expect(page.locator('#analyzeBtn')).toBeVisible();

    expect(await page.locator('#consentBanner').evaluate((el) => getComputedStyle(el).position), 'traka je u toku stranice').toBe('static');
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom)), 'nema rezerve ispod sadrzaja').toBe(0);
    await expect.poll(() => naVrhu(page, '#analyzeBtn'), { message: 'primarni gumb na prvom ekranu', timeout: 5_000 }).toBe('ok');

    // Traka je i dalje dostizna: na dnu stranice, gumbi su mete od barem 44 px i nista ih ne prekriva.
    await page.locator('#consentBanner').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior }));
    for (const gumb of ['#analyticsDecline', '#analyticsAccept']) {
      expect(await metaProblemi(page, gumb), `${gumb} je dodirljiv i meta od 44 x 44 px`).toEqual([]);
    }
    await page.locator('#analyticsDecline').click();
    await expect(page.locator('#consentBanner')).toHaveClass(/hidden/);
  });
}

test('alat na mobitelu: traka privole u toku stranice, bez rezerve, gumbi 44 px', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/citat.html');
  const traka = page.locator('.lekta-consent-banner.is-visible');
  await expect(traka).toBeVisible();
  expect(await traka.evaluate((el) => getComputedStyle(el).position), 'traka je u toku stranice').toBe('static');
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom)), 'nema rezerve ispod sadrzaja').toBe(0);
  // R3: nakon namjernog skrola primarna radnja mora biti pogodjena, ne samo "ne prekrivena trakom".
  await page.locator('#copyBtn').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }));
  await expect.poll(() => naVrhu(page, '#copyBtn'), { message: 'primarna radnja alata je pogodjena', timeout: 5_000 }).toBe('ok');
  await traka.evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior }));
  const gumbi = await traka.locator('button').count();
  expect(gumbi, 'traka ima gumbe').toBeGreaterThan(0);
  for (let i = 0; i < gumbi; i++) {
    expect(await metaProblemi(page, `.lekta-consent-banner.is-visible button >> nth=${i}`), 'gumb trake je pogodjen i meta od 44 x 44 px').toEqual([]);
  }
});

test('mobitel 360x740: "Postavke privatnosti" nakon odluke dovodi traku u vidokrug i fokusira je (Codex R1)', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
  test.setTimeout(Number(process.env.LEKTA_MOBILE_TIMEOUT_MS ?? 300_000));
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/rad/');
  await page.waitForSelector('#consentBanner:not(.hidden)');
  await cekajApp(page);
  // Ranija odluka korisnika: pristanak je spremljen, nakon ponovnog ucitavanja traka je skrivena.
  await page.locator('#analyticsAccept').click();
  await expect(page.locator('#consentBanner')).toHaveClass(/hidden/);
  await page.reload();
  await cekajApp(page);
  await expect(page.locator('#consentBanner')).toHaveClass(/hidden/);

  await page.locator('#privacySettingsBtn').click();
  await expect(page.locator('#consentBanner')).not.toHaveClass(/hidden/);
  await expect.poll(() => page.locator('#consentBanner').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight + 0.5;
  }), { message: 'traka je cijela u vidokrugu nakon klika', timeout: 5_000 }).toBe(true);
  await expect(page.locator('#analyticsDecline'), 'prva radnja trake ima fokus').toBeFocused();
});

/**
 * R2: stanje trake na granici, alat u iframeu zadane sirine: do 720 px u toku bez rezerve, iznad fiksna s rezervom.
 * Frakcijsku sirinu Chromium ne daje (iframe od 720,5 px izmjeren je kao 721, 2026-10-05), pa 720,5 px pokriva
 * izracun kaskade nad stvarnim listovima u gate-mutations (`consentThresholdProblems`).
 */
test('alat: prag trake privole na 720 / 721 px (Codex R2)', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'iframe sirina se postavlja izravno; jedan projekt je dovoljan');
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/citat.html');
  for (const sirina of [720, 721]) {
    const stanje = await page.evaluate(async (w) => {
      document.querySelector('#r2-okvir')?.remove();
      const f = document.createElement('iframe');
      f.id = 'r2-okvir';
      f.style.cssText = `width:${w}px;height:740px;border:0;position:absolute;top:0;left:0`;
      document.body.append(f);
      await new Promise<void>((r) => { f.onload = () => r(); f.src = '/citat.html'; });
      const win = f.contentWindow!;
      const doc = f.contentDocument!;
      for (let i = 0; i < 100 && !doc.querySelector('.lekta-consent-banner.is-visible'); i++) await new Promise((r) => setTimeout(r, 50));
      const traka = doc.querySelector('.lekta-consent-banner.is-visible');
      return {
        sirina: doc.documentElement.getBoundingClientRect().width,
        polozaj: traka ? win.getComputedStyle(traka).position : 'nema trake',
        rezerva: parseFloat(win.getComputedStyle(doc.body).paddingBottom),
      };
    }, sirina);
    expect(stanje.sirina, `${sirina} px: iframe ima trazenu sirinu`).toBeCloseTo(sirina, 1);
    if (sirina <= 720) {
      expect([stanje.polozaj, stanje.rezerva], `${sirina} px: traka u toku, bez rezerve`).toEqual(['static', 0]);
    } else {
      expect(stanje.polozaj, `${sirina} px: traka je fiksna`).toBe('fixed');
      expect(stanje.rezerva, `${sirina} px: fiksna traka ima rezervu ispod sadrzaja`).toBeGreaterThan(0);
    }
  }
});
