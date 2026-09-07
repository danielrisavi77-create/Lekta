import { expect, test } from '@playwright/test';

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
