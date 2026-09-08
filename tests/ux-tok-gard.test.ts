import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GARD NAD REDOSLIJEDOM U UX SPECOVIMA: cekaj, ne pogadjaj.
 *
 * Dva ugovora, isti razred kvara. Oba su UTRKE koje ne padaju nego se TIHO PRESKOCE, pa kvar
 * uvijek stigne nekoliko redaka kasnije i izgleda kao neka treca stvar:
 *
 *   POTVRDA PROFILA   ocitanje umjesto cekanja  ->  analiza ne krene, pada `#resultView`
 *   SPREMNOST APLIKACIJE  upload prije `bind()` ->  `change` se izgubi, pada `data-step`
 *
 * PRVI UGOVOR: POTVRDA PROFILA.
 *
 * Zasto postoji: ista utrka je srusila gate DVAPUT, na dva razlicita spec-a, s istim potpisom.
 *
 *   2026-09-07  mobile-critical-path  popravljen na ruku, u tom jednom spec-u
 *   2026-09-08  parser-parity         pao na CI-u (run 34211391904), master crven
 *
 * Oblik koji pada je `if (await confirm.isVisible()) await confirm.click()`. `isVisible()` je
 * TRENUTACNO ocitanje i ne ceka, a kartica potvrde se crta tek nakon mrezne runde za pravila
 * profila (`await ensureRulesForCurrentSelection(...)` u `runAnalysis`). Kad ocitanje pretekne
 * karticu, klik se tiho preskoci, analiza nikad ne krene, i spec ceka `#resultView` do timeouta.
 *
 * Popravak jednog spec-a ocito nije bio dovoljan, jer je isti oblik bio prepisan na pet mjesta.
 * Zato pravilo od sada NIJE komentar nego gard: potvrda se KLIKA iskljucivo kroz `potvrdiProfil`
 * (`tests/ux/confirm-profile.ts`), koji ceka.
 *
 * STO GARD NAMJERNO NE ZABRANJUJE: tvrdnju o kartici. `workspace-entry.spec.ts` provjerava da
 * kartica nudi i "Potvrdi" i "Promijeni"; to je tvrdnja o SADRZAJU ekrana, ne pokretanje toka, i
 * ne moze utrkivati jer nista ne klika. Prva izvedba ovog garda ju je oborila, i to je bila
 * greska garda, ne specova. Utrkuje KLIK, pa se gadja klik.
 *
 * ZASTO OVDJE, A NE U `tests/ux/`: vitest namjerno iskljucuje `tests/ux/**` (ondje zive Playwright
 * specovi, koje vrti `npm run test:ux`). Ovaj gard cita te datoteke kao TEKST, ne pokrece ih, pa
 * pripada u obican vitest paket i vrti se u `npm run check`, dakle prije nego pad stigne na CI.
 *
 * CR se normalizira prije usporedbe: `core.autocrlf` daje istoj datoteci iz istog commita dva
 * oblika na disku, pa bi gard inace mjerio konfiguraciju gita, ne sadrzaj.
 */
const UX = path.resolve(__dirname, 'ux');
const POMOCNIK = 'potvrdiProfil';
const SPREMNOST = 'cekajApp';

function citaj(ime: string): string {
  return readFileSync(path.join(UX, ime), 'utf8').split('\r\n').join('\n');
}

function specovi(): string[] {
  return readdirSync(UX).filter((f) => f.endsWith('.spec.ts'));
}

/**
 * Skida komentare, jer tvrdnja o KODU ne smije citati prozu. Prva izvedba ovog garda je pala na
 * vlastitom pomocniku: njegov komentar OPISUJE `isVisible()` kao kvar, a tvrdnja je taj opis
 * procitala kao poziv. Isti razred kao rucni CSS parser koji je tekst komentara citao kao
 * selektore.
 */
export function bezKomentara(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Detektor. Izdvojen iz tvrdnji da se nad njim moze podmetnuti kvar: gard koji se ne da mutirati
 * ne dokazuje da grize.
 */
export function prigovori(ime: string, src: string): string[] {
  const kod = bezKomentara(src);
  const nalazi: string[] = [];
  if (kod.includes("[data-confirm-profile]').click()")) {
    nalazi.push(`${ime}: klika [data-confirm-profile] izravno; potvrda ide kroz ${POMOCNIK}()`);
  }
  if (kod.includes('data-confirm-profile') && kod.includes('isVisible')) {
    nalazi.push(`${ime}: ocitava potvrdu s isVisible(); to je utrka, ${POMOCNIK}() ceka`);
  }
  // Spec koji POKRECE analizu i zatim CEKA njezin ishod mora proci kroz potvrdu. Bez toga
  // `runAnalysis` izadje na vratima potvrde i cekanje traje do timeouta.
  const pokrece = kod.includes("#analyzeBtn').click()");
  const cekaIshod = kod.includes('#resultView') || kod.includes('#progressView');
  if (pokrece && cekaIshod && !kod.includes(POMOCNIK)) {
    nalazi.push(`${ime}: klika #analyzeBtn i ceka ishod, ali ne zove ${POMOCNIK}()`);
  }
  // DRUGI UGOVOR: `#fileInput` postoji u statickom HTML-u, pa ga Playwright popuni i prije nego
  // aplikacija veze slusace. Taj `change` nema tko primiti i gubi se ZAUVIJEK.
  if (kod.includes('setInputFiles') && !kod.includes(SPREMNOST)) {
    nalazi.push(`${ime}: postavlja datoteku bez ${SPREMNOST}(); upload prije bind() gubi dogadjaj`);
  }
  return nalazi;
}

describe('potvrda profila u UX specovima', () => {
  it('BASELINE: nijedan spec ne pogadja potvrdu na ruku', () => {
    // Baseline mora biti cist, inace "prolazi" i gard koji vristi na sve.
    const svi = specovi().flatMap((ime) => prigovori(ime, citaj(ime)));
    expect(svi).toEqual([]);
  });

  it('popis specova nije prazan, jer prazan skup nije cist prolaz', () => {
    // Bez ovoga bi promasen glob (drukcija staza, preimenovan direktorij) dao vakuumsko zeleno.
    expect(specovi().length).toBeGreaterThan(5);
  });

  it('pomocnik CEKA karticu umjesto da je ocitava', () => {
    const kod = bezKomentara(citaj('confirm-profile.ts'));
    expect(kod).toContain('toBeVisible');
    expect(kod).not.toContain('isVisible');
    expect(kod).toContain(`export async function ${POMOCNIK}`);
  });

  it('pomocnik spremnosti CEKA marker koji postavlja montaza', () => {
    const kod = bezKomentara(citaj('app-ready.ts'));
    expect(kod).toContain('data-lekta-ready');
    expect(kod).toContain('toHaveAttribute');
    expect(kod).toContain(`export async function ${SPREMNOST}`);
  });

  it('MUTACIJA: upload bez cekanja na spremnost se prijavi', () => {
    const bezCekanja = [
      "  await page.goto('/rad/');",
      "  await page.locator('#fileInput').setInputFiles(fixture);",
    ].join('\n');
    const nalazi = prigovori('podmetnut4.spec.ts', bezCekanja);
    expect(nalazi).toHaveLength(1);
    expect(nalazi[0]).toContain('bez cekajApp');
  });

  it('KONTROLA: upload uz cekanje ne proizvodi prigovor', () => {
    const dobar = [
      "  await page.goto('/rad/');",
      '  await cekajApp(page);',
      "  await page.locator('#fileInput').setInputFiles(fixture);",
    ].join('\n');
    expect(prigovori('dobar2.spec.ts', dobar)).toEqual([]);
  });

  it('MUTACIJA: vraceni stari oblik se prijavi', () => {
    const stari = [
      "  await page.locator('#analyzeBtn').click();",
      "  const confirm = page.locator('[data-confirm-profile]');",
      '  if (await confirm.isVisible().catch(() => false)) await confirm.click();',
      "  await expect(page.locator('#resultView')).toBeVisible();",
    ].join('\n');
    const nalazi = prigovori('podmetnut.spec.ts', stari);
    // Dva razlicita prigovora: ocitanje umjesto cekanja, i pokretanje bez potvrde.
    expect(nalazi).toHaveLength(2);
    expect(nalazi[0]).toContain('isVisible');
    expect(nalazi[1]).toContain('ne zove');
  });

  it('MUTACIJA: izravan klik na potvrdu se prijavi i bez isVisible', () => {
    const izravno = "  await page.locator('[data-confirm-profile]').click();";
    const nalazi = prigovori('podmetnut2.spec.ts', izravno);
    expect(nalazi).toHaveLength(1);
    expect(nalazi[0]).toContain('izravno');
  });

  it('MUTACIJA: tihi preskok bez ijednog selektora se takodjer prijavi', () => {
    // Treci oblik istog kvara: netko ukloni potvrdu u cijelosti. Analiza tada ne krene i cekanje
    // ide do timeouta, bas kao na CI-u.
    const bezPotvrde = [
      "  await page.locator('#analyzeBtn').click();",
      "  await expect(page.locator('#resultView')).toBeVisible();",
    ].join('\n');
    expect(prigovori('podmetnut3.spec.ts', bezPotvrde)).toHaveLength(1);
  });

  it('KONTROLA: ispravan oblik i tvrdnja o kartici ne proizvode prigovor', () => {
    const dobar = [
      "  await expect(page.locator('[data-confirm-profile]')).toBeVisible();",
      "  await page.locator('#analyzeBtn').click();",
      '  await potvrdiProfil(page);',
      "  await expect(page.locator('#resultView')).toBeVisible();",
    ].join('\n');
    expect(prigovori('dobar.spec.ts', dobar)).toEqual([]);
  });

  it('KONTROLA: kvar sakriven u komentaru NIJE nalaz', () => {
    const samoProza = '  // stari oblik je bio `confirm.isVisible()` uz [data-confirm-profile]';
    expect(prigovori('proza.spec.ts', samoProza)).toEqual([]);
  });
});
