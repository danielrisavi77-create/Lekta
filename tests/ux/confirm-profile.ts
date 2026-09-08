import { expect, type Page } from '@playwright/test';

/**
 * POTVRDA PROFILA SE CEKA, NE POGADJA.
 *
 * Pet specova je istu radnju pisalo kao `if (await confirm.isVisible()) await confirm.click()`.
 * Taj oblik je UTRKA, i to tiha: `isVisible()` je trenutacno ocitanje i NE ceka. Kartica potvrde
 * se crta tek unutar `runAnalysis`, POSLIJE `await ensureRulesForCurrentSelection(...)`, dakle
 * nakon mrezne runde za pravila profila. Kad ocitanje stigne prije kartice, uvjet je `false`,
 * klik se tiho preskoci, `runAnalysis` izadje na vratima potvrde
 * (`needsProfileConfirmation(...)` -> `return`), i spec zatim ceka `#resultView` koji nikad ne
 * postane vidljiv. Pad izgleda kao spor stroj ili kvar analize, a nije ni jedno.
 *
 * IZMJERENO DVAPUT, na dva razlicita mjesta i s istim potpisom:
 *   2026-09-07  mobile-critical-path  potvrda preskocena na mobitelu, `#resultView` nikad vidljiv
 *   2026-09-08  parser-parity         isto, na CI-u (run 34211391904, mobile-chromium),
 *                                     239 ocitanja `<div id="resultView" class="... hidden">`
 *
 * Drugi pad je srusio master, jer `failOnFlakyTests` na CI-u namjerno ne prasta prolaz iz drugog
 * pokusaja. Popravak jednog spec-a ocito nije bio dovoljan, pa znanje od sada zivi OVDJE, a ne u
 * komentaru koji se kopira.
 *
 * ZASTO SMIJE BITI TVRDA TVRDNJA, a ne obrambeni `if`: svi ti specovi koriste isti fixture
 * (`fer-diplomski-prazni-odlomci.docx`), za koji detekcija nije pouzdana, pa
 * `needsProfileConfirmation` UVIJEK trazi potvrdu. `mobile-critical-path` to na CI-u dokazuje
 * determinsticki od 2026-09-07. Obrambeni oblik bi ovdje bio gori od pada: kad bi kartica jednom
 * prestala dolaziti, tiho bi postao no-op umjesto da prijavi.
 */
export async function potvrdiProfil(page: Page, timeout = 30_000): Promise<void> {
  const potvrda = page.locator('[data-confirm-profile]');
  await expect(potvrda).toBeVisible({ timeout });
  await potvrda.click();
}
