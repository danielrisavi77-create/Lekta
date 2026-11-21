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
 * polje `behavior: 'instant'` (izricito gazi `scroll-behavior`), pricekamo miran pravokutnik i
 * stvarni hit-target kroz dva kadra, pa koristimo misji klik koji ne pokrece dodatno automatsko
 * skrolanje.
 */
export async function klikniBezSkrolUtrke(page: Page, meta: Locator): Promise<void> {
  await expect(meta).toBeVisible();
  await expect(meta).toBeEnabled();
  await meta.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
  });
  await cekajMirovanjeSkrola(page);
  // `locator.click()` automatski skrola i kad je meta vec vidljiva. U WebKitu je taj drugi skrol
  // znao pomaknuti stranicu izmedju pritiska i otpustanja: klik je zavrsio nad sticky zaglavljem,
  // a potvrda profila ili kartica nisu reagirali. Provjeri stvarni hit-target kroz dva kadra pa
  // posalji obican misji klik na stabilnu tocku; ovo nije `force` ni DOM `dispatchEvent`.
  const tocka = await meta.evaluate(async (el) => {
    const rok = performance.now() + 10_000;
    let prethodno = '';
    let mirniKadrovi = 0;
    while (performance.now() < rok) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!el.isConnected) throw new Error('Meta klika je uklonjena prije klika.');
      const pravokutnik = el.getBoundingClientRect();
      const x = pravokutnik.left + pravokutnik.width / 2;
      const y = pravokutnik.top + pravokutnik.height / 2;
      const vidljiva = pravokutnik.width > 0 && pravokutnik.height > 0
        && x >= 0 && x < window.innerWidth && y >= 0 && y < window.innerHeight;
      const pogodak = document.elementFromPoint(x, y);
      const primaKlik = Boolean(pogodak && (pogodak === el || el.contains(pogodak)));
      const stanje = [pravokutnik.left, pravokutnik.top, pravokutnik.width, pravokutnik.height,
        window.scrollX, window.scrollY, vidljiva, primaKlik].map((vrijednost) => Math.round(Number(vrijednost) * 100) / 100).join(':');
      if (vidljiva && primaKlik && stanje === prethodno) mirniKadrovi += 1;
      else mirniKadrovi = 0;
      if (mirniKadrovi >= 1) return { x, y };
      prethodno = stanje;
    }
    throw new Error('Meta klika nije ostala mirna i dostupna za stvarni misji klik.');
  });
  await page.mouse.click(tocka.x, tocka.y);
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
