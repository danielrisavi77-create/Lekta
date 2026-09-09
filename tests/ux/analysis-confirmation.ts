import { expect, type Page } from '@playwright/test';

/** Potvrda moze doci tek nakon dohvata pravila; spremljen profil moze odmah dati rezultat. */
export async function confirmAnalysisWhenReady(page: Page): Promise<void> {
  const confirmation = page.locator('[data-confirm-profile]');
  const result = page.locator('#resultView');
  await expect.poll(async () => await confirmation.isVisible() || await result.isVisible(), {
    timeout: 120_000,
    message: 'analiza mora prikazati potvrdu profila ili rezultat',
  }).toBe(true);
  if (await confirmation.isVisible()) await confirmation.click();
}
