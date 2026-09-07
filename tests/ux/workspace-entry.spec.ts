import path from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

/**
 * UX SPECOVI RADNOG PROSTORA `/rad/`. Zaseban od `intake-entry`, jer gard u
 * `tests/intake-entry-boundary.test.ts` brani `goto('/')` svakoj datoteci koja spominje
 * analizatorske selektore, a mjeri po DATOTECI (po testu ne moze bez parsiranja). Tvrdnje o ulazu
 * i tvrdnje o radnom prostoru zato ne smiju dijeliti datoteku.
 */

test('/rad/: radni prostor je vidljiv ODMAH, bez ijednog klika', async ({ page }) => {
  /**
   * Na `/rad/` korisnik dolazi S DOKUMENTOM, pa nema sto otkljucavati. Do reza je ondje stajao
   * marketinski hero (naslov, demo papir, post-it, ocjena, "Ucitaj rad"), a carobnjak je bio
   * `display:none` iza `.lek-col-form:not(.lek-engaged) .analyzer-wrap`, gdje `.lek-engaged`
   * postavlja ISKLJUCIVO JS na klik tog papira.
   *
   * ZASTO OVA TVRDNJA POSTOJI: cetiri postojeca UX speca (`desktop-flow`, `a11y-states`,
   * `parser-parity`, `repair-panel`) kliknu cover PRIJE nego bilo sto provjere, pa bi svi ostali
   * zeleni i da je carobnjak nevidljiv. Mjere put starog korisnika, ne stanje ekrana.
   */
  await page.goto('/rad/');
  await expect(page.locator('#wizardView')).toBeVisible();
  await expect(page.locator('#dropzone')).toBeVisible();
});

test('/rad/ korak Pravila: potvrda je ekran, kontrole cekaju iza Promijeni', async ({ page }) => {
  /**
   * `UX_PRINCIPLES.md` odjeljak 2 trazi: "jedan redak s popunjenim defaultom, primarna akcija
   * Potvrdi, promjena sekundarna i skrivena iza promijeni, cilj nula do jedan tap". Do
   * 2026-09-07 je bilo obrnuto: devet selectova kao glavni sadrzaj, kartica profila ispod njih,
   * a pokretanje provjere tek na SLJEDECEM koraku.
   *
   * Koraci 2 i 3 su spojeni: potvrda JEST pokretanje, pa `lek-stepnav-2` ("Nastavi na provjeru")
   * vise ne postoji kao treci gumb za istu radnju.
   *
   * PISE SE KAO TEST, NE KAO RUCNO MJERENJE, i to je nauceno danas: rucno uzorkovanje preko
   * `waitForTimeout` dalo je pet razlicitih ocitanja istog stanja, ovisno o tome je li `app.ts`
   * stigao zavrsiti boot. `expect(locator)` ponavlja dok ne istekne, pa mjeri stanje a ne trenutak.
   */
  await page.goto('/rad/');
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  // Korak 2 dolazi SAM kad je detekcija pouzdana (`isConfidentDetection`), bez klika na
  // "Nastavi na profil". To je i smisao "nula do jedan tap": kad je studij prepoznat iz
  // dokumenta, korisniku preostaje samo potvrda.
  await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '2');

  // Kartica je ekran: vidi se profil i obje akcije.
  // Duzi rok NIJE skrivanje sporosti: kartica se crta u `updateProfile`, koji CEKA pravila
  // profila (`ensureProfileRules`, mrezni dohvat). Na hladnom posluzitelju to premasi zadanih
  // 5 s, pa bi kraci rok mjerio brzinu prvog prevodjenja modula, a ne postojanje kartice.
  await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-confirm-profile]')).toBeVisible();
  await expect(page.locator('[data-change-profile]')).toBeVisible();
  // Provjera se pokrece s OVOG koraka: spajanje 2 i 3.
  await expect(page.locator('#analyzeBtn')).toBeVisible();

  // Kontrole cekaju iza "Promijeni".
  // Stupac profila ima DVA obrasca (ustanova/fakultet/studij, pa vrsta rada), pa se broji
  // koliko ih je vidljivo umjesto da se bira jedan: tvrdnja nad `.first()` bi prosla i da je
  // drugi ostao na ekranu.
  await expect(page.locator('.wizard-col-profile .form-grid:visible')).toHaveCount(0);
  await page.locator('[data-change-profile]').click();
  const vidljivi = await page.locator('.wizard-col-profile .form-grid:visible').count();
  expect(vidljivi, 'nakon Promijeni moraju se otvoriti SVI obrasci profila').toBeGreaterThan(1);
  await expect(page.locator('#institutionSelect')).toBeFocused();
});
