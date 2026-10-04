import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { cekajApp, cekajKorak } from './app-ready';
import { potvrdiProfil } from './confirm-profile';
import { otvoriLadicu, sljedecaKartica } from './result-live-ladica';

/**
 * KOREKTORSKI STOL na ekranu rezultata, od ALIGNMENT Z34 ("Rezultat: sve u jednom").
 *
 * Brif vlasnika (2026-09-08): "Digitalni korektor koji sjedi uz tvoj Word. Ne dashboard, ne tablica
 * provjera, ne score app. Klik na nalaz pomakne dokument." Z34 je taj stol preoblikovao: lijevo
 * stranica rada (sticky), desno hrpa kartica s jezicima kategorija, ispod traka stranica, a plan se
 * slaze na samoj kartici ("U planu ✓") i salje iz ladice. Stol Z8 (faksimil, red cekanja, plan u
 * panou) ostaje samo za stanje `clear`.
 *
 * ZASTO OVAJ SPEC POSTOJI uz `tests/result-live.test.ts`: jedinicni testovi mjere ODLUKE (filtar,
 * navigacija ne omata, strop ne ovisi o planu), a ovaj RASPORED I SPOJ, dakle ono sto se u
 * happy-domu ne moze dokazati: omjer stupaca, sticky stranica, lijeni uvoz modula, slijetanje u panel.
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function doRezultata(page: Page): Promise<void> {
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(fixture);
  await cekajKorak(page, '2');
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#resultCockpit')).toHaveAttribute('data-rl-ready', 'true', { timeout: 30_000 });
}

const rok = (): number => Number(process.env.LEKTA_DESK_TIMEOUT_MS ?? 300_000);

test('stol: stranica rada lijevo i sticky, jedna kartica desno', async ({ page }) => {
  test.setTimeout(rok());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await doRezultata(page);

  const stranica = await page.locator('[data-rl-pagewrap]').boundingBox();
  const hrpa = await page.locator('[data-rl-stack]').boundingBox();
  expect(stranica, 'stranica mora imati mjerljivu kutiju').toBeTruthy();
  expect(hrpa, 'hrpa kartica mora imati mjerljivu kutiju').toBeTruthy();
  expect(stranica!.x + stranica!.width, 'stranica stoji lijevo od kartica').toBeLessThanOrEqual(hrpa!.x + 1);

  // OMJER SE MJERI, ne pretpostavlja iz CSS-a (predlozak: 1,15fr / 1fr).
  const udio = stranica!.width / (stranica!.width + hrpa!.width);
  expect(udio, `stranica zauzima ${(udio * 100).toFixed(1)}% sirine stola`).toBeGreaterThan(0.45);
  expect(udio).toBeLessThan(0.62);
  expect(await page.locator('[data-rl-pagewrap]').evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

  // Stranica je STVARNO iscrtana tekstom rada, ne samo rezerviran prostor.
  expect(await page.locator('[data-rl-text="now"] p').count()).toBeGreaterThan(0);
  await expect(page.locator('[data-rl-card]')).toHaveCount(1);

  // Kartica se ne prelijeva (dug naslov nalaza ne gura strelice izvan stupca).
  const prelijev = await page.locator('[data-rl-card]').evaluate((el) => el.scrollWidth / el.clientWidth);
  expect(prelijev, `kartica prelijeva za ${((prelijev - 1) * 100).toFixed(0)}%`).toBeLessThan(1.02);
});

test('jezicak filtrira hrpu kartica, a prazna kategorija se ne moze kliknuti', async ({ page }) => {
  test.setTimeout(rok());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await doRezultata(page);

  for (const key of ['Format', 'Struktura', 'Citati', 'Predaja']) {
    const tab = page.locator(`[data-rl-tab="${key}"]`);
    const n = (await tab.locator('.rl-tab__n').textContent())?.trim() ?? '';
    if (n === '✓') { await expect(tab).toBeDisabled(); continue; }
    await tab.click();
    await expect(page.locator('[data-desk-count]')).toHaveText(`1 od ${n}`);
    if (n === '1') await expect(page.locator('.rl-card .desk-nav__btn--next')).toBeDisabled();
  }
});

test('navigacija stolom mijenja nalaz i ne omata na kraju', async ({ page }) => {
  test.setTimeout(rok());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await doRezultata(page);

  const brojac = page.locator('[data-desk-count]');
  expect(await brojac.textContent()).toMatch(/^1 od \d+$/);
  // Prvi nalaz: "Prethodni" je ugasen, jer navigacija namjerno ne omata.
  await expect(page.locator('.rl-card .desk-nav__btn--prev')).toBeDisabled();

  const naslovPrije = await page.locator('[data-rl-card] h3').textContent();
  await page.locator('.rl-card .desk-nav__btn--next').click();
  await expect(brojac).toHaveText(/^2 od \d+$/);
  const naslovPoslije = await page.locator('[data-rl-card] h3').textContent();
  expect(naslovPoslije, 'drugi nalaz mora biti DRUGI, a ne isti pod novim brojem').not.toBe(naslovPrije);

  // Delegacija prezivi ponovno crtanje: drugi klik je onaj koji bi pao uz izravne slusace.
  await page.locator('.rl-card .desk-nav__btn--next').click();
  await expect(brojac).toHaveText(/^3 od \d+$/);
  await expect(page.locator('.rl-card .desk-nav__btn--prev')).toBeEnabled();
});

test('na uskom zaslonu stol NE crta stranicu rada, umjesto da je stisne', async ({ page }) => {
  test.setTimeout(rok());
  await page.setViewportSize({ width: 390, height: 844 });
  await doRezultata(page);

  // Ispod 900 px stranica se ne crta uopce (ni skrivena): najskuplji dio na najslabijem uredaju.
  await expect(page.locator('[data-rl-pagecol]')).toHaveCount(0);
  // Kartice, navigacija i traka ostaju: stol bez stranice je losiji stol, prazan ekran bio bi kvar.
  await expect(page.locator('[data-rl-card]')).toHaveCount(1);
  await expect(page.locator('[data-desk-count]')).toBeVisible();
});

test('ladica plana slijece na ODLUKU u panelu, i namjerno ne pokrece popravak', async ({ page }) => {
  /**
   * NE POKRECE POPRAVAK, i to je odluka a ne izostanak. Izmedju "prihvacam plan" i "dokument je
   * poslan" stoji trenutak privole; gumb koji ga preskoci ponistava taj dogovor. Zato se mjeri i
   * da privola NIJE oznacena.
   */
  test.setTimeout(rok());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const st = document.createElement('style');
    st.textContent = 'html,body,*{scroll-behavior:auto!important}';
    document.documentElement.appendChild(st);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await doRezultata(page);

  await otvoriLadicu(page);
  await page.locator('[data-rl-tray] [data-repair-plan-go]').click();

  const glavna = page.locator('#repairPanelMount .lekta-repair-panel__download');
  await expect(glavna).toBeVisible({ timeout: 15_000 });
  await expect(glavna).toBeFocused();
  await expect(page.locator('#repairPanelMount [data-privacy-prijelaz]')).toBeInViewport();
  await expect(page.locator('#repairPanelMount [data-repair-consent]')).not.toBeChecked();
  await expect(glavna).toHaveText('Popravi sve jednim klikom');
});

test('svaka kartica nosi tocno jedno: zahvat u planu, rucnu napomenu ili nista', async ({ page }) => {
  /**
   * "Popravak ne smije biti feature koji se pronadje. Nalaz prirodno zavrsava u popravku." Od Z34
   * nalaz s automatskim zahvatom nosi "U planu ✓" / "Uključi u plan" na samoj kartici; rucni nalaz
   * nosi plavu napomenu UMJESTO gumba, jer gumb bi obecavao nesto sto Lekta ne smije napraviti.
   */
  test.setTimeout(rok());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await doRezultata(page);

  const ukupno = Number((await page.locator('[data-desk-count]').textContent())?.split(' od ')[1] ?? '0');
  let zahvata = 0;
  let rucnih = 0;
  for (let i = 0; i < ukupno; i += 1) {
    const kartica = page.locator('[data-rl-card]');
    const g = await kartica.locator('[data-rl-toggle]').count();
    const r = await kartica.locator('[data-rl-manual]').count();
    expect(g + r, 'kartica nosi najvise jednu od dvije stvari').toBeLessThanOrEqual(1);
    zahvata += g;
    rucnih += r;
    if (i < ukupno - 1) expect(await sljedecaKartica(page)).toBe(true);
  }
  expect(zahvata + rucnih, 'fixture mora imati barem jedan nalaz s planom ili rucnom napomenom').toBeGreaterThan(0);
});
