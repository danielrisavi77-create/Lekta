import { expect, test } from '@playwright/test';

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
