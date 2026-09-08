import { expect, type Page } from '@playwright/test';

/**
 * CEKANJE NA SPREMNOST APLIKACIJE.
 *
 * `#fileInput` postoji u statickom HTML-u, pa ga Playwright rado popuni i PRIJE nego je aplikacija
 * podigla svoje slusace. `change` koji tada nastane nema tko primiti i gubi se ZAUVIJEK: carobnjak
 * ostane na koraku 1, a spec to vidi kao istek cekanja, dakle kao sporost, iako je dogadjaj
 * nepovratno izgubljen.
 *
 * IZMJERENO 2026-09-08 (browser-matrix, run 34216730750): `desktop-flow` u WebKitu pao je na
 * `data-step` "1" nakon 11 ocitanja u 5 s, pa prosao iz drugog pokusaja. Chromium boota brze i
 * skoro uvijek stigne prvi; WebKit ne uvijek. Ista je matrica bila crvena i na cetiri ranija
 * commita, dakle rijec je o zatecenoj nestabilnosti, ne o regresiji.
 *
 * `data-lekta-ready` postavlja `initAnalyzerApp` TEK nakon uspjesne montaze i BRISE ga
 * `disposeAnalyzerApp`, pa marker prati stvarno stanje, a ne samo cinjenicu da je skripta ucitana.
 * Bez njega bi svaki spec morao pogadjati, sto je upravo ono sto je padalo.
 */
export async function cekajApp(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-lekta-ready', '1', { timeout });
}
