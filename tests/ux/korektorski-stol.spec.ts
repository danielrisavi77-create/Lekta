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

  // JEDAN OTVOREN DETALJ, ali SVI nalazi vidljivi kao redci. To je sesta tocka brifa:
  // "Nalazi ne smiju izgledati kao 25 jednakih kartica... Odmah je vidljivo sto prvo, sto Lekta
  // moze rijesiti, sto mora student."
  const redci = page.locator('[data-desk-queue] .dq-item');
  expect(await redci.count(), 'popis mora pokazati SVE nalaze, ne samo otvoreni').toBeGreaterThan(3);
  await expect(page.locator('[data-desk-pane] [data-cockpit-finding]')).toHaveCount(1);
  await expect(page.locator('.dq-detalj')).toHaveCount(1);

  // OBJE OSI U RETKU: ozbiljnost lijevo, popravljivost desno. Bez druge osi popis ne odgovara na
  // "sto Lekta moze rijesiti", sto je pola onoga zbog cega je trazen.
  await expect(page.locator('[data-desk-queue] .dq-sev').first()).toBeVisible();
  expect(await page.locator('[data-desk-queue] .dq-fix').count()).toBeGreaterThan(0);

  // REDAK SE NE SMIJE PRELIJEVATI. Dug naslov nalaza bi bez `minmax(0,1fr)` izgurao oznaku AUTO
  // izvan panoa; isti razred kvara vec je uhvacen na `.rad-doc` i na samom dokumentu stola.
  const prelijevRetka = await page.evaluate(() => {
    const b = document.querySelector('[data-desk-queue] .dq-btn') as HTMLElement | null;
    return b ? b.scrollWidth / b.clientWidth : 0;
  });
  expect(prelijevRetka, `redak popisa prelijeva za ${((prelijevRetka - 1) * 100).toFixed(0)}%`).toBeLessThan(1.02);
});

test('klik na redak otvara SAMO njegov detalj', async ({ page }) => {
  test.setTimeout(Number(process.env.LEKTA_DESK_TIMEOUT_MS ?? 300_000));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await doRezultata(page);

  // Doslovno po brifu: "Kliknes 03 i samo se njegov detalj otvori."
  await page.locator('[data-desk-queue] [data-desk-go="2"]').click();
  await expect(page.locator('[data-desk-count]')).toHaveText(/^3 \/ \d+$/);
  await expect(page.locator('.dq-detalj')).toHaveCount(1);
  await expect(page.locator('[data-desk-queue] .dq-item--open [data-desk-go="2"]')).toHaveAttribute('aria-expanded', 'true');

  // Popis i navigacija su DVA nacina rada nad istim stanjem, ne dva stanja: nakon klika na redak
  // navigacija nastavlja odande, a ne od pocetka.
  await page.locator('.desk-nav__btn--next').click();
  await expect(page.locator('[data-desk-count]')).toHaveText(/^4 \/ \d+$/);
  await expect(page.locator('[data-desk-queue] .dq-item--open [data-desk-go="3"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.dq-detalj')).toHaveCount(1);
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

test('plan ispravaka je jedan klik od nalaza, i cita se kao plan rada', async ({ page }) => {
  /**
   * Sedma tocka: "Popravak ne smije biti feature koji se pronadje. Nalaz prirodno zavrsava u
   * popravku." Do 2026-09-08 je jedini ulaz bio CTA uz ocjenu koji vodi na panel skriven u kartici
   * "Spremnost za predaju"; kod je uz taj CTA sam pisao da ga "ni autor aplikacije nije nasao".
   */
  test.setTimeout(Number(process.env.LEKTA_DESK_TIMEOUT_MS ?? 300_000));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await doRezultata(page);

  await page.locator('[data-desk-plan-open]').click();
  await expect(page.locator('[data-repair-plan]')).toBeVisible({ timeout: 15_000 });

  // PLAN ZAMJENJUJE POPIS, ne stoji uz njega: dva pogleda na isti posao jedan ispod drugoga
  // trazila bi da korisnik dvaput procita iste stavke.
  await expect(page.locator('[data-desk-queue]')).toHaveCount(0);

  // Tri skupine, tri razlicita registra. Bez njih plan je opet popis kvacica.
  const naslovi = await page.locator('.rp-naslov').allTextContents();
  expect(naslovi).toContain('Sigurni zahvati');
  expect(naslovi).toContain('Ručno');

  // RUCNE STAVKE NEMAJU KVACICU. Prazna kvacica bi izgledala kao nesto sto se moze ukljuciti, a
  // Lekta to ne moze napraviti ni kad bi htjela.
  const rucniOkvir = page.locator('.rp-popis--rucno');
  await expect(rucniOkvir.locator('.rp-kvacica')).toHaveCount(0);
  expect(await rucniOkvir.locator('.rp-tocka').count()).toBeGreaterThan(0);

  // Povratak je uvijek ponudjen: plan je odluka, a odluka bez izlaza nije odluka.
  await page.locator('[data-desk-plan-close]').click();
  await expect(page.locator('[data-desk-queue]')).toHaveCount(1);
});
