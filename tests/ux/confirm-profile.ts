import { expect, type Page } from '@playwright/test';

/** Jedina primarna radnja potvrduje prikazani profil i pokrece analizu. */
export async function potvrdiProfil(page: Page, timeout = 30_000): Promise<void> {
  const potvrda = page.locator('#analyzeBtn');
  await expect(potvrda).toBeVisible({ timeout });
  await expect(potvrda).toBeEnabled({ timeout });
  await potvrda.click();
}
