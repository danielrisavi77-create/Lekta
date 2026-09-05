import { expect, test } from '@playwright/test';
import path from 'node:path';
import { expectInsideFold } from './fold';

const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

/**
 * DESKTOP TOK, ODVOJEN OD MOBILNOG (audit P0-05, P1-18).
 *
 * Odvojen je u vlastitu datoteku jer se ta dva toka STVARNO razlikuju, a ne samo izgledaju
 * drukcije: na desktopu upload odmah skace na korak 2, na mobitelu ostaje na koraku 1 dok korisnik
 * ne pritisne "Nastavi na profil". Dok je ovaj test zivio u `roadmap-v2.spec.ts`, mobilni projekti
 * su ga vrtjeli i uredno padali na `data-step` "1" umjesto "2" (mobile-webkit, iPhone 13), sto je
 * bila greska u rasporedu projekata, a ne kvar proizvoda.
 *
 * Izuzece je zato STRUKTURNO (po datoteci i projektu), ne `test.skip()` u tijelu: runtime skip je
 * audit P1-17 prijavio kao nacin da suite bude zelena a da nista ne vrti.
 */
test('desktop zadržava brz prijelaz, rezultat i puni faksimil alatni red', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/rad/');
  await page.locator('#uploadCtaBtn').click();
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '2');
  await page.locator('#stepToAnalyze').click();
  await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '3');
  await page.locator('#analyzeBtn').click();
  const confirm = page.locator('[data-confirm-profile]');
  if (await confirm.isVisible()) await confirm.click();
  await expect(page.locator('#progressView')).toBeHidden({ timeout: 90_000 });
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  // NALAZI ZIVE U COCKPITU, NE VISE U `#triagePanel`. Redizajn "Results Cockpit" seli SVE
  // sto stoji iza `#resultCockpit` u sklopljeni blok "Napredna provjera"
  // (`ensureResultsCockpitAdvancedShell`), pa je stari `#triagePanel` ondje zavrsio s visinom 0.
  // Izmjereno na cistom masteru: panel postoji i ima 3 kartice, ali mu je predak `display:none`,
  // dok cockpit prikazuje iste nalaze kao `article.cockpit-finding` (7 elemenata s nalazom,
  // svi s ne-nultom kutijom). Dakle korisnik nista ne gubi; tvrdnja je gadjala nadidjen element.
  await expect(page.locator('#resultCockpit article.cockpit-finding').first()).toBeVisible();
  await expect(await page.locator('#resultCockpit article.cockpit-finding').count()).toBeGreaterThan(0);
  await expect(page.locator('#scoreLabel')).toHaveText('Automatska tehnička ocjena');
  await expect(page.locator('#resultReadiness')).toContainText('Nije spremno za predaju');
  await expect(page.locator('#resultReadiness')).toContainText('Tehnička ocjena ne potvrđuje spremnost za predaju');

  await expect(page.locator('#resultReadiness')).toContainText('u dokumentu');
  await expect(page.locator('#resultGuide')).toContainText('Što prvo napraviti');
  await expect(page.locator('#tabbtn-action')).toBeHidden();

  // OD OVDJE SE MJERI "NAPREDNA PROVJERA", KOJA JE SKLOPLJENA. Redizajn cockpita seli SVE sto
  // stoji iza `#resultCockpit` u taj blok, pa `#resultTrust`, `#repairEntry`, `#orderFromResult`
  // i kartice s nalazima ondje imaju visinu 0 dok se ne otvori. Test zato radi ono sto radi i
  // korisnik: pritisne "Pregledaj nalaze". Bez toga tvrdnje ispod ne padaju zbog sadrzaja nego
  // zbog sklopljenog pretka, sto je krivi razlog i krivi nalaz.
  await page.locator('#resultCockpit [data-cockpit-action="open-findings"]').click();
  await expect(page.locator('#resultTrust')).toBeVisible();

  await expect(page.locator('#resultTrust')).toContainText('Pravila i granice ove provjere');
  await page.locator('#resultTrust').locator('summary').click();
  await expect(page.locator('#resultTrust')).toContainText('Ocjena uključuje');
  await expect(page.locator('#resultTrust')).toContainText('Ne potvrđuje');
  await expect(page.locator('.dl-menu-btn')).toContainText('Preuzmi izvještaj');
  await expect(page.locator('#newAnalysis')).toContainText('Ponovno analiziraj');

  // Ovaj dokument nema PAGE polje, pa nalaz o brojevima stranica MORA biti u panelu. Koji je od
  // vise nalaza iste tezine prvi NIJE tvrdnja proizvoda: priorityRank izjednacuje sve 'error'
  // nalaze, a remi lomi puki redoslijed emitiranja iz analize. Vezanje na .first() zato je lomilo
  // gate cim bi analiza legitimno dodala jos jedan kriticni nalaz (ovdje: dokument nema ni sadrzaj).
  await expect(page.locator('#resultCockpit')).toContainText('Nisu pronađeni automatski brojevi stranica');
  const firstFinding = page.locator('#resultCockpit article.cockpit-finding').first();
  const findingId = await firstFinding.getAttribute('data-finding-id');
  expect(findingId, 'kartica nalaza mora nositi stabilan data-finding-id').toBeTruthy();
  const card = page.locator(`#resultCockpit article.cockpit-finding[data-finding-id="${findingId}"]`);
  await card.getByRole('button', { name: 'Označi kao provjereno' }).click();
  // POSTENJE RUCNE POTVRDE. Stara kartica je taj tekst nosila TRAJNO; cockpit ga isporucuje kao
  // prolazan toast (`handleResultsCockpitAction`). Tvrdnja se zato seli na toast, ne ispusta:
  // korisnik koji nalaz oznaci provjerenim mora vidjeti da mu se automatska ocjena NIJE promijenila.
  await expect(page.locator('.toast')).toContainText('Automatska ocjena se nije promijenila');
  // Stanje se u cockpitu cita iz same radnje, a ne iz natpisa "Otvoreno": nakon potvrde nudi se
  // ponistavanje, nakon ponistavanja opet potvrda.
  await expect(card.getByRole('button', { name: 'Poništi ručnu potvrdu' })).toBeVisible();
  await card.getByRole('button', { name: 'Poništi ručnu potvrdu' }).click();
  await expect(card.getByRole('button', { name: 'Označi kao provjereno' })).toBeVisible();
  await expect(page.locator('#resultCockpit')).not.toContainText('Kontekst profila');
  // repairEndpoint je LIVE po defaultu (DEFAULT_PRODUCTION_CONFIG u app.ts), pa je copy server-side
  // varijanta (RE-34: gejtano na repairServerConfigured()), ne stari lokalni-only tekst.
  await expect(page.locator('#repairEntry')).toContainText('Automatski popravak');
  await expect(page.locator('#repairEntry')).toContainText('Dokument se pritom šalje na server radi popravka');
  await expect(page.locator('#orderFromResult')).toContainText('Ručna obrada uz privolu');

  // `#resultDetailsToggle` se OVDJE VISE NE PRITISCE. "Pregledaj nalaze" iznad vec poziva
  // `revealResultDetails()`, pa je detaljni dio otvoren; stari klik ga je od tada ZATVARAO.
  // Izmjereno: nakon open-findings `#resultCockpitAdvancedContent` ima 4739 px i `#tabbtn-issues`
  // 45 px, a nakon tog klika 1899 px odnosno 0 px. Tvrdnja je zato bila lazno crvena.
  await expect(page.locator('#tabbtn-issues')).toBeVisible();
  await page.locator('#tabbtn-issues').click();
  await expect(page.locator('#issueFilters')).toContainText('Problemi dokumenta');
  await expect(page.locator('#issueFilters')).toContainText('Ograničenja analize');
  await expect(page.locator('#issueCountLabel')).toContainText('problema dokumenta');
  await page.locator('#issueFilters').getByRole('button', { name: 'Ograničenja analize' }).click();
  await expect(page.locator('#issuesList')).toContainText('Profil ograničeno terenski testiran');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#resultSubtitle')).toBeHidden();
  await expect(page.locator('.metrics .metric').nth(1)).toBeHidden();
  await page.locator('#guideOpenPreview').scrollIntoViewIfNeeded();
  await expectInsideFold(page, '#guideOpenPreview', 844);
  await expect(page.locator('#resultTitle')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });

  const preview = page.locator('#guideOpenPreview');
  await expect(preview).toBeVisible();
  await preview.click();
  await page.locator('#previewModeFaksimil').click();
  const controls = page.locator('#previewZoomBar');
  await expect(controls).toBeVisible();
  await expect(controls).toContainText('Prilagodi širini');
  await expect(controls).toContainText('Cijela stranica');
  await expect(page.locator('.preview-modes')).toBeVisible();
  await expect(page.locator('#previewModeCitljivo')).toBeVisible();
  const zoomBefore = await controls.locator('.lekta-fac-zoomval').textContent();
  await controls.getByRole('button', { name: 'Povećaj' }).click();
  await expect(controls.locator('.lekta-fac-zoomval')).not.toHaveText(zoomBefore ?? '');
  await page.locator('#previewModeCitljivo').click();
  await expect(page.locator('#previewZoomBar')).toHaveCount(0);
  await expect(page.locator('#previewModeCitljivo')).toHaveAttribute('aria-selected', 'true');
});
