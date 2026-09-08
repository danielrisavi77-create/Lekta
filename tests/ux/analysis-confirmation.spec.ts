import { expect, test } from '@playwright/test';
import path from 'node:path';
import { confirmAnalysisWhenReady } from './analysis-confirmation';

test('potvrda profila ceka zavrsetak odgodenog dohvata pravila', async ({ page }) => {
  let releaseRules!: () => void;
  const rulesGate = new Promise<void>((resolve) => { releaseRules = resolve; });
  let heldRequests = 0;
  await page.route('**/verified-profiles-heavy.json*', async (route) => {
    heldRequests++;
    await rulesGate;
    await route.continue();
  });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rad/', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles(path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx'));
    await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '2');
    await page.locator('#analyzeBtn').click();
    await expect.poll(() => heldRequests).toBeGreaterThan(0);
    expect(await page.locator('[data-confirm-profile]').isVisible()).toBe(false);
    // Pokreni cekanje dok potvrda jos ne postoji, zatim dovrsi stvarni lokalni dohvat.
    const confirmation = confirmAnalysisWhenReady(page);
    releaseRules();
    await confirmation;
    await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  } finally {
    releaseRules();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
