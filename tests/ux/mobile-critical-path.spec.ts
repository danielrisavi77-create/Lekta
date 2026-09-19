import { expect, test } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

/**
 * MOBILNI KRITICNI PUT (audit P0-05). Cijeli tok na dodir, bez skipa i bez mocka: upload stvarnog
 * .docx-a, prijelaz na profil, analiza, rezultat.
 *
 * Zasto zaseban od gornja dva: ona mjere da upload stane u prvi ekran, a ovaj da se do rezultata
 * uopce moze doci prstom. Bas to je audit prijavio kao rupu: mobilni testovi su bili provjera
 * vidljivosti i nisu dokazivali da je sucelje upotrebljivo.
 *
 * Banner privole se NE preskace nego se pusta da stoji, jer je upravo on pokrivao gumb
 * ("#consentBanner intercepts pointer events"). Test tako cuva popravak: vrati li se preklapanje,
 * ovdje pada.
 */
test('mobilni kriticni put: upload, profil, analiza, rezultat', async ({ page }) => {
  /**
   * ROK JE VECI OD ZADANIH 120 s, jer ovaj spec vrti PUNU analizu stvarnog .docx-a, a
   * `mobile-webkit` je za to najsporiji motor u matrici. Susjedni `parser-parity` to vec biljezi
   * izmjereno: Chromium dvije analize za ~3 min, WebKit na opterecenom stroju ne stigne ni u 10.
   * Uz 120 s je ovo padalo kao "rezultat se nije pojavio", sto se cita kao kvar analize a nije.
   */
  test.setTimeout(Number(process.env.LEKTA_MOBILE_TIMEOUT_MS ?? 300_000));
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(fixture);
  // Korak 2 dolazi SAM, bez klika na #stepToProfile (isto kao desktop). Popravljeno 2026-09-08:
  // `usesCompactUploadFlow` je bio vestigalni ostatak stare mobilne staze (Jul 25) koji je gasio
  // bas ovaj prijelaz na mobitelu, iako je uoci ovog popravka (2026-09-07) traka koraka na
  // mobitelu vec dobila raditi isti cilj "nula do jedan tap" kao desktop; #stepToProfile je uz
  // taj popravak i skriven na koraku 2 (`.lek-stepnav-1{display:none}`), pa bi klik na njega ovdje
  // sada samo timeoutao na nevidljivom gumbu.
  await cekajKorak(page, '2');

  // Banner mora biti gore: bez njega ovaj test ne bi cuvao nista.
  await expect(page.locator('#consentBanner')).toBeVisible();

  // KORACI 2 I 3 SU SPOJENI 2026-09-07: potvrda profila JEST pokretanje provjere, pa
  // `#stepToAnalyze` ("Nastavi na provjeru") vise ne postoji kao treci gumb za istu radnju
  // i `data-step` nikad ne postane 3. `#analyzeBtn` je vidljiv vec na koraku 2.

  await potvrdiProfil(page);

  // ANALIZA MORA PRVO POCETI, i tek onda zavrsiti. Ovdje je do 2026-09-08 stajala samo tvrdnja
  // da je `#progressView` SKRIVEN, a on je skriven i PRIJE nego analiza krene: prolazila je ne
  // dokazujuci nista, pa je kvar uvijek stizao tek na sljedecem retku, kao "`#resultView` se nije
  // pojavio". To je slalo dijagnozu u analizu, a stvarni kvar je bio u POKRETANJU.
  //
  // Dokaz pokretanja je `#wizardView`, ne `#progressView`, i razlika nije sitnicava: progres je
  // vidljiv samo DOK analiza traje, pa bi tvrdnja o njegovoj vidljivosti bila nova utrka (brza
  // analiza zavrsi prije prvog ocitanja). Carobnjak se sakrije na pocetku i OSTAJE skriven i na
  // rezultatu, dakle signal se ZAKLJUCAVA i ne moze se propustiti.
  await expect(page.locator('#wizardView')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#progressView')).toBeHidden({ timeout: 240_000 });
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#scoreLabel')).toHaveText('Automatska tehnička ocjena');
});
