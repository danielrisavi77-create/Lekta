import { expect, type Locator, type Page } from '@playwright/test';

/**
 * KLIK KOJI NE TRCI S GLATKIM SKROLOM.
 *
 * `html { scroll-behavior: smooth }` (`src/shared/motion.css`, `src/routes/shared/route-shell.css`)
 * vrijedi i za skrol koji preglednik napravi SAM, kad Playwright pred klikom dovodi metu u vidno
 * polje. U WebKitu je taj skrol tada ANIMACIJA: Playwright izracuna tocku, posalje `mousedown`,
 * a stranica se do `mouseup`-a pomakne, pa `click` nastane nad drugim elementom i rukovatelj se
 * nikad ne pozove. Klik "uspije", a nista se ne dogodi.
 *
 * IZMJERENO 2026-09-23 (`mobile-webkit`, `/rad/`, capture slusaci na dokumentu):
 *
 *     mousedown  cilj=BUTTON[data-change-profile]   scrollY=298  gumb y=217
 *     mouseup    cilj=SECTION.section-soft          scrollY=515  gumb y=-1
 *
 * Isti je potpis 2026-09-23 srusio `browser-matrix` (PR #110, run 35814568813): `#profileSheet`
 * je ostao `hidden` 5 s nakon klika. Chromium to ne vidi jer ondje Playwright skrola kroz
 * protokol, mimo CSS-a.
 *
 * LIJEK NIJE CEKANJE NA SAT nego uklanjanje potrebe za tudjim skrolom: metu sami dovedemo u vidno
 * polje `behavior: 'instant'` (izricito gazi `scroll-behavior`), pa pricekamo da se polozaj skrola
 * ne mijenja kroz dva uzastopna kadra. Playwright tada zatekne metu vec u vidnom polju i ne
 * pokrece vlastiti skrol.
 */
export async function klikniBezSkrolUtrke(page: Page, meta: Locator): Promise<void> {
  await expect(meta).toBeVisible();
  await meta.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
  });
  await cekajMirovanjeSkrola(page);
  await meta.click();
}

/**
 * Ceka da se polozaj skrola ne promijeni kroz dva uzastopna kadra. Mjeri se STVARNO stanje
 * (`scrollY`), ne proteklo vrijeme, pa cekanje ne moze tiho preskociti animaciju koja jos traje.
 */
export async function cekajMirovanjeSkrola(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(() => new Promise<boolean>((resolve) => {
    const prvi = Math.round(window.scrollY);
    requestAnimationFrame(() => {
      const drugi = Math.round(window.scrollY);
      requestAnimationFrame(() => resolve(prvi === drugi && drugi === Math.round(window.scrollY)));
    });
  }), undefined, { timeout, polling: 'raf' });
}
