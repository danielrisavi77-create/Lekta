import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * UX SPECOVI ULAZA `/`. Zaseban od `free-tools-audit`, i to nije uredovanje nego posljedica garda.
 *
 * `tests/intake-entry-boundary.test.ts` tvrdi da nijedan spec koji spominje analizator ne smije
 * navigirati na `/` (analizator je nakon reza 2026-09-05 na `/rad/`). Gard mjeri po DATOTECI, jer
 * po testu ne moze bez parsiranja, pa bi tvrdnja o ulazu smjestena u datoteku punu analizatorskih
 * selektora pala iako s analizatorom nema veze. Ulazni specovi zato zive ovdje.
 */

test('ulaz `/` nema vodoravni scroll u uskom prozoru', async ({ page }) => {
  /**
   * MJERI SE U OBICNOM (desktop) KONTEKSTU, NE U MOBILNOJ EMULACIJI, i to je cijela poanta.
   *
   * Prva izvedba ovog garda stajala je u `mobile-chromium` projektu i NIJE MOGLA PASTI: uz
   * mobilnu emulaciju `viewport` meta prosiri vidno polje da sadrzaj stane (izmjereno na 375 px:
   * `innerWidth` postane 385 i izjednaci se sa `scrollWidth`), pa vodoravnog scrolla ondje nema
   * ni kad se sadrzaj prelijeva. Mutacija je zato prosla i izgledala kao da gard ne grize.
   *
   * Stvaran slucaj je USKI PROZOR NA RACUNALU: ondje se prelijevanje vidi kao vodoravna traka.
   * Izmjereno 2026-09-07: `.hero-atmos` (snop lampe) prelijeva izvan roditelja
   * (`inset: -8% -6% -12%`), roditelj ga ne smije rezati jer bi odrezao sjenu papira i listove
   * ispod njega, pa je dokument bio sirok 384 px u prozoru od 375.
   */
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const mjera = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(mjera.scroll, `dokument je siri od prozora za ${mjera.scroll - mjera.viewport} px`)
    .toBeLessThanOrEqual(mjera.viewport);
});

/**
 * ZIVI LIST (ALIGNMENT Z32, varijanta B). Mjeri se na stvarnoj ruti, u oba projekta (desktop i
 * Pixel 5), jer pribor mijenja mjesto na 900 px, a hover tragova postoji samo uz mis.
 *
 * Postavke (`lekta.preferences.v2`) se podmecu PRIJE ucitavanja (`addInitScript`), jer kartica
 * fakulteta cita isti izvor kao plocica u traci; bez njih predodabira nema i "Potvrdi" je s
 * pravom onemogucen.
 */
const DOCX = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');
const POSTAVKE = { unit: 'fer', program: 'Računarstvo', workType: 'graduate' };

async function sPostavkama(page: Page): Promise<void> {
  await page.addInitScript((p) => {
    // Samo pri PRVOM ucitavanju kartice: navigacija na /rad/ ne smije ponovno prepisati pohranu.
    if (sessionStorage.getItem('z32-init')) return;
    sessionStorage.setItem('z32-init', '1');
    localStorage.setItem('lekta.preferences.v2', JSON.stringify(p));
  }, POSTAVKE);
}

const gumb = (page: Page) => page.locator('.intake-paper__gumb');

test('Z32: CTA je zatvoren bez fakulteta i roka, "Još ne znam rok" ga uz potvrdu otvara', async ({ page }) => {
  await sPostavkama(page);
  await page.goto('/');
  await expect(gumb(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#intakeHint')).toHaveText('Prvo potvrdi fakultet i rok');
  // Zatvorena vrata: klik na list NE otvara odabir datoteke, nego vodi na ono sto nedostaje.
  // Klika se po listu (naslov), ne po gumbu: Playwright odbija kliknuti `aria-disabled` element,
  // a ploha lista vodi isti tok (kontroler slusa cijeli `#intakeDropzone`).
  let otvoren = false;
  page.on('filechooser', () => { otvoren = true; });
  await page.locator('.intake-title').click();
  await expect(page.locator('[data-intake-potvrdi]')).toBeFocused();
  expect(otvoren, 'zatvorena vrata su otvorila odabir datoteke').toBe(false);

  await expect(page.locator('[data-intake-fakultet]')).toHaveText('FER · Računarstvo · Dipl.');
  await page.locator('[data-intake-potvrdi]').click();
  await expect(page.locator('#intakeHint')).toHaveText('Prvo potvrdi rok');
  await expect(page.locator('#intakeDropzone')).toHaveAttribute('data-fakultet-potvrden', '');
  await page.getByLabel('Još ne znam rok').check();
  await expect(gumb(page)).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('#intakeHint')).toHaveText('ili ispusti dokument ovdje');
  await expect(page.locator('[data-intake-rok-pecat]')).toHaveText('Rok nije zadan');

  // Otvorena vrata: dodir ili klik lista otvara odabir datoteke (Z32 tocka 4, mobitel).
  const odabir = page.waitForEvent('filechooser');
  await page.locator('.intake-title').click();
  await odabir;
});

test('Z32: upisan rok spusta pecat sa stvarnim datumom i brojem dana', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 23, 12));
  await page.goto('/');
  await page.getByLabel('Rok predaje').fill('2026-10-15');
  await expect(page.locator('[data-intake-rok-pecat]')).toHaveText('Rok 15. 10. · 22 dana');
});

test('Z32: ispustanje bilo gdje upisuje ime u zaglavlje, a pecat prolazi "Čeka provjeru" -> "Čitam"', async ({ page }) => {
  await sPostavkama(page);
  const pecati: string[] = [];
  const imena: string[] = [];
  await page.exposeFunction('z32Biljezi', (vrsta: string, tekst: string) => { (vrsta === 'pecat' ? pecati : imena).push(tekst); });
  await page.goto('/');
  await page.locator('[data-intake-potvrdi]').click();
  await page.getByLabel('Još ne znam rok').check();
  await page.evaluate(() => {
    const w = window as unknown as { z32Biljezi: (v: string, t: string) => void };
    const pecat = document.querySelector('[data-intake-pecat]')!;
    const ime = document.querySelector('[data-intake-ime]')!;
    w.z32Biljezi('pecat', pecat.textContent ?? '');
    new MutationObserver(() => w.z32Biljezi('pecat', pecat.textContent ?? '')).observe(pecat, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => w.z32Biljezi('ime', ime.textContent ?? '')).observe(ime, { childList: true, characterData: true, subtree: true });
  });
  const bajtovi = [...readFileSync(DOCX)];
  // Povlacenje PODIZE list (dragenter na cijelom ekranu), ispustanje izvan lista ga predaje dalje.
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'rad.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    (window as unknown as { z32Podignut: boolean }).z32Podignut = document.getElementById('intakeDropzone')!.classList.contains('is-podignut');
    document.querySelector('.site-footer')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bajtovi);
  // Primopredaja nastavlja kao i prije Z32: sesija je spremljena i preglednik je na /rad/.
  await page.waitForURL(/\/rad\/#session=/);
  expect(pecati[0]).toBe('Čeka provjeru');
  expect(pecati, 'pecat nije presao u "Čitam"').toContain('Čitam');
  // Ime se upisivalo SLOVO PO SLOVO, pa su medjustanja zabiljezena, a zadnje je cijelo ime.
  expect(imena.length, 'ime nije tipkano nego upisano odjednom').toBeGreaterThan(3);
  expect(imena).toContain('rad');
  expect(imena[imena.length - 1]).toBe('rad.docx');
  // Z32 tocka 7: potvrda je vezana za OVU sesiju, a rok ceka /rad/ kroz sigurni omotac.
  const sesija = new URL(page.url()).hash.replace('#session=', '');
  const zapis = await page.evaluate(() => JSON.parse(localStorage.getItem('lekta.intake.v1') ?? 'null'));
  expect(zapis.rok).toEqual({ datum: null, neznam: true });
  expect(zapis.potvrda).toMatchObject({ unit: 'fer', program: 'Računarstvo', workType: 'graduate', sesija });
});

test('Z32: povlacenje podize list, a napustanje ekrana ga spusta', async ({ page }) => {
  await page.goto('/');
  const podignut = () => page.evaluate(() => document.getElementById('intakeDropzone')!.classList.contains('is-podignut'));
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'rad.docx'));
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
  });
  expect(await podignut()).toBe(true);
  // translateY(-10px) je sesti clan matrice (ty); ceka se kraj prijelaza od .22 s.
  const ty = () => page.evaluate(() => {
    const t = getComputedStyle(document.getElementById('intakeDropzone')!).transform;
    return Number(t.match(/matrix\(([^)]+)\)/)?.[1].split(',')[5] ?? NaN);
  });
  await expect.poll(ty).toBeCloseTo(-10, 0);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'rad.docx'));
    document.body.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true }));
  });
  expect(await podignut()).toBe(false);
});

test('Z32: 360 px bez preklapanja, pribor ispod lista', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await sPostavkama(page);
  await page.goto('/');
  await page.locator('[data-intake-potvrdi]').click();
  await page.getByLabel('Još ne znam rok').check();
  const kutije = await page.evaluate(() => {
    const k = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    return {
      scroll: document.documentElement.scrollWidth, viewport: window.innerWidth,
      papir: k('#intakeDropzone'), pribor: k('[data-intake-pribor]'),
      mete: ['.intake-zaglavlje', '.intake-pecat', '.intake-title', '.intake-lead', '.intake-cta', '.intake-hint', '[data-intake-rok-pecat]', '[data-intake-foot]'].map((s) => ({ s, ...k(s) })),
    };
  });
  expect(kutije.scroll, 'vodoravni scroll na 360 px').toBeLessThanOrEqual(kutije.viewport);
  expect(kutije.pribor.y, 'pribor nije ispod lista').toBeGreaterThanOrEqual(kutije.papir.y + kutije.papir.h - 1);
  for (const x of [kutije.papir, kutije.pribor]) expect(x.x + x.w).toBeLessThanOrEqual(kutije.viewport + 0.5);
  // Nijedna meta na listu ne lezi na drugoj (pecati su rotirani, pa se mjeri okvir u toku).
  const sijeku = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  const sudari: string[] = [];
  kutije.mete.forEach((a, i) => kutije.mete.slice(i + 1).forEach((b) => {
    if ((a.s === '.intake-cta' && b.s === '.intake-hint') || (a.s === '.intake-hint' && b.s === '.intake-cta')) return;
    if (sijeku(a, b)) sudari.push(`${a.s} x ${b.s}`);
  }));
  expect(sudari).toEqual([]);
});

test('Z32: tragovi olovke jednom pri ucitavanju pa izblijede; pod prigusenim pokretom ih nema', async ({ page }) => {
  await page.goto('/');
  const neprozirnost = () => page.evaluate(() => Number(getComputedStyle(document.querySelector('.intake-tragovi')!).opacity));
  await expect.poll(neprozirnost, { timeout: 2_000 }).toBeGreaterThan(0.9);
  await expect.poll(neprozirnost, { timeout: 6_000 }).toBeLessThan(0.05);
  // Na racunalu se vracaju na hover lista; na dodirnom ekranu hovera nema, pa ni povratka.
  const mis = await page.evaluate(() => matchMedia('(hover:hover) and (pointer:fine)').matches);
  await page.locator('.intake-title').hover();
  if (mis) await expect.poll(neprozirnost).toBeGreaterThan(0.9);
  else expect(await neprozirnost()).toBeLessThan(0.05);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.intake-tragovi')).toBeHidden();
  await expect(page.locator('.intake-trag').first()).toBeHidden();
});
