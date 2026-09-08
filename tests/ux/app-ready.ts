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

/**
 * CEKANJE NA KORAK CAROBNJAKA, s rokom koji je IZMJEREN a ne pretpostavljen.
 *
 * Playwrightov zadani rok je 5 s. Prijelaz na korak 2 nakon uploada traje mnogo vise od
 * milisekundi, jer `setFile` odmah zove `updateProfile()`, koji CEKA pravila profila preko mreze,
 * a na prvom otvaranju i prevodjenje modula.
 *
 * IZMJERENO 2026-09-08 sondom, na mirnom stroju (1,6 GB slobodno, 5 node procesa):
 *
 *     WebKit    izolirano 2530 ms     u paru 2589 ms
 *     Chromium  izolirano 3419 ms     u paru  197 ms
 *
 * Raspon je 170 ms do 3,4 s i ovisi o tome je li graf modula HLADAN, ne o motoru. Uz 5 s rezerve
 * gotovo nema, pa je `desktop-flow` u WebKitu na dijeljenom CI runneru redovito prelazio granicu
 * (browser-matrix crven na cetiri od sest master commita).
 *
 * ODBACENA HIPOTEZA, zapisana da je netko ne ponovi: prvo je izgledalo da je kriv
 * `withViewTransition`, koji upis stanja stavlja UNUTAR callbacka View Transitions API-ja, pa bi
 * stanje bilo zarobljeno iza animacije. A/B mjerenje s `emulateMedia({ reducedMotion: 'reduce' })`,
 * gdje ta grana zove `mutate()` izravno, dalo je 169 ms odnosno 2154 ms, dakle prakticki isto kao
 * s prijelazom. Prijelaz je NEVIN; kasni posao koji slijedi.
 *
 * Duzi rok ovdje NIJE skrivanje sporosti: `workspace-entry.spec.ts` isti zakljucak vec nosi za
 * karticu profila. Tvrdnja mjeri DA carobnjak napreduje, ne da napreduje u pet sekundi.
 */
export async function cekajKorak(page: Page, korak: string, timeout = 30_000): Promise<void> {
  await expect(page.locator('#wizardView')).toHaveAttribute('data-step', korak, { timeout });
}
