import { expect, test } from '@playwright/test';
import path from 'node:path';

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
  await page.goto('/rad/');
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '1');

  // Banner mora biti gore: bez njega ovaj test ne bi cuvao nista.
  await expect(page.locator('#consentBanner')).toBeVisible();
  await page.locator('#stepToProfile').click();
  await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '2');

  // KORACI 2 I 3 SU SPOJENI 2026-09-07: potvrda profila JEST pokretanje provjere, pa
  // `#stepToAnalyze` ("Nastavi na provjeru") vise ne postoji kao treci gumb za istu radnju
  // i `data-step` nikad ne postane 3. `#analyzeBtn` je vidljiv vec na koraku 2.

  // POTVRDA JE PRIMARNA AKCIJA, pa se na nju ceka umjesto da se pogadja. Prijasnji oblik
  // (`#analyzeBtn` pa `if (await confirm.isVisible())`) je bio utrka: `isVisible()` NE ceka,
  // a kartica se crta u `updateProfile`, koji ceka pravila profila preko mreze. Na mobitelu je
  // ocitanje stizalo prije kartice, potvrda se tiho preskakala, `runAnalysis` je izlazio na
  // vratima potvrde, i test je padao na `#resultView` koji nikad ne postane vidljiv.
  const confirm = page.locator('[data-confirm-profile]');
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  await confirm.click();

  await expect(page.locator('#progressView')).toBeHidden({ timeout: 90_000 });
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#scoreLabel')).toHaveText('Automatska tehnička ocjena');
});
