import { expect, test } from '@playwright/test';
import path from 'node:path';
import { cekajApp, cekajKorak } from './app-ready';
import { potvrdiProfil } from './confirm-profile';

/**
 * KOREKTORSKI STOL na ekranu rezultata.
 *
 * Brif vlasnika (2026-09-08): "Rezultat bi trebao biti pravi Korektorski stol. Vasa specifikacija
 * vec predvidja otprilike 58% sirine za dokument i 42% za nalaze. Digitalni korektor koji sjedi uz
 * tvoj Word. Ne dashboard, ne tablica provjera, ne score app. Klik na nalaz pomakne dokument. Klik
 * na oznaceno mjesto aktivira nalaz."
 *
 * ZASTO OVAJ SPEC POSTOJI, iako stol ima 36 jedinicnih testova: oni mjere ODLUKE (navigacija ne
 * omata, zastavica bez nalaza ne pomice nista), a ovaj mjeri RASPORED I SPOJ, dakle tocno ono sto
 * se u happy-domu ne moze dokazati. Omjer stupaca nema rasporeda u jedinicnom testu, a lijeni uvoz
 * faksimila ondje se nikad ne izvodi.
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function doRezultata(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(fixture);
  await cekajKorak(page, '2');
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });
}

test('stol dijeli ekran 58/42: dokument lijevo, jedan nalaz desno', async ({ page }) => {
  test.setTimeout(Number(process.env.LEKTA_DESK_TIMEOUT_MS ?? 300_000));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await doRezultata(page);

  const stol = page.locator('[data-desk]');
  await expect(stol).toBeVisible();

  const doc = await page.locator('[data-desk-doc]').boundingBox();
  const pane = await page.locator('[data-desk-pane]').boundingBox();
  expect(doc, 'dokument mora imati mjerljivu kutiju').toBeTruthy();
  expect(pane, 'ploca nalaza mora imati mjerljivu kutiju').toBeTruthy();

  // OMJER SE MJERI, ne pretpostavlja iz CSS-a. Gard nad samim CSS-om vec je jednom bio zelen dok je
  // preglednik crtao nesto drugo; mjerodavan je izracunati raspored.
  const udio = doc!.width / (doc!.width + pane!.width);
  expect(udio, `dokument zauzima ${(udio * 100).toFixed(1)}% sirine stola`).toBeGreaterThan(0.5);
  expect(udio).toBeLessThan(0.66);

  // Dokument je STVARNO iscrtan, ne samo rezerviran prostor.
  await expect(page.locator('[data-desk-doc] .lekta-facsimile')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-desk-doc] .desk-doc__cekanje')).toHaveCount(0);

  // DOKUMENT NE SMIJE BITI ODREZAN. Faksimil je pravi A4 (21 cm), a pano stola je uzi, pa se bez
  // uklapanja po sirini stranica rezala po desnom rubu i rijeci su se lomile nasred retka
  // ("...akademskog tel"). Dokument tada prestaje biti citljiv upravo u alatu koji sluzi citanju.
  //
  // ZASTO OVA TVRDNJA POSTOJI: kvar je prosao SVE ostale provjere. Faksimil je bio vidljiv, omjer
  // stupaca tocan, oba mjerena. Rez se vidio tek na snimci ekrana. Tvrdnja o postojanju elementa
  // ne mjeri je li sadrzaj upotrebljiv; ova mjeri.
  //
  // Izmjereno nakon popravka: pano 677 px, `scrollWidth` 684 px, dakle 1,01. Bez uklapanja je
  // stranica ~794 px u istom panu. Prag 1,05 propusta rub za scrollbar, a ne propusta rez.
  const prelijev = await page.evaluate(() => {
    const pano = document.querySelector('[data-desk-doc]') as HTMLElement | null;
    return pano ? pano.scrollWidth / pano.clientWidth : 0;
  });
  expect(prelijev, `dokument prelijeva pano za ${((prelijev - 1) * 100).toFixed(0)}%`).toBeLessThan(1.05);

  // JEDAN nalaz odjednom: stol ne smije biti popis kartica pod drugim imenom.
  await expect(page.locator('[data-desk-pane] [data-cockpit-finding]')).toHaveCount(1);
});

test('navigacija stolom mijenja nalaz i ne omata na kraju', async ({ page }) => {
  test.setTimeout(Number(process.env.LEKTA_DESK_TIMEOUT_MS ?? 300_000));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await doRezultata(page);

  const brojac = page.locator('[data-desk-count]');
  const prvi = await brojac.textContent();
  expect(prvi).toMatch(/^1 \/ \d+$/);

  // Prvi nalaz: "Prethodni" je ugasen, jer navigacija namjerno ne omata.
  await expect(page.locator('.desk-nav__btn--prev')).toBeDisabled();

  const naslovPrije = await page.locator('[data-desk-pane] h3').first().textContent();
  await page.locator('.desk-nav__btn--next').click();
  await expect(brojac).toHaveText(/^2 \/ \d+$/);
  const naslovPoslije = await page.locator('[data-desk-pane] h3').first().textContent();
  expect(naslovPoslije, 'drugi nalaz mora biti DRUGI, a ne isti pod novim brojem').not.toBe(naslovPrije);

  // Delegacija prezivi ponovno crtanje: drugi klik je onaj koji bi pao uz izravne slusace.
  await page.locator('.desk-nav__btn--next').click();
  await expect(brojac).toHaveText(/^3 \/ \d+$/);
  await expect(page.locator('.desk-nav__btn--prev')).toBeEnabled();
});

test('na uskom zaslonu stol NE crta dokument, umjesto da ga stisne', async ({ page }) => {
  test.setTimeout(Number(process.env.LEKTA_DESK_TIMEOUT_MS ?? 300_000));
  await page.setViewportSize({ width: 390, height: 844 });
  await doRezultata(page);

  // Raspored 58/42 na 390 px nema smisla: dokument bi dobio manje od sirine A4 stranice.
  await expect(page.locator('[data-desk-doc]')).toBeHidden();
  // A kad je skriven, faksimil se ne smije ni renderirati: to je najskuplji posao na uredaju s
  // najmanje memorije. Provjerava se ODSUTNOST iscrtanog dokumenta, ne samo nevidljivost.
  await expect(page.locator('[data-desk-doc] .lekta-facsimile')).toHaveCount(0);
  // Nalazi i navigacija ostaju: stol bez dokumenta je losiji stol, ali prazan ekran bio bi kvar.
  await expect(page.locator('[data-desk-pane] [data-cockpit-finding]')).toHaveCount(1);
  await expect(page.locator('[data-desk-count]')).toBeVisible();
});
