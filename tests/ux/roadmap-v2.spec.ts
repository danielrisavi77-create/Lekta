import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function expectInsideFold(page: Page, selector: string, viewportHeight: number) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} mora biti vidljiv`).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`mobilni upload stane u prvi ekran ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expectInsideFold(page, '.lek-head-copy h1', viewport.height);
    await expectInsideFold(page, '.lek-top-lead', viewport.height);
    await expectInsideFold(page, '#dropzone', viewport.height);
    await expectInsideFold(page, '#browseBtn', viewport.height);

    await page.locator('#fileInput').setInputFiles(fixture);
    await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '1');
    const sticky = page.locator('.lek-stepnav-1');
    await expect(sticky).toBeVisible();
    await expect(sticky.locator('#stepToProfile')).toContainText('Nastavi na profil');
    await expectInsideFold(page, '#stepToProfile', viewport.height);
    await sticky.locator('#stepToProfile').click();
    await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '2');
  });
}

test('desktop zadržava brz prijelaz, rezultat i puni faksimil alatni red', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
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
  await expect(page.locator('#triagePanel .finding-card').first()).toBeVisible();
  await expect(page.locator('#triagePanel .finding-card')).toHaveCount(Math.min(3, await page.locator('#triagePanel .finding-card').count()));
  await expect(page.locator('#scoreLabel')).toHaveText('Automatska tehnička ocjena');
  await expect(page.locator('#resultReadiness')).toContainText('Nije spremno za predaju');
  await expect(page.locator('#resultReadiness')).toContainText('Tehnička ocjena ne potvrđuje spremnost za predaju');

  await expect(page.locator('#resultReadiness')).toContainText('u dokumentu');
  await expect(page.locator('#resultGuide')).toContainText('Što prvo napraviti');
  await expect(page.locator('#tabbtn-action')).toBeHidden();
  await expect(page.locator('#resultTrust')).toContainText('Pravila i granice ove provjere');
  await page.locator('#resultTrust').locator('summary').click();
  await expect(page.locator('#resultTrust')).toContainText('Ocjena uključuje');
  await expect(page.locator('#resultTrust')).toContainText('Ne potvrđuje');
  await expect(page.locator('.dl-menu-btn')).toContainText('Preuzmi izvještaj');
  await expect(page.locator('#newAnalysis')).toContainText('Ponovno analiziraj');

  const firstFinding = page.locator('#triagePanel .finding-card').first();
  await firstFinding.getByRole('button', { name: 'Označi ručno provjereno' }).click();
  await expect(page.locator('#triagePanel .finding-card').first()).toContainText('Nisu pronađeni automatski brojevi stranica');
  await expect(page.locator('#triagePanel .finding-card').first()).toContainText('Ručna potvrda ne mijenja automatsku ocjenu');
  await firstFinding.getByRole('button', { name: 'Poništi ručnu potvrdu' }).click();
  await expect(page.locator('#triagePanel .finding-card').first()).toContainText('Otvoreno');
  await expect(page.locator('#triagePanel')).not.toContainText('Kontekst profila');
  // repairEndpoint je LIVE po defaultu (DEFAULT_PRODUCTION_CONFIG u app.ts), pa je copy server-side
  // varijanta (RE-34: gejtano na repairServerConfigured()), ne stari lokalni-only tekst.
  await expect(page.locator('#repairEntry')).toContainText('Automatski popravak');
  await expect(page.locator('#repairEntry')).toContainText('Dokument se pritom šalje na server radi popravka');
  await expect(page.locator('#orderFromResult')).toContainText('Ručna obrada uz privolu');

  await page.locator('#resultDetailsToggle').click();
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
